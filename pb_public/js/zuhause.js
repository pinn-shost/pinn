/* pinn. – js/zuhause.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded first of the files in js/, right before js/dokumente.js (js/ausblick.js stays last and
   starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.49.0, only the comments were translated):
   - House / home (menu "Haus", hs…) – homes for rent, owned and let, with the tabs overview, defects,
     costs & renovation, meters & forecast, maintenance plan and garden & plants
   - Fixed costs, loan, invoices, defect notice to the landlord, meter readings (by hand or from a photo),
     assigned contracts and documents, animated scene in the header
   - Popups for home, invoice, defect, project, meter, reading and maintenance, and the wiring of the buttons
   index.html only calls these functions later (when the user acts or from bootApp), never while it
   is still loading – that is why this file may come after the inline script.
   Two statements run while this file loads (the click listener of the tab buttons and the toggle
   listener of the defects list); they only register listeners on the document. */

/* ==========================================================
   House (menu "Haus", since 1.28) – all-round care-free for tenants and owners
   ----------------------------------------------------------
   Data lives in the finance data of the shown cash box (like "Fahrzeuge" = vehicles) – can be created and
   changed offline, merged entry by entry between the devices, locked for guests and the child lock:
   - finance.homes: { id, mode: 'miete'|'eigentum', name, type, address, moveIn, moveOut, area, rooms,
       persons, built, heating, color,
       landlord: { name, phone, email, address }  (rent: landlord, ownership: property management),
       rent: { deposit, depositPaid, depositWhere, depositBack, depositBackAmount, notice, kind, lastIncrease },
       own: { price, date, landTax, notary, broker, loan: { bank, amount, rate, repay, monthly, start, fixedUntil } },
       fix: { <key from HS_FIX>: { amount, recId } }, fixStart, docLinks: [document IDs], note, created, updated }
     Fixed costs (rent, utilities, house fee, loan installment, property tax …) are ordinary recurring
     bookings (finance.recurring, field home = ID, link 'haus:<ID>'). Contracts (electricity, gas, internet,
     insurance) get the field home.
   - finance.homeLog: invoices & costs { id, home, type, date, desc, amount (− = credit), labor, booked,
       paidBy, project, room, warranty, note, docLinks, created } – booked entries are also an
       expense (same ID, category "Haushalt & Wohnen" (household & housing), link 'haus:<ID>').
   - finance.homeDefects: defects { id, home, title, room, date, severity, status: 'offen'|'gemeldet'|'behoben',
       reported, deadline, fixed, moveIn (present at move-in), note, docLinks, created }
   - finance.homeProjects: renovation plan { id, home, title, area, status, year, budget,
       funding, prio, note, created } – actual costs = invoices with project = ID.
   - finance.homeMeters / finance.homeReadings: meters { id, home, type, name, number, price, base, factor,
       advance, billStart ('MM-TT'), active } and readings { id, meter, date, value, reset, source: 'hand'|'ki', note }.
     Forecast: consumption between the readings, weighted over the year (heating in winter, PV in
     summer), extrapolated to the billing period and compared with the advance payment.
   - Documents live under "Dokumente" (documents) and are linked via docLinks to the home, to invoices, defects or
     projects (uploading at the house pre-fills the document popup).
   - The maintenance plan (smoke detectors, bleeding the heating, filters, gutter …) is stored in the family data
     (houseMaintenance, for all members) – the server creates the tasks as household tasks
     (pb_hooks/pinn-aufgaben.js): they stay open until they are done, the next due date counts from
     the day of completion. Visible under House → Maintenance and on the household page.
   ========================================================== */
const HS_MODES = { miete: { get label() { return tk('home.rent'); }, icon: '🔑' }, eigentum: { get label() { return tk('home.owned'); }, icon: '🏡' }, vermietet: { get label() { return tk('home.letOut'); }, icon: '🤝' } };
const HS_TYPES = [tkPair('wohnung', 'home.type.wohnung'), tkPair('haus', 'home.type.haus'), tkPair('reihenhaus', 'home.type.reihenhaus'), tkPair('mfh', 'home.type.mfh'), tkPair('zimmer', 'home.type.zimmer'), tkPair('garage', 'home.type.garage')];
const HS_TYPE_ICONS = { wohnung: '🏢', haus: '🏡', reihenhaus: '🏘️', mfh: '🏬', zimmer: '🛏️', garage: '🅿️' };
const HS_HEATING = [['', '–'], tkPair('gas', 'home.heating.gas'), tkPair('oel', 'home.heating.oel'), tkPair('fernwaerme', 'home.heating.fernwaerme'), tkPair('waermepumpe', 'home.heating.waermepumpe'), tkPair('strom', 'home.heating.strom'), tkPair('pellets', 'home.heating.pellets'), tkPair('sonstige', 'home.heating.sonstige')];
const HS_COLORS = ['#2F4B41', '#3B7EA1', '#5E8C31', '#B5543C', '#8E6BBF', '#D9822B', '#546E7A', '#C0567A'];
const HS_FIN_CATEGORY = 'haushalt';
const HS_FIX = [
  { key: 'rent', get label() { return tk('home.fix.rent'); }, mode: 'miete', interval: 'monthly', group: 'wohnkosten' },
  { key: 'nk', get label() { return tk('home.fix.nk'); }, mode: 'miete', interval: 'monthly', group: 'wohnkosten' },
  { key: 'heat', get label() { return tk('home.fix.heat'); }, mode: 'miete', interval: 'monthly', group: 'wohnkosten' },
  { key: 'stellplatz', get label() { return tk('home.fix.stellplatz'); }, mode: 'miete', interval: 'monthly', group: 'wohnkosten' },
  { key: 'loan', get label() { return tk('home.fix.loan'); }, mode: 'eigentum', interval: 'monthly', group: 'kredit' },
  { key: 'hausgeld', get label() { return tk('home.fix.hausgeld'); }, mode: 'eigentum', interval: 'monthly', group: 'wohnkosten' },
  { key: 'grundsteuer', get label() { return tk('home.fix.grundsteuer'); }, mode: 'eigentum', interval: 'quarterly', group: 'abgaben' },
  { key: 'abgaben', get label() { return tk('home.fix.abgaben'); }, mode: 'eigentum', interval: 'quarterly', group: 'abgaben' },
  { key: 'gebaeude', get label() { return tk('home.fix.gebaeude'); }, mode: 'eigentum', interval: 'yearly', group: 'abgaben' },
  // Letting: income (booked as recurring income); the owner costs above apply here too
  { key: 'let_rent', get label() { return tk('home.fix.letRent'); }, mode: 'vermietet', interval: 'monthly', group: 'wohnkosten', income: true },
  { key: 'let_nk', get label() { return tk('home.fix.letNk'); }, mode: 'vermietet', interval: 'monthly', group: 'wohnkosten', income: true },
  { key: 'let_park', get label() { return tk('home.parkingGarageIncome'); }, mode: 'vermietet', interval: 'monthly', group: 'wohnkosten', income: true },
];
// Income items are booked under the name of the matching cost item ("Kaltmiete" instead of "Kaltmiete (Einnahme)")
const HS_FIX_TITLE = { let_rent: 'rent', let_nk: 'nk', let_park: 'stellplatz' };
const HS_GROUPS = [
  { id: 'wohnkosten', get label() { return tk('home.group.wohnkosten'); }, icon: '🏠', color: '#3B7EA1' },
  { id: 'kredit', get label() { return tk('home.group.kredit'); }, icon: '🏦', color: '#B5543C' },
  { id: 'abgaben', get label() { return tk('home.group.abgaben'); }, icon: '🏛️', color: '#8E6BBF' },
  { id: 'energie', get label() { return tk('home.group.energie'); }, icon: '⚡', color: '#D9822B' },
  { id: 'renovierung', get label() { return tk('home.group.renovierung'); }, icon: '🧱', color: '#5E8C31' },
  { id: 'instandhaltung', get label() { return tk('home.group.instandhaltung'); }, icon: '🔧', color: '#546E7A' },
  { id: 'einrichtung', get label() { return tk('home.group.einrichtung'); }, icon: '🛋️', color: '#C0567A' },
  { id: 'sonstiges', get label() { return tk('home.group.sonstiges'); }, icon: '📦', color: '#9A9A9A' },
];
// warranty = statutory warranty in months (suggestion), labor = ask for the labour share, settle = additional payment/credit
const HS_LOG_TYPES = [
  { id: 'moebel', get label() { return tk('home.logType.moebel'); }, icon: '🛋️', group: 'einrichtung', warranty: 24 },
  { id: 'geraet', get label() { return tk('home.logType.geraet'); }, icon: '🔌', group: 'einrichtung', warranty: 24 },
  { id: 'boden', get label() { return tk('home.logType.boden'); }, icon: '🪵', group: 'renovierung', warranty: 24, labor: true },
  { id: 'material', get label() { return tk('home.logType.material'); }, icon: '🧱', group: 'renovierung' },
  { id: 'handwerker', get label() { return tk('home.logType.handwerker'); }, icon: '👷', group: 'renovierung', warranty: 24, labor: true },
  { id: 'reparatur', get label() { return tk('home.logType.reparatur'); }, icon: '🔧', group: 'instandhaltung', labor: true },
  { id: 'garten', get label() { return tk('home.logType.garten'); }, icon: '🌿', group: 'einrichtung', labor: true },
  { id: 'nebenkosten', get label() { return tk('home.logType.nebenkosten'); }, icon: '🧾', group: 'wohnkosten', settle: true },
  { id: 'energie', get label() { return tk('home.logType.energie'); }, icon: '⚡', group: 'energie', settle: true },
  { id: 'steuer', get label() { return tk('home.logType.steuer'); }, icon: '🏛️', group: 'abgaben' },
  { id: 'versicherung', get label() { return tk('home.logType.versicherung'); }, icon: '🛡️', group: 'abgaben' },
  { id: 'sonstiges', get label() { return tk('home.logType.sonstiges'); }, icon: '📦', group: 'sonstiges' },
];
const HS_DEFECT_STATUS = [tkPair('offen', 'home.defect.offen'), tkPair('gemeldet', 'home.defect.gemeldet'), tkPair('behoben', 'home.defect.behoben')];
const HS_SEVERITY = [tkPair('klein', 'home.severity.klein'), tkPair('mittel', 'home.severity.mittel'), tkPair('gross', 'home.severity.gross')];
const HS_PROJECT_STATUS = [tkPair('idee', 'home.projStatus.idee'), tkPair('geplant', 'home.projStatus.geplant'), tkPair('laufend', 'home.projStatus.laufend'), tkPair('fertig', 'home.projStatus.fertig')];
const HS_PROJECT_AREAS = [
  tkPair('dach', 'home.area.dach', '🏠 '), tkPair('fassade', 'home.area.fassade', '🧱 '), tkPair('fenster', 'home.area.fenster', '🪟 '), tkPair('heizung', 'home.area.heizung', '♨️ '),
  tkPair('solar', 'home.area.solar', '☀️ '), tkPair('bad', 'home.area.bad', '🛁 '), tkPair('kueche', 'home.area.kueche', '🍳 '), tkPair('elektrik', 'home.area.elektrik', '🔌 '),
  tkPair('boden', 'home.area.boden', '🪵 '), tkPair('waende', 'home.area.waende', '🎨 '), tkPair('keller', 'home.area.keller', '🏚️ '), tkPair('garten', 'home.area.garten', '🌿 '), tkPair('sonstiges', 'home.area.sonstiges', '📦 '),
];
// Monthly weights for the forecast (Jan … Dec, sum 1)
const HS_SEASON = {
  heat: [0.17, 0.15, 0.13, 0.08, 0.04, 0.02, 0.015, 0.015, 0.035, 0.08, 0.12, 0.15],
  sun: [0.03, 0.05, 0.08, 0.11, 0.13, 0.13, 0.13, 0.12, 0.09, 0.06, 0.04, 0.03],
  power: [0.095, 0.085, 0.085, 0.08, 0.075, 0.07, 0.07, 0.07, 0.075, 0.085, 0.09, 0.10],
  flat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
};
// price = suggestion per billing unit (gas: per kWh), base = base price per month
const HS_METER_TYPES = [
  { id: 'strom', get label() { return tk('home.meter.strom'); }, icon: '⚡', unit: 'kWh', price: 0.35, base: 12, season: 'power', color: '#D9822B' },
  { id: 'gas', get label() { return tk('home.meter.gas'); }, icon: '🔥', unit: 'm³', billUnit: 'kWh', factor: 10.3, price: 0.12, base: 15, season: 'heat', color: '#3B7EA1' },
  { id: 'wasser', get label() { return tk('home.meter.wasser'); }, icon: '💧', unit: 'm³', price: 4.5, base: 8, season: 'flat', color: '#2A9D8F' },
  { id: 'warmwasser', get label() { return tk('home.meter.warmwasser'); }, icon: '🚿', unit: 'm³', price: 10, base: 0, season: 'flat', color: '#C0567A' },
  { id: 'waerme', get label() { return tk('home.meter.waerme'); }, icon: '♨️', unit: 'kWh', price: 0.14, base: 25, season: 'heat', color: '#B5543C' },
  { id: 'heizstrom', get label() { return tk('home.meter.heizstrom'); }, icon: '🌡️', unit: 'kWh', price: 0.28, base: 10, season: 'heat', color: '#8E6BBF' },
  { id: 'pv', get label() { return tk('home.meter.pv'); }, icon: '☀️', unit: 'kWh', price: 0.08, base: 0, season: 'sun', color: '#D4A017', income: true },
];
// Document types at the house: cat = category under "Dokumente" (documents)
const HS_DOC_TYPES = [
  { id: 'mietvertrag', get label() { return tk('home.docType.mietvertrag'); }, icon: '📄', cat: 'wohnen', mode: 'miete' },
  { id: 'kaufvertrag', get label() { return tk('home.docType.kaufvertrag'); }, icon: '📄', cat: 'wohnen', mode: 'eigentum' },
  { id: 'uebergabe', get label() { return tk('home.docType.uebergabe'); }, icon: '📝', cat: 'wohnen' },
  { id: 'nebenkosten', get label() { return tk('home.docType.nebenkosten'); }, icon: '🧾', cat: 'wohnen' },
  { id: 'energie', get label() { return tk('home.docType.energie'); }, icon: '⚡', cat: 'wohnen' },
  { id: 'grundbuch', get label() { return tk('home.docType.grundbuch'); }, icon: '📜', cat: 'wohnen', mode: 'eigentum' },
  { id: 'kredit', get label() { return tk('home.docType.kredit'); }, icon: '🏦', cat: 'bank', mode: 'eigentum' },
  { id: 'grundsteuer', get label() { return tk('home.docType.grundsteuer'); }, icon: '🏛️', cat: 'steuern', mode: 'eigentum' },
  { id: 'versicherung', get label() { return tk('home.docType.versicherung'); }, icon: '🛡️', cat: 'versicherungen' },
  { id: 'energieausweis', get label() { return tk('home.docType.energieausweis'); }, icon: '🌡️', cat: 'wohnen' },
  { id: 'grundriss', get label() { return tk('home.docType.grundriss'); }, icon: '📐', cat: 'wohnen' },
  { id: 'rechnung', get label() { return tk('home.docType.rechnung'); }, icon: '🧾', cat: 'kaufbelege' },
  { id: 'foto', get label() { return tk('home.docType.foto'); }, icon: '📷', cat: 'wohnen' },
  { id: 'sonstiges', get label() { return tk('home.docType.sonstiges'); }, icon: '📎', cat: 'wohnen' },
];
// Maintenance plan: templates (months = interval, month = suggested month of the first due date)
const HS_MAINT_TEMPLATES = [
  { tpl: 'rauchmelder', icon: '🚨', get title() { return tk('home.maint.rauchmelder'); }, months: 12, month: 0 },
  { tpl: 'entlueften', icon: '♨️', get title() { return tk('home.maint.entlueften'); }, months: 12, month: 10 },
  { tpl: 'heizwartung', icon: '🔧', get title() { return tk('home.maint.heizwartung'); }, months: 12, month: 8, own: true },
  { tpl: 'dachrinne', icon: '🍂', get title() { return tk('home.maint.dachrinne'); }, months: 12, month: 11, own: true },
  { tpl: 'dunstabzug', icon: '🍳', get title() { return tk('home.maint.dunstabzug'); }, months: 2, month: 0 },
  { tpl: 'lueftung', icon: '🌬️', get title() { return tk('home.maint.lueftung'); }, months: 6, month: 0 },
  { tpl: 'wasserfilter', icon: '💧', get title() { return tk('home.maint.wasserfilter'); }, months: 6, month: 0 },
  { tpl: 'abfluss', icon: '🚿', get title() { return tk('home.maint.abfluss'); }, months: 3, month: 0 },
  { tpl: 'waschmaschine', icon: '🧺', get title() { return tk('home.maint.waschmaschine'); }, months: 2, month: 0 },
  { tpl: 'kuehlschrank', icon: '❄️', get title() { return tk('home.maint.kuehlschrank'); }, months: 6, month: 0 },
  { tpl: 'fi', icon: '⚡', get title() { return tk('home.maint.fi'); }, months: 6, month: 0 },
  { tpl: 'aussenwasser', icon: '🚰', get title() { return tk('home.maint.aussenwasser'); }, months: 12, month: 10, own: true },
  { tpl: 'fugen', icon: '🛁', get title() { return tk('home.maint.fugen'); }, months: 12, month: 0 },
  { tpl: 'fenster', icon: '🪟', get title() { return tk('home.maint.fenster'); }, months: 12, month: 4 },
  { tpl: 'feuerloescher', icon: '🧯', get title() { return tk('home.maint.feuerloescher'); }, months: 24, month: 0 },
  { tpl: 'zaehler', icon: '📟', get title() { return tk('home.maint.zaehler'); }, months: 1, month: 0 },
  // Garden year (building block "Garten & Pflanzen" = garden & plants) – run like the maintenance plan as household tasks
  { tpl: 'g_obstbaum', icon: '✂️', get title() { return tk('home.maint.gObstbaum'); }, months: 12, month: 2, garden: true },
  { tpl: 'g_beete', icon: '🌱', get title() { return tk('home.maint.gBeete'); }, months: 12, month: 3, garden: true },
  { tpl: 'g_vertikutieren', icon: '🟩', get title() { return tk('home.maint.gVertikutieren'); }, months: 12, month: 4, garden: true },
  { tpl: 'g_rasenduenger', icon: '🌾', get title() { return tk('home.maint.gRasenduenger'); }, months: 6, month: 4, garden: true },
  { tpl: 'g_teich', icon: '🐸', get title() { return tk('home.maint.gTeich'); }, months: 12, month: 4, garden: true },
  { tpl: 'g_balkon', icon: '🌺', get title() { return tk('home.maint.gBalkon'); }, months: 12, month: 5, garden: true },
  { tpl: 'g_hecke', icon: '🌳', get title() { return tk('home.maint.gHecke'); }, months: 12, month: 6, garden: true },
  { tpl: 'g_kuebel', icon: '🪴', get title() { return tk('home.maint.gKuebel'); }, months: 12, month: 10, garden: true },
  { tpl: 'g_laub', icon: '🍂', get title() { return tk('home.maint.gLaub'); }, months: 12, month: 10, garden: true },
  { tpl: 'g_moebel', icon: '🪑', get title() { return tk('home.maint.gMoebel'); }, months: 12, month: 10, garden: true },
  { tpl: 'g_maeher', icon: '🔧', get title() { return tk('home.maint.gMaeher'); }, months: 12, month: 11, garden: true },
  { tpl: 'g_regentonne', icon: '💧', get title() { return tk('home.maint.gRegentonne'); }, months: 12, month: 11, garden: true },
];
// Building blocks per home: what belongs to it is determined by the tabs (overview is always there)
const HS_MODULES = [
  { id: 'maengel', icon: '🛠️', get label() { return tk('home.module.maengel'); }, tab: true },
  { id: 'kosten', icon: '🧾', get label() { return tk('home.module.kosten'); }, tab: true },
  { id: 'zaehler', icon: '📟', get label() { return tk('home.module.zaehler'); }, tab: true },
  { id: 'wartung', icon: '🔧', get label() { return tk('home.module.wartung'); }, tab: true },
  { id: 'garten', icon: '🌿', get label() { return tk('home.module.garten'); }, tab: true, get tabLabel() { return tk('home.module.gartenTabLabel'); } },
  { id: 'schluessel', icon: '🗝️', get label() { return tk('home.module.schluessel'); }, tab: false },
];
const HS_PLACES = [tkPair('innen', 'home.place.innen', '🏠 '), tkPair('balkon', 'home.place.balkon', '🌇 '), tkPair('garten', 'home.place.garten', '🌳 ')];
// Plant templates: every = water every x days, fertEvery = fertilise every x days (March–September), months = season
const HS_PLANT_TPL = [
  { id: 'gruen', icon: '🪴', get name() { return tk('home.plant.gruen'); }, place: 'innen', every: 7, fertEvery: 14 },
  { id: 'orchidee', icon: '🌸', get name() { return tk('home.plant.orchidee'); }, place: 'innen', every: 10, fertEvery: 21 },
  { id: 'kaktus', icon: '🌵', get name() { return tk('home.plant.kaktus'); }, place: 'innen', every: 21, fertEvery: 42 },
  { id: 'kraeuter', icon: '🌿', get name() { return tk('home.plant.kraeuter'); }, place: 'balkon', every: 2, fertEvery: 14 },
  { id: 'balkon', icon: '🌺', get name() { return tk('home.plant.balkon'); }, place: 'balkon', every: 2, fertEvery: 7, months: [4, 10] },
  { id: 'kuebel', icon: '🍋', get name() { return tk('home.plant.kuebel'); }, place: 'balkon', every: 3, fertEvery: 14, months: [4, 10] },
  { id: 'tomate', icon: '🍅', get name() { return tk('home.plant.tomate'); }, place: 'garten', every: 2, fertEvery: 7, months: [5, 9], rain: true },
  { id: 'beet', icon: '🥕', get name() { return tk('home.plant.beet'); }, place: 'garten', every: 2, months: [4, 9], rain: true },
  { id: 'jung', icon: '🌳', get name() { return tk('home.plant.jung'); }, place: 'garten', every: 7, months: [4, 9], rain: true },
  { id: 'rasen', icon: '💦', get name() { return tk('home.plant.rasen'); }, place: 'garten', every: 4, months: [5, 9], rain: true },
  { id: 'maehen', icon: '✂️', get name() { return tk('home.plant.maehen'); }, place: 'garten', every: 7, months: [4, 10], act: 'mow' },
];
// Garden calendar (guide values for Central Europe): s = sow, p = plant, e = harvest
const HS_GARDEN_MONTHS = {
  1: { s: ['home.gc.startPeppersChilliesIndoors'], p: [], e: ['home.gc.kale', 'home.gc.brusselsSprouts', 'home.gc.lambsLettuce'] },
  2: { s: ['home.gc.startTomatoesIndoors', 'home.gc.radishesUnderFleece'], p: ['home.gc.fruitTrees'], e: ['home.gc.lambsLettuce', 'home.gc.leeks'] },
  3: { s: ['home.gc.carrots', 'home.gc.radishes', 'home.gc.spinach', 'home.gc.peas'], p: ['home.gc.onionsGarlic', 'home.gc.strawberries'], e: ['home.gc.lambsLettuce', 'home.gc.wildGarlic'] },
  4: { s: ['home.gc.lettuce', 'home.gc.chard', 'home.gc.herbs', 'home.gc.lawn'], p: ['home.gc.potatoes', 'home.gc.kohlrabi', 'home.gc.berryBushes'], e: ['home.gc.radishes', 'home.gc.spinach', 'home.gc.rhubarb'] },
  5: { s: ['home.gc.beans', 'home.gc.courgettes', 'home.gc.cucumbers'], p: ['home.gc.tomatoesPeppers', 'home.gc.balconyFlowers'], e: ['home.gc.asparagus', 'home.gc.lettuce', 'home.gc.rhubarb'] },
  6: { s: ['home.gc.carrots', 'home.gc.fennel', 'home.gc.courgettes'], p: ['home.gc.cabbage', 'home.gc.leeks'], e: ['home.gc.strawberries', 'home.gc.cherries', 'home.gc.peas'] },
  7: { s: ['home.gc.lambsLettuce', 'home.gc.spinach', 'home.gc.radishes'], p: ['home.gc.kale', 'home.gc.endive'], e: ['home.gc.tomatoes', 'home.gc.courgettes', 'home.gc.cucumbers', 'home.gc.currants'] },
  8: { s: ['home.gc.lambsLettuce', 'home.gc.rocket', 'home.gc.winterSpinach'], p: ['home.gc.strawberries'], e: ['home.gc.tomatoes', 'home.gc.beans', 'home.gc.plums'] },
  9: { s: ['home.gc.lambsLettuce', 'home.gc.greenManure'], p: ['home.gc.flowerBulbs', 'home.gc.garlic', 'home.gc.perennials'], e: ['home.gc.apples', 'home.gc.pears', 'home.gc.pumpkin', 'home.gc.potatoes'] },
  10: { s: ['home.gc.lawn'], p: ['home.gc.tulipsDaffodils', 'home.gc.fruitTrees', 'home.gc.hedges'], e: ['home.gc.pumpkin', 'home.gc.apples', 'home.gc.carrots'] },
  11: { s: [], p: ['home.gc.fruitTrees', 'home.gc.roses'], e: ['home.gc.kale', 'home.gc.brusselsSprouts', 'home.gc.lambsLettuce'] },
  12: { s: ['home.gc.cressIndoors'], p: [], e: ['home.gc.kale', 'home.gc.lambsLettuce', 'home.gc.leeks'] },
};
const HS_DOC_LINK_MAX = 300;

let hsTab = 'uebersicht';      // 'uebersicht' | 'maengel' | 'kosten' | 'zaehler' | 'wartung' | 'garten'
let hsHomeId = '';
let hsYear = new Date().getFullYear();
let hsLogFilter = 'alle';
let hsLogLimit = 25;
let hsDefectShowDone = false;
let hsMeterOpen = '';          // expanded meter (all readings)
let hsModalState = null;

/* ---------- Basics ---------- */
function hsArr(k) { return (finance && Array.isArray(finance[k])) ? finance[k] : []; }
function hsHomes() { return hsArr('homes'); }
function hsHomeById(id) { return id ? (hsHomes().find(h => h.id === id) || null) : null; }
function hsIsArchived(h) { return !!(h && vtIsIso(h.moveOut) && h.moveOut <= finTodayIso()); }
function hsActiveHomes() { return hsHomes().filter(h => !hsIsArchived(h)); }
function hsCurrent() {
  const h = hsHomeById(hsHomeId);
  if (h) return h;
  const first = hsActiveHomes()[0] || hsHomes()[0] || null;
  hsHomeId = first ? first.id : '';
  return first;
}
function hsMode(h) { return h && (h.mode === 'eigentum' || h.mode === 'vermietet') ? h.mode : 'miete'; }
// Ownership (lived in or let): purchase, loan, property tax …
function hsOwn(h) { return hsMode(h) !== 'miete'; }
function hsLet(h) { return hsMode(h) === 'vermietet'; }
function hsFixMatch(def, mode) { return def.mode === mode || (def.mode === 'eigentum' && mode === 'vermietet'); }
function hsHeroIcon(h) { const m = hsMode(h); if (m === 'eigentum') return HS_TYPE_ICONS[h && h.type] || '🏡'; return HS_MODES[m].icon; }
function hsDocTypesFor(h) { const m = hsMode(h); return HS_DOC_TYPES.filter(t => !t.mode || t.mode === m || m === 'vermietet'); }
function hsName(h) { return (h && String(h.name || '').trim()) || (hsOwn(h) ? tk('home.ourHome') : tk('home.ourFlat')); }
function hsColor(h) { return /^#[0-9a-fA-F]{6}$/.test((h && h.color) || '') ? h.color : '#2F4B41'; }
function hsLogs(hid) { return hsArr('homeLog').filter(l => !hid || l.home === hid); }
function hsLogById(id) { return hsArr('homeLog').find(l => l.id === id) || null; }
function hsLogType(id) { return HS_LOG_TYPES.find(t => t.id === id) || HS_LOG_TYPES[HS_LOG_TYPES.length - 1]; }
function hsGroup(id) { return HS_GROUPS.find(g => g.id === id) || HS_GROUPS[HS_GROUPS.length - 1]; }
function hsDefects(hid) { return hsArr('homeDefects').filter(d => !hid || d.home === hid); }
function hsDefectById(id) { return hsArr('homeDefects').find(d => d.id === id) || null; }
function hsProjects(hid) { return hsArr('homeProjects').filter(p => !hid || p.home === hid); }
function hsProjectById(id) { return hsArr('homeProjects').find(p => p.id === id) || null; }
function hsMeters(hid) { return hsArr('homeMeters').filter(m => !hid || m.home === hid); }
function hsMeterById(id) { return hsArr('homeMeters').find(m => m.id === id) || null; }
function hsMeterType(id) { return HS_METER_TYPES.find(t => t.id === id) || HS_METER_TYPES[0]; }
function hsReadings(mid) {
  return hsArr('homeReadings').filter(r => r.meter === mid && vtIsIso(r.date) && isFinite(Number(r.value)))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.created || '').localeCompare(String(b.created || '')));
}
function hsReadingById(id) { return hsArr('homeReadings').find(r => r.id === id) || null; }
function hsContractsFor(hid) { return vtContracts().filter(c => c.home === hid); }
function hsRecurringFor(hid) { return finance.recurring.filter(r => r.home === hid && !(r.contract && vtContract(r.contract) && vtContract(r.contract).home === hid)); }
function hsNum(n, dec = 0) {
  const v = Number(n) || 0;
  return window.PINN_REGION ? PINN_REGION.num(v, dec, dec) : v.toFixed(dec).replace('.', ',');
}
function hsDec(s) { const v = window.PINN_REGION ? PINN_REGION.parse(String(s || '')) : parseFloat(String(s || '').replace(',', '.')); return isFinite(v) ? v : NaN; }
function hsDecInput(v, dec = 2) { if (v === '' || v == null || !isFinite(Number(v))) return ''; return window.PINN_REGION ? PINN_REGION.input(Number(v), dec) : String(Number(v)).replace('.', ','); }
function hsYearsSince(iso) {
  if (!vtIsIso(iso)) return 0;
  return Math.max(0, vtDiffDays(iso, finTodayIso()) / 365.25);
}
function hsDuration(iso) {
  const y = hsYearsSince(iso);
  if (y >= 1) return tk('wx.yearsN', { n: Math.floor(y) });
  const m = Math.floor(y * 12);
  return m <= 1 ? tk('home.lessThan2Months') : tk('contract.monthsN', { n: m });
}

