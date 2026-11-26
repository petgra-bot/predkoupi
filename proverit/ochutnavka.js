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
  UAP: "https://gs-pub.praha.eu/arcgis/rest/services/uap/zamery/MapServer",
  // Okolí Prahy (okresy Praha-východ a Praha-západ, Petr 21. 11. 2026): celostátní záplavová území a hlukové mapy MZd.
  VUV: "https://ags.vuv.cz/arcgis/rest/services/isvs_voda/isvs_voda/MapServer",
  MZD: "https://geoportal.mzcr.cz/server/rest/services/SHM2022",
};
const OCH_HLUK_OKOLI = ["Silnice", "Zeleznice", "Letiste", "Aglomerace_Silnice", "Aglomerace_Zeleznice"];
// Plánované záměry města (územně analytické podklady) – stejné vrstvy jako uzemni_plan.py; v prohlížeči jedním dotazem identify.
const OCH_UAP_VRSTVY = "all:2,3,4,5,6,7,8,9,10,12,13,14,15,16,17,18,19,21,22,23,24,25,26,27,28,29,36,37";
// Vybavenost z OpenStreetMap: předem stažené soubory na našem webu (test/vybavenost.py), každý se načte jednou za návštěvu.
// Po krajích (Petr 26. 11. 2026), aby prohlížeč v Praze nestahoval data dalších krajů; obdélníky jako v test/vybavenost.py.
const OCH_VYBAVENOST_SOUBORY = [
  ["/proverit/vybavenost.json?v=3", [49.40, 50.66, 13.29, 15.61]],              // Praha a Středočeský kraj
  ["/proverit/vybavenost-pardubicky.json?v=1", [49.47, 50.28, 15.30, 17.00]],   // Pardubický kraj
];
const ochVybavenostSliby = {};
const OCH_VYBAVENOST = (url) => (ochVybavenostSliby[url] ||= fetch(url).then((r) => {
  if (!r.ok) { delete ochVybavenostSliby[url]; throw new Error(`vybavenost ${r.status}`); }
  return r.json();
}));
const OCH_STAV = { zelena: "V pořádku", oranzova: "Ověřit", cervena: "Riziko", seda: "Nezjištěno", info: "Informace" };
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
// Ochutnávka má na všechno nejvýš 10 s (Petr 13. 11. 2026: 5 s; 15. 11.: 7 s; 21. 11.: 10 s kvůli vybavenosti): dotazy se ukončí v termínu OCH_KONEC.
// Každá oblast se ukáže, jakmile je hotová, takže pomalejší řádek nezdrží ostatní.
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

// Hluk z rastrů MZd: nejhorší pásmo na obrysu domu (getSamples = jeden dotaz na rastr), horní mez pásma z tabulky atributů.
async function ochHlukMzd(dum, ukazatel) {
  const body = dum[0].filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 8)) === 0).concat([ochStred(dum)]);
  const geom = JSON.stringify({ points: body, spatialReference: { wkid: 5514 } });
  const jeden = async (zdroj) => {
    const url = `${OCH.MZD}/${zdroj}_${ukazatel}/ImageServer`;
    const [tab, s] = await Promise.all([ochVolej(`${url}/rasterAttributeTable`, {}), ochVolej(`${url}/getSamples`,
      { geometry: geom, geometryType: "esriGeometryMultipoint", returnFirstValueOnly: true })]);
    const horni = Object.fromEntries((tab.features || []).map((f) => [String(f.attributes.Value), parseFloat(f.attributes.LDEN || f.attributes.IPEN)]));
    return Math.max(0, ...(s.samples || []).map((x) => horni[String(x.value).split(".")[0]] || 0)) || null;
  };
  const r = await Promise.allSettled(OCH_HLUK_OKOLI.map(jeden));
  if (r.every((x) => x.status === "rejected")) throw new Error("hluková mapa neodpověděla");
  return Math.max(0, ...r.filter(ochOk).map((x) => x.value || 0)) || null;
}

