#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  pinn. – installation and update in one step ("setup.exe" for the NAS)
#
#  How to use:
#   1. In the UGREEN file manager, create a folder, e.g. /volume1/docker/Pocketbase
#      (for an update: the existing project folder).
#   2. Put the unzipped release folder from GitHub ("pinn-main" or e.g. "pinn-1.39.0") into this
#      folder as it is. Single loose pinn. files (also in a subfolder "neu") still work as well;
#      download suffixes like "file (1).js" don't matter.
#   3. Log in via SSH and run:
#        cd /volume1/docker/Pocketbase && sudo sh pinn-*/pinn-setup.sh
#      (if pinn. is already installed, this works too:  sudo sh pinn-setup.sh)
#   4. The script copies everything into place, creates missing folders, starts pinn. and shows
#      the address where the setup continues in the browser.
#
#  Repository layout = installation layout (since 1.39.0): every file in the release lies at the
#  same relative path at which it ends up in the project folder:
#     pb_hooks/      server hooks and their helper modules  → ./pb_hooks
#     pb_public/     the web app (index.html, icons, lang/, vendor/)  → ./pb_public
#     caddy/         Caddyfile  → ./caddy/Caddyfile
#     *.sh, docker-compose.yaml, env.txt, README, LICENSE  → project folder
#  The index.html at the top of the repository is only a placeholder (the update button of
#  pinn. 1.38 and older checks for it) and is never installed.
#
#  Output language: automatic (German, English, French, Spanish), can be fixed with e.g.
#  sudo sh pinn-setup.sh --lang en
#  Replaced files are kept in _alt/<date>/ just in case. Your data (pb_data, konfig, backups,
#  caddy/data …) is never touched.
#  Once pinn. is installed, updates also work with a button in the app (Settings → System →
#  Backups & updates) – the container "wartung" runs exactly this script for that.
# ─────────────────────────────────────────────────────────────

cd "$(dirname "$0")" || exit 1
EIGENER_ORDNER=""   # release folder this script was started from (empty = project folder)
# Started from the unzipped GitHub folder (pinn-main/pinn-setup.sh, pinn-1.39.0/pinn-setup.sh …)?
# Then the project folder is one level up.
case "$(basename "$(pwd)")" in
  pinn-main|pinn-master|pinn-[0-9]*|pinn-v[0-9]*) EIGENER_ORDNER=$(basename "$(pwd)"); cd .. || exit 1 ;;
esac
PROJEKT=$(pwd)

# ── Language ────────────────────────────────────────────────
L=""
if [ "$1" = "--lang" ] && [ -n "$2" ]; then L=$(echo "$2" | cut -c1-2); fi
[ -z "$L" ] && L=$(echo "${LC_ALL:-${LC_MESSAGES:-${LANG:-en}}}" | cut -c1-2)
case "$L" in de|en|fr|es) ;; *) L=en ;; esac

