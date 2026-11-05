#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  pinn. – Update PocketBase and get the hooks running again
#
#  Lies next to docker-compose.yaml in /volume1/docker/Pocketbase.
#  Call via SSH:   cd /volume1/docker/Pocketbase && sudo sh pinn-pocketbase-update.sh
#
#  Flow:
#   1. Checks Docker Compose
#   2. Creates a backup right away (container "wartung")
#   3. Repairs hook file names in pb_hooks (e.g. kurse_pb.js -> kurse.pb.js)
#   4. Checks that all helper files pulled in via require() are present
#   5. Builds PocketBase in the version from docker-compose.yaml and restarts
#   6. Checks reachability, hooks and log – and shows how to go back on errors
# ─────────────────────────────────────────────────────────────

cd "$(dirname "$0")" || exit 1
ROT='\033[31m'; GRUEN='\033[32m'; GELB='\033[33m'; NORMAL='\033[0m'
ok()     { printf "${GRUEN}✔ %s${NORMAL}\n" "$1"; }
warn()   { printf "${GELB}! %s${NORMAL}\n" "$1"; }
fehler() { printf "${ROT}✘ %s${NORMAL}\n" "$1"; }

if [ ! -f docker-compose.yaml ]; then
  fehler "docker-compose.yaml nicht gefunden – Skript bitte in /volume1/docker/Pocketbase ablegen."
  exit 1
fi

# ── 1. Check Docker Compose ─────────────────────────────────
CV=$(docker compose version --short 2>/dev/null | sed 's/^v//')
if [ -z "$CV" ]; then
  fehler "„docker compose“ nicht verfügbar."
  exit 1
fi
CMAJ=$(echo "$CV" | cut -d. -f1); CMIN=$(echo "$CV" | cut -d. -f2)
if [ "$CMAJ" -lt 2 ] || { [ "$CMAJ" -eq 2 ] && [ "$CMIN" -lt 17 ]; }; then
  fehler "Docker Compose $CV ist zu alt (mindestens 2.17 nötig). Bitte im UGOS-App-Center Docker aktualisieren."
  exit 1
fi
ok "Docker Compose $CV"

