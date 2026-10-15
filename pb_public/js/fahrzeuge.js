/* pinn. – js/fahrzeuge.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded first of the files in js/, right before js/zuhause.js (js/ausblick.js stays last and
   starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.50.0, only the comments were translated):
   - Vehicles (menu "Fahrzeuge", fz…) – cars, motorcycles, motorhomes, trailers, e-scooters, e-bikes and bicycles
     with the tabs list, balance and calculators; vehicle detail view with key figures, consumption chart,
     appointments & maintenance, contracts, costs and log (refuelling, charging, workshop, tires, HU …)
   - Notices & deadlines (HU, inspection, tire change, tread depth/age, insurance plate, own deadlines) with
     automatic tasks (fzStart) and the assignment of contracts
   - Link between vehicles and documents (both directions), takeover of older vehicle documents from Finanzen
   - Popups for vehicle, entry, deadline, sale, contracts and documents, and the wiring of the buttons
   - Since 1.56.0: the animated street scene in the header of the detail view (fzSceneHtml)
   131 functions and 30 variables. index.html only calls these functions later (when the user acts or from
   bootApp), never while it is still loading – that is why this file may come after the inline script.
   One statement runs while this file loads (initVehiclesUi); it only registers listeners on the vehicles
   page and its popups. */

/* ==========================================================
   Vehicles (menu "Fahrzeuge", fz…)
   ----------------------------------------------------------
   - Cars, motorcycles, motorhomes, trailers, e-scooters, e-bikes and bicycles are kept small in the
     finance data of the family (finance.vehicles) - so they can be created and changed offline, are merged
     entry by entry between the devices and are not visible for guest accounts:
       { id, kind, name, make, model, plate, color, drive, tank, battery, odoStart, firstReg ('YYYY-MM'),
         purchaseDate, purchasePrice, value, valueDate, holder, vin, hsn, tsn, note,
         hu: { due: 'YYYY-MM', months }, service: { months, km, lastDate, lastOdo },
         tires: { mode: 'wechsel' (seasonal change) | 'ganzjahr' (all-season) | 'keine' (none),
                  mounted: 'sommer' (summer) | 'winter', toWinter, toSummer, size,
                  storage, sets: { sommer|winter|ganzjahr: { dot, tread } } },
         taxRecId (recurring booking for the vehicle tax), vk (insurance plate), vkDoneYear,
         deadlines: [{ id, label, date }], docLinks: [document IDs from "Dokumente"],
         autoTasks: { on, days, to: [member IDs], made: { <key>: { id, at } } },
         archived: { date, price } | null, created, updated }
   - Log (finance.vehicleLog): refuelling, charging, maintenance, repair, tires, HU, care, parking & tolls,
     accessories, odometer reading, other: { id, vehicle, type, date, odo, fuel, qty, price, full, where,
     station, desc, amount, booked, paidBy, note, huResult, inspection, tireSwitch, created }.
     Booked entries are at the same time an ordinary expense (collection "ausgaben", same ID,
     category "Auto & Mobilität", bezug "fahrzeug:<ID>") - so they count in the budget. Receipts are
     stored like those of expenses under "ausgabe:<ID>" in finanz_dokumente.
   - Vehicle documents (registration certificate, HU report, workshop invoice, purchase contract …) have been stored
     since 0.76 under "Dokumente" (collection "dokumente") - with a suitable category and prefilled details.
     The link is kept on the vehicle (docLinks) and maintained in both directions: upload or link it at the
     vehicle, or assign it in "Dokumente" in the popup under "Fahrzeug".
     Older vehicle documents from finanz_dokumente ("fahrzeug:<ID>") are taken over automatically.
   - Contracts (insurance, leasing, financing, breakdown cover …) get the field vehicle.
   - Notices (HU, inspection, tire change "von O bis O" = from October to Easter, tread depth/age of the tires,
     insurance plate, own deadlines) create a task automatically. The task ID is
     calculated from family, vehicle and occasion - so two devices never create two tasks.
   ========================================================== */
const FZ_KINDS = [
  { id: 'auto', label: 'Auto', icon: '🚗', drives: ['benzin', 'diesel', 'hybrid', 'phev', 'elektro', 'lpg', 'cng', 'wasserstoff'], defaultDrive: 'benzin', hu: 24, huFirst: 36, tires: true, plate: true, insure: true },
  { id: 'motorrad', label: 'Motorrad', icon: '🏍️', drives: ['benzin', 'elektro'], defaultDrive: 'benzin', hu: 24, huFirst: 24, tires: false, plate: true, insure: true },
  { id: 'wohnmobil', label: 'Wohnmobil & Transporter', icon: '🚐', drives: ['diesel', 'benzin', 'hybrid', 'elektro', 'lpg', 'cng'], defaultDrive: 'diesel', hu: 24, huFirst: 24, tires: true, plate: true, insure: true },
  { id: 'anhaenger', label: 'Anhänger & Wohnwagen', icon: '🏕️', drives: [], defaultDrive: '', hu: 24, huFirst: 36, tires: false, plate: true, insure: true },
  { id: 'escooter', label: 'E-Scooter & Mofa', icon: '🛴', drives: ['elektro', 'benzin'], defaultDrive: 'elektro', hu: 0, tires: false, plate: false, insure: true, vk: true },
  { id: 'ebike', label: 'E-Bike & Pedelec', icon: '🚴', drives: ['elektro'], defaultDrive: 'elektro', hu: 0, tires: false, plate: false, bike: true },
  { id: 'fahrrad', label: 'Fahrrad', icon: '🚲', drives: [], defaultDrive: '', hu: 0, tires: false, plate: false, bike: true },
];
const FZ_DRIVES = [
  { id: 'benzin', label: 'Benzin', icon: '⛽', fuels: ['benzin'] },
  { id: 'diesel', label: 'Diesel', icon: '⛽', fuels: ['diesel', 'adblue'] },
  { id: 'hybrid', label: 'Hybrid', icon: '♻️', fuels: ['benzin'] },
  { id: 'phev', label: 'Plug-in-Hybrid', icon: '🔌', fuels: ['benzin', 'strom'] },
  { id: 'elektro', label: 'Elektro', icon: '⚡', fuels: ['strom'] },
  { id: 'lpg', label: 'Autogas (LPG)', icon: '🔥', fuels: ['lpg', 'benzin'] },
  { id: 'cng', label: 'Erdgas (CNG)', icon: '🔥', fuels: ['cng', 'benzin'] },
  { id: 'wasserstoff', label: 'Wasserstoff', icon: '💧', fuels: ['h2'] },
];
const FZ_NO_DRIVE = { id: '', label: 'ohne Antrieb', icon: '', fuels: [] };
// price = suggestion until an own price is known; co2 = kg CO₂ per unit (rough, combustion or electricity mix)
const FZ_FUELS = {
  benzin: { label: 'Benzin', unit: 'l', price: 1.75, co2: 2.37, sorts: ['Super E10', 'Super E5', 'Super Plus'] },
  diesel: { label: 'Diesel', unit: 'l', price: 1.65, co2: 2.65, sorts: ['Diesel', 'HVO100', 'Premium-Diesel'] },
  adblue: { label: 'AdBlue', unit: 'l', price: 0.95, co2: 0, extra: true },
  lpg: { label: 'Autogas (LPG)', unit: 'l', price: 0.95, co2: 1.64 },
  cng: { label: 'Erdgas (CNG)', unit: 'kg', price: 1.55, co2: 2.75 },
  strom: { label: 'Strom', unit: 'kWh', price: 0.35, co2: 0.38 },
  h2: { label: 'Wasserstoff', unit: 'kg', price: 13.85, co2: 0 },
};
const FZ_CHARGE_WHERE = [
  { id: 'home', label: 'Zuhause', price: 0.35 },
  { id: 'public', label: 'Öffentlich', price: 0.59 },
  { id: 'work', label: 'Arbeit', price: 0 },
];
const FZ_LOG_TYPES = [
  { id: 'tanken', label: 'Tanken', icon: '⛽', group: 'energie' },
  { id: 'laden', label: 'Laden', icon: '🔌', group: 'energie' },
  { id: 'wartung', label: 'Wartung', icon: '🔧', group: 'werkstatt' },
  { id: 'reparatur', label: 'Reparatur', icon: '🛠️', group: 'werkstatt' },
  { id: 'reifen', label: 'Reifen', icon: '🛞', group: 'reifen' },
  { id: 'hu', label: 'HU / TÜV', icon: '🔍', group: 'werkstatt' },
  { id: 'pflege', label: 'Pflege', icon: '🧽', group: 'unterwegs' },
  { id: 'parken', label: 'Parken & Maut', icon: '🅿️', group: 'unterwegs' },
  { id: 'zubehoer', label: 'Zubehör', icon: '🧩', group: 'sonstiges' },
  { id: 'km', label: 'km-Stand', icon: '📍', group: '' },
  { id: 'sonstiges', label: 'Sonstiges', icon: '📦', group: 'sonstiges' },
];
const FZ_GROUPS = [
  { id: 'energie', label: 'Tanken & Laden', icon: '⛽', color: '#D9822B' },
  { id: 'werkstatt', label: 'Werkstatt & HU', icon: '🔧', color: '#3D5A80' },
  { id: 'reifen', label: 'Reifen', icon: '🛞', color: '#546E7A' },
  { id: 'vertraege', label: 'Versicherung & Verträge', icon: '🛡️', color: '#4A6FA5' },
  { id: 'fix', label: 'Steuer & Fixkosten', icon: '🏛️', color: '#8E6BBF' },
  { id: 'unterwegs', label: 'Pflege, Parken & Maut', icon: '🅿️', color: '#2A9D8F' },
  { id: 'sonstiges', label: 'Zubehör & Sonstiges', icon: '🧩', color: '#9A9A9A' },
  { id: 'wertverlust', label: 'Wertverlust (geschätzt)', icon: '📉', color: '#B5543C' },
];
// cat = category under "Dokumente"; plate/hu = only for vehicles with a license plate or HU respectively
const FZ_DOC_TYPES = [
  { id: 'fzschein', label: 'Fahrzeugschein / -brief', icon: '🪪', cat: 'fahrzeuge', plate: true },
  { id: 'hubericht', label: 'HU-Bericht', icon: '🔍', cat: 'fahrzeuge', hu: true },
  { id: 'werkstatt', label: 'Werkstattrechnung', icon: '🔧', cat: 'fahrzeuge' },
  { id: 'rechnung', label: 'Rechnung (Teile, Reifen, Zubehör)', icon: '🧾', cat: 'kaufbelege' },
  { id: 'vertrag', label: 'Kaufvertrag', icon: '📄', cat: 'kaufbelege' },
  { id: 'garantie', label: 'Garantie', icon: '🏅', cat: 'kaufbelege' },
  { id: 'versicherung', label: 'Versicherungsschein / eVB', icon: '🛡️', cat: 'versicherungen' },
  { id: 'steuer', label: 'Kfz-Steuerbescheid', icon: '🏛️', cat: 'steuern', plate: true },
  { id: 'sonstiges', label: 'Sonstiges', icon: '📎', cat: 'fahrzeuge' },
];
const FZ_DOC_LINK_MAX = 300;
const FZ_COLORS = ['#2F4B41', '#3D5A80', '#1E4AA8', '#B5543C', '#C0392B', '#D9822B', '#D4A017', '#5E8C31', '#2A9D8F', '#8E6BBF', '#546E7A', '#1F1F1F'];
const FZ_FIN_CATEGORY = 'mobilitaet';
const FZ_REMIND_DAYS = [7, 14, 30, 60];
const FZ_MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

let fzTab = 'liste';         // 'liste' | 'bilanz' | 'rechner' (list | balance | calculators)
let fzDetailId = null;       // opened vehicle (detail view)
let fzLogFilter = 'alle';
let fzLogLimit = 25;
let fzShowArchived = false;
let fzBalVehicle = '';       // '' = all vehicles
let fzBalPeriod = 'jahr';    // 'jahr' | '12m' | 'gesamt' (year | 12 months | total)
let fzBalYear = new Date().getFullYear();
let fzToolVehicle = '';
let fzToolsBuilt = false;
let fzModalState = null;     // vehicle or entry popup
let fzLogPending = [];       // receipts for a new entry (uploaded after saving)
let fzAutoTimer = null;
let fzLastAutoRun = 0;
let fzRunningAuto = false;

/* ---------- Animated street scene in the detail header ----------
   Sky (sun & clouds by day, moon & stars at night – same rule as the home scene), hills in the vehicle
   colour, a row of trees and street lamps that slowly passes by, a road with moving lane markings and
   other traffic in both lanes (oncoming traffic on the far lane, overtaking vehicles on the near lane).
   Only transform/opacity animations; the classes hs-anim / hs-mover make sure everything stands still in
   power-saving mode and is hidden with "reduce motion". */
function fzSceneIsNight() {
  if (typeof hsIsNight === 'function') { try { return hsIsNight(); } catch (e) { /* fall back to fixed times */ } }
  const h = new Date().getHours();
  return h >= 20 || h < 6;
}
function fzSceneTrees(night) {
  const leaf = night ? ['#22392B', '#2A4635', '#1D3226'] : ['#4F8A3C', '#5E9C47', '#3F7A33'];
  const trunk = night ? '#4A3A2A' : '#7A5230';
  const pole = night ? '#59606A' : '#8A929C';
  // [x, type, shade] – r = round tree, p = pine, b = bush, l = street lamp; one tile is 400 px wide and repeats
  const items = [[16, 'r', 0], [44, 'p', 1], [70, 'b', 2], [96, 'r', 1], [128, 'l'], [158, 'p', 0], [184, 'r', 2], [212, 'b', 0],
    [238, 'r', 0], [266, 'p', 2], [296, 'l'], [326, 'r', 1], [352, 'b', 1], [378, 'p', 0]];
  let g = '';
  items.forEach(([x, t, c]) => {
    if (t === 'r') {
      g += `<rect x="${x - 1.5}" y="25" width="3" height="15" rx="1" fill="${trunk}"/>`
        + `<circle cx="${x}" cy="18" r="10" fill="${leaf[c]}"/><circle cx="${x - 6}" cy="23" r="6" fill="${leaf[(c + 1) % 3]}"/><circle cx="${x + 6}" cy="22" r="6.5" fill="${leaf[(c + 1) % 3]}"/>`;
    } else if (t === 'p') {
      g += `<rect x="${x - 1.2}" y="31" width="2.4" height="9" fill="${trunk}"/>`
        + `<polygon points="${x - 8},33 ${x},14 ${x + 8},33" fill="${leaf[c]}"/><polygon points="${x - 6},24 ${x},6 ${x + 6},24" fill="${leaf[c]}"/>`;
    } else if (t === 'b') {
      g += `<circle cx="${x - 4}" cy="36" r="5" fill="${leaf[c]}"/><circle cx="${x + 3}" cy="35" r="6" fill="${leaf[(c + 2) % 3]}"/>`;
    } else {
      g += `<rect x="${x - 1}" y="8" width="2" height="32" fill="${pole}"/><path d="M${x} 9 q0 -3 6 -3" stroke="${pole}" stroke-width="2" fill="none"/>`
        + `<ellipse cx="${x + 7}" cy="7" rx="3.4" ry="1.8" fill="${night ? '#FFD66B' : '#D7D2C8'}"${night ? ' class="hs-lamp hs-anim"' : ''}/>`
        + (night ? `<circle cx="${x + 7}" cy="9" r="7" fill="#FFD66B" opacity=".18"/>` : '');
    }
  });
  const tile = `<svg viewBox="0 0 400 40" width="400" height="40" aria-hidden="true">${g}</svg>`;
  return `<div class="fz-trees hs-anim">${tile}${tile}${tile}${tile}</div>`;
}
function fzSceneHtml(v) {
  const night = fzSceneIsNight();
  const k = fzKind(v && v.kind);
  const sky = night
    ? [[8, 12], [22, 30], [35, 8], [48, 22], [62, 14], [74, 36], [86, 10], [93, 26], [15, 40], [55, 38]].map(([x, y], i) => `<span class="hs-star${i % 3 === 0 ? ' tw hs-anim' : ''}" style="left:${x}%;top:${y}px;animation-delay:-${i * 0.7}s"></span>`).join('') + '<span class="hs-moon"></span>'
    : '<span class="hs-sun"></span><div class="hs-cloud hs-anim"><i></i></div><div class="hs-cloud c2 hs-anim"><i></i></div>';
  const hills = `<svg class="fz-hills" viewBox="0 0 400 34" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 34 V20 Q40 6 90 16 T190 12 T300 18 T400 10 V34Z" class="fz-hill-far"/>
      <path d="M0 34 V26 Q60 16 130 24 T260 22 T400 24 V34Z" class="fz-hill-near"/></svg>`;
  // [emoji, duration s, delay s]; far lane = oncoming traffic (to the right), near lane = overtaking (to the left)
  const bikes = !!(k.bike || k.id === 'escooter');
  const far = bikes ? [['🚗', 9, 2], ['🚲', 16, 9], ['🚌', 13, 5]] : [['🚚', 11, 3], ['🚗', 8, 7], ['🚌', 14, 11], ['🏍️', 7, 1]];
  const near = bikes ? [['🚲', 12, 4], ['🛴', 15, 10]] : [['🚙', 10, 6], ['🚕', 13, 1], ['🚐', 16, 12]];
  const mover = (lane, [emoji, dur, delay]) => `<div class="hs-mover fz-car ${lane} hs-anim${lane === 'far' ? ' ltr' : ''}" style="animation-duration:${dur}s;animation-delay:-${delay}s"><span>${emoji}</span></div>`;
  return `<div class="fz-hero-band hs-scene fz-scene${night ? ' is-night' : ''}" aria-hidden="true">
      ${sky}${hills}${fzSceneTrees(night)}
      <div class="fz-verge"></div>
      <div class="fz-road"><div class="fz-lane hs-anim"></div></div>
      ${far.map(x => mover('far', x)).join('')}${near.map(x => mover('near', x)).join('')}
    </div>`;
}

/* ---------- Basics ---------- */
function fzVehicles() { return (finance && Array.isArray(finance.vehicles)) ? finance.vehicles : []; }
function fzVehicle(id) { return id ? (fzVehicles().find(v => v.id === id) || null) : null; }
function fzIsArchived(v) { return !!(v && v.archived && vtIsIso(v.archived.date)); }
function fzActiveVehicles() { return fzVehicles().filter(v => !fzIsArchived(v)); }
function fzLogs() { return (finance && Array.isArray(finance.vehicleLog)) ? finance.vehicleLog : []; }
function fzLogById(id) { return id ? (fzLogs().find(l => l.id === id) || null) : null; }
function fzLogSort(a, b) { return String(a.date || '').localeCompare(String(b.date || '')) || ((Number(a.odo) || 0) - (Number(b.odo) || 0)) || String(a.id).localeCompare(String(b.id)); }
function fzLogsFor(vid) { return fzLogs().filter(l => l.vehicle === vid).sort(fzLogSort); }
function fzKind(id) { return FZ_KINDS.find(k => k.id === id) || FZ_KINDS[0]; }
function fzDrive(v) {
  const k = fzKind(v && v.kind);
  if (!k.drives.length) return FZ_NO_DRIVE;
  const id = k.drives.includes(v && v.drive) ? v.drive : k.defaultDrive;
  return FZ_DRIVES.find(d => d.id === id) || FZ_NO_DRIVE;
}
function fzFuels(v) { return fzDrive(v).fuels; }
function fzMainFuels(v) { return fzFuels(v).filter(f => !FZ_FUELS[f].extra); }
function fzCanCharge(v) { return fzFuels(v).includes('strom'); }
function fzCanFuel(v) { return fzFuels(v).some(f => f !== 'strom'); }
function fzLogType(id) { return FZ_LOG_TYPES.find(t => t.id === id) || FZ_LOG_TYPES[FZ_LOG_TYPES.length - 1]; }
function fzGroup(id) { return FZ_GROUPS.find(g => g.id === id) || FZ_GROUPS[6]; }
function fzLogFuel(l) { return l.type === 'laden' ? 'strom' : (FZ_FUELS[l.fuel] ? l.fuel : 'benzin'); }
function fzColor(v) { return /^#[0-9a-fA-F]{6}$/.test((v && v.color) || '') ? v.color : '#2F4B41'; }
function fzName(v) {
  if (!v) return 'Fahrzeug';
  const n = String(v.name || '').trim();
  if (n) return n;
  const mm = [v.make, v.model].filter(Boolean).join(' ').trim();
  return mm || fzKind(v.kind).label;
}
function fzShortName(v) { return fzName(v) + (v && v.plate ? ' (' + fzPlateText(v.plate) + ')' : ''); }
function fzPlateText(p) { return String(p || '').toUpperCase().replace(/\s+/g, ' ').trim(); }
function fzPlateHtml(p, big) {
  if (!p) return '';
  return `<span class="fz-plate${big ? ' big' : ''}"><span class="fz-plate-eu">D</span><span class="fz-plate-txt">${escapeHtml(fzPlateText(p))}</span></span>`;
}
function fzTypesFor(v) {
  const k = fzKind(v.kind);
  return FZ_LOG_TYPES.filter(t => {
    if (t.id === 'tanken') return fzCanFuel(v);
    if (t.id === 'laden') return fzCanCharge(v);
    if (t.id === 'hu') return !!k.hu;
    if (t.id === 'parken') return !k.bike;
    return true;
  });
}

/* ---------- Numbers, dates ---------- */
function fzNum(n, dec = 0) {
  const x = Number(n);
  if (!isFinite(x)) return '–';
  return x.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fzKmText(n) { return fzNum(n, 0) + ' km'; }
function fzParseInt(s) {
  const t = String(s == null ? '' : s).replace(/[^\d]/g, '');
  return t ? parseInt(t, 10) : NaN;
}
// Decimal number: comma or dot as decimal separator (1,789 or 1.789 = price per liter). Unlike with
// amounts, a single separator is always the decimal separator – a thousands separator only if there are several or both kinds.
function fzParseDec(s) {
  let t = String(s == null ? '' : s).replace(/[\s\u00a0\u202f'\u2019]/g, '').replace(/[a-zA-Z\/%]+$/, '');
  t = t.replace(/[\u2212\u2013\u2014]/g, '-').replace(/[^\d.,\-]/g, '');
  if (!t) return NaN;
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) { const dec = lc > ld ? ',' : '.'; t = t.split(dec === ',' ? '.' : ',').join('').replace(dec, '.'); }
  else if (lc >= 0 || ld >= 0) { const sep = lc >= 0 ? ',' : '.'; t = t.split(sep).length > 2 ? t.split(sep).join('') : t.replace(sep, '.'); }
  const x = Number(t);
  return isFinite(x) ? x : NaN;
}
function fzDecInput(v, dec) {
  if (v === '' || v == null || !isFinite(Number(v))) return '';
  const x = Number(v);
  return numDec(dec == null ? String(Math.round(x * 1000) / 1000) : x.toFixed(dec));
}
function fzIsYm(s) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || '')); }
function fzParseYm(s) {
  const t = String(s || '').trim();
  if (fzIsYm(t)) return t;
  let m = /^(\d{1,2})\s*[./-]\s*(\d{2}|\d{4})$/.exec(t);
  if (m) {
    const mo = parseInt(m[1], 10);
    let y = parseInt(m[2], 10);
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12) return y + '-' + pad2(mo);
  }
  m = /^(\d{4})-(\d{1,2})-\d{1,2}$/.exec(t);
  if (m && parseInt(m[2], 10) >= 1 && parseInt(m[2], 10) <= 12) return m[1] + '-' + pad2(parseInt(m[2], 10));
  return '';
}
function fzMonthEnd(ym) { return vtMonthEnd(ym + '-01'); }
function fzMonthLabel(ym) { return fzIsYm(ym) ? FZ_MONTH_NAMES[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4) : ''; }
function fzPlakette(ym) { return fzIsYm(ym) ? ym.slice(5, 7) + '/' + ym.slice(2, 4) : ''; }
function fzWhen(days) {
  if (days < 0) return days === -1 ? 'seit gestern' : 'seit ' + (-days) + ' Tagen';
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days <= 60) return 'in ' + days + ' Tagen';
  const mo = Math.round(days / 30.44);
  return mo < 24 ? 'in ' + mo + ' Monaten' : 'in ' + Math.round(days / 365) + ' Jahren';
}
function fzToneRank(t) { return { urgent: 0, warn: 1, ok: 2, muted: 3 }[t] ?? 4; }

/* ---------- Kilometers ---------- */
function fzOdoPoints(v) {
  const pts = [];
  if (Number(v.odoStart) >= 0 && v.odoStart !== '' && v.odoStart != null) {
    const d = vtIsIso(v.purchaseDate) ? v.purchaseDate : (vtIsIso(v.created) ? v.created : '');
    if (d) pts.push({ date: d, odo: Number(v.odoStart) });
  }
  fzLogsFor(v.id).forEach(l => { if (Number(l.odo) > 0 && vtIsIso(l.date)) pts.push({ date: l.date, odo: Number(l.odo) }); });
  pts.sort((a, b) => a.date.localeCompare(b.date) || a.odo - b.odo);
  return pts;
}
function fzCurrentOdo(v) {
  const pts = fzOdoPoints(v);
  return pts.length ? Math.max(...pts.map(p => p.odo)) : 0;
}
function fzOdoAt(pts, iso) {
  if (!pts.length) return 0;
  if (iso <= pts[0].date) return pts[0].odo;
  const last = pts[pts.length - 1];
  if (iso >= last.date) return last.odo;
  for (let i = 1; i < pts.length; i++) {
    if (iso <= pts[i].date) {
      const a = pts[i - 1], b = pts[i];
      const span = vtDiffDays(a.date, b.date);
      if (span <= 0) return b.odo;
      return a.odo + (b.odo - a.odo) * (vtDiffDays(a.date, iso) / span);
    }
  }
  return last.odo;
}
function fzKmIn(v, s, e) {
  const pts = fzOdoPoints(v);
  if (pts.length < 2) return 0;
  return Math.max(0, Math.round(fzOdoAt(pts, e) - fzOdoAt(pts, s)));
}
// Mileage per day from all readings (at least 30 days apart)
function fzKmPerDay(v) {
  const pts = fzOdoPoints(v);
  if (pts.length < 2) return 0;
  const a = pts[0], b = pts[pts.length - 1];
  const days = vtDiffDays(a.date, b.date);
  if (days < 30 || b.odo <= a.odo) return 0;
  return (b.odo - a.odo) / days;
}

