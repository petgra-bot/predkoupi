#!/usr/bin/env bash
# Před koupí – krok 2: NEMO na server (stažení z GitHubu, knihovny, Chromium, automatická aktualizace, zkoušky).
# Spouští Petr jako root:
#   curl -fsSL "https://raw.githubusercontent.com/petgra-bot/predkoupi/main/server/deploy-nemo.sh" | bash
# Nic tajného nečte ani neodesílá. Lze spustit opakovaně.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Spusťte jako root."; exit 1; }
REPO="git@github.com:petgra-bot/automatic-enigma.git"
VETEV="nemo-ostra"          # ostrá větev NEMO (testovací instance: rozdeleni.sh)
APP=/home/nemo/app
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1

echo "== 1/6 GitHub: ověření klíče a stažení kódu"
sudo -u nemo bash -c 'ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null; sort -u -o ~/.ssh/known_hosts ~/.ssh/known_hosts'
if [ -d "$APP/.git" ]; then
  sudo -u nemo git -C "$APP" fetch -q origin "$VETEV" && sudo -u nemo git -C "$APP" checkout -q "$VETEV" && sudo -u nemo git -C "$APP" reset -q --hard "origin/$VETEV"
else
  sudo -u nemo git clone -q --depth 50 --branch "$VETEV" "$REPO" "$APP"
fi
echo "Kód: $(sudo -u nemo git -C "$APP" log --oneline -1)"

echo "== 2/6 Python knihovny"
sudo -u nemo python3 -m venv /home/nemo/venv
sudo -u nemo /home/nemo/venv/bin/pip install -q --upgrade pip </dev/null
sudo -u nemo /home/nemo/venv/bin/pip install -q --force-reinstall --no-deps "numpy<2.2" </dev/null
sudo -u nemo /home/nemo/venv/bin/pip install -q -r "$APP/nemo/requirements.txt" </dev/null
echo "Procesor: $(grep -m1 "model name" /proc/cpuinfo | cut -d: -f2) | SSE4.2: $(grep -qw sse4_2 /proc/cpuinfo && echo ano || echo ne)"

echo "== 3/6 Node knihovny a Chromium pro PDF"
sudo -u nemo bash -c "cd $APP/nemo && npm ci --silent --no-audit --no-fund </dev/null"
( cd "$APP/nemo" && npx --yes playwright install-deps chromium </dev/null >/dev/null )
sudo -u nemo bash -c "cd $APP/nemo && npx playwright install chromium </dev/null >/dev/null"

echo "== 4/6 Automatická aktualizace kódu každých 10 minut"
# Stáhne novou verzi; když běží API objednávek (objednavky.sh), při změně ho restartuje.
if ! grep -q app-test /usr/local/bin/nemo-aktualizace 2>/dev/null; then   # po rozdělení ho spravuje rozdeleni.sh
cat > /usr/local/bin/nemo-aktualizace <<S
#!/usr/bin/env bash
set -euo pipefail
cd $APP
pred=\$(sudo -u nemo git rev-parse HEAD)
sudo -u nemo git fetch -q origin $VETEV
sudo -u nemo git reset -q --hard origin/$VETEV
po=\$(sudo -u nemo git rev-parse HEAD)
[ "\$pred" = "\$po" ] && exit 0
if ! sudo -u nemo git diff --quiet "\$pred" "\$po" -- nemo/requirements.txt; then
  sudo -H -u nemo /home/nemo/venv/bin/pip install -q -r nemo/requirements.txt </dev/null
fi
systemctl is-enabled -q nemo-api 2>/dev/null && systemctl restart nemo-api
echo "aktualizováno na \$(sudo -u nemo git log --oneline -1)"
S
chmod 755 /usr/local/bin/nemo-aktualizace
fi
cat > /etc/systemd/system/nemo-aktualizace.service <<S
[Unit]
Description=NEMO – stažení nové verze z GitHubu (při změně restart API)
[Service]
Type=oneshot
ExecStart=/usr/local/bin/nemo-aktualizace
S
cat > /etc/systemd/system/nemo-aktualizace.timer <<S
[Unit]
Description=NEMO – aktualizace kódu každých 10 minut
[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
[Install]
WantedBy=timers.target
S
# Noční stažení dokumentace EIA pro Prahu (nastroje/eia_cache.py), ať prověrka nečeká na portál CENIA.
cat > /etc/systemd/system/nemo-eia.service <<S
[Unit]
Description=NEMO – předem stažená dokumentace EIA pro Prahu
[Service]
Type=oneshot
User=nemo
WorkingDirectory=$APP/nemo
Nice=10
TimeoutStartSec=6h
ExecStart=/home/nemo/venv/bin/python -m nastroje.eia_cache
S
cat > /etc/systemd/system/nemo-eia.timer <<S
[Unit]
Description=NEMO – EIA každou noc ve 2:40
[Timer]
OnCalendar=*-*-* 02:40
Persistent=true
[Install]
WantedBy=timers.target
S
systemctl daemon-reload && systemctl enable --now nemo-aktualizace.timer nemo-eia.timer >/dev/null

echo "== 5/6 Zkouška: ochutnávka (veřejné mapy)"
cd "$APP/nemo"
sudo -u nemo /home/nemo/venv/bin/python -m nastroje.ochutnavka server-test --adresa "Karlická 910/49, Radotín" || echo "!! ochutnávka selhala"
sudo -u nemo node sablona/ochutnavka.js server-test >/dev/null && ls -lh reporty/server-test-ochutnavka.pdf || echo "!! PDF selhalo"

echo "== 6/6 Zkouška: insolvenční rejstřík (port 8443, vymyšlené jméno – čekáme prázdný výsledek)"
sudo -u nemo /home/nemo/venv/bin/python - <<'P' || echo "!! insolvenční rejstřík nedostupný"
from nastroje import lustrace
r = lustrace._isir({"nazevOsoby": "Neexistujici", "jmeno": "Testovaci", "datumNarozeni": "1970-01-01",
                    "maxPocetVysledku": "1", "vyhledatPresnouShoduJmen": "T", "maxRelevanceVysledku": "4"})
print("ISIR odpovídá, nalezeno řízení:", len(r))
P
rm -rf "$APP/nemo/vystupy/server-test" "$APP/nemo/reporty/server-test-ochutnavka.pdf"

echo
echo "=================== HOTOVO ==================="
echo "Kód: $(sudo -u nemo git -C "$APP" log --oneline -1)"
echo "Automatická aktualizace: $(systemctl is-active nemo-aktualizace.timer) | Noční EIA: $(systemctl is-active nemo-eia.timer)"
echo "Paměť volná: $(free -h | awk '/Mem/{print $7}')  | Disk volno: $(df -h / | awk 'NR==2{print $4}')"
