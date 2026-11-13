// Comptes utilisateurs : mots de passe (scrypt), sessions signées, chiffrement des documents au repos, offres et quotas.
// Variables : AUTH_SECRET (recommandée : texte aléatoire de 32 caractères ou plus ; sinon dérivée de DATABASE_URL).
import { scryptSync, randomBytes, timingSafeEqual, createHmac, createHash, createCipheriv, createDecipheriv } from 'node:crypto';

const MB = 1024 * 1024;
// Offres (l'abonnement payant se branchera sur « pro » : voir GUIDE-CLOUD.md)
export const PLANS = {
  free: { id: 'free', label: 'Gratuit', bytes: 25 * MB, docs: 50, price: 0, available: true },
  pro: { id: 'pro', label: 'Premium', bytes: 2048 * MB, docs: 5000, price: null, available: false },
};

const master = () => createHash('sha256').update('luma-master:' + (process.env.AUTH_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL || 'dev-only')).digest();
const b64 = (b) => Buffer.from(b).toString('base64');
const unb64 = (s) => Buffer.from(String(s), 'base64');

/* ----- mots de passe ----- */
export function hashPassword(pw) { const salt = randomBytes(16); return `scrypt$${b64(salt)}$${b64(scryptSync(String(pw), salt, 64))}`; }
export function checkPassword(pw, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const got = scryptSync(String(pw), unb64(salt), 64), want = unb64(hash);
  return got.length === want.length && timingSafeEqual(got, want);
}

/* ----- chiffrement AES-256-GCM (clé de données par compte, elle-même protégée par la clé maître du serveur) ----- */
function seal(key, text) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return b64(Buffer.concat([iv, c.getAuthTag(), ct]));
}
function open(key, s) {
  const u = unb64(s), d = createDecipheriv('aes-256-gcm', key, u.subarray(0, 12));
  d.setAuthTag(u.subarray(12, 28));
  return Buffer.concat([d.update(u.subarray(28)), d.final()]).toString('utf8');
}
export const newDek = () => seal(master(), b64(randomBytes(32)));      // clé de données (stockée protégée)
export const dekKey = (wrapped) => unb64(open(master(), wrapped));      // clé de données en clair (mémoire seulement)
export const encrypt = (wrapped, text) => seal(dekKey(wrapped), text);
export const decrypt = (wrapped, s) => open(dekKey(wrapped), s);

/* ----- sessions (jetons signés, 30 jours ; invalidés par un changement de mot de passe) ----- */
const sig = (p) => createHmac('sha256', master()).update('session:' + p).digest('base64url');
export function makeToken(user, days = 30) {
  const p = Buffer.from(JSON.stringify({ u: user.id, tv: user.tv || 0, exp: Date.now() + days * 86_400_000 })).toString('base64url');
  return `${p}.${sig(p)}`;
}
export function readToken(token) {
  const [p, s] = String(token || '').split('.');
  if (!p || !s) return null;
  const a = Buffer.from(sig(p)), b = Buffer.from(s);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { const j = JSON.parse(Buffer.from(p, 'base64url').toString()); return j.exp > Date.now() ? j : null; } catch { return null; }
}
export async function authUser(req, sql) {
  const t = readToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!t) return null;
  const rows = await sql`SELECT * FROM luma_users WHERE id = ${t.u}`;
  const u = rows[0];
  if (!u || (u.tv || 0) !== t.tv) return null;
  return u;
}

/* ----- offre effective et quotas ----- */
export function effective(u) {
  const expired = u.plan !== 'free' && u.plan_until && Number(u.plan_until) < Date.now();
  const plan = expired ? 'free' : u.plan;
  const base = PLANS[plan] || PLANS.free;
  return { plan, label: base.label, expired: !!expired, quotaBytes: expired ? PLANS.free.bytes : Number(u.quota_bytes), quotaDocs: expired ? PLANS.free.docs : u.quota_docs };
}
export function profile(u, used) {
  const e = effective(u);
  return { id: u.id, email: u.email, name: u.name || '', plan: e.plan, planLabel: e.label, planExpired: e.expired, planUntil: u.plan_until ? Number(u.plan_until) : null, quotaBytes: e.quotaBytes, quotaDocs: e.quotaDocs, created: Number(u.created), used: used || { docs: 0, bytes: 0 } };
}

/* ----- utilitaires communs ----- */
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const normEmail = (e) => String(e || '').trim().toLowerCase();
export function limiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now(), a = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (a.length >= max) { hits.set(key, a); return false; }
    a.push(now); hits.set(key, a);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}
export const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
export const json = (res, status, obj) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
export const fail = (res, status, message, code) => json(res, status, { error: { code: code || status, message } });
export function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let host; try { host = new URL(origin).host; } catch { return false; }
  if (host === req.headers.host) return true;
  return (process.env.AI_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
}
export async function readBody(req, max = 4_000_000) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > max) throw new Error('too-big'); }
  return raw ? JSON.parse(raw) : {};
}
