// Prověrka nemovitosti – krok 1: identifikace z adresy nebo odkazu na inzerát.
// Adresy a budovy z veřejných služeb RÚIAN (ČÚZK); inzeráty čte malý skript na Cloudflaru (worker/inzerat.js).
const WORKER_URL = new URLSearchParams(location.search).get("worker")  // pro testování
  || "https://proverka-inzerat.p-gratzer.workers.dev/";
const RUIAN = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN";
const GEOKODER = `${RUIAN}/Vyhledavaci_sluzba_nad_daty_RUIAN/MapServer/exts/GeocodeSOE/findAddressCandidates`;
const PROHLIZECI = `${RUIAN}/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer`;
const PORTALY = ["sreality.cz", "bezrealitky.cz", "reality.idnes.cz"];

const ZPUSOB_VYUZITI = {
  1: "průmyslový objekt", 2: "zemědělská usedlost", 3: "objekt k bydlení", 4: "objekt lesního hospodářství",
  5: "objekt občanské vybavenosti", 6: "bytový dům", 7: "rodinný dům", 8: "stavba pro rodinnou rekreaci",
  10: "stavba pro obchod", 11: "stavba ubytovacího zařízení", 12: "stavba pro výrobu a skladování",
  14: "stavba pro administrativu", 18: "garáž", 19: "jiná stavba", 20: "víceúčelová stavba",
};
const KONSTRUKCE = {
  1: "cihly, tvárnice", 2: "kámen", 3: "kámen a cihly", 4: "stěnové panely", 6: "dřevo",
  7: "jiné materiály", 10: "kámen, cihly, tvárnice", 11: "monolit", 41: "panely (beton)",
};
const VYTAH = { 1: "s výtahem", 2: "bez výtahu" };
const TYP_INZERATU = { byt: "byt", dum: "rodinný dům", pozemek: "pozemek" };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nacitam = (text) => { $("vysledek").innerHTML = `<p class="tlumene">${esc(text)}</p>`; };

async function dotaz(url, params, pokus = 1) {
  // Služba ČÚZK občas krátce vrací 500 bez hlaviček CORS (20. 11. 2026): jednou zopakovat, ať klient nepřijde o výsledek.
  const r = await fetch(`${url}?${new URLSearchParams({ f: "json", ...params })}`).catch((e) => ({ ok: false, status: e.message }));
  if (!r.ok && pokus < 2) { await new Promise((ok) => setTimeout(ok, 1500)); return dotaz(url, params, pokus + 1); }
  if (!r.ok) throw new Error(`Služba ČÚZK teď neodpovídá (${r.status})`);
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || "Chyba služby ČÚZK");
  return data;
}

// ---------- RÚIAN ----------

async function geokoduj(text, pocet = 10) {
  const data = await dotaz(GEOKODER, { SingleLine: text, outSR: 4326, maxLocations: pocet });
  return (data.candidates || []).filter((c) => c.score >= 90);
}

// Varianty zadané adresy pro geokodér (W2a, 12. 11. 2026): geokodér zná poštovní „Praha 5“ a části obce („Radotín“),
// ale ne správní obvody („Praha 16“), „Praha 16 - Radotín“ ani PSČ s mezerou („153 00“).
function variantyAdresy(text) {
  // Mapy.cz a Google píšou „Černošice ev. č. 128, 252 28 Černošice, Česko“, RÚIAN „č.ev. 128, 25228 Černošice“
  // (chaty a rekreační objekty s číslem evidenčním; Petr 21. 11. 2026). Sjednotit zápis, zahodit „Česko“ a obec před číslem.
  const t = text.replace(/\s+/g, " ").trim()
    .replace(/,?\s*(Česko|Česká republika|Czechia)\s*$/i, "")
    .replace(/\b(?:ev\.\s*č\.|č\.\s*ev\.)\s*(\d+)/gi, "č.ev. $1")
    .replace(/^[^,\d]+?\s+(č\.ev\. \d+)/, "$1");
  const bezMezeryPsc = t.replace(/\b(\d{3}) (\d{2})\b/g, "$1$2");
  const m = t.match(/Praha[\s-]*(\d{1,2})?(?:\s*[-–]\s*([^,\d]+))?/i);
  const castZPrahy = m?.[2]?.trim();
  const segmenty = t.replace(/\b\d{3} ?\d{2}\b/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  const ulice = segmenty.find((s) => /\d/.test(s.replace(/Praha[\s-]*\d{1,2}/i, ""))) || segmenty[0] || "";
  const ulic = ulice.replace(/\s*Praha.*$/i, "").trim();
  const casti = [castZPrahy, ...segmenty.filter((s) => s !== ulice && !/^Praha/i.test(s))].filter(Boolean);
  const v = [t, bezMezeryPsc, ...casti.map((c) => `${ulic}, ${c}`)];
  if (m) v.push(`${ulic}, Praha`);
  v.push(ulic);
  return { varianty: [...new Set(v.filter(Boolean))], praha: !!m, cislo: m?.[1], casti };
}

// Postupně zkouší varianty; z výsledků nechá Prahu (pokud ji uživatel napsal) a podle části obce nebo čísla obvodu zúží.
async function geokodujChytre(text) {
  const { varianty, praha, cislo, casti } = variantyAdresy(text);
  for (const q of varianty) {
    let kand = (await geokoduj(q, 10)).filter((c) => c.attributes.Type === "AdresniMisto");
    if (praha) kand = kand.filter((c) => /Praha/.test(c.address));
    if (!kand.length) continue;
    const podleCasti = kand.filter((c) => casti.some((x) => c.address.toLowerCase().includes(x.toLowerCase())));
    if (podleCasti.length) kand = podleCasti;
    else if (cislo && kand.length > 1) {
      const podleCisla = kand.filter((c) => new RegExp(`Praha ${cislo}$`).test(c.address));
      if (podleCisla.length) kand = podleCisla;
    }
    return kand;
  }
  return [];
}

async function adresniMista(where) {
  const d = await dotaz(`${PROHLIZECI}/1/query`, { where, outFields: "kod,adresa,stavebniobjekt", returnGeometry: true, outSR: 4326 });
  return (d.features || []).map((f) => ({ kod: f.attributes.kod, adresa: f.attributes.adresa, so: f.attributes.stavebniobjekt,
    lat: f.geometry?.y, lon: f.geometry?.x }));
}

async function adresyUBodu(lat, lon, metru) {
  const d = await dotaz(`${PROHLIZECI}/1/query`, {
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }), geometryType: "esriGeometryPoint",
    inSR: 4326, spatialRel: "esriSpatialRelIntersects", distance: metru, units: "esriSRUnit_Meter",
    outFields: "kod,adresa,stavebniobjekt", returnGeometry: true, outSR: 4326,
  });
  return (d.features || []).map((f) => ({ kod: f.attributes.kod, adresa: f.attributes.adresa, so: f.attributes.stavebniobjekt,
    lat: f.geometry.y, lon: f.geometry.x, vzdalenost: vzdalenost(lat, lon, f.geometry.y, f.geometry.x) }));
}

async function budovy(kody) {
  const unikatni = [...new Set(kody)].filter(Boolean);
  if (!unikatni.length) return {};
  // Obrys budovy (S-JTSK) rovnou s údaji: ochutnávka ho pak nemusí načítat znovu (rychlost, 13. 11. 2026).
  const d = await dotaz(`${PROHLIZECI}/3/query`, { where: `kod in (${unikatni.join(",")})`, outFields: "*", returnGeometry: true, outSR: 5514 });
  return Object.fromEntries((d.features || []).map((f) => [f.attributes.kod, { ...f.attributes, obrys: f.geometry?.rings }]));
}

async function mestskaCast(kod) {
  if (!kod) return null;
  const m = await dotaz(`${PROHLIZECI}/8/query`, { where: `kod=${kod}`, outFields: "nazev", returnGeometry: false });
  return m.features?.[0]?.attributes?.nazev || null;
}

