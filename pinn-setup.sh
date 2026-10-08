#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  pinn. – Installation und Update in einem Schritt („setup.exe“ für das NAS)
#
#  So geht's:
#   1. Im UGREEN-Dateimanager einen Ordner anlegen, z. B. /volume1/docker/Pocketbase
#      (bei einem Update: der bestehende Projektordner).
#   2. ALLE heruntergeladenen pinn.-Dateien einfach in diesen Ordner legen – oder in einen
#      Unterordner „neu“ darin. Die Reihenfolge und Namen wie „datei (1).js“ sind egal.
#      Von GitHub („Code → Download ZIP“ oder ZIP eines Releases): den entpackten Ordner
#      („pinn-main“ bzw. z. B. „pinn-1.22.1“) einfach so, wie er ist, in diesen Ordner legen.
#   3. Per SSH anmelden und ausführen:
#        cd /volume1/docker/Pocketbase && sudo sh pinn-*/pinn-setup.sh
#      (liegen die Dateien lose im Ordner:  sudo sh pinn-setup.sh)
#   4. Das Skript sortiert alles an die richtige Stelle, legt fehlende Ordner an, startet pinn.
#      und zeigt die Adresse, unter der die Einrichtung im Browser weitergeht.
#
#  Sprache der Ausgabe: automatisch (Deutsch, Englisch, Französisch, Spanisch),
#  fest wählbar mit z. B.:  sudo sh pinn-setup.sh --lang en
#  Ersetzte Dateien landen zur Sicherheit in _alt/<Datum>/.
#  Ist pinn. einmal installiert, gehen Updates auch per Knopf in der App (Einstellungen → System →
#  Sicherungen & Updates) – der Container „wartung“ ruft dafür genau dieses Skript auf.
# ─────────────────────────────────────────────────────────────

cd "$(dirname "$0")" || exit 1
# Aus dem entpackten GitHub-Ordner gestartet (pinn-main/pinn-setup.sh, pinn-1.22.1/pinn-setup.sh …)?
# Dann ist der Projektordner eine Ebene höher.
case "$(basename "$(pwd)")" in
  pinn-main|pinn-master|pinn-[0-9]*|pinn-v[0-9]*) cd .. || exit 1 ;;
esac
PROJEKT=$(pwd)

# ── Sprache ─────────────────────────────────────────────────
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
    de:backup) echo "Ersetzte Dateien gesichert in" ;;
    en:backup) echo "Replaced files backed up in" ;;
    fr:backup) echo "Fichiers remplacés sauvegardés dans" ;;
    es:backup) echo "Archivos sustituidos guardados en" ;;
  esac
}

ROT='\033[31m'; GRUEN='\033[32m'; GELB='\033[33m'; FETT='\033[1m'; NORMAL='\033[0m'
ok()     { printf "${GRUEN}✔ %s${NORMAL}\n" "$1"; }
warn()   { printf "${GELB}! %s${NORMAL}\n" "$1"; }
fehler() { printf "${ROT}✘ %s${NORMAL}\n" "$1"; }

echo
printf "${FETT}pinn. – Setup${NORMAL}  ($PROJEKT)\n\n"

# ── 1. Voraussetzungen ──────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then fehler "$(m root)"; exit 1; fi
if ! command -v docker >/dev/null 2>&1; then fehler "$(m docker)"; exit 1; fi
CV=$(docker compose version --short 2>/dev/null | sed 's/^v//')
if [ -z "$CV" ]; then fehler "$(m compose)"; exit 1; fi
CMAJ=$(echo "$CV" | cut -d. -f1); CMIN=$(echo "$CV" | cut -d. -f2)
if [ "$CMAJ" -lt 2 ] || { [ "$CMAJ" -eq 2 ] && [ "$CMIN" -lt 17 ]; }; then fehler "$(m compose) ($CV)"; exit 1; fi
ok "Docker Compose $CV"

# ── 2. Dateien einsortieren ─────────────────────────────────
echo "  $(m sort)"
TS=$(date +%Y-%m-%d_%H%M%S)
ALT="_alt/$TS"
ANZ=0