/* ---------- Consumption ---------- */
// Full-tank method: quantity between two full fill-ups / distance driven. Without a full-tank mark
// it is estimated (everything except the first fill-up / distance between the first and the last reading).
function fzConsumption(v, fuel) {
  const logs = fzLogsFor(v.id).filter(l => (l.type === 'tanken' || l.type === 'laden') && fzLogFuel(l) === fuel && Number(l.qty) > 0 && Number(l.odo) > 0)
    .sort((a, b) => (Number(a.odo) - Number(b.odo)) || String(a.date).localeCompare(String(b.date)));
  if (logs.length < 2) return null;
  const unit = FZ_FUELS[fuel].unit + '/100 km';
  const segs = [];
  let lastFull = -1, acc = 0;
  logs.forEach((l, i) => {
    if (lastFull >= 0) acc += Number(l.qty);
    if (l.full) {
      if (lastFull >= 0) {
        const km = Number(l.odo) - Number(logs[lastFull].odo);
        if (km > 0 && acc > 0) segs.push({ date: l.date, km, qty: acc, value: acc / km * 100 });
      }
      lastFull = i; acc = 0;
    }
  });
  if (segs.length) {
    const qty = segs.reduce((s, x) => s + x.qty, 0);
    const km = segs.reduce((s, x) => s + x.km, 0);
    return { fuel, avg: qty / km * 100, segs, km, qty, estimated: false, unit };
  }
  const km = Number(logs[logs.length - 1].odo) - Number(logs[0].odo);
  if (km < 50) return null;
  const qty = logs.slice(1).reduce((s, l) => s + Number(l.qty), 0);
  if (!qty) return null;
  return { fuel, avg: qty / km * 100, segs: [], km, qty, estimated: true, unit };
}
function fzMainConsumption(v) {
  for (const f of fzMainFuels(v)) { const c = fzConsumption(v, f); if (c) return c; }
  return null;
}
// Energy costs per 100 km (all energy sources, without the very first fill-up)
function fzEnergyPer100(v) {
  const logs = fzLogsFor(v.id).filter(l => (l.type === 'tanken' || l.type === 'laden') && fzLogFuel(l) !== 'adblue' && Number(l.amount) > 0);
  const withOdo = logs.filter(l => Number(l.odo) > 0);
  if (withOdo.length < 2) return null;
  const first = withOdo.reduce((a, b) => (Number(a.odo) <= Number(b.odo) ? a : b));
  const maxO = Math.max(...withOdo.map(l => Number(l.odo)));
  const km = maxO - Number(first.odo);
  if (km < 100) return null;
  const cost = logs.filter(l => l !== first && l.date >= first.date).reduce((s, l) => s + Number(l.amount), 0);
  return cost > 0 ? cost / km * 100 : null;
}
// Last price paid per unit
function fzLastPrice(fuel, v, where) {
  const pool = (v ? fzLogsFor(v.id) : fzLogs().slice().sort(fzLogSort)).filter(l => fzLogFuel(l) === fuel && Number(l.price) > 0 && (!where || (l.where || 'home') === where));
  if (pool.length) return Number(pool[pool.length - 1].price);
  if (v) return fzLastPrice(fuel, null, where);
  if (fuel === 'strom' && where) return (FZ_CHARGE_WHERE.find(w => w.id === where) || FZ_CHARGE_WHERE[0]).price;
  return FZ_FUELS[fuel] ? FZ_FUELS[fuel].price : 0;
}

/* ---------- Contracts & costs ---------- */
function fzContractsFor(vid) { return vtContracts().filter(c => c.vehicle === vid); }
function fzVehicleRecurring(vid) {
  return finance.recurring.filter(r => r.vehicle === vid && !(r.contract && vtContract(r.contract) && vtContract(r.contract).vehicle === vid));
}
function fzStartDate(v) {
  const cands = [];
  if (vtIsIso(v.purchaseDate)) cands.push(v.purchaseDate);
  const logs = fzLogsFor(v.id);
  if (logs.length && vtIsIso(logs[0].date)) cands.push(logs[0].date);
  if (vtIsIso(v.created)) cands.push(v.created);
  return cands.sort()[0] || finTodayIso();
}
function fzEndDate(v) { return fzIsArchived(v) ? v.archived.date : finTodayIso(); }
// Single cost items of a vehicle between s and e (contracts/fixed costs only up to today)
function fzCostItems(v, s, e) {
  const out = [];
  fzLogsFor(v.id).forEach(l => {
    const a = Number(l.amount) || 0;
    if (a > 0 && l.date >= s && l.date <= e) out.push({ date: l.date, amount: a, group: fzLogType(l.type).group || 'sonstiges', label: fzLogTitle(l) });
  });
  const today = finTodayIso();
  const to = e < today ? e : today;
  if (to >= s) {
    fzContractsFor(v.id).forEach(c => {
      const r = vtRec(c);
      if (!r) return;
      finRecDates(r, s, to).forEach(d => { const a = finRecurringAmountFor(r, d); if (a > 0) out.push({ date: d, amount: a, group: 'vertraege', label: c.name || 'Vertrag' }); });
    });
    fzVehicleRecurring(v.id).forEach(r => {
      finRecDates(r, s, to).forEach(d => { const a = finRecurringAmountFor(r, d); if (a > 0) out.push({ date: d, amount: a, group: 'fix', label: r.title || 'Fixkosten' }); });
    });
  }
  return out;
}
// Depreciation (estimated): purchase price → current value or sale price, spread evenly
function fzLossPerDay(v) {
  const price = Number(v.purchasePrice) || 0;
  if (!price || !vtIsIso(v.purchaseDate)) return 0;
  let endVal = null, endDate = '';
  if (fzIsArchived(v) && v.archived.price !== '' && v.archived.price != null && isFinite(Number(v.archived.price))) { endVal = Number(v.archived.price); endDate = v.archived.date; }
  else if (Number(v.value) > 0 && vtIsIso(v.valueDate)) { endVal = Number(v.value); endDate = v.valueDate; }
  if (endVal == null) return 0;
  const days = vtDiffDays(v.purchaseDate, endDate);
  if (days < 30) return 0;
  const perDay = (price - endVal) / days;
  return perDay > 0 ? perDay : 0;
}
function fzValueLoss(v, s, e) {
  const perDay = fzLossPerDay(v);
  if (!perDay) return 0;
  const a = s > v.purchaseDate ? s : v.purchaseDate;
  const own = fzEndDate(v);
  const b = e < own ? e : own;
  if (b < a) return 0;
  return perDay * (vtDiffDays(a, b) + 1);
}
// Balance of a vehicle: { total, groups, byMonth, km, months }
function fzBalanceFor(v, s, e) {
  const items = fzCostItems(v, s, e);
  const groups = {};
  const byMonth = {};
  let total = 0;
  items.forEach(it => {
    groups[it.group] = (groups[it.group] || 0) + it.amount;
    const mk = it.date.slice(0, 7);
    byMonth[mk] = (byMonth[mk] || 0) + it.amount;
    total += it.amount;
  });
  const loss = fzValueLoss(v, s, e);
  if (loss > 0) { groups.wertverlust = loss; total += loss; }
  const today = finTodayIso();
  const vs = fzStartDate(v);
  const ve = fzEndDate(v);
  const a = s > vs ? s : vs;
  let b = e < today ? e : today;
  if (b > ve) b = ve;
  const days = b >= a ? vtDiffDays(a, b) + 1 : 0;
  const km = b >= a ? fzKmIn(v, a, b) : 0;
  return { v, items, total, groups, byMonth, loss, km, days, months: Math.max(1, days / 30.44) };
}
function fzMonthlyCost(v) {
  const today = finTodayIso();
  const b = fzBalanceFor(v, vtAddDays(vtAddMonths(today, -12, false), 1), today);
  return b.total > 0 ? b.total / b.months : 0;
}
function fzCostPerKm(v) {
  const today = finTodayIso();
  const b = fzBalanceFor(v, vtAddDays(vtAddMonths(today, -12, false), 1), today);
  return b.km >= 200 && b.total > 0 ? b.total / b.km : null;
}

/* ---------- Notices & deadlines ---------- */
function fzLead(v) {
  const d = parseInt(v && v.autoTasks && v.autoTasks.days, 10);
  return FZ_REMIND_DAYS.includes(d) ? d : 30;
}
function fzTireSetting(v) {
  const t = (v && v.tires && typeof v.tires === 'object') ? v.tires : {};
  const W = parseInt(t.toWinter, 10), S = parseInt(t.toSummer, 10);
  return {
    mode: ['wechsel', 'ganzjahr', 'keine'].includes(t.mode) ? t.mode : 'wechsel',
    mounted: t.mounted === 'winter' ? 'winter' : 'sommer',
    toWinter: W >= 9 && W <= 12 ? W : 10,
    toSummer: S >= 2 && S <= 5 ? S : 4,
    size: t.size || '', storage: t.storage || '',
    sets: (t.sets && typeof t.sets === 'object') ? t.sets : {},
  };
}
// Next or current tire change: { need, start, key, days }
function fzTireChange(v, today) {
  const t = fzTireSetting(v);
  if (t.mode !== 'wechsel') return null;
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  let need, sy, start;
  if (t.mounted === 'sommer') {
    need = 'winter';
    sy = m < t.toSummer ? y - 1 : y;
    start = vtIso(sy, t.toWinter, 1);
  } else {
    need = 'sommer';
    sy = m >= t.toWinter ? y + 1 : y;
    start = vtIso(sy, t.toSummer, 1);
  }
  return { need, start, key: 'reifen:' + need + ':' + sy, days: vtDiffDays(today, start) };
}
function fzServiceState(v, today) {
  const sv = (v.service && typeof v.service === 'object') ? v.service : {};
  const months = parseInt(sv.months, 10) || 0;
  const kmInt = parseInt(sv.km, 10) || 0;
  const hasOdo = sv.lastOdo !== '' && sv.lastOdo != null && isFinite(Number(sv.lastOdo));
  if (!months && !kmInt) return null;
  if (!vtIsIso(sv.lastDate) && !hasOdo) return { missing: true };
  const dueDate = months && vtIsIso(sv.lastDate) ? vtAddMonths(sv.lastDate, months, false) : '';
  let kmLeft = null, kmDate = '';
  if (kmInt && hasOdo) {
    kmLeft = Number(sv.lastOdo) + kmInt - fzCurrentOdo(v);
    const perDay = fzKmPerDay(v);
    if (kmLeft <= 0) kmDate = today;
    else if (perDay > 0) kmDate = vtAddDays(today, Math.round(kmLeft / perDay));
  }
  const eff = [dueDate, kmDate].filter(Boolean).sort()[0] || '';
  return { dueDate, kmLeft, kmDate, eff, key: 'service:' + (sv.lastDate || '') + ':' + (hasOdo ? Number(sv.lastOdo) : '') };
}
// All notices of a vehicle. withInfo: also missing details and "all good" entries.
// -> [{ key, type, tone, icon, title, sub, when, date, task?, act, id? }]
function fzDueItems(v, today = finTodayIso(), withInfo = false) {
  const out = [];
  if (!v || fzIsArchived(v)) return out;
  const k = fzKind(v.kind);
  const name = fzShortName(v);
  const lead = fzLead(v);
  const stamp = '\n\nAus pinn. → Fahrzeuge → ' + fzName(v);

  // HU / TÜV (periodic vehicle inspection)
  if (k.hu) {
    const due = v.hu && fzIsYm(v.hu.due) ? v.hu.due : '';
    if (due) {
      const end = fzMonthEnd(due);
      const first = due + '-01';
      const days = vtDiffDays(today, end);
      const tone = days <= 30 ? 'urgent' : days <= 90 ? 'warn' : 'ok';
      out.push({
        key: 'hu:' + due, type: 'hu', tone, icon: '🔍', date: end, act: 'hu',
        title: days < 0 ? 'HU/TÜV überfällig' : 'HU/TÜV',
        sub: (days < 0 ? 'war fällig bis Ende ' : 'fällig bis Ende ') + fzMonthLabel(due) + ' · Plakette ' + fzPlakette(due),
        when: days < 0 ? 'überfällig' : fzWhen(days),
        task: {
          title: '🔍 HU/TÜV-Termin: ' + name, due: first > today ? first : today, createAfter: vtAddDays(first, -lead),
          notes: 'Hauptuntersuchung fällig bis Ende ' + fzMonthLabel(due) + '. Nach dem Termin in pinn. unter Fahrzeuge „Erledigt“ tippen – die nächste HU wird dann automatisch eingetragen.' + (days < -60 ? '\nMehr als 2 Monate überzogen: Es wird eine teurere Ergänzungsuntersuchung fällig.' : '') + stamp,
        },
      });
    } else if (withInfo) {
      out.push({ key: 'info:hu', type: 'info', tone: 'muted', icon: '🔍', title: 'HU-Termin fehlt', sub: 'Monat und Jahr von der Prüfplakette eintragen', when: '', date: '9999', act: 'edit' });
    }
  }

  // Inspection / maintenance
  const svc = fzServiceState(v, today);
  if (svc && svc.missing && withInfo) {
    out.push({ key: 'info:service', type: 'info', tone: 'muted', icon: '🔧', title: 'Letzte Inspektion fehlt', sub: 'Datum oder km-Stand der letzten Inspektion eintragen', when: '', date: '9999', act: 'edit' });
  } else if (svc && svc.eff) {
    const days = vtDiffDays(today, svc.eff);
    const over = days < 0 || (svc.kmLeft !== null && svc.kmLeft <= 0);
    const tone = over ? 'urgent' : (days <= 30 || (svc.kmLeft !== null && svc.kmLeft <= 1000)) ? 'warn' : 'ok';
    const parts = [];
    if (svc.dueDate) parts.push((svc.dueDate < today ? 'war fällig am ' : 'spätestens ') + vtFmt(svc.dueDate));
    if (svc.kmLeft !== null) parts.push(svc.kmLeft > 0 ? 'noch ' + fzKmText(svc.kmLeft) : fzKmText(-svc.kmLeft) + ' drüber');
    out.push({
      key: svc.key, type: 'service', tone, icon: '🔧', date: svc.eff, act: 'service',
      title: k.bike ? 'Fahrrad-Inspektion' : 'Inspektion',
      sub: parts.join(' · '), when: over ? 'fällig' : fzWhen(days),
      task: {
        title: '🔧 Inspektion: ' + name, due: svc.eff > today ? svc.eff : today, createAfter: vtAddDays(svc.eff, -lead),
        notes: 'Inspektion fällig' + (parts.length ? ' (' + parts.join(', ') + ')' : '') + '. Nach der Wartung in pinn. unter Fahrzeuge „Erledigt“ tippen.' + stamp,
      },
    });
  }

  // Tires
  if (k.tires) {
    const t = fzTireSetting(v);
    const ch = fzTireChange(v, today);
    if (ch) {
      const winter = ch.need === 'winter';
      const label = winter ? 'Winterreifen' : 'Sommerreifen';
      const monthName = FZ_MONTH_NAMES[Number(ch.start.slice(5, 7)) - 1];
      if (ch.days <= 0) {
        out.push({
          key: ch.key, type: 'reifen', tone: ch.days <= -30 ? 'urgent' : 'warn', icon: '🛞', date: ch.start, act: 'reifen', need: ch.need,
          title: label + ' aufziehen', sub: 'Wechsel ist seit ' + monthName + ' dran' + (t.storage ? ' · Reifen lagern: ' + t.storage : ''),
          when: 'jetzt',
          task: {
            title: '🛞 ' + label + ' aufziehen: ' + name, due: today, createAfter: vtAddDays(ch.start, -Math.min(Math.max(lead, 7), 21)),
            notes: (winter ? 'Faustregel „von O bis O“ – Oktober bis Ostern. Bei Glätte, Schnee oder Eis sind Winter- bzw. Ganzjahresreifen mit Alpine-Symbol Pflicht.' : 'Die Wintersaison ist vorbei – Sommerreifen haben bei Wärme den kürzeren Bremsweg.') + (t.storage ? '\nEingelagert: ' + t.storage : '') + stamp,
          },
        });
      } else {
        out.push({
          key: ch.key, type: 'reifen', tone: ch.days <= 21 ? 'warn' : 'ok', icon: '🛞', date: ch.start, act: 'reifen', need: ch.need,
          title: 'Nächster Reifenwechsel', sub: label + ' ab ' + monthName + ' ' + ch.start.slice(0, 4), when: fzWhen(ch.days),
          task: {
            title: '🛞 ' + label + ' aufziehen: ' + name, due: ch.start, createAfter: vtAddDays(ch.start, -Math.min(Math.max(lead, 7), 21)),
            notes: (winter ? 'Faustregel „von O bis O“ – Oktober bis Ostern. Rechtzeitig einen Termin in der Werkstatt machen.' : 'Ab Ostern wieder auf Sommerreifen wechseln.') + (t.storage ? '\nEingelagert: ' + t.storage : '') + stamp,
          },
        });
      }
    }
    // Tread depth and age
    const relevant = t.mode === 'ganzjahr' ? ['ganzjahr'] : t.mode === 'wechsel' ? ['sommer', 'winter'] : [];
    const setLabel = { sommer: 'Sommerreifen', winter: 'Winterreifen', ganzjahr: 'Ganzjahresreifen' };
    relevant.forEach(sid => {
      const set = t.sets[sid] || {};
      const tread = Number(set.tread);
      if (tread > 0) {
        const min = sid === 'sommer' ? 3 : 4;
        if (tread <= 1.6) out.push({ key: 'tread:' + sid, type: 'info', tone: 'urgent', icon: '🛞', title: setLabel[sid] + ': Profil ' + fzNum(tread, 1) + ' mm', sub: 'Unter dem gesetzlichen Minimum von 1,6 mm – nicht mehr fahren', when: '', date: '0000', act: 'edit' });
        else if (tread < min) out.push({ key: 'tread:' + sid, type: 'info', tone: 'warn', icon: '🛞', title: setLabel[sid] + ': Profil ' + fzNum(tread, 1) + ' mm', sub: 'Empfohlen sind mindestens ' + min + ' mm – neue Reifen einplanen', when: '', date: '9990', act: 'edit' });
      }
      const dot = parseInt(set.dot, 10);
      if (dot > 1990) {
        const age = Number(today.slice(0, 4)) - dot;
        if (age >= 8) out.push({ key: 'age:' + sid, type: 'info', tone: 'warn', icon: '🛞', title: setLabel[sid] + ' sind ' + age + ' Jahre alt', sub: 'Gummi härtet mit der Zeit aus – Austausch empfohlen', when: '', date: '9991', act: 'edit' });
        else if (age >= 6 && withInfo) out.push({ key: 'age:' + sid, type: 'info', tone: 'muted', icon: '🛞', title: setLabel[sid] + ' sind ' + age + ' Jahre alt', sub: 'Beim nächsten Wechsel genau prüfen lassen', when: '', date: '9995', act: 'edit' });
      }
    });
  }

  // Insurance plate (e-scooter, moped): valid from 1 March to the end of February each time
  if (k.vk && v.vk !== false) {
    const y = Number(today.slice(0, 4));
    let start = vtIso(y, 3, 1);
    if (today >= start || Number(v.vkDoneYear) >= y) start = vtIso(Number(v.vkDoneYear) >= y + 1 ? y + 2 : y + 1, 3, 1);
    const days = vtDiffDays(today, start);
    if (days <= 45 || withInfo) {
      out.push({
        key: 'vk:' + start.slice(0, 4), type: 'vk', tone: days <= 7 ? 'urgent' : days <= 45 ? 'warn' : 'ok', icon: '🪪', date: start, act: 'vk',
        title: 'Neues Versicherungskennzeichen', sub: 'Das alte gilt nur bis Ende Februar – ab 1. März ' + start.slice(0, 4) + ' das neue montieren', when: fzWhen(days),
        task: {
          title: '🪪 Versicherungskennzeichen besorgen: ' + name, due: vtAddDays(start, -7) > today ? vtAddDays(start, -7) : today, createAfter: vtAddDays(start, -Math.max(lead, 30)),
          notes: 'Ohne gültiges Versicherungskennzeichen besteht kein Versicherungsschutz. Neues Kennzeichen (neue Farbe) bei der Versicherung bestellen und ab 1. März montieren.' + stamp,
        },
      });
    }
  }

  // Own deadlines
  (Array.isArray(v.deadlines) ? v.deadlines : []).forEach(d => {
    if (!d || !vtIsIso(d.date)) return;
    const days = vtDiffDays(today, d.date);
    const tone = days <= 7 ? 'urgent' : days <= 30 ? 'warn' : 'ok';
    out.push({
      key: 'frist:' + d.id + ':' + d.date, type: 'frist', id: d.id, tone, icon: '📅', date: d.date, act: 'frist',
      title: d.label || 'Frist', sub: (days < 0 ? 'war am ' : 'am ') + vtFmt(d.date), when: days < 0 ? 'überfällig' : fzWhen(days),
      task: { title: '📅 ' + (d.label || 'Frist') + ': ' + name, due: d.date > today ? d.date : today, createAfter: vtAddDays(d.date, -lead), notes: 'Frist am ' + vtFmt(d.date) + '.' + stamp },
    });
  });

  // Contracts (insurance & co.) with a notice period
  fzContractsFor(v.id).forEach(c => {
    const vw = vtStatusView(c, today);
    if (vw.tone === 'warn' || vw.tone === 'urgent') {
      out.push({ key: 'vertrag:' + c.id, type: 'contract', id: c.id, tone: vw.tone, icon: '🛡️', title: c.name || 'Vertrag', sub: vw.label, when: vw.sub ? vw.sub.split(' · ')[0] : '', date: vw.sortKey, act: 'contract' });
    }
  });
  if (withInfo && k.insure && !fzContractsFor(v.id).length) {
    out.push({ key: 'info:insure', type: 'info', tone: 'muted', icon: '🛡️', title: 'Keine Versicherung zugeordnet', sub: 'Vertrag aus Finanzen → Verträge zuordnen oder neu anlegen', when: '', date: '9999', act: 'assign' });
  }

  return out
    .filter(it => withInfo || it.tone === 'urgent' || it.tone === 'warn')
    .sort((a, b) => fzToneRank(a.tone) - fzToneRank(b.tone) || String(a.date).localeCompare(String(b.date)));
}

/* ---------- Automatic tasks ---------- */
// Fixed task ID from family, vehicle and occasion (15 characters a-z0-9 as with PocketBase)
function fzTaskId(seed) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let round = 0; out.length < 15; round++) {
    const str = seed + '#' + round;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    for (let j = 0; j < 5 && out.length < 15; j++) { out += chars[h % 36]; h = Math.floor(h / 36); }
  }
  return out;
}
function fzAutoSettings(v) {
  const a = (v && v.autoTasks && typeof v.autoTasks === 'object') ? v.autoTasks : {};
  return { on: a.on !== false, days: fzLead(v), to: Array.isArray(a.to) ? a.to.filter(id => memberById(id)) : [], made: (a.made && typeof a.made === 'object') ? a.made : {}, remindAt: taskRemindValid(a.remindAt) ? a.remindAt : '' };
}
function fzTaskTargets(v) {
  const a = fzAutoSettings(v);
  if (a.to.length) return a.to;
  return v.holder && memberById(v.holder) ? [v.holder] : [];
}
function fzTaskFor(v, key) {
  const rec = fzAutoSettings(v).made[key];
  if (!rec || !rec.id) return null;
  const t = (typeof aufgaben !== 'undefined' ? aufgaben : []).find(a => a.id === rec.id);
  return { id: rec.id, at: rec.at || '', task: t || null, done: !!(t && t.done) };
}
function fzRunAutoTasks() {
  if (fzRunningAuto || !finance || !familyRecordId || !finFamilyKey() || isCurrentUserGuest()) return 0;
  if (typeof queueTaskSave !== 'function') return 0;
  fzRunningAuto = true;
  let created = 0;
  try {
    const today = finTodayIso();
    const fam = finFamilyKey();
    const next = fzVehicles().map(v => {
      const a = fzAutoSettings(v);
      if (fzIsArchived(v) || !a.on) return v;
      const made = { ...a.made };
      let changed = false;
      fzDueItems(v, today, true).forEach(it => {
        if (!it.task || made[it.key] || created >= 12) return;
        if (it.task.createAfter && today < it.task.createAfter) return;
        const id = fzTaskId('fz|' + fam + '|' + v.id + '|' + it.key);
        queueTaskSave({ id, title: String(it.task.title).slice(0, 200), notes: buildAssignedNotes(it.task.notes || '', fzTaskTargets(v)), dueDate: it.task.due, fromTime: '', toTime: '', remindAt: a.remindAt }, true);
        made[it.key] = { id, at: today };
        changed = true;
        created++;
      });
      if (!changed) return v;
      const keys = Object.keys(made).sort((x, y) => String((made[y] && made[y].at) || '').localeCompare(String((made[x] && made[x].at) || '')));
      keys.slice(40).forEach(key => { delete made[key]; });
      return { ...v, autoTasks: { ...(v.autoTasks || {}), on: a.on, days: a.days, to: a.to, made, remindAt: a.remindAt } };
    });
    if (created) {
      finance.vehicles = next;
      persistState();
      rebuildAufgaben();
      renderTasks();
      flushOutbox();
      if (currentView === 'fahrzeuge') renderVehicles();
    }
  } catch (err) {
    console.warn('Fahrzeuge: automatische Aufgaben fehlgeschlagen', err);
  } finally {
    fzRunningAuto = false;
    fzLastAutoRun = Date.now();
  }
  return created;
}
function fzScheduleAutoTasks(delay = 1500) {
  clearTimeout(fzAutoTimer);
  fzAutoTimer = setTimeout(fzRunAutoTasks, delay);
}
// Tick off the task of a completed occasion
function fzCompleteTask(v, key) {
  const t = fzTaskFor(v, key);
  if (!t || !t.task || t.done || typeof queueTaskDone !== 'function') return;
  queueTaskDone(t.id, true);
  rebuildAufgaben();
  renderTasks();
  flushOutbox();
}
// Since 1.57: tapping a vehicle task opens the matching entry (HU, inspection, tyres …); saving it ticks the task off
const FZ_TASK_ACT_LABELS = { hu: '🔍 HU eintragen', service: '🔧 Inspektion eintragen', reifen: '🛞 Reifenwechsel eintragen', vk: '🪪 Kennzeichen eintragen', frist: '✓ Frist erledigt' };
function fzTaskAction(task) {
  if (!task || task.done || task.household || !finance || isCurrentUserGuest()) return null;
  for (const v of fzVehicles()) {
    if (fzIsArchived(v)) continue;
    const made = fzAutoSettings(v).made;
    const key = Object.keys(made).find(k => made[k] && made[k].id === task.id);
    if (!key) continue;
    const it = fzDueItems(v, finTodayIso(), true).find(x => x.key === key);
    if (!it || !FZ_TASK_ACT_LABELS[it.act]) return null;
    return { label: FZ_TASK_ACT_LABELS[it.act], run: () => fzDueDone(v.id, key) };
  }
  return null;
}
// Start after the app has loaded: check once, then every 30 minutes (only while visible)
function fzStart() {
  if (isCurrentUserGuest()) return;
  fzScheduleAutoTasks(4000);
  // Move older vehicle documents (Finanzen) to "Dokumente"
  setTimeout(() => {
    if (!fzVehicles().length || isCurrentUserGuest()) return;
    Promise.all([loadFinDocs(), loadDocuments()]).then(() => fzMigrateLegacyDocs()).catch(() => { /* offline */ });
  }, 8000);
  setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - fzLastAutoRun > 25 * 60 * 1000) fzRunAutoTasks();
  }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - fzLastAutoRun > 10 * 60 * 1000) fzScheduleAutoTasks(3000);
  });
}

