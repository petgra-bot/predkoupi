// Obrázky pro sdílení článků (og:image, 1200×630) – Petr 19. 11. 2026. Nový článek: přidat řádek do pole clanky a spustit: node test/og-obrazky.js
const { chromium } = require('playwright'); const fs = require('fs');
const D=process.env.NEMO_SABLONA || '../automatic-enigma/nemo/sablona', O='pruvodce/obrazky';
const f = w => fs.readFileSync(D+'/fonty/montserrat-'+w+'-normal.woff2').toString('base64');
const font = ['400','600','800'].map(w=>['latin','latin-ext'].map(s=>`@font-face{font-family:M;font-weight:${w};src:url(data:font/woff2;base64,${f(s+'-'+w)})}`).join('')).join('');
const logo = 'data:image/svg+xml;base64,'+fs.readFileSync(D+'/logo/final/logo-vodorovne-bile.svg').toString('base64');
const clanky = [
 ['vypis-z-katastru','Průvodce · katastr','Jak číst výpis<br>z katastru','List vlastnictví oddíl po oddílu'],
 ['hlukova-mapa','Průvodce · hluk','Hlukové mapy<br>Prahy','Jak zjistit hluk u bytu před koupí'],
 ['zaplavova-uzemi','Průvodce · povodně','Záplavová území<br>v Praze','Jak zjistit riziko povodně před koupí'],
 ['fond-oprav-svj','Průvodce · SVJ','Fond oprav SVJ<br>před koupí bytu','Závěrky, úvěry a dluhy prodávajícího'],
 ['vecne-bremeno','Průvodce · katastr','Věcné břemeno<br>při koupi','Co přechází na vás a jak se ruší'],
 ['kontrola-bytu','Průvodce · byt','Kontrola bytu<br>před koupí','Co prověřit a kde to najdete zdarma'],
 ['kontrola-domu','Průvodce · rodinný dům','Kontrola domu<br>před koupí','Co prověřit a kde to najdete zdarma'],
];
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1200,height:630}});
 for (const [s,stitek,nadpis,pod] of clanky) {
  await p.setContent('<style>'+font+'*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;overflow:hidden;font-family:M}</style>'+
  `<div style="background:#1e2645;width:100%;height:100%;padding:72px 84px;color:#fff;display:flex;flex-direction:column;justify-content:space-between;position:relative">
   <div style="position:absolute;left:84px;right:84px;top:300px;height:2px;background:rgba(255,255,255,.0)"></div>
   <img src="${logo}" style="height:46px;align-self:flex-start">
   <div><div style="font-weight:600;letter-spacing:.18em;font-size:22px;color:#aab0c8;text-transform:uppercase;margin-bottom:20px">${stitek}</div>
   <div style="font-weight:800;font-size:76px;line-height:1.04;text-transform:uppercase">${nadpis}</div>
   <div style="font-size:30px;margin-top:24px;color:#dfe2ec;border-top:2px solid rgba(255,255,255,.25);padding-top:22px;max-width:900px">${pod}</div></div></div>`);
  await p.waitForTimeout(200); await p.screenshot({path:O+'/'+s+'.png'});
 } await b.close(); })();
