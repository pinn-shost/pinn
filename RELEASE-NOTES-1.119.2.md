# pinn. 1.119.2

## English

**Pantry scanner: photo instead of live camera**

- If pinn. is opened via `http://…` instead of its HTTPS address, browsers do not release the live camera – on iPhone and iPad never. The scanner used to show a black picture with “The camera isn’t available here”. It now explains that the live camera needs the HTTPS address and offers **📷 Take a photo of the barcode**: take a picture and pinn. reads the barcode from it. This also works when the camera is blocked or does not start.
- Tip: open pinn. via its HTTPS address (set up in the setup assistant) – then the live camera and push notifications work as well.
- For contributors: the text-key check (`.github/scripts/check-keys.js`) skips translated version logs (`versionslog.<code>.js`).
- Changed: `index.html`, `js/vorrat2.js`, `js/sprachen.js`, `js/versionslog.js`, `i18n/versionslog.en.js`, all language files in `i18n/`, `.github/scripts/check-keys.js` – nothing changes on the server. Install as usual (`sudo sh pinn-*/pinn-setup.sh` or the update button).

## Deutsch

**Vorrat-Scanner: Foto statt Live-Kamera**

- Wird pinn. über `http://…` statt über die HTTPS-Adresse geöffnet, geben Browser die Live-Kamera nicht frei – auf iPhone und iPad nie. Bisher zeigte der Scanner dann ein schwarzes Bild mit „Die Kamera ist hier nicht verfügbar“. Jetzt erklärt er, dass die Live-Kamera die HTTPS-Adresse braucht, und bietet **📷 Barcode fotografieren** an: Foto aufnehmen, pinn. liest den Barcode daraus. Das geht auch, wenn die Kamera blockiert ist oder nicht startet.
- Tipp: pinn. über die HTTPS-Adresse öffnen (Einrichtung im Einrichtungsassistenten) – dann funktionieren auch Live-Kamera und Push-Nachrichten.
- Für Mitwirkende: Die Prüfung der Text-Schlüssel (`.github/scripts/check-keys.js`) überspringt übersetzte Versions-Logs (`versionslog.<code>.js`).
- Geändert: `index.html`, `js/vorrat2.js`, `js/sprachen.js`, `js/versionslog.js`, `i18n/versionslog.en.js`, alle Sprachdateien in `i18n/`, `.github/scripts/check-keys.js` – am Server ändert sich nichts. Einspielen wie gewohnt (`sudo sh pinn-*/pinn-setup.sh` oder Update-Knopf).
