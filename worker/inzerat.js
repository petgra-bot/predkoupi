// Cloudflare Worker: přečte jeden inzerát, který zadal uživatel, a vrátí jen údaje potřebné
// k identifikaci nemovitosti. Nic neukládá kromě krátké cache odpovědi (1 h).
//   GET /?url=https://www.sreality.cz/detail/...   → JSON
//   POST /zajem (email=…)                            → uloží e-mail zájemce do KV „ZAJEMCI“ (jen z povolených webů)
const POVOLENE_ORIGINY = [/^https:\/\/proverka\.gratzer\.cz$/, /^https:\/\/(www\.)?predkoupi\.cz$/, /^http:\/\/localhost(:\d+)?$/];
// Sreality ne: jejich robots.txt zakazuje automatické čtení všem kromě vyhledávačů. Inzeráty ze Sreality čte
// záložka „Prověřit“ v prohlížeči uživatele (app.js → zalozka).
const PORTALY = {
  "bezrealitky.cz": bezrealitky,
  "reality.idnes.cz": idnes,
};

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = POVOLENE_ORIGINY.some((r) => r.test(origin))
      ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {};
    if (request.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST" } });
    if (request.method === "POST" && new URL(request.url).pathname === "/zajem") return zajemce(request, env, cors, origin);

    const odpoved = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", ...cors },
    });

    let cil;
    try { cil = new URL(new URL(request.url).searchParams.get("url") || ""); } catch { return odpoved({ chyba: "Neplatný odkaz." }, 400); }
    const host = cil.hostname.replace(/^www\./, "");
    const parser = Object.entries(PORTALY).find(([h]) => host === h || host.endsWith("." + h))?.[1];
    if (!parser || cil.protocol !== "https:") return odpoved({ chyba: "Tento portál zatím neumíme přečíst.", portal: host }, 422);

    const cache = caches.default;
    const klic = new Request(`https://cache.local/${encodeURIComponent(cil.href)}`);
    const ulozeno = await cache.match(klic);
    if (ulozeno) return new Response(ulozeno.body, { headers: { ...Object.fromEntries(ulozeno.headers), ...cors } });

    let r;
    try {
      r = await fetch(cil.href, { headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ProverkaNemovitosti/0.1; +https://proverka.gratzer.cz)",
        "Accept": "text/html", "Accept-Language": "cs" } });
    } catch (e) {
      // Portál odmítl automatický dotaz (např. smyčkou přesměrování). Neobcházíme to.
      return odpoved({ chyba: "Portál automatické čtení inzerátu nepovoluje.", portal: host }, 502);
    }
    if (!r.ok) return odpoved({ chyba: `Portál vrátil ${r.status}.`, portal: host }, 502);
    let data;
    try { data = { portal: host, url: cil.href, ...parser(await r.text(), cil) }; }
    catch (e) { return odpoved({ chyba: "Inzerát se nepodařilo přečíst.", portal: host, detail: String(e) }, 502); }
    const vysledek = odpoved(data);
    ctx.waitUntil(cache.put(klic, vysledek.clone()));
    return vysledek;
  },
};

function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("chybí __NEXT_DATA__");
  return JSON.parse(m[1]);
}

const PRESNOST_SREALITY = { address: "adresa", gps: "gps", street: "ulice" };

function sreality(html, url) {
  const dotazy = nextData(html).props.pageProps.dehydratedState.queries;
  // Inzerát je dotaz „estate“; adresa agentury je v premise.locality, tu nechceme.
  const d = dotazy.find((q) => q.queryKey?.[0] === "estate")?.state?.data
    || dotazy.map((q) => q.state?.data).find((x) => x && x.locality && x.params);
  if (!d) throw new Error("chybí data inzerátu");
  const l = d.locality || {}, p = d.params || {};
  const cesta = url.pathname.split("/").filter(Boolean);
  return {
    nazev: d.name?.replace(/ /g, " "),
    typ: { Byty: "byt", Domy: "dum", Pozemky: "pozemek" }[d.categoryMainCb?.name] || cesta[2] || null,
    dispozice: d.categorySubCb?.name || null,
    ulice: l.street || null,
    cislo_popisne: l.houseNumber || null,
    cislo_orientacni: l.streetNumber || null,
    ruian_adresa: null,
    presnost: PRESNOST_SREALITY[l.inaccuracyType] || l.inaccuracyType || null,
    lat: l.latitude ?? null, lon: l.longitude ?? null,
    obec: l.city || null, cast_obce: l.cityPart || l.ward || null, mestska_cast: l.quarter || null,
    patro: p.floorNumber ?? null, podlazi_budovy: p.floors ?? null,
    plocha_m2: p.usableArea ?? p.floorArea ?? null, pozemek_m2: p.estateArea ?? null,
    cena_kc: d.priceCzk ?? null,
    konstrukce: p.buildingType?.name || null, stav: p.buildingCondition?.name || null,
    vlastnictvi: p.ownership?.name || null,
  };
}