/* ---------- Costs ---------- */
function hsFixDefs(h) { return HS_FIX.filter(d => hsFixMatch(d, hsMode(h))); }
// Rental income per month (letting): recurring bookings or entered amounts
function hsIncomeMonthly(h) {
  if (!hsLet(h)) return 0;
  const today = finTodayIso();
  let sum = 0;
  HS_FIX.filter(d => d.income).forEach(d => {
    const r = hsFixRec(h, d.key);
    if (r) { if (finRecIsRunning(r, today) && finRecStart(r)) sum += Math.max(0, -finRecMonthly(r, today)); }
    else sum += hsFixAmount(h, d.key) * finIntervalInfo(d.interval).perYear / 12;
  });
  return sum;
}
function hsIncomeIn(h, s, e) {
  const today = finTodayIso();
  const to = e < today ? e : today;
  let sum = 0;
  if (to < s) return 0;
  hsRecurringFor(h.id).forEach(r => { finRecDates(r, s, to).forEach(d => { const a = finRecurringAmountFor(r, d); if (a < 0) sum += -a; }); });
  return sum;
}
function hsFixAmount(h, key) { const f = h && h.fix && h.fix[key]; return f && Number(f.amount) > 0 ? Number(f.amount) : 0; }
function hsFixRec(h, key) {
  const f = h && h.fix && h.fix[key];
  return f && f.recId ? (finance.recurring.find(r => r.id === f.recId) || null) : null;
}
// Running housing costs per month: fixed costs (bookings) + assigned contracts
function hsMonthlyCost(h) {
  if (!h) return 0;
  const today = finTodayIso();
  let sum = 0;
  hsRecurringFor(h.id).forEach(r => { if (finRecIsRunning(r, today) && finRecStart(r)) sum += Math.max(0, finRecMonthly(r, today)); });
  hsContractsFor(h.id).forEach(c => { const cost = vtCost(c, today); if (cost && cost.monthly > 0) sum += cost.monthly; });
  hsFixDefs(h).forEach(d => { if (!d.income && !hsFixRec(h, d.key)) sum += hsFixAmount(h, d.key) * finIntervalInfo(d.interval).perYear / 12; });
  return sum;
}
function hsWarmRent(h) { return ['rent', 'nk', 'heat'].reduce((s, k) => s + hsFixAmount(h, k), 0); }
// Loan (annuity): remaining debt after n months
function hsLoan(h) {
  const l = h && h.own && h.own.loan;
  if (!l || !(Number(l.amount) > 0)) return null;
  const P = Number(l.amount), i = (Number(l.rate) || 0) / 100;
  let M = Number(l.monthly) || 0;
  if (!M && (Number(l.repay) > 0 || i > 0)) M = P * (i + (Number(l.repay) || 0) / 100) / 12;
  if (!(M > 0)) return { P, i, M: 0, rest: P, restAtFix: null, endMonths: null, l };
  const r = i / 12;
  const restAfter = n => {
    if (n <= 0) return P;
    const v = r > 0 ? P * Math.pow(1 + r, n) - M * (Math.pow(1 + r, n) - 1) / r : P - M * n;
    return Math.max(0, v);
  };
  const monthsSince = iso => vtIsIso(iso) ? Math.max(0, Math.floor(vtDiffDays(iso, finTodayIso()) / 30.44)) : 0;
  const n = monthsSince(l.start);
  let endMonths = null;
  if (r > 0 && M > P * r) endMonths = Math.ceil(-Math.log(1 - r * P / M) / Math.log(1 + r));
  else if (r === 0) endMonths = Math.ceil(P / M);
  const fixN = vtIsIso(l.fixedUntil) && vtIsIso(l.start) ? Math.max(0, Math.floor(vtDiffDays(l.start, l.fixedUntil) / 30.44)) : null;
  return { P, i, M, rest: restAfter(n), restAtFix: fixN != null ? restAfter(fixN) : null, endMonths, l, interestYear: restAfter(n) * i };
}
function hsBuySideCosts(h) {
  const o = (h && h.own) || {};
  return ['landTax', 'notary', 'broker'].reduce((s, k) => s + (Number(o[k]) || 0), 0);
}
// Cost items of a home between s and e (bookings only up to today)
function hsCostItems(h, s, e) {
  const out = [];
  hsLogs(h.id).forEach(l => {
    const a = Number(l.amount) || 0;
    if (a && l.date >= s && l.date <= e) out.push({ date: l.date, amount: a, group: hsLogType(l.type).group, label: hsLogTitle(l), log: l });
  });
  const today = finTodayIso();
  const to = e < today ? e : today;
  if (to >= s) {
    hsRecurringFor(h.id).forEach(r => {
      const def = HS_FIX.find(d => r.homeFix === d.key);
      finRecDates(r, s, to).forEach(d => { const a = finRecurringAmountFor(r, d); if (a > 0) out.push({ date: d, amount: a, group: def ? def.group : 'wohnkosten', label: r.title || tk('home.fixedCosts') }); });
    });
    hsContractsFor(h.id).forEach(c => {
      const r = vtRec(c);
      if (!r) return;
      const grp = c.category === 'energie' ? 'energie' : (c.category === 'versicherung' ? 'abgaben' : (c.category === 'kredit' ? 'kredit' : 'wohnkosten'));
      finRecDates(r, s, to).forEach(d => { const a = finRecurringAmountFor(r, d); if (a > 0) out.push({ date: d, amount: a, group: grp, label: c.name || tk('contract.docType.doc') }); });
    });
  }
  return out;
}
function hsLogTitle(l) { return (l && String(l.desc || '').trim()) || hsLogType(l && l.type).label; }

/* ---------- Meters & forecast ---------- */
function hsSeason(m) { const w = HS_SEASON[hsMeterType(m.type).season] || HS_SEASON.flat; const s = w.reduce((a, b) => a + b, 0); return w.map(x => x / s); }
// Weight of the days (a, b] – sum over a whole year = 1
function hsWeight(w, a, b) {
  if (!vtIsIso(a) || !vtIsIso(b) || b <= a) return 0;
  let sum = 0;
  let cur = a;
  for (let guard = 0; guard < 600 && cur < b; guard++) {
    const nxt = vtAddDays(cur, 1);
    const y = Number(nxt.slice(0, 4)), mo = Number(nxt.slice(5, 7));
    const dim = vtDim(y, mo);
    const mEnd = vtIso(y, mo, dim);
    const segEnd = b < mEnd ? b : mEnd;
    sum += w[mo - 1] * vtDiffDays(cur, segEnd) / dim;
    cur = segEnd;
  }
  return sum;
}
// Sections between two readings (a meter replacement starts a new section)
function hsSegments(m) {
  const rs = hsReadings(m.id);
  const w = hsSeason(m);
  const segs = [];
  for (let i = 1; i < rs.length; i++) {
    const a = rs[i - 1], b = rs[i];
    if (b.reset) continue;
    const cons = Number(b.value) - Number(a.value);
    if (!(cons >= 0) || b.date <= a.date) continue;
    segs.push({ a: a.date, b: b.date, cons, weight: hsWeight(w, a.date, b.date) });
  }
  return segs;
}
// Consumption per unit of annual weight (≈ annual consumption) from the sections of the last ~14 months
function hsMeterStats(m) {
  const rs = hsReadings(m.id);
  const segs = hsSegments(m);
  const today = finTodayIso();
  const from = vtAddMonths(today, -14, false);
  let use = segs.filter(s => s.b >= from);
  if (!use.length) use = segs.slice(-3);
  const cons = use.reduce((s, x) => s + x.cons, 0);
  const weight = use.reduce((s, x) => s + x.weight, 0);
  const annual = weight >= 0.04 ? cons / weight : null;
  const last = rs.length ? rs[rs.length - 1] : null;
  return { rs, segs, annual, weight, last, reliable: weight >= 0.25 };
}
function hsUnitPrice(m) {
  const t = hsMeterType(m.type);
  const p = Number(m.price);
  return p > 0 ? p : t.price;
}
function hsFactor(m) { const t = hsMeterType(m.type); return t.factor ? (Number(m.factor) > 0 ? Number(m.factor) : t.factor) : 1; }
function hsBillUnit(m) { const t = hsMeterType(m.type); return t.billUnit || t.unit; }
// Billing period that "today" falls into
function hsBillPeriod(m) {
  const today = finTodayIso();
  const md = /^\d{2}-\d{2}$/.test(m.billStart || '') ? m.billStart : '01-01';
  let start = today.slice(0, 4) + '-' + md;
  if (!vtIsIso(start)) start = today.slice(0, 4) + '-01-01';
  if (start > today) start = vtAddMonths(start, -12, false);
  const end = vtAddDays(vtAddMonths(start, 12, false), -1);
  return { start, end };
}
// Estimated meter reading on a day (weighted between readings, otherwise with the annual rate)
function hsValueAt(m, iso, st) {
  const rs = st.rs;
  if (!rs.length) return null;
  const w = hsSeason(m);
  let prev = null, next = null;
  for (const r of rs) { if (r.date <= iso) prev = r; else if (!next) next = r; }
  if (prev && next && !next.reset) {
    const tot = hsWeight(w, prev.date, next.date);
    const part = hsWeight(w, prev.date, iso);
    return Number(prev.value) + (tot > 0 ? (Number(next.value) - Number(prev.value)) * part / tot : 0);
  }
  if (st.annual == null) return null;
  if (prev) return Number(prev.value) + st.annual * hsWeight(w, prev.date, iso);
  if (next) return Number(next.value) - st.annual * hsWeight(w, iso, next.date);
  return null;
}
// Forecast for the current billing period
function hsForecast(m) {
  const st = hsMeterStats(m);
  const t = hsMeterType(m.type);
  const per = hsBillPeriod(m);
  const out = { st, per, annual: st.annual, cons: null, used: null, cost: null, advance: (Number(m.advance) || 0) * 12, diff: null, suggest: null };
  if (st.annual == null) return out;
  const w = hsSeason(m);
  const today = finTodayIso();
  // Consumption in the period = measured (as far as readings exist) + the rest with the annual rate
  const vStart = hsValueAt(m, per.start, st);
  const vToday = hsValueAt(m, st.last && st.last.date < today ? st.last.date : today, st);
  let used = (vStart != null && vToday != null) ? Math.max(0, vToday - vStart) : st.annual * hsWeight(w, per.start, today);
  const lastDate = st.last && st.last.date < today ? st.last.date : today;
  const rest = st.annual * hsWeight(w, lastDate > per.start ? lastDate : per.start, per.end);
  out.used = used;
  out.cons = used + rest;
  const qty = out.cons * hsFactor(m);
  const base = (m.base === '' || m.base == null) ? t.base : (Number(m.base) || 0);
  out.cost = qty * hsUnitPrice(m) + base * 12;
  if (!t.income) {
    if (out.advance > 0) out.diff = out.cost - out.advance;
    out.suggest = Math.ceil(out.cost / 12);
  }
  return out;
}
// Consumption per month of the last 12 months (null = no reading, value from the forecast)
function hsMonthly(m) {
  const st = hsMeterStats(m);
  const w = hsSeason(m);
  const today = finTodayIso();
  const months = [];
  for (let k = 11; k >= 0; k--) {
    const first = vtAddMonths(today.slice(0, 8) + '01', -k, false);
    const y = Number(first.slice(0, 4)), mo = Number(first.slice(5, 7));
    const end = vtIso(y, mo, vtDim(y, mo));
    const startPrev = vtAddDays(first, -1);
    let val = 0, covered = 0;
    st.segs.forEach(sg => {
      const a = sg.a > startPrev ? sg.a : startPrev;
      const b = sg.b < end ? sg.b : end;
      if (b <= a || sg.weight <= 0) return;
      const part = hsWeight(w, a, b);
      val += sg.cons * part / sg.weight;
      covered += part;
    });
    const full = hsWeight(w, startPrev, end);
    const est = st.annual != null ? st.annual * full : null;
    months.push({ ym: first.slice(0, 7), val: covered > full * 0.5 ? val / Math.max(1e-9, covered) * full : null, est, future: first > today });
  }
  return { st, months };
}

/* ---------- Maintenance plan (family data) ---------- */
function hsMaintItems() { return Array.isArray(houseMaintenance) ? houseMaintenance : []; }
function hsMaintKey(m) { const icon = String(m.icon || '').trim(); return ((icon ? icon + ' ' : '') + String(m.title || '').trim()).slice(0, 300); }
function hsMaintTasks(m) { const key = hsMaintKey(m); return (typeof aufgaben !== 'undefined' ? aufgaben : []).filter(t => t.household === key); }
function hsMaintOpen(m) { return hsMaintTasks(m).find(t => !t.done) || null; }
function hsMaintLastDone(m) {
  let best = vtIsIso(m.last) ? m.last : '';
  hsMaintTasks(m).forEach(t => {
    if (!t.done) return;
    const d = t.doneAt ? isoDate(new Date(t.doneAt)) : t.dueDate;
    if (vtIsIso(d) && d > best) best = d;
  });
  return best;
}
// Next due date (as on the server, pinn-aufgaben.js → maintNextDue)
function hsMaintNext(m) {
  const open = hsMaintOpen(m);
  if (open && vtIsIso(open.dueDate)) return open.dueDate;
  const months = Math.max(1, Number(m.months) || 12);
  const last = hsMaintLastDone(m);
  if (vtIsIso(m.next) && (!last || last < (m.nextSet || ''))) return m.next;
  if (last) return vtAddMonths(last, months, false);
  return vtIsIso(m.next) ? m.next : finTodayIso();
}
function hsMaintEvery(months) {
  const n = Number(months) || 12;
  if (n === 1) return tk('contract.interval.monthly');
  if (n === 3) return tk('contract.interval.quarterly');
  if (n === 6) return tk('home.halfYearly');
  if (n === 12) return tk('contract.interval.yearly');
  if (n % 12 === 0) return tk('home.everyNYears', { n: n / 12 });
  return tk('home.everyNMonths', { n });
}
// The task key is icon + title: two entries with the same name would share one task (editing one
// changed the due date of the other). Since 1.57 names are kept unique, e.g. "Rasen düngen (2)".
function hsMaintUniqueTitle(icon, title, exceptId) {
  const taken = new Set(hsMaintItems().filter(m => m.id !== exceptId).map(m => hsMaintKey(m).toLowerCase()));
  const keyOf = t => hsMaintKey({ icon, title: t }).toLowerCase();
  if (!taken.has(keyOf(title))) return title;
  const base = String(title).replace(/\s*\(\d+\)$/, '').slice(0, 94);
  for (let n = 2; n < 100; n++) {
    const t = base + ' (' + n + ')';
    if (!taken.has(keyOf(t))) return t;
  }
  return title;
}
// Repair duplicates saved before 1.57: later entries get a number, the server then creates their own task
function hsMaintFixDuplicates() {
  if (!Array.isArray(houseMaintenance) || houseMaintenance.length < 2) return false;
  const all = new Set(houseMaintenance.map(m => hsMaintKey(m).toLowerCase()));
  const seen = new Set();
  let changed = false;
  houseMaintenance = houseMaintenance.map(m => {
    const k = hsMaintKey(m).toLowerCase();
    if (!seen.has(k)) { seen.add(k); return m; }
    const base = String(m.title || '').replace(/\s*\(\d+\)$/, '').slice(0, 94);
    let n = 2, t = base + ' (2)';
    while (all.has(hsMaintKey({ icon: m.icon, title: t }).toLowerCase()) && n < 100) { n++; t = base + ' (' + n + ')'; }
    const next = { ...m, title: t };
    const nk = hsMaintKey(next).toLowerCase();
    all.add(nk); seen.add(nk);
    changed = true;
    return next;
  });
  return changed;
}
// Note completed tasks at the maintenance point (the history on the server only keeps ~400 days)
function hsMaintSyncFromTasks() {
  if (!Array.isArray(houseMaintenance) || !houseMaintenance.length || isCurrentUserGuest() || childLockActive()) return false;
  let changed = false;
  if (hsMaintFixDuplicates()) {
    changed = true;
    setTimeout(() => { if (typeof triggerHouseholdResync === 'function') triggerHouseholdResync(); }, 1500);
  }
  houseMaintenance = houseMaintenance.map(m => {
    const d = hsMaintLastDone(m);
    if (d && d !== m.last) { changed = true; return { ...m, last: d }; }
    return m;
  });
  if (changed) persistState();
  return changed;
}
/* ---------- Tasks with their own input (since 1.57) ----------
   "Zählerstände ablesen" (read meters): tapping the task opens the reading popup, one meter after the other.
   As soon as every active meter has a recent reading, the task ticks itself off – also when the readings
   are entered on the Zuhause (home) page. index.html → taskActionFor asks hsTaskAction for the button. */
let hsMeterRun = null; // { taskId, cutoff } while working through the meters
function hsMaintIsMeter(m) { return !!m && (m.tpl === 'zaehler' || /zählerst/i.test(String(m.title || ''))); }
function hsMeterMaintForTask(task) {
  if (!task || !task.household) return null;
  return hsMaintItems().find(m => hsMaintIsMeter(m) && hsMaintKey(m) === task.household) || null;
}
function hsAllActiveMeters() {
  const homes = new Set(hsActiveHomes().map(h => h.id));
  return hsMeters('').filter(m => m.active !== false && homes.has(m.home));
}
// Readings from this day on count for the task (also when entered a little early)
function hsMeterCutoff(task, m) {
  const lead = Math.max(0, Number(m && m.lead) || 0);
  const base = task && vtIsIso(task.dueDate) ? task.dueDate : finTodayIso();
  return vtAddDays(base, -Math.max(10, lead + 5));
}
function hsMeterPending(cutoff) {
  return hsAllActiveMeters().filter(m => {
    const rs = hsReadings(m.id);
    const last = rs.length ? rs[rs.length - 1].date : '';
    return !(last && last >= cutoff);
  });
}
function hsMeterLabel(m) { return m.name || hsMeterType(m.type).label; }
function hsTaskAction(task) {
  if (!task || task.done || !hsCanEdit() || !finance) return null;
  const m = hsMeterMaintForTask(task);
  if (!m) return null;
  return { label: tk('home.enterMeterReadings'), run: () => hsMeterTaskRun(task.id) };
}
function hsCompleteTask(task) {
  if (!task || task.done || typeof queueTaskDone !== 'function') return;
  queueTaskDone(task.id, true);
  rebuildAufgaben();
  try { renderTasks(); } catch (e) { /* ignore */ }
  flushOutbox();
}
function hsOpenMeterReadingFor(meter) {
  hsHomeId = meter.home;
  hsOpenReadingModal({ meterId: meter.id, fromRun: true });
}
// taskId empty = from the overview without a task yet
function hsMeterTaskRun(taskId) {
  if (!hsCanEdit() || !finance) return;
  const task = taskId ? aufgaben.find(t => t.id === taskId) : null;
  const m = task ? hsMeterMaintForTask(task) : null;
  if (taskId && !m) return;
  if (!hsAllActiveMeters().length) {
    finShowToast(tk('home.addMetersFirstAfter'));
    hsOpen('zaehler');
    setTimeout(() => hsOpenMeterModal(null), 250);
    return;
  }
  const cutoff = task ? hsMeterCutoff(task, m) : vtAddDays(finTodayIso(), -10);
  const pending = hsMeterPending(cutoff);
  if (!pending.length) {
    if (task && confirm(tk('home.allReadingsTickTask', { title: task.title }))) {
      hsCompleteTask(task);
      finShowToast(tk('pet.done'));
    } else if (!task) {
      hsOpenReadingModal({});
    }
    return;
  }
  hsMeterRun = { taskId: task ? task.id : '', cutoff };
  hsOpenMeterReadingFor(pending[0]);
}
// After saving a reading: tick off meter tasks that are complete, otherwise go on with the next meter
function hsMeterAfterReading() {
  const run = hsMeterRun;
  hsMeterRun = null;
  if (typeof aufgaben === 'undefined' || !hsAllActiveMeters().length) return false;
  let closed = 0;
  aufgaben.filter(t => !t.done).forEach(t => {
    const m = hsMeterMaintForTask(t);
    if (!m || hsMeterPending(hsMeterCutoff(t, m)).length) return;
    hsCompleteTask(t);
    closed++;
  });
  if (closed) {
    finShowToast(tk('home.allMeterReadingsEntered'));
    if (currentView === 'haus') renderHouse();
    return true;
  }
  if (run) {
    const pending = hsMeterPending(run.cutoff);
    if (pending.length) {
      hsMeterRun = run;
      finShowToast(tk('home.savedNextMeter', { name: hsMeterLabel(pending[0]) }));
      setTimeout(() => hsOpenMeterReadingFor(pending[0]), 350);
      return true;
    }
  }
  return false;
}
// "Überfällig" (overdue) in the overview: open the input or the task itself, not the maintenance plan
function hsMaintDueOpen(id) {
  const m = hsMaintItems().find(x => x.id === id);
  if (!m) return;
  const open = hsMaintOpen(m);
  if (hsMaintIsMeter(m)) { hsMeterTaskRun(open ? open.id : ''); return; }
  if (open) { openEditTaskModal({ id: open.id }); return; }
  if (hsCanEdit()) hsOpenMaintModal(id);
}
// Button in the maintenance list: enter readings or tick off the open task
function hsMaintAct(id) {
  const m = hsMaintItems().find(x => x.id === id);
  const open = m ? hsMaintOpen(m) : null;
  if (!open || !hsCanEdit()) return;
  if (hsMaintIsMeter(m)) { hsMeterTaskRun(open.id); return; }
  hsCompleteTask(open);
  finShowToast(tk('pet.done'));
  if (currentView === 'haus') renderHouse();
}
function hsMaintDueTone(iso) {
  const days = vtDiffDays(finTodayIso(), iso);
  if (days < 0) return { tone: 'urgent', label: tk('home.overdueSince', { date: vtFmt(iso) }) };
  if (days === 0) return { tone: 'warn', label: tk('contract.today') };
  if (days <= 14) return { tone: 'warn', label: tk('lists.when.inDays', { n: days }) };
  return { tone: '', label: vtFmt(iso) };
}

