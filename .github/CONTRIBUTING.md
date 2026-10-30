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
| `pb_public/i18n/` | Texts by key, one file per language (`de.i18n.js`, `en.i18n.js` …) – English is the reference (since 1.111.0, see [Texts](#texts)) |
| `pb_hooks/` | Server: PocketBase hooks (`*.pb.js`) and their shared modules (`pinn-*.js`) |
| `pinn-setup.sh`, `pinn-wartung.sh` | Installation/update and the maintenance container (POSIX `sh`) |
| `.github/` | GitHub Actions (`workflows/check.yml`), the checks (`scripts/`), this file, images |

### Rules that matter here

1. **One global scope.** All files in `pb_public/js/` and the inline scripts of `index.html` share one global scope, in the order of the `<script src>` lines in `src/rahmen.html`. A top-level `let`/`const`/`class` name may exist only once in the whole page, and a file may only use other files' names *at load time* if those files load earlier.
2. **New app file** `pb_public/js/<name>.js` (or `css/<name>.css`) needs: its line in `src/rahmen.html`, its name in `pinn-setup.sh` (function `ziel`), and for JavaScript at the end `(window.PINN_PARTS = window.PINN_PARTS || []).push('<name>');` (the start check uses it). Avoid names containing *push*, *ad*, *track* or *analytics* – ad blockers block such files. If you **rename or remove** an app file, also add its old path to `OBSOLET` in `pinn-setup.sh`, so that updates tidy it up on the NAS (it is moved to `_alt/`, not deleted).
3. **HTML** is changed in `src/`, then `node src/build.js`. Keep element IDs – the scripts use them.
4. **Hooks** are named with a dot (`example.pb.js`, not `example_pb.js`). Shared code goes into a module that is not a `*.pb.js` and is loaded with ``require(`${__hooks}/pinn-example.js`)``.
5. **Comments in English.** Every text the user sees comes from a **key** (see [Texts](#texts)) – no visible texts written into the code. Dates are formatted with `PINN_I18N.language.locale`, never with a fixed `'de-DE'`.
6. **Input fields:** the page must move up when the on-screen keyboard appears (see `js/tastatur.js`).
7. **Child lock:** the editor functions `openTaskModal`, `openEditTaskModal`, `openAddEventModal`, `openMealModal`, `openPinboardEditor` and `openKidRoutineEditor` are wrapped after loading – never hand them over directly at load time (`addEventListener('click', openTaskModal)`), always call them inside a function (`() => openTaskModal()`).
8. The **version number** and the version log (`js/versionslog.js`) are maintained by the maintainer when a release is made – please leave them as they are in pull requests.

### Texts

Every text of the app comes from a **text key** (since 1.111.0; complete since 1.119.3, when the old dictionaries in `pb_public/lang/` were removed). The code asks for a text by its key, the language file of the chosen language delivers it.

- **In JavaScript:** `tk('settings.region.title')` returns the text in the user's language. With values: `tk('tasks.open', { n: 3 })` – placeholders have names (`{n}`, `{name}`, `{date}`).
- **In HTML (`src/`):** `<span data-tk="settings.region.title">Language &amp; region</span>` – keep the English text inside, so the HTML stays readable (`check-keys.js` makes sure it matches). Attributes: `data-tk-attr="placeholder:lists.add.hint;title:common.save"`. Markup from the language file: `data-tk-html="key"`. For HTML you add later, call `PINN_I18N.apply(element)`.
- **Files:** `pb_public/i18n/<code>.i18n.js`, one line per key, sorted. `en.i18n.js` is the reference; every language that can be chosen needs every key.
- **Plurals:** a text can be an object with plural forms, chosen by the value `n`: `{ "one": "{n} open task", "other": "{n} open tasks" }`. Which forms a language needs is listed in `FORMS` of `pb_public/js/textkern.js` – Russian, for example, needs `one`, `few` and `many`. The same file exists as `pb_hooks/pinn-textkern.js` for the server; both must stay identical.
- **Flat share:** a variant `"<key>#wg"` is used when a household is set to flat share (family members → flatmates). Inside `[data-no-term]` (sign-in, main admin, the switch between family and flat share) the variant is never used, and keys starting with `login.`, `mainAdmin.`, `settings.household.` or `maint.` (backups & updates – they always concern every family on the server) get none. The family emoji follows the same rule: `PINN_I18N.famIcon()` in JavaScript, `data-fam-ico` in HTML.
- **When HTML texts are filled in:** once, right before the app scripts run (`src/rahmen.html` calls `PINN_I18N.apply(document.body)`). A script may change the text of an element with `data-tk` afterwards – it is not overwritten again.
- **Key names:** `area.part.name` in English, e.g. `settings.region.country`, `emergency.police`, `common.save`.
- **Adding texts:** write the text in every language that can be chosen. `node .github/scripts/i18n-keys.js put <map.json>` writes many keys at once (`{ "<key>": { "de": "…", "en": "…", … } }`, `null` removes a key) and adds the flat share variant `#wg` automatically; one text by hand: `set <key> <lang> "<text>"`; `remove <key>`; `format`. The header of the script explains the options.
- **Push messages of the server** (since 1.117.0): the modules in `pb_hooks/` keep writing their messages in German; `pb_hooks/pinn-pushtext.js` recognises them by patterns (per message tag) and takes the text of the recipient's language from the same files – keys starting with `push.`, read on the server through `pinn-textkern.js`. A new kind of push message needs a pattern there and its `push.` key in every language file (`check-hooks.js` tests it).
- **Standard names and server messages** (since 1.119.1): predefined names are stored in German (categories, storage places, kitchen appliances, units, funds, titles of automatic household tasks). Show them with `i18nT(name)` and package units with `unitForCount` – `js/standardnamen.js` maps the known German names to keys `std.*`; renamed or own names stay unchanged. Never translate the stored value itself. German messages of the server routes (`error`, `hinweis`, `message`) are translated by `apiFetch` via `SERVER_MESSAGE_KEYS` in `js/serverzugriff.js` (keys `srv.*`).
- **Version log:** German and English only. A new entry in `js/versionslog.js` also needs its English text in `pb_public/i18n/versionslog.en.js` (loaded only when the log or the news in the bell are shown); every other language shows English.
- **A new language:** add a line to `PINN_LANGUAGES` in `pb_public/js/sprachen.js` (with `hidden: true` until it is complete), a plural rule to `RULES`/`FORMS` in both text core files and a file `pb_public/i18n/<code>.i18n.js`. A hidden language can be tried out on one device with `localStorage.setItem('pinn.sprachen.alle', '1')` in the browser console.

### Database changes

The database schema lives in one place, `pb_hooks/pinn-schema.js` (since 1.110.0):

- **New collection or field:** add it to the module's ensure function. A new module adds its ensure function to `CHECKS` – these run on every start and only add what is missing.
- **Anything else** (renaming or removing fields, moving or cleaning up data, dropping old collections): append a step to `MIGRATIONS` with the next version number, e.g. `{ version: 2, name: "remove-old-view", up: () => … }`. Each step runs exactly once and is recorded in the collection `pinn_schema`. Never change, reorder or remove a released step – add a new one. Use `$app.runInTransaction((txApp) => { … })` for data changes (only `txApp` inside), make every step safe to repeat after a partial run and keep a backup copy of anything you delete or rewrite.
- `check-hooks.js` checks both lists and runs the steps against a simulated database. The header of `pinn-schema.js` has the details.

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
| `check-keys.js` | Text keys (`pb_public/i18n/`): every key of `en.i18n.js` exists in every language that can be chosen, plural forms and placeholders are complete, every key used in the code (`tk('…')`, `data-tk`) exists and the English text in the HTML matches; the two text core files are identical and their plural rules agree with Node.js; `js/sprachen.js` is tried out in a simulated page |
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
| `pb_public/i18n/` | Texte nach Schlüssel, eine Datei je Sprache (`de.i18n.js`, `en.i18n.js` …) – Englisch ist die Vorlage (seit 1.111.0, siehe [Texte](#texte)) |
| `pb_hooks/` | Server: PocketBase-Hooks (`*.pb.js`) und gemeinsame Module (`pinn-*.js`) |
| `pinn-setup.sh`, `pinn-wartung.sh` | Installation/Update und der Wartungs-Container (POSIX-`sh`) |
| `.github/` | GitHub Actions (`workflows/check.yml`), die Prüfungen (`scripts/`), diese Datei, Bilder |

### Regeln, auf die es ankommt

1. **Ein gemeinsamer globaler Bereich.** Alle Dateien in `pb_public/js/` und die Inline-Skripte der `index.html` teilen sich einen globalen Bereich, in der Reihenfolge der `<script src>`-Zeilen in `src/rahmen.html`. Ein `let`/`const`/`class`-Name auf oberster Ebene darf es auf der ganzen Seite nur einmal geben, und eine Datei darf Namen anderer Dateien *beim Laden* nur benutzen, wenn diese vorher laden.
2. **Neue App-Datei** `pb_public/js/<name>.js` (oder `css/<name>.css`) braucht: ihre Zeile in `src/rahmen.html`, ihren Namen in `pinn-setup.sh` (Funktion `ziel`) und bei JavaScript am Ende `(window.PINN_PARTS = window.PINN_PARTS || []).push('<name>');` (darauf baut die Startprüfung). Namen mit *push*, *ad*, *track* oder *analytics* vermeiden – Werbeblocker sperren solche Dateien. Wird eine App-Datei **umbenannt oder entfernt**, ihren alten Pfad auch in `OBSOLET` in `pinn-setup.sh` eintragen, damit Updates sie auf dem NAS aufräumen (sie wird nach `_alt/` verschoben, nicht gelöscht).
3. **HTML** wird in `src/` geändert, danach `node src/build.js`. Element-IDs beibehalten – die Skripte nutzen sie.
4. **Hooks** werden mit Punkt benannt (`beispiel.pb.js`, nicht `beispiel_pb.js`). Gemeinsamer Code kommt in ein Modul, das kein `*.pb.js` ist, und wird mit ``require(`${__hooks}/pinn-beispiel.js`)`` geladen.
5. **Kommentare auf Englisch.** Jeder sichtbare Text kommt über einen **Schlüssel** (siehe [Texte](#texte)) – keine sichtbaren Texte fest im Code. Datumsangaben mit `PINN_I18N.language.locale` formatieren, nie mit festem `'de-DE'`.
6. **Eingabefelder:** Die Seite muss hochrutschen, wenn die Bildschirmtastatur erscheint (siehe `js/tastatur.js`).
7. **Kindersicherung:** Die Editor-Funktionen `openTaskModal`, `openEditTaskModal`, `openAddEventModal`, `openMealModal`, `openPinboardEditor` und `openKidRoutineEditor` werden nach dem Laden abgesichert – nie beim Laden direkt weiterreichen (`addEventListener('click', openTaskModal)`), immer in einer Funktion aufrufen (`() => openTaskModal()`).
8. **Versionsnummer** und Versions-Log (`js/versionslog.js`) pflegt der Maintainer beim Release – in Pull Requests bitte unverändert lassen.

### Texte

Jeder Text der App kommt über einen **Text-Schlüssel** (seit 1.111.0; vollständig seit 1.119.3, als die alten Wörterbücher in `pb_public/lang/` entfernt wurden). Der Code fragt einen Text über seinen Schlüssel ab, die Sprachdatei der gewählten Sprache liefert ihn.

- **In JavaScript:** `tk('settings.region.title')` liefert den Text in der Sprache des Profils. Mit Werten: `tk('tasks.open', { n: 3 })` – Platzhalter haben Namen (`{n}`, `{name}`, `{date}`).
- **In HTML (`src/`):** `<span data-tk="settings.region.title">Language &amp; region</span>` – den englischen Text drin lassen, damit das HTML lesbar bleibt (`check-keys.js` prüft, dass er passt). Attribute: `data-tk-attr="placeholder:lists.add.hint;title:common.save"`. Markup aus der Sprachdatei: `data-tk-html="key"`. Für HTML, das später dazukommt, `PINN_I18N.apply(element)` aufrufen.
- **Dateien:** `pb_public/i18n/<code>.i18n.js`, eine Zeile je Schlüssel, sortiert. `en.i18n.js` ist die Vorlage; jede wählbare Sprache braucht jeden Schlüssel.
- **Mehrzahl:** Ein Text kann ein Objekt mit Mehrzahlformen sein, gewählt über den Wert `n`: `{ "one": "{n} open task", "other": "{n} open tasks" }`. Welche Formen eine Sprache braucht, steht in `FORMS` in `pb_public/js/textkern.js` – Russisch braucht zum Beispiel `one`, `few` und `many`. Dieselbe Datei liegt als `pb_hooks/pinn-textkern.js` für den Server; beide müssen gleich bleiben.
- **WG:** Eine Variante `"<key>#wg"` gilt, wenn ein Haushalt auf WG steht (Familienmitglieder → Mitbewohner). Innerhalb von `[data-no-term]` (Anmeldung, Hauptadmin, Umschalter Familie/WG) wird sie nie benutzt, und Schlüssel, die mit `login.`, `mainAdmin.`, `settings.household.` oder `maint.` beginnen (Sicherungen & Updates – sie betreffen immer alle Familien auf dem Server), bekommen keine. Das Familien-Emoji folgt derselben Regel: `PINN_I18N.famIcon()` in JavaScript, `data-fam-ico` im HTML.
- **Wann HTML-Texte eingesetzt werden:** einmal, direkt bevor die App-Skripte laufen (`src/rahmen.html` ruft `PINN_I18N.apply(document.body)` auf). Ändert ein Skript danach den Text eines Elements mit `data-tk`, wird er nicht wieder überschrieben.
- **Schlüsselnamen:** `bereich.teil.name` auf Englisch, z. B. `settings.region.country`, `emergency.police`, `common.save`.
- **Texte ergänzen:** den Text in jeder wählbaren Sprache schreiben. `node .github/scripts/i18n-keys.js put <map.json>` schreibt viele Schlüssel auf einmal (`{ "<key>": { "de": "…", "en": "…", … } }`, `null` entfernt einen Schlüssel) und legt die WG-Variante `#wg` automatisch an; einen Text von Hand: `set <key> <lang> "<text>"`; `remove <key>`; `format`. Der Kopf des Skripts erklärt die Optionen.
- **Push-Nachrichten des Servers** (seit 1.117.0): Die Module in `pb_hooks/` schreiben ihre Meldungen weiter auf Deutsch; `pb_hooks/pinn-pushtext.js` erkennt sie an Mustern (je Nachrichten-Tag) und holt den Text in der Sprache des Empfängers aus denselben Dateien – Schlüssel mit `push.` vorne, am Server gelesen über `pinn-textkern.js`. Eine neue Art Push-Nachricht braucht dort ein Muster und ihren `push.`-Schlüssel in jeder Sprachdatei (`check-hooks.js` prüft das).
- **Standardnamen und Server-Meldungen** (seit 1.119.1): Vorgegebene Namen werden deutsch gespeichert (Kategorien, Lagerorte, Küchengeräte, Einheiten, Kassen, Titel automatischer Haushalts-Aufgaben). Angezeigt werden sie mit `i18nT(name)`, Packungseinheiten mit `unitForCount` – `js/standardnamen.js` ordnet die bekannten deutschen Namen den Schlüsseln `std.*` zu; umbenannte oder eigene Namen bleiben unverändert. Den gespeicherten Wert selbst nie übersetzen. Deutsche Meldungen der Server-Routen (`error`, `hinweis`, `message`) übersetzt `apiFetch` über `SERVER_MESSAGE_KEYS` in `js/serverzugriff.js` (Schlüssel `srv.*`).
- **Versions-Log:** nur Deutsch und Englisch. Ein neuer Eintrag in `js/versionslog.js` braucht auch seinen englischen Text in `pb_public/i18n/versionslog.en.js` (lädt erst, wenn das Log oder die Neuigkeiten in der Glocke gezeigt werden); alle anderen Sprachen zeigen Englisch.
- **Neue Sprache:** eine Zeile in `PINN_LANGUAGES` in `pb_public/js/sprachen.js` (mit `hidden: true`, bis sie vollständig ist), eine Mehrzahlregel in `RULES`/`FORMS` beider Textkern-Dateien und eine Datei `pb_public/i18n/<code>.i18n.js`. Eine versteckte Sprache lässt sich auf einem Gerät mit `localStorage.setItem('pinn.sprachen.alle', '1')` in der Browser-Konsole ausprobieren.

### Änderungen an der Datenbank

Das Datenbank-Schema steht an einer Stelle, in `pb_hooks/pinn-schema.js` (seit 1.110.0):

- **Neue Sammlung oder neues Feld:** in die ensure-Funktion des Moduls. Ein neues Modul trägt seine ensure-Funktion in `CHECKS` ein – diese laufen bei jedem Start und ergänzen nur, was fehlt.
- **Alles andere** (Felder umbenennen oder entfernen, Daten verschieben oder aufräumen, alte Sammlungen löschen): einen Schritt mit der nächsten Versionsnummer ans Ende von `MIGRATIONS` hängen, z. B. `{ version: 2, name: "alte-ansicht-entfernen", up: () => … }`. Jeder Schritt läuft genau einmal und wird in der Sammlung `pinn_schema` vermerkt. Veröffentlichte Schritte nie ändern, umsortieren oder löschen – stattdessen einen neuen anlegen. Datenänderungen in `$app.runInTransaction((txApp) => { … })` (darin nur `txApp`), jeden Schritt so bauen, dass er nach einem halben Durchlauf wiederholt werden kann, und von allem, was gelöscht oder umgeschrieben wird, eine Sicherungskopie behalten.
- `check-hooks.js` prüft beide Listen und spielt die Schritte gegen eine nachgebildete Datenbank durch. Einzelheiten stehen im Kopf von `pinn-schema.js`.

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
| `check-keys.js` | Text-Schlüssel (`pb_public/i18n/`): jeder Schlüssel aus `en.i18n.js` in jeder wählbaren Sprache, Mehrzahlformen und Platzhalter vollständig, jeder im Code benutzte Schlüssel (`tk('…')`, `data-tk`) vorhanden und der englische Text im HTML passend; die beiden Textkern-Dateien sind gleich und ihre Mehrzahlregeln stimmen mit Node.js überein; `js/sprachen.js` wird in einer nachgebildeten Seite ausprobiert |
| `check-setup.js` | Die Aufräumliste `OBSOLET` in `pinn-setup.sh`: schlägt fehl, wenn sie eine Datei nennt, die noch im Repository liegt, von der App noch geladen wird oder kein einfacher Pfad unter `pb_public/` oder `pb_hooks/` ist; führt den Shell-Block in einem Temp-Ordner aus und beweist, dass nur Dateien der Liste verschoben werden |

Eine bekannte, gewollte Ausnahme steht oben in `check-lint.js` (`KNOWN_DUPLICATE_FUNCTIONS`). Die Prüfungen können sich nicht anmelden und haben keine echten Daten – bitte die Änderung auch in einer echten Installation ausprobieren und im Pull Request schreiben, wie getestet wurde.

### Pull Requests

1. Repository forken und einen Branch anlegen.
2. Änderung machen – kleine, klar abgegrenzte Pull Requests lassen sich leichter prüfen.
3. Bauen (`node src/build.js`) und `node .github/scripts/check-all.js` laufen lassen.
4. Beschreiben, was geändert und wie getestet wurde; bei sichtbaren Änderungen ein Bildschirmfoto anhängen.

Mit einem Beitrag bist du einverstanden, dass er unter der [Lizenz](../LICENSE) dieses Projekts veröffentlicht wird.
