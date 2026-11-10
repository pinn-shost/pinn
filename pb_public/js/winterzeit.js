/* pinn. – Winter & Christmas look (js/winterzeit.js, since 1.145.0)
   Classic script, no build step: loaded after js/dunkelzeit.js (the load order is listed in src/rahmen.html and in
   pinn-setup.sh). The styles are in css/winterzeit.css.
   Contents:
   - Calendar: winter look from 1 December to 6 January, Christmas extras from 1 to 26 December (device time).
   - Switch: personal design value seasonFx (on by default, see currentDesignValues in js/design.js) – applies on every
     device of the profile. Before sign-in (and on the family dashboard) the last state of the device is used.
   - Movement only now and then, to save battery: a short snow shower when pinn. is opened, after a longer break and
     when the logo is tapped; at Christmas Santa flies across the top every few minutes (more often on 24 December).
     Nothing moves in idle mode (class pinn-ruhe), in the background or with "reduce motion".
   - Preview button in the settings: shows the Christmas look for one minute at any time of the year.
   - Snow on headings (since 1.146.0): measured per heading and per letter, so it fits every length and every script.
   The look only adds classes on <html>, CSS variables on the decorated headings and one fixed layer – it never changes
   the layout (see css/winterzeit.css). */

var seasonFx = true;                 // personal switch
var seasonPreviewUntil = 0;          // ms timestamp – preview of the Christmas look runs until then
var seasonPreviewTimer = null;
var seasonSantaTimer = null;
var seasonDayTimer = null;
var seasonLiveTimer = null;
var seasonLayer = null;
var seasonHiddenAt = 0;
var seasonStarted = false;           // first snow shower after the start done?
var seasonLastFlurry = 0;
var SEASON_DEVICE_KEY = 'pinn.saison';        // '1' | '0' – last state of the switch on this device
var SEASON_SANTA_KEY = 'pinn.saison.santa';   // time of the last flight on this device
var SEASON_FLURRY_MS = 32000;                 // length of a snow shower
var SEASON_BREAK_MS = 20 * 60 * 1000;         // pinn. in the background at least this long -> new shower when it comes back

// Which parts of the look belong to the date? (month 11 = December, 0 = January)
function seasonPhase(now) {
  var m = now.getMonth(), d = now.getDate();
  return {
    winter: (m === 11) || (m === 0 && d <= 6),
    xmas: m === 11 && d <= 26,
    eve: m === 11 && d === 24,
  };
}

function seasonPreviewing() { return Date.now() < seasonPreviewUntil; }

// Phase that is shown right now (switch, date and preview together)
function seasonCurrent() {
  if (seasonPreviewing()) return { winter: true, xmas: true, eve: false };
  if (!seasonFx) return { winter: false, xmas: false, eve: false };
  return seasonPhase(new Date());
}

function seasonReduceMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function seasonIdle() { return document.documentElement.classList.contains('pinn-ruhe'); }
function seasonCanMove() { return !document.hidden && !seasonIdle() && !seasonReduceMotion(); }

// Sets the classes on <html> and starts or stops the movement
function seasonApply() {
  var p = seasonCurrent();
  var root = document.documentElement;
  root.classList.toggle('pinn-winter', p.winter);
  root.classList.toggle('pinn-xmas', p.xmas);
  seasonSnowWatch(p.winter);
  if (!p.winter) {
    seasonStopMotion();
  } else {
    if (!seasonStarted) {
      seasonStarted = true;
      setTimeout(function () { seasonFlurry(); }, 1200);
    }
    seasonScheduleSanta();
  }
  seasonScheduleDayChange();
}

function seasonStopMotion() {
  if (seasonSantaTimer) { clearTimeout(seasonSantaTimer); seasonSantaTimer = null; }
  if (seasonLiveTimer) { clearTimeout(seasonLiveTimer); seasonLiveTimer = null; }
  document.documentElement.classList.remove('pinn-season-live');
  if (seasonLayer) { seasonLayer.remove(); seasonLayer = null; }
}

// Re-check at the next midnight (the look appears on 1 December and disappears on 7 January on its own)
function seasonScheduleDayChange() {
  if (seasonDayTimer) clearTimeout(seasonDayTimer);
  var now = new Date();
  var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  seasonDayTimer = setTimeout(function () { seasonDayTimer = null; seasonApply(); }, Math.min(next - now, 24 * 3600 * 1000));
}

