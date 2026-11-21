/* pinn. – Arrows on scrolling menu bars (js/tabpfeile.js, since 1.162.0)
   Classic script, no build step; the load order is listed in src/rahmen.html and in pinn-setup.sh.
   What it does: every menu bar below a page header (tab bars like Family → Health, Home, Finance, Lists, vehicles,
   weather tabs, chip rows) gets a small arrow at the left and/or right end while there are more entries in that direction.
   A tap on an arrow scrolls the bar by about two thirds of its width; the arrows disappear at the ends and on wide
   screens where everything fits. The same idea as the tab bar of the Business module.
   How it works without touching the page structure: the bars stay where they are. The arrows are two small buttons
   that are added as siblings and laid over the bar (absolute position), created only when a bar really overflows.
   New bars (rendered later by other scripts) are found by a debounced MutationObserver. Bars with their own arrows
   (the tab bar of the Business add-on, .biz-tabs) or the attribute data-no-tab-arrows are left alone. */
(function () {
  var SELECTOR = '[role="tablist"], .ls-tabs, .wx-tabs, .fz-type-row, .pw-chips, .fam-chip-row';
  var SIZE = 28;            // arrow button size in px
  var EDGE = 4;             // distance from the bar edge in px
  var state = new WeakMap(); // bar -> { l, r }
  var scanTimer = null;

  function makeArrow(dir) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tp-arrow tp-' + dir + ' tp-hide';
    b.tabIndex = -1;
    b.setAttribute('aria-hidden', 'true');
    b.textContent = dir === 'l' ? '‹' : '›';
    return b;
  }

  // Lays the two arrows over the bar and shows each one only while there is more to scroll in its direction
  function update(bar) {
    var s = state.get(bar);
    if (!s) return;
    var max = bar.scrollWidth - bar.clientWidth;
    var visible = bar.offsetWidth > 0 && bar.offsetHeight > 0 && max > 4;
    if (!visible && !s.l) return;                       // nothing to show and nothing created yet
    if (!s.l) {
      var parent = bar.parentNode;
      if (!parent) return;
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      s.l = makeArrow('l'); s.r = makeArrow('r');
      s.l.addEventListener('click', function (e) { e.preventDefault(); scrollBar(bar, -1); });
      s.r.addEventListener('click', function (e) { e.preventDefault(); scrollBar(bar, 1); });
      parent.appendChild(s.l); parent.appendChild(s.r);
    }
    if (!s.l.isConnected && bar.parentNode) { bar.parentNode.appendChild(s.l); bar.parentNode.appendChild(s.r); }
    var top = bar.offsetTop + Math.max(0, (bar.offsetHeight - SIZE) / 2);
    s.l.style.top = s.r.style.top = top + 'px';
    s.l.style.left = (bar.offsetLeft + EDGE) + 'px';
    s.r.style.left = (bar.offsetLeft + bar.offsetWidth - SIZE - EDGE) + 'px';
    s.l.classList.toggle('tp-hide', !(visible && bar.scrollLeft > 2));
    s.r.classList.toggle('tp-hide', !(visible && bar.scrollLeft < max - 2));
  }

  function scrollBar(bar, dir) {
    var step = Math.max(80, Math.round(bar.clientWidth * 0.66));
    try { bar.scrollBy({ left: dir * step, behavior: 'smooth' }); } catch (e) { bar.scrollLeft += dir * step; }
  }

  // The entry the person just tapped (or the active one) is scrolled fully into view
  function keepActiveVisible(bar) {
    var a = bar.querySelector('[aria-selected="true"], .active, .is-active, .on');
    if (!a || a.parentNode !== bar) return;
    var br = bar.getBoundingClientRect(), ar = a.getBoundingClientRect();
    var left = ar.left - br.left + bar.scrollLeft, right = left + ar.width;
    var pad = SIZE + EDGE + 4;
    if (left < bar.scrollLeft + pad) bar.scrollTo({ left: Math.max(0, left - pad), behavior: 'smooth' });
    else if (right > bar.scrollLeft + bar.clientWidth - pad) bar.scrollTo({ left: right - bar.clientWidth + pad, behavior: 'smooth' });
  }

  function enhance(bar) {
    if (state.has(bar)) return;
    // The Business add-on has its own arrows (.biz-tabs); any bar can opt out with data-no-tab-arrows
    if (bar.matches('.biz-tabs, [data-no-tab-arrows]')) return;
    state.set(bar, { l: null, r: null });
    bar.classList.add('tp-bar');
    var upd = function () { update(bar); };
    bar.addEventListener('scroll', upd, { passive: true });
    bar.addEventListener('click', function () { setTimeout(function () { keepActiveVisible(bar); upd(); }, 60); });
    if (window.ResizeObserver) new ResizeObserver(upd).observe(bar);
    new MutationObserver(function () { requestAnimationFrame(upd); }).observe(bar, { childList: true, subtree: true, characterData: true });
    upd();
    setTimeout(upd, 400);   // fonts / translated texts change the width after the first layout
  }

  function scan() {
    scanTimer = null;
    var bars = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < bars.length; i++) enhance(bars[i]);
  }
  function scheduleScan() { if (!scanTimer) scanTimer = setTimeout(scan, 200); }

  function start() {
    scan();
    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', function () {
      var bars = document.querySelectorAll('.tp-bar');
      for (var i = 0; i < bars.length; i++) update(bars[i]);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('tabpfeile');
