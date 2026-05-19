const STORAGE_KEY = 'william-gressklipp';

function loadAddressesLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveAddressesLocal(addresses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
}

/** Les fra lokal cache (brukes ved oppstart før sky svarer) */
function loadAddresses() {
  return loadAddressesLocal();
}

/** Lagre lokalt og push til sky hvis synk er aktiv */
function saveAddresses(addresses) {
  saveAddressesLocal(addresses);
  if (typeof pushAddresses === 'function') {
    pushAddresses(addresses);
  }
}

function createId() {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function exportData() {
  const blob = new Blob([JSON.stringify(loadAddresses(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gressklipp-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error('Ugyldig fil');
        saveAddresses(data);
        resolve(data);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function isFlyerEntry(addr) {
  return addr.entryType === 'flyer';
}

function isOrderEntry(addr) {
  return !isFlyerEntry(addr);
}

function entryTypeLabel(addr) {
  return isFlyerEntry(addr) ? 'Flyer' : 'Ordre';
}

/** Status for listefiltrering (ordre) */
function getStatus(addr) {
  if (isFlyerEntry(addr)) return 'flyer';
  if (addr.lastMowed) return 'mowed';
  if (addr.flyerDelivered) return 'flyer';
  return 'none';
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Normaliser til YYYY-MM-DD eller null */
function toISODate(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function formatDate(iso) {
  if (!iso) return '–';
  const normalized = toISODate(iso);
  if (!normalized) return '–';
  const [y, m, d] = normalized.split('-');
  return `${d}.${m}.${y}`;
}

function formatSize(size) {
  const labels = { liten: 'Liten', medium: 'Medium', stor: 'Stor' };
  return labels[size] || size || '–';
}

/** Normaliser koordinater (fikser eldre lagring der lng manglet) */
function normalizeAddress(a) {
  const lat = parseCoord(a.lat);
  const lng = parseCoord(a.lng) ?? parseCoord(a.lon);
  const { lon, ...rest } = a;
  const entryType = a.entryType === 'flyer' ? 'flyer' : 'order';
  return {
    ...rest,
    lat,
    lng,
    entryType,
    done: entryType === 'flyer' ? false : !!a.done,
    invoiceSent: entryType === 'flyer' ? false : !!a.invoiceSent,
    paymentReceived: entryType === 'flyer' ? false : !!a.paymentReceived,
    flyerDelivered: entryType === 'flyer' ? true : !!a.flyerDelivered,
  };
}

function parseCoord(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function hasCoords(a) {
  return a.lat != null && a.lng != null;
}