/* ---------- Titles & labels ---------- */
function fzLogTitle(l) {
  const t = fzLogType(l.type);
  if (l.type === 'tanken' || l.type === 'laden') {
    const f = FZ_FUELS[fzLogFuel(l)];
    const q = Number(l.qty) > 0 ? fzNum(l.qty, f.unit === 'kWh' ? 1 : 2) + ' ' + f.unit + ' ' : '';
    return q + (l.sort || f.label) + (l.type === 'laden' && l.where ? ' · ' + ((FZ_CHARGE_WHERE.find(w => w.id === l.where) || {}).label || '') : '');
  }
  if (l.type === 'km') return 'Kilometerstand ' + fzKmText(l.odo);
  if (l.type === 'hu') return 'HU / TÜV' + (l.huResult ? ' · ' + l.huResult : '');
  return l.desc || t.label;
}
function fzExpenseTitle(l, v) {
  const t = fzLogType(l.type);
  if (l.type === 'tanken') return 'Tanken · ' + fzName(v);
  if (l.type === 'laden') return 'Laden · ' + fzName(v);
  return (l.desc || t.label) + ' · ' + fzName(v);
}
function fzDocTypeLabel(id) {
  const t = FZ_DOC_TYPES.find(x => x.id === id) || (typeof finDocType === 'function' ? finDocType(id) : null);
  return t || FZ_DOC_TYPES[FZ_DOC_TYPES.length - 1];
}
function fzLinkLabel(id) {
  const v = fzVehicle(id);
  return v ? fzKind(v.kind).icon + ' ' + fzName(v) : '';
}

