#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  pinn. – Wartung (läuft im Container „wartung“, siehe docker-compose.yaml)
#
#  Aufgaben:
#   • Tägliche Sicherung im laufenden Betrieb (Datenbanken konsistent über SQLite gesichert)
#     Aufbewahrung rotierend: alle Sicherungen der letzten BACKUP_TAGE Tage (Standard 7),
#     danach je Kalenderwoche eine für BACKUP_WOCHEN Wochen (Standard 4).
#     Sicherungen vor einem Update bzw. vor einer Wiederherstellung: die letzten 3 bleiben.
#   • Aufträge aus der App (Einstellungen → System → Sicherungen & Updates):
#       sichern           – Sicherung sofort
#       wiederherstellen  – Sicherung zurückspielen (pinn. ist dafür etwa eine Minute weg)
#       update            – neues GitHub-Release laden und mit pinn-setup.sh einspielen
#
#  Ablage (im Projektordner):
#     backups/pinn_JJJJ-MM-TT_HHMM[_art].tar.gz   die Sicherungen (nur für root lesbar)
#     wartung/                                    Austausch mit pinn. (Auftrag, Status, Liste, Protokoll)
#
#  Die App schreibt nur wartung/auftrag.json – alles andere prüft dieses Skript selbst noch einmal
#  (Dateiname der Sicherung, Versionsnummer). Updates kommen ausschließlich aus dem Repository
#  PINN_REPO (Standard: pinn-shost/pinn) über https://github.com.
#
#  Von Hand (per SSH):
#     docker exec wartung sh /projekt/pinn-wartung.sh sichern          Sicherung jetzt
#     docker logs wartung                                               Protokoll ansehen
#  Wiederherstellen ohne App: docker compose down → tar -xzf backups/pinn_….tar.gz → docker compose up -d
# ─────────────────────────────────────────────────────────────

P=${PINN_PROJEKT:-/projekt}
B="$P/backups"
W="$P/wartung"
REPO=${PINN_REPO:-pinn-shost/pinn}
UHRZEIT=${BACKUP_UHRZEIT:-03:30}
TAGE=${BACKUP_TAGE:-7}
WOCHEN=${BACKUP_WOCHEN:-4}
VORHER_BEHALTEN=3
PB=${PINN_PB_CONTAINER:-pocketbase}
SELBST=${PINN_WARTUNG_CONTAINER:-wartung}
SKRIPT="$0"

umask 077
mkdir -p "$B" "$W"
chmod 700 "$B" "$W" 2>/dev/null

# ── Kleinkram ───────────────────────────────────────────────
jetzt() { date '+%d.%m.%Y %H:%M:%S'; }
log() {
  echo "$(jetzt) $*"
  echo "$(jetzt) $*" >> "$W/wartung.log" 2>/dev/null
}
log_kuerzen() {
  if [ -f "$W/wartung.log" ] && [ "$(wc -c < "$W/wartung.log")" -gt 262144 ]; then
    tail -n 600 "$W/wartung.log" > "$W/wartung.log.neu" && mv "$W/wartung.log.neu" "$W/wartung.log"
  fi
}
pakete() {
  if command -v jq >/dev/null 2>&1 && command -v sqlite3 >/dev/null 2>&1 && command -v curl >/dev/null 2>&1 \
     && tar --version 2>/dev/null | grep -q GNU; then
    return 0
  fi
  until apk add --no-cache sqlite tar tzdata jq curl gzip >/dev/null 2>&1; do
    echo "$(jetzt) Pakete nicht ladbar – neuer Versuch in 60 s"
    sleep 60
  done
}
docker_ok() { docker info >/dev/null 2>&1; }
version_installiert() {
  grep -m1 "const APP_VERSION" "$P/pb_public/index.html" 2>/dev/null | sed -n "s/.*APP_VERSION = '\([^']*\)'.*/\1/p"
}
md5() { md5sum "$1" 2>/dev/null | cut -d' ' -f1; }

