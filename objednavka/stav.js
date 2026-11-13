// Stránka objednávky: průběh prověrky, výběr bytu a výsledek přímo v prohlížeči (rozhodnutí 13. 11. 2026).
(() => {
  const N = window.OBJEDNAVKY;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const token = new URLSearchParams(location.search).get("t") || "";
  let casovac = null, posledni = "";

  const karta = (trida, nadpis, obsah) => `<div class="karta ${trida}"><h2>${esc(nadpis)}</h2>${obsah}</div>`;
  const kroky = (faze) => `<ol class="obj-kroky">${faze.map((f) => `<li class="${f.hotovo ? "hotovo" : ""}">${esc(f.nazev)}</li>`).join("")}</ol>`;

  function vykresli(o) {
    $("nadpis").textContent = `${o.balicek} č. ${o.cislo}`;
    $("podnadpis").textContent = o.adresa;
    const obsah = {
      ceka_na_platbu: () => karta("upresnit", "Čekáme na potvrzení platby", `<p class="tlumene">Jakmile platební brána platbu potvrdí, prověrka se spustí sama. Obvykle to trvá pár vteřin.</p>`),
      zruseno: () => karta("chyba", "Platba nebyla dokončena", `<p class="tlumene">Nic jsme nestrhli. Objednávku můžete zopakovat.</p><p><a href="/proverit/?q=${encodeURIComponent(o.adresa)}">Zpět k nemovitosti</a></p>`),
      zkusebni: () => karta("upresnit", "Zkušební platba proběhla", `<p class="tlumene">Platby spouštíme v nejbližších dnech. Ve zkušebním provozu se prověrka nespouští a nic se neplatí.</p>`),
      zaplaceno: () => prubeh(o),
      bezi: () => prubeh(o),
      potrebuje_klienta: () => karta("upresnit", "Který z těchto bytů?", `<p class="tlumene">Podle plochy odpovídá v domě víc bytů. Vyberte ten správný, report pak dokončíme do pár minut.</p>
        <ul class="kandidati">${(o.kandidati || []).map((k) => `<li><button type="button" data-byt="${esc(k.cislo)}">Byt č. ${esc(k.cislo)}${k.plocha_m2 ? ` <span class="tlumene">· podle podílu cca ${esc(k.plocha_m2)} m²</span>` : ""}</button></li>`).join("")}</ul>`),
      hotovo: () => vysledek(o),
      chyba: () => karta("chyba", "Report řešíme ručně", `<p class="tlumene">Při vytváření se objevil problém. Ozveme se e-mailem nejpozději do 24 hodin; když report nedodáme, vrátíme celou cenu.</p>`),
    }[o.stav];
    $("objednavka").innerHTML = obsah ? obsah() : karta("chyba", "Neznámý stav", "");
    $("objednavka").querySelectorAll("button[data-byt]").forEach((b) => b.addEventListener("click", () => vyberByt(b.dataset.byt)));
  }

  const prubeh = (o) => karta("och-karta", "Prověřujeme", `${kroky(o.faze)}
    <p class="tlumene">Report zpravidla do ${o.dodani_min} minut. Stránku můžete zavřít – report pošleme e-mailem a uvidíte ho i tady.</p>`);

  function vysledek(o) {
    const pdf = o.report.pdf.map((u, i) => `<a class="tl svetle" href="${N.api}${u}" download>${o.report.pdf.length > 1 ? (i ? "Podrobný report (PDF)" : "Základní report (PDF)") : "Stáhnout report (PDF)"}</a>`).join("");
    return karta("ok", "Report je hotový", `<p class="tlumene">Poslali jsme ho i na váš e-mail. Odkaz na tuto stránku platí 30 dnů.</p><div class="obj-pdf">${pdf}</div>`) +
      `<iframe class="obj-report" title="Report" src="${N.api}${o.report.html}" loading="lazy"></iframe>`;
  }

  async function vyberByt(cislo) {
    try {
      const r = await fetch(`${N.api}/objednavka/${encodeURIComponent(token)}/byt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cislo }) });
      if (!r.ok) throw new Error();
      nacti();
    } catch { alert("Výběr se nepodařilo uložit. Zkuste to prosím znovu."); }
  }

  async function nacti() {
    clearTimeout(casovac);
    try {
      const r = await fetch(`${N.api}/objednavka/${encodeURIComponent(token)}`);
      if (r.status === 404) { $("nadpis").textContent = "Objednávka nenalezena"; $("objednavka").innerHTML = karta("chyba", "Odkaz nefunguje", `<p class="tlumene">Zkontrolujte odkaz z e-mailu, nebo napište na info@predkoupi.cz.</p>`); return; }
      const o = await r.json();
      const otisk = JSON.stringify(o);
      if (otisk !== posledni) { posledni = otisk; vykresli(o); }
      if (!["hotovo", "zruseno", "zkusebni", "chyba"].includes(o.stav)) casovac = setTimeout(nacti, o.stav === "ceka_na_platbu" ? 2500 : 4000);
    } catch {
      casovac = setTimeout(nacti, 6000);
    }
  }

  if (!token) { $("nadpis").textContent = "Objednávka nenalezena"; } else nacti();
})();
