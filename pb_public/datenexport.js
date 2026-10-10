/* pinn. – Datenexport (pb_public/datenexport.js)
   ----------------------------------------------------------------------------
   Komplette Familie (bzw. WG) als ZIP: alle Daten als JSON + alle Dokumente, Belege und Bilder.
   Gedacht für den Umzug auf ein anderes NAS, als eigene Sicherung oder zum Weiterverarbeiten.

   Wird von index.html nur bei Bedarf nachgeladen (Einstellungen → Daten → „Familie exportieren“,
   Hauptadmin → Familien). Aufruf:  PinnExport.open({ apiFetch, familie?, onClose? })
     apiFetch – fetch mit Anmeldung (wie beim Einrichtungs-Assistenten)
     familie  – nur für den Hauptadmin: vorausgewählte Familie

   Das ZIP entsteht hier im Browser – der Server liefert nur Sammlung für Sammlung und Datei für Datei
   (pb_hooks/export.pb.js + pinn-export.js). Dateien werden unkomprimiert übernommen (PDFs und Fotos
   sind schon komprimiert), die JSON-Daten werden – wo der Browser es kann – komprimiert.
   Eigene Texte in Deutsch, Englisch, Französisch und Spanisch (data-no-i18n / data-no-term).

   Aufbau des ZIP:
     pinn-export.json                 Beschreibung: Format, Version, Familie, Inhalt, Dateiliste
     LIESMICH.txt / README.txt        kurze Erklärung
     daten/<sammlung>.json            Datensätze je Sammlung (wie in PocketBase, ohne Passwörter)
     dateien/<sammlung>/<id>/<datei>  Dokumente, Belege, Rezept- und Pinnwand-Bilder
     export-fehler.txt                nur falls Dateien nicht lesbar waren */