# Sperre, damit nie zwei Sicherungen/Aufträge gleichzeitig laufen
sperren() {
  i=0
  until mkdir "$W/.sperre" 2>/dev/null; do
    i=$((i + 1))
    [ "$i" -ge 180 ] && return 1
    sleep 5
  done
  return 0
}
entsperren() { rmdir "$W/.sperre" 2>/dev/null; }

# ── Status für die App ──────────────────────────────────────
AUFTRAG_ID=""; AUFTRAG_ART=""; AUFTRAG_DATEI=""; AUFTRAG_VERSION=""; AUFTRAG_UMFANG=""; AUFTRAG_START=0
status() {  # status <zustand: wartet|laeuft|fertig|fehler> <schritt> [fehlercode] [meldung]
  jq -n --arg id "$AUFTRAG_ID" --arg art "$AUFTRAG_ART" --arg z "$1" --arg s "$2" \
        --arg f "${3:-}" --arg m "${4:-}" --arg datei "$AUFTRAG_DATEI" --arg version "$AUFTRAG_VERSION" \
        --arg umfang "$AUFTRAG_UMFANG" --argjson start "${AUFTRAG_START:-0}" --argjson zeit "$(date +%s)" \
        '{id:$id, art:$art, zustand:$z, schritt:$s, fehler:$f, meldung:$m, datei:$datei,
          version:$version, umfang:$umfang, start:$start, zeit:$zeit}' \
        > "$W/status.json.neu" 2>/dev/null && mv "$W/status.json.neu" "$W/status.json"
}
lebenszeichen() {
  D=false; docker_ok && D=true
  jq -n --argjson zeit "$(date +%s)" --argjson docker "$D" --arg uhrzeit "$UHRZEIT" \
        --argjson tage "$TAGE" --argjson wochen "$WOCHEN" --arg repo "$REPO" \
        '{zeit:$zeit, docker:$docker, uhrzeit:$uhrzeit, tage:$tage, wochen:$wochen, repo:$repo}' \
        > "$W/lebt.json.neu" 2>/dev/null && mv "$W/lebt.json.neu" "$W/lebt.json"
}

# Liste der Sicherungen für die App (neueste zuerst)
liste() {
  (
    for F in "$B"/pinn_*.tar.gz; do
      [ -f "$F" ] || continue
      N=$(basename "$F")
      case "$N" in
        *vor-update*) A=vor-update ;;
        *vor-wiederherstellung*) A=vor-wiederherstellung ;;
        *_manuell.tar.gz) A=manuell ;;
        *) A=auto ;;
      esac
      jq -n --arg d "$N" --arg a "$A" --argjson g "$(stat -c %s "$F")" --argjson z "$(stat -c %Y "$F")" \
            '{datei:$d, art:$a, groesse:$g, zeit:$z}'
    done
  ) | jq -s 'sort_by(-.zeit)' > "$W/backups.json.neu" 2>/dev/null && mv "$W/backups.json.neu" "$W/backups.json"
}

