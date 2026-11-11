// Lecteur PDF : pages rendues à la demande, texte sélectionnable, zoom (boutons et pincement), recherche, conversion en document.
import { h, icon, toast, saveBlob, shareBlob, safeName, promptDialog, sheet } from './ui.js';
import { putDoc } from './storage.js';
import { loadPdfjs, useWorkerMode, pageText, pageParagraphs } from './pdf-lib.js';
import { viewerTopbar, deleteItem, searchSheet } from './viewer-ui.js';
import { terms, norm, makeSnippet, snippetEl } from './search.js';

// Polices standard, CMaps (polices asiatiques), décodeurs d’images et profils couleur : sans eux le texte non incorporé disparaît
const base = new URL('pdfjs/', document.baseURI).href;
const PDFJS_ASSETS = { standardFontDataUrl: base + 'standard_fonts/', cMapUrl: base + 'cmaps/', cMapPacked: true, wasmUrl: base + 'wasm/', iccUrl: base + 'iccs/' };

const friendly = (e) => {
  const n = e?.name || '', m = e?.message || String(e);
  if (n === 'NotReadableError' || /not readable|could not be read/i.test(m)) return 'Le fichier n’est plus lisible sur cet appareil (stocké dans le cloud ?). Réimportez-le depuis le téléphone.';
  if (n === 'InvalidPDFException' || /invalid pdf/i.test(m)) return 'Ce fichier n’est pas un PDF valide ou il est endommagé.';
  if (n === 'MissingPDFException') return 'Le PDF est introuvable.';
  if (/délai|timeout/i.test(m)) return 'Le chargement a pris trop de temps.';
  return m;
};
const withTimeout = (promise, ms, label, paused = () => false) => new Promise((resolve, reject) => {
  let left = ms; const tick = 500;
  const t = setInterval(() => { if (paused()) return; left -= tick; if (left <= 0) { clearInterval(t); reject(new Error(`Délai dépassé (${label})`)); } }, tick);
  promise.then((v) => { clearInterval(t); resolve(v); }, (e) => { clearInterval(t); reject(e); });
});
async function readBlob(b) {
  try { return await b.arrayBuffer(); } catch (e) { try { return await new Response(b).arrayBuffer(); } catch { throw e; } }
}

