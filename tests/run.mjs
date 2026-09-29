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
const MIME = { '.mjs': 'text/javascript', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
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

  // Critical Evidence Markers: designation, warnings (not findings), evidence status, template carry-over.
  async cem() {
    const b = await launch('cem'), p = await open(b);
    await profile(p); await newObs(p);
    await p.click('#reqs .req:first-child [data-rq=critical]'); await sleep(300);
    let o = (await stored(p))[0];
    assert(o.req[0].critical === true && o.req[1].critical === false, 'critical flag saved on requirement');
    await act(p, 'step', '[data-v=inspect]');
    const [k1, k2] = await procKeys(p);
    let c1 = await text(p, card(k1));
    assert(c1.includes('CRITICAL EVIDENCE MARKER') && c1.includes('PROCEDURE-SPECIFIC REQUIREMENT') && c1.includes('EVIDENCE NOT RECORDED'), 'procedure CEM shown');
    assert(!(await text(p, card(k2))).includes('CRITICAL EVIDENCE MARKER'), 'non-critical requirement has no marker');
    const gen = await p.$$eval('.item.crit[data-key^="g:"]', a => a.map(e => e.dataset.key));
    assert(gen.length === 7, 'ET default supporting markers on INSPECT: ' + gen.length);
    const g1 = await text(p, card(gen[0]));
    assert(g1.includes('SUPPORTING / GENERAL METHOD PROMPT') && g1.includes('does not create a technical requirement'), 'supporting prompt labelled');
    assert(await p.$(`${card(gen[0])} [data-act=resp][data-v=NA]`), 'N/A available on supporting marker');
    await answer(p, k1, 'Y');
    await act(p, 'step', '[data-v=complete]');
    await act(p, 'overall', '[data-v="Technician demonstrated satisfactory performance"]');
    let t = await text(p, 'main');
    assert(t.includes('Completion warnings') && t.includes('answered YES with no evidence recorded'), 'YES + CEM + no evidence → warning');
    assert(!(await p.$eval('[data-act=complete]', e => e.disabled)), 'warning does not block completion');
    await act(p, 'step', '[data-v=findings]');
    assert((await text(p, 'main')).includes('Findings (0)'), 'warning does not create a finding');
    await act(p, 'step', '[data-v=inspect]');
    await answer(p, k1, 'N'); await fill(p, `${card(k1)} [data-rf="f.observed"]`, 'Skipped');
    await act(p, 'step', '[data-v=findings]');
    assert((await text(p, 'main')).includes('Findings (1)'), 'NO on CEM still creates the normal finding');
    await act(p, 'step', '[data-v=inspect]');
    await answer(p, k1, 'Y');
    await p.click(`${card(k1)} [data-act=evType][data-v=DO]`); await sleep(300);
    c1 = await text(p, card(k1));
    assert(c1.includes('EVIDENCE RECORDED') && !c1.includes('NOT RECORDED'), 'Direct Observation → recorded');
    assert(/Evidence ID\s*ET-\d{8}-[A-Z][A-Z2-9]-001/.test(c1), 'Evidence ID format: ' + c1.match(/ET-\S+/));
    await p.click(`${card(gen[0])} [data-act=evType][data-v=DOC]`); await sleep(300);
    assert((await text(p, card(gen[0]))).includes('EVIDENCE NOT RECORDED'), 'document type without reference → not recorded');
    await fill(p, `${card(gen[0])} [data-rf="ev.ref"]`, 'REC-42'); await sleep(500);
    assert((await text(p, card(gen[0]))).includes('EVIDENCE RECORDED'), 'reference entered → recorded (live)');
    assert(/ET-\d{8}-..-002/.test(await text(p, card(gen[0]))), 'sequence increments');
    await act(p, 'step', '[data-v=complete]');
    assert(!(await text(p, 'main')).includes('answered YES with no evidence'), 'warning cleared once evidence recorded');
    await act(p, 'step', '[data-v=setup]');
    await fill(p, '#tplName', 'CEM Template'); await act(p, 'saveTpl');
    const tpl = (await p.evaluate(() => new Promise(res => { const r = indexedDB.open('sos-ndt-observation'); r.onsuccess = () => { const q = r.result.transaction('tpl').objectStore('tpl').getAll(); q.onsuccess = () => res(q.result); }; })))[0];
    assert(tpl.req[0].critical === true && tpl.req[1].critical === false, 'designation carries into template');
    assert(!/ET-2|REC-42|types|media|"ev"/.test(JSON.stringify(tpl)), 'evidence does not carry into template');
    await act(p, 'home'); await act(p, 'new'); await act(p, 'create', `[data-tpl="${tpl.id}"]`);
    o = (await stored(p)).find(x => x.fromTemplate);
    assert(o.req[0].critical === true && !Object.keys(o.resp).length, 'new observation: designation yes, evidence no');
    await b.close();
  },

  // Governing basis, OJT, template revision clearing, report separation.
  async basis() {
    const b = await launch('basis'), p = await open(b);
    await profile(p); await newObs(p);
    await act(p, 'step', '[data-v=info]');
    await act(p, 'addBasis');
    await p.select('#basis .req:last-child [data-bs=cat]', 'Written Practice / Qualification Program');
    await fill(p, '#basis .req:last-child [data-bs=doc]', 'Employer Written Practice / Qualification Program');
    await fill(p, '#basis .req:last-child [data-bs=rev]', 'Rev 7');
    await fill(p, '#basis .req:last-child [data-bs=ref]', 'Para 4.2');
    await fill(p, '#basis .req:last-child [data-bs=notes]', 'Basis note');
    assert(await p.$('datalist#basisDocs option[value="TM 1-1520-265-23"]'), 'document suggestions offered');
    await act(p, 'step', '[data-v=complete]');
    await act(p, 'addOjt');
    await fill(p, '#ojt .req:last-child [data-oj=task]', 'Bolt hole scan');
    await p.select('#ojt .req:last-child [data-oj=result]', 'Satisfactorily Demonstrated');
    await fill(p, '#ojt .req:last-child [data-oj=hours]', '2.5');
    await sleep(500);
    let o = (await stored(p))[0];
    assert(o.basis.length === 1 && o.basis[0].rev === 'Rev 7' && o.basis[0].cat.startsWith('Written'), 'basis saved');
    assert(o.ojt[0].tech === 'Tech A' && o.ojt[0].component === 'Test Component' && o.ojt[0].hours === '2.5' && o.ojt[0].result === 'Satisfactorily Demonstrated', 'OJT saved and prefilled');
    assert((await text(p, 'main')).includes('does not approve or credit OJT'), 'OJT credit disclaimer');
    await act(p, 'step', '[data-v=inspect]');
    await answer(p, (await procKeys(p))[1], 'N'); await fill(p, '[data-rf="f.observed"]', 'Obs');
    await sleep(400);
    await act(p, 'step', '[data-v=complete]'); await act(p, 'report');
    const r = await text(p, '#report'), rh = await p.$eval('#report', e => e.innerHTML);
    for (const x of ['Governing Basis', 'Rev 7', 'Para 4.2', 'Critical Task Evidence', 'Procedural Findings (1)', 'OJT / Task Evidence', 'Bolt hole scan', 'not credited'])
      assert(r.includes(x), 'report contains ' + x);
    assert(r.indexOf('Procedural Findings') < r.indexOf('Critical Task Evidence'), 'findings and task evidence are separate sections');
    assert(!/<video|<img[^>]+blob:|data:video/.test(rh), 'no video in report');
    await act(p, 'back');
    await act(p, 'step', '[data-v=setup]'); await fill(p, '#tplName', 'Rev Template'); await act(p, 'saveTpl');
    const tpl = (await p.evaluate(() => new Promise(res => { const r = indexedDB.open('sos-ndt-observation'); r.onsuccess = () => { const q = r.result.transaction('tpl').objectStore('tpl').getAll(); q.onsuccess = () => res(q.result); }; })))[0];
    assert(!('rev' in tpl.proc) && tpl.basis[0].doc.startsWith('Employer') && tpl.basis[0].ref === 'Para 4.2' && !('rev' in tpl.basis[0]) && !JSON.stringify(tpl).includes('Rev 7'), 'template has identity/reference, no revision');
    await act(p, 'home'); await act(p, 'new'); await act(p, 'create', `[data-tpl="${tpl.id}"]`);
    const all = await stored(p), n = all.find(x => x.fromTemplate), orig = all.find(x => !x.fromTemplate);
    assert(n.proc.rev === '' && n.proc.wp === 'WP-TEST' && n.basis[0].rev === '' && n.basis[0].doc.startsWith('Employer') && n.basis[0].cat.startsWith('Written'), 'new obs from template: revisions cleared, identity kept');
    assert(orig.proc.rev === 'A' && orig.basis[0].rev === 'Rev 7', 'existing observation keeps historical revisions');
    assert((await text(p, 'main')).includes('Revision / change levels were not carried from template'), 'observer prompted to verify revision');
    // Old V1 template that still stored a revision: new observation must not take it.
    await p.evaluate(() => new Promise(res => { const r = indexedDB.open('sos-ndt-observation'); r.onsuccess = () => { const t = r.result.transaction('tpl', 'readwrite'); t.objectStore('tpl').put({ id: 'v1tpl', name: 'V1 tpl', info: { method: 'ET' }, proc: { manual: 'TM-OLD', wp: 'WP-OLD', title: '', rev: 'OLD-REV' }, req: [] }); t.oncomplete = res; }; }));
    await act(p, 'home'); await act(p, 'new'); await act(p, 'create', '[data-tpl="v1tpl"]');
    const v = (await stored(p)).find(x => x.fromTemplate === 'V1 tpl');
    assert(v.proc.manual === 'TM-OLD' && v.proc.rev === '', 'V1 template revision not carried');
    await b.close();
  },

  // Phone video evidence: authorization gate, local pending file, provider abstraction, failure/retry, confirmation.
  async video() {
    const b = await launch('video'), p = await open(b);
    const clip = path.join(TMP, 'clip.mp4'); fs.writeFileSync(clip, Buffer.alloc(200000, 7));
    const media = () => p.evaluate(() => new Promise(res => { const r = indexedDB.open('sos-ndt-observation'); r.onsuccess = () => { const q = r.result.transaction('media').objectStore('media').getAll(); q.onsuccess = () => res(q.result.map(x => ({ fid: x.fid, size: x.blob.size }))); }; }));
    await profile(p); await newObs(p);
    await p.click('#reqs .req:first-child [data-rq=critical]'); await sleep(300);
    await act(p, 'step', '[data-v=inspect]');
    const [k1] = await procKeys(p);
    await answer(p, k1, 'Y');
    await p.click(`${card(k1)} [data-act=evType][data-v=VID]`); await sleep(300);
    assert((await text(p, card(k1))).includes('Confirm photography/video is authorized'), 'authorization text shown');
    assert(!(await p.$(`${card(k1)} input[data-media]`)), 'no capture before acknowledgement');
    await p.click(`${card(k1)} [data-auth]`); await sleep(400);
    const inp = await p.$(`${card(k1)} input[data-media=video]`);
    assert(inp && await inp.evaluate(e => e.accept === 'video/*' && !e.hasAttribute('capture')), 'native picker (Take Video / Choose Existing)');
    await inp.uploadFile(clip); await sleep(800);
    let o = (await stored(p))[0], m = o.resp[k1].ev.media[0];
    assert(o.recAuth.ack && o.recAuth.by === 'Test Observer', 'acknowledgement recorded');
    assert(/^ET-\d{8}-[A-Z][A-Z2-9]-001-V1$/.test(m.fid) && m.status === 'READY' && m.size === 200000 && m.name === 'clip.mp4' && m.auth.ack, 'video metadata: ' + m.fid);
    assert((await media())[0]?.size === 200000, 'file held locally, apart from the observation');
    let c = await text(p, card(k1));
    assert(c.includes('READY TO UPLOAD') && c.includes('LOCAL / PENDING') && c.includes('storage is not configured') && c.includes('EVIDENCE RECORDED'), 'pending state shown');
    assert(!(await p.$(`${card(k1)} [data-act=upMedia]`)), 'no upload without a configured provider');
    assert(await p.$(`${card(k1)} video`), 'review preview');
    await p.$eval(card(k1), e => e.scrollIntoView());
    await p.screenshot({ path: path.join(TMP, 'evidence-iphone.png') });
    assert(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'no horizontal scroll with evidence card');
    // Mock client storage (test only).
    await p.evaluate(async () => {
      const s = await import('/js/storage.js');
      window.__mock = { fail: true };
      s.registerProvider({ id: 'mock', label: 'Mock', configured: true, async upload(blob, meta) {
        if (window.__mock.fail) throw new Error('mock network down');
        window.__mock.sent = { size: blob.size, meta };
        return { ref: 'MOCK-123', confirmed: '2026-09-29T15:00:00.000Z' };
      } });
    });
    await act(p, 'step', '[data-v=inspect]');
    await p.click(`${card(k1)} [data-act=upMedia]`); await sleep(500);
    o = (await stored(p))[0]; m = o.resp[k1].ev.media[0];
    assert(m.status === 'FAILED' && m.error === 'mock network down' && m.attempts === 1, 'upload failure recorded');
    assert(o.resp[k1].v === 'Y' && o.req.length === 2 && (await media()).length === 1, 'failure does not damage observation or file');
    assert((await text(p, card(k1))).includes('UPLOAD FAILED'), 'failed status shown');
    await p.evaluate(() => { window.__mock.fail = false; });
    await p.click(`${card(k1)} [data-act=upMedia]`); await sleep(500);
    o = (await stored(p))[0]; m = o.resp[k1].ev.media[0];
    assert(m.status === 'UPLOADED' && m.storage.ref === 'MOCK-123' && m.storage.confirmed === '2026-09-29T15:00:00.000Z' && m.storage.provider === 'mock', 'confirmed upload recorded');
    assert((await media()).length === 1 && m.local, 'local copy NOT deleted automatically');
    const sent = await p.evaluate(() => window.__mock.sent);
    assert(sent.size === 200000 && sent.meta.evidenceId === m.fid && sent.meta.observationId === o.id && sent.meta.technician === 'Tech A' && sent.meta.method === 'ET'
      && sent.meta.aircraft === 'H-60 TAIL-001' && sent.meta.component === 'Test Component' && sent.meta.procedure.includes('WP-TEST') && sent.meta.procedureReference === 'Step 1 · R-1'
      && sent.meta.requirement === 'Test requirement one' && sent.meta.observer === 'Test Observer' && sent.meta.fileName === 'clip.mp4' && sent.meta.recordingAuthorization.ack, 'upload metadata');
    assert((await text(p, card(k1))).includes('CLIENT STORAGE / CONFIRMED'), 'confirmed state shown');
    await p.click(`${card(k1)} [data-act=rmLocal]`); await sleep(100); await p.click(`${card(k1)} [data-act=rmLocal]`); await sleep(400);
    o = (await stored(p))[0]; m = o.resp[k1].ev.media[0];
    assert(!(await media()).length && !m.local && m.storage.ref === 'MOCK-123', 'local copy removed only on request, reference kept');
    // Second clip: discard, then third clip interrupted mid-upload.
    await (await p.$(`${card(k1)} input[data-media=video]`)).uploadFile(clip); await sleep(700);
    await p.click(`${card(k1)} [data-act=discard]`); await sleep(100); await p.click(`${card(k1)} [data-act=discard]`); await sleep(400);
    assert((await stored(p))[0].resp[k1].ev.media.length === 1 && !(await media()).length, 'unsent file discarded');
    await (await p.$(`${card(k1)} input[data-media=video]`)).uploadFile(clip); await sleep(700);
    o = (await stored(p))[0];
    assert(o.resp[k1].ev.media[1].fid.endsWith('-V3'), 'file IDs never reused');
    await p.evaluate((id, k) => new Promise(res => { const r = indexedDB.open('sos-ndt-observation'); r.onsuccess = () => { const s = r.result.transaction('obs', 'readwrite').objectStore('obs'); s.get(id).onsuccess = e => { const x = e.target.result; x.resp[k].ev.media[1].status = 'UPLOADING'; s.put(x).onsuccess = res; }; }; }), o.id, k1);
    await p.reload({ waitUntil: 'networkidle0' });
    await act(p, 'open', `[data-id="${o.id}"]`); await act(p, 'step', '[data-v=inspect]');
    assert((await text(p, card(k1))).includes('interrupted'), 'interrupted upload → failed, retry offered');
    // Completed record: upload still possible from COMPLETE, responses locked.
    await act(p, 'step', '[data-v=complete]');
    await act(p, 'overall', '[data-v="Technician demonstrated satisfactory performance"]');
    assert((await text(p, 'main')).includes('LOCAL / PENDING'), 'pending warning on COMPLETE');
    await act(p, 'complete');
    await p.evaluate(async () => { const s = await import('/js/storage.js'); s.registerProvider({ id: 'mock', configured: true, async upload() { return { ref: 'MOCK-456' }; } }); });
    await act(p, 'step', '[data-v=complete]');
    await p.click('[data-act=upMedia]'); await sleep(500);
    o = (await stored(p))[0];
    assert(o.status === 'completed' && o.resp[k1].ev.media[1].status === 'UPLOADED' && o.resp[k1].ev.media[1].storage.confirmed, 'upload after completion');
    // Export carries metadata, not the file.
    await act(p, 'home');
    assert((await text(p, 'main')).includes('LOCAL / PENDING') === false, 'no pending notice once all confirmed');
    const dl = path.join(TMP, 'dlvid'); fs.mkdirSync(dl, { recursive: true });
    await (await p.createCDPSession()).send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    await act(p, 'exportOne', `[data-id="${o.id}"]`); await sleep(800);
    const f = fs.readdirSync(dl).find(x => x.endsWith('.json')), js = fs.readFileSync(path.join(dl, f), 'utf8');
    assert(js.length < 60000 && js.includes('MOCK-456') && js.includes('-V3'), 'export has evidence metadata only');
    await act(p, 'profile');
    assert(o.resp[k1].ev.media[0].fid.includes('-' + (await text(p, '#devcode')) + '-'), 'device code visible in profile');
    await act(p, 'home');
    await act(p, 'del', `[data-id="${o.id}"]`); await act(p, 'del', `[data-id="${o.id}"]`);
    assert(!(await media()).length && !(await stored(p)).length, 'deleting observation removes its local files');
    await b.close();
  },

  // Existing V1 device data survives the upgrade unchanged.
  async migrate() {
    const b = await launch('migrate'), p = await b.newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + 'manifest.webmanifest');
    await p.evaluate(() => new Promise(res => {
      const r = indexedDB.open('sos-ndt-observation', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('obs', { keyPath: 'id' }); d.createObjectStore('tpl', { keyPath: 'id' }); d.createObjectStore('kv', { keyPath: 'k' }); };
      r.onsuccess = () => {
        const t = r.result.transaction(['obs', 'kv'], 'readwrite');
        t.objectStore('kv').put({ k: 'profile', name: 'V1 Observer', cert: 'L3' });
        t.objectStore('obs').put({ id: 'v1rec', status: 'completed', created: '2026-09-28T10:00:00.000Z', updated: '2026-09-28T11:00:00.000Z', completed: '2026-09-28T11:00:00.000Z',
          info: { method: 'PT', component: 'V1 Comp', techName: 'V1 Tech', observerName: 'V1 Observer', date: '2026-09-28' }, proc: { manual: 'TM-V1', wp: 'WP-V1', title: '', rev: 'B' },
          req: [{ id: 'r1', step: '1', ref: 'X', text: 'V1 req' }], resp: { 'p:r1': { v: 'Y' } }, overall: { sel: 'Other', comments: '' },
          sig: { obs: { name: 'V1 Observer', cert: '', img: '', date: '' }, tech: { name: '', img: '', date: '' } } });
        t.oncomplete = () => { r.result.close(); res(); };
      };
    }));
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    assert((await text(p, 'main')).includes('COMPLETED OBSERVATIONS (1)'), 'V1 record listed');
    await act(p, 'open', '[data-id="v1rec"]'); await act(p, 'step', '[data-v=info]');
    assert((await text(p, 'main')).includes('Governing Basis') && await p.$eval('[data-p="proc.rev"]', e => e.value === 'B'), 'V1 record opens, historical revision kept');
    await act(p, 'step', '[data-v=inspect]');
    assert((await text(p, 'main')).includes('SUPPORTING / GENERAL METHOD PROMPT'), 'PT default markers shown');
    await act(p, 'step', '[data-v=complete]'); await act(p, 'report');
    assert((await text(p, '#report')).includes('V1 req') && (await text(p, '#report')).includes('Critical Task Evidence'), 'V1 report renders');
    const stores = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('sos-ndt-observation'); r.onsuccess = () => res([...r.result.objectStoreNames]); }));
    assert(stores.includes('media'), 'media store added');
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