function vzdalenost(lat1, lon1, lat2, lon2) {
  const r = 6371000, k = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * k / 2) ** 2 + Math.cos(lat1 * k) * Math.cos(lat2 * k) * Math.sin((lon2 - lon1) * k / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(a)));
}

function typBudovy(b) {
  const zpusob = ZPUSOB_VYUZITI[b.zpusobvyuzitikod] || "jiný";
  if (b.zpusobvyuzitikod === 6 || (b.pocetbytu || 0) > 3) return { typ: "bytový dům", zpusob };
  if ([2, 3, 7, 8].includes(b.zpusobvyuzitikod)) return { typ: "rodinný dům", zpusob };
  // Víceúčelová stavba, obchod, kanceláře… s byty (polyfunkční dům, Libušská 313, Petr 21. 11. 2026): prodávají se v ní
  // byty jako v bytovém domě – katastr je vede jako jednotky, prověrka funguje stejně.
  if ((b.pocetbytu || 0) >= 1) return { typ: "bytový dům", zpusob };
  return { typ: "jiná stavba", zpusob };
}

// Odpovídá budova inzerátu? Typ (byt ↔ bytový dům, dům ↔ rodinný dům) a počet podlaží.
function shodaSInzeratem(b, inz) {
  if (!inz) return 0;
  let body = 0;
  const { typ } = typBudovy(b);
  if (inz.typ === "byt") body += typ === "bytový dům" ? 2 : -3;
  if (inz.typ === "dum") body += typ === "rodinný dům" ? 2 : -3;
  // Počet podlaží v RÚIAN a v inzerátu se často liší (suterén, podkroví): shoda jen přidá, rozdíl neubírá.
  if (inz.podlazi_budovy && b.pocetpodlazi === inz.podlazi_budovy) body += 1;
  return body;
}

const bezDiakritiky = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const naUlici = (adresa, ulice) => !ulice || bezDiakritiky(adresa).startsWith(bezDiakritiky(ulice) + " ");

// ---------- Identifikace z inzerátu ----------