/* ---------- Page ---------- */
function hsCard(inner, extra = '') { return fzCard(inner, extra); }
function hsEsc(s) { return escapeHtml(s == null ? '' : String(s)); }
function hsCanEdit() { return !isCurrentUserGuest() && !childLockActive(); }
function renderHouse() {
  renderKassePills();
  const pane = document.getElementById('hsPane');
  if (!pane || !finance) return;
  hsMaintSyncFromTasks();
  const h = hsCurrent();
  const mods = hsModules(h);
  const tabs = ['uebersicht', ...HS_MODULES.filter(x => x.tab && mods.includes(x.id)).map(x => x.id)];
  if (!tabs.includes(hsTab)) hsTab = 'uebersicht';
  const tabsEl = document.getElementById('hsTabs');
  if (tabsEl && tabsEl.dataset.tabs !== tabs.join(',')) {
    tabsEl.dataset.tabs = tabs.join(',');
    tabsEl.innerHTML = tabs.map(id => {
      const m = HS_MODULES.find(x => x.id === id);
      return `<button type="button" data-hstab="${id}" class="hs-tab-btn flex-1 sm:flex-none px-2.5 sm:px-4 py-1.5 rounded-full transition" role="tab">${hsEsc(m ? (m.tabLabel || m.label) : tk('nav.overview'))}</button>`;
    }).join('');
  }
  document.querySelectorAll('.hs-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.hstab === hsTab));
  const hb = document.getElementById('hsHeaderBtn');
  const labels = { uebersicht: h ? tk('home.edit') : tk('home.home'), maengel: tk('home.defect'), kosten: tk('home.invoice'), zaehler: tk('home.meterReading'), wartung: tk('home.maintenance'), garten: tk('home.plant') };
  hb.textContent = labels[hsTab] || '+';
  hb.classList.toggle('hidden', !hsCanEdit() || (!h && hsTab !== 'uebersicht' && hsTab !== 'wartung'));
  if (hsTab === 'wartung') { pane.innerHTML = hsMaintPageHtml(); return; }
  if (!h) { pane.innerHTML = hsEmptyHtml(); return; }
  const switcher = hsSwitcherHtml(h);
  if (hsTab === 'maengel') pane.innerHTML = switcher + hsDefectsHtml(h);
  else if (hsTab === 'kosten') pane.innerHTML = switcher + hsCostsHtml(h);
  else if (hsTab === 'zaehler') pane.innerHTML = switcher + hsMetersHtml(h);
  else if (hsTab === 'garten') pane.innerHTML = switcher + hsGardenHtml(h);
  else pane.innerHTML = switcher + hsOverviewHtml(h);
}
/* ---------- Building blocks ---------- */
function hsDefaultModules(h) {
  const t = h && h.type;
  if (t === 'garage') return ['maengel', 'kosten'];
  const base = ['maengel', 'kosten', 'zaehler', 'wartung'];
  if (t === 'haus' || t === 'reihenhaus') base.push('garten');
  return base;
}
function hsModules(h) {
  if (!h) return ['wartung'];
  return Array.isArray(h.modules) ? h.modules.filter(id => HS_MODULES.some(m => m.id === id)) : hsDefaultModules(h);
}
function hsHasModule(h, id) { return hsModules(h).includes(id); }
function hsToggleModule(id) {
  const h = hsCurrent();
  if (!h || !hsCanEdit() || !HS_MODULES.some(m => m.id === id)) return;
  const cur = hsModules(h);
  const on = !cur.includes(id);
  const next = HS_MODULES.map(m => m.id).filter(x => x === id ? on : cur.includes(x));
  hsUpsert('homes', { ...h, modules: next, updated: finTodayIso() });
  hsAfterChange();
  const m = HS_MODULES.find(x => x.id === id);
  finShowToast(on ? tk('home.moduleAdded', { name: m.label }) : tk('home.moduleRemoved', { name: m.label }));
}
function hsModulesCardHtml(h) {
  if (!hsCanEdit()) return '';
  const cur = hsModules(h);
  return hsCard(`
    <div class="fz-h">${tk('home.buildingBlocks')}</div>
    <p class="text-xs text-ink/50 mb-2">${tk('home.whatBelongsHomeTap')}</p>
    <div class="flex flex-wrap gap-1.5">${HS_MODULES.map(m => `<button type="button" class="hs-mod-chip${cur.includes(m.id) ? ' active' : ''}" data-hsact="mod-toggle" data-id="${m.id}" aria-pressed="${cur.includes(m.id)}"><span>${m.icon}</span><span>${hsEsc(m.label)}</span></button>`).join('')}</div>`);
}
/* ---------- Animated scene in the header ----------
   House & terraced house: house with garden, fence, smoke from the chimney and birds.
   Flat, shared flat & apartment building: city with windows, train, taxi, car, bicycle and aeroplane.
   Garage: garage with driveway. After sunset (home weather) night with moon, stars and light.
   Only transform/opacity animations; in power-saving mode and with "reduce motion" everything stands still. */
function hsSceneKind(h) {
  const t = h && h.type;
  if (t === 'garage') return 'garage';
  if (t === 'haus' || t === 'reihenhaus') return 'haus';
  return 'stadt';
}
function hsIsNight() {
  const now = new Date();
  const hm = now.getHours() * 60 + now.getMinutes();
  try {
    const d0 = weatherDaily && Array.isArray(weatherDaily.days) ? weatherDaily.days.find(d => d.date === isoDate(now)) : null;
    const t = s => /^\d{2}:\d{2}$/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null;
    if (d0 && t(d0.auf) != null && t(d0.unter) != null) return hm < t(d0.auf) - 15 || hm > t(d0.unter) + 25;
  } catch (e) { /* without weather: fixed times */ }
  return hm >= 20 * 60 || hm < 6 * 60;
}
function hsMover(cls, emoji, dur, delay, extra = '') {
  return `<div class="hs-mover ${cls} hs-anim" style="animation-duration:${dur}s;animation-delay:-${delay}s${extra}"><span>${emoji}</span></div>`;
}
function hsSceneHouse(night) {
  const win = night ? '#FFD66B' : '#BFE3F5';
  let fence = '';
  for (let x = 22; x <= 92; x += 7) fence += `<path d="M${x} 85 V75 l2 -2 l2 2 V85" fill="${night ? '#C9C2B4' : '#FFFFFF'}"/>`;
  const flowers = [[30, '#E76F51'], [44, '#F4A261'], [58, '#E9C46A'], [72, '#C0567A'], [86, '#E76F51']].map(([x, c]) => `<circle cx="${x}" cy="86" r="2.2" fill="${night ? '#6B5F6E' : c}"/>`).join('');
  return `
    <svg class="hs-art" viewBox="0 0 220 92" preserveAspectRatio="xMaxYMax meet">
      <path d="M0 86 Q60 78 120 83 T220 80 V92 H0Z" fill="${night ? '#2F4A33' : '#79B35A'}"/>
      <rect x="18" y="77" width="78" height="2" fill="${night ? '#C9C2B4' : '#fff'}"/><rect x="18" y="81" width="78" height="2" fill="${night ? '#C9C2B4' : '#fff'}"/>
      ${fence}${flowers}
      <rect x="191" y="56" width="6" height="28" rx="2" fill="#7A5230"/>
      <circle cx="194" cy="48" r="15" fill="${night ? '#22392B' : '#4F8A3C'}"/>
      <circle cx="184" cy="55" r="9" fill="${night ? '#2A4635' : '#5E9C47'}"/><circle cx="204" cy="56" r="8" fill="${night ? '#2A4635' : '#5E9C47'}"/>
      <rect x="146" y="24" width="8" height="16" fill="#8B5A44"/>
      <rect x="100" y="46" width="64" height="38" fill="${night ? '#CFC2A8' : '#FFF7EA'}"/>
      <polygon points="94,48 132,18 170,48" style="fill:var(--fz, #2F4B41)"/>
      <rect x="125" y="63" width="14" height="21" rx="2" fill="${night ? '#5A4636' : '#8B5A44'}"/>
      <circle cx="136" cy="74" r="1" fill="#E9C46A"/>
      <rect x="106" y="56" width="13" height="11" rx="1.5" fill="${win}"/><rect x="145" y="56" width="13" height="11" rx="1.5" fill="${win}" ${night ? 'class="hs-win-tw hs-anim"' : ''}/>
      <circle cx="132" cy="36" r="5" fill="${win}"/>
    </svg>
    <span class="hs-smoke hs-anim" style="right:66px;top:16px"></span><span class="hs-smoke hs-anim" style="right:66px;top:16px;animation-delay:1.2s"></span><span class="hs-smoke hs-anim" style="right:66px;top:16px;animation-delay:2.4s"></span>
    ${night ? '' : `<div class="hs-mover hs-bird hs-anim"><span><svg viewBox="0 0 14 8"><path d="M0 4 Q3.5 0 7 4 Q10.5 0 14 4"/></svg></span></div><div class="hs-mover hs-bird b2 hs-anim"><span><svg viewBox="0 0 14 8"><path d="M0 4 Q3.5 0 7 4 Q10.5 0 14 4"/></svg></span></div>`}`;
}
function hsSceneCity(night) {
  const shades = night ? ['#25304C', '#1E2840', '#2C3858'] : ['#AFC1D2', '#94AAC0', '#C3D0DC'];
  const B = [[6, 22, 40, 1], [30, 18, 58, 2], [50, 26, 46, 0], [78, 16, 64, 1], [96, 30, 36, 2], [128, 20, 52, 0], [150, 24, 66, 3], [176, 18, 44, 2], [196, 28, 56, 0], [226, 16, 38, 1], [244, 16, 50, 2]];
  let svg = `<line x1="117" y1="74" x2="117" y2="6" stroke="${night ? '#3A4668' : '#8EA2B8'}" stroke-width="2"/><circle cx="117" cy="20" r="4.5" fill="${night ? '#3A4668' : '#8EA2B8'}"/>${night ? '<circle class="hs-lamp hs-anim" cx="117" cy="5" r="1.6" fill="#FF5A5A"/>' : ''}`;
  let tw = 0;
  B.forEach(([x, w, hh, s], i) => {
    const y = 74 - hh;
    svg += s === 3 ? `<rect x="${x}" y="${y}" width="${w}" height="${hh}" style="fill:var(--fz, #2F4B41);opacity:${night ? 0.55 : 0.85}"/>` : `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${shades[s]}"/>`;
    const cols = Math.floor((w - 4) / 6), rows = Math.floor((hh - 6) / 8);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const hsh = (i * 7 + r * 3 + c * 5) % 10;
      let fill = night ? (hsh < 5 ? '#FFD66B' : '#3B4766') : 'rgba(255,255,255,0.55)';
      let cls = '';
      if (night && hsh === 3 && tw < 6) { cls = ' class="hs-win-tw hs-anim" style="animation-delay:-' + (tw * 0.9) + 's"'; tw++; }
      svg += `<rect x="${x + 3 + c * 6}" y="${y + 4 + r * 8}" width="3" height="4"${cls} fill="${fill}"/>`;
    }
  });
  return `
    <svg class="hs-art" viewBox="0 0 260 74" preserveAspectRatio="xMaxYMax meet" style="height:calc(100% - 16px);bottom:16px">${svg}</svg>
    <div class="hs-rail"></div>
    <div class="hs-mover hs-train ltr hs-anim"><span></span></div>
    <div class="hs-road"></div>
    ${hsMover('hs-car', '🚕', 8, 1)}${hsMover('hs-car l2', '🚗', 11, 6)}${hsMover('hs-car', '🚲', 18, 11)}${hsMover('hs-car l2', '🚌', 15, 3)}
    <div class="hs-mover hs-plane ltr hs-anim"><span>✈️</span></div>`;
}
function hsSceneGarage(night) {
  let lines = '';
  for (let y = 54; y <= 80; y += 5) lines += `<line x1="113" y1="${y}" x2="169" y2="${y}" stroke="${night ? '#6F7783' : '#AEB4BB'}" stroke-width="1.2"/>`;
  return `
    <svg class="hs-art" viewBox="0 0 200 92" preserveAspectRatio="xMaxYMax meet">
      <path d="M0 86 Q50 80 100 84 T200 82 V92 H0Z" fill="${night ? '#2F4A33' : '#79B35A'}"/>
      <polygon points="104,92 116,84 166,84 178,92" fill="${night ? '#3F444C' : '#B9BEC4'}"/>
      <rect x="100" y="40" width="82" height="44" fill="${night ? '#BDB4A3' : '#EFE9DE'}"/>
      <rect x="96" y="34" width="90" height="8" rx="2" style="fill:var(--fz, #2F4B41)"/>
      <rect x="112" y="51" width="58" height="33" rx="1.5" fill="${night ? '#59606A' : '#CDD2D8'}"/>${lines}
      <circle cx="141" cy="46" r="2.6" fill="${night ? '#FFD66B' : '#D7D2C8'}"${night ? ' class="hs-lamp hs-anim"' : ''}/>
      <circle cx="190" cy="80" r="7" fill="${night ? '#22392B' : '#4F8A3C'}"/><circle cx="196" cy="83" r="5" fill="${night ? '#2A4635' : '#5E9C47'}"/>
    </svg>
    ${hsMover('hs-car', '🚗', 9, 2)}${hsMover('hs-car l2', '🛵', 14, 8)}`;
}
function hsSceneHtml(h) {
  const kind = hsSceneKind(h);
  const night = hsIsNight();
  const sky = night
    ? [[8, 12], [22, 30], [35, 8], [48, 22], [62, 14], [74, 36], [86, 10], [93, 26], [15, 44], [55, 40]].map(([x, y], i) => `<span class="hs-star${i % 3 === 0 ? ' tw hs-anim' : ''}" style="left:${x}%;top:${y}px;animation-delay:-${i * 0.7}s"></span>`).join('') + '<span class="hs-moon"></span>'
    : '<span class="hs-sun"></span><div class="hs-cloud hs-anim"><i></i></div><div class="hs-cloud c2 hs-anim"><i></i></div>';
  const body = kind === 'haus' ? hsSceneHouse(night) : kind === 'garage' ? hsSceneGarage(night) : hsSceneCity(night);
  return `<div class="fz-hero-band hs-scene hs-${kind}${night ? ' is-night' : ''}" aria-hidden="true">${sky}${body}</div>`;
}
function hsHeroActionsHtml(h) {
  const b = [];
  if (hsHasModule(h, 'kosten')) b.push(['log-new', '🧾', tk('contract.docType.invoice')]);
  if (hsHasModule(h, 'maengel')) b.push(['defect-new', '🛠️', tk('home.defect2')]);
  if (hsHasModule(h, 'zaehler')) b.push(['reading-new', '📟', tk('home.meters')]);
  if (hsHasModule(h, 'garten') && b.length < 3) b.push(['tab', '🌿', tk('home.garden'), 'garten']);
  b.push(['home-edit', '✎', tk('common.edit')]);
  return b.map((x, i) => `<button type="button" class="fz-act-btn${i === 0 && b.length > 1 ? ' primary' : ''}" data-hsact="${x[0]}"${x[3] ? ` data-tab="${x[3]}"` : ''}><span class="fz-ti">${x[1]}</span>${hsEsc(x[2])}</button>`).join('');
}
function hsEmptyHtml() {
  return `
    <div class="rounded-2xl bg-white border border-dashed border-ink/20 p-6 text-center">
      <div class="fz-empty-car mb-2">🏡</div>
      <div class="font-serif text-lg mb-1">${tk('home.home2')}</div>
      <p class="text-xs text-ink/50 mb-4">${tk('home.tenancyPurchaseContractDeposit')}</p>
      ${hsCanEdit() ? `<div class="flex flex-wrap justify-center gap-2">
        <button type="button" class="fz-kind-btn px-4 py-2.5 text-sm" data-hsact="home-new" data-mode="miete">${tk('home.weRent')}</button>
        <button type="button" class="fz-kind-btn px-4 py-2.5 text-sm" data-hsact="home-new" data-mode="eigentum">${tk('home.weOwn')}</button>
        <button type="button" class="fz-kind-btn px-4 py-2.5 text-sm" data-hsact="home-new" data-mode="vermietet">${tk('home.weLetOut')}</button>
      </div>` : ''}
    </div>`;
}
function hsSwitcherHtml(h) {
  const list = hsHomes();
  if (list.length < 2) return '';
  return `<div class="fz-type-row">${list.map(x => `<button type="button" class="fz-filter-chip${x.id === h.id ? ' active' : ''}" data-hsact="home-pick" data-id="${hsEsc(x.id)}">${hsEsc(hsHeroIcon(x) + ' ' + hsName(x))}${hsIsArchived(x) ? ' · ' + hsEsc(tk('home.previous')) : ''}</button>`).join('')}</div>`;
}
function hsRow(label, value) { return value === '' || value == null ? '' : `<div class="vt-row"><span>${hsEsc(label)}</span><span>${value}</span></div>`; }


/* ---------- Letting: tenancy ---------- */
function hsTenantCardHtml(h) {
  const t = h.tenant || {}, r = h.rent || {};
  const contact = [t.phone ? `<a class="hover:text-pine" href="tel:${hsEsc(String(t.phone).replace(/[^\d+]/g, ''))}">${hsEsc(t.phone)}</a>` : '', t.email ? `<a class="hover:text-pine" href="mailto:${hsEsc(t.email)}">${hsEsc(t.email)}</a>` : ''].filter(Boolean).join('<br>');
  const rows = [
    hsRow(tk('home.tenant'), hsEsc(t.name || '')),
    hsRow(tk('home.contact'), contact),
    hsRow(tk('home.tenantSince'), vtIsIso(t.since) ? hsEsc(vtFmt(t.since) + ' · ' + hsDuration(t.since)) : ''),
    ...HS_FIX.filter(d => d.income).map(d => hsRow(d.label.replace(/\s*\(Einnahme\)$/, ''), hsFixAmount(h, d.key) > 0 ? hsEsc(fmtEur(hsFixAmount(h, d.key))) : '')),
    hsRow(tk('home.rentType'), r.kind === 'staffel' ? hsEsc(tk('home.graduatedRent')) : r.kind === 'index' ? hsEsc(tk('home.indexLinkedRent')) : ''),
    hsRow(tk('home.lastIncrease'), vtIsIso(r.lastIncrease) ? hsEsc(vtFmt(r.lastIncrease)) : ''),
    hsRow(tk('contract.noticePeriod'), hsEsc(tk('contract.monthsN', { n: Number(r.notice) || 3 }))),
    hsRow(tk('home.deposit'), Number(r.deposit) > 0 ? hsEsc(fmtEur(r.deposit) + (r.depositWhere ? ' · ' + r.depositWhere : '')) : ''),
  ].join('');
  return hsCard(`
    <div class="flex items-center justify-between gap-2 mb-1">
      <div class="fz-h" style="margin:0">${tk('home.tenancy')}</div>
      ${hsCanEdit() ? ('<button type="button" class="fz-mini-btn" data-hsact="home-edit">' + tk('home.edit') + '</button>') : ''}
    </div>
    ${rows || ('<p class="text-xs text-ink/45">' + tk('home.enterTenantRentDeposit') + '</p>')}
    <p class="vt-info mt-3">${tk('home.tipGermanyServiceCharge')}</p>`);
}

/* ---------- Building block keys ---------- */
function hsKeys(hid) { return hsArr('homeKeys').filter(k => k.home === hid); }
function hsKeysCardHtml(h) {
  if (!hsHasModule(h, 'schluessel')) return '';
  const list = hsKeys(h.id);
  const total = list.reduce((s, k) => s + (Number(k.count) || 0), 0);
  const rows = list.map(k => `
    <button type="button" class="fz-log-row" data-hsact="key-edit" data-id="${hsEsc(k.id)}">
      <span class="fz-log-ic" style="background:#D4A01722">🗝️</span>
      <span class="flex-1 min-w-0"><span class="block text-sm font-medium truncate">${hsEsc(k.label || tk('home.keys'))}</span>${k.holder ? `<span class="block text-xs text-ink/45 truncate">${hsEsc(k.holder)}</span>` : ''}</span>
      <span class="shrink-0 text-sm font-semibold">${hsEsc((Number(k.count) || 1) + '×')}</span>
    </button>`).join('');
  return hsCard(`
    <div class="flex items-center justify-between gap-2 mb-1">
      <div class="fz-h" style="margin:0">${tk('home.keys2')} <span class="text-ink/40 font-normal normal-case">${total || ''}</span></div>
      ${hsCanEdit() ? ('<button type="button" class="fz-mini-btn primary" data-hsact="key-new">' + tk('home.key') + '</button>') : ''}
    </div>
    ${rows ? `<div class="flex flex-col">${rows}</div>` : ('<p class="text-xs text-ink/45">' + tk('home.frontDoorCellarLetterbox') + '</p>')}`);
}
function hsOpenKeyModal(id) {
  const h = hsCurrent();
  if (!h || !hsCanEdit()) return;
  const k = id ? hsArr('homeKeys').find(x => x.id === id) : null;
  const d = k || { label: '', count: 1, holder: '', note: '' };
  hsModalState = { mode: 'key', id: k ? k.id : null };
  const html = `
    <h3 class="font-serif text-lg mb-3 pr-6">${k ? tk('home.editKey') : tk('home.newKey')}</h3>
    <div class="grid gap-3" style="grid-template-columns:minmax(0,1fr) 5.5rem">
      ${fzIn('hskLabel', tk('home.what'), d.label || '', { ph: tk('home.eGFrontDoor'), max: 80 })}
      ${fzIn('hskCount', tk('home.number'), String(Number(d.count) || 1), { mode: 'numeric', max: 3 })}
    </div>
    ${fzIn('hskHolder', tk('home.whoHas'), d.holder || '', { ph: tk('home.eGUsMillers'), max: 120 })}
    ${fzIn('hskNote', tk('fin.csv.note'), d.note || '', { ph: tk('home.optionalEGMaster'), max: 300 })}
    ${hsFooter('hsKey', !!k)}`;
  hsOpenModal(html, () => hsWireFooter('hsKey', hsSaveKey, () => hsDeleteKey(k.id)));
}
function hsSaveKey() {
  const st = hsModalState, h = hsCurrent();
  if (!st || st.mode !== 'key' || !h) return;
  const label = fzVal('hskLabel').slice(0, 80);
  if (!label) return fzShowErr('hsKeyError', tk('home.pleaseEnterWhatKey'));
  const count = Math.max(1, Math.min(99, Math.round(Number(fzVal('hskCount')) || 1)));
  const existing = st.id ? hsArr('homeKeys').find(x => x.id === st.id) : null;
  hsUpsert('homeKeys', { ...(existing || {}), id: existing ? existing.id : 'k' + newRecordId().slice(0, 12), home: h.id, label, count, holder: fzVal('hskHolder').slice(0, 120), note: fzVal('hskNote').slice(0, 300), created: (existing && existing.created) || finTodayIso() });
  hsCloseModal();
  hsAfterChange();
}
function hsDeleteKey(id) {
  if (!confirm(tk('home.deleteKey'))) return;
  hsSet('homeKeys', hsArr('homeKeys').filter(x => x.id !== id));
  hsCloseModal();
  hsAfterChange();
}

/* ---------- Building block garden & plants ----------
   Plants (indoor, balcony, garden) with a watering and fertilising plan, mowing the lawn in season.
   Rain counts as watering outdoors (rainfall of the last two days and today, from 4 mm – from the
   home weather), in heat from 28 °C watering outdoors is needed twice as often. The garden year
   (pruning fruit trees, hedge, leaves …) runs via the maintenance plan as household tasks.
   Data: finance.homePlants { id, home, tpl, name, icon, place, rain, every, act: 'water'|'mow',
   fertEvery, months: [from, to], last, lastFert, note, created,
   smart: { start: action ID (button), auto: { action, time: 'HH:MM' } } }
   Smart home (1.62): a robot mower or a watering valve can be linked – a start button at the row and an
   automatic start at a time on the due day (pb_hooks/pinn-smarthome.js, same rain/heat rules as here).
   What the server started comes back via /api/pinn/smart/status (pflanzen) and counts as watered/mowed. */
function hsPlants(hid) { return hsArr('homePlants').filter(p => p.home === hid); }
function hsWx() { try { return weatherDaily && Array.isArray(weatherDaily.days) && weatherDaily.days.length ? weatherDaily : null; } catch (e) { return null; } }
function hsTodayWx() { const w = hsWx(); return w ? (w.days.find(d => d.date === finTodayIso()) || null) : null; }
function hsRainLog() {
  const out = {};
  const w = hsWx();
  if (!w) return out;
  (Array.isArray(w.past) ? w.past : []).forEach(d => { if (d && vtIsIso(d.date) && d.mm != null) out[d.date] = Number(d.mm) || 0; });
  const t = hsTodayWx();
  if (t && t.mm != null && (t.rain == null || Number(t.rain) >= 60)) out[t.date] = Number(t.mm) || 0;
  return out;
}
function hsPlantOutdoor(p) { return p.place === 'balkon' || p.place === 'garten'; }
function hsPlantInSeason(p, iso) {
  if (!Array.isArray(p.months) || p.months.length !== 2) return true;
  const m = Number(String(iso || finTodayIso()).slice(5, 7));
  const a = Number(p.months[0]), b = Number(p.months[1]);
  if (!(a >= 1 && a <= 12 && b >= 1 && b <= 12)) return true;
  return a <= b ? (m >= a && m <= b) : (m >= a || m <= b);
}
function hsPlantState(p, rain = hsRainLog()) {
  const today = finTodayIso();
  if (!hsPlantInSeason(p, today)) return { off: true };
  const mow = p.act === 'mow';
  let last = vtIsIso(p.last) && p.last <= today ? p.last : '';
  let byRain = '';
  if (!mow && p.rain && hsPlantOutdoor(p)) Object.keys(rain).sort().forEach(d => { if (rain[d] >= 4 && d <= today && (!last || d > last)) { last = d; byRain = d; } });
  let every = Math.max(1, Number(p.every) || 7);
  const wx = hsTodayWx();
  const hot = !mow && hsPlantOutdoor(p) && !!wx && Number(wx.max) >= 28 && !byRain;
  if (hot) every = Math.max(1, Math.ceil(every / 2));
  const next = last ? vtAddDays(last, every) : today;
  const days = vtDiffDays(today, next);
  const m = Number(today.slice(5, 7));
  let fertDue = false;
  if (!mow && Number(p.fertEvery) > 0 && m >= 3 && m <= 9) fertDue = !vtIsIso(p.lastFert) || vtAddDays(p.lastFert, Number(p.fertEvery)) <= today;
  return { off: false, last, byRain, next, days, due: days <= 0, hot, fertDue, wateredToday: vtIsIso(p.last) && p.last === today };
}
function hsPlantsDue(h) {
  if (!h || !hsHasModule(h, 'garten')) return [];
  const rain = hsRainLog();
  return hsPlants(h.id).filter(p => { const s = hsPlantState(p, rain); return !s.off && (s.due || s.fertDue); });
}
function hsPlantRowHtml(p, rain) {
  const s = hsPlantState(p, rain);
  const mow = p.act === 'mow';
  const place = (HS_PLACES.find(x => x[0] === p.place) || HS_PLACES[0])[1];
  const parts = [place];
  if (s.off) parts.push(tk('home.pausedUntilSeason'));
  else if (s.days < 0) parts.push(tk('home.dueForDays', { n: -s.days }));
  else if (s.days === 0) parts.push(mow ? tk('home.mowToday') : tk('home.waterToday'));
  else if (s.days === 1) parts.push(tk('contract.tomorrow'));
  else parts.push(tk('lists.when.inDays', { n: s.days }));
  if (!s.off && s.byRain) parts.push(tk('home.rainOn', { date: vtFmt(s.byRain) }));
  else if (!s.off && s.last) parts.push(tk('home.lastOn', { date: vtFmt(s.last) }));
  if (!s.off && s.hot) parts.push(tk('home.heat'));
  if (!s.off && p.smart && p.smart.auto && hsPlantSmartHit(p.smart.auto.action)) parts.push('🤖 ' + p.smart.auto.time);
  const can = hsCanEdit();
  const btns = [];
  if (can && !s.off && s.fertDue) btns.push(`<button type="button" class="hs-water-btn fert" data-hsact="plant-fert" data-id="${hsEsc(p.id)}">${tk('home.fed')}</button>`);
  const smartHit = p.smart && p.smart.start ? hsPlantSmartHit(p.smart.start) : null;
  if (can && smartHit && !s.off) btns.push(`<button type="button" class="hs-water-btn hs-smart-btn" data-hsact="plant-smart" data-id="${hsEsc(p.id)}">${hsEsc(smartHit.device.icon)} ${hsEsc(smartHit.action.label)}</button>`);
  if (can && !s.off) btns.push(`<button type="button" class="hs-water-btn${s.due && !s.wateredToday ? '' : ' done'}" data-hsact="plant-water" data-id="${hsEsc(p.id)}">${s.wateredToday ? '✓ ' : ''}${mow ? tk('home.mowed') : tk('home.watered')}</button>`);
  return `
    <div class="hs-plant${!s.off && (s.due || s.fertDue) ? ' due' : ''}"${s.off ? ' style="opacity:.6"' : ''}>
      <button type="button" class="flex items-center gap-2.5 flex-1 min-w-0 text-left" data-hsact="plant-edit" data-id="${hsEsc(p.id)}">
        <span class="hs-plant-ic">${hsEsc(p.icon || '🪴')}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${hsEsc(p.name || tk('home.plant'))}</span>
          <span class="block text-xs text-ink/55 truncate">${parts.map(x => `<span>${hsEsc(x)}</span>`).join(' · ')}</span>
        </span>
      </button>
      ${btns.length ? `<span class="flex flex-col gap-1 shrink-0">${btns.join('')}</span>` : ''}
    </div>`;
}
function hsGardenTipHtml(rain) {
  const w = hsWx();
  if (!w) return `<div class="hs-wx-tip">🌦️ <span>${tk('home.homeLocationSettingsPinn')}</span></div>`;
  const today = finTodayIso();
  const t = hsTodayWx();
  const tips = [];
  const rainDay = Object.keys(rain).filter(d => rain[d] >= 4).sort().pop();
  if (rainDay) tips.push('🌧️ ' + (rainDay === today ? tk('home.wx.rainToday', { mm: hsNum(rain[rainDay], 1) }) : tk('home.wx.rained', { mm: hsNum(rain[rainDay], 1) })));
  else if (t && Number(t.max) >= 28) tips.push('☀️ ' + tk('home.wx.hot', { t: tNum(t.max) }));
  const next3 = w.days.filter(d => d.date >= today).slice(0, 3);
  const m = Number(today.slice(5, 7));
  const minT = next3.length ? Math.min(...next3.map(d => Number(d.min)).filter(x => isFinite(x))) : null;
  if (minT != null && isFinite(minT) && minT <= 1 && [3, 4, 5, 9, 10, 11].includes(m)) tips.push('❄️ ' + tk('home.wx.frost', { t: tNum(minT) }));
  if (!rainDay && next3.length === 3 && next3.reduce((s, d) => s + (Number(d.mm) || 0), 0) < 1 && m >= 4 && m <= 9) tips.push('🌤️ ' + tk('home.wx.dry'));
  if (!tips.length) return '';
  return `<div class="hs-wx-tip flex flex-col gap-1">${tips.map(x => `<div>${hsEsc(x)}</div>`).join('')}</div>`;
}
function hsGardenHtml(h) {
  hsSmartStatusRefresh(h);
  const rain = hsRainLog();
  const plants = hsPlants(h.id).map(p => ({ p, s: hsPlantState(p, rain) })).sort((a, b) =>
    (a.s.off ? 1 : 0) - (b.s.off ? 1 : 0)
    || ((b.s.due || b.s.fertDue) ? 1 : 0) - ((a.s.due || a.s.fertDue) ? 1 : 0)
    || (a.s.days == null ? 99 : a.s.days) - (b.s.days == null ? 99 : b.s.days)
    || String(a.p.name || '').localeCompare(String(b.p.name || '')));
  const used = new Set(hsPlants(h.id).map(p => p.tpl).filter(Boolean));
  const tpls = HS_PLANT_TPL.filter(t => !used.has(t.id));
  const can = hsCanEdit();
  const plantCard = hsCard(`
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="fz-h" style="margin:0">${tk('home.plantsLawn')} <span class="text-ink/40 font-normal normal-case">${plants.length || ''}</span></div>
      ${can ? ('<button type="button" class="fz-mini-btn primary" data-hsact="plant-new">' + tk('home.custom') + '</button>') : ''}
    </div>
    ${plants.length ? `<div class="flex flex-col gap-1.5">${plants.map(x => hsPlantRowHtml(x.p, rain)).join('')}</div>` : ('<p class="text-xs text-ink/45">' + tk('home.housePlantsHerbsBalcony') + '</p>')}
    ${can && tpls.length ? `<div class="fz-h mt-4">${tk('home.templates')}</div><div class="flex flex-wrap gap-1.5">${tpls.map(t => `<button type="button" class="fz-filter-chip" data-hsact="plant-tpl" data-tpl="${t.id}">${hsEsc(t.icon + ' ' + t.name)}</button>`).join('')}</div>` : ''}`);
  const gUsed = new Set(hsMaintItems().map(m => m.tpl).filter(Boolean));
  const gTpls = HS_MAINT_TEMPLATES.filter(t => t.garden && !gUsed.has(t.tpl));
  const gList = hsMaintListHtml(false, 'garden');
  const yearCard = hsCard(`
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="fz-h" style="margin:0">${tk('home.gardenYear')}</div>
      ${can ? ('<button type="button" class="fz-mini-btn" data-hsact="maint-new-garden">' + tk('home.custom') + '</button>') : ''}
    </div>
    ${gList ? `<div class="flex flex-col gap-1.5">${gList}</div>` : ('<p class="text-xs text-ink/45">' + tk('home.trimHedgeRakeLeaves') + '</p>')}
    ${can && gTpls.length ? `<div class="flex flex-wrap gap-1.5 mt-3">${gTpls.map(t => `<button type="button" class="fz-filter-chip" data-hsact="maint-tpl" data-tpl="${t.tpl}">${hsEsc(t.icon + ' ' + t.title)}</button>`).join('')}</div>` : ''}`);
  const m = Number(finTodayIso().slice(5, 7));
  const cal = HS_GARDEN_MONTHS[m] || { s: [], p: [], e: [] };
  const col = (title, list) => list.length ? `<div class="hs-season-col"><h5>${hsEsc(title)}</h5><div class="flex flex-wrap gap-1">${list.map(x => `<span class="vt-chip muted">${hsEsc(tk(x))}</span>`).join('')}</div></div>` : '';
  const monthName = new Date(2026, m - 1, 1).toLocaleDateString(sysLocale(), { month: 'long' });
  const calCard = hsCard(`
    <div class="fz-h">${tk('home.in', { hsEsc: hsEsc(monthName) })}</div>
    <div class="flex flex-col gap-3">${col(tk('home.sow'), cal.s)}${col(tk('home.plant2'), cal.p)}${col(tk('home.harvest'), cal.e)}</div>
    <p class="text-[11px] text-ink/45 mt-2">${tk('home.guideValuesCentralEurope')}</p>`);
  return hsGardenTipHtml(rain) + plantCard + yearCard + calCard;
}
function hsOpenPlantModal(id, tplId) {
  const h = hsCurrent();
  if (!h || !hsCanEdit()) return;
  const x = id ? hsArr('homePlants').find(p => p.id === id) : null;
  const tpl = tplId ? HS_PLANT_TPL.find(t => t.id === tplId) : null;
  const d = x || (tpl ? { tpl: tpl.id, icon: tpl.icon, name: tpl.name, place: tpl.place, every: tpl.every, fertEvery: tpl.fertEvery || 0, months: tpl.months || null, rain: !!tpl.rain, act: tpl.act || 'water' }
    : { icon: '🪴', name: '', place: 'innen', every: 7, fertEvery: 0, months: null, rain: false, act: 'water' });
  hsModalState = { mode: 'plant', id: x ? x.id : null, tpl: d.tpl || '' };
  const everyOpts = [1, 2, 3, 4, 5, 7, 10, 14, 21, 30].map(n => [String(n), tk('household.everyNDays', { n })]);
  if (!everyOpts.some(o => o[0] === String(d.every))) everyOpts.push([String(d.every), tk('household.everyNDays', { n: Number(d.every) })]);
  const fertOpts = [['0', tk('home.dontFeed')], ['7', tk('home.everyWeek')], ['14', tk('fin.interval.biweekly')], ['21', tk('home.every3Weeks')], ['30', tk('home.everyMonth')], ['42', tk('home.every6Weeks')], ['60', tk('home.every2Months')]];
  const monthOpts = [['', tk('home.allYear')], ...Array.from({ length: 12 }, (_, i) => [String(i + 1), new Date(2026, i, 1).toLocaleDateString(sysLocale(), { month: 'long' })])];
  const mo = Array.isArray(d.months) && d.months.length === 2 ? d.months : ['', ''];
  const html = `
    <h3 class="font-serif text-lg mb-3 pr-6">${x ? tk('home.editPlant') : tk('home.newPlant')}</h3>
    <div class="grid gap-3" style="grid-template-columns:4.2rem minmax(0,1fr)">
      ${fzIn('hsgIcon', tk('household.icon'), d.icon || '🪴', { max: 8 })}
      ${fzIn('hsgName', tk('common.name'), d.name || '', { ph: tk('home.eGMonsteraLiving'), max: 60 })}
    </div>
    <div class="fz-grid2">
      ${fzSel('hsgPlace', tk('home.where'), HS_PLACES, d.place || 'innen')}
      ${fzSel('hsgAct', tk('school.whatNeedsDoing'), [['water', tk('home.water')], ['mow', tk('home.mowLawn')]], d.act || 'water')}
    </div>
    <div class="fz-grid2">
      ${fzSel('hsgEvery', tk('home.howOften'), everyOpts, String(d.every || 7))}
      ${fzIn('hsgLast', tk('family.lastTime'), vtIsIso(d.last) ? d.last : '', { type: 'date' })}
    </div>
    <div id="hsgFertWrap">${fzSel('hsgFert', tk('home.feedMarchSeptember'), fertOpts, String(d.fertEvery || 0))}</div>
    <label class="fz-check" id="hsgRainWrap"><input type="checkbox" id="hsgRain"${d.rain ? ' checked' : ''} /> <span>${tk('home.getsRainRainCounts')}</span></label>
    <div class="fz-grid2">
      ${fzSel('hsgFrom', tk('home.seasonFrom'), monthOpts, String(mo[0] || ''))}
      ${fzSel('hsgTo', tk('shop.to'), monthOpts, String(mo[1] || ''))}
    </div>
    ${fzIn('hsgNote', tk('fin.csv.note'), d.note || '', { ph: tk('home.optionalEGSoft'), max: 300 })}
    ${hsPlantSmartHtml(d)}
    ${hsFooter('hsPlant', !!x)}`;
  hsOpenModal(html, body => {
    const ui = () => {
      const out = ['balkon', 'garten'].includes(fzVal('hsgPlace'));
      const mow = fzVal('hsgAct') === 'mow';
      document.getElementById('hsgRainWrap').classList.toggle('hidden', !out || mow);
      document.getElementById('hsgFertWrap').classList.toggle('hidden', mow);
    };
    ['hsgPlace', 'hsgAct'].forEach(i => document.getElementById(i).addEventListener('change', ui));
    const autoSel = document.getElementById('hsgSmartAuto');
    if (autoSel) autoSel.addEventListener('change', () => document.getElementById('hsgSmartTimeWrap').classList.toggle('hidden', !autoSel.value));
    ui();
    hsWireFooter('hsPlant', hsSavePlant, () => hsDeletePlant(x.id));
  });
}
function hsSavePlant() {
  const st = hsModalState, h = hsCurrent();
  if (!st || st.mode !== 'plant' || !h) return;
  const name = fzVal('hsgName').slice(0, 60);
  if (!name) return fzShowErr('hsPlantError', tk('common.needName'));
  const existing = st.id ? hsArr('homePlants').find(p => p.id === st.id) : null;
  const from = Number(fzVal('hsgFrom')) || 0, to = Number(fzVal('hsgTo')) || 0;
  const act = fzVal('hsgAct') === 'mow' ? 'mow' : 'water';
  const place = HS_PLACES.some(x => x[0] === fzVal('hsgPlace')) ? fzVal('hsgPlace') : 'innen';
  hsUpsert('homePlants', {
    ...(existing || {}),
    id: existing ? existing.id : 'pl' + newRecordId().slice(0, 12), home: existing ? existing.home : h.id, tpl: st.tpl || '',
    name, icon: (fzVal('hsgIcon') || '🪴').slice(0, 8), place, act,
    every: Math.max(1, Number(fzVal('hsgEvery')) || 7), fertEvery: act === 'mow' ? 0 : (Number(fzVal('hsgFert')) || 0),
    rain: act !== 'mow' && place !== 'innen' && fzChecked('hsgRain'),
    months: from && to ? [from, to] : null,
    last: vtIsIso(fzVal('hsgLast')) ? fzVal('hsgLast') : '', lastFert: (existing && existing.lastFert) || '',
    note: fzVal('hsgNote').slice(0, 300), created: (existing && existing.created) || finTodayIso(),
    smart: hsPlantSmartValue(act),
  });
  hsCloseModal();
  hsAfterChange();
}
function hsDeletePlant(id) {
  const x = hsArr('homePlants').find(p => p.id === id);
  if (!x || !confirm(tk('lists.item.confirmDelete', { name: x.name || tk('home.plant') }))) return;
  hsSet('homePlants', hsArr('homePlants').filter(p => p.id !== id));
  hsCloseModal();
  hsAfterChange();
}
function hsPlantTick(id, fert) {
  if (!hsCanEdit()) return;
  const x = hsArr('homePlants').find(p => p.id === id);
  if (!x) return;
  const today = finTodayIso();
  if (!fert && x.last === today) {
    if (!confirm(x.act === 'mow' ? tk('home.notMowedTodayAfter') : tk('home.notWateredTodayAfter'))) return;
    hsUpsert('homePlants', { ...x, last: x.prevLast || '', prevLast: '' });
  } else if (fert) {
    hsUpsert('homePlants', { ...x, lastFert: today });
  } else {
    hsUpsert('homePlants', { ...x, prevLast: x.last || '', last: today });
  }
  hsAfterChange();
  finShowToast(fert ? tk('home.fed2') : (x.last === today ? tk('home.undone') : (x.act === 'mow' ? tk('home.mowed2') : tk('home.watered2'))));
}

