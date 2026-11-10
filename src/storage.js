// Stockage local des documents (IndexedDB) — fonctionne hors ligne.
const DB = 'luma-office';
const STORE = 'docs';
const FOLDERS = 'folders';
let dbp;

function open() {
  dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(FOLDERS)) db.createObjectStore(FOLDERS, { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

async function tx(mode, fn, store = STORE) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const listDocs = async () => (await tx('readonly', (s) => s.getAll())).filter((d) => d.kind !== 'template').sort((a, b) => b.updated - a.updated);
export const listUserTemplates = async () => (await tx('readonly', (s) => s.getAll())).filter((d) => d.kind === 'template').sort((a, b) => b.updated - a.updated);
export const listEverything = () => tx('readonly', (s) => s.getAll());
export const getDoc = (id) => tx('readonly', (s) => s.get(id));
export const putDoc = (d) => tx('readwrite', (s) => s.put(d));
export const deleteDoc = (id) => tx('readwrite', (s) => s.delete(id));
// Dossiers de l'appareil connectés pour la recherche (poignées FileSystemDirectoryHandle)
export const listFolders = () => tx('readonly', (s) => s.getAll(), FOLDERS);
export const putFolder = (f) => tx('readwrite', (s) => s.put(f), FOLDERS);
export const deleteFolder = (id) => tx('readwrite', (s) => s.delete(id), FOLDERS);
export const newId = () =>
  globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

// Demande au navigateur de ne jamais effacer les documents (stockage persistant)
export async function persist() {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return !!(await navigator.storage?.persist?.());
  } catch { return false; }
}

export async function storageInfo() {
  try {
    const est = (await navigator.storage?.estimate?.()) || {};
    return { persisted: !!(await navigator.storage?.persisted?.()), usage: est.usage || 0, quota: est.quota || 0 };
  } catch { return { persisted: false, usage: 0, quota: 0 }; }
}

export const fmtBytes = (n) => (n > 1e9 ? (n / 1e9).toFixed(1) + ' Go' : n > 1e6 ? (n / 1e6).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1e3)) + ' Ko');

export const pref = {
  get: (k, d) => { try { const v = localStorage.getItem('luma:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('luma:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};
