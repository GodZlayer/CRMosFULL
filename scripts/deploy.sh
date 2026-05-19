#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d /tmp/brasil-express-crm-deploy-XXXXXX)"
DIST_DIR="$ROOT_DIR/dist"
SERVICE_NAME="brasil-express.service"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cd "$ROOT_DIR"

echo "[deploy] Build temporario em $TMP_DIR"
npm run build -- --outDir "$TMP_DIR"

echo "[deploy] Publicando frontend em $DIST_DIR"
mkdir -p "$DIST_DIR"
rm -rf "$DIST_DIR/assets"
cp -R "$TMP_DIR/assets" "$DIST_DIR/assets"
cp "$TMP_DIR/index.html" "$DIST_DIR/index.html"

for asset in be1.png be2.png favicon.svg; do
  if [ -f "$TMP_DIR/$asset" ]; then
    cp "$TMP_DIR/$asset" "$DIST_DIR/$asset"
  fi
done

echo "[deploy] Reiniciando $SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "[deploy] Verificando status"
systemctl status "$SERVICE_NAME" --no-pager