# ── Sicherung ───────────────────────────────────────────────
LETZTE_SICHERUNG=""
sichern() {  # sichern [manuell|vor-update|vor-wiederherstellung]
  TYP="$1"
  TS=$(date +%Y-%m-%d_%H%M)
  if [ -n "$TYP" ]; then NAME="pinn_${TS}_$TYP"; else NAME="pinn_$TS"; fi
  if [ -e "$B/$NAME.tar.gz" ]; then
    # gleiche Minute: kurz warten, damit nichts überschrieben wird
    S=$(date +%S | sed 's/^0//'); sleep $((61 - ${S:-0}))
    TS=$(date +%Y-%m-%d_%H%M)
    if [ -n "$TYP" ]; then NAME="pinn_${TS}_$TYP"; else NAME="pinn_$TS"; fi
  fi
  ZIEL="$B/$NAME.tar"
  TMP="$W/.sicherung"
  log "Sicherung startet ($NAME)"
  rm -rf "$TMP" "$B"/*.part "$B"/*.part.gz
  mkdir -p "$TMP/pb_data"
  for DB in "$P"/pb_data/*.db; do
    [ -f "$DB" ] || continue
    if ! nice -n 19 sqlite3 "$DB" ".timeout 30000" ".backup '$TMP/pb_data/$(basename "$DB")'"; then
      log "FEHLER: $DB konnte nicht gesichert werden"
      rm -rf "$TMP"
      return 1
    fi
  done
  version_installiert > "$TMP/pinn-version.txt"
  LISTE=""
  for X in pb_data pb_public pb_hooks caddy traccar/data konfig tailscale docker-compose.yaml .env; do
    [ -e "$P/$X" ] && LISTE="$LISTE $X"
  done
  # shellcheck disable=SC2086
  if nice -n 19 tar -cf "$ZIEL.part" -C "$P" \
       --exclude='pb_data/*.db' --exclude='pb_data/*.db-wal' --exclude='pb_data/*.db-shm' \
       --exclude='pb_data/*.db-journal' --exclude='pb_data/backups' $LISTE \
     && nice -n 19 tar -rf "$ZIEL.part" -C "$TMP" pb_data pinn-version.txt \
     && nice -n 19 gzip -6 "$ZIEL.part" \
     && mv "$ZIEL.part.gz" "$ZIEL.gz"; then
    rm -rf "$TMP"
    chmod 600 "$ZIEL.gz" 2>/dev/null
    LETZTE_SICHERUNG="$NAME.tar.gz"
    log "Sicherung fertig: $NAME.tar.gz ($(du -h "$ZIEL.gz" | cut -f1))"
    return 0
  fi
  log "FEHLER: Sicherung fehlgeschlagen (Speicherplatz auf dem NAS prüfen)"
  rm -rf "$TMP" "$ZIEL.part" "$ZIEL.part.gz"
  return 1
}

# Aufbewahrung: alle Sicherungen der letzten $TAGE Tage, danach je Woche die neueste für $WOCHEN Wochen
rotieren() {
  TAGE_LISTE=" "; NT=0; WOCHEN_LISTE=" "; NW=0
  for F in $(ls -1 "$B"/pinn_*.tar.gz 2>/dev/null | sort -r); do
    N=$(basename "$F")
    D=$(echo "$N" | sed -n 's/^pinn_\([0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\)_[0-9]\{4\}\(_manuell\)\{0,1\}\.tar\.gz$/\1/p')
    [ -n "$D" ] || continue                       # Sicherungen vor Update/Wiederherstellung: siehe unten
    case "$TAGE_LISTE" in *" $D "*) continue ;; esac
    if [ "$NT" -lt "$TAGE" ]; then TAGE_LISTE="$TAGE_LISTE$D "; NT=$((NT + 1)); continue; fi
    WO=$(date -d "$D" +%G-%V 2>/dev/null)
    [ -n "$WO" ] || WO="$D"
    case "$WOCHEN_LISTE" in
      *" $WO "*) rm -f "$F"; log "Aufgeräumt: $N"; continue ;;
    esac
    if [ "$NW" -lt "$WOCHEN" ]; then WOCHEN_LISTE="$WOCHEN_LISTE$WO "; NW=$((NW + 1)); continue; fi
    rm -f "$F"; log "Aufgeräumt: $N"
  done
  # Sicherungen vor Update bzw. Wiederherstellung: die neuesten $VORHER_BEHALTEN bleiben
  ls -1t "$B"/pinn_*vor-*.tar.gz 2>/dev/null | tail -n +$((VORHER_BEHALTEN + 1)) | while read -r F; do
    rm -f "$F"; log "Aufgeräumt: $(basename "$F")"
  done
}

# Tägliche Sicherung fällig?
faellig() {
  HEUTE=$(date +%Y-%m-%d)
  [ "$(cat "$W/.letzte-tagessicherung" 2>/dev/null)" = "$HEUTE" ] && return 1
  if [ -f "$W/.fehlversuch" ]; then
    FV=$(cat "$W/.fehlversuch" 2>/dev/null); [ -n "$FV" ] || FV=0
    [ $(($(date +%s) - FV)) -lt 1800 ] && return 1   # nach einem Fehler erst in 30 Minuten wieder
  fi
  if ls "$B"/pinn_"${HEUTE}"_[0-9][0-9][0-9][0-9].tar.gz >/dev/null 2>&1; then
    echo "$HEUTE" > "$W/.letzte-tagessicherung"; return 1
  fi
  H=$(date +%H%M); Z=$(echo "$UHRZEIT" | tr -d ':')
  [ "$H" -ge "$Z" ] 2>/dev/null && return 0
  # vor der Uhrzeit nur, wenn es noch überhaupt keine Sicherung gibt
  ls "$B"/pinn_*.tar.gz >/dev/null 2>&1 && return 1
  return 0
}
tagessicherung() {
  if sichern ""; then
    date +%Y-%m-%d > "$W/.letzte-tagessicherung"
    rm -f "$W/.fehlversuch"
    rotieren
  else
    date +%s > "$W/.fehlversuch"
  fi
  liste
}

# ── PocketBase anhalten/starten ─────────────────────────────
warte_pb() {
  i=0
  while [ "$i" -lt 90 ]; do
    docker exec "$PB" wget -qO- http://127.0.0.1:80/api/health >/dev/null 2>&1 && return 0
    sleep 2; i=$((i + 1))
  done
  return 1
}

# Inhalte eines Ordners austauschen (der Ordner selbst bleibt – andere Container haben ihn eingebunden)
leeren_nach() {  # leeren_nach <quelle> <ziel>
  mkdir -p "$2"
  find "$1" -mindepth 1 -maxdepth 1 -exec mv {} "$2"/ \; 2>/dev/null
}

# ── Auftrag: Sicherung ──────────────────────────────────────
job_sichern() {
  status laeuft sichern
  if sichern manuell; then
    AUFTRAG_DATEI="$LETZTE_SICHERUNG"
    rotieren; liste
    status fertig fertig
  else
    liste
    status fehler sichern sichern
  fi
}

# ── Auftrag: Wiederherstellung ──────────────────────────────
job_wiederherstellen() {
  D="$AUFTRAG_DATEI"
  if ! echo "$D" | grep -qE '^pinn_[A-Za-z0-9_.-]+\.tar\.gz$' || [ ! -f "$B/$D" ]; then
    status fehler start datei; return
  fi
  case "$AUFTRAG_UMFANG" in
    alles) TEILE="pb_data pb_public pb_hooks konfig" ;;
    *) AUFTRAG_UMFANG=daten; TEILE="pb_data" ;;
  esac
  if ! docker_ok; then status fehler start docker; return; fi
  log "Wiederherstellung von $D ($AUFTRAG_UMFANG)"

  # 1. Jetzigen Stand sichern
  status laeuft sichern
  if ! sichern vor-wiederherstellung; then liste; status fehler sichern sichern; return; fi
  rotieren; liste

  # 2. Entpacken und prüfen
  status laeuft entpacken
  WH="$W/.wiederherstellung"; ALT="$W/.vorher"
  rm -rf "$WH" "$ALT"; mkdir -p "$WH" "$ALT"
  VORHANDEN=$(tar -tzf "$B/$D" 2>/dev/null | cut -d/ -f1 | sort -u)
  AUSWAHL=""
  for T in $TEILE; do
    echo "$VORHANDEN" | grep -qx "$T" && AUSWAHL="$AUSWAHL $T"
  done
  # shellcheck disable=SC2086
  if [ -z "$AUSWAHL" ] || ! tar -xzf "$B/$D" -C "$WH" $AUSWAHL; then
    rm -rf "$WH" "$ALT"; status fehler entpacken entpacken; return
  fi
  if [ ! -s "$WH/pb_data/data.db" ] || [ "$(sqlite3 "$WH/pb_data/data.db" 'PRAGMA quick_check;' 2>/dev/null)" != "ok" ]; then
    rm -rf "$WH" "$ALT"; status fehler entpacken defekt; return
  fi

  # 3. pinn. anhalten, austauschen, starten
  status laeuft stoppen
  docker stop -t 30 "$PB" >/dev/null 2>&1
  status laeuft einspielen
  for T in $AUSWAHL; do
    leeren_nach "$P/$T" "$ALT/$T"
    leeren_nach "$WH/$T" "$P/$T"
  done
  status laeuft starten
  docker start "$PB" >/dev/null 2>&1
  if warte_pb; then
    rm -rf "$WH" "$ALT"
    log "Wiederherstellung fertig ($D)"
    status fertig fertig
    return
  fi

  # 4. Startet nicht: alten Stand zurück
  log "FEHLER: pinn. startet mit der Sicherung nicht – alter Stand wird zurückgeholt"
  docker stop -t 30 "$PB" >/dev/null 2>&1
  for T in $AUSWAHL; do
    rm -rf "${P:?}/$T.defekt"; mkdir -p "$P/$T.defekt"
    leeren_nach "$P/$T" "$P/$T.defekt"
    leeren_nach "$ALT/$T" "$P/$T"
    rm -rf "${P:?}/$T.defekt"
  done
  docker start "$PB" >/dev/null 2>&1
  warte_pb
  rm -rf "$WH" "$ALT"
  status fehler starten start
}

# ── Auftrag: Update ─────────────────────────────────────────
job_update() {
  TAG="$AUFTRAG_TAG"
  if ! echo "$TAG" | grep -qE '^v?[0-9]+(\.[0-9]+){1,3}$'; then status fehler start tag; return; fi
  AUFTRAG_VERSION=$(echo "$TAG" | sed 's/^v//')
  if ! docker_ok; then status fehler start docker; return; fi
  log "Update auf $AUFTRAG_VERSION ($REPO $TAG)"

  # 1. Sicherung vorher
  status laeuft sichern
  if ! sichern vor-update; then liste; status fehler sichern sichern; return; fi
  rotieren; liste

  # 2. Release laden und entpacken
  status laeuft laden
  U="$W/.update"; rm -rf "$U"; mkdir -p "$U"
  if ! curl -fsSL --retry 2 --connect-timeout 20 --max-time 900 -o "$U/pinn.tar.gz" \
        "https://github.com/$REPO/archive/refs/tags/$TAG.tar.gz"; then
    rm -rf "$U"; status fehler laden laden; return
  fi
  status laeuft entpacken
  if ! tar -xzf "$U/pinn.tar.gz" -C "$U"; then rm -rf "$U"; status fehler entpacken entpacken; return; fi
  Q=$(find "$U" -mindepth 1 -maxdepth 1 -type d | head -1)
  # Ab 1.39.0 liegt die App im Release unter pb_public/index.html (Aufbau wie auf dem NAS);
  # ältere Releases haben sie noch ganz oben.
  if [ -z "$Q" ] || [ ! -f "$Q/pinn-setup.sh" ] || [ ! -f "$Q/docker-compose.yaml" ] \
     || { [ ! -f "$Q/pb_public/index.html" ] && [ ! -f "$Q/index.html" ]; }; then
    rm -rf "$U"; status fehler entpacken paket; return
  fi
  ORDNER="pinn-$AUFTRAG_VERSION"
  rm -rf "${P:?}/$ORDNER"
  mv "$Q" "$P/$ORDNER"
  rm -rf "$U"

  # 3. pinn-setup.sh in einem eigenen Hilfs-Container starten – er läuft weiter, auch wenn dabei
  #    dieser Container neu erstellt wird (docker compose up), und meldet sein Ergebnis in wartung/.
  status laeuft installieren
  HOST=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/projekt"}}{{.Source}}{{end}}{{end}}' "$SELBST" 2>/dev/null)
  PN=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$SELBST" 2>/dev/null)
  IMG=$(docker inspect -f '{{.Config.Image}}' "$SELBST" 2>/dev/null)
  if [ -z "$HOST" ] || [ -z "$IMG" ]; then status fehler installieren docker; return; fi
  rm -f "$W/update.exit"; : > "$W/update.log"
  jq -n --arg id "$AUFTRAG_ID" --arg version "$AUFTRAG_VERSION" --argjson start "$AUFTRAG_START" \
        '{id:$id, version:$version, start:$start}' > "$W/update.laeuft"
  docker rm -f pinn-update >/dev/null 2>&1
  if ! docker run -d --rm --name pinn-update \
        -v /var/run/docker.sock:/var/run/docker.sock -v "$HOST:$HOST" -w "$HOST" \
        -e COMPOSE_PROJECT_NAME="$PN" -e TZ="${TZ:-Europe/Berlin}" \
        --entrypoint sh "$IMG" -c "sh '$ORDNER/pinn-setup.sh' --lang de > wartung/update.log 2>&1; echo \$? > wartung/update.exit" \
        >/dev/null 2>&1; then
    rm -f "$W/update.laeuft"; status fehler installieren docker; return
  fi
  update_abschluss
}

# Wartet auf das Ende von pinn-setup.sh (auch nach einem Neustart dieses Containers)
update_abschluss() {
  [ -f "$W/update.laeuft" ] || return 0
  AUFTRAG_ART=update
  AUFTRAG_ID=$(jq -r '.id // ""' "$W/update.laeuft" 2>/dev/null)
  AUFTRAG_VERSION=$(jq -r '.version // ""' "$W/update.laeuft" 2>/dev/null)
  AUFTRAG_START=$(jq -r '.start // 0' "$W/update.laeuft" 2>/dev/null)
  AUFTRAG_DATEI=""; AUFTRAG_UMFANG=""
  status laeuft installieren
  i=0
  while [ ! -f "$W/update.exit" ]; do
    i=$((i + 1))
    if [ "$i" -gt 800 ] || { [ $((i % 10)) -eq 0 ] && ! docker inspect pinn-update >/dev/null 2>&1 && [ ! -f "$W/update.exit" ]; }; then
      sleep 2
      [ -f "$W/update.exit" ] && break
      log "FEHLER: Update-Hilfscontainer ohne Ergebnis beendet"
      rm -f "$W/update.laeuft"
      status fehler installieren abbruch
      return 1
    fi
    sleep 3
  done
  C=$(cat "$W/update.exit" 2>/dev/null)
  rm -f "$W/update.laeuft" "$W/update.exit"
  rm -rf "${P:?}/pinn-$AUFTRAG_VERSION"
  if [ "$C" = "0" ]; then
    status laeuft neustart
    # Neue Hooks laden (PocketBase liest pb_hooks nur beim Start)
    docker restart -t 30 "$PB" >/dev/null 2>&1
    warte_pb
    log "Update fertig: pinn. $AUFTRAG_VERSION"
    status fertig fertig
  else
    log "FEHLER: pinn-setup.sh endete mit Code $C (Protokoll: wartung/update.log)"
    status fehler installieren setup "$(tail -n 3 "$W/update.log" 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | tr '\n' ' ' | cut -c1-300)"
  fi
  liste
  # Wurde dieses Skript selbst erneuert? Dann neu starten (Docker holt den Container sofort zurück).
  if [ -n "$SKRIPT_MD5" ] && [ "$(md5 "$SKRIPT")" != "$SKRIPT_MD5" ]; then
    log "Wartungs-Skript wurde erneuert – Neustart"
    entsperren
    exit 0
  fi
  return 0
}

# ── Aufträge der App ────────────────────────────────────────
auftrag() {
  mv "$W/auftrag.json" "$W/auftrag.laeuft" 2>/dev/null || return 0
  A="$W/auftrag.laeuft"
  AUFTRAG_ID=$(jq -r '.id // ""' "$A" 2>/dev/null)
  AUFTRAG_ART=$(jq -r '.art // ""' "$A" 2>/dev/null)
  AUFTRAG_DATEI=$(jq -r '.datei // ""' "$A" 2>/dev/null)
  AUFTRAG_UMFANG=$(jq -r '.umfang // ""' "$A" 2>/dev/null)
  AUFTRAG_TAG=$(jq -r '.tag // ""' "$A" 2>/dev/null)
  AUFTRAG_VERSION=""; AUFTRAG_START=$(date +%s)
  rm -f "$A"
  status wartet warten
  if ! sperren; then status fehler warten beschaeftigt; return; fi
  case "$AUFTRAG_ART" in
    sichern) job_sichern ;;
    wiederherstellen) job_wiederherstellen ;;
    update) job_update ;;
    *) status fehler start unbekannt ;;
  esac
  entsperren
}

# ── Dienst ──────────────────────────────────────────────────
dienst() {
  pakete
  SKRIPT_MD5=$(md5 "$SKRIPT")
  rm -rf "$W/.sperre" "$W/.sicherung" "$W/.update"
  rm -f "$B"/*.part "$B"/*.part.gz "$W"/*.neu
  chmod 600 "$B"/pinn_*.tar.gz 2>/dev/null
  # Unterbrochene Wiederherstellung (Container während des Austauschs beendet): alten Stand zurück
  if [ -d "$W/.vorher" ] && [ -n "$(ls -A "$W/.vorher" 2>/dev/null)" ]; then
    log "Unterbrochene Wiederherstellung gefunden – alter Stand wird zurückgeholt"
    docker stop -t 30 "$PB" >/dev/null 2>&1
    for T in pb_data pb_public pb_hooks konfig; do
      [ -n "$(ls -A "$W/.vorher/$T" 2>/dev/null)" ] || continue
      rm -rf "${P:?}/$T.defekt"; mkdir -p "$P/$T.defekt"
      leeren_nach "$P/$T" "$P/$T.defekt"
      leeren_nach "$W/.vorher/$T" "$P/$T"
      rm -rf "${P:?}/$T.defekt"
    done
    docker start "$PB" >/dev/null 2>&1
    AUFTRAG_ART=wiederherstellen; status fehler starten abbruch
  fi
  rm -rf "$W/.vorher" "$W/.wiederherstellung"
  if [ -f "$W/status.json" ] && [ "$(jq -r '.zustand' "$W/status.json" 2>/dev/null)" = "laeuft" ] && [ ! -f "$W/update.laeuft" ]; then
    AUFTRAG_ART=$(jq -r '.art // ""' "$W/status.json"); AUFTRAG_ID=$(jq -r '.id // ""' "$W/status.json")
    status fehler start abbruch
  fi
  log "Wartung gestartet – Sicherung täglich um $UHRZEIT, aufbewahrt: $TAGE Tage + $WOCHEN Wochen"
  docker_ok || log "Hinweis: kein Zugriff auf Docker (/var/run/docker.sock) – Wiederherstellen und Updates aus der App sind aus"
  lebenszeichen
  liste
  if [ -f "$W/update.laeuft" ]; then
    sperren && { update_abschluss; entsperren; }
  fi
  trap 'entsperren; exit 0' TERM INT
  LEBT=$(date +%s)
  while true; do
    if [ -f "$W/auftrag.json" ]; then auftrag; lebenszeichen; fi
    if faellig; then
      if sperren; then tagessicherung; entsperren; fi
      log_kuerzen
    fi
    N=$(date +%s)
    if [ $((N - LEBT)) -ge 120 ]; then lebenszeichen; LEBT=$N; fi
    sleep 5 &
    wait $!
  done
}

case "$1" in
  sichern)
    pakete
    if ! sperren; then echo "Es läuft gerade eine andere Sicherung – bitte später erneut."; exit 1; fi
    if sichern "${2:-manuell}"; then rotieren; liste; entsperren; exit 0; fi
    liste; entsperren; exit 1
    ;;
  liste) pakete; liste; cat "$W/backups.json" ;;
  *) dienst ;;
esac
