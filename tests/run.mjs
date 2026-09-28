// Headless-Chrome tests. Usage: node run.mjs [test ...]   (no args = full regression)
// Uses fake test data only.
import puppeteer, { KnownDevices } from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(import.meta.dirname, '..');
const TMP = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'ndtobs-'));
const PORT = 8765, BASE = `http://localhost:${PORT}/`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(q.url, BASE).pathname).replace(/\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404).end(); return; }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }).end(fs.readFileSync(f));
}).listen(PORT);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let errors = [];
let n = 0;
const assert = (c, msg) => { if (!c) throw new Error('ASSERT: ' + msg); };

async function launch(name) {
  return puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: path.join(TMP, name), args: ['--no-first-run'] });
}
async function open(b, device = 'iPhone 13') {
  const p = await b.newPage();
  if (device) await p.emulate(KnownDevices[device]); else await p.setViewport({ width: 1280, height: 900 });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  return p;
}
const act = async (p, a, extra = "") => { if (process.env.DBG) console.log("act", a, extra, await p.$$eval(`[data-act="${a}"]${extra}`, x => x.map(e => e.tagName + JSON.stringify(e.getBoundingClientRect()) + e.closest("[hidden]")?.id))); await p.click(`[data-act="${a}"]${extra}`); await sleep(150); };
const fill = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const fp = (p, pth, v) => fill(p, `[data-p="${pth}"]`, v);
const text = (p, sel = 'body') => p.$eval(sel, e => e.innerText);
const stored = (p, id) => p.evaluate(id => new Promise(res => {
  const r = indexedDB.open('sos-ndt-observation');
  r.onsuccess = () => { const q = r.result.transaction('obs').objectStore('obs')[id ? 'get' : 'getAll'](id); q.onsuccess = () => res(q.result); };
}), id);

async function profile(p) {
  await p.waitForSelector('form[data-form=profile]');
  await p.type('input[name=name]', 'Test Observer');
  await p.type('input[name=cert]', 'Test Cert L3');
  await p.click('button[type=submit]');
  await sleep(200);
}
// New ET observation with 2 procedure-specific requirements, on the SETUP step.
async function newObs(p) {
  await act(p, 'new');
  if (await p.$('[data-act=create]:not([data-tpl])')) await act(p, 'create', ':not([data-tpl])');
  await fp(p, 'info.client', 'Client X'); await fp(p, 'info.location', 'Hangar 1');
  await fp(p, 'info.aircraftModel', 'H-60'); await fp(p, 'info.tail', 'TAIL-001');
  await fp(p, 'info.component', 'Test Component'); await fp(p, 'info.partNo', 'PN-1');
  await fp(p, 'info.techName', 'Tech A'); await fp(p, 'info.techCert', 'L2');
  await act(p, 'method', '[data-v=ET]'); if (process.env.DBG) console.log((await text(p)).slice(0, 600), errors);
  await fp(p, 'proc.manual', 'TM-TEST'); await fp(p, 'proc.wp', 'WP-TEST'); await fp(p, 'proc.title', 'Test procedure'); await fp(p, 'proc.rev', 'A');
  await act(p, 'step', '[data-v=setup]');
  for (const [s, r, t] of [['1', 'R-1', 'Test requirement one'], ['2', 'R-2', 'Test requirement two']]) {
    await act(p, 'addReq');
    await fill(p, '#reqs .req:last-child [data-rq=step]', s);
    await fill(p, '#reqs .req:last-child [data-rq=ref]', r);
    await fill(p, '#reqs .req:last-child [data-rq=text]', t);
  }
  await sleep(600);
}
const card = key => `[data-key="${key}"]`;
async function answer(p, key, v) { await p.click(`${card(key)} [data-act=resp][data-v=${v}]`); await sleep(120); }
async function procKeys(p) { return p.$$eval('.item[data-key^="p:"]', a => a.map(e => e.dataset.key)); }