/* ---------- Page ---------- */
function fzCard(inner, extra = '') { return `<div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5 ${extra}">${inner}</div>`; }
function fzTile(label, value, sub = '') { return finTile(escapeHtml(label), value, sub ? escapeHtml(sub) : ''); }
function fzEur(v) { return fmtEur(v || 0); }
function renderVehicles() {
  renderKassePills();
  const pane = document.getElementById('fzPane');
  if (!pane || !finance) return;
  document.querySelectorAll('.fz-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.fztab === fzTab));
  const hb = document.getElementById('fzHeaderBtn');
  const inDetail = fzTab === 'liste' && fzDetailId && fzVehicle(fzDetailId);
  hb.textContent = inDetail ? '+ Eintrag' : '+ Fahrzeug';
  hb.classList.toggle('hidden', fzTab === 'rechner');
  if (fzTab === 'bilanz') { fzToolsBuilt = false; renderVehicleBalance(pane); return; }
  if (fzTab === 'rechner') { if (!fzToolsBuilt) renderVehicleTools(pane); return; }
  fzToolsBuilt = false;
  if (inDetail) { renderVehicleDetail(pane, fzVehicle(fzDetailId)); return; }
  fzDetailId = null;
  renderVehicleList(pane);
}
function fzOpenVehicle(id) {
  if (!fzVehicle(id)) return;
  fzDetailId = id;
  fzTab = 'liste';
  fzLogFilter = 'alle';
  fzLogLimit = 25;
  if (currentView !== 'fahrzeuge') setView('fahrzeuge'); else renderVehicles();
  const sc = document.getElementById('fzScroll');
  if (sc) sc.scrollTop = 0;
  ensureFinDocToken().then(refreshDocLinks);
  Promise.all([loadFinDocs(), loadDocuments()]).then(() => fzMigrateLegacyDocs()).catch(() => { /* offline */ });
}
function fzBackToList() {
  fzDetailId = null;
  renderVehicles();
  const sc = document.getElementById('fzScroll');
  if (sc) sc.scrollTop = 0;
}
function fzDueRowHtml(v, it, showVehicle) {
  const t = it.task ? fzTaskFor(v, it.key) : null;
  const taskChip = t ? (t.done ? '<span class="vt-chip">✓ Aufgabe erledigt</span>' : (t.task ? '<span class="vt-chip muted">✅ Aufgabe angelegt</span>' : '')) : '';
  const doneBtn = ['hu', 'service', 'reifen', 'vk', 'frist'].includes(it.act) && it.tone !== 'ok'
    ? `<span role="button" tabindex="0" class="fz-mini-btn primary" data-fzact="due-done" data-v="${escapeHtml(v.id)}" data-key="${escapeHtml(it.key)}">Erledigt</span>` : '';
  return `
    <div class="fz-due-row ${it.tone}" role="button" tabindex="0" data-fzact="due-open" data-v="${escapeHtml(v.id)}" data-key="${escapeHtml(it.key)}">
      <span class="fz-due-ic">${escapeHtml(it.icon || '🔔')}</span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-medium truncate">${escapeHtml(it.title)}${showVehicle ? ` <span class="text-ink/45 font-normal">· ${escapeHtml(fzName(v))}</span>` : ''}</span>
        <span class="block text-xs text-ink/55 truncate">${escapeHtml(it.sub || '')}</span>
        ${taskChip ? `<span class="flex gap-1 mt-1">${taskChip}</span>` : ''}
      </span>
      ${it.when ? `<span class="vt-chip ${it.tone === 'ok' ? '' : it.tone}">${escapeHtml(it.when)}</span>` : ''}
      ${doneBtn}
    </div>`;
}

/* ---------- List ---------- */
function renderVehicleList(pane) {
  const today = finTodayIso();
  const active = fzActiveVehicles();
  const archived = fzVehicles().filter(fzIsArchived);
  if (!fzVehicles().length) {
    pane.innerHTML = `
      <div class="rounded-2xl bg-white border border-dashed border-ink/20 p-6 text-center">
        <div class="fz-empty-car mb-2">🚗</div>
        <div class="font-serif text-lg mb-1">Noch keine Fahrzeuge</div>
        <p class="text-xs text-ink/50 mb-4">Autos, E-Autos, Motorräder, E-Bikes und Fahrräder der Familie: Tanken &amp; Laden, Verbrauch, Werkstatt, Versicherung, Dokumente und eine Bilanz aller Kosten. HU, Inspektion und Reifenwechsel landen rechtzeitig als Aufgabe bei der richtigen Person.</p>
        <div class="flex flex-wrap justify-center gap-2">
          ${FZ_KINDS.map(k => `<button type="button" class="fz-kind-btn px-3 py-2 text-sm" data-fzact="new-kind" data-kind="${k.id}">${k.icon} ${escapeHtml(k.label)}</button>`).join('')}
        </div>
      </div>`;
    return;
  }
  const rows = active.map(v => ({ v, monthly: fzMonthlyCost(v), cons: fzMainConsumption(v), due: fzDueItems(v, today), odo: fzCurrentOdo(v) }));
  const totalMonthly = rows.reduce((s, r) => s + r.monthly, 0);
  const kmYear = rows.reduce((s, r) => s + fzKmPerDay(r.v) * 365, 0);
  const allDue = [];
  rows.forEach(r => r.due.forEach(it => allDue.push({ v: r.v, it })));
  allDue.sort((a, b) => fzToneRank(a.it.tone) - fzToneRank(b.it.tone) || String(a.it.date).localeCompare(String(b.it.date)));

  const summary = fzCard(`
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="text-[11px] uppercase tracking-wide text-ink/40">Kosten aller Fahrzeuge</div>
        <div class="font-serif text-2xl">${fzEur(totalMonthly)} <span class="text-sm text-ink/45 font-sans">/ Monat</span></div>
        <div class="text-xs text-ink/50">Durchschnitt der letzten 12 Monate · alles inklusive</div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-[11px] uppercase tracking-wide text-ink/40">Fahrzeuge</div>
        <div class="font-serif text-2xl">${active.length}</div>
        <div class="text-xs text-ink/50">${kmYear > 0 ? '≈ ' + fzKmText(Math.round(kmYear / 100) * 100) + ' / Jahr' : '&nbsp;'}</div>
      </div>
    </div>`);

  const dueHtml = allDue.length ? `
    <div class="rounded-2xl border border-mustard/40 bg-mustard/10 p-4">
      <div class="text-sm font-medium mb-2">⏰ Im Blick</div>
      <div class="flex flex-col gap-1.5">${allDue.slice(0, 12).map(x => fzDueRowHtml(x.v, x.it, true)).join('')}</div>
    </div>` : '';

  const cards = rows.map(r => {
    const v = r.v;
    const d = fzDrive(v);
    const sub = [[v.make, v.model].filter(Boolean).join(' '), d.id ? d.icon + ' ' + d.label : '', r.odo ? fzKmText(r.odo) : ''].filter(Boolean).map(escapeHtml).join(' · ');
    const firstDue = r.due[0];
    return `
      <button type="button" class="fz-card" style="--fz:${fzColor(v)}" data-fzact="open" data-v="${escapeHtml(v.id)}">
        <span class="fz-icon">${escapeHtml(fzKind(v.kind).icon)}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${escapeHtml(fzName(v))}</span>
          <span class="block text-xs text-ink/45 truncate">${sub || escapeHtml(fzKind(v.kind).label)}</span>
          <span class="flex items-center gap-1.5 mt-1.5 flex-wrap">
            ${fzPlateHtml(v.plate)}
            ${firstDue ? `<span class="vt-chip ${firstDue.tone}">${escapeHtml(firstDue.icon + ' ' + firstDue.title)}</span>` : '<span class="vt-chip">✓ alles im grünen Bereich</span>'}
          </span>
        </span>
        <span class="shrink-0 text-right">
          <span class="block text-sm font-semibold">${r.monthly > 0 ? fzEur(r.monthly) : '–'}</span>
          <span class="block text-[11px] text-ink/45">pro Monat</span>
          ${r.cons ? `<span class="block text-[11px] text-ink/45 mt-1">${r.cons.estimated ? '≈ ' : 'Ø '}${fzNum(r.cons.avg, 1)} ${escapeHtml(r.cons.unit.replace('/100 km', ''))}</span>` : ''}
        </span>
      </button>`;
  }).join('');

  const archHtml = archived.length ? `
    <details class="vt-more rounded-2xl bg-white border border-ink/10 shadow-sm px-4 py-3"${fzShowArchived ? ' open' : ''} data-fzdetails="archived">
      <summary class="text-sm cursor-pointer select-none">🗄️ Verkauft &amp; abgemeldet (${archived.length})</summary>
      <div class="flex flex-col gap-2 mt-3">${archived.map(v => `
        <button type="button" class="fz-card is-archived" style="--fz:${fzColor(v)}" data-fzact="open" data-v="${escapeHtml(v.id)}">
          <span class="fz-icon">${escapeHtml(fzKind(v.kind).icon)}</span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium truncate">${escapeHtml(fzName(v))}</span>
            <span class="block text-xs text-ink/45 truncate">seit ${escapeHtml(vtFmt(v.archived.date))}${Number(v.archived.price) > 0 ? ' · verkauft für ' + escapeHtml(fzEur(v.archived.price)) : ''}</span>
          </span>
        </button>`).join('')}</div>
    </details>` : '';

  pane.innerHTML = summary + dueHtml + (cards ? `<div class="flex flex-col gap-2">${cards}</div>` : '<p class="text-sm text-ink/40 italic text-center py-4">Kein aktives Fahrzeug.</p>') + archHtml;
  const det = pane.querySelector('[data-fzdetails="archived"]');
  if (det) det.addEventListener('toggle', () => { fzShowArchived = det.open; });
}

/* ---------- Detail ---------- */
function fzBarsHtml(values, labels, color, opts = {}) {
  const H = opts.height || 110;
  const max = Math.max(1e-9, ...values, opts.avg || 0);
  const avgLine = opts.avg ? `<span class="fz-avg-line" style="bottom:${opts.avg / max * H + 16}px"><span class="fz-avg-tag">Ø ${escapeHtml(opts.avgLabel || '')}</span></span>` : '';
  const cols = values.map((val, i) => `
    <span class="fz-bar-col" title="${escapeHtml((labels[i] || '') + ': ' + (opts.fmt ? opts.fmt(val) : val))}">
      <span class="text-[9px] text-ink/45 whitespace-nowrap">${val > 0 ? escapeHtml(opts.short ? opts.short(val) : '') : ''}</span>
      <span class="fz-bar-track" style="height:${H}px"><span style="height:${val > 0 ? Math.max(3, val / max * H) : 0}px;background:${opts.colors ? opts.colors[i] : color}"></span></span>
      <span class="text-[9px] text-ink/45 leading-tight text-center">${escapeHtml(labels[i] || '')}</span>
    </span>`).join('');
  return `<div class="relative"><div class="fz-bars">${cols}</div>${avgLine}</div>`;
}
function renderVehicleDetail(pane, v) {
  const today = finTodayIso();
  const k = fzKind(v.kind);
  const d = fzDrive(v);
  const archived = fzIsArchived(v);
  const odo = fzCurrentOdo(v);
  const logs = fzLogsFor(v.id);
  const due = fzDueItems(v, today, true);
  const cons = fzMainFuels(v).map(f => fzConsumption(v, f)).filter(Boolean);
  const e100 = fzEnergyPer100(v);
  const monthly = fzMonthlyCost(v);
  const perKm = fzCostPerKm(v);
  const kmYear = fzKmPerDay(v) * 365;
  const holder = v.holder ? memberById(v.holder) : null;

  // Header
  const actions = archived ? `
      <button type="button" class="fz-act-btn" data-fzact="unarchive" data-v="${escapeHtml(v.id)}"><span class="fz-ti">♻️</span>Wieder aktiv</button>
      <button type="button" class="fz-act-btn" data-fzact="edit" data-v="${escapeHtml(v.id)}"><span class="fz-ti">✎</span>Bearbeiten</button>` : `
      ${fzCanFuel(v) ? `<button type="button" class="fz-act-btn primary" data-fzact="log-new" data-type="tanken" data-v="${escapeHtml(v.id)}"><span class="fz-ti">⛽</span>Tanken</button>` : ''}
      ${fzCanCharge(v) ? `<button type="button" class="fz-act-btn${fzCanFuel(v) ? '' : ' primary'}" data-fzact="log-new" data-type="laden" data-v="${escapeHtml(v.id)}"><span class="fz-ti">🔌</span>Laden</button>` : ''}
      <button type="button" class="fz-act-btn${fzFuels(v).length ? '' : ' primary'}" data-fzact="log-new" data-type="" data-v="${escapeHtml(v.id)}"><span class="fz-ti">➕</span>Eintrag</button>
      <button type="button" class="fz-act-btn" data-fzact="edit" data-v="${escapeHtml(v.id)}"><span class="fz-ti">✎</span>Bearbeiten</button>`;
  const hero = `
    <div class="fz-hero" style="--fz:${fzColor(v)}">
      ${fzSceneHtml(v)}
      <div class="fz-hero-icon"><span>${escapeHtml(k.icon)}</span></div>
      <div class="fz-hero-body">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-serif text-xl leading-tight truncate">${escapeHtml(fzName(v))}</h3>
            <div class="text-xs text-ink/50 truncate">${escapeHtml([[v.make, v.model].filter(Boolean).join(' '), k.label].filter(Boolean).join(' · '))}</div>
          </div>
          ${fzPlateHtml(v.plate, true)}
        </div>
        <div class="flex items-center gap-1.5 flex-wrap mt-2">
          ${d.id ? `<span class="vt-chip">${escapeHtml(d.icon + ' ' + d.label)}</span>` : ''}
          ${odo ? `<span class="vt-chip muted">📍 ${escapeHtml(fzKmText(odo))}</span>` : ''}
          ${holder ? `<span class="vt-chip muted">👤 ${escapeHtml(memberLabel(holder))}</span>` : ''}
          ${archived ? `<span class="vt-chip warn">🗄️ seit ${escapeHtml(vtFmt(v.archived.date))} nicht mehr in der Familie</span>` : ''}
        </div>
        <div class="flex gap-2 mt-3">${actions}</div>
      </div>
    </div>`;

  // Notices
  const dueHtml = due.length ? fzCard(`
    <div class="fz-h">🔔 Hinweise &amp; Termine</div>
    <div class="flex flex-col gap-1.5">${due.map(it => fzDueRowHtml(v, it, false)).join('')}</div>
    ${!archived ? `<p class="text-[11px] text-ink/45 mt-2">${fzAutoSettings(v).on ? `Automatische Aufgaben: ${fzLead(v)} Tage vorher${fzTaskTargets(v).length ? ' für ' + escapeHtml(fzTaskTargets(v).map(id => memberLabel(memberById(id))).join(', ')) : ''}.` : 'Automatische Aufgaben sind für dieses Fahrzeug aus.'}</p>` : ''}`) : '';

  // Key figures
  const consTile = cons.length
    ? fzTile('Ø Verbrauch' + (cons.length > 1 ? ' · ' + FZ_FUELS[cons[0].fuel].label : ''), (cons[0].estimated ? '≈ ' : '') + fzNum(cons[0].avg, 1) + ' <span class="text-xs font-normal">' + escapeHtml(cons[0].unit) + '</span>', cons.length > 1 ? cons.slice(1).map(c => FZ_FUELS[c.fuel].label + ' ' + fzNum(c.avg, 1) + ' ' + c.unit).join(' · ') : (cons[0].estimated ? 'geschätzt – „voll“ markieren macht es genau' : 'aus ' + cons[0].segs.length + ' Tankfüllungen'))
    : (fzFuels(v).length ? fzTile('Ø Verbrauch', '–', 'ab 2 Einträgen mit km-Stand') : fzTile('Fahrleistung', kmYear > 0 ? fzKmText(Math.round(kmYear)) : '–', 'pro Jahr'));
  const tiles = `
    <div class="grid grid-cols-2 gap-2">
      ${consTile}
      ${fzTile('Kosten / Monat', monthly > 0 ? fzEur(monthly) : '–', 'letzte 12 Monate, alles inkl.')}
      ${fzTile('Vollkosten / km', perKm != null ? fmtEur(perKm) : '–', e100 != null ? 'Energie: ' + fzEur(e100) + ' / 100 km' : 'ab ein paar hundert km')}
      ${fzTile('Fahrleistung', kmYear > 0 ? fzKmText(Math.round(kmYear / 10) * 10) : '–', kmYear > 0 ? 'pro Jahr (hochgerechnet)' : 'km-Stände eintragen')}
    </div>`;

  // Consumption chart
  let chart = '';
  const segCons = cons.find(c => c.segs.length >= 2);
  if (segCons) {
    const segs = segCons.segs.slice(-12);
    chart = fzCard(`
      <div class="fz-h">📈 Verbrauch je Tankfüllung · ${escapeHtml(FZ_FUELS[segCons.fuel].label)}</div>
      ${fzBarsHtml(segs.map(s => s.value), segs.map(s => s.date.slice(8, 10) + '.' + s.date.slice(5, 7) + '.'), fzColor(v), { avg: segCons.avg, avgLabel: fzNum(segCons.avg, 1), short: val => fzNum(val, 1), fmt: val => fzNum(val, 1) + ' ' + segCons.unit })}
      <p class="text-[11px] text-ink/45 mt-2">${escapeHtml(segCons.unit)} zwischen zwei vollen Füllungen · insgesamt ${escapeHtml(fzKmText(segCons.km))} ausgewertet</p>`);
  }

  // Appointments & maintenance
  const trows = [];
  if (k.hu) trows.push(['HU / TÜV', v.hu && fzIsYm(v.hu.due) ? fzMonthLabel(v.hu.due) + ' (' + fzPlakette(v.hu.due) + ')' : 'nicht eingetragen']);
  const svc = fzServiceState(v, today);
  const sv = v.service || {};
  if (svc && !svc.missing) trows.push(['Nächste Inspektion', [svc.dueDate ? vtFmt(svc.dueDate) : '', svc.kmLeft !== null ? (svc.kmLeft > 0 ? 'in ' + fzKmText(svc.kmLeft) : 'km erreicht') : ''].filter(Boolean).join(' · ') || '–']);
  if (vtIsIso(sv.lastDate) || Number(sv.lastOdo) > 0) trows.push(['Letzte Inspektion', [vtIsIso(sv.lastDate) ? vtFmt(sv.lastDate) : '', Number(sv.lastOdo) > 0 ? fzKmText(sv.lastOdo) : ''].filter(Boolean).join(' · ')]);
  if (parseInt(sv.months, 10) || parseInt(sv.km, 10)) trows.push(['Intervall', [parseInt(sv.months, 10) ? 'alle ' + parseInt(sv.months, 10) + ' Monate' : '', parseInt(sv.km, 10) ? 'alle ' + fzKmText(parseInt(sv.km, 10)) : ''].filter(Boolean).join(' oder ')]);
  if (k.tires) {
    const t = fzTireSetting(v);
    const lbl = { sommer: 'Sommerreifen', winter: 'Winterreifen' };
    if (t.mode === 'wechsel') trows.push(['Reifen', lbl[t.mounted] + ' montiert · Wechsel ' + FZ_MONTH_NAMES[t.toWinter - 1].slice(0, 3) + '/' + FZ_MONTH_NAMES[t.toSummer - 1].slice(0, 3)]);
    else if (t.mode === 'ganzjahr') trows.push(['Reifen', 'Ganzjahresreifen']);
    if (t.size) trows.push(['Reifengröße', t.size]);
    ['sommer', 'winter', 'ganzjahr'].forEach(sid => {
      const s = t.sets[sid];
      if (s && (s.dot || s.tread)) trows.push([{ sommer: 'Sommersatz', winter: 'Wintersatz', ganzjahr: 'Ganzjahressatz' }[sid], [s.dot ? 'DOT ' + s.dot : '', Number(s.tread) > 0 ? fzNum(s.tread, 1) + ' mm Profil' : ''].filter(Boolean).join(' · ')]);
    });
    if (t.storage) trows.push(['Eingelagert', t.storage]);
  }
  const deadlines = (Array.isArray(v.deadlines) ? v.deadlines : []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const termine = fzCard(`
    <div class="flex items-center justify-between gap-2 mb-1">
      <div class="fz-h" style="margin:0">🗓️ Termine &amp; Wartung</div>
      ${archived ? '' : `<button type="button" class="fz-mini-btn" data-fzact="deadline-new" data-v="${escapeHtml(v.id)}">+ Frist</button>`}
    </div>
    ${trows.length ? `<div>${trows.map(r => `<div class="vt-row"><span>${escapeHtml(r[0])}</span><span>${escapeHtml(r[1])}</span></div>`).join('')}</div>` : '<p class="text-xs text-ink/45">Unter „Bearbeiten“ HU, Inspektions-Intervall und Reifen eintragen – pinn. erinnert dann rechtzeitig.</p>'}
    ${deadlines.length ? `<div class="mt-2">${deadlines.map(x => `<div class="vt-row"><span>📅 ${escapeHtml(x.label || 'Frist')}</span><span><button type="button" class="hover:text-pine" data-fzact="deadline-edit" data-v="${escapeHtml(v.id)}" data-id="${escapeHtml(x.id)}">${escapeHtml(vtFmt(x.date))} ✎</button></span></div>`).join('')}</div>` : '<p class="text-[11px] text-ink/45 mt-2">Eigene Fristen, z. B. Verbandkasten, Garantie, Leasingende, Vignette oder Akku-Garantie.</p>'}`);

  // Contracts
  const contracts = fzContractsFor(v.id);
  const cRows = contracts.map(c => {
    const vw = vtStatusView(c, today);
    const cost = vtCost(c, today);
    const cat = vtCategory(c.category);
    return `
      <button type="button" class="fz-log-row" data-fzact="contract" data-id="${escapeHtml(c.id)}">
        <span class="fz-log-ic" style="background:${vtCatColor(cat)}22">${escapeHtml(cat.icon || '📄')}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${escapeHtml(c.name || 'Vertrag')}</span>
          <span class="block text-xs text-ink/45 truncate">${escapeHtml([c.provider, vw.label].filter(Boolean).join(' · '))}</span>
        </span>
        <span class="shrink-0 text-right">
          ${cost ? `<span class="block text-sm font-semibold">${fzEur(cost.amount)}</span><span class="block text-[11px] text-ink/45">${escapeHtml(vtIntervalLabel(cost.interval))}</span>` : '<span class="block text-[11px] text-ink/40">ohne Kosten</span>'}
        </span>
      </button>`;
  }).join('');
  const taxRec = v.taxRecId ? finance.recurring.find(r => r.id === v.taxRecId) : null;
  const fixRows = fzVehicleRecurring(v.id).map(r => `
      <div class="vt-row"><span>${escapeHtml(r.title || 'Fixkosten')}</span><span>${fzEur(finRecurringAmountFor(r, today))} ${escapeHtml(vtIntervalLabel(finRecInterval(r)))}${finRecIsRunning(r, today) ? '' : ' · beendet'}</span></div>`).join('');
  const vertraege = fzCard(`
    <div class="flex items-center justify-between gap-2 mb-1">
      <div class="fz-h" style="margin:0">🛡️ Versicherung &amp; Verträge</div>
      ${archived ? '' : `<span class="flex gap-1.5"><button type="button" class="fz-mini-btn" data-fzact="contract-assign" data-v="${escapeHtml(v.id)}">Zuordnen</button><button type="button" class="fz-mini-btn primary" data-fzact="contract-new" data-v="${escapeHtml(v.id)}">+ Neu</button></span>`}
    </div>
    ${cRows ? `<div class="flex flex-col">${cRows}</div>` : `<p class="text-xs text-ink/45">${k.insure ? 'Kfz-Versicherung, Schutzbrief, Leasing oder Finanzierung aus Finanzen → Verträge zuordnen – Kosten und Kündigungsfristen erscheinen dann hier.' : 'Z. B. Fahrradversicherung, Leasing (Jobrad) oder Diebstahlschutz zuordnen.'}</p>`}
    ${fixRows ? `<div class="mt-2">${fixRows}</div>` : ''}
    ${!taxRec && k.plate && d.id && !archived ? '<p class="text-[11px] text-ink/45 mt-2">Tipp: Kfz-Steuer unter „Bearbeiten“ eintragen – sie wird dann jährlich in Finanzen gebucht.</p>' : ''}`);

  // Costs this year
  const yStart = today.slice(0, 4) + '-01-01';
  const bal = fzBalanceFor(v, yStart, today.slice(0, 4) + '-12-31');
  const gRows = FZ_GROUPS.map(g => ({ g, val: bal.groups[g.id] || 0 })).filter(x => x.val > 0).sort((a, b) => b.val - a.val);
  const maxG = gRows.length ? gRows[0].val : 0;
  const kosten = fzCard(`
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="fz-h" style="margin:0">💶 Kosten ${escapeHtml(today.slice(0, 4))}</div>
      <button type="button" class="fz-mini-btn" data-fzact="to-balance" data-v="${escapeHtml(v.id)}">Bilanz ›</button>
    </div>
    <div class="flex items-baseline gap-2 mb-3"><span class="font-serif text-2xl">${fzEur(bal.total)}</span>${bal.km > 0 ? `<span class="text-xs text-ink/50">bei ${escapeHtml(fzKmText(bal.km))} · ${escapeHtml(fmtEur(bal.total / bal.km))} / km</span>` : ''}</div>
    ${gRows.length ? `<div class="flex flex-col gap-2">${gRows.map(x => `
      <div>
        <div class="flex items-center justify-between gap-2 text-xs mb-1"><span class="truncate">${escapeHtml(x.g.icon + ' ' + x.g.label)}</span><span class="shrink-0 font-medium">${fzEur(x.val)}</span></div>
        <div class="vt-bar"><span style="width:${Math.max(4, Math.round(x.val / maxG * 100))}%;background:${x.g.color}"></span></div>
      </div>`).join('')}</div>` : '<p class="text-xs text-ink/45">Noch keine Kosten in diesem Jahr.</p>'}`);

  // Log
  const filters = [['alle', 'Alle'], ['energie', '⛽ Energie'], ['werkstatt', '🔧 Werkstatt'], ['reifen', '🛞 Reifen'], ['rest', '🧩 Sonstiges']];
  const flt = logs.slice().reverse().filter(l => {
    if (fzLogFilter === 'alle') return true;
    const g = fzLogType(l.type).group;
    if (fzLogFilter === 'rest') return !['energie', 'werkstatt', 'reifen'].includes(g);
    return g === fzLogFilter;
  });
  const consBySeg = {};
  cons.forEach(c => c.segs.forEach(s => { consBySeg[c.fuel + '|' + s.date] = s.value; }));
  const logRows = flt.slice(0, fzLogLimit).map(l => {
    const t = fzLogType(l.type);
    const segVal = (l.type === 'tanken' || l.type === 'laden') && l.full ? consBySeg[fzLogFuel(l) + '|' + l.date] : null;
    const sub = [vtFmt(l.date), Number(l.odo) > 0 && l.type !== 'km' ? fzKmText(l.odo) : '', l.station || '', Number(l.price) > 0 ? fzNum(l.price, 3) + ' ' + curSym() + '/' + FZ_FUELS[fzLogFuel(l)].unit : ''].filter(Boolean).join(' · ');
    const nDocs = finDocsFor('ausgabe:' + l.id).length;
    return `
      <button type="button" class="fz-log-row" data-fzact="log-edit" data-id="${escapeHtml(l.id)}">
        <span class="fz-log-ic">${escapeHtml(t.icon)}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${escapeHtml(fzLogTitle(l))}${nDocs ? ' <span class="text-xs text-ink/45">📎</span>' : ''}</span>
          <span class="block text-xs text-ink/45 truncate">${escapeHtml(sub)}</span>
        </span>
        <span class="shrink-0 text-right">
          ${Number(l.amount) > 0 ? `<span class="block text-sm font-semibold">${fzEur(l.amount)}</span>` : ''}
          ${segVal ? `<span class="block text-[11px] text-ink/45">${fzNum(segVal, 1)} ${escapeHtml(FZ_FUELS[fzLogFuel(l)].unit)}/100</span>` : (Number(l.amount) > 0 && !l.booked ? '<span class="block text-[10px] text-ink/40">nicht in Finanzen</span>' : '')}
        </span>
      </button>`;
  }).join('');
  const verlauf = fzCard(`
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="fz-h" style="margin:0">🧾 Verlauf <span class="text-ink/40 font-normal normal-case">${logs.length || ''}</span></div>
      ${archived ? '' : `<button type="button" class="fz-mini-btn primary" data-fzact="log-new" data-type="" data-v="${escapeHtml(v.id)}">+ Eintrag</button>`}
    </div>
    ${logs.length ? `<div class="fz-type-row mb-2">${filters.map(f => `<button type="button" class="fz-filter-chip${fzLogFilter === f[0] ? ' active' : ''}" data-fzact="log-filter" data-f="${f[0]}">${escapeHtml(f[1])}</button>`).join('')}</div>` : ''}
    ${logRows ? `<div class="flex flex-col">${logRows}</div>` : `<p class="text-xs text-ink/45">${logs.length ? 'Keine Einträge für diesen Filter.' : 'Tanken, Laden, Werkstatt, Reifen, Wäsche, Parken … – alles landet hier und auf Wunsch gleich in Finanzen.'}</p>`}
    ${flt.length > fzLogLimit ? `<button type="button" class="w-full mt-2 text-xs text-ink/55 hover:text-pine py-1.5" data-fzact="log-more">Weitere ${flt.length - fzLogLimit} anzeigen</button>` : ''}`);

  // Documents: stored under "Dokumente" and linked with the vehicle (in both directions)
  const bezug = 'fahrzeug:' + v.id;
  const legacy = finDocsFor(bezug);
  const logIds = new Set(logs.map(l => 'ausgabe:' + l.id));
  const receipts = finDocs.filter(x => logIds.has(x.bezug));
  const docKey = x => (vtIsIso(x.datum) ? x.datum : String(x.created || '').slice(0, 10)) || '';
  const linked = (Array.isArray(v.docLinks) ? v.docLinks : []).map(id => docById(id)).filter(Boolean)
    .sort((a, b) => docKey(b).localeCompare(docKey(a)) || String(a.titel || '').localeCompare(String(b.titel || ''), 'de'));
  const linkedRows = linked.map(x => {
    const cat = docCategory(x.kategorie);
    const dl = docDeadline(x, today);
    const meta = [cat.label, vtIsIso(x.datum) ? vtFmt(x.datum) : '', x.aussteller].filter(Boolean).join(' · ');
    const chips = [];
    if (dl) chips.push(`<span class="vt-chip ${dl.tone}">${escapeHtml(dl.label)}</span>`);
    if (x.betrag > 0) chips.push(`<span class="text-[11px] text-ink/45">${escapeHtml(fmtEur(x.betrag))}</span>`);
    if (x.pending) chips.push(`<span class="vt-chip muted">${navigator.onLine ? '⏳ wird übertragen' : '📴 wird nachgereicht'}</span>`);
    return `
      <button type="button" class="fin-doc-row flex items-center gap-2.5 rounded-xl border border-ink/10 px-2.5 py-2 text-left w-full" data-fzact="doc-open" data-id="${escapeHtml(x.id)}">
        <span class="text-xl leading-none shrink-0">${escapeHtml(cat.icon || '🗂️')}</span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium truncate">${escapeHtml(x.titel || 'Dokument')}</span>
          <span class="block text-[11px] text-ink/45 truncate">${escapeHtml(meta)}</span>
          ${chips.length ? `<span class="flex items-center gap-1.5 mt-1 flex-wrap">${chips.join('')}</span>` : ''}
        </span>
        <span class="shrink-0 text-ink/30 text-sm">›</span>
      </button>`;
  }).join('');
  const legacyHtml = legacy.length ? `
    <div class="mt-2">
      <p class="text-[11px] text-ink/45 mb-1.5">${navigator.onLine ? '⏳ Ältere Fahrzeugdokumente werden gerade nach „Dokumente“ übernommen …' : '📴 Ältere Fahrzeugdokumente werden nach „Dokumente“ übernommen, sobald wieder Verbindung besteht.'}</p>
      <div class="flex flex-col gap-1.5">${finDocRowsHtml(legacy, bezug)}</div>
    </div>` : '';
  const docTypes = fzDocTypesFor(v);
  const dokumente = fzCard(`
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="fz-h" style="margin:0">📎 Dokumente <span class="text-ink/40 font-normal normal-case">${(linked.length + legacy.length) || ''}</span></div>
      ${linked.length ? `<button type="button" class="text-xs text-ink/55 hover:text-pine whitespace-nowrap" data-fzact="doc-all" data-v="${escapeHtml(v.id)}">In Dokumente ›</button>` : ''}
    </div>
    ${archived ? '' : `<div class="flex items-center gap-2 mb-2">
      <select id="fzDocTypeSelect" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2 py-1.5 text-xs bg-white" aria-label="Art des Dokuments">${docTypes.map(t => `<option value="${t.id}">${escapeHtml(t.icon + ' ' + t.label)}</option>`).join('')}</select>
      <button type="button" class="shrink-0 px-3 py-1.5 rounded-lg bg-pine text-white text-xs font-medium hover:bg-pine/90 transition whitespace-nowrap" data-fzact="doc-add" data-v="${escapeHtml(v.id)}">+ Hochladen</button>
    </div>`}
    <div class="flex flex-col gap-1.5">${linkedRows || (legacy.length ? '' : '<p class="text-xs text-ink/40 italic">Fahrzeugschein, HU-Bericht, Kaufvertrag, Werkstattrechnungen … als PDF oder Foto. Sie landen automatisch unter „Dokumente“ in der passenden Kategorie – mit Kennzeichen, FIN, Fristen und Gewährleistung.</p>')}</div>
    ${legacyHtml}
    ${finDocStatusHint()}
    ${archived ? '' : `<button type="button" class="mt-2 text-xs text-ink/55 hover:text-pine" data-fzact="doc-link" data-v="${escapeHtml(v.id)}">🔗 Vorhandene aus „Dokumente“ verknüpfen</button>`}
    ${receipts.length ? `<details class="vt-more mt-3 rounded-xl border border-ink/10 px-3 py-2"><summary class="text-sm cursor-pointer select-none">🧾 Belege aus dem Verlauf (${receipts.length})</summary><div class="flex flex-col gap-1.5 pt-2">${finDocRowsHtml(receipts, '')}</div></details>` : ''}`);

  // Vehicle data
  const drows = [];
  if (v.vin) drows.push([k.bike ? 'Rahmennummer' : 'FIN', v.vin, true]);
  if (v.hsn || v.tsn) drows.push(['HSN / TSN', [v.hsn, v.tsn].filter(Boolean).join(' / '), true]);
  if (fzIsYm(v.firstReg)) drows.push([k.bike ? 'Baujahr' : 'Erstzulassung', v.firstReg.slice(5, 7) + '/' + v.firstReg.slice(0, 4)]);
  if (Number(v.tank) > 0) drows.push(['Tank', fzNum(v.tank, 0) + ' l']);
  if (Number(v.battery) > 0) drows.push(['Akku', fzNum(v.battery, 1) + ' kWh']);
  if (vtIsIso(v.purchaseDate) || Number(v.purchasePrice) > 0) drows.push(['Gekauft', [vtIsIso(v.purchaseDate) ? vtFmt(v.purchaseDate) : '', Number(v.purchasePrice) > 0 ? fzEur(v.purchasePrice) : '', v.odoStart !== '' && Number(v.odoStart) >= 0 && v.odoStart != null ? 'bei ' + fzKmText(v.odoStart) : ''].filter(Boolean).join(' · ')]);
  if (Number(v.value) > 0) drows.push(['Aktueller Wert', fzEur(v.value) + (vtIsIso(v.valueDate) ? ' (Stand ' + vtFmt(v.valueDate) + ')' : '')]);
  if (fzLossPerDay(v) > 0) drows.push(['Wertverlust', '≈ ' + fzEur(fzLossPerDay(v) * 30.44) + ' / Monat']);
  const daten = fzCard(`
    <div class="fz-h">🪪 Fahrzeugdaten</div>
    ${drows.length ? `<div>${drows.map(r => `<div class="vt-row"><span>${escapeHtml(r[0])}</span><span>${r[2] ? `<button type="button" class="font-mono text-ink/80 hover:text-pine" data-fzact="copy" data-text="${escapeHtml(r[1])}" title="Kopieren">${escapeHtml(r[1])} ⧉</button>` : escapeHtml(r[1])}</span></div>`).join('')}</div>` : '<p class="text-xs text-ink/45">FIN, HSN/TSN, Kaufdaten und aktuellen Wert unter „Bearbeiten“ ergänzen – der Wertverlust fließt dann in die Bilanz ein.</p>'}
    ${v.note ? `<p class="text-sm text-ink/70 mt-3" style="white-space:pre-line">${escapeHtml(v.note)}</p>` : ''}
    <div class="flex flex-wrap gap-2 mt-4">
      <button type="button" class="fz-mini-btn" data-fzact="edit" data-v="${escapeHtml(v.id)}">✎ Bearbeiten</button>
      ${archived ? '' : `<button type="button" class="fz-mini-btn" data-fzact="archive" data-v="${escapeHtml(v.id)}">🗄️ Verkauft / abgemeldet</button>`}
    </div>`);

  pane.innerHTML = `
    <button type="button" class="self-start text-sm text-ink/55 hover:text-pine -mb-1" data-fzact="back">‹ Alle Fahrzeuge</button>
    ${hero}${dueHtml}${tiles}${chart}${termine}${vertraege}${kosten}${verlauf}${dokumente}${daten}`;
}

/* ---------- Balance ---------- */
function fzBalRange() {
  const today = finTodayIso();
  if (fzBalPeriod === '12m') return { s: vtAddDays(vtAddMonths(today, -12, false), 1), e: today, label: 'Letzte 12 Monate' };
  if (fzBalPeriod === 'gesamt') {
    const list = fzBalVehicle ? [fzVehicle(fzBalVehicle)].filter(Boolean) : fzVehicles();
    const s = list.map(fzStartDate).sort()[0] || today;
    return { s, e: today, label: 'Seit ' + vtFmt(s) };
  }
  return { s: fzBalYear + '-01-01', e: fzBalYear + '-12-31', label: String(fzBalYear) };
}
function renderVehicleBalance(pane) {
  if (!fzVehicles().length) {
    pane.innerHTML = fzCard('<p class="text-sm text-ink/50 text-center py-4">Noch keine Fahrzeuge – lege zuerst eins an.</p>');
    return;
  }
  if (fzBalVehicle && !fzVehicle(fzBalVehicle)) fzBalVehicle = '';
  const today = finTodayIso();
  const rng = fzBalRange();
  const list = fzBalVehicle ? [fzVehicle(fzBalVehicle)] : fzVehicles().filter(v => fzStartDate(v) <= rng.e && (!fzIsArchived(v) || v.archived.date >= rng.s));
  const bals = list.map(v => fzBalanceFor(v, rng.s, rng.e));
  const total = bals.reduce((s, b) => s + b.total, 0);
  const km = bals.reduce((s, b) => s + b.km, 0);
  const months = Math.max(1, ...bals.map(b => b.months));
  const groups = {};
  bals.forEach(b => Object.keys(b.groups).forEach(g => { groups[g] = (groups[g] || 0) + b.groups[g]; }));
  const gRows = FZ_GROUPS.map(g => ({ g, val: groups[g.id] || 0 })).filter(x => x.val > 0).sort((a, b) => b.val - a.val);
  const maxG = gRows.length ? gRows[0].val : 0;
  const fixed = (groups.vertraege || 0) + (groups.fix || 0) + (groups.wertverlust || 0);

  // Monthly or yearly bars
  let barVals = [], barLabels = [];
  if (fzBalPeriod === 'gesamt') {
    const y0 = Number(rng.s.slice(0, 4)), y1 = Number(today.slice(0, 4));
    for (let y = Math.max(y0, y1 - 11); y <= y1; y++) {
      barLabels.push(String(y));
      barVals.push(bals.reduce((s, b) => s + Object.keys(b.byMonth).filter(mk => mk.startsWith(y + '-')).reduce((t, mk) => t + b.byMonth[mk], 0), 0));
    }
  } else {
    let mk = rng.s.slice(0, 7);
    for (let i = 0; i < 12; i++) {
      barLabels.push(FZ_MONTH_NAMES[Number(mk.slice(5, 7)) - 1].slice(0, 3));
      barVals.push(bals.reduce((s, b) => s + (b.byMonth[mk] || 0), 0));
      mk = vtAddMonths(mk + '-01', 1, false).slice(0, 7);
    }
  }

  // Energy
  const energy = {};
  list.forEach(v => fzLogsFor(v.id).forEach(l => {
    if ((l.type !== 'tanken' && l.type !== 'laden') || l.date < rng.s || l.date > rng.e) return;
    const f = fzLogFuel(l);
    const e = energy[f] || (energy[f] = { qty: 0, cost: 0 });
    e.qty += Number(l.qty) || 0;
    e.cost += Number(l.amount) || 0;
  }));
  const co2 = Object.keys(energy).reduce((s, f) => s + energy[f].qty * (FZ_FUELS[f].co2 || 0), 0);
  const energyRows = Object.keys(energy).filter(f => energy[f].qty > 0).map(f => {
    const e = energy[f], u = FZ_FUELS[f].unit;
    return `<div class="vt-row"><span>${escapeHtml(FZ_FUELS[f].label)}</span><span>${fzNum(e.qty, u === 'kWh' ? 0 : 1)} ${u} · ${fzEur(e.cost)}${e.cost > 0 && e.qty > 0 ? ' · Ø ' + fzNum(e.cost / e.qty, u === 'kWh' ? 2 : 3) + ' ' + curSym() + '/' + u : ''}</span></div>`;
  }).join('');

  const periodBtns = [['jahr', 'Jahr'], ['12m', '12 Monate'], ['gesamt', 'Gesamt']].map(p => `<button type="button" class="contract-status-btn px-3 py-1 rounded-md text-xs text-ink/60 transition${fzBalPeriod === p[0] ? ' active' : ''}" data-fzact="bal-period" data-p="${p[0]}">${p[1]}</button>`).join('');
  const controls = `
    <div class="flex items-center gap-2 flex-wrap">
      <div class="inline-flex rounded-lg border border-ink/15 p-0.5 shrink-0">${periodBtns}</div>
      ${fzBalPeriod === 'jahr' ? `<div class="flex items-center gap-1">
        <button type="button" class="shrink-0 w-8 h-8 rounded-full text-ink/60 hover:text-pine hover:bg-ink/5 grid place-items-center text-xl leading-none select-none" data-fzact="bal-year" data-d="-1" aria-label="Vorheriges Jahr">‹</button>
        <span class="text-sm font-medium">${fzBalYear}</span>
        <button type="button" class="shrink-0 w-8 h-8 rounded-full text-ink/60 hover:text-pine hover:bg-ink/5 grid place-items-center text-xl leading-none select-none" data-fzact="bal-year" data-d="1" aria-label="Nächstes Jahr">›</button>
      </div>` : ''}
      <select id="fzBalVehicleSel" class="min-w-0 flex-1 rounded-lg border border-ink/15 px-2 py-1.5 text-xs bg-white" aria-label="Fahrzeug">
        <option value="">Alle Fahrzeuge</option>
        ${fzVehicles().map(v => `<option value="${escapeHtml(v.id)}"${v.id === fzBalVehicle ? ' selected' : ''}>${escapeHtml(fzKind(v.kind).icon + ' ' + fzName(v) + (fzIsArchived(v) ? ' (verkauft)' : ''))}</option>`).join('')}
      </select>
    </div>`;

  const head = fzCard(`
    <div class="text-[11px] uppercase tracking-wide text-ink/40">${escapeHtml(rng.label)}${fzBalVehicle ? ' · ' + escapeHtml(fzName(fzVehicle(fzBalVehicle))) : ''}</div>
    <div class="font-serif text-3xl">${fzEur(total)}</div>
    <div class="grid grid-cols-3 gap-2 mt-3">
      ${fzTile('Pro Monat', fzEur(total / months), 'Durchschnitt')}
      ${fzTile('Gefahren', km > 0 ? fzKmText(km) : '–', 'aus km-Ständen')}
      ${fzTile('Pro km', km >= 100 ? fmtEur(total / km) : '–', 'Vollkosten')}
    </div>
    ${total > 0 ? `<div class="mt-3"><div class="flex justify-between text-[11px] text-ink/50 mb-1"><span>Fix: ${fzEur(fixed)}</span><span>Variabel: ${fzEur(total - fixed)}</span></div><div class="vt-bar"><span style="width:${Math.round(fixed / total * 100)}%;background:#4A6FA5"></span></div></div>` : ''}`);

  const breakdown = fzCard(`
    <div class="fz-h">📊 Wofür</div>
    ${gRows.length ? `<div class="flex flex-col gap-2.5">${gRows.map(x => `
      <div>
        <div class="flex items-center justify-between gap-2 text-xs mb-1"><span class="truncate">${escapeHtml(x.g.icon + ' ' + x.g.label)}</span><span class="shrink-0"><b>${fzEur(x.val)}</b> <span class="text-ink/45">${total ? Math.round(x.val / total * 100) : 0} %</span></span></div>
        <div class="vt-bar"><span style="width:${Math.max(3, Math.round(x.val / maxG * 100))}%;background:${x.g.color}"></span></div>
      </div>`).join('')}</div>` : '<p class="text-xs text-ink/45">Keine Kosten in diesem Zeitraum.</p>'}
    ${!list.some(v => fzLossPerDay(v) > 0) ? '<p class="text-[11px] text-ink/45 mt-3">Tipp: Kaufpreis, Kaufdatum und aktuellen Wert beim Fahrzeug eintragen – dann rechnet die Bilanz den Wertverlust mit ein.</p>' : ''}`);

  const trend = barVals.some(x => x > 0) ? fzCard(`
    <div class="fz-h">📅 ${fzBalPeriod === 'gesamt' ? 'Pro Jahr' : 'Pro Monat'}</div>
    ${fzBarsHtml(barVals, barLabels, fzBalVehicle ? fzColor(fzVehicle(fzBalVehicle)) : 'var(--c-pine)', { short: val => curPlain0(val), fmt: val => fzEur(val) })}
    <p class="text-[11px] text-ink/45 mt-2">Ohne Wertverlust · Versicherung und Steuer im Monat der Abbuchung</p>`) : '';

  const cmp = !fzBalVehicle && bals.length > 1 ? fzCard(`
    <div class="fz-h">🚦 Vergleich</div>
    <div style="overflow-x:auto"><table class="fz-cmp w-full"><thead><tr><th>Fahrzeug</th><th>Gesamt</th><th>/ Monat</th><th>km</th><th>/ km</th></tr></thead><tbody>
      ${bals.slice().sort((a, b) => b.total - a.total).map(b => `<tr><td><button type="button" class="text-left hover:text-pine" data-fzact="bal-pick" data-v="${escapeHtml(b.v.id)}">${escapeHtml(fzKind(b.v.kind).icon + ' ' + fzName(b.v))}</button></td><td>${fzEur(b.total)}</td><td>${fzEur(b.total / b.months)}</td><td>${b.km ? fzNum(b.km) : '–'}</td><td>${b.km >= 100 ? fmtEur(b.total / b.km) : '–'}</td></tr>`).join('')}
    </tbody></table></div>`) : '';

  const energyCard = energyRows ? fzCard(`
    <div class="fz-h">⛽ Energie</div>
    <div>${energyRows}</div>
    ${co2 > 0 ? `<p class="text-[11px] text-ink/45 mt-2">≈ ${fzNum(co2 / 1000, co2 >= 10000 ? 1 : 2)} t CO₂ (grob: Verbrennung bzw. deutscher Strommix)</p>` : ''}`) : '';

  pane.innerHTML = controls + head + breakdown + trend + cmp + energyCard;
  const sel = document.getElementById('fzBalVehicleSel');
  if (sel) sel.addEventListener('change', () => { fzBalVehicle = sel.value; renderVehicles(); });
}

/* ---------- Calculators ---------- */
function fzToolIn(id, label, value, unit, opts = {}) {
  return `<div class="fz-field"><label class="fz-lbl" for="${id}">${escapeHtml(label)}</label><div class="fz-unit"><input id="${id}" class="fz-in fz-calc" type="text" inputmode="${opts.int ? 'numeric' : 'decimal'}" autocomplete="off" value="${escapeHtml(value)}" />${unit ? `<span${unit === curSym() ? ' class="cur-sym"' : ''}>${escapeHtml(unit)}</span>` : ''}</div></div>`;
}
function fzToolDefaults() {
  const v = fzVehicle(fzToolVehicle) || fzActiveVehicles()[0] || null;
  const fuel = v ? (fzMainFuels(v)[0] || 'benzin') : 'benzin';
  const cons = v ? fzConsumption(v, fuel) : null;
  const benzinCons = v && fzMainFuels(v).includes('benzin') && fzConsumption(v, 'benzin') ? fzConsumption(v, 'benzin').avg : 7;
  return {
    v, fuel, unit: FZ_FUELS[fuel].unit,
    cons: cons ? Math.round(cons.avg * 10) / 10 : (fuel === 'strom' ? 18 : fuel === 'diesel' ? 5.8 : 7),
    price: Math.round(fzLastPrice(fuel, v, fuel === 'strom' ? 'home' : '') * 1000) / 1000,
    perKm: v ? fzCostPerKm(v) : null,
    kmYear: v && fzKmPerDay(v) > 0 ? Math.round(fzKmPerDay(v) * 365 / 500) * 500 : 12000,
    benzin: Math.round(benzinCons * 10) / 10,
    pBenzin: Math.round(fzLastPrice('benzin', null) * 1000) / 1000,
    pDiesel: Math.round(fzLastPrice('diesel', null) * 1000) / 1000,
    pLpg: Math.round(fzLastPrice('lpg', null) * 1000) / 1000,
    pHome: Math.round(fzLastPrice('strom', null, 'home') * 1000) / 1000,
    pPublic: Math.round(fzLastPrice('strom', null, 'public') * 1000) / 1000,
  };
}
function renderVehicleTools(pane) {
  const d = fzToolDefaults();
  const dec = x => fzDecInput(x);
  const vSel = fzActiveVehicles().length ? `
    <div class="flex items-center gap-2">
      <span class="text-xs text-ink/50 shrink-0">Werte von</span>
      <select id="fzToolVehicleSel" class="min-w-0 flex-1 rounded-lg border border-ink/15 px-2 py-1.5 text-xs bg-white">
        ${fzActiveVehicles().map(v => `<option value="${escapeHtml(v.id)}"${d.v && v.id === d.v.id ? ' selected' : ''}>${escapeHtml(fzKind(v.kind).icon + ' ' + fzName(v))}</option>`).join('')}
      </select>
    </div>` : '';
  const tool = (id, icon, title, sub, body, open) => `
    <details class="fz-tool rounded-2xl bg-white border border-ink/10 shadow-sm px-4 py-3"${open ? ' open' : ''}>
      <summary><span class="text-sm font-medium">${icon} ${escapeHtml(title)}</span><span class="block text-xs text-ink/50 font-normal">${escapeHtml(sub)}</span></summary>
      <div class="pt-3">${body}<div id="${id}" class="fz-res mt-1"></div></div>
    </details>`;
  pane.innerHTML = vSel
    + tool('fzResTrip', '🧭', 'Fahrtkosten', 'Was kostet die Fahrt – und pro Person?', `
      <div class="fz-grid2">${fzToolIn('fzT1Km', 'Strecke', '120', 'km', { int: true })}${fzToolIn('fzT1Pers', 'Personen', '1', '', { int: true })}</div>
      <label class="fz-check"><input type="checkbox" id="fzT1Back" class="fz-calc" checked /> Hin und zurück</label>
      <div class="fz-grid2">${fzToolIn('fzT1Cons', 'Verbrauch', dec(d.cons), d.unit + '/100')}${fzToolIn('fzT1Price', 'Preis', dec(d.price), curSym() + '/' + d.unit)}</div>
      ${fzToolIn('fzT1PerKm', 'Vollkosten je km (optional)', d.perKm != null ? fzDecInput(d.perKm, 2) : '', curSym() + '/km')}`, true)
    + tool('fzResEv', '⚡', 'Elektro oder Verbrenner?', 'Jährliche Kosten im Vergleich – und ab wann sich der Mehrpreis rechnet', `
      ${fzToolIn('fzT2Km', 'Fahrleistung pro Jahr', String(d.kmYear), 'km', { int: true })}
      <div class="text-xs font-semibold text-ink/55 mb-2 mt-1">⛽ Verbrenner</div>
      <div class="fz-grid2">${fzToolIn('fzT2VCons', 'Verbrauch', dec(d.benzin), 'l/100')}${fzToolIn('fzT2VPrice', 'Spritpreis', dec(d.pBenzin), curSym() + '/l')}</div>
      <div class="fz-grid2">${fzToolIn('fzT2VFix', 'Steuer + Versicherung', '650', curSym() + '/Jahr', { int: true })}${fzToolIn('fzT2VMaint', 'Wartung', '450', curSym() + '/Jahr', { int: true })}</div>
      ${fzToolIn('fzT2VBuy', 'Kaufpreis', '30000', curSym(), { int: true })}
      <div class="text-xs font-semibold text-ink/55 mb-2 mt-1">🔌 Elektro</div>
      <div class="fz-grid2">${fzToolIn('fzT2ECons', 'Verbrauch', '17', 'kWh/100')}${fzToolIn('fzT2EHome', 'Anteil zuhause', '80', '%', { int: true })}</div>
      <div class="fz-grid2">${fzToolIn('fzT2EPHome', 'Strom zuhause', dec(d.pHome), curSym() + '/kWh')}${fzToolIn('fzT2EPPub', 'Strom unterwegs', dec(d.pPublic), curSym() + '/kWh')}</div>
      <div class="fz-grid2">${fzToolIn('fzT2EFix', 'Steuer + Versicherung', '550', curSym() + '/Jahr', { int: true })}${fzToolIn('fzT2EMaint', 'Wartung', '300', curSym() + '/Jahr', { int: true })}</div>
      ${fzToolIn('fzT2EBuy', 'Kaufpreis', '36000', curSym(), { int: true })}
      <p class="text-[11px] text-ink/45 mb-2">E-Autos sind je nach Erstzulassung von der Kfz-Steuer befreit – bei Steuer + Versicherung dann nur die Versicherung eintragen.</p>`)
    + tool('fzResLpg', '🔥', 'Lohnt sich Autogas (LPG)?', 'Ersparnis pro Jahr und Amortisation einer Umrüstung', `
      <div class="fz-grid2">${fzToolIn('fzT3Cost', 'Umrüstung', '2800', curSym(), { int: true })}${fzToolIn('fzT3Km', 'Fahrleistung', String(d.kmYear), 'km/Jahr', { int: true })}</div>
      <div class="fz-grid2">${fzToolIn('fzT3Cons', 'Benzinverbrauch', dec(d.benzin), 'l/100')}${fzToolIn('fzT3PB', 'Benzinpreis', dec(d.pBenzin), curSym() + '/l')}</div>
      <div class="fz-grid2">${fzToolIn('fzT3More', 'Mehrverbrauch LPG', '20', '%', { int: true })}${fzToolIn('fzT3PL', 'LPG-Preis', dec(d.pLpg), curSym() + '/l')}</div>
      ${fzToolIn('fzT3Extra', 'Zusatzkosten (Gasprüfung, Filter)', '80', curSym() + '/Jahr', { int: true })}`)
    + tool('fzResBike', '🚲', 'Rad statt Auto', 'Was bringt der Arbeitsweg mit dem Rad – Geld, CO₂ und Kalorien', `
      <div class="fz-grid2">${fzToolIn('fzT4Km', 'Strecke einfach', '7', 'km')}${fzToolIn('fzT4Days', 'Tage pro Woche', '3', '', { int: true })}</div>
      <div class="fz-grid2">${fzToolIn('fzT4Weeks', 'Wochen pro Jahr', '40', '', { int: true })}${fzToolIn('fzT4PerKm', 'Auto-Kosten je km', d.perKm != null ? fzDecInput(d.perKm, 2) : numDec('0.30'), curSym() + '/km')}</div>
      <div class="fz-grid2">${fzToolIn('fzT4Cons', 'Auto-Verbrauch', dec(d.fuel === 'strom' ? 7 : d.cons), 'l/100')}${fzToolIn('fzT4Bike', 'Fahrrad-Kosten', '150', curSym() + '/Jahr', { int: true })}</div>
      <label class="fz-check"><input type="checkbox" id="fzT4Ebike" class="fz-calc" /> Mit dem E-Bike</label>`)
    + tool('fzResDetour', '📍', 'Umweg zur günstigeren Tankstelle?', 'Lohnt sich der Umweg für ein paar Cent weniger?', `
      <div class="fz-grid2">${fzToolIn('fzT5Qty', 'Tankmenge', '45', 'l', { int: true })}${fzToolIn('fzT5Diff', 'Preisunterschied', '6', 'ct/l')}</div>
      <div class="fz-grid2">${fzToolIn('fzT5Km', 'Umweg (hin + zurück)', '6', 'km')}${fzToolIn('fzT5Cons', 'Verbrauch', dec(d.fuel === 'strom' ? 7 : d.cons), 'l/100')}</div>
      ${fzToolIn('fzT5Price', 'Spritpreis', dec(d.fuel === 'strom' ? d.pBenzin : d.price), curSym() + '/l')}`)
    + '<p class="text-[11px] text-ink/45 px-1">Alle Rechner sind Schätzungen. Vorgeschlagene Werte stammen aus deinen Einträgen, sonst aus typischen Durchschnittswerten – einfach anpassen.</p>';
  fzToolsBuilt = true;
  const sel = document.getElementById('fzToolVehicleSel');
  if (sel) sel.addEventListener('change', () => { fzToolVehicle = sel.value; renderVehicleTools(pane); });
  fzCalc();
}
function fzCalc() {
  const n = id => { const el = document.getElementById(id); return el ? fzParseDec(el.value) : NaN; };
  const ok = x => isFinite(x) && x >= 0;
  const set = (id, html, tone = '') => { const el = document.getElementById(id); if (el) { el.innerHTML = html; el.className = 'fz-res mt-1' + (tone ? ' ' + tone : ''); } };
  const unitOf = id => { const el = document.getElementById(id); const sp = el && el.parentElement.querySelector('span'); return sp ? sp.textContent.replace('/100', '') : 'l'; };

  // 1 Trip costs
  let km = n('fzT1Km');
  if (document.getElementById('fzT1Back') && document.getElementById('fzT1Back').checked) km *= 2;
  const pers = Math.max(1, Math.round(n('fzT1Pers')) || 1);
  const cons = n('fzT1Cons'), price = n('fzT1Price'), pk = n('fzT1PerKm');
  if (ok(km) && ok(cons) && ok(price) && km > 0) {
    const qty = km * cons / 100;
    const cost = qty * price;
    let html = `Energie: <b>${fzEur(cost)}</b> für ${fzNum(qty, 1)} ${escapeHtml(unitOf('fzT1Cons'))} auf ${fzKmText(km)}`;
    if (pers > 1) html += `<br>pro Person: <b>${fzEur(cost / pers)}</b>`;
    if (ok(pk) && pk > 0) html += `<br>Mit Vollkosten (Wertverlust, Versicherung, Wartung …): <b>${fzEur(km * pk)}</b>${pers > 1 ? ' · ' + fzEur(km * pk / pers) + ' pro Person' : ''}`;
    set('fzResTrip', html);
  } else set('fzResTrip', 'Strecke, Verbrauch und Preis eingeben.');

  // 2 Electric vs. combustion
  const kmY = n('fzT2Km');
  if (ok(kmY) && kmY > 0) {
    const vEnergy = kmY * n('fzT2VCons') / 100 * n('fzT2VPrice');
    const share = Math.min(100, Math.max(0, n('fzT2EHome') || 0)) / 100;
    const kwh = kmY * n('fzT2ECons') / 100;
    const eEnergy = kwh * (share * n('fzT2EPHome') + (1 - share) * n('fzT2EPPub'));
    const vYear = vEnergy + (n('fzT2VFix') || 0) + (n('fzT2VMaint') || 0);
    const eYear = eEnergy + (n('fzT2EFix') || 0) + (n('fzT2EMaint') || 0);
    const diff = vYear - eYear;
    const extra = (n('fzT2EBuy') || 0) - (n('fzT2VBuy') || 0);
    const co2V = kmY * n('fzT2VCons') / 100 * FZ_FUELS.benzin.co2, co2E = kwh * FZ_FUELS.strom.co2;
    if (isFinite(vYear) && isFinite(eYear)) {
      let html = `⛽ Verbrenner: <b>${fzEur(vYear)}</b> / Jahr (Sprit ${fzEur(vEnergy)})<br>🔌 Elektro: <b>${fzEur(eYear)}</b> / Jahr (Strom ${fzEur(eEnergy)})<br>`;
      html += diff > 0 ? `Elektro spart <b>${fzEur(diff)}</b> pro Jahr` : `Der Verbrenner ist <b>${fzEur(-diff)}</b> pro Jahr günstiger`;
      if (extra > 0 && diff > 0) html += ` – der Mehrpreis von ${fzEur(extra)} hat sich nach <b>${fzNum(extra / diff, 1)} Jahren</b> (${fzKmText(Math.round(extra / diff * kmY / 1000) * 1000)}) bezahlt gemacht.`;
      else if (extra <= 0 && diff > 0) html += ' – und ist in der Anschaffung nicht teurer.';
      else html += '.';
      if (isFinite(co2V) && isFinite(co2E)) html += `<br>CO₂: ≈ ${fzNum(co2V / 1000, 1)} t gegenüber ${fzNum(co2E / 1000, 1)} t pro Jahr`;
      set('fzResEv', html, diff > 0 ? 'good' : '');
    } else set('fzResEv', 'Bitte alle Werte eingeben.');
  } else set('fzResEv', 'Fahrleistung eingeben.');

  // 3 LPG
  const kmL = n('fzT3Km'), consB = n('fzT3Cons');
  if (ok(kmL) && ok(consB) && kmL > 0) {
    const benzinCost = kmL * consB / 100 * n('fzT3PB');
    const lpgCost = kmL * consB * (1 + (n('fzT3More') || 0) / 100) / 100 * n('fzT3PL') + (n('fzT3Extra') || 0) + kmL * consB / 100 * 0.05 * n('fzT3PB');
    const save = benzinCost - lpgCost;
    const conv = n('fzT3Cost') || 0;
    if (isFinite(save)) {
      let html = `Benzin: ${fzEur(benzinCost)} · Autogas: ${fzEur(lpgCost)} pro Jahr<br>`;
      if (save > 0) html += `Ersparnis <b>${fzEur(save)}</b> pro Jahr – die Umrüstung hat sich nach <b>${fzNum(conv / save, 1)} Jahren</b> bzw. ${fzKmText(Math.round(conv / save * kmL / 1000) * 1000)} bezahlt gemacht.`;
      else html += 'Bei diesen Werten lohnt sich die Umrüstung nicht.';
      html += '<br><span class="text-[11px] opacity-80">inkl. ca. 5 % Benzin für Kaltstart und Umschaltung</span>';
      set('fzResLpg', html, save > 0 ? 'good' : 'bad');
    } else set('fzResLpg', 'Bitte alle Werte eingeben.');
  } else set('fzResLpg', 'Fahrleistung und Verbrauch eingeben.');

  // 4 Bike instead of car
  const kmB = n('fzT4Km') * 2 * (n('fzT4Days') || 0) * (n('fzT4Weeks') || 0);
  if (ok(kmB) && kmB > 0) {
    const perKmCar = n('fzT4PerKm') || 0;
    const saved = kmB * perKmCar - (n('fzT4Bike') || 0);
    const co2 = kmB * (n('fzT4Cons') || 0) / 100 * FZ_FUELS.benzin.co2;
    const ebike = document.getElementById('fzT4Ebike') && document.getElementById('fzT4Ebike').checked;
    const kcal = kmB * (ebike ? 15 : 30);
    set('fzResBike', `${fzKmText(Math.round(kmB))} pro Jahr mit dem Rad<br>Gespart: <b>${fzEur(saved)}</b> pro Jahr${saved < 0 ? ' (Rad teurer als die eingesparten Autokilometer)' : ''}<br>CO₂: ≈ <b>${fzNum(co2, 0)} kg</b> weniger · Bonus: ≈ ${fzNum(kcal, 0)} kcal verbrannt 💪`, saved > 0 ? 'good' : '');
  } else set('fzResBike', 'Strecke, Tage und Wochen eingeben.');

  // 5 Detour
  const qty5 = n('fzT5Qty'), diff5 = n('fzT5Diff'), km5 = n('fzT5Km');
  if (ok(qty5) && ok(diff5) && ok(km5)) {
    const gain = qty5 * diff5 / 100;
    const cost5 = km5 * (n('fzT5Cons') || 0) / 100 * (n('fzT5Price') || 0);
    const net = gain - cost5;
    set('fzResDetour', `Ersparnis beim Tanken: ${fzEur(gain)} · Umweg kostet ${fzEur(cost5)}<br>${net > 0.2 ? `Lohnt sich: <b>${fzEur(net)}</b> gespart` : net > 0 ? 'Lohnt sich kaum – nur ein paar Cent' : `Lohnt sich nicht: <b>${fzEur(-net)}</b> drauf`}`, net > 0.2 ? 'good' : 'bad');
  } else set('fzResDetour', 'Werte eingeben.');
}

/* ---------- Popups (general) ---------- */
function fzOpenModal(html, onReady) {
  document.getElementById('fzModalBody').innerHTML = html;
  document.getElementById('fzModal').classList.remove('hidden');
  if (onReady) onReady(document.getElementById('fzModalBody'));
  armModalSnapshot('fzModal');
}
function fzCloseModal() {
  document.getElementById('fzModal').classList.add('hidden');
  document.getElementById('fzModalBody').innerHTML = '';
  fzModalState = null;
  fzLogPending = [];
}
function fzOpenModal2(html, onReady) {
  document.getElementById('fzModal2Body').innerHTML = html;
  document.getElementById('fzModal2').classList.remove('hidden');
  if (onReady) onReady(document.getElementById('fzModal2Body'));
  armModalSnapshot('fzModal2');
}
function fzCloseModal2() {
  document.getElementById('fzModal2').classList.add('hidden');
  document.getElementById('fzModal2Body').innerHTML = '';
}
function fzVal(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
function fzChecked(id) { const el = document.getElementById(id); return !!(el && el.checked); }
function fzShowErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function fzIn(id, label, value, opts = {}) {
  const type = opts.type || 'text';
  const mode = opts.mode ? ` inputmode="${opts.mode}"` : '';
  const input = `<input id="${id}" type="${type}"${mode} autocomplete="off" ${opts.max ? `maxlength="${opts.max}"` : ''} placeholder="${escapeHtml(opts.ph || '')}" value="${escapeHtml(value == null ? '' : value)}" class="fz-in" />`;
  return `<div class="fz-field${opts.cls ? ' ' + opts.cls : ''}"${opts.wrapId ? ` id="${opts.wrapId}"` : ''}><label class="fz-lbl" for="${id}">${escapeHtml(label)}</label>${opts.unit ? `<div class="fz-unit">${input}<span${opts.unit === curSym() ? ' class="cur-sym"' : ''}>${escapeHtml(opts.unit)}</span></div>` : input}</div>`;
}
// Month / year as two plain number fields (numeric keypad) – the slash stays fixed in between
function fzYmIn(id, label, ym, opts = {}) {
  const m = fzIsYm(ym) ? ym.slice(5, 7) : '', y = fzIsYm(ym) ? ym.slice(0, 4) : '';
  return `<div class="fz-field"${opts.wrapId ? ` id="${opts.wrapId}"` : ''}><label class="fz-lbl" for="${id}_m">${escapeHtml(label)}</label>
    <div class="fz-ym">
      <input id="${id}_m" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" placeholder="MM" value="${m}" class="fz-in fz-ym-m" aria-label="${escapeHtml(label)}: Monat" />
      <span class="fz-ym-slash" aria-hidden="true">/</span>
      <input id="${id}_y" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="JJJJ" value="${y}" class="fz-in fz-ym-y" aria-label="${escapeHtml(label)}: Jahr" />
    </div>${opts.hint ? `<p class="text-[11px] text-ink/45 mt-1">${escapeHtml(opts.hint)}</p>` : ''}</div>`;
}
// Digits only; after two month digits (or 2–9) the cursor jumps to the year, deleting in an empty year goes back to the month
function fzYmWire(root) {
  root.querySelectorAll('.fz-ym').forEach(w => {
    const m = w.querySelector('.fz-ym-m'), y = w.querySelector('.fz-ym-y');
    m.addEventListener('input', () => {
      let t = m.value.replace(/\D/g, '').slice(0, 2);
      if (t.length === 1 && Number(t) > 1) t = '0' + t;
      if (t.length === 2 && (Number(t) < 1 || Number(t) > 12)) t = t.slice(0, 1);
      m.value = t;
      if (t.length === 2) y.focus();
    });
    m.addEventListener('blur', () => { if (m.value.length === 1 && m.value !== '0') m.value = '0' + m.value; });
    y.addEventListener('input', () => { y.value = y.value.replace(/\D/g, '').slice(0, 4); });
    y.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !y.value) { e.preventDefault(); m.focus(); } });
  });
}
// -> { ym: 'YYYY-MM' | '', empty, invalid }
function fzYmVal(id) {
  const m = fzVal(id + '_m').replace(/\D/g, ''), y = fzVal(id + '_y').replace(/\D/g, '');
  if (!m && !y) return { ym: '', empty: true, invalid: false };
  const mo = parseInt(m, 10);
  let yr = parseInt(y, 10);
  if (y.length === 2) yr += 2000;
  if (!(mo >= 1 && mo <= 12) || !(y.length === 2 || y.length === 4) || !(yr >= 1950 && yr <= 2100)) return { ym: '', empty: false, invalid: true };
  return { ym: yr + '-' + pad2(mo), empty: false, invalid: false };
}
function fzYmSet(id, ym) {
  const m = document.getElementById(id + '_m'), y = document.getElementById(id + '_y');
  if (m) m.value = fzIsYm(ym) ? ym.slice(5, 7) : '';
  if (y) y.value = fzIsYm(ym) ? ym.slice(0, 4) : '';
}
function fzSel(id, label, options, value, opts = {}) {
  return `<div class="fz-field${opts.cls ? ' ' + opts.cls : ''}"${opts.wrapId ? ` id="${opts.wrapId}"` : ''}><label class="fz-lbl" for="${id}">${escapeHtml(label)}</label><select id="${id}" class="fz-in">${options.map(o => `<option value="${escapeHtml(o[0])}"${String(o[0]) === String(value) ? ' selected' : ''}>${escapeHtml(o[1])}</option>`).join('')}</select></div>`;
}
function fzMemberOptions(empty = '–') { return [['', empty]].concat(members.map(m => [m.id, memberLabel(m)])); }
function fzAfterChange() {
  persistState();
  if (currentView === 'fahrzeuge') renderVehicles();
  if (currentView === 'finanzen') { try { renderFinance(); } catch (e) { /* ignore */ } }
  try { renderFinRecurringEditor(); } catch (e) { /* ignore */ }
  fzScheduleAutoTasks(1500);
}

