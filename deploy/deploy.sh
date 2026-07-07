#!/usr/bin/env bash
# Build umstutorial from the latest umstutorial + umsme commits and
# publish dist/ to the webroot. Designed to run on a server from a
# systemd timer. Idempotent: exits quietly when nothing has changed.
#
# Configured via env (with sensible defaults) so the script is reusable
# across hosts and can serve as a template for sibling repos.

set -euo pipefail

CLONE=${CLONE:-/srv/umstutorial}
WEBROOT=${WEBROOT:-/var/www/tutorial.uppsalamakerspace.se}
BRANCH=${BRANCH:-main}
LOCK=${LOCK:-/run/lock/umstutorial-deploy.lock}

step() { printf '\n→ %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
fail() { printf '\n✗ %s\n' "$*" >&2; exit 1; }

step "deploy starting"
echo "  CLONE   = $CLONE"
echo "  WEBROOT = $WEBROOT"
echo "  BRANCH  = $BRANCH"
echo "  user    = $(id -un) ($(id -u))"
echo "  node    = $(command -v node || echo '<not found>') $(node --version 2>/dev/null || true)"
echo "  npm     = $(command -v npm  || echo '<not found>') $(npm  --version 2>/dev/null || true)"

# Single-flight: if another invocation is mid-run, exit 0 quietly so the
# timer doesn't pile up alerts.
mkdir -p "$(dirname "$LOCK")"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "  another deploy is running; skipping"
  exit 0
fi

cd "$CLONE"

self_before=$(git rev-parse HEAD 2>/dev/null || echo "")
umsme_before=$(cat sources/umsme/.synced-sha 2>/dev/null || echo "")
gdrive_before=$(sha256sum sources/gdrive/.synced-sha 2>/dev/null | awk '{print $1}' || true)
github_before=$(sha256sum sources/github/.synced-sha 2>/dev/null | awk '{print $1}' || true)

step "fetching umstutorial origin/$BRANCH"
git fetch --quiet origin "$BRANCH"
git reset --quiet --hard "origin/$BRANCH"
self_after=$(git rev-parse HEAD)
ok "umstutorial at $self_after"

# npm ci only when the lockfile changed or node_modules is missing.
if [[ ! -d node_modules ]] || ! git diff --quiet "$self_before" HEAD -- package-lock.json 2>/dev/null; then
  step "installing node deps (npm ci)"
  npm ci
  ok "deps installed"
fi

step "syncing umsme via HTTPS"
scripts/sync-umsme.sh --https
umsme_after=$(cat sources/umsme/.synced-sha)
ok "umsme at $umsme_after"

step "syncing gdrive"
npm run --silent sync:gdrive
gdrive_after=$(sha256sum sources/gdrive/.synced-sha | awk '{print $1}')
ok "gdrive at $gdrive_after"

step "syncing github"
npm run --silent sync:github
github_after=$(sha256sum sources/github/.synced-sha | awk '{print $1}')
ok "github at $github_after"

# Skip the build+rsync when nothing moved and the webroot already has
# content. First-ever runs (empty webroot) always rebuild.
if [[ "$self_before" == "$self_after" \
   && "$umsme_before" == "$umsme_after" \
   && "$gdrive_before" == "$gdrive_after" \
   && "$github_before" == "$github_after" \
   && -d "$WEBROOT" \
   && -n "$(ls -A "$WEBROOT" 2>/dev/null)" ]]; then
  printf '\n= no changes (umstutorial=%s, umsme=%s, gdrive=%s, github=%s)\n' \
    "$self_after" "$umsme_after" "$gdrive_after" "$github_after"
  exit 0
fi

step "building dist/"
npm run build
ok "build complete"

step "publishing to $WEBROOT"
mkdir -p "$WEBROOT"
rsync -a --delete dist/ "$WEBROOT/"
ok "published"

printf '\n= deployed umstutorial=%s umsme=%s gdrive=%s github=%s\n' \
  "$self_after" "$umsme_after" "$gdrive_after" "$github_after"
