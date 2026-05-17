# Auto-deploy

Server-side hourly rebuild + rsync to webroot. Triggered by a systemd timer; no CI, no webhooks, no secrets to manage.

## What runs

| Component                          | Purpose                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `deploy.sh`                        | Idempotent pipeline: fetch umstutorial → `npm ci` (only if lockfile moved) → sync umsme → build → rsync `dist/` to webroot. Skips build+rsync when nothing changed. |
| `umstutorial-deploy.service`      | Oneshot systemd unit that runs `deploy.sh` as the deploy user.                              |
| `umstutorial-deploy.timer`        | Fires `OnCalendar=hourly` with `Persistent=true` so a missed run catches up after reboot.   |
| `bootstrap.sh`                     | One-time setup: installs the units, enables the timer, triggers a first deploy.             |

Default paths (override with env vars when calling `bootstrap.sh` / `deploy.sh`):

- Clone:   `/srv/umstutorial`
- Webroot: `/var/www/tutorial.uppsalamakerspace.se`

## One-time setup on a fresh server

Prerequisites: `git`, `node` ≥ 18, `npm`, `rsync`, `systemd`. The deploy user must own both the clone and the webroot.

```sh
# 1. Create a low-privilege deploy user (skip if you already have one).
sudo useradd -r -m -d /srv/umstutorial -s /usr/sbin/nologin deploy

# 2. Clone the repo into /srv/umstutorial (as the deploy user, via HTTPS so
#    no SSH key is needed).
sudo -u deploy git clone https://github.com/uppsala-makerspace/umstutorial.git /srv/umstutorial

# 3. Run the bootstrap. This installs the systemd units, enables the timer,
#    and kicks off a first deploy synchronously so failures surface here.
cd /srv/umstutorial
sudo DEPLOY_USER=deploy ./deploy/bootstrap.sh
```

The first deploy populates `/var/www/tutorial.uppsalamakerspace.se`. Point your existing nginx vhost at that directory if it isn't already.

## Operator commands

```sh
systemctl status umstutorial-deploy.timer         # next run + last result
journalctl -u umstutorial-deploy.service -n 50    # recent deploy logs
journalctl -fu umstutorial-deploy.service         # follow live
sudo systemctl start umstutorial-deploy.service   # force a deploy now
```

A run that found no changes logs one line (`no changes (umstutorial=…, umsme=…)`); a real deploy logs `deployed umstutorial=… umsme=…`. Everything from the build pipeline goes to the journal.

## Upgrading

To pull in changes to the deploy artifacts themselves (this directory):

```sh
sudo -u deploy git -C /srv/umstutorial pull
sudo ./deploy/bootstrap.sh    # re-runs systemd install + daemon-reload
```

Day-to-day code changes don't need this — the hourly timer picks them up automatically.

## Removing

```sh
sudo systemctl disable --now umstutorial-deploy.timer
sudo rm /etc/systemd/system/umstutorial-deploy.{service,timer}
sudo systemctl daemon-reload
```

The clone and webroot stay; remove them by hand if you also want those gone.

## Adapting for other repos

Copy `deploy/` to a sibling repo and change three values:

1. The clone path and webroot in `deploy.sh` (`CLONE`, `WEBROOT` defaults).
2. The sync command line — replace `scripts/sync-umsme.sh --https` with whatever pulls that repo's inputs (delete it if there are none).
3. The service / timer names (rename `umstutorial-deploy` throughout).
