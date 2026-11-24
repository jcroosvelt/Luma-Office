// Téléchargement de l'application Android : /luma-office.apk et /apk-info.json (réécrits vers cette fonction, voir vercel.json).
// Le fichier est stocké en base de données (téléversé depuis l'administration) et envoyé en flux, avec reprise (Range).
import { getSql, initApk } from './_db.js';

const num = (v) => Number(v) || 0;
const text = (res, status, msg) => { res.statusCode = status; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(msg); };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return text(res, 405, 'Méthode non autorisée.'); }
  const sql = await getSql();
  let row = null;
  if (sql) { try { await initApk(sql); row = (await sql`SELECT id, version, size, sha256, chunks, chunk_size, created FROM luma_apk WHERE complete = true ORDER BY created DESC LIMIT 1`)[0] || null; } catch { return text(res, 503, 'Base de données indisponible.'); } }
  const url = String(req.url || '');
  if (/info/.test(url.split('?')[1] || '')) {
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify(row ? { version: row.version, size: num(row.size), sha256: row.sha256, updated: num(row.created) } : { version: null }));
  }
  if (!row) return text(res, 404, 'Aucun fichier APK n’est publié pour le moment.');
  const size = num(row.size), cs = row.chunk_size;
  let start = 0, end = size - 1, status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (m && (m[1] || m[2])) {
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])); } else { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); }
    if (start > end || start >= size) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${size}`); return res.end(); }
    status = 206;
  }
  const h = {
    'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': 'attachment; filename="luma-office.apk"',
    'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', ETag: `"${row.sha256}"`, 'X-Apk-Version': row.version,
    ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  };
  res.writeHead(status, h);
  if (req.method === 'HEAD') return res.end();
  try {
    for (let n = Math.floor(start / cs); n <= Math.floor(end / cs); n++) {
      const c = (await sql`SELECT data FROM luma_apk_chunks WHERE apk_id = ${row.id} AND n = ${n}`)[0];
      if (!c) throw new Error('chunk-missing');
      const buf = Buffer.from(c.data, 'base64'), from = n * cs;
      const piece = buf.subarray(Math.max(0, start - from), Math.min(buf.length, end - from + 1));
      if (!res.write(piece)) await new Promise((r) => res.once('drain', r));
    }
  } catch { /* connexion coupée ou morceau manquant : le client reprendra (Range) */ }
  res.end();
}