// Okolí Prahy: stejné řádky jako v Praze, ale z celostátních map; územní plán obce neověřujeme (Petr 21. 11. 2026).
function ochutnavkaOkoli(dum, rodinny, obec) {
  const radek = (oblast, barva, text) => ({ oblast, barva, stav: OCH_STAV[barva], text });
  const povodne = (async () => {
    const [d100, d20, d5, akt, d500] = await Promise.all([13, 14, 15, 11, 12].map((v) => ochVzdalenostKVrstve(`${OCH.VUV}/${v}`, dum, 300)));
    if (akt === 0 || d5 === 0 || d20 === 0) return radek("Povodně", "cervena", "Dům leží v záplavovém území častých povodní (aktivní zóna nebo 5–20letá voda).");
    if (d100 === 0) return radek("Povodně", "cervena", "Dům leží v záplavovém území stoleté vody.");
    if (d500 === 0) return radek("Povodně", "oranzova", "Dům je mimo stoletou vodu, ale v rozlivu 500leté vody" + (d100 ? ` (stoletá voda ${Math.round(d100)} m).` : "."));
    if (d100 !== null && d100 <= 50) return radek("Povodně", "oranzova", `Hranice stoleté vody ${Math.round(d100)} m od domu; výšku domu nad hladinou ověříme v Prověrce.`);
    return radek("Povodně", "zelena", "Mimo stanovené záplavové území" + (d100 ? `, hranice stoleté vody ${Math.round(d100)} m od domu.` : ", hranice dál než 300 m."));
  })();
  const hluk = (async () => {
    const [lden, ln] = await Promise.all([ochHlukMzd(dum, "Ldvn"), ochHlukMzd(dum, "Ln")]);
    if (!lden && !ln) return radek("Hluk", "zelena", "Mimo hlavní silnice, železnice a letiště, pro které hlukové mapy existují; místní provoz ověřte při prohlídce.");
    const b = ochBarvaHluku(lden, ln);
    return radek("Hluk", b, `U nejhlučnější fasády celodenní průměr ${ochPasmo(lden)}, v noci ${ochPasmo(ln)}` + (b !== "zelena" ? " – nad doporučením WHO." : "."));
  })();
  const plan = Promise.resolve(radek("Územní plán", "seda",
    `Územní plán obce${obec ? " " + obec : ""} neprověřujeme – podívejte se do platného plánu obce (web obce nebo mapový portál kraje).`));
  const okoli = (async () => {
    const [vedeni, arealy] = await Promise.all([ochPrvky(`${OCH.ZABAGED}/88`, dum, { vzdalenost: 300, pole: "napeti", geometrie: true }).catch(() => []),
      ochPrvky(`${OCH.ZABAGED}/114`, dum, { vzdalenost: 500, pole: "typzast_k", geometrie: true }).catch(() => [])]);
    const nalezy = []; let barva = "zelena";
    const vvn = vedeni.filter((f) => f.geometry && parseInt(f.attributes.napeti) >= 110).map((f) => ochVzdalenost(dum, f.geometry));
    if (vvn.length) { const d = Math.round(Math.min(...vvn)); nalezy.push(`vedení velmi vysokého napětí ${d} m od domu` + (d > 25 ? " (mimo ochranné pásmo)" : "")); if (d <= 25) barva = "oranzova"; }
    for (const f of arealy) {
      const def = OCH_AREALY[String(f.attributes.typzast_k)]; if (!def || !f.geometry) continue;
      const d = Math.round(ochVzdalenost(dum, f.geometry));
      if (d <= def[0]) { nalezy.push(`${def[1]} ${d} m`); barva = "oranzova"; }
    }
    return radek("Rizika v okolí", barva, nalezy.length ? `V okolí: ${[...new Set(nalezy)].join("; ")}.` : "Bez průmyslu, čistírny, střelnice či vedení velmi vysokého napětí v blízkosti.");
  })();
  const stavby = Promise.resolve(radek("Plánované stavby", "seda", "Záměry kraje a obce v přehledu neprověřujeme; posudky vlivu na okolí (EIA) prověříme v Prověrce."));
  return { povodne, hluk, plan, okoli, stavby };
}