/* ---------- Plants & smart home (1.62) ---------- */
function hsPlantSmartHit(id) {
  try { return id ? smartActionById(id) : null; } catch (e) { return null; }
}
function hsPlantSmartHtml(d) {
  let all = [];
  try { all = smartAllActions(); } catch (e) { all = []; }
  if (!all.length) return '';
  const sm = d.smart || {};
  const auto = sm.auto || null;
  const mow = d.act === 'mow';
  const opts = (sel) => '<option value="">–</option>' + all.map(({ device, action }) =>
    `<option value="${hsEsc(action.id)}"${action.id === sel ? ' selected' : ''}>${hsEsc(device.icon + ' ' + device.name + ': ' + action.label)}</option>`).join('');
  const time = auto && /^\d{2}:\d{2}$/.test(auto.time || '') ? auto.time : (mow ? '10:00' : '06:00');
  return `
    <div class="fz-h mt-2">${tk('home.smartHome')}</div>
    <div class="fz-field"><label class="fz-lbl" for="hsgSmartStart">${tk('home.startButton')}</label><select id="hsgSmartStart" class="fz-in">${opts(sm.start || '')}</select></div>
    <div class="fz-field"><label class="fz-lbl" for="hsgSmartAuto">${tk('home.startAutomaticallyWhenDue')}</label>
      <div class="flex items-center gap-2"><select id="hsgSmartAuto" class="fz-in flex-1">${opts(auto ? auto.action : '')}</select>
      <span id="hsgSmartTimeWrap" class="${auto ? '' : 'hidden'} shrink-0"><input id="hsgSmartTime" type="time" value="${hsEsc(time)}" class="fz-in" style="width:7.5rem" aria-label="${escapeHtml(tk('event.time'))}" /></span></div></div>
    <p class="text-[11px] text-ink/45 -mt-1 mb-3">${tk('home.eGRobotMower')}</p>`;
}
function hsPlantSmartValue(act) {
  const start = document.getElementById('hsgSmartStart');
  const auto = document.getElementById('hsgSmartAuto');
  if (!start || !auto) return undefined;
  const out = {};
  if (start.value && hsPlantSmartHit(start.value)) out.start = start.value;
  if (auto.value && hsPlantSmartHit(auto.value)) {
    const t = (document.getElementById('hsgSmartTime') || {}).value || '';
    out.auto = { action: auto.value, time: /^\d{2}:\d{2}$/.test(t) ? t : (act === 'mow' ? '10:00' : '06:00') };
  }
  return out.start || out.auto ? out : undefined;
}
// Button at the plant: start the device; afterwards the plant counts as watered/mowed today
async function hsPlantSmartRun(id) {
  if (!hsCanEdit()) return;
  const p = hsArr('homePlants').find(x => x.id === id);
  const hit = p && p.smart ? hsPlantSmartHit(p.smart.start) : null;
  if (!hit || !smartCanRun(hit, false)) return;
  const done = () => {
    const today = finTodayIso();
    const cur = hsArr('homePlants').find(x => x.id === id);
    if (cur && cur.last !== today) hsUpsert('homePlants', { ...cur, prevLast: cur.last || '', last: today });
    hsAfterChange();
  };
  if (smartSystem(hit.device) === 'ha') {
    try {
      const res = await apiFetch('/api/pinn/smart/ha/ausfuehren', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantId: id, actionId: hit.action.id, art: 'start' }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || r.error) throw new Error(r.error || tk('smart.serverNoAnswer'));
      if (r.eingereiht) {
        showSmartBar({ title: tk('home.smart.queued', { icon: hit.device.icon, name: hit.action.label }), text: tk('home.stillBusyStartsAutomatically', { name: hit.device.name }), ms: 8000 });
        return;
      }
      done();
      finShowToast(tk('home.smart.started', { icon: hit.device.icon, name: hit.action.label }));
    } catch (err) {
      alert((tk('home.homeAssistant') + ' ') + err.message);
    }
    return;
  }
  done();
  runSmartShortcut(hit.action, p.name || '');
}
// Plants watered/mowed automatically by the server (from /api/pinn/smart/status)
function hsSmartMergePlants(st) {
  const map = st && st.pflanzen && typeof st.pflanzen === 'object' ? st.pflanzen : null;
  if (!map) return;
  const today = finTodayIso();
  let changed = false;
  hsArr('homePlants').forEach(p => {
    const d = map[p.id];
    if (!vtIsIso(d) || d > today || (vtIsIso(p.last) && p.last >= d)) return;
    hsUpsert('homePlants', { ...p, prevLast: p.last || '', last: d });
    changed = true;
  });
  if (changed) hsAfterChange();
}
// Remove links to deleted smart home actions
function hsStripSmartRefs() {
  let changed = false;
  const list = hsArr('homePlants').map(p => {
    if (!p.smart) return p;
    const start = hsPlantSmartHit(p.smart.start) ? p.smart.start : '';
    const auto = p.smart.auto && hsPlantSmartHit(p.smart.auto.action) ? p.smart.auto : null;
    if (start === (p.smart.start || '') && auto === (p.smart.auto || null)) return p;
    changed = true;
    const smart = {};
    if (start) smart.start = start;
    if (auto) smart.auto = auto;
    const c = { ...p };
    if (smart.start || smart.auto) c.smart = smart; else delete c.smart;
    return c;
  });
  if (changed) hsSet('homePlants', list);
}
// Fetch what the server started (at most every 5 minutes, only with linked plants)
let hsSmartStatusAt = 0;
function hsSmartStatusRefresh(h) {
  if (Date.now() - hsSmartStatusAt < 5 * 60 * 1000) return;
  let has = false;
  try { has = smartDevices.length > 0 && hsPlants(h.id).some(p => p.smart); } catch (e) { has = false; }
  if (!has) return;
  hsSmartStatusAt = Date.now();
  setTimeout(() => { try { loadSmartStatus(); } catch (e) { /* ignore */ } }, 0);
}

/* ---------- Overview ---------- */
function hsDueItems(h) {
  const today = finTodayIso();
  const out = [];
  const defects = hsDefects(h.id).filter(d => d.status !== 'behoben');
  defects.filter(d => vtIsIso(d.deadline) && d.deadline < today && d.status === 'gemeldet').forEach(d => out.push({ tone: 'urgent', icon: '⚠️', title: d.title || tk('home.defect2'), sub: tk('home.deadlineRepairHasPassed'), when: vtFmt(d.deadline), act: 'defect-edit', id: d.id }));
  const urgent = defects.filter(d => d.severity === 'gross' && d.status === 'offen');
  urgent.forEach(d => out.push({ tone: 'warn', icon: '🛠️', title: d.title || tk('home.defect2'), sub: hsOwn(h) ? tk('home.urgent') : tk('home.urgentNotReportedYet'), when: '', act: 'defect-edit', id: d.id }));
  hsMaintItems().filter(m => m.active !== false).forEach(m => {
    const next = hsMaintNext(m);
    const days = vtDiffDays(today, next);
    if (days <= 14) { const t = hsMaintDueTone(next); out.push({ tone: t.tone || 'warn', icon: m.icon || '🔧', title: m.title, sub: hsMaintIsMeter(m) ? tk('home.tapEnter') : tk('home.maintenance2'), when: t.label, act: 'maint-due', id: m.id }); }
  });
  hsMeters(h.id).filter(m => m.active !== false).forEach(m => {
    const rs = hsReadings(m.id);
    const last = rs.length ? rs[rs.length - 1].date : '';
    if (!last || vtDiffDays(last, today) > 40) out.push({ tone: 'muted', icon: hsMeterType(m.type).icon, title: tk('home.readingOf', { name: m.name || hsMeterType(m.type).label }), sub: last ? tk('home.lastOnDate', { date: vtFmt(last) }) : tk('home.noReadingYet'), when: '', act: 'reading-new', id: m.id });
  });
  if (!hsOwn(h)) {
    const nk = hsLogs(h.id).filter(l => l.type === 'nebenkosten').map(l => l.date).sort().pop();
    if (vtIsIso(h.moveIn) && vtDiffDays(h.moveIn, today) > 450 && (!nk || vtDiffDays(nk, today) > 450)) out.push({ tone: 'muted', icon: '🧾', title: tk('home.addServiceChargeStatement'), sub: tk('home.landlordsHave12Months'), when: '', act: 'log-new', type: 'nebenkosten' });
    const r = h.rent || {};
    if (vtIsIso(h.moveOut) && Number(r.deposit) > 0 && !vtIsIso(r.depositBack)) out.push({ tone: 'warn', icon: '💰', title: tk('home.depositNotReturnedYet'), sub: tk('home.movedOutOn', { date: vtFmt(h.moveOut) }), when: '', act: 'home-edit' });
  } else {
    const loan = hsLoan(h);
    if (loan && vtIsIso(loan.l.fixedUntil)) {
      const days = vtDiffDays(today, loan.l.fixedUntil);
      if (days >= 0 && days <= 730) out.push({ tone: days <= 365 ? 'warn' : 'muted', icon: '🏦', title: tk('home.fixedInterestPeriodEnds'), sub: tk('home.compareFollowUpFinancing'), when: vtFmt(loan.l.fixedUntil), act: 'home-edit' });
    }
  }
  if (hsLet(h) && !hsIsArchived(h)) {
    const t = h.tenant || {}, r = h.rent || {};
    const since = vtIsIso(t.since) ? t.since : '';
    const base = [r.lastIncrease, since].filter(vtIsIso).sort().pop();
    if (base && r.kind !== 'staffel' && r.kind !== 'index' && vtDiffDays(base, today) >= 456) out.push({ tone: 'muted', icon: '📈', title: tk('home.rentIncreasePossible'), sub: tk('home.lastChangeMoreThan'), when: '', act: 'home-edit' });
    const nk = hsLogs(h.id).filter(l => l.type === 'nebenkosten').map(l => l.date).sort().pop();
    if (since && vtDiffDays(since, today) > 400 && (!nk || vtDiffDays(nk, today) > 400)) out.push({ tone: 'warn', icon: '🧾', title: tk('home.serviceChargeStatementTenant'), sub: tk('home.latest12MonthsAfter'), when: '', act: 'log-new', type: 'nebenkosten' });
  }
  // Only plants that are really due (plants out of season are paused and never listed); the text names them
  // and the jobs that are actually due instead of a fixed "watering, mowing or fertilising"
  const pd = hsPlantsDue(h);
  if (pd.length) out.unshift(hsPlantsDueItem(pd));
  return out.slice(0, 12);
}
// "Im Blick" entry for the due plants: names and the jobs due today (watering, mowing, fertilising)
function hsPlantsDueItem(pd) {
  const rain = hsRainLog();
  const jobs = [];
  const add = j => { if (!jobs.includes(j)) jobs.push(j); };
  pd.forEach(p => {
    const s = hsPlantState(p, rain);
    if (s.due) add(p.act === 'mow' ? 'mow' : 'water');
    if (s.fertDue) add('feed');
  });
  const names = pd.map(p => p.name || tk('home.plant'));
  // Fixed order and whole sentences, so the language files can translate them as they are
  const order = ['water', 'mow', 'feed'].filter(j => jobs.includes(j));
  const jobName = j => j === 'water' ? tk('home.job.water') : j === 'mow' ? tk('home.job.mow') : tk('home.job.feed');
  const jobText = order.length === 1 ? tk('home.job.dueOne', { job: jobName(order[0]) })
    : tk('home.job.dueMany', { jobs: order.slice(0, -1).map(jobName).join(', '), last: jobName(order[order.length - 1]) });
  return {
    tone: 'warn', icon: pd.length === 1 ? (pd[0].icon || '🪴') : (order.length === 1 && order[0] === 'mow' ? '✂️' : '💧'),
    title: pd.length === 1 ? names[0] : names.join(', '),
    sub: order.length ? jobText : '', when: pd.length > 1 ? String(pd.length) : '', act: 'tab', tab: 'garten',
  };
}
function hsDueRowHtml(it) {
  return `
    <div class="fz-due-row ${hsEsc(it.tone)}" role="button" tabindex="0" data-hsact="${hsEsc(it.act)}" data-id="${hsEsc(it.id || '')}" data-tab="${hsEsc(it.tab || '')}" data-type="${hsEsc(it.type || '')}">
      <span class="fz-due-ic">${hsEsc(it.icon || '🔔')}</span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-medium truncate">${hsEsc(it.title)}</span>
        <span class="block text-xs text-ink/55 truncate">${hsEsc(it.sub || '')}</span>
      </span>
      ${it.when ? `<span class="vt-chip ${hsEsc(it.tone === 'muted' ? '' : it.tone)}">${hsEsc(it.when)}</span>` : ''}
    </div>`;
}
function hsOverviewHtml(h) {
  const today = finTodayIso();
  const own = hsOwn(h);
  const arch = hsIsArchived(h);
  const type = (HS_TYPES.find(t => t[0] === h.type) || HS_TYPES[0])[1];
  const heat = (HS_HEATING.find(t => t[0] === h.heating) || ['', ''])[1];
  const hero = `
    <div class="fz-hero" style="--fz:${hsColor(h)}">
      ${hsSceneHtml(h)}
      <div class="fz-hero-icon"><span>${hsEsc(hsHeroIcon(h))}</span></div>
      <div class="fz-hero-body">
        <h3 class="font-serif text-xl leading-tight truncate">${hsEsc(hsName(h))}</h3>
        <div class="text-xs text-ink/50 truncate">${hsEsc(h.address || type)}</div>
        <div class="flex items-center gap-1.5 flex-wrap mt-2">
          <span class="vt-chip">${hsEsc(HS_MODES[hsMode(h)].label)}</span>
          <span class="vt-chip muted">${hsEsc(type)}</span>
          ${Number(h.area) > 0 ? `<span class="vt-chip muted">${hsEsc(hsNum(h.area, 0))} m²</span>` : ''}
          ${vtIsIso(h.moveIn) && !arch ? `<span class="vt-chip muted">${hsEsc(tk('home.sinceDate', { date: vtFmt(h.moveIn) }))}</span>` : ''}
          ${heat && heat !== '–' ? `<span class="vt-chip muted">♨️ ${hsEsc(heat)}</span>` : ''}
          ${arch ? `<span class="vt-chip warn">${hsEsc(tk('home.movedOutOn', { date: vtFmt(h.moveOut) }))}</span>` : ''}
        </div>
        ${hsCanEdit() ? `<div class="flex gap-2 mt-3">${hsHeroActionsHtml(h)}</div>` : ''}
      </div>
    </div>`;

  const due = hsDueItems(h);
  const dueHtml = due.length ? `
    <div class="rounded-2xl border border-mustard/40 bg-mustard/10 p-4">
      <div class="text-sm font-medium mb-2">${tk('home.glance')}</div>
      <div class="flex flex-col gap-1.5">${due.map(hsDueRowHtml).join('')}</div>
    </div>` : '';

  // Key figures
  const monthly = hsMonthlyCost(h);
  const area = Number(h.area) || 0;
  const tiles = [];
  if (hsLet(h)) {
    const inc = hsIncomeMonthly(h);
    const loan = hsLoan(h);
    const price = (Number(h.own && h.own.price) || 0) + hsBuySideCosts(h);
    const cold = hsFixAmount(h, 'let_rent') * 12;
    const net = inc - monthly;
    tiles.push(fzTile(tk('home.rentalIncomeMonth'), inc > 0 ? fmtEur(inc) : '–', hsFixAmount(h, 'let_rent') > 0 ? (tk('home.basic') + ' ') + fmtEur(hsFixAmount(h, 'let_rent')) : (inc > 0 ? '' : tk('home.rentUnderEdit'))));
    tiles.push(fzTile(tk('home.surplusMonth'), inc > 0 || monthly > 0 ? (net < 0 ? '− ' : '') + fmtEur(Math.abs(net)) : '–', tk('home.incomeMinusRunningCosts')));
    tiles.push(fzTile(tk('home.grossYield'), price > 0 && cold > 0 ? hsNum(cold / price * 100, 1) + ' %' : '–', price > 0 ? tk('home.annualBaseRentPurchase') : tk('home.enterPurchasePrice')));
    tiles.push(fzTile(tk('home.remainingDebt'), loan ? fmtEur0(loan.rest) : '–', loan && loan.M > 0 ? tk('home.instalmentPerMonth', { amount: fmtEur(loan.M) }) : tk('home.loanUnderEdit')));
  } else {
  tiles.push(fzTile(tk('home.housingCostsMonth'), monthly > 0 ? fmtEur(monthly) : '–', monthly > 0 ? tk('home.runningFixedCostsContracts') : tk('home.fixedCostsUnderEdit')));
  if (own) {
    const loan = hsLoan(h);
    const price = Number(h.own && h.own.price) || 0;
    tiles.push(fzTile(tk('home.remainingDebt'), loan ? fmtEur0(loan.rest) : '–', loan && loan.M > 0 ? tk('home.instalmentPerMonth', { amount: fmtEur(loan.M) }) : tk('home.loanUnderEdit')));
    tiles.push(fzTile(tk('home.purchasePrice'), price > 0 ? fmtEur0(price) : '–', hsBuySideCosts(h) > 0 ? tk('home.plusSideCosts', { amount: fmtEur0(hsBuySideCosts(h)) }) : ''));
    tiles.push(fzTile(tk('home.perM2'), area > 0 && price > 0 ? fmtEur0(price / area) : '–', area > 0 ? hsNum(area, 0) + ' m²' : tk('home.enterLivingSpace')));
  } else {
    const warm = hsWarmRent(h);
    const dep = Number(h.rent && h.rent.deposit) || 0;
    tiles.push(fzTile(tk('home.rentInclUtilities'), warm > 0 ? fmtEur(warm) : '–', hsFixAmount(h, 'rent') > 0 ? (tk('home.basic') + ' ') + fmtEur(hsFixAmount(h, 'rent')) : ''));
    tiles.push(fzTile(tk('home.perM2'), area > 0 && hsFixAmount(h, 'rent') > 0 ? fmtEur(hsFixAmount(h, 'rent') / area) : '–', area > 0 ? (tk('home.basic2') + ' ') + hsNum(area, 0) + ' m²' : tk('home.enterLivingSpace')));
    tiles.push(fzTile(tk('home.deposit'), dep > 0 ? fmtEur(dep) : '–', dep > 0 ? (vtIsIso(h.rent.depositBack) ? tk('home.backOn', { date: vtFmt(h.rent.depositBack) }) : (vtIsIso(h.rent.depositPaid) ? tk('home.paidOn', { date: vtFmt(h.rent.depositPaid) }) : tk('home.enterPayment'))) : ''));
  }
  }
  const tilesHtml = `<div class="vt-tiles">${tiles.join('')}</div>`; // 1.62: wraps instead of overflowing on small phones

  // Contract
  const rows = [];
  const lord = h.landlord || {};
  const contact = [lord.phone ? `<a class="hover:text-pine" href="tel:${hsEsc(String(lord.phone).replace(/[^\d+]/g, ''))}">${hsEsc(lord.phone)}</a>` : '', lord.email ? `<a class="hover:text-pine" href="mailto:${hsEsc(lord.email)}">${hsEsc(lord.email)}</a>` : ''].filter(Boolean).join('<br>');
  if (!own) {
    const r = h.rent || {};
    rows.push(hsRow(tk('home.landlord'), hsEsc(lord.name || '')));
    rows.push(hsRow(tk('home.contact'), contact));
    rows.push(hsRow(tk('home.tenancyStart'), vtIsIso(h.moveIn) ? hsEsc(vtFmt(h.moveIn) + ' · ' + hsDuration(h.moveIn)) : ''));
    HS_FIX.filter(d => d.mode === 'miete').forEach(d => rows.push(hsRow(d.label, hsFixAmount(h, d.key) > 0 ? hsEsc(fmtEur(hsFixAmount(h, d.key))) : '')));
    rows.push(hsRow(tk('home.rentType'), r.kind === 'staffel' ? hsEsc(tk('home.graduatedRent')) : r.kind === 'index' ? hsEsc(tk('home.indexLinkedRent')) : ''));
    rows.push(hsRow(tk('home.lastIncrease'), vtIsIso(r.lastIncrease) ? hsEsc(vtFmt(r.lastIncrease)) : ''));
    rows.push(hsRow(tk('contract.noticePeriod'), hsEsc(tk('contract.monthsN', { n: Number(r.notice) || 3 }))));
    rows.push(hsRow(tk('home.depositHeld'), hsEsc(r.depositWhere || '')));
    if (vtIsIso(h.moveOut)) rows.push(hsRow(tk('home.depositReturned'), vtIsIso(r.depositBack) ? hsEsc(vtFmt(r.depositBack) + (Number(r.depositBackAmount) > 0 ? ' · ' + fmtEur(r.depositBackAmount) : '')) : hsEsc(tk('home.stillOpen'))));
  } else {
    const o = h.own || {};
    const loan = hsLoan(h);
    rows.push(hsRow(tk('pdf.field.purchaseDate'), vtIsIso(o.date) ? hsEsc(vtFmt(o.date)) : ''));
    rows.push(hsRow(tk('home.purchasePrice'), Number(o.price) > 0 ? hsEsc(fmtEur(o.price)) : ''));
    rows.push(hsRow(tk('home.landTransferTax'), Number(o.landTax) > 0 ? hsEsc(fmtEur(o.landTax)) : ''));
    rows.push(hsRow(tk('home.notaryLandRegistry'), Number(o.notary) > 0 ? hsEsc(fmtEur(o.notary)) : ''));
    rows.push(hsRow(tk('home.estateAgent'), Number(o.broker) > 0 ? hsEsc(fmtEur(o.broker)) : ''));
    if (loan) {
      rows.push(hsRow(tk('home.loan'), hsEsc([loan.l.bank, fmtEur0(loan.P), loan.i > 0 ? hsNum(loan.i * 100, 2) + (' ' + tk('home.interest')) : ''].filter(Boolean).join(' · '))));
      rows.push(hsRow(tk('home.instalment'), loan.M > 0 ? hsEsc(tk('home.amountPerMonth', { amount: fmtEur(loan.M) })) : ''));
      rows.push(hsRow(tk('home.remainingDebtToday'), hsEsc('≈ ' + fmtEur0(loan.rest))));
      rows.push(hsRow(tk('home.interestYear'), loan.interestYear > 0 ? hsEsc('≈ ' + fmtEur0(loan.interestYear)) : ''));
      rows.push(hsRow(tk('home.fixedInterestUntil'), vtIsIso(loan.l.fixedUntil) ? hsEsc(vtFmt(loan.l.fixedUntil) + (loan.restAtFix != null ? ' · ' + tk('home.restApprox', { amount: fmtEur0(loan.restAtFix) }) : '')) : ''));
      rows.push(hsRow(tk('home.debtFree'), loan.endMonths && vtIsIso(loan.l.start) ? hsEsc('≈ ' + vtFmt(vtAddMonths(loan.l.start, loan.endMonths, false)).slice(3)) : ''));
    }
    HS_FIX.filter(d => d.mode === 'eigentum' && d.key !== 'loan').forEach(d => rows.push(hsRow(d.label, hsFixAmount(h, d.key) > 0 ? hsEsc(fmtEur(hsFixAmount(h, d.key)) + ' ' + vtIntervalLabel(d.interval)) : '')));
    rows.push(hsRow(tk('home.propertyManagement'), hsEsc(lord.name || '')));
    rows.push(hsRow(tk('home.contact'), contact));
  }
  const vertrag = hsCard(`
    <div class="flex items-center justify-between gap-2 mb-1">
      <div class="fz-h" style="margin:0">${own ? tk('home.purchaseFinancing') : tk('home.tenancyAgreement')}</div>
      ${hsCanEdit() ? ('<button type="button" class="fz-mini-btn" data-hsact="home-edit">' + tk('home.edit') + '</button>') : ''}
    </div>
    ${rows.join('') || `<p class="text-xs text-ink/45">${own ? tk('home.enterPurchasePriceAdditional') : tk('home.enterLandlordRentDeposit')}</p>`}
    ${!own && !arch ? ('<p class="vt-info mt-3">' + tk('home.tipWhenMovingRecord') + '</p>') : ''}`);

  // Contracts & fixed costs
  const contracts = hsContractsFor(h.id);
  const cRows = contracts.map(c => {
    const vw = vtStatusView(c, today);
    const cost = vtCost(c, today);
    const cat = vtCategory(c.category);
    return `
      <button type="button" class="fz-log-row" data-hsact="contract" data-id="${hsEsc(c.id)}">
        <span class="fz-log-ic" style="background:${vtCatColor(cat)}22">${hsEsc(cat.icon || '📄')}</span>
        <span class="flex-1 min-w-0"><span class="block text-sm font-medium truncate">${hsEsc(c.name || tk('contract.docType.doc'))}</span><span class="block text-xs text-ink/45 truncate">${hsEsc([c.provider, vw.label].filter(Boolean).join(' · '))}</span></span>
        <span class="shrink-0 text-right">${cost ? `<span class="block text-sm font-semibold">${hsEsc(fmtEur(cost.amount))}</span><span class="block text-[11px] text-ink/45">${hsEsc(vtIntervalLabel(cost.interval))}</span>` : ('<span class="block text-[11px] text-ink/40">' + tk('home.withoutCosts') + '</span>')}</span>
      </button>`;
  }).join('');
  const fixRows = hsRecurringFor(h.id).map(r => `<div class="vt-row"><span>${hsEsc(r.title || tk('home.fixedCosts'))}</span><span>${hsEsc(fmtEur(finRecurringAmountFor(r, today)) + ' ' + vtIntervalLabel(finRecInterval(r)))}${finRecIsRunning(r, today) ? '' : ' · ' + hsEsc(tk('contract.endedLower'))}</span></div>`).join('');
  const vertraege = hsCard(`
    <div class="flex items-center justify-between gap-2 mb-1">
      <div class="fz-h" style="margin:0">${tk('home.contractsFixedCosts')}</div>
      ${hsCanEdit() && !arch ? ('<span class="flex gap-1.5"><button type="button" class="fz-mini-btn" data-hsact="contract-assign">' + tk('home.assign') + '</button><button type="button" class="fz-mini-btn primary" data-hsact="contract-new">' + tk('school.new') + '</button></span>') : ''}
    </div>
    ${cRows ? `<div class="flex flex-col">${cRows}</div>` : ('<p class="text-xs text-ink/45">' + tk('home.assignElectricityGasInternet') + '</p>')}
    ${fixRows ? `<div class="mt-2">${fixRows}</div>` : ''}`);

  // Documents
  const docKey = x => (vtIsIso(x.datum) ? x.datum : String(x.created || '').slice(0, 10)) || '';
  const linked = (Array.isArray(h.docLinks) ? h.docLinks : []).map(id => docById(id)).filter(Boolean)
    .sort((a, b) => docKey(b).localeCompare(docKey(a)));
  const docTypes = hsDocTypesFor(h);
  const dokumente = hsCard(`
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="fz-h" style="margin:0">${tk('contract.documents')} <span class="text-ink/40 font-normal normal-case">${linked.length || ''}</span></div>
    </div>
    ${hsCanEdit() ? `<div class="flex items-center gap-2 mb-2">
      <select id="hsDocTypeSelect" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2 py-1.5 text-xs bg-white" aria-label="${escapeHtml(tk('contract.typeDocument'))}">${docTypes.map(t => `<option value="${t.id}">${hsEsc(t.icon + ' ' + t.label)}</option>`).join('')}</select>
      <button type="button" class="shrink-0 px-3 py-1.5 rounded-lg bg-pine text-white text-xs font-medium hover:bg-pine/90 transition whitespace-nowrap" data-hsact="doc-add">${tk('contract.upload')}</button>
    </div>` : ''}
    <div class="flex flex-col gap-1.5">${linked.map(hsDocRowHtml).join('') || ('<p class="text-xs text-ink/40 italic">' + tk('home.tenancyAgreementPurchaseContract') + '</p>')}</div>
    ${hsCanEdit() ? ('<button type="button" class="mt-2 text-xs text-ink/55 hover:text-pine" data-hsact="doc-link">' + tk('home.linkExistingFromDocuments') + '</button>') : ''}`);

  // Data
  const drows = [];
  drows.push(hsRow(tk('smart.haAddress'), hsEsc(h.address || '')));
  drows.push(hsRow(h.type === 'garage' ? tk('home.area') : tk('home.livingSpace'), Number(h.area) > 0 ? hsEsc(hsNum(h.area, 1) + ' m²') : ''));
  drows.push(hsRow(tk('home.rooms'), Number(h.rooms) > 0 ? hsEsc(hsNum(h.rooms, 1)) : ''));
  drows.push(hsRow(tk('home.peopleHousehold'), Number(h.persons) > 0 ? hsEsc(String(h.persons)) : ''));
  drows.push(hsRow(tk('home.yearManufacture'), Number(h.built) > 0 ? hsEsc(String(h.built)) : ''));
  drows.push(hsRow(tk('home.heating'), heat && heat !== '–' ? hsEsc(heat) : ''));
  const daten = hsCard(`
    <div class="fz-h">${tk('home.data')}</div>
    ${drows.join('') || ('<p class="text-xs text-ink/45">' + tk('home.addLivingSpaceRooms') + '</p>')}
    ${h.note ? `<p class="text-sm text-ink/70 mt-3" style="white-space:pre-line">${hsEsc(h.note)}</p>` : ''}
    ${hsCanEdit() ? `<div class="flex flex-wrap gap-2 mt-4">
      <button type="button" class="fz-mini-btn" data-hsact="home-edit">${tk('home.edit')}</button>
      <button type="button" class="fz-mini-btn" data-hsact="home-new" data-mode="${hsLet(h) ? 'vermietet' : hsOwn(h) ? 'miete' : 'eigentum'}">${tk('home.anotherHome')}</button>
    </div>` : ''}`);

  return hero + dueHtml + tilesHtml + (hsLet(h) ? hsTenantCardHtml(h) : '') + vertrag + vertraege + hsKeysCardHtml(h) + dokumente + daten + hsModulesCardHtml(h);
}
function hsDocRowHtml(x) {
  const today = finTodayIso();
  const cat = docCategory(x.kategorie);
  const dl = docDeadline(x, today);
  const meta = [cat.label, vtIsIso(x.datum) ? vtFmt(x.datum) : '', x.aussteller].filter(Boolean).join(' · ');
  const chips = [];
  if (dl) chips.push(`<span class="vt-chip ${dl.tone}">${hsEsc(dl.label)}</span>`);
  if (x.betrag > 0) chips.push(`<span class="text-[11px] text-ink/45">${hsEsc(fmtEur(x.betrag))}</span>`);
  if (x.pending) chips.push(`<span class="vt-chip muted">${navigator.onLine ? tk('home.transferring') : tk('home.willSubmitted')}</span>`);
  return `
    <button type="button" class="fin-doc-row flex items-center gap-2.5 rounded-xl border border-ink/10 px-2.5 py-2 text-left w-full" data-hsact="doc-open" data-id="${hsEsc(x.id)}">
      <span class="text-xl leading-none shrink-0">${hsEsc(cat.icon || '🗂️')}</span>
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-medium truncate">${hsEsc(x.titel || tk('search.type.doc'))}</span>
        <span class="block text-[11px] text-ink/45 truncate">${hsEsc(meta)}</span>
        ${chips.length ? `<span class="flex items-center gap-1.5 mt-1 flex-wrap">${chips.join('')}</span>` : ''}
      </span>
      <span class="shrink-0 text-ink/30 text-sm">›</span>
    </button>`;
}
function hsDocsOf(obj) { return (obj && Array.isArray(obj.docLinks) ? obj.docLinks : []).map(id => docById(id)).filter(Boolean); }

