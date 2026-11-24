// Test du stockage de l'APK en base : téléversement par morceaux, contrôle d'intégrité, remplacement, téléchargement (Range).
// Lancer : node tests/apk.test.mjs
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
globalThis.__LUMA_SQL = async (strings, ...vals) => {
  const q = strings.reduce((a, s, i) => a + s + (i < vals.length ? `$${i + 1}` : ''), '');
  return (await db.query(q, vals)).rows;
};
process.env.ADMIN_CODE = 'code-admin-1234';
const admin = (await import('../api/admin.js')).default;
const apk = (await import('../api/apk.js')).default;

function mkRes(done) {
  const r = new EventEmitter();
  r.statusCode = 200;
  r.headers = {};
  r.chunks = [];
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.writeHead = (s, h) => { r.statusCode = s; Object.assign(r.headers, h); };
  r.write = (b) => { r.chunks.push(Buffer.from(b)); return true; };
  r.end = (s) => { if (s) r.chunks.push(Buffer.from(s)); done({ status: r.statusCode, headers: r.headers, body: Buffer.concat(r.chunks) }); };
  return r;
}
const run = (handler, req) => new Promise((resolve) => {
  handler({ method: 'POST', ...req, headers: { host: 'x', 'x-forwarded-for': '1.2.3.4', ...(req.headers || {}) } }, mkRes(resolve));
});
const adm = async (action, body, token) => {
  const r = await run(admin, { body: { action, ...body }, headers: token ? { authorization: 'Bearer ' + token } : {} });
  return { status: r.status, body: JSON.parse(r.body.toString()) };
};
let passed = 0;
const step = async (n, f) => { await f(); passed++; console.log('  ✓', n); };

const token = (await adm('login', { code: 'code-admin-1234' })).body.token;
const CS = 200_000;
const mkApk = (n) => Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), randomBytes(n - 4)]);
async function upload(file, version, { corrupt = false } = {}) {
  const sha = createHash('sha256').update(file).digest('hex');
  const b = await adm('apk_begin', { version, size: file.length, chunkSize: CS, sha256: sha }, token);
  if (b.status !== 200) return b;
  for (let n = 0; n < b.body.chunks; n++) {
    let part = file.subarray(n * CS, (n + 1) * CS);
    if (corrupt && n === 1) { part = Buffer.from(part); part[5] ^= 1; }
    const r = await adm('apk_chunk', { id: b.body.id, n, data: part.toString('base64') }, token);
    if (r.status !== 200) return r;
  }
  return adm('apk_finish', { id: b.body.id }, token);
}

await step('aucun APK au départ', async () => {
  assert.equal((await adm('apk_info', {}, token)).body.file, false);
  assert.equal((await run(apk, { url: '/api/apk', method: 'GET' })).status, 404);
  assert.equal(JSON.parse((await run(apk, { url: '/api/apk?info=1', method: 'GET' })).body).version, null);
});
const A = mkApk(1_050_000);
await step('téléversement refusé sans session administrateur', async () => {
  assert.equal((await adm('apk_begin', { version: '1.0.0', size: 5000, chunkSize: CS, sha256: 'a'.repeat(64) })).status, 401);
});
await step('téléversement et publication', async () => {
  const r = await upload(A, '1.50.0');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.version, '1.50.0');
});
await step('téléchargement identique, en-têtes APK', async () => {
  const r = await run(apk, { url: '/luma-office.apk', method: 'GET' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['Content-Type'], 'application/vnd.android.package-archive');
  assert.equal(r.headers['Content-Length'], String(A.length));
  assert.ok(r.body.equals(A));
  const hd = await run(apk, { url: '/luma-office.apk', method: 'HEAD' });
  assert.equal(hd.body.length, 0);
  assert.equal(hd.headers['Content-Length'], String(A.length));
});
await step('info de version', async () => {
  const j = JSON.parse((await run(apk, { url: '/api/apk?info=1', method: 'GET' })).body);
  assert.equal(j.version, '1.50.0');
  assert.equal(j.size, A.length);
});
await step('reprise (Range) à cheval sur deux morceaux', async () => {
  const r = await run(apk, { url: '/luma-office.apk', method: 'GET', headers: { range: 'bytes=150000-450000' } });
  assert.equal(r.status, 206);
  assert.equal(r.headers['Content-Range'], `bytes 150000-450000/${A.length}`);
  assert.ok(r.body.equals(A.subarray(150000, 450001)));
  const t = await run(apk, { url: '/luma-office.apk', method: 'GET', headers: { range: 'bytes=-1000' } });
  assert.ok(t.body.equals(A.subarray(A.length - 1000)));
  assert.equal((await run(apk, { url: '/luma-office.apk', method: 'GET', headers: { range: 'bytes=99999999-' } })).status, 416);
});
await step('fichier corrompu refusé, ancienne version intacte', async () => {
  const r = await upload(mkApk(700_000), '1.51.0', { corrupt: true });
  assert.equal(r.status, 400);
  assert.match(r.body.error.message, /corrompu/);
  assert.equal((await adm('apk_info', {}, token)).body.version, '1.50.0');
});
await step('fichier qui n’est pas un APK refusé', async () => {
  const r = await upload(Buffer.alloc(300_000, 7), '1.52.0');
  assert.notEqual(r.status, 200);
});
const B = mkApk(500_000);
await step('nouvelle version : remplace l’ancienne (une seule en base)', async () => {
  const r = await upload(B, '1.53.0');
  assert.equal(r.status, 200);
  assert.ok((await run(apk, { url: '/luma-office.apk', method: 'GET' })).body.equals(B));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM luma_apk WHERE complete = true')).rows[0].n, 1);
  const chunks = (await db.query('SELECT count(*)::int AS n FROM luma_apk_chunks WHERE apk_id = (SELECT id FROM luma_apk WHERE complete = true)')).rows[0].n;
  assert.equal(chunks, Math.ceil(B.length / CS));
});
await step('suppression', async () => {
  await adm('apk_delete', {}, token);
  assert.equal((await run(apk, { url: '/luma-office.apk', method: 'GET' })).status, 404);
});
console.log(`${passed} étapes réussies.`);
