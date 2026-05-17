#!/usr/bin/env bash
# One-time setup for the umstutorial auto-deploy on a fresh server.
# Run as root from inside the cloned repo:
#
#   sudo DEPLOY_USER=deploy ./deploy/bootstrap.sh
#
# Idempotent: re-run after editing the systemd units to reload them.

set -euo pipefail

DEPLOY_USER=${DEPLOY_USER:?set DEPLOY_USER to the user that owns /srv/umstutorial and the webroot}
CLONE=${CLONE:-/srv/umstutorial}
WEBROOT=${WEBROOT:-/var/www/tutorial.uppsalamakerspace.se}
UNIT_DIR=${UNIT_DIR:-/etc/systemd/system}

if [[ $EUID -ne 0 ]]; then
  echo "run as root (or with sudo); needs to write to $UNIT_DIR" >&2
  exit 1
fi

require() { command -v "$1" >/dev/null || { echo "missing required command: $1" >&2; exit 1; }; }
for c in git node npm rsync systemctl install sed flock; do require "$c"; done

if [[ ! -d "$CLONE/.git" ]]; then
  echo "expected a git checkout at $CLONE; clone the repo there first" >&2
  exit 1
fi

id -u "$DEPLOY_USER" >/dev/null 2>&1 || {
  echo "user '$DEPLOY_USER' does not exist; create it (e.g. useradd -r -m -d $CLONE -s /usr/sbin/nologin $DEPLOY_USER) then re-run" >&2
  exit 1
}

mkdir -p "$WEBROOT"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$CLONE" "$WEBROOT"

# Install node deps as the deploy user.
sudo -u "$DEPLOY_USER" -H bash -c "cd '$CLONE' && npm ci --silent"

# Render systemd units with the deploy user substituted in, then install.
service_src="$CLONE/deploy/umstutorial-deploy.service"
timer_src="$CLONE/deploy/umstutorial-deploy.timer"
service_dst="$UNIT_DIR/umstutorial-deploy.service"
timer_dst="$UNIT_DIR/umstutorial-deploy.timer"

sed "s/__DEPLOY_USER__/$DEPLOY_USER/g" "$service_src" > "$service_dst"
install -m 0644 "$timer_src" "$timer_dst"

systemctl daemon-reload
systemctl enable --now umstutorial-deploy.timer

# Kick off the first deploy synchronously so any error surfaces here.
echo "running first deploy …"
systemctl start umstutorial-deploy.service
systemctl status --no-pager umstutorial-deploy.service | head -20 || true

cat <<EOF

bootstrap complete.

  status:  systemctl status umstutorial-deploy.timer
  logs:    journalctl -u umstutorial-deploy.service -n 50 --no-pager
  follow:  journalctl -fu umstutorial-deploy.service
  force:   systemctl start umstutorial-deploy.service
EOF
