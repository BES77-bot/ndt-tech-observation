// Renders app icons (run once: node make-icons.mjs)
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
for (const [s, f] of [[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'apple-touch-icon.png']]) {
  await p.setViewport({ width: s, height: s });
  await p.setContent(`<body style="margin:0;width:${s}px;height:${s}px;background:#0b3a6e;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,Helvetica,Arial;color:#fff">
<div style="font-weight:800;font-size:${s * .3}px;letter-spacing:-.02em">NDT</div>
<div style="width:${s * .5}px;height:${s * .035}px;background:#f5b800;margin:${s * .03}px 0"></div>
<div style="font-weight:600;font-size:${s * .12}px">OBSERVE</div></body>`);
  await p.screenshot({ path: '../icons/' + f });
}
await b.close();