/* ---------- Popup: create / edit vehicle ---------- */
function fzOpenVehicleModal(id, kindPreset) {
  if (isCurrentUserGuest()) return;
  const v = id ? fzVehicle(id) : null;
  const today = finTodayIso();
  const draft = v ? JSON.parse(JSON.stringify(v)) : { kind: kindPreset || 'auto', color: FZ_COLORS[fzVehicles().length % FZ_COLORS.length], autoTasks: { on: true, days: 30, to: [] }, holder: currentMember() ? currentMember().id : '' };
  if (!draft.drive) draft.drive = fzKind(draft.kind).defaultDrive;
  fzModalState = { mode: 'vehicle', id: v ? v.id : null, draft };
  const taxRec = v && v.taxRecId ? finance.recurring.find(r => r.id === v.taxRecId) : null;
  const t = fzTireSetting(draft);
  const sv = draft.service || {};
  const hu = draft.hu || {};
  const a = fzAutoSettings(draft);
  const monthOpts = (from, to) => { const o = []; for (let m = from; m <= to; m++) o.push([String(m), FZ_MONTH_NAMES[m - 1]]); return o; };
  const setRow = (sid, label) => `
    <div class="fz-grid3 items-end">
      <div class="fz-field"><span class="fz-lbl">${label}</span><span class="text-xs text-ink/50">Satz</span></div>
      ${fzIn('fzvDot_' + sid, 'DOT-Jahr', (t.sets[sid] || {}).dot || '', { mode: 'numeric', ph: 'z. B. 2022', max: 4 })}
      ${fzIn('fzvTread_' + sid, 'Profil', (t.sets[sid] || {}).tread ? fzDecInput((t.sets[sid] || {}).tread) : '', { mode: 'decimal', unit: 'mm' })}
    </div>`;
  const html = `
    <h3 class="font-serif text-lg mb-3 pr-6">${v ? 'Fahrzeug bearbeiten' : 'Neues Fahrzeug'}</h3>
    <span class="fz-lbl">Art</span>
    <div class="flex flex-wrap gap-1.5 mb-3" id="fzvKinds">${FZ_KINDS.map(k => `<button type="button" class="fz-kind-btn px-2.5 py-1.5 text-xs${k.id === draft.kind ? ' active' : ''}" data-kind="${k.id}">${k.icon} ${escapeHtml(k.label)}</button>`).join('')}</div>
    ${fzIn('fzvName', 'Name', draft.name || '', { ph: 'z. B. Familienkutsche, Papas Rad', max: 60 })}
    <div class="fz-grid2">${fzIn('fzvMake', 'Marke', draft.make || '', { ph: 'z. B. VW', max: 40 })}${fzIn('fzvModel', 'Modell', draft.model || '', { ph: 'z. B. Golf 8', max: 60 })}</div>
    <div class="fz-grid2">
      ${fzIn('fzvPlate', 'Kennzeichen', draft.plate || '', { ph: 'z. B. KS AB 123', max: 16, wrapId: 'fzvPlateWrap' })}
      ${fzSel('fzvHolder', 'Halter / Hauptfahrer', fzMemberOptions(), draft.holder || '')}
    </div>
    <span class="fz-lbl">Farbe</span>
    <div class="flex flex-wrap gap-2 mb-3" id="fzvColors">${FZ_COLORS.map(c => `<button type="button" class="fz-color-btn${c === fzColor(draft) ? ' active' : ''}" style="background:${c}" data-color="${c}" aria-label="Farbe ${c}"></button>`).join('')}</div>
    <div id="fzvDriveWrap">
      <span class="fz-lbl">Antrieb</span>
      <div class="flex flex-wrap gap-1.5 mb-3" id="fzvDrives"></div>
    </div>
    <div class="fz-grid2">
      ${fzIn('fzvTank', 'Tank', draft.tank ? fzDecInput(draft.tank) : '', { mode: 'decimal', unit: 'l', wrapId: 'fzvTankWrap' })}
      ${fzIn('fzvBattery', 'Akku (netto)', draft.battery ? fzDecInput(draft.battery) : '', { mode: 'decimal', unit: 'kWh', wrapId: 'fzvBatteryWrap' })}
    </div>

    <h4 class="vt-form-h">🗓️ HU, Inspektion &amp; Reifen</h4>
    <div class="fz-grid2" id="fzvHuWrap">
      ${fzYmIn('fzvHuDue', 'HU fällig (Plakette)', hu.due)}
      ${fzSel('fzvHuMonths', 'HU-Intervall', [['24', 'alle 2 Jahre'], ['12', 'jährlich'], ['36', 'nach 3 Jahren (neu)']], String(parseInt(hu.months, 10) || 24))}
    </div>
    <div class="fz-grid2">
      ${fzSel('fzvSvcMonths', 'Inspektion alle', [['', '–'], ['6', '6 Monate'], ['12', '12 Monate'], ['24', '24 Monate'], ['36', '36 Monate']], String(parseInt(sv.months, 10) || ''))}
      ${fzIn('fzvSvcKm', 'oder alle', parseInt(sv.km, 10) ? fzNum(parseInt(sv.km, 10)) : '', { mode: 'numeric', unit: 'km', ph: 'z. B. 30.000' })}
    </div>
    <div class="fz-grid2">
      ${fzIn('fzvSvcDate', 'Letzte Inspektion am', vtIsIso(sv.lastDate) ? sv.lastDate : '', { type: 'date' })}
      ${fzIn('fzvSvcOdo', 'bei km-Stand', sv.lastOdo !== '' && sv.lastOdo != null && isFinite(Number(sv.lastOdo)) ? fzNum(sv.lastOdo) : '', { mode: 'numeric', unit: 'km' })}
    </div>
    <div id="fzvTireWrap">
      <div class="fz-grid2">
        ${fzSel('fzvTireMode', 'Reifen', [['wechsel', 'Sommer & Winter'], ['ganzjahr', 'Ganzjahresreifen'], ['keine', 'keine Angabe']], t.mode)}
        ${fzSel('fzvTireMounted', 'Aktuell montiert', [['sommer', 'Sommerreifen'], ['winter', 'Winterreifen']], t.mounted, { wrapId: 'fzvMountedWrap' })}
      </div>
      <div class="fz-grid2" id="fzvChangeWrap">
        ${fzSel('fzvToWinter', 'Winterreifen ab', monthOpts(9, 12), String(t.toWinter))}
        ${fzSel('fzvToSummer', 'Sommerreifen ab', monthOpts(2, 5), String(t.toSummer))}
      </div>
      <div class="fz-grid2">
        ${fzIn('fzvTireSize', 'Reifengröße', t.size, { ph: 'z. B. 205/55 R16 91V', max: 40 })}
        ${fzIn('fzvTireStore', 'Eingelagert bei', t.storage, { ph: 'z. B. Keller, Reifenhotel', max: 60 })}
      </div>
      <details class="vt-more rounded-xl border border-ink/10 px-3 py-2 mb-3">
        <summary class="text-sm cursor-pointer select-none">🛞 Reifensätze (Alter &amp; Profil)</summary>
        <div class="pt-3">
          <div id="fzvSetSW">${setRow('sommer', 'Sommer')}${setRow('winter', 'Winter')}</div>
          <div id="fzvSetGJ">${setRow('ganzjahr', 'Ganzjahr')}</div>
          <p class="text-[11px] text-ink/45">Das DOT-Jahr steht auf der Reifenflanke (z. B. „2322“ = Woche 23/2022). pinn. warnt bei wenig Profil und alten Reifen.</p>
        </div>
      </details>
    </div>
    <label class="fz-check" id="fzvVkWrap"><input type="checkbox" id="fzvVk"${draft.vk !== false ? ' checked' : ''} /> <span>An das neue Versicherungskennzeichen erinnern (gilt jeweils ab 1. März)</span></label>

    <h4 class="vt-form-h">💶 Kauf, Wert &amp; Steuer</h4>
    <div class="fz-grid2">
      ${fzIn('fzvBuyDate', 'Gekauft am', vtIsIso(draft.purchaseDate) ? draft.purchaseDate : '', { type: 'date' })}
      ${fzIn('fzvBuyPrice', 'Kaufpreis', Number(draft.purchasePrice) > 0 ? euroInputValue(draft.purchasePrice) : '', { mode: 'decimal', unit: curSym() })}
    </div>
    <div class="fz-grid2">
      ${fzIn('fzvOdoStart', 'km-Stand beim Kauf', draft.odoStart !== '' && draft.odoStart != null && isFinite(Number(draft.odoStart)) ? fzNum(draft.odoStart) : '', { mode: 'numeric', unit: 'km' })}
      ${fzYmIn('fzvFirstReg', 'Erstzulassung', draft.firstReg, { wrapId: 'fzvFirstRegWrap' })}
    </div>
    ${fzIn('fzvValue', 'Aktueller Wert (geschätzt)', Number(draft.value) > 0 ? euroInputValue(draft.value) : '', { mode: 'decimal', unit: curSym(), ph: 'z. B. aus einer Online-Bewertung' })}
    <div class="fz-grid2" id="fzvTaxWrap">
      ${fzIn('fzvTax', 'Kfz-Steuer', taxRec ? euroInputValue(finRecurringAmountFor(taxRec, today)) : '', { mode: 'decimal', unit: curSym() + '/Jahr' })}
      ${fzIn('fzvTaxDate', 'Abbuchung am', taxRec ? (finRecNext(taxRec, today) || finRecStart(taxRec)) : '', { type: 'date' })}
    </div>

    <h4 class="vt-form-h">✅ Automatische Aufgaben</h4>
    <label class="fz-check"><input type="checkbox" id="fzvAutoOn"${a.on ? ' checked' : ''} /> <span>Aufgaben für HU, Inspektion, Reifenwechsel und Fristen automatisch anlegen</span></label>
    <div id="fzvAutoWrap">
      ${fzSel('fzvAutoDays', 'Vorlauf', FZ_REMIND_DAYS.map(d => [String(d), d + ' Tage vorher']), String(a.days))}
      <span class="fz-lbl">Zuständig</span>
      <div class="flex flex-wrap gap-1.5 mb-1" id="fzvAutoTo">${members.map(m => `<button type="button" class="fz-member-chip px-2.5 py-1.5 text-xs${a.to.includes(m.id) ? ' active' : ''}" data-m="${escapeHtml(m.id)}">${escapeHtml(memberLabel(m))}</button>`).join('')}</div>
      <p class="text-[11px] text-ink/45 mb-2">Niemand gewählt: die Aufgabe geht an den Halter.</p>
      <div class="fz-field">${taskRemindHtml('fzv', a.remindAt, { label: '🔔 Extra-Erinnerung per Push', def: '09:00' })}</div>
    </div>

    <details class="vt-more mt-3 rounded-xl border border-ink/10 px-3 py-2"${draft.vin || draft.hsn || draft.tsn || draft.note ? ' open' : ''}>
      <summary class="text-sm cursor-pointer select-none">🪪 Fahrzeugdaten &amp; Notiz</summary>
      <div class="pt-3">
        ${fzIn('fzvVin', 'FIN / Rahmennummer', draft.vin || '', { max: 40 })}
        <div class="fz-grid2" id="fzvKeyWrap">${fzIn('fzvHsn', 'HSN (2.1)', draft.hsn || '', { max: 4 })}${fzIn('fzvTsn', 'TSN (2.2)', draft.tsn || '', { max: 10 })}</div>
        <div class="fz-field"><label class="fz-lbl" for="fzvNote">Notiz</label><textarea id="fzvNote" rows="3" class="fz-in" maxlength="2000" placeholder="z. B. Reifendruck, Ölsorte, Werkstatt">${escapeHtml(draft.note || '')}</textarea></div>
      </div>
    </details>

    <p id="fzvError" class="hidden text-xs text-red-500 mt-3"></p>
    <div class="flex items-center gap-2 mt-5">
      ${v ? '<button type="button" id="fzvDelete" class="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition">Löschen</button>' : ''}
      <div class="flex-1"></div>
      <button type="button" id="fzvCancel" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink">Abbrechen</button>
      <button type="button" id="fzvSave" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90">Speichern</button>
    </div>`;
  fzOpenModal(html, body => {
    fzYmWire(body);
    body.querySelectorAll('#fzvKinds .fz-kind-btn').forEach(b => b.addEventListener('click', () => {
      draft.kind = b.dataset.kind;
      const k = fzKind(draft.kind);
      if (!k.drives.includes(draft.drive)) draft.drive = k.defaultDrive;
      body.querySelectorAll('#fzvKinds .fz-kind-btn').forEach(x => x.classList.toggle('active', x === b));
      fzVehicleFormUi();
    }));
    body.querySelectorAll('#fzvColors .fz-color-btn').forEach(b => b.addEventListener('click', () => {
      draft.color = b.dataset.color;
      body.querySelectorAll('#fzvColors .fz-color-btn').forEach(x => x.classList.toggle('active', x === b));
    }));
    body.querySelectorAll('#fzvAutoTo .fz-member-chip').forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
    taskRemindWire('fzv');
    ['fzvTireMode', 'fzvAutoOn'].forEach(id => document.getElementById(id).addEventListener('change', fzVehicleFormUi));
    document.getElementById('fzvCancel').addEventListener('click', () => attemptCloseModal('fzModal', fzCloseModal));
    document.getElementById('fzvSave').addEventListener('click', fzSaveVehicle);
    const del = document.getElementById('fzvDelete');
    if (del) del.addEventListener('click', () => fzDeleteVehicle(v.id));
    fzVehicleFormUi();
    if (!isMobile() && !v) setTimeout(() => document.getElementById('fzvName').focus(), 50);
  });
}
function fzVehicleFormUi() {
  const st = fzModalState;
  if (!st || st.mode !== 'vehicle') return;
  const draft = st.draft;
  const k = fzKind(draft.kind);
  const drives = k.drives.map(id => FZ_DRIVES.find(d => d.id === id)).filter(Boolean);
  const dWrap = document.getElementById('fzvDrives');
  dWrap.innerHTML = drives.map(d => `<button type="button" class="fz-drive-btn px-2.5 py-1.5 text-xs${d.id === draft.drive ? ' active' : ''}" data-drive="${d.id}">${d.icon} ${escapeHtml(d.label)}</button>`).join('');
  dWrap.querySelectorAll('.fz-drive-btn').forEach(b => b.addEventListener('click', () => { draft.drive = b.dataset.drive; fzVehicleFormUi(); }));
  const fuels = fzFuels(draft);
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !on); };
  show('fzvDriveWrap', drives.length > 1);
  show('fzvTankWrap', fuels.some(f => f !== 'strom'));
  show('fzvBatteryWrap', fuels.includes('strom'));
  show('fzvPlateWrap', !k.bike);
  document.querySelector('label[for="fzvPlate"]').textContent = k.plate ? 'Kennzeichen' : 'Versicherungskennzeichen';
  show('fzvHuWrap', !!k.hu);
  show('fzvTireWrap', !!k.tires);
  const mode = fzVal('fzvTireMode') || 'wechsel';
  show('fzvMountedWrap', mode === 'wechsel');
  show('fzvChangeWrap', mode === 'wechsel');
  show('fzvSetSW', mode !== 'ganzjahr');
  show('fzvSetGJ', mode === 'ganzjahr');
  show('fzvVkWrap', !!k.vk);
  show('fzvTaxWrap', k.plate && fuels.length > 0);
  show('fzvKeyWrap', !!k.plate);
  document.querySelector('label[for="fzvFirstReg_m"]').textContent = k.bike ? 'Baujahr (Monat)' : 'Erstzulassung';
  document.querySelector('label[for="fzvVin"]').textContent = k.bike ? 'Rahmennummer' : 'FIN (Fahrzeug-Ident.-Nr.)';
  show('fzvAutoWrap', fzChecked('fzvAutoOn'));
}
function fzSaveVehicle() {
  const st = fzModalState;
  if (!st || st.mode !== 'vehicle') return;
  const today = finTodayIso();
  const existing = st.id ? fzVehicle(st.id) : null;
  const d = st.draft;
  const k = fzKind(d.kind);
  const err = msg => fzShowErr('fzvError', msg);
  const name = fzVal('fzvName').replace(/\s+/g, ' ').slice(0, 60);
  const make = fzVal('fzvMake').slice(0, 40), model = fzVal('fzvModel').slice(0, 60);
  if (!name && !make && !model) return err('Bitte einen Namen oder Marke/Modell eingeben.');
  const huVal = fzYmVal('fzvHuDue');
  const huDue = huVal.ym;
  if (k.hu && huVal.invalid) return err('HU-Termin bitte mit Monat (01–12) und Jahr eingeben, z. B. 11 / 2026.');
  const regVal = fzYmVal('fzvFirstReg');
  const firstReg = regVal.ym;
  if (regVal.invalid) return err('Erstzulassung bitte mit Monat (01–12) und Jahr eingeben, z. B. 03 / 2019.');
  const num = (id, parser) => { const raw = fzVal(id); return raw ? parser(raw) : ''; };
  const svcKm = num('fzvSvcKm', fzParseInt);
  const svcOdo = num('fzvSvcOdo', fzParseInt);
  const odoStart = num('fzvOdoStart', fzParseInt);
  const buyPrice = num('fzvBuyPrice', parseEuro);
  const value = num('fzvValue', parseEuro);
  const tax = num('fzvTax', parseEuro);
  const tank = num('fzvTank', fzParseDec);
  const battery = num('fzvBattery', fzParseDec);
  for (const [x, label] of [[svcKm, 'Inspektions-km'], [svcOdo, 'km-Stand der Inspektion'], [odoStart, 'km-Stand beim Kauf'], [buyPrice, 'Kaufpreis'], [value, 'Wert'], [tax, 'Kfz-Steuer'], [tank, 'Tank'], [battery, 'Akku']]) {
    if (x !== '' && (!isFinite(x) || x < 0)) return err('Bitte eine gültige Zahl bei „' + label + '“ eingeben.');
  }
  const taxDate = fzVal('fzvTaxDate');
  if (tax > 0 && !vtIsIso(taxDate)) return err('Bitte angeben, wann die Kfz-Steuer abgebucht wird.');
  const sets = {};
  ['sommer', 'winter', 'ganzjahr'].forEach(sid => {
    const dot = fzParseInt(fzVal('fzvDot_' + sid));
    const tread = fzParseDec(fzVal('fzvTread_' + sid));
    const s = {};
    if (dot >= 1990 && dot <= 2100) s.dot = String(dot);
    else if (dot >= 100 && dot <= 9999 && String(dot).length === 4 && dot % 100 >= 0) { const yy = dot % 100; s.dot = String(2000 + yy); } // "2322" = week 23 of 2022
    if (tread > 0 && tread < 20) s.tread = Math.round(tread * 10) / 10;
    if (s.dot || s.tread) sets[sid] = s;
  });
  const id = existing ? existing.id : 'f' + newRecordId().slice(0, 14);
  const valueChanged = value !== '' && (!existing || Number(existing.value) !== Number(value));
  const autoTo = [...document.querySelectorAll('#fzvAutoTo .fz-member-chip.active')].map(b => b.dataset.m).filter(x => memberById(x));
  const prevAuto = fzAutoSettings(existing || {});
  const vehicle = {
    ...(existing || {}),
    id, kind: d.kind, name, make, model,
    plate: k.bike ? '' : fzPlateText(fzVal('fzvPlate')).slice(0, 16),
    color: fzColor(d), drive: k.drives.length ? d.drive : '',
    tank: tank === '' ? '' : Math.round(tank * 10) / 10, battery: battery === '' ? '' : Math.round(battery * 10) / 10,
    holder: fzVal('fzvHolder'),
    hu: k.hu ? { due: huDue, months: parseInt(fzVal('fzvHuMonths'), 10) || 24 } : null,
    service: { months: parseInt(fzVal('fzvSvcMonths'), 10) || 0, km: svcKm === '' ? 0 : svcKm, lastDate: vtIsIso(fzVal('fzvSvcDate')) ? fzVal('fzvSvcDate') : '', lastOdo: svcOdo },
    tires: k.tires ? { mode: fzVal('fzvTireMode') || 'wechsel', mounted: fzVal('fzvTireMounted') || 'sommer', toWinter: parseInt(fzVal('fzvToWinter'), 10) || 10, toSummer: parseInt(fzVal('fzvToSummer'), 10) || 4, size: fzVal('fzvTireSize').slice(0, 40), storage: fzVal('fzvTireStore').slice(0, 60), sets } : (existing && existing.tires) || null,
    vk: k.vk ? fzChecked('fzvVk') : (existing ? existing.vk : true),
    purchaseDate: vtIsIso(fzVal('fzvBuyDate')) ? fzVal('fzvBuyDate') : '',
    purchasePrice: buyPrice === '' ? '' : buyPrice,
    odoStart, firstReg,
    value: value === '' ? '' : value,
    valueDate: value === '' ? '' : (valueChanged ? today : ((existing && existing.valueDate) || today)),
    autoTasks: { on: fzChecked('fzvAutoOn'), days: parseInt(fzVal('fzvAutoDays'), 10) || 30, to: autoTo, made: prevAuto.made, remindAt: taskRemindValue('fzv') },
    vin: fzVal('fzvVin').toUpperCase().slice(0, 40), hsn: fzVal('fzvHsn').slice(0, 4), tsn: fzVal('fzvTsn').toUpperCase().slice(0, 10),
    note: (document.getElementById('fzvNote').value || '').trim().slice(0, 2000),
    deadlines: (existing && Array.isArray(existing.deadlines)) ? existing.deadlines : [],
    docLinks: (existing && Array.isArray(existing.docLinks)) ? existing.docLinks : [],
    archived: (existing && existing.archived) || null,
    created: (existing && existing.created) || today,
    updated: today,
  };
  // Vehicle tax as a yearly booking in Finanzen
  let taxRecId = (existing && existing.taxRecId && finance.recurring.some(r => r.id === existing.taxRecId)) ? existing.taxRecId : '';
  const taxOn = k.plate && fzFuels(vehicle).length > 0 && tax !== '' && tax > 0;
  if (taxOn) {
    const fields = { title: 'Kfz-Steuer ' + fzName(vehicle), amount: Math.round(tax * 100) / 100, category: FZ_FIN_CATEGORY, paidBy: vehicle.holder || '', note: '', link: 'fahrzeug:' + id, interval: 'yearly', start: taxDate };
    if (taxRecId) {
      const r = finance.recurring.find(x => x.id === taxRecId);
      const changed = Math.abs(finRecurringAmountFor(r, today) - fields.amount) > 0.001 || (finRecNext(r, today) || finRecStart(r)) !== taxDate || finRecUntil(r);
      if (changed) {
        const start = finRecStart(r) && finRecStart(r) < taxDate && finRecStart(r).slice(5) === taxDate.slice(5) ? finRecStart(r) : taxDate;
        finUpsertRecurring(taxRecId, { ...fields, note: r.note || '', start }, null);
        finance.recurring = finance.recurring.map(x => x.id === taxRecId ? { ...x, until: '' } : x);
      }
    } else {
      taxRecId = finUpsertRecurring(null, fields).id;
    }
    finance.recurring = finance.recurring.map(x => x.id === taxRecId ? { ...x, vehicle: id } : x);
  } else if (taxRecId) {
    finEndRecurring(taxRecId);
    taxRecId = '';
  }
  vehicle.taxRecId = taxRecId;
  finance.vehicles = existing ? fzVehicles().map(x => x.id === id ? vehicle : x) : [...fzVehicles(), vehicle];
  // Open tasks of this vehicle take over the reminder time right away
  const madeIds = new Set(Object.values(prevAuto.made || {}).map(x => x && x.id).filter(Boolean));
  if (madeIds.size) taskRemindApplyOpen(t => madeIds.has(t.id), vehicle.autoTasks.remindAt);
  fzCloseModal();
  fzDetailId = id;
  fzTab = 'liste';
  fzAfterChange();
  finShowToast(existing ? 'Fahrzeug gespeichert.' : 'Fahrzeug angelegt – jetzt Tanken, Werkstatt & Co. eintragen.');
}
async function fzDeleteVehicle(id) {
  const v = fzVehicle(id);
  if (!v) return;
  const nLogs = fzLogsFor(id).length;
  let msg = `„${fzName(v)}“ endgültig löschen?`;
  if (nLogs) msg += ` ${nLogs} Einträge im Verlauf werden gelöscht – bereits in Finanzen gebuchte Ausgaben bleiben erhalten.`;
  if (Array.isArray(v.docLinks) && v.docLinks.length) msg += ` Verknüpfte Dokumente bleiben unter „Dokumente“ erhalten.`;
  msg += '\n\nTipp: „Verkauft / abgemeldet“ behält die Kosten für die Bilanz.';
  if (!confirm(msg)) return;
  if (v.taxRecId && finance.recurring.some(r => r.id === v.taxRecId)) finEndRecurring(v.taxRecId);
  finance.recurring = finance.recurring.map(r => r.vehicle === id ? { ...r, vehicle: '' } : r);
  finance.contracts = vtContracts().map(c => c.vehicle === id ? { ...c, vehicle: '' } : c);
  finance.vehicleLog = fzLogs().filter(l => l.vehicle !== id);
  finance.vehicles = fzVehicles().filter(x => x.id !== id);
  fzCloseModal();
  fzDetailId = null;
  fzAfterChange();
  finShowToast('Fahrzeug gelöscht.');
  finDeleteDocsFor('fahrzeug:' + id);
}

