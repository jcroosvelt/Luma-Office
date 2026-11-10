// Chargement paresseux de pdf.js (version « legacy » pour les anciens navigateurs mobiles).
let p;
export function loadPdfjs() {
  p ||= (async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    return pdfjs;
  })();
  return p;
}

// Texte brut d'une page (items triés par ligne)
export async function pageText(doc, n) {
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  let out = '', lastY = null;
  for (const it of tc.items) {
    if (!it.str && !it.hasEOL) continue;
    const y = it.transform?.[5];
    if (lastY !== null && y != null && Math.abs(y - lastY) > 3) out += '\n';
    else if (out && !out.endsWith(' ') && !out.endsWith('\n')) out += ' ';
    out += it.str;
    lastY = y ?? lastY;
  }
  return out.replace(/[ \t]+\n/g, '\n').trim();
}

// Texte d'une page structuré en paragraphes (pour la conversion en document modifiable)
export async function pageParagraphs(doc, n) {
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  const lines = [];
  for (const it of tc.items) {
    if (!it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5], hgt = it.height || Math.abs(it.transform[3]) || 10;
    let line = lines.find((l) => Math.abs(l.y - y) < Math.max(2, hgt * 0.3));
    if (!line) lines.push((line = { y, h: hgt, parts: [] }));
    line.parts.push({ x, s: it.str, w: it.width });
  }
  lines.sort((a, b) => b.y - a.y);
  const paras = [];
  let cur = null, prev = null;
  for (const l of lines) {
    l.parts.sort((a, b) => a.x - b.x);
    let text = '', endX = null;
    for (const p of l.parts) { if (endX !== null && p.x - endX > l.h * 0.15 && !text.endsWith(' ')) text += ' '; text += p.s; endX = p.x + (p.w || 0); }
    const gap = prev ? prev.y - l.y : 0;
    if (cur && gap < prev.h * 1.7) cur += (cur.endsWith('-') ? '' : ' ') + text.trim();
    else { if (cur) paras.push(cur); cur = text.trim(); }
    prev = l;
  }
  if (cur) paras.push(cur);
  return paras;
}
