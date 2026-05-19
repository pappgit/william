/* William Gressklipp – enkel klient uten backend */

const DEFAULT_CENTER = [59.95, 10.75];
const DEFAULT_ZOOM = 14;

const MAP_MARKER_SIZE = 24;
const MAP_COLORS = {
  flyer: '#e9c46a',
  done: '#2d6a4f',
  notDone: '#c1121f',
};

function getMapMarkerColor(a) {
  if (isFlyerEntry(a)) return MAP_COLORS.flyer;
  return a.done ? MAP_COLORS.done : MAP_COLORS.notDone;
}

let addresses = [];
let map = null;
let markersLayer = null;
let selectedDetailId = null;
let detailConvertMode = false;
let pickMode = false;
let repairingCoords = false;
let initMapAttempts = 0;
let skipAddFormReset = false;

const $ = (sel) => document.querySelector(sel);

function updateChromeHeight() {
  const chrome = document.querySelector('.app-chrome');
  if (!chrome) return;
  const h = chrome.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--chrome-h', `${Math.ceil(h)}px`);
}

let chromeResizeTimer;
function scheduleChromeHeightUpdate() {
  clearTimeout(chromeResizeTimer);
  chromeResizeTimer = setTimeout(() => {
    updateChromeHeight();
    resizeMap();
  }, 50);
}

function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// —— Visninger ——

function switchToView(view) {
  closeDetailModal();
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $(`#view-${view}`).classList.add('active');
  if (view === 'map') activateMapView();
  if (view === 'add') {
    if (skipAddFormReset) {
      skipAddFormReset = false;
    } else {
      resetForm();
    }
  }
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchToView(tab.dataset.view));
});

['search', 'filter-status', 'filter-size', 'filter-flyer', 'filter-sort'].forEach((id) => {
  const el = document.getElementById(id);
  el?.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', renderList);
});

$('#filter-reset')?.addEventListener('click', () => {
  $('#search').value = '';
  $('#filter-status').value = 'all';
  $('#filter-size').value = 'all';
  $('#filter-flyer').value = 'all';
  $('#filter-sort').value = 'mowed-desc';
  renderList();
});

document.querySelectorAll('input[name="entry-type"]').forEach((r) => {
  r.addEventListener('change', updateFormForEntryType);
});

function bindTypeOptionClicks() {
  document.querySelectorAll('.type-option').forEach((label) => {
    label.addEventListener('click', (e) => {
      const radio = label.querySelector('input[type="radio"]');
      if (!radio || radio.disabled) return;
      if (e.target === radio) return;
      radio.checked = true;
      updateFormForEntryType();
    });
  });
}

function isFilterActive() {
  return (
    $('#search').value.trim() !== '' ||
    $('#filter-status').value !== 'all' ||
    $('#filter-size').value !== 'all' ||
    $('#filter-flyer').value !== 'all'
  );
}

function filterAndSortList() {
  const q = $('#search').value.trim().toLowerCase();
  const status = $('#filter-status').value;
  const size = $('#filter-size').value;
  const flyer = $('#filter-flyer').value;
  const sort = $('#filter-sort').value;

  let list = [...addresses];

  if (status === 'flyer') {
    list = list.filter((a) => isFlyerEntry(a));
  } else if (status === 'order') {
    list = list.filter((a) => isOrderEntry(a));
  } else if (status === 'mowed') {
    list = list.filter((a) => isOrderEntry(a) && a.lastMowed);
  } else if (status === 'none') {
    list = list.filter((a) => isOrderEntry(a) && !a.lastMowed);
  }
  if (size !== 'all') {
    list = list.filter((a) => (a.size || 'medium') === size);
  }
  if (flyer === 'yes') {
    list = list.filter((a) => a.flyerDelivered);
  } else if (flyer === 'no') {
    list = list.filter((a) => !a.flyerDelivered);
  }
  if (q) {
    list = list.filter(
      (a) =>
        a.address.toLowerCase().includes(q) ||
        (a.notes && a.notes.toLowerCase().includes(q))
    );
  }

  list.sort((a, b) => {
    switch (sort) {
      case 'mowed-asc':
        return (a.lastMowed || '').localeCompare(b.lastMowed || '');
      case 'address-asc':
        return a.address.localeCompare(b.address, 'no');
      case 'price-desc':
        return (b.price ?? -1) - (a.price ?? -1);
      case 'mowed-desc':
      default:
        return (b.lastMowed || '').localeCompare(a.lastMowed || '');
    }
  });

  return list;
}