/* ---------- Popup: entry (refuelling, charging, workshop …) ---------- */
function fzOpenLogModal({ vehicleId = '', logId = '', type = '', fromDue = null } = {}) {
  if (isCurrentUserGuest()) return;
  const log = logId ? fzLogById(logId) : null;
  const v = fzVehicle(log ? log.vehicle : vehicleId);
  if (!v) { finShowToast('Dieses Fahrzeug gibt es nicht mehr.', true); return; }
  const types = fzTypesFor(v);
  let t = log ? log.type : (type || (fzCanFuel(v) ? 'tanken' : fzCanCharge(v) ? 'laden' : 'wartung'));
  if (!types.some(x => x.id === t) && !log) t = types[0].id;
  const today = finTodayIso();
  const fuels = fzFuels(v).filter(f => f !== 'strom');
  const l = log || { type: t, date: today, fuel: fuels[0] || 'benzin', where: 'home', full: true, booked: true, paidBy: currentMember() ? currentMember().id : '' };
  if (!log && fromDue && fromDue.type === 'reifen') l.tireSwitch = fromDue.need;
  if (!log && fromDue && fromDue.type === 'service') l.inspection = true;
  if (!log && fromDue && fromDue.type === 'vk') l.desc = 'Versicherungskennzeichen ' + (fromDue.key || '').slice(3);
  fzModalState = { mode: 'log', id: log ? log.id : null, vehicle: v.id, type: t, fromDue, lastEdit: [], bookedTouched: !!log };
  fzLogPending = [];
  const k = fzKind(v.kind);
  const lastOdo = fzCurrentOdo(v);
  const huMonths = (v.hu && parseInt(v.hu.months, 10)) || k.hu || 24;
  const nextHu = (() => { const base = vtIsIso(l.date) ? l.date : today; return vtAddMonths(base.slice(0, 7) + '-01', huMonths, false).slice(0, 7); })();
  const fuelOpts = fuels.map(f => [f, FZ_FUELS[f].label]);
  const sortOpts = f => [['', '–']].concat((FZ_FUELS[f] && FZ_FUELS[f].sorts ? FZ_FUELS[f].sorts : []).map(s => [s, s]));
  const html = `
    <h3 class="font-serif text-lg mb-1 pr-6">${log ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</h3>
    <div class="text-xs text-ink/50 mb-3">${escapeHtml(fzKind(v.kind).icon + ' ' + fzShortName(v))}</div>
    <div class="fz-type-row mb-3" id="fzlTypes">${types.map(x => `<button type="button" class="fz-type-chip${x.id === t ? ' active' : ''}" data-type="${x.id}"><span class="fz-ti">${x.icon}</span>${escapeHtml(x.label)}</button>`).join('')}</div>

    <div id="fzlEnergy">
      <div class="fz-grid2" id="fzlFuelRow">
        ${fzSel('fzlFuel', 'Kraftstoff', fuelOpts.length ? fuelOpts : [['benzin', 'Benzin']], l.fuel || (fuels[0] || 'benzin'))}
        ${fzSel('fzlSort', 'Sorte', sortOpts(l.fuel || fuels[0] || 'benzin'), l.sort || '')}
      </div>
      ${fzSel('fzlWhere', 'Wo geladen', FZ_CHARGE_WHERE.map(w => [w.id, w.label]), l.where || 'home', { wrapId: 'fzlWhereWrap' })}
      <div class="fz-grid2">
        ${fzIn('fzlQty', 'Menge', Number(l.qty) > 0 ? fzDecInput(l.qty) : '', { mode: 'decimal', unit: 'l' })}
        ${fzIn('fzlPrice', 'Preis je Einheit', Number(l.price) > 0 ? fzDecInput(l.price) : '', { mode: 'decimal', unit: curSym() + '/l' })}
      </div>
      <label class="fz-check"><input type="checkbox" id="fzlFull"${l.full ? ' checked' : ''} /> <span id="fzlFullLabel">Vollgetankt <span class="text-ink/45">(für den genauen Verbrauch)</span></span></label>
      ${fzIn('fzlStation', 'Tankstelle', l.station || '', { ph: 'optional, z. B. Aral Hauptstraße', max: 80, wrapId: 'fzlStationWrap' })}
    </div>
    ${fzIn('fzlDesc', 'Beschreibung', l.desc || '', { ph: 'z. B. Ölwechsel, Bremsbeläge, Waschanlage', max: 120, wrapId: 'fzlDescWrap' })}
    <label class="fz-check" id="fzlInspWrap"><input type="checkbox" id="fzlInsp"${l.inspection ? ' checked' : ''} /> <span>War eine Inspektion – Intervall ab hier neu starten</span></label>
    <div id="fzlHuWrap" class="fz-grid2">
      ${fzSel('fzlHuResult', 'Ergebnis', [['ohne Mängel', 'ohne Mängel ✓'], ['geringe Mängel', 'geringe Mängel'], ['erhebliche Mängel', 'erhebliche Mängel (Nachprüfung)']], l.huResult || 'ohne Mängel')}
      ${fzYmIn('fzlHuNext', 'Nächste HU', log ? '' : nextHu, { hint: log ? 'leer lassen = unverändert' : '' })}
    </div>
    <div id="fzlTireWrap" class="fz-grid2">
      ${fzSel('fzlTireSwitch', 'Gewechselt auf', [['', '– kein Wechsel'], ['sommer', 'Sommerreifen'], ['winter', 'Winterreifen'], ['ganzjahr', 'Ganzjahresreifen']], l.tireSwitch || '')}
      ${fzIn('fzlTireDot', 'Neue Reifen: DOT-Jahr', l.tireDot || '', { ph: 'nur bei neuen Reifen', mode: 'numeric', max: 4 })}
    </div>

    <div class="fz-grid2">
      ${fzIn('fzlDate', 'Datum', vtIsIso(l.date) ? l.date : today, { type: 'date' })}
      ${fzIn('fzlOdo', 'Kilometerstand', Number(l.odo) > 0 ? fzNum(l.odo) : '', { mode: 'numeric', unit: 'km', ph: lastOdo ? 'zuletzt ' + fzNum(lastOdo) : '' })}
    </div>
    <div id="fzlMoney">
      <div class="fz-grid2">
        ${fzIn('fzlAmount', 'Betrag', Number(l.amount) > 0 ? euroInputValue(l.amount) : '', { mode: 'decimal', unit: curSym() })}
        <div class="fin-paidby-wrap min-w-0">${fzSel('fzlPaidBy', 'Bezahlt von', fzMemberOptions(), l.paidBy || '')}</div>
      </div>
      <label class="fz-check"><input type="checkbox" id="fzlBooked"${l.booked !== false ? ' checked' : ''} /> <span>Auch in Finanzen als Ausgabe buchen <span class="text-ink/45" id="fzlBookedHint"></span></span></label>
    </div>
    ${fzIn('fzlNote', 'Notiz', l.note || '', { ph: 'optional', max: 500 })}
    <div id="fzlDocsWrap">
      <div class="flex items-center justify-between gap-2 mb-1.5"><span class="fz-lbl" style="margin:0">Beleg</span><button type="button" id="fzlDocAdd" class="fz-mini-btn">📎 Foto / PDF</button></div>
      <div id="fzlDocs" class="flex flex-col gap-1.5 mb-2"></div>
    </div>
    <p id="fzlError" class="hidden text-xs text-red-500 mt-2"></p>
    <div class="flex items-center gap-2 mt-4">
      ${log ? '<button type="button" id="fzlDelete" class="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition">Löschen</button>' : ''}
      <div class="flex-1"></div>
      <button type="button" id="fzlCancel" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink">Abbrechen</button>
      <button type="button" id="fzlSave" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90">Speichern</button>
    </div>`;
  fzOpenModal(html, body => {
    fzYmWire(body);
    body.querySelectorAll('#fzlTypes .fz-type-chip').forEach(b => b.addEventListener('click', () => {
      fzModalState.type = b.dataset.type;
      body.querySelectorAll('#fzlTypes .fz-type-chip').forEach(x => x.classList.toggle('active', x === b));
      fzLogFormUi(true);
    }));
    document.getElementById('fzlFuel').addEventListener('change', () => {
      const f = fzVal('fzlFuel');
      document.getElementById('fzlSort').innerHTML = sortOpts(f).map(o => `<option value="${escapeHtml(o[0])}">${escapeHtml(o[1])}</option>`).join('');
      fzLogFormUi(true);
    });
    document.getElementById('fzlWhere').addEventListener('change', () => fzLogFormUi(true));
    document.getElementById('fzlBooked').addEventListener('change', () => { fzModalState.bookedTouched = true; });
    ['fzlQty', 'fzlPrice', 'fzlAmount'].forEach(id => document.getElementById(id).addEventListener('input', () => fzLogCalc(id)));
    document.getElementById('fzlDate').addEventListener('change', () => {
      if (!log && vtIsIso(fzVal('fzlDate'))) fzYmSet('fzlHuNext', vtAddMonths(fzVal('fzlDate').slice(0, 7) + '-01', huMonths, false).slice(0, 7));
    });
    document.getElementById('fzlDocAdd').addEventListener('click', () => {
      if (fzModalState && fzModalState.id) {
        if (!navigator.onLine) { finShowToast('Keine Verbindung – Belege lassen sich nur mit Verbindung zum NAS hochladen.', true); return; }
        finPickDocs({ mode: 'fzlog', bezug: 'ausgabe:' + fzModalState.id, typ: 'beleg' });
      } else finPickDocs({ mode: 'fzlog-new', bezug: '', typ: 'beleg' });
    });
    document.getElementById('fzlCancel').addEventListener('click', () => attemptCloseModal('fzModal', fzCloseModal));
    document.getElementById('fzlSave').addEventListener('click', fzSaveLog);
    const del = document.getElementById('fzlDelete');
    if (del) del.addEventListener('click', () => fzDeleteLog(log.id));
    fzLogFormUi(!log);
    fzRenderLogDocs();
    if (log) { loadFinDocs(); ensureFinDocToken().then(refreshDocLinks); }
  });
}
function fzLogFormUi(setDefaults) {
  const st = fzModalState;
  if (!st || st.mode !== 'log') return;
  const v = fzVehicle(st.vehicle);
  const t = st.type;
  const energy = t === 'tanken' || t === 'laden';
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !on); };
  show('fzlEnergy', energy);
  show('fzlFuelRow', t === 'tanken');
  show('fzlWhereWrap', t === 'laden');
  show('fzlStationWrap', t === 'tanken');
  show('fzlDescWrap', !energy && t !== 'km' && t !== 'hu');
  show('fzlInspWrap', t === 'wartung');
  show('fzlHuWrap', t === 'hu');
  show('fzlTireWrap', t === 'reifen');
  show('fzlMoney', t !== 'km');
  show('fzlDocsWrap', t !== 'km');
  const fuel = t === 'laden' ? 'strom' : (fzVal('fzlFuel') || 'benzin');
  const unit = FZ_FUELS[fuel] ? FZ_FUELS[fuel].unit : 'l';
  const qtyUnit = document.querySelector('#fzlQty + span');
  if (qtyUnit) qtyUnit.textContent = unit;
  const priceUnit = document.querySelector('#fzlPrice + span');
  if (priceUnit) priceUnit.textContent = curSym() + '/' + unit;
  document.getElementById('fzlFullLabel').innerHTML = t === 'laden' ? 'Voll geladen <span class="text-ink/45">(für den genauen Verbrauch)</span>' : 'Vollgetankt <span class="text-ink/45">(für den genauen Verbrauch)</span>';
  const home = t === 'laden' && fzVal('fzlWhere') === 'home';
  document.getElementById('fzlBookedHint').textContent = home ? '(Zuhause-Laden steckt meist schon in der Stromrechnung)' : '';
  if (setDefaults) {
    if (!st.bookedTouched) document.getElementById('fzlBooked').checked = !home && t !== 'km';
    if (energy) {
      const priceEl = document.getElementById('fzlPrice');
      const where = t === 'laden' ? fzVal('fzlWhere') : '';
      const last = fzLastPrice(fuel, v, where);
      if (!st.priceTouched || !priceEl.value) { priceEl.value = last > 0 ? fzDecInput(last) : ''; st.priceTouched = false; }
      fzLogCalc('fzlPrice', true);
    }
  }
}
// Quantity × price = amount: calculate the third value from the two most recently entered ones
function fzLogCalc(changedId, silent) {
  const st = fzModalState;
  if (!st || st.mode !== 'log') return;
  if (!silent) {
    if (changedId === 'fzlPrice') st.priceTouched = true;
    st.lastEdit = [changedId, ...st.lastEdit.filter(x => x !== changedId)].slice(0, 2);
  }
  if (st.type !== 'tanken' && st.type !== 'laden') return;
  const qty = fzParseDec(fzVal('fzlQty')), price = fzParseDec(fzVal('fzlPrice')), amount = parseEuro(fzVal('fzlAmount'));
  const edited = st.lastEdit.length ? st.lastEdit : ['fzlQty', 'fzlPrice'];
  const target = ['fzlAmount', 'fzlQty', 'fzlPrice'].find(x => !edited.includes(x)) || 'fzlAmount';
  if (target === 'fzlAmount' && qty > 0 && price > 0) document.getElementById('fzlAmount').value = euroInputValue(Math.round(qty * price * 100) / 100);
  else if (target === 'fzlQty' && amount > 0 && price > 0) document.getElementById('fzlQty').value = fzDecInput(Math.round(amount / price * 100) / 100);
  else if (target === 'fzlPrice' && amount > 0 && qty > 0) document.getElementById('fzlPrice').value = fzDecInput(Math.round(amount / qty * 1000) / 1000);
}
function fzRenderLogDocs() {
  const list = document.getElementById('fzlDocs');
  const st = fzModalState;
  if (!list || !st || st.mode !== 'log') return;
  const bezug = st.id ? 'ausgabe:' + st.id : '';
  const docs = bezug ? finDocsFor(bezug) : [];
  const pending = fzLogPending.map((f, i) => `
    <div class="flex items-center gap-2 rounded-xl border border-dashed border-ink/20 pl-2.5 pr-1 py-1.5">
      <span class="text-lg shrink-0">📎</span>
      <span class="flex-1 min-w-0"><span class="block text-sm truncate">${escapeHtml(f.name || 'Datei')}</span><span class="block text-[11px] text-ink/45">wird beim Speichern hochgeladen</span></span>
      <button type="button" data-fzpend="${i}" class="shrink-0 w-8 h-8 rounded-lg text-ink/40 hover:text-red-500 grid place-items-center text-lg leading-none" aria-label="Entfernen">×</button>
    </div>`).join('');
  list.innerHTML = (finDocRowsHtml(docs, bezug) + pending) || '<p class="text-xs text-ink/40 italic">Tankquittung, Werkstattrechnung … – als Foto oder PDF.</p>';
  list.querySelectorAll('[data-fzpend]').forEach(b => b.addEventListener('click', () => { fzLogPending.splice(Number(b.dataset.fzpend), 1); fzRenderLogDocs(); }));
}
function fzSaveLog() {
  const st = fzModalState;
  if (!st || st.mode !== 'log') return;
  const v = fzVehicle(st.vehicle);
  if (!v) return;
  const err = msg => fzShowErr('fzlError', msg);
  const today = finTodayIso();
  const existing = st.id ? fzLogById(st.id) : null;
  const t = st.type;
  const date = fzVal('fzlDate');
  if (!vtIsIso(date)) return err('Bitte ein Datum wählen.');
  const odoRaw = fzVal('fzlOdo');
  const odo = odoRaw ? fzParseInt(odoRaw) : 0;
  if (odoRaw && (!isFinite(odo) || odo < 0 || odo > 3000000)) return err('Bitte einen gültigen Kilometerstand eingeben.');
  if (t === 'km' && !odo) return err('Bitte den Kilometerstand eingeben.');
  const energy = t === 'tanken' || t === 'laden';
  const qty = energy ? fzParseDec(fzVal('fzlQty')) : NaN;
  const price = energy ? fzParseDec(fzVal('fzlPrice')) : NaN;
  const amountRaw = t === 'km' ? '' : fzVal('fzlAmount');
  const amount = amountRaw ? parseEuro(amountRaw) : 0;
  if (amountRaw && (!isFinite(amount) || amount < 0 || amount > 1000000)) return err('Bitte einen gültigen Betrag eingeben.');
  if (energy && !(qty > 0) && !(amount > 0)) return err('Bitte Menge oder Betrag eingeben.');
  // Plausibility of the odometer reading (hint only)
  if (odo) {
    const pts = fzOdoPoints(v).filter(p => !existing || !(p.date === existing.date && p.odo === Number(existing.odo)));
    const before = pts.filter(p => p.date < date).map(p => p.odo);
    const after = pts.filter(p => p.date > date).map(p => p.odo);
    if ((before.length && odo < Math.max(...before)) || (after.length && odo > Math.min(...after))) {
      if (!confirm('Der Kilometerstand passt nicht zu den anderen Einträgen (kleiner als ein früherer bzw. größer als ein späterer). Trotzdem speichern?')) return;
    }
  }
  let huNext = '';
  if (t === 'hu') {
    const hv = fzYmVal('fzlHuNext');
    huNext = hv.ym;
    if (hv.invalid) return err('Nächste HU bitte mit Monat (01–12) und Jahr eingeben, z. B. 11 / 2028.');
  }
  const booked = t !== 'km' && amount > 0 && fzChecked('fzlBooked');
  const id = existing ? existing.id : newRecordId();
  const tireDot = fzParseInt(fzVal('fzlTireDot'));
  const log = {
    ...(existing || {}),
    id, vehicle: v.id, type: t, date, odo: odo || '',
    fuel: t === 'tanken' ? (fzVal('fzlFuel') || 'benzin') : (t === 'laden' ? 'strom' : ''),
    sort: t === 'tanken' ? fzVal('fzlSort') : '',
    where: t === 'laden' ? fzVal('fzlWhere') : '',
    qty: energy && qty > 0 ? Math.round(qty * 1000) / 1000 : '',
    price: energy && price > 0 ? Math.round(price * 1000) / 1000 : '',
    full: energy ? fzChecked('fzlFull') : false,
    station: t === 'tanken' ? fzVal('fzlStation').slice(0, 80) : '',
    desc: (!energy && t !== 'km' && t !== 'hu') ? fzVal('fzlDesc').slice(0, 120) : '',
    inspection: t === 'wartung' ? fzChecked('fzlInsp') : false,
    huResult: t === 'hu' ? fzVal('fzlHuResult') : '',
    tireSwitch: t === 'reifen' ? fzVal('fzlTireSwitch') : '',
    tireDot: t === 'reifen' && tireDot >= 1990 && tireDot <= 2100 ? String(tireDot) : '',
    amount: amount > 0 ? Math.round(amount * 100) / 100 : '',
    booked, paidBy: fzVal('fzlPaidBy'),
    note: fzVal('fzlNote').slice(0, 500),
    created: (existing && existing.created) || new Date().toISOString(),
  };
  finance.vehicleLog = existing ? fzLogs().map(x => x.id === id ? log : x) : [...fzLogs(), log];

  // Effects on the vehicle
  let nv = { ...v };
  if (t === 'hu' && huNext) nv.hu = { ...(nv.hu || {}), due: huNext, months: (nv.hu && nv.hu.months) || fzKind(v.kind).hu || 24 };
  if (t === 'wartung' && log.inspection) {
    const sv = nv.service || {};
    if (!vtIsIso(sv.lastDate) || date >= sv.lastDate) nv.service = { ...sv, lastDate: date, lastOdo: odo || (vtIsIso(sv.lastDate) && date === sv.lastDate ? sv.lastOdo : '') };
  }
  if (t === 'reifen' && log.tireSwitch) {
    const tr = fzTireSetting(nv);
    const tires = { ...(nv.tires || {}), mode: tr.mode, toWinter: tr.toWinter, toSummer: tr.toSummer };
    if (log.tireSwitch === 'ganzjahr') tires.mode = 'ganzjahr';
    else { tires.mounted = log.tireSwitch; if (tires.mode === 'ganzjahr' || tires.mode === 'keine') tires.mode = 'wechsel'; }
    if (log.tireDot) tires.sets = { ...(tr.sets || {}), [log.tireSwitch]: { dot: log.tireDot, tread: 8 } };
    nv.tires = tires;
  }
  if (st.fromDue && st.fromDue.type === 'vk') nv.vkDoneYear = Number(String(st.fromDue.key || '').slice(3)) || Number(date.slice(0, 4));
  finance.vehicles = fzVehicles().map(x => x.id === v.id ? nv : x);

  // Finanzen: expense with the same ID
  if (booked) {
    const prev = ausgaben.find(x => x.id === id);
    finQueueSave({
      id, amount: log.amount, date, category: (prev && prev.category) || FZ_FIN_CATEGORY,
      title: fzExpenseTitle(log, nv), note: log.note, paidBy: log.paidBy, link: 'fahrzeug:' + v.id,
      store: log.station || '', listId: '', items: [],
      createdBy: prev ? (prev.createdBy || '') : ((currentUser() && currentUser().id) || ''),
      created: prev ? (prev.created || '') : new Date().toISOString(),
    });
  } else if (existing && existing.booked) {
    finQueueDelete(id);
  }
  // Tick off the task of the completed occasion
  if (st.fromDue && st.fromDue.key) fzCompleteTask(v, st.fromDue.key);
  const pending = fzLogPending.slice();
  fzCloseModal();
  fzDetailId = v.id;
  fzAfterChange();
  if (pending.length) finUploadMany(pending, 'ausgabe:' + id, 'beleg');
  const extra = t === 'hu' && huNext ? ' Nächste HU: ' + fzMonthLabel(huNext) + '.' : (t === 'wartung' && log.inspection ? ' Inspektions-Intervall neu gestartet.' : (t === 'reifen' && log.tireSwitch ? ' Reifen aktualisiert.' : ''));
  finShowToast((existing ? 'Eintrag gespeichert.' : 'Eintrag gespeichert' + (booked ? ` – ${fzEur(log.amount)} in Finanzen gebucht.` : '.')) + extra);
}
function fzDeleteLog(id) {
  const l = fzLogById(id);
  if (!l) return;
  const nDocs = finDocsFor('ausgabe:' + id).length;
  if (!confirm('Eintrag „' + fzLogTitle(l) + '“ löschen?' + (l.booked ? ' Die Ausgabe in Finanzen wird ebenfalls gelöscht.' : '') + (nDocs ? ` ${nDocs} Beleg${nDocs === 1 ? '' : 'e'} ebenfalls.` : ''))) return;
  finance.vehicleLog = fzLogs().filter(x => x.id !== id);
  if (l.booked) finQueueDelete(id);
  fzCloseModal();
  fzAfterChange();
  finShowToast('Eintrag gelöscht.');
  finDeleteDocsFor('ausgabe:' + id);
}

