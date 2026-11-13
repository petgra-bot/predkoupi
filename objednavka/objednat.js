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

  window.objednavkaFormular = (kontejner, { adresa, typ, inz }) => {
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
          <label class="obj-balicek"><input type="radio" name="balicek" value="proverka" checked>
            <span class="obj-bal-text"><span class="obj-bal-nazev"><b>Prověrka</b><b>${kc(N.ceny.proverka)}</b></span>
            <span class="obj-bal-popis">Právní stav z katastru včetně exekucí, územní plán a stavby v okolí, verdikt a úkoly před koupí. Report do 5 minut.</span></span></label>
          <label class="obj-balicek"><input type="radio" name="balicek" value="plus">
            <span class="obj-bal-text"><span class="obj-bal-nazev"><b>Prověrka PLUS</b><b>${kc(N.ceny.plus)}</b></span>
            <span class="obj-bal-popis">Navíc odhad ceny ze skutečných prodejů v katastru a srovnání s cenou v inzerátu; podrobný report s mapami. Do 10 minut.</span></span></label>
        </fieldset>
        ${byt ? `<div class="obj-radek">
          <label>Plocha bytu (m²)<input name="plocha" type="number" inputmode="decimal" min="10" max="500" step="0.1" value="${p(inz?.plocha_m2)}"></label>
          <label>Číslo bytu, pokud ho znáte<input name="cislo_bytu" type="text" maxlength="20" placeholder="např. 1234/5 z kupní smlouvy"></label>
        </div>
        <p class="obj-napoveda">Podle plochy najdeme byt v katastru. Když bude odpovídat víc bytů, po zaplacení vám je ukážeme na výběr.</p>` : ""}
        <div class="obj-plus" hidden>
          <p class="obj-napoveda">${inz ? "Co víme z inzerátu, je předvyplněné; doplňte zbytek." : "Pro odhad ceny opište z inzerátu cenu, plochu a stav."}</p>
          <div class="obj-radek">
            <label>Požadovaná cena (Kč)<input name="cena" type="text" inputmode="numeric" autocomplete="off" value="${inz?.cena_kc ? p(Number(inz.cena_kc).toLocaleString("cs-CZ")) : ""}" placeholder="např. 8 900 000"></label>
            ${byt ? `<label>Patro, pokud ho znáte<input name="patro" type="text" maxlength="10" value="${p(inz?.patro)}"></label>`
                  : `<label>Užitná plocha domu (m²)<input name="plocha_dum" type="number" inputmode="decimal" min="20" max="2000" value="${p(inz?.plocha_m2)}"></label>`}
          </div>
          <fieldset class="obj-stav"><legend>Stav</legend>
            ${STAVY.map(([v, t]) => `<label><input type="radio" name="stav" value="${v}"><span>${t}</span></label>`).join("")}
          </fieldset>
        </div>
        <label class="obj-email">E-mail pro report<input name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="jmeno@example.cz"></label>
        <p class="obj-navrh" hidden></p>
        <input type="text" name="web" tabindex="-1" autocomplete="off" class="skryte" aria-hidden="true">
        <p class="obj-jistota">Když report nedodáme, vrátíme celé peníze.</p>
        <label class="obj-souhlas"><input type="checkbox" name="souhlas">
          <span>Souhlasím s <a href="/podminky.html" target="_blank">obchodními podmínkami</a>. Chci report hned po zaplacení a beru na vědomí, že hotový report už nejde vrátit (odstoupit od smlouvy).</span></label>
        ${N.predvedeni ? `<p class="obj-zkusebni">Ukázka: nic se neplatí ani neodesílá. Průběh je zrychlený (skutečně do 5, u PLUS do 10 minut) a na konci uvidíte vzorový report ke Karlické 910/49 v Praze 16.</p>`
          : N.zkusebni ? `<p class="obj-zkusebni">Zkušební provoz – platby spustíme v nejbližších dnech. Teď se nic neplatí a report nepřijde.</p>` : ""}
        <p class="obj-souhrn" role="alert"></p>
        <button class="tl tmave-tl obj-zaplatit" type="submit">${tlText("proverka")}</button>
        <p class="obj-stav-zprava" role="status" aria-live="polite"></p>
        <p class="obj-drobne">Platbu kartou, Apple Pay, Google Pay nebo převodem zajišťuje Comgate. <a href="/osobni-udaje.html" target="_blank">Ochrana osobních údajů</a> · Petr Grätzer, IČO 19843071, neplátce DPH.</p>
      </form>`;
    const f = kontejner.querySelector("form");
    const tl = f.querySelector(".obj-zaplatit"), zprava = f.querySelector(".obj-stav-zprava"), souhrn = f.querySelector(".obj-souhrn");
    const plus = f.querySelector(".obj-plus"), navrh = f.querySelector(".obj-navrh");
    const balicek = () => f.balicek.value;
    const prepni = () => { plus.hidden = balicek() !== "plus"; tl.textContent = tlText(balicek()); };
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
    f.addEventListener("change", (e) => { if (e.target.name === "stav" || e.target.name === "souhlas") { vycisti(e.target); prepocti(); } });

    const kontrola = () => {
      const ch = [];
      const v = (x) => Number(String(x).replace(",", "."));
      if (byt) {
        const pl = v(f.plocha.value);
        if (!f.cislo_bytu.value.trim() && !(pl > 0)) ch.push([f.plocha, "Doplňte plochu bytu z inzerátu (nebo číslo bytu)."]);
        else if (f.plocha.value && (pl < 10 || pl > 500)) ch.push([f.plocha, "Plocha bytu má být 10–500 m²."]);
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

    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      f.querySelectorAll(".obj-chybne").forEach((k) => vycisti(k.querySelector("input")));
      const ch = kontrola();
      if (ch.length) {
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
        plocha: byt ? Number(String(f.plocha.value).replace(",", ".")) || null : (balicek() === "plus" ? Number(f.plocha_dum?.value) || null : null),
        cislo_bytu: byt ? f.cislo_bytu.value.trim() || null : null,
        cena: balicek() === "plus" ? cislo(f.cena.value) || null : null,
        patro: balicek() === "plus" && byt ? f.patro.value.trim() || null : null,
        stav: balicek() === "plus" ? f.stav.value : null,
      };
      tl.disabled = true; zprava.textContent = N.predvedeni ? "Spouštíme ukázku…" : "Připravujeme platbu…"; zprava.dataset.typ = "";
      try {
        const r = await fetch(`${N.api}/objednavka`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof d.detail === "string" ? d.detail : "Objednávku se nepodařilo založit.");
        // Přehled zdarma si vezmeme na stránku průběhu („Co už víme“), ať klient nečeká na prázdnou obrazovku.
        try {
          const och = document.getElementById("ochutnavka");
          sessionStorage.setItem("predkoupi-ochutnavka", JSON.stringify({
            snimek: och?.querySelector(".och-snimek")?.innerHTML.replace(/<figcaption>.*<\/figcaption>/s, "") || "",
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
        tl.disabled = false;
      }
    });
  };
})();
