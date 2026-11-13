// Objednávky: kde jsou zapnuté a kam se posílají. Soubor je stejný na produkci i na testu.
// Do instalace serveru objednávek jen test (proverka.gratzer.cz); na produkci zapnout přepsáním PRODUKCE na true.
(() => {
  const PRODUKCE = false;
  const h = location.hostname;
  const lokalne = h === "localhost" || h === "127.0.0.1";
  window.OBJEDNAVKY = {
    zapnute: PRODUKCE || h.startsWith("proverka.") || lokalne,
    // Zkušební provoz do schválení platební brány Comgate (rozhodnutí 13. 11. 2026): platby jsou testovací.
    zkusebni: true,
    // Na vlastním počítači jde API přesměrovat parametrem ?api=http://127.0.0.1:8100 (jinde ne).
    api: (lokalne && new URLSearchParams(location.search).get("api")) || "https://api.predkoupi.cz",
    ceny: { proverka: 790, plus: 1290 },
  };
})();