// Každá oblast je samostatný slib: na webu se ukáže, jakmile je hotová (průběžné zobrazení, 13. 11. 2026).
function ochutnavkaOblasti(dum, rodinny = true, oblast = "praha", obec = "") {
  const maxPasmo = async (vrstva, pole) => {
    const h = (await ochPrvky(vrstva, dum, { pole })).map((f) => parseFloat(f.attributes[pole])).filter((x) => !isNaN(x));
    return h.length ? Math.max(...h) : null;
  };
  const stred = ochStred(dum);
  const radek = (oblast, barva, text) => ({ oblast, barva, stav: OCH_STAV[barva], text });
  const povodne = oblast === "okoli" ? null : (async () => {
    // Stejná pravidla jako placený report (povodne_hluk.py, D12 20. 11. 2026): ochrana městem → oranžová, hranice stoleté
    // vody do 50 m → oranžová (výšku domu nad hladinou ověří až Prověrka).
    const [d100, d2002, akt, chraneno] = await Promise.all([ochVzdalenostKVrstve(`${OCH.ZAPLAVY}/9`, dum, 300),
      ochVzdalenostKVrstve(`${OCH.ZAPLAVY}/10`, dum, 300), ochPocet(`${OCH.ZAPLAVY}/18`, dum).catch(() => 0),
      ochVolej(`${OCH.ZAPLAVY}/19/query`, { where: "KATEG=4", returnCountOnly: true, ...ochGeom(dum) }).then((x) => (x.count || 0) > 0).catch(() => false)]);
    if (akt > 0) return radek("Povodně", "cervena", "Dům leží v aktivní zóně záplavového území.");
    if (d100 === 0) return chraneno
      ? radek("Povodně", "oranzova", "Dům leží v záplavovém území stoleté vody, území chrání protipovodňová opatření města.")
      : radek("Povodně", "cervena", "Dům leží v záplavovém území stoleté vody.");
    if (d2002 === 0) return radek("Povodně", "oranzova", "Dům je mimo stoletou vodu, ale v rozlivu povodně 2002" + (d100 ? ` (stoletá voda ${Math.round(d100)} m).` : "."));
    if (d100 !== null && d100 <= 50) return radek("Povodně", "oranzova", `Hranice stoleté vody ${Math.round(d100)} m od domu; výšku domu nad hladinou ověříme v Prověrce.`);
    return radek("Povodně", "zelena", "Mimo záplavové území" + (d100 ? `, hranice stoleté vody ${Math.round(d100)} m od domu.` : ", hranice dál než 300 m."));
  })();
  const hluk = oblast === "okoli" ? null : (async () => {
    const [lden, ln] = await Promise.all([maxPasmo(`${OCH.HLUK}/9`, "LDEN"), maxPasmo(`${OCH.HLUK}/10`, "IPEN")]);
    const b = ochBarvaHluku(lden, ln);
    return radek("Hluk", b, `U nejhlučnější fasády celodenní průměr ${ochPasmo(lden)}, v noci ${ochPasmo(ln)}` + (b !== "zelena" ? " – nad doporučením WHO." : "."));
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
  const plan = oblast === "okoli" ? null : (async () => {
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
  const okoli = oblast === "okoli" ? null : (async () => {
    const [vvn, arealy] = await Promise.all([ochVzdalenostKVrstve(`${OCH.ELEKTRINA}/13`, dum, 300, true).catch(() => null),
      ochPrvky(`${OCH.ZABAGED}/114`, dum, { vzdalenost: 500, pole: "typzast_k", geometrie: true }).catch(() => [])]);
    const nalezy = []; let barva = "zelena";
    if (vvn !== null) { nalezy.push(`vedení velmi vysokého napětí ${Math.round(vvn)} m od domu` + (vvn > 25 ? " (mimo ochranné pásmo)" : "")); if (vvn <= 25) barva = "oranzova"; }
    for (const f of arealy) {
      const def = OCH_AREALY[String(f.attributes.typzast_k)]; if (!def || !f.geometry) continue;
      const d = Math.round(ochVzdalenost(dum, f.geometry));
      if (d <= def[0]) { nalezy.push(`${def[1]} ${d} m`); barva = "oranzova"; }
    }
    return radek("Rizika v okolí", barva, nalezy.length ? `V okolí: ${[...new Set(nalezy)].join("; ")}.` : "Bez průmyslu, čistírny, střelnice či vedení velmi vysokého napětí v blízkosti.");
  })();
  const stavby = oblast === "okoli" ? null : (async () => {
    // Záměry do 300 m (identify: tolerance v pixelech, 1 px = 1 m). Posudky EIA jen v Prověrce – portál CENIA z prohlížeče číst nejde.
    const [x, y] = stred;
    const d = await ochVolej(`${OCH.UAP}/identify`, { geometry: JSON.stringify({ x, y }), geometryType: "esriGeometryPoint", sr: 5514,
      layers: OCH_UAP_VRSTVY, tolerance: 300, mapExtent: `${x - 500},${y - 500},${x + 500},${y + 500}`, imageDisplay: "1000,1000,96",
      returnGeometry: true, maxAllowableOffset: 5 });
    const veta = (s) => s && s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase().replace(/([–-]\s+)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : s;
    const zamery = new Map();
    for (const r of d.results || []) {
      if (!r.geometry) continue;
      const a = r.attributes || {}, vzd = Math.round(ochVzdalenost(dum, r.geometry));
      if (vzd > 300) continue;
      const kod = a["Kód"] || a.KOD_ZAM || `${r.layerId}-${a.OBJECTID}`;
      const z = { nazev: veta(a["Název"] || a.NAZEV_ZAM || "záměr"), co: [a["Využití"] || a.VYUZITI_ZAM, a["Fáze"] || a.FAZE_ZAM].filter(Boolean).join(", "), vzd };
      if (!zamery.has(kod) || zamery.get(kod).vzd > vzd) zamery.set(kod, z);
    }
    const z = [...zamery.values()].sort((a, b) => a.vzd - b.vzd);
    if (!z.length) return radek("Plánované stavby", "zelena", "Do 300 m od domu město neeviduje plánované stavby ani dopravní záměry.");
    const seznam = z.slice(0, 3).map((x) => `${x.nazev}${x.co ? ` (${x.co})` : ""} ${x.vzd < 1 ? "zasahuje k domu" : `${x.vzd} m`}`).join("; ");
    return radek("Plánované stavby", z[0].vzd <= 100 ? "oranzova" : "info",
      `Plánované záměry do 300 m: ${seznam}${z.length > 3 ? ` a další ${z.length - 3}` : ""}. Posudky vlivu na okolí prověříme v Prověrce.`);
  })();
  const vybavenost = (async () => {
    // Souřadnice domu ve WGS84 z RÚIAN (body OpenStreetMap jsou ve WGS84); soubor s body se načítá souběžně.
    const hlavni = OCH_VYBAVENOST(OCH_VYBAVENOST_SOUBORY[0][0]);   // většina adres je v Praze – načítat hned souběžně
    const [x, y] = stred;
    const b = await ochVolej(`${OCH.RUIAN}/3/query`, { geometry: JSON.stringify({ x, y, spatialReference: { wkid: 5514 } }), geometryType: "esriGeometryPoint",
      inSR: 5514, spatialRel: "esriSpatialRelIntersects", distance: 30, units: "esriSRUnit_Meter", outFields: "kod", returnGeometry: true, outSR: 4326 });
    const body = (b.features?.[0]?.geometry?.rings || []).flat();
    if (!body.length) throw new Error("souřadnice domu chybí");
    const lon = body.reduce((s, p) => s + p[0], 0) / body.length, lat = body.reduce((s, p) => s + p[1], 0) / body.length;
    // Body z předem staženého souboru (OpenStreetMap, test/vybavenost.py): z prohlížeče byl Overpass pomalý a často
    // neodpověděl vůbec (Petr 21. 11. 2026). Nejbližší místa počítáme tady, žádný další dotaz.
    // Soubory krajů, do jejichž obdélníku dům padne (u hranice i oba), sloučené do jednoho seznamu bodů.
    const urls = OCH_VYBAVENOST_SOUBORY.filter(([, [j, sv, z, v]]) => lat >= j && lat <= sv && lon >= z && lon <= v).map(([u]) => u);
    const casti = await Promise.all((urls.length ? urls : [OCH_VYBAVENOST_SOUBORY[0][0]]).map((u) => u === OCH_VYBAVENOST_SOUBORY[0][0] ? hlavni : OCH_VYBAVENOST(u)));
    const data = {};
    for (const c of casti) for (const [k, v] of Object.entries(c)) if (Array.isArray(v)) (data[k] ||= []).push(...v);
    const km = (la, lo) => { const k = Math.PI / 180, a = Math.sin((la - lat) * k / 2) ** 2 + Math.cos(lat * k) * Math.cos(la * k) * Math.sin((lo - lon) * k / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(a)); };
    const NAZVY = { p: "potraviny", s: "škola", k: "školka", a: "lékárna", h: "hřiště nebo park",
      m: "metro", v: "vlak", t: "tramvaj", z: "autobus" };
    const nej = {};
    for (const [kod, nazev] of Object.entries(NAZVY)) {
      const b = data[kod] || [];
      for (let i = 0; i < b.length; i += 2) {
        if (Math.abs(b[i] - lat) > 0.03 || Math.abs(b[i + 1] - lon) > 0.045) continue;   // rychlé síto ~3 km
        const d = km(b[i], b[i + 1]);
        if (d <= 3000 && (!(nazev in nej) || d < nej[nazev])) nej[nazev] = Math.round(d);
      }
    }
    const zaokr = (d) => d < 100 ? `${Math.max(10, Math.round(d / 10) * 10)} m` : d < 1000 ? `${Math.round(d / 50) * 50} m`
      : `${(Math.round(d / 100) / 10).toLocaleString("cs-CZ")} km`;
    const vzd = (n) => n in nej ? zaokr(nej[n]) : "dál než 3 km";
    // Rozšířeno 21. 11. 2026 (recenze): lékárna, hřiště nebo park a druh dopravy (metro, vlak, tramvaj, autobus).
    const zakl = ["potraviny", "škola", "školka", "lékárna", "hřiště nebo park"].map((n) => `${n} ${vzd(n)}`).join(" · ");
    const doprava = ["metro", "vlak", "tramvaj", "autobus"].filter((n) => (nej[n] ?? 1e9) <= 1000).map((n) => `${n} ${zaokr(nej[n])}`);
    const zastavka = Math.min(...["metro", "vlak", "tramvaj", "autobus"].map((n) => nej[n] ?? 1e9));
    const text = `${zakl} · doprava: ${doprava.length ? doprava.join(", ") : `nejbližší zastávka ${zastavka < 1e9 ? zaokr(zastavka) : "dál než 3 km"}`}`;
    // Barva (Petr 21. 11. 2026, Zvánovice): pozor, když je daleko obchod nebo zastávka (nad 1,5 km), nebo když jsou
    // aspoň 3 z 5 základních míst (potraviny, škola, školka, lékárna, zastávka) dál než 1 km. Riziko nikdy – je to
    // vlastnost místa, kterou kupující volí, ne vada nemovitosti.
    const daleko = [nej["potraviny"], nej["škola"], nej["školka"], nej["lékárna"], zastavka].filter((d) => (d ?? 1e9) > 1000).length;
    const pozor = (nej["potraviny"] ?? 1e9) > 1500 || zastavka > 1500 || daleko >= 3;
    return radek("Vybavenost", pozor ? "oranzova" : "zelena", `Nejblíž vzdušnou čarou: ${text}.` + (pozor ? " Na běžné nákupy a do školy budete nejspíš jezdit autem." : ""));
  })();
  let { povodne: pov, hluk: hl, plan: pl, okoli: ok, stavby: st } = oblast === "okoli" ? ochutnavkaOkoli(dum, rodinny, obec)
    : { povodne, hluk, plan, okoli, stavby };
  // Povodně a radon jednou řádkou jako v reportu (oblast „Povodně a radon“, Petr 21. 11. 2026): horší barva rozhoduje.
  const PORADI = { cervena: 0, oranzova: 1, seda: 2, zelena: 3, info: 4 };
  const povodneRadon = Promise.allSettled([pov, radon]).then(([pv, rd]) => {
    const casti = [pv.status === "fulfilled" ? pv.value : { barva: "seda", text: "Mapa záplav teď neodpověděla; ověříme v Prověrce." },
      rd.status === "fulfilled" ? rd.value : { barva: "seda", text: "Mapa radonu teď neodpověděla." }];
    const barva = casti.map((c) => c.barva).sort((a, b) => PORADI[a] - PORADI[b])[0];
    return radek("Povodně a radon", barva, `Povodně: ${casti[0].text.replace(/^./, (c) => c.toLowerCase())} Radon: ${casti[1].text.replace(/^Radonový index/, "index").replace(/^./, (c) => c.toLowerCase())}`);
  });
  return { "Povodně a radon": povodneRadon, "Hluk": hl, "Územní plán": pl, "Rizika v okolí": ok, "Vybavenost": vybavenost, "Plánované stavby": st };
}

// ---------- zobrazení ----------
const OCH_ZAMCENE = `
  <tr class="och-zamceno"><th scope="row">Zápisy v katastru</th><td><span class="och-znacka zam">V Prověrce</span></td><td>Věcná břemena, zástavy, exekuce a plomby z výpisu z katastru staženého v den prověrky.</td></tr>
  <tr class="och-zamceno"><th scope="row">Vlastník</th><td><span class="och-znacka zam">V Prověrce</span></td><td>Insolvence prodávajícího; v Prověrce PLUS navíc evidence exekucí.</td></tr>
  <tr class="och-zamceno"><th scope="row">Co udělat</th><td><span class="och-znacka zam">V Prověrce</span></td><td>Verdikt jednou větou a úkoly na míru před rezervací, podpisem a převodem.</td></tr>
  <tr class="och-zamceno och-cena"><th scope="row">Cena</th><td><span class="och-znacka zam">V Prověrce PLUS</span></td><td>Odhad ze skutečných prodejů v domě a okolí (katastr) proti ceně v inzerátu – víte, jestli nepřeplácíte.</td></tr>`;

async function ochutnavka(soKod, cil, { start = performance.now(), obrys: znamy, rodinny = true, adresa = "", oblast = "praha", obec = "" } = {}) {
  OCH_KONEC = start + 10000;
  cil.innerHTML = `<p class="tlumene">Prověřujeme povodně, hluk, radon, územní plán, okolí a vybavenost…</p>`;
  try {
    const dum = znamy || (await ochVolej(`${OCH.RUIAN}/3/query`, { where: `kod=${Number(soKod)}`, outFields: "kod", returnGeometry: true, outSR: 5514 }, 3000)).features?.[0]?.geometry?.rings;
    if (!dum) throw new Error("obrys budovy v RÚIAN chybí");
    cil.dataset.obrys = JSON.stringify(dum.map((r) => r.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])));   // pro stránku průběhu
    // Letecký snímek ČÚZK, dům bíle a šrafovaně s tmavým lemem (Petr 14. 11.: zpět k bílé; výřez 140 × 100 m kolem domu).
    const [cx, cy] = ochStred(dum), w = 140, h = 100, bbox = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    const obr = `${OCH.ORTOFOTO}/export?bbox=${bbox.join(",")}&bboxSR=5514&imageSR=5514&size=700,500&format=jpg&f=image`;
    const sx = (x) => ((x - bbox[0]) / w * 700).toFixed(1), sy = (y) => ((bbox[3] - y) / h * 500).toFixed(1);
    const body = dum.map((r) => r.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" "));
    const obrys = `<defs><pattern id="och-sraf" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="rgba(255,255,255,.22)"/><line x1="0" y1="0" x2="0" y2="8" stroke="#fff" stroke-width="2.5"/></pattern></defs>` +
      body.map((b) => `<polygon points="${b}" fill="url(#och-sraf)" stroke="#0a1e3c" stroke-width="6"/><polygon points="${b}" fill="none" stroke="#fff" stroke-width="3"/>`).join("");
    const oblasti = ochutnavkaOblasti(dum, rodinny, oblast, obec);
    cil.innerHTML = `<details class="sbal ochutnavka" open>
      <summary><span class="hlavicka-sbal"><h2>Přehled zdarma</h2><span class="shrnuti">prověřujeme…</span></span><span class="prepinac" aria-hidden="true"></span></summary>
      <figure class="och-snimek"><img src="${obr}" alt="Letecký snímek okolí domu" width="700" height="500">
        <svg viewBox="0 0 700 500" aria-hidden="true">${obrys}</svg>${window.PRAHA?.mapka ? window.PRAHA.mapka(cx, cy, adresa, "och") : ""}<figcaption>Letecký snímek ČÚZK, prověřovaný dům bíle.</figcaption></figure>
      <table class="och-tabulka"><tbody>
        ${Object.keys(oblasti).map((n) => `<tr class="och-ceka" data-oblast="${esc(n)}"><th scope="row">${esc(n)}</th><td><span class="och-znacka ceka">Prověřujeme</span></td><td><span class="och-nacitani"></span></td></tr>`).join("")}
        ${OCH_ZAMCENE}
      </tbody></table>
      <p class="tlumene">Z veřejných map (${oblast === "okoli" ? "VÚV T. G. M., Ministerstvo zdravotnictví" : "Geoportál hl. m. Prahy, IPR Praha"}, ČGS, ČÚZK, OpenStreetMap) k dnešnímu dni. Orientační přehled pro celý dům; plná Prověrka posuzuje i pozemky, zdroje hluku a výšku nad hladinou. Není to právní ani znalecký posudek.</p>
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
      Promise.all(Object.entries(oblasti).map(([n, p]) => p.then(vypln, () => vypln(n === "Vybavenost"
        ? { oblast: n, barva: "seda", stav: OCH_STAV.seda, text: "Vybavenost se teď nepodařilo načíst." } : nestihlo(n))))),
      new Promise((r) => setTimeout(r, Math.max(0, OCH_KONEC - performance.now()))),
    ]);
    Object.keys(oblasti).forEach((n) => vypln(n === "Vybavenost" && !hotove[n]
      ? { oblast: n, barva: "seda", stav: OCH_STAV.seda, text: "Vybavenost se teď nepodařilo načíst." } : nestihlo(n)));   // co nestihlo do 10 s
    const vsechny = Object.values(hotove);
    const pocty = ["cervena", "oranzova", "zelena", "seda"].map((k) => [k, vsechny.filter((x) => x.barva === k).length]).filter(([, n]) => n);
    cil.querySelector(".shrnuti").textContent = pocty.map(([k, n]) => `${n}×\u00a0${OCH_STAV[k].toLowerCase().replace(" ", "\u00a0")}`).join(" · ");
    ochEmail(cil, vsechny, adresa);
    cil.dispatchEvent(new CustomEvent("ochutnavka-hotovo", { detail: { oblasti: vsechny, ms: Math.round(performance.now() - start) }, bubbles: true }));
  } catch (e) {
    cil.innerHTML = `<p class="poznamka">Přehled se teď nepodařilo načíst (${esc(e.message)}). Zkuste to prosím za chvíli znovu.</p>`;
  } finally {
    OCH_KONEC = Infinity;
  }
}


// ---------- přehled e-mailem (Petr 21. 11. 2026) ----------
// Bez AI: server vloží hotové řádky přehledu do e-mailu. Souhlas s tipy je zvlášť a nezaškrtnutý; bez něj se e-mail neukládá.
function ochEmail(cil, oblasti, adresa) {
  const api = window.OBJEDNAVKY?.api;
  if (!api || cil.querySelector(".och-email")) return;
  cil.querySelector(".ochutnavka").insertAdjacentHTML("beforeend", `
    <form class="och-email" novalidate>
      <label for="och-email-pole">Pošlete mi přehled e-mailem</label>
      <div class="och-email-radek"><input id="och-email-pole" type="email" autocomplete="email" inputmode="email" placeholder="vas@email.cz" required>
        <button type="submit">Poslat</button></div>
      <label class="och-email-tipy"><input type="checkbox" name="tipy"> Pošlete mi 3 tipy, na co si dát pozor při koupi bytu (odhlášení jedním kliknutím)</label>
      <p class="och-email-stav" role="status"></p>
    </form>`);
  const f = cil.querySelector(".och-email"), stav = f.querySelector(".och-email-stav");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = f.querySelector("input[type=email]").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { stav.textContent = "Zadejte e-mail ve tvaru jmeno@example.cz."; return; }
    const tl = f.querySelector("button"); tl.disabled = true; stav.textContent = "Posíláme…";
    try {
      const r = await fetch(`${api}/prehled/email`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, adresa, tipy: f.tipy.checked, oblasti: oblasti.map(({ oblast, barva, text }) => ({ oblast, barva, text })) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Přehled se nepodařilo odeslat.");
      stav.textContent = "Odesláno. Přehled najdete v e-mailu za chvíli.";
      window.mer?.("prehled_email", f.tipy.checked ? "tipy" : "");
    } catch (err) {
      stav.textContent = err.message; tl.disabled = false;
    }
  });
}
