/* pinn. – Version log (js/versionslog.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the version log PINN_CHANGELOG (Settings → Updates, also used for the "What's new" notes in
   js/hinweise.js) and its display as a terminal (openChangelogTerminal, commands, boot animation).
   NEW VERSION: add the entry at the top of PINN_CHANGELOG in THIS file; APP_VERSION stays in index.html. */

/* ==========================================================
   Version log (changelog) – shown as a terminal
   ----------------------------------------------------------
   MAINTENANCE: with every new version add an entry at the top and raise APP_VERSION (in index.html).
   - Patch versions (e.g. 0.62.1, 0.62.2) are summarised in the entry of their version (0.62).
   - Bigger updates: short bullet points per new feature.
   - Only small things/bug fixes: one summarising bullet point (typ 'fix').
   - typ: 'neu' = new feature (+), 'info' = change (~), 'fix' = correction (*)
   - rueckblick: true = entries before the version log, summarised from the project history.
   ========================================================== */
const PINN_CHANGELOG = [
  {
    v: '1.81', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 37)',
    punkte: [
      ['info', 'Für Mitwirkende: die Kinderseite (Einstellungen, Tageszeiten, die Seite selbst mit Ton, Konfetti und Abhaken) liegt jetzt in pb_public/js/kinderseite.js, der Abschnitt „Kinderseite“ im Mitglied-Fenster und das Fenster „Aufgaben & Tageszeiten bearbeiten“ in js/kinderroutine.js. An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, zwei neue Dateien in js/ und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.80', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 36)',
    punkte: [
      ['info', 'Für Mitwirkende: Sterne und Belohnungen der Kinderseite (Sterne-Zähler, Belohnungs-Laden, Bestätigung durch die Eltern, Sterne unter Finanzen → Taschengeld und das Fenster „Belohnungen bearbeiten“) liegen jetzt in einer eigenen Datei (pb_public/js/sterne.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, js/sterne.js und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.79', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 35)',
    punkte: [
      ['info', 'Für Mitwirkende: die Kalender-Ansichten (Tag, Woche, Monat, Jahr, Essen per Ziehen und Umschalter) liegen jetzt in pb_public/js/kalenderansicht.js, das Fenster zum Planen einer Mahlzeit in js/essenplanen.js. An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, zwei neue Dateien in js/ und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.78', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 34)',
    punkte: [
      ['info', 'Für Mitwirkende: das Rezept-Fenster liegt jetzt in eigenen Dateien – pb_public/js/rezeptparser.js (Text-Auswerter), js/rezeptdialog.js (Fenster, Analyse, Auswahl, Speichern), js/rezeptbild.js (Bildausschnitt) und js/rezeptmengen.js (Zeiten, Mengen, Umrechnung, Überschriften). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, vier neue Dateien in js/ und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.77', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 33)',
    punkte: [
      ['info', 'Für Mitwirkende: der Einkauf liegt jetzt in drei eigenen Dateien – pb_public/js/einkauf.js (Zutaten zusammenrechnen, Kategorien, Läden, Stammladen, Sonderlisten), js/einkaufslisten.js (Übersicht, Zeilen, Fenster und Einstellungen → Einkauf) und js/einkaufseingabe.js (Eingabeleiste, Vorschläge, Mengen-Fenster, Tastatur, Kopieren und Teilen) –, die Rezeptliste mit Favoriten, öffentlichen Rezepten, Wochen-Slider und Rezept-Detailseite in js/rezepte.js. An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, vier neue Dateien in js/ und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.76', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 32)',
    punkte: [
      ['info', 'Für Mitwirkende: die Offline-Warteschlange für Aufgaben und Termine samt Zwischenspeicher liegt jetzt in pb_public/js/offline.js, die Extra-Erinnerung per Push und die Aufgaben mit eigener Eingabe in js/aufgabenextras.js, die Zahl am App-Symbol in js/appbadge.js und die Reisen im Kalender in js/reisen.js. An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, vier neue Dateien in js/ und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.75', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 31)',
    punkte: [
      ['info', 'Für Mitwirkende: das Laden der Aufgaben vom NAS (zwischengespeicherter Stand, Offline-Warteschlange, Zuweisung und Datumsanzeige) liegt jetzt in einer eigenen Datei (pb_public/js/aufgabendaten.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, js/aufgabendaten.js und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.74', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 30)',
    punkte: [
      ['info', 'Für Mitwirkende: die Haushalt-Seite – Räume, Reinigungen und Mülleimer mit ihren Fenstern sowie die Pflege der Haushaltsaufgaben (neu erzeugen, löschen, aufräumen, Animation) – liegt jetzt in einer eigenen Datei (pb_public/js/haushalt.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, js/haushalt.js und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.73', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 29)',
    punkte: [
      ['info', 'Für Mitwirkende: „Reihum verteilen“ bei Reinigungen und Mülleimern und die Karte „Wer macht wie viel?“ auf der Haushalt-Seite liegen jetzt in einer eigenen Datei (pb_public/js/reihum.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, js/reihum.js und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.72', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 28)',
    punkte: [
      ['info', 'Für Mitwirkende: die Aufgabenliste, das Abhaken (inklusive Feier-Animation, geplanter Einkauf und Smarthome-Aktion) und das Aufgaben-Fenster zum Anlegen und Bearbeiten liegen jetzt in einer eigenen Datei (pb_public/js/aufgaben.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, js/aufgaben.js und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.71', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 27)',
    punkte: [
      ['info', 'Für Mitwirkende: das Smarthome – Geräte mit Aktionen über Apple-Kurzbefehle oder Home Assistant, Start-Knöpfe an Aufgaben, Automatik, Einstellungen → Smarthome, Geräte-Editor und Saugroboter-Raumreinigung – liegt jetzt in einer eigenen Datei (pb_public/js/smarthome.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, js/smarthome.js und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.70', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 26)',
    punkte: [
      ['info', 'Für Mitwirkende: die Einstellungen zur Sprachsteuerung (persönlicher Link, erneuern, ausschalten, Testsatz) liegen jetzt in einer eigenen Datei (pb_public/js/sprachsteuerung.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, js/sprachsteuerung.js und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.69', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 25)',
    punkte: [
      ['info', 'Für Mitwirkende: das Formular zum Anlegen und Bearbeiten von Terminen – Beginn/Ende, ganztägig, Wiederholung, Zuweisung, Kalenderauswahl, Erinnerung und das Speichern (auch offline) – liegt jetzt in einer eigenen Datei (pb_public/js/termine.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, js/termine.js und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.68', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 24)',
    punkte: [
      ['info', 'Für Mitwirkende: Seitenmenü, Seitenwechsel, die Menüleiste am Handy mit ausziehbarem Fach, die Erkennung von Handy/Tablet und Hoch-/Querformat sowie das Wischen im Kalender liegen jetzt in einer eigenen Datei (pb_public/js/ansichten.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, js/ansichten.js und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.67', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 23)',
    punkte: [
      ['info', 'Für Mitwirkende: die Update-Erkennung – Hinweis „Es gibt eine neuere Version dieser App“, Anzeige der installierten Version und die GitHub-Links in den Einstellungen – liegt jetzt in einer eigenen Datei (pb_public/js/versionspruefung.js). Die Versionsnummer selbst (APP_VERSION) bleibt in der index.html, weil der Server sie dort ausliest. An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, js/versionspruefung.js und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.66', datum: '17.10.2026', titel: 'Vorabversionen zum Testen',
    punkte: [
      ['neu', 'Einstellungen → System → Sicherungen & Updates: neuer Bereich „🧪 Entwickler: Vorabversionen testen“. Normale Updates werden wie bisher nur für fertige Versionen angezeigt; hier kann man zusätzlich gezielt nach einer Vorabversion (Pre-Release auf GitHub) suchen und sie installieren – mit Hinweisen auf das Risiko, einer Bestätigung und wie bei jedem Update einer automatischen Sicherung vorher'],
      ['neu', 'Läuft eine Vorabversion, steht das oben bei den Updates – mit Link, um Fehler auf GitHub zu melden. Sobald die fertige Version erscheint, wird sie ganz normal als Update angeboten'],
      ['info', 'Für Mitwirkende: Sicherungen & Updates liegen jetzt in einer eigenen Datei (pb_public/js/sicherungen.js); Server: pinn-system.js und system.pb.js (Kommentare jetzt Englisch), pinn-wartung.sh nimmt jetzt auch Versionsnummern wie v1.67.0-beta.1 an'],
    ],
  },
  {
    v: '1.65', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 21)',
    punkte: [
      ['info', 'Für Mitwirkende: die Geräteverwaltung – angemeldete Geräte, Abmelden einzeln oder überall und „Sperre aufheben“ – liegt jetzt in einer eigenen Datei (pb_public/js/geraete.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, js/geraete.js und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.64', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 20)',
    punkte: [
      ['info', 'Für Mitwirkende: das Fehlerprotokoll für Admins, der Knopf „Auf Update prüfen“ und das Aufklappen der Einstellungen (immer nur ein Abschnitt offen) liegen jetzt in einer eigenen Datei (pb_public/js/fehlerprotokoll.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html, js/fehlerprotokoll.js und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.63', datum: '17.10.2026', titel: 'App-Code wird aufgeteilt (Teil 19)',
    punkte: [
      ['info', 'Für Mitwirkende: das Versions-Log – alle Einträge und die Anzeige als Terminal – liegt jetzt in einer eigenen Datei (pb_public/js/versionslog.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html und js/versionslog.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.62', datum: '16.10.2026', titel: 'Smarthome im Garten, Futterautomat & Urlaub im Kalender',
    punkte: [
      ['neu', 'Smarthome: neue Gerätearten Mähroboter, Bewässerung und Futterautomat (Home Assistant). Unter Zuhause → Garten lassen sich Rasen und Pflanzen mit einem Gerät verknüpfen: Start-Knopf (z. B. Extra-Mähzeit) und Automatik zur Uhrzeit – bei Regen wird nicht gegossen und nicht gemäht, die Bewässerung schaltet nach der eingestellten Dauer selbst ab'],
      ['neu', 'Haustiere: Futterautomat mit Auffüll-Erinnerung – nach Tagen oder über einen Füllstand-Sensor aus Home Assistant (Push, sobald er fast leer ist)'],
      ['neu', 'Kalender: Urlaube aus den Packlisten (Ziel und Zeitraum) stehen jetzt im Kalender. Antippen öffnet die Packliste, langes Drücken zeigt Packliste und Urlaubswetter'],
      ['neu', 'Packliste anbieten: Steht ein Urlaub, eine Dienstreise o. Ä. im Kalender (auch vacation, vacances, viaje …), kommt 14 Tage vorher eine Push mit Hinweis in der Glocke – ein Tipp legt die Packliste mit Termin und Zeitraum an'],
      ['fix', 'Saugroboter: Eingereihte Aufträge gingen verloren, wenn die Station noch wusch, absaugte oder trocknete. Jetzt startet der nächste Auftrag direkt im Anschluss – noch auf dem Rückweg, ohne Umweg über die Station – und wird wiederholt, falls der Roboter ihn nicht annimmt'],
      ['fix', 'Handy: Zahlen in „Neues Zuhause“ (Grunderwerbsteuer, Notar & Grundbuch, Makler) und in den Kosten der Verträge passen jetzt in ihre Felder, ohne verschobene Texte oder Umbrüche mitten in der Zahl'],
    ],
  },
  {
    v: '1.61', datum: '16.10.2026', titel: 'Mehr Platz in der Übersicht',
    punkte: [
      ['info', 'iPad und Computer: Das Wetter steht jetzt oben rechts neben Datum und Uhrzeit – das aktuelle Wetter mit UV-Wert, dazu heute, morgen und übermorgen. Ein Tipp darauf öffnet wie bisher die Wetter-Ansicht. So haben Kalender, Essen und Aufgaben in der Übersicht mehr Platz'],
      ['info', 'iPad und Computer: Die geplanten Mahlzeiten in der Übersicht sind etwas kleiner, das Bild etwa so groß wie ein Tag beim Wetter'],
      ['neu', 'Essen: neue Mahlzeit Frühstück. Im Kalender steht statt „Mittag“ oder „Abend“ nur noch ein Symbol vor dem Essen (🌅 Frühstück, ☀️ Mittag, 🌙 Abend) – das spart Platz'],
      ['info', 'Aufgaben: Der Zähler zeigt jetzt erledigte und alle angezeigten Aufgaben, z. B. 3/8. Am iPad und Computer steht er klein direkt neben der Überschrift'],
      ['fix', 'Kalender: „+ Essen hinzufügen“ heißt jetzt kurz „+ Essen“, und „Ganztägig“ ragt nicht mehr in die Termine'],
      ['fix', '1.61.2: Sprachsteuerung – der Kurzbefehl meldete immer „Fehler 400: Something went wrong while processing your request“. Behoben: Siri bzw. „HTTP Shortcuts“ bekommen jetzt wieder die Antwort zum Vorlesen (Server: sprache.pb.js)'],
    ],
  },
  {
    v: '1.60', datum: '15.10.2026', titel: 'App-Code wird aufgeteilt (Teil 18)',
    punkte: [
      ['info', 'Für Mitwirkende: die Einstellungen – Wohnform (Familie oder WG), Familienmitglieder, Kategorien auf den Seiten, Standardansicht, Farben, Dunkelmodus und Zurücksetzen – liegen jetzt in einer eigenen Datei (pb_public/js/einstellungen.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html und js/einstellungen.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.59', datum: '15.10.2026', titel: 'App-Code wird aufgeteilt (Teil 17)',
    punkte: [
      ['info', 'Für Mitwirkende: Einstellungen → Zuhause, Müllkalender, Google- und Apple-Kalender-Konto sowie „Kalender hinzufügen“ liegen jetzt in einer eigenen Datei (pb_public/js/kalenderkonto.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html und js/kalenderkonto.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.58', datum: '15.10.2026', titel: 'App-Code wird aufgeteilt (Teil 16)',
    punkte: [
      ['info', 'Für Mitwirkende: Finanzen – Ausgaben & Einnahmen, Haushaltsbudget, Kategorien, regelmäßige Buchungen und das Popup für Ausgaben – liegt jetzt in einer eigenen Datei (pb_public/js/finanzen.js). An der Bedienung ändert sich nichts'],
      ['info', 'Nur App-Dateien geändert (index.html und js/finanzen.js) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.57', datum: '15.10.2026', titel: 'Aufgaben: Erinnerungen & direkte Eingabe',
    punkte: [
      ['neu', 'Extra-Erinnerung per Push: beim Anlegen oder Bearbeiten einer Aufgabe und bei allen Regeln, die Aufgaben automatisch anlegen (Reinigung, Mülleimer, Wartung, Gartenjahr, Fahrzeuge), gibt es einen Haken mit Uhrzeit – am Fälligkeitstag kommt dann eine Push an die Zuständigen'],
      ['neu', '„Zählerstände ablesen“: Antippen der Aufgabe öffnet direkt das Eintragen, bei mehreren Zählern einer nach dem anderen. Sind alle Stände eingetragen, hakt sich die Aufgabe selbst ab – auch wenn sie unter Zuhause eingetragen werden'],
      ['neu', 'Fahrzeug-Aufgaben (HU, Inspektion, Reifenwechsel, Versicherungskennzeichen, Fristen) öffnen beim Antippen direkt das passende Eintragen und haken sich nach dem Speichern selbst ab'],
      ['fix', 'Zuhause: Überfällige Wartungen in der Übersicht führen jetzt zur Eingabe bzw. zur Aufgabe mit „✓ Erledigt“ statt zum Wartungsplan; im Wartungsplan gibt es dafür einen eigenen Knopf'],
      ['fix', 'Zwei gleich benannte Wartungen (z. B. im Gartenjahr) teilten sich ihre Aufgabe – beim Bearbeiten ging dadurch u. a. die Fälligkeit durcheinander. Gleiche Namen bekommen jetzt automatisch eine Nummer, z. B. „Rasen düngen (2)“; vorhandene Doppelte werden einmalig repariert'],
      ['info', 'App- und Server-Dateien geändert – das neue Feld für die Erinnerung legt der Server beim Start selbst an'],
    ],
  },
  {
    v: '1.56', datum: '15.10.2026', titel: 'Neue Grafiken & Profilbild zuschneiden',
    punkte: [
      ['neu', 'Profilbild zuschneiden: direkt nach der Fotoauswahl öffnet sich ein Kreis mit dem Ausschnitt (außen herum weiß-durchsichtig) – verschieben, mit Regler oder zwei Fingern zoomen und übernehmen. Gilt für Familienmitglieder und Haustiere; gespeichert wird genau dieser Kreis, darum sieht das Bild überall gleich aus'],
      ['neu', 'Fahrzeuge: im Kopf der Fahrzeugseite fährt jetzt eine Straßenszene vorbei – Hügel in der Fahrzeugfarbe, Bäume und Laternen, Gegenverkehr und Überholer, tagsüber mit Sonne und Wolken, nachts mit Mond, Sternen und leuchtenden Laternen. Bei Fahrrad, E-Bike und E-Scooter sind auch Räder unterwegs'],
      ['fix', 'Familienmitglieder: der Fortschrittsring der Kinder und das Leuchten bei SOS und Geburtstag werden oben nicht mehr abgeschnitten'],
      ['fix', 'Konto: das Profilbild in der Kopfkarte zeigt jetzt denselben Ausschnitt wie überall sonst'],
      ['fix', 'App-Symbol: neu erstellt – im Browser-Tab und auf dem Home-Bildschirm füllt das Logo jetzt das ganze Symbol aus, ohne weißen Rand oder weiße Ecken. Auf iPhone und iPad erscheint es nach dem erneuten Hinzufügen zum Home-Bildschirm'],
      ['info', 'Nur App-Dateien geändert (index.html, js/fahrzeuge.js, js/familie.js, Symbole und Sprachdateien en/fr/es) – am Server ändert sich nichts'],
    ],
  },
  {
    v: '1.55', datum: '13.10.2026', titel: 'App-Code wird aufgeteilt (Teil 15)',
    punkte: [
      ['info', 'Für Mitwirkende: Kassen – Haushaltskasse, eigene Kasse, gemeinsame Kassen, Aufteilen & „Wer schuldet wem“, Ausgleich, Einkauf in eine Kasse buchen und der Umschalter in Finanzen und Fahrzeuge – liegt jetzt in einer eigenen Datei (pb_public/js/kassen.js). An der Bedienung ändert sich nichts'],
      ['fix', '1.55.1: Mitteilungen kommen jetzt zuverlässig in der eingestellten Sprache an – pinn. trägt die Sprache dieses Geräts im Profil nach, falls dort noch keine steht. Dadurch werden auch „Morgen ist Müllabfuhr“, Tagesübersicht, Wochenvorschau, Geburtstage und Co. in Push und Glocke übersetzt; bereits gespeicherte Müll-Hinweise in der Glocke werden ebenfalls übersetzt'],
      ['fix', '1.55.1: „Morgen ist Müllabfuhr“ öffnet die Aufgabe – im Bearbeiten-Fenster gibt es jetzt den Knopf „✓ Erledigt“ zum direkten Abhaken'],
      ['fix', '1.55.1: Haushalt – „Reinigung“ und „Aufräumen“ sind nicht mehr fest vorgegeben. Neue Familien legen ihre Kategorien beim ersten Anlegen einer Reinigung selbst an (Namen eintippen und speichern genügt). Bestehende Kategorien bleiben erhalten, nur ungenutzte Standard-Kategorien verschwinden von selbst'],
      ['info', 'Nur App-Dateien geändert (index.html und Sprachdateien en/fr/es) – am Server ändert sich nichts'],
      ['fix', '1.55.2: Geänderte Sprachdateien kommen nach einem Update jetzt sofort auf allen Geräten an – vorher nutzten Geräte noch die alte, zwischengespeicherte Datei, dadurch fehlten z. B. die Übersetzungen der Müll-Hinweise in der Glocke'],
    ],
  },
  {
    v: '1.54', datum: '12.10.2026', titel: 'App-Code wird aufgeteilt (Teil 14)',
    punkte: [
      ['info', 'Für Mitwirkende: Vorrat – Artikel mit Bestand, Einheiten (Einzahl/Mehrzahl), Filter und Suche, Abgleich mit den Einkaufslisten sowie die Fenster für Artikel, Lagerorte und Kategorien – liegt jetzt in einer eigenen Datei (pb_public/js/vorrat.js). An der Bedienung ändert sich nichts'],
    ],
  },
  {
    v: '1.53', datum: '12.10.2026', titel: 'App-Code wird aufgeteilt (Teil 13)',
    punkte: [
      ['info', 'Für Mitwirkende: Vorrat 2.0 – Mindesthaltbarkeit, Barcode-Scanner, „Was kann ich kochen?“, Einkauf planen und Einkauf erledigt, das Fenster „Finanzen einrichten“ und der CSV-Export – liegt jetzt in einer eigenen Datei (pb_public/js/vorrat2.js). An der Bedienung ändert sich nichts'],
    ],
  },
  {
    v: '1.52', datum: '12.10.2026', titel: 'App-Code wird aufgeteilt (Teil 12)',
    punkte: [
      ['info', 'Für Mitwirkende: Sparen und Taschengeld – Depots, Sparziele und ETFs mit Kursen, Import von Depot-Umsätzen aus CSV und PDF sowie Taschengeld und Guthaben der Kinder samt aller Fenster – liegen jetzt in einer eigenen Datei (pb_public/js/sparen.js). An der Bedienung ändert sich nichts'],
    ],
  },
  {
    v: '1.51', datum: '12.10.2026', titel: 'App-Code wird aufgeteilt (Teil 11)',
    punkte: [
      ['info', 'Für Mitwirkende: Die Verträge – Liste, Kündigungsfristen, Kündigen, Kategorien, automatische Verknüpfung mit Haus und Fahrzeugen, Dokumente und Belege sowie die Verdrahtung der Finanzen-Seite – liegen jetzt in einer eigenen Datei (pb_public/js/vertraege.js). An der Bedienung ändert sich nichts'],
    ],
  },
  {
    v: '1.50', datum: '12.10.2026', titel: 'App-Code wird aufgeteilt (Teil 10)',
    punkte: [
      ['info', 'Für Mitwirkende: Die Fahrzeuge – Autos, Motorräder, Wohnmobile, Anhänger, E-Scooter, E-Bikes und Fahrräder mit Liste, Bilanz, Rechnern, Verlauf, Hinweisen und automatischen Aufgaben sowie der Verknüpfung mit Dokumenten – liegen jetzt in einer eigenen Datei (pb_public/js/fahrzeuge.js). An der Bedienung ändert sich nichts'],
    ],
  },
  {
    v: '1.49', datum: '11.10.2026', titel: 'App-Code wird aufgeteilt (Teil 9)',
    punkte: [
      ['info', 'Für Mitwirkende: Das Haus – Mieten, Eigentum und Vermietung mit Übersicht, Mängeln, Kosten und Sanierung, Zählern mit Prognose, Wartungsplan sowie Garten und Pflanzen – liegt jetzt in einer eigenen Datei (pb_public/js/zuhause.js). An der Bedienung ändert sich nichts'],
    ],
  },
  {
    v: '1.48', datum: '11.10.2026', titel: 'App-Code wird aufgeteilt (Teil 8)',
    punkte: [
      ['info', 'Für Mitwirkende: Die Dokumente – Liste, Ausgang für offline gespeicherte Dokumente, Fristen, Datei- und Bildbetrachter, Anlegen und Bearbeiten, Kategorien und Sichtbarkeit – liegen jetzt in einer eigenen Datei (pb_public/js/dokumente.js). An der Bedienung ändert sich nichts'],
    ],
  },
  {
    v: '1.47', datum: '11.10.2026', titel: 'App-Code wird aufgeteilt (Teil 7)',
    punkte: [
      ['info', 'Für Mitwirkende: Das Auslesen von PDFs und Fotos – Rechnungen und Belege für Dokumente und Ausgaben, Rezepte aus PDF, Foto (Texterkennung) und mit KI – liegt jetzt in einer eigenen Datei (pb_public/js/pdflesen.js). An der Bedienung ändert sich nichts'],
    ],
  },
  {
    v: '1.46', datum: '11.10.2026', titel: 'App-Code wird aufgeteilt (Teil 6)',
    punkte: [
      ['info', 'Für Mitwirkende: Der App-Start (bootApp) – Anmeldung prüfen, Familiendaten laden, erste Ansicht öffnen und die Hintergrund-Abfragen starten – liegt jetzt in einer eigenen Datei (pb_public/js/appstart.js). An der Bedienung ändert sich nichts'],
      ['info', 'GitHub: Die Projektseite zeigt jetzt auch Screenshots vom Handy (Übersicht, Kalender, Essen, Listen, Finanzen, Kinder)'],
    ],
  },
  {
    v: '1.45', datum: '11.10.2026', titel: 'App-Code wird aufgeteilt (Teil 5)',
    punkte: [
      ['info', 'Für Mitwirkende: Die Pinnwand – Zettel, Listen, Fotos, Umfragen, Danke-Zettel, Countdowns, Archiv und das Verschieben der Zettel – liegt jetzt in einer eigenen Datei (pb_public/js/pinnwand.js). An der Bedienung ändert sich nichts'],
    ],
  },
  {
    v: '1.44', datum: '11.10.2026', titel: 'App-Code wird aufgeteilt (Teil 4b)',
    punkte: [
      ['info', 'Für Mitwirkende: Die Kindersicherung sichert die sechs Bearbeiten-Fenster (Aufgabe anlegen und bearbeiten, Termin, Essen, Pinnwand, Kinder-Routine) jetzt erst ab, wenn alle App-Dateien geladen sind. So bleibt sie auch dann lückenlos, wenn eines dieser Fenster später in eine eigene Datei unter pb_public/js wandert. An der Bedienung ändert sich nichts'],
    ],
  },
  {
    v: '1.43', datum: '11.10.2026', titel: 'App-Code wird aufgeteilt (Teil 4)',
    punkte: [
      ['info', 'Für Mitwirkende: Die Listen – Packen, Geschenke, Wünsche, Checklisten und Ideen – sowie die globale Suche liegen jetzt in einer eigenen Datei (pb_public/js/listen.js). An der Bedienung ändert sich nichts'],
    ],
  },
  {
    v: '1.42', datum: '11.10.2026', titel: 'App-Code wird aufgeteilt (Teil 3)',
    punkte: [
      ['info', 'Für Mitwirkende: Der Bereich Familie – Notfallpässe, Ortung mit Karte, SOS, Schule & Kita, Haustiere sowie die Wetter-Ansicht mit Urlaubswetter – liegt jetzt in einer eigenen Datei (pb_public/js/familie.js). An der Bedienung ändert sich nichts'],
      ['info', 'GitHub: Die Projektseite gibt es jetzt auf Englisch, Deutsch, Spanisch und Französisch, mit Screenshots von Dashboard und iPad-Übersicht'],
    ],
  },
  {
    v: '1.41', datum: '11.10.2026', titel: 'App-Code wird aufgeteilt (Teil 2)',
    punkte: [
      ['info', 'Für Mitwirkende: Glocke, Heimweg, Einkaufs-Hinweis („Gehst du einkaufen?“) und die Läden mit Adresse liegen jetzt in einer eigenen Datei (pb_public/js/hinweise.js). An der Bedienung ändert sich nichts'],
    ],
  },
  {
    v: '1.40', datum: '10.10.2026', titel: 'App-Code wird aufgeteilt (Teil 1)',
    punkte: [
      ['info', 'Für Mitwirkende: Der Programmcode der App wird Schritt für Schritt aus der großen index.html in einzelne Dateien unter pb_public/js aufgeteilt – ohne Build-Schritt, an der Bedienung ändert sich nichts. Den Anfang macht der Ausblick (Wochenvorschau & Monatsausblick)'],
      ['info', 'Offline-Start: Der Service Worker (sw.pb.js) hält die neuen App-Dateien auf dem Gerät vor. Fehlt eine davon auf dem NAS, zeigt die Startprüfung einen klaren Hinweis statt einer leeren Seite'],
    ],
  },
  {
    v: '1.39', datum: '10.10.2026', titel: 'Neue Projektstruktur für Mitwirkende',
    punkte: [
      ['info', 'Aufgeräumtes Projekt auf GitHub: Die Dateien liegen dort jetzt genau so, wie sie auf dem NAS installiert werden (pb_hooks, pb_public, caddy). So finden sich Mitwirkende sofort zurecht – an der App selbst ändert sich nichts'],
      ['info', 'Installation & Update: pinn-setup.sh übernimmt die Ordner aus dem Release eins zu eins, ersetzte Dateien landen wie gewohnt in _alt. Der Update-Knopf erkennt das neue Paket (pinn-wartung.sh), einzelne lose Dateien werden weiterhin einsortiert'],
    ],
  },
  {
    v: '1.38', datum: '10.10.2026', titel: 'Zuhause, Vermietung, Garten & Sprachsteuerung',
    punkte: [
      ['neu', 'Aus „Haus“ wird „Zuhause“ – mit eigener bewegter Szene statt Straße: Haus mit Garten, Zaun und Vögeln, Stadt mit Bahn, Taxi, Auto, Fahrrad und Flugzeug für Wohnungen, Garage mit Einfahrt. Nach Sonnenuntergang Nacht mit Mond, Sternen und Licht in den Fenstern'],
      ['neu', 'Vermietung: neben Miete und Eigentum jetzt auch „Vermietet“ – Mieter mit Kontakt, Kaltmiete, Nebenkosten und Stellplatz als regelmäßige Einnahme in Finanzen, Kaution, Mietart, Kauf & Kredit. Kacheln für Mieteinnahmen, Überschuss und Brutto-Rendite, Hinweise zu Nebenkostenabrechnung und möglicher Mieterhöhung, Mieteinnahmen im Reiter Kosten'],
      ['neu', 'Neue Arten: Garage / Stellplatz und Mehrfamilienhaus'],
      ['neu', 'Bausteine je Zuhause: Mängel, Kosten, Zähler, Wartung, Garten & Pflanzen und Schlüssel einzeln hinzufügen oder entfernen – die Reiter passen sich an'],
      ['neu', 'Garten & Pflanzen: Zimmer-, Balkon- und Gartenpflanzen mit Gieß- und Düngeplan, Rasen mähen in der Saison, „💧 Gegossen“ mit einem Tipp. Regen zählt draußen als gegossen, bei Hitze kommt das Gießen öfter, Frost-Warnung für Kübel. Gartenjahr (Obstbäume, Hecke, Laub, Winterquartier …) als Aufgaben und ein Gartenkalender: was jetzt gesät, gepflanzt und geerntet wird'],
      ['neu', 'Schlüssel: welche Schlüssel es gibt, wie viele und wer sie hat'],
      ['neu', 'Sprachsteuerung (Einstellungen → Sprachsteuerung): „Hey Siri, pinn“ – Sachen auf die Einkaufsliste setzen, die Liste vorlesen lassen, Aufgaben anlegen und fragen, was heute oder morgen ansteht. Mit Anleitung für den Kurzbefehl und für Android, in allen vier Sprachen'],
      ['info', 'Einkaufsliste & Vorrat: Einheiten automatisch in Einzahl oder Mehrzahl (1 Dose · 2 Dosen, Packung/Packungen, Glas/Gläser – auch „Dose(n)“ wird verstanden). Am Handy zeigt die Einkaufsliste bei Vorrats-Artikeln nur die Zahl, Gewicht und Menge (g, kg, ml, l …) bleiben stehen'],
      ['fix', 'Das Symbol im Kopf (z. B. der Schlüssel) verdeckte bei Zuhause und Fahrzeugen die erste Kachel – sitzt jetzt am Farbband'],
      ['info', 'Server: neu sprache.pb.js und pinn-sprache.js, angepasst pinn-zuhause.js (Regenmenge der letzten zwei Tage); Sprachdateien en/fr/es ergänzt'],
      ['fix', '1.38.1: Mehr Sicherheit bei der Installation – die Bibliotheken für PDF-Import und Foto-Texterkennung werden nur noch in fest eingetragenen Versionen geladen (pdf.js 4.10.38, Tesseract 5.1.1) statt „neueste 4.x/5.x“. Ihre Prüfsummen werden auf dem NAS festgehalten und bei jedem Update geprüft; verändert sich eine Datei unbemerkt, warnt das Setup (pinn-setup.sh)'],
    ],
  },
  {
    v: '1.37', datum: '10.10.2026', titel: 'Haustiere, 14-Tage-Wetter & Urlaubswetter',
    punkte: [
      ['neu', 'Familie → Haustiere: eigener Reiter für Hund, Katze, Kaninchen & Co. – Steckbrief mit Foto, Rasse, Alter, Chip- und Heimtierausweis-Nummer, Tierarzt und Tiernotdienst zum Anrufen'],
      ['neu', 'Heute: Fütterungszeiten zum Abhaken (wer hat wann gefüttert), Gassi-Runden mit Dauer und wer unterwegs war, Medikamente „gegeben“, Dienstplan „Wer ist dran?“ für jeden Wochentag – mit „Reihum verteilen“'],
      ['neu', 'Gesundheit & Vorsorge: Impfungen, Wurmkur, Floh- & Zeckenschutz, Krallen, Zähne, Stall/Aquarium – mit Vorschlägen je Tierart, Fälligkeit und „✓ Erledigt“. Push-Erinnerung 3 Tage vorher, am Tag selbst und wöchentlich, solange überfällig; Geburtstag des Tiers mit Push'],
      ['neu', 'Gewichtsverlauf als Diagramm, Futter mit Verknüpfung zum Vorrat und „Auf die Einkaufsliste“, GPS-Tracker aus der Ortung, Gassi-Wochenstatistik mit 🏆, Tagebuch der letzten Tage'],
      ['neu', 'Für den Tiersitter: Steckbrief mit Futter, Gassi, Medikamenten, Eigenheiten und Telefonnummern zum Kopieren oder Teilen · Vermisst-Plakat zum Drucken · Packliste „Urlaub mit Haustier“ · Regenbogenbrücke 🌈 für verstorbene Tiere'],
      ['neu', 'Haustiere auch in der Kachel „Familienmitglieder“, im Reiter „Notfall“, in der Suche und in der Wochenvorschau (fällige Vorsorge, Geburtstage). Tiere, die bisher als Familienmitglied angelegt waren, lassen sich mit einem Tipp übernehmen'],
      ['neu', 'Wetter-Kachel antippen: 14 Tage Vorschau (ab Tag 8 als Tendenz markiert). Jeder Tag mit Details – gefühlte Temperatur, Wind & Böen mit Richtung, UV-Index, Sonnenstunden, Regenmenge, Sonnenauf- und -untergang, Stundenverlauf und Tipps, was man anzieht'],
      ['neu', 'Urlaubswetter: Packlisten bekommen Reiseziel (Vorschläge beim Tippen) und Zeitraum – die Tageszahl rechnet sich daraus. Die Packliste zeigt das Wetter am Urlaubsort, die Wetter-Kachel die anstehende Reise, die Wetter-Ansicht einen eigenen Reiter je Urlaub mit Wassertemperatur am Meer'],
      ['neu', 'Mehr als 16 Tage vorher: Erfahrungswerte (Ø derselben Tage der letzten drei Jahre), danach automatisch die echte Vorhersage. Pack-Tipps passend zum Wetter (Regenjacke, Sonnencreme, Badesachen …) mit einem Tipp auf die Liste'],
      ['neu', 'Wochenvorschau: steht in der Woche ein Urlaub an, kommt das Wetter am Urlaubsort zusammengefasst dazu – Ø Temperaturen, Regentage, Sonne, Wasser und jeder Tag als Symbol'],
      ['info', 'Server: neu haustiere.pb.js und pinn-haustiere.js, angepasst zuhause.pb.js und pinn-zuhause.js (16-Tage-Vorhersage, Stundenverlauf, Urlaubswetter, Erfahrungswerte); Sprachdateien en/fr/es ergänzt'],
    ],
  },
  {
    v: '1.36', datum: '10.10.2026', titel: 'Standort teilen direkt in pinn.',
    punkte: [
      ['neu', 'Familie → Ortung → „Mein Standort“: alles in pinn. steuern – Schalter „Dauerhaft senden“ (Dauer wählbar: 30 Min. bis 24 Std., bis ich zu Hause bin, bis ich es beende; endet von selbst), „Einmalig senden“ (genau dieser Standort, 1 Stunde sichtbar) und ein SOS-Knopf mit 3-Sekunden-Countdown'],
      ['neu', 'Geht ohne weitere App und ohne Einrichtung durch einen Admin. Push an die Familie wählbar, bei SOS immer'],
      ['neu', 'Live, solange pinn. offen ist: Bei „Dauerhaft senden“ und beim Heimweg schickt pinn. bei Bewegung neue Standorte (ab 50 m, höchstens etwa jede Minute) – im Stehen nichts. pinn. fragt nie von selbst nach dem Standort und sendet nichts zusätzlich, wenn „Traccar Client“ schon liefert'],
      ['info', '„Traccar Client“ nur noch einmal einrichten (Genauigkeit Mittel, Distanz 50 m, Dienst immer an) – sendet direkt an pinn., gesteuert wird in pinn. Ist „Dauerhaft senden“ aus, sieht niemand den Standort und pinn. zeichnet keinen Weg auf'],
      ['info', 'Kein Traccar-Container mehr für Handys: pinn. speichert Standorte und Spur (48 Std.) selbst. Der Container „traccar“ ist nur noch für GPS-Tracker mit SIM-Karte nötig und startet nicht mehr automatisch (COMPOSE_PROFILES=tracker in der .env)'],
      ['info', 'Server: angepasst pinn-ortung.js und ortung.pb.js (neue Routen /standort, /standort-teilen, /standort-einmal), docker-compose.yaml; Einrichtungs-Assistent ohne Traccar-Prüfung'],
    ],
  },
  {
    v: '1.35', datum: '09.10.2026', titel: 'Wo bist du? & mehr in der Familienkachel',
    punkte: [
      ['neu', '„Wo bist du?“ in den Schnellaktionen einer Person (wenn sie gerade keinen Live-Standort teilt): Sie bekommt eine Push-Nachricht und antwortet mit einem Tipp – einmalig mit ihrem Standort oder kurz („Bin zu Hause“, „Bin gleich da“, „Ruf mich an“ …). Die Antwort kommt als Push zurück und zeigt Karte und Adresse. Offene Fragen erscheinen auch beim nächsten Öffnen von pinn.'],
      ['neu', 'Kinder: Sternestand direkt am Bild (⭐ 12), in den Schnellaktionen dazu die Sterne von heute und wartende Wünsche zum Freigeben'],
      ['neu', 'Schule & Kita in der Kachel: 📚 mit der Zahl offener Hausaufgaben (rot, wenn bis morgen fällig), ✉️ bei Elternbriefen mit Frist in den nächsten zwei Tagen. In den Schnellaktionen Hausaufgaben direkt abhaken und Elternbriefe öffnen'],
      ['neu', 'Heimweg „gleich zu Hause“: Ist jemand höchstens 600 m bzw. etwa 5 Minuten entfernt, leuchtet sein Bild grün mit 🏠 „gleich da“ und pinn. zeigt einmal einen kurzen Hinweis'],
      ['info', 'Server: neu wobistdu.pb.js und pinn-wobistdu.js; Sprachdateien en/fr/es ergänzt'],
    ],
  },
  {
    v: '1.34', datum: '09.10.2026', titel: 'Familienmitglieder zum Antippen & Geburtstage',
    punkte: [
      ['neu', 'Kachel „Familienmitglieder“ zeigt live, was los ist: roter blinkender Punkt bei Live-Standort (verschwindet von selbst, wenn der Standort weg ist), Symbol des Orts (🏠, 🏫 …), 🎂 und goldener Ring am Geburtstag, 🎁 eine Woche vorher, 🚶 mit Entfernung beim Heimweg, roter Ring bei SOS, 🪫 bei fast leerem Akku und bei Kindern ein Fortschrittsring der Kinder-Aufgaben'],
      ['neu', 'Tipp auf eine Person öffnet Schnellaktionen: Status und Standort, Termine und Aufgaben von heute, Anrufen, Nachricht, Karte, Heimweg, Aufgabe geben, Zettel oder Danke an die Pinnwand, Profil und Notfallpass. Am eigenen Bild: Standort teilen und „Ich bin unterwegs“. Kinder: Tipp = Kinderseite, gedrückt halten = Schnellaktionen'],
      ['neu', 'Geburtstag: Das Geburtstagskind bekommt beim ersten Öffnen am Tag eine Happy-Birthday-Animation (auf allen Geräten nur einmal, Kinder auch auf ihrer Kinderseite). Alle anderen bekommen morgens zur Tagesübersicht eine Push-Nachricht – mit „Gratulieren“ als Zettel an die Pinnwand'],
      ['info', 'Server: neu familie-geburtstag.pb.js und pinn-familie-geburtstag.js (Geburtsdatum aus dem Notfallpass); Sprachdateien en/fr/es ergänzt'],
    ],
  },
  {
    v: '1.33', datum: '09.10.2026', titel: 'Einkaufen in der Nähe',
    punkte: [
      ['neu', 'Im Laden angekommen: Steht auf der Liste des Ladens etwas, kommt die Push-Nachricht „Du bist bei … – gehst du einkaufen?“ mit Link zur Liste – auch ohne geplanten Einkauf. Mehrere Läden in der Nähe kommen in einer gemeinsamen Nachricht'],
      ['neu', 'Einkaufs-Hinweis oben (wie beim Heimweg), solange du im Umkreis eines Ladens bist: Antippen öffnet die Liste. Bei zwei Läden teilt sich der Hinweis und zeigt beide, ab drei geht es zur Seite „Listen“. Wer früher am Tag dort war, sieht nichts mehr; × blendet ihn für diesen Besuch aus'],
      ['info', 'Kalender: Ferien, Müllabfuhr und Schule & Kita stehen an jedem Tag ganz oben – in Tag, Woche, Monat und Liste'],
      ['fix', 'Familie → Ortung: Karte verschieben oder zoomen beendet Verfolgen und Spur nicht mehr und springt nicht zur Person zurück – der Knopf ◎ holt sie wieder in die Mitte'],
      ['info', 'Server: angepasst pinn-ortung.js (offene Artikel je Liste, Push in der Sprache des Profils, Läden in der Nähe für den Hinweis)'],
    ],
  },
  {
    v: '1.32', datum: '09.10.2026', titel: 'Wochenvorschau & Monatsausblick',
    punkte: [
      ['neu', 'Wochenvorschau: jeden Sonntag ab 18 Uhr kommt für jedes Profil einmal ein Hinweis oben und eine Push-Nachricht. Antippen öffnet eine Seite mit allem Wichtigen der Familie für die kommende Woche – Tag für Tag Termine, Aufgaben, Haushalt (auch wer dran ist), Müllabfuhr, Essen, Geburtstage, Feiertage, Schule & Kita und Abbuchungen, dazu Wetter, Ferien, Kündigungsfristen, ablaufender Vorrat und Überfälliges'],
      ['neu', 'Kurzer Rückblick auf die letzte Woche: Termine, gekochte Essen, Ausgaben und erledigte Haushaltsaufgaben (mit den Fleißigsten)'],
      ['neu', 'Monatsausblick Finanzen am letzten Tag des Monats ab 18 Uhr – je Kasse kurz, wie der Monat gelaufen ist (Einnahmen, Ausgaben, Saldo, Budget, größte Posten), und ausführlich der nächste: geplante Einnahmen, feste Ausgaben, Sparraten, was frei bleibt, Vergleich zum Vormonat, seltene Posten wie Kfz-Steuer und Kündigungsfristen. Nicht für Gäste und Kinder mit Kindersicherung'],
      ['neu', 'Einstellungen → Ausblick: beide Seiten jederzeit wieder öffnen, Push je Profil an- und ausschalten. Angesehen bzw. weggeklickt ist der Hinweis auf allen Geräten weg'],
      ['info', 'Server: neu ausblick.pb.js und pinn-ausblick.js (Push in der Sprache des Profils, Merker in pb_data/pinn_ausblick.json); Sprachdateien en/fr/es ergänzt'],
    ],
  },
  {
    v: '1.31', datum: '09.10.2026', titel: 'Müllabfuhr, geplante Ausgaben & Fixkosten',
    punkte: [
      ['neu', 'Müllkalender und Mülleimer sind verknüpft: Steht morgen eine Abholung im Müllkalender, gibt es heute die Aufgabe „… rausbringen“ für den passenden Mülleimer. Nach der Abholung (Abholtag ab 12 Uhr) wird sie automatisch abgehakt und wandert nach unten'],
      ['neu', 'Erinnerung am Vortag der Müllabfuhr mit eigener Uhrzeit (Einstellungen → Benachrichtigungen): welche Tonnen und wer dran ist – Kinder bekommen sie nur, wenn sie selbst dran sind'],
      ['neu', 'Finanzen: regelmäßige Buchungen ohne Ende werden mindestens zwei Jahre im Voraus als „geplant“ angezeigt – in künftigen Monaten und Jahren und als „noch geplant“ im laufenden Zeitraum. Sie zählen nicht als ausgegeben'],
      ['neu', 'Verträge: Miete, Nebenkosten und Heizkosten aus „Haus“ hängen an einem Mietvertrag (Wohnen), Kredit, Gebäudeversicherung und Hausgeld an eigenen Verträgen. Kfz-Steuer, Grundsteuer, Rundfunkbeitrag & Co. landen in der neuen Kategorie „Steuern & Abgaben“ als laufende Fixkosten – ohne Kündigen'],
      ['neu', 'Übersicht-Kachel „Familienmitglieder“: alle Avatare nebeneinander, ein Tipp aufs Kind öffnet die Kinderseite (statt übers Bild in der Familienleiste)'],
      ['fix', 'Barcode-Scanner: nur der Rand um den Rahmen ist abgedunkelt, Piepton beim Treffer, der Bildschirm bleibt beim Scannen an · Einstellungen: es bleibt immer nur ein Abschnitt aufgeklappt · Kinderseite ohne Sonnenauf- und -untergang'],
      ['info', 'Server: angepasst pinn-aufgaben.js, pinn-muell.js, pinn-push.js und pinn-pushtext.js; Sprachdateien en/fr/es ergänzt'],
      ['fix', '1.31.2: Profilbild-Upload bringt die App nicht mehr offline – Fotos werden vor dem Speichern verkleinert, zu große Bilder älterer Stände automatisch repariert · Kalender-Liste: Termine aller aktiven Kalender stehen gemeinsam nach Uhrzeit sortiert statt nacheinander je Kalender · Scanner: der dunkle Schleier über dem ganzen Kamerabild ist weg (das Hinweisfeld war unsichtbar, aber immer eingeblendet) · Einstellungen: der geöffnete Abschnitt rutscht jetzt auch an iPad und Computer an den oberen Rand · Schriftzug „Familie“ vor den Personen-Filtern in Kalender und Aufgaben entfernt'],
      ['fix', '1.31.1: Scanner ohne dunklen Schleier über dem Kamerabild am iPhone, Taschenlampe gut sichtbar und mit Rückmeldung, wenn das Gerät sie nicht freigibt · Einstellungen am Handy: der geöffnete Abschnitt rutscht mit der Überschrift an den oberen Rand · Finanzen: Zeitraum-Leiste sauber ausgerichtet (am Handy ‹ Zeitraum › über die volle Breite)'],
    ],
  },
  {
    v: '1.30', datum: '09.10.2026', titel: 'Vorrat 2.0',
    punkte: [
      ['neu', 'Mindesthaltbarkeit je Vorrats-Artikel: Plakette „läuft morgen ab“, Filter „⏳ Läuft ab“, Sortierung „MHD“ und ein Hinweis oben auf der Vorrat-Seite. Morgens kommt eine Push-Nachricht – einmal vorher (Tage im Regler-Symbol einstellbar) und einmal am Tag selbst; abschaltbar unter Einstellungen → Benachrichtigungen'],
      ['neu', 'Barcode-Scan mit der Kamera (📷 auf der Vorrat-Seite) zum Einräumen und Verbrauchen – für Lebensmittel, Drogerie, Haushalts- und Putzmittel und Tierfutter. Produktnamen holt der NAS aus Open Food / Beauty / Products / Pet Food Facts; Unbekanntes benennst du einmal, pinn. merkt sich den Barcode für die ganze Familie. Auch einem vorhandenen Artikel zuordnen, Nummer eintippen und Taschenlampe (Android) gehen'],
      ['neu', '„🍳 Was kann ich kochen?“ (Vorrat und Rezepte): gleicht die eigenen Rezepte mit dem Vorrat ab – „Alles da“ und „Fast alles da“, Rezepte mit Ablaufendem zuerst, Mengen werden verglichen. Fehlendes mit einem Tipp auf eine Einkaufsliste, Rezept direkt einplanen'],
      ['fix', '1.30.1: Gescannte Produkte landen in der richtigen Kategorie – Cornflakes, Nudeln & Co. wurden wegen des Oberbegriffs „Pflanzliche Lebensmittel und Getränke“ als Getränke eingestuft. Server: angepasst pinn-vorrat.js'],
      ['info', 'Die Scan-Erkennung steckt direkt in pinn. (kein fremder Code) und die Kamera geht nach 90 Sekunden ohne Treffer und im Hintergrund aus. Server: neu vorrat.pb.js und pinn-vorrat.js, angepasst pinn-push.js und pinn-pushtext.js; Sprachdateien en/fr/es ergänzt'],
    ],
  },
  {
    v: '1.29', datum: '09.10.2026', titel: 'Schule & Kita',
    punkte: [
      ['neu', 'Familie neu aufgebaut mit den Reitern Übersicht, Schule & Kita, Ortung und Notfall. Ein Tipp auf eine Person öffnet jetzt ihr Profil (Standort, Schule bzw. Kita, Notfallpass als Kachel) statt direkt den Notfallpass – aus dem SOS-Popup und dem Reiter „Notfall“ geht der Notfallpass weiterhin sofort auf'],
      ['neu', 'Schule & Kita je Kind: Einrichtung, Klasse oder Gruppe, Lehrkraft bzw. Erzieher:in mit Anruf- und Mail-Knopf; Übersicht für heute und morgen'],
      ['neu', 'Stundenplan als Raster mit eigenen Stundenzeiten, farbigen Fächern, Räumen und Doppelstunden – oder einfach fotografieren, die KI trägt ihn ein. Für die Kita Betreuungszeiten; für beide, wer an welchem Tag bringt und abholt'],
      ['neu', 'Hausaufgaben mit Fach und Frist (automatisch die nächste Stunde des Fachs) – auch auf der Kinderseite zum Abhaken'],
      ['neu', 'Elternbriefe mit Frist („unterschreiben bis Freitag“), Betrag und Notiz – auf Wunsch als Aufgabe mit Erinnerung für die Eltern; abgehakt ist abgehakt, in beide Richtungen. Brief fotografieren oder als PDF wählen: die KI liest Titel, Frist, Betrag und enthaltene Schließtage aus'],
      ['neu', 'Schließtage (auch mehrtägig) und offene Brief-Fristen erscheinen direkt im Kalender in der Farbe des Kindes'],
      ['info', 'Standorte werden nur noch auf „Übersicht“, „Ortung“ und im Profil laufend abgefragt – das schont Akku und Server. Server: angepasst pinn-ki.js und ki.pb.js (Stundenplan und Elternbrief vom Foto); Sprachdateien en/fr/es ergänzt'],
    ],
  },
  {
    v: '1.28', datum: '08.10.2026', titel: 'Haus',
    punkte: [
      ['neu', 'Neuer Menüpunkt „🏡 Haus“ (unter Fahrzeuge) für Mieter und Eigentümer: Miet- bzw. Kaufvertrag, eingezogen am, Vermieter oder Hausverwaltung, Kaution, Kündigungsfrist, Kaufnebenkosten und Kredit mit Restschuld, Zinsen und Ende der Zinsbindung'],
      ['neu', 'Fixkosten (Kaltmiete, Nebenkosten, Hausgeld, Kreditrate, Grundsteuer, Abgaben, Gebäudeversicherung) werden als regelmäßige Buchungen in Finanzen angelegt; Strom, Gas, Internet und Versicherungen aus „Verträge“ lassen sich zuordnen'],
      ['neu', 'Mängel mit Fotos, Status, Frist und „bei Einzug vorhanden“ – dazu eine fertige Mängelanzeige zum Kopieren, Teilen oder als E-Mail an den Vermieter'],
      ['neu', 'Kosten je Jahr nach Bereichen, Rechnungen für Möbel, Böden, Material und Handwerker (auf Wunsch gleich als Ausgabe gebucht, Beleg unter „Dokumente“ mit Gewährleistung), Nebenkostenabrechnung mit Nachzahlung/Guthaben, Lohnkosten für die Steuer (§ 35a) und ein Sanierungs- bzw. Renovierungsplan mit Budget, Förderung und Ist-Kosten'],
      ['neu', 'Zähler für Strom, Gas, Wasser, Wärme, Wärmepumpe und PV: Stand von Hand oder per Foto – die KI liest ab. Prognose über das Jahr (Heizung im Winter, PV im Sommer) mit erwarteter Nachzahlung oder Guthaben und passendem Abschlag'],
      ['neu', 'Wartungsplan mit Vorlagen (Rauchmelder testen, Heizung entlüften, Filter wechseln, Dachrinne reinigen, FI-Schalter, Zählerstände …): wird automatisch als Haushalts-Aufgabe angelegt, auf Wunsch reihum, bleibt stehen bis erledigt und zählt ab dem Erledigt-Tag weiter. Übersicht auch auf der Haushalt-Seite'],
      ['info', 'Dokumente aus „Dokumente“ lassen sich mit dem Zuhause, einzelnen Rechnungen und Mängeln verknüpfen; Haus ist wie Finanzen für Gäste und Kindersicherung gesperrt und hängt an der gewählten Kasse'],
      ['info', 'Server: angepasst pinn-aufgaben.js (Wartungsplan), pinn-ki.js und ki.pb.js (Zählerstand vom Foto); Sprachdateien en/fr/es ergänzt'],
    ],
  },
  {
    v: '1.27', datum: '08.10.2026', titel: 'Datenexport',
    punkte: [
      ['neu', 'Einstellungen → System → Daten: „📦 Familie exportieren“ (bzw. „WG exportieren“) – alle Daten als ZIP-Datei mit Dokumenten, Belegen, Rezept- und Pinnwand-Bildern. Vorher zeigt pinn., was enthalten ist und wie groß das ZIP wird; am iPhone über „Teilen → In Dateien sichern“, am Computer direkt in den Download-Ordner'],
      ['neu', 'Hauptadmin → Familien: „📦 Export“ je Familie – vollständig inklusive privater Kassen und „Nur für mich“-Kalender, z. B. für den Umzug auf ein anderes NAS'],
      ['info', 'Familien-Admins exportieren nur, was sie auch in der App sehen: Kassen ohne sie als Mitglied und private Kalender anderer bleiben draußen. Nie im Export: Passwörter, PINs, Zugangsdaten zu iCloud, Google und Home Assistant, angemeldete Geräte und Push-Abos'],
      ['info', 'Das ZIP entsteht im Browser – auf dem NAS bleiben keine Zwischendateien. Aufbau: pinn-export.json (Beschreibung), daten/ (JSON je Sammlung), dateien/ (Dokumente und Bilder), dazu eine LIESMICH-Datei'],
      ['info', 'Server: neu export.pb.js und pinn-export.js, neu pb_public/datenexport.js; pinn-setup.sh sortiert datenexport.js ein'],
      ['fix', '1.27.1: Glocke vollständig übersetzt (Englisch, Französisch, Spanisch) – Sätze wie „… hat … angelegt“, Heimwege, „automatisch abgehakt“, Wer schuldet wem, Uhrzeiten und Termin-Daten erscheinen jetzt in der gewählten Sprache; frei eingegebene Namen und Titel bleiben unverändert. Push-Mitteilungen übersetzen jetzt auch mehrere Läden und Ersatznamen wie „Zettel“ oder „Dokument“ (pinn-pushtext.js, Sprachdateien en/fr/es)'],
      ['fix', '1.27.2: Nach Updates erscheinen Geräte nicht mehr doppelt (Geräteverwaltung und Familien-Dashboard erkennen Geräte am Geräte-Cookie bzw. an den Gerätemerkmalen statt an der Netzwerk-Adresse); der Service Worker lädt nur noch die selbst gehosteten Dateien aus /vendor/'],
    ],
  },
  {
    v: '1.26', datum: '08.10.2026', titel: 'Sterne & faire Haushaltsverteilung',
    punkte: [
      ['neu', 'Kinderseite: Sterne für jede erledigte Aufgabe (je Aufgabe 1–3 ⭐, auf Wunsch Extra-Sterne für „Alles geschafft“). Ein Tipp auf den Sterne-Zähler öffnet die Belohnungen'],
      ['neu', 'Sterne eintauschen gegen Taschengeld, Medienzeit oder Wünsche – festgelegt in den Einstellungen des Kindes unter „Belohnungen bearbeiten“. Die Eltern bekommen eine Benachrichtigung und bestätigen auf der Kinderseite oder unter Finanzen → Taschengeld; Taschengeld-Belohnungen landen im Guthaben und als Ausgabe unter „Kinder“, bei „Ablehnen“ gibt es die Sterne zurück'],
      ['neu', 'Finanzen → Taschengeld: Sterne-Stand je Kind, offene Wünsche mit OK/Ablehnen und „+ Sterne“ für Extra-Lob oder Korrekturen'],
      ['neu', 'Haushalt: Reinigungen und Mülleimer mit mehreren Zuständigen lassen sich „🔄 Reihum“ verteilen – der Reihe nach oder fair (wer zuletzt am wenigsten gemacht hat). Wer eine Aufgabe verpasst, bleibt dran'],
      ['neu', 'Haushalt: Karte „⚖️ Wer macht wie viel?“ mit erledigten und verpassten Aufgaben je Person (30 Tage, 90 Tage, 1 Jahr) und wer bei den Reihum-Aufgaben gerade dran ist und danach'],
      ['neu', 'Hauptadmin: einzelnen Familien-Admins das Recht für Updates und Wiederherstellung geben („🛟 darf Updates & Wiederherstellung“)'],
      ['fix', 'Verlauf-Diagramme unter Finanzen (Ausgaben und Sparen) springen nicht mehr; Sicherungen & Updates, Geräte und Fehlerprotokoll öffnen sich beim Hauptadmin wieder sichtbar'],
      ['info', 'Server: angepasst aufgaben.pb.js, pinn-aufgaben.js (neue Sammlung „haushalt_verlauf“), system.pb.js, pinn-system.js und benutzer.pb.js; Sprachdateien en/fr/es ergänzt'],
    ],
  },
  {
    v: '1.25', datum: '08.10.2026', titel: 'Geräte & Fehlerprotokoll',
    punkte: [
      ['neu', 'Konto → „Angemeldete Geräte“: alle Geräte, auf denen dein Profil angemeldet ist – mit Name (z. B. „iPhone · App“), zuletzt aktiv, seit wann und ob Push ankommt. Jedes Gerät lässt sich einzeln abmelden, oder alle anderen auf einmal'],
      ['neu', 'Ein abgemeldetes Gerät verliert sofort den Zugriff, bekommt keine Benachrichtigungen mehr und löscht beim nächsten Öffnen die pinn.-Daten auf dem Gerät – praktisch, wenn ein Handy verloren geht'],
      ['neu', 'Admins: Profile verwalten → „📱 Geräte & Anmeldung“ zeigt die Geräte jedes Profils mit „Überall abmelden“; die Profilliste zeigt Geräteanzahl und gesperrte Profile. Der Hauptadmin hat 📱 bei jedem Profil und „📱 Meine Geräte“'],
      ['neu', 'Mehr Schutz bei der Anmeldung: Fehlversuche zählen jetzt auch je Netzwerk-Adresse – auch für unbekannte Familien und Profile (ab 20 in 30 Minuten kurz gesperrt). Wird ein Profil wegen falscher Passwörter gesperrt, bekommen die Admins eine Push-Nachricht und können die Sperre aufheben'],
      ['neu', 'Fehlerprotokoll für Admins (Einstellungen → System, als Hauptadmin „🧾 Fehlerprotokoll“): Fehler von Kalender-Sync, Push, Müllkalender und Anmeldung erscheinen in der App statt nur im Docker-Log – gleiche Meldungen zusammengefasst mit Zähler, „wieder ok“, sobald es wieder klappt, Filter, Details zum Kopieren; neue Fehler zeigen eine rote Zahl'],
      ['info', 'Passwort ändern bzw. ein Zurücksetzen durch einen Admin meldet alle anderen Geräte des Profils ab – samt Push'],
      ['info', 'Server: neu sitzungen.pb.js, pinn-sitzungen.js, protokoll.pb.js und pinn-protokoll.js; angepasst benutzer.pb.js, push.pb.js, muell.pb.js, kalender.pb.js, cron_calendar.pb.js, calendar-sync.js, pinn-kalender.js, pinn-push.js, pinn-pushtext.js und pinn-muell.js; Sprachdateien en/fr/es ergänzt. Bisherige Anmeldungen bleiben gültig und erscheinen beim nächsten Öffnen der App in der Geräteliste'],
    ],
  },
  {
    v: '1.24', datum: '07.10.2026', titel: 'Sicherungen & Updates per Knopf',
    punkte: [
      ['neu', 'Automatische Sicherung jede Nacht um 03:30 Uhr auf dem NAS – rotierend: alle Sicherungen der letzten 7 Tage, danach 4 Wochen lang eine pro Woche; vor jedem Update und jeder Wiederherstellung zusätzlich automatisch'],
      ['neu', 'Einstellungen → System → „Sicherungen & Wiederherstellung“ (als Hauptadmin „🛟 Sicherungen & Updates“): alle Sicherungen mit Datum und Größe, „Jetzt sichern“ und Wiederherstellen per Knopf – nur die Daten oder alles. Der jetzige Stand wird vorher gesichert; startet pinn. mit der Sicherung nicht, kommt der alte Stand von selbst zurück'],
      ['neu', 'Updates per Knopf: pinn. sucht auf GitHub nach neuen Versionen, zeigt die Release-Notizen und spielt das Update samt Sicherung ein – ganz ohne SSH. Eine neue Version erscheint als Hinweis unter Einstellungen → System'],
      ['info', 'Wiederherstellen und Updates betreffen den ganzen Server: das darf der Hauptadmin, bei nur einer Familie auch deren Admins. Der Fortschritt bleibt sichtbar, während pinn. neu startet'],
      ['info', 'Server: neuer Container „wartung“ (ersetzt „backup“, Skript pinn-wartung.sh), neu system.pb.js und pinn-system.js; docker-compose.yaml (Ordner wartung), pinn-setup.sh (lädt neue Hooks mit einem Neustart) und pinn-pocketbase-update.sh angepasst – einmalig sudo sh pinn-setup.sh ausführen'],
    ],
  },
  {
    v: '1.23', datum: '07.10.2026', titel: 'Einkaufsliste neu sortiert',
    punkte: [
      ['neu', 'Einkaufsliste nach Kategorien (Obst & Gemüse, Milch & Käse, Tiefkühl …): Artikel werden automatisch zugeordnet, eine falsch erkannte Kategorie lässt sich im Artikel-Popup ändern und wird fürs nächste Mal gemerkt'],
      ['neu', 'Einstellungen → Einkauf: Reihenfolge der Kategorien mit ▲/▼ festlegen – z. B. so, wie man durch den Laden geht'],
      ['neu', 'Plus/Minus direkt neben der Menge jedes Artikels; Antippen streicht den Artikel durch und schiebt ihn nach unten zu „Abgehakt“'],
      ['info', 'Einkaufslisten im Stil der übrigen Listen: größere Zeilen wie Knöpfe, Karten statt Kassenzettel'],
      ['neu', 'Finanzen: bei einer bestehenden einmaligen Ausgabe lässt sich nachträglich eine Wiederholung einrichten – die Buchung bleibt die erste, danach wird regelmäßig weitergebucht'],
      ['fix', 'Beim Drehen des Handys bleibt die geöffnete Liste offen; das „+“ zum Hinzufügen von Familienmitgliedern im Kalender ist entfallen (Mitglieder legt man unter Einstellungen an)'],
    ],
  },
  {
    v: '1.22', datum: '07.10.2026', titel: 'Push für Android',
    punkte: [
      ['neu', 'Push-Benachrichtigungen auf Android-Handys (Chrome, Samsung Internet, Edge, Firefox): wie am iPhone unter Einstellungen → Benachrichtigungen „Auf diesem Gerät aktivieren“ – mit allen Erinnerungen, Pinnwand, SOS und Glocke'],
      ['neu', 'pinn. lässt sich auf Android als App installieren („📲 pinn. als App installieren“ bzw. Chrome-Menü ⋮) – mit eigenen App-Symbolen und einfarbigem Symbol in der Statusleiste'],
      ['info', 'Weckrufe an Android gehen mit hoher Priorität raus, damit Erinnerungen auch im Energiesparmodus pünktlich kommen; Meldungen mit gleichem Thema melden sich erneut statt still ersetzt zu werden; Android-spezifische Hinweise bei blockierten Mitteilungen, In-App-Browsern und Akku-Einschränkungen'],
      ['fix', 'pinn-setup.sh nimmt jetzt auch den Ordner aus der Release-ZIP (z. B. pinn-1.22.1) an und lässt sich direkt aus dem entpackten Ordner starten (sudo sh pinn-*/pinn-setup.sh) – vorher fehlte das Skript bei einer Neuinstallation im Projektordner'],
      ['fix', 'Neue Familien starten ohne Beispiel-Mitglieder: Jedes vom Hauptadmin angelegte Profil (auch der Familien-Admin) erscheint sofort als Familienmitglied mit seinem Namen und ist verknüpft; gelöschte Profile verschwinden mit ihrem Mitglied, bereits angelegte Familien werden automatisch repariert (auch die weiteren Profile, nicht nur der Familien-Admin); neue Mitglieder starten mit den Standard-Einstellungen, jeder bearbeitet sich selbst, der Admin alle, Kinder nur der Admin'],
    ],
  },
  {
    v: '1.21', datum: '07.10.2026', titel: 'pinn. auf GitHub',
    punkte: [
      ['neu', 'Einstellungen → GitHub: Link zur Projektseite, Fehler melden oder Ideen vorschlagen und ein dezenter, freiwilliger Unterstützen-Bereich (Ko-fi, Buy Me a Coffee) – für Kinderprofile ausgeblendet'],
      ['info', 'Veröffentlicht als Open Source (MIT-Lizenz) unter github.com/pinn-shost/pinn: README, Lizenz und Installationsanleitung; pinn-setup.sh nimmt jetzt auch den entpackten GitHub-Ordner (pinn-main) an und lädt bei einer Neuinstallation fehlende Bibliotheken für PDF-Import und Foto-Texterkennung selbst nach'],
      ['info', 'docker-compose.yaml mit neutralen Vorgaben (keine festen IP-Adressen und keine DuckDNS-Subdomain mehr) – alles kommt aus dem Einrichtungs-Assistenten'],
    ],
  },
  {
    v: '1.20', datum: '06.10.2026', titel: 'Einrichtungs-Assistent',
    punkte: [
      ['neu', 'Einrichtungs-Assistent für den Hauptadmin in Deutsch, Englisch, Französisch und Spanisch (Sprachwahl gleich zu Beginn): Heimnetz, DuckDNS mit HTTPS, DNS-Rebind-Ausnahme, unterwegs per WireGuard (FRITZ!Box) oder Tailscale, Google, KI, Ortung, Home Assistant und Apps – jeder Schritt mit Schritt-für-Schritt-Anleitung und „Prüfen“'],
      ['neu', 'Startet nach der ersten Anmeldung als Hauptadmin von selbst und ist später unter Hauptadmin → ⚙︎ Einrichtung erreichbar; bei einer neuen Installation zeigt die Anmeldemaske den Weg dorthin'],
      ['neu', 'Zugangsdaten landen im Ordner konfig auf dem NAS (nur für root lesbar) – die .env muss nicht mehr von Hand bearbeitet werden. pinn. übernimmt sie mit einem kurzen Neustart, Caddy, DuckDNS, der Home-Assistant-Umweg und Tailscale stellen sich von selbst um'],
      ['neu', 'Skript pinn-setup.sh: sortiert alle heruntergeladenen Dateien an die richtige Stelle, legt fehlende Ordner an und startet pinn. – für die Erstinstallation und jedes Update'],
      ['info', 'Server: neu einrichtung.pb.js und pinn-einrichtung.js; docker-compose.yaml (Ordner konfig, Port 8090 im Heimnetz, optionaler Tailscale-Container, Backup inkl. konfig), Caddyfile und env.txt angepasst'],
    ],
  },
  {
    v: '1.19', datum: '06.10.2026', titel: 'WG überall',
    punkte: [
      ['neu', 'Push-Nachrichten vom Server kommen in der Sprache des Profils (Deutsch, Englisch, Französisch, Spanisch) und passend zur Wohnform – z. B. „Deine WG wurde alarmiert“ beim SOS; gilt für Handy und Glocke'],
      ['neu', 'Hauptadmin: beim Anlegen Familie oder WG wählbar, die Liste zeigt die Wohnform jeder Familie'],
      ['neu', 'Anmeldung: nach Eingabe des Namens zeigt Schritt 2 „WG“ statt „Familie“, wenn es eine WG ist'],
      ['neu', 'In einer WG sind Kindersicherung, Kinderseite, Taschengeld, Junior-Depots und die Kinder-Benachrichtigungen ausgeblendet – schon Eingerichtetes bleibt sichtbar und bearbeitbar'],
      ['info', 'Server: neue Datei pinn-pushtext.js (Übersetzungen der Push-Texte), angepasst pinn-push.js, push.pb.js, sw.pb.js und benutzer.pb.js; Sprachdateien en/fr/es ergänzt'],
    ],
  },
  {
    v: '1.18', datum: '06.10.2026', titel: 'Familie oder WG',
    punkte: [
      ['neu', 'Wohnform wählbar (Einstellungen → Familienmitglieder): Familie oder WG – gilt für alle Profile und Geräte'],
      ['neu', 'Als WG passt pinn. alle Texte an: aus der Familie wird die WG, aus Familienmitgliedern werden Mitbewohner, Familienkalender heißt WG-Kalender usw. – in allen Sprachen (flatshare/flatmates, colocation/colocataires, piso compartido/compañeros de piso)'],
      ['info', 'Die Daten bleiben gleich; beim Umstellen lädt pinn. einmal neu. Anmeldung, Hauptadmin und Versions-Log bleiben unverändert; in einer WG wird der Name nicht als Nachname an die Mitglieder gehängt'],
    ],
  },
  {
    v: '1.17', datum: '06.10.2026', titel: 'Sprache & Region',
    punkte: [
      ['neu', 'Einstellungen → Sprache & Region: neben der Sprache jetzt Land, Währung und Zahlenformat – je Profil auf allen Geräten'],
      ['neu', 'Alle gängigen Währungen; Beträge erscheinen wie im Land üblich – Währungszeichen davor oder dahinter, Komma oder Punkt (z. B. 1.234,56 €, $1,234.56, CHF 1’234.56). Eingaben verstehen Komma und Punkt, gerechnet wird weiter genau wie bisher'],
      ['neu', 'Notrufnummern je Land (Polizei, Rettung, Feuerwehr) – im Notfallpass, im SOS-Popup, bei „Ich bin unterwegs“ und im SOS-Push'],
      ['info', 'Server: pinn-ortung.js (Notrufnummern im SOS-Push je Empfänger) und pinn-finanzen.js (Betrag im Ausgleich-Push in der Währung des Empfängers); Sprachdateien en/fr/es ergänzt'],
    ],
  },
  {
    v: '1.16', datum: '06.10.2026', titel: 'Français & Español',
    punkte: [
      ['neu', 'Neue Sprachen Französisch und Spanisch (Einstellungen → Sprache), je eine eigene kleine Datei unter pb_public/lang/'],
      ['neu', 'Übersetzung deutlich vollständiger: Haushalt und Kategorien, Listen und Unterlisten, Saugroboter (Saugen/Wischen, Dropdowns), Notfallpass, Live-Standort mit Verfolgen und Spur, Rezepte („Planen“), Vorrat, Finanzen, Kassen, Verträge, Dokumente und die automatischen Fahrzeug-Aufgaben (z. B. Winterreifen aufziehen)'],
      ['info', 'Texte mit Symbolen davor („🧹 Reinigung“) und zusammengesetzte Texte („… · …“) werden jetzt Teil für Teil übersetzt; Gruppen in Dropdowns ebenfalls'],
      ['info', 'Kategorie-Namen in den Einstellungen erscheinen übersetzt – gespeichert wird nur, was jemand selbst ändert'],
      ['fix', 'Bei Fahrzeugen hieß „Laden“ im Englischen „Shop“ statt „Charging“; neue Saugroboter-Aktionen bekommen ihren Namen in der gewählten Sprache'],
    ],
  },
  {
    v: '1.15', datum: '06.10.2026', titel: 'Sprachen: English',
    punkte: [
      ['neu', 'pinn. spricht Englisch: Einstellungen → Sprache, Auswahl per Dropdown mit Flagge, Übernahme mit „Speichern“ – gilt pro Profil auf allen Geräten'],
      ['neu', 'Englisch ist der Standard; ist das Gerät auf Deutsch gestellt, startet pinn. auf Deutsch, bis im Profil etwas anderes gespeichert ist'],
      ['info', 'Jede Sprache ist eine eigene kleine Datei (pb_public/lang/en.js) und wird nur geladen, wenn sie gewählt ist – Deutsch lädt nichts nach; weitere Sprachen: Datei ergänzen und eine Zeile in PINN_LANGUAGES'],
      ['info', 'Server: sw.pb.js hält die Sprachdatei für den Offline-Start vor; der Versions-Log bleibt deutsch'],
    ],
  },
  {
    v: '1.14', datum: '06.10.2026', titel: 'Glocke: alles im Blick',
    punkte: [
      ['neu', 'Jede Push-Nachricht steht jetzt auch unter der 🔔 Glocke („Für dich“) – auch wenn sie auf dem Gerät nicht ankam. Terminerinnerungen und Tagesübersicht verschwinden dort wieder, wenn sie vorbei sind'],
      ['neu', 'Die Glocke meldet viel mehr: abgehakte und entfernte Artikel, umbenannte und gelöschte Listen, erledigte Aufgaben, neue Vorrats-Artikel, Pinnwand-Zettel und Antworten, neue Familienmitglieder und geänderte Notfallpässe'],
      ['neu', 'Finanzen in der Glocke: wer wo eingekauft und wie viel ausgegeben hat, Tanken & Co. aus „Fahrzeuge“, Ausgleiche, neue Verträge und Fahrzeuge – bei geteilten Kassen direkt darunter, wer wem noch etwas schuldet. Sieht nur, wer zur Kasse gehört'],
      ['neu', 'Neue Dokumente erscheinen bei allen, die das Dokument sehen dürfen'],
      ['neu', 'Alles ist verlinkt: Antippen öffnet genau die Aufgabe, den Termin, die Liste, das Rezept, die Buchung, den Vertrag, das Fahrzeug, das Dokument, den Zettel oder das Familienmitglied; Neuerungen öffnen das Versions-Log'],
      ['info', 'Push-Nachrichten führen jetzt direkt zur passenden Stelle – auch wenn pinn. schon offen ist; Doppeltes (persönliche Nachricht und Familien-Hinweis zur selben Sache) erscheint nur einmal'],
      ['info', 'Server: hinweise.pb.js, pinn-hinweise.js, pinn-push.js, pinn-finanzen.js, pinn-kassen.js, aufgaben.pb.js und sw.pb.js – die Sammlung „hinweise“ ergänzt ihre neuen Felder selbst'],
    ],
  },
  {
    v: '1.13', datum: '06.10.2026', titel: 'Sicherheit & Datenschutz',
    punkte: [
      ['neu', 'Anmeldung gegen Durchprobieren geschützt: nach 5 falschen Passwörtern ist das Profil kurz gesperrt (30 Sekunden, bei weiteren Fehlversuchen länger, höchstens 15 Minuten)'],
      ['info', 'DuckDNS-Token steht nicht mehr in der docker-compose.yaml, sondern nur noch in der .env (DUCKDNS_TOKEN)'],
      ['info', 'Traccar-Weboberfläche und OsmAnd-Port sind nur noch auf dem NAS selbst erreichbar; Positionen kommen weiter über pinn.'],
      ['info', 'Backups (enthalten .env und Schlüssel) sind nur noch für root lesbar'],
      ['fix', 'Persönliche Beispieldaten (Namen, Domain) aus Platzhaltern und Hinweisen entfernt'],
    ],
  },
  {
    v: '1.12', datum: '06.10.2026', titel: 'Kindersicherung: nur eigene Aufgaben',
    punkte: [
      ['neu', 'Profile mit Kindersicherung sehen bei den Aufgaben nur noch ihre eigenen (und die an „Alle“) – auch in Suche, Glocke und App-Badge'],
      ['neu', 'Kindersicherung sperrt jetzt auch Hinzufügen und Bearbeiten überall (Termine, Essen, Rezepte, Aufgaben, Haushalt, Pinnwand, Listen, Vorrat, Orte, Notfallpass): die Knöpfe sind ausgeblendet, Bearbeiten-Fenster lassen sich nicht speichern'],
      ['neu', 'Einstellungen sind mit Kindersicherung nur noch zum Ansehen da; Abhaken, Favoriten, Heimweg und SOS gehen weiterhin'],
    ],
  },
  {
    v: '1.11', datum: '05.10.2026', titel: 'Menü sperrt die Seite',
    punkte: [
      ['info', 'Ist das Menü geöffnet, lässt sich die Seite dahinter nicht mehr bedienen (keine Buttons, Felder, Tab-Leiste, kein Scrollen) – ein Tipp darauf schiebt Menü und Seite nur wieder nach links'],
      ['fix', 'Tipp neben das offene Menü schließt es jetzt zuverlässig (auch auf dem iPhone)'],
    ],
  },
  {
    v: '1.10', datum: '05.10.2026', titel: 'Kalender-Einstellungen neu',
    punkte: [
      ['neu', 'Einstellungen → Kalender startet leer, nur mit „+ Kalender hinzufügen“: mit dem eigenen iCloud- oder Google-Konto anmelden und die Kalender daraus in zwei Spalten anhaken – „Für mich“ oder „Familie“; der Umschalter „Nur für mich / Ganze Familie“ entfällt'],
      ['neu', 'Jedes Profil sieht dieselbe Maske mit seinem eigenen Konto; Familienkalender der anderen erscheinen nur als Hinweis, über welches Konto sie kommen (unkenntlich, z. B. m**l@g***l.com)'],
      ['fix', 'Google ist in der Maske immer anwählbar; fehlt auf dem Server der Google-Zugang, kann ein Admin Client-ID und Clientschlüssel direkt in pinn. hinterlegen (Weiterleitungs-URI wird angezeigt)'],
      ['info', 'Die bisherige Familienverbindung erscheint nur noch, solange dort Kalender ausgewählt sind; „Jetzt aktualisieren“ gleicht auch die Familienkalender aus den Konten der anderen ab'],
      ['info', 'Server: aktualisiert kalender.pb.js, pinn-kalender.js, pinn-kalender-konten.js, pinn-google.js (Sammlung „google_client“ legt sich bei Bedarf an) und trigger_sync.pb.js'],
    ],
  },
  {
    v: '1.9', datum: '05.10.2026', titel: 'Eigene Kalender mit iCloud & Google',
    punkte: [
      ['neu', 'Kalender „Nur für mich“ lassen sich mit einem Kalender aus dem eigenen iCloud- oder Google-Konto verknüpfen (Einstellungen → Kalender → Eigene Kalender → Neuer Kalender → „Termine speichern in“) – die Termine liegen dann dort und erscheinen auch auf dem eigenen Handy'],
      ['neu', 'Persönliche Konten je Profil: Apple-ID mit App-spezifischem Passwort bzw. Anmeldung bei Google; nur das eigene Profil sieht sie, die Familienkalender bleiben unberührt. Trennen entfernt die verknüpften Kalender nur aus pinn.'],
      ['neu', 'Anlegen, Bearbeiten, Löschen und Verschieben (auch zwischen Familien-, pinn.- und verknüpften Kalendern) gehen direkt zu iCloud/Google; Änderungen von dort kommen alle 15 Minuten oder mit „Jetzt aktualisieren“; nur lesbare Google-Kalender werden angezeigt, aber nicht zum Anlegen angeboten'],
      ['info', 'Server: neu pinn-kalender-konten.js (Sammlung „kalender_konten“ wird beim Start angelegt); aktualisiert kalender.pb.js, pinn-kalender.js, calendar-sync.js, pinn-google.js, google_credentials.pb.js und trigger_sync.pb.js'],
    ],
  },
  {
    v: '1.8', datum: '05.10.2026', titel: 'Eigene Kalender',
    punkte: [
      ['neu', 'Einstellungen → Kalender → Eigene Kalender: jedes Profil legt beliebig viele Kalender an – „Nur für mich“ (sieht nur das eigene Profil) oder „Ganze Familie“ (geteilt, zusätzlich zu den Familienkalendern aus iCloud/Google), mit Name und Farbe'],
      ['neu', 'Termine in eigenen Kalendern liegen auf dem pinn.-Server: anlegen, bearbeiten, löschen und offline vormerken wie gewohnt, auch zwischen iCloud/Google und eigenen Kalendern verschieben; die Kalenderauswahl beim Termin ist nach Familienkalender, Geteilte Kalender und Nur für mich gruppiert'],
      ['neu', 'Push-Erinnerungen und Tagesübersicht berücksichtigen eigene Kalender – private Termine nur für ihr Profil, ohne Glocke und Pushs an die Familie'],
      ['info', 'Schulferien und Müllabfuhr erscheinen im Kalender kleiner als normale Termine und stehen hinter ihnen'],
      ['info', 'Server: neu kalender.pb.js + pinn-kalender.js (Sammlungen „kalender_eigene“ und „kalender_termine“ werden beim Start angelegt); aktualisiert benutzer.pb.js, create_/update_/delete_calendar_event.pb.js, get_calendar_event_raw.pb.js und pinn-push.js'],
    ],
  },
  {
    v: '1.7', datum: '05.10.2026', titel: 'Saugroboter nach Räumen',
    punkte: [
      ['neu', 'Saugroboter über Home Assistant (z. B. Roborock Qrevo): Roboter wählen, pinn. lädt die Räume aus seiner Karte. Aktion „Raumreinigung“ mit Räumen und Modus Saugen, Saugen & Wischen oder Wischen'],
      ['neu', 'Je Aktion Saugstärke, Wassermenge, Wischmodus und Durchgänge; pinn. stellt sie vor dem Start ein (Saugen: Wasser aus, Wischen: Saugen aus)'],
      ['neu', '„Raum der Aufgabe“: eine Aktion für alle Räume – nimmt den Raum der Haushalt-Reinigung und zeigt, welche Räume in der Karte passen'],
      ['info', 'Geräte-Popup zeigt Akku, Zustand und alle Sensoren des Roboters; Status-Entität auch aus Sensoren wählbar. Server: pinn-smarthome.js und smarthome.pb.js aktualisiert'],
    ],
  },
  {
    v: '1.6.1', datum: '05.10.2026', titel: 'Home Assistant leichter verbinden',
    punkte: [
      ['fix', 'Adresse ohne http:// und ohne Port wird akzeptiert – pinn. probiert Port 8123, Port 80 und https selbst durch und merkt sich die passende Variante'],
      ['fix', 'Token darf mit „Bearer“ bzw. „Authorization: Bearer“ davor oder mit Zeilenumbrüchen eingefügt werden'],
      ['info', 'Klare Meldungen: „Token abgelehnt“ (Home Assistant gefunden), „nicht erreichbar“ mit allen probierten Adressen und Hinweis, dass .local-Namen im Server nicht funktionieren'],
    ],
  },
  {
    v: '1.6', datum: '05.10.2026', titel: 'Home Assistant',
    punkte: [
      ['neu', 'Smarthome mit Home Assistant: Verbindung mit Adresse und langlebigem Token (bleibt auf dem Server). Der pinn.-Server ruft die Dienste selbst auf – Knöpfe funktionieren auf allen Geräten, auch Android'],
      ['neu', 'Geräte wählen „Apple Kurzbefehle“ oder „Home Assistant“; bei Home Assistant Entität und Dienst aus der Liste, für Lichter Farbe und Helligkeit, optional Zusatzdaten (JSON). Skripte bekommen den Raumnamen als Variable „raum“'],
      ['neu', 'Status-Entität (z. B. der Saugroboter): weitere Aktionen desselben Geräts warten, bis es wirklich fertig ist. Per Knopf gestartete Aktionen werden eingereiht, wenn das Gerät noch beschäftigt ist'],
      ['neu', 'Automatik und „Beim Abhaken“ über Home Assistant laufen auf dem Server (jede Minute) – ohne Kurzbefehl auf dem Handy'],
      ['neu', 'Einstellungen → Smarthome (zusätzlich zum Haus-Symbol im Haushalt), Popup mit Reitern Geräte | Apple Kurzbefehle | Home Assistant'],
    ],
  },
  {
    v: '1.5', datum: '04.10.2026', titel: 'Smarthome nacheinander',
    punkte: [
      ['neu', 'Aktionen haben eine Dauer in Minuten (Smarthome → Gerät): solange ist das Gerät belegt, weitere Aktionen desselben Geräts warten und starten über die Automatik danach – z. B. erst Wohnzimmer saugen, dann Küche wischen'],
      ['neu', 'Bei gleicher Uhrzeit gilt die Reihenfolge der Räume auf der Haushalt-Seite; per Knopf gestartete Aktionen belegen das Gerät ebenfalls'],
      ['info', 'Automatik zeigt belegte Geräte und listet die nötigen Uhrzeiten inkl. Folgezeiten. Server: pinn-smarthome.js und smarthome.pb.js aktualisiert'],
    ],
  },
  {
    v: '1.4', datum: '04.10.2026', titel: 'Smarthome-Automatik',
    punkte: [
      ['neu', 'Smarthome → Automatik: ein Kurzbefehl „pinn Automatik“ holt sich zu festen Uhrzeiten (iOS-Automation), was laufen soll – z. B. Saugroboter um 10 Uhr oder Müll-LED am Vorabend der Abholung. Einrichtung mit geheimem Link, Uhrzeiten-Übersicht und Anleitung im Popup'],
      ['neu', 'Reinigungen und Mülleimer: „Automatisch starten“ mit Uhrzeit, optional danach automatisch abhaken; die Aufgabe zeigt „⏱ startet automatisch um …“'],
      ['info', 'Per Knopf gestartete Aktionen werden gemeldet und von der Automatik nicht wiederholt; „Beim Abhaken“ holt die Automatik nach, wenn auf einem Gerät ohne Kurzbefehle abgehakt wurde. Server: neu smarthome.pb.js + pinn-smarthome.js (Sammlung „smarthome_zugaenge“ wird beim Start angelegt)'],
    ],
  },
  {
    v: '1.3', datum: '04.10.2026', titel: 'Smarthome im Haushalt',
    punkte: [
      ['neu', 'Haushalt: neues Haus-Symbol oben für Smarthome-Geräte (Saugroboter, Licht/LED, Steckdose, Lautsprecher, Sonstiges) mit eigenen Aktionen, die jeweils einen Apple-Kurzbefehl starten – mit Test-Knopf'],
      ['neu', 'Reinigungen und Mülleimer lassen sich mit Aktionen verknüpfen: die Aufgabe bekommt Start-Knöpfe (z. B. Saugen, Wischen oder beides); nach der Rückkehr fragt pinn., ob die Aufgabe abgehakt werden soll'],
      ['neu', '„Beim Abhaken“: startet zusätzlich eine Aktion, sobald die Aufgabe erledigt ist (z. B. Erinnerungs-LED aus). Der Raumname wird als Eingabe an den Kurzbefehl übergeben'],
    ],
  },
  {
    v: '1.2', datum: '04.10.2026', titel: 'Gäste in Kassen',
    punkte: [
      ['neu', 'Kassen: Gäste ohne Profil hinzufügen (Kasse einstellen → „Gäste ohne Profil“) – z. B. Freunde im Urlaub. Sie zählen beim Aufteilen wie Mitglieder, sehen die Kasse aber nicht'],
      ['neu', 'Gäste lassen sich bei „Bezahlt von“, „Aufteilen auf“ und beim Ausgleichen auswählen; „Wer schuldet wem“ rechnet sie mit ein'],
      ['info', 'Entfernte Gäste behalten in alten Buchungen ihren Namen. Server: pinn-kassen.js ergänzt (neues Feld „gaeste“ wird beim Start angelegt)'],
    ],
  },
  {
    v: '1.1', datum: '04.10.2026', titel: 'Kassen neu gedacht',
    punkte: [
      ['neu', 'Finanzen → Ausgaben und Sparen starten leer mit einem großen Hinweis: zuerst eine Kasse anlegen und wählen, wer dazugehört („Alle“ / „Nur ich“ / einzelne Personen – z. B. Kinder ausschließen oder alle aus der WG einladen). Sparen ohne Depot zeigt „Erstes Depot anlegen“'],
      ['neu', 'Verträge und Dokumente gehören zu einer Kasse: beim Anlegen wählbar, nur Kassenmitglieder sehen sie (samt Dateien und Erinnerungen). Ohne Auswahl landen sie bei „Familie (alle)“ – sichtbar für alle Profile außer Gästen und Kindersicherung'],
      ['info', 'Keine automatisch angelegten Kassen mehr; leere alte Haushalts- und eigene Kassen werden beim Serverstart entfernt. Kassen lassen sich von ihrem Besitzer löschen (Dokumente bleiben dann nur für ihn sichtbar)'],
      ['fix', 'Kassen-Popup lag hinter den Finanz-Einstellungen (Button wirkte tot); beim Laden der Kassen zeigt pinn. jetzt den echten Fehlergrund statt nur „Kassen konnten nicht geladen werden“; Server antwortet robuster; neu „Fehlerdetails“ prüft das Laden Schritt für Schritt (1.1.1)'],
      ['fix', 'Ursache für „Kassen nicht erreichbar – Something went wrong“ behoben: Die Kassen-Routen auf dem Server nutzten Hilfsfunktionen, die PocketBase im Handler nicht sieht (1.1.2)'],
    ],
  },
  {
    v: '1.0', datum: '04.10.2026', titel: 'Müllkalender',
    punkte: [
      ['neu', 'Einstellungen → Kalender → Müllkalender: Die KI sucht mit eurer Zuhause-Adresse (oder einer von Hand eingegebenen) die iCal-Datei eures Entsorgers; der pinn.-Server lädt jeden gefundenen Link selbst herunter, prüft ihn und zeigt nur echte Kalender mit den nächsten Abfuhrterminen zum Übernehmen'],
      ['neu', 'Abfuhrtermine erscheinen ganztägig im Kalender – farbig je Müllart (Restmüll, Bio, Papier, Gelber Sack …); einzelne Müllarten oder der ganze Müllkalender lassen sich für die Familie ausblenden'],
      ['info', 'Genau ein Müllkalender je Familie: ein neu übernommener ersetzt den bisherigen. Ohne Treffer gibt es die Seiten des Entsorgers zum Selbst-Herunterladen; Link einfügen oder .ics-Datei hochladen geht auch ohne KI'],
      ['info', 'Kalender mit Link prüft der Server jede Woche selbst auf neue Termine (fürs nächste Jahr); ändern dürfen nur Admins, offline bleiben die Termine auf dem Gerät'],
      ['info', 'Server: neue Dateien pb_hooks/muell.pb.js und pinn-muell.js (nutzt den vorhandenen Gemini-Schlüssel PINN_GEMINI_KEY)'],
    ],
  },
  {
    v: '0.99', datum: '04.10.2026', titel: 'Energiesparen',
    punkte: [
      ['neu', 'Ruhemodus: nach 3 Minuten ohne Bedienung (am Mac/PC nach 1 Minute, wenn ein anderes Fenster vorne ist) fragt pinn. den Server höchstens alle 5 Minuten ab und pausiert Dauer-Animationen (SOS ausgenommen) – jede Berührung oder Eingabe weckt pinn. sofort und holt alles nach'],
      ['info', 'Im Hintergrund (anderer Tab, App nicht offen) laufen keine Abfragen mehr; beim Zurückkehren wird Verpasstes einmal nachgeholt. Push-Nachrichten kommen weiterhin sofort'],
      ['fix', 'Kalender und Aufgaben werden nur noch neu gezeichnet, wenn sich wirklich etwas geändert hat (statt jede Minute); Ortungskarte im Ruhemodus jede Minute statt alle 8–15 Sekunden; bei „Bewegung reduzieren“ im System keine Dauer-Animationen'],
    ],
  },
  {
    v: '0.98', datum: '03.10.2026', titel: 'Kassen & private Dokumente',
    punkte: [
      ['neu', 'Kassen: Finanzen lassen sich aufteilen – die Haushaltskasse (Standard), eine eigene Kasse für jedes Profil und beliebig viele gemeinsame Kassen (z. B. WG, Urlaub, Paar). Oben in Finanzen und Fahrzeuge wechselt man die Kasse'],
      ['neu', 'Jede Kasse hat eigene Buchungen, Budget, Kategorien, Sparen, Taschengeld, Verträge, Fahrzeuge und Belege – wer kein Mitglied ist, sieht nichts davon (auch nicht über den Server). So planen z. B. Jugendliche ihre eigenen Finanzen ohne Zugriff auf die der Eltern'],
      ['neu', 'Mitglieder je Kasse einstellbar: Haushaltskasse für alle Profile oder nur ausgewählte (Admins), eigene Kasse mit ausgewählten Personen teilen, gemeinsame Kassen anlegen, verlassen oder löschen; Push, wenn man hinzugefügt wird'],
      ['neu', '„Ausgaben aufteilen – wer schuldet wem“: Bezahlt von + Aufteilen auf je Buchung (auch regelmäßige, z. B. Miete), Übersicht der Salden mit „Ausgleichen“; Ausgleiche zählen nicht als Ausgabe, die Person bekommt eine Push-Nachricht'],
      ['neu', 'Einkaufen für WGs: Einkaufslisten lassen sich einer Kasse zuordnen (Listen → Liste bearbeiten). Beim Abschließen wird in diese Kasse gebucht und auf die Mitglieder aufgeteilt; ein privater Anteil („Davon nur für mich“) landet in der eigenen Kasse'],
      ['info', 'Beim Update ziehen alle bisherigen Finanzdaten, Buchungen und Belege in die Haushaltskasse – für alle Profile wie bisher. Wer etwas trennen möchte, stellt die Mitglieder in der Kasse um (⚙︎ im Kassen-Umschalter)'],
      ['fix', 'Kassen-Auswahl als schlichte Zeile unter der Überschrift (Finanzen, Fahrzeuge) statt Knopf daneben – zusätzlich unter „Finanzen einrichten“ → Kassen; zeigt an, wenn der Server die Kassen nicht liefert'],
      ['fix', 'Wiederherstellung ergänzt jetzt auch regelmäßige Buchungen mit älteren IDs; alle geretteten Altdaten werden dauerhaft aufbewahrt und beim Start erneut abgeglichen'],
      ['fix', 'Umzug in die Kassen: Fehlende Finanzdaten (z. B. Fahrzeuge, Verträge) werden aus dem alten Familien-Datensatz und aus älteren Zwischenständen der Geräte automatisch ergänzt; doppelt angelegte Kassen werden zusammengelegt'],
      ['neu', 'Tages-Sicherung je Kasse: In den Kassen-Einstellungen lässt sich Fehlendes vom Stand vor der ersten Änderung des Tages zurückholen'],
      ['neu', 'Dokumente: „Sichtbar für“ – ganze Familie, nur ich oder ausgewählte Personen; private Dokumente (mit 🔒) samt Dateien und Erinnerungen bekommt vom Server nur, wer dabei ist'],
      ['info', 'Server: neu kassen.pb.js und pinn-kassen.js; ersetzt finanzen.pb.js, pinn-finanzen.js, save_family_data.pb.js, pinn-vertraege.js (Kündigungs-Erinnerungen nur an Mitglieder der Kasse) und pinn-dokumente.js'],
    ],
  },
  {
    v: '0.97', datum: '03.10.2026', titel: 'Rezeptbild-Ausschnitt',
    punkte: [
      ['neu', 'Rezeptbild zuschneiden: beim Bearbeiten eines Rezepts lässt sich das Bild im Rahmen verschieben und zoomen (Ziehen, Regler, zwei Finger bzw. Trackpad, am Mac auch Pfeiltasten und +/−) – der Rahmen bleibt immer ganz ausgefüllt; der Ausschnitt gilt oben im Rezept, in Liste, Slidern und Vorschaubildern und wird auch bei öffentlichen Rezepten mitgeteilt'],
      ['fix', 'Rezepte öffnen am Mac wieder oben statt ganz unten auf der Seite'],
      ['info', 'Server: pinn-rezepte.js ersetzt (Ausschnitt für öffentliche Rezepte, zusätzliche unbeschnittene Miniatur für Rezeptbilder)'],
    ],
  },
  {
    v: '0.96', datum: '03.10.2026', titel: 'Glocke aufgeräumt & Feinschliff',
    punkte: [
      ['info', 'Glocke: Meldungen derselben Person zur selben Sache am selben Tag erscheinen als ein Hinweis – z. B. mehrere Heimwege an einem Tag (mit den weiteren Uhrzeiten darunter) oder mehrmals Artikel auf derselben Liste; der Link zum Versions-Log ist aus der Glocke entfernt (weiter unter Einstellungen → Updates)'],
      ['fix', 'Einstellungen am PC/iPad: nach dem Auf- und Zuklappen einer Einstellung sind die beiden Spalten wieder gleichmäßig verteilt – jede Karte bleibt in ihrer Spalte; Datums- und Zeitfelder in Popups (z. B. Ausgabe) auf dem iPhone nicht mehr gequetscht und ohne Überlappung mit dem Nachbarfeld'],
    ],
  },
  {
    v: '0.95', datum: '03.10.2026', titel: 'Glocke: Familie & Alle löschen',
    punkte: [
      ['neu', 'Neu in der Familie: unter der 🔔 Glocke erscheint, was die anderen eintragen – neue Artikel auf Einkaufslisten, neue Listen und Einträge (Packen, Checklisten, Ideen, eigene Wünsche), geplante Essen, neue Rezepte, Aufgaben und Termine; Antippen öffnet die passende Seite. Mehrere Änderungen werden zusammengefasst („Anna hat 5 Artikel auf Rewe gesetzt“), Geschenkelisten und private Listen erscheinen nie'],
      ['neu', '„Alle löschen“ oben in der Glocke: die Karten gleiten nacheinander nach links hinaus, bis die Liste leer ist'],
      ['fix', 'Wischen zum Entfernen klappt jetzt zuverlässig – ein kurzer Schubs reicht, die Liste scrollt dabei nicht mehr mit; ein langer Familienname schiebt die Glocke nicht mehr aus dem Bild (der Name läuft dahinter weiter)'],
      ['info', 'Server: neu hinweise.pb.js und pinn-hinweise.js (Sammlung „hinweise“ legt sich selbst an); ersetzt save_family_data.pb.js, aufgaben.pb.js und create_calendar_event.pb.js'],
    ],
  },
  {
    v: '0.94', datum: '03.10.2026', titel: 'SOS & Ankunft nicht mehr doppelt',
    punkte: [
      ['fix', 'Ein Hilferuf kommt nur noch einmal an: kam die Meldung gleichzeitig über Traccar Client und die Traccar-Prüfung, wiederholte das Handy sie bei schlechtem Netz oder reichte sie später nach, entstand teils ein zweiter Alarm bzw. das SOS-Popup ging erneut auf – auch nach der Entwarnung'],
      ['fix', '„Ist zu Hause angekommen“ kommt nur noch einmal: keine zweite Meldung nach der Heimweg-Ankunft, ungenaue Standorte im Haus lösen kein „verlassen“ und erneutes „angekommen“ mehr aus, gleiche Meldung frühestens nach 10 Minuten wieder'],
      ['fix', 'Banner: das × entfernt alles auf einmal (laufende Heimwege und Ankünfte), angesehene Ankünfte verschwinden beim Schließen des Popups, die Ankunfts-Nachricht öffnet das Popup direkt'],
      ['info', 'Server: pinn-ortung.js ersetzt (Sperre gegen gleichzeitiges Speichern, Zeitplan läuft nie doppelt)'],
    ],
  },
  {
    v: '0.93', datum: '03.10.2026', titel: 'Hinweise wegwischen',
    punkte: [
      ['neu', 'Hinweise unter der 🔔 Glocke lassen sich entfernen: auf dem Handy die Karte einfach zur Seite wischen, am Computer über das × oben rechts an jeder Karte'],
      ['info', 'Neuerungen und Heimwege verschwinden nur auf diesem Gerät; ein offener Einkauf wird nach kurzer Rückfrage ohne Beträge abgeschlossen (wie „Ohne Beträge“)'],
      ['info', 'Ein weggewischter laufender Heimweg erscheint wieder, sobald die Person angekommen ist'],
    ],
  },
  {
    v: '0.92', datum: '03.10.2026', titel: 'SOS-Knopf auf dem Heimweg',
    punkte: [
      ['neu', 'Wer „Ich bin unterwegs nach Hause“ nutzt, hat im eigenen Heimweg-Popup einen großen roten SOS-Knopf: Antippen startet einen 3-Sekunden-Countdown (nochmal tippen bricht ab), dann geht derselbe Alarm an die ganze Familie wie aus „Traccar Client“ – mit Standort, Adresse und Uhrzeit, danach öffnet sich das SOS-Popup'],
      ['info', 'Standort kommt aus Traccar; ist der Standort für pinn. im Browser schon erlaubt, wird zusätzlich der aktuelle Handy-Standort mitgeschickt (keine neue Rückfrage). Klappt das Senden nicht, bietet pinn. direkt den Anruf bei 110 an'],
      ['info', 'Server: pinn-ortung.js und ortung.pb.js ersetzt (neue Route /api/pinn/ortung/sos-ausloesen)'],
    ],
  },
  {
    v: '0.91', datum: '03.10.2026', titel: 'Läden mit mehreren Adressen',
    punkte: [
      ['neu', 'Ein Laden kann mehrere Adressen bekommen (z. B. zwei Rewe-Märkte): unter Listen → Liste bearbeiten „+ Weitere Adresse (Filiale)“ – bis zu 10 Filialen je Einkaufsliste, jede einzeln entfernbar'],
      ['info', 'Der geplante Einkauf wird abgehakt, sobald jemand eine Weile in irgendeiner Filiale war; Erinnerung und Push gelten für alle Filialen gemeinsam. Unter Familie → 📍 Orte erscheint jede Filiale einzeln (Umkreis je Filiale einstellbar)'],
      ['info', 'Server: pinn-ortung.js und ortung.pb.js ersetzt (neue Route /api/pinn/ortung/laden)'],
    ],
  },
  {
    v: '0.90', datum: '03.10.2026', titel: 'Heimweg-Hinweis',
    punkte: [
      ['neu', '„Ich bin unterwegs nach Hause“: oben erscheint für die ganze Familie ein Hinweis – antippen öffnet ein Popup mit Karte, aktuellem Standort, Adresse, Uhrzeit und Entfernung bis Zuhause; Anrufen oder Nachricht je Person, auch wenn mehrere gleichzeitig unterwegs sind'],
      ['neu', 'Wer selbst unterwegs ist, bekommt den Hinweis ebenfalls – mit den Handynummern der Familie (und den eigenen Notfallkontakten), Notruf 110 und „Heimweg beenden“; 110/112 für die anderen gibt es erst bei einem SOS'],
      ['neu', '„Schließen“ lässt den Hinweis stehen, das × entfernt ihn; über die 🔔 Glocke sind laufende und gerade beendete Heimwege jederzeit aufrufbar. Beim Ankommen zeigt der Hinweis kurz „ist zu Hause angekommen“'],
      ['info', 'Server: pinn-ortung.js und ortung.pb.js ersetzt (Heimwege kommen mit der SOS-Abfrage, Push-Nachricht öffnet direkt das Popup)'],
    ],
  },
  {
    v: '0.89', datum: '03.10.2026', titel: 'SOS-Hilferuf',
    punkte: [
      ['neu', 'SOS aus der App „Traccar Client“ (bzw. vom SOS-Knopf eines GPS-Trackers): sofort Push an alle Familienmitglieder – bleibt stehen, bis jemand reagiert, und vibriert lang; die Person selbst bekommt eine Bestätigung'],
      ['neu', 'Warn-Popup in pinn. mit aktuellem Standort auf der Karte (Kreis = Genauigkeit), Adresse, Uhrzeit und Genauigkeit in Klammern – aktualisiert sich alle 5 Sekunden; Knöpfe zum Anrufen der Person sowie 110 und 112, Navigation und „Adresse kopieren“'],
      ['neu', 'Entwarnung für alle per Knopf (mit Push), roter Hinweis oben, solange ein SOS läuft; Person und Kartenmarke unter Familie rot markiert'],
      ['neu', 'Notfallpass: Feld „Eigene Handynummer“ (bei Tieren Nummer am Tracker) für den Anruf aus dem SOS-Popup'],
      ['info', 'Server: pinn-ortung.js, ortung.pb.js (neue Routen /api/pinn/ortung/sos und /sos-ende) und sw.pb.js ersetzt; der Hilferuf kommt auch an, wenn Traccar gerade nicht läuft'],
      ['fix', '0.89.1: SOS wird jetzt in jeder Form erkannt, die Traccar Client schickt (auch verschachtelt oder als Text verpackt), zusätzlich über den Alarm an der letzten Position in Traccar; unter ⚙︎ Ortung „SOS-Test an mich“ und „Letzte Meldungen der Handys“ (zeigt, ob der SOS ankam)'],
    ],
  },
  {
    v: '0.88', datum: '02.10.2026', titel: 'App-Badge',
    punkte: [
      ['neu', 'Zahl am App-Symbol: zeigt deine offenen Aufgaben, die bis jetzt fällig sind – jede neue oder dir zugewiesene Aufgabe +1, Abhaken −1; Aufgaben mit Zeitfenster zählen erst ab Beginn'],
      ['info', 'Bei geschlossener App aktualisiert sich die Zahl mit jeder Push-Meldung (Server liefert die Zahl mit); beim Abmelden verschwindet sie. iPhone/iPad: nur in der Home-Bildschirm-App mit erlaubten Mitteilungen'],
    ],
  },
  {
    v: '0.87', datum: '02.10.2026', titel: 'Läden mit Adresse & Glocke',
    punkte: [
      ['neu', 'Einkaufslisten bekommen eine Adresse: unter Listen → Liste bearbeiten den Laden suchen (Vorschläge schon beim Tippen) – er erscheint unter Familie → 📍 Orte als eigener Bereich „Läden“ und auf der Karte'],
      ['neu', 'Wer mit geteiltem Standort eine einstellbare Zeit im Laden ist (Standard 10 Minuten), dem hakt pinn. den geplanten Einkauf („Einkauf planen“) automatisch ab – bei mehreren Läden, sobald alle besucht sind'],
      ['neu', 'Push je Laden wählbar: „Betrag eintragen“ nach dem Abhaken, Erinnerung an die Einkaufsliste beim Ankommen (nur wenn dort ein Einkauf geplant ist) und Meldung an die Familie bei Ankunft'],
      ['neu', 'Glocke rechts neben dem Familiennamen: Einkäufe, deren Ausgaben noch fehlen, lassen sich dort nachträglich eintragen oder ohne Beträge abschließen; dazu die Neuerungen jeder neuen Version'],
      ['info', 'Beim nächsten Öffnen der App (und nach längerer Pause) erscheint ein Hinweis, solange Ausgaben eines erledigten Einkaufs fehlen – auch wenn das Buchungs-Popup einfach geschlossen wurde'],
      ['info', 'Server: pinn-ortung.js und ortung.pb.js ersetzt (Läden, Verweildauer, neue Route /api/pinn/ortung/einkaeufe); Adressen werden ohne Verbindung vorgemerkt und nachgereicht'],
    ],
  },
  {
    v: '0.86', datum: '02.10.2026', titel: 'Pinnwand: Zettel verschieben',
    punkte: [
      ['neu', 'Zettel auf der Pinnwand frei umhängen wie die Apps am iPhone: lange auf einen Zettel drücken (oder oben „Anordnen“), alle Zettel wackeln, ziehen und loslassen – die anderen weichen live aus; Tipp auf eine freie Stelle oder „Fertig“ beendet'],
      ['info', 'Gespeichert wird nur die Reihenfolge – jedes Gerät verteilt die Zettel selbst auf seine Spalten (Handy 2, iPad 3–4, Computer mehr), daher keine Lücken oder Überlappungen; die Reihenfolge ist für die ganze Familie gleich und klappt auch offline'],
      ['info', 'Neue Zettel erscheinen weiterhin oben, Angeheftete bleiben ganz oben; wichtige Zettel rutschen nicht mehr automatisch nach vorn'],
      ['info', 'Menü: „Familie“ steht jetzt bei Kalender und Aufgaben'],
    ],
  },
  {
    v: '0.85', datum: '02.10.2026', titel: 'Einstellungen & Konto im neuen Look',
    punkte: [
      ['info', 'Einstellungen und Konto im selben Aufbau wie die übrigen Seiten: Kopfzeile oben, darunter Karten mit Symbol und kurzer Beschreibung – im Querformat am iPad zweispaltig'],
      ['neu', 'Konto: Kopfkarte mit Profilbild, Name und Familie; Benachrichtigungen, Dashboard-PIN, Dashboard-Gerät und (für Admins) Profile, Gäste-Menüs, Dashboard-Hintergrund und -Geräte als eigene Karten'],
      ['info', 'Synchronisierung, Updates und Daten zu einem Abschnitt „System“ zusammengefasst'],
      ['info', 'Feiertage & Schulferien von Zuhause nach Einstellungen → Kalender verschoben – ohne festgelegtes Zuhause erscheint dort ein Hinweis mit Knopf „Zuhause angeben“'],
      ['info', 'Seitenleiste (Hamburger-Menü) scrollt, wenn das Fenster zu niedrig ist – Konto, Einstellungen und Suche bleiben unten stehen; das aufgezogene Menüband am Handy scrollt ebenfalls'],
    ],
  },
  {
    v: '0.84', datum: '02.10.2026', titel: 'Zuhause statt ständiger Standortabfrage',
    punkte: [
      ['neu', 'Einstellungen → Zuhause (je Familie, auf dem NAS gespeichert): Adresse eintippen mit Vorschlägen schon beim Tippen oder einmalig „Aktuellen Standort übernehmen“ – nur dann fragt das Handy nach dem Standort'],
      ['info', 'pinn. fragt beim Start nicht mehr nach dem Standort: Das Wetter kommt nur noch vom Zuhause der Familie, abgerufen über den eigenen Server; Adresssuche ebenfalls über den Server, die App spricht keine fremden Server mehr an'],
      ['neu', 'Kalender: gesetzliche Feiertage und Schulferien eures Bundeslands (aus der Adresse erkannt, änderbar), je einzeln abschaltbar; Feiertage auch offline'],
      ['neu', 'Sonnenauf- und -untergang in der Wetter-Kachel und auf der Kinderseite; „Abends“ kann auf Wunsch schon mit dem Sonnenuntergang beginnen, wenn es früher dunkel wird'],
      ['info', 'Familie/Ortung: Ort „Zuhause“ entsteht automatisch mit Push bei Ankunft und Verlassen und folgt der Adresse aus den Einstellungen; die Karte startet zentriert auf Zuhause'],
      ['info', 'Server: neue Dateien pb_hooks/zuhause.pb.js und pinn-zuhause.js, pinn-ortung.js erweitert'],
    ],
  },
  {
    v: '0.83', datum: '01.10.2026', titel: 'Familie: Notfallpass & Ortung',
    punkte: [
      ['neu', 'Neuer Menüpunkt „Familie“ (unter Fahrzeuge): alle Mitglieder mit Bild und Namen, dahinter je ein Notfallpass – Blutgruppe, Allergien, Medikamente, Krankenkasse, Hausarzt, Notfallkontakte zum Antippen, 112-Knopf; für Haustiere mit Chipnummer und Tierarzt; offline lesbar'],
      ['neu', 'Ortung über Traccar auf dem NAS (neuer Container): Handys mit der App „Traccar Client“ (iPhone und Android, auch im Hintergrund) und GPS-Tracker, z. B. für den Hund'],
      ['neu', 'Eine gemeinsame Karte für alle: Live-Standorte blinken rot, Personen ein-/ausblenden, verfolgen, Spur der letzten Stunden, Akkustand, Adresse und Navigation'],
      ['neu', 'Bekannte Orte (Zuhause, Schule …) mit Push bei Ankunft oder Verlassen; „Ich bin unterwegs nach Hause“ benachrichtigt die Familie und endet beim Ankommen automatisch'],
      ['info', 'Standort teilen kann jeder für sich ein- und ausschalten; Geräte und Einrichtungsanleitung verwalten die Admins unter ⚙︎ Ortung. Gäste sehen nur die Notfallpässe'],
      ['info', 'Die Karte zeichnet pinn. selbst – Kacheln und Adresssuche laufen über den eigenen Server'],
    ],
  },
  {
    v: '0.82', datum: '01.10.2026', titel: 'Kalender-Ansichten, Aufgaben & Kindersicherung',
    punkte: [
      ['fix', 'Woche, Monat und Jahr im Kalender wieder da – die Monatsansicht brach bei Terminen ohne Uhrzeit ab, am Handy war der Umschalter ausgeblendet'],
      ['info', 'Kalender am Handy: statt der Pfeile ein Umschalter Tag | Woche | Monat | Jahr; vor und zurück per Wischen – jetzt in jeder Ansicht'],
      ['neu', 'Woche am Handy als Tagesliste untereinander, Monat mit farbigen Termin-Punkten, Jahr kompakter'],
      ['info', 'Geburtstage-Einstellungen liegen jetzt unter Einstellungen → Kalender'],
      ['neu', 'Geburtstage in der Übersicht wie am iPhone nach links wischen zum Ausblenden (am Computer ×); unter Einstellungen → Kalender wieder einblenden'],
      ['info', 'Wetter-Kacheln kleiner – am Handy 3 Tage, am iPad und Computer die ganze Woche'],
      ['info', 'Aufgaben und Haushalt zusammengelegt: ein Menüpunkt „Aufgaben“ mit Umschalter oben; Haushalt-Favoriten werden automatisch umgestellt'],
      ['neu', 'Kindersicherung je Familienmitglied (Einstellungen → Familienmitglieder): kein Löschen, kein Zugriff auf Finanzen, Dokumente, Fahrzeuge und Kündigungsfristen'],
    ],
  },
  {
    v: '0.81', datum: '01.10.2026', titel: 'Listen: Packen, Geschenke, Wünsche & mehr',
    punkte: [
      ['info', 'Menüpunkt „Einkauf“ heißt jetzt „Listen“ – oben ein Umschalter: Einkauf (wie bisher), Packen, Geschenke, Wünsche, Checklisten und Ideen'],
      ['neu', 'Packlisten aus Vorlagen: Sommer-, Winter- & Skiurlaub, Wochenende, Camping, Krankenhaus, Kliniktasche zur Geburt, Party, Kindergeburtstag, Wickeltasche, Wandern, Schwimmbad, Geschäftsreise – Kleidung & Co. pro Person, Anzahl nach Reisetagen, Haus-Check vor der Abfahrt'],
      ['neu', 'Packliste: Filter je Person, Fortschrittsbalken, Countdown bis zur Abreise, Gepacktes ausblenden, Haken zurücksetzen zum Wiederverwenden; was fehlt, mit „🛒 Fehlt – einkaufen“ direkt auf eine Einkaufsliste'],
      ['neu', 'Geschenke: Ideen je Empfänger mit Preis, Link und Stand (Idee → besorgt → verpackt → verschenkt), Summen, Vorlagen für Weihnachten, Ostern, Muttertag u. a. und für anstehende Geburtstage; auf Wunsch nur für dich sichtbar'],
      ['neu', 'Wunschzettel je Familienmitglied: die anderen reservieren, was sie besorgen – wer sich etwas wünscht, sieht das nicht; eigene Reservierungen erscheinen unter Geschenke'],
      ['neu', 'Checklisten (Umzug, Baby-Erstausstattung, Schulstart, Haus-Check, Weihnachtsvorbereitung) und Ideenlisten (Ausflüge, Filme, Bücher, Restaurants …); jede Liste lässt sich als eigene Vorlage speichern'],
      ['info', 'Alles liegt im Familien-Datensatz auf dem NAS, funktioniert offline und wird nachgereicht; mehrere Zeilen einfügen legt mehrere Einträge an; die Suche findet auch Listen und Einträge'],
    ],
  },
  {
    v: '0.80', datum: '01.10.2026', titel: 'Rezepte mit KI (Google Gemini)',
    punkte: [
      ['neu', 'Rezept-Popup: Haken „✨ Mit KI auswerten“ – Text, Fotos (auch mehrere Screenshots) und PDFs werden von Google Gemini gelesen und sauber in Titel, Zutaten („200 g Spaghetti“), Zubereitung, Portionen und Zeiten sortiert; Kategorien und Küchengeräte werden passend aus den eigenen vorgeschlagen'],
      ['neu', 'Rezept-Links: Adresse einer Rezeptseite ins Textfeld einfügen – der Server lädt die Seite, die KI übernimmt das Rezept samt Bild; fremdsprachige Rezepte werden übersetzt, cups/oz/°F umgerechnet'],
      ['info', 'Die App spricht nur mit dem eigenen Server, der Schlüssel liegt nur dort (.env: PINN_GEMINI_KEY, optional PINN_GEMINI_MODELL); ohne Schlüssel, ohne Verbindung oder bei Fehlern wertet pinn. wie bisher selbst auf dem Gerät aus; Haken wird je Gerät gemerkt'],
      ['fix', '0.80.1: Hinweis „Zutat ohne Mengenangabe“ erscheint nicht mehr bei Zutaten, die üblicherweise ohne Menge stehen (Salz, Pfeffer, „nach Belieben“, „zum Braten“ …); Zwischenüberschriften wie „Für die Marinade“ werden auch ohne Doppelpunkt erkannt'],
      ['fix', '0.80.2: Rezept-Links zeigen bei Problemen den echten Grund (z. B. Gemini ausgelastet, Kontingent aufgebraucht, Seite blockt, Haken aus) statt eines allgemeinen Hinweises; der Server versucht es bei ausgelastetem Gemini automatisch erneut bzw. mit dem nächsten Modell und lädt blockierte Rezeptseiten ein zweites Mal'],
    ],
  },
  {
    v: '0.79', datum: '01.10.2026', titel: 'Geburtstage aus Google-Kontakten',
    punkte: [
      ['neu', 'Geburtstage kommen jetzt auch aus den Google-Kontakten (Android) – über dasselbe Google-Konto wie der Kalender, zusammen mit den iCloud-Kontakten in einer Liste; doppelte Personen erscheinen nur einmal'],
      ['info', 'Die Google-Anmeldung fragt zusätzlich nach Lesezugriff auf die Kontakte (nur Name und Geburtstag werden übernommen); bereits verbundene Konten einmal „Neu verbinden“, im Google-Cloud-Projekt die „People API“ aktivieren'],
      ['info', 'Einstellungen → Übersicht zeigt, wie viele Geburtstage aus iCloud und aus Google stammen; schlägt eine Quelle fehl, bleibt ihr letzter Stand erhalten; nach Verbinden/Trennen eines Kontos wird sofort neu abgeglichen'],
    ],
  },
  {
    v: '0.78', datum: '01.10.2026', titel: 'Google-Kalender für Android',
    punkte: [
      ['neu', 'Kalender von Android-Handys: unter Einstellungen → Kalender → Bearbeiten „Mit Google verbinden“ – jede Familie mit ihrem eigenen Google-Konto, zusätzlich zu oder statt iCloud'],
      ['neu', 'Google-Kalender stehen mit „(Google)“ in derselben Kalenderliste: auswählen, Farbe vergeben, Termine anlegen, bearbeiten und löschen – mit Wiederholung, Erinnerung, Zuweisung und Push wie bei iCloud, auch offline vorgemerkt'],
      ['neu', 'Termine lassen sich beim Bearbeiten auch zwischen iCloud- und Google-Kalendern verschieben'],
      ['info', 'Anmeldung direkt bei Google, gespeichert wird nur ein verschlüsselter Zugangsschlüssel in der gesperrten Server-Sammlung „google_zugaenge“; einmalige Server-Einrichtung über PINN_GOOGLE_CLIENT_ID / PINN_GOOGLE_CLIENT_SECRET in der .env'],
      ['info', 'Texte wie „In iCloud anlegen“ heißen jetzt neutral „Im Kalender anlegen“; Familienübersicht des Hauptadmins zeigt auch verbundene Google-Kalender'],
    ],
  },
  {
    v: '0.77', datum: '01.10.2026', titel: 'Globale Suche',
    punkte: [
      ['neu', 'Lupe im Menü unten neben Konto und Einstellungen: öffnet unten eine Suchleiste wie beim Einkauf – schon beim Tippen erscheinen Vorschläge, der beste direkt über dem Feld'],
      ['neu', 'Durchsucht Menüpunkte, Einstellungen, Termine, Aufgaben, Rezepte (auch nach Zutaten), Einkaufslisten und -artikel, Vorrat, Pinnwand, Dokumente, Verträge, Buchungen, Fahrzeuge, Räume, Familienmitglieder und Geburtstage'],
      ['neu', 'Antippen öffnet direkt die passende Seite mit dem Eintrag – Termin im Tageskalender, Rezept, Vertrag, Dokument usw.; Gäste finden nur, was sie sehen dürfen'],
      ['info', 'Groß-/Kleinschreibung und Umlaute egal, mehrere Wörter möglich; am Computer Strg/⌘ + K, Pfeiltasten und Enter'],
    ],
  },
  {
    v: '0.76', datum: '01.10.2026', titel: 'Fahrzeugdokumente in Dokumente',
    punkte: [
      ['neu', 'Am Fahrzeug hochgeladene Dokumente landen automatisch unter „Dokumente“ in der passenden Kategorie (Auto & Fahrzeuge, Kaufbelege, Versicherungen, Steuern) – Titel, Halter, Datum, Aussteller, Kennzeichen/FIN/HSN/TSN, km-Stand, Kaufdatum, Preis, Gewährleistung, nächste HU und Erinnerung sind schon ausgefüllt'],
      ['neu', 'Verknüpfung in beide Richtungen: im Dokument-Popup unter „Fahrzeug“ zuordnen (auch mehrere), im Dokument „beim Fahrzeug öffnen“, beim Fahrzeug „In Dokumente ›“; Suche findet Dokumente auch über Fahrzeugname und Kennzeichen'],
      ['neu', 'PDFs erkennen das Fahrzeug am Kennzeichen oder an der FIN; HU-Bericht trägt die nächste HU am Fahrzeug ein, Kaufvertrag ergänzt fehlendes Kaufdatum und Kaufpreis'],
      ['neu', 'Neue Dokumentarten am Fahrzeug: Versicherungsschein/eVB (Versicherungskennzeichen mit Ablauf Ende Februar) und Kfz-Steuerbescheid'],
      ['info', 'Fahrzeugdokumente lassen sich jetzt auch offline ablegen; ältere Fahrzeugdokumente aus Finanzen werden automatisch nach „Dokumente“ übernommen'],
    ],
  },
  {
    v: '0.75', datum: '30.09.2026', titel: 'Fahrzeuge',
    punkte: [
      ['neu', 'Neuer Menüpunkt „Fahrzeuge“ (ganz unten): Autos, Motorräder, Wohnmobile, Anhänger, E-Scooter, E-Bikes und Fahrräder – mit Kennzeichen, Farbe, Halter, Kauf, Wert und Fahrzeugdaten (FIN, HSN/TSN)'],
      ['neu', 'Alle Antriebe: Benzin, Diesel (mit AdBlue), Hybrid, Plug-in-Hybrid, Elektro, Autogas (LPG), Erdgas (CNG) und Wasserstoff'],
      ['neu', 'Verlauf: Tanken, Laden (zuhause/öffentlich/Arbeit), Wartung, Reparatur, Reifen, HU, Pflege, Parken & Maut, Zubehör, km-Stand – Menge × Preis wird automatisch gerechnet, auf Wunsch gleich als Ausgabe in Finanzen gebucht, Belege als Foto oder PDF'],
      ['neu', 'Verbrauch nach der Volltank-Methode mit Diagramm, Energiekosten je 100 km, Vollkosten je km, Kosten pro Monat und hochgerechnete Fahrleistung'],
      ['neu', 'Versicherung, Leasing & Co. aus Finanzen → Verträge einem Fahrzeug zuordnen (auch direkt im Vertrag); Kfz-Steuer als jährliche Buchung; Fahrzeugdokumente hochladen oder aus „Dokumente“ verknüpfen'],
      ['neu', 'Bilanz: alle Kosten nach Jahr, 12 Monaten oder gesamt – aufgeteilt nach Energie, Werkstatt, Reifen, Versicherung, Steuer und Wertverlust, mit Monatsbalken, Fahrzeugvergleich und CO₂'],
      ['neu', 'Hinweise für HU/TÜV, Inspektion (Zeit und km), Reifenwechsel „von O bis O“, Profiltiefe, Reifenalter, Versicherungskennzeichen und eigene Fristen – mit automatischen Aufgaben für die zuständige Person; „Erledigt“ trägt die nächste Frist ein und hakt die Aufgabe ab'],
      ['neu', 'Rechner: Fahrtkosten pro Person, Elektro oder Verbrenner, lohnt sich Autogas, Rad statt Auto und Umweg zur günstigeren Tankstelle'],
      ['info', 'Offline-fähig und für Gastkonten gesperrt; auf dem Server wird pinn-finanzen.js ersetzt (Zuordnung „fahrzeug:“ bei Ausgaben)'],
      ['fix', '0.75.1: HU-Termin, nächste HU und Erstzulassung als zwei Zahlenfelder Monat / Jahr mit festem Schrägstrich – bequem mit der Nummern-Tastatur, Cursor springt automatisch ins Jahr'],
    ],
  },
  {
    v: '0.74', datum: '29.09.2026', titel: 'Rezept vom Foto',
    punkte: [
      ['neu', 'Rezepte: „Foto einlesen“ im Rezept-Popup – Kochbuch, Zeitschrift, Rezeptkarte oder Screenshot fotografieren; Titel, Zutaten, Zubereitung, Portionen und Zeiten werden erkannt, bis zu 6 Fotos für mehrseitige Rezepte'],
      ['info', 'Texterkennung läuft komplett auf dem Gerät (Tesseract, selbst gehostet unter pb_public/vendor/tesseract/), Fotos verlassen das Gerät nicht'],
      ['fix', '0.74.1: Foto-Auswertung deutlich verbessert – Screenshots in beliebiger Reihenfolge, Überlappungen werden erkannt, Statusleiste/Webadresse/„Merken“-Bereich ignoriert, Überschriften wie „Anleitungen“ und Zwischenüberschriften („Für die Brühe“) erkannt, Mengen wie „4.5-6“ bleiben erhalten'],
      ['fix', '0.74.2: PDF-Import nutzt dieselbe verbesserte Auswertung (Kopf-/Fußzeilen je Seite nur einmal); eingescannte PDFs ohne Text werden jetzt per Texterkennung gelesen'],
    ],
  },
  {
    v: '0.73', datum: '29.09.2026', titel: 'Gekocht-Button',
    punkte: [
      ['neu', 'Essen „Diese Woche geplant“: Häkchen oben links im Bild markiert eine Mahlzeit nach Rückfrage „schon gekocht?“ – sie verschwindet dann aus dem Slider, bleibt aber im Kalender; wird sie verschoben, taucht sie wieder auf'],
    ],
  },
  {
    v: '0.72', datum: '29.09.2026', titel: 'Pinnwand',
    punkte: [
      ['neu', 'Neuer Menüpunkt „Pinnwand“ direkt unter der Übersicht: Zettel der Familie im Kork-Look – Notiz, abhakbare Liste, Foto, Umfrage, Dankeschön und Countdown („noch 12 Tage bis zum Urlaub“)'],
      ['neu', 'Schnell-Zettel oben auf der Pinnwand; Zettel für bestimmte Personen („für dich“ zum Abhaken), anheften, als wichtig markieren, Farbe wählen, Erinnerung per Push und automatisch abnehmen (Archiv, nach 30 Tagen gelöscht)'],
      ['neu', 'Reaktionen mit Emojis, Antworten wie im Chat, Abstimmen mit Balken und Gesichtern, „NEU“-Markierung und Zähler im Menü; Fotos geschützt auf dem NAS, offline vorgemerkt und später hochgeladen'],
      ['neu', 'Push-Nachrichten nach Bedarf (Einstellungen → Benachrichtigungen → Pinnwand): Zettel an mich, alle neuen Zettel, Antworten/Reaktionen, Erinnerungen'],
      ['neu', 'Übersicht-Kachel „Pinnwand“ mit den wichtigsten Zetteln, sobald etwas angepinnt ist; für Gäste über „Menüs für Gäste“ ausblendbar'],
      ['fix', 'Dokumente-Menü samt Funktionen und Verknüpfungen (0.70) sowie das automatische Auslesen von PDFs bei Dokumenten, Belegen und Rezepten (0.71) waren beim Pinnwand-Update verloren gegangen – jetzt wieder vollständig dabei'],
    ],
  },
  {
    v: '0.71', datum: '29.09.2026', titel: 'PDFs automatisch auslesen',
    punkte: [
      ['neu', 'Dokumente: Rechnung als PDF hinzufügen füllt leere Felder automatisch – Titel, Kategorie, Datum, Händler/Aussteller, Kaufdatum, Preis, Gewährleistung, Herstellergarantie, „gültig bis“ und die Rechnungsnummer als Notiz'],
      ['neu', 'Finanzen: PDF-Beleg an einer neuen Ausgabe übernimmt Betrag, Beschreibung, Datum und Laden'],
      ['neu', 'Rezepte: „PDF einlesen“ im Rezept-Popup erkennt Titel, Zutaten, Zubereitung, Portionen sowie Vorbereitungs- und Kochzeit'],
      ['info', 'Nutzt denselben PDF-Leser wie der Depot-Import, alles läuft auf dem Gerät; eingescannte PDFs ohne Textebene lassen sich nicht auslesen'],
    ],
  },
  {
    v: '0.70', datum: '29.09.2026', titel: 'Dokumente',
    punkte: [
      ['neu', 'Neuer Menüpunkt „Dokumente“ (unter Finanzen): Arztbriefe, Kaufbelege, Ausweise, Policen, Zeugnisse … als Foto oder PDF ablegen – bis zu 20 Seiten je Dokument, direkt mit der Kamera oder aus den Dateien'],
      ['neu', 'Kategorien wie Gesundheit, Kaufbelege & Garantie, Ausweise & Urkunden, Versicherungen, Wohnen, Auto, Steuern & Behörden, Schule & Zeugnisse u. v. m. – direkt auf der Seite verwaltbar (Regler-Symbol); Filter nach Kategorie und Person, Suche, Sortierung nach Kategorie, Datum oder A–Z'],
      ['neu', 'Kauf & Garantie: Kaufdatum, Preis und Händler; die gesetzliche Gewährleistung (2 Jahre) wird automatisch eingetragen, Herstellergarantie wählbar – für Gewährleistungsansprüche immer griffbereit'],
      ['neu', 'Ablaufdaten (Ausweis, Pass, Führerschein, TÜV, Impfung …) mit Push-Erinnerung 7 bis 90 Tage vorher; oben „Fristen im Blick“, sobald etwas ansteht'],
      ['neu', 'Seiten im Vollbild ansehen und durchwischen, Dokument teilen (z. B. an Versicherung oder Arzt); Vertragsdokumente und Belege aus Finanzen über den Filter „Aus Finanzen“'],
      ['info', 'Funktioniert auch offline: neue Dokumente samt Fotos werden auf dem Gerät vorgehalten und automatisch hochgeladen; für Gastkonten gesperrt; neue Server-Dateien dokumente.pb.js und pinn-dokumente.js'],
    ],
  },
  {
    v: '0.69', datum: '29.09.2026', titel: 'Verträge',
    punkte: [
      ['neu', 'Finanzen → Verträge: alle Verträge der Familie an einem Ort – Versicherungen, Strom, Internet, Handy, Streaming, Fitnessstudio … mit Anbieter, Inhaber, Kunden- und Vertragsnummer, Kontakt und Notiz'],
      ['neu', 'Kosten mit Rhythmus (wöchentlich bis jährlich) werden automatisch als regelmäßige Ausgabe gebucht und zählen im Budget; bestehende regelmäßige Ausgaben lassen sich als Vertrag übernehmen, Preisänderungen mit „ab wann?“'],
      ['neu', 'Laufzeit, Verlängerung und Kündigungsfrist: pinn. berechnet, bis wann gekündigt werden muss – mit Push-Erinnerung (7 bis 90 Tage vorher, optional nochmal 3 Tage vorher) an ausgewählte Erwachsene und eigener Erinnerung'],
      ['neu', 'Kündigen mit fertigem Kündigungsschreiben (kopieren oder per E-Mail); nach der Kündigung endet die Abbuchung automatisch zum Vertragsende'],
      ['neu', 'Dokumente zu Verträgen (Vertrag, Rechnung, Kündigung, Bestätigung …) und Belege zu einzelnen Ausgaben – als PDF oder Foto, geschützt auf dem NAS'],
      ['neu', 'Vertrags-Kategorien direkt auf der Seite verwalten (Regler-Symbol), Filter nach Status, Kategorie, Fälligkeit und Suche; Übersicht-Kachel „Kündigungsfristen“, sobald etwas ansteht'],
    ],
  },
  {
    v: '0.68', datum: '28.09.2026', titel: 'Budget aus Einnahmen & Sparraten',
    punkte: [
      ['neu', 'Haushaltsbudget = Summe der Einnahmen im Zeitraum (regelmäßige wie das Gehalt zählen schon vor der Buchung), in den Finanz-Einstellungen pro Monat um einen festen Betrag erhöh- oder verringerbar'],
      ['neu', 'Sparrate direkt an der Position (z. B. am ETF): Betrag, Rhythmus und Ausführungstag – wird dann im Depot angerechnet und in den Ausgaben unter „Sparen“ abgebucht; laufende Sparrate auf der Positions-Karte sichtbar'],
      ['neu', 'Geänderter Betrag einer Sparrate oder regelmäßigen Buchung gilt standardmäßig ab heute – mit Abfrage, ob rückwirkend ab einem Datum oder für alle bisherigen Buchungen'],
      ['fix', 'Aus einer Ausgabe eine Einnahme gemacht (oder umgekehrt): bei regelmäßigen Buchungen wurden bisherige Buchungen nicht mit umgerechnet – jetzt ist „für alle“ vorausgewählt'],
    ],
  },
  {
    v: '0.67', datum: '28.09.2026', titel: 'Depots & Junior-Depots',
    punkte: [
      ['neu', 'Sparen mit mehreren Depots: oben die Gesamtübersicht, darunter jedes Depot als Karte mit Wert, Gewinn/Verlust und kleinem Verlauf – antippen öffnet das Depot mit allen gewohnten Daten'],
      ['neu', 'Junior-Depots für Kinder mit Zuordnung zum Kind; je Depot Name, Symbol, Farbe und Bank/Broker'],
      ['neu', 'Positionen je Depot: ETF, Aktie, Fonds, Derivat/Zertifikat, Anleihe, sonstiges Wertpapier (Kurs über die ISIN) oder klassisches Sparziel'],
      ['neu', 'Buchungen der Kategorie „Sparen“: erst Depot, dann Position wählen; Depot-Import landet im gewählten Depot'],
      ['info', 'Welche Depots in die Gesamtübersicht einfließen, entscheidet jedes Profil selbst („Auswahl“) – gilt auf allen Geräten'],
      ['info', 'Bisherige Sparziele und ETFs liegen im Hauptdepot „Depot“ (umbenennbar); Server-Datei pinn-finanzen.js aktualisiert'],
    ],
  },
  {
    v: '0.66', datum: '28.09.2026', titel: 'Kategorien direkt auf den Seiten',
    punkte: [
      ['info', 'Kategorien aus den Einstellungen auf die jeweilige Seite umgezogen: Regler-Symbol oben rechts wie beim Vorrat – Rezept-Kategorien & Küchengeräte auf der Rezepte-Seite, Haushalt-Kategorien auf der Haushalt-Seite'],
      ['neu', 'Einträge direkt umbenennen, ein-/ausschalten und löschen; verwendete Einträge werden vorher verschoben'],
      ['neu', 'Rezepte: Suche, Favoriten-Schalter und Dropdowns für Sortierung, Kategorie und Küchengerät'],
      ['neu', 'Haushalt: Dropdown-Filter nach Raum und Kategorie (inkl. Mülleimer)'],
      ['fix', 'Menü: Die Seite wird beim Öffnen der Seitenleiste nicht mehr gestaucht, sondern nach rechts aus dem Bild geschoben'],
    ],
  },
  {
    v: '0.65', datum: '28.09.2026', titel: 'Persönliche Übersicht, Wetter & Geburtstage',
    punkte: [
      ['neu', 'Übersicht persönlich anpassbar (Einstellungen → Übersicht): Reihenfolge der Kacheln per Pfeil, jede Kachel ein- oder ausblendbar – gilt je Profil auf allen Geräten'],
      ['neu', 'Kachel „Wetter“: Vorschau für heute und die nächsten zwei Tage mit Höchst-/Tiefstwert und Regenwahrscheinlichkeit, auch offline mit dem letzten Stand'],
      ['neu', 'Kachel „Geburtstage“: anstehende Geburtstage aus den iCloud-Kontakten der Familie (gleiche Apple-ID wie der Kalender), mit Alter und Tagen bis zum Geburtstag'],
      ['neu', 'Geburtstage wahlweise für 7, 14, 30 oder 60 Tage; Kachel auf Wunsch nur sichtbar, wenn tatsächlich ein Geburtstag ansteht'],
      ['info', 'Kontakte werden einmal täglich nachts abgeglichen, dazu auf Knopfdruck; gespeichert werden nur Name und Geburtsdatum'],
      ['info', 'Im Querformat steht der Kalender je nach Reihenfolge links oder rechts, die übrigen Kacheln daneben untereinander'],
    ],
  },
  {
    v: '0.64', datum: '28.09.2026', titel: 'Favoriten, persönliches Design, PDF-Import',
    punkte: [
      ['neu', 'Rezepte per Herz im Rezeptbild favorisieren – in der Liste, auf der Detailseite und bei öffentlichen Rezepten; Favoriten gelten je Familie'],
      ['neu', 'Fester Filter „Favoriten“ in der Rezeptliste, kombinierbar mit den Kategorien'],
      ['info', 'Neue Rezepte sind standardmäßig öffentlich geteilt (Haken lässt sich entfernen)'],
      ['neu', 'Versions-Log als Retro-Terminal unter Einstellungen → Updates, mit Befehlen und Schnellbefehlen; Tipp auf die Versionsnummer in der Seitenleiste öffnet es direkt'],
      ['info', 'Design (Farben, Dunkelmodus, Standard-Ansichten) gilt jetzt je Profil und wird geräteübergreifend gespeichert'],
      ['neu', 'Depot-Import liest jetzt auch PDF-Dateien (z. B. ING-Depotumsätze)'],
      ['info', 'Kein Code mehr von fremden Servern: Tailwind, PocketBase-Client und pdf.js kommen aus pb_public/vendor/'],
      ['info', 'Startprüfung: fehlt eine Datei in vendor/, zeigt pinn. einen Hinweis statt einer leeren Seite'],
    ],
  },
  {
    v: '0.57 – 0.63', rueckblick: true, titel: 'Vorrat & smarter Einkauf',
    punkte: [
      ['neu', 'Neuer Bereich „Vorrat“: Kategorien, Lagerorte, Filter und Mindestbestand – fällt ein Artikel darunter, landet er automatisch auf der Einkaufsliste'],
      ['neu', 'Vorrats-Artikel können auf mehreren Läden-Listen stehen; einmal abgehakt, verschwinden sie überall'],
      ['neu', '„Einkauf planen“: Aufgabe mit Auswahl der Läden, beim Abhaken Betrag je Laden → direkt in Finanzen gebucht'],
      ['neu', 'Gekaufte Vorrats-Artikel werden zurückgebucht; nicht Gekauftes bleibt auf der Liste („Alles eingekauft?“)'],
      ['neu', 'Stammladen: Zutaten der Essensplanung landen manuell, gespiegelt oder direkt auf dieser Liste'],
      ['neu', 'Sonderlisten: Zutaten mit Stichwörtern (z. B. Hack) gehen auf eine andere Liste, etwa zur Metzgerei'],
      ['fix', 'Diverse kleine Korrekturen und Layout-Verbesserungen'],
    ],
  },
  {
    v: '0.51 – 0.56', rueckblick: true, titel: 'Sparen, Taschengeld & ETFs',
    punkte: [
      ['neu', 'Finanzen mit Umschalter Ausgaben / Sparen / Taschengeld und wiederkehrenden Buchungen (wöchentlich bis jährlich)'],
      ['neu', 'Taschengeld optional auf der Kinderseite anzeigbar'],
      ['neu', 'ETF-Depot: aktuelle Kurse, Wertentwicklung aus den Einzahlungen, Import von Depot-Umsätzen'],
      ['fix', 'Kleinere Fehlerbehebungen rund um Finanzen und Import'],
    ],
  },
  {
    v: '0.45 – 0.50', rueckblick: true, titel: 'Offline, Dashboard & Gäste',
    punkte: [
      ['neu', 'Offline-Modus: Aufgaben und Termine auch ohne Verbindung anlegen – wird später automatisch nachgetragen'],
      ['neu', 'iPad-Dashboard mit den Profilen der Familie, optional mit PIN; Kinderprofil öffnet direkt die Aufgaben'],
      ['neu', 'Gastkonto: Finanzen & Einstellungen gesperrt, weitere Menüs vom Admin ausblendbar'],
      ['fix', 'Stabilitäts- und Sync-Verbesserungen'],
    ],
  },
  {
    v: '0.39 – 0.44', rueckblick: true, titel: 'Finanzen & Kinderseite',
    punkte: [
      ['neu', 'Neuer Bereich „Finanzen“: Kategorien, Haushaltsbudget, Balkendiagramm und Auswertung nach Woche/Monat/Jahr'],
      ['neu', 'Einkauf abschließen mit Betrag statt nur Artikel zu löschen'],
      ['neu', 'Animierte Kinderseite: Tagesaufgaben passend zur Tageszeit zum Abhaken, täglicher Neustart'],
      ['fix', 'Diverse Kleinigkeiten und Bugfixes'],
    ],
  },
  {
    v: '0.33 – 0.38', rueckblick: true, titel: 'Mehrere Familien',
    punkte: [
      ['neu', 'pinn. unterstützt mehrere Familien – angelegt vom Hauptadmin, je Familie eigene Admins'],
      ['neu', 'Anmeldung: Familie wählen (auf dem Gerät gemerkt), dann Name und Passwort'],
      ['neu', 'Rezepte familienübergreifend teilen per Haken „öffentlich“'],
      ['neu', 'Eigener iCloud-Kalender je Familie, Zugangsdaten geschützt auf dem Server'],
      ['fix', 'Kleinere Korrekturen'],
    ],
  },
  {
    v: '0.27 – 0.32', rueckblick: true, titel: 'Aufgaben auf dem NAS & persönliche Push',
    punkte: [
      ['neu', 'Aufgaben liegen direkt auf dem NAS statt im Apple-Kalender; Erledigtes wird nach spätestens 2 Tagen aufgeräumt'],
      ['neu', 'Familienmitglieder sind mit Benutzern verknüpft'],
      ['neu', 'Push-Benachrichtigungen persönlich je Benutzer'],
      ['fix', 'Diverse Bugfixes'],
    ],
  },
  {
    v: '0.21 – 0.26', rueckblick: true, titel: 'Login, HTTPS & Push',
    punkte: [
      ['neu', 'Anmeldung mit Profilen und Benutzernamen, „Angemeldet bleiben“, Passwort ändern, Abmelden'],
      ['neu', 'HTTPS-Zugang über Caddy und DuckDNS'],
      ['neu', 'Push-Benachrichtigungen'],
      ['fix', 'Kleinere Fehlerbehebungen'],
    ],
  },
  {
    v: '0.16 – 0.20', rueckblick: true, titel: 'Performance & Stabilität',
    punkte: [
      ['info', 'Rezeptbilder als eigene Dateien mit Vorschaubildern statt im Familien-Datensatz'],
      ['fix', 'Kalender-Sync deutlich CPU-schonender, kein Sync mehr beim Serverstart'],
      ['fix', 'Keine Neustart-Schleifen des Servers mehr'],
    ],
  },
  {
    v: '0.11 – 0.15', rueckblick: true, titel: 'Haushalt & Design',
    punkte: [
      ['neu', 'Bereich „Haushalt“: Raum-Reinigungen erzeugen automatisch Aufgaben'],
      ['neu', 'Design-Einstellungen: eigene Farben, Dunkelmodus, bis zu 4 Favoriten im Menü'],
      ['fix', 'Kleinigkeiten und Bugfixes'],
    ],
  },
  {
    v: '0.6 – 0.10', rueckblick: true, titel: 'Einkauf & Aufgaben',
    punkte: [
      ['neu', 'Einkaufsliste aus den geplanten Rezepten eines Zeitraums'],
      ['neu', 'Aufgaben über einen eigenen Aufgaben-Kalender'],
      ['neu', 'Update-Erkennung mit Hinweis-Banner'],
    ],
  },
  {
    v: '0.1 – 0.5', rueckblick: true, titel: 'Der Anfang',
    punkte: [
      ['neu', 'pinn. entsteht: Kalender mit iCloud-Sync, Essensplanung und Rezepte'],
      ['info', 'Selbst gehostet mit PocketBase auf dem NAS, als Web-App für den Home-Bildschirm'],
    ],
  },
];

const changelogTerm = {
  run: 0,          // Run number: closing/restarting cancels old animations
  fast: false,     // true = skip the animation
  history: [],
  histPos: 0,
  inited: false,
  booting: false,
  bootPromise: null,
};

function termEsc(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function termUserName() {
  try {
    const u = currentUser();
    const n = (u && (u.username || u.name)) || 'gast';
    return String(n).toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9äöüß._-]/g, '') || 'gast';
  } catch (e) { return 'gast'; }
}
function termPromptHtml() {
  return `<span class="t-prompt-user">${termEsc(termUserName())}@pinn</span><span class="t-dim">:</span><span class="t-prompt-path">~/changelog</span><span class="t-dim">$</span>`;
}
function termScreen() { return document.getElementById('changelogTermScreen'); }
function termScrollDown() { const s = termScreen(); if (s) s.scrollTop = s.scrollHeight; }
function termSleep(ms, runId) {
  if (changelogTerm.fast || ms <= 0) return Promise.resolve(runId === changelogTerm.run);
  return new Promise(res => setTimeout(() => res(runId === changelogTerm.run), ms));
}
function termLine(html, cls) {
  const div = document.createElement('div');
  div.className = 't-line' + (cls ? ' ' + cls : '');
  div.innerHTML = html == null ? '' : html;
  termScreen().appendChild(div);
  termScrollDown();
  return div;
}
async function termType(el, text, runId, speed) {
  for (let i = 0; i < text.length; i++) {
    if (runId !== changelogTerm.run) return false;
    if (changelogTerm.fast) { el.textContent += text.slice(i); break; }
    el.textContent += text[i];
    termScrollDown();
    await termSleep(speed || 28, runId);
  }
  return runId === changelogTerm.run;
}
// "Type" a command with prompt
async function termEcho(cmd, runId, animate) {
  const line = termLine(termPromptHtml() + ' <span class="t-white"></span>');
  const target = line.querySelector('.t-white');
  if (animate) return termType(target, cmd, runId, 38);
  target.textContent = cmd;
  return true;
}

function termEntryNodes(e) {
  const nodes = [];
  const head = document.createElement('div');
  head.className = 't-ver';
  head.innerHTML = `<span class="t-ver-num${e.rueckblick ? ' retro' : ''}">v${termEsc(e.v)}</span><span class="t-ver-rule"></span><span class="t-ver-date">${e.rueckblick ? 'rückblick' : termEsc(e.datum || '')}</span>`;
  nodes.push(head);
  const title = document.createElement('div');
  title.className = 't-ver-title';
  title.textContent = '» ' + e.titel;
  nodes.push(title);
  const sym = { neu: '+', fix: '*', info: '~' };
  e.punkte.forEach(([typ, text]) => {
    const it = document.createElement('div');
    it.className = 't-item';
    it.innerHTML = `<span class="t-sym ${typ}">${sym[typ] || '-'}</span><span>${termEsc(text)}</span>`;
    nodes.push(it);
  });
  return nodes;
}
async function termPrintEntries(entries, runId) {
  for (const e of entries) {
    for (const n of termEntryNodes(e)) {
      if (runId !== changelogTerm.run) return false;
      termScreen().appendChild(n);
      termScrollDown();
      if (!(await termSleep(45, runId))) return false;
    }
  }
  return true;
}
function termFindEntry(q) {
  const s = String(q || '').trim().replace(/^v/i, '');
  if (!s) return null;
  const toNum = x => { const m = String(x).match(/^(\d+)\.(\d+)/); return m ? [Number(m[1]), Number(m[2])] : null; };
  const n = toNum(s);
  if (!n) return null;
  return PINN_CHANGELOG.find(e => {
    const parts = e.v.split('–').map(x => toNum(x.trim())).filter(Boolean);
    if (!parts.length) return false;
    const lo = parts[0], hi = parts[parts.length - 1];
    const val = n[0] * 1000 + n[1];
    return val >= lo[0] * 1000 + lo[1] && val <= hi[0] * 1000 + hi[1];
  }) || null;
}

async function termBoot() {
  changelogTerm.booting = true;
  try { await termBootSequence(); } finally { changelogTerm.booting = false; }
}
async function termBootSequence() {
  const runId = ++changelogTerm.run;
  const skip = document.getElementById('changelogTermSkip');
  if (skip) skip.style.display = changelogTerm.fast ? 'none' : '';
  termScreen().innerHTML = '';

  const boot = [
    ['<span class="t-dim">pinn. BIOS v' + termEsc(APP_VERSION) + ' · (c) familie</span>', 90],
    ['<span class="t-dim">speichertest ........ </span><span class="t-ok">OK</span>', 110],
    ['<span class="t-dim">verbinde mit nas ..... </span><span class="t-ok">OK</span>', 110],
    ['<span class="t-dim">pocketbase ........... </span><span class="t-ok">OK</span>', 110],
  ];
  for (const [html, ms] of boot) {
    termLine(html);
    if (!(await termSleep(ms, runId))) return;
  }
  // Progress bar
  const bar = termLine('');
  const total = 20;
  for (let i = 0; i <= total; i++) {
    if (runId !== changelogTerm.run) return;
    bar.innerHTML = `<span class="t-dim">lade changelog </span><span class="t-bar">[${'█'.repeat(i)}${'░'.repeat(total - i)}]</span> <span class="t-amber">${Math.round(i / total * 100)}%</span>`;
    if (!(await termSleep(22, runId))) return;
  }
  termLine('<span class="t-ok">[ OK ]</span> <span class="t-dim">' + PINN_CHANGELOG.length + ' einträge gefunden</span>');
  termLine('');
  if (!(await termSleep(150, runId))) return;
  if (!(await termEcho('cat CHANGELOG', runId, true))) return;
  if (!(await termSleep(180, runId))) return;
  termLine('');
  if (!(await termPrintEntries(PINN_CHANGELOG, runId))) return;
  termLine('');
  termLine('<span class="t-dim">legende: </span><span class="t-sym neu">+</span><span class="t-dim"> neu  </span><span class="t-sym info">~</span><span class="t-dim"> geändert  </span><span class="t-sym fix">*</span><span class="t-dim"> behoben</span>');
  termLine('<span class="t-dim">einträge mit „rückblick“ fassen die versionen vor dem log zusammen.</span>');
  termLine('<span class="t-dim">tippe </span><span class="t-cyan">help</span><span class="t-dim"> für befehle.</span>');
  termLine('');
  termBootDone();
}
function termBootDone() {
  changelogTerm.fast = true;
  const skip = document.getElementById('changelogTermSkip');
  if (skip) skip.style.display = 'none';
}

const TERM_HELP = [
  ['help', 'diese hilfe'],
  ['neueste', 'aktuellste version anzeigen'],
  ['liste', 'alle versionen kurz auflisten'],
  ['log', 'komplettes changelog'],
  ['v 0.xx', 'eine bestimmte version anzeigen'],
  ['neofetch', 'systeminfo'],
  ['whoami / date', 'wer & wann'],
  ['clear', 'bildschirm leeren'],
  ['exit', 'terminal schließen'],
];

async function termRun(raw) {
  const cmdLine = String(raw || '').trim();
  // If the boot sequence is still running: finish it instantly, then run the command
  if (changelogTerm.booting && changelogTerm.bootPromise) {
    changelogTerm.fast = true;
    await changelogTerm.bootPromise;
  }
  termBootDone();
  const runId = ++changelogTerm.run;
  await termEcho(cmdLine, runId, false);
  if (!cmdLine) return;
  const [cmd, ...args] = cmdLine.split(/\s+/);
  const c = cmd.toLowerCase();
  const arg = args.join(' ');

  if (c === 'help' || c === 'hilfe' || c === '?') {
    termLine('<span class="t-white t-bold">verfügbare befehle</span>');
    TERM_HELP.forEach(([k, d]) => termLine(`  <span class="t-cyan">${termEsc(k.padEnd(14, ' '))}</span><span class="t-dim">${termEsc(d)}</span>`));
  } else if (c === 'neueste' || c === 'latest' || c === 'neu') {
    await termPrintEntries([PINN_CHANGELOG[0]], runId);
  } else if (c === 'liste' || c === 'ls' || c === 'list') {
    PINN_CHANGELOG.forEach(e => termLine(`<span class="${e.rueckblick ? 't-dim' : 't-amber'}">v${termEsc(e.v).padEnd(12, ' ')}</span><span class="t-white">${termEsc(e.titel)}</span>`));
  } else if (c === 'log' || c === 'cat' || c === 'changelog') {
    await termPrintEntries(PINN_CHANGELOG, runId);
  } else if (c === 'v' || c === 'version' || c === 'show' || /^v?\d+\.\d+/.test(c)) {
    const q = /^v?\d+\.\d+/.test(c) ? c : arg;
    if (!q) { termLine(`<span class="t-dim">installiert: </span><span class="t-amber">v${termEsc(APP_VERSION)}</span>`); }
    else {
      const e = termFindEntry(q);
      if (e) await termPrintEntries([e], runId);
      else termLine(`<span class="t-red">version „${termEsc(q)}“ nicht gefunden.</span> <span class="t-dim">tippe</span> <span class="t-cyan">liste</span>`);
    }
  } else if (c === 'clear' || c === 'cls') {
    termScreen().innerHTML = '';
    return;
  } else if (c === 'exit' || c === 'quit' || c === 'q' || c === 'logout') {
    termLine('<span class="t-dim">logout</span>');
    setTimeout(closeChangelogTerminal, 250);
    return;
  } else if (c === 'whoami') {
    termLine(`<span class="t-white">${termEsc(termUserName())}</span>`);
  } else if (c === 'date') {
    termLine(`<span class="t-white">${termEsc(new Date().toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span>`);
  } else if (c === 'neofetch') {
    termLine([
      '       _                ',
      ' _ __ (_)_ __  _ __     ',
      "| '_ \\| | '_ \\| '_ \\    ",
      '| |_) | | | | | | | |_  ',
      '| .__/|_|_| |_|_| |_(_) ',
      '|_|                     ',
    ].map(termEsc).join('\n'), 't-ascii t-ok');
    const online = navigator.onLine ? '<span class="t-ok">online</span>' : '<span class="t-amber">offline</span>';
    const info = [
      ['os', 'pinn. v' + APP_VERSION],
      ['host', location.host || 'lokal'],
      ['backend', 'PocketBase @ NAS'],
      ['user', termUserName()],
      ['versionen', String(PINN_CHANGELOG.length) + ' einträge'],
      ['auflösung', `${window.innerWidth}×${window.innerHeight}`],
    ];
    info.forEach(([k, v]) => termLine(`<span class="t-cyan t-bold">${termEsc(k.padEnd(10, ' '))}</span><span class="t-white">${termEsc(v)}</span>`));
    termLine(`<span class="t-cyan t-bold">${'netz'.padEnd(10, ' ')}</span>${online}`);
  } else if (c === 'sudo') {
    termLine('<span class="t-red">netter versuch.</span> <span class="t-dim">dieser vorfall wird der familie gemeldet.</span>');
  } else if (c === 'echo') {
    termLine(`<span class="t-white">${termEsc(arg)}</span>`);
  } else if (c === 'hallo' || c === 'hi' || c === 'hello') {
    termLine(`<span class="t-white">hallo ${termEsc(termUserName())} 👋</span>`);
  } else if (c === 'rm') {
    termLine('<span class="t-red">zugriff verweigert.</span> <span class="t-dim">die geschichte bleibt, wie sie ist.</span>');
  } else {
    termLine(`<span class="t-red">befehl nicht gefunden: ${termEsc(cmd)}</span> <span class="t-dim">– tippe</span> <span class="t-cyan">help</span>`);
  }
  termLine('');
}

function initChangelogTerminal() {
  if (changelogTerm.inited) return;
  changelogTerm.inited = true;
  const input = document.getElementById('changelogTermInput');
  const screen = termScreen();
  document.getElementById('changelogTermClose').addEventListener('click', closeChangelogTerminal);
  document.getElementById('changelogTermDot').addEventListener('click', closeChangelogTerminal);
  // Tapping the screen skips the boot animation
  screen.addEventListener('click', () => { if (!changelogTerm.fast) changelogTerm.fast = true; });
  document.getElementById('changelogTermChips').addEventListener('click', (ev) => {
    const b = ev.target.closest('.term-chip');
    if (!b) return;
    termRun(b.dataset.cmd);
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const val = input.value;
      input.value = '';
      if (val.trim()) { changelogTerm.history.push(val.trim()); }
      changelogTerm.histPos = changelogTerm.history.length;
      termRun(val);
    } else if (ev.key === 'ArrowUp') {
      if (!changelogTerm.history.length) return;
      ev.preventDefault();
      changelogTerm.histPos = Math.max(0, changelogTerm.histPos - 1);
      input.value = changelogTerm.history[changelogTerm.histPos] || '';
    } else if (ev.key === 'ArrowDown') {
      if (!changelogTerm.history.length) return;
      ev.preventDefault();
      changelogTerm.histPos = Math.min(changelogTerm.history.length, changelogTerm.histPos + 1);
      input.value = changelogTerm.history[changelogTerm.histPos] || '';
    }
  });
  // Keep the end of the log visible when the keyboard opens/closes
  input.addEventListener('focus', () => [100, 350, 700].forEach(ms => setTimeout(termScrollDown, ms)));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => {
    if (!document.getElementById('changelogTerminal').classList.contains('hidden')) termScrollDown();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !document.getElementById('changelogTerminal').classList.contains('hidden')) closeChangelogTerminal();
  });
}

function openChangelogTerminal() {
  initChangelogTerminal();
  const overlay = document.getElementById('changelogTerminal');
  document.getElementById('changelogTermPrompt').innerHTML = `<span class="t-prompt-user">${termEsc(termUserName())}@pinn</span><span class="t-dim">$</span>`;
  document.getElementById('changelogTermTitle').textContent = `${termUserName()}@pinn: ~/changelog`;
  overlay.classList.remove('hidden', 'term-off');
  void overlay.offsetWidth; // Restart the animation
  overlay.classList.add('term-on');
  changelogTerm.histPos = changelogTerm.history.length;
  // Small delay so the boot sequence starts after the switch-on effect
  changelogTerm.fast = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const delay = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 380;
  changelogTerm.booting = true;
  changelogTerm.bootPromise = new Promise(res => setTimeout(() => termBoot().then(res, res), delay));
}
function closeChangelogTerminal() {
  const overlay = document.getElementById('changelogTerminal');
  if (!overlay || overlay.classList.contains('hidden')) return;
  changelogTerm.run++; // Stop running animations
  const input = document.getElementById('changelogTermInput');
  if (input) { input.value = ''; input.blur(); }
  overlay.classList.remove('term-on');
  overlay.classList.add('term-off');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('term-off');
    termScreen().innerHTML = '';
  }, reduce ? 0 : 320);
}

document.getElementById('openChangelogBtn').addEventListener('click', openChangelogTerminal);
(function () {
  const sideBtn = document.getElementById('sidebarVersionBtn');
  if (!sideBtn) return;
  sideBtn.addEventListener('click', openChangelogTerminal);
  sideBtn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openChangelogTerminal(); } });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('versionslog');
