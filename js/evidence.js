// Critical-evidence helpers: device code, Evidence IDs, TEMPORARY local pending files, upload via the storage provider.
// The phone/app is never the permanent evidence store. A local file may be deleted only after the client
// storage system has returned a confirmed reference ID — and never automatically.
import { db } from './db.js';
import { provider } from './storage.js';
import { sections, refOf, KIND, METHODS, allMedia } from './model.js';

export const MAX_FILE = 500e6;
export const MSTAT = { READY: 'READY TO UPLOAD', UPLOADING: 'UPLOADING', UPLOADED: 'UPLOADED', FAILED: 'UPLOAD FAILED' };
export const PENDING_WARN = 'LOCAL / PENDING — stored only in this app on this device. Not yet transferred to the client evidence repository; it may be lost if browser/device storage is cleared, the app is removed, or the device is lost.';

// Random, non-identifying 2-character code generated on first use (e.g. "A7").
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ', ALNUM = ALPHA + '23456789';
export async function deviceCode() {
  const cur = await db.get('kv', 'device');
  if (cur) return cur.code;
  const r = crypto.getRandomValues(new Uint8Array(2));
  const code = ALPHA[r[0] % ALPHA.length] + ALNUM[r[1] % ALNUM.length];
  await db.put('kv', { k: 'device', code, created: new Date().toISOString() });
  return code;
}

// METHOD-DATE-DEVICE-SEQUENCE, e.g. ET-20260929-A1-001. Sequence is per method/date on this device.
export async function nextEvidenceId(method) {
  const d = new Date(), ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const prefix = `${method || 'NDT'}-${ymd}-${await deviceCode()}`;
  const s = (await db.get('kv', 'evseq')) || { k: 'evseq', n: {} };
  s.n[prefix] = (s.n[prefix] || 0) + 1;
  await db.put('kv', s);
  return `${prefix}-${String(s.n[prefix]).padStart(3, '0')}`;
}

export const newEv = () => ({ uid: crypto.randomUUID?.() || String(Math.random()).slice(2), id: '', types: [], ref: '', notes: '', media: [], reviews: [] });

export const itemOf = (o, key) => { for (const s of sections(o)) { const it = s.items.find(i => i.key === key); if (it) return { ...it, sec: s.title }; } return null; };

// Store the file locally first; the observation only gains the metadata once the file is safely stored.
export async function addMedia(o, key, file, kind) {
  if (!o.recAuth?.ack) throw new Error('Recording/upload authorization has not been acknowledged.');
  if (!file.size) throw new Error('The selected file is empty.');
  if (file.size > MAX_FILE) throw new Error(`File is ${Math.round(file.size / 1e6)} MB; the limit is ${MAX_FILE / 1e6} MB. Record a shorter clip.`);
  const est = await navigator.storage?.estimate?.().catch(() => null);
  if (est?.quota && file.size > (est.quota - est.usage) * 0.9) throw new Error('Not enough free app storage on this device for this file.');
  const ev = o.resp[key].ev;
  ev.seq ??= {};
  const n = (ev.seq[kind] || 0) + 1;                // never reused, even after a discard
  const fid = `${ev.id}-${kind === 'video' ? 'V' : 'P'}${n}`;
  await db.put('media', { fid, obsId: o.id, key, blob: file, name: file.name, type: file.type, size: file.size });
  const m = {
    fid, kind, name: file.name || fid, size: file.size, type: file.type, captured: new Date().toISOString(),
    status: 'READY', local: true, attempts: 0, error: '', storage: null,
    auth: { ...o.recAuth },
  };
  ev.seq[kind] = n;
  ev.media.push(m);
  return m;
}

export const findMedia = (o, key, fid) => o.resp[key]?.ev?.media.find(m => m.fid === fid);

export async function discardMedia(o, key, fid) {
  const ev = o.resp[key].ev, m = findMedia(o, key, fid);
  if (!m || m.status === 'UPLOADED') return;       // confirmed uploads keep their storage reference
  ev.media = ev.media.filter(x => x !== m);
  await db.del('media', fid);
}

export async function removeLocal(o, key, fid) {
  const m = findMedia(o, key, fid);
  if (!m || m.status !== 'UPLOADED' || !m.storage?.ref) throw new Error('Local copy can be removed only after confirmed client-storage upload.');
  await db.del('media', fid);
  m.local = false;
  m.localRemoved = new Date().toISOString();
}

export async function deleteObsMedia(o) {
  for (const { m } of allMedia(o)) await db.del('media', m.fid);
}

export function uploadMeta(o, key, m) {
  const it = itemOf(o, key) || {}, ev = o.resp[key].ev, i = o.info, p = o.proc;
  return {
    evidenceId: m.fid, markerEvidenceId: ev.id, observationId: o.id,
    technician: i.techName, method: METHODS[i.method] || '', aircraft: [i.aircraftModel, i.tail].filter(Boolean).join(' '),
    component: i.component, procedure: [p.manual, p.wp, p.title, p.rev && 'Rev ' + p.rev].filter(Boolean).join(' · '),
    procedureReference: refOf(it), requirement: it.text || '', requirementKind: KIND[it.kind] || '',
    captured: m.captured, observer: i.observerName, fileName: m.name, fileSize: m.size, mimeType: m.type,
    recordingAuthorization: m.auth,
  };
}

// save() persists the observation. A failed upload changes only this file's status; the observation is untouched.
export async function upload(o, key, fid, save) {
  const m = findMedia(o, key, fid), p = provider();
  if (!m || m.status === 'UPLOADED' || m.status === 'UPLOADING') return;
  if (!p.configured) { m.error = 'Client evidence storage is not configured.'; await save(); return; }
  const rec = await db.get('media', fid);
  if (!rec) { Object.assign(m, { status: 'FAILED', local: false, error: 'Local file not found on this device.' }); await save(); return; }
  const meta = uploadMeta(o, key, m);
  Object.assign(m, { status: 'UPLOADING', attempts: m.attempts + 1, lastAttempt: new Date().toISOString(), error: '' });
  await save();
  try {
    const r = await p.upload(rec.blob, meta);
    if (!r?.ref) throw new Error('Storage did not return a confirmed file / reference ID.');
    Object.assign(m, { status: 'UPLOADED', storage: { provider: p.id, ref: String(r.ref), confirmed: r.confirmed || new Date().toISOString() }, sent: meta });
  } catch (e) {
    Object.assign(m, { status: 'FAILED', error: e?.message || String(e) });
  }
  await save();
}

// Object URLs for on-screen review of locally held files.
let urls = [];
export async function attachPreviews(root) {
  urls = urls.filter(x => {
    if (x.el.isConnected) return true;
    const v = x.el.querySelector('video');                 // stop a detached preview loading before revoking its URL
    if (v) { v.removeAttribute('src'); v.load(); }
    URL.revokeObjectURL(x.u);
    return false;
  });
  for (const el of root.querySelectorAll('[data-prev]')) {
    const rec = await db.get('media', el.dataset.prev).catch(() => null);
    if (!rec || !el.isConnected) continue;
    const u = URL.createObjectURL(rec.blob);
    urls.push({ u, el });
    el.innerHTML = el.dataset.kind === 'video' ? `<video src="${u}" controls playsinline preload="metadata"></video>` : `<img src="${u}" alt="evidence photo">`;
  }
}
