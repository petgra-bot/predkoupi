"""Vybavenost pro přehled zdarma: potraviny, školy, školky a zastávky MHD v Praze a okolí z OpenStreetMap (Petr 21. 11. 2026).

Veřejné servery Overpass jsou z prohlížeče pomalé a často neodpoví, proto data stáhneme jednou dopředu do malého
souboru na webu (proverit/vybavenost.json) a přehled spočítá nejbližší místa přímo v prohlížeči.

Obnova (stačí jednou za 3 měsíce; od 21. 11. 2026 i okresy Praha-východ a Praha-západ):
  curl -o /tmp/Prag.osm.pbf https://download.bbbike.org/osm/bbbike/Prag/Prag.osm.pbf
  curl -o /tmp/sk.osm.pbf https://download.openstreetmap.fr/extracts/europe/czech_republic/stredocesky-latest.osm.pbf
  pip install osmium
  python3 test/vybavenost.py /tmp/Prag.osm.pbf /tmp/sk.osm.pbf
Licence dat: © přispěvatelé OpenStreetMap, ODbL (uvádíme u řádku Vybavenost a ve zdrojích přehledu).
"""
import json
import sys
from datetime import date
from pathlib import Path

import osmium

# Praha a okresy Praha-východ a Praha-západ (obdélník okresů z RÚIAN; zbytek kraje by soubor jen zvětšil).
JIH, SEVER, ZAPAD, VYCHOD = 49.76, 50.32, 14.07, 14.98


def druh(t):
    if t.get("shop") in ("supermarket", "convenience", "greengrocer"):
        return "p"   # potraviny
    if t.get("amenity") == "school":
        return "s"
    if t.get("amenity") == "kindergarten":
        return "k"
    if (t.get("highway") == "bus_stop" or t.get("railway") in ("tram_stop", "station", "halt")
            or t.get("station") == "subway" or (t.get("public_transport") == "stop_position" and t.get("tram") == "yes")):
        return "z"   # zastávka MHD
    return None


class Sber(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.body = {"p": set(), "s": set(), "k": set(), "z": set()}

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
    s = Sber()
    for soubor in sys.argv[1:]:
        s.apply_file(soubor, locations=True)
    vystup = {"zdroj": "© přispěvatelé OpenStreetMap (ODbL)", "stav": date.today().isoformat(),
              **{k: [x for b in sorted(v) for x in b] for k, v in s.body.items()}}   # ploché pole lat, lon, lat, lon…
    cil = Path(__file__).resolve().parent.parent / "proverit" / "vybavenost.json"
    cil.write_text(json.dumps(vystup, separators=(",", ":")))
    print(cil, f"{cil.stat().st_size // 1024} kB", {k: len(v) for k, v in s.body.items()})


if __name__ == "__main__":
    main()
