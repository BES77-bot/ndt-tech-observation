import { esc, nl, sections, tally, findings, observations, refOf, fmtDT, fmtSize, METHODS, RLAB, KIND, critItems, evRecorded, warnings } from './model.js';
import { DISCLAIMER, EVT, OJT_NOTE } from './checklists.js';
import { MSTAT } from './evidence.js';

const kv = rows => `<table class="kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${nl(v) || '—'}</td></tr>`).join('')}</table>`;

export function reportHTML(o) {
  const i = o.info, p = o.proc, t = tally(o), F = findings(o), O = observations(o);
  const ref = {};
  F.forEach(f => { ref[f.key] = f.no; });
  O.forEach(x => { ref[x.key] = x.no; });
  const secs = sections(o), C = critItems(o), W = warnings(o);

  const table = s => `<section class="rs"><h3>${esc(s.title)}</h3>${s.items.length ? `<table class="chk"><thead><tr><th>#</th>${s.primary ? '<th>Step / Ref.</th>' : ''}<th>Requirement</th><th>Response</th><th>Comment</th></tr></thead><tbody>${s.items.map((it, n) => {
    const r = o.resp[it.key] || {};
    return `<tr class="r-${r.v || 'none'}"><td>${n + 1}</td>${s.primary ? `<td>${esc(refOf(it))}</td>` : ''}<td>${it.crit ? '<b class="cemr">◆ CRITICAL EVIDENCE MARKER</b><br>' : ''}${esc(it.text)}</td><td class="resp">${RLAB[r.v] || '—'}</td><td>${ref[it.key] ? `<b>${ref[it.key]}</b> ` : ''}${nl(r.c)}</td></tr>`;
  }).join('')}</tbody></table>` : '<p>None entered.</p>'}</section>`;

  const sig = (s, rows) => `<div class="sigbox">${s.img ? `<img src="${s.img}" alt="signature">` : '<div class="nosig">Not signed</div>'}${kv(rows)}</div>`;

  return `<article class="rpt">
