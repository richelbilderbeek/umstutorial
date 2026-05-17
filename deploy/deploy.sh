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

# Single-flight: if another invocation is mid-run, exit 0 quietly so
# the timer doesn't pile up alerts.
mkdir -p "$(dirname "$LOCK")"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "another deploy is running; skipping"
  exit 0
fi

cd "$CLONE"

self_before=$(git rev-parse HEAD 2>/dev/null || echo "")
upstream_before=$(cat sources/umsme/.synced-sha 2>/dev/null || echo "")

git fetch --quiet origin "$BRANCH"
git reset --quiet --hard "origin/$BRANCH"

# npm ci only when the lockfile changed or node_modules is missing.
if [[ ! -d node_modules ]] || ! git diff --quiet "$self_before" HEAD -- package-lock.json 2>/dev/null; then
  npm ci --silent
fi

# Sync umsme via HTTPS so the server doesn't need an SSH deploy key for
# upstream. (`npm run sync` defaults to SSH, which is right for local dev.)
scripts/sync-umsme.sh --https >/dev/null

self_after=$(git rev-parse HEAD)
upstream_after=$(cat sources/umsme/.synced-sha)

# Skip the build+rsync when neither side moved and the webroot already
# has content. First-ever runs (empty webroot) always rebuild.
if [[ "$self_before" == "$self_after" \
   && "$upstream_before" == "$upstream_after" \
   && -d "$WEBROOT" \
   && -n "$(ls -A "$WEBROOT" 2>/dev/null)" ]]; then
  echo "no changes (umstutorial=$self_after, umsme=$upstream_after)"
  exit 0
fi

npm run --silent build
mkdir -p "$WEBROOT"
rsync -a --delete dist/ "$WEBROOT/"

echo "deployed umstutorial=$self_after umsme=$upstream_after"
