// Minimal IndexedDB wrapper. Stores: obs (observations), tpl (templates), kv (profile, last-open).
let dbp;
function open() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('sos-ndt-observation', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('obs', { keyPath: 'id' });
      d.createObjectStore('tpl', { keyPath: 'id' });
      d.createObjectStore('kv', { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx(store, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const q = fn(t.objectStore(store));
    let out;
    if (q) q.onsuccess = () => { out = q.result; };
    t.oncomplete = () => res(out);
    t.onerror = t.onabort = () => rej(t.error);
  });
}

export const db = {
  all: s => tx(s, 'readonly', x => x.getAll()),
  get: (s, k) => tx(s, 'readonly', x => x.get(k)),
  put: (s, v) => tx(s, 'readwrite', x => x.put(v)),
  del: (s, k) => tx(s, 'readwrite', x => x.delete(k)),
};
