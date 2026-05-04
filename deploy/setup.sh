#!/usr/bin/env bash
#
# kiteindex VPS bootstrap. Run once on a fresh Ubuntu 24.04 LTS host as root:
#
#   sudo bash deploy/setup.sh
#
# Idempotent — safe to re-run. Steps:
#   1. apt update / install Docker + Docker Compose plugin / install ufw
#   2. Install kpass binary  (NOTE: edit KPASS_INSTALL_CMD below first)
#   3. UFW firewall: 22, 80, 443 only
#   4. SSH: key-only, password auth disabled
#
# After this script finishes, see deploy/README.md for the application bring-up.

set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "ERROR: run this script as root (e.g. sudo $0)" >&2
  exit 1
fi

log()  { printf '\n=== %s ===\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

# ----------------------------------------------------------------------------
# 1. Base packages + Docker
# ----------------------------------------------------------------------------
log "apt update + base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg ufw

if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker CE + Compose plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  source /etc/os-release
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  log "Docker already installed — skipping"
fi

# ----------------------------------------------------------------------------
# 2. kpass binary
#
# Default install path is the official one-liner from docs.gokite.ai:
#   curl -fsSL https://agentpassport.ai/install.sh | bash
# The installer was designed for coding-agent contexts but the binary
# install works standalone. Override with KPASS_INSTALL_CMD if needed.
#
# Read the installer once before trusting it. The deploy/README.md tells
# operators to do that. We won't re-fetch on every run; once kpass is on
# PATH, this section is a no-op.
# ----------------------------------------------------------------------------
KPASS_INSTALL_CMD="${KPASS_INSTALL_CMD:-curl -fsSL https://agentpassport.ai/install.sh | bash}"

if ! command -v kpass >/dev/null 2>&1; then
  log "installing kpass via: $KPASS_INSTALL_CMD"
  bash -c "$KPASS_INSTALL_CMD"
else
  log "kpass already installed at $(command -v kpass) — skipping"
fi

if ! command -v kpass >/dev/null 2>&1; then
  # The official installer typically drops the binary under ~/.local/bin
  # (or sometimes /root/.local/bin when run via sudo). Best-effort search.
  for candidate in \
    /root/.local/bin/kpass \
    "${HOME:-/root}/.local/bin/kpass" \
    "${SUDO_USER:+/home/$SUDO_USER/.local/bin/kpass}"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      log "found kpass at $candidate; symlinking to /usr/local/bin/kpass"
      ln -sf "$candidate" /usr/local/bin/kpass
      break
    fi
  done
fi

if ! command -v kpass >/dev/null 2>&1; then
  warn "kpass install reported success but kpass is still not on PATH."
  warn "Searched /root/.local/bin, \$HOME/.local/bin, /home/\$SUDO_USER/.local/bin."
  warn "Locate the binary, symlink it into /usr/local/bin/kpass, and re-run."
  exit 1
fi

# docker-compose mounts /usr/local/bin/kpass into the indexer container, so
# this exact path must exist on the host. If kpass resolved via PATH but
# isn't under /usr/local/bin, drop a symlink so the bind mount works.
if [[ ! -e /usr/local/bin/kpass ]]; then
  resolved="$(command -v kpass)"
  log "kpass resolved to $resolved; symlinking to /usr/local/bin/kpass for the compose mount"
  ln -sf "$resolved" /usr/local/bin/kpass
fi

# ----------------------------------------------------------------------------
# 3. UFW
# ----------------------------------------------------------------------------
log "configuring UFW (22, 80, 443 only)"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'ssh'
ufw allow 80/tcp comment 'http (caddy redirect to https)'
ufw allow 443/tcp comment 'https (caddy)'
ufw --force enable
ufw status verbose

# ----------------------------------------------------------------------------
# 4. SSH: key-only
# ----------------------------------------------------------------------------
log "hardening sshd: key-only auth"

mkdir -p /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/00-kiteindex.conf <<'EOF'
# Managed by kiteindex deploy/setup.sh — do not edit by hand
PasswordAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
UsePAM yes
EOF

# Cloud-init on Ubuntu 24.04 ships /etc/ssh/sshd_config.d/50-cloud-init.conf
# which often re-enables password auth. Override it.
if [[ -f /etc/ssh/sshd_config.d/50-cloud-init.conf ]]; then
  sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' \
    /etc/ssh/sshd_config.d/50-cloud-init.conf || true
fi

# Validate before bouncing sshd — a typo here would lock us out.
if sshd -t; then
  systemctl restart ssh
  log "sshd restarted"
else
  warn "sshd config failed validation; NOT restarting. Investigate and re-run."
  exit 1
fi

log "kiteindex VPS bootstrap complete"
echo
echo "Next steps (see deploy/README.md):"
echo "  1. git clone https://github.com/gnanam1990/kiteindex /opt/kiteindex"
echo "  2. cp /opt/kiteindex/.env.example /opt/kiteindex/.env.production"
echo "  3. \$EDITOR /opt/kiteindex/.env.production   # fill POSTGRES_PASSWORD, KPASS_CONFIG_DIR"
echo "  4. cd /opt/kiteindex && docker compose --env-file .env.production up -d --build"
echo "  5. Point kiteindex.xyz + www.kiteindex.xyz A records at this VPS"
echo "  6. curl https://kiteindex.xyz/health"