/* ---------- Small popups: deadline, sale, assign contracts, link documents ---------- */
function fzOpenDeadline(vid, did) {
  const v = fzVehicle(vid);
  if (!v) return;
  const d = did ? (v.deadlines || []).find(x => x.id === did) : null;
  const presets = ['Verbandkasten haltbar bis', 'Herstellergarantie', 'Akku-Garantie', 'Leasingende', 'Vignette', 'Umweltplakette', 'Anschlussgarantie'];
  fzOpenModal2(`
    <h3 class="font-serif text-lg mb-3 pr-6">${d ? 'Frist bearbeiten' : 'Neue Frist'}</h3>
    ${fzIn('fzdLabel', 'Was', d ? d.label : '', { ph: 'z. B. Verbandkasten haltbar bis', max: 60 })}
    <div class="flex flex-wrap gap-1.5 mb-3">${presets.map(p => `<button type="button" class="fz-filter-chip" data-preset="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join('')}</div>
    ${fzIn('fzdDate', 'Datum', d ? d.date : '', { type: 'date' })}
    <p class="text-[11px] text-ink/45 mb-2">Rechtzeitig vorher erscheint ein Hinweis und – wenn eingeschaltet – eine Aufgabe.</p>
    <p id="fzdError" class="hidden text-xs text-red-500 mb-2"></p>
    <div class="flex items-center gap-2 mt-3">
      ${d ? '<button type="button" id="fzdDelete" class="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition">Entfernen</button>' : ''}
      <div class="flex-1"></div>
      <button type="button" id="fzdCancel" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink">Abbrechen</button>
      <button type="button" id="fzdSave" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90">Speichern</button>
    </div>`, body => {
    body.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { document.getElementById('fzdLabel').value = b.dataset.preset; }));
    document.getElementById('fzdCancel').addEventListener('click', fzCloseModal2);
    document.getElementById('fzdSave').addEventListener('click', () => {
      const label = fzVal('fzdLabel').slice(0, 60);
      const date = fzVal('fzdDate');
      if (!label) return fzShowErr('fzdError', 'Bitte angeben, worum es geht.');
      if (!vtIsIso(date)) return fzShowErr('fzdError', 'Bitte ein Datum wählen.');
      const list = (v.deadlines || []).filter(x => x.id !== (d && d.id));
      if (d && d.date !== date) fzCompleteTask(v, 'frist:' + d.id + ':' + d.date);
      list.push({ id: d ? d.id : 'd' + newRecordId().slice(0, 8), label, date });
      finance.vehicles = fzVehicles().map(x => x.id === v.id ? { ...x, deadlines: list } : x);
      fzCloseModal2();
      fzAfterChange();
    });
    const del = document.getElementById('fzdDelete');
    if (del) del.addEventListener('click', () => {
      fzCompleteTask(v, 'frist:' + d.id + ':' + d.date);
      finance.vehicles = fzVehicles().map(x => x.id === v.id ? { ...x, deadlines: (x.deadlines || []).filter(y => y.id !== d.id) } : x);
      fzCloseModal2();
      fzAfterChange();
    });
  });
}
function fzOpenArchive(vid) {
  const v = fzVehicle(vid);
  if (!v) return;
  const today = finTodayIso();
  const active = fzContractsFor(v.id).filter(c => vtStatus(c, today).state === 'aktiv');
  fzOpenModal2(`
    <h3 class="font-serif text-lg mb-1 pr-6">Verkauft / abgemeldet</h3>
    <p class="text-xs text-ink/50 mb-3">${escapeHtml(fzShortName(v))} wandert ins Archiv – der Verlauf bleibt für die Bilanz erhalten, Hinweise und Aufgaben enden.</p>
    <div class="fz-grid2">${fzIn('fzaDate', 'Seit', today, { type: 'date' })}${fzIn('fzaPrice', 'Verkaufspreis', '', { mode: 'decimal', unit: curSym(), ph: 'optional' })}</div>
    <label class="fz-check"><input type="checkbox" id="fzaBook" checked /> <span>Verkaufspreis in Finanzen als Einnahme buchen</span></label>
    ${active.length ? `<div class="vt-info warn mb-2">Noch ${active.length === 1 ? 'ein laufender Vertrag' : active.length + ' laufende Verträge'}: ${escapeHtml(active.map(c => c.name).join(', '))} – Versicherung und Co. kündigen bzw. ummelden nicht vergessen.</div>` : ''}
    <p id="fzaError" class="hidden text-xs text-red-500 mb-2"></p>
    <div class="flex items-center gap-2 mt-3">
      <div class="flex-1"></div>
      <button type="button" id="fzaCancel" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink">Abbrechen</button>
      <button type="button" id="fzaSave" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90">Archivieren</button>
    </div>`, () => {
    document.getElementById('fzaCancel').addEventListener('click', fzCloseModal2);
    document.getElementById('fzaSave').addEventListener('click', () => {
      const date = fzVal('fzaDate');
      if (!vtIsIso(date)) return fzShowErr('fzaError', 'Bitte ein Datum wählen.');
      const raw = fzVal('fzaPrice');
      const price = raw ? parseEuro(raw) : '';
      if (raw && (!isFinite(price) || price < 0)) return fzShowErr('fzaError', 'Bitte einen gültigen Preis eingeben.');
      if (v.taxRecId) finance.recurring = finance.recurring.map(r => r.id === v.taxRecId && (!finRecUntil(r) || finRecUntil(r) > date) ? { ...r, until: date } : r);
      finance.vehicles = fzVehicles().map(x => x.id === v.id ? { ...x, archived: { date, price } } : x);
      if (price > 0 && fzChecked('fzaBook')) {
        finQueueSave({ id: newRecordId(), amount: -Math.round(price * 100) / 100, date, category: FIN_INCOME_CATEGORY, title: 'Verkauf ' + fzName(v), note: '', paidBy: v.holder || '', link: 'fahrzeug:' + v.id, store: '', listId: '', items: [], createdBy: (currentUser() && currentUser().id) || '', created: new Date().toISOString() });
      }
      fzCloseModal2();
      fzAfterChange();
      finShowToast('Archiviert.' + (active.length ? ' Denk an die Verträge!' : ''));
    });
  });
}
function fzUnarchive(vid) {
  const v = fzVehicle(vid);
  if (!v || !confirm(`„${fzName(v)}“ wieder als aktives Fahrzeug führen?`)) return;
  finance.vehicles = fzVehicles().map(x => x.id === vid ? { ...x, archived: null } : x);
  if (v.taxRecId) finance.recurring = finance.recurring.map(r => r.id === v.taxRecId ? { ...r, until: '' } : r);
  fzAfterChange();
}
function fzOpenContractAssign(vid) {
  const v = fzVehicle(vid);
  if (!v) return;
  const today = finTodayIso();
  const list = vtContracts().filter(c => vtStatus(c, today).state !== 'beendet').slice().sort((a, b) => {
    const pa = ['versicherung', 'auto'].includes(a.category) ? 0 : 1, pb = ['versicherung', 'auto'].includes(b.category) ? 0 : 1;
    return pa - pb || String(a.name || '').localeCompare(String(b.name || ''), 'de');
  });
  const rows = list.map(c => {
    const cat = vtCategory(c.category);
    const other = c.vehicle && c.vehicle !== vid ? fzVehicle(c.vehicle) : null;
    return `<button type="button" class="fz-pick-row${c.vehicle === vid ? ' active' : ''}" data-c="${escapeHtml(c.id)}">
      <span class="text-xl shrink-0">${escapeHtml(cat.icon || '📄')}</span>
      <span class="flex-1 min-w-0"><span class="block text-sm font-medium truncate">${escapeHtml(c.name || 'Vertrag')}</span><span class="block text-[11px] text-ink/45 truncate">${escapeHtml([c.provider, cat.label, other ? 'bisher: ' + fzName(other) : ''].filter(Boolean).join(' · '))}</span></span>
      <span class="shrink-0 text-lg">${c.vehicle === vid ? '✓' : ''}</span>
    </button>`;
  }).join('');
  fzOpenModal2(`
    <h3 class="font-serif text-lg mb-1 pr-6">Verträge zuordnen</h3>
    <p class="text-xs text-ink/50 mb-3">Antippen ordnet den Vertrag ${escapeHtml(fzName(v))} zu – Kosten und Kündigungsfristen erscheinen dann beim Fahrzeug und in der Bilanz.</p>
    <div class="flex flex-col gap-1.5">${rows || '<p class="text-sm text-ink/45">Noch keine Verträge in Finanzen → Verträge.</p>'}</div>
    <div class="flex items-center gap-2 mt-4">
      <button type="button" id="fzcNew" class="px-3 py-2 rounded-lg border border-ink/15 text-sm text-ink/70 hover:text-pine hover:border-pine transition">+ Neuer Vertrag</button>
      <div class="flex-1"></div>
      <button type="button" id="fzcDone" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90">Fertig</button>
    </div>`, body => {
    body.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
      const cid = b.dataset.c;
      finance.contracts = vtContracts().map(c => c.id === cid ? { ...c, vehicle: c.vehicle === vid ? '' : vid } : c);
      const on = vtContract(cid).vehicle === vid;
      b.classList.toggle('active', on);
      b.lastElementChild.textContent = on ? '✓' : '';
      persistState();
    }));
    document.getElementById('fzcDone').addEventListener('click', () => { fzCloseModal2(); fzAfterChange(); });
    document.getElementById('fzcNew').addEventListener('click', () => { fzCloseModal2(); fzNewContract(vid); });
  });
}
function fzNewContract(vid) {
  const v = fzVehicle(vid);
  if (!v) return;
  const k = fzKind(v.kind);
  openContractModal({ preset: { name: (k.bike ? 'Fahrradversicherung ' : k.id === 'escooter' ? 'Versicherung ' : 'Kfz-Versicherung ') + fzName(v), category: 'versicherung', vehicle: vid, finCat: 'versicherungen' } });
}
function fzOpenDocLink(vid) {
  const v = fzVehicle(vid);
  if (!v || typeof docAll !== 'function') return;
  if (typeof loadDocuments === 'function') loadDocuments();
  const render = () => {
    const cur = fzVehicle(vid);
    const links = new Set(Array.isArray(cur.docLinks) ? cur.docLinks : []);
    const all = docAll().slice().sort((a, b) => (a.kategorie === 'fahrzeuge' ? 0 : 1) - (b.kategorie === 'fahrzeuge' ? 0 : 1) || String(a.titel || '').localeCompare(String(b.titel || ''), 'de'));
    return all.map(x => `<button type="button" class="fz-pick-row${links.has(x.id) ? ' active' : ''}" data-d="${escapeHtml(x.id)}">
      <span class="text-xl shrink-0">${escapeHtml(docCategory(x.kategorie).icon || '📄')}</span>
      <span class="flex-1 min-w-0"><span class="block text-sm font-medium truncate">${escapeHtml(x.titel || 'Dokument')}</span><span class="block text-[11px] text-ink/45 truncate">${escapeHtml(docCategory(x.kategorie).label + (x.datum ? ' · ' + vtFmt(x.datum) : ''))}</span></span>
      <span class="shrink-0 text-lg">${links.has(x.id) ? '✓' : ''}</span>
    </button>`).join('');
  };
  fzOpenModal2(`
    <h3 class="font-serif text-lg mb-1 pr-6">Aus „Dokumente“ verknüpfen</h3>
    <p class="text-xs text-ink/50 mb-3">Dokumente bleiben unter „Dokumente“ und erscheinen zusätzlich beim Fahrzeug – die Zuordnung ist auch dort im Dokument unter „Fahrzeug“ sichtbar und änderbar. Kategorie „Auto &amp; Fahrzeuge“ steht oben.</p>
    <div id="fzDocPick" class="flex flex-col gap-1.5">${render() || '<p class="text-sm text-ink/45">Noch keine Dokumente vorhanden.</p>'}</div>
    <div class="flex items-center gap-2 mt-4"><div class="flex-1"></div><button type="button" id="fzdlDone" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90">Fertig</button></div>`, body => {
    body.querySelector('#fzDocPick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-d]');
      if (!b) return;
      const did = b.dataset.d;
      finance.vehicles = fzVehicles().map(x => {
        if (x.id !== vid) return x;
        const list = Array.isArray(x.docLinks) ? x.docLinks : [];
        return { ...x, docLinks: list.includes(did) ? list.filter(y => y !== did) : [...list, did].slice(-FZ_DOC_LINK_MAX), updated: finTodayIso() };
      });
      const on = (fzVehicle(vid).docLinks || []).includes(did);
      b.classList.toggle('active', on);
      b.lastElementChild.textContent = on ? '✓' : '';
      persistState();
    });
    document.getElementById('fzdlDone').addEventListener('click', () => { fzCloseModal2(); fzAfterChange(); });
  });
}