m() {
  case "$L:$1" in
    de:root) echo "Bitte mit sudo starten:  sudo sh pinn-setup.sh" ;;
    en:root) echo "Please run with sudo:  sudo sh pinn-setup.sh" ;;
    fr:root) echo "Veuillez lancer avec sudo :  sudo sh pinn-setup.sh" ;;
    es:root) echo "Ejecútalo con sudo:  sudo sh pinn-setup.sh" ;;
    de:docker) echo "Docker fehlt. Bitte im UGOS-App-Center „Docker“ installieren und das Skript erneut starten." ;;
    en:docker) echo "Docker is missing. Please install “Docker” from the UGOS App Center and run the script again." ;;
    fr:docker) echo "Docker est absent. Installez « Docker » depuis l'App Center d'UGOS et relancez le script." ;;
    es:docker) echo "Falta Docker. Instala «Docker» desde el App Center de UGOS y vuelve a ejecutar el script." ;;
    de:compose) echo "Docker Compose ist zu alt (mindestens 2.17 nötig). Bitte Docker im UGOS-App-Center aktualisieren." ;;
    en:compose) echo "Docker Compose is too old (2.17 or later required). Please update Docker in the UGOS App Center." ;;
    fr:compose) echo "Docker Compose est trop ancien (2.17 minimum). Mettez Docker à jour dans l'App Center d'UGOS." ;;
    es:compose) echo "Docker Compose es demasiado antiguo (se necesita 2.17 o posterior). Actualiza Docker en el App Center de UGOS." ;;
    de:nocompose) echo "docker-compose.yaml fehlt in $PROJEKT – bitte alle pinn.-Dateien in diesen Ordner legen." ;;
    en:nocompose) echo "docker-compose.yaml is missing in $PROJEKT – please put all pinn. files into this folder." ;;
    fr:nocompose) echo "docker-compose.yaml manque dans $PROJEKT – placez tous les fichiers pinn. dans ce dossier." ;;
    es:nocompose) echo "Falta docker-compose.yaml en $PROJEKT – coloca todos los archivos de pinn. en esta carpeta." ;;
    de:sort) echo "Dateien werden einsortiert …" ;;
    en:sort) echo "Sorting files …" ;;
    fr:sort) echo "Rangement des fichiers …" ;;
    es:sort) echo "Ordenando los archivos …" ;;
    de:sorted) echo "Datei(en) einsortiert" ;;
    en:sorted) echo "file(s) sorted" ;;
    fr:sorted) echo "fichier(s) rangé(s)" ;;
    es:sorted) echo "archivo(s) ordenado(s)" ;;
    de:nothing) echo "Keine neuen Dateien zum Einsortieren" ;;
    en:nothing) echo "No new files to sort" ;;
    fr:nothing) echo "Aucun nouveau fichier à ranger" ;;
    es:nothing) echo "No hay archivos nuevos que ordenar" ;;
    de:dirs) echo "Ordner angelegt bzw. vorhanden" ;;
    en:dirs) echo "Folders created or present" ;;
    fr:dirs) echo "Dossiers créés ou présents" ;;
    es:dirs) echo "Carpetas creadas o existentes" ;;
    de:env) echo ".env angelegt (muss nicht ausgefüllt werden – alles geht in der Einrichtung in pinn.)" ;;
    en:env) echo ".env created (no need to fill it in – everything is done in the pinn. setup)" ;;
    fr:env) echo ".env créé (inutile de le remplir – tout se fait dans la configuration de pinn.)" ;;
    es:env) echo ".env creado (no hace falta rellenarlo – todo se hace en la configuración de pinn.)" ;;
    de:hooks) echo "Diese Server-Dateien fehlen noch in pb_hooks:" ;;
    en:hooks) echo "These server files are still missing in pb_hooks:" ;;
    fr:hooks) echo "Ces fichiers serveur manquent encore dans pb_hooks :" ;;
    es:hooks) echo "Todavía faltan estos archivos de servidor en pb_hooks:" ;;
    de:start) echo "pinn. wird gestartet (beim ersten Mal lädt das NAS PocketBase und die Container – das kann einige Minuten dauern) …" ;;
    en:start) echo "Starting pinn. (the first time, the NAS downloads PocketBase and the containers – this can take a few minutes) …" ;;
    fr:start) echo "Démarrage de pinn. (la première fois, le NAS télécharge PocketBase et les conteneurs – cela peut prendre quelques minutes) …" ;;
    es:start) echo "Iniciando pinn. (la primera vez el NAS descarga PocketBase y los contenedores – puede tardar unos minutos) …" ;;
    de:startfail) echo "Starten fehlgeschlagen. Hat das NAS Internet (github.com, Docker Hub)? Ausgabe oben prüfen." ;;
    en:startfail) echo "Start failed. Does the NAS have internet access (github.com, Docker Hub)? Check the output above." ;;
    fr:startfail) echo "Échec du démarrage. Le NAS a-t-il accès à Internet (github.com, Docker Hub) ? Vérifiez la sortie ci-dessus." ;;
    es:startfail) echo "Error al iniciar. ¿Tiene Internet el NAS (github.com, Docker Hub)? Revisa la salida de arriba." ;;
    de:wait) echo "Warte auf pinn. …" ;;
    en:wait) echo "Waiting for pinn. …" ;;
    fr:wait) echo "Attente de pinn. …" ;;
    es:wait) echo "Esperando a pinn. …" ;;
    de:noresp) echo "pinn. antwortet noch nicht. Log ansehen:  docker logs pocketbase --tail 80" ;;
    en:noresp) echo "pinn. isn't responding yet. Show the log:  docker logs pocketbase --tail 80" ;;
    fr:noresp) echo "pinn. ne répond pas encore. Voir le journal :  docker logs pocketbase --tail 80" ;;
    es:noresp) echo "pinn. aún no responde. Ver el registro:  docker logs pocketbase --tail 80" ;;
    de:running) echo "pinn. läuft" ;;
    en:running) echo "pinn. is running" ;;
    fr:running) echo "pinn. fonctionne" ;;
    es:running) echo "pinn. está en marcha" ;;
    de:next1) echo "Weiter geht's im Browser (Computer oder Handy im selben WLAN):" ;;
    en:next1) echo "Continue in the browser (computer or phone on the same Wi-Fi):" ;;
    fr:next1) echo "La suite se passe dans le navigateur (ordinateur ou téléphone sur le même Wi-Fi) :" ;;
    es:next1) echo "Continúa en el navegador (ordenador o móvil en la misma Wi-Fi):" ;;
    de:next2) echo "→ „Als Hauptadmin anmelden“ – Passwort beim ersten Mal:  Admin" ;;
    en:next2) echo "→ “Log in as main admin” – password the first time:  Admin" ;;
    fr:next2) echo "→ « Se connecter en administrateur principal » – mot de passe la première fois :  Admin" ;;
    es:next2) echo "→ «Iniciar sesión como administrador principal» – contraseña la primera vez:  Admin" ;;
    de:next3) echo "→ eigenes Passwort festlegen – danach führt dich der Einrichtungs-Assistent durch alles Weitere." ;;
    en:next3) echo "→ set your own password – then the setup assistant guides you through everything else." ;;
    fr:next3) echo "→ définissez votre mot de passe – l'assistant de configuration vous guide ensuite pour tout le reste." ;;
    es:next3) echo "→ elige tu propia contraseña – después el asistente de configuración te guía en todo lo demás." ;;
    de:done) echo "pinn. ist eingerichtet und läuft unter:" ;;
    en:done) echo "pinn. is set up and running at:" ;;
    fr:done) echo "pinn. est configuré et fonctionne à l'adresse :" ;;
    es:done) echo "pinn. está configurado y funciona en:" ;;
    de:local) echo "Im Heimnetz außerdem:" ;;
    en:local) echo "Also on the home network:" ;;
    fr:local) echo "Également sur le réseau domestique :" ;;
    es:local) echo "También en la red de casa:" ;;
    de:libs) echo "Bibliotheken für PDF-Import und Foto-Texterkennung werden geladen …" ;;
    en:libs) echo "Downloading libraries for PDF import and photo text recognition …" ;;
    fr:libs) echo "Téléchargement des bibliothèques pour l'import PDF et la reconnaissance de texte …" ;;
    es:libs) echo "Descargando las bibliotecas para importar PDF y reconocer texto en fotos …" ;;
    de:libsok) echo "Bibliotheken vorhanden (PDF-Import, Foto-Texterkennung)" ;;
    en:libsok) echo "Libraries present (PDF import, photo text recognition)" ;;
    fr:libsok) echo "Bibliothèques présentes (import PDF, reconnaissance de texte)" ;;
    es:libsok) echo "Bibliotecas disponibles (importar PDF, reconocer texto)" ;;
    de:libsfail) echo "Nicht alle Bibliotheken ließen sich laden – PDF-Import bzw. „Foto einlesen“ fehlen dann. pinn. läuft trotzdem; beim nächsten Start des Skripts wird es erneut versucht." ;;
    en:libsfail) echo "Not all libraries could be downloaded – PDF import or “Read photo” will be missing. pinn. still works; the script tries again next time." ;;
    fr:libsfail) echo "Toutes les bibliothèques n'ont pas pu être téléchargées – l'import PDF ou la lecture de photo manqueront. pinn. fonctionne quand même ; le script réessaiera la prochaine fois." ;;
    es:libsfail) echo "No se pudieron descargar todas las bibliotecas – faltará importar PDF o «Leer foto». pinn. funciona igualmente; el script lo volverá a intentar la próxima vez." ;;
    de:sumsneu) echo "Prüfsummen der Bibliotheken gespeichert (pb_public/vendor/SHA256SUMS)" ;;
    en:sumsneu) echo "Library checksums saved (pb_public/vendor/SHA256SUMS)" ;;
    fr:sumsneu) echo "Sommes de contrôle des bibliothèques enregistrées (pb_public/vendor/SHA256SUMS)" ;;
    es:sumsneu) echo "Sumas de verificación de las bibliotecas guardadas (pb_public/vendor/SHA256SUMS)" ;;
    de:sumsok) echo "Bibliotheken unverändert (Prüfsummen stimmen)" ;;
    en:sumsok) echo "Libraries unchanged (checksums match)" ;;
    fr:sumsok) echo "Bibliothèques inchangées (sommes de contrôle correctes)" ;;
    es:sumsok) echo "Bibliotecas sin cambios (sumas de verificación correctas)" ;;
    de:sumsfail) echo "ACHTUNG: Diese Bibliotheken wurden seit der Installation verändert. Wenn du das nicht selbst warst, die genannten Dateien löschen und das Skript erneut starten – sie werden dann frisch in der festen Version geladen:" ;;
    en:sumsfail) echo "WARNING: These libraries have changed since installation. If you didn't do this yourself, delete the listed files and run the script again – they will be downloaded fresh in the pinned version:" ;;
    fr:sumsfail) echo "ATTENTION : ces bibliothèques ont été modifiées depuis l'installation. Si ce n'est pas vous, supprimez les fichiers indiqués et relancez le script – ils seront retéléchargés dans la version fixée :" ;;
    es:sumsfail) echo "ATENCIÓN: estas bibliotecas han cambiado desde la instalación. Si no has sido tú, borra los archivos indicados y vuelve a ejecutar el script; se descargarán de nuevo en la versión fijada:" ;;
    de:backup) echo "Ersetzte Dateien gesichert in" ;;
    en:backup) echo "Replaced files backed up in" ;;
    fr:backup) echo "Fichiers remplacés sauvegardés dans" ;;
    de:platzhalter) echo "pb_public/index.html ist nur der Platzhalter aus dem Repository – das Update ist nicht vollständig. Bitte den entpackten Release-Ordner (z. B. pinn-1.39.0) in den Projektordner legen und  sudo sh pinn-*/pinn-setup.sh  ausführen." ;;
    en:platzhalter) echo "pb_public/index.html is only the placeholder from the repository – the update is incomplete. Please put the unzipped release folder (e.g. pinn-1.39.0) into the project folder and run  sudo sh pinn-*/pinn-setup.sh" ;;
    fr:platzhalter) echo "pb_public/index.html n'est que le fichier de remplacement du dépôt – la mise à jour est incomplète. Placez le dossier de la version décompressé (p. ex. pinn-1.39.0) dans le dossier du projet et lancez  sudo sh pinn-*/pinn-setup.sh" ;;
    es:platzhalter) echo "pb_public/index.html es solo el marcador del repositorio – la actualización está incompleta. Coloca la carpeta descomprimida de la versión (p. ej. pinn-1.39.0) en la carpeta del proyecto y ejecuta  sudo sh pinn-*/pinn-setup.sh" ;;
  esac
}

