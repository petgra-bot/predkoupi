// Formulář objednávky pod přehledem zdarma (proverit/app.js volá window.objednavkaFormular).
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const kc = (n) => `${Number(n).toLocaleString("cs-CZ")} Kč`;
  const STAVY = [["pred-rekonstrukci", "Před rekonstrukcí"], ["bezny", "Běžný"], ["po-rekonstrukci", "Po rekonstrukci"], ["novostavba", "Novostavba"]];

  window.objednavkaFormular = (kontejner, { adresa, typ, inz }) => {
    const N = window.OBJEDNAVKY;
    const byt = typ === "bytový dům";
    const p = (v) => (v == null ? "" : esc(v));
    kontejner.innerHTML = `
      <form class="objednat" novalidate>
        <h3>Objednat prověrku</h3>
        <p class="obj-adresa">${esc(adresa.split(",").slice(0, 2).join(","))}${byt ? " · byt" : " · rodinný dům"}</p>
        <fieldset class="obj-balicky">
          <legend class="skryte">Balíček</legend>
          <label class="obj-balicek"><input type="radio" name="balicek" value="proverka" checked>
            <span><b>Prověrka · ${kc(N.ceny.proverka)}</b>Výpis z katastru, právní stav a exekuce, územní plán a záměry, verdikt a úkoly před koupí. Report zpravidla do 5 minut.</span></label>
          <label class="obj-balicek"><input type="radio" name="balicek" value="plus">
            <span><b>Prověrka PLUS · ${kc(N.ceny.plus)}</b>Navíc odhad ceny ze skutečných prodejů v katastru, srovnání s požadovanou cenou a podrobný report. Zpravidla do 10 minut.</span></label>
        </fieldset>
        ${byt ? `<div class="obj-radek">
          <label>Plocha bytu (m²)<input name="plocha" type="number" inputmode="decimal" min="10" max="500" step="0.1" value="${p(inz?.plocha_m2)}" required></label>
          <label>Číslo bytu, pokud ho znáte<input name="cislo_bytu" type="text" maxlength="20" placeholder="např. 3191/14"></label>
        </div>
        <p class="obj-napoveda">Podle plochy najdeme byt v katastru. Když bude odpovídat víc bytů, po zaplacení vám je ukážeme na výběr.</p>` : ""}
        <div class="obj-plus" hidden>
          <p class="obj-napoveda">Pro odhad ceny potřebujeme pár údajů z inzerátu. Co víme, je předvyplněné.</p>
          <div class="obj-radek">
            <label>Požadovaná cena (Kč)<input name="cena" type="text" inputmode="numeric" autocomplete="off" value="${inz?.cena_kc ? p(Number(inz.cena_kc).toLocaleString("cs-CZ")) : ""}" placeholder="např. 8 900 000"></label>
            ${byt ? `<label>Patro, pokud ho znáte<input name="patro" type="text" maxlength="10" value="${p(inz?.patro)}"></label>`
                  : `<label>Užitná plocha domu (m²)<input name="plocha_dum" type="number" inputmode="decimal" min="20" max="2000" value="${p(inz?.plocha_m2)}"></label>`}
          </div>
          <fieldset class="obj-stav"><legend>Stav</legend>
            ${STAVY.map(([v, t]) => `<label><input type="radio" name="stav" value="${v}"><span>${t}</span></label>`).join("")}
          </fieldset>
        </div>
        <label class="obj-email">E-mail pro report<input name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required placeholder="jmeno@example.cz"></label>
        <input type="text" name="web" tabindex="-1" autocomplete="off" class="skryte" aria-hidden="true">
        <label class="obj-souhlas"><input type="checkbox" name="souhlas" required>
          <span>Souhlasím s <a href="/podminky.html" target="_blank">obchodními podmínkami</a>. Chci report hned po zaplacení a beru na vědomí, že hotový report už nejde vrátit (odstoupit od smlouvy).</span></label>
        <p class="obj-jistota">Když report nedodáme, vrátíme celé peníze.</p>
        ${N.zkusebni ? `<p class="obj-zkusebni">Zkušební provoz – platby spustíme v nejbližších dnech. Platba teď nic nestojí a prověrka se nespustí.</p>` : ""}
        <button class="tl tmave-tl obj-zaplatit" type="submit">Zaplatit ${kc(N.ceny.proverka)}</button>
        <p class="obj-stav-zprava" role="status" aria-live="polite"></p>
        <p class="obj-drobne">Platbu kartou, Apple Pay, Google Pay nebo převodem zajišťuje Comgate. <a href="/osobni-udaje.html" target="_blank">Ochrana osobních údajů</a> · Petr Grätzer, IČO 19843071, neplátce DPH.</p>
      </form>`;
    const f = kontejner.querySelector("form");
    const tl = f.querySelector(".obj-zaplatit"), zprava = f.querySelector(".obj-stav-zprava"), plus = f.querySelector(".obj-plus");
    const balicek = () => f.balicek.value;
    const prepni = () => { plus.hidden = balicek() !== "plus"; tl.textContent = `Zaplatit ${kc(N.ceny[balicek()])}`; };
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
    const chyba = (text, pole) => { zprava.textContent = text; zprava.dataset.typ = "chyba"; pole?.focus(); };

    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = f.email.value.trim();
      if (byt && !(f.plocha.value > 0) && !f.cislo_bytu.value.trim()) return chyba("Doplňte plochu bytu (nebo jeho číslo).", f.plocha);
      if (balicek() === "plus") {   // v PLUS povinné: cena, plocha a stav (Petr 13. 11. 2026)
        if (cislo(f.cena.value) < 100000) return chyba("Doplňte požadovanou cenu z inzerátu – bez ní cenu neporovnáme.", f.cena);
        if (byt ? !(f.plocha.value > 0) : !(f.plocha_dum.value > 0)) return chyba("Doplňte plochu – bez ní cenu neodhadneme.", byt ? f.plocha : f.plocha_dum);
        if (!f.stav.value) return chyba("Vyberte stav nemovitosti.", f.querySelector("input[name=stav]"));
      }
      if (!email || !f.email.checkValidity()) return chyba("Zadejte e-mail ve tvaru jmeno@example.cz.", f.email);
      if (!f.souhlas.checked) return chyba("Bez souhlasu s obchodními podmínkami objednávku nepřijmeme.", f.souhlas);
      const data = {
        balicek: balicek(), email, adresa, typ: byt ? "byt" : "dum", souhlas: true, web: f.web.value || null,
        inzerat: inz?.url || null,
        plocha: byt ? Number(f.plocha.value) || null : (balicek() === "plus" ? Number(f.plocha_dum?.value) || null : null),
        cislo_bytu: byt ? f.cislo_bytu.value.trim() || null : null,
        cena: balicek() === "plus" ? cislo(f.cena.value) || null : null,
        patro: balicek() === "plus" && byt ? f.patro.value.trim() || null : null,
        stav: balicek() === "plus" ? f.stav.value : null,
      };
      tl.disabled = true; zprava.textContent = "Připravujeme platbu…"; zprava.dataset.typ = "";
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
        } catch { /* bez úložiště to jde taky */ }
        location.href = d.presmerovani;
      } catch (err) {
        chyba(`${err.message} Zkuste to prosím znovu, nebo napište na info@predkoupi.cz.`);
        tl.disabled = false;
      }
    });
  };
})();
