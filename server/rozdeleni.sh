#!/usr/bin/env bash
# Před koupí – krok 4: rozdělení serveru na OSTROU a TESTOVACÍ instanci (Petr 14. 11. 2026).
# Spouští Petr jako root (jednou; lze spustit znovu):
#   curl -fsSL "https://raw.githubusercontent.com/petgra-bot/predkoupi/main/server/rozdeleni.sh" | bash
#
#   ostrá:     /home/nemo/app       větev nemo-ostra                 port 8100  https://api.predkoupi.cz        web predkoupi.cz
#   testovací: /home/nemo/app-test  větev claude/kind-davinci-ue2jrk port 8101  https://api.predkoupi.cz/test   web proverka.gratzer.cz
#
# Obě sdílejí klíče (klice.env), knihovny (venv) a staženou dokumentaci EIA; databáze objednávek, výpisy a reporty
# má každá vlastní. Testovací čísluje objednávky „T2026-…“. Comgate posílá oznámení jen na ostrou adresu; ostrá
# platby, které nezná, předá testovací. Přepínač „placené“ má jen testovací instance (soubor test.env).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Spusťte jako root."; exit 1; }
PY=/home/nemo/venv/bin/python
OSTRA=/home/nemo/app;      V_OSTRA="nemo-ostra"
TEST=/home/nemo/app-test;  V_TEST="claude/kind-davinci-ue2jrk"
REPO="git@github.com:petgra-bot/automatic-enigma.git"
CFG=/home/nemo/.config/nemo
export DEBIAN_FRONTEND=noninteractive

echo "== 1/6 Ostrá instance na větev $V_OSTRA"
sudo -H -u nemo git -C "$OSTRA" fetch -q origin "$V_OSTRA"
sudo -H -u nemo git -C "$OSTRA" checkout -q -B "$V_OSTRA" "origin/$V_OSTRA"
sudo -H -u nemo git -C "$OSTRA" reset -q --hard "origin/$V_OSTRA"
echo "Ostrá: $(sudo -u nemo git -C "$OSTRA" log --oneline -1)"

echo "== 2/6 Testovací instance ($TEST, větev $V_TEST)"
if [ -d "$TEST/.git" ]; then
  sudo -H -u nemo git -C "$TEST" fetch -q origin "$V_TEST" && sudo -H -u nemo git -C "$TEST" reset -q --hard "origin/$V_TEST"
else
  sudo -H -u nemo git clone -q --depth 50 --branch "$V_TEST" "$REPO" "$TEST"
fi
sudo -H -u nemo /home/nemo/venv/bin/pip install -q -r "$TEST/nemo/requirements.txt" </dev/null
sudo -H -u nemo bash -c "cd $TEST/nemo && npm ci --silent --no-audit --no-fund </dev/null"
# Dokumentace EIA a záloha Metropolitního plánu: jedna sdílená složka (noční stažení dělá ostrá instance).
if [ ! -L "$TEST/nemo/.cache" ]; then rm -rf "$TEST/nemo/.cache"; sudo -u nemo ln -s "$OSTRA/nemo/.cache" "$TEST/nemo/.cache"; fi
echo "Testovací: $(sudo -u nemo git -C "$TEST" log --oneline -1)"

echo "== 3/6 Nastavení instancí"
# Testovací přepínače (NEMO_TESTOVACI_PLATBY apod.) jen pro testovací instanci; z klice.env je odstraníme.
touch "$CFG/test.env"; chown nemo:nemo "$CFG/test.env"; chmod 600 "$CFG/test.env"
if grep -q '^NEMO_TESTOVACI_PLATBY=' "$CFG/klice.env" 2>/dev/null; then
  grep '^NEMO_TESTOVACI_PLATBY=' "$CFG/klice.env" >> "$CFG/test.env"; sed -i '/^NEMO_TESTOVACI_PLATBY=/d' "$CFG/klice.env"
