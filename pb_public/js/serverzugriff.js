/* pinn. – Server access with login (js/serverzugriff.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: apiFetch, which calls the own server routes with the login token and handles an expired or remotely ended login (authExpiredHandled), and applySessionOnlyRule for "Angemeldet bleiben". Almost every part of the app uses apiFetch, but only at runtime.
   Since 1.119.1 the German messages of the server (fields error, hinweis, message of a JSON answer) are shown in the
   app language: SERVER_MESSAGE_KEYS maps the known texts to text keys srv.* (pb_public/i18n); unknown texts stay. */

// Call own server routes with the login. If the login has expired, go back to the
// login screen (pending changes stay saved locally and are sent afterwards).
let authExpiredHandled = false;
// Known German server messages -> text key (the server keeps writing German, the app translates)
const SERVER_MESSAGE_KEYS = {
  "Anmeldung fehlgeschlagen. Bitte Profil und Passwort prüfen.": 'srv.loginFailed',
  "Das neue Passwort muss mindestens 8 Zeichen lang sein.": 'srv.newPasswordShort',
  "Profil nicht gefunden.": 'srv.profileNotFound',
  "Das Start-Passwort muss mindestens 8 Zeichen lang sein.": 'srv.startPasswordShort',
  "Keine Kalender gefunden.": 'srv.noCalendars',
  "Keine Kalender ausgewählt.": 'srv.noCalendarsSelected',
  "Nicht verbunden": 'srv.notConnected',
  "Bitte ein Fälligkeitsdatum angeben.": 'srv.dueDateNeeded',
  "Bitte zuerst ein Bild auswählen.": 'srv.pickImageFirst',
  "Bitte einen gültigen Betrag eingeben.": 'srv.validAmount',
  "Gerät nicht gefunden.": 'srv.deviceNotFound',
  "Bitte einen Namen eingeben.": 'srv.enterName',
  "Das Fehlerprotokoll sehen nur Admins.": 'srv.logAdminsOnly',
  "Die Geräte dieses Profils kannst du nicht verwalten.": 'srv.cantManageDevices',
  "Sperren heben nur Admins auf.": 'srv.unlockAdminsOnly',
  "Nur für Admins.": 'srv.adminsOnly',
  "Die Zusatzdaten sind kein gültiges JSON.": 'srv.badJson',
  "Für Gastkonten nicht verfügbar.": 'srv.notForGuests',
  "Der Ordner „wartung“ ist nicht eingebunden – bitte einmal sudo sh pinn-setup.sh ausführen.": 'srv.maintNotMounted',
  "Der Ordner „wartung“ ist schreibgeschützt.": 'srv.maintReadOnly',
  "Es läuft gerade schon eine Sicherung oder ein Update.": 'srv.maintBusy',
  "Der Container „wartung“ läuft nicht – bitte einmal sudo sh pinn-setup.sh ausführen.": 'srv.maintNotRunning',
  "Der Container „wartung“ hat keinen Zugriff auf Docker.": 'srv.maintNoDocker',
  "Diese Sicherung gibt es nicht (mehr).": 'srv.backupGone',
  "GitHub ist gerade nicht erreichbar.": 'srv.githubDown',
  "Es gibt zurzeit keine Vorabversion.": 'srv.noBeta',
  "Diese Vorabversion ist schon als fertige Version erschienen – bitte das normale Update nutzen.": 'srv.betaReleased',
  "Die Vorabversion ist nicht neuer als die installierte Version.": 'srv.betaNotNewer',
  "Es gibt keine neuere Version.": 'srv.noNewerVersion',
  "Das geht nur bei Admins einer Familie.": 'srv.familyAdminsOnly',
  "Erfahrungswerte gerade nicht abrufbar.": 'srv.typicalUnavailable',
  "Vorhersage gerade nicht abrufbar.": 'srv.forecastUnavailable',
  "Dieses Gerät wurde in pinn. abgemeldet. Bitte melde dich erneut an.": 'srv.deviceSignedOut',
  "Nur Admins sehen Sicherungen und Updates.": 'srv.backupsAdminsOnly',
  "Nur Admins können Sicherungen anlegen.": 'srv.backupCreateAdminsOnly',
  "Wiederherstellen betrifft alle Familien auf diesem Server – das kann nur der Hauptadmin oder ein von ihm berechtigter Admin.": 'srv.restoreMainAdmin',
  "Updates betreffen alle Familien auf diesem Server – das kann nur der Hauptadmin oder ein von ihm berechtigter Admin.": 'srv.updateMainAdmin',
  "Nur der Hauptadmin kann dieses Recht vergeben.": 'srv.rightMainAdmin',
};
function serverMessageText(s) {
  if (typeof s !== 'string' || !window.PINN_I18N || PINN_I18N.current === 'de') return s;
  const key = SERVER_MESSAGE_KEYS[s.trim()];
  return key && PINN_I18N.has(key) ? tk(key) : s;
}
// Translates the message fields of a JSON answer (the object itself is changed and returned)
function localizeServerAnswer(data) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const f of ['error', 'hinweis', 'message']) if (typeof data[f] === 'string') data[f] = serverMessageText(data[f]);
  }
  return data;
}
async function apiFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (pb.authStore.token) headers['Authorization'] = pb.authStore.token;
  const res = await fetch(url, { ...opts, headers });
  try {
    const json = res.json.bind(res);
    res.json = async () => localizeServerAnswer(await json());
  } catch (e) { /* read-only Response: messages stay German */ }
  if (res.status === 401 && res.headers.get('X-Pinn-Abgemeldet') === '1') { handleRemoteLogout(); return res; }
  if (res.status === 401 && !authExpiredHandled) {
    authExpiredHandled = true;
    if (isDashboardDevice()) { returnToDashboard(); return res; } // dashboard: simply back to the profile selection
    pb.authStore.clear();
    alert(tk('app.sessionHasExpiredPlease'));
    location.reload();
  }
  return res;
}

// "Angemeldet bleiben" not set: the login only counts while the app is open.
function applySessionOnlyRule() {
  try {
    if (localStorage.getItem(LS_SESSION_ONLY) === '1' && !sessionStorage.getItem(SS_SESSION_ALIVE)) {
      pb.authStore.clear();
      localStorage.removeItem(LS_SESSION_ONLY);
    }
  } catch (e) { /* storage not available */ }
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('serverzugriff');
