// Traduit les textes extraits (tools/i18n/*-fr.json) vers l'anglais et l'espagnol avec Judy (API Gemini du site), par lots, avec reprise.
// Usage : node tools/i18n-translate.mjs <site|app> <en|es>   → écrit tools/i18n/<site|app>-<lang>.json  { "texte français": "traduction" }
import fs from 'node:fs';
const [kind, lang] = process.argv.slice(2);
const API = process.env.GEMINI_URL || 'https://lumaoffice.vercel.app/api/gemini';
const src = JSON.parse(fs.readFileSync(`tools/i18n/${kind}-fr.json`, 'utf8'));
const outFile = `tools/i18n/${kind}-${lang}.json`;
const done = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const NAME = { en: 'English', es: 'Spanish (neutral, international Spanish)' }[lang];
const ph = (s) => (s.match(/\{\}/g) || []).length;
const todo = src.filter((s) => !(s in done));
const BATCH = 40;
async function ask(items) {
  const prompt = `Translate these French user-interface strings of a word processor / PDF reader app (Luma Office) into ${NAME}.
Rules: keep every "{}" placeholder exactly as is (same count, same order); keep punctuation, quotes « », ellipses, line breaks and emoji; keep brand and product names unchanged (Luma Office, Judy, Word, Excel, PowerPoint, PDF, Gemini, Google, WhatsApp, Drive, Wi-Fi, OCR); use short, natural UI wording (buttons are imperative verbs); do not add explanations.
Return ONLY a JSON array of strings, same length and same order as the input.
Input:
${JSON.stringify(items)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://lumaoffice.vercel.app' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json' } }) });
      if (r.status === 429) { await new Promise((x) => setTimeout(x, 30000)); continue; }
      if (!r.ok) { await new Promise((x) => setTimeout(x, 5000)); continue; }
      let text = ''; for (const line of (await r.text()).split(/\r?\n/)) if (line.startsWith('data:')) { try { text += (JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''); } catch { /* ignore */ } }
      const arr = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim());
      if (Array.isArray(arr) && arr.length === items.length) return arr;
    } catch { await new Promise((x) => setTimeout(x, 3000)); }
  }
  return null;
}
let n = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const items = todo.slice(i, i + BATCH);
  let arr = await ask(items);
  if (!arr) { arr = []; for (const it of items) arr.push((await ask([it]))?.[0] ?? null); } // lot refusé : un par un
  items.forEach((it, k) => {
    const tr = arr[k];
    if (typeof tr === 'string' && tr.trim() && ph(tr) === ph(it)) done[it] = tr; // placeholders conservés
    else done[it] = null; // à garder en français
  });
  n += items.length;
  fs.writeFileSync(outFile, JSON.stringify(done, null, 0));
  console.log(`${kind}/${lang} : ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  await new Promise((x) => setTimeout(x, 3500));
}
const ok = Object.values(done).filter(Boolean).length;
console.log(`terminé : ${ok} traductions, ${Object.keys(done).length - ok} ignorées`);
