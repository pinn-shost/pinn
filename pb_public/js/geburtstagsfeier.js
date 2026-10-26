/* pinn. – Birthday animation (js/geburtstagsfeier.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the one-time Happy Birthday animation for whoever has their birthday today (bdayCheck, bdayShow), with a flag
   on the server (/api/pinn/geburtstag) and on the device so it is shown only once across all devices. */

/* ---------- Birthday animation ----------
   Whoever has their birthday (date of birth in the emergency pass) gets a Happy Birthday animation once
   on the first opening that day – only once across all devices (flag on the server, route
   /api/pinn/geburtstag, additionally on the device). Children on the family dashboard see it when opening
   their kids page. The others get a push message in the morning with the daily overview
   (pb_hooks/familie-geburtstag.pb.js). */
var LS_BDAY_SHOWN = 'pinn.geburtstagGezeigt';
var bdayChecking = false;
function bdayLocalSeen(mid, day) {
  try { const o = JSON.parse(localStorage.getItem(LS_BDAY_SHOWN) || '{}'); return !!o && o[mid] === day; } catch (e) { return false; }
}
function bdaySetLocal(mid, day) {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(LS_BDAY_SHOWN) || '{}') || {}; } catch (e) { o = {}; }
  Object.keys(o).forEach(k => { if (o[k] !== day) delete o[k]; });
  o[mid] = day;
  try { localStorage.setItem(LS_BDAY_SHOWN, JSON.stringify(o)); } catch (e) { /* ignore */ }
}
async function bdayCheck(memberId) {
  if (!familyRecordId) return;
  if (!memberId && isCurrentUserGuest()) return;
  const m = memberId ? memberById(memberId) : currentMember();
  if (!m || famIsPet(m)) return;
  const b = ofsBirthday(m);
  if (!b || !b.today) return;
  const day = isoDate(new Date());
  if (bdayChecking || bdayLocalSeen(m.id, day) || document.getElementById('bdayOverlay')) return;
  bdayChecking = true;
  let seen = false;
  try {
    const res = await apiFetch('/api/pinn/geburtstag', { cache: 'no-store' });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body && body.heute === day && Array.isArray(body.gesehen)) seen = body.gesehen.includes(m.id);
    }
  } catch (e) { /* offline: show on this device */ }
  bdayChecking = false;
  bdaySetLocal(m.id, day);
  if (seen) return;
  bdayShow(m, b);
  try { await postJson('/api/pinn/geburtstag/gesehen', { mitglied: m.id }); } catch (e) { /* ignore */ }
}
function bdayShow(m, b) {
  if (!m || document.getElementById('bdayOverlay')) return;
  const ov = document.createElement('div');
  ov.id = 'bdayOverlay';
  ov.setAttribute('role', 'dialog');
  ov.innerHTML = `<div class="bday-card">
      <div class="bday-cake">🎂</div>
      <div class="bday-hb"><span>${tk('famTile.happyBirthday')}</span></div>
      <div class="bday-name">${escapeHtml(m.name || memberLabel(m))}</div>
      <div class="bday-sub"><span>${b && b.age ? tk('famTile.youTurnToday', { n: b.age }) : tk('bday.haveLovelyDay')}</span> 🎉</div>
      <button type="button" class="bday-btn"><span>${tk('bday.thanks')}</span> 🥳</button>
    </div>`;
  document.body.appendChild(ov);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timers = [];
  if (!reduce) {
    const colors = [0, 40, 120, 200, 260, 310];
    const h = window.innerHeight;
    for (let i = 0; i < 9; i++) {
      const el = document.createElement('span');
      el.className = 'bday-balloon';
      el.textContent = '🎈';
      el.style.left = (5 + Math.random() * 85) + '%';
      el.style.filter = `hue-rotate(${colors[i % colors.length]}deg)`;
      ov.appendChild(el);
      if (el.animate) {
        el.animate([
          { transform: 'translate(0, 0) rotate(-6deg)' },
          { transform: `translate(${(Math.random() - 0.5) * 80}px, ${-(h * 0.55)}px) rotate(6deg)` },
          { transform: `translate(${(Math.random() - 0.5) * 120}px, ${-(h + 200)}px) rotate(-4deg)` },
        ], { duration: 5200 + Math.random() * 2600, delay: Math.random() * 1400, easing: 'ease-in', fill: 'both' });
      }
    }
    try { kidConfettiRain(); } catch (e) { /* ignore */ }
    timers.push(setTimeout(() => { try { kidConfettiRain(); } catch (e) { /* ignore */ } }, 1900));
    timers.push(setTimeout(() => { try { kidConfettiRain(); } catch (e) { /* ignore */ } }, 3800));
  }
  const close = () => {
    timers.forEach(clearTimeout);
    try { kidPlaySound('win'); } catch (e) { /* ignore */ }
    if (!reduce) { try { kidConfettiBurst(window.innerWidth / 2, window.innerHeight / 2, 40); } catch (e) { /* ignore */ } }
    ov.style.transition = 'opacity .35s';
    ov.style.opacity = '0';
    setTimeout(() => ov.remove(), 380);
  };
  ov.querySelector('.bday-btn').addEventListener('click', close);
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('geburtstagsfeier');
