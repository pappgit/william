/* William Gressklipp – enkel klient uten backend */

const DEFAULT_CENTER = [59.95, 10.75];
const DEFAULT_ZOOM = 14;

const COLORS = {
  mowed: '#2d6a4f',
  flyer: '#e9c46a',
  none: '#adb5bd',
};

let addresses = [];
let map = null;
let markersLayer = null;
let selectedDetailId = null;
let pickMode = false;
let repairingCoords = false;

const $ = (sel) => document.querySelector(sel);

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

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    $(`#view-${view}`).classList.add('active');
    if (view === 'map') {
      setTimeout(async () => {
        initMap();
        map?.invalidateSize();
        await repairMissingCoords();
        refreshMap();
      }, 100);
    }
    if (view === 'add' && !$('#edit-id').value) resetForm();
  });
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

  if (status !== 'all') {
    list = list.filter((a) => getStatus(a) === status);
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
    tr.innerHTML = `
      <td class="addr">${escapeHtml(a.address)}</td>
      <td>${formatDate(a.lastMowed)}</td>
      <td>${formatSize(a.size)}</td>
      <td>${a.price != null && a.price !== '' ? a.price + ' kr' : '–'}</td>
      <td><span class="badge ${a.flyerDelivered ? 'yes' : 'no'}">${a.flyerDelivered ? formatDate(a.flyerDate) : 'Nei'}</span></td>
      <td class="note-cell">${a.notes ? escapeHtml(a.notes) : '–'}</td>
    `;
    tr.addEventListener('click', () => showDetail(a.id));
    tbody.appendChild(tr);
  }
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
        <dt>Størrelse</dt><dd>${formatSize(a.size)}</dd>
        <dt>Pris</dt><dd>${priceText}</dd>
        <dt>Sist klippet</dt><dd>${formatDate(a.lastMowed)}</dd>
        <dt>Flyer</dt><dd>${flyerText}</dd>
        ${a.notes ? `<dt>Notat</dt><dd>${escapeHtml(a.notes)}</dd>` : ''}
      </dl>
    </div>
  `;
}

function showDetail(id) {
  const a = addresses.find((x) => x.id === id);
  if (!a) return;
  selectedDetailId = id;
  $('#detail-content').innerHTML = `
    <h2>${escapeHtml(a.address)}</h2>
    <dl>
      <dt>Sist klippet</dt><dd>${formatDate(a.lastMowed)}</dd>
      <dt>Størrelse</dt><dd>${formatSize(a.size)}</dd>
      <dt>Pris</dt><dd>${a.price != null && a.price !== '' ? a.price + ' kr' : '–'}</dd>
      <dt>Flyer</dt><dd>${a.flyerDelivered ? 'Ja, ' + formatDate(a.flyerDate) : 'Nei'}</dd>
      ${a.notes ? `<dt>Notat</dt><dd>${escapeHtml(a.notes)}</dd>` : ''}
      ${!hasCoords(a) ? '<dt>Kart</dt><dd>Mangler posisjon</dd>' : ''}
    </dl>
  `;
  $('#detail-dialog').showModal();
}

$('#detail-edit').addEventListener('click', () => {
  $('#detail-dialog').close();
  if (selectedDetailId) openEdit(selectedDetailId);
});

// —— Kart ——

function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);

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
    document.querySelector('[data-view="add"]').click();
    L.marker(e.latlng).addTo(map);
  });
}

function markerIcon(status) {
  return L.divIcon({
    className: '',
    html: `<span style="background:${COLORS[status]};width:14px;height:14px;border-radius:50%;display:block;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
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
      $('#view-map').insertBefore(banner, $('#map'));
    }
    banner.textContent = `${missing} adresse(r) mangler posisjon – rediger og trykk «Finn på kart»`;
    banner.classList.remove('hidden');
  } else if (banner) {
    banner.classList.add('hidden');
  }

  for (const a of addresses) {
    if (!hasCoords(a)) continue;
    const status = getStatus(a);
    const m = L.marker([a.lat, a.lng], { icon: markerIcon(status) });
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
    $('#flyer-date').value = new Date().toISOString().slice(0, 10);
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

$('#btn-geocode').addEventListener('click', async () => {
  const q = $('#address').value.trim();
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
      document.querySelector('[data-view="map"]').click();
      pickMode = true;
      return;
    }
    setCoords(coords.lat, coords.lng);
    toast('Posisjon funnet');
    document.querySelector('[data-view="map"]').click();
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
  }
});

$('#address-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const addressText = $('#address').value.trim();
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
  const entry = normalizeAddress({
    id,
    address: addressText,
    size: $('#size').value,
    price: $('#price').value === '' ? null : Number($('#price').value),
    lastMowed: $('#last-mowed').value || null,
    flyerDelivered: $('#flyer-delivered').checked,
    flyerDate: $('#flyer-delivered').checked ? $('#flyer-date').value || null : null,
    notes: $('#notes').value.trim() || null,
    lat,
    lng,
  });

  const idx = addresses.findIndex((a) => a.id === id);
  if (idx >= 0) addresses[idx] = entry;
  else addresses.push(entry);

  saveAddresses(addresses);
  toast(hasCoords(entry) ? 'Lagret' : 'Lagret uten kartposisjon');
  resetForm();
  renderList();
  initMap();
  refreshMap();
  document.querySelector('[data-view="list"]').click();
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
}

function openEdit(id) {
  const a = addresses.find((x) => x.id === id);
  if (!a) return;
  document.querySelector('[data-view="add"]').click();
  $('#edit-id').value = a.id;
  $('#address').value = a.address;
  $('#size').value = a.size || 'medium';
  $('#price').value = a.price ?? '';
  $('#last-mowed').value = a.lastMowed || '';
  $('#flyer-delivered').checked = !!a.flyerDelivered;
  $('#flyer-date').value = a.flyerDate || '';
  $('#flyer-date-wrap').classList.toggle('hidden', !a.flyerDelivered);
  $('#notes').value = a.notes || '';
  $('#lat').value = a.lat ?? '';
  $('#lng').value = a.lng ?? '';
  $('#btn-cancel').classList.remove('hidden');
  $('#btn-delete').classList.remove('hidden');
}

$('#btn-cancel').addEventListener('click', () => {
  resetForm();
  document.querySelector('[data-view="list"]').click();
});

$('#btn-delete').addEventListener('click', () => {
  const id = $('#edit-id').value;
  if (!id || !confirm('Slette denne adressen?')) return;
  addresses = addresses.filter((a) => a.id !== id);
  saveAddresses(addresses);
  resetForm();
  renderList();
  refreshMap();
  document.querySelector('[data-view="list"]').click();
  toast('Slettet');
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

  await initSync((list) => {
    applyAddresses(list);
  });
}

bootstrap();
