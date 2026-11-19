// Partage de documents entre comptes (lecture seule), commentaires, mentions et notifications.
// Un document n'est partagé qu'avec un compte EXISTANT (jamais avec une adresse inconnue : personne ne peut ainsi
// récupérer un document en créant un compte à cette adresse). Le destinataire lit le document en direct (toujours
// la dernière version du propriétaire) ; le propriétaire peut retirer le partage à tout moment.
// Les commentaires et les notifications sont chiffrés au repos avec la clé de données du compte concerné.
import { randomBytes } from 'node:crypto';
import { getSql, initUsers, initDocs, initShares, logEvent } from './_db.js';
import { authUser, encrypt, decrypt, EMAIL_RE, normEmail, limiter, ipOf, json, fail, originOk, readBody, cors } from './_auth.js';

const rateOk = limiter(180, 60_000);
const lookupOk = limiter(20, 3_600_000);   // recherches d'une adresse e-mail, par compte et par heure
const commentOk = limiter(40, 60_000);
const validId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(s);
const MAX_SHARES_PER_DOC = 20, MAX_SHARES_PER_USER = 300, MAX_COMMENT = 2000;
const newId = () => randomBytes(12).toString('hex');
const person = (u) => ({ id: u.id, name: u.name || '', email: u.email });
const label = (u) => u.name || u.email.split('@')[0];

// « @marie », « @marie.dupont », « @marie-dupont » : désigne un participant du document
export function mentionedIn(text, people) {
  const t = ` ${String(text).toLowerCase()} `;
  const out = [];
  for (const p of people) {
    const handles = new Set();
    const name = (p.name || '').trim().toLowerCase();
    if (name) { handles.add(name.replace(/\s+/g, '')); handles.add(name.replace(/\s+/g, '.')); handles.add(name.replace(/\s+/g, '-')); handles.add(name.split(/\s+/)[0]); }
    handles.add(String(p.email).split('@')[0].toLowerCase());
    for (const h of handles) {
      if (!h) continue;
      const esc = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`[\\s(\\[,;:!?]@${esc}(?![\\p{L}\\p{N}_-])`, 'u').test(t)) { out.push(p.id); break; }
    }
  }
  return out;
}

const userRow = async (sql, id) => (await sql`SELECT * FROM luma_users WHERE id = ${id}`)[0];

// Écrit une notification chiffrée pour un utilisateur (point d'entrée unique : l'envoi push Firebase s'y branchera).
export async function notify(sql, userId, type, payload) {
  const to = await userRow(sql, userId);
  if (!to) return;
  const body = encrypt(to.dek, JSON.stringify(payload));
  await sql`INSERT INTO luma_notifs (user_id, type, body, created) VALUES (${userId}, ${type}, ${body}, ${Date.now()})`;
  await sql`DELETE FROM luma_notifs WHERE user_id = ${userId} AND id NOT IN (SELECT id FROM luma_notifs WHERE user_id = ${userId} ORDER BY created DESC, id DESC LIMIT 100)`;
}

async function docMeta(sql, owner, docId) {
  const rows = await sql`SELECT id, updated, meta FROM luma_cloud_docs WHERE owner = ${owner.id} AND id = ${docId}`;
  if (!rows.length) return null;
  let m = {};
  try { m = JSON.parse(decrypt(owner.dek, rows[0].meta)); } catch { m = {}; }
  return { id: rows[0].id, updated: Number(rows[0].updated), title: m.title || 'Sans titre', kind: m.kind || 'doc' };
}

// Participants d'un document : le propriétaire et les comptes avec lesquels il est partagé
async function participants(sql, ownerId, docId) {
  const rows = await sql`SELECT u.id, u.name, u.email FROM luma_users u WHERE u.id = ${ownerId} OR u.id IN (SELECT to_user FROM luma_shares WHERE owner = ${ownerId} AND doc_id = ${docId})`;
  return rows.map(person);
}

