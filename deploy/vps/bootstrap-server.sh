#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 24.04 server (Azure VM, Hetzner, ...).
# Run as root (or with sudo):  bash bootstrap-server.sh <deploy-user> "<ssh-public-key>"
#
# Installs Docker, creates a sudo deploy user that can log in with the given
# SSH key, adds 4 GB swap, enables the firewall (SSH, HTTP, HTTPS only) and
# disables SSH password and root login.
set -euo pipefail

DEPLOY_USER="${1:?Usage: bootstrap-server.sh <deploy-user> \"<ssh-public-key>\"}"
SSH_KEY="${2:?Usage: bootstrap-server.sh <deploy-user> \"<ssh-public-key>\"}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades

# Docker Engine + Compose plugin from Docker's official repository.
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Keep container logs from filling the disk.
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" }
}
JSON
systemctl restart docker

# Deploy user with SSH key login and Docker access.
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG sudo,docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
grep -qxF "$SSH_KEY" "/home/$DEPLOY_USER/.ssh/authorized_keys" || echo "$SSH_KEY" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"

# 4 GB swap as a safety net for builds and AI job spikes.
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf
  sysctl -p /etc/sysctl.d/99-swap.conf
fi

# Firewall. Docker publishes only Caddy's 80/443 in the VPS override.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# SSH hardening: key login only, no root login.
cat > /etc/ssh/sshd_config.d/90-lumigap.conf <<'SSHD'
PasswordAuthentication no
PermitRootLogin no
SSHD
systemctl restart ssh

systemctl enable --now fail2ban unattended-upgrades

echo
echo "Server ready. Log in again as: ssh $DEPLOY_USER@<server-ip>"
