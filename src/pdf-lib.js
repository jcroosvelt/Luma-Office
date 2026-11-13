import polyUrl from './pdf-polyfills.js?url';

// Chargement paresseux de pdf.js (version « legacy » pour les anciens navigateurs mobiles).
// Deux modes : worker enveloppé (avec compléments pour vieux navigateurs), puis worker standard en secours.
let p, pdfjsRef, workerUrlRef;
export function loadPdfjs() {
  p ||= (async () => {
    await import('./pdf-polyfills.js');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    pdfjsRef = pdfjs; workerUrlRef = worker;
    return pdfjs;
  })();
  p.catch(() => { p = null; });
  return p;
}

// mode 'wrapped' : worker créé par nos soins (compléments chargés avant le worker) ; 'plain' : mécanisme standard de pdf.js
export function useWorkerMode(mode) {
  const g = pdfjsRef.GlobalWorkerOptions;
  g.workerPort = null;
  let failed = new Promise(() => {});
  if (mode === 'wrapped') {
    try {
      const abs = (u) => new URL(u, location.href).href;
      const blobUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(abs(polyUrl))};\nimport ${JSON.stringify(abs(workerUrlRef))};`], { type: 'text/javascript' }));
      const w = new Worker(blobUrl, { type: 'module' });
      failed = new Promise((_, rej) => { w.addEventListener('error', (e) => rej(new Error('Le moteur PDF n’a pas pu démarrer' + (e.message ? ' : ' + e.message : '')))); });
      g.workerPort = w;
    } catch { /* repli sur le mode standard */ }
  }
  return failed;
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

// Texte d'une page structuré pour la lecture sur petit écran : titres, paragraphes, vers (retours à la ligne conservés), césures recollées.
export async function pageBlocks(doc, n) {
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  const lines = [];
  let cur = null;
  const flush = () => { if (cur && cur.s.trim()) lines.push(cur); cur = null; };
  for (const it of tc.items) {
    if (!it.str && !it.hasEOL) continue;
    const x = it.transform[4], y = it.transform[5], hh = Math.abs(it.transform[3]) || it.height || 10;
    if (it.str) {
      if (cur && Math.abs(y - cur.y) < hh * 0.5 && x >= cur.endX - hh) {
        const gap = x - cur.endX;
        cur.s += (gap > hh * 0.15 && !cur.s.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str;
        cur.endX = x + (it.width || 0); cur.h = Math.max(cur.h, hh);
      } else { flush(); cur = { s: it.str, x, y, endX: x + (it.width || 0), h: hh }; }
    }
    if (it.hasEOL) flush();
  }
  flush();
  if (!lines.length) return [];
  const sorted = (a) => [...a].sort((p, q) => p - q);
  const hs = sorted(lines.map((l) => l.h)), body = hs[Math.floor(hs.length / 2)];
  const ws = sorted(lines.map((l) => l.endX - l.x)), maxW = ws[Math.floor(ws.length * 0.9)] || 1;
  const out = [];
  let para = null, prev = null;
  const push = () => { if (para) out.push(para); para = null; };
  for (const l of lines) {
    const text = l.s.replace(/\s+/g, ' ').trim();
    const isHead = l.h >= body * 1.25 && text.length < 140;
    const bullet = /^[•·▪●○◦‣\-–—]\s+/.test(text);
    if (isHead) { push(); out.push({ k: 'h', t: text }); prev = null; continue; }
    const gap = prev ? prev.y - l.y : 0;
    const cont = prev && !bullet && gap > 0 && gap < prev.h * 1.9 && Math.abs(l.x - prev.x) < prev.h * 4 && !prev.head;
    if (cont && para) {
      const prevShort = (prev.endX - prev.x) < maxW * 0.7;
      if (para.t.endsWith('-') && !prevShort && /^[a-zà-ÿ]/.test(text)) para.t = para.t.slice(0, -1) + text;
      else para.t += (prevShort ? '\n' : ' ') + text;
    } else { push(); para = { k: 'p', t: text }; }
    prev = l;
  }
  push();
  return out;
}
