// Stránka objednávky (13. 11. 2026, poznámky Petra): poutavý průběh prověrky a po dokončení bílá stránka
// s reportem navrženým i pro mobil. Kroky odpovídají skutečným krokům prověrky, časování zpráv je přibližné.
(() => {
  const N = window.OBJEDNAVKY;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const token = new URLSearchParams(location.search).get("t") || "";
  const tiche = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const kratkaAdresa = (a) => String(a || "").split(",").map((x) => x.trim()).filter((x) => x && !/^\d{3}\s?\d{2}\b/.test(x)).slice(0, 2).join(", ");
  const email = (() => { try { return sessionStorage.getItem("predkoupi-email") || ""; } catch { return ""; } })();
  let casovac = null, posledniStav = "", vykreslenProbeh = false, ticker = null;

  // Co se v kterém kroku skutečně děje (zprávy se střídají, hotový krok se odškrtne).
  const ZPRAVY = [
    ["Platba přijata, děkujeme"],
    ["Stahujeme aktuální výpis z katastru nemovitostí", "Čteme vlastníky, podíly a parcely", "Ověřujeme dům v registru budov a adres"],
    ["Měříme vzdálenost ke stoleté vodě a povodni 2002", "Čteme hlukovou mapu u nejhlučnější fasády", "Kontrolujeme radonový index podloží",
     "Procházíme Metropolitní plán, koridory a uzávěry", "Hledáme dům v dokumentaci EIA", "Mapujeme vedení vysokého napětí a areály v okolí"],
    ["Hledáme věcná břemena, zástavy, exekuce a plomby", "Ověřujeme vlastníky v insolvenčním rejstříku", "Vyhodnocujeme stavby a záměry v okolí"],
    ["Skládáme verdikt a přehled šesti oblastí", "Píšeme úkoly na míru před rezervací, podpisem a převodem", "Vytváříme PDF"],
    ["Kontrolujeme čísla proti zdrojům", "Druhá kontrola čte report očima kupujícího"],
  ];
  const ZPRAVY_PLUS = "Porovnáváme cenu se skutečnými prodeji v katastru";
  const VAHY = [2, 15, 20, 25, 25, 13];   // přibližný podíl kroků na celkovém čase

  const karta = (trida, nadpis, obsah) => `<div class="karta ${trida}"><h2>${esc(nadpis)}</h2>${obsah}</div>`;
  const ochutnavka = (() => { try { return JSON.parse(sessionStorage.getItem("predkoupi-ochutnavka") || "null"); } catch { return null; } })();

  // ---------- průběh ----------
  function probeh(o) {
    if (!vykreslenProbeh) {
      vykreslenProbeh = true;
      const zpravy = ZPRAVY.map((z, i) => i === 3 && o.balicek.includes("PLUS") ? [...z, ZPRAVY_PLUS] : z);
      const snimek = o.letecky ? `<img src="${N.api}${o.letecky}" alt="Letecký snímek domu">` : ochutnavka?.snimek || "";
      $("objednavka").innerHTML = `
        <div class="pr">
          <figure class="pr-snimek${snimek ? "" : " pr-bez"}">${snimek}<span class="pr-sken" aria-hidden="true"></span>
            <figcaption>Prověřujeme <b>${esc(kratkaAdresa(o.adresa))}</b></figcaption></figure>
          <div class="pr-hlavni">
            <div class="pr-ukazatel" role="progressbar" aria-label="Průběh prověrky" aria-valuemin="0" aria-valuemax="100">
              <span class="pr-procenta">0 %</span><span class="pr-cas"></span><div class="pr-pruh"><i></i></div></div>
            <ol class="pr-kroky">${o.faze.map((f, i) => `<li data-i="${i}"><span class="pr-ikona" aria-hidden="true"></span>
              <div><b>${esc(f.nazev)}</b><ul class="pr-zpravy">${zpravy[i].map((z) => `<li>${esc(z)}</li>`).join("")}</ul></div></li>`).join("")}</ol>
            <p class="pr-odejit">Stránku můžete zavřít – report pošleme ${email ? `na <b>${esc(email)}</b>` : "e-mailem"} a uvidíte ho i tady. Zpravidla do ${o.dodani_min} minut.
              ${email ? `<span class="pr-preklep">Překlep v e-mailu? Napište nám na <a href="mailto:info@predkoupi.cz?subject=${encodeURIComponent("Oprava e-mailu, objednávka " + o.cislo)}">info@predkoupi.cz</a>.</span>` : ""}</p>
          </div>
          ${ochutnavka?.oblasti?.length ? `<div class="pr-vime"><h3>Co už víme z přehledu zdarma</h3><ul>${ochutnavka.oblasti.map((x) =>
            `<li><b>${esc(x.oblast)}</b><span class="pr-stav ${esc(x.barva)}">${esc(BARVY[x.barva] || "")}</span><span>${esc(x.text)}</span></li>`).join("")}</ul>
            <p>V reportu k tomu přidáme právní stav z katastru, verdikt a úkoly na míru.</p></div>` : ""}
        </div>`;
      clearInterval(ticker);
      ticker = setInterval(() => posunZpravu(), tiche ? 4000 : 2600);
    }
    if (o.letecky && !$("objednavka").querySelector(".pr-snimek img[src*='letecky']")) {
      const f = $("objednavka").querySelector(".pr-snimek");
      f.classList.remove("pr-bez");
      f.querySelector("img")?.remove();
      f.insertAdjacentHTML("afterbegin", `<img src="${N.api}${o.letecky}" alt="Letecký snímek domu">`);
    }
    const hotovo = o.faze.map((f) => f.hotovo);
    const aktivni = hotovo.indexOf(false);
    $("objednavka").querySelectorAll(".pr-kroky > li").forEach((li, i) => {
      li.classList.toggle("hotovo", hotovo[i]);
      li.classList.toggle("aktivni", i === aktivni);
      if (hotovo[i]) li.querySelectorAll(".pr-zpravy li").forEach((z) => z.classList.add("ok"));
    });
    // Odhad procent: hotové kroky + uplynulý čas v aktivním kroku (nikdy přes 96 %, dokud není hotovo).
    const celkem = o.dodani_min * 60, zaKroky = VAHY.reduce((s, v, i) => s + (hotovo[i] ? v : 0), 0);
    const casove = Math.min(96, (o.bezi_s / celkem) * 100);
    const pct = Math.round(Math.min(96, Math.max(zaKroky, casove, 3)));
    const u = $("objednavka").querySelector(".pr-ukazatel");
    u.setAttribute("aria-valuenow", pct);
    u.querySelector(".pr-procenta").textContent = `${pct} %`;
    u.querySelector(".pr-pruh i").style.width = `${pct}%`;
    // Zbývající čas z procent (ne z hodin), ať čísla nikdy neodporují; po překročení odhadu poctivě „trvá to déle“.
    const zbyva = Math.max(1, Math.ceil((celkem * (1 - pct / 100)) / 60));
    u.querySelector(".pr-cas").textContent = o.bezi_s > celkem * 1.15 ? "trvá to déle než obvykle – report přijde e-mailem"
      : pct >= 90 ? "už jen chvilku" : `zbývá asi ${zbyva} min`;
  }

  function posunZpravu() {
    const li = $("objednavka").querySelector(".pr-kroky > li.aktivni");
    if (!li) return;
    const zpravy = [...li.querySelectorAll(".pr-zpravy li")];
    const ted = zpravy.findIndex((z) => z.classList.contains("bezi"));
    if (ted >= 0 && ted < zpravy.length - 1) { zpravy[ted].classList.replace("bezi", "ok"); zpravy[ted + 1].classList.add("bezi"); }
    else if (ted < 0) zpravy.find((z) => !z.classList.contains("ok"))?.classList.add("bezi");
  }

  // ---------- výsledek: bílá stránka s reportem pro mobil i počítač ----------
  const BARVY = { cervena: "Riziko", oranzova: "Pozor", zelena: "V pořádku", seda: "Nezjištěno", zamceno: "V Prověrce PLUS" };
  const FAZE = { "pred-rezervaci": "Před rezervací", "pred-podpisem": "Před podpisem kupní smlouvy", "pri-prevodu": "Při převodu a po koupi",
                 "pred-drazbou": "Před dražbou", "po-priklepu": "Po příklepu" };
  const stitek = (b) => `<span class="rp-stitek ${esc(b)}">${esc(BARVY[b] || b)}</span>`;

  async function vysledek(o) {
    clearInterval(ticker);
    // Krátká chvíle „Hotovo“ na konci průběhu (hodnocení 13. 11.): 100 %, odškrtnuté kroky, pak report.
    const pr = $("objednavka").querySelector(".pr");
    if (pr) {
      pr.querySelectorAll(".pr-kroky > li").forEach((li) => { li.classList.add("hotovo"); li.classList.remove("aktivni"); });
      const u = pr.querySelector(".pr-ukazatel");
      u.setAttribute("aria-valuenow", 100);
      u.querySelector(".pr-procenta").textContent = "100 %";
      u.querySelector(".pr-pruh i").style.width = "100%";
      u.querySelector(".pr-cas").textContent = "Hotovo – report je připravený";
      await new Promise((r) => setTimeout(r, 1400));
    }
    document.body.classList.add("bily-report");
    scrollTo(0, 0);
    $("objednavka").innerHTML = `<p class="rp-nacitam">Načítáme report…</p>`;
    let k;
    try {
      const r = await fetch(`${N.api}${o.report.data}`);
      if (!r.ok) throw new Error();
      k = await r.json();
    } catch {
      $("objednavka").innerHTML = karta("chyba", "Report se nepodařilo načíst", `<p>Najdete ho v e-mailu, nebo si stáhněte PDF.</p>${pdfOdkazy(o)}`);
      return;
    }
    const ulozene = (() => { try { return JSON.parse(localStorage.getItem(`predkoupi-ukoly-${token}`) || "{}"); } catch { return {}; } })();
    const skupiny = {};
    (k.ukoly || []).forEach((u, i) => { (skupiny[u.kdy] ||= []).push([u, i]); });
    $("objednavka").innerHTML = `
      <article class="rp">
        <header class="rp-hlava">
          <p class="rp-stitek-nad">Report · ${esc(o.balicek)} · č. ${esc(o.cislo)}</p>
          <h1>${esc(k.nemovitost?.nazev)}</h1>
          ${k.nemovitost?.popis ? `<p class="rp-popis">${esc(k.nemovitost.popis)}</p>` : ""}
        </header>
        ${k.letecky ? `<figure class="rp-snimek"><img src="${N.api}${k.letecky}" alt="Letecký snímek domu" loading="lazy">
          <figcaption>Letecký snímek ČÚZK; oranžově pozemky, tyrkysově dům.</figcaption></figure>` : ""}
        <div class="rp-verdikt ${esc(k.verdikt?.barva)}"><p class="rp-stitek-nad">Verdikt</p>
          <p class="rp-verdikt-text">${esc(k.verdikt?.text)}</p>
          ${(k.verdikt?.stitky || []).length ? `<p class="rp-stitky">${k.verdikt.stitky.map((s) => `<span class="${esc(s.barva)}">${esc(s.text)}</span>`).join("")}</p>` : ""}
        </div>
        ${k.cena ? `<div class="rp-cena ${esc(k.cena.barva)}"><h2>Cena proti trhu</h2>
          <dl><div><dt>${esc(k.cena.popisek || "Požadovaná cena")}</dt><dd>${esc(k.cena.pozadovana)}</dd></div>
          <div><dt>Trh v okolí</dt><dd>${esc(k.cena.trh)}</dd></div><div><dt>Rozdíl</dt><dd>${esc(k.cena.odchylka)}</dd></div></dl>
          <p>${esc(k.cena.text)}</p></div>`
          : `<div class="rp-plus"><p><b>Nepřeplácíte?</b> Odhad ceny ze skutečných prodejů v katastru je v Prověrce PLUS. Rizika už máme, doplníme jen cenu za 500 Kč –
            <a href="mailto:info@predkoupi.cz?subject=${encodeURIComponent("Doplnit odhad ceny, objednávka " + o.cislo)}">napište nám</a>.</p></div>`}
        <section><h2>Přehled</h2><ul class="rp-prehled">${(k.semafor || []).map((s) => `<li class="${esc(s.barva)}">
          <span class="rp-oblast">${esc(s.oblast)}</span>${stitek(s.barva)}<span class="rp-text">${esc(s.text)}</span></li>`).join("")}</ul></section>
        ${(k.hlavni_zjisteni || []).length ? `<section><h2>Hlavní zjištění</h2>${k.hlavni_zjisteni.map((z) => `
          <div class="rp-zjisteni ${esc(z.barva)}">${stitek(z.barva)}<h3>${esc(z.titulek)}</h3><p>${esc(z.text)}</p>
          ${z.co_delat ? `<p class="rp-co">→ ${esc(z.co_delat)}</p>` : ""}</div>`).join("")}</section>` : ""}
        ${(k.ukoly || []).length ? `<section><h2>Co udělat</h2><p class="rp-nap">Odškrtávejte si, co máte hotové – uložíme to v tomto prohlížeči.</p>
          ${Object.entries(skupiny).map(([kdy, polozky]) => `<h3 class="rp-faze">${esc(FAZE[kdy] || kdy)}</h3><ul class="rp-ukoly">${polozky.map(([u, i]) => `
            <li><label><input type="checkbox" data-u="${i}"${ulozene[i] ? " checked" : ""}><span>${esc(u.ukol)}
            ${u.komu ? `<em>${esc(u.komu)}</em>` : ""}</span></label></li>`).join("")}</ul>`).join("")}</section>` : ""}
        ${(k.dalsi_zjisteni || []).length ? `<section><h2>Další zjištění</h2><ul class="rp-dalsi">${k.dalsi_zjisteni.map((z) =>
          `<li class="${esc(z.barva)}"><b>${esc(z.titulek)}</b> ${esc(z.text)}</li>`).join("")}</ul></section>` : ""}
        ${(k.nezjisteno || []).length ? `<details class="rp-sbal"><summary>Co jsme nezjistili (${k.nezjisteno.length})</summary><ul>${k.nezjisteno.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
        ${(k.zdroje || []).length ? `<details class="rp-sbal"><summary>Z čeho vycházíme</summary><ul>${k.zdroje.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
        <section class="rp-stahnout"><h2>Report v PDF</h2><div class="rp-lista">${pdfOdkazy(o)}</div>
          <p class="rp-nap">Stejný report jsme poslali i e-mailem.</p></section>
        <p class="rp-upozorneni">${esc(k.upozorneni || "Report není právní ani znalecký posudek.")}</p>
        ${N.predvedeni ? `<p class="rp-predvedeni">Toto byla ukázka. <a href="/predvedeni/">Spustit znovu</a></p>` : ""}
      </article>`;
    $("objednavka").querySelector(".rp")?.classList.add("rp-objev");
    $("objednavka").querySelectorAll("input[data-u]").forEach((c) => c.addEventListener("change", () => {
      ulozene[c.dataset.u] = c.checked;
      try { localStorage.setItem(`predkoupi-ukoly-${token}`, JSON.stringify(ulozene)); } catch { /* bez úložiště */ }
    }));
  }

  // Názvy souborů podle adresy (Predkoupi-Karlicka-910-49.pdf), popisky tak, aby bylo jasné, čím se PDF liší.
  const slug = (a) => kratkaAdresa(a).split(",")[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const pdfOdkazy = (o) => (o.report?.pdf || []).map((u, i, a) =>
    `<a class="tl ${i ? "obrys-tmave" : "tmave-tl"}" href="${N.api}${u}" download="Predkoupi-${slug(o.adresa)}${i ? "-podrobny" : ""}.pdf">${
      a.length > 1 ? (i ? "Podrobný report – mapy a tabulky" : "Report (PDF)") : "Stáhnout report (PDF)"}</a>`).join("");

  // ---------- ostatní stavy ----------
  function vykresli(o) {
    $("nadpis").textContent = o.stav === "hotovo" ? "Report je hotový" : `${o.balicek} č. ${o.cislo}`;
    $("podnadpis").textContent = kratkaAdresa(o.adresa);
    if (o.stav === "zaplaceno" || o.stav === "bezi") return probeh(o);
    vykreslenProbeh = false; clearInterval(ticker);
    if (o.stav === "hotovo") return vysledek(o);
    const obsah = {
      ceka_na_platbu: () => karta("upresnit", "Čekáme na potvrzení platby", `<p class="tlumene">Jakmile platební brána platbu potvrdí, prověrka se spustí sama. Obvykle to trvá pár vteřin.</p>`),
      zruseno: () => karta("chyba", "Platba nebyla dokončena", `<p class="tlumene">Nic jsme nestrhli. Objednávku můžete zopakovat.</p><p><a href="/proverit/?q=${encodeURIComponent(o.adresa)}">Zpět k nemovitosti</a></p>`),
      zkusebni: () => karta("upresnit", "Zkušební platba proběhla", `<p class="tlumene">Platby spouštíme v nejbližších dnech. Ve zkušebním provozu se prověrka nespouští a nic se neplatí.</p>`),
      potrebuje_klienta: () => (o.kandidati || []).length
        ? karta("upresnit", "Který z těchto bytů?", `<p class="tlumene">Podle plochy odpovídá v domě víc bytů. Vyberte ten správný, report pak dokončíme do pár minut.</p>
        <ul class="kandidati">${o.kandidati.map((k) => `<li><button type="button" data-byt="${esc(k.cislo)}">Byt č. ${esc(k.cislo)}${k.plocha_m2 ? ` <span class="tlumene">· podle podílu cca ${esc(k.plocha_m2)} m²</span>` : ""}</button></li>`).join("")}</ul>
        <p class="tlumene">Číslo bytu najdete v kupní nebo rezervační smlouvě, případně se zeptejte makléře.</p>
        <p><button type="button" class="tl obrys" data-byt="zadny">Můj byt mezi nimi není</button></p>`)
        // Výpis domu bez podílů (test 8): plochu nejde spárovat, klient zadá číslo bytu sám.
        : karta("upresnit", "Které číslo má váš byt?", `<p class="tlumene">V domě je hodně bytů a podle plochy jsme ten váš nedokázali jednoznačně určit.
          Zadejte číslo bytu (jednotky) ve tvaru <b>1311/146</b>, report pak dokončíme do pár minut.</p>
        <form class="cislo-bytu"><label>Číslo bytu<input name="cislo" autocomplete="off" autocapitalize="none" placeholder="např. 1311/146" required pattern="\\d{1,5}/\\d{1,4}"></label>
          <button type="submit" class="tl">Pokračovat</button></form>
        <p class="tlumene">Najdete ho v rezervační nebo kupní smlouvě, ve vyúčtování od SVJ, případně se zeptejte makléře nebo prodávajícího.</p>
        <p><button type="button" class="tl obrys" data-byt="zadny">Číslo nemám – vyřiďte to ručně</button></p>`),
      chyba: () => karta("chyba", "Report řešíme ručně", `<p class="tlumene">Při vytváření se objevil problém. Ozveme se e-mailem nejpozději do 24 hodin; když report nedodáme, vrátíme celé peníze.</p>`),
    }[o.stav];
    $("objednavka").innerHTML = obsah ? obsah() : karta("chyba", "Neznámý stav", "");
    $("objednavka").querySelector("form.cislo-bytu")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const c = e.target.cislo.value.trim().replace(/\s+/g, "");
      if (!/^\d{1,5}\/\d{1,4}$/.test(c)) { e.target.cislo.setCustomValidity("Číslo bytu má tvar 1311/146."); e.target.cislo.reportValidity(); e.target.cislo.setCustomValidity(""); return; }
      vyberByt(c);
    });
    $("objednavka").querySelectorAll("button[data-byt]").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.byt === "zadny" && !confirm("Váš byt dohledáme ručně a ozveme se e-mailem do 24 hodin. Pokračovat?")) return;
      vyberByt(b.dataset.byt);
    }));
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
      const otisk = JSON.stringify({ ...o, bezi_s: 0 });
      if (o.stav === "zaplaceno" || o.stav === "bezi") probeh(o), vykresliHlavicku(o);
      else if (otisk !== posledniStav) vykresli(o);
      posledniStav = otisk;
      if (!["hotovo", "zruseno", "zkusebni", "chyba"].includes(o.stav)) casovac = setTimeout(nacti, o.stav === "ceka_na_platbu" ? 2500 : 4000);
    } catch {
      casovac = setTimeout(nacti, 6000);
    }
  }
  const vykresliHlavicku = (o) => { $("nadpis").textContent = `${o.balicek} č. ${o.cislo}`; $("podnadpis").textContent = kratkaAdresa(o.adresa); };

  if (!token) { $("nadpis").textContent = "Objednávka nenalezena"; } else nacti();
})();