# Download-Zusätze entfernen: „datei (1).js“ → „datei.js“, „x_pb.js“ → „x.pb.js“, „x.pb.js.txt“ → „x.pb.js“
normname() {
  echo "$1" | sed -e 's/ ([0-9]*)\././' -e 's/ ([0-9]*)$//' -e 's/\.pb\.js\.txt$/.pb.js/' -e 's/_pb\.js$/.pb.js/'
}
# Zielordner (relativ zum Projekt) und Zielname für eine Datei – leer = bleibt, wo sie ist
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
einsortieren() {
  QUELLE="$1"
  [ -f "$QUELLE" ] || return 0
  BASIS=$(basename "$QUELLE")
  NAME=$(normname "$BASIS")
  ZIEL=$(ziel "$NAME")
  if [ -z "$ZIEL" ]; then
    # gehört in den Projektordner selbst (z. B. docker-compose.yaml aus „neu“)
    [ "$(dirname "$QUELLE")" = "." ] && [ "$BASIS" = "$NAME" ] && return 0
    ZIEL="$NAME"
  fi
  [ "$QUELLE" = "./$ZIEL" ] && return 0
  mkdir -p "$(dirname "$ZIEL")"
  if [ -f "$ZIEL" ]; then
    if cmp -s "$QUELLE" "$ZIEL"; then rm -f "$QUELLE"; return 0; fi
    mkdir -p "$ALT/$(dirname "$ZIEL")"
    mv "$ZIEL" "$ALT/$ZIEL"
  fi
  mv "$QUELLE" "$ZIEL"
  echo "    $BASIS → $ZIEL"
  ANZ=$((ANZ + 1))
}
for f in ./* ./neu/* ./pinn-main/* ./pinn-master/* ./pinn-[0-9]*/* ./pinn-v[0-9]*/*; do
  [ -f "$f" ] || continue
  einsortieren "$f"
done
rmdir neu 2>/dev/null
# Entpackter GitHub-Ordner: Repository-Reste (.github, .gitignore) entfernen, dann den Ordner selbst
for d in pinn-main pinn-master pinn-[0-9]* pinn-v[0-9]*; do
  [ -d "$d" ] || continue
  rm -rf "$d/.github" "$d/.gitignore" "$d/.gitattributes"
  rmdir "$d" 2>/dev/null
done
# Hook-Dateien, die schon in pb_hooks liegen, aber einen Download-Zusatz tragen
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

# ── 3. Ordner und Grunddateien ──────────────────────────────
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
# pinn. – Caddy (HTTPS über DuckDNS). Subdomain und Token kommen aus der Einrichtung in pinn.
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

# Bibliotheken für PDF-Import (pdf.js) und „Foto einlesen“ (Tesseract) – liegen selbst gehostet auf
# dem NAS, damit pinn. keinen Code von fremden Servern lädt. Fehlen sie (Neuinstallation), lädt das
# Skript sie einmalig herunter. Schon vorhandene Dateien bleiben unangetastet.
hole() {  # hole <URL> <Ziel>
  [ -s "$2" ] && return 0
  mkdir -p "$(dirname "$2")"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 2 --connect-timeout 15 -o "$2.part" "$1" 2>/dev/null
  else
    wget -q -T 30 -O "$2.part" "$1" 2>/dev/null
  fi
  if [ -s "$2.part" ]; then mv "$2.part" "$2"; return 0; fi
  rm -f "$2.part"; return 1
}
V=pb_public/vendor
CDN=https://cdn.jsdelivr.net/npm
if [ ! -s "$V/pdfjs/pdf.min.mjs" ] || [ ! -s "$V/tesseract/tesseract.min.js" ] || [ ! -s "$V/tesseract/lang/deu.traineddata.gz" ]; then
  echo "  $(m libs)"
  LF=0
  hole "$CDN/pdfjs-dist@4/build/pdf.min.mjs"        "$V/pdfjs/pdf.min.mjs"        || LF=1
  hole "$CDN/pdfjs-dist@4/build/pdf.worker.min.mjs" "$V/pdfjs/pdf.worker.min.mjs" || LF=1
  hole "$CDN/tesseract.js@5/dist/tesseract.min.js"  "$V/tesseract/tesseract.min.js" || LF=1
  hole "$CDN/tesseract.js@5/dist/worker.min.js"     "$V/tesseract/worker.min.js"    || LF=1
  for c in tesseract-core tesseract-core-simd tesseract-core-lstm tesseract-core-simd-lstm; do
    hole "$CDN/tesseract.js-core@5/$c.wasm.js" "$V/tesseract/core/$c.wasm.js" || LF=1
  done
  for c in tesseract-core-relaxedsimd tesseract-core-relaxedsimd-lstm; do   # nur neuere Versionen
    hole "$CDN/tesseract.js-core@5/$c.wasm.js" "$V/tesseract/core/$c.wasm.js" || true
  done
  hole "$CDN/@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz" "$V/tesseract/lang/deu.traineddata.gz" || LF=1
  if [ "$LF" -eq 0 ]; then ok "$(m libsok)"; else warn "$(m libsfail)"; fi
else
  ok "$(m libsok)"
fi

# Fehlende Hilfsdateien (per require() eingebunden) melden
FEHLT=""
for mod in $(grep -ho 'require(`${__hooks}/[^`]*`)' pb_hooks/*.pb.js pb_hooks/*.js 2>/dev/null \
           | sed 's/.*__hooks}\/\([^`]*\)`)/\1/' | sort -u); do
  [ -f "pb_hooks/$mod" ] || FEHLT="$FEHLT $mod"
done
if [ -n "$FEHLT" ]; then
  warn "$(m hooks)"
  for mod in $FEHLT; do echo "    $mod"; done
fi

# ── 4. Starten ──────────────────────────────────────────────
# Der frühere Container „backup“ ist im Container „wartung“ aufgegangen – den alten entfernen,
# sonst würde er weiter sichern und ältere Wochensicherungen löschen.
if ! grep -q 'container_name: backup' docker-compose.yaml 2>/dev/null; then
  docker rm -f backup >/dev/null 2>&1
fi
echo "  $(m start)"
if ! docker compose up -d --build; then fehler "$(m startfail)"; exit 1; fi
# PocketBase liest pb_hooks nur beim Start: nach neuen Dateien einmal neu starten
if [ "$ANZ" -gt 0 ]; then docker restart pocketbase >/dev/null 2>&1; fi

echo "  $(m wait)"
LAEUFT=0
for i in $(seq 1 90); do
  if docker exec pocketbase wget -qO- http://127.0.0.1:80/api/health >/dev/null 2>&1; then LAEUFT=1; break; fi
  sleep 2
done
if [ "$LAEUFT" -ne 1 ]; then fehler "$(m noresp)"; exit 1; fi
ok "$(m running)"

# ── 5. Wie geht's weiter? ───────────────────────────────────
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