// Accès à un document partagé : par l'identifiant d'un partage (destinataire ou propriétaire) ou, pour le propriétaire, par l'identifiant du document
async function access(sql, u, body) {
  if (typeof body.id === 'string' && /^[a-f0-9]{24}$/.test(body.id)) {
    const s = (await sql`SELECT * FROM luma_shares WHERE id = ${body.id}`)[0];
    if (!s || (s.to_user !== u.id && s.owner !== u.id)) return null;
    return { share: s, ownerId: s.owner, docId: s.doc_id, isOwner: s.owner === u.id };
  }
  if (validId(body.docId)) {
    const has = await sql`SELECT 1 AS x FROM luma_cloud_docs WHERE owner = ${u.id} AND id = ${body.docId}`;
    if (has.length) return { share: null, ownerId: u.id, docId: body.docId, isOwner: true };
  }
  return null;
}

async function thread(sql, owner, docId, people) {
  const rows = await sql`SELECT id, author, body, mentions, created FROM luma_comments WHERE owner = ${owner.id} AND doc_id = ${docId} ORDER BY created ASC LIMIT 500`;
  const by = new Map(people.map((p) => [p.id, p]));
  return rows.map((r) => {
    let text = ''; try { text = decrypt(owner.dek, r.body); } catch { text = '(illisible)'; }
    let mentions = []; try { mentions = JSON.parse(r.mentions); } catch { mentions = []; }
    const a = by.get(r.author);
    return { id: r.id, author: a ? { id: a.id, name: a.name, email: a.email } : { id: r.author, name: 'Ancien participant', email: '' }, text, mentions, created: Number(r.created) };
  });
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!originOk(req)) return fail(res, 403, 'Origine non autorisée.');
  const sql = await getSql();
  if (req.method === 'GET') return json(res, 200, { ok: true, configured: !!sql });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return fail(res, 405, 'Méthode non autorisée.'); }
  if (!sql) return fail(res, 503, 'Le partage n’est pas encore activé sur ce site (base de données non configurée).', 'not-configured');
  if (!rateOk(ipOf(req))) return fail(res, 429, 'Trop de demandes : patientez une minute.', 'rate');
  let body;
  try { body = await readBody(req, 60_000); } catch (e) { return fail(res, e.message === 'too-big' ? 413 : 400, 'Requête illisible.'); }
  try {
    await initUsers(sql); await initDocs(sql); await initShares(sql);
    const u = await authUser(req, sql);
    if (!u) return fail(res, 401, 'Connectez-vous à votre compte pour partager des documents.', 'expired');
    if (u.status !== 'active') return fail(res, 403, 'Ce compte est suspendu. Contactez l’administrateur.', 'suspended');
    switch (body.action) {
      case 'create': {
        if (!validId(body.docId)) return fail(res, 400, 'Document invalide.');
        const email = normEmail(body.email);
        if (!EMAIL_RE.test(email)) return fail(res, 400, 'Adresse e-mail invalide.', 'bad-email');
        if (email === u.email) return fail(res, 400, 'Ce document est déjà à vous : saisissez l’adresse d’une autre personne.', 'self');
        const meta = await docMeta(sql, u, body.docId);
        if (!meta) return fail(res, 404, 'Ce document n’est pas encore dans votre cloud : synchronisez-le d’abord.', 'not-in-cloud');
        if (meta.kind !== 'doc') return fail(res, 400, 'Seuls les documents texte peuvent être partagés pour l’instant.', 'bad-kind');
        if (!lookupOk(u.id)) return fail(res, 429, 'Trop de partages en peu de temps : réessayez plus tard.', 'rate');
        const to = (await sql`SELECT * FROM luma_users WHERE email = ${email}`)[0];
        if (!to || to.status !== 'active') return fail(res, 404, 'Aucun compte Luma Office avec cette adresse. Invitez cette personne à créer un compte, puis partagez à nouveau.', 'no-account');
        const n = (await sql`SELECT count(*)::int AS n FROM luma_shares WHERE owner = ${u.id} AND doc_id = ${body.docId}`)[0].n;
        const mine = (await sql`SELECT count(*)::int AS n FROM luma_shares WHERE owner = ${u.id}`)[0].n;
        const existing = await sql`SELECT id FROM luma_shares WHERE owner = ${u.id} AND doc_id = ${body.docId} AND to_user = ${to.id}`;
        if (existing.length) return json(res, 200, { id: existing[0].id, already: true, to: person(to) });
        if (n >= MAX_SHARES_PER_DOC) return fail(res, 400, `Un document ne peut pas être partagé avec plus de ${MAX_SHARES_PER_DOC} personnes.`, 'limit');
        if (mine >= MAX_SHARES_PER_USER) return fail(res, 400, 'Limite de partages atteinte : retirez d’anciens partages.', 'limit');
        const id = newId();
        await sql`INSERT INTO luma_shares (id, owner, doc_id, to_user, created) VALUES (${id}, ${u.id}, ${body.docId}, ${to.id}, ${Date.now()})`;
        await notify(sql, to.id, 'share', { shareId: id, title: `${label(u)} a partagé « ${meta.title} » avec vous`, doc: meta.title, from: label(u) });
        await logEvent('share', {});
        return json(res, 200, { id, to: person(to) });
      }
      case 'out': { // partages d'un de mes documents
        if (!validId(body.docId)) return fail(res, 400, 'Document invalide.');
        const rows = await sql`SELECT s.id, s.created, v.id AS uid, v.name, v.email FROM luma_shares s JOIN luma_users v ON v.id = s.to_user WHERE s.owner = ${u.id} AND s.doc_id = ${body.docId} ORDER BY s.created ASC`;
        return json(res, 200, { shares: rows.map((r) => ({ id: r.id, created: Number(r.created), to: { id: r.uid, name: r.name || '', email: r.email } })) });
      }
      case 'revoke': { // le propriétaire retire un partage ; le destinataire peut aussi le quitter
        if (!/^[a-f0-9]{24}$/.test(String(body.id))) return fail(res, 400, 'Partage invalide.');
        await sql`DELETE FROM luma_shares WHERE id = ${body.id} AND (owner = ${u.id} OR to_user = ${u.id})`;
        return json(res, 200, { ok: true });
      }
      case 'inbox': { // documents partagés avec moi
        const rows = await sql`SELECT * FROM luma_shares WHERE to_user = ${u.id} ORDER BY created DESC LIMIT 300`;
        const owners = new Map(), items = [];
        for (const s of rows) {
          if (!owners.has(s.owner)) owners.set(s.owner, await userRow(sql, s.owner));
          const o = owners.get(s.owner);
          if (!o) continue;
          const meta = await docMeta(sql, o, s.doc_id);
          if (!meta) continue; // le document a été supprimé par son propriétaire
          const c = (await sql`SELECT count(*)::int AS n FROM luma_comments WHERE owner = ${s.owner} AND doc_id = ${s.doc_id}`)[0].n;
          items.push({ id: s.id, docId: s.doc_id, title: meta.title, updated: meta.updated, shared: Number(s.created), owner: { name: o.name || '', email: o.email }, comments: c });
        }
        return json(res, 200, { items });
      }
      case 'get': { // lecture d'un document partagé + fil de commentaires
        const a = await access(sql, u, body);
        if (!a) return fail(res, 404, 'Document introuvable ou partage retiré.', 'not-found');
        const owner = a.isOwner ? u : await userRow(sql, a.ownerId);
        if (!owner) return fail(res, 404, 'Document introuvable.', 'not-found');
        const rows = await sql`SELECT updated, data, meta FROM luma_cloud_docs WHERE owner = ${owner.id} AND id = ${a.docId}`;
        if (!rows.length) return fail(res, 404, 'Ce document n’est plus disponible.', 'not-found');
        let m = {}; try { m = JSON.parse(decrypt(owner.dek, rows[0].meta)); } catch { m = {}; }
        const people = await participants(sql, owner.id, a.docId);
        return json(res, 200, {
          id: a.share?.id || null, docId: a.docId, title: m.title || 'Sans titre', updated: Number(rows[0].updated), data: decrypt(owner.dek, rows[0].data),
          owner: { name: owner.name || '', email: owner.email }, me: u.id, isOwner: a.isOwner, people, comments: await thread(sql, owner, a.docId, people),
        });
      }
      case 'comments': { // fil de commentaires seul (rafraîchissement)
        const a = await access(sql, u, body);
        if (!a) return fail(res, 404, 'Document introuvable ou partage retiré.', 'not-found');
        const owner = a.isOwner ? u : await userRow(sql, a.ownerId);
        const people = await participants(sql, owner.id, a.docId);
        return json(res, 200, { people, comments: await thread(sql, owner, a.docId, people) });
      }
      case 'comment': {
        if (!commentOk(u.id)) return fail(res, 429, 'Trop de commentaires : patientez un instant.', 'rate');
        const text = String(body.text || '').trim();
        if (!text) return fail(res, 400, 'Écrivez un commentaire.', 'empty');
        if (text.length > MAX_COMMENT) return fail(res, 400, `Commentaire trop long (${MAX_COMMENT} caractères au maximum).`, 'too-long');
        const a = await access(sql, u, body);
        if (!a) return fail(res, 404, 'Document introuvable ou partage retiré.', 'not-found');
        const owner = a.isOwner ? u : await userRow(sql, a.ownerId);
        const meta = await docMeta(sql, owner, a.docId);
        if (!meta) return fail(res, 404, 'Ce document n’est plus disponible.', 'not-found');
        const people = await participants(sql, owner.id, a.docId);
        const mentioned = mentionedIn(text, people.filter((p) => p.id !== u.id));
        const id = newId(), now = Date.now();
        await sql`INSERT INTO luma_comments (id, owner, doc_id, author, body, mentions, created) VALUES (${id}, ${owner.id}, ${a.docId}, ${u.id}, ${encrypt(owner.dek, text)}, ${JSON.stringify(mentioned)}, ${now})`;
        const snippet = text.length > 140 ? text.slice(0, 137) + '…' : text;
        for (const p of people) {
          if (p.id === u.id) continue;
          const shareId = p.id === owner.id ? ((await sql`SELECT id FROM luma_shares WHERE owner = ${owner.id} AND doc_id = ${a.docId} AND to_user = ${u.id}`)[0]?.id || null) : ((await sql`SELECT id FROM luma_shares WHERE owner = ${owner.id} AND doc_id = ${a.docId} AND to_user = ${p.id}`)[0]?.id || null);
          const isMention = mentioned.includes(p.id);
          await notify(sql, p.id, isMention ? 'mention' : 'comment', {
            shareId, docId: a.docId, owner: owner.id, doc: meta.title, from: label(u), text: snippet,
            title: isMention ? `${label(u)} vous a mentionné dans « ${meta.title} »` : `${label(u)} a commenté « ${meta.title} »`,
          });
        }
        return json(res, 200, { id, created: now, mentions: mentioned });
      }
      case 'notifs': {
        const rows = await sql`SELECT id, type, body, created, seen FROM luma_notifs WHERE user_id = ${u.id} ORDER BY created DESC, id DESC LIMIT 50`;
        const items = rows.map((r) => { let b = {}; try { b = JSON.parse(decrypt(u.dek, r.body)); } catch { b = {}; } return { id: Number(r.id), type: r.type, created: Number(r.created), seen: !!r.seen, ...b }; });
        return json(res, 200, { items, unseen: items.filter((i) => !i.seen).length });
      }
      case 'notif_seen': {
        if (body.all) await sql`UPDATE luma_notifs SET seen = true WHERE user_id = ${u.id}`;
        else for (const id of (Array.isArray(body.ids) ? body.ids : []).slice(0, 100)) { if (Number.isInteger(id)) await sql`UPDATE luma_notifs SET seen = true WHERE user_id = ${u.id} AND id = ${id}`; }
        return json(res, 200, { ok: true });
      }
      default: return fail(res, 400, 'Action inconnue.');
    }
  } catch (e) {
    console.error('[share]', e?.message);
    await logEvent('share_error', { msg: String(e?.message || '').slice(0, 120) });
    return fail(res, 500, 'Erreur du service de partage. Réessayez dans un instant.');
  }
}
