"""Vybavenost pro přehled zdarma: potraviny, školy, školky, lékárny, hřiště a zastávky z OpenStreetMap (Petr 21. 11. 2026).

Veřejné servery Overpass jsou z prohlížeče pomalé a často neodpoví, proto data stáhneme jednou dopředu do malých
souborů na webu a přehled spočítá nejbližší místa přímo v prohlížeči.

Od 28. 11. 2026 celá ČR po dlaždicích (dřív soubory po krajích): proverit/vybavenost/<řádek>_<sloupec>.json, dlaždice
0,2° šířky × 0,3° délky (cca 22 × 22 km), řádek = floor(lat / 0,2), sloupec = floor(lon / 0,3). Prohlížeč stáhne jen
dlaždice, do kterých zasahuje okolí domu 3 km (1–4 soubory). Dlaždice bez míst se nezapisuje (prohlížeč bere 404 jako
prázdnou). Rozměr dlaždice musí sedět s OCH_DLAZDICE v proverit/ochutnavka.js.

Obnova (stačí jednou za 3 měsíce):
  curl -o /tmp/cr.osm.pbf https://download.openstreetmap.fr/extracts/europe/czech_republic-latest.osm.pbf
  pip install osmium
  python3 test/vybavenost.py /tmp/cr.osm.pbf
Licence dat: © přispěvatelé OpenStreetMap, ODbL (uvádíme ve zdrojích přehledu).
"""
import json
import math
import shutil
import sys
from datetime import date
from pathlib import Path

import osmium

DLAZDICE_LAT, DLAZDICE_LON = 0.2, 0.3


def dlazdice(lat, lon):
    return f"{math.floor(lat / DLAZDICE_LAT)}_{math.floor(lon / DLAZDICE_LON)}"


def druh(t):
    """Kód místa: p potraviny, s škola, k školka, a lékárna, h hřiště nebo park,
    m metro, v vlak, t tramvaj, z autobus (rozšířeno 21. 11. 2026, recenze: „vybavenost by šla trochu rozšířit“)."""
    if t.get("shop") in ("supermarket", "convenience", "greengrocer"):
        return "p"   # potraviny
    am = t.get("amenity")
    if am == "school":
        return "s"
    if am == "kindergarten":
        return "k"
    # Lékaře OSM v Praze zachycuje jen zčásti (cca 400 míst) – „lékař dál než 1 km“ by klamal, proto ne.
    if am == "pharmacy" or t.get("healthcare") == "pharmacy":
        return "a"
    if t.get("leisure") in ("playground", "park"):
        return "h"
    if t.get("station") == "subway" or (t.get("railway") == "station" and t.get("subway") == "yes"):
        return "m"
    if t.get("railway") in ("station", "halt") and t.get("station") not in ("subway", "light_rail"):
        return "v"
    if t.get("railway") == "tram_stop" or (t.get("public_transport") == "stop_position" and t.get("tram") == "yes"):
        return "t"
    if t.get("highway") == "bus_stop":
        return "z"   # autobus
    return None


class Sber(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.body = {}   # dlaždice → kód → množina (lat, lon)

    def _pridej(self, d, lat, lon):
        if d:
            self.body.setdefault(dlazdice(lat, lon), {}).setdefault(d, set()).add((round(lat, 5), round(lon, 5)))

    def node(self, n):
        d = druh(n.tags)
        if d:
            self._pridej(d, n.location.lat, n.location.lon)

    def way(self, w):
        d = druh(w.tags)
        if not d:
            return
        try:
            body = [(x.lat, x.lon) for x in w.nodes if x.location.valid()]
        except osmium.InvalidLocationError:
            return
        if body:
            self._pridej(d, sum(b[0] for b in body) / len(body), sum(b[1] for b in body) / len(body))


def main():
    s = Sber()
    for soubor in sys.argv[1:]:
        s.apply_file(soubor, locations=True)
    if sum(len(v) for t in s.body.values() for v in t.values()) < 50000:
        sys.exit("Podezřele málo míst – je vstupem celá ČR? Nic nepřepisuji.")
    koren = Path(__file__).resolve().parent.parent / "proverit"
    cil = koren / "vybavenost"
    shutil.rmtree(cil, ignore_errors=True)
    cil.mkdir()
    stav = date.today().isoformat()
    for klic, druhy in s.body.items():
        vystup = {"stav": stav, **{k: [x for b in sorted(v) for x in b] for k, v in sorted(druhy.items())}}   # ploché pole lat, lon…
        (cil / f"{klic}.json").write_text(json.dumps(vystup, separators=(",", ":")))
    velikosti = sorted(f.stat().st_size for f in cil.iterdir())
    print(f"{cil}: {len(velikosti)} dlaždic, celkem {sum(velikosti) // 1024} kB, největší {velikosti[-1] // 1024} kB, "
          f"medián {velikosti[len(velikosti) // 2] // 1024} kB")
    for stary in ("vybavenost.json", "vybavenost-pardubicky.json"):   # soubory po krajích (do 28. 11. 2026)
        (koren / stary).unlink(missing_ok=True)


if __name__ == "__main__":
    main()
