/* pinn. – Smart home (js/smarthome.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: devices with actions via Apple Shortcuts or Home Assistant – start buttons on cleaning and bin tasks,
   "On check-off" actions, the notice bar, the smart home popup (tabs Devices | Apple automation | Home Assistant),
   Settings → Smart home, the device editor and the robot vacuum room cleaning (rooms, suction, water, mop mode).
   The server side is pb_hooks/pinn-smarthome.js. Functions here are called by the task and household code
   (inline script) only at runtime, never while loading.
   Texts (since 1.113.1): every text on screen comes from a text key via tk(), see pb_public/i18n/. Labels of device
   types, suggested actions, Home Assistant domains/services and robot vacuum levels are getters or key maps, so
   they always follow the chosen language. Action names and device names the user saved stay as they are (data). */

/* ==========================================================
   Smart home: devices with actions – Apple Shortcuts or Home Assistant.
   Settings → Smart home and Household → house icon open the same popup (tabs Devices | Apple | Home Assistant).
   - smartDevices (family record): [{ id, name, icon, type, system: 'shortcut'|'ha', statusEntity,
       actions: [{ id, label, minutes, shortcut, ha: { entity, service, data, dataText, color, brightness } }] }]
   - Cleaning tasks (roomSchedules) and bins (trashBins): smart = { start: [IDs], done: ID, auto: { action, time, abhaken } }
   - Apple: the button starts the shortcut in the Shortcuts app; automation via the shortcut "pinn Automatik".
   - Home Assistant: the pinn. server calls the services – button on every device (Android too),
     automation and "On check-off" run without further action (schedule every minute). With a status entity
     the queue waits until e.g. the robot vacuum is back in its dock.
   - The room name is passed along as input (Apple) or as the script variable "raum" (Home Assistant).
   ========================================================== */
// key = text key of the type name; de = German name of earlier versions (device names may still be exactly that);
// actions = suggested actions: text key + robot vacuum mode / mower service (no longer guessed from the translated name)
const SMART_DEVICE_TYPES = [
  { id: 'sauger', key: 'smart.type.vacuum', de: 'Saugroboter', icon: '🤖', actions: [{ key: 'smart.action.vacuum', mode: 'vac' }, { key: 'smart.action.mop', mode: 'mop' }, { key: 'smart.action.vacuumMop', mode: 'vacmop' }] },
  { id: 'maeher', key: 'smart.type.mower', de: 'Mähroboter', icon: '🌱', actions: [{ key: 'smart.action.mow', mower: 'lawn_mower.start_mowing' }, { key: 'smart.action.dock', mower: 'lawn_mower.dock' }] },
  { id: 'bewaesserung', key: 'smart.type.watering', de: 'Bewässerung', icon: '💦', actions: [{ key: 'smart.action.water' }] },
  { id: 'futter', key: 'smart.type.feeder', de: 'Futterautomat', icon: '🍽️', actions: [{ key: 'smart.action.feed' }] },
  { id: 'licht', key: 'smart.type.light', de: 'Licht / LED', icon: '💡', actions: [{ key: 'smart.action.remind' }, { key: 'smart.action.off' }] },
  { id: 'steckdose', key: 'smart.type.plug', de: 'Steckdose', icon: '🔌', actions: [{ key: 'smart.action.on' }, { key: 'smart.action.off' }] },
  { id: 'lautsprecher', key: 'smart.type.speaker', de: 'Lautsprecher', icon: '🔊', actions: [{ key: 'smart.action.announce' }] },
  { id: 'sonstiges', key: 'smart.type.other', de: 'Sonstiges', icon: '⚙️', actions: [{ key: 'smart.action.start' }] },
];
SMART_DEVICE_TYPES.forEach(t => Object.defineProperty(t, 'label', { get() { return tk(this.key); } }));
const SMART_ICONS = ['🤖', '🧽', '🌱', '💦', '💡', '🌈', '🔌', '🔊', '🌀', '🪟', '🧺', '🍽️', '🌡️', '⚙️'];
const SMART_SYSTEMS = [
  { id: 'shortcut', get label() { return tk('settings.smartHome.apple'); }, short: 'Apple' },
  { id: 'ha', label: 'Home Assistant', short: 'Home Assistant' },
];
// Home Assistant domain → text key of its group name in the entity list
const HA_DOMAIN_KEYS = {
  script: 'smart.domain.script', scene: 'smart.domain.scene', automation: 'smart.domain.automation', button: 'smart.domain.button',
  input_button: 'smart.domain.inputButton', vacuum: 'smart.domain.vacuum', lawn_mower: 'smart.domain.lawnMower', light: 'smart.domain.light',
  switch: 'smart.domain.switch', fan: 'smart.domain.fan', input_boolean: 'smart.domain.inputBoolean', cover: 'smart.domain.cover',
  media_player: 'smart.domain.mediaPlayer', climate: 'smart.domain.climate', siren: 'smart.domain.siren', lock: 'smart.domain.lock',
  valve: 'smart.domain.valve', humidifier: 'smart.domain.humidifier', select: 'smart.domain.select', sensor: 'smart.domain.sensor',
  binary_sensor: 'smart.domain.binarySensor',
};
function haDomainLabel(domain) { return HA_DOMAIN_KEYS[domain] ? tk(HA_DOMAIN_KEYS[domain]) : domain; }
const HA_SERVICES = {
  script: ['turn_on'], scene: ['turn_on'], automation: ['trigger', 'turn_on', 'turn_off'], button: ['press'], input_button: ['press'],
  vacuum: ['start', 'return_to_base', 'pause', 'stop'], lawn_mower: ['start_mowing', 'dock', 'pause'],
  light: ['turn_on', 'turn_off', 'toggle'], switch: ['turn_on', 'turn_off', 'toggle'], fan: ['turn_on', 'turn_off', 'toggle'],
  input_boolean: ['turn_on', 'turn_off', 'toggle'], cover: ['open_cover', 'close_cover', 'stop_cover'],
  media_player: ['media_play', 'media_pause', 'turn_on', 'turn_off'], climate: ['turn_on', 'turn_off'],
  siren: ['turn_on', 'turn_off'], lock: ['lock', 'unlock'], valve: ['open_valve', 'close_valve'], humidifier: ['turn_on', 'turn_off'],
};
// Home Assistant service → text key of its name
const HA_SERVICE_KEYS = {
  turn_on: 'smart.service.turnOn', turn_off: 'smart.service.turnOff', toggle: 'smart.service.toggle', trigger: 'smart.service.trigger',
  press: 'smart.service.press', start: 'smart.action.start', return_to_base: 'smart.action.dock', pause: 'smart.service.pause',
  stop: 'smart.service.stop', start_mowing: 'smart.action.mow', dock: 'smart.action.dock', open_cover: 'smart.service.open',
  close_cover: 'smart.service.close', stop_cover: 'smart.service.stop', media_play: 'smart.service.play', media_pause: 'smart.service.pause',
  lock: 'smart.service.lock', unlock: 'smart.service.unlock', open_valve: 'smart.service.open', close_valve: 'smart.service.close',
};
const HA_ACTION_DOMAINS = Object.keys(HA_SERVICES);
const HA_STATUS_DOMAINS = ['vacuum', 'lawn_mower', 'media_player', 'switch', 'light', 'fan', 'climate', 'cover', 'humidifier', 'valve', 'input_boolean', 'sensor', 'binary_sensor'];
// Robot vacuum (room cleaning): modes and names for suction levels, water amount and mop mode
const SMART_VAC_MODES = [
  { id: 'vac', get label() { return '🌀 ' + tk('smart.action.vacuum'); } },
  { id: 'vacmop', get label() { return '🌀💧 ' + tk('smart.action.vacuumMop'); } },
  { id: 'mop', get label() { return '💧 ' + tk('smart.action.mop'); } },
];
// Option of the robot → text key (names like Turbo, Max or SmartPlan stay as they are)
const SMART_VAC_KEYS = {
  off: 'smart.action.off', quiet: 'smart.vac.quiet', silent: 'smart.vac.quiet', gentle: 'smart.vac.gentle', balanced: 'smart.vac.balanced',
  standard: 'smart.vac.standard', medium: 'smart.vac.medium', moderate: 'smart.vac.medium', strong: 'smart.vac.strong', low: 'smart.vac.low',
  mild: 'smart.vac.low', high: 'smart.vac.high', intense: 'smart.vac.intense', extreme: 'smart.vac.extreme', custom: 'smart.vac.custom',
  custom_water_flow: 'smart.vac.customWater', deep: 'smart.vac.deep', fast: 'smart.vac.fast',
};
const SMART_VAC_NAMES = { turbo: 'Turbo', max: 'Max', max_plus: 'Max+', smart_mode: 'SmartPlan' };
// Text in the chosen language (old dictionaries; still used by other files – see js/sprache.js)
function i18nT(s) { return (window.PINN_I18N && PINN_I18N.active) ? PINN_I18N.t(s) : s; }
function smartVacLabel(o) {
  if (o === 'deep_plus') return tk('smart.vac.deep') + '+';
  return SMART_VAC_KEYS[o] ? tk(SMART_VAC_KEYS[o]) : (SMART_VAC_NAMES[o] || String(o).replace(/_/g, ' '));
}
function smartVacModeOf(label) {
  const l = String(label || '').toLowerCase();
  const vac = /saug|vacuum|aspir/.test(l), mop = /wisch|mop|serpill|fregar|friega/.test(l);
  if (vac && mop) return 'vacmop';
  if (mop) return 'mop';
  if (vac) return 'vac';
  return 'vacmop';
}
function smartNormRoom(v) {
  return String(v || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
}
// Like the server: find the room name of the task in the robot map (exact match, otherwise contained)
function smartMatchVacRoom(list, name) {
  const n = smartNormRoom(name);
  if (!n) return [];
  let hit = list.filter(r => smartNormRoom(r.name) === n);
  if (!hit.length) hit = list.filter(r => { const x = smartNormRoom(r.name); return x && (x.includes(n) || n.includes(x)); });
  return hit;
}
function haServiceLabel(domain, svc) {
  if ((domain === 'script' || domain === 'scene') && svc === 'turn_on') return tk('smart.service.run');
  return HA_SERVICE_KEYS[svc] ? tk(HA_SERVICE_KEYS[svc]) : svc;
}

// Duration of an action in minutes (0 = unknown, does not block the device)
function smartMinutes(v) { const m = parseInt(v, 10); return m > 0 && m <= 600 ? m : 0; }
function smartNewId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function smartSystem(device) { return device && device.system === 'ha' ? 'ha' : 'shortcut'; }

// kind 'segments' = room cleaning with the robot vacuum: rooms 'task' (room of the task) or [segment IDs],
// roomMap { "16": "Wohnzimmer" }, mode vac|vacmop|mop, fan, water, mopMode, repeat (1–3)
function normalizeSmartHa(h) {
  if (!h || typeof h !== 'object') h = {};
  const roomMap = {};
  if (h.roomMap && typeof h.roomMap === 'object') Object.keys(h.roomMap).slice(0, 60).forEach(k => { if (parseInt(k, 10) > 0) roomMap[String(parseInt(k, 10))] = String(h.roomMap[k]).slice(0, 60); });
  return {
    entity: String(h.entity || ''), service: String(h.service || ''),
    data: h.data && typeof h.data === 'object' && !Array.isArray(h.data) ? h.data : {},
    dataText: String(h.dataText || ''), color: /^#[0-9a-f]{6}$/i.test(h.color || '') ? h.color : '',
    brightness: smartMinutes(h.brightness) > 100 ? 100 : smartMinutes(h.brightness),
    kind: h.kind === 'segments' ? 'segments' : '',
    mode: ['vac', 'vacmop', 'mop'].includes(h.mode) ? h.mode : 'vacmop',
    rooms: Array.isArray(h.rooms) ? h.rooms.map(n => parseInt(n, 10)).filter(n => n > 0).slice(0, 30) : 'task',
    roomMap,
    fan: String(h.fan || '').slice(0, 40), water: String(h.water || '').slice(0, 40), mopMode: String(h.mopMode || '').slice(0, 40),
    waterEntity: String(h.waterEntity || ''), mopModeEntity: String(h.mopModeEntity || ''),
    repeat: Math.min(3, Math.max(1, parseInt(h.repeat, 10) || 1)),
    offAfter: !!h.offAfter, // 1.62: switch off again after the duration (watering)
  };
}
// Service that switches an action off again (watering: close the valve) – same as the server
function smartOffServiceFor(svc) {
  if (svc === 'valve.open_valve') return 'valve.close_valve';
  const m = /^(switch|light|fan|input_boolean|humidifier|siren)\.turn_on$/.exec(String(svc || ''));
  return m ? m[1] + '.turn_off' : '';
}
// Mower (1.62): default service from the action name
function smartMowerService(label) { return /station|dock|basis|base|parken|park|zur[üu]ck/i.test(String(label || '')) ? 'lawn_mower.dock' : 'lawn_mower.start_mowing'; }
function normalizeSmartDevices(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(d => d && d.id && d.name).map(d => ({
    id: String(d.id),
    name: String(d.name),
    icon: d.icon || '⚙️',
    type: SMART_DEVICE_TYPES.some(t => t.id === d.type) ? d.type : 'sonstiges',
    system: d.system === 'ha' ? 'ha' : 'shortcut',
    statusEntity: String(d.statusEntity || ''),
    actions: (Array.isArray(d.actions) ? d.actions : []).filter(a => a && a.id && a.label)
      .map(a => ({ id: String(a.id), label: String(a.label), shortcut: String(a.shortcut || ''), minutes: smartMinutes(a.minutes), ha: normalizeSmartHa(a.ha) })),
  }));
}

function smartAllActions() {
  const out = [];
  smartDevices.forEach(device => (device.actions || []).forEach(action => out.push({ device, action })));
  return out;
}
function smartActionById(id) {
  if (!id) return null;
  return smartAllActions().find(x => x.action.id === id) || null;
}
// Is the action fully set up?
function smartHitReady(hit) {
  if (!hit) return false;
  if (smartSystem(hit.device) === 'ha') return !!(hit.action.ha && hit.action.ha.entity && hit.action.ha.service);
  return !!hit.action.shortcut;
}

/* ---------- Task → cleaning/bin (via the title generated by the server) ---------- */
function householdRuleForTask(task) {
  const title = String((task && task.title) || '').trim();
  if (!title) return null;
  for (const s of roomSchedules) {
    const room = rooms.find(r => r.id === s.roomId);
    const cat = cleaningCategoryById(s.category);
    if (title === (cat ? cat.label : 'Reinigung') + ': ' + (room ? room.name : 'Unbekannt')) return { rule: s, room };
  }
  for (const b of trashBins) {
    const room = rooms.find(r => r.id === b.roomId);
    const wt = wasteTypeById(b.wasteType);
    if (title === (wt ? wt.icon : '🗑️') + ' ' + (wt ? wt.taskLabel : 'Müll') + ' rausbringen: ' + (room ? room.name : 'Unbekannt')) return { rule: b, room };
  }
  return null;
}
function smartStartActionsForTask(task) {
  if (!smartDevices.length) return [];
  const hit = householdRuleForTask(task);
  if (!hit || !hit.rule.smart || !Array.isArray(hit.rule.smart.start)) return [];
  return hit.rule.smart.start.map(smartActionById).filter(Boolean);
}
function smartDoneActionForTask(task) {
  if (!smartDevices.length) return null;
  const hit = householdRuleForTask(task);
  return hit && hit.rule.smart ? smartActionById(hit.rule.smart.done) : null;
}
// Automation of the rule (Apple: shortcut "pinn Automatik", Home Assistant: server)
function smartAutoForTask(task) {
  if (!smartDevices.length) return null;
  const hit = householdRuleForTask(task);
  const auto = hit && hit.rule.smart && hit.rule.smart.auto;
  if (!auto || !auto.time) return null;
  const a = smartActionById(auto.action);
  return a ? { ...a, time: auto.time, abhaken: !!auto.abhaken } : null;
}
function smartInputForTask(task) {
  const hit = householdRuleForTask(task);
  return hit && hit.room ? hit.room.name : '';
}

/* ---------- Notice bar at the bottom (question "Check off?" or a short message) ---------- */
function showSmartBar({ title, text, yesLabel, onYes, ms }) {
  const old = document.getElementById('smartDonePrompt');
  if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'smartDonePrompt';
  box.setAttribute('role', onYes ? 'dialog' : 'status');
  box.innerHTML = `<div class="text-sm font-medium">${escapeHtml(title)}</div>
    ${text ? `<div class="text-xs mt-0.5" style="opacity:.75">${escapeHtml(text)}</div>` : ''}
    <div class="sdp-btns"><button type="button" class="sdp-no">${onYes ? escapeHtml(tk('smart.later')) : 'OK'}</button>${onYes ? `<button type="button" class="sdp-yes">${escapeHtml(yesLabel || 'OK')}</button>` : ''}</div>`;
  let timer = null;
  const close = () => {
    clearTimeout(timer);
    box.classList.remove('show');
    setTimeout(() => box.remove(), 220);
  };
  box.querySelector('.sdp-no').addEventListener('click', close);
  if (onYes) box.querySelector('.sdp-yes').addEventListener('click', () => { close(); onYes(); });
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('show'));
  timer = setTimeout(close, ms || 25000);
}
function showSmartDonePrompt(run) {
  const task = deriveTasks().find(t => t.id === run.taskId);
  if (!task || task.done || taskDoneOverrides.get(task.id) === true) return;
  showSmartBar({
    title: run.icon + ' ' + tk('smart.started', { action: run.label }),
    text: tk('smart.checkOffNow', { title: task.title }),
    yesLabel: tk('smart.checkOffBtn'),
    onYes: () => {
      const current = deriveTasks().find(t => t.id === run.taskId);
      if (current && !current.done) toggleTaskDone(current);
    },
  });
}

