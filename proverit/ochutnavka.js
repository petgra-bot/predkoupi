// Ochutnávka zdarma přímo v prohlížeči (přepis nemo/nastroje/ochutnavka.py, 8. 11. 2026).
// Povodně, hluk, radon, územní plán a okolí pro jednu budovu; žádný server, žádné ukládání.
// Všechny služby (Geoportál Praha, ČGS, IPR, ČÚZK) povolují dotazy z prohlížeče (CORS).
// Barvy podle stejných pravidel jako plný report; plný report navíc posuzuje pozemky, zdroje hluku a výšku nad hladinou.

const OCH = {
  RUIAN: "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer",
  ZAPLAVY: "https://gs-pub.praha.eu/arcgis/rest/services/ti/zaplavy/MapServer",
  HLUK: "https://gs-pub.praha.eu/arcgis/rest/services/hm/hluk/MapServer",
  RADON: "https://mapy.geology.cz/arcgis/rest/services/Geohazardy/radon50/MapServer",
  MPP: "https://mp.iprpraha.cz/arcgis/rest/services/Hosted",
  ELEKTRINA: "https://gs-pub.praha.eu/arcgis/rest/services/ti/elektrina/MapServer",
  ZABAGED: "https://ags.cuzk.gov.cz/arcgis/rest/services/ZABAGED_POLOHOPIS/MapServer",
  ORTOFOTO: "https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/MapServer",
};
const OCH_STAV = { zelena: "V pořádku", oranzova: "Pozor", cervena: "Riziko", seda: "Nezjištěno" };
// Radon: oranžově tam, kde doporučujeme měření (index 3, u rodinného domu i 2) – zelená s úkolem „změřte“ mátla (hodnocení 13. 11.).
const ochRadonBarva = (idx, rodinny) => idx === 3 || (rodinny && idx === 2) ? "oranzova" : idx === 1 || idx === 2 ? "zelena" : "seda";
const OCH_AREALY = {
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(102 + i), [100, "průmyslový areál"]])),
  "111": [300, "chov hospodářských zvířat (zápach)"], "303": [200, "stadion (hluk při akcích)"],
  "305": [300, "auto-moto areál (hluk)"], "307": [500, "střelnice (hluk)"], "315": [200, "zábavní park (hluk)"],
  "403": [100, "depo dopravy"], "404": [100, "technické služby"], "406": [300, "čistírna odpadních vod (zápach)"],
  "408": [100, "autobusové nádraží"], "409": [100, "čerpací stanice pohonných hmot"], "411": [100, "vysílač"],
  "414": [200, "věznice"], "415": [200, "kasárny, vojenský objekt"],
};

// ---------- dotazy ----------
// Ochutnávka má na všechno nejvýš 5 s (Petr 13. 11. 2026): dotazy se ukončí v termínu OCH_KONEC.
let OCH_KONEC = Infinity;
async function ochVolej(url, params, ms = 12000, pokus = 1) {
  ms = Math.max(300, Math.min(ms, OCH_KONEC - performance.now()));
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { method: "POST", body: new URLSearchParams({ f: "json", ...params }), signal: ctrl.signal });
    if (!r.ok) throw new Error(`služba odpověděla ${r.status}`);
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || "chyba služby");
    return d;
  } catch (e) {
    if (pokus < 2 && OCH_KONEC - performance.now() > 1500) return ochVolej(url, params, ms, pokus + 1);  // jedno opakování, když je čas
    throw e;
  } finally { clearTimeout(t); }
}
function ochGeom(poly) {
  return { geometry: JSON.stringify({ rings: poly, spatialReference: { wkid: 5514 } }), geometryType: "esriGeometryPolygon",
           inSR: 5514, spatialRel: "esriSpatialRelIntersects" };
}
async function ochPrvky(vrstva, poly, { vzdalenost, pole = "*", geometrie = false, where = "1=1" } = {}) {
  const p = { where, outFields: pole, returnGeometry: geometrie, outSR: 5514, ...ochGeom(poly) };
  if (vzdalenost) Object.assign(p, { distance: vzdalenost, units: "esriSRUnit_Meter" });
  if (geometrie) p.maxAllowableOffset = 0.5;
  return (await ochVolej(`${vrstva}/query`, p)).features || [];
}
async function ochPocet(vrstva, poly, vzdalenost) {
  const p = { where: "1=1", returnCountOnly: true, ...ochGeom(poly) };
  if (vzdalenost) Object.assign(p, { distance: vzdalenost, units: "esriSRUnit_Meter" });
  return (await ochVolej(`${vrstva}/query`, p)).count || 0;
}

