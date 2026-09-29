# Connected Layer — Design (NOT IMPLEMENTED)

Status: design only. Nothing in this document is built. The current field app has **no authentication, no users,
no roles and no server**; it must not be presented as having any. Implementation waits on the STi/Army decisions
listed at the end.

## Two layers

| Current field app (built) | Future connected layer (this document) |
|---|---|
| Observation, procedure requirements, Critical Evidence Markers | Authentication (client identity provider) |
| Evidence metadata, phone video/photo capture | Users, roles, method authorizations |
| Governing basis, OJT / task evidence | Client storage connector (`js/storage.js` provider) |
| Report, local persistence, JSON export | Secure evidence retrieval, Level III remote review |
| Local TEMPORARY pending evidence files | Review queue, server-side audit trail |

## Evidence flow

PHONE → field app → authorized secure upload → CLIENT-CONTROLLED storage → storage confirmation / file ID →
evidence reference stored in the observation.

- SOS is not the permanent evidence repository. No video in GitHub, no public storage, no permanent public URLs,
  no credentials in client JavaScript.
- The app connects to storage only through the provider contract in `js/storage.js`
  (`upload(blob, meta) → { ref, confirmed }`). A connector for the client's approved system implements that
  contract; the rest of the app does not change.
- A local file becomes deletable only after the provider returns a confirmed reference (status `UPLOADED`,
  `storage.ref`, `storage.confirmed`). Deletion is always a user action, never automatic.
- Likely connector shape: the app obtains a short-lived, per-file upload authorization from a client-hosted
  endpoint after the user signs in with the client identity provider. The app never holds long-lived secrets.

## Data already recorded by the field app (schema 2)

```
observation
  id, schema, status, created, updated, completed
  info{…}, proc{…}                     governing procedure (V1)
  basis[]  {id, cat, doc, rev, ref, notes}
  req[]    {id, step, ref, text, critical}
  resp{key: {v, c, f{…}, o{…}, ev}}
    ev     {uid, id, types[], ref, notes, seq{}, media[], reviews[]}
      media[] {fid, kind, name, size, type, captured, status, local, attempts, lastAttempt, error,
               auth{ack, by, at, text}, storage{provider, ref, confirmed}, sent{upload metadata}, localRemoved}
      reviews[]  reserved, always empty in the field app
  ojt[]    {id, method, task, component, procedure, date, tech, observer, result, hours, notes}
  recAuth  {ack, by, at, text}
```

`by` values in the field app are the self-entered observer profile name. They are **not authenticated identity**
and must not be treated as audit evidence of who acted.

## Roles

Roles are assigned by a System Admin. No role implies method competence: method authorization is always explicit.

| Role | Can (when built) | Cannot |
|---|---|---|
| SYSTEM ADMIN | Manage users, assign roles, methods and projects/customers; manage templates; view authorized observations/evidence; configure storage integration | Alter observation content or review determinations |
| RESPONSIBLE LEVEL III | View assigned technicians, observations, findings, OJT/task records, authorized evidence; review Critical Evidence Markers; comment; record determinations; request additional demonstration/evidence | Silently alter the observer's record; review methods not explicitly authorized |
| METHOD LEVEL III / REVIEWER | Same review functions, limited to explicitly authorized methods and projects | See methods/projects/evidence not authorized |
| OBSERVER | Create observations, record responses, capture/upload evidence | Record a Level III determination on own observation |
| TECHNICIAN | View own observations/results (scope TBD by client) | Edit observations or evidence |

Method authorization example (configured data, never hard-coded people):

```
user: <reviewer>   role: METHOD_L3   methods: { MT: true, PT: true, ET: false }   projects: [<project ids>]
```

Access rule: a user sees an observation/evidence item only if (project assigned) AND (for reviewers) the
observation's method is explicitly authorized for that user.

## Level III evidence review (per Critical Evidence Marker)

Displayed: Evidence ID, technician, method, component, procedure, procedure reference, requirement,
observer response, evidence (files via secure retrieval), observer comments.

Reviewer selects manually: Satisfactory Demonstration · Additional Evidence Required · Additional Observation
Required · Not Satisfactory · Not Evaluated.

Recorded: reviewer comment, reviewer name, reviewer qualification/role, review date/time (server time,
authenticated identity). Stored as an appended entry in `ev.reviews[]`; the observer's original record is never
modified. This is technician / OJT task-performance review — **not** aircraft acceptance or airworthiness approval.

## NEEDS REVIEW queue

Columns: Technician · Method · Component · Critical Task · Evidence ID · Date · Observer · Status.
Filters: Method, Technician, Status, Date. Queue contents are limited by the access rule above.

## Audit trail

Append-only, server-side, authenticated identity and server time for: observation created; response recorded or
changed (old → new); evidence uploaded (file ID, storage ref); evidence reviewed (determination, comment);
completion/reopen; template and user/role/permission changes (admin actions). Completed records are never
silently overwritten: changes create a new revision with the prior values preserved.

## Decision gate — information needed from STi / Army

1. Whether photography/video is authorized (locations, aircraft, inspections).
2. Approved storage system for evidence.
3. Authentication / identity provider.
4. CAC / MFA / VPN requirements.
5. CUI / export-control considerations for inspection video and metadata.
6. Who may access evidence.
7. Retention / deletion requirements.
8. Whether external applications may upload to that storage.
9. Whether SOS personnel can be provisioned accounts.
10. Whether API / application integration is permitted.
11. Whether evidence may be held temporarily on personal or company phones before upload.
12. Maximum video length / file size.
13. Whether Evidence IDs must follow a client numbering scheme.
