/* pinn. – Standard names of stored data (js/standardnamen.js)
   Since 1.119.1. Classic script, no build step, loaded right after js/sprache.js.
   pinn. stores the names of its predefined categories, storage locations, kitchen appliances, funds and the
   titles of automatic household tasks in German (that is how they were created, and the server and older
   devices rely on them). The data is NEVER changed – only the display is translated:
   - i18nT(name)          a stored name -> name in the app language, if it is one of the known standard names
                          (STD_NAME_KEYS). Renamed or own names are returned unchanged. Also translates the
                          titles of automatic household tasks („Reinigung: Bad“, „🗑️ Restmüll rausbringen: Bad“).
   - stdUnit(unit, n)     a German package unit („Dose“, „Packungen“ …) -> singular/plural in the app language,
                          or '' if it is not a known unit (js/vorrat.js → unitForCount uses it).
   The texts are the keys std.* in pb_public/i18n/<code>.i18n.js (no flat share variants). In German nothing
   is looked up. New standard name: add a line here and the key in all language files
   (.github/CONTRIBUTING.md → "Texts"). */

// German standard name (as stored) -> text key
const STD_NAME_KEYS = {
  'Frühstück': 'std.recipeCat.fruehstueck',
  'Mittagessen': 'std.recipeCat.mittagessen',
  'Abendessen': 'std.recipeCat.abendessen',
  'Warme Speisen': 'std.recipeCat.warmeSpeisen',
  'Kalte Speisen': 'std.recipeCat.kalteSpeisen',
  'Kuchen & Süßes': 'std.recipeCat.kuchenSuesses',
  'Snacks': 'std.recipeCat.snacks',
  'Getränke': 'std.recipeCat.getraenke',
  'Lebensmittel': 'std.finCat.lebensmittel',
  'Drogerie': 'std.finCat.drogerie',
  'Baumarkt': 'std.finCat.baumarkt',
  'Haushalt & Wohnen': 'std.finCat.haushalt',
  'Kleidung': 'std.finCat.kleidung',
  'Gesundheit': 'std.finCat.gesundheit',
  'Auto & Mobilität': 'std.finCat.mobilitaet',
  'Essen gehen': 'std.finCat.essenGehen',
  'Freizeit': 'std.finCat.freizeit',
  'Kinder': 'std.finCat.kinder',
  'Geschenke': 'std.finCat.geschenke',
  'Abos & Verträge': 'std.finCat.abos',
  'Versicherungen': 'std.finCat.versicherungen',
  'Sparen': 'std.finCat.sparen',
  'Einnahmen': 'std.finCat.einkommen',
  'Sonstiges': 'std.finCat.sonstiges',
  'Strom & Gas': 'std.contractCat.energie',
  'Internet & Telefon': 'std.contractCat.internet',
  'Handy': 'std.contractCat.mobilfunk',
  'Streaming & Abos': 'std.contractCat.streaming',
  'Wohnen': 'std.contractCat.wohnen',
  'Sport & Freizeit': 'std.contractCat.freizeit',
  'Kredite & Finanzierung': 'std.contractCat.kredit',
  'Zeitung & Magazine': 'std.contractCat.zeitung',
  'Steuern & Abgaben': 'std.contractCat.abgaben',
  'Sonstige': 'std.contractCat.sonstiges',
  'Obst & Gemüse': 'std.pantryCat.obstGemuese',
  'Milch & Käse': 'std.pantryCat.milch',
  'Fleisch & Fisch': 'std.pantryCat.fleischFisch',
  'Brot & Backwaren': 'std.pantryCat.brot',
  'Nudeln, Reis & Co.': 'std.pantryCat.nudelnReis',
  'Konserven': 'std.pantryCat.konserven',
  'Backen': 'std.pantryCat.backen',
  'Gewürze & Öle': 'std.pantryCat.gewuerze',
  'Süßes & Snacks': 'std.pantryCat.suesses',
  'Tiefkühl': 'std.pantryCat.tiefkuehl',
  'Drogerie & Hygiene': 'std.pantryCat.drogerie',
  'Haushalt & Putzen': 'std.pantryCat.haushalt',
  'Kühlschrank': 'std.place.kuehlschrank',
  'Gefrierschrank': 'std.place.gefrierschrank',
  'Vorratsschrank': 'std.place.vorratsschrank',
  'Keller': 'std.place.keller',
  'Bad': 'std.place.bad',
  'Kaufbelege & Garantie': 'std.docCat.kaufbelege',
  'Ausweise & Urkunden': 'std.docCat.ausweise',
  'Wohnen & Nebenkosten': 'std.docCat.wohnen',
  'Auto & Fahrzeuge': 'std.docCat.fahrzeuge',
  'Arbeit & Gehalt': 'std.docCat.arbeit',
  'Steuern & Behörden': 'std.docCat.steuern',
  'Bank & Finanzen': 'std.docCat.bank',
  'Schule & Zeugnisse': 'std.docCat.schule',
  'Bedienungsanleitungen': 'std.docCat.anleitungen',
  'Haustiere': 'std.docCat.haustiere',
  'Backofen': 'std.tool.ofen',
  'Mixer': 'std.tool.mixer',
  'Küchenmaschine': 'std.tool.kuechenmaschine',
  'Thermomix': 'std.tool.thermomix',
  'Heißluftfritteuse': 'std.tool.airfryer',
  'Grill': 'std.tool.grill',
  'Reinigung': 'std.cleanCat.reinigung',
  'Aufräumen': 'std.cleanCat.aufraeumen',
  'Restmüll': 'std.waste.restmuell',
  'Biomüll': 'std.waste.biomuell',
  'Papiermüll': 'std.waste.papier',
  'Gelber Sack': 'std.waste.gelbersack',
  'Altglas': 'std.waste.glas',
  'Haushaltskasse': 'std.misc.householdFund',
  'Kasse': 'std.misc.fund',
  'Rezepte Familie': 'std.misc.recipePool',
  'Unbekannt': 'std.misc.unknown',
  'Müll': 'std.misc.waste',
  'Mama': 'std.role.mama',
  'Papa': 'std.role.papa',
  'Kind': 'std.role.kind',
  'Oma': 'std.role.oma',
  'Opa': 'std.role.opa',
};
// German package unit (singular and plural, lower case) -> text key with the forms one/other
const STD_UNIT_KEYS = {
  'stück': 'std.unit.stueck',
  'dose': 'std.unit.dose',
  'dosen': 'std.unit.dose',
  'packung': 'std.unit.packung',
  'packungen': 'std.unit.packung',
  'flasche': 'std.unit.flasche',
  'flaschen': 'std.unit.flasche',
  'kiste': 'std.unit.kiste',
  'kisten': 'std.unit.kiste',
  'rolle': 'std.unit.rolle',
  'rollen': 'std.unit.rolle',
  'tube': 'std.unit.tube',
  'tuben': 'std.unit.tube',
  'glas': 'std.unit.glas',
  'gläser': 'std.unit.glas',
  'tüte': 'std.unit.tuete',
  'tüten': 'std.unit.tuete',
  'tafel': 'std.unit.tafel',
  'tafeln': 'std.unit.tafel',
  'schachtel': 'std.unit.schachtel',
  'schachteln': 'std.unit.schachtel',
  'beutel': 'std.unit.beutel',
  'becher': 'std.unit.becher',
  'spray': 'std.unit.spray',
  'sprays': 'std.unit.spray',
  'sprühflasche': 'std.unit.spruehflasche',
  'sprühflaschen': 'std.unit.spruehflasche',
  'paket': 'std.unit.paket',
  'pakete': 'std.unit.paket',
  'karton': 'std.unit.karton',
  'kartons': 'std.unit.karton',
  'sack': 'std.unit.sack',
  'säcke': 'std.unit.sack',
  'netz': 'std.unit.netz',
  'netze': 'std.unit.netz',
  'bund': 'std.unit.bund',
  'kopf': 'std.unit.kopf',
  'köpfe': 'std.unit.kopf',
  'zehe': 'std.unit.zehe',
  'zehen': 'std.unit.zehe',
  'scheibe': 'std.unit.scheibe',
  'scheiben': 'std.unit.scheibe',
  'stange': 'std.unit.stange',
  'stangen': 'std.unit.stange',
  'kanister': 'std.unit.kanister',
  'eimer': 'std.unit.eimer',
  'riegel': 'std.unit.riegel',
  'kapsel': 'std.unit.kapsel',
  'kapseln': 'std.unit.kapsel',
  'tablette': 'std.unit.tablette',
  'tabletten': 'std.unit.tablette',
  'portion': 'std.unit.portion',
  'portionen': 'std.unit.portion',
  'päckchen': 'std.unit.paeckchen',
};

