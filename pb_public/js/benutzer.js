/* pinn. – Logged-in user and family profiles (js/benutzer.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the logged-in profile and its role (PINN_USERS, LS_SESSION_ONLY, SS_SESSION_ALIVE, lastLoginPassword, currentUser, isCurrentUserAdmin, isCurrentUserMainAdmin), postJson for own server routes, and the link between profiles and family members (familyProfiles, loadFamilyProfiles, profileForMember, unlinkedProfiles, currentMember). */

/* ==========================================================
   Login (profiles from the "benutzer" collection, see pb_hooks/benutzer.pb.js)
   ========================================================== */
const PINN_USERS = 'benutzer';
const LS_SESSION_ONLY = 'pinn.sessionOnly';
const SS_SESSION_ALIVE = 'pinn.sessionAlive';
let lastLoginPassword = null; // only in memory, for the forced password change right after logging in

function currentUser() {
  return pb.authStore.model || pb.authStore.record || null;
}
// admin of the own family (several per family possible)
function isCurrentUserAdmin() {
  const u = currentUser();
  return !!(u && u.rolle === 'admin' && u.familie);
}
// main admin (manages the families, belongs to none itself)
function isCurrentUserMainAdmin() {
  const u = currentUser();
  return !!(u && u.rolle === 'hauptadmin');
}

// Send JSON to an own server route; throws an understandable message on errors.
async function postJson(url, payload) {
  const res = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error || body.message || 'Aktion fehlgeschlagen.');
  return body;
}

/* ==========================================================
   Profiles <-> family members
   Every family member has exactly one profile (field "mitglied" in the profile = ID of the member).
   ========================================================== */
let familyProfiles = []; // all profiles, most recently loaded from the server
async function loadFamilyProfiles() {
  try {
    familyProfiles = await pb.collection(PINN_USERS).getFullList({ sort: 'username' });
    try { localStorage.setItem('pinn.profileCache', JSON.stringify({ familie: (currentUser() && currentUser().familie) || '', list: familyProfiles })); } catch (e2) { /* ignore */ }
    try { if (familyRecordId) { applyRoleRestrictions(); renderBottomTabBar(); } } catch (e4) { /* app not fully built yet */ }
    return true;
  } catch (e) {
    // offline: keep the last state or take the cached one
    if (!familyProfiles.length) {
      try {
        const c = JSON.parse(localStorage.getItem('pinn.profileCache') || 'null');
        if (c && c.familie === ((currentUser() && currentUser().familie) || '') && Array.isArray(c.list)) familyProfiles = c.list;
      } catch (e3) { /* ignore */ }
    }
    return false;
  }
}
function profileForMember(memberId) {
  return memberId ? (familyProfiles.find(p => p.mitglied === memberId) || null) : null;
}
// profiles that are not (yet) linked to an existing family member
function unlinkedProfiles() {
  return familyProfiles.filter(p => p.rolle !== 'gast' && (!p.mitglied || !memberById(p.mitglied)));
}
// family member of the logged-in profile (or null)
function currentMember() {
  const u = currentUser();
  if (!u) return null;
  const p = familyProfiles.find(x => x.id === u.id);
  const mid = (p && p.mitglied) || u.mitglied;
  return mid ? (memberById(mid) || null) : null;
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('benutzer');