/* ---------- Defects ---------- */
function hsDefectsHtml(h) {
  const list = hsDefects(h.id).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const open = list.filter(d => d.status !== 'behoben');
  const done = list.filter(d => d.status === 'behoben');
  const moveIn = list.filter(d => d.moveIn);
  const sevIcon = { klein: '🟢', mittel: '🟡', gross: '🔴' };
  const row = d => {
    const st = (HS_DEFECT_STATUS.find(s => s[0] === d.status) || HS_DEFECT_STATUS[0])[1];
    const nDocs = hsDocsOf(d).length;
    const overdue = d.status === 'gemeldet' && vtIsIso(d.deadline) && d.deadline < finTodayIso();
    return `
      <button type="button" class="fz-log-row" data-hsact="defect-edit" data-id="${hsEsc(d.id)}">
        <span class="fz-log-ic">${sevIcon[d.severity] || '🟡'}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${hsEsc(d.title || tk('home.defect2'))}${nDocs ? ' <span class="text-xs text-ink/45">📷 ' + nDocs + '</span>' : ''}</span>
          <span class="block text-xs text-ink/45 truncate">${hsEsc([d.room, vtIsIso(d.date) ? vtFmt(d.date) : '', d.moveIn ? tk('home.presentWhenMoving') : ''].filter(Boolean).join(' · '))}</span>
        </span>
        <span class="shrink-0 flex flex-col items-end gap-1">
          <span class="vt-chip ${d.status === 'behoben' ? 'muted' : (overdue ? 'urgent' : (d.status === 'gemeldet' ? '' : 'warn'))}">${hsEsc(st)}</span>
          ${d.status === 'gemeldet' && vtIsIso(d.deadline) ? `<span class="text-[10px] text-ink/45">${hsEsc((tk('school.deadline') + ' ') + vtFmt(d.deadline))}</span>` : ''}
        </span>
      </button>`;
  };
  const canLetter = !hsOwn(h) && open.length && hsCanEdit();
  const head = hsCard(`
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="text-[11px] uppercase tracking-wide text-ink/40">${tk('home.openDefects')}</div>
        <div class="font-serif text-2xl">${open.length}</div>
        <div class="text-xs text-ink/50">${hsEsc(tk('home.defectsFixed', { n: done.length }) + ' · ' + tk('home.defectsMoveIn', { n: moveIn.length }))}</div>
      </div>
      <div class="flex flex-col gap-1.5 shrink-0">
        ${hsCanEdit() ? ('<button type="button" class="fz-mini-btn primary" data-hsact="defect-new">' + tk('home.defect') + '</button>') : ''}
        ${canLetter ? ('<button type="button" class="fz-mini-btn" data-hsact="defect-letter">' + tk('home.defectNotice') + '</button>') : ''}
      </div>
    </div>
    ${!hsOwn(h) ? ('<p class="vt-info mt-3">' + tk('home.alwaysReportDefectsWriting') + '</p>') : ''}`);
  const openHtml = hsCard(`
    <div class="fz-h">${tk('home.openReported')}</div>
    ${open.length ? `<div class="flex flex-col">${open.map(row).join('')}</div>` : ('<p class="text-xs text-ink/45">' + tk('home.noOpenDefectsGreat') + '</p>')}`);
  const doneHtml = done.length ? `
    <details class="vt-more rounded-2xl bg-white border border-ink/10 shadow-sm px-4 py-3"${hsDefectShowDone ? ' open' : ''} data-hsdetails="defects">
      <summary class="text-sm cursor-pointer select-none">${hsEsc(tk('home.fixedCount', { n: done.length }))}</summary>
      <div class="flex flex-col mt-2">${done.map(row).join('')}</div>
    </details>` : '';
  return head + openHtml + doneHtml;
}

