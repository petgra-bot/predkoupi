#!/usr/bin/env bash
# Před koupí – první nastavení serveru (Ubuntu 24.04, Wedos VPS SSD). Spouští Petr jako root:
#   curl -fsSL https://raw.githubusercontent.com/petgra-bot/predkoupi/main/server/bootstrap.sh | bash
# Skript nic neodesílá a nečte žádná hesla. Lze ho spustit opakovaně.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Spusťte jako root."; exit 1; }
echo "== 1/7 Aktualizace systému"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q && apt-get -y -q upgrade
apt-get -y -q install ca-certificates curl git ufw fail2ban unattended-upgrades \
  python3 python3-venv python3-pip poppler-utils fonts-dejavu-core jq

echo "== 2/7 Automatické bezpečnostní aktualizace"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== 3/7 Swap 2 GB (pojistka pro výrobu PDF)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -q vm.swappiness=10; grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo "== 4/7 Firewall: povolené jen SSH (web pro objednávky přidáme později)"
ufw allow OpenSSH >/dev/null; ufw --force enable >/dev/null; ufw status | head -5

echo "== 5/7 Node.js 22 a Chromium pro PDF"
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get -y -q install nodejs
fi
timedatectl set-timezone Europe/Prague

echo "== 6/7 Uživatel 'nemo' pro aplikaci a klíč pro čtení repozitáře z GitHubu"
id nemo >/dev/null 2>&1 || adduser --disabled-password --gecos "" nemo
sudo -u nemo mkdir -p /home/nemo/.ssh
[ -f /home/nemo/.ssh/github_deploy ] || sudo -u nemo ssh-keygen -q -t ed25519 -N "" -C "predkoupi-server-deploy" -f /home/nemo/.ssh/github_deploy
sudo -u nemo bash -c 'cat > ~/.ssh/config <<C
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
C
chmod 600 ~/.ssh/config'

echo "== 7/7 Přihlášení jen klíčem (heslo se vypne, pokud máte root klíč)"
if [ -s /root/.ssh/authorized_keys ]; then
  sed -i -E 's/^#?PasswordAuthentication .*/PasswordAuthentication no/; s/^#?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  rm -f /etc/ssh/sshd_config.d/50-cloud-init.conf 2>/dev/null || true
  systemctl reload ssh || systemctl reload sshd
  echo "Heslo pro SSH vypnuto, přihlášení jen klíčem."
else
  echo "POZOR: root nemá SSH klíč – heslo zůstává zapnuté. Nejdřív ssh-copy-id z Macu, pak skript spusťte znovu."
fi

echo
echo "=================== HOTOVO ==================="
echo "Paměť: $(free -h | awk '/Mem/{print $2}') + swap $(free -h | awk '/Swap/{print $2}')  | Disk volno: $(df -h / | awk 'NR==2{print $4}')"
echo "Node $(node -v), Python $(python3 -V | cut -d' ' -f2)"
echo
echo "Tento veřejný klíč vložte na GitHubu do repozitáře petgra-bot/automatic-enigma:"
echo "Settings → Deploy keys → Add deploy key (název 'server', BEZ zaškrtnutí Allow write access):"
echo
cat /home/nemo/.ssh/github_deploy.pub
