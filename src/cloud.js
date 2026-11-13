// Cloud Luma Office : synchronisation chiffrée de vos documents entre appareils.
// Le chiffrement (AES-GCM) se fait ICI, dans l'application : le serveur ne reçoit que du texte illisible.
import { listEverything, getDoc, putDocQuiet, deleteDocQuiet, hooks, pref } from './storage.js';

const API = () => new URL('api/cloud', document.baseURI).href;
const MAX = 3_000_000; // octets de données chiffrées envoyables par document
const enc = new TextEncoder(), dec = new TextDecoder();

/* ---------- réglages mémorisés sur l'appareil ---------- */
export const cfg = {
  get: () => ({ key: '', auto: false, last: 0, deleted: {}, ...(pref.get('cloud', {}) || {}) }),
  set(patch) { pref.set('cloud', { ...cfg.get(), ...patch }); },
};
export const connected = () => !!cfg.get().key;
export const newKey = () => { const b = crypto.getRandomValues(new Uint8Array(24)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const validKey = (k) => /^[A-Za-z0-9_-]{24,64}$/.test((k || '').trim());

export class CloudError extends Error { constructor(m, code) { super(m); this.code = code; } }

/* ---------- chiffrement ---------- */
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let keyCache = { k: '', ck: null };
async function cryptoKey(k) {
  if (keyCache.k === k) return keyCache.ck;
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('luma-cloud-enc:' + k));
  keyCache = { k, ck: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) };
  return keyCache.ck;
}
async function seal(k, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(k), enc.encode(text)));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64(out);
}
async function open(k, s) {
  const u = unb64(s);
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(0, 12) }, await cryptoKey(k), u.subarray(12)));
}

/* ---------- sérialisation d'un document (les blobs deviennent du texte) ---------- */
async function pack(rec) {
  const out = { ...rec };
  if (rec.blob instanceof Blob) { out.blob = { __blob: b64(new Uint8Array(await rec.blob.arrayBuffer())), type: rec.blob.type }; }
  return JSON.stringify(out);
}
function unpack(text) {
  const rec = JSON.parse(text);
  if (rec.blob?.__blob) rec.blob = new Blob([unb64(rec.blob.__blob)], { type: rec.blob.type || '' });
  return rec;
}

