/* pinn. – Family dashboard: background of the profile selection (js/dashboardhintergrund.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the background style per family (LS_DASH_BG, DASH_BG_*, defaultDashBgStyle, cleanDashBgStyle, applyDashBackground), the image cache on the device (IndexedDB: dashBgDb, dashBgImageGet, dashBgImagePut, object URLs) and syncing with the server (applyCachedDashBackground, syncDashBackground). The admin settings for it are in js/dashboardkonto.js. */

/* ---------- Background of the profile selection (per family) ----------
   The style (default, colour, gradient or image) comes from the server together with the profiles. The image itself
   is only loaded when the state has changed and then stays on the device (IndexedDB) –
   so the background appears immediately and also offline. */
const LS_DASH_BG = 'pinn.dashBg';           // { familie, stand, stil, bild: true/false }
const DASH_BG_DB = 'pinn-dashboard';
const DASH_BG_STORE = 'hintergrund';
const DASH_BG_MAX_CHARS = 2500000;          // image data at most this long (the server allows a bit more)
const DASH_BG_GRADIENTS = [
  { id: 'morgen',   label: 'Morgenrot', dark: false, css: 'linear-gradient(160deg, #FDE7C8 0%, #F7C6C7 55%, #C9D7F2 100%)' },
  { id: 'sonne',    label: 'Sonne',     dark: false, css: 'linear-gradient(160deg, #FFF1B8 0%, #FFC98A 55%, #FF9E8A 100%)' },
  { id: 'lavendel', label: 'Lavendel',  dark: false, css: 'linear-gradient(160deg, #EFE8FA 0%, #CFC2EE 55%, #F4D6E7 100%)' },
  { id: 'minze',    label: 'Minze',     dark: false, css: 'linear-gradient(160deg, #E4F4EC 0%, #BFE3D2 55%, #D6ECF5 100%)' },
  { id: 'wald',     label: 'Wald',      dark: true,  css: 'linear-gradient(160deg, #22382F 0%, #3E6154 55%, #7E9C86 100%)' },
  { id: 'meer',     label: 'Meer',      dark: true,  css: 'linear-gradient(160deg, #173352 0%, #2A6689 55%, #5FB0C4 100%)' },
  { id: 'abend',    label: 'Abend',     dark: true,  css: 'linear-gradient(160deg, #2B2447 0%, #6A3F6E 55%, #D07A6B 100%)' },
  { id: 'nacht',    label: 'Nacht',     dark: true,  css: 'linear-gradient(160deg, #15161F 0%, #2C2F4A 55%, #4C426B 100%)' },
];
const DASH_BG_COLORS = ['#F6F3EC', '#FFE8CC', '#DCEBF7', '#E3F1E6', '#2F4B41', '#1E3A5F', '#5B3F66', '#8A4B2A', '#25231F'];

