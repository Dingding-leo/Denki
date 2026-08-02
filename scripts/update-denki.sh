#!/usr/bin/env bash
#
# update-denki.sh — pull, rebuild, and relaunch the Denki desktop app.
#
# Usage:   ./scripts/update-denki.sh
#          ./scripts/update-denki.sh --force   # rebuild even with no new commits
#
# Behavior:
#   1. git pull origin main (fast-forward).
#   2. If nothing changed and no --force, print "already up to date" and stop.
#   3. Install any new JS deps, rebuild the frontend + Tauri .app.
#   4. Quit the running Denki, launch the freshly built .app.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_NAME="Denki"
APP_BUNDLE="$ROOT/src-tauri/target/release/bundle/macos/$APP_NAME.app"

log()  { printf '\033[1;36m[denki]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[denki]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[denki]\033[0m %s\n' "$*" >&2; exit 1; }

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
    *) die "unknown argument: $arg (expected --force)" ;;
  esac
done

command -v git  >/dev/null || die "git not found"
command -v npm  >/dev/null || die "npm not found"
command -v cargo >/dev/null || die "cargo not found — is Rust installed? (brew install rust)"

# 1. Pull
log "Pulling latest from origin/main…"
git pull --ff-only origin main 2>&1 | sed 's/^/  /' || die "git pull failed (uncommitted changes?)."

# 2. Detect whether anything new arrived
HEAD_BEFORE="$(git rev-parse HEAD~1 2>/dev/null || true)"
NEW_COMMITS="$(git rev-list --count origin/main...HEAD 2>/dev/null || echo 0)"
if [ "$NEW_COMMITS" -gt 0 ]; then
  log "$NEW_COMMITS new commit(s) pulled."
  CHANGED=1
elif [ "$FORCE" -eq 1 ]; then
  log "--force: rebuilding regardless."
  CHANGED=1
else
  log "Already up to date (no new commits). Nothing to rebuild."
  log "Tip: pass --force to rebuild anyway."
  exit 0
fi

# 3. Install deps + build
log "Installing dependencies…"
npm install --silent 2>&1 | sed 's/^/  /' || die "npm install failed."

log "Building Denki.app (frontend + Tauri)…"
npx tauri build 2>&1 | tail -3 | sed 's/^/  /' || die "build failed — see output above."

[ -d "$APP_BUNDLE" ] || die "build finished but $APP_BUNDLE is missing."

# 4. Relaunch
log "Quitting any running Denki…"
osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 \
  || pkill -f "$APP_BUNDLE/Contents/MacOS/denki" 2>/dev/null || true
# Give it a moment to release the bundle.
sleep 1

log "Launching updated $APP_NAME.app…"
open "$APP_BUNDLE"

log "Done. Denki is up to date and running. 🎉"
