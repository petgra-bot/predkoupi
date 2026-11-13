"""Zkopíruje web predkoupi.cz na testovací kopii proverka.gratzer.cz (repozitář petgra-bot/proverka).

  python3 test/na-test.py [cesta ke klonu proverka]      (výchozí ../proverka)

Pravidlo (Petr 12. 11. 2026): test má být co nejvíc stejný jako produkce. Do spuštění placených výpisů se každá
změna dělá na obou webech; po spuštění nejdřív na testu a na produkci až po úspěšném otestování.

Rozdíly, které záměrně zůstávají (jen tyto):
- CNAME (proverka.gratzer.cz), README a CLAUDE.md testovacího repozitáře,
- test se neindexuje: robots.txt „Disallow: /“, meta robots noindex na všech stránkách, bez sitemap.xml,
- bez ověření Seznam Webmaster a bez Cloudflare Web Analytics (nemíchat návštěvy testu do statistik produkce),
- úzký pruh „Testovací kopie“ nahoře, aby si test nikdo nespletl s ostrou službou,
- zajem.js sám pozná test podle adresy a e-maily ukládá se zdrojem „test:…“ (soubor je na obou webech stejný).
Složky, které má jen test (ukazka/, archiv/, navrh/, predvedeni/, .claude/), zůstávají beze změny.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

PRODUKCE = Path(__file__).resolve().parent.parent
TEST = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else PRODUKCE.parent / "proverka"
VYNECHAT = {"CNAME", "README.md", "CLAUDE.md", "robots.txt", "sitemap.xml"}
VYNECHAT_SLOZKY = ("server/", "test/", ".claude/")
PRUH = ('<div class="pruh-test" style="background:#f0a050;color:#1e2645;font:600 12px/1.7 Montserrat,Arial,sans-serif;'
        'text-align:center;padding:3px 16px">Testovací kopie webu predkoupi.cz – slouží jen ke zkouškám</div>')


def uprav_html(t):
    t = re.sub(r'\s*<meta name="seznam-wmt"[^>]*>', "", t)
    t = re.sub(r"\s*<!-- Cloudflare Web Analytics.*?End Cloudflare Web Analytics -->", "", t, flags=re.S)
    t = re.sub(r'\s*<meta name="robots"[^>]*>', "", t)
    t = re.sub(r"(<meta charset=[^>]*>)", r'\1\n<meta name="robots" content="noindex, nofollow">', t, count=1)
    t = re.sub(r"(<body[^>]*>)", r"\1\n" + PRUH, t, count=1)
    return t


def main():
    if not (TEST / "CNAME").exists() or "proverka" not in (TEST / "CNAME").read_text():
        sys.exit(f"{TEST} nevypadá jako klon proverka (CNAME)")
    soubory = subprocess.run(["git", "-C", str(PRODUKCE), "ls-files"], capture_output=True, text=True, check=True).stdout.split()
    zkopirovano = 0
    for s in soubory:
        if s in VYNECHAT or s.startswith(VYNECHAT_SLOZKY):
            continue
        cil = TEST / s
        cil.parent.mkdir(parents=True, exist_ok=True)
        if s.endswith(".html"):
            cil.write_text(uprav_html((PRODUKCE / s).read_text()))
        else:
            shutil.copy2(PRODUKCE / s, cil)
        zkopirovano += 1
    (TEST / "robots.txt").write_text("User-agent: *\nDisallow: /\n")
    (TEST / "sitemap.xml").unlink(missing_ok=True)
    print(f"Na test zkopírováno {zkopirovano} souborů do {TEST}")


if __name__ == "__main__":
    main()