// ---------- geometrie (S-JTSK, metry) ----------
function ochSegDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function ochUvnitr(p, rings) {
  let in_ = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) in_ = !in_;
  }
  return in_;
}
function ochCary(g) { return g.rings || g.paths || (g.x !== undefined ? [[[g.x, g.y]]] : []); }
function ochVzdalenost(dum, g) {
  const b = ochCary(g); if (!b.length) return null;
  if (g.rings && dum.some((r) => r.some((p) => ochUvnitr(p, g.rings)))) return 0;
  if (b.some((r) => r.some((p) => ochUvnitr(p, dum)))) return 0;
  let min = Infinity;
  const hrany = (rs) => rs.flatMap((r) => r.slice(1).map((p, i) => [r[i], p]));
  const ha = hrany(dum), hb = hrany(b);
  for (const r of b) for (const p of r) for (const [a, c] of ha) min = Math.min(min, ochSegDist(p, a, c));
  for (const r of dum) for (const p of r) for (const [a, c] of hb.length ? hb : b.flat().map((p) => [p, p])) min = Math.min(min, ochSegDist(p, a, c));
  return min;
}
function ochStred(poly) {
  const r = poly[0]; const n = r.length - 1 || 1;
  return [r.slice(0, n).reduce((s, p) => s + p[0], 0) / n, r.slice(0, n).reduce((s, p) => s + p[1], 0) / n];
}

// Nejmenší vzdálenost k vrstvě do max_m: z geometrie, a když ji vrstva nevrací, půlením parametru distance.
async function ochVzdalenostKVrstve(vrstva, dum, maxM, bezGeometrie = false) {
  if (!bezGeometrie) {   // vrstvy, které geometrii nevracejí (elektřina), rovnou souběžnými počty
    const f = await ochPrvky(vrstva, dum, { vzdalenost: maxM, pole: "*", geometrie: true });
    if (!f.length) return null;
    const d = f.map((x) => x.geometry ? ochVzdalenost(dum, x.geometry) : null).filter((x) => x !== null);
    if (d.length) return Math.min(...d);
  }
  // Vrstva bez geometrie: vzdálenost ve dvou kolech souběžných dotazů (místo pomalého půlení), přesnost cca 5 m.
  const kolo = async (vzdalenosti) => (await Promise.all(vzdalenosti.map((v) => ochPocet(vrstva, dum, v || undefined).then((n) => n > 0))))
    .findIndex(Boolean);
  const hrube = [0, 25, 50, 100, 150, 200, 250, maxM];
  const i = await kolo(hrube);
  if (i <= 0) return i === 0 ? 0 : null;
  const lo = hrube[i - 1], krok = (hrube[i] - lo) / 5, jemne = [1, 2, 3, 4, 5].map((k) => Math.round(lo + k * krok));
  const j = await kolo(jemne);
  return j < 0 ? hrube[i] : jemne[j];
}
async function ochDomeny(vrstva) {
  const m = await ochVolej(vrstva, {});
  return Object.fromEntries((m.fields || []).filter((f) => f.domain?.codedValues).map((f) => [f.name, Object.fromEntries(f.domain.codedValues.map((c) => [c.code, c.name]))]));
}

// ---------- vyhodnocení ----------
const ochPasmo = (h) => h ? `${Math.round(h) - 5}–${Math.round(h)} dB` : "pod nejnižším pásmem";
function ochBarvaHluku(lden, ln) {
  const d = (lden || 0) - 5, n = (ln || 0) - 5;
  return d >= 70 || n >= 60 ? "cervena" : d >= 55 || n >= 50 ? "oranzova" : "zelena";
}
const ochOk = (x) => x.status === "fulfilled";