ROT='\033[31m'; GRUEN='\033[32m'; GELB='\033[33m'; FETT='\033[1m'; NORMAL='\033[0m'
ok()     { printf "${GRUEN}✔ %s${NORMAL}\n" "$1"; }
warn()   { printf "${GELB}! %s${NORMAL}\n" "$1"; }
fehler() { printf "${ROT}✘ %s${NORMAL}\n" "$1"; }

echo
printf "${FETT}pinn. – Setup${NORMAL}  ($PROJEKT)\n\n"

# ── 1. Requirements ─────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then fehler "$(m root)"; exit 1; fi
if ! command -v docker >/dev/null 2>&1; then fehler "$(m docker)"; exit 1; fi
CV=$(docker compose version --short 2>/dev/null | sed 's/^v//')
if [ -z "$CV" ]; then fehler "$(m compose)"; exit 1; fi
CMAJ=$(echo "$CV" | cut -d. -f1); CMIN=$(echo "$CV" | cut -d. -f2)
if [ "$CMAJ" -lt 2 ] || { [ "$CMAJ" -eq 2 ] && [ "$CMIN" -lt 17 ]; }; then fehler "$(m compose) ($CV)"; exit 1; fi
ok "Docker Compose $CV"

# ── 2. Put files into place ─────────────────────────────────
echo "  $(m sort)"
TS=$(date +%Y-%m-%d_%H%M%S)
ALT="_alt/$TS"
ANZ=0
NEU_GELADEN=""   # library files added in this run (for the checksums)
LISTE=$(mktemp 2>/dev/null || echo "/tmp/pinn-setup.$$")

