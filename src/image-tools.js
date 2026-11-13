// Outils image : compression, conversion de format, partage, image → PowerPoint, export des images d'un PDF / document.
import JSZip from 'jszip';
import { h, icon, sheet, toast, saveBlob, shareBlob, safeName } from './ui.js';
import { fmtBytes } from './storage.js';

const baseName = (n) => safeName((n || 'image').replace(/\.[^.]+$/, ''));
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const toBlob = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));

export async function bitmapOf(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return createImageBitmap(file); }
}
// Dessine l'image (réduite à max px si besoin) sur un canvas ; fond blanc pour les formats sans transparence
export function drawScaled(bmp, max, opaque) {
  const k = max ? Math.min(1, max / Math.max(bmp.width, bmp.height)) : 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext('2d');
  if (opaque) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
// Encode un canvas ; si le navigateur ne sait pas produire ce format, repli sur PNG
async function encode(c, type, q) {
  const b = await toBlob(c, type, q);
  return b && b.type === type ? b : (await toBlob(c, 'image/png'));
}

/* ---------- cadre commun : choisir des fichiers, régler, lancer, enregistrer / partager ---------- */
function openTool({ title, intro, accept = 'image/*', multiple = true, camera = false, pickLabel = 'Choisir des images', cta, options, run, autoShare }) {
  const files = [];
  const thumbs = h('div', { class: 'it-thumbs' });
  const results = h('div', { class: 'it-results', hidden: true });
  const status = h('div', { class: 'ai-status' });
  let go, s;
  const draw = () => {
    thumbs.replaceChildren(...files.map((f, i) => h('div', { class: 'it-th' },
      /^image\//.test(f.type) ? h('img', { src: f._url || (f._url = URL.createObjectURL(f)), alt: '' }) : h('div', { class: 'it-doc' }, icon('file', 26)),
      h('small', {}, f.name || 'Photo'), h('em', {}, fmtBytes(f.size)),
      h('button', { class: 'it-x', 'aria-label': 'Retirer', onclick: () => { files.splice(i, 1); draw(); } }, icon('close', 14)))));
    go.disabled = !files.length;
  };
  const add = (list) => { for (const f of list) files.push(f); if (!multiple && files.length > 1) files.splice(0, files.length - 1); results.hidden = true; draw(); };
  const pick = h('input', { type: 'file', accept, multiple, hidden: true, onchange: () => { add([...pick.files]); pick.value = ''; } });
  const cam = camera ? h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: () => { add([...cam.files]); cam.value = ''; } }) : null;
  const opts = options ? options() : { el: null, get: () => ({}) };
  go = h('button', { class: 'btn primary', disabled: true, onclick: async () => {
    go.disabled = true; results.hidden = true; status.textContent = 'Traitement…';
    try {
      const out = await run(files, opts.get(), (n, t) => { status.textContent = `Traitement… ${n}/${t}`; });
      status.textContent = '';
      showResults(out);
      if (autoShare && out.length) await shareAll(out);
    } catch (e) { console.error(e); status.textContent = ''; toast(e?.message || 'Impossible de traiter ce fichier', 5000); }
    go.disabled = !files.length;
  } }, cta);
  const shareAll = async (out) => {
    if (out.length === 1) return shareBlob(out[0].blob, out[0].name, out[0].blob.type);
    const z = await zipOf(out);
    return shareBlob(z, 'Luma-Office-images.zip', 'application/zip');
  };
  function showResults(out) {
    if (!out.length) { results.replaceChildren(h('p', { class: 'muted' }, 'Aucun résultat.')); results.hidden = false; return; }
    results.replaceChildren(
      h('b', {}, out.length > 1 ? `${out.length} fichiers prêts` : 'Fichier prêt'),
      ...out.map((r) => h('div', { class: 'it-res' },
        r.blob.type.startsWith('image/') ? h('img', { src: URL.createObjectURL(r.blob), alt: '' }) : h('div', { class: 'it-doc' }, icon('file', 22)),
        h('div', { class: 'it-info' }, h('b', {}, r.name), h('small', {}, [fmtBytes(r.blob.size), r.note].filter(Boolean).join(' · '))),
        h('button', { class: 'icon-btn', 'aria-label': 'Enregistrer', title: 'Enregistrer', onclick: () => { saveBlob(r.blob, r.name); toast('Enregistré dans vos téléchargements'); } }, icon('download', 20)),
        h('button', { class: 'icon-btn', 'aria-label': 'Partager', title: 'Partager', onclick: () => shareBlob(r.blob, r.name, r.blob.type) }, icon('share', 20)))),
      h('div', { class: 'row' },
        out.length > 1 ? h('button', { class: 'btn', onclick: async () => { saveBlob(await zipOf(out), 'Luma-Office-images.zip'); toast('Archive .zip enregistrée'); } }, icon('download', 18), 'Tout enregistrer (.zip)') : null,
        h('button', { class: 'btn', onclick: () => shareAll(out) }, icon('share', 18), 'Tout partager')));
    results.hidden = false;
  }
  s = sheet(title, h('div', { class: 'form ai-box' },
    intro ? h('p', { class: 'muted' }, intro) : null,
    h('div', { class: 'vact' }, camera ? h('button', { class: 'btn', onclick: () => cam.click() }, icon('camera', 18), 'Prendre une photo') : null, h('button', { class: 'btn', onclick: () => pick.click() }, icon('image', 18), pickLabel)),
    thumbs, opts.el, h('div', { class: 'row' }, go, status), results, pick, cam), { wide: true });
  draw();
}

