/* pinn. – js/kennzeichen.js (since 1.126.0)
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the other files in js/.
   Loaded right before js/fahrzeuge.js. Nothing runs while this file loads except building the
   constant tables; the functions are only called later from js/fahrzeuge.js.

   Contents: how a vehicle's licence plate looks in the app, per country.
   - FZ_PLATE_STYLES: one entry per country (code = ISO country code as in js/region.js) with the colours
     of the plate, the strip on the left (EU circle of stars with the country letters, a plain blue strip
     with the letters, or none), optional extra bands (right, top, top and bottom) and a sample number
     for the placeholder of the input field.
   - The vehicle keeps its choice in vehicle.plateStyle: '' = automatic (country of the region under
     Settings → Language & region of this device), 'neutral' = plain plate without country, or a country code.
   - fzPlateNode() builds the plate from DOM nodes (text only via textContent, never as HTML);
     fzPlateHtml() returns the same plate as markup for the existing list templates.
   New country: add one row to FZ_PLATE_STYLES. Colours must be '#rrggbb'. */

// Strip kinds: 'eu' = blue strip with the circle of 12 stars and the country letters,
// 'band' = blue strip with the country letters only (European countries outside the EU, Israel),
// '' = no strip.
// Row: [code, strip, letters, background, text colour, border colour, extras, sample]
// extras: r = colour of a narrow band on the right, t = colour of a band on top (Mercosur),
//         s = colour of thin bands on top and bottom (Austria), round = rounded corners (North America)
const FZ_PLATE_ROWS = [
  // European Union
  ['DE', 'eu', 'D', '#ffffff', '#111111', '#1b1b1b', null, 'KS AB 123'],
  ['AT', 'eu', 'A', '#ffffff', '#111111', '#1b1b1b', { s: '#C8102E' }, 'W 123 AB'],
  ['BE', 'eu', 'B', '#ffffff', '#A6192E', '#A6192E', null, '1-ABC-123'],
  ['NL', 'eu', 'NL', '#F7C600', '#111111', '#1b1b1b', null, 'AB-123-C'],
  ['LU', 'eu', 'L', '#F7C600', '#111111', '#1b1b1b', null, 'AB 1234'],
  ['FR', 'eu', 'F', '#ffffff', '#111111', '#1b1b1b', { r: '#1E4AA8' }, 'AB-123-CD'],
  ['IT', 'eu', 'I', '#ffffff', '#111111', '#1b1b1b', { r: '#1E4AA8' }, 'AB 123 CD'],
  ['ES', 'eu', 'E', '#ffffff', '#111111', '#1b1b1b', null, '1234 BCD'],
  ['PT', 'eu', 'P', '#ffffff', '#111111', '#1b1b1b', { r: '#F2C200' }, 'AA-12-BB'],
  ['IE', 'eu', 'IRL', '#ffffff', '#111111', '#1b1b1b', null, '231-D-1234'],
  ['MT', 'eu', 'M', '#ffffff', '#111111', '#1b1b1b', null, 'ABC 123'],
  ['DK', 'eu', 'DK', '#ffffff', '#111111', '#C8102E', null, 'AB 12 345'],
  ['SE', 'eu', 'S', '#ffffff', '#111111', '#1b1b1b', null, 'ABC 12D'],
  ['FI', 'eu', 'FIN', '#ffffff', '#111111', '#1b1b1b', null, 'ABC-123'],
  ['PL', 'eu', 'PL', '#ffffff', '#111111', '#1b1b1b', null, 'WA 12345'],
  ['CZ', 'eu', 'CZ', '#ffffff', '#111111', '#1b1b1b', null, '1AB 2345'],
  ['SK', 'eu', 'SK', '#ffffff', '#111111', '#1b1b1b', null, 'BA-123AB'],
  ['HU', 'eu', 'H', '#ffffff', '#111111', '#1b1b1b', null, 'AA AB-123'],
  ['SI', 'eu', 'SLO', '#ffffff', '#111111', '#1E6B3A', null, 'LJ AB-123'],
  ['HR', 'eu', 'HR', '#ffffff', '#111111', '#1b1b1b', null, 'ZG 123-AB'],
  ['RO', 'eu', 'RO', '#ffffff', '#111111', '#1b1b1b', null, 'B 123 ABC'],
  ['BG', 'eu', 'BG', '#ffffff', '#111111', '#1b1b1b', null, 'CA 1234 AB'],
  ['GR', 'eu', 'GR', '#ffffff', '#111111', '#1b1b1b', null, 'ABE-1234'],
  ['CY', 'eu', 'CY', '#ffffff', '#111111', '#1b1b1b', null, 'ABC 123'],
  ['EE', 'eu', 'EST', '#ffffff', '#111111', '#1b1b1b', null, '123 ABC'],
  ['LV', 'eu', 'LV', '#ffffff', '#111111', '#1b1b1b', null, 'AB-1234'],
  ['LT', 'eu', 'LT', '#ffffff', '#111111', '#1b1b1b', null, 'ABC 123'],
  // Rest of Europe
  ['CH', '', '', '#ffffff', '#111111', '#1b1b1b', null, 'ZH 123456'],
  ['LI', '', '', '#111111', '#ffffff', '#111111', null, 'FL 12345'],
  ['MC', '', '', '#ffffff', '#1E4AA8', '#1E4AA8', null, 'AB12'],
  ['AD', 'band', 'AND', '#ffffff', '#111111', '#1b1b1b', null, 'A1234'],
  ['GB', 'band', 'UK', '#F7C600', '#111111', '#1b1b1b', null, 'AB12 CDE'],
  ['NO', 'band', 'N', '#ffffff', '#111111', '#1b1b1b', null, 'AB 12345'],
  ['IS', 'band', 'IS', '#ffffff', '#1E4AA8', '#1E4AA8', null, 'AB 123'],
  ['RS', 'band', 'SRB', '#ffffff', '#111111', '#1b1b1b', null, 'BG 123-AB'],
  ['BA', 'band', 'BIH', '#ffffff', '#111111', '#1b1b1b', null, 'A12-B-345'],
  ['TR', 'band', 'TR', '#ffffff', '#111111', '#1b1b1b', null, '34 ABC 123'],
  ['UA', 'band', 'UA', '#ffffff', '#111111', '#1b1b1b', null, 'AA 1234 BC'],
  ['RU', '', '', '#ffffff', '#111111', '#1b1b1b', null, 'А123ВС 77'],
  // Americas
  ['US', '', '', '#ffffff', '#1A2A6C', '#1A2A6C', { round: 1 }, 'ABC 1234'],
  ['CA', '', '', '#ffffff', '#1A2A6C', '#1A2A6C', { round: 1 }, 'ABCD 123'],
  ['MX', '', '', '#ffffff', '#111111', '#1b1b1b', { round: 1 }, 'ABC-123-D'],
  ['BR', '', '', '#ffffff', '#111111', '#1b1b1b', { t: '#1E4AA8' }, 'ABC1D23'],
  ['AR', '', '', '#ffffff', '#111111', '#1b1b1b', { t: '#1E4AA8' }, 'AB 123 CD'],
  ['CL', '', '', '#ffffff', '#111111', '#1b1b1b', null, 'ABCD 12'],
  ['CO', '', '', '#FFD100', '#111111', '#1b1b1b', null, 'ABC 123'],
  ['PE', '', '', '#ffffff', '#111111', '#1b1b1b', null, 'ABC-123'],
  // Africa, Middle East
  ['ZA', '', '', '#ffffff', '#111111', '#1b1b1b', null, 'CA 123-456'],
  ['MA', '', '', '#ffffff', '#111111', '#1b1b1b', null, '12345-A-6'],
  ['EG', '', '', '#ffffff', '#111111', '#1b1b1b', { t: '#2F7FC1' }, '123 ABC'],
  ['IL', 'band', 'IL', '#F7C600', '#111111', '#1b1b1b', null, '123-45-678'],
  ['AE', '', '', '#ffffff', '#111111', '#1b1b1b', null, 'A 12345'],
  ['SA', '', '', '#ffffff', '#111111', '#1b1b1b', null, '1234 ABC'],
  // Asia, Oceania
  ['IN', '', '', '#ffffff', '#111111', '#1b1b1b', null, 'MH 12 AB 1234'],
  ['CN', '', '', '#1B4FA0', '#ffffff', '#ffffff', null, '京A·12345'],
  ['JP', '', '', '#ffffff', '#1E6B3A', '#1E6B3A', null, '品川 300 あ 1234'],
  ['KR', '', '', '#ffffff', '#111111', '#1b1b1b', null, '12가 3456'],
  ['TW', '', '', '#ffffff', '#111111', '#1b1b1b', null, 'ABC-1234'],
  ['HK', '', '', '#F7C600', '#111111', '#1b1b1b', null, 'AB 1234'],
  ['SG', '', '', '#111111', '#f2f2f2', '#111111', null, 'SBA 1234 A'],
  ['TH', '', '', '#ffffff', '#111111', '#1b1b1b', null, '1กก 1234'],
  ['PH', '', '', '#ffffff', '#111111', '#1b1b1b', null, 'ABC 1234'],
  ['ID', '', '', '#ffffff', '#111111', '#1b1b1b', null, 'B 1234 ABC'],
  ['MY', '', '', '#111111', '#ffffff', '#111111', null, 'WA 1234 B'],
  ['VN', '', '', '#ffffff', '#111111', '#1b1b1b', null, '30A-123.45'],
  ['AU', '', '', '#ffffff', '#111111', '#1b1b1b', null, 'ABC 123'],
  ['NZ', '', '', '#ffffff', '#111111', '#1b1b1b', null, 'ABC123'],
];
// Plain plate without country (also used for countries without an entry)
const FZ_PLATE_NEUTRAL = { code: 'neutral', strip: '', letters: '', bg: '#ffffff', fg: '#111111', border: '#1b1b1b', x: {}, sample: 'AB 123' };
const FZ_PLATE_STYLES = (() => {
  const isHex = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  const out = {};
  FZ_PLATE_ROWS.forEach(r => {
    const x = r[6] || {};
    out[r[0]] = {
      code: r[0], strip: r[1], letters: r[2],
      bg: isHex(r[3]) ? r[3] : '#ffffff', fg: isHex(r[4]) ? r[4] : '#111111', border: isHex(r[5]) ? r[5] : '#1b1b1b',
      x: { r: isHex(x.r) ? x.r : '', t: isHex(x.t) ? x.t : '', s: isHex(x.s) ? x.s : '', round: !!x.round },
      sample: r[7],
    };
  });
  return out;
})();

