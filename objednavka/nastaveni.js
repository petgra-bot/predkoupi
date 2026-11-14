// Objednávky: kde jsou zapnuté a kam se posílají. Soubor je stejný na produkci i na testu.
// Do instalace serveru objednávek jen test (proverka.gratzer.cz); na produkci zapnout přepsáním PRODUKCE na true.
(() => {
  const PRODUKCE = true;   // zapnuto 14. 11. 2026 se zkušebním textem (platby testovací do schválení Comgate)
  const h = location.hostname;
  const lokalne = h === "localhost" || h === "127.0.0.1";
  const test = h.startsWith("proverka.") || lokalne;
  const q = new URLSearchParams(location.search);
  // Předváděcí průchod (Petr 13. 11. 2026): jen na testu, s ?predvedeni=1. Simulace serveru je ve složce /predvedeni/,
  // která existuje jen na testu; nic se neplatí ani neodesílá, průběh je zrychlený a končí vzorovým reportem.
  const predvedeni = test && q.has("predvedeni");
  window.OBJEDNAVKY = {
    zapnute: PRODUKCE || test,
    // Zkušební provoz do schválení platební brány Comgate (rozhodnutí 13. 11. 2026): platby jsou testovací.
    zkusebni: true,
    predvedeni,
    // Na vlastním počítači jde API přesměrovat parametrem ?api=http://127.0.0.1:8100 (jinde ne).
    api: predvedeni ? "/predvedeni" : (lokalne && q.get("api")) || "https://api.predkoupi.cz",
    ceny: { proverka: 790, plus: 1290 },
  };
  if (predvedeni) document.write('<script src="/predvedeni/simulace.js?v=1"><\/script>');
})();
