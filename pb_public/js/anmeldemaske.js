/* pinn. – Login screen (js/anmeldemaske.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the families saved on this device (readSavedFamilies, writeSavedFamilies, rememberFamily, forgetFamily, lastProfileKey), the login request (loginRequest) and the login screen with family, profile and main admin mode (showLoginScreen). Checking the login at start and logging out are in js/anmeldung.js. */

/* ---------- Saved families (names only, on this device) ---------- */
const LS_SAVED_FAMILIES = 'pinn.savedFamilies';
const LS_LAST_FAMILY = 'pinn.lastFamily';
const FAMILY_OTHER = '__andere__';
function readSavedFamilies() {
  try {
    const list = JSON.parse(localStorage.getItem(LS_SAVED_FAMILIES) || '[]');
    return Array.isArray(list) ? list.filter(n => typeof n === 'string' && n.trim()) : [];
  } catch (e) { return []; }
}
function writeSavedFamilies(list) {
  try { localStorage.setItem(LS_SAVED_FAMILIES, JSON.stringify(list.slice(0, 12))); } catch (e) { /* ignore */ }
}
function rememberFamily(name) {
  const list = readSavedFamilies().filter(n => n.toLowerCase() !== name.toLowerCase());
  list.unshift(name);
  writeSavedFamilies(list);
}
function forgetFamily(name) {
  writeSavedFamilies(readSavedFamilies().filter(n => n.toLowerCase() !== String(name).toLowerCase()));
}
function lastProfileKey(familyName) {
  return 'pinn.lastProfile.' + String(familyName || '').toLowerCase();
}

// Log in via the own server route (family + name + password, or main admin + password)
async function loginRequest(payload) {
  let res;
  try {
    res = await fetch('/api/pinn/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' });
  } catch (e) {
    const err = new Error(tk('common.noConnectionVpn'));
    err.offline = true;
    throw err;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) throw new Error(body.error || tk('login.failed'));
  pb.authStore.save(body.token, body.record);
}