// —— Liste ——

function renderList() {
  const list = filterAndSortList();
  const tbody = $('#list-body');
  tbody.innerHTML = '';

  $('#list-empty').classList.add('hidden');
  $('#list-no-match').classList.add('hidden');

  if (addresses.length === 0) {
    $('#list-empty').classList.remove('hidden');
    $('#filter-summary').classList.add('hidden');
    return;
  }

  if (list.length === 0) {
    $('#list-no-match').classList.remove('hidden');
    updateFilterSummary(0);
    return;
  }

  updateFilterSummary(list.length);

  for (const a of list) {
    const tr = document.createElement('tr');
    const flyer = isFlyerEntry(a);
    const convertBtn = flyer
      ? `<button type="button" class="btn-convert" data-id="${escapeHtml(a.id)}">→ Ordre</button>`
      : '';
    tr.innerHTML = `
      <td class="type-cell">
        <span class="badge type-${flyer ? 'flyer' : 'order'}">${entryTypeLabel(a)}</span>
        ${convertBtn}
      </td>
      <td class="addr">${escapeHtml(a.address)}</td>
      <td>${flyer ? '–' : formatDate(a.lastMowed)}</td>
      <td>${flyer ? '–' : formatSize(a.size)}</td>
      <td>${flyer ? '–' : a.price != null && a.price !== '' ? a.price + ' kr' : '–'}</td>
      <td>${flyer ? formatDate(a.flyerDate) : a.flyerDelivered ? formatDate(a.flyerDate) : 'Nei'}</td>
      <td class="note-cell">${flyer ? '–' : a.notes ? escapeHtml(a.notes) : '–'}</td>
      ${
        flyer
          ? '<td class="check-cell muted-cell" colspan="3">–</td>'
          : `${listCheckCell(a.id, 'done', a.done, 'Ferdig')}
      ${listCheckCell(a.id, 'invoiceSent', a.invoiceSent, 'Sendt faktura')}
      ${listCheckCell(a.id, 'paymentReceived', a.paymentReceived, 'Mottatt betaling')}`
      }
    `;
    tr.querySelector('.btn-convert')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showDetail(a.id, true);
    });
    tr.querySelectorAll('.list-check').forEach((cb) => {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleAddressFlag(a.id, cb.dataset.field, cb.checked);
      });
    });
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.check-cell')) return;
      showDetail(a.id);
    });
    tbody.appendChild(tr);
  }
}

function listCheckCell(id, field, checked, label) {
  return `<td class="check-cell">
    <input type="checkbox" class="list-check" data-id="${escapeHtml(id)}" data-field="${field}"
      ${checked ? 'checked' : ''} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
  </td>`;
}

function toggleAddressFlag(id, field, value) {
  const allowed = ['done', 'invoiceSent', 'paymentReceived'];
  if (!allowed.includes(field)) return;
  const idx = addresses.findIndex((x) => x.id === id);
  if (idx < 0) return;
  addresses[idx] = normalizeAddress({ ...addresses[idx], [field]: value });
  saveAddresses(addresses);
  renderList();
  if (field === 'done') refreshMap();
}

function updateAddressField(id, patch) {
  const idx = addresses.findIndex((x) => x.id === id);
  if (idx < 0) return;
  addresses[idx] = normalizeAddress({ ...addresses[idx], ...patch });
  saveAddresses(addresses);
  renderList();
  refreshMap();
}

function detailCheckRow(id, field, checked, label) {
  return `<label class="detail-check-label">
    <input type="checkbox" class="detail-check" data-id="${escapeHtml(id)}" data-field="${field}"
      ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}">
    <span>${escapeHtml(label)}</span>
  </label>`;
}