# Strip download suffixes: "file (1).js" → "file.js", "x_pb.js" → "x.pb.js", "x.pb.js.txt" → "x.pb.js"
normname() {
  echo "$1" | sed -e 's/ ([0-9]*)\././' -e 's/ ([0-9]*)$//' -e 's/\.pb\.js\.txt$/.pb.js/' -e 's/_pb\.js$/.pb.js/'
}
# Target path (relative to the project) for a single loose file – empty = stays where it is
ziel() {
  case "$1" in
    *.pb.js)                         echo "pb_hooks/$1" ;;
    pinn-setup.sh|pinn-pocketbase-update.sh|pinn-wartung.sh|docker-compose.yaml|docker-compose.yml|env.txt|.env) echo "" ;;
    pinn-*.js|calendar-sync.js)      echo "pb_hooks/$1" ;;
    index.html|manifest.json|einrichtung.js|datenexport.js|*.png|*.ico|*.svg|*.webmanifest) echo "pb_public/$1" ;;
    [a-z][a-z].js)                   echo "pb_public/lang/$1" ;;
    pinn.css)                        echo "pb_public/vendor/pinn.css" ;;
    pocketbase_umd.js|pocketbase.umd.js|pocketbase.umd.min.js) echo "pb_public/vendor/pocketbase/pocketbase.umd.js" ;;
    pdf.min.mjs|pdf.worker.min.mjs)  echo "pb_public/vendor/pdfjs/$1" ;;
    Caddyfile)                       echo "caddy/Caddyfile" ;;
    *) echo "" ;;
  esac
}
# The index.html at the top of the repository is only a placeholder – recognised by its marker
platzhalter() { grep -q 'pinn-repo-placeholder' "$1" 2>/dev/null; }

