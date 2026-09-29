import { db } from './db.js';
import { esc, uid, today, nowTime, fmtDT, fmtSize, newObs, newBasis, normalize, makeTemplate, sections, tally, findings, observations, refOf, METHODS, RLAB, KIND, evRecorded, allMedia, pendingMedia, warnings } from './model.js';
import { CLASSES, OVERALL, DISCLAIMER, EVT, BASIS_CATS, BASIS_DOCS, OJT_RESULTS, OJT_NOTE, AUTH_TEXT } from './checklists.js';
import { deviceCode, nextEvidenceId, newEv, addMedia, discardMedia, removeLocal, deleteObsMedia, upload, attachPreviews, MSTAT, PENDING_WARN } from './evidence.js';
import { provider } from './storage.js';
import { reportHTML } from './report.js';
import { attachPad } from './signature.js';
import { pack, saveFile, importText, fileName } from './backup.js';

const main = document.getElementById('main');
const top = document.getElementById('top');
const tabs = document.getElementById('tabs');
const rep = document.getElementById('report');
const S = { view: 'home', obs: null, step: 'info', profile: null, msg: '', cardMsg: null };
const STEPS = [['info', 'INFO'], ['setup', 'SETUP'], ['inspect', 'INSPECT'], ['findings', 'FINDINGS'], ['complete', 'COMPLETE']];