<header class="rh"><div class="org">SOS · Solutions On Standby</div>
<h1>NDT TECHNICIAN PROCEDURE COMPLIANCE OBSERVATION</h1>
<div class="rsub">${o.status === 'completed' ? 'Completed ' + fmtDT(o.completed) : 'DRAFT — observation not completed'} · Record ${esc(o.id)}</div></header>
<div class="cols">
<section><h2>Observation</h2>${kv([['Client', i.client], ['Location', i.location], ['Date', i.date], ['Start / End', [i.start, i.end].filter(Boolean).join(' – ')], ['NDT Method', METHODS[i.method]]])}</section>
<section><h2>Aircraft / Component</h2>${kv([['Aircraft Model', i.aircraftModel], ['Tail / Serial No.', i.tail], ['Aircraft Hours', i.hours], ['Component', i.component], ['Part Number', i.partNo], ['Component Serial No.', i.serialNo]])}</section>
<section><h2>Personnel</h2>${kv([['Technician', i.techName], ['Technician Cert. / Level', i.techCert], ['Observer', i.observerName], ['Observer Certification', i.observerCert]])}</section>
<section class="gov"><h2>Governing Procedure</h2>${kv([['Technical Manual / Document', p.manual], ['Work Package / Procedure', p.wp], ['Procedure Title', p.title], ['Revision / Change', p.rev || 'NOT ENTERED — verify current revision'], ['Procedure Date', p.procDate], ['Component / Inspection Ref.', p.compRef], ['Acceptance Criteria Ref.', p.acceptRef]])}</section>
</div>
<section class="rs"><h2>Governing Basis</h2>${o.basis?.length ? `<table class="chk"><thead><tr><th>Category</th><th>Document</th><th>Revision</th><th>Reference / Paragraph</th><th>Notes</th></tr></thead><tbody>${o.basis.map(b => `<tr><td>${esc(b.cat)}</td><td>${esc(b.doc)}</td><td>${esc(b.rev) || '<b>NOT ENTERED</b>'}</td><td>${esc(b.ref)}</td><td>${nl(b.notes)}</td></tr>`).join('')}</tbody></table>` : '<p>None entered.</p>'}</section>
<section><h2>Procedure Compliance Observation — Summary</h2><table class="sumr"><tr>
<td>Total Requirements<b>${t.total}</b></td><td>Applicable<b>${t.applicable}</b></td><td>YES<b>${t.Y}</b></td><td>NO<b>${t.N}</b></td><td>N/A<b>${t.NA}</b></td><td>Observations<b>${O.length}</b></td><td>Findings<b>${F.length}</b></td>${t.total - t.ans ? `<td>Not answered<b>${t.total - t.ans}</b></td>` : ''}
</tr></table></section>
${table(secs[0])}
<h2>Supporting Observation Checklist</h2>
<p class="note">General supporting items. Where any item differs from the governing procedure, the governing procedure controls.</p>
${secs.slice(1).map(table).join('')}
<section class="rs"><h2>Procedural Findings (${F.length})</h2>${F.length ? F.map(f => `<div class="blk">${kv([[f.no, f.sec], ['Requirement', f.text], ['Procedure Reference', refOf(f)], ['Observed Condition', f.r.f?.observed], ['Required Condition', f.r.f?.required], ['Classification', f.r.f?.cls], ['Observer Comment', f.r.c], ['Technician Comment', f.r.f?.tech]])}</div>`).join('') : '<p>No findings.</p>'}</section>
<section class="rs"><h2>Observations (${O.length})</h2>${O.length ? O.map(x => `<div class="blk">${kv([[x.no, x.sec], ['Requirement', x.text], ['Procedure Reference', x.r.o?.ref || refOf(x)], ['Description', x.r.c], ['Observer Comment / Recommendation', x.r.o?.rec]])}</div>`).join('') : '<p>No observations.</p>'}</section>
<section class="rs"><h2>Critical Task Evidence (${C.length})</h2><p class="note">Critical Evidence Markers record evidence of technician task performance. They are separate from procedural findings. Supporting prompts do not create technical requirements; the governing procedure controls. Video/photo files are referenced by Evidence ID only and are not embedded in this report.</p>
${C.length ? `<table class="chk"><thead><tr><th>Requirement</th><th>Procedure Ref.</th><th>Response</th><th>Evidence Type</th><th>Evidence ID</th><th>Evidence Status</th><th>Evidence Notes</th></tr></thead><tbody>${C.map(it => {
    const ev = it.r.ev || {}, na = it.r.v === 'NA';
    const files = (ev.media || []).map(m => `${esc(m.fid)} (${m.kind}, ${fmtSize(m.size)}): ${MSTAT[m.status]}${m.status === 'UPLOADED' ? ` — CLIENT STORAGE / CONFIRMED ref ${esc(m.storage.ref)}, ${fmtDT(m.storage.confirmed)}` : ' — LOCAL / PENDING'}`).join('<br>');
    return `<tr class="r-${it.r.v || 'none'}"><td><small>${KIND[it.kind]}</small><br>${esc(it.text)}</td><td>${esc(refOf(it))}</td><td class="resp">${RLAB[it.r.v] || '—'}</td><td>${esc((ev.types || []).map(t => EVT[t]).join(', ')) || '—'}</td><td>${esc(ev.id) || '—'}${ev.ref ? `<br>Ref: ${esc(ev.ref)}` : ''}</td><td>${na ? 'N/A' : evRecorded(ev) ? 'EVIDENCE RECORDED' : '<b>EVIDENCE NOT RECORDED</b>'}${files ? '<br>' + files : ''}</td><td>${nl(ev.notes)}</td></tr>`;
  }).join('')}</tbody></table>` : '<p>No Critical Evidence Markers.</p>'}
${o.recAuth?.ack ? `<p class="note">Recording/upload authorization acknowledged ${fmtDT(o.recAuth.at)} by ${esc(o.recAuth.by)}: “${esc(o.recAuth.text)}”</p>` : ''}</section>
${o.ojt?.length ? `<section class="rs"><h2>OJT / Task Evidence</h2><p class="note">${esc(OJT_NOTE)}</p>${o.ojt.map(e => `<div class="blk">${kv([['Method', e.method], ['Task / Technique', e.task], ['Component', e.component], ['Procedure', e.procedure], ['Date', e.date], ['Technician', e.tech], ['Observer', e.observer], ['Result', e.result || 'Not selected'], ['Experience / OJT Hours Associated With Observation (not credited)', e.hours], ['Notes', e.notes]])}</div>`).join('')}</section>` : ''}
${W.length ? `<section class="rs"><h2>Completion Warnings (${W.length})</h2><p class="note">Warnings are not findings.</p><ul>${W.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
<section class="rs"><h2>Overall Observation</h2><p class="ovr">${esc(o.overall.sel) || 'Not selected'}</p>${o.overall.comments ? `<p>${nl(o.overall.comments)}</p>` : ''}</section>
<section class="rs sigs"><h2>Signatures</h2><div class="sigrow">
<div><h3>Observer</h3>${sig(o.sig.obs, [['Name', o.sig.obs.name], ['Certification', o.sig.obs.cert], ['Date', o.sig.obs.date]])}</div>
<div><h3>Technician</h3>${sig(o.sig.tech, [['Name', o.sig.tech.name], ['Date', o.sig.tech.date]])}</div>
</div></section>
<footer class="disc">${DISCLAIMER}<br>Report generated ${fmtDT(new Date().toISOString())}</footer>
</article>`;
}