/* ---------- Documents ↔ vehicle ---------- */
// The link is kept on the vehicle (docLinks) - changeable offline and the same on all devices.
// "Dokumente" reads it via fzVehiclesForDoc() and writes it via fzSetDocVehicles().
function fzDocTypesFor(v) {
  const k = fzKind(v && v.kind);
  return FZ_DOC_TYPES.filter(t => (!t.plate || k.plate) && (!t.hu || k.hu));
}
function fzVehiclesForDoc(docId) {
  if (!docId || !finance) return [];
  return fzVehicles().filter(v => Array.isArray(v.docLinks) && v.docLinks.includes(docId));
}
// Assign a document to exactly these vehicles -> true if something has changed
function fzSetDocVehicles(docId, ids) {
  if (!docId || !finance) return false;
  const want = new Set((ids || []).filter(id => fzVehicle(id)));
  let changed = false;
  finance.vehicles = fzVehicles().map(v => {
    const list = Array.isArray(v.docLinks) ? v.docLinks : [];
    const has = list.includes(docId);
    if (want.has(v.id) === has) return v;
    changed = true;
    return { ...v, docLinks: has ? list.filter(x => x !== docId) : [...list, docId].slice(-FZ_DOC_LINK_MAX), updated: finTodayIso() };
  });
  return changed;
}
// Find the license plate or VIN of a vehicle in a text (e.g. from a PDF)
function fzMatchVehicleInText(text) {
  const flat = String(text || '').toUpperCase().replace(/[\s\-–.:]/g, '');
  if (!flat) return null;
  for (const v of fzVehicles()) {
    const vin = String(v.vin || '').toUpperCase().replace(/\s/g, '');
    if (vin.length >= 8 && flat.includes(vin)) return v;
  }
  for (const v of fzVehicles()) {
    const plate = fzPlateText(v.plate).replace(/[\s\-–]/g, '');
    if (plate.length >= 4 && flat.includes(plate)) return v;
  }
  return null;
}
// License plate, VIN, HSN/TSN … as lines for the note (so that the search finds them too)
function fzDocFacts(v, all = true) {
  const k = fzKind(v.kind);
  const out = [];
  if (v.plate) out.push('Kennzeichen: ' + fzPlateText(v.plate));
  const mm = [v.make, v.model].filter(Boolean).join(' ').trim();
  if (all && mm && mm !== fzName(v)) out.push('Fahrzeug: ' + mm);
  if (v.vin) out.push((k.bike ? 'Rahmennummer: ' : 'FIN: ') + v.vin);
  if (all && (v.hsn || v.tsn)) out.push('HSN/TSN: ' + [v.hsn, v.tsn].filter(Boolean).join(' / '));
  if (all && fzIsYm(v.firstReg)) out.push((k.bike ? 'Baujahr: ' : 'Erstzulassung: ') + v.firstReg.slice(5, 7) + '/' + v.firstReg.slice(0, 4));
  return out;
}
// Prefill for a document uploaded at the vehicle: category, title, person,
// issuer, purchase & statutory warranty, deadlines, reminder and vehicle data as a note.
// opts.date = date of the document (when taking over old documents)
function fzDocPreset(v, typ, opts = {}) {
  const t = FZ_DOC_TYPES.find(x => x.id === typ) || FZ_DOC_TYPES[FZ_DOC_TYPES.length - 1];
  const k = fzKind(v.kind);
  const today = finTodayIso();
  const date = vtIsIso(opts.date) ? opts.date : today;
  const name = fzShortName(v);
  const odo = fzCurrentOdo(v);
  const odoLine = odo > 0 ? 'km-Stand: ' + fzKmText(odo) : '';
  const cats = docCategories();
  const catId = cats.some(c => c.id === t.cat) ? t.cat : (cats.some(c => c.id === 'fahrzeuge') ? 'fahrzeuge' : 'sonstiges');
  const insurer = vtContracts().find(c => c.vehicle === v.id && c.category === 'versicherung' && vtStatus(c, today).state !== 'beendet') || null;
  const p = {
    typ: t.id, vehicles: [v.id], catId, titel: '', mitglied: v.holder && memberById(v.holder) ? v.holder : '',
    datum: date, aussteller: '', kaufdatum: '', betrag: 0, gewaehrleistung_bis: '', garantie: '', gueltig_bis: '',
    erinnern: 0, notiz: '', buy: false, lawFixed: false,
  };
  const lines = [];
  switch (t.id) {
    case 'fzschein':
      p.titel = 'Fahrzeugschein ' + name;
      p.aussteller = 'Zulassungsstelle';
      lines.push(...fzDocFacts(v, true));
      break;
    case 'hubericht': {
      p.titel = 'HU-Bericht ' + name + ' ' + date.slice(0, 4);
      // Next HU: if it already lies in the future, keep it - otherwise recalculate from today
      const due = v.hu && fzIsYm(v.hu.due) ? v.hu.due : '';
      const months = (v.hu && Number(v.hu.months)) || k.hu || 24;
      let next = due && fzMonthEnd(due) > vtAddMonths(date, 6, false) ? due : vtAddMonths(date, months, false).slice(0, 7);
      if (!opts.date) p.gueltig_bis = fzMonthEnd(next);
      p.erinnern = opts.date ? 0 : 30;
      lines.push(...fzDocFacts(v, false), odoLine);
      break;
    }
    case 'werkstatt':
      p.titel = 'Werkstattrechnung ' + name;
      p.buy = true;
      p.kaufdatum = date;
      p.gewaehrleistung_bis = vtAddMonths(date, 24, false);
      lines.push(...fzDocFacts(v, false), odoLine);
      break;
    case 'rechnung':
      p.titel = 'Rechnung ' + name;
      p.buy = true;
      p.kaufdatum = date;
      p.gewaehrleistung_bis = vtAddMonths(date, 24, false);
      p.erinnern = opts.date ? 0 : 30;
      lines.push('Für: ' + name);
      break;
    case 'vertrag': {
      p.titel = 'Kaufvertrag ' + name;
      p.buy = true;
      p.lawFixed = true;
      if (vtIsIso(v.purchaseDate)) { p.kaufdatum = v.purchaseDate; p.datum = opts.date ? date : v.purchaseDate; }
      if (Number(v.purchasePrice) > 0) p.betrag = Math.round(Number(v.purchasePrice) * 100) / 100;
      // New car (bought up to 6 months after first registration): 2 years of statutory warranty, otherwise usually 1 year
      const isNewCar = !fzIsYm(v.firstReg) || !vtIsIso(v.purchaseDate) || vtAddMonths(v.firstReg + '-01', 6, false) >= v.purchaseDate;
      if (p.kaufdatum) p.gewaehrleistung_bis = vtAddMonths(p.kaufdatum, isNewCar ? 24 : 12, false);
      p.erinnern = p.gewaehrleistung_bis && p.gewaehrleistung_bis > today && !opts.date ? 30 : 0;
      lines.push(...fzDocFacts(v, true));
      if (v.odoStart !== '' && v.odoStart != null && Number(v.odoStart) >= 0) lines.push('km-Stand beim Kauf: ' + fzKmText(v.odoStart));
      break;
    }
    case 'garantie':
      p.titel = 'Garantie ' + name;
      p.buy = true;
      p.lawFixed = true;
      if (vtIsIso(v.purchaseDate)) p.kaufdatum = v.purchaseDate;
      p.erinnern = opts.date ? 0 : 30;
      lines.push(...fzDocFacts(v, false));
      break;
    case 'versicherung':
      p.titel = (k.vk ? 'Versicherungskennzeichen ' : 'Versicherungsschein ') + name;
      if (insurer) p.aussteller = String(insurer.provider || '').slice(0, 200);
      if (k.vk && !opts.date) {
        // The insurance plate is always valid from March to the end of February
        const y = Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) >= 3 ? 1 : 0);
        p.gueltig_bis = vtMonthEnd(y + '-02-01');
        p.erinnern = 30;
      }
      lines.push(...fzDocFacts(v, false));
      if (insurer && insurer.contractNo) lines.push('Vertragsnummer: ' + insurer.contractNo);
      break;
    case 'steuer':
      p.titel = 'Kfz-Steuerbescheid ' + name;
      p.aussteller = 'Hauptzollamt';
      lines.push(...fzDocFacts(v, false));
      break;
    default:
      p.titel = 'Dokument ' + name;
      lines.push(...fzDocFacts(v, false));
  }
  p.notiz = lines.filter(Boolean).join('\n').slice(0, 4000);
  p.titel = p.titel.slice(0, 200);
  return p;
}
// Hand details from a saved vehicle document back to the vehicle
// (next HU from the HU report, purchase date/price from the purchase contract - only gaps or newer values)
function fzApplyDocToVehicle(vid, typ, fields) {
  const v = fzVehicle(vid);
  if (!v || !fields) return [];
  const patch = {};
  const notes = [];
  if (typ === 'hubericht' && fzKind(v.kind).hu && vtIsIso(fields.gueltig_bis)) {
    const ym = fields.gueltig_bis.slice(0, 7);
    const cur = v.hu && fzIsYm(v.hu.due) ? v.hu.due : '';
    if (!cur || ym > cur) {
      if (cur) fzCompleteTask(v, 'hu:' + cur);
      patch.hu = { ...(v.hu || {}), due: ym, months: (v.hu && v.hu.months) || fzKind(v.kind).hu || 24 };
      notes.push('nächste HU ' + fzPlakette(ym));
    }
  }
  if (typ === 'vertrag') {
    if (!vtIsIso(v.purchaseDate) && vtIsIso(fields.kaufdatum)) { patch.purchaseDate = fields.kaufdatum; notes.push('Kaufdatum'); }
    if (!(Number(v.purchasePrice) > 0) && Number(fields.betrag) > 0) { patch.purchasePrice = Math.round(Number(fields.betrag) * 100) / 100; notes.push('Kaufpreis'); }
  }
  if (!notes.length) return [];
  finance.vehicles = fzVehicles().map(x => x.id === vid ? { ...x, ...patch, updated: finTodayIso() } : x);
  return notes;
}
// "+ Hochladen" at the vehicle: prefill the document popup with all details and open the file picker right away
function fzUploadDoc(vid, typ) {
  const v = fzVehicle(vid);
  if (!v || isCurrentUserGuest()) return;
  if (fzIsArchived(v)) { finShowToast('Das Fahrzeug ist archiviert.'); return; }
  loadDocuments();
  openDocEditModal(null, { preset: fzDocPreset(v, typ || 'sonstiges') });
  docPickFiles(false); // still within the same tap, otherwise iOS blocks the file picker
}
// Move older vehicle documents (Finanzen, bezug "fahrzeug:<ID>") to "Dokumente".
// The new ID is calculated from the old one - so two devices never create two documents.
// The old document is only deleted once the new one including its file is safely on the NAS.
let fzDocMigrating = false;
let fzDocMigratedAt = 0;
async function fzMigrateLegacyDocs() {
  if (fzDocMigrating || isCurrentUserGuest() || !navigator.onLine || !finFamilyKey() || !finance) return;
  if (!finDocsLoaded || !docsLoaded || docsError) return;
  if (Date.now() - fzDocMigratedAt < 90 * 1000) return;
  const legacy = finDocs.filter(fd => /^fahrzeug:/.test(fd.bezug) && fzVehicle(fd.bezug.slice(9)) && (docIsImageName(fd.datei) || docIsPdfName(fd.datei)));
  if (!legacy.length) return;
  fzDocMigrating = true;
  fzDocMigratedAt = Date.now();
  const done = [];
  try {
    await docOutboxLoad();
    await ensureFinDocToken(true);
    let linkChanged = false;
    for (const fd of legacy) {
      const vid = fd.bezug.slice(9);
      const v = fzVehicle(vid);
      if (!v) continue;
      const docId = fzTaskId('fzdoc|' + finFamilyKey() + '|' + fd.id);
      if (!docById(docId)) {
        let blob = null;
        try {
          const res = await fetch(finDocUrl(fd));
          if (res.ok) blob = await res.blob();
        } catch (e) { blob = null; }
        if (!blob || !blob.size || blob.size > DOC_MAX_BYTES) continue;
        const typ = FZ_DOC_TYPES.some(t => t.id === fd.typ) ? fd.typ : 'sonstiges';
        const p = fzDocPreset(v, typ, { date: vtIsIso(fd.datum) ? fd.datum : String(fd.created || '').slice(0, 10) });
        const fields = {
          titel: String(fd.name || '').trim().slice(0, 200) || p.titel,
          kategorie: p.catId, mitglied: p.mitglied, datum: p.datum, aussteller: p.aussteller,
          betrag: p.betrag || 0, kaufdatum: p.kaufdatum, gewaehrleistung_bis: p.gewaehrleistung_bis,
          garantie_bis: '', gueltig_bis: p.gueltig_bis, erinnern: 0, notiz: p.notiz,
        };
        const name = finSafeFileName(docFileLabel(fd.datei) || ('dokument' + (docIsPdfName(fd.datei) ? '.pdf' : '.jpg')));
        await docEnqueueSave(docId, true, fields, [{ id: 'f' + newRecordId(), blob, name, size: blob.size || 0, type: blob.type || '' }], [], []);
      }
      const ids = fzVehiclesForDoc(docId).map(x => x.id);
      if (!ids.includes(vid) && fzSetDocVehicles(docId, [...ids, vid])) linkChanged = true;
      done.push({ fd, docId });
    }
    if (linkChanged) fzAfterChange();
    await docFlush();
    let moved = 0;
    for (const { fd, docId } of done) {
      const d = docServer.find(x => x.id === docId);
      if (!d || !(d.dateien || []).length || docOutboxOp(docId)) continue;
      try { await finDeleteDoc(fd.id); moved++; } catch (e) { /* next time */ }
    }
    if (moved) {
      finDocsChanged();
      finShowToast(moved === 1 ? '1 Fahrzeugdokument nach „Dokumente“ übernommen.' : moved + ' Fahrzeugdokumente nach „Dokumente“ übernommen.');
    }
  } catch (err) {
    console.warn('Fahrzeuge: Übernahme der Dokumente fehlgeschlagen', err);
  } finally {
    fzDocMigrating = false;
  }
}
// "In Dokumente ›": Documents page with exactly the documents of this vehicle
function fzShowDocsOf(vid) {
  const v = fzVehicle(vid);
  if (!v) return;
  docFilterCategory = '';
  docFilterMember = '';
  docOnlyDue = false;
  docSearch = fzName(v);
  setView('dokumente');
}

/* ---------- Notice "Erledigt" (done) ---------- */
function fzDueDone(vid, key) {
  const v = fzVehicle(vid);
  if (!v) return;
  const it = fzDueItems(v, finTodayIso(), true).find(x => x.key === key);
  if (!it) return;
  if (it.act === 'hu') return fzOpenLogModal({ vehicleId: vid, type: 'hu', fromDue: { key, type: 'hu' } });
  if (it.act === 'service') return fzOpenLogModal({ vehicleId: vid, type: 'wartung', fromDue: { key, type: 'service' } });
  if (it.act === 'reifen') return fzOpenLogModal({ vehicleId: vid, type: 'reifen', fromDue: { key, type: 'reifen', need: it.need } });
  if (it.act === 'vk') return fzOpenLogModal({ vehicleId: vid, type: 'sonstiges', fromDue: { key, type: 'vk' } });
  if (it.act === 'frist') {
    if (confirm(`„${it.title}“ erledigt? Die Frist wird entfernt – für eine neue Frist einfach wieder „+ Frist“ tippen.`)) {
      fzCompleteTask(v, key);
      finance.vehicles = fzVehicles().map(x => x.id === vid ? { ...x, deadlines: (x.deadlines || []).filter(d => d.id !== it.id) } : x);
      fzAfterChange();
    }
  }
}
function fzDueOpen(vid, key) {
  const v = fzVehicle(vid);
  if (!v) return;
  const it = fzDueItems(v, finTodayIso(), true).find(x => x.key === key);
  if (!it) return;
  if (it.act === 'contract') { openContractDetail(it.id); return; }
  if (it.act === 'assign') { fzOpenContractAssign(vid); return; }
  if (it.act === 'edit') { fzOpenVehicleModal(vid); return; }
  if (it.act === 'frist') { fzOpenDeadline(vid, it.id); return; }
  if (fzDetailId !== vid || currentView !== 'fahrzeuge') { fzOpenVehicle(vid); return; }
  fzDueDone(vid, key);
}

/* ---------- Events ---------- */
function fzHandleAct(act, ds) {
  switch (act) {
    case 'open': fzOpenVehicle(ds.v); break;
    case 'back': fzBackToList(); break;
    case 'new-kind': fzOpenVehicleModal(null, ds.kind); break;
    case 'edit': fzOpenVehicleModal(ds.v); break;
    case 'log-new': fzOpenLogModal({ vehicleId: ds.v, type: ds.type || '' }); break;
    case 'log-edit': fzOpenLogModal({ logId: ds.id }); break;
    case 'log-filter': fzLogFilter = ds.f; fzLogLimit = 25; renderVehicles(); break;
    case 'log-more': fzLogLimit += 50; renderVehicles(); break;
    case 'due-done': fzDueDone(ds.v, ds.key); break;
    case 'due-open': fzDueOpen(ds.v, ds.key); break;
    case 'deadline-new': fzOpenDeadline(ds.v); break;
    case 'deadline-edit': fzOpenDeadline(ds.v, ds.id); break;
    case 'contract': openContractDetail(ds.id); break;
    case 'contract-assign': fzOpenContractAssign(ds.v); break;
    case 'contract-new': fzNewContract(ds.v); break;
    case 'archive': fzOpenArchive(ds.v); break;
    case 'unarchive': fzUnarchive(ds.v); break;
    case 'doc-add': {
      const sel = document.getElementById('fzDocTypeSelect');
      fzUploadDoc(ds.v, (sel && sel.value) || 'sonstiges');
      break;
    }
    case 'doc-link': fzOpenDocLink(ds.v); break;
    case 'doc-open': openDocDetail(ds.id); break;
    case 'doc-all': fzShowDocsOf(ds.v); break;
    case 'copy': vtCopyText(ds.text, 'Kopiert.'); break;
    case 'to-balance': fzBalVehicle = ds.v; fzBalPeriod = 'jahr'; fzBalYear = new Date().getFullYear(); fzTab = 'bilanz'; renderVehicles(); document.getElementById('fzScroll').scrollTop = 0; break;
    case 'bal-period': fzBalPeriod = ds.p; renderVehicles(); break;
    case 'bal-year': fzBalYear += Number(ds.d) || 0; renderVehicles(); break;
    case 'bal-pick': fzBalVehicle = ds.v; renderVehicles(); break;
    default: break;
  }
}
(function initVehiclesUi() {
  const pane = document.getElementById('fzPane');
  pane.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-fzact]');
    if (!el || !pane.contains(el)) return;
    ev.stopPropagation();
    fzHandleAct(el.dataset.fzact, el.dataset);
  });
  pane.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const el = ev.target.closest('[role="button"][data-fzact]');
    if (!el) return;
    ev.preventDefault();
    fzHandleAct(el.dataset.fzact, el.dataset);
  });
  pane.addEventListener('input', (ev) => { if (ev.target.classList.contains('fz-calc')) fzCalc(); });
  pane.addEventListener('change', (ev) => { if (ev.target.classList.contains('fz-calc')) fzCalc(); });
  document.querySelectorAll('.fz-tab-btn').forEach(b => b.addEventListener('click', () => {
    if (fzTab === b.dataset.fztab && fzTab === 'liste' && fzDetailId) { fzBackToList(); return; }
    fzTab = b.dataset.fztab;
    renderVehicles();
    document.getElementById('fzScroll').scrollTop = 0;
  }));
  document.getElementById('fzHeaderBtn').addEventListener('click', () => {
    if (fzTab === 'liste' && fzDetailId && fzVehicle(fzDetailId)) {
      if (fzIsArchived(fzVehicle(fzDetailId))) { finShowToast('Das Fahrzeug ist archiviert.'); return; }
      fzOpenLogModal({ vehicleId: fzDetailId });
    } else fzOpenVehicleModal(null);
  });
  document.getElementById('fzModalClose').addEventListener('click', () => attemptCloseModal('fzModal', fzCloseModal));
  document.getElementById('fzModal2Close').addEventListener('click', fzCloseModal2);
  wireModalOutsideClick('fzModal', fzCloseModal);
  wireModalOutsideClick('fzModal2', fzCloseModal2);
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('fahrzeuge');