async function nactiInzerat(url) {
  if (!WORKER_URL) return null;
  const r = await fetch(`${WORKER_URL}?url=${encodeURIComponent(url)}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.chyba) throw new Error(data.chyba || `Inzerát se nepodařilo načíst (${r.status})`);
  return data;
}

// Stavební objekty, kterých se dotýká okolí bodu (špendlík v inzerátu).
async function budovyUBodu(lat, lon, metru) {
  const d = await dotaz(`${PROHLIZECI}/3/query`, {
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }), geometryType: "esriGeometryPoint",
    inSR: 4326, spatialRel: "esriSpatialRelIntersects", distance: metru, units: "esriSRUnit_Meter", outFields: "kod", returnGeometry: false,
  });
  return (d.features || []).map((f) => f.attributes.kod);
}

async function adresyVUlici(ulice, obec, cast) {
  const sql = (s) => String(s).replace(/'/g, "''");
  const najdi = (u) => adresniMista(`adresa like '${sql(u)} %' and adresa like '%${sql(obec || "Praha")}%'`);
  let vse = await najdi(ulice);
  // Inzeráty píšou „Pod Pekárnami“, RÚIAN „Pod pekárnami“ (snímek inzerátu, 20. 11. 2026). UPPER() v dotazu
  // prohledá celou tabulku a služba ČÚZK pak vrací chybu 500, proto druhý pokus s malými písmeny za prvním slovem.
  const mala = ulice.replace(/^(\S+\s)(.*)$/, (_, prvni, zbytek) => prvni + zbytek.toLowerCase());
  if (!vse.length && mala !== ulice) vse = await najdi(mala);
  const vCasti = cast ? vse.filter((a) => a.adresa.includes(`, ${cast},`)) : [];
  return (vCasti.length ? vCasti : vse).filter((a) => naUlici(a.adresa, ulice));
}

// Pozemek z inzerátu × katastr: sedí výměra stavební parcely domu, sama nebo s nejvýš dvěma sousedními parcelami
// (zahrada, dvůr)? Vrací pro každou budovu null (nesedí), 0 (jen stavební parcela), 1 (s parcelami se stejným
// kmenovým číslem nebo hned vedle) nebo 2 (se vzdálenějšími čísly). Ověřeno na 41 domech ze Sreality se známou adresou.
async function shodyPozemku(budovyPodleKodu, pozemek) {
  const parcelaBudovy = Object.fromEntries(Object.entries(budovyPodleKodu).map(([so, b]) => [b.identifikacniparcela, so]).filter(([p]) => p && p !== "null"));
  const ids = Object.keys(parcelaBudovy);
  if (!ids.length) return {};
  const vlastni = [];
  for (let i = 0; i < ids.length; i += 50)
    vlastni.push(...(await dotaz(`${PROHLIZECI}/5/query`, { where: `id in (${ids.slice(i, i + 50).join(",")})`,
      outFields: "id,vymeraparcely,kmenovecislo", returnGeometry: true })).features || []);
  const tolerance = Math.max(pozemek * 0.005, 2);
  const vysledek = {};
  await poJednom(vlastni, 6, async (f) => {
    const st = f.attributes;
    const params = new URLSearchParams({ f: "json", geometry: JSON.stringify(f.geometry), geometryType: "esriGeometryPolygon",
      inSR: 5514, spatialRel: "esriSpatialRelIntersects", outFields: "id,vymeraparcely,druhpozemkukod,kmenovecislo", returnGeometry: false });
    const r = await fetch(`${PROHLIZECI}/5/query`, { method: "POST", body: params });
    const sousede = ((await r.json()).features || []).map((x) => x.attributes)
      .filter((x) => x.id !== st.id && x.vymeraparcely <= pozemek && !(x.druhpozemkukod === 14 && x.vymeraparcely > 1000));  // ne silnice
    let nej = null;
    const zkus = (parcely) => {
      if (Math.abs(st.vymeraparcely + parcely.reduce((s, x) => s + x.vymeraparcely, 0) - pozemek) > tolerance) return;
      const daleko = parcely.some((x) => Math.abs(x.kmenovecislo - st.kmenovecislo) > 2);
      const kval = parcely.length === 0 ? 0 : daleko ? 2 : 1;
      nej = nej === null ? kval : Math.min(nej, kval);
    };
    zkus([]);
    sousede.forEach((a, i) => { zkus([a]); sousede.slice(i + 1).forEach((b) => zkus([a, b])); });
    vysledek[parcelaBudovy[st.id]] = nej;
  });
  return vysledek;
}

async function poJednom(polozky, soubezne, fn) {
  const fronta = [...polozky];
  await Promise.all(Array.from({ length: soubezne }, async () => {
    while (fronta.length) await fn(fronta.shift()).catch((e) => console.warn(e));
  }));
}

// Seřadí budovy u adres podle shody s inzerátem: typ a podlaží, špendlík na budově, výměra pozemku.
async function ohodnot(adresy, inz) {
  const kody = [...new Set(adresy.map((a) => a.so))].filter(Boolean);
  const b = {};
  for (let i = 0; i < kody.length; i += 100) Object.assign(b, await budovy(kody.slice(i, i + 100)));
  const naSpendliku = inz.lat && inz.presnost !== "ulice" ? new Set(await budovyUBodu(inz.lat, inz.lon, 5)) : new Set();
  const typSedi = Object.fromEntries(Object.entries(b).filter(([, x]) => shodaSInzeratem(x, inz) >= 0));
  const pozemky = inz.typ === "dum" && inz.pozemek_m2 && Object.keys(typSedi).length <= 80 ? await shodyPozemku(typSedi, inz.pozemek_m2) : {};

  const podleBudovy = new Map();
  for (const a of adresy) {
    if (!b[a.so] || podleBudovy.has(a.so)) continue;
    const duvody = [];
    let skore = shodaSInzeratem(b[a.so], inz);
    if (naSpendliku.has(a.so)) { skore += 3; duvody.push("bod na mapě v inzerátu leží na domě"); }
    if (pozemky[a.so] != null) {
      skore += pozemky[a.so] < 2 ? 3 : 2;
      duvody.push(`výměra pozemku ${inz.pozemek_m2} m² z inzerátu odpovídá parcelám domu v katastru`);
    }
    podleBudovy.set(a.so, { ...a, skore, duvody });
  }
  return [...podleBudovy.values()].sort((x, y) => y.skore - x.skore || (x.vzdalenost ?? 0) - (y.vzdalenost ?? 0));
}

// Vrací { adresa, jak, jistota, alternativy } nebo { kandidati, duvod }.
async function najdiBudovuZInzeratu(inz) {
  // 1) Bezrealitky: přímo kód adresního místa v RÚIAN.
  if (inz.ruian_adresa) {
    const [a] = await adresniMista(`kod=${parseInt(inz.ruian_adresa, 10)}`);
    if (a) return { adresa: a, jak: "kód adresy v RÚIAN uvedený v inzerátu", jistota: "jistá" };
  }
  // 2) Ulice s číslem popisným (Sreality u části inzerátů).
  if (inz.ulice && inz.cislo_popisne) {
    const cislo = inz.cislo_orientacni ? `${inz.cislo_popisne}/${inz.cislo_orientacni}` : inz.cislo_popisne;
    const kand = await geokoduj(`${inz.ulice} ${cislo}, ${inz.cast_obce || inz.obec || ""}`, 5);
    const presna = kand.find((c) => c.attributes.Type === "AdresniMisto" && c.address.includes(` ${cislo},`));
    if (presna) {
      const [a] = await adresyUBodu(presna.location.y, presna.location.x, 2);
      if (a) return { adresa: a, jak: "adresa uvedená v inzerátu", jistota: inz.presnost === "adresa" ? "jistá" : "vysoká" };
    }
  }
  // 3) Kandidáti: okolí bodu na mapě, nebo celá ulice, když inzerát uvádí jen ulici.
  let adresy = [];
  const presnyBod = inz.lat && inz.lon && inz.presnost !== "ulice";
  if (presnyBod) {
    const okoli = await adresyUBodu(inz.lat, inz.lon, 60);
    adresy = okoli.filter((a) => naUlici(a.adresa, inz.ulice));
    if (!adresy.length) adresy = okoli;
  } else if (inz.ulice) {
    adresy = await adresyVUlici(inz.ulice, inz.obec, inz.cast_obce);
    if (inz.lat) adresy.forEach((a) => { a.vzdalenost = vzdalenost(inz.lat, inz.lon, a.lat, a.lon); });
  } else if (inz.lat && inz.lon) {
    adresy = await adresyUBodu(inz.lat, inz.lon, 250);
  }
  if (!presnyBod) adresy.forEach((a) => { if (!inz.lat) a.vzdalenost = null; });
  if (!adresy.length) return { kandidati: [], duvod: "Z inzerátu se nepodařilo určit dům." };

  const poradi = await ohodnot(adresy, inz);
  const [prvni, druhy] = poradi;
  const nadDruhym = prvni.skore - (druhy ? druhy.skore : -99);
  const silny = prvni.duvody.length > 0;
  if (prvni.skore > 0 && nadDruhym >= 2 && (silny || poradi.length === 1)) {
    const jistota = prvni.duvody.length >= 2 || (prvni.duvody[0]?.startsWith("bod") && nadDruhym >= 3) ? "vysoká" : "střední";
    return { adresa: prvni, jistota, alternativy: jistota === "vysoká" ? [] : poradi.slice(1, 5).filter((x) => x.skore > 0),
      jak: prvni.duvody.length ? prvni.duvody.join("; ") : "jediná budova odpovídající typem" };
  }
  const nejlepsi = poradi.filter((x) => x.skore >= prvni.skore - 1 && x.skore > 0).slice(0, 6);
  const kandidati = nejlepsi.length ? nejlepsi : poradi.slice(0, 6);
  const vsechny = poradi.filter((x) => x.skore > 0);
  return { kandidati, vsechny: vsechny.length ? vsechny : poradi, duvod: presnyBod ? "Inzerát uvádí jen přibližné místo."
    : `Inzerát neuvádí číslo domu${inz.ulice ? `, jen ulici ${esc(inz.ulice)}` : ""}.` };
}

// ---------- Zobrazení ----------

function karta(trida, nadpis, obsah) {
  return `<div class="karta ${trida}"><h2>${esc(nadpis)}</h2>${obsah}</div>`;
}

function nabidni(kandidati, nadpis, uvod, inz) {
  const seznam = kandidati.map((c, i) => `<li><button type="button" data-i="${i}">${esc(c.adresa)}${
    c.vzdalenost != null ? ` <span class="tlumene">(${c.vzdalenost} m od bodu v inzerátu)</span>` : ""}</button></li>`).join("");
  $("vysledek").innerHTML = karta("upresnit", nadpis, `<p>${uvod}</p><ul class="kandidati">${seznam}</ul>
    <p class="tlumene">Nebo zadejte přesnou adresu do pole nahoře.</p>`);
  $("vysledek").querySelectorAll("button[data-i]").forEach((btn) => btn.addEventListener("click", () =>
    zobrazBudovu(kandidati[+btn.dataset.i], inz, { jak: "vybráno z nabídky", jistota: "jistá" }).catch(chyba)));
}

// ---------- Výběr domu na letecké mapě ----------

let leaflet;
function nactiLeaflet() {
  leaflet ??= new Promise((ok, chyba) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.append(css);
    const js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload = () => ok(window.L); js.onerror = () => chyba(new Error("Mapu se nepodařilo načíst"));
    document.head.append(js);
  });
  return leaflet;
}

async function obrysyBudov(kody) {
  const unikatni = [...new Set(kody)].filter(Boolean), obrysy = {};
  for (let i = 0; i < unikatni.length; i += 100) {
    const d = await dotaz(`${PROHLIZECI}/3/query`, { where: `kod in (${unikatni.slice(i, i + 100).join(",")})`,
      outFields: "kod", returnGeometry: true, outSR: 4326 });
    for (const f of d.features || []) obrysy[f.attributes.kod] = f.geometry.rings.map((r) => r.map(([x, y]) => [y, x]));
  }
  return obrysy;
}

// Domy, které sedí typem, na leteckém snímku; ty nejpravděpodobnější zvýrazněné. Zákazník pozná dům podle fotek z inzerátu.
async function vyberNaMape(vsechny, kandidati, uvod, inz) {
  nacitam("Připravuji mapu…");
  const domy = vsechny.slice(0, 120);
  const [L, obrysy] = await Promise.all([nactiLeaflet(), obrysyBudov(domy.map((d) => d.so))]);
  const zvyraznene = new Set(kandidati.length < domy.length ? kandidati.map((k) => k.so) : []);
  const seznam = kandidati.map((c, i) => `<li><button type="button" data-i="${i}">${esc(c.adresa)}${
    c.vzdalenost != null ? ` <span class="tlumene">(${c.vzdalenost} m od bodu v inzerátu)</span>` : ""}</button></li>`).join("");
  $("vysledek").innerHTML = karta("upresnit", "Klepněte na dům z inzerátu", `<p>${uvod} Najděte dům na leteckém snímku
    podle fotek z inzerátu (střecha, zahrada, okolí) a klepněte na něj.${zvyraznene.size ? " Oranžově jsou domy, které inzerátu odpovídají nejvíc." : ""}</p>
    <div id="mapa" class="mapa"></div>
    <div id="vybrany" class="vybrany" hidden><span></span><button type="button">Pokračovat s tímto domem</button></div>
    ${zvyraznene.size ? `<p class="tlumene">Nejpravděpodobnější domy:</p><ul class="kandidati">${seznam}</ul>` : ""}
    <p class="tlumene">Adresu vám také sdělí makléř nebo prodávající, stačí ji zadat do pole nahoře.</p>`);
  $("vysledek").querySelectorAll("button[data-i]").forEach((btn) => btn.addEventListener("click", () =>
    zobrazBudovu(kandidati[+btn.dataset.i], inz, { jak: "vybráno z nabídky", jistota: "jistá" }).catch(chyba)));

  // Plátno s tolerancí: malé obrysy domů jdou trefit i prstem.
  const mapa = L.map("mapa", { renderer: L.canvas({ tolerance: 10 }) });
  mapa.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  L.tileLayer("https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 21, maxNativeZoom: 20, attribution: "Ortofoto © ČÚZK" }).addTo(mapa);
  const styl = (so, vybrany) => vybrany ? { color: "#2e7d32", weight: 3, fillColor: "#7cc68a", fillOpacity: 0.6 }
    : zvyraznene.has(so) ? { color: "#f0a050", weight: 3, fillColor: "#f0a050", fillOpacity: 0.45 }
    : { color: "#ffffff", weight: 2, fillColor: "#ffffff", fillOpacity: 0.15 };
  let vybranaVrstva = null, vybranyDum = null;
  // Výřez mapy nastavit DŘÍV, než se přidají obrysy (17. 11. 2026, inzerát iDNES Toruňská): plátno bez nastaveného
  // výřezu spadne na „Cannot read properties of undefined (reading 'min')“.
  const body = domy.flatMap((d) => (obrysy[d.so] || []).flat());
  if (body.length) mapa.fitBounds(L.latLngBounds(body), { padding: [20, 20], maxZoom: 19 });
  else if (inz?.lat) mapa.setView([inz.lat, inz.lon], 18);
  else mapa.setView([50.08, 14.43], 12);
  const skupina = L.featureGroup().addTo(mapa);
  for (const d of domy) {
    if (!obrysy[d.so]) continue;
    const vrstva = L.polygon(obrysy[d.so], styl(d.so, false)).addTo(skupina);
    vrstva.bindTooltip(esc(d.adresa.split(",")[0]), { direction: "top" });
    vrstva.on("click", () => {
      vybranaVrstva?.setStyle(styl(vybranyDum.so, false));
      vybranaVrstva = vrstva; vybranyDum = d;
      vrstva.setStyle(styl(d.so, true));
      $("vybrany").hidden = false;
      $("vybrany").querySelector("span").textContent = `Vybraný dům: ${d.adresa.split(",")[0]}`;
    });
  }
  if (inz?.lat && inz.presnost !== "ulice") L.circleMarker([inz.lat, inz.lon], { radius: 6, color: "#f08080" })
    .bindTooltip("bod z inzerátu").addTo(mapa);
  $("vybrany").querySelector("button").addEventListener("click", () =>
    zobrazBudovu(vybranyDum, inz, { jak: "vybráno na mapě", jistota: "jistá" }).catch(chyba));
}

// Okolí Prahy (okresy Praha-východ a Praha-západ, Petr 21. 11. 2026): rozhoduje kód části obce budovy z RÚIAN, ne název
// obce (názvy se v ČR opakují). Seznam z nemo/nastroje/data/obce_okoli_prahy.json.
let okoliSlib = null;
const OKOLI_PRAHY = () => (okoliSlib ||= fetch("/proverit/okoli-prahy.json?v=1").then((r) => r.json())
  .then((d) => new Set(d.casti_obce)).catch(() => { okoliSlib = null; return new Set(); }));

async function zobrazBudovu(adresa, inz, puvod) {
  nacitam("Načítám údaje o budově…");
  const [b, okoli] = await Promise.all([budovy([adresa.so]).then((x) => x[adresa.so]), OKOLI_PRAHY()]);
  if (!b) throw new Error("Budovu k adrese se v RÚIAN nepodařilo načíst");
  const vOkoli = okoli.has(b.castobce);
  const obec = (adresa.adresa.match(/\d{5}\s+(.+)$/)?.[1] || adresa.adresa.split(",").pop()).trim();
  const mcSlib = mestskaCast(b.momc).catch(() => null);   // nečekáme: doplní se do tabulky, až přijde
  const { typ, zpusob } = typBudovy(b);

  const upozorneni = [];
  if (inz?.typ === "byt" && typ === "rodinný dům") upozorneni.push("Inzerát nabízí byt, ale na adrese je podle RÚIAN rodinný dům. Ověřte prosím adresu.");
  if (inz?.typ === "dum" && typ === "bytový dům") upozorneni.push("Inzerát nabízí rodinný dům, ale na adrese je podle RÚIAN bytový dům. Ověřte prosím adresu.");
  if (typ === "jiná stavba") upozorneni.push(`Budova je v RÚIAN vedená jako „${zpusob}“. Prověrka zatím umí byty a rodinné domy.`);

  const rok = b.dokonceni ? new Date(b.dokonceni).getFullYear() : null;
  const radky = [
    ["Adresa", adresa.adresa],
    vOkoli ? ["Obec", obec] : ["Městská část", "…"],
    ["Typ", typ === zpusob ? typ : `${typ} (v RÚIAN: ${zpusob})`],
    ["Čísla popisná budovy", b.cisladomovni],
    ...(b.pocetbytu ? [["Bytů v budově", b.pocetbytu]] : []),
    ["Podlaží", b.pocetpodlazi ?? "–"],
    ["Konstrukce", KONSTRUKCE[b.druhkonstrukcekod] || "–"],
    ["Výtah", VYTAH[b.vybavenivytahemkod] || "–"],
    ["Zastavěná plocha", b.zastavenaplocha ? `${b.zastavenaplocha} m²` : "–"],
    ["Dokončení (evidence)", rok && rok !== 1945 ? rok : "neuvedeno"],
  ];
  if (inz) {
    const popis = [TYP_INZERATU[inz.typ] || inz.typ, inz.dispozice, inz.plocha_m2 && `${inz.plocha_m2} m²`,
      inz.patro != null && `${inz.patro}. NP`, inz.cena_kc && `${inz.cena_kc.toLocaleString("cs-CZ")} Kč`].filter(Boolean).join(", ");
    radky.push(["Inzerát", `${popis} (${inz.portal})`]);
  }
  const JISTOTA = { "jistá": "jistě", "vysoká": "s vysokou jistotou", "střední": "se střední jistotou – zkontrolujte prosím adresu" };
  radky.push(["Jak jsme dům určili", `${puvod.jak} (${JISTOTA[puvod.jistota] || puvod.jistota})`]);
  const alternativy = puvod.alternativy || [];

  const byt = typ === "bytový dům";
  const dalsi = typ === "jiná stavba" ? "" : byt
    ? `<p class="tlumene">Číslo bytové jednotky od vás nepotřebujeme: dům stačí pro rozbor povodní, hluku, územního plánu, SVJ a ceny.
       Jednotku dohledáme v katastru podle plochy a podlaží z inzerátu.</p>`
    : "";
  const tabulka = `<dl>${radky.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  const vPraze = /Praha/.test(adresa.adresa) || vOkoli;   // Praha nebo okolí Prahy: přehled a objednávka
  const nadpis = typ === "jiná stavba" ? "Tento typ stavby zatím neprověřujeme" : "Nemovitost je identifikovaná";
  const jina = typ === "jiná stavba";
  // Údaje o budově sbalené pod jedním řádkem (adresa a typ); upozornění a „Není to on?“ zůstávají vidět.
  $("vysledek").innerHTML = `<div class="karta ${jina ? "upresnit" : "ok"}">
      <details class="sbal"${jina ? " open" : ""}>
        <summary><span class="hlavicka-sbal"><h2>${esc(nadpis)}</h2><span class="shrnuti">${esc(adresa.adresa.split(",").slice(0, 2).join(","))} · ${esc(typ)}</span></span><span class="prepinac" aria-hidden="true"></span></summary>
        ${tabulka}${dalsi}
      </details>
      ${upozorneni.map((u) => `<p class="poznamka">${esc(u)}</p>`).join("")}
      ${alternativy.length ? `<div class="alternativy tlumene">Není to on? ${alternativy.map((a, i) =>
        `<button type="button" data-alt="${i}">${esc(a.adresa.split(",")[0])}</button>`).join("")}</div>` : ""}
    </div>` +
    (jina ? `<div class="co-dal"><h3>Co s tím</h3>
      <p>Prověrku zatím děláme pro byty a rodinné domy. Pokud jste zadali adresu jiné budovy, zkuste to znovu; jinak nám napište a prověrku zkusíme připravit ručně.</p>
      <div class="akce"><button type="button" class="tl tmave-tl" data-znovu>Zadat jinou adresu</button>
      <a class="tl obrys-tmave" href="mailto:info@predkoupi.cz?subject=${encodeURIComponent("Prověrka: " + adresa.adresa)}">Napsat nám</a></div></div>`
      : vPraze && window.OBJEDNAVKY?.zapnute ? `<div id="ochutnavka" class="karta och-karta"></div><div class="co-dal" id="objednat"></div>`
      : vPraze ? `<div id="ochutnavka" class="karta och-karta"></div><div class="co-dal"><h3>Co dál</h3>
      <p>Objednávky Prověrky (790 Kč) a Prověrky PLUS (1 390 Kč) spouštíme v nejbližších týdnech.</p>
      <div class="akce"><a class="tl tmave-tl" href="/#ceny">Co obsahuje Prověrka</a></div><div class="co-dal-zajem" data-zajem data-zdroj="proverit"></div></div>`
      // Mimo Prahu (W11, 12. 11. 2026): měříme zájem – e-mail a obec, ať víme, kam službu rozšířit.
      : `<div class="co-dal"><h3>Tady zatím neprověřujeme</h3>
      <p>Prověrku děláme v Praze a v okresech Praha-východ a Praha-západ. Podle zájmu přidáme další obce.</p>
      <div class="co-dal-zajem" data-zajem data-zdroj="${esc(("mimo:" + obec).slice(0, 40))}" data-stitek="E-mail pro oznámení, až budeme prověřovat i v obci ${esc(obec)}"
        data-souhlas="Pošleme jedinou zprávu, až službu rozšíříme do vaší obce, a pak e-mail smažeme. Ukládáme jen e-mail a název obce."
        data-hotovo="až budeme prověřovat i ve vaší obci"></div></div>`);
  mcSlib.then((mc) => { const dd = [...$("vysledek").querySelectorAll("dt")].find((x) => x.textContent === "Městská část")?.nextElementSibling; if (dd) dd.textContent = mc || "–"; });
  if (!jina) window.mer?.(vPraze ? "prehled" : "mimo_prahu");
  if ($("ochutnavka")) ochutnavka(adresa.so, $("ochutnavka"), { start: puvod.start, obrys: b.obrys, rodinny: !byt, adresa: adresa.text || adresa.adresa || "",
    oblast: vOkoli ? "okoli" : "praha", obec: vOkoli ? obec : "" });
  $("vysledek").querySelector("[data-znovu]")?.addEventListener("click", () => { const v = $("vstup"); v.value = ""; v.focus(); v.scrollIntoView({ block: "center" }); });
  if ($("objednat")) window.objednavkaFormular($("objednat"), { adresa: adresa.adresa, typ, inz });
  plovouciObjednat();
  document.querySelectorAll("#vysledek [data-zajem]").forEach((k) => window.zajemFormular?.(k));
  $("vysledek").querySelectorAll("button[data-alt]").forEach((btn) => btn.addEventListener("click", () =>
    zobrazBudovu(alternativy[+btn.dataset.alt], inz, { jak: "vybráno z nabídky", jistota: "jistá" }).catch(chyba)));
}

function chyba(err) {
  $("vysledek").innerHTML = karta("chyba", "Něco se nepovedlo", `<p>${esc(err.message)}. Zkuste to prosím znovu, případně zadejte adresu.</p>`);
}

const BEZ_ULICE = `V odkazu není obec ani ulice. Zadejte prosím adresu nemovitosti do pole nahoře, sdělí vám ji makléř nebo prodávající.`;

// Odkaz na portál bez skriptu na Cloudflaru: aspoň typ a ulice z adresy odkazu.
function lokalitaZOdkazu(u) {
  const cesta = decodeURIComponent(u.pathname).split("/").filter(Boolean);
  if (u.hostname.endsWith("sreality.cz") && cesta[0] === "detail")  // /detail/prodej/byt/2+1/praha-zabehlice-postupicka/<id>
    return { typ: cesta[2], dispozice: cesta[3] !== "rodinny" ? cesta[3] : null, lokalita: (cesta[4] || "").replace(/-/g, " ").trim(),
      bezUlice: (cesta[4] || "").endsWith("-") };   // „krepice-krepice-“: obec a část obce, ulice prázdná
  if (u.hostname.endsWith("idnes.cz") && cesta[0] === "detail")  // /detail/prodej/byt/praha-6-lindleyova/<id>/
    return { typ: cesta[2], dispozice: null, lokalita: (cesta[3] || "").replace(/-/g, " ").replace(/^praha \d+ /, "praha ").trim() };
  return null;
}

async function zpracujInzerat(inz) {
  nacitam("Hledám dům v registru adres a katastru…");
  const v = await najdiBudovuZInzeratu(inz);
  if (v.adresa) return zobrazBudovu(v.adresa, inz, v);
  if (v.kandidati.length) return vyberNaMape(v.vsechny, v.kandidati, v.duvod, inz);
  $("vysledek").innerHTML = karta("upresnit", "Z inzerátu nejde určit dům", `<p>${esc(v.duvod)} Zadejte prosím adresu.</p>`);
}

async function overitOdkaz(url) {
  if (!PORTALY.some((p) => url.hostname.replace(/^www\./, "").endsWith(p))) {
    $("vysledek").innerHTML = karta("upresnit", "Tento portál zatím neumíme přečíst",
      `<p>Umíme Sreality, Bezrealitky a iDNES Reality. Zadejte prosím adresu nemovitosti.</p>`);
    return;
  }
  nacitam("Čtu inzerát…");
  // Sreality automatické čtení zakazují (robots.txt), skript na Cloudflaru je proto nečte.
  const inz = url.hostname.endsWith("sreality.cz") ? null : await nactiInzerat(url.href).catch((err) => { console.warn(err); return null; });
  if (inz) return zpracujInzerat(inz);
  // Portál čtení nedovolí (Sreality): nejdřív ulice nebo obec z adresy odkazu. Snímek inzerátu jen tam, kde odkaz
  // nestačí – jen obec, nebo víc než 3 domy (Petr 20. 11. 2026 po zkoušce Aubrechtové: snímek předem byl krok navíc).
  return bezSnimku(url);
}

async function bezSnimku(url, bezNabidky = false) {
  const nabidka = (text) => bezNabidky ? "" : `<p><button type="button" class="odkaz" id="nabidka-snimku">${text}</button></p>`;
  const napojNabidku = () => $("nabidka-snimku")?.addEventListener("click", () => nabidniSnimek(url));
  nacitam("Hledám ulici z odkazu…");
  const lok = lokalitaZOdkazu(url);
  const kand = lok?.lokalita ? (await geokoduj(lok.lokalita, 10)) : [];
  // Adresa v ulici má tvar „Ulice 12/3, Část obce, PSČ Obec“; bez ulice jen „Část obce 123, PSČ Obec“.
  const nazevUlice = (c) => c.address.split(",")[0].replace(/\s+\d+(\/\d+\w?)?$/, "");
  // Mimo města s částmi obce má adresa jen dvě části („Wolkerova 757, 27351 Unhošť“) – i ty berem (oprava 20. 11. 2026).
  const ulice = kand.find((c) => c.attributes.Type === "AdresniMisto" && c.address.split(",").length >= 2
    && !/^č\.\s?[pe]\./.test(c.address) && bezDiakritiky(lok.lokalita).includes(bezDiakritiky(nazevUlice(c))));  // geokodér jinak vrátí i jinou ulici v části obce
  if (ulice) {
    const nazev = nazevUlice(ulice);
    const casti = ulice.address.split(",").map((s) => s.trim());
    const obec = ulice.address.match(/Praha/)?.[0] || casti[casti.length - 1].replace(/^\d{3}\s?\d{2}\s+/, "");
    const inzOdkaz = { typ: lok.typ, dispozice: lok.dispozice, ulice: nazev, obec, portal: url.hostname.replace(/^www\./, "") };
    const adresy = await adresyVUlici(nazev, obec, casti.length >= 3 ? casti[1] : undefined);
    adresy.forEach((a) => { a.vzdalenost = null; });
    const poradi = (await ohodnot(adresy, inzOdkaz)).filter((x) => x.skore > 0);
    if (poradi.length === 1) return zobrazBudovu(poradi[0], inzOdkaz, { jak: "jediný dům v ulici, který sedí typem", jistota: "střední" });
    if (poradi.length) {
      await vyberNaMape(poradi, [],
        `${url.hostname.endsWith("sreality.cz") ? "Sreality nedovolují inzerát přečíst automaticky" : "Inzerát se teď nepodařilo přečíst"}, z odkazu známe jen ${lok.bezUlice ? "část obce" : "ulici"} ${esc(nazev)}.`, inzOdkaz);
      const domu = new Set(poradi.map((x) => x.so)).size;
      if (domu > 3 && !bezNabidky) {   // u víc domů může pomoct tabulka inzerátu (podlaží „X z Y“, zastavěná plocha)
        $("mapa")?.insertAdjacentHTML("beforebegin", nabidka("Zúžit výběr snímkem inzerátu"));
        napojNabidku();
      }
      return;
    }
  }
  // Bez ulice (obce bez ulic, inzerát s „Lokalita je pouze orientační“): řekneme aspoň, co z odkazu víme (Petr 20. 11. 2026).
  // Přednost má adresní místo („Novosedly 8, 38101 Kájov“ → „Novosedly, Kájov“), pak obec nebo část obce, katastr až nakonec.
  const am = kand.find((c) => c.attributes.Type === "AdresniMisto")?.address;
  const zAdresy = am && (() => { const [prvni, posledni] = [am.split(",")[0], am.split(",").pop()];
    const obecA = posledni.replace(/^\s*\d{3}\s?\d{2}\s+/, "").trim();
    const cast = prvni.replace(/\s+\d+\w?$/, "").replace(/^č\.\s?[pe]\..*$/, "").trim();
    if (!bezDiakritiky(lok?.lokalita || "").includes(bezDiakritiky(obecA))) return null;   // jiné místo, než je v odkazu
    return cast && cast !== obecA && bezDiakritiky(lok.lokalita).includes(bezDiakritiky(cast)) ? { misto: `${cast}, ${obecA}`, priklad: `${cast} 123, ${obecA}` } : { misto: obecA, priklad: `${obecA} 123` }; })();
  const obecG = kand.find((c) => ["Obec", "CastObce"].includes(c.attributes.Type))?.address;
  const m = zAdresy || (obecG && { misto: obecG, priklad: `${obecG} 123` });
  if (m) {
    const proc = url.hostname.endsWith("sreality.cz") ? "Sreality nedovolují inzerát přečíst automaticky a&nbsp;v&nbsp;odkazu" : "Inzerát se nepodařilo přečíst a&nbsp;v&nbsp;odkazu";
    $("vysledek").innerHTML = karta("upresnit", `Z odkazu známe jen místo: ${esc(m.misto)}`,
      `<p>${proc} je jen ${esc(m.misto)}, bez ulice a čísla domu. Zadejte prosím adresu do pole nahoře, například „${esc(m.priklad)}“. Číslo domu bývá v&nbsp;inzerátu na mapě, jinak vám ho sdělí makléř nebo prodávající.</p>
      ${nabidka("Nebo pošlete snímek inzerátu – ukážeme domy, které mu odpovídají")}`);
    napojNabidku();
    return;
  }
  $("vysledek").innerHTML = karta("upresnit", "Z odkazu nejde vyčíst adresu", `<p>${BEZ_ULICE}</p>${nabidka("Poslat snímek inzerátu")}`);
  napojNabidku();
}

// ---------- Snímek inzerátu (varianta A, Petr 20. 11. 2026; test na 23 inzerátech v docs/sreality-test.md) ----------

const SNIMKU_MAX = 3;

function nabidniSnimek(url) {
  window.mer?.("snimek_nabidka");
  const sreality = url.hostname.endsWith("sreality.cz");
  $("vysledek").innerHTML = karta("upresnit", "Pošlete snímek inzerátu",
    `<p>${sreality ? "Sreality nám inzerát přečíst nedovolí, z odkazu známe jen ulici nebo obec." : "Inzerát se nepodařilo přečíst."} Udělejte snímek obrazovky
    inzerátu a&nbsp;vyberte ho tady. Nejvíc pomůže nadpis, tabulka údajů a&nbsp;mapa se špendlíkem – klidně na 2–3 snímcích.</p>
    <label class="snimek-pole" id="snimek-pole">
      <input type="file" id="snimek-soubor" accept="image/*" multiple class="snimek-vstup">
      <span class="snimek-tl">Vybrat snímky</span>
      <span class="snimek-napoveda">nebo sem snímek přetáhněte či vložte (Ctrl+V)</span>
    </label>
    <p class="snimek-schranka" hidden><button type="button" class="snimek-vlozit" id="snimek-vlozit">Vložit zkopírovaný snímek</button></p>
    <p class="snimek-hlaska" id="snimek-hlaska" role="status"></p>
    <p class="tlumene">Ze snímku čteme jen údaje o&nbsp;nemovitosti, snímek neukládáme. Dům pak potvrdíte na mapě.</p>
    <p><button type="button" class="odkaz" id="bez-snimku">Pokračovat bez snímku</button></p>`);
  const vstup = $("snimek-soubor"), pole = $("snimek-pole");
  const posli = (soubory) => {
    const obrazky = [...soubory].filter((f) => f.type.startsWith("image/")).slice(0, SNIMKU_MAX);
    if (obrazky.length) { document.removeEventListener("paste", vlozeni); zpracujSnimky(obrazky, url).catch(chyba); }
  };
  const vlozeni = (e) => posli([...(e.clipboardData?.files || [])]);
  vstup.addEventListener("change", () => posli(vstup.files));
  document.addEventListener("paste", vlozeni);
  pole.addEventListener("dragover", (e) => { e.preventDefault(); pole.classList.add("nad"); });
  pole.addEventListener("dragleave", () => pole.classList.remove("nad"));
  pole.addEventListener("drop", (e) => { e.preventDefault(); pole.classList.remove("nad"); posli(e.dataTransfer.files); });
  $("bez-snimku").addEventListener("click", () => { document.removeEventListener("paste", vlozeni); bezSnimku(url, true).catch(chyba); });
  // iPhone a iPad: snímek obrazovky → „Kopírovat“ → tady „Vložit“ (Petr 20. 11. 2026). Safari se zeptá bublinou „Vložit“.
  if (navigator.clipboard?.read) {
    $("snimek-vlozit").parentElement.hidden = false;
    const hlaska = (s) => { $("snimek-hlaska").textContent = s; };
    $("snimek-vlozit").addEventListener("click", async () => {
      try {
        const soubory = [];
        for (const pol of await navigator.clipboard.read()) {
          const typ = pol.types.find((x) => x.startsWith("image/"));
          if (typ) soubory.push(new File([await pol.getType(typ)], "snimek", { type: typ }));
        }
        if (soubory.length) posli(soubory);
        else hlaska("Ve schránce není obrázek. Udělejte snímek obrazovky, zvolte Kopírovat a zkuste to znovu.");
      } catch {
        hlaska("Vložení ze schránky prohlížeč nepovolil. Vyberte prosím snímek tlačítkem výše.");
      }
    });
  }
}

// Místo z adresy odkazu (ulice, část obce, obec) – doplní snímek, na kterém místo chybí (Jezevčí, Šeberov, 20. 11. 2026).
async function mistoZOdkazu(url) {
  const lok = lokalitaZOdkazu(url);
  if (!lok?.lokalita) return {};
  const kand = await geokoduj(lok.lokalita, 10).catch(() => []);
  const obecAdresy = (a) => a.split(",").pop().replace(/^\s*\d{3}\s?\d{2}\s+/, "").replace(/\s+\d+$/, "");
  const am = kand.find((c) => c.attributes.Type === "AdresniMisto" && !/^č\.\s?[pe]\./.test(c.address)
    && bezDiakritiky(lok.lokalita).includes(bezDiakritiky(obecAdresy(c.address))));
  if (!am) {
    const o = kand.find((c) => ["Obec", "CastObce"].includes(c.attributes.Type));
    return o ? { obec: o.address } : {};
  }
  const casti = am.address.split(",").map((s) => s.trim());
  const ulice = casti[0].replace(/\s+\d+(\/\d+\w?)?$/, "");
  return {
    obec: /Praha/.test(am.address) ? "Praha" : obecAdresy(am.address),
    cast: casti.length >= 3 ? casti[1] : null,
    ulice: !lok.bezUlice && bezDiakritiky(lok.lokalita).includes(bezDiakritiky(ulice)) ? ulice : null,
  };
}

// Snímek → díly JPEG o šířce nejvýš 1 000 px a poměru nejvýš 1 : 1,5 (rychlé nahrání z mobilu, bez EXIF). Snímek celé
// stránky z iPhonu (poměr 1 : 15) se zmenšený do jednoho obrázku nedal přečíst – AI pak hádala (Aubrechtové, 20. 11. 2026).
const DILU_MAX = 8;
async function dily(soubor) {
  const bmp = await createImageBitmap(soubor);
  const k = Math.min(1, 1000 / bmp.width);
  const sirka = Math.round(bmp.width * k), vyska = Math.round(bmp.height * k), krok = Math.round(sirka * 1.5);
  const vysledek = [];
  for (let y = 0; y < vyska && vysledek.length < DILU_MAX; y += krok) {
    const c = document.createElement("canvas");
    c.width = sirka; c.height = Math.min(krok, vyska - y);
    c.getContext("2d").drawImage(bmp, 0, y / k, bmp.width, c.height / k, 0, 0, c.width, c.height);
    vysledek.push(await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85)));
  }
  return vysledek;
}

