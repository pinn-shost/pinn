/* pinn. – Einrichtungs-Assistent für den Hauptadmin (pb_public/einrichtung.js)
   ----------------------------------------------------------------------------
   Wird von index.html nur bei Bedarf nachgeladen (Hauptadmin → Einrichtung bzw. automatisch nach
   der ersten Anmeldung als Hauptadmin). Eigene Texte in Deutsch, Englisch, Französisch, Spanisch, Italienisch, Portugiesisch, Chinesisch, Japanisch und Koreanisch –
   die Übersetzungs-Schicht der App greift hier nicht ein (data-no-i18n / data-no-term).
   Server: pb_hooks/einrichtung.pb.js + pinn-einrichtung.js. Jeder Schritt wird beim Tippen auf
   „Weiter“ gespeichert; am Ende übernimmt pinn. alles mit einem kurzen Neustart. */
(function () {
  'use strict';
  if (window.PinnSetup) return;

  var LANGS = ['de', 'en', 'fr', 'es', 'it', 'pt', 'zh', 'ja', 'ko'];
  var T = {};
  T.de = {
    titel: "Einrichtung", lade: "Einrichtung wird geladen …",
    weiter: "Weiter", zurueck: "Zurück", ueberspringen: "Überspringen", spaeter: "Später", schliessen: "Schließen",
    pruefen: "Prüfen", pruefe: "Prüfe …", speichere: "Speichere …", kopieren: "Kopieren", kopiert: "Kopiert ✓",
    anleitung: "Schritt-für-Schritt-Anleitung", optional: "optional", erweitert: "Erweitert", zeigen: "Anzeigen",
    gespeichertGeheim: "gespeichert: ••••{0}", leerLassen: "leer lassen = unverändert", ausEnv: "Wert aus der .env bzw. docker-compose.yaml",
    entfernen: "Entfernen", wirdEntfernt: "wird beim Speichern entfernt", entfernenFrage: "Diesen gespeicherten Wert entfernen?",
    schritt: "Schritt {0} von {1}", fehlerFeld: "Bitte „{0}“ prüfen.", fehler: "Das hat nicht geklappt.", ok: "In Ordnung ✓",
    fehlerNetz: "Keine Verbindung zu pinn. – bitte prüfen, ob du im Heimnetz bist.",
    ordnerFehlt: "Der Ordner „konfig“ fehlt auf dem NAS. Bitte die neue docker-compose.yaml verwenden und das Skript pinn-setup.sh starten (oder „docker compose up -d“). Ohne diesen Ordner kann die Einrichtung nichts speichern.",
    ordnerSchreibschutz: "Der Ordner „konfig“ ist schreibgeschützt – bitte pinn-setup.sh erneut starten.",
    serverFehlt: "Auf dem Server fehlen noch einrichtung.pb.js und pinn-einrichtung.js (pb_hooks).",
    erkannt: "Erkannt aus der Adresszeile: {0}", deineAdresse: "Deine pinn.-Adresse:", ph_sub: "z. B. familie-meier",
    L_PORT: "HTTPS-Port", h_port: "Nur ändern, wenn du den Port 8443 in der docker-compose.yaml geändert hast.",
    pflichtInfo: "Pflicht sind nur „Heimnetz“ und „DuckDNS“. Alles andere kannst du überspringen und jederzeit nachholen: Hauptadmin → Einrichtung.",
    serverOk: "pinn. läuft und kann die Einstellungen speichern ✓",
    schonFertig: "Die Einrichtung wurde schon abgeschlossen. Du kannst alles prüfen und ändern – am Ende mit „Speichern & starten“ übernehmen.",
    bitteWaehlen: "Bitte eine Möglichkeit auswählen (oder „Überspringen“).",
    skipPflicht: "Ohne diesen Schritt funktionieren HTTPS, Push-Nachrichten und die App auf dem Home-Bildschirm nicht. Trotzdem überspringen?",
    pflichtFehlt: "Bitte die Felder ausfüllen – oder „Überspringen“.",
    speichernStarten: "Speichern & starten", neu: "neu", nichtGesetzt: "nicht eingerichtet", erledigtKurz: "erledigt", offen: "offen",
    eingerichtet: "eingerichtet", aus: "aus",

    t_sprache: "Willkommen bei pinn. 👋",
    i_sprache: "Wähle die Sprache für die Einrichtung. Sie gilt danach auch für pinn. auf diesem Gerät – jedes Profil kann später seine eigene Sprache wählen.",

    t_start: "Das brauchst du",
    i_start: "In etwa 20–30 Minuten ist pinn. fertig eingerichtet. Jeder Schritt wird beim Tippen auf „Weiter“ gespeichert – du kannst also jederzeit unterbrechen und später an derselben Stelle weitermachen.",
    l_start: [
      "Zugang zu deinem Router (bei der FRITZ!Box: das Kennwort von der Unterseite der Box oder dein eigenes)",
      "dieses Gerät im Heimnetz (WLAN) – am einfachsten ein Computer, ein Handy geht aber auch",
      "ein Konto bei Google, GitHub oder Reddit für den kostenlosen Dienst DuckDNS",
      "optional: ein Google-Konto für Android-Kalender und die KI",
    ],

    t_netz: "Heimnetz: Adresse des NAS",
    i_netz: "pinn. muss wissen, unter welcher Adresse dein NAS im Heimnetz zu finden ist. Damit sich diese Adresse nie ändert, merkt sich der Router sie fest.",
    L_NAS_IP: "IP-Adresse des NAS",
    g_netz: [
      "Schau oben in die Adresszeile deines Browsers: Steht dort etwas wie `http://192.168.178.20:8090`, ist die Zahl vor dem Doppelpunkt schon die IP-Adresse des NAS.",
      "Sonst in der FRITZ!Box nachsehen: im Browser [fritz.box](http://fritz.box) öffnen und mit dem FRITZ!Box-Kennwort anmelden.",
      "Links „Heimnetz“ → „Netzwerk“ → Reiter „Netzwerkverbindungen“ öffnen.",
      "Dein NAS in der Liste suchen (meist „UGREEN…“ oder „DXP…“) und rechts auf den Stift (Bearbeiten) tippen.",
      "Die IPv4-Adresse notieren und den Haken „Diesem Netzwerkgerät immer die gleiche IPv4-Adresse zuweisen“ setzen → „Übernehmen“.",
      "Anderer Router: Menü „Heimnetz“, „LAN“ oder „DHCP“ – dort heißt es oft „Adresse reservieren“ oder „statische IP“. In der UGREEN-App steht die Adresse unter Systemsteuerung → Netzwerk.",
    ],

    t_duckdns: "Deine Adresse mit HTTPS (DuckDNS)",
    i_duckdns: "DuckDNS ist ein kostenloser Dienst, der pinn. eine feste Adresse samt Sicherheitszertifikat gibt. Das braucht pinn. für Push-Nachrichten, die App auf dem Home-Bildschirm und die Google-Anmeldung. Eine Portfreigabe im Router ist dafür nicht nötig – pinn. bleibt von außen unsichtbar.",
    L_DUCKDNS_SUBDOMAIN: "Subdomain (frei wählbarer Name)", L_DUCKDNS_TOKEN: "DuckDNS-Token", L_PINN_ADRESSE: "Adresse von pinn.",
    g_duckdns: [
      "[duckdns.org](https://www.duckdns.org) öffnen.",
      "Oben rechts mit einem der angebotenen Konten anmelden (z. B. Google, GitHub oder Reddit) – ein eigenes Passwort gibt es bei DuckDNS nicht.",
      "Im Feld „sub domain“ einen Namen eintippen, z. B. `familie-meier` (nur Kleinbuchstaben, Ziffern und Bindestrich), und „add domain“ tippen. Ist der Name schon vergeben, einen anderen probieren.",
      "Oben auf der Seite steht dein „token“ – eine lange Zeichenkette mit Bindestrichen. Markieren und kopieren.",
      "Subdomain und Token hier einfügen und „Prüfen“ tippen. Die Adresse deines NAS trägt pinn. bei DuckDNS selbst ein – das Feld „current ip“ auf der Webseite musst du nicht ändern.",
      "Der Token ist wie ein Passwort – nicht weitergeben. Ist das doch passiert: auf duckdns.org „recreate token“ tippen und den neuen Token hier eintragen.",
    ],
    test_duckdns_ok: "DuckDNS hat die Adresse übernommen ✓ – {0} zeigt jetzt auf dein NAS ({1}).",
    test_duckdns_ko: "DuckDNS lehnt ab. Bitte Subdomain und Token prüfen – die Subdomain muss in deinem DuckDNS-Konto angelegt sein.",
    test_duckdns_netz: "duckdns.org ist vom NAS aus nicht erreichbar. Hat das NAS Internet?",
    test_duckdns_fehlt: "Bitte Subdomain und Token eintragen.",
    test_duckdns_ungueltig: "Subdomain oder Token sehen nicht richtig aus.",
    test_duckdns_ip_fehlt: "Bitte zuerst im Schritt „Heimnetz“ die IP-Adresse des NAS eintragen.",

    t_rebind: "Router: DNS-Rebind-Schutz",
    i_rebind: "Deine pinn.-Adresse zeigt auf ein Gerät in deinem Heimnetz. Viele Router – auch die FRITZ!Box – blockieren das zum Schutz. Dann öffnet sich pinn. über die Adresse nicht. Eine Ausnahme für genau diese Adresse löst das:",
    g_rebind: [
      "[fritz.box](http://fritz.box) öffnen und anmelden.",
      "„Heimnetz“ → „Netzwerk“ → Reiter „Netzwerkeinstellungen“.",
      "Ganz nach unten scrollen und „weitere Einstellungen“ aufklappen.",
      "Im Abschnitt „DNS-Rebind-Schutz“ bei „Hostnamen-Ausnahmen“ diese Zeile eintragen: `{SUB}.duckdns.org`",
      "„Übernehmen“ tippen und – falls die FRITZ!Box danach fragt – an der Box bestätigen.",
      "Anderer Router: in den Einstellungen nach „DNS Rebind“ oder „Rebind-Schutz“ suchen und dieselbe Adresse als Ausnahme eintragen. Gibt es so eine Einstellung nicht, ist meist nichts zu tun.",
    ],
    rebindErledigt: "Erledigt – die Ausnahme ist eingetragen",

    t_fern: "Unterwegs nutzen (VPN)",
    i_fern: "pinn. ist absichtlich nicht offen im Internet. Unterwegs verbindet sich das Handy per VPN sicher mit eurem Zuhause – so, als wärt ihr im WLAN. Wie möchtest du das machen?",
    c_wg: "FRITZ!Box mit WireGuard", c_wg_d: "Empfohlen, wenn du eine FRITZ!Box mit FRITZ!OS 7.50 oder neuer hast. Kostenlos, kein weiteres Konto nötig.",
    c_ts: "Tailscale", c_ts_d: "Für andere Router – oder wenn WireGuard nicht klappt (z. B. bei DS-Lite-Anschlüssen). Braucht ein kostenloses Konto bei tailscale.com.",
    c_kein: "Nur zu Hause", c_kein_d: "pinn. nur im eigenen WLAN nutzen. Lässt sich jederzeit nachholen.",
    L_TS_AUTHKEY: "Tailscale-Schlüssel (Auth key)",
    g_wireguard: [
      "[fritz.box](http://fritz.box) öffnen und anmelden. Unter „System“ → „Update“ muss FRITZ!OS 7.50 oder neuer stehen (sonst dort aktualisieren).",
      "„Internet“ → „Freigaben“ → Reiter „VPN (WireGuard)“ → „Verbindung hinzufügen“.",
      "„Vereinfachte Einrichtung (empfohlen)“ wählen → „Weiter“. Bei der Frage, ob ein einzelnes Gerät verbunden werden soll, „Ja“ wählen.",
      "Einen Namen für das Handy eingeben (z. B. `Handy Anna`) → „Fertigstellen“. Fragt die FRITZ!Box nach einer Bestätigung: eine Taste an der Box drücken bzw. am Telefon bestätigen.",
      "Fragt die FRITZ!Box nach einem MyFRITZ!-Konto: kostenlos einrichten – damit findet das Handy eure Box auch unterwegs.",
      "Es erscheint ein QR-Code. Auf dem Handy die App „WireGuard“ installieren: [iPhone](https://apps.apple.com/app/wireguard/id1441195209) · [Android](https://play.google.com/store/apps/details?id=com.wireguard.android).",
      "In der WireGuard-App auf „+“ tippen → „QR-Code scannen“ (iPhone: „Aus QR-Code erstellen“) → den Code auf dem Bildschirm scannen → Namen vergeben → das Hinzufügen der VPN-Konfiguration erlauben.",
      "Test: WLAN am Handy ausschalten, in WireGuard den Schalter einschalten und {ADRESSE} öffnen.",
      "Für jedes weitere Handy die Schritte ab „Verbindung hinzufügen“ wiederholen – jedes Gerät bekommt eine eigene Verbindung.",
    ],
    wgNurPinnT: "Nur pinn. freigeben (z. B. für Verwandte)",
    wgNurPinn: "Soll ein Gerät über das VPN nur pinn. erreichen und nicht euer ganzes Heimnetz: in der WireGuard-App die Verbindung antippen → „Bearbeiten“ → bei „Zulässige IPs“ alles ersetzen durch `{NAS_IP}/32, {ROUTER_IP}/32` → „Sichern“. Die zweite Adresse ist der Router (für die Namensauflösung). Hinweis: Die Einschränkung gilt auf diesem Gerät.",
    wgDsLite: "Klappt es unterwegs nicht? Manche Anschlüsse (DS-Lite, oft bei Kabel und Glasfaser) haben keine eigene IPv4-Adresse – dann funktioniert WireGuard nur, wenn das Handy unterwegs IPv6 hat. Nimm in diesem Fall Tailscale.",
    g_tailscale: [
      "[login.tailscale.com](https://login.tailscale.com/start) öffnen und ein kostenloses Konto anlegen (z. B. mit Google, Microsoft oder Apple anmelden).",
      "In der Verwaltung oben „Settings“ → links „Keys“ → „Generate auth key…“.",
      "Voreinstellungen lassen → „Generate key“ → den Schlüssel (beginnt mit `tskey-auth-`) kopieren und oben einfügen.",
      "„Weiter“ tippen. Der Container „tailscale“ auf dem NAS meldet sich damit innerhalb einer Minute an.",
      "Zurück in der Tailscale-Verwaltung: Reiter „Machines“ → beim Gerät „pinn“ auf „…“ → „Edit route settings…“ → Haken bei `{NAS_IP}/32` setzen → „Save“.",
      "Ebenfalls bei „pinn“ unter „…“ → „Disable key expiry“ wählen – sonst muss sich das NAS alle 180 Tage neu anmelden.",
      "Auf jedem Handy die App „Tailscale“ installieren ([iPhone](https://apps.apple.com/app/tailscale/id1470499037) · [Android](https://play.google.com/store/apps/details?id=com.tailscale.ipn)) und mit demselben Konto anmelden. Verwandte lädst du in der Verwaltung unter „Users“ ein.",
      "Test: WLAN am Handy ausschalten, Tailscale verbinden und {ADRESSE} öffnen.",
    ],
    keinFern: "Kein Problem – pinn. funktioniert dann im WLAN zu Hause. Den Fernzugriff kannst du jederzeit unter Hauptadmin → Einrichtung nachholen.",

    t_google: "Google: Android-Kalender & Kontakte",
    i_google: "Optional. Nötig, wenn ihr Google-Kalender (Android) oder Geburtstage aus Google-Kontakten in pinn. sehen wollt. Wird einmal für den ganzen Server eingerichtet – danach meldet sich jede Person in pinn. mit ihrem eigenen Google-Konto an. Für iPhone/iCloud ist hier nichts zu tun.",
    googleBrauchtHttps: "Für Google wird die HTTPS-Adresse aus dem Schritt „DuckDNS“ gebraucht.",
    L_REDIRECT: "Weiterleitungs-URI (für die Google Cloud Console)",
    L_PINN_GOOGLE_CLIENT_ID: "Client-ID", L_PINN_GOOGLE_CLIENT_SECRET: "Clientschlüssel (Client Secret)",
    g_google: [
      "[console.cloud.google.com](https://console.cloud.google.com) öffnen und mit einem Google-Konto anmelden (beim ersten Mal die Nutzungsbedingungen bestätigen).",
      "Oben auf die Projektauswahl tippen → „Neues Projekt“ → Name `pinn` → „Erstellen“. Danach oben das Projekt „pinn“ auswählen.",
      "Drei Schnittstellen einschalten – jeweils öffnen und „Aktivieren“ tippen: [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) · [CalDAV API](https://console.cloud.google.com/apis/library/caldav.googleapis.com) · [People API](https://console.cloud.google.com/apis/library/people.googleapis.com).",
      "[Google Auth Platform](https://console.cloud.google.com/auth/overview) öffnen → „Jetzt starten“: App-Name `pinn.`, Support-E-Mail = deine Adresse → Zielgruppe „Extern“ → Kontakt-E-Mail → zustimmen → „Erstellen“.",
      "Links „Zielgruppe“ → „App veröffentlichen“ → bestätigen. Wichtig: Im Status „Test“ läuft jede Google-Verbindung nach 7 Tagen ab.",
      "Links „Clients“ → „Client erstellen“ → Anwendungstyp „Webanwendung“, Name `pinn.`.",
      "Bei „Autorisierte Weiterleitungs-URIs“ → „URI hinzufügen“ und genau diese Adresse einfügen: `{REDIRECT}` → „Erstellen“.",
      "Client-ID und Clientschlüssel kopieren, hier einfügen und „Prüfen“ tippen. (Den Schlüssel zeigt Google nur einmal an – sonst beim Client „Secret hinzufügen“.)",
      "Beim späteren Verbinden zeigt Google „Google hat diese App nicht überprüft“. Bei eurer privaten App ist das normal: „Erweitert“ → „Weiter zu pinn.“.",
    ],
    test_google_ok: "Google kennt diesen Client ✓",
    test_google_uri: "Client-ID und Schlüssel stimmen, aber im Client fehlt die Weiterleitungs-URI: {0}",
    test_google_ungueltig: "Google kennt diese Client-ID bzw. diesen Schlüssel nicht – bitte noch einmal kopieren.",
    test_google_netz: "Google ist vom NAS aus nicht erreichbar.",
    test_google_fehlt: "Bitte Client-ID und Clientschlüssel eintragen.",

    t_ki: "KI für Rezepte (Google Gemini)",
    i_ki: "Optional. Die KI liest Rezepte aus Text, Fotos, PDFs und Links deutlich besser ein und findet euren Müllkalender. Der Schlüssel ist kostenlos und bleibt auf dem NAS – die Apps sprechen nie direkt mit Google.",
    L_PINN_GEMINI_KEY: "Gemini-API-Schlüssel", L_PINN_GEMINI_MODELL: "Festes Modell",
    h_modell: "Leer = automatisch das aktuelle Flash-Modell.",
    g_ki: [
      "[aistudio.google.com/apikey](https://aistudio.google.com/apikey) öffnen und mit einem Google-Konto anmelden.",
      "„API-Schlüssel erstellen“ (Create API key) tippen. Fragt Google nach einem Projekt, das Projekt „pinn“ aus dem vorigen Schritt wählen oder ein neues anlegen.",
      "Den Schlüssel (beginnt meist mit `AIza`) kopieren, hier einfügen und „Prüfen“ tippen.",
      "Gut zu wissen: Im kostenlosen Kontingent darf Google die übermittelten Rezepttexte zur Verbesserung seiner Dienste verwenden.",
    ],
    test_gemini_ok: "Schlüssel gültig ✓",
    test_gemini_ungueltig: "Google lehnt den Schlüssel ab – bitte noch einmal kopieren.",
    test_gemini_gesperrt: "Der Schlüssel ist für die Gemini-Schnittstelle gesperrt. Bitte in AI Studio einen neuen Schlüssel erstellen.",
    test_gemini_netz: "Google ist vom NAS aus nicht erreichbar.",
    test_gemini_fehlt: "Bitte den Schlüssel eintragen.",

    t_ortung: "Ortung (Familie → Live-Standorte)",
    i_ortung: "Optional. Handys teilen ihren Standort direkt in pinn. – dafür musst du hier nichts eintragen. Den Container „traccar“ braucht es nur für GPS-Tracker mit SIM-Karte.",
    l_ortung: [
      "Standort teilen geht direkt in pinn. (Familie → Ortung). Damit er auch bei geschlossenem pinn. kommt, installiert man die App „Traccar Client“ – sie sendet direkt an pinn.",
      "Server-Adresse und Geräte-ID zeigt pinn. später je Person unter Familie → ⚙︎ Ortung an.",
      "Unterwegs braucht das Handy dafür das VPN aus dem Schritt „Unterwegs nutzen“.",
      "GPS-Tracker mit SIM-Karte (z. B. am Hundehalsband) senden aus dem Mobilfunknetz – dafür braucht es eine Portfreigabe im Router. Die Anleitung zeigt pinn. beim Hinzufügen des Trackers.",
    ],
    appTraccar: "App „Traccar Client“:",
    h_traccar: "Nur ausfüllen, wenn du in Traccar schon selbst ein Konto angelegt hast. Leer = pinn. legt selbst eins an.",
    L_PINN_TRACCAR_EMAIL: "Traccar-E-Mail", L_PINN_TRACCAR_PASSWORT: "Traccar-Passwort",
    test_traccar_ok: "Traccar läuft ✓",
    test_traccar_aus: "Der Container „traccar“ läuft nicht – für Handys nicht nötig. Nur für GPS-Tracker: in der .env COMPOSE_PROFILES=tracker eintragen.",

    t_ha: "Smarthome: Home Assistant",
    i_ha: "Optional. Wo läuft euer Home Assistant?",
    c_ha_kein: "Kein Home Assistant",
    c_ha_geraet: "Auf einem eigenen Gerät", c_ha_geraet_d: "z. B. Raspberry Pi oder Home Assistant Green.",
    c_ha_vm: "Als virtuelle Maschine auf diesem NAS", c_ha_vm_d: "Dann richtet pinn. einen kleinen Umweg im Netzwerk ein – sonst erreicht das NAS die VM nicht.",
    haGeraetInfo: "Hier ist nichts einzutragen. Die Verbindung richtet jede Familie in pinn. unter Einstellungen → Smarthome ein.",
    L_HA_IP: "IP-Adresse von Home Assistant", L_HILFS_IP: "Freie Hilfs-Adresse", L_NAS_NETZWERKKARTE: "Netzwerkkarte des NAS",
    h_karte: "„auto“ = pinn. erkennt die Netzwerkkarte selbst.",
    g_ha: [
      "IP von Home Assistant: in Home Assistant „Einstellungen“ → „System“ → „Netzwerk“ – oder in der FRITZ!Box unter „Heimnetz“ → „Netzwerk“ das Gerät „homeassistant“ suchen. Dort auch „immer die gleiche IPv4-Adresse zuweisen“ setzen.",
      "Hilfs-Adresse: eine Adresse im Heimnetz, die kein Gerät benutzt und die der Router nie vergibt. In der FRITZ!Box steht unter „Heimnetz“ → „Netzwerk“ → „Netzwerkeinstellungen“ → „IPv4-Einstellungen“, welchen Bereich der Router vergibt (z. B. .20 bis .200). Eine Adresse darüber nehmen, z. B. `{VORSCHLAG}`.",
      "„Weiter“ tippen – der Container „ha-netz“ richtet den Umweg innerhalb einer Minute ein. Mit „Prüfen“ siehst du, ob pinn. Home Assistant erreicht.",
      "Den Zugangs-Token für Home Assistant trägt jede Familie später in pinn. unter Einstellungen → Smarthome ein.",
    ],
    haAktiv: "Umweg aktiv über {0} (Hilfs-Adresse {1}) ✓", haWartet: "Der Umweg wartet auf die Einstellungen.", haFehler: "Der Umweg konnte nicht eingerichtet werden (Netzwerkkarte: {0}).",
    test_homeassistant_ok: "Home Assistant ist erreichbar ✓",
    test_homeassistant_aus: "Home Assistant ist (noch) nicht erreichbar. Nach „Weiter“ bis zu einer Minute warten und erneut prüfen.",
    test_homeassistant_fehlt: "Bitte die IP-Adresse von Home Assistant eintragen.",

    t_apps: "Apps & Geräte",
    i_apps: "Fast geschafft! Das brauchen die Familienmitglieder auf ihren Handys:",
    a_home_t: "pinn. auf den Home-Bildschirm (für alle)",
    a_home: [
      "iPhone/iPad: {ADRESSE} in Safari öffnen → Teilen-Symbol (Quadrat mit Pfeil) → „Zum Home-Bildschirm“ → „Hinzufügen“. Nur so gibt es Push-Nachrichten (ab iOS 16.4).",
      "Android: {ADRESSE} in Chrome öffnen → ⋮ oben rechts → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.",
      "Immer die https-Adresse nehmen – nicht die Adresse mit :8090.",
    ],
    a_vpn: "Für unterwegs – Einrichtung siehe Schritt „Unterwegs nutzen“:",
    a_traccar: "Nur für die Ortung:",
    a_icloud_t: "iCloud-Kalender (iPhone)",
    a_icloud: "Jede Familie verbindet ihren iCloud-Kalender selbst in pinn. unter Einstellungen → Kalender. Dafür braucht es ein app-spezifisches Passwort: [account.apple.com](https://account.apple.com) → „Anmeldung und Sicherheit“ → „App-spezifische Passwörter“ → „+“ → Name `pinn.` → das angezeigte Passwort (xxxx-xxxx-xxxx-xxxx) in pinn. eintragen.",
    a_push_t: "Push-Nachrichten",
    a_push: "Jede Person schaltet sie in pinn. unter Einstellungen → Benachrichtigungen → „Auf diesem Gerät aktivieren“ ein – am iPhone nur in der App vom Home-Bildschirm.",

    t_fertig: "Zusammenfassung",
    i_fertig: "Prüfe die Angaben. Mit „Speichern & starten“ übernimmt pinn. alles und startet einmal kurz neu (etwa 10–20 Sekunden).",
    S_ADRESSE: "Adresse", S_REBIND: "DNS-Rebind-Ausnahme", S_FERN: "Unterwegs", S_KI: "KI", S_ORTUNG: "Ortung",
    L_PINN_PUSH_KONTAKT: "Kontakt für Push-Dienste",
    h_push: "Apple und Google verlangen für Push-Nachrichten eine Kontaktadresse (E-Mail). Leer = pinn. nimmt die eigene Adresse.",
    neustart: "pinn. startet neu …", neustartOk: "neu gestartet ✓", neustartFehler: "pinn. meldet sich nicht zurück. Bitte in ein bis zwei Minuten neu laden.",
    pruefeHttps: "HTTPS wird geprüft …", pruefeAlles: "Alles wird geprüft …",
    zertifikatDauert: "Das Sicherheitszertifikat wird beim ersten Mal geholt – das kann 1–2 Minuten dauern …",
    httpsOk: "{0} ist erreichbar ✓",
    httpsFehler: "{0} antwortet noch nicht. Häufige Ursachen: DNS-Rebind-Schutz im Router (Schritt 5), dieses Gerät ist nicht im Heimnetz, oder das Zertifikat braucht noch etwas. Später mit „Erneut prüfen“ testen.",
    httpsAus: "Keine HTTPS-Adresse eingerichtet (Schritt DuckDNS).",
    t_geschafft: "Geschafft! 🎉",
    geschafftText: "pinn. ist eingerichtet. Öffne pinn. ab jetzt über diese Adresse und speichere sie auf allen Handys (siehe „Apps & Geräte“). Als Nächstes legst du in der Familienverwaltung deine erste Familie an.",
    nochmalPruefen: "Erneut prüfen", zurVerwaltung: "Zur Familienverwaltung",
  };
  T.en = {
    titel: "Setup", lade: "Loading setup …",
    weiter: "Next", zurueck: "Back", ueberspringen: "Skip", spaeter: "Later", schliessen: "Close",
    pruefen: "Check", pruefe: "Checking …", speichere: "Saving …", kopieren: "Copy", kopiert: "Copied ✓",
    anleitung: "Step-by-step guide", optional: "optional", erweitert: "Advanced", zeigen: "Show",
    gespeichertGeheim: "saved: ••••{0}", leerLassen: "leave empty = unchanged", ausEnv: "Value from the .env or docker-compose.yaml",
    entfernen: "Remove", wirdEntfernt: "will be removed when saving", entfernenFrage: "Remove this saved value?",
    schritt: "Step {0} of {1}", fehlerFeld: "Please check “{0}”.", fehler: "That didn't work.", ok: "OK ✓",
    fehlerNetz: "No connection to pinn. – please make sure you are on your home network.",
    ordnerFehlt: "The “konfig” folder is missing on the NAS. Please use the new docker-compose.yaml and run the pinn-setup.sh script (or “docker compose up -d”). Without this folder the setup cannot save anything.",
    ordnerSchreibschutz: "The “konfig” folder is read-only – please run pinn-setup.sh again.",
    serverFehlt: "einrichtung.pb.js and pinn-einrichtung.js (pb_hooks) are still missing on the server.",
    erkannt: "Detected from the address bar: {0}", deineAdresse: "Your pinn. address:", ph_sub: "e.g. smith-family",
    L_PORT: "HTTPS port", h_port: "Only change this if you changed port 8443 in the docker-compose.yaml.",
    pflichtInfo: "Only “Home network” and “DuckDNS” are required. You can skip everything else and come back any time: Main admin → Setup.",
    serverOk: "pinn. is running and can save the settings ✓",
    schonFertig: "Setup has already been completed. You can check and change everything – apply it at the end with “Save & start”.",
    bitteWaehlen: "Please choose an option (or “Skip”).",
    skipPflicht: "Without this step, HTTPS, push notifications and the home screen app won't work. Skip anyway?",
    pflichtFehlt: "Please fill in the fields – or tap “Skip”.",
    speichernStarten: "Save & start", neu: "new", nichtGesetzt: "not set up", erledigtKurz: "done", offen: "open",
    eingerichtet: "set up", aus: "off",

    t_sprache: "Welcome to pinn. 👋",
    i_sprache: "Choose the language for the setup. It will also be used for pinn. on this device – every profile can pick its own language later.",

    t_start: "What you need",
    i_start: "pinn. will be fully set up in about 20–30 minutes. Each step is saved when you tap “Next” – so you can stop at any time and continue where you left off.",
    l_start: [
      "Access to your router (for a FRITZ!Box: the password on the bottom of the box or your own)",
      "this device on your home network (Wi-Fi) – a computer is easiest, but a phone works too",
      "a Google, GitHub or Reddit account for the free DuckDNS service",
      "optional: a Google account for Android calendars and the AI",
    ],

    t_netz: "Home network: NAS address",
    i_netz: "pinn. needs to know the address of your NAS on your home network. So that this address never changes, the router reserves it permanently.",
    L_NAS_IP: "IP address of the NAS",
    g_netz: [
      "Look at your browser's address bar: if it shows something like `http://192.168.178.20:8090`, the number before the colon is already the NAS's IP address.",
      "Otherwise check your FRITZ!Box: open [fritz.box](http://fritz.box) in the browser and log in with the FRITZ!Box password.",
      "On the left open “Home Network” → “Network” → tab “Network Connections”.",
      "Find your NAS in the list (usually “UGREEN…” or “DXP…”) and tap the pencil (edit) on the right.",
      "Note the IPv4 address and tick “Always assign this network device the same IPv4 address” → “Apply”.",
      "Other routers: look for “Home network”, “LAN” or “DHCP” – it's often called “reserve address” or “static IP”. In the UGREEN app you'll find the address under Control Panel → Network.",
    ],

    t_duckdns: "Your address with HTTPS (DuckDNS)",
    i_duckdns: "DuckDNS is a free service that gives pinn. a fixed address including a security certificate. pinn. needs it for push notifications, the home screen app and Google sign-in. No port forwarding is required – pinn. stays invisible from the outside.",
    L_DUCKDNS_SUBDOMAIN: "Subdomain (any name you like)", L_DUCKDNS_TOKEN: "DuckDNS token", L_PINN_ADRESSE: "pinn. address",
    g_duckdns: [
      "Open [duckdns.org](https://www.duckdns.org).",
      "Sign in at the top right with one of the offered accounts (e.g. Google, GitHub or Reddit) – DuckDNS has no password of its own.",
      "Type a name into the “sub domain” field, e.g. `smith-family` (lowercase letters, digits and hyphens only), and tap “add domain”. If the name is taken, try another one.",
      "At the top of the page you'll see your “token” – a long string with hyphens. Select and copy it.",
      "Paste subdomain and token here and tap “Check”. pinn. registers your NAS's address with DuckDNS itself – you don't need to change the “current ip” field on the website.",
      "The token is like a password – don't share it. If that happened: tap “recreate token” on duckdns.org and enter the new token here.",
    ],
    test_duckdns_ok: "DuckDNS accepted the address ✓ – {0} now points to your NAS ({1}).",
    test_duckdns_ko: "DuckDNS refused. Please check subdomain and token – the subdomain must exist in your DuckDNS account.",
    test_duckdns_netz: "duckdns.org cannot be reached from the NAS. Does the NAS have internet access?",
    test_duckdns_fehlt: "Please enter subdomain and token.",
    test_duckdns_ungueltig: "Subdomain or token don't look right.",
    test_duckdns_ip_fehlt: "Please enter the NAS's IP address in the “Home network” step first.",

    t_rebind: "Router: DNS rebind protection",
    i_rebind: "Your pinn. address points to a device on your home network. Many routers – including the FRITZ!Box – block this for protection. Then pinn. won't open via the address. An exception for exactly this address solves it:",
    g_rebind: [
      "Open [fritz.box](http://fritz.box) and log in.",
      "“Home Network” → “Network” → tab “Network Settings”.",
      "Scroll all the way down and expand “additional settings”.",
      "In the “DNS Rebind Protection” section, enter this line under “Host name exceptions”: `{SUB}.duckdns.org`",
      "Tap “Apply” and – if the FRITZ!Box asks – confirm on the box.",
      "Other routers: search the settings for “DNS rebind” and enter the same address as an exception. If there's no such setting, there's usually nothing to do.",
    ],
    rebindErledigt: "Done – the exception has been added",

    t_fern: "Use on the go (VPN)",
    i_fern: "pinn. is deliberately not open to the internet. On the go, the phone connects securely to your home via VPN – as if you were on your Wi-Fi. How would you like to do this?",
    c_wg: "FRITZ!Box with WireGuard", c_wg_d: "Recommended if you have a FRITZ!Box with FRITZ!OS 7.50 or later. Free, no additional account needed.",
    c_ts: "Tailscale", c_ts_d: "For other routers – or if WireGuard doesn't work (e.g. with DS-Lite connections). Requires a free account at tailscale.com.",
    c_kein: "Only at home", c_kein_d: "Use pinn. on your home Wi-Fi only. Can be added at any time.",
    L_TS_AUTHKEY: "Tailscale key (auth key)",
    g_wireguard: [
      "Open [fritz.box](http://fritz.box) and log in. Under “System” → “Update” it must say FRITZ!OS 7.50 or later (update there if not).",
      "“Internet” → “Permit Access” → tab “VPN (WireGuard)” → “Add connection”.",
      "Choose “Simplified setup (recommended)” → “Next”. When asked whether a single device should be connected, choose “Yes”.",
      "Enter a name for the phone (e.g. `Anna's phone`) → “Finish”. If the FRITZ!Box asks for confirmation: press a button on the box or confirm on the phone.",
      "If the FRITZ!Box asks for a MyFRITZ! account: set it up for free – that's how the phone finds your box on the go.",
      "A QR code appears. Install the “WireGuard” app on the phone: [iPhone](https://apps.apple.com/app/wireguard/id1441195209) · [Android](https://play.google.com/store/apps/details?id=com.wireguard.android).",
      "In the WireGuard app tap “+” → “Scan from QR code” (iPhone: “Create from QR code”) → scan the code on the screen → give it a name → allow adding the VPN configuration.",
      "Test: turn off Wi-Fi on the phone, switch WireGuard on and open {ADRESSE}.",
      "Repeat the steps from “Add connection” for every other phone – each device gets its own connection.",
    ],
    wgNurPinnT: "Allow only pinn. (e.g. for relatives)",
    wgNurPinn: "If a device should only reach pinn. via the VPN and not your whole home network: in the WireGuard app tap the connection → “Edit” → under “Allowed IPs” replace everything with `{NAS_IP}/32, {ROUTER_IP}/32` → “Save”. The second address is the router (for name resolution). Note: the restriction applies on that device.",
    wgDsLite: "Doesn't work on the go? Some connections (DS-Lite, common with cable and fibre) have no IPv4 address of their own – then WireGuard only works if the phone has IPv6 on the go. Use Tailscale in that case.",
    g_tailscale: [
      "Open [login.tailscale.com](https://login.tailscale.com/start) and create a free account (e.g. sign in with Google, Microsoft or Apple).",
      "In the admin console, “Settings” at the top → “Keys” on the left → “Generate auth key…”.",
      "Keep the defaults → “Generate key” → copy the key (starts with `tskey-auth-`) and paste it above.",
      "Tap “Next”. The “tailscale” container on the NAS uses it to sign in within a minute.",
      "Back in the Tailscale admin console: tab “Machines” → on the device “pinn” tap “…” → “Edit route settings…” → tick `{NAS_IP}/32` → “Save”.",
      "Also on “pinn” under “…” → choose “Disable key expiry” – otherwise the NAS has to sign in again every 180 days.",
      "Install the “Tailscale” app on every phone ([iPhone](https://apps.apple.com/app/tailscale/id1470499037) · [Android](https://play.google.com/store/apps/details?id=com.tailscale.ipn)) and sign in with the same account. Invite relatives under “Users” in the admin console.",
      "Test: turn off Wi-Fi on the phone, connect Tailscale and open {ADRESSE}.",
    ],
    keinFern: "No problem – pinn. then works on your home Wi-Fi. You can add remote access any time under Main admin → Setup.",

    t_google: "Google: Android calendars & contacts",
    i_google: "Optional. Needed if you want to see Google calendars (Android) or birthdays from Google contacts in pinn. It's set up once for the whole server – afterwards each person signs in to pinn. with their own Google account. Nothing to do here for iPhone/iCloud.",
    googleBrauchtHttps: "Google needs the HTTPS address from the “DuckDNS” step.",
    L_REDIRECT: "Redirect URI (for the Google Cloud Console)",
    L_PINN_GOOGLE_CLIENT_ID: "Client ID", L_PINN_GOOGLE_CLIENT_SECRET: "Client secret",
    g_google: [
      "Open [console.cloud.google.com](https://console.cloud.google.com) and sign in with a Google account (accept the terms of service the first time).",
      "Tap the project picker at the top → “New project” → name `pinn` → “Create”. Then select the project “pinn” at the top.",
      "Enable three APIs – open each one and tap “Enable”: [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) · [CalDAV API](https://console.cloud.google.com/apis/library/caldav.googleapis.com) · [People API](https://console.cloud.google.com/apis/library/people.googleapis.com).",
      "Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) → “Get started”: app name `pinn.`, support email = your address → audience “External” → contact email → agree → “Create”.",
      "On the left “Audience” → “Publish app” → confirm. Important: in “Testing” status every Google connection expires after 7 days.",
      "On the left “Clients” → “Create client” → application type “Web application”, name `pinn.`.",
      "Under “Authorized redirect URIs” → “Add URI” and paste exactly this address: `{REDIRECT}` → “Create”.",
      "Copy client ID and client secret, paste them here and tap “Check”. (Google shows the secret only once – otherwise use “Add secret” on the client.)",
      "When connecting later, Google shows “Google hasn't verified this app”. That's normal for your private app: “Advanced” → “Go to pinn.”.",
    ],
    test_google_ok: "Google knows this client ✓",
    test_google_uri: "Client ID and secret are correct, but the redirect URI is missing in the client: {0}",
    test_google_ungueltig: "Google doesn't recognise this client ID or secret – please copy them again.",
    test_google_netz: "Google cannot be reached from the NAS.",
    test_google_fehlt: "Please enter client ID and client secret.",

    t_ki: "AI for recipes (Google Gemini)",
    i_ki: "Optional. The AI reads recipes from text, photos, PDFs and links much better and finds your waste collection calendar. The key is free and stays on the NAS – the apps never talk to Google directly.",
    L_PINN_GEMINI_KEY: "Gemini API key", L_PINN_GEMINI_MODELL: "Fixed model",
    h_modell: "Empty = the current Flash model automatically.",
    g_ki: [
      "Open [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a Google account.",
      "Tap “Create API key”. If Google asks for a project, choose the project “pinn” from the previous step or create a new one.",
      "Copy the key (usually starts with `AIza`), paste it here and tap “Check”.",
      "Good to know: on the free tier, Google may use the submitted recipe texts to improve its services.",
    ],
    test_gemini_ok: "Key is valid ✓",
    test_gemini_ungueltig: "Google rejects the key – please copy it again.",
    test_gemini_gesperrt: "The key is blocked for the Gemini API. Please create a new key in AI Studio.",
    test_gemini_netz: "Google cannot be reached from the NAS.",
    test_gemini_fehlt: "Please enter the key.",

    t_ortung: "Location (Family → live locations)",
    i_ortung: "Optional. Phones share their location directly in pinn. – nothing to enter here. The “traccar” container is only needed for GPS trackers with a SIM card.",
    l_ortung: [
      "Location sharing works directly in pinn. (Family → Location). To keep sending while pinn. is closed, install the “Traccar Client” app – it sends straight to pinn.",
      "pinn. later shows the server address and device ID for each person under Family → ⚙︎ Location.",
      "On the go, the phone needs the VPN from the “Use on the go” step.",
      "GPS trackers with a SIM card (e.g. on a dog collar) send from the mobile network – this requires port forwarding in the router. pinn. shows the instructions when you add the tracker.",
    ],
    appTraccar: "“Traccar Client” app:",
    h_traccar: "Only fill in if you already created an account in Traccar yourself. Empty = pinn. creates one itself.",
    L_PINN_TRACCAR_EMAIL: "Traccar email", L_PINN_TRACCAR_PASSWORT: "Traccar password",
    test_traccar_ok: "Traccar is running ✓",
    test_traccar_aus: "The “traccar” container is not running – not needed for phones. Only for GPS trackers: add COMPOSE_PROFILES=tracker to the .env file.",

    t_ha: "Smart home: Home Assistant",
    i_ha: "Optional. Where does your Home Assistant run?",
    c_ha_kein: "No Home Assistant",
    c_ha_geraet: "On a separate device", c_ha_geraet_d: "e.g. Raspberry Pi or Home Assistant Green.",
    c_ha_vm: "As a virtual machine on this NAS", c_ha_vm_d: "Then pinn. sets up a small network detour – otherwise the NAS can't reach the VM.",
    haGeraetInfo: "Nothing to enter here. Each family sets up the connection in pinn. under Settings → Smart home.",
    L_HA_IP: "IP address of Home Assistant", L_HILFS_IP: "Free helper address", L_NAS_NETZWERKKARTE: "NAS network interface",
    h_karte: "“auto” = pinn. detects the network interface itself.",
    g_ha: [
      "IP of Home Assistant: in Home Assistant “Settings” → “System” → “Network” – or find the device “homeassistant” in the FRITZ!Box under “Home Network” → “Network”. Also tick “always assign the same IPv4 address” there.",
      "Helper address: an address on your home network that no device uses and the router never hands out. In the FRITZ!Box, “Home Network” → “Network” → “Network Settings” → “IPv4 settings” shows the range the router hands out (e.g. .20 to .200). Pick an address above it, e.g. `{VORSCHLAG}`.",
      "Tap “Next” – the “ha-netz” container sets up the detour within a minute. “Check” shows whether pinn. can reach Home Assistant.",
      "Each family enters the Home Assistant access token later in pinn. under Settings → Smart home.",
    ],
    haAktiv: "Detour active via {0} (helper address {1}) ✓", haWartet: "The detour is waiting for the settings.", haFehler: "The detour could not be set up (network interface: {0}).",
    test_homeassistant_ok: "Home Assistant is reachable ✓",
    test_homeassistant_aus: "Home Assistant is not reachable (yet). After “Next”, wait up to a minute and check again.",
    test_homeassistant_fehlt: "Please enter Home Assistant's IP address.",

    t_apps: "Apps & devices",
    i_apps: "Almost done! This is what family members need on their phones:",
    a_home_t: "pinn. on the home screen (for everyone)",
    a_home: [
      "iPhone/iPad: open {ADRESSE} in Safari → share icon (square with arrow) → “Add to Home Screen” → “Add”. Only this way do push notifications work (iOS 16.4 or later).",
      "Android: open {ADRESSE} in Chrome → ⋮ at the top right → “Install app” or “Add to Home screen”.",
      "Always use the https address – not the address with :8090.",
    ],
    a_vpn: "For on the go – setup see step “Use on the go”:",
    a_traccar: "Only for location tracking:",
    a_icloud_t: "iCloud calendar (iPhone)",
    a_icloud: "Each family connects its iCloud calendar itself in pinn. under Settings → Calendar. This needs an app-specific password: [account.apple.com](https://account.apple.com) → “Sign-In and Security” → “App-Specific Passwords” → “+” → name `pinn.` → enter the displayed password (xxxx-xxxx-xxxx-xxxx) in pinn.",
    a_push_t: "Push notifications",
    a_push: "Each person turns them on in pinn. under Settings → Notifications → “Activate on this device” – on iPhone only in the app from the home screen.",

    t_fertig: "Summary",
    i_fertig: "Check the details. With “Save & start”, pinn. applies everything and restarts briefly once (about 10–20 seconds).",
    S_ADRESSE: "Address", S_REBIND: "DNS rebind exception", S_FERN: "On the go", S_KI: "AI", S_ORTUNG: "Location",
    L_PINN_PUSH_KONTAKT: "Contact for push services",
    h_push: "Apple and Google require a contact address (email) for push notifications. Empty = pinn. uses its own address.",
    neustart: "pinn. is restarting …", neustartOk: "restarted ✓", neustartFehler: "pinn. isn't responding. Please reload in a minute or two.",
    pruefeHttps: "Checking HTTPS …", pruefeAlles: "Checking everything …",
    zertifikatDauert: "The security certificate is fetched the first time – this can take 1–2 minutes …",
    httpsOk: "{0} is reachable ✓",
    httpsFehler: "{0} isn't responding yet. Common causes: DNS rebind protection in the router (step 5), this device isn't on the home network, or the certificate needs a little longer. Test later with “Check again”.",
    httpsAus: "No HTTPS address set up (DuckDNS step).",
    t_geschafft: "Done! 🎉",
    geschafftText: "pinn. is set up. From now on open pinn. via this address and save it on all phones (see “Apps & devices”). Next, create your first family in the family management.",
    nochmalPruefen: "Check again", zurVerwaltung: "To family management",
  };
  T.fr = {
    titel: "Configuration", lade: "Chargement de la configuration …",
    weiter: "Suivant", zurueck: "Retour", ueberspringen: "Passer", spaeter: "Plus tard", schliessen: "Fermer",
    pruefen: "Vérifier", pruefe: "Vérification …", speichere: "Enregistrement …", kopieren: "Copier", kopiert: "Copié ✓",
    anleitung: "Guide pas à pas", optional: "facultatif", erweitert: "Avancé", zeigen: "Afficher",
    gespeichertGeheim: "enregistré : ••••{0}", leerLassen: "laisser vide = inchangé", ausEnv: "Valeur issue du .env ou du docker-compose.yaml",
    entfernen: "Supprimer", wirdEntfernt: "sera supprimé à l'enregistrement", entfernenFrage: "Supprimer cette valeur enregistrée ?",
    schritt: "Étape {0} sur {1}", fehlerFeld: "Veuillez vérifier « {0} ».", fehler: "Cela n'a pas fonctionné.", ok: "OK ✓",
    fehlerNetz: "Pas de connexion à pinn. – vérifiez que vous êtes sur le réseau domestique.",
    ordnerFehlt: "Le dossier « konfig » est absent du NAS. Utilisez le nouveau docker-compose.yaml et lancez le script pinn-setup.sh (ou « docker compose up -d »). Sans ce dossier, la configuration ne peut rien enregistrer.",
    ordnerSchreibschutz: "Le dossier « konfig » est en lecture seule – relancez pinn-setup.sh.",
    serverFehlt: "einrichtung.pb.js et pinn-einrichtung.js (pb_hooks) manquent encore sur le serveur.",
    erkannt: "Détecté dans la barre d'adresse : {0}", deineAdresse: "Votre adresse pinn. :", ph_sub: "p. ex. famille-martin",
    L_PORT: "Port HTTPS", h_port: "À modifier uniquement si vous avez changé le port 8443 dans le docker-compose.yaml.",
    pflichtInfo: "Seules les étapes « Réseau domestique » et « DuckDNS » sont obligatoires. Tout le reste peut être passé et repris à tout moment : Administrateur principal → Configuration.",
    serverOk: "pinn. fonctionne et peut enregistrer les réglages ✓",
    schonFertig: "La configuration est déjà terminée. Vous pouvez tout vérifier et modifier – puis valider à la fin avec « Enregistrer et démarrer ».",
    bitteWaehlen: "Veuillez choisir une option (ou « Passer »).",
    skipPflicht: "Sans cette étape, HTTPS, les notifications push et l'app sur l'écran d'accueil ne fonctionnent pas. Passer quand même ?",
    pflichtFehlt: "Veuillez remplir les champs – ou « Passer ».",
    speichernStarten: "Enregistrer et démarrer", neu: "nouveau", nichtGesetzt: "non configuré", erledigtKurz: "fait", offen: "à faire",
    eingerichtet: "configuré", aus: "désactivé",

    t_sprache: "Bienvenue dans pinn. 👋",
    i_sprache: "Choisissez la langue de la configuration. Elle s'appliquera aussi à pinn. sur cet appareil – chaque profil pourra choisir sa propre langue plus tard.",

    t_start: "Ce dont vous avez besoin",
    i_start: "En 20 à 30 minutes environ, pinn. est entièrement configuré. Chaque étape est enregistrée en touchant « Suivant » – vous pouvez donc vous arrêter à tout moment et reprendre au même endroit.",
    l_start: [
      "l'accès à votre box/routeur (pour une FRITZ!Box : le mot de passe sous la box ou le vôtre)",
      "cet appareil sur le réseau domestique (Wi-Fi) – un ordinateur est le plus simple, mais un téléphone convient aussi",
      "un compte Google, GitHub ou Reddit pour le service gratuit DuckDNS",
      "facultatif : un compte Google pour les agendas Android et l'IA",
    ],

    t_netz: "Réseau domestique : adresse du NAS",
    i_netz: "pinn. doit connaître l'adresse de votre NAS sur le réseau domestique. Pour qu'elle ne change jamais, le routeur la réserve de façon fixe.",
    L_NAS_IP: "Adresse IP du NAS",
    g_netz: [
      "Regardez la barre d'adresse de votre navigateur : si elle affiche par exemple `http://192.168.178.20:8090`, le nombre avant les deux-points est déjà l'adresse IP du NAS.",
      "Sinon, vérifiez dans la FRITZ!Box : ouvrez [fritz.box](http://fritz.box) dans le navigateur et connectez-vous avec le mot de passe de la FRITZ!Box.",
      "À gauche, ouvrez « Réseau domestique » → « Réseau » → onglet « Connexions réseau ».",
      "Cherchez votre NAS dans la liste (souvent « UGREEN… » ou « DXP… ») et touchez le crayon (modifier) à droite.",
      "Notez l'adresse IPv4 et cochez « Toujours attribuer la même adresse IPv4 à cet appareil » → « Appliquer ».",
      "Autre routeur : menu « Réseau local », « LAN » ou « DHCP » – on parle souvent de « réserver une adresse » ou d'« IP statique ». Dans l'app UGREEN, l'adresse se trouve sous Panneau de configuration → Réseau.",
    ],

    t_duckdns: "Votre adresse avec HTTPS (DuckDNS)",
    i_duckdns: "DuckDNS est un service gratuit qui donne à pinn. une adresse fixe avec certificat de sécurité. pinn. en a besoin pour les notifications push, l'app sur l'écran d'accueil et la connexion Google. Aucune redirection de port n'est nécessaire – pinn. reste invisible depuis l'extérieur.",
    L_DUCKDNS_SUBDOMAIN: "Sous-domaine (nom au choix)", L_DUCKDNS_TOKEN: "Jeton DuckDNS", L_PINN_ADRESSE: "Adresse de pinn.",
    g_duckdns: [
      "Ouvrez [duckdns.org](https://www.duckdns.org).",
      "Connectez-vous en haut à droite avec l'un des comptes proposés (p. ex. Google, GitHub ou Reddit) – DuckDNS n'a pas de mot de passe propre.",
      "Saisissez un nom dans le champ « sub domain », p. ex. `famille-martin` (minuscules, chiffres et tirets uniquement), puis touchez « add domain ». Si le nom est pris, essayez-en un autre.",
      "En haut de la page figure votre « token » – une longue chaîne avec des tirets. Sélectionnez-la et copiez-la.",
      "Collez ici le sous-domaine et le jeton puis touchez « Vérifier ». pinn. inscrit lui-même l'adresse de votre NAS chez DuckDNS – inutile de modifier le champ « current ip » sur le site.",
      "Le jeton est comme un mot de passe – ne le partagez pas. Si c'est arrivé : touchez « recreate token » sur duckdns.org et saisissez le nouveau jeton ici.",
    ],
    test_duckdns_ok: "DuckDNS a enregistré l'adresse ✓ – {0} pointe désormais vers votre NAS ({1}).",
    test_duckdns_ko: "DuckDNS refuse. Vérifiez le sous-domaine et le jeton – le sous-domaine doit exister dans votre compte DuckDNS.",
    test_duckdns_netz: "duckdns.org est injoignable depuis le NAS. Le NAS a-t-il accès à Internet ?",
    test_duckdns_fehlt: "Veuillez saisir le sous-domaine et le jeton.",
    test_duckdns_ungueltig: "Le sous-domaine ou le jeton semble incorrect.",
    test_duckdns_ip_fehlt: "Veuillez d'abord saisir l'adresse IP du NAS à l'étape « Réseau domestique ».",

    t_rebind: "Routeur : protection DNS rebind",
    i_rebind: "Votre adresse pinn. pointe vers un appareil de votre réseau domestique. Beaucoup de routeurs – dont la FRITZ!Box – le bloquent par sécurité. pinn. ne s'ouvre alors pas via l'adresse. Une exception pour cette adresse précise règle le problème :",
    g_rebind: [
      "Ouvrez [fritz.box](http://fritz.box) et connectez-vous.",
      "« Réseau domestique » → « Réseau » → onglet « Paramètres réseau ».",
      "Faites défiler tout en bas et dépliez « autres paramètres ».",
      "Dans la section « Protection DNS rebind », saisissez cette ligne sous « Exceptions de noms d'hôte » : `{SUB}.duckdns.org`",
      "Touchez « Appliquer » et – si la FRITZ!Box le demande – confirmez sur la box.",
      "Autre routeur : cherchez « DNS rebind » dans les paramètres et saisissez la même adresse comme exception. S'il n'y a pas de tel réglage, il n'y a généralement rien à faire.",
    ],
    rebindErledigt: "Fait – l'exception est enregistrée",

    t_fern: "Utiliser en déplacement (VPN)",
    i_fern: "pinn. n'est volontairement pas ouvert sur Internet. En déplacement, le téléphone se connecte en toute sécurité à votre domicile via VPN – comme si vous étiez sur votre Wi-Fi. Comment souhaitez-vous procéder ?",
    c_wg: "FRITZ!Box avec WireGuard", c_wg_d: "Recommandé si vous avez une FRITZ!Box avec FRITZ!OS 7.50 ou plus récent. Gratuit, aucun autre compte nécessaire.",
    c_ts: "Tailscale", c_ts_d: "Pour les autres routeurs – ou si WireGuard ne fonctionne pas (p. ex. connexions DS-Lite). Nécessite un compte gratuit sur tailscale.com.",
    c_kein: "Seulement à la maison", c_kein_d: "Utiliser pinn. uniquement sur votre Wi-Fi. Peut être ajouté à tout moment.",
    L_TS_AUTHKEY: "Clé Tailscale (auth key)",
    g_wireguard: [
      "Ouvrez [fritz.box](http://fritz.box) et connectez-vous. Sous « Système » → « Mise à jour », FRITZ!OS 7.50 ou plus récent doit être indiqué (sinon mettez à jour).",
      "« Internet » → « Partages » → onglet « VPN (WireGuard) » → « Ajouter une connexion ».",
      "Choisissez « Configuration simplifiée (recommandée) » → « Suivant ». À la question de connecter un seul appareil, répondez « Oui ».",
      "Saisissez un nom pour le téléphone (p. ex. `Téléphone Anna`) → « Terminer ». Si la FRITZ!Box demande une confirmation : appuyez sur une touche de la box ou confirmez au téléphone.",
      "Si la FRITZ!Box demande un compte MyFRITZ! : créez-le gratuitement – c'est ainsi que le téléphone retrouve votre box en déplacement.",
      "Un code QR s'affiche. Installez l'app « WireGuard » sur le téléphone : [iPhone](https://apps.apple.com/app/wireguard/id1441195209) · [Android](https://play.google.com/store/apps/details?id=com.wireguard.android).",
      "Dans l'app WireGuard, touchez « + » → « Scanner un code QR » (iPhone : « Créer à partir d'un code QR ») → scannez le code à l'écran → donnez un nom → autorisez l'ajout de la configuration VPN.",
      "Test : désactivez le Wi-Fi du téléphone, activez WireGuard et ouvrez {ADRESSE}.",
      "Répétez les étapes à partir de « Ajouter une connexion » pour chaque autre téléphone – chaque appareil a sa propre connexion.",
    ],
    wgNurPinnT: "N'autoriser que pinn. (p. ex. pour des proches)",
    wgNurPinn: "Si un appareil ne doit atteindre que pinn. via le VPN et non tout votre réseau : dans l'app WireGuard, touchez la connexion → « Modifier » → sous « IP autorisées », remplacez tout par `{NAS_IP}/32, {ROUTER_IP}/32` → « Enregistrer ». La seconde adresse est le routeur (pour la résolution des noms). Remarque : la restriction s'applique sur cet appareil.",
    wgDsLite: "Cela ne marche pas en déplacement ? Certaines connexions (DS-Lite, fréquent sur câble et fibre) n'ont pas d'adresse IPv4 propre – WireGuard ne fonctionne alors que si le téléphone dispose d'IPv6. Dans ce cas, utilisez Tailscale.",
    g_tailscale: [
      "Ouvrez [login.tailscale.com](https://login.tailscale.com/start) et créez un compte gratuit (p. ex. connexion avec Google, Microsoft ou Apple).",
      "Dans la console, « Settings » en haut → « Keys » à gauche → « Generate auth key… ».",
      "Gardez les réglages par défaut → « Generate key » → copiez la clé (commence par `tskey-auth-`) et collez-la ci-dessus.",
      "Touchez « Suivant ». Le conteneur « tailscale » du NAS s'en sert pour se connecter en moins d'une minute.",
      "De retour dans la console Tailscale : onglet « Machines » → sur l'appareil « pinn », touchez « … » → « Edit route settings… » → cochez `{NAS_IP}/32` → « Save ».",
      "Toujours sur « pinn », sous « … » → choisissez « Disable key expiry » – sinon le NAS doit se reconnecter tous les 180 jours.",
      "Installez l'app « Tailscale » sur chaque téléphone ([iPhone](https://apps.apple.com/app/tailscale/id1470499037) · [Android](https://play.google.com/store/apps/details?id=com.tailscale.ipn)) et connectez-vous avec le même compte. Invitez des proches sous « Users » dans la console.",
      "Test : désactivez le Wi-Fi du téléphone, connectez Tailscale et ouvrez {ADRESSE}.",
    ],
    keinFern: "Pas de souci – pinn. fonctionne alors sur votre Wi-Fi. Vous pouvez ajouter l'accès à distance à tout moment sous Administrateur principal → Configuration.",

    t_google: "Google : agendas Android et contacts",
    i_google: "Facultatif. Nécessaire pour voir dans pinn. des agendas Google (Android) ou les anniversaires des contacts Google. Se configure une seule fois pour tout le serveur – ensuite chacun se connecte dans pinn. avec son propre compte Google. Rien à faire ici pour iPhone/iCloud.",
    googleBrauchtHttps: "Google a besoin de l'adresse HTTPS de l'étape « DuckDNS ».",
    L_REDIRECT: "URI de redirection (pour la Google Cloud Console)",
    L_PINN_GOOGLE_CLIENT_ID: "ID client", L_PINN_GOOGLE_CLIENT_SECRET: "Code secret du client",
    g_google: [
      "Ouvrez [console.cloud.google.com](https://console.cloud.google.com) et connectez-vous avec un compte Google (acceptez les conditions d'utilisation la première fois).",
      "Touchez le sélecteur de projet en haut → « Nouveau projet » → nom `pinn` → « Créer ». Sélectionnez ensuite le projet « pinn » en haut.",
      "Activez trois API – ouvrez chacune et touchez « Activer » : [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) · [CalDAV API](https://console.cloud.google.com/apis/library/caldav.googleapis.com) · [People API](https://console.cloud.google.com/apis/library/people.googleapis.com).",
      "Ouvrez [Google Auth Platform](https://console.cloud.google.com/auth/overview) → « Commencer » : nom de l'app `pinn.`, e-mail d'assistance = votre adresse → audience « Externe » → e-mail de contact → accepter → « Créer ».",
      "À gauche « Audience » → « Publier l'application » → confirmer. Important : en statut « Test », chaque connexion Google expire au bout de 7 jours.",
      "À gauche « Clients » → « Créer un client » → type d'application « Application Web », nom `pinn.`.",
      "Sous « URI de redirection autorisés » → « Ajouter un URI » et collez exactement cette adresse : `{REDIRECT}` → « Créer ».",
      "Copiez l'ID client et le code secret, collez-les ici et touchez « Vérifier ». (Google n'affiche le code secret qu'une fois – sinon « Ajouter un code secret » sur le client.)",
      "Lors de la connexion, Google affichera « Google n'a pas validé cette application ». C'est normal pour votre app privée : « Paramètres avancés » → « Accéder à pinn. ».",
    ],
    test_google_ok: "Google connaît ce client ✓",
    test_google_uri: "L'ID client et le code secret sont corrects, mais l'URI de redirection manque dans le client : {0}",
    test_google_ungueltig: "Google ne reconnaît pas cet ID client ou ce code secret – veuillez les copier à nouveau.",
    test_google_netz: "Google est injoignable depuis le NAS.",
    test_google_fehlt: "Veuillez saisir l'ID client et le code secret.",

    t_ki: "IA pour les recettes (Google Gemini)",
    i_ki: "Facultatif. L'IA lit bien mieux les recettes à partir de textes, photos, PDF et liens, et trouve votre calendrier de collecte des déchets. La clé est gratuite et reste sur le NAS – les apps ne communiquent jamais directement avec Google.",
    L_PINN_GEMINI_KEY: "Clé API Gemini", L_PINN_GEMINI_MODELL: "Modèle fixe",
    h_modell: "Vide = automatiquement le modèle Flash actuel.",
    g_ki: [
      "Ouvrez [aistudio.google.com/apikey](https://aistudio.google.com/apikey) et connectez-vous avec un compte Google.",
      "Touchez « Créer une clé API » (Create API key). Si Google demande un projet, choisissez le projet « pinn » de l'étape précédente ou créez-en un.",
      "Copiez la clé (commence généralement par `AIza`), collez-la ici et touchez « Vérifier ».",
      "Bon à savoir : avec l'offre gratuite, Google peut utiliser les textes de recettes transmis pour améliorer ses services.",
    ],
    test_gemini_ok: "Clé valide ✓",
    test_gemini_ungueltig: "Google refuse la clé – veuillez la copier à nouveau.",
    test_gemini_gesperrt: "La clé est bloquée pour l'API Gemini. Créez une nouvelle clé dans AI Studio.",
    test_gemini_netz: "Google est injoignable depuis le NAS.",
    test_gemini_fehlt: "Veuillez saisir la clé.",

    t_ortung: "Localisation (Famille → positions en direct)",
    i_ortung: "Facultatif. Les téléphones partagent leur position directement dans pinn. – rien à saisir ici. Le conteneur « traccar » n'est nécessaire que pour les traceurs GPS avec carte SIM.",
    l_ortung: [
      "Le partage de position se fait directement dans pinn. (Famille → Localisation). Pour continuer à envoyer quand pinn. est fermé, installez l'app « Traccar Client » – elle envoie directement à pinn.",
      "pinn. affichera plus tard l'adresse du serveur et l'ID de l'appareil pour chaque personne sous Famille → ⚙︎ Localisation.",
      "En déplacement, le téléphone a besoin du VPN de l'étape « Utiliser en déplacement ».",
      "Les traceurs GPS avec carte SIM (p. ex. sur un collier de chien) émettent depuis le réseau mobile – il faut alors une redirection de port dans le routeur. pinn. affiche le guide lors de l'ajout du traceur.",
    ],
    appTraccar: "App « Traccar Client » :",
    h_traccar: "À remplir uniquement si vous avez déjà créé vous-même un compte dans Traccar. Vide = pinn. en crée un.",
    L_PINN_TRACCAR_EMAIL: "E-mail Traccar", L_PINN_TRACCAR_PASSWORT: "Mot de passe Traccar",
    test_traccar_ok: "Traccar fonctionne ✓",
    test_traccar_aus: "Le conteneur « traccar » ne tourne pas – inutile pour les téléphones. Seulement pour les traceurs GPS : ajoutez COMPOSE_PROFILES=tracker dans le fichier .env.",

    t_ha: "Maison connectée : Home Assistant",
    i_ha: "Facultatif. Où fonctionne votre Home Assistant ?",
    c_ha_kein: "Pas de Home Assistant",
    c_ha_geraet: "Sur un appareil séparé", c_ha_geraet_d: "p. ex. Raspberry Pi ou Home Assistant Green.",
    c_ha_vm: "En machine virtuelle sur ce NAS", c_ha_vm_d: "pinn. met alors en place un petit détour réseau – sinon le NAS ne peut pas joindre la VM.",
    haGeraetInfo: "Rien à saisir ici. Chaque famille configure la connexion dans pinn. sous Réglages → Maison connectée.",
    L_HA_IP: "Adresse IP de Home Assistant", L_HILFS_IP: "Adresse auxiliaire libre", L_NAS_NETZWERKKARTE: "Interface réseau du NAS",
    h_karte: "« auto » = pinn. détecte l'interface réseau lui-même.",
    g_ha: [
      "IP de Home Assistant : dans Home Assistant « Paramètres » → « Système » → « Réseau » – ou cherchez l'appareil « homeassistant » dans la FRITZ!Box sous « Réseau domestique » → « Réseau ». Cochez-y aussi « toujours attribuer la même adresse IPv4 ».",
      "Adresse auxiliaire : une adresse du réseau domestique qu'aucun appareil n'utilise et que le routeur n'attribue jamais. Dans la FRITZ!Box, « Réseau domestique » → « Réseau » → « Paramètres réseau » → « Paramètres IPv4 » indique la plage attribuée (p. ex. .20 à .200). Prenez une adresse au-dessus, p. ex. `{VORSCHLAG}`.",
      "Touchez « Suivant » – le conteneur « ha-netz » met en place le détour en moins d'une minute. « Vérifier » indique si pinn. joint Home Assistant.",
      "Chaque famille saisit plus tard le jeton d'accès Home Assistant dans pinn. sous Réglages → Maison connectée.",
    ],
    haAktiv: "Détour actif via {0} (adresse auxiliaire {1}) ✓", haWartet: "Le détour attend les réglages.", haFehler: "Le détour n'a pas pu être mis en place (interface : {0}).",
    test_homeassistant_ok: "Home Assistant est joignable ✓",
    test_homeassistant_aus: "Home Assistant n'est pas (encore) joignable. Après « Suivant », attendez jusqu'à une minute et vérifiez à nouveau.",
    test_homeassistant_fehlt: "Veuillez saisir l'adresse IP de Home Assistant.",

    t_apps: "Apps et appareils",
    i_apps: "Presque fini ! Voici ce dont les membres de la famille ont besoin sur leur téléphone :",
    a_home_t: "pinn. sur l'écran d'accueil (pour tous)",
    a_home: [
      "iPhone/iPad : ouvrez {ADRESSE} dans Safari → icône Partager (carré avec flèche) → « Sur l'écran d'accueil » → « Ajouter ». C'est la seule façon de recevoir les notifications push (iOS 16.4 ou plus récent).",
      "Android : ouvrez {ADRESSE} dans Chrome → ⋮ en haut à droite → « Installer l'application » ou « Ajouter à l'écran d'accueil ».",
      "Utilisez toujours l'adresse https – pas l'adresse avec :8090.",
    ],
    a_vpn: "Pour les déplacements – configuration à l'étape « Utiliser en déplacement » :",
    a_traccar: "Uniquement pour la localisation :",
    a_icloud_t: "Agenda iCloud (iPhone)",
    a_icloud: "Chaque famille connecte elle-même son agenda iCloud dans pinn. sous Réglages → Agenda. Il faut pour cela un mot de passe pour app : [account.apple.com](https://account.apple.com) → « Connexion et sécurité » → « Mots de passe pour app » → « + » → nom `pinn.` → saisissez le mot de passe affiché (xxxx-xxxx-xxxx-xxxx) dans pinn.",
    a_push_t: "Notifications push",
    a_push: "Chaque personne les active dans pinn. sous Réglages → Notifications → « Activer sur cet appareil » – sur iPhone uniquement dans l'app de l'écran d'accueil.",

    t_fertig: "Récapitulatif",
    i_fertig: "Vérifiez les informations. Avec « Enregistrer et démarrer », pinn. applique tout et redémarre brièvement une fois (environ 10 à 20 secondes).",
    S_ADRESSE: "Adresse", S_REBIND: "Exception DNS rebind", S_FERN: "En déplacement", S_KI: "IA", S_ORTUNG: "Localisation",
    L_PINN_PUSH_KONTAKT: "Contact pour les services push",
    h_push: "Apple et Google exigent une adresse de contact (e-mail) pour les notifications push. Vide = pinn. utilise sa propre adresse.",
    neustart: "pinn. redémarre …", neustartOk: "redémarré ✓", neustartFehler: "pinn. ne répond pas. Rechargez dans une à deux minutes.",
    pruefeHttps: "Vérification de HTTPS …", pruefeAlles: "Vérification de l'ensemble …",
    zertifikatDauert: "Le certificat de sécurité est obtenu la première fois – cela peut prendre 1 à 2 minutes …",
    httpsOk: "{0} est joignable ✓",
    httpsFehler: "{0} ne répond pas encore. Causes fréquentes : protection DNS rebind du routeur (étape 5), cet appareil n'est pas sur le réseau domestique, ou le certificat a besoin d'un peu plus de temps. Testez plus tard avec « Vérifier à nouveau ».",
    httpsAus: "Aucune adresse HTTPS configurée (étape DuckDNS).",
    t_geschafft: "C'est fait ! 🎉",
    geschafftText: "pinn. est configuré. Ouvrez désormais pinn. via cette adresse et enregistrez-la sur tous les téléphones (voir « Apps et appareils »). Ensuite, créez votre première famille dans la gestion des familles.",
    nochmalPruefen: "Vérifier à nouveau", zurVerwaltung: "Vers la gestion des familles",
  };
  T.es = {
    titel: "Configuración", lade: "Cargando la configuración …",
    weiter: "Siguiente", zurueck: "Atrás", ueberspringen: "Omitir", spaeter: "Más tarde", schliessen: "Cerrar",
    pruefen: "Comprobar", pruefe: "Comprobando …", speichere: "Guardando …", kopieren: "Copiar", kopiert: "Copiado ✓",
    anleitung: "Guía paso a paso", optional: "opcional", erweitert: "Avanzado", zeigen: "Mostrar",
    gespeichertGeheim: "guardado: ••••{0}", leerLassen: "dejar vacío = sin cambios", ausEnv: "Valor del .env o del docker-compose.yaml",
    entfernen: "Eliminar", wirdEntfernt: "se eliminará al guardar", entfernenFrage: "¿Eliminar este valor guardado?",
    schritt: "Paso {0} de {1}", fehlerFeld: "Revisa «{0}».", fehler: "No ha funcionado.", ok: "Correcto ✓",
    fehlerNetz: "Sin conexión con pinn. – comprueba que estás en la red de casa.",
    ordnerFehlt: "Falta la carpeta «konfig» en el NAS. Usa el nuevo docker-compose.yaml y ejecuta el script pinn-setup.sh (o «docker compose up -d»). Sin esta carpeta, la configuración no puede guardar nada.",
    ordnerSchreibschutz: "La carpeta «konfig» es de solo lectura – vuelve a ejecutar pinn-setup.sh.",
    serverFehlt: "Todavía faltan einrichtung.pb.js y pinn-einrichtung.js (pb_hooks) en el servidor.",
    erkannt: "Detectado en la barra de direcciones: {0}", deineAdresse: "Tu dirección de pinn.:", ph_sub: "p. ej. familia-garcia",
    L_PORT: "Puerto HTTPS", h_port: "Cámbialo solo si has cambiado el puerto 8443 en el docker-compose.yaml.",
    pflichtInfo: "Solo «Red de casa» y «DuckDNS» son obligatorios. Todo lo demás puedes omitirlo y completarlo cuando quieras: Administrador principal → Configuración.",
    serverOk: "pinn. funciona y puede guardar los ajustes ✓",
    schonFertig: "La configuración ya se completó. Puedes revisarlo y cambiarlo todo – y aplicarlo al final con «Guardar e iniciar».",
    bitteWaehlen: "Elige una opción (u «Omitir»).",
    skipPflicht: "Sin este paso no funcionarán HTTPS, las notificaciones push ni la app en la pantalla de inicio. ¿Omitir de todos modos?",
    pflichtFehlt: "Rellena los campos – o pulsa «Omitir».",
    speichernStarten: "Guardar e iniciar", neu: "nuevo", nichtGesetzt: "sin configurar", erledigtKurz: "hecho", offen: "pendiente",
    eingerichtet: "configurado", aus: "desactivado",

    t_sprache: "Bienvenido a pinn. 👋",
    i_sprache: "Elige el idioma de la configuración. También se usará para pinn. en este dispositivo – cada perfil podrá elegir su propio idioma más adelante.",

    t_start: "Lo que necesitas",
    i_start: "En unos 20–30 minutos pinn. estará listo. Cada paso se guarda al pulsar «Siguiente», así que puedes parar en cualquier momento y continuar en el mismo punto.",
    l_start: [
      "acceso a tu router (en una FRITZ!Box: la contraseña de la parte inferior o la tuya propia)",
      "este dispositivo en la red de casa (Wi-Fi) – lo más fácil es un ordenador, pero un móvil también sirve",
      "una cuenta de Google, GitHub o Reddit para el servicio gratuito DuckDNS",
      "opcional: una cuenta de Google para calendarios de Android y la IA",
    ],

    t_netz: "Red de casa: dirección del NAS",
    i_netz: "pinn. necesita saber en qué dirección de tu red está el NAS. Para que nunca cambie, el router la reserva de forma fija.",
    L_NAS_IP: "Dirección IP del NAS",
    g_netz: [
      "Mira la barra de direcciones del navegador: si aparece algo como `http://192.168.178.20:8090`, el número antes de los dos puntos ya es la IP del NAS.",
      "Si no, mira en la FRITZ!Box: abre [fritz.box](http://fritz.box) en el navegador e inicia sesión con la contraseña de la FRITZ!Box.",
      "A la izquierda abre «Red doméstica» → «Red» → pestaña «Conexiones de red».",
      "Busca tu NAS en la lista (normalmente «UGREEN…» o «DXP…») y pulsa el lápiz (editar) a la derecha.",
      "Anota la dirección IPv4 y marca «Asignar siempre la misma dirección IPv4 a este dispositivo» → «Aplicar».",
      "Otro router: busca «Red local», «LAN» o «DHCP» – suele llamarse «reservar dirección» o «IP estática». En la app de UGREEN la dirección está en Panel de control → Red.",
    ],

    t_duckdns: "Tu dirección con HTTPS (DuckDNS)",
    i_duckdns: "DuckDNS es un servicio gratuito que da a pinn. una dirección fija con certificado de seguridad. pinn. lo necesita para las notificaciones push, la app en la pantalla de inicio y el inicio de sesión de Google. No hace falta abrir puertos en el router – pinn. sigue siendo invisible desde fuera.",
    L_DUCKDNS_SUBDOMAIN: "Subdominio (nombre a elegir)", L_DUCKDNS_TOKEN: "Token de DuckDNS", L_PINN_ADRESSE: "Dirección de pinn.",
    g_duckdns: [
      "Abre [duckdns.org](https://www.duckdns.org).",
      "Arriba a la derecha, inicia sesión con una de las cuentas ofrecidas (p. ej. Google, GitHub o Reddit) – DuckDNS no tiene contraseña propia.",
      "Escribe un nombre en el campo «sub domain», p. ej. `familia-garcia` (solo minúsculas, números y guiones), y pulsa «add domain». Si el nombre está ocupado, prueba otro.",
      "Arriba en la página aparece tu «token»: una cadena larga con guiones. Selecciónala y cópiala.",
      "Pega aquí el subdominio y el token y pulsa «Comprobar». pinn. registra él mismo la dirección del NAS en DuckDNS – no hace falta cambiar el campo «current ip» de la web.",
      "El token es como una contraseña: no lo compartas. Si ha ocurrido: pulsa «recreate token» en duckdns.org e introduce aquí el nuevo token.",
    ],
    test_duckdns_ok: "DuckDNS ha aceptado la dirección ✓ – {0} apunta ahora a tu NAS ({1}).",
    test_duckdns_ko: "DuckDNS lo rechaza. Revisa el subdominio y el token – el subdominio debe existir en tu cuenta de DuckDNS.",
    test_duckdns_netz: "No se puede acceder a duckdns.org desde el NAS. ¿Tiene Internet el NAS?",
    test_duckdns_fehlt: "Introduce el subdominio y el token.",
    test_duckdns_ungueltig: "El subdominio o el token no parecen correctos.",
    test_duckdns_ip_fehlt: "Introduce primero la IP del NAS en el paso «Red de casa».",

    t_rebind: "Router: protección DNS rebind",
    i_rebind: "Tu dirección de pinn. apunta a un dispositivo de tu red de casa. Muchos routers – también la FRITZ!Box – lo bloquean por seguridad. Entonces pinn. no se abre con la dirección. Una excepción para exactamente esta dirección lo soluciona:",
    g_rebind: [
      "Abre [fritz.box](http://fritz.box) e inicia sesión.",
      "«Red doméstica» → «Red» → pestaña «Ajustes de red».",
      "Desplázate hasta abajo y despliega «otros ajustes».",
      "En la sección «Protección DNS rebind», introduce esta línea en «Excepciones de nombres de host»: `{SUB}.duckdns.org`",
      "Pulsa «Aplicar» y – si la FRITZ!Box lo pide – confírmalo en la caja.",
      "Otro router: busca «DNS rebind» en los ajustes e introduce la misma dirección como excepción. Si no existe ese ajuste, normalmente no hay que hacer nada.",
    ],
    rebindErledigt: "Hecho – la excepción está añadida",

    t_fern: "Usar fuera de casa (VPN)",
    i_fern: "pinn. no está abierto a Internet a propósito. Fuera de casa, el móvil se conecta de forma segura a tu hogar mediante VPN – como si estuvieras en tu Wi-Fi. ¿Cómo quieres hacerlo?",
    c_wg: "FRITZ!Box con WireGuard", c_wg_d: "Recomendado si tienes una FRITZ!Box con FRITZ!OS 7.50 o posterior. Gratis, sin cuentas adicionales.",
    c_ts: "Tailscale", c_ts_d: "Para otros routers – o si WireGuard no funciona (p. ej. con conexiones DS-Lite). Necesita una cuenta gratuita en tailscale.com.",
    c_kein: "Solo en casa", c_kein_d: "Usar pinn. solo en el Wi-Fi de casa. Se puede añadir en cualquier momento.",
    L_TS_AUTHKEY: "Clave de Tailscale (auth key)",
    g_wireguard: [
      "Abre [fritz.box](http://fritz.box) e inicia sesión. En «Sistema» → «Actualización» debe figurar FRITZ!OS 7.50 o posterior (si no, actualiza allí).",
      "«Internet» → «Permitir acceso» → pestaña «VPN (WireGuard)» → «Añadir conexión».",
      "Elige «Configuración simplificada (recomendada)» → «Siguiente». Cuando pregunte si se conectará un único dispositivo, elige «Sí».",
      "Escribe un nombre para el móvil (p. ej. `Móvil Ana`) → «Finalizar». Si la FRITZ!Box pide confirmación: pulsa un botón de la caja o confirma por teléfono.",
      "Si la FRITZ!Box pide una cuenta MyFRITZ!: créala gratis – así el móvil encuentra tu caja fuera de casa.",
      "Aparece un código QR. Instala la app «WireGuard» en el móvil: [iPhone](https://apps.apple.com/app/wireguard/id1441195209) · [Android](https://play.google.com/store/apps/details?id=com.wireguard.android).",
      "En la app WireGuard pulsa «+» → «Escanear código QR» (iPhone: «Crear desde código QR») → escanea el código de la pantalla → ponle un nombre → permite añadir la configuración VPN.",
      "Prueba: desactiva el Wi-Fi del móvil, activa WireGuard y abre {ADRESSE}.",
      "Repite los pasos desde «Añadir conexión» para cada móvil – cada dispositivo tiene su propia conexión.",
    ],
    wgNurPinnT: "Permitir solo pinn. (p. ej. para familiares)",
    wgNurPinn: "Si un dispositivo solo debe llegar a pinn. por la VPN y no a toda tu red: en la app WireGuard pulsa la conexión → «Editar» → en «IP permitidas» sustituye todo por `{NAS_IP}/32, {ROUTER_IP}/32` → «Guardar». La segunda dirección es el router (para resolver nombres). Nota: la restricción se aplica en ese dispositivo.",
    wgDsLite: "¿No funciona fuera de casa? Algunas conexiones (DS-Lite, habitual en cable y fibra) no tienen dirección IPv4 propia – entonces WireGuard solo funciona si el móvil tiene IPv6. En ese caso usa Tailscale.",
    g_tailscale: [
      "Abre [login.tailscale.com](https://login.tailscale.com/start) y crea una cuenta gratuita (p. ej. con Google, Microsoft o Apple).",
      "En la consola, «Settings» arriba → «Keys» a la izquierda → «Generate auth key…».",
      "Deja los valores por defecto → «Generate key» → copia la clave (empieza por `tskey-auth-`) y pégala arriba.",
      "Pulsa «Siguiente». El contenedor «tailscale» del NAS la usa para conectarse en menos de un minuto.",
      "De vuelta en la consola de Tailscale: pestaña «Machines» → en el dispositivo «pinn» pulsa «…» → «Edit route settings…» → marca `{NAS_IP}/32` → «Save».",
      "También en «pinn», en «…» → elige «Disable key expiry» – si no, el NAS tendrá que volver a conectarse cada 180 días.",
      "Instala la app «Tailscale» en cada móvil ([iPhone](https://apps.apple.com/app/tailscale/id1470499037) · [Android](https://play.google.com/store/apps/details?id=com.tailscale.ipn)) e inicia sesión con la misma cuenta. Invita a familiares en «Users» de la consola.",
      "Prueba: desactiva el Wi-Fi del móvil, conecta Tailscale y abre {ADRESSE}.",
    ],
    keinFern: "Sin problema – pinn. funciona entonces en el Wi-Fi de casa. Puedes añadir el acceso remoto cuando quieras en Administrador principal → Configuración.",

    t_google: "Google: calendarios de Android y contactos",
    i_google: "Opcional. Necesario si queréis ver en pinn. calendarios de Google (Android) o cumpleaños de los contactos de Google. Se configura una vez para todo el servidor – después cada persona inicia sesión en pinn. con su propia cuenta de Google. Para iPhone/iCloud no hay que hacer nada aquí.",
    googleBrauchtHttps: "Google necesita la dirección HTTPS del paso «DuckDNS».",
    L_REDIRECT: "URI de redirección (para Google Cloud Console)",
    L_PINN_GOOGLE_CLIENT_ID: "ID de cliente", L_PINN_GOOGLE_CLIENT_SECRET: "Secreto del cliente",
    g_google: [
      "Abre [console.cloud.google.com](https://console.cloud.google.com) e inicia sesión con una cuenta de Google (la primera vez, acepta las condiciones).",
      "Pulsa el selector de proyectos arriba → «Proyecto nuevo» → nombre `pinn` → «Crear». Después selecciona arriba el proyecto «pinn».",
      "Activa tres API – abre cada una y pulsa «Habilitar»: [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) · [CalDAV API](https://console.cloud.google.com/apis/library/caldav.googleapis.com) · [People API](https://console.cloud.google.com/apis/library/people.googleapis.com).",
      "Abre [Google Auth Platform](https://console.cloud.google.com/auth/overview) → «Comenzar»: nombre de la app `pinn.`, correo de asistencia = tu dirección → público «Externo» → correo de contacto → aceptar → «Crear».",
      "A la izquierda «Público» → «Publicar app» → confirmar. Importante: en estado «Prueba», cada conexión de Google caduca a los 7 días.",
      "A la izquierda «Clientes» → «Crear cliente» → tipo de aplicación «Aplicación web», nombre `pinn.`.",
      "En «URI de redireccionamiento autorizados» → «Agregar URI» y pega exactamente esta dirección: `{REDIRECT}` → «Crear».",
      "Copia el ID de cliente y el secreto, pégalos aquí y pulsa «Comprobar». (Google muestra el secreto solo una vez – si no, «Agregar secreto» en el cliente.)",
      "Al conectar más adelante, Google mostrará «Google no ha verificado esta aplicación». Es normal en tu app privada: «Configuración avanzada» → «Ir a pinn.».",
    ],
    test_google_ok: "Google reconoce este cliente ✓",
    test_google_uri: "El ID de cliente y el secreto son correctos, pero falta la URI de redirección en el cliente: {0}",
    test_google_ungueltig: "Google no reconoce este ID de cliente o secreto – cópialos de nuevo.",
    test_google_netz: "No se puede acceder a Google desde el NAS.",
    test_google_fehlt: "Introduce el ID de cliente y el secreto.",

    t_ki: "IA para recetas (Google Gemini)",
    i_ki: "Opcional. La IA lee mucho mejor las recetas de textos, fotos, PDF y enlaces, y encuentra vuestro calendario de recogida de basura. La clave es gratuita y se queda en el NAS – las apps nunca hablan directamente con Google.",
    L_PINN_GEMINI_KEY: "Clave API de Gemini", L_PINN_GEMINI_MODELL: "Modelo fijo",
    h_modell: "Vacío = automáticamente el modelo Flash actual.",
    g_ki: [
      "Abre [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e inicia sesión con una cuenta de Google.",
      "Pulsa «Crear clave de API» (Create API key). Si Google pide un proyecto, elige el proyecto «pinn» del paso anterior o crea uno nuevo.",
      "Copia la clave (suele empezar por `AIza`), pégala aquí y pulsa «Comprobar».",
      "Bueno saberlo: en el nivel gratuito, Google puede usar los textos de recetas enviados para mejorar sus servicios.",
    ],
    test_gemini_ok: "Clave válida ✓",
    test_gemini_ungueltig: "Google rechaza la clave – cópiala de nuevo.",
    test_gemini_gesperrt: "La clave está bloqueada para la API de Gemini. Crea una clave nueva en AI Studio.",
    test_gemini_netz: "No se puede acceder a Google desde el NAS.",
    test_gemini_fehlt: "Introduce la clave.",

    t_ortung: "Localización (Familia → ubicaciones en directo)",
    i_ortung: "Opcional. Los móviles comparten su ubicación directamente en pinn. – aquí no hay que introducir nada. El contenedor «traccar» solo hace falta para localizadores GPS con tarjeta SIM.",
    l_ortung: [
      "Compartir la ubicación funciona directamente en pinn. (Familia → Localización). Para seguir enviando con pinn. cerrado, instala la app «Traccar Client»: envía directamente a pinn.",
      "pinn. mostrará más adelante la dirección del servidor y el ID del dispositivo de cada persona en Familia → ⚙︎ Localización.",
      "Fuera de casa, el móvil necesita la VPN del paso «Usar fuera de casa».",
      "Los localizadores GPS con tarjeta SIM (p. ej. en el collar del perro) envían desde la red móvil – para eso hace falta abrir un puerto en el router. pinn. muestra la guía al añadir el localizador.",
    ],
    appTraccar: "App «Traccar Client»:",
    h_traccar: "Rellénalo solo si ya creaste tú mismo una cuenta en Traccar. Vacío = pinn. crea una.",
    L_PINN_TRACCAR_EMAIL: "Correo de Traccar", L_PINN_TRACCAR_PASSWORT: "Contraseña de Traccar",
    test_traccar_ok: "Traccar funciona ✓",
    test_traccar_aus: "El contenedor «traccar» no está en marcha – no hace falta para los móviles. Solo para localizadores GPS: añade COMPOSE_PROFILES=tracker al archivo .env.",

    t_ha: "Hogar inteligente: Home Assistant",
    i_ha: "Opcional. ¿Dónde funciona vuestro Home Assistant?",
    c_ha_kein: "Sin Home Assistant",
    c_ha_geraet: "En un dispositivo propio", c_ha_geraet_d: "p. ej. Raspberry Pi o Home Assistant Green.",
    c_ha_vm: "Como máquina virtual en este NAS", c_ha_vm_d: "pinn. configura entonces un pequeño desvío de red – si no, el NAS no llega a la VM.",
    haGeraetInfo: "Aquí no hay que introducir nada. Cada familia configura la conexión en pinn. en Ajustes → Hogar inteligente.",
    L_HA_IP: "Dirección IP de Home Assistant", L_HILFS_IP: "Dirección auxiliar libre", L_NAS_NETZWERKKARTE: "Interfaz de red del NAS",
    h_karte: "«auto» = pinn. detecta la interfaz de red solo.",
    g_ha: [
      "IP de Home Assistant: en Home Assistant «Ajustes» → «Sistema» → «Red» – o busca el dispositivo «homeassistant» en la FRITZ!Box en «Red doméstica» → «Red». Marca allí también «asignar siempre la misma dirección IPv4».",
      "Dirección auxiliar: una dirección de la red de casa que ningún dispositivo use y que el router nunca asigne. En la FRITZ!Box, «Red doméstica» → «Red» → «Ajustes de red» → «Ajustes IPv4» muestra el rango que asigna el router (p. ej. .20 a .200). Elige una dirección por encima, p. ej. `{VORSCHLAG}`.",
      "Pulsa «Siguiente» – el contenedor «ha-netz» configura el desvío en menos de un minuto. «Comprobar» muestra si pinn. llega a Home Assistant.",
      "Cada familia introduce más tarde el token de acceso de Home Assistant en pinn. en Ajustes → Hogar inteligente.",
    ],
    haAktiv: "Desvío activo por {0} (dirección auxiliar {1}) ✓", haWartet: "El desvío espera los ajustes.", haFehler: "No se pudo configurar el desvío (interfaz: {0}).",
    test_homeassistant_ok: "Home Assistant está accesible ✓",
    test_homeassistant_aus: "Home Assistant no está accesible (todavía). Tras «Siguiente», espera hasta un minuto y vuelve a comprobar.",
    test_homeassistant_fehlt: "Introduce la dirección IP de Home Assistant.",

    t_apps: "Apps y dispositivos",
    i_apps: "¡Casi listo! Esto es lo que necesitan los miembros de la familia en sus móviles:",
    a_home_t: "pinn. en la pantalla de inicio (para todos)",
    a_home: [
      "iPhone/iPad: abre {ADRESSE} en Safari → icono Compartir (cuadrado con flecha) → «Añadir a pantalla de inicio» → «Añadir». Solo así llegan las notificaciones push (iOS 16.4 o posterior).",
      "Android: abre {ADRESSE} en Chrome → ⋮ arriba a la derecha → «Instalar aplicación» o «Añadir a pantalla de inicio».",
      "Usa siempre la dirección https – no la dirección con :8090.",
    ],
    a_vpn: "Para fuera de casa – configuración en el paso «Usar fuera de casa»:",
    a_traccar: "Solo para la localización:",
    a_icloud_t: "Calendario de iCloud (iPhone)",
    a_icloud: "Cada familia conecta su calendario de iCloud en pinn. en Ajustes → Calendario. Para ello hace falta una contraseña específica de app: [account.apple.com](https://account.apple.com) → «Inicio de sesión y seguridad» → «Contraseñas específicas de app» → «+» → nombre `pinn.` → introduce la contraseña mostrada (xxxx-xxxx-xxxx-xxxx) en pinn.",
    a_push_t: "Notificaciones push",
    a_push: "Cada persona las activa en pinn. en Ajustes → Notificaciones → «Activar en este dispositivo» – en iPhone solo desde la app de la pantalla de inicio.",

    t_fertig: "Resumen",
    i_fertig: "Revisa los datos. Con «Guardar e iniciar», pinn. lo aplica todo y se reinicia brevemente una vez (unos 10–20 segundos).",
    S_ADRESSE: "Dirección", S_REBIND: "Excepción DNS rebind", S_FERN: "Fuera de casa", S_KI: "IA", S_ORTUNG: "Localización",
    L_PINN_PUSH_KONTAKT: "Contacto para servicios push",
    h_push: "Apple y Google exigen una dirección de contacto (correo) para las notificaciones push. Vacío = pinn. usa su propia dirección.",
    neustart: "pinn. se está reiniciando …", neustartOk: "reiniciado ✓", neustartFehler: "pinn. no responde. Recarga dentro de uno o dos minutos.",
    pruefeHttps: "Comprobando HTTPS …", pruefeAlles: "Comprobando todo …",
    zertifikatDauert: "El certificado de seguridad se obtiene la primera vez – puede tardar 1–2 minutos …",
    httpsOk: "{0} está accesible ✓",
    httpsFehler: "{0} todavía no responde. Causas habituales: protección DNS rebind del router (paso 5), este dispositivo no está en la red de casa o el certificado necesita algo más de tiempo. Prueba más tarde con «Comprobar de nuevo».",
    httpsAus: "No hay dirección HTTPS configurada (paso DuckDNS).",
    t_geschafft: "¡Listo! 🎉",
    geschafftText: "pinn. está configurado. A partir de ahora abre pinn. con esta dirección y guárdala en todos los móviles (ver «Apps y dispositivos»). Después, crea tu primera familia en la gestión de familias.",
    nochmalPruefen: "Comprobar de nuevo", zurVerwaltung: "A la gestión de familias",
  };
  T.it = {
    titel: "Configurazione",
    lade: "Caricamento della configurazione …",
    weiter: "Avanti",
    zurueck: "Indietro",
    ueberspringen: "Salta",
    spaeter: "Più tardi",
    schliessen: "Chiudi",
    pruefen: "Verifica",
    pruefe: "Verifica in corso …",
    speichere: "Salvataggio …",
    kopieren: "Copia",
    kopiert: "Copiato ✓",
    anleitung: "Guida passo passo",
    optional: "facoltativo",
    erweitert: "Avanzate",
    zeigen: "Mostra",
    gespeichertGeheim: "salvato: ••••{0}",
    leerLassen: "lascia vuoto = invariato",
    ausEnv: "Valore dal file .env o da docker-compose.yaml",
    entfernen: "Rimuovi",
    wirdEntfernt: "verrà rimosso al salvataggio",
    entfernenFrage: "Rimuovere questo valore salvato?",
    schritt: "Passo {0} di {1}",
    fehlerFeld: "Controlla «{0}».",
    fehler: "Non ha funzionato.",
    ok: "OK ✓",
    fehlerNetz: "Nessuna connessione a pinn.: assicurati di essere nella rete di casa.",
    ordnerFehlt: "La cartella «konfig» manca sul NAS. Usa il nuovo docker-compose.yaml ed esegui lo script pinn-setup.sh (oppure «docker compose up -d»). Senza questa cartella la configurazione non può salvare nulla.",
    ordnerSchreibschutz: "La cartella «konfig» è in sola lettura: esegui di nuovo pinn-setup.sh.",
    serverFehlt: "Sul server mancano ancora einrichtung.pb.js e pinn-einrichtung.js (pb_hooks).",
    erkannt: "Rilevato dalla barra degli indirizzi: {0}",
    deineAdresse: "Il tuo indirizzo pinn.:",
    ph_sub: "ad es. famiglia-rossi",
    L_PORT: "Porta HTTPS",
    h_port: "Cambiala solo se hai modificato la porta 8443 in docker-compose.yaml.",
    pflichtInfo: "Sono obbligatori solo «Rete domestica» e «DuckDNS». Tutto il resto puoi saltarlo e recuperarlo in qualsiasi momento: Amministratore principale → Configurazione.",
    serverOk: "pinn. è in esecuzione e può salvare le impostazioni ✓",
    schonFertig: "La configurazione è già stata completata. Puoi controllare e modificare tutto: alla fine applica con «Salva e avvia».",
    bitteWaehlen: "Scegli un’opzione (oppure «Salta»).",
    skipPflicht: "Senza questo passo, HTTPS, le notifiche push e l’app nella schermata Home non funzionano. Saltare comunque?",
    pflichtFehlt: "Compila i campi oppure tocca «Salta».",
    speichernStarten: "Salva e avvia",
    neu: "nuovo",
    nichtGesetzt: "non configurato",
    erledigtKurz: "fatto",
    offen: "aperto",
    eingerichtet: "configurato",
    aus: "spento",
    t_sprache: "Benvenuto in pinn. 👋",
    i_sprache: "Scegli la lingua per la configurazione. Vale poi anche per pinn. su questo dispositivo: ogni profilo potrà scegliere la propria lingua in seguito.",
    t_start: "Cosa ti serve",
    i_start: "In circa 20–30 minuti pinn. è configurato del tutto. Ogni passo viene salvato quando tocchi «Avanti»: puoi interrompere in qualsiasi momento e riprendere da dove eri.",
    l_start: [
      "Accesso al tuo router (per una FRITZ!Box: la password sul retro del dispositivo o la tua)",
      "questo dispositivo nella rete di casa (Wi-Fi): un computer è più comodo, ma va bene anche un telefono",
      "un account Google, GitHub o Reddit per il servizio gratuito DuckDNS",
      "facoltativo: un account Google per i calendari Android e l’IA",
    ],
    t_netz: "Rete domestica: indirizzo del NAS",
    i_netz: "pinn. deve sapere a quale indirizzo si trova il tuo NAS nella rete di casa. Perché questo indirizzo non cambi mai, il router lo riserva in modo permanente.",
    L_NAS_IP: "Indirizzo IP del NAS",
    g_netz: [
      "Guarda la barra degli indirizzi del browser: se c’è qualcosa come `http://192.168.178.20:8090`, il numero prima dei due punti è già l’indirizzo IP del NAS.",
      "Altrimenti controlla nella FRITZ!Box: apri [fritz.box](http://fritz.box) nel browser e accedi con la password della FRITZ!Box.",
      "A sinistra apri «Rete domestica» → «Rete» → scheda «Connessioni di rete».",
      "Cerca il tuo NAS nell’elenco (di solito «UGREEN…» o «DXP…») e tocca la matita (Modifica) a destra.",
      "Annota l’indirizzo IPv4 e spunta «Assegna sempre lo stesso indirizzo IPv4 a questo dispositivo di rete» → «Applica».",
      "Altri router: cerca «Rete domestica», «LAN» o «DHCP»: spesso si chiama «riserva indirizzo» o «IP statico». Nell’app UGREEN l’indirizzo si trova in Pannello di controllo → Rete.",
    ],
    t_duckdns: "Il tuo indirizzo con HTTPS (DuckDNS)",
    i_duckdns: "DuckDNS è un servizio gratuito che dà a pinn. un indirizzo fisso con certificato di sicurezza. pinn. ne ha bisogno per le notifiche push, l’app nella schermata Home e l’accesso con Google. Non serve alcun port forwarding: pinn. resta invisibile dall’esterno.",
    L_DUCKDNS_SUBDOMAIN: "Sottodominio (il nome che vuoi)",
    L_DUCKDNS_TOKEN: "Token DuckDNS",
    L_PINN_ADRESSE: "Indirizzo di pinn.",
    g_duckdns: [
      "Apri [duckdns.org](https://www.duckdns.org).",
      "In alto a destra accedi con uno degli account proposti (ad es. Google, GitHub o Reddit): DuckDNS non ha una password propria.",
      "Scrivi un nome nel campo «sub domain», ad es. `rossi-famiglia` (solo lettere minuscole, cifre e trattini) e tocca «add domain». Se il nome è già preso, provane un altro.",
      "In cima alla pagina vedi il tuo «token»: una lunga stringa con trattini. Selezionala e copiala.",
      "Incolla qui sottodominio e token e tocca «Verifica». pinn. registra da solo l’indirizzo del tuo NAS su DuckDNS: non devi modificare il campo «current ip» sul sito.",
      "Il token è come una password: non condividerlo. Se è successo, tocca «recreate token» su duckdns.org e inserisci qui il nuovo token.",
    ],
    test_duckdns_ok: "DuckDNS ha accettato l’indirizzo ✓: {0} ora punta al tuo NAS ({1}).",
    test_duckdns_ko: "DuckDNS ha rifiutato. Controlla sottodominio e token: il sottodominio deve esistere nel tuo account DuckDNS.",
    test_duckdns_netz: "duckdns.org non è raggiungibile dal NAS. Il NAS ha accesso a internet?",
    test_duckdns_fehlt: "Inserisci sottodominio e token.",
    test_duckdns_ungueltig: "Sottodominio o token non sembrano corretti.",
    test_duckdns_ip_fehlt: "Inserisci prima l’indirizzo IP del NAS nel passo «Rete domestica».",
    t_rebind: "Router: protezione DNS rebind",
    i_rebind: "Il tuo indirizzo pinn. punta a un dispositivo della rete di casa. Molti router, FRITZ!Box compresa, lo bloccano per protezione: allora pinn. non si apre tramite l’indirizzo. Basta un’eccezione proprio per questo indirizzo:",
    g_rebind: [
      "Apri [fritz.box](http://fritz.box) e accedi.",
      "«Rete domestica» → «Rete» → scheda «Impostazioni di rete».",
      "Scorri fino in fondo ed espandi «altre impostazioni».",
      "Nella sezione «Protezione DNS Rebind» inserisci questa riga in «Eccezioni per nomi host»: `{SUB}.duckdns.org`",
      "Tocca «Applica» e, se la FRITZ!Box lo chiede, conferma sul dispositivo.",
      "Altri router: cerca nelle impostazioni «DNS rebind» e inserisci lo stesso indirizzo come eccezione. Se non c’è una voce del genere, di solito non c’è nulla da fare.",
    ],
    rebindErledigt: "Fatto: l’eccezione è stata aggiunta",
    t_fern: "Uso fuori casa (VPN)",
    i_fern: "pinn. non è volutamente aperto a internet. Fuori casa il telefono si collega in modo sicuro a casa tramite VPN, come se fossi nel tuo Wi-Fi. Come vuoi farlo?",
    c_wg: "FRITZ!Box con WireGuard",
    c_wg_d: "Consigliato se hai una FRITZ!Box con FRITZ!OS 7.50 o successivo. Gratuito, non serve un altro account.",
    c_ts: "Tailscale",
    c_ts_d: "Per altri router, o se WireGuard non funziona (ad es. con connessioni DS-Lite). Richiede un account gratuito su tailscale.com.",
    c_kein: "Solo a casa",
    c_kein_d: "Usa pinn. solo nel Wi-Fi di casa. Si può aggiungere in qualsiasi momento.",
    L_TS_AUTHKEY: "Chiave Tailscale (auth key)",
    g_wireguard: [
      "Apri [fritz.box](http://fritz.box) e accedi. In «Sistema» → «Aggiornamento» deve esserci FRITZ!OS 7.50 o successivo (altrimenti aggiorna lì).",
      "«Internet» → «Abilitazioni» → scheda «VPN (WireGuard)» → «Aggiungi connessione».",
      "Scegli «Configurazione semplificata (consigliata)» → «Avanti». Quando chiede se collegare un singolo dispositivo, scegli «Sì».",
      "Inserisci un nome per il telefono (ad es. `Telefono di Anna`) → «Fine». Se la FRITZ!Box chiede conferma: premi un tasto sul dispositivo o conferma sul telefono.",
      "Se la FRITZ!Box chiede un account MyFRITZ!: configuralo gratuitamente, così il telefono trova la tua box fuori casa.",
      "Compare un codice QR. Installa l’app «WireGuard» sul telefono: [iPhone](https://apps.apple.com/app/wireguard/id1441195209) · [Android](https://play.google.com/store/apps/details?id=com.wireguard.android).",
      "Nell’app WireGuard tocca «+» → «Scansiona da codice QR» (iPhone: «Crea da codice QR») → inquadra il codice sullo schermo → dagli un nome → consenti di aggiungere la configurazione VPN.",
      "Prova: spegni il Wi-Fi sul telefono, attiva WireGuard e apri {ADRESSE}.",
      "Ripeti i passi da «Aggiungi connessione» per ogni altro telefono: ogni dispositivo ha la sua connessione.",
    ],
    wgNurPinnT: "Consenti solo pinn. (ad es. per i parenti)",
    wgNurPinn: "Se un dispositivo deve raggiungere tramite VPN solo pinn. e non tutta la rete di casa: nell’app WireGuard tocca la connessione → «Modifica» → in «IP consentiti» sostituisci tutto con `{NAS_IP}/32, {ROUTER_IP}/32` → «Salva». Il secondo indirizzo è il router (per la risoluzione dei nomi). Attenzione: la limitazione vale su quel dispositivo.",
    wgDsLite: "Non funziona fuori casa? Alcune connessioni (DS-Lite, comuni con cavo e fibra) non hanno un indirizzo IPv4 proprio: allora WireGuard funziona solo se il telefono ha IPv6 fuori casa. In quel caso usa Tailscale.",
    g_tailscale: [
      "Apri [login.tailscale.com](https://login.tailscale.com/start) e crea un account gratuito (ad es. accedendo con Google, Microsoft o Apple).",
      "Nella console di amministrazione: in alto «Settings» → a sinistra «Keys» → «Generate auth key…».",
      "Lascia le impostazioni predefinite → «Generate key» → copia la chiave (inizia con `tskey-auth-`) e incollala qui sopra.",
      "Tocca «Avanti». Il container «tailscale» sul NAS la usa per accedere entro un minuto.",
      "Di nuovo nella console di amministrazione Tailscale: scheda «Machines» → sul dispositivo «pinn» tocca «…» → «Edit route settings…» → spunta `{NAS_IP}/32` → «Save».",
      "Sempre su «pinn», sotto «…» → scegli «Disable key expiry»: altrimenti il NAS deve riaccedere ogni 180 giorni.",
      "Installa l’app «Tailscale» su ogni telefono ([iPhone](https://apps.apple.com/app/tailscale/id1470499037) · [Android](https://play.google.com/store/apps/details?id=com.tailscale.ipn)) e accedi con lo stesso account. Invita i parenti in «Users» nella console di amministrazione.",
      "Prova: spegni il Wi-Fi sul telefono, collega Tailscale e apri {ADRESSE}.",
    ],
    keinFern: "Nessun problema: pinn. funziona allora nel Wi-Fi di casa. Puoi aggiungere l’accesso remoto in qualsiasi momento da Amministratore principale → Configurazione.",
    t_google: "Google: calendari e contatti Android",
    i_google: "Facoltativo. Serve se vuoi vedere in pinn. i calendari Google (Android) o i compleanni dei contatti Google. Si configura una volta per tutto il server: poi ognuno accede a pinn. con il proprio account Google. Per iPhone/iCloud qui non c’è nulla da fare.",
    googleBrauchtHttps: "Google richiede l’indirizzo HTTPS del passo «DuckDNS».",
    L_REDIRECT: "URI di reindirizzamento (per la Google Cloud Console)",
    L_PINN_GOOGLE_CLIENT_ID: "ID client",
    L_PINN_GOOGLE_CLIENT_SECRET: "Segreto client",
    g_google: [
      "Apri [console.cloud.google.com](https://console.cloud.google.com) e accedi con un account Google (la prima volta accetta le condizioni d’uso).",
      "Tocca il selettore di progetto in alto → «Nuovo progetto» → nome `pinn` → «Crea». Poi seleziona in alto il progetto «pinn».",
      "Attiva tre API: apri ciascuna e tocca «Abilita»: [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) · [CalDAV API](https://console.cloud.google.com/apis/library/caldav.googleapis.com) · [People API](https://console.cloud.google.com/apis/library/people.googleapis.com).",
      "Apri [Google Auth Platform](https://console.cloud.google.com/auth/overview) → «Inizia»: nome app `pinn.`, e-mail di supporto = il tuo indirizzo → pubblico «Esterno» → e-mail di contatto → accetta → «Crea».",
      "A sinistra «Pubblico» → «Pubblica app» → conferma. Importante: nello stato «Testing» ogni collegamento Google scade dopo 7 giorni.",
      "A sinistra «Client» → «Crea client» → tipo di applicazione «Applicazione web», nome `pinn.`.",
      "In «URI di reindirizzamento autorizzati» → «Aggiungi URI» e incolla esattamente questo indirizzo: `{REDIRECT}` → «Crea».",
      "Copia ID client e segreto client, incollali qui e tocca «Verifica». (Google mostra il segreto una sola volta: altrimenti usa «Aggiungi segreto» sul client.)",
      "Al momento del collegamento Google mostra «Google non ha verificato questa app». È normale per la tua app privata: «Avanzate» → «Vai a pinn.».",
    ],
    test_google_ok: "Google riconosce questo client ✓",
    test_google_uri: "ID client e segreto sono corretti, ma nel client manca l’URI di reindirizzamento: {0}",
    test_google_ungueltig: "Google non riconosce questo ID client o segreto: copiali di nuovo.",
    test_google_netz: "Google non è raggiungibile dal NAS.",
    test_google_fehlt: "Inserisci ID client e segreto client.",
    t_ki: "IA per le ricette (Google Gemini)",
    i_ki: "Facoltativo. L’IA legge molto meglio le ricette da testo, foto, PDF e link e trova il tuo calendario della raccolta rifiuti. La chiave è gratuita e resta sul NAS: le app non parlano mai direttamente con Google.",
    L_PINN_GEMINI_KEY: "Chiave API Gemini",
    L_PINN_GEMINI_MODELL: "Modello fisso",
    h_modell: "Vuoto = automaticamente il modello Flash attuale.",
    g_ki: [
      "Apri [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e accedi con un account Google.",
      "Tocca «Create API key». Se Google chiede un progetto, scegli il progetto «pinn» del passo precedente oppure creane uno nuovo.",
      "Copia la chiave (di solito inizia con `AIza`), incollala qui e tocca «Verifica».",
      "Da sapere: nel piano gratuito Google può usare i testi delle ricette inviate per migliorare i propri servizi.",
    ],
    test_gemini_ok: "La chiave è valida ✓",
    test_gemini_ungueltig: "Google rifiuta la chiave: copiala di nuovo.",
    test_gemini_gesperrt: "La chiave è bloccata per l’API Gemini. Crea una nuova chiave in AI Studio.",
    test_gemini_netz: "Google non è raggiungibile dal NAS.",
    test_gemini_fehlt: "Inserisci la chiave.",
    t_ortung: "Posizione (Famiglia → posizioni in tempo reale)",
    i_ortung: "Facoltativo. I telefoni condividono la posizione direttamente in pinn.: qui non c’è nulla da inserire. Il container «traccar» serve solo per i localizzatori GPS con SIM.",
    l_ortung: [
      "La condivisione della posizione funziona direttamente in pinn. (Famiglia → Posizione). Per continuare a inviarla anche con pinn. chiuso, installa l’app «Traccar Client»: invia direttamente a pinn.",
      "pinn. mostra poi l’indirizzo del server e l’ID del dispositivo di ciascuna persona in Famiglia → ⚙︎ Posizione.",
      "Fuori casa il telefono ha bisogno della VPN del passo «Uso fuori casa».",
      "I localizzatori GPS con SIM (ad es. sul collare di un cane) inviano dalla rete mobile: serve il port forwarding nel router. pinn. mostra le istruzioni quando aggiungi il localizzatore.",
    ],
    appTraccar: "App «Traccar Client»:",
    h_traccar: "Compila solo se hai già creato tu un account in Traccar. Vuoto = pinn. ne crea uno da solo.",
    L_PINN_TRACCAR_EMAIL: "E-mail Traccar",
    L_PINN_TRACCAR_PASSWORT: "Password Traccar",
    test_traccar_ok: "Traccar è in esecuzione ✓",
    test_traccar_aus: "Il container «traccar» non è in esecuzione: per i telefoni non serve. Solo per i localizzatori GPS: aggiungi COMPOSE_PROFILES=tracker al file .env.",
    t_ha: "Smart home: Home Assistant",
    i_ha: "Facoltativo. Dove gira il tuo Home Assistant?",
    c_ha_kein: "Nessun Home Assistant",
    c_ha_geraet: "Su un dispositivo separato",
    c_ha_geraet_d: "ad es. Raspberry Pi o Home Assistant Green.",
    c_ha_vm: "Come macchina virtuale su questo NAS",
    c_ha_vm_d: "Allora pinn. configura una piccola deviazione di rete: altrimenti il NAS non raggiunge la VM.",
    haGeraetInfo: "Qui non c’è nulla da inserire. Ogni famiglia configura il collegamento in pinn. da Impostazioni → Smart home.",
    L_HA_IP: "Indirizzo IP di Home Assistant",
    L_HILFS_IP: "Indirizzo ausiliario libero",
    L_NAS_NETZWERKKARTE: "Interfaccia di rete del NAS",
    h_karte: "«auto» = pinn. riconosce da solo l’interfaccia di rete.",
    g_ha: [
      "IP di Home Assistant: in Home Assistant «Impostazioni» → «Sistema» → «Rete», oppure trova il dispositivo «homeassistant» nella FRITZ!Box in «Rete domestica» → «Rete». Anche lì spunta «assegna sempre lo stesso indirizzo IPv4».",
      "Indirizzo ausiliario: un indirizzo della rete di casa che nessun dispositivo usa e che il router non assegna mai. Nella FRITZ!Box, «Rete domestica» → «Rete» → «Impostazioni di rete» → «Impostazioni IPv4» mostra l’intervallo assegnato dal router (ad es. da .20 a .200). Scegli un indirizzo sopra, ad es. `{VORSCHLAG}`.",
      "Tocca «Avanti»: il container «ha-netz» configura la deviazione entro un minuto. «Verifica» mostra se pinn. raggiunge Home Assistant.",
      "Ogni famiglia inserisce il token di accesso di Home Assistant più tardi in pinn., da Impostazioni → Smart home.",
    ],
    haAktiv: "Deviazione attiva tramite {0} (indirizzo ausiliario {1}) ✓",
    haWartet: "La deviazione è in attesa delle impostazioni.",
    haFehler: "Non è stato possibile configurare la deviazione (interfaccia di rete: {0}).",
    test_homeassistant_ok: "Home Assistant è raggiungibile ✓",
    test_homeassistant_aus: "Home Assistant non è (ancora) raggiungibile. Dopo «Avanti» attendi fino a un minuto e verifica di nuovo.",
    test_homeassistant_fehlt: "Inserisci l’indirizzo IP di Home Assistant.",
    t_apps: "App e dispositivi",
    i_apps: "Quasi fatto! Ecco cosa serve ai familiari sui loro telefoni:",
    a_home_t: "pinn. nella schermata Home (per tutti)",
    a_home: [
      "iPhone/iPad: apri {ADRESSE} in Safari → icona di condivisione (quadrato con freccia) → «Aggiungi a Home» → «Aggiungi». Solo così funzionano le notifiche push (iOS 16.4 o successivo).",
      "Android: apri {ADRESSE} in Chrome → ⋮ in alto a destra → «Installa app» o «Aggiungi a schermata Home».",
      "Usa sempre l’indirizzo https, non quello con :8090.",
    ],
    a_vpn: "Per l’uso fuori casa: configurazione al passo «Uso fuori casa»:",
    a_traccar: "Solo per il rilevamento della posizione:",
    a_icloud_t: "Calendario iCloud (iPhone)",
    a_icloud: "Ogni famiglia collega da sola il proprio calendario iCloud in pinn., da Impostazioni → Calendario. Serve una password specifica per l’app: [account.apple.com](https://account.apple.com) → «Accesso e sicurezza» → «Password specifiche per le app» → «+» → nome `pinn.` → inserisci in pinn. la password mostrata (xxxx-xxxx-xxxx-xxxx).",
    a_push_t: "Notifiche push",
    a_push: "Ognuno le attiva in pinn. da Impostazioni → Notifiche → «Attiva su questo dispositivo»; su iPhone solo nell’app dalla schermata Home.",
    t_fertig: "Riepilogo",
    i_fertig: "Controlla i dettagli. Con «Salva e avvia» pinn. applica tutto e si riavvia brevemente una volta (circa 10–20 secondi).",
    S_ADRESSE: "Indirizzo",
    S_REBIND: "Eccezione DNS rebind",
    S_FERN: "Fuori casa",
    S_KI: "IA",
    S_ORTUNG: "Posizione",
    L_PINN_PUSH_KONTAKT: "Contatto per i servizi push",
    h_push: "Apple e Google richiedono un indirizzo di contatto (e-mail) per le notifiche push. Vuoto = pinn. usa un indirizzo proprio.",
    neustart: "pinn. si sta riavviando …",
    neustartOk: "riavviato ✓",
    neustartFehler: "pinn. non risponde. Ricarica tra un minuto o due.",
    pruefeHttps: "Verifica HTTPS in corso …",
    pruefeAlles: "Verifica di tutto in corso …",
    zertifikatDauert: "Il certificato di sicurezza viene richiesto la prima volta: può volerci 1–2 minuti …",
    httpsOk: "{0} è raggiungibile ✓",
    httpsFehler: "{0} non risponde ancora. Cause frequenti: la protezione DNS rebind nel router (passo 5), questo dispositivo non è nella rete di casa oppure il certificato impiega ancora un po’. Riprova più tardi con «Verifica di nuovo».",
    httpsAus: "Nessun indirizzo HTTPS configurato (passo DuckDNS).",
    t_geschafft: "Fatto! 🎉",
    geschafftText: "pinn. è configurato. D’ora in poi apri pinn. da questo indirizzo e salvalo su tutti i telefoni (vedi «App e dispositivi»). Poi crea la tua prima famiglia nella gestione famiglie.",
    nochmalPruefen: "Verifica di nuovo",
    zurVerwaltung: "Alla gestione famiglie",
  };
  T.pt = {
    titel: "Configuração",
    lade: "Carregando a configuração …",
    weiter: "Avançar",
    zurueck: "Voltar",
    ueberspringen: "Pular",
    spaeter: "Mais tarde",
    schliessen: "Fechar",
    pruefen: "Verificar",
    pruefe: "Verificando …",
    speichere: "Salvando …",
    kopieren: "Copiar",
    kopiert: "Copiado ✓",
    anleitung: "Guia passo a passo",
    optional: "opcional",
    erweitert: "Avançado",
    zeigen: "Mostrar",
    gespeichertGeheim: "salvo: ••••{0}",
    leerLassen: "deixe em branco = inalterado",
    ausEnv: "Valor do .env ou do docker-compose.yaml",
    entfernen: "Remover",
    wirdEntfernt: "será removido ao salvar",
    entfernenFrage: "Remover este valor salvo?",
    schritt: "Passo {0} de {1}",
    fehlerFeld: "Verifique “{0}”.",
    fehler: "Não deu certo.",
    ok: "OK ✓",
    fehlerNetz: "Sem conexão com o pinn. – verifique se você está na rede de casa.",
    ordnerFehlt: "A pasta “konfig” não existe no NAS. Use o novo docker-compose.yaml e execute o script pinn-setup.sh (ou “docker compose up -d”). Sem essa pasta, a configuração não consegue salvar nada.",
    ordnerSchreibschutz: "A pasta “konfig” é somente leitura – execute o pinn-setup.sh de novo.",
    serverFehlt: "Ainda faltam einrichtung.pb.js e pinn-einrichtung.js (pb_hooks) no servidor.",
    erkannt: "Detectado na barra de endereço: {0}",
    deineAdresse: "O seu endereço do pinn.:",
    ph_sub: "ex.: familia-silva",
    L_PORT: "Porta HTTPS",
    h_port: "Só altere se você mudou a porta 8443 no docker-compose.yaml.",
    pflichtInfo: "Só “Rede doméstica” e “DuckDNS” são obrigatórios. Você pode pular o resto e voltar quando quiser: Administrador principal → Configuração.",
    serverOk: "O pinn. está em execução e consegue salvar as configurações ✓",
    schonFertig: "A configuração já foi concluída. Você pode conferir e alterar tudo – no fim, aplique com “Salvar e iniciar”.",
    bitteWaehlen: "Escolha uma opção (ou “Pular”).",
    skipPflicht: "Sem este passo, HTTPS, notificações push e o app na tela de início não funcionam. Pular mesmo assim?",
    pflichtFehlt: "Preencha os campos – ou toque em “Pular”.",
    speichernStarten: "Salvar e iniciar",
    neu: "novo",
    nichtGesetzt: "não configurado",
    erledigtKurz: "feito",
    offen: "em aberto",
    eingerichtet: "configurado",
    aus: "desligado",
    t_sprache: "Bem-vindo ao pinn. 👋",
    i_sprache: "Escolha o idioma para a configuração. Depois ele também vale para o pinn. neste aparelho – cada perfil poderá escolher o seu próprio idioma mais tarde.",
    t_start: "O que você precisa",
    i_start: "Em cerca de 20–30 minutos o pinn. estará totalmente configurado. Cada passo é salvo quando você toca em “Avançar” – assim você pode parar a qualquer momento e continuar de onde parou.",
    l_start: [
      "Acesso ao seu roteador (numa FRITZ!Box: a senha na parte de baixo do aparelho ou a sua própria)",
      "este aparelho na rede de casa (Wi-Fi) – um computador é o mais fácil, mas um celular também serve",
      "uma conta do Google, GitHub ou Reddit para o serviço gratuito DuckDNS",
      "opcional: uma conta do Google para os calendários do Android e a IA",
    ],
    t_netz: "Rede doméstica: endereço do NAS",
    i_netz: "O pinn. precisa saber em qual endereço o seu NAS está na rede de casa. Para que esse endereço nunca mude, o roteador o reserva de forma permanente.",
    L_NAS_IP: "Endereço IP do NAS",
    g_netz: [
      "Olhe a barra de endereço do navegador: se aparecer algo como `http://192.168.178.20:8090`, o número antes dos dois pontos já é o endereço IP do NAS.",
      "Caso contrário, confira na FRITZ!Box: abra [fritz.box](http://fritz.box) no navegador e entre com a senha da FRITZ!Box.",
      "À esquerda, abra “Rede doméstica” → “Rede” → aba “Conexões de rede”.",
      "Procure o seu NAS na lista (geralmente “UGREEN…” ou “DXP…”) e toque no lápis (editar) à direita.",
      "Anote o endereço IPv4 e marque “Sempre atribuir o mesmo endereço IPv4 a este dispositivo de rede” → “Aplicar”.",
      "Outros roteadores: procure “Rede doméstica”, “LAN” ou “DHCP” – geralmente se chama “reservar endereço” ou “IP estático”. No app da UGREEN, o endereço fica em Painel de controle → Rede.",
    ],
    t_duckdns: "O seu endereço com HTTPS (DuckDNS)",
    i_duckdns: "O DuckDNS é um serviço gratuito que dá ao pinn. um endereço fixo com certificado de segurança. O pinn. precisa dele para notificações push, para o app na tela de início e para o login com o Google. Não é preciso redirecionar portas – o pinn. continua invisível de fora.",
    L_DUCKDNS_SUBDOMAIN: "Subdomínio (o nome que quiser)",
    L_DUCKDNS_TOKEN: "Token do DuckDNS",
    L_PINN_ADRESSE: "Endereço do pinn.",
    g_duckdns: [
      "Abra [duckdns.org](https://www.duckdns.org).",
      "No canto superior direito, entre com uma das contas oferecidas (por exemplo, Google, GitHub ou Reddit) – o DuckDNS não tem senha própria.",
      "Digite um nome no campo “sub domain”, por exemplo `familia-silva` (só letras minúsculas, números e hifens) e toque em “add domain”. Se o nome já estiver em uso, tente outro.",
      "No topo da página você verá o seu “token” – uma sequência longa com hifens. Selecione e copie.",
      "Cole aqui o subdomínio e o token e toque em “Verificar”. O pinn. registra sozinho o endereço do seu NAS no DuckDNS – você não precisa mexer no campo “current ip” do site.",
      "O token é como uma senha – não o compartilhe. Se isso aconteceu, toque em “recreate token” em duckdns.org e informe aqui o novo token.",
    ],
    test_duckdns_ok: "O DuckDNS aceitou o endereço ✓ – {0} agora aponta para o seu NAS ({1}).",
    test_duckdns_ko: "O DuckDNS recusou. Verifique o subdomínio e o token – o subdomínio precisa existir na sua conta do DuckDNS.",
    test_duckdns_netz: "Não é possível acessar duckdns.org a partir do NAS. O NAS tem acesso à internet?",
    test_duckdns_fehlt: "Informe o subdomínio e o token.",
    test_duckdns_ungueltig: "O subdomínio ou o token não parecem corretos.",
    test_duckdns_ip_fehlt: "Informe primeiro o endereço IP do NAS na etapa “Rede doméstica”.",
    t_rebind: "Roteador: proteção contra DNS rebind",
    i_rebind: "O seu endereço do pinn. aponta para um aparelho da rede de casa. Muitos roteadores – inclusive a FRITZ!Box – bloqueiam isso por proteção. Aí o pinn. não abre pelo endereço. Uma exceção justamente para esse endereço resolve:",
    g_rebind: [
      "Abra [fritz.box](http://fritz.box) e entre.",
      "“Rede doméstica” → “Rede” → aba “Configurações de rede”.",
      "Role até o fim e expanda “configurações adicionais”.",
      "Na seção “Proteção contra DNS Rebind”, digite esta linha em “Exceções de nome de host”: `{SUB}.duckdns.org`",
      "Toque em “Aplicar” e – se a FRITZ!Box pedir – confirme no aparelho.",
      "Outros roteadores: procure “DNS rebind” nas configurações e informe o mesmo endereço como exceção. Se não houver essa opção, geralmente não há nada a fazer.",
    ],
    rebindErledigt: "Pronto – a exceção foi adicionada",
    t_fern: "Uso fora de casa (VPN)",
    i_fern: "O pinn. propositalmente não fica aberto para a internet. Fora de casa, o celular se conecta com segurança à sua casa por VPN – como se você estivesse no seu Wi-Fi. Como você quer fazer isso?",
    c_wg: "FRITZ!Box com WireGuard",
    c_wg_d: "Recomendado se você tem uma FRITZ!Box com FRITZ!OS 7.50 ou superior. Gratuito, sem precisar de outra conta.",
    c_ts: "Tailscale",
    c_ts_d: "Para outros roteadores – ou se o WireGuard não funcionar (por exemplo, em conexões DS-Lite). Requer uma conta gratuita em tailscale.com.",
    c_kein: "Só em casa",
    c_kein_d: "Use o pinn. só no Wi-Fi de casa. Dá para adicionar a qualquer momento.",
    L_TS_AUTHKEY: "Chave do Tailscale (auth key)",
    g_wireguard: [
      "Abra [fritz.box](http://fritz.box) e entre. Em “Sistema” → “Atualização” deve constar FRITZ!OS 7.50 ou superior (se não, atualize ali).",
      "“Internet” → “Liberações” → aba “VPN (WireGuard)” → “Adicionar conexão”.",
      "Escolha “Configuração simplificada (recomendada)” → “Avançar”. Quando perguntar se um único aparelho deve ser conectado, escolha “Sim”.",
      "Digite um nome para o celular (por exemplo, `Celular da Ana`) → “Concluir”. Se a FRITZ!Box pedir confirmação: aperte um botão no aparelho ou confirme no celular.",
      "Se a FRITZ!Box pedir uma conta MyFRITZ!, crie-a gratuitamente – é assim que o celular encontra a sua box fora de casa.",
      "Aparece um código QR. Instale o app “WireGuard” no celular: [iPhone](https://apps.apple.com/app/wireguard/id1441195209) · [Android](https://play.google.com/store/apps/details?id=com.wireguard.android).",
      "No app WireGuard, toque em “+” → “Ler de código QR” (iPhone: “Criar a partir de código QR”) → escaneie o código na tela → dê um nome → permita adicionar a configuração de VPN.",
      "Teste: desligue o Wi-Fi do celular, ative o WireGuard e abra {ADRESSE}.",
      "Repita os passos a partir de “Adicionar conexão” para cada outro celular – cada aparelho tem a sua própria conexão.",
    ],
    wgNurPinnT: "Permitir só o pinn. (por exemplo, para parentes)",
    wgNurPinn: "Se um aparelho deve alcançar só o pinn. pela VPN e não toda a rede de casa: no app WireGuard, toque na conexão → “Editar” → em “IPs permitidos” substitua tudo por `{NAS_IP}/32, {ROUTER_IP}/32` → “Salvar”. O segundo endereço é o roteador (para resolução de nomes). Atenção: a restrição vale nesse aparelho.",
    wgDsLite: "Não funciona fora de casa? Algumas conexões (DS-Lite, comuns em cabo e fibra) não têm endereço IPv4 próprio – nesse caso o WireGuard só funciona se o celular tiver IPv6 fora de casa. Use o Tailscale nesse caso.",
    g_tailscale: [
      "Abra [login.tailscale.com](https://login.tailscale.com/start) e crie uma conta gratuita (por exemplo, entrando com Google, Microsoft ou Apple).",
      "No console de administração: “Settings” no topo → “Keys” à esquerda → “Generate auth key…”.",
      "Mantenha o padrão → “Generate key” → copie a chave (começa com `tskey-auth-`) e cole acima.",
      "Toque em “Avançar”. O contêiner “tailscale” no NAS a usa para entrar em até um minuto.",
      "De volta ao console de administração do Tailscale: aba “Machines” → no aparelho “pinn”, toque em “…” → “Edit route settings…” → marque `{NAS_IP}/32` → “Save”.",
      "Ainda em “pinn”, em “…” → escolha “Disable key expiry” – senão o NAS precisa entrar de novo a cada 180 dias.",
      "Instale o app “Tailscale” em cada celular ([iPhone](https://apps.apple.com/app/tailscale/id1470499037) · [Android](https://play.google.com/store/apps/details?id=com.tailscale.ipn)) e entre com a mesma conta. Convide parentes em “Users” no console de administração.",
      "Teste: desligue o Wi-Fi do celular, conecte o Tailscale e abra {ADRESSE}.",
    ],
    keinFern: "Sem problema – o pinn. funciona então no Wi-Fi de casa. Você pode adicionar o acesso remoto a qualquer momento em Administrador principal → Configuração.",
    t_google: "Google: calendários e contatos do Android",
    i_google: "Opcional. Necessário se você quiser ver no pinn. calendários do Google (Android) ou aniversários dos contatos do Google. É configurado uma vez para todo o servidor – depois cada pessoa entra no pinn. com a própria conta do Google. Para iPhone/iCloud não há nada a fazer aqui.",
    googleBrauchtHttps: "O Google exige o endereço HTTPS da etapa “DuckDNS”.",
    L_REDIRECT: "URI de redirecionamento (para o Google Cloud Console)",
    L_PINN_GOOGLE_CLIENT_ID: "ID do cliente",
    L_PINN_GOOGLE_CLIENT_SECRET: "Chave secreta do cliente",
    g_google: [
      "Abra [console.cloud.google.com](https://console.cloud.google.com) e entre com uma conta do Google (na primeira vez, aceite os termos de uso).",
      "Toque no seletor de projeto no topo → “Novo projeto” → nome `pinn` → “Criar”. Depois selecione o projeto “pinn” no topo.",
      "Ative três APIs – abra cada uma e toque em “Ativar”: [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) · [CalDAV API](https://console.cloud.google.com/apis/library/caldav.googleapis.com) · [People API](https://console.cloud.google.com/apis/library/people.googleapis.com).",
      "Abra a [Google Auth Platform](https://console.cloud.google.com/auth/overview) → “Começar”: nome do app `pinn.`, e-mail de suporte = o seu endereço → público “Externo” → e-mail de contato → concorde → “Criar”.",
      "À esquerda, “Público” → “Publicar app” → confirme. Importante: no status “Testing”, toda conexão com o Google expira após 7 dias.",
      "À esquerda, “Clientes” → “Criar cliente” → tipo de aplicativo “Aplicativo da Web”, nome `pinn.`.",
      "Em “URIs de redirecionamento autorizados” → “Adicionar URI” e cole exatamente este endereço: `{REDIRECT}` → “Criar”.",
      "Copie o ID do cliente e a chave secreta, cole aqui e toque em “Verificar”. (O Google mostra a chave secreta só uma vez – senão, use “Adicionar chave secreta” no cliente.)",
      "Ao conectar mais tarde, o Google mostra “O Google não verificou este app”. Isso é normal para o seu app particular: “Avançado” → “Acessar pinn.”.",
    ],
    test_google_ok: "O Google reconhece este cliente ✓",
    test_google_uri: "O ID do cliente e a chave secreta estão corretos, mas o URI de redirecionamento não consta no cliente: {0}",
    test_google_ungueltig: "O Google não reconhece este ID do cliente ou esta chave secreta – copie de novo.",
    test_google_netz: "Não é possível acessar o Google a partir do NAS.",
    test_google_fehlt: "Informe o ID do cliente e a chave secreta do cliente.",
    t_ki: "IA para receitas (Google Gemini)",
    i_ki: "Opcional. A IA lê muito melhor receitas a partir de texto, fotos, PDFs e links e encontra o seu calendário de coleta de lixo. A chave é gratuita e fica no NAS – os apps nunca falam diretamente com o Google.",
    L_PINN_GEMINI_KEY: "Chave de API do Gemini",
    L_PINN_GEMINI_MODELL: "Modelo fixo",
    h_modell: "Vazio = automaticamente o modelo Flash atual.",
    g_ki: [
      "Abra [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e entre com uma conta do Google.",
      "Toque em “Create API key”. Se o Google pedir um projeto, escolha o projeto “pinn” da etapa anterior ou crie um novo.",
      "Copie a chave (geralmente começa com `AIza`), cole aqui e toque em “Verificar”.",
      "Bom saber: no plano gratuito, o Google pode usar os textos de receitas enviados para melhorar seus serviços.",
    ],
    test_gemini_ok: "A chave é válida ✓",
    test_gemini_ungueltig: "O Google rejeita a chave – copie de novo.",
    test_gemini_gesperrt: "A chave está bloqueada para a API do Gemini. Crie uma nova chave no AI Studio.",
    test_gemini_netz: "Não é possível acessar o Google a partir do NAS.",
    test_gemini_fehlt: "Informe a chave.",
    t_ortung: "Localização (Família → localizações ao vivo)",
    i_ortung: "Opcional. Os celulares compartilham a localização diretamente no pinn. – não há nada para informar aqui. O contêiner “traccar” só é necessário para rastreadores GPS com chip SIM.",
    l_ortung: [
      "O compartilhamento de localização funciona direto no pinn. (Família → Localização). Para continuar enviando com o pinn. fechado, instale o app “Traccar Client” – ele envia direto para o pinn.",
      "Depois, o pinn. mostra o endereço do servidor e o ID do dispositivo de cada pessoa em Família → ⚙︎ Localização.",
      "Fora de casa, o celular precisa da VPN da etapa “Uso fora de casa”.",
      "Rastreadores GPS com chip SIM (por exemplo, na coleira de um cachorro) enviam pela rede móvel – isso exige redirecionamento de portas no roteador. O pinn. mostra as instruções ao adicionar o rastreador.",
    ],
    appTraccar: "App “Traccar Client”:",
    h_traccar: "Preencha só se você mesmo já criou uma conta no Traccar. Vazio = o pinn. cria uma sozinho.",
    L_PINN_TRACCAR_EMAIL: "E-mail do Traccar",
    L_PINN_TRACCAR_PASSWORT: "Senha do Traccar",
    test_traccar_ok: "O Traccar está em execução ✓",
    test_traccar_aus: "O contêiner “traccar” não está em execução – não é necessário para celulares. Só para rastreadores GPS: adicione COMPOSE_PROFILES=tracker ao arquivo .env.",
    t_ha: "Casa inteligente: Home Assistant",
    i_ha: "Opcional. Onde o seu Home Assistant está rodando?",
    c_ha_kein: "Sem Home Assistant",
    c_ha_geraet: "Em um aparelho separado",
    c_ha_geraet_d: "por exemplo, Raspberry Pi ou Home Assistant Green.",
    c_ha_vm: "Como máquina virtual neste NAS",
    c_ha_vm_d: "Aí o pinn. configura um pequeno desvio de rede – senão o NAS não alcança a VM.",
    haGeraetInfo: "Não há nada para informar aqui. Cada família configura a conexão no pinn. em Ajustes → Casa inteligente.",
    L_HA_IP: "Endereço IP do Home Assistant",
    L_HILFS_IP: "Endereço auxiliar livre",
    L_NAS_NETZWERKKARTE: "Interface de rede do NAS",
    h_karte: "“auto” = o pinn. detecta sozinho a interface de rede.",
    g_ha: [
      "IP do Home Assistant: no Home Assistant, “Configurações” → “Sistema” → “Rede” – ou encontre o aparelho “homeassistant” na FRITZ!Box em “Rede doméstica” → “Rede”. Lá também marque “sempre atribuir o mesmo endereço IPv4”.",
      "Endereço auxiliar: um endereço da sua rede de casa que nenhum aparelho usa e que o roteador nunca distribui. Na FRITZ!Box, “Rede doméstica” → “Rede” → “Configurações de rede” → “Configurações de IPv4” mostra a faixa distribuída pelo roteador (por exemplo, de .20 a .200). Escolha um endereço acima dela, por exemplo `{VORSCHLAG}`.",
      "Toque em “Avançar” – o contêiner “ha-netz” configura o desvio em até um minuto. “Verificar” mostra se o pinn. alcança o Home Assistant.",
      "Cada família informa o token de acesso do Home Assistant mais tarde no pinn., em Ajustes → Casa inteligente.",
    ],
    haAktiv: "Desvio ativo via {0} (endereço auxiliar {1}) ✓",
    haWartet: "O desvio está aguardando as configurações.",
    haFehler: "Não foi possível configurar o desvio (interface de rede: {0}).",
    test_homeassistant_ok: "O Home Assistant está acessível ✓",
    test_homeassistant_aus: "O Home Assistant (ainda) não está acessível. Depois de “Avançar”, espere até um minuto e verifique de novo.",
    test_homeassistant_fehlt: "Informe o endereço IP do Home Assistant.",
    t_apps: "Apps e aparelhos",
    i_apps: "Quase pronto! Isto é o que os membros da família precisam nos celulares:",
    a_home_t: "pinn. na tela de início (para todos)",
    a_home: [
      "iPhone/iPad: abra {ADRESSE} no Safari → ícone de compartilhar (quadrado com seta) → “Adicionar à Tela de Início” → “Adicionar”. Só assim as notificações push funcionam (iOS 16.4 ou superior).",
      "Android: abra {ADRESSE} no Chrome → ⋮ no canto superior direito → “Instalar app” ou “Adicionar à tela inicial”.",
      "Use sempre o endereço https – não o endereço com :8090.",
    ],
    a_vpn: "Para uso fora de casa – configuração na etapa “Uso fora de casa”:",
    a_traccar: "Só para o rastreamento de localização:",
    a_icloud_t: "Calendário do iCloud (iPhone)",
    a_icloud: "Cada família conecta sozinha o seu calendário do iCloud no pinn., em Ajustes → Calendário. Isso exige uma senha específica de app: [account.apple.com](https://account.apple.com) → “Login e Segurança” → “Senhas Específicas de App” → “+” → nome `pinn.` → informe no pinn. a senha exibida (xxxx-xxxx-xxxx-xxxx).",
    a_push_t: "Notificações push",
    a_push: "Cada pessoa as ativa no pinn. em Ajustes → Notificações → “Ativar neste aparelho” – no iPhone, só no app da tela de início.",
    t_fertig: "Resumo",
    i_fertig: "Confira os detalhes. Com “Salvar e iniciar”, o pinn. aplica tudo e reinicia brevemente uma vez (cerca de 10–20 segundos).",
    S_ADRESSE: "Endereço",
    S_REBIND: "Exceção de DNS rebind",
    S_FERN: "Fora de casa",
    S_KI: "IA",
    S_ORTUNG: "Localização",
    L_PINN_PUSH_KONTAKT: "Contato para os serviços de push",
    h_push: "A Apple e o Google exigem um endereço de contato (e-mail) para notificações push. Vazio = o pinn. usa um endereço próprio.",
    neustart: "O pinn. está reiniciando …",
    neustartOk: "reiniciado ✓",
    neustartFehler: "O pinn. não está respondendo. Recarregue em um ou dois minutos.",
    pruefeHttps: "Verificando HTTPS …",
    pruefeAlles: "Verificando tudo …",
    zertifikatDauert: "O certificado de segurança é obtido na primeira vez – isso pode levar 1–2 minutos …",
    httpsOk: "{0} está acessível ✓",
    httpsFehler: "{0} ainda não responde. Causas comuns: a proteção contra DNS rebind no roteador (passo 5), este aparelho não está na rede de casa ou o certificado precisa de mais um tempinho. Teste depois com “Verificar de novo”.",
    httpsAus: "Nenhum endereço HTTPS configurado (etapa DuckDNS).",
    t_geschafft: "Pronto! 🎉",
    geschafftText: "O pinn. está configurado. A partir de agora, abra o pinn. por este endereço e salve-o em todos os celulares (veja “Apps e aparelhos”). Em seguida, crie a sua primeira família no gerenciamento de famílias.",
    nochmalPruefen: "Verificar de novo",
    zurVerwaltung: "Ir para o gerenciamento de famílias",
  };
  T.zh = {
    titel: "设置向导",
    lade: "正在加载设置向导 …",
    weiter: "下一步",
    zurueck: "返回",
    ueberspringen: "跳过",
    spaeter: "稍后",
    schliessen: "关闭",
    pruefen: "检查",
    pruefe: "正在检查 …",
    speichere: "正在保存 …",
    kopieren: "复制",
    kopiert: "已复制 ✓",
    anleitung: "分步指南",
    optional: "可选",
    erweitert: "高级",
    zeigen: "显示",
    gespeichertGeheim: "已保存：••••{0}",
    leerLassen: "留空 = 不变",
    ausEnv: "来自 .env 或 docker-compose.yaml 的值",
    entfernen: "移除",
    wirdEntfernt: "保存时会被移除",
    entfernenFrage: "要移除这个已保存的值吗？",
    schritt: "第 {0} 步，共 {1} 步",
    fehlerFeld: "请检查“{0}”。",
    fehler: "没成功。",
    ok: "没问题 ✓",
    fehlerNetz: "没有连接到 pinn.——请确认你在家庭网络中。",
    ordnerFehlt: "NAS 上缺少“konfig”文件夹。请使用新的 docker-compose.yaml 并运行脚本 pinn-setup.sh（或“docker compose up -d”）。没有这个文件夹，设置向导无法保存任何内容。",
    ordnerSchreibschutz: "“konfig”文件夹是只读的——请再次运行 pinn-setup.sh。",
    serverFehlt: "服务器上仍缺少 einrichtung.pb.js 和 pinn-einrichtung.js（pb_hooks）。",
    erkannt: "从地址栏识别到：{0}",
    deineAdresse: "你的 pinn. 地址：",
    ph_sub: "例如 wang-family",
    L_PORT: "HTTPS 端口",
    h_port: "只有在你修改了 docker-compose.yaml 中的 8443 端口时才需要更改。",
    pflichtInfo: "只有“家庭网络”和“DuckDNS”是必填的。其他都可以跳过，之后随时补上：主管理员 → 设置向导。",
    serverOk: "pinn. 正在运行，可以保存设置 ✓",
    schonFertig: "设置已经完成。你可以检查和更改一切——最后用“保存并启动”来应用。",
    bitteWaehlen: "请选择一个选项（或点“跳过”）。",
    skipPflicht: "没有这一步，HTTPS、推送通知和主屏幕上的应用都无法使用。仍要跳过吗？",
    pflichtFehlt: "请填写这些字段——或点按“跳过”。",
    speichernStarten: "保存并启动",
    neu: "新",
    nichtGesetzt: "未设置",
    erledigtKurz: "已完成",
    offen: "未完成",
    eingerichtet: "已设置",
    aus: "关闭",
    t_sprache: "欢迎使用 pinn. 👋",
    i_sprache: "请选择设置向导使用的语言。之后它也会用于此设备上的 pinn.——每个个人资料以后都可以选择自己的语言。",
    t_start: "你需要准备什么",
    i_start: "大约 20–30 分钟就能完成 pinn. 的全部设置。每一步在你点按“下一步”时都会被保存——所以你可以随时中断，之后从同一处继续。",
    l_start: [
      "能够登录你的路由器（FRITZ!Box：设备底部的密码或你自己设置的密码）",
      "此设备已连接到家庭网络（Wi-Fi）——用电脑最方便，手机也可以",
      "一个 Google、GitHub 或 Reddit 账号，用于免费的 DuckDNS 服务",
      "可选：一个 Google 账号，用于 Android 日历和 AI",
    ],
    t_netz: "家庭网络：NAS 的地址",
    i_netz: "pinn. 需要知道你的 NAS 在家庭网络中的地址。为了让这个地址永远不变，路由器会把它固定下来。",
    L_NAS_IP: "NAS 的 IP 地址",
    g_netz: [
      "看一下浏览器的地址栏：如果显示类似 `http://192.168.178.20:8090`，冒号前面的数字就是 NAS 的 IP 地址。",
      "否则请在 FRITZ!Box 中查看：在浏览器中打开 [fritz.box](http://fritz.box)，用 FRITZ!Box 的密码登录。",
      "在左侧打开“家庭网络”→“网络”→选项卡“网络连接”。",
      "在列表中找到你的 NAS（通常是“UGREEN…”或“DXP…”），点按右侧的铅笔（编辑）。",
      "记下 IPv4 地址，并勾选“始终为此网络设备分配相同的 IPv4 地址”→“应用”。",
      "其他路由器：查找“家庭网络”“LAN”或“DHCP”——通常叫“预留地址”或“静态 IP”。在 UGREEN 应用中，地址位于“控制面板 → 网络”。",
    ],
    t_duckdns: "你的 HTTPS 地址（DuckDNS）",
    i_duckdns: "DuckDNS 是一项免费服务，它为 pinn. 提供固定地址和安全证书。pinn. 需要它来实现推送通知、主屏幕应用和 Google 登录。不需要端口转发——pinn. 从外部仍然是不可见的。",
    L_DUCKDNS_SUBDOMAIN: "子域名（任意名称）",
    L_DUCKDNS_TOKEN: "DuckDNS 令牌",
    L_PINN_ADRESSE: "pinn. 地址",
    g_duckdns: [
      "打开 [duckdns.org](https://www.duckdns.org)。",
      "在右上角用提供的账号之一登录（例如 Google、GitHub 或 Reddit）——DuckDNS 没有自己的密码。",
      "在“sub domain”字段中输入一个名称，例如 `wang-family`（只能用小写字母、数字和连字符），然后点按“add domain”。如果名称已被占用，换一个试试。",
      "页面顶部会显示你的“token”——一长串带连字符的字符。选中并复制它。",
      "把子域名和令牌粘贴到这里，然后点按“检查”。pinn. 会自己把你的 NAS 地址注册到 DuckDNS——你不需要修改网站上的“current ip”字段。",
      "令牌就像密码——不要分享。如果已经泄露，请在 duckdns.org 上点按“recreate token”，并在这里输入新的令牌。",
    ],
    test_duckdns_ok: "DuckDNS 已接受该地址 ✓——{0} 现在指向你的 NAS（{1}）。",
    test_duckdns_ko: "DuckDNS 拒绝了。请检查子域名和令牌——该子域名必须存在于你的 DuckDNS 账号中。",
    test_duckdns_netz: "NAS 无法访问 duckdns.org。NAS 能上网吗？",
    test_duckdns_fehlt: "请输入子域名和令牌。",
    test_duckdns_ungueltig: "子域名或令牌看起来不对。",
    test_duckdns_ip_fehlt: "请先在“家庭网络”步骤中输入 NAS 的 IP 地址。",
    t_rebind: "路由器：DNS 重绑定保护",
    i_rebind: "你的 pinn. 地址指向家庭网络中的一台设备。许多路由器——包括 FRITZ!Box——出于保护会阻止这种情况，这样 pinn. 就无法通过该地址打开。为这个地址单独设置例外即可解决：",
    g_rebind: [
      "打开 [fritz.box](http://fritz.box) 并登录。",
      "“家庭网络”→“网络”→选项卡“网络设置”。",
      "滚动到最底部，展开“其他设置”。",
      "在“DNS 重绑定保护”部分，在“主机名例外”中输入这一行：`{SUB}.duckdns.org`",
      "点按“应用”，如果 FRITZ!Box 要求，请在设备上确认。",
      "其他路由器：在设置中查找“DNS rebind”，并把同一地址作为例外输入。如果没有这样的设置，通常什么都不用做。",
    ],
    rebindErledigt: "完成——例外已添加",
    t_fern: "外出使用（VPN）",
    i_fern: "pinn. 有意不对互联网开放。外出时，手机通过 VPN 安全地连接回家——就像你在自己的 Wi-Fi 里一样。你想怎么做？",
    c_wg: "FRITZ!Box 搭配 WireGuard",
    c_wg_d: "如果你有运行 FRITZ!OS 7.50 或更高版本的 FRITZ!Box，推荐使用。免费，不需要额外账号。",
    c_ts: "Tailscale",
    c_ts_d: "适用于其他路由器——或 WireGuard 无法使用时（例如 DS-Lite 线路）。需要在 tailscale.com 注册一个免费账号。",
    c_kein: "仅在家使用",
    c_kein_d: "只在家里的 Wi-Fi 中使用 pinn.。随时可以补充设置。",
    L_TS_AUTHKEY: "Tailscale 密钥（auth key）",
    g_wireguard: [
      "打开 [fritz.box](http://fritz.box) 并登录。在“系统”→“更新”中必须是 FRITZ!OS 7.50 或更高版本（否则请在那里更新）。",
      "“互联网”→“授权访问”→选项卡“VPN（WireGuard）”→“添加连接”。",
      "选择“简化设置（推荐）”→“下一步”。当询问是否连接单个设备时，选择“是”。",
      "为手机输入一个名称（例如 `安娜的手机`）→“完成”。如果 FRITZ!Box 要求确认：按一下设备上的按钮，或在手机上确认。",
      "如果 FRITZ!Box 要求 MyFRITZ! 账号：免费注册一个——手机外出时就靠它找到你的路由器。",
      "屏幕上会出现一个二维码。在手机上安装“WireGuard”应用：[iPhone](https://apps.apple.com/app/wireguard/id1441195209) · [Android](https://play.google.com/store/apps/details?id=com.wireguard.android)。",
      "在 WireGuard 应用中点按“+”→“扫描二维码”（iPhone：“从二维码创建”）→扫描屏幕上的二维码→起个名字→允许添加 VPN 配置。",
      "测试：关闭手机的 Wi-Fi，打开 WireGuard，然后访问 {ADRESSE}。",
      "对其他每部手机，从“添加连接”开始重复这些步骤——每台设备都有自己的连接。",
    ],
    wgNurPinnT: "仅允许访问 pinn.（例如给亲戚）",
    wgNurPinn: "如果某台设备通过 VPN 只应访问 pinn.，而不是整个家庭网络：在 WireGuard 应用中点按该连接→“编辑”→在“允许的 IP”中把全部内容替换为 `{NAS_IP}/32, {ROUTER_IP}/32`→“保存”。第二个地址是路由器（用于域名解析）。注意：该限制只在这台设备上生效。",
    wgDsLite: "外出时无法使用？有些线路（DS-Lite，常见于有线和光纤）没有自己的 IPv4 地址——这时只有手机在外面有 IPv6，WireGuard 才能工作。这种情况请使用 Tailscale。",
    g_tailscale: [
      "打开 [login.tailscale.com](https://login.tailscale.com/start) 并创建一个免费账号（例如用 Google、Microsoft 或 Apple 登录）。",
      "在管理控制台中：顶部“Settings”→左侧“Keys”→“Generate auth key…”。",
      "保持默认设置→“Generate key”→复制密钥（以 `tskey-auth-` 开头）并粘贴到上面。",
      "点按“下一步”。NAS 上的“tailscale”容器会用它在一分钟内登录。",
      "回到 Tailscale 管理控制台：选项卡“Machines”→在设备“pinn”上点按“…”→“Edit route settings…”→勾选 `{NAS_IP}/32`→“Save”。",
      "同样在“pinn”上，点“…”→选择“Disable key expiry”——否则 NAS 每 180 天需要重新登录。",
      "在每部手机上安装“Tailscale”应用（[iPhone](https://apps.apple.com/app/tailscale/id1470499037) · [Android](https://play.google.com/store/apps/details?id=com.tailscale.ipn)），并用同一个账号登录。在管理控制台的“Users”中邀请亲戚。",
      "测试：关闭手机的 Wi-Fi，连接 Tailscale，然后访问 {ADRESSE}。",
    ],
    keinFern: "没问题——这样 pinn. 在家里的 Wi-Fi 中就能使用。你随时可以在“主管理员 → 设置向导”中补充远程访问。",
    t_google: "Google：Android 日历与联系人",
    i_google: "可选。如果你想在 pinn. 中查看 Google 日历（Android）或 Google 联系人的生日，就需要它。整个服务器只需设置一次——之后每个人用自己的 Google 账号登录 pinn.。iPhone/iCloud 在这里不需要做任何事。",
    googleBrauchtHttps: "Google 需要“DuckDNS”步骤中的 HTTPS 地址。",
    L_REDIRECT: "重定向 URI（用于 Google Cloud Console）",
    L_PINN_GOOGLE_CLIENT_ID: "客户端 ID",
    L_PINN_GOOGLE_CLIENT_SECRET: "客户端密钥",
    g_google: [
      "打开 [console.cloud.google.com](https://console.cloud.google.com) 并用 Google 账号登录（第一次请接受服务条款）。",
      "点按顶部的项目选择器→“新建项目”→名称 `pinn`→“创建”。然后在顶部选择项目“pinn”。",
      "启用三个 API——逐个打开并点按“启用”：[Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) · [CalDAV API](https://console.cloud.google.com/apis/library/caldav.googleapis.com) · [People API](https://console.cloud.google.com/apis/library/people.googleapis.com)。",
      "打开 [Google Auth Platform](https://console.cloud.google.com/auth/overview)→“开始”：应用名称 `pinn.`，支持电子邮件 = 你的邮箱→受众“外部”→联系邮箱→同意→“创建”。",
      "在左侧“受众”→“发布应用”→确认。重要：处于“Testing”状态时，每个 Google 连接 7 天后就会失效。",
      "在左侧“客户端”→“创建客户端”→应用类型“Web 应用”，名称 `pinn.`。",
      "在“已获授权的重定向 URI”下→“添加 URI”，并原样粘贴这个地址：`{REDIRECT}`→“创建”。",
      "复制客户端 ID 和客户端密钥，粘贴到这里并点按“检查”。（Google 只显示一次密钥——否则请在客户端上使用“添加密钥”。）",
      "之后连接时，Google 会显示“Google 尚未验证此应用”。这对你的私人应用来说是正常的：“高级”→“前往 pinn.”。",
    ],
    test_google_ok: "Google 认得这个客户端 ✓",
    test_google_uri: "客户端 ID 和密钥是对的，但客户端中缺少重定向 URI：{0}",
    test_google_ungueltig: "Google 不认识这个客户端 ID 或密钥——请重新复制。",
    test_google_netz: "NAS 无法访问 Google。",
    test_google_fehlt: "请输入客户端 ID 和客户端密钥。",
    t_ki: "食谱 AI（Google Gemini）",
    i_ki: "可选。AI 能更好地从文本、照片、PDF 和链接中读取食谱，还能找到你的垃圾回收日历。密钥是免费的，并保存在 NAS 上——这些应用从不直接与 Google 通信。",
    L_PINN_GEMINI_KEY: "Gemini API 密钥",
    L_PINN_GEMINI_MODELL: "固定模型",
    h_modell: "留空 = 自动使用当前的 Flash 模型。",
    g_ki: [
      "打开 [aistudio.google.com/apikey](https://aistudio.google.com/apikey) 并用 Google 账号登录。",
      "点按“Create API key”。如果 Google 要求选择项目，请选择上一步的项目“pinn”或新建一个。",
      "复制密钥（通常以 `AIza` 开头），粘贴到这里并点按“检查”。",
      "提示：在免费套餐中，Google 可能会使用提交的食谱文本来改进其服务。",
    ],
    test_gemini_ok: "密钥有效 ✓",
    test_gemini_ungueltig: "Google 拒绝了这个密钥——请重新复制。",
    test_gemini_gesperrt: "该密钥已被 Gemini API 封锁。请在 AI Studio 中创建新密钥。",
    test_gemini_netz: "NAS 无法访问 Google。",
    test_gemini_fehlt: "请输入密钥。",
    t_ortung: "定位（家庭 → 实时位置）",
    i_ortung: "可选。手机直接在 pinn. 中共享位置——这里不需要输入任何内容。“traccar”容器只有带 SIM 卡的 GPS 追踪器才需要。",
    l_ortung: [
      "位置共享直接在 pinn. 中就能用（家庭 → 位置）。要在 pinn. 关闭时也继续发送，请安装“Traccar Client”应用——它会直接发送给 pinn.。",
      "之后 pinn. 会在“家庭 → ⚙︎ 位置”中显示每个人的服务器地址和设备 ID。",
      "外出时，手机需要“外出使用”步骤中的 VPN。",
      "带 SIM 卡的 GPS 追踪器（例如戴在狗项圈上）通过移动网络发送——这需要在路由器中设置端口转发。添加追踪器时，pinn. 会显示说明。",
    ],
    appTraccar: "“Traccar Client”应用：",
    h_traccar: "只有在你已经自己在 Traccar 中创建过账号时才需要填写。留空 = pinn. 自己创建一个。",
    L_PINN_TRACCAR_EMAIL: "Traccar 电子邮件",
    L_PINN_TRACCAR_PASSWORT: "Traccar 密码",
    test_traccar_ok: "Traccar 正在运行 ✓",
    test_traccar_aus: "“traccar”容器没有运行——手机不需要它。只有 GPS 追踪器才需要：在 .env 文件中添加 COMPOSE_PROFILES=tracker。",
    t_ha: "智能家居：Home Assistant",
    i_ha: "可选。你的 Home Assistant 运行在哪里？",
    c_ha_kein: "没有 Home Assistant",
    c_ha_geraet: "在单独的设备上",
    c_ha_geraet_d: "例如 Raspberry Pi 或 Home Assistant Green。",
    c_ha_vm: "作为此 NAS 上的虚拟机",
    c_ha_vm_d: "这时 pinn. 会设置一个小小的网络绕行——否则 NAS 无法访问这台虚拟机。",
    haGeraetInfo: "这里不需要输入任何内容。每个家庭在 pinn. 的“设置 → 智能家居”中自行设置连接。",
    L_HA_IP: "Home Assistant 的 IP 地址",
    L_HILFS_IP: "空闲的辅助地址",
    L_NAS_NETZWERKKARTE: "NAS 的网络接口",
    h_karte: "“auto”= pinn. 自动识别网络接口。",
    g_ha: [
      "Home Assistant 的 IP：在 Home Assistant 中“设置”→“系统”→“网络”，或在 FRITZ!Box 的“家庭网络”→“网络”中找到设备“homeassistant”。同样要勾选“始终分配相同的 IPv4 地址”。",
      "辅助地址：家庭网络中没有任何设备使用、路由器也从不分配的一个地址。在 FRITZ!Box 中，“家庭网络”→“网络”→“网络设置”→“IPv4 设置”会显示路由器分配的范围（例如 .20 到 .200）。选一个高于该范围的地址，例如 `{VORSCHLAG}`。",
      "点按“下一步”——“ha-netz”容器会在一分钟内设置好绕行。“检查”会显示 pinn. 能否访问 Home Assistant。",
      "每个家庭之后在 pinn. 的“设置 → 智能家居”中输入 Home Assistant 的访问令牌。",
    ],
    haAktiv: "已通过 {0} 启用绕行（辅助地址 {1}）✓",
    haWartet: "绕行正在等待设置。",
    haFehler: "无法设置绕行（网络接口：{0}）。",
    test_homeassistant_ok: "可以访问 Home Assistant ✓",
    test_homeassistant_aus: "（暂时）无法访问 Home Assistant。点“下一步”后请等待最多一分钟，再检查一次。",
    test_homeassistant_fehlt: "请输入 Home Assistant 的 IP 地址。",
    t_apps: "应用与设备",
    i_apps: "快完成了！家庭成员的手机上需要做这些：",
    a_home_t: "把 pinn. 放到主屏幕上（每个人）",
    a_home: [
      "iPhone/iPad：在 Safari 中打开 {ADRESSE}→点按分享图标（带箭头的方框）→“添加到主屏幕”→“添加”。只有这样推送通知才有效（需 iOS 16.4 或更高版本）。",
      "Android：在 Chrome 中打开 {ADRESSE}→右上角 ⋮→“安装应用”或“添加到主屏幕”。",
      "始终使用 https 地址——不要用带 :8090 的地址。",
    ],
    a_vpn: "外出使用——设置见“外出使用”步骤：",
    a_traccar: "仅用于位置追踪：",
    a_icloud_t: "iCloud 日历（iPhone）",
    a_icloud: "每个家庭自己在 pinn. 的“设置 → 日历”中连接自己的 iCloud 日历。这需要一个应用专用密码：[account.apple.com](https://account.apple.com)→“登录与安全”→“应用专用密码”→“+”→名称 `pinn.`→把显示的密码（xxxx-xxxx-xxxx-xxxx）输入到 pinn. 中。",
    a_push_t: "推送通知",
    a_push: "每个人在 pinn. 的“设置 → 通知 → 在此设备上启用”中打开它们——在 iPhone 上只能在主屏幕上的应用里操作。",
    t_fertig: "总结",
    i_fertig: "请检查详情。点按“保存并启动”后，pinn. 会应用一切并短暂重启一次（约 10–20 秒）。",
    S_ADRESSE: "地址",
    S_REBIND: "DNS 重绑定例外",
    S_FERN: "外出使用",
    S_KI: "AI",
    S_ORTUNG: "定位",
    L_PINN_PUSH_KONTAKT: "推送服务联系方式",
    h_push: "Apple 和 Google 要求推送通知提供一个联系地址（电子邮件）。留空 = pinn. 使用它自己的地址。",
    neustart: "pinn. 正在重启 …",
    neustartOk: "已重启 ✓",
    neustartFehler: "pinn. 没有响应。请在一两分钟后重新加载。",
    pruefeHttps: "正在检查 HTTPS …",
    pruefeAlles: "正在检查全部 …",
    zertifikatDauert: "安全证书首次需要获取——这可能需要 1–2 分钟 …",
    httpsOk: "可以访问 {0} ✓",
    httpsFehler: "{0} 暂时还没有响应。常见原因：路由器中的 DNS 重绑定保护（第 5 步）、此设备不在家庭网络中，或证书还需要一点时间。稍后用“再次检查”再试。",
    httpsAus: "没有设置 HTTPS 地址（DuckDNS 步骤）。",
    t_geschafft: "完成！🎉",
    geschafftText: "pinn. 已设置完成。从现在起，请通过这个地址打开 pinn.，并把它保存到所有手机上（见“应用与设备”）。接下来，在家庭管理中创建你的第一个家庭。",
    nochmalPruefen: "再次检查",
    zurVerwaltung: "前往家庭管理",
  };
  T.ja = {
    titel: "初期設定", lade: "初期設定を読み込み中 …",
    weiter: "次へ", zurueck: "戻る", ueberspringen: "スキップ", spaeter: "あとで", schliessen: "閉じる",
    pruefen: "確認", pruefe: "確認中 …", speichere: "保存中 …", kopieren: "コピー", kopiert: "コピーしました ✓",
    anleitung: "手順ガイド", optional: "任意", erweitert: "詳細設定", zeigen: "表示",
    gespeichertGeheim: "保存済み：••••{0}", leerLassen: "空欄のまま = 変更なし", ausEnv: ".env または docker-compose.yaml の値",
    entfernen: "削除", wirdEntfernt: "保存時に削除されます", entfernenFrage: "この保存済みの値を削除しますか？",
    schritt: "ステップ {0} / {1}", fehlerFeld: "「{0}」を確認してください。", fehler: "うまくいきませんでした。", ok: "OK ✓",
    fehlerNetz: "pinn. に接続できません。自宅のネットワークにつながっているか確認してください。",
    ordnerFehlt: "NAS に「konfig」フォルダがありません。新しい docker-compose.yaml を使い、pinn-setup.sh スクリプトを実行してください（または「docker compose up -d」）。このフォルダがないと初期設定は何も保存できません。",
    ordnerSchreibschutz: "「konfig」フォルダが読み取り専用です。もう一度 pinn-setup.sh を実行してください。",
    serverFehlt: "サーバーに einrichtung.pb.js と pinn-einrichtung.js（pb_hooks）がまだありません。",
    erkannt: "アドレスバーから検出：{0}", deineAdresse: "あなたの pinn. のアドレス：", ph_sub: "例：yamada-family",
    L_PORT: "HTTPS ポート", h_port: "docker-compose.yaml でポート 8443 を変更した場合のみ変更してください。",
    pflichtInfo: "必須なのは「ホームネットワーク」と「DuckDNS」だけです。それ以外はスキップして、いつでも戻ってこられます：メイン管理者 → 初期設定。",
    serverOk: "pinn. は動作中で、設定を保存できます ✓",
    schonFertig: "初期設定はすでに完了しています。すべて確認・変更でき、最後に「保存して開始」で反映します。",
    bitteWaehlen: "いずれかを選んでください（または「スキップ」）。",
    skipPflicht: "このステップがないと、HTTPS、プッシュ通知、ホーム画面のアプリが使えません。それでもスキップしますか？",
    pflichtFehlt: "項目を入力してください。または「スキップ」をタップしてください。",
    speichernStarten: "保存して開始", neu: "新規", nichtGesetzt: "未設定", erledigtKurz: "完了", offen: "未完了",
    eingerichtet: "設定済み", aus: "オフ",

    t_sprache: "pinn. へようこそ 👋",
    i_sprache: "初期設定の言語を選んでください。この端末の pinn. でも使われます。各プロフィールはあとで自分の言語を選べます。",

    t_start: "必要なもの",
    i_start: "pinn. の初期設定は約20～30分で完了します。「次へ」をタップするたびに保存されるので、いつでも中断して続きから再開できます。",
    l_start: [
      "ルーターへのアクセス（FRITZ!Box の場合：本体底面のパスワード、または自分で設定したパスワード）",
      "自宅のネットワーク（Wi-Fi）につながったこの端末 – パソコンが一番簡単ですが、スマートフォンでも大丈夫です",
      "無料サービス DuckDNS 用の Google、GitHub または Reddit のアカウント",
      "任意：Android のカレンダーと AI 用の Google アカウント",
    ],

    t_netz: "ホームネットワーク：NAS のアドレス",
    i_netz: "pinn. は自宅のネットワーク内での NAS のアドレスを知る必要があります。このアドレスが変わらないよう、ルーターで固定で割り当てます。",
    L_NAS_IP: "NAS の IP アドレス",
    g_netz: [
      "ブラウザのアドレスバーを見てください。`http://192.168.178.20:8090` のように表示されていれば、コロンの前の数字がすでに NAS の IP アドレスです。",
      "そうでなければ FRITZ!Box で確認します：ブラウザで [fritz.box](http://fritz.box) を開き、FRITZ!Box のパスワードでログインします。",
      "左側で「Home Network」→「Network」→ タブ「Network Connections」を開きます。",
      "一覧から NAS（たいてい「UGREEN…」または「DXP…」）を探し、右側の鉛筆（編集）をタップします。",
      "IPv4 アドレスをメモし、「Always assign this network device the same IPv4 address」にチェックを入れて →「Apply」。",
      "ほかのルーター：「ホームネットワーク」「LAN」「DHCP」を探してください。多くは「アドレスの予約」や「固定 IP」と呼ばれています。UGREEN アプリでは コントロールパネル → ネットワーク でアドレスを確認できます。",
    ],

    t_duckdns: "HTTPS 付きのアドレス（DuckDNS）",
    i_duckdns: "DuckDNS は、pinn. に証明書付きの固定アドレスを無料で提供するサービスです。pinn. はプッシュ通知、ホーム画面のアプリ、Google サインインにこれを必要とします。ポート開放は不要で、pinn. は外部から見えないままです。",
    L_DUCKDNS_SUBDOMAIN: "サブドメイン（好きな名前）", L_DUCKDNS_TOKEN: "DuckDNS トークン", L_PINN_ADRESSE: "pinn. のアドレス",
    g_duckdns: [
      "[duckdns.org](https://www.duckdns.org) を開きます。",
      "右上で、表示されているアカウント（例：Google、GitHub、Reddit）のいずれかでサインインします。DuckDNS には独自のパスワードはありません。",
      "「sub domain」欄に名前を入力し（例：`yamada-family`。小文字、数字、ハイフンのみ）、「add domain」をタップします。使われている名前なら別の名前を試してください。",
      "ページ上部に「token」が表示されます。ハイフン入りの長い文字列です。選択してコピーします。",
      "サブドメインとトークンをここに貼り付けて「確認」をタップします。pinn. が NAS のアドレスを DuckDNS に自動で登録するので、ウェブサイトの「current ip」欄を変更する必要はありません。",
      "トークンはパスワードと同じです。人に教えないでください。もし知られてしまったら、duckdns.org で「recreate token」をタップし、新しいトークンをここに入力してください。",
    ],
    test_duckdns_ok: "DuckDNS がアドレスを受け付けました ✓ – {0} はあなたの NAS（{1}）を指しています。",
    test_duckdns_ko: "DuckDNS に拒否されました。サブドメインとトークンを確認してください。サブドメインはあなたの DuckDNS アカウントに存在している必要があります。",
    test_duckdns_netz: "NAS から duckdns.org に接続できません。NAS はインターネットにつながっていますか？",
    test_duckdns_fehlt: "サブドメインとトークンを入力してください。",
    test_duckdns_ungueltig: "サブドメインまたはトークンの形式が正しくないようです。",
    test_duckdns_ip_fehlt: "先に「ホームネットワーク」のステップで NAS の IP アドレスを入力してください。",

    t_rebind: "ルーター：DNS リバインディング保護",
    i_rebind: "あなたの pinn. のアドレスは自宅のネットワーク内の機器を指しています。多くのルーター（FRITZ!Box を含む）は保護のためにこれをブロックします。その場合、そのアドレスでは pinn. が開きません。このアドレスだけを例外にすれば解決します：",
    g_rebind: [
      "[fritz.box](http://fritz.box) を開いてログインします。",
      "「Home Network」→「Network」→ タブ「Network Settings」。",
      "いちばん下までスクロールし、「additional settings」を開きます。",
      "「DNS Rebind Protection」の欄で、「Host name exceptions」に次の行を入力します：`{SUB}.duckdns.org`",
      "「Apply」をタップし、FRITZ!Box に求められたら本体で確認します。",
      "ほかのルーター：設定で「DNS rebind」を探し、同じアドレスを例外として入力します。そのような設定がなければ、たいてい何もする必要はありません。",
    ],
    rebindErledigt: "完了 – 例外を追加しました",

    t_fern: "外出先で使う（VPN）",
    i_fern: "pinn. はあえてインターネットに公開していません。外出先ではスマートフォンが VPN で安全に自宅へ接続し、自宅の Wi-Fi にいるのと同じように使えます。どの方法にしますか？",
    c_wg: "WireGuard 対応の FRITZ!Box", c_wg_d: "FRITZ!OS 7.50 以降の FRITZ!Box をお持ちならおすすめです。無料で、追加のアカウントは不要です。",
    c_ts: "Tailscale", c_ts_d: "ほかのルーターの場合、または WireGuard が使えない場合（例：DS-Lite 回線）。tailscale.com の無料アカウントが必要です。",
    c_kein: "自宅だけで使う", c_kein_d: "pinn. を自宅の Wi-Fi でのみ使います。あとからいつでも追加できます。",
    L_TS_AUTHKEY: "Tailscale キー（auth key）",
    g_wireguard: [
      "[fritz.box](http://fritz.box) を開いてログインします。「System」→「Update」で FRITZ!OS 7.50 以降になっている必要があります（なっていなければそこで更新します）。",
      "「Internet」→「Permit Access」→ タブ「VPN (WireGuard)」→「Add connection」。",
      "「Simplified setup (recommended)」→「Next」を選びます。1台の端末を接続するか聞かれたら「Yes」を選びます。",
      "スマートフォンの名前を入力し（例：`花子のスマホ`）→「Finish」。FRITZ!Box に確認を求められたら、本体のボタンを押すか電話で確認します。",
      "FRITZ!Box が MyFRITZ! アカウントを求めたら、無料で作成してください。外出先のスマートフォンはこれで自宅のルーターを見つけます。",
      "QR コードが表示されます。スマートフォンに「WireGuard」アプリをインストールします：[iPhone](https://apps.apple.com/app/wireguard/id1441195209) · [Android](https://play.google.com/store/apps/details?id=com.wireguard.android)。",
      "WireGuard アプリで「+」→「QR コードから作成」→ 画面のコードを読み取り → 名前を付けて → VPN 構成の追加を許可します。",
      "テスト：スマートフォンの Wi-Fi をオフにし、WireGuard をオンにして {ADRESSE} を開きます。",
      "ほかのスマートフォンごとに「Add connection」から同じ手順を繰り返します。端末ごとに専用の接続になります。",
    ],
    wgNurPinnT: "pinn. だけを許可する（例：親戚用）",
    wgNurPinn: "ある端末が VPN で自宅のネットワーク全体ではなく pinn. だけにアクセスするようにしたい場合：WireGuard アプリで接続をタップ →「編集」→「許可された IP」の内容をすべて `{NAS_IP}/32, {ROUTER_IP}/32` に置き換え →「保存」。2つ目のアドレスはルーターです（名前解決用）。注意：この制限はその端末の設定です。",
    wgDsLite: "外出先でつながりませんか？一部の回線（ケーブルや光回線に多い DS-Lite）には専用の IPv4 アドレスがありません。その場合 WireGuard は、外出先のスマートフォンに IPv6 があるときだけ使えます。そのときは Tailscale を使ってください。",
    g_tailscale: [
      "[login.tailscale.com](https://login.tailscale.com/start) を開き、無料アカウントを作成します（例：Google、Microsoft、Apple でサインイン）。",
      "管理コンソールで、上部の「Settings」→ 左側の「Keys」→「Generate auth key…」。",
      "既定値のまま →「Generate key」→ キー（`tskey-auth-` で始まる）をコピーして上に貼り付けます。",
      "「次へ」をタップします。NAS の「tailscale」コンテナが1分以内にこのキーでサインインします。",
      "Tailscale 管理コンソールに戻り：タブ「Machines」→ 端末「pinn」の「…」→「Edit route settings…」→ `{NAS_IP}/32` にチェック →「Save」。",
      "同じく「pinn」の「…」で「Disable key expiry」を選びます。そうしないと NAS は180日ごとにサインインし直す必要があります。",
      "すべてのスマートフォンに「Tailscale」アプリをインストールし（[iPhone](https://apps.apple.com/app/tailscale/id1470499037) · [Android](https://play.google.com/store/apps/details?id=com.tailscale.ipn)）、同じアカウントでサインインします。親戚は管理コンソールの「Users」から招待します。",
      "テスト：スマートフォンの Wi-Fi をオフにし、Tailscale を接続して {ADRESSE} を開きます。",
    ],
    keinFern: "問題ありません。pinn. は自宅の Wi-Fi で動作します。外出先からのアクセスは、メイン管理者 → 初期設定 からいつでも追加できます。",

    t_google: "Google：Android のカレンダーと連絡先",
    i_google: "任意。Google カレンダー（Android）や Google の連絡先の誕生日を pinn. で表示したい場合に必要です。サーバー全体で一度だけ設定し、その後は各自が自分の Google アカウントで pinn. にサインインします。iPhone/iCloud の場合はここで何もする必要はありません。",
    googleBrauchtHttps: "Google には「DuckDNS」ステップの HTTPS アドレスが必要です。",
    L_REDIRECT: "リダイレクト URI（Google Cloud Console 用）",
    L_PINN_GOOGLE_CLIENT_ID: "クライアント ID", L_PINN_GOOGLE_CLIENT_SECRET: "クライアント シークレット",
    g_google: [
      "[console.cloud.google.com](https://console.cloud.google.com) を開き、Google アカウントでサインインします（初回は利用規約に同意します）。",
      "上部のプロジェクト選択をタップ →「新しいプロジェクト」→ 名前 `pinn` →「作成」。そのあと上部でプロジェクト「pinn」を選びます。",
      "3つの API を有効にします。それぞれを開いて「有効にする」をタップ：[Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) · [CalDAV API](https://console.cloud.google.com/apis/library/caldav.googleapis.com) · [People API](https://console.cloud.google.com/apis/library/people.googleapis.com)。",
      "[Google Auth Platform](https://console.cloud.google.com/auth/overview) を開く →「開始」：アプリ名 `pinn.`、サポートメール = あなたのアドレス → 対象「外部」→ 連絡先メール → 同意 →「作成」。",
      "左側の「対象」→「アプリを公開」→ 確認。重要：「テスト」状態のままだと、Google の接続はすべて7日で切れます。",
      "左側の「クライアント」→「クライアントを作成」→ アプリケーションの種類「ウェブ アプリケーション」、名前 `pinn.`。",
      "「承認済みのリダイレクト URI」→「URI を追加」で、このアドレスをそのまま貼り付けます：`{REDIRECT}` →「作成」。",
      "クライアント ID とクライアント シークレットをコピーしてここに貼り付け、「確認」をタップします。（シークレットは一度しか表示されません。見逃した場合はクライアントで「シークレットを追加」を使います。）",
      "あとで接続するとき、Google に「このアプリは Google で確認されていません」と表示されます。個人用のアプリでは正常です：「詳細」→「pinn.（安全ではないページ）に移動」。",
    ],
    test_google_ok: "Google はこのクライアントを認識しています ✓",
    test_google_uri: "クライアント ID とシークレットは正しいですが、クライアントにリダイレクト URI がありません：{0}",
    test_google_ungueltig: "Google はこのクライアント ID またはシークレットを認識しません。もう一度コピーしてください。",
    test_google_netz: "NAS から Google に接続できません。",
    test_google_fehlt: "クライアント ID とクライアント シークレットを入力してください。",

    t_ki: "レシピ用 AI（Google Gemini）",
    i_ki: "任意。AI はテキスト、写真、PDF、リンクからレシピをずっと上手に読み取り、ごみ収集カレンダーも見つけてくれます。キーは無料で NAS 上に保存され、アプリが直接 Google とやり取りすることはありません。",
    L_PINN_GEMINI_KEY: "Gemini API キー", L_PINN_GEMINI_MODELL: "固定モデル",
    h_modell: "空欄 = 最新の Flash モデルを自動で使用。",
    g_ki: [
      "[aistudio.google.com/apikey](https://aistudio.google.com/apikey) を開き、Google アカウントでサインインします。",
      "「API キーを作成」をタップします。プロジェクトを聞かれたら、前のステップのプロジェクト「pinn」を選ぶか新しく作成します。",
      "キー（たいてい `AIza` で始まる）をコピーしてここに貼り付け、「確認」をタップします。",
      "ご参考：無料枠では、送信したレシピのテキストが Google のサービス改善に使われることがあります。",
    ],
    test_gemini_ok: "キーは有効です ✓",
    test_gemini_ungueltig: "Google がキーを拒否しました。もう一度コピーしてください。",
    test_gemini_gesperrt: "このキーは Gemini API で使用できません。AI Studio で新しいキーを作成してください。",
    test_gemini_netz: "NAS から Google に接続できません。",
    test_gemini_fehlt: "キーを入力してください。",

    t_ortung: "位置情報（家族 → リアルタイムの位置）",
    i_ortung: "任意。スマートフォンは pinn. で直接位置を共有します。ここで入力するものはありません。「traccar」コンテナが必要なのは、SIM カード付きの GPS トラッカーを使う場合だけです。",
    l_ortung: [
      "位置の共有は pinn. で直接使えます（家族 → 位置情報）。pinn. を閉じていても送信を続けるには「Traccar Client」アプリをインストールします。位置は pinn. に直接送られます。",
      "サーバーアドレスと端末 ID は、あとで pinn. の 家族 → ⚙︎ 位置情報 で各自に表示されます。",
      "外出先では、スマートフォンに「外出先で使う」ステップの VPN が必要です。",
      "SIM カード付きの GPS トラッカー（例：犬の首輪）はモバイル回線から送信するため、ルーターでポート開放が必要です。トラッカーを追加するときに pinn. が手順を表示します。",
    ],
    appTraccar: "「Traccar Client」アプリ：",
    h_traccar: "Traccar ですでに自分でアカウントを作成した場合のみ入力してください。空欄 = pinn. が自動で作成します。",
    L_PINN_TRACCAR_EMAIL: "Traccar のメールアドレス", L_PINN_TRACCAR_PASSWORT: "Traccar のパスワード",
    test_traccar_ok: "Traccar は動作中です ✓",
    test_traccar_aus: "「traccar」コンテナが動作していません。スマートフォンだけなら不要です。GPS トラッカーを使う場合のみ、.env ファイルに COMPOSE_PROFILES=tracker を追加してください。",

    t_ha: "スマートホーム：Home Assistant",
    i_ha: "任意。Home Assistant はどこで動いていますか？",
    c_ha_kein: "Home Assistant なし",
    c_ha_geraet: "別の機器で", c_ha_geraet_d: "例：Raspberry Pi や Home Assistant Green。",
    c_ha_vm: "この NAS の仮想マシンとして", c_ha_vm_d: "その場合、pinn. が小さなネットワークの迂回路を設定します。そうしないと NAS から VM に接続できません。",
    haGeraetInfo: "ここで入力するものはありません。各家族が pinn. の 設定 → スマートホーム で接続を設定します。",
    L_HA_IP: "Home Assistant の IP アドレス", L_HILFS_IP: "空いている補助アドレス", L_NAS_NETZWERKKARTE: "NAS のネットワークインターフェース",
    h_karte: "「auto」= pinn. がネットワークインターフェースを自動で検出します。",
    g_ha: [
      "Home Assistant の IP：Home Assistant の「設定」→「システム」→「ネットワーク」、または FRITZ!Box の「Home Network」→「Network」で機器「homeassistant」を探します。そこで「常に同じ IPv4 アドレスを割り当てる」にもチェックを入れます。",
      "補助アドレス：自宅のネットワークで、どの機器も使っておらず、ルーターも割り当てないアドレスです。FRITZ!Box では「Home Network」→「Network」→「Network Settings」→「IPv4 settings」で、ルーターが割り当てる範囲（例：.20 ～ .200）がわかります。その範囲より上のアドレスを選びます（例：`{VORSCHLAG}`）。",
      "「次へ」をタップすると、「ha-netz」コンテナが1分以内に迂回路を設定します。「確認」で pinn. から Home Assistant に接続できるかがわかります。",
      "Home Assistant のアクセストークンは、各家族があとで pinn. の 設定 → スマートホーム で入力します。",
    ],
    haAktiv: "{0} 経由の迂回路が有効です（補助アドレス {1}）✓", haWartet: "迂回路は設定を待っています。", haFehler: "迂回路を設定できませんでした（ネットワークインターフェース：{0}）。",
    test_homeassistant_ok: "Home Assistant に接続できます ✓",
    test_homeassistant_aus: "Home Assistant に（まだ）接続できません。「次へ」のあと1分ほど待ってからもう一度確認してください。",
    test_homeassistant_fehlt: "Home Assistant の IP アドレスを入力してください。",

    t_apps: "アプリと端末",
    i_apps: "もうすぐ完了です！家族のスマートフォンに必要なもの：",
    a_home_t: "ホーム画面の pinn.（全員）",
    a_home: [
      "iPhone/iPad：Safari で {ADRESSE} を開く → 共有アイコン（矢印付きの四角）→「ホーム画面に追加」→「追加」。プッシュ通知はこの方法でのみ使えます（iOS 16.4 以降）。",
      "Android：Chrome で {ADRESSE} を開く → 右上の ⋮ →「アプリをインストール」または「ホーム画面に追加」。",
      "必ず https のアドレスを使ってください。:8090 付きのアドレスではありません。",
    ],
    a_vpn: "外出先用 – 設定は「外出先で使う」ステップを参照：",
    a_traccar: "位置情報を使う場合のみ：",
    a_icloud_t: "iCloud カレンダー（iPhone）",
    a_icloud: "各家族が pinn. の 設定 → カレンダー で自分の iCloud カレンダーを接続します。それには App 用パスワードが必要です：[account.apple.com](https://account.apple.com) →「サインインとセキュリティ」→「App 用パスワード」→「+」→ 名前 `pinn.` → 表示されたパスワード（xxxx-xxxx-xxxx-xxxx）を pinn. に入力します。",
    a_push_t: "プッシュ通知",
    a_push: "各自が pinn. の 設定 → 通知 →「この端末で有効にする」でオンにします。iPhone ではホーム画面のアプリからのみ可能です。",

    t_fertig: "まとめ",
    i_fertig: "内容を確認してください。「保存して開始」で pinn. がすべてを反映し、一度だけ短く再起動します（約10～20秒）。",
    S_ADRESSE: "アドレス", S_REBIND: "DNS リバインディングの例外", S_FERN: "外出先", S_KI: "AI", S_ORTUNG: "位置情報",
    L_PINN_PUSH_KONTAKT: "プッシュサービス用の連絡先",
    h_push: "Apple と Google は、プッシュ通知に連絡先アドレス（メール）を求めます。空欄 = pinn. が自分のアドレスを使います。",
    neustart: "pinn. を再起動中 …", neustartOk: "再起動しました ✓", neustartFehler: "pinn. が応答しません。1～2分後に再読み込みしてください。",
    pruefeHttps: "HTTPS を確認中 …", pruefeAlles: "すべて確認中 …",
    zertifikatDauert: "初回はセキュリティ証明書を取得します。1～2分かかることがあります …",
    httpsOk: "{0} に接続できます ✓",
    httpsFehler: "{0} がまだ応答しません。よくある原因：ルーターの DNS リバインディング保護（ステップ5）、この端末が自宅のネットワークにない、または証明書の取得にもう少し時間がかかっている。あとで「もう一度確認」で試してください。",
    httpsAus: "HTTPS アドレスが設定されていません（DuckDNS のステップ）。",
    t_geschafft: "完了！🎉",
    geschafftText: "pinn. の設定が完了しました。これからはこのアドレスで pinn. を開き、すべてのスマートフォンに保存してください（「アプリと端末」を参照）。次に、家族の管理で最初の家族を作成しましょう。",
    nochmalPruefen: "もう一度確認", zurVerwaltung: "家族の管理へ",
  };
  T.ko = {
    titel: "초기 설정", lade: "초기 설정을 불러오는 중 …",
    weiter: "다음", zurueck: "뒤로", ueberspringen: "건너뛰기", spaeter: "나중에", schliessen: "닫기",
    pruefen: "확인", pruefe: "확인 중 …", speichere: "저장 중 …", kopieren: "복사", kopiert: "복사됨 ✓",
    anleitung: "단계별 안내", optional: "선택", erweitert: "고급", zeigen: "보기",
    gespeichertGeheim: "저장됨: ••••{0}", leerLassen: "비워 두면 = 변경 없음", ausEnv: ".env 또는 docker-compose.yaml의 값",
    entfernen: "삭제", wirdEntfernt: "저장할 때 삭제돼요", entfernenFrage: "저장된 이 값을 삭제할까요?",
    schritt: "{1}단계 중 {0}단계", fehlerFeld: "“{0}”을(를) 확인해 주세요.", fehler: "잘 되지 않았어요.", ok: "확인 ✓",
    fehlerNetz: "pinn.에 연결할 수 없어요. 집 네트워크에 연결되어 있는지 확인해 주세요.",
    ordnerFehlt: "NAS에 “konfig” 폴더가 없어요. 새 docker-compose.yaml을 사용하고 pinn-setup.sh 스크립트를 실행해 주세요(또는 “docker compose up -d”). 이 폴더가 없으면 초기 설정이 아무것도 저장할 수 없어요.",
    ordnerSchreibschutz: "“konfig” 폴더가 읽기 전용이에요. pinn-setup.sh를 다시 실행해 주세요.",
    serverFehlt: "서버에 einrichtung.pb.js와 pinn-einrichtung.js(pb_hooks)가 아직 없어요.",
    erkannt: "주소 표시줄에서 감지됨: {0}", deineAdresse: "내 pinn. 주소:", ph_sub: "예: kim-family",
    L_PORT: "HTTPS 포트", h_port: "docker-compose.yaml에서 포트 8443을 바꾼 경우에만 변경하세요.",
    pflichtInfo: "필수는 “홈 네트워크”와 “DuckDNS”뿐이에요. 나머지는 건너뛰고 언제든 다시 올 수 있어요: 메인 관리자 → 초기 설정.",
    serverOk: "pinn.이 실행 중이며 설정을 저장할 수 있어요 ✓",
    schonFertig: "초기 설정이 이미 완료됐어요. 모든 항목을 확인하고 바꿀 수 있으며, 마지막에 “저장하고 시작”으로 적용해요.",
    bitteWaehlen: "옵션을 하나 선택해 주세요(또는 “건너뛰기”).",
    skipPflicht: "이 단계 없이는 HTTPS, 푸시 알림, 홈 화면 앱이 작동하지 않아요. 그래도 건너뛸까요?",
    pflichtFehlt: "항목을 입력하거나 “건너뛰기”를 탭해 주세요.",
    speichernStarten: "저장하고 시작", neu: "새로", nichtGesetzt: "설정 안 됨", erledigtKurz: "완료", offen: "미완료",
    eingerichtet: "설정됨", aus: "꺼짐",

    t_sprache: "pinn.에 오신 걸 환영해요 👋",
    i_sprache: "초기 설정 언어를 선택하세요. 이 기기의 pinn.에도 사용돼요. 각 프로필은 나중에 자기 언어를 고를 수 있어요.",

    t_start: "필요한 것",
    i_start: "pinn. 설정은 약 20~30분이면 끝나요. “다음”을 탭할 때마다 저장되니 언제든 멈췄다가 이어서 할 수 있어요.",
    l_start: [
      "공유기 접속 정보(FRITZ!Box라면 본체 바닥의 비밀번호 또는 직접 정한 비밀번호)",
      "집 네트워크(Wi-Fi)에 연결된 이 기기 – 컴퓨터가 가장 편하지만 휴대폰도 괜찮아요",
      "무료 서비스 DuckDNS용 Google, GitHub 또는 Reddit 계정",
      "선택: Android 캘린더와 AI용 Google 계정",
    ],

    t_netz: "홈 네트워크: NAS 주소",
    i_netz: "pinn.은 집 네트워크에서 NAS의 주소를 알아야 해요. 이 주소가 바뀌지 않도록 공유기에서 고정으로 예약해요.",
    L_NAS_IP: "NAS의 IP 주소",
    g_netz: [
      "브라우저 주소 표시줄을 보세요. `http://192.168.178.20:8090`처럼 보이면 콜론 앞의 숫자가 바로 NAS의 IP 주소예요.",
      "아니라면 FRITZ!Box에서 확인해요: 브라우저에서 [fritz.box](http://fritz.box)를 열고 FRITZ!Box 비밀번호로 로그인하세요.",
      "왼쪽에서 “Home Network” → “Network” → 탭 “Network Connections”를 여세요.",
      "목록에서 NAS(보통 “UGREEN…” 또는 “DXP…”)를 찾아 오른쪽 연필(편집)을 탭하세요.",
      "IPv4 주소를 메모하고 “Always assign this network device the same IPv4 address”에 체크 → “Apply”.",
      "다른 공유기: “홈 네트워크”, “LAN”, “DHCP”를 찾아보세요. 보통 “주소 예약” 또는 “고정 IP”라고 해요. UGREEN 앱에서는 제어판 → 네트워크에서 주소를 볼 수 있어요.",
    ],

    t_duckdns: "HTTPS 주소(DuckDNS)",
    i_duckdns: "DuckDNS는 pinn.에 보안 인증서가 포함된 고정 주소를 무료로 주는 서비스예요. pinn.은 푸시 알림, 홈 화면 앱, Google 로그인에 이것이 필요해요. 포트 포워딩은 필요 없고 pinn.은 외부에서 보이지 않아요.",
    L_DUCKDNS_SUBDOMAIN: "서브도메인(원하는 이름)", L_DUCKDNS_TOKEN: "DuckDNS 토큰", L_PINN_ADRESSE: "pinn. 주소",
    g_duckdns: [
      "[duckdns.org](https://www.duckdns.org)를 여세요.",
      "오른쪽 위에서 제공되는 계정(예: Google, GitHub, Reddit) 중 하나로 로그인하세요. DuckDNS에는 자체 비밀번호가 없어요.",
      "“sub domain” 칸에 이름을 입력하고(예: `kim-family`, 소문자·숫자·하이픈만) “add domain”을 탭하세요. 이미 쓰이는 이름이면 다른 이름을 시도하세요.",
      "페이지 위쪽에 “token”이 보여요 – 하이픈이 들어간 긴 문자열이에요. 선택해서 복사하세요.",
      "서브도메인과 토큰을 여기에 붙여 넣고 “확인”을 탭하세요. pinn.이 NAS 주소를 DuckDNS에 직접 등록하니 웹사이트의 “current ip” 칸은 바꿀 필요가 없어요.",
      "토큰은 비밀번호와 같아요. 다른 사람과 공유하지 마세요. 그런 일이 생기면 duckdns.org에서 “recreate token”을 탭하고 새 토큰을 여기에 입력하세요.",
    ],
    test_duckdns_ok: "DuckDNS가 주소를 받아들였어요 ✓ – {0}이(가) 이제 내 NAS({1})를 가리켜요.",
    test_duckdns_ko: "DuckDNS가 거부했어요. 서브도메인과 토큰을 확인하세요. 서브도메인이 DuckDNS 계정에 있어야 해요.",
    test_duckdns_netz: "NAS에서 duckdns.org에 연결할 수 없어요. NAS가 인터넷에 연결되어 있나요?",
    test_duckdns_fehlt: "서브도메인과 토큰을 입력하세요.",
    test_duckdns_ungueltig: "서브도메인이나 토큰 형식이 올바르지 않아 보여요.",
    test_duckdns_ip_fehlt: "먼저 “홈 네트워크” 단계에서 NAS의 IP 주소를 입력하세요.",

    t_rebind: "공유기: DNS 리바인딩 보호",
    i_rebind: "pinn. 주소는 집 네트워크 안의 기기를 가리켜요. FRITZ!Box를 포함한 많은 공유기가 보호를 위해 이를 막아요. 그러면 이 주소로 pinn.이 열리지 않아요. 바로 이 주소만 예외로 두면 해결돼요:",
    g_rebind: [
      "[fritz.box](http://fritz.box)를 열고 로그인하세요.",
      "“Home Network” → “Network” → 탭 “Network Settings”.",
      "맨 아래까지 스크롤하고 “additional settings”를 펼치세요.",
      "“DNS Rebind Protection” 항목의 “Host name exceptions”에 이 줄을 입력하세요: `{SUB}.duckdns.org`",
      "“Apply”를 탭하고, FRITZ!Box가 요청하면 본체에서 확인하세요.",
      "다른 공유기: 설정에서 “DNS rebind”를 찾아 같은 주소를 예외로 입력하세요. 그런 설정이 없으면 보통 할 일이 없어요.",
    ],
    rebindErledigt: "완료 – 예외를 추가했어요",

    t_fern: "외출 중 사용(VPN)",
    i_fern: "pinn.은 일부러 인터넷에 공개하지 않아요. 외출 중에는 휴대폰이 VPN으로 집에 안전하게 연결돼 집 Wi-Fi에 있는 것처럼 쓸 수 있어요. 어떤 방법으로 할까요?",
    c_wg: "WireGuard를 지원하는 FRITZ!Box", c_wg_d: "FRITZ!OS 7.50 이상의 FRITZ!Box가 있다면 추천해요. 무료이고 추가 계정이 필요 없어요.",
    c_ts: "Tailscale", c_ts_d: "다른 공유기를 쓰거나 WireGuard가 안 될 때(예: DS-Lite 회선). tailscale.com 무료 계정이 필요해요.",
    c_kein: "집에서만 사용", c_kein_d: "pinn.을 집 Wi-Fi에서만 사용해요. 언제든 나중에 추가할 수 있어요.",
    L_TS_AUTHKEY: "Tailscale 키(auth key)",
    g_wireguard: [
      "[fritz.box](http://fritz.box)를 열고 로그인하세요. “System” → “Update”에서 FRITZ!OS 7.50 이상이어야 해요(아니면 거기서 업데이트하세요).",
      "“Internet” → “Permit Access” → 탭 “VPN (WireGuard)” → “Add connection”.",
      "“Simplified setup (recommended)” → “Next”를 선택하세요. 기기 한 대를 연결할지 물으면 “Yes”를 선택하세요.",
      "휴대폰 이름을 입력하고(예: `지민의 휴대폰`) → “Finish”. FRITZ!Box가 확인을 요청하면 본체 버튼을 누르거나 전화로 확인하세요.",
      "FRITZ!Box가 MyFRITZ! 계정을 요청하면 무료로 만드세요. 외출 중인 휴대폰은 이것으로 집 공유기를 찾아요.",
      "QR 코드가 나타나요. 휴대폰에 “WireGuard” 앱을 설치하세요: [iPhone](https://apps.apple.com/app/wireguard/id1441195209) · [Android](https://play.google.com/store/apps/details?id=com.wireguard.android).",
      "WireGuard 앱에서 “+” → “QR 코드 스캔”(iPhone: “QR 코드로 생성”) → 화면의 코드를 스캔 → 이름 입력 → VPN 구성 추가를 허용하세요.",
      "테스트: 휴대폰의 Wi-Fi를 끄고 WireGuard를 켠 다음 {ADRESSE}를 여세요.",
      "다른 휴대폰마다 “Add connection”부터 같은 단계를 반복하세요. 기기마다 연결이 따로 생겨요.",
    ],
    wgNurPinnT: "pinn.만 허용(예: 친척용)",
    wgNurPinn: "어떤 기기가 VPN으로 집 네트워크 전체가 아니라 pinn.에만 접속하게 하려면: WireGuard 앱에서 연결을 탭 → “편집” → “허용된 IP”의 내용을 모두 `{NAS_IP}/32, {ROUTER_IP}/32`로 바꾸기 → “저장”. 두 번째 주소는 공유기예요(이름 확인용). 참고: 이 제한은 그 기기에서 적용돼요.",
    wgDsLite: "외출 중에 연결이 안 되나요? 일부 회선(케이블·광랜에 흔한 DS-Lite)에는 자체 IPv4 주소가 없어요. 그러면 WireGuard는 외출 중 휴대폰에 IPv6가 있을 때만 작동해요. 이럴 땐 Tailscale을 쓰세요.",
    g_tailscale: [
      "[login.tailscale.com](https://login.tailscale.com/start)을 열고 무료 계정을 만드세요(예: Google, Microsoft, Apple로 로그인).",
      "관리 콘솔에서 위쪽 “Settings” → 왼쪽 “Keys” → “Generate auth key…”.",
      "기본값 그대로 → “Generate key” → 키(`tskey-auth-`로 시작)를 복사해 위에 붙여 넣으세요.",
      "“다음”을 탭하세요. NAS의 “tailscale” 컨테이너가 1분 안에 이 키로 로그인해요.",
      "Tailscale 관리 콘솔로 돌아가서: 탭 “Machines” → 기기 “pinn”의 “…” → “Edit route settings…” → `{NAS_IP}/32` 체크 → “Save”.",
      "“pinn”의 “…”에서 “Disable key expiry”도 선택하세요. 그러지 않으면 NAS가 180일마다 다시 로그인해야 해요.",
      "모든 휴대폰에 “Tailscale” 앱을 설치하고([iPhone](https://apps.apple.com/app/tailscale/id1470499037) · [Android](https://play.google.com/store/apps/details?id=com.tailscale.ipn)) 같은 계정으로 로그인하세요. 친척은 관리 콘솔의 “Users”에서 초대하세요.",
      "테스트: 휴대폰의 Wi-Fi를 끄고 Tailscale을 연결한 다음 {ADRESSE}를 여세요.",
    ],
    keinFern: "괜찮아요. pinn.은 집 Wi-Fi에서 작동해요. 외부 접속은 메인 관리자 → 초기 설정에서 언제든 추가할 수 있어요.",

    t_google: "Google: Android 캘린더와 연락처",
    i_google: "선택. pinn.에서 Google 캘린더(Android)나 Google 연락처의 생일을 보고 싶을 때 필요해요. 서버 전체에 한 번만 설정하고, 그다음에는 각자 자기 Google 계정으로 pinn.에 로그인해요. iPhone/iCloud라면 여기서 할 일이 없어요.",
    googleBrauchtHttps: "Google에는 “DuckDNS” 단계의 HTTPS 주소가 필요해요.",
    L_REDIRECT: "리디렉션 URI(Google Cloud Console용)",
    L_PINN_GOOGLE_CLIENT_ID: "클라이언트 ID", L_PINN_GOOGLE_CLIENT_SECRET: "클라이언트 보안 비밀",
    g_google: [
      "[console.cloud.google.com](https://console.cloud.google.com)을 열고 Google 계정으로 로그인하세요(처음에는 서비스 약관에 동의).",
      "위쪽 프로젝트 선택기를 탭 → “새 프로젝트” → 이름 `pinn` → “만들기”. 그다음 위쪽에서 프로젝트 “pinn”을 선택하세요.",
      "API 세 개를 사용 설정하세요. 각각 열어서 “사용”을 탭: [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) · [CalDAV API](https://console.cloud.google.com/apis/library/caldav.googleapis.com) · [People API](https://console.cloud.google.com/apis/library/people.googleapis.com).",
      "[Google Auth Platform](https://console.cloud.google.com/auth/overview) 열기 → “시작하기”: 앱 이름 `pinn.`, 지원 이메일 = 내 주소 → 대상 “외부” → 연락처 이메일 → 동의 → “만들기”.",
      "왼쪽 “대상” → “앱 게시” → 확인. 중요: “테스트” 상태에서는 모든 Google 연결이 7일 후에 끊겨요.",
      "왼쪽 “클라이언트” → “클라이언트 만들기” → 애플리케이션 유형 “웹 애플리케이션”, 이름 `pinn.`.",
      "“승인된 리디렉션 URI” → “URI 추가”에 이 주소를 그대로 붙여 넣으세요: `{REDIRECT}` → “만들기”.",
      "클라이언트 ID와 보안 비밀을 복사해 여기에 붙여 넣고 “확인”을 탭하세요. (보안 비밀은 한 번만 표시돼요. 놓쳤다면 클라이언트에서 “보안 비밀 추가”를 쓰세요.)",
      "나중에 연결할 때 Google이 “Google에서 확인하지 않은 앱”이라고 표시해요. 개인용 앱이라 정상이에요: “고급” → “pinn.(으)로 이동”.",
    ],
    test_google_ok: "Google이 이 클라이언트를 알고 있어요 ✓",
    test_google_uri: "클라이언트 ID와 보안 비밀은 맞지만 클라이언트에 리디렉션 URI가 없어요: {0}",
    test_google_ungueltig: "Google이 이 클라이언트 ID나 보안 비밀을 인식하지 못해요. 다시 복사해 주세요.",
    test_google_netz: "NAS에서 Google에 연결할 수 없어요.",
    test_google_fehlt: "클라이언트 ID와 클라이언트 보안 비밀을 입력하세요.",

    t_ki: "레시피용 AI(Google Gemini)",
    i_ki: "선택. AI는 텍스트, 사진, PDF, 링크에서 레시피를 훨씬 잘 읽고 쓰레기 수거 캘린더도 찾아 줘요. 키는 무료이고 NAS에만 저장되며, 앱이 Google과 직접 통신하지 않아요.",
    L_PINN_GEMINI_KEY: "Gemini API 키", L_PINN_GEMINI_MODELL: "고정 모델",
    h_modell: "비워 두면 = 최신 Flash 모델을 자동으로 사용.",
    g_ki: [
      "[aistudio.google.com/apikey](https://aistudio.google.com/apikey)를 열고 Google 계정으로 로그인하세요.",
      "“API 키 만들기”를 탭하세요. 프로젝트를 물으면 이전 단계의 프로젝트 “pinn”을 고르거나 새로 만드세요.",
      "키(보통 `AIza`로 시작)를 복사해 여기에 붙여 넣고 “확인”을 탭하세요.",
      "참고: 무료 등급에서는 보낸 레시피 텍스트가 Google 서비스 개선에 쓰일 수 있어요.",
    ],
    test_gemini_ok: "키가 유효해요 ✓",
    test_gemini_ungueltig: "Google이 키를 거부했어요. 다시 복사해 주세요.",
    test_gemini_gesperrt: "이 키는 Gemini API에 사용할 수 없어요. AI Studio에서 새 키를 만드세요.",
    test_gemini_netz: "NAS에서 Google에 연결할 수 없어요.",
    test_gemini_fehlt: "키를 입력하세요.",

    t_ortung: "위치(가족 → 실시간 위치)",
    i_ortung: "선택. 휴대폰은 pinn.에서 직접 위치를 공유해요 – 여기서 입력할 것은 없어요. “traccar” 컨테이너는 SIM 카드가 있는 GPS 추적기에만 필요해요.",
    l_ortung: [
      "위치 공유는 pinn.에서 바로 돼요(가족 → 위치). pinn.을 닫아도 계속 보내려면 “Traccar Client” 앱을 설치하세요 – pinn.으로 바로 보내요.",
      "서버 주소와 기기 ID는 나중에 pinn.의 가족 → ⚙︎ 위치에서 사람마다 보여 줘요.",
      "외출 중에는 휴대폰에 “외출 중 사용” 단계의 VPN이 필요해요.",
      "SIM 카드가 있는 GPS 추적기(예: 강아지 목걸이)는 모바일 네트워크로 보내므로 공유기에서 포트 포워딩이 필요해요. 추적기를 추가할 때 pinn.이 안내를 보여 줘요.",
    ],
    appTraccar: "“Traccar Client” 앱:",
    h_traccar: "Traccar에서 이미 직접 계정을 만든 경우에만 입력하세요. 비워 두면 = pinn.이 직접 만들어요.",
    L_PINN_TRACCAR_EMAIL: "Traccar 이메일", L_PINN_TRACCAR_PASSWORT: "Traccar 비밀번호",
    test_traccar_ok: "Traccar가 실행 중이에요 ✓",
    test_traccar_aus: "“traccar” 컨테이너가 실행 중이 아니에요 – 휴대폰에는 필요 없어요. GPS 추적기를 쓸 때만 .env 파일에 COMPOSE_PROFILES=tracker를 추가하세요.",

    t_ha: "스마트홈: Home Assistant",
    i_ha: "선택. Home Assistant는 어디에서 실행되나요?",
    c_ha_kein: "Home Assistant 없음",
    c_ha_geraet: "별도 기기에서", c_ha_geraet_d: "예: Raspberry Pi 또는 Home Assistant Green.",
    c_ha_vm: "이 NAS의 가상 머신으로", c_ha_vm_d: "그러면 pinn.이 작은 네트워크 우회로를 설정해요. 그러지 않으면 NAS가 VM에 연결할 수 없어요.",
    haGeraetInfo: "여기서 입력할 것은 없어요. 각 가족이 pinn.의 설정 → 스마트홈에서 연결을 설정해요.",
    L_HA_IP: "Home Assistant의 IP 주소", L_HILFS_IP: "비어 있는 보조 주소", L_NAS_NETZWERKKARTE: "NAS 네트워크 인터페이스",
    h_karte: "“auto” = pinn.이 네트워크 인터페이스를 직접 찾아요.",
    g_ha: [
      "Home Assistant의 IP: Home Assistant의 “설정” → “시스템” → “네트워크”, 또는 FRITZ!Box의 “Home Network” → “Network”에서 기기 “homeassistant”를 찾으세요. 거기서 “항상 같은 IPv4 주소 할당”에도 체크하세요.",
      "보조 주소: 집 네트워크에서 어떤 기기도 쓰지 않고 공유기도 나눠 주지 않는 주소예요. FRITZ!Box의 “Home Network” → “Network” → “Network Settings” → “IPv4 settings”에서 공유기가 나눠 주는 범위(예: .20~.200)를 볼 수 있어요. 그보다 위의 주소를 고르세요(예: `{VORSCHLAG}`).",
      "“다음”을 탭하면 “ha-netz” 컨테이너가 1분 안에 우회로를 설정해요. “확인”으로 pinn.이 Home Assistant에 연결되는지 볼 수 있어요.",
      "Home Assistant 액세스 토큰은 각 가족이 나중에 pinn.의 설정 → 스마트홈에서 입력해요.",
    ],
    haAktiv: "{0}을(를) 통한 우회로가 활성화됐어요(보조 주소 {1}) ✓", haWartet: "우회로가 설정을 기다리고 있어요.", haFehler: "우회로를 설정하지 못했어요(네트워크 인터페이스: {0}).",
    test_homeassistant_ok: "Home Assistant에 연결돼요 ✓",
    test_homeassistant_aus: "Home Assistant에 (아직) 연결되지 않아요. “다음” 후 1분 정도 기다렸다가 다시 확인하세요.",
    test_homeassistant_fehlt: "Home Assistant의 IP 주소를 입력하세요.",

    t_apps: "앱과 기기",
    i_apps: "거의 다 됐어요! 가족이 휴대폰에 필요한 것:",
    a_home_t: "홈 화면의 pinn.(모두)",
    a_home: [
      "iPhone/iPad: Safari에서 {ADRESSE} 열기 → 공유 아이콘(화살표가 있는 사각형) → “홈 화면에 추가” → “추가”. 이 방법으로만 푸시 알림이 작동해요(iOS 16.4 이상).",
      "Android: Chrome에서 {ADRESSE} 열기 → 오른쪽 위 ⋮ → “앱 설치” 또는 “홈 화면에 추가”.",
      "항상 https 주소를 쓰세요 – :8090이 붙은 주소가 아니에요.",
    ],
    a_vpn: "외출 중 사용 – 설정은 “외출 중 사용” 단계 참고:",
    a_traccar: "위치 추적에만 필요:",
    a_icloud_t: "iCloud 캘린더(iPhone)",
    a_icloud: "각 가족이 pinn.의 설정 → 캘린더에서 직접 iCloud 캘린더를 연결해요. 앱 암호가 필요해요: [account.apple.com](https://account.apple.com) → “로그인 및 보안” → “앱 암호” → “+” → 이름 `pinn.` → 표시된 암호(xxxx-xxxx-xxxx-xxxx)를 pinn.에 입력.",
    a_push_t: "푸시 알림",
    a_push: "각자 pinn.의 설정 → 알림 → “이 기기에서 켜기”로 켜요. iPhone에서는 홈 화면 앱에서만 가능해요.",

    t_fertig: "요약",
    i_fertig: "내용을 확인하세요. “저장하고 시작”을 누르면 pinn.이 모두 적용하고 한 번 짧게 다시 시작해요(약 10~20초).",
    S_ADRESSE: "주소", S_REBIND: "DNS 리바인딩 예외", S_FERN: "외출 중", S_KI: "AI", S_ORTUNG: "위치",
    L_PINN_PUSH_KONTAKT: "푸시 서비스용 연락처",
    h_push: "Apple과 Google은 푸시 알림에 연락처 주소(이메일)를 요구해요. 비워 두면 = pinn.이 자기 주소를 써요.",
    neustart: "pinn.을 다시 시작하는 중 …", neustartOk: "다시 시작됨 ✓", neustartFehler: "pinn.이 응답하지 않아요. 1~2분 후 새로 고침해 주세요.",
    pruefeHttps: "HTTPS 확인 중 …", pruefeAlles: "모두 확인 중 …",
    zertifikatDauert: "처음에는 보안 인증서를 받아 와요 – 1~2분 걸릴 수 있어요 …",
    httpsOk: "{0}에 연결돼요 ✓",
    httpsFehler: "{0}이(가) 아직 응답하지 않아요. 흔한 원인: 공유기의 DNS 리바인딩 보호(5단계), 이 기기가 집 네트워크에 없음, 또는 인증서에 시간이 조금 더 걸림. 나중에 “다시 확인”으로 시도하세요.",
    httpsAus: "HTTPS 주소가 설정되지 않았어요(DuckDNS 단계).",
    t_geschafft: "완료! 🎉",
    geschafftText: "pinn. 설정이 끝났어요. 이제부터 이 주소로 pinn.을 열고 모든 휴대폰에 저장하세요(“앱과 기기” 참고). 다음으로 가족 관리에서 첫 가족을 만드세요.",
    nochmalPruefen: "다시 확인", zurVerwaltung: "가족 관리로",
  };

  var STEPS = [
    { id: 'sprache' },
    { id: 'start' },
    { id: 'netz', keys: ['NAS_IP'], pflicht: true },
    { id: 'duckdns', keys: ['DUCKDNS_SUBDOMAIN', 'DUCKDNS_TOKEN', 'PINN_ADRESSE'], pflicht: true },
    { id: 'rebind' },
    { id: 'fernzugriff', keys: ['TS_AUTHKEY'] },
    { id: 'google', keys: ['PINN_GOOGLE_CLIENT_ID', 'PINN_GOOGLE_CLIENT_SECRET'], optional: true },
    { id: 'ki', keys: ['PINN_GEMINI_KEY', 'PINN_GEMINI_MODELL'], optional: true },
    { id: 'ortung', keys: ['PINN_TRACCAR_EMAIL', 'PINN_TRACCAR_PASSWORT'], optional: true },
    { id: 'homeassistant', keys: ['HA_IP', 'HILFS_IP', 'NAS_NETZWERKKARTE'], optional: true },
    { id: 'apps' },
    { id: 'fertig', keys: ['PINN_PUSH_KONTAKT'] },
  ];
  var GEHEIM = { DUCKDNS_TOKEN: 1, PINN_GOOGLE_CLIENT_SECRET: 1, PINN_GEMINI_KEY: 1, PINN_TRACCAR_PASSWORT: 1, TS_AUTHKEY: 1 };
  var LS_STEP = 'pinn.einrichtung.schritt';
  var SS_LATER = 'pinn.einrichtung.spaeter';

  var S = {
    lang: 'de', step: 0, maxStep: 0, status: null, meta: {}, leeren: {}, tests: {},
    busy: false, opts: {}, root: null, done: false, msg: null, port: '8443',
  };

  /* ---------- Hilfen ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(s, args) {
    return String(s).replace(/\{(\d+)\}/g, function (m, i) { return args[i] != null ? args[i] : m; });
  }
  function t(key) {
    var args = Array.prototype.slice.call(arguments, 1);
    var d = T[S.lang] || T.de;
    var s = d[key];
    if (s == null) s = T.de[key];
    if (s == null) return key;
    return fmt(s, args);
  }
  function list(key) {
    var d = T[S.lang] || T.de;
    var a = d[key] || T.de[key] || [];
    return Array.isArray(a) ? a : [a];
  }
  function feld(key) {
    var f = S.status && S.status.felder && S.status.felder[key];
    return f || {};
  }
  function inputVal(key) {
    var el = S.root && S.root.querySelector('[data-key="' + key + '"]');
    return el ? String(el.value || '').trim() : null;
  }
  // aktueller (evtl. gerade getippter) Wert eines normalen Feldes
  function cur(key) {
    var v = inputVal(key);
    if (v !== null) return v;
    if (S.draft && Object.prototype.hasOwnProperty.call(S.draft, key)) return S.draft[key];
    return feld(key).wert || '';
  }
  function hostIp() {
    var h = location.hostname || '';
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) ? h : '';
  }
  function nasIp() { return cur('NAS_IP') || hostIp(); }
  function routerIp() {
    var ip = nasIp();
    return ip ? ip.replace(/\.\d+$/, '.1') : '192.168.178.1';
  }
  function hilfsVorschlag() {
    var ip = nasIp();
    return ip ? ip.replace(/\.\d+$/, '.250') : '192.168.178.250';
  }
  function sub() {
    var v = cur('DUCKDNS_SUBDOMAIN').toLowerCase().replace(/^https?:\/\//, '').replace(/\.duckdns\.org.*$/, '').replace(/[\/:].*$/, '');
    return v;
  }
  function portAus(adr) {
    var m = /:(\d{2,5})$/.exec(String(adr || ''));
    return m ? m[1] : '';
  }
  function adresse() {
    var s = sub();
    if (s) return 'https://' + s + '.duckdns.org' + (S.port && S.port !== '443' ? ':' + S.port : '');
    return feld('PINN_ADRESSE').wert || '';
  }
  function redirectUri() {
    var a = adresse();
    return (a || 'https://…') + '/api/pinn/google/callback';
  }
  function ctx() {
    var s = sub();
    return {
      NAS_IP: nasIp() || '192.168.178.x',
      ROUTER_IP: routerIp(),
      SUB: s || 'name',
      ADRESSE: adresse() || 'https://name.duckdns.org:8443',
      REDIRECT: redirectUri(),
      VORSCHLAG: hilfsVorschlag(),
    };
  }
  // Text mit Platzhaltern {NAS_IP}, Links [Text](https://…) und Code `…` (antippen = kopieren)
  function rich(s) {
    var c = ctx();
    var out = esc(s);
    out = out.replace(/\{([A-Z_]+)\}/g, function (m, k) { return c[k] != null ? esc(c[k]) : m; });
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    out = out.replace(/`([^`]+)`/g, function (m, code) {
      return '<span class="ps-code" data-copy="' + code + '" title="' + esc(t('kopieren')) + '">' + code + '</span>';
    });
    return out;
  }
  function ol(key) {
    return '<ol class="ps-ol">' + list(key).map(function (s) { return '<li>' + rich(s) + '</li>'; }).join('') + '</ol>';
  }
  function guide(key, open) {
    return '<details class="ps-guide"' + (open ? ' open' : '') + '><summary>' + esc(t('anleitung')) + '</summary>' + ol(key) + '</details>';
  }
  function msg(kind, html) {
    return '<div class="ps-msg ' + kind + '">' + html + '</div>';
  }
  function copyBox(value) {
    return '<div class="ps-copybox"><span class="ps-copyval">' + esc(value) + '</span>' +
      '<button type="button" class="ps-btn2 ps-small" data-copy="' + esc(value) + '">' + esc(t('kopieren')) + '</button></div>';
  }
  function copyText(text, btn) {
    var done = function () {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = t('kopiert');
      setTimeout(function () { btn.textContent = old; }, 1400);
    };
    try {
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); }); return; }
    } catch (e) { /* weiter */ }
    fallbackCopy(text); done();
  }
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    } catch (e) { /* egal */ }
  }

  /* ---------- Server ---------- */
  function api(url, opts) {
    var f = S.opts.apiFetch || window.fetch.bind(window);
    return f(url, opts || {}).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var e = new Error(body.error || ('HTTP ' + res.status));
          e.code = body.code || ''; e.feld = body.feld || '';
          throw e;
        }
        return body;
      });
    }, function () {
      var e = new Error(t('fehlerNetz')); e.code = 'netz'; throw e;
    });
  }
  function post(url, payload) {
    return api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
  }
  function loadStatus() {
    return api('/api/pinn/einrichtung', { cache: 'no-store' }).then(function (st) {
      S.status = st;
      S.meta = Object.assign({}, st.meta || {}, S.meta);
      if (!S.meta.homeassistant && feld('HA_IP').wert) S.meta.homeassistant = 'vm';
      if (!S.meta.fernzugriff && feld('TS_AUTHKEY').gesetzt) S.meta.fernzugriff = 'tailscale';
      var p = portAus(feld('PINN_ADRESSE').wert);
      if (p) S.port = p; else S.port = st.portStandard || '8443';
      return st;
    });
  }

  /* ---------- Werte des aktuellen Schritts einsammeln ---------- */
  function collect(step) {
    var werte = {};
    (step.keys || []).forEach(function (k) {
      var v = inputVal(k);
      if (GEHEIM[k]) {
        if (S.leeren[k]) werte[k] = '';
        else if (v) werte[k] = v;
        else werte[k] = null; // unverändert
      } else if (v !== null) {
        werte[k] = v;
      }
    });
    if (step.id === 'duckdns') {
      var p = S.root.querySelector('#ps_port');
      if (p) S.port = String(p.value || '').replace(/\D/g, '') || '8443';
      werte.PINN_ADRESSE = adresse();
    }
    if (step.id === 'fernzugriff' && S.meta.fernzugriff !== 'tailscale') {
      if (feld('TS_AUTHKEY').gesetzt) werte.TS_AUTHKEY = '';
      else delete werte.TS_AUTHKEY;
    }
    if (step.id === 'homeassistant' && S.meta.homeassistant !== 'vm') {
      werte = {};
      if (feld('HA_IP').wert) werte.HA_IP = '';
    }
    return werte;
  }
  function metaFor(step) {
    var m = { sprache: S.lang };
    if (step.id === 'rebind') m.rebind = S.meta.rebind || '';
    if (step.id === 'fernzugriff') m.fernzugriff = S.meta.fernzugriff || '';
    if (step.id === 'homeassistant') m.homeassistant = S.meta.homeassistant || '';
    return m;
  }
  function pflichtFehlt(step, werte) {
    if (step.id === 'netz') return !werte.NAS_IP;
    if (step.id === 'duckdns') {
      return !werte.DUCKDNS_SUBDOMAIN || !(werte.DUCKDNS_TOKEN || (feld('DUCKDNS_TOKEN').gesetzt && !S.leeren.DUCKDNS_TOKEN));
    }
    return false;
  }
  function markErr(key) {
    if (!S.root) return;
    S.root.querySelectorAll('.ps-inwrap.err').forEach(function (el) { el.classList.remove('err'); });
    var el = key && S.root.querySelector('[data-key="' + key + '"]');
    if (el && el.parentNode) { el.parentNode.classList.add('err'); try { el.focus(); } catch (e) { /* egal */ } }
  }
  function errText(e) {
    if (e.code === 'ungueltig' && e.feld) return t('fehlerFeld', t('L_' + e.feld));
    if (e.code === 'ordner_fehlt') return t('ordnerFehlt');
    if (e.code === 'netz') return t('fehlerNetz');
    return e.message || t('fehler');
  }

  /* ---------- Felder ---------- */
  function field(key, o) {
    o = o || {};
    var f = feld(key);
    var geheim = !!GEHEIM[key];
    var val = '';
    if (!geheim) {
      if (S.draft && Object.prototype.hasOwnProperty.call(S.draft, key)) val = S.draft[key];
      else val = f.wert || o.vorschlag || '';
    }
    var ph = o.ph || '';
    if (geheim && f.gesetzt && !S.leeren[key]) ph = t('gespeichertGeheim', f.ende);
    var h = '<label class="ps-label" for="ps_' + key + '">' + esc(t('L_' + key)) +
      (o.optional ? ' <span class="ps-opt">· ' + esc(t('optional')) + '</span>' : '') + '</label>';
    h += '<div class="ps-inwrap">' +
      '<input id="ps_' + key + '" data-key="' + key + '" class="ps-input" type="' + (geheim ? 'password' : 'text') + '"' +
      ' autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"' +
      (o.inputmode ? ' inputmode="' + o.inputmode + '"' : '') +
      ' value="' + esc(val) + '" placeholder="' + esc(ph) + '">' +
      (o.suffix ? '<span class="ps-suffix">' + esc(o.suffix) + '</span>' : '') +
      (geheim ? '<button type="button" class="ps-eye" data-eye="' + key + '" aria-label="' + esc(t('zeigen')) + '">👁</button>' : '') +
      '</div>';
    var hints = [];
    if (f.quelle === 'env') hints.push(esc(t('ausEnv')));
    if (geheim && f.gesetzt && !S.leeren[key]) hints.push(esc(t('leerLassen')) + ' · <button type="button" class="ps-link" data-leeren="' + key + '">' + esc(t('entfernen')) + '</button>');
    if (geheim && S.leeren[key]) hints.push(esc(t('wirdEntfernt')));
    if (o.hint) hints.push(o.hint);
    if (hints.length) h += '<p class="ps-hint">' + hints.join(' · ') + '</p>';
    return h;
  }
  function testBtn(art) {
    var r = S.tests[art];
    var h = '<div class="ps-testrow"><button type="button" class="ps-btn2" data-test="' + art + '">' +
      esc(r === 'laeuft' ? t('pruefe') : t('pruefen')) + '</button></div>';
    if (r && r !== 'laeuft') h += testMsg(art, r);
    return h;
  }
  function testMsg(art, r) {
    var key = 'test_' + art + '_' + (r.code || 'netz');
    var text = t(key, r.adresse || r.redirect || '', r.ip || '');
    if (text === key) text = r.ok ? t('ok') : t('fehler');
    if (r.details && !r.ok && r.code === 'netz') text += ' <span class="ps-dim">(' + esc(r.details) + ')</span>';
    return msg(r.ok ? 'ok' : 'err', text);
  }
  function choice(group, value, title, desc) {
    var on = S.meta[group] === value;
    return '<button type="button" class="ps-choice' + (on ? ' on' : '') + '" data-choice="' + group + '" data-value="' + value + '">' +
      '<span class="ps-radio">' + (on ? '●' : '○') + '</span><span><b>' + esc(title) + '</b>' +
      (desc ? '<br><span class="ps-dim">' + rich(desc) + '</span>' : '') + '</span></button>';
  }
  function storeLinks(key) {
    var L = {
      wireguard: ['https://apps.apple.com/app/wireguard/id1441195209', 'https://play.google.com/store/apps/details?id=com.wireguard.android'],
      tailscale: ['https://apps.apple.com/app/tailscale/id1470499037', 'https://play.google.com/store/apps/details?id=com.tailscale.ipn'],
      traccar: ['https://apps.apple.com/app/traccar-client/id843156974', 'https://play.google.com/store/apps/details?id=org.traccar.client'],
    }[key];
    return '<span class="ps-stores"><a href="' + L[0] + '" target="_blank" rel="noopener">iPhone</a> · <a href="' + L[1] + '" target="_blank" rel="noopener">Android</a></span>';
  }

  /* ---------- Schritte ---------- */
  var R = {};
  R.sprache = function () {
    var langs = (window.PINN_LANGUAGES || []).slice();
    var order = { de: 0, en: 1, fr: 2, es: 3, it: 4, pt: 5, zh: 6, ja: 7, ko: 8 };
    langs = langs.filter(function (l) { return order[l.code] != null; }).sort(function (a, b) { return order[a.code] - order[b.code]; });
    var h = '<h2 class="ps-h">' + esc(t('t_sprache')) + '</h2><p class="ps-p">' + esc(t('i_sprache')) + '</p><div class="ps-langs">';
    langs.forEach(function (l) {
      h += '<button type="button" class="ps-lang' + (S.lang === l.code ? ' on' : '') + '" data-lang="' + l.code + '">' + (l.flag || '') + '<span>' + esc(l.name) + '</span></button>';
    });
    return h + '</div>';
  };
  R.start = function () {
    var st = S.status || {};
    var h = '<h2 class="ps-h">' + esc(t('t_start')) + '</h2><p class="ps-p">' + esc(t('i_start')) + '</p>';
    h += '<ul class="ps-ul">' + list('l_start').map(function (s) { return '<li>' + rich(s) + '</li>'; }).join('') + '</ul>';
    h += msg('info', esc(t('pflichtInfo')));
    if (st.ordner === 'ok') h += msg('ok', esc(t('serverOk')));
    else h += msg('err', esc(st.ordner === 'fehlt' ? t('ordnerFehlt') : t('ordnerSchreibschutz')));
    if (st.fertig) h += msg('info', esc(t('schonFertig')));
    return h;
  };
  R.netz = function () {
    var ip = hostIp();
    var h = '<h2 class="ps-h">' + esc(t('t_netz')) + '</h2><p class="ps-p">' + esc(t('i_netz')) + '</p>';
    h += field('NAS_IP', { ph: '192.168.178.20', inputmode: 'decimal', vorschlag: ip, hint: ip ? esc(t('erkannt', ip)) : '' });
    return h + guide('g_netz', !feld('NAS_IP').wert);
  };
  R.duckdns = function () {
    var h = '<h2 class="ps-h">' + esc(t('t_duckdns')) + '</h2><p class="ps-p">' + esc(t('i_duckdns')) + '</p>';
    h += field('DUCKDNS_SUBDOMAIN', { ph: t('ph_sub'), suffix: '.duckdns.org' });
    h += field('DUCKDNS_TOKEN', { ph: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' });
    h += '<p class="ps-hint" id="ps_adr">' + esc(t('deineAdresse')) + ' <b>' + esc(adresse() || '–') + '</b></p>';
    h += testBtn('duckdns');
    h += '<details class="ps-adv"><summary>' + esc(t('erweitert')) + '</summary>' +
      '<label class="ps-label" for="ps_port">' + esc(t('L_PORT')) + '</label>' +
      '<div class="ps-inwrap"><input id="ps_port" class="ps-input" inputmode="numeric" value="' + esc(S.port) + '"></div>' +
      '<p class="ps-hint">' + esc(t('h_port')) + '</p></details>';
    return h + guide('g_duckdns', !feld('DUCKDNS_TOKEN').gesetzt);
  };
  R.rebind = function () {
    var h = '<h2 class="ps-h">' + esc(t('t_rebind')) + '</h2><p class="ps-p">' + esc(t('i_rebind')) + '</p>';
    h += copyBox((sub() || 'name') + '.duckdns.org');
    h += guide('g_rebind', true);
    h += '<label class="ps-check"><input type="checkbox" id="ps_rebind"' + (S.meta.rebind === 'ja' ? ' checked' : '') + '> ' + esc(t('rebindErledigt')) + '</label>';
    return h;
  };
  R.fernzugriff = function () {
    var v = S.meta.fernzugriff || '';
    var h = '<h2 class="ps-h">' + esc(t('t_fern')) + '</h2><p class="ps-p">' + esc(t('i_fern')) + '</p>';
    h += choice('fernzugriff', 'wireguard', t('c_wg'), t('c_wg_d'));
    h += choice('fernzugriff', 'tailscale', t('c_ts'), t('c_ts_d'));
    h += choice('fernzugriff', 'keiner', t('c_kein'), t('c_kein_d'));
    if (v === 'wireguard') {
      h += guide('g_wireguard', true);
      h += '<div class="ps-box"><b>' + esc(t('wgNurPinnT')) + '</b><p>' + rich(t('wgNurPinn')) + '</p></div>';
      h += msg('info', rich(t('wgDsLite')));
    } else if (v === 'tailscale') {
      h += field('TS_AUTHKEY', { ph: 'tskey-auth-…' });
      h += guide('g_tailscale', true);
    } else if (v === 'keiner') {
      h += msg('info', esc(t('keinFern')));
    }
    return h;
  };
  R.google = function () {
    var h = '<h2 class="ps-h">' + esc(t('t_google')) + '</h2><p class="ps-p">' + esc(t('i_google')) + '</p>';
    if (!adresse()) h += msg('err', esc(t('googleBrauchtHttps')));
    h += '<label class="ps-label">' + esc(t('L_REDIRECT')) + '</label>' + copyBox(redirectUri());
    h += field('PINN_GOOGLE_CLIENT_ID', { ph: '123456789-abc….apps.googleusercontent.com' });
    h += field('PINN_GOOGLE_CLIENT_SECRET', { ph: 'GOCSPX-…' });
    h += testBtn('google');
    return h + guide('g_google', !feld('PINN_GOOGLE_CLIENT_ID').wert);
  };
  R.ki = function () {
    var h = '<h2 class="ps-h">' + esc(t('t_ki')) + '</h2><p class="ps-p">' + esc(t('i_ki')) + '</p>';
    h += field('PINN_GEMINI_KEY', { ph: 'AIza…' });
    h += testBtn('gemini');
    h += '<details class="ps-adv"><summary>' + esc(t('erweitert')) + '</summary>' +
      field('PINN_GEMINI_MODELL', { ph: 'gemini-2.5-flash', optional: true, hint: esc(t('h_modell')) }) + '</details>';
    return h + guide('g_ki', !feld('PINN_GEMINI_KEY').gesetzt);
  };
  R.ortung = function () {
    var h = '<h2 class="ps-h">' + esc(t('t_ortung')) + '</h2><p class="ps-p">' + esc(t('i_ortung')) + '</p>';
    var r = S.tests.traccar;
    if (!r) { setTimeout(function () { runTest('traccar'); }, 50); h += msg('info', esc(t('pruefe'))); }
    else if (r === 'laeuft') h += msg('info', esc(t('pruefe')));
    else h += r.ok ? testMsg('traccar', r) : msg('info', esc(t('test_traccar_aus')));
    h += '<ul class="ps-ul">' + list('l_ortung').map(function (s) { return '<li>' + rich(s) + '</li>'; }).join('') + '</ul>';
    h += '<p class="ps-hint">' + esc(t('appTraccar')) + ' ' + storeLinks('traccar') + '</p>';
    h += '<details class="ps-adv"><summary>' + esc(t('erweitert')) + '</summary><p class="ps-hint">' + esc(t('h_traccar')) + '</p>' +
      field('PINN_TRACCAR_EMAIL', { optional: true, inputmode: 'email' }) + field('PINN_TRACCAR_PASSWORT', { optional: true }) + '</details>';
    return h;
  };
  R.homeassistant = function () {
    var v = S.meta.homeassistant || '';
    var h = '<h2 class="ps-h">' + esc(t('t_ha')) + '</h2><p class="ps-p">' + esc(t('i_ha')) + '</p>';
    h += choice('homeassistant', 'keiner', t('c_ha_kein'), '');
    h += choice('homeassistant', 'geraet', t('c_ha_geraet'), t('c_ha_geraet_d'));
    h += choice('homeassistant', 'vm', t('c_ha_vm'), t('c_ha_vm_d'));
    if (v === 'vm') {
      h += field('HA_IP', { ph: '192.168.178.30', inputmode: 'decimal' });
      h += field('HILFS_IP', { ph: hilfsVorschlag(), inputmode: 'decimal', vorschlag: hilfsVorschlag() });
      h += '<details class="ps-adv"><summary>' + esc(t('erweitert')) + '</summary>' +
        field('NAS_NETZWERKKARTE', { vorschlag: 'auto', hint: esc(t('h_karte')) }) + '</details>';
      var hs = S.status && S.status.haNetz;
      if (hs && hs.zustand) {
        var txt = hs.zustand === 'aktiv' ? t('haAktiv', hs.karte, hs.hilfsIp) : (hs.zustand === 'wartet' ? t('haWartet') : t('haFehler', hs.karte || '?'));
        h += msg(hs.zustand === 'aktiv' ? 'ok' : (hs.zustand === 'wartet' ? 'info' : 'err'), esc(txt));
      }
      h += testBtn('homeassistant');
      h += guide('g_ha', !feld('HA_IP').wert);
    } else if (v === 'geraet') {
      h += msg('info', esc(t('haGeraetInfo')));
    }
    return h;
  };
  R.apps = function () {
    var v = S.meta.fernzugriff || '';
    var h = '<h2 class="ps-h">' + esc(t('t_apps')) + '</h2><p class="ps-p">' + esc(t('i_apps')) + '</p>';
    h += '<div class="ps-box"><b>📱 ' + esc(t('a_home_t')) + '</b>' + ol('a_home') + '</div>';
    if (v === 'wireguard') h += '<div class="ps-box"><b>🔐 WireGuard</b><p>' + esc(t('a_vpn')) + ' ' + storeLinks('wireguard') + '</p></div>';
    if (v === 'tailscale') h += '<div class="ps-box"><b>🔐 Tailscale</b><p>' + esc(t('a_vpn')) + ' ' + storeLinks('tailscale') + '</p></div>';
    h += '<div class="ps-box"><b>📍 Traccar Client</b> <span class="ps-opt">· ' + esc(t('optional')) + '</span><p>' + esc(t('a_traccar')) + ' ' + storeLinks('traccar') + '</p></div>';
    h += '<div class="ps-box"><b>🍎 ' + esc(t('a_icloud_t')) + '</b><p>' + rich(t('a_icloud')) + '</p></div>';
    h += '<div class="ps-box"><b>🔔 ' + esc(t('a_push_t')) + '</b><p>' + rich(t('a_push')) + '</p></div>';
    return h;
  };
  function sumRow(label, value, state) {
    var icon = state === 'ok' ? '✓' : (state === 'aus' ? '–' : (state === 'err' ? '!' : ''));
    return '<div class="ps-row"><span class="ps-rl">' + esc(label) + '</span><span class="ps-rv">' + (icon ? '<i class="ps-ic ' + state + '">' + icon + '</i> ' : '') + value + '</span></div>';
  }
  function geheimText(key) {
    if (S.leeren[key]) return esc(t('wirdEntfernt'));
    var v = inputVal(key);
    if (v) return '•••• ' + esc(v.slice(-4)) + ' <span class="ps-dim">(' + esc(t('neu')) + ')</span>';
    var f = feld(key);
    return f.gesetzt ? '•••• ' + esc(f.ende) : '<span class="ps-dim">' + esc(t('nichtGesetzt')) + '</span>';
  }
  R.fertig = function () {
    if (S.done) return renderDone();
    var st = S.status || {};
    var F = function (k) { return feld(k); };
    var h = '<h2 class="ps-h">' + esc(t('t_fertig')) + '</h2><p class="ps-p">' + esc(t('i_fertig')) + '</p><div class="ps-sum">';
    h += sumRow(t('S_ADRESSE'), F('PINN_ADRESSE').wert ? esc(F('PINN_ADRESSE').wert) : '<span class="ps-dim">' + esc(t('nichtGesetzt')) + '</span>', F('PINN_ADRESSE').wert ? 'ok' : 'err');
    h += sumRow(t('L_NAS_IP'), esc(F('NAS_IP').wert || '–'), F('NAS_IP').wert ? 'ok' : 'err');
    h += sumRow('DuckDNS', F('DUCKDNS_TOKEN').gesetzt ? esc((F('DUCKDNS_SUBDOMAIN').wert || '') + '.duckdns.org') : '<span class="ps-dim">' + esc(t('nichtGesetzt')) + '</span>', F('DUCKDNS_TOKEN').gesetzt ? 'ok' : 'err');
    h += sumRow(t('S_REBIND'), esc(S.meta.rebind === 'ja' ? t('erledigtKurz') : t('offen')), S.meta.rebind === 'ja' ? 'ok' : 'aus');
    var fz = S.meta.fernzugriff;
    h += sumRow(t('S_FERN'), esc(fz === 'wireguard' ? t('c_wg') : fz === 'tailscale' ? t('c_ts') : fz === 'keiner' ? t('c_kein') : t('offen')), fz && fz !== 'keiner' ? 'ok' : 'aus');
    h += sumRow('Google', F('PINN_GOOGLE_CLIENT_ID').wert ? esc(t('eingerichtet')) : esc(t('aus')), F('PINN_GOOGLE_CLIENT_ID').wert ? 'ok' : 'aus');
    h += sumRow(t('S_KI'), F('PINN_GEMINI_KEY').gesetzt ? geheimText('PINN_GEMINI_KEY') : esc(t('aus')), F('PINN_GEMINI_KEY').gesetzt ? 'ok' : 'aus');
    var ha = S.meta.homeassistant;
    h += sumRow('Home Assistant', esc(ha === 'vm' ? (F('HA_IP').wert || '?') + ' (VM)' : ha === 'geraet' ? t('c_ha_geraet') : t('aus')), ha === 'vm' || ha === 'geraet' ? 'ok' : 'aus');
    h += '</div>';
    h += '<details class="ps-adv"><summary>' + esc(t('erweitert')) + '</summary>' +
      field('PINN_PUSH_KONTAKT', { optional: true, inputmode: 'email', ph: 'name@example.com', hint: esc(t('h_push')) }) + '</details>';
    if (st.ordner !== 'ok') h += msg('err', esc(t('ordnerFehlt')));
    if (S.msg) h += S.msg;
    return h;
  };
  function renderDone() {
    var a = feld('PINN_ADRESSE').wert || adresse();
    var h = '<h2 class="ps-h">' + esc(t('t_geschafft')) + '</h2>';
    h += '<div class="ps-sum">' + (S.checks || []).map(function (c) { return sumRow(c.label, c.text, c.state); }).join('') + '</div>';
    if (S.checksBusy) h += msg('info', esc(S.checksBusy));
    else {
      h += '<p class="ps-p" style="margin-top:1rem">' + rich(t('geschafftText')) + '</p>';
      if (a) h += copyBox(a);
    }
    return h;
  }

  /* ---------- Prüfen ---------- */
  function runTest(art) {
    if (S.tests[art] === 'laeuft') return;
    var step = STEPS[S.step];
    var werte = collect(step);
    S.tests[art] = 'laeuft';
    render(true);
    post('/api/pinn/einrichtung/test', { art: art, werte: werte }).then(function (r) {
      S.tests[art] = r || { ok: false, code: 'netz' };
      if (r && r.feld) markErr(r.feld);
    }, function (e) {
      S.tests[art] = { ok: false, code: 'netz', details: e.message };
    }).then(function () { render(true); });
  }

  /* ---------- Speichern & Weiter ---------- */
  function saveStep(step) {
    var werte = collect(step);
    var meta = metaFor(step);
    var hasWerte = Object.keys(werte).some(function (k) { return werte[k] !== null; });
    if (!hasWerte && step.id !== 'rebind' && step.id !== 'fernzugriff' && step.id !== 'homeassistant' && step.id !== 'sprache') {
      return Promise.resolve();
    }
    return post('/api/pinn/einrichtung/speichern', { werte: werte, meta: meta }).then(function (st) {
      S.status = st;
      S.leeren = {};
      S.draft = null;
    });
  }
  function go(delta, skip) {
    if (S.busy) return;
    var step = STEPS[S.step];
    var next = Math.max(0, Math.min(STEPS.length - 1, S.step + delta));
    if (delta < 0) { keepDraft(); S.step = next; render(); return; }
    if (step.id === 'fernzugriff' && !S.meta.fernzugriff && !skip) { flash(t('bitteWaehlen')); return; }
    if (skip) {
      if (step.pflicht && !window.confirm(t('skipPflicht'))) return;
      S.step = next; S.maxStep = Math.max(S.maxStep, next); keepDraft(); render(); return;
    }
    var werte = collect(step);
    if (step.pflicht && pflichtFehlt(step, werte)) {
      flash(t('pflichtFehlt'));
      markErr(step.id === 'netz' ? 'NAS_IP' : (!werte.DUCKDNS_SUBDOMAIN ? 'DUCKDNS_SUBDOMAIN' : 'DUCKDNS_TOKEN'));
      return;
    }
    S.busy = true;
    setNavBusy(true);
    saveStep(step).then(function () {
      S.busy = false;
      S.step = next;
      S.maxStep = Math.max(S.maxStep, next);
      try { localStorage.setItem(LS_STEP, String(S.step)); } catch (e) { /* egal */ }
      render();
    }, function (e) {
      S.busy = false;
      setNavBusy(false);
      if (e.feld) markErr(e.feld);
      flash(errText(e));
    });
  }
  function keepDraft() {
    // Getippte, noch nicht gespeicherte Werte beim Zurückblättern nicht verlieren
    var step = STEPS[S.step];
    S.draft = S.draft || {};
    (step.keys || []).forEach(function (k) {
      if (GEHEIM[k]) return;
      var v = inputVal(k);
      if (v !== null) S.draft[k] = v;
    });
  }
  function flash(text) {
    var el = S.root && S.root.querySelector('#ps_flash');
    if (!el) return;
    el.innerHTML = msg('err', esc(text));
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* egal */ }
  }
  function setNavBusy(on) {
    var b = S.root && S.root.querySelector('[data-nav="weiter"]');
    if (b) { b.disabled = on; b.textContent = on ? t('speichere') : (S.step === STEPS.length - 1 ? t('speichernStarten') : t('weiter')); }
  }

  /* ---------- Abschließen ---------- */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fetchTimeout(url, ms) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) { /* egal */ } }, ms);
    return fetch(url, { cache: 'no-store', mode: 'cors', signal: ctrl ? ctrl.signal : undefined }).then(function (r) {
      clearTimeout(timer); return r;
    }, function (e) { clearTimeout(timer); throw e; });
  }
  function waitForServer() {
    var start = Date.now();
    var loop = function () {
      if (Date.now() - start > 120000) return Promise.resolve(false);
      return fetchTimeout('/api/health', 4000).then(function (r) { return r.ok; }, function () { return false; }).then(function (ok) {
        if (ok) return true;
        return sleep(1500).then(loop);
      });
    };
    return sleep(4500).then(loop);
  }
  function checkHttps(addr) {
    if (!addr) return Promise.resolve(false);
    if (location.origin === addr) return Promise.resolve(true);
    var tries = 0;
    var loop = function () {
      tries++;
      return fetchTimeout(addr + '/api/health', 8000).then(function (r) { return r.ok; }, function () { return false; }).then(function (ok) {
        if (ok || tries >= 12) return ok;
        if (tries === 2) { S.checksBusy = t('zertifikatDauert'); render(true); }
        return sleep(10000).then(loop);
      });
    };
    return loop();
  }
  function finish() {
    if (S.busy) return;
    var step = STEPS[S.step];
    var werte = collect(step);
    S.busy = true;
    setNavBusy(true);
    post('/api/pinn/einrichtung/abschliessen', { werte: werte, meta: { sprache: S.lang } }).then(function (st) {
      S.status = st;
      S.done = true;
      S.checks = [];
      S.checksBusy = st.neustart ? t('neustart') : t('pruefeAlles');
      render();
      return (st.neustart ? waitForServer() : Promise.resolve(true)).then(function (up) {
        if (!up) { S.checks.push({ label: 'pinn.', text: esc(t('neustartFehler')), state: 'err' }); return; }
        if (st.neustart) S.checks.push({ label: 'pinn.', text: esc(t('neustartOk')), state: 'ok' });
        return loadStatus().catch(function () { return S.status; }).then(runChecks);
      });
    }, function (e) {
      S.busy = false;
      setNavBusy(false);
      if (e.feld) markErr(e.feld);
      flash(errText(e));
    }).then(function () {
      S.busy = false;
      S.checksBusy = '';
      try { localStorage.removeItem(LS_STEP); } catch (e) { /* egal */ }
      if (S.done) render();
    });
  }
  function runChecks() {
    var addr = feld('PINN_ADRESSE').wert;
    S.checksBusy = t('pruefeHttps'); render(true);
    return checkHttps(addr).then(function (ok) {
      S.checks.push({ label: 'HTTPS', text: ok ? esc(t('httpsOk', addr)) : esc(addr ? t('httpsFehler', addr) : t('httpsAus')), state: ok ? 'ok' : (addr ? 'err' : 'aus') });
      S.checksBusy = t('pruefeAlles'); render(true);
      var jobs = [];
      if (feld('PINN_GOOGLE_CLIENT_ID').wert) jobs.push(['google', 'Google']);
      if (feld('PINN_GEMINI_KEY').gesetzt) jobs.push(['gemini', t('S_KI')]);
      if (S.meta.homeassistant === 'vm' && feld('HA_IP').wert) jobs.push(['homeassistant', 'Home Assistant']);
      var chain = Promise.resolve();
      jobs.forEach(function (j) {
        chain = chain.then(function () {
          return post('/api/pinn/einrichtung/test', { art: j[0], werte: {} }).then(function (r) { return r; }, function (e) { return { ok: false, code: 'netz', details: e.message }; }).then(function (r) {
            var key = 'test_' + j[0] + '_' + (r.code || 'netz');
            var txt = t(key, r.adresse || r.redirect || '', r.ip || '');
            if (txt === key) txt = r.ok ? t('ok') : t('fehler');
            S.checks.push({ label: j[1], text: txt, state: r.ok ? 'ok' : 'err' });
            render(true);
          });
        });
      });
      return chain;
    });
  }

  /* ---------- Darstellung ---------- */
  var CSS = '' +
    '#setupScreen{z-index:405;background:var(--c-paper,#FFFBFB);color:#25231F;font-family:Inter,system-ui,-apple-system,sans-serif}' +
    'html.dark #setupScreen{background:#16181a;color:#ECE9E4}' +
    '#setupScreen .pinn-auth-inner{padding-top:calc(env(safe-area-inset-top,0px) + 1.25rem)}' +
    '.ps-wrap{width:100%;max-width:560px}' +
    '.ps-top{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.8rem}' +
    '.ps-brand{font-weight:700;font-size:1.05rem;letter-spacing:-.01em}.ps-brand span{opacity:.45;font-weight:500}' +
    '.ps-close{border:1px solid rgba(37,35,31,.15);border-radius:.55rem;padding:.4rem .75rem;font-size:.78rem;background:transparent;color:inherit;cursor:pointer}' +
    'html.dark .ps-close,html.dark .ps-btn2{border-color:rgba(255,255,255,.18)}' +
    '.ps-bar{height:5px;border-radius:5px;background:rgba(37,35,31,.08);overflow:hidden}' +
    'html.dark .ps-bar{background:rgba(255,255,255,.1)}' +
    '.ps-bar>i{display:block;height:100%;background:var(--c-pine,#00374A);border-radius:5px;transition:width .35s ease}' +
    'html.dark .ps-bar>i{background:#5fa8c2}' +
    '.ps-dots{display:flex;gap:4px;margin:.55rem 0 1rem;flex-wrap:wrap}' +
    '.ps-dot{width:22px;height:22px;border-radius:50%;border:0;font-size:.62rem;font-weight:600;background:rgba(37,35,31,.07);color:inherit;opacity:.55;cursor:pointer;padding:0}' +
    '.ps-dot.done{background:color-mix(in srgb,var(--c-pine,#00374A) 18%,transparent);opacity:.9}' +
    '.ps-dot.on{background:var(--c-pine,#00374A);color:#fff;opacity:1}' +
    '.ps-dot:disabled{cursor:default}' +
    '.ps-card{border:1px solid rgba(37,35,31,.1);border-radius:1.1rem;padding:1.15rem;background:rgba(255,255,255,.65);box-shadow:0 2px 14px rgba(37,35,31,.04)}' +
    'html.dark .ps-card{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1)}' +
    '.ps-h{font-size:1.35rem;font-weight:650;margin:0 0 .4rem;line-height:1.25}' +
    '.ps-p{font-size:.9rem;line-height:1.55;opacity:.82;margin:0 0 .9rem}' +
    '.ps-ul{margin:.2rem 0 .8rem;padding-left:1.15rem;font-size:.88rem;line-height:1.55}.ps-ul li{margin-bottom:.3rem}' +
    '.ps-label{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;opacity:.6;margin:.9rem 0 .3rem}' +
    '.ps-opt{text-transform:none;letter-spacing:0;opacity:.75;font-weight:400}' +
    '.ps-inwrap{display:flex;align-items:center;border:1px solid rgba(37,35,31,.18);border-radius:.65rem;background:#fff;overflow:hidden}' +
    'html.dark .ps-inwrap{background:#212427;border-color:rgba(255,255,255,.16)}' +
    '.ps-inwrap:focus-within{border-color:var(--c-pine,#00374A);box-shadow:0 0 0 3px color-mix(in srgb,var(--c-pine,#00374A) 14%,transparent)}' +
    '.ps-inwrap.err{border-color:#e5484d;box-shadow:0 0 0 3px rgba(229,72,77,.15)}' +
    '.ps-input{flex:1;min-width:0;border:0;outline:0;padding:.65rem .75rem;font-size:16px;background:transparent;color:inherit;font-family:inherit}' +
    '.ps-suffix{padding:0 .75rem 0 0;font-size:.88rem;opacity:.5;white-space:nowrap}' +
    '.ps-eye{border:0;background:transparent;padding:0 .75rem;font-size:1rem;cursor:pointer;opacity:.55}' +
    '.ps-hint{font-size:.76rem;opacity:.65;margin:.35rem 0 0;line-height:1.45}' +
    '.ps-link{border:0;background:none;padding:0;color:#c0392b;font-size:inherit;text-decoration:underline;cursor:pointer}' +
    '.ps-btn{border:0;border-radius:.7rem;padding:.7rem 1.1rem;font-size:.9rem;font-weight:600;background:var(--c-pine,#00374A);color:#fff;cursor:pointer;font-family:inherit}' +
    '.ps-btn:disabled{opacity:.55;cursor:default}' +
    '.ps-btn2{border:1px solid rgba(37,35,31,.18);border-radius:.7rem;padding:.6rem 1rem;font-size:.85rem;font-weight:500;background:transparent;color:inherit;cursor:pointer;font-family:inherit}' +
    '.ps-small{padding:.35rem .7rem;font-size:.75rem;border-radius:.55rem;white-space:nowrap}' +
    '.ps-ghost{border:0;background:none;color:inherit;opacity:.6;font-size:.82rem;cursor:pointer;padding:.6rem .4rem;font-family:inherit}' +
    '.ps-nav{display:flex;gap:.5rem;margin-top:1.2rem;align-items:center}.ps-nav .ps-btn{margin-left:auto}' +
    '.ps-testrow{margin-top:.8rem}' +
    '.ps-guide,.ps-adv{margin-top:1rem;border-top:1px dashed rgba(37,35,31,.16);padding-top:.8rem}' +
    'html.dark .ps-guide,html.dark .ps-adv{border-color:rgba(255,255,255,.15)}' +
    '.ps-guide summary,.ps-adv summary{cursor:pointer;font-weight:600;font-size:.86rem;color:var(--c-pine,#00374A);list-style-position:inside}' +
    '.ps-adv summary{font-weight:500;opacity:.8}' +
    'html.dark .ps-guide summary,html.dark .ps-adv summary{color:#8cc6da}' +
    '.ps-ol{margin:.7rem 0 0;padding-left:1.35rem;font-size:.87rem;line-height:1.58}.ps-ol li{margin-bottom:.55rem;padding-left:.15rem}' +
    '.ps-ol a,.ps-p a,.ps-box a,.ps-dim a,.ps-ul a,.ps-msg a{color:var(--c-pine,#00374A);font-weight:600}' +
    'html.dark .ps-ol a,html.dark .ps-box a,html.dark .ps-ul a,html.dark .ps-msg a,html.dark .ps-dim a{color:#8cc6da}' +
    '.ps-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82em;background:rgba(37,35,31,.07);border-radius:.35rem;padding:.08rem .38rem;cursor:pointer;word-break:break-all}' +
    'html.dark .ps-code{background:rgba(255,255,255,.1)}' +
    '.ps-copybox{display:flex;gap:.5rem;align-items:center;border:1px dashed rgba(37,35,31,.2);border-radius:.65rem;padding:.5rem .6rem;margin:.3rem 0 .4rem}' +
    '.ps-copyval{flex:1;min-width:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.8rem;word-break:break-all}' +
    '.ps-msg{font-size:.83rem;border-radius:.65rem;padding:.6rem .75rem;margin-top:.75rem;line-height:1.45}' +
    '.ps-msg.ok{background:rgba(46,160,67,.12);color:#1d6f33}.ps-msg.err{background:rgba(229,72,77,.11);color:#a8232a}.ps-msg.info{background:color-mix(in srgb,var(--c-pine,#00374A) 8%,transparent)}' +
    'html.dark .ps-msg.ok{color:#7fd896}html.dark .ps-msg.err{color:#ff9a9e}' +
    '.ps-box{border:1px solid rgba(37,35,31,.1);border-radius:.8rem;padding:.75rem .85rem;margin-top:.7rem;font-size:.86rem;line-height:1.5}' +
    'html.dark .ps-box{border-color:rgba(255,255,255,.12)}.ps-box p{margin:.35rem 0 0}.ps-box .ps-ol{margin-top:.4rem}' +
    '.ps-choice{display:flex;gap:.6rem;align-items:flex-start;width:100%;text-align:left;border:1.5px solid rgba(37,35,31,.12);border-radius:.85rem;padding:.75rem .85rem;margin-bottom:.5rem;background:transparent;color:inherit;cursor:pointer;font-size:.88rem;line-height:1.45;font-family:inherit}' +
    'html.dark .ps-choice{border-color:rgba(255,255,255,.14)}' +
    '.ps-choice.on{border-color:var(--c-pine,#00374A);background:color-mix(in srgb,var(--c-pine,#00374A) 7%,transparent)}' +
    '.ps-radio{font-size:1rem;line-height:1.3;color:var(--c-pine,#00374A)}html.dark .ps-radio{color:#8cc6da}' +
    '.ps-dim{opacity:.65;font-size:.92em}' +
    '.ps-langs{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}' +
    '.ps-lang{display:flex;align-items:center;gap:.6rem;border:1.5px solid rgba(37,35,31,.12);border-radius:.85rem;padding:.8rem .9rem;background:transparent;color:inherit;font-size:.95rem;font-weight:500;cursor:pointer;font-family:inherit}' +
    'html.dark .ps-lang{border-color:rgba(255,255,255,.14)}' +
    '.ps-lang.on{border-color:var(--c-pine,#00374A);background:color-mix(in srgb,var(--c-pine,#00374A) 7%,transparent)}' +
    '.ps-lang svg{width:30px;height:20px;border-radius:3px;flex-shrink:0;box-shadow:0 0 0 1px rgba(0,0,0,.08)}' +
    '.ps-check{display:flex;align-items:center;gap:.55rem;margin-top:1rem;font-size:.9rem;font-weight:500;cursor:pointer}.ps-check input{width:20px;height:20px}' +
    '.ps-sum{border:1px solid rgba(37,35,31,.1);border-radius:.8rem;overflow:hidden;margin-top:.4rem}' +
    'html.dark .ps-sum{border-color:rgba(255,255,255,.12)}' +
    '.ps-row{display:flex;justify-content:space-between;gap:.8rem;padding:.55rem .75rem;font-size:.84rem;border-top:1px solid rgba(37,35,31,.07)}.ps-row:first-child{border-top:0}' +
    'html.dark .ps-row{border-color:rgba(255,255,255,.08)}' +
    '.ps-rl{opacity:.65;flex-shrink:0}.ps-rv{text-align:right;word-break:break-word}' +
    '.ps-ic{font-style:normal;font-weight:700;display:inline-block;width:1.1em;text-align:center}.ps-ic.ok{color:#2ea043}.ps-ic.err{color:#e5484d}.ps-ic.aus{opacity:.45}' +
    '.ps-stores a{white-space:nowrap}' +
    '#ps_flash:empty{display:none}';

  function ensureRoot() {
    if (!document.getElementById('ps-style')) {
      var st = document.createElement('style');
      st.id = 'ps-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var root = document.getElementById('setupScreen');
    if (!root) {
      root = document.createElement('div');
      root.id = 'setupScreen';
      root.className = 'pinn-auth-screen';
      root.setAttribute('data-no-i18n', '');
      root.setAttribute('data-no-term', '');
      root.setAttribute('translate', 'no');
      root.innerHTML = '<div class="pinn-auth-inner"><div class="ps-wrap" id="ps_wrap"></div></div>';
      document.body.appendChild(root);
      root.addEventListener('click', onClick);
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
    }
    root.classList.remove('hidden');
    S.root = root;
    return root;
  }

  function render(keepScroll) {
    if (!S.root) return;
    var wrap = S.root.querySelector('#ps_wrap');
    var scroll = S.root.scrollTop;
    // Getippte Werte nicht verlieren, wenn neu gezeichnet wird (z. B. nach „Prüfen“)
    var typed = {};
    S.root.querySelectorAll('[data-key]').forEach(function (el) { typed[el.getAttribute('data-key')] = el.value; });
    var portEl = S.root.querySelector('#ps_port');
    if (portEl) S.port = String(portEl.value || '').replace(/\D/g, '') || S.port;
    var step = STEPS[S.step];
    var total = STEPS.length;
    var pct = Math.round((S.step / (total - 1)) * 100);
    var h = '<div class="ps-top"><div class="ps-brand">pinn. <span>· ' + esc(t('titel')) + '</span></div>' +
      '<button type="button" class="ps-close" data-nav="schliessen">' + esc(S.done && !S.checksBusy ? t('schliessen') : t('spaeter')) + '</button></div>';
    h += '<div class="ps-bar"><i style="width:' + pct + '%"></i></div><div class="ps-dots">';
    STEPS.forEach(function (s, i) {
      var cls = i === S.step ? ' on' : (i <= S.maxStep ? ' done' : '');
      h += '<button type="button" class="ps-dot' + cls + '" data-jump="' + i + '"' + (i > S.maxStep || S.done ? ' disabled' : '') + ' aria-label="' + esc(t('schritt', i + 1, total)) + '">' + (i + 1) + '</button>';
    });
    h += '</div><div class="ps-card">' + R[step.id]() + '<div id="ps_flash"></div>';
    if (!S.done) {
      h += '<div class="ps-nav">';
      if (S.step > 0) h += '<button type="button" class="ps-btn2" data-nav="zurueck">' + esc(t('zurueck')) + '</button>';
      if (step.optional || step.pflicht || step.id === 'rebind' || step.id === 'fernzugriff') h += '<button type="button" class="ps-ghost" data-nav="skip">' + esc(t('ueberspringen')) + '</button>';
      h += '<button type="button" class="ps-btn" data-nav="weiter">' + esc(S.step === total - 1 ? t('speichernStarten') : t('weiter')) + '</button></div>';
    } else if (!S.checksBusy) {
      h += '<div class="ps-nav"><button type="button" class="ps-btn2" data-nav="nochmal">' + esc(t('nochmalPruefen')) + '</button>' +
        '<button type="button" class="ps-btn" data-nav="schliessen">' + esc(t('zurVerwaltung')) + '</button></div>';
    }
    h += '</div><p class="ps-hint" style="text-align:center;margin-top:1rem">' + esc(t('schritt', S.step + 1, total)) + '</p>';
    wrap.innerHTML = h;
    Object.keys(typed).forEach(function (k) {
      var el = S.root.querySelector('[data-key="' + k + '"]');
      if (el && typed[k] != null) el.value = typed[k];
    });
    if (keepScroll) S.root.scrollTop = scroll;
    else S.root.scrollTop = 0;
  }

  function onClick(ev) {
    var el = ev.target.closest('button, .ps-code, a');
    if (!el || !S.root.contains(el)) return;
    if (el.tagName === 'A') return; // Links öffnen normal
    if (el.classList.contains('ps-code')) { copyText(el.getAttribute('data-copy') || el.textContent, null); el.style.outline = '2px solid #2ea043'; setTimeout(function () { el.style.outline = ''; }, 700); return; }
    var d = el.dataset || {};
    if (d.copy != null) { copyText(d.copy, el); return; }
    if (d.lang) {
      S.lang = d.lang;
      try { window.PINN_I18N && window.PINN_I18N.switchTo(d.lang, true); } catch (e) { /* egal */ }
      render(true); return;
    }
    if (d.choice) { keepDraft(); S.meta[d.choice] = d.value; render(true); return; }
    if (d.eye) { var inp = S.root.querySelector('[data-key="' + d.eye + '"]'); if (inp) inp.type = inp.type === 'password' ? 'text' : 'password'; return; }
    if (d.leeren) { if (window.confirm(t('entfernenFrage'))) { S.leeren[d.leeren] = true; render(true); } return; }
    if (d.test) { runTest(d.test); return; }
    if (d.jump != null) { var j = Number(d.jump); if (j <= S.maxStep) { keepDraft(); S.step = j; render(); } return; }
    if (d.nav === 'weiter') { if (S.step === STEPS.length - 1) finish(); else go(1); return; }
    if (d.nav === 'zurueck') { go(-1); return; }
    if (d.nav === 'skip') { go(1, true); return; }
    if (d.nav === 'nochmal') { S.checks = []; S.checksBusy = t('pruefeAlles'); render(); runChecks().then(function () { S.checksBusy = ''; render(); }); return; }
    if (d.nav === 'schliessen') { close(); return; }
  }
  function onInput(ev) {
    var k = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-key');
    if (k && ev.target.parentNode) ev.target.parentNode.classList.remove('err');
    if (k === 'DUCKDNS_SUBDOMAIN' || ev.target.id === 'ps_port') {
      if (ev.target.id === 'ps_port') S.port = String(ev.target.value || '').replace(/\D/g, '') || '8443';
      var a = S.root.querySelector('#ps_adr b');
      if (a) a.textContent = adresse() || '–';
    }
    if (k && S.tests && STEPS[S.step]) {
      // nach einer Änderung gilt das alte Prüfergebnis nicht mehr
      var art = { DUCKDNS_SUBDOMAIN: 'duckdns', DUCKDNS_TOKEN: 'duckdns', PINN_GOOGLE_CLIENT_ID: 'google', PINN_GOOGLE_CLIENT_SECRET: 'google', PINN_GEMINI_KEY: 'gemini', HA_IP: 'homeassistant' }[k];
      if (art && S.tests[art] && S.tests[art] !== 'laeuft') delete S.tests[art];
    }
  }
  function onChange(ev) {
    if (ev.target && ev.target.id === 'ps_rebind') S.meta.rebind = ev.target.checked ? 'ja' : '';
  }

  function close() {
    if (S.busy && !S.done) return;
    if (!S.done) { try { sessionStorage.setItem(SS_LATER, '1'); } catch (e) { /* egal */ } }
    if (S.root) S.root.classList.add('hidden');
    var cb = S.opts.onClose;
    var langChanged = window.PINN_I18N && window.PINN_I18N.current !== S.lang;
    if (langChanged) { try { window.PINN_I18N.switchTo(S.lang); return; } catch (e) { /* weiter */ } }
    if (typeof cb === 'function') { try { cb({ fertig: S.done }); } catch (e) { /* egal */ } }
  }

  function open(opts) {
    S.opts = opts || {};
    var cur0 = (window.PINN_I18N && window.PINN_I18N.current) || 'en';
    S.lang = LANGS.indexOf(cur0) !== -1 ? cur0 : 'en';
    S.done = false; S.checks = []; S.tests = {}; S.leeren = {}; S.draft = null; S.msg = null; S.busy = false;
    ensureRoot();
    S.root.querySelector('#ps_wrap').innerHTML = '<div class="ps-card"><p class="ps-p">' + esc(t('lade')) + '</p></div>';
    return loadStatus().then(function (st) {
      if (LANGS.indexOf(cur0) === -1 && st.meta && LANGS.indexOf(st.meta.sprache) !== -1) S.lang = st.meta.sprache;
      var saved = 0;
      try { saved = Number(localStorage.getItem(LS_STEP) || 0); } catch (e) { saved = 0; }
      if (st.fertig && !S.opts.resume) saved = 0;
      S.step = Math.max(0, Math.min(STEPS.length - 1, saved || 0));
      S.maxStep = st.fertig ? STEPS.length - 1 : Math.max(S.step, saved || 0);
      render();
    }, function (e) {
      S.root.querySelector('#ps_wrap').innerHTML = '<div class="ps-card"><h2 class="ps-h">' + esc(t('titel')) + '</h2>' +
        msg('err', esc(e.code === 'netz' ? t('fehlerNetz') : (/404/.test(e.message) ? t('serverFehlt') : e.message))) +
        '<div class="ps-nav"><button type="button" class="ps-btn" data-nav="schliessen">' + esc(t('schliessen')) + '</button></div></div>';
    });
  }

  // Für index.html: Status abfragen (z. B. für den Hinweis beim Hauptadmin)
  function status(apiFetch) {
    S.opts.apiFetch = apiFetch || S.opts.apiFetch;
    return api('/api/pinn/einrichtung', { cache: 'no-store' });
  }

  window.PinnSetup = { open: open, status: status, laterThisSession: function () { try { return sessionStorage.getItem(SS_LATER) === '1'; } catch (e) { return false; } } };
})();
