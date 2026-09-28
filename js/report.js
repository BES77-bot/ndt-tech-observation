import { esc, nl, sections, tally, findings, observations, refOf, fmtDT, METHODS, RLAB } from './model.js';
import { DISCLAIMER } from './checklists.js';

const kv = rows => `<table class="kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${nl(v) || '—'}</td></tr>`).join('')}</table>`;

export function reportHTML(o) {
  const i = o.info, p = o.proc, t = tally(o), F = findings(o), O = observations(o);
  const ref = {};
  F.forEach(f => { ref[f.key] = f.no; });
  O.forEach(x => { ref[x.key] = x.no; });
  const secs = sections(o);

  const table = s => `<section class="rs"><h3>${esc(s.title)}</h3>${s.items.length ? `<table class="chk"><thead><tr><th>#</th>${s.primary ? '<th>Step / Ref.</th>' : ''}<th>Requirement</th><th>Response</th><th>Comment</th></tr></thead><tbody>${s.items.map((it, n) => {
    const r = o.resp[it.key] || {};
    return `<tr class="r-${r.v || 'none'}"><td>${n + 1}</td>${s.primary ? `<td>${esc(refOf(it))}</td>` : ''}<td>${esc(it.text)}</td><td class="resp">${RLAB[r.v] || '—'}</td><td>${ref[it.key] ? `<b>${ref[it.key]}</b> ` : ''}${nl(r.c)}</td></tr>`;
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
<section class="gov"><h2>Governing Procedure</h2>${kv([['Technical Manual / Document', p.manual], ['Work Package / Procedure', p.wp], ['Procedure Title', p.title], ['Revision / Change', p.rev], ['Procedure Date', p.procDate], ['Component / Inspection Ref.', p.compRef], ['Acceptance Criteria Ref.', p.acceptRef]])}</section>
</div>
<section><h2>Procedure Compliance Observation — Summary</h2><table class="sumr"><tr>
<td>Total Requirements<b>${t.total}</b></td><td>Applicable<b>${t.applicable}</b></td><td>YES<b>${t.Y}</b></td><td>NO<b>${t.N}</b></td><td>N/A<b>${t.NA}</b></td><td>Observations<b>${O.length}</b></td><td>Findings<b>${F.length}</b></td>${t.total - t.ans ? `<td>Not answered<b>${t.total - t.ans}</b></td>` : ''}
</tr></table></section>
${table(secs[0])}
<h2>Supporting Observation Checklist</h2>
<p class="note">General supporting items. Where any item differs from the governing procedure, the governing procedure controls.</p>
${secs.slice(1).map(table).join('')}
<section class="rs"><h2>Findings (${F.length})</h2>${F.length ? F.map(f => `<div class="blk">${kv([[f.no, f.sec], ['Requirement', f.text], ['Procedure Reference', refOf(f)], ['Observed Condition', f.r.f?.observed], ['Required Condition', f.r.f?.required], ['Classification', f.r.f?.cls], ['Observer Comment', f.r.c], ['Technician Comment', f.r.f?.tech]])}</div>`).join('') : '<p>No findings.</p>'}</section>
<section class="rs"><h2>Observations (${O.length})</h2>${O.length ? O.map(x => `<div class="blk">${kv([[x.no, x.sec], ['Requirement', x.text], ['Procedure Reference', x.r.o?.ref || refOf(x)], ['Description', x.r.c], ['Observer Comment / Recommendation', x.r.o?.rec]])}</div>`).join('') : '<p>No observations.</p>'}</section>
<section class="rs"><h2>Overall Observation</h2><p class="ovr">${esc(o.overall.sel) || 'Not selected'}</p>${o.overall.comments ? `<p>${nl(o.overall.comments)}</p>` : ''}</section>
<section class="rs sigs"><h2>Signatures</h2><div class="sigrow">
<div><h3>Observer</h3>${sig(o.sig.obs, [['Name', o.sig.obs.name], ['Certification', o.sig.obs.cert], ['Date', o.sig.obs.date]])}</div>
<div><h3>Technician</h3>${sig(o.sig.tech, [['Name', o.sig.tech.name], ['Date', o.sig.tech.date]])}</div>
</div></section>
<footer class="disc">${DISCLAIMER}<br>Report generated ${fmtDT(new Date().toISOString())}</footer>
</article>`;
}
