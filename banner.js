/* pinn. – Calm banners for Health and Pets (js/banner.js, since 1.162.0)
   Classic script, no build step: loaded after js/szenen.js (the load order is listed in src/rahmen.html and in pinn-setup.sh).
   What it does: builds the banner at the top of the health pages (pnHealthBandHtml) and of the pet pages
   (pnPetBandHtml for one pet, pnPetsBandHtml for the list of all pets). They replace the animated scenes of
   1.138.0 / 1.150.5 (hopping figures, beating heart, floating things).
   Look: a soft gradient in the colour of the person / pet, two blurred light circles, a fine dot grid, big thin
   line icons from our own set (js/symbole*.js, 24 grid) laid over the right side like a watermark, and a few
   fine lines that belong to the topic (heartbeat and water for health, a whisker fan for cats, a horseshoe for
   horses, bubbles for fish, scales for reptiles …). Nothing jumps: the only motion is a very slow drift of the
   two light circles and the waves (class hs-anim, so energy saving and "reduce motion" stop it).
   The styles are in css/banner.css. */

function pnNight() {
  try { if (typeof fzSceneIsNight === 'function') return !!fzSceneIsNight(); } catch (e) { /* fall back to fixed times */ }
  const h = new Date().getHours();
  return h >= 20 || h < 6;
}
// A line icon as a watermark: size in px, position and turn by style
function pnIco(name, size, pos, extra) {
  if (typeof wxIcon !== 'function') return '';
  const rot = extra && extra.rot ? `;--r:${extra.rot}deg` : '';
  const op = extra && extra.op != null ? `;opacity:${extra.op}` : '';
  return `<span class="pn-ico${size <= 30 ? ' sm' : ''}" style="--s:${size}px;${pos}${rot}${op}">${wxIcon(name)}</span>`;
}
// Bottom row of fine strokes, e.g. blades of grass: n strokes over 400 units
function pnStrokes(n, y, h, seed) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const x = Math.round((i + 0.5) * 400 / n + ((i * seed) % 7) - 3);
    const hh = h - ((i * seed) % 5) * 2;
    d += `M${x} ${y} l${(i % 2 ? 2 : -2)} -${hh}`;
  }
  return d;
}
const PN_WAVE = 'M0 10 Q25 2 50 10 T100 10 T150 10 T200 10 V40 H0Z';

/* ---------- Health ---------- */
// level 0..1 = share of the daily drinking goal: it only sets how high the soft water line at the bottom stands
function pnHealthBandHtml(level, color) {
  const night = pnNight();
  const lv = Math.max(0, Math.min(1, Number(level) || 0));
  const water = Math.round(10 + lv * 28); // px
  return `<div class="fam-band pn-band pn-health${night ? ' is-night' : ''}" style="--fz:${famAttr(color || 'var(--c-pine)')}" aria-hidden="true">
      <i class="pn-blob b1 hs-anim"></i><i class="pn-blob b2 hs-anim"></i><i class="pn-dots"></i>
      <svg class="pn-ecg" viewBox="0 0 300 40" preserveAspectRatio="none"><path d="M0 22 H86 L94 22 L101 9 L109 33 L117 5 L125 26 L131 22 H300"/></svg>
      ${pnIco('heart', 108, 'right:10px;bottom:-22px', { rot: -8 })}
      ${pnIco('drop', 26, 'right:132px;top:12px', { rot: 12 })}
      ${pnIco('pill', 26, 'right:92px;top:46px', { rot: 0 })}
      <div class="pn-water" style="height:${water}px">
        <svg class="pn-wave back hs-anim" viewBox="0 0 200 40" preserveAspectRatio="none"><path d="${PN_WAVE}"/></svg>
        <svg class="pn-wave front hs-anim" viewBox="0 0 200 40" preserveAspectRatio="none"><path d="${PN_WAVE}"/></svg>
      </div>
    </div>`;
}

