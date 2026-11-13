// Cloud Luma Office : compte client et synchronisation de vos documents entre appareils.
// Chaque client a un compte (e-mail + mot de passe) ; les documents sont chiffrés au repos sur le serveur.
import { listEverything, getDoc, putDocQuiet, hooks, pref } from './storage.js';

const url = (p) => new URL('api/' + p, document.baseURI).href;
const MAX = 3_000_000; // caractères de données envoyables par document

/* ---------- réglages mémorisés sur l'appareil ---------- */
export const cfg = {
  get: () => ({ token: '', email: '', auto: true, last: 0, deleted: {}, profile: null, ...(pref.get('cloud2', {}) || {}) }),
  set(patch) { pref.set('cloud2', { ...cfg.get(), ...patch }); },
};
export const connected = () => !!cfg.get().token;
export class CloudError extends Error { constructor(m, code) { super(m); this.code = code; } }

/* ---------- appels au serveur ---------- */
async function post(path, action, payload = {}, auth = true) {
  let res;
  try {
    res = await fetch(url(path), { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth && cfg.get().token ? { Authorization: 'Bearer ' + cfg.get().token } : {}) }, body: JSON.stringify({ action, ...payload }) });
  } catch { throw new CloudError(navigator.onLine ? 'Impossible de joindre le cloud. Réessayez.' : 'Vous êtes hors ligne : le cloud nécessite une connexion Internet.', 'network'); }
  let body = null; try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const code = body?.error?.code || 'http', m = body?.error?.message;
    if (res.status === 401 && auth && code === 'expired') { cfg.set({ token: '', profile: null }); stopCloud(); }
    if (res.status === 404 && !m) throw new CloudError('Le cloud n’est pas disponible ici.', 'no-api');
    throw new CloudError(m || `Erreur du cloud (${res.status}).`, code);
  }
  return body;
}
export async function serverInfo() {
  try { const r = await fetch(url('account')); if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return { configured: false, plans: [] }; return await r.json(); } catch { return { configured: false, plans: [] }; }
}

/* ---------- compte ---------- */
export const account = {
  async signup(email, password, name) { const r = await post('account', 'signup', { email, password, name }, false); cfg.set({ token: r.token, email: r.profile.email, profile: r.profile, auto: true, last: 0, deleted: {} }); initCloud(); return r.profile; },
  async login(email, password) { const r = await post('account', 'login', { email, password }, false); cfg.set({ token: r.token, email: r.profile.email, profile: r.profile, last: 0 }); initCloud(); return r.profile; },
  async me() { const r = await post('account', 'me'); cfg.set({ profile: r.profile }); return r.profile; },
  async changePassword(current, next) { const r = await post('account', 'change_password', { current, next }); cfg.set({ token: r.token }); },
  async deleteAccount(password) { await post('account', 'delete_account', { password }); stopCloud(); cfg.set({ token: '', email: '', profile: null, auto: false, deleted: {} }); },
  logout() { stopCloud(); cfg.set({ token: '', profile: null, auto: false }); },
};

/* ---------- sérialisation d'un document (les blobs deviennent du texte) ---------- */
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function pack(rec) {
  const out = { ...rec };
  if (rec.blob instanceof Blob) out.blob = { __blob: b64(new Uint8Array(await rec.blob.arrayBuffer())), type: rec.blob.type };
  return JSON.stringify(out);
}
function unpack(text) {
  const rec = JSON.parse(text);
  if (rec.blob?.__blob) rec.blob = new Blob([unb64(rec.blob.__blob)], { type: rec.blob.type || '' });
  return rec;
}

/* ---------- documents du cloud ---------- */
export const remoteList = async () => (await post('cloud', 'list')).docs;
export async function uploadDoc(rec) {
  const data = await pack(rec);
  if (data.length > MAX) throw new CloudError(`« ${rec.title || 'Document'} » est trop volumineux pour le cloud (3 Mo maximum).`, 'too-big');
  await post('cloud', 'put', { id: rec.id, updated: rec.updated || Date.now(), meta: { title: rec.title || 'Sans titre', kind: rec.kind || 'doc', words: rec.words || 0 }, data });
}
export async function downloadDoc(id) {
  const r = await post('cloud', 'get', { id });
  const rec = unpack(r.data);
  await putDocQuiet(rec);
  return rec;
}
export const deleteRemote = (id) => post('cloud', 'delete', { id });
export const wipeRemote = () => post('cloud', 'deleteAll');

