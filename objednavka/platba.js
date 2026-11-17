// Výběr platby přímo u nás (Petr 18. 11. 2026): Comgate na své bráně Apple Pay a Google Pay na první obrazovku dát neumí
// (comgate#709996), proto volbu nabízíme sami a bráně pošleme jen zvolenou metodu (APPLEPAY_REDIRECT atd. – varianta 2
// v dokumentaci Comgate). Apple Pay jen tam, kde ho zařízení opravdu umí; Google Pay na Androidu mimo vestavěné prohlížeče.
(() => {
  // Přepínač peněženek (18. 11. 2026): APPLEPAY_REDIRECT na ostré bráně selhával; server teď posílá CARD_CZ_COMGATE,
  // Apple Pay a Google Pay jsou na stránce karty nahoře. false = jen karta a převod.
  const PENEZENKY = true;
  const ua = navigator.userAgent;
  const apple = PENEZENKY && (() => { try { return !!(window.ApplePaySession && ApplePaySession.canMakePayments()); } catch { return false; } })();
  const google = PENEZENKY && !apple && /Android/i.test(ua) && !/FBAN|FBAV|Instagram|; wv\)/i.test(ua);

  window.PLATBA = {
    apple, google,
    // Tlačítka platby: peněženka (je-li) jako hlavní, pak karta a převod. Všechna jsou submit s name="metoda".
    tlacitka(text = {}) {
      const kartaHlavni = !apple && !google;
      return `<div class="pl-volby">
        ${apple ? `<button type="submit" name="metoda" value="applepay" class="pl-apple" lang="cs" aria-label="Zaplatit přes Apple Pay"><span>Zaplatit přes <b>Apple&nbsp;Pay</b></span></button>` : ""}
        ${google ? `<button type="submit" name="metoda" value="googlepay" class="tl pl-google">Zaplatit přes <b>Google Pay</b></button>` : ""}
        <button type="submit" name="metoda" value="karta" class="tl ${kartaHlavni ? "tmave-tl" : "obrys-tmave"} pl-karta">${text.karta || "Zaplatit kartou"}</button>
        <button type="submit" name="metoda" value="prevod" class="pl-prevod">Zaplatit převodem z banky</button>
      </div>`;
    },
    // Zvolená metoda z události submit (Enter v poli = výchozí: peněženka, jinak karta).
    metoda(e) {
      const v = e.submitter?.value;
      return ["applepay", "googlepay", "karta", "prevod"].includes(v) ? v : apple ? "applepay" : google ? "googlepay" : "karta";
    },
    zamkni(form, ano) { form.querySelectorAll(".pl-volby button").forEach((b) => { b.disabled = ano; }); },
  };
})();