/* ---------- Pets ---------- */
// Per species: big icon, tint of the gradient, fine lines of the topic (drawn in a 400 x 92 box, white, see css)
const PN_PET = {
  hund: {
    icon: 'dog', tint: '#7FB69A',
    art: () => '<path class="dash" d="M8 72 C70 28 130 92 210 52 S330 40 396 20"/>',
    extra: () => pnIco('paw', 20, 'left:9%;top:44px', { rot: -24, op: 0.3 }) + pnIco('paw', 20, 'left:21%;top:24px', { rot: -10, op: 0.26 })
      + pnIco('paw', 20, 'left:33%;top:50px', { rot: -22, op: 0.22 }) + pnIco('paw', 20, 'left:45%;top:28px', { rot: -8, op: 0.18 }),
  },
  katze: {
    icon: 'cat', tint: '#A99BD6',
    art: () => '<circle cx="262" cy="58" r="15"/><path d="M251 49c10 2 19 8 23 18M249 58c12 0 21 4 26 10M253 68c7-1 14-5 18-11"/>'
      + '<path d="M247 63C214 82 196 42 160 62S96 80 60 54" stroke-dasharray="2 6" stroke-linecap="round"/>'
      + '<path d="M20 30l34 6M20 42l36 0M20 54l34-6" opacity=".7"/>',
    extra: () => '',
  },
  kaninchen: {
    icon: 'rabbit', tint: '#8FC4A0',
    art: () => '<path d="M0 82 Q60 58 130 74 T270 68 T400 76"/><path d="M0 92 Q80 72 160 86 T330 82 T400 88" opacity=".7"/>',
    extra: () => pnIco('leaf', 22, 'left:12%;top:36px', { rot: 20, op: 0.3 }) + pnIco('leaf', 18, 'left:24%;top:22px', { rot: -30, op: 0.24 })
      + pnIco('leaf', 20, 'left:38%;top:42px', { rot: 50, op: 0.22 }),
  },
  meerschweinchen: {
    icon: 'hamster', tint: '#E3B27A',
    art: () => '<circle cx="258" cy="46" r="30"/><circle cx="258" cy="46" r="4"/><path d="M258 16v60M228 46h60M237 25l42 42M279 25l-42 42"/>',
    extra: () => '<span class="pn-seed" style="left:14%;top:50px"></span><span class="pn-seed" style="left:19%;top:32px"></span><span class="pn-seed" style="left:27%;top:56px"></span>',
  },
  hamster: {
    icon: 'hamster', tint: '#E3B27A',
    art: () => '<circle cx="258" cy="46" r="30"/><circle cx="258" cy="46" r="4"/><path d="M258 16v60M228 46h60M237 25l42 42M279 25l-42 42"/>',
    extra: () => '<span class="pn-seed" style="left:14%;top:50px"></span><span class="pn-seed" style="left:19%;top:32px"></span><span class="pn-seed" style="left:27%;top:56px"></span>',
  },
  vogel: {
    icon: 'bird', tint: '#7DC0D6',
    art: () => '<path d="M150 74C210 62 280 78 400 56"/><path d="M60 30q10-9 20 0M50 20q16-15 36 0"/>',
    extra: () => pnIco('leaf', 20, 'left:42%;top:52px', { rot: 40, op: 0.28 }) + pnIco('leaf', 18, 'left:56%;top:50px', { rot: -25, op: 0.24 }),
  },
  fisch: {
    icon: 'fish', tint: '#6FC3D4',
    art: () => '<circle cx="190" cy="62" r="5"/><circle cx="204" cy="40" r="3"/><circle cx="184" cy="22" r="2.5"/><circle cx="320" cy="28" r="6"/><circle cx="336" cy="56" r="3.5"/><circle cx="110" cy="34" r="4"/>'
      + '<path d="M0 78q15-10 30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0" opacity=".8"/>',
    extra: () => '',
  },
  reptil: {
    icon: 'turtle', tint: '#9AC86A',
    art: () => '', // drawn by pnReptilArt (scale pattern that fades out to the left)
    extra: () => '',
  },
  pferd: {
    icon: 'horse', tint: '#D2A06A',
    art: () => '<path d="M268 80V52a24 24 0 0 1 48 0V80h-10V52a14 14 0 0 0-28 0V80z"/><circle cx="276" cy="50" r="1.6"/><circle cx="280" cy="38" r="1.6"/><circle cx="308" cy="38" r="1.6"/><circle cx="312" cy="50" r="1.6"/>'
      + `<path d="${pnStrokes(34, 92, 14, 3)}" opacity=".8"/>`,
    extra: () => '',
  },
  sonstiges: {
    icon: 'paw', tint: '#8FB8C9',
    art: () => '<path class="dash" d="M8 72 C70 28 130 92 210 52 S330 40 396 20"/>',
    extra: () => pnIco('paw', 20, 'left:12%;top:40px', { rot: -20, op: 0.28 }) + pnIco('paw', 20, 'left:28%;top:24px', { rot: -8, op: 0.22 })
      + pnIco('paw', 20, 'left:44%;top:46px', { rot: -22, op: 0.18 }),
  },
};
// Scale pattern of reptiles, fading out to the left
function pnReptilArt() {
  return '<defs><pattern id="pnScale" width="28" height="48.5" patternUnits="userSpaceOnUse" patternTransform="scale(.75)">'
    + '<path d="M14 0L28 8V24L14 32L0 24V8Z M14 32V48.5M0 24L-14 32M28 24L42 32"/></pattern>'
    + '<linearGradient id="pnScaleFade" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity=".9"/></linearGradient>'
    + '<mask id="pnScaleMask"><rect width="400" height="92" fill="url(#pnScaleFade)"/></mask></defs>'
    + '<rect width="400" height="92" fill="url(#pnScale)" stroke="none" style="stroke:none" mask="url(#pnScaleMask)" class="pn-scale"/>';
}

