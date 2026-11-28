"""Mapka České republiky s kraji a okresy pro přehled zdarma a průběh mimo Prahu (Petr 21. 11. 2026 Středočeský kraj,
26. 11. Pardubický, 28. 11. 2026 celá ČR).

Stejný princip jako mapka Prahy v objednavka/praha.js: obrysy z RÚIAN (S-JTSK), zjednodušené, převedené do SVG
cest v rámečku w × h. Výstup objednavka/kraj.js (window.KRAJ). Obnova jen při změně hranic: python3 test/kraj.py
"""
import json
import urllib.parse
import urllib.request
from pathlib import Path

RUIAN = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer"
W = 260
ZJEDNODUSENI_M = 1500   # 1 px mapky je cca 1,9 km; víc bodů by jen zvětšilo soubor


def dotaz(vrstva, where):
    q = urllib.parse.urlencode({"where": where, "outFields": "kod,nazev", "returnGeometry": "true", "outSR": 5514,
                                "maxAllowableOffset": ZJEDNODUSENI_M, "geometryPrecision": 0, "f": "json"})
    with urllib.request.urlopen(f"{RUIAN}/{vrstva}/query?{q}", timeout=60) as r:
        return json.load(r)["features"]


def main():
    okresy = [f for f in dotaz(15, "1=1") if f["attributes"]["kod"] != 3100]   # bez okresu Hlavní město Praha (kreslí se zvlášť)
    kraje = dotaz(17, "1=1")
    praha = dotaz(12, "kod=554782")   # obec Praha
    assert len(okresy) == 76 and len(kraje) == 14, (len(okresy), len(kraje))
    body = [b for f in kraje for r in f["geometry"]["rings"] for b in r]
    x0, x1 = min(b[0] for b in body), max(b[0] for b in body)
    y0, y1 = min(b[1] for b in body), max(b[1] for b in body)
    h = round(W * (y1 - y0) / (x1 - x0))

    def cesta(rings):
        return " ".join("M" + " L".join(f"{(x - x0) / (x1 - x0) * W:.1f},{(y1 - y) / (y1 - y0) * h:.1f}" for x, y in r) + "Z"
                        for r in rings if len(r) > 3)
    data = {"x0": round(x0), "x1": round(x1), "y0": round(y0), "y1": round(y1), "w": W, "h": h,
            "okresy": [{"n": f["attributes"]["nazev"], "d": cesta(f["geometry"]["rings"])} for f in okresy],
            "kraje": " ".join(cesta(f["geometry"]["rings"]) for f in kraje),
            "praha": cesta(praha[0]["geometry"]["rings"])}
    cil = Path(__file__).resolve().parent.parent / "objednavka" / "kraj.js"
    cil.write_text("// Mapka České republiky s kraji a okresy (RÚIAN, generuje test/kraj.py)\nwindow.KRAJ = "
                   + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(cil, f"{cil.stat().st_size // 1024} kB", len(data["okresy"]), "okresů", len(kraje), "krajů", W, "×", h)


if __name__ == "__main__":
    main()