async function zipOf(items) {
  const z = new JSZip(); const used = new Set();
  for (const r of items) { let n = r.name, i = 1; while (used.has(n)) n = r.name.replace(/(\.[^.]*)?$/, `-${i++}$1`); used.add(n); z.file(n, r.blob); }
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/* ---------- petits constructeurs d'options ---------- */
const field = (label, el) => h('label', { class: 'it-opt' }, h('span', {}, label), el);
const select = (opts, val) => { const el = h('select', { class: 'field' }, ...opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(val) }, l))); return el; };

/* ---------- compression ---------- */
export function openCompress() {
  openTool({
    title: 'Compression d’image', intro: 'Réduisez le poids de vos photos pour les envoyer plus facilement (WhatsApp, e-mail).', multiple: true, cta: 'Compresser',
    options: () => {
      const q = h('input', { type: 'range', min: 30, max: 95, value: 70, class: 'zoom-rng' });
      const qv = h('b', {}, '70 %'); q.oninput = () => { qv.textContent = q.value + ' %'; };
      const size = select([['0', 'Taille d’origine'], ['2560', 'Grande (2560 px)'], ['1920', 'Moyenne (1920 px)'], ['1280', 'Petite (1280 px)'], ['800', 'Très petite (800 px)']], 1920);
      const fmt = select([['image/jpeg', 'JPEG (le plus léger)'], ['image/webp', 'WebP (encore plus léger)']], 'image/jpeg');
      return { el: h('div', { class: 'it-opts' }, field('Qualité', h('div', { class: 'row' }, q, qv)), field('Dimensions', size), field('Format', fmt)), get: () => ({ q: q.value / 100, max: +size.value, type: fmt.value }) };
    },
    run: async (files, { q, max, type }, progress) => {
      const out = [];
      for (const [i, f] of files.entries()) {
        const bmp = await bitmapOf(f);
        const c = drawScaled(bmp, max, true); bmp.close?.();
        let b = await encode(c, type, q);
        const same = b.size >= f.size && !max; // déjà plus léger : on garde l'original
        const blob = same ? f : b;
        const gain = Math.round((1 - blob.size / f.size) * 100);
        out.push({ name: same ? f.name : `${baseName(f.name)}-compressé.${EXT[b.type] || 'png'}`, blob, note: same ? 'déjà optimisée' : gain > 0 ? `−${gain} %` : '' });
        progress(i + 1, files.length);
      }
      return out;
    },
  });
}

/* ---------- conversion de format ---------- */
export function openConvert() {
  openTool({
    title: 'Convertir le format d’image', intro: 'Transformez vos images en PNG, JPEG ou WebP.', multiple: true, cta: 'Convertir',
    options: () => {
      const fmt = select([['image/png', 'PNG (sans perte, transparence)'], ['image/jpeg', 'JPEG (photos, léger)'], ['image/webp', 'WebP (moderne, léger)']], 'image/jpeg');
      const q = h('input', { type: 'range', min: 50, max: 100, value: 90, class: 'zoom-rng' });
      return { el: h('div', { class: 'it-opts' }, field('Convertir en', fmt), field('Qualité (JPEG / WebP)', q)), get: () => ({ type: fmt.value, q: q.value / 100 }) };
    },
    run: async (files, { type, q }, progress) => {
      const out = [];
      for (const [i, f] of files.entries()) {
        const bmp = await bitmapOf(f);
        const c = drawScaled(bmp, 0, type === 'image/jpeg'); bmp.close?.();
        const b = await encode(c, type, q);
        out.push({ name: `${baseName(f.name)}.${EXT[b.type] || 'png'}`, blob: b, note: b.type !== type ? 'format non pris en charge ici : PNG' : '' });
        progress(i + 1, files.length);
      }
      return out;
    },
  });
}