fi
sluzba() {  # $1 jméno, $2 popis, $3 složka, $4 příkaz, $5 prostředí, $6 EnvironmentFile (nepovinné)
  cat > "/etc/systemd/system/$1.service" <<S
[Unit]
Description=$2
After=network-online.target
Wants=network-online.target
[Service]
User=nemo
WorkingDirectory=$3/nemo
$5
${6:+EnvironmentFile=$6}
ExecStart=$4
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
S
}
OSTRA_ENV='Environment=NEMO_WEB=https://predkoupi.cz "NEMO_ORIGINY=https://predkoupi.cz,https://www.predkoupi.cz" NEMO_PREPOSLAT_PUSH=http://127.0.0.1:8101/comgate/push'
TEST_ENV='Environment=NEMO_WEB=https://proverka.gratzer.cz NEMO_ORIGINY=https://proverka.gratzer.cz NEMO_PREFIX_CISLA=T COMGATE_TEST=1'
UVI="-m uvicorn objednavky.app:app --host 127.0.0.1 --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1 --no-server-header --port"
sluzba nemo-api      "Před koupí – API objednávek (OSTRÉ)"      "$OSTRA" "$PY $UVI 8100"          "$OSTRA_ENV"
sluzba nemo-fronta   "Před koupí – fronta prověrek (OSTRÁ)"     "$OSTRA" "$PY -m objednavky.prace" "$OSTRA_ENV"
sluzba nemo-api-test    "Před koupí – API objednávek (TEST)"    "$TEST"  "$PY $UVI 8101"          "$TEST_ENV" "$CFG/test.env"
sluzba nemo-fronta-test "Před koupí – fronta prověrek (TEST)"   "$TEST"  "$PY -m objednavky.prace" "$TEST_ENV" "$CFG/test.env"
cat > /etc/systemd/system/nemo-uklid.service <<S
[Unit]
Description=Před koupí – úklid podle zásad ochrany údajů (obě instance)
[Service]
Type=oneshot
User=nemo
ExecStart=/bin/bash -c 'cd $OSTRA/nemo && $PY -m objednavky.uklid; cd $TEST/nemo && NEMO_PREFIX_CISLA=T $PY -m objednavky.uklid'
S

echo "== 4/6 Aktualizace kódu: obě instance každých 10 minut"
cat > /usr/local/bin/nemo-aktualizace <<'S'
#!/usr/bin/env bash
# Stáhne novou verzi obou instancí; při změně restartuje jejich API (fronty se restartují samy, až nic neběží).
set -uo pipefail
aktualizuj() {  # $1 složka, $2 větev, $3 služba API
  cd "$1" || return
  local pred po
  pred=$(sudo -u nemo git rev-parse HEAD)
  sudo -u nemo git fetch -q origin "$2" && sudo -u nemo git reset -q --hard "origin/$2" || return
  po=$(sudo -u nemo git rev-parse HEAD)
  [ "$pred" = "$po" ] && return
  if ! sudo -u nemo git diff --quiet "$pred" "$po" -- nemo/requirements.txt; then
    sudo -H -u nemo /home/nemo/venv/bin/pip install -q -r nemo/requirements.txt </dev/null
  fi
  systemctl is-enabled -q "$3" 2>/dev/null && systemctl restart "$3"
  echo "$3: aktualizováno na $(sudo -u nemo git log --oneline -1)"
}
aktualizuj /home/nemo/app nemo-ostra nemo-api
[ -d /home/nemo/app-test/.git ] && aktualizuj /home/nemo/app-test claude/kind-davinci-ue2jrk nemo-api-test
exit 0
S
chmod 755 /usr/local/bin/nemo-aktualizace

echo "== 5/6 Caddy: api.predkoupi.cz (ostré) a api.predkoupi.cz/test (testovací)"
cat > /etc/caddy/Caddyfile <<'S'
# Před koupí – API objednávek. Přístupy se nelogují (adresy obsahují přístupové odkazy k reportům).
api.predkoupi.cz {
	encode gzip
	handle_path /test/* {
		reverse_proxy 127.0.0.1:8101
	}
	handle {
		reverse_proxy 127.0.0.1:8100
	}
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "no-referrer"
		-Server
	}
}
S
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl daemon-reload
systemctl enable -q nemo-api nemo-fronta nemo-api-test nemo-fronta-test
systemctl restart nemo-api nemo-fronta nemo-api-test nemo-fronta-test
systemctl reload-or-restart caddy

echo "== 6/6 Zkoušky"
sleep 3
for u in "https://api.predkoupi.cz" "https://api.predkoupi.cz/test"; do
  echo "$u: HTTP $(curl -s -o /dev/null -w '%{http_code}' "$u/objednavka/neexistuje-zkouska-0000000") (čekáme 404)"
done
cors() { curl -s -o /dev/null -D - -X OPTIONS "$1/objednavka" -H "Origin: $2" -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" | grep -ci "access-control-allow-origin" || true; }
echo "Ostré API pro predkoupi.cz: $([ "$(cors https://api.predkoupi.cz https://predkoupi.cz)" -ge 1 ] && echo ano || echo NE)"
echo "Testovací API pro proverka.gratzer.cz: $([ "$(cors https://api.predkoupi.cz/test https://proverka.gratzer.cz)" -ge 1 ] && echo ano || echo NE)"
echo "Ostré API pro proverka.gratzer.cz (má být NE): $([ "$(cors https://api.predkoupi.cz https://proverka.gratzer.cz)" -ge 1 ] && echo ano || echo NE)"
echo
echo "=================== HOTOVO ==================="
for s in nemo-api nemo-fronta nemo-api-test nemo-fronta-test caddy; do printf '%-18s %s\n' "$s" "$(systemctl is-active $s)"; done
echo "Přepínač „placené“ je teď jen pro test: /home/nemo/.config/nemo/test.env"
