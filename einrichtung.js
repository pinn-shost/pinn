/* pinn. – Einrichtungs-Assistent für den Hauptadmin (pb_public/einrichtung.js)
   ----------------------------------------------------------------------------
   Wird von index.html nur bei Bedarf nachgeladen (Hauptadmin → Einrichtung bzw. automatisch nach
   der ersten Anmeldung als Hauptadmin). Eigene Texte in Deutsch, Englisch, Französisch und Spanisch –
   die Übersetzungs-Schicht der App greift hier nicht ein (data-no-i18n / data-no-term).
   Server: pb_hooks/einrichtung.pb.js + pinn-einrichtung.js. Jeder Schritt wird beim Tippen auf
   „Weiter“ gespeichert; am Ende übernimmt pinn. alles mit einem kurzen Neustart. */
(function () {
  'use strict';
  if (window.PinnSetup) return;

  var LANGS = ['de', 'en', 'fr', 'es'];
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
    i_ortung: "Optional. Die Ortung läuft über den Traccar-Container auf dem NAS – pinn. richtet ihn beim ersten Benutzen selbst ein. Hier musst du nichts eintragen.",
    l_ortung: [
      "Wer geortet werden möchte, installiert die App „Traccar Client“.",
      "Server-Adresse und Geräte-ID zeigt pinn. später je Person unter Familie → ⚙︎ Ortung an.",
      "Unterwegs braucht das Handy dafür das VPN aus dem Schritt „Unterwegs nutzen“.",
      "GPS-Tracker mit SIM-Karte (z. B. am Hundehalsband) senden aus dem Mobilfunknetz – dafür braucht es eine Portfreigabe im Router. Die Anleitung zeigt pinn. beim Hinzufügen des Trackers.",
    ],
    appTraccar: "App „Traccar Client“:",
    h_traccar: "Nur ausfüllen, wenn du in Traccar schon selbst ein Konto angelegt hast. Leer = pinn. legt selbst eins an.",
    L_PINN_TRACCAR_EMAIL: "Traccar-E-Mail", L_PINN_TRACCAR_PASSWORT: "Traccar-Passwort",
    test_traccar_ok: "Traccar läuft ✓",
    test_traccar_aus: "Traccar ist nicht erreichbar – läuft der Container „traccar“?",

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
    i_ortung: "Optional. Location tracking runs via the Traccar container on the NAS – pinn. sets it up itself the first time it's used. Nothing to enter here.",
    l_ortung: [
      "Anyone who wants to be located installs the “Traccar Client” app.",
      "pinn. later shows the server address and device ID for each person under Family → ⚙︎ Location.",
      "On the go, the phone needs the VPN from the “Use on the go” step.",
      "GPS trackers with a SIM card (e.g. on a dog collar) send from the mobile network – this requires port forwarding in the router. pinn. shows the instructions when you add the tracker.",
    ],
    appTraccar: "“Traccar Client” app:",
    h_traccar: "Only fill in if you already created an account in Traccar yourself. Empty = pinn. creates one itself.",
    L_PINN_TRACCAR_EMAIL: "Traccar email", L_PINN_TRACCAR_PASSWORT: "Traccar password",
    test_traccar_ok: "Traccar is running ✓",
    test_traccar_aus: "Traccar cannot be reached – is the “traccar” container running?",

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
    i_ortung: "Facultatif. La localisation passe par le conteneur Traccar du NAS – pinn. le configure lui-même à la première utilisation. Rien à saisir ici.",
    l_ortung: [
      "Toute personne souhaitant être localisée installe l'app « Traccar Client ».",
      "pinn. affichera plus tard l'adresse du serveur et l'ID de l'appareil pour chaque personne sous Famille → ⚙︎ Localisation.",
      "En déplacement, le téléphone a besoin du VPN de l'étape « Utiliser en déplacement ».",
      "Les traceurs GPS avec carte SIM (p. ex. sur un collier de chien) émettent depuis le réseau mobile – il faut alors une redirection de port dans le routeur. pinn. affiche le guide lors de l'ajout du traceur.",
    ],
    appTraccar: "App « Traccar Client » :",
    h_traccar: "À remplir uniquement si vous avez déjà créé vous-même un compte dans Traccar. Vide = pinn. en crée un.",
    L_PINN_TRACCAR_EMAIL: "E-mail Traccar", L_PINN_TRACCAR_PASSWORT: "Mot de passe Traccar",
    test_traccar_ok: "Traccar fonctionne ✓",
    test_traccar_aus: "Traccar est injoignable – le conteneur « traccar » est-il démarré ?",

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
    i_ortung: "Opcional. La localización funciona con el contenedor Traccar del NAS – pinn. lo configura solo la primera vez que se usa. Aquí no hay que introducir nada.",
    l_ortung: [
      "Quien quiera ser localizado instala la app «Traccar Client».",
      "pinn. mostrará más adelante la dirección del servidor y el ID del dispositivo de cada persona en Familia → ⚙︎ Localización.",
      "Fuera de casa, el móvil necesita la VPN del paso «Usar fuera de casa».",
      "Los localizadores GPS con tarjeta SIM (p. ej. en el collar del perro) envían desde la red móvil – para eso hace falta abrir un puerto en el router. pinn. muestra la guía al añadir el localizador.",
    ],
    appTraccar: "App «Traccar Client»:",
    h_traccar: "Rellénalo solo si ya creaste tú mismo una cuenta en Traccar. Vacío = pinn. crea una.",
    L_PINN_TRACCAR_EMAIL: "Correo de Traccar", L_PINN_TRACCAR_PASSWORT: "Contraseña de Traccar",
    test_traccar_ok: "Traccar funciona ✓",
    test_traccar_aus: "No se puede acceder a Traccar – ¿está en marcha el contenedor «traccar»?",

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
    var order = { de: 0, en: 1, fr: 2, es: 3 };
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
    else h += testMsg('traccar', r);
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
      jobs.push(['traccar', t('S_ORTUNG')]);
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
