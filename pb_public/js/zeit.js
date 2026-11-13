/* pinn. – Time zone of the profile (js/zeit.js, since 1.150.0)
   Part of the pinn. web app (pb_public/index.html). Classic script, no build step: all top-level names share
   one global scope with the other files in js/ (prefix zeit…).

   The server has no time zone database. So every personal device tells it, quietly and without any setting,
   in which time zone the device is (e.g. Europe/Berlin or America/New_York) and when summer and winter time
   change there (sysDeviceZone / sysZoneTable from js/sicherungen.js). The server then uses this clock for all
   reminders of that profile (pb_hooks/pinn-zeit.js). Sent when the zone changes (e.g. after a move or a trip)
   and renewed about once a month (the table covers the next three years). Not sent from the family dashboard
   or by guests. */
const ZEIT_KEY = 'pinn.zeitSync';
const ZEIT_RENEW_MS = 30 * 86400000;
let zeitSyncing = false;

async function zeitSync() {
  if (zeitSyncing) return;
  const zone = sysDeviceZone();
  if (!zone) return;
  const uid = (currentUser() && currentUser().id) || '';
  let last = null;
  try { last = JSON.parse(localStorage.getItem(ZEIT_KEY) || 'null'); } catch (e) { last = null; }
  // Nothing to do while the zone is the same and the last sync is recent
  if (last && last.zone === zone && last.uid === uid && Date.now() - (last.at || 0) < ZEIT_RENEW_MS) return;
  const table = sysZoneTable(zone);
  if (!table) return;
  zeitSyncing = true;
  try {
    const res = await apiFetch('/api/pinn/zeit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(table),
    });
    if (res.ok) {
      try { localStorage.setItem(ZEIT_KEY, JSON.stringify({ zone, uid, at: Date.now() })); } catch (e) { /* storage not available */ }
    }
  } catch (e) { /* tried again at the next start */ }
  finally { zeitSyncing = false; }
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('zeit');
