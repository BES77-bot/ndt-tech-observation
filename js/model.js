import { SECTIONS } from './checklists.js';

export const METHODS = { MT: 'MT', PT: 'PT/FPI', ET: 'ET' };
export const RLAB = { Y: 'YES', N: 'NO', NA: 'N/A', NOTE: 'NOTE' };

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
export const nl = s => esc(s).replace(/\n/g, '<br>');
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const nowTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtDT = iso => iso ? `${today(new Date(iso))} ${nowTime(new Date(iso))}` : '';

export const TPL_INFO = ['aircraftModel', 'component', 'method'];
export const TPL_PROC = ['manual', 'wp', 'title', 'rev'];

export function newObs(profile, tpl) {
  const now = new Date();
  const o = {
    id: uid(), status: 'open', created: now.toISOString(), updated: now.toISOString(),
    info: {
      client: '', location: '', aircraftModel: '', tail: '', hours: '', component: '', partNo: '', serialNo: '',
      method: '', techName: '', techCert: '', observerName: profile?.name || '', observerCert: profile?.cert || '',
      date: today(now), start: nowTime(now), end: '',
    },
    proc: { manual: '', wp: '', title: '', rev: '', procDate: '', compRef: '', acceptRef: '' },
    req: [], resp: {}, overall: { sel: '', comments: '' },
    sig: { obs: { name: profile?.name || '', cert: profile?.cert || '', img: '', date: '' }, tech: { name: '', img: '', date: '' } },
  };
  if (tpl) {
    for (const k of TPL_INFO) o.info[k] = tpl.info?.[k] || '';
    for (const k of TPL_PROC) o.proc[k] = tpl.proc?.[k] || '';
    o.req = (tpl.req || []).map(r => ({ id: uid(), step: r.step || '', ref: r.ref || '', text: r.text || '' }));
    o.fromTemplate = tpl.name;
  }
  return o;
}

export function makeTemplate(o, name) {
  const pick = (src, keys) => Object.fromEntries(keys.map(k => [k, src[k] || '']));
  return {
    id: uid(), name, updated: new Date().toISOString(),
    info: pick(o.info, TPL_INFO), proc: pick(o.proc, TPL_PROC),
    req: o.req.map(({ step, ref, text }) => ({ step, ref, text })),
  };
}

// Visible sections for this observation, in report order. Procedure-specific first.
export function sections(o) {
  const m = o.info.method;
  const out = [{
    id: 'proc', step: 'inspect', primary: true, title: 'Procedure-Specific Requirements',
    items: o.req.map(r => ({ key: 'p:' + r.id, step: r.step, ref: r.ref, text: r.text })),
  }];
  for (const s of SECTIONS) {
    if (s.method && s.method !== m) continue;
    out.push({ ...s, items: s.items.filter(i => !i.method || i.method === m).map(i => ({ key: 'g:' + i.id, text: i.text })) });
  }
  return out;
}

export const refOf = it => [it.step && 'Step ' + it.step, it.ref].filter(Boolean).join(' · ');

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