// Každá oblast je samostatný slib: na webu se ukáže, jakmile je hotová (průběžné zobrazení, 13. 11. 2026).
function ochutnavkaOblasti(dum, rodinny = true) {
  const maxPasmo = async (vrstva, pole) => {
    const h = (await ochPrvky(vrstva, dum, { pole })).map((f) => parseFloat(f.attributes[pole])).filter((x) => !isNaN(x));
    return h.length ? Math.max(...h) : null;
  };
  const stred = ochStred(dum);
  const radek = (oblast, barva, text) => ({ oblast, barva, stav: OCH_STAV[barva], text });
  const povodne = (async () => {
    const [d100, d2002, akt] = await Promise.all([ochVzdalenostKVrstve(`${OCH.ZAPLAVY}/9`, dum, 300),
      ochVzdalenostKVrstve(`${OCH.ZAPLAVY}/10`, dum, 300), ochPocet(`${OCH.ZAPLAVY}/18`, dum).catch(() => 0)]);
    if (akt > 0 || d100 === 0) return radek("Povodně", "cervena", "Dům leží v záplavovém území stoleté vody" + (akt > 0 ? " (aktivní zóna)." : "."));
    if (d2002 === 0) return radek("Povodně", "oranzova", "Dům je mimo stoletou vodu, ale v rozlivu povodně 2002" + (d100 ? ` (stoletá voda ${Math.round(d100)} m).` : "."));
    return radek("Povodně", "zelena", "Mimo záplavové území" + (d100 ? `, hranice stoleté vody ${Math.round(d100)} m od domu.` : ", hranice dál než 300 m."));
  })();
  const hluk = (async () => {
    const [lden, ln] = await Promise.all([maxPasmo(`${OCH.HLUK}/9`, "LDEN"), maxPasmo(`${OCH.HLUK}/10`, "IPEN")]);
    const b = ochBarvaHluku(lden, ln);
    return radek("Hluk", b, `U nejhlučnější fasády ve dne ${ochPasmo(lden)}, v noci ${ochPasmo(ln)}` + (b !== "zelena" ? " – nad doporučením WHO." : "."));
  })();
  const radon = (async () => {
    const f = (await ochVolej(`${OCH.RADON}/1/query`, { where: "1=1", outFields: "radon_idx,radon_popis", returnGeometry: false,
      geometry: JSON.stringify({ x: stred[0], y: stred[1], spatialReference: { wkid: 5514 } }), geometryType: "esriGeometryPoint",
      inSR: 5514, spatialRel: "esriSpatialRelIntersects" })).features || [];
    if (!f.length) return radek("Radon", "seda", "Mapa radonu pro tento bod nemá údaj.");
    const a = f[0].attributes, idx = a.radon_idx;
    const b = ochRadonBarva(idx, rodinny);
    return radek("Radon", b, `Radonový index podloží ${a.radon_popis || idx} (${idx} ze 3)` +
      (b === "oranzova" ? "; doporučujeme radon v domě změřit." : "; o domě rozhodne měření."));
  })();
  const plan = (async () => {
    const url = `${OCH.MPP}/MPP_CUR_MPP_300_LOKALITY_P/FeatureServer/0`;
    const korP = ochPrvky(`${OCH.MPP}/MPP_CUR_MPP_600_DI_KORIDORY_P/FeatureServer/0`, dum, { vzdalenost: 100, pole: "objectid", geometrie: true })
      .then((f) => { const d = f.map((x) => x.geometry ? ochVzdalenost(dum, x.geometry) : null).filter((x) => x !== null); return d.length ? Math.min(...d) : null; })
      .catch(() => null);
    const [dom, f, kor] = await Promise.all([ochDomeny(url), ochPrvky(url, dum, { pole: "nazev,stabilita,vyuziti_lok" }), korP]);
    if (!f.length) return radek("Územní plán", "seda", "Metropolitní plán pro tento dům nemá údaj; ověříme v Prověrce.");
    const a = f[0].attributes;
    const l = { nazev: a.nazev, stabilita: dom.stabilita?.[a.stabilita] ?? a.stabilita, vyuziti: dom.vyuziti_lok?.[a.vyuziti_lok] ?? a.vyuziti_lok };
    let text = [`Lokalita ${l.nazev || ""}`.trim(), [l.stabilita, l.vyuziti].filter(Boolean).join(", ")].filter(Boolean).join(": ");
    if (kor !== null) text += kor < 1 ? "; dopravní koridor zasahuje až k domu" : `; dopravní koridor ${Math.round(kor)} m od domu`;
    return radek("Územní plán", String(l.stabilita).startsWith("stabilizovan") && kor === null ? "zelena" : "oranzova", text + ".");
  })();
  const okoli = (async () => {
    const [vvn, arealy] = await Promise.all([ochVzdalenostKVrstve(`${OCH.ELEKTRINA}/13`, dum, 300, true).catch(() => null),
      ochPrvky(`${OCH.ZABAGED}/114`, dum, { vzdalenost: 500, pole: "typzast_k", geometrie: true }).catch(() => [])]);
    const nalezy = []; let barva = "zelena";
    if (vvn !== null) { nalezy.push(`vedení velmi vysokého napětí ${Math.round(vvn)} m od domu` + (vvn > 25 ? " (mimo ochranné pásmo)" : "")); if (vvn <= 25) barva = "oranzova"; }
    for (const f of arealy) {
      const def = OCH_AREALY[String(f.attributes.typzast_k)]; if (!def || !f.geometry) continue;
      const d = Math.round(ochVzdalenost(dum, f.geometry));
      if (d <= def[0]) { nalezy.push(`${def[1]} ${d} m`); barva = "oranzova"; }
    }
    return radek("Okolí", barva, nalezy.length ? `V okolí: ${[...new Set(nalezy)].join("; ")}.` : "Bez průmyslu, čistírny, střelnice či vedení velmi vysokého napětí v blízkosti.");
  })();
  return { "Povodně": povodne, "Hluk": hluk, "Radon": radon, "Územní plán": plan, "Okolí": okoli };
}