export async function mountPdf(host, rec, hooks) {
  const root = h('div', { class: 'viewer' });
  let destroyed = false, ready = false, paused = false;
  const msg = h('p', { class: 'vmsg' }, 'Ouverture du PDF…');
  const sub = h('small', { class: 'vsub' }, '');
  const actions = h('div', { class: 'vact' });
  const spin = h('div', { class: 'spin' });
  const loading = h('div', { class: 'vload' }, spin, msg, sub, actions);
  root.append(viewerTopbar(rec, hooks, () => []), loading);
  host.replaceChildren(root);
  const fileName = safeName(rec.title) + '.pdf';
  const rescue = () => [
    h('button', { class: 'btn', onclick: () => saveBlob(rec.blob, fileName) }, icon('download', 18), 'Télécharger le PDF'),
    navigator.canShare ? h('button', { class: 'btn', onclick: () => shareBlob(rec.blob, fileName, 'application/pdf') }, icon('share', 18), 'Ouvrir avec une autre application') : h('button', { class: 'btn', onclick: () => window.open(URL.createObjectURL(rec.blob), '_blank') }, icon('file', 18), 'Ouvrir dans le navigateur'),
    h('button', { class: 'btn', onclick: () => hooks.onBack() }, 'Retour'),
  ];
  const watchdog = setTimeout(() => { if (!destroyed && !ready) { sub.textContent = 'Le chargement est plus long que prévu… (gros fichier ou appareil lent)'; actions.replaceChildren(...rescue()); } }, 12000);
  const noop = { flush() {}, destroy() { destroyed = true; clearTimeout(watchdog); } };
  const fail = (e, step) => {
    clearTimeout(watchdog); spin.remove();
    msg.textContent = 'Impossible d’ouvrir ce PDF';
    sub.textContent = `${friendly(e)}  [étape : ${step}]`;
    actions.replaceChildren(h('button', { class: 'btn primary', onclick: () => hooks.onRetry?.() }, 'Réessayer'), ...rescue());
    console.error('PDF', step, e);
    return noop;
  };

  let step = 'lecture du fichier', buf, pdfjs, task, doc;
  try {
    buf = await withTimeout(readBlob(rec.blob), 20000, step);
    if (destroyed) return noop;
    step = 'chargement du lecteur'; msg.textContent = 'Chargement du lecteur PDF…';
    pdfjs = await withTimeout(loadPdfjs(), 25000, step);
    import('pdfjs-dist/web/pdf_viewer.css').catch(() => {});
    // Deux tentatives : worker avec compléments, puis worker standard (repli automatique sur le thread principal)
    let lastErr;
    for (const mode of ['wrapped', 'plain']) {
      step = mode === 'wrapped' ? 'analyse du document' : 'analyse du document (mode secours)';
      msg.textContent = mode === 'wrapped' ? 'Analyse du document…' : 'Nouvelle tentative…';
      try {
        const dead = useWorkerMode(mode);
        task = pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false, useSystemFonts: true, ...PDFJS_ASSETS });
        task.onProgress = ({ loaded, total }) => { if (total) sub.textContent = `${Math.round((loaded / total) * 100)} %`; };
        task.onPassword = async (update, reason) => {
          paused = true;
          const pw = await promptDialog('PDF protégé', reason === 2 ? 'Mot de passe incorrect, réessayez' : 'Saisissez le mot de passe du document', '', 'Ouvrir');
          paused = false;
          if (pw == null) { hooks.onBack(); return; }
          update(pw);
        };
        doc = await withTimeout(Promise.race([task.promise, dead]), mode === 'wrapped' ? 15000 : 30000, step, () => paused);
        break;
      } catch (e) { lastErr = e; try { task?.destroy(); } catch { /* ignore */ } if (/InvalidPDF|MissingPDF|Password/i.test(e?.name || '')) throw e; }
    }
    if (!doc) throw lastErr || new Error('Aucune méthode de lecture n’a fonctionné');
  } catch (e) { return fail(e, step); }
  if (destroyed) return noop;
  ready = true; clearTimeout(watchdog);
  const N = doc.numPages;

  /* ---------- structure ---------- */
  const pagesEl = h('div', { class: 'pdf-pages' });
  const scroller = h('main', { class: 'pdf-scroll' }, pagesEl);
  const pageLabel = h('button', { class: 'pg-label', onclick: () => askPage() }, `1 / ${N}`);
  const bar = h('footer', { class: 'viewbar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Zoom arrière', onclick: () => zoomBy(1 / 1.25) }, icon('zoomOut', 22)),
    h('button', { class: 'icon-btn', 'aria-label': 'Ajuster à la largeur', onclick: () => { fit = true; applyScale(); } }, icon('fit', 22)),
    h('button', { class: 'icon-btn', 'aria-label': 'Zoom avant', onclick: () => zoomBy(1.25) }, icon('zoomIn', 22)),
    h('span', { class: 'grow' }),
    h('button', { class: 'icon-btn', 'aria-label': 'Page précédente', onclick: () => goTo(cur - 1) }, icon('up', 22)),
    pageLabel,
    h('button', { class: 'icon-btn', 'aria-label': 'Page suivante', onclick: () => goTo(cur + 1) }, icon('down', 22)));

  /* ---------- texte (recherche, indexation, conversion) ---------- */
  let texts = null;
  async function ensureText(onProgress) {
    if (texts) return texts;
    const t = [];
    for (let n = 1; n <= N && !destroyed; n++) { t.push(await pageText(doc, n)); onProgress?.(n); if (n % 5 === 0) await new Promise((r) => setTimeout(r, 0)); }
    return (texts = t);
  }
  const fullText = () => (texts || []).join('\n\n');
  async function indexInBackground() {
    if (rec.text) return;
    await new Promise((r) => setTimeout(r, 1200));
    const t = await ensureText();
    if (destroyed) return;
    const text = t.join('\n\n').slice(0, 400000);
    rec = { ...rec, text, preview: text.replace(/\s+/g, ' ').slice(0, 160), pages: N, updated: rec.updated };
    putDoc(rec).catch(() => {});
  }

  function openSearch() {
    searchSheet({
      title: 'Rechercher dans le PDF', placeholder: 'Mot ou expression…',
      run: async (q) => {
        toast('Analyse du document…', 1500);
        const t = await ensureText();
        const ts = terms(q);
        return t.map((txt, i) => ({ page: i + 1, sn: norm(txt).includes(ts[0]) && ts.every((x) => norm(txt).includes(x)) ? makeSnippet(txt, ts) : null })).filter((r) => r.sn).slice(0, 100);
      },
      render: (r, close) => h('button', { class: 'sres-item', onclick: () => { close(); goTo(r.page); } }, h('b', {}, `Page ${r.page}`), snippetEl(h, r.sn)),
    });
  }

  async function convert() {
    toast('Conversion en document modifiable…', 60000);
    try {
      let html = '';
      for (let n = 1; n <= N; n++) {
        const paras = await pageParagraphs(doc, n);
        html += paras.map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('');
        if (n < N) html += '<div data-page-break></div><p></p>';
        if (n % 3 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      hooks.onConvert({ title: rec.title + ' (texte)', html: html || '<p></p>' });
    } catch { toast('Conversion impossible'); }
  }

  /* ---------- sommaire, miniatures, rotation, nuit, impression, infos ---------- */
  let outline;
  doc.getOutline().then((o) => { outline = o && o.length ? o : null; }).catch(() => {});
  function openOutline() {
    if (!outline) { toast('Ce PDF n’a pas de sommaire'); return; }
    let s;
    const build = (items, depth) => items.map((it) => h('div', {},
      h('button', { class: 'toc-item', style: `padding-left:${12 + depth * 16}px`, onclick: () => { s.close(); if (it.dest) gotoDest(it.dest); else if (it.url && /^https?:/i.test(it.url)) window.open(it.url, '_blank', 'noopener'); } }, it.title || '(sans titre)'),
      it.items?.length ? build(it.items, depth + 1) : null));
    s = sheet('Sommaire', h('div', { class: 'toc-list' }, build(outline, 0)), { wide: true });
  }
  function openThumbs() {
    const grid = h('div', { class: 'thumbs' });
    let s;
    const io = new IntersectionObserver((entries) => entries.forEach(async (en) => {
      if (!en.isIntersecting) return; io.unobserve(en.target);
      const i = +en.target.dataset.n - 1;
      try {
        const page = await doc.getPage(i + 1);
        const rotation = (page.rotate + rot) % 360;
        const v0 = page.getViewport({ scale: 1, rotation });
        const sc = 150 / v0.width * Math.min(devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale: sc, rotation });
        const c = h('canvas'); c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
        en.target.querySelector('.tph').replaceChildren(c);
      } catch { /* ignore */ }
    }), { root: null, rootMargin: '200px' });
    for (let i = 0; i < N; i++) {
      const d = dims(i), ratio = d[1] / d[0];
      const b = h('button', { class: 'thumb-item' + (i + 1 === cur ? ' cur' : ''), 'data-n': i + 1, onclick: () => { s.close(); goTo(i + 1); } },
        h('div', { class: 'tph', style: `aspect-ratio:${1 / ratio}` }), h('small', {}, String(i + 1)));
      grid.append(b);
    }
    s = sheet('Miniatures', grid, { wide: true, onClose: () => io.disconnect() });
    setTimeout(() => { grid.querySelectorAll('.thumb-item').forEach((b) => io.observe(b)); grid.querySelector('.cur')?.scrollIntoView({ block: 'center' }); }, 280);
  }
  function rotate() {
    rot = (rot + 90) % 360;
    state.forEach((st, i) => { if (st.task) { try { st.task.cancel(); } catch { /* ignore */ } } st.done = 0; st.busy = 0; els[i].replaceChildren(); });
    const keep = cur; applyScale(); setTimeout(() => goTo(keep), 30);
  }
  function toggleNight() { night = !night; lsSet('luma-pdf-night', night ? '1' : '0'); root.classList.toggle('pdf-night', night); }
  function fitPage() { fitMode = 'page'; fit = true; applyScale(); setTimeout(() => goTo(cur), 30); }
  function fitWidth() { fitMode = 'width'; fit = true; applyScale(); }
  function print() {
    const url = URL.createObjectURL(rec.blob);
    const f = h('iframe', { style: 'position:fixed;width:0;height:0;border:0;left:-9px', src: url });
    f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.open(url, '_blank'); } };
    document.body.append(f);
    setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 180000);
  }
  function fullscreen() { if (document.fullscreenElement) document.exitFullscreen?.(); else (root.requestFullscreen || root.webkitRequestFullscreen)?.call(root); }
  async function info() {
    let meta = {}; try { meta = (await doc.getMetadata()).info || {}; } catch { /* ignore */ }
    const mm = (v) => Math.round((v / 72) * 25.4);
    const rows = [
      ['Titre', meta.Title || rec.title], ['Auteur', meta.Author], ['Sujet', meta.Subject], ['Créé avec', meta.Creator], ['Producteur', meta.Producer],
      ['Pages', String(N)], ['Format', `${mm(v1.width)} × ${mm(v1.height)} mm`], ['Taille', rec.size ? (rec.size > 1048576 ? (rec.size / 1048576).toFixed(1) + ' Mo' : Math.round(rec.size / 1024) + ' Ko') : ''], ['Version PDF', meta.PDFFormatVersion],
    ].filter((r) => r[1]);
    sheet('Propriétés du document', h('div', { class: 'info-grid' }, rows.map(([k, v]) => h('div', { class: 'info-row' }, h('span', {}, k), h('b', {}, v)))));
  }

  const menu = () => [
    { sep: 'Navigation' },
    { icon: 'grid', label: 'Miniatures des pages', run: openThumbs },
    outline ? { icon: 'toc', label: 'Sommaire', run: openOutline } : null,
    { icon: 'gotopage', label: 'Aller à la page…', run: askPage },
    { sep: 'Affichage' },
    { icon: 'fit', label: 'Ajuster à la largeur', run: fitWidth },
    { icon: 'fullimg', label: 'Ajuster à la page entière', run: fitPage },
    { icon: 'orient', label: 'Pivoter de 90°', run: rotate },
    { icon: 'moon', label: night ? 'Désactiver le mode nuit' : 'Mode nuit (pages inversées)', run: toggleNight },
    document.fullscreenEnabled || document.webkitFullscreenEnabled ? { icon: 'sidebar', label: 'Plein écran', run: fullscreen } : null,
    { sep: 'Document' },
    { icon: 'info', label: 'Propriétés du document', run: info },
    { icon: 'print', label: 'Imprimer', run: print },
    { icon: 'search', label: 'Rechercher dans le PDF', run: openSearch },
    { icon: 'download', label: 'Télécharger le PDF', run: () => saveBlob(rec.blob, safeName(rec.title) + '.pdf') },
    navigator.canShare ? { icon: 'share', label: 'Partager', run: () => shareBlob(rec.blob, safeName(rec.title) + '.pdf', 'application/pdf') } : null,
    { icon: 'word', label: 'Convertir en document modifiable', hint: 'Texte seulement, sans la mise en page d’origine', run: convert },
    { sep: 'Fichier' },
    deleteItem(rec, hooks),
  ];
  root.replaceChildren(viewerTopbar(rec, hooks, menu), scroller, bar);

  /* ---------- pages ---------- */
  const first = await doc.getPage(1);
  const v1 = first.getViewport({ scale: 1 });
  const sizes = Array.from({ length: N }, () => [v1.width, v1.height]);
  const state = Array.from({ length: N }, () => ({ done: 0, busy: 0, task: null }));
  const els = [];
  let scale = 1, fit = true, cur = 1, rot = 0, fitMode = 'width';
  const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
  let night = lsGet('luma-pdf-night', '0') === '1';
  root.classList.toggle('pdf-night', night);
  const dims = (i) => (rot % 180 ? [sizes[i][1], sizes[i][0]] : sizes[i]);
  const fitScale = () => {
    const [w, hh] = dims(Math.max(0, cur - 1));
    const byW = (scroller.clientWidth - 16) / w;
    return Math.max(0.25, Math.min(4, fitMode === 'page' ? Math.min(byW, (scroller.clientHeight - 20) / hh) : byW));
  };

  for (let i = 0; i < N; i++) {
    const el = h('div', { class: 'pdf-page', 'data-n': i + 1, 'aria-label': `Page ${i + 1}` });
    els.push(el); pagesEl.append(el);
  }
  function layout() {
    els.forEach((el, i) => { const d = dims(i); el.style.width = d[0] * scale + 'px'; el.style.height = d[1] * scale + 'px'; });
  }

  async function renderPage(i) {
    const st = state[i];
    if (destroyed || st.done === scale || st.busy === scale) return;
    st.busy = scale;
    const my = scale;
    try {
      const page = await doc.getPage(i + 1);
      const base = page.getViewport({ scale: 1 });
      sizes[i] = [base.width, base.height];
      const rotation = (page.rotate + rot) % 360;
      const vp = page.getViewport({ scale: my, rotation });
      const el = els[i];
      el.style.width = vp.width + 'px'; el.style.height = vp.height + 'px';
      let k = Math.min(devicePixelRatio || 1, 2);
      while (vp.width * k * vp.height * k > 14e6) k *= 0.85;
      const canvas = h('canvas', { class: 'pdf-canvas' });
      canvas.width = Math.floor(vp.width * k); canvas.height = Math.floor(vp.height * k);
      canvas.style.width = '100%'; canvas.style.height = '100%';
      const rt = page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: my * k, rotation }), canvas });
      st.task = rt;
      await rt.promise;
      if (destroyed || my !== scale) { st.busy = 0; return; }
      const tl = h('div', { class: 'textLayer' });
      tl.style.setProperty('--scale-factor', my); tl.style.setProperty('--total-scale-factor', my);
      el.replaceChildren(canvas, tl);
      st.done = my; st.busy = 0;
      try { await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: vp }).render(); } catch { /* texte indisponible */ }
      addLinks(page, vp, el).catch((e) => console.warn("links", e));
      if (i === 0 && !rec.thumb) makeThumb(canvas);
    } catch (e) {
      st.busy = 0;
      if (e?.name !== 'RenderingCancelledException') console.warn('PDF page', i + 1, e);
    }
  }
  async function gotoDest(d) {
    try {
      if (typeof d === 'string') d = await doc.getDestination(d);
      if (!Array.isArray(d)) return;
      const idx = typeof d[0] === 'object' ? await doc.getPageIndex(d[0]) : d[0];
      goTo(idx + 1);
    } catch { toast('Lien interne introuvable'); }
  }
  async function addLinks(page, vp, el) {
    const ann = await page.getAnnotations({ intent: 'display' });
    for (const a of ann) {
      if (a.subtype !== 'Link' || !a.rect || !(a.dest || a.url || a.unsafeUrl)) continue;
      const [p1, p2] = [vp.convertToViewportPoint(a.rect[0], a.rect[1]), vp.convertToViewportPoint(a.rect[2], a.rect[3])];
      const r = [p1[0], p1[1], p2[0], p2[1]];
      const link = h('a', { class: 'pdf-link' });
      link.style.cssText = `left:${Math.min(r[0], r[2])}px;top:${Math.min(r[1], r[3])}px;width:${Math.abs(r[2] - r[0])}px;height:${Math.abs(r[3] - r[1])}px`;
      const url = a.url || a.unsafeUrl;
      if (url && /^(https?:|mailto:|tel:)/i.test(url)) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      else if (a.dest) link.addEventListener('click', (e) => { e.preventDefault(); gotoDest(a.dest); });
      else continue;
      el.append(link);
    }
  }
  function makeThumb(canvas) {
    try {
      const w = 260, c = document.createElement('canvas');
      c.width = w; c.height = Math.round((canvas.height / canvas.width) * w);
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
      rec = { ...rec, thumb: c.toDataURL('image/jpeg', 0.75), pages: N };
      putDoc(rec).catch(() => {});
    } catch { /* ignore */ }
  }
  function release(i) {
    const st = state[i];
    if (st.task) { try { st.task.cancel(); } catch { /* ignore */ } }
    st.done = 0; st.busy = 0;
    els[i].replaceChildren();
  }
  function visibleRange() {
    const top = scroller.scrollTop, bottom = top + scroller.clientHeight, m = Math.max(600, scroller.clientHeight);
    const vis = [], far = [];
    els.forEach((el, i) => { const t = el.offsetTop, b = t + el.offsetHeight; (b > top - m && t < bottom + m ? vis : far).push(i); });
    return { vis, far };
  }
  let raf = 0;
  function update() {
    raf = 0;
    const { vis, far } = visibleRange();
    far.forEach((i) => { if (state[i].done || state[i].busy) release(i); });
    vis.forEach((i) => renderPage(i));
    // page courante
    const mid = scroller.scrollTop + scroller.clientHeight * 0.35;
    let c = 1;
    els.forEach((el, i) => { if (el.offsetTop <= mid) c = i + 1; });
    if (c !== cur) { cur = c; pageLabel.textContent = `${cur} / ${N}`; lsSet('luma-pdf-pos-' + rec.id, String(cur)); }
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  scroller.addEventListener('scroll', schedule, { passive: true });

  function applyScale() {
    const ratio = scroller.scrollHeight ? scroller.scrollTop / scroller.scrollHeight : 0;
    scale = fit ? fitScale() : scale;
    layout();
    // les canvas déjà rendus restent affichés (étirés) le temps du nouveau rendu
    state.forEach((st, i) => { if (st.done && st.done !== scale) { els[i].querySelector('.textLayer')?.remove(); st.done = 0; } });
    scroller.scrollTop = ratio * scroller.scrollHeight;
    clearTimeout(applyScale.t); applyScale.t = setTimeout(update, 120);
    schedule();
  }
  function zoomBy(f) { fit = false; scale = Math.max(0.25, Math.min(5, scale * f)); applyScale(); }
  function goTo(n) { n = Math.max(1, Math.min(N, n)); els[n - 1].scrollIntoView({ block: 'start' }); schedule(); }
  async function askPage() { const v = await promptDialog('Aller à la page', `Numéro de page (1 – ${N})`, String(cur), 'Aller'); const n = parseInt(v, 10); if (n) goTo(n); }

  // pincement (deux doigts)
  let pinch = null;
  const dist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  scroller.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = { d: dist(e), s: scale }; }, { passive: true });
  scroller.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length === 2) { e.preventDefault(); fit = false; scale = Math.max(0.25, Math.min(5, pinch.s * (dist(e) / pinch.d))); layout(); clearTimeout(applyScale.t); applyScale.t = setTimeout(() => { state.forEach((st, i) => { if (st.done !== scale) { els[i].querySelector('.textLayer')?.remove(); st.done = 0; } }); update(); }, 220); }
  }, { passive: false });
  scroller.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });

  // double-tap / double-clic : bascule entre « ajusté » et zoom ×2
  let lastTap = 0, tapXY = null;
  scroller.addEventListener('touchstart', (e) => { if (e.touches.length === 1) tapXY = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
  scroller.addEventListener('touchend', (e) => {
    if (e.touches.length || e.changedTouches.length !== 1 || !tapXY) return;
    const t = e.changedTouches[0];
    if (Math.hypot(t.clientX - tapXY[0], t.clientY - tapXY[1]) > 12) { tapXY = null; return; }
    const now = Date.now();
    if (now - lastTap < 320) { lastTap = 0; toggleZoom(); } else lastTap = now;
  }, { passive: true });
  scroller.addEventListener('dblclick', (e) => { if (e.pointerType !== 'touch' && !e.target.closest?.('.pdf-link')) toggleZoom(); });
  function toggleZoom() { const f = fitScale(); if (fit || scale < f * 1.5) { fit = false; scale = Math.min(5, f * 2.2); } else fit = true; applyScale(); }

  const onResize = () => { if (fit) applyScale(); };
  addEventListener('resize', onResize);
  const onKey = (e) => { if (e.key === 'PageDown' || e.key === 'ArrowRight') goTo(cur + 1); else if (e.key === 'PageUp' || e.key === 'ArrowLeft') goTo(cur - 1); else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch(); } };
  document.addEventListener('keydown', onKey);

  applyScale();
  const savedPg = parseInt(lsGet('luma-pdf-pos-' + rec.id, '1'), 10);
  if (savedPg > 1 && savedPg <= N) setTimeout(() => { goTo(savedPg); toast(`Reprise à la page ${savedPg}`, 1800); }, 60);
  // tailles réelles des autres pages (documents à formats mixtes)
  (async () => {
    for (let i = 1; i < Math.min(N, 300) && !destroyed; i++) {
      const vp = (await doc.getPage(i + 1)).getViewport({ scale: 1 });
      if (Math.abs(vp.width - sizes[i][0]) > 1 || Math.abs(vp.height - sizes[i][1]) > 1) { sizes[i] = [vp.width, vp.height]; if (!state[i].done) { const d = dims(i); els[i].style.width = d[0] * scale + 'px'; els[i].style.height = d[1] * scale + 'px'; } }
      if (i % 15 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  })();
  indexInBackground();

  return {
    flush: async () => {},
    destroy() { destroyed = true; removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey); try { task.destroy(); } catch { /* ignore */ } },
    fullText,
  };
}
