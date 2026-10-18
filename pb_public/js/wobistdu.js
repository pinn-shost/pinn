/* pinn. – „Wo bist du?“ – asking where someone is (js/wobistdu.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: asking a person for their location (wbAsk), answering with the location or a quick button (wbReply), showing
   open questions on opening pinn. (wbCheckIncoming) and the answer with map and address (wbRenderAnswer).
   Server side: pb_hooks/wobistdu.pb.js + pinn-wobistdu.js. */

/* ---------- „Wo bist du?“ (where are you?) ----------
   Asking: quick actions of a person who is not sharing a live location right now. The person gets a
   push message (/?wobistdu=<ID>) and answers with their location (once from the browser, nothing is
   shared permanently) or briefly with a button. The answer comes back as a push and appears with
   map and address. Open questions to me also open the next time pinn. is opened (≤ 30 min.).
   Server: pb_hooks/wobistdu.pb.js + pinn-wobistdu.js. */
var WB_CODES = [
  ['zuhause', '🏠', 'Bin zu Hause'], ['unterwegs', '🚶', 'Bin unterwegs'], ['gleich', '⏱️', 'Bin gleich da'],
  ['gut', '👍', 'Alles gut'], ['anrufen', '📞', 'Ruf mich an'],
];
var LS_WB_DONE = 'pinn.wobistduErledigt';
var wbItems = [];
var wbLoadedAt = 0;
var wbNoServer = false;
var wbBusy = false;
function wbAnswerText(code) {
  const c = WB_CODES.find(x => x[0] === code);
  return c ? c[1] + ' ' + c[2] : '„' + String(code || '') + '“';
}
function wbHasProfile(memberId) {
  if (!Array.isArray(familyProfiles) || !familyProfiles.length) return true; // unknown: the server checks
  return familyProfiles.some(p => p && p.mitglied === memberId && p.rolle !== 'gast');
}
function wbCanAsk(m, st) {
  if (!m || wbNoServer || famIsPet(m) || m.id === famMyMemberId()) return false;
  if (isCurrentUserGuest() || !currentMember()) return false;
  if (st && st.live) return false; // live on the map – no need to ask
  return wbHasProfile(m.id);
}
function wbLastAskTo(memberId) {
  return wbItems.filter(x => x.meine && x.an === memberId && Date.now() - Number(x.zeit) < 6 * 3600 * 1000)
    .sort((a, b) => Number(b.zeit) - Number(a.zeit))[0] || null;
}
function wbWaiting() { return wbItems.some(x => x.meine && !x.antwort && Date.now() - Number(x.zeit) < 15 * 60 * 1000); }
async function wbLoad() {
  if (wbNoServer || isCurrentUserGuest() || !familyRecordId) return wbItems;
  try {
    const res = await apiFetch('/api/pinn/wobistdu', { cache: 'no-store' });
    if (res.status === 404) { wbNoServer = true; return wbItems; }
    const body = await res.json().catch(() => null);
    if (body && Array.isArray(body.anfragen)) {
      if (body.jetzt) famSkew = Number(body.jetzt) - Date.now();
      wbItems = body.anfragen;
      wbLoadedAt = Date.now();
    }
  } catch (e) { /* offline */ }
  return wbItems;
}
async function wbAsk(memberId, btn) {
  const m = memberById(memberId);
  const me = currentMember();
  if (!m) return;
  if (btn) btn.disabled = true;
  try {
    const r = await postJson('/api/pinn/wobistdu', { an: memberId, name: me ? (me.name || memberLabel(me)) : '', anName: m.name || memberLabel(m) });
    finShowToast(r.schon ? 'Schon gefragt – warte kurz auf die Antwort.' : 'Gefragt – ' + (m.name || memberLabel(m)) + ' bekommt eine Nachricht.');
    await wbLoad();
  } catch (e) {
    finShowToast(e.message || 'Keine Verbindung.', true);
  } finally {
    if (btn) btn.disabled = false;
  }
  ofsRefreshSheet();
}
function wbDoneMap() { try { const o = JSON.parse(localStorage.getItem(LS_WB_DONE) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
function wbMarkDone(id) {
  const o = wbDoneMap();
  o[id] = Date.now();
  Object.keys(o).forEach(k => { if (Date.now() - Number(o[k]) > 2 * 86400000) delete o[k]; });
  try { localStorage.setItem(LS_WB_DONE, JSON.stringify(o)); } catch (e) { /* ignore */ }
}
// When pinn. opens: show a still open question to me (≤ 30 min.) right away
async function wbCheckIncoming() {
  if (wbNoServer || isCurrentUserGuest() || !currentMember() || !familyRecordId) return;
  await wbLoad();
  const done = wbDoneMap();
  const open = wbItems.filter(x => x.anMich && !x.antwort && !done[x.id] && Date.now() - Number(x.zeit) < 30 * 60 * 1000)
    .sort((a, b) => Number(b.zeit) - Number(a.zeit))[0];
  const modal = document.getElementById('famModal');
  if (open && modal && modal.classList.contains('hidden')) wbOpen(open.id);
}
function wbName(x, which) {
  const id = which === 'von' ? x.vonMitglied : x.an;
  const m = id ? memberById(id) : null;
  return m ? (m.name || memberLabel(m)) : (which === 'von' ? x.vonName : x.anName) || 'Jemand';
}
async function wbOpen(id) {
  let x = wbItems.find(i => i.id === id);
  if (!x || Date.now() - wbLoadedAt > 5000) { await wbLoad(); x = wbItems.find(i => i.id === id); }
  if (!x) { finShowToast('Diese Frage ist nicht mehr da.', true); return; }
  ofsOpenId = '';
  if (x.anMich) wbRenderAsk(x); else wbRenderAnswer(x);
}
// View for the person asked
function wbRenderAsk(x) {
  const name = wbName(x, 'von');
  const vm = x.vonMitglied ? memberById(x.vonMitglied) : null;
  const html = `<div class="ofs">
    <div class="ofs-head">
      ${vm ? `<span class="fam-ava big" style="--fam:${famAttr(famColor(vm))}">${famAvatarInner(vm)}</span>` : '<span class="text-4xl">📍</span>'}
      <div class="min-w-0"><div class="font-serif text-xl">${escapeHtml(name)}</div><div class="text-sm text-ink/60">fragt: Wo bist du?</div><div class="text-[11px] text-ink/40">${escapeHtml(famAgo(x.zeit))}</div></div>
    </div>
    ${x.antwort ? `<p class="text-xs text-ink/50">${escapeHtml('Schon geantwortet: ' + (x.antwort.lat != null ? 'Standort' : wbAnswerText(x.antwort.text)))}</p>` : ''}
    <button type="button" class="wb-big" data-wb="ort">📍 <span>Standort senden</span></button>
    <p class="text-[11px] text-ink/45 -mt-1">Einmalig dein aktueller Standort – es wird nichts dauerhaft geteilt.</p>
    <p id="wbErr" class="text-xs text-red-600 hidden"></p>
    <div class="text-xs text-ink/50">Oder kurz antworten:</div>
    <div class="wb-quick">${WB_CODES.map(c => `<button type="button" data-wb="${c[0]}">${c[1]} <span>${escapeHtml(c[2])}</span></button>`).join('')}</div>
  </div>`;
  famOpenModal(html, body => {
    body.querySelectorAll('[data-wb]').forEach(b => b.addEventListener('click', () => wbReply(x, b.dataset.wb, b)));
  });
}
function wbErr(text) {
  const el = document.getElementById('wbErr');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('hidden', !text);
}
async function wbReply(x, what, btn) {
  if (wbBusy) return;
  const me = currentMember();
  const name = me ? (me.name || memberLabel(me)) : '';
  wbBusy = true;
  if (btn) btn.disabled = true;
  try {
    let payload;
    if (what === 'ort') {
      if (!navigator.geolocation) throw new Error('Dieses Gerät kann keinen Standort bestimmen.');
      wbErr('');
      if (btn) btn.querySelector('span').textContent = 'Standort wird bestimmt …';
      const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }))
        .catch(err => { throw new Error(err && err.code === 1 ? 'Standort nicht erlaubt – bitte in den Einstellungen des Handys für pinn. bzw. den Browser freigeben.' : 'Standort konnte nicht bestimmt werden.'); });
      payload = { id: x.id, lat: pos.coords.latitude, lon: pos.coords.longitude, genau: pos.coords.accuracy, name };
    } else {
      payload = { id: x.id, text: what, name };
    }
    await postJson('/api/pinn/wobistdu/antwort', payload);
    wbMarkDone(x.id);
    famCloseModal();
    finShowToast('Antwort geschickt ✓');
    wbLoad();
  } catch (e) {
    wbErr(e.message || 'Keine Verbindung.');
    if (btn && what === 'ort') btn.querySelector('span').textContent = 'Standort senden';
  } finally {
    wbBusy = false;
    if (btn) btn.disabled = false;
  }
}
// View for the person asking
function wbRenderAnswer(x) {
  const name = wbName(x, 'an');
  const m = memberById(x.an);
  const a = x.antwort;
  let main;
  if (!a) main = `<div class="wb-bubble">⏳ <span>Noch keine Antwort</span></div><p class="text-[11px] text-ink/45 text-center">${escapeHtml('Gefragt ' + famAgo(x.zeit))}</p>`;
  else if (a.lat == null) main = `<div class="wb-bubble">${escapeHtml(wbAnswerText(a.text))}</div><p class="text-[11px] text-ink/45 text-center">${escapeHtml(famAgo(a.zeit))}</p>`;
  else {
    const maps = isAppleMobile() ? `https://maps.apple.com/?q=${a.lat},${a.lon}` : (isAndroidDevice() ? `geo:${a.lat},${a.lon}?q=${a.lat},${a.lon}` : `https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lon}#map=17/${a.lat}/${a.lon}`);
    main = `<div id="wbMapHost" class="wb-map"></div>
      <div class="text-sm"><span id="wbAddr" class="font-medium">Adresse wird gesucht …</span></div>
      <div class="text-[11px] text-ink/50">${escapeHtml(famAgo(a.zeit) + (a.genau ? ' (± ' + a.genau + ' m)' : ''))}</div>
      <a class="fz-mini-btn self-start" href="${famAttr(maps)}" target="_blank" rel="noopener">🧭 In Karten-App öffnen</a>`;
  }
  const phone = String(((famPass(x.an) || {}).phone) || '').trim();
  const html = `<div class="ofs">
    <div class="ofs-head">
      ${m ? `<span class="fam-ava big" style="--fam:${famAttr(famColor(m))}">${famAvatarInner(m)}</span>` : '<span class="text-4xl">📍</span>'}
      <div class="min-w-0"><div class="font-serif text-xl">${escapeHtml(name)}</div><div class="text-sm text-ink/60">${a ? 'hat geantwortet' : 'wurde gefragt: Wo bist du?'}</div></div>
    </div>
    ${main}
    ${phone ? `<div class="flex gap-2"><a class="fz-act-btn" href="${famAttr(famTel(phone))}"><span class="fz-ti">📞</span><span>Anrufen</span></a><a class="fz-act-btn" href="${famAttr('sms:' + phone.replace(/[^\d+]/g, ''))}"><span class="fz-ti">💬</span><span>Nachricht</span></a></div>` : ''}
  </div>`;
  famOpenModal(html, body => {
    if (!a || a.lat == null) return;
    const host = body.querySelector('#wbMapHost');
    try {
      if (famPickMap) { famPickMap.destroy(); famPickMap = null; }
      famPickMap = famCreateMap(host, {}); // is removed again with the popup (famCloseModal)
      requestAnimationFrame(() => {
        if (!famPickMap) return;
        famPickMap.setView(Number(a.lat), Number(a.lon), a.genau && a.genau > 300 ? 14 : 16);
        famPickMap.setMarkers([{ id: 'wb', lat: Number(a.lat), lon: Number(a.lon), html: `<div class="fm-mk" style="--fam:${famAttr(famColor(m))}"><div class="fm-mk-ava">${m ? famAvatarInner(m) : '📍'}</div><div class="fm-mk-lbl">${escapeHtml(name)}</div></div>` }]);
        if (a.genau) famPickMap.setCircles([{ lat: Number(a.lat), lon: Number(a.lon), r: Math.max(5, Number(a.genau)), color: famColor(m) }]);
      });
    } catch (e) { host.classList.add('hidden'); }
    apiFetch(`/api/pinn/ortung/suche?lat=${a.lat}&lon=${a.lon}`).then(r => r.json()).then(b => {
      const t = Array.isArray(b.treffer) && b.treffer[0];
      const el = document.getElementById('wbAddr');
      if (el) el.textContent = t ? t.name : (Number(a.lat).toFixed(5) + ', ' + Number(a.lon).toFixed(5));
    }).catch(() => {
      const el = document.getElementById('wbAddr');
      if (el) el.textContent = Number(a.lat).toFixed(5) + ', ' + Number(a.lon).toFixed(5);
    });
  });
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('wobistdu');
