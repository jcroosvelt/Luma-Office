// Outils PDF professionnels : scanner / images → PDF, fusion, réorganisation, extraction, filigrane et numérotation (pdf-lib).
import { h, icon, sheet, toast, safeName } from './ui.js';
import { putDoc, newId, listDocs } from './storage.js';

const lib = () => import('pdf-lib');
const readBytes = async (b) => new Uint8Array(await b.arrayBuffer());

/* ---------- construction ---------- */
export async function imagesToPdf(files, onProgress) {
  const { PDFDocument } = await lib();
  const pdf = await PDFDocument.create();
  let n = 0;
  for (const f of files) {
    let bmp;
    try { bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }); }
    catch { bmp = await createImageBitmap(f); }
    const max = 2200, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
    const jpg = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    const img = await pdf.embedJpg(await readBytes(jpg));
    const land = c.width > c.height, W = land ? 842 : 595, H = land ? 595 : 842;
    const s = Math.min(W / c.width, H / c.height), w = c.width * s, hh = c.height * s;
    const page = pdf.addPage([W, H]);
    page.drawImage(img, { x: (W - w) / 2, y: (H - hh) / 2, width: w, height: hh });
    onProgress?.(++n, files.length);
  }
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

export async function mergePdfs(blobs) {
  const { PDFDocument } = await lib();
  const out = await PDFDocument.create();
  for (const b of blobs) {
    const src = await PDFDocument.load(await readBytes(b), { ignoreEncryption: true });
    (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
  }
  return new Blob([await out.save()], { type: 'application/pdf' });
}

// ops : [{ src: indice de page d'origine, rot: rotation supplémentaire (0/90/180/270) }] dans l'ordre voulu
export async function rebuildPdf(blob, ops) {
  const { PDFDocument, degrees } = await lib();
  const src = await PDFDocument.load(await readBytes(blob), { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, ops.map((o) => o.src));
  pages.forEach((p, i) => { if (ops[i].rot) p.setRotation(degrees((p.getRotation().angle + ops[i].rot) % 360)); out.addPage(p); });
  return new Blob([await out.save()], { type: 'application/pdf' });
}

export async function stampPdf(blob, { text, numbers, color = '#8a8a8a', opacity = 0.3 }) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await lib();
  const pdf = await PDFDocument.load(await readBytes(blob), { ignoreEncryption: true });
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold), reg = await pdf.embedFont(StandardFonts.Helvetica);
  const col = rgb(parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255);
  const clean = (s) => s.replace(/[^ -~ -ÿ€‘’“”…–—•]/g, '?');
  const pages = pdf.getPages(), N = pages.length;
  pages.forEach((page, i) => {
    const { width, height } = page.getSize();
    if (text) {
      const t = clean(text.toUpperCase());
      const size = Math.min(110, (Math.hypot(width, height) * 0.7) / Math.max(4, t.length) * 1.7);
      const tw = bold.widthOfTextAtSize(t, size), ang = Math.atan2(height, width);
      page.drawText(t, { x: width / 2 - (tw / 2) * Math.cos(ang) + (size / 3) * Math.sin(ang), y: height / 2 - (tw / 2) * Math.sin(ang) - (size / 3) * Math.cos(ang), size, font: bold, color: col, opacity, rotate: degrees((ang * 180) / Math.PI) });
    }
    if (numbers) {
      const t = `${i + 1} / ${N}`, size = 10;
      page.drawText(t, { x: width / 2 - reg.widthOfTextAtSize(t, size) / 2, y: 20, size, font: reg, color: rgb(0.25, 0.25, 0.25) });
    }
  });
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

export function parseRanges(str, N) {
  const out = [];
  for (const part of str.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/); if (!m) return null;
    let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a];
    if (a < 1 || b > N) return null;
    for (let i = a; i <= b; i++) out.push(i - 1);
  }
  return out.length ? out : null;
}

export async function saveAsDoc(blob, title) {
  const rec = { id: newId(), title: safeName(title), kind: 'pdf', fmt: 'pdf', blob, size: blob.size, mime: 'application/pdf', created: Date.now(), updated: Date.now(), preview: '', words: 0 };
  await putDoc(rec); return rec;
}

