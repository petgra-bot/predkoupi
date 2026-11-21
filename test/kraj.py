"""Mapka Středočeského kraje s okresy pro přehled zdarma a průběh (okolí Prahy, Petr 21. 11. 2026).

Stejný princip jako mapka Prahy v objednavka/praha.js: obrysy z RÚIAN (S-JTSK), zjednodušené, převedené do SVG
cest v rámečku w × h. Výstup objednavka/kraj.js (window.KRAJ). Obnova jen při změně hranic: python3 test/kraj.py
"""
import json
import urllib.parse
import urllib.request
from pathlib import Path

RUIAN = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer"
OKRESY = {3201: "Benešov", 3202: "Beroun", 3203: "Kladno", 3204: "Kolín", 3205: "Kutná Hora", 3206: "Mělník",
          3207: "Mladá Boleslav", 3208: "Nymburk", 3209: "Praha-východ", 3210: "Praha-západ", 3211: "Příbram",
          3212: "Rakovník"}
W = 200


def dotaz(vrstva, where):
    q = urllib.parse.urlencode({"where": where, "outFields": "kod,nazev", "returnGeometry": "true", "outSR": 5514,
                                "maxAllowableOffset": 400, "geometryPrecision": 0, "f": "json"})
    with urllib.request.urlopen(f"{RUIAN}/{vrstva}/query?{q}", timeout=60) as r:
        return json.load(r)["features"]


def main():
    okresy = dotaz(15, f"kod in ({','.join(map(str, OKRESY))})")
    praha = dotaz(12, "kod=554782")   # obec Praha
    body = [b for f in okresy for r in f["geometry"]["rings"] for b in r]
    x0, x1 = min(b[0] for b in body), max(b[0] for b in body)
    y0, y1 = min(b[1] for b in body), max(b[1] for b in body)
    h = round(W * (y1 - y0) / (x1 - x0))

    def cesta(rings):
        return " ".join("M" + " L".join(f"{(x - x0) / (x1 - x0) * W:.1f},{(y1 - y) / (y1 - y0) * h:.1f}" for x, y in r) + "Z"
                        for r in rings if len(r) > 3)
    data = {"x0": round(x0), "x1": round(x1), "y0": round(y0), "y1": round(y1), "w": W, "h": h,
            "okresy": [{"n": OKRESY[f["attributes"]["kod"]], "d": cesta(f["geometry"]["rings"])} for f in okresy],
            "praha": cesta(praha[0]["geometry"]["rings"])}
    cil = Path(__file__).resolve().parent.parent / "objednavka" / "kraj.js"
    cil.write_text("// Mapka Středočeského kraje s okresy (RÚIAN, generuje test/kraj.py)\nwindow.KRAJ = "
                   + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(cil, f"{cil.stat().st_size // 1024} kB", len(data["okresy"]), "okresů", W, "×", h)


if __name__ == "__main__":
    main()
