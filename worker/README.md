# Skript pro čtení inzerátů (Cloudflare Workers, zdarma)

Přečte jeden inzerát, který uživatel zadal, a vrátí údaje pro identifikaci domu.
Čte jen portály, které automatický dotaz povolují (dnes Bezrealitky). Sreality a iDNES
automatické čtení odmítají; to respektujeme a neobcházíme.

## Nasazení
1. dash.cloudflare.com → Workers & Pages → Create → Create Worker → název `proverka-inzerat` → Deploy.
2. Edit code → nahradit obsah souborem `inzerat.js` → Deploy.
3. Adresu workeru (`https://proverka-inzerat.<účet>.workers.dev`) vložit do `WORKER_URL` v `app.js`.
