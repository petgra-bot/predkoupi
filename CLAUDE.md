# Web Před koupí (predkoupi.cz) – pravidla pro Claude

Web služby NEMO (prověření bytu a domu v Praze před koupí). Rozhodnutí a obsah služby: repozitář
`petgra-bot/automatic-enigma`, soubor `nemo/CLAUDE.md` (Balíčky a ceny, Zadání na webu, To-do W).
Česky, stručně, nelichotit, nesouhlas říct přímo.

## Zadání vzhledu (rozhodnutí Petra Gratzera, 6. 11. 2026)

Styl jako nekupnaslepo.cz: tmavě modrá `#1e2645` a bílá, světle šedé sekce `#f1f2f6`, písmo Montserrat,
velké tučné nadpisy verzálkami, malé šedé štítky nad nadpisy, ostré karty s tenkými linkami (bez zaoblení),
číslované kroky 01–04, tmavé boxy „Proč my“, ceník ve třech sloupcích s prostředním tmavým.
Ostrý web: https://predkoupi.cz (GitHub Pages, soubor CNAME). Testovací kopie: https://proverka.gratzer.cz/ukazka/.

**Toto zadání má přednost před obecnými doporučeními všech skills** (některé verzálkové štítky, štítky nad nadpisy,
ostré rohy nebo číslování 01/02/03 zakazují – např. `landing-page-design`, `figma-designer`). Ze skills ber zbytek:
texty z pohledu klienta, jasná tlačítka, přístupnost, mobil, výkon, střídmé animace, kontrola snímkem obrazovky.

Styl přebíráme, texty, logo a obsah konkurence ne. Žádné vymyšlené recenze, loga ani čísla.

## Produkce a test (pravidlo Petra Gratzera, 12. 11. 2026)

- Testovací web https://proverka.gratzer.cz (repozitář petgra-bot/proverka) je **co nejvíc stejný jako produkce** https://predkoupi.cz (petgra-bot/predkoupi). Kopíruje se skriptem `python3 test/na-test.py ../proverka` v repozitáři predkoupi.
- **Do spuštění placených výpisů na produkci:** každou změnu webu dělat **na produkci i na testu zároveň**.
- **Od spuštění placených variant:** změny **nejdřív na testu**, na produkci **až po úspěšném otestování** – pokud Petr neřekne jinak. Platí i pro server (`nastroje/`, agenti): nejdřív testovací běh, pak ostrý provoz.
- Záměrné rozdíly testu (jen tyto): CNAME, README a CLAUDE.md repozitáře; test se neindexuje (robots.txt „Disallow: /“, meta noindex, bez sitemap); bez ověření Seznamu a bez Cloudflare Analytics (nemíchat statistiky); oranžový pruh „Testovací kopie“; zájemci z testu se ukládají se zdrojem „test:…“ (pozná to sám `zajem.js`). Navíc jen na testu: archivní složky `ukazka/`, `archiv/`, `navrh/` (návrhy ke schválení, např. `navrh/prubeh-mapa.html`) a předváděcí průchod `predvedeni/` (zrychlená objednávka se vzorovým reportem bez placení, zapíná ho `?predvedeni=1` jen na testu; Petr 13. 11. 2026).
- **Postup od 14. 11. 2026 (rozdělení):** web – změny ve větvi `test` repozitáře predkoupi, na test je nahraje `python3 test/na-test.py ../proverka`; na produkci (větev `main`) až po schválení Petrem (sloučit `test` do `main`). Server – dvě instance: **ostrá** `/home/nemo/app` z větve `nemo-ostra` (api.predkoupi.cz, port 8100) a **testovací** `/home/nemo/app-test` z větve `claude/kind-davinci-ue2jrk` (api.predkoupi.cz/test, port 8101, objednávky „T2026-…“, přepínač placených dotazů v `~/.config/nemo/test.env`). Změny kódu NEMO nejdřív do testovací větve, do `nemo-ostra` až po testu (`git push origin claude/kind-davinci-ue2jrk:nemo-ostra`). Instalace: `server/rozdeleni.sh` v repozitáři predkoupi.

## Skills v repozitáři (vybral Petr, 7. 11. 2026)

Ve `.claude/skills/`, licence MIT (soubory `LICENSE-*`). Před uložením přečteno, bez skriptů a bez odesílání dat.

| Zdroj | Commit | Skills |
|---|---|---|
| github.com/emilkowalski/skills | c8a7962 | celé repo (17): animace, `emil-design-eng`, `apple-design`, `mobile-native`, `break-ui`, `prototype` aj. (`write-swift`, `animate-expo`, `ask-sonner` jsou pro aplikace, pro web nepoužívat) |
| github.com/ConardLi/garden-skills | 2b9a893 | `web-design-engineer` |
| github.com/elayadesign/ai-design-skills | 456d9e0 | `landing-page-design`, `figma-designer` |
| github.com/MengTo/Skills | 5ea1661 | `build-awwwards-quality-sites` (GSAP, Three.js – pro náš jednoduchý web jen střídmě) |
| github.com/jakubkrehel/skills | 157da62 | `interface-review` a skills, na které odkazuje: `better-interface`, `better-accessibility`, `better-colors`, `better-layout`, `better-typography`, `better-ui`, `better-writing` |

Aktualizace: znovu stáhnout, přečíst změny, pak teprve nahradit.

## Struktura

- `index.html`, `co-zjistite.html`, `dotazy.html`, `404.html`, společné `styl.css`
- `proverit/` – identifikace nemovitosti (přehled zdarma), pole na úvodu posílá `?q=`
- `worker/` – Cloudflare Worker pro čtení inzerátu (povolené originy včetně predkoupi.cz; nasazuje Petr)
- Provozovatel: Petr Grätzer, OSVČ, IČO 19843071, neplátce DPH (patička)
- Obchodní podmínky a ochrana údajů: návrhy v `petgra-bot/automatic-enigma`, `nemo/pravni/`; na web až po schválení advokátem
