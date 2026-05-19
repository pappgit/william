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

/** Status for kartfarge og filtrering */
function getStatus(addr) {
  if (addr.lastMowed) return 'mowed';
  if (addr.flyerDelivered) return 'flyer';
  return 'none';
}

function formatDate(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
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
  return { ...rest, lat, lng };
}

function parseCoord(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function hasCoords(a) {
  return a.lat != null && a.lng != null;
}