/* ---------- interfaces (page Documents) ---------- */
function sortableList(items, render) {
  const box = h('div', { class: 'ptlist' });
  const draw = () => {
    box.replaceChildren(...items.map((it, i) => h('div', { class: 'ptrow' },
      render(it),
      h('button', { class: 'icon-btn', 'aria-label': 'Monter', disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); } }, icon('up', 18)),
      h('button', { class: 'icon-btn', 'aria-label': 'Descendre', disabled: i === items.length - 1, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); } }, icon('down', 18)),
      h('button', { class: 'icon-btn', 'aria-label': 'Retirer', onclick: () => { items.splice(i, 1); draw(); } }, icon('close', 18)))));
    if (!items.length) box.replaceChildren(h('p', { class: 'muted' }, 'Rien pour l’instant.'));
  };
  draw();
  return { el: box, draw };
}

export function openScanner({ onDone }) {
  const items = []; // { file, url }
  const title = h('input', { class: 'field', value: 'Scan ' + new Date().toLocaleDateString('fr-FR'), 'aria-label': 'Nom du document' });
  const list = sortableList(items, (it) => h('div', { class: 'ptitem' }, h('img', { src: it.url, alt: '', class: 'ptthumb' }), h('small', {}, it.file.name || 'Photo')));
  const add = (files) => { for (const f of files) items.push({ file: f, url: URL.createObjectURL(f) }); list.draw(); };
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: () => { add([...cam.files]); cam.value = ''; } });
  const pick = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: () => { add([...pick.files]); pick.value = ''; } });
  let s;
  const go = async () => {
    if (!items.length) { toast('Ajoutez au moins une image'); return; }
    toast('Création du PDF…', 60000);
    try { const blob = await imagesToPdf(items.map((i) => i.file), (n, t) => toast(`Création du PDF… ${n}/${t}`, 60000)); const rec = await saveAsDoc(blob, title.value || 'Scan'); items.forEach((i) => URL.revokeObjectURL(i.url)); s.close(); toast('PDF créé ✓'); onDone(rec.id); }
    catch (e) { console.error(e); toast('Impossible de créer le PDF (image illisible ?)', 4000); }
  };
  s = sheet('Scanner / images → PDF', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'Photographiez vos pages ou choisissez des images : elles sont assemblées en un seul PDF.'),
    h('div', { class: 'vact' },
      h('button', { class: 'btn', onclick: () => cam.click() }, icon('camera', 18), 'Prendre une photo'),
      h('button', { class: 'btn', onclick: () => pick.click() }, icon('image', 18), 'Choisir des images')),
    list.el, title, h('button', { class: 'btn primary', onclick: go }, 'Créer le PDF'), cam, pick), { wide: true });
}

export async function openMerge({ onDone }) {
  const docs = (await listDocs()).filter((d) => d.kind === 'pdf');
  const items = []; // { name, blob }
  const list = sortableList(items, (it) => h('div', { class: 'ptitem' }, icon('pdf', 22), h('small', {}, it.name)));
  const pick = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, hidden: true, onchange: () => { for (const f of pick.files) items.push({ name: f.name, blob: f }); pick.value = ''; list.draw(); } });
  const lib2 = docs.length ? h('div', { class: 'ptlib' }, h('b', {}, 'Ajouter depuis mes documents'), ...docs.map((d) => h('button', { class: 'sres-item', onclick: () => { items.push({ name: d.title, blob: d.blob }); list.draw(); } }, h('span', {}, d.title)))) : null;
  const title = h('input', { class: 'field', value: 'PDF fusionné', 'aria-label': 'Nom du document' });
  let s;
  const go = async () => {
    if (items.length < 2) { toast('Choisissez au moins deux PDF'); return; }
    toast('Fusion en cours…', 60000);
    try { const rec = await saveAsDoc(await mergePdfs(items.map((i) => i.blob)), title.value || 'PDF fusionné'); s.close(); toast('PDF fusionné ✓'); onDone(rec.id); }
    catch (e) { console.error(e); toast('Fusion impossible (PDF protégé ou endommagé ?)', 4500); }
  };
  s = sheet('Fusionner des PDF', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'Ajoutez les PDF dans l’ordre voulu (flèches pour réordonner).'),
    h('button', { class: 'btn', onclick: () => pick.click() }, icon('upload', 18), 'Ajouter des fichiers…'),
    lib2, list.el, title, h('button', { class: 'btn primary', onclick: go }, 'Fusionner'), pick), { wide: true });
}