const T = {
  async persist() {
    let b = await launch('persist');
    let p = await open(b);
    await profile(p);
    await newObs(p);
    const id = (await stored(p))[0].id;
    await b.close();                                   // browser closed without explicit save
    b = await launch('persist');
    p = await open(b);
    assert((await text(p)).includes('RESUME'), 'resume shown after relaunch');
    await act(p, 'open', `[data-id="${id}"]`);
    const o = await stored(p, id);
    assert(o.info.client === 'Client X' && o.info.method === 'ET' && o.req.length === 2 && o.req[1].text === 'Test requirement two', 'data persisted');
    assert(await p.$('#reqs .req'), 'resumed on SETUP step');
    await b.close();
  },

  async nofind() {
    const b = await launch('nofind'), p = await open(b);
    await profile(p); await newObs(p);
    await act(p, 'step', '[data-v=inspect]');
    const [k1] = await procKeys(p);
    await answer(p, k1, 'N');
    assert(await p.$(`${card(k1)} .fnd`), 'finding fields shown');
    await fill(p, `${card(k1)} [data-rf="f.observed"]`, 'Skipped step');
    await p.select(`${card(k1)} [data-rf="f.cls"]`, 'Technique');
    await sleep(600);
    await act(p, 'step', '[data-v=findings]');
    assert((await text(p, 'main')).includes('Findings (1)') && (await text(p, 'main')).includes('F-1'), 'finding F-1 created');
    await act(p, 'step', '[data-v=inspect]');
    await answer(p, k1, 'Y');
    await act(p, 'step', '[data-v=findings]');
    assert((await text(p, 'main')).includes('Findings (0)'), 'finding removed on NO→YES');
    await act(p, 'step', '[data-v=complete]');
    assert(!(await text(p, 'main')).includes('F-1'), 'no orphan on complete');
    await act(p, 'step', '[data-v=inspect]');
    await answer(p, k1, 'N');
    const v = await p.$eval(`${card(k1)} [data-rf="f.observed"]`, e => e.value);
    assert(v === 'Skipped step', 'finding text retained if switched back to NO');
    // required-description enforcement
    await fill(p, `${card(k1)} [data-rf="f.observed"]`, '');
    await sleep(500);
    await act(p, 'step', '[data-v=complete]');
    assert(await p.$eval('[data-act=complete]', e => e.disabled), 'complete blocked without finding description');
    await b.close();
  },

  async note() {
    const b = await launch('note'), p = await open(b);
    await profile(p); await newObs(p);
    await act(p, 'step', '[data-v=inspect]');
    const [, k2] = await procKeys(p);
    await answer(p, k2, 'NOTE');
    await fill(p, `${card(k2)} [data-rf=c]`, 'Worth noting');
    await sleep(600);
    await act(p, 'step', '[data-v=findings]');
    const t = await text(p, 'main');
    assert(t.includes('Observations (1)') && t.includes('O-1') && t.includes('Findings (0)'), 'NOTE → observation, not finding');
    assert(await p.$eval(`${card(k2)} [data-rf=c]`, e => e.value === 'Worth noting'), 'observation text shown');
    await b.close();
  },

  async tpl() {
    const b = await launch('tpl'), p = await open(b);
    await profile(p); await newObs(p);
    await act(p, 'step', '[data-v=inspect]');
    await answer(p, (await procKeys(p))[0], 'Y');
    await act(p, 'step', '[data-v=setup]');
    await fill(p, '#tplName', 'Test Template');
    await act(p, 'saveTpl');
    const t = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('sos-ndt-observation'); r.onsuccess = () => { const q = r.result.transaction('tpl').objectStore('tpl').getAll(); q.onsuccess = () => res(q.result); }; }));
    assert(t.length === 1 && t[0].req.length === 2 && t[0].proc.wp === 'WP-TEST' && t[0].info.method === 'ET', 'template content');
    const js = JSON.stringify(t[0]);
    assert(!/Tech A|TAIL-001|Client X|resp|sig/.test(js), 'template excludes technician/tail/client/responses/signatures');
    await act(p, 'home'); await act(p, 'new');
    await act(p, 'create', `[data-tpl="${t[0].id}"]`);
    const all = await stored(p), o = all.find(x => x.fromTemplate);
    assert(o.req.length === 2 && o.info.method === 'ET' && o.proc.manual === 'TM-TEST' && !o.info.techName && !o.info.tail && !Object.keys(o.resp).length, 'observation from template');
    assert(o.info.observerName === 'Test Observer', 'observer defaults from profile');
    await b.close();
  },

  async sig() {
    const b = await launch('sig'), p = await open(b);
    await profile(p); await newObs(p);
    await act(p, 'step', '[data-v=complete]');
    const c = await p.$('canvas[data-sig=obs]');
    await c.scrollIntoView();
    const bx = await c.boundingBox();
    await p.touchscreen.touchStart(bx.x + 20, bx.y + 40);
    for (let i = 1; i <= 10; i++) await p.touchscreen.touchMove(bx.x + 20 + i * 20, bx.y + 40 + (i % 2) * 30);
    await p.touchscreen.touchEnd();
    await sleep(300);
    const o = (await stored(p))[0];
    assert(o.sig.obs.img.startsWith('data:image/png') && o.sig.obs.date, 'observer signature + date saved');
    assert(o.sig.tech.name === 'Tech A', 'technician signature name defaulted');
    await b.close();
  },

  async backup() {
    const b = await launch('backup'), p = await open(b);
    const dl = path.join(TMP, 'dl'); fs.mkdirSync(dl, { recursive: true });
    await profile(p); await newObs(p);
    await act(p, 'step', '[data-v=inspect]');
    await answer(p, (await procKeys(p))[0], 'N');
    await fill(p, `[data-rf="f.observed"]`, 'Observed X');
    await sleep(500);
    const orig = (await stored(p))[0];
    await act(p, 'home');
    const cdp = await p.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    await act(p, 'exportOne', `[data-id="${orig.id}"]`);
    await sleep(800);
    const f = fs.readdirSync(dl).find(x => x.endsWith('.json'));
    assert(f, 'export file downloaded');
    await b.close();
    const b2 = await launch('backup2'), p2 = await open(b2);   // fresh device
    await profile(p2);
    const inp = await p2.$('input[data-act=import]');
    await inp.uploadFile(path.join(dl, f));
    await sleep(600);
    assert((await text(p2, '#msg')).includes('1 added'), 'import message');
    const got = await stored(p2, orig.id);
    assert(JSON.stringify(got) === JSON.stringify(orig), 'imported record identical to original');
    await (await p2.$('input[data-act=import]')).uploadFile(path.join(dl, f)); await sleep(600);
    assert((await text(p2, '#msg')).includes('1 already current'), 're-import skipped duplicate');
    await b2.close();
  },

  async print() {
    const b = await launch('print'), p = await open(b);
    await profile(p); await newObs(p);
    await act(p, 'step', '[data-v=inspect]');
    const [k1, k2] = await procKeys(p);
    await answer(p, k1, 'N'); await fill(p, `${card(k1)} [data-rf="f.observed"]`, 'Observed <b>X</b>');
    await answer(p, k2, 'NOTE'); await fill(p, `${card(k2)} [data-rf=c]`, 'Note text');
    await sleep(500);
    await act(p, 'step', '[data-v=complete]');
    await act(p, 'report');
    const t = await text(p, '#report');
    for (const s of ['NDT TECHNICIAN PROCEDURE COMPLIANCE OBSERVATION', 'SOS · Solutions On Standby', 'TM-TEST', 'F-1', 'O-1', 'Observed <b>X</b>', 'does not replace the governing inspection procedure', 'Supporting Observation Checklist'])
      assert(t.includes(s), 'report contains: ' + s);
    await p.screenshot({ path: path.join(TMP, 'report-iphone.png'), fullPage: true });
    await p.emulateMediaType('print');
    const pdf = await p.pdf({ format: 'letter', path: path.join(TMP, 'report.pdf') });
    assert(pdf.length > 20000, 'pdf produced');
    console.log('   report artifacts:', TMP);
    await b.close();
  },

  async offline() {
    const b = await launch('offline'), p = await open(b, null);
    await profile(p);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload({ waitUntil: 'networkidle0' });
    await p.setOfflineMode(true);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-act=new]', { timeout: 5000 });
    await p.setOfflineMode(false);
    await b.close();
  },

  // Definition of Done 1–17, one pass.
  async full() {
    let b = await launch('full');
    let p = await open(b, null);                                           // 1 MacBook-size window
    await profile(p);
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }); // 2 iPhone size
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert(!wide, 'no horizontal scroll at iPhone width');
    await newObs(p);                                                       // 3 new, 4 method, 5 procedure, 6 requirements
    await act(p, 'step', '[data-v=inspect]');
    const keys = await p.$$eval('.item[data-key]', a => a.map(e => e.dataset.key));
    const [k1, k2] = keys;
    await answer(p, k1, 'N'); await fill(p, `${card(k1)} [data-rf="f.observed"]`, 'Did not verify');   // 7, 8
    await answer(p, k2, 'NOTE'); await fill(p, `${card(k2)} [data-rf=c]`, 'Good practice');       // 9
    await p.screenshot({ path: path.join(TMP, 'inspect-iphone.png') });
    for (const k of keys.slice(2)) await answer(p, k, 'Y');
    await act(p, 'step', '[data-v=setup]');
    for (const k of await p.$$eval('.item[data-key]', a => a.map(e => e.dataset.key))) await answer(p, k, 'NA');
    await sleep(600);
    const id = (await stored(p))[0].id;
    await b.close();                                                       // 10 close / reopen
    b = await launch('full'); p = await open(b);
    await act(p, 'open', `[data-id="${id}"]`);
    assert((await text(p, '#stat')).includes('54 / 54'), 'all answers persisted (2 procedure + 52 ET generic)');
    await act(p, 'step', '[data-v=findings]');                             // 12 review
    const ft = await text(p, 'main');
    assert(ft.includes('Findings (1)') && ft.includes('Observations (1)'), 'findings/observations review');
    await act(p, 'step', '[data-v=complete]');
    await act(p, 'overall', '[data-v="Procedural deviation(s) observed"]');
    for (const who of ['obs', 'tech']) {                                   // 13 sign
      const c = await p.$(`canvas[data-sig=${who}]`); await c.scrollIntoView(); const bx = await c.boundingBox();
      await p.touchscreen.touchStart(bx.x + 30, bx.y + 50);
      for (let i = 1; i < 8; i++) await p.touchscreen.touchMove(bx.x + 30 + i * 25, bx.y + 50 + (i % 2) * 25);
      await p.touchscreen.touchEnd(); await sleep(200);
    }
    await act(p, 'complete');                                              // 11 complete
    let o = await stored(p, id);
    assert(o.status === 'completed' && o.sig.obs.img && o.sig.tech.img && o.overall.sel, 'completed & signed');
    await act(p, 'report');                                                // 14 report
    await p.emulateMediaType('print');
    assert((await p.pdf({ format: 'letter' })).length > 20000, 'report pdf');
    await p.emulateMediaType('screen');
    await act(p, 'back');
    await act(p, 'step', '[data-v=setup]');                                // 15 template
    await act(p, 'saveTpl');
    assert((await text(p, '#tplmsg')).includes('saved'), 'template saved from completed observation');
    await act(p, 'home');                                                  // 16 export
    const dl = path.join(TMP, 'dlfull'); fs.mkdirSync(dl, { recursive: true });
    await (await p.createCDPSession()).send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    await act(p, 'exportAll'); await sleep(800);
    const f = fs.readdirSync(dl).find(x => x.endsWith('.json'));
    await b.close();
    const b2 = await launch('full2'), p2 = await open(b2);                 // 17 import on fresh device
    await profile(p2);
    await (await p2.$('input[data-act=import]')).uploadFile(path.join(dl, f)); await sleep(600);
    assert((await text(p2, '#msg')).includes('1 added') && (await text(p2, '#msg')).includes('1 templates added'), 'import all');
    assert(JSON.stringify(await stored(p2, id)) === JSON.stringify(o), 'round trip identical');
    await b2.close();
  },
};

const pick = process.argv.slice(2).filter(a => !a.startsWith('--'));
let fail = 0;
for (const name of pick.length ? pick : Object.keys(T)) {
  errors = [];
  const t0 = Date.now();
  try {
    await T[name]();
    if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
    console.log(`PASS ${name} (${Date.now() - t0} ms)`);
  } catch (e) { fail++; console.log(`FAIL ${name}: ${e.message}`); }
  n++;
}
server.close();
if (!process.argv.includes('--keep') && !pick.includes('print')) fs.rmSync(TMP, { recursive: true, force: true });
console.log(`${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
