import { db } from './db.js';

const FORMAT = 'sos-ndt-tech-observation';
// Backups carry evidence METADATA only. Video/photo files are never written into export files.

export const pack = (observations, templates) =>
  ({ format: FORMAT, schema: 2, exported: new Date().toISOString(), observations, templates });

export function fileName(o) {
  const part = o ? [o.info.method, o.info.component, o.info.date].filter(Boolean).join('_') : 'all';
  return `ndt-observation_${part.replace(/[^\w.-]+/g, '-') || 'record'}.json`;
}

export async function saveFile(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  // iPhone/iPad: the share sheet (Save to Files / AirDrop) is more reliable than a download.
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

const validObs = o => o && typeof o.id === 'string' && o.info && o.proc && o.resp && Array.isArray(o.req) && o.sig && o.overall && o.updated;
const validTpl = t => t && typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.req);

// Newer record wins when the same ID already exists; older or identical copies are skipped.
export async function importText(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('File is not valid JSON.'); }
  if (d?.format !== FORMAT) throw new Error('Not an NDT observation backup file.');
  const r = { added: 0, updated: 0, skipped: 0, invalid: 0, tplAdded: 0 };
  for (const o of d.observations || []) {
    if (!validObs(o)) { r.invalid++; continue; }
    const cur = await db.get('obs', o.id);
    if (!cur) { await db.put('obs', o); r.added++; }
    else if (o.updated > cur.updated) { await db.put('obs', o); r.updated++; }
    else r.skipped++;
  }
  for (const t of d.templates || []) {
    if (!validTpl(t)) { r.invalid++; continue; }
    if (!(await db.get('tpl', t.id))) { await db.put('tpl', t); r.tplAdded++; }
  }
  return r;
}