// Fixed layer for snow and Santa: above the app, below pop-ups – above the sign-in and the dashboard while they are open
function seasonGetLayer() {
  if (!seasonLayer || !seasonLayer.isConnected) {
    seasonLayer = document.createElement('div');
    seasonLayer.className = 'pinn-season-layer';
    seasonLayer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(seasonLayer);
  }
  var front = ['loginScreen', 'dashboardScreen'].some(function (id) {
    var el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
  seasonLayer.style.zIndex = front ? '401' : '150';
  return seasonLayer;
}
function seasonLayerTidy() {
  if (seasonLayer && !seasonLayer.firstChild) { seasonLayer.remove(); seasonLayer = null; }
}

// A short snow shower (light flakes, ends on its own)
function seasonFlurry() {
  if (!seasonCurrent().winter || !seasonCanMove()) return;
  var now = Date.now();
  if (now - seasonLastFlurry < 4000) return;
  seasonLastFlurry = now;
  var layer = seasonGetLayer();
  var narrow = window.innerWidth < 640;
  var count = narrow ? 16 : 28;
  for (var i = 0; i < count; i++) {
    var flake = document.createElement('span');
    flake.className = 'pinn-season-flake';
    var dur = 7 + Math.random() * 6;
    var wait = Math.random() * 6;
    var rounds = Math.max(1, Math.round((SEASON_FLURRY_MS / 1000 - wait) / dur));
    flake.style.setProperty('--x', (Math.random() * 100).toFixed(1) + 'vw');
    flake.style.setProperty('--s', (3 + Math.random() * 4).toFixed(1) + 'px');
    flake.style.setProperty('--o', (0.55 + Math.random() * 0.4).toFixed(2));
    flake.style.setProperty('--d', dur.toFixed(2) + 's');
    flake.style.setProperty('--w', wait.toFixed(2) + 's');
    flake.style.setProperty('--n', String(rounds));
    flake.style.setProperty('--dx', ((Math.random() - 0.5) * 70).toFixed(0) + 'px');
    flake.addEventListener('animationend', function (e) { e.target.remove(); seasonLayerTidy(); });
    layer.appendChild(flake);
  }
  // Fairy lights twinkle only while it snows
  document.documentElement.classList.add('pinn-season-live');
  if (seasonLiveTimer) clearTimeout(seasonLiveTimer);
  seasonLiveTimer = setTimeout(function () {
    seasonLiveTimer = null;
    document.documentElement.classList.remove('pinn-season-live');
  }, SEASON_FLURRY_MS);
}

// Santa with his sleigh and three reindeer (drawn here, no image file needed)
var SEASON_SANTA_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 62">'
  + '<g fill="none" stroke="#8a6a3c" stroke-width="1"><path d="M70 38 Q100 30 128 33 Q150 30 172 28"/><path d="M70 41 Q105 40 136 39"/></g>'
  // reindeer (body, neck, head, legs, antlers)
  + '<g fill="#8b5a2b" stroke="#6d4420" stroke-width=".6">'
  + '<ellipse cx="112" cy="36" rx="12" ry="5.5"/><path d="M121 33 L126 26 L129 27 L126 34Z"/><ellipse cx="129" cy="25" rx="4.2" ry="2.8"/>'
  + '<ellipse cx="150" cy="33" rx="12" ry="5.5"/><path d="M159 30 L164 23 L167 24 L164 31Z"/><ellipse cx="167" cy="22" rx="4.2" ry="2.8"/>'
  + '<ellipse cx="186" cy="30" rx="12" ry="5.5"/><path d="M195 27 L200 20 L203 21 L200 28Z"/><ellipse cx="203" cy="19" rx="4.2" ry="2.8"/>'
  + '</g>'
  + '<g stroke="#6d4420" stroke-width="1.6" stroke-linecap="round">'
  + '<path d="M104 40 L99 47 M108 41 L106 48 M118 40 L123 46 M121 39 L127 44"/>'
  + '<path d="M142 37 L137 44 M146 38 L144 45 M156 37 L161 43 M159 36 L165 41"/>'
  + '<path d="M178 34 L173 41 M182 35 L180 42 M192 34 L197 40 M195 33 L201 38"/>'
  + '</g>'
  + '<g fill="none" stroke="#c9a46a" stroke-width="1.1" stroke-linecap="round">'
  + '<path d="M127 23 L125 17 M125 19 L122 17 M129 23 L131 17 M131 19 L134 17"/>'
  + '<path d="M165 20 L163 14 M163 16 L160 14 M167 20 L169 14 M169 16 L172 14"/>'
  + '<path d="M201 17 L199 11 M199 13 L196 11 M203 17 L205 11 M205 13 L208 11"/>'
  + '</g>'
  + '<circle cx="207.4" cy="19.4" r="1.9" fill="#ff2a2a"/><circle cx="207.4" cy="19.4" r="3.4" fill="#ff2a2a" opacity=".25"/>'
  // sleigh with Santa and his sack
  + '<path d="M16 34 Q30 30 46 33" fill="#7a4a24"/><ellipse cx="22" cy="31" rx="9" ry="7" fill="#8a5a2e"/>'
  + '<circle cx="51" cy="22" r="5" fill="#f3d2b5"/><path d="M45 21 Q51 9 58 17 L56 21Z" fill="#c8102e"/><circle cx="58.5" cy="17" r="1.8" fill="#fff"/>'
  + '<path d="M45.5 21.5 H57" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'
  + '<path d="M51 24 Q55 33 59 26 Q57 24 51 24Z" fill="#fff"/>'
  + '<path d="M42 27 Q50 22 58 27 L60 38 H42Z" fill="#c8102e"/><path d="M57 29 L66 31" stroke="#c8102e" stroke-width="3.2" stroke-linecap="round"/>'
  + '<path d="M10 33 Q12 45 24 46 H64 Q74 46 74 36 Q70 40 64 40 H30 Q22 40 20 33Z" fill="#b5122b"/>'
  + '<path d="M14 40 Q20 44 28 44 H66" fill="none" stroke="#f2c94c" stroke-width="1.2"/>'
  + '<path d="M14 50 H70 Q78 50 80 44" fill="none" stroke="#d4a43a" stroke-width="2.2" stroke-linecap="round"/>'
  + '<path d="M26 46 V50 M58 46 V50" stroke="#d4a43a" stroke-width="1.6"/>'
  + '</svg>';

function seasonSanta() {
  if (!seasonCurrent().xmas || !seasonCanMove()) return false;
  var layer = seasonGetLayer();
  if (layer.querySelector('.pinn-santa')) return false;
  var santa = document.createElement('div');
  santa.className = 'pinn-santa' + (Math.random() < 0.5 ? ' rtl' : '');
  santa.style.setProperty('--y', 'calc(env(safe-area-inset-top, 0px) + ' + Math.round(14 + Math.random() * 46) + 'px)');
  santa.style.setProperty('--d', (window.innerWidth < 640 ? 8 : 12) + 's');
  santa.innerHTML = SEASON_SANTA_SVG;  // fixed markup from this file – no user or translated text
  santa.addEventListener('animationend', function (e) {
    if (e.target !== santa) return;
    santa.remove();
    seasonLayerTidy();
  });
  layer.appendChild(santa);
  try { localStorage.setItem(SEASON_SANTA_KEY, String(Date.now())); } catch (e) { /* storage full or blocked */ }
  return true;
}

// Next flight: soon after the start when he has not flown on this device for a while, then every few minutes
function seasonScheduleSanta() {
  if (seasonSantaTimer) { clearTimeout(seasonSantaTimer); seasonSantaTimer = null; }
  var p = seasonCurrent();
  if (!p.xmas || seasonReduceMotion()) return;
  var last = 0;
  try { last = Number(localStorage.getItem(SEASON_SANTA_KEY)) || 0; } catch (e) { last = 0; }
  var gap = p.eve ? (2 + Math.random()) * 60000 : (5 + Math.random() * 4) * 60000;
  var wait = Math.max(9000, last + gap - Date.now());
  seasonSantaTimer = setTimeout(function () {
    seasonSantaTimer = null;
    seasonSanta();
    seasonScheduleSanta();
  }, wait);
}

// ---------- Snow that fits each heading (since 1.146.0) ----------
// Instead of one fixed strip, the snow is drawn for every heading separately: pinn. measures every letter of the first
// line (position from the browser, height of the glyph from the real font via canvas metrics) and lays a soft blanket
// of snow on the tops of the letters – thicker in some places, with small lumps, never across the gaps between words
// and never on emoji or symbols. Because only real glyph metrics are used it works the same in every language and
// script (Latin, Cyrillic, Chinese, Japanese, Korean …). The drawing is an SVG in exactly the measured pixel size, so
// nothing is stretched. It is stored in CSS variables on the heading (style only – no layout change, see
// css/winterzeit.css) and drawn again only when text, font or width change.
var SEASON_SNOW_SEL = '#mainGrid h2.font-serif:not(.truncate), #mainGrid h3.font-serif:not(.truncate), '
  + '.nt-famname h1, #dashboardScreen h1.font-serif';
var seasonSnowKeys = (typeof WeakMap === 'function') ? new WeakMap() : null;
var seasonSnowObserver = null;
var seasonSnowTimer = null;
var seasonSnowCanvas = null;
var SEASON_SNOW_WORD_RE = (function () {
  // letters and digits of every script; very old browsers without Unicode classes get a simpler rule
  try { return new RegExp('[\\p{L}\\p{N}]', 'u'); } catch (e) { return /[0-9A-Za-z\u00C0-\u024F\u0370-\u052F\u0590-\u06FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/; }
})();

// Small random generator with a seed – the same heading always gets the same lumps
function seasonSnowRandom(text) {
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () {
    h = (h + 0x6D2B79F5) | 0;
    var t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Height of one character above the baseline and the ascent of the font (both in px), measured with the real font
function seasonSnowMetrics(ctx, ch, fs) {
  var m = ctx.measureText(ch);
  var asc = typeof m.actualBoundingBoxAscent === 'number' ? m.actualBoundingBoxAscent : fs * 0.7;
  var font = typeof m.fontBoundingBoxAscent === 'number' && m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent : fs * 0.92;
  return { glyph: asc, font: font };
}

// All words of the first line: [{ glyphs: [{ l, r, top }] }] in px relative to the padding box of the heading
function seasonSnowWords(el, fs) {
  var box = el.getBoundingClientRect();
  var ox = box.left + (el.clientLeft || 0), oy = box.top + (el.clientTop || 0);
  if (!seasonSnowCanvas) seasonSnowCanvas = document.createElement('canvas');
  var ctx = seasonSnowCanvas.getContext('2d');
  if (!ctx) return [];
  var cs = getComputedStyle(el);
  ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
  var words = [], cur = null, firstTop = null, lineH = 0;
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  var range = document.createRange();
  var node, count = 0;
  while ((node = walker.nextNode())) {
    var s = node.nodeValue || '';
    var i = 0;
    while (i < s.length && count < 160) {
      var cp = s.codePointAt(i);
      var ch = String.fromCodePoint(cp);
      var len = ch.length;
      if (/\s/.test(ch)) { cur = null; i += len; continue; }
      range.setStart(node, i);
      range.setEnd(node, i + len);
      var rects = range.getClientRects();
      var r = rects.length ? rects[0] : null;
      i += len; count++;
      if (!r || r.width <= 0 || r.height <= 0) continue;
      if (firstTop === null) { firstTop = r.top; lineH = r.height; }
      if (r.top > firstTop + lineH * 0.6) return words.filter(seasonSnowWordOk); // second line reached
      if (!cur) { cur = { glyphs: [], text: '' }; words.push(cur); }
      cur.text += ch;
      var m = seasonSnowMetrics(ctx, ch, fs);
      // baseline of this character = top of its box + ascent of the font; the glyph starts that far above it
      var top = r.top + m.font - m.glyph - oy;
      top = Math.max(r.top - oy, Math.min(r.bottom - oy - fs * 0.2, top));
      cur.glyphs.push({ l: r.left - ox, r: r.right - ox, top: top, letter: SEASON_SNOW_WORD_RE.test(ch) });
    }
  }
  return words.filter(seasonSnowWordOk);
}
// Snow only on words with letters or digits (no emoji, no symbols); emoji at the start or end of a word are left out
function seasonSnowWordOk(w) {
  if (!SEASON_SNOW_WORD_RE.test(w.text)) return false;
  while (w.glyphs.length && !w.glyphs[0].letter) w.glyphs.shift();
  while (w.glyphs.length && !w.glyphs[w.glyphs.length - 1].letter) w.glyphs.pop();
  w.glyphs.sort(function (a, b) { return a.l - b.l; });
  return w.glyphs.length > 0;
}

function seasonSnowSmooth(arr, radius) {
  if (radius < 1) return arr.slice();
  var out = new Array(arr.length);
  for (var i = 0; i < arr.length; i++) {
    var sum = 0, n = 0;
    for (var k = Math.max(0, i - radius); k <= Math.min(arr.length - 1, i + radius); k++) { sum += arr[k]; n++; }
    out[i] = sum / n;
  }
  return out;
}

// Outline of the snow on one word: { top: [[x, y]], bottom: [[x, y]] } – both from left to right
function seasonSnowShape(word, fs, rnd) {
  var g = word.glyphs;
  var x0 = g[0].l, x1 = g[g.length - 1].r;
  var width = x1 - x0;
  if (width < fs * 0.22) return null;
  // overhang at both ends: the snow reaches a little over the first and the last letter
  var ovL = fs * (0.03 + rnd() * 0.06), ovR = fs * (0.03 + rnd() * 0.06);
  var a = x0 - ovL, b = x1 + ovR;
  var step = Math.max(0.75, fs / 22);
  var n = Math.max(4, Math.ceil((b - a) / step));
  var xs = [], ground = [];
  for (var i = 0; i <= n; i++) {
    var x = a + (b - a) * i / n;
    xs.push(x);
    // ground under the snow: top of the letter at this x; in gaps between letters the lower neighbour counts
    var y = null;
    for (var j = 0; j < g.length; j++) {
      if (x >= g[j].l && x <= g[j].r) { y = y === null ? g[j].top : Math.min(y, g[j].top); }
    }
    if (y === null) {
      var left = null, right = null;
      for (var k = 0; k < g.length; k++) {
        if (g[k].r <= x && (!left || g[k].r > left.r)) left = g[k];
        if (g[k].l >= x && (!right || g[k].l < right.l)) right = g[k];
      }
      y = Math.max(left ? left.top : right.top, right ? right.top : left.top);
    }
    ground.push(y);
  }
  // lower edge follows the letters closely (a little into them, so no light shines through)
  var bottom = seasonSnowSmooth(ground, Math.round(fs * 0.05 / step)).map(function (v, i) { return Math.min(v, ground[i]) + fs * 0.045; });
  // upper edge: a softer version of the letter tops, plus lumps of different size
  var soft = seasonSnowSmooth(bottom, Math.round(fs * 0.12 / step));
  var p1 = rnd() * 6.28, p2 = rnd() * 6.28;
  var w1 = fs * (0.45 + rnd() * 0.35), w2 = fs * (0.9 + rnd() * 0.6);
  var base = fs * (0.1 + rnd() * 0.035);
  var top = xs.map(function (x, i) {
    var lump = 0.5 + 0.3 * Math.sin(x / w1 * 6.28 + p1) + 0.2 * Math.sin(x / w2 * 6.28 + p2);
    var thick = base + fs * 0.085 * lump;
    // round ends: the blanket thins out over the last bit of the word
    var edge = Math.min(x - a, b - x) / (fs * 0.16);
    var taper = edge >= 1 ? 1 : Math.sqrt(Math.max(0, 1 - (1 - edge) * (1 - edge)));
    return Math.min(soft[i], bottom[i]) - thick * taper;
  });
  // a few drops hanging over the edge (one at the end of longer words, more on long words)
  var drops = (width > fs * 1.2 && rnd() < 0.6 ? 1 : 0) + Math.floor(width / (fs * 3.5));
  for (var d = 0; d < drops; d++) {
    var c = d === 0 ? b - fs * (0.12 + rnd() * 0.2) : a + (b - a) * (0.2 + rnd() * 0.6);
    var rad = fs * (0.05 + rnd() * 0.04), depth = fs * (0.05 + rnd() * 0.06);
    for (var q = 0; q < xs.length; q++) {
      var dx = Math.abs(xs[q] - c);
      if (dx < rad) bottom[q] += depth * Math.sqrt(1 - (dx / rad) * (dx / rad));
    }
  }
  // the ends meet the lower edge, so the outline is closed and round
  top[0] = bottom[0] - fs * 0.01; top[top.length - 1] = bottom[bottom.length - 1] - fs * 0.01;
  return {
    top: xs.map(function (x, i) { return [x, top[i]]; }),
    bottom: xs.map(function (x, i) { return [x, bottom[i]]; }),
  };
}

function seasonSnowPath(pts, dx, dy) {
  return pts.map(function (p, i) { return (i ? 'L' : 'M') + (p[0] - dx).toFixed(1) + ' ' + (p[1] - dy).toFixed(1); }).join('');
}

// Draws (or clears) the snow of one heading. Returns false if it is not visible right now (try again later).
function seasonSnowDraw(el) {
  var rects = el.getClientRects();
  if (!rects.length || !el.isConnected) return false;
  var cs = getComputedStyle(el);
  var fs = parseFloat(cs.fontSize) || 16;
  var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  var key = text + '|' + cs.fontFamily + '|' + fs + '|' + Math.round(rects[0].width) + '|' + (document.fonts ? document.fonts.status : '');
  if (seasonSnowKeys && seasonSnowKeys.get(el) === key) return true;
  var words = seasonSnowWords(el, fs);
  var rnd = seasonSnowRandom(text);
  var shapes = words.map(function (w) { return seasonSnowShape(w, fs, rnd); }).filter(Boolean);
  if (!shapes.length) {
    ['--pinn-snow', '--pinn-snow-on'].forEach(function (v) { el.style.removeProperty(v); });
    if (seasonSnowKeys) seasonSnowKeys.set(el, key);
    return true;
  }
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  shapes.forEach(function (s) {
    s.top.concat(s.bottom).forEach(function (p) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
  });
  var pad = 1.5;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  var W = Math.ceil(maxX - minX), H = Math.ceil(maxY - minY);
  var outline = '', light = '';
  shapes.forEach(function (s) {
    outline += seasonSnowPath(s.top, minX, minY) + seasonSnowPath(s.bottom.slice().reverse(), minX, minY).replace(/^M/, 'L') + 'Z';
    // white snow; a thin shaded strip stays visible along the lower edge
    var mid = s.bottom.map(function (p, i) { return [p[0], Math.max(s.top[i][1] + (p[1] - s.top[i][1]) * 0.45, p[1] - fs * 0.045)]; });
    light += seasonSnowPath(s.top, minX, minY) + seasonSnowPath(mid.reverse(), minX, minY).replace(/^M/, 'L') + 'Z';
  });
  var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='" + W + "' height='" + H + "' viewBox='0 0 " + W + ' ' + H + "'>"
    + "<path d='" + outline + "' fill='#dfe9f2' stroke='#8eaac2' stroke-width='.7' stroke-linejoin='round'/>"
    + "<path d='" + light + "' fill='#fff'/></svg>";
  el.style.setProperty('--pinn-snow', 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")');
  el.style.setProperty('--pinn-snow-x', minX.toFixed(1) + 'px');
  el.style.setProperty('--pinn-snow-y', minY.toFixed(1) + 'px');
  el.style.setProperty('--pinn-snow-w', W + 'px');
  el.style.setProperty('--pinn-snow-h', H + 'px');
  el.style.setProperty('--pinn-snow-on', '1');
  // holly (Christmas) on the snow at the end of the first word that is long enough
  var hs = shapes.filter(function (s) { return s.top[s.top.length - 1][0] - s.top[0][0] > fs * 0.9; })[0] || shapes[0];
  var at = Math.max(0, hs.top.length - 1 - Math.round(hs.top.length * 0.18));
  el.style.setProperty('--pinn-holly-x', (hs.top[at][0] - fs * 0.31).toFixed(1) + 'px');
  el.style.setProperty('--pinn-holly-y', (hs.top[at][1] - fs * 0.3).toFixed(1) + 'px');
  if (seasonSnowKeys) seasonSnowKeys.set(el, key);
  return true;
}

function seasonSnowScan() {
  seasonSnowTimer = null;
  if (!document.documentElement.classList.contains('pinn-winter')) return;
  document.querySelectorAll(SEASON_SNOW_SEL).forEach(function (el) {
    try { seasonSnowDraw(el); } catch (e) { /* one odd heading must not stop the others */ }
  });
}
function seasonSnowSoon(ms) {
  if (seasonSnowTimer) clearTimeout(seasonSnowTimer);
  seasonSnowTimer = setTimeout(seasonSnowScan, ms == null ? 250 : ms);
}
// Changes made by the snow layer itself (flakes, Santa) do not need a new measurement
function seasonSnowRelevant(records) {
  for (var i = 0; i < records.length; i++) {
    var r = records[i], t = r.target;
    if (t === seasonLayer || (t.closest && t.closest('.pinn-season-layer'))) continue;
    if (r.type === 'childList' && t === document.body) {
      var own = true;
      [].forEach.call(r.addedNodes, function (n) { if (!(n.classList && n.classList.contains('pinn-season-layer'))) own = false; });
      [].forEach.call(r.removedNodes, function (n) { if (!(n.classList && n.classList.contains('pinn-season-layer'))) own = false; });
      if (own) continue;
    }
    return true;
  }
  return false;
}
// Watch for new or changed headings only while the winter look is on
function seasonSnowWatch(on) {
  if (on && !seasonSnowObserver && typeof MutationObserver === 'function') {
    seasonSnowObserver = new MutationObserver(function (records) { if (seasonSnowRelevant(records)) seasonSnowSoon(); });
    seasonSnowObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    seasonSnowSoon(0);
  } else if (!on && seasonSnowObserver) {
    seasonSnowObserver.disconnect();
    seasonSnowObserver = null;
  }
}
window.addEventListener('resize', function () { if (seasonSnowObserver) seasonSnowSoon(200); });
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(function () { if (seasonSnowObserver) seasonSnowSoon(0); });
  if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { if (seasonSnowObserver) seasonSnowSoon(50); });
}

// Takes the switch from the personal design (called by applyPersonalDesign in js/design.js)
function seasonLoad(w) {
  seasonFx = !(w && w.seasonFx === false);
  try { localStorage.setItem(SEASON_DEVICE_KEY, seasonFx ? '1' : '0'); } catch (e) { /* storage full or blocked */ }
  seasonApply();
  seasonSyncInputs();
}

function seasonSyncInputs() {
  var t = document.getElementById('seasonFxToggle');
  if (t) t.checked = seasonFx;
}

function seasonPreview() {
  seasonPreviewUntil = Date.now() + 60000;
  seasonLastFlurry = 0;
  seasonApply();
  seasonFlurry();
  setTimeout(seasonSanta, 1500);
  if (seasonPreviewTimer) clearTimeout(seasonPreviewTimer);
  seasonPreviewTimer = setTimeout(function () {
    seasonPreviewTimer = null;
    seasonPreviewUntil = 0;
    seasonApply();
  }, 60500);
}

// Tap on the logo: more snow (and at Christmas maybe Santa)
function seasonLogoTap() {
  if (!seasonCurrent().winter) return;
  seasonLastFlurry = 0;
  seasonFlurry();
  if (seasonCurrent().xmas && Math.random() < 0.5) setTimeout(seasonSanta, 900);
}

(function seasonInit() {
  try { seasonFx = localStorage.getItem(SEASON_DEVICE_KEY) !== '0'; } catch (e) { seasonFx = true; }
  var toggle = document.getElementById('seasonFxToggle');
  if (toggle) {
    toggle.addEventListener('change', function () {
      seasonFx = !!toggle.checked;
      try { localStorage.setItem(SEASON_DEVICE_KEY, seasonFx ? '1' : '0'); } catch (e) { /* storage full or blocked */ }
      seasonLastFlurry = 0;
      seasonStarted = false;
      seasonApply();
      if (typeof savePersonalDesign === 'function') savePersonalDesign();
    });
  }
  var btn = document.getElementById('seasonPreviewBtn');
  if (btn) btn.addEventListener('click', seasonPreview);
  document.querySelectorAll('.pinn-logo-wrap').forEach(function (el) { el.addEventListener('click', seasonLogoTap); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { seasonHiddenAt = Date.now(); return; }
    var away = seasonHiddenAt ? Date.now() - seasonHiddenAt : 0;
    seasonHiddenAt = 0;
    seasonApply();
    if (away >= SEASON_BREAK_MS) seasonFlurry();
  });
  seasonApply();
  seasonSyncInputs();
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('winterzeit');
