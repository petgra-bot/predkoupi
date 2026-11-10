#!/usr/bin/env bash
# Fastmail pro odesílání reportů – samostatně. Spouští Petr jako root:
#   curl -fsSL "https://raw.githubusercontent.com/petgra-bot/predkoupi/main/server/fastmail.sh" | bash
# Zeptá se na přihlašovací jméno a heslo aplikace, vyzkouší přihlášení (port 465 i 587), vypíše srozumitelnou
# příčinu chyby, pošle zkušební e-mail a teprve když vše projde, uloží údaje do /home/nemo/.config/nemo/klice.env.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Spusť jako root."; exit 1; }
SOUBOR=/home/nemo/.config/nemo/klice.env
PY=/home/nemo/venv/bin/python
[ -f "$SOUBOR" ] || { echo "Chybí $SOUBOR – nejdřív spusť klice.sh"; exit 1; }

echo "== Fastmail"
echo "Přihlašovací jméno = e-mail, kterým se přihlašujete do Fastmailu (hlavní adresa účtu)."
echo "Pozor: adresa info@predkoupi.cz je jen alias – přihlásit se s ní nejde, posílat z ní ano."
read -r  -p "  Přihlašovací e-mail do Fastmailu: " UZIV </dev/tty
read -rs -p "  Heslo aplikace (vložení se nezobrazí): " HESLO </dev/tty; echo
read -r  -p "  Odesílat jako [info@predkoupi.cz]: " OD </dev/tty; OD=${OD:-info@predkoupi.cz}
read -r  -p "  Kam poslat zkušební e-mail [$UZIV]: " KOMU </dev/tty; KOMU=${KOMU:-$UZIV}

export F_UZIV="$UZIV" F_HESLO="$HESLO" F_OD="$OD" F_KOMU="$KOMU"
if sudo -E -H -u nemo "$PY" - <<'PYEOF'
import os, smtplib, socket, ssl, sys
from email.message import EmailMessage
u, h, od, komu = (os.environ[k] for k in ("F_UZIV", "F_HESLO", "F_OD", "F_KOMU"))
h2 = "".join(h.split())                       # mezery a konce řádků z kopírování pryč
print(f"  heslo: {len(h)} znaků" + (f", po odstranění mezer {len(h2)}" if h2 != h else "")
      + ("  (heslo aplikace Fastmail mívá 16 znaků)" if len(h2) != 16 else ""))
if "@" not in u:
    print("  !! přihlašovací jméno není e-mail"); sys.exit(1)

def zkus(port):
    try:
        if port == 465:
            s = smtplib.SMTP_SSL("smtp.fastmail.com", 465, timeout=15)
        else:
            s = smtplib.SMTP("smtp.fastmail.com", 587, timeout=15); s.starttls(context=ssl.create_default_context())
        s.login(u, h2)
        return s, None
    except smtplib.SMTPAuthenticationError as e:
        return None, f"jméno nebo heslo nesedí ({e.smtp_code})"
    except (socket.timeout, OSError) as e:
        return None, f"spojení nejde ({type(e).__name__}: {e})"

spojeni = None
for port in (465, 587):
    s, chyba = zkus(port)
    print(f"  port {port}: " + ("přihlášení OK" if s else chyba))
    if s and not spojeni:
        spojeni = s
    elif s:
        s.quit()
if not spojeni:
    print("""
  Nejčastější příčiny:
   1. Jako jméno je zadán alias (info@predkoupi.cz) místo hlavní adresy účtu – zkontroluj v Fastmailu
      Settings → Privacy & Security, nahoře „Username“.
   2. Heslo aplikace nemá přístup „SMTP“ (nebo „Mail (IMAP/POP/SMTP)“) – vytvoř nové s tímto přístupem.
   3. Vloženo i něco navíc / chybí znak – vytvoř nové heslo a vlož ho znovu.""")
    sys.exit(1)

m = EmailMessage()
m["From"], m["To"], m["Subject"] = f"Před koupí <{od}>", komu, "Zkouška odesílání ze serveru Před koupí"
m.set_content("Tento e-mail poslal server Před koupí (46.28.109.180). Pokud dorazil, odesílání reportů funguje.")
try:
    spojeni.send_message(m)
    print(f"  zkušební e-mail odeslán z {od} na {komu} – zkontroluj doručenou poštu (i spam)")
except smtplib.SMTPException as e:
    print(f"  !! přihlášení prošlo, ale odeslání z {od} odmítnuto: {e}")
    print(f"     V Fastmailu musí být {od} nastavená jako adresa pro odesílání (Settings → Sending identities).")
    sys.exit(2)
finally:
    spojeni.quit()
PYEOF
then
  DOCASNY=$(mktemp); chmod 600 "$DOCASNY"
  grep -v -E '^(SMTP_USER|SMTP_PASS|SMTP_FROM)=' "$SOUBOR" > "$DOCASNY" || true
  printf 'SMTP_USER=%s\nSMTP_PASS=%s\nSMTP_FROM=%s\n' "$UZIV" "$(printf '%s' "$HESLO" | tr -d '[:space:]')" "$OD" >> "$DOCASNY"
  install -o nemo -g nemo -m 600 "$DOCASNY" "$SOUBOR"; rm -f "$DOCASNY"
  echo "== Uloženo. Fastmail hotový."
else
  echo "== Neuloženo – nic se nezměnilo. Oprav podle výpisu a spusť znovu."
fi
unset F_HESLO HESLO