// Banner of one pet: colour of the pet, art of its species
function pnPetBandHtml(species, color) {
  const def = PN_PET[species] || PN_PET.sonstiges;
  const art = species === 'reptil' ? pnReptilArt() : def.art();
  return `<div class="fam-band pn-band pn-pet pn-sp-${famAttr(PN_PET[species] ? species : 'sonstiges')}" style="--fz:${famAttr(color || '#B5651D')};--pn-tint:${def.tint}" aria-hidden="true">
      <i class="pn-blob b1 hs-anim"></i><i class="pn-blob b2 hs-anim"></i><i class="pn-dots"></i>
      <svg class="pn-art" viewBox="0 0 400 92" preserveAspectRatio="xMidYMid slice">${art}</svg>
      ${def.extra()}
      ${pnIco(def.icon, 112, 'right:8px;bottom:-26px', { rot: species === 'fisch' ? 0 : -6 })}
    </div>`;
}

// Banner of the pet list: the species of the family in thin outline, large and small next to each other
function pnPetsBandHtml(list) {
  const species = [...new Set((list || []).map(p => (PN_PET[p.species] ? p.species : 'sonstiges')))];
  const icons = species.map(s => PN_PET[s].icon).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
  if (!icons.length) icons.push('paw');
  const spots = [['right:8px;bottom:-24px', 108, -6], ['right:112px;bottom:-14px', 74, 8], ['right:182px;bottom:-8px', 52, -4]];
  const marks = icons.map((ic, i) => pnIco(ic, spots[i][1], spots[i][0], { rot: spots[i][2], op: i === 0 ? 0.3 : 0.22 })).join('');
  return `<div class="fam-band pn-band pn-pet pn-pets" style="--fz:var(--c-pine);--pn-tint:#7FB69A" aria-hidden="true">
      <i class="pn-blob b1 hs-anim"></i><i class="pn-blob b2 hs-anim"></i><i class="pn-dots"></i>
      <svg class="pn-art" viewBox="0 0 400 92" preserveAspectRatio="xMidYMid slice"><path class="dash" d="M8 74 C70 30 130 94 210 54 S330 42 396 22"/></svg>
      ${pnIco('paw', 18, 'left:8%;top:48px', { rot: -24, op: 0.3 })}${pnIco('paw', 18, 'left:19%;top:28px', { rot: -10, op: 0.24 })}${pnIco('paw', 18, 'left:30%;top:52px', { rot: -22, op: 0.2 })}
      ${marks}
    </div>`;
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('banner');
