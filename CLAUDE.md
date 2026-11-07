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
