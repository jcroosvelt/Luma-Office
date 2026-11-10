// Recherche plein texte (sans accents ni casse) dans les documents de Luma.
export const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const terms = (q) => norm(q).split(/\s+/).filter(Boolean);

export function jsonText(node, out = []) {
  if (!node) return '';
  if (node.type === 'text') out.push(node.text);
  else if (node.type === 'hardBreak') out.push(' ');
  else if (node.type === 'tableOfContents') { /* ignoré */ }
  else if (node.content) { node.content.forEach((c) => jsonText(c, out)); if (['paragraph', 'heading', 'listItem', 'tableCell', 'tableHeader', 'blockquote', 'codeBlock'].includes(node.type)) out.push('\n'); }
  return out.join('').replace(/[ \t]+/g, ' ');
}
export const docText = (rec) => rec.text ?? (rec.json ? jsonText(rec.json) : '');

// Alignement des indices : on normalise caractère par caractère
function alignedNorm(text) { let s = ''; for (let i = 0; i < text.length; i++) s += norm(text[i]) || text[i]; return s; }

export function makeSnippet(text, ts, radius = 55) {
  if (!text || !ts.length) return null;
  const n = alignedNorm(text);
  let best = -1;
  for (const t of ts) { const i = n.indexOf(t); if (i >= 0 && (best < 0 || i < best)) best = i; }
  if (best < 0) return null;
  const a = Math.max(0, best - radius), b = Math.min(text.length, best + radius + 20);
  const frag = text.slice(a, b);
  const nf = n.slice(a, b);
  const marks = [];
  for (const t of ts) { let i = 0; while ((i = nf.indexOf(t, i)) >= 0) { marks.push([i, i + t.length]); i += t.length; } }
  marks.sort((x, y) => x[0] - y[0]);
  const parts = [];
  let pos = 0;
  for (const [s, e] of marks) { if (s < pos) continue; if (s > pos) parts.push(frag.slice(pos, s)); parts.push({ mark: frag.slice(s, e) }); pos = e; }
  if (pos < frag.length) parts.push(frag.slice(pos));
  return { before: a > 0, after: b < text.length, parts: parts.map((p) => (typeof p === 'string' ? p.replace(/\s+/g, ' ') : p)) };
}

export const matchesAll = (haystackNorm, ts) => ts.every((t) => haystackNorm.includes(t));

// Résultats triés : titre d'abord, puis nombre d'occurrences dans le contenu
export function searchLibrary(docs, query) {
  const ts = terms(query);
  if (!ts.length) return docs.map((doc) => ({ doc, snippet: null }));
  const out = [];
  for (const doc of docs) {
    const title = norm(doc.title);
    const text = docText(doc);
    const body = norm(text);
    const inTitle = matchesAll(title, ts);
    const inBody = matchesAll(body, ts) || matchesAll(title + ' ' + body, ts);
    if (!inTitle && !inBody) continue;
    let score = inTitle ? 100 : 0;
    for (const t of ts) { let i = 0, c = 0; while ((i = body.indexOf(t, i)) >= 0 && c < 50) { c++; i += t.length; } score += c; }
    out.push({ doc, score, snippet: makeSnippet(text, ts) });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function snippetEl(h, sn) {
  if (!sn) return null;
  return h('span', { class: 'snip' }, sn.before ? '… ' : '', ...sn.parts.map((p) => (typeof p === 'string' ? p : h('mark', {}, p.mark))), sn.after ? ' …' : '');
}
