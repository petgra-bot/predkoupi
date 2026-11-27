// Obrázky pro sdílení článků (og:image, 1200×630) – Petr 19. 11. 2026. Nový článek: přidat řádek do pole clanky a spustit: node test/og-obrazky.js
// Od 27. 11. 2026 (Petr: „každý post je stejný, nudné“) má každý článek pozadí ze skutečné úřední mapy k tématu:
// python3 test/og-pozadi.py vytvoří pruvodce/obrazky/pozadi/<článek>.jpg, šestý sloupec = barevnost (1 = mapová vrstva barevně) a zdroj.
const { chromium } = require('playwright'); const fs = require('fs');
const D=process.env.NEMO_SABLONA || '../automatic-enigma/nemo/sablona', O='pruvodce/obrazky';
const f = w => fs.readFileSync(D+'/fonty/montserrat-'+w+'-normal.woff2').toString('base64');
const font = ['400','600','800'].map(w=>['latin','latin-ext'].map(s=>`@font-face{font-family:M;font-weight:${w};src:url(data:font/woff2;base64,${f(s+'-'+w)})}`).join('')).join('');
const logo = 'data:image/svg+xml;base64,'+fs.readFileSync(D+'/logo/final/logo-vodorovne-bile.svg').toString('base64');
const clanky = [
 ['vypis-z-katastru','Průvodce · katastr','Jak číst výpis<br>z katastru','List vlastnictví oddíl po oddílu', 0, 'Katastrální mapa a ortofoto © ČÚZK'],
 ['hlukova-mapa','Průvodce · hluk','Hlukové mapy<br>Prahy','Jak zjistit hluk u bytu před koupí', 1, 'Hluková mapa 2022 © IPR Praha, ortofoto © ČÚZK'],
 ['zaplavova-uzemi','Průvodce · povodně','Záplavová území<br>v Praze','Jak zjistit riziko povodně před koupí', 1, 'Záplavová území VÚV T. G. M., ortofoto © ČÚZK'],
 ['fond-oprav-svj','Průvodce · SVJ','Fond oprav SVJ<br>před koupí bytu','Závěrky, úvěry a dluhy prodávajícího', 0, 'Ortofoto © ČÚZK'],
 ['vecne-bremeno','Průvodce · katastr','Věcné břemeno<br>při koupi','Co přechází na vás a jak se ruší', 0, 'Parcely a ortofoto © ČÚZK'],
 ['kontrola-bytu','Průvodce · byt','Kontrola bytu<br>před koupí','Co prověřit a kde to najdete zdarma', 0, 'Ortofoto © ČÚZK'],
 ['kontrola-domu','Průvodce · rodinný dům','Kontrola domu<br>před koupí','Co prověřit a kde to najdete zdarma', 0, 'Parcely a ortofoto © ČÚZK'],
];
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1200,height:630}});
 for (const [s,stitek,nadpis,pod,barevne,zdroj] of clanky) {
  const poz = O+'/pozadi/'+s+'.jpg', bg = fs.existsSync(poz) ? 'data:image/jpeg;base64,'+fs.readFileSync(poz).toString('base64') : '';
  // Mapa vpravo: bez barev do modra (mix-blend luminosity), mapové vrstvy povodní a hluku napůl barevně; vlevo plná modrá pod textem.
  await p.setContent('<style>'+font+'*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;overflow:hidden;font-family:M}</style>'+
  `<div style="background:#1e2645;width:100%;height:100%;padding:72px 84px;color:#fff;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden">
   ${bg ? `<div style="position:absolute;top:0;right:0;bottom:0;width:78%;background:url(${bg}) center/cover;filter:${barevne ? 'saturate(.75) brightness(.9) contrast(1.05)' : 'grayscale(1) contrast(1.15) brightness(1.05)'};${barevne ? '' : 'mix-blend-mode:luminosity;'}opacity:${barevne ? .95 : .9}"></div>
   <div style="position:absolute;inset:0;background:linear-gradient(90deg,#1e2645 0%,#1e2645 24%,rgba(30,38,69,.86) 42%,rgba(30,38,69,${barevne ? '.38' : '.5'}) 70%,rgba(30,38,69,${barevne ? '.22' : '.35'}) 100%)"></div>
   <div style="position:absolute;right:18px;bottom:12px;font-size:13px;color:rgba(255,255,255,.6)">${zdroj}</div>` : ''}
   <img src="${logo}" style="height:46px;align-self:flex-start;position:relative">
   <div style="position:relative"><div style="font-weight:600;letter-spacing:.18em;font-size:22px;color:#aab0c8;text-transform:uppercase;margin-bottom:20px">${stitek}</div>
   <div style="font-weight:800;font-size:76px;line-height:1.04;text-transform:uppercase;text-shadow:0 2px 24px rgba(20,26,50,.6)">${nadpis}</div>
   <div style="font-size:30px;margin-top:24px;color:#dfe2ec;border-top:2px solid rgba(255,255,255,.25);padding-top:22px;max-width:900px">${pod}</div></div></div>`);
  await p.waitForTimeout(200); await p.screenshot({path:O+'/'+s+'.png'});
 } await b.close(); })();
