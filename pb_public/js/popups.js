/* pinn. – Generic popup behaviour (js/popups.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: asking before closing a changed popup (modalOpenSnapshots, snapshotModalFields, armModalSnapshot, isModalDirty, attemptCloseModal, wireModalOutsideClick), popups always opening at the top (isPopupOverlay, resetPopupScroll, scrollPopupToTop and a MutationObserver started while loading) and actualCurrentWeekRange. */

/* ==========================================================
   Generic popup behaviour: a click outside closes the window; if something was entered/changed
   since it was opened, the user is asked first ("Wirklich abbrechen?") - this applies to the
   click next to it just as to the "Abbrechen" button itself.
   ========================================================== */
const modalOpenSnapshots = {};

function snapshotModalFields(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return '';
  const els = modal.querySelectorAll('input, textarea, select');
  return Array.from(els).map(el => {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? '1' : '0';
    return el.value;
  }).join('§');
}
// Call at the end of every openXModal() function (after the fields are filled), so that we
// know from which state changes have to be detected.
function armModalSnapshot(modalId) {
  modalOpenSnapshots[modalId] = snapshotModalFields(modalId);
}
function isModalDirty(modalId) {
  return snapshotModalFields(modalId) !== modalOpenSnapshots[modalId];
}
// Tries to close a modal - asks first if something has changed since it was opened.
function attemptCloseModal(modalId, closeFn) {
  if (isModalDirty(modalId)) {
    if (!confirm(tk('doc.reallyCancelEntriesWill'))) return;
  }
  closeFn();
}
// A click on the background (not on the content) closes the modal just like "Abbrechen".
function wireModalOutsideClick(modalId, closeFn) {
  document.getElementById(modalId).addEventListener('click', (e) => {
    if (e.target.id !== modalId) return;
    attemptCloseModal(modalId, closeFn);
  });
}

/* ---------- Popups always open at the top ----------
   The popup elements are reused and therefore kept their last scroll position
   (often at the very bottom, e.g. after tapping "Speichern"). As soon as a popup (.fixed.inset-0)
   becomes visible, the popup itself and all scrollable areas inside it are set to the top.
   Because some contents are only filled shortly after opening, this is repeated twice shortly
   afterwards - but only as long as the user has not scrolled/tapped in the popup himself. */
function isPopupOverlay(el) {
  return el && el.nodeType === 1 && el.classList.contains('fixed') && el.classList.contains('inset-0')
    && el.id !== 'appRoot' && !el.classList.contains('hidden');
}
function resetPopupScroll(overlay) {
  if (overlay.scrollTop) overlay.scrollTop = 0;
  overlay.querySelectorAll('*').forEach(el => { if (el.scrollTop) el.scrollTop = 0; });
}
function scrollPopupToTop(overlay) {
  let userMoved = false;
  const stop = () => { userMoved = true; };
  const evts = ['touchstart', 'wheel', 'mousedown', 'keydown'];
  evts.forEach(t => overlay.addEventListener(t, stop, { passive: true, once: true }));
  resetPopupScroll(overlay);
  requestAnimationFrame(() => { if (!userMoved) resetPopupScroll(overlay); });
  setTimeout(() => { if (!userMoved && isPopupOverlay(overlay)) resetPopupScroll(overlay); }, 120);
  setTimeout(() => evts.forEach(t => overlay.removeEventListener(t, stop)), 500);
}
new MutationObserver((mutations) => {
  mutations.forEach(m => {
    if (m.type === 'attributes') {
      const wasHidden = (m.oldValue || '').split(/\s+/).includes('hidden');
      if (wasHidden && isPopupOverlay(m.target)) scrollPopupToTop(m.target);
    } else if (m.type === 'childList') {
      m.addedNodes.forEach(n => { if (isPopupOverlay(n)) scrollPopupToTop(n); });
    }
  });
}).observe(document.body, { attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true, childList: true });

/* ==========================================================
   Current week range (former section "Recipe list rendering")
   ========================================================== */
function actualCurrentWeekRange() {
  const monday = startOfWeek(new Date());
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('popups');
