# Contributing to pinn.

## 🇬🇧 English

Thank you for helping! Bug reports, ideas, translations and code are all welcome.

- **Bugs and ideas:** open an issue. For bugs please add your pinn. version (Settings → Updates), the device and browser, what happened, what you expected and the steps to get there.
- **Security problems:** please do **not** open a public issue – report them privately as described in [SECURITY.md](SECURITY.md).
- **Questions and feedback:** Discussions are the right place.

### How the code is organised

pinn. has **no bundler and no npm dependencies**. The repository looks exactly like an installation on the NAS:

| Folder / file | What it is |
|---|---|
| `pb_public/index.html` | The app page – **built** from `src/`, do not edit it by hand |
| `src/` | Sources of the page: `rahmen.html` (frame), `teile/` (screens, pages, popups), `version.txt`, `build.js` – see [src/README.md](../src/README.md) |
| `pb_public/js/` | App code as plain `<script>` files (no modules) |
| `pb_public/css/` | Stylesheets |
| `pb_public/lang/` | Translations (`en.js`, `fr.js`, `es.js`, `it.js`, `pt.js`, `zh.js`) – the app texts themselves are German |
| `pb_hooks/` | Server: PocketBase hooks (`*.pb.js`) and their shared modules (`pinn-*.js`) |
| `pinn-setup.sh`, `pinn-wartung.sh` | Installation/update and the maintenance container (POSIX `sh`) |
| `.github/` | GitHub Actions (`workflows/check.yml`), the checks (`scripts/`), this file, images |

### Rules that matter here

1. **One global scope.** All files in `pb_public/js/` and the inline scripts of `index.html` share one global scope, in the order of the `<script src>` lines in `src/rahmen.html`. A top-level `let`/`const`/`class` name may exist only once in the whole page, and a file may only use other files' names *at load time* if those files load earlier.
2. **New app file** `pb_public/js/<name>.js` (or `css/<name>.css`) needs: its line in `src/rahmen.html`, its name in `pinn-setup.sh` (function `ziel`), and for JavaScript at the end `(window.PINN_PARTS = window.PINN_PARTS || []).push('<name>');` (the start check uses it). Avoid names containing *push*, *ad*, *track* or *analytics* – ad blockers block such files. If you **rename or remove** an app file, also add its old path to `OBSOLET` in `pinn-setup.sh`, so that updates tidy it up on the NAS (it is moved to `_alt/`, not deleted).
3. **HTML** is changed in `src/`, then `node src/build.js`. Keep element IDs – the scripts use them.
4. **Hooks** are named with a dot (`example.pb.js`, not `example_pb.js`). Shared code goes into a module that is not a `*.pb.js` and is loaded with ``require(`${__hooks}/pinn-example.js`)``.
5. **Comments in English.** App texts stay German and are translated at runtime – add new texts to `pb_public/lang/en.js`, `fr.js`, `es.js` and `it.js` as well (`node .github/scripts/check-lang.js` checks placeholders and completeness).
6. **Input fields:** the page must move up when the on-screen keyboard appears (see `js/tastatur.js`).
7. **Child lock:** the editor functions `openTaskModal`, `openEditTaskModal`, `openAddEventModal`, `openMealModal`, `openPinboardEditor` and `openKidRoutineEditor` are wrapped after loading – never hand them over directly at load time (`addEventListener('click', openTaskModal)`), always call them inside a function (`() => openTaskModal()`).
8. The **version number** and the version log (`js/versionslog.js`) are maintained by the maintainer when a release is made – please leave them as they are in pull requests.

### Checks

Every push and pull request runs [`workflows/check.yml`](workflows/check.yml). Run the same checks on your computer before opening a pull request (Node.js 18 or newer, nothing to install):

```sh
node src/build.js                      # after changing anything in src/
node .github/scripts/check-all.js      # all checks
node .github/scripts/check-all.js ~/pocketbase   # … plus the PocketBase smoke test (path of a PocketBase program)
```

| Check | What it finds |
|---|---|
| `node src/build.js --check` | `pb_public/index.html` does not match `src/` (forgot to build, or edited the built file) |
| `check-syntax.js` | Syntax errors in app files, language files, hooks, inline scripts, JSON and shell scripts (`sh -n`) |
| `check-lint.js` | Missing registration, files that are never loaded, global names declared twice, hook files named with `_`, `require()` of hook modules that do not exist, merge conflict markers |
| `check-hooks.js` | Runs every hook in a sandbox that stands in for PocketBase: hooks that fail while loading, routes or cron jobs registered twice, invalid cron schedules, top-level declarations in `*.pb.js` (handlers cannot see them), functions used from a `pinn-*.js` module that it does not export, unit tests of the update check. `--list` prints all routes |
| `smoke-pocketbase.js` | Second job on GitHub: starts a real PocketBase (version from `docker-compose.yaml`) with an empty database and sends a request to every route – fails if PocketBase does not start, the app page is missing or a protected route answers 404; public routes that need a configuration or the internet only give a warning |
| `check-lang.js` | Language files (`pb_public/lang/`): placeholders such as `{0}`, `{1|s}`, `{2|x=a|b}` must be valid and match the English text, every text of `en.js` must exist, and the file must call `PINN_I18N.load` exactly once. New languages can be created with the `translate.js` tool or the GitHub workflow “Translate” (needs the secret `ANTHROPIC_API_KEY`) |
| `check-setup.js` | The clean-up list `OBSOLET` of `pinn-setup.sh`: fails if it names a file that is still part of the repository, still loaded by the app or not a plain path below `pb_public/` or `pb_hooks/`; runs the shell block in a temporary folder to prove it moves only the listed files |

