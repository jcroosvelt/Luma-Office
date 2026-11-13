// Assistant IA : réglages, appel en flux (streaming) et gestion des erreurs.
// Deux modes : « serveur » (clé stockée sur Vercel, fonction /api/gemini) ou « ma clé » (appel direct depuis l'appareil).
import { pref } from './storage.js';

export const MODELS = [
  ['gemini-2.5-flash', 'Rapide (recommandé)'],
  ['gemini-2.5-flash-lite', 'Très économique'],
  ['gemini-2.5-pro', 'Plus précis, plus lent'],
  ['custom', 'Autre modèle (saisir le nom)'],
];
const DEF = { enabled: true, mode: 'server', ownKey: '', model: 'gemini-2.5-flash', customModel: '', code: '', consent: false };
export const aiPrefs = {
  get() { return { ...DEF, ...(pref.get('ai', {}) || {}) }; },
  set(patch) { pref.set('ai', { ...aiPrefs.get(), ...patch }); },
};
export const modelName = () => { const p = aiPrefs.get(); return p.model === 'custom' ? (p.customModel.trim() || DEF.model) : p.model; };

export class AiError extends Error { constructor(message, code) { super(message); this.code = code; } }

const apiUrl = () => new URL('api/gemini', document.baseURI).href;
const DIRECT = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

function describeHttp(status, body) {
  const msg = body?.error?.message || '';
  if (body?.error?.code === 'not-configured' || status === 503) return new AiError(msg || 'L’assistant IA n’est pas encore configuré sur ce site. Suivez le guide (Paramètres › Assistant IA).', 'not-configured');
  if (status === 401) return new AiError(msg || 'Code d’accès incorrect.', 'bad-code');
  if (status === 404 && !msg) return new AiError('L’assistant n’est pas disponible ici : la fonction serveur /api/gemini est introuvable (elle n’existe que sur le site déployé sur Vercel). Vous pouvez utiliser « Ma propre clé » dans les Paramètres.', 'no-api');
  if (status === 400 && /API key/i.test(msg)) return new AiError('Clé API invalide : vérifiez-la dans les Paramètres.', 'bad-key');
  if (status === 403) return new AiError(msg || 'Accès refusé par le service d’IA (clé sans droit ou région non prise en charge).', 'forbidden');
  if (status === 429) return new AiError(msg || 'Quota de l’assistant atteint : réessayez dans une minute.', 'quota');
  if (status === 413) return new AiError(msg || 'Texte trop volumineux : sélectionnez un passage plus court.', 'too-big');
  return new AiError(msg || `Erreur du service (${status}).`, 'http');
}

// Génère la réponse en flux : appelle onText(delta) à chaque morceau et renvoie le texte complet.
export async function generate({ system, messages, signal, temperature = 0.7, maxTokens = 4096, onText }) {
  const p = aiPrefs.get(), model = modelName();
  const body = {
    contents: messages.map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] })),
    generationConfig: { temperature, maxOutputTokens: maxTokens },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
  };
  let res;
  try {
    if (p.mode === 'own' && p.ownKey.trim()) {
      res = await fetch(DIRECT(model), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.ownKey.trim() }, body: JSON.stringify(body), signal });
    } else {
      res = await fetch(apiUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json', ...(p.code ? { 'x-access-code': p.code } : {}) }, body: JSON.stringify({ ...body, model }), signal });
    }
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new AiError(navigator.onLine ? 'Impossible de joindre l’assistant. Réessayez.' : 'Vous êtes hors ligne : l’assistant IA nécessite une connexion Internet.', 'network');
  }
  if (!res.ok) { let b = null; try { b = await res.json(); } catch { /* ignore */ } throw describeHttp(res.status, b); }
  const ct = res.headers.get('content-type') || '';
  if (!/event-stream/.test(ct)) { // réponse HTML (ex. site sans fonction serveur) : pas une réponse de l’assistant
    throw new AiError('L’assistant n’est pas disponible ici : la fonction serveur /api/gemini est introuvable. Utilisez « Ma propre clé » dans les Paramètres ou déployez sur Vercel.', 'no-api');
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', full = '', blocked = '';
  const handle = (line) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim(); if (!data || data === '[DONE]') return;
    let j; try { j = JSON.parse(data); } catch { return; }
    if (j.promptFeedback?.blockReason) blocked = j.promptFeedback.blockReason;
    const parts = j.candidates?.[0]?.content?.parts || [];
    for (const part of parts) if (part.text) { full += part.text; onText?.(part.text, full); }
    const fr = j.candidates?.[0]?.finishReason;
    if (fr && fr !== 'STOP' && fr !== 'MAX_TOKENS' && !full) blocked = fr;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.search(/\r?\n\r?\n/)) >= 0) { const evt = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, ''); evt.split(/\r?\n/).forEach(handle); }
  }
  buf.split(/\r?\n/).forEach(handle);
  if (!full && blocked) throw new AiError('L’assistant a refusé de traiter ce contenu (' + blocked.toLowerCase() + '). Reformulez ou changez le texte.', 'blocked');
  if (!full) throw new AiError('Réponse vide de l’assistant. Réessayez.', 'empty');
  return full;
}

// Vérifie la configuration : renvoie { ok, message }
export async function testConnection() {
  const p = aiPrefs.get();
  try {
    if (p.mode !== 'own') {
      let st = null;
      try { const r = await fetch(apiUrl(), { headers: p.code ? { 'x-access-code': p.code } : {} }); if (r.ok && /json/.test(r.headers.get('content-type') || '')) st = await r.json(); } catch { /* ignore */ }
      if (!st) return { ok: false, message: 'Fonction serveur /api/gemini introuvable : le site doit être déployé sur Vercel avec le dossier api/ (ou choisissez « Ma propre clé »).' };
      if (!st.configured) return { ok: false, message: 'Le serveur répond mais la clé de l’assistant n’est pas définie côté serveur (voir le guide d’installation).' };
    } else if (!p.ownKey.trim()) return { ok: false, message: 'Collez d’abord votre clé API.' };
    const t = await generate({ messages: [{ role: 'user', text: 'Réponds uniquement par le mot : OK' }], maxTokens: 20, temperature: 0 });
    return { ok: true, message: `Connexion réussie ✓ (${modelName()}) — réponse : « ${t.trim().slice(0, 30)} »` };
  } catch (e) { return { ok: false, message: e.message || 'Échec du test.' }; }
}

// Mini convertisseur Markdown → HTML (titres, listes, gras, italique) pour insérer les réponses dans un document
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
export function mdToHtml(md) {
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const l = raw.trimEnd();
    let m;
    if (!l.trim()) { close(); continue; }
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) { close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li><p>${inline(m[1])}</p></li>`); }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li><p>${inline(m[1])}</p></li>`); }
    else { close(); out.push(`<p>${inline(l.trim())}</p>`); }
  }
  close();
  return out.join('');
}
