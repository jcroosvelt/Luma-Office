// Cloud Luma Office : synchronisation des documents entre appareils (fonction serverless Vercel + Postgres / Neon).
// Les documents sont CHIFFRÉS dans l'application avant l'envoi : le serveur ne stocke que du texte illisible.
// Le « compte » est une clé personnelle (le serveur n'en garde que l'empreinte SHA-256).
//
// Variable d'environnement : DATABASE_URL (ou POSTGRES_URL) — chaîne de connexion Neon (voir GUIDE-CLOUD.md).
//   CLOUD_MAX_DOCS  (facultatif) nombre maximal de documents par clé (300 par défaut)
//   AI_ALLOWED_ORIGINS  (facultatif) origines autorisées en plus du site lui-même
import { createHash } from 'node:crypto';

const MAX_BODY = 4_000_000; // octets : la limite de Vercel est ~4,5 Mo par requête
const hits = new Map();
let sqlP, ready;

const json = (res, status, obj) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
const fail = (res, status, message, code) => json(res, status, { error: { code: code || status, message } });

async function getSql() {
  if (globalThis.__LUMA_SQL) return globalThis.__LUMA_SQL; // tests
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  sqlP ||= import('@neondatabase/serverless').then((m) => m.neon(url));
  return sqlP;
}
async function init(sql) {
  ready ||= sql`CREATE TABLE IF NOT EXISTS luma_cloud_docs (owner text NOT NULL, id text NOT NULL, updated bigint NOT NULL, size int NOT NULL, meta text NOT NULL, data text NOT NULL, PRIMARY KEY (owner, id))`;
  await ready;
}
function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let host; try { host = new URL(origin).host; } catch { return false; }
  if (host === req.headers.host) return true;
  return (process.env.AI_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
}
function rateOk(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 120) { hits.set(ip, arr); return false; }
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return true;
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > MAX_BODY) throw new Error('too-big'); }
  return raw ? JSON.parse(raw) : {};
}
const validId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(s);

export default async function handler(req, res) {
  if (!originOk(req)) return fail(res, 403, 'Origine non autorisée.');
  const sql = await getSql();
  if (req.method === 'GET') return json(res, 200, { ok: true, configured: !!sql });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return fail(res, 405, 'Méthode non autorisée.'); }
  if (!sql) return fail(res, 503, 'Le cloud n’est pas encore activé sur ce site (base de données non configurée).', 'not-configured');
  if (!rateOk(req)) return fail(res, 429, 'Trop de demandes : patientez une minute.', 'rate');
  const key = String(req.headers['x-cloud-key'] || '');
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(key)) return fail(res, 401, 'Clé cloud invalide.', 'bad-key');
  const owner = createHash('sha256').update('luma-cloud:' + key).digest('hex');

  let body;
  try { body = await readBody(req); } catch (e) { return fail(res, e.message === 'too-big' ? 413 : 400, e.message === 'too-big' ? 'Document trop volumineux pour le cloud (3 Mo maximum).' : 'Requête illisible.'); }
  try {
    await init(sql);
    switch (body.action) {
      case 'list': {
        const rows = await sql`SELECT id, updated, size, meta FROM luma_cloud_docs WHERE owner = ${owner} ORDER BY updated DESC`;
        return json(res, 200, { docs: rows.map((r) => ({ id: r.id, updated: Number(r.updated), size: r.size, meta: r.meta })) });
      }
      case 'get': {
        if (!validId(body.id)) return fail(res, 400, 'Identifiant invalide.');
        const rows = await sql`SELECT id, updated, meta, data FROM luma_cloud_docs WHERE owner = ${owner} AND id = ${body.id}`;
        if (!rows.length) return fail(res, 404, 'Document introuvable dans le cloud.', 'not-found');
        return json(res, 200, { id: rows[0].id, updated: Number(rows[0].updated), meta: rows[0].meta, data: rows[0].data });
      }
      case 'put': {
        if (!validId(body.id) || typeof body.meta !== 'string' || typeof body.data !== 'string') return fail(res, 400, 'Requête invalide.');
        const updated = Math.floor(+body.updated || Date.now()), size = body.data.length + body.meta.length;
        if (size > 3_400_000) return fail(res, 413, 'Document trop volumineux pour le cloud (3 Mo maximum).', 'too-big');
        const max = +process.env.CLOUD_MAX_DOCS || 300;
        const exists = await sql`SELECT 1 AS x FROM luma_cloud_docs WHERE owner = ${owner} AND id = ${body.id}`;
        if (!exists.length) { const c = await sql`SELECT count(*)::int AS n FROM luma_cloud_docs WHERE owner = ${owner}`; if (c[0].n >= max) return fail(res, 409, `Limite de ${max} documents atteinte dans le cloud.`, 'limit'); }
        await sql`INSERT INTO luma_cloud_docs (owner, id, updated, size, meta, data) VALUES (${owner}, ${body.id}, ${updated}, ${size}, ${body.meta}, ${body.data})
          ON CONFLICT (owner, id) DO UPDATE SET updated = EXCLUDED.updated, size = EXCLUDED.size, meta = EXCLUDED.meta, data = EXCLUDED.data WHERE luma_cloud_docs.updated <= EXCLUDED.updated`;
        return json(res, 200, { ok: true });
      }
      case 'delete': {
        if (!validId(body.id)) return fail(res, 400, 'Identifiant invalide.');
        await sql`DELETE FROM luma_cloud_docs WHERE owner = ${owner} AND id = ${body.id}`;
        return json(res, 200, { ok: true });
      }
      case 'deleteAll': {
        await sql`DELETE FROM luma_cloud_docs WHERE owner = ${owner}`;
        return json(res, 200, { ok: true });
      }
      case 'status': {
        const r = await sql`SELECT count(*)::int AS n, coalesce(sum(size), 0)::bigint AS bytes FROM luma_cloud_docs WHERE owner = ${owner}`;
        return json(res, 200, { docs: r[0].n, bytes: Number(r[0].bytes) });
      }
      default: return fail(res, 400, 'Action inconnue.');
    }
  } catch (e) {
    console.error('[cloud]', e?.message);
    return fail(res, 500, 'Erreur du service cloud. Réessayez dans un instant.');
  }
}