(function () {
  'use strict';
  if (window.PinnExport) return;

  var LANGS = ['de', 'en', 'fr', 'es'];
  var T = {};
  T.de = {
    F: 'Familie', FW: 'WG', Fd: 'der Familie', FWd: 'der WG',
    titel: '{F} exportieren',
    intro: 'Alle Daten {Fd} als ZIP-Datei – mit Dokumenten, Belegen und Bildern. Zum Beispiel für den Umzug auf ein anderes NAS oder als eigene Sicherung.',
    lade: 'Inhalt wird ermittelt …', fehler: 'Das hat nicht geklappt.',
    fehlerNetz: 'Keine Verbindung zu pinn. – bitte prüfen, ob du im Heimnetz bzw. im VPN bist.',
    serverFehlt: 'Auf dem Server fehlen noch export.pb.js und pinn-export.js (pb_hooks).',
    familieWaehlen: 'Welche {F}?', inhalt: 'Das kommt ins ZIP', eintraege: '{0} Einträge', dateienN: '{0} Dateien',
    dokumente: 'Dateien gesamt', groesse: 'Größe (ungefähr)',
    nichtDrin: 'Nicht enthalten',
    nichtDrinText: 'Passwörter, PINs, Zugangsdaten zu iCloud, Google und Home Assistant, angemeldete Geräte und Push-Abos. Auf einem anderen NAS meldet ihr euch einfach neu an. Standortverläufe aus Traccar sind ebenfalls nicht dabei.',
    privat: 'Nicht enthalten, weil privat: {0} Kasse(n) ohne dich als Mitglied und {1} „Nur für mich“-Kalender anderer Profile. Einen vollständigen Export – etwa für den Umzug – erstellt der Hauptadmin.',
    voll: 'Vollständiger Export – auch private Kassen und „Nur für mich“-Kalender aller Profile sind enthalten.',
    sicherheit: 'Das ZIP enthält Finanzen, Dokumente und Notfallpässe unverschlüsselt. Bitte sicher aufbewahren und nicht per E-Mail verschicken.',
    gross: 'Das sind etwa {0}. Auf dem Handy kann das länger dauern – am besten am Computer exportieren und pinn. währenddessen geöffnet lassen.',
    starten: 'ZIP erstellen', abbrechen: 'Abbrechen', schliessen: 'Schließen', nochmal: 'Erneut versuchen',
    schrittDaten: 'Daten: {0}', schrittDatei: 'Datei {0} von {1}', packe: 'ZIP wird zusammengestellt …',
    offenLassen: 'Bitte pinn. geöffnet lassen, bis der Export fertig ist.',
    fertig: 'Export fertig ✓', fertigText: '{0} Einträge und {1} Dateien · {2}',
    speichern: 'ZIP speichern', teilen: 'Teilen oder in „Dateien“ sichern',
    speichernTipp: 'iPhone/iPad: „Teilen“ → „In Dateien sichern“. Computer: „ZIP speichern“ legt die Datei in den Download-Ordner.',
    fehlende: '{0} Datei(en) konnten nicht gelesen werden – sie stehen im ZIP in export-fehler.txt.',
    abgebrochen: 'Export abgebrochen.', zuGross: 'Der Export ist größer als 4 GB – das kann ein ZIP ohne Erweiterung nicht aufnehmen.',
    keinAdmin: 'Den Export können nur Admins erstellen.',
    S: {
      familien: '{F}', benutzer: 'Profile', familien_daten: 'Kalender, Listen, Rezepte, Mitglieder & Einstellungen',
      rezept_bilder: 'Rezeptbilder', oeffentliche_rezepte: 'Geteilte Rezepte', aufgaben: 'Aufgaben',
      haushalt_verlauf: 'Haushalt-Verlauf', kassen: 'Kassen, Depots & Verträge', ausgaben: 'Buchungen',
      finanz_dokumente: 'Vertragsdokumente', dokumente: 'Dokumente', pinnwand_bilder: 'Pinnwand-Bilder',
      kalender_eigene: 'Eigene Kalender', kalender_termine: 'Termine', muellkalender: 'Müllkalender',
      ortung: 'Orte & Ortung', zuhause: 'Zuhause', smarthome_zugaenge: 'Smarthome',
      dashboard_hintergruende: 'Dashboard', apple_zugaenge: 'iCloud', google_zugaenge: 'Google',
    },
    liesmich: 'LIESMICH.txt',
    readme: [
      'pinn. – Datenexport',
      '',
      '{F}: {0}',
      'Erstellt: {1} von {2} (pinn. {3})',
      '',
      'Inhalt:',
      '  pinn-export.json  Beschreibung des Exports (Format, Inhalt, Dateiliste)',
      '  daten/            alle Datensätze je Sammlung als JSON (wie in PocketBase)',
      '  dateien/          Dokumente, Belege und Bilder: dateien/<Sammlung>/<Datensatz-ID>/<Datei>',
      '',
      'Nicht enthalten: Passwörter, PINs, Zugangsdaten (iCloud, Google, Home Assistant),',
      'angemeldete Geräte, Push-Abos und Standortverläufe aus Traccar.',
      '',
      'Achtung: Diese Datei enthält Finanzen, Dokumente und Notfallpässe unverschlüsselt.',
      'Bitte sicher aufbewahren.',
    ],
  };
  T.en = {
    F: 'family', FW: 'flatshare', Fd: 'of your family', FWd: 'of your flatshare',
    titel: 'Export {F}',
    intro: 'All data {Fd} as a ZIP file – including documents, receipts and pictures. For example to move to another NAS or as your own backup.',
    lade: 'Checking contents …', fehler: 'That didn\u2019t work.',
    fehlerNetz: 'No connection to pinn. – please check that you are on your home network or VPN.',
    serverFehlt: 'export.pb.js and pinn-export.js (pb_hooks) are still missing on the server.',
    familieWaehlen: 'Which {F}?', inhalt: 'What goes into the ZIP', eintraege: '{0} entries', dateienN: '{0} files',
    dokumente: 'Files in total', groesse: 'Size (approx.)',
    nichtDrin: 'Not included',
    nichtDrinText: 'Passwords, PINs, access data for iCloud, Google and Home Assistant, signed-in devices and push subscriptions. On another NAS you simply sign in again. Location history from Traccar is not included either.',
    privat: 'Not included because private: {0} fund(s) you are not a member of and {1} \u201cJust for me\u201d calendar(s) of other profiles. A complete export – e.g. for moving – is created by the main admin.',
    voll: 'Complete export – private funds and \u201cJust for me\u201d calendars of all profiles are included.',
    sicherheit: 'The ZIP contains finances, documents and emergency cards unencrypted. Please keep it safe and don\u2019t send it by email.',
    gross: 'That is about {0}. On a phone this can take a while – better export on a computer and keep pinn. open meanwhile.',
    starten: 'Create ZIP', abbrechen: 'Cancel', schliessen: 'Close', nochmal: 'Try again',
    schrittDaten: 'Data: {0}', schrittDatei: 'File {0} of {1}', packe: 'Putting the ZIP together …',
    offenLassen: 'Please keep pinn. open until the export is finished.',
    fertig: 'Export finished ✓', fertigText: '{0} entries and {1} files · {2}',
    speichern: 'Save ZIP', teilen: 'Share or save to Files',
    speichernTipp: 'iPhone/iPad: \u201cShare\u201d → \u201cSave to Files\u201d. Computer: \u201cSave ZIP\u201d puts the file in your downloads folder.',
    fehlende: '{0} file(s) could not be read – they are listed in export-fehler.txt inside the ZIP.',
    abgebrochen: 'Export cancelled.', zuGross: 'The export is larger than 4 GB – a plain ZIP cannot hold that.',
    keinAdmin: 'Only admins can create the export.',
    S: {
      familien: '{F}', benutzer: 'Profiles', familien_daten: 'Calendar, lists, recipes, members & settings',
      rezept_bilder: 'Recipe pictures', oeffentliche_rezepte: 'Shared recipes', aufgaben: 'Tasks',
      haushalt_verlauf: 'Household history', kassen: 'Funds, depots & contracts', ausgaben: 'Transactions',
      finanz_dokumente: 'Contract documents', dokumente: 'Documents', pinnwand_bilder: 'Board pictures',
      kalender_eigene: 'Own calendars', kalender_termine: 'Events', muellkalender: 'Waste calendar',
      ortung: 'Places & location', zuhause: 'Home', smarthome_zugaenge: 'Smart home',
      dashboard_hintergruende: 'Dashboard', apple_zugaenge: 'iCloud', google_zugaenge: 'Google',
    },
    liesmich: 'README.txt',
    readme: [
      'pinn. – data export',
      '',
      '{F}: {0}',
      'Created: {1} by {2} (pinn. {3})',
      '',
      'Contents:',
      '  pinn-export.json  description of the export (format, contents, file list)',
      '  daten/            all records per collection as JSON (as stored in PocketBase)',
      '  dateien/          documents, receipts and pictures: dateien/<collection>/<record id>/<file>',
      '',
      'Not included: passwords, PINs, access data (iCloud, Google, Home Assistant),',
      'signed-in devices, push subscriptions and location history from Traccar.',
      '',
      'Caution: this file contains finances, documents and emergency cards unencrypted.',
      'Please keep it safe.',
    ],
  };
  T.fr = {
    F: 'famille', FW: 'colocation', Fd: 'de la famille', FWd: 'de la colocation',
    titel: 'Exporter la {F}',
    intro: 'Toutes les données {Fd} dans un fichier ZIP – avec documents, justificatifs et images. Par exemple pour déménager sur un autre NAS ou comme sauvegarde personnelle.',
    lade: 'Analyse du contenu …', fehler: 'Cela n\u2019a pas fonctionné.',
    fehlerNetz: 'Pas de connexion à pinn. – vérifie que tu es sur le réseau domestique ou le VPN.',
    serverFehlt: 'export.pb.js et pinn-export.js (pb_hooks) manquent encore sur le serveur.',
    familieWaehlen: 'Quelle {F} ?', inhalt: 'Contenu du ZIP', eintraege: '{0} entrées', dateienN: '{0} fichiers',
    dokumente: 'Fichiers au total', groesse: 'Taille (env.)',
    nichtDrin: 'Non inclus',
    nichtDrinText: 'Mots de passe, codes PIN, accès iCloud, Google et Home Assistant, appareils connectés et abonnements push. Sur un autre NAS, il suffit de se reconnecter. L\u2019historique de localisation de Traccar n\u2019est pas inclus non plus.',
    privat: 'Non inclus car privé : {0} caisse(s) dont tu n\u2019es pas membre et {1} calendrier(s) « Pour moi » d\u2019autres profils. Un export complet – p. ex. pour un déménagement – est créé par l\u2019admin principal.',
    voll: 'Export complet – les caisses privées et les calendriers « Pour moi » de tous les profils sont inclus.',
    sicherheit: 'Le ZIP contient finances, documents et fiches d\u2019urgence en clair. Conserve-le en lieu sûr et ne l\u2019envoie pas par e-mail.',
    gross: 'Cela représente environ {0}. Sur un téléphone, cela peut prendre du temps – mieux vaut exporter depuis un ordinateur en laissant pinn. ouvert.',
    starten: 'Créer le ZIP', abbrechen: 'Annuler', schliessen: 'Fermer', nochmal: 'Réessayer',
    schrittDaten: 'Données : {0}', schrittDatei: 'Fichier {0} sur {1}', packe: 'Assemblage du ZIP …',
    offenLassen: 'Laisse pinn. ouvert jusqu\u2019à la fin de l\u2019export.',
    fertig: 'Export terminé ✓', fertigText: '{0} entrées et {1} fichiers · {2}',
    speichern: 'Enregistrer le ZIP', teilen: 'Partager ou enregistrer dans Fichiers',
    speichernTipp: 'iPhone/iPad : « Partager » → « Enregistrer dans Fichiers ». Ordinateur : « Enregistrer le ZIP » place le fichier dans les téléchargements.',
    fehlende: '{0} fichier(s) n\u2019ont pas pu être lus – ils sont listés dans export-fehler.txt dans le ZIP.',
    abgebrochen: 'Export annulé.', zuGross: 'L\u2019export dépasse 4 Go – un ZIP standard ne peut pas le contenir.',
    keinAdmin: 'Seuls les admins peuvent créer l\u2019export.',
    S: {
      familien: '{F}', benutzer: 'Profils', familien_daten: 'Calendrier, listes, recettes, membres et réglages',
      rezept_bilder: 'Images de recettes', oeffentliche_rezepte: 'Recettes partagées', aufgaben: 'Tâches',
      haushalt_verlauf: 'Historique du ménage', kassen: 'Caisses, dépôts et contrats', ausgaben: 'Opérations',
      finanz_dokumente: 'Documents de contrats', dokumente: 'Documents', pinnwand_bilder: 'Images du tableau',
      kalender_eigene: 'Calendriers personnels', kalender_termine: 'Rendez-vous', muellkalender: 'Calendrier des déchets',
      ortung: 'Lieux et localisation', zuhause: 'Domicile', smarthome_zugaenge: 'Maison connectée',
      dashboard_hintergruende: 'Tableau de bord', apple_zugaenge: 'iCloud', google_zugaenge: 'Google',
    },
    liesmich: 'LISEZMOI.txt',
    readme: [
      'pinn. – export des données',
      '',
      '{F} : {0}',
      'Créé le : {1} par {2} (pinn. {3})',
      '',
      'Contenu :',
      '  pinn-export.json  description de l\u2019export (format, contenu, liste des fichiers)',
      '  daten/            tous les enregistrements par collection en JSON (comme dans PocketBase)',
      '  dateien/          documents, justificatifs et images : dateien/<collection>/<ID>/<fichier>',
      '',
      'Non inclus : mots de passe, codes PIN, accès (iCloud, Google, Home Assistant),',
      'appareils connectés, abonnements push et historique de localisation de Traccar.',
      '',
      'Attention : ce fichier contient finances, documents et fiches d\u2019urgence en clair.',
      'Conserve-le en lieu sûr.',
    ],
  };
  T.es = {
    F: 'familia', FW: 'piso compartido', Fd: 'de la familia', FWd: 'del piso compartido',
    titel: 'Exportar {F}',
    intro: 'Todos los datos {Fd} en un archivo ZIP – con documentos, recibos e imágenes. Por ejemplo para mudarse a otro NAS o como copia de seguridad propia.',
    lade: 'Comprobando el contenido …', fehler: 'No ha funcionado.',
    fehlerNetz: 'Sin conexión con pinn. – comprueba que estás en la red de casa o en la VPN.',
    serverFehlt: 'Todavía faltan export.pb.js y pinn-export.js (pb_hooks) en el servidor.',
    familieWaehlen: '¿Qué {F}?', inhalt: 'Esto entra en el ZIP', eintraege: '{0} entradas', dateienN: '{0} archivos',
    dokumente: 'Archivos en total', groesse: 'Tamaño (aprox.)',
    nichtDrin: 'No incluido',
    nichtDrinText: 'Contraseñas, PIN, accesos a iCloud, Google y Home Assistant, dispositivos conectados y suscripciones push. En otro NAS basta con volver a iniciar sesión. El historial de ubicación de Traccar tampoco se incluye.',
    privat: 'No incluido por ser privado: {0} caja(s) de las que no eres miembro y {1} calendario(s) «Solo para mí» de otros perfiles. Una exportación completa – p. ej. para una mudanza – la crea el administrador principal.',
    voll: 'Exportación completa – incluye las cajas privadas y los calendarios «Solo para mí» de todos los perfiles.',
    sicherheit: 'El ZIP contiene finanzas, documentos y fichas de emergencia sin cifrar. Guárdalo en un lugar seguro y no lo envíes por correo.',
    gross: 'Son unos {0}. En el móvil puede tardar – mejor exporta desde un ordenador y deja pinn. abierto mientras tanto.',
    starten: 'Crear ZIP', abbrechen: 'Cancelar', schliessen: 'Cerrar', nochmal: 'Reintentar',
    schrittDaten: 'Datos: {0}', schrittDatei: 'Archivo {0} de {1}', packe: 'Montando el ZIP …',
    offenLassen: 'Deja pinn. abierto hasta que termine la exportación.',
    fertig: 'Exportación lista ✓', fertigText: '{0} entradas y {1} archivos · {2}',
    speichern: 'Guardar ZIP', teilen: 'Compartir o guardar en Archivos',
    speichernTipp: 'iPhone/iPad: «Compartir» → «Guardar en Archivos». Ordenador: «Guardar ZIP» lo deja en la carpeta de descargas.',
    fehlende: 'No se pudieron leer {0} archivo(s) – aparecen en export-fehler.txt dentro del ZIP.',
    abgebrochen: 'Exportación cancelada.', zuGross: 'La exportación supera 4 GB – un ZIP normal no puede contenerla.',
    keinAdmin: 'Solo los administradores pueden crear la exportación.',
    S: {
      familien: '{F}', benutzer: 'Perfiles', familien_daten: 'Calendario, listas, recetas, miembros y ajustes',
      rezept_bilder: 'Imágenes de recetas', oeffentliche_rezepte: 'Recetas compartidas', aufgaben: 'Tareas',
      haushalt_verlauf: 'Historial del hogar', kassen: 'Cajas, depósitos y contratos', ausgaben: 'Movimientos',
      finanz_dokumente: 'Documentos de contratos', dokumente: 'Documentos', pinnwand_bilder: 'Imágenes del tablón',
      kalender_eigene: 'Calendarios propios', kalender_termine: 'Citas', muellkalender: 'Calendario de basura',
      ortung: 'Lugares y ubicación', zuhause: 'Casa', smarthome_zugaenge: 'Hogar inteligente',
      dashboard_hintergruende: 'Panel', apple_zugaenge: 'iCloud', google_zugaenge: 'Google',
    },
    liesmich: 'LEEME.txt',
    readme: [
      'pinn. – exportación de datos',
      '',
      '{F}: {0}',
      'Creado: {1} por {2} (pinn. {3})',
      '',
      'Contenido:',
      '  pinn-export.json  descripción de la exportación (formato, contenido, lista de archivos)',
      '  daten/            todos los registros por colección en JSON (como en PocketBase)',
      '  dateien/          documentos, recibos e imágenes: dateien/<colección>/<ID>/<archivo>',
      '',
      'No incluido: contraseñas, PIN, accesos (iCloud, Google, Home Assistant),',
      'dispositivos conectados, suscripciones push e historial de ubicación de Traccar.',
      '',
      'Atención: este archivo contiene finanzas, documentos y fichas de emergencia sin cifrar.',
      'Guárdalo en un lugar seguro.',
    ],
  };

  var S = { opts: {}, lang: 'en', wg: false, info: null, familie: '', laeuft: false, abbruch: false, ergebnis: null, url: '' };

  /* ---------- Texte ---------- */
  function terms(s) {
    var L = T[S.lang] || T.en;
    var F = S.wg ? L.FW : L.F, Fd = S.wg ? L.FWd : L.Fd;
    return String(s).replace(/\{Fd\}/g, Fd).replace(/\{F\}/g, F);
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function t(key) {
    var L = T[S.lang] || T.en;
    var s = L[key] !== undefined ? L[key] : (T.en[key] !== undefined ? T.en[key] : key);
    if (Array.isArray(s)) s = s.join('\n');
    s = terms(s);
    for (var i = 1; i < arguments.length; i++) s = s.split('{' + (i - 1) + '}').join(String(arguments[i]));
    return s;
  }
  function label(name) {
    var L = T[S.lang] || T.en;
    var s = (L.S && L.S[name]) || (T.en.S[name]) || name;
    return cap(terms(s));
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function locale() { return { de: 'de-DE', en: 'en-GB', fr: 'fr-FR', es: 'es-ES' }[S.lang] || 'en-GB'; }
  function zahl(n) { try { return Number(n || 0).toLocaleString(locale()); } catch (e) { return String(n || 0); } }
  function groesse(b) {
    b = Number(b) || 0;
    var u = ['B', 'KB', 'MB', 'GB'], i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    var d = i === 0 ? 0 : (b < 10 ? 1 : 0);
    try { return b.toLocaleString(locale(), { maximumFractionDigits: d, minimumFractionDigits: d }) + ' ' + u[i]; } catch (e) { return b.toFixed(d) + ' ' + u[i]; }
  }

  /* ---------- Server ---------- */
  function api(url) {
    var f = S.opts.apiFetch || window.fetch.bind(window);
    return f(url, { cache: 'no-store' }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var e = new Error(body.error || ('HTTP ' + res.status));
          e.status = res.status; e.code = body.code || '';
          throw e;
        }
        return body;
      });
    }, function () { var e = new Error(t('fehlerNetz')); e.code = 'netz'; throw e; });
  }
  function apiBytes(url) {
    var f = S.opts.apiFetch || window.fetch.bind(window);
    return f(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          var e = new Error(body.error || ('HTTP ' + res.status)); e.status = res.status; e.code = body.code || ''; throw e;
        });
      }
      return res.arrayBuffer();
    }, function () { var e = new Error(t('fehlerNetz')); e.code = 'netz'; throw e; });
  }
  function q(obj) {
    return Object.keys(obj).filter(function (k) { return obj[k] !== undefined && obj[k] !== null && obj[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
  }

  /* ---------- ZIP (im Browser) ---------- */
  var CRC_T = (function () {
    var tbl = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      tbl[n] = c >>> 0;
    }
    return tbl;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0, n = u8.length; i < n; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  var ENC = new TextEncoder();
  function deflate(u8) {
    if (!window.CompressionStream || !window.Response || !window.Blob || !Blob.prototype.stream) return Promise.resolve(null);
    var cs;
    try { cs = new CompressionStream('deflate-raw'); } catch (e) { return Promise.resolve(null); }
    try {
      return new Response(new Blob([u8]).stream().pipeThrough(cs)).arrayBuffer()
        .then(function (b) { return new Uint8Array(b); }, function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function dosZeit(d) {
    return {
      time: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((Math.floor(d.getSeconds() / 2)) & 31),
      date: (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31),
    };
  }
  function Zip() { this.parts = []; this.zentral = []; this.offset = 0; this.anzahl = 0; this.dz = dosZeit(new Date()); }
  // name: Pfad im ZIP; u8: Inhalt; packen: komprimieren versuchen
  Zip.prototype.add = function (name, u8, packen) {
    var self = this;
    var crc = crc32(u8);
    var p = packen && u8.length > 512 ? deflate(u8) : Promise.resolve(null);
    return p.then(function (z) {
      var methode = 0, daten = u8;
      if (z && z.length < u8.length) { methode = 8; daten = z; }
      if (self.offset + daten.length + 1024 > 0xFFFFFFFF) { var e = new Error(t('zuGross')); e.code = 'gross'; throw e; }
      var nb = ENC.encode(name);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(8, methode, true); h.setUint16(10, self.dz.time, true); h.setUint16(12, self.dz.date, true);
      h.setUint32(14, crc, true); h.setUint32(18, daten.length, true); h.setUint32(22, u8.length, true);
      h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, methode, true); c.setUint16(12, self.dz.time, true); c.setUint16(14, self.dz.date, true);
      c.setUint32(16, crc, true); c.setUint32(20, daten.length, true); c.setUint32(24, u8.length, true);
      c.setUint16(28, nb.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true);
      c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, self.offset, true);
      self.parts.push(new Uint8Array(h.buffer), nb, new Blob([daten]));
      self.zentral.push(new Uint8Array(c.buffer), nb);
      self.offset += 30 + nb.length + daten.length;
      self.anzahl++;
    });
  };
  Zip.prototype.addText = function (name, text, packen) { return this.add(name, ENC.encode(text), packen !== false); };
  Zip.prototype.blob = function () {
    var cdGroesse = 0;
    this.zentral.forEach(function (x) { cdGroesse += x.length; });
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(4, 0, true); e.setUint16(6, 0, true);
    e.setUint16(8, this.anzahl & 0xFFFF, true); e.setUint16(10, this.anzahl & 0xFFFF, true);
    e.setUint32(12, cdGroesse, true); e.setUint32(16, this.offset, true); e.setUint16(20, 0, true);
    return new Blob(this.parts.concat(this.zentral, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  };
  function sicher(s) {
    s = String(s || '').replace(/[\u0000-\u001f\u007f\/\\:*?"<>|]+/g, '_').replace(/^\.+/, '_').trim();
    return s.slice(0, 180) || 'datei';
  }
  function slug(s) {
    var x = String(s || '').normalize ? String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '') : String(s || '');
    x = x.replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return x.slice(0, 40) || 'familie';
  }
  function heute() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ---------- Export ---------- */
  function exportieren() {
    if (S.laeuft) return;
    S.laeuft = true; S.abbruch = false; S.ergebnis = null; S.meldung = null; freigeben();
    render();
    var info = S.info, fam = info.familie.id;
    var zip = new Zip();
    var manifest = {
      format: info.format || 'pinn-familien-export', formatVersion: info.formatVersion || 1,
      appVersion: info.version || '', exportiert: new Date().toISOString(), exportiertVon: info.exportiertVon || '',
      sprache: S.lang, familie: info.familie, vollstaendig: !!info.vollstaendig,
      ausgelassen: info.ausgelassen || {}, nichtEnthalten: info.nichtEnthalten || [],
      sammlungen: {}, dateien: [], fehlend: [],
    };
    var eintraege = 0, dateiListe = [];
    var listeS = (info.sammlungen || []).slice();
    var stop = function () { if (S.abbruch) { var e = new Error(t('abgebrochen')); e.code = 'abbruch'; throw e; } };

    // 1) Sammlungen
    var kette = Promise.resolve();
    listeS.forEach(function (s) {
      kette = kette.then(function () {
        stop();
        fortschritt(t('schrittDaten', label(s.name)), 0);
        return api('/api/pinn/export/sammlung?' + q({ familie: fam, name: s.name })).then(function (r) {
          stop();
          var recs = r.datensaetze || [];
          eintraege += recs.length;
          manifest.sammlungen[s.name] = { datei: 'daten/' + s.name + '.json', anzahl: recs.length, bezeichnung: label(s.name) };
          (r.dateien || []).forEach(function (d) { d.sammlung = s.name; dateiListe.push(d); });
          return zip.addText('daten/' + s.name + '.json', JSON.stringify(recs, null, 1), true);
        });
      });
    });

    // 2) Dateien – nacheinander, damit NAS und Akku entspannt bleiben
    kette = kette.then(function () {
      var i = 0, n = dateiListe.length;
      function naechste() {
        stop();
        if (i >= n) return Promise.resolve();
        var d = dateiListe[i++];
        fortschritt(t('schrittDatei', zahl(i), zahl(n)), n ? i / n : 1);
        var pfad = 'dateien/' + sicher(d.sammlung) + '/' + sicher(d.datensatz) + '/' + sicher(d.name);
        return apiBytes('/api/pinn/export/datei?' + q({ familie: fam, sammlung: d.sammlung, datensatz: d.datensatz, name: d.name }))
          .then(function (buf) {
            stop();
            var u8 = new Uint8Array(buf);
            manifest.dateien.push({ pfad: pfad, sammlung: d.sammlung, datensatz: d.datensatz, feld: d.feld, name: d.name, groesse: u8.length });
            return zip.add(pfad, u8, false);
          }, function (err) {
            if (err.code === 'netz' || err.code === 'abbruch' || err.code === 'gross') throw err;
            manifest.fehlend.push({ sammlung: d.sammlung, datensatz: d.datensatz, name: d.name, fehler: err.message });
          })
          .then(naechste);
      }
      return naechste();
    });

    // 3) Beschreibung, Liesmich, ZIP
    kette = kette.then(function () {
      stop();
      fortschritt(t('packe'), 1);
      var L = T[S.lang] || T.en;
      var readme = function (lang) {
        var keep = S.lang; S.lang = lang;
        var txt = t('readme', info.familie.name, new Date().toLocaleString(locale()), info.exportiertVon || '-', info.version || '-');
        S.lang = keep; return txt.split('\n').map(cap).join('\n') + '\n';
      };
      var arbeit = [
        zip.addText('pinn-export.json', JSON.stringify(manifest, null, 2), true),
        zip.addText((L.liesmich || 'README.txt'), readme(S.lang), false),
      ];
      if (S.lang !== 'en') arbeit.push(zip.addText('README.txt', readme('en'), false));
      if (manifest.fehlend.length) {
        arbeit.push(zip.addText('export-fehler.txt', manifest.fehlend.map(function (f) {
          return f.sammlung + '/' + f.datensatz + '/' + f.name + '  –  ' + f.fehler;
        }).join('\n') + '\n', false));
      }
      return Promise.all(arbeit);
    }).then(function () {
      var blob = zip.blob();
      var name = 'pinn-export_' + slug(info.familie.name) + '_' + heute() + '.zip';
      S.ergebnis = { blob: blob, name: name, eintraege: eintraege, dateien: manifest.dateien.length, fehlend: manifest.fehlend.length };
      try { S.url = URL.createObjectURL(blob); } catch (e) { S.url = ''; }
      S.laeuft = false;
      render();
    }, function (err) {
      S.laeuft = false;
      S.meldung = err.code === 'abbruch' ? { art: 'info', text: t('abgebrochen') } : { art: 'err', text: err.message || t('fehler') };
      render();
    });
  }

  function freigeben() {
    if (S.url) { try { URL.revokeObjectURL(S.url); } catch (e) { /* egal */ } }
    S.url = '';
  }
  function teilen() {
    var r = S.ergebnis;
    if (!r) return;
    try {
      var file = new File([r.blob], r.name, { type: 'application/zip' });
      navigator.share({ files: [file], title: r.name }).catch(function () { /* abgebrochen */ });
    } catch (e) { /* nicht möglich */ }
  }
  function kannTeilen() {
    try {
      if (!navigator.share || !navigator.canShare || !window.File) return false;
      return navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.zip', { type: 'application/zip' })] });
    } catch (e) { return false; }
  }

  /* ---------- Oberfläche ---------- */
  var CSS =
    '#pxScreen{position:fixed;inset:0;z-index:9990;display:flex;align-items:flex-end;justify-content:center;background:rgba(20,20,18,.42);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}' +
    '#pxScreen.hidden{display:none}' +
    '@media (min-width:700px){#pxScreen{align-items:center}}' +
    '.px-sheet{width:100%;max-width:560px;max-height:92vh;max-height:92dvh;overflow:auto;-webkit-overflow-scrolling:touch;background:var(--c-bg,#F7F4EE);color:var(--c-ink,#25231F);border-radius:1.3rem 1.3rem 0 0;padding:1.25rem 1.2rem calc(1.2rem + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 40px rgba(0,0,0,.18);font-family:inherit}' +
    '@media (min-width:700px){.px-sheet{border-radius:1.3rem;padding-bottom:1.3rem}}' +
    'html.dark .px-sheet{background:#1a1c1e;color:#ECEAE4}' +
    '.px-head{display:flex;align-items:center;gap:.6rem;margin-bottom:.35rem}.px-head h2{font-size:1.3rem;font-weight:650;margin:0;flex:1;line-height:1.25}' +
    '.px-x{border:0;background:rgba(37,35,31,.07);width:32px;height:32px;border-radius:50%;font-size:1.05rem;cursor:pointer;color:inherit;flex-shrink:0}' +
    'html.dark .px-x{background:rgba(255,255,255,.1)}' +
    '.px-p{font-size:.88rem;line-height:1.55;opacity:.8;margin:0 0 .9rem}' +
    '.px-label{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;opacity:.6;margin:1rem 0 .35rem}' +
    '.px-select{width:100%;border:1px solid rgba(37,35,31,.18);border-radius:.65rem;padding:.6rem .7rem;font-size:16px;background:#fff;color:inherit;font-family:inherit}' +
    'html.dark .px-select{background:#212427;border-color:rgba(255,255,255,.16)}' +
    '.px-sum{border:1px solid rgba(37,35,31,.1);border-radius:.85rem;overflow:hidden;background:rgba(255,255,255,.6)}' +
    'html.dark .px-sum{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.04)}' +
    '.px-row{display:flex;justify-content:space-between;gap:.8rem;padding:.55rem .8rem;font-size:.85rem;border-top:1px solid rgba(37,35,31,.07)}.px-row:first-child{border-top:0}' +
    'html.dark .px-row{border-color:rgba(255,255,255,.08)}' +
    '.px-rl{min-width:0}.px-rv{opacity:.65;text-align:right;white-space:nowrap}.px-row.px-tot{font-weight:600}' +
    '.px-msg{font-size:.82rem;border-radius:.7rem;padding:.6rem .75rem;margin-top:.7rem;line-height:1.45}' +
    '.px-msg.ok{background:rgba(46,160,67,.12);color:#1d6f33}.px-msg.err{background:rgba(229,72,77,.11);color:#a8232a}' +
    '.px-msg.warn{background:rgba(214,158,46,.14);color:#7a5410}.px-msg.info{background:color-mix(in srgb,var(--c-pine,#00374A) 8%,transparent)}' +
    'html.dark .px-msg.ok{color:#7fd896}html.dark .px-msg.err{color:#ff9a9e}html.dark .px-msg.warn{color:#f0c674}' +
    '.px-nav{display:flex;gap:.5rem;margin-top:1.1rem;align-items:center;flex-wrap:wrap}.px-nav .px-btn{margin-left:auto}' +
    '.px-btn{border:0;border-radius:.75rem;padding:.72rem 1.15rem;font-size:.92rem;font-weight:600;background:var(--c-pine,#00374A);color:#fff;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:.4rem}' +
    '.px-btn:disabled{opacity:.55;cursor:default}' +
    '.px-btn2{border:1px solid rgba(37,35,31,.18);border-radius:.75rem;padding:.62rem 1rem;font-size:.86rem;font-weight:500;background:transparent;color:inherit;cursor:pointer;font-family:inherit}' +
    'html.dark .px-btn2{border-color:rgba(255,255,255,.18)}' +
    '.px-full{width:100%;margin-top:.55rem}' +
    '.px-bar{height:8px;border-radius:5px;background:rgba(37,35,31,.08);overflow:hidden;margin:1rem 0 .5rem}html.dark .px-bar{background:rgba(255,255,255,.1)}' +
    '.px-bar>i{display:block;height:100%;width:0;background:var(--c-pine,#00374A);border-radius:5px;transition:width .25s ease}' +
    'html.dark .px-bar>i{background:#5fa8c2}' +
    '.px-step{font-size:.85rem;opacity:.8;min-height:1.3em}' +
    '.px-big{font-size:2.2rem;text-align:center;margin:.4rem 0 .2rem}';

  function ensureRoot() {
    if (!document.getElementById('px-style')) {
      var st = document.createElement('style');
      st.id = 'px-style'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    var root = document.getElementById('pxScreen');
    if (!root) {
      root = document.createElement('div');
      root.id = 'pxScreen';
      root.setAttribute('data-no-i18n', ''); root.setAttribute('data-no-term', ''); root.setAttribute('translate', 'no');
      root.innerHTML = '<div class="px-sheet" role="dialog" aria-modal="true" id="px_sheet"></div>';
      document.body.appendChild(root);
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
    }
    root.classList.remove('hidden');
    S.root = root;
    return root;
  }
  function kopf() {
    return '<div class="px-head"><h2>' + esc(t('titel')) + '</h2>' +
      (S.laeuft ? '' : '<button type="button" class="px-x" data-px="schliessen" aria-label="' + esc(t('schliessen')) + '">✕</button>') + '</div>';
  }
  function msg(art, text) { return '<div class="px-msg ' + art + '">' + esc(text) + '</div>'; }

  function render() {
    if (!S.root) return;
    var el = S.root.querySelector('#px_sheet');
    var h = kopf();

    if (S.laeuft) {
      h += '<p class="px-p">' + esc(t('offenLassen')) + '</p>' +
        '<div class="px-bar"><i id="px_bar"></i></div><div class="px-step" id="px_step">' + esc(t('lade')) + '</div>' +
        '<div class="px-nav"><button type="button" class="px-btn2" data-px="abbrechen">' + esc(t('abbrechen')) + '</button></div>';
      el.innerHTML = h;
      return;
    }

    if (S.ergebnis) {
      var r = S.ergebnis;
      h += '<div class="px-big">📦</div><p class="px-p" style="text-align:center;margin-bottom:.3rem"><b>' + esc(t('fertig')) + '</b></p>' +
        '<p class="px-p" style="text-align:center">' + esc(t('fertigText', zahl(r.eintraege), zahl(r.dateien), groesse(r.blob.size))) + '</p>';
      if (r.fehlend) h += msg('warn', t('fehlende', zahl(r.fehlend)));
      if (kannTeilen()) h += '<button type="button" class="px-btn px-full" data-px="teilen">' + esc(t('teilen')) + '</button>';
      if (S.url) {
        h += '<a class="' + (kannTeilen() ? 'px-btn2' : 'px-btn') + ' px-full" style="display:flex;justify-content:center;text-decoration:none;box-sizing:border-box" href="' + esc(S.url) +
          '" download="' + esc(r.name) + '">' + esc(t('speichern')) + '</a>';
      }
      h += '<p class="px-p" style="margin-top:.8rem;font-size:.78rem">' + esc(t('speichernTipp')) + '</p>' + msg('info', t('sicherheit'));
      h += '<div class="px-nav"><button type="button" class="px-btn" data-px="schliessen">' + esc(t('schliessen')) + '</button></div>';
      el.innerHTML = h;
      return;
    }

    if (!S.info) {
      h += S.meldung ? msg(S.meldung.art, S.meldung.text) +
        '<div class="px-nav"><button type="button" class="px-btn2" data-px="schliessen">' + esc(t('schliessen')) + '</button>' +
        '<button type="button" class="px-btn" data-px="laden">' + esc(t('nochmal')) + '</button></div>'
        : '<p class="px-p">' + esc(t('lade')) + '</p>';
      el.innerHTML = h;
      return;
    }

    var info = S.info;
    h += '<p class="px-p">' + esc(t('intro')) + '</p>';
    if (info.familien && info.familien.length > 1) {
      h += '<label class="px-label" for="px_fam">' + esc(cap(t('familieWaehlen'))) + '</label><select class="px-select" id="px_fam">';
      info.familien.forEach(function (f) {
        h += '<option value="' + esc(f.id) + '"' + (f.id === info.familie.id ? ' selected' : '') + '>' + esc(f.name) + '</option>';
      });
      h += '</select>';
    }
    h += '<span class="px-label">' + esc(t('inhalt')) + (info.familien && info.familien.length > 1 ? '' : ' · ' + esc(info.familie.name)) + '</span><div class="px-sum">';
    var summe = 0;
    (info.sammlungen || []).forEach(function (s) {
      summe += s.anzahl;
      h += '<div class="px-row"><span class="px-rl">' + esc(label(s.name)) + '</span><span class="px-rv">' +
        esc(t('eintraege', zahl(s.anzahl))) + (s.dateien ? ' · ' + esc(t('dateienN', zahl(s.dateien))) : '') + '</span></div>';
    });
    h += '<div class="px-row px-tot"><span class="px-rl">' + esc(t('dokumente')) + '</span><span class="px-rv">' + esc(zahl(info.dateien)) + '</span></div>';
    if (info.bytes) h += '<div class="px-row px-tot"><span class="px-rl">' + esc(t('groesse')) + '</span><span class="px-rv">' + esc(groesse(info.bytes)) + '</span></div>';
    h += '</div>';

    var a = info.ausgelassen || {};
    if (info.vollstaendig) h += msg('info', t('voll'));
    else if ((a.kassen || 0) + (a.kalender || 0) > 0) h += msg('warn', t('privat', zahl(a.kassen || 0), zahl(a.kalender || 0)));
    h += '<span class="px-label">' + esc(t('nichtDrin')) + '</span><p class="px-p" style="font-size:.8rem;margin:0">' + esc(t('nichtDrinText')) + '</p>';
    if ((info.bytes || 0) > 300 * 1024 * 1024) h += msg('warn', t('gross', groesse(info.bytes)));
    h += msg('info', t('sicherheit'));
    if (S.meldung) h += msg(S.meldung.art, S.meldung.text);
    h += '<div class="px-nav"><button type="button" class="px-btn2" data-px="schliessen">' + esc(t('abbrechen')) + '</button>' +
      '<button type="button" class="px-btn" data-px="starten"' + (summe ? '' : ' disabled') + '>⬇︎ ' + esc(t('starten')) + '</button></div>';
    el.innerHTML = h;
  }

  function fortschritt(text, anteil) {
    if (!S.root) return;
    var st = S.root.querySelector('#px_step'), bar = S.root.querySelector('#px_bar');
    if (st) st.textContent = text;
    if (bar && anteil !== undefined && anteil !== null) bar.style.width = Math.max(3, Math.min(100, Math.round(anteil * 100))) + '%';
  }

  function laden(familie) {
    S.info = null; S.meldung = null; render();
    return api('/api/pinn/export/uebersicht?' + q({ familie: familie || '' })).then(function (info) {
      S.info = info;
      S.wg = !!(info.familie && info.familie.wohnform === 'wg');
      render();
    }, function (e) {
      var text = e.code === 'netz' ? t('fehlerNetz') : (e.status === 404 && !e.code ? t('serverFehlt') : (e.code === 'admin' ? t('keinAdmin') : e.message));
      S.meldung = { art: 'err', text: text };
      render();
    });
  }

  function onClick(ev) {
    if (ev.target === S.root && !S.laeuft) { close(); return; }
    var b = ev.target.closest ? ev.target.closest('[data-px]') : null;
    if (!b) return;
    var a = b.getAttribute('data-px');
    if (a === 'schliessen') close();
    else if (a === 'abbrechen') { S.abbruch = true; fortschritt(t('abgebrochen')); }
    else if (a === 'starten') exportieren();
    else if (a === 'teilen') teilen();
    else if (a === 'laden') laden(S.familie);
  }
  function onChange(ev) {
    if (ev.target && ev.target.id === 'px_fam') { S.familie = ev.target.value; laden(S.familie); }
  }

  function close() {
    if (S.laeuft) return;
    if (S.root) S.root.classList.add('hidden');
    freigeben();
    S.ergebnis = null;
    if (typeof S.opts.onClose === 'function') { try { S.opts.onClose(); } catch (e) { /* egal */ } }
  }

  function open(opts) {
    S.opts = opts || {};
    var cur = (window.PINN_I18N && window.PINN_I18N.current) || 'en';
    S.lang = LANGS.indexOf(cur) !== -1 ? cur : 'en';
    S.wg = !!S.opts.wg;
    S.familie = S.opts.familie || '';
    S.ergebnis = null; S.meldung = null; S.laeuft = false;
    freigeben();
    ensureRoot();
    return laden(S.familie);
  }

  window.PinnExport = { open: open };
})();
