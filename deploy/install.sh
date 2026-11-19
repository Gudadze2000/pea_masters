#!/usr/bin/env bash
# One-time server setup (Ubuntu 24.04). Run with sudo from the repository:   sudo ./deploy/install.sh
#   - Docker Engine + Compose from Docker's own package repository
#   - the firewall (ufw): only SSH, http and https come in
#   - automatic security updates
#   - lets the person who ran it use docker without sudo, and a folder for backups
# Safe to run again.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi
user=${SUDO_USER:?run with sudo from your own account, not as root}

echo "== Packages"
apt-get update -q
apt-get install -y -q ca-certificates curl ufw unattended-upgrades

echo "== Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  codename=$(. /etc/os-release && echo "$VERSION_CODENAME")
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
usermod -aG docker "$user"

echo "== Firewall"
# Allow every port sshd listens on before switching the firewall on, so this session isn't cut off
ssh_ports=$(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}' || true)
for port in ${ssh_ports:-22}; do
  ufw allow "$port/tcp" comment "SSH"
done
ufw allow 80/tcp comment "PEA http (redirects to https, certificate checks)"
ufw allow 443/tcp comment "PEA https"
ufw allow 443/udp comment "PEA https (HTTP/3)"
ufw --force enable
ufw status verbose

echo "== Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades

echo "== Backups folder"
install -d -m 0750 -o "$user" -g "$user" /var/backups/pea

echo
echo "Done. Sign out and back in (so '$user' can use docker), then follow DEPLOY.md from 'First deploy'."