A known, intended exception is listed at the top of `check-lint.js` (`KNOWN_DUPLICATE_FUNCTIONS`). The checks cannot sign in or use real data – please also try your change in a real installation and say in the pull request how you tested it.

### Pull requests

1. Fork the repository and create a branch.
2. Make your change – small, focused pull requests are easier to review.
3. Build (`node src/build.js`) and run `node .github/scripts/check-all.js`.
4. Describe what you changed and how you tested it; add a screenshot for visible changes.

By contributing you agree that your contribution is published under the [license](../LICENSE) of this project.

---

## 🇩🇪 Deutsch

Danke fürs Mithelfen! Fehlerberichte, Ideen, Übersetzungen und Code sind gleichermaßen willkommen.

- **Fehler und Ideen:** ein Issue anlegen. Bei Fehlern bitte die pinn.-Version (Einstellungen → Updates), Gerät und Browser, was passiert ist, was passieren sollte und die Schritte dorthin angeben.
- **Sicherheitsprobleme:** bitte **kein** öffentliches Issue – vertraulich melden, wie in [SECURITY.md](SECURITY.md) beschrieben.
- **Fragen und Feedback:** gern in den Discussions.

### Aufbau des Codes

pinn. hat **keinen Bundler und keine npm-Abhängigkeiten**. Das Repository sieht genauso aus wie eine Installation auf dem NAS:

| Ordner / Datei | Was es ist |
|---|---|
| `pb_public/index.html` | Die App-Seite – wird aus `src/` **gebaut**, nicht von Hand ändern |
| `src/` | Quellen der Seite: `rahmen.html` (Rahmen), `teile/` (Bildschirme, Seiten, Popups), `version.txt`, `build.js` – siehe [src/README.md](../src/README.md) |
| `pb_public/js/` | App-Code als einfache `<script>`-Dateien (keine Module) |
| `pb_public/css/` | Gestaltung |
| `pb_public/lang/` | Übersetzungen (`en.js`, `fr.js`, `es.js`, `it.js`, `pt.js`, `zh.js`) – die App-Texte selbst sind deutsch |
| `pb_hooks/` | Server: PocketBase-Hooks (`*.pb.js`) und gemeinsame Module (`pinn-*.js`) |
| `pinn-setup.sh`, `pinn-wartung.sh` | Installation/Update und der Wartungs-Container (POSIX-`sh`) |
| `.github/` | GitHub Actions (`workflows/check.yml`), die Prüfungen (`scripts/`), diese Datei, Bilder |

### Regeln, auf die es ankommt

1. **Ein gemeinsamer globaler Bereich.** Alle Dateien in `pb_public/js/` und die Inline-Skripte der `index.html` teilen sich einen globalen Bereich, in der Reihenfolge der `<script src>`-Zeilen in `src/rahmen.html`. Ein `let`/`const`/`class`-Name auf oberster Ebene darf es auf der ganzen Seite nur einmal geben, und eine Datei darf Namen anderer Dateien *beim Laden* nur benutzen, wenn diese vorher laden.
2. **Neue App-Datei** `pb_public/js/<name>.js` (oder `css/<name>.css`) braucht: ihre Zeile in `src/rahmen.html`, ihren Namen in `pinn-setup.sh` (Funktion `ziel`) und bei JavaScript am Ende `(window.PINN_PARTS = window.PINN_PARTS || []).push('<name>');` (darauf baut die Startprüfung). Namen mit *push*, *ad*, *track* oder *analytics* vermeiden – Werbeblocker sperren solche Dateien. Wird eine App-Datei **umbenannt oder entfernt**, ihren alten Pfad auch in `OBSOLET` in `pinn-setup.sh` eintragen, damit Updates sie auf dem NAS aufräumen (sie wird nach `_alt/` verschoben, nicht gelöscht).
3. **HTML** wird in `src/` geändert, danach `node src/build.js`. Element-IDs beibehalten – die Skripte nutzen sie.
4. **Hooks** werden mit Punkt benannt (`beispiel.pb.js`, nicht `beispiel_pb.js`). Gemeinsamer Code kommt in ein Modul, das kein `*.pb.js` ist, und wird mit ``require(`${__hooks}/pinn-beispiel.js`)`` geladen.
5. **Kommentare auf Englisch.** App-Texte bleiben deutsch und werden zur Laufzeit übersetzt – neue Texte auch in `pb_public/lang/en.js`, `fr.js`, `es.js` und `it.js` eintragen (`node .github/scripts/check-lang.js` prüft Platzhalter und Vollständigkeit).
6. **Eingabefelder:** Die Seite muss hochrutschen, wenn die Bildschirmtastatur erscheint (siehe `js/tastatur.js`).
7. **Kindersicherung:** Die Editor-Funktionen `openTaskModal`, `openEditTaskModal`, `openAddEventModal`, `openMealModal`, `openPinboardEditor` und `openKidRoutineEditor` werden nach dem Laden abgesichert – nie beim Laden direkt weiterreichen (`addEventListener('click', openTaskModal)`), immer in einer Funktion aufrufen (`() => openTaskModal()`).
8. **Versionsnummer** und Versions-Log (`js/versionslog.js`) pflegt der Maintainer beim Release – in Pull Requests bitte unverändert lassen.

