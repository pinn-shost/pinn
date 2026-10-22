# pinn. 1.107.0

## English

### New language: Italian

- pinn. is now available in **Italian**. Choose it under *Settings → Language*. The whole app is translated, including the weekly and monthly preview, the shopping hint (“Going shopping?”), the flat-share wording and the export button.
- Not yet in Italian: the setup assistant, the data export files and the push messages from the server. They show English for now (before this version, push messages for a language the server did not know came in German).
- For contributors: a new check for language files, `.github/scripts/check-lang.js`. It is part of `check-all.js` and of the GitHub checks and finds invalid or missing placeholders, missing texts and language files that call `PINN_I18N.load` more than once (the app only uses the first call). A second tool, `.github/scripts/translate.js` (GitHub workflow “Translate”, needs the repository secret `ANTHROPIC_API_KEY`), translates a new language with the Claude API and checks the result.

### What changed

- App: `index.html`, `js/sprachen.js` (language list, flat-share terms), `js/ausblick.js`, `js/einrichten.js`, `js/exportieren.js`, `js/hinweise.js`, `js/versionslog.js`, new `lang/it.js`, language files `lang/en.js`, `lang/fr.js`, `lang/es.js` (texts of the new version log entry).
- Server: `pb_hooks/pinn-pushtext.js`, `pinn-ausblick.js`, `pinn-familie-geburtstag.js`, `pinn-haustiere.js`, `pinn-ortung.js`, `pinn-sprache.js`, `pinn-wobistdu.js` (a profile language without server texts now gets English instead of German).
- Repository: `.github/scripts/check-lang.js`, `.github/scripts/translate.js`, `.github/scripts/check-all.js`, `.github/workflows/check.yml`, `.github/workflows/translate.yml`, `.github/CONTRIBUTING.md`, `README.md`, `README.fr.md`, `README.es.md`.

### Update

Install as usual: unzip the release, then `sudo sh pinn-*/pinn-setup.sh` on the NAS, or use the update button (*Settings → System → Backups & updates*). Nothing changes in the data. Afterwards open *Settings → Language* and pick **Italiano**.

---

## Deutsch

### Neue Sprache: Italienisch

- pinn. gibt es jetzt auch auf **Italienisch**. Auswählen unter *Einstellungen → Sprache*. Die ganze App ist übersetzt, auch die Wochen- und Monatsvorschau, der Laden-Hinweis („Gehst du einkaufen?“), die WG-Bezeichnungen und der Export-Knopf.
- Noch nicht auf Italienisch: der Einrichtungsassistent, die Dateien des Datenexports und die Push-Nachrichten vom Server. Dort erscheint vorerst Englisch (bisher kamen Push-Nachrichten in einer Sprache, die der Server nicht kennt, auf Deutsch).
- Für Mitwirkende: eine neue Prüfung für Sprachdateien, `.github/scripts/check-lang.js`. Sie gehört zu `check-all.js` und zu den GitHub-Prüfungen und findet ungültige oder fehlende Platzhalter, fehlende Texte und Sprachdateien, die `PINN_I18N.load` mehrfach aufrufen (die App nutzt nur den ersten Aufruf). Ein zweites Werkzeug, `.github/scripts/translate.js` (GitHub-Workflow „Translate“, braucht das Repository-Secret `ANTHROPIC_API_KEY`), übersetzt eine neue Sprache mit der Claude-API und prüft das Ergebnis.

### Was sich geändert hat

- App: `index.html`, `js/sprachen.js` (Sprachliste, WG-Begriffe), `js/ausblick.js`, `js/einrichten.js`, `js/exportieren.js`, `js/hinweise.js`, `js/versionslog.js`, neu `lang/it.js`, Sprachdateien `lang/en.js`, `lang/fr.js`, `lang/es.js` (Texte des neuen Versions-Log-Eintrags).
- Server: `pb_hooks/pinn-pushtext.js`, `pinn-ausblick.js`, `pinn-familie-geburtstag.js`, `pinn-haustiere.js`, `pinn-ortung.js`, `pinn-sprache.js`, `pinn-wobistdu.js` (ein Profil mit einer Sprache ohne Server-Texte bekommt jetzt Englisch statt Deutsch).
- Repository: `.github/scripts/check-lang.js`, `.github/scripts/translate.js`, `.github/scripts/check-all.js`, `.github/workflows/check.yml`, `.github/workflows/translate.yml`, `.github/CONTRIBUTING.md`, `README.md`, `README.fr.md`, `README.es.md`.

### Update

Wie gewohnt einspielen: Release entpacken, dann auf dem NAS `sudo sh pinn-*/pinn-setup.sh` oder den Update-Knopf nehmen (*Einstellungen → System → Sicherungen & Updates*). An den Daten ändert sich nichts. Danach unter *Einstellungen → Sprache* **Italiano** wählen.
