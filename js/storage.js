// Client evidence storage — provider abstraction.
//
// Production target: PHONE → this app → authorized secure upload → CLIENT-CONTROLLED storage
// → storage confirmation / file ID → evidence reference stored in the observation.
// SOS is not the permanent repository. No provider has been selected: that depends on what STi/Army permit
// (see docs/CONNECTED_LAYER.md). Never put storage credentials, public buckets or permanent public URLs here.
//
// Provider contract:
//   id          short identifier recorded with each confirmed upload
//   label       shown to the user
//   configured  false → the app offers no upload and keeps evidence LOCAL / PENDING
//   upload(blob, meta) → Promise<{ ref, confirmed? }>
//       ref        storage system's confirmed file / reference ID (required; no ref = not uploaded)
//       confirmed  ISO date/time of storage confirmation (optional; else the time the app received it)
//       Throw on any failure. The app then marks UPLOAD FAILED and keeps the local copy for retry.

const NOT_CONFIGURED = Object.freeze({
  id: 'none',
  label: 'Not configured',
  configured: false,
  async upload() { throw new Error('Client evidence storage is not configured.'); },
});

let active = NOT_CONFIGURED;

export const provider = () => active;

// Called by a future, client-approved connector module (and by the test harness with a mock).
export function registerProvider(p) {
  if (!p || typeof p.upload !== 'function' || !p.id) throw new Error('Invalid storage provider.');
  active = p;
}
