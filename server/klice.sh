#!/usr/bin/env bash
# Klíče pro NEMO na serveru. Spouští Petr jako root:
#   curl -fsSL "https://raw.githubusercontent.com/petgra-bot/predkoupi/main/server/klice.sh" | bash
# Zeptá se postupně na klíče (psaní není vidět), uloží je do /home/nemo/.config/nemo/klice.env
# (čte jen uživatel nemo), doinstaluje knihovny a klíče ověří bez placených dotazů.
# Enter bez hodnoty = ponechat dosavadní. Lze spouštět opakovaně.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Spusť jako root."; exit 1; }
SOUBOR=/home/nemo/.config/nemo/klice.env
APP=/home/nemo/app/nemo
install -d -o nemo -g nemo -m 700 /home/nemo/.config /home/nemo/.config/nemo
touch "$SOUBOR"; chown nemo:nemo "$SOUBOR"; chmod 600 "$SOUBOR"

stara() { grep -m1 "^$1=" "$SOUBOR" 2>/dev/null | cut -d= -f2- || true; }
declare -A NOVE
zeptej() {  # $1 proměnná, $2 popis, $3 skryto(1)/vidět(0)
  local nyni hodnota
  nyni=$(stara "$1")
  if [ -n "$nyni" ]; then echo "  $2 – uloženo (Enter = ponechat)"; else echo "  $2"; fi
  if [ "$3" = 1 ]; then read -rs -p "    > " hodnota </dev/tty; echo; else read -r -p "    > " hodnota </dev/tty; fi
  NOVE[$1]="${hodnota:-$nyni}"
}

echo "== Klíče (Ctrl+V nebo pravé tlačítko myši vloží; při skrytém psaní se nic nezobrazuje, to je v pořádku)"
echo "1) Claude API (console.anthropic.com → API Keys; začíná sk-ant-api…)"
zeptej ANTHROPIC_API_KEY "Claude API klíč" 1
echo "2) Fastmail – heslo aplikace pro odesílání reportů"
zeptej SMTP_USER "E-mail, ze kterého se posílá (info@predkoupi.cz)" 0
zeptej SMTP_PASS "Heslo aplikace z Fastmailu (16 znaků)" 1
echo "3) Katastr – účet pro webové služby WSDP"
zeptej WSDP_USER "Uživatelské jméno WSDP" 0
zeptej WSDP_PASS "Heslo WSDP" 1
echo "4) Centrální evidence exekucí"
zeptej CEE_P_API_KEY "Produkční API klíč (P)" 1
zeptej CEE_P_API_SECRET "Produkční API secret (P)" 1
zeptej CEE_T_API_KEY "Testovací API klíč (T) – nepovinné" 1
zeptej CEE_T_API_SECRET "Testovací API secret (T) – nepovinné" 1

DOCASNY=$(mktemp); chmod 600 "$DOCASNY"
{ echo "# Klíče NEMO – $(date '+%F %T'). Nesdílet, nekopírovat jinam."
  for k in ANTHROPIC_API_KEY SMTP_USER SMTP_PASS WSDP_USER WSDP_PASS CEE_P_API_KEY CEE_P_API_SECRET CEE_T_API_KEY CEE_T_API_SECRET; do
    printf '%s=%s\n' "$k" "${NOVE[$k]}"
  done
  # Ostatní klíče (např. COMGATE_* z objednavky.sh) zůstávají beze změny.
  grep -vE '^(#|ANTHROPIC_API_KEY|SMTP_USER|SMTP_PASS|WSDP_USER|WSDP_PASS|CEE_P_API_KEY|CEE_P_API_SECRET|CEE_T_API_KEY|CEE_T_API_SECRET)=?' "$SOUBOR" | grep '=' || true
  } > "$DOCASNY"
install -o nemo -g nemo -m 600 "$DOCASNY" "$SOUBOR"; rm -f "$DOCASNY"
echo "Uloženo do $SOUBOR (práva 600, vlastník nemo)."

echo "== Knihovny (Claude Agent SDK aj.)"
sudo -H -u nemo git -C /home/nemo/app fetch -q origin && sudo -H -u nemo git -C /home/nemo/app reset -q --hard "@{u}"
sudo -H -u nemo /home/nemo/venv/bin/pip install -q -r "$APP/requirements.txt" </dev/null
CLI=$(sudo -H -u nemo /home/nemo/venv/bin/python -c "import claude_agent_sdk,os;print(os.path.join(os.path.dirname(claude_agent_sdk.__file__),'_bundled','claude'))")
echo "Claude Code (součást SDK): $(sudo -H -u nemo "$CLI" --version 2>&1 | head -1)"

echo "== Ověření klíčů (nic se neplatí)"
cd "$APP" && sudo -H -u nemo /home/nemo/venv/bin/python -m nastroje.over_klice || echo "!! některý klíč chybí nebo neplatí – spusť skript znovu a zadej ho"
echo "== HOTOVO"
