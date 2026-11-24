// Serveur d'API local pour les tests d'interface : exécute les fonctions de api/ sur une base PGlite en mémoire.
// Lancer : node tests/dev-api.mjs [port]   (puis servir le site avec « vite » et rediriger /api vers ce port)
import http from 'node:http';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
globalThis.__LUMA_SQL = async (strings, ...vals) => {
  const q = strings.reduce((a, s, i) => a + s + (i < vals.length ? `$${i + 1}` : ''), '');
  return (await db.query(q, vals)).rows;
};
process.env.ADMIN_CODE ||= 'code-admin-1234';
process.env.AUTH_SECRET ||= 'dev-secret-dev-secret-dev-secret-1234';
const handlers = {
  account: (await import('../api/account.js')).default,
  cloud: (await import('../api/cloud.js')).default,
  share: (await import('../api/share.js')).default,
  admin: (await import('../api/admin.js')).default,
  apk: (await import('../api/apk.js')).default,
};
const port = Number(process.argv[2]) || 5300;
http
  .createServer(async (req, res) => {
    const name = (req.url || '').replace(/^\/api\//, '').split('?')[0];
    const handler = handlers[name];
    if (!handler) {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
    let raw = '';
    for await (const c of req) raw += c;
    req.body = raw ? JSON.parse(raw) : undefined;
    req.headers['x-forwarded-for'] = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    await handler(req, res);
  })
  .listen(port, '127.0.0.1', () => console.log('API locale sur', port));