/* ---------- appels au serveur ---------- */
async function call(action, payload = {}, key = cfg.get().key) {
  let res;
  try { res = await fetch(API(), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cloud-key': key }, body: JSON.stringify({ action, ...payload }) }); }
  catch { throw new CloudError(navigator.onLine ? 'Impossible de joindre le cloud. Réessayez.' : 'Vous êtes hors ligne : le cloud nécessite une connexion Internet.', 'network'); }
  let body = null; try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const m = body?.error?.message;
    if (res.status === 404 && !m) throw new CloudError('Le cloud n’est pas disponible ici (fonction serveur introuvable).', 'no-api');
    throw new CloudError(m || `Erreur du cloud (${res.status}).`, body?.error?.code || 'http');
  }
  return body;
}
export async function serverConfigured() {
  try { const r = await fetch(API()); if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return false; return !!(await r.json()).configured; } catch { return false; }
}
export const status = () => call('status');

/* ---------- liste distante (titres déchiffrés) ---------- */
export async function remoteList() {
  const k = cfg.get().key;
  const { docs } = await call('list');
  const out = [];
  for (const d of docs) {
    let meta = {}; try { meta = JSON.parse(await open(k, d.meta)); } catch { meta = { title: '(illisible)' }; }
    out.push({ id: d.id, updated: d.updated, size: d.size, ...meta });
  }
  return out;
}

export async function uploadDoc(rec) {
  const k = cfg.get().key;
  const data = await seal(k, await pack(rec));
  if (data.length > MAX) throw new CloudError(`« ${rec.title || 'Document'} » est trop volumineux pour le cloud (3 Mo maximum).`, 'too-big');
  const meta = await seal(k, JSON.stringify({ title: rec.title || 'Sans titre', kind: rec.kind || 'doc', words: rec.words || 0 }));
  await call('put', { id: rec.id, updated: rec.updated || Date.now(), meta, data });
}
export async function downloadDoc(id) {
  const k = cfg.get().key;
  const r = await call('get', { id });
  const rec = unpack(await open(k, r.data));
  await putDocQuiet(rec);
  return rec;
}

/* ---------- synchronisation ---------- */
let running = null;
// mode : 'sync' (dans les deux sens, le plus récent gagne), 'up' (tout envoyer), 'down' (tout restaurer)
export function syncAll(mode = 'sync', onProgress) {
  if (running) return running;
  running = (async () => {
    const stats = { up: 0, down: 0, del: 0, skipped: [], errors: 0 };
    const c = cfg.get();
    if (!c.key) throw new CloudError('Le cloud n’est pas activé.', 'off');
    const remote = new Map((await call('list')).docs.map((d) => [d.id, d]));
    const local = new Map((await listEverything()).filter((d) => d.kind !== 'version' && /^[A-Za-z0-9_-]{6,64}$/.test(d.id)).map((d) => [d.id, d]));
    // suppressions faites sur cet appareil
    const tomb = { ...c.deleted };
    if (mode === 'sync') for (const id of Object.keys(tomb)) { if (remote.has(id) && !local.has(id)) { await call('delete', { id }); stats.del++; remote.delete(id); } delete tomb[id]; }
    const ids = new Set([...remote.keys(), ...local.keys()]);
    const total = ids.size; let n = 0;
    for (const id of ids) {
      const l = local.get(id), r = remote.get(id);
      try {
        if (l && (!r || (mode !== 'down' && (l.updated || 0) > r.updated))) { await uploadDoc(l); stats.up++; }
        else if (r && (!l || (mode !== 'up' && r.updated > (l.updated || 0)))) { if (mode === 'up') { /* rien à envoyer */ } else { await downloadDoc(id); stats.down++; } }
      } catch (e) { if (e.code === 'too-big') stats.skipped.push(l?.title || id); else if (e.code === 'network' || e.code === 'bad-key' || e.code === 'not-configured') throw e; else stats.errors++; }
      onProgress?.(++n, total);
    }
    cfg.set({ last: Date.now(), deleted: tomb });
    return stats;
  })().finally(() => { running = null; });
  return running;
}

export async function deleteRemote(id) { await call('delete', { id }); }
export async function wipeRemote() { await call('deleteAll'); }
export async function checkKey(key) { return call('status', {}, key); }

/* ---------- synchronisation automatique ---------- */
const pending = new Map(); let timer = 0, interval = 0;
// Branche les crochets : toujours le suivi des suppressions (pour les propager à la prochaine synchro), l'envoi automatique seulement si activé
export function initCloud() {
  const c = cfg.get();
  stopCloud();
  if (!c.key) return;
  hooks.onDelete = (id) => {
    const x = cfg.get(); cfg.set({ deleted: { ...x.deleted, [id]: Date.now() } }); pending.delete(id);
    if (cfg.get().auto) call('delete', { id }).then(() => { const y = cfg.get(), d = { ...y.deleted }; delete d[id]; cfg.set({ deleted: d }); }).catch(() => {});
  };
  if (!c.auto) return;
  hooks.onPut = (d) => { pending.set(d.id, d); clearTimeout(timer); timer = setTimeout(flush, 8000); };
  const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine && cfg.get().auto) syncAll('sync').then(() => { try { window.dispatchEvent(new CustomEvent('luma-cloud-synced')); } catch { /* ignore */ } }).catch(() => {}); };
  setTimeout(tick, 4000);
  interval = setInterval(tick, 5 * 60_000);
  document.addEventListener('visibilitychange', tick);
  initCloud.tick = tick;
}
async function flush() {
  const items = [...pending.values()]; pending.clear();
  for (const d of items) { try { const cur = await getDoc(d.id); if (cur) await uploadDoc(cur); } catch { /* sera repris à la prochaine synchronisation */ } }
}
export function stopCloud() {
  hooks.onPut = null; hooks.onDelete = null; clearInterval(interval); clearTimeout(timer);
  if (initCloud.tick) { document.removeEventListener('visibilitychange', initCloud.tick); initCloud.tick = null; }
}