/* ---------- Costs & renovation ---------- */
function hsCostsHtml(h) {
  const y = hsYear;
  const s = y + '-01-01', e = y + '-12-31';
  const items = hsCostItems(h, s, e);
  const groups = {};
  let total = 0;
  items.forEach(it => { groups[it.group] = (groups[it.group] || 0) + it.amount; total += it.amount; });
  const gRows = HS_GROUPS.map(g => ({ g, val: groups[g.id] || 0 })).filter(x => Math.abs(x.val) > 0.004).sort((a, b) => b.val - a.val);
  const maxG = gRows.length ? Math.max(...gRows.map(x => Math.abs(x.val))) : 0;
  const area = Number(h.area) || 0;
  const labor = hsLogs(h.id).filter(l => l.date >= s && l.date <= e).reduce((sum, l) => sum + (Number(l.labor) || 0), 0);
  const taxBack = Math.min(1200, labor * 0.2);
  const yearsWith = [...new Set([new Date().getFullYear(), ...hsLogs(h.id).map(l => Number(String(l.date).slice(0, 4))).filter(Boolean)])].sort();
  const minY = Math.min(...yearsWith), maxY = Math.max(new Date().getFullYear(), ...yearsWith);
  const overview = hsCard(`
    <div class="flex items-center justify-between gap-2 mb-2">
      <button type="button" class="fz-mini-btn" data-hsact="year" data-d="-1"${y <= minY ? ' disabled style="opacity:.35"' : ''}>‹</button>
      <div class="text-center min-w-0">
        <div class="text-[11px] uppercase tracking-wide text-ink/40">${hsEsc(tk('home.costsYear', { year: y }))}</div>
        <div class="font-serif text-2xl">${hsEsc(fmtEur(total))}</div>
        <div class="text-xs text-ink/50">${area > 0 && total > 0 ? hsEsc(tk('home.perSqm', { amount: fmtEur(total / area) })) : (y === new Date().getFullYear() ? hsEsc(tk('school.date')) : '&nbsp;')}</div>
      </div>
      <button type="button" class="fz-mini-btn" data-hsact="year" data-d="1"${y >= maxY ? ' disabled style="opacity:.35"' : ''}>›</button>
    </div>
    ${gRows.length ? `<div class="flex flex-col gap-2 mt-2">${gRows.map(x => `
      <div>
        <div class="flex items-center justify-between gap-2 text-xs mb-1"><span class="truncate">${hsEsc(x.g.icon + ' ' + x.g.label)}</span><span class="shrink-0 font-medium">${hsEsc(fmtEur(x.val))}</span></div>
        <div class="vt-bar"><span style="width:${Math.max(4, Math.round(Math.abs(x.val) / maxG * 100))}%;background:${x.g.color}"></span></div>
      </div>`).join('')}</div>` : ('<p class="text-xs text-ink/45 text-center">' + tk('home.noCostsYearYet') + '</p>')}`);
  const tax = labor > 0 ? hsCard(`
    <div class="fz-h">${tk('home.taxReturn')}</div>
    <div class="vt-row"><span>${tk('home.tradesmenLabourCosts', { hsEsc: hsEsc(String(y)) })}</span><span>${hsEsc(fmtEur(labor))}</span></div>
    <div class="vt-row"><span>${tk('home.taxReduction20Max')}</span><span>${hsEsc(tk('home.upTo', { amount: fmtEur(taxBack) }))}</span></div>
    <p class="text-[11px] text-ink/45 mt-2">${tk('home.tradesmensServicesOwnHousehold')}</p>`) : '';

  // Renovation plan
  const projects = hsProjects(h.id).slice().sort((a, b) => {
    const order = { laufend: 0, geplant: 1, idee: 2, fertig: 3 };
    return (order[a.status] ?? 2) - (order[b.status] ?? 2) || (Number(a.year) || 9999) - (Number(b.year) || 9999) || (Number(a.prio) || 2) - (Number(b.prio) || 2);
  });
  const spentOf = pid => hsLogs(h.id).filter(l => l.project === pid).reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const pRows = projects.map(p => {
    const area2 = (HS_PROJECT_AREAS.find(a => a[0] === p.area) || HS_PROJECT_AREAS[HS_PROJECT_AREAS.length - 1])[1];
    const st = (HS_PROJECT_STATUS.find(x => x[0] === p.status) || HS_PROJECT_STATUS[0])[1];
    const spent = spentOf(p.id);
    const budget = Number(p.budget) || 0;
    const pct = budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0;
    const over = budget > 0 && spent > budget;
    return `
      <button type="button" class="w-full text-left rounded-xl border border-ink/10 px-3 py-2.5 hover:border-pine/40 transition" data-hsact="project-edit" data-id="${hsEsc(p.id)}">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium truncate">${hsEsc(area2.split(' ')[0] + ' ' + (p.title || tk('home.project')))}</span>
          <span class="vt-chip ${p.status === 'fertig' ? 'muted' : (p.status === 'laufend' ? 'warn' : '')}">${hsEsc(st)}</span>
        </div>
        <div class="text-xs text-ink/45 mt-0.5">${hsEsc([Number(p.year) > 0 ? String(p.year) : '', budget > 0 ? tk('home.budgetAmount', { amount: fmtEur0(budget) }) : '', spent ? tk('home.spentAmount', { amount: fmtEur0(spent) }) : '', Number(p.funding) > 0 ? tk('home.fundingAmount', { amount: fmtEur0(p.funding) }) : ''].filter(Boolean).join(' · '))}</div>
        ${budget > 0 ? `<div class="vt-bar mt-1.5"><span style="width:${Math.max(3, pct)}%;background:${over ? '#C0392B' : 'var(--c-pine)'}"></span></div>` : ''}
      </button>`;
  }).join('');
  const planned = projects.filter(p => p.status !== 'fertig').reduce((sum, p) => sum + Math.max(0, (Number(p.budget) || 0) - spentOf(p.id) - (Number(p.funding) || 0)), 0);
  const plan = hsCard(`
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="fz-h" style="margin:0">${hsOwn(h) ? tk('home.renovationPlan') : tk('home.renovationProjects')}</div>
      ${hsCanEdit() ? ('<button type="button" class="fz-mini-btn primary" data-hsact="project-new">' + tk('home.project2') + '</button>') : ''}
    </div>
    ${pRows ? `<div class="flex flex-col gap-1.5">${pRows}</div>${planned > 0 ? `<p class="text-xs text-ink/55 mt-2">${hsEsc(tk('home.stillPlanned', { amount: fmtEur0(planned) }))}</p>` : ''}` : `<p class="text-xs text-ink/45">${hsOwn(h) ? tk('home.planRoofWindowsHeating') : tk('home.paintingNewFloorKitchen')}</p>`}`);

  // Invoices & costs
  const filters = [['alle', tk('errorLog.all')], ['einrichtung', tk('home.furnishing')], ['renovierung', tk('home.renovation')], ['instandhaltung', tk('home.repairs')], ['abrechnung', tk('home.statements')]];
  const logs = hsLogs(h.id).filter(l => String(l.date).slice(0, 4) === String(y)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const flt = logs.filter(l => {
    if (hsLogFilter === 'alle') return true;
    const t = hsLogType(l.type);
    if (hsLogFilter === 'abrechnung') return !!t.settle || ['steuer', 'versicherung'].includes(t.id);
    return t.group === hsLogFilter;
  });
  const logRows = flt.slice(0, hsLogLimit).map(l => {
    const t = hsLogType(l.type);
    const nDocs = hsDocsOf(l).length;
    const proj = l.project ? hsProjectById(l.project) : null;
    const warranty = vtIsIso(l.warranty) && l.warranty >= finTodayIso() ? tk('home.warrantyUntil', { date: vtFmt(l.warranty) }) : '';
    const a = Number(l.amount) || 0;
    return `
      <button type="button" class="fz-log-row" data-hsact="log-edit" data-id="${hsEsc(l.id)}">
        <span class="fz-log-ic">${hsEsc(t.icon)}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${hsEsc(hsLogTitle(l))}${nDocs ? ' <span class="text-xs text-ink/45">📎</span>' : ''}</span>
          <span class="block text-xs text-ink/45 truncate">${hsEsc([vtFmt(l.date), l.room, proj ? proj.title : '', warranty].filter(Boolean).join(' · '))}</span>
        </span>
        <span class="shrink-0 text-right">
          ${a ? `<span class="block text-sm font-semibold${a < 0 ? ' text-pine' : ''}">${hsEsc(a < 0 ? '+ ' + fmtEur(-a) : fmtEur(a))}</span>` : ''}
          ${t.settle && a ? `<span class="block text-[10px] text-ink/45">${hsEsc(a < 0 ? tk('depot.balance2') : tk('home.backPayment'))}</span>` : (a && !l.booked ? ('<span class="block text-[10px] text-ink/40">' + tk('home.notFinance') + '</span>') : '')}
        </span>
      </button>`;
  }).join('');
  const verlauf = hsCard(`
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="fz-h" style="margin:0">${tk('home.invoices', { hsEsc: hsEsc(String(y)) })} <span class="text-ink/40 font-normal normal-case">${logs.length || ''}</span></div>
      ${hsCanEdit() ? ('<button type="button" class="fz-mini-btn primary" data-hsact="log-new">' + tk('home.invoice') + '</button>') : ''}
    </div>
    ${logs.length ? `<div class="fz-type-row mb-2">${filters.map(f => `<button type="button" class="fz-filter-chip${hsLogFilter === f[0] ? ' active' : ''}" data-hsact="log-filter" data-f="${f[0]}">${hsEsc(f[1])}</button>`).join('')}</div>` : ''}
    ${logRows ? `<div class="flex flex-col">${logRows}</div>` : `<p class="text-xs text-ink/45">${logs.length ? tk('home.noEntriesFilter') : tk('home.furnitureFloorsMaterialTradesmen')}</p>`}
    ${flt.length > hsLogLimit ? `<button type="button" class="w-full mt-2 text-xs text-ink/55 hover:text-pine py-1.5" data-hsact="log-more">${hsEsc(tk('home.showMoreN', { n: flt.length - hsLogLimit }))}</button>` : ''}`);
  let income = '';
  if (hsLet(h)) {
    const inc = hsIncomeIn(h, s, e);
    income = hsCard(`
    <div class="fz-h">${tk('home.rentalIncome', { hsEsc: hsEsc(String(y)) })}</div>
    <div class="vt-row"><span>${tk('fin.income')}</span><span style="color:#2F9E5B">${hsEsc('+ ' + fmtEur(inc))}</span></div>
    <div class="vt-row"><span>${tk('contract.costs')}</span><span>${hsEsc('− ' + fmtEur(total))}</span></div>
    <div class="vt-row"><span><b>${tk('home.surplus')}</b></span><span><b>${hsEsc((inc - total < 0 ? '− ' : '+ ') + fmtEur(Math.abs(inc - total)))}</b></span></div>
    <p class="text-[11px] text-ink/45 mt-2">${tk('home.taxReturnGermanyForm')}</p>`);
  }
  return overview + income + (hsLet(h) ? '' : tax) + plan + verlauf;
}

/* ---------- Meters ---------- */
function hsMetersHtml(h) {
  const meters = hsMeters(h.id);
  if (!meters.length) {
    return hsCard(`
      <div class="text-center">
        <div class="text-4xl mb-2">📟</div>
        <div class="font-serif text-lg mb-1">${tk('home.addMeters')}</div>
        <p class="text-xs text-ink/50 mb-4">${tk('home.electricityGasWaterHeat')}</p>
        ${hsCanEdit() ? `<div class="flex flex-wrap justify-center gap-2">${HS_METER_TYPES.map(t => `<button type="button" class="fz-kind-btn px-3 py-2 text-sm" data-hsact="meter-new" data-type="${t.id}">${t.icon} ${hsEsc(t.label)}</button>`).join('')}</div>` : ''}
      </div>`);
  }
  const cards = meters.map(m => hsMeterCardHtml(m)).join('');
  return cards + (hsCanEdit() ? `<button type="button" class="self-center fz-mini-btn" data-hsact="meter-new">${tk('home.anotherMeter')}</button>` : '');
}
function hsMeterCardHtml(m) {
  const t = hsMeterType(m.type);
  const fc = hsForecast(m);
  const st = fc.st;
  const last = st.last;
  const unit = t.unit;
  const today = finTodayIso();
  const lines = [];
  if (fc.annual != null) {
    lines.push(hsRow(t.income ? tk('home.yieldPerYear') : tk('home.consumptionPerYear'), hsEsc((st.reliable ? '' : '≈ ') + hsNum(fc.annual, unit === 'kWh' ? 0 : 1) + ' ' + unit + (hsFactor(m) !== 1 ? ' (' + hsNum(fc.annual * hsFactor(m), 0) + ' ' + hsBillUnit(m) + ')' : ''))));
    if (Number(h_area()) > 0 && (t.id === 'gas' || t.id === 'waerme' || t.id === 'heizstrom')) lines.push(hsRow(tk('home.perM2'), hsEsc(hsNum(fc.annual * hsFactor(m) / h_area(), 0) + ' kWh')));
    lines.push(hsRow(tk('home.soFarPeriod'), hsEsc(hsNum(fc.used, unit === 'kWh' ? 0 : 1) + ' ' + unit + ' · ' + tk('home.sinceDate', { date: vtFmt(fc.per.start) }))));
    lines.push(hsRow(t.income ? tk('home.feedPaymentForecast') : tk('home.costsForecast'), hsEsc(fmtEur0(fc.cost) + ' · ' + tk('home.untilDate', { date: vtFmt(fc.per.end) }))));
  }
  let verdict = '';
  if (fc.diff != null) {
    const pay = fc.diff > 0;
    verdict = `<div class="${pay ? 'vt-info warn' : 'vt-info'} mt-2">${pay
      ? hsEsc(tk('home.expectedBackPayment', { amount: fmtEur0(fc.diff) })) + '<br><span class="opacity-80">' + hsEsc(tk('home.advanceSuggest', { amount: fmtEur(Number(m.advance)), suggest: fmtEur0(fc.suggest) })) + '</span>'
      : hsEsc(tk('home.expectedCredit', { amount: fmtEur0(-fc.diff) })) + '<br><span class="opacity-80">' + hsEsc(tk('home.advanceSuggest', { amount: fmtEur(Number(m.advance)), suggest: fmtEur0(fc.suggest) })) + '</span>'}</div>`;
  } else if (fc.annual != null && fc.suggest && !t.income) {
    verdict = `<p class="text-[11px] text-ink/45 mt-2">${hsEsc(tk('home.fittingAdvance', { amount: fmtEur0(fc.suggest) }))}</p>`;
  } else if (fc.annual == null) {
    verdict = `<p class="text-[11px] text-ink/45 mt-2">${st.rs.length ? tk('home.fromSecondReadingIdeally') : tk('home.enterFirstReadingIdeally')}</p>`;
  }
  // Chart: last 12 months
  let chart = '';
  if (fc.annual != null) {
    const mo = hsMonthly(m).months;
    const vals = mo.map(x => x.val != null ? x.val : (x.est || 0));
    const colors = mo.map(x => x.val != null ? t.color : t.color + '55');
    const labels = mo.map(x => fzMonthName(Number(x.ym.slice(5, 7)) - 1, 'short'));
    chart = `<div class="mt-3">${fzBarsHtml(vals, labels, t.color, { colors, height: 80, short: v => hsNum(v, 0), fmt: v => hsNum(v, 1) + ' ' + unit })}</div>
      <p class="text-[10px] text-ink/40 mt-1">${tk('home.lightEstimatedNoReading')}</p>`;
  }
  const rs = st.rs.slice().reverse();
  const shown = hsMeterOpen === m.id ? rs : rs.slice(0, 3);
  const readRows = shown.map(r => {
    const prev = st.rs[st.rs.indexOf(r) - 1];
    const delta = prev && !r.reset ? Number(r.value) - Number(prev.value) : null;
    return `
      <button type="button" class="fz-log-row" data-hsact="reading-edit" data-id="${hsEsc(r.id)}">
        <span class="fz-log-ic">${r.source === 'ki' ? '✨' : (r.reset ? '🔁' : '📍')}</span>
        <span class="flex-1 min-w-0"><span class="block text-sm font-medium truncate">${hsEsc(hsNum(r.value, unit === 'kWh' ? 1 : 3) + ' ' + unit)}</span><span class="block text-xs text-ink/45 truncate">${hsEsc([vtFmt(r.date), r.reset ? tk('home.meterReplaced') : '', r.note].filter(Boolean).join(' · '))}</span></span>
        ${delta != null ? `<span class="shrink-0 text-xs text-ink/50">${hsEsc('+ ' + hsNum(delta, unit === 'kWh' ? 0 : 1))}</span>` : ''}
      </button>`;
  }).join('');
  return hsCard(`
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <span class="fz-icon" style="--fz:${t.color}">${t.icon}</span>
        <div class="min-w-0">
          <div class="text-sm font-medium truncate">${hsEsc(m.name || t.label)}</div>
          <div class="text-xs text-ink/45 truncate">${hsEsc([m.number ? 'Nr. ' + m.number : '', last ? 'zuletzt ' + vtFmt(last.date) : tk('home.noReadingYet')].filter(Boolean).join(' · '))}</div>
          ${last ? `<div class="font-serif text-lg leading-tight mt-0.5">${hsEsc(hsNum(last.value, unit === 'kWh' ? 1 : 3) + ' ' + unit)}</div>` : ''}
        </div>
      </div>
      ${hsCanEdit() ? `<div class="flex flex-col gap-1.5 shrink-0">
        <button type="button" class="fz-mini-btn primary" data-hsact="reading-new" data-id="${hsEsc(m.id)}">${tk('home.asOf')}</button>
        <button type="button" class="fz-mini-btn" data-hsact="meter-edit" data-id="${hsEsc(m.id)}">✎</button>
      </div>` : ''}
    </div>
    ${last && vtDiffDays(last.date, today) > 40 && m.active !== false ? `<p class="text-[11px] text-ink/50 mt-2">${hsEsc(tk('home.lastReadingDaysAgo', { n: vtDiffDays(last.date, today) }))}</p>` : ''}
    ${lines.length ? `<div class="mt-3">${lines.join('')}</div>` : ''}
    ${verdict}
    ${chart}
    ${readRows ? `<div class="flex flex-col mt-3">${readRows}</div>` : ''}
    ${rs.length > 3 ? `<button type="button" class="w-full mt-1 text-xs text-ink/55 hover:text-pine py-1" data-hsact="meter-toggle" data-id="${hsEsc(m.id)}">${hsMeterOpen === m.id ? tk('maint.showLess') : hsEsc(tk('home.showAllReadings', { n: rs.length }))}</button>` : ''}`);
}
function h_area() { const h = hsCurrent(); return h ? Number(h.area) || 0 : 0; }

/* ---------- Maintenance ---------- */
function hsMaintIsGarden(m) { return !!m.garden || HS_MAINT_TEMPLATES.some(t => t.garden && t.tpl === m.tpl); }
function hsMaintListHtml(compact, which = 'all') {
  const items = hsMaintItems().filter(m => which === 'all' || (which === 'garden') === hsMaintIsGarden(m)).slice().sort((a, b) => (a.active === false) - (b.active === false) || hsMaintNext(a).localeCompare(hsMaintNext(b)));
  if (!items.length) return '';
  return items.map(m => {
    const next = hsMaintNext(m);
    const t = hsMaintDueTone(next);
    const open = hsMaintOpen(m);
    const who = (m.assignedMemberIds || []).map(id => memberById(id)).filter(Boolean).map(memberLabel);
    const sub = [hsMaintEvery(m.months), who.length ? (m.rotate && who.length > 1 ? '🔄 ' + who.join(', ') : who.join(', ')) : tk('errorLog.all'), vtIsIso(m.last) ? 'zuletzt ' + vtFmt(m.last) : ''].filter(Boolean).join(' · ');
    return `
      <div class="fz-due-row${m.active === false ? '' : ' ' + t.tone}" role="button" tabindex="0" data-hsact="maint-edit" data-id="${hsEsc(m.id)}"${m.active === false ? ' style="opacity:.5"' : ''}>
        <span class="fz-due-ic">${hsEsc(m.icon || '🔧')}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${hsEsc(m.title)}</span>
          <span class="block text-xs text-ink/55 truncate">${hsEsc(sub)}</span>
          ${open && !compact ? `<span class="flex gap-1 mt-1 flex-wrap"><span class="vt-chip muted">${tk('home.taskCreated')}</span>${hsCanEdit() ? `<span role="button" tabindex="0" class="fz-mini-btn primary" data-hsact="maint-act" data-id="${hsEsc(m.id)}">${hsMaintIsMeter(m) ? tk('home.enter') : tk('tasks.doneBtn')}</span>` : ''}</span>` : ''}
        </span>
        <span class="vt-chip ${m.active === false ? 'muted' : hsEsc(t.tone)}">${m.active === false ? hsEsc(tk('home.paused')) : hsEsc(t.label)}</span>
      </div>`;
  }).join('');
}
function hsMaintPageHtml() {
  const h = hsCurrent();
  const gardenTab = !!h && hsHasModule(h, 'garten');
  const list = hsMaintListHtml(false, gardenTab ? 'house' : 'all');
  const used = new Set(hsMaintItems().map(m => m.tpl).filter(Boolean));
  const tpls = HS_MAINT_TEMPLATES.filter(t => !used.has(t.tpl) && !t.garden && (!t.own || !h || hsOwn(h)));
  return hsCard(`
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="fz-h" style="margin:0">${tk('home.maintenancePlan')}</div>
      ${hsCanEdit() ? ('<button type="button" class="fz-mini-btn primary" data-hsact="maint-new">' + tk('home.custom') + '</button>') : ''}
    </div>
    ${list ? `<div class="flex flex-col gap-1.5">${list}</div>` : ('<p class="text-xs text-ink/45">' + tk('home.nothingPlannedYetTap') + '</p>')}
    <p class="text-[11px] text-ink/45 mt-2">${tk('home.tasksAppearUnderTasks')}</p>`)
    + (hsCanEdit() && tpls.length ? hsCard(`
    <div class="fz-h">${tk('home.templates')}</div>
    <div class="flex flex-wrap gap-1.5">${tpls.map(t => `<button type="button" class="fz-filter-chip" data-hsact="maint-tpl" data-tpl="${t.tpl}">${hsEsc(t.icon + ' ' + t.title)}</button>`).join('')}</div>`) : '');
}
// Card on the household page
function renderHouseholdMaintenance() {
  const el = document.getElementById('hhMaintCard');
  if (!el) return;
  hsMaintSyncFromTasks();
  const items = hsMaintItems().filter(m => m.active !== false);
  if (!items.length) {
    el.innerHTML = hsCanEdit() ? `<button type="button" class="w-full rounded-xl border border-dashed border-ink/20 px-3 py-2.5 text-left text-xs text-ink/55 hover:text-pine hover:border-pine transition" data-hsact="maint-open">${tk('home.createMaintPlan')}</button>` : '';
    return;
  }
  const soon = items.map(m => ({ m, next: hsMaintNext(m) })).sort((a, b) => a.next.localeCompare(b.next)).slice(0, 3);
  el.innerHTML = `
    <div class="rounded-xl border border-ink/10 bg-white/70 p-3">
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-sm font-medium">${tk('home.maintenancePlan')}</span>
        <button type="button" class="text-xs text-ink/50 hover:text-pine" data-hsact="maint-open">${tk('home.showAll')}</button>
      </div>
      <div class="flex flex-col gap-1">${soon.map(x => { const t = hsMaintDueTone(x.next); return `<div class="flex items-center justify-between gap-2 text-xs"><span class="truncate">${hsEsc((x.m.icon || '🔧') + ' ' + x.m.title)}</span><span class="vt-chip ${hsEsc(t.tone)}">${hsEsc(t.label)}</span></div>`; }).join('')}</div>
    </div>`;
}

/* ---------- Saving & redrawing ---------- */
function hsAfterChange() {
  persistState();
  if (currentView === 'haus') renderHouse();
  if (currentView === 'finanzen') { try { renderFinance(); } catch (e) { /* ignore */ } }
  try { renderFinRecurringEditor(); } catch (e) { /* ignore */ }
}
function hsSet(key, list) { finance[key] = list; }
function hsUpsert(key, obj) {
  const list = hsArr(key);
  hsSet(key, list.some(x => x.id === obj.id) ? list.map(x => x.id === obj.id ? obj : x) : [...list, obj]);
}
function hsMemberChips(id, selected) {
  return `<div class="flex flex-wrap gap-1.5" id="${id}">${members.map(m => `<button type="button" class="fz-member-chip px-2.5 py-1.5 text-xs${selected.includes(m.id) ? ' active' : ''}" data-m="${hsEsc(m.id)}">${hsEsc(memberLabel(m))}</button>`).join('')}</div>`;
}
function hsWireChips(root, sel) {
  root.querySelectorAll(sel + ' .fz-member-chip, ' + sel + ' .fz-filter-chip').forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
}
function hsChipVals(sel) { return [...document.querySelectorAll(sel + ' .active')].map(b => b.dataset.m || b.dataset.v).filter(Boolean); }
function hsEuro(id) { const raw = fzVal(id); if (!raw) return ''; const v = parseEuro(raw); return isFinite(v) && v >= 0 && v < 100000000 ? Math.round(v * 100) / 100 : NaN; }
function hsFooter(prefix, canDelete) {
  return `
    <p id="${prefix}Error" class="hidden text-xs text-red-500 mt-2"></p>
    <div class="flex items-center gap-2 mt-4">
      ${canDelete ? `<button type="button" id="${prefix}DeleteBtn" class="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition">${tk('home.delete')}</button>` : ''}
      <div class="flex-1"></div>
      <button type="button" id="${prefix}Cancel" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink">${tk('common.cancel')}</button>
      <button type="button" id="${prefix}Save" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90">${tk('common.save')}</button>
    </div>`;
}
function hsWireFooter(prefix, onSave, onDelete) {
  document.getElementById(prefix + 'Cancel').addEventListener('click', () => attemptCloseModal('fzModal', hsCloseModal));
  document.getElementById(prefix + 'Save').addEventListener('click', onSave);
  const del = document.getElementById(prefix + 'DeleteBtn');
  if (del && onDelete) del.addEventListener('click', onDelete);
}
function hsOpenModal(html, onReady) { fzOpenModal(html, onReady); }
function hsCloseModal() { fzCloseModal(); hsModalState = null; }
function hsNextMonthFirst() { const t = finTodayIso(); return vtAddMonths(t.slice(0, 8) + '01', 1, false); }

/* ---------- Popup: home ----------
   Three kinds: rent (we live in a rented home), ownership (lived in by us), letting (property we
   let – house, flat, garage). Sections with data-sec apply to the kinds named. */
function hsOpenHomeModal(id, modePreset) {
  if (!hsCanEdit()) return;
  const h = id ? hsHomeById(id) : null;
  const preset = ['eigentum', 'vermietet'].includes(modePreset) ? modePreset : 'miete';
  const d = h ? JSON.parse(JSON.stringify(h)) : { mode: preset, type: 'wohnung', color: HS_COLORS[hsHomes().length % HS_COLORS.length], rent: { notice: 3 }, own: { loan: {} }, landlord: {}, tenant: {}, fix: {} };
  d.mode = hsMode(d);
  d.rent = d.rent || {}; d.own = d.own || {}; d.own.loan = d.own.loan || {}; d.landlord = d.landlord || {}; d.tenant = d.tenant || {}; d.fix = d.fix || {};
  hsModalState = { mode: 'home', id: h ? h.id : null, draft: d };
  const r = d.rent, o = d.own, l = o.loan, lord = d.landlord, ten = d.tenant;
  const eur = v => Number(v) > 0 ? euroInputValue(v) : '';
  const fixModes = f => f.mode === 'eigentum' ? 'eigentum vermietet' : f.mode;
  const fixRows = HS_FIX.map(f => `<div data-sec="${fixModes(f)}">${fzIn('hsf_' + f.key, f.label + (f.interval === 'monthly' ? '' : ' (' + vtIntervalLabel(f.interval) + ')'), eur(d.fix[f.key] && d.fix[f.key].amount), { mode: 'decimal', unit: curSym() })}</div>`).join('');
  const anyRec = HS_FIX.some(f => d.fix[f.key] && d.fix[f.key].recId);
  const html = `
    <h3 class="font-serif text-lg mb-3 pr-6">${h ? tk('home.editHome') : tk('home.newHome')}</h3>
    <div class="flex gap-2 mb-3" id="hsMode">
      <button type="button" class="fz-kind-btn flex-1 px-2 py-2 text-sm${d.mode === 'miete' ? ' active' : ''}" data-mode="miete">${tk('home.rent2')}</button>
      <button type="button" class="fz-kind-btn flex-1 px-2 py-2 text-sm${d.mode === 'eigentum' ? ' active' : ''}" data-mode="eigentum">${tk('home.owned2')}</button>
      <button type="button" class="fz-kind-btn flex-1 px-2 py-2 text-sm${d.mode === 'vermietet' ? ' active' : ''}" data-mode="vermietet">${tk('home.letOut2')}</button>
    </div>
    ${fzIn('hsName', tk('common.name'), d.name || '', { ph: tk('home.eGOurHouse'), max: 60 })}
    <div class="fz-grid2">
      ${fzSel('hsType', tk('contract.kind'), HS_TYPES, d.type || 'wohnung')}
      ${fzIn('hsMoveIn', tk('home.moved'), d.moveIn || '', { type: 'date' })}
    </div>
    ${fzIn('hsAddress', tk('smart.haAddress'), d.address || '', { ph: tk('contract.streetPostcodeTown'), max: 200 })}
    <div class="fz-grid3">
      ${fzIn('hsArea', tk('home.livingSpace'), Number(d.area) > 0 ? hsDecInput(d.area, 1) : '', { mode: 'decimal', unit: 'm²' })}
      ${fzIn('hsRooms', tk('home.rooms'), Number(d.rooms) > 0 ? hsDecInput(d.rooms, 1) : '', { mode: 'decimal' })}
      ${fzIn('hsPersons', tk('home.people'), Number(d.persons) > 0 ? String(d.persons) : '', { mode: 'numeric' })}
    </div>
    <div class="fz-grid2">
      ${fzIn('hsBuilt', tk('home.yearManufacture'), Number(d.built) > 0 ? String(d.built) : '', { mode: 'numeric', max: 4 })}
      ${fzSel('hsHeating', tk('home.heating'), HS_HEATING, d.heating || '')}
    </div>

    <div class="fz-h mt-2" data-sec="miete">${tk('home.tenancyAgreement2')}</div>
    <div data-sec="miete">
      ${fzIn('hsLordName', tk('home.landlord'), lord.name || '', { max: 120 })}
      <div class="fz-grid2">${fzIn('hsLordPhone', tk('contract.phone'), lord.phone || '', { type: 'tel', max: 60 })}${fzIn('hsLordMail', tk('contract.email'), lord.email || '', { type: 'email', max: 120 })}</div>
      ${fzIn('hsLordAddr', tk('home.landlordsAddress'), lord.address || '', { ph: tk('home.defectNotice2'), max: 200 })}
    </div>
    <div class="fz-h mt-2" data-sec="vermietet">${tk('home.tenant2')}</div>
    <div data-sec="vermietet">
      ${fzIn('hsTenName', tk('home.tenant'), ten.name || '', { ph: tk('home.nameLeaveEmptyIf'), max: 120 })}
      <div class="fz-grid2">${fzIn('hsTenPhone', tk('contract.phone'), ten.phone || '', { type: 'tel', max: 60 })}${fzIn('hsTenMail', tk('contract.email'), ten.email || '', { type: 'email', max: 120 })}</div>
      ${fzIn('hsTenSince', tk('home.tenantSince'), ten.since || '', { type: 'date' })}
    </div>
    <div data-sec="miete vermietet">
      <div class="fz-grid2">
        ${fzSel('hsRentKind', tk('home.rentType'), [['normal', tk('home.standard')], ['staffel', tk('home.graduatedRent')], ['index', tk('home.indexLinkedRent')]], r.kind || 'normal')}
        ${fzIn('hsLastInc', tk('home.lastRentIncrease'), r.lastIncrease || '', { type: 'date' })}
      </div>
      <div class="fz-grid2">
        ${fzSel('hsNotice', tk('contract.noticePeriod'), [['1', tk('contract.1Month')], ['2', tk('home.n2Months')], ['3', tk('contract.3Months')], ['6', tk('contract.6Months')], ['12', tk('contract.12Months')]], String(r.notice || 3))}
        ${fzIn('hsDeposit', tk('home.deposit'), eur(r.deposit), { mode: 'decimal', unit: curSym() })}
      </div>
      <div class="fz-grid2">
        ${fzIn('hsDepPaid', tk('home.depositPaid'), r.depositPaid || '', { type: 'date' })}
        ${fzIn('hsDepWhere', tk('home.held'), r.depositWhere || '', { ph: tk('home.eGRentDeposit'), max: 80 })}
      </div>
    </div>

    <div class="fz-h mt-2" data-sec="eigentum vermietet">${tk('home.purchaseFinancing')}</div>
    <div data-sec="eigentum vermietet">
      <div class="fz-grid2">${fzIn('hsBuyDate', tk('pdf.field.purchaseDate'), o.date || '', { type: 'date' })}${fzIn('hsPrice', tk('home.purchasePrice'), eur(o.price), { mode: 'decimal', unit: curSym() })}</div>
      <div class="fz-grid3 hs-buycosts">${fzIn('hsLandTax', tk('home.landTransferTax'), eur(o.landTax), { mode: 'decimal', unit: curSym() })}${fzIn('hsNotary', tk('home.notaryLandRegistry'), eur(o.notary), { mode: 'decimal', unit: curSym() })}${fzIn('hsBroker', tk('home.estateAgent'), eur(o.broker), { mode: 'decimal', unit: curSym() })}</div>
      <div class="fz-grid2">${fzIn('hsLoanBank', tk('home.bank'), l.bank || '', { max: 80 })}${fzIn('hsLoanAmount', tk('home.loanAmount'), eur(l.amount), { mode: 'decimal', unit: curSym() })}</div>
      <div class="fz-grid3">${fzIn('hsLoanRate', tk('home.interest2'), Number(l.rate) > 0 ? hsDecInput(l.rate, 2) : '', { mode: 'decimal', unit: '%' })}${fzIn('hsLoanRepay', tk('home.repayment'), Number(l.repay) > 0 ? hsDecInput(l.repay, 2) : '', { mode: 'decimal', unit: '%' })}${fzIn('hsLoanMonthly', tk('home.instalment'), eur(l.monthly), { mode: 'decimal', unit: curSym(), ph: tk('home.emptyCalculated') })}</div>
      <div class="fz-grid2">${fzIn('hsLoanStart', tk('home.loanSince'), l.start || '', { type: 'date' })}${fzIn('hsLoanFix', tk('home.fixedInterestUntil'), l.fixedUntil || '', { type: 'date' })}</div>
      ${fzIn('hsLordName2', tk('home.propertyManagement'), lord.name || '', { ph: tk('home.optionalOwnerOccupiedFlats'), max: 120 })}
      <div class="fz-grid2">${fzIn('hsLordPhone2', tk('contract.phone'), lord.phone || '', { type: 'tel', max: 60 })}${fzIn('hsLordMail2', tk('contract.email'), lord.email || '', { type: 'email', max: 120 })}</div>
    </div>

    <div class="fz-h mt-2">${tk('home.fixedCosts2')}</div>
    <p class="text-[11px] text-ink/45 mb-2">${tk('home.createdRecurringBookingsFinance')}</p>
    <p class="text-[11px] text-ink/45 mb-2" data-sec="vermietet">${tk('home.rentalIncomeBookedRecurring')}</p>
    ${fixRows}
    <label class="fz-check"><input type="checkbox" id="hsFixBook"${(!h || anyRec) ? ' checked' : ''} /> <span>${tk('home.bookFinance')}</span></label>
    ${fzIn('hsFixStart', anyRec ? tk('home.bookNewFixedCosts') : tk('home.bookFrom'), vtIsIso(d.fixStart) && d.fixStart > finTodayIso() ? d.fixStart : hsNextMonthFirst(), { type: 'date' })}

    <div class="fz-h mt-2" id="hsEndHead">${tk('home.movingOut')}</div>
    ${fzIn('hsMoveOut', tk('home.movedOut'), d.moveOut || '', { type: 'date' })}
    <div class="fz-grid2" data-sec="miete vermietet">${fzIn('hsDepBack', tk('home.depositReturned2'), r.depositBack || '', { type: 'date' })}${fzIn('hsDepBackAmt', tk('home.amountReturned'), eur(r.depositBackAmount), { mode: 'decimal', unit: curSym() })}</div>
    <div class="fz-field"><label class="fz-lbl" for="hsNote">${tk('fin.csv.note')}</label><textarea id="hsNote" rows="2" maxlength="2000" class="fz-in">${hsEsc(d.note || '')}</textarea></div>
    ${hsFooter('hsHome', !!h)}`;
  hsOpenModal(html, body => {
    const setLbl = (forId, text) => { const el = body.querySelector('label[for="' + forId + '"]'); if (el) el.textContent = text; };
    const ui = () => {
      const mode = hsModalState.draft.mode;
      body.querySelectorAll('[data-sec]').forEach(el => el.classList.toggle('hidden', !el.dataset.sec.split(' ').includes(mode)));
      const garage = fzVal('hsType') === 'garage';
      setLbl('hsMoveIn', mode === 'vermietet' ? tk('home.ownedSince') : (garage ? tk('home.rentedBought') : tk('home.moved')));
      setLbl('hsMoveOut', mode === 'vermietet' ? tk('home.sold') : (garage ? tk('home.givenUp') : tk('home.movedOut')));
      setLbl('hsArea', garage ? tk('home.area') : tk('home.livingSpace'));
      setLbl('hsDepPaid', mode === 'vermietet' ? tk('home.depositReceived') : tk('home.depositPaid'));
      setLbl('hsDepBack', mode === 'vermietet' ? tk('home.depositRepaid') : tk('home.depositReturned2'));
      const eh = document.getElementById('hsEndHead');
      if (eh) eh.textContent = mode === 'vermietet' ? tk('home.sale') : tk('home.movingOut');
    };
    body.querySelectorAll('#hsMode [data-mode]').forEach(b => b.addEventListener('click', () => {
      hsModalState.draft.mode = b.dataset.mode;
      body.querySelectorAll('#hsMode [data-mode]').forEach(x => x.classList.toggle('active', x === b));
      ui();
    }));
    document.getElementById('hsType').addEventListener('change', ui);
    ui();
    hsWireFooter('hsHome', hsSaveHome, () => hsDeleteHome(h.id));
  });
}
function hsSaveHome() {
  const st = hsModalState;
  if (!st || st.mode !== 'home') return;
  const err = msg => fzShowErr('hsHomeError', msg);
  const existing = st.id ? hsHomeById(st.id) : null;
  const mode = ['eigentum', 'vermietet'].includes(st.draft.mode) ? st.draft.mode : 'miete';
  const own = mode !== 'miete';
  const letting = mode === 'vermietet';
  const today = finTodayIso();
  const num = (id, max) => { const raw = fzVal(id); if (!raw) return ''; const v = hsDec(raw); return isFinite(v) && v >= 0 && v <= max ? v : NaN; };
  const vals = { area: num('hsArea', 100000), rooms: num('hsRooms', 1000), persons: num('hsPersons', 100), built: num('hsBuilt', 2200) };
  for (const k of Object.keys(vals)) if (Number.isNaN(vals[k])) return err(tk('home.pleaseEnterNumbersOnly'));
  const money = {};
  const moneyIds = ['hsDeposit', 'hsPrice', 'hsLandTax', 'hsNotary', 'hsBroker', 'hsLoanAmount', 'hsLoanMonthly', 'hsDepBackAmt', ...HS_FIX.map(f => 'hsf_' + f.key)];
  for (const id of moneyIds) { money[id] = hsEuro(id); if (Number.isNaN(money[id])) return err(tk('home.pleaseEnterValidAmount')); }
  const rate = num('hsLoanRate', 30), repay = num('hsLoanRepay', 100);
  if (Number.isNaN(rate) || Number.isNaN(repay)) return err(tk('home.pleaseEnterInterestRepayment'));
  const moveIn = fzVal('hsMoveIn'), moveOut = fzVal('hsMoveOut');
  if (vtIsIso(moveIn) && vtIsIso(moveOut) && moveOut < moveIn) return err(tk('home.moveOutDateBefore'));
  const fixStart = vtIsIso(fzVal('hsFixStart')) ? fzVal('hsFixStart') : hsNextMonthFirst();
  const id = existing ? existing.id : 'h' + newRecordId().slice(0, 14);
  const prevTen = (existing && existing.tenant) || {};
  const home = {
    ...(existing || {}),
    id, mode,
    name: fzVal('hsName').slice(0, 60), type: fzVal('hsType') || 'wohnung', address: fzVal('hsAddress').slice(0, 200),
    moveIn: vtIsIso(moveIn) ? moveIn : '', moveOut: vtIsIso(moveOut) ? moveOut : '',
    area: vals.area, rooms: vals.rooms, persons: vals.persons === '' ? '' : Math.round(vals.persons), built: vals.built === '' ? '' : Math.round(vals.built),
    heating: fzVal('hsHeating'), color: st.draft.color || HS_COLORS[0],
    landlord: {
      name: (own ? fzVal('hsLordName2') : fzVal('hsLordName')).slice(0, 120),
      phone: (own ? fzVal('hsLordPhone2') : fzVal('hsLordPhone')).slice(0, 60),
      email: (own ? fzVal('hsLordMail2') : fzVal('hsLordMail')).slice(0, 120),
      address: own ? ((existing && existing.landlord && existing.landlord.address) || '') : fzVal('hsLordAddr').slice(0, 200),
    },
    tenant: letting ? {
      name: fzVal('hsTenName').slice(0, 120), phone: fzVal('hsTenPhone').slice(0, 60), email: fzVal('hsTenMail').slice(0, 120),
      since: vtIsIso(fzVal('hsTenSince')) ? fzVal('hsTenSince') : '',
    } : prevTen,
    rent: {
      kind: fzVal('hsRentKind') || 'normal', lastIncrease: vtIsIso(fzVal('hsLastInc')) ? fzVal('hsLastInc') : '',
      notice: Number(fzVal('hsNotice')) || 3, deposit: money.hsDeposit, depositPaid: vtIsIso(fzVal('hsDepPaid')) ? fzVal('hsDepPaid') : '',
      depositWhere: fzVal('hsDepWhere').slice(0, 80), depositBack: vtIsIso(fzVal('hsDepBack')) ? fzVal('hsDepBack') : '', depositBackAmount: money.hsDepBackAmt,
    },
    own: {
      date: vtIsIso(fzVal('hsBuyDate')) ? fzVal('hsBuyDate') : '', price: money.hsPrice, landTax: money.hsLandTax, notary: money.hsNotary, broker: money.hsBroker,
      loan: { bank: fzVal('hsLoanBank').slice(0, 80), amount: money.hsLoanAmount, rate, repay, monthly: money.hsLoanMonthly, start: vtIsIso(fzVal('hsLoanStart')) ? fzVal('hsLoanStart') : '', fixedUntil: vtIsIso(fzVal('hsLoanFix')) ? fzVal('hsLoanFix') : '' },
    },
    fixStart,
    note: (document.getElementById('hsNote').value || '').trim().slice(0, 2000),
    docLinks: (existing && Array.isArray(existing.docLinks)) ? existing.docLinks : [],
    created: (existing && existing.created) || today, updated: today,
  };
  // Take the loan installment from the loan if no installment of its own is entered as a fixed cost
  if (own && money.hsf_loan === '') {
    const ln = hsLoan(home);
    if (ln && ln.M > 0) money.hsf_loan = Math.round(ln.M * 100) / 100;
  }
  // Fixed costs (and for letting the rental income) as recurring bookings
  const book = fzChecked('hsFixBook');
  const fix = {};
  const ended = vtIsIso(home.moveOut);
  HS_FIX.forEach(f => {
    const prev = (existing && existing.fix && existing.fix[f.key]) || {};
    const active = hsFixMatch(f, mode);
    const amount = active && money['hsf_' + f.key] !== '' ? money['hsf_' + f.key] : 0;
    let recId = prev.recId && finance.recurring.some(x => x.id === prev.recId) ? prev.recId : '';
    if (book && amount > 0 && !ended) {
      let start = fixStart;
      if (f.interval === 'quarterly' && !recId) {
        // Property tax & co.: 15 Feb, 15 May, 15 Aug, 15 Nov
        const y = Number(fixStart.slice(0, 4));
        start = [y + '-02-15', y + '-05-15', y + '-08-15', y + '-11-15', (y + 1) + '-02-15'].find(x => x >= fixStart);
      }
      const cat = f.income ? FIN_INCOME_CATEGORY : HS_FIN_CATEGORY;
      const fields = { title: (HS_FIX_TITLE[f.key] ? HS_FIX.find(x => x.key === HS_FIX_TITLE[f.key]).label : f.label) + ' · ' + hsName(home), amount: f.income ? -amount : amount, category: cat, paidBy: '', note: '', link: 'haus:' + id, interval: f.interval, start };
      if (recId) {
        const rr = finance.recurring.find(x => x.id === recId);
        finUpsertRecurring(recId, { ...fields, note: rr.note || '', paidBy: rr.paidBy || '', category: rr.category || cat, start: finRecStart(rr) || start, interval: finRecInterval(rr) }, null);
      } else recId = finUpsertRecurring(null, fields).id;
      finance.recurring = finance.recurring.map(x => x.id === recId ? { ...x, home: id, homeFix: f.key } : x);
    } else if (recId && (amount === 0 || ended)) {
      // Move-out or sale: ends with the month
      if (ended) finance.recurring = finance.recurring.map(x => x.id === recId ? { ...x, until: home.moveOut } : x);
      else finEndRecurring(recId);
      if (!finance.recurring.some(x => x.id === recId)) recId = '';
    }
    fix[f.key] = { amount, recId };
  });
  home.fix = fix;
  hsUpsert('homes', home);
  try { vtAutoLink(); } catch (e) { /* ignore */ }
  hsHomeId = id;
  hsCloseModal();
  hsAfterChange();
  finShowToast(existing ? tk('common.saved') : tk('home.homeCreated'));
}
function hsDeleteHome(id) {
  const h = hsHomeById(id);
  if (!h) return;
  if (!confirm(tk('home.confirmDeleteHome', { name: hsName(h) }))) return;
  HS_FIX.forEach(f => { const rid = h.fix && h.fix[f.key] && h.fix[f.key].recId; if (rid) finEndRecurring(rid); });
  const meterIds = new Set(hsMeters(id).map(m => m.id));
  hsSet('homes', hsHomes().filter(x => x.id !== id));
  hsSet('homeLog', hsArr('homeLog').filter(x => x.home !== id));
  hsSet('homeDefects', hsArr('homeDefects').filter(x => x.home !== id));
  hsSet('homeProjects', hsArr('homeProjects').filter(x => x.home !== id));
  hsSet('homeMeters', hsArr('homeMeters').filter(x => x.home !== id));
  hsSet('homeReadings', hsArr('homeReadings').filter(x => !meterIds.has(x.meter)));
  hsSet('homePlants', hsArr('homePlants').filter(x => x.home !== id));
  hsSet('homeKeys', hsArr('homeKeys').filter(x => x.home !== id));
  finance.contracts = vtContracts().map(c => c.home === id ? { ...c, home: '' } : c);
  hsHomeId = '';
  hsCloseModal();
  hsAfterChange();
  finShowToast(tk('home.deleted'));
}

/* ---------- Popup: invoice / costs ---------- */
function hsOpenLogModal(id, typePreset) {
  const h = hsCurrent();
  if (!h || !hsCanEdit()) return;
  const l = id ? hsLogById(id) : null;
  const t0 = l ? l.type : (typePreset || 'moebel');
  const today = finTodayIso();
  const d = l || { type: t0, date: today, booked: true, paidBy: currentMember() ? currentMember().id : '' };
  hsModalState = { mode: 'log', id: l ? l.id : null, type: t0, home: l ? l.home : h.id, warrantyTouched: !!(l && l.warranty) };
  const projects = hsProjects(h.id).filter(p => p.status !== 'fertig' || (l && l.project === p.id));
  const amt = Number(d.amount) || 0;
  const html = `
    <h3 class="font-serif text-lg mb-1 pr-6">${l ? tk('home.editInvoice') : tk('home.newInvoice')}</h3>
    <div class="text-xs text-ink/50 mb-3">${hsEsc(HS_MODES[hsMode(h)].icon + ' ' + hsName(h))}</div>
    <div class="fz-type-row mb-3" id="hslTypes">${HS_LOG_TYPES.map(x => `<button type="button" class="fz-type-chip${x.id === t0 ? ' active' : ''}" data-type="${x.id}"><span class="fz-ti">${x.icon}</span>${hsEsc(x.label)}</button>`).join('')}</div>
    ${fzIn('hslDesc', tk('fin.csv.description'), d.desc || '', { ph: tk('home.eGSofaLiving'), max: 120 })}
    <div class="fz-grid2">
      ${fzIn('hslDate', tk('fin.csv.date'), vtIsIso(d.date) ? d.date : today, { type: 'date' })}
      ${fzIn('hslAmount', tk('depot.amount'), amt ? euroInputValue(Math.abs(amt)) : '', { mode: 'decimal', unit: curSym() })}
    </div>
    <div id="hslSettleWrap" class="flex gap-2 mb-3">
      <button type="button" class="fz-kind-btn flex-1 px-3 py-1.5 text-sm${amt >= 0 ? ' active' : ''}" data-sign="1">${tk('home.backPayment')}</button>
      <button type="button" class="fz-kind-btn flex-1 px-3 py-1.5 text-sm${amt < 0 ? ' active' : ''}" data-sign="-1">${tk('depot.balance2')}</button>
    </div>
    <div id="hslLaborWrap">${fzIn('hslLabor', tk('home.whichLabour'), Number(d.labor) > 0 ? euroInputValue(d.labor) : '', { mode: 'decimal', unit: curSym(), ph: tk('home.tax35a') })}</div>
    <div class="fz-grid2">
      ${fzIn('hslRoom', tk('household.room'), d.room || '', { ph: 'optional', max: 60 })}
      ${fzSel('hslProject', tk('home.project'), [['', '–']].concat(projects.map(p => [p.id, p.title || tk('home.project')])), d.project || '')}
    </div>
    <div id="hslWarrantyWrap">${fzIn('hslWarranty', tk('home.warrantyUntil'), d.warranty || '', { type: 'date' })}</div>
    <div class="fz-grid2 items-end">
      <div class="fin-paidby-wrap min-w-0">${fzSel('hslPaidBy', tk('fin.csv.paidBy'), fzMemberOptions(), d.paidBy || '')}</div>
      <label class="fz-check"><input type="checkbox" id="hslBooked"${d.booked !== false ? ' checked' : ''} /> <span>${tk('home.bookExpenseFinance')}</span></label>
    </div>
    ${fzIn('hslNote', tk('fin.csv.note'), d.note || '', { ph: 'optional', max: 500 })}
    <div class="flex items-center justify-between gap-2 mt-1">
      <span class="fz-lbl" style="margin:0">${tk('contract.docType.receipt')}</span>
      <button type="button" id="hslDocAdd" class="fz-mini-btn">${tk('home.fileInvoice')}</button>
    </div>
    <div class="flex flex-col gap-1.5 mt-1.5">${l ? hsDocsOf(l).map(hsDocRowHtml).join('') : ''}</div>
    <p class="text-[11px] text-ink/45 mt-1">${tk('home.savesEntryOpensDocuments')}</p>
    ${hsFooter('hsLog', !!l)}`;
  hsOpenModal(html, body => {
    const ui = () => {
      const t = hsLogType(hsModalState.type);
      document.getElementById('hslSettleWrap').classList.toggle('hidden', !t.settle);
      document.getElementById('hslLaborWrap').classList.toggle('hidden', !t.labor);
      document.getElementById('hslWarrantyWrap').classList.toggle('hidden', !t.warranty);
      if (t.warranty && !hsModalState.warrantyTouched && vtIsIso(fzVal('hslDate'))) document.getElementById('hslWarranty').value = vtAddMonths(fzVal('hslDate'), t.warranty, false);
    };
    body.querySelectorAll('#hslTypes .fz-type-chip').forEach(b => b.addEventListener('click', () => {
      hsModalState.type = b.dataset.type;
      body.querySelectorAll('#hslTypes .fz-type-chip').forEach(x => x.classList.toggle('active', x === b));
      ui();
    }));
    body.querySelectorAll('#hslSettleWrap [data-sign]').forEach(b => b.addEventListener('click', () => body.querySelectorAll('#hslSettleWrap [data-sign]').forEach(x => x.classList.toggle('active', x === b))));
    document.getElementById('hslWarranty').addEventListener('input', () => { hsModalState.warrantyTouched = true; });
    document.getElementById('hslDate').addEventListener('change', ui);
    document.getElementById('hslDocAdd').addEventListener('click', () => { const saved = hsSaveLog(true); if (saved) hsUploadDoc('log:' + saved.id, 'rechnung', saved); });
    body.querySelectorAll('[data-hsact="doc-open"]').forEach(b => b.addEventListener('click', () => { hsCloseModal(); openDocDetail(b.dataset.id); }));
    ui();
    hsWireFooter('hsLog', () => hsSaveLog(false), () => hsDeleteLog(l.id));
  });
}
function hsSaveLog(keepQuiet) {
  const st = hsModalState;
  if (!st || st.mode !== 'log') return null;
  const err = msg => { fzShowErr('hsLogError', msg); return null; };
  const t = hsLogType(st.type);
  const existing = st.id ? hsLogById(st.id) : null;
  const date = fzVal('hslDate');
  if (!vtIsIso(date)) return err(tk('fin.err.needDate'));
  let amount = hsEuro('hslAmount');
  if (Number.isNaN(amount)) return err(tk('home.pleaseEnterValidAmount'));
  amount = amount === '' ? 0 : amount;
  if (t.settle) { const neg = document.querySelector('#hslSettleWrap [data-sign="-1"]').classList.contains('active'); if (neg) amount = -amount; }
  const labor = t.labor ? hsEuro('hslLabor') : '';
  if (Number.isNaN(labor)) return err(tk('home.pleaseEnterValidLabour'));
  if (labor !== '' && labor > Math.abs(amount) && amount) return err(tk('home.labourCostsHigherThan'));
  const desc = fzVal('hslDesc').slice(0, 120);
  if (!desc && !amount) return err(tk('home.pleaseEnterDescriptionAmount'));
  const id = existing ? existing.id : newRecordId();
  const booked = !!amount && fzChecked('hslBooked');
  const log = {
    ...(existing || {}),
    id, home: st.home, type: t.id, date, desc, amount: amount ? Math.round(amount * 100) / 100 : '',
    labor: labor === '' ? '' : labor, booked, paidBy: fzVal('hslPaidBy'),
    project: fzVal('hslProject'), room: fzVal('hslRoom').slice(0, 60),
    warranty: t.warranty && vtIsIso(fzVal('hslWarranty')) ? fzVal('hslWarranty') : '',
    note: fzVal('hslNote').slice(0, 500),
    docLinks: (existing && Array.isArray(existing.docLinks)) ? existing.docLinks : [],
    created: (existing && existing.created) || new Date().toISOString(),
  };
  hsUpsert('homeLog', log);
  const h = hsHomeById(st.home);
  if (booked) {
    const prev = ausgaben.find(x => x.id === id);
    finQueueSave({
      id, amount: log.amount, date, category: (prev && prev.category) || HS_FIN_CATEGORY,
      title: (desc || t.label) + ' · ' + hsName(h), note: log.note, paidBy: log.paidBy, link: 'haus:' + st.home,
      store: '', listId: '', items: [],
      createdBy: prev ? (prev.createdBy || '') : ((currentUser() && currentUser().id) || ''),
      created: prev ? (prev.created || '') : new Date().toISOString(),
    });
  } else if (existing && existing.booked) {
    finQueueDelete(id);
  }
  hsModalState = { ...st, id };
  if (!keepQuiet) {
    hsCloseModal();
    hsYear = Number(date.slice(0, 4)) || hsYear;
    finShowToast(existing || !booked ? tk('common.saved') : tk('home.savedAndBooked'));
  }
  hsAfterChange();
  return log;
}
function hsDeleteLog(id) {
  const l = hsLogById(id);
  if (!l) return;
  if (!confirm(tk('lists.item.confirmDelete', { name: hsLogTitle(l) }) + (l.booked ? (' ' + tk('home.expenseFinanceWillDeleted')) : '') + ' ' + tk('home.linkedDocsStay'))) return;
  hsSet('homeLog', hsArr('homeLog').filter(x => x.id !== id));
  if (l.booked) finQueueDelete(id);
  hsCloseModal();
  hsAfterChange();
  finShowToast(tk('home.deleted'));
}

/* ---------- Popup: defect ---------- */
function hsOpenDefectModal(id) {
  const h = hsCurrent();
  if (!h || !hsCanEdit()) return;
  const x = id ? hsDefectById(id) : null;
  const today = finTodayIso();
  const d = x || { date: today, severity: 'mittel', status: 'offen', moveIn: false };
  hsModalState = { mode: 'defect', id: x ? x.id : null, home: x ? x.home : h.id };
  const roomList = [...new Set([...rooms.map(r => r.name), ...hsDefects(h.id).map(y => y.room)].filter(Boolean))];
  const html = `
    <h3 class="font-serif text-lg mb-3 pr-6">${x ? tk('home.editDefect') : tk('home.newDefect')}</h3>
    ${fzIn('hsdTitle', tk('home.whatBroken'), d.title || '', { ph: tk('home.eGMouldBathroom'), max: 120 })}
    <div class="fz-grid2">
      ${fzIn('hsdRoom', tk('household.room'), d.room || '', { ph: 'optional', max: 60 })}
      ${fzIn('hsdDate', tk('home.found'), vtIsIso(d.date) ? d.date : today, { type: 'date' })}
    </div>
    <datalist id="hsdRooms">${roomList.map(n => `<option value="${hsEsc(n)}"></option>`).join('')}</datalist>
    <div class="fz-grid2">
      ${fzSel('hsdSeverity', tk('home.howBad'), HS_SEVERITY, d.severity || 'mittel')}
      ${fzSel('hsdStatus', 'Status', HS_DEFECT_STATUS, d.status || 'offen')}
    </div>
    <div class="fz-grid2" id="hsdReportWrap">
      ${fzIn('hsdReported', hsOwn(h) ? tk('home.commissioned') : tk('home.reported'), d.reported || '', { type: 'date' })}
      ${fzIn('hsdDeadline', tk('home.deadline'), d.deadline || '', { type: 'date' })}
    </div>
    <div id="hsdFixedWrap">${fzIn('hsdFixed', tk('home.fixed'), d.fixed || '', { type: 'date' })}</div>
    <label class="fz-check"><input type="checkbox" id="hsdMoveIn"${d.moveIn ? ' checked' : ''} /> <span>${tk('home.alreadyPresentWhenMoving')} <span class="text-ink/45">${tk('home.notCausedUs')}</span></span></label>
    <div class="fz-field"><label class="fz-lbl" for="hsdNote">${tk('fin.csv.description')}</label><textarea id="hsdNote" rows="3" maxlength="2000" class="fz-in" placeholder="${escapeHtml(tk('home.whereExactlySinceWhen'))}">${hsEsc(d.note || '')}</textarea></div>
    <div class="flex items-center justify-between gap-2">
      <span class="fz-lbl" style="margin:0">${tk('home.photosDocuments')}</span>
      <button type="button" id="hsdDocAdd" class="fz-mini-btn">${tk('home.addPhoto')}</button>
    </div>
    <div class="flex flex-col gap-1.5 mt-1.5">${x ? hsDocsOf(x).map(hsDocRowHtml).join('') : ''}</div>
    ${hsFooter('hsDefect', !!x)}`;
  hsOpenModal(html, body => {
    document.getElementById('hsdRoom').setAttribute('list', 'hsdRooms');
    const ui = () => {
      const s = fzVal('hsdStatus');
      document.getElementById('hsdReportWrap').classList.toggle('hidden', s === 'offen');
      document.getElementById('hsdFixedWrap').classList.toggle('hidden', s !== 'behoben');
      if (s === 'gemeldet' && !fzVal('hsdReported')) document.getElementById('hsdReported').value = today;
      if (s === 'gemeldet' && !fzVal('hsdDeadline')) document.getElementById('hsdDeadline').value = vtAddDays(fzVal('hsdReported') || today, 14);
      if (s === 'behoben' && !fzVal('hsdFixed')) document.getElementById('hsdFixed').value = today;
    };
    document.getElementById('hsdStatus').addEventListener('change', ui);
    document.getElementById('hsdDocAdd').addEventListener('click', () => { const saved = hsSaveDefect(true); if (saved) hsUploadDoc('defect:' + saved.id, 'foto', saved); });
    body.querySelectorAll('[data-hsact="doc-open"]').forEach(b => b.addEventListener('click', () => { hsCloseModal(); openDocDetail(b.dataset.id); }));
    ui();
    hsWireFooter('hsDefect', () => hsSaveDefect(false), () => hsDeleteDefect(x.id));
  });
}
function hsSaveDefect(keepQuiet) {
  const st = hsModalState;
  if (!st || st.mode !== 'defect') return null;
  const title = fzVal('hsdTitle').slice(0, 120);
  if (!title) { fzShowErr('hsDefectError', tk('home.pleaseBrieflyDescribeWhat')); return null; }
  const existing = st.id ? hsDefectById(st.id) : null;
  const status = fzVal('hsdStatus') || 'offen';
  const iso = id => vtIsIso(fzVal(id)) ? fzVal(id) : '';
  const d = {
    ...(existing || {}),
    id: existing ? existing.id : newRecordId(), home: st.home, title, room: fzVal('hsdRoom').slice(0, 60),
    date: iso('hsdDate') || finTodayIso(), severity: fzVal('hsdSeverity') || 'mittel', status,
    reported: status === 'offen' ? '' : iso('hsdReported'), deadline: status === 'offen' ? '' : iso('hsdDeadline'),
    fixed: status === 'behoben' ? (iso('hsdFixed') || finTodayIso()) : '',
    moveIn: fzChecked('hsdMoveIn'), note: (document.getElementById('hsdNote').value || '').trim().slice(0, 2000),
    docLinks: (existing && Array.isArray(existing.docLinks)) ? existing.docLinks : [],
    created: (existing && existing.created) || new Date().toISOString(),
  };
  hsUpsert('homeDefects', d);
  hsModalState = { ...st, id: d.id };
  if (!keepQuiet) { hsCloseModal(); finShowToast(tk('common.saved')); }
  hsAfterChange();
  return d;
}
function hsDeleteDefect(id) {
  const d = hsDefectById(id);
  if (!d || !confirm(tk('home.confirmDeleteDefect', { name: d.title || '' }))) return;
  hsSet('homeDefects', hsArr('homeDefects').filter(x => x.id !== id));
  hsCloseModal();
  hsAfterChange();
}
// Defect notice to the landlord (text to copy, share or send as e-mail)
function hsOpenDefectLetter() {
  const h = hsCurrent();
  if (!h) return;
  const open = hsDefects(h.id).filter(d => d.status !== 'behoben');
  if (!open.length) return;
  const today = finTodayIso();
  const html = `
    <h3 class="font-serif text-lg mb-1 pr-6">${tk('home.defectNotice3')}</h3>
    <p class="text-xs text-ink/50 mb-3">${tk('home.whichDefectsShouldIncluded')}</p>
    <div class="flex flex-col gap-1.5 mb-3" id="hsLetterPick">${open.map(d => `<button type="button" class="fz-pick-row active" data-id="${hsEsc(d.id)}"><span class="flex-1 min-w-0"><span class="block text-sm font-medium truncate">${hsEsc(d.title)}</span><span class="block text-[11px] text-ink/45 truncate">${hsEsc([d.room, vtFmt(d.date)].filter(Boolean).join(' · '))}</span></span><span class="shrink-0 text-lg">✓</span></button>`).join('')}</div>
    ${fzIn('hsLetterDeadline', tk('home.deadlineRepair'), vtAddDays(today, 14), { type: 'date' })}
    <div class="fz-field"><label class="fz-lbl" for="hsLetterText">${tk('recipe.ai.text')}</label><textarea id="hsLetterText" rows="12" class="fz-in" style="font-size:.85rem"></textarea></div>
    <label class="fz-check"><input type="checkbox" id="hsLetterMark" checked /> <span>${tk('home.markSelectedDefectsReported')}</span></label>
    <div class="flex flex-wrap items-center gap-2 mt-3">
      <button type="button" id="hsLetterCopy" class="fz-mini-btn">${tk('contract.copy')}</button>
      ${navigator.share ? ('<button type="button" id="hsLetterShare" class="fz-mini-btn">' + tk('home.share') + '</button>') : ''}
      ${h.landlord && h.landlord.email ? ('<button type="button" id="hsLetterMail" class="fz-mini-btn">' + tk('school.email') + '</button>') : ''}
      <div class="flex-1"></div>
      <button type="button" id="hsLetterDone" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90">${tk('common.done')}</button>
    </div>`;
  hsOpenModal(html, body => {
    const picked = () => [...body.querySelectorAll('#hsLetterPick .active')].map(b => hsDefectById(b.dataset.id)).filter(Boolean);
    const build = () => {
      const lord = h.landlord || {};
      const me = currentMember() ? memberLabel(currentMember()) : '';
      const dl = fzVal('hsLetterDeadline');
      const lines = [];
      if (lord.name) lines.push(lord.name);
      if (lord.address) lines.push(lord.address);
      lines.push('', vtFmt(today), '', tk('home.letter.subject', { address: h.address || hsName(h) }), '');
      lines.push(tk('home.letter.greeting'), '');
      lines.push(tk('home.letter.intro'), '');
      picked().forEach((d, i) => lines.push((i + 1) + '. ' + d.title + (d.room ? ' (' + d.room + ')' : '') + ' – ' + tk('home.letter.foundOn', { date: vtFmt(d.date) }) + (d.note ? '\n   ' + d.note.replace(/\n/g, '\n   ') : '')));
      lines.push('', tk('home.letter.deadline', { date: vtFmt(dl) }));
      lines.push(tk('home.letter.reduction'), '');
      lines.push(tk('home.letter.regards'), me);
      document.getElementById('hsLetterText').value = lines.join('\n');
    };
    body.querySelectorAll('#hsLetterPick [data-id]').forEach(b => b.addEventListener('click', () => { b.classList.toggle('active'); b.lastElementChild.textContent = b.classList.contains('active') ? '✓' : ''; build(); }));
    document.getElementById('hsLetterDeadline').addEventListener('change', build);
    build();
    const text = () => document.getElementById('hsLetterText').value;
    document.getElementById('hsLetterCopy').addEventListener('click', () => { try { navigator.clipboard.writeText(text()); finShowToast(tk('common.copied')); } catch (e) { /* ignore */ } });
    const sh = document.getElementById('hsLetterShare');
    if (sh) sh.addEventListener('click', () => { navigator.share({ title: tk('home.defectNotice3'), text: text() }).catch(() => { /* cancelled */ }); });
    const ml = document.getElementById('hsLetterMail');
    if (ml) ml.addEventListener('click', () => { location.href = 'mailto:' + encodeURIComponent(h.landlord.email) + '?subject=' + encodeURIComponent(tk('home.letter.mailSubject', { address: h.address || '' }).trim()) + '&body=' + encodeURIComponent(text()); });
    document.getElementById('hsLetterDone').addEventListener('click', () => {
      if (fzChecked('hsLetterMark')) {
        const dl = vtIsIso(fzVal('hsLetterDeadline')) ? fzVal('hsLetterDeadline') : '';
        const ids = new Set(picked().map(d => d.id));
        hsSet('homeDefects', hsArr('homeDefects').map(d => ids.has(d.id) && d.status === 'offen' ? { ...d, status: 'gemeldet', reported: today, deadline: dl } : d));
        hsAfterChange();
      }
      hsCloseModal();
    });
  });
}

/* ---------- Popup: project ---------- */
function hsOpenProjectModal(id) {
  const h = hsCurrent();
  if (!h || !hsCanEdit()) return;
  const p = id ? hsProjectById(id) : null;
  const d = p || { status: 'geplant', area: 'sonstiges', year: new Date().getFullYear(), prio: 2 };
  hsModalState = { mode: 'project', id: p ? p.id : null, home: p ? p.home : h.id };
  const html = `
    <h3 class="font-serif text-lg mb-3 pr-6">${p ? tk('home.editProject') : tk('home.newProject')}</h3>
    ${fzIn('hspTitle', tk('home.project'), d.title || '', { ph: hsOwn(h) ? tk('home.eGReplaceWindows') : tk('home.eGPaintLiving'), max: 100 })}
    <div class="fz-grid2">${fzSel('hspArea', tk('lists.section'), HS_PROJECT_AREAS, d.area || 'sonstiges')}${fzSel('hspStatus', 'Status', HS_PROJECT_STATUS, d.status || 'geplant')}</div>
    <div class="fz-grid3">
      ${fzIn('hspYear', tk('cal.year'), Number(d.year) > 0 ? String(d.year) : '', { mode: 'numeric', max: 4 })}
      ${fzIn('hspBudget', tk('home.budget'), Number(d.budget) > 0 ? euroInputValue(d.budget) : '', { mode: 'decimal', unit: curSym() })}
      ${fzIn('hspFunding', tk('home.subsidy'), Number(d.funding) > 0 ? euroInputValue(d.funding) : '', { mode: 'decimal', unit: curSym() })}
    </div>
    ${fzSel('hspPrio', tk('home.priority'), [['1', tk('home.high')], ['2', tk('home.standard')], ['3', tk('home.canWait')]], String(d.prio || 2))}
    <div class="fz-field"><label class="fz-lbl" for="hspNote">${tk('fin.csv.note')}</label><textarea id="hspNote" rows="3" maxlength="2000" class="fz-in" placeholder="${escapeHtml(tk('home.quotesTradesmenSubsidyProgramme'))}">${hsEsc(d.note || '')}</textarea></div>
    ${hsFooter('hsProject', !!p)}`;
  hsOpenModal(html, () => hsWireFooter('hsProject', hsSaveProject, () => hsDeleteProject(p.id)));
}
function hsSaveProject() {
  const st = hsModalState;
  if (!st || st.mode !== 'project') return;
  const title = fzVal('hspTitle').slice(0, 100);
  if (!title) return fzShowErr('hsProjectError', tk('common.needName'));
  const budget = hsEuro('hspBudget'), funding = hsEuro('hspFunding');
  if (Number.isNaN(budget) || Number.isNaN(funding)) return fzShowErr('hsProjectError', tk('home.pleaseEnterValidAmount'));
  const year = parseInt(fzVal('hspYear'), 10);
  const existing = st.id ? hsProjectById(st.id) : null;
  hsUpsert('homeProjects', {
    ...(existing || {}),
    id: existing ? existing.id : newRecordId(), home: st.home, title, area: fzVal('hspArea'), status: fzVal('hspStatus'),
    year: year >= 1900 && year <= 2200 ? year : '', budget, funding, prio: Number(fzVal('hspPrio')) || 2,
    note: (document.getElementById('hspNote').value || '').trim().slice(0, 2000),
    created: (existing && existing.created) || new Date().toISOString(),
  });
  hsCloseModal();
  hsAfterChange();
}
function hsDeleteProject(id) {
  const p = hsProjectById(id);
  if (!p || !confirm(tk('home.confirmDeleteProject', { name: p.title || '' }))) return;
  hsSet('homeProjects', hsArr('homeProjects').filter(x => x.id !== id));
  hsSet('homeLog', hsArr('homeLog').map(l => l.project === id ? { ...l, project: '' } : l));
  hsCloseModal();
  hsAfterChange();
}

/* ---------- Popup: meter ---------- */
function hsOpenMeterModal(id, typePreset) {
  const h = hsCurrent();
  if (!h || !hsCanEdit()) return;
  const m = id ? hsMeterById(id) : null;
  const t0 = hsMeterType(m ? m.type : (typePreset || 'strom'));
  const d = m || { type: t0.id, active: true, billStart: '01-01' };
  hsModalState = { mode: 'meter', id: m ? m.id : null, home: m ? m.home : h.id, type: t0.id };
  const bs = /^\d{2}-\d{2}$/.test(d.billStart || '') ? d.billStart : '01-01';
  const html = `
    <h3 class="font-serif text-lg mb-3 pr-6">${m ? tk('home.editMeter') : tk('home.newMeter')}</h3>
    <div class="fz-type-row mb-3" id="hsmTypes">${HS_METER_TYPES.map(x => `<button type="button" class="fz-type-chip${x.id === t0.id ? ' active' : ''}" data-type="${x.id}"><span class="fz-ti">${x.icon}</span>${hsEsc(x.label)}</button>`).join('')}</div>
    <div class="fz-grid2">
      ${fzIn('hsmName', tk('common.name'), d.name || '', { ph: tk('home.optionalEGFlat'), max: 40 })}
      ${fzIn('hsmNumber', tk('home.meterNumber'), d.number || '', { ph: 'optional', max: 40 })}
    </div>
    <div class="fz-grid2">
      ${fzIn('hsmPrice', tk('home.unitPrice'), Number(d.price) > 0 ? hsDecInput(d.price, 4) : '', { mode: 'decimal', unit: curSym() + '/' + hsBillUnit(d), ph: hsDecInput(t0.price, 2) })}
      ${fzIn('hsmBase', tk('home.standingCharge'), Number(d.base) > 0 ? euroInputValue(d.base) : '', { mode: 'decimal', unit: curSym() + tk('home.perMonthUnit') })}
    </div>
    <div id="hsmFactorWrap">${fzIn('hsmFactor', tk('home.conversionM3Kwh'), Number(d.factor) > 0 ? hsDecInput(d.factor, 4) : '', { mode: 'decimal', ph: hsDecInput(t0.factor || 10.3, 2), unit: 'kWh/m³' })}<p class="text-[11px] text-ink/45 -mt-2 mb-3">${tk('home.calorificValueCorrectionFactor')}</p></div>
    <div class="fz-grid2" id="hsmAdvWrap">
      ${fzIn('hsmAdvance', tk('home.monthlyPayment'), Number(d.advance) > 0 ? euroInputValue(d.advance) : '', { mode: 'decimal', unit: curSym() + tk('home.perMonthUnit') })}
      <div class="fz-field"><label class="fz-lbl" for="hsmBillM">${tk('home.billingPeriodStarts')}</label>
        <div class="fz-grid2" style="gap:.4rem">
          <input id="hsmBillD" type="text" inputmode="numeric" maxlength="2" class="fz-in" value="${hsEsc(bs.slice(3, 5))}" aria-label="${escapeHtml(tk('cal.day'))}" />
          <select id="hsmBillM" class="fz-in">${Array.from({ length: 12 }, (_, i) => `<option value="${pad2(i + 1)}"${pad2(i + 1) === bs.slice(0, 2) ? ' selected' : ''}>${hsEsc(fzMonthName(i))}</option>`).join('')}</select>
        </div>
      </div>
    </div>
    <label class="fz-check"><input type="checkbox" id="hsmActive"${d.active !== false ? ' checked' : ''} /> <span>${tk('home.beingRead')} <span class="text-ink/45">${tk('home.offHistoryOnly')}</span></span></label>
    <p class="text-[11px] text-ink/45">${tk('home.pricesMonthlyPaymentLast')}</p>
    ${hsFooter('hsMeter', !!m)}`;
  hsOpenModal(html, body => {
    const ui = () => {
      const t = hsMeterType(hsModalState.type);
      document.getElementById('hsmFactorWrap').classList.toggle('hidden', !t.factor);
      document.getElementById('hsmAdvWrap').classList.toggle('hidden', !!t.income);
      const pu = document.querySelector('#hsmPrice + span');
      if (pu) pu.textContent = curSym() + '/' + (t.billUnit || t.unit);
      document.getElementById('hsmPrice').placeholder = hsDecInput(t.price, 2);
      document.querySelector('label[for="hsmPrice"]').textContent = t.income ? tk('home.feedTariff') : tk('home.unitPrice');
    };
    body.querySelectorAll('#hsmTypes .fz-type-chip').forEach(b => b.addEventListener('click', () => {
      hsModalState.type = b.dataset.type;
      body.querySelectorAll('#hsmTypes .fz-type-chip').forEach(x => x.classList.toggle('active', x === b));
      ui();
    }));
    ui();
    hsWireFooter('hsMeter', hsSaveMeter, () => hsDeleteMeter(m.id));
  });
}
function hsSaveMeter() {
  const st = hsModalState;
  if (!st || st.mode !== 'meter') return;
  const err = msg => fzShowErr('hsMeterError', msg);
  const price = fzVal('hsmPrice') ? hsDec(fzVal('hsmPrice')) : '';
  const factor = fzVal('hsmFactor') ? hsDec(fzVal('hsmFactor')) : '';
  const base = hsEuro('hsmBase'), advance = hsEuro('hsmAdvance');
  if ((price !== '' && !(price >= 0 && price < 100)) || (factor !== '' && !(factor > 0 && factor < 50)) || Number.isNaN(base) || Number.isNaN(advance)) return err(tk('home.pleaseEnterValidNumbers'));
  let day = parseInt(fzVal('hsmBillD'), 10);
  const mon = fzVal('hsmBillM') || '01';
  const dim = vtDim(2025, Number(mon));
  if (!(day >= 1)) day = 1;
  if (day > dim) day = dim;
  const existing = st.id ? hsMeterById(st.id) : null;
  const m = {
    ...(existing || {}),
    id: existing ? existing.id : newRecordId(), home: st.home, type: st.type,
    name: fzVal('hsmName').slice(0, 40), number: fzVal('hsmNumber').slice(0, 40),
    price: price === '' ? '' : Math.round(price * 10000) / 10000, base, factor: factor === '' ? '' : factor, advance,
    billStart: mon + '-' + pad2(day), active: fzChecked('hsmActive'),
    created: (existing && existing.created) || new Date().toISOString(),
  };
  hsUpsert('homeMeters', m);
  hsCloseModal();
  hsAfterChange();
  if (!existing) setTimeout(() => hsOpenReadingModal({ meterId: m.id }), 250);
}
function hsDeleteMeter(id) {
  const m = hsMeterById(id);
  if (!m || !confirm(tk('home.confirmDeleteMeter', { n: hsReadings(id).length }))) return;
  hsSet('homeMeters', hsArr('homeMeters').filter(x => x.id !== id));
  hsSet('homeReadings', hsArr('homeReadings').filter(x => x.meter !== id));
  hsCloseModal();
  hsAfterChange();
}

/* ---------- Popup: meter reading (by hand or from a photo with AI) ---------- */
function hsOpenReadingModal({ meterId = '', id = '', fromRun = false } = {}) {
  if (!fromRun) hsMeterRun = null;
  const h = hsCurrent();
  if (!h || !hsCanEdit()) return;
  const r = id ? hsReadingById(id) : null;
  const meters = hsMeters(h.id).filter(m => m.active !== false || (r && r.meter === m.id));
  if (!meters.length) { hsTab = 'zaehler'; renderHouse(); hsOpenMeterModal(null); return; }
  const mid = r ? r.meter : (meterId && hsMeterById(meterId) ? meterId : meters[0].id);
  hsModalState = { mode: 'reading', id: r ? r.id : null, meter: mid, source: r ? (r.source || 'hand') : 'hand' };
  const today = finTodayIso();
  recipeKiLoadStatus();
  const html = `
    <h3 class="font-serif text-lg mb-3 pr-6">${r ? tk('home.editMeterReading') : tk('home.meterReading2')}</h3>
    ${hsMeterRun && !r ? `<p class="text-xs text-ink/55 -mt-2 mb-3">📟 ${hsEsc(tk('home.metersOpen', { n: hsMeterPending(hsMeterRun.cutoff).length, total: hsAllActiveMeters().length }))}</p>` : ''}
    <div class="fz-type-row mb-3" id="hsrMeters">${meters.map(m => { const t = hsMeterType(m.type); return `<button type="button" class="fz-type-chip${m.id === mid ? ' active' : ''}" data-m="${hsEsc(m.id)}"><span class="fz-ti">${t.icon}</span>${hsEsc(m.name || t.label)}</button>`; }).join('')}</div>
    <button type="button" id="hsrKi" class="w-full mb-3 px-3 py-2.5 rounded-xl border border-dashed border-pine/50 text-sm text-pine hover:bg-pine/5 transition">${tk('home.photoMeterAiReads')}</button>
    <input type="file" id="hsrFile" accept="image/*" capture="environment" class="hidden" />
    <p id="hsrKiInfo" class="hidden text-xs mb-3"></p>
    <div class="fz-grid2">
      ${fzIn('hsrValue', tk('lists.item.status'), r ? hsDecInput(r.value, 3) : '', { mode: 'decimal', unit: hsMeterType(hsMeterById(mid).type).unit })}
      ${fzIn('hsrDate', tk('fin.csv.date'), r ? r.date : today, { type: 'date' })}
    </div>
    <p id="hsrLast" class="text-[11px] text-ink/45 -mt-2 mb-3"></p>
    <label class="fz-check"><input type="checkbox" id="hsrReset"${r && r.reset ? ' checked' : ''} /> <span>${tk('home.newMeterMeterReplaced')}</span></label>
    ${fzIn('hsrNote', tk('fin.csv.note'), r ? (r.note || '') : '', { ph: 'optional', max: 200 })}
    ${hsFooter('hsReading', !!r)}`;
  hsOpenModal(html, body => {
    const ui = () => {
      const m = hsMeterById(hsModalState.meter);
      const t = hsMeterType(m.type);
      const unitEl = document.querySelector('#hsrValue + span');
      if (unitEl) unitEl.textContent = t.unit;
      const rs = hsReadings(m.id).filter(x => !r || x.id !== r.id);
      const last = rs.length ? rs[rs.length - 1] : null;
      document.getElementById('hsrLast').textContent = last ? tk('home.lastReadingValue', { value: hsNum(last.value, t.unit === 'kWh' ? 1 : 3) + ' ' + t.unit, date: vtFmt(last.date) }) : tk('home.noReadingEnteredYet');
      const ki = !!(recipeKiStatus && recipeKiStatus.aktiv);
      document.getElementById('hsrKi').classList.toggle('hidden', !ki);
    };
    body.querySelectorAll('#hsrMeters .fz-type-chip').forEach(b => b.addEventListener('click', () => {
      hsModalState.meter = b.dataset.m;
      body.querySelectorAll('#hsrMeters .fz-type-chip').forEach(x => x.classList.toggle('active', x === b));
      ui();
    }));
    document.getElementById('hsrValue').addEventListener('input', () => { hsModalState.source = 'hand'; });
    document.getElementById('hsrKi').addEventListener('click', () => document.getElementById('hsrFile').click());
    document.getElementById('hsrFile').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) hsReadMeterPhoto(f); });
    ui();
    Promise.resolve(recipeKiLoadStatus()).then(() => { if (hsModalState && hsModalState.mode === 'reading') ui(); }).catch(() => { /* offline */ });
    hsWireFooter('hsReading', hsSaveReading, () => hsDeleteReading(r.id));
  });
}
async function hsReadMeterPhoto(file) {
  const info = document.getElementById('hsrKiInfo');
  const btn = document.getElementById('hsrKi');
  const show = (txt, bad) => { if (!info) return; info.textContent = txt; info.classList.remove('hidden'); info.classList.toggle('text-red-500', !!bad); info.classList.toggle('text-ink/55', !bad); };
  if (!navigator.onLine) { show(tk('home.noConnectionPleaseEnter'), true); return; }
  const st = hsModalState;
  if (!st || st.mode !== 'reading') return;
  const m = hsMeterById(st.meter);
  const t = hsMeterType(m.type);
  const rs = hsReadings(m.id);
  btn.disabled = true;
  show(tk('home.aiReadsMeter'));
  try {
    const part = await recipeKiImagePart(file);
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 120000) : null;
    let res;
    try {
      res = await apiFetch('/api/pinn/ki/zaehler', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateien: [part], art: t.label, einheit: t.unit, letzter: rs.length ? Number(rs[rs.length - 1].value) : 0, nummer: m.number || '' }),
        signal: ctrl ? ctrl.signal : undefined,
      });
    } finally { if (timer) clearTimeout(timer); }
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (res.status === 404) throw new Error(tk('school.newFilesKiPb'));
    if (!res.ok || !data.zaehler) throw new Error(data.error || tk('home.serverError', { status: res.status }));
    const z = data.zaehler;
    if (!hsModalState || hsModalState.mode !== 'reading') return;
    document.getElementById('hsrValue').value = hsDecInput(z.stand, 3);
    hsModalState.source = 'ki';
    if (z.nummer && !m.number) hsModalState.number = z.nummer;
    const warnNr = z.nummer && m.number && String(z.nummer).replace(/\W/g, '') !== String(m.number).replace(/\W/g, '');
    const parts = [tk('home.aiRead', { value: hsNum(z.stand, 3) + ' ' + t.unit }) + (z.sicher < 0.7 ? (' ' + tk('home.pleaseCheckCarefully')) : (' ' + tk('home.pleaseCheckBriefly')))];
    if (warnNr) parts.push(tk('home.meterNumberMismatch', { read: z.nummer, saved: m.number }));
    if (z.hinweis) parts.push(z.hinweis);
    show(parts.join(' '), z.sicher < 0.7 || warnNr);
  } catch (err) {
    const msg = err && err.name === 'AbortError' ? tk('school.aiTookTooLong') : (err && err.message ? err.message : tk('home.unknownError'));
    show(tk('home.aiFailedEnterSelf', { msg }), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}
function hsSaveReading() {
  const st = hsModalState;
  if (!st || st.mode !== 'reading') return;
  const err = msg => fzShowErr('hsReadingError', msg);
  const value = hsDec(fzVal('hsrValue'));
  const date = fzVal('hsrDate');
  if (!(value >= 0) || value > 1e9) return err(tk('home.pleaseEnterMeterReading'));
  if (!vtIsIso(date)) return err(tk('fin.err.needDate'));
  if (date > finTodayIso()) return err(tk('home.dateFuture'));
  const existing = st.id ? hsReadingById(st.id) : null;
  const reset = fzChecked('hsrReset');
  const others = hsReadings(st.meter).filter(x => !existing || x.id !== existing.id);
  const before = others.filter(x => x.date <= date).pop();
  const after = others.find(x => x.date > date);
  if (!reset && ((before && value < Number(before.value)) || (after && !after.reset && value > Number(after.value)))) {
    if (!confirm(tk('home.readingDoesntFitOthers'))) return;
  }
  hsUpsert('homeReadings', {
    ...(existing || {}),
    id: existing ? existing.id : newRecordId(), meter: st.meter, date, value: Math.round(value * 1000) / 1000, reset,
    source: st.source || 'hand', note: fzVal('hsrNote').slice(0, 200), created: (existing && existing.created) || new Date().toISOString(),
  });
  if (st.number) hsUpsert('homeMeters', { ...hsMeterById(st.meter), number: st.number });
  hsMeterOpen = '';
  hsCloseModal();
  hsAfterChange();
  const m = hsMeterById(st.meter);
  const fc = hsForecast(m);
  finShowToast(fc.diff != null ? (fc.diff > 0 ? tk('home.savedBackPaymentLikely') : tk('home.savedCreditLikely')) : tk('common.saved'));
  // Since 1.57: completes "Zählerstände ablesen" or continues with the next meter
  if (!existing) hsMeterAfterReading();
}
function hsDeleteReading(id) {
  if (!confirm(tk('home.deleteMeterReading'))) return;
  hsSet('homeReadings', hsArr('homeReadings').filter(x => x.id !== id));
  hsCloseModal();
  hsAfterChange();
}

/* ---------- Popup: maintenance ---------- */
function hsOpenMaintModal(id, tplId, garden = false) {
  if (!hsCanEdit()) return;
  const x = id ? hsMaintItems().find(m => m.id === id) : null;
  const tpl = tplId ? HS_MAINT_TEMPLATES.find(t => t.tpl === tplId) : null;
  const today = finTodayIso();
  let firstDue = today;
  if (tpl && tpl.month) {
    const y = Number(today.slice(0, 4));
    firstDue = vtIso(y, tpl.month, 1);
    if (firstDue < today) firstDue = tpl.month === Number(today.slice(5, 7)) ? today : vtIso(y + 1, tpl.month, 1);
  }
  const d = x || { icon: tpl ? tpl.icon : '🔧', title: tpl ? tpl.title : '', months: tpl ? tpl.months : 12, lead: 0, active: true, assignedMemberIds: [], rotate: '', tpl: tpl ? tpl.tpl : '' };
  const next = x ? hsMaintNext(x) : firstDue;
  hsModalState = { mode: 'maint', id: x ? x.id : null, tpl: d.tpl || '', nextStart: next, oldKey: x ? hsMaintKey(x) : '', garden: !!(garden || (tpl && tpl.garden) || (x && x.garden)) };
  const monthsOpts = [[1, tk('fin.interval.monthly')], [2, tk('home.every2Months')], [3, tk('home.quarterly')], [6, tk('home.halfYearly2')], [12, tk('fin.interval.yearly')], [24, tk('home.every2Years')], [36, tk('home.every3Years')], [60, tk('home.every5Years')]];
  if (!monthsOpts.some(o => o[0] === Number(d.months))) monthsOpts.push([Number(d.months), tk('home.everyNMonthsCap', { n: Number(d.months) })]);
  const html = `
    <h3 class="font-serif text-lg mb-3 pr-6">${x ? tk('home.editMaintenance') : tk('home.newMaintenance')}</h3>
    <div class="grid gap-3" style="grid-template-columns:4.2rem minmax(0,1fr)">
      ${fzIn('hswIcon', tk('household.icon'), d.icon || '🔧', { max: 8 })}
      ${fzIn('hswTitle', tk('school.whatNeedsDoing'), d.title || '', { ph: hsModalState.garden ? tk('home.eGCutBack') : tk('home.eGClearGutter'), max: 100 })}
    </div>
    <div class="fz-grid2">
      ${fzSel('hswMonths', tk('home.howOften'), monthsOpts.map(o => [String(o[0]), o[1]]), String(d.months || 12))}
      ${fzIn('hswNext', tk('home.nextDue'), next, { type: 'date' })}
    </div>
    ${fzSel('hswLead', tk('home.createTask'), [['0', tk('home.dueDate')], ['3', tk('pantry.settings.before3')], ['7', tk('home.n1WeekBefore')], ['14', tk('home.n2WeeksBefore')]], String(d.lead || 0))}
    <div class="fz-field"><span class="fz-lbl">${tk('home.whoTakesCare')}</span>${hsMemberChips('hswWho', d.assignedMemberIds || [])}<p class="text-[11px] text-ink/45 mt-1">${tk('home.nobodySelectedTaskEveryone')}</p></div>
    <label class="fz-check" id="hswRotateWrap"><input type="checkbox" id="hswRotate"${d.rotate ? ' checked' : ''} /> <span>${tk('rotation.toggle')} <span class="text-ink/45">${tk('home.whoeverDidLeastRecently')}</span></span></label>
    ${fzIn('hswNote', tk('home.noteTask'), d.note || '', { ph: tk('home.optionalEGBleed'), max: 300 })}
    <div class="fz-field">${taskRemindHtml('hsw', d.remindAt, { label: tk('household.extraRemind'), def: '09:00' })}</div>
    <label class="fz-check"><input type="checkbox" id="hswActive"${d.active !== false ? ' checked' : ''} /> <span>${tk('cat.active')} <span class="text-ink/45">${tk('home.offPausedNoTasks')}</span></span></label>
    ${hsFooter('hsMaint', !!x)}`;
  hsOpenModal(html, body => {
    hsWireChips(body, '#hswWho');
    taskRemindWire('hsw');
    const ui = () => { document.getElementById('hswRotateWrap').classList.toggle('hidden', hsChipVals('#hswWho').length < 2); };
    body.querySelectorAll('#hswWho .fz-member-chip').forEach(b => b.addEventListener('click', ui));
    ui();
    hsWireFooter('hsMaint', hsSaveMaint, () => hsDeleteMaint(x.id));
  });
}
function hsSaveMaint() {
  const st = hsModalState;
  if (!st || st.mode !== 'maint') return;
  const wanted = fzVal('hswTitle').replace(/\s+/g, ' ').slice(0, 100);
  if (!wanted) return fzShowErr('hsMaintError', tk('home.pleaseEnterWhatNeeds'));
  const next = fzVal('hswNext');
  if (!vtIsIso(next)) return fzShowErr('hsMaintError', tk('home.pleaseChooseDateNext'));
  const existing = st.id ? hsMaintItems().find(m => m.id === st.id) : null;
  const title = hsMaintUniqueTitle((fzVal('hswIcon') || '🔧').slice(0, 8), wanted, existing ? existing.id : '');
  const who = hsChipVals('#hswWho').filter(id => memberById(id));
  const item = {
    ...(existing || {}),
    id: existing ? existing.id : 'w' + newRecordId().slice(0, 12),
    tpl: st.tpl || '', icon: (fzVal('hswIcon') || '🔧').slice(0, 8), title,
    months: Number(fzVal('hswMonths')) || 12, lead: Number(fzVal('hswLead')) || 0,
    assignedMemberIds: who, rotate: who.length > 1 && fzChecked('hswRotate') ? 'fair' : '',
    note: fzVal('hswNote').slice(0, 300), active: fzChecked('hswActive'),
    remindAt: taskRemindValue('hsw'),
  };
  if (st.garden) item.garden = true;
  if (!existing || next !== st.nextStart) { item.next = next; item.nextSet = finTodayIso(); }
  const titleChanged = existing && hsMaintKey(existing) !== hsMaintKey(item);
  // Open task no longer fits (other title, new due date, paused): remove it – the server creates a matching one again
  if (existing) {
    const open = hsMaintOpen(existing);
    if (open && (titleChanged || item.active === false || (item.next && item.next !== open.dueDate && item.nextSet === finTodayIso() && next !== st.nextStart))) {
      queueTaskDelete(open.id);
      rebuildAufgaben();
      try { renderTasks(); } catch (e) { /* ignore */ }
      flushOutbox();
    }
  }
  houseMaintenance = existing ? hsMaintItems().map(m => m.id === item.id ? item : m) : [...hsMaintItems(), item];
  hsCloseModal();
  hsMaintChanged();
  // An open task of this entry takes over the reminder time right away
  const newKey = hsMaintKey(item);
  taskRemindApplyOpen(t => t.household === newKey, item.remindAt);
  if (title !== wanted) finShowToast(tk('home.savedAsName', { name: title }));
  else finShowToast(item.active ? tk('home.savedTaskWillAppear') : tk('common.saved'));
}
function hsDeleteMaint(id) {
  const x = hsMaintItems().find(m => m.id === id);
  if (!x || !confirm(tk('home.confirmDeleteMaint', { name: x.title }))) return;
  const open = hsMaintOpen(x);
  if (open) { queueTaskDelete(open.id); rebuildAufgaben(); try { renderTasks(); } catch (e) { /* ignore */ } flushOutbox(); }
  houseMaintenance = hsMaintItems().filter(m => m.id !== id);
  hsCloseModal();
  hsMaintChanged();
}
function hsMaintChanged() {
  Promise.resolve(persistState()).then(() => { if (typeof triggerHouseholdResync === 'function') triggerHouseholdResync(); }).catch(() => { /* will be sent later */ });
  if (currentView === 'haus') renderHouse();
  if (currentView === 'haushalt') renderHouseholdMaintenance();
}

/* ---------- Assign contracts ---------- */
function hsOpenContractAssign() {
  const h = hsCurrent();
  if (!h) return;
  const today = finTodayIso();
  const prio = ['energie', 'wohnen', 'internet', 'versicherung'];
  const list = vtContracts().filter(c => vtStatus(c, today).state !== 'beendet').slice().sort((a, b) => (prio.includes(a.category) ? 0 : 1) - (prio.includes(b.category) ? 0 : 1) || String(a.name || '').localeCompare(String(b.name || ''), 'de'));
  const rows = list.map(c => {
    const cat = vtCategory(c.category);
    const other = c.home && c.home !== h.id ? hsHomeById(c.home) : null;
    return `<button type="button" class="fz-pick-row${c.home === h.id ? ' active' : ''}" data-c="${hsEsc(c.id)}">
      <span class="text-xl shrink-0">${hsEsc(cat.icon || '📄')}</span>
      <span class="flex-1 min-w-0"><span class="block text-sm font-medium truncate">${hsEsc(c.name || tk('contract.docType.doc'))}</span><span class="block text-[11px] text-ink/45 truncate">${hsEsc([c.provider, cat.label, other ? tk('home.previously', { name: hsName(other) }) : ''].filter(Boolean).join(' · '))}</span></span>
      <span class="shrink-0 text-lg">${c.home === h.id ? '✓' : ''}</span>
    </button>`;
  }).join('');
  fzOpenModal2(`
    <h3 class="font-serif text-lg mb-1 pr-6">${tk('home.assignContracts')}</h3>
    <p class="text-xs text-ink/50 mb-3">${tk('home.tapAssignContractHome')}</p>
    <div class="flex flex-col gap-1.5">${rows || ('<p class="text-sm text-ink/45">' + tk('home.noContractsFinanceContracts') + '</p>')}</div>
    <div class="flex items-center gap-2 mt-4">
      <button type="button" id="hscNew" class="px-3 py-2 rounded-lg border border-ink/15 text-sm text-ink/70 hover:text-pine hover:border-pine transition">${tk('home.newContract')}</button>
      <div class="flex-1"></div>
      <button type="button" id="hscDone" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90">${tk('common.done')}</button>
    </div>`, body => {
    body.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
      const cid = b.dataset.c;
      finance.contracts = vtContracts().map(c => c.id === cid ? { ...c, home: c.home === h.id ? '' : h.id } : c);
      const on = vtContract(cid).home === h.id;
      b.classList.toggle('active', on);
      b.lastElementChild.textContent = on ? '✓' : '';
      persistState();
    }));
    document.getElementById('hscDone').addEventListener('click', () => { fzCloseModal2(); hsAfterChange(); });
    document.getElementById('hscNew').addEventListener('click', () => { fzCloseModal2(); hsNewContract(); });
  });
}
function hsNewContract() {
  const h = hsCurrent();
  if (!h) return;
  openContractModal({ preset: { name: (tk('home.electricity') + ' ') + hsName(h), category: 'energie', home: h.id, finCat: 'haushalt' } });
}

