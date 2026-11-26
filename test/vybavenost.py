"""Vybavenost pro přehled zdarma: potraviny, školy, školky a zastávky MHD v Praze a okolí z OpenStreetMap (Petr 21. 11. 2026).

Veřejné servery Overpass jsou z prohlížeče pomalé a často neodpoví, proto data stáhneme jednou dopředu do malého
souboru na webu (proverit/vybavenost.json) a přehled spočítá nejbližší místa přímo v prohlížeči.

Obnova (stačí jednou za 3 měsíce; od 25. 11. 2026 celý Středočeský kraj, od 26. 11. 2026 Pardubický kraj zvlášť,
aby prohlížeč v Praze nestahoval data celé republiky):
  curl -o /tmp/Prag.osm.pbf https://download.bbbike.org/osm/bbbike/Prag/Prag.osm.pbf
  curl -o /tmp/sk.osm.pbf https://download.openstreetmap.fr/extracts/europe/czech_republic/stredocesky-latest.osm.pbf
  curl -o /tmp/pce.osm.pbf https://download.openstreetmap.fr/extracts/europe/czech_republic/pardubicky-latest.osm.pbf
  pip install osmium
  python3 test/vybavenost.py praha /tmp/Prag.osm.pbf /tmp/sk.osm.pbf
  python3 test/vybavenost.py pardubicky /tmp/pce.osm.pbf
Licence dat: © přispěvatelé OpenStreetMap, ODbL (uvádíme u řádku Vybavenost a ve zdrojích přehledu).
"""
import json
import sys
from datetime import date
from pathlib import Path

import osmium

# Obdélníky krajů z RÚIAN (+ cca 3 km, aby dům u hranice kraje viděl obchod za ní). Soubor a obdélník musí sedět
# s OCH_VYBAVENOST_SOUBORY v proverit/ochutnavka.js.
OBLASTI = {
    "praha": ("vybavenost.json", (49.40, 50.66, 13.29, 15.61)),              # Praha a Středočeský kraj (Petr 25. 11. 2026)
    "pardubicky": ("vybavenost-pardubicky.json", (49.47, 50.28, 15.30, 17.00)),  # Pardubický kraj (Petr 26. 11. 2026)
}
JIH = SEVER = ZAPAD = VYCHOD = None


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
        self.body = {k: set() for k in "pskahmvtz"}

    def _pridej(self, d, lat, lon):
        if d and JIH <= lat <= SEVER and ZAPAD <= lon <= VYCHOD:
            self.body[d].add((round(lat, 5), round(lon, 5)))

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
    global JIH, SEVER, ZAPAD, VYCHOD
    nazev, (JIH, SEVER, ZAPAD, VYCHOD) = OBLASTI[sys.argv[1]]
    s = Sber()
    for soubor in sys.argv[2:]:
        s.apply_file(soubor, locations=True)
    vystup = {"zdroj": "© přispěvatelé OpenStreetMap (ODbL)", "stav": date.today().isoformat(),
              **{k: [x for b in sorted(v) for x in b] for k, v in s.body.items()}}   # ploché pole lat, lon, lat, lon…
    cil = Path(__file__).resolve().parent.parent / "proverit" / nazev
    cil.write_text(json.dumps(vystup, separators=(",", ":")))
    print(cil, f"{cil.stat().st_size // 1024} kB", {k: len(v) for k, v in s.body.items()})


if __name__ == "__main__":
    main()
