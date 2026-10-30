/* pinn. – Family dashboard: basics, roles and child lock (js/dashboard.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the dashboard configuration of this device (LS_DASHBOARD, readDashboardConfig, isDashboardDevice, isDashboardSession …), guest and child lock rules (GUEST_ and CHILD_ lists, isCurrentUserGuest, childLockActive, childLockTaskVisible, isViewAllowed, the delete and edit guards incl. the stylesheet), wrapEditorsForChildLock (runs at DOMContentLoaded, after all files in js/ – it wraps the six edit dialogs), firstAllowedView, roleLabel, canBeDashboardDevice, dashboardTimeoutMinutes and returnToDashboard. */

/* ==========================================================
   Family dashboard (iPad): profile selection with optional PIN
   ----------------------------------------------------------
   An admin sets up a device (e.g. the iPad in the kitchen) under Account → "Familien-Dashboard auf
   diesem Gerät". For this the server hands out a device key (pb_hooks/dashboard.pb.js)
   that is only stored on this device.
   - When pinn. opens, the family's profile selection appears instead of the login.
   - Kids (members with a kids' page) land directly on their kids' page with their tasks;
     closing it leads back to the profile selection.
   - Everyone else opens their profile with one tap – or after entering their PIN, if they set
     one under Account (4 or 6 digits, like on the iPhone).
   - Guest accounts (role "gast") open without a PIN; finances, documents and settings are locked for them.
   - An opened profile only counts while the app is open; after the set time without
     interaction it automatically goes back to the profile selection.
   - A dashboard device gets no personal push notifications.
   ========================================================== */
const LS_DASHBOARD = 'pinn.dashboard';      // { key, id, name, familie, familyName, timeout }
const SS_DASH_ACTIVE = 'pinn.dashSession';  // profile was opened via the dashboard
const SS_DASH_KID = 'pinn.dashKid';         // kid profile: member whose kids' page is open
const DASH_DEFAULT_TIMEOUT = 5;             // minutes without interaction until the profile selection
const GUEST_BLOCKED_VIEWS = ['finanzen', 'dokumente', 'fahrzeuge', 'haus', 'einstellungen']; // always locked for guests
// menus an admin can additionally hide for guests (without the always locked ones)
const GUEST_SELECTABLE_VIEWS = ['uebersicht', 'pinnwand', 'termine', 'aufgaben', 'rezepte', 'vorrat', 'einkauf', 'familie'];
// child lock (per family member): these menus are locked, deleting is not possible
const CHILD_BLOCKED_VIEWS = ['finanzen', 'dokumente', 'fahrzeuge', 'haus'];
// Most recently built overview: was the calendar hidden in it for the guest? (null = not built yet)
let lastOverviewCalendarHidden = null;

function readDashboardConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_DASHBOARD) || 'null');
    return (c && typeof c.key === 'string' && c.key.length >= 20) ? c : null;
  } catch (e) { return null; }
}
function writeDashboardConfig(cfg) {
  try { localStorage.setItem(LS_DASHBOARD, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
}
function clearDashboardConfig() {
  try { localStorage.removeItem(LS_DASHBOARD); } catch (e) { /* ignore */ }
}
function ssGet(key) {
  try { return sessionStorage.getItem(key); } catch (e) { return null; }
}
function ssSet(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch (e) { /* ignore */ }
}
function isDashboardDevice() { return !!readDashboardConfig(); }
function isDashboardSession() { return isDashboardDevice() && ssGet(SS_DASH_ACTIVE) === '1'; }
function dashboardKidMemberId() { return isDashboardSession() ? (ssGet(SS_DASH_KID) || '') : ''; }
function isDashboardKidSession() { return !!dashboardKidMemberId(); }
function isCurrentUserGuest() {
  const u = currentUser();
  return !!(u && u.rolle === 'gast');
}
// Child lock active for the logged-in profile? (never for admins and guests)
function childLockActive() {
  try {
    const u = currentUser();
    if (!u || u.rolle === 'gast' || isCurrentUserAdmin()) return false;
    const m = currentMember();
    return !!(m && m.childLock);
  } catch (e) { return false; }
}
// Child lock: the profile only sees tasks assigned to it (or to "Alle")
function childLockTaskVisible(a) {
  if (!a || !childLockActive()) return true;
  const me = currentMember();
  if (!me) return false;
  return getAssignedMembersForEvent({ description: a.notes != null ? a.notes : a.description }).some(m => m.id === me.id);
}
let childLockTasksState = null; // most recently applied state (to rebuild on a change)
function isViewAllowed(view) {
  if (view === 'haushalt') view = 'aufgaben'; // household is part of "Aufgaben"
  if (view === 'konto') return true;
  if (CHILD_BLOCKED_VIEWS.includes(view) && childLockActive()) return false;
  if (!isCurrentUserGuest()) return true;
  return !GUEST_BLOCKED_VIEWS.includes(view) && !guestHiddenViews.includes(view);
}
// Child lock: intercept deleting (buttons and delete confirmations)
const CHILD_LOCK_DELETE_BASE = [
  '[id^="delete"]', '[id$="DeleteBtn"]', '#fzdDelete', '#fzlDelete', '#fzvDelete',
  '.del-meal', '.del-planned-meal', '.del-task', '.del-settings-member', '.rule-delete', '.kid-edit-del',
  '.ma-del-family', '.ma-del-user', '.pw-opt-del', '.pw-msg-del', '.ls-tpl-del', '.doc-tile-del',
  '[data-action="delete"]', '[data-pw-act="delete"]', '[data-doc-del]', '[data-deltpl]',
];
// Buttons that are only recognisable by their (translated) aria-label: "Delete", "Remove", "Delete …", "… löschen"
let childLockDeleteSel = '';
function childLockDeleteSelector() {
  if (childLockDeleteSel) return childLockDeleteSel;
  const q = s => '"' + String(s).replace(/["\\]/g, '\\$&') + '"';
  const out = CHILD_LOCK_DELETE_BASE.slice();
  // Labels that end in "delete"/"remove" but do not delete anything (clear a selection, hide a suggestion)
  const keep = [tk('meal.clear'), tk('shop.removeFromSuggestions')].map(x => ':not([aria-label=' + q(x) + '])').join('');
  [tk('common.delete'), tk('common.remove')].forEach(w => {
    out.push('[aria-label=' + q(w) + ']', '[aria-label^=' + q(w + ' ') + ']' + keep, '[aria-label$=' + q(' ' + w.toLowerCase()) + ']' + keep);
  });
  childLockDeleteSel = out.join(', ');
  return childLockDeleteSel;
}
let childLockToastTimer = null;
function childLockNotice() {
  let el = document.getElementById('childLockToast');
  if (!el) { el = document.createElement('div'); el.id = 'childLockToast'; document.body.appendChild(el); }
  el.textContent = tk('dashboard.childLockDeletingNot');
  el.classList.add('show');
  clearTimeout(childLockToastTimer);
  childLockToastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
document.addEventListener('click', (e) => {
  if (!childLockActive()) return;
  const t = e.target && e.target.closest ? e.target.closest(childLockDeleteSelector()) : null;
  if (!t || t.id === 'pinPadDelete') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  childLockNotice();
}, true);
(function wrapConfirmForChildLock() {
  const nativeConfirm = window.confirm.bind(window);
  window.confirm = function (msg) {
    if (childLockActive() && /lösch|entfern/i.test(String(msg || ''))) { childLockNotice(); return false; }
    return nativeConfirm(msg);
  };
})();
// Child lock: nothing can be added or edited – the buttons are hidden and have no function.
// Ticking off (tasks, lists, kids' page), viewing, favourites, way home and SOS stay possible.
const CHILD_LOCK_EDIT_SELECTOR = [
  // calendar & family
  '#openAddEventModalBtn', '#eventDetailEditBtn', '#memberKidEdit', '#kidRoutineApply', '#kidRoutineDefaults',
  '.kid-add-task',
  // meals & recipes
  '#addMealOverviewBtn', '.add-meal-btn', '#dayAddMealBtn', '.meal-cooked-btn', '#openRecipeSettingsBtn', '#openRecipeModalBtn',
  '#recipeDetailPlanBtn', '#recipeDetailEditBtn', '#recipeDetailAdoptBtn', '.edit-recipe', '.cat-editor-add-btn',
  // tasks & household
  '#openTaskModalBtn', '.edit-task', '#openSmartHomeBtn', '#openHouseholdSettingsBtn', '#openRoomModalBtn',
  '.edit-room-btn', '.edit-schedule-btn', '.add-schedule-btn', '.edit-bin-btn', '.add-bin-btn',
  // pin board
  '#pinboardArrangeBtn', '#openPinboardEditorBtn', '#pinboardQuick', '#pinboardReplyWrap', '.pw-react', '.pw-add-item',
  '[data-pw-act="edit"]', '[data-pw-act="pin"]', '[data-pw-act="archive"]', '[data-pw-act="unarchive"]', '[data-pw-act="cleanup"]',
  // lists & shopping
  '#openShoppingPlanBtn', '#openNewShoppingListBtn', '#openShoppingMoveBtn', '#editShoppingListBtn', '#clearDoneShoppingItemsBtn',
  '#finishShoppingPlanBtn', '.shop-qty-btn', '#shoppingAddBar', '#shoppingAddInput', '#shoppingAddBtn', '#listsNewBtn', '#listsEditBtn',
  'div:has(> div > #listsAddInput)', '#listsAddInput', '#listsAddBtn',
  // pantry
  '#openPantrySettingsBtn', '#openPantryItemBtn', '#openPantryScanBtn', '.pantry-step', '.pantry-add-btn', '.pcook-act', '#pantryBestBeforeClear', '.pantry-bc-rm',
  // family: places, devices, emergency pass
  '#famSetupBtn', '[data-famact="edit"]', '[data-famact="addplace"]', '[data-famact="address"]', '[data-famact="adddevice"]',
  '[data-famact="savedevice"]', '[data-famact="saveplace"]', '[data-famact="savepass"]', '[data-famact="clearpass"]',
  '[data-famact="newuid"]', '[data-famact="placehere"]', '[data-famact="placedev"]', '[data-famact="placesearch"]',
  '[data-famadd]', '[data-famrm]',
  // saving in all edit dialogs (they can at most still be viewed)
  '#saveAddEvent', '#saveAppleCalendar', '#saveAppleCredsBtn', '#saveContractBtn', '#saveContractCategoryBtn', '#saveDocBtn',
  '#saveDocCategoryBtn', '#saveExpenseBtn', '#saveFinAllowanceBtn', '#saveFinDepotBtn', '#saveFinGoalBtn', '#saveFinImportBtn',
  '#saveFinPocketBtn', '#saveFinScopeBtn', '#saveFinanceSettingsBtn', '#saveGuestModal', '#saveMeal', '#saveMember',
  '#savePantryItemBtn', '#savePantrySettingsBtn', '#savePinboardNoteBtn', '#saveRecipeBtn', '#saveRoom', '#saveRoomSchedule',
  '#saveShoppingListBtn', '#saveShoppingStammBtn', '#saveSmartDevice', '#saveTask', '#saveTrashBin', '#settingsSaveLastName',
  '#ccSaveBtn', '#checkoutSaveBtn', '#dashBgSaveBtn', '#finSaveAllBtn', '#finSaveDepositBtn', '#finSaveRateBtn',
  '#finSaveUnassigned', '#finSaveWithdrawBtn', '#fzaSave', '#fzdSave', '#fzlSave', '#fzvSave', '#kasseEditSaveBtn',
  '#kasseSettleSaveBtn', '#lsItemSaveBtn', '#lsListSaveBtn', '#pinnCalGClientSave', '#pinnCalSaveBtn', '#planDoneSaveBtn',
  '#addRoomScheduleCategoryBtn', '#addSmartActionBtn', '#addSmartDeviceBtn', '#addContractCategoryBtn', '#addDocCategoryBtn',
];
// simple selectors (without :has) to intercept clicks and input
const CHILD_LOCK_EDIT_CLICK_SELECTOR = CHILD_LOCK_EDIT_SELECTOR.filter(sel => !sel.includes(':has(')).join(', ');
(function injectChildLockEditCss() {
  const st = document.createElement('style');
  st.id = 'childLockEditCss';
  // every rule on its own, so an unsupported selector (:has) does not invalidate the others
  st.textContent = CHILD_LOCK_EDIT_SELECTOR.map(sel => `body.child-lock ${sel} { display: none !important; }`).join('\n');
  document.head.appendChild(st);
})();
function childLockEditNotice() {
  let el = document.getElementById('childLockToast');
  if (!el) { el = document.createElement('div'); el.id = 'childLockToast'; document.body.appendChild(el); }
  el.textContent = tk('dashboard.childLockAddingEditing');
  el.classList.add('show');
  clearTimeout(childLockToastTimer);
  childLockToastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function childLockEditBlocked(target) {
  if (!target || !target.closest || !childLockActive()) return false;
  if (target.closest(CHILD_LOCK_EDIT_CLICK_SELECTOR)) return true;
  return !!target.closest('#settingsView .set-body'); // settings: view only
}
['click', 'pointerdown', 'change', 'input'].forEach(type => {
  document.addEventListener(type, (e) => {
    if (!childLockEditBlocked(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (type === 'click') childLockEditNotice();
  }, true);
});
document.addEventListener('keydown', (e) => {
  if (!childLockEditBlocked(e.target)) return;
  if (e.key === 'Tab' || e.key === 'Escape') return;
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);
document.addEventListener('focusin', (e) => {
  if (childLockEditBlocked(e.target) && e.target.blur) e.target.blur();
}, true);
// Do not even open edit dialogs that could open without a visible button.
// Only runs once all scripts (including the parts in js/) have loaded – otherwise the functions
// that live in a js/ file would not exist yet when securing them and the dialog would stay unprotected.
// Important: never pass the functions on directly while loading (e.g. addEventListener('click', openAddEventModal)),
// but always call them on click only: () => openAddEventModal().
window.addEventListener('DOMContentLoaded', function wrapEditorsForChildLock() {
  const guard = (fn) => function (...args) {
    if (childLockActive()) { childLockEditNotice(); return; }
    return fn.apply(this, args);
  };
  try { openTaskModal = guard(openTaskModal); } catch (e) { console.warn('Child lock: openTaskModal missing', e); }
  try { openEditTaskModal = guard(openEditTaskModal); } catch (e) { console.warn('Child lock: openEditTaskModal missing', e); }
  try { openAddEventModal = guard(openAddEventModal); } catch (e) { console.warn('Child lock: openAddEventModal missing', e); }
  try { openMealModal = guard(openMealModal); } catch (e) { console.warn('Child lock: openMealModal missing', e); }
  try { openPinboardEditor = guard(openPinboardEditor); } catch (e) { console.warn('Child lock: openPinboardEditor missing', e); }
  try { openKidRoutineEditor = guard(openKidRoutineEditor); } catch (e) { console.warn('Child lock: openKidRoutineEditor missing', e); }
});
// If the calendar is hidden for guests, it is also missing in the overview (only meals and tasks there)
function isCalendarHiddenForGuest() {
  return isCurrentUserGuest() && !isViewAllowed('termine');
}
// First allowed view (for guests possibly not the overview; if everything is hidden: the account)
function firstAllowedView() {
  return ['uebersicht', ...GUEST_SELECTABLE_VIEWS].find(isViewAllowed) || 'konto';
}
function roleLabel(rolle) {
  return tk(rolle === 'admin' ? 'common.admin' : rolle === 'gast' ? 'dashboard.guest' : 'common.member');
}
// iPad (also in Safari's desktop mode) and large screens - not the phone
function canBeDashboardDevice() {
  return deviceLabel() === 'iPad' || !isMobile();
}
function dashboardTimeoutMinutes() {
  const c = readDashboardConfig();
  if (!c) return 0;
  const n = Number(c.timeout);
  return Number.isFinite(n) && n >= 0 ? n : DASH_DEFAULT_TIMEOUT;
}
// Back to the profile selection. Changes not yet sent stay saved on the device and
// are sent with the next opened profile (same family).
function returnToDashboard() {
  ssSet(SS_DASH_ACTIVE, null);
  ssSet(SS_DASH_KID, null);
  pb.authStore.clear();
  location.reload();
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('dashboard');
