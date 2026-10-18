/* pinn. – Family dashboard: PIN entry (js/pineingabe.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the PIN pad like on the iPhone (pinPad, renderPinPad, pinPadApi, openPinPad, closePinPad, pinPadPress) incl. the hardware keyboard. */

/* ---------- PIN entry (like on the iPhone) ---------- */
let pinPad = null; // { length, value, busy, lengthChoice, onComplete, onCancel }
function renderPinPad() {
  if (!pinPad) return;
  document.getElementById('pinPadDots').innerHTML = Array.from({ length: pinPad.length },
    (_, i) => `<span class="pin-dot${i < pinPad.value.length ? ' on' : ''}"></span>`).join('');
  document.querySelectorAll('#pinPadLengths .pin-len-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.pinLen) === pinPad.length));
}
function pinPadApi() {
  return {
    fail(message) {
      if (!pinPad) return;
      pinPad.value = '';
      document.getElementById('pinPadError').textContent = message || '';
      const box = document.getElementById('pinPadBox');
      box.classList.remove('shake');
      void box.offsetWidth; // restart the animation
      box.classList.add('shake');
      if (navigator.vibrate) { try { navigator.vibrate(90); } catch (e) { /* ignore */ } }
      renderPinPad();
    },
    reset(sub) {
      if (!pinPad) return;
      pinPad.value = '';
      if (sub != null) document.getElementById('pinPadSub').textContent = sub;
      document.getElementById('pinPadError').textContent = '';
      renderPinPad();
    },
    setSub(text) { document.getElementById('pinPadSub').textContent = text || ''; },
    showLengthChoice(on) {
      if (!pinPad) return;
      pinPad.lengthChoice = !!on;
      document.getElementById('pinPadLengths').classList.toggle('hidden', !on);
    },
    close: closePinPad,
  };
}
function openPinPad(opts) {
  pinPad = {
    length: opts.length === 6 ? 6 : 4, value: '', busy: false, lengthChoice: !!opts.lengthChoice,
    onComplete: opts.onComplete, onCancel: opts.onCancel,
  };
  document.getElementById('pinPadTitle').textContent = opts.title || '';
  document.getElementById('pinPadSub').textContent = opts.sub || '';
  document.getElementById('pinPadError').textContent = '';
  const avatar = document.getElementById('pinPadAvatar');
  avatar.innerHTML = opts.avatarHtml || '';
  avatar.classList.toggle('hidden', !opts.avatarHtml);
  document.getElementById('pinPadLengths').classList.toggle('hidden', !pinPad.lengthChoice);
  document.getElementById('pinPadBox').classList.remove('shake', 'busy');
  renderPinPad();
  document.getElementById('pinPadOverlay').classList.remove('hidden');
  try { if (document.activeElement) document.activeElement.blur(); } catch (e) { /* ignore */ }
}
function closePinPad() {
  document.getElementById('pinPadOverlay').classList.add('hidden');
  pinPad = null;
}
async function pinPadPress(key) {
  if (!pinPad || pinPad.busy) return;
  if (key === 'del') {
    pinPad.value = pinPad.value.slice(0, -1);
    renderPinPad();
    return;
  }
  if (!/^\d$/.test(key) || pinPad.value.length >= pinPad.length) return;
  if (!pinPad.value) document.getElementById('pinPadError').textContent = '';
  pinPad.value += key;
  renderPinPad();
  if (pinPad.value.length < pinPad.length) return;
  const current = pinPad;
  const pin = current.value;
  current.busy = true;
  const box = document.getElementById('pinPadBox');
  box.classList.add('busy');
  await new Promise(r => setTimeout(r, 140)); // briefly show the last dot
  try {
    await current.onComplete(pin, pinPadApi());
  } catch (e) {
    if (pinPad === current) pinPadApi().fail(e.message || 'Das hat nicht geklappt.');
  } finally {
    current.busy = false;
    box.classList.remove('busy');
  }
}
document.querySelectorAll('#pinPadOverlay [data-pin-key]').forEach(b => b.addEventListener('click', () => pinPadPress(b.dataset.pinKey)));
document.getElementById('pinPadDelete').addEventListener('click', () => pinPadPress('del'));
document.getElementById('pinPadCancel').addEventListener('click', () => {
  const p = pinPad;
  closePinPad();
  if (p && p.onCancel) p.onCancel();
});
document.querySelectorAll('#pinPadLengths .pin-len-btn').forEach(b => b.addEventListener('click', () => {
  if (!pinPad || pinPad.busy) return;
  pinPad.length = Number(b.dataset.pinLen) === 6 ? 6 : 4;
  pinPad.value = '';
  document.getElementById('pinPadError').textContent = '';
  renderPinPad();
}));
// hardware keyboard (e.g. iPad with keyboard)
document.addEventListener('keydown', (e) => {
  if (!pinPad) return;
  if (/^\d$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); pinPadPress(e.key); }
  else if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); pinPadPress('del'); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); document.getElementById('pinPadCancel').click(); }
}, true);

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('pineingabe');
