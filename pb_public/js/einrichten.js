/* pinn. – Setup assistant loader (js/einrichten.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the texts of the setup in four languages (PINN_SETUP_TEXTE, pinnSetupText) and loading and opening the assistant (loadPinnSetupScript, openPinnSetup). The assistant itself lives in pb_public/einrichtung.js and is only loaded when first opened. The notice about the open setup is in js/hauptadminseite.js. */

/* ==========================================================
   Setup (assistant for the main admin)
   ----------------------------------------------------------
   The assistant lives in pb_public/einrichtung.js and is only loaded when it is needed
   (own texts in German, English, French and Spanish). Server: pb_hooks/einrichtung.pb.js.
   - starts by itself after login as main admin as long as the setup is still open
     ("Später" holds until the app is closed)
   - reachable at any time via Main admin → ⚙︎ Einrichtung
   - on a new installation the login screen shows the way to the main admin login
   ========================================================== */
const PINN_SETUP_TEXTE = {
  de: {
    btn: '⚙︎ Einrichtung',
    offen: 'Die Einrichtung von pinn. ist noch nicht abgeschlossen. Ohne sie fehlen HTTPS, Push-Nachrichten und die App auf dem Home-Bildschirm.',
    fortsetzen: 'Einrichtung fortsetzen',
    neustart: 'Gespeicherte Einstellungen werden erst nach einem Neustart von pinn. wirksam.',
    neustartBtn: 'Jetzt übernehmen (kurzer Neustart)',
    neustartLaeuft: 'pinn. startet neu …',
    loginHint: 'Neu hier? Die Ersteinrichtung startet nach der Anmeldung als Hauptadmin.',
    loginBtn: 'Als Hauptadmin anmelden',
    loginMain: 'Beim ersten Mal lautet das Passwort „Admin“ – danach legst du ein eigenes fest und die Einrichtung startet.',
    laden: 'Die Einrichtung konnte nicht geladen werden (pb_public/einrichtung.js fehlt?).',
  },
  en: {
    btn: '⚙︎ Setup',
    offen: 'The setup of pinn. is not finished yet. Without it, HTTPS, push notifications and the home screen app are missing.',
    fortsetzen: 'Continue setup',
    neustart: 'Saved settings only take effect after pinn. restarts.',
    neustartBtn: 'Apply now (short restart)',
    neustartLaeuft: 'pinn. is restarting …',
    loginHint: 'New here? The initial setup starts after logging in as main admin.',
    loginBtn: 'Log in as main admin',
    loginMain: 'The first time, the password is “Admin” – then you set your own and the setup starts.',
    laden: 'The setup could not be loaded (pb_public/einrichtung.js missing?).',
  },
  fr: {
    btn: '⚙︎ Configuration',
    offen: 'La configuration de pinn. n\'est pas encore terminée. Sans elle, HTTPS, les notifications push et l\'app sur l\'écran d\'accueil manquent.',
    fortsetzen: 'Poursuivre la configuration',
    neustart: 'Les réglages enregistrés ne prennent effet qu\'après un redémarrage de pinn.',
    neustartBtn: 'Appliquer maintenant (court redémarrage)',
    neustartLaeuft: 'pinn. redémarre …',
    loginHint: 'Nouveau ? La configuration initiale démarre après la connexion en tant qu\'administrateur principal.',
    loginBtn: 'Se connecter en administrateur principal',
    loginMain: 'La première fois, le mot de passe est « Admin » – vous en définissez ensuite un vôtre et la configuration démarre.',
    laden: 'La configuration n\'a pas pu être chargée (pb_public/einrichtung.js manquant ?).',
  },
  es: {
    btn: '⚙︎ Configuración',
    offen: 'La configuración de pinn. aún no ha terminado. Sin ella faltan HTTPS, las notificaciones push y la app en la pantalla de inicio.',
    fortsetzen: 'Continuar la configuración',
    neustart: 'Los ajustes guardados solo se aplican tras reiniciar pinn.',
    neustartBtn: 'Aplicar ahora (reinicio breve)',
    neustartLaeuft: 'pinn. se está reiniciando …',
    loginHint: '¿Eres nuevo? La configuración inicial empieza al iniciar sesión como administrador principal.',
    loginBtn: 'Iniciar sesión como administrador principal',
    loginMain: 'La primera vez la contraseña es «Admin» – después eliges una propia y empieza la configuración.',
    laden: 'No se pudo cargar la configuración (¿falta pb_public/einrichtung.js?).',
  },
  it: {
    btn: '⚙︎ Configurazione',
    offen: 'La configurazione di pinn. non è ancora terminata. Senza di essa mancano HTTPS, le notifiche push e l’app nella schermata Home.',
    fortsetzen: 'Continua la configurazione',
    neustart: 'Le impostazioni salvate diventano attive solo dopo il riavvio di pinn.',
    neustartBtn: 'Applica ora (breve riavvio)',
    neustartLaeuft: 'pinn. si sta riavviando …',
    loginHint: 'Sei nuovo? La configurazione iniziale parte dopo l’accesso come amministratore principale.',
    loginBtn: 'Accedi come amministratore principale',
    loginMain: 'La prima volta la password è «Admin»: poi ne imposti una tua e parte la configurazione.',
    laden: 'Impossibile caricare la configurazione (manca pb_public/einrichtung.js?).',
  },
};
function pinnSetupText(key) {
  const l = (window.PINN_I18N && window.PINN_I18N.current) || 'en';
  const d = PINN_SETUP_TEXTE[l] || PINN_SETUP_TEXTE.en;
  return d[key] || PINN_SETUP_TEXTE.en[key] || key;
}
let pinnSetupLoading = null;
function loadPinnSetupScript() {
  if (window.PinnSetup) return Promise.resolve(window.PinnSetup);
  if (pinnSetupLoading) return pinnSetupLoading;
  pinnSetupLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'einrichtung.js?v=' + APP_VERSION;
    s.onload = () => (window.PinnSetup ? resolve(window.PinnSetup) : reject(new Error('PinnSetup fehlt')));
    s.onerror = () => { pinnSetupLoading = null; s.remove(); reject(new Error('einrichtung.js fehlt')); };
    document.head.appendChild(s);
  });
  return pinnSetupLoading;
}
async function openPinnSetup() {
  try {
    const ps = await loadPinnSetupScript();
    ps.open({ apiFetch, onClose: () => { refreshMainAdminSetupBanner(false); loadMainAdminFamilies(); } });
  } catch (e) {
    alert(pinnSetupText('laden'));
  }
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('einrichten');