// ---------- persistence ----------
let saveT = null, dirty = false;
function touch(delay = 400) {
  if (!S.obs) return;
  dirty = true;
  S.obs.updated = new Date().toISOString();
  clearTimeout(saveT);
  saveT = setTimeout(flush, delay);
  status('Saving…');
}
async function flush() {
  clearTimeout(saveT);
  if (!dirty || !S.obs) return;
  dirty = false;
  try { await db.put('obs', S.obs); status('Saved'); }
  catch (e) { dirty = true; status('NOT SAVED: ' + e.message); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
addEventListener('pagehide', flush);
function status(t) { const el = document.getElementById('saved'); if (el) el.textContent = t; }

const getP = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
function setP(o, p, v) {
  const ks = p.split('.'), last = ks.pop();
  let a = o;
  for (const k of ks) a = a[k] ??= {};
  a[last] = v;
}

// ---------- field helpers ----------
const fid = p => 'f_' + p.replace(/\W/g, '_');
const bf = (label, path, type = 'text', extra = '') =>
  `<label class="f" for="${fid(path)}"><span>${label}</span><input id="${fid(path)}" type="${type}" data-p="${path}" value="${esc(getP(S.obs, path))}" autocomplete="off" ${extra}></label>`;
const bta = (label, path) =>
  `<label class="f"><span>${label}</span><textarea rows="3" data-p="${path}">${esc(getP(S.obs, path))}</textarea></label>`;
const rta = (label, rf, val, ph = '', cls = '') =>
  `<label class="f ${cls}"><span>${label}</span><textarea rows="2" data-rf="${rf}" placeholder="${esc(ph)}">${esc(val)}</textarea></label>`;
const rin = (label, rf, val) =>
  `<label class="f"><span>${label}</span><input data-rf="${rf}" value="${esc(val)}" autocomplete="off"></label>`;
const title = o => `${METHODS[o.info.method] || 'No method'} | ${o.info.component || 'Component not entered'}`;

// ---------- top-level views ----------
async function go(view) {
  await flush();
  S.view = view;
  await render();
  scrollTo(0, 0);
}

async function render() {
  rep.hidden = true;
  main.hidden = false;
  top.hidden = false;
  if (S.view === 'obs') return renderObs();
  tabs.hidden = true;
  top.innerHTML = `<div class="bar"><span class="brand">SOS · NDT Technician Observation</span>${S.view !== 'home' && S.profile ? '<button class="lnk" data-act="home">‹ Home</button>' : ''}</div>`;
  main.innerHTML = await V[S.view]();
  S.msg = '';
}

const obsList = a => a.length ? `<ul class="list">${a.map(o => {
  const t = tally(o);
  return `<li><button class="li-main" data-act="open" data-id="${o.id}"><b>${esc(title(o))}</b><span>${esc([o.info.tail, o.info.techName, o.info.date].filter(Boolean).join(' · '))} · ${t.ans}/${t.total}</span></button>
<div class="li-act"><button class="btn-s" data-act="dup" data-id="${o.id}">Duplicate</button><button class="btn-s" data-act="exportOne" data-id="${o.id}">Export</button><button class="btn-s danger" data-act="del" data-id="${o.id}">Delete</button></div></li>`;
}).join('')}</ul>` : '<p class="muted">None</p>';

const tplList = a => a.length ? `<ul class="list">${a.map(t => `<li><button class="li-main" data-act="create" data-tpl="${t.id}"><b>${esc(t.name)}</b><span>${esc([METHODS[t.info?.method], t.info?.component, t.proc?.manual, t.proc?.wp].filter(Boolean).join(' · '))} · ${t.req.length} requirements</span></button>
<div class="li-act"><button class="btn-s" data-act="create" data-tpl="${t.id}">Start observation</button><button class="btn-s danger" data-act="delTpl" data-id="${t.id}">Delete</button></div></li>`).join('')}</ul>` : '<p class="muted">No templates. Create one from an observation’s SETUP step.</p>';

const V = {
  async profile() {
    return `<h2>Observer Profile</h2><p class="muted">Stored only on this device. Used as the default observer for new observations.</p>
<form data-form="profile"><label class="f"><span>Name</span><input name="name" required value="${esc(S.profile?.name)}" autocomplete="name"></label>
<label class="f"><span>Certification / Qualification</span><input name="cert" value="${esc(S.profile?.cert)}"></label>
<button class="btn pri big" type="submit">SAVE PROFILE</button></form>
<p class="muted">Device code: <b id="devcode">${esc(await deviceCode())}</b> — random, generated on this device, used in Evidence IDs (METHOD-DATE-DEVICE-SEQUENCE). Contains no personal information.</p>`;
  },
  async home() {
    const all = (await db.all('obs')).sort((a, b) => b.updated.localeCompare(a.updated));
    const open = all.filter(o => o.status !== 'completed'), done = all.filter(o => o.status === 'completed');
    const pend = all.reduce((n, o) => n + pendingMedia(o).length, 0);
    return `${pend ? `<p class="pendwarn">${pend} evidence file(s) LOCAL / PENDING on this device — not yet transferred to the client evidence repository.</p>` : ''}${open[0] ? `<button class="btn pri big" data-act="open" data-id="${open[0].id}">RESUME<small>${esc(title(open[0]))}</small></button>` : ''}
<button class="btn big ${open[0] ? '' : 'pri'}" data-act="new">NEW OBSERVATION</button>
<h3>OPEN OBSERVATIONS (${open.length})</h3>${obsList(open)}
<h3>COMPLETED OBSERVATIONS (${done.length})</h3>${obsList(done)}
<button class="btn big" data-act="templates">TEMPLATES</button>
<h3>Backup</h3><div class="row"><button class="btn" data-act="exportAll">EXPORT ALL DATA</button><label class="btn">IMPORT BACKUP<input type="file" accept=".json,application/json" data-act="import" hidden></label></div>
<p id="msg" class="msg">${esc(S.msg)}</p>
<p class="muted">Observer: ${esc(S.profile.name)}${S.profile.cert ? ' · ' + esc(S.profile.cert) : ''} <button class="lnk" data-act="profile">Edit profile</button></p>
<p class="disc">${DISCLAIMER}</p>`;
  },
  async newpick() {
    return `<h2>New Observation</h2><button class="btn pri big" data-act="create">BLANK OBSERVATION</button><h3>Start from template</h3>${tplList(await db.all('tpl'))}`;
  },
  async templates() {
    return `<h2>Templates</h2><p class="muted">A template stores aircraft model, component, method, governing procedure / basis identity and references, and procedure-specific requirements (with their Critical Evidence Marker designation) only. Revision / change levels are never stored: they must be verified for each new observation.</p>${tplList(await db.all('tpl'))}<p id="msg" class="msg">${esc(S.msg)}</p>`;
  },
};

// ---------- observation ----------
const INFO_F = [['client', 'Client'], ['location', 'Location'], ['aircraftModel', 'Aircraft Model'], ['tail', 'Aircraft Tail Number / Serial Number'], ['hours', 'Aircraft Hours (optional)'], ['component', 'Component'], ['partNo', 'Component Part Number'], ['serialNo', 'Component Serial Number (optional)']];
const PEOPLE_F = [['techName', 'Technician Name'], ['techCert', 'Technician Certification / Level'], ['observerName', 'Observer Name'], ['observerCert', 'Observer Certification']];
const PROC_F = [['manual', 'Technical Manual / Governing Document'], ['wp', 'Work Package / Procedure Number'], ['title', 'Procedure Title'], ['rev', 'Revision / Change'], ['procDate', 'Procedure Date (optional)'], ['compRef', 'Component / Inspection Reference'], ['acceptRef', 'Acceptance Criteria Reference (optional)']];

const BASIS_F = [['doc', 'Document'], ['rev', 'Revision'], ['ref', 'Reference / Paragraph']];
const OJT_F = [['method', 'Method'], ['task', 'Task / Technique'], ['component', 'Component'], ['procedure', 'Procedure'], ['date', 'Date', 'date'], ['tech', 'Technician'], ['observer', 'Observer']];

const govLine = o => `<div class="govline"><b>Governing procedure:</b> ${esc([o.proc.manual, o.proc.wp, o.proc.title, o.proc.rev && 'Rev ' + o.proc.rev].filter(Boolean).join(' · ')) || '<span class="warn">not entered (INFO)</span>'}</div>`;

function itemCard(o, it) {
  const r = o.resp[it.key] || {}, v = r.v || '', ref = refOf(it);
  return `<div class="item${v ? ' v-' + v : ''}${it.crit ? ' crit' : ''}" data-key="${it.key}">${it.crit ? cemHead(it, r) : ''}${ref ? `<div class="ref">${esc(ref)}</div>` : ''}<div class="itxt">${esc(it.text) || '<i>(requirement text not entered)</i>'}</div>
<div class="rb">${['Y', 'N', 'NA', 'NOTE'].map(x => `<button type="button" data-act="resp" data-v="${x}" class="r-${x}${v === x ? ' on' : ''}" aria-pressed="${v === x}">${RLAB[x]}</button>`).join('')}</div>${itemDetail(r, it)}${it.crit ? cemBody(o, it, r) : ''}</div>`;
}

// ---------- critical evidence markers ----------
const evsBadge = r => r.v === 'NA' ? '<span class="evs na">N/A</span>'
  : evRecorded(r.ev) ? '<span class="evs ok">EVIDENCE RECORDED</span>' : '<span class="evs no">EVIDENCE NOT RECORDED</span>';
const cemHead = (it, r) => `<div class="cem-h"><span class="tag cem-tag">CRITICAL EVIDENCE MARKER</span><span class="kind k-${it.kind}">${KIND[it.kind]}</span>${evsBadge(r)}</div>`;

function cemBody(o, it, r) {
  if (r.v === 'NA') return '';
  const ev = r.ev || {}, types = ev.types || [], msg = S.cardMsg?.key === it.key ? `<p class="warn">${esc(S.cardMsg.msg)}</p>` : '';
  return `<div class="cem">${it.kind === 'gen' ? '<p class="muted">Supporting prompt — evidence may be useful here. It does not create a technical requirement; the governing procedure controls.</p>' : ''}
<div class="lbl">Evidence type (select what fits this demonstration)</div><div class="chips">${Object.entries(EVT).map(([k, l]) => `<button type="button" data-act="evType" data-v="${k}" class="chip${types.includes(k) ? ' on' : ''}" aria-pressed="${types.includes(k)}">${l}</button>`).join('')}</div>
${ev.id ? `<div class="evid">Evidence ID <b>${esc(ev.id)}</b></div>${rin('Evidence Reference (document / record no. or external ID)', 'ev.ref', ev.ref)}${rta('Evidence Notes', 'ev.notes', ev.notes)}` : ''}
${types.includes('VID') || types.includes('PHO') ? captureHTML(o, types) : ''}${msg}
${(ev.media || []).map(m => mediaHTML(m, false)).join('')}</div>`;
}

function captureHTML(o, types) {
  const a = o.recAuth;
  const ack = `<div class="auth${a?.ack ? ' on' : ''}"><p>${esc(AUTH_TEXT)}</p><label class="ck"><input type="checkbox" data-auth${a?.ack ? ' checked' : ''}> Recording/upload authorized</label>${a?.ack ? `<div class="muted">Acknowledged ${fmtDT(a.at)} by ${esc(a.by)}</div>` : ''}</div>`;
  if (!a?.ack) return ack;
  const cap = (kind, label, accept) => `<label class="btn cap">${label}<input type="file" accept="${accept}" data-media="${kind}" hidden></label>`;
  return ack + `<div class="row">${types.includes('VID') ? cap('video', 'RECORD / ADD VIDEO', 'video/*') : ''}${types.includes('PHO') ? cap('photo', 'TAKE / ADD PHOTO', 'image/*') : ''}</div>`;
}

// live = rendered outside the locked fieldset (upload / local-copy actions only; never discard).
function mediaHTML(m, live) {
  const up = m.status === 'UPLOADED', p = provider();
  const acts = [];
  if (m.status === 'READY' || m.status === 'FAILED') acts.push(p.configured
    ? `<button type="button" class="btn-s pri" data-act="upMedia">${m.status === 'FAILED' ? 'RETRY UPLOAD' : 'UPLOAD'}</button>`
    : '<span class="muted">Upload unavailable — client evidence storage is not configured. File remains LOCAL / PENDING.</span>');
  if (up && m.local) acts.push('<button type="button" class="btn-s" data-act="rmLocal">Remove local copy</button>');
  if (!live && !up && m.status !== 'UPLOADING') acts.push('<button type="button" class="btn-s danger" data-act="discard">Discard file</button>');
  return `<div class="med ${up ? 'conf' : 'pend'}" data-fid="${esc(m.fid)}"><div class="med-h"><b>${esc(m.fid)}</b> · ${m.kind === 'video' ? 'Video' : 'Photo'} · ${esc(m.name)} · ${fmtSize(m.size)} · ${fmtDT(m.captured)}</div>
<div class="mst s-${m.status}">${MSTAT[m.status]}</div>
${up ? `<div class="loc conf">CLIENT STORAGE / CONFIRMED — Ref ${esc(m.storage.ref)} · confirmed ${fmtDT(m.storage.confirmed)} · ${esc(m.storage.provider)} · local copy ${m.local ? 'still on this device' : 'removed'}</div>` : `<div class="loc pend">${PENDING_WARN}</div>`}
${m.error ? `<div class="warn">${esc(m.error)}</div>` : ''}
${m.local ? `<div class="prev" data-prev="${esc(m.fid)}" data-kind="${m.kind}"></div>` : up ? '' : '<div class="warn">Local file is not on this device (record imported from another device, or file lost).</div>'}
${acts.length ? `<div class="row">${acts.join('')}</div>` : ''}</div>`;
}

const basisEd = b => `<div class="req" data-bid="${b.id}"><label class="f"><span>Category</span><select data-bs="cat"><option value="">— select —</option>${BASIS_CATS.map(c => `<option${b.cat === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
${BASIS_F.map(([k, l]) => `<label class="f"><span>${l}</span><input data-bs="${k}" value="${esc(b[k])}" autocomplete="off"${k === 'doc' ? ' list="basisDocs"' : ''}${k === 'rev' ? ' placeholder="Verify and enter the current revision"' : ''}></label>`).join('')}
<label class="f"><span>Notes</span><textarea rows="2" data-bs="notes">${esc(b.notes)}</textarea></label>
<div class="req-act"><button type="button" class="btn-s danger" data-act="delBasis">Delete</button></div></div>`;

const ojtEd = e => `<div class="req" data-oid="${e.id}">${OJT_F.map(([k, l, t]) => `<label class="f"><span>${l}</span><input data-oj="${k}" type="${t || 'text'}" value="${esc(e[k])}" autocomplete="off"></label>`).join('')}
<label class="f"><span>Result (observer selects)</span><select data-oj="result"><option value="">— select —</option>${OJT_RESULTS.map(c => `<option${e.result === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
<label class="f"><span>Experience / OJT Hours Associated With Observation</span><input data-oj="hours" inputmode="decimal" value="${esc(e.hours)}" autocomplete="off"></label>
<label class="f"><span>Notes</span><textarea rows="2" data-oj="notes">${esc(e.notes)}</textarea></label>
<div class="req-act"><button type="button" class="btn-s danger" data-act="delOjt">Delete</button></div></div>`;
function itemDetail(r, it) {
  if (r.v === 'N') return findingFields(r, it);
  if (r.v === 'NOTE') return noteFields(r);
  return r.c ? rta('Comment', 'c', r.c) : '<button type="button" class="lnk" data-act="cmt">+ Comment</button>';
}
function findingFields(r, it) {
  const f = r.f || {};
  return `<div class="fnd"><div class="tag">FINDING</div>${rta('Observed Condition (required)', 'f.observed', f.observed, 'What the technician actually did', f.observed?.trim() ? '' : 'need')}
${rta('Required Condition', 'f.required', f.required, 'Per requirement: ' + it.text)}
<label class="f"><span>Classification</span><select data-rf="f.cls"><option value="">— select —</option>${CLASSES.map(c => `<option${f.cls === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
${rta('Observer Comment', 'c', r.c)}${rta('Technician Comment (optional)', 'f.tech', f.tech)}</div>`;
}
const noteFields = r => `<div class="obsv"><div class="tag">OBSERVATION</div>${rta('Description', 'c', r.c, 'What was observed')}${rin('Procedure Reference (optional)', 'o.ref', r.o?.ref)}${rta('Observer Comment / Recommendation', 'o.rec', r.o?.rec)}</div>`;

const secHTML = (o, s) => `<section class="card${s.primary ? ' prim' : ''}"><h2>${esc(s.title)}</h2>${s.primary ? '' : '<p class="muted">Supporting item — the governing procedure controls.</p>'}
${s.items.length ? s.items.map(it => itemCard(o, it)).join('') : '<p class="muted">No requirements entered.</p>'}
${s.primary ? '<button type="button" class="btn" data-act="step" data-v="setup">Add / edit requirements (SETUP)</button>' : ''}</section>`;

function reqEd(r, i, n) {
  return `<div class="req" data-rid="${r.id}"><div class="g2"><label class="f"><span>Step</span><input data-rq="step" value="${esc(r.step)}" inputmode="decimal"></label><label class="f"><span>Paragraph / Reference</span><input data-rq="ref" value="${esc(r.ref)}"></label></div>
<label class="f"><span>Requirement / Required Action</span><textarea rows="2" data-rq="text">${esc(r.text)}</textarea></label>
<label class="ck cemck"><input type="checkbox" data-rq="critical"${r.critical ? ' checked' : ''}> Critical Evidence Marker (carries into templates; evidence does not)</label>
<div class="req-act"><button type="button" class="btn-s" data-act="mvReq" data-v="-1"${i ? '' : ' disabled'}>↑ Up</button><button type="button" class="btn-s" data-act="mvReq" data-v="1"${i < n - 1 ? '' : ' disabled'}>↓ Down</button><button type="button" class="btn-s danger" data-act="delReq">Delete</button></div></div>`;
}

const STEPV = {
  info: o => `<section class="card"><h2>Observation Information</h2>
${INFO_F.map(([k, l]) => bf(l, 'info.' + k, 'text', k === 'hours' ? 'inputmode="decimal"' : '')).join('')}
<div class="lbl">NDT Method</div><div class="seg">${Object.entries(METHODS).map(([k, l]) => `<button type="button" data-act="method" data-v="${k}" class="${o.info.method === k ? 'on' : ''}">${l}</button>`).join('')}</div>
${PEOPLE_F.map(([k, l]) => bf(l, 'info.' + k)).join('')}
<div class="g3">${bf('Date', 'info.date', 'date')}${bf('Start Time', 'info.start', 'time')}${bf('End Time', 'info.end', 'time')}</div></section>
<section class="card gov"><h2>Governing Procedure</h2><p class="muted">Record exactly which procedure the technician is required to follow.</p>${o.fromTemplate && !o.proc.rev ? `<p class="warn">Revision / change levels were not carried from template “${esc(o.fromTemplate)}”. Verify and enter the current revision for this inspection.</p>` : ''}${PROC_F.map(([k, l]) => bf(l, 'proc.' + k)).join('')}</section>
<section class="card gov"><h2>Governing Basis</h2><p class="muted">Documents governing this observation (written practice, NDI standard, component procedure, work package). No revision is assumed current — enter the revision verified for this job.</p>
<div id="basis">${o.basis.map(basisEd).join('')}</div><button type="button" class="btn big" data-act="addBasis">+ ADD GOVERNING BASIS DOCUMENT</button>
<datalist id="basisDocs">${BASIS_DOCS.map(d => `<option value="${esc(d)}">`).join('')}</datalist></section>`,

  setup: o => govLine(o) + `<section class="card prim"><h2>Procedure-Specific Requirements</h2><p class="muted">Enter requirements from the authorized governing procedure. Answer them on INSPECT.</p>
<div id="reqs">${o.req.map((r, i) => reqEd(r, i, o.req.length)).join('')}</div>
<button type="button" class="btn big" data-act="addReq">+ ADD REQUIREMENT</button></section>
${sections(o).filter(s => s.step === 'setup').map(s => secHTML(o, s)).join('')}
${o.info.method ? '' : '<p class="warn">Select the NDT method on INFO to show method-specific setup items.</p>'}`,

  inspect: o => govLine(o) + sections(o).filter(s => s.step === 'inspect').map(s => secHTML(o, s)).join(''),

  findings: o => {
    const F = findings(o), O = observations(o);
    const head = x => `<div class="fh"><b>${x.no}</b> · ${esc(x.sec)}${refOf(x) ? ' · ' + esc(refOf(x)) : ''}</div><div class="itxt">${esc(x.text)}</div>`;
    return `<section class="card"><h2>Findings (${F.length})</h2><p class="muted">Every NO creates a finding. Change the response to remove it.</p>
${F.map(f => `<div class="item v-N" data-key="${f.key}">${head(f)}${findingFields(f.r, f)}</div>`).join('') || '<p class="muted">No findings.</p>'}</section>
<section class="card"><h2>Observations (${O.length})</h2><p class="muted">From NOTE responses. Not classified as noncompliance.</p>
${O.map(x => `<div class="item v-NOTE" data-key="${x.key}">${head(x)}${noteFields(x.r)}</div>`).join('') || '<p class="muted">No observations.</p>'}</section>`;
  },

  complete: o => {
    const t = tally(o), nF = findings(o).length, nO = observations(o).length;
    const row = (k, v, c = '') => `<tr${c ? ` class="${c}"` : ''}><td>${k}</td><td>${v}</td></tr>`;
    const pad = (who, label) => `<canvas class="sig" data-sig="${who}" aria-label="${label} signature"></canvas><div class="row"><button type="button" class="btn-s" data-act="clrSig" data-v="${who}">Clear signature</button></div>`;
    return `<section class="card"><h2>Procedure Compliance Observation</h2><table class="sum">
${row('Total Requirements', t.total)}${row('Applicable Requirements', t.applicable)}${row('YES (Satisfactory)', t.Y)}${row('NO', t.N)}${row('N/A', t.NA)}${row('Notes / Observations', nO)}${row('Findings', nF)}${t.total - t.ans ? row('Not answered', t.total - t.ans, 'warnrow') : ''}</table></section>
<section class="card"><h2>OJT / Task Evidence (optional)</h2><p class="muted">${esc(OJT_NOTE)}</p>
<div id="ojt">${o.ojt.map(ojtEd).join('')}</div><button type="button" class="btn big" data-act="addOjt">+ ADD OJT / TASK ENTRY</button></section>
<section class="card"><h2>Overall Observation</h2><p class="muted">Selected by the observer.</p>
<div class="opts">${OVERALL.map(x => `<button type="button" data-act="overall" data-v="${esc(x)}" class="opt${o.overall.sel === x ? ' on' : ''}">${esc(x)}</button>`).join('')}</div>
${bta('Overall Comments', 'overall.comments')}${bf('End Time', 'info.end', 'time')}</section>
<section class="card"><h2>Signatures</h2><h3>Observer</h3>${bf('Name', 'sig.obs.name')}${bf('Certification', 'sig.obs.cert')}${pad('obs', 'Observer')}${bf('Date', 'sig.obs.date', 'date')}
<h3>Technician</h3>${bf('Name', 'sig.tech.name')}${pad('tech', 'Technician')}${bf('Date', 'sig.tech.date', 'date')}</section>`;
  },
};

function problems(o) {
  const p = [];
  if (!o.info.method) p.push('Select the NDT method (INFO).');
  for (const f of findings(o)) if (!f.r.f?.observed?.trim()) p.push(`${f.no}: observed condition is required.`);
  if (!o.overall.sel) p.push('Select an overall observation.');
  return p;
}

// Rendered outside the disabled fieldset so they work on completed records.
const STEPX = {
  setup: o => `<section class="card"><h2>Save as Template</h2><p class="muted">Saves aircraft model, component, method, governing procedure / basis identity and references, and procedure-specific requirements with their Critical Evidence Marker designation. Never revision / change levels, technician, aircraft tail/serial, responses, evidence, findings, observations, OJT entries or signatures.</p>
<div class="row"><input id="tplName" aria-label="Template name" value="${esc([o.info.aircraftModel, METHODS[o.info.method], o.info.component, o.proc.wp].filter(Boolean).join(' · ') || 'Template')}"><button type="button" class="btn" data-act="saveTpl">SAVE TEMPLATE</button></div><p id="tplmsg" class="msg"></p></section>`,
  complete: o => {
    const p = problems(o), w = warnings(o), media = allMedia(o);
    return `${media.length ? `<section class="card"><h2>Evidence Files (${media.length})</h2><p class="muted">Upload status can be updated on a completed record.</p>${media.map(({ key, m }) => `<div data-key="${key}">${mediaHTML(m, true)}</div>`).join('')}</section>` : ''}
<section class="card">${w.length ? `<div class="cwarn"><b>Completion warnings</b> — these do not block completion and do not create findings.<ul>${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${o.status === 'completed'
      ? `<p class="ok">Completed ${fmtDT(o.completed)}</p><button type="button" class="btn big" data-act="reopen">REOPEN FOR EDITING</button>`
      : `${p.length ? `<ul class="warn">${p.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<button type="button" class="btn pri big" data-act="complete"${p.length ? ' disabled' : ''}>COMPLETE OBSERVATION</button>`}
<button type="button" class="btn big" data-act="report">VIEW / PRINT REPORT</button><button type="button" class="btn" data-act="exportOne" data-id="${o.id}">EXPORT OBSERVATION BACKUP</button></section>`;
  },
};

function renderObs() {
  const o = S.obs, locked = o.status === 'completed';
  if (S.step === 'complete' && !locked && !o.sig.tech.name && o.info.techName) o.sig.tech.name = o.info.techName;
  top.innerHTML = `<div class="bar"><button class="lnk" data-act="home">‹ Home</button><span id="saved" class="saved">Saved</span><button class="btn-s" data-act="save">SAVE</button></div><div id="stat" class="stat"></div><div class="prog"><i id="progbar"></i></div>`;
  tabs.hidden = false;
  tabs.innerHTML = STEPS.map(([k, l]) => `<button data-act="step" data-v="${k}" class="${S.step === k ? 'on' : ''}">${l}</button>`).join('');
  main.innerHTML = (locked ? '<div class="banner">COMPLETED — read only. Reopen on COMPLETE to edit.</div>' : '')
    + `<fieldset class="fs"${locked ? ' disabled' : ''}>${STEPV[S.step](o)}</fieldset>${STEPX[S.step]?.(o) || ''}<p class="disc">${DISCLAIMER}</p>`;
  updStat();
  markCur();
  attachPreviews(main);
  if (S.step === 'complete') {
    for (const c of main.querySelectorAll('canvas[data-sig]')) {
      const s = o.sig[c.dataset.sig];
      attachPad(c, s.img, locked, img => {
        s.img = img;
        if (!s.date) { s.date = today(); const d = document.getElementById(fid(`sig.${c.dataset.sig}.date`)); if (d) d.value = s.date; }
        touch(0);
      });
    }
  }
}

function updStat() {
  const o = S.obs, t = tally(o);
  document.getElementById('stat').innerHTML = `<b class="st st-${o.status}">${o.status === 'completed' ? 'COMPLETED' : 'OPEN'}</b> ${esc(METHODS[o.info.method] || '—')} | ${esc(o.info.component || '—')} | ${t.ans} / ${t.total} Completed`;
  document.getElementById('progbar').style.width = (t.total ? 100 * t.ans / t.total : 0) + '%';
}

const UNANS = '.item:not(.v-Y):not(.v-N):not(.v-NA):not(.v-NOTE)';
function markCur() {
  main.querySelector('.item.cur')?.classList.remove('cur');
  main.querySelector(UNANS)?.classList.add('cur');
}

async function openObs(o) {
  S.obs = normalize(o);
  const last = await db.get('kv', 'last');
  S.step = last?.id === o.id ? last.step : (o.status === 'completed' ? 'complete' : 'info');
  await go('obs');
}
const rememberStep = () => db.put('kv', { k: 'last', id: S.obs.id, step: S.step });

function armed(b, msg = 'Tap again to delete') {
  if (b.dataset.armed) return true;
  const t = b.textContent;
  b.dataset.armed = '1';
  b.textContent = msg;
  b.classList.add('armed');
  setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = t; b.classList.remove('armed'); } }, 3000);
  return false;
}

function rerenderKeepScroll() { const y = scrollY; renderObs(); scrollTo(0, y); }
function rerenderCard(key) {
  const card = main.querySelector(`.item[data-key="${CSS.escape(key)}"]`);
  const it = sections(S.obs).flatMap(s => s.items).find(i => i.key === key);
  if (!card || !it) return rerenderKeepScroll();
  card.outerHTML = itemCard(S.obs, it);
  const nc = main.querySelector(`.item[data-key="${CSS.escape(key)}"]`);
  attachPreviews(nc);
  updStat();
  markCur();
  return nc;
}
const keyOf = b => b.closest('[data-key]').dataset.key;
const fidOf = b => b.closest('[data-fid]').dataset.fid;
async function saveNow() { touch(0); await flush(); }

// ---------- events ----------
const ACT = {
  home: () => go('home'),
  profile: () => go('profile'),
  templates: () => go('templates'),
  async new() { (await db.all('tpl')).length ? go('newpick') : ACT.create({ dataset: {} }); },
  async create(b) {
    const tpl = b.dataset.tpl ? await db.get('tpl', b.dataset.tpl) : null;
    const o = newObs(S.profile, tpl);
    await db.put('obs', o);
    openObs(o);
  },
  async open(b) { const o = await db.get('obs', b.dataset.id); if (o) openObs(o); },
  async dup(b) {
    const s = await db.get('obs', b.dataset.id), now = new Date();
    const n = structuredClone(s);
    Object.assign(n, { id: uid(), status: 'open', created: now.toISOString(), updated: now.toISOString(), resp: {}, overall: { sel: '', comments: '' } });
    delete n.completed;
    Object.assign(n, { ojt: [], recAuth: null });
    Object.assign(n.info, { techName: '', techCert: '', date: today(now), start: nowTime(now), end: '' });
    n.sig = { obs: { name: S.profile.name, cert: S.profile.cert, img: '', date: '' }, tech: { name: '', img: '', date: '' } };
    await db.put('obs', n);
    S.msg = 'Duplicated (technician, responses, evidence, OJT entries, recording authorization, overall result and signatures cleared).';
    render();
  },
  async del(b) {
    const o = await db.get('obs', b.dataset.id), n = o ? pendingMedia(o).length : 0;
    if (!armed(b, n ? `Tap again — also deletes ${n} PENDING evidence file(s)` : undefined)) return;
    if (o) await deleteObsMedia(o);
    await db.del('obs', b.dataset.id);
    render();
  },
  async delTpl(b) { if (armed(b)) { await db.del('tpl', b.dataset.id); render(); } },
  async exportOne(b) { await flush(); const o = await db.get('obs', b.dataset.id); saveFile(fileName(o), pack([o], [])); },
  async exportAll() { saveFile(fileName(null), pack(await db.all('obs'), await db.all('tpl'))); },

  async step(b) { await flush(); S.step = b.dataset.v; rememberStep(); renderObs(); scrollTo(0, 0); },
  async save() { dirty = true; await flush(); },
  method(b) { S.obs.info.method = b.dataset.v; touch(0); rerenderKeepScroll(); },
  resp(b) {
    const o = S.obs, card = b.closest('[data-key]'), key = card.dataset.key, v = b.dataset.v;
    const r = o.resp[key] ??= {};
    r.v = r.v === v ? '' : v;
    touch(0);
    const it = sections(o).flatMap(s => s.items).find(i => i.key === key);
    card.outerHTML = itemCard(o, it);
    const nc = main.querySelector(`[data-key="${key}"]`);
    updStat();
    markCur();
    attachPreviews(nc);
    if (r.v === 'N' || r.v === 'NOTE') nc.querySelector('textarea')?.focus({ preventScroll: true });
    else if (r.v) {
      const all = [...main.querySelectorAll('.item')], nx = all.slice(all.indexOf(nc) + 1).find(e => e.matches(UNANS));
      if (nx && nx.getBoundingClientRect().bottom > innerHeight - 70) nx.scrollIntoView({ block: 'center' });
    }
  },
  cmt(b) { b.outerHTML = rta('Comment', 'c', ''); },
  addReq() {
    const o = S.obs, last = o.req.at(-1), n = parseFloat(last?.step);
    o.req.push({ id: uid(), step: Number.isFinite(n) && String(n) === last.step ? String(n + 1) : '', ref: '', text: '', critical: false });
    touch(0);
    rerenderKeepScroll();
    main.querySelector('#reqs .req:last-child textarea')?.focus();
  },
  mvReq(b) {
    const a = S.obs.req, i = a.findIndex(r => r.id === b.closest('[data-rid]').dataset.rid), j = i + +b.dataset.v;
    [a[i], a[j]] = [a[j], a[i]];
    touch(0);
    rerenderKeepScroll();
  },
  delReq(b) {
    if (!armed(b)) return;
    const id = b.closest('[data-rid]').dataset.rid;
    S.obs.req = S.obs.req.filter(r => r.id !== id);
    for (const m of S.obs.resp['p:' + id]?.ev?.media || []) db.del('media', m.fid);
    delete S.obs.resp['p:' + id];
    touch(0);
    rerenderKeepScroll();
  },
  async saveTpl() {
    const name = document.getElementById('tplName').value.trim() || 'Template';
    await db.put('tpl', makeTemplate(S.obs, name));
    document.getElementById('tplmsg').textContent = `Template “${name}” saved.`;
  },
  async evType(b) {
    const o = S.obs, key = keyOf(b), r = o.resp[key] ??= {}, ev = r.ev ??= newEv(), v = b.dataset.v;
    ev.types = ev.types.includes(v) ? ev.types.filter(x => x !== v) : [...ev.types, v];
    if (!ev.id && ev.types.length) ev.id = await nextEvidenceId(o.info.method);
    touch(0);
    rerenderCard(key);
  },
  async upMedia(b) {
    const key = keyOf(b), fid = fidOf(b);
    await upload(S.obs, key, fid, async () => { await saveNow(); rerenderKeepScroll(); });
  },
  async discard(b) {
    if (!armed(b, 'Tap again — file was never uploaded')) return;
    const key = keyOf(b);
    await discardMedia(S.obs, key, fidOf(b));
    await saveNow();
    rerenderCard(key);
  },
  async rmLocal(b) {
    if (!armed(b, 'Tap again to remove local copy')) return;
    try { await removeLocal(S.obs, keyOf(b), fidOf(b)); await saveNow(); } catch (e) { S.cardMsg = { key: keyOf(b), msg: e.message }; }
    rerenderKeepScroll();
    S.cardMsg = null;
  },
  addBasis() { S.obs.basis.push(newBasis()); touch(0); rerenderKeepScroll(); },
  delBasis(b) {
    if (!armed(b)) return;
    const id = b.closest('[data-bid]').dataset.bid;
    S.obs.basis = S.obs.basis.filter(x => x.id !== id);
    touch(0); rerenderKeepScroll();
  },
  addOjt() {
    const i = S.obs.info, p = S.obs.proc;
    S.obs.ojt.push({ id: uid(), method: METHODS[i.method] || '', task: '', component: i.component, procedure: [p.manual, p.wp].filter(Boolean).join(' '), date: i.date, tech: i.techName, observer: i.observerName, result: '', hours: '', notes: '' });
    touch(0); rerenderKeepScroll();
  },
  delOjt(b) {
    if (!armed(b)) return;
    const id = b.closest('[data-oid]').dataset.oid;
    S.obs.ojt = S.obs.ojt.filter(x => x.id !== id);
    touch(0); rerenderKeepScroll();
  },
  overall(b) { S.obs.overall.sel = S.obs.overall.sel === b.dataset.v ? '' : b.dataset.v; touch(0); rerenderKeepScroll(); },
  clrSig(b) { const s = S.obs.sig[b.dataset.v]; s.img = ''; touch(0); rerenderKeepScroll(); },
  async complete() {
    const o = S.obs;
    if (problems(o).length) return;
    Object.assign(o, { status: 'completed', completed: new Date().toISOString() });
    if (!o.info.end) o.info.end = nowTime();
    touch(0);
    await flush();
    rerenderKeepScroll();
  },
  async reopen() { S.obs.status = 'open'; delete S.obs.completed; touch(0); await flush(); rerenderKeepScroll(); },
  async report() {
    await flush();
    rep.innerHTML = `<div class="rbar noprint"><button class="btn pri" data-act="print">PRINT / SAVE AS PDF</button><button class="btn" data-act="back">BACK</button></div>${reportHTML(S.obs)}`;
    main.hidden = tabs.hidden = top.hidden = true;
    rep.hidden = false;
    scrollTo(0, 0);
  },
  print: () => window.print(),
  back() { rep.hidden = true; main.hidden = top.hidden = false; renderObs(); },
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled || b.tagName === 'INPUT' || b.closest('fieldset:disabled')) return;
  ACT[b.dataset.act]?.(b);
});

document.addEventListener('input', e => {
  const t = e.target;
  if (!S.obs || S.view !== 'obs' || t.type === 'checkbox' || t.type === 'file') return;
  if (t.dataset.p) {
    setP(S.obs, t.dataset.p, t.value);
    if (t.dataset.p === 'info.component') updStat();
  } else if (t.dataset.rf) {
    const r = S.obs.resp[t.closest('[data-key]').dataset.key] ??= {};
    setP(r, t.dataset.rf, t.value);
    if (t.dataset.rf === 'f.observed') t.closest('label').classList.toggle('need', !t.value.trim());
    if (t.dataset.rf.startsWith('ev.')) t.closest('.item')?.querySelector('.evs')?.replaceWith(Object.assign(document.createElement('template'), { innerHTML: evsBadge(r) }).content);
  } else if (t.dataset.rq) {
    S.obs.req.find(x => x.id === t.closest('[data-rid]').dataset.rid)[t.dataset.rq] = t.value;
  } else if (t.dataset.bs) {
    S.obs.basis.find(x => x.id === t.closest('[data-bid]').dataset.bid)[t.dataset.bs] = t.value;
  } else if (t.dataset.oj) {
    S.obs.ojt.find(x => x.id === t.closest('[data-oid]').dataset.oid)[t.dataset.oj] = t.value;
  } else return;
  touch();
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (S.obs && S.view === 'obs') {
    if (t.dataset.rq === 'critical') {
      S.obs.req.find(x => x.id === t.closest('[data-rid]').dataset.rid).critical = t.checked;
      return touch(0);
    }
    if (t.hasAttribute('data-auth')) {
      S.obs.recAuth = t.checked ? { ack: true, by: S.profile.name, at: new Date().toISOString(), text: AUTH_TEXT } : null;
      await saveNow();
      return rerenderKeepScroll();
    }
    if (t.dataset.media && t.files[0]) {
      const key = keyOf(t);
      S.cardMsg = null;
      try { await addMedia(S.obs, key, t.files[0], t.dataset.media); await saveNow(); }
      catch (err) { S.cardMsg = { key, msg: 'File not added: ' + err.message }; }
      rerenderCard(key);
      S.cardMsg = null;
      return;
    }
  }
  if (t.dataset.act !== 'import' || !t.files[0]) return;
  try {
    const r = await importText(await t.files[0].text());
    S.msg = `Import complete: ${r.added} added, ${r.updated} updated, ${r.skipped} already current, ${r.tplAdded} templates added${r.invalid ? `, ${r.invalid} invalid records skipped` : ''}.`;
  } catch (err) { S.msg = 'Import failed: ' + err.message; }
  render();
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  S.profile = { name: f.get('name').trim(), cert: f.get('cert').trim() };
  await db.put('kv', { k: 'profile', ...S.profile });
  go('home');
});

// ---------- boot ----------
(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
  const p = await db.get('kv', 'profile');
  S.profile = p ? { name: p.name, cert: p.cert } : null;
  go(p ? 'home' : 'profile');
})();
