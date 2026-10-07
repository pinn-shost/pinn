#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  pinn. – PocketBase aktualisieren und Hooks wieder zum Laufen bringen
#
#  Liegt neben der docker-compose.yaml in /volume1/docker/Pocketbase.
#  Aufruf per SSH:   cd /volume1/docker/Pocketbase && sudo sh pinn-pocketbase-update.sh
#
#  Ablauf:
#   1. Prüft Docker Compose
#   2. Erstellt sofort ein Backup (Container „backup“)
#   3. Repariert Hook-Dateinamen in pb_hooks (z. B. kurse_pb.js -> kurse.pb.js)
#   4. Prüft, ob alle per require() eingebundenen Hilfsdateien vorhanden sind
#   5. Baut PocketBase in der Version aus der docker-compose.yaml und startet neu
#   6. Prüft Erreichbarkeit, Hooks und Log – und zeigt bei Fehlern, wie es zurückgeht
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

# ── 1. Docker Compose prüfen ────────────────────────────────
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
if docker ps --format '{{.Names}}' | grep -qx backup; then
  echo "  Backup läuft …"
  if docker exec backup /usr/local/bin/pinn-backup >/tmp/pinn-backup.log 2>&1; then
    ok "Backup erstellt: $(ls -t backups/pinn_*.tar.gz 2>/dev/null | head -1)"
  else
    fehler "Backup fehlgeschlagen – Abbruch, es wurde nichts verändert."
    cat /tmp/pinn-backup.log
    exit 1
  fi
else
  warn "Container „backup“ läuft nicht – erstelle Sicherung von pb_data direkt …"
  TS=$(date +%Y-%m-%d_%H%M); mkdir -p backups
  docker stop pocketbase >/dev/null 2>&1
  if tar -czf "backups/pinn_vor-update_$TS.tar.gz" pb_data pb_hooks pb_public docker-compose.yaml .env 2>/dev/null; then
    ok "Sicherung: backups/pinn_vor-update_$TS.tar.gz"
  else
    fehler "Sicherung fehlgeschlagen – Abbruch."
    docker start pocketbase >/dev/null 2>&1
    exit 1
  fi
fi

# ── 3. Hook-Dateinamen reparieren ───────────────────────────
# PocketBase lädt in pb_hooks nur Dateien, die auf „.pb.js“ enden.
# Beim Herunterladen werden daraus manchmal „_pb.js“ oder „.pb (1).js“.
mkdir -p pb_hooks/_alt
UMB=0
for f in pb_hooks/*_pb.js pb_hooks/*.pb\ \(*\).js pb_hooks/*.pb.js.txt; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  ziel=$(echo "$base" | sed -e 's/_pb\.js$/.pb.js/' -e 's/\.pb ([0-9]*)\.js$/.pb.js/' -e 's/\.pb\.js\.txt$/.pb.js/')
  if [ -f "pb_hooks/$ziel" ]; then
    # beide vorhanden: die neuere Datei gewinnt, die ältere wandert nach pb_hooks/_alt
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
# Hilfsdateien mit Download-Zusatz wie „pinn-push (1).js“
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

# Hook-Dateien, die versehentlich in pb_public liegen
FALSCH=$(ls pb_public/*.pb.js pb_public/*_pb.js pb_public/calendar-sync.js 2>/dev/null)
if [ -n "$FALSCH" ]; then
  warn "Diese Dateien liegen in pb_public, gehören aber nach pb_hooks:"
  echo "$FALSCH" | sed 's/^/    /'
fi

# ── 4. Eingebundene Hilfsdateien prüfen ─────────────────────
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

# ── 5. Bauen und starten ────────────────────────────────────
echo "  PocketBase $PB_SOLL wird gebaut und gestartet …"
START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if ! docker compose up -d --build pocketbase; then
  fehler "Bauen/Starten fehlgeschlagen (Internetzugang des NAS zu github.com prüfen)."
  exit 1
fi

# ── 6. Prüfen ───────────────────────────────────────────────
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
  # /sw.js wird von einem Hook ausgeliefert – antwortet er, sind die Hooks geladen
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
