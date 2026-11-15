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

  // Co se v kterém kroku skutečně děje (zprávy se střídají, hotový krok se odškrtne). Klíče = faze[].klic ze serveru.
  const ZPRAVY = {
    platba: ["Platba přijata, děkujeme"],
    katastr: ["Stahujeme aktuální výpis z katastru nemovitostí", "Čteme vlastníky, podíly a parcely", "Ověřujeme dům v registru budov a adres"],
    fakta: ["Měříme vzdálenost ke stoleté vodě a povodni 2002", "Čteme hlukovou mapu u nejhlučnější fasády", "Kontrolujeme radonový index podloží",
     "Procházíme Metropolitní plán, koridory a uzávěry", "Hledáme dům v dokumentaci EIA", "Mapujeme vedení vysokého napětí a areály v okolí"],
    pravni: ["Hledáme věcná břemena, zástavy, exekuce a plomby", "Ověřujeme vlastníky v insolvenčním rejstříku", "Vyhodnocujeme stavby a záměry v okolí"],
    cena: ["Stahujeme skutečné prodeje z katastru", "Počítáme cenu za metr čtvereční", "Porovnáváme s požadovanou cenou"],
    report: ["Skládáme verdikt a přehled šesti oblastí", "Píšeme úkoly na míru před rezervací, podpisem a převodem", "Vytváříme PDF"],
    kontrola: ["Kontrolujeme čísla proti zdrojům", "Druhá kontrola čte report očima kupujícího"],
  };
  const VAHY = { platba: 2, katastr: 15, fakta: 20, pravni: 20, cena: 10, report: 20, kontrola: 13 };   // přibližný podíl na čase
  const KLICE = ["platba", "katastr", "fakta", "pravni", "report", "kontrola"];   // starší server bez klíčů a bez kroku ceny
  const klic = (f, i) => f.klic || KLICE[i] || "report";

  const karta = (trida, nadpis, obsah) => `<div class="karta ${trida}"><h2>${esc(nadpis)}</h2>${obsah}</div>`;
  const ochutnavka = (() => { try { return JSON.parse(sessionStorage.getItem("predkoupi-ochutnavka") || "null"); } catch { return null; } })();

  // Varianta B (Petr 14. 11. 2026): oddálený letecký snímek okolí (cca 320 m) s bílým obrysem domu a v rohu mapka Prahy s tečkou.
  // Na počítači je snímek vyšší (vyplní levý sloupec vedle kroků), na mobilu na šířku. Obrys domu posílá server (uložený
  // s objednávkou), takže funguje i z odkazu v e-mailu; bez obrysu zůstává snímek ze serveru.
  function snimekOkoli(dum) {
    if (!Array.isArray(dum) || !dum.length) return "";
    const body = dum.flat(), sx = body.map((b) => b[0]), sy = body.map((b) => b[1]);
    const cx = (Math.min(...sx) + Math.max(...sx)) / 2, cy = (Math.min(...sy) + Math.max(...sy)) / 2;
    const vysoky = matchMedia("(min-width: 900px)").matches;
    // Přiblížení podle velikosti domu: rodinný dům cca 220 m, velký panelák nejvýš 340 m (původně 140 m, varianta B 700 m).
    const sirka = Math.min(340, Math.max(220, 5 * Math.max(Math.max(...sx) - Math.min(...sx), Math.max(...sy) - Math.min(...sy))));
    const [w, h, pw, ph] = vysoky ? [sirka, sirka * 1.3125, 640, 840] : [sirka, sirka * 5 / 7, 700, 500];
    const bbox = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    const obr = `https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/MapServer/export?bbox=${bbox.join(",")}&bboxSR=5514&imageSR=5514&size=${pw},${ph}&format=jpg&f=image`;
    const X = (x) => ((x - bbox[0]) / w * pw).toFixed(1), Y = (y) => ((bbox[3] - y) / h * ph).toFixed(1);
    const poly = dum.map((r) => r.map(([x, y]) => `${X(x)},${Y(y)}`).join(" "));
    const obrys = poly.map((p) => `<polygon points="${p}" fill="rgba(255,255,255,.28)" stroke="#0a1e3c" stroke-width="5"/><polygon points="${p}" fill="none" stroke="#fff" stroke-width="2.5"/>`).join("");
    const P = window.PRAHA;
    const mapka = P ? (() => {
      const mx = (cx - P.x0) / (P.x1 - P.x0) * P.w, my = (P.y1 - cy) / (P.y1 - P.y0) * P.h;
      return `<div class="pr-praha" aria-hidden="true"><svg viewBox="-6 -6 ${P.w + 12} ${P.h + 12}"><path d="${P.d}" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-width="2"/>
        <circle class="pr-praha-pulz" cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="7" fill="#fff"/><circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="7" fill="#fff" stroke="#1e2645" stroke-width="3"/></svg><span>Praha</span></div>`;
    })() : "";
    return `<img src="${obr}" alt="Letecký snímek okolí domu" width="${pw}" height="${ph}"><svg class="pr-obrys" viewBox="0 0 ${pw} ${ph}" aria-hidden="true">${obrys}</svg>${mapka}`;
  }

  // ---------- průběh ----------
  function probeh(o) {
    if (!vykreslenProbeh) {
      vykreslenProbeh = true;
      const vlastni = snimekOkoli(o.obrys || ochutnavka?.obrys);
      const snimek = vlastni || (o.letecky ? `<img src="${N.api}${o.letecky}" alt="Letecký snímek domu">` : ochutnavka?.snimek || "");
      $("objednavka").innerHTML = `
        <div class="pr">
          <figure class="pr-snimek${snimek ? "" : " pr-bez"}${vlastni ? " pr-okoli" : ""}">${snimek}<span class="pr-sken" aria-hidden="true"></span>
            <figcaption>Prověřujeme <b>${esc(kratkaAdresa(o.adresa))}</b></figcaption></figure>
          <div class="pr-hlavni">
            <div class="pr-ukazatel" role="progressbar" aria-label="Průběh prověrky" aria-valuemin="0" aria-valuemax="100">
              <span class="pr-procenta">0 %</span><span class="pr-cas"></span><div class="pr-pruh"><i></i></div></div>
            <ol class="pr-kroky">${o.faze.map((f, i) => f.zamceno
              ? `<li class="zamceno"><span class="pr-ikona" aria-hidden="true"></span><div><b>${esc(f.nazev)}</b> <span class="pr-zamek">V Prověrce PLUS</span></div></li>`
              : `<li><span class="pr-ikona" aria-hidden="true"></span>
              <div><b>${esc(f.nazev)}</b><ul class="pr-zpravy">${(ZPRAVY[klic(f, i)] || []).map((z) => `<li>${esc(z)}</li>`).join("")}</ul></div></li>`).join("")}</ol>
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
    if (o.letecky && !$("objednavka").querySelector(".pr-snimek.pr-okoli") && !$("objednavka").querySelector(".pr-snimek img[src*='letecky']")) {
      const f = $("objednavka").querySelector(".pr-snimek");
      f.classList.remove("pr-bez");
      // Obrys z přehledu zdarma (SVG) má jiný výřez než snímek ze serveru – smazat obojí, jinak je dům dvakrát.
      f.querySelectorAll("img, svg").forEach((x) => x.remove());
      f.insertAdjacentHTML("afterbegin", `<img src="${N.api}${o.letecky}" alt="Letecký snímek domu">`);
    }
    const kroky = o.faze.filter((f) => !f.zamceno);
    const hotovo = kroky.map((f) => f.hotovo);
    const aktivni = hotovo.indexOf(false);
    $("objednavka").querySelectorAll(".pr-kroky > li:not(.zamceno)").forEach((li, i) => {
      li.classList.toggle("hotovo", hotovo[i]);
      li.classList.toggle("aktivni", i === aktivni);
      if (hotovo[i]) li.querySelectorAll(".pr-zpravy li").forEach((z) => z.classList.add("ok"));
    });
    // Odhad procent: hotové kroky + uplynulý čas v aktivním kroku (nikdy přes 96 %, dokud není hotovo).
    const vahy = kroky.map((f, i) => VAHY[klic(f, i)] || 10), soucet = vahy.reduce((a, b) => a + b, 0);
    const celkem = o.dodani_min * 60, zaKroky = vahy.reduce((s, v, i) => s + (hotovo[i] ? v : 0), 0) / soucet * 100;
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

  // Cena z katastru (Petr 15. 11. 2026): odhad se spolehlivostí, 3 čísla k vyjednávání, zajímavosti a graf (data serveru).
  const mil = (n) => `${(n / 1e6).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} mil. Kč`;
  const SPOL = { vysoka: "vysoká spolehlivost", stredni: "střední spolehlivost", nizka: "nízká spolehlivost – málo prodejů" };
  function cenaKn(c) {
    if (!c) return "";
    const o = c.odhad_pro_byt, v = c.vyjednavani, z = c.zajimavosti || {}, vety = [];
    if (z.pozice) vety.push(`Požadovaná cena ${z.pozice.pozadovana_kc_m2.toLocaleString("cs-CZ")} Kč/m² je vyšší než u ${z.pozice.drazsi_nez} z ${z.pozice.z} prodejů bytů v domě.`);
    if (z.posledni_prodej_bytu) vety.push(`Tento byt se naposledy prodal v roce ${z.posledni_prodej_bytu.datum.slice(0, 4)} za ${mil(z.posledni_prodej_bytu.cena_kc)}.`);
    if (z.stejny_typ) vety.push(`Byty stejné velikosti se v domě prodaly ${z.stejny_typ.pocet}× (medián ${mil(z.stejny_typ.median_kc)}).`);
    return `<div class="rp-cena-kn">
      ${o ? `<p><b>Odhad pro tento byt: ${mil(o.od_kc)} – ${mil(o.do_kc)}</b>, nejspíš ${mil(o.median_kc)} <span class="rp-spol ${esc(o.spolehlivost)}">${esc(SPOL[o.spolehlivost] || "")}</span></p>` : ""}
      ${v ? `<dl class="rp-vyjednavani"><div><dt>Dobrá koupě</dt><dd>do ${mil(v.dobra_koupe_kc)}</dd></div><div><dt>Férová cena</dt><dd>${mil(v.ferova_cena_kc)}</dd></div><div><dt>Horní hranice</dt><dd>${mil(v.horni_hranice_kc)}</dd></div></dl>` : ""}
      ${vety.length ? `<p>${vety.map(esc).join(" ")}</p>` : ""}
      ${c.graf_svg ? `<figure class="rp-graf">${c.graf_svg}<figcaption>Skutečné prodeje bytů v domě (katastr), cena za m²; oranžově požadovaná cena.</figcaption></figure>` : ""}
    </div>`;
  }

  async function vysledek(o) {
    clearInterval(ticker);
    // Krátká chvíle „Hotovo“ na konci průběhu (hodnocení 13. 11.): 100 %, odškrtnuté kroky, pak report.
    const pr = $("objednavka").querySelector(".pr");
    if (pr) {
      pr.querySelectorAll(".pr-kroky > li:not(.zamceno)").forEach((li) => { li.classList.add("hotovo"); li.classList.remove("aktivni"); });
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
          <figcaption>Letecký snímek ČÚZK; oranžově pozemky, bíle dům.</figcaption></figure>` : ""}
        <div class="rp-verdikt ${esc(k.verdikt?.barva)}"><p class="rp-stitek-nad">Verdikt</p>
          <p class="rp-verdikt-text">${esc(k.verdikt?.text)}</p>
          ${(k.verdikt?.stitky || []).length ? `<p class="rp-stitky">${k.verdikt.stitky.map((s) => `<span class="${esc(s.barva)}">${esc(s.text)}</span>`).join("")}</p>` : ""}
        </div>
        ${k.cena ? `<div class="rp-cena ${esc(k.cena.barva)}"><h2>Odhad ceny <span class="rp-odznak">Prověrka PLUS</span></h2>
          <dl><div><dt>${esc(k.cena.popisek || "Požadovaná cena")}</dt><dd>${esc(k.cena.pozadovana)}</dd></div>
          <div><dt>${o.typ === "byt" ? "Prodeje v domě" : "Prodeje v okolí"}</dt><dd>${esc(k.cena.trh)}</dd></div><div><dt>Rozdíl</dt><dd>${esc(k.cena.odchylka)}</dd></div></dl>
          <p>${esc(k.cena.text)}</p>${cenaKn(k.cena_kn)}</div>`
          : `<div class="rp-plus"><h2>Odhad ceny <span class="rp-odznak zamceno">V Prověrce PLUS</span></h2>
            <p><b>Nepřeplácíte?</b> Odhad ceny ze skutečných prodejů v katastru a srovnání s cenou v inzerátu je v Prověrce PLUS. Rizika už máme, doplníme jen cenu za 500 Kč –
            <a href="mailto:info@predkoupi.cz?subject=${encodeURIComponent("Doplnit odhad ceny, objednávka " + o.cislo)}">napište nám</a>.</p></div>`}
        ${doplnitHtml(o)}
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
    napojDoplneni(o);
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
      zkusebni: () => karta("ok", "Zkušební platba proběhla", `<p class="tlumene">Platby spouštíme v nejbližších dnech. Ve zkušebním provozu se prověrka nespouští a nic se neplatí.</p>`),
      chyba: () => karta("chyba", "Report řešíme ručně", `<p class="tlumene">Při vytváření se objevil problém. Ozveme se e-mailem nejpozději do 24 hodin; když report nedodáme, peníze vám vrátíme.</p>`),
    }[o.stav];
    $("objednavka").innerHTML = obsah ? obsah() : karta("chyba", "Neznámý stav", "");
  }

  // Report bez konkrétního bytu (Petr 15. 11. 2026): číslo bytu jde do 30 dnů jednou zdarma doplnit.
  const doplnitHtml = (o) => o.doplnit ? `<section class="rp-doplnit"><h2>Zjistili jste číslo bytu?</h2>
      <p>Váš byt se nám v domě nepodařilo určit${o.doplnit.duvod ? ` (${esc(o.doplnit.duvod)})` : ""}, proto report prověřuje dům a okolí
      bez právního stavu konkrétního bytu. Doplňte číslo do <b>${esc(o.doplnit.do)}</b> zdarma – doplníme výpis bytu, prověření vlastníků
      a právní stav a pošleme nový report.</p>
      <form class="cislo-bytu"><label>Číslo bytu (jednotky)<input name="cislo" autocomplete="off" autocapitalize="none" placeholder="např. 1311/146"></label>
        <button type="submit" class="tl tmave-tl">Doplnit byt</button></form>
      <p class="rp-nap">Najdete ho v rezervační smlouvě, ve vyúčtování od SVJ, nebo se zeptejte makléře. Doplnit jde jednou.</p>
      <p class="rp-doplnit-zprava" role="alert"></p></section>` : "";

  function napojDoplneni(o) {
    const f = $("objednavka").querySelector("form.cislo-bytu");
    f?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const c = f.cislo.value.trim().replace(/\s+/g, ""), zpr = $("objednavka").querySelector(".rp-doplnit-zprava");
      if (!/^\d{1,5}\/\d{1,4}$/.test(c)) { zpr.textContent = "Číslo bytu má tvar 1311/146 (číslo domu, lomítko, číslo bytu)."; f.cislo.focus(); return; }
      if (!confirm(`Doplnit byt č. ${c}? Doplnit jde jen jednou.`)) return;
      f.querySelector("button").disabled = true;
      try {
        const r = await fetch(`${N.api}/objednavka/${encodeURIComponent(token)}/doplnit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cislo: c }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof d.detail === "string" ? d.detail : "Doplnění se nepodařilo.");
        document.body.classList.remove("bily-report");
        posledniStav = null; nacti();
      } catch (err) { zpr.textContent = `${err.message} Zkuste to znovu, nebo napište na info@predkoupi.cz.`; f.querySelector("button").disabled = false; }
    });
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
