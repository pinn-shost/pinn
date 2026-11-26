/* pinn. – Symbol picker for categories and rooms (js/symbolwahl.js, since 1.150.8)
   Classic script, no build step: loaded after js/symbole.js; the load order is listed in src/rahmen.html and pinn-setup.sh.
   Instead of typing an emoji with the phone keyboard, a category gets its symbol from a fixed set of ready-made icons of
   the app (the same ones everywhere, see js/symbole.js). The choice is still stored as the matching emoji character, so
   old data, the server and all other places keep working unchanged.
   sympInput(value, label) -> HTML of the symbol button (with a hidden input data-field="icon" that the editors read as before)
   sympSet(input, emoji)   -> sets a value from code (updates the button too)
   Tapping a button opens a sheet with SYMP_PALETTE; the choice fires an "input" event on the hidden input. */
var SYMP_PALETTE = [
  // shopping & food
  '🛒', '🧺', '🍎', '🥕', '🍞', '🧀', '🥩', '🥚', '🍕', '🍳', '🥣', '🍦', '🧁', '🍫', '🥤', '☕', '🍺', '🍷', '🍾', '🥫', '🧂', '🧊', '🍽️',
  // home, cleaning & tools
  '🏠', '🛋️', '🛏️', '🚪', '🪟', '🛁', '🚽', '🧹', '🧽', '🧼', '🪣', '🫧', '🧻', '💡', '🔌', '🔧', '🔨', '🪜', '🎨', '🧱', '🔥', '❄️', '💧', '🗑️', '♻️', '📦', '🔑', '🧯', '🌡️',
  // garden & nature
  '🌱', '🪴', '🌳', '🎄', '🌸', '🍂', '☀️', '🌧️', '🌈', '🐾',
  // family, kids & school
  '🍼', '🧸', '🧩', '🎈', '🎓', '✏️', '📖', '⚽', '🎮', '🎁', '🎂', '🎉', '👕', '👟',
  // health
  '🩺', '💊', '💉', '🦷', '🩹', '❤️', '👓', '🛁',
  // money & shopping
  '💶', '💳', '👛', '🐷', '🏦', '🧾', '📊', '📈', '⚖️', '🏷️', '🛡️',
  // mobility & trips
  '🚗', '🚌', '🚚', '🚲', '🛴', '🏍️', '✈️', '🚆', '🚢', '⛽', '🛞', '🅿️', '🗺️', '🧭', '🧳', '⛺', '🏖️', '⛰️',
  // leisure & media
  '🎬', '🎵', '📷', '🎟️', '🏋️', '🏊', '🎧', '📺', '💻', '📱', '📶', '📡',
  // office, documents & official
  '💼', '🗂️', '📄', '📋', '📌', '📎', '✉️', '🏛️', '🪪', '🖨️', '🔖', '📐', '🏫', '🏥', '🏢',
  // misc
  '⭐', '✨', '⚡', '🔒', '🔔', '⏰', '📅', '🎯', '🏆', '⚠️', '🤝'
];

// Own sets for plants and vehicle types (since 1.150.9): the sheet shows only these
var SYMP_SETS = {
  plants: ['🌱', '🪴', '🌿', '🌵', '🌴', '🌳', '🌲', '🌷', '🌻', '🌹', '🌼', '🪻', '🍀', '🍄', '🍅', '🍓', '🥕', '🌽', '🌶️', '🍎', '🍂', '💧', '☀️', '✂️', '🪣'],
  vehicles: ['🚗', '🚘', '🚙', '🚕', '🚐', '🛻', '🏎️', '🚌', '🚚', '🚜', '🛖', '🏍️', '🚲', '🚴', '🛴', '✈️', '🚢', '🚆']
};
// HTML of the symbol button for a category row (the hidden input keeps data-field="icon" like the old text field)
// opts: { set: 'plants' | 'vehicles' (own choice), id: id of the hidden input, ph: shown while empty }
function sympInput(value, label, opts) {
  opts = opts || {};
  var v = String(value || '');
  return '<span class="symp-wrap shrink-0"><input type="hidden" ' + (opts.id ? 'id="' + opts.id + '" ' : '') + 'data-field="icon" value="' + escapeHtml(v) + '">'
    + '<button type="button" class="symp-btn" data-symp' + (opts.set ? ' data-set="' + opts.set + '"' : '') + ' aria-label="' + escapeHtml(label || '') + '">' + escapeHtml(v || opts.ph || '🏷️') + '</button></span>';
}
// Sets the value from code and refreshes the button
function sympSet(input, emoji) {
  if (!input) return;
  input.value = emoji;
  var b = input.nextElementSibling;
  if (b && b.hasAttribute('data-symp')) b.textContent = emoji || '🏷️';
}

var sympPop = null;
function sympClose() { if (sympPop) { sympPop.remove(); sympPop = null; } }
function sympOpen(btn) {
  sympClose();
  var input = btn.previousElementSibling;
  if (!input || input.tagName !== 'INPUT') return;
  var cur = input.value;
  var ov = document.createElement('div');
  ov.className = 'symp-ov';
  // one button per icon (several emoji can share an icon)
  var seen = {};
  var grid = (SYMP_SETS[btn.getAttribute('data-set')] || SYMP_PALETTE).filter(function (e) {
    var n = SYM_MAP[e.replace(/[\uFE0F\u{1F3FB}-\u{1F3FF}]/gu, '')] || e;
    if (seen[n]) return false;
    seen[n] = 1;
    return true;
  }).map(function (e) {
    return '<button type="button" class="symp-opt' + (e === cur ? ' on' : '') + '" data-e="' + e + '">' + e + '</button>';
  }).join('');
  ov.innerHTML = '<div class="symp-sheet" role="dialog" aria-modal="true"><div class="symp-head"><b>' + escapeHtml(tk('household.icon'))
    + '</b><button type="button" class="symp-x" aria-label="' + escapeHtml(tk('common.close')) + '">×</button></div><div class="symp-grid">' + grid + '</div></div>';
  ov.addEventListener('click', function (ev) {
    var o = ev.target.closest('.symp-opt');
    if (o) { sympSet(input, o.getAttribute('data-e')); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); sympClose(); return; }
    if (ev.target === ov || ev.target.closest('.symp-x')) sympClose();
  });
  document.body.appendChild(ov);
  sympPop = ov;
}
document.addEventListener('click', function (ev) {
  var b = ev.target.closest && ev.target.closest('[data-symp]');
  if (b) { ev.preventDefault(); ev.stopPropagation(); sympOpen(b); }
}, true);
document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') sympClose(); });

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('symbolwahl');
