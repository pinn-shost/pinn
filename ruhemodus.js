/* pinn. – Power saving: idle mode (js/ruhemodus.js)
   Part of the app code that used to be an inline script in index.html. Classic script, no build step:
   it is loaded with <script src> in the <head> of index.html, at exactly the place of the former inline script, so it
   still runs while the <head> is parsed, before every other app file (the load order is listed in index.html
   and in pinn-setup.sh).
   It MUST stay the first script: it replaces window.setInterval (intervals from 1 s only run while pinn. is visible,
   in idle mode at most every 5 minutes, missed runs are caught up) before any other file uses it.
   Contents: the setInterval/clearInterval wrapper, idle detection (class pinn-ruhe on <html>, see css/energiesparen.css),
   the event pinn-wach and window.pinnRuhe(). */

(function () {
  var IDLE_MS = 3 * 60 * 1000;      // no interaction -> idle mode
  var BLUR_IDLE_MS = 60 * 1000;     // another window in front (Mac/PC) -> idle mode
  var SLOW_MS = 5 * 60 * 1000;      // in idle mode: polling at most this often
  var nativeSI = window.setInterval, nativeCI = window.clearInterval;
  var entries = {};
  var lastInput = Date.now();
  var focused = true;
  var blurAt = 0;
  var ruhe = false;

  function hidden() { return document.visibilityState === 'hidden'; }
  function run(e) {
    e.missed = false;
    e.lastRun = Date.now();
    try { e.fn.apply(window, e.args); } catch (err) { console.error(err); }
  }
  window.setInterval = function (fn, delay) {
    var d = Number(delay) || 0;
    if (typeof fn !== 'function' || d < 1000) return nativeSI.apply(window, arguments);
    var e = { fn: fn, args: Array.prototype.slice.call(arguments, 2), delay: d, missed: false, lastRun: Date.now() };
    var id = nativeSI.call(window, function () {
      if (hidden()) { e.missed = true; return; }
      if (ruhe && d >= 60000 && Date.now() - e.lastRun < SLOW_MS) { e.missed = true; return; }
      run(e);
    }, d);
    entries[id] = e;
    return id;
  };
  window.clearInterval = function (id) {
    if (id != null) delete entries[id];
    return nativeCI.call(window, id);
  };

  function catchUp() {
    var list = [];
    for (var k in entries) if (entries[k].missed) list.push(entries[k]);
    list.forEach(function (e, i) {
      setTimeout(function () { if (e.missed && !hidden()) run(e); }, 250 + i * 200);
    });
  }
  function setRuhe(on) {
    if (on === ruhe) return;
    ruhe = on;
    document.documentElement.classList.toggle('pinn-ruhe', on);
    if (!on) {
      catchUp();
      try { window.dispatchEvent(new Event('pinn-wach')); } catch (e) { /* old browser */ }
    }
  }
  function check() {
    if (hidden()) return;
    var now = Date.now();
    setRuhe(now - lastInput > IDLE_MS || (!focused && now - blurAt > BLUR_IDLE_MS));
  }
  function input() {
    lastInput = Date.now();
    if (ruhe) { focused = true; setRuhe(false); }
  }
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(function (t) {
    window.addEventListener(t, input, { passive: true, capture: true });
  });
  window.addEventListener('focus', function () { focused = true; input(); });
  window.addEventListener('blur', function () { focused = false; blurAt = Date.now(); });
  document.addEventListener('visibilitychange', function () {
    if (hidden()) return;
    lastInput = Date.now();
    if (ruhe) setRuhe(false); else catchUp();
  });
  nativeSI.call(window, check, 20 * 1000);

  // For other parts of pinn.: is idle mode active right now?
  window.pinnRuhe = function () { return ruhe; };
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('ruhemodus');