/* ---------- Documents ---------- */
// ref = 'home:<ID>' | 'log:<ID>' | 'defect:<ID>' – the link is stored on the entry (docLinks)
function hsRefTarget(ref) {
  const m = /^(home|log|defect|project):(.+)$/.exec(String(ref || ''));
  if (!m) return null;
  return { key: { home: 'homes', log: 'homeLog', defect: 'homeDefects', project: 'homeProjects' }[m[1]], id: m[2] };
}
function hsLinkDoc(ref, docId) {
  const t = hsRefTarget(ref);
  if (!t || !docId || !finance) return false;
  let changed = false;
  hsSet(t.key, hsArr(t.key).map(x => {
    if (x.id !== t.id) return x;
    const list = Array.isArray(x.docLinks) ? x.docLinks : [];
    if (list.includes(docId)) return x;
    changed = true;
    return { ...x, docLinks: [...list, docId].slice(-HS_DOC_LINK_MAX) };
  }));
  // Receipts of invoices and photos of defects also appear at the home
  if (t.key !== 'homes') {
    const obj = hsArr(t.key).find(x => x.id === t.id);
    if (obj && obj.home && hsLinkDoc('home:' + obj.home, docId)) changed = true;
  }
  return changed;
}
function hsUnlinkDoc(docId) {
  if (!docId || !finance) return false;
  let changed = false;
  ['homes', 'homeLog', 'homeDefects', 'homeProjects'].forEach(k => {
    if (!hsArr(k).some(x => Array.isArray(x.docLinks) && x.docLinks.includes(docId))) return;
    changed = true;
    hsSet(k, hsArr(k).map(x => Array.isArray(x.docLinks) && x.docLinks.includes(docId) ? { ...x, docLinks: x.docLinks.filter(y => y !== docId) } : x));
  });
  return changed;
}
function hsHomeForDoc(docId) { return hsHomes().find(h => Array.isArray(h.docLinks) && h.docLinks.includes(docId)) || null; }
// Pre-filling for the document popup
function hsDocPreset(ref, typ, obj) {
  const h = hsCurrent();
  const t = HS_DOC_TYPES.find(x => x.id === typ) || HS_DOC_TYPES[HS_DOC_TYPES.length - 1];
  const cats = docCategories();
  const catId = cats.some(c => c.id === t.cat) ? t.cat : (cats.some(c => c.id === 'wohnen') ? 'wohnen' : 'sonstiges');
  const today = finTodayIso();
  const p = { typ: '', vehicles: [], catId, titel: t.label + ' · ' + hsName(h), mitglied: '', datum: today, aussteller: '', kaufdatum: '', betrag: 0, gewaehrleistung_bis: '', garantie: '', gueltig_bis: '', erinnern: 0, notiz: h && h.address ? (tk('home.address') + ' ') + h.address : '', buy: false, lawFixed: false, hsRef: ref };
  if (typ === 'mietvertrag' && h) { p.aussteller = (h.landlord && h.landlord.name) || ''; if (vtIsIso(h.moveIn)) p.datum = h.moveIn; }
  if (typ === 'kaufvertrag' && h && h.own) { if (vtIsIso(h.own.date)) p.datum = h.own.date; if (Number(h.own.price) > 0) p.betrag = Number(h.own.price); }
  if (obj && /^log:/.test(ref)) {
    const lt = hsLogType(obj.type);
    p.titel = (hsLogTitle(obj) + ' · ' + hsName(h)).slice(0, 200);
    p.datum = obj.date || today;
    if (lt.warranty || ['moebel', 'geraet', 'material'].includes(lt.id)) {
      p.catId = cats.some(c => c.id === 'kaufbelege') ? 'kaufbelege' : catId;
      p.buy = true; p.kaufdatum = obj.date; p.lawFixed = !!obj.warranty;
      if (Number(obj.amount) > 0) p.betrag = Number(obj.amount);
      p.gewaehrleistung_bis = obj.warranty || (lt.warranty ? vtAddMonths(obj.date, lt.warranty, false) : '');
      p.erinnern = p.gewaehrleistung_bis && p.gewaehrleistung_bis > today ? 30 : 0;
    } else if (lt.id === 'steuer') { p.catId = cats.some(c => c.id === 'steuern') ? 'steuern' : catId; }
    else if (lt.id === 'versicherung') { p.catId = cats.some(c => c.id === 'versicherungen') ? 'versicherungen' : catId; }
    p.notiz = [obj.room ? (tk('home.room') + ' ') + obj.room : '', p.notiz].filter(Boolean).join('\n');
  }
  if (obj && /^defect:/.test(ref)) {
    p.titel = ((tk('home.defect4') + ' ') + (obj.title || '') + ' · ' + vtFmt(obj.date)).slice(0, 200);
    p.datum = today;
    p.notiz = [obj.room ? (tk('home.room') + ' ') + obj.room : '', obj.note || '', p.notiz].filter(Boolean).join('\n').slice(0, 4000);
  }
  return p;
}
function hsUploadDoc(ref, typ, obj) {
  if (!hsCanEdit()) return;
  const h = hsCurrent();
  hsCloseModal();
  loadDocuments();
  openDocEditModal(null, { preset: hsDocPreset(ref, typ, obj) });
  const ttl = document.getElementById('docEditTitle');
  if (ttl && h) ttl.textContent = (tk('home.newDocument') + ' ') + hsName(h);
  docPickFiles(false); // still within the same tap, otherwise iOS blocks the file picker
}
function hsOpenDocLink() {
  const h = hsCurrent();
  if (!h || typeof docAll !== 'function') return;
  loadDocuments();
  const render = () => {
    const cur = hsHomeById(h.id);
    const links = new Set(Array.isArray(cur.docLinks) ? cur.docLinks : []);
    const all = docAll().slice().sort((a, b) => (a.kategorie === 'wohnen' ? 0 : 1) - (b.kategorie === 'wohnen' ? 0 : 1) || String(a.titel || '').localeCompare(String(b.titel || ''), 'de'));
    return all.map(x => `<button type="button" class="fz-pick-row${links.has(x.id) ? ' active' : ''}" data-d="${hsEsc(x.id)}">
      <span class="text-xl shrink-0">${hsEsc(docCategory(x.kategorie).icon || '📄')}</span>
      <span class="flex-1 min-w-0"><span class="block text-sm font-medium truncate">${hsEsc(x.titel || tk('search.type.doc'))}</span><span class="block text-[11px] text-ink/45 truncate">${hsEsc(docCategory(x.kategorie).label + (x.datum ? ' · ' + vtFmt(x.datum) : ''))}</span></span>
      <span class="shrink-0 text-lg">${links.has(x.id) ? '✓' : ''}</span>
    </button>`).join('');
  };
  fzOpenModal2(`
    <h3 class="font-serif text-lg mb-1 pr-6">${tk('home.linkFromDocuments')}</h3>
    <p class="text-xs text-ink/50 mb-3">${tk('home.documentsStayDocumentsAlso')}</p>
    <div id="hsDocPick" class="flex flex-col gap-1.5">${render() || ('<p class="text-sm text-ink/45">' + tk('home.noDocumentsYet') + '</p>')}</div>
    <div class="flex items-center gap-2 mt-4"><div class="flex-1"></div><button type="button" id="hsdlDone" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90">${tk('common.done')}</button></div>`, body => {
    body.querySelector('#hsDocPick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-d]');
      if (!b) return;
      const did = b.dataset.d;
      const has = (hsHomeById(h.id).docLinks || []).includes(did);
      if (has) hsSet('homes', hsHomes().map(x => x.id === h.id ? { ...x, docLinks: (x.docLinks || []).filter(y => y !== did) } : x));
      else hsLinkDoc('home:' + h.id, did);
      b.classList.toggle('active', !has);
      b.lastElementChild.textContent = !has ? '✓' : '';
      persistState();
    });
    document.getElementById('hsdlDone').addEventListener('click', () => { fzCloseModal2(); hsAfterChange(); });
  });
}