function showLoginScreen() {
  return new Promise(resolve => {
    const screen = document.getElementById('loginScreen');
    const familyForm = document.getElementById('loginFamilyForm');
    const familySelectWrap = document.getElementById('loginFamilySelectWrap');
    const familySelect = document.getElementById('loginFamilySelect');
    const familyInput = document.getElementById('loginFamilyInput');
    const familySaveWrap = document.getElementById('loginFamilySaveWrap');
    const familySave = document.getElementById('loginFamilySave');
    const familyErr = document.getElementById('loginFamilyError');
    const familyBtn = document.getElementById('loginFamilySubmit');
    const form = document.getElementById('loginForm');
    const familyBar = document.getElementById('loginFamilyBar');
    const profileWrap = document.getElementById('loginProfileWrap');
    const select = document.getElementById('loginProfileSelect');
    const pw = document.getElementById('loginPassword');
    const err = document.getElementById('loginError');
    const btn = document.getElementById('loginSubmit');
    const subtitle = document.getElementById('loginSubtitle');
    const rememberWrap = document.getElementById('loginRememberWrap');
    const toggleCreateBtn = document.getElementById('loginToggleCreateBtn');
    const mainAdminBtn = document.getElementById('loginMainAdminBtn');
    const createSection = document.getElementById('loginCreateAccountSection');
    const headerLogo = document.querySelector('header img');
    if (headerLogo) document.getElementById('loginLogo').src = headerLogo.src;
    screen.classList.remove('hidden');

    let mode = 'family';        // 'family' | 'profile' | 'main'
    let familyName = '';        // the family as it is called on the server
    let creatingAccount = false;
    let setupOffen = false;     // new installation: show the hint about the initial setup
    const setupHint = document.getElementById('loginSetupHint');
    function renderSetupHint() {
      const show = setupOffen && (mode === 'family' || mode === 'main');
      setupHint.classList.toggle('hidden', !show);
      if (!show) return;
      document.getElementById('loginSetupHintText').textContent = pinnSetupText(mode === 'main' ? 'loginMain' : 'loginHint');
      const hb = document.getElementById('loginSetupHintBtn');
      hb.classList.toggle('hidden', mode !== 'family');
      hb.textContent = pinnSetupText('loginBtn');
      hb.onclick = () => { blurActive(); creatingAccount = false; form.classList.remove('hidden'); setMode('main'); };
    }
    fetch('/api/pinn/einrichtung/offen', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(o => { setupOffen = !!(o && o.offen); renderSetupHint(); })
      .catch(() => { /* offline or older hooks: no hint */ });

    function blurActive() { try { document.activeElement && document.activeElement.blur(); } catch (e) { /* ignore */ } }

    function renderFamilyChoice() {
      const saved = readSavedFamilies();
      let last = '';
      try { last = localStorage.getItem(LS_LAST_FAMILY) || ''; } catch (e) { /* ignore */ }
      if (saved.length) {
        familySelect.innerHTML = saved.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('') +
          `<option value="${FAMILY_OTHER}">${escapeHtml(tk('login.otherFamily'))}</option>`;
        const pick = saved.find(n => n.toLowerCase() === last.toLowerCase()) || saved[0];
        familySelect.value = pick;
        familySelectWrap.classList.remove('hidden');
      } else {
        familySelect.innerHTML = '';
        familySelectWrap.classList.add('hidden');
      }
      applyFamilyInputVisibility();
    }
    function typingNewFamily() {
      return familySelectWrap.classList.contains('hidden') || familySelect.value === FAMILY_OTHER;
    }
    function applyFamilyInputVisibility() {
      const typing = typingNewFamily();
      familyInput.classList.toggle('hidden', !typing);
      familySaveWrap.classList.toggle('hidden', !typing);
      document.getElementById('loginFamilyForgetBtn').classList.toggle('hidden', typing);
    }

    function setMode(next) {
      mode = next;
      err.classList.add('hidden');
      familyErr.classList.add('hidden');
      createSection.classList.add('hidden');
      familyForm.classList.toggle('hidden', mode !== 'family');
      form.classList.toggle('hidden', mode === 'family');
      familyBar.classList.toggle('hidden', mode !== 'profile');
      profileWrap.classList.toggle('hidden', mode !== 'profile');
      toggleCreateBtn.classList.toggle('hidden', mode !== 'profile');
      mainAdminBtn.textContent = mode === 'main' ? tk('login.backToFamilyLogin') : tk('login.asMainAdmin');
      if (mode === 'family') {
        creatingAccount = false;
        subtitle.textContent = tk('login.chooseFamily');
        renderFamilyChoice();
      } else if (mode === 'main') {
        creatingAccount = false;
        subtitle.textContent = tk('login.mainAdminLogin');
      } else {
        subtitle.textContent = creatingAccount ? tk('login.adminRequired') : tk('login.pleaseLogIn');
      }
      btn.textContent = creatingAccount ? tk('login.asAdmin') : tk('common.logIn');
      rememberWrap.classList.toggle('hidden', creatingAccount);
      toggleCreateBtn.textContent = creatingAccount ? tk('common.cancel') : tk('login.createNewAccount');
      pw.value = '';
      renderSetupHint();
    }

    familySelect.onchange = () => {
      applyFamilyInputVisibility();
      if (typingNewFamily()) { familyInput.value = ''; familyInput.focus(); }
    };
    document.getElementById('loginFamilyForgetBtn').onclick = () => {
      const name = familySelect.value;
      if (!name || name === FAMILY_OTHER) return;
      if (!confirm(tk('login.forgetFamilyConfirm', { name }))) return;
      forgetFamily(name);
      renderFamilyChoice();
    };

    familyForm.onsubmit = async (ev) => {
      ev.preventDefault();
      const typed = typingNewFamily();
      const name = (typed ? familyInput.value : familySelect.value).replace(/\s+/g, ' ').trim();
      if (!name) { familyInput.focus(); return; }
      familyErr.classList.add('hidden');
      familyBtn.disabled = true;
      familyBtn.textContent = tk('login.searching');
      try {
        let res;
        try {
          res = await fetch('/api/pinn/familie?name=' + encodeURIComponent(name), { cache: 'no-store' });
        } catch (e) {
          throw new Error(tk('common.noConnectionVpn'));
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 404 ? tk('login.familyUnknown', { name }) : (data.error || tk('login.familyLoadFailed')));
        familyName = data.name || name;
        const saved = readSavedFamilies();
        if (typed ? familySave.checked : true) {
          // adjust the saved entry to the spelling on the server if needed
          if (!typed) forgetFamily(name);
          rememberFamily(familyName);
        } else if (saved.some(n => n.toLowerCase() === familyName.toLowerCase())) {
          rememberFamily(familyName);
        }
        try { localStorage.setItem(LS_LAST_FAMILY, familyName); } catch (e) { /* ignore */ }
        const names = data.profiles || [];
        select.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
        let last = null;
        try { last = localStorage.getItem(lastProfileKey(familyName)); } catch (e) { /* ignore */ }
        if (last && names.includes(last)) select.value = last;
        document.getElementById('loginFamilyName').textContent = familyName;
        // the type of household comes from the server: family or flat share
        document.getElementById('loginFamilyLabel').textContent = data.wohnform === 'wg' ? tk('login.flatshare') : tk('login.family');
        blurActive();
        setMode('profile');
      } catch (e) {
        familyErr.textContent = e.message;
        familyErr.classList.remove('hidden');
      } finally {
        familyBtn.disabled = false;
        familyBtn.textContent = tk('common.next');
      }
    };

    document.getElementById('loginFamilyChangeBtn').onclick = () => { blurActive(); setMode('family'); };
    mainAdminBtn.onclick = () => {
      blurActive();
      creatingAccount = false;
      form.classList.remove('hidden');
      setMode(mode === 'main' ? 'family' : 'main');
    };
    toggleCreateBtn.onclick = () => {
      creatingAccount = !creatingAccount;
      setMode('profile');
    };

    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const username = mode === 'main' ? '' : select.value;
      const password = pw.value;
      if ((mode === 'profile' && !username) || !password) return;
      err.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = tk('login.loggingIn');
      try {
        await loginRequest(mode === 'main'
          ? { hauptadmin: true, password }
          : { familie: familyName, username, password });
        if (creatingAccount) {
          if (!isCurrentUserAdmin()) {
            pb.authStore.clear();
            err.textContent = tk('login.onlyAdminsCreate');
            err.classList.remove('hidden');
            return;
          }
          blurActive();
          pw.value = '';
          form.classList.add('hidden');
          toggleCreateBtn.classList.add('hidden');
          mainAdminBtn.classList.add('hidden');
          document.getElementById('loginCreateAdminName').textContent = tk('login.signedInAsAdmin', { name: username });
          document.getElementById('loginNewUsername').value = '';
          document.getElementById('loginNewPassword').value = '';
          document.getElementById('loginCreateError').classList.add('hidden');
          document.getElementById('loginCreateSuccess').classList.add('hidden');
          createSection.classList.remove('hidden');
          return;
        }
        const remember = document.getElementById('loginRemember').checked;
        try {
          if (remember) localStorage.removeItem(LS_SESSION_ONLY);
          else localStorage.setItem(LS_SESSION_ONLY, '1');
          sessionStorage.setItem(SS_SESSION_ALIVE, '1');
          if (mode === 'profile') localStorage.setItem(lastProfileKey(familyName), username);
        } catch (e) { /* ignore */ }
        lastLoginPassword = password;
        pw.value = '';
        blurActive();
        screen.classList.add('hidden');
        fitAuthScreensToViewport();
        resolve();
      } catch (e) {
        err.textContent = e.message;
        err.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = creatingAccount ? tk('login.asAdmin') : tk('common.logIn');
      }
    };

    document.getElementById('loginCreateSubmit').onclick = async () => {
      const cErr = document.getElementById('loginCreateError');
      const cOk = document.getElementById('loginCreateSuccess');
      const cBtn = document.getElementById('loginCreateSubmit');
      const username = document.getElementById('loginNewUsername').value.trim();
      const password = document.getElementById('loginNewPassword').value;
      const rolle = document.getElementById('loginNewRole').value;
      cErr.classList.add('hidden');
      cOk.classList.add('hidden');
      if (!username || !password) return;
      cBtn.disabled = true;
      cBtn.textContent = tk('login.creating');
      try {
        const res = await apiFetch('/api/pinn/users/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, rolle })
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          document.getElementById('loginNewUsername').value = '';
          document.getElementById('loginNewPassword').value = '';
          cOk.textContent = tk('login.accountCreated', { name: username });
          cOk.classList.remove('hidden');
        } else {
          cErr.textContent = body.error || tk('login.accountCreateFailed');
          cErr.classList.remove('hidden');
        }
      } catch (e) {
        cErr.textContent = tk('common.noConnectionVpn');
        cErr.classList.remove('hidden');
      } finally {
        cBtn.disabled = false;
        cBtn.textContent = tk('login.createAccount');
      }
    };

    document.getElementById('loginCreateDone').onclick = () => {
      pb.authStore.clear();
      blurActive();
      creatingAccount = false;
      mainAdminBtn.classList.remove('hidden');
      // reload the profile list so the new account can be chosen right away
      familyForm.classList.remove('hidden');
      setMode('family');
      if (familyName) {
        const saved = readSavedFamilies();
        if (saved.includes(familyName)) {
          familySelect.value = familyName;
        } else {
          if (saved.length) familySelect.value = FAMILY_OTHER;
          familyInput.value = familyName;
          familySave.checked = false;
        }
        applyFamilyInputVisibility();
        familyForm.requestSubmit ? familyForm.requestSubmit() : familyForm.onsubmit(new Event('submit'));
      }
    };

    setMode('family');
  });
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('anmeldemaske');
