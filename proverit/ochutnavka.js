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
const OCH_RADON = { 1: "zelena", 2: "zelena", 3: "oranzova" };
const OCH_AREALY = {
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(102 + i), [100, "průmyslový areál"]])),
  "111": [300, "chov hospodářských zvířat (zápach)"], "303": [200, "stadion (hluk při akcích)"],
  "305": [300, "auto-moto areál (hluk)"], "307": [500, "střelnice (hluk)"], "315": [200, "zábavní park (hluk)"],
  "403": [100, "depo dopravy"], "404": [100, "technické služby"], "406": [300, "čistírna odpadních vod (zápach)"],
  "408": [100, "autobusové nádraží"], "409": [100, "čerpací stanice pohonných hmot"], "411": [100, "vysílač"],
  "414": [200, "věznice"], "415": [200, "kasárny, vojenský objekt"],
};

// ---------- dotazy ----------
async function ochVolej(url, params, ms = 12000, pokus = 1) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { method: "POST", body: new URLSearchParams({ f: "json", ...params }), signal: ctrl.signal });
    if (!r.ok) throw new Error(`služba odpověděla ${r.status}`);
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || "chyba služby");
    return d;
  } catch (e) {
    if (pokus < 2) return ochVolej(url, params, ms, pokus + 1);  // jedno opakování při výpadku nebo vypršení
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
async function ochVzdalenostKVrstve(vrstva, dum, maxM) {
  const f = await ochPrvky(vrstva, dum, { vzdalenost: maxM, pole: "*", geometrie: true });
  if (!f.length) return null;
  const d = f.map((x) => x.geometry ? ochVzdalenost(dum, x.geometry) : null).filter((x) => x !== null);
  if (d.length) return Math.min(...d);
  if (await ochPocet(vrstva, dum)) return 0;
  let lo = 0, hi = maxM;
  while (hi - lo > 2) { const mid = (lo + hi) / 2; if (await ochPocet(vrstva, dum, mid)) hi = mid; else lo = mid; }
  return hi;
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

async function ochutnavkaVyhodnot(dum, jeDum) {
  const maxPasmo = async (vrstva, pole) => {
    const h = (await ochPrvky(vrstva, dum, { pole })).map((f) => parseFloat(f.attributes[pole])).filter((x) => !isNaN(x));
    return h.length ? Math.max(...h) : null;
  };
  const stred = ochStred(dum);
  const ulohy = {
    q100: ochVzdalenostKVrstve(`${OCH.ZAPLAVY}/9`, dum, 300),
    q2002: ochVzdalenostKVrstve(`${OCH.ZAPLAVY}/10`, dum, 300),
    aktivni: ochPocet(`${OCH.ZAPLAVY}/18`, dum),
    lden: maxPasmo(`${OCH.HLUK}/9`, "LDEN"),
    ln: maxPasmo(`${OCH.HLUK}/10`, "IPEN"),
    radon: ochVolej(`${OCH.RADON}/1/query`, { where: "1=1", outFields: "radon_idx,radon_popis", returnGeometry: false,
      geometry: JSON.stringify({ x: stred[0], y: stred[1], spatialReference: { wkid: 5514 } }), geometryType: "esriGeometryPoint",
      inSR: 5514, spatialRel: "esriSpatialRelIntersects" }).then((d) => d.features || []),
    lokality: (async () => {
      const url = `${OCH.MPP}/MPP_CUR_MPP_300_LOKALITY_P/FeatureServer/0`;
      const [dom, f] = await Promise.all([ochDomeny(url), ochPrvky(url, dum, { pole: "nazev,stabilita,vyuziti_lok" })]);
      return f.map((x) => ({ nazev: x.attributes.nazev, stabilita: dom.stabilita?.[x.attributes.stabilita] ?? x.attributes.stabilita,
                             vyuziti: dom.vyuziti_lok?.[x.attributes.vyuziti_lok] ?? x.attributes.vyuziti_lok }));
    })(),
    koridory: (async () => {
      const f = await ochPrvky(`${OCH.MPP}/MPP_CUR_MPP_600_DI_KORIDORY_P/FeatureServer/0`, dum, { vzdalenost: 100, pole: "objectid", geometrie: true });
      const d = f.map((x) => x.geometry ? ochVzdalenost(dum, x.geometry) : null).filter((x) => x !== null);
      return d.length ? Math.min(...d) : null;
    })(),
    vvn: ochVzdalenostKVrstve(`${OCH.ELEKTRINA}/13`, dum, 300),
    arealy: ochPrvky(`${OCH.ZABAGED}/114`, dum, { vzdalenost: 500, pole: "typzast_k", geometrie: true }),
  };
  const klice = Object.keys(ulohy);
  const v = Object.fromEntries((await Promise.allSettled(Object.values(ulohy))).map((r, i) => [klice[i], r]));
  const o = [];

  if (!ochOk(v.q100) || !ochOk(v.q2002)) o.push(["Povodně", "seda", "Mapa záplav teď neodpovídá; ověříme v Prověrce."]);
  else {
    const d100 = v.q100.value, d2002 = v.q2002.value, akt = ochOk(v.aktivni) && v.aktivni.value > 0;
    if (akt || d100 === 0) o.push(["Povodně", "cervena", "Dům leží v záplavovém území stoleté vody" + (akt ? " (aktivní zóna)." : ".")]);
    else if (d2002 === 0) o.push(["Povodně", "oranzova", "Dům je mimo stoletou vodu, ale v rozlivu povodně 2002" + (d100 ? ` (stoletá voda ${Math.round(d100)} m).` : ".")]);
    else o.push(["Povodně", "zelena", "Mimo záplavové území" + (d100 ? `, hranice stoleté vody ${Math.round(d100)} m od domu.` : ", hranice dál než 300 m.")]);
  }
  if (!ochOk(v.lden) || !ochOk(v.ln)) o.push(["Hluk", "seda", "Hluková mapa teď neodpovídá; ověříme v Prověrce."]);
  else {
    const b = ochBarvaHluku(v.lden.value, v.ln.value);
    o.push(["Hluk", b, `U nejhlučnější fasády ve dne ${ochPasmo(v.lden.value)}, v noci ${ochPasmo(v.ln.value)}` + (b !== "zelena" ? " – nad doporučením WHO." : ".")]);
  }
  if (!ochOk(v.radon) || !v.radon.value.length) o.push(["Radon", "seda", "Mapa radonu pro tento bod nemá údaj."]);
  else {
    const a = v.radon.value[0].attributes, idx = a.radon_idx;
    o.push(["Radon", OCH_RADON[idx] || "seda", `Radonový index podloží ${a.radon_popis || idx} (${idx} ze 3); o domě rozhodne měření.`]);
  }
  if (!ochOk(v.lokality) || !v.lokality.value.length) o.push(["Územní plán", "seda", "Metropolitní plán teď neodpovídá; ověříme v Prověrce."]);
  else {
    const l = v.lokality.value[0], kor = ochOk(v.koridory) ? v.koridory.value : null;
    let t = [`Lokalita ${l.nazev || ""}`.trim(), [l.stabilita, l.vyuziti].filter(Boolean).join(", ")].filter(Boolean).join(": ");
    if (kor !== null) t += `; dopravní koridor ${Math.round(kor)} m od domu`;
    o.push(["Územní plán", String(l.stabilita).startsWith("stabilizovan") && kor === null ? "zelena" : "oranzova", t + "."]);
  }
  const nalezy = []; let barva = "zelena";
  if (ochOk(v.vvn) && v.vvn.value !== null) {
    nalezy.push(`vedení velmi vysokého napětí ${Math.round(v.vvn.value)} m od domu` + (v.vvn.value > 25 ? " (mimo ochranné pásmo)" : ""));
    if (v.vvn.value <= 25) barva = "oranzova";
  }
  if (ochOk(v.arealy)) for (const f of v.arealy.value) {
    const def = OCH_AREALY[String(f.attributes.typzast_k)]; if (!def || !f.geometry) continue;
    const d = Math.round(ochVzdalenost(dum, f.geometry));
    if (d <= def[0]) { nalezy.push(`${def[1]} ${d} m`); barva = "oranzova"; }
  }
  o.push(["Okolí", barva, nalezy.length ? `V okolí: ${[...new Set(nalezy)].join("; ")}.` : "Bez průmyslu, čistírny, střelnice či vedení velmi vysokého napětí v blízkosti."]);
  return o.map(([oblast, b, text]) => ({ oblast, barva: b, stav: OCH_STAV[b], text }));
}

// ---------- zobrazení ----------
async function ochutnavka(soKod, cil) {
  cil.innerHTML = `<p class="tlumene">Prověřujeme povodně, hluk, radon, územní plán a okolí…</p>`;
  const start = performance.now();
  try {
    const d = await ochVolej(`${OCH.RUIAN}/3/query`, { where: `kod=${Number(soKod)}`, outFields: "kod", returnGeometry: true, outSR: 5514 });
    const dum = d.features?.[0]?.geometry?.rings;
    if (!dum) throw new Error("obrys budovy v RÚIAN chybí");
    const oblasti = await ochutnavkaVyhodnot(dum);
    const s = ((performance.now() - start) / 1000).toFixed(1).replace(".", ",");
    // Letecký snímek ČÚZK s obrysem domu (výřez 140 × 100 m kolem domu).
    const [cx, cy] = ochStred(dum), w = 140, h = 100, bbox = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    const obr = `${OCH.ORTOFOTO}/export?bbox=${bbox.join(",")}&bboxSR=5514&imageSR=5514&size=700,500&format=jpg&f=image`;
    const sx = (x) => ((x - bbox[0]) / w * 700).toFixed(1), sy = (y) => ((bbox[3] - y) / h * 500).toFixed(1);
    const obrys = dum.map((r) => `<polygon points="${r.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")}" fill="none" stroke="#fff" stroke-width="3"/>`).join("");
    const pocty = ["cervena", "oranzova", "zelena", "seda"].map((k) => [k, oblasti.filter((x) => x.barva === k).length]).filter(([, n]) => n);
    const shrnuti = pocty.map(([k, n]) => `${n}× ${OCH_STAV[k].toLowerCase()}`).join(" · ");
    cil.innerHTML = `<details class="sbal ochutnavka" open>
      <summary><span class="hlavicka-sbal"><h2>Přehled zdarma</h2><span class="shrnuti">${shrnuti}</span></span><span class="prepinac" aria-hidden="true"></span></summary>
      <figure class="och-snimek"><img src="${obr}" alt="Letecký snímek okolí domu" width="700" height="500" loading="lazy">
        <svg viewBox="0 0 700 500" aria-hidden="true">${obrys}</svg><figcaption>Letecký snímek ČÚZK, bíle obrys domu.</figcaption></figure>
      <table class="och-tabulka"><tbody>
        ${oblasti.map((x) => `<tr><th scope="row">${esc(x.oblast)}</th><td><span class="och-znacka ${x.barva}">${x.stav}</span></td><td>${esc(x.text)}</td></tr>`).join("")}
        <tr class="och-zamceno"><th scope="row">Právní stav</th><td><span class="och-znacka zam">v Prověrce</span></td><td>Věcná břemena, zástavy, exekuce a plomby z výpisu z katastru, insolvence majitele.</td></tr>
        <tr class="och-zamceno"><th scope="row">Cena</th><td><span class="och-znacka zam">v PLUS</span></td><td>Odhad ze skutečných prodejů v katastru a srovnání s cenou v inzerátu.</td></tr>
        <tr class="och-zamceno"><th scope="row">Co udělat</th><td><span class="och-znacka zam">v Prověrce</span></td><td>Verdikt jednou větou a úkoly na míru před rezervací, podpisem a převodem.</td></tr>
      </tbody></table>
      <p class="tlumene">Hotovo za ${s} s z veřejných map (Geoportál hl. m. Prahy, ČGS, IPR Praha, ČÚZK) k dnešnímu dni. Orientační přehled pro celý dům; plná Prověrka posuzuje i pozemky, zdroje hluku a výšku nad hladinou. Není to právní ani znalecký posudek.</p>
    </details>`;
  } catch (e) {
    cil.innerHTML = `<p class="poznamka">Přehled se teď nepodařilo načíst (${esc(e.message)}). Zkuste to prosím za chvíli znovu.</p>`;
  }
}