/* ---------- synchronisation ---------- */
let running = null;
// mode : 'sync' (dans les deux sens, le plus récent gagne), 'up' (tout envoyer), 'down' (tout restaurer)
export function syncAll(mode = 'sync', onProgress) {
  if (running) return running;
  running = (async () => {
    const stats = { up: 0, down: 0, del: 0, skipped: [], errors: 0, quota: false };
    const c = cfg.get();
    if (!c.token) throw new CloudError('Connectez-vous à votre compte.', 'expired');
    const remote = new Map((await remoteList()).map((d) => [d.id, d]));
    const local = new Map((await listEverything()).filter((d) => d.kind !== 'version' && /^[A-Za-z0-9_-]{6,64}$/.test(d.id)).map((d) => [d.id, d]));
    const tomb = { ...c.deleted };
    if (mode === 'sync') for (const id of Object.keys(tomb)) { if (remote.has(id) && !local.has(id)) { await deleteRemote(id); stats.del++; remote.delete(id); } delete tomb[id]; }
    const ids = new Set([...remote.keys(), ...local.keys()]);
    const total = ids.size; let n = 0;
    for (const id of ids) {
      const l = local.get(id), r = remote.get(id);
      try {
        if (l && (!r || (mode !== 'down' && (l.updated || 0) > r.updated))) { if (mode === 'down') { /* rien à envoyer */ } else if (!stats.quota) { await uploadDoc(l); stats.up++; } }
        else if (r && (!l || (mode !== 'up' && r.updated > (l.updated || 0)))) { if (mode !== 'up') { await downloadDoc(id); stats.down++; } }
      } catch (e) {
        if (e.code === 'too-big') stats.skipped.push(l?.title || id);
        else if (e.code === 'quota') { stats.quota = e.message; }
        else if (['network', 'expired', 'suspended', 'not-configured'].includes(e.code)) throw e;
        else stats.errors++;
      }
      onProgress?.(++n, total);
    }
    cfg.set({ last: Date.now(), deleted: tomb });
    return stats;
  })().finally(() => { running = null; });
  return running;
}

/* ---------- synchronisation automatique ---------- */
const pending = new Map(); let timer = 0, interval = 0;
export function initCloud() {
  stopCloud();
  const c = cfg.get();
  if (!c.token) return;
  hooks.onDelete = (id) => {
    const x = cfg.get(); cfg.set({ deleted: { ...x.deleted, [id]: Date.now() } }); pending.delete(id);
    if (cfg.get().auto) deleteRemote(id).then(() => { const y = cfg.get(), d = { ...y.deleted }; delete d[id]; cfg.set({ deleted: d }); }).catch(() => {});
  };
  if (!c.auto) return;
  hooks.onPut = (d) => { pending.set(d.id, d); clearTimeout(timer); timer = setTimeout(flush, 8000); };
  const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine && cfg.get().auto && cfg.get().token) syncAll('sync').then(() => { try { window.dispatchEvent(new CustomEvent('luma-cloud-synced')); } catch { /* ignore */ } }).catch(() => {}); };
  setTimeout(tick, 4000);
  interval = setInterval(tick, 5 * 60_000);
  document.addEventListener('visibilitychange', tick);
  initCloud.tick = tick;
}
async function flush() {
  const items = [...pending.values()]; pending.clear();
  for (const d of items) { try { const cur = await getDoc(d.id); if (cur && cur.kind !== 'version') await uploadDoc(cur); } catch { /* repris à la prochaine synchronisation */ } }
}
export function stopCloud() {
  hooks.onPut = null; hooks.onDelete = null; clearInterval(interval); clearTimeout(timer);
  if (initCloud.tick) { document.removeEventListener('visibilitychange', initCloud.tick); initCloud.tick = null; }
}