/* ---------- Start Apple Shortcuts ---------- */
function smartShortcutsAvailable() {
  const ua = navigator.userAgent || '';
  if (/Android|Windows|CrOS/i.test(ua)) return false;
  return /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua);
}
// Can the action be started on this device? quiet = true: without a message (for "On check-off")
function smartCanRun(hit, quiet) {
  if (!hit) return false;
  if (!smartHitReady(hit)) {
    if (!quiet) alert(tk('smart.notReady', { action: hit.action.label, reason: smartSystem(hit.device) === 'ha' ? tk('smart.missingEntity') : tk('smart.missingShortcut') }));
    return false;
  }
  if (smartSystem(hit.device) === 'shortcut' && !smartShortcutsAvailable()) {
    if (!quiet) alert(tk('smart.appleOnlyHint'));
    return false;
  }
  return true;
}
// Tell the automation that the app started an Apple shortcut itself (otherwise it starts twice).
// Waits only briefly - after that the device switches to the Shortcuts app.
async function smartReportRun(taskId, art, actionId) {
  if (!taskId || String(taskId).startsWith('tmp')) return;
  const req = apiFetch('/api/pinn/smart/gemeldet', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ taskId, art, actionId: actionId || '' }),
  }).catch(() => null);
  await Promise.race([req, new Promise(r => setTimeout(r, 700))]);
}
function runSmartShortcut(action, inputText) {
  if (!action || !action.shortcut) return false;
  let url = 'shortcuts://run-shortcut?name=' + encodeURIComponent(action.shortcut);
  if (inputText) url += '&input=text&text=' + encodeURIComponent(inputText);
  window.location.href = url;
  return true;
}

/* ---------- Home Assistant via the pinn. server ---------- */
async function smartHaRun(taskId, hit, art) {
  const res = await apiFetch('/api/pinn/smart/ha/ausfuehren', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: taskId && !String(taskId).startsWith('tmp') ? taskId : '', actionId: hit.action.id, art }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error || tk('smart.serverNoAnswer'));
  return body;
}

// Button on the task
let smartPendingRun = null; // { taskId, label, icon, at, hidden }
async function runSmartActionForTask(task, hit) {
  if (!smartCanRun(hit, false)) return;
  if (smartSystem(hit.device) === 'ha') {
    try {
      const r = await smartHaRun(task.id, hit, 'start');
      if (r.eingereiht) {
        showSmartBar({
          title: hit.device.icon + ' ' + tk('smart.queued', { action: hit.action.label }),
          text: tk('smart.busyQueued', { device: hit.device.name, busyWith: r.belegtMit ? ' (' + r.belegtMit + ')' : '', earliest: r.ab ? tk('smart.earliest', { time: r.ab }) : '' }),
          ms: 8000,
        });
      } else {
        showSmartDonePrompt({ taskId: task.id, label: hit.action.label, icon: hit.device.icon });
      }
    } catch (err) {
      alert('Home Assistant: ' + err.message);
    }
    return;
  }
  // Apple: after returning from the Shortcuts app, ask whether the task is done.
  // On the Mac pinn. often stays visible - then the question comes after a few seconds.
  await smartReportRun(task.id, 'start', hit.action.id);
  if (!runSmartShortcut(hit.action, smartInputForTask(task))) return;
  const run = { taskId: task.id, label: hit.action.label, icon: hit.device.icon, at: Date.now(), hidden: false };
  smartPendingRun = run;
  setTimeout(() => {
    if (smartPendingRun === run && !run.hidden && document.visibilityState === 'visible') {
      smartPendingRun = null;
      showSmartDonePrompt(run);
    }
  }, 4000);
}
document.addEventListener('visibilitychange', () => {
  const run = smartPendingRun;
  if (!run) return;
  if (document.visibilityState === 'hidden') { run.hidden = true; return; }
  if (!run.hidden) return;
  smartPendingRun = null;
  if (Date.now() - run.at > 30 * 60 * 1000) return;
  setTimeout(() => showSmartDonePrompt(run), 400);
});

// "On check-off" (from toggleTaskDone): Home Assistant via the server, Apple via shortcut.
// On devices without shortcuts the automation catches up on the Apple action.
async function smartRunDone(task, hit) {
  if (!smartCanRun(hit, true)) return;
  if (smartSystem(hit.device) === 'ha') {
    try { await smartHaRun(task.id, hit, 'done'); } catch (err) { console.warn('[Smarthome] Beim Abhaken:', err.message); }
    return;
  }
  await smartReportRun(task.id, 'done', hit.action.id);
  runSmartShortcut(hit.action, smartInputForTask(task));
}