function stdLangIsGerman() { return !window.PINN_I18N || PINN_I18N.current === 'de'; }
// Text of a key, or '' if the language file does not have it (then the stored name stays)
function stdKeyText(key, vals) { return window.PINN_I18N && PINN_I18N.has && PINN_I18N.has(key) ? tk(key, vals) : ''; }
// Only the bare name: standard name -> translation, otherwise null
function stdNameOnly(name) {
  const key = Object.prototype.hasOwnProperty.call(STD_NAME_KEYS, name) ? STD_NAME_KEYS[name] : '';
  return key ? (stdKeyText(key) || null) : null;
}
// Titles of automatic household tasks (stored in German by the server and the app):
// "<icon> <waste type> rausbringen: <room>" and "<cleaning category>: <room>"
function stdTaskTitle(t) {
  let m = /^(\S+ )?(.+?) rausbringen: (.+)$/.exec(t);
  if (m) {
    const out = stdKeyText('std.task.takeOut', { waste: stdNameOnly(m[2]) || m[2], room: stdNameOnly(m[3]) || m[3] });
    return out ? (m[1] || '') + out : null;
  }
  m = /^([^:]{2,40}): (.+)$/.exec(t);
  if (m) {
    const cat = stdNameOnly(m[1]);
    if (cat && /^std\.cleanCat\./.test(STD_NAME_KEYS[m[1]])) return cat + ': ' + (stdNameOnly(m[2]) || m[2]);
  }
  return null;
}
// Stored name -> display name in the app language (spaces at the edges are kept)
function i18nT(s) {
  if (typeof s !== 'string' || !s || stdLangIsGerman()) return s;
  const core = s.trim();
  if (!core) return s;
  const out = stdNameOnly(core) || stdTaskTitle(core);
  if (!out) return s;
  return s.slice(0, s.indexOf(core)) + out + s.slice(s.indexOf(core) + core.length);
}
// German package unit -> unit in the app language with the right singular/plural ('' = unknown or German)
function stdUnit(unit, n) {
  if (stdLangIsGerman()) return '';
  const key = STD_UNIT_KEYS[String(unit || '').trim().toLowerCase()];
  return key ? stdKeyText(key, { n: Number(n) }) : '';
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('standardnamen');
