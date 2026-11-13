// Reconnaissance de texte (OCR) hors ligne avec Tesseract (français), moteur et langue hébergés avec l'application.
import { h, icon, sheet, toast } from './ui.js';

let workerP = null, progressCb = null;
const base = () => new URL('ocr/', document.baseURI).href;
const simd = () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch { return false; } };

export async function getWorker() {
  workerP ||= (async () => {
    const { createWorker } = await import('tesseract.js');
    return createWorker('fra', 1, {
      workerPath: base() + 'worker.min.js',
      corePath: base() + (simd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'),
      langPath: base(), gzip: true, workerBlobURL: false,
      logger: (m) => progressCb?.(m),
    });
  })();
  workerP.catch(() => { workerP = null; });
  return workerP;
}

// Prépare l'image : taille raisonnable, niveaux de gris, contraste étiré (meilleure lecture des photos)
export async function prepareImage(src) {
  let bmp;
  if (src instanceof HTMLCanvasElement) bmp = src;
  else { try { bmp = await createImageBitmap(src, { imageOrientation: 'from-image' }); } catch { bmp = await createImageBitmap(src); } }
  const W = bmp.width, H = bmp.height, k = Math.min(1.6, 2600 / Math.max(W, H));
  const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
  const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data; let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) { const y = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = d[i + 1] = d[i + 2] = y; if (y < lo) lo = y; if (y > hi) hi = y; }
  const span = Math.max(40, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)); d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(im, 0, 0);
  return c;
}

export async function recognize(sources, onProgress) {
  const worker = await getWorker();
  const out = [];
  for (let i = 0; i < sources.length; i++) {
    progressCb = (m) => { if (m.status === 'recognizing text') onProgress?.(i, sources.length, m.progress || 0); };
    onProgress?.(i, sources.length, 0);
    const canvas = await prepareImage(sources[i]);
    const { data } = await worker.recognize(canvas);
    out.push((data.text || '').trim());
  }
  progressCb = null;
  return out;
}

// Texte brut → paragraphes (lignes recollées, césures retirées)
export function textToParagraphs(text) {
  return text.replace(/\r/g, '').split(/\n{2,}/).map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).reduce((a, l) => (a.endsWith('-') && /^[a-zà-ÿ]/.test(l) ? a.slice(0, -1) + l : a ? a + ' ' + l : l), '')).filter(Boolean);
}
export const paragraphsToHtml = (paras) => paras.map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('');

// Feuille de saisie : photos / images → texte ; onResult(text) reçoit tout le texte reconnu
export function openOcr({ title = 'Photo → texte (OCR)', cta = 'Reconnaître le texte', onResult }) {
  const items = [];
  const list = h('div', { class: 'ptlist' });
  const draw = () => list.replaceChildren(...items.map((it, i) => h('div', { class: 'ptrow' }, h('div', { class: 'ptitem' }, h('img', { src: it.url, class: 'ptthumb', alt: '' }), h('small', {}, `Page ${i + 1}`)), h('button', { class: 'icon-btn', 'aria-label': 'Retirer', onclick: () => { items.splice(i, 1); draw(); } }, icon('close', 18)))));
  const add = (files) => { for (const f of files) items.push({ file: f, url: URL.createObjectURL(f) }); draw(); };
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: () => { add([...cam.files]); cam.value = ''; } });
  const pick = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: () => { add([...pick.files]); pick.value = ''; } });
  const status = h('p', { class: 'muted' }, '');
  let s, busy = false;
  const go = async () => {
    if (busy) return; if (!items.length) { toast('Ajoutez au moins une photo'); return; }
    busy = true; status.textContent = 'Chargement du moteur de lecture…';
    try {
      const texts = await recognize(items.map((i) => i.file), (i, n, p) => { status.textContent = `Lecture de la page ${i + 1} / ${n}… ${Math.round(p * 100)} %`; });
      const all = texts.filter(Boolean).join('\n\n');
      items.forEach((i) => URL.revokeObjectURL(i.url));
      if (!all.trim()) { status.textContent = 'Aucun texte reconnu : rapprochez-vous, éclairez bien la page et évitez les reflets.'; busy = false; return; }
      s.close(); await onResult(all);
    } catch (e) { console.error(e); status.textContent = 'La reconnaissance a échoué (' + (e?.message || 'erreur') + ').'; busy = false; }
  };
  s = sheet(title, h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'Photographiez une page ou choisissez des images : le texte est lu sur l’appareil (rien n’est envoyé sur Internet) et devient modifiable. Pour un meilleur résultat : page bien éclairée, droite, sans reflet.'),
    h('div', { class: 'vact' }, h('button', { class: 'btn', onclick: () => cam.click() }, icon('camera', 18), 'Prendre une photo'), h('button', { class: 'btn', onclick: () => pick.click() }, icon('image', 18), 'Choisir des images')),
    list, status, h('button', { class: 'btn primary', onclick: go }, icon('scan', 18), cta), cam, pick), { wide: true });
}
