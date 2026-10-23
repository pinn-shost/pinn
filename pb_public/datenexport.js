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
   Eigene Texte in Deutsch, Englisch, Französisch, Spanisch, Italienisch, Portugiesisch, Chinesisch,
   Japanisch und Koreanisch (data-no-i18n / data-no-term).

   Aufbau des ZIP:
     pinn-export.json                 Beschreibung: Format, Version, Familie, Inhalt, Dateiliste
     LIESMICH.txt / README.txt        kurze Erklärung
     daten/<sammlung>.json            Datensätze je Sammlung (wie in PocketBase, ohne Passwörter)
     dateien/<sammlung>/<id>/<datei>  Dokumente, Belege, Rezept- und Pinnwand-Bilder
     export-fehler.txt                nur falls Dateien nicht lesbar waren */
(function () {
  'use strict';
  if (window.PinnExport) return;

  var LANGS = ['de', 'en', 'fr', 'es', 'it', 'pt', 'zh', 'ja', 'ko'];
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

  T.it = {
    F: 'famiglia', FW: 'casa condivisa', Fd: 'della famiglia', FWd: 'della casa condivisa',
    titel: 'Esporta {F}',
    intro: 'Tutti i dati {Fd} in un file ZIP, con documenti, ricevute e immagini. Ad esempio per passare a un altro NAS o come backup personale.',
    lade: 'Controllo del contenuto …',
    fehler: 'Non ha funzionato.',
    fehlerNetz: 'Nessuna connessione a pinn.: controlla di essere nella rete di casa o in VPN.',
    serverFehlt: 'Sul server mancano ancora export.pb.js e pinn-export.js (pb_hooks).',
    familieWaehlen: 'Quale {F}?',
    inhalt: 'Cosa entra nello ZIP',
    eintraege: '{0} voci',
    dateienN: '{0} file',
    dokumente: 'File in totale',
    groesse: 'Dimensione (circa)',
    nichtDrin: 'Non incluso',
    nichtDrinText: 'Password, PIN, dati di accesso a iCloud, Google e Home Assistant, dispositivi connessi e iscrizioni push. Su un altro NAS basta accedere di nuovo. Neanche la cronologia delle posizioni di Traccar è inclusa.',
    privat: 'Non incluso perché privato: {0} cassa/e di cui non sei membro e {1} calendario/i «Solo per me» di altri profili. Un’esportazione completa – ad esempio per un trasloco – la crea l’amministratore principale.',
    voll: 'Esportazione completa: sono incluse anche le casse private e i calendari «Solo per me» di tutti i profili.',
    sicherheit: 'Lo ZIP contiene finanze, documenti e schede di emergenza non cifrati. Conservalo in un posto sicuro e non inviarlo per e-mail.',
    gross: 'Sono circa {0}. Sul telefono può richiedere tempo: meglio esportare da un computer lasciando pinn. aperto.',
    starten: 'Crea ZIP',
    abbrechen: 'Annulla',
    schliessen: 'Chiudi',
    nochmal: 'Riprova',
    schrittDaten: 'Dati: {0}',
    schrittDatei: 'File {0} di {1}',
    packe: 'Creazione dello ZIP …',
    offenLassen: 'Lascia pinn. aperto finché l’esportazione non è finita.',
    fertig: 'Esportazione completata ✓',
    fertigText: '{0} voci e {1} file · {2}',
    speichern: 'Salva ZIP',
    teilen: 'Condividi o salva in File',
    speichernTipp: 'iPhone/iPad: «Condividi» → «Salva su File». Computer: «Salva ZIP» mette il file nella cartella dei download.',
    fehlende: 'Non è stato possibile leggere {0} file: sono elencati in export-fehler.txt nello ZIP.',
    abgebrochen: 'Esportazione annullata.',
    zuGross: 'L’esportazione supera i 4 GB: uno ZIP normale non può contenerla.',
    keinAdmin: 'Solo gli amministratori possono creare l’esportazione.',
    S: {
      familien: '{F}',
      benutzer: 'Profili',
      familien_daten: 'Calendario, liste, ricette, membri e impostazioni',
      rezept_bilder: 'Immagini delle ricette',
      oeffentliche_rezepte: 'Ricette condivise',
      aufgaben: 'Attività',
      haushalt_verlauf: 'Cronologia della casa',
      kassen: 'Casse, depositi e contratti',
      ausgaben: 'Movimenti',
      finanz_dokumente: 'Documenti dei contratti',
      dokumente: 'Documenti',
      pinnwand_bilder: 'Immagini della bacheca',
      kalender_eigene: 'Calendari propri',
      kalender_termine: 'Eventi',
      muellkalender: 'Calendario dei rifiuti',
      ortung: 'Luoghi e posizione',
      zuhause: 'Casa',
      smarthome_zugaenge: 'Smart home',
      dashboard_hintergruende: 'Dashboard',
      apple_zugaenge: 'iCloud',
      google_zugaenge: 'Google',
    },
    liesmich: 'LEGGIMI.txt',
    readme: [
      'pinn. – esportazione dei dati',
      '',
      '{F}: {0}',
      'Creato: {1} da {2} (pinn. {3})',
      '',
      'Contenuto:',
      '  pinn-export.json  descrizione dell’esportazione (formato, contenuto, elenco dei file)',
      '  daten/            tutti i record per raccolta in JSON (come in PocketBase)',
      '  dateien/          documenti, ricevute e immagini: dateien/<raccolta>/<ID>/<file>',
      '',
      'Non incluso: password, PIN, dati di accesso (iCloud, Google, Home Assistant),',
      'dispositivi connessi, iscrizioni push e cronologia delle posizioni di Traccar.',
      '',
      'Attenzione: questo file contiene finanze, documenti e schede di emergenza non cifrati.',
      'Conservalo in un posto sicuro.',
    ],
  };
  T.pt = {
    F: 'família', FW: 'casa compartilhada', Fd: 'da família', FWd: 'da casa compartilhada',
    titel: 'Exportar {F}',
    intro: 'Todos os dados {Fd} em um arquivo ZIP – com documentos, comprovantes e imagens. Por exemplo, para mudar para outro NAS ou como backup próprio.',
    lade: 'Verificando o conteúdo …',
    fehler: 'Não deu certo.',
    fehlerNetz: 'Sem conexão com o pinn. – verifique se você está na rede de casa ou na VPN.',
    serverFehlt: 'Ainda faltam export.pb.js e pinn-export.js (pb_hooks) no servidor.',
    familieWaehlen: 'Qual {F}?',
    inhalt: 'O que entra no ZIP',
    eintraege: '{0} entradas',
    dateienN: '{0} arquivos',
    dokumente: 'Arquivos no total',
    groesse: 'Tamanho (aprox.)',
    nichtDrin: 'Não incluído',
    nichtDrinText: 'Senhas, PINs, dados de acesso ao iCloud, Google e Home Assistant, aparelhos conectados e assinaturas de push. Em outro NAS é só entrar de novo. O histórico de localização do Traccar também não está incluído.',
    privat: 'Não incluído por ser privado: {0} caixa(s) da(s) qual(is) você não é membro e {1} calendário(s) “Só para mim” de outros perfis. Uma exportação completa – por exemplo, para uma mudança – é feita pelo administrador principal.',
    voll: 'Exportação completa – inclui também as caixas privadas e os calendários “Só para mim” de todos os perfis.',
    sicherheit: 'O ZIP contém finanças, documentos e fichas de emergência sem criptografia. Guarde-o em lugar seguro e não o envie por e-mail.',
    gross: 'São cerca de {0}. No celular pode demorar – o melhor é exportar no computador e deixar o pinn. aberto.',
    starten: 'Criar ZIP',
    abbrechen: 'Cancelar',
    schliessen: 'Fechar',
    nochmal: 'Tentar de novo',
    schrittDaten: 'Dados: {0}',
    schrittDatei: 'Arquivo {0} de {1}',
    packe: 'Montando o ZIP …',
    offenLassen: 'Deixe o pinn. aberto até a exportação terminar.',
    fertig: 'Exportação concluída ✓',
    fertigText: '{0} entradas e {1} arquivos · {2}',
    speichern: 'Salvar ZIP',
    teilen: 'Compartilhar ou salvar em Arquivos',
    speichernTipp: 'iPhone/iPad: “Compartilhar” → “Salvar em Arquivos”. Computador: “Salvar ZIP” coloca o arquivo na pasta de downloads.',
    fehlende: '{0} arquivo(s) não puderam ser lidos – eles estão listados em export-fehler.txt dentro do ZIP.',
    abgebrochen: 'Exportação cancelada.',
    zuGross: 'A exportação é maior que 4 GB – um ZIP comum não consegue contê-la.',
    keinAdmin: 'Só administradores podem criar a exportação.',
    S: {
      familien: '{F}',
      benutzer: 'Perfis',
      familien_daten: 'Calendário, listas, receitas, membros e ajustes',
      rezept_bilder: 'Imagens de receitas',
      oeffentliche_rezepte: 'Receitas compartilhadas',
      aufgaben: 'Tarefas',
      haushalt_verlauf: 'Histórico da casa',
      kassen: 'Caixas, carteiras e contratos',
      ausgaben: 'Lançamentos',
      finanz_dokumente: 'Documentos de contratos',
      dokumente: 'Documentos',
      pinnwand_bilder: 'Imagens do mural',
      kalender_eigene: 'Calendários próprios',
      kalender_termine: 'Compromissos',
      muellkalender: 'Calendário do lixo',
      ortung: 'Locais e localização',
      zuhause: 'Casa',
      smarthome_zugaenge: 'Casa inteligente',
      dashboard_hintergruende: 'Painel',
      apple_zugaenge: 'iCloud',
      google_zugaenge: 'Google',
    },
    liesmich: 'LEIAME.txt',
    readme: [
      'pinn. – exportação de dados',
      '',
      '{F}: {0}',
      'Criado: {1} por {2} (pinn. {3})',
      '',
      'Conteúdo:',
      '  pinn-export.json  descrição da exportação (formato, conteúdo, lista de arquivos)',
      '  daten/            todos os registros por coleção em JSON (como no PocketBase)',
      '  dateien/          documentos, comprovantes e imagens: dateien/<coleção>/<ID>/<arquivo>',
      '',
      'Não incluído: senhas, PINs, dados de acesso (iCloud, Google, Home Assistant),',
      'aparelhos conectados, assinaturas de push e histórico de localização do Traccar.',
      '',
      'Atenção: este arquivo contém finanças, documentos e fichas de emergência sem criptografia.',
      'Guarde-o em lugar seguro.',
    ],
  };
  T.zh = {
    F: '家庭', FW: '合租', Fd: '家庭', FWd: '合租',
    titel: '导出{F}',
    intro: '将{Fd}的全部数据导出为一个 ZIP 文件——包含文档、凭证和图片。例如用于迁移到另一台 NAS，或作为你自己的备份。',
    lade: '正在检查内容 …',
    fehler: '没成功。',
    fehlerNetz: '没有连接到 pinn.——请检查你是否在家庭网络或 VPN 中。',
    serverFehlt: '服务器上仍缺少 export.pb.js 和 pinn-export.js（pb_hooks）。',
    familieWaehlen: '哪个{F}？',
    inhalt: 'ZIP 中包含的内容',
    eintraege: '{0} 条记录',
    dateienN: '{0} 个文件',
    dokumente: '文件总数',
    groesse: '大小（约）',
    nichtDrin: '不包含',
    nichtDrinText: '密码、PIN、iCloud、Google 和 Home Assistant 的访问数据、已登录的设备和推送订阅。在另一台 NAS 上重新登录即可。Traccar 的位置历史也不包含在内。',
    privat: '因为属于私人内容而不包含：{0} 个你不是成员的资金池，以及其他个人资料的 {1} 个“仅限我自己”日历。完整导出——例如用于搬迁——由主管理员创建。',
    voll: '完整导出——所有个人资料的私人资金池和“仅限我自己”日历也包含在内。',
    sicherheit: '该 ZIP 以未加密形式包含财务、文档和急救卡。请妥善保管，不要通过电子邮件发送。',
    gross: '大约 {0}。在手机上可能需要较长时间——最好在电脑上导出，并在此期间保持 pinn. 打开。',
    starten: '创建 ZIP',
    abbrechen: '取消',
    schliessen: '关闭',
    nochmal: '重试',
    schrittDaten: '数据：{0}',
    schrittDatei: '第 {0} 个文件，共 {1} 个',
    packe: '正在打包 ZIP …',
    offenLassen: '导出完成前，请保持 pinn. 打开。',
    fertig: '导出完成 ✓',
    fertigText: '{0} 条记录和 {1} 个文件 · {2}',
    speichern: '保存 ZIP',
    teilen: '分享或存储到“文件”',
    speichernTipp: 'iPhone/iPad：“分享”→“存储到文件”。电脑：“保存 ZIP”会把文件放到下载文件夹。',
    fehlende: '有 {0} 个文件无法读取——它们列在 ZIP 内的 export-fehler.txt 中。',
    abgebrochen: '导出已取消。',
    zuGross: '导出内容超过 4 GB——普通 ZIP 无法容纳。',
    keinAdmin: '只有管理员可以创建导出。',
    S: {
      familien: '{F}',
      benutzer: '个人资料',
      familien_daten: '日历、清单、食谱、成员与设置',
      rezept_bilder: '食谱图片',
      oeffentliche_rezepte: '共享食谱',
      aufgaben: '任务',
      haushalt_verlauf: '家务历史',
      kassen: '资金池、投资账户与合同',
      ausgaben: '账目',
      finanz_dokumente: '合同文档',
      dokumente: '文档',
      pinnwand_bilder: '留言板图片',
      kalender_eigene: '自己的日历',
      kalender_termine: '日程',
      muellkalender: '垃圾回收日历',
      ortung: '地点与定位',
      zuhause: '家',
      smarthome_zugaenge: '智能家居',
      dashboard_hintergruende: '看板',
      apple_zugaenge: 'iCloud',
      google_zugaenge: 'Google',
    },
    liesmich: '说明.txt',
    readme: [
      'pinn. – 数据导出',
      '',
      '{F}：{0}',
      '创建时间：{1}，创建者：{2}（pinn. {3}）',
      '',
      '内容：',
      '  pinn-export.json  导出说明（格式、内容、文件列表）',
      '  daten/            每个集合的所有记录，JSON 格式（与 PocketBase 中一致）',
      '  dateien/          文档、凭证和图片：dateien/<集合>/<记录ID>/<文件>',
      '',
      '不包含：密码、PIN、访问数据（iCloud、Google、Home Assistant），',
      '已登录的设备、推送订阅以及 Traccar 的位置历史。',
      '',
      '注意：此文件以未加密形式包含财务、文档和急救卡。',
      '请妥善保管。',
    ],
  };
  T.ja = {
    F: '家族', FW: 'ルームシェア', Fd: '家族', FWd: 'ルームシェア',
    titel: '{F}をエクスポート',
    intro: '{Fd}のすべてのデータを1つの ZIP ファイルにまとめます。書類、領収書、画像も含みます。別の NAS への引っ越しや、自分用のバックアップなどに。',
    lade: '内容を確認中 …',
    fehler: 'うまくいきませんでした。',
    fehlerNetz: 'pinn. に接続できません。自宅のネットワークまたは VPN につながっているか確認してください。',
    serverFehlt: 'サーバーに export.pb.js と pinn-export.js（pb_hooks）がまだありません。',
    familieWaehlen: 'どの{F}ですか？',
    inhalt: 'ZIP に含まれるもの',
    eintraege: '{0}件',
    dateienN: '{0}ファイル',
    dokumente: 'ファイルの合計',
    groesse: 'サイズ（約）',
    nichtDrin: '含まれないもの',
    nichtDrinText: 'パスワード、PIN、iCloud・Google・Home Assistant のアクセス情報、ログイン中の端末、プッシュ通知の登録。別の NAS では、もう一度サインインするだけです。Traccar の位置履歴も含まれません。',
    privat: 'プライベートなため含まれないもの：あなたがメンバーでない共有の財布 {0} 件と、ほかのプロフィールの「自分だけ」のカレンダー {1} 件。引っ越し用などの完全なエクスポートは、メイン管理者が作成します。',
    voll: '完全なエクスポート – すべてのプロフィールのプライベートな財布と「自分だけ」のカレンダーも含みます。',
    sicherheit: 'この ZIP には家計、書類、緊急カードが暗号化されずに入っています。大切に保管し、メールで送らないでください。',
    gross: '約 {0} です。スマートフォンでは時間がかかることがあります。パソコンでエクスポートし、その間 pinn. を開いたままにするのがおすすめです。',
    starten: 'ZIP を作成',
    abbrechen: 'キャンセル',
    schliessen: '閉じる',
    nochmal: 'もう一度',
    schrittDaten: 'データ：{0}',
    schrittDatei: 'ファイル {0} / {1}',
    packe: 'ZIP をまとめています …',
    offenLassen: 'エクスポートが終わるまで pinn. を開いたままにしてください。',
    fertig: 'エクスポート完了 ✓',
    fertigText: '{0}件と{1}ファイル · {2}',
    speichern: 'ZIP を保存',
    teilen: '共有または「ファイル」に保存',
    speichernTipp: 'iPhone/iPad：「共有」→「ファイルに保存」。パソコン：「ZIP を保存」でダウンロードフォルダに保存されます。',
    fehlende: '{0}個のファイルを読み込めませんでした。ZIP 内の export-fehler.txt に一覧があります。',
    abgebrochen: 'エクスポートをキャンセルしました。',
    zuGross: 'エクスポートが 4 GB を超えています。通常の ZIP には収まりません。',
    keinAdmin: 'エクスポートを作成できるのは管理者だけです。',
    S: {
      familien: '{F}',
      benutzer: 'プロフィール',
      familien_daten: 'カレンダー、リスト、レシピ、メンバー、設定',
      rezept_bilder: 'レシピの画像',
      oeffentliche_rezepte: '共有レシピ',
      aufgaben: 'タスク',
      haushalt_verlauf: '家事の履歴',
      kassen: '財布、証券口座、契約',
      ausgaben: '取引',
      finanz_dokumente: '契約書類',
      dokumente: '書類',
      pinnwand_bilder: '掲示板の画像',
      kalender_eigene: '自分のカレンダー',
      kalender_termine: '予定',
      muellkalender: 'ごみ収集カレンダー',
      ortung: '場所と位置情報',
      zuhause: '住まい',
      smarthome_zugaenge: 'スマートホーム',
      dashboard_hintergruende: 'ダッシュボード',
      apple_zugaenge: 'iCloud',
      google_zugaenge: 'Google',
    },
    liesmich: 'はじめにお読みください.txt',
    readme: [
      'pinn. – データのエクスポート',
      '',
      '{F}：{0}',
      '作成：{1}、作成者：{2}（pinn. {3}）',
      '',
      '内容：',
      '  pinn-export.json  エクスポートの説明（形式、内容、ファイル一覧）',
      '  daten/            コレクションごとの全レコード（JSON、PocketBase と同じ形式）',
      '  dateien/          書類、領収書、画像：dateien/<コレクション>/<レコードID>/<ファイル>',
      '',
      '含まれないもの：パスワード、PIN、アクセス情報（iCloud、Google、Home Assistant）、',
      'ログイン中の端末、プッシュ通知の登録、Traccar の位置履歴。',
      '',
      '注意：このファイルには家計、書類、緊急カードが暗号化されずに入っています。',
      '大切に保管してください。',
    ],
  };
  T.ko = {
    F: '가족', FW: '셰어하우스', Fd: '가족', FWd: '셰어하우스',
    titel: '{F} 내보내기',
    intro: '{Fd}의 모든 데이터를 ZIP 파일 하나로 – 문서, 영수증, 사진까지 포함해요. 다른 NAS로 옮기거나 개인 백업용으로 쓸 수 있어요.',
    lade: '내용 확인 중 …',
    fehler: '잘 되지 않았어요.',
    fehlerNetz: 'pinn.에 연결할 수 없어요. 집 네트워크나 VPN에 연결되어 있는지 확인하세요.',
    serverFehlt: '서버에 export.pb.js와 pinn-export.js(pb_hooks)가 아직 없어요.',
    familieWaehlen: '어떤 {F}인가요?',
    inhalt: 'ZIP에 들어가는 것',
    eintraege: '항목 {0}개',
    dateienN: '파일 {0}개',
    dokumente: '전체 파일',
    groesse: '크기(약)',
    nichtDrin: '포함되지 않는 것',
    nichtDrinText: '비밀번호, PIN, iCloud·Google·Home Assistant 접속 정보, 로그인된 기기, 푸시 구독. 다른 NAS에서는 다시 로그인하면 돼요. Traccar 위치 기록도 포함되지 않아요.',
    privat: '개인 정보라 포함되지 않음: 내가 멤버가 아닌 자금 {0}개와 다른 프로필의 “나만 보기” 캘린더 {1}개. 이사용 등 전체 내보내기는 메인 관리자가 만들어요.',
    voll: '전체 내보내기 – 모든 프로필의 개인 자금과 “나만 보기” 캘린더도 포함돼요.',
    sicherheit: '이 ZIP에는 재정, 문서, 응급 카드가 암호화되지 않은 상태로 들어 있어요. 안전하게 보관하고 이메일로 보내지 마세요.',
    gross: '약 {0}이에요. 휴대폰에서는 시간이 걸릴 수 있어요 – 컴퓨터에서 내보내고 그동안 pinn.을 열어 두는 게 좋아요.',
    starten: 'ZIP 만들기',
    abbrechen: '취소',
    schliessen: '닫기',
    nochmal: '다시 시도',
    schrittDaten: '데이터: {0}',
    schrittDatei: '파일 {1}개 중 {0}번째',
    packe: 'ZIP으로 묶는 중 …',
    offenLassen: '내보내기가 끝날 때까지 pinn.을 열어 두세요.',
    fertig: '내보내기 완료 ✓',
    fertigText: '항목 {0}개, 파일 {1}개 · {2}',
    speichern: 'ZIP 저장',
    teilen: '공유 또는 “파일”에 저장',
    speichernTipp: 'iPhone/iPad: “공유” → “파일에 저장”. 컴퓨터: “ZIP 저장”을 누르면 다운로드 폴더에 저장돼요.',
    fehlende: '파일 {0}개를 읽을 수 없었어요 – ZIP 안의 export-fehler.txt에 목록이 있어요.',
    abgebrochen: '내보내기가 취소됐어요.',
    zuGross: '내보내기가 4 GB보다 커요 – 일반 ZIP에는 담을 수 없어요.',
    keinAdmin: '관리자만 내보내기를 만들 수 있어요.',
    S: {
      familien: '{F}',
      benutzer: '프로필',
      familien_daten: '캘린더, 목록, 레시피, 구성원, 설정',
      rezept_bilder: '레시피 사진',
      oeffentliche_rezepte: '공유 레시피',
      aufgaben: '할 일',
      haushalt_verlauf: '집안일 기록',
      kassen: '자금, 증권 계좌, 계약',
      ausgaben: '거래 내역',
      finanz_dokumente: '계약 문서',
      dokumente: '문서',
      pinnwand_bilder: '게시판 사진',
      kalender_eigene: '내 캘린더',
      kalender_termine: '일정',
      muellkalender: '쓰레기 수거 캘린더',
      ortung: '장소와 위치',
      zuhause: '우리 집',
      smarthome_zugaenge: '스마트홈',
      dashboard_hintergruende: '대시보드',
      apple_zugaenge: 'iCloud',
      google_zugaenge: 'Google',
    },
    liesmich: '읽어보세요.txt',
    readme: [
      'pinn. – 데이터 내보내기',
      '',
      '{F}: {0}',
      '생성: {1}, 만든 사람: {2} (pinn. {3})',
      '',
      '내용:',
      '  pinn-export.json  내보내기 설명(형식, 내용, 파일 목록)',
      '  daten/            컬렉션별 모든 레코드(JSON, PocketBase에 저장된 그대로)',
      '  dateien/          문서, 영수증, 사진: dateien/<컬렉션>/<레코드 ID>/<파일>',
      '',
      '포함되지 않음: 비밀번호, PIN, 접속 정보(iCloud, Google, Home Assistant),',
      '로그인된 기기, 푸시 구독, Traccar 위치 기록.',
      '',
      '주의: 이 파일에는 재정, 문서, 응급 카드가 암호화되지 않은 상태로 들어 있어요.',
      '안전하게 보관하세요.',
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
  function locale() { return { de: 'de-DE', en: 'en-GB', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-BR', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR' }[S.lang] || 'en-GB'; }
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
