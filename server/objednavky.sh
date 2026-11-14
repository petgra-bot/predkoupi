#!/usr/bin/env bash
# Před koupí – krok 3: objednávky na server (api.predkoupi.cz s HTTPS, fronta prověrek, úklid, Comgate).
# Spouští Petr jako root (po deploy-nemo.sh a klice.sh):
#   curl -fsSL "https://raw.githubusercontent.com/petgra-bot/predkoupi/main/server/objednavky.sh" | bash
# Zeptá se na Comgate (identifikátor obchodu a heslo; psaní hesla není vidět) a uloží je jen na server
# do /home/nemo/.config/nemo/klice.env. Nic tajného neodesílá jinam než do Comgate. Lze spustit opakovaně.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Spusťte jako root."; exit 1; }
APP=/home/nemo/app
NEMO=$APP/nemo
PY=/home/nemo/venv/bin/python
VETEV="claude/kind-davinci-ue2jrk"
SOUBOR=/home/nemo/.config/nemo/klice.env
DOMENA=api.predkoupi.cz
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1

echo "== 1/7 Nejnovější kód a knihovny"
sudo -H -u nemo git -C "$APP" fetch -q origin "$VETEV" && sudo -H -u nemo git -C "$APP" reset -q --hard "origin/$VETEV"
sudo -H -u nemo /home/nemo/venv/bin/pip install -q -r "$NEMO/requirements.txt" </dev/null
echo "Kód: $(sudo -u nemo git -C "$APP" log --oneline -1)"

echo "== 2/7 Comgate – klíče (portál Comgate → Nastavení obchodů → Propojení obchodu)"
install -d -o nemo -g nemo -m 700 /home/nemo/.config /home/nemo/.config/nemo
touch "$SOUBOR"; chown nemo:nemo "$SOUBOR"; chmod 600 "$SOUBOR"
stara() { grep -m1 "^$1=" "$SOUBOR" 2>/dev/null | cut -d= -f2- || true; }
nastav() {  # $1 proměnná, $2 hodnota – přepíše jen tento řádek, ostatní klíče zůstanou
  local tmp; tmp=$(mktemp); chmod 600 "$tmp"
  grep -v "^$1=" "$SOUBOR" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  install -o nemo -g nemo -m 600 "$tmp" "$SOUBOR"; rm -f "$tmp"
}
for k in COMGATE_MERCHANT COMGATE_SECRET; do
  nyni=$(stara "$k")
  if [ "$k" = COMGATE_MERCHANT ]; then popis="Identifikátor obchodu (číslo, např. 123456)"; skryte=0; else popis="Heslo pro komunikaci na pozadí (secret)"; skryte=1; fi
  if [ -n "$nyni" ]; then echo "  $popis – uloženo (Enter = ponechat)"; else echo "  $popis"; fi
  if [ $skryte = 1 ]; then read -rs -p "    > " h </dev/tty; echo; else read -r -p "    > " h </dev/tty; fi
  nastav "$k" "${h:-$nyni}"
done
# Do schválení Comgate jsou platby testovací a testovací platba prověrku nespustí (rozhodnutí 13. 11. 2026).
[ -n "$(stara COMGATE_TEST)" ] || nastav COMGATE_TEST 1
echo "Uloženo do $SOUBOR (práva 600, vlastník nemo)."

echo "== 3/7 Služby: API objednávek, fronta prověrek, denní úklid, aktualizace kódu"
cat > /etc/systemd/system/nemo-api.service <<S
[Unit]
Description=Před koupí – API objednávek (uvicorn, jen místně; ven přes Caddy)
After=network-online.target
Wants=network-online.target
[Service]
User=nemo
WorkingDirectory=$NEMO
ExecStart=$PY -m uvicorn objednavky.app:app --host 127.0.0.1 --port 8100 --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1 --no-server-header
Restart=always
RestartSec=3
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
S
cat > /etc/systemd/system/nemo-fronta.service <<S
[Unit]
Description=Před koupí – fronta prověrek (po jedné; po aktualizaci kódu se sama restartuje, až nic neběží)
After=network-online.target nemo-api.service
[Service]
User=nemo
WorkingDirectory=$NEMO
ExecStart=$PY -m objednavky.prace
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
S
cat > /etc/systemd/system/nemo-uklid.service <<S
[Unit]
Description=Před koupí – úklid podle zásad ochrany údajů (30 dnů, nezaplacené objednávky)
[Service]
Type=oneshot
User=nemo
WorkingDirectory=$NEMO
ExecStart=$PY -m objednavky.uklid
S
cat > /etc/systemd/system/nemo-uklid.timer <<S
[Unit]
Description=Před koupí – úklid každý den ve 3:20
[Timer]
OnCalendar=*-*-* 03:20
Persistent=true
[Install]
WantedBy=timers.target
S
# Aktualizace kódu: stáhne novou verzi a při změně restartuje API (fronta se restartuje sama, až dokončí prověrku).
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
cat > /etc/systemd/system/nemo-aktualizace.service <<S
[Unit]
Description=NEMO – stažení nové verze z GitHubu (při změně restart API)
[Service]
Type=oneshot
ExecStart=/usr/local/bin/nemo-aktualizace
S
systemctl daemon-reload
systemctl enable -q nemo-api nemo-fronta nemo-uklid.timer nemo-aktualizace.timer
systemctl restart nemo-api nemo-fronta
systemctl start nemo-uklid.timer nemo-aktualizace.timer