function defaultDashBgStyle() {
  return { art: 'standard', farbe: '#2F4B41', verlauf: 'morgen', abdunkeln: 25 };
}
function cleanDashBgStyle(stil) {
  const d = defaultDashBgStyle();
  const s = (stil && typeof stil === 'object') ? stil : {};
  const art = ['standard', 'farbe', 'verlauf', 'bild'].includes(s.art) ? s.art : d.art;
  const farbe = /^#[0-9a-fA-F]{6}$/.test(String(s.farbe || '')) ? String(s.farbe).toUpperCase() : d.farbe;
  const verlauf = DASH_BG_GRADIENTS.some(g => g.id === s.verlauf) ? s.verlauf : d.verlauf;
  let dim = Number(s.abdunkeln);
  if (!Number.isFinite(dim)) dim = d.abdunkeln;
  return { art, farbe, verlauf, abdunkeln: Math.max(0, Math.min(70, Math.round(dim))) };
}
function dashColorIsDark(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return false;
  const lin = (v) => { v = parseInt(v, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const l = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  return l < 0.33;
}
// put the background on a layer. holder gets "dash-on-dark" if light text is needed.
function applyDashBackground(layer, holder, stil, imageUrl) {
  if (!layer) return;
  const s = cleanDashBgStyle(stil);
  let on = false;
  let dark = false;
  layer.style.background = '';
  layer.style.backgroundImage = '';
  layer.style.setProperty('--dash-dim', '0');
  if (s.art === 'farbe') {
    layer.style.background = s.farbe;
    on = true;
    dark = dashColorIsDark(s.farbe);
  } else if (s.art === 'verlauf') {
    const g = DASH_BG_GRADIENTS.find(x => x.id === s.verlauf) || DASH_BG_GRADIENTS[0];
    layer.style.background = g.css;
    on = true;
    dark = g.dark;
  } else if (s.art === 'bild' && imageUrl) {
    layer.style.backgroundImage = `url("${String(imageUrl).replace(/"/g, '%22')}")`;
    layer.style.setProperty('--dash-dim', String(s.abdunkeln / 100));
    on = true;
    dark = true;
  }
  layer.classList.toggle('on', on);
  if (holder) holder.classList.toggle('dash-on-dark', on && dark);
}

function readDashBgMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(LS_DASH_BG) || 'null');
    return (m && typeof m === 'object') ? m : null;
  } catch (e) { return null; }
}
function writeDashBgMeta(meta) {
  try {
    if (meta) localStorage.setItem(LS_DASH_BG, JSON.stringify(meta));
    else localStorage.removeItem(LS_DASH_BG);
  } catch (e) { /* ignore */ }
}
// image data on the device (IndexedDB, also works without HTTPS)
function dashBgDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('Kein IndexedDB')); return; }
    const req = indexedDB.open(DASH_BG_DB, 1);
    req.onupgradeneeded = () => {
      try { req.result.createObjectStore(DASH_BG_STORE); } catch (e) { /* already there */ }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB nicht verfügbar'));
  });
}
async function dashBgImageGet() {
  try {
    const db = await dashBgDb();
    return await new Promise(resolve => {
      const tx = db.transaction(DASH_BG_STORE, 'readonly');
      const req = tx.objectStore(DASH_BG_STORE).get('bild');
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : '');
      req.onerror = () => resolve('');
      tx.oncomplete = () => db.close();
    });
  } catch (e) { return ''; }
}
async function dashBgImagePut(dataUrl) {
  try {
    const db = await dashBgDb();
    return await new Promise(resolve => {
      const tx = db.transaction(DASH_BG_STORE, 'readwrite');
      const store = tx.objectStore(DASH_BG_STORE);
      if (dataUrl) store.put(dataUrl, 'bild'); else store.delete('bild');
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
      tx.onabort = () => { db.close(); resolve(false); };
    });
  } catch (e) { return false; }
}
// image data -> object URL (faster than a long data: address in the style)
let dashBgObjectUrl = null;
function dashBgToObjectUrl(dataUrl) {
  if (dashBgObjectUrl) { try { URL.revokeObjectURL(dashBgObjectUrl); } catch (e) { /* ignore */ } dashBgObjectUrl = null; }
  if (!dataUrl) return '';
  try {
    const comma = dataUrl.indexOf(',');
    const mime = (/^data:([^;]+);/.exec(dataUrl) || [])[1] || 'image/jpeg';
    const bin = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    dashBgObjectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
    return dashBgObjectUrl;
  } catch (e) {
    return dataUrl;
  }
}
// Show the stored background right away (also offline). Only for the family of this dashboard.
async function applyCachedDashBackground(dash) {
  const layer = document.getElementById('dashBg');
  const screen = document.getElementById('dashboardScreen');
  const meta = readDashBgMeta();
  if (!meta || meta.familie !== dash.familie) { applyDashBackground(layer, screen, null, ''); return; }
  const stil = cleanDashBgStyle(meta.stil);
  if (stil.art === 'bild') {
    const data = await dashBgImageGet();
    applyDashBackground(layer, screen, data ? stil : defaultDashBgStyle(), data ? dashBgToObjectUrl(data) : '');
    return;
  }
  applyDashBackground(layer, screen, stil, '');
}
// Sync the state with the server; the image is only reloaded when it changed.
async function syncDashBackground(dash, hintergrund) {
  if (!hintergrund || typeof hintergrund !== 'object') return;
  const layer = document.getElementById('dashBg');
  const screen = document.getElementById('dashboardScreen');
  const stil = cleanDashBgStyle(hintergrund.stil);
  const stand = String(hintergrund.stand || '');
  const meta = readDashBgMeta();
  const same = meta && meta.familie === dash.familie && String(meta.stand || '') === stand;
  if (stil.art !== 'bild') {
    if (!same) {
      writeDashBgMeta({ familie: dash.familie, stand, stil, bild: false });
      await dashBgImagePut('');
    }
    applyDashBackground(layer, screen, stil, '');
    return;
  }
  let data = same ? await dashBgImageGet() : '';
  if (!data) {
    try {
      const res = await fetch('/api/pinn/dashboard/hintergrund-bild', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: dash.key }), cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body.bild === 'string' && body.bild) {
        data = body.bild;
        await dashBgImagePut(data);
        writeDashBgMeta({ familie: dash.familie, stand: String(body.stand || stand), stil: cleanDashBgStyle(body.stil || stil), bild: true });
      }
    } catch (e) { /* offline: keep the current background */ }
  }
  if (data) applyDashBackground(layer, screen, stil, dashBgToObjectUrl(data));
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('dashboardhintergrund');
