// Statistiques d'usage ANONYMES (visites, ouvertures de l'application, téléchargements de l'APK). Aucune donnée personnelle :
// ni adresse IP, ni identifiant, ni contenu de document. Désactivable dans Paramètres › Statistiques anonymes.
import { logEvent } from './_db.js';

const hits = new Map();
const ALLOWED = new Set(['visit', 'app_open', 'apk_download', 'install_open']);
const rateOk = (req) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 30) { hits.set(ip, arr); return false; }
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return true;
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== 'object') body = {};
  if (!ALLOWED.has(body.e) || !rateOk(req)) { res.statusCode = 204; return res.end(); }
  const data = {};
  if (typeof body.p === 'string') data.p = body.p.slice(0, 16);   // plateforme : web | android-web | app | ios | desktop
  if (typeof body.v === 'string') data.v = body.v.slice(0, 16);   // version de l'application
  await logEvent(body.e, data);
  res.statusCode = 204;
  res.end();
}