/* ---------- Operation ---------- */
function hsOpen(tab) {
  if (!isViewAllowed('haus')) return;
  if (tab) hsTab = tab;
  if (currentView !== 'haus') setView('haus'); else renderHouse();
  const sc = document.getElementById('hsScroll');
  if (sc) sc.scrollTop = 0;
}
document.addEventListener('click', (e) => {
  const tabBtn = e.target.closest('.hs-tab-btn');
  if (tabBtn) { hsTab = tabBtn.dataset.hstab; hsLogLimit = 25; renderHouse(); const sc = document.getElementById('hsScroll'); if (sc) sc.scrollTop = 0; return; }
  if (e.target.closest('#hsHeaderBtn')) {
    const h = hsCurrent();
    if (hsTab === 'maengel') hsOpenDefectModal(null);
    else if (hsTab === 'kosten') hsOpenLogModal(null);
    else if (hsTab === 'zaehler') hsOpenReadingModal({});
    else if (hsTab === 'wartung') hsOpenMaintModal(null);
    else if (hsTab === 'garten') hsOpenPlantModal(null);
    else if (h) hsOpenHomeModal(h.id); else hsOpenHomeModal(null, 'miete');
    return;
  }
  const el = e.target.closest('[data-hsact]');
  if (!el || el.closest('#fzModal') || el.closest('#fzModal2')) return;
  const act = el.dataset.hsact, id = el.dataset.id || '';
  switch (act) {
    case 'home-new': hsOpenHomeModal(null, el.dataset.mode); break;
    case 'home-edit': { const h = hsCurrent(); if (h) hsOpenHomeModal(h.id); break; }
    case 'home-pick': hsHomeId = id; renderHouse(); break;
    case 'tab': hsTab = el.dataset.tab || 'uebersicht'; renderHouse(); break;
    case 'log-new': hsOpenLogModal(null, el.dataset.type || ''); break;
    case 'log-edit': hsOpenLogModal(id); break;
    case 'log-filter': hsLogFilter = el.dataset.f || 'alle'; hsLogLimit = 25; renderHouse(); break;
    case 'log-more': hsLogLimit += 50; renderHouse(); break;
    case 'year': hsYear += Number(el.dataset.d) || 0; hsLogLimit = 25; renderHouse(); break;
    case 'defect-new': hsOpenDefectModal(null); break;
    case 'defect-edit': hsOpenDefectModal(id); break;
    case 'defect-letter': hsOpenDefectLetter(); break;
    case 'project-new': hsOpenProjectModal(null); break;
    case 'project-edit': hsOpenProjectModal(id); break;
    case 'meter-new': hsOpenMeterModal(null, el.dataset.type || ''); break;
    case 'meter-edit': hsOpenMeterModal(id); break;
    case 'meter-toggle': hsMeterOpen = hsMeterOpen === id ? '' : id; renderHouse(); break;
    case 'reading-new': hsOpenReadingModal({ meterId: id }); break;
    case 'reading-edit': hsOpenReadingModal({ id }); break;
    case 'maint-new': hsOpenMaintModal(null); break;
    case 'maint-tpl': hsOpenMaintModal(null, el.dataset.tpl); break;
    case 'maint-edit': if (hsCanEdit()) hsOpenMaintModal(id); break;
    case 'maint-open': hsOpen('wartung'); break;
    case 'maint-due': hsMaintDueOpen(id); break;
    case 'maint-act': hsMaintAct(id); break;
    case 'maint-new-garden': hsOpenMaintModal(null, null, true); break;
    case 'mod-toggle': hsToggleModule(id); break;
    case 'key-new': hsOpenKeyModal(null); break;
    case 'key-edit': if (hsCanEdit()) hsOpenKeyModal(id); break;
    case 'plant-new': hsOpenPlantModal(null); break;
    case 'plant-tpl': hsOpenPlantModal(null, el.dataset.tpl); break;
    case 'plant-edit': if (hsCanEdit()) hsOpenPlantModal(id); break;
    case 'plant-water': hsPlantTick(id, false); break;
    case 'plant-smart': hsPlantSmartRun(id); break;
    case 'plant-fert': hsPlantTick(id, true); break;
    case 'contract': openContractDetail(id); break;
    case 'contract-assign': hsOpenContractAssign(); break;
    case 'contract-new': hsNewContract(); break;
    case 'doc-add': { const h = hsCurrent(); const sel = document.getElementById('hsDocTypeSelect'); if (h) hsUploadDoc('home:' + h.id, sel ? sel.value : 'sonstiges', h); break; }
    case 'doc-link': hsOpenDocLink(); break;
    case 'doc-open': openDocDetail(id); break;
    default: return;
  }
});
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d && d.dataset && d.dataset.hsdetails === 'defects') hsDefectShowDone = d.open;
}, true);

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('zuhause');
