// Passerelle sécurisée vers le service d'IA (fonction serverless Vercel).
// La clé API reste côté serveur (variable d'environnement GEMINI_API_KEY) : elle n'apparaît jamais dans l'application.
//
// Variables d'environnement :
//   GEMINI_API_KEY      (obligatoire) clé créée sur https://aistudio.google.com/apikey
//   GEMINI_MODEL        (facultatif)  modèle imposé ; sans lui, le meilleur modèle disponible est choisi automatiquement
//   AI_ACCESS_CODE      (facultatif)  code d'accès à saisir dans les Paramètres de l'application (protège votre quota)
//   AI_ALLOWED_ORIGINS  (facultatif)  origines autorisées en plus du site lui-même, séparées par des virgules
//   AI_RATE_PER_MIN     (facultatif)  requêtes par minute et par adresse IP (20 par défaut)
//   GEMINI_API_BASE     (facultatif)  adresse de l'API (tests uniquement)
import { timingSafeEqual } from 'node:crypto';

const BASE = () => process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
const DEFAULT_MODEL = () => process.env.GEMINI_MODEL || ''; // vide = choix automatique du meilleur modèle disponible

// Choix automatique du modèle : le plus récent « flash » stable disponible avec la clé (puis flash-lite, puis pro)
const NOT_TEXT = /embed|image|tts|audio|live|robotics|computer|exp|learnlm|gemma|aqa|vision|thinking|customtools|research|banana/i;
function pickBest(names) {
  const fams = { 'flash': [], 'flash-lite': [], 'pro': [] };
  for (const n of names) {
    if (NOT_TEXT.test(n)) continue;
    const m = /^gemini-(\d+(?:\.\d+)?)-(flash-lite|flash|pro)(?:-(.*))?$/.exec(n);
    if (!m) continue;
    const stable = !m[3] || /^(\d{3}|latest)$/.test(m[3]);
    fams[m[2]].push({ n, v: parseFloat(m[1]), stable, plain: !m[3] });
  }
  for (const f of ['flash', 'flash-lite', 'pro']) {
    const list = fams[f].sort((a, b) => (b.stable - a.stable) || (b.v - a.v) || (b.plain - a.plain));
    if (list.length) return list[0].n;
  }
  return null;
}

const MAX_BODY = 600_000; // caractères
let modelCache = { at: 0, best: null };
const dead = new Set(); // modèles refusés (introuvables) : on ne les réessaie pas