# Move one file to its target (relative to the project); an existing different file goes to _alt/
uebernehmen() {   # uebernehmen <source> <target> <name shown in the output>
  QUELLE="$1"; ZIEL="$2"
  [ "$QUELLE" = "./$ZIEL" ] && return 0
  mkdir -p "$(dirname "$ZIEL")"
  if [ -f "$ZIEL" ]; then
    if cmp -s "$QUELLE" "$ZIEL"; then rm -f "$QUELLE"; return 0; fi
    mkdir -p "$ALT/$(dirname "$ZIEL")"
    mv "$ZIEL" "$ALT/$ZIEL"
  fi
  mv "$QUELLE" "$ZIEL"
  case "$ZIEL" in pb_public/vendor/pdfjs/*|pb_public/vendor/tesseract/*) NEU_GELADEN="$NEU_GELADEN $ZIEL" ;; esac
  echo "    $3 → $ZIEL"
  ANZ=$((ANZ + 1))
}

# A single loose file (project folder, "neu", or the top level of a release folder)
einsortieren() {
  QUELLE="$1"
  [ -f "$QUELLE" ] || return 0
  BASIS=$(basename "$QUELLE")
  NAME=$(normname "$BASIS")
  if [ "$NAME" = "index.html" ] && platzhalter "$QUELLE"; then
    # placeholder: never install it; remove it from release folders, leave it in a git checkout
    [ "$(dirname "$QUELLE")" = "." ] || rm -f "$QUELLE"
    return 0
  fi
  ZIEL=$(ziel "$NAME")
  if [ -z "$ZIEL" ]; then
    # belongs into the project folder itself (e.g. docker-compose.yaml from "neu")
    [ "$(dirname "$QUELLE")" = "." ] && [ "$BASIS" = "$NAME" ] && return 0
    ZIEL="$NAME"
  fi
  uebernehmen "$QUELLE" "$ZIEL" "$BASIS"
}

# A whole release folder: loose top-level files as above, then the folders pb_hooks/, pb_public/
# and caddy/Caddyfile 1:1 at the same relative path. Anything else (.github, tests …) is not installed.
paket_einsortieren() {   # paket_einsortieren <folder>
  PK="$1"
  [ -d "$PK" ] || return 0
  for f in "$PK"/*; do
    [ -f "$f" ] || continue
    einsortieren "$f"
  done
  : > "$LISTE"
  [ -d "$PK/pb_hooks" ]  && find "$PK/pb_hooks"  -type f >> "$LISTE"
  [ -d "$PK/pb_public" ] && find "$PK/pb_public" -type f >> "$LISTE"
  [ -f "$PK/caddy/Caddyfile" ] && echo "$PK/caddy/Caddyfile" >> "$LISTE"
  sort -o "$LISTE" "$LISTE"
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    REL=${f#"$PK"/}
    B=$(basename "$REL"); D=$(dirname "$REL")
    case "$B" in .DS_Store|._*|Thumbs.db|*.part) rm -f "$f"; continue ;; esac
    N=$(normname "$B")
    uebernehmen "$f" "$D/$N" "$REL"
  done < "$LISTE"
  # Repository leftovers that don't belong on the NAS, then the (now empty) folders
  rm -rf "$PK/.github" "$PK/.gitignore" "$PK/.gitattributes" "$PK/__MACOSX"
  find "$PK" -depth -type d 2>/dev/null | while IFS= read -r d; do rmdir "$d" 2>/dev/null; done
}

# Loose files in the project folder and in "neu"
for f in ./* ./neu/*; do
  [ -f "$f" ] || continue
  einsortieren "$f"
done
rmdir neu 2>/dev/null
# Release folders: if started from one, only that one; otherwise every release folder found
if [ -n "$EIGENER_ORDNER" ]; then
  paket_einsortieren "./$EIGENER_ORDNER"
else
  for d in ./pinn-main ./pinn-master ./pinn-[0-9]* ./pinn-v[0-9]*; do
    [ -d "$d" ] || continue
    paket_einsortieren "$d"
  done
fi
rm -f "$LISTE"
# Hook files already in pb_hooks, but with a download suffix
for f in pb_hooks/*; do
  [ -f "$f" ] || continue
  B=$(basename "$f"); N=$(normname "$B")
  [ "$B" = "$N" ] && continue
  if [ -f "pb_hooks/$N" ]; then mkdir -p "$ALT/pb_hooks"; mv "pb_hooks/$N" "$ALT/pb_hooks/$N"; fi
  mv "$f" "pb_hooks/$N"; echo "    pb_hooks/$B → pb_hooks/$N"; ANZ=$((ANZ + 1))
done
if [ "$ANZ" -gt 0 ]; then ok "$ANZ $(m sorted)"; else ok "$(m nothing)"; fi
[ -d "$ALT" ] && echo "  $(m backup) $ALT"

if [ ! -f docker-compose.yaml ] && [ ! -f docker-compose.yml ]; then fehler "$(m nocompose)"; exit 1; fi
# The placeholder must never be the installed app
if platzhalter pb_public/index.html; then fehler "$(m platzhalter)"; exit 1; fi

# ── 3. Folders and basic files ──────────────────────────────
mkdir -p pb_data pb_public/lang pb_public/vendor/pocketbase pb_public/vendor/pdfjs pb_public/vendor/tesseract pb_hooks \
         caddy/data caddy/config konfig backups wartung traccar/data traccar/logs tailscale
chmod 700 konfig backups wartung 2>/dev/null
ok "$(m dirs)"

if [ ! -f .env ]; then
  if [ -f env.txt ]; then cp env.txt .env; else : > .env; fi
  chmod 600 .env
  ok "$(m env)"
fi

if [ ! -f caddy/Caddyfile ]; then
  cat > caddy/Caddyfile <<'CADDY'
# pinn. – Caddy (HTTPS via DuckDNS). Subdomain and token come from the setup in pinn.
{
	auto_https disable_redirects
}

{$DUCKDNS_SUBDOMAIN}.duckdns.org {
	tls {
		dns duckdns {$DUCKDNS_TOKEN}
		resolvers 1.1.1.1 9.9.9.9
	}
	encode zstd gzip
	reverse_proxy pocketbase:80
}
CADDY
fi

# Libraries for PDF import (pdf.js) and "read photo" (Tesseract) – self-hosted on the NAS so that
# pinn. never loads code from third-party servers. If they are missing (new installation), the
# script downloads them once. Files that are already there are left untouched.
# Pinned versions (since 1.38.1): npm versions are immutable – exactly this file is always
# downloaded, never a newer one automatically. Only enter new versions here on purpose.
PDFJS_VERSION=4.10.38
TESSERACT_VERSION=5.1.1
TESSERACT_CORE_VERSION=5.1.1
TESSERACT_DEU_VERSION=1.0.0
hole() {  # hole <URL> <target>
  [ -s "$2" ] && return 0
  mkdir -p "$(dirname "$2")"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --proto '=https' --retry 2 --connect-timeout 15 -o "$2.part" "$1" 2>/dev/null
  else
    wget -q -T 30 -O "$2.part" "$1" 2>/dev/null
  fi
  if [ -s "$2.part" ]; then mv "$2.part" "$2"; NEU_GELADEN="$NEU_GELADEN $2"; return 0; fi
  rm -f "$2.part"; return 1
}
V=pb_public/vendor
CDN=https://cdn.jsdelivr.net/npm
if [ ! -s "$V/pdfjs/pdf.min.mjs" ] || [ ! -s "$V/pdfjs/pdf.worker.min.mjs" ] || [ ! -s "$V/tesseract/tesseract.min.js" ] \
   || [ ! -s "$V/tesseract/worker.min.js" ] || [ ! -s "$V/tesseract/lang/deu.traineddata.gz" ]; then
  echo "  $(m libs)"
  LF=0
  hole "$CDN/pdfjs-dist@$PDFJS_VERSION/build/pdf.min.mjs"        "$V/pdfjs/pdf.min.mjs"        || LF=1
  hole "$CDN/pdfjs-dist@$PDFJS_VERSION/build/pdf.worker.min.mjs" "$V/pdfjs/pdf.worker.min.mjs" || LF=1
  hole "$CDN/tesseract.js@$TESSERACT_VERSION/dist/tesseract.min.js" "$V/tesseract/tesseract.min.js" || LF=1
  hole "$CDN/tesseract.js@$TESSERACT_VERSION/dist/worker.min.js"    "$V/tesseract/worker.min.js"    || LF=1
  for c in tesseract-core tesseract-core-simd tesseract-core-lstm tesseract-core-simd-lstm; do
    hole "$CDN/tesseract.js-core@$TESSERACT_CORE_VERSION/$c.wasm.js" "$V/tesseract/core/$c.wasm.js" || LF=1
  done
  for c in tesseract-core-relaxedsimd tesseract-core-relaxedsimd-lstm; do   # nur neuere Versionen
    hole "$CDN/tesseract.js-core@$TESSERACT_CORE_VERSION/$c.wasm.js" "$V/tesseract/core/$c.wasm.js" || true
  done
  hole "$CDN/@tesseract.js-data/deu@$TESSERACT_DEU_VERSION/4.0.0_best_int/deu.traineddata.gz" "$V/tesseract/lang/deu.traineddata.gz" || LF=1
  if [ "$LF" -eq 0 ]; then ok "$(m libsok)"; else warn "$(m libsfail)"; fi
else
  ok "$(m libsok)"
fi

# Library checksums (pb_public/vendor/SHA256SUMS): the first run records what every file looks
# like; newly downloaded files are added. Every later run (including updates via the button)
# checks whether anything has changed since – if so, a warning is shown.
SUMS="$V/SHA256SUMS"
if command -v sha256sum >/dev/null 2>&1; then
  touch "$SUMS"; chmod 644 "$SUMS" 2>/dev/null
  NEU_EINTRAG=0
  # newly downloaded or newly installed files: replace the old entry
  for f in $NEU_GELADEN; do
    [ -s "$f" ] || continue
    awk -v p="$f" '$2 != p' "$SUMS" > "$SUMS.tmp" && mv "$SUMS.tmp" "$SUMS"
    sha256sum "$f" >> "$SUMS"; NEU_EINTRAG=1
  done
  # existing files without an entry yet (existing installations on their first run)
  for f in $(find "$V/pdfjs" "$V/tesseract" -type f ! -name '*.part' 2>/dev/null | sort); do
    awk -v p="$f" '$2 == p { gef=1 } END { exit gef ? 0 : 1 }' "$SUMS" && continue
    sha256sum "$f" >> "$SUMS"; NEU_EINTRAG=1
  done
  # remove entries for files that no longer exist
  awk '{ print $2 }' "$SUMS" | while read -r f; do
    [ -f "$f" ] || { awk -v p="$f" '$2 != p' "$SUMS" > "$SUMS.tmp" && mv "$SUMS.tmp" "$SUMS"; }
  done
  [ "$NEU_EINTRAG" -eq 1 ] && ok "$(m sumsneu)"
  if [ -s "$SUMS" ]; then
    GEAENDERT=$(sha256sum -c "$SUMS" 2>/dev/null | grep -v ': OK$' | sed 's/: .*$//')
    if [ -z "$GEAENDERT" ]; then
      ok "$(m sumsok)"
    else
      warn "$(m sumsfail)"
      for f in $GEAENDERT; do echo "    $f"; done
    fi
  fi
fi

# Report missing helper modules (loaded via require())
FEHLT=""
for mod in $(grep -ho 'require(`${__hooks}/[^`]*`)' pb_hooks/*.pb.js pb_hooks/*.js 2>/dev/null \
           | sed 's/.*__hooks}\/\([^`]*\)`)/\1/' | sort -u); do
  [ -f "pb_hooks/$mod" ] || FEHLT="$FEHLT $mod"
done
if [ -n "$FEHLT" ]; then
  warn "$(m hooks)"
  for mod in $FEHLT; do echo "    $mod"; done
fi

# ── 4. Start ────────────────────────────────────────────────
# The former container "backup" has been merged into the container "wartung" – remove the old one,
# otherwise it would keep backing up and delete older weekly backups.
if ! grep -q 'container_name: backup' docker-compose.yaml 2>/dev/null; then
  docker rm -f backup >/dev/null 2>&1
fi
echo "  $(m start)"
if ! docker compose up -d --build; then fehler "$(m startfail)"; exit 1; fi
# PocketBase reads pb_hooks only at startup: restart once after new files
if [ "$ANZ" -gt 0 ]; then docker restart pocketbase >/dev/null 2>&1; fi

echo "  $(m wait)"
LAEUFT=0
for i in $(seq 1 90); do
  if docker exec pocketbase wget -qO- http://127.0.0.1:80/api/health >/dev/null 2>&1; then LAEUFT=1; break; fi
  sleep 2
done
if [ "$LAEUFT" -ne 1 ]; then fehler "$(m noresp)"; exit 1; fi
ok "$(m running)"

# ── 5. What's next? ─────────────────────────────────────────
IP=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1)
[ -z "$IP" ] && IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP="<NAS-IP>"
ADR=""
if [ -f konfig/einrichtung.json ] && grep -q '"fertig": *true' konfig/einrichtung.json; then
  ADR=$(grep -o "^export PINN_ADRESSE='[^']*'" konfig/pinn.env 2>/dev/null | sed "s/^export PINN_ADRESSE='\(.*\)'$/\1/")
fi

echo
echo "  ─────────────────────────────────────────────────────"
if [ -n "$ADR" ]; then
  printf "  $(m done)\n\n      ${FETT}%s${NORMAL}\n\n" "$ADR"
  printf "  $(m local)  http://%s:8090\n" "$IP"
else
  printf "  $(m next1)\n\n      ${FETT}http://%s:8090${NORMAL}\n\n" "$IP"
  echo "  $(m next2)"
  echo "  $(m next3)"
fi
echo "  ─────────────────────────────────────────────────────"
echo
