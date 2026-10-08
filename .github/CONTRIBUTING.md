# Contributing to pinn.

Thanks for wanting to help! pinn. is a spare-time project, so every bug report, idea and translation makes a real difference. English or German – both are fine everywhere.

*Deutsch: Danke fürs Mitmachen! Fehlermeldungen, Ideen und Übersetzungen gerne auch auf Deutsch.*

## Report a bug

[Open a bug report](https://github.com/pinn-shost/pinn/issues/new?template=bug_report.yml). The most helpful reports name the pinn. version, the device and the steps that lead to the problem. Please remove passwords, tokens, addresses and personal data from logs and screenshots.

Security issues don't belong in public issues – see [SECURITY.md](SECURITY.md).

## Suggest an idea

[Share an idea](https://github.com/pinn-shost/pinn/issues/new?template=feature_request.yml). Describe the everyday situation first, then the solution – that helps to find the version of the feature that fits most families.

## Translate pinn.

pinn. is written in German; every other language is a single file that maps German texts to their translation. That keeps the app fast, because each device only loads its own language.

To improve a translation, edit `en.js`, `fr.js` or `es.js` and open a pull request.

To add a new language:

1. Copy `en.js` and name the copy after the two-letter language code, e.g. `it.js`.
2. Change `"en"` in `PINN_I18N.load("en", …)` to your language code and translate the texts on the right-hand side. Keep placeholders like `{0}` as they are.
3. Add a line for the language to `PINN_LANGUAGES` in `index.html` – the language picker in the settings picks it up automatically.

## Change the code

pinn. deliberately has no build step: `index.html` is the app, `*.pb.js` files are PocketBase hooks, `pinn-*.js` files are shared hook modules.

- Hook files use a dot: `name.pb.js`, never `name_pb.js`.
- No scripts, styles or libraries from external servers – everything is served from the NAS.
- Input fields must stay visible when the on-screen keyboard opens.
- Everything should keep working offline and sync once the connection is back.
- Battery matters: avoid polling, timers and animations that run in the background.
- Add a short entry to the version log in the settings.

Test on a phone (iPhone or Android) before opening a pull request – most families use pinn. there.

## Code of conduct

Be kind. pinn. is about families – treat everyone here like you would treat a neighbour.
