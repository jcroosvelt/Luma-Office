// Comptes clients du cloud : création de compte, connexion, profil, changement de mot de passe, suppression du compte.
// Prêt pour un abonnement payant futur : chaque compte a une offre (plan), une date de fin et des quotas (voir _auth.js).
import { randomBytes } from 'node:crypto';
import { getSql, initUsers, initDocs, logEvent } from './_db.js';
import { PLANS, hashPassword, checkPassword, newDek, makeToken, authUser, profile, EMAIL_RE, normEmail, limiter, ipOf, json, fail, originOk, readBody } from './_auth.js';

const signupOk = limiter(6, 3_600_000);     // créations de compte par adresse IP et par heure
const loginOk = limiter(12, 600_000);       // connexions par IP et par 10 minutes
const loginEmailOk = limiter(10, 600_000);  // connexions par e-mail et par 10 minutes
const otherOk = limiter(120, 60_000);

async function usage(sql, id) {
  const r = await sql`SELECT count(*)::int AS docs, coalesce(sum(size), 0)::bigint AS bytes FROM luma_cloud_docs WHERE owner = ${id}`;
  return { docs: r[0].docs, bytes: Number(r[0].bytes) };
}

export default async function handler(req, res) {
  if (!originOk(req)) return fail(res, 403, 'Origine non autorisée.');
  const sql = await getSql();
  if (req.method === 'GET') {
    return json(res, 200, { ok: true, configured: !!sql, plans: Object.values(PLANS).map((p) => ({ id: p.id, label: p.label, bytes: p.bytes, docs: p.docs, price: p.price, available: p.available })) });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return fail(res, 405, 'Méthode non autorisée.'); }
  if (!sql) return fail(res, 503, 'Le cloud n’est pas encore activé sur ce site (base de données non configurée).', 'not-configured');
  let body;
  try { body = await readBody(req, 50_000); } catch { return fail(res, 400, 'Requête illisible.'); }
  const ip = ipOf(req);
  try {
    await initUsers(sql); await initDocs(sql);
    switch (body.action) {
      case 'signup': {
        if (!signupOk(ip)) return fail(res, 429, 'Trop de créations de compte depuis cette connexion : réessayez plus tard.', 'rate');
        const email = normEmail(body.email), password = String(body.password || ''), name = String(body.name || '').trim().slice(0, 60);
        if (!EMAIL_RE.test(email)) return fail(res, 400, 'Adresse e-mail invalide.', 'bad-email');
        if (password.length < 8) return fail(res, 400, 'Le mot de passe doit contenir au moins 8 caractères.', 'weak-password');
        if (password.length > 200) return fail(res, 400, 'Mot de passe trop long.', 'weak-password');
        const exists = await sql`SELECT 1 AS x FROM luma_users WHERE email = ${email}`;
        if (exists.length) return fail(res, 409, 'Un compte existe déjà avec cette adresse e-mail : connectez-vous.', 'exists');
        const id = randomBytes(16).toString('hex'), free = PLANS.free;
        await sql`INSERT INTO luma_users (id, email, name, pw, dek, created, plan, quota_bytes, quota_docs) VALUES (${id}, ${email}, ${name || null}, ${hashPassword(password)}, ${newDek()}, ${Date.now()}, 'free', ${free.bytes}, ${free.docs})`;
        const u = (await sql`SELECT * FROM luma_users WHERE id = ${id}`)[0];
        await logEvent('signup', {});
        return json(res, 200, { token: makeToken(u), profile: profile(u, { docs: 0, bytes: 0 }) });
      }
      case 'login': {
        const email = normEmail(body.email);
        if (!loginOk(ip) || !loginEmailOk(email)) return fail(res, 429, 'Trop de tentatives : patientez 10 minutes.', 'rate');
        const u = (await sql`SELECT * FROM luma_users WHERE email = ${email}`)[0];
        if (!u || !checkPassword(body.password || '', u.pw)) { await new Promise((r) => setTimeout(r, 500)); return fail(res, 401, 'E-mail ou mot de passe incorrect.', 'bad-login'); }
        if (u.status !== 'active') return fail(res, 403, 'Ce compte est suspendu. Contactez l’administrateur.', 'suspended');
        await sql`UPDATE luma_users SET last_login = ${Date.now()} WHERE id = ${u.id}`;
        await logEvent('login', {});
        return json(res, 200, { token: makeToken(u), profile: profile(u, await usage(sql, u.id)) });
      }
      default: break;
    }
    // actions suivantes : connecté
    if (!otherOk(ip)) return fail(res, 429, 'Trop de demandes : patientez une minute.', 'rate');
    const u = await authUser(req, sql);
    if (!u) return fail(res, 401, 'Session expirée : reconnectez-vous.', 'expired');
    if (u.status !== 'active') return fail(res, 403, 'Ce compte est suspendu. Contactez l’administrateur.', 'suspended');
    switch (body.action) {
      case 'me': return json(res, 200, { profile: profile(u, await usage(sql, u.id)) });
      case 'change_password': {
        if (!checkPassword(body.current || '', u.pw)) return fail(res, 403, 'Mot de passe actuel incorrect.', 'bad-login');
        const next = String(body.next || '');
        if (next.length < 8 || next.length > 200) return fail(res, 400, 'Le nouveau mot de passe doit contenir au moins 8 caractères.', 'weak-password');
        await sql`UPDATE luma_users SET pw = ${hashPassword(next)}, tv = tv + 1 WHERE id = ${u.id}`;
        const nu = (await sql`SELECT * FROM luma_users WHERE id = ${u.id}`)[0];
        return json(res, 200, { token: makeToken(nu) });
      }
      case 'delete_account': {
        if (!checkPassword(body.password || '', u.pw)) return fail(res, 403, 'Mot de passe incorrect.', 'bad-login');
        await sql`DELETE FROM luma_cloud_docs WHERE owner = ${u.id}`;
        await sql`DELETE FROM luma_users WHERE id = ${u.id}`;
        await logEvent('account_deleted', {});
        return json(res, 200, { ok: true });
      }
      default: return fail(res, 400, 'Action inconnue.');
    }
  } catch (e) {
    console.error('[account]', e?.message);
    return fail(res, 500, 'Erreur du serveur. Réessayez dans un instant.');
  }
}
