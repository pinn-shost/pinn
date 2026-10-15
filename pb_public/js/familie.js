/* pinn. – js/familie.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded right after the inline script and before js/hinweise.js and js/ausblick.js
   (ausblick.js stays last and starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.42.0, only the comments were translated):
   - Family: emergency passes & location – shared map, sharing the own location, places, devices (fam…)
   - Map – drawn by pinn. itself from OpenStreetMap tiles via the own server
   - SOS – call for help from "Traccar Client", popup, notice at the top, all-clear (sos…)
   - Family tabs and profile per person
   - School & daycare – timetable, homework, parent letters, closure days (sk…)
   - Pets – care, diary, roster, missing poster (pt…)
   - Weather view & holiday weather – 14-day view, packing lists with destination (wx…, trip…)
   - Wiring of the "Family" page (wireFamily)
   index.html only calls these functions later (when the user acts or from bootApp), never while
   it is still loading – that is why this file may come after the inline script. */

/* ==========================================================
   Family: emergency passes & location (menu "Family")
   ----------------------------------------------------------
   - At the top all family members (picture + name) as buttons. Tapping opens the emergency pass.
     Emergency passes are kept small in the family data (emergencyPasses: { <member ID>: {...} }) and
     can therefore be read and changed offline.
       { birth, blood, height, weight, allergies, conditions, meds: [{ name, dose }], vaccinations,
         organDonor, livingWill, insurance, insuranceNo, doctor, doctorPhone, contacts: [{ name,
         relation, phone }], notes, species, chip, vet, vetPhone, updated, updatedBy }
   - Location (server only, not for guest accounts): one shared map with everyone who shares
     their location. Live locations (newer than 15 min.) blink red. Filter (chips),
     follow (map follows the person) and trail of the last hours.
     Known places (home, school …) with push on arrival/departure, "I'm on my way" with
     automatic end when arriving home. The family's admins manage the devices.
     Server: pb_hooks/ortung.pb.js + pinn-ortung.js. Phones send directly to pinn. (pinn. itself or
     "Traccar Client" in the background); the Traccar container is only used for GPS trackers now.
   - pinn. draws the map itself (OpenStreetMap tiles via the own server) – no third-party
     program code is loaded.
   ========================================================== */
var FAM_POLL_MS = 15000;
var FAM_POLL_FOLLOW_MS = 8000;
var FAM_LIVE_MS = 15 * 60 * 1000;
var LS_FAM_STATUS = 'pinn.famOrtung';
var FAM_PLACE_EMOJIS = ['🏠', '🏫', '🏢', '🌳', '🐕', '🏥', '🛒', '⚽', '👵', '🏊', '🎵', '⛪', '🚉', '📍'];
var FAM_BLOOD = ['', '0+', '0−', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−'];
var famDetailId = null;
var famStatus = null;
var famStatusErr = '';
var famStatusLoading = false;
var famSkew = 0;               // Clock difference server - device
var famPollTimer = null;
var famHidden = new Set();     // devices hidden on the map
var famFollow = '';            // followed device
var famTrailHours = 0;
var famTrail = null;           // { geraet, punkte, at }
var famFollowFree = false;     // moved/zoomed by hand while following: trail stays, map does not jump back
var famSelected = '';          // tapped device (info line below the map)
var famAddress = {};           // device ID -> { lat, lon, name }
var famMap = null;
var famMapHost = null;
var famFitted = false;
var famModalState = null;
var famPickMap = null;

/* ---------- Helpers ---------- */
function famPasses() { return (emergencyPasses && typeof emergencyPasses === 'object') ? emergencyPasses : {}; }
function famPass(id) { const p = famPasses()[id]; return (p && typeof p === 'object') ? p : null; }
function famIsPet(m) { try { return lsIsPet(m); } catch (e) { return false; } }
function famCanEdit() { return !isCurrentUserGuest() && !childLockActive(); }
function famOrtungAllowed() { return !isCurrentUserGuest(); }
function famDevices() { return (famStatus && Array.isArray(famStatus.geraete)) ? famStatus.geraete : []; }
function famDevice(id) { return famDevices().find(g => g.id === id) || null; }
function famDeviceForMember(mid) {
  const list = famDevices().filter(g => g.memberId === mid);
  return list.filter(g => g.position).sort((a, b) => b.position.zeit - a.position.zeit)[0] || list[0] || null;
}
function famPlaces() { return (famStatus && Array.isArray(famStatus.orte)) ? famStatus.orte : []; }
function famPlace(id) { return id ? (famPlaces().find(o => o.id === id) || null) : null; }
function famHome() { return famPlaces().find(o => o.zuhause) || null; }
function famNow() { return Date.now() + famSkew; }
function famIsLive(g) { return !!(g && g.teilen && g.position && famNow() - g.position.zeit < FAM_LIVE_MS); }
function famUnterwegs(g) { return !!(g && famStatus && famStatus.unterwegs && famStatus.unterwegs[g.id]); }
function famMyMemberId() { const m = currentMember(); return m ? m.id : ''; }
function famMyDevice() {
  const mid = famMyMemberId();
  if (!mid) return null;
  return famDevices().find(g => g.memberId === mid && g.typ === 'handy') || famDevices().find(g => g.memberId === mid) || null;
}
function famColor(m) { return (m && m.color && m.color !== 'transparent') ? m.color : '#00374A'; }
function famDeviceColor(g) { const m = g ? memberById(g.memberId) : null; return famColor(m); }
function famDeviceName(g) { const m = g ? memberById(g.memberId) : null; return m ? memberLabel(m) : (g ? g.name : ''); }
function famAgo(ms) {
  if (!ms) return '';
  const d = Math.max(0, famNow() - ms);
  if (d < 60 * 1000) return 'gerade eben';
  if (d < 60 * 60 * 1000) return 'vor ' + Math.round(d / 60000) + ' Min.';
  if (d < 24 * 60 * 60 * 1000) return 'vor ' + Math.round(d / 3600000) + ' Std.';
  const dt = new Date(ms);
  return dt.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) + ', ' + dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function famAge(birth) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth || ''));
  if (!m) return null;
  const now = new Date();
  let a = now.getFullYear() - Number(m[1]);
  if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) a--;
  return a >= 0 && a < 130 ? a : null;
}
function famFmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}
function famTel(phone) { return 'tel:' + String(phone || '').replace(/[^\d+*#]/g, ''); }
function famAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
function famAvatarInner(m) {
  if (m && m.photo) return `<span class="fam-ava-in"><img src="${famAttr(m.photo)}" alt="" /></span>`;
  if (m && m.avatar) return `<span class="fam-ava-in">${escapeHtml(m.avatar)}</span>`;
  const initial = ((m && m.name) || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="fam-ava-in ini" style="background:${famAttr(famColor(m))}">${escapeHtml(initial)}</span>`;
}
function famCopy(text) {
  const done = () => finShowToast('Kopiert');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, () => famCopyFallback(text, done)); return; }
  } catch (e) { /* continue */ }
  famCopyFallback(text, done);
}
function famCopyFallback(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { finShowToast('Kopieren nicht möglich', true); }
  ta.remove();
}
function famOsmandUrl() { return location.origin + '/api/pinn/ortung/osmand'; }
function famNewUniqueId() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const arr = new Uint32Array(8);
  try { crypto.getRandomValues(arr); } catch (e) { for (let i = 0; i < 8; i++) arr[i] = Math.floor(Math.random() * 1e9); }
  for (let i = 0; i < 8; i++) s += abc[arr[i] % abc.length];
  return 'pinn-' + s;
}

/* ---------- Server ---------- */
async function famLoadStatus() {
  if (!famOrtungAllowed()) { famStatus = null; return; }
  if (famStatusLoading) return;
  famStatusLoading = true;
  try {
    const res = await apiFetch('/api/pinn/ortung/status', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) {
      famStatusErr = 'Die Ortung ist auf dem Server noch nicht eingespielt (pb_hooks/ortung.pb.js und pinn-ortung.js).';
      if (!famStatus) famStatus = { geraete: [], orte: [], unterwegs: {}, verbunden: false };
    } else if (!res.ok) {
      famStatusErr = body.error || 'Standorte gerade nicht abrufbar.';
    } else {
      famStatus = body;
      famStatusErr = '';
      ladenCacheFromStatus(body); // Remember shops with an address for lists as well
      try { pinnTeilenAusStatus(); } catch (e) { /* ignore */ }
      if (body.jetzt) famSkew = Number(body.jetzt) - Date.now();
      try { localStorage.setItem(LS_FAM_STATUS, JSON.stringify({ familie: (currentUser() && currentUser().familie) || '', data: body })); } catch (e) { /* ignore */ }
    }
  } catch (e) {
    famStatusErr = 'offline';
    if (!famStatus) {
      try {
        const c = JSON.parse(localStorage.getItem(LS_FAM_STATUS) || 'null');
        if (c && c.familie === ((currentUser() && currentUser().familie) || '')) famStatus = c.data;
      } catch (e2) { /* ignore */ }
    }
  } finally {
    famStatusLoading = false;
  }
  if (famFollow && famTrailHours) famLoadTrail(false);
  famRefreshLive();
  try { if (currentView === 'uebersicht') renderFamilyTile(); ofsRefreshSheet(); } catch (e) { /* overview not built yet */ }
}
function famStartPolling() {
  famStopPolling();
  if (!famOrtungAllowed()) return;
  const tick = async () => {
    if (currentView !== 'familie' || !famPollWanted()) { famStopPolling(); return; }
    if (document.visibilityState === 'visible') await famLoadStatus();
    if (currentView !== 'familie') return;
    const ms = (window.pinnRuhe && window.pinnRuhe()) ? 60 * 1000 : (famFollow ? FAM_POLL_FOLLOW_MS : FAM_POLL_MS);
    famPollTimer = setTimeout(tick, ms);
  };
  tick();
}
// Back from sleep mode: refresh the map right away
window.addEventListener('pinn-wach', () => { if (currentView === 'familie' && famPollTimer) famStartPolling(); });
function famStopPolling() { clearTimeout(famPollTimer); famPollTimer = null; }
async function famPost(path, payload) {
  return postJson('/api/pinn/ortung/' + path, payload);
}
async function famLoadTrail(force) {
  if (!famFollow || !famTrailHours) { famTrail = null; famDrawMap(); return; }
  if (!force && famTrail && famTrail.geraet === famFollow && famTrail.hours === famTrailHours && Date.now() - famTrail.at < 60000) return;
  try {
    const r = await postJson('/api/pinn/ortung/spur', { geraet: famFollow, stunden: famTrailHours });
    famTrail = { geraet: famFollow, hours: famTrailHours, punkte: Array.isArray(r.punkte) ? r.punkte : [], at: Date.now() };
  } catch (e) {
    famTrail = null;
  }
  famDrawMap();
}

/* ==========================================================
   Map (drawn by pinn. itself, OpenStreetMap tiles via the own server)
   ========================================================== */
function famCreateMap(host, opts) {
  opts = opts || {};
  const TS = 256;
  const el = document.createElement('div');
  el.className = 'fm-map';
  el.setAttribute('data-allow-doubletap', '');
  el.innerHTML = `<div class="fm-pane"><div class="fm-tiles"></div><svg class="fm-svg" xmlns="http://www.w3.org/2000/svg"></svg><div class="fm-marks"></div></div>
    <div class="fm-ctrl">
      <button type="button" data-fm="in" aria-label="Vergrößern">+</button>
      <button type="button" data-fm="out" aria-label="Verkleinern">−</button>
      ${opts.fitBtn ? '<button type="button" data-fm="fit" aria-label="Alle zeigen" title="Alle zeigen">⤢</button>' : ''}
      ${opts.centerBtn ? '<button type="button" data-fm="me" class="fm-me hidden" aria-label="Zur verfolgten Person" title="Zur verfolgten Person">◎</button>' : ''}
    </div>
    <div class="fm-attr">© OpenStreetMap</div>`;
  host.appendChild(el);
  const pane = el.querySelector('.fm-pane');
  const tilesEl = el.querySelector('.fm-tiles');
  const svg = el.querySelector('.fm-svg');
  const marksEl = el.querySelector('.fm-marks');
  const st = { z: 13, cx: 0, cy: 0, w: 1, h: 1 };
  const tiles = new Map();
  let markers = [];   // { id, lat, lon, el }
  let circles = [];   // { lat, lon, r, color }
  let line = [];      // [[lat, lon], ...]
  const clampZ = z => Math.max(3, Math.min(19, Math.round(z)));
  const proj = (lat, lon, z) => {
    const s = TS * Math.pow(2, z);
    const r = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180;
    return [(lon + 180) / 360 * s, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * s];
  };
  const unproj = (x, y, z) => {
    const s = TS * Math.pow(2, z);
    const n = Math.PI - 2 * Math.PI * y / s;
    return [180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), x / s * 360 - 180];
  };
  function measure() { st.w = el.clientWidth || 1; st.h = el.clientHeight || 1; }
  function toScreen(lat, lon) { const p = proj(lat, lon, st.z); return [p[0] - st.cx + st.w / 2, p[1] - st.cy + st.h / 2]; }
  function toLatLon(sx, sy) { return unproj(st.cx - st.w / 2 + sx, st.cy - st.h / 2 + sy, st.z); }
  function renderTiles() {
    const z = st.z, n = Math.pow(2, z);
    const left = st.cx - st.w / 2, top = st.cy - st.h / 2;
    const x0 = Math.floor(left / TS), x1 = Math.floor((left + st.w) / TS);
    const y0 = Math.max(0, Math.floor(top / TS)), y1 = Math.min(n - 1, Math.floor((top + st.h) / TS));
    const want = new Set();
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const wx = ((tx % n) + n) % n;
        const key = z + '/' + tx + '/' + ty;
        want.add(key);
        let img = tiles.get(key);
        if (!img) {
          img = document.createElement('img');
          img.className = 'fm-tile';
          img.alt = '';
          img.draggable = false;
          img.decoding = 'async';
          img.onerror = () => { if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = `https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`; } };
          img.src = `/api/pinn/ortung/kachel/${z}/${wx}/${ty}`;
          tilesEl.appendChild(img);
          tiles.set(key, img);
        }
        img.style.transform = `translate(${Math.round(tx * TS - left)}px, ${Math.round(ty * TS - top)}px)`;
      }
    }
    tiles.forEach((img, key) => { if (!want.has(key)) { img.remove(); tiles.delete(key); } });
  }
  function metersToPx(m, lat) { return m / (156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, st.z)); }
  function renderOverlay() {
    svg.setAttribute('width', st.w);
    svg.setAttribute('height', st.h);
    let html = '';
    circles.forEach(c => {
      const p = toScreen(c.lat, c.lon);
      const r = Math.max(4, metersToPx(c.r, c.lat));
      html += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${r.toFixed(1)}" fill="${c.color}" fill-opacity="0.12" stroke="${c.color}" stroke-opacity="0.7" stroke-width="2" stroke-dasharray="${c.dash ? '6 5' : ''}"></circle>`;
    });
    if (line.length > 1) {
      const pts = line.map(q => toScreen(q[0], q[1])).map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      html += `<polyline points="${pts}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"></polyline>`;
      html += `<polyline points="${pts}" fill="none" stroke="${opts.lineColor || '#00374A'}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"></polyline>`;
      const s = toScreen(line[0][0], line[0][1]);
      html += `<circle cx="${s[0].toFixed(1)}" cy="${s[1].toFixed(1)}" r="5" fill="#fff" stroke="${opts.lineColor || '#00374A'}" stroke-width="3"></circle>`;
    }
    svg.innerHTML = html;
    markers.forEach(mk => {
      const p = toScreen(mk.lat, mk.lon);
      mk.el.style.left = Math.round(p[0]) + 'px';
      mk.el.style.top = Math.round(p[1]) + 'px';
    });
  }
  function render() { measure(); renderTiles(); renderOverlay(); }
  function setView(lat, lon, z) {
    if (z != null) st.z = clampZ(z);
    const p = proj(lat, lon, st.z);
    st.cx = p[0]; st.cy = p[1];
    render();
  }
  function zoomAt(sx, sy, dz) {
    const nz = clampZ(st.z + dz);
    if (nz === st.z) return;
    const wx = st.cx - st.w / 2 + sx, wy = st.cy - st.h / 2 + sy;
    const f = Math.pow(2, nz - st.z);
    st.z = nz;
    st.cx = wx * f - (sx - st.w / 2);
    st.cy = wy * f - (sy - st.h / 2);
    render();
  }
  function fit(points, maxZ) {
    measure();
    const pts = (points || []).filter(p => p && isFinite(p[0]) && isFinite(p[1]));
    if (!pts.length) return false;
    if (pts.length === 1) { setView(pts[0][0], pts[0][1], Math.min(maxZ || 16, 16)); return true; }
    let z = maxZ || 17;
    for (; z > 3; z--) {
      const ps = pts.map(p => proj(p[0], p[1], z));
      const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
      if (Math.max(...xs) - Math.min(...xs) <= st.w - 90 && Math.max(...ys) - Math.min(...ys) <= st.h - 110) break;
    }
    const ps = pts.map(p => proj(p[0], p[1], z));
    const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
    st.z = z;
    st.cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    st.cy = (Math.max(...ys) + Math.min(...ys)) / 2 - 12;
    render();
    return true;
  }
  function setMarkers(list) {
    marksEl.innerHTML = '';
    markers = (list || []).map(m => {
      const d = document.createElement('div');
      d.className = 'fm-mk-wrap ' + (m.cls || '');
      if (m.id) d.dataset.mk = m.id;
      d.innerHTML = m.html;
      marksEl.appendChild(d);
      return { id: m.id, lat: m.lat, lon: m.lon, el: d };
    });
    renderOverlay();
  }
  function setCircles(list) { circles = list || []; renderOverlay(); }
  function setLine(list) { line = list || []; renderOverlay(); }

  // Controls: drag, two-finger zoom, mouse wheel, double tap
  const ptrs = new Map();
  let drag = null, pinch = null, moved = false, downTarget = null, lastTap = 0, wheelAt = 0;
  const rel = (x, y) => { const r = el.getBoundingClientRect(); return [x - r.left, y - r.top]; };
  el.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.fm-ctrl')) return;
    try { el.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    ptrs.set(ev.pointerId, rel(ev.clientX, ev.clientY));
    if (ptrs.size === 1) {
      drag = { p: rel(ev.clientX, ev.clientY), cx: st.cx, cy: st.cy };
      moved = false;
      downTarget = ev.target;
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, c0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], c: null, s: 1, z: st.z, cx: st.cx, cy: st.cy };
      pinch.c = pinch.c0;
      drag = null;
      moved = true;
    }
  });
  el.addEventListener('pointermove', (ev) => {
    if (!ptrs.has(ev.pointerId)) return;
    const p = rel(ev.clientX, ev.clientY);
    ptrs.set(ev.pointerId, p);
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      pinch.s = (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1) / pinch.d;
      pinch.c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      pane.style.transformOrigin = `${pinch.c0[0]}px ${pinch.c0[1]}px`;
      pane.style.transform = `translate(${pinch.c[0] - pinch.c0[0]}px, ${pinch.c[1] - pinch.c0[1]}px) scale(${pinch.s})`;
      return;
    }
    if (!drag) return;
    const dx = p[0] - drag.p[0], dy = p[1] - drag.p[1];
    if (!moved && Math.abs(dx) + Math.abs(dy) > 6) { moved = true; if (opts.onUserMove) opts.onUserMove(); }
    if (moved) { st.cx = drag.cx - dx; st.cy = drag.cy - dy; renderTiles(); renderOverlay(); }
  });
  const up = (ev) => {
    if (!ptrs.has(ev.pointerId)) return;
    ptrs.delete(ev.pointerId);
    if (pinch) {
      if (ptrs.size < 2) {
        const dz = Math.round(Math.log2(pinch.s || 1));
        const nz = clampZ(pinch.z + dz);
        const f = Math.pow(2, nz - pinch.z);
        const wx = pinch.cx - st.w / 2 + pinch.c0[0], wy = pinch.cy - st.h / 2 + pinch.c0[1];
        st.z = nz;
        st.cx = wx * f - (pinch.c[0] - st.w / 2);
        st.cy = wy * f - (pinch.c[1] - st.h / 2);
        pane.style.transform = '';
        pinch = null;
        drag = null;
        render();
        if (opts.onUserMove) opts.onUserMove();
      }
      return;
    }
    if (ptrs.size === 0 && drag) {
      if (!moved && ev.type === 'pointerup') {
        const p = rel(ev.clientX, ev.clientY);
        const now = Date.now();
        const mk = downTarget && downTarget.closest ? downTarget.closest('[data-mk]') : null;
        if (now - lastTap < 300) { zoomAt(p[0], p[1], 1); lastTap = 0; }
        else {
          lastTap = now;
          if (mk && opts.onMarker) opts.onMarker(mk.dataset.mk);
          else if (opts.onTap) { const ll = toLatLon(p[0], p[1]); opts.onTap(ll[0], ll[1]); }
        }
      }
      drag = null;
    }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const now = Date.now();
    if (now - wheelAt < 220) return;
    wheelAt = now;
    const p = rel(ev.clientX, ev.clientY);
    zoomAt(p[0], p[1], ev.deltaY < 0 ? 1 : -1);
    if (opts.onUserMove) opts.onUserMove();
  }, { passive: false });
  el.querySelector('.fm-ctrl').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-fm]');
    if (!b) return;
    ev.stopPropagation();
    if (b.dataset.fm === 'in') zoomAt(st.w / 2, st.h / 2, 1);
    else if (b.dataset.fm === 'out') zoomAt(st.w / 2, st.h / 2, -1);
    else if (b.dataset.fm === 'fit' && opts.onFit) opts.onFit();
    else if (b.dataset.fm === 'me' && opts.onCenter) opts.onCenter();
  });
  let ro = null;
  try { ro = new ResizeObserver(() => render()); ro.observe(el); } catch (e) { window.addEventListener('resize', render); }
  measure();
  return {
    el, setView, fit, setMarkers, setCircles, setLine, render, zoomAt,
    showCenter(on) { const b = el.querySelector('[data-fm="me"]'); if (b) b.classList.toggle('hidden', !on); },
    center() { return unproj(st.cx, st.cy, st.z); },
    zoom() { return st.z; },
    destroy() { try { if (ro) ro.disconnect(); } catch (e) { /* ignore */ } el.remove(); },
  };
}

/* ==========================================================
   Display
   ========================================================== */
function renderFamily() {
  const pane = document.getElementById('famPane');
  if (!pane) return;
  if (famTab === 'ortung' && !famOrtungAllowed()) famTab = 'uebersicht';
  if (famDetailId && !memberById(famDetailId)) famDetailId = null;
  document.querySelectorAll('.fam-tab-btn').forEach(b => {
    b.classList.toggle('active', !famDetailId && b.dataset.famtab === famTab);
    if (b.dataset.famtab === 'ortung') b.classList.toggle('hidden', !famOrtungAllowed());
  });
  const inOrtung = famTab === 'ortung' && !famDetailId;
  const placesBtn = document.getElementById('famPlacesBtn');
  const setupBtn = document.getElementById('famSetupBtn');
  if (placesBtn) placesBtn.classList.toggle('hidden', !inOrtung || !famOrtungAllowed() || !famCanEdit());
  if (setupBtn) setupBtn.classList.toggle('hidden', !inOrtung || !isCurrentUserAdmin());
  try { skSyncFromTasks(); } catch (e) { /* ignore */ }
  if (famDetailId) {
    const m = memberById(famDetailId);
    pane.innerHTML = famDetailMode === 'pass' ? famDetailHtml(m) : famProfileHtml(m);
  } else if (famTab === 'schule') {
    pane.innerHTML = skPaneHtml();
    skKiCheck();
  } else if (famTab === 'tiere') {
    pane.innerHTML = ptPaneHtml();
  } else if (famTab === 'notfall') {
    pane.innerHTML = famNotfallHtml();
  } else if (famTab === 'ortung') {
    pane.innerHTML = famOrtungHtml();
    famAttachMap();
  } else {
    pane.innerHTML = famHomeHtml();
  }
  famRefreshLive();
}

function famPersonHtml(m) {
  const g = famOrtungAllowed() ? famDeviceForMember(m.id) : null;
  const live = famIsLive(g);
  const pos = g && g.teilen ? g.position : null;
  let sub = '';
  if (g && famUnterwegs(g)) sub = '🚶 unterwegs nach Hause';
  else if (g && !g.teilen) sub = 'Standort aus';
  else if (pos) {
    const pl = famPlace(pos.ort);
    sub = (pl ? pl.emoji + ' ' + pl.name : (live ? 'unterwegs' : 'zuletzt')) + ' · ' + famAgo(pos.zeit);
  } else if (famPass(m.id)) sub = '🩺 Notfallpass';
  const sosA = sosActiveFor(m.id);
  if (sosA) sub = '🆘 SOS aktiv';
  return `<button type="button" class="fam-person${sosA ? ' sos' : ''}" data-${sosA ? 'sosopen' : 'famopen'}="${famAttr(sosA ? sosA.id : m.id)}" style="--fam:${famAttr(famColor(m))}">
    <span class="fam-ava">${famAvatarInner(m)}${live ? '<span class="fam-ping" title="Live-Standort"></span>' : ''}</span>
    <span class="fam-name">${escapeHtml(memberLabel(m))}</span>
    <span class="fam-sub">${escapeHtml(sub)}</span>
  </button>`;
}

function famAttachMap() {
  const slot = document.getElementById('famMapSlot');
  if (!slot) return;
  if (!famMapHost) {
    famMapHost = document.createElement('div');
    famMapHost.className = 'fam-map-host';
    famMap = famCreateMap(famMapHost, {
      fitBtn: true,
      centerBtn: true,
      onMarker: (id) => { famSelected = famSelected === id ? '' : id; famDrawMap(); famRenderInfo(); },
      onTap: () => { if (famSelected) { famSelected = ''; famDrawMap(); famRenderInfo(); } },
      // Moved/zoomed by hand while following: following and trail stay on, but the map no longer
      // jumps back to the person – ◎ brings them back to the centre
      onUserMove: () => { if (famFollow && !famFollowFree) { famFollowFree = true; if (famMap) famMap.showCenter(true); } },
      onFit: () => { famFollowFree = !!famFollow; famFitAll(); famDrawMap(); },
      onCenter: () => { famFollowFree = false; if (famMap) famMap.showCenter(false); famDrawMap(); },
    });
  }
  slot.appendChild(famMapHost);
  requestAnimationFrame(() => { if (famMap) famMap.render(); });
}

function famVisibleDevices() {
  return famDevices().filter(g => g.teilen && g.position && !famHidden.has(g.id));
}
// Home for the map: from the location data, otherwise from Settings → Home
function famHomePoint() {
  if (famStatus && famStatus.zuhause && isFinite(famStatus.zuhause.lat)) return famStatus.zuhause;
  const h = famHome();
  if (h) return h;
  return homeInfo && isFinite(homeInfo.lat) ? homeInfo : null;
}
// Map start: home in the centre, zoomed out far enough that everyone nearby (up to 30 km) is visible
function famStartView() {
  if (!famMap) return;
  const home = famHomePoint();
  if (!home) { famFitAll(); return; }
  const hl = Number(home.lat), ho = Number(home.lon);
  const pts = [[hl, ho]];
  famVisibleDevices().forEach(g => {
    const la = g.position.lat, lo = g.position.lon;
    if (Math.abs(la - hl) > 0.3 || Math.abs(lo - ho) > 0.45) return;
    pts.push([la, lo], [2 * hl - la, 2 * ho - lo]);
  });
  if (pts.length === 1) famMap.setView(hl, ho, 15);
  else famMap.fit(pts, 16);
}
function famFitAll() {
  if (!famMap) return;
  const pts = famVisibleDevices().map(g => [g.position.lat, g.position.lon]);
  const home = famHome();
  if (!pts.length && home) pts.push([home.lat, home.lon]);
  if (!pts.length) famPlaces().forEach(o => pts.push([o.lat, o.lon]));
  if (pts.length) famMap.fit(pts, 16);
  else famMap.setView(51.1657, 10.4515, 6);
}
function famMarkerHtml(g) {
  const m = memberById(g.memberId);
  const live = famIsLive(g);
  const sosA = sosActiveFor(g.memberId);
  return `<div class="fm-mk${live || sosA ? ' live' : ' stale'}${sosA ? ' sos' : ''}${famSelected === g.id ? ' sel' : ''}" style="--fam:${famAttr(famColor(m))}">
    <div class="fm-mk-ava">${m ? famAvatarInner(m) : `<span class="fam-ava-in">${escapeHtml(g.emoji || '📍')}</span>`}</div>
    <div class="fm-mk-lbl">${sosA ? '🆘 ' : ''}${escapeHtml(famDeviceName(g))}${famUnterwegs(g) ? ' 🚶' : ''}</div>
  </div>`;
}
function famDrawMap() {
  if (!famMap || !document.getElementById('famMapSlot')) return;
  const devs = famVisibleDevices();
  const placeMarks = famPlaces().map(o => ({ lat: o.lat, lon: o.lon, html: `<div class="fm-place">${escapeHtml(o.emoji || '📍')}</div>`, cls: 'is-place' }));
  const devMarks = devs.slice().sort((a, b) => (a.id === famSelected) - (b.id === famSelected)).map(g => ({ id: g.id, lat: g.position.lat, lon: g.position.lon, html: famMarkerHtml(g) }));
  famMap.setMarkers(placeMarks.concat(devMarks));
  famMap.setCircles(famPlaces().map(o => ({ lat: o.lat, lon: o.lon, r: Number(o.radius) || 150, color: o.zuhause ? '#2F7D4F' : '#00374A', dash: !o.zuhause })));
  const tr = famTrail && famTrail.geraet === famFollow && famTrailHours ? famTrail.punkte : [];
  const g = famFollow ? famDevice(famFollow) : null;
  const linePts = tr.map(p => [p[0], p[1]]);
  if (g && g.position && linePts.length) linePts.push([g.position.lat, g.position.lon]);
  famMap.setLine(linePts);
  if (!g) famFollowFree = false;
  famMap.showCenter(!!g && famFollowFree);
  if (g && g.position) { if (!famFollowFree) famMap.setView(g.position.lat, g.position.lon, Math.max(famMap.zoom(), 15)); }
  else if (!famFitted && famStatus) { famFitted = true; famStartView(); }
}

function famRenderChips() {
  const wrap = document.getElementById('famChips');
  if (!wrap) return;
  const devs = famDevices().filter(g => g.teilen && g.position);
  if (!devs.length) { wrap.innerHTML = ''; wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  const chips = devs.map(g => {
    const m = memberById(g.memberId);
    const on = !famHidden.has(g.id);
    return `<button type="button" class="fz-filter-chip${on ? ' active' : ''}" data-famchip="${famAttr(g.id)}">${famIsLive(g) ? '<span class="fam-dot"></span>' : ''}${escapeHtml((m && m.avatar) ? m.avatar + ' ' : '')}${escapeHtml(famDeviceName(g))}</button>`;
  }).join('');
  const follow = `<select id="famFollowSel" class="fam-sel" aria-label="Person verfolgen">
      <option value="">👁 Verfolgen …</option>
      ${devs.map(g => `<option value="${famAttr(g.id)}"${famFollow === g.id ? ' selected' : ''}>👁 ${escapeHtml(famDeviceName(g))}</option>`).join('')}
    </select>`;
  const trail = famFollow ? `<select id="famTrailSel" class="fam-sel" aria-label="Spur anzeigen">
      ${[[0, 'Spur aus'], [1, 'Spur 1 Std.'], [3, 'Spur 3 Std.'], [8, 'Spur 8 Std.'], [24, 'Spur 24 Std.']].map(([v, l]) => `<option value="${v}"${famTrailHours === v ? ' selected' : ''}>〰 ${l}</option>`).join('')}
    </select>` : '';
  wrap.innerHTML = follow + trail + chips;
}

function famRenderInfo() {
  const box = document.getElementById('famInfo');
  if (!box) return;
  const g = famSelected ? famDevice(famSelected) : null;
  if (!g || !g.position || !g.teilen) { box.innerHTML = ''; return; }
  const p = g.position;
  const pl = famPlace(p.ort);
  const live = famIsLive(g);
  const addr = famAddress[g.id] && Math.abs(famAddress[g.id].lat - p.lat) < 0.0002 && Math.abs(famAddress[g.id].lon - p.lon) < 0.0002 ? famAddress[g.id].name : '';
  const facts = [
    live ? '<span class="text-red-600 font-medium">● live</span>' : '',
    famAgo(p.zeit),
    p.akku != null ? (p.laedt ? '🔌 ' : '🔋 ') + p.akku + ' %' : '',
    p.tempo ? '🏃 ' + p.tempo + ' km/h' : '',
    p.genau ? '± ' + p.genau + ' m' : '',
  ].filter(Boolean).join(' · ');
  const nav = isAppleMobile()
    ? `https://maps.apple.com/?ll=${p.lat},${p.lon}&q=${encodeURIComponent(famDeviceName(g))}`
    : `geo:${p.lat},${p.lon}?q=${p.lat},${p.lon}(${encodeURIComponent(famDeviceName(g))})`;
  box.innerHTML = `<div class="fam-info">
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <div class="font-medium text-sm">${escapeHtml(famDeviceName(g))}${famUnterwegs(g) ? ' · 🚶 unterwegs nach Hause' : ''}</div>
        <div class="text-xs text-ink/60 mt-0.5">${pl ? escapeHtml(pl.emoji + ' ' + pl.name) + ' · ' : ''}${facts}</div>
        ${addr ? `<div class="text-xs text-ink/60 mt-1">📮 ${escapeHtml(addr)}</div>` : ''}
      </div>
    </div>
    <div class="flex flex-wrap gap-2 mt-2">
      <button type="button" class="fz-mini-btn${famFollow === g.id ? ' primary' : ''}" data-famact="follow" data-id="${famAttr(g.id)}">👁 ${famFollow === g.id ? 'Verfolgen beenden' : 'Verfolgen'}</button>
      ${addr ? '' : `<button type="button" class="fz-mini-btn" data-famact="address" data-id="${famAttr(g.id)}">📮 Adresse</button>`}
      <a class="fz-mini-btn" href="${famAttr(nav)}" target="_blank" rel="noopener">🧭 Navigation</a>
      ${memberById(g.memberId) ? `<button type="button" class="fz-mini-btn" data-famopen="${famAttr(g.memberId)}">👤 Profil</button><button type="button" class="fz-mini-btn" data-fampass="${famAttr(g.memberId)}">🩺 Notfallpass</button>` : ''}
    </div>
  </div>`;
}

function famRenderNote() {
  const box = document.getElementById('famNote');
  const stamp = document.getElementById('famStamp');
  if (stamp) stamp.textContent = famStatusLoading && !famStatus ? 'lädt …' : (famStatusErr === 'offline' ? 'offline' : (famStatus ? 'aktualisiert ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''));
  if (!box) return;
  const notes = [];
  if (famStatusErr && famStatusErr !== 'offline') notes.push(['urgent', '⚠️', escapeHtml(famStatusErr)]);
  else if (famStatusErr === 'offline') notes.push(['warn', '📴', 'Keine Verbindung zum Server – angezeigt wird der letzte bekannte Stand.']);
  if (famStatus && famStatus.verbunden === false && famStatus.fehler && !famStatusErr) notes.push(['urgent', '⚠️', escapeHtml(famStatus.fehler)]);
  else if (famStatus && famStatus.fehler && !famStatusErr && isCurrentUserAdmin()) notes.push(['warn', '🛰️', escapeHtml(famStatus.fehler)]);
  if (famStatus && !famDevices().some(g => g.teilen && g.position)) {
    notes.push(['', '⏳', 'Noch keine Standorte. Tippe oben auf <b>📍 Standort teilen</b> – sobald jemand teilt, erscheint er hier.' +
      (isCurrentUserAdmin() ? ' GPS-Tracker und die App für den Hintergrund richtest du unter <b>⚙︎ Ortung</b> ein.' : '')]);
  }
  if (famStatus && famDevices().length && !famPlaces().length && famCanEdit()) {
    notes.push(['', '🏠', 'Tipp: Lege unter <b>📍 Orte</b> euer Zuhause an – dann gibt es Meldungen beim Ankommen und „Ich bin unterwegs“ funktioniert.']);
  }
  box.innerHTML = notes.length ? `<div class="flex flex-col gap-2 mt-3">${notes.map(([cls, ic, t]) => `<div class="fz-note-box ${cls}"><span>${ic}</span><span class="text-xs leading-relaxed">${t}</span></div>`).join('')}</div>` : '';
}

// "until 6:30 pm" / "until you are home" / "until you stop it" – duration of a share
function famShareUntil(g, du) {
  if (!g || !g.teilen) return '';
  if (g.endeZuhause) return du ? 'bis du zu Hause bist' : 'bis zur Ankunft zu Hause';
  if (g.bis) {
    const d = new Date(g.bis);
    const heute = new Date().toDateString() === d.toDateString();
    return 'bis ' + (heute ? '' : d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) + ' ') + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
  }
  return du ? 'bis du es beendest' : '';
}
function famMyPhone() {
  const mid = famMyMemberId();
  return mid ? (famDevices().find(g => g.memberId === mid && g.typ === 'handy') || null) : null;
}
function famRenderMine() {
  const box = document.getElementById('famMine');
  if (!box) return;
  const mid = famMyMemberId();
  if (!mid || !famStatus || isCurrentUserGuest()) { box.innerHTML = ''; return; }
  const g = famMyPhone();
  const unterwegs = famUnterwegs(g);
  const dauerhaft = !!(g && g.teilen && !g.nurEinmal);
  const einmal = !!(g && g.nurEinmal);
  const p = g ? g.position : null;
  const appFresh = !!(p && p.quelle === 'app' && famNow() - p.zeit < 30 * 60 * 1000);
  const quelle = p ? (p.quelle === 'app' ? ' · aus „Traccar Client“' : (p.quelle === 'pinn' || p.quelle === 'einmal') ? ' · aus pinn.' : '') : '';
  const bis = famShareUntil(g, true);
  let head;
  if (dauerhaft) {
    head = `<div class="flex items-start gap-2 mb-2"><span class="fam-dot" style="margin-top:6px"></span><div class="min-w-0">
        <div class="text-sm font-medium">Du sendest dauerhaft${bis ? ' · ' + escapeHtml(bis) : ''}</div>
        <div class="text-[11px] text-ink/50 mt-0.5">${p ? 'Zuletzt ' + escapeHtml(famAgo(p.zeit)) + escapeHtml(quelle) : 'Noch kein Standort angekommen.'} · im Stehen wird nichts gesendet</div>
      </div></div>`;
  } else if (einmal) {
    head = `<p class="text-xs text-ink/60 mb-2">📍 Einmalig gesendet ${escapeHtml(famAgo(p.zeit))} – die Familie sieht diesen Standort ${escapeHtml(bis)}.</p>`;
  } else {
    head = `<p class="text-xs text-ink/55 mb-2">Deine Familie sieht dich gerade nicht auf der Karte.${g && g.zuletzt && g.zuletzt.quelle === 'app' && famNow() - g.zuletzt.zeit < 24 * 3600 * 1000 ? ' „Traccar Client“ ist eingerichtet – angezeigt wird erst, wenn du dauerhaft sendest.' : ''}</p>`;
  }
  const bg = dauerhaft && !appFresh
    ? `<div class="fz-note-box mb-2"><span>💤</span><span class="text-xs">Solange pinn. offen ist, schickt es bei Bewegung neue Standorte mit. Ist pinn. geschlossen, kommt dein Standort nur mit der einmal eingerichteten App „Traccar Client“.</span></div>`
    : '';
  box.innerHTML = `<div class="fam-card">
    <div class="fz-h">📱 Mein Standort</div>
    ${head}
    ${bg}
    <label class="fz-check"><input type="checkbox" data-famact="dauerhaft"${dauerhaft ? ' checked' : ''} /><span>Dauerhaft senden<span class="block text-[11px] text-ink/45">Die Familie sieht dich live auf der Karte – mit Dauer, endet von selbst.</span></span></label>
    <label class="fz-check"><input type="checkbox" id="famMinePush"${famSharePushPref() ? ' checked' : ''} /><span>🔔 Familie per Push benachrichtigen<span class="block text-[11px] text-ink/45">Beim Einschalten und beim einmaligen Senden. SOS benachrichtigt immer.</span></span></label>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="fz-mini-btn primary" data-famact="einmal">📍 Einmalig senden</button>
      ${dauerhaft ? '<button type="button" class="fz-mini-btn" data-famact="share">⏱ Dauer ändern</button>' : ''}
      <button type="button" class="fz-mini-btn${unterwegs ? ' primary' : ''}" data-famact="unterwegs" data-an="${unterwegs ? '0' : '1'}">${unterwegs ? '🏁 Heimweg beenden' : '🚶 Ich bin unterwegs nach Hause'}</button>
      ${g ? `<button type="button" class="fz-mini-btn" data-famact="guide" data-id="${famAttr(g.id)}">⚙︎ App für den Hintergrund</button>` : ''}
    </div>
    <button type="button" id="famSosBtn" class="fam-sos-btn${famSosUntil ? ' counting' : ''}" data-famact="sos">${famSosLabel()}</button>
    ${unterwegs ? `<p class="text-[11px] text-ink/45 mt-2">Die Familie wurde benachrichtigt und sieht deinen Live-Standort. Beim Ankommen zu Hause endet der Heimweg automatisch.</p>` : ''}
  </div>`;
}
// Parts of the page that change with new locations (without rebuilding the map)
function famRefreshLive() {
  if (currentView !== 'familie') return;
  const grid = document.getElementById('famGrid');
  if (grid) grid.innerHTML = members.map(famPersonHtml).join('');
  famRenderMine();
  famRenderChips();
  famDrawMap();
  famRenderInfo();
  famRenderNote();
  const loc = document.getElementById('famDetailLoc');
  if (loc && famDetailId) loc.innerHTML = famDetailLocHtml(memberById(famDetailId));
  const ping = document.getElementById('famDetailPing');
  if (ping && famDetailId) ping.classList.toggle('hidden', !famIsLive(famDeviceForMember(famDetailId)));
}

/* ---------- View emergency pass ---------- */
function famRow(label, value, extra) {
  if (value == null || String(value).trim() === '') return '';
  return `<div class="fam-row"><div class="fam-k">${escapeHtml(label)}</div><div class="fam-v">${escapeHtml(value)}</div>${extra || ''}</div>`;
}
function famCallBtn(phone) {
  return phone ? `<a class="fz-mini-btn primary" href="${famAttr(famTel(phone))}">📞 Anrufen</a>` : '';
}
function famDetailLocHtml(m) {
  if (!m || !famOrtungAllowed()) return '';
  const g = famDeviceForMember(m.id);
  if (!g) return '';
  const p = g.teilen ? g.position : null;
  const pl = p ? famPlace(p.ort) : null;
  const live = famIsLive(g);
  const own = g.memberId === famMyMemberId();
  const canToggle = own || isCurrentUserAdmin();
  return `<div class="fam-card">
    <div class="fz-h">📍 Standort</div>
    <div class="text-sm">${!g.teilen ? 'Standort wird nicht geteilt.' : p ? `${live ? '<span class="text-red-600 font-medium">● live</span> · ' : ''}${pl ? escapeHtml(pl.emoji + ' ' + pl.name) + ' · ' : ''}${escapeHtml(famAgo(p.zeit))}${p.akku != null ? ' · 🔋 ' + p.akku + ' %' : ''}` : 'Noch kein Standort empfangen.'}</div>
    ${famUnterwegs(g) ? '<div class="text-xs text-ink/60 mt-1">🚶 unterwegs nach Hause</div>' : ''}
    ${g.teilen && famShareUntil(g) ? `<div class="text-xs text-ink/60 mt-1">⏱ ${g.nurEinmal ? 'einmalig gesendet, sichtbar' : 'geteilt'} ${escapeHtml(famShareUntil(g))}</div>` : ''}
    <div class="flex flex-wrap gap-2 mt-2">
      ${p ? `<button type="button" class="fz-mini-btn primary" data-famact="showmap" data-id="${famAttr(g.id)}">🗺 Auf der Karte zeigen</button>` : ''}
      ${canToggle ? `<label class="fz-check" style="margin:0;align-items:center"><input type="checkbox" data-famshare="${famAttr(g.id)}"${g.teilen && !g.nurEinmal ? ' checked' : ''} /><span>Dauerhaft senden</span></label>` : ''}
    </div>
  </div>`;
}
// Emergency numbers of the selected country (Settings → Language & region)
function regionNotruf() {
  return (window.PINN_REGION && PINN_REGION.notruf) || { polizei: '110', rettung: '112', feuer: '112', allgemein: '112' };
}
// Emergency buttons for the SOS popup: police and ambulance/fire brigade – or one number for everything (e.g. 911)
function sosEmergencyCalls(policeLabel) {
  const n = regionNotruf();
  const btn = (cls, ic, nr, label) => `<a class="sos-call ${cls}" href="tel:${escapeHtml(nr)}"><span class="ic">${ic}</span><b>${escapeHtml(nr)}</b><span>${escapeHtml(label)}</span></a>`;
  if (n.polizei === n.rettung && n.rettung === n.feuer) return [btn('rescue', '🆘', n.polizei, 'Notruf')];
  const out = [btn('police', '🚓', n.polizei, policeLabel || 'Polizei')];
  if (n.rettung === n.feuer) out.push(btn('rescue', '🚑', n.rettung, 'Rettung · Feuerwehr'));
  else { out.push(btn('rescue', '🚑', n.rettung, 'Rettung')); out.push(btn('fire', '🚒', n.feuer, 'Feuerwehr')); }
  return out;
}
// "110/112" or "911" – for hint texts
function regionNotrufText() {
  const n = regionNotruf();
  const nrs = [n.polizei, n.rettung, n.feuer].filter((x, i, a) => x && a.indexOf(x) === i);
  return nrs.join('/') || '112';
}
function famDetailHtml(m) {
  const p = famPass(m.id) || {};
  const pet = famIsPet(m);
  const age = famAge(p.birth);
  const color = famColor(m);
  const sub = [m.role && memberLabel(m) !== m.role ? m.role : '', age != null ? age + (age === 1 ? ' Jahr' : ' Jahre') : '', pet && p.species ? p.species : ''].filter(Boolean).join(' · ');
  const meds = (Array.isArray(p.meds) ? p.meds : []).filter(x => x && (x.name || x.dose));
  const contacts = (Array.isArray(p.contacts) ? p.contacts : []).filter(x => x && (x.name || x.phone));
  const hasAny = Object.keys(p).some(k => !['updated', 'updatedBy'].includes(k) && (Array.isArray(p[k]) ? p[k].some(x => x && Object.values(x).some(Boolean)) : String(p[k] || '').trim()));
  const editBtn = famCanEdit() ? `<button type="button" class="fz-act-btn" data-famact="edit"><span class="fz-ti">✏️</span>Bearbeiten</button>` : '';
  const rettung = regionNotruf().rettung;
  const sos = `<a class="fz-act-btn fam-sos" href="tel:${escapeHtml(rettung)}"><span class="fz-ti">🚑</span>${escapeHtml(rettung)} anrufen</a>`;
  const vet = pet && p.vetPhone ? `<a class="fz-act-btn" href="${famAttr(famTel(p.vetPhone))}"><span class="fz-ti">🐾</span>Tierarzt</a>` : '';
  const doc = !pet && p.doctorPhone ? `<a class="fz-act-btn" href="${famAttr(famTel(p.doctorPhone))}"><span class="fz-ti">🩺</span>Arzt</a>` : '';

  const medCard = pet
    ? [famRow('Tierart / Rasse', p.species), famRow('Geburtsdatum', famFmtDate(p.birth)), famRow('Chipnummer', p.chip), famRow('Gewicht', p.weight ? p.weight + ' kg' : ''),
       famRow('Allergien & Unverträglichkeiten', p.allergies), famRow('Erkrankungen', p.conditions), famRow('Impfungen', p.vaccinations)].join('')
    : [famRow('Geburtsdatum', famFmtDate(p.birth)), famRow('Blutgruppe', p.blood), famRow('Größe / Gewicht', [p.height ? p.height + ' cm' : '', p.weight ? p.weight + ' kg' : ''].filter(Boolean).join(' · ')),
       famRow('Allergien', p.allergies), famRow('Vorerkrankungen', p.conditions), famRow('Impfungen', p.vaccinations),
       famRow('Organspende', p.organDonor ? { ja: 'Ja – Ausweis vorhanden', nein: 'Nein', teilweise: 'Teilweise (siehe Ausweis)' }[p.organDonor] || p.organDonor : ''), famRow('Patientenverfügung', p.livingWill)].join('');
  const medsHtml = meds.length ? `<div class="fam-row"><div class="fam-k">Medikamente</div><div class="fam-v">${meds.map(x => `<div>💊 <b>${escapeHtml(x.name || '')}</b>${x.dose ? ' · ' + escapeHtml(x.dose) : ''}</div>`).join('')}</div></div>` : '';
  const careCard = pet
    ? [famRow('Tierarzt', p.vet, famCallBtn(p.vetPhone)), famRow('Versicherung', p.insurance), famRow('Versicherungsnr.', p.insuranceNo)].join('')
    : [famRow('Krankenkasse', p.insurance), famRow('Versichertennr.', p.insuranceNo), famRow('Hausarzt', p.doctor, famCallBtn(p.doctorPhone))].join('');
  const contactsHtml = contacts.map(c => `<div class="fam-row"><div class="fam-v"><b>${escapeHtml(c.name || '')}</b>${c.relation ? `<span class="text-ink/50"> · ${escapeHtml(c.relation)}</span>` : ''}${c.phone ? `<div class="text-xs text-ink/50">${escapeHtml(c.phone)}</div>` : ''}</div>${famCallBtn(c.phone)}</div>`).join('');
  const by = p.updatedBy ? (familyProfiles.find(x => x.id === p.updatedBy) || {}).username || '' : '';
  return `
    <button type="button" class="self-start text-sm text-ink/55 hover:text-pine -mb-1" data-famact="back">‹ ${famPassFrom === 'profil' ? escapeHtml(memberLabel(m)) : 'Zurück'}</button>
    <div class="fz-hero" style="--fz:${famAttr(color)}">
      <div class="fam-band"><svg class="fam-ecg" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 22 H105 L114 10 L124 34 L134 4 L146 30 L154 22 H300"></path></svg></div>
      <div class="fam-hero-ava"><span class="fam-ava big" style="--fam:${famAttr(color)}">${famAvatarInner(m)}<span id="famDetailPing" class="fam-ping${famIsLive(famDeviceForMember(m.id)) ? '' : ' hidden'}"></span></span></div>
      <div class="fam-hero-body">
        <div class="flex items-center gap-2 flex-wrap">
          <div class="font-serif text-xl">${escapeHtml(memberLabel(m))}</div>
          ${!pet && p.blood ? `<span class="fam-blood">🩸 ${escapeHtml(p.blood)}</span>` : ''}
        </div>
        <div class="text-xs text-ink/50 mt-0.5">${escapeHtml(sub || (pet ? 'Haustier' : 'Notfallpass'))}</div>
        <div class="flex gap-2 mt-3">${sos}${doc}${vet}${editBtn}</div>
      </div>
    </div>
    <div id="famDetailLoc">${famDetailLocHtml(m)}</div>
    ${!hasAny ? `<div class="fam-card text-center py-6">
        <div class="text-4xl mb-2">🩺</div>
        <div class="font-serif text-lg mb-1">Noch kein Notfallpass</div>
        <p class="text-sm text-ink/50 mb-3">${pet ? 'Chipnummer, Tierarzt, Medikamente und Notfallkontakte – alles auf einen Blick.' : 'Blutgruppe, Allergien, Medikamente, Krankenkasse und Notfallkontakte – griffbereit, auch offline.'}</p>
        ${famCanEdit() ? '<button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-famact="edit">Jetzt ausfüllen</button>' : ''}
      </div>` : `
      ${(contactsHtml || p.phone) ? `<div class="fam-card"><div class="fz-h">🆘 Notfallkontakte</div>${famRow(pet ? 'Tracker (SIM)' : 'Eigenes Handy', p.phone, famCallBtn(p.phone))}${contactsHtml}</div>` : ''}
      ${(medCard || medsHtml) ? `<div class="fam-card"><div class="fz-h">${pet ? '🐾 Tier & Gesundheit' : '🩺 Medizinisch'}</div>${medCard}${medsHtml}</div>` : ''}
      ${careCard ? `<div class="fam-card"><div class="fz-h">${pet ? '🏥 Tierarzt & Versicherung' : '🏥 Versicherung & Arzt'}</div>${careCard}</div>` : ''}
      ${p.notes ? `<div class="fam-card"><div class="fz-h">📝 Wichtige Hinweise</div><div class="text-sm" style="white-space:pre-wrap">${escapeHtml(p.notes)}</div></div>` : ''}
      ${p.updated ? `<p class="text-[11px] text-ink/40 text-center">Zuletzt geändert am ${escapeHtml(new Date(p.updated).toLocaleDateString('de-DE'))}${by ? ' von ' + escapeHtml(by) : ''}</p>` : ''}
    `}`;
}

/* ---------- Edit emergency pass ---------- */
function famOpenModal(html, onReady) {
  document.getElementById('famModalBody').innerHTML = html;
  document.getElementById('famModal').classList.remove('hidden');
  if (onReady) onReady(document.getElementById('famModalBody'));
  armModalSnapshot('famModal');
}
function famCloseModal() {
  document.getElementById('famModal').classList.add('hidden');
  document.getElementById('famModalBody').innerHTML = '';
  if (famPickMap) { famPickMap.destroy(); famPickMap = null; }
  famModalState = null;
}
function famOpenModal2(html, onReady) {
  document.getElementById('famModal2Body').innerHTML = html;
  document.getElementById('famModal2').classList.remove('hidden');
  if (onReady) onReady(document.getElementById('famModal2Body'));
  armModalSnapshot('famModal2');
}
function famCloseModal2() {
  document.getElementById('famModal2').classList.add('hidden');
  document.getElementById('famModal2Body').innerHTML = '';
}
function famVal(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
function famIn(id, label, value, attrs) {
  return `<div class="fz-field"><label class="fz-lbl" for="${id}">${escapeHtml(label)}</label><input id="${id}" class="fz-in" value="${famAttr(value || '')}" ${attrs || ''} /></div>`;
}
function famTa(id, label, value, ph) {
  return `<div class="fz-field"><label class="fz-lbl" for="${id}">${escapeHtml(label)}</label><textarea id="${id}" class="fz-in" rows="2" placeholder="${famAttr(ph || '')}">${escapeHtml(value || '')}</textarea></div>`;
}
function famListRowsHtml() {
  const st = famModalState;
  const meds = st.meds.map((x, i) => `<div class="fam-list-row">
      <input class="fz-in" data-medname="${i}" value="${famAttr(x.name || '')}" placeholder="Medikament" />
      <input class="fz-in" data-meddose="${i}" value="${famAttr(x.dose || '')}" placeholder="Dosis, z. B. 1-0-1" />
      <button type="button" class="fam-x" data-famrm="med" data-i="${i}" aria-label="Entfernen">×</button>
    </div>`).join('');
  const contacts = st.contacts.map((x, i) => `<div class="fam-contact-row">
      <div class="fam-list-row">
        <input class="fz-in" data-cname="${i}" value="${famAttr(x.name || '')}" placeholder="Name" />
        <input class="fz-in" data-crel="${i}" value="${famAttr(x.relation || '')}" placeholder="z. B. Oma, Nachbar" />
        <button type="button" class="fam-x" data-famrm="contact" data-i="${i}" aria-label="Entfernen">×</button>
      </div>
      <input class="fz-in mt-1" type="tel" inputmode="tel" data-cphone="${i}" value="${famAttr(x.phone || '')}" placeholder="Telefonnummer" />
    </div>`).join('');
  return { meds, contacts };
}
function famSyncLists() {
  const st = famModalState;
  if (!st) return;
  st.meds = st.meds.map((x, i) => ({
    name: (document.querySelector(`[data-medname="${i}"]`) || {}).value || '',
    dose: (document.querySelector(`[data-meddose="${i}"]`) || {}).value || '',
  }));
  st.contacts = st.contacts.map((x, i) => ({
    name: (document.querySelector(`[data-cname="${i}"]`) || {}).value || '',
    relation: (document.querySelector(`[data-crel="${i}"]`) || {}).value || '',
    phone: (document.querySelector(`[data-cphone="${i}"]`) || {}).value || '',
  }));
}
function famRenderLists() {
  const r = famListRowsHtml();
  const a = document.getElementById('famMedList'), b = document.getElementById('famContactList');
  if (a) a.innerHTML = r.meds || '<p class="text-xs text-ink/40">Keine Medikamente eingetragen.</p>';
  if (b) b.innerHTML = r.contacts || '<p class="text-xs text-ink/40">Noch keine Notfallkontakte.</p>';
}
function famOpenEdit(memberId) {
  const m = memberById(memberId);
  if (!m || !famCanEdit()) return;
  const p = famPass(memberId) || {};
  const pet = famIsPet(m);
  famModalState = {
    memberId,
    meds: (Array.isArray(p.meds) ? p.meds : []).map(x => ({ ...x })),
    contacts: (Array.isArray(p.contacts) ? p.contacts : []).map(x => ({ ...x })),
  };
  if (!famModalState.contacts.length) famModalState.contacts.push({ name: '', relation: '', phone: '' });
  const r = famListRowsHtml();
  const html = `
    <h3 class="font-serif text-lg mb-1">Notfallpass · ${escapeHtml(memberLabel(m))}</h3>
    <p class="text-xs text-ink/50 mb-4">Nur ausfüllen, was im Notfall helfen kann. Leere Felder werden nicht angezeigt.</p>
    <div class="fz-h">🆘 Notfallkontakte</div>
    ${famIn('famF_phone', pet ? 'Telefonnummer am Tracker (SIM)' : 'Eigene Handynummer', p.phone, 'type="tel" inputmode="tel" autocomplete="off" maxlength="40" placeholder="zum Anrufen aus dem SOS-Popup"')}
    <div id="famContactList" class="flex flex-col gap-2 mb-2">${r.contacts}</div>
    <button type="button" class="fz-mini-btn mb-4" data-famadd="contact">+ Kontakt</button>
    <div class="fz-h">${pet ? '🐾 Tier & Gesundheit' : '🩺 Medizinisch'}</div>
    ${pet ? `
      <div class="fz-grid2">${famIn('famF_species', 'Tierart / Rasse', p.species, 'placeholder="z. B. Labrador"')}${famIn('famF_birth', 'Geburtsdatum', p.birth, 'type="date"')}</div>
      <div class="fz-grid2">${famIn('famF_chip', 'Chipnummer', p.chip, 'inputmode="numeric"')}${famIn('famF_weight', 'Gewicht (kg)', p.weight, 'inputmode="decimal"')}</div>
    ` : `
      <div class="fz-grid2">${famIn('famF_birth', 'Geburtsdatum', p.birth, 'type="date"')}
        <div class="fz-field"><label class="fz-lbl" for="famF_blood">Blutgruppe</label><select id="famF_blood" class="fz-in">${FAM_BLOOD.map(b => `<option value="${b}"${(p.blood || '') === b ? ' selected' : ''}>${b || '– unbekannt –'}</option>`).join('')}</select></div>
      </div>
      <div class="fz-grid2">${famIn('famF_height', 'Größe (cm)', p.height, 'inputmode="numeric"')}${famIn('famF_weight', 'Gewicht (kg)', p.weight, 'inputmode="decimal"')}</div>
    `}
    ${famTa('famF_allergies', pet ? 'Allergien & Unverträglichkeiten' : 'Allergien', p.allergies, pet ? 'z. B. Huhn, Flohmittel' : 'z. B. Penicillin, Nüsse, Wespenstich')}
    ${famTa('famF_conditions', pet ? 'Erkrankungen' : 'Vorerkrankungen / Diagnosen', p.conditions, pet ? 'z. B. Epilepsie' : 'z. B. Asthma, Diabetes Typ 1, Herzschrittmacher')}
    <label class="fz-lbl">Medikamente</label>
    <div id="famMedList" class="flex flex-col gap-2 mb-2">${r.meds || '<p class="text-xs text-ink/40">Keine Medikamente eingetragen.</p>'}</div>
    <button type="button" class="fz-mini-btn mb-4" data-famadd="med">+ Medikament</button>
    ${famTa('famF_vaccinations', 'Impfungen', p.vaccinations, pet ? 'z. B. Tollwut bis 05/2027' : 'z. B. Tetanus zuletzt 2021')}
    ${pet ? '' : `
      <div class="fz-grid2">
        <div class="fz-field"><label class="fz-lbl" for="famF_organ">Organspende</label><select id="famF_organ" class="fz-in">
          ${[['', '– keine Angabe –'], ['ja', 'Ja'], ['nein', 'Nein'], ['teilweise', 'Teilweise']].map(([v, l]) => `<option value="${v}"${(p.organDonor || '') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select></div>
        ${famIn('famF_will', 'Patientenverfügung', p.livingWill, 'placeholder="z. B. Ordner im Flur"')}
      </div>`}
    <div class="fz-h mt-2">🏥 ${pet ? 'Tierarzt & Versicherung' : 'Versicherung & Arzt'}</div>
    ${pet ? `
      <div class="fz-grid2">${famIn('famF_vet', 'Tierarzt', p.vet)}${famIn('famF_vetPhone', 'Telefon Tierarzt', p.vetPhone, 'type="tel" inputmode="tel"')}</div>
      <div class="fz-grid2">${famIn('famF_insurance', 'Versicherung', p.insurance)}${famIn('famF_insuranceNo', 'Versicherungsnr.', p.insuranceNo)}</div>
    ` : `
      <div class="fz-grid2">${famIn('famF_insurance', 'Krankenkasse', p.insurance)}${famIn('famF_insuranceNo', 'Versichertennr.', p.insuranceNo)}</div>
      <div class="fz-grid2">${famIn('famF_doctor', 'Hausarzt', p.doctor)}${famIn('famF_doctorPhone', 'Telefon Hausarzt', p.doctorPhone, 'type="tel" inputmode="tel"')}</div>
    `}
    ${famTa('famF_notes', 'Wichtige Hinweise', p.notes, pet ? 'z. B. ängstlich bei Fremden, beißt bei Schmerzen' : 'z. B. Brillenträger, Notfallspray in der Jackentasche')}
    <div class="flex items-center justify-between gap-2 mt-4">
      ${famPass(memberId) ? '<button type="button" class="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50" data-famact="clearpass" aria-label="Notfallpass löschen">Leeren</button>' : '<span></span>'}
      <div class="flex gap-2">
        <button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-famact="cancel">Abbrechen</button>
        <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-famact="savepass">Speichern</button>
      </div>
    </div>`;
  famOpenModal(html);
}
function famSavePass() {
  const st = famModalState;
  if (!st) return;
  famSyncLists();
  const m = memberById(st.memberId);
  if (!m) { famCloseModal(); return; }
  const pet = famIsPet(m);
  const p = {
    phone: famVal('famF_phone'),
    birth: famVal('famF_birth'),
    weight: famVal('famF_weight'),
    allergies: famVal('famF_allergies'),
    conditions: famVal('famF_conditions'),
    vaccinations: famVal('famF_vaccinations'),
    insurance: famVal('famF_insurance'),
    insuranceNo: famVal('famF_insuranceNo'),
    notes: famVal('famF_notes'),
    meds: st.meds.map(x => ({ name: String(x.name || '').trim(), dose: String(x.dose || '').trim() })).filter(x => x.name || x.dose),
    contacts: st.contacts.map(x => ({ name: String(x.name || '').trim(), relation: String(x.relation || '').trim(), phone: String(x.phone || '').trim() })).filter(x => x.name || x.phone),
    updated: new Date().toISOString(),
    updatedBy: (currentUser() && currentUser().id) || '',
  };
  if (pet) Object.assign(p, { species: famVal('famF_species'), chip: famVal('famF_chip'), vet: famVal('famF_vet'), vetPhone: famVal('famF_vetPhone') });
  else Object.assign(p, { blood: famVal('famF_blood'), height: famVal('famF_height'), organDonor: famVal('famF_organ'), livingWill: famVal('famF_will'), doctor: famVal('famF_doctor'), doctorPhone: famVal('famF_doctorPhone') });
  Object.keys(p).forEach(k => { if (p[k] === '' || (Array.isArray(p[k]) && !p[k].length)) delete p[k]; });
  emergencyPasses = { ...famPasses(), [st.memberId]: p };
  persistState();
  famCloseModal();
  renderFamily();
  finShowToast('Notfallpass gespeichert');
}
function famClearPass() {
  const st = famModalState;
  if (!st || childLockActive()) return;
  if (!confirm('Den Notfallpass wirklich leeren?')) return;
  const next = { ...famPasses() };
  delete next[st.memberId];
  emergencyPasses = next;
  persistState();
  famCloseModal();
  renderFamily();
}

/* ---------- Setup: devices (admins) ---------- */
function famOpenSetup() {
  if (!isCurrentUserAdmin()) return;
  const devs = famDevices();
  const trackerWeg = devs.some(g => g.typ === 'tracker') && famStatus && famStatus.traccar && famStatus.traccar !== 'an';
  const ok = famStatus && !famStatusErr && !trackerWeg;
  const rows = devs.map(g => {
    const m = memberById(g.memberId);
    const p = g.position;
    return `<div class="fz-pick-row">
      <span class="fam-ava sm" style="--fam:${famAttr(famColor(m))}">${m ? famAvatarInner(m) : `<span class="fam-ava-in">${escapeHtml(g.emoji || '📍')}</span>`}</span>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHtml(famDeviceName(g))} <span class="text-ink/45 font-normal">· ${g.typ === 'tracker' ? '🛰️ GPS-Tracker' : '📱 Handy'}</span></div>
        <div class="text-[11px] text-ink/50 truncate">ID ${escapeHtml(g.uniqueId || '')} · ${!g.teilen ? 'Teilen aus' : p ? 'zuletzt ' + escapeHtml(famAgo(p.zeit)) : 'noch kein Standort'}</div>
      </div>
      <button type="button" class="fz-mini-btn" data-famact="guide" data-id="${famAttr(g.id)}">Anleitung</button>
      <button type="button" class="fam-x" data-famact="deldevice" data-id="${famAttr(g.id)}" aria-label="Gerät löschen">×</button>
    </div>`;
  }).join('');
  famOpenModal(`
    <h3 class="font-serif text-lg mb-1">Ortung einrichten</h3>
    <p class="text-xs text-ink/50 mb-3">Handys brauchen nichts weiter: Jeder kann unter „Mein Standort“ direkt in pinn. teilen. Im Hintergrund (pinn. geschlossen) sendet das Handy mit der kostenlosen App „Traccar Client“ (iPhone und Android) – direkt an pinn., ein Traccar-Server ist dafür nicht nötig. Nur GPS-Tracker mit SIM-Karte (z. B. am Halsband) brauchen den Container „traccar“. Die Standorte bleiben auf eurem NAS.</p>
    <div class="fz-note-box ${ok ? 'ok' : 'warn'} mb-4"><span>${ok ? '✅' : '⚠️'}</span><span class="text-xs">${ok ? 'Ortung bereit – Handys senden direkt an pinn.' : escapeHtml(famStatusErr || (famStatus && famStatus.fehler) || 'GPS-Tracker brauchen den Container „traccar“.')}</span></div>
    <div class="fz-h">Geräte</div>
    <div class="flex flex-col gap-2 mb-3">${rows || '<p class="text-xs text-ink/40">Noch keine Geräte.</p>'}</div>
    <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-famact="adddevice">+ Gerät hinzufügen</button>
    ${devs.length ? `
    <div class="fz-h mt-5">🆘 SOS</div>
    <p class="text-xs text-ink/50 mb-2">Test: gleicher Ablauf wie ein echter Hilferuf (Push, Popup, Karte, Adresse) – aber nur an dich, die Familie merkt nichts.</p>
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <select id="famSosTestDev" class="fam-sel">${devs.map(g => `<option value="${famAttr(g.id)}">${escapeHtml(famDeviceName(g))}</option>`).join('')}</select>
      <button type="button" class="fz-mini-btn primary" data-famact="sostest">🆘 SOS-Test an mich</button>
    </div>
    <details id="famLogBox" class="fz-tool">
      <summary class="text-sm font-medium py-1">Letzte Meldungen der Handys</summary>
      <p class="text-[11px] text-ink/45 mt-1">Zeigt, was „Traccar Client“ an pinn. schickt. Nach dem Drücken auf SOS muss hier „🆘 erkannt“ stehen.</p>
      <div id="famLogList" class="flex flex-col gap-1.5 mt-2 text-xs"></div>
      <button type="button" class="fz-mini-btn mt-2" data-famact="reloadlog">↻ Aktualisieren</button>
    </details>` : ''}
    <details class="fz-tool mt-5">
      <summary class="text-sm font-medium py-1">Server-Daten</summary>
      <div class="text-xs text-ink/60 mt-2 leading-relaxed">
        <div class="mb-1">Handys (Traccar Client, sendet direkt an pinn.):</div>
        <div class="fam-copy"><code>${escapeHtml(famOsmandUrl())}</code><button type="button" class="fz-mini-btn" data-famcopy="${famAttr(famOsmandUrl())}">Kopieren</button></div>
        <div class="mt-3 mb-1">GPS-Tracker (nur mit Container „traccar“): Adresse eures Internet-Anschlusses und Port je Protokoll – GT06 5023 · H02 5013 · Watch 5093 · Teltonika 5027 (Geräte-ID = IMEI).</div>
      </div>
    </details>
    <div class="flex justify-end mt-4"><button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-famact="cancel">Schließen</button></div>`);
}
// SOS test (only to me) and log of the latest alerts
async function famSosTest(btn) {
  const sel = document.getElementById('famSosTestDev');
  if (btn) btn.disabled = true;
  try {
    const r = await postJson('/api/pinn/ortung/sos-test', { geraet: sel ? sel.value : '' });
    finShowToast(r.push ? 'SOS-Test gesendet' : 'SOS-Test angelegt – Push ist auf diesem Profil nicht aktiviert');
    famCloseModal();
    sosStarted = true;
    sosOpen(r.id);
  } catch (e) {
    finShowToast(e.message || 'SOS-Test nicht möglich', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}
async function famLoadOsmandLog() {
  const box = document.getElementById('famLogList');
  if (!box) return;
  box.innerHTML = '<span class="text-ink/40">lädt …</span>';
  try {
    const res = await apiFetch('/api/pinn/ortung/protokoll', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) { box.innerHTML = '<span class="text-red-600">Server noch ohne diese Funktion – pinn-ortung.js und ortung.pb.js einspielen und pocketbase neu starten.</span>'; return; }
    if (!res.ok) throw new Error(body.error || 'nicht abrufbar');
    const list = Array.isArray(body.meldungen) ? body.meldungen : [];
    if (!list.length) { box.innerHTML = '<span class="text-ink/45">Seit dem letzten Neustart von pinn. kam noch keine Meldung aus „Traccar Client“ an. Bitte Server-URL und Geräte-ID aus der Anleitung prüfen und in der App den Dienst einschalten.</span>'; return; }
    box.innerHTML = list.map(x => {
      const t = new Date(x.zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const tag = x.sos ? (x.fehler ? '<span class="text-red-600 font-semibold">🆘 erkannt, Fehler</span>' : '<span class="text-red-600 font-semibold">🆘 erkannt</span>') : (x.alarm ? '<span class="text-mustard font-semibold">Alarm ohne SOS</span>' : '<span class="text-ink/45">Standort</span>');
      return `<div class="fz-note-box ${x.sos ? 'urgent' : ''}" style="padding:6px 9px"><span class="flex-1 min-w-0">
        <span class="font-medium">${escapeHtml(t)}</span> · ${escapeHtml(x.name || x.uid || 'unbekannt')} · ${tag}${x.status ? ' · Antwort ' + escapeHtml(String(x.status)) : ''}
        ${x.alarm ? `<span class="block text-ink/55">${escapeHtml(x.alarm)}</span>` : ''}
        ${x.fehler ? `<span class="block text-red-600">${escapeHtml(x.fehler)}</span>` : ''}
        <span class="block text-ink/40 break-all">Felder: ${escapeHtml(x.felder || '–')}</span>
      </span></div>`;
    }).join('');
  } catch (e) {
    box.innerHTML = `<span class="text-red-600">${escapeHtml(e.message || 'Fehler')}</span>`;
  }
}
document.addEventListener('toggle', (e) => {
  if (e.target && e.target.id === 'famLogBox' && e.target.open) famLoadOsmandLog();
}, true);
function famOpenDeviceForm(preset) {
  const used = new Set(famDevices().map(g => g.memberId + '|' + g.typ));
  const typ = (preset && preset.typ) || 'handy';
  const free = members.filter(m => !used.has(m.id + '|' + typ));
  const mid = (preset && preset.memberId) || (free[0] && free[0].id) || (members[0] && members[0].id) || '';
  famOpenModal2(`
    <h3 class="font-serif text-lg mb-3">Gerät hinzufügen</h3>
    <div class="fz-field"><label class="fz-lbl" for="famD_member">Wer wird geortet?</label>
      <select id="famD_member" class="fz-in">${members.map(m => `<option value="${famAttr(m.id)}"${m.id === mid ? ' selected' : ''}>${escapeHtml((m.avatar ? m.avatar + ' ' : '') + memberLabel(m))}</option>`).join('')}</select></div>
    <label class="fz-lbl">Gerät</label>
    <div class="fz-grid2 mb-3">
      <button type="button" class="fz-kind-btn py-2 text-sm${typ === 'handy' ? ' active' : ''}" data-famtyp="handy">📱 Handy<br><span class="text-[11px] text-ink/50">pinn. bzw. „Traccar Client“</span></button>
      <button type="button" class="fz-kind-btn py-2 text-sm${typ === 'tracker' ? ' active' : ''}" data-famtyp="tracker">🛰️ GPS-Tracker<br><span class="text-[11px] text-ink/50">SIM-Karte · Container „traccar“</span></button>
    </div>
    <div class="fz-field"><label class="fz-lbl" for="famD_uid">${typ === 'tracker' ? 'Geräte-ID (IMEI des Trackers)' : 'Geräte-ID (wird in der App eingetragen)'}</label>
      <div class="flex gap-2"><input id="famD_uid" class="fz-in" value="${famAttr(typ === 'handy' ? famNewUniqueId() : '')}" ${typ === 'tracker' ? 'inputmode="numeric" placeholder="15-stellige IMEI"' : ''} autocapitalize="off" autocorrect="off" spellcheck="false" />
      ${typ === 'handy' ? '<button type="button" class="fz-mini-btn" data-famact="newuid" aria-label="Neue ID">↻</button>' : ''}</div>
      <p class="text-[11px] text-ink/45 mt-1">${typ === 'tracker' ? 'Die IMEI steht auf dem Tracker, der Verpackung oder kommt per SMS-Befehl.' : 'Die ID ist zufällig – sie verbindet das Handy mit dieser Person.'}</p></div>
    <p id="famD_err" class="text-xs text-red-600 mb-2 hidden"></p>
    <div class="flex justify-end gap-2 mt-2">
      <button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-famact="cancel2">Abbrechen</button>
      <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-famact="savedevice" data-typ="${typ}">Hinzufügen</button>
    </div>`);
}
async function famSaveDevice(btn) {
  const memberId = famVal('famD_member');
  const m = memberById(memberId);
  const err = document.getElementById('famD_err');
  const typ = btn.dataset.typ === 'tracker' ? 'tracker' : 'handy';
  btn.disabled = true;
  try {
    const r = await famPost('geraet', { memberId, name: m ? memberLabel(m) : 'Gerät', emoji: (m && m.avatar) || '', typ, uniqueId: famVal('famD_uid') });
    famCloseModal2();
    await famLoadStatus();
    famOpenSetup();
    finShowToast('Gerät hinzugefügt');
    if (r && r.id) famOpenGuide(r.id);
  } catch (e) {
    if (err) { err.textContent = e.message; err.classList.remove('hidden'); }
  } finally {
    btn.disabled = false;
  }
}
async function famDeleteDevice(id) {
  const g = famDevice(id);
  if (!g || childLockActive()) return;
  if (!confirm(`Gerät von ${famDeviceName(g)} entfernen? Die Person wird danach nicht mehr geortet.`)) return;
  try {
    await famPost('geraet-loeschen', { id });
    await famLoadStatus();
    famOpenSetup();
  } catch (e) { finShowToast(e.message, true); }
}
function famOpenGuide(id) {
  const g = famDevice(id);
  if (!g) return;
  const uid = g.uniqueId || '';
  const url = famOsmandUrl();
  const copy = (v) => `<div class="fam-copy"><code>${escapeHtml(v)}</code><button type="button" class="fz-mini-btn" data-famcopy="${famAttr(v)}">Kopieren</button></div>`;
  const last = g.position ? 'Letzter Standort empfangen: ' + famAgo(g.position.zeit) : 'Von diesem Gerät kam noch kein Standort.';
  const body = g.typ === 'tracker' ? `
    <p class="text-xs text-ink/60 mb-3">Der Tracker sendet über seine SIM-Karte direkt an Traccar auf eurem NAS – dafür muss der Container „traccar“ laufen (für Handys ist er nicht nötig).</p>
    <ol class="fam-steps">
      <li>SIM-Karte mit mobilen Daten einlegen und den Tracker einschalten.</li>
      <li>Als Server die Adresse eures Internet-Anschlusses eintragen (z. B. eure MyFRITZ!-Adresse) – meist per SMS-Befehl laut Anleitung des Trackers.</li>
      <li>Port je nach Protokoll des Trackers: <b>GT06 5023</b>, H02 5013, Watch 5093, Teltonika 5027. Dieser Port muss in der FRITZ!Box auf das NAS freigegeben sein, weil der Tracker aus dem Mobilfunknetz kommt.</li>
      <li>Geräte-ID (IMEI) in pinn.:${copy(uid)}</li>
      <li>Sendeintervall z. B. auf 60 Sekunden stellen.</li>
    </ol>
    <div class="fz-note-box urgent mt-3"><span>🆘</span><span class="text-xs">Hat der Tracker einen SOS-Knopf, alarmiert pinn. die ganze Familie per Push (innerhalb einer Minute), sobald Traccar den Alarm des Trackers erkennt.</span></div>` : `
    <p class="text-xs text-ink/60 mb-2">Ohne weitere App geht „📍 Standort teilen“ direkt in pinn. – dann aber nur, solange pinn. offen ist. Damit der Standort auch bei geschlossenem pinn. und gesperrtem Bildschirm kommt, sendet die kostenlose App „Traccar Client“ ihn direkt an pinn. (ein Traccar-Server ist nicht nötig). Gilt für iPhone und Android gleich.</p>
    <ol class="fam-steps">
      <li>App <b>„Traccar Client“</b> installieren (App Store bzw. Google Play, kostenlos).</li>
      <li>In der App bei <b>Geräte-ID</b> (Device identifier) eintragen:${copy(uid)}</li>
      <li>Bei <b>Server-URL</b> eintragen:${copy(url)}</li>
      <li>Genauigkeit <b>Mittel</b>, Distanz <b>50 m</b>. Die App sendet dann nur, wenn du dich bewegst – im Stehen nichts. Gibt es bei dir weitere Felder (Intervall, Heartbeat), Heartbeat aus bzw. 0.</li>
      <li>Standortzugriff erlauben: <b>Immer</b> und <b>Genauer Standort</b> an.<br><span class="text-ink/50">iPhone: Einstellungen → Traccar Client → Standort → Immer. Android: Standort → „Immer zulassen“, zusätzlich Akku → „Nicht eingeschränkt“.</span></li>
      <li>Den Schalter <b>Dienst / Tracking</b> einschalten und <b>immer an lassen</b> – fertig. Ab jetzt steuerst du alles in pinn.: „Dauerhaft senden“ an oder aus, „Einmalig senden“ und SOS. Solange „Dauerhaft senden“ aus ist, sieht niemand deinen Standort und pinn. zeichnet keinen Weg auf.</li>
    </ol>
    <p class="text-[11px] text-ink/45 mt-2">Das Handy muss pinn. unter dieser Adresse erreichen – unterwegs also genauso verbunden sein wie für die pinn.-App selbst.</p>
    <div class="fz-note-box urgent mt-3"><span>🆘</span><span class="text-xs"><b>SOS:</b> In „Traccar Client“ „SOS senden“ wählen (je nach Version in der App oder lange auf das App-Symbol drücken). pinn. alarmiert sofort alle Familienmitglieder per Push – mit Standort, Adresse, Uhrzeit und Knöpfen für Anruf und Notruf ${escapeHtml(regionNotrufText())}. Tipp: die eigene Handynummer im Notfallpass eintragen.</span></div>`;
  famOpenModal2(`
    <h3 class="font-serif text-lg mb-1">Einrichtung · ${escapeHtml(famDeviceName(g))}</h3>
    <div class="fz-note-box ${g.position ? 'ok' : ''} mb-3"><span>${g.position ? '✅' : '⏳'}</span><span class="text-xs">${escapeHtml(last)}</span></div>
    ${body}
    <div class="flex justify-end mt-4"><button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-famact="cancel2">Fertig</button></div>`);
}

/* ---------- Places ---------- */
function famOpenPlaces() {
  if (!famCanEdit()) return;
  ladenCacheFromStatus(famStatus);
  const shopAll = famPlaces().filter(o => o.laden);
  const shopRows = shopAll.map(o => {
    const list = getShoppingList(o.laden);
    const sib = shopAll.filter(x => x.laden === o.laden);
    const fil = sib.length > 1 ? ` <span class="text-[11px] text-ink/45 font-normal">· Filiale ${sib.indexOf(o) + 1}/${sib.length}</span>` : '';
    return `<button type="button" class="fz-pick-row" data-famplace="${famAttr(o.id)}">
      ${list ? shoppingListLogoHtml(list, 30) : '<span class="text-2xl leading-none">🛒</span>'}
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHtml(o.name)}${fil}${list ? '' : ' <span class="text-[11px] text-red-600 font-normal">· Liste gelöscht</span>'}</div>
        <div class="text-[11px] text-ink/50 truncate">${escapeHtml(o.adresse || 'Lage auf der Karte festgelegt')}</div>
        <div class="text-[11px] text-ink/50">${o.abhaken === false ? 'nicht automatisch abhaken' : 'abhaken nach ' + (Number(o.verweil) || 10) + ' Min.'}${o.erinnern === false ? '' : ' · Erinnerung'}${o.ankunft ? ' · Push bei Ankunft' : ''}</div>
      </div>
      <span class="text-ink/30">›</span>
    </button>`;
  }).join('');
  const rows = famPlaces().filter(o => !o.laden).map(o => `<button type="button" class="fz-pick-row" data-famplace="${famAttr(o.id)}">
      <span class="text-2xl leading-none">${escapeHtml(o.emoji || '📍')}</span>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHtml(o.name)}${o.zuhause ? ' <span class="text-[11px] text-ink/45 font-normal">· Zuhause</span>' : ''}</div>
        <div class="text-[11px] text-ink/50">${Math.round(o.radius)} m · ${[o.ankunft ? 'Ankunft' : '', o.verlassen ? 'Verlassen' : ''].filter(Boolean).join(' & ') || 'keine Meldung'}</div>
      </div>
      <span class="text-ink/30">›</span>
    </button>`).join('');
  famOpenModal(`
    <h3 class="font-serif text-lg mb-1">Bekannte Orte</h3>
    <p class="text-xs text-ink/50 mb-3">Kommt jemand an oder verlässt einen Ort, gibt es eine Push-Nachricht. „Zuhause“ beendet außerdem „Ich bin unterwegs“.</p>
    ${famStatus && famStatus.zuhause ? '' : '<div class="fz-note-box mb-3"><span>🏠</span><span class="text-xs">Tipp: Unter Einstellungen → Zuhause eure Adresse festlegen – dann gibt es den Ort „Zuhause“ automatisch, mit Push bei Ankunft und Verlassen.</span></div>'}
    <div class="flex flex-col gap-2 mb-3">${rows || '<p class="text-xs text-ink/40">Noch keine Orte.</p>'}</div>
    <div class="fz-lbl mt-4">🛒 Läden</div>
    <div class="flex flex-col gap-2 mb-2">${shopRows || '<p class="text-xs text-ink/40">Noch keine Läden mit Adresse.</p>'}</div>
    <p class="text-[11px] text-ink/45 mb-3">Adressen für Läden gibst du unter Listen → Einkaufsliste bearbeiten an – gibt es einen Laden mehrmals, auch mehrere Filialen. Bleibt jemand dort eine Weile, wird der geplante Einkauf abgehakt.</p>
    <div class="flex justify-between gap-2">
      <button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-famact="cancel">Schließen</button>
      <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-famact="addplace">+ Ort</button>
    </div>`);
}
function famOpenPlaceEdit(id) {
  const o = id ? famPlace(id) : null;
  const home = famHome();
  const auto = !!(o && o.auto); // Place "Home" from Settings → Home: its position is fixed
  const homeFixed = !!(famStatus && famStatus.zuhause);
  const center = o ? [o.lat, o.lon] : home ? [home.lat, home.lon] : (() => {
    const g = famMyDevice();
    return g && g.position ? [g.position.lat, g.position.lon] : null;
  })();
  const shop = !!(o && o.laden);
  const shopList = shop ? getShoppingList(o.laden) : null;
  famModalState = {
    placeId: o ? o.id : '',
    laden: shop ? o.laden : '',
    adresse: shop ? (o.adresse || '') : '',
    emoji: o ? o.emoji : (home || homeFixed ? '🏫' : '🏠'),
    lat: o ? o.lat : null, lon: o ? o.lon : null,
    geraete: o && Array.isArray(o.geraete) ? o.geraete.slice() : [],
    empfaenger: o && Array.isArray(o.empfaenger) ? o.empfaenger.slice() : [],
  };
  const devs = famDevices();
  const profs = familyProfiles.filter(p => p.rolle !== 'gast');
  const profLabel = (p) => { const m = p.mitglied ? memberById(p.mitglied) : null; return m ? memberLabel(m) : p.username; };
  famOpenModal(`
    <button type="button" class="text-sm text-ink/55 hover:text-pine mb-2" data-famact="places">‹ Orte</button>
    <h3 class="font-serif text-lg mb-3">${shop ? 'Laden bearbeiten' : o ? 'Ort bearbeiten' : 'Neuer Ort'}</h3>
    ${shop ? `<div class="flex items-center gap-2.5 mb-3">${shopList ? shoppingListLogoHtml(shopList, 36) : '<span class="text-2xl">🛒</span>'}<div class="min-w-0"><div class="text-sm font-medium truncate">${escapeHtml(o.name)}</div><div class="text-[11px] text-ink/45">Name kommt von der Einkaufsliste${o.adresse ? ' · ' + escapeHtml(o.adresse) : ''}</div></div></div>
    <input id="famP_name" type="hidden" value="${famAttr(o.name)}" />` : `${famIn('famP_name', 'Name', o ? o.name : (home || homeFixed ? '' : 'Zuhause'), 'placeholder="z. B. Schule, Oma, Hundewiese"')}
    <div class="fam-emoji-row mb-3">${FAM_PLACE_EMOJIS.map(e => `<button type="button" class="fam-emoji${famModalState.emoji === e ? ' active' : ''}" data-famemoji="${e}">${e}</button>`).join('')}</div>`}
    ${auto ? `<div class="fz-note-box ok mb-2"><span>🏠</span><span class="text-xs">${escapeHtml((famStatus.zuhause && famStatus.zuhause.adresse) || 'Adresse aus den Einstellungen')}<br><span class="text-ink/50">Die Lage kommt aus Einstellungen → Zuhause.</span></span></div>
    <div class="fam-pick-slot mb-3"><div id="famP_map" class="fam-pick-map"></div></div>` : `<label class="fz-lbl" for="famP_search">Adresse suchen oder auf die Karte tippen</label>
    <div class="flex gap-2 mb-2"><input id="famP_search" class="fz-in" type="search" placeholder="Straße, Ort" enterkeyhint="search" /><button type="button" class="fz-mini-btn" data-famact="placesearch">Suchen</button></div>
    <div id="famP_results" class="flex flex-col gap-1 mb-2"></div>
    <div class="fam-pick-slot mb-2"><div id="famP_map" class="fam-pick-map"></div></div>
    <div class="flex flex-wrap gap-2 mb-3">
      <button type="button" class="fz-mini-btn" data-famact="placehere">📍 Meine Position</button>
      ${devs.filter(g => g.teilen && g.position).map(g => `<button type="button" class="fz-mini-btn" data-famact="placedev" data-id="${famAttr(g.id)}">👤 ${escapeHtml(famDeviceName(g))}</button>`).join('')}
    </div>`}
    <div class="fz-field"><label class="fz-lbl" for="famP_radius">Umkreis: <span id="famP_rlabel">${o ? Math.round(o.radius) : 150}</span> m</label>
      <input id="famP_radius" type="range" min="50" max="1000" step="10" value="${o ? Math.round(o.radius) : 150}" class="w-full" style="accent-color: var(--c-pine)" /></div>
    ${shop ? `<label class="fz-lbl" for="famP_stay">Einkauf abhaken nach</label>
    <select id="famP_stay" class="fz-in mb-3">${[5, 10, 15, 20, 30, 45, 60].map(n => `<option value="${n}"${(Number(o.verweil) || 10) === n ? ' selected' : ''}>${n} Minuten vor Ort${n === 10 ? ' (Standard)' : ''}</option>`).join('')}</select>
    <label class="fz-check"><input type="checkbox" id="famP_done"${o.abhaken === false ? '' : ' checked'} /><span>Geplanten Einkauf automatisch abhaken</span></label>
    <label class="fz-check"><input type="checkbox" id="famP_donepush"${o.erledigtPush === false ? '' : ' checked'} /><span>Push „Betrag eintragen“, wenn abgehakt</span></label>
    <label class="fz-check"><input type="checkbox" id="famP_remind"${o.erinnern === false ? '' : ' checked'} /><span>Beim Ankommen an die Einkaufsliste erinnern</span></label>
    ${famPlaces().filter(x => x.laden === o.laden).length > 1 ? '<p class="text-[11px] text-ink/45 -mt-1 mb-3">Abhaken, Push und Erinnerung gelten für alle Filialen dieses Ladens; Umkreis und Benachrichtigungen je Filiale.</p>' : ''}` : ''}
    ${homeFixed || shop ? '' : `<label class="fz-check"><input type="checkbox" id="famP_home"${o ? (o.zuhause ? ' checked' : '') : (!home ? ' checked' : '')} /><span>Das ist unser Zuhause<span class="block text-[11px] text-ink/45">Beendet „Ich bin unterwegs“ beim Ankommen.</span></span></label>`}
    <label class="fz-check"><input type="checkbox" id="famP_in"${!o || o.ankunft ? ' checked' : ''} /><span>${shop ? 'Familie bei Ankunft benachrichtigen' : 'Push bei Ankunft'}</span></label>
    <label class="fz-check"><input type="checkbox" id="famP_out"${o && o.verlassen ? ' checked' : ''} /><span>Push beim Verlassen</span></label>
    ${devs.length ? `<label class="fz-lbl mt-2">Für wen? <span class="normal-case text-ink/40">(nichts gewählt = alle)</span></label>
      <div class="flex flex-wrap gap-1.5 mb-3">${devs.map(g => `<button type="button" class="fz-filter-chip${famModalState.geraete.includes(g.id) ? ' active' : ''}" data-famdev="${famAttr(g.id)}">${escapeHtml(famDeviceName(g))}</button>`).join('')}</div>` : ''}
    ${profs.length ? `<label class="fz-lbl">Wer bekommt die Nachricht? <span class="normal-case text-ink/40">(nichts gewählt = alle)</span></label>
      <div class="flex flex-wrap gap-1.5 mb-3">${profs.map(p => `<button type="button" class="fz-filter-chip${famModalState.empfaenger.includes(p.id) ? ' active' : ''}" data-famrcpt="${famAttr(p.id)}">${escapeHtml(profLabel(p))}</button>`).join('')}</div>
      <p class="text-[11px] text-ink/45 -mt-2 mb-3">Die Person selbst bekommt keine Meldung über sich.</p>` : ''}
    <p id="famP_err" class="text-xs text-red-600 mb-2 hidden"></p>
    <div class="flex items-center justify-between gap-2 mt-3">
      ${o && !auto ? `<button type="button" class="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50" data-famact="delplace" aria-label="Ort löschen">Löschen</button>` : '<span></span>'}
      <div class="flex gap-2">
        <button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-famact="places">Abbrechen</button>
        <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-famact="saveplace">Speichern</button>
      </div>
    </div>`, () => {
    const host = document.getElementById('famP_map');
    famPickMap = famCreateMap(host, { onTap: (lat, lon) => { if (!auto) { famSetPick(lat, lon, false); if (famModalState && famModalState.laden) famModalState.adresse = ''; } } });
    requestAnimationFrame(() => {
      if (!famPickMap) return;
      if (famModalState.lat != null) famSetPick(famModalState.lat, famModalState.lon, true);
      else if (center) famPickMap.setView(center[0], center[1], 15);
      else famPickMap.setView(51.1657, 10.4515, 6);
    });
    const r = document.getElementById('famP_radius');
    r.addEventListener('input', () => { document.getElementById('famP_rlabel').textContent = r.value; famDrawPick(); });
    const searchEl = document.getElementById('famP_search');
    if (searchEl) searchEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); famPlaceSearch(); } });
  });
}
function famDrawPick() {
  if (!famPickMap || !famModalState || famModalState.lat == null) return;
  const r = Number((document.getElementById('famP_radius') || {}).value) || 150;
  famPickMap.setCircles([{ lat: famModalState.lat, lon: famModalState.lon, r, color: '#00374A' }]);
  famPickMap.setMarkers([{ lat: famModalState.lat, lon: famModalState.lon, html: `<div class="fm-pick">${escapeHtml(famModalState.emoji || '📍')}</div>` }]);
}
function famSetPick(lat, lon, recenter) {
  if (!famModalState) return;
  famModalState.lat = Math.round(lat * 1e6) / 1e6;
  famModalState.lon = Math.round(lon * 1e6) / 1e6;
  if (recenter && famPickMap) famPickMap.setView(lat, lon, Math.max(famPickMap.zoom(), 16));
  famDrawPick();
}
async function famPlaceSearch() {
  const q = famVal('famP_search');
  const box = document.getElementById('famP_results');
  if (!q || !box) return;
  box.innerHTML = '<p class="text-xs text-ink/40">Suche …</p>';
  try {
    const res = await apiFetch('/api/pinn/ortung/suche?q=' + encodeURIComponent(q));
    const body = await res.json().catch(() => ({}));
    const list = Array.isArray(body.treffer) ? body.treffer : [];
    box.innerHTML = list.length
      ? list.map(t => `<button type="button" class="fz-pick-row text-xs" data-famhit="${t.lat},${t.lon}" data-famhitname="${famAttr(t.name)}">📍 <span class="min-w-0 flex-1 truncate">${escapeHtml(t.name)}</span></button>`).join('')
      : `<p class="text-xs text-ink/40">${escapeHtml(body.error || 'Nichts gefunden.')}</p>`;
  } catch (e) {
    box.innerHTML = '<p class="text-xs text-red-600">Suche nicht möglich – keine Verbindung.</p>';
  }
}
async function famSavePlace(btn) {
  const st = famModalState;
  const err = document.getElementById('famP_err');
  if (!st) return;
  if (st.lat == null) { err.textContent = 'Bitte den Ort auf der Karte antippen oder eine Adresse suchen.'; err.classList.remove('hidden'); return; }
  btn.disabled = true;
  try {
    const ort = {
      id: st.placeId, name: famVal('famP_name'), emoji: st.emoji, lat: st.lat, lon: st.lon,
      radius: Number(famVal('famP_radius')) || 150,
      zuhause: !!(document.getElementById('famP_home') || {}).checked,
      ankunft: !!(document.getElementById('famP_in') || {}).checked,
      verlassen: !!(document.getElementById('famP_out') || {}).checked,
      geraete: st.geraete, empfaenger: st.empfaenger,
    };
    if (st.laden) {
      Object.assign(ort, {
        laden: st.laden, adresse: st.adresse || '', zuhause: false,
        verweil: Number(famVal('famP_stay')) || 10,
        abhaken: !!(document.getElementById('famP_done') || {}).checked,
        erledigtPush: !!(document.getElementById('famP_donepush') || {}).checked,
        erinnern: !!(document.getElementById('famP_remind') || {}).checked,
      });
    }
    await famPost('ort', { ort });
    await famLoadStatus();
    ladenCacheFromStatus(famStatus);
    famOpenPlaces();
    finShowToast(st.laden ? 'Laden gespeichert' : 'Ort gespeichert');
  } catch (e) {
    err.textContent = e.message; err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}
async function famDeletePlace() {
  const st = famModalState;
  if (!st || !st.placeId || childLockActive()) return;
  const o = famPlace(st.placeId);
  if (!confirm(o && o.laden && o.adresse ? `Filiale „${o.name}“ (${o.adresse}) löschen?` : `Ort „${o ? o.name : ''}“ löschen?`)) return;
  try {
    await famPost('ort-loeschen', { id: st.placeId });
    await famLoadStatus();
    ladenCacheFromStatus(famStatus);
    famOpenPlaces();
  } catch (e) { finShowToast(e.message, true); }
}

/* ---------- Actions ---------- */
async function famSetSharing(id, on, input) {
  try {
    if (input) input.disabled = true;
    await famPost('teilen', { id, an: !!on });
    await famLoadStatus();
    finShowToast(on ? 'Standort wird geteilt' : 'Standort wird nicht mehr geteilt');
  } catch (e) {
    if (input) input.checked = !on;
    finShowToast(e.message, true);
  } finally {
    if (input) input.disabled = false;
  }
}
/* ---------- Share location (directly from pinn., no other app) ----------
   - Once: on tap pinn. asks for the location once and sends it to the server.
   - Selectable duration (30 min. … 24 h, until I am home, until I stop it); the server ends
     the share by itself. Push to the family is optional – for SOS it is always sent.
   - Live: as long as pinn. is open and the share is running, pinn. sends new locations along
     (only on movement of 50 m or more, at most about once a minute – nothing while standing still). It never
     asks for the location on its own: only if it is already allowed or was shared by the user in this session.
   - If the location currently comes from "Traccar Client", pinn. sends nothing extra (saves battery). */
var famShareMin = 0;    // chosen duration in minutes, -1 = until I am home, 0 = until I stop it
function famSharePushPref() { try { return localStorage.getItem('pinn.teilenPush') !== '0'; } catch (e) { return true; } }
function famPosPayload(p) {
  const c = p.coords;
  const out = { lat: c.latitude, lon: c.longitude, genau: Math.round(c.accuracy || 0) || null };
  if (c.speed != null && isFinite(c.speed) && c.speed >= 0) out.tempo = Math.round(c.speed * 3.6);
  if (c.heading != null && isFinite(c.heading) && c.heading >= 0) out.kurs = Math.round(c.heading);
  return out;
}
function famGetPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(famPosPayload(p)),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}
function famOpenShare() {
  const home = !!famHome();
  const g = famMyPhone();
  if (g && g.teilen) famShareMin = g.endeZuhause ? -1 : (g.bis ? famShareMin : 0);
  if (famShareMin === -1 && !home) famShareMin = 60;
  const opts = [[30, '30 Min.'], [60, '1 Std.'], [240, '4 Std.'], [480, '8 Std.'], [1440, '24 Std.']];
  if (home) opts.push([-1, '🏠 Bis ich zu Hause bin']);
  opts.push([0, '∞ Bis ich es beende']);
  famOpenModal(`
    <h3 class="font-serif text-lg mb-1">📍 Dauerhaft senden</h3>
    <p class="text-xs text-ink/50 mb-3">Deine Familie sieht dich live auf der Karte. Gesendet wird nur, wenn du dich bewegst – im Stehen nichts. Ist pinn. geschlossen, sendet die einmal eingerichtete App „Traccar Client“.</p>
    <label class="fz-lbl">Wie lange?</label>
    <div class="flex flex-wrap gap-2 mb-3">${opts.map(([v, l]) => `<button type="button" class="fz-filter-chip px-3 py-1.5 text-sm${famShareMin === v ? ' active' : ''}" data-famact="sharedur" data-min="${v}">${escapeHtml(l)}</button>`).join('')}</div>
    <label class="fz-check"><input type="checkbox" id="famSharePush"${famSharePushPref() ? ' checked' : ''} /><span>Familie per Push benachrichtigen<span class="block text-[11px] text-ink/45">Bei einem Notfall (SOS) bekommt die Familie immer eine Push-Nachricht.</span></span></label>
    <p id="famShareErr" class="text-xs text-red-600 mb-2 hidden"></p>
    <div class="flex justify-end gap-2 mt-3">
      <button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-famact="cancel">Abbrechen</button>
      <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-famact="sharego">📍 Senden starten</button>
    </div>`);
}
function famShareDur(btn) {
  famShareMin = Number(btn.dataset.min) || 0;
  btn.parentElement.querySelectorAll('[data-famact="sharedur"]').forEach(b => b.classList.toggle('active', b === btn));
}
async function famShareGo(btn) {
  const pushEl = document.getElementById('famSharePush');
  const push = !!(pushEl && pushEl.checked);
  const err = document.getElementById('famShareErr');
  try { localStorage.setItem('pinn.teilenPush', push ? '1' : '0'); } catch (e) { /* ignore */ }
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Standort wird ermittelt …';
  try {
    const pos = await famGetPosition();
    const r = await famPost('standort-teilen', Object.assign({ an: true, minuten: famShareMin > 0 ? famShareMin : 0, zuhause: famShareMin === -1, push }, pos || {}));
    pinnTeilenMerken({ an: true, bis: r.bis || 0, seit: Date.now() });
    famCloseModal();
    await famLoadStatus();
    finShowToast(pos ? 'Du sendest jetzt dauerhaft' : 'Läuft – dein Standort war gerade nicht verfügbar (Standortzugriff erlaubt?)', !pos);
    pinnTeilenLiveCheck(true);
  } catch (e) {
    if (err) { err.textContent = e.message || 'Teilen nicht möglich'; err.classList.remove('hidden'); }
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
async function famShareEnd(btn) {
  if (btn) btn.disabled = true;
  try {
    await famPost('standort-teilen', { an: false });
    pinnTeilenMerken(null);
    pinnTeilenStop();
    await famLoadStatus();
    finShowToast('Dauerhaft senden ist aus');
  } catch (e) {
    finShowToast(e.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}
async function famShareNow(btn) {
  if (btn) btn.disabled = true;
  try {
    const pos = await famGetPosition();
    if (!pos) throw new Error('Standort nicht verfügbar – ist der Standortzugriff für pinn. erlaubt?');
    const r = await famPost('standort', pos);
    if (r && r.teilen === false) { pinnTeilenMerken(null); throw new Error('Deine Freigabe ist schon beendet.'); }
    pinnTeilenLast = { t: Date.now(), lat: pos.lat, lon: pos.lon };
    await famLoadStatus();
    finShowToast('Standort gesendet');
    pinnTeilenLiveCheck(true);
  } catch (e) {
    finShowToast(e.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// "Send once": show exactly this location for one hour (without sending continuously).
// If "Send continuously" is running, it is simply a current location.
async function famSendOnce(btn) {
  const pushEl = document.getElementById('famMinePush');
  const push = !!(pushEl && pushEl.checked);
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Standort wird ermittelt …'; }
  try {
    const pos = await famGetPosition();
    if (!pos) throw new Error('Standort nicht verfügbar – ist der Standortzugriff für pinn. erlaubt?');
    const r = await famPost('standort-einmal', Object.assign({ push }, pos));
    pinnTeilenLast = { t: Date.now(), lat: pos.lat, lon: pos.lon };
    await famLoadStatus();
    finShowToast(r && r.dauerhaft ? 'Standort gesendet' : 'Standort einmalig gesendet – 1 Stunde sichtbar');
  } catch (e) {
    finShowToast(e.message || 'Senden nicht möglich', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}
// Switch "Send continuously": on -> choose duration, off -> stop right away
function famToggleDauerhaft(input) {
  const on = !!input.checked;
  input.checked = !on; // display only follows the server
  if (on) famOpenShare(); else famShareEnd(input);
}
// SOS button below "My location": 3 second countdown (tap again to cancel), then the same
// alarm as from the way-home popup or "Traccar Client" – push to the whole family, always
var FAM_SOS_SEC = 3;
var famSosUntil = 0, famSosTimer = null, famSosSending = false;
function famSosLabel() {
  if (famSosSending) return '📡 Alarm wird gesendet …';
  if (famSosUntil) return '🆘 Alarm in ' + Math.max(1, Math.ceil((famSosUntil - Date.now()) / 1000)) + ' s … nochmal tippen bricht ab';
  return '🆘 SOS – Familie sofort alarmieren';
}
function famSosPaint() {
  const b = document.getElementById('famSosBtn');
  if (!b) return;
  b.textContent = famSosLabel();
  b.classList.toggle('counting', !!famSosUntil);
  b.disabled = famSosSending;
}
function famSosPress() {
  if (famSosSending) return;
  if (famSosUntil) {
    famSosUntil = 0; clearInterval(famSosTimer); famSosTimer = null;
    hwSosVibrate(60); famSosPaint(); finShowToast('SOS abgebrochen');
    return;
  }
  famSosUntil = Date.now() + FAM_SOS_SEC * 1000;
  hwSosVibrate(200);
  famSosPaint();
  clearInterval(famSosTimer);
  famSosTimer = setInterval(() => {
    if (!famSosUntil) return;
    if (Date.now() >= famSosUntil) {
      clearInterval(famSosTimer); famSosTimer = null; famSosUntil = 0;
      famSosSend();
      return;
    }
    famSosPaint();
  }, 200);
}
async function famSosSend() {
  famSosSending = true;
  famSosPaint();
  let failed = '', id = '';
  if (navigator.onLine === false) failed = 'Keine Verbindung zu pinn. – der Alarm konnte nicht gesendet werden.';
  else {
    const pos = await hwSosBrowserPos();
    try { const r = await famPost('sos-ausloesen', pos || {}); id = (r && r.id) || ''; }
    catch (e) { failed = e.message || 'Der Alarm konnte nicht gesendet werden.'; }
  }
  famSosSending = false;
  famSosPaint();
  if (failed) {
    hwSosVibrate([400, 120, 400]);
    const pol = regionNotruf().polizei;
    if (confirm(failed + '\n\nJetzt den Polizei-Notruf ' + pol + ' anrufen?')) location.href = 'tel:' + pol;
    return;
  }
  hwSosVibrate([300, 100, 300]);
  finShowToast('🆘 Alarm gesendet – deine Familie ist informiert');
  sosStarted = true;
  if (id) sosForceId = id;
  await sosCheck();
}

/* Live location while pinn. is open (on every page, not only under Family) */
var LS_TEILEN = 'pinn.meinTeilen';
var pinnTeilenWatch = null;
var pinnTeilenLast = null;     // { t, lat, lon } last sent
var pinnTeilenGeste = false;   // shared by the user in this session -> location may be read without asking
var pinnTeilenSendet = false;
function pinnTeilenStand() { try { return JSON.parse(localStorage.getItem(LS_TEILEN) || 'null'); } catch (e) { return null; } }
function pinnTeilenMerken(s) {
  try {
    if (s && s.an) localStorage.setItem(LS_TEILEN, JSON.stringify(Object.assign({}, s, { user: (currentUser() && currentUser().id) || '' })));
    else localStorage.removeItem(LS_TEILEN);
  } catch (e) { /* ignore */ }
}
function pinnTeilenAktiv() {
  const s = pinnTeilenStand();
  if (!s || !s.an || s.app) return false;
  const u = currentUser();
  if (!u || (s.user && s.user !== u.id)) return false;
  if (s.bis && Date.now() > s.bis) { pinnTeilenMerken(null); return false; }
  return true;
}
// After every load of the locations: remember own state (share started from pinn., "Traccar Client" active?)
function pinnTeilenAusStatus() {
  const g = famMyPhone();
  if (!g || !g.teilen || !g.seit) { pinnTeilenMerken(null); pinnTeilenStop(); return; }
  const app = !!(g.position && g.position.quelle === 'app' && famNow() - g.position.zeit < 10 * 60 * 1000);
  pinnTeilenMerken({ an: true, bis: g.bis || 0, seit: g.seit, app: app });
  pinnTeilenLiveCheck(false);
}
async function pinnTeilenErlaubt() {
  if (!navigator.geolocation) return false;
  if (pinnTeilenGeste) return true;
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const st = await navigator.permissions.query({ name: 'geolocation' });
      return !!st && st.state === 'granted';
    }
  } catch (e) { /* cannot be queried */ }
  return false;
}
function pinnTeilenStop() {
  if (pinnTeilenWatch === null) return;
  try { navigator.geolocation.clearWatch(pinnTeilenWatch); } catch (e) { /* ignore */ }
  pinnTeilenWatch = null;
}
async function pinnTeilenLiveCheck(geste) {
  if (geste) pinnTeilenGeste = true;
  const ok = document.visibilityState === 'visible' && navigator.onLine !== false && pinnTeilenAktiv() &&
    !(typeof isCurrentUserGuest === 'function' && isCurrentUserGuest());
  if (!ok) { pinnTeilenStop(); return; }
  if (pinnTeilenWatch !== null) return;
  if (!(await pinnTeilenErlaubt()) || pinnTeilenWatch !== null) return;
  try {
    pinnTeilenWatch = navigator.geolocation.watchPosition(pinnTeilenNeu, (err) => { if (err && err.code === 1) pinnTeilenStop(); },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 120000 });
  } catch (e) { pinnTeilenWatch = null; }
}
async function pinnTeilenNeu(p) {
  if (!pinnTeilenAktiv()) { pinnTeilenStop(); return; }
  const c = p.coords;
  const now = Date.now();
  const last = pinnTeilenLast;
  if (last) {
    const dt = now - last.t;
    const d = famDistM(last.lat, last.lon, c.latitude, c.longitude);
    // only on movement (like "Traccar Client": 50 m), at most about once a minute – nothing while standing still
    if (!(dt >= 50 * 1000 && d >= Math.max(50, (c.accuracy || 0) / 2))) return;
  }
  if (pinnTeilenSendet) return;
  pinnTeilenSendet = true;
  try {
    const r = await postJson('/api/pinn/ortung/standort', famPosPayload(p));
    pinnTeilenLast = { t: now, lat: c.latitude, lon: c.longitude };
    if (r && r.teilen === false) { pinnTeilenMerken(null); pinnTeilenStop(); }
  } catch (e) {
    /* next attempt with the next location */
  } finally {
    pinnTeilenSendet = false;
  }
}
document.addEventListener('visibilitychange', () => pinnTeilenLiveCheck(false));
window.addEventListener('online', () => pinnTeilenLiveCheck(false));
setInterval(() => { if (document.visibilityState === 'visible') pinnTeilenLiveCheck(false); }, 60 * 1000);
setTimeout(() => pinnTeilenLiveCheck(false), 3000);

async function famSetUnterwegs(on, btn) {
  if (on && !confirm('Die Familie bekommt eine Nachricht und sieht deinen Live-Standort, bis du zu Hause ankommst. Los?')) return;
  if (btn) btn.disabled = true;
  try {
    await famPost('unterwegs', { an: !!on });
    if (on) {
      // send a current location right away – on the way the open pinn. app then sends along when moving
      const pos = await famGetPosition();
      if (pos) { try { await famPost('standort', pos); pinnTeilenLast = { t: Date.now(), lat: pos.lat, lon: pos.lon }; } catch (e) { /* ignore */ } }
      pinnTeilenGeste = true;
    }
    await famLoadStatus();
    finShowToast(on ? 'Gute Fahrt! Die Familie ist informiert.' : 'Heimweg beendet');
    sosStarted = true;
    sosCheck(); // Show or remove the notice at the top (with contacts and emergency call) right away
  } catch (e) {
    finShowToast(e.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}
async function famLoadAddress(id) {
  const g = famDevice(id);
  if (!g || !g.position) return;
  try {
    const res = await apiFetch(`/api/pinn/ortung/suche?lat=${g.position.lat}&lon=${g.position.lon}`);
    const body = await res.json().catch(() => ({}));
    const t = Array.isArray(body.treffer) && body.treffer[0];
    famAddress[id] = { lat: g.position.lat, lon: g.position.lon, name: t ? t.name : (body.error || 'Keine Adresse gefunden') };
  } catch (e) {
    famAddress[id] = { lat: g.position.lat, lon: g.position.lon, name: 'Keine Verbindung' };
  }
  famRenderInfo();
}
function famOpenMember(memberId) {
  famDetailId = memberById(memberId) ? memberId : null;
  famDetailMode = 'profil';
  famPassFrom = '';
  if (currentView !== 'familie') setView('familie'); else renderFamily();
  const sc = document.getElementById('famScroll');
  if (sc) sc.scrollTop = 0;
}
function famShowOnMap(deviceId) {
  famDetailId = null;
  famTab = 'ortung';
  famHidden.delete(deviceId);
  famFollow = deviceId;
  famFollowFree = false;
  famSelected = deviceId;
  if (currentView !== 'familie') setView('familie'); else renderFamily();
  requestAnimationFrame(() => {
    const slot = document.getElementById('famMapSlot');
    if (slot) slot.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}
// Push message tapped: /?familie=<member ID>
function famOpenFromUrl() {
  let id = '';
  try { id = new URLSearchParams(location.search).get('familie') || ''; } catch (e) { id = ''; }
  if (!id) return;
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ }
  if (!isViewAllowed('familie')) return;
  const g = famOrtungAllowed() ? famDevices().find(x => x.memberId === id) : null;
  famDetailId = null;
  if (g) famShowOnMap(g.id);
  else setView('familie');
  if (!g && famOrtungAllowed()) {
    // Locations only arrive after loading - then show the person on the map
    const wait = setInterval(() => {
      if (!famStatus) return;
      clearInterval(wait);
      const d = famDevices().find(x => x.memberId === id);
      if (d && currentView === 'familie' && !famDetailId) { famFollow = d.id; famFollowFree = false; famSelected = d.id; famRefreshLive(); }
    }, 400);
    setTimeout(() => clearInterval(wait), 15000);
  }
}

/* ==========================================================
   SOS – call for help from "Traccar Client" (or the SOS button on the GPS tracker)
   ----------------------------------------------------------
   - The server (pinn-ortung.js) detects the call for help and sends a push message to all profiles
     of the family (tag "sos-<ID>", link /?sos=<ID>).
   - The app queries /api/pinn/ortung/sos: on start, when returning to the app, on an
     SOS push message (the service worker reports it) and otherwise every 30 seconds; with the popup open
     every 5 seconds (current location).
   - Popup: map with a circle for the accuracy, address, time (accuracy in brackets), call
     the person (mobile number from the emergency pass), 110, 112, navigation, copy address,
     all-clear for everyone. "Close" is remembered by the device – if pressed again, it comes back.
   - While an SOS is running, a red notice at the top shows who needs help.
   ========================================================== */
var SOS_POLL_OPEN_MS = 5000;
var SOS_POLL_ACTIVE_MS = 15000;
var SOS_POLL_IDLE_MS = 30000;
var LS_SOS_SEEN = 'pinn.sosGesehen';
var sosAlarms = [];
var sosOpenId = '';
var sosForceId = '';
var sosRendered = '';       // "<ID>|<active>" of the built popup
var sosMap = null;
var sosMapFree = false;     // map was moved by hand -> stop following
var sosTimer = null;
var sosLoading = false;
var sosStarted = false;
var sosBusy = false;

function sosEnabled() {
  const u = currentUser();
  return !!(u && u.familie) && !isCurrentUserGuest();
}
function sosActiveFor(memberId) {
  return sosAlarms.find(a => a.aktiv && a.memberId === memberId) || null;
}
function sosSeenMap() {
  try { const o = JSON.parse(localStorage.getItem(LS_SOS_SEEN) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
}
function sosIsSeen(a) { const v = sosSeenMap()[a.id]; return !!v && Number(v) >= Number(a.anzahl || 1); }
function sosMarkSeen(a) {
  if (!a) return;
  const m = sosSeenMap();
  m[a.id] = Number(a.anzahl || 1);
  // only keep entries the server still knows
  const keep = {};
  Object.keys(m).forEach(k => { if (k === a.id || sosAlarms.some(x => x.id === k)) keep[k] = m[k]; });
  try { localStorage.setItem(LS_SOS_SEEN, JSON.stringify(keep)); } catch (e) { /* ignore */ }
}
function sosName(a) { const m = memberById(a.memberId); return m ? memberLabel(m) : (a.name || 'Jemand'); }
function sosIsMine(a) { const me = famMyMemberId(); return !!me && a.memberId === me; }
function sosClock(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const t = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
  return d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ', ' + t;
}
function sosCurrent(a) { return a.aktuell || a.pos || null; }
function sosAddress(a) {
  const c = sosCurrent(a);
  if (!c) return '';
  const adr = a.aktuell ? (a.aktuell.adresse || '') : (a.adresse || '');
  return adr || (Number(c.lat).toFixed(5) + ', ' + Number(c.lon).toFixed(5));
}

/* ---------- Server ---------- */
async function sosCheck() {
  if (!sosEnabled() || sosLoading) return;
  sosLoading = true;
  let ok = false;
  try {
    const res = await apiFetch('/api/pinn/ortung/sos', { cache: 'no-store' });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body && Array.isArray(body.sos)) {
        if (body.jetzt) famSkew = Number(body.jetzt) - Date.now();
        sosAlarms = body.sos;
        hwTake(body); // Ways home come with the same query
        try { lpTake(body); } catch (e) { /* ignore */ } // as do the shops nearby
        ok = true;
      }
    }
  } catch (e) { /* offline: next attempt */ }
  sosLoading = false;
  if (ok) {
    sosApply(); hwApply();
    try { lpRenderBanner(); } catch (e) { /* ignore */ }
    try { if (currentView === 'uebersicht') renderFamilyTile(); ofsRefreshSheet(); } catch (e) { /* ignore */ }
    try { hwSoonCheck(); } catch (e) { /* ignore */ }
  }
  sosSchedule();
}
function sosSchedule() {
  clearTimeout(sosTimer);
  if (!sosEnabled()) return;
  let ms = (sosOpenId || hwOpenFlag) ? SOS_POLL_OPEN_MS : ((sosAlarms.some(a => a.aktiv) || hwList.some(h => h.aktiv)) ? SOS_POLL_ACTIVE_MS : SOS_POLL_IDLE_MS);
  // Saving energy: without an open/active alarm only every 2 minutes in sleep mode - a new call for help arrives by push anyway
  if (ms === SOS_POLL_IDLE_MS && window.pinnRuhe && window.pinnRuhe()) ms = 2 * 60 * 1000;
  sosTimer = setTimeout(() => {
    if (document.visibilityState === 'visible') sosCheck();
    else sosSchedule();
  }, ms);
}
function sosApply() {
  sosRenderBanner();
  if (currentView === 'familie') famRefreshLive();
  if (sosOpenId) {
    const a = sosAlarms.find(x => x.id === sosOpenId);
    if (a) sosRender(a); else sosClose(false);
    return;
  }
  let a = sosForceId ? sosAlarms.find(x => x.id === sosForceId) : null;
  sosForceId = '';
  if (!a) a = sosAlarms.filter(x => x.aktiv && !sosIsSeen(x)).sort((x, y) => Number(y.letzte || y.zeit) - Number(x.letzte || x.zeit))[0] || null;
  if (a) sosOpen(a.id);
}

/* ---------- Popup ---------- */
function sosOpen(id) {
  const a = sosAlarms.find(x => x.id === id);
  if (!a) { sosForceId = id; sosCheck(); return; }
  sosOpenId = id;
  sosRendered = '';
  sosMapFree = false;
  document.getElementById('sosOverlay').classList.remove('hidden');
  sosRender(a);
  sosRenderBanner();
  if (a.aktiv && !sosIsMine(a)) { try { if (navigator.vibrate) navigator.vibrate([500, 150, 500, 150, 900]); } catch (e) { /* ignore */ } }
  sosSchedule();
}
function sosClose(markSeen) {
  const a = sosAlarms.find(x => x.id === sosOpenId);
  if (markSeen !== false && a) sosMarkSeen(a);
  sosOpenId = '';
  sosRendered = '';
  if (sosMap) { sosMap.destroy(); sosMap = null; }
  document.getElementById('sosOverlay').classList.add('hidden');
  document.getElementById('sosCard').innerHTML = '';
  sosRenderBanner();
  sosSchedule();
}
function sosRender(a) {
  const card = document.getElementById('sosCard');
  const key = a.id + '|' + (a.aktiv ? '1' : '0');
  if (sosRendered !== key) {
    if (sosMap) { sosMap.destroy(); sosMap = null; }
    card.innerHTML = sosSkeleton(a);
    card.classList.toggle('ok', !a.aktiv);
    sosRendered = key;
    requestAnimationFrame(() => sosAttachMap(a));
  }
  sosUpdate(a);
}
function sosSkeleton(a) {
  const m = memberById(a.memberId);
  const name = sosName(a);
  const mine = sosIsMine(a);
  const pass = famPass(a.memberId) || {};
  const phone = String(pass.phone || '').trim();
  let kicker, title;
  if (!a.aktiv) { kicker = '✅ Entwarnung'; title = mine ? 'Dein Hilferuf ist beendet' : name + ' ist in Sicherheit'; }
  else if (mine) { kicker = '🆘 SOS gesendet'; title = 'Dein Hilferuf ist aktiv'; }
  else { kicker = '🆘 SOS · Hilferuf'; title = name + ' braucht Hilfe!'; }
  const ava = m ? `<span class="fam-ava" style="--fam:#fff">${famAvatarInner(m)}</span>` : `<span class="fam-ava" style="--fam:#fff"><span class="fam-ava-in">🆘</span></span>`;
  const emCalls = sosEmergencyCalls('Polizei');
  const nCalls = emCalls.length + (!mine && phone ? 1 : 0);
  const calls = !a.aktiv ? '' : `<div class="sos-calls${({ 1: ' one', 2: ' two', 4: ' four' })[nCalls] || ''}">
      ${!mine && phone ? `<a class="sos-call person" href="${famAttr(famTel(phone))}"><span class="ic">📞</span><b>${escapeHtml(name)}</b><span>${escapeHtml(phone)}</span></a>` : ''}
      ${emCalls.join('')}
    </div>
    ${!mine && !phone ? `<p class="text-[11px] text-ink/50 -mt-1">Für ${escapeHtml(name)} ist keine Handynummer im Notfallpass hinterlegt${famCanEdit() ? ' – unter Familie → Bearbeiten eintragen' : ''}.</p>` : ''}`;
  const canPass = !!m && isViewAllowed('familie');
  return `
    <div class="sos-head">
      ${ava}
      <div class="min-w-0">
        <div class="sos-kicker">${kicker}</div>
        <div class="sos-title">${escapeHtml(title)}</div>
        <div class="sos-sub" id="sosSub"></div>
      </div>
    </div>
    <div class="sos-body">
      <div class="sos-loc" id="sosLoc"></div>
      <div class="sos-map-slot"><div id="sosMapHost" class="fam-map-host"></div><div class="sos-map-cap" id="sosMapCap"></div></div>
      ${calls}
      <div class="flex flex-wrap gap-2">
        <a id="sosNav" class="fz-mini-btn" href="#" target="_blank" rel="noopener">🧭 Navigation</a>
        <button type="button" class="fz-mini-btn" data-sosact="copy">📋 Adresse kopieren</button>
        ${canPass ? `<button type="button" class="fz-mini-btn" data-sosact="pass">🩺 Notfallpass</button>` : ''}
      </div>
    </div>
    <div class="sos-foot">
      ${a.aktiv && !isCurrentUserGuest() ? `<button type="button" class="sos-btn-ok" data-sosact="ende">${mine ? '✅ Mir geht es gut' : '✅ Entwarnung geben'}</button>` : ''}
      <button type="button" class="sos-btn-close" data-sosact="close">Schließen</button>
    </div>`;
}
// Refresh text, map and navigation with the newest location (without rebuilding the map)
function sosUpdate(a) {
  const c = sosCurrent(a);
  const sub = document.getElementById('sosSub');
  if (sub) {
    const parts = [];
    if (!a.aktiv && a.ende) parts.push((a.ende.wer ? a.ende.wer + ' hat ' : '') + 'um ' + sosClock(a.ende.zeit) + ' Entwarnung gegeben');
    else parts.push('ausgelöst um ' + sosClock(a.zeit) + ' · ' + famAgo(a.zeit));
    if (Number(a.anzahl) > 1 && a.aktiv) parts.push(a.anzahl + '× gedrückt');
    if (sosIsMine(a) && a.aktiv) parts.push('Deine Familie sieht deinen Standort');
    sub.textContent = parts.join(' · ');
  }
  const loc = document.getElementById('sosLoc');
  if (loc) {
    if (!c) {
      loc.innerHTML = `<div class="sos-addr">📍 Standort noch unbekannt</div><div class="sos-when">Es kam noch keine Position – pinn. aktualisiert automatisch.</div>`;
    } else {
      const live = a.aktiv && famNow() - Number(c.zeit || 0) < 2 * 60 * 1000;
      const acc = c.genau ? `(± ${escapeHtml(String(c.genau))} m)` : '(Genauigkeit unbekannt)';
      const extra = [live ? '<span class="sos-live">● live</span>' : (a.aktiv ? escapeHtml(famAgo(c.zeit)) : ''), c.akku != null ? '🔋 ' + escapeHtml(String(c.akku)) + ' %' : '', c.tempo ? '🏃 ' + escapeHtml(String(c.tempo)) + ' km/h' : ''].filter(Boolean).join(' · ');
      loc.innerHTML = `<div class="sos-addr">📍 ${escapeHtml(sosAddress(a))}</div>
        <div class="sos-when">🕒 ${escapeHtml(sosClock(c.zeit))} <span class="acc">${acc}</span>${extra ? ' · ' + extra : ''}</div>
        ${a.aktuell && a.pos && a.adresse && a.adresse !== a.aktuell.adresse ? `<div class="sos-when">🆘 Beim Auslösen: ${escapeHtml(a.adresse)}</div>` : ''}`;
    }
  }
  const cap = document.getElementById('sosMapCap');
  if (cap) cap.textContent = c ? (c.genau ? '◯ Radius ± ' + c.genau + ' m Genauigkeit' : '◯ Genauigkeit unbekannt') : '';
  const nav = document.getElementById('sosNav');
  if (nav) {
    if (c) {
      const q = encodeURIComponent(sosName(a));
      nav.href = isAppleMobile() ? `https://maps.apple.com/?ll=${c.lat},${c.lon}&q=${q}` : `geo:${c.lat},${c.lon}?q=${c.lat},${c.lon}(${q})`;
      nav.classList.remove('hidden');
    } else nav.classList.add('hidden');
  }
  sosDrawMap(a);
}
function sosAttachMap(a) {
  const host = document.getElementById('sosMapHost');
  if (!host || sosMap) return;
  sosMap = famCreateMap(host, { onUserMove: () => { sosMapFree = true; } });
  sosMapFree = false;
  const c = sosCurrent(a);
  if (c) sosMap.setView(Number(c.lat), Number(c.lon), sosZoomFor(c.genau));
  else { const h = famHomePoint(); if (h) sosMap.setView(Number(h.lat), Number(h.lon), 13); else sosMap.setView(51.1657, 10.4515, 6); }
  sosDrawMap(a);
}
function sosZoomFor(genau) {
  const g = Number(genau) || 0;
  return g > 1500 ? 13 : g > 600 ? 14 : g > 200 ? 15 : g > 60 ? 16 : 17;
}
function sosDrawMap(a) {
  if (!sosMap) return;
  const c = sosCurrent(a);
  if (!c) { sosMap.setMarkers([]); sosMap.setCircles([]); sosMap.setLine([]); return; }
  const m = memberById(a.memberId);
  const color = a.aktiv ? '#D63B32' : '#2F7D4F';
  const marks = [];
  const moved = a.aktuell && a.pos && famDistM(a.pos.lat, a.pos.lon, a.aktuell.lat, a.aktuell.lon) > 25;
  if (moved) marks.push({ lat: Number(a.pos.lat), lon: Number(a.pos.lon), html: '<div class="fm-place">🆘</div>', cls: 'is-place' });
  marks.push({
    id: 'sos', lat: Number(c.lat), lon: Number(c.lon),
    html: `<div class="fm-mk${a.aktiv ? ' live sos' : ''}" style="--fam:${famAttr(famColor(m))}">
        <div class="fm-mk-ava">${m ? famAvatarInner(m) : '<span class="fam-ava-in">🆘</span>'}</div>
        <div class="fm-mk-lbl">${a.aktiv ? '🆘 ' : ''}${escapeHtml(sosName(a))}</div>
      </div>`,
  });
  sosMap.setMarkers(marks);
  sosMap.setCircles(c.genau ? [{ lat: Number(c.lat), lon: Number(c.lon), r: Math.max(5, Number(c.genau)), color: color }] : []);
  sosMap.setLine(moved ? [[Number(a.pos.lat), Number(a.pos.lon)], [Number(c.lat), Number(c.lon)]] : []);
  if (!sosMapFree) sosMap.setView(Number(c.lat), Number(c.lon), Math.max(sosMap.zoom(), Math.min(sosZoomFor(c.genau), 16)));
}
function famDistM(lat1, lon1, lat2, lon2) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/* ---------- Notice at the top while an SOS is running ---------- */
function sosRenderBanner() {
  const b = document.getElementById('sosBanner');
  if (!b) return;
  const active = sosEnabled() ? sosAlarms.filter(a => a.aktiv) : [];
  if (!active.length || sosOpenId) { b.classList.add('hidden'); return; }
  const names = active.map(a => sosIsMine(a) ? 'Dein Hilferuf' : sosName(a));
  b.textContent = '🆘 SOS aktiv: ' + names.join(', ') + ' – antippen';
  b.dataset.id = active.sort((x, y) => Number(y.letzte || y.zeit) - Number(x.letzte || x.zeit))[0].id;
  b.classList.remove('hidden');
}

/* ---------- All-clear ---------- */
async function sosEnd(btn) {
  const a = sosAlarms.find(x => x.id === sosOpenId);
  if (!a || sosBusy) return;
  const mine = sosIsMine(a);
  if (!confirm(mine ? 'Entwarnung geben? Deine Familie bekommt Bescheid, dass es dir gut geht.' : `Entwarnung für ${sosName(a)} geben? Alle in der Familie werden benachrichtigt.`)) return;
  sosBusy = true;
  if (btn) btn.disabled = true;
  try {
    await postJson('/api/pinn/ortung/sos-ende', { id: a.id });
    finShowToast('Entwarnung gesendet');
    a.aktiv = false;
    a.ende = { zeit: famNow(), wer: (currentMember() && memberLabel(currentMember())) || '' };
    sosMarkSeen(a);
    sosRender(a);
    sosRenderBanner();
    sosCheck();
  } catch (e) {
    finShowToast(e.message || 'Entwarnung nicht möglich – keine Verbindung?', true);
    if (btn) btn.disabled = false;
  } finally {
    sosBusy = false;
  }
}

/* ---------- Start & wiring ---------- */
function sosStart() {
  hwReadUrl(); // ?heimweg=<ID> from the push message "… is on the way home"
  let id = '';
  try { id = new URLSearchParams(location.search).get('sos') || ''; } catch (e) { id = ''; }
  if (id) {
    sosForceId = id;
    try {
      const q = new URLSearchParams(location.search);
      q.delete('sos');
      const rest = q.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    } catch (e) { /* ignore */ }
  }
  if (!sosEnabled()) return;
  sosStarted = true;
  sosCheck();
}
(function wireSos() {
  const overlay = document.getElementById('sosOverlay');
  const card = document.getElementById('sosCard');
  if (!overlay || !card) return;
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sosact]');
    if (!b) return;
    const a = sosAlarms.find(x => x.id === sosOpenId);
    switch (b.dataset.sosact) {
      case 'close': sosClose(true); break;
      case 'ende': sosEnd(b); break;
      case 'copy': {
        if (!a) break;
        const c = sosCurrent(a);
        if (!c) break;
        famCopy(sosAddress(a) + ' (' + Number(c.lat).toFixed(5) + ', ' + Number(c.lon).toFixed(5) + (c.genau ? ', ± ' + c.genau + ' m' : '') + ')');
        break;
      }
      case 'pass': {
        if (!a) break;
        const mid = a.memberId;
        sosClose(true);
        famOpenPass(mid);
        break;
      }
    }
  });
  document.getElementById('sosBanner').addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    if (id) sosOpen(id);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sosOpenId) sosClose(true); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && sosStarted) sosCheck();
  });
  window.addEventListener('online', () => { if (sosStarted) sosCheck(); });
  // Service worker: SOS push arrived or notification tapped (app was already open)
  try {
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (ev) => {
      const d = ev.data || {};
      if (d.type !== 'pinn-sos' && d.type !== 'pinn-open') return;
      let id = '';
      try { id = new URL(d.url || '/', location.origin).searchParams.get('sos') || ''; } catch (e) { id = ''; }
      if (d.type === 'pinn-open' && !id) return;
      if (!sosEnabled()) return;
      sosStarted = true;
      if (id && d.type === 'pinn-open') sosForceId = id;
      sosCheck();
    });
  } catch (e) { /* ignore */ }
})();

/* ==========================================================
   Family: tabs (Overview · School & daycare · Location · Emergency) and profile per person
   ----------------------------------------------------------
   - Tapping a person opens their profile (location, school & daycare, emergency pass as a tile).
     The emergency pass itself opens directly from the SOS popup, the "Emergency" tab and the map.
   - Locations are only polled continuously on "Overview", "Location" and in the profile.
   ========================================================== */
var famTab = 'uebersicht';      // 'uebersicht' | 'schule' | 'tiere' | 'ortung' | 'notfall'
var famDetailMode = 'profil';   // 'profil' | 'pass'
var famPassFrom = '';           // 'profil' = back to the profile, otherwise to the list
function famPollWanted() { return !!famDetailId || famTab === 'uebersicht' || famTab === 'ortung' || (famTab === 'tiere' && !!ptDetailId && !!(ptById(ptDetailId) || {}).trackerId); }
function famSetTab(tab) {
  famTab = ['uebersicht', 'schule', 'tiere', 'ortung', 'notfall'].includes(tab) ? tab : 'uebersicht';
  famDetailId = null;
  ptDetailId = null;
  if (famTab === 'ortung') famFitted = false;
  renderFamily();
  if (famPollWanted()) famStartPolling(); else famStopPolling();
  const sc = document.getElementById('famScroll');
  if (sc) sc.scrollTop = 0;
}
function famOpenPass(memberId) {
  famDetailId = memberById(memberId) ? memberId : null;
  famDetailMode = 'pass';
  famPassFrom = '';
  if (currentView !== 'familie') setView('familie'); else renderFamily();
  const sc = document.getElementById('famScroll');
  if (sc) sc.scrollTop = 0;
}
function famPassFilled(p) {
  return !!p && Object.keys(p).some(k => !['updated', 'updatedBy'].includes(k) && (Array.isArray(p[k]) ? p[k].some(x => x && Object.values(x).some(Boolean)) : String(p[k] || '').trim()));
}

function famHomeHtml() {
  const grid = members.length
    ? `<div id="famGrid" class="fam-grid"></div>`
    : `<div class="fam-card text-center py-6"><div class="text-4xl mb-2">👨‍👩‍👧‍👦</div><div class="font-serif text-lg mb-1">Noch keine Familienmitglieder</div><p class="text-sm text-ink/50">Mitglieder legt ein Admin unter Einstellungen → Familienmitglieder an.</p></div>`;
  return `${grid}
    ${skTodayCardHtml()}
    ${famQuickCardsHtml()}
    ${members.length ? '<p class="text-[11px] text-ink/40 text-center">Tippe auf eine Person, um ihr Profil zu öffnen.</p>' : ''}`;
}
function famQuickCardsHtml() {
  const people = members.filter(m => !famIsPet(m));
  const filled = members.filter(m => famPassFilled(famPass(m.id))).length;
  const cards = [];
  cards.push(`<button type="button" class="fam-quick" data-famtabgo="notfall">
      <span class="fam-quick-ic">🩺</span>
      <span class="fam-quick-t">Notfall</span>
      <span class="fam-quick-s">${filled ? `${filled} von ${members.length} Notfallpässen` : 'Noch kein Notfallpass'}</span>
    </button>`);
  if (famOrtungAllowed()) {
    const sharing = famDevices().filter(g => g.teilen && g.position).length;
    cards.push(`<button type="button" class="fam-quick" data-famtabgo="ortung">
      <span class="fam-quick-ic">📍</span>
      <span class="fam-quick-t">Ortung</span>
      <span class="fam-quick-s">${sharing ? `${sharing} teilen ihren Standort` : 'Karte & Orte'}</span>
    </button>`);
  }
  if (!skProfiles().length && people.length) {
    cards.push(`<button type="button" class="fam-quick" data-famtabgo="schule">
      <span class="fam-quick-ic">🎒</span>
      <span class="fam-quick-t">Schule & Kita</span>
      <span class="fam-quick-s">Stundenplan, Elternbriefe, Schließtage</span>
    </button>`);
  }
  cards.push(ptQuickCardHtml());
  return `<div class="fam-quick-grid">${cards.join('')}</div>`;
}
function famOrtungHtml() {
  if (!famOrtungAllowed()) return '';
  return `
    <div id="famMine"></div>
    <div class="fam-card">
      <div class="flex items-center justify-between gap-2 mb-2">
        <div class="fz-h" style="margin-bottom:0">📍 Live-Standorte</div>
        <span id="famStamp" class="text-[11px] text-ink/40"></span>
      </div>
      <div id="famChips" class="fam-chip-row"></div>
      <div id="famMapSlot" class="fam-map-slot"></div>
      <div id="famInfo"></div>
      <div id="famNote"></div>
    </div>`;
}
function famNotfallHtml() {
  const n = regionNotruf();
  const calls = [`<a class="fz-act-btn fam-sos" href="tel:${escapeHtml(n.rettung)}"><span class="fz-ti">🚑</span>${escapeHtml(n.rettung)} anrufen</a>`];
  if (n.polizei && n.polizei !== n.rettung) calls.push(`<a class="fz-act-btn" href="tel:${escapeHtml(n.polizei)}"><span class="fz-ti">🚓</span>${escapeHtml(n.polizei)} anrufen</a>`);
  const rows = members.map(m => {
    const p = famPass(m.id) || {};
    const has = famPassFilled(p);
    const contacts = (Array.isArray(p.contacts) ? p.contacts : []).filter(x => x && (x.name || x.phone)).length;
    const meds = (Array.isArray(p.meds) ? p.meds : []).filter(x => x && (x.name || x.dose)).length;
    const facts = has ? [
      !famIsPet(m) && p.blood ? '🩸 ' + p.blood : '',
      p.allergies ? '⚠️ ' + String(p.allergies).split(/[,;\n]/)[0].trim() : '',
      meds ? `💊 ${meds}` : '',
      contacts ? `📞 ${contacts}` : '',
    ].filter(Boolean).join(' · ') : '';
    return `<button type="button" class="fam-pass-row" data-fampass="${famAttr(m.id)}" style="--fam:${famAttr(famColor(m))}">
      <span class="fam-ava sm">${famAvatarInner(m)}</span>
      <span class="min-w-0 flex-1 text-left">
        <span class="block text-sm font-medium truncate">${escapeHtml(memberLabel(m))}</span>
        <span class="block text-[11px] ${has ? 'text-ink/55' : 'text-mustard'} truncate">${has ? escapeHtml(facts || 'Notfallpass') : 'Noch kein Notfallpass'}</span>
      </span>
      <span class="text-ink/30 text-lg leading-none">›</span>
    </button>`;
  }).join('');
  return `
    <div class="fam-card">
      <div class="fz-h">🆘 Notruf</div>
      <div class="flex gap-2">${calls.join('')}</div>
    </div>
    ${members.length ? `<div class="fam-card"><div class="fz-h">🩺 Notfallpässe</div><div class="flex flex-col">${rows}</div></div>` : ''}
    ${ptNotfallHtml()}
    <p class="text-[11px] text-ink/40 text-center">Notfallpässe sind auch offline griffbereit.</p>`;
}
function famProfileHtml(m) {
  const p = famPass(m.id) || {};
  const pet = famIsPet(m);
  const age = famAge(p.birth);
  const color = famColor(m);
  const sp = skProfile(m.id);
  const g = famOrtungAllowed() ? famDeviceForMember(m.id) : null;
  const sub = [m.role && memberLabel(m) !== m.role ? m.role : '', age != null ? age + (age === 1 ? ' Jahr' : ' Jahre') : '', pet && p.species ? p.species : ''].filter(Boolean).join(' · ');
  const btns = [
    p.phone ? `<a class="fz-act-btn" href="${famAttr(famTel(p.phone))}"><span class="fz-ti">📞</span>Anrufen</a>` : '',
    `<button type="button" class="fz-act-btn" data-famact="pass"><span class="fz-ti">🩺</span>Notfallpass</button>`,
    sp ? `<button type="button" class="fz-act-btn" data-sk="open" data-id="${famAttr(m.id)}"><span class="fz-ti">${skIcon(sp)}</span>${skTypeLabel(sp)}</button>` : '',
    g && g.teilen && g.position ? `<button type="button" class="fz-act-btn" data-famact="showmap" data-id="${famAttr(g.id)}"><span class="fz-ti">🗺</span>Karte</button>` : '',
  ].filter(Boolean).join('');
  const school = sp ? skMemberCardHtml(m, sp)
    : (!pet && famCanEdit() ? `<div class="fam-card flex items-center gap-3">
        <span class="text-3xl leading-none">🎒</span>
        <div class="min-w-0 flex-1"><div class="text-sm font-medium">Schule oder Kita</div><div class="text-[11px] text-ink/50">Stundenplan, Hausaufgaben, Elternbriefe und Schließtage</div></div>
        <button type="button" class="fz-mini-btn" data-sk="addkid" data-id="${famAttr(m.id)}">Einrichten</button>
      </div>` : '');
  return `
    <button type="button" class="self-start text-sm text-ink/55 hover:text-pine -mb-1" data-famact="back">‹ Familie</button>
    <div class="fz-hero" style="--fz:${famAttr(color)}">
      <div class="fam-band"></div>
      <div class="fam-hero-ava"><span class="fam-ava big" style="--fam:${famAttr(color)}">${famAvatarInner(m)}<span id="famDetailPing" class="fam-ping${famIsLive(g) ? '' : ' hidden'}"></span></span></div>
      <div class="fam-hero-body">
        <div class="flex items-center gap-2 flex-wrap">
          <div class="font-serif text-xl">${escapeHtml(memberLabel(m))}</div>
          ${!pet && p.blood ? `<span class="fam-blood">🩸 ${escapeHtml(p.blood)}</span>` : ''}
        </div>
        ${sub ? `<div class="text-xs text-ink/50 mt-0.5">${escapeHtml(sub)}</div>` : ''}
        <div class="flex gap-2 mt-3">${btns}</div>
      </div>
    </div>
    <div id="famDetailLoc">${famDetailLocHtml(m)}</div>
    ${school}
    ${famPassSummaryHtml(m)}`;
}
function famPassSummaryHtml(m) {
  const p = famPass(m.id) || {};
  const pet = famIsPet(m);
  const head = `<div class="flex items-center justify-between gap-2 mb-1"><div class="fz-h" style="margin-bottom:0">🩺 Notfallpass</div><button type="button" class="fz-mini-btn" data-famact="pass">Öffnen ›</button></div>`;
  if (!famPassFilled(p)) {
    return `<div class="fam-card">${head}<p class="text-sm text-ink/50">${pet ? 'Chipnummer, Tierarzt, Medikamente und Notfallkontakte – alles auf einen Blick.' : 'Blutgruppe, Allergien, Medikamente, Krankenkasse und Notfallkontakte – griffbereit, auch offline.'}</p></div>`;
  }
  const contacts = (Array.isArray(p.contacts) ? p.contacts : []).filter(x => x && (x.name || x.phone)).map(x => x.name || x.phone);
  const meds = (Array.isArray(p.meds) ? p.meds : []).filter(x => x && x.name).map(x => x.name);
  return `<div class="fam-card">${head}
    ${famRow('Blutgruppe', pet ? '' : p.blood)}
    ${famRow(pet ? 'Allergien & Unverträglichkeiten' : 'Allergien', p.allergies)}
    ${famRow('Medikamente', meds.join(', '))}
    ${famRow('Notfallkontakte', contacts.join(', '))}
  </div>`;
}

/* ==========================================================
   School & daycare
   ----------------------------------------------------------
   Family data (ID lists – changes from several devices are merged cleanly):
   - schoolProfiles: [{ id (= member ID), memberId, type: 'schule'|'kita', name, group, contact, phone, email,
       note, times: [{ id, from, to }] (lesson times), lessons: [{ id, day 1–5, slot (ID from times), subject, room }],
       days: { '1'…'5': { from, to, bring, pick } } (daycare: care hours · school: drop-off & pick-up), updated }]
   - schoolHomework: [{ id, memberId, subject, text, due, done, doneAt, created }]
   - schoolLetters: [{ id, memberIds[], title, sender, action, deadline, amount, note, done, doneAt,
       taskOn, taskFor[], taskId, created }] – optionally with a task for the parents (push, badge, bell).
       If the task is ticked off, the letter counts as done – and vice versa.
   - schoolClosures: [{ id, memberIds[], from, to, reason, created }]
   Closure days and open letter deadlines appear in the calendar (schoolCalendarEvents).
   AI (pb_hooks/pinn-ki.js): timetable and parent letter from a photo.
   ========================================================== */
var SK_DAYS = [[1, 'Mo', 'Montag'], [2, 'Di', 'Dienstag'], [3, 'Mi', 'Mittwoch'], [4, 'Do', 'Donnerstag'], [5, 'Fr', 'Freitag']];
var SK_ACTIONS = [
  { id: 'unterschreiben', icon: '✍️', label: 'Unterschreiben' },
  { id: 'bezahlen', icon: '💶', label: 'Bezahlen' },
  { id: 'mitbringen', icon: '🎒', label: 'Mitbringen' },
  { id: 'anmelden', icon: '📝', label: 'Rückmelden' },
  { id: 'lesen', icon: '📖', label: 'Lesen' },
];
var SK_SUBJECTS = ['Deutsch', 'Mathe', 'Englisch', 'Sachunterricht', 'Sport', 'Musik', 'Kunst', 'Religion', 'Ethik', 'Biologie',
  'Geschichte', 'Erdkunde', 'Physik', 'Chemie', 'Französisch', 'Spanisch', 'Latein', 'Informatik', 'Politik', 'Werken', 'Förderunterricht', 'AG'];
var SK_COLORS = ['#4F7CAC', '#C0392B', '#2E9C7A', '#B07A00', '#8E5BB5', '#D2691E', '#00838F', '#AD1457', '#558B2F', '#6D4C41', '#3949AB', '#7B8D00'];
var skKid = '';
var skShowDone = false;
var skModal = null;
var skKiBusy = '';
var skKiMsg = null;          // { memberId, text, bad }
var skCalSig = '', skCalList = [];

function skProfiles() { return (Array.isArray(schoolProfiles) ? schoolProfiles : []).filter(p => p && memberById(p.memberId)); }
function skProfile(mid) { return mid ? (skProfiles().find(p => p.memberId === mid) || null) : null; }
function skHomeworkOf(mid) { return (Array.isArray(schoolHomework) ? schoolHomework : []).filter(h => h && (!mid || h.memberId === mid)); }
function skLettersOf(mid) { return (Array.isArray(schoolLetters) ? schoolLetters : []).filter(l => l && Array.isArray(l.memberIds) && (!mid || l.memberIds.includes(mid))); }
function skClosuresOf(mid) { return (Array.isArray(schoolClosures) ? schoolClosures : []).filter(c => c && Array.isArray(c.memberIds) && (!mid || c.memberIds.includes(mid))); }
function skIsKita(p) { return !!(p && p.type === 'kita'); }
function skIcon(p) { return skIsKita(p) ? '🧸' : '🏫'; }
function skTypeLabel(p) { return skIsKita(p) ? 'Kita' : 'Schule'; }
function skName(p) { return (p && String(p.name || '').trim()) || skTypeLabel(p); }
function skIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function skTimeOk(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || '')); }
function skToday() { return isoDate(new Date()); }
function skAddDays(iso, n) { return addDaysToDateStr(iso, n); }
function skWeekday(iso) { return new Date(iso + 'T12:00:00').getDay(); }
function skDaysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
function skLocale() { return document.documentElement.lang || 'de'; }
function skFmtDay(iso) {
  if (!skIso(iso)) return '';
  try { return new Date(iso + 'T12:00:00').toLocaleDateString(skLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' }); } catch (e) { return famFmtDate(iso); }
}
function skRange(a, b) { return !b || b === a ? skFmtDay(a) : skFmtDay(a) + ' – ' + skFmtDay(b); }
function skCanEdit() { return famCanEdit(); }
function skCanTick() { return !isCurrentUserGuest(); }
function skMin(t) { const p = String(t || '').split(':'); return p.length === 2 ? Number(p[0]) * 60 + Number(p[1]) : NaN; }
function skHm(min) { min = ((min % 1440) + 1440) % 1440; return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60); }
function skAction(id) { return SK_ACTIONS.find(a => a.id === id) || SK_ACTIONS[0]; }
function skColor(subject) {
  const s = String(subject || '').trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SK_COLORS[h % SK_COLORS.length];
}
function skNames(ids) { return (ids || []).map(id => memberById(id)).filter(Boolean).map(memberLabel).join(', '); }
function skKidColor(ids) { const m = memberById((ids || [])[0]); return m ? famColor(m) : '#8E5BB5'; }
function skAvatar(m) { return `<span class="fam-ava sm" style="--fam:${famAttr(famColor(m))}">${famAvatarInner(m)}</span>`; }
function skSubjects(p) {
  const own = [];
  ((p && p.lessons) || []).forEach(l => { const s = String(l.subject || '').trim(); if (s && !own.includes(s)) own.push(s); });
  return own;
}
function skTimes(p) { return ((p && Array.isArray(p.times)) ? p.times : []).filter(t => t && skTimeOk(t.from) && skTimeOk(t.to)).slice().sort((a, b) => a.from.localeCompare(b.from)); }
function skLessonsOn(p, wd) {
  const times = skTimes(p);
  return ((p && p.lessons) || []).filter(l => l && Number(l.day) === wd && times.some(t => t.id === l.slot) && String(l.subject || '').trim())
    .map(l => ({ ...l, idx: times.findIndex(t => t.id === l.slot), time: times.find(t => t.id === l.slot) }))
    .sort((a, b) => a.idx - b.idx);
}
function skDayPlan(p, wd) { const d = p && p.days && p.days[String(wd)]; return (d && typeof d === 'object') ? d : {}; }
function skClosureOn(mid, iso) { return skClosuresOf(mid).find(c => skIso(c.from) && c.from <= iso && (skIso(c.to) ? c.to : c.from) >= iso) || null; }
function skHolidayOn(p, iso) {
  try {
    const list = homeCalendarEvents().filter(e => e.date === iso);
    const f = list.find(e => e.pinnHoliday === 'feiertag');
    if (f) return f.title;
    if (!skIsKita(p)) { const s = list.find(e => e.pinnHoliday === 'ferien'); if (s) return s.title; }
  } catch (e) { /* home not set up yet */ }
  return '';
}
// Day info per child: closed, holidays, weekend or times with drop-off/pick-up
function skDayInfo(p, iso) {
  const wd = skWeekday(iso);
  const out = { wd, closed: null, holiday: '', weekend: wd === 0 || wd === 6, from: '', to: '', lessons: [], bring: '', pick: '' };
  out.closed = skClosureOn(p.memberId, iso);
  if (out.closed || out.weekend) return out;
  out.holiday = skHolidayOn(p, iso);
  if (out.holiday) return out;
  const d = skDayPlan(p, wd);
  out.lessons = skIsKita(p) ? [] : skLessonsOn(p, wd);
  const lf = out.lessons.length ? out.lessons[0].time.from : '', lt = out.lessons.length ? out.lessons[out.lessons.length - 1].time.to : '';
  out.from = skTimeOk(d.from) ? d.from : lf;
  out.to = skTimeOk(d.to) ? d.to : lt;
  out.bring = d.bring && memberById(d.bring) ? d.bring : '';
  out.pick = d.pick && memberById(d.pick) ? d.pick : '';
  return out;
}
function skDayLine(p, info) {
  if (info.closed) return '🚫 ' + (info.closed.reason ? 'Geschlossen: ' + info.closed.reason : 'Geschlossen');
  if (info.weekend) return 'Wochenende';
  if (info.holiday) return '🌴 ' + info.holiday;
  const parts = [];
  if (info.from && info.to) parts.push(info.from + '–' + info.to);
  if (info.lessons.length) parts.push(`${info.lessons.length} Std.`);
  if (info.bring) parts.push('bringt ' + memberLabel(memberById(info.bring)));
  if (info.pick) parts.push('holt ' + memberLabel(memberById(info.pick)));
  if (!parts.length) return skIsKita(p) ? 'Keine Betreuungszeit eingetragen' : 'Kein Unterricht eingetragen';
  return parts.join(' · ');
}
function skDueBadge(iso, done) {
  if (!skIso(iso)) return '';
  if (done) return `<span class="sk-badge ok">✓ erledigt</span>`;
  const d = skDaysBetween(skToday(), iso);
  if (d < 0) return `<span class="sk-badge urgent">überfällig</span>`;
  if (d === 0) return `<span class="sk-badge urgent">bis heute</span>`;
  if (d === 1) return `<span class="sk-badge warn">bis morgen</span>`;
  return `<span class="sk-badge${d <= 6 ? ' warn' : ''}">bis ${escapeHtml(skFmtDay(iso))}</span>`;
}
function skCardHead(title, btns) {
  return `<div class="flex items-center justify-between gap-2 mb-2"><div class="fz-h" style="margin-bottom:0">${title}</div><div class="flex items-center gap-1.5">${btns || ''}</div></div>`;
}
function skKiOn() { return !!(typeof recipeKiStatus !== 'undefined' && recipeKiStatus && recipeKiStatus.aktiv); }
function skKiCheck() {
  if (skKiOn() || typeof recipeKiLoadStatus !== 'function') return;
  Promise.resolve(recipeKiLoadStatus()).then(() => { if (skKiOn() && currentView === 'familie' && famTab === 'schule' && !famDetailId) renderFamily(); }).catch(() => { /* offline */ });
}

/* ---------- Overview: today / tomorrow ---------- */
function skTodayCardHtml() {
  const profs = skProfiles();
  if (!profs.length) return '';
  const now = new Date();
  const tomorrow = now.getHours() >= 17;
  const iso = tomorrow ? skAddDays(skToday(), 1) : skToday();
  const today = skToday();
  const rows = profs.map(p => {
    const m = memberById(p.memberId);
    const info = skDayInfo(p, iso);
    return `<button type="button" class="sk-today-row" data-sk="open" data-id="${famAttr(p.memberId)}">
      ${skAvatar(m)}
      <span class="min-w-0 flex-1 text-left">
        <span class="block text-sm font-medium truncate">${escapeHtml(memberLabel(m))} <span class="text-ink/40 font-normal">· ${skIcon(p)} ${escapeHtml(skName(p))}</span></span>
        <span class="block text-[11px] ${info.closed ? 'text-red-600' : 'text-ink/55'}">${escapeHtml(skDayLine(p, info))}</span>
      </span>
      <span class="text-ink/30 text-lg leading-none">›</span>
    </button>`;
  }).join('');
  const kidIds = profs.map(p => p.memberId);
  const alerts = [];
  const letters = skLettersOf('').filter(l => !l.done && skIso(l.deadline) && skDaysBetween(today, l.deadline) <= 7 && l.memberIds.some(id => kidIds.includes(id)))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  letters.slice(0, 4).forEach(l => {
    const a = skAction(l.action);
    alerts.push(`<button type="button" class="sk-alert" data-sk="openletter" data-id="${famAttr(l.id)}"><span>${a.icon}</span><span class="min-w-0 flex-1 text-left truncate">${escapeHtml(l.title)}</span>${skDueBadge(l.deadline, false)}</button>`);
  });
  const hwDue = skHomeworkOf('').filter(h => !h.done && skIso(h.due) && h.due <= skAddDays(today, 1) && kidIds.includes(h.memberId));
  if (hwDue.length) {
    const byKid = {};
    hwDue.forEach(h => { byKid[h.memberId] = (byKid[h.memberId] || 0) + 1; });
    Object.keys(byKid).forEach(mid => {
      alerts.push(`<button type="button" class="sk-alert" data-sk="open" data-id="${famAttr(mid)}"><span>📚</span><span class="min-w-0 flex-1 text-left truncate">${escapeHtml(memberLabel(memberById(mid)))}: ${byKid[mid]} Hausaufgaben offen</span></button>`);
    });
  }
  const seenClosure = new Set();
  skClosuresOf('').filter(c => skIso(c.from) && (c.to || c.from) >= today && skDaysBetween(today, c.from) <= 14 && c.memberIds.some(id => kidIds.includes(id)))
    .sort((a, b) => a.from.localeCompare(b.from)).forEach(c => {
      if (seenClosure.has(c.id)) return;
      seenClosure.add(c.id);
      alerts.push(`<button type="button" class="sk-alert" data-sk="open" data-id="${famAttr(c.memberIds[0])}"><span>🚫</span><span class="min-w-0 flex-1 text-left truncate">${escapeHtml(c.reason || 'Schließtag')} · ${escapeHtml(skNames(c.memberIds))}</span><span class="sk-badge warn">${escapeHtml(skRange(c.from, c.to))}</span></button>`);
    });
  return `<div class="fam-card">
    ${skCardHead(`🎒 Schule & Kita · ${tomorrow ? 'Morgen' : 'Heute'}`, `<button type="button" class="fz-mini-btn" data-famtabgo="schule">Alle ›</button>`)}
    <div class="flex flex-col">${rows}</div>
    ${alerts.length ? `<div class="flex flex-col gap-1.5 mt-2">${alerts.join('')}</div>` : ''}
  </div>`;
}
// Profile of a person: short version
function skMemberCardHtml(m, p) {
  const today = skToday();
  const info = skDayInfo(p, today);
  const hw = skHomeworkOf(m.id).filter(h => !h.done).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9'))).slice(0, 3);
  const letters = skLettersOf(m.id).filter(l => !l.done).sort((a, b) => String(a.deadline || '9').localeCompare(String(b.deadline || '9'))).slice(0, 3);
  const next = skClosuresOf(m.id).filter(c => skIso(c.from) && (c.to || c.from) >= today).sort((a, b) => a.from.localeCompare(b.from))[0];
  return `<div class="fam-card">
    ${skCardHead(`${skIcon(p)} ${escapeHtml(skName(p))}`, `<button type="button" class="fz-mini-btn" data-sk="open" data-id="${famAttr(m.id)}">Öffnen ›</button>`)}
    <div class="text-sm ${info.closed ? 'text-red-600' : ''}">${escapeHtml(skDayLine(p, info))}</div>
    ${hw.length ? `<div class="mt-2">${hw.map(h => skHwRowHtml(h, true)).join('')}</div>` : ''}
    ${letters.length ? `<div class="mt-1">${letters.map(l => skLetterRowHtml(l, true)).join('')}</div>` : ''}
    ${next ? `<div class="text-[11px] text-ink/55 mt-2">🚫 ${escapeHtml(next.reason || 'Schließtag')} · ${escapeHtml(skRange(next.from, next.to))}</div>` : ''}
  </div>`;
}

/* ---------- Tab "School & daycare" ---------- */
function skPaneHtml() {
  const profs = skProfiles();
  const can = skCanEdit();
  if (!profs.length) {
    return `<div class="fam-card text-center py-7 px-4">
      <div class="text-5xl mb-2">🎒</div>
      <div class="font-serif text-lg mb-1">Schule & Kita</div>
      <p class="text-sm text-ink/55 mb-4">Stundenplan, Hausaufgaben, Elternbriefe mit Fristen und Schließtage – je Kind an einem Ort. Schließtage und Fristen erscheinen automatisch im Kalender.</p>
      ${can ? '<button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-sk="addkid">Kind einrichten</button>' : '<p class="text-xs text-ink/40">Einrichten kann ein Erwachsener der Familie.</p>'}
    </div>`;
  }
  if (!skProfile(skKid)) skKid = profs[0].memberId;
  const p = skProfile(skKid);
  const m = memberById(skKid);
  const free = members.filter(x => !famIsPet(x) && !skProfile(x.id));
  const chips = profs.map(x => {
    const mm = memberById(x.memberId);
    return `<button type="button" class="fz-filter-chip sk-kid-chip${x.memberId === skKid ? ' active' : ''}" data-sk="kid" data-id="${famAttr(x.memberId)}">${skAvatar(mm)}<span>${escapeHtml(memberLabel(mm))}</span></button>`;
  }).join('') + (can && free.length ? `<button type="button" class="fz-filter-chip sk-kid-chip" data-sk="addkid">＋ Kind</button>` : '');
  return `
    <div class="fam-chip-row" style="padding-bottom:2px">${chips}</div>
    ${skHeroHtml(p, m)}
    ${skIsKita(p) ? '' : skTimetableHtml(p)}
    ${skDaysCardHtml(p)}
    ${skIsKita(p) ? '' : skHomeworkCardHtml(p)}
    ${skLettersCardHtml(p)}
    ${skClosuresCardHtml(p)}`;
}
function skHeroHtml(p, m) {
  const sub = [p.group, p.contact].filter(x => String(x || '').trim()).join(' · ');
  const today = skToday();
  const info = skDayInfo(p, today);
  const tm = skDayInfo(p, skAddDays(today, 1));
  return `<div class="fam-card">
    <div class="flex items-start gap-3">
      <span class="sk-hero-ic" style="--sk:${famAttr(famColor(m))}">${skIcon(p)}</span>
      <div class="min-w-0 flex-1">
        <div class="font-serif text-lg leading-tight">${escapeHtml(skName(p))}</div>
        ${sub ? `<div class="text-xs text-ink/55 mt-0.5">${escapeHtml(sub)}</div>` : ''}
      </div>
      ${skCanEdit() ? `<button type="button" class="fz-mini-btn" data-sk="editprofile" data-id="${famAttr(p.memberId)}">Bearbeiten</button>` : ''}
    </div>
    <div class="sk-daygrid mt-3">
      <div><span class="sk-k">Heute</span><span class="${info.closed ? 'text-red-600' : ''}">${escapeHtml(skDayLine(p, info))}</span></div>
      <div><span class="sk-k">Morgen</span><span class="${tm.closed ? 'text-red-600' : ''}">${escapeHtml(skDayLine(p, tm))}</span></div>
    </div>
    ${(p.phone || p.email) ? `<div class="flex flex-wrap gap-2 mt-3">
      ${p.phone ? `<a class="fz-mini-btn" href="${famAttr(famTel(p.phone))}">📞 Anrufen</a>` : ''}
      ${p.email ? `<a class="fz-mini-btn" href="mailto:${famAttr(p.email)}">✉️ E-Mail</a>` : ''}
    </div>` : ''}
    ${p.note ? `<div class="text-xs text-ink/60 mt-3" style="white-space:pre-wrap">${escapeHtml(p.note)}</div>` : ''}
  </div>`;
}
function skTimetableHtml(p) {
  const can = skCanEdit();
  const times = skTimes(p);
  const ki = skKiOn() && can;
  const busy = skKiBusy === p.memberId;
  const btns = [
    ki ? `<button type="button" class="fz-mini-btn" data-sk="kiplan" data-id="${famAttr(p.memberId)}"${busy ? ' disabled' : ''}>📷 Foto</button>` : '',
    can ? `<button type="button" class="fz-mini-btn" data-sk="times" data-id="${famAttr(p.memberId)}">⏱ Zeiten</button>` : '',
  ].join('');
  const msg = skKiMsg && skKiMsg.memberId === p.memberId ? `<p class="text-xs mb-2 ${skKiMsg.bad ? 'text-red-500' : 'text-ink/55'}">${escapeHtml(skKiMsg.text)}</p>` : '';
  if (!times.length) {
    return `<div class="fam-card">${skCardHead('📅 Stundenplan', btns)}${msg}
      <p class="text-sm text-ink/50">${ki ? 'Noch kein Stundenplan. Lege die Stundenzeiten fest – oder fotografiere den Stundenplan, die KI trägt ihn ein.' : 'Noch kein Stundenplan. Lege zuerst die Stundenzeiten fest.'}</p>
      ${can ? `<button type="button" class="fz-mini-btn primary mt-3" data-sk="times" data-id="${famAttr(p.memberId)}">Stundenzeiten festlegen</button>` : ''}
    </div>`;
  }
  const wdToday = new Date().getDay();
  const lessons = (p.lessons || []).filter(l => l && String(l.subject || '').trim());
  const head = `<tr><th></th>${SK_DAYS.map(([n, s]) => `<th class="${n === wdToday ? 'today' : ''}">${s}</th>`).join('')}</tr>`;
  const body = times.map((t, i) => `<tr>
      <td class="sk-slot"><b>${i + 1}.</b><br>${escapeHtml(t.from)}<br>${escapeHtml(t.to)}</td>
      ${SK_DAYS.map(([n]) => {
        const l = lessons.find(x => Number(x.day) === n && x.slot === t.id);
        const inner = l ? `<span>${escapeHtml(l.subject)}</span>${l.room ? `<small>${escapeHtml(l.room)}</small>` : ''}` : '';
        const cls = `sk-cell${l ? ' has' : ''}${can ? ' can' : ''}`;
        const attrs = can ? ` data-sk="lesson" data-id="${famAttr(p.memberId)}" data-day="${n}" data-slot="${famAttr(t.id)}"` : '';
        return `<td class="${n === wdToday ? 'today' : ''}"><${can ? 'button type="button"' : 'div'} class="${cls}"${l ? ` style="--sk:${skColor(l.subject)}"` : ''}${attrs}>${inner}</${can ? 'button' : 'div'}></td>`;
      }).join('')}
    </tr>`).join('');
  return `<div class="fam-card">${skCardHead('📅 Stundenplan', btns)}${msg}
    ${busy ? '<p class="text-xs text-ink/55 mb-2">✨ KI liest den Stundenplan …</p>' : ''}
    <div class="sk-tt-wrap"><table class="sk-tt">${head}${body}</table></div>
    ${can && !lessons.length ? '<p class="text-[11px] text-ink/45 mt-2">Tippe auf ein Feld, um das Fach einzutragen.</p>' : ''}
  </div>`;
}
function skDaysCardHtml(p) {
  const kita = skIsKita(p);
  const rows = SK_DAYS.map(([n, , long]) => {
    const d = skDayPlan(p, n);
    const ls = kita ? [] : skLessonsOn(p, n);
    const from = skTimeOk(d.from) ? d.from : (ls.length ? ls[0].time.from : '');
    const to = skTimeOk(d.to) ? d.to : (ls.length ? ls[ls.length - 1].time.to : '');
    const who = [d.bring && memberById(d.bring) ? '→ ' + memberLabel(memberById(d.bring)) : '', d.pick && memberById(d.pick) ? '← ' + memberLabel(memberById(d.pick)) : ''].filter(Boolean).join('  ');
    return `<div class="sk-dayrow">
      <span class="sk-dayname">${long}</span>
      <span class="sk-daytime">${from && to ? escapeHtml(from + '–' + to) : '–'}</span>
      <span class="sk-daywho">${escapeHtml(who)}</span>
    </div>`;
  }).join('');
  const any = SK_DAYS.some(([n]) => { const d = skDayPlan(p, n); return d.from || d.to || d.bring || d.pick; });
  return `<div class="fam-card">
    ${skCardHead(kita ? '🕒 Betreuungszeiten' : '🚸 Bringen & Abholen', skCanEdit() ? `<button type="button" class="fz-mini-btn" data-sk="days" data-id="${famAttr(p.memberId)}">Bearbeiten</button>` : '')}
    ${rows}
    ${!any ? `<p class="text-[11px] text-ink/45 mt-2">${kita ? 'Trage die Betreuungszeiten ein und wer bringt bzw. abholt.' : 'Wer bringt und wer holt ab? Trage es für jeden Tag ein.'}</p>` : '<p class="text-[11px] text-ink/40 mt-2">→ bringt · ← holt ab</p>'}
  </div>`;
}
function skHwRowHtml(h, compact) {
  const subj = String(h.subject || '').trim();
  return `<div class="sk-row${h.done ? ' done' : ''}">
    <button type="button" class="sk-chk${h.done ? ' on' : ''}" data-sk="hwtoggle" data-id="${famAttr(h.id)}"${skCanTick() ? '' : ' disabled'} aria-label="Erledigt">✓</button>
    <${skCanEdit() ? 'button type="button"' : 'div'} class="sk-main"${skCanEdit() ? ` data-sk="hw" data-id="${famAttr(h.id)}"` : ''}>
      <div class="sk-t">${subj ? `<span class="sk-subj" style="--sk:${skColor(subj)}"></span><b>${escapeHtml(subj)}</b>${h.text ? ': ' : ''}` : ''}${escapeHtml(h.text || '')}</div>
      ${compact ? '' : (h.due ? `<div class="sk-s">${skDueBadge(h.due, h.done)}</div>` : '')}
    </${skCanEdit() ? 'button' : 'div'}>
    ${compact && h.due ? skDueBadge(h.due, h.done) : ''}
  </div>`;
}
function skHomeworkCardHtml(p) {
  const all = skHomeworkOf(p.memberId);
  const open = all.filter(h => !h.done).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')));
  const done = all.filter(h => h.done).sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || '')));
  return `<div class="fam-card">
    ${skCardHead('📚 Hausaufgaben', skCanEdit() ? `<button type="button" class="fz-mini-btn primary" data-sk="hwnew" data-id="${famAttr(p.memberId)}">+ Neu</button>` : '')}
    ${open.length ? open.map(h => skHwRowHtml(h)).join('') : '<p class="text-sm text-ink/45">Keine offenen Hausaufgaben 🎉</p>'}
    ${done.length ? `<button type="button" class="text-[11px] text-ink/50 hover:text-pine mt-2" data-sk="showdone">${skShowDone ? 'Erledigte ausblenden' : `Erledigte anzeigen (${done.length})`}</button>
      ${skShowDone ? `<div class="mt-1">${done.slice(0, 20).map(h => skHwRowHtml(h)).join('')}</div>` : ''}` : ''}
  </div>`;
}
function skLetterRowHtml(l, compact) {
  const a = skAction(l.action);
  const facts = [l.sender, l.amount !== '' && l.amount != null && isFinite(Number(l.amount)) && Number(l.amount) > 0 ? fmtEur(Number(l.amount)) : '', compact ? '' : (l.memberIds.length > 1 ? skNames(l.memberIds) : '')].filter(Boolean).join(' · ');
  const task = l.taskId && !l.done && typeof aufgaben !== 'undefined' && aufgaben.some(t => t.id === l.taskId) ? ' · 🔔' : '';
  return `<div class="sk-row${l.done ? ' done' : ''}">
    <button type="button" class="sk-chk${l.done ? ' on' : ''}" data-sk="letterdone" data-id="${famAttr(l.id)}"${skCanEdit() ? '' : ' disabled'} aria-label="Erledigt">✓</button>
    <${skCanEdit() ? 'button type="button"' : 'div'} class="sk-main"${skCanEdit() ? ` data-sk="letter" data-id="${famAttr(l.id)}"` : ''}>
      <div class="sk-t">${a.icon} ${escapeHtml(l.title)}</div>
      ${!compact && (facts || l.deadline || task) ? `<div class="sk-s">${l.deadline ? skDueBadge(l.deadline, l.done) + ' ' : ''}${escapeHtml(facts)}${task}</div>` : ''}
    </${skCanEdit() ? 'button' : 'div'}>
    ${compact && l.deadline ? skDueBadge(l.deadline, l.done) : ''}
  </div>`;
}
function skLettersCardHtml(p) {
  const all = skLettersOf(p.memberId);
  const open = all.filter(l => !l.done).sort((a, b) => String(a.deadline || '9').localeCompare(String(b.deadline || '9')));
  const done = all.filter(l => l.done).sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || '')));
  const can = skCanEdit();
  return `<div class="fam-card">
    ${skCardHead('✉️ Elternbriefe', can ? `${skKiOn() ? `<button type="button" class="fz-mini-btn" data-sk="letterki" data-id="${famAttr(p.memberId)}">📷 Foto</button>` : ''}<button type="button" class="fz-mini-btn primary" data-sk="letternew" data-id="${famAttr(p.memberId)}">+ Neu</button>` : '')}
    ${open.length ? open.map(l => skLetterRowHtml(l)).join('') : '<p class="text-sm text-ink/45">Keine offenen Elternbriefe.</p>'}
    ${done.length ? `<button type="button" class="text-[11px] text-ink/50 hover:text-pine mt-2" data-sk="showdone">${skShowDone ? 'Erledigte ausblenden' : `Erledigte anzeigen (${done.length})`}</button>
      ${skShowDone ? `<div class="mt-1">${done.slice(0, 20).map(l => skLetterRowHtml(l)).join('')}</div>` : ''}` : ''}
  </div>`;
}
function skClosuresCardHtml(p) {
  const today = skToday();
  const list = skClosuresOf(p.memberId).filter(c => skIso(c.from) && (skIso(c.to) ? c.to : c.from) >= today).sort((a, b) => a.from.localeCompare(b.from));
  const can = skCanEdit();
  return `<div class="fam-card">
    ${skCardHead('🚫 Schließtage', can ? `<button type="button" class="fz-mini-btn primary" data-sk="closurenew" data-id="${famAttr(p.memberId)}">+ Neu</button>` : '')}
    ${list.length ? list.map(c => {
      const days = skDaysBetween(c.from, skIso(c.to) ? c.to : c.from) + 1;
      return `<div class="sk-row">
        <span class="sk-chk sk-cal">📅</span>
        <${can ? 'button type="button"' : 'div'} class="sk-main"${can ? ` data-sk="closure" data-id="${famAttr(c.id)}"` : ''}>
          <div class="sk-t">${escapeHtml(c.reason || 'Schließtag')}</div>
          <div class="sk-s">${escapeHtml(skRange(c.from, c.to))}${days > 1 ? ` · ${days} Tage` : ''}${c.memberIds.length > 1 ? ' · ' + escapeHtml(skNames(c.memberIds)) : ''}</div>
        </${can ? 'button' : 'div'}>
      </div>`;
    }).join('') : '<p class="text-sm text-ink/45">Keine anstehenden Schließtage.</p>'}
    <p class="text-[11px] text-ink/40 mt-2">Schließtage und Fristen von Elternbriefen erscheinen automatisch im Kalender.</p>
  </div>`;
}

/* ---------- Saving ---------- */
function skPrune() {
  const today = skToday();
  const old = skAddDays(today, -30);
  schoolHomework = (schoolHomework || []).filter(h => !(h.done && String(h.doneAt || '').slice(0, 10) < old));
  const oldL = skAddDays(today, -180);
  schoolLetters = (schoolLetters || []).filter(l => !(l.done && String(l.doneAt || '').slice(0, 10) < oldL));
  const oldC = skAddDays(today, -60);
  schoolClosures = (schoolClosures || []).filter(c => (skIso(c.to) ? c.to : c.from) >= oldC);
}
function skCommit(calendar) {
  skPrune();
  persistState();
  if (calendar) { skCalSig = ''; try { rebuildEvents(); renderCalendar(); } catch (e) { /* calendar not built yet */ } }
  try { if (kidPageMemberId) renderKidPage(); } catch (e) { /* ignore */ }
  renderFamily();
}
function skUpsert(listName, item) {
  const list = (listName === 'profiles' ? schoolProfiles : listName === 'hw' ? schoolHomework : listName === 'letters' ? schoolLetters : schoolClosures) || [];
  const next = list.some(x => x.id === item.id) ? list.map(x => x.id === item.id ? item : x) : [...list, item];
  if (listName === 'profiles') schoolProfiles = next;
  else if (listName === 'hw') schoolHomework = next;
  else if (listName === 'letters') schoolLetters = next;
  else schoolClosures = next;
}
function skToggleHomework(id) {
  if (!skCanTick()) return;
  const h = skHomeworkOf('').find(x => x.id === id);
  if (!h) return;
  const done = !h.done;
  skUpsert('hw', { ...h, done, doneAt: done ? new Date().toISOString() : '' });
  skCommit(false);
}
function skTaskOf(l) { return l && l.taskId && typeof aufgaben !== 'undefined' ? (aufgaben.find(t => t.id === l.taskId) || null) : null; }
function skTaskTitle(l) {
  const a = skAction(l.action);
  const names = skNames(l.memberIds);
  return (a.icon + ' ' + (a.id === 'lesen' ? 'Elternbrief lesen' : a.label) + ': ' + l.title + (names ? ' (' + names + ')' : '')).slice(0, 200);
}
// Create, change, tick off or remove the task for a parent letter
function skSyncLetterTask(l, prev) {
  if (typeof queueTaskSave !== 'function') return l;
  const task = skTaskOf(prev || l);
  const want = !!(l.taskOn && skIso(l.deadline) && Array.isArray(l.taskFor) && l.taskFor.length && !l.done);
  let changed = false;
  if (want) {
    const notes = buildAssignedNotes([l.sender ? 'Von: ' + l.sender : '', l.note || ''].filter(Boolean).join('\n'), l.taskFor);
    const payload = { id: task ? task.id : newRecordId(), title: skTaskTitle(l), notes, dueDate: l.deadline, fromTime: '', toTime: '' };
    const same = task && task.title === payload.title && task.dueDate === payload.dueDate && String(task.notes || '') === payload.notes;
    if (!same) { queueTaskSave(payload, !task); changed = true; }
    if (task && task.done) { queueTaskDone(task.id, false); changed = true; }
    l = { ...l, taskId: payload.id };
  } else if (task) {
    if (l.done) { if (!task.done) { queueTaskDone(task.id, true); changed = true; } }
    else { queueTaskDelete(task.id); changed = true; l = { ...l, taskId: '' }; }
  }
  if (changed) { try { rebuildAufgaben(); renderTasks(); flushOutbox(); } catch (e) { /* ignore */ } }
  return l;
}
// Task ticked off (also on another device) → letter done
function skSyncFromTasks() {
  if (isCurrentUserGuest() || typeof aufgabenLoaded === 'undefined' || !aufgabenLoaded) return;
  let changed = false;
  schoolLetters = (schoolLetters || []).map(l => {
    if (l.done || !l.taskId) return l;
    const t = skTaskOf(l);
    if (!t || !t.done) return l;
    changed = true;
    return { ...l, done: true, doneAt: t.doneAt || new Date().toISOString() };
  });
  if (changed) { persistState(); skCalSig = ''; try { rebuildEvents(); renderCalendar(); } catch (e) { /* ignore */ } }
}
function skToggleLetter(id) {
  if (!skCanEdit()) return;
  const l = skLettersOf('').find(x => x.id === id);
  if (!l) return;
  const done = !l.done;
  let next = { ...l, done, doneAt: done ? new Date().toISOString() : '' };
  const task = skTaskOf(l);
  if (task && typeof queueTaskDone === 'function') {
    queueTaskDone(task.id, done);
    try { rebuildAufgaben(); renderTasks(); flushOutbox(); } catch (e) { /* ignore */ }
  } else if (!done) {
    next = skSyncLetterTask(next, l);
  }
  skUpsert('letters', next);
  skCommit(true);
}

/* ---------- Calendar: closure days and deadlines ---------- */
function schoolCalendarEvents() {
  const sig = JSON.stringify([schoolClosures, (schoolLetters || []).map(l => [l.id, l.deadline, l.done, l.title, l.action, l.memberIds]), skProfiles().map(p => [p.memberId, p.name, p.type]), members.map(m => [m.id, m.name, m.color, m.role, m.displayMode])]);
  if (sig === skCalSig) return skCalList;
  const out = [];
  const mk = (id, date, title, desc, color) => ({
    id, date, time: '', endTime: null, title, memberId: null, location: '', description: desc,
    fullDayFiller: false, pinnHref: '', pinnCalName: '', isRecurring: false, pinnHoliday: 'schule', pinnColor: color,
  });
  (schoolClosures || []).forEach(c => {
    if (!c || !skIso(c.from) || !Array.isArray(c.memberIds)) return;
    const ids = c.memberIds.filter(id => memberById(id));
    if (!ids.length) return;
    const to = skIso(c.to) && c.to >= c.from ? c.to : c.from;
    const places = [...new Set(ids.map(id => skProfile(id)).filter(Boolean).map(skName))].join(', ');
    const title = (c.reason || 'Schließtag') + ' · ' + skNames(ids);
    const desc = 'Schließtag' + (places ? ' – ' + places : '') + ': ' + famFmtDate(c.from) + (to !== c.from ? ' – ' + famFmtDate(to) : '');
    let d = c.from, guard = 0;
    while (d <= to && guard++ < 120) {
      const wd = skWeekday(d);
      if (wd !== 0 && wd !== 6) out.push(mk('pinn-sk-' + c.id + '-' + d, d, '🚫 ' + title, desc, skKidColor(ids)));
      d = skAddDays(d, 1);
    }
  });
  (schoolLetters || []).forEach(l => {
    if (!l || l.done || !skIso(l.deadline) || !Array.isArray(l.memberIds)) return;
    const a = skAction(l.action);
    out.push(mk('pinn-sb-' + l.id, l.deadline, a.icon + ' ' + l.title + (l.memberIds.length ? ' · ' + skNames(l.memberIds) : ''),
      'Elternbrief' + (l.sender ? ' – ' + l.sender : '') + ': ' + a.label + ' bis ' + famFmtDate(l.deadline), skKidColor(l.memberIds)));
  });
  skCalSig = sig;
  skCalList = out;
  return out;
}

/* ---------- Child page: homework ---------- */
function kidHomeworkHtml(m) {
  if (!m || !skProfile(m.id) || skIsKita(skProfile(m.id))) return '';
  const today = skToday();
  const tomorrow = skAddDays(today, 1);
  const list = skHomeworkOf(m.id).filter(h => (!h.done && (!h.due || h.due <= tomorrow)) || (h.done && String(h.doneAt || '').slice(0, 10) === today))
    .sort((a, b) => (a.done - b.done) || String(a.due || '').localeCompare(String(b.due || '')));
  if (!list.length) return '';
  return `<div class="kid-hw">
    <div class="kid-hw-h">📚 Hausaufgaben</div>
    ${list.map(h => `<button type="button" class="kid-hw-row${h.done ? ' done' : ''}" data-khw="${kidAttr(h.id)}">
      <span class="kid-hw-chk">${h.done ? '✓' : ''}</span>
      <span class="kid-hw-t">${h.subject ? `<b>${escapeHtml(h.subject)}</b> ` : ''}${escapeHtml(h.text || '')}</span>
    </button>`).join('')}
  </div>`;
}

/* ---------- Popups ---------- */
function skErr(msg) { fzShowErr('skErr', msg); }
function skFooter(canDelete, delLabel) {
  return `<p id="skErr" class="hidden text-xs text-red-500 mt-1 mb-2"></p>
    <div class="flex items-center justify-between gap-2 mt-4">
      ${canDelete ? `<button type="button" class="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50" data-skm="del">${delLabel || 'Löschen'}</button>` : '<span></span>'}
      <div class="flex gap-2">
        <button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-skm="cancel">Abbrechen</button>
        <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-skm="save">Speichern</button>
      </div>
    </div>`;
}
function skKidChips(selected, field) {
  const profs = skProfiles();
  if (profs.length < 2) return '';
  return `<label class="fz-lbl">Für</label><div class="flex flex-wrap gap-1.5 mb-3">${profs.map(p => {
    const m = memberById(p.memberId);
    return `<button type="button" class="fz-filter-chip sk-kid-chip${selected.includes(p.memberId) ? ' active' : ''}" data-skm="${field}" data-id="${famAttr(p.memberId)}">${skAvatar(m)}<span>${escapeHtml(memberLabel(m))}</span></button>`;
  }).join('')}</div>`;
}
function skMemberSelect(id, label, value) {
  const opts = members.filter(m => !famIsPet(m)).map(m => `<option value="${famAttr(m.id)}"${value === m.id ? ' selected' : ''}>${escapeHtml(memberLabel(m))}</option>`).join('');
  return `<div class="fz-field"><label class="fz-lbl" for="${id}">${escapeHtml(label)}</label><select id="${id}" class="fz-in"><option value="">–</option>${opts}</select></div>`;
}
function skOpen(html, state, onReady) {
  skModal = state;
  famOpenModal(html, onReady);
}
function skClose() { famCloseModal(); skModal = null; }

// School or daycare of a child
function skOpenProfile(mid, preset) {
  if (!skCanEdit()) return;
  const p = skProfile(mid);
  const free = members.filter(x => !famIsPet(x) && (!skProfile(x.id) || x.id === mid));
  if (!p && !free.length) { finShowToast('Alle haben schon Schule oder Kita', true); return; }
  const pick = p ? p.memberId : (preset && free.some(x => x.id === preset) ? preset : free[0].id);
  const type = p ? p.type : 'schule';
  const html = `
    <h3 class="font-serif text-lg mb-1">${p ? 'Schule & Kita · ' + escapeHtml(memberLabel(memberById(p.memberId))) : 'Schule oder Kita einrichten'}</h3>
    <p class="text-xs text-ink/50 mb-4">Stundenplan, Hausaufgaben und Elternbriefe gibt es je Kind. Leere Felder werden nicht angezeigt.</p>
    ${p ? '' : `<div class="fz-field"><label class="fz-lbl" for="skP_member">Kind</label><select id="skP_member" class="fz-in">${free.map(x => `<option value="${famAttr(x.id)}"${x.id === pick ? ' selected' : ''}>${escapeHtml(memberLabel(x))}</option>`).join('')}</select></div>`}
    <div class="fz-type-row mb-3">
      <button type="button" class="fz-type-chip${type !== 'kita' ? ' active' : ''}" data-skm="type" data-v="schule"><span class="fz-ti">🏫</span>Schule</button>
      <button type="button" class="fz-type-chip${type === 'kita' ? ' active' : ''}" data-skm="type" data-v="kita"><span class="fz-ti">🧸</span>Kita</button>
    </div>
    ${fzIn('skP_name', 'Name der Einrichtung', p ? p.name : '', { ph: 'z. B. Grundschule am Park', max: 120 })}
    <div class="fz-grid2">
      ${fzIn('skP_group', 'Klasse / Gruppe', p ? p.group : '', { ph: 'z. B. 3b', max: 60 })}
      ${fzIn('skP_contact', 'Lehrkraft / Erzieher:in', p ? p.contact : '', { ph: 'z. B. Frau Müller', max: 80 })}
    </div>
    <div class="fz-grid2">
      ${fzIn('skP_phone', 'Telefon', p ? p.phone : '', { type: 'tel', mode: 'tel', max: 40 })}
      ${fzIn('skP_email', 'E-Mail', p ? p.email : '', { type: 'email', mode: 'email', max: 120 })}
    </div>
    ${famTa('skP_note', 'Notizen', p ? p.note : '', 'z. B. Krankmeldung bis 7:45 Uhr im Sekretariat')}
    ${skFooter(!!p, 'Entfernen')}`;
  skOpen(html, { kind: 'profile', memberId: p ? p.memberId : '', type });
}
function skSaveProfile() {
  const st = skModal;
  const mid = st.memberId || famVal('skP_member');
  if (!memberById(mid)) return skErr('Bitte ein Kind wählen.');
  const old = skProfile(mid);
  skUpsert('profiles', {
    ...(old || {}),
    id: mid, memberId: mid, type: st.type === 'kita' ? 'kita' : 'schule',
    name: famVal('skP_name'), group: famVal('skP_group'), contact: famVal('skP_contact'),
    phone: famVal('skP_phone'), email: famVal('skP_email'), note: famVal('skP_note'),
    times: old && Array.isArray(old.times) ? old.times : [],
    lessons: old && Array.isArray(old.lessons) ? old.lessons : [],
    days: old && old.days && typeof old.days === 'object' ? old.days : {},
    updated: new Date().toISOString(),
  });
  skKid = mid;
  skClose();
  if (currentView === 'familie' && !famDetailId) famTab = 'schule';
  skCommit(true);
  finShowToast('Gespeichert');
}
function skDeleteProfile() {
  const mid = skModal.memberId;
  const m = memberById(mid);
  if (!m || !confirm(`Schule & Kita für ${memberLabel(m)} entfernen? Stundenplan und Hausaufgaben werden gelöscht.`)) return;
  schoolProfiles = (schoolProfiles || []).filter(p => p.memberId !== mid);
  schoolHomework = (schoolHomework || []).filter(h => h.memberId !== mid);
  const letters = [];
  (schoolLetters || []).forEach(l => {
    const ids = (l.memberIds || []).filter(x => x !== mid);
    if (ids.length) letters.push({ ...l, memberIds: ids });
    else { const t = skTaskOf(l); if (t && !t.done && typeof queueTaskDelete === 'function') queueTaskDelete(t.id); }
  });
  schoolLetters = letters;
  schoolClosures = (schoolClosures || []).map(c => ({ ...c, memberIds: (c.memberIds || []).filter(x => x !== mid) })).filter(c => c.memberIds.length);
  try { rebuildAufgaben(); renderTasks(); flushOutbox(); } catch (e) { /* ignore */ }
  skKid = '';
  skClose();
  skCommit(true);
}

// Lesson times
function skPresetTimes() {
  return [['08:00', '08:45'], ['08:50', '09:35'], ['09:55', '10:40'], ['10:45', '11:30'], ['11:50', '12:35'], ['12:40', '13:25']]
    .map(([from, to]) => ({ id: newRecordId(), from, to }));
}
function skTimesRowsHtml() {
  const rows = skModal.rows;
  if (!rows.length) return '<p class="text-xs text-ink/45">Noch keine Stunden.</p>';
  return rows.map((r, i) => `<div class="fam-list-row sk-time-row">
      <span class="sk-time-n">${i + 1}.</span>
      <input type="time" class="fz-in" data-skfrom="${i}" value="${famAttr(r.from)}" aria-label="Beginn" />
      <span class="text-ink/40">–</span>
      <input type="time" class="fz-in" data-skto="${i}" value="${famAttr(r.to)}" aria-label="Ende" />
      <button type="button" class="fam-x" data-skm="rmtime" data-i="${i}" aria-label="Entfernen">×</button>
    </div>`).join('');
}
function skSyncTimes() {
  if (!skModal || skModal.kind !== 'times') return;
  skModal.rows = skModal.rows.map((r, i) => ({
    ...r,
    from: (document.querySelector(`[data-skfrom="${i}"]`) || {}).value || r.from,
    to: (document.querySelector(`[data-skto="${i}"]`) || {}).value || r.to,
  }));
}
function skRenderTimes() { const el = document.getElementById('skTimesList'); if (el) el.innerHTML = skTimesRowsHtml(); }
function skOpenTimes(mid) {
  const p = skProfile(mid);
  if (!p || !skCanEdit()) return;
  const rows = skTimes(p).map(t => ({ ...t }));
  const html = `
    <h3 class="font-serif text-lg mb-1">Stundenzeiten</h3>
    <p class="text-xs text-ink/50 mb-4">Beginn und Ende jeder Stunde – Pausen einfach auslassen.</p>
    <div id="skTimesList" class="flex flex-col gap-2 mb-3"></div>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="fz-mini-btn" data-skm="addtime">+ Stunde</button>
      <button type="button" class="fz-mini-btn" data-skm="preset">Vorlage: 6 × 45 Min.</button>
    </div>
    ${skFooter(false)}`;
  skOpen(html, { kind: 'times', memberId: mid, rows }, () => skRenderTimes());
}
function skSaveTimes() {
  skSyncTimes();
  const st = skModal;
  const p = skProfile(st.memberId);
  if (!p) { skClose(); return; }
  const rows = st.rows.filter(r => r.from || r.to);
  for (const r of rows) {
    if (!skTimeOk(r.from) || !skTimeOk(r.to)) return skErr('Bitte bei jeder Stunde Beginn und Ende angeben.');
    if (r.to <= r.from) return skErr('Das Ende einer Stunde muss nach dem Beginn liegen.');
  }
  rows.sort((a, b) => a.from.localeCompare(b.from));
  const ids = new Set(rows.map(r => r.id));
  const lost = (p.lessons || []).filter(l => !ids.has(l.slot) && String(l.subject || '').trim());
  if (lost.length && !confirm(`${lost.length} eingetragene Fächer liegen in entfernten Stunden und werden gelöscht. Fortfahren?`)) return;
  skUpsert('profiles', { ...p, times: rows.map(r => ({ id: r.id, from: r.from, to: r.to })), lessons: (p.lessons || []).filter(l => ids.has(l.slot)), updated: new Date().toISOString() });
  skClose();
  skCommit(false);
}

// Subject in a lesson
function skOpenLesson(mid, day, slot) {
  const p = skProfile(mid);
  if (!p || !skCanEdit()) return;
  const times = skTimes(p);
  const idx = times.findIndex(t => t.id === slot);
  if (idx < 0) return;
  const l = (p.lessons || []).find(x => Number(x.day) === day && x.slot === slot) || null;
  const dayName = (SK_DAYS.find(d => d[0] === day) || [0, '', ''])[2];
  const subjects = [...new Set([...skSubjects(p), ...SK_SUBJECTS])];
  const html = `
    <h3 class="font-serif text-lg mb-0.5">${dayName}</h3>
    <p class="text-xs text-ink/50 mb-4">${idx + 1}. Stunde · ${escapeHtml(times[idx].from)}–${escapeHtml(times[idx].to)}</p>
    <div class="fz-field"><label class="fz-lbl" for="skL_subject">Fach</label>
      <input id="skL_subject" class="fz-in" list="skSubjectList" autocomplete="off" maxlength="60" value="${famAttr(l ? l.subject : '')}" placeholder="z. B. Mathe" />
      <datalist id="skSubjectList">${subjects.map(s => `<option value="${famAttr(s)}"></option>`).join('')}</datalist>
    </div>
    <div class="flex flex-wrap gap-1.5 mb-3">${skSubjects(p).slice(0, 12).map(s => `<button type="button" class="fz-filter-chip" data-skm="subj" data-v="${famAttr(s)}"><span class="sk-subj" style="--sk:${skColor(s)}"></span>${escapeHtml(s)}</button>`).join('')}</div>
    ${fzIn('skL_room', 'Raum', l ? l.room : '', { ph: 'optional', max: 30 })}
    <label class="fz-check"><input type="checkbox" id="skL_double" /><span>Auch die nächste Stunde (Doppelstunde)</span></label>
    ${skFooter(!!l, 'Leeren')}`;
  skOpen(html, { kind: 'lesson', memberId: mid, day, slot });
}
function skSaveLesson(clear) {
  const st = skModal;
  const p = skProfile(st.memberId);
  if (!p) { skClose(); return; }
  const times = skTimes(p);
  const subject = clear ? '' : famVal('skL_subject');
  const room = clear ? '' : famVal('skL_room');
  const slots = [st.slot];
  if (!clear && fzChecked('skL_double')) { const i = times.findIndex(t => t.id === st.slot); if (times[i + 1]) slots.push(times[i + 1].id); }
  let lessons = (p.lessons || []).filter(l => !(Number(l.day) === st.day && slots.includes(l.slot)));
  if (subject) slots.forEach(slot => lessons.push({ id: newRecordId(), day: st.day, slot, subject, room }));
  skUpsert('profiles', { ...p, lessons, updated: new Date().toISOString() });
  skClose();
  skCommit(false);
}

// Care hours or drop-off & pick-up
function skOpenDays(mid) {
  const p = skProfile(mid);
  if (!p || !skCanEdit()) return;
  const kita = skIsKita(p);
  const html = `
    <h3 class="font-serif text-lg mb-1">${kita ? 'Betreuungszeiten' : 'Bringen & Abholen'}</h3>
    <p class="text-xs text-ink/50 mb-4">${kita ? 'Von wann bis wann, wer bringt und wer holt ab.' : 'Zeiten leer lassen = Beginn und Ende aus dem Stundenplan. Mit Hort oder Ganztag einfach die Abholzeit eintragen.'}</p>
    ${SK_DAYS.map(([n, , long]) => {
      const d = skDayPlan(p, n);
      return `<div class="sk-dayedit">
        <div class="text-sm font-medium mb-1.5">${long}</div>
        <div class="fz-grid2">
          ${fzIn('skD_from' + n, kita ? 'Von' : 'Beginn', d.from || '', { type: 'time' })}
          ${fzIn('skD_to' + n, kita ? 'Bis' : 'Abholen um', d.to || '', { type: 'time' })}
        </div>
        <div class="fz-grid2">
          ${skMemberSelect('skD_bring' + n, 'Bringt', d.bring || '')}
          ${skMemberSelect('skD_pick' + n, 'Holt ab', d.pick || '')}
        </div>
        ${n === 1 ? '<button type="button" class="fz-mini-btn -mt-1 mb-1" data-skm="copymon">Montag für alle Tage übernehmen</button>' : ''}
      </div>`;
    }).join('')}
    ${skFooter(false)}`;
  skOpen(html, { kind: 'days', memberId: mid });
}
function skCopyMonday() {
  const v = k => famVal('skD_' + k + '1');
  [2, 3, 4, 5].forEach(n => ['from', 'to', 'bring', 'pick'].forEach(k => { const el = document.getElementById('skD_' + k + n); if (el) el.value = v(k); }));
}
function skSaveDays() {
  const p = skProfile(skModal.memberId);
  if (!p) { skClose(); return; }
  const days = {};
  for (const [n] of SK_DAYS) {
    const d = { from: famVal('skD_from' + n), to: famVal('skD_to' + n), bring: famVal('skD_bring' + n), pick: famVal('skD_pick' + n) };
    if (d.from && d.to && d.to <= d.from) return skErr('Bitte prüfen: Das Ende liegt vor dem Beginn.');
    Object.keys(d).forEach(k => { if (!d[k]) delete d[k]; });
    if (Object.keys(d).length) days[String(n)] = d;
  }
  skUpsert('profiles', { ...p, days, updated: new Date().toISOString() });
  skClose();
  skCommit(false);
}

// Homework
function skNextLessonDay(p, subject) {
  const s = String(subject || '').trim().toLowerCase();
  const today = skToday();
  for (let i = 1; i <= 14; i++) {
    const iso = skAddDays(today, i);
    const wd = skWeekday(iso);
    if (wd === 0 || wd === 6 || skClosureOn(p.memberId, iso)) continue;
    if (!s || skLessonsOn(p, wd).some(l => String(l.subject).trim().toLowerCase() === s)) return iso;
  }
  return '';
}
function skNextSchoolDay(p) { return skNextLessonDay(p, '') || skAddDays(skToday(), 1); }
function skOpenHomework(id, mid) {
  if (!skCanEdit()) return;
  const h = id ? skHomeworkOf('').find(x => x.id === id) : null;
  const kid = h ? h.memberId : mid;
  const p = skProfile(kid);
  if (!p) return;
  const subjects = skSubjects(p);
  const html = `
    <h3 class="font-serif text-lg mb-1">Hausaufgabe · ${escapeHtml(memberLabel(memberById(kid)))}</h3>
    <p class="text-xs text-ink/50 mb-4">Erscheint auch auf der Kinderseite zum Abhaken.</p>
    <div class="fz-field"><label class="fz-lbl" for="skH_subject">Fach</label>
      <input id="skH_subject" class="fz-in" list="skHwSubjects" autocomplete="off" maxlength="60" value="${famAttr(h ? h.subject : '')}" placeholder="z. B. Mathe" />
      <datalist id="skHwSubjects">${[...new Set([...subjects, ...SK_SUBJECTS])].map(s => `<option value="${famAttr(s)}"></option>`).join('')}</datalist>
    </div>
    ${subjects.length ? `<div class="flex flex-wrap gap-1.5 mb-3">${subjects.slice(0, 12).map(s => `<button type="button" class="fz-filter-chip" data-skm="hwsubj" data-v="${famAttr(s)}"><span class="sk-subj" style="--sk:${skColor(s)}"></span>${escapeHtml(s)}</button>`).join('')}</div>` : ''}
    ${famTa('skH_text', 'Aufgabe', h ? h.text : '', 'z. B. Buch S. 34, Nr. 2–4')}
    ${fzIn('skH_due', 'Bis wann?', h ? h.due : skNextSchoolDay(p), { type: 'date' })}
    <p id="skH_hint" class="text-[11px] text-ink/45 -mt-2 mb-2"></p>
    ${skFooter(!!h)}`;
  skOpen(html, { kind: 'hw', id: h ? h.id : '', memberId: kid, dueTouched: !!h }, body => {
    const due = document.getElementById('skH_due');
    const subj = document.getElementById('skH_subject');
    due.addEventListener('input', () => { if (skModal) skModal.dueTouched = true; });
    subj.addEventListener('change', () => skHwSubjectChanged());
  });
}
function skHwSubjectChanged() {
  const st = skModal;
  if (!st || st.kind !== 'hw' || st.dueTouched) return;
  const p = skProfile(st.memberId);
  const iso = skNextLessonDay(p, famVal('skH_subject'));
  const hint = document.getElementById('skH_hint');
  if (iso) {
    document.getElementById('skH_due').value = iso;
    if (hint) hint.textContent = 'Nächste Stunde: ' + skFmtDay(iso);
  } else if (hint) hint.textContent = '';
}
function skSaveHomework() {
  const st = skModal;
  const subject = famVal('skH_subject');
  const text = famVal('skH_text');
  const due = famVal('skH_due');
  if (!subject && !text) return skErr('Bitte Fach oder Aufgabe eintragen.');
  const old = st.id ? skHomeworkOf('').find(x => x.id === st.id) : null;
  skUpsert('hw', {
    ...(old || { done: false, doneAt: '', created: new Date().toISOString() }),
    id: old ? old.id : newRecordId(), memberId: st.memberId, subject: subject.slice(0, 60), text: text.slice(0, 1000), due: skIso(due) ? due : '',
  });
  skClose();
  skCommit(false);
}
function skDeleteHomework() {
  schoolHomework = (schoolHomework || []).filter(h => h.id !== skModal.id);
  skClose();
  skCommit(false);
}

// Parent letter
function skParents() { return members.filter(m => !famIsPet(m) && !skProfile(m.id)); }
function skLetterTaskHtml() {
  const st = skModal;
  const people = skParents();
  return `<label class="fz-check"><input type="checkbox" id="skB_task"${st.taskOn ? ' checked' : ''} /><span>Als Aufgabe anlegen – mit Erinnerung<span class="block text-[11px] text-ink/45">Wer die Aufgabe abhakt, erledigt auch den Brief. Braucht eine Frist.</span></span></label>
    <div id="skB_taskFor" class="flex flex-wrap gap-1.5 mb-3${st.taskOn ? '' : ' hidden'}">${people.map(m => `<button type="button" class="fz-filter-chip sk-kid-chip${st.taskFor.includes(m.id) ? ' active' : ''}" data-skm="taskfor" data-id="${famAttr(m.id)}">${skAvatar(m)}<span>${escapeHtml(memberLabel(m))}</span></button>`).join('')}</div>`;
}
function skKiClosuresHtml() {
  const list = (skModal && skModal.kiClosures) || [];
  if (!list.length) return '';
  return `<div class="fz-note-box ok mb-3"><span>🚫</span><div class="min-w-0 flex-1">
    <div class="text-xs font-medium mb-1">Schließtage im Brief gefunden – übernehmen?</div>
    ${list.map((c, i) => `<label class="fz-check" style="margin-bottom:0.3rem"><input type="checkbox" data-skkic="${i}"${c.on ? ' checked' : ''} /><span class="text-xs">${escapeHtml(skRange(c.from, c.to))}${c.reason ? ' · ' + escapeHtml(c.reason) : ''}</span></label>`).join('')}
  </div></div>`;
}
function skOpenLetter(id, mid, autoKi) {
  if (!skCanEdit()) return;
  const l = id ? skLettersOf('').find(x => x.id === id) : null;
  const kids = l ? l.memberIds.slice() : [mid].filter(Boolean);
  const me = currentMember();
  const taskFor = l && Array.isArray(l.taskFor) ? l.taskFor.slice() : (me && skParents().some(x => x.id === me.id) ? [me.id] : skParents().slice(0, 1).map(x => x.id));
  const action = l ? l.action : 'unterschreiben';
  const ki = skKiOn();
  const html = `
    <h3 class="font-serif text-lg mb-3">Elternbrief</h3>
    ${ki ? `<button type="button" id="skB_ki" class="w-full mb-2 px-3 py-2.5 rounded-xl border border-dashed border-pine/50 text-sm text-pine hover:bg-pine/5 transition" data-skm="ki">📷 Brief fotografieren – KI liest aus</button>
      <p id="skB_kiInfo" class="hidden text-xs mb-3"></p>` : ''}
    ${skKidChips(kids, 'kid')}
    ${fzIn('skB_title', 'Worum geht es?', l ? l.title : '', { ph: 'z. B. Ausflug in den Zoo', max: 150 })}
    ${fzIn('skB_sender', 'Von', l ? l.sender : '', { ph: 'z. B. Klassenlehrerin, Kita-Leitung', max: 100 })}
    <label class="fz-lbl">Was ist zu tun?</label>
    <div class="fz-type-row mb-3">${SK_ACTIONS.map(a => `<button type="button" class="fz-type-chip${a.id === action ? ' active' : ''}" data-skm="action" data-v="${a.id}"><span class="fz-ti">${a.icon}</span>${a.label}</button>`).join('')}</div>
    <div class="fz-grid2">
      ${fzIn('skB_deadline', 'Frist', l ? l.deadline : '', { type: 'date' })}
      ${fzIn('skB_amount', 'Betrag', l && l.amount !== '' && l.amount != null ? hsDecInput(l.amount, 2) : '', { mode: 'decimal', unit: curSym(), ph: 'optional' })}
    </div>
    ${famTa('skB_note', 'Notiz', l ? l.note : '', 'z. B. Lunchpaket und Regenjacke mitgeben')}
    <div id="skB_kiClosures"></div>
    <div id="skB_taskBox"></div>
    ${skFooter(!!l)}`;
  skOpen(html, { kind: 'letter', id: l ? l.id : '', kids, action, taskOn: l ? !!l.taskOn : true, taskFor, kiClosures: [] }, () => {
    document.getElementById('skB_taskBox').innerHTML = skLetterTaskHtml();
    if (autoKi && ki) setTimeout(() => skPickFile('image/*,application/pdf', skKiLetter), 50);
  });
}
function skSaveLetter() {
  const st = skModal;
  const title = famVal('skB_title');
  if (!title) return skErr('Bitte eintragen, worum es geht.');
  if (!st.kids.length) return skErr('Bitte mindestens ein Kind wählen.');
  const deadline = famVal('skB_deadline');
  const amountRaw = famVal('skB_amount');
  const amount = amountRaw ? hsDec(amountRaw) : '';
  if (amountRaw && !(amount >= 0)) return skErr('Bitte den Betrag als Zahl eingeben.');
  const taskOn = fzChecked('skB_task');
  if (taskOn && !skIso(deadline)) return skErr('Für die Aufgabe braucht der Brief eine Frist.');
  if (taskOn && !st.taskFor.length) return skErr('Bitte wählen, wer die Aufgabe bekommt.');
  const old = st.id ? skLettersOf('').find(x => x.id === st.id) : null;
  let l = {
    ...(old || { done: false, doneAt: '', taskId: '', created: new Date().toISOString() }),
    id: old ? old.id : newRecordId(), memberIds: st.kids.slice(), title: title.slice(0, 150), sender: famVal('skB_sender').slice(0, 100),
    action: st.action, deadline: skIso(deadline) ? deadline : '', amount: amountRaw ? Math.round(amount * 100) / 100 : '',
    note: famVal('skB_note').slice(0, 2000), taskOn, taskFor: st.taskFor.slice(),
  };
  l = skSyncLetterTask(l, old);
  skUpsert('letters', l);
  (st.kiClosures || []).filter(c => c.on && skIso(c.from)).forEach(c => {
    const dup = skClosuresOf('').some(x => x.from === c.from && (x.to || x.from) === (c.to || c.from) && st.kids.every(k => x.memberIds.includes(k)));
    if (!dup) skUpsert('closures', { id: newRecordId(), memberIds: st.kids.slice(), from: c.from, to: skIso(c.to) && c.to >= c.from ? c.to : c.from, reason: (c.reason || '').slice(0, 100), created: new Date().toISOString() });
  });
  skClose();
  skCommit(true);
  finShowToast(l.taskId && l.taskOn ? 'Gespeichert – Aufgabe angelegt' : 'Gespeichert');
}
function skDeleteLetter() {
  const l = skLettersOf('').find(x => x.id === skModal.id);
  if (!l || !confirm('Elternbrief löschen?')) return;
  const t = skTaskOf(l);
  if (t && !t.done && typeof queueTaskDelete === 'function') { queueTaskDelete(t.id); try { rebuildAufgaben(); renderTasks(); flushOutbox(); } catch (e) { /* ignore */ } }
  schoolLetters = (schoolLetters || []).filter(x => x.id !== l.id);
  skClose();
  skCommit(true);
}

// Closure day
function skOpenClosure(id, mid) {
  if (!skCanEdit()) return;
  const c = id ? skClosuresOf('').find(x => x.id === id) : null;
  let kids = c ? c.memberIds.slice() : [mid].filter(Boolean);
  if (!c && mid && skProfile(mid)) {
    const same = String(skProfile(mid).name || '').trim().toLowerCase();
    if (same) skProfiles().forEach(p => { if (p.memberId !== mid && String(p.name || '').trim().toLowerCase() === same) kids.push(p.memberId); });
  }
  const html = `
    <h3 class="font-serif text-lg mb-1">Schließtag</h3>
    <p class="text-xs text-ink/50 mb-4">Erscheint im Kalender – auch über mehrere Tage, z. B. Sommerschließzeit.</p>
    ${skKidChips(kids, 'kid')}
    <div class="fz-grid2">
      ${fzIn('skC_from', 'Von', c ? c.from : '', { type: 'date' })}
      ${fzIn('skC_to', 'Bis', c ? (c.to || c.from) : '', { type: 'date' })}
    </div>
    ${fzIn('skC_reason', 'Grund', c ? c.reason : '', { ph: 'z. B. Teamtag, Brückentag, Schließzeit', max: 100 })}
    ${skFooter(!!c)}`;
  skOpen(html, { kind: 'closure', id: c ? c.id : '', kids }, () => {
    const from = document.getElementById('skC_from'), to = document.getElementById('skC_to');
    from.addEventListener('change', () => { if (!to.value || to.value < from.value) to.value = from.value; });
  });
}
function skSaveClosure() {
  const st = skModal;
  const from = famVal('skC_from');
  let to = famVal('skC_to');
  if (!skIso(from)) return skErr('Bitte ein Datum wählen.');
  if (!skIso(to)) to = from;
  if (to < from) return skErr('„Bis“ liegt vor „Von“.');
  if (skDaysBetween(from, to) > 120) return skErr('Höchstens 120 Tage am Stück.');
  if (!st.kids.length) return skErr('Bitte mindestens ein Kind wählen.');
  const old = st.id ? skClosuresOf('').find(x => x.id === st.id) : null;
  skUpsert('closures', { ...(old || { created: new Date().toISOString() }), id: old ? old.id : newRecordId(), memberIds: st.kids.slice(), from, to, reason: famVal('skC_reason').slice(0, 100) });
  skClose();
  skCommit(true);
}
function skDeleteClosure() {
  schoolClosures = (schoolClosures || []).filter(c => c.id !== skModal.id);
  skClose();
  skCommit(true);
}

/* ---------- AI: timetable and parent letter from a photo ---------- */
function skPickFile(accept, cb) {
  let inp = document.getElementById('skFileInput');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file';
    inp.id = 'skFileInput';
    inp.setAttribute('aria-hidden', 'true');
    inp.tabIndex = -1;
    inp.style.cssText = 'position:fixed;opacity:0;width:1px;height:1px;left:-100px;top:0;pointer-events:none';
    document.body.appendChild(inp);
  }
  inp.accept = accept;
  inp.value = '';
  inp.onchange = () => { const f = inp.files && inp.files[0]; inp.value = ''; if (f) cb(f); };
  inp.click();
}
async function skFilePart(file) {
  const t = String(file.type || '').toLowerCase();
  if (t === 'application/pdf' || /\.pdf$/i.test(file.name || '')) {
    if (file.size > 12 * 1024 * 1024) throw new Error('Die PDF-Datei ist zu groß (max. 12 MB).');
    return recipeKiFilePart(file, 'application/pdf');
  }
  return recipeKiImagePart(file);
}
async function skKiPost(path, body) {
  if (!navigator.onLine) throw new Error('Keine Verbindung.');
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 150000) : null;
  let res;
  try {
    res = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined });
  } catch (err) {
    throw new Error(err && err.name === 'AbortError' ? 'Die KI hat zu lange gebraucht.' : 'Keine Verbindung zum Server.');
  } finally { if (timer) clearTimeout(timer); }
  let data = {};
  try { data = await res.json(); } catch (e) { data = {}; }
  if (res.status === 404) throw new Error('Auf dem Server fehlen noch die neuen Dateien ki.pb.js und pinn-ki.js.');
  if (!res.ok) throw new Error(data.error || ('Server-Fehler ' + res.status));
  return data;
}
async function skKiTimetable(mid, file) {
  const p = skProfile(mid);
  if (!p) return;
  skKiBusy = mid;
  skKiMsg = null;
  renderFamily();
  try {
    const part = await skFilePart(file);
    const data = await skKiPost('/api/pinn/ki/stundenplan', { dateien: [part], kind: memberLabel(memberById(mid)), klasse: p.group || '' });
    const r = data.stundenplan || {};
    const stunden = Array.isArray(r.stunden) ? r.stunden : [];
    if (!stunden.length) throw new Error('Kein Stundenplan erkannt.');
    const cur = skProfile(mid);
    if ((cur.lessons || []).some(l => String(l.subject || '').trim()) && !confirm('Den bisherigen Stundenplan durch den erkannten ersetzen?')) { skKiMsg = null; return; }
    let times = (Array.isArray(r.zeiten) ? r.zeiten : []).filter(z => skTimeOk(z.von) && skTimeOk(z.bis) && z.bis > z.von).map(z => ({ id: newRecordId(), from: z.von, to: z.bis }));
    const maxN = stunden.reduce((mx, s) => Math.max(mx, Number(s.stunde) || 0), 0);
    if (times.length < maxN) {
      const keep = skTimes(cur);
      if (keep.length >= maxN) times = keep.map(t => ({ ...t }));
      else {
        const base = times.length ? times : (keep.length ? keep.map(t => ({ ...t })) : skPresetTimes());
        while (base.length < maxN) { const last = base[base.length - 1]; const s = skMin(last.to) + 5; base.push({ id: newRecordId(), from: skHm(s), to: skHm(s + 45) }); }
        times = base;
      }
    }
    const lessons = [];
    const seen = new Set();
    stunden.forEach(s => {
      const day = Number(s.tag), n = Number(s.stunde);
      const subject = String(s.fach || '').trim().slice(0, 60);
      if (!(day >= 1 && day <= 5) || !(n >= 1 && n <= times.length) || !subject) return;
      const key = day + '|' + n;
      if (seen.has(key)) return;
      seen.add(key);
      lessons.push({ id: newRecordId(), day, slot: times[n - 1].id, subject, room: String(s.raum || '').trim().slice(0, 30) });
    });
    if (!lessons.length) throw new Error('Kein Stundenplan erkannt.');
    skUpsert('profiles', { ...cur, times, lessons, updated: new Date().toISOString() });
    skKiMsg = { memberId: mid, text: `✨ ${lessons.length} Stunden übernommen – bitte kurz prüfen.${r.hinweis ? ' ' + r.hinweis : ''}`, bad: false };
    persistState();
  } catch (err) {
    skKiMsg = { memberId: mid, text: 'KI: ' + (err && err.message ? err.message : 'Unbekannter Fehler'), bad: true };
  } finally {
    skKiBusy = '';
    if (currentView === 'familie') renderFamily();
  }
}
async function skKiLetter(file) {
  const st = skModal;
  if (!st || st.kind !== 'letter') return;
  const info = document.getElementById('skB_kiInfo');
  const btn = document.getElementById('skB_ki');
  const show = (txt, bad) => { if (!info) return; info.textContent = txt; info.classList.remove('hidden'); info.classList.toggle('text-red-500', !!bad); info.classList.toggle('text-ink/55', !bad); };
  if (btn) btn.disabled = true;
  show('✨ KI liest den Brief …');
  try {
    const part = await skFilePart(file);
    const data = await skKiPost('/api/pinn/ki/elternbrief', {
      dateien: [part], heute: skToday(),
      kinder: st.kids.map(id => memberLabel(memberById(id))),
      einrichtungen: st.kids.map(id => skProfile(id)).filter(Boolean).map(skName),
    });
    const b = data.brief || {};
    if (!skModal || skModal !== st) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null && v !== '') el.value = v; };
    set('skB_title', b.titel);
    set('skB_sender', b.absender);
    if (skIso(b.frist)) set('skB_deadline', b.frist);
    if (Number(b.betrag) > 0) set('skB_amount', hsDecInput(Number(b.betrag), 2));
    const note = document.getElementById('skB_note');
    if (note && b.zusammenfassung && !note.value.trim()) note.value = b.zusammenfassung;
    if (SK_ACTIONS.some(a => a.id === b.aktion)) {
      st.action = b.aktion;
      document.querySelectorAll('#famModalBody [data-skm="action"]').forEach(x => x.classList.toggle('active', x.dataset.v === st.action));
    }
    st.kiClosures = (Array.isArray(b.schliesstage) ? b.schliesstage : []).filter(c => skIso(c.von)).map(c => ({ from: c.von, to: skIso(c.bis) ? c.bis : c.von, reason: c.grund || '', on: true }));
    document.getElementById('skB_kiClosures').innerHTML = skKiClosuresHtml();
    if (!skIso(b.frist) && b.aktion === 'lesen') {
      const box = document.getElementById('skB_task');
      if (box) { box.checked = false; st.taskOn = false; document.getElementById('skB_taskFor').classList.add('hidden'); }
    }
    show('✨ Ausgelesen – bitte kurz prüfen.' + (b.hinweis ? ' ' + b.hinweis : ''), false);
  } catch (err) {
    show('KI: ' + (err && err.message ? err.message : 'Unbekannter Fehler') + ' – bitte selbst eintragen.', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---------- Wiring ---------- */
function skPaneClick(e) {
  const go = e.target.closest('[data-famtabgo]');
  if (go) { famSetTab(go.dataset.famtabgo); return true; }
  const pass = e.target.closest('[data-fampass]');
  if (pass) { famOpenPass(pass.dataset.fampass); return true; }
  const b = e.target.closest('[data-sk]');
  if (!b || b.disabled) return false;
  const id = b.dataset.id || '';
  switch (b.dataset.sk) {
    case 'open': skKid = id; famDetailId = null; famSetTab('schule'); break;
    case 'openletter': {
      const l = skLettersOf('').find(x => x.id === id);
      if (l) { skKid = l.memberIds[0]; famDetailId = null; famSetTab('schule'); if (skCanEdit()) skOpenLetter(id); }
      break;
    }
    case 'kid': skKid = id; skKiMsg = null; renderFamily(); break;
    case 'addkid': skOpenProfile('', id); break;
    case 'editprofile': skOpenProfile(id); break;
    case 'times': skOpenTimes(id); break;
    case 'lesson': skOpenLesson(id, Number(b.dataset.day), b.dataset.slot); break;
    case 'days': skOpenDays(id); break;
    case 'kiplan': if (!skKiBusy) skPickFile('image/*,application/pdf', f => skKiTimetable(id, f)); break;
    case 'hwnew': skOpenHomework('', id); break;
    case 'hw': skOpenHomework(id); break;
    case 'hwtoggle': skToggleHomework(id); break;
    case 'letternew': skOpenLetter('', id); break;
    case 'letterki': skOpenLetter('', id, true); break;
    case 'letter': skOpenLetter(id); break;
    case 'letterdone': skToggleLetter(id); break;
    case 'closurenew': skOpenClosure('', id); break;
    case 'closure': skOpenClosure(id); break;
    case 'showdone': skShowDone = !skShowDone; renderFamily(); break;
    default: return false;
  }
  return true;
}
function skModalClick(e) {
  if (!skModal) return;
  const b = e.target.closest('[data-skm]');
  if (!b) return;
  const st = skModal;
  const body = document.getElementById('famModalBody');
  switch (b.dataset.skm) {
    case 'cancel': attemptCloseModal('famModal', skClose); break;
    case 'save':
      if (st.kind === 'profile') skSaveProfile();
      else if (st.kind === 'times') skSaveTimes();
      else if (st.kind === 'lesson') skSaveLesson(false);
      else if (st.kind === 'days') skSaveDays();
      else if (st.kind === 'hw') skSaveHomework();
      else if (st.kind === 'letter') skSaveLetter();
      else if (st.kind === 'closure') skSaveClosure();
      break;
    case 'del':
      if (st.kind === 'profile') skDeleteProfile();
      else if (st.kind === 'lesson') skSaveLesson(true);
      else if (st.kind === 'hw') skDeleteHomework();
      else if (st.kind === 'letter') skDeleteLetter();
      else if (st.kind === 'closure') skDeleteClosure();
      break;
    case 'type':
      st.type = b.dataset.v;
      body.querySelectorAll('[data-skm="type"]').forEach(x => x.classList.toggle('active', x === b));
      break;
    case 'action':
      st.action = b.dataset.v;
      body.querySelectorAll('[data-skm="action"]').forEach(x => x.classList.toggle('active', x === b));
      break;
    case 'kid': {
      const id = b.dataset.id;
      st.kids = st.kids.includes(id) ? st.kids.filter(x => x !== id) : st.kids.concat(id);
      b.classList.toggle('active', st.kids.includes(id));
      break;
    }
    case 'taskfor': {
      const id = b.dataset.id;
      st.taskFor = st.taskFor.includes(id) ? st.taskFor.filter(x => x !== id) : st.taskFor.concat(id);
      b.classList.toggle('active', st.taskFor.includes(id));
      break;
    }
    case 'addtime': {
      skSyncTimes();
      const last = st.rows[st.rows.length - 1];
      const s = last && skTimeOk(last.to) ? skMin(last.to) + 5 : 8 * 60;
      st.rows.push({ id: newRecordId(), from: skHm(s), to: skHm(s + 45) });
      skRenderTimes();
      break;
    }
    case 'rmtime': skSyncTimes(); st.rows.splice(Number(b.dataset.i), 1); skRenderTimes(); break;
    case 'preset':
      skSyncTimes();
      if (st.rows.length && !confirm('Die Stundenzeiten durch die Vorlage ersetzen?')) break;
      st.rows = skPresetTimes().map((t, i) => st.rows[i] ? { ...t, id: st.rows[i].id } : t);
      skRenderTimes();
      break;
    case 'subj': { const el = document.getElementById('skL_subject'); if (el) el.value = b.dataset.v; break; }
    case 'hwsubj': { const el = document.getElementById('skH_subject'); if (el) { el.value = b.dataset.v; skHwSubjectChanged(); } break; }
    case 'copymon': skCopyMonday(); break;
    case 'ki': skPickFile('image/*,application/pdf', skKiLetter); break;
  }
}
function skModalChange(e) {
  if (!skModal) return;
  if (e.target.id === 'skB_task') {
    skModal.taskOn = e.target.checked;
    const box = document.getElementById('skB_taskFor');
    if (box) box.classList.toggle('hidden', !e.target.checked);
    return;
  }
  const kic = e.target.closest('[data-skkic]');
  if (kic && skModal.kiClosures) { const c = skModal.kiClosures[Number(kic.dataset.skkic)]; if (c) c.on = kic.checked; }
}

/* ==========================================================
   Family → Pets
   ----------------------------------------------------------
   Pets are not family members with a profile, they stand on their own in the family data –
   so they can be changed offline and are merged without overwriting each other (lists with IDs):
   - pets: [{ id, name, species, emoji, photo, color, breed, sex ('m'|'w'), neutered, birth, since,
       chip, passNo, insurance, insuranceNo, vet, vetPhone, vetAddress, emergencyVet, emergencyVetPhone,
       allergies, conditions, notes (nature & quirks), sitter (for the pet sitter),
       feed: { brand, amount, times: ['07:00', …], pantryId }, walks (walk goal per day),
       roster: { '1'…'7': [member IDs] } (who is on duty on which weekday), owners: [member IDs],
       trackerId (device from the location), push (reminders), meds: [{ id, name, dose, times }],
       care: [{ id, type, title, last, every (days, 0 = once), next, note }],
       weights: [{ id, date, kg }], gone (date, rainbow bridge), created, updated }]
   - petLog: [{ id, pet, kind: 'gassi'|'futter'|'med'|'notiz', day, at, by (member ID), min, slot, note }]
     (only the last 60 days are kept)
   Push reminders (care due, birthday): pb_hooks/haustiere.pb.js + pinn-haustiere.js.
   ========================================================== */
var PT_SPECIES = [
  { id: 'hund', emoji: '🐶', label: 'Hund', walks: 3, feed: ['07:00', '18:00'], emojis: ['🐶', '🐕', '🦮', '🐕‍🦺', '🐩'] },
  { id: 'katze', emoji: '🐱', label: 'Katze', walks: 0, feed: ['07:00', '18:00'], emojis: ['🐱', '🐈', '🐈‍⬛'] },
  { id: 'kaninchen', emoji: '🐰', label: 'Kaninchen', walks: 0, feed: ['08:00', '18:00'], emojis: ['🐰', '🐇'] },
  { id: 'meerschweinchen', emoji: '🐹', label: 'Meerschweinchen', walks: 0, feed: ['08:00', '18:00'], emojis: ['🐹'] },
  { id: 'hamster', emoji: '🐹', label: 'Hamster & Maus', walks: 0, feed: ['19:00'], emojis: ['🐹', '🐭', '🐁'] },
  { id: 'vogel', emoji: '🐦', label: 'Vogel', walks: 0, feed: ['08:00'], emojis: ['🐦', '🦜', '🐤'] },
  { id: 'fisch', emoji: '🐠', label: 'Fische', walks: 0, feed: ['08:00'], emojis: ['🐠', '🐟', '🐡'] },
  { id: 'reptil', emoji: '🦎', label: 'Reptil', walks: 0, feed: [], emojis: ['🦎', '🐢', '🐍'] },
  { id: 'pferd', emoji: '🐴', label: 'Pferd', walks: 0, feed: ['07:00', '18:00'], emojis: ['🐴', '🐎'] },
  { id: 'sonstiges', emoji: '🐾', label: 'Anderes Tier', walks: 0, feed: [], emojis: ['🐾', '🐿️', '🦔', '🐓', '🐐'] },
];
var PT_CARE_TYPES = [
  { id: 'impfung', icon: '💉', label: 'Impfung' },
  { id: 'wurmkur', icon: '🪱', label: 'Wurmkur' },
  { id: 'parasiten', icon: '🛡️', label: 'Floh- & Zeckenschutz' },
  { id: 'tierarzt', icon: '🩺', label: 'Tierarzt' },
  { id: 'medikament', icon: '💊', label: 'Medikament' },
  { id: 'zahn', icon: '🦷', label: 'Zähne' },
  { id: 'krallen', icon: '✂️', label: 'Krallen & Hufe' },
  { id: 'pflege', icon: '🛁', label: 'Fellpflege' },
  { id: 'reinigung', icon: '🧽', label: 'Reinigung' },
  { id: 'sonstiges', icon: '📌', label: 'Sonstiges' },
];
// Suggestions per species: [species, title, every x days]
var PT_CARE_PRESETS = {
  hund: [['impfung', 'Tollwut-Impfung', 1095], ['impfung', 'Kombi-Impfung (SHPPi + L)', 365], ['wurmkur', 'Wurmkur', 90], ['parasiten', 'Floh- & Zeckenschutz', 30], ['tierarzt', 'Jahres-Check beim Tierarzt', 365], ['krallen', 'Krallen kürzen', 42]],
  katze: [['impfung', 'Katzenschnupfen & -seuche (RCP)', 365], ['impfung', 'Tollwut-Impfung (Freigänger)', 1095], ['wurmkur', 'Wurmkur', 90], ['parasiten', 'Floh- & Zeckenschutz', 30], ['tierarzt', 'Jahres-Check beim Tierarzt', 365]],
  kaninchen: [['impfung', 'RHD-Impfung', 365], ['impfung', 'Myxomatose-Impfung', 365], ['krallen', 'Krallen kürzen', 42], ['zahn', 'Zähne kontrollieren', 180], ['reinigung', 'Stall gründlich reinigen', 14]],
  meerschweinchen: [['krallen', 'Krallen kürzen', 42], ['zahn', 'Zähne kontrollieren', 180], ['reinigung', 'Stall gründlich reinigen', 14], ['tierarzt', 'Gesundheits-Check', 365]],
  hamster: [['reinigung', 'Käfig gründlich reinigen', 30], ['tierarzt', 'Gesundheits-Check', 365]],
  vogel: [['reinigung', 'Käfig gründlich reinigen', 14], ['krallen', 'Krallen & Schnabel prüfen', 90], ['tierarzt', 'Gesundheits-Check', 365]],
  fisch: [['reinigung', 'Teilwasserwechsel', 7], ['reinigung', 'Filter reinigen', 30], ['sonstiges', 'Wasserwerte testen', 14]],
  reptil: [['reinigung', 'Terrarium reinigen', 30], ['sonstiges', 'UV-Lampe tauschen', 365], ['tierarzt', 'Gesundheits-Check', 365]],
  pferd: [['krallen', 'Hufschmied', 49], ['wurmkur', 'Wurmkur', 90], ['impfung', 'Influenza- & Tetanus-Impfung', 180], ['zahn', 'Zahnkontrolle', 365]],
  sonstiges: [['tierarzt', 'Gesundheits-Check', 365]],
};
var PT_LOG_DAYS = 60;
var PT_COLORS = ['#B5651D', '#8D6E63', '#C0567A', '#3B7EA1', '#2A9D8F', '#5E8C31', '#9C4DCC', '#D4A017', '#546E7A', '#D9822B'];
var ptDetailId = null;   // opened pet (tab "Pets")
var ptModalState = null; // { kind, … }
var ptShowGone = false;

function ptList() { return (Array.isArray(pets) ? pets : []).filter(p => p && p.id && p.name); }
function ptActive() { return ptList().filter(p => !p.gone); }
function ptById(id) { return ptList().find(p => p.id === id) || null; }
function ptSpecies(id) { return PT_SPECIES.find(s => s.id === id) || PT_SPECIES[PT_SPECIES.length - 1]; }
function ptCareType(id) { return PT_CARE_TYPES.find(t => t.id === id) || PT_CARE_TYPES[PT_CARE_TYPES.length - 1]; }
function ptId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function ptToday() { return isoDate(new Date()); }
function ptIso(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function ptCanEdit() { return !isCurrentUserGuest() && !childLockActive(); }
function ptColor(p) { return (p && p.color) || '#B5651D'; }
function ptAvatarInner(p) {
  if (p && p.photo) return `<span class="fam-ava-in"><img src="${famAttr(p.photo)}" alt="" /></span>`;
  return `<span class="fam-ava-in">${escapeHtml((p && p.emoji) || ptSpecies(p && p.species).emoji)}</span>`;
}
function ptAge(p) {
  if (!p || !ptIso(p.birth)) return null;
  const [y, m, d] = p.birth.split('-').map(Number);
  const end = ptIso(p.gone) ? new Date(p.gone + 'T12:00:00') : new Date();
  let months = (end.getFullYear() - y) * 12 + (end.getMonth() + 1 - m);
  if (end.getDate() < d) months--;
  if (months < 0) return null;
  return { years: Math.floor(months / 12), months };
}
function ptAgeText(p) {
  const a = ptAge(p);
  if (!a) return '';
  if (a.years >= 1) return a.years === 1 ? '1 Jahr' : a.years + ' Jahre';
  return a.months === 1 ? '1 Monat' : a.months + ' Monate';
}
function ptSubLine(p) {
  const sp = ptSpecies(p.species);
  const sex = p.sex === 'm' ? '♂' : p.sex === 'w' ? '♀' : '';
  return [p.breed || sp.label, ptAgeText(p), sex ? sex + (p.neutered ? ' kastriert' : '') : ''].filter(Boolean).join(' · ');
}
// Birthday: days until the next one (0 = today), null without a date
function ptBirthdayIn(p) {
  if (!p || !ptIso(p.birth) || p.gone) return null;
  const [, m, d] = p.birth.split('-').map(Number);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let next = birthdayInYear(now.getFullYear(), m, d);
  if (next < now) next = birthdayInYear(now.getFullYear() + 1, m, d);
  return Math.round((next - now) / 86400000);
}

/* ---------- Care ---------- */
function ptCareNext(c) {
  if (!c) return '';
  if (ptIso(c.next)) return c.next;
  const every = Number(c.every) || 0;
  if (ptIso(c.last) && every > 0) return addDaysToDateStr(c.last, every);
  return '';
}
function ptCareDays(c) {
  const n = ptCareNext(c);
  return n ? daysBetweenDateStrs(ptToday(), n) : null;
}
function ptCareState(c) {
  const d = ptCareDays(c);
  if (d === null) return 'none';
  if (d < 0) return 'over';
  if (d === 0) return 'today';
  if (d <= 14) return 'soon';
  return 'ok';
}
function ptCareSorted(p) {
  const rank = { over: 0, today: 1, soon: 2, ok: 3, none: 4 };
  return (Array.isArray(p.care) ? p.care : []).slice().sort((a, b) => {
    const ra = rank[ptCareState(a)], rb = rank[ptCareState(b)];
    if (ra !== rb) return ra - rb;
    return String(ptCareNext(a) || '9999').localeCompare(String(ptCareNext(b) || '9999'));
  });
}
function ptCareDueText(c) {
  const d = ptCareDays(c);
  if (d === null) return c.last ? 'zuletzt am ' + famFmtDate(c.last) : 'noch kein Datum';
  if (d < 0) return d === -1 ? 'seit gestern fällig' : 'seit ' + (-d) + ' Tagen fällig';
  if (d === 0) return 'heute fällig';
  if (d === 1) return 'morgen fällig';
  if (d <= 60) return 'in ' + d + ' Tagen';
  return 'am ' + famFmtDate(ptCareNext(c));
}
function ptOverdue(p) { return p.gone ? [] : (Array.isArray(p.care) ? p.care : []).filter(c => ['over', 'today'].includes(ptCareState(c))); }
function ptSoon(p, days) { return p.gone ? [] : (Array.isArray(p.care) ? p.care : []).filter(c => { const d = ptCareDays(c); return d !== null && d >= 0 && d <= days; }); }

/* ---------- Diary (walks, feeding, medication) ---------- */
function ptLog() { return Array.isArray(petLog) ? petLog : []; }
function ptLogOf(petId, kind, day) { return ptLog().filter(x => x && x.pet === petId && (!kind || x.kind === kind) && (!day || x.day === day)); }
function ptTrimLog(list) {
  const old = addDaysToDateStr(ptToday(), -PT_LOG_DAYS);
  return list.filter(x => x && x.day && x.day >= old);
}
function ptAddLog(entry) {
  const me = currentMember();
  const now = new Date();
  const e = { id: ptId('pl'), day: isoDate(now), at: now.getTime(), by: me ? me.id : '', ...entry };
  Object.keys(e).forEach(k => { if (e[k] === '' || e[k] === undefined || e[k] === null) delete e[k]; });
  petLog = ptTrimLog([...ptLog(), e]);
  persistState();
  return e;
}
function ptRemoveLog(id) {
  petLog = ptLog().filter(x => x.id !== id);
  persistState();
}
function ptFeedTimes(p) { return (p.feed && Array.isArray(p.feed.times) ? p.feed.times : []).filter(t => /^\d{2}:\d{2}$/.test(t)).sort(); }
function ptFedSlot(p, t, day) { return ptLogOf(p.id, 'futter', day || ptToday()).find(x => x.slot === t) || null; }
function ptWalksToday(p) { return ptLogOf(p.id, 'gassi', ptToday()); }
function ptOnDuty(p, day) {
  const d = day ? new Date(day + 'T12:00:00') : new Date();
  const wd = String(((d.getDay() + 6) % 7) + 1); // 1 = Monday
  const ids = (p.roster && Array.isArray(p.roster[wd])) ? p.roster[wd] : [];
  return ids.map(id => memberById(id)).filter(Boolean);
}
function ptWhoName(id) { const m = id ? memberById(id) : null; return m ? memberLabel(m) : ''; }
function ptTimeOf(ms) { return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }

/* ---------- Saving ---------- */
function ptUpdate(id, fn) {
  pets = ptList().map(p => (p.id === id ? { ...fn(p), updated: Date.now() } : p));
  persistState();
}
function ptRefresh() {
  if (currentView === 'familie') renderFamily();
  try { if (currentView === 'uebersicht') renderFamilyTile(); } catch (e) { /* ignore */ }
}

/* ---------- Tab "Pets" ---------- */
function ptLegacyMembers() {
  const taken = new Set(ptList().map(p => p.fromMember).filter(Boolean));
  return members.filter(m => famIsPet(m) && !taken.has(m.id));
}
function ptPaneHtml() {
  if (ptDetailId && ptById(ptDetailId)) return ptProfileHtml(ptById(ptDetailId));
  ptDetailId = null;
  const act = ptActive();
  const gone = ptList().filter(p => p.gone);
  const can = ptCanEdit();
  const out = [];
  if (!act.length && !gone.length) {
    out.push(`<div class="fam-card pt-empty">
      <div class="pt-empty-paws" aria-hidden="true"><span>🐾</span><span>🐶</span><span>🐱</span><span>🐰</span><span>🐾</span></div>
      <div class="font-serif text-lg mb-1">Eure Haustiere</div>
      <p class="text-sm text-ink/55 mb-3">Füttern, Gassi, Impfungen, Tierarzt und Gewicht – alles an einem Ort. pinn. erinnert an Wurmkur &amp; Co. und hilft, wenn der Tiersitter kommt.</p>
      ${can ? '<button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-pt="new">+ Haustier hinzufügen</button>' : ''}
    </div>`);
  } else {
    out.push(`<div class="pt-grid">${act.map(ptCardHtml).join('')}${can ? `<button type="button" class="pt-card pt-add" data-pt="new"><span class="pt-add-ic">＋</span><span class="text-sm font-medium">Haustier</span></button>` : ''}</div>`);
    const due = [];
    act.forEach(p => ptSoon(p, 7).concat(ptOverdue(p)).forEach(c => { if (!due.some(x => x.c.id === c.id)) due.push({ p, c }); }));
    due.sort((a, b) => String(ptCareNext(a.c)).localeCompare(String(ptCareNext(b.c))));
    if (due.length) {
      out.push(`<div class="fam-card"><div class="fz-h">🗓️ Steht an</div>${due.slice(0, 8).map(({ p, c }) => ptCareRowHtml(p, c, true)).join('')}</div>`);
    }
    const walkers = ptActive().filter(p => (Number(p.walks) || 0) > 0);
    if (walkers.length) out.push(ptWalkWeekHtml(walkers));
  }
  const legacy = ptLegacyMembers();
  if (legacy.length && can) {
    out.push(`<div class="fam-card pt-legacy"><div class="fz-h">🔁 Als Haustier übernehmen</div>
      <p class="text-xs text-ink/55 mb-2">Diese Tiere stehen noch als Familienmitglied in pinn. Übernimm sie in die Haustiere – Chipnummer, Tierarzt und Geburtsdatum aus dem Notfallpass kommen mit.</p>
      <div class="flex flex-wrap gap-2">${legacy.map(m => `<button type="button" class="fz-mini-btn" data-pt="adopt" data-id="${famAttr(m.id)}">${escapeHtml(m.avatar || '🐾')} <span>${escapeHtml(memberLabel(m))}</span></button>`).join('')}</div></div>`);
  }
  if (gone.length) {
    out.push(`<div class="fam-card pt-gone-card"><button type="button" class="pt-gone-h" data-pt="togglegone"><span>🌈 In Erinnerung</span><b>${gone.length}</b><span class="ml-auto text-ink/40">${ptShowGone ? '▾' : '▸'}</span></button>
      ${ptShowGone ? `<div class="pt-grid mt-2">${gone.map(ptCardHtml).join('')}</div>` : ''}</div>`);
  }
  return out.join('');
}
function ptCardHtml(p) {
  const color = ptColor(p);
  const over = ptOverdue(p);
  const bd = ptBirthdayIn(p);
  const feed = ptFeedTimes(p);
  const fed = feed.filter(t => ptFedSlot(p, t)).length;
  const walks = Number(p.walks) || 0;
  const w = ptWalksToday(p).length;
  const stats = [];
  if (!p.gone && feed.length) stats.push(`<span class="pt-stat${fed >= feed.length ? ' ok' : ''}">🍖 <b>${fed}/${feed.length}</b></span>`);
  if (!p.gone && walks) stats.push(`<span class="pt-stat${w >= walks ? ' ok' : ''}">🦮 <b>${w}/${walks}</b></span>`);
  let badge = '';
  if (bd === 0) badge = '<span class="pt-badge bday">🎂</span>';
  else if (over.length) badge = `<span class="pt-badge warn" title="Fällig">${over.length}</span>`;
  return `<button type="button" class="pt-card${p.gone ? ' gone' : ''}" data-pt="open" data-id="${famAttr(p.id)}" style="--pt:${famAttr(color)}">
    <span class="pt-card-band"></span>
    <span class="fam-ava pt-ava" style="--fam:${famAttr(color)}">${ptAvatarInner(p)}${badge}</span>
    <span class="pt-card-name">${escapeHtml(p.name)}</span>
    <span class="pt-card-sub">${escapeHtml(p.gone ? '🌈' : (p.breed || ptSpecies(p.species).label))}</span>
    ${stats.length ? `<span class="pt-stats">${stats.join('')}</span>` : ''}
  </button>`;
}
function ptCareRowHtml(p, c, withName) {
  const st = ptCareState(c);
  const t = ptCareType(c.type);
  const can = ptCanEdit() && !p.gone;
  return `<div class="pt-care-row ${st}">
    <button type="button" class="pt-care-main" data-pt="care" data-id="${famAttr(p.id)}" data-cid="${famAttr(c.id)}"${can ? '' : ' disabled'}>
      <span class="pt-care-ic">${t.icon}</span>
      <span class="min-w-0 flex-1 text-left">
        <span class="block text-sm truncate">${withName ? `<b>${escapeHtml(p.name)}</b> · ` : ''}<span>${escapeHtml(c.title || t.label)}</span></span>
        <span class="pt-care-when">${escapeHtml(ptCareDueText(c))}</span>
      </span>
    </button>
    ${can && st !== 'none' ? `<button type="button" class="pt-done-btn" data-pt="caredone" data-id="${famAttr(p.id)}" data-cid="${famAttr(c.id)}" title="Erledigt">✓</button>` : ''}
  </div>`;
}
// Walks of the last 7 days (minutes per day, who was out the most)
function ptWalkWeekHtml(list) {
  const days = [...Array(7)].map((_, i) => addDaysToDateStr(ptToday(), i - 6));
  const per = days.map(d => list.reduce((s, p) => s + ptLogOf(p.id, 'gassi', d).reduce((a, x) => a + (Number(x.min) || 20), 0), 0));
  const max = Math.max(30, ...per);
  const by = {};
  list.forEach(p => ptLog().filter(x => x.pet === p.id && x.kind === 'gassi' && x.day >= days[0]).forEach(x => { if (x.by) by[x.by] = (by[x.by] || 0) + (Number(x.min) || 20); }));
  const top = Object.keys(by).sort((a, b) => by[b] - by[a]).filter(id => memberById(id));
  const total = per.reduce((a, b) => a + b, 0);
  return `<div class="fam-card"><div class="fz-h">🦮 Gassi · 7 Tage</div>
    <div class="pt-bars">${days.map((d, i) => `<div class="pt-bar${d === ptToday() ? ' today' : ''}"><span class="pt-bar-col"><span style="height:${Math.round(per[i] / max * 100)}%"></span></span><small>${escapeHtml(new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'narrow' }))}</small></div>`).join('')}</div>
    <div class="pt-walk-sum"><span><b>${Math.round(total / 60 * 10) / 10}</b> <span>Std. unterwegs</span></span>${top.length ? `<span>🏆 <b>${escapeHtml(ptWhoName(top[0]))}</b></span>` : ''}</div>
  </div>`;
}

/* ---------- Profile of a pet ---------- */
function ptProfileHtml(p) {
  const color = ptColor(p);
  const sp = ptSpecies(p.species);
  const can = ptCanEdit() && !p.gone;
  const bd = ptBirthdayIn(p);
  const age = ptAge(p);
  const btns = [];
  if (!p.gone && (Number(p.walks) || 0) > 0 && can) btns.push(`<button type="button" class="fz-act-btn primary" data-pt="walk" data-id="${famAttr(p.id)}"><span class="fz-ti">🦮</span>Gassi</button>`);
  if (!p.gone && ptFeedTimes(p).length && can) btns.push(`<button type="button" class="fz-act-btn" data-pt="feednext" data-id="${famAttr(p.id)}"><span class="fz-ti">🍖</span>Gefüttert</button>`);
  if (p.vetPhone) btns.push(`<a class="fz-act-btn" href="${famAttr(famTel(p.vetPhone))}"><span class="fz-ti">🩺</span>Tierarzt</a>`);
  if (ptCanEdit()) btns.push(`<button type="button" class="fz-act-btn" data-pt="edit" data-id="${famAttr(p.id)}"><span class="fz-ti">✏️</span>Bearbeiten</button>`);
  const out = [];
  out.push(`<button type="button" class="self-start text-sm text-ink/55 hover:text-pine -mb-1" data-pt="back">‹ Haustiere</button>`);
  out.push(`<div class="fz-hero pt-hero" style="--fz:${famAttr(color)}">
    <div class="fam-band pt-band"><span class="pt-trail" aria-hidden="true">🐾 🐾 🐾 🐾 🐾 🐾</span></div>
    <div class="fam-hero-ava"><span class="fam-ava big" style="--fam:${famAttr(color)}">${ptAvatarInner(p)}</span></div>
    <div class="fam-hero-body">
      <div class="flex items-center gap-2 flex-wrap">
        <div class="font-serif text-xl">${escapeHtml(p.name)}</div>
        ${bd === 0 ? '<span class="pt-pill bday">🎂 <span>Geburtstag!</span></span>' : bd !== null && bd <= 14 ? `<span class="pt-pill">🎂 <span>${escapeHtml(bd === 1 ? 'morgen' : 'in ' + bd + ' Tagen')}</span></span>` : ''}
      </div>
      <div class="text-xs text-ink/50 mt-0.5">${escapeHtml(ptSubLine(p))}</div>
      ${btns.length ? `<div class="flex gap-2 mt-3">${btns.join('')}</div>` : ''}
    </div>
  </div>`);
  if (bd === 0) out.push(`<div class="pt-bday-card"><span class="pt-bday-ic">🎂</span><div><div class="text-sm font-semibold">${escapeHtml(p.name)} <span>hat heute Geburtstag!</span></div>${age && age.years ? `<div class="text-xs" style="opacity:.8">${escapeHtml(age.years === 1 ? '1 Jahr' : age.years + ' Jahre')} 🐾</div>` : ''}</div></div>`);
  if (p.gone) out.push(`<div class="fam-card pt-memorial"><div class="text-3xl mb-1">🌈</div><div class="font-serif text-lg">In Erinnerung</div><p class="text-sm text-ink/55">${escapeHtml([ptIso(p.birth) ? famFmtDate(p.birth) : '', famFmtDate(p.gone)].filter(Boolean).join(' – '))}</p></div>`);

  if (!p.gone) {
    out.push(ptTodayHtml(p));
    // Care
    const care = ptCareSorted(p);
    const presets = (PT_CARE_PRESETS[p.species] || []).filter(([, title]) => !(p.care || []).some(c => c.title === title));
    out.push(`<div class="fam-card"><div class="flex items-center justify-between gap-2 mb-1"><div class="fz-h" style="margin-bottom:0">🩺 Gesundheit &amp; Vorsorge</div>${can ? `<button type="button" class="fz-mini-btn" data-pt="careadd" data-id="${famAttr(p.id)}">+ Vorsorge</button>` : ''}</div>
      ${care.length ? care.map(c => ptCareRowHtml(p, c, false)).join('') : '<p class="text-sm text-ink/50 py-1">Impfungen, Wurmkur, Floh- und Zeckenschutz – pinn. erinnert rechtzeitig per Push.</p>'}
      ${can && presets.length ? `<button type="button" class="pt-suggest" data-pt="presets" data-id="${famAttr(p.id)}">✨ <span>Vorschläge für</span> <b>${escapeHtml(sp.label)}</b> <span class="text-ink/45">(${presets.length})</span></button>` : ''}
    </div>`);
    // Medication
    const meds = (Array.isArray(p.meds) ? p.meds : []).filter(m => m && m.name);
    if (meds.length) {
      out.push(`<div class="fam-card"><div class="fz-h">💊 Medikamente</div>${meds.map(m => {
        const todayN = ptLogOf(p.id, 'med', ptToday()).filter(x => x.note === m.name).length;
        return `<div class="pt-med-row"><span class="min-w-0 flex-1"><span class="block text-sm font-medium">${escapeHtml(m.name)}</span>${m.dose || m.times ? `<span class="block text-[11px] text-ink/50">${escapeHtml([m.dose, m.times].filter(Boolean).join(' · '))}</span>` : ''}</span>
          ${can ? `<button type="button" class="fz-mini-btn${todayN ? ' primary' : ''}" data-pt="medgiven" data-id="${famAttr(p.id)}" data-name="${famAttr(m.name)}">${todayN ? '✓ ' + todayN + '×' : '<span>Gegeben</span>'}</button>` : ''}</div>`;
      }).join('')}</div>`);
    }
  }
  // Weight
  out.push(ptWeightHtml(p));
  // Food
  if (!p.gone) {
    const f = p.feed || {};
    const times = ptFeedTimes(p);
    const pi = f.pantryId ? (pantryItems || []).find(x => x.id === f.pantryId) : null;
    if (f.brand || f.amount || times.length || pi) {
      const low = pi && Number(pi.minQty) > 0 && Number(pi.qty) <= Number(pi.minQty);
      out.push(`<div class="fam-card"><div class="fz-h">🥣 Futter</div>
        ${famRow('Futter', f.brand)}${famRow('Menge je Mahlzeit', f.amount)}${famRow('Fütterungszeiten', times.join(' · '))}
        ${pi ? `<div class="fam-row"><div class="fam-k">Im Vorrat</div><div class="fam-v"><b>${escapeHtml(String(pi.qty != null ? pi.qty : '–'))}</b> ${escapeHtml(pi.unit || '')} <span class="text-ink/50">· ${escapeHtml(pi.name)}</span>${low ? ' <span class="pt-pill warn">knapp</span>' : ''}</div></div>` : ''}
        ${can ? `<div class="flex gap-2 mt-2 flex-wrap"><button type="button" class="fz-mini-btn" data-pt="foodshop" data-id="${famAttr(p.id)}">🛒 <span>Auf die Einkaufsliste</span></button>${pi && isViewAllowed('vorrat') ? '<button type="button" class="fz-mini-btn" data-pt="pantry">🥫 <span>Vorrat</span></button>' : ''}</div>` : ''}
      </div>`);
    }
    if (Object.values(p.roster || {}).some(a => Array.isArray(a) && a.length) || can) out.push(ptRosterHtml(p));
  }
  // Tracker
  const g = p.trackerId && famOrtungAllowed() ? famDevice(p.trackerId) : null;
  if (g) {
    const pos = g.teilen ? g.position : null;
    const pl = pos ? famPlace(pos.ort) : null;
    out.push(`<div class="fam-card"><div class="fz-h">📍 Tracker</div>
      <div class="flex items-center gap-3"><span class="text-2xl">${famIsLive(g) ? '<span class="fam-dot"></span>' : ''}${escapeHtml(g.emoji || '📡')}</span>
        <div class="min-w-0 flex-1"><div class="text-sm font-medium">${escapeHtml(pl ? pl.emoji + ' ' + pl.name : (pos ? (famIsLive(g) ? 'unterwegs' : 'zuletzt') : 'Kein Standort'))}</div>${pos ? `<div class="text-[11px] text-ink/50">${escapeHtml(famAgo(pos.zeit))}</div>` : ''}</div>
        ${pos ? `<button type="button" class="fz-mini-btn" data-pt="map" data-id="${famAttr(g.id)}">🗺 <span>Karte</span></button>` : ''}</div></div>`);
  }
  // Profile sheet
  const facts = [
    famRow('Tierart', ptSpecies(p.species).label), famRow('Rasse', p.breed), famRow('Geburtsdatum', famFmtDate(p.birth)), famRow('Bei uns seit', famFmtDate(p.since)),
    famRow('Chipnummer', p.chip), famRow('Heimtierausweis', p.passNo),
    famRow('Allergien & Unverträglichkeiten', p.allergies), famRow('Erkrankungen', p.conditions),
    famRow('Versicherung', [p.insurance, p.insuranceNo].filter(Boolean).join(' · ')),
    famRow('Bezugspersonen', (p.owners || []).map(ptWhoName).filter(Boolean).join(', ')),
  ].join('');
  out.push(`<div class="fam-card"><div class="fz-h">🐾 Steckbrief</div>${facts}${p.notes ? `<div class="fam-row"><div class="fam-k">Wesen &amp; Eigenheiten</div><div class="fam-v">${escapeHtml(p.notes)}</div></div>` : ''}</div>`);
  const vets = [famRow('Tierarzt', [p.vet, p.vetAddress].filter(Boolean).join('\n') || p.vetPhone, famCallBtn(p.vetPhone)), famRow('Tiernotdienst', p.emergencyVet || p.emergencyVetPhone, famCallBtn(p.emergencyVetPhone))].join('');
  if (vets) out.push(`<div class="fam-card"><div class="fz-h">🏥 Tierarzt &amp; Notdienst</div>${vets}</div>`);
  // Tools
  const tools = [];
  tools.push(`<button type="button" class="pt-tool" data-pt="sitter" data-id="${famAttr(p.id)}"><span>🧑‍🍼</span><b>Tiersitter</b><small>Steckbrief teilen</small></button>`);
  if (!p.gone) tools.push(`<button type="button" class="pt-tool" data-pt="poster" data-id="${famAttr(p.id)}"><span>🔎</span><b>Vermisst</b><small>Plakat drucken</small></button>`);
  if (isViewAllowed('dokumente')) tools.push(`<button type="button" class="pt-tool" data-pt="docs"><span>📄</span><b>Dokumente</b><small>Impfpass, Rechnungen</small></button>`);
  if (isViewAllowed('einkauf') && !p.gone) tools.push(`<button type="button" class="pt-tool" data-pt="packlist" data-id="${famAttr(p.id)}"><span>🧳</span><b>Packliste</b><small>Urlaub mit Tier</small></button>`);
  out.push(`<div class="pt-tools">${tools.join('')}</div>`);
  // Diary
  const recent = ptLog().filter(x => x.pet === p.id && x.day >= addDaysToDateStr(ptToday(), -6)).sort((a, b) => b.at - a.at).slice(0, 12);
  if (recent.length) {
    out.push(`<div class="fam-card"><div class="fz-h">📖 Tagebuch</div>${recent.map(x => ptLogRowHtml(p, x)).join('')}</div>`);
  }
  if (p.updated) out.push(`<p class="text-[11px] text-ink/40 text-center"><span>Zuletzt geändert am</span> ${escapeHtml(new Date(p.updated).toLocaleDateString('de-DE'))}</p>`);
  return out.join('');
}
function ptLogRowHtml(p, x) {
  const ic = { gassi: '🦮', futter: '🍖', med: '💊', notiz: '📝' }[x.kind] || '•';
  const label = x.kind === 'gassi' ? 'Gassi' : x.kind === 'futter' ? 'Gefüttert' : x.kind === 'med' ? (x.note || 'Medikament') : (x.note || 'Notiz');
  const day = x.day === ptToday() ? 'heute' : x.day === addDaysToDateStr(ptToday(), -1) ? 'gestern' : new Date(x.day + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  const can = ptCanEdit();
  return `<div class="pt-log-row"><span class="pt-log-ic">${ic}</span><span class="min-w-0 flex-1"><span class="block text-sm"><span>${escapeHtml(label)}</span>${x.kind === 'gassi' && x.min ? ` <span class="text-ink/50">· ${escapeHtml(String(x.min))} Min.</span>` : ''}${x.kind === 'gassi' && x.note ? ` <span class="text-ink/50">· ${escapeHtml(x.note)}</span>` : ''}</span>
    <span class="block text-[11px] text-ink/45"><span>${escapeHtml(day)}</span> · ${escapeHtml(ptTimeOf(x.at))}${x.by ? ' · ' + escapeHtml(ptWhoName(x.by)) : ''}</span></span>
    ${can ? `<button type="button" class="fam-x" data-pt="logdel" data-id="${famAttr(x.id)}" aria-label="Entfernen">×</button>` : ''}</div>`;
}
function ptTodayHtml(p) {
  const can = ptCanEdit();
  const times = ptFeedTimes(p);
  const walks = Number(p.walks) || 0;
  const duty = ptOnDuty(p);
  if (!times.length && !walks && !duty.length) return '';
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const feed = times.map(t => {
    const x = ptFedSlot(p, t);
    const late = !x && t < hm;
    return `<button type="button" class="pt-slot${x ? ' done' : ''}${late ? ' late' : ''}" data-pt="feed" data-id="${famAttr(p.id)}" data-slot="${famAttr(t)}"${can ? '' : ' disabled'}>
      <span class="pt-slot-ic">${x ? '✓' : '🍖'}</span><span class="pt-slot-t">${escapeHtml(t)}</span><small>${x ? escapeHtml(ptWhoName(x.by) || ptTimeOf(x.at)) : ''}</small></button>`;
  }).join('');
  const done = ptWalksToday(p);
  const dots = walks ? [...Array(Math.max(walks, done.length))].map((_, i) => `<span class="pt-dot${i < done.length ? ' on' : ''}">${i < done.length ? '🐾' : ''}</span>`).join('') : '';
  const mins = done.reduce((s, x) => s + (Number(x.min) || 0), 0);
  return `<div class="fam-card pt-today"><div class="flex items-center justify-between gap-2 mb-2"><div class="fz-h" style="margin-bottom:0">☀️ Heute</div>
      ${duty.length ? `<span class="pt-duty">${duty.map(m => `<span class="pt-duty-ava" style="border-color:${memberBorderColor(m) === 'transparent' ? '#fff' : memberBorderColor(m)}">${memberAvatarInnerHTML(m)}</span>`).join('')}<span><span>dran:</span> ${escapeHtml(duty.map(memberLabel).join(', '))}</span></span>` : ''}</div>
    ${times.length ? `<div class="pt-slots">${feed}</div>` : ''}
    ${walks ? `<div class="pt-walks"><div class="pt-dots">${dots}</div><div class="text-[11px] text-ink/55"><b>${done.length}</b> <span>von</span> <b>${walks}</b> <span>Runden</span>${mins ? ` · <b>${mins}</b> <span>Min.</span>` : ''}</div>${can ? `<button type="button" class="fz-mini-btn primary" data-pt="walk" data-id="${famAttr(p.id)}">+ <span>Gassi</span></button>` : ''}</div>` : ''}
  </div>`;
}
function ptRosterHtml(p) {
  const wd = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const today = String(((new Date().getDay() + 6) % 7) + 1);
  const can = ptCanEdit();
  return `<div class="fam-card"><div class="flex items-center justify-between gap-2 mb-2"><div class="fz-h" style="margin-bottom:0">📋 Wer ist dran?</div>${can ? `<button type="button" class="fz-mini-btn" data-pt="roster" data-id="${famAttr(p.id)}">Bearbeiten</button>` : ''}</div>
    <div class="pt-roster">${wd.map((d, i) => {
      const k = String(i + 1);
      const ms = ((p.roster && p.roster[k]) || []).map(id => memberById(id)).filter(Boolean);
      return `<div class="pt-roster-d${k === today ? ' today' : ''}"><small>${d}</small><span class="pt-roster-avas">${ms.length ? ms.slice(0, 3).map(m => `<span class="pt-duty-ava" title="${famAttr(memberLabel(m))}" style="border-color:${memberBorderColor(m) === 'transparent' ? '#fff' : memberBorderColor(m)}">${memberAvatarInnerHTML(m)}</span>`).join('') : '<span class="text-ink/40">–</span>'}</span></div>`;
    }).join('')}</div></div>`;
}
function ptWeightHtml(p) {
  const ws = (Array.isArray(p.weights) ? p.weights : []).filter(w => w && ptIso(w.date) && Number(w.kg) > 0).sort((a, b) => a.date.localeCompare(b.date));
  const can = ptCanEdit() && !p.gone;
  if (!ws.length && !can) return '';
  const head = `<div class="flex items-center justify-between gap-2 mb-1"><div class="fz-h" style="margin-bottom:0">⚖️ Gewicht</div>${can ? `<button type="button" class="fz-mini-btn" data-pt="weight" data-id="${famAttr(p.id)}">+ <span>Gewicht</span></button>` : ''}</div>`;
  if (!ws.length) return `<div class="fam-card">${head}<p class="text-sm text-ink/50">Regelmäßig wiegen hilft, Veränderungen früh zu bemerken.</p></div>`;
  const last = ws[ws.length - 1];
  const prev = ws.length > 1 ? ws[ws.length - 2] : null;
  const diff = prev ? Math.round((last.kg - prev.kg) * 100) / 100 : 0;
  const fmt = n => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  let chart = '';
  if (ws.length > 1) {
    const W = 300, H = 90, pad = 8;
    const t0 = new Date(ws[0].date).getTime(), t1 = new Date(last.date).getTime();
    const kMin = Math.min(...ws.map(w => w.kg)), kMax = Math.max(...ws.map(w => w.kg));
    const span = Math.max(0.5, kMax - kMin);
    const pts = ws.map(w => {
      const x = pad + (t1 > t0 ? (new Date(w.date).getTime() - t0) / (t1 - t0) : 0.5) * (W - 2 * pad);
      const y = H - pad - ((w.kg - kMin) / span) * (H - 2 * pad);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
    const line = pts.map((q, i) => (i ? 'L' : 'M') + q[0] + ' ' + q[1]).join(' ');
    const area = line + ` L${pts[pts.length - 1][0]} ${H} L${pts[0][0]} ${H} Z`;
    chart = `<svg class="pt-wchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${area}"/><path class="l" d="${line}"/>${pts.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="2.6"/>`).join('')}</svg>
      <div class="pt-wscale"><span>${escapeHtml(famFmtDate(ws[0].date))}</span><span>${escapeHtml(fmt(kMin))}–${escapeHtml(fmt(kMax))} kg</span><span>${escapeHtml(famFmtDate(last.date))}</span></div>`;
  }
  return `<div class="fam-card">${head}
    <div class="pt-wnow"><b>${escapeHtml(fmt(last.kg))}</b> <span>kg</span>${prev ? `<span class="pt-wdiff ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '▲' : diff < 0 ? '▼' : '='} ${escapeHtml(fmt(Math.abs(diff)))} kg</span>` : ''}<small>${escapeHtml(famFmtDate(last.date))}</small></div>
    ${chart}
    ${can && ws.length ? `<button type="button" class="pt-suggest" data-pt="weights" data-id="${famAttr(p.id)}"><span>Alle Werte</span> (${ws.length})</button>` : ''}
  </div>`;
}

/* ---------- Emergency tab & overview ---------- */
function ptNotfallHtml() {
  const list = ptActive();
  if (!list.length) return '';
  return `<div class="fam-card"><div class="fz-h">🐾 Haustiere</div><div class="flex flex-col">${list.map(p => {
    const facts = [p.chip ? '🔖 ' + p.chip : '', p.allergies ? '⚠️ ' + String(p.allergies).split(/[,;\n]/)[0].trim() : '', p.vetPhone ? '🩺 ' + (p.vet || 'Tierarzt') : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="fam-pass-row" data-pt="open" data-id="${famAttr(p.id)}" style="--fam:${famAttr(ptColor(p))}">
      <span class="fam-ava sm">${ptAvatarInner(p)}</span>
      <span class="min-w-0 flex-1 text-left"><span class="block text-sm font-medium truncate">${escapeHtml(p.name)}</span><span class="block text-[11px] text-ink/55 truncate">${escapeHtml(facts || ptSpecies(p.species).label)}</span></span>
      ${p.emergencyVetPhone ? `<a class="fz-mini-btn" href="${famAttr(famTel(p.emergencyVetPhone))}" onclick="event.stopPropagation()">🚨 <span>Notdienst</span></a>` : '<span class="text-ink/30 text-lg leading-none">›</span>'}
    </button>`;
  }).join('')}</div></div>`;
}
function ptQuickCardHtml() {
  const list = ptActive();
  const over = list.reduce((s, p) => s + ptOverdue(p).length, 0);
  return `<button type="button" class="fam-quick" data-famtabgo="tiere">
      <span class="fam-quick-ic">🐾</span>
      <span class="fam-quick-t">Haustiere</span>
      <span class="fam-quick-s">${list.length ? (over ? `<b>${over}</b> <span>fällig</span>` : escapeHtml(list.map(p => p.name).join(', '))) : 'Füttern, Gassi, Impfungen'}</span>
    </button>`;
}
function ptOpen(id) {
  if (!ptById(id)) id = null;
  famTab = 'tiere';
  famDetailId = null;
  ptDetailId = id;
  if (currentView !== 'familie') setView('familie'); else renderFamily();
  famStopPolling();
  if (famPollWanted()) famStartPolling();
  const sc = document.getElementById('famScroll');
  if (sc) sc.scrollTop = 0;
}

/* ---------- Popups ---------- */
function ptOpenModal(html, state) {
  ptModalState = state || null;
  document.getElementById('ptModalBody').innerHTML = html;
  document.getElementById('ptModal').classList.remove('hidden');
  armModalSnapshot('ptModal');
}
function ptCloseModal() {
  document.getElementById('ptModal').classList.add('hidden');
  document.getElementById('ptModalBody').innerHTML = '';
  ptModalState = null;
}
function ptVal(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
function ptChecked(id) { const el = document.getElementById(id); return !!(el && el.checked); }
function ptPeople() { return members.filter(m => !famIsPet(m)); }
function ptMemberChips(attr, selected) {
  return ptPeople().map(m => `<button type="button" class="fz-member-chip pt-mchip${selected.includes(m.id) ? ' active' : ''}" data-${attr}="${famAttr(m.id)}"><span class="pt-duty-ava">${memberAvatarInnerHTML(m)}</span><span>${escapeHtml(memberLabel(m))}</span></button>`).join('');
}
var PT_EVERY = [[0, 'einmalig'], [7, 'jede Woche'], [14, 'alle 2 Wochen'], [30, 'jeden Monat'], [42, 'alle 6 Wochen'], [60, 'alle 2 Monate'], [90, 'alle 3 Monate'], [180, 'alle 6 Monate'], [365, 'jedes Jahr'], [730, 'alle 2 Jahre'], [1095, 'alle 3 Jahre']];

/* Add / edit pet */
function ptOpenEdit(id) {
  if (!ptCanEdit()) return;
  const p = id ? ptById(id) : null;
  const sp = ptSpecies(p ? p.species : 'hund');
  const st = {
    kind: 'pet', id: p ? p.id : '', species: sp.id, emoji: p ? (p.emoji || sp.emoji) : sp.emoji, photo: p ? (p.photo || '') : '',
    color: p ? ptColor(p) : PT_COLORS[ptList().length % PT_COLORS.length], sex: p ? (p.sex || '') : '',
    owners: p && Array.isArray(p.owners) ? p.owners.slice() : [],
    meds: p && Array.isArray(p.meds) ? p.meds.map(x => ({ ...x })) : [],
  };
  const f = (p && p.feed) || {};
  const trackers = famOrtungAllowed() ? famDevices().filter(g => g.typ === 'tracker') : [];
  const pantry = (pantryItems || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
  const html = `
    <h3 class="font-serif text-lg mb-3">${p ? '<span>Haustier bearbeiten</span>' : '<span>Neues Haustier</span>'}</h3>
    <label class="fz-lbl">Tierart</label>
    <div class="fz-type-row mb-3" id="ptF_species">${PT_SPECIES.map(x => `<button type="button" class="fz-type-chip${x.id === st.species ? ' active' : ''}" data-ptm="species" data-v="${x.id}"><span class="fz-ti">${x.emoji}</span><span>${escapeHtml(x.label)}</span></button>`).join('')}</div>
    <div class="flex items-center gap-3 mb-3">
      <span id="ptF_preview" class="fam-ava big" style="--fam:${famAttr(st.color)}"></span>
      <div class="flex flex-col gap-1.5 min-w-0">
        <label class="fz-mini-btn text-center cursor-pointer">📷 <span>Foto wählen</span><input id="ptF_photo" type="file" accept="image/*" class="hidden" /></label>
        <button type="button" class="fz-mini-btn" data-ptm="nophoto"><span>Foto entfernen</span></button>
      </div>
    </div>
    <div id="ptF_emojis" class="flex flex-wrap gap-1.5 mb-3"></div>
    <div class="flex flex-wrap gap-2 mb-3" id="ptF_colors">${PT_COLORS.map(c => `<button type="button" class="fz-color-btn${c === st.color ? ' active' : ''}" style="background:${c}" data-ptm="color" data-v="${c}" aria-label="Farbe"></button>`).join('')}</div>
    <div class="fz-grid2">${famIn('ptF_name', 'Name', p ? p.name : '', 'maxlength="40" autocomplete="off" placeholder="z. B. Bello"')}${famIn('ptF_breed', 'Rasse', p ? p.breed : '', 'maxlength="60" autocomplete="off" placeholder="z. B. Labrador"')}</div>
    <label class="fz-lbl">Geschlecht</label>
    <div class="flex items-center gap-2 mb-3 flex-wrap">
      ${[['m', '♂ männlich'], ['w', '♀ weiblich'], ['', '–']].map(([v, l]) => `<button type="button" class="fz-filter-chip px-3 py-1.5 text-sm${st.sex === v ? ' active' : ''}" data-ptm="sex" data-v="${v}">${escapeHtml(l)}</button>`).join('')}
      <label class="fz-check ml-1" style="margin-bottom:0"><input id="ptF_neutered" type="checkbox"${p && p.neutered ? ' checked' : ''} /><span>kastriert</span></label>
    </div>
    <div class="fz-grid2">${famIn('ptF_birth', 'Geburtsdatum', p ? p.birth : '', 'type="date"')}${famIn('ptF_since', 'Bei uns seit', p ? p.since : '', 'type="date"')}</div>
    <label class="fz-lbl">Bezugspersonen</label>
    <div class="flex flex-wrap gap-1.5 mb-1" id="ptF_owners">${ptMemberChips('ptowner', st.owners)}</div>
    <p class="text-[11px] text-ink/45 mb-3">Bekommen die Erinnerungen. Ohne Auswahl: alle außer Kindern.</p>

    <div class="fz-h mt-2">🥣 Füttern &amp; Gassi</div>
    <div class="fz-grid2">${famIn('ptF_food', 'Futter', f.brand, 'maxlength="80" autocomplete="off" placeholder="z. B. Trockenfutter Adult"')}${famIn('ptF_amount', 'Menge je Mahlzeit', f.amount, 'maxlength="40" autocomplete="off" placeholder="z. B. 150 g"')}</div>
    <div class="fz-grid2">${famIn('ptF_times', 'Fütterungszeiten', (f.times || (p ? [] : sp.feed)).join(', '), 'autocomplete="off" inputmode="numeric" placeholder="07:00, 18:00"')}${famIn('ptF_walks', 'Gassi-Runden am Tag', p ? (p.walks || '') : (sp.walks || ''), 'inputmode="numeric" maxlength="2" placeholder="0"')}</div>
    ${pantry.length ? `<div class="fz-field"><label class="fz-lbl" for="ptF_pantry">Futter im Vorrat</label><select id="ptF_pantry" class="fz-in"><option value="">– nicht verknüpft –</option>${pantry.map(x => `<option value="${famAttr(x.id)}"${f.pantryId === x.id ? ' selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}</select></div>` : ''}

    <div class="fz-h mt-2">🩺 Gesundheit</div>
    ${famTa('ptF_allergies', 'Allergien & Unverträglichkeiten', p ? p.allergies : '', 'z. B. Huhn, Getreide')}
    ${famTa('ptF_conditions', 'Erkrankungen', p ? p.conditions : '', 'z. B. Arthrose, Epilepsie')}
    <label class="fz-lbl">Medikamente</label>
    <div id="ptF_meds" class="flex flex-col gap-2 mb-2"></div>
    <button type="button" class="fz-mini-btn mb-4" data-ptm="addmed">+ <span>Medikament</span></button>

    <div class="fz-h mt-2">🏥 Tierarzt &amp; Ausweise</div>
    <div class="fz-grid2">${famIn('ptF_vet', 'Tierarzt', p ? p.vet : '', 'maxlength="80" autocomplete="off"')}${famIn('ptF_vetPhone', 'Telefon Tierarzt', p ? p.vetPhone : '', 'type="tel" inputmode="tel" maxlength="40"')}</div>
    ${famIn('ptF_vetAddress', 'Adresse Tierarzt', p ? p.vetAddress : '', 'maxlength="160" autocomplete="off"')}
    <div class="fz-grid2">${famIn('ptF_eVet', 'Tiernotdienst / Tierklinik', p ? p.emergencyVet : '', 'maxlength="80" autocomplete="off"')}${famIn('ptF_eVetPhone', 'Telefon Notdienst', p ? p.emergencyVetPhone : '', 'type="tel" inputmode="tel" maxlength="40"')}</div>
    <div class="fz-grid2">${famIn('ptF_chip', 'Chipnummer', p ? p.chip : '', 'inputmode="numeric" maxlength="20" autocomplete="off"')}${famIn('ptF_pass', 'Heimtierausweis-Nr.', p ? p.passNo : '', 'maxlength="30" autocomplete="off"')}</div>
    <div class="fz-grid2">${famIn('ptF_ins', 'Versicherung', p ? p.insurance : '', 'maxlength="80" autocomplete="off" placeholder="z. B. Hundehaftpflicht"')}${famIn('ptF_insNo', 'Versicherungsnr.', p ? p.insuranceNo : '', 'maxlength="40" autocomplete="off"')}</div>
    ${trackers.length ? `<div class="fz-field"><label class="fz-lbl" for="ptF_tracker">GPS-Tracker (Ortung)</label><select id="ptF_tracker" class="fz-in"><option value="">– keiner –</option>${trackers.map(g => `<option value="${famAttr(g.id)}"${p && p.trackerId === g.id ? ' selected' : ''}>${escapeHtml((g.emoji ? g.emoji + ' ' : '') + g.name)}</option>`).join('')}</select></div>` : ''}

    <div class="fz-h mt-2">📝 Wesen &amp; Tiersitter</div>
    ${famTa('ptF_notes', 'Wesen & Eigenheiten', p ? p.notes : '', 'z. B. verträglich mit Kindern, ängstlich bei Gewitter')}
    ${famTa('ptF_sitter', 'Hinweise für den Tiersitter', p ? p.sitter : '', 'z. B. Leine hängt an der Garderobe, nicht an der Hauptstraße ableinen')}
    <label class="fz-check"><input id="ptF_push" type="checkbox"${!p || p.push !== false ? ' checked' : ''} /><span>Erinnerungen per Push (Vorsorge &amp; Geburtstag)</span></label>
    ${!p ? '<label class="fz-check"><input id="ptF_presets" type="checkbox" checked /><span>Passende Vorsorge vorschlagen (Impfungen, Wurmkur …)</span></label>' : ''}

    <p id="ptF_err" class="text-xs text-red-600 min-h-[1em] mt-2"></p>
    <div class="flex items-center justify-between gap-2 mt-2 flex-wrap">
      <div class="flex gap-2">
        ${p ? `<button type="button" class="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50" data-ptm="delete">Löschen</button>` : ''}
        ${p ? `<button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:bg-ink/5" data-ptm="gone">${p.gone ? '↺ <span>Zurückholen</span>' : '🌈 <span>Verstorben</span>'}</button>` : ''}
      </div>
      <div class="flex gap-2 ml-auto">
        <button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-ptm="cancel">Abbrechen</button>
        <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-ptm="savepet">${p ? 'Speichern' : 'Anlegen'}</button>
      </div>
    </div>`;
  ptOpenModal(html, st);
  ptDrawEditBits();
  armModalSnapshot('ptModal');
}
function ptDrawEditBits() {
  const st = ptModalState;
  if (!st || st.kind !== 'pet') return;
  const prev = document.getElementById('ptF_preview');
  if (prev) {
    prev.style.setProperty('--fam', st.color);
    prev.innerHTML = st.photo ? `<span class="fam-ava-in"><img src="${famAttr(st.photo)}" alt="" /></span>` : `<span class="fam-ava-in">${escapeHtml(st.emoji)}</span>`;
  }
  const em = document.getElementById('ptF_emojis');
  if (em) em.innerHTML = [...new Set([st.emoji, ...ptSpecies(st.species).emojis])].map(e => `<button type="button" class="ls-pick emoji${!st.photo && e === st.emoji ? ' active' : ''}" data-ptm="emoji" data-v="${famAttr(e)}">${escapeHtml(e)}</button>`).join('');
  ptDrawMeds();
}
function ptSyncMeds() {
  const st = ptModalState;
  if (!st || !st.meds) return;
  st.meds = st.meds.map((x, i) => ({
    id: x.id || ptId('pm'),
    name: (document.querySelector(`[data-ptmedname="${i}"]`) || {}).value || '',
    dose: (document.querySelector(`[data-ptmeddose="${i}"]`) || {}).value || '',
    times: (document.querySelector(`[data-ptmedtimes="${i}"]`) || {}).value || '',
  }));
}
function ptDrawMeds() {
  const st = ptModalState;
  const box = document.getElementById('ptF_meds');
  if (!box || !st) return;
  box.innerHTML = st.meds.length ? st.meds.map((x, i) => `<div class="fam-contact-row">
      <div class="fam-list-row"><input class="fz-in" data-ptmedname="${i}" value="${famAttr(x.name || '')}" placeholder="Medikament" maxlength="60" />
        <button type="button" class="fam-x" data-ptm="rmmed" data-i="${i}" aria-label="Entfernen">×</button></div>
      <div class="fam-list-row mt-1"><input class="fz-in" data-ptmeddose="${i}" value="${famAttr(x.dose || '')}" placeholder="Dosis, z. B. ½ Tablette" maxlength="40" />
        <input class="fz-in" data-ptmedtimes="${i}" value="${famAttr(x.times || '')}" placeholder="z. B. morgens & abends" maxlength="40" /></div>
    </div>`).join('') : '<p class="text-xs text-ink/40">Keine Medikamente eingetragen.</p>';
}
function ptParseTimes(v) {
  return [...new Set(String(v || '').split(/[,;\s]+/).map(t => {
    const m = /^(\d{1,2})(?:[:.](\d{2}))?$/.exec(t.trim());
    if (!m) return '';
    const h = Number(m[1]), mi = Number(m[2] || 0);
    return h < 24 && mi < 60 ? `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : '';
  }).filter(Boolean))].sort().slice(0, 6);
}
function ptPresetCare(species) {
  const today = ptToday();
  return (PT_CARE_PRESETS[species] || []).map(([type, title, every]) => ({ id: ptId('pc'), type, title, every, last: '', next: addDaysToDateStr(today, Math.min(every, 14)) }));
}
function ptSavePet() {
  const st = ptModalState;
  if (!st || st.kind !== 'pet') return;
  ptSyncMeds();
  const name = ptVal('ptF_name');
  const err = document.getElementById('ptF_err');
  if (!name) { err.textContent = 'Bitte einen Namen eingeben.'; return; }
  const old = st.id ? ptById(st.id) : null;
  const walks = Math.max(0, Math.min(12, parseInt(ptVal('ptF_walks'), 10) || 0));
  const p = {
    ...(old || {}),
    id: old ? old.id : ptId('pt'),
    name, species: st.species, emoji: st.emoji, photo: st.photo || '', color: st.color, breed: ptVal('ptF_breed'),
    sex: st.sex, neutered: ptChecked('ptF_neutered'), birth: ptVal('ptF_birth'), since: ptVal('ptF_since'),
    owners: st.owners.filter(id => memberById(id)),
    feed: { brand: ptVal('ptF_food'), amount: ptVal('ptF_amount'), times: ptParseTimes(ptVal('ptF_times')), pantryId: ptVal('ptF_pantry') },
    walks,
    allergies: ptVal('ptF_allergies'), conditions: ptVal('ptF_conditions'),
    meds: st.meds.map(x => ({ id: x.id || ptId('pm'), name: String(x.name || '').trim(), dose: String(x.dose || '').trim(), times: String(x.times || '').trim() })).filter(x => x.name),
    vet: ptVal('ptF_vet'), vetPhone: ptVal('ptF_vetPhone'), vetAddress: ptVal('ptF_vetAddress'),
    emergencyVet: ptVal('ptF_eVet'), emergencyVetPhone: ptVal('ptF_eVetPhone'),
    chip: ptVal('ptF_chip'), passNo: ptVal('ptF_pass'), insurance: ptVal('ptF_ins'), insuranceNo: ptVal('ptF_insNo'),
    trackerId: ptVal('ptF_tracker') || (document.getElementById('ptF_tracker') ? '' : (old && old.trackerId) || ''),
    notes: ptVal('ptF_notes'), sitter: ptVal('ptF_sitter'),
    push: ptChecked('ptF_push'),
    updated: Date.now(),
  };
  if (!old) {
    p.created = Date.now();
    p.care = ptChecked('ptF_presets') ? ptPresetCare(p.species) : [];
    p.weights = [];
    p.roster = {};
  }
  Object.keys(p).forEach(k => { if (p[k] === '') delete p[k]; });
  pets = old ? ptList().map(x => (x.id === p.id ? p : x)) : [...ptList(), p];
  persistState();
  ptCloseModal();
  ptDetailId = p.id;
  ptRefresh();
  finShowToast(old ? 'Gespeichert' : `${p.name} ist jetzt dabei 🐾`);
}
function ptDeletePet() {
  const st = ptModalState;
  const p = st && ptById(st.id);
  if (!p) return;
  if (!confirm(`${p.name} mit Vorsorge, Gewicht und Tagebuch wirklich löschen?`)) return;
  pets = ptList().filter(x => x.id !== p.id);
  petLog = ptLog().filter(x => x.pet !== p.id);
  persistState();
  ptCloseModal();
  ptDetailId = null;
  ptRefresh();
}
function ptToggleGone() {
  const st = ptModalState;
  const p = st && ptById(st.id);
  if (!p) return;
  if (p.gone) {
    ptUpdate(p.id, x => { const c = { ...x }; delete c.gone; return c; });
  } else {
    const d = prompt(`Wann ist ${p.name} gestorben? (TT.MM.JJJJ)`, famFmtDate(ptToday()));
    if (d === null) return;
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(d.trim());
    const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ptToday();
    ptUpdate(p.id, x => ({ ...x, gone: iso, push: false }));
  }
  ptCloseModal();
  ptRefresh();
}
function ptAdoptMember(mid) {
  const m = memberById(mid);
  if (!m || !ptCanEdit()) return;
  const pass = famPass(mid) || {};
  const sp = PT_SPECIES.find(x => x.emojis.includes(m.avatar)) || ptSpecies('sonstiges');
  const p = {
    id: ptId('pt'), fromMember: m.id, name: m.name || memberLabel(m), species: sp.id, emoji: m.avatar || sp.emoji,
    photo: m.photo || '', color: (m.color && m.color !== 'transparent') ? m.color : PT_COLORS[0],
    breed: pass.species || '', birth: pass.birth || '', chip: pass.chip || '', vet: pass.vet || '', vetPhone: pass.vetPhone || '',
    insurance: pass.insurance || '', insuranceNo: pass.insuranceNo || '', allergies: pass.allergies || '', conditions: pass.conditions || '',
    notes: pass.notes || '', meds: (pass.meds || []).filter(x => x && x.name).map(x => ({ id: ptId('pm'), name: x.name, dose: x.dose || '' })),
    weights: Number(pass.weight) > 0 ? [{ id: ptId('pw'), date: ptToday(), kg: Number(String(pass.weight).replace(',', '.')) }] : [],
    care: ptPresetCare(sp.id), walks: sp.walks, feed: { times: sp.feed.slice() }, roster: {}, push: true, created: Date.now(), updated: Date.now(),
  };
  Object.keys(p).forEach(k => { if (p[k] === '') delete p[k]; });
  pets = [...ptList(), p];
  persistState();
  ptDetailId = p.id;
  ptRefresh();
  finShowToast(`${p.name} ist jetzt bei den Haustieren 🐾`);
}

/* Care */
function ptOpenCare(petId, careId, presetType) {
  const p = ptById(petId);
  if (!p || !ptCanEdit()) return;
  const c = careId ? (p.care || []).find(x => x.id === careId) : null;
  const st = { kind: 'care', petId, careId: c ? c.id : '', type: c ? c.type : (presetType || 'impfung') };
  const every = c ? (Number(c.every) || 0) : 365;
  const html = `
    <h3 class="font-serif text-lg mb-1">${c ? '<span>Vorsorge bearbeiten</span>' : '<span>Neue Vorsorge</span>'}</h3>
    <p class="text-xs text-ink/50 mb-3">${escapeHtml(p.name)}</p>
    <div class="fz-type-row mb-3">${PT_CARE_TYPES.map(t => `<button type="button" class="fz-type-chip${t.id === st.type ? ' active' : ''}" data-ptm="ctype" data-v="${t.id}"><span class="fz-ti">${t.icon}</span><span>${escapeHtml(t.label)}</span></button>`).join('')}</div>
    ${famIn('ptC_title', 'Bezeichnung', c ? c.title : '', 'maxlength="60" autocomplete="off" placeholder="z. B. Tollwut-Impfung"')}
    <div class="fz-grid2">${famIn('ptC_last', 'Zuletzt erledigt', c ? c.last : '', 'type="date"')}
      <div class="fz-field"><label class="fz-lbl" for="ptC_every">Wiederholen</label><select id="ptC_every" class="fz-in">${PT_EVERY.map(([v, l]) => `<option value="${v}"${v === every ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('')}${PT_EVERY.some(([v]) => v === every) ? '' : `<option value="${every}" selected>${every}</option>`}</select></div></div>
    ${famIn('ptC_next', 'Nächstes Mal (optional)', c && ptIso(c.next) ? c.next : '', 'type="date"')}
    <p id="ptC_hint" class="text-[11px] text-ink/50 -mt-1 mb-3"></p>
    ${famTa('ptC_note', 'Notiz', c ? c.note : '', 'z. B. Impfstoff, Charge, Präparat')}
    <div class="flex items-center justify-between gap-2 mt-3">
      ${c ? '<button type="button" class="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50" data-ptm="caredel">Löschen</button>' : '<span></span>'}
      <div class="flex gap-2"><button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-ptm="cancel">Abbrechen</button>
      <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-ptm="savecare">Speichern</button></div>
    </div>`;
  ptOpenModal(html, st);
  ptCareHint();
}
function ptCareHint() {
  const el = document.getElementById('ptC_hint');
  if (!el) return;
  const next = ptVal('ptC_next');
  const last = ptVal('ptC_last');
  const every = Number(ptVal('ptC_every')) || 0;
  const n = ptIso(next) ? next : (ptIso(last) && every ? addDaysToDateStr(last, every) : '');
  el.textContent = n ? 'Fällig am ' + famFmtDate(n) : (every ? 'Ohne Datum: einfach „Zuletzt erledigt“ eintragen.' : '');
}
function ptSaveCare() {
  const st = ptModalState;
  if (!st || st.kind !== 'care') return;
  const title = ptVal('ptC_title') || ptCareType(st.type).label;
  const every = Number(ptVal('ptC_every')) || 0;
  const c = { id: st.careId || ptId('pc'), type: st.type, title, last: ptVal('ptC_last'), every, next: ptVal('ptC_next'), note: ptVal('ptC_note') };
  // Only keep "Next time" if it differs from the calculated date
  if (c.next && ptIso(c.last) && every && addDaysToDateStr(c.last, every) === c.next) c.next = '';
  Object.keys(c).forEach(k => { if (c[k] === '') delete c[k]; });
  ptUpdate(st.petId, p => {
    const list = Array.isArray(p.care) ? p.care.slice() : [];
    const i = list.findIndex(x => x.id === c.id);
    if (i >= 0) list[i] = c; else list.push(c);
    return { ...p, care: list };
  });
  ptCloseModal();
  ptRefresh();
}
function ptDeleteCare() {
  const st = ptModalState;
  if (!st || !st.careId || !confirm('Diese Vorsorge löschen?')) return;
  ptUpdate(st.petId, p => ({ ...p, care: (p.care || []).filter(x => x.id !== st.careId) }));
  ptCloseModal();
  ptRefresh();
}
function ptCareDone(petId, careId) {
  const p = ptById(petId);
  const c = p && (p.care || []).find(x => x.id === careId);
  if (!c || !ptCanEdit()) return;
  const today = ptToday();
  const every = Number(c.every) || 0;
  ptUpdate(petId, x => ({ ...x, care: (x.care || []).map(y => {
    if (y.id !== careId) return y;
    const n = { ...y, last: today };
    delete n.next;
    return n;
  }) }));
  ptRefresh();
  finShowToast(every ? 'Erledigt ✓ – nächstes Mal am ' + famFmtDate(addDaysToDateStr(today, every)) : 'Erledigt ✓');
}
function ptAddPresets(petId) {
  const p = ptById(petId);
  if (!p) return;
  const have = new Set((p.care || []).map(c => c.title));
  const add = ptPresetCare(p.species).filter(c => !have.has(c.title));
  if (!add.length) return;
  ptUpdate(petId, x => ({ ...x, care: [...(x.care || []), ...add] }));
  ptRefresh();
  finShowToast('Vorschläge übernommen – Daten bei Bedarf anpassen.');
}

/* Weight */
function ptOpenWeight(petId) {
  const p = ptById(petId);
  if (!p) return;
  const html = `<h3 class="font-serif text-lg mb-1"><span>Gewicht eintragen</span></h3><p class="text-xs text-ink/50 mb-3">${escapeHtml(p.name)}</p>
    <div class="fz-grid2">${famIn('ptW_date', 'Datum', ptToday(), 'type="date"')}<div class="fz-field"><label class="fz-lbl" for="ptW_kg">Gewicht</label><div class="fz-unit"><input id="ptW_kg" class="fz-in" inputmode="decimal" autocomplete="off" maxlength="7" placeholder="z. B. 24,5" /><span>kg</span></div></div></div>
    <p id="ptW_err" class="text-xs text-red-600 min-h-[1em]"></p>
    <div class="flex justify-end gap-2 mt-2"><button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-ptm="cancel">Abbrechen</button>
    <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-ptm="saveweight">Speichern</button></div>`;
  ptOpenModal(html, { kind: 'weight', petId });
  if (!isMobile()) setTimeout(() => { const el = document.getElementById('ptW_kg'); if (el) el.focus(); }, 60);
}
function ptSaveWeight() {
  const st = ptModalState;
  const kg = Number(ptVal('ptW_kg').replace(',', '.'));
  const date = ptVal('ptW_date') || ptToday();
  if (!(kg > 0 && kg < 2000)) { document.getElementById('ptW_err').textContent = 'Bitte ein Gewicht eingeben.'; return; }
  ptUpdate(st.petId, p => ({ ...p, weights: [...(p.weights || []).filter(w => w.date !== date), { id: ptId('pw'), date, kg: Math.round(kg * 100) / 100 }].sort((a, b) => a.date.localeCompare(b.date)) }));
  ptCloseModal();
  ptRefresh();
}
function ptOpenWeights(petId) {
  const p = ptById(petId);
  if (!p) return;
  const ws = (p.weights || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const html = `<h3 class="font-serif text-lg mb-3"><span>Gewicht</span> · ${escapeHtml(p.name)}</h3>
    <div class="flex flex-col">${ws.map(w => `<div class="fam-row"><div class="fam-v">${escapeHtml(famFmtDate(w.date))}</div><b class="text-sm">${escapeHtml(Number(w.kg).toLocaleString('de-DE'))} kg</b>${ptCanEdit() ? `<button type="button" class="fam-x" data-ptm="wdel" data-v="${famAttr(w.id)}" aria-label="Entfernen">×</button>` : ''}</div>`).join('')}</div>
    <div class="flex justify-end mt-3"><button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-ptm="cancel">Fertig</button></div>`;
  ptOpenModal(html, { kind: 'weights', petId });
}

/* Walks */
function ptOpenWalk(petId) {
  const p = ptById(petId);
  if (!p || !ptCanEdit()) return;
  const me = currentMember();
  const st = { kind: 'walk', petId, min: 30, by: me ? me.id : '' };
  const html = `<h3 class="font-serif text-lg mb-1">🦮 <span>Gassi eintragen</span></h3><p class="text-xs text-ink/50 mb-3">${escapeHtml(p.name)}</p>
    <label class="fz-lbl">Wie lange?</label>
    <div class="flex flex-wrap gap-1.5 mb-3">${[10, 20, 30, 45, 60, 90, 120].map(n => `<button type="button" class="fz-filter-chip px-3 py-1.5 text-sm${n === st.min ? ' active' : ''}" data-ptm="wmin" data-v="${n}"><b>${n}</b> <span>Min.</span></button>`).join('')}</div>
    <label class="fz-lbl">Wer war unterwegs?</label>
    <div class="flex flex-wrap gap-1.5 mb-3">${ptMemberChips('ptwho', st.by ? [st.by] : [])}</div>
    ${famIn('ptK_note', 'Notiz (optional)', '', 'maxlength="80" autocomplete="off" placeholder="z. B. Hundewiese, großes Geschäft ✓"')}
    <div class="flex justify-end gap-2 mt-2"><button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-ptm="cancel">Abbrechen</button>
    <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-ptm="savewalk">Eintragen</button></div>`;
  ptOpenModal(html, st);
}
function ptSaveWalk() {
  const st = ptModalState;
  if (!st) return;
  const p = ptById(st.petId);
  ptAddLog({ pet: st.petId, kind: 'gassi', min: st.min, by: st.by, note: ptVal('ptK_note') });
  ptCloseModal();
  ptRefresh();
  const n = p ? ptWalksToday(p).length : 0;
  const goal = p ? Number(p.walks) || 0 : 0;
  finShowToast(goal && n >= goal ? 'Alle Runden für heute geschafft 🐾🎉' : 'Gassi eingetragen 🐾');
}

/* Feeding & medication */
function ptToggleFeed(petId, slot) {
  const p = ptById(petId);
  if (!p || !ptCanEdit()) return;
  const x = ptFedSlot(p, slot);
  if (x) {
    if (!confirm(`Fütterung um ${slot} wieder offen setzen?`)) return;
    ptRemoveLog(x.id);
  } else {
    ptAddLog({ pet: petId, kind: 'futter', slot });
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) { /* ignore */ }
  }
  ptRefresh();
}
function ptFeedNext(petId) {
  const p = ptById(petId);
  if (!p) return;
  const open = ptFeedTimes(p).filter(t => !ptFedSlot(p, t));
  if (!open.length) { finShowToast('Heute schon alles gefüttert ✓'); return; }
  const now = new Date();
  const hm = `${String(now.getHours() + 1).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const slot = open.filter(t => t <= hm).pop() || open[0];
  ptAddLog({ pet: petId, kind: 'futter', slot });
  ptRefresh();
  finShowToast(`${p.name}: ${slot} gefüttert 🍖`);
}
function ptMedGiven(petId, name) {
  ptAddLog({ pet: petId, kind: 'med', note: name });
  ptRefresh();
  finShowToast(`${name} ✓`);
}

/* Duty roster */
function ptOpenRoster(petId) {
  const p = ptById(petId);
  if (!p || !ptCanEdit()) return;
  const st = { kind: 'roster', petId, roster: JSON.parse(JSON.stringify(p.roster || {})) };
  const wd = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const html = `<h3 class="font-serif text-lg mb-1">📋 <span>Wer ist dran?</span></h3><p class="text-xs text-ink/50 mb-3">${escapeHtml(p.name)} · <span>Füttern, Gassi, Sauber machen</span></p>
    ${wd.map((d, i) => { const k = String(i + 1); return `<div class="pt-rost-edit"><div class="text-xs font-semibold text-ink/60 mb-1">${escapeHtml(d)}</div><div class="flex flex-wrap gap-1.5">${ptMemberChips('ptrost-' + k, st.roster[k] || [])}</div></div>`; }).join('')}
    <div class="flex items-center justify-between gap-2 mt-3 flex-wrap">
      <button type="button" class="fz-mini-btn" data-ptm="rostauto">🔄 <span>Reihum verteilen</span></button>
      <div class="flex gap-2"><button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-ptm="cancel">Abbrechen</button>
      <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-ptm="saveroster">Speichern</button></div>
    </div>`;
  ptOpenModal(html, st);
}
function ptRosterAuto() {
  const st = ptModalState;
  const p = ptById(st.petId);
  const pool = (p && p.owners && p.owners.length ? p.owners.map(id => memberById(id)).filter(Boolean) : ptPeople().filter(m => !m.childLock || isKidPageEnabled(m)));
  if (!pool.length) return;
  for (let i = 1; i <= 7; i++) st.roster[String(i)] = [pool[(i - 1) % pool.length].id];
  for (let i = 1; i <= 7; i++) {
    document.querySelectorAll(`#ptModalBody [data-ptrost-${i}]`).forEach(b => b.classList.toggle('active', st.roster[String(i)].includes(b.getAttribute('data-ptrost-' + i))));
  }
}
function ptSaveRoster() {
  const st = ptModalState;
  ptUpdate(st.petId, p => ({ ...p, roster: st.roster }));
  ptCloseModal();
  ptRefresh();
}

/* Pet sitter sheet */
function ptSitterText(p) {
  const T = x => ((window.PINN_I18N && PINN_I18N.active) ? PINN_I18N.t(x) : x);
  const L = [];
  const sp = ptSpecies(p.species);
  L.push(`🐾 ${p.name} – ${[p.breed || T(sp.label), T(ptAgeText(p))].filter(Boolean).join(', ')}`);
  const f = p.feed || {};
  const times = ptFeedTimes(p);
  if (f.brand || f.amount || times.length) L.push('', '🥣 ' + T('Futter') + ': ' + [f.brand, f.amount ? f.amount + ' ' + T('je Mahlzeit') : '', times.length ? times.join(' & ') : ''].filter(Boolean).join(', '));
  if (Number(p.walks) > 0) L.push('🦮 ' + T('Gassi') + ': ' + p.walks + '× ' + T('am Tag'));
  const meds = (p.meds || []).filter(m => m.name);
  if (meds.length) L.push('💊 ' + T('Medikamente') + ': ' + meds.map(m => [m.name, m.dose, m.times].filter(Boolean).join(' – ')).join('; '));
  if (p.allergies) L.push('⚠️ ' + T('Allergien') + ': ' + p.allergies);
  if (p.conditions) L.push('🩺 ' + T('Erkrankungen') + ': ' + p.conditions);
  if (p.notes) L.push('', '💬 ' + p.notes);
  if (p.sitter) L.push('', '📝 ' + p.sitter);
  L.push('');
  if (p.vet || p.vetPhone) L.push('🏥 ' + T('Tierarzt') + ': ' + [p.vet, p.vetPhone, p.vetAddress].filter(Boolean).join(', '));
  if (p.emergencyVet || p.emergencyVetPhone) L.push('🚨 ' + T('Tiernotdienst') + ': ' + [p.emergencyVet, p.emergencyVetPhone].filter(Boolean).join(', '));
  if (p.chip) L.push('🔖 ' + T('Chipnummer') + ': ' + p.chip);
  const owners = (p.owners && p.owners.length ? p.owners : []).map(id => memberById(id)).filter(Boolean);
  const phones = owners.map(m => { const ph = (famPass(m.id) || {}).phone; return ph ? memberLabel(m) + ' ' + ph : ''; }).filter(Boolean);
  if (phones.length) L.push('📞 ' + phones.join(' · '));
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function ptOpenSitter(petId) {
  const p = ptById(petId);
  if (!p) return;
  const txt = ptSitterText(p);
  const html = `<h3 class="font-serif text-lg mb-1">🧑‍🍼 <span>Für den Tiersitter</span></h3><p class="text-xs text-ink/50 mb-3">Alles Wichtige zu ${escapeHtml(p.name)} – zum Kopieren oder Teilen.</p>
    <pre class="pt-sitter" data-no-i18n>${escapeHtml(txt)}</pre>
    <div class="flex justify-end gap-2 mt-3 flex-wrap">
      <button type="button" class="px-3 py-2 rounded-lg border border-ink/15 text-sm" data-ptm="sittercopy">📋 <span>Kopieren</span></button>
      ${navigator.share ? '<button type="button" class="px-3 py-2 rounded-lg border border-ink/15 text-sm" data-ptm="sittershare"><span>Teilen</span></button>' : ''}
      <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-ptm="cancel">Fertig</button>
    </div>`;
  ptOpenModal(html, { kind: 'sitter', petId, text: txt });
}

/* Missing poster */
function ptPosterHtml(p) {
  const owners = (p.owners && p.owners.length ? p.owners.map(id => memberById(id)).filter(Boolean) : ptPeople());
  const phones = owners.map(m => (famPass(m.id) || {}).phone ? { n: memberLabel(m), ph: famPass(m.id).phone } : null).filter(Boolean).slice(0, 3);
  const sex = p.sex === 'm' ? '♂' : p.sex === 'w' ? '♀' : '';
  return `<div class="pt-poster">
    <div class="pt-poster-h">VERMISST</div>
    <div class="pt-poster-img">${p.photo ? `<img src="${famAttr(p.photo)}" alt="" />` : `<span>${escapeHtml(p.emoji || '🐾')}</span>`}</div>
    <div class="pt-poster-name">${escapeHtml(p.name)}</div>
    <div class="pt-poster-sub">${escapeHtml([p.breed || ptSpecies(p.species).label, sex, ptAgeText(p)].filter(Boolean).join(' · '))}</div>
    ${p.notes ? `<div class="pt-poster-note">${escapeHtml(p.notes)}</div>` : ''}
    ${p.chip ? `<div class="pt-poster-chip"><span>Gechippt</span>: ${escapeHtml(p.chip)}</div>` : ''}
    <div class="pt-poster-call"><span>Bitte melden unter</span>${phones.length ? phones.map(x => `<b>${escapeHtml(x.ph)}</b><small>${escapeHtml(x.n)}</small>`).join('') : '<b>__________________</b>'}</div>
    <div class="pt-poster-foot"><span>Bitte nicht verfolgen – ruhig ansprechen und anrufen. Danke!</span></div>
  </div>`;
}
function ptOpenPoster(petId) {
  const p = ptById(petId);
  if (!p) return;
  const html = `<h3 class="font-serif text-lg mb-1">🔎 <span>Vermisst-Plakat</span></h3><p class="text-xs text-ink/50 mb-3">Drucken oder als PDF sichern – Telefonnummern kommen aus den Notfallpässen der Bezugspersonen.</p>
    <div class="pt-poster-wrap">${ptPosterHtml(p)}</div>
    <div class="flex justify-end gap-2 mt-3"><button type="button" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink" data-ptm="cancel">Schließen</button>
    <button type="button" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium" data-ptm="print">🖨️ <span>Drucken</span></button></div>`;
  ptOpenModal(html, { kind: 'poster', petId });
}
function ptPrintPoster() {
  const st = ptModalState;
  const p = st && ptById(st.petId);
  if (!p) return;
  let host = document.getElementById('ptPrint');
  if (!host) { host = document.createElement('div'); host.id = 'ptPrint'; document.body.appendChild(host); }
  host.innerHTML = ptPosterHtml(p);
  document.documentElement.classList.add('pt-printing');
  const done = () => { document.documentElement.classList.remove('pt-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { try { window.print(); } catch (e) { done(); } setTimeout(done, 60000); }, 120);
}

/* Food on the shopping list, packing list */
function ptFoodToShopping(petId) {
  const p = ptById(petId);
  if (!p) return;
  const f = p.feed || {};
  const pi = f.pantryId ? (pantryItems || []).find(x => x.id === f.pantryId) : null;
  const name = pi ? pi.name : (f.brand || 'Tierfutter');
  const listId = (typeof shoppingStammladenId === 'function' && shoppingStammladenId()) || '';
  const target = listId === SHOPPING_MEAL_LIST_ID ? '' : listId;
  const exists = shoppingItems.some(it => !it.done && (it.listId || '') === target && normalizeForGrouping(it.name || '') === normalizeForGrouping(name));
  if (exists) { finShowToast('Steht schon auf der Einkaufsliste.'); return; }
  shoppingItems = [...shoppingItems, { id: 'si' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, qty: '', note: 'für ' + p.name, done: false, createdAt: Date.now(), listId: target }];
  persistState();
  const l = getShoppingList(listId);
  finShowToast(`${name} → ${l ? l.name : 'Einkaufsliste'} ✓`);
}
var PT_PACK = {
  hund: [['Futter & Wasser', ['Futter (für alle Tage + Reserve)', 'Leckerlis & Kauknochen', 'Futter- & Wassernapf', 'Trinkflasche für unterwegs']], ['Unterwegs', ['Leine & Halsband / Geschirr', 'Schleppleine', 'Kotbeutel', 'Maulkorb (falls Pflicht)', 'Hundedecke / Körbchen', 'Transportbox / Sicherheitsgurt', 'Lieblingsspielzeug', 'Handtuch']], ['Gesundheit & Papiere', ['EU-Heimtierausweis', 'Impfnachweis (Tollwut)', 'Medikamente', 'Floh- & Zeckenschutz', 'Zeckenzange', 'Adresse Tierarzt am Urlaubsort']]],
  katze: [['Futter & Wasser', ['Futter (für alle Tage + Reserve)', 'Leckerlis', 'Futter- & Wassernapf']], ['Unterwegs', ['Transportbox', 'Katzenklo & Streu', 'Kuscheldecke', 'Kratzbrett', 'Spielzeug', 'Geschirr & Leine']], ['Gesundheit & Papiere', ['EU-Heimtierausweis', 'Impfnachweis', 'Medikamente', 'Flohschutz']]],
  default: [['Futter & Wasser', ['Futter (für alle Tage + Reserve)', 'Napf / Tränke']], ['Unterwegs', ['Transportbox / Käfig', 'Einstreu', 'Decke', 'Spielzeug']], ['Gesundheit & Papiere', ['Heimtierausweis', 'Medikamente', 'Adresse Tierarzt am Urlaubsort']]],
};
function ptMakePackList(petId) {
  const p = ptById(petId);
  if (!p || !isViewAllowed('einkauf')) return;
  const secs = PT_PACK[p.species] || PT_PACK.default;
  const now = Date.now();
  let n = 0;
  const items = [];
  secs.forEach(([sec, arr]) => arr.forEach(text => items.push({ id: lsId('fi'), text, done: false, section: sec, createdAt: now + (n++) })));
  (p.meds || []).filter(m => m.name).forEach(m => items.push({ id: lsId('fi'), text: m.name + (m.dose ? ' (' + m.dose + ')' : ''), done: false, section: 'Gesundheit & Papiere', createdAt: now + (n++) }));
  const l = { id: lsId('fl'), type: 'pack', name: 'Urlaub mit ' + p.name, icon: p.emoji || '🐾', createdAt: now, createdBy: lsMyUserId(), items };
  familyLists = [...familyLists, l];
  persistState();
  setView('einkauf');
  lsOpenList(l.id);
  finShowToast('Packliste angelegt – Reiseziel & Zeitraum über ✏️ ergänzen.');
}

/* ---------- Wiring ---------- */
function ptPaneClick(e) {
  const b = e.target.closest('[data-pt]');
  if (!b || b.disabled) return false;
  const id = b.dataset.id || '';
  switch (b.dataset.pt) {
    case 'new': ptOpenEdit(''); break;
    case 'open': ptOpen(id); break;
    case 'back': ptDetailId = null; renderFamily(); { const sc = document.getElementById('famScroll'); if (sc) sc.scrollTop = 0; } break;
    case 'edit': ptOpenEdit(id); break;
    case 'adopt': ptAdoptMember(id); break;
    case 'togglegone': ptShowGone = !ptShowGone; renderFamily(); break;
    case 'care': ptOpenCare(id, b.dataset.cid); break;
    case 'caredone': ptCareDone(id, b.dataset.cid); break;
    case 'careadd': ptOpenCare(id, ''); break;
    case 'presets': ptAddPresets(id); break;
    case 'weight': ptOpenWeight(id); break;
    case 'weights': ptOpenWeights(id); break;
    case 'walk': ptOpenWalk(id); break;
    case 'feed': ptToggleFeed(id, b.dataset.slot); break;
    case 'feednext': ptFeedNext(id); break;
    case 'medgiven': ptMedGiven(id, b.dataset.name); break;
    case 'roster': ptOpenRoster(id); break;
    case 'logdel': if (confirm('Eintrag entfernen?')) { ptRemoveLog(id); ptRefresh(); } break;
    case 'sitter': ptOpenSitter(id); break;
    case 'poster': ptOpenPoster(id); break;
    case 'docs': docFilterCategory = 'haustiere'; setView('dokumente'); break;
    case 'pantry': setView('vorrat'); break;
    case 'foodshop': ptFoodToShopping(id); break;
    case 'packlist': ptMakePackList(id); break;
    case 'map': famShowOnMap(id); break;
    default: return false;
  }
  return true;
}
(function ptWire() {
  const modal = document.getElementById('ptModal');
  if (!modal) return;
  const body = document.getElementById('ptModalBody');
  document.getElementById('ptModalClose').addEventListener('click', () => attemptCloseModal('ptModal', ptCloseModal));
  wireModalOutsideClick('ptModal', ptCloseModal);
  body.addEventListener('click', (e) => {
    const st = ptModalState;
    const own = e.target.closest('[data-ptowner]');
    if (own && st) { const id = own.dataset.ptowner; st.owners = st.owners.includes(id) ? st.owners.filter(x => x !== id) : st.owners.concat(id); own.classList.toggle('active', st.owners.includes(id)); return; }
    const who = e.target.closest('[data-ptwho]');
    if (who && st) { st.by = st.by === who.dataset.ptwho ? '' : who.dataset.ptwho; body.querySelectorAll('[data-ptwho]').forEach(x => x.classList.toggle('active', x.dataset.ptwho === st.by)); return; }
    for (let i = 1; i <= 7; i++) {
      const r = e.target.closest(`[data-ptrost-${i}]`);
      if (r && st && st.roster) {
        const k = String(i), id = r.getAttribute('data-ptrost-' + i);
        const cur = st.roster[k] || [];
        st.roster[k] = cur.includes(id) ? cur.filter(x => x !== id) : cur.concat(id);
        r.classList.toggle('active', st.roster[k].includes(id));
        return;
      }
    }
    const b = e.target.closest('[data-ptm]');
    if (!b) return;
    const v = b.dataset.v;
    switch (b.dataset.ptm) {
      case 'cancel': attemptCloseModal('ptModal', ptCloseModal); break;
      case 'species': {
        const old = ptSpecies(st.species);
        st.species = v;
        const sp = ptSpecies(v);
        if (old.emojis.includes(st.emoji)) st.emoji = sp.emoji;
        body.querySelectorAll('[data-ptm="species"]').forEach(x => x.classList.toggle('active', x === b));
        if (!st.id) {
          const w = document.getElementById('ptF_walks'); if (w && (!w.value || w.value === String(old.walks))) w.value = sp.walks ? String(sp.walks) : '';
          const t = document.getElementById('ptF_times'); if (t && (!t.value || t.value === old.feed.join(', '))) t.value = sp.feed.join(', ');
        }
        ptDrawEditBits();
        break;
      }
      case 'emoji': st.emoji = v; st.photo = ''; ptDrawEditBits(); break;
      case 'nophoto': st.photo = ''; ptDrawEditBits(); break;
      case 'color': st.color = v; body.querySelectorAll('[data-ptm="color"]').forEach(x => x.classList.toggle('active', x === b)); ptDrawEditBits(); break;
      case 'sex': st.sex = v; body.querySelectorAll('[data-ptm="sex"]').forEach(x => x.classList.toggle('active', x === b)); break;
      case 'addmed': ptSyncMeds(); st.meds.push({ id: ptId('pm'), name: '', dose: '', times: '' }); ptDrawMeds(); break;
      case 'rmmed': ptSyncMeds(); st.meds.splice(Number(b.dataset.i), 1); ptDrawMeds(); break;
      case 'savepet': ptSavePet(); break;
      case 'delete': ptDeletePet(); break;
      case 'gone': ptToggleGone(); break;
      case 'ctype': {
        st.type = v;
        body.querySelectorAll('[data-ptm="ctype"]').forEach(x => x.classList.toggle('active', x === b));
        const t = document.getElementById('ptC_title');
        if (t && !t.value.trim()) t.placeholder = ptCareType(v).label;
        break;
      }
      case 'savecare': ptSaveCare(); break;
      case 'caredel': ptDeleteCare(); break;
      case 'saveweight': ptSaveWeight(); break;
      case 'wdel':
        ptUpdate(st.petId, p => ({ ...p, weights: (p.weights || []).filter(w => w.id !== v) }));
        ptOpenWeights(st.petId); ptRefresh();
        break;
      case 'wmin': st.min = Number(v) || 30; body.querySelectorAll('[data-ptm="wmin"]').forEach(x => x.classList.toggle('active', x === b)); break;
      case 'savewalk': ptSaveWalk(); break;
      case 'rostauto': ptRosterAuto(); break;
      case 'saveroster': ptSaveRoster(); break;
      case 'sittercopy': famCopy(st.text); break;
      case 'sittershare': try { navigator.share({ text: st.text }).catch(() => {}); } catch (err) { /* ignore */ } break;
      case 'print': ptPrintPoster(); break;
    }
  });
  body.addEventListener('change', async (e) => {
    const st = ptModalState;
    if (!st) return;
    if (e.target.id === 'ptF_photo' && e.target.files && e.target.files[0]) {
      try { st.photo = await readAvatarPhotoFile(e.target.files[0]); ptDrawEditBits(); }
      catch (err) { if (!(err && err.cancelled)) finShowToast(err.message, true); } // cancelled crop: no message
      e.target.value = '';
    }
    if (['ptC_last', 'ptC_every', 'ptC_next'].includes(e.target.id)) ptCareHint();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) attemptCloseModal('ptModal', ptCloseModal); });
})();

/* ==========================================================
   Weather view (tap on the weather tile) & holiday weather
   ----------------------------------------------------------
   - 14 days for home from the 16-day forecast (pb_hooks/pinn-zuhause.js). From day 8 marked as
     "trend". Tapping a day expands details: feels like, wind & gusts, UV, sunshine hours,
     amount of rain, sunrise/sunset, hourly course (only loaded when expanded) and a tip
     on what to wear.
   - Holiday: packing lists with destination and period (l.trip = { place: { titel, zusatz, lat, lon, land },
     from, to }). Up to 16 days ahead a forecast, after that typical values (average of the same days of the
     last three years). At the sea also the water temperature. Plus packing tips matching the weather.
   - Cached on the device (3 h), so that the tile, packing list and weekly preview do not
     ask again every time.
   ========================================================== */
var WX_DESC = {
  0: 'Klar', 1: 'Überwiegend sonnig', 2: 'Teils bewölkt', 3: 'Bedeckt', 45: 'Nebel', 48: 'Nebel mit Reif',
  51: 'Leichter Nieselregen', 53: 'Nieselregen', 55: 'Starker Nieselregen', 56: 'Gefrierender Nieselregen', 57: 'Gefrierender Nieselregen',
  61: 'Leichter Regen', 63: 'Regen', 65: 'Starker Regen', 66: 'Gefrierender Regen', 67: 'Gefrierender Regen',
  71: 'Leichter Schneefall', 73: 'Schneefall', 75: 'Starker Schneefall', 77: 'Schneegriesel',
  80: 'Regenschauer', 81: 'Regenschauer', 82: 'Heftige Regenschauer', 85: 'Schneeschauer', 86: 'Schneeschauer',
  95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Gewitter mit Hagel',
};
var LS_TRIP_WX = 'pinn.reisewetter';
var TRIP_WX_TTL = 3 * 60 * 60 * 1000;
var wxState = { place: 'home', sel: '' };
var wxHours = {};          // 'place|date' -> { stunden, ts, err }
var tripWxMem = null;      // { sig: { ts, data } }
var tripWxLoading = {};

function wxDesc(code) { return WX_DESC[code] || ''; }
function wxSky(code) {
  if (code === 0 || code === 1) return 'sun';
  if (code === 2) return 'part';
  if (code === 45 || code === 48) return 'fog';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  if (code >= 51) return 'rain';
  return 'cloud';
}
function wxUvLabel(uv) {
  if (uv == null) return '';
  if (uv < 3) return 'niedrig';
  if (uv < 6) return 'mäßig';
  if (uv < 8) return 'hoch';
  if (uv < 11) return 'sehr hoch';
  return 'extrem';
}
function wxRainy(d) { return !!d && ((d.rain != null && d.rain >= 50) || (d.mm != null && d.mm >= 1)); }
function wxDayName(iso, i) {
  const today = isoDate(new Date());
  if (iso === today) return 'Heute';
  if (iso === addDaysToDateStr(today, 1)) return 'Morgen';
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long' });
}
function wxShortDate(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }); }
// What do we wear? Short tips for one day
function wxTips(d) {
  if (!d) return [];
  const t = [];
  const code = d.code;
  if ([95, 96, 99].includes(code)) t.push(['⛈️', 'Gewitter möglich – draußen aufpassen']);
  if ([71, 73, 75, 77, 85, 86, 56, 57, 66, 67].includes(code) || (d.min != null && d.min <= 0)) t.push(['❄️', 'Glatt möglich – feste Schuhe']);
  if ((d.rain != null && d.rain >= 60) || (d.mm != null && d.mm >= 2)) t.push(['☔', 'Regenjacke & Schirm mitnehmen']);
  if (d.max != null && d.max <= 5) t.push(['🧤', 'Mütze, Schal & Handschuhe']);
  else if (d.max != null && d.max <= 13) t.push(['🧥', 'Warme Jacke anziehen']);
  else if (d.max != null && d.max >= 26) t.push(['🩳', 'Luftig anziehen & viel trinken']);
  if (d.uv != null && d.uv >= 6) t.push(['🧴', 'Sonnencreme & Kappe']);
  if ((d.boeen != null && d.boeen >= 60) || (d.wind != null && d.wind >= 40)) t.push(['💨', 'Sehr windig – Kapuze statt Schirm']);
  if (!t.length && d.max != null && d.max >= 18 && !wxRainy(d)) t.push(['😎', 'Perfekt für draußen']);
  return t.slice(0, 3);
}

/* ---------- Holidays (packing lists with destination & period) ---------- */
function tripValid(l) {
  const tp = l && l.trip;
  return !!(tp && tp.place && isFinite(Number(tp.place.lat)) && isFinite(Number(tp.place.lon)) && /^\d{4}-\d{2}-\d{2}$/.test(tp.from || ''));
}
function tripTo(l) { return (l.trip.to && l.trip.to >= l.trip.from) ? l.trip.to : l.trip.from; }
function tripList() {
  const today = isoDate(new Date());
  let lists = [];
  try { lists = (familyLists || []).filter(l => l && l.type === 'pack' && lsVisible(l) && tripValid(l) && tripTo(l) >= today); } catch (e) { lists = []; }
  return lists.sort((a, b) => a.trip.from.localeCompare(b.trip.from));
}
function tripById(id) { return tripList().find(l => l.id === id) || null; }
function tripName(l) { return (l.trip.place.titel || l.name || 'Urlaub'); }
function tripDaysUntil(l) { return daysBetweenDateStrs(isoDate(new Date()), l.trip.from); }
function tripWhenText(l) {
  const n = tripDaysUntil(l);
  if (n > 1) return 'in ' + n + ' Tagen';
  if (n === 1) return 'morgen';
  if (n === 0) return 'heute geht’s los';
  return 'läuft gerade';
}
function tripRangeText(l) {
  const a = new Date(l.trip.from + 'T12:00:00'), b = new Date(tripTo(l) + 'T12:00:00');
  const o = { day: 'numeric', month: 'short' };
  return a.getTime() === b.getTime() ? a.toLocaleDateString('de-DE', o) : a.toLocaleDateString('de-DE', o) + ' – ' + b.toLocaleDateString('de-DE', o);
}
function tripSig(place, from, to) { return [Math.round(Number(place.lat) * 100) / 100, Math.round(Number(place.lon) * 100) / 100, from, to || from].join('|'); }
function tripCacheRead() {
  if (tripWxMem) return tripWxMem;
  try { tripWxMem = JSON.parse(localStorage.getItem(LS_TRIP_WX) || '{}') || {}; } catch (e) { tripWxMem = {}; }
  return tripWxMem;
}
function tripCacheWrite() {
  const c = tripCacheRead();
  const now = Date.now();
  Object.keys(c).forEach(k => { if (!c[k] || now - c[k].ts > 3 * 24 * 60 * 60 * 1000) delete c[k]; });
  try { localStorage.setItem(LS_TRIP_WX, JSON.stringify(c)); } catch (e) { /* full */ }
}
function tripCached(place, from, to) {
  const c = tripCacheRead()[tripSig(place, from, to)];
  return c ? c.data : null;
}
async function tripWeatherFetch(place, from, to, force) {
  const sig = tripSig(place, from, to);
  const c = tripCacheRead()[sig];
  if (c && !force && Date.now() - c.ts < TRIP_WX_TTL) return c.data;
  if (tripWxLoading[sig]) return tripWxLoading[sig];
  const job = (async () => {
    try {
      const res = await apiFetch('/api/pinn/zuhause/reisewetter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: place.lat, lon: place.lon, von: from, bis: to || from }) });
      if (res.status === 404) throw new Error('Der Server-Teil für das Urlaubswetter fehlt noch (pb_hooks/zuhause.pb.js).');
      const body = await res.json().catch(() => ({}));
      if (body.error && !(Array.isArray(body.tage) && body.tage.length)) throw new Error(body.error);
      tripCacheRead()[sig] = { ts: Date.now(), data: body };
      tripCacheWrite();
      return body;
    } catch (e) {
      if (c) return c.data; // offline: last state
      throw e;
    } finally { delete tripWxLoading[sig]; }
  })();
  tripWxLoading[sig] = job;
  return job;
}
function tripWeather(l, force) { return tripWeatherFetch(l.trip.place, l.trip.from, tripTo(l), force); }
// Summary: average high/low, rainy days, sun, water, most frequent weather
function tripSummary(data, from, to) {
  const days = (data && Array.isArray(data.tage) ? data.tage : []).filter(d => d && (!from || d.date >= from) && (!to || d.date <= to) && d.max != null);
  if (!days.length) return null;
  const avg = k => { const v = days.map(d => d[k]).filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const counts = {};
  days.forEach(d => { const s = wxSky(d.code); counts[s] = (counts[s] || 0) + 1; });
  const sky = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const skyCode = { sun: 0, part: 2, cloud: 3, fog: 45, rain: 61, snow: 71, storm: 95 }[sky];
  const water = days.map(d => d.wasser).filter(x => x != null);
  const sonne = days.map(d => d.sonne).filter(x => x != null);
  return {
    n: days.length, max: avg('max'), min: avg('min'),
    hot: Math.max(...days.map(d => d.max)), cold: Math.min(...days.map(d => d.min != null ? d.min : d.max)),
    rainDays: days.filter(wxRainy).length, code: skyCode, sky,
    water: water.length ? Math.max(...water) : null,
    sun: sonne.length ? Math.round(sonne.reduce((a, b) => a + b, 0) / sonne.length * 10) / 10 : null,
    uv: Math.max(0, ...days.map(d => d.uv || 0)),
    climate: days.every(d => d.quelle === 'klima'), someClimate: days.some(d => d.quelle === 'klima'),
  };
}
// Packing tips matching the weather: [text, section]
function tripPackTips(sum) {
  if (!sum) return [];
  const t = [];
  if (sum.rainDays >= 1) t.push('Regenjacke', 'Regenschirm');
  if (sum.rainDays >= 3) t.push('Wasserfeste Schuhe');
  if (sum.hot >= 25 || sum.uv >= 6) t.push('Sonnencreme', 'Sonnenbrille', 'Sonnenhut / Kappe');
  if (sum.uv >= 7) t.push('After-Sun');
  if (sum.hot >= 22 || (sum.water != null && sum.water >= 19)) t.push('Badesachen');
  if (sum.cold <= 10) t.push('Warmer Pullover', 'Lange Hose');
  if (sum.cold <= 3) t.push('Mütze & Handschuhe', 'Winterjacke');
  if (sum.code === 71 || sum.cold <= -2) t.push('Winterstiefel');
  return [...new Set(t)];
}
function tripMissingTips(l, sum) {
  const have = new Set((l.items || []).map(i => normalizeForGrouping(i.text || '')));
  return tripPackTips(sum).filter(x => !have.has(normalizeForGrouping(x)));
}
function tripAddTips(l, tips) {
  if (!tips.length) return 0;
  const now = Date.now();
  const add = tips.map((text, i) => ({ id: lsId('fi'), text, done: false, section: 'Wetter-Tipps', createdAt: now + i }));
  lsUpdateList(l.id, x => ({ ...x, items: [...x.items, ...add] }));
  lsCommit();
  return add.length;
}

/* ---------- Tile ---------- */
function wxTileTripsHtml() {
  const trips = tripList().filter(l => tripDaysUntil(l) <= 21).slice(0, 2);
  if (!trips.length) return '';
  return `<div class="ov-wx-trips">${trips.map(l => {
    const data = tripCached(l.trip.place, l.trip.from, tripTo(l));
    if (!data && tripDaysUntil(l) <= 60) tripWeather(l).then(() => renderWeatherTile()).catch(() => { /* later */ });
    const sum = tripSummary(data);
    const going = tripDaysUntil(l) <= 0;
    return `<button type="button" class="ov-wx-trip${going ? ' now' : ''}" data-wxtrip="${escapeHtml(l.id)}">
      <span class="ov-wx-trip-ic">${escapeHtml(l.icon || '🧳')}</span>
      <span class="ov-wx-trip-t"><b>${escapeHtml(tripName(l))}</b><small>${escapeHtml(tripWhenText(l))}</small></span>
      ${sum ? `<span class="ov-wx-trip-w">${weatherIconForCode(sum.code)} <b>${sum.max}°</b><span class="ov-weather-min">${sum.min}°</span></span>` : '<span class="ov-wx-trip-w">…</span>'}
    </button>`;
  }).join('')}</div>`;
}

/* ---------- View ---------- */
function wxOpen(place) {
  const ov = document.getElementById('wxOverlay');
  if (!ov) return;
  wxState.place = place && place !== 'home' && tripById(place) ? place : 'home';
  wxState.sel = '';
  ov.classList.remove('hidden');
  document.documentElement.classList.add('wx-open');
  wxRender();
  const sh = ov.querySelector('.wx-sheet');
  if (sh) sh.scrollTop = 0;
  if (wxState.place === 'home') {
    if (!weatherDaily || Date.now() - (Number(weatherDaily.ts) || 0) > 30 * 60 * 1000 || !(weatherDaily.days || []).some(d => d.wind != null)) {
      Promise.resolve(fetchWeather()).then(() => { if (!ov.classList.contains('hidden') && wxState.place === 'home') wxRender(); });
    }
  } else {
    const l = tripById(wxState.place);
    tripWeather(l).then(() => wxRender()).catch(e => { wxState.err = e.message; wxRender(); });
  }
}
function wxClose() {
  const ov = document.getElementById('wxOverlay');
  if (ov) ov.classList.add('hidden');
  document.documentElement.classList.remove('wx-open');
}
function wxPlaceTabs() {
  const trips = tripList();
  if (!trips.length) return '';
  return `<div class="wx-tabs">${[`<button type="button" class="wx-tab${wxState.place === 'home' ? ' active' : ''}" data-wxplace="home">🏠 <span>Zuhause</span></button>`]
    .concat(trips.map(l => `<button type="button" class="wx-tab${wxState.place === l.id ? ' active' : ''}" data-wxplace="${escapeHtml(l.id)}">${escapeHtml(l.icon || '🧳')} ${escapeHtml(tripName(l))}</button>`)).join('')}</div>`;
}
function wxRender() {
  const body = document.getElementById('wxBody');
  if (!body) return;
  if (wxState.place !== 'home') { const l = tripById(wxState.place); if (l) { body.innerHTML = wxTripHtml(l); wxAfterRender(); return; } wxState.place = 'home'; }
  readWeatherDailyCache();
  const today = isoDate(new Date());
  const days = weatherDaily && Array.isArray(weatherDaily.days) ? weatherDaily.days.filter(d => d && d.date >= today).slice(0, 14) : [];
  const t0 = days[0];
  const sky = wxSky(weatherData && weatherData.code != null ? weatherData.code : (t0 ? t0.code : 3));
  const hero = `<div class="wx-hero sky-${sky}">
    <div class="wx-hero-deco" aria-hidden="true">${weatherIconForCode(weatherData && weatherData.code != null ? weatherData.code : (t0 ? t0.code : 3))}</div>
    <div class="wx-kicker">🏠 <span>Zuhause</span></div>
    <div class="wx-place">${escapeHtml((weatherDaily && weatherDaily.label) || 'Wetter')}</div>
    ${weatherData && weatherData.temp != null ? `<div class="wx-now"><b>${weatherData.temp}°</b><span>${escapeHtml(wxDesc(weatherData.code))}</span></div>` : ''}
    <div class="wx-hero-sub">${t0 ? `<span>↑ <b>${t0.max}°</b></span><span>↓ <b>${t0.min}°</b></span>` : ''}${weatherData && weatherData.gef != null ? `<span><span>gefühlt</span> <b>${weatherData.gef}°</b></span>` : ''}${weatherData && weatherData.wind != null ? `<span>💨 <b>${weatherData.wind}</b> km/h</span>` : ''}</div>
  </div>`;
  let list = '';
  if (!days.length) {
    list = `<div class="wx-empty">${weatherNoLocation ? '<span>Noch kein Zuhause festgelegt – Einstellungen → Zuhause.</span>' : '<span>Wetter wird geladen …</span>'}</div>`;
  } else {
    list = wxDaysHtml(days, 'home');
  }
  const tips = t0 ? wxTips(t0) : [];
  body.innerHTML = `${hero}${wxPlaceTabs()}<div class="wx-wrap">
    ${tips.length ? `<div class="wx-card wx-tips"><div class="wx-h">👕 <span>Heute anziehen</span></div>${tips.map(([i, t]) => `<div class="wx-tip"><span>${i}</span><span>${escapeHtml(t)}</span></div>`).join('')}</div>` : ''}
    <div class="wx-card"><div class="wx-h">📅 <span>14 Tage</span></div>${list}</div>
    ${weatherDaily && weatherDaily.ts ? `<p class="wx-note"><span>Stand</span> ${escapeHtml(new Date(weatherDaily.ts).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }))} · Open-Meteo</p>` : ''}
  </div>`;
  wxAfterRender();
}
function wxDaysHtml(days, placeKey) {
  const lo = Math.min(...days.map(d => d.min != null ? d.min : d.max));
  const hi = Math.max(...days.map(d => d.max));
  const span = Math.max(1, hi - lo);
  const today = isoDate(new Date());
  let html = '';
  let lastKind = '';
  days.forEach((d, i) => {
    const idx = daysBetweenDateStrs(today, d.date);
    const kind = d.quelle === 'klima' ? 'klima' : (idx >= 7 ? 'tendenz' : 'nah');
    if (kind !== lastKind && (kind !== 'nah' || lastKind)) {
      html += `<div class="wx-sep">${kind === 'klima' ? '📊 <span>Erfahrungswerte – Ø der letzten 3 Jahre</span>' : kind === 'tendenz' ? '〰️ <span>Tendenz – noch unsicher</span>' : '🔭 <span>Vorhersage</span>'}</div>`;
    }
    lastKind = kind;
    const mn = d.min != null ? d.min : d.max;
    const left = Math.round((mn - lo) / span * 100), right = Math.round((hi - d.max) / span * 100);
    const open = wxState.sel === d.date;
    html += `<button type="button" class="wx-row${open ? ' open' : ''} ${kind}" data-wxday="${d.date}" aria-expanded="${open ? 'true' : 'false'}">
      <span class="wx-d"><b>${escapeHtml(wxDayName(d.date, i))}</b><small>${escapeHtml(wxShortDate(d.date))}</small></span>
      <span class="wx-ic">${weatherIconForCode(d.code)}</span>
      <span class="wx-rain">${d.rain != null && d.rain >= 10 ? `💧<b>${d.rain}</b>%` : ''}</span>
      <span class="wx-mn">${mn != null ? mn + '°' : ''}</span>
      <span class="wx-range"><i style="left:${left}%;right:${right}%"></i></span>
      <span class="wx-mx">${d.max}°</span>
    </button>
    ${open ? `<div class="wx-detail">${wxDetailHtml(d, placeKey, kind)}</div>` : ''}`;
  });
  return html;
}
function wxTile(ic, label, value, sub) {
  if (value == null || value === '') return '';
  return `<div class="wx-tile"><span class="wx-tile-ic">${ic}</span><span class="wx-tile-l">${escapeHtml(label)}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
}
function wxDetailHtml(d, placeKey, kind) {
  const desc = wxDesc(d.code);
  if (kind === 'klima') {
    return `<p class="wx-dd"><span>Erfahrungswert</span> – <span>so war es an diesem Tag im Schnitt</span>${d.jahre ? ` (<b>${d.jahre}</b> <span>Jahre</span>)` : ''}.</p>
      <div class="wx-tiles">${wxTile('🌡️', 'Ø Höchstwert', d.max + '°')}${wxTile('🌙', 'Ø Tiefstwert', d.min != null ? d.min + '°' : null)}
      ${wxTile('💧', 'Regen', d.mm != null ? escapeHtml(String(d.mm).replace('.', ',')) + ' mm' : null, d.rain != null ? `<b>${d.rain}</b> % <span>Regentage</span>` : '')}
      ${wxTile('☀️', 'Sonne', d.sonne != null ? escapeHtml(String(d.sonne).replace('.', ',')) + ' h' : null)}</div>`;
  }
  const arrow = d.richtung != null ? `<span class="wx-arrow" style="transform:rotate(${(d.richtung + 180) % 360}deg)">↑</span>` : '';
  const tiles = [
    wxTile('🌡️', 'Gefühlt', d.gefMax != null ? (d.gefMin != null ? d.gefMin + '° / ' : '') + d.gefMax + '°' : null),
    wxTile('💧', 'Regen', d.mm != null ? escapeHtml(String(d.mm).replace('.', ',')) + ' mm' : null, d.regenStd ? `<b>${d.regenStd}</b> <span>Std.</span>` : (d.rain != null ? `<b>${d.rain}</b> %` : '')),
    wxTile('💨', 'Wind', d.wind != null ? `${arrow}${d.wind} km/h` : null, d.boeen != null ? `<span>Böen</span> <b>${d.boeen}</b>` : ''),
    wxTile('🕶️', 'UV-Index', d.uv != null ? String(Math.round(d.uv)) : null, d.uv != null ? escapeHtml(wxUvLabel(d.uv)) : ''),
    wxTile('☀️', 'Sonne', d.sonne != null ? escapeHtml(String(d.sonne).replace('.', ',')) + ' h' : null),
    wxTile('🌅', 'Sonnenauf- & -untergang', d.auf ? d.auf + ' · ' + (d.unter || '') : null),
    wxTile('🌊', 'Wasser', d.wasser != null ? d.wasser + '°' : null),
  ].join('');
  const tips = wxTips(d);
  const key = (placeKey || 'home') + '|' + d.date;
  const h = wxHours[key];
  let hours = '';
  if (h && Array.isArray(h.stunden) && h.stunden.length) {
    const now = new Date().getHours();
    const rows = h.stunden.filter(x => d.date !== isoDate(new Date()) || Number(x.h) >= now);
    hours = `<div class="wx-hours">${rows.map(x => `<div class="wx-hour${x.tag ? '' : ' night'}"><small>${escapeHtml(x.h)}</small><span>${x.tag ? weatherIconForCode(x.code) : (x.code <= 2 ? '🌙' : weatherIconForCode(x.code))}</span><b>${x.temp != null ? Math.round(x.temp) + '°' : ''}</b><i class="wx-hbar"><em style="height:${Math.min(100, x.rain || 0)}%"></em></i><small class="wx-hr">${x.rain ? x.rain + '%' : ''}</small></div>`).join('')}</div>`;
  } else if (h && h.err) {
    hours = '';
  } else if (kind !== 'klima' && daysBetweenDateStrs(isoDate(new Date()), d.date) <= 15) {
    hours = `<div class="wx-hours-load">⏳ <span>Stundenverlauf wird geladen …</span></div>`;
  }
  return `${desc ? `<p class="wx-dd"><b>${escapeHtml(desc)}</b>${d.unsicher || kind === 'tendenz' ? ' · <span>Tendenz</span>' : ''}</p>` : ''}
    ${hours}
    <div class="wx-tiles">${tiles}</div>
    ${tips.length ? `<div class="wx-tips-in">${tips.map(([i, t]) => `<span class="wx-chip">${i} <span>${escapeHtml(t)}</span></span>`).join('')}</div>` : ''}`;
}
async function wxLoadHours(placeKey, date) {
  const key = placeKey + '|' + date;
  const c = wxHours[key];
  if (c && (c.loading || (Date.now() - c.ts < 30 * 60 * 1000))) return;
  wxHours[key] = { loading: true, ts: Date.now() };
  const payload = { datum: date };
  if (placeKey !== 'home') { const l = tripById(placeKey); if (!l) return; payload.lat = l.trip.place.lat; payload.lon = l.trip.place.lon; }
  try {
    const res = await apiFetch('/api/pinn/zuhause/wetter-tag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    wxHours[key] = { stunden: Array.isArray(body.stunden) ? body.stunden : [], ts: Date.now(), err: res.ok && !body.error ? '' : (body.error || 'Fehler') };
  } catch (e) {
    wxHours[key] = { stunden: [], ts: Date.now() - 25 * 60 * 1000, err: 'offline' };
  }
  if (wxState.sel === date && wxState.place === placeKey) wxRender();
}
function wxAfterRender() {
  if (!wxState.sel) return;
  const today = isoDate(new Date());
  const diff = daysBetweenDateStrs(today, wxState.sel);
  if (diff < 0 || diff > 15) return;
  const key = wxState.place + '|' + wxState.sel;
  if (!wxHours[key]) wxLoadHours(wxState.place, wxState.sel);
}
function wxTripHtml(l) {
  const data = tripCached(l.trip.place, l.trip.from, tripTo(l));
  const sum = tripSummary(data);
  const sky = sum ? sum.sky : 'part';
  const when = tripWhenText(l);
  const hero = `<div class="wx-hero sky-${sky} trip">
    <div class="wx-hero-deco" aria-hidden="true">${escapeHtml(l.icon || '🧳')}</div>
    <div class="wx-kicker">🧳 <span>Urlaubswetter</span></div>
    <div class="wx-place">${escapeHtml(tripName(l))}</div>
    ${l.trip.place.zusatz ? `<div class="wx-place-sub">${escapeHtml(l.trip.place.zusatz)}</div>` : ''}
    <div class="wx-hero-sub"><span>📅 ${escapeHtml(tripRangeText(l))}</span><span>${escapeHtml(when)}</span></div>
  </div>`;
  let content = '';
  if (!data) {
    content = `<div class="wx-card"><div class="wx-empty">${wxState.err ? escapeHtml(wxState.err) : '<span>Urlaubswetter wird geladen …</span>'}</div></div>`;
  } else if (data.vorbei) {
    content = `<div class="wx-card"><div class="wx-empty"><span>Dieser Urlaub ist schon vorbei.</span></div></div>`;
  } else {
    const days = (data.tage || []).filter(d => d && d.max != null);
    const tips = tripMissingTips(l, sum);
    content = `${sum ? `<div class="wx-card wx-sum">
        <div class="wx-sum-main"><span class="wx-sum-ic">${weatherIconForCode(sum.code)}</span><div><b>${sum.max}°</b><span class="wx-sum-min">${sum.min}°</span><div class="wx-sum-l"><span>Ø am Tag / in der Nacht</span></div></div></div>
        <div class="wx-sum-chips">
          <span class="wx-chip">${sum.rainDays ? '🌧️' : '🌤️'} ${sum.rainDays ? `<b>${sum.rainDays}</b> <span>${sum.rainDays === 1 ? 'Regentag' : 'Regentage'}</span>` : '<span>trocken</span>'}</span>
          ${sum.sun != null ? `<span class="wx-chip">☀️ <b>${String(sum.sun).replace('.', ',')}</b> <span>Std. Sonne/Tag</span></span>` : ''}
          ${sum.water != null ? `<span class="wx-chip">🌊 <span>Wasser</span> <b>${sum.water}°</b></span>` : ''}
          <span class="wx-chip">🌡️ <b>${sum.cold}°</b> – <b>${sum.hot}°</b></span>
        </div>
        ${sum.climate ? '<p class="wx-note2">📊 <span>Noch zu weit weg für eine Vorhersage – das sind Erfahrungswerte der letzten drei Jahre. Ab 16 Tagen vorher kommt die echte Vorhersage.</span></p>' : sum.someClimate ? '<p class="wx-note2">📊 <span>Hintere Tage noch als Erfahrungswerte – die Vorhersage reicht 16 Tage.</span></p>' : ''}
      </div>` : ''}
      ${tips.length ? `<div class="wx-card"><div class="wx-h">🎒 <span>Passend zum Wetter einpacken</span></div><div class="wx-pack">${tips.map(t => `<button type="button" class="wx-pack-chip" data-wxtip="${escapeHtml(t)}">＋ <span>${escapeHtml(t)}</span></button>`).join('')}</div>
        <button type="button" class="wx-btn" data-wxtipall="1">✓ <span>Alle auf die Packliste</span></button></div>` : ''}
      <div class="wx-card"><div class="wx-h">📅 <span>Tag für Tag</span></div>${days.length ? wxDaysHtml(days, l.id) : '<div class="wx-empty"><span>Noch keine Daten.</span></div>'}</div>
      ${data.fehler ? `<p class="wx-note">${escapeHtml(data.fehler)}</p>` : ''}`;
  }
  return `${hero}${wxPlaceTabs()}<div class="wx-wrap">${content}
    <button type="button" class="wx-btn ghost" data-wxlist="${escapeHtml(l.id)}">🧳 <span>Zur Packliste</span> ›</button>
    <p class="wx-note">Open-Meteo</p></div>`;
}
(function wxWire() {
  const ov = document.getElementById('wxOverlay');
  if (!ov) return;
  document.getElementById('wxClose').addEventListener('click', wxClose);
  ov.addEventListener('click', (e) => {
    if (e.target === ov) { wxClose(); return; }
    const pl = e.target.closest('[data-wxplace]');
    if (pl) { wxOpen(pl.dataset.wxplace); return; }
    const day = e.target.closest('[data-wxday]');
    if (day) { wxState.sel = wxState.sel === day.dataset.wxday ? '' : day.dataset.wxday; wxRender(); return; }
    const tip = e.target.closest('[data-wxtip]');
    const all = e.target.closest('[data-wxtipall]');
    if (tip || all) {
      const l = tripById(wxState.place);
      if (!l) return;
      const sum = tripSummary(tripCached(l.trip.place, l.trip.from, tripTo(l)));
      const list = tip ? [tip.dataset.wxtip] : tripMissingTips(l, sum);
      const n = tripAddTips(lsGetList(l.id) || l, list);
      finShowToast(n === 1 ? 'Auf die Packliste gesetzt ✓' : `${n} Sachen auf die Packliste gesetzt ✓`);
      wxRender();
      return;
    }
    const go = e.target.closest('[data-wxlist]');
    if (go) { wxClose(); setView('einkauf'); lsOpenList(go.dataset.wxlist); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.classList.contains('hidden')) wxClose(); });
  const tile = document.getElementById('weatherTileSection');
  if (tile) tile.addEventListener('click', (e) => {
    const t = e.target.closest('[data-wxtrip]');
    wxOpen(t ? t.dataset.wxtrip : 'home');
  });
})();

/* ---------- Packing list: destination & period ---------- */
var lsTripSugSeq = 0;
var lsTripSugTimer = null;
var lsTripHits = [];
var lsTripWxSeq = 0;
function lsTripInit(l) {
  const ctx = lsListCtx;
  const wrap = document.getElementById('lsTripWrap');
  if (!wrap || !ctx) return;
  const isPack = ctx.type === 'pack';
  wrap.classList.toggle('hidden', !isPack);
  if (!isPack) return;
  document.getElementById('lsListDateWrap').classList.add('hidden');
  const tp = l && l.trip ? l.trip : null;
  ctx.trip = { place: tp && tp.place ? { ...tp.place } : null, from: tp ? tp.from : (l && l.date) || '', to: tp ? (tp.to || '') : '' };
  document.getElementById('lsTripPlace').value = '';
  document.getElementById('lsTripFrom').value = ctx.trip.from || '';
  document.getElementById('lsTripTo').value = ctx.trip.to || '';
  document.getElementById('lsTripSug').innerHTML = '';
  lsTripHits = [];
  const tips = document.getElementById('lsTripTipsWrap');
  tips.classList.add('hidden'); tips.classList.remove('flex');
  document.getElementById('lsTripTips').checked = true;
  lsTripDrawChosen();
  lsTripDays();
  lsTripPreview();
}
function lsTripDrawChosen() {
  const ctx = lsListCtx;
  const box = document.getElementById('lsTripChosen');
  const input = document.getElementById('lsTripPlace');
  if (!ctx || !box) return;
  const pl = ctx.trip && ctx.trip.place;
  box.classList.toggle('hidden', !pl);
  input.classList.toggle('hidden', !!pl);
  box.innerHTML = pl ? `<span class="ls-trip-pin">📍</span><span class="min-w-0 flex-1"><b>${escapeHtml(pl.titel)}</b>${pl.zusatz ? `<small>${escapeHtml(pl.zusatz)}</small>` : ''}</span><button type="button" class="fam-x" data-tripclear="1" aria-label="Reiseziel ändern">×</button>` : '';
}
function lsTripDays() {
  const ctx = lsListCtx;
  if (!ctx || !ctx.trip) return;
  const a = ctx.trip.from, b = ctx.trip.to;
  const el = document.getElementById('lsListDays');
  if (a && b && b >= a && el && !document.getElementById('lsListDaysWrap').classList.contains('hidden')) el.value = String(Math.min(99, daysBetweenDateStrs(a, b) + 1));
}
async function lsTripSearch(q) {
  const seq = ++lsTripSugSeq;
  const box = document.getElementById('lsTripSug');
  try {
    const res = await apiFetch('/api/pinn/zuhause/suche?weit=1&q=' + encodeURIComponent(q), { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (seq !== lsTripSugSeq) return;
    lsTripHits = Array.isArray(body.treffer) ? body.treffer : [];
    box.innerHTML = lsTripHits.length ? lsTripHits.map((h, i) => `<button type="button" class="home-sug-row" data-triphit="${i}"><span>📍</span><span class="min-w-0"><b>${escapeHtml(h.titel)}</b><span class="home-sug-z">${escapeHtml(h.zusatz || '')}</span></span></button>`).join('')
      : `<p class="home-sug-msg">${escapeHtml(body.error || 'Kein passender Ort gefunden.')}</p>`;
  } catch (e) {
    if (seq === lsTripSugSeq) box.innerHTML = '<p class="home-sug-msg">Ortssuche nicht möglich – keine Verbindung zum NAS.</p>';
  }
}
async function lsTripPreview() {
  const ctx = lsListCtx;
  const box = document.getElementById('lsTripWx');
  if (!ctx || !box || !ctx.trip) return;
  const tp = ctx.trip;
  const tipsWrap = document.getElementById('lsTripTipsWrap');
  if (!tp.place || !tp.from) { box.classList.add('hidden'); box.innerHTML = ''; tipsWrap.classList.add('hidden'); tipsWrap.classList.remove('flex'); return; }
  const to = tp.to && tp.to >= tp.from ? tp.to : tp.from;
  const seq = ++lsTripWxSeq;
  box.classList.remove('hidden');
  const cached = tripCached(tp.place, tp.from, to);
  const draw = (data, err) => {
    if (seq !== lsTripWxSeq) return;
    const sum = tripSummary(data);
    if (!sum) { box.innerHTML = `<span class="text-ink/50">${escapeHtml(err || (data && data.vorbei ? 'Der Zeitraum liegt in der Vergangenheit.' : 'Urlaubswetter wird geladen …'))}</span>`; return; }
    box.innerHTML = `<span class="ls-trip-wx-ic">${weatherIconForCode(sum.code)}</span><span class="min-w-0 flex-1"><b>${sum.max}°</b> / ${sum.min}° · <span>${sum.rainDays ? sum.rainDays + (sum.rainDays === 1 ? ' Regentag' : ' Regentage') : 'trocken'}</span>${sum.water != null ? ` · 🌊 ${sum.water}°` : ''}<small>${sum.climate ? 'Erfahrungswerte der letzten Jahre' : 'Vorhersage für die Reisezeit'}</small></span>`;
    const tips = tripPackTips(sum);
    const show = ctx.mode === 'new' && tips.length > 0;
    tipsWrap.classList.toggle('hidden', !show);
    tipsWrap.classList.toggle('flex', show);
    ctx.tripTips = tips;
  };
  draw(cached);
  try { draw(await tripWeatherFetch(tp.place, tp.from, to)); }
  catch (e) { draw(cached, e.message); }
}
(function lsTripWire() {
  const input = document.getElementById('lsTripPlace');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(lsTripSugTimer);
    const q = input.value.trim();
    if (q.length < 3) { document.getElementById('lsTripSug').innerHTML = ''; return; }
    lsTripSugTimer = setTimeout(() => lsTripSearch(q), 320);
  });
  document.getElementById('lsTripSug').addEventListener('click', (e) => {
    const b = e.target.closest('[data-triphit]');
    const ctx = lsListCtx;
    if (!b || !ctx || !ctx.trip) return;
    const h = lsTripHits[Number(b.dataset.triphit)];
    if (!h) return;
    ctx.trip.place = { titel: h.ort && h.titel !== h.ort && !/\d/.test(h.titel) ? h.titel : (h.titel || h.ort), zusatz: h.zusatz || '', lat: h.lat, lon: h.lon, land: h.land || '' };
    document.getElementById('lsTripSug').innerHTML = '';
    input.value = '';
    lsTripDrawChosen();
    const nameEl = document.getElementById('lsListName');
    if (ctx.mode === 'new' && nameEl && (ctx.nameAuto || !nameEl.value.trim())) {
      const y = (ctx.trip.from || isoDate(new Date())).slice(0, 4);
      nameEl.value = ctx.trip.place.titel + ' ' + y;
    }
    lsTripPreview();
  });
  document.getElementById('lsTripChosen').addEventListener('click', (e) => {
    if (!e.target.closest('[data-tripclear]') || !lsListCtx || !lsListCtx.trip) return;
    lsListCtx.trip.place = null;
    lsTripDrawChosen();
    lsTripPreview();
    setTimeout(() => input.focus(), 30);
  });
  ['lsTripFrom', 'lsTripTo'].forEach(id => document.getElementById(id).addEventListener('change', () => {
    const ctx = lsListCtx;
    if (!ctx || !ctx.trip) return;
    ctx.trip.from = document.getElementById('lsTripFrom').value || '';
    ctx.trip.to = document.getElementById('lsTripTo').value || '';
    if (ctx.trip.from && ctx.trip.to && ctx.trip.to < ctx.trip.from) { ctx.trip.to = ctx.trip.from; document.getElementById('lsTripTo').value = ctx.trip.from; }
    if (id === 'lsTripFrom' && ctx.trip.from && !ctx.trip.to) document.getElementById('lsTripTo').min = ctx.trip.from;
    lsTripDays();
    lsTripPreview();
  }));
})();
// When saving a packing list: take over destination & period
function lsTripData() {
  const ctx = lsListCtx;
  if (!ctx || ctx.type !== 'pack' || !ctx.trip) return null;
  const tp = ctx.trip;
  if (!tp.place || !tp.from) return tp.from ? { dateOnly: tp.from } : null;
  return { place: { titel: tp.place.titel, zusatz: tp.place.zusatz || '', lat: Number(tp.place.lat), lon: Number(tp.place.lon), land: tp.place.land || '' }, from: tp.from, to: tp.to && tp.to >= tp.from ? tp.to : tp.from };
}
// Map in the packing list
function lsTripCardHtml(l) {
  if (!tripValid(l)) return '';
  const data = tripCached(l.trip.place, l.trip.from, tripTo(l));
  const sum = tripSummary(data);
  const past = tripTo(l) < isoDate(new Date());
  if (!data && !past) tripWeather(l).then(() => { if (listsDetailId === l.id) { const x = lsGetList(l.id); if (x) lsRenderDetail(x); } }).catch(() => { /* offline */ });
  const tips = sum ? tripMissingTips(l, sum) : [];
  return `<button type="button" class="ls-trip-card sky-${sum ? sum.sky : 'part'}" data-tripwx="${escapeHtml(l.id)}">
    <span class="ls-trip-card-ic">${sum ? weatherIconForCode(sum.code) : '🧳'}</span>
    <span class="min-w-0 flex-1"><b>📍 ${escapeHtml(tripName(l))}</b><small>${escapeHtml(tripRangeText(l))} · ${escapeHtml(past ? 'vorbei' : tripWhenText(l))}</small>
      ${sum ? `<small class="ls-trip-card-w"><b>${sum.max}°</b> / ${sum.min}° · <span>${sum.rainDays ? sum.rainDays + (sum.rainDays === 1 ? ' Regentag' : ' Regentage') : 'trocken'}</span>${sum.water != null ? ' · 🌊 ' + sum.water + '°' : ''}${sum.climate ? ' · <span>Erfahrungswerte</span>' : ''}</small>` : ''}</span>
    <span class="ls-trip-card-go">${tips.length ? `<span class="ls-trip-badge">🎒 ${tips.length}</span>` : ''}›</span>
  </button>`;
}
(function lsTripCardWire() {
  const meta = document.getElementById('listsDetailMeta');
  if (!meta) return;
  meta.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tripwx]');
    if (b) wxOpen(b.dataset.tripwx);
  });
})();

/* ---------- Pets in the tile "Family members" ---------- */
function ptTileHtml(anySub) {
  if (!isViewAllowed('familie')) return '';
  return ptActive().map(p => {
    const over = ptOverdue(p);
    const bd = ptBirthdayIn(p);
    const walks = Number(p.walks) || 0;
    const w = ptWalksToday(p).length;
    let badge = '';
    if (bd === 0) badge = '🎂';
    else if (over.length) badge = ptCareType(over[0].type).icon;
    let sub = '';
    if (over.length) sub = 'fällig';
    else if (walks) sub = `🦮 ${w}/${walks}`;
    else if (ptFeedTimes(p).length) { const f = ptFeedTimes(p).filter(t => ptFedSlot(p, t)).length; sub = `🍖 ${f}/${ptFeedTimes(p).length}`; }
    const color = ptColor(p);
    return `<button type="button" class="ov-fam-item is-pet${bd === 0 ? ' is-bday' : ''}" data-pet="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.name)}">
      <span class="ov-fam-ava-wrap"><span class="ov-fam-ava" style="border-color:${escapeHtml(color)}">${memberAvatarInnerHTML({ photo: p.photo || '', avatar: p.emoji || ptSpecies(p.species).emoji, name: p.name, color })}</span>${badge ? `<span class="ov-fam-badge">${badge}</span>` : ''}</span>
      <span class="ov-fam-name">${escapeHtml(p.name)}</span>${anySub ? `<span class="ov-fam-sub${over.length ? ' warn' : ''}">${escapeHtml(sub)}</span>` : ''}
    </button>`;
  }).join('');
}
function ptTileWire(body) {
  body.querySelectorAll('.ov-fam-item.is-pet').forEach(b => b.addEventListener('click', () => ptOpen(b.dataset.pet)));
}

/* ---------- Weekly preview: holiday & pets ---------- */
async function abTripCardsHtml(mondayIso, endIso) {
  let trips = [];
  try { trips = tripList().filter(l => l.trip.from <= endIso && tripTo(l) >= mondayIso); } catch (e) { trips = []; }
  if (!trips.length) return '';
  const out = [];
  for (const l of trips) {
    let data = tripCached(l.trip.place, l.trip.from, tripTo(l));
    try {
      data = await Promise.race([tripWeather(l), new Promise(res => setTimeout(() => res(data), 6000))]);
    } catch (e) { /* offline: last state */ }
    const sum = tripSummary(data);
    const from = l.trip.from < mondayIso ? mondayIso : l.trip.from;
    const to = tripTo(l) > endIso ? endIso : tripTo(l);
    const days = data && Array.isArray(data.tage) ? data.tage.filter(d => d.date >= from && d.date <= to && d.max != null) : [];
    const range = abFmt(l.trip.from, { day: 'numeric', month: 'short' }) + (tripTo(l) !== l.trip.from ? ' – ' + abFmt(tripTo(l), { day: 'numeric', month: 'short' }) : '');
    let line = '';
    if (sum) {
      const bits = [`Ø ${sum.max}° / ${sum.min}°`, sum.rainDays ? abT(sum.rainDays === 1 ? 'u_regen1' : 'u_regen', { n: sum.rainDays }) : abT('u_trocken')];
      if (sum.water != null) bits.push(abT('u_wasser', { t: sum.water }));
      if (sum.sun != null) bits.push(abT('u_sonne', { h: String(sum.sun).replace('.', ',') }));
      line = bits.join(' · ');
    }
    out.push(`<div class="ab-card ab-trip"><div class="ab-h2">🧳 ${abEsc(abT('s_urlaub'))}<small>${abEsc(range)}</small></div>
      <div class="ab-trip-head"><span class="ab-trip-ic">${sum ? weatherIconForCode(sum.code) : escapeHtml(l.icon || '🧳')}</span><span><b>${abEsc(tripName(l))}</b>${l.trip.place.zusatz ? `<small>${abEsc(l.trip.place.zusatz)}</small>` : ''}</span></div>
      ${line ? `<p class="ab-trip-line">${abEsc(line)}</p>` : `<p class="ab-note">${abEsc(abT('u_keine'))}</p>`}
      ${days.length ? `<div class="ab-wx">${days.map(d => `<div class="ab-wx-d${wxRainy(d) ? ' rain' : ''}"><span>${abEsc(abFmt(d.date, { weekday: 'short' }))}</span><span class="i">${weatherIconForCode(d.code)}</span><b>${Math.round(d.max)}°</b> <span>${d.min != null ? Math.round(d.min) + '°' : ''}</span></div>`).join('')}</div>` : ''}
      ${sum && sum.someClimate ? `<p class="ab-note">📊 ${abEsc(abT('u_klima'))}</p>` : ''}
      <div class="ab-foot" style="padding:6px 0 0"><button type="button" class="ab-btn ghost" data-abtrip="${abEsc(l.id)}">🌦️ ${abEsc(abT('u_mehr'))}</button></div>
    </div>`);
  }
  return out.join('');
}
function abPetHighlights(mondayIso, endIso) {
  const hl = [];
  let list = [];
  try { list = ptActive(); } catch (e) { list = []; }
  list.forEach(p => {
    (p.care || []).forEach(c => {
      const n = ptCareNext(c);
      if (!n || n > endIso) return;
      const over = n < mondayIso;
      hl.push({ date: n, html: `<div class="ab-hl" style="--ab-tone:${over ? '#C0392B' : '#8D6E63'}"><span class="i">${ptCareType(c.type).icon}</span><span>${abEsc(p.name)}: ${abEsc(abTx(c.title || ''))}<small>${abEsc(over ? abT('tier_ueber') : abT('tier_faellig'))}</small></span><span class="when">${abEsc(abShort(n))}</span></div>` });
    });
    if (ptIso(p.birth)) {
      const [, m, d] = p.birth.split('-').map(Number);
      [Number(mondayIso.slice(0, 4)), Number(endIso.slice(0, 4))].forEach(y => {
        const iso = isoDate(birthdayInYear(y, m, d));
        if (iso >= mondayIso && iso <= endIso && !hl.some(x => x.bday === p.id)) hl.push({ date: iso, bday: p.id, html: `<div class="ab-hl" style="--ab-tone:#D6336C"><span class="i">🎂</span><span>${abEsc(p.name)}<small>${abEsc(abT('tier_geb'))}</small></span><span class="when">${abEsc(abShort(iso))}</span></div>` });
      });
    }
  });
  return hl.sort((a, b) => a.date.localeCompare(b.date)).map(x => x.html);
}
(function abTripWire() {
  const ov = document.getElementById('abOverlay');
  if (!ov) return;
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-abtrip]');
    if (!b) return;
    abClose();
    wxOpen(b.dataset.abtrip);
  });
})();

/* ---------- Wiring ---------- */
(function wireFamily() {
  const pane = document.getElementById('famPane');
  pane.addEventListener('click', (e) => {
    if (ptPaneClick(e)) return;
    if (skPaneClick(e)) return;
    const sosBtn = e.target.closest('[data-sosopen]');
    if (sosBtn) { sosOpen(sosBtn.dataset.sosopen); return; }
    const open = e.target.closest('[data-famopen]');
    if (open) { famOpenMember(open.dataset.famopen); return; }
    const chip = e.target.closest('[data-famchip]');
    if (chip) {
      const id = chip.dataset.famchip;
      if (famHidden.has(id)) famHidden.delete(id); else famHidden.add(id);
      if (famHidden.has(id) && famFollow === id) { famFollow = ''; famTrail = null; famTrailHours = 0; }
      if (famHidden.has(id) && famSelected === id) famSelected = '';
      famRenderChips(); famDrawMap(); famRenderInfo();
      return;
    }
    const act = e.target.closest('[data-famact]');
    if (!act) return;
    const id = act.dataset.id;
    switch (act.dataset.famact) {
      case 'back':
        if (famDetailId && famDetailMode === 'pass' && famPassFrom === 'profil') famDetailMode = 'profil';
        else famDetailId = null;
        renderFamily();
        if (famPollWanted()) famStartPolling();
        { const sc = document.getElementById('famScroll'); if (sc) sc.scrollTop = 0; }
        break;
      case 'pass': famDetailMode = 'pass'; famPassFrom = 'profil'; renderFamily(); { const sc = document.getElementById('famScroll'); if (sc) sc.scrollTop = 0; } break;
      case 'edit': famOpenEdit(famDetailId); break;
      case 'showmap': famShowOnMap(id); break;
      case 'follow':
        famFollow = famFollow === id ? '' : id;
        famFollowFree = false;
        if (!famFollow) { famTrail = null; famTrailHours = 0; }
        famRenderChips(); famDrawMap(); famRenderInfo();
        if (famFollow) famStartPolling();
        break;
      case 'address': famLoadAddress(id); break;
      case 'unterwegs': famSetUnterwegs(act.dataset.an === '1', act); break;
      case 'guide': famOpenGuide(id); break;
      case 'share': famOpenShare(); break;
      case 'shareend': famShareEnd(act); break;
      case 'sharenow': famShareNow(act); break;
      case 'einmal': famSendOnce(act); break;
      case 'dauerhaft': famToggleDauerhaft(act); break;
      case 'sos': famSosPress(); break;
    }
  });
  pane.addEventListener('change', (e) => {
    if (e.target.id === 'famMinePush') { try { localStorage.setItem('pinn.teilenPush', e.target.checked ? '1' : '0'); } catch (err) { /* ignore */ } return; }
    const share = e.target.closest('[data-famshare]');
    if (share) { famSetSharing(share.dataset.famshare, share.checked, share); return; }
    if (e.target.id === 'famFollowSel') {
      famFollow = e.target.value;
      famFollowFree = false;
      famSelected = famFollow || famSelected;
      famTrail = null;
      if (!famFollow) famTrailHours = 0;
      famRenderChips(); famDrawMap(); famRenderInfo();
      if (famFollow && famTrailHours) famLoadTrail(true);
      famStartPolling();
      return;
    }
    if (e.target.id === 'famTrailSel') {
      famTrailHours = Number(e.target.value) || 0;
      famLoadTrail(true);
    }
  });

  const body = document.getElementById('famModalBody');
  const body2 = document.getElementById('famModal2Body');
  const onModalClick = (e) => {
    const cp = e.target.closest('[data-famcopy]');
    if (cp) { famCopy(cp.dataset.famcopy); return; }
    const add = e.target.closest('[data-famadd]');
    if (add && famModalState) {
      famSyncLists();
      if (add.dataset.famadd === 'med') famModalState.meds.push({ name: '', dose: '' });
      else famModalState.contacts.push({ name: '', relation: '', phone: '' });
      famRenderLists();
      return;
    }
    const rm = e.target.closest('[data-famrm]');
    if (rm && famModalState) {
      famSyncLists();
      const i = Number(rm.dataset.i);
      if (rm.dataset.famrm === 'med') famModalState.meds.splice(i, 1);
      else famModalState.contacts.splice(i, 1);
      famRenderLists();
      return;
    }
    const em = e.target.closest('[data-famemoji]');
    if (em && famModalState) {
      famModalState.emoji = em.dataset.famemoji;
      body.querySelectorAll('[data-famemoji]').forEach(b => b.classList.toggle('active', b === em));
      famDrawPick();
      return;
    }
    const hit = e.target.closest('[data-famhit]');
    if (hit) {
      const [la, lo] = hit.dataset.famhit.split(',').map(Number);
      famSetPick(la, lo, true);
      if (famModalState && famModalState.laden) famModalState.adresse = ntShortAddr(hit.dataset.famhitname || '');
      document.getElementById('famP_results').innerHTML = '';
      return;
    }
    const dv = e.target.closest('[data-famdev]');
    if (dv && famModalState) {
      const id = dv.dataset.famdev;
      famModalState.geraete = famModalState.geraete.includes(id) ? famModalState.geraete.filter(x => x !== id) : famModalState.geraete.concat(id);
      dv.classList.toggle('active', famModalState.geraete.includes(id));
      return;
    }
    const rc = e.target.closest('[data-famrcpt]');
    if (rc && famModalState) {
      const id = rc.dataset.famrcpt;
      famModalState.empfaenger = famModalState.empfaenger.includes(id) ? famModalState.empfaenger.filter(x => x !== id) : famModalState.empfaenger.concat(id);
      rc.classList.toggle('active', famModalState.empfaenger.includes(id));
      return;
    }
    const pl = e.target.closest('[data-famplace]');
    if (pl) { if (famPickMap) { famPickMap.destroy(); famPickMap = null; } famOpenPlaceEdit(pl.dataset.famplace); return; }
    const ty = e.target.closest('[data-famtyp]');
    if (ty) { famOpenDeviceForm({ typ: ty.dataset.famtyp, memberId: famVal('famD_member') }); return; }
    const act = e.target.closest('[data-famact]');
    if (!act) return;
    switch (act.dataset.famact) {
      case 'cancel': attemptCloseModal('famModal', famCloseModal); break;
      case 'cancel2': famCloseModal2(); break;
      case 'savepass': famSavePass(); break;
      case 'clearpass': famClearPass(); break;
      case 'adddevice': famOpenDeviceForm(null); break;
      case 'sostest': famSosTest(act); break;
      case 'sharedur': famShareDur(act); break;
      case 'sharego': famShareGo(act); break;
      case 'reloadlog': famLoadOsmandLog(); break;
      case 'savedevice': famSaveDevice(act); break;
      case 'deldevice': famDeleteDevice(act.dataset.id); break;
      case 'guide': famOpenGuide(act.dataset.id); break;
      case 'newuid': { const el = document.getElementById('famD_uid'); if (el) el.value = famNewUniqueId(); break; }
      case 'places': if (famPickMap) { famPickMap.destroy(); famPickMap = null; } famModalState = null; famOpenPlaces(); break;
      case 'addplace': famOpenPlaceEdit(''); break;
      case 'saveplace': famSavePlace(act); break;
      case 'delplace': famDeletePlace(); break;
      case 'placesearch': famPlaceSearch(); break;
      case 'placehere':
        if (!navigator.geolocation) { finShowToast('Standort auf diesem Gerät nicht verfügbar', true); break; }
        navigator.geolocation.getCurrentPosition(
          (pos) => famSetPick(pos.coords.latitude, pos.coords.longitude, true),
          () => finShowToast('Standort nicht freigegeben', true),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
        break;
      case 'placedev': { const g = famDevice(act.dataset.id); if (g && g.position) famSetPick(g.position.lat, g.position.lon, true); break; }
    }
  };
  body.addEventListener('click', onModalClick);
  body2.addEventListener('click', onModalClick);
  body.addEventListener('click', skModalClick);
  body.addEventListener('change', skModalChange);
  document.getElementById('famTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-famtab]');
    if (b) famSetTab(b.dataset.famtab);
  });

  document.getElementById('famPlacesBtn').addEventListener('click', famOpenPlaces);
  document.getElementById('famSetupBtn').addEventListener('click', async () => {
    if (!famStatus) await famLoadStatus();
    famOpenSetup();
  });
  document.getElementById('famModalClose').addEventListener('click', () => attemptCloseModal('famModal', famCloseModal));
  document.getElementById('famModal2Close').addEventListener('click', famCloseModal2);
  wireModalOutsideClick('famModal', famCloseModal);
  wireModalOutsideClick('famModal2', famCloseModal2);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentView === 'familie' && familyRecordId) famLoadStatus();
  });
  window.addEventListener('online', () => { if (currentView === 'familie') famLoadStatus(); });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('familie');