### Prüfungen

Jeder Push und jeder Pull Request startet [`workflows/check.yml`](workflows/check.yml). Dieselben Prüfungen laufen vor einem Pull Request auch am eigenen Rechner (Node.js ab 18, nichts zu installieren):

```sh
node src/build.js                      # nach jeder Änderung in src/
node .github/scripts/check-all.js      # alle Prüfungen
node .github/scripts/check-all.js ~/pocketbase   # … und zusätzlich der PocketBase-Test (Pfad zu einem PocketBase-Programm)
```

| Prüfung | Was sie findet |
|---|---|
| `node src/build.js --check` | `pb_public/index.html` passt nicht zu `src/` (Bauen vergessen oder die fertige Datei geändert) |
| `check-syntax.js` | Syntaxfehler in App-Dateien, Sprachdateien, Hooks, Inline-Skripten, JSON und Shell-Skripten (`sh -n`) |
| `check-lint.js` | Fehlende Anmeldung, Dateien, die nie geladen werden, doppelt vergebene globale Namen, Hook-Dateien mit `_`, `require()` auf Hook-Module, die es nicht gibt, übrig gebliebene Konflikt-Markierungen |
| `check-hooks.js` | Führt jeden Hook in einer Nachbildung von PocketBase aus: Hooks, die beim Laden abbrechen, doppelt angelegte Routen oder Cron-Jobs, ungültige Zeitpläne, Deklarationen auf oberster Ebene in `*.pb.js` (Handler sehen sie nicht), Funktionen aus einem `pinn-*.js`-Modul, die es gar nicht exportiert, Tests der Update-Erkennung. `--list` zeigt alle Routen |
| `smoke-pocketbase.js` | Zweiter Job auf GitHub: startet einen echten PocketBase (Version aus `docker-compose.yaml`) mit leerer Datenbank und ruft jede Route auf – schlägt fehl, wenn PocketBase nicht startet, die App-Seite fehlt oder eine geschützte Route mit 404 antwortet; öffentliche Routen, die eine Einrichtung oder das Internet brauchen, geben nur eine Warnung |
| `check-lang.js` | Sprachdateien (`pb_public/lang/`): Platzhalter wie `{0}`, `{1|s}`, `{2|x=a|b}` müssen gültig sein und zum englischen Text passen, jeder Text aus `en.js` muss vorkommen und die Datei darf `PINN_I18N.load` nur einmal aufrufen. Neue Sprachen entstehen mit dem Werkzeug `translate.js` oder dem GitHub-Workflow „Translate“ (braucht das Secret `ANTHROPIC_API_KEY`) |
| `check-setup.js` | Die Aufräumliste `OBSOLET` in `pinn-setup.sh`: schlägt fehl, wenn sie eine Datei nennt, die noch im Repository liegt, von der App noch geladen wird oder kein einfacher Pfad unter `pb_public/` oder `pb_hooks/` ist; führt den Shell-Block in einem Temp-Ordner aus und beweist, dass nur Dateien der Liste verschoben werden |

Eine bekannte, gewollte Ausnahme steht oben in `check-lint.js` (`KNOWN_DUPLICATE_FUNCTIONS`). Die Prüfungen können sich nicht anmelden und haben keine echten Daten – bitte die Änderung auch in einer echten Installation ausprobieren und im Pull Request schreiben, wie getestet wurde.

### Pull Requests

1. Repository forken und einen Branch anlegen.
2. Änderung machen – kleine, klar abgegrenzte Pull Requests lassen sich leichter prüfen.
3. Bauen (`node src/build.js`) und `node .github/scripts/check-all.js` laufen lassen.
4. Beschreiben, was geändert und wie getestet wurde; bei sichtbaren Änderungen ein Bildschirmfoto anhängen.

Mit einem Beitrag bist du einverstanden, dass er unter der [Lizenz](../LICENSE) dieses Projekts veröffentlicht wird.