/* ---------- partage ---------- */
export function openShareImages() {
  openTool({
    title: 'Partage d’images', intro: 'Choisissez des images puis envoyez-les par WhatsApp, e-mail ou toute autre application.', multiple: true, camera: true, cta: 'Partager', autoShare: true,
    run: async (files) => files.map((f) => ({ name: f.name || 'photo.jpg', blob: f })),
  });
}

/* ---------- image → PowerPoint ---------- */
export function openImagesToPpt() {
  openTool({
    title: 'Image vers PowerPoint', intro: 'Chaque image devient une diapositive d’un fichier .pptx (ouvrable dans PowerPoint, WPS, LibreOffice…).', multiple: true, camera: true, cta: 'Créer la présentation',
    options: () => {
      const ratio = select([['16:9', 'Écran large 16:9'], ['4:3', 'Standard 4:3']], '16:9');
      const bg = select([['FFFFFF', 'Fond blanc'], ['000000', 'Fond noir']], 'FFFFFF');
      const name = h('input', { class: 'field', value: 'Présentation', 'aria-label': 'Nom du fichier' });
      return { el: h('div', { class: 'it-opts' }, field('Format', ratio), field('Fond', bg), field('Nom du fichier', name)), get: () => ({ ratio: ratio.value, bg: bg.value, name: name.value }) };
    },
    run: async (files, { ratio, bg, name }, progress) => {
      const { buildPptx } = await import('./pptx.js');
      const slides = [];
      for (const [i, f] of files.entries()) {
        const bmp = await bitmapOf(f);
        const c = drawScaled(bmp, 2000, true); bmp.close?.();
        const b = await toBlob(c, 'image/jpeg', 0.88);
        slides.push({ bytes: new Uint8Array(await b.arrayBuffer()), ext: 'jpeg', w: c.width, h: c.height });
        progress(i + 1, files.length);
      }
      const blob = await buildPptx(slides, { ratio, bg });
      return [{ name: `${safeName(name) || 'Présentation'}.pptx`, blob, note: `${slides.length} diapositive${slides.length > 1 ? 's' : ''}` }];
    },
  });
}

/* ---------- export des images d'un PDF ou d'un document ---------- */
export function openExportImages() {
  openTool({
    title: 'Exporter des images', intro: 'PDF : chaque page devient une image. Word, PowerPoint ou Excel : toutes les images du document sont extraites.',
    accept: '.pdf,application/pdf,.docx,.pptx,.xlsx,.xlsm', multiple: false, pickLabel: 'Choisir un document', cta: 'Exporter les images',
    options: () => {
      const fmt = select([['image/jpeg', 'JPEG'], ['image/png', 'PNG']], 'image/jpeg');
      const scale = select([['1', 'Normale'], ['1.5', 'Bonne'], ['2', 'Haute (plus lourd)']], 1.5);
      return { el: h('div', { class: 'it-opts' }, field('Format des pages (PDF)', fmt), field('Qualité des pages (PDF)', scale)), get: () => ({ type: fmt.value, scale: +scale.value }) };
    },
    run: async (files, { type, scale }, progress) => {
      const f = files[0], base = baseName(f.name), out = [];
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        const { loadPdfjs } = await import('./pdf-lib.js');
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false });
        const doc = await task.promise;
        const N = Math.min(doc.numPages, 200);
        for (let n = 1; n <= N; n++) {
          const page = await doc.getPage(n);
          const vp = page.getViewport({ scale: scale * 1.4 });
          const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: g, viewport: vp }).promise;
          const b = await encode(c, type, 0.9);
          out.push({ name: `${base}-page-${String(n).padStart(2, '0')}.${EXT[b.type] || 'png'}`, blob: b });
          page.cleanup?.(); progress(n, N);
        }
        task.destroy();
        if (doc.numPages > N) toast(`Les ${N} premières pages ont été exportées`, 4000);
      } else {
        const zip = await JSZip.loadAsync(await f.arrayBuffer());
        const media = Object.keys(zip.files).filter((p) => /(word|ppt|xl)\/media\/[^/]+\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(p));
        const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
        for (const [i, p] of media.entries()) {
          const ext = p.split('.').pop().toLowerCase();
          const b = await zip.file(p).async('blob');
          out.push({ name: `${base}-image-${String(i + 1).padStart(2, '0')}.${ext}`, blob: new Blob([b], { type: mime[ext] }) });
          progress(i + 1, media.length);
        }
        if (!out.length) toast('Aucune image dans ce document', 4000);
      }
      return out;
    },
  });
}
