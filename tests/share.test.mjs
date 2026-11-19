// Test de bout en bout du partage (comptes, cloud, partage, commentaires, mentions, notifications) sur une base PGlite.
// Lancer : node tests/share.test.mjs
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
globalThis.__LUMA_SQL = async (strings, ...vals) => {
  const q = strings.reduce((a, s, i) => a + s + (i < vals.length ? `$${i + 1}` : ''), '');
  return (await db.query(q, vals)).rows;
};
process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-1234';

const account = (await import('../api/account.js')).default;
const cloud = (await import('../api/cloud.js')).default;
const share = (await import('../api/share.js')).default;
const { mentionedIn } = await import('../api/share.js');

let ipN = 0;
async function call(handler, body, token) {
  return new Promise(async (resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { resolve({ status: this.statusCode, body: s ? JSON.parse(s) : null }); } };
    const req = { method: 'POST', headers: { host: 'x', 'x-forwarded-for': `10.0.${Math.floor(ipN / 250)}.${ipN++ % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body, socket: {} };
    await handler(req, res);
  });
}
const ok = (r, msg) => { assert.equal(r.status, 200, `${msg || ''} -> ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
const signup = async (email, name) => ok(await call(account, { action: 'signup', email, password: 'motdepasse1', name }), 'inscription ' + email).token;
const put = async (t, id, title, html, kind = 'doc') => ok(await call(cloud, { action: 'put', id, updated: Date.now(), meta: { title, kind, words: 3 }, data: JSON.stringify({ id, kind, title, html }) }, t), 'put ' + id);
let passed = 0;
const step = async (name, f) => { await f(); passed++; console.log('  ✓', name); };

console.log('Mentions');
await step('reconnaît @prénom, @prénom.nom, @prénom-nom, @début-de-l-adresse', () => {
  const people = [{ id: 'a', name: 'Marie Dupont', email: 'marie@x.fr' }, { id: 'b', name: 'Éloïse Garcia', email: 'eg@x.fr' }, { id: 'c', name: '', email: 'paul.martin@x.fr' }];
  assert.deepEqual(mentionedIn('Merci @marie !', people), ['a']);
  assert.deepEqual(mentionedIn('cc @marie.dupont et @paul.martin', people), ['a', 'c']);
  assert.deepEqual(mentionedIn('voir avec @éloïse, svp', people), ['b']);
  assert.deepEqual(mentionedIn('(@marie-dupont)', people), ['a']);
  assert.deepEqual(mentionedIn('écris à marie@x.fr', people), [], 'une adresse e-mail n’est pas une mention');
  assert.deepEqual(mentionedIn('@mariette', people), [], 'pas de mention partielle');
  assert.deepEqual(mentionedIn('pas de mention', people), []);
});

console.log('Partage');
let alice, bob, carol, shareBob, shareCarol;
await step('trois comptes et un document dans le cloud', async () => {
  alice = await signup('alice@test.fr', 'Alice Martin'); bob = await signup('bob@test.fr', 'Bob Durand'); carol = await signup('carol@test.fr', '');
  await put(alice, 'doc-rapport', 'Rapport trimestriel', '<h1>Rapport</h1><p>Les ventes progressent.</p>');
  await put(alice, 'doc-fichier-pdf', 'Contrat scanné', '', 'pdf');
});
await step('refus : adresse invalide, soi-même, document absent du cloud, PDF, compte inexistant, sans connexion', async () => {
  assert.equal((await call(share, { action: 'create', docId: 'doc-rapport', email: 'pas-une-adresse' }, alice)).body.error.code, 'bad-email');
  assert.equal((await call(share, { action: 'create', docId: 'doc-rapport', email: 'alice@test.fr' }, alice)).body.error.code, 'self');
  assert.equal((await call(share, { action: 'create', docId: 'inconnu-123456', email: 'bob@test.fr' }, alice)).body.error.code, 'not-in-cloud');
  assert.equal((await call(share, { action: 'create', docId: 'doc-fichier-pdf', email: 'bob@test.fr' }, alice)).body.error.code, 'bad-kind');
  const none = await call(share, { action: 'create', docId: 'doc-rapport', email: 'personne@test.fr' }, alice);
  assert.equal(none.status, 404); assert.equal(none.body.error.code, 'no-account');
  assert.equal((await call(share, { action: 'create', docId: 'doc-rapport', email: 'bob@test.fr' })).status, 401);
});
await step('partage avec Bob : notification reçue, partage en double ignoré', async () => {
  const r = ok(await call(share, { action: 'create', docId: 'doc-rapport', email: ' BOB@test.fr ' }, alice), 'partage');
  shareBob = r.id; assert.match(shareBob, /^[a-f0-9]{24}$/); assert.equal(r.to.email, 'bob@test.fr');
  const again = ok(await call(share, { action: 'create', docId: 'doc-rapport', email: 'bob@test.fr' }, alice));
  assert.equal(again.already, true); assert.equal(again.id, shareBob);
  const n = ok(await call(share, { action: 'notifs' }, bob));
  assert.equal(n.unseen, 1); assert.equal(n.items[0].type, 'share');
  assert.equal(n.items[0].title, 'Alice Martin a partagé « Rapport trimestriel » avec vous');
});
await step('Bob voit le document dans « Partagés avec moi » et le lit', async () => {
  const inbox = ok(await call(share, { action: 'inbox' }, bob));
  assert.equal(inbox.items.length, 1); assert.equal(inbox.items[0].title, 'Rapport trimestriel'); assert.equal(inbox.items[0].owner.name, 'Alice Martin');
  const g = ok(await call(share, { action: 'get', id: shareBob }, bob));
  assert.equal(g.isOwner, false); assert.equal(JSON.parse(g.data).html, '<h1>Rapport</h1><p>Les ventes progressent.</p>');
  assert.equal(g.people.length, 2); assert.deepEqual(g.comments, []);
});
await step('sécurité : Carol ne peut ni lire, ni commenter, ni retirer le partage de Bob', async () => {
  assert.equal((await call(share, { action: 'get', id: shareBob }, carol)).status, 404);
  assert.equal((await call(share, { action: 'comment', id: shareBob, text: 'coucou' }, carol)).status, 404);
  assert.equal((await call(share, { action: 'get', docId: 'doc-rapport' }, carol)).status, 404, 'même avec l’identifiant du document');
  ok(await call(share, { action: 'revoke', id: shareBob }, carol));
  assert.equal(ok(await call(share, { action: 'inbox' }, bob)).items.length, 1, 'le partage de Bob existe toujours');
  assert.equal((await call(share, { action: 'get', id: 'x'.repeat(24) }, bob)).status, 404);
});
await step('la lecture est en direct : une modification d’Alice est vue par Bob', async () => {
  await put(alice, 'doc-rapport', 'Rapport trimestriel (v2)', '<p>Version 2</p>');
  const g = ok(await call(share, { action: 'get', id: shareBob }, bob));
  assert.equal(g.title, 'Rapport trimestriel (v2)'); assert.equal(JSON.parse(g.data).html, '<p>Version 2</p>');
});
await step('commentaires : Bob mentionne Alice, Alice répond, notifications adaptées', async () => {
  const c1 = ok(await call(share, { action: 'comment', id: shareBob, text: 'Merci @alice, voir la page 2 svp' }, bob));
  assert.equal(c1.mentions.length, 1);
  const na = ok(await call(share, { action: 'notifs' }, alice));
  assert.equal(na.items[0].type, 'mention'); assert.equal(na.items[0].title, 'Bob Durand vous a mentionné dans « Rapport trimestriel (v2) »');
  assert.match(na.items[0].text, /voir la page 2/);
  const c2 = ok(await call(share, { action: 'comment', docId: 'doc-rapport', text: 'C’est corrigé' }, alice), 'Alice commente par docId');
  assert.equal(c2.mentions.length, 0);
  const nb = ok(await call(share, { action: 'notifs' }, bob));
  assert.equal(nb.items[0].type, 'comment'); assert.equal(nb.items[0].title, 'Alice Martin a commenté « Rapport trimestriel (v2) »');
  assert.equal(nb.unseen, 2, 'partage + commentaire');
  const th = ok(await call(share, { action: 'comments', id: shareBob }, bob));
  assert.deepEqual(th.comments.map((c) => c.text), ['Merci @alice, voir la page 2 svp', 'C’est corrigé']);
  assert.equal(th.comments[0].author.name, 'Bob Durand');
  assert.equal((await call(share, { action: 'comment', id: shareBob, text: '   ' }, bob)).body.error.code, 'empty');
  assert.equal((await call(share, { action: 'comment', id: shareBob, text: 'x'.repeat(2001) }, bob)).body.error.code, 'too-long');
});
await step('notifications : marquer comme vues', async () => {
  const n = ok(await call(share, { action: 'notifs' }, bob));
  ok(await call(share, { action: 'notif_seen', ids: [n.items[0].id] }, bob));
  assert.equal(ok(await call(share, { action: 'notifs' }, bob)).unseen, 1);
  ok(await call(share, { action: 'notif_seen', all: true }, bob));
  assert.equal(ok(await call(share, { action: 'notifs' }, bob)).unseen, 0);
  assert.equal(ok(await call(share, { action: 'notifs' }, alice)).items.length >= 1, true, 'les notifications d’Alice sont intactes');
});
await step('partage avec Carol (sans nom) : mention par le début de son adresse, fil commun', async () => {
  shareCarol = ok(await call(share, { action: 'create', docId: 'doc-rapport', email: 'carol@test.fr' }, alice)).id;
  const c = ok(await call(share, { action: 'comment', id: shareCarol, text: 'Pour @bob et @alice : ok pour moi' }, carol));
  assert.equal(c.mentions.length, 2);
  assert.equal(ok(await call(share, { action: 'notifs' }, bob)).items[0].type, 'mention');
  assert.equal(ok(await call(share, { action: 'comments', id: shareBob }, bob)).comments.length, 3, 'Bob voit le commentaire de Carol');
  const out = ok(await call(share, { action: 'out', docId: 'doc-rapport' }, alice));
  assert.deepEqual(out.shares.map((s) => s.to.email), ['bob@test.fr', 'carol@test.fr']);
});
await step('retrait du partage : le propriétaire retire Bob, Carol quitte le sien', async () => {
  ok(await call(share, { action: 'revoke', id: shareBob }, alice));
  assert.equal((await call(share, { action: 'get', id: shareBob }, bob)).status, 404);
  assert.equal(ok(await call(share, { action: 'inbox' }, bob)).items.length, 0);
  ok(await call(share, { action: 'revoke', id: shareCarol }, carol));
  assert.equal(ok(await call(share, { action: 'out', docId: 'doc-rapport' }, alice)).shares.length, 0);
});
await step('suppression du document : partages et commentaires effacés', async () => {
  const s = ok(await call(share, { action: 'create', docId: 'doc-rapport', email: 'bob@test.fr' }, alice)).id;
  ok(await call(share, { action: 'comment', id: s, text: 'bonjour' }, bob));
  ok(await call(cloud, { action: 'delete', id: 'doc-rapport' }, alice));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM luma_shares')).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM luma_comments')).rows[0].n, 0);
  assert.equal(ok(await call(share, { action: 'inbox' }, bob)).items.length, 0);
});
await step('suppression d’un compte : ses partages, commentaires et notifications disparaissent', async () => {
  await put(alice, 'doc-deux', 'Deux', '<p>2</p>');
  const s = ok(await call(share, { action: 'create', docId: 'doc-deux', email: 'bob@test.fr' }, alice)).id;
  ok(await call(share, { action: 'comment', id: s, text: 'hello' }, bob));
  ok(await call(account, { action: 'delete_account', password: 'motdepasse1' }, bob));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM luma_shares WHERE to_user NOT IN (SELECT id FROM luma_users)")).rows[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM luma_notifs WHERE user_id NOT IN (SELECT id FROM luma_users)")).rows[0].n, 0);
  const th = ok(await call(share, { action: 'comments', docId: 'doc-deux' }, alice));
  assert.equal(th.comments.length, 0, 'les commentaires de Bob sont supprimés avec son compte');
});
await step('les commentaires et notifications sont chiffrés dans la base', async () => {
  await put(alice, 'doc-trois', 'Trois', '<p>3</p>');
  const s = ok(await call(share, { action: 'create', docId: 'doc-trois', email: 'carol@test.fr' }, alice)).id;
  ok(await call(share, { action: 'comment', id: s, text: 'texte secret très confidentiel' }, carol));
  const raw = JSON.stringify((await db.query('SELECT body FROM luma_comments')).rows) + JSON.stringify((await db.query('SELECT body FROM luma_notifs')).rows);
  assert.equal(raw.includes('secret'), false); assert.equal(raw.includes('Trois'), false);
});
console.log(`\n${passed + 1} étapes réussies.`);
process.exit(0);
