#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/home/loja/Documentos/BrasilExpressCRMinterno}"
STORAGE_DIR="${STORAGE_DIR:-$PROJECT_ROOT/server/storage}"
DB_PATH="${DB_PATH:-$STORAGE_DIR/database/crm.sqlite}"
UPLOADS_DIR="${UPLOADS_DIR:-$STORAGE_DIR/uploads}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/loja/backups/brasil-express-crm}"
ARCHIVE_ROOT="${ARCHIVE_ROOT:-$BACKUP_ROOT/archives}"
WORK_ROOT="${WORK_ROOT:-$BACKUP_ROOT/work}"
LOCK_FILE="${LOCK_FILE:-$BACKUP_ROOT/backup.lock}"
MEGA_REMOTE_DIR="${MEGA_REMOTE_DIR:-/Root/BrasilExpressCRM/backups}"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-7}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[backup] comando obrigatorio ausente: $1" >&2
    exit 1
  fi
}

log() {
  printf '[backup] %s\n' "$1"
}

cleanup() {
  if [[ -n "${TEMP_SNAPSHOT_DIR:-}" && -d "${TEMP_SNAPSHOT_DIR:-}" ]]; then
    rm -rf "$TEMP_SNAPSHOT_DIR"
  fi
}

require_command sqlite3
require_command tar
require_command mega-whoami
require_command mega-put
require_command mega-mkdir

if [[ ! -f "$DB_PATH" ]]; then
  echo "[backup] banco nao encontrado em $DB_PATH" >&2
  exit 1
fi

mkdir -p "$ARCHIVE_ROOT" "$WORK_ROOT"

exec 9>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1; then
  if ! flock -n 9; then
    log "backup ja em andamento, ignorando esta execucao"
    exit 0
  fi
fi

trap cleanup EXIT

mega-whoami >/dev/null 2>&1 || {
  echo "[backup] MEGAcmd nao autenticado. Rode mega-login antes do agendamento." >&2
  exit 1
}

STAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
TEMP_SNAPSHOT_DIR="$(mktemp -d "$WORK_ROOT/snapshot-$STAMP-XXXXXX")"
SNAPSHOT_DIR="$TEMP_SNAPSHOT_DIR/storage"
ARCHIVE_FILE="$ARCHIVE_ROOT/crm-storage-$STAMP.tar.gz"

mkdir -p "$SNAPSHOT_DIR/database" "$SNAPSHOT_DIR/uploads"

log "gerando snapshot consistente do SQLite"
sqlite3 "$DB_PATH" ".backup '$SNAPSHOT_DIR/database/crm.sqlite'"

if [[ -f "${DB_PATH}-wal" ]]; then
  cp -f "${DB_PATH}-wal" "$SNAPSHOT_DIR/database/crm.sqlite-wal.last-seen" || true
fi

if [[ -f "${DB_PATH}-shm" ]]; then
  cp -f "${DB_PATH}-shm" "$SNAPSHOT_DIR/database/crm.sqlite-shm.last-seen" || true
fi

if command -v rsync >/dev/null 2>&1; then
  log "copiando uploads via rsync"
  rsync -a --delete "$UPLOADS_DIR/" "$SNAPSHOT_DIR/uploads/"
else
  log "copiando uploads via cp -a"
  cp -a "$UPLOADS_DIR/." "$SNAPSHOT_DIR/uploads/"
fi

cat > "$SNAPSHOT_DIR/manifest.txt" <<EOF
generated_at=$(date --iso-8601=seconds)
hostname=$(hostname)
project_root=$PROJECT_ROOT
storage_dir=$STORAGE_DIR
db_path=$DB_PATH
uploads_dir=$UPLOADS_DIR
mega_remote_dir=$MEGA_REMOTE_DIR
EOF

log "compactando snapshot"
tar -czf "$ARCHIVE_FILE" -C "$TEMP_SNAPSHOT_DIR" storage

log "garantindo pasta remota no MEGA"
mega-mkdir -p "$MEGA_REMOTE_DIR" >/dev/null

log "enviando arquivo para o MEGA"
mega-put "$ARCHIVE_FILE" "$MEGA_REMOTE_DIR/"

log "limpando backups locais antigos"
find "$ARCHIVE_ROOT" -maxdepth 1 -type f -name 'crm-storage-*.tar.gz' -mtime +"$LOCAL_RETENTION_DAYS" -delete

LATEST_FILE="$BACKUP_ROOT/latest-success.txt"
mkdir -p "$BACKUP_ROOT"
cat > "$LATEST_FILE" <<EOF
last_archive=$ARCHIVE_FILE
sent_to=$MEGA_REMOTE_DIR
completed_at=$(date --iso-8601=seconds)
EOF

log "backup finalizado com sucesso: $ARCHIVE_FILE"