// ---------- zobrazení ----------
const OCH_ZAMCENE = `
  <tr class="och-zamceno"><th scope="row">Právní stav</th><td><span class="och-znacka zam">V Prověrce</span></td><td>Věcná břemena, zástavy, exekuce a plomby z výpisu z katastru, insolvence majitele.</td></tr>
  <tr class="och-zamceno"><th scope="row">Co udělat</th><td><span class="och-znacka zam">V Prověrce</span></td><td>Verdikt jednou větou a úkoly na míru před rezervací, podpisem a převodem.</td></tr>
  <tr class="och-zamceno och-cena"><th scope="row">Cena</th><td><span class="och-znacka zam">V Prověrce PLUS</span></td><td>Odhad ze skutečných prodejů v katastru proti ceně v inzerátu – víte, jestli nepřeplácíte.</td></tr>`;

async function ochutnavka(soKod, cil, { start = performance.now(), obrys: znamy, rodinny = true } = {}) {
  OCH_KONEC = start + 5000;
  cil.innerHTML = `<p class="tlumene">Prověřujeme povodně, hluk, radon, územní plán a okolí…</p>`;
  try {
    const dum = znamy || (await ochVolej(`${OCH.RUIAN}/3/query`, { where: `kod=${Number(soKod)}`, outFields: "kod", returnGeometry: true, outSR: 5514 }, 3000)).features?.[0]?.geometry?.rings;
    if (!dum) throw new Error("obrys budovy v RÚIAN chybí");
    // Letecký snímek ČÚZK, dům tyrkysově a šrafovaně (výřez 140 × 100 m kolem domu).
    const [cx, cy] = ochStred(dum), w = 140, h = 100, bbox = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    const obr = `${OCH.ORTOFOTO}/export?bbox=${bbox.join(",")}&bboxSR=5514&imageSR=5514&size=700,500&format=jpg&f=image`;
    const sx = (x) => ((x - bbox[0]) / w * 700).toFixed(1), sy = (y) => ((bbox[3] - y) / h * 500).toFixed(1);
    const body = dum.map((r) => r.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" "));
    const obrys = `<defs><pattern id="och-sraf" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="rgba(40,220,255,.25)"/><line x1="0" y1="0" x2="0" y2="8" stroke="#28dcff" stroke-width="3"/></pattern></defs>` +
      body.map((b) => `<polygon points="${b}" fill="url(#och-sraf)" stroke="#0a1e3c" stroke-width="6"/><polygon points="${b}" fill="none" stroke="#28dcff" stroke-width="3"/>`).join("");
    const oblasti = ochutnavkaOblasti(dum, rodinny);
    cil.innerHTML = `<details class="sbal ochutnavka" open>
      <summary><span class="hlavicka-sbal"><h2>Přehled zdarma</h2><span class="shrnuti">prověřujeme…</span></span><span class="prepinac" aria-hidden="true"></span></summary>
      <figure class="och-snimek"><img src="${obr}" alt="Letecký snímek okolí domu" width="700" height="500">
        <svg viewBox="0 0 700 500" aria-hidden="true">${obrys}</svg><figcaption>Letecký snímek ČÚZK, prověřovaný dům tyrkysově.</figcaption></figure>
      <table class="och-tabulka"><tbody>
        ${Object.keys(oblasti).map((n) => `<tr class="och-ceka" data-oblast="${esc(n)}"><th scope="row">${esc(n)}</th><td><span class="och-znacka ceka">Prověřujeme</span></td><td><span class="och-nacitani"></span></td></tr>`).join("")}
        ${OCH_ZAMCENE}
      </tbody></table>
      <p class="tlumene">Z veřejných map (Geoportál hl. m. Prahy, ČGS, IPR Praha, ČÚZK) k dnešnímu dni. Orientační přehled pro celý dům; plná Prověrka posuzuje i pozemky, zdroje hluku a výšku nad hladinou. Není to právní ani znalecký posudek.</p>
    </details>`;
    const hotove = {};
    const vypln = (x) => {
      if (hotove[x.oblast]) return;
      hotove[x.oblast] = x;
      const tr = cil.querySelector(`tr[data-oblast="${x.oblast}"]`);
      tr.classList.remove("och-ceka");
      tr.innerHTML = `<th scope="row">${esc(x.oblast)}</th><td><span class="och-znacka ${x.barva}">${x.stav}</span></td><td>${esc(x.text)}</td>`;
    };
    const nestihlo = (n) => ({ oblast: n, barva: "seda", stav: OCH_STAV.seda, text: "Mapová služba teď neodpověděla včas; ověříme v Prověrce." });
    await Promise.race([
      Promise.all(Object.entries(oblasti).map(([n, p]) => p.then(vypln, () => vypln(nestihlo(n))))),
      new Promise((r) => setTimeout(r, Math.max(0, OCH_KONEC - performance.now()))),
    ]);
    Object.keys(oblasti).forEach((n) => vypln(nestihlo(n)));   // co nestihlo do 5 s
    const vsechny = Object.values(hotove);
    const pocty = ["cervena", "oranzova", "zelena", "seda"].map((k) => [k, vsechny.filter((x) => x.barva === k).length]).filter(([, n]) => n);
    cil.querySelector(".shrnuti").textContent = pocty.map(([k, n]) => `${n}×\u00a0${OCH_STAV[k].toLowerCase().replace(" ", "\u00a0")}`).join(" · ");
    cil.dispatchEvent(new CustomEvent("ochutnavka-hotovo", { detail: { oblasti: vsechny, ms: Math.round(performance.now() - start) }, bubbles: true }));
  } catch (e) {
    cil.innerHTML = `<p class="poznamka">Přehled se teď nepodařilo načíst (${esc(e.message)}). Zkuste to prosím za chvíli znovu.</p>`;
  } finally {
    OCH_KONEC = Infinity;
  }
}
