// Objednávky: kde jsou zapnuté a kam se posílají. Soubor je stejný na produkci i na testu.
// Do instalace serveru objednávek jen test (proverka.gratzer.cz); na produkci zapnout přepsáním PRODUKCE na true.
(() => {
  const PRODUKCE = true;   // zapnuto 14. 11. 2026, ostré platby od 16. 11. 2026
  const h = location.hostname;
  const lokalne = h === "localhost" || h === "127.0.0.1";
  const test = h.startsWith("proverka.") || lokalne;
  const q = new URLSearchParams(location.search);
  // Předváděcí průchod (Petr 13. 11. 2026): jen na testu, s ?predvedeni=1. Simulace serveru je ve složce /predvedeni/,
  // která existuje jen na testu; nic se neplatí ani neodesílá, průběh je zrychlený a končí vzorovým reportem.
  const predvedeni = test && q.has("predvedeni");
  window.OBJEDNAVKY = {
    zapnute: PRODUKCE || test,
    // Ostré platby na predkoupi.cz od schválení Comgate (16. 11. 2026); test (proverka) zůstává ve zkušebním provozu.
    zkusebni: test,
    predvedeni,
    // Na vlastním počítači jde API přesměrovat parametrem ?api=http://127.0.0.1:8100 (jinde ne).
    // Test (proverka.gratzer.cz) má vlastní testovací server: https://api.predkoupi.cz/test (rozdělení 14. 11. 2026).
    api: predvedeni ? "/predvedeni" : (lokalne && q.get("api")) || (h.startsWith("proverka.") ? "https://api.predkoupi.cz/test" : "https://api.predkoupi.cz"),
    ceny: { proverka: 790, plus: 1390 },
  };
  // Měření kroků objednávky (Petr 18. 11. 2026): jen počty po dnech, bez cookies a bez ID návštěvníka; každý krok
  // nejvýš jednou za načtení stránky. V předváděcím průchodu a na vlastním počítači se nic neposílá.
  const poslane = new Set();
  const zarizeni = matchMedia("(pointer: coarse)").matches ? "mobil" : "pocitac";
  window.mer = (krok, detail) => {
    const d = detail === undefined ? zarizeni : detail || "";
    if (predvedeni || lokalne || poslane.has(krok + d)) return;
    poslane.add(krok + d);
    try { navigator.sendBeacon(`${window.OBJEDNAVKY.api}/udalost`, new Blob([JSON.stringify({ k: krok, d })], { type: "text/plain" })); } catch { /* měření nesmí nic rozbít */ }
  };
  if (predvedeni) document.write('<script src="/predvedeni/simulace.js?v=2"><\/script>');
})();
