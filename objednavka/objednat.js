// Formulář objednávky pod přehledem zdarma (proverit/app.js volá window.objednavkaFormular).
// 13. 11. 2026 po nezávislém hodnocení: chyby u polí najednou, kontrola tvaru e-mailu a překlepů, pravdivé tlačítko ve zkušebním provozu.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const kc = (n) => `${Number(n).toLocaleString("cs-CZ")} Kč`;
  const STAVY = [["pred-rekonstrukci", "Před rekonstrukcí"], ["bezny", "Běžný"], ["po-rekonstrukci", "Po rekonstrukci"], ["novostavba", "Novostavba"]];
  // Adresa bez PSČ a pošty („15300 Praha 5“ u Radotína laika mate): „Karlická 910/49, Radotín“.
  const kratkaAdresa = (a) => String(a || "").split(",").map((x) => x.trim()).filter((x) => x && !/^\d{3}\s?\d{2}\b/.test(x)).slice(0, 2).join(", ");
  window.kratkaAdresa = kratkaAdresa;

  // E-mail: musí mít doménu s koncovkou (type=email v prohlížeči propustí „jan@seznam“).
  const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  const DOMENY = ["seznam.cz", "email.cz", "gmail.com", "centrum.cz", "post.cz", "volny.cz", "atlas.cz", "icloud.com", "outlook.com", "hotmail.com", "yahoo.com", "tiscali.cz", "quick.cz"];
  const vzdalenost = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const navrhEmailu = (e) => {
    const [jmeno, dom] = e.toLowerCase().split("@");
    if (!jmeno || !dom || DOMENY.includes(dom)) return null;
    const nej = DOMENY.map((d) => [d, vzdalenost(dom, d)]).sort((a, b) => a[1] - b[1])[0];
    return nej && nej[1] > 0 && nej[1] <= 2 ? `${jmeno}@${nej[0]}` : null;
  };

  // Co obsahuje balíček (W12, Petr 15. 11. 2026 vybral variantu B): „Co přesně dostanu“ rozbalí seznam přímo v kartě.
  const OBSAH = {
    proverka: ["<b>Aktuální výpis z katastru</b> – zástavy, břemena, exekuce, plomby, předkupní práva",
               "<b>Prověření vlastníků</b> v insolvenčním rejstříku",
               "<b>Územní plán a stavby v okolí</b> – Metropolitní plán, záměry, EIA, uzávěry",
               "<b>Povodně, radon a hluk</b> u nejhlučnější fasády (celodenní průměr i noc)",
               "Vlastník pozemku pod domem, elektrická vedení, nežádoucí zařízení",
               "<b>Verdikt a úkoly před koupí na míru</b> – co ověřit, s kým a kdy",
               "Report v PDF i v prohlížeči <b>do 5 minut</b>"],
    plus: ["Vše z Prověrky",
           "<b>Odhad ceny ze skutečných prodejů</b> v domě i v sousedních domech do 300 m (katastr), přepočtený na dnešní ceny",
           "<b>Tři čísla k vyjednávání</b> – dobrá koupě, férová cena, horní hranice – a graf cen",
           "<b>Prověření vlastníků v evidenci exekucí</b>",
           "<b>Podrobný report</b> – tabulka prodejů, mapy povodní a hluku, všechna zjištění se zdroji, daň z nemovitosti",
           "Report <b>do 10 minut</b>"],
  };
  const kartaBalicku = (v, nazev, cena, popis, vybrany) => `<label class="obj-balicek"><input type="radio" name="balicek" value="${v}"${vybrany ? " checked" : ""}>
            <span class="obj-bal-text"><span class="obj-bal-nazev"><b>${nazev}</b><b>${kc(cena)}</b></span>
            <span class="obj-bal-popis">${popis}</span>
            <button type="button" class="obj-rozbal-tl" aria-expanded="false" aria-controls="obj-obsah-${v}">Co přesně dostanu</button>
            <span class="obj-rozbal" id="obj-obsah-${v}" hidden><ul>${OBSAH[v].map((x) => `<li>${x}</li>`).join("")}</ul></span></span></label>`;

  window.objednavkaFormular = (kontejner, { adresa, typ, inz, budova }) => {
    const N = window.OBJEDNAVKY;
    const byt = typ === "bytový dům";
    const p = (v) => (v == null ? "" : esc(v));
    const tlText = (b) => N.predvedeni ? "Pokračovat v ukázce – bez platby" : N.zkusebni ? "Vyzkoušet objednávku – zdarma" : `Zaplatit ${kc(N.ceny[b])}`;
    kontejner.innerHTML = `
      <form class="objednat" novalidate>
        <h3>Objednat prověrku</h3>
        <p class="obj-adresa">${esc(kratkaAdresa(adresa))}${byt ? " · byt" : " · rodinný dům"}</p>
        <fieldset class="obj-balicky">
          <legend class="skryte">Balíček</legend>
          ${kartaBalicku("proverka", "Prověrka", N.ceny.proverka, "Právní stav z katastru včetně vlastníků, územní plán a stavby v okolí, verdikt a úkoly před koupí. Report do 5 minut.", true)}
          ${kartaBalicku("plus", "Prověrka PLUS", N.ceny.plus, "Navíc odhad ceny ze skutečných prodejů v domě a okolí, tři čísla k vyjednávání a podrobný report. Do 10 minut.", false)}
        </fieldset>
        ${byt ? `<div class="obj-byt">
          <div class="obj-radek">
            <label>Číslo bytu (jednotky)<input name="cislo_bytu" type="text" maxlength="20" autocomplete="off" placeholder="např. 1234/56"></label>
            <label class="obj-plocha" hidden>Plocha bytu (m²)<input name="plocha" type="number" inputmode="decimal" min="10" max="500" step="0.1" value="${p(inz?.plocha_m2)}"></label>
          </div>
          <p class="obj-napoveda obj-cislo-tip">Díky číslu bytu prověříme přesně váš byt. Najdete ho v rezervační smlouvě, ve vyúčtování od SVJ, nebo se zeptejte makléře.</p>
          <button type="button" class="obj-odkaz obj-nevim-tl" aria-expanded="false" aria-controls="obj-nevim">Číslo nevím</button>
          <div class="obj-nevim" id="obj-nevim" hidden>
            <p class="obj-napoveda">Byt najdeme podle majitele ve výpisu z katastru, nebo podle plochy a patra. Příjmení použijeme jen k určení bytu a hned ho smažeme.</p>
            <div class="obj-radek">
              <label>Příjmení majitele (prodávajícího)<input name="prijmeni" type="text" maxlength="60" autocomplete="off" placeholder="z inzerátu nebo od makléře"></label>
              <label>Patro<input name="patro" type="text" maxlength="10" value="${p(inz?.patro)}"></label>
            </div>
            <label class="obj-souhlas obj-bez-bytu"><input type="checkbox" name="bez_bytu">
              <span>Když byt nepůjde určit, dostanu prověrku domu a okolí <b>bez výpisu bytu a vlastníka</b>. Číslo bytu můžu do 30 dnů doplnit zdarma.</span></label>
          </div>
        </div>` : ""}
        <div class="obj-plus" hidden>
          <p class="obj-napoveda">${inz ? "Co víme z inzerátu, je předvyplněné; doplňte zbytek." : "Pro odhad ceny opište z inzerátu cenu, plochu a stav."}</p>
          <div class="obj-radek">
            <label>Požadovaná cena (Kč)<input name="cena" type="text" inputmode="numeric" autocomplete="off" value="${inz?.cena_kc ? p(Number(inz.cena_kc).toLocaleString("cs-CZ")) : ""}" placeholder="např. 8 900 000"></label>
            ${byt ? "" : `<label>Užitná plocha domu (m²)<input name="plocha_dum" type="number" inputmode="decimal" min="20" max="2000" value="${p(inz?.plocha_m2)}"></label>`}
          </div>
          <fieldset class="obj-stav"><legend>Stav</legend>
            ${STAVY.map(([v, t]) => `<label><input type="radio" name="stav" value="${v}"><span>${t}</span></label>`).join("")}
          </fieldset>
        </div>
        <label class="obj-email">E-mail pro report<input name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="jmeno@example.cz"></label>
        <p class="obj-navrh" hidden></p>
        <input type="text" name="web" tabindex="-1" autocomplete="off" class="skryte" aria-hidden="true">
        <p class="obj-jistota">Když report nedodáme, peníze vám vrátíme.</p>
        <label class="obj-souhlas"><input type="checkbox" name="souhlas">
          <span>Souhlasím s <a href="/podminky.html" target="_blank">obchodními podmínkami</a>. Chci report hned po zaplacení a beru na vědomí, že hotový report už nejde vrátit (odstoupit od smlouvy).</span></label>
        ${N.predvedeni ? `<p class="obj-zkusebni">Ukázka: nic se neplatí ani neodesílá. Průběh je zrychlený (skutečně do 5, u PLUS do 10 minut) a na konci uvidíte vzorový report ke Karlické 910/49 v Praze 16.</p>`
          : N.zkusebni ? `<p class="obj-zkusebni">Zkušební provoz – platby spustíme v nejbližších dnech. Teď se nic neplatí a report nepřijde.</p>` : ""}
        <p class="obj-souhrn" role="alert"></p>
        ${N.predvedeni || !window.PLATBA ? `<button class="tl tmave-tl obj-zaplatit" type="submit">${tlText("proverka")}</button>`
          : `<p class="obj-k-uhrade">K úhradě <b>${kc(N.ceny.proverka)}</b></p>${window.PLATBA.tlacitka()}`}
        <p class="obj-stav-zprava" role="status" aria-live="polite"></p>
        <p class="obj-drobne">Platbu kartou, Apple Pay, Google Pay nebo převodem zajišťuje Comgate. <a href="/podminky.html" target="_blank">Obchodní podmínky</a> · <a href="/osobni-udaje.html" target="_blank">Ochrana osobních údajů</a></p>
      </form>`;
    const f = kontejner.querySelector("form");
    const tl = f.querySelector(".obj-zaplatit"), uhrada = f.querySelector(".obj-k-uhrade b"), zprava = f.querySelector(".obj-stav-zprava"), souhrn = f.querySelector(".obj-souhrn");
    const plus = f.querySelector(".obj-plus"), navrh = f.querySelector(".obj-navrh");
    const balicek = () => f.balicek.value;
    // Byt po krocích (Petr 15. 11. 2026): číslo bytu; „Číslo nevím“ rozbalí příjmení majitele, patro a souhlas s prověrkou
    // bez konkrétního bytu. Plocha je vidět v PLUS (odhad ceny) a při „Číslo nevím“ (hledání podle plochy).
    const nevimTl = f.querySelector(".obj-nevim-tl"), nevim = f.querySelector(".obj-nevim"), plochaBytu = f.querySelector(".obj-plocha");
    let bezJednotek = false;   // dům nemá v katastru vymezené byty (to-do 42) – číslo bytu neexistuje
    const nevimOtevreno = () => !bezJednotek && nevim && !nevim.hidden;
    const ukazPlochu = () => { if (plochaBytu) plochaBytu.hidden = !(balicek() === "plus" || nevimOtevreno()); };
    nevimTl?.addEventListener("click", () => {
      nevim.hidden = !nevim.hidden;
      nevimTl.setAttribute("aria-expanded", String(!nevim.hidden));
      nevimTl.textContent = nevim.hidden ? "Číslo nevím" : "Číslo znám";
      ukazPlochu();
      if (!nevim.hidden) f.prijmeni.focus();
    });
    f.querySelectorAll(".obj-rozbal-tl").forEach((tl) => tl.addEventListener("click", (e) => {
      e.preventDefault();   // tlačítko je v labelu: jen rozbalit, balíček nevybírat
      const r = f.querySelector(`#${tl.getAttribute("aria-controls")}`);
      r.hidden = !r.hidden;
      tl.setAttribute("aria-expanded", String(!r.hidden));
      tl.textContent = r.hidden ? "Co přesně dostanu" : "Skrýt";
    }));
    // Měření: došel k objednávce (formulář na obrazovce), zvolil PLUS.
    try { const io = new IntersectionObserver((z) => { if (z.some((x) => x.isIntersecting)) { window.mer?.("formular"); io.disconnect(); } }, { threshold: 0.3 }); io.observe(f); } catch { /* bez měření */ }
    const prepni = () => { if (balicek() === "plus") window.mer?.("plus"); plus.hidden = balicek() !== "plus"; if (tl) tl.textContent = tlText(balicek()); if (uhrada) uhrada.textContent = kc(N.ceny[balicek()]); ukazPlochu(); };
    f.querySelectorAll("input[name=balicek]").forEach((r) => r.addEventListener("change", prepni));
    // Cena se při psaní formátuje po tisících: 214 414 156 (Petr 13. 11. 2026).
    const cenaPole = f.cena, cislo = (s) => Number(String(s).replace(/\D/g, "")) || 0;
    cenaPole.addEventListener("input", () => {
      const pred = cenaPole.value.slice(0, cenaPole.selectionStart).replace(/\D/g, "").length;
      const c = cislo(cenaPole.value);
      cenaPole.value = c ? c.toLocaleString("cs-CZ") : "";
      let pos = 0, n = 0; while (pos < cenaPole.value.length && n < pred) { if (/\d/.test(cenaPole.value[pos])) n++; pos++; }
      cenaPole.setSelectionRange(pos, pos);
    });
    // Překlep v doméně e-mailu: nabídneme opravu jedním klepnutím (neblokuje odeslání).
    const ukazNavrh = () => {
      const n = EMAIL.test(f.email.value.trim()) ? navrhEmailu(f.email.value.trim()) : null;
      navrh.hidden = !n;
      if (n) navrh.innerHTML = `Nemysleli jste <button type="button">${esc(n)}</button>?`;
      navrh.querySelector("button")?.addEventListener("click", () => { f.email.value = n; navrh.hidden = true; vycisti(f.email); prepocti(); });
    };
    f.email.addEventListener("blur", ukazNavrh);

    // Chyby u polí: červený rámeček, text pod polem, aria-invalid; všechny najednou.
    const kotva = (pole) => pole.closest("fieldset.obj-stav") || pole.closest("label") || pole;
    const vycisti = (pole) => {
      const k = kotva(pole);
      k.classList.remove("obj-chybne");
      k.querySelector(":scope > .obj-chyba")?.remove();
      (k.matches("fieldset") ? k.querySelectorAll("input") : [pole]).forEach((x) => { x.removeAttribute("aria-invalid"); x.removeAttribute("aria-describedby"); });
    };
    const oznac = (pole, text, i) => {
      const k = kotva(pole), id = `obj-chyba-${i}`;
      k.classList.add("obj-chybne");
      k.insertAdjacentHTML("beforeend", `<span class="obj-chyba" id="${id}">${esc(text)}</span>`);
      (k.matches("fieldset") ? k.querySelectorAll("input") : [pole]).forEach((x) => { x.setAttribute("aria-invalid", "true"); x.setAttribute("aria-describedby", id); });
    };
    const pocetText = (n) => n === 1 ? "Doplňte prosím 1 údaj – je označený červeně." : `Doplňte prosím ${n} údaje – jsou označené červeně.`;
    const prepocti = () => { const n = f.querySelectorAll(".obj-chybne").length; souhrn.textContent = n ? pocetText(n) : ""; };
    f.addEventListener("input", (e) => { if (e.target.name && e.target.name !== "balicek") { vycisti(e.target); prepocti(); } });
    f.addEventListener("change", (e) => { if (["stav", "souhlas", "bez_bytu", "bez_jednotek"].includes(e.target.name)) { vycisti(e.target); prepocti(); } });

    // To-do 42 (Petr 27. 11. 2026, test Kladno): má bytový dům v katastru vymezené byty? Zdarma ještě před platbou.
    // Bez bytů jde o obecní nebo družstevní dům – byt tu do vlastnictví koupit nejde; objednávka jen s potvrzením.
    if (byt && budova?.castobce && budova?.cislo && N.api && !N.predvedeni) {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 12000);
      fetch(`${N.api}/dum/jednotky?castobce=${encodeURIComponent(budova.castobce)}&cislo=${encodeURIComponent(budova.cislo)}&typ=${budova.typ === 2 ? 2 : 1}`, { signal: ctrl.signal })
        .then((r) => r.ok ? r.json() : null).then((d) => {
          if (d?.stav !== "bez_bytu") return;
          bezJednotek = true;
          window.mer?.("bez_jednotek");
          const blok = f.querySelector(".obj-byt");
          [f.cislo_bytu.closest("label"), blok.querySelector(".obj-cislo-tip"), nevimTl, nevim].forEach((x) => { if (x) x.hidden = true; });
          blok.insertAdjacentHTML("afterbegin", `<div class="obj-bez-jednotek" role="alert">
            <p><b>Byt v&nbsp;tomto domě nejde koupit jako samostatnou nemovitost.</b> Podle katastru dům nemá vymezené byty (jednotky) –
            celý patří jednomu vlastníkovi, obvykle obci nebo družstvu. Kupuje se tu nejspíš družstevní podíl, nebo jde o&nbsp;nájem.</p>
            <p>Prověrka posoudí dům, zápisy v&nbsp;katastru k&nbsp;domu a&nbsp;okolí – ne konkrétní byt ani prodávajícího.</p>
            <label class="obj-souhlas"><input type="checkbox" name="bez_jednotek"><span>Rozumím a&nbsp;chci přesto prověřit dům.</span></label></div>`);
          f.querySelectorAll(".obj-chybne").forEach((k) => vycisti(k.querySelector("input"))); prepocti();
        }).catch(() => { /* bez odpovědi objednávka běží jako dřív */ });
    }

    const kontrola = () => {
      const ch = [];
      const v = (x) => Number(String(x).replace(",", "."));
      if (byt) {
        const pl = v(f.plocha.value), cb = f.cislo_bytu.value.trim().replace(/\s+/g, "");
        if (bezJednotek) {
          if (!f.bez_jednotek.checked) ch.push([f.bez_jednotek, "Potvrďte, že rozumíte: byt v tomto domě nejde koupit samostatně a prověříme dům."]);
        } else {
        if (cb && !/^\d{1,5}\/\d{1,4}$/.test(cb)) ch.push([f.cislo_bytu, "Číslo bytu má tvar 1311/146 (číslo domu, lomítko, číslo bytu)."]);
        if (!cb && !nevimOtevreno()) ch.push([f.cislo_bytu, "Doplňte číslo bytu, nebo klikněte na „Číslo nevím“."]);
        if (!cb && nevimOtevreno()) {
          if (!f.prijmeni.value.trim() && !(pl > 0)) ch.push([f.prijmeni, "Doplňte příjmení majitele, nebo plochu bytu – podle nich byt najdeme."]);
          if (!f.bez_bytu.checked) ch.push([f.bez_bytu, "Potvrďte, že rozumíte: bez určeného bytu nebude ve zprávě výpis bytu ani prověření vlastníka."]);
        }
        }
        if ((balicek() === "plus" || nevimOtevreno()) && f.plocha.value && (pl < 10 || pl > 500)) ch.push([f.plocha, "Plocha bytu má být 10–500 m²."]);
        if (balicek() === "plus" && !(pl > 0)) ch.push([f.plocha, "Doplňte plochu bytu – bez ní cenu neodhadneme."]);
      }
      if (balicek() === "plus") {   // v PLUS povinné: cena, plocha a stav (Petr 13. 11. 2026)
        if (cislo(f.cena.value) < 100000) ch.push([f.cena, "Doplňte požadovanou cenu z inzerátu – bez ní cenu neporovnáme."]);
        if (!byt) {
          const pl = v(f.plocha_dum.value);
          if (!(pl > 0)) ch.push([f.plocha_dum, "Doplňte užitnou plochu domu – bez ní cenu neodhadneme."]);
          else if (pl < 20 || pl > 2000) ch.push([f.plocha_dum, "Užitná plocha domu má být 20–2 000 m²."]);
        }
        if (!f.stav.value) ch.push([f.querySelector("input[name=stav]"), "Vyberte stav nemovitosti."]);
      }
      const email = f.email.value.trim();
      if (!email) ch.push([f.email, "Doplňte e-mail – pošleme na něj report."]);
      else if (!EMAIL.test(email)) ch.push([f.email, "E-mail má tvar jmeno@domena.cz – zkontrolujte, zda nechybí koncovka (.cz, .com)."]);
      if (!f.souhlas.checked) ch.push([f.souhlas, "Bez souhlasu s obchodními podmínkami objednávku nepřijmeme."]);
      return ch;
    };

    const zamkni = (ano) => { if (tl) tl.disabled = ano; if (window.PLATBA) window.PLATBA.zamkni(f, ano); };
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      f.querySelectorAll(".obj-chybne").forEach((k) => vycisti(k.querySelector("input")));
      const ch = kontrola();
      if (ch.length) {
        window.mer?.("zaplatit_chyba");
        ch.forEach(([pole, text], i) => oznac(pole, text, i));
        souhrn.textContent = pocetText(ch.length);
        ch[0][0].focus();
        kotva(ch[0][0]).scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        return;
      }
      souhrn.textContent = "";
      const data = {
        balicek: balicek(), email: f.email.value.trim(), adresa, typ: byt ? "byt" : "dum", souhlas: true, web: f.web.value || null,
        inzerat: inz?.url || null,
        plocha: byt ? (balicek() === "plus" || nevimOtevreno() ? Number(String(f.plocha.value).replace(",", ".")) || null : null)
          : (balicek() === "plus" ? Number(f.plocha_dum?.value) || null : null),
        cislo_bytu: byt && !bezJednotek ? f.cislo_bytu.value.trim().replace(/\s+/g, "") || null : null,
        prijmeni: byt && nevimOtevreno() && !f.cislo_bytu.value.trim() ? f.prijmeni.value.trim() || null : null,
        bez_bytu: byt && (bezJednotek || (nevimOtevreno() && f.bez_bytu.checked)),
        bez_jednotek: byt && bezJednotek,
        cena: balicek() === "plus" ? cislo(f.cena.value) || null : null,
        patro: byt && nevimOtevreno() ? f.patro.value.trim() || null : null,
        stav: balicek() === "plus" ? f.stav.value : null,
        // Obrys domu z přehledu zdarma: server ho vrátí stránce průběhu (snímek a mapka Prahy i z odkazu v e-mailu).
        metoda: window.PLATBA && !N.predvedeni ? window.PLATBA.metoda(e) : null,
        obrys: (() => { try { return JSON.parse(document.getElementById("ochutnavka")?.dataset.obrys || "null"); } catch { return null; } })(),
      };
      window.mer?.("zaplatit", data.metoda || "");
      zamkni(true); zprava.textContent = N.predvedeni ? "Spouštíme ukázku…" : "Připravujeme platbu…"; zprava.dataset.typ = "";
      try {
        const r = await fetch(`${N.api}/objednavka`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof d.detail === "string" ? d.detail : "Objednávku se nepodařilo založit.");
        // Přehled zdarma si vezmeme na stránku průběhu („Co už víme“), ať klient nečeká na prázdnou obrazovku.
        try {
          const och = document.getElementById("ochutnavka");
          sessionStorage.setItem("predkoupi-ochutnavka", JSON.stringify({
            snimek: och?.querySelector(".och-snimek")?.innerHTML.replace(/<figcaption>.*<\/figcaption>/s, "") || "",
            obrys: och?.dataset.obrys ? JSON.parse(och.dataset.obrys) : null,   // obrys domu v S-JTSK pro snímek a mapku Prahy v průběhu
            oblasti: [...(och?.querySelectorAll("tr[data-oblast]") || [])].map((tr) => ({ oblast: tr.dataset.oblast,
              barva: [...tr.querySelector(".och-znacka").classList].find((c) => ["zelena", "oranzova", "cervena", "seda"].includes(c)) || "seda",
              text: tr.cells[2].textContent.trim() })),
          }));
          sessionStorage.setItem("predkoupi-email", data.email);
        } catch { /* bez úložiště to jde taky */ }
        location.href = d.presmerovani;
      } catch (err) {
        zprava.textContent = `${err.message} Zkuste to prosím znovu, nebo napište na info@predkoupi.cz.`;
        zprava.dataset.typ = "chyba";
        zamkni(false);
      }
    });
  };
})();