echo "== 4/7 Caddy: HTTPS pro $DOMENA (certifikát Let's Encrypt se vydá sám)"
command -v caddy >/dev/null || apt-get install -y -qq caddy >/dev/null
cat > /etc/caddy/Caddyfile <<S
# Před koupí – API objednávek. Přístupy se nelogují (adresy obsahují přístupové odkazy k reportům).
$DOMENA {
	encode gzip
	reverse_proxy 127.0.0.1:8100
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "no-referrer"
		-Server
	}
}
S
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl enable -q caddy && systemctl reload-or-restart caddy

echo "== 5/7 Firewall: povolit jen SSH, HTTP a HTTPS"
# Port SSH: z právě otevřeného spojení (nejjistější), jinak z konfigurace sshd, jinak 22.
# (sshd -T na Ubuntu 24.04 bez /run/sshd selže – proto || true, jinak by skript tiše skončil.)
SSH_PORT=$(echo "${SSH_CONNECTION:-}" | awk '{print $4}')
[ -n "$SSH_PORT" ] || SSH_PORT=$( (sshd -T 2>/dev/null || true) | awk '/^port /{print $2; exit}')
SSH_PORT=${SSH_PORT:-22}
command -v ufw >/dev/null || apt-get install -y -qq ufw >/dev/null
# Firewall je doplňková ochrana (API stejně poslouchá jen místně); když ufw selže, skript pokračuje a vypíše proč.
firewall() {
  ufw allow "$SSH_PORT/tcp" && ufw allow 80/tcp && ufw allow 443/tcp \
    && ufw default deny incoming && ufw default allow outgoing && ufw --force enable
}
if firewall >/tmp/nemo-ufw.log 2>&1; then
  echo "Povoleno: SSH (port $SSH_PORT), 80, 443. Ostatní příchozí spojení blokována."
else
  echo "!! Firewall se nepodařilo zapnout (pokračuji dál). Podrobnosti:"; tail -5 /tmp/nemo-ufw.log
fi

echo "== 6/7 Comgate: adresa pro oznámení o platbě a povolená IP serveru"
cd "$NEMO" && sudo -H -u nemo "$PY" -m objednavky.comgate_nastav || echo "!! Comgate se nepodařilo nastavit – zkontrolujte identifikátor a heslo (spusťte skript znovu)"

echo "== 7/7 Zkoušky"
sleep 2
echo "API místně: HTTP $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8100/objednavka/neexistuje-zkouska-0000000) (čekáme 404)"
for i in $(seq 1 30); do
  kod=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMENA/objednavka/neexistuje-zkouska-0000000" || true)
  [ "$kod" = 404 ] && break; sleep 3
done
echo "API přes HTTPS: HTTP $kod (čekáme 404; jiné číslo = certifikát se ještě vydává, zkuste za minutu: curl -I https://$DOMENA/)"
cors=$(curl -s -o /dev/null -D - -X OPTIONS "https://$DOMENA/objednavka" -H "Origin: https://proverka.gratzer.cz" \
  -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type" | grep -ci "access-control-allow-origin" || true)
echo "Web proverka.gratzer.cz smí volat API: $([ "$cors" -ge 1 ] && echo ano || echo NE)"

echo
echo "=================== HOTOVO ==================="
echo "API: $(systemctl is-active nemo-api) | Fronta: $(systemctl is-active nemo-fronta) | Caddy: $(systemctl is-active caddy) | Úklid: $(systemctl is-active nemo-uklid.timer) | Aktualizace: $(systemctl is-active nemo-aktualizace.timer)"
echo "Výpis chyb API:   journalctl -u nemo-api -n 50"
echo "Výpis fronty:     journalctl -u nemo-fronta -n 50"
echo "Další krok: zkušební objednávka na https://proverka.gratzer.cz/proverit/ (platba v testovacím režimu Comgate)."
