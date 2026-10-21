# src/ – sources of the app page

`pb_public/index.html` is **built** from the files in this folder. Please change the HTML here, not in
`pb_public/index.html` – the next build would overwrite your change.

| File | What it is |
|---|---|
| `rahmen.html` | The frame: `<head>` (meta tags, stylesheets, the few inline scripts), `<body>` with the include markers, the main inline script and the `<script src="js/…">` list |
| `teile/*.html` | Screens outside the app: sign-in, main admin, dashboard, app shell, tab bar, search, version log terminal |
| `teile/seiten/*.html` | One file per page of the app (calendar, recipes, finances, settings …) |
| `teile/popups/*.html` | Popups, grouped by area |
| `version.txt` | The app version, e.g. `1.102.0` – the only place where it is set |
| `build.js` | The build script (Node.js, no npm packages needed) |

## Build

```sh
node src/build.js            # writes pb_public/index.html
node src/build.js --check    # only checks that pb_public/index.html matches src/ (exit code 1 if not)
```

The built `pb_public/index.html` is committed as well: pinn. installs and updates straight from the
release archive, nothing is built on the NAS. GitHub Actions runs `node src/build.js --check` on every push
and pull request; run all checks yourself with `node .github/scripts/check-all.js` (see
[.github/CONTRIBUTING.md](../.github/CONTRIBUTING.md)).

## Rules

- A line that contains only `<!-- @include path/file.html -->` is replaced by that file (path relative to
  `src/teile/`, indentation is kept as it is in the part). Parts may include other parts; every file under
  `src/teile/` has to be used exactly once.
- `{{VERSION}}` becomes the version from `version.txt` (`APP_VERSION` and the `?v=` of every `js/` and `css/`
  file, so browsers fetch the new files after an update).
- The lists of the start check (`PINN_APP_PARTS`, `PINN_APP_STYLES`) are filled in by the build from the
  `<script src="js/…">` and `<link rel="stylesheet" href="css/…">` lines. A new file in `pb_public/js/` or
  `pb_public/css/` needs its line in `rahmen.html` and its name in `pinn-setup.sh` (function `ziel`) – the
  build stops with a message if one of them is missing.
- Element IDs are used by the scripts in `pb_public/js/` – keep them unchanged when you move HTML around.
- Comments in English, app texts stay as they are (they are translated at runtime, see `js/sprachen.js`).