async function discover(key) {
  if (modelCache.best && Date.now() - modelCache.at < 10 * 60_000) return modelCache.best;
  try {
    const r = await fetch(`${BASE()}/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
    if (!r.ok) return null;
    const j = await r.json();
    const names = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => String(m.name).replace(/^models\//, '')).filter((n) => !dead.has(n));
    const best = pickBest(names);
    if (best) modelCache = { at: Date.now(), best };
    return best;
  } catch { return null; }
}
const hits = new Map();

const json = (res, status, obj) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
const fail = (res, status, message, code) => json(res, status, { error: { code: code || status, message } });
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // appels du même site, outils en ligne de commande
  let host; try { host = new URL(origin).host; } catch { return false; }
  if (host === req.headers.host) return true;
  return (process.env.AI_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean).some((o) => o === origin);
}
function rateOk(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
  const now = Date.now(), limit = +process.env.AI_RATE_PER_MIN || 20;
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= limit) { hits.set(ip, arr); return false; }
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return true;
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > MAX_BODY) throw new Error('too-big'); }
  return raw ? JSON.parse(raw) : {};
}
const explain = (status, body) => {
  const msg = body?.error?.message || '';
  if (status === 400 && /API key/i.test(msg)) return 'La clé API enregistrée sur le serveur est invalide.';
  if (status === 403) return 'La clé API est refusée (droits insuffisants ou région non prise en charge).';
  if (status === 404) return 'Aucun modèle d’IA disponible avec cette clé : vérifiez la clé dans Google AI Studio.';
  if (status === 429) return 'Quota atteint pour le moment : réessayez dans une minute.';
  if (status >= 500) return 'Le service d’IA est momentanément indisponible. Réessayez.';
  return msg || 'Erreur du service d’IA.';
};

export default async function handler(req, res) {
  if (!originOk(req)) return fail(res, 403, 'Origine non autorisée.');
  const key = process.env.GEMINI_API_KEY;

  if (req.method === 'GET') { // état de la configuration (aucun secret)
    return json(res, 200, { ok: true, configured: !!key, needsCode: !!process.env.AI_ACCESS_CODE, model: DEFAULT_MODEL() || 'auto' });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return fail(res, 405, 'Méthode non autorisée.'); }
  if (!key) return fail(res, 503, 'L’assistant IA n’est pas encore configuré sur ce site (clé API manquante).', 'not-configured');
  const need = process.env.AI_ACCESS_CODE;
  if (need && !safeEq(req.headers['x-access-code'] || '', need)) return fail(res, 401, 'Code d’accès de l’assistant incorrect ou manquant (Paramètres › Assistant IA).', 'bad-code');
  if (!rateOk(req)) return fail(res, 429, 'Trop de demandes en peu de temps : patientez une minute.', 'rate');

  let body;
  try { body = await readBody(req); } catch (e) { return fail(res, e.message === 'too-big' ? 413 : 400, e.message === 'too-big' ? 'Texte trop volumineux.' : 'Requête illisible.'); }
  if (!Array.isArray(body.contents) || !body.contents.length) return fail(res, 400, 'Requête invalide.');
  if (JSON.stringify(body).length > MAX_BODY) return fail(res, 413, 'Texte trop volumineux pour l’assistant : sélectionnez un passage plus court.');
  let model = /^gemini-[a-z0-9.\-]+$/i.test(body.model || '') ? body.model : DEFAULT_MODEL();
  if (!model || dead.has(model)) model = (await discover(key)) || 'gemini-flash-latest';

  const gc = { ...(body.generationConfig || {}) };
  if (gc.temperature === undefined && body.temperature !== undefined) gc.temperature = body.temperature;
  if (gc.maxOutputTokens === undefined && body.maxOutputTokens !== undefined) gc.maxOutputTokens = body.maxOutputTokens;
  // seuls les champs utiles sont transmis (pas d'outils, pas de paramètres arbitraires)
  const payload = {
    contents: body.contents.map((c) => ({ role: c.role === 'model' ? 'model' : 'user', parts: (c.parts || []).map((p) => ({ text: String(p.text ?? '') })) })),
    generationConfig: { temperature: Math.min(2, Math.max(0, Number.isFinite(+gc.temperature) ? +gc.temperature : 0.7)), maxOutputTokens: Math.min(16384, Math.max(64, +gc.maxOutputTokens || 4096)), ...(gc.responseMimeType === 'application/json' ? { responseMimeType: 'application/json' } : {}) },
  };
  if (body.systemInstruction?.parts) payload.systemInstruction = { parts: body.systemInstruction.parts.map((p) => ({ text: String(p.text ?? '') })) };

  const call = (m) => fetch(`${BASE()}/v1beta/models/${encodeURIComponent(m)}:streamGenerateContent?alt=sse`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(payload),
  });
  let upstream;
  try {
    upstream = await call(model);
    if (upstream.status === 404) { // modèle retiré ou inconnu : on prend automatiquement le meilleur modèle disponible
      dead.add(model); modelCache = { at: 0, best: null };
      const alt = await discover(key);
      if (alt && alt !== model) { model = alt; upstream = await call(alt); }
    }
  } catch { return fail(res, 502, 'Impossible de joindre le service d’IA.'); }
  if (!upstream.ok) { let b = null; try { b = await upstream.json(); } catch { /* ignore */ } return fail(res, upstream.status === 400 && !/API key/i.test(b?.error?.message || '') ? 400 : upstream.status, explain(upstream.status, b)); }

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  try { for await (const chunk of upstream.body) res.write(chunk); } catch { /* connexion interrompue */ }
  res.end();
}