async function zpracujSnimky(soubory, url) {
  window.mer?.("snimek_poslan");
  nacitam(`Čtu ${soubory.length > 1 ? "snímky" : "snímek"} inzerátu…`);
  const fd = new FormData();
  let pocet = 0;
  for (const s of soubory) for (const d of await dily(s)) if (pocet++ < DILU_MAX) fd.append("snimky", d, "snimek.jpg");
  const r = await fetch(`${window.OBJEDNAVKY?.api || "https://api.predkoupi.cz"}/inzerat/snimek`, { method: "POST", body: fd });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    $("vysledek").innerHTML = karta("upresnit", "Snímek se nepodařilo přečíst",
      `<p>${esc(data.detail || "Zkuste to prosím znovu, nebo zadejte adresu do pole nahoře.")}</p>
      <p><button type="button" class="odkaz" id="znovu-snimek">Poslat jiný snímek</button> · <button type="button" class="odkaz" id="bez-snimku">Pokračovat bez snímku</button></p>`);
    $("znovu-snimek").addEventListener("click", () => nabidniSnimek(url));
    $("bez-snimku").addEventListener("click", () => bezSnimku(url, true).catch(chyba));
    return;
  }
  return domZeSnimku(data, url);
}

const cislaAdresy = (adresa) => {   // „Ulice 255/11, …“ → ["255", "11"]; „č.p. 291, …“ → ["291"]
  const m = adresa.split(",")[0].match(/(\d+)(?:\/(\d+\w?))?\s*$/);
  return m ? [m[1], m[2]].filter(Boolean) : [];
};