function initDetailDelegation() {
  const wrap = $('#detail-scroll-wrap');
  if (!wrap || wrap.dataset.bound) return;
  wrap.dataset.bound = '1';
  wrap.addEventListener('change', (e) => {
    const cb = e.target.closest('.detail-check');
    if (cb) {
      e.stopPropagation();
      toggleAddressFlag(cb.dataset.id, cb.dataset.field, cb.checked);
      return;
    }
    const dateInput = e.target.closest('.detail-date-input');
    if (dateInput && selectedDetailId) {
      updateAddressField(selectedDetailId, { lastMowed: toISODate(dateInput.value) });
    }
  });
}

function bindDateQuickButtons() {
  document.querySelectorAll('.btn-date-quick').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      if (btn.hasAttribute('data-clear')) input.value = '';
      else input.value = todayISO();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

function deleteAddress(id) {
  if (!id || !confirm('Slette denne adressen permanent?')) return false;
  addresses = addresses.filter((a) => a.id !== id);
  saveAddresses(addresses);
  renderList();
  refreshMap();
  toast('Slettet');
  return true;
}

function convertFlyerToOrder(id) {
  const idx = addresses.findIndex((x) => x.id === id);
  if (idx < 0 || !isFlyerEntry(addresses[idx])) return false;
  addresses[idx] = normalizeAddress({
    ...addresses[idx],
    entryType: 'order',
    flyerDelivered: true,
  });
  saveAddresses(addresses);
  renderList();
  refreshMap();
  toast('Flyer konvertert til ordre');
  return true;
}

function setDetailConvertMode(active) {
  $('#detail-convert-prompt').classList.toggle('hidden', !active);
  $('#detail-actions-normal').classList.toggle('hidden', active);
  $('#detail-actions-convert').classList.toggle('hidden', !active);
}

function openDetailModal() {
  updateChromeHeight();
  const overlay = $('#detail-overlay');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    updateChromeHeight();
    requestAnimationFrame(() => {
      const wrap = $('#detail-scroll-wrap');
      if (wrap) wrap.scrollTop = 0;
    });
  });
}

