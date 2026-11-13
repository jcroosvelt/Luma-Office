// Cloud Luma Office : documents des comptes clients (fonction serverless Vercel + Postgres / Neon).
// Chaque document est chiffré au repos (AES-256-GCM) avec la clé de données du compte. Accès réservé au compte connecté,
// dans la limite de son offre (espace et nombre de documents).
import { getSql, initUsers, initDocs, logEvent } from './_db.js';
import { authUser, effective, encrypt, decrypt, limiter, ipOf, json, fail, originOk, readBody } from './_auth.js';

const rateOk = limiter(240, 60_000);
const validId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(s);
const MAX_DOC = 3_400_000;

export default async function handler(req, res) {
  if (!originOk(req)) return fail(res, 403, 'Origine non autorisée.');
  const sql = await getSql();
  if (req.method === 'GET') return json(res, 200, { ok: true, configured: !!sql });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return fail(res, 405, 'Méthode non autorisée.'); }
  if (!sql) return fail(res, 503, 'Le cloud n’est pas encore activé sur ce site (base de données non configurée).', 'not-configured');
  if (!rateOk(ipOf(req))) return fail(res, 429, 'Trop de demandes : patientez une minute.', 'rate');
  let body;
  try { body = await readBody(req); } catch (e) { return fail(res, e.message === 'too-big' ? 413 : 400, e.message === 'too-big' ? 'Document trop volumineux pour le cloud (3 Mo maximum).' : 'Requête illisible.'); }
  try {
    await initUsers(sql); await initDocs(sql);
    const u = await authUser(req, sql);
    if (!u) return fail(res, 401, 'Connectez-vous à votre compte pour utiliser le cloud.', 'expired');
    if (u.status !== 'active') return fail(res, 403, 'Ce compte est suspendu. Contactez l’administrateur.', 'suspended');
    const owner = u.id, q = effective(u);
    switch (body.action) {
      case 'list': {
        const rows = await sql`SELECT id, updated, size, meta FROM luma_cloud_docs WHERE owner = ${owner} ORDER BY updated DESC`;
        return json(res, 200, { docs: rows.map((r) => { let m = {}; try { m = JSON.parse(decrypt(u.dek, r.meta)); } catch { m = { title: '(illisible)' }; } return { id: r.id, updated: Number(r.updated), size: r.size, ...m }; }) });
      }
      case 'get': {
        if (!validId(body.id)) return fail(res, 400, 'Identifiant invalide.');
        const rows = await sql`SELECT id, updated, data FROM luma_cloud_docs WHERE owner = ${owner} AND id = ${body.id}`;
        if (!rows.length) return fail(res, 404, 'Document introuvable dans le cloud.', 'not-found');
        return json(res, 200, { id: rows[0].id, updated: Number(rows[0].updated), data: decrypt(u.dek, rows[0].data) });
      }
      case 'put': {
        if (!validId(body.id) || typeof body.data !== 'string' || typeof body.meta !== 'object' || !body.meta) return fail(res, 400, 'Requête invalide.');
        if (body.data.length > MAX_DOC) return fail(res, 413, 'Document trop volumineux pour le cloud (3 Mo maximum).', 'too-big');
        const updated = Math.floor(+body.updated || Date.now());
        const data = encrypt(u.dek, body.data);
        const meta = encrypt(u.dek, JSON.stringify({ title: String(body.meta.title || 'Sans titre').slice(0, 200), kind: String(body.meta.kind || 'doc').slice(0, 20), words: Math.floor(+body.meta.words || 0) }));
        const size = data.length + meta.length;
        const cur = await sql`SELECT size FROM luma_cloud_docs WHERE owner = ${owner} AND id = ${body.id}`;
        const tot = await sql`SELECT count(*)::int AS n, coalesce(sum(size), 0)::bigint AS b FROM luma_cloud_docs WHERE owner = ${owner}`;
        const newDocs = tot[0].n + (cur.length ? 0 : 1), newBytes = Number(tot[0].b) - (cur[0]?.size || 0) + size;
        if (newDocs > q.quotaDocs) return fail(res, 402, `Limite de ${q.quotaDocs} documents atteinte pour l’offre ${q.label}.`, 'quota');
        if (newBytes > q.quotaBytes) return fail(res, 402, `Espace cloud plein (${Math.round(q.quotaBytes / 1048576)} Mo pour l’offre ${q.label}).`, 'quota');
        await sql`INSERT INTO luma_cloud_docs (owner, id, updated, size, meta, data, created) VALUES (${owner}, ${body.id}, ${updated}, ${size}, ${meta}, ${data}, ${Date.now()})
          ON CONFLICT (owner, id) DO UPDATE SET updated = EXCLUDED.updated, size = EXCLUDED.size, meta = EXCLUDED.meta, data = EXCLUDED.data WHERE luma_cloud_docs.updated <= EXCLUDED.updated`;
        await logEvent('cloud_put', { size });
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
      default: return fail(res, 400, 'Action inconnue.');
    }
  } catch (e) {
    console.error('[cloud]', e?.message);
    await logEvent('cloud_error', { msg: String(e?.message || '').slice(0, 120) });
    return fail(res, 500, 'Erreur du service cloud. Réessayez dans un instant.');
  }
}
