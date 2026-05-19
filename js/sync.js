/**
 * Sanntidssynk via Supabase (PostgreSQL + Realtime).
 * Krever supabase-config.js og tabell fra supabase/schema.sql
 */

const Sync = {
  enabled: false,
  client: null,
  channel: null,
  onChange: null,
  lastJson: '',
  suppressMs: 0,
};

function isSyncConfigured() {
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  return !!(url && key && key !== 'DIN_ANON_KEY' && !url.includes('DITT-PROSJEKT'));
}

function getRoomId() {
  return (window.SYNC_ROOM_ID || 'william-gressklipp').trim();
}

function rowsToList(addresses) {
  if (!addresses) return [];
  if (Array.isArray(addresses)) return addresses.filter(Boolean);
  return [];
}

function updateSyncStatus(mode) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.className = 'sync-status ' + mode;
  const labels = {
    live: 'Sanntid – synket med Supabase',
    local: 'Kun denne enheten (Supabase ikke satt opp)',
    loading: 'Kobler til sky…',
    error: 'Synk feilet – sjekk Supabase-oppsett',
  };
  el.title = labels[mode] || mode;
}

function applyRemoteList(list) {
  const normalized = rowsToList(list).map(normalizeAddress);
  const json = JSON.stringify(normalized);
  if (json === Sync.lastJson) return;

  Sync.lastJson = json;
  saveAddressesLocal(normalized);
  if (typeof Sync.onChange === 'function') {
    Sync.onChange(normalized);
  }
}

async function fetchRemote() {
  const { data, error } = await Sync.client
    .from('gressklipp_data')
    .select('addresses')
    .eq('room_id', getRoomId())
    .maybeSingle();

  if (error) throw error;
  return rowsToList(data?.addresses);
}

async function pushAddresses(addresses) {
  if (!Sync.enabled || !Sync.client) return;

  const json = JSON.stringify(addresses);
  if (json === Sync.lastJson) return;

  Sync.lastJson = json;
  Sync.suppressMs = Date.now() + 1000;

  const { error } = await Sync.client.from('gressklipp_data').upsert(
    {
      room_id: getRoomId(),
      addresses,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'room_id' }
  );

  if (error) {
    console.error('Synk feilet ved lagring:', error);
    updateSyncStatus('error');
  }
}

function listenForChanges() {
  const roomId = getRoomId();

  Sync.channel = Sync.client
    .channel(`gressklipp:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'gressklipp_data',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        if (Date.now() < Sync.suppressMs) return;
        const row = payload.new;
        if (row?.addresses) {
          applyRemoteList(row.addresses);
          updateSyncStatus('live');
        }
      }
    )
    .subscribe();
}

async function initSync(onChange) {
  Sync.onChange = onChange;
  updateSyncStatus('loading');

  if (!isSyncConfigured()) {
    updateSyncStatus('local');
    return false;
  }

  if (typeof supabase === 'undefined' || !supabase.createClient) {
    updateSyncStatus('error');
    return false;
  }

  try {
    Sync.client = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    Sync.enabled = true;

    const remote = await fetchRemote();
    const local = loadAddressesLocal().map(normalizeAddress);

    if (remote.length === 0 && local.length > 0) {
      Sync.lastJson = JSON.stringify(local);
      Sync.suppressMs = Date.now() + 1000;
      await pushAddresses(local);
      onChange(local);
    } else if (remote.length > 0) {
      Sync.lastJson = JSON.stringify(remote.map(normalizeAddress));
      saveAddressesLocal(remote.map(normalizeAddress));
      onChange(remote.map(normalizeAddress));
    }

    listenForChanges();
    updateSyncStatus('live');
    return true;
  } catch (err) {
    console.error('Supabase:', err);
    updateSyncStatus('error');
    Sync.enabled = false;
    return false;
  }
}