PB_SOLL=$(grep -E '^x-pocketbase-version:' docker-compose.yaml | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
PB_IST=$(docker exec pocketbase pocketbase --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo "  PocketBase jetzt: ${PB_IST:-unbekannt / läuft nicht}   →   Ziel: ${PB_SOLL:-?}"

# ── 2. Backup ───────────────────────────────────────────────
if docker ps --format '{{.Names}}' | grep -qx wartung; then
  echo "  Backup läuft …"
  if docker exec wartung sh /projekt/pinn-wartung.sh sichern vor-update >/tmp/pinn-backup.log 2>&1; then
    ok "Backup erstellt: $(ls -t backups/pinn_*.tar.gz 2>/dev/null | head -1)"
  else
    fehler "Backup fehlgeschlagen – Abbruch, es wurde nichts verändert."
    cat /tmp/pinn-backup.log
    exit 1
  fi
elif docker ps --format '{{.Names}}' | grep -qx backup; then
  echo "  Backup läuft …"
  if docker exec backup /usr/local/bin/pinn-backup >/tmp/pinn-backup.log 2>&1; then
    ok "Backup erstellt: $(ls -t backups/pinn_*.tar.gz 2>/dev/null | head -1)"
  else
    fehler "Backup fehlgeschlagen – Abbruch, es wurde nichts verändert."
    cat /tmp/pinn-backup.log
    exit 1
  fi
else
  warn "Container „wartung“ läuft nicht – erstelle Sicherung von pb_data direkt …"
  TS=$(date +%Y-%m-%d_%H%M); mkdir -p backups
  docker stop pocketbase >/dev/null 2>&1
  if tar -czf "backups/pinn_${TS}_vor-update.tar.gz" pb_data pb_hooks pb_public docker-compose.yaml .env 2>/dev/null; then
    ok "Sicherung: backups/pinn_${TS}_vor-update.tar.gz"
  else
    fehler "Sicherung fehlgeschlagen – Abbruch."
    docker start pocketbase >/dev/null 2>&1
    exit 1
  fi
fi

# ── 3. Repair hook file names ───────────────────────────────
# PocketBase only loads files in pb_hooks that end in ".pb.js".
# When downloading, they sometimes become "_pb.js" or ".pb (1).js".
mkdir -p pb_hooks/_alt
UMB=0
for f in pb_hooks/*_pb.js pb_hooks/*.pb\ \(*\).js pb_hooks/*.pb.js.txt; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  ziel=$(echo "$base" | sed -e 's/_pb\.js$/.pb.js/' -e 's/\.pb ([0-9]*)\.js$/.pb.js/' -e 's/\.pb\.js\.txt$/.pb.js/')
  if [ -f "pb_hooks/$ziel" ]; then
    # both present: the newer file wins, the older one moves to pb_hooks/_alt
    if [ "$f" -nt "pb_hooks/$ziel" ]; then
      mv "pb_hooks/$ziel" "pb_hooks/_alt/$ziel.$(date +%s)"
      mv "$f" "pb_hooks/$ziel"
    else
      mv "$f" "pb_hooks/_alt/$base"
    fi
  else
    mv "$f" "pb_hooks/$ziel"
  fi
  echo "  $base → $ziel"
  UMB=$((UMB + 1))
done
# Helper files with a download suffix like "pinn-push (1).js"
for f in pb_hooks/*\ \([0-9]*\).js; do
  [ -f "$f" ] || continue
  base=$(basename "$f"); ziel=$(echo "$base" | sed 's/ ([0-9]*)\.js$/.js/')
  [ -f "pb_hooks/$ziel" ] && mv "pb_hooks/$ziel" "pb_hooks/_alt/$ziel.$(date +%s)"
  mv "$f" "pb_hooks/$ziel"; echo "  $base → $ziel"; UMB=$((UMB + 1))
done
rmdir pb_hooks/_alt 2>/dev/null
[ "$UMB" -gt 0 ] && ok "$UMB Datei(en) in pb_hooks umbenannt" || ok "Dateinamen in pb_hooks sind in Ordnung"

HOOKS=$(ls pb_hooks/*.pb.js 2>/dev/null | wc -l)
if [ "$HOOKS" -eq 0 ]; then
  fehler "Keine einzige *.pb.js in pb_hooks – die Hook-Dateien fehlen komplett."
  exit 1
fi
ok "$HOOKS Hook-Dateien (*.pb.js) gefunden"

# Hook files that accidentally lie in pb_public
FALSCH=$(ls pb_public/*.pb.js pb_public/*_pb.js pb_public/calendar-sync.js 2>/dev/null)
if [ -n "$FALSCH" ]; then
  warn "Diese Dateien liegen in pb_public, gehören aber nach pb_hooks:"
  echo "$FALSCH" | sed 's/^/    /'
fi

# ── 4. Check included helper files ──────────────────────────
FEHLT=""
for m in $(grep -ho 'require(`${__hooks}/[^`]*`)' pb_hooks/*.pb.js pb_hooks/*.js 2>/dev/null \
           | sed 's/.*__hooks}\/\([^`]*\)`)/\1/' | sort -u); do
  [ -f "pb_hooks/$m" ] || FEHLT="$FEHLT $m"
done
if [ -n "$FEHLT" ]; then
  fehler "Diese Hilfsdateien werden gebraucht, fehlen aber in pb_hooks:"
  for m in $FEHLT; do echo "    $m"; done
  echo "  → Dateien nach pb_hooks kopieren und das Skript erneut starten."
  exit 1
fi
ok "Alle eingebundenen Hilfsdateien vorhanden"

# ── 5. Build and start ──────────────────────────────────────
echo "  PocketBase $PB_SOLL wird gebaut und gestartet …"
START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if ! docker compose up -d --build pocketbase; then
  fehler "Bauen/Starten fehlgeschlagen (Internetzugang des NAS zu github.com prüfen)."
  exit 1
fi

# ── 6. Check ────────────────────────────────────────────────
echo "  Warte auf PocketBase …"
LAEUFT=0
for i in $(seq 1 30); do
  if docker exec pocketbase wget -qO- http://127.0.0.1:80/api/health >/dev/null 2>&1; then LAEUFT=1; break; fi
  sleep 2
done

LOG=$(docker logs pocketbase --since "$START" 2>&1)
HOOKFEHLER=$(echo "$LOG" | grep -iE 'error|panic|failed|exception|referenceerror|typeerror|syntaxerror' | grep -viE 'Error: Failed to send|level=INFO' | head -20)

if [ "$LAEUFT" -eq 1 ]; then
  ok "PocketBase $(docker exec pocketbase pocketbase --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+') läuft"
  # /sw.js is delivered by a hook – if it answers, the hooks are loaded
  if docker exec pocketbase wget -qO- http://127.0.0.1:80/sw.js 2>/dev/null | grep -q "pinn. Service Worker"; then
    ok "Hooks sind geladen (Testroute /sw.js antwortet)"
  else
    fehler "PocketBase läuft, aber die Hooks antworten nicht."
  fi
else
  fehler "PocketBase startet nicht."
fi

if [ -n "$HOOKFEHLER" ]; then
  warn "Auffällige Meldungen im Log:"
  echo "$HOOKFEHLER" | sed 's/^/    /'
fi

if [ "$LAEUFT" -ne 1 ] || [ -n "$HOOKFEHLER" ]; then
  echo
  echo "  Bitte die Ausgabe oben (oder: docker logs pocketbase --tail 80) an Claude schicken."
  echo
  echo "  Zurück zur alten Version, falls nötig:"
  echo "    1. docker compose down"
  echo "    2. tar -xzf $(ls -t backups/pinn_*.tar.gz 2>/dev/null | head -1)"
  echo "    3. In der docker-compose.yaml die Version auf \"${PB_IST:-0.23.12}\" setzen"
  echo "    4. docker compose up -d"
  echo "  (Die Datenbank wird beim Update umgestellt – darum immer das Backup zurückspielen.)"
  exit 1
fi

echo
ok "Fertig – pinn. läuft mit PocketBase $PB_SOLL und allen Hooks."