// Country of the region on this device (Settings → Language & region), e.g. 'DE'
function fzPlateRegion() {
  try { return (window.PINN_REGION && PINN_REGION.land) || 'DE'; } catch (e) { return 'DE'; }
}
// Stored choice of a vehicle, cleaned: '' (automatic), 'neutral' or a known country code
function fzPlateStyleCode(code) {
  const c = String(code || '');
  return c === 'neutral' || FZ_PLATE_STYLES[c] ? c : '';
}
// The style to draw: the chosen one, otherwise the one of the region, otherwise neutral
function fzPlateStyle(code) {
  const c = fzPlateStyleCode(code);
  if (c === 'neutral') return FZ_PLATE_NEUTRAL;
  return FZ_PLATE_STYLES[c || fzPlateRegion()] || FZ_PLATE_NEUTRAL;
}
function fzPlateCountryName(code) {
  try { return (window.PINN_REGION && PINN_REGION.countryName(code)) || code; } catch (e) { return code; }
}
function fzPlateFlag(code) {
  try { return (window.PINN_REGION && PINN_REGION.flag(code)) || ''; } catch (e) { return ''; }
}
// Options for the select in the vehicle popup: automatic, neutral, then all countries by their name
function fzPlateStyleOptions() {
  const reg = fzPlateRegion();
  const regName = FZ_PLATE_STYLES[reg] ? fzPlateCountryName(reg) : tk('vehicle.plateStyleNeutral');
  const lang = (window.PINN_I18N && PINN_I18N.language && PINN_I18N.language.locale) || 'en';
  const countries = Object.keys(FZ_PLATE_STYLES)
    .map(c => [c, (fzPlateFlag(c) + ' ' + fzPlateCountryName(c)).trim(), fzPlateCountryName(c)])
    .sort((a, b) => a[2].localeCompare(b[2], lang));
  return [['', tk('vehicle.plateStyleAuto', { country: regName })], ['neutral', tk('vehicle.plateStyleNeutral')]]
    .concat(countries.map(c => [c[0], c[1]]));
}
// Placeholder for the plate input, matching the style
function fzPlateSample(code) {
  return tk('vehicle.plateExample', { plate: fzPlateStyle(code).sample });
}