/* ---------- Link in cleaning task / bin ---------- */
let pendingSmartStart = [];
let pendingSmartDone = '';
let pendingSmartAuto = { action: '', time: '10:00', abhaken: false };
let smartPickerContainerId = '';
function smartPickerLoad(smart, containerId) {
  if (!smartStatus && smartDevices.length) loadSmartStatus().then(() => renderSmartLinkPicker());
  pendingSmartStart = smart && Array.isArray(smart.start) ? smart.start.filter(id => smartActionById(id)) : [];
  pendingSmartDone = smart && smartActionById(smart.done) ? smart.done : '';
  const auto = smart && smart.auto ? smart.auto : null;
  // Default time: cleaning in the morning, bins in the evening (the task is created the day before collection)
  const defTime = containerId === 'trashBinSmartPicker' ? '18:00' : '10:00';
  pendingSmartAuto = {
    action: auto && smartActionById(auto.action) ? auto.action : '',
    time: auto && /^\d{2}:\d{2}$/.test(auto.time || '') ? auto.time : defTime,
    abhaken: !!(auto && auto.abhaken),
  };
  smartPickerContainerId = containerId;
  renderSmartLinkPicker();
}
function smartPickerValue() {
  const autoOk = !!smartActionById(pendingSmartAuto.action);
  return {
    start: pendingSmartStart.filter(id => smartActionById(id)),
    done: smartActionById(pendingSmartDone) ? pendingSmartDone : '',
    auto: autoOk ? { action: pendingSmartAuto.action, time: pendingSmartAuto.time || '10:00', abhaken: !!pendingSmartAuto.abhaken } : null,
  };
}
function renderSmartLinkPicker() {
  const wrap = smartPickerContainerId ? document.getElementById(smartPickerContainerId) : null;
  if (!wrap) return;
  const all = smartAllActions();
  if (!all.length) {
    wrap.innerHTML = `<p class="text-[11px] text-ink/40">${escapeHtml(tk('smart.noDevicesSetUp'))} <button type="button" class="smart-open-setup text-pine underline">${escapeHtml(tk('smart.setUp'))}</button></p>`;
    wrap.querySelector('.smart-open-setup').addEventListener('click', () => openSmartHomeModal('geraete'));
    return;
  }
  const multi = smartDevices.length > 1;
  const chips = all.map(hit => {
    const on = pendingSmartStart.includes(hit.action.id);
    return `<button type="button" class="sh-chip${on ? ' active' : ''}" data-id="${escapeHtml(hit.action.id)}" aria-pressed="${on}">${escapeHtml(hit.device.icon)} ${escapeHtml(hit.action.label)}${multi ? ` <span style="opacity:.6">(${escapeHtml(hit.device.name)})</span>` : ''}${smartHitReady(hit) ? '' : ' <span class="sh-missing">!</span>'}</button>`;
  }).join('');
  const options = `<option value="">${escapeHtml(tk('smart.nothing'))}</option>` + all.map(({ device, action }) =>
    `<option value="${escapeHtml(action.id)}">${escapeHtml(device.icon + ' ' + device.name + ': ' + action.label)}</option>`).join('');
  const autoHit = smartActionById(pendingSmartAuto.action);
  let autoHint = '';
  if (autoHit) {
    if (smartSystem(autoHit.device) === 'ha') {
      autoHint = escapeHtml(tk('smart.autoHintHa', { extra: '' })) + (smartStatus && smartStatus.ha && !smartStatus.ha.verbunden ? ` <span class="sh-missing">${escapeHtml(tk('smart.haNotConnected'))}</span>` : '');
    } else {
      autoHint = escapeHtml(tk('smart.autoHintApple', { extra: '' })) + (smartStatus && !smartStatus.aktiv ? ` <span class="sh-missing">${escapeHtml(tk('smart.appleAutoNotSet'))}</span>` : '');
    }
    autoHint += ' ' + escapeHtml(tk('smart.autoHintQueue'));
  }
  wrap.innerHTML = `
    <p class="text-[11px] text-ink/50 mb-1.5">${escapeHtml(tk('smart.startButtons'))}</p>
    <div class="flex gap-1.5 flex-wrap mb-3">${chips}</div>
    <label class="block text-[11px] text-ink/50 mb-1">${escapeHtml(tk('smart.onCheckOff'))}</label>
    <select class="smart-done-select w-full rounded-lg border border-ink/15 px-3 py-2 text-sm bg-white mb-3">${options}</select>
    <label class="block text-[11px] text-ink/50 mb-1">${escapeHtml(tk('smart.autoStart'))}</label>
    <div class="flex items-center gap-2">
      <select class="smart-auto-select flex-1 min-w-0 rounded-lg border border-ink/15 px-3 py-2 text-sm bg-white">${options}</select>
      <input type="time" class="smart-auto-time ${autoHit ? '' : 'hidden'} w-28 shrink-0 rounded-lg border border-ink/15 px-2 py-2 text-base" aria-label="${escapeHtml(tk('smart.time'))}" />
    </div>
    <label class="smart-auto-done ${autoHit ? 'flex' : 'hidden'} items-center gap-2 text-xs text-ink/60 mt-2 cursor-pointer">
      <input type="checkbox" class="w-4 h-4" ${pendingSmartAuto.abhaken ? 'checked' : ''} /> ${escapeHtml(tk('smart.autoCheckOff'))}
    </label>
    ${autoHint ? `<p class="text-[11px] text-ink/40 mt-1.5">${autoHint}</p>` : ''}
    ${all.some(x => !smartHitReady(x)) ? `<p class="text-[11px] sh-missing mt-1.5">${escapeHtml(tk('smart.missingLegend'))}</p>` : ''}`;
  const sel = wrap.querySelector('.smart-done-select');
  sel.value = pendingSmartDone;
  sel.addEventListener('change', () => { pendingSmartDone = sel.value; });
  const autoSel = wrap.querySelector('.smart-auto-select');
  const autoTime = wrap.querySelector('.smart-auto-time');
  autoSel.value = pendingSmartAuto.action;
  autoTime.value = pendingSmartAuto.time;
  autoSel.addEventListener('change', () => { pendingSmartAuto.action = autoSel.value; renderSmartLinkPicker(); });
  autoTime.addEventListener('change', () => { if (autoTime.value) pendingSmartAuto.time = autoTime.value; });
  wrap.querySelector('.smart-auto-done input').addEventListener('change', (e) => { pendingSmartAuto.abhaken = e.target.checked; });
  wrap.querySelectorAll('.sh-chip').forEach(chip => chip.addEventListener('click', () => {
    const id = chip.dataset.id;
    pendingSmartStart = pendingSmartStart.includes(id) ? pendingSmartStart.filter(x => x !== id) : [...pendingSmartStart, id];
    renderSmartLinkPicker();
  }));
}
// After editing the devices: refresh the open cleaning/bin selection
function refreshOpenSmartPicker() {
  const open = ['roomScheduleModal', 'trashBinModal'].some(id => !document.getElementById(id).classList.contains('hidden'));
  if (!open) return;
  pendingSmartStart = pendingSmartStart.filter(id => smartActionById(id));
  if (!smartActionById(pendingSmartDone)) pendingSmartDone = '';
  if (!smartActionById(pendingSmartAuto.action)) pendingSmartAuto.action = '';
  renderSmartLinkPicker();
}
// Remove references to deleted actions from cleaning tasks and bins
function stripSmartRefs() {
  try { if (typeof hsStripSmartRefs === 'function') hsStripSmartRefs(); } catch (e) { /* ignore */ }
  [...roomSchedules, ...trashBins].forEach(r => {
    if (!r.smart) return;
    const auto = r.smart.auto && smartActionById(r.smart.auto.action) ? r.smart.auto : null;
    r.smart = {
      start: (r.smart.start || []).filter(id => smartActionById(id)),
      done: smartActionById(r.smart.done) ? r.smart.done : '',
      auto,
    };
  });
}

/* ---------- Status from the server (Apple automation + Home Assistant) ---------- */
let smartStatus = null;
async function loadSmartStatus() {
  try {
    const res = await apiFetch('/api/pinn/smart/status');
    smartStatus = res.ok ? await res.json() : { aktiv: false, ha: { verbunden: false }, error: tk('smart.noAnswer') };
  } catch (e) {
    smartStatus = { aktiv: false, ha: { verbunden: false }, offline: true };
  }
  try { if (typeof hsSmartMergePlants === 'function') hsSmartMergePlants(smartStatus); } catch (e) { /* ignore */ }
  return smartStatus;
}
function smartServerProblemHtml(st) {
  if (!st || !(st.offline || st.error)) return '';
  return `<p class="text-xs text-ink/50 mb-3">${st.error ? tk('smart.serverProblemErr', { error: escapeHtml(st.error) }) : tk('smart.serverProblem')}</p>`;
}
function smartBusyHtml(st) {
  if (!st) return '';
  const rows = Object.entries(st.belegt || {}).map(([id, b]) => {
    const d = smartDevices.find(x => x.id === id);
    if (!d || !b) return '';
    const until = b.bis > Date.now() ? tk('smart.busyUntil', { time: new Date(b.bis).toLocaleTimeString(sysLocale(), { hour: '2-digit', minute: '2-digit' }) }) : (b.status ? tk('smart.busyStatus') : '');
    return `<p class="text-[11px] text-ink/60 mb-1">${escapeHtml(tk('smart.busy', { icon: d.icon, device: d.name, until, extra: b.aktion ? ' (' + b.aktion + ')' : '' }))}</p>`;
  }).join('');
  const waiting = (st.wartend || []).map(w => `<p class="text-[11px] text-ink/50 mb-1">${escapeHtml(tk('smart.waiting', { action: w.aktion }))}${w.aufgabe ? ' – ' + escapeHtml(w.aufgabe) : ''}</p>`).join('');
  return rows || waiting ? `<div class="mb-3">${rows}${waiting}</div>` : '';
}