function bezrealitky(html) {
  const props = nextData(html).props.pageProps;
  const a = props.origAdvert || Object.entries(props.apolloCache || {}).find(([k]) => k.startsWith("Advert:"))?.[1];
  if (!a) throw new Error("chybí data inzerátu");
  const adresa = a.address || "";
  return {
    nazev: a.pageTitle || a.imageAltText || null,
    typ: { BYT: "byt", DUM: "dum", POZEMEK: "pozemek" }[a.estateType] || a.estateType?.toLowerCase() || null,
    dispozice: a.disposition ? a.disposition.replace(/^DISP_/, "").replace(/_/g, "+").replace("+KK", "+kk") : null,
    ulice: a.street || null,
    cislo_popisne: a.houseNumber || null,
    cislo_orientacni: null,
    ruian_adresa: a.ruianId || null,
    presnost: a.ruianId ? "ruian" : a.gps ? "gps" : "ulice",
    lat: a.gps?.lat ?? null, lon: a.gps?.lng ?? null,
    obec: a.city || null, cast_obce: adresa.includes(" - ") ? adresa.split(" - ").pop() : null, mestska_cast: null,
    patro: a.etage ?? null, podlazi_budovy: a.totalFloors ?? null,
    plocha_m2: a.surface ?? null, pozemek_m2: a.surfaceLand ?? null,
    cena_kc: a.price ?? null, konstrukce: a.construction || null, stav: a.condition || null, vlastnictvi: a.ownership || null,
  };
}

function idnes(html, url) {
  const text = (s) => s?.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&zwj;| /g, " ").replace(/\s+/g, " ").trim() || null;
  const nazev = text(html.match(/<h1[^>]*class="b-detail__title"[^>]*>([\s\S]*?)<\/h1>/)?.[1]);
  const misto = text(html.match(/<p class="b-detail__info">([\s\S]*?)<\/p>/)?.[1]);
  const parametry = {};
  for (const m of html.matchAll(/<dt>([^<]+)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) parametry[text(m[1])] = text(m[2]);
  // „Lindleyova, Praha 6 - Dejvice“ → ulice, městská část, část obce
  const [ulice, zbytek] = (misto || "").includes(",") ? misto.split(/,\s*/, 2) : [null, misto];
  const [mc, cast] = (zbytek || "").split(/\s+-\s+/);
  const cislo = (s) => { const m = String(s || "").match(/\d+/); return m ? +m[0] : null; };
  const patro = parametry["Podlaží"]?.match(/\((\d+)\.\s*NP\)/)?.[1] ?? cislo(parametry["Podlaží"]);
  const cesta = url.pathname.split("/").filter(Boolean);
  // Špendlík z mapy je v dataLayer stránky („listing_lat“, „listing_lon“).
  const souradnice = (k) => { const m = html.match(new RegExp(`"listing_${k}"\\s*:\\s*(-?[\\d.]+)`)); return m ? +m[1] : null; };
  const lat = souradnice("lat"), lon = souradnice("lon");
  return {
    nazev, typ: cesta[2] || null, dispozice: nazev?.match(/\d\+(?:kk|\d)/)?.[0] || null,
    ulice: ulice || null, cislo_popisne: null, cislo_orientacni: null, ruian_adresa: null,
    presnost: lat ? "gps" : ulice ? "ulice" : "lokalita", lat, lon,
    obec: mc?.startsWith("Praha") ? "Praha" : mc || null, cast_obce: cast || null, mestska_cast: mc || null,
    patro: patro ? +patro : null, podlazi_budovy: cislo(parametry["Počet podlaží budovy"]),
    plocha_m2: cislo(parametry["Užitná plocha"]), pozemek_m2: cislo(parametry["Plocha pozemku"]),
    cena_kc: cislo(parametry["Cena"]?.replace(/\s/g, "")), konstrukce: parametry["Konstrukce budovy"] || null,
    stav: parametry["Stav bytu"] || parametry["Stav budovy"] || null, vlastnictvi: parametry["Vlastnictví"] || null,
  };
}

export const _test = { sreality, bezrealitky, idnes };

// Zájemci o spuštění placené služby: e-mail + datum, nic dalšího. Po rozeslání oznámení se smažou.
async function zajemce(request, env, cors, origin) {
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors } });
  if (!POVOLENE_ORIGINY.some((r) => r.test(origin))) return json({ chyba: "Nepovolený původ." }, 403);
  if (!env.ZAJEMCI) return json({ chyba: "Ukládání není nastavené." }, 503);
  let form;
  try { form = await request.formData(); } catch { return json({ chyba: "Neplatný formulář." }, 400); }
  if (form.get("web")) return json({ ok: true });                       // past na roboty (skryté pole)
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ chyba: "Zadejte e-mail ve tvaru jmeno@example.cz." }, 400);
  // Nejvýš 10 zápisů za hodinu z jedné IP adresy (IP se ukládá jen jako otisk a sama zmizí).
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const otisk = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip)))].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  const limitKlic = `limit:${otisk}`;
  const pocet = Number(await env.ZAJEMCI.get(limitKlic)) || 0;
  if (pocet >= 10) return json({ chyba: "Příliš mnoho pokusů, zkuste to později." }, 429);
  await env.ZAJEMCI.put(limitKlic, String(pocet + 1), { expirationTtl: 3600 });
  const zdroj = String(form.get("zdroj") || "").slice(0, 40);
  await env.ZAJEMCI.put(`email:${email}`, JSON.stringify({ email, datum: new Date().toISOString(), zdroj }));
  return json({ ok: true });
}