async function domZeSnimku(d, url) {
  if (d.ve_vystavbe) {
    $("vysledek").innerHTML = karta("upresnit", "Stavba je podle inzerátu ve výstavbě",
      `<p>Nedokončený dům v&nbsp;katastru zatím není, takže ho prověřit neumíme. Zkuste to prosím po kolaudaci.</p>
      <p><button type="button" class="odkaz" id="bez-snimku">Přesto vybrat dům na mapě</button></p>`);
    $("bez-snimku").addEventListener("click", () => bezSnimku(url).catch(chyba));
    return;
  }
  nacitam("Hledám dům v registru adres a katastru…");
  // Co na snímku chybí, doplní adresa odkazu (snímek jen s mapou má ulici u špendlíku, ale ne obec).
  const odk = !d.obec || !(d.ulice || d.ulice_u_spendliku) ? await mistoZOdkazu(url) : {};
  const typOdkazu = lokalitaZOdkazu(url)?.typ;
  d = { ...d, typ: d.typ || (["byt", "dum"].includes(typOdkazu) ? typOdkazu : null), obec: d.obec || odk.obec, cast_obce: d.cast_obce || odk.cast, ulice: d.ulice || (d.ulice_u_spendliku ? null : odk.ulice) };
  const inz = { typ: d.typ, dispozice: d.dispozice, plocha_m2: d.plocha_m2, patro: d.podlazi_bytu, podlazi_budovy: d.podlazi_celkem,
    pozemek_m2: d.pozemek_m2, cena_kc: d.cena_kc, portal: url.hostname.replace(/^www\./, ""), ulice: d.ulice || d.ulice_u_spendliku };
  const obec = d.obec === "Praha" || /^Praha\b/.test(d.obec || "") ? "Praha" : d.obec;
  const sql = (s) => String(s).replace(/'/g, "''");
  let adresy = [];
  if (inz.ulice && obec) adresy = await adresyVUlici(inz.ulice, obec, d.cast_obce);
  if (!adresy.length && inz.ulice) {   // AI ulici občas přečte s chybou („Ježevčí“) → ulice z adresy odkazu
    const zOdkazu = odk.ulice !== undefined ? odk : await mistoZOdkazu(url);
    if (zOdkazu.ulice && zOdkazu.ulice !== inz.ulice) {
      adresy = await adresyVUlici(zOdkazu.ulice, zOdkazu.obec || obec, zOdkazu.cast || d.cast_obce);
      if (adresy.length) inz.ulice = zOdkazu.ulice;
    }
  }
  if (!adresy.length && (d.cast_obce || obec)) {
    const misto = d.cast_obce && d.cast_obce !== obec ? d.cast_obce : obec;
    adresy = (await adresniMista(`adresa like '%${sql(misto)}%'${obec && misto !== obec ? ` and adresa like '%${sql(obec)}%'` : ""}`)).slice(0, 800);
  }
  if (!adresy.length) {
    $("vysledek").innerHTML = karta("upresnit", "Ze snímku nejde určit místo",
      `<p>Na snímku jsme nenašli obec ani ulici. Zadejte prosím adresu do pole nahoře.</p>`);
    return;
  }
  const b = {};
  const kody = [...new Set(adresy.map((a) => a.so))].filter(Boolean);
  for (let i = 0; i < kody.length; i += 100) Object.assign(b, await budovy(kody.slice(i, i + 100)));
  const cisloText = [d.cislo_orientacni, d.cislo_popisne].filter((x) => x != null).map(String);
  // Čísla u špendlíku čte AI z mapy a nejbližší občas splete (Jezevčí: dům pod špendlíkem nemá číslo vidět) → slabší váha.
  const spendlik = (d.presny_spendlik ? d.cisla_u_spendliku || [] : []).map((x) => String(x).trim());
  const podleBudovy = new Map();
  for (const a of adresy) {
    const bud = b[a.so];
    if (!bud) continue;
    const cisla = cislaAdresy(a.adresa);
    let skore = shodaSInzeratem(bud, inz);
    // „X. podlaží z Y“ dům často rozhodne (Aubrechtové: domy se 7, 10 a 13 podlažími); RÚIAN občas počítá i suterén.
    if (d.podlazi_celkem && bud.pocetpodlazi) {
      const rozdil = Math.abs(bud.pocetpodlazi - d.podlazi_celkem);
      skore += rozdil === 0 ? 2 : rozdil === 1 ? 1 : rozdil >= 3 ? -2 : 0;
    }
    const duvody = [];
    if (cisloText.length && (!inz.ulice || naUlici(a.adresa, inz.ulice)) && cisla.some((c) => cisloText.includes(c))) { skore += 10; duvody.push("číslo domu z textu inzerátu"); }
    if (d.zastavena_plocha_m2 && bud.zastavenaplocha) {
      const r = Math.abs(bud.zastavenaplocha - d.zastavena_plocha_m2) / d.zastavena_plocha_m2;
      if (r <= 0.03) { skore += 4; duvody.push(`zastavěná plocha ${bud.zastavenaplocha} m²`); }
      else if (r <= 0.08) skore += 1;
      else if (r > 0.25) skore -= 2;
    }
    if (spendlik.length && cisla.includes(spendlik[0])) { skore += 3; duvody.push("číslo domu u špendlíku na mapě"); }
    else if (cisla.some((c) => spendlik.includes(c))) skore += 1;
    const pred = podleBudovy.get(a.so);
    if (!pred || skore > pred.skore) podleBudovy.set(a.so, { ...a, skore, duvody: pred ? [...new Set([...pred.duvody, ...duvody])] : duvody });
  }
  const poradi = [...podleBudovy.values()].sort((x, y) => y.skore - x.skore);
  const nej = poradi[0]?.skore ?? 0;
  const kandidati = poradi.filter((x) => x.skore >= nej - 1).slice(0, 6);
  const cteno = [TYP_INZERATU[d.typ] || null, d.dispozice, d.plocha_m2 && `${d.plocha_m2.toLocaleString("cs-CZ")} m²`,
    d.podlazi_bytu && `${d.podlazi_bytu}. podlaží${d.podlazi_celkem ? ` z ${d.podlazi_celkem}` : ""}`,
    d.zastavena_plocha_m2 && `zastavěná plocha ${d.zastavena_plocha_m2.toLocaleString("cs-CZ")} m²`, d.pozemek_m2 && `pozemek ${d.pozemek_m2.toLocaleString("cs-CZ")} m²`,
    [inz.ulice, d.cast_obce, obec].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const uvod = `Ze snímku: ${esc(cteno)}. ${kandidati.length === 1 ? "Podle katastru sedí jeden dům – potvrďte ho prosím."
    : `Podle katastru sedí nejlépe ${kandidati.length} ${kandidati.length < 5 ? "domy" : "domů"} – vyberte ten z inzerátu.`}`;
  return vyberNaMape(poradi.slice(0, 120), kandidati, uvod, inz);
}

async function overit(e) {
  e?.preventDefault();
  const tlacitko = document.querySelector("button[type=submit]");
  tlacitko.disabled = true;
  try {
    const text = $("vstup").value.trim();
    window.mer?.("hledani");
    let url = null;
    try { url = new URL(text); } catch { /* adresa */ }
    if (url) return await overitOdkaz(url);

    const start = performance.now();   // limit ochutnávky 5 s se počítá od kliknutí
    nacitam("Hledám v registru adres…");
    const adresy = await geokodujChytre(text);
    const kand = adresy.length ? adresy : await geokoduj(text, 10);
    if (!kand.length) {
      $("vysledek").innerHTML = karta("chyba", "Adresu se nepodařilo najít",
        `<p>V registru adres RÚIAN jsme nic nenašli. Zkontrolujte ulici a číslo, případně přidejte část obce.</p>`);
    } else if (adresy.length === 1) {
      const [a] = await adresyUBodu(adresy[0].location.y, adresy[0].location.x, 1);
      await zobrazBudovu(a, null, { jak: "adresa zadaná uživatelem", jistota: "jistá", start });
    } else {
      const seznam = (await Promise.all(adresy.slice(0, 8).map(async (c) => (await adresyUBodu(c.location.y, c.location.x, 1))[0]))).filter(Boolean);
      seznam.forEach((a) => { a.vzdalenost = null; });
      nabidni(seznam, "Upřesněte adresu",
        seznam.length ? `Zadání odpovídá více adresám. Vyberte správnou, nebo doplňte číslo či část obce.`
                      : `Našli jsme jen ulici, ne konkrétní dům. Doplňte číslo popisné nebo orientační.`, null);
    }
  } catch (err) {
    chyba(err);
  } finally {
    tlacitko.disabled = false;
  }
}

$("formular").addEventListener("submit", overit);

// Předvyplnění z webu Před koupí: ?q=<odkaz nebo adresa> vyplní pole a rovnou ověří.
{
  const q = new URLSearchParams(location.search).get("q");
  if (q) { $("vstup").value = q; $("formular").requestSubmit(); }
}

// Mobil a tablet: plovoucí „Objednat prověrku“, dokud formulář není na obrazovce (Petr 14. 11. 2026).
let plovouciPozorovatel = null;
// Tlačítko v hlavičce (Petr 16. 11. 2026, varianta A): před prověřením „Ceník“ na úvod, po prověření
// „Objednat · od 790 Kč“ k formuláři na této stránce – klient nemusí znovu zadávat adresu.
function hlavickaTlacitko(cil) {
  const h = $("hlavicka-tl");
  if (!h) return;
  h.onclick = null;
  if (!cil) { h.href = "/#ceny"; h.textContent = "Ceník"; return; }
  h.href = "#objednat";
  h.textContent = `Objednat · od ${window.OBJEDNAVKY.ceny.proverka.toLocaleString("cs-CZ")} Kč`;
  h.onclick = (e) => {
    if (!document.body.contains(cil)) { hlavickaTlacitko(null); return; } // nové hledání bez objednávky → zpět na ceník
    e.preventDefault();
    cil.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    cil.querySelector("input, button")?.focus({ preventScroll: true });
  };
}

function plovouciObjednat() {
  document.querySelector(".obj-plovouci")?.remove();
  plovouciPozorovatel?.disconnect();
  const cil = $("objednat");
  hlavickaTlacitko(cil);
  if (!cil || !window.IntersectionObserver) return;
  const tl = document.createElement("a");
  tl.className = "obj-plovouci"; tl.href = "#objednat"; tl.hidden = true;
  tl.textContent = `Objednat prověrku · od ${window.OBJEDNAVKY.ceny.proverka.toLocaleString("cs-CZ")} Kč`;
  tl.addEventListener("click", (e) => {
    e.preventDefault();
    cil.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
  document.body.appendChild(tl);
  // Ukázat, až klient odroluje k přehledu (ne hned nahoře u pole), a schovat, když vidí formulář.
  let vidiFormular = false, vidiPole = true;
  const prepni = () => { tl.hidden = vidiFormular || vidiPole; };
  plovouciPozorovatel = new IntersectionObserver((zaznamy) => {
    zaznamy.forEach((z) => { if (z.target === cil) vidiFormular = z.isIntersecting; else vidiPole = z.isIntersecting; });
    prepni();
  });
  plovouciPozorovatel.observe(cil);
  if ($("vstup")) plovouciPozorovatel.observe($("vstup"));
}
