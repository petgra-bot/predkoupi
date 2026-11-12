// Pole pro e-mail zájemců o spuštění objednávek. Odesílá na Cloudflare Worker (KV „ZAJEMCI“).
(() => {
  const URL_ZAJEM = "https://proverka-inzerat.p-gratzer.workers.dev/zajem";
  // Texty jdou přepsat atributy kontejneru (data-stitek, data-souhlas, data-hotovo), např. pro zájemce mimo Prahu.
  const html = (zdroj, id, d) => `
    <label for="${id}">${d.stitek || "E-mail pro oznámení o spuštění"}</label>
    <div class="pole-zajem">
      <input id="${id}" type="email" name="email" required autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" enterkeyhint="send" placeholder="jmeno@example.cz">
      <button type="submit" class="tl tmave-tl">Dát vědět</button>
    </div>
    <input type="text" name="web" tabindex="-1" autocomplete="off" class="skryte" aria-hidden="true">
    <input type="hidden" name="zdroj" value="${zdroj}">
    <p class="souhlas">${d.souhlas || "Pošleme jedinou zprávu, až objednávky spustíme, a pak e-mail smažeme. Nic jiného s ním neděláme."}</p>
    <p class="stav" role="status" aria-live="polite"></p>`;
  let n = 0;
  window.zajemFormular = (kontejner) => {
    const f = document.createElement("form");
    f.className = "zajem"; f.noValidate = true;
    // Testovací kopie (proverka.gratzer.cz) ukládá se zdrojem „test:…“, ať se nemíchá se zájemci z produkce.
    const zdroj = (location.hostname.startsWith("proverka.") ? "test:" : "") + (kontejner.dataset.zdroj || "web");
    f.innerHTML = html(zdroj.slice(0, 40), `zajem-email-${++n}`, kontejner.dataset);
    kontejner.replaceChildren(f);
    const vstup = f.querySelector("input[type=email]"), tl = f.querySelector("button"), stav = f.querySelector(".stav");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!vstup.value.trim() || !vstup.checkValidity()) { stav.textContent = "Zadejte e-mail ve tvaru jmeno@example.cz."; stav.dataset.typ = "chyba"; vstup.focus(); return; }
      tl.disabled = true; stav.textContent = "Ukládáme…"; stav.dataset.typ = "";
      try {
        const r = await fetch(URL_ZAJEM, { method: "POST", body: new URLSearchParams(new FormData(f)) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.chyba || "Uložení se nepovedlo.");
        f.innerHTML = `<p class="stav" role="status" data-typ="ok">Hotovo. Na ${vstup.value.trim().replace(/[<>&"]/g, "")} dáme vědět, ${kontejner.dataset.hotovo || "až objednávky spustíme"}.</p>`;
      } catch (err) {
        stav.textContent = `${err.message} Zkuste to prosím znovu, nebo napište na info@predkoupi.cz.`; stav.dataset.typ = "chyba"; tl.disabled = false;
      }
    });
  };
  document.querySelectorAll("[data-zajem]").forEach((k) => window.zajemFormular(k));
})();
