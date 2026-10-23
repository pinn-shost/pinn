/* pinn. – text core: plural rules and filling of key-based texts
   This exact file exists twice and both copies must stay byte-identical (.github/scripts/check-lang.js checks it):
     pb_public/js/textkern.js     in the app, loaded with <script src> right before js/sprachen.js
     pb_hooks/pinn-textkern.js    on the server, require(`${__hooks}/pinn-textkern.js`) – no *.pb.js, so
                                  PocketBase does not run it as a hook by itself
   One table for both places: the app and the push messages of the server always choose the same plural form.
   (The browser could do this with Intl.PluralRules, the JavaScript engine of PocketBase cannot.)

   A text in a language file (pb_public/i18n/<code>.i18n.js) is either a string or an object with plural forms:
     "tasks.open": "{n} open tasks"
     "tasks.open": { "one": "{n} open task", "other": "{n} open tasks" }
   Placeholders have names: {n}, {name}, {date} … They are filled from the values given to tk(key, values).
   The plural form is chosen by the value "n" (a number or a numeric string such as "1.5").
   Plural categories follow the CLDR cardinal rules (https://cldr.unicode.org): one, few, many, other.
   FORMS lists the categories every language file has to provide for a plural text.

   New language: add a rule to RULES and its categories to FORMS – in BOTH files (copy this file over the other).
   Not included on purpose: the CLDR form "many" for round millions in fr, es, it and pt (only used for
   compact numbers like "1 million de …") – these languages use one/other here. */
(function (root) {
  'use strict';

  // i = integer digits, v = number of visible fraction digits ("1.50" → 2), n = absolute value
  function oneIfOneInt(n, i, v) { return i === 1 && v === 0 ? 'one' : 'other'; }
  function oneIfZeroOrOne(n, i) { return i === 0 || i === 1 ? 'one' : 'other'; }
  function onlyOther() { return 'other'; }

  var RULES = {
    de: oneIfOneInt,
    en: oneIfOneInt,
    it: oneIfOneInt,
    es: function (n) { return n === 1 ? 'one' : 'other'; },
    fr: oneIfZeroOrOne,
    pt: oneIfZeroOrOne,          // Brazilian Portuguese (CLDR "pt"): 0 and 1 are singular
    zh: onlyOther,
    ja: onlyOther,
    ko: onlyOther,
    // Russian: 1, 21, 31 … → one · 2–4, 22–24 … → few · 0, 5–20, 25–30 … → many · fractions → other
    ru: function (n, i, v) {
      if (v !== 0) return 'other';
      var m10 = i % 10, m100 = i % 100;
      if (m10 === 1 && m100 !== 11) return 'one';
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
      return 'many';
    },
  };

  // Categories a language file must contain for every plural text
  var FORMS = {
    de: ['one', 'other'], en: ['one', 'other'], it: ['one', 'other'], es: ['one', 'other'],
    fr: ['one', 'other'], pt: ['one', 'other'],
    zh: ['other'], ja: ['other'], ko: ['other'],
    ru: ['one', 'few', 'many'],   // "other" (fractions) is optional and falls back to "few" (genitive singular)
  };
  // Where to look when a form is missing in a text
  var FALLBACK = { ru: { other: ['few', 'many'] } };

  // Operands of a number: integer part, count of visible fraction digits, absolute value
  function operands(x) {
    var s = typeof x === 'number' ? String(Math.abs(x)) : String(x == null ? '' : x).trim().replace(/^[-+]/, '').replace(',', '.');
    if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') { var f = Math.abs(Number(x)) || 0; s = String(f); }
    var parts = s.split('.');
    return { n: Number(s) || 0, i: parseInt(parts[0] || '0', 10) || 0, v: parts[1] ? parts[1].length : 0 };
  }

  function base(lang) { return String(lang || '').slice(0, 2).toLowerCase(); }

  // Plural category of a number in a language ("other" for unknown languages)
  function plural(lang, x) {
    var rule = RULES[base(lang)];
    if (!rule) return 'other';
    var o = operands(x);
    return rule(o.n, o.i, o.v);
  }

  function isPlural(entry) { return !!entry && typeof entry === 'object' && !Array.isArray(entry); }

  // The string of an entry for a language and its values (chooses the plural form by values.n)
  function pick(entry, lang, vals) {
    if (!isPlural(entry)) return entry == null ? '' : String(entry);
    var cat = plural(lang, vals && vals.n != null ? vals.n : 0);
    if (typeof entry[cat] === 'string') return entry[cat];
    var fb = (FALLBACK[base(lang)] || {})[cat] || [];
    for (var i = 0; i < fb.length; i++) if (typeof entry[fb[i]] === 'string') return entry[fb[i]];
    if (typeof entry.other === 'string') return entry.other;
    for (var k in entry) if (Object.prototype.hasOwnProperty.call(entry, k) && typeof entry[k] === 'string') return entry[k];
    return '';
  }

  // Fill {name} placeholders; unknown names stay visible as {name} (easy to spot while testing)
  function fill(text, vals) {
    if (!vals) return text;
    return text.replace(/\{(\w+)\}/g, function (all, name) {
      return Object.prototype.hasOwnProperty.call(vals, name) && vals[name] != null ? String(vals[name]) : all;
    });
  }

  var api = {
    RULES: RULES,
    FORMS: FORMS,
    forms: function (lang) { return (FORMS[base(lang)] || ['other']).slice(); },
    plural: plural,
    isPlural: isPlural,
    pick: pick,
    fill: fill,
    // Finished text: plural form + placeholders
    text: function (entry, lang, vals) { return fill(pick(entry, lang, vals), vals); },
  };

  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else if (root) {
    root.PINN_TEXTKERN = api;
    // Marks this file as loaded – the start check in index.html reports missing app files
    (root.PINN_PARTS = root.PINN_PARTS || []).push('textkern');
  }
})(typeof window !== 'undefined' ? window : this);