// Circle of 12 five-pointed stars (EU symbol) as an SVG element
function fzPlateStars() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const star = (cx, cy, ro, ri) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const r = i % 2 ? ri : ro;
      pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    const p = document.createElementNS(NS, 'polygon');
    p.setAttribute('points', pts.join(' '));
    return p;
  };
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6 - Math.PI / 2;
    svg.appendChild(star(12 + 8.4 * Math.cos(a), 12 + 8.4 * Math.sin(a), 2.7, 1.1));
  }
  return svg;
}

// The plate as a DOM node. text = plate number (shown as text only), code = vehicle.plateStyle
function fzPlateNode(text, code, big) {
  const st = fzPlateStyle(code);
  const span = (cls) => { const s = document.createElement('span'); s.className = cls; return s; };
  const plate = span('fz-plate' + (big ? ' big' : '') + (st.x.round ? ' round' : '') + (st.x.t ? ' has-top' : ''));
  plate.style.background = st.bg;
  plate.style.color = st.fg;
  plate.style.borderColor = st.border;
  if (st.strip) {
    const strip = span(st.strip === 'eu' ? 'fz-plate-eu' : 'fz-plate-eu fz-plate-band');
    if (st.strip === 'eu') strip.appendChild(fzPlateStars());
    if (st.letters) {
      const l = span('fz-plate-cc');
      l.textContent = st.letters;
      strip.appendChild(l);
    }
    plate.appendChild(strip);
  }
  if (st.x.t) {
    const top = span('fz-plate-top');
    top.style.background = st.x.t;
    plate.appendChild(top);
  }
  const txt = span('fz-plate-txt');
  txt.textContent = fzPlateText(text);
  if (st.x.s) txt.style.boxShadow = 'inset 0 3px 0 ' + st.x.s + ', inset 0 -3px 0 ' + st.x.s;
  plate.appendChild(txt);
  if (st.x.r) {
    const right = span('fz-plate-r');
    right.style.background = st.x.r;
    plate.appendChild(right);
  }
  return plate;
}
// The same plate as markup for the list and detail templates (text is escaped by the DOM serializer)
function fzPlateHtml(p, big, code) {
  if (!p) return '';
  return fzPlateNode(p, code, big).outerHTML;
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('kennzeichen');
