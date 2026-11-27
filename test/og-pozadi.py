"""Pozadí obrázků pro sdílení článků ze skutečných úředních map (Petr 27. 11. 2026: každý obrázek jiný, podle tématu).

Podklady: ortofoto © ČÚZK, záplavová území VÚV T. G. M., hlukové mapy © IPR Praha / hl. m. Praha (Geoportál Praha), parcely RÚIAN © ČÚZK.
Výřez: šířka ve stupních ≈ 2,4× výška (poměr obrázku 1400 : 900 na 50° s. š.).
Výstup pruvodce/obrazky/pozadi/<článek>.jpg (1400×900); test/og-obrazky.js je složí s textem. Nový článek: řádek do POZADI.
Spuštění: python3 test/og-pozadi.py [článek]
"""
import io
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ORTO = "https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/MapServer/export"
RUIAN = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/export"
ZAPLAVY = "https://gs-pub.praha.eu/arcgis/rest/services/ti/zaplavy/MapServer/export"
HLUK = "https://gs-pub.praha.eu/arcgis/rest/services/hm/hluk/MapServer/export"
VUV = "https://ags.vuv.cz/arcgis/rest/services/isvs_voda/isvs_voda/MapServer/export"   # záplavová území ČR (13 Q100, 11 aktivní zóna)
W, H = 1400, 900
# článek: (výřez WGS84 západ, jih, východ, sever), vrstvy navrch [(služba, vrstvy, průhlednost)]
POZADI = {
    "zaplavova-uzemi": ((14.400, 50.108, 14.440, 50.1245), [(VUV, "show:13,11", 0.7)]),       # Troja a Holešovice: stoletá voda, aktivní zóna
    "hlukova-mapa": ((14.420, 50.061, 14.445, 50.075), [(HLUK, "show:9", 0.7)]),              # Nuselský most, magistrála
    "fond-oprav-svj": ((14.5155, 50.027, 14.5345, 50.035), []),                                # sídliště Háje
    "kontrola-domu": ((14.660, 50.091, 14.6697, 50.095), [(RUIAN, "show:5", 0.5)]),            # Klánovice, rodinné domy a parcely
    "vecne-bremeno": ((14.6625, 50.0915, 14.667, 50.0934), [(RUIAN, "show:5", 0.9)]),          # Klánovice zblízka: parcely, cesty
    "kontrola-bytu": ((14.430, 50.073, 14.446, 50.083), []),                                  # Vinohrady, bloky
    "vypis-z-katastru": ((14.4335, 50.0735, 14.4415, 50.0785), [(RUIAN, "show:5,3", 0.9)]),   # Vinohrady, katastrální mapa
}


def export(url, bbox, vrstvy=None):
    q = {"bbox": ",".join(map(str, bbox)), "bboxSR": 4326, "imageSR": 5514, "size": f"{W},{H}", "format": "png32",
         "transparent": "true", "f": "image"}
    if vrstvy:
        q["layers"] = vrstvy
    req = urllib.request.Request(url + "?" + urllib.parse.urlencode(q), headers={"User-Agent": "predkoupi.cz obrazky"})
    for pokus in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return Image.open(io.BytesIO(r.read())).convert("RGBA").resize((W, H))
        except OSError:
            if pokus == 3:
                raise
            time.sleep(3 * (pokus + 1))


def main():
    cil = Path(__file__).resolve().parent.parent / "pruvodce" / "obrazky" / "pozadi"
    cil.mkdir(parents=True, exist_ok=True)
    for nazev, (bbox, vrstvy) in POZADI.items():
        if len(sys.argv) > 1 and nazev not in sys.argv[1:]:
            continue
        img = export(ORTO, bbox)
        for url, v, a in vrstvy:
            o = export(url, bbox, v)
            o.putalpha(o.getchannel("A").point(lambda x: int(x * a)))
            img = Image.alpha_composite(img, o)
        img.convert("RGB").save(cil / f"{nazev}.jpg", quality=82)
        print(nazev, "ok")


if __name__ == "__main__":
    main()
