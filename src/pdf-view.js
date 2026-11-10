// Lecteur PDF : pages rendues à la demande, texte sélectionnable, zoom (boutons et pincement), recherche, conversion en document.
import { h, icon, toast, saveBlob, shareBlob, safeName, promptDialog } from './ui.js';
import { putDoc } from './storage.js';
import { loadPdfjs, pageText, pageParagraphs } from './pdf-lib.js';
import { viewerTopbar, deleteItem, searchSheet } from './viewer-ui.js';
import { terms, norm, makeSnippet, snippetEl } from './search.js';

export async function mountPdf(host, rec, hooks) {
  const root = h('div', { class: 'viewer' });
  const loading = h('div', { class: 'vload' }, h('div', { class: 'spin' }), 'Ouverture du PDF…');
  root.append(viewerTopbar(rec, hooks, () => []), loading);
  host.replaceChildren(root);
  let destroyed = false;

  const pdfjs = await loadPdfjs();
  await import('pdfjs-dist/web/pdf_viewer.css');
  const data = new Uint8Array(await rec.blob.arrayBuffer());
  const task = pdfjs.getDocument({ data, isEvalSupported: false });
  task.onPassword = async (update, reason) => {
    const pw = await promptDialog('PDF protégé', reason === 2 ? 'Mot de passe incorrect, réessayez' : 'Saisissez le mot de passe du document', '', 'Ouvrir');
    if (pw == null) { hooks.onBack(); return; }
    update(pw);
  };
  let doc;
  try { doc = await task.promise; } catch (e) {
    loading.replaceChildren(h('p', {}, 'Impossible d’ouvrir ce PDF.'), h('button', { class: 'btn', onclick: () => hooks.onBack() }, 'Retour'));
    return { flush() {}, destroy() { destroyed = true; } };
  }
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

  const menu = () => [
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
  let scale = 1, fit = true, cur = 1;
  const fitScale = () => Math.max(0.25, Math.min(4, (scroller.clientWidth - 16) / sizes[0][0]));

  for (let i = 0; i < N; i++) {
    const el = h('div', { class: 'pdf-page', 'data-n': i + 1, 'aria-label': `Page ${i + 1}` });
    els.push(el); pagesEl.append(el);
  }
  function layout() {
    els.forEach((el, i) => { el.style.width = sizes[i][0] * scale + 'px'; el.style.height = sizes[i][1] * scale + 'px'; });
  }

  async function renderPage(i) {
    const st = state[i];
    if (destroyed || st.done === scale || st.busy === scale) return;
    st.busy = scale;
    const my = scale;
    try {
      const page = await doc.getPage(i + 1);
      const vp = page.getViewport({ scale: my });
      sizes[i] = [vp.width / my, vp.height / my];
      const el = els[i];
      el.style.width = vp.width + 'px'; el.style.height = vp.height + 'px';
      let k = Math.min(devicePixelRatio || 1, 2);
      while (vp.width * k * vp.height * k > 14e6) k *= 0.85;
      const canvas = h('canvas', { class: 'pdf-canvas' });
      canvas.width = Math.floor(vp.width * k); canvas.height = Math.floor(vp.height * k);
      canvas.style.width = '100%'; canvas.style.height = '100%';
      const rt = page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: my * k }), canvas });
      st.task = rt;
      await rt.promise;
      if (destroyed || my !== scale) { st.busy = 0; return; }
      const tl = h('div', { class: 'textLayer' });
      tl.style.setProperty('--scale-factor', my); tl.style.setProperty('--total-scale-factor', my);
      el.replaceChildren(canvas, tl);
      st.done = my; st.busy = 0;
      try { await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: vp }).render(); } catch { /* texte indisponible */ }
      if (i === 0 && !rec.thumb) makeThumb(canvas);
    } catch (e) {
      st.busy = 0;
      if (e?.name !== 'RenderingCancelledException') console.warn('PDF page', i + 1, e);
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
    if (c !== cur) { cur = c; pageLabel.textContent = `${cur} / ${N}`; }
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

  const onResize = () => { if (fit) applyScale(); };
  addEventListener('resize', onResize);
  const onKey = (e) => { if (e.key === 'PageDown' || e.key === 'ArrowRight') goTo(cur + 1); else if (e.key === 'PageUp' || e.key === 'ArrowLeft') goTo(cur - 1); else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch(); } };
  document.addEventListener('keydown', onKey);

  applyScale();
  // tailles réelles des autres pages (documents à formats mixtes)
  (async () => {
    for (let i = 1; i < Math.min(N, 300) && !destroyed; i++) {
      const vp = (await doc.getPage(i + 1)).getViewport({ scale: 1 });
      if (Math.abs(vp.width - sizes[i][0]) > 1 || Math.abs(vp.height - sizes[i][1]) > 1) { sizes[i] = [vp.width, vp.height]; if (!state[i].done) { els[i].style.width = vp.width * scale + 'px'; els[i].style.height = vp.height * scale + 'px'; } }
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
