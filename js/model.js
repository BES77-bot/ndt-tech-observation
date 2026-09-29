import { SECTIONS, CRITICAL } from './checklists.js';

export const METHODS = { MT: 'MT', PT: 'PT/FPI', ET: 'ET' };
export const RLAB = { Y: 'YES', N: 'NO', NA: 'N/A', NOTE: 'NOTE' };
export const SCHEMA = 2;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
export const nl = s => esc(s).replace(/\n/g, '<br>');
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const nowTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtDT = iso => iso ? `${today(new Date(iso))} ${nowTime(new Date(iso))}` : '';
export const fmtSize = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';

// Revision / change level is deliberately NOT carried by templates: the observer must verify it for each job.
export const TPL_INFO = ['aircraftModel', 'component', 'method'];
export const TPL_PROC = ['manual', 'wp', 'title'];
export const TPL_BASIS = ['cat', 'doc', 'ref'];

export const newBasis = (b = {}) => ({ id: uid(), cat: b.cat || '', doc: b.doc || '', rev: '', ref: b.ref || '', notes: '' });

export function newObs(profile, tpl) {
  const now = new Date();
  const o = {
    id: uid(), schema: SCHEMA, status: 'open', created: now.toISOString(), updated: now.toISOString(),
    info: {
      client: '', location: '', aircraftModel: '', tail: '', hours: '', component: '', partNo: '', serialNo: '',
      method: '', techName: '', techCert: '', observerName: profile?.name || '', observerCert: profile?.cert || '',
      date: today(now), start: nowTime(now), end: '',
    },
    proc: { manual: '', wp: '', title: '', rev: '', procDate: '', compRef: '', acceptRef: '' },
    basis: [], req: [], resp: {}, ojt: [], recAuth: null, overall: { sel: '', comments: '' },
    sig: { obs: { name: profile?.name || '', cert: profile?.cert || '', img: '', date: '' }, tech: { name: '', img: '', date: '' } },
  };
  if (tpl) {
    for (const k of TPL_INFO) o.info[k] = tpl.info?.[k] || '';
    for (const k of TPL_PROC) o.proc[k] = tpl.proc?.[k] || '';
    o.basis = (tpl.basis || []).map(newBasis);
    o.req = (tpl.req || []).map(r => ({ id: uid(), step: r.step || '', ref: r.ref || '', text: r.text || '', critical: !!r.critical }));
    o.fromTemplate = tpl.name;
  }
  return o;
}

// Brings V1 records up to the current shape in memory. Never erases stored values.
export function normalize(o) {
  o.basis ??= [];
  o.ojt ??= [];
  o.recAuth ??= null;
  for (const r of o.req) r.critical ??= false;
  for (const r of Object.values(o.resp)) for (const m of r.ev?.media || [])
    if (m.status === 'UPLOADING') Object.assign(m, { status: 'FAILED', error: 'Upload was interrupted before storage confirmation. Retry.' });
  o.schema = SCHEMA;
  return o;
}

export function makeTemplate(o, name) {
  const pick = (src, keys) => Object.fromEntries(keys.map(k => [k, src[k] || '']));
  return {
    id: uid(), name, updated: new Date().toISOString(),
    info: pick(o.info, TPL_INFO), proc: pick(o.proc, TPL_PROC),
    basis: (o.basis || []).map(b => pick(b, TPL_BASIS)),
    req: o.req.map(({ step, ref, text, critical }) => ({ step, ref, text, critical: !!critical })),
  };
}

// Visible sections for this observation, in report order. Procedure-specific first.
export function sections(o) {
  const m = o.info.method, crit = CRITICAL[m] || [];
  const out = [{
    id: 'proc', step: 'inspect', primary: true, title: 'Procedure-Specific Requirements',
    items: o.req.map(r => ({ key: 'p:' + r.id, step: r.step, ref: r.ref, text: r.text, kind: 'proc', crit: !!r.critical })),
  }];
  for (const s of SECTIONS) {
    if (s.method && s.method !== m) continue;
    out.push({ ...s, items: s.items.filter(i => !i.method || i.method === m).map(i => ({ key: 'g:' + i.id, text: i.text, kind: 'gen', crit: crit.includes(i.id) })) });
  }
  return out;
}

export const refOf = it => [it.step && 'Step ' + it.step, it.ref].filter(Boolean).join(' · ');
export const KIND = { proc: 'PROCEDURE-SPECIFIC REQUIREMENT', gen: 'SUPPORTING / GENERAL METHOD PROMPT' };

export function tally(o) {
  const t = { total: 0, ans: 0, Y: 0, N: 0, NA: 0, NOTE: 0 };
  for (const s of sections(o)) for (const it of s.items) {
    t.total++;
    const v = o.resp[it.key]?.v;
    if (v) { t.ans++; t[v]++; }
  }
  t.applicable = t.Y + t.N + t.NOTE;
  return t;
}

function collect(o, v, prefix) {
  let n = 0;
  const out = [];
  for (const s of sections(o)) for (const it of s.items) {
    const r = o.resp[it.key];
    if (r?.v === v) out.push({ ...it, no: prefix + (++n), sec: s.title, r });
  }
  return out;
}
// Findings/observations are derived from responses, so changing a NO/NOTE can never leave an orphan.
export const findings = o => collect(o, 'N', 'F-');
export const observations = o => collect(o, 'NOTE', 'O-');

// ---------- critical evidence ----------
// Evidence is RECORDED when the observer selected Direct Observation, entered an evidence reference, or added a file.
export const evRecorded = ev => !!(ev && (ev.types?.includes('DO') || ev.ref?.trim() || ev.media?.length));

export const critItems = o => sections(o).flatMap(s => s.items.filter(i => i.crit).map(i => ({ ...i, sec: s.title, r: o.resp[i.key] || {} })));

export const allMedia = o => Object.entries(o.resp).flatMap(([key, r]) => (r.ev?.media || []).map(m => ({ key, m })));
export const pendingMedia = o => allMedia(o).filter(x => x.m.status !== 'UPLOADED');

// Non-blocking completion warnings. These never create findings.
export function warnings(o) {
  const w = [];
  for (const it of critItems(o))
    if (it.r.v === 'Y' && !evRecorded(it.r.ev)) w.push(`${refOf(it) || it.sec}: “${it.text}” — Critical Evidence Marker answered YES with no evidence recorded.`);
  const pm = pendingMedia(o).length;
  if (pm) w.push(`${pm} evidence file(s) LOCAL / PENDING — not yet transferred to the client evidence repository.`);
  if (!o.proc.rev?.trim()) w.push('Governing procedure revision / change not entered — verify the current revision for this inspection.');
  for (const b of o.basis || []) if (!b.rev?.trim()) w.push(`Governing basis “${b.doc || b.cat || 'untitled'}”: revision not entered — verify the current revision.`);
  return w;
}