function closeDetailModal() {
  const overlay = $('#detail-overlay');
  if (overlay.classList.contains('hidden')) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function getFormEntryType() {
  return document.querySelector('input[name="entry-type"]:checked')?.value;
}

function updateFormForEntryType() {
  const t = getFormEntryType();
  $('#flyer-only-fields').classList.toggle('hidden', t !== 'flyer');
  $('#order-fields').classList.toggle('hidden', t !== 'order');
  $('#flyer-address').required = t === 'flyer';
  $('#flyer-sent-date').required = t === 'flyer';
  $('#address').required = t === 'order';
  if (t === 'flyer' && !$('#flyer-sent-date').value) {
    $('#flyer-sent-date').value = todayISO();
  }
  if (t) {
    const section = t === 'flyer' ? $('#flyer-only-fields') : $('#order-fields');
    setTimeout(() => {
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
}

function setFormEntryType(type) {
  const radio = document.querySelector(`input[name="entry-type"][value="${type}"]`);
  if (radio) radio.checked = true;
  updateFormForEntryType();
}

function lockEntryTypePicker(locked) {
  document.querySelectorAll('input[name="entry-type"]').forEach((r) => {
    r.disabled = locked;
  });
}

function updateFilterSummary(shown) {
  const el = $('#filter-summary');
  if (!isFilterActive()) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = `Viser ${shown} av ${addresses.length} adresser`;
  el.classList.remove('hidden');
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function popupContent(a) {
  const flyerText = a.flyerDelivered
    ? `Ja${a.flyerDate ? ' · ' + formatDate(a.flyerDate) : ''}`
    : 'Nei';
  const priceText = a.price != null && a.price !== '' ? `${a.price} kr` : '–';
  return `
    <div class="map-popup">
      <strong class="map-popup-title">${escapeHtml(a.address)}</strong>
      <dl class="map-popup-dl">
        <dt>Type</dt><dd>${entryTypeLabel(a)}</dd>
        <dt>Størrelse</dt><dd>${isFlyerEntry(a) ? '–' : formatSize(a.size)}</dd>
        <dt>Pris</dt><dd>${priceText}</dd>
        <dt>Sist klippet</dt><dd>${formatDate(a.lastMowed)}</dd>
        <dt>Flyer</dt><dd>${flyerText}</dd>
        ${a.notes ? `<dt>Notat</dt><dd>${escapeHtml(a.notes)}</dd>` : ''}
        <dt>Ferdig</dt><dd>${a.done ? 'Ja' : 'Nei'}</dd>
        <dt>Sendt faktura</dt><dd>${a.invoiceSent ? 'Ja' : 'Nei'}</dd>
        <dt>Mottatt betaling</dt><dd>${a.paymentReceived ? 'Ja' : 'Nei'}</dd>
      </dl>
    </div>
  `;
}

function showDetail(id, convertMode = false) {
  const a = addresses.find((x) => x.id === id);
  if (!a) return;
  selectedDetailId = id;
  detailConvertMode = convertMode;
  const flyer = isFlyerEntry(a);
  const isoMowed = toISODate(a.lastMowed) || '';
  $('#detail-content').innerHTML = `
    <h2>${escapeHtml(a.address)}</h2>
    <p><span class="badge type-${flyer ? 'flyer' : 'order'}">${entryTypeLabel(a)}</span></p>
    <dl>
      ${flyer ? `<dt>Sendt ut</dt><dd>${formatDate(a.flyerDate)}</dd>` : ''}
      ${!flyer ? `<dt>Størrelse</dt><dd>${formatSize(a.size)}</dd>` : ''}
      ${!flyer ? `<dt>Pris</dt><dd>${a.price != null && a.price !== '' ? a.price + ' kr' : '–'}</dd>` : ''}
      ${!flyer ? `<dt>Flyer tidligere</dt><dd>${a.flyerDelivered ? 'Ja, ' + formatDate(a.flyerDate) : 'Nei'}</dd>` : ''}
      ${a.notes && !flyer ? `<dt>Notat</dt><dd>${escapeHtml(a.notes)}</dd>` : ''}
      ${!hasCoords(a) ? '<dt>Kart</dt><dd>Mangler posisjon</dd>' : ''}
    </dl>
    ${
      !flyer
        ? `<label class="detail-date-field">Sist klippet
      <input type="date" class="detail-date-input" value="${isoMowed}">
    </label>
    <fieldset class="detail-checks">
      <legend>Økonomi / status</legend>
      ${detailCheckRow(a.id, 'done', a.done, 'Ferdig')}
      ${detailCheckRow(a.id, 'invoiceSent', a.invoiceSent, 'Sendt faktura')}
      ${detailCheckRow(a.id, 'paymentReceived', a.paymentReceived, 'Mottatt betaling')}
    </fieldset>`
        : ''
    }
  `;
  $('#detail-convert').classList.toggle('hidden', !flyer || convertMode);
  setDetailConvertMode(convertMode && flyer);
  if ($('#detail-overlay').classList.contains('hidden')) openDetailModal();
}

$('#detail-backdrop').addEventListener('click', closeDetailModal);

$('#detail-close').addEventListener('click', closeDetailModal);

$('#detail-delete').addEventListener('click', () => {
  if (!selectedDetailId) return;
  if (deleteAddress(selectedDetailId)) {
    closeDetailModal();
    selectedDetailId = null;
  }
});

$('#detail-convert').addEventListener('click', () => {
  if (selectedDetailId) showDetail(selectedDetailId, true);
});

$('#detail-convert-cancel').addEventListener('click', () => {
  if (selectedDetailId) showDetail(selectedDetailId, false);
});

$('#detail-convert-confirm').addEventListener('click', () => {
  if (!selectedDetailId) return;
  if (convertFlyerToOrder(selectedDetailId)) {
    closeDetailModal();
    openEdit(selectedDetailId);
  }
});

$('#detail-edit').addEventListener('click', () => {
  closeDetailModal();
  if (selectedDetailId) openEdit(selectedDetailId);
});

// —— Kart ——

function resizeMap() {
  if (!map || !$('#view-map')?.classList.contains('active')) return;
  map.invalidateSize({ animate: false });
}

function activateMapView() {
  requestAnimationFrame(() => {
    updateChromeHeight();
    requestAnimationFrame(() => {
      if (typeof L === 'undefined') {
        toast('Kart kunne ikke lastes – sjekk nettforbindelse');
        return;
      }
      initMap();
      resizeMap();
      setTimeout(async () => {
        resizeMap();
        await repairMissingCoords();
        refreshMap();
        resizeMap();
      }, 300);
    });
  });
}

function initMap() {
  if (typeof L === 'undefined') return;
  if (map) {
    resizeMap();
    return;
  }
  const mapEl = document.getElementById('map');
  if (!mapEl || mapEl.offsetHeight < 20) {
    if (initMapAttempts++ < 40) setTimeout(initMap, 80);
    return;
  }
  initMapAttempts = 0;
  map = L.map('map', { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);

  setTimeout(resizeMap, 0);
  setTimeout(resizeMap, 200);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], DEFAULT_ZOOM),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  map.on('click', (e) => {
    if (!pickMode) return;
    $('#lat').value = e.latlng.lat;
    $('#lng').value = e.latlng.lng;
    pickMode = false;
    toast('Posisjon satt – lagre adressen');
    skipAddFormReset = true;
    switchToView('add');
    L.marker(e.latlng).addTo(map);
  });
}

function markerIcon(a) {
  const color = getMapMarkerColor(a);
  const s = MAP_MARKER_SIZE;
  return L.divIcon({
    className: '',
    html: `<span style="background:${color};width:${s}px;height:${s}px;border-radius:50%;display:block;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)"></span>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
}

/** Fiks adresser lagret uten lng (eldre feil) */
async function repairMissingCoords() {
  const missing = addresses.filter((a) => !hasCoords(a));
  if (!missing.length || repairingCoords) return;
  repairingCoords = true;
  toast('Oppdaterer kart…');
  let changed = false;
  for (const a of missing) {
    try {
      const coords = await geocodeQuery(a.address);
      if (coords) {
        a.lat = coords.lat;
        a.lng = coords.lng;
        changed = true;
      }
    } catch {
      break;
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  if (changed) {
    addresses = addresses.map(normalizeAddress);
    saveAddresses(addresses);
    renderList();
  }
  repairingCoords = false;
}

function refreshMap() {
  if (!map || !markersLayer) return;
  markersLayer.clearLayers();
  const bounds = [];

  const missing = addresses.filter((a) => !hasCoords(a)).length;
  let banner = document.getElementById('map-missing-banner');
  if (missing > 0) {
    if (!banner) {
      banner = document.createElement('p');
      banner.id = 'map-missing-banner';
      banner.className = 'map-banner';
      const mapEl = $('#map');
      (mapEl?.parentElement || $('#view-map')).insertBefore(banner, mapEl);
    }
    banner.textContent = `${missing} adresse(r) mangler posisjon – rediger og trykk «Finn på kart»`;
    banner.classList.remove('hidden');
  } else if (banner) {
    banner.classList.add('hidden');
  }

  for (const a of addresses) {
    if (!hasCoords(a)) continue;
    const m = L.marker([a.lat, a.lng], { icon: markerIcon(a) });
    m.bindPopup(popupContent(a), {
      className: 'leaflet-popup-map',
      closeButton: true,
      maxWidth: 260,
    });
    if (window.matchMedia('(hover: hover)').matches) {
      m.on('mouseover', function () {
        this.openPopup();
      });
      m.on('mouseout', function () {
        this.closePopup();
      });
    } else {
      m.on('click', function () {
        this.openPopup();
      });
    }
    markersLayer.addLayer(m);
    bounds.push([a.lat, a.lng]);
  }

  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 16);
  }
}

// —— Skjema ——

$('#flyer-delivered').addEventListener('change', () => {
  $('#flyer-date-wrap').classList.toggle('hidden', !$('#flyer-delivered').checked);
  if ($('#flyer-delivered').checked && !$('#flyer-date').value) {
    $('#flyer-date').value = todayISO();
  }
});

async function geocodeQuery(addressText) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressText + ', Norge')}&limit=1`;
  const res = await fetch(url, {
    headers: {
      'Accept-Language': 'no',
      'User-Agent': 'WilliamGressklipp/1.0',
    },
  });
  if (!res.ok) throw new Error('Geokoding feilet');
  const data = await res.json();
  if (!data.length) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}

function setCoords(lat, lng) {
  $('#lat').value = lat;
  $('#lng').value = lng;
}

async function runGeocode(addressInputId) {
  const q = $(addressInputId).value.trim();
  if (!q) {
    toast('Skriv inn adresse først');
    return;
  }
  $('#btn-geocode').disabled = true;
  $('#btn-geocode').textContent = 'Søker…';
  try {
    const coords = await geocodeQuery(q);
    if (!coords) {
      toast('Fant ikke adressen – trykk i kartet');
      switchToView('map');
      pickMode = true;
      return;
    }
    setCoords(coords.lat, coords.lng);
    toast('Posisjon funnet');
    switchToView('map');
    setTimeout(() => {
      initMap();
      map?.invalidateSize();
      map?.setView([coords.lat, coords.lng], 17);
      refreshMap();
    }, 200);
  } catch {
    toast('Kunne ikke søke – prøv igjen eller trykk i kartet');
  } finally {
    $('#btn-geocode').disabled = false;
    $('#btn-geocode').textContent = 'Finn på kart';
    $('#btn-geocode-flyer').disabled = false;
    $('#btn-geocode-flyer').textContent = 'Finn på kart';
  }
}

$('#btn-geocode').addEventListener('click', () => runGeocode('#address'));
$('#btn-geocode-flyer').addEventListener('click', () => runGeocode('#flyer-address'));

$('#address-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const entryType = getFormEntryType();
  if (!entryType) {
    toast('Velg Flyer eller Ordre først');
    return;
  }

  const isFlyer = entryType === 'flyer';
  const addressText = isFlyer ? $('#flyer-address').value.trim() : $('#address').value.trim();
  if (!addressText) {
    toast('Skriv inn adresse');
    return;
  }
  if (isFlyer && !toISODate($('#flyer-sent-date').value)) {
    toast('Velg dato for når flyer ble sendt ut');
    return;
  }

  let lat = parseCoord($('#lat').value);
  let lng = parseCoord($('#lng').value);

  if (lat == null || lng == null) {
    toast('Finner posisjon…');
    try {
      const coords = await geocodeQuery(addressText);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
        setCoords(lat, lng);
      }
    } catch {
      /* fortsett uten coords */
    }
  }

  if (lat == null || lng == null) {
    const ok = confirm(
      'Fant ikke posisjon på kartet. Lagre uten kartmarkør?\n\nTrykk Avbryt og bruk «Finn på kart» eller trykk i kartet.'
    );
    if (!ok) return;
  }

  const id = $('#edit-id').value || createId();
  const existing = addresses.find((a) => a.id === id);
  let entry;

  if (isFlyer) {
    entry = normalizeAddress({
      id,
      entryType: 'flyer',
      address: addressText,
      flyerDate: toISODate($('#flyer-sent-date').value),
      flyerDelivered: true,
      lat,
      lng,
    });
  } else {
    entry = normalizeAddress({
      id,
      entryType: 'order',
      address: addressText,
      size: $('#size').value,
      price: $('#price').value === '' ? null : Number($('#price').value),
      lastMowed: toISODate($('#last-mowed').value),
      flyerDelivered: $('#flyer-delivered').checked,
      flyerDate: $('#flyer-delivered').checked ? toISODate($('#flyer-date').value) : null,
      notes: $('#notes').value.trim() || null,
      done: !!existing?.done,
      invoiceSent: !!existing?.invoiceSent,
      paymentReceived: !!existing?.paymentReceived,
      lat,
      lng,
    });
  }

  const idx = addresses.findIndex((a) => a.id === id);
  if (idx >= 0) addresses[idx] = entry;
  else addresses.push(entry);

  saveAddresses(addresses);
  toast(hasCoords(entry) ? 'Lagret' : 'Lagret uten kartposisjon');
  resetForm();
  renderList();
  initMap();
  refreshMap();
  switchToView('list');
});

function resetForm() {
  $('#address-form').reset();
  $('#edit-id').value = '';
  $('#size').value = 'medium';
  $('#flyer-date-wrap').classList.add('hidden');
  $('#btn-cancel').classList.add('hidden');
  $('#btn-delete').classList.add('hidden');
  $('#lat').value = '';
  $('#lng').value = '';
  pickMode = false;
  lockEntryTypePicker(false);
  document.querySelectorAll('input[name="entry-type"]').forEach((r) => {
    r.checked = false;
  });
  $('#flyer-only-fields').classList.add('hidden');
  $('#order-fields').classList.add('hidden');
}

function openEdit(id) {
  const a = addresses.find((x) => x.id === id);
  if (!a) return;
  skipAddFormReset = true;
  switchToView('add');
  $('#edit-id').value = a.id;
  const flyer = isFlyerEntry(a);
  setFormEntryType(flyer ? 'flyer' : 'order');
  lockEntryTypePicker(!flyer);

  if (flyer) {
    $('#flyer-address').value = a.address;
    $('#flyer-sent-date').value = toISODate(a.flyerDate) || '';
  } else {
    $('#address').value = a.address;
    $('#size').value = a.size || 'medium';
    $('#price').value = a.price ?? '';
    $('#last-mowed').value = toISODate(a.lastMowed) || '';
    $('#flyer-delivered').checked = !!a.flyerDelivered;
    $('#flyer-date').value = toISODate(a.flyerDate) || '';
    $('#flyer-date-wrap').classList.toggle('hidden', !a.flyerDelivered);
    $('#notes').value = a.notes || '';
  }

  $('#lat').value = a.lat ?? '';
  $('#lng').value = a.lng ?? '';
  $('#btn-cancel').classList.remove('hidden');
  $('#btn-delete').classList.remove('hidden');
}

$('#btn-cancel').addEventListener('click', () => {
  resetForm();
  switchToView('list');
});

$('#btn-delete').addEventListener('click', () => {
  const id = $('#edit-id').value;
  if (!id) return;
  if (deleteAddress(id)) {
    resetForm();
    switchToView('list');
  }
});

// —— Eksport / import (synk mellom telefoner via fil) ——

$('#btn-export').addEventListener('click', () => {
  exportData();
  toast('Fil lastet ned');
});

$('#btn-import').addEventListener('click', () => $('#import-file').click());

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('Dette erstatter alle adresser på denne telefonen. Fortsette?')) {
    e.target.value = '';
    return;
  }
  try {
    addresses = await importData(file);
    renderList();
    refreshMap();
    toast('Importert');
  } catch {
    toast('Kunne ikke lese filen');
  }
  e.target.value = '';
});

// —— Start ——

function applyAddresses(list) {
  addresses = list.map(normalizeAddress);
  renderList();
  if (map) refreshMap();
}

async function bootstrap() {
  addresses = loadAddresses().map(normalizeAddress);
  renderList();
  updateChromeHeight();
  bindDateQuickButtons();
  bindTypeOptionClicks();
  initDetailDelegation();

  window.addEventListener('resize', () => {
    scheduleChromeHeightUpdate();
    if ($('#view-map').classList.contains('active')) resizeMap();
  });
  window.addEventListener('orientationchange', () => {
    scheduleChromeHeightUpdate();
    setTimeout(() => {
      updateChromeHeight();
      resizeMap();
    }, 200);
  });

  await initSync((list) => {
    applyAddresses(list);
  });
}

bootstrap();
