<p align="center">
  <img src="pinn-logo.png" alt="pinn." width="120">
</p>

<h1 align="center">pinn.</h1>

<p align="center">
  The self-hosted family organizer for your NAS – calendar, meals, lists, tasks and finances in one app.<br>
  <a href="#deutsch">🇩🇪 Deutsch weiter unten</a>
</p>

---

## What is pinn.?

pinn. is a web app for families and flatshares that runs entirely on your own NAS. Install it once with Docker, add it to the home screen of every phone and tablet, and everyone shares one calendar, one shopping list and one place for everything that keeps a household running. No cloud account, no ads, no tracking – your data never leaves your home.

**Highlights**

- **Calendar** – iCloud and Google calendars per profile (private or shared with the family), public and school holidays, waste collection calendar, birthdays from your contacts
- **Meals & recipes** – meal plan, recipes from text, PDF, photo or link (optional AI), shared public recipes, ingredients straight to the shopping list
- **Lists** – shopping lists per shop, pantry with minimum stock, packing lists from templates, gift and wish lists, checklists
- **Tasks & household** – tasks with push reminders, cleaning plans, bins, a playful kids' page with daily routines
- **Finance** – shared or private funds, budget, savings and depots (ETFs, shares), pocket money, contracts with cancellation reminders, split expenses for flatshares
- **Documents & vehicles** – receipts and warranties, IDs with expiry reminders, cars and bikes with MOT, service and costs
- **Family** – live location via Traccar (way home, SOS), emergency cards, places with arrival notifications
- **Smart home** – Apple Shortcuts and Home Assistant (e.g. start the robot vacuum from a task)
- **Family board, notifications, global search, offline mode, dark mode**
- **Languages** – English, Deutsch, Français, Español; family or flatshare mode

## Requirements

- A NAS or server with **Docker** and **Docker Compose 2.17+** (developed on a UGREEN NAS with UGOS, works on any Linux Docker host)
- SSH access to the NAS
- Optional: a free [DuckDNS](https://www.duckdns.org) subdomain for HTTPS (needed for push notifications on iPhone)

## Installation

1. On GitHub click **Code → Download ZIP** and unzip it.
2. Create a folder on the NAS, e.g. `/volume1/docker/Pocketbase`, and put the unzipped folder **`pinn-main`** into it as it is.
3. Log in via SSH and run:
   ```sh
   cd /volume1/docker/Pocketbase && sudo sh pinn-setup.sh
   ```
   The script sorts all files into place, downloads the libraries for PDF import and photo text recognition, and starts pinn.
4. Open `http://<NAS-IP>:8090` in the browser → **Log in as main admin** → password `Admin` → set your own password.
5. The **setup assistant** guides you through everything else (HTTPS, remote access via WireGuard or Tailscale, Google, AI, location, Home Assistant) – step by step, in four languages.

**Updating:** download the new ZIP, put `pinn-main` into the same folder again and run `sudo sh pinn-setup.sh`. Replaced files are backed up in `_alt/`. Your data stays untouched.

**Backups** are created automatically every night in `./backups` (14 days).

## Support pinn.

pinn. is free and stays free – completely, for everyone. It's built in my spare time. If it makes your everyday life a little easier, a small contribution is very welcome, but entirely voluntary:

- ☕ [Ko-fi](https://ko-fi.com/pinnapp)
- ☕ [Buy Me a Coffee](https://buymeacoffee.com/pinn)

A ⭐ on GitHub helps too – it makes pinn. easier to find for other families.

Found a bug or have an idea? [Open an issue](https://github.com/pinn-shost/pinn/issues).

## Built with

[PocketBase](https://pocketbase.io) (MIT) · [Tailwind CSS](https://tailwindcss.com) (MIT) · [pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0) · [Tesseract.js](https://tesseract.projectnaptha.com) (Apache-2.0) · [Traccar](https://www.traccar.org) (Apache-2.0) · [Caddy](https://caddyserver.com) (Apache-2.0)

## License

[MIT](LICENSE) – use it, change it, share it.

---

<a id="deutsch"></a>

## 🇩🇪 Deutsch

pinn. ist eine Familien-App, die komplett auf dem eigenen NAS läuft: Kalender, Essensplanung, Rezepte, Einkaufs- und Packlisten, Aufgaben, Finanzen, Dokumente, Fahrzeuge, Ortung, Smarthome und eine Pinnwand – für Familien und WGs. Kein Cloud-Konto, keine Werbung, keine Weitergabe von Daten.

### Installation

1. Auf GitHub **Code → Download ZIP** wählen und entpacken.
2. Auf dem NAS einen Ordner anlegen, z. B. `/volume1/docker/Pocketbase`, und den entpackten Ordner **`pinn-main`** so, wie er ist, hineinlegen.
3. Per SSH anmelden und ausführen:
   ```sh
   cd /volume1/docker/Pocketbase && sudo sh pinn-setup.sh
   ```
4. Im Browser `http://<NAS-IP>:8090` öffnen → **Als Hauptadmin anmelden** → Passwort `Admin` → eigenes Passwort festlegen.
5. Der **Einrichtungs-Assistent** führt Schritt für Schritt durch alles Weitere.

**Update:** neue ZIP herunterladen, `pinn-main` wieder in denselben Ordner legen, `sudo sh pinn-setup.sh` ausführen. Ersetzte Dateien landen in `_alt/`, eure Daten bleiben unverändert.

### pinn. unterstützen

pinn. ist kostenlos und bleibt es – vollständig, für alle. Wenn es euch den Alltag leichter macht, freue ich mich über eine kleine Unterstützung, ganz freiwillig: [Ko-fi](https://ko-fi.com/pinnapp) · [Buy Me a Coffee](https://buymeacoffee.com/pinn). Auch ein ⭐ hier auf GitHub hilft.

Fehler gefunden oder eine Idee? [Hier melden](https://github.com/pinn-shost/pinn/issues).
