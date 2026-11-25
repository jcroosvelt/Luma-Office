// Tests de sécurité : migration de la clé maître (AUTH_SECRET), limiteur de débit partagé, connexion sans révéler l'existence d'un compte.
// Lancer : node tests/security.test.mjs
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
globalThis.__LUMA_SQL = async (strings, ...vals) => {
  const q = strings.reduce((a, s, i) => a + s + (i < vals.length ? `$${i + 1}` : ''), '');
  return (await db.query(q, vals)).rows;
};
let passed = 0;
const step = async (n, f) => { await f(); passed++; console.log('  ✓', n); };

// 1) Avant : pas d'AUTH_SECRET, clé dérivée de DATABASE_URL (situation actuelle de la production)
delete process.env.AUTH_SECRET;
process.env.DATABASE_URL = 'postgres://user:motdepasse@hote.exemple/base';
const auth = await import('../api/_auth.js');
const account = (await import('../api/account.js')).default;
const call = (handler, body, token, ip = '9.9.9.9') => new Promise((resolve) => {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { resolve({ status: this.statusCode, headers: this.headers, body: s ? JSON.parse(s) : null }); } };
  handler({ method: 'POST', body, headers: { host: 'x', 'x-forwarded-for': ip, ...(token ? { authorization: 'Bearer ' + token } : {}) } }, res);
});

let oldWrapped, oldToken;
await step('compte créé sans AUTH_SECRET (ancienne configuration)', async () => {
  const r = await call(account, { action: 'signup', email: 'a@test.fr', password: 'motdepasse1', name: 'A' });
  assert.equal(r.status, 200);
  oldToken = r.body.token;
  oldWrapped = auth.newDek();
  assert.equal(auth.decrypt(oldWrapped, auth.encrypt(oldWrapped, 'secret')), 'secret');
});
await step('après ajout d’AUTH_SECRET : anciennes clés et sessions encore valides', async () => {
  process.env.AUTH_SECRET = 'x'.repeat(8) + 'Aleatoire-Tres-Long-32-caracteres!';
  assert.equal(auth.decrypt(oldWrapped, auth.encrypt(oldWrapped, 'ok')), 'ok');
  assert.ok(auth.readToken(oldToken), 'ancienne session lisible');
  const r = await call(account, { action: 'me' }, oldToken);
  assert.equal(r.status, 200);
});
await step('nouveaux comptes : chiffrés avec AUTH_SECRET (illisibles sans lui)', async () => {
  const w = auth.newDek();
  const ct = auth.encrypt(w, 'nouveau');
  assert.equal(auth.decrypt(w, ct), 'nouveau');
  const secret = process.env.AUTH_SECRET;
  delete process.env.AUTH_SECRET;
  assert.throws(() => auth.decrypt(w, ct));
  process.env.AUTH_SECRET = secret;
});
await step('production sans aucune clé : le serveur refuse (pas de clé « dev-only »)', async () => {
  const s = { a: process.env.AUTH_SECRET, d: process.env.DATABASE_URL, e: process.env.VERCEL_ENV };
  delete process.env.AUTH_SECRET; delete process.env.DATABASE_URL; process.env.VERCEL_ENV = 'production';
  assert.throws(() => auth.newDek(), /AUTH_SECRET manquant/);
  process.env.AUTH_SECRET = s.a; process.env.DATABASE_URL = s.d; if (s.e === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = s.e;
});
await step('connexion : même réponse pour un compte inexistant et un mauvais mot de passe', async () => {
  const a = await call(account, { action: 'login', email: 'a@test.fr', password: 'faux-mot-de-passe' }, null, '8.8.8.1');
  const b = await call(account, { action: 'login', email: 'inconnu@test.fr', password: 'faux-mot-de-passe' }, null, '8.8.8.2');
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.deepEqual(a.body, b.body);
});
await step('limiteur partagé en base : bloque au-delà du maximum, par clé', async () => {
  const { rateLimit } = await import('../api/_db.js');
  const sql = globalThis.__LUMA_SQL;
  for (let i = 0; i < 3; i++) assert.equal(await rateLimit(sql, 'k1', 3, 60_000), true);
  assert.equal(await rateLimit(sql, 'k1', 3, 60_000), false);
  assert.equal(await rateLimit(sql, 'k2', 3, 60_000), true);
});
await step('brute force de connexion : bloqué en base même si la mémoire de l’instance est vierge', async () => {
  let last;
  for (let i = 0; i < 14; i++) last = await call(account, { action: 'login', email: 'cible@test.fr', password: 'x' + i }, null, '7.7.7.' + i);
  assert.equal(last.status, 429);
});
await step('en-tête nosniff sur les réponses JSON', async () => {
  const r = await call(account, { action: 'login', email: 'a@test.fr', password: 'x' }, null, '6.6.6.6');
  assert.equal(r.headers['X-Content-Type-Options'], 'nosniff');
});
console.log(`${passed} étapes réussies.`);
