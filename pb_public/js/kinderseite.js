/* pinn. – Kids page (js/kinderseite.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the kids page configuration (KID_* constants, normalizeKidConfig, default tasks, times of day incl. sunset,
   kidCurrentPeriod, kidTasksForPeriod) and the page itself (sound, confetti, renderKidPage, celebration, kidToggleTask with
   delayed push, kidTick, openKidPage/closeKidPage and their listeners). The member-popup section and the routine editor are in
   js/kinderroutine.js, stars & rewards in js/sterne.js. */

/* ==========================================================
   Kids page
   ----------------------------------------------------------
   For family members with the kids page switched on, a tap on their picture in the
   family bar (appointments/overview and tasks) opens a colourful, child-friendly full-screen page with the
   tasks that are due right now. A tap checks a task off with an animation, tapping again
   removes the tick.
   Data (in the family record, so all devices see the same state):
   - m.kid = { enabled, showAllowance, times: { morgens, mittags, nachmittags, abends, nacht }, tasks: [{ id, emoji, title, period }] }
     showAllowance: show the pocket money (from Finance → Pocket money) on the kids page
     period: 'ganztags' | 'morgens' | 'mittags' | 'nachmittags' | 'abends'
   - m.kidDone = { <task ID>: 'YYYY-MM-DD' } - done only counts if the date is today.
     This way every day starts over automatically - without any schedule on the server.
   Before "Morgens" and from bedtime on the page only shows a good-night view.
   ========================================================== */
const KID_PERIODS = [
  { id: 'morgens', label: 'Morgens', icon: '🌅' },
  { id: 'mittags', label: 'Mittags', icon: '☀️' },
  { id: 'nachmittags', label: 'Nachmittags', icon: '🌤️' },
  { id: 'abends', label: 'Abends', icon: '🌙' },
];
const KID_TASK_GROUPS = [{ id: 'ganztags', label: 'Den ganzen Tag', icon: '⭐' }, ...KID_PERIODS];
const KID_TIME_KEYS = ['morgens', 'mittags', 'nachmittags', 'abends', 'nacht'];
const KID_TIME_LABELS = { morgens: 'Morgens ab', mittags: 'Mittags ab', nachmittags: 'Nachmittags ab', abends: 'Abends ab', nacht: 'Schlafenszeit ab' };
const KID_DEFAULT_TIMES = { morgens: '05:00', mittags: '11:00', nachmittags: '14:00', abends: '17:30', nacht: '21:00' };
const KID_CARD_COLORS = ['#FFD166', '#8FD3FF', '#FFA8CB', '#B8E986', '#CDB4FF', '#FFBE8F', '#7FE0D1', '#FFE38A'];
const KID_EMOJIS = ['🪥', '🦷', '🧼', '💧', '🚿', '🛁', '🧴', '💇‍♀️', '💇‍♂️', '🎀', '👕', '👗', '👖', '🧦', '👟', '🧥', '👚',
  '🥣', '🍞', '🥛', '🍎', '🍌', '🥕', '🍽️', '💊', '🎒', '📚', '✏️', '🎨', '🎵', '🧸', '🧩', '🚗', '🪀', '⚽', '🚲',
  '🧺', '🧹', '🌱', '🐶', '🐱', '🚽', '🙌', '🤗', '🛏️', '📖', '😴', '🌙', '⭐', '❤️'];
const LS_KID_SOUND = 'pinn.kidSound';

let pendingKidConfig = null;   // Kids page setting in the open member popup
let kidEditTasks = [];         // Working copy in the edit popup
let kidEditTimes = {};
let kidEmojiOpenFor = null;
let kidPageMemberId = null;    // Member whose kids page is currently open
let kidPageStateKey = '';      // Date|time of day of the current display - if it changes, it is redrawn
let kidPageTimer = null;
let kidAudioCtx = null;

function kidAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
function kidUid() { return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function kidToMin(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!match) return null;
  const h = Number(match[1]), m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
function kidDefaultTasks() {
  return [
    ['morgens', '🪥', 'Zähne putzen'],
    ['morgens', '💧', 'Gesicht waschen'],
    ['morgens', '👕', 'Anziehen'],
    ['morgens', '💇‍♀️', 'Haare kämmen'],
    ['morgens', '🥣', 'Frühstücken'],
    ['mittags', '🧼', 'Hände waschen'],
    ['mittags', '🍽️', 'Mittagessen'],
    ['nachmittags', '🧸', 'Spielzeug aufräumen'],
    ['nachmittags', '🍎', 'Obst essen'],
    ['abends', '🍽️', 'Abendessen'],
    ['abends', '🛁', 'Waschen'],
    ['abends', '🪥', 'Zähne putzen'],
    ['abends', '👚', 'Schlafanzug anziehen'],
    ['abends', '📖', 'Gute-Nacht-Geschichte'],
    ['abends', '🛏️', 'Ins Bett gehen'],
  ].map(([period, emoji, title]) => ({ id: kidUid(), emoji, title, period }));
}
function normalizeKidConfig(kid) {
  const k = (kid && typeof kid === 'object') ? kid : {};
  const times = { ...KID_DEFAULT_TIMES };
  KID_TIME_KEYS.forEach(key => {
    if (k.times && kidToMin(k.times[key]) !== null) times[key] = k.times[key];
  });
  const valid = new Set(KID_TASK_GROUPS.map(g => g.id));
  const tasks = Array.isArray(k.tasks)
    ? k.tasks.filter(t => t && t.id && t.title).map(t => ({
        id: String(t.id), emoji: t.emoji || '⭐', title: String(t.title), period: valid.has(t.period) ? t.period : 'ganztags',
        stars: Math.max(1, Math.min(3, Number(t.stars) || 1)),
      }))
    : [];
  return { enabled: !!k.enabled, showAllowance: !!k.showAllowance, sonne: !!k.sonne, times, tasks, stars: normalizeKidStars(k.stars) };
}
// Times of day for today: „Abends“ optionally already from sunset (Home), if that is earlier
function kidMinToTime(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
function kidEffectiveTimes(cfg, now) {
  const times = { ...cfg.times };
  if (!cfg.sonne) return times;
  const st = homeSunTimes(now || new Date());
  if (!st || !st.unter) return times;
  const setMin = st.unter.getHours() * 60 + st.unter.getMinutes();
  const latest = kidToMin(times.abends), earliest = kidToMin(times.nachmittags) + 15;
  if (latest !== null && earliest !== null && setMin < latest) times.abends = kidMinToTime(Math.max(earliest, setMin));
  return times;
}
function isKidPageEnabled(m) { return !!(m && m.kid && m.kid.enabled); }
function kidCurrentPeriod(cfg, now) {
  const t = now.getHours() * 60 + now.getMinutes();
  const times = kidEffectiveTimes(cfg, now);
  const at = key => kidToMin(times[key]);
  if (t < at('morgens') || t >= at('nacht')) return 'nacht';
  if (t >= at('abends')) return 'abends';
  if (t >= at('nachmittags')) return 'nachmittags';
  if (t >= at('mittags')) return 'mittags';
  return 'morgens';
}
function kidTasksForPeriod(cfg, period) {
  if (period === 'nacht') return [];
  return cfg.tasks.filter(t => t.period === 'ganztags' || t.period === period);
}
function kidIsDone(m, taskId, today) { return !!(m.kidDone && m.kidDone[taskId] === today); }

/* ---------- The kids page itself ---------- */
function kidSoundOn() {
  try { return localStorage.getItem(LS_KID_SOUND) !== 'off'; } catch (e) { return true; }
}
function kidUpdateSoundButton() {
  document.getElementById('kidPageSound').textContent = kidSoundOn() ? '🔊' : '🔇';
}
function kidPlaySound(kind) {
  if (!kidSoundOn()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!kidAudioCtx) kidAudioCtx = new AC();
    const ctx = kidAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const notes = kind === 'win' ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : kind === 'undo' ? [392, 311.13]
      : [659.25, 987.77];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * (kind === 'win' ? 0.11 : 0.09);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.35);
    });
  } catch (e) { /* continue without sound */ }
}
function kidConfettiBurst(x, y, count) {
  const bits = ['⭐', '✨', '🎉', '💛', '🌟', '🎈', '💚', '💜'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'kid-confetti';
    el.textContent = bits[i % bits.length];
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 120;
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist - 50;
    const rot = (Math.random() - 0.5) * 540;
    if (!el.animate) { setTimeout(() => el.remove(), 50); continue; }
    const anim = el.animate([
      { transform: 'translate(0, 0) scale(.3) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(1.15) rotate(${rot}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx * 1.1}px, ${dy + 90}px) scale(.8) rotate(${rot * 1.4}deg)`, opacity: 0 },
    ], { duration: 950 + Math.random() * 450, easing: 'cubic-bezier(.2,.7,.3,1)' });
    anim.onfinish = () => el.remove();
  }
}
function kidConfettiRain() {
  const bits = ['🎉', '⭐', '🎈', '🌟', '💖', '🏆', '✨', '🎊'];
  const w = window.innerWidth, h = window.innerHeight;
  for (let i = 0; i < 46; i++) {
    const el = document.createElement('span');
    el.className = 'kid-confetti';
    el.textContent = bits[i % bits.length];
    el.style.left = (Math.random() * w) + 'px';
    el.style.top = '-30px';
    el.style.fontSize = (20 + Math.random() * 18) + 'px';
    document.body.appendChild(el);
    if (!el.animate) { setTimeout(() => el.remove(), 50); continue; }
    const drift = (Math.random() - 0.5) * 160;
    const anim = el.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${drift}px, ${h + 80}px) rotate(${(Math.random() - 0.5) * 720}deg)`, opacity: 0.9 },
    ], { duration: 2200 + Math.random() * 1600, delay: Math.random() * 700, easing: 'cubic-bezier(.3,.2,.6,1)', fill: 'backwards' });
    anim.onfinish = () => el.remove();
  }
}
function kidDecoHtml(period) {
  const sets = {
    morgens: [['☀️', 7, 80, 64], ['☁️', 17, 2, 40], ['🌼', 90, 4, 30], ['🐦', 94, 84, 26]],
    mittags: [['☀️', 5, 80, 68], ['☁️', 17, 2, 42], ['🦋', 92, 84, 28], ['🌷', 91, 4, 28]],
    nachmittags: [['🌈', 6, 76, 60], ['☁️', 18, 2, 40], ['🌻', 91, 84, 34], ['🐝', 93, 6, 24]],
    abends: [['🌙', 6, 80, 56], ['✨', 16, 4, 24], ['⭐', 28, 90, 18], ['✨', 92, 6, 22], ['⭐', 94, 86, 20]],
    nacht: [['🌙', 8, 74, 72], ['⭐', 12, 8, 24], ['✨', 44, 4, 20], ['⭐', 50, 88, 18], ['✨', 78, 10, 22], ['⭐', 84, 80, 20]],
  };
  return (sets[period] || []).map(([e, top, left, size], i) =>
    `<span style="top:${top}%;left:${left}%;font-size:${size}px;animation-delay:${-i * 1.3}s">${e}</span>`).join('');
}
function kidAvatarHtml(m) {
  if (m.photo) return `<div class="kid-avatar"><img src="${kidAttr(m.photo)}" alt="" /></div>`;
  if (m.avatar) return `<div class="kid-avatar"><span class="kid-avatar-fill">${escapeHtml(m.avatar)}</span></div>`;
  const bg = (!m.color || m.color === 'transparent') ? '#9A9A92' : m.color;
  const initial = (m.name || '?').trim().charAt(0).toUpperCase() || '?';
  return `<div class="kid-avatar"><span class="kid-avatar-fill initial" style="background:${kidAttr(bg)}">${escapeHtml(initial)}</span></div>`;
}
function kidNextPeriodStart(cfg, period) {
  const order = ['morgens', 'mittags', 'nachmittags', 'abends', 'nacht'];
  const next = order[order.indexOf(period) + 1];
  return next ? kidEffectiveTimes(cfg, new Date())[next] : '';
}
function renderKidPage() {
  const page = document.getElementById('kidPage');
  const m = kidPageMemberId ? memberById(kidPageMemberId) : null;
  if (!m || !isKidPageEnabled(m)) { closeKidPage(); return; }
  if (kidShopView) setTimeout(kidRenderShop, 0); // redraw open rewards with the new balance
  const cfg = normalizeKidConfig(m.kid);
  const now = new Date();
  const today = isoDate(now);
  const period = kidCurrentPeriod(cfg, now);
  kidPageStateKey = today + '|' + period;
  page.className = 'kid-' + period;
  document.getElementById('kidDeco').innerHTML = kidDecoHtml(period);
  kidUpdateSoundButton();
  const name = escapeHtml(m.name || '');
  const content = document.getElementById('kidContent');

  if (period === 'nacht') {
    content.innerHTML = `<div class="kid-empty">
      ${kidAvatarHtml(m)}
      <div class="kid-hello">Schlaf gut, ${name}!</div>
      <div class="kid-sub">Morgen früh geht's weiter.</div>
      <div class="kid-empty-emoji">😴</div>
      ${kidBankHtml(m)}
      ${kidAllowanceHtml(m)}
    </div>`;
    return;
  }

  const greetings = {
    morgens: ['Guten Morgen', 'Das steht heute früh an ☀️'],
    mittags: ['Hallo', 'Das ist jetzt dran 🍽️'],
    nachmittags: ['Hallo', 'Das ist jetzt dran 🌈'],
    abends: ['Guten Abend', 'Bald ist Schlafenszeit 🌙'],
  };
  const [hello, sub] = greetings[period];
  const list = kidTasksForPeriod(cfg, period);

  if (!list.length) {
    const next = kidNextPeriodStart(cfg, period);
    content.innerHTML = `<div class="kid-empty">
      ${kidAvatarHtml(m)}
      <div class="kid-hello">${hello}, ${name}!</div>
      <div class="kid-sub">Gerade gibt es nichts zu tun – spiel schön!${next && period !== 'abends' ? `<br>Ab ${escapeHtml(next)} Uhr geht's weiter.` : ''}</div>
      <div class="kid-empty-emoji">🎈</div>
      ${kidBankHtml(m)}
      ${kidHomeworkHtml(m)}
      ${kidAllowanceHtml(m)}
    </div>`;
    return;
  }

  const allDone = list.every(t => kidIsDone(m, t.id, today));
  content.innerHTML = `
    ${kidAvatarHtml(m)}
    <div class="kid-hello">${hello}, ${name}!</div>
    <div class="kid-sub">${sub}</div>
    ${kidBankHtml(m)}
    <div class="kid-stars">${list.map(t => `<span class="kid-star${kidIsDone(m, t.id, today) ? ' on' : ''}" data-star="${kidAttr(t.id)}">⭐</span>`).join('')}</div>
    <div id="kidDoneBanner" class="kid-done-banner${allDone ? ' show' : ''}">🏆 Alles geschafft! Super, ${name}!</div>
    <div class="kid-grid">
      ${list.map((t, i) => `
        <button type="button" class="kid-card${kidIsDone(m, t.id, today) ? ' done' : ''}" data-task="${kidAttr(t.id)}" style="--kc:${KID_CARD_COLORS[i % KID_CARD_COLORS.length]}">
          <span class="kid-check">✓</span>
          <span class="kid-card-emoji">${escapeHtml(t.emoji)}</span>
          <span class="kid-card-title">${escapeHtml(t.title)}</span>
        </button>`).join('')}
    </div>
    ${kidHomeworkHtml(m)}
    ${kidAllowanceHtml(m)}`;
}
function kidShowCelebration(m) {
  const page = document.getElementById('kidPage');
  const old = page.querySelector('.kid-celebrate');
  if (old) old.remove();
  const box = document.createElement('div');
  box.className = 'kid-celebrate';
  box.innerHTML = `<div class="kid-celebrate-box">
    <div style="font-size:84px;line-height:1.1">🏆</div>
    <div style="font-size:clamp(26px,7vw,36px);font-weight:800;line-height:1.15;margin-top:6px">Super gemacht, ${escapeHtml(m.name || '')}!</div>
    <div style="font-size:19px;font-weight:600;opacity:.75;margin-top:4px">Du hast alles geschafft 🎉</div>
  </div>`;
  const dismiss = () => { box.remove(); };
  box.addEventListener('click', dismiss);
  page.appendChild(box);
  setTimeout(dismiss, 4500);
  kidConfettiRain();
  kidPlaySound('win');
}
// The server only sends done notifications 10 seconds after checking off. Afterwards the app
// asks once so they go out on time (otherwise after one minute at the latest via the schedule).
var delayedPushTimer = null;
function scheduleDelayedPush() {
  clearTimeout(delayedPushTimer);
  delayedPushTimer = setTimeout(() => {
    delayedPushTimer = null;
    apiFetch('/api/pinn/push/faellige', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }).catch(() => { /* the schedule catches up */ });
  }, 10500);
}
function kidToggleTask(taskId, card) {
  const m = memberById(kidPageMemberId);
  if (!m) return;
  const cfg = normalizeKidConfig(m.kid);
  const today = isoDate(new Date());
  const valid = new Set(cfg.tasks.map(t => t.id));
  // Only keep today's ticks of existing tasks - old days drop out automatically.
  const done = {};
  Object.entries(m.kidDone || {}).forEach(([id, day]) => { if (day === today && valid.has(id)) done[id] = day; });
  const nowDone = done[taskId] !== today;
  if (nowDone) done[taskId] = today; else delete done[taskId];
  m.kidDone = done;
  const starPeriod = kidCurrentPeriod(cfg, new Date());
  const starList = kidTasksForPeriod(cfg, starPeriod);
  const starAll = starList.length > 0 && starList.every(t => done[t.id] === today);
  const starsGained = kidStarsOnToggle(m, cfg.tasks.find(t => t.id === taskId), nowDone, starPeriod, starAll);
  saveMembers();

  card.classList.toggle('done', nowDone);
  card.classList.remove('pop', 'wiggle');
  void card.offsetWidth; // Restart the animation
  card.classList.add(nowDone ? 'pop' : 'wiggle');
  const star = [...document.querySelectorAll('#kidContent .kid-star')].find(s => s.dataset.star === taskId);
  if (star) {
    star.classList.toggle('on', nowDone);
    star.classList.remove('bump');
    void star.offsetWidth;
    if (nowDone) star.classList.add('bump');
  }
  const cards = [...document.querySelectorAll('#kidContent .kid-card')];
  const allDone = cards.length > 0 && cards.every(c => c.classList.contains('done'));
  const banner = document.getElementById('kidDoneBanner');
  if (banner) banner.classList.toggle('show', allDone);
  kidRefreshBank(m, starsGained);

  // Notice to the other family members: the server queues it and sends it after
  // 10 seconds - if the tick is removed before that, it is dropped.
  apiFetch('/api/pinn/push/kinderseite', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: m.id, taskId, allDone, done: nowDone, period: kidCurrentPeriod(cfg, new Date()) }),
  }).then(() => { if (nowDone) scheduleDelayedPush(); }).catch(() => { /* continue without notification */ });
  if (nowDone) {
    const r = card.getBoundingClientRect();
    kidConfettiBurst(r.left + r.width / 2, r.top + r.height / 2, 16);
    if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* ignore */ } }
    if (allDone) setTimeout(() => kidShowCelebration(m), 450);
    else kidPlaySound('done');
  } else {
    kidPlaySound('undo');
  }
}
function kidTick() {
  if (!kidPageMemberId) return;
  const m = memberById(kidPageMemberId);
  if (!m || !isKidPageEnabled(m)) { closeKidPage(); return; }
  const now = new Date();
  const key = isoDate(now) + '|' + kidCurrentPeriod(normalizeKidConfig(m.kid), now);
  if (key !== kidPageStateKey) {
    const page = document.getElementById('kidPage');
    const celebrate = page.querySelector('.kid-celebrate');
    if (celebrate) celebrate.remove();
    renderKidPage();
    page.scrollTop = 0;
  }
}
function openKidPage(memberId) {
  const m = memberById(memberId);
  if (!m || !isKidPageEnabled(m)) return;
  kidPageMemberId = memberId;
  renderKidPage();
  document.getElementById('kidPage').scrollTop = 0;
  setTimeout(() => { try { bdayCheck(memberId); } catch (e) { /* ignore */ } }, 700); // Birthday: Happy Birthday once
  clearInterval(kidPageTimer);
  kidPageTimer = setInterval(kidTick, 20 * 1000);
}
function closeKidPage() {
  // Child profile on the family dashboard: closing leads back to the profile selection
  if (isDashboardKidSession()) { returnToDashboard(); return; }
  kidPageMemberId = null;
  kidPageStateKey = '';
  clearInterval(kidPageTimer);
  kidPageTimer = null;
  const page = document.getElementById('kidPage');
  page.className = 'hidden';
  kidCloseShop();
  const celebrate = page.querySelector('.kid-celebrate');
  if (celebrate) celebrate.remove();
}
document.getElementById('kidContent').addEventListener('click', (e) => {
  if (e.target.closest('#kidBankBtn')) { kidOpenShop(); return; }
  const hw = e.target.closest('[data-khw]');
  if (hw) {
    const item = skHomeworkOf('').find(x => x.id === hw.dataset.khw);
    skToggleHomework(hw.dataset.khw);
    try { if (item && !item.done) kidPlaySound('done'); } catch (err) { /* ignore */ }
    renderKidPage();
    return;
  }
  const card = e.target.closest('.kid-card');
  if (card) kidToggleTask(card.dataset.task, card);
});
document.getElementById('kidPageClose').addEventListener('click', closeKidPage);
document.getElementById('kidPageSound').addEventListener('click', () => {
  try { localStorage.setItem(LS_KID_SOUND, kidSoundOn() ? 'off' : 'on'); } catch (e) { /* ignore */ }
  kidUpdateSoundButton();
  kidPlaySound('done');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && kidPageMemberId) { if (kidShopView) kidCloseShop(); else closeKidPage(); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kidTick(); });

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('kinderseite');