/* ---------- Popup: tabs ---------- */
let smartHomeTab = 'geraete';
function setSmartHomeTab(tab) {
  smartHomeTab = ['geraete', 'apple', 'ha'].includes(tab) ? tab : 'geraete';
  document.querySelectorAll('#smartHomeTabs [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === smartHomeTab));
  ['geraete', 'apple', 'ha'].forEach(t => document.getElementById('smartPanel_' + t).classList.toggle('hidden', t !== smartHomeTab));
  renderSmartHomePanels();
}
function renderSmartHomePanels() {
  if (smartHomeTab === 'geraete') renderSmartDeviceList();
  if (smartHomeTab === 'apple') renderSmartAutoSection();
  if (smartHomeTab === 'ha') renderSmartHaSection();
}
document.querySelectorAll('#smartHomeTabs [data-tab]').forEach(b => b.addEventListener('click', () => setSmartHomeTab(b.dataset.tab)));

/* ---------- Tab "Devices" ---------- */
function renderSmartDeviceList() {
  const list = document.getElementById('smartDeviceList');
  if (!smartDevices.length) {
    list.innerHTML = `<p class="text-xs text-ink/40 italic">${escapeHtml(tk('smart.noDevices'))}</p>`;
  } else {
    list.innerHTML = smartDevices.map(d => {
      const missing = d.actions.filter(a => !smartHitReady({ device: d, action: a })).length;
      const usage = [...roomSchedules, ...trashBins].filter(r => r.smart && ((r.smart.start || []).some(id => d.actions.some(a => a.id === id)) || d.actions.some(a => a.id === r.smart.done || (r.smart.auto && a.id === r.smart.auto.action)))).length;
      const sys = SMART_SYSTEMS.find(x => x.id === smartSystem(d));
      return `<button type="button" class="smart-device-row flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl border border-ink/10 hover:border-pine transition" data-id="${escapeHtml(d.id)}">
        <span class="text-2xl shrink-0">${escapeHtml(d.icon)}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${escapeHtml(d.name)} <span class="text-[10px] font-normal text-ink/40">· ${escapeHtml(sys.short)}</span></span>
          <span class="block text-[11px] text-ink/50 truncate">${d.actions.length ? d.actions.map(a => escapeHtml(a.label) + (a.minutes ? ' (' + escapeHtml(tk('smart.minutes', { n: a.minutes })) + ')' : '')).join(', ') : escapeHtml(tk('smart.noActions'))}</span>
          <span class="block text-[11px] ${missing ? 'sh-missing' : 'text-ink/40'}">${escapeHtml(missing ? tk('smart.notReadyN', { n: missing }) : (usage ? tk('smart.linkedInRules', { n: usage }) : tk('smart.notLinked')))}</span>
        </span>
        <span class="text-ink/30 shrink-0">›</span>
      </button>`;
    }).join('');
    list.querySelectorAll('.smart-device-row').forEach(btn => btn.addEventListener('click', () => openSmartDeviceModal(btn.dataset.id)));
  }
}

/* ---------- Tab "Apple Shortcuts": automation ---------- */
function smartAutoUrl() {
  return smartStatus && smartStatus.token ? location.origin + '/api/pinn/smart/automatik?token=' + smartStatus.token : '';
}
// Room order as on the household page (decides the queue at the same time)
function smartRuleOrder(r) {
  const idx = rooms.findIndex(x => x.id === r.roomId);
  return (idx < 0 ? 999 : idx) * 1000;
}
function smartHmToMin(hm) { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; }
function smartMinToHm(min) { return pad2(Math.floor(min / 60) % 24) + ':' + pad2(min % 60); }
// All times at which the shortcut "pinn Automatik" has to query (Apple devices only) - incl.
// follow-up times when a device is busy for a duration. For each device all combinations of due rules
// are played through (like the server).
function smartAutoTimes() {
  const times = new Set();
  const byDevice = new Map();
  [...roomSchedules, ...trashBins].forEach(r => {
    const auto = r.smart && r.smart.auto;
    const hit = auto && auto.time ? smartActionById(auto.action) : null;
    if (!hit || smartSystem(hit.device) !== 'shortcut') return;
    times.add(auto.time);
    if (!byDevice.has(hit.device.id)) byDevice.set(hit.device.id, []);
    byDevice.get(hit.device.id).push({ start: smartHmToMin(auto.time), min: smartMinutes(hit.action.minutes), order: smartRuleOrder(r) });
  });
  byDevice.forEach(list => {
    list.sort((a, b) => a.start - b.start || a.order - b.order);
    const n = Math.min(list.length, 10);
    for (let mask = 1; mask < (1 << n); mask++) {
      let free = 0;
      for (let i = 0; i < n; i++) {
        if (!(mask & (1 << i))) continue;
        const begin = Math.max(list[i].start, free);
        if (begin < 24 * 60) times.add(smartMinToHm(begin));
        free = list[i].min ? begin + list[i].min : free;
      }
    }
  });
  return [...times].sort();
}
function renderSmartAutoSection() {
  const box = document.getElementById('smartAutoSection');
  if (!box) return;
  const st = smartStatus;
  if (!st) { box.innerHTML = `<p class="text-xs text-ink/40">${escapeHtml(tk('common.loading'))}</p>`; return; }
  if (st.gesperrt) { box.innerHTML = `<p class="text-xs text-ink/40">${escapeHtml(tk('smart.notForGuests'))}</p>`; return; }
  if (st.offline || st.error) { box.innerHTML = smartServerProblemHtml(st); return; }
  if (!st.aktiv) {
    box.innerHTML = `<p class="text-xs text-ink/60 mb-3">${escapeHtml(tk('smart.autoIntro'))}</p>
      <button type="button" id="smartAutoSetupBtn" class="px-3 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90 transition">${escapeHtml(tk('smart.autoSetup'))}</button>`;
    box.querySelector('#smartAutoSetupBtn').addEventListener('click', () => smartAutoAction('einrichten'));
    return;
  }
  const times = smartAutoTimes();
  const last = st.abruf ? new Date(st.abruf) : null;
  const lastTxt = last ? tk('cal.timeAt', { time: last.toLocaleString(sysLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }) + (st.abrufAnzahl ? ' · ' + tk('smart.startedN', { n: st.abrufAnzahl }) : '') : tk('smart.never');
  box.innerHTML = `
    <p class="text-[11px] text-ink/50 mb-1">${escapeHtml(tk('smart.autoLinkSecret'))}</p>
    <div class="flex items-center gap-2 mb-2">
      <input id="smartAutoUrlField" type="text" readonly value="${escapeHtml(smartAutoUrl())}" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs bg-ink/5" aria-label="${escapeHtml(tk('smart.autoLink'))}" />
      <button type="button" id="smartAutoCopyBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition shrink-0">${escapeHtml(tk('common.copy'))}</button>
    </div>
    <p class="text-[11px] text-ink/50 mb-3">${escapeHtml(tk('smart.lastFetched', { when: lastTxt }))}</p>
    ${smartBusyHtml(st)}
    <p class="text-xs font-medium mb-1">${escapeHtml(tk('smart.autoTimes'))} <span class="font-normal text-ink/40">${escapeHtml(tk('smart.autoTimesHint'))}</span></p>
    <p class="text-xs mb-3 ${times.length ? 'text-ink/70' : 'text-ink/40 italic'}">${escapeHtml(times.length ? times.map(t => tk('cal.timeAt', { time: t })).join(', ') : tk('smart.noAutoTimes'))}</p>
    <div class="rounded-xl bg-ink/5 p-3 mb-3">
      <p class="text-xs font-medium mb-1">${escapeHtml(tk('smart.onceInShortcuts'))}</p>
      <p class="text-[11px] text-ink/60 leading-relaxed">
        ${escapeHtml(tk('smart.guide1'))}<br>
        &nbsp;&nbsp;${escapeHtml(tk('smart.guide2'))}<br>
        &nbsp;&nbsp;${escapeHtml(tk('smart.guide3'))}<br>
        &nbsp;&nbsp;${escapeHtml(tk('smart.guide4'))}<br>
        &nbsp;&nbsp;&nbsp;&nbsp;${escapeHtml(tk('smart.guide5'))}<br>
        &nbsp;&nbsp;&nbsp;&nbsp;${escapeHtml(tk('smart.guide6'))}<br>
        &nbsp;&nbsp;&nbsp;&nbsp;${escapeHtml(tk('smart.guide7'))}<br>
        ${escapeHtml(tk('smart.guide8'))}<br>
        ${escapeHtml(tk('smart.guide9'))}<br>
        ${escapeHtml(tk('smart.guide10'))}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" id="smartAutoTestBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition">${escapeHtml(tk('smart.testShortcut'))}</button>
      <button type="button" id="smartAutoRenewBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition">${escapeHtml(tk('smart.newLink'))}</button>
      <button type="button" id="smartAutoOffBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-red-600 hover:bg-red-50 transition">${escapeHtml(tk('smart.turnOff'))}</button>
    </div>`;
  box.querySelector('#smartAutoCopyBtn').addEventListener('click', async (e) => {
    const field = box.querySelector('#smartAutoUrlField');
    try { await navigator.clipboard.writeText(field.value); }
    catch (err) { field.select(); try { document.execCommand('copy'); } catch (e2) { /* ignore */ } }
    e.target.textContent = tk('smart.copiedCheck');
    setTimeout(() => { if (e.target.isConnected) e.target.textContent = tk('common.copy'); }, 1800);
  });
  box.querySelector('#smartAutoTestBtn').addEventListener('click', () => {
    if (!smartShortcutsAvailable()) { alert(tk('smart.appleOnly')); return; }
    runSmartShortcut({ shortcut: 'pinn Automatik' }, '');
  });
  box.querySelector('#smartAutoRenewBtn').addEventListener('click', () => {
    if (confirm(tk('smart.confirmNewLink'))) smartAutoAction('einrichten');
  });
  box.querySelector('#smartAutoOffBtn').addEventListener('click', () => {
    if (confirm(tk('smart.confirmAutoOff'))) smartAutoAction('ausschalten');
  });
}
async function smartPost(path, body) {
  const res = await apiFetch('/api/pinn/smart/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.error) throw new Error(out.error || tk('smart.serverNoAnswer'));
  return out;
}
async function smartAutoAction(what) {
  const box = document.getElementById('smartAutoSection');
  box.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try { smartStatus = await smartPost(what); }
  catch (e) { alert(tk('smart.failedMsg', { error: e.message })); }
  renderSmartAutoSection();
  renderSettingsSmartStatus();
}

/* ---------- Tab "Home Assistant" ---------- */
let smartHaEditing = false;
function renderSmartHaSection() {
  const box = document.getElementById('smartHaSection');
  if (!box) return;
  const st = smartStatus;
  if (!st) { box.innerHTML = `<p class="text-xs text-ink/40">${escapeHtml(tk('common.loading'))}</p>`; return; }
  if (st.gesperrt) { box.innerHTML = `<p class="text-xs text-ink/40">${escapeHtml(tk('smart.notForGuests'))}</p>`; return; }
  if (st.offline || st.error) { box.innerHTML = smartServerProblemHtml(st); return; }
  const ha = st.ha || { verbunden: false };
  if (!ha.verbunden || smartHaEditing) {
    box.innerHTML = `
      <p class="text-xs text-ink/60 mb-3">${escapeHtml(tk('smart.haIntro'))}</p>
      <label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="smartHaUrl">${escapeHtml(tk('smart.haAddress'))}</label>
      <input id="smartHaUrl" type="text" inputmode="url" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" placeholder="${escapeHtml(tk('smart.haAddressPh'))}" value="${escapeHtml(ha.url || '')}" class="w-full rounded-lg border border-ink/15 px-3 py-2 text-base mb-1" />
      <p class="text-[11px] text-ink/40 mb-3">${escapeHtml(tk('smart.haAddressHint'))}</p>
      <label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="smartHaToken">${escapeHtml(tk('smart.haToken'))}</label>
      <input id="smartHaToken" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="${escapeHtml(ha.verbunden ? tk('smart.haTokenKeep') : tk('smart.haTokenPaste'))}" class="w-full rounded-lg border border-ink/15 px-3 py-2 text-base mb-1" />
      <p class="text-[11px] text-ink/40 mb-3">${escapeHtml(tk('smart.haTokenHint'))}</p>
      <p id="smartHaStatus" class="text-xs text-red-600 mb-2"></p>
      <div class="flex justify-end gap-2">
        ${ha.verbunden ? `<button type="button" id="smartHaCancelBtn" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink">${escapeHtml(tk('common.cancel'))}</button>` : ''}
        <button type="button" id="smartHaConnectBtn" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90 transition">${escapeHtml(tk('smart.haConnect'))}</button>
      </div>`;
    const cancel = box.querySelector('#smartHaCancelBtn');
    if (cancel) cancel.addEventListener('click', () => { smartHaEditing = false; renderSmartHaSection(); });
    box.querySelector('#smartHaConnectBtn').addEventListener('click', async (e) => {
      const status = box.querySelector('#smartHaStatus');
      const url = box.querySelector('#smartHaUrl').value.trim();
      const token = box.querySelector('#smartHaToken').value.trim();
      if (!url) { status.textContent = tk('smart.haNeedAddress'); return; }
      e.target.disabled = true;
      e.target.textContent = tk('smart.haSearching');
      status.textContent = '';
      try {
        smartStatus = await smartPost('ha/verbinden', { url, token });
        smartHaEditing = false;
        smartHaEntities = null;
        renderSmartHaSection();
        renderSettingsSmartStatus();
      } catch (err) {
        status.textContent = err.message;
        e.target.disabled = false;
        e.target.textContent = tk('smart.haConnect');
      }
    });
    return;
  }
  const lauf = ha.lauf ? tk('cal.timeAt', { time: new Date(ha.lauf).toLocaleString(sysLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }) + (ha.laufInfo ? ' – ' + ha.laufInfo : '') : '';
  const fehler = ha.fehler && ha.fehler.at && Date.now() - Date.parse(ha.fehler.at) < 24 * 3600000 ? ha.fehler : null;
  const haDevices = smartDevices.filter(d => smartSystem(d) === 'ha');
  box.innerHTML = `
    <div class="flex items-start gap-3 rounded-xl border border-ink/10 px-3 py-2.5 mb-3">
      <span class="text-xl shrink-0">🏠</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">${escapeHtml(ha.ort ? tk('smart.haConnectedTo', { place: ha.ort }) : tk('smart.haConnected'))}</p>
        <p class="text-[11px] text-ink/50 truncate">${escapeHtml(ha.url)}${ha.version ? ' · ' + escapeHtml(tk('smart.version', { version: ha.version })) : ''}</p>
      </div>
    </div>
    ${lauf ? `<p class="text-[11px] text-ink/50 mb-2">${escapeHtml(tk('smart.lastAutoRun', { when: lauf }))}</p>` : ''}
    ${fehler ? `<p class="text-[11px] text-red-600 mb-2">${escapeHtml(tk('smart.errorAt', { time: new Date(fehler.at).toLocaleTimeString(sysLocale(), { hour: '2-digit', minute: '2-digit' }), error: fehler.text }))}</p>` : ''}
    ${smartBusyHtml(st)}
    <p class="text-xs mb-3 ${haDevices.length ? 'text-ink/60' : 'text-ink/40 italic'}">${escapeHtml(haDevices.length ? tk('smart.haDevices', { list: haDevices.map(d => d.icon + ' ' + d.name).join(', ') }) : tk('smart.haNoDevices'))}</p>
    <div class="rounded-xl bg-ink/5 p-3 mb-3">
      <p class="text-xs font-medium mb-1">${escapeHtml(tk('smart.tips'))}</p>
      <p class="text-[11px] text-ink/60 leading-relaxed">
        • ${escapeHtml(tk('smart.haTip1'))}<br>
        • ${escapeHtml(tk('smart.haTip2'))}<br>
        • ${tk('smart.haTip3')}<br>
        • ${escapeHtml(tk('smart.haTip4'))}<br>
        • ${escapeHtml(tk('smart.haTip5'))}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" id="smartHaEditBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition">${escapeHtml(tk('smart.haChange'))}</button>
      <button type="button" id="smartHaOffBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-red-600 hover:bg-red-50 transition">${escapeHtml(tk('common.disconnect'))}</button>
    </div>`;
  box.querySelector('#smartHaEditBtn').addEventListener('click', () => { smartHaEditing = true; renderSmartHaSection(); });
  box.querySelector('#smartHaOffBtn').addEventListener('click', async () => {
    if (!confirm(tk('smart.confirmHaOff'))) return;
    try { smartStatus = await smartPost('ha/trennen'); } catch (e) { alert(tk('smart.failedMsg', { error: e.message })); }
    smartHaEntities = null;
    renderSmartHaSection();
    renderSettingsSmartStatus();
  });
}

// Entities from Home Assistant (for the choice in the device popup)
let smartHaEntities = null; // [{ id, name, domain, state }]
let smartHaEntitiesError = '';
async function loadSmartHaEntities(force) {
  if (smartHaEntities && !force) return smartHaEntities;
  smartHaEntitiesError = '';
  try {
    const res = await apiFetch('/api/pinn/smart/ha/entitaeten');
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error || tk('smart.serverNoAnswer'));
    smartHaEntities = Array.isArray(body.entitaeten) ? body.entitaeten : [];
  } catch (e) {
    smartHaEntitiesError = e.message;
    smartHaEntities = null;
  }
  return smartHaEntities;
}
// emptyLabel: text of the empty first option (default: "– choose entity –")
function haEntityOptions(selected, filterDomains, emptyLabel) {
  const list = (smartHaEntities || []).filter(e => !filterDomains || filterDomains.includes(e.domain));
  const groups = new Map();
  list.forEach(e => { if (!groups.has(e.domain)) groups.set(e.domain, []); groups.get(e.domain).push(e); });
  let html = `<option value="">${escapeHtml(emptyLabel || tk('smart.pickEntity'))}</option>`;
  if (selected && !list.some(e => e.id === selected)) html += `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`;
  groups.forEach((items, domain) => {
    html += `<optgroup label="${escapeHtml(haDomainLabel(domain))}">` +
      items.map(e => `<option value="${escapeHtml(e.id)}"${e.id === selected ? ' selected' : ''}>${escapeHtml(e.name)}</option>`).join('') + '</optgroup>';
  });
  return html;
}

/* ---------- Open/close popup ---------- */
async function openSmartHomeModal(tab) {
  document.getElementById('smartHomeModal').classList.remove('hidden');
  setSmartHomeTab(typeof tab === 'string' ? tab : smartHomeTab);
  await loadSmartStatus();
  renderSmartHomePanels();
}
function closeSmartHomeModal() {
  document.getElementById('smartHomeModal').classList.add('hidden');
  smartHaEditing = false;
  refreshOpenSmartPicker();
  renderSettingsSmartStatus();
}
document.getElementById('openSmartHomeBtn').addEventListener('click', () => openSmartHomeModal('geraete'));
document.getElementById('closeSmartHomeBtn').addEventListener('click', closeSmartHomeModal);
document.getElementById('doneSmartHomeBtn').addEventListener('click', closeSmartHomeModal);
document.getElementById('smartHomeModal').addEventListener('click', (e) => { if (e.target.id === 'smartHomeModal') closeSmartHomeModal(); });
document.getElementById('addSmartDeviceBtn').addEventListener('click', () => openSmartDeviceModal(null));


/* ---------- Settings → Smart home ---------- */
function renderSettingsSmartStatus() {
  const el = document.getElementById('settingsSmartStatus');
  if (!el) return;
  const st = smartStatus;
  const n = smartDevices.length;
  const parts = [n ? tk('smart.devicesN', { n }) : tk('smart.noDevicesShort')];
  if (st && !st.offline && !st.error) {
    parts.push(st.aktiv ? tk('smart.appleAutoOn') : tk('smart.appleAutoOff'));
    parts.push(st.ha && st.ha.verbunden ? tk('smart.haOn') : tk('smart.haOff'));
  }
  el.textContent = parts.join(' · ');
}
document.querySelectorAll('#settingsSmartHomeAccordion [data-smart-open]').forEach(btn =>
  btn.addEventListener('click', () => openSmartHomeModal(btn.dataset.smartOpen)));
document.getElementById('settingsSmartHomeAccordion').addEventListener('toggle', async (e) => {
  if (!e.target.open) return;
  renderSettingsSmartStatus();
  await loadSmartStatus();
  renderSettingsSmartStatus();
});

/* ---------- Create / edit device ---------- */
let editingSmartDeviceId = null;
let smartEditType = 'sauger';
let smartEditIcon = '🤖';
let smartEditSystem = 'shortcut';
let smartEditStatusEntity = '';
let smartEditActions = []; // [{ id, label, minutes, shortcut, ha }]

function smartHexToRgb(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
function smartReadActionInputs() {
  const statusSel = document.getElementById('smartDeviceStatusEntity');
  if (statusSel) smartEditStatusEntity = statusSel.value;
  document.querySelectorAll('#smartDeviceActions [data-aid]').forEach(row => {
    const a = smartEditActions.find(x => x.id === row.dataset.aid);
    if (!a) return;
    const val = (f) => { const el = row.querySelector(`[data-field="${f}"]`); return el ? el.value : null; };
    a.label = (val('label') || '').trim();
    a.minutes = smartMinutes(val('minutes'));
    if (val('shortcut') !== null) a.shortcut = val('shortcut').trim();
    if (!a.ha) a.ha = normalizeSmartHa(null);
    if (val('entity') !== null) a.ha.entity = val('entity');
    if (val('service') !== null) a.ha.service = val('service');
    if (val('dataText') !== null) a.ha.dataText = val('dataText');
    const colorOn = row.querySelector('[data-field="colorOn"]');
    if (colorOn) a.ha.color = colorOn.checked ? (val('color') || '#ff0000') : '';
    if (val('brightness') !== null) a.ha.brightness = Math.min(100, smartMinutes(val('brightness')));
    const offEl = row.querySelector('[data-field="offAfter"]');
    if (offEl) a.ha.offAfter = offEl.checked;
    if (val('fan') !== null) a.ha.fan = val('fan');
    if (val('water') !== null) a.ha.water = val('water');
    if (val('mopMode') !== null) a.ha.mopMode = val('mopMode');
    if (val('repeat') !== null) a.ha.repeat = Math.min(3, Math.max(1, parseInt(val('repeat'), 10) || 1));
    if (val('roomIds') !== null) {
      const ids = val('roomIds').split(/[^0-9]+/).map(n => parseInt(n, 10)).filter(n => n > 0);
      a.ha.rooms = ids.length ? ids : 'task';
    }
  });
}
// Services for an entity (domain from the ID)
function smartServicesFor(entity) {
  const domain = String(entity || '').split('.')[0];
  return (HA_SERVICES[domain] || ['turn_on', 'turn_off']).map(s => ({ id: domain + '.' + s, label: haServiceLabel(domain, s) }));
}
// Build the data for Home Assistant from the JSON field + colour/brightness. Throws on invalid JSON.
function smartComposeHaData(ha) {
  let data = {};
  const txt = String(ha.dataText || '').trim();
  if (txt) {
    data = JSON.parse(txt);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(tk('smart.jsonObject'));
  }
  if (/^light\.turn_on$/.test(ha.service || '')) {
    const rgb = smartHexToRgb(ha.color);
    if (rgb) data.rgb_color = rgb;
    if (ha.brightness) data.brightness_pct = ha.brightness;
  }
  return data;
}
// Suggested actions of a device type (robot vacuum via Home Assistant: straight away as room cleaning)
function smartDefaultActions(typeId, system) {
  const type = SMART_DEVICE_TYPES.find(t => t.id === typeId) || SMART_DEVICE_TYPES[0];
  return type.actions.map(s => smartNewAction(tk(s.key), typeId, system, s));
}
// spec (suggested actions only): robot vacuum mode and mower service, otherwise guessed from the name
function smartNewAction(label, typeId, system, spec) {
  const ha = normalizeSmartHa(null);
  if (typeId === 'sauger' && system === 'ha') { ha.kind = 'segments'; ha.mode = spec && spec.mode ? spec.mode : smartVacModeOf(label); }
  if (typeId === 'maeher' && spec && spec.mower) ha.mowerService = spec.mower;
  if (typeId === 'bewaesserung') ha.offAfter = true;
  return { id: smartNewId('sa'), label: label || '', shortcut: '', minutes: typeId === 'bewaesserung' ? 15 : 0, ha };
}
function smartActionsConfigured() {
  // Mower defaults filled in automatically (1.62) do not count as "set up by hand"
  return smartEditActions.some(a => a.shortcut || (a.ha && a.ha.entity && !(a.ha.entity === smartEditStatusEntity && /^lawn_mower\./.test(a.ha.service || ''))));
}
function renderSmartSystemPicker() {
  const wrap = document.getElementById('smartDeviceSystemPicker');
  const haOk = !!(smartStatus && smartStatus.ha && smartStatus.ha.verbunden);
  wrap.innerHTML = SMART_SYSTEMS.map(s => `<button type="button" class="sh-chip${s.id === smartEditSystem ? ' active' : ''}" data-system="${s.id}">${s.id === 'ha' ? '🏠' : '📱'} ${escapeHtml(s.label)}</button>`).join('') +
    (smartEditSystem === 'ha' && !haOk ? `<p class="w-full text-[11px] sh-missing mt-1">${escapeHtml(tk('smart.haConnectFirst'))}</p>` : '') +
    (smartEditSystem === 'shortcut' ? `<p class="w-full text-[11px] text-ink/40 mt-1">${escapeHtml(tk('smart.shortcutSystemHint'))}</p>` : '');
  wrap.querySelectorAll('[data-system]').forEach(btn => btn.addEventListener('click', async () => {
    smartReadActionInputs();
    smartEditSystem = btn.dataset.system;
    if (!smartActionsConfigured()) smartEditActions = smartDefaultActions(smartEditType, smartEditSystem);
    renderSmartSystemPicker();
    renderSmartActionEditor();
    if (smartEditSystem === 'ha' && !smartHaEntities) { await loadSmartHaEntities(); renderSmartActionEditor(); }
  }));
}
function renderSmartTypePicker() {
  const wrap = document.getElementById('smartDeviceTypePicker');
  wrap.innerHTML = SMART_DEVICE_TYPES.map(t => `<button type="button" class="sh-chip${t.id === smartEditType ? ' active' : ''}" data-type="${t.id}">${t.icon} ${escapeHtml(t.label)}</button>`).join('');
  wrap.querySelectorAll('[data-type]').forEach(btn => btn.addEventListener('click', () => {
    smartReadActionInputs();
    const prevType = SMART_DEVICE_TYPES.find(t => t.id === smartEditType);
    const type = SMART_DEVICE_TYPES.find(t => t.id === btn.dataset.type);
    smartEditType = type.id;
    const notSetUp = !smartActionsConfigured();
    // 1.62: a robot (vacuum/mower) as status only fits its own device type
    if (/^(vacuum|lawn_mower)\./.test(smartEditStatusEntity) && !['sauger', 'maeher'].includes(type.id)) smartEditStatusEntity = '';
    // Change the icon along with it as long as it is still the default icon of the previous type
    if (!prevType || smartEditIcon === prevType.icon) smartEditIcon = type.icon;
    // Suggest actions as long as nothing has been set up yet
    if (notSetUp) smartEditActions = smartDefaultActions(type.id, smartEditSystem);
    const nameInput = document.getElementById('smartDeviceName');
    const cur = nameInput.value.trim();
    if (!cur || SMART_DEVICE_TYPES.some(t => t.label === cur || t.de === cur || i18nT(t.de) === cur)) nameInput.value = type.label;
    renderSmartTypePicker();
    renderSmartIconPicker();
    renderSmartActionEditor();
  }));
}
function renderSmartIconPicker() {
  const wrap = document.getElementById('smartDeviceIconPicker');
  const icons = SMART_ICONS.includes(smartEditIcon) ? SMART_ICONS : [smartEditIcon, ...SMART_ICONS];
  wrap.innerHTML = icons.map(i => `<button type="button" class="sh-icon${i === smartEditIcon ? ' active' : ''}" data-icon="${i}" aria-label="${escapeHtml(tk('smart.symbolN', { icon: i }))}">${i}</button>`).join('');
  wrap.querySelectorAll('[data-icon]').forEach(btn => btn.addEventListener('click', () => {
    smartEditIcon = btn.dataset.icon;
    renderSmartIconPicker();
  }));
}
function smartActionTargetHtml(a) {
  if (smartEditSystem === 'shortcut') {
    return `<div class="flex items-center gap-2">
        <input data-field="shortcut" type="text" maxlength="80" enterkeyhint="done" autocomplete="off" autocorrect="off" spellcheck="false" value="${escapeHtml(a.shortcut || '')}" placeholder="${escapeHtml(tk('smart.shortcutName'))}" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-base" aria-label="${escapeHtml(tk('smart.shortcutName'))}" />
        <button type="button" data-act="test" class="sh-run shrink-0" title="${escapeHtml(tk('smart.testShortcut'))}">${escapeHtml(tk('smart.testBtn'))}</button>
      </div>`;
  }
  if (!a.ha) a.ha = normalizeSmartHa(null);
  if (smartEditType === 'sauger') {
    const kindChips = `<div class="flex flex-wrap gap-1.5 mb-2">
      <button type="button" class="sh-chip${a.ha.kind === 'segments' ? ' active' : ''}" data-kind="segments">${escapeHtml(tk('smart.roomCleaning'))}</button>
      <button type="button" class="sh-chip${a.ha.kind !== 'segments' ? ' active' : ''}" data-kind="">${escapeHtml(tk('smart.entityButton'))}</button>
    </div>`;
    return kindChips + (a.ha.kind === 'segments' ? smartVacActionHtml(a) : smartHaGenericHtml(a));
  }
  return smartHaGenericHtml(a);
}
// Current state of the chosen robot vacuum (rooms, suction levels, water amount …)
function smartVacCurrent() {
  return smartVacInfo && smartVacInfo.entity === smartEditStatusEntity && !smartVacInfo.error ? smartVacInfo : null;
}
function smartVacRoomList(a) {
  const info = smartVacCurrent();
  if (info && info.raeume && info.raeume.length) return info.raeume;
  const map = (a && a.ha && a.ha.roomMap) || {};
  return Object.keys(map).map(k => ({ id: parseInt(k, 10), name: map[k], map: '' }));
}
function smartVacSelect(field, label, options, value) {
  const opts = options.filter(o => o !== 'off');
  if (value && !opts.includes(value)) opts.push(value);
  return `<label class="flex items-center gap-2 text-xs text-ink/60">
      <span class="w-24 shrink-0">${escapeHtml(label)}</span>
      <select data-field="${field}" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2 py-1 text-sm bg-white">
        <option value="">${escapeHtml(tk('smart.asSet'))}</option>
        ${opts.map(o => `<option value="${escapeHtml(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(smartVacLabel(o))}</option>`).join('')}
      </select>
    </label>`;
}
function smartVacActionHtml(a) {
  const ha = a.ha;
  if (!/^vacuum\./.test(smartEditStatusEntity)) return `<p class="text-[11px] sh-missing">${escapeHtml(tk('smart.pickVacuumFirst'))}</p>`;
  const info = smartVacCurrent();
  const loading = smartVacLoading === smartEditStatusEntity;
  const list = smartVacRoomList(a);
  const multiMap = new Set(list.map(r => r.map || '')).size > 1;
  const taskMode = !Array.isArray(ha.rooms);
  let roomsHtml = `<button type="button" class="sh-chip${taskMode ? ' active' : ''}" data-room="task">${escapeHtml(tk('smart.taskRoom'))}</button>`;
  roomsHtml += list.map(r => `<button type="button" class="sh-chip${!taskMode && ha.rooms.includes(r.id) ? ' active' : ''}" data-room="${r.id}">${escapeHtml(r.name)}${multiMap && r.map ? ' <span style="opacity:.6">· ' + escapeHtml(r.map) + '</span>' : ''}</button>`).join('');
  let roomHint = '';
  if (loading && !list.length) roomHint = `<p class="text-[11px] text-ink/40 mt-1">${escapeHtml(tk('smart.roomsLoading'))}</p>`;
  else if (!list.length) {
    roomHint = `<p class="text-[11px] sh-missing mt-1">${escapeHtml((smartVacInfo && smartVacInfo.entity === smartEditStatusEntity && (smartVacInfo.raeumeFehler || smartVacInfo.error)) || tk('smart.noRooms'))}</p>
      <input data-field="roomIds" type="text" inputmode="numeric" enterkeyhint="done" autocomplete="off" value="${taskMode ? '' : escapeHtml(ha.rooms.join(', '))}" placeholder="${escapeHtml(tk('smart.roomIdsPh'))}" class="w-full mt-1 rounded-lg border border-ink/15 px-2.5 py-1.5 text-base" aria-label="${escapeHtml(tk('smart.roomIds'))}" />`;
  }
  if (taskMode && list.length) {
    const names = [...new Set(roomSchedules.map(s => (rooms.find(r => r.id === s.roomId) || {}).name).filter(Boolean))];
    const ok = names.filter(n => smartMatchVacRoom(list, n).length);
    const miss = names.filter(n => !smartMatchVacRoom(list, n).length);
    const okTxt = ok.length ? ' ' + escapeHtml(tk('smart.matches')) + ' ' + ok.map(escapeHtml).join(', ') + '.' : '';
    const missTxt = miss.length ? ` <span class="sh-missing">${escapeHtml(tk('smart.notInMap', { rooms: miss.join(', ') }))}</span> ${escapeHtml(tk('smart.notInMapHint'))}` : '';
    roomHint += `<p class="text-[11px] text-ink/50 mt-1 leading-relaxed">${tk('smart.takesTaskRoom', { matches: okTxt, missing: missTxt })}</p>`;
  }
  const fanList = info ? info.fanSpeeds || [] : [];
  const water = info && info.water ? info.water.options : [];
  const mop = info && info.mopMode ? info.mopMode.options : [];
  const settings = [];
  if (ha.mode !== 'mop' && (fanList.length || ha.fan)) settings.push(smartVacSelect('fan', tk('smart.suction'), fanList, ha.fan));
  if (ha.mode !== 'vac' && (water.length || ha.water)) settings.push(smartVacSelect('water', tk('smart.water'), water, ha.water));
  if (ha.mode !== 'vac' && (mop.length || ha.mopMode)) settings.push(smartVacSelect('mopMode', tk('smart.mopMode'), mop, ha.mopMode));
  settings.push(`<label class="flex items-center gap-2 text-xs text-ink/60">
      <span class="w-24 shrink-0">${escapeHtml(tk('smart.passes'))}</span>
      <select data-field="repeat" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2 py-1 text-sm bg-white">
        ${[1, 2, 3].map(n => `<option value="${n}" ${n === ha.repeat ? 'selected' : ''}>${n}×</option>`).join('')}
      </select>
    </label>`);
  return `
    <p class="text-[11px] uppercase tracking-wide text-ink/40 mb-1">${escapeHtml(tk('smart.rooms'))}</p>
    <div class="flex flex-wrap gap-1.5">${roomsHtml}</div>
    ${roomHint}
    <p class="text-[11px] uppercase tracking-wide text-ink/40 mt-2.5 mb-1">${escapeHtml(tk('smart.mode'))}</p>
    <div class="flex flex-wrap gap-1.5 mb-2">${SMART_VAC_MODES.map(m => `<button type="button" class="sh-chip${ha.mode === m.id ? ' active' : ''}" data-mode="${m.id}">${escapeHtml(m.label)}</button>`).join('')}</div>
    <div class="space-y-1.5 mb-2">${settings.join('')}</div>
    <div class="flex justify-end"><button type="button" data-act="test" class="sh-run shrink-0" title="${escapeHtml(tk('smart.startRobotNow'))}">${escapeHtml(tk('smart.testBtn'))}</button></div>`;
}
function smartHaGenericHtml(a) {
  const ha = a.ha || normalizeSmartHa(null);
  const services = ha.entity ? smartServicesFor(ha.entity) : [];
  const service = services.some(s => s.id === ha.service) ? ha.service : (ha.service && ha.entity && ha.service.split('.')[0] === ha.entity.split('.')[0] ? ha.service : (services[0] ? services[0].id : ''));
  ha.service = service;
  const isLight = service === 'light.turn_on';
  return `
    <select data-field="entity" class="w-full rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm bg-white mb-1.5" aria-label="${escapeHtml(tk('smart.entity'))}">${haEntityOptions(ha.entity, HA_ACTION_DOMAINS)}</select>
    <div class="flex items-center gap-2">
      <select data-field="service" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm bg-white" aria-label="${escapeHtml(tk('smart.service'))}" ${ha.entity ? '' : 'disabled'}>
        ${services.map(s => `<option value="${escapeHtml(s.id)}" ${s.id === service ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
        ${service && !services.some(s => s.id === service) ? `<option value="${escapeHtml(service)}" selected>${escapeHtml(service)}</option>` : ''}
      </select>
      <button type="button" data-act="test" class="sh-run shrink-0" title="${escapeHtml(tk('smart.runInHa'))}">${escapeHtml(tk('smart.testBtn'))}</button>
    </div>
    ${isLight ? `<div class="flex items-center gap-2 mt-1.5 text-xs text-ink/60">
      <label class="flex items-center gap-1.5 cursor-pointer"><input data-field="colorOn" type="checkbox" class="w-4 h-4" ${ha.color ? 'checked' : ''} /> ${escapeHtml(tk('smart.color'))}</label>
      <input data-field="color" type="color" value="${escapeHtml(ha.color || '#ff0000')}" class="w-9 h-8 rounded border border-ink/15 bg-white" aria-label="${escapeHtml(tk('smart.color'))}" />
      <input data-field="brightness" type="number" inputmode="numeric" min="0" max="100" value="${ha.brightness || ''}" placeholder="%" class="w-16 rounded-lg border border-ink/15 px-2 py-1 text-base" aria-label="${escapeHtml(tk('smart.brightnessPct'))}" />
      <span>${escapeHtml(tk('smart.brightness'))}</span>
    </div>` : ''}
    ${smartOffServiceFor(service) ? `<label class="flex items-center gap-2 mt-1.5 text-xs text-ink/60 cursor-pointer"><input data-field="offAfter" type="checkbox" class="w-4 h-4" ${ha.offAfter ? 'checked' : ''} /> <span>${escapeHtml(tk('smart.offAfter'))}</span></label>` : ''}
    <details class="mt-1.5"${ha.dataText ? ' open' : ''}>
      <summary class="text-[11px] text-ink/40 cursor-pointer">${escapeHtml(tk('smart.extraData'))}</summary>
      <textarea data-field="dataText" rows="2" spellcheck="false" autocapitalize="off" placeholder="${escapeHtml(tk('smart.extraDataPh'))}" class="w-full mt-1 rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm font-mono">${escapeHtml(ha.dataText || '')}</textarea>
    </details>`;
}
function renderSmartActionEditor() {
  const wrap = document.getElementById('smartDeviceActions');
  const statusWrap = document.getElementById('smartDeviceStatusWrap');
  const isVac = smartEditSystem === 'ha' && smartEditType === 'sauger';
  // Robot vacuum: if there is only one, take it right away
  if (isVac && !smartEditStatusEntity && smartHaEntities) {
    const vacs = smartHaEntities.filter(e => e.domain === 'vacuum');
    if (vacs.length === 1) smartEditStatusEntity = vacs[0].id;
  }
  if (isVac) {
    statusWrap.classList.remove('hidden');
    statusWrap.innerHTML = `
      <label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="smartDeviceStatusEntity">${escapeHtml(tk('smart.type.vacuum'))}</label>
      <select id="smartDeviceStatusEntity" class="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm bg-white mb-1">${haEntityOptions(smartEditStatusEntity, ['vacuum'], tk('smart.pickVacuum'))}</select>
      <p class="text-[11px] text-ink/40 mb-2">${escapeHtml(tk('smart.vacStatusHint'))}</p>
      <div class="mb-4">${smartVacInfoHtml()}</div>`;
  } else if (smartEditSystem === 'ha' && smartEditType === 'maeher') {
    // Mower (1.62): the mower entity is the status as well – a single one is taken right away
    if (!smartEditStatusEntity && smartHaEntities) {
      const mowers = smartHaEntities.filter(e => e.domain === 'lawn_mower');
      if (mowers.length === 1) smartEditStatusEntity = mowers[0].id;
    }
    if (/^lawn_mower\./.test(smartEditStatusEntity)) smartEditActions.forEach(a => {
      if (!a.ha) a.ha = normalizeSmartHa(null);
      if (!a.ha.entity) { a.ha.entity = smartEditStatusEntity; a.ha.service = a.ha.mowerService || smartMowerService(a.label); }
    });
    statusWrap.classList.remove('hidden');
    statusWrap.innerHTML = `
      <label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="smartDeviceStatusEntity">${escapeHtml(tk('smart.type.mower'))}</label>
      <select id="smartDeviceStatusEntity" class="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm bg-white mb-1">${haEntityOptions(smartEditStatusEntity, ['lawn_mower'], tk('smart.pickMower'))}</select>
      <p class="text-[11px] text-ink/40 mb-4">${escapeHtml(tk('smart.mowerStatusHint'))}</p>`;
  } else if (smartEditSystem === 'ha') {
    statusWrap.classList.remove('hidden');
    statusWrap.innerHTML = `
      <label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="smartDeviceStatusEntity">${escapeHtml(tk('smart.statusEntity'))} <span class="text-ink/30" style="text-transform:none;letter-spacing:normal">${escapeHtml(tk('smart.optional'))}</span></label>
      <select id="smartDeviceStatusEntity" class="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm bg-white mb-1">${haEntityOptions(smartEditStatusEntity, HA_STATUS_DOMAINS, tk('smart.durationOnly'))}</select>
      <p class="text-[11px] text-ink/40 mb-4">${escapeHtml(tk('smart.statusEntityHint'))}</p>`;
  } else {
    statusWrap.classList.add('hidden');
    statusWrap.innerHTML = '';
  }
  const statusSel = document.getElementById('smartDeviceStatusEntity');
  if (statusSel) statusSel.addEventListener('change', () => {
    smartReadActionInputs();
    renderSmartActionEditor();
  });
  const vacReload = document.getElementById('smartVacReloadBtn');
  if (vacReload) vacReload.addEventListener('click', () => smartVacLoad(smartEditStatusEntity, true));
  if (isVac && /^vacuum\./.test(smartEditStatusEntity) && smartHaEntities && smartVacLoading !== smartEditStatusEntity &&
      (!smartVacInfo || smartVacInfo.entity !== smartEditStatusEntity)) {
    smartVacLoading = smartEditStatusEntity;
    const ent = smartEditStatusEntity;
    setTimeout(() => { smartVacLoading = ''; smartVacLoad(ent, false); }, 0);
  }
  if (smartEditSystem === 'ha' && !smartHaEntities) {
    wrap.innerHTML = smartHaEntitiesError
      ? `<p class="text-xs text-red-600">${escapeHtml(tk('smart.entitiesFailed', { error: smartHaEntitiesError }))}</p><button type="button" id="smartHaRetryBtn" class="mt-2 px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition">${escapeHtml(tk('common.reload'))}</button>`
      : `<p class="text-xs text-ink/40">${escapeHtml(tk('smart.entitiesLoading'))}</p>`;
    const retry = wrap.querySelector('#smartHaRetryBtn');
    if (retry) retry.addEventListener('click', async () => { await loadSmartHaEntities(true); renderSmartActionEditor(); });
    return;
  }
  if (!smartEditActions.length) {
    wrap.innerHTML = `<p class="text-xs text-ink/40 italic">${escapeHtml(tk('smart.noAction'))}</p>`;
    return;
  }
  wrap.innerHTML = smartEditActions.map(a => `
    <div class="sh-action-row" data-aid="${escapeHtml(a.id)}">
      <div class="flex items-center gap-2 mb-1.5">
        <input data-field="label" type="text" maxlength="30" enterkeyhint="next" autocomplete="off" value="${escapeHtml(a.label)}" placeholder="${escapeHtml(tk('smart.actionPh'))}" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-base" aria-label="${escapeHtml(tk('smart.actionName'))}" />
        <input data-field="minutes" type="number" inputmode="numeric" min="0" max="600" enterkeyhint="next" value="${a.minutes ? a.minutes : ''}" placeholder="${escapeHtml(tk('smart.min'))}" class="w-16 shrink-0 rounded-lg border border-ink/15 px-2 py-1.5 text-base" aria-label="${escapeHtml(tk('smart.durationMin'))}" title="${escapeHtml(tk('smart.durationMin'))}" />
        <button type="button" data-act="remove" class="w-8 h-8 shrink-0 rounded-full text-ink/40 hover:text-red-500 hover:bg-ink/5 grid place-items-center text-lg leading-none" aria-label="${escapeHtml(tk('smart.removeAction'))}">×</button>
      </div>
      ${smartActionTargetHtml(a)}
    </div>`).join('');
  wrap.querySelectorAll('[data-aid]').forEach(row => {
    const id = row.dataset.aid;
    const chipAction = (sel, fn) => row.querySelectorAll(sel).forEach(btn => btn.addEventListener('click', () => {
      smartReadActionInputs();
      const a = smartEditActions.find(x => x.id === id);
      if (!a) return;
      fn(a, btn);
      renderSmartActionEditor();
    }));
    chipAction('[data-kind]', (a, btn) => {
      a.ha.kind = btn.dataset.kind;
      if (a.ha.kind === 'segments') a.ha.mode = smartVacModeOf(a.label);
    });
    chipAction('[data-mode]', (a, btn) => { a.ha.mode = btn.dataset.mode; });
    chipAction('[data-room]', (a, btn) => {
      if (btn.dataset.room === 'task') { a.ha.rooms = 'task'; return; }
      const rid = parseInt(btn.dataset.room, 10);
      const cur = Array.isArray(a.ha.rooms) ? a.ha.rooms : [];
      const next = cur.includes(rid) ? cur.filter(x => x !== rid) : [...cur, rid];
      a.ha.rooms = next.length ? next : 'task';
    });
    row.querySelector('[data-act="remove"]').addEventListener('click', () => {
      smartReadActionInputs();
      smartEditActions = smartEditActions.filter(a => a.id !== id);
      renderSmartActionEditor();
    });
    ['entity', 'service'].forEach(f => {
      const el = row.querySelector(`[data-field="${f}"]`);
      if (el) el.addEventListener('change', () => {
        smartReadActionInputs();
        const a = smartEditActions.find(x => x.id === id);
        if (f === 'entity' && a) a.ha.service = (smartServicesFor(a.ha.entity)[0] || { id: '' }).id;
        renderSmartActionEditor();
      });
    });
    (row.querySelector('[data-act="test"]') || document.createElement('button')).addEventListener('click', async (e) => {
      smartReadActionInputs();
      const a = smartEditActions.find(x => x.id === id);
      if (!a) return;
      if (smartEditSystem === 'shortcut') {
        if (!a.shortcut) { alert(tk('smart.needShortcutName')); return; }
        if (!smartShortcutsAvailable()) { alert(tk('smart.appleOnly')); return; }
        runSmartShortcut(a, 'Test');
        return;
      }
      if (smartEditType === 'sauger' && a.ha.kind === 'segments') {
        if (!/^vacuum\./.test(smartEditStatusEntity)) { alert(tk('smart.pickVacuumFirstShort')); return; }
        const list = smartVacRoomList(a);
        let raum = '';
        if (!Array.isArray(a.ha.rooms)) {
          raum = prompt(tk('smart.testWhichRoom') + (list.length ? '\n' + tk('smart.roomsList', { rooms: list.map(r => r.name).join(', ') }) : ''), list.length ? list[0].name : '');
          if (!raum) return;
        }
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await smartPost('ha/test', { ha: smartVacPayload(a), raum: raum.trim() });
          btn.textContent = tk('smart.startedCheck');
        } catch (err) {
          alert('Home Assistant: ' + err.message);
          btn.textContent = tk('smart.testBtn');
        }
        setTimeout(() => { if (btn.isConnected) { btn.textContent = tk('smart.testBtn'); btn.disabled = false; } }, 2500);
        return;
      }
      if (!a.ha.entity || !a.ha.service) { alert(tk('smart.needEntity')); return; }
      let data;
      try { data = smartComposeHaData(a.ha); } catch (err) { alert(err.message); return; }
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await smartPost('ha/test', { entity: a.ha.entity, service: a.ha.service, data });
        btn.textContent = '✓ OK';
      } catch (err) {
        alert('Home Assistant: ' + err.message);
        btn.textContent = tk('smart.testBtn');
      }
      setTimeout(() => { if (btn.isConnected) { btn.textContent = tk('smart.testBtn'); btn.disabled = false; } }, 1800);
    });
  });
}
/* ---------- Robot vacuum: rooms, suction levels, water amount, sensors ---------- */
let smartVacInfo = null;     // { entity, raeume, fanSpeeds, water, mopMode, sensoren, … } or { entity, error }
let smartVacLoading = '';
async function smartVacLoad(entity, force) {
  if (!entity || (!force && smartVacInfo && smartVacInfo.entity === entity)) return;
  smartVacLoading = entity;
  smartReadActionInputs();
  renderSmartActionEditor();
  try {
    const info = await smartPost('ha/sauger', { entity });
    smartVacInfo = { ...info, entity };
  } catch (err) {
    smartVacInfo = { entity, error: err.message, raeume: [] };
  }
  smartVacLoading = '';
  if (!document.getElementById('smartDeviceModal').classList.contains('hidden')) {
    smartReadActionInputs();
    renderSmartActionEditor();
  }
}
function smartVacInfoHtml() {
  if (!/^vacuum\./.test(smartEditStatusEntity)) return '';
  if (smartVacLoading === smartEditStatusEntity) return `<p class="text-[11px] text-ink/40">${escapeHtml(tk('smart.robotQuerying'))}</p>`;
  const info = smartVacInfo && smartVacInfo.entity === smartEditStatusEntity ? smartVacInfo : null;
  const reload = `<button type="button" id="smartVacReloadBtn" class="text-[11px] text-pine underline">${escapeHtml(tk('smart.reloadLower'))}</button>`;
  if (!info) return reload;
  if (info.error) return `<p class="text-[11px] text-red-600">${escapeHtml(info.error)}</p>${reload}`;
  const parts = [];
  if (info.akku !== null && info.akku !== undefined) parts.push('🔋 ' + escapeHtml(String(info.akku)) + ' %');
  if (info.state) parts.push(escapeHtml(info.state));
  parts.push(escapeHtml(tk('smart.roomsN', { n: (info.raeume || []).length })));
  const sensoren = info.sensoren || [];
  return `<div class="rounded-xl bg-ink/5 px-3 py-2">
      <div class="flex items-center gap-2 text-[11px] text-ink/60"><span class="flex-1 min-w-0 truncate">${parts.join(' · ')}</span>${reload}</div>
      ${sensoren.length ? `<details class="mt-1">
        <summary class="text-[11px] text-ink/40 cursor-pointer">${escapeHtml(tk('smart.sensors', { n: sensoren.length }))}</summary>
        <div class="mt-1 space-y-0.5 max-h-48 overflow-y-auto">${sensoren.map(x => `<div class="flex gap-2 text-[11px]"><span class="flex-1 min-w-0 truncate text-ink/60">${escapeHtml(x.name)}</span><span class="shrink-0">${escapeHtml(x.state)}${x.unit ? ' ' + escapeHtml(x.unit) : ''}</span></div>`).join('')}</div>
      </details>` : ''}
    </div>`;
}
// Room cleaning for save/test: pass the robot, room list and detected select entities along
function smartVacPayload(a) {
  const ha = normalizeSmartHa(a.ha);
  ha.kind = 'segments';
  ha.entity = smartEditStatusEntity;
  ha.service = 'vacuum.send_command';
  ha.data = {};
  ha.dataText = '';
  const info = smartVacCurrent();
  if (info) {
    if (info.raeume && info.raeume.length) {
      ha.roomMap = {};
      info.raeume.slice(0, 60).forEach(r => { ha.roomMap[String(r.id)] = String(r.name); });
    }
    ha.waterEntity = info.water ? info.water.id : '';
    ha.mopModeEntity = info.mopMode ? info.mopMode.id : '';
  }
  if (ha.mode === 'mop') ha.fan = '';
  if (ha.mode === 'vac') { ha.water = ''; ha.mopMode = ''; }
  return ha;
}
async function openSmartDeviceModal(existingId) {
  editingSmartDeviceId = existingId || null;
  const d = existingId ? smartDevices.find(x => x.id === existingId) : null;
  const type = SMART_DEVICE_TYPES.find(t => t.id === (d ? d.type : 'sauger'));
  const haOk = !!(smartStatus && smartStatus.ha && smartStatus.ha.verbunden);
  smartEditType = type.id;
  smartEditIcon = d ? d.icon : type.icon;
  // New device: suggest Home Assistant if it is connected
  smartEditSystem = d ? smartSystem(d) : (haOk ? 'ha' : 'shortcut');
  smartEditStatusEntity = d ? d.statusEntity || '' : '';
  smartEditActions = d ? d.actions.map(a => ({ ...a, ha: { ...normalizeSmartHa(a.ha) } })) : smartDefaultActions(type.id, smartEditSystem);
  document.getElementById('smartDeviceModalTitle').textContent = d ? tk('smart.editDevice') : tk('smart.newDevice');
  document.getElementById('smartDeviceName').value = d ? d.name : type.label;
  document.getElementById('smartDeviceStatus').textContent = '';
  document.getElementById('deleteSmartDeviceBtn').classList.toggle('hidden', !d);
  renderSmartSystemPicker();
  renderSmartTypePicker();
  renderSmartIconPicker();
  renderSmartActionEditor();
  document.getElementById('smartDeviceModal').classList.remove('hidden');
  armModalSnapshot('smartDeviceModal');
  if (smartEditSystem === 'ha' && !smartHaEntities) {
    await loadSmartHaEntities();
    renderSmartActionEditor();
    armModalSnapshot('smartDeviceModal');
  }
}
function closeSmartDeviceModal() { document.getElementById('smartDeviceModal').classList.add('hidden'); }
document.getElementById('cancelSmartDevice').addEventListener('click', () => attemptCloseModal('smartDeviceModal', closeSmartDeviceModal));
wireModalOutsideClick('smartDeviceModal', closeSmartDeviceModal);
document.getElementById('addSmartActionBtn').addEventListener('click', () => {
  smartReadActionInputs();
  const neu = smartNewAction('', smartEditType, smartEditSystem);
  const id = neu.id;
  smartEditActions.push(neu);
  renderSmartActionEditor();
  const input = document.querySelector(`#smartDeviceActions [data-aid="${id}"] [data-field="label"]`);
  if (input) input.focus();
});
document.getElementById('saveSmartDevice').addEventListener('click', async () => {
  smartReadActionInputs();
  const status = document.getElementById('smartDeviceStatus');
  const name = document.getElementById('smartDeviceName').value.trim();
  if (!name) { status.textContent = tk('common.needName'); return; }
  const named = smartEditActions.filter(a => a.label);
  if (!named.length) { status.textContent = tk('smart.needAction'); return; }
  if (smartEditActions.some(a => !a.label && (a.shortcut || (a.ha && a.ha.entity)))) { status.textContent = tk('smart.needActionNames'); return; }
  let actions;
  try {
    actions = named.map(a => {
      let ha = normalizeSmartHa(a.ha);
      if (smartEditSystem === 'ha' && smartEditType === 'sauger' && ha.kind === 'segments') {
        if (!/^vacuum\./.test(smartEditStatusEntity)) throw new Error(tk('smart.actionPickVacuum', { action: a.label }));
        ha = smartVacPayload(a);
      } else {
        ha.kind = '';
        if (smartEditSystem === 'ha') {
          try { ha.data = smartComposeHaData(ha); }
          catch (err) { throw new Error(tk('smart.actionError', { action: a.label, error: err instanceof SyntaxError ? tk('smart.invalidJson') : err.message })); }
        }
      }
      return { id: a.id, label: a.label, shortcut: a.shortcut || '', minutes: smartMinutes(a.minutes), ha };
    });
  } catch (err) {
    status.textContent = err.message;
    return;
  }
  const device = {
    id: editingSmartDeviceId || smartNewId('sd'), name, icon: smartEditIcon, type: smartEditType,
    system: smartEditSystem, statusEntity: smartEditSystem === 'ha' ? smartEditStatusEntity : '', actions,
  };
  if (editingSmartDeviceId) smartDevices = smartDevices.map(d => d.id === editingSmartDeviceId ? device : d);
  else smartDevices.push(device);
  stripSmartRefs();
  await persistState();
  closeSmartDeviceModal();
  renderSmartDeviceList();
  refreshOpenSmartPicker();
  renderSettingsSmartStatus();
  renderTasks();
});
document.getElementById('deleteSmartDeviceBtn').addEventListener('click', async () => {
  if (!editingSmartDeviceId) return;
  const d = smartDevices.find(x => x.id === editingSmartDeviceId);
  if (!d || !confirm(tk('smart.confirmDelete', { name: d.name }))) return;
  smartDevices = smartDevices.filter(x => x.id !== editingSmartDeviceId);
  stripSmartRefs();
  await persistState();
  closeSmartDeviceModal();
  renderSmartDeviceList();
  refreshOpenSmartPicker();
  renderSettingsSmartStatus();
  renderTasks();
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('smarthome');
