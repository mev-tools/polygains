#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
POLL_SECONDS="${POLL_SECONDS:-5}"

if ! [[ "${POLL_SECONDS}" =~ ^[0-9]+$ ]] || [ "${POLL_SECONDS}" -lt 1 ]; then
  echo "[frontend-build-watcher] POLL_SECONDS must be a positive integer (got: ${POLL_SECONDS})"
  exit 1
fi

snapshot() {
  {
    find "${FRONTEND_DIR}/src" -type f 2>/dev/null
    find "${FRONTEND_DIR}" -maxdepth 1 -type f \( \
      -name "index.html" -o \
      -name "package.json" -o \
      -name "tsconfig*.json" -o \
      -name "vite.config.*" -o \
      -name "tailwind.config.*" -o \
      -name "postcss.config.*" \
    \) 2>/dev/null
  } | LC_ALL=C sort | xargs -r stat -c '%n:%Y:%s'
}

echo "[frontend-build-watcher] Polling every ${POLL_SECONDS}s for frontend changes..."
last_snapshot="$(snapshot || true)"

while true; do
  sleep "${POLL_SECONDS}"
  current_snapshot="$(snapshot || true)"
  if [ "${current_snapshot}" = "${last_snapshot}" ]; then
    continue
  fi

  echo "[frontend-build-watcher] Change detected. Building frontend..."
  (
    cd "${FRONTEND_DIR}"
    bun run build --outdir=../public
  )
  echo "[frontend-build-watcher] Build complete."
  last_snapshot="$(snapshot || true)"
done
