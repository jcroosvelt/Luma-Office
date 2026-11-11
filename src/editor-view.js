// Écran d'édition : éditeur, pagination visuelle, zoom, recherche, boîtes de dialogue, enregistrement auto.
import { Editor, findParentNode } from '@tiptap/core';
import { TableMap } from '@tiptap/pm/tables';
import { NodeSelection } from '@tiptap/pm/state';
import { describeSelection, describeAt } from './fmtinfo.js';
import { DATE_FORMATS, formatDate } from './datefmt.js';
import { buildShape, svgToSrc, SHAPES, DEFAULT_SHAPE } from './shapes.js';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableRow, TableHeader } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';

import { Endnote, TextBox, DateField, ParagraphFormat, PageBreak, ColumnBreak, LumaImage, LumaCell, SearchReplace, searchKey, TableOfContents, CommentMark, InsertionMark, DeletionMark, TrackChanges, collectChanges } from './extensions.js';
import { buildRibbon } from './ribbon.js';
import { h, icon, dropdown, choiceDialog, sheet, menuList, toast, promptDialog, confirmDialog, saveBlob, shareBlob, safeName, applyTheme } from './ui.js';
import { MOTIFS, motifIcon, artBorderSvg, svgDataUrl } from './borders.js';
import { applyPageVars, metrics, mergeSettings, PAGE_SIZES, MARGIN_PRESETS, CM_PX, NUMBER_FORMATS, pageNumberText, WATERMARK_PRESETS, BORDER_STYLES, columnWidthCm } from './layout.js';
import { putDoc, pref, persist, newId } from './storage.js';
import { openAbout } from './about.js';
import { buildDocx, DOCX_MIME } from './export-docx.js';
import { buildPdf, printDocument } from './export-pdf.js';

const PALETTE = [
  ['#000000', '#262626', '#595959', '#7f7f7f', '#a6a6a6', '#bfbfbf', '#d9d9d9', '#eeeeee', '#f5f5f5', '#ffffff'],
  ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'],
  ['#f4b6b6', '#ffd9a0', '#fff2a8', '#d4edb4', '#b4e5d0', '#b9e3f7', '#b8cdf2', '#d3c4ec', '#f3c1e0', '#e2d2b8'],
  ['#e57373', '#ffb74d', '#fff176', '#aed581', '#4db6ac', '#4fc3f7', '#7986cb', '#ba68c8', '#f06292', '#a1887f'],
];
const SYMBOLS = '© ® ™ € £ ¥ $ ¢ § ¶ † ‡ ° ± × ÷ ≠ ≈ ≤ ≥ ∞ ½ ¼ ¾ ‰ µ π Ω Σ Δ « » “ ” ‘ ’ – — … • · ◦ ▪ ✓ ✗ ★ ☆ → ← ↑ ↓ ⇒ ⇔ ☎ ✉ ® æ œ Æ Œ ç Ç é è ê à â ù û î ô'.split(' ');

export function mountEditor(host, docRec, hooks) {
  let settings = mergeSettings(docRec.settings);
  let title = docRec.title || 'Document sans titre';
  const pm = pref.get('mode', 'auto');
  let mode = pm === 'page' || pm === 'reflow' ? pm : innerWidth < 700 ? 'reflow' : 'page';
  let zoomMode = 'fit';
  let pageCount = 1;
  let spell = pref.get('spell', true);
  let theme = pref.get('theme', 'auto');
  let saveTimer, layoutRaf, lastSig = '';
  let dirty = false, discarded = false, lastSaved = null;
  let reader = false, showWc = pref.get('wc', true), ready = false;
  let destroyed = false;
  let persisted = false;
  let inlineTimer;
  let comments = (docRec.comments || []).map((c) => ({ replies: [], resolved: false, ...c }));

  /* ---------- DOM ---------- */
  const titleInput = h('input', { class: 'title-input', value: title, 'aria-label': 'Titre du document', placeholder: 'Document sans titre', enterkeyhint: 'done',
    onchange: () => { title = titleInput.value.trim() || 'Document sans titre'; titleInput.value = title; scheduleSave(); },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); titleInput.blur(); editor.commands.focus(); } } });
  const saveState = h('span', { class: 'save-state' }, 'Enregistré');
  const undoBtn = h('button', { class: 'icon-btn', 'aria-label': 'Annuler', onmousedown: (e) => e.preventDefault(), onclick: () => editor.chain().focus().undo().run() }, icon('undo', 22));
  const redoBtn = h('button', { class: 'icon-btn redo-btn', 'aria-label': 'Rétablir', onmousedown: (e) => e.preventDefault(), onclick: () => editor.chain().focus().redo().run() }, icon('redo', 22));
  const saveBtn = h('button', { class: 'save-btn', 'aria-label': 'Enregistrer le document', title: 'Enregistrer (Ctrl+S)', onclick: () => manualSave() }, icon('save', 20), h('span', {}, 'Enregistrer'));
  const topbar = h('header', { class: 'topbar' },
    h('button', { class: 'mark-btn', 'aria-label': 'Mes documents', title: 'Mes documents', onclick: () => leave() }, h('img', { src: './icons/icon-192.png', alt: 'Luma Office' })),
    titleInput, saveState, saveBtn,
    h('button', { class: 'exp-btn', 'aria-label': 'Exporter en Word', title: 'Exporter en Word (.docx)', onclick: () => exportDocx() }, icon('word', 20), h('span', {}, 'Word')),
    h('button', { class: 'exp-btn', 'aria-label': 'Exporter en PDF', title: 'Exporter en PDF', onclick: () => exportPdf() }, icon('pdf', 20), h('span', {}, 'PDF')),
    undoBtn, redoBtn,
    h('button', { class: 'icon-btn', 'aria-label': 'Menu fichier', onclick: () => openFileMenu() }, icon('more', 22)));

  const pmHost = h('div', { class: 'pm-host' });
  const overlay = h('div', { class: 'hf-layer', 'aria-hidden': 'true' });
  const sheetEl = h('div', { class: 'paper' }, overlay, pmHost);
  const stage = h('div', { class: 'stage' }, sheetEl);
  const scroller = h('main', { class: 'scroller' }, stage);
  const findBar = h('div', { class: 'findbar', hidden: true });
  const statusbar = h('footer', { class: 'statusbar' });
  const sbLeft = h('div', { class: 'sb-left' });
  const root = h('div', { class: 'editor-view' });

  /* ---------- Éditeur ---------- */
  const editor = new Editor({
    element: pmHost,
    content: docRec.json || docRec.html || { type: 'doc', content: [{ type: 'paragraph' }] },
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow' } } }),
      TextStyleKit.configure({ lineHeight: false }),
      Highlight.configure({ multicolor: true }),
      Subscript, Superscript,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }), TableRow, TableHeader, LumaCell,
      LumaImage.configure({ inline: true, allowBase64: true }),
      TaskList, TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Commencez à écrire…' }),
      CharacterCount, Endnote, TextBox, DateField, ParagraphFormat, PageBreak, ColumnBreak, SearchReplace, TableOfContents, CommentMark, InsertionMark, DeletionMark, TrackChanges,
    ],
    editorProps: {
      attributes: { class: 'doc-content', spellcheck: String(spell), lang: settings.lang.split('-')[0], autocapitalize: 'sentences', 'aria-label': 'Contenu du document', role: 'textbox', 'aria-multiline': 'true' },
      handlePaste(view, event) {
        const f = [...(event.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
        if (f) { insertImage(f); return true; }
        return false;
      },
      handleDrop(view, event) {
        const f = [...(event.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
        if (f) { event.preventDefault(); insertImage(f); return true; }
        return false;
      },
    },
    onUpdate: () => { scheduleSave(); scheduleLayout(); scheduleInline(); },
    onSelectionUpdate: () => ribbon.refresh(),
    onTransaction: ({ transaction }) => {
      if (!ready) return;
      if (transaction.docChanged) hideTip(); else if (transaction.selectionSet && editor.isFocused) showCaretTip();
      ribbon.refresh(); updateStatus(); scheduleHandles(); updatePill(); undoBtn.disabled = !editor.can().undo(); redoBtn.disabled = !editor.can().redo(); },
  });

  /* ---------- app : API partagée avec le ruban ---------- */
  const app = {
    editor,
    get settings() { return settings; },
    get mode() { return mode; },
    get spell() { return spell; },
    get theme() { return theme; },
    get tracking() { return editor.storage.trackChanges.enabled; },
    get commentCount() { return comments.filter((c) => !c.resolved).length; },
    addComment, openComments, toggleTrack, resolveChange, insertToc, openColWidth,
    updateSettings, pickColor, pickImage, sizeImage, editAlt, openLink, openTableSheet, openSymbols, openSpacing,
    openSizeSheet, openMarginSheet, openHeaderSheet, openColumnsSheet, openNumberSheet, openWatermarkSheet, openBordersSheet, toggleFind, openStats, toggleSpell,
    zoomBy, zoomFit, setMode,
    insertBlankPage, openDateSheet, openEndnote, toggleDropCap, openTextBoxSheet, setTextBox, removeTextBox, openShapesSheet,
    get TB_PRESETS() { return TB_PRESETS; },
    moveImageBlock, openWrapSheet, toggleReader, openReadSettings, toggleThumbs, openTiles, openGoto, toggleWordCount,
    get reader() { return reader; }, get showWc() { return showWc; }, get thumbsOpen() { return !!thumbsPane; },
    get dropCapOn() { return !!editor.getAttributes('paragraph').dropCap; },
    get shapeSelected() { return !!selImage()?.node.attrs.shape; },
    cycleTheme() { theme = { auto: 'light', light: 'dark', dark: 'auto' }[theme]; pref.set('theme', theme); applyTheme(theme); ribbon.refresh(); },
  };
  const ribbon = buildRibbon(app);

  const pill = h('button', { class: 'cmt-pill', hidden: true, onclick: () => openComments(pill.dataset.id) });
  const colLayer = h('div', { class: 'col-layer' });
  sheetEl.append(colLayer);
  root.append(topbar, findBar, scroller, pill, ribbon.el, statusbar);
  host.replaceChildren(root);
  applyTheme(theme);

  /* ---------- Enregistrement automatique ---------- */
  // Enregistrement automatique : toutes les minutes tant qu'il y a des modifications,
  // et aussi quand l'application passe en arrière-plan ou que l'on quitte le document.
  const AUTOSAVE_MS = 60000;
  const stamp = () => (lastSaved ? lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');
  function renderSaveState() {
    saveState.classList.toggle('busy', dirty);
    saveState.textContent = dirty ? 'Non enregistré' : lastSaved ? `Enregistré ${stamp()}` : 'Enregistré';
  }
  function scheduleSave(delay) { // marque le document comme modifié ; delay : enregistrement immédiat différé (ms)
    dirty = true; renderSaveState();
    if (delay !== undefined) { clearTimeout(saveTimer); saveTimer = setTimeout(save, delay); }
  }
  async function save() {
    clearTimeout(saveTimer);
    if (destroyed || discarded) return;
    dirty = false;
    const text = editor.getText({ blockSeparator: ' ' }).trim();
    docRec = { ...docRec, title, json: editor.getJSON(), settings, comments, updated: Date.now(), preview: text.slice(0, 160), words: editor.storage.characterCount.words() };
    try {
      await putDoc(docRec);
      lastSaved = new Date();
      if (!persisted) persist().then((ok) => { persisted = ok; });
    } catch (err) {
      dirty = true;
      toast(err?.name === 'QuotaExceededError' ? 'Espace de stockage plein : supprimez des documents ou des images.' : 'Impossible d’enregistrer le document sur cet appareil.', 5000);
    }
    renderSaveState();
  }
  const autoTimer = setInterval(() => { if (dirty && !destroyed) save(); }, AUTOSAVE_MS);
  const onHide = () => { if (document.visibilityState === 'hidden' && dirty) save(); };
  const onPageHide = () => { if (dirty) save(); };
  // quitter l'onglet / recharger la page avec des modifications non enregistrées : le navigateur demande confirmation
  const onBeforeUnload = (e) => { if (dirty && !discarded) { e.preventDefault(); e.returnValue = ''; return ''; } return undefined; };
  document.addEventListener('visibilitychange', onHide);
  addEventListener('pagehide', onPageHide);
  addEventListener('beforeunload', onBeforeUnload);

  async function leave() {
    if (dirty) {
      const c = await choiceDialog('Enregistrer vos modifications ?', 'Ce document contient des modifications qui ne sont pas encore enregistrées.', [['save', 'Enregistrer et quitter', 'primary'], ['discard', 'Quitter sans enregistrer', 'danger'], ['cancel', 'Annuler']]);
      if (c === null || c === 'cancel') return;
      if (c === 'discard') { discarded = true; dirty = false; } else await save();
    }
    hooks.onBack();
  }
  async function manualSave() {
    await save();
    saveBtn.classList.add('ok');
    saveBtn.replaceChildren(icon('accept', 20), h('span', {}, 'Enregistré'));
    toast('Document enregistré sur cet appareil ✓');
    setTimeout(() => { saveBtn.classList.remove('ok'); saveBtn.replaceChildren(icon('save', 20), h('span', {}, 'Enregistrer')); }, 1800);
  }

  /* ---------- Zoom en bas à droite (comme Word) ---------- */
  const zSlider = h('input', { type: 'range', class: 'zoom-rng', min: '30', max: '300', step: '5', 'aria-label': 'Zoom' });
  const zPct = h('button', { class: 'zoom-pct', title: 'Ajuster à la largeur', onclick: () => zoomFit() });
  const zoomCtl = h('div', { class: 'zoom-ctl' },
    h('button', { class: 'zoom-btn', 'aria-label': 'Zoom arrière', title: 'Zoom arrière', onclick: () => zoomBy(-0.1) }, '−'),
    zSlider,
    h('button', { class: 'zoom-btn', 'aria-label': 'Zoom avant', title: 'Zoom avant', onclick: () => zoomBy(0.1) }, '+'), zPct);
  statusbar.append(sbLeft, zoomCtl);
  zSlider.addEventListener('input', () => { zoomMode = Math.max(0.3, Math.min(3, +zSlider.value / 100)); if (mode !== 'page') setMode('page'); else scheduleLayout(); zPct.textContent = zSlider.value + ' %'; });
  function updateZoomCtl() {
    const pct = Math.round(curZoom() * 100);
    if (document.activeElement !== zSlider) zSlider.value = String(Math.max(30, Math.min(300, pct)));
    zPct.textContent = pct + ' %';
  }

  /* ---------- Statistiques / barre d'état ---------- */
  function updateStatus() {
    const cc = editor.storage.characterCount;
    const words = cc.words();
    const nChanges = collectChanges(editor.state.doc).length;
    sbLeft.replaceChildren(...[
      editor.storage.trackChanges.enabled || nChanges ? h('span', { class: 'track-flag' }, `${editor.storage.trackChanges.enabled ? '● Suivi' : 'Suivi'} : ${nChanges} modif.`) : null,
      showWc ? h('button', { class: 'sb-link', title: 'Statistiques du document', onclick: () => openStats() }, `${words} mot${words > 1 ? 's' : ''}`) : null,
      showWc ? h('span', { class: 'sb-chars' }, `${cc.characters()} caractères`) : null,
      h('button', { class: 'sb-link', title: 'Aller à une page', onclick: () => openGoto() }, mode === 'page' ? `${pageCount} page${pageCount > 1 ? 's' : ''}` : 'Mode adapté'),
    ].filter(Boolean));
    updateZoomCtl();
    updatePagePill();
  }

  /* ---------- Pagination visuelle, zoom ---------- */
  const fitZoom = () => Math.max(0.3, Math.min(1.15, (scroller.clientWidth - 20) / metrics(settings).wpx));
  const curZoom = () => (mode !== 'page' || reader ? 1 : zoomMode === 'fit' ? fitZoom() : zoomMode);
  function zoomBy(d) { zoomMode = Math.max(0.3, Math.min(3, Math.round((curZoom() + d) * 100) / 100)); if (mode !== 'page') setMode('page'); else scheduleLayout(); }
  function zoomFit() { zoomMode = 'fit'; if (mode !== 'page') setMode('page'); else scheduleLayout(); }
  function setMode(m) {
    mode = m; pref.set('mode', m);
    scheduleLayout(); ribbon.refresh();
  }
  function scheduleLayout() { cancelAnimationFrame(layoutRaf); layoutRaf = requestAnimationFrame(layoutPages); }

  function applyDecor() {
    sheetEl.dataset.wm = settings.watermark.text || '';
    if (!settings.watermark.text) delete sheetEl.dataset.wm;
    sheetEl.style.setProperty('--wm-color', settings.watermark.color);
    const bs = settings.pageBorder;
    const cssBorder = bs.style === 'none' ? '' : `${bs.style === 'double' ? Math.max(3, bs.width * 2.2) : bs.width}pt ${bs.style === 'dashed' ? 'dashed' : bs.style === 'double' ? 'double' : 'solid'} ${bs.color}`;
    if (bs.style === 'none') delete sheetEl.dataset.pb; else sheetEl.dataset.pb = bs.style;
    sheetEl.style.setProperty('--pb-border', bs.style === 'art' ? 'none' : (cssBorder || 'none'));
    if (bs.style === 'art') {
      const Mx = metrics(settings);
      const svg = artBorderSvg((Mx.wcm - 2 * bs.offset) * CM_PX, (Mx.hcm - 2 * bs.offset) * CM_PX, bs.art, bs.color, (bs.artSize || 18) * (96 / 72));
      sheetEl.style.setProperty('--pb-art', svgDataUrl(svg));
    } else sheetEl.style.removeProperty('--pb-art');
    sheetEl.style.setProperty('--pb-off', bs.offset + 'cm');
  }

  function layoutPages() {
    if (destroyed) return;
    const M = applyPageVars(root, settings);
    applyDecor();
    root.classList.toggle('mode-reflow', mode !== 'page' || reader);
    if (mode !== 'page' || reader) {
      sheetEl.style.transform = '';
      sheetEl.style.minHeight = '';
      pmHost.querySelectorAll('.page-break').forEach((el) => { el.style.height = ''; });
      stage.style.width = ''; stage.style.height = '';
      overlay.replaceChildren(); lastSig = '';
      pageCount = Math.max(1, Math.ceil(pmHost.offsetHeight / M.contentHpx));
      updateStatus();
      return;
    }
    const z = curZoom();
    sheetEl.style.transform = `scale(${z})`;
    const H = M.hpx;
    const top = () => sheetEl.getBoundingClientRect().top;
    const pbs = [...pmHost.querySelectorAll('.page-break')];
    pbs.forEach((el) => { el.style.height = '0px'; });
    for (const el of pbs) {
      const t = (el.getBoundingClientRect().top - top()) / z;
      const next = (Math.floor(t / H) + 1) * H + M.mtpx;
      el.style.height = Math.max(0, next - t) + 'px';
    }
    const bottom = (pmHost.getBoundingClientRect().bottom - top()) / z + M.mbpx;
    pageCount = Math.max(1, Math.ceil((bottom - 1) / H));
    sheetEl.style.minHeight = pageCount * H + 'px';
    stage.style.width = M.wpx * z + 'px';
    stage.style.height = pageCount * H * z + 'px';

    const sig = [pageCount, JSON.stringify(settings)].join('|');
    const bs = settings.pageBorder;
    const cssBorder = bs.style === 'none' ? '' : `${bs.style === 'double' ? Math.max(3, bs.width * 2.2) : bs.width}pt ${bs.style === 'dashed' ? 'dashed' : bs.style === 'double' ? 'double' : 'solid'} ${bs.color}`;
    if (sig !== lastSig) {
      lastSig = sig;
      const kids = [];
      const wm = settings.watermark.text.trim();
      const wmSize = wm ? Math.min(190, (M.wpx * 1.05) / (wm.length * 0.62)) : 0;
      for (let i = 0; i < pageCount; i++) {
        if (i > 0) kids.push(h('div', { class: 'page-sep', style: { top: i * H + 'px' } }, h('span', {}, `Page ${i + 1}`)));
        if (wm) kids.push(h('div', { class: 'wm', style: { top: i * H + 'px', height: H + 'px' } }, h('span', { style: { color: settings.watermark.color, fontSize: wmSize + 'px' } }, wm)));
        if (bs.style === 'art') kids.push(h('div', { class: 'pborder art', style: { top: i * H + bs.offset * CM_PX + 'px', left: bs.offset * CM_PX + 'px', width: M.wpx - 2 * bs.offset * CM_PX + 'px', height: H - 2 * bs.offset * CM_PX + 'px' }, html: artBorderSvg(M.wpx - 2 * bs.offset * CM_PX, H - 2 * bs.offset * CM_PX, bs.art, bs.color, (bs.artSize || 18) * (96 / 72)) }));
        else if (bs.style !== 'none') kids.push(h('div', { class: 'pborder', style: { top: i * H + bs.offset * CM_PX + 'px', left: bs.offset * CM_PX + 'px', right: bs.offset * CM_PX + 'px', height: H - 2 * bs.offset * CM_PX + 'px', border: cssBorder } }));
        const hideHF = settings.firstPageDifferent && i === 0;
        if (hideHF) continue;
        const pn = settings.pageNumbers ? h('div', { class: 'pn', style: { textAlign: settings.pageNumberAlign } }, pageNumberText(settings.pageNumberFormat, i + 1, pageCount)) : null;
        const top = [settings.header.trim() ? h('div', { style: { textAlign: settings.headerAlign } }, settings.header) : null, settings.pageNumberPos === 'top' ? pn : null].filter(Boolean);
        const bottom = [settings.footer.trim() ? h('div', { style: { textAlign: settings.footerAlign } }, settings.footer) : null, settings.pageNumberPos !== 'top' ? pn : null].filter(Boolean);
        if (top.length) kids.push(h('div', { class: 'hf hf-head', style: { top: i * H + M.mtpx / 2 - 9 * top.length + 'px' } }, top));
        if (bottom.length) kids.push(h('div', { class: 'hf hf-foot', style: { top: (i + 1) * H - M.mbpx / 2 - 8 * bottom.length + 'px' } }, bottom));
      }
      overlay.replaceChildren(...kids);
    }
    updateStatus();
    scheduleHandles();
  }

  const ro = new ResizeObserver(() => scheduleLayout());
  ro.observe(pmHost);
  ro.observe(scroller);
  document.fonts?.ready.then(scheduleLayout);

  // Pincer pour zoomer (mode page)
  let pinch = null;
  const dist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  scroller.addEventListener('touchstart', (e) => { if (e.touches.length === 2 && mode === 'page') pinch = { d: dist(e), z: curZoom() }; }, { passive: true });
  scroller.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      zoomMode = Math.max(0.3, Math.min(3, pinch.z * (dist(e) / pinch.d)));
      scheduleLayout();
    }
  }, { passive: false });
  scroller.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });
  scroller.addEventListener('pointerdown', (e) => {
    if ([scroller, stage, sheetEl, overlay].includes(e.target)) setTimeout(() => editor.commands.focus('end'), 0);
  });

  // Clavier virtuel : le ruban reste collé au-dessus du clavier
  const vv = window.visualViewport;
  const fitViewport = () => {
    if (!vv) return;
    root.style.height = vv.height + 'px';
    root.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
    scheduleLayout();
  };
  vv?.addEventListener('resize', fitViewport);
  vv?.addEventListener('scroll', fitViewport);
  fitViewport();
  addEventListener('resize', scheduleLayout);

  /* ---------- Raccourcis clavier (tablettes avec clavier) ---------- */
  const onKey = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); manualSave(); }
    else if (k === 'f') { e.preventDefault(); toggleFind(true); }
    else if (k === 'p') { e.preventDefault(); doPrint(); }
  };
  document.addEventListener('keydown', onKey);

  /* ---------- Réglages de page ---------- */
  function updateSettings(patch) {
    settings = mergeSettings({
      ...settings, ...patch,
      margins: { ...settings.margins, ...(patch.margins || {}) },
      columns: { ...settings.columns, ...(patch.columns || {}) },
      watermark: { ...settings.watermark, ...(patch.watermark || {}) },
      pageBorder: { ...settings.pageBorder, ...(patch.pageBorder || {}) },
    });
    editor.view.dom.setAttribute('lang', settings.lang.split('-')[0]);
    lastSig = '';
    scheduleLayout(); scheduleSave(); ribbon.refresh();
  }
  function toggleSpell() {
    spell = !spell; pref.set('spell', spell);
    editor.view.dom.setAttribute('spellcheck', String(spell));
    editor.view.dom.blur(); setTimeout(() => editor.commands.focus(), 50);
    ribbon.refresh(); toast(spell ? 'Correcteur orthographique activé' : 'Correcteur orthographique désactivé');
  }

  // ----- aides d'interface -----
  const cmField = (label, value, onchange, { min = 0, max = 15, step = 0.1 } = {}) => h('label', { class: 'num' }, label,
    h('input', { type: 'number', step: String(step), min: String(min), max: String(max), inputmode: 'decimal', value: String(value), class: 'field', onchange: (e) => onchange(Math.max(min, Math.min(max, parseFloat(String(e.target.value).replace(',', '.')) || 0))) }));
  const switchRow = (label, get, set, hint) => {
    const b = h('button', { type: 'button', role: 'switch', class: 'switch', 'aria-checked': String(!!get()), onclick: () => { const v = !(b.getAttribute('aria-checked') === 'true'); b.setAttribute('aria-checked', String(v)); set(v); } }, h('i', {}));
    return h('div', { class: 'srow plain' }, h('div', { class: 'srow-t' }, h('b', {}, label), hint ? h('small', {}, hint) : null), h('div', { class: 'srow-c' }, b));
  };
  const swatches = (colors, get, set) => {
    const wrap = h('div', { class: 'swrow s8' }, colors.map((c) => h('button', { type: 'button', class: 'sw' + (get().toLowerCase() === c ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: () => { set(c); wrap.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x.getAttribute('aria-label') === c)); } })));
    return wrap;
  };
  const miniPage = (inner) => `<svg viewBox="0 0 40 52" width="34" height="44" aria-hidden="true"><rect x="1" y="1" width="38" height="50" rx="2" fill="#fff" stroke="currentColor" stroke-width="2"/>${inner}</svg>`;
  const choiceCards = (items, get, set) => {
    const wrap = h('div', { class: 'ccards' }, items.map(([v, label, sub, svg]) => {
      const b = h('button', { type: 'button', class: 'ccard' + (get() === v ? ' on' : ''), onclick: () => { set(v); wrap.querySelectorAll('.ccard').forEach((c) => c.classList.remove('on')); b.classList.add('on'); } },
        h('span', { class: 'ccard-ic', html: svg }), h('b', {}, label), sub ? h('small', {}, sub) : null);
      return b;
    }));
    return wrap;
  };
  const radioList = (opts, get, set) => h('div', { class: 'choice' }, opts.map(([v, l]) => {
    const b = h('button', { type: 'button', class: 'chip' + (get() === v ? ' on' : ''), onclick: () => { set(v); b.parentNode.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); b.classList.add('on'); } }, l);
    return b;
  }));
  const GRAYS = ['#b8bfcc', '#8a93a6', '#d92d20', '#fc9a0b', '#0157e0', '#1a7f37', '#001e6c', '#000000'];

  // ----- Taille et orientation -----
  function openSizeSheet() {
    const cw = cmField('Largeur (cm)', settings.customW, (v) => updateSettings({ size: 'custom', customW: v }), { min: 5, max: 100 });
    const ch = cmField('Hauteur (cm)', settings.customH, (v) => updateSettings({ size: 'custom', customH: v }), { min: 5, max: 100 });
    const custom = h('div', { class: 'grid2' }, cw, ch);
    sheet('Taille et orientation', h('div', { class: 'form' },
      h('h3', {}, 'Orientation'),
      choiceCards([['portrait', 'Portrait', null, miniPage('<path d="M8 12h24M8 18h24M8 24h24M8 30h16" stroke="currentColor" stroke-width="2"/>')], ['landscape', 'Paysage', null, '<svg viewBox="0 0 52 40" width="44" height="34"><rect x="1" y="1" width="50" height="38" rx="2" fill="#fff" stroke="currentColor" stroke-width="2"/><path d="M8 11h36M8 17h36M8 23h24" stroke="currentColor" stroke-width="2"/></svg>']], () => settings.orientation, (v) => updateSettings({ orientation: v })),
      h('h3', {}, 'Taille du papier'),
      radioList([...Object.entries(PAGE_SIZES).map(([k, v]) => [k, v.label]), ['custom', 'Personnalisée…']], () => settings.size, (v) => { updateSettings({ size: v }); custom.hidden = v !== 'custom'; }),
      custom));
    custom.hidden = settings.size !== 'custom';
  }

  // ----- Marges -----
  function openMarginSheet() {
    const fields = {};
    const mk = (k, l) => { const f = cmField(l, settings.margins[k], (v) => updateSettings({ margins: { [k]: v } })); fields[k] = f.querySelector('input'); return f; };
    const cards = Object.entries(MARGIN_PRESETS).map(([k, p]) => [k, p.label, p.sub, miniPage(`<rect x="${4 + p.v.left * 2.2}" y="${4 + p.v.top * 2.2}" width="${32 - (p.v.left + p.v.right) * 2.2}" height="${44 - (p.v.top + p.v.bottom) * 2.2}" fill="none" stroke="currentColor" stroke-dasharray="3 2" stroke-width="1.6"/>`)]);
    const current = () => Object.entries(MARGIN_PRESETS).find(([, p]) => JSON.stringify(p.v) === JSON.stringify(settings.margins))?.[0];
    const grid = h('div', { class: 'grid2' }, mk('top', 'Haut (cm)'), mk('bottom', 'Bas (cm)'), mk('left', 'Gauche (cm)'), mk('right', 'Droite (cm)'));
    const gut = cmField('Reliure (cm)', settings.gutter, (v) => updateSettings({ gutter: v }), { max: 5 });
    sheet('Marges', h('div', { class: 'form' },
      choiceCards(cards, current, (k) => { updateSettings({ margins: MARGIN_PRESETS[k].v }); Object.entries(MARGIN_PRESETS[k].v).forEach(([kk, vv]) => { fields[kk].value = vv; }); }),
      h('h3', {}, 'Marges personnalisées'), grid,
      h('h3', {}, 'Reliure'), gut, h('p', { class: 'muted small' }, 'La marge de reliure s’ajoute à la marge gauche (pour relier ou perforer).')));
  }

  // ----- Colonnes -----
  function openColumnsSheet() {
    const colIcon = (n) => miniPage(Array.from({ length: n }, (_, i) => { const w = (32 - (n - 1) * 3) / n; const x = 4 + i * (w + 3); return `<rect x="${x}" y="8" width="${w}" height="36" rx="1" fill="currentColor" opacity=".35"/>`; }).join(''));
    const info = h('p', { class: 'muted small' });
    const refresh = () => { info.textContent = `Largeur de chaque colonne : ${columnWidthCm(settings).toFixed(1).replace('.', ',')} cm. L’aperçu affiche les colonnes en continu ; l’export Word et PDF les répartit page par page.`; };
    refresh();
    const gap = cmField('Espace entre colonnes (cm)', settings.columns.gap, (v) => { updateSettings({ columns: { gap: v } }); refresh(); }, { max: 5 });
    sheet('Colonnes', h('div', { class: 'form' },
      choiceCards([[1, 'Une', null, colIcon(1)], [2, 'Deux', null, colIcon(2)], [3, 'Trois', null, colIcon(3)], [4, 'Quatre', null, colIcon(4)]], () => settings.columns.count, (v) => { updateSettings({ columns: { count: v } }); refresh(); }),
      gap,
      switchRow('Ligne entre les colonnes', () => settings.columns.rule, (v) => updateSettings({ columns: { rule: v } })),
      h('button', { class: 'btn', onclick: () => { editor.chain().focus().insertColumnBreak().run(); toast('Saut de colonne inséré'); } }, icon('colbreak', 18), 'Insérer un saut de colonne ici'),
      info));
  }

  // ----- En-tête et pied de page -----
  function openHeaderSheet() {
    const hd = h('input', { class: 'field', value: settings.header, placeholder: 'Texte en haut de chaque page', oninput: (e) => updateSettings({ header: e.target.value }) });
    const ft = h('input', { class: 'field', value: settings.footer, placeholder: 'Texte en bas de chaque page', oninput: (e) => updateSettings({ footer: e.target.value }) });
    sheet('En-tête et pied de page', h('div', { class: 'form' },
      h('label', {}, 'En-tête', hd),
      radioList([['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']], () => settings.headerAlign, (v) => updateSettings({ headerAlign: v })),
      h('label', {}, 'Pied de page', ft),
      radioList([['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']], () => settings.footerAlign, (v) => updateSettings({ footerAlign: v })),
      switchRow('Première page différente', () => settings.firstPageDifferent, (v) => updateSettings({ firstPageDifferent: v }), 'Pas d’en-tête, de pied de page ni de numéro sur la première page (page de garde).'),
      h('button', { class: 'btn', onclick: () => openNumberSheet() }, icon('hash', 18), 'Numéros de page…')));
  }

  // ----- Numéros de page -----
  function openNumberSheet() {
    sheet('Numéros de page', h('div', { class: 'form' },
      switchRow('Numéroter les pages', () => settings.pageNumbers, (v) => updateSettings({ pageNumbers: v })),
      h('h3', {}, 'Position'),
      radioList([['bottom', 'Bas de page'], ['top', 'Haut de page']], () => settings.pageNumberPos, (v) => updateSettings({ pageNumberPos: v })),
      h('h3', {}, 'Alignement'),
      radioList([['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']], () => settings.pageNumberAlign, (v) => updateSettings({ pageNumberAlign: v })),
      h('h3', {}, 'Format'),
      radioList(Object.entries(NUMBER_FORMATS), () => settings.pageNumberFormat, (v) => updateSettings({ pageNumberFormat: v }))));
  }

  // ----- Filigrane -----
  function openWatermarkSheet() {
    const txt = h('input', { class: 'field', value: settings.watermark.text, placeholder: 'Texte du filigrane', maxlength: '40', oninput: (e) => updateSettings({ watermark: { text: e.target.value } }) });
    sheet('Filigrane', h('div', { class: 'form' },
      h('label', {}, 'Texte', txt),
      h('div', { class: 'choice' }, WATERMARK_PRESETS.map((t) => h('button', { type: 'button', class: 'chip', onclick: () => { txt.value = t; updateSettings({ watermark: { text: t } }); } }, t))),
      h('h3', {}, 'Couleur'), swatches(GRAYS, () => settings.watermark.color, (c) => updateSettings({ watermark: { color: c } })),
      h('div', { class: 'row end' }, h('button', { class: 'btn danger', onclick: () => { txt.value = ''; updateSettings({ watermark: { text: '' } }); toast('Filigrane supprimé'); } }, 'Supprimer le filigrane')),
      h('p', { class: 'muted small' }, 'Le filigrane apparaît en diagonale sur chaque page : aperçu, PDF et impression.')));
  }

  // ----- Bordures de page (traits et motifs décoratifs) -----
  function openBordersSheet() {
    const PALETTE = ['#e0245e', '#d92d20', '#fc9a0b', '#f2b705', '#2e9e44', '#1ab5c9', '#0157e0', '#001e6c', '#7b4de0', '#ec6ba6', '#8a93a6', '#000000'];
    const motifWrap = h('div', { class: 'motifs' });
    const lineBox = h('div', { class: 'grid2' });
    const artBox = h('div', { class: 'form' });
    const drawMotifs = () => {
      motifWrap.replaceChildren(...Object.entries(MOTIFS).map(([id, m]) => h('button', {
        type: 'button', class: 'motif' + (settings.pageBorder.style === 'art' && settings.pageBorder.art === id ? ' on' : ''),
        onclick: () => {
          const same = settings.pageBorder.art === id && settings.pageBorder.style === 'art';
          updateSettings({ pageBorder: { style: 'art', art: id, color: same ? settings.pageBorder.color : m.color } });
          drawMotifs(); sync(); chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
        },
      }, h('span', { html: motifIcon(id, settings.pageBorder.style === 'art' && settings.pageBorder.art === id ? settings.pageBorder.color : m.color, 38) }), h('small', {}, m.label))));
    };
    const chips = radioList(Object.entries(BORDER_STYLES), () => (settings.pageBorder.style === 'art' ? '' : settings.pageBorder.style), (v) => { updateSettings({ pageBorder: { style: v } }); drawMotifs(); sync(); });
    const colors = swatches(PALETTE, () => settings.pageBorder.color, (c) => { updateSettings({ pageBorder: { color: c } }); drawMotifs(); });
    lineBox.append(
      cmField('Épaisseur (pt)', settings.pageBorder.width, (v) => updateSettings({ pageBorder: { width: v } }), { min: 0.5, max: 8, step: 0.5 }),
      cmField('Distance du bord (cm)', settings.pageBorder.offset, (v) => updateSettings({ pageBorder: { offset: v } }), { min: 0.3, max: 3 }));
    artBox.append(
      cmField('Taille des motifs (pt)', settings.pageBorder.artSize, (v) => updateSettings({ pageBorder: { artSize: v } }), { min: 10, max: 40, step: 1 }),
      cmField('Distance du bord (cm)', settings.pageBorder.offset, (v) => updateSettings({ pageBorder: { offset: v } }), { min: 0.3, max: 3 }));
    const sync = () => { const art = settings.pageBorder.style === 'art'; artBox.hidden = !art; lineBox.hidden = art || settings.pageBorder.style === 'none'; };
    sheet('Bordures de page', h('div', { class: 'form' },
      h('h3', {}, 'Trait'), chips,
      h('h3', {}, 'Motifs décoratifs'), motifWrap,
      h('h3', {}, 'Couleur'), colors, lineBox, artBox,
      h('p', { class: 'muted small' }, 'Dans Word, les motifs sont exportés comme bordures artistiques de Word (leurs couleurs d’origine peuvent différer).')));
    drawMotifs(); sync();
  }

  /* ---------- Interligne / espacement ---------- */
  function openSpacing() {
    const a = editor.getAttributes(editor.isActive('heading') ? 'heading' : 'paragraph');
    const set = (p) => editor.chain().focus().setParagraphProps(p).run();
    const pickDd = (vals, cur, auto, key) => { let c = String(cur ?? ''); return dropdown({ cls: 'full', options: [['', auto], ...vals.map((v) => [String(v), v + ' pt'])], get: () => c, set: (v) => { c = v; set({ [key]: v === '' ? null : +v }); } }).el; };
    const before = pickDd([0, 6, 12, 18, 24, 36], a.spaceBefore, 'Automatique', 'spaceBefore');
    const after = pickDd([0, 4, 6, 10, 12, 18, 24, 36], a.spaceAfter, 'Automatique (8 pt)', 'spaceAfter');
    sheet('Interligne et espacement', h('div', { class: 'form' },
      h('h3', {}, 'Interligne'),
      radioList([['1', '1,0'], ['1.15', '1,15'], ['1.5', '1,5'], ['2', '2,0'], ['2.5', '2,5'], ['3', '3,0']],
        () => (a.lineHeight ? String(a.lineHeight) : '1.15'), (v) => set({ lineHeight: v === '1.15' ? null : v })),
      h('label', {}, 'Espacement avant le paragraphe', before),
      h('label', {}, 'Espacement après le paragraphe', after),
      h('h3', {}, 'Retraits'),
      h('label', {}, 'Retrait gauche', dropdown({ cls: 'full', options: Array.from({ length: 11 }, (_, i) => [String(i), i ? `Niveau ${i} (${(i * 1.27).toFixed(2).replace('.', ',')} cm)` : 'Aucun']), get: () => String(a.indent || 0), set: (v) => set({ indent: +v }) }).el),
      h('label', {}, 'Retrait droit', dropdown({ cls: 'full', options: [0, 0.5, 1, 1.5, 2, 3, 4, 5].map((c) => [String(c), c ? `${String(c).replace('.', ',')} cm` : 'Aucun']), get: () => String(a.indentRight ? Math.round((a.indentRight / 28.35) * 2) / 2 : 0), set: (v) => set({ indentRight: +v ? Math.round(+v * 28.35) : null }) }).el)));
  }

  /* ---------- Couleurs ---------- */
  function pickColor(kind) {
    const title2 = { text: 'Couleur du texte', highlight: 'Surlignage', cell: 'Fond de cellule' }[kind];
    let s;
    const apply = (c) => {
      const ch = editor.chain().focus();
      if (kind === 'text') (c ? ch.setColor(c) : ch.unsetColor()).run();
      else if (kind === 'highlight') (c ? ch.setHighlight({ color: c }) : ch.unsetHighlight()).run();
      else ch.setCellAttribute('backgroundColor', c || null).run();
      if (c) { const r = [c, ...pref.get('recent', []).filter((x) => x !== c)].slice(0, 10); pref.set('recent', r); }
      s.close();
    };
    const sw = (c) => h('button', { class: 'sw', style: { background: c }, 'aria-label': c, onclick: () => apply(c) });
    const recent = pref.get('recent', []);
    const custom = h('input', { type: 'color', class: 'colorin', value: '#0b63e5', onchange: (e) => apply(e.target.value) });
    s = sheet(title2, h('div', { class: 'form' },
      h('button', { class: 'btn', onclick: () => apply(null) }, kind === 'text' ? 'Automatique (noir)' : 'Aucune couleur'),
      PALETTE.map((row) => h('div', { class: 'swrow' }, row.map(sw))),
      recent.length ? [h('h3', {}, 'Récentes'), h('div', { class: 'swrow' }, recent.map(sw))] : null,
      h('label', { class: 'row' }, 'Couleur personnalisée', custom)));
  }

  /* ---------- Lien ---------- */
  function openLink() {
    const has = editor.isActive('link');
    const cur = has ? editor.getAttributes('link').href : '';
    const empty = editor.state.selection.empty && !has;
    const url = h('input', { class: 'field', type: 'url', inputmode: 'url', value: cur, placeholder: 'https://exemple.com', autocapitalize: 'off' });
    const txt = h('input', { class: 'field', placeholder: 'Texte du lien' });
    let s;
    const normalize = (u) => {
      u = u.trim();
      if (!u) return '';
      if (/^(https?:|mailto:|tel:|#)/i.test(u)) return u;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return 'mailto:' + u;
      return 'https://' + u;
    };
    s = sheet(has ? 'Modifier le lien' : 'Insérer un lien', h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      const href = normalize(url.value);
      const ch = editor.chain().focus();
      if (!href) ch.extendMarkRange('link').unsetLink().run();
      else if (empty) ch.insertContent({ type: 'text', text: txt.value || href, marks: [{ type: 'link', attrs: { href } }] }).run();
      else ch.extendMarkRange('link').setLink({ href }).run();
      s.close();
    } },
    empty ? h('label', {}, 'Texte à afficher', txt) : null,
    h('label', {}, 'Adresse (URL, e-mail…)', url),
    h('div', { class: 'row end' },
      has ? h('button', { type: 'button', class: 'btn danger', onclick: () => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); s.close(); } }, 'Retirer le lien') : null,
      h('button', { type: 'submit', class: 'btn primary' }, 'OK'))));
    setTimeout(() => (empty ? txt : url).focus(), 250);
  }

  /* ---------- Tableau ---------- */
  function openTableSheet() {
    let rows = 3, cols = 3, head = true;
    const stepper = (label, get, set) => {
      const val = h('output', {}, String(get()));
      const bump = (d) => { set(Math.max(1, Math.min(label === 'Lignes' ? 50 : 10, get() + d))); val.textContent = get(); };
      return h('div', { class: 'stepper' }, h('span', {}, label),
        h('button', { class: 'icon-btn', 'aria-label': 'Moins', onclick: () => bump(-1) }, icon('minus', 20)), val,
        h('button', { class: 'icon-btn', 'aria-label': 'Plus', onclick: () => bump(1) }, icon('plus', 20)));
    };
    const s = sheet('Insérer un tableau', h('div', { class: 'form' },
      stepper('Lignes', () => rows, (v) => { rows = v; }), stepper('Colonnes', () => cols, (v) => { cols = v; }),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { head = e.target.checked; } }), 'Ligne d’en-tête'),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => { editor.chain().focus().insertTable({ rows, cols, withHeaderRow: head }).run(); s.close(); } }, 'Insérer'))));
  }

  /* ---------- Symboles ---------- */
  function openSymbols() {
    const s = sheet('Symboles et caractères spéciaux', h('div', { class: 'symgrid' }, [...new Set(SYMBOLS)].map((c) =>
      h('button', { class: 'sym', onclick: () => { editor.chain().focus().insertContent(c).run(); } }, c))), {});
    void s;
  }

  /* ---------- Images ---------- */
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1800;
        let { naturalWidth: w, naturalHeight: ht } = img;
        const keep = /gif|svg/.test(file.type);
        if (keep) { const fr = new FileReader(); fr.onload = () => resolve({ src: fr.result, w, h: ht }); fr.readAsDataURL(file); return; }
        const k = Math.min(1, MAX / Math.max(w, ht));
        const cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(ht * k);
        const cx = cv.getContext('2d');
        if (file.type !== 'image/png') { cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); }
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        resolve({ src: cv.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88), w: cv.width, h: cv.height });
      };
      img.onerror = () => reject(new Error('image'));
      img.src = url;
    });
  }
  async function insertImage(file) {
    try {
      const { src, w } = await resizeImage(file);
      const maxW = metrics(settings).contentWpx;
      editor.chain().focus().setImage({ src, alt: file.name.replace(/\.[^.]+$/, ''), width: Math.round(Math.min(w, maxW)) }).command(({ tr }) => { const pos = tr.selection.from - 1; if (pos >= 0 && tr.doc.nodeAt(pos)?.type.name === 'image') tr.setSelection(NodeSelection.create(tr.doc, pos)); return true; }).run();
    } catch { toast('Impossible de lire cette image'); }
  }
  function pickImage(camera) {
    const input = h('input', { type: 'file', accept: 'image/*', capture: camera ? 'environment' : null, hidden: true,
      onchange: () => { if (input.files[0]) insertImage(input.files[0]); input.remove(); } });
    document.body.append(input);
    input.click();
  }
  function sizeImage(pct) {
    editor.chain().focus().updateAttributes('image', { width: Math.round((metrics(settings).contentWpx * pct) / 100) }).run();
  }
  async function editAlt() {
    const v = await promptDialog('Texte alternatif', 'Description de l’image (accessibilité)', editor.getAttributes('image').alt || '');
    if (v !== null) editor.chain().focus().updateAttributes('image', { alt: v }).run();
  }

  /* ---------- Rechercher / remplacer ---------- */
  let findOpen = false;
  function toggleFind(force) {
    findOpen = force ?? !findOpen;
    findBar.hidden = !findOpen;
    if (!findOpen) { editor.commands.setSearch(''); findBar.replaceChildren(); editor.commands.focus(); return; }
    let cs = false;
    const q = h('input', { class: 'field', placeholder: 'Rechercher', enterkeyhint: 'search', 'aria-label': 'Rechercher' });
    const r = h('input', { class: 'field', placeholder: 'Remplacer par', 'aria-label': 'Remplacer par' });
    const count = h('span', { class: 'count' }, '');
    const upd = () => {
      const st = searchKey.getState(editor.state);
      count.textContent = q.value ? (st.matches.length ? `${st.current + 1}/${st.matches.length}` : '0') : '';
    };
    const run = () => { editor.commands.setSearch(q.value, cs); upd(); };
    q.addEventListener('input', run);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (e.shiftKey ? editor.commands.findPrev() : editor.commands.findNext()); upd(); q.focus(); } });
    const mini = (ic, label, fn) => h('button', { class: 'icon-btn', 'aria-label': label, title: label, onmousedown: (e) => e.preventDefault(), onclick: () => { fn(); upd(); } }, icon(ic, 20));
    const caseBtn = h('button', { class: 'chip sm', onclick: () => { cs = !cs; caseBtn.classList.toggle('on', cs); run(); } }, 'Aa');
    findBar.replaceChildren(
      h('div', { class: 'frow' }, q, count, caseBtn, mini('up', 'Précédent', () => { editor.commands.findPrev(); }), mini('down', 'Suivant', () => { editor.commands.findNext(); }), mini('close', 'Fermer', () => toggleFind(false))),
      h('div', { class: 'frow' }, r,
        h('button', { class: 'btn sm', onclick: () => { editor.commands.replaceCurrent(r.value); run(); } }, 'Remplacer'),
        h('button', { class: 'btn sm', onclick: () => { const n = searchKey.getState(editor.state).matches.length; editor.commands.replaceAll(r.value); run(); toast(`${n} remplacement${n > 1 ? 's' : ''}`); } }, 'Tout')));
    q.focus();
    const sel = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);
    if (sel && sel.length < 80) { q.value = sel; run(); }
  }

  /* ---------- Statistiques ---------- */
  function openStats() {
    const cc = editor.storage.characterCount;
    const text = editor.getText({ blockSeparator: '\n' });
    let paras = 0;
    editor.state.doc.descendants((n) => { if (n.isTextblock && n.textContent.trim()) paras++; });
    const words = cc.words();
    const row = (k, v) => h('div', { class: 'stat' }, h('span', {}, k), h('b', {}, String(v)));
    sheet('Statistiques', h('div', { class: 'form' },
      row('Mots', words), row('Caractères (espaces compris)', cc.characters()), row('Caractères (sans espaces)', text.replace(/\s/g, '').length),
      row('Paragraphes', paras), row('Pages (A4 estimées)', Math.max(1, Math.ceil(words / 500))), row('Temps de lecture', `${Math.max(1, Math.round(words / 220))} min`)));
  }

  /* ---------- Export / impression ---------- */
  const fileName = (ext) => `${safeName(title)}.${ext}`;
  let busy = false;
  async function withBusy(label, fn) {
    if (busy) return;
    busy = true;
    toast(label, 60000);
    try { await fn(); } catch (e) { console.error(e); toast('Échec de l’export : ' + (e.message || 'erreur')); } finally { busy = false; }
  }
  const makeDocx = () => { refreshToc(); return buildDocx(editor.getJSON(), settings, title, comments); };
  const exportDocx = () => withBusy('Création du fichier Word…', async () => { saveBlob(await makeDocx(), fileName('docx')); toast('Fichier Word exporté ✓'); });
  const makePdf = () => { refreshToc(); return buildPdf(editor.getJSON(), settings, title, { html: editor.getHTML() }); };
  const exportPdf = () => withBusy('Création du PDF…', async () => { saveBlob(await makePdf(), fileName('pdf')); toast('PDF exporté ✓'); });
  const shareDocx = () => withBusy('Préparation du partage…', async () => { await shareBlob(await makeDocx(), fileName('docx'), DOCX_MIME); toast('Terminé'); });
  const sharePdf = () => withBusy('Préparation du partage…', async () => { await shareBlob(await makePdf(), fileName('pdf'), 'application/pdf'); toast('Terminé'); });
  function doPrint() { findOpen && toggleFind(false); refreshToc(); setTimeout(() => printDocument(settings, title), 80); }

  function openFileMenu() {
    const canShare = !!navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] });
    let s;
    s = sheet('Fichier', menuList([
      { icon: 'save', label: 'Enregistrer', hint: 'Sauvegarde sur cet appareil (automatique aussi)', run: manualSave },
      { sep: 'Exporter' },
      { icon: 'word', label: 'Exporter en Word (.docx)', hint: 'Modifiable dans Word, Google Docs, LibreOffice', run: exportDocx },
      { icon: 'pdf', label: 'Exporter en PDF', hint: 'Mise en page fidèle, prêt à envoyer', run: exportPdf },
      { icon: 'print', label: 'Imprimer / PDF texte sélectionnable', hint: 'Via la boîte d’impression du système', run: doPrint },
      canShare ? { sep: 'Partager' } : null,
      canShare ? { icon: 'share', label: 'Partager en Word', run: shareDocx } : null,
      canShare ? { icon: 'share', label: 'Partager en PDF', run: sharePdf } : null,
      { sep: 'Document' },
      { icon: 'search', label: 'Rechercher et remplacer', run: () => toggleFind(true) },
      { icon: 'stats', label: 'Statistiques', run: openStats },
      { icon: 'edit', label: 'Nom de l’auteur', hint: pref.get('author', '') || 'Utilisé pour les commentaires et le suivi', run: async () => { const a = await promptDialog('Votre nom', 'Nom affiché sur vos commentaires et modifications', pref.get('author', ''), 'Enregistrer'); if (a?.trim()) { pref.set('author', a.trim()); editor.storage.trackChanges.author = a.trim(); } } },
      { icon: 'info', label: 'À propos de Luma Office', run: openAbout },
      { icon: 'star', label: 'Enregistrer comme modèle', hint: 'Le retrouver dans la page Modèles', run: async () => { const n = await promptDialog('Nouveau modèle', 'Nom du modèle', title, 'Enregistrer'); if (n?.trim()) { await putDoc({ id: newId(), kind: 'template', title: n.trim(), html: editor.getHTML(), settings, updated: Date.now() }); toast('Modèle enregistré ✓'); } } },
      { icon: 'copy', label: 'Dupliquer le document', run: async () => { await save(); hooks.onDuplicate(docRec); } },
      { icon: 'trash', label: 'Supprimer le document', danger: true, run: async () => { if (await confirmDialog(`Supprimer « ${title} » définitivement ?`, 'Supprimer', true)) { destroyed = true; hooks.onDelete(docRec); } } },
    ], () => s.close()));
  }

  /* ---------- Auteur, commentaires, suivi ---------- */
  editor.storage.trackChanges.author = pref.get('author', 'Auteur');
  async function getAuthor() {
    let a = pref.get('author', '');
    if (!a) {
      a = ((await promptDialog('Votre nom', 'Nom affiché sur vos commentaires et modifications', '', 'Enregistrer')) || '').trim();
      if (a) pref.set('author', a);
    }
    a = a || 'Auteur';
    editor.storage.trackChanges.author = a;
    return a;
  }
  const fmtDate = (d) => { try { return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  function commentRanges() {
    const map = {};
    editor.state.doc.descendants((node, pos) => {
      node.marks.filter((m) => m.type.name === 'comment').forEach((m) => {
        const r = (map[m.attrs.id] ||= { from: pos, to: pos, quote: '' });
        r.to = pos + node.nodeSize;
        if (node.isText) r.quote += node.text;
      });
    });
    return map;
  }
  async function addComment() {
    const { from, to } = editor.state.selection;
    if (from === to) { toast('Sélectionnez d’abord le texte à commenter'); return; }
    const author = await getAuthor();
    const ta = h('textarea', { class: 'field', rows: '4', placeholder: 'Votre commentaire…' });
    let sh;
    sh = sheet('Nouveau commentaire', h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) return;
      const id = 'c' + Date.now().toString(36);
      comments.push({ id, author, date: new Date().toISOString(), text, replies: [], resolved: false });
      sh.close();
      editor.chain().focus().setTextSelection({ from, to }).addComment(id).run();
      scheduleSave(); ribbon.refresh(); toast('Commentaire ajouté');
    } }, ta, h('div', { class: 'row end' }, h('button', { type: 'submit', class: 'btn primary' }, 'Publier'))));
    setTimeout(() => ta.focus(), 250);
  }
  function openComments(focusId) {
    const list = h('div', { class: 'cmt-list' });
    let sh;
    const jump = (r) => { sh.close(); editor.chain().focus().setTextSelection({ from: r.from, to: r.to }).scrollIntoView().run(); };
    const render = () => {
      const ranges = commentRanges();
      const sorted = [...comments].sort((a, b) => (a.resolved - b.resolved) || ((ranges[a.id]?.from ?? 1e9) - (ranges[b.id]?.from ?? 1e9)));
      if (!sorted.length) { list.replaceChildren(h('p', { class: 'muted' }, 'Aucun commentaire. Sélectionnez du texte puis touchez « Commenter ».')); return; }
      list.replaceChildren(...sorted.map((c) => {
        const r = ranges[c.id];
        const reply = h('input', { class: 'field', placeholder: 'Répondre…', enterkeyhint: 'send' });
        const send = async () => { const t = reply.value.trim(); if (!t) return; c.replies.push({ author: await getAuthor(), date: new Date().toISOString(), text: t }); scheduleSave(); render(); };
        reply.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
        return h('article', { class: 'cmt' + (c.resolved ? ' done' : '') + (c.id === focusId ? ' focus' : '') },
          h('div', { class: 'cmt-head' }, h('b', {}, c.author), h('small', {}, fmtDate(c.date)), c.resolved ? h('small', { class: 'tag' }, 'Résolu') : null),
          r ? h('button', { class: 'cmt-quote', onclick: () => jump(r) }, '« ' + (r.quote.length > 90 ? r.quote.slice(0, 90) + '…' : r.quote) + ' »') : h('div', { class: 'cmt-quote gone' }, '(texte supprimé)'),
          h('p', {}, c.text),
          ...c.replies.map((x) => h('div', { class: 'cmt-reply' }, h('b', {}, x.author), h('small', {}, fmtDate(x.date)), h('p', {}, x.text))),
          c.resolved ? null : h('div', { class: 'frow' }, reply, h('button', { class: 'btn sm', onclick: send }, 'Répondre')),
          h('div', { class: 'row end' },
            c.resolved ? null : h('button', { class: 'btn sm', onclick: () => { c.resolved = true; editor.commands.removeComment(c.id); scheduleSave(); render(); ribbon.refresh(); } }, 'Résoudre'),
            h('button', { class: 'btn sm danger', onclick: () => { comments = comments.filter((x) => x !== c); editor.commands.removeComment(c.id); scheduleSave(); render(); ribbon.refresh(); } }, 'Supprimer')));
      }));
      list.querySelector('.focus')?.scrollIntoView({ block: 'center' });
    };
    sh = sheet('Commentaires', h('div', { class: 'form' }, list,
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => { sh.close(); addComment(); } }, 'Nouveau commentaire'))), { wide: true });
    render();
  }
  function updatePill() {
    if (!pill) return;
    const id = editor.isActive('comment') ? editor.getAttributes('comment').id : null;
    const c = id && comments.find((x) => x.id === id && !x.resolved);
    if (!c) { pill.hidden = true; return; }
    pill.dataset.id = id;
    pill.replaceChildren(icon('comment', 16), h('b', {}, c.author + ' : '), (c.text.length > 60 ? c.text.slice(0, 60) + '…' : c.text));
    pill.hidden = false;
  }
  async function toggleTrack() {
    const st = editor.storage.trackChanges;
    if (!st.enabled) { await getAuthor(); st.enabled = true; toast('Suivi des modifications activé'); }
    else { st.enabled = false; toast('Suivi des modifications désactivé'); }
    ribbon.refresh(); updateStatus();
  }
  function resolveChange(accept) {
    const { from, to, empty } = editor.state.selection;
    let range = empty ? null : { from, to };
    if (empty) {
      const list = collectChanges(editor.state.doc);
      const c = list.find((x) => x.to >= from && x.from <= from) || list.find((x) => x.from > from) || list[0];
      if (!c) { toast('Aucune modification à traiter'); return; }
      range = { from: c.from, to: c.to };
    }
    const ok = editor.chain().focus()[accept ? 'acceptChanges' : 'rejectChanges'](range).run();
    if (!ok) toast('Aucune modification dans la sélection');
  }

  /* ---------- Table des matières ---------- */
  function estimateHeadingPages() {
    const M = metrics(settings);
    const W = Math.round(M.contentWpx), Hc = M.contentHpx;
    const holder = h('div', { class: 'pdf-holder', style: { position: 'fixed', left: '0', top: '0', width: W + 'px', zIndex: '-9999', pointerEvents: 'none', visibility: 'hidden', background: '#fff' } });
    const inner = h('div', { class: 'doc-content' });
    inner.style.width = W + 'px';
    inner.innerHTML = editor.getHTML();
    holder.append(inner);
    document.body.append(holder);
    try {
      const top0 = inner.getBoundingClientRect().top;
      const total = inner.getBoundingClientRect().height;
      const cands = [], forced = [];
      const rel = (el) => el.getBoundingClientRect().bottom - top0;
      for (const el of inner.children) {
        if (el.hasAttribute('data-page-break')) { forced.push(el.getBoundingClientRect().top - top0); continue; }
        cands.push(rel(el));
        if (el.tagName === 'TABLE') el.querySelectorAll('tr').forEach((tr) => cands.push(rel(tr)));
        if (el.tagName === 'UL' || el.tagName === 'OL') [...el.children].forEach((li) => cands.push(rel(li)));
      }
      const slices = [];
      let y = 0;
      while (y < total - 2) {
        const limit = y + Hc;
        const f = forced.find((t) => t > y + 1 && t <= limit);
        let end;
        if (f !== undefined) end = f;
        else if (total <= limit) end = total;
        else { const c = cands.filter((b) => b > y + 24 && b <= limit); end = c.length ? Math.max(...c) : limit; }
        slices.push([y, end]);
        y = Math.max(end, y + 1);
      }
      const last = Math.max(1, slices.length);
      return [...inner.querySelectorAll('h1,h2,h3')].filter((e) => !e.closest('.toc')).map((e) => {
        const yy = e.getBoundingClientRect().top - top0 + 1;
        const i = slices.findIndex(([a, b]) => yy >= a && yy < b);
        return i < 0 ? last : i + 1;
      });
    } finally { holder.remove(); }
  }
  function refreshToc() {
    let has = false;
    editor.state.doc.descendants((n) => { if (n.type.name === 'tableOfContents') has = true; return !has; });
    if (!has) return false;
    const heads = [];
    editor.state.doc.descendants((n) => { if (n.type.name === 'heading') heads.push({ level: n.attrs.level, text: n.textContent.trim() }); });
    for (let pass = 0; pass < 2; pass++) {
      const pages = estimateHeadingPages();
      editor.commands.updateToc(heads.map((hd, i) => ({ ...hd, page: pages[i] || 1 })));
    }
    return true;
  }
  function insertToc() {
    let has = false;
    editor.state.doc.descendants((n) => { if (n.type.name === 'tableOfContents') has = true; return !has; });
    if (!has) editor.chain().focus().insertContent({ type: 'tableOfContents', attrs: { items: [] } }).run();
    refreshToc();
    toast(has ? 'Table des matières mise à jour' : 'Table des matières insérée');
  }

  /* ---------- Largeur des colonnes (poignées tactiles + saisie) ---------- */
  const tableOf = () => findParentNode((n) => n.type.name === 'table')(editor.state.selection);
  function setColWidths(map) {
    const found = tableOf();
    if (!found) return;
    const { node: table, start } = found;
    const tm = TableMap.get(table);
    const tr = editor.state.tr;
    for (const [c, w] of Object.entries(map)) {
      const col = +c;
      for (let row = 0; row < tm.height; row++) {
        const idx = row * tm.width + col;
        if (row && tm.map[idx] === tm.map[idx - tm.width]) continue;
        const pos = tm.map[idx];
        const cell = table.nodeAt(pos);
        const i = cell.attrs.colspan === 1 ? 0 : col - tm.colCount(pos);
        const cw = cell.attrs.colwidth ? cell.attrs.colwidth.slice() : Array(cell.attrs.colspan).fill(0);
        cw[i] = w === null ? 0 : Math.round(w);
        tr.setNodeMarkup(start + pos, null, { ...cell.attrs, colwidth: cw.every((x) => !x) ? null : cw });
      }
    }
    tr.setMeta('trackIgnore', true);
    editor.view.dispatch(tr);
  }
  const tableDom = () => {
    const f = tableOf();
    if (!f) return null;
    const dom = editor.view.nodeDOM(f.pos);
    return dom?.matches?.('table') ? dom : dom?.querySelector?.('table');
  };
  function colWidthsPx(table) {
    const z = curZoom();
    const out = [];
    for (const cell of table.rows[0].cells) {
      const w = cell.getBoundingClientRect().width / z;
      const n = cell.colSpan || 1;
      for (let k = 0; k < n; k++) out.push(w / n);
    }
    return out;
  }
  let handlesRaf, dragging = false;
  function scheduleHandles() { cancelAnimationFrame(handlesRaf); handlesRaf = requestAnimationFrame(updateHandles); }
  function updateHandles() {
    if (destroyed) return;
    updateImgHandles();
    updateColHandles();
  }
  function updateColHandles() {
    if (dragging) return;
    const table = tableOf() && tableDom();
    if (!table || !table.rows[0]) { colLayer.replaceChildren(); return; }
    const z = curZoom();
    const pr = sheetEl.getBoundingClientRect(), tr = table.getBoundingClientRect();
    const kidsH = [];
    let col = 0;
    const cells = [...table.rows[0].cells];
    cells.forEach((cell, i) => {
      col += cell.colSpan || 1;
      if (i === cells.length - 1) return;
      const x = (cell.getBoundingClientRect().right - pr.left) / z;
      const c = col - 1;
      const hd = h('div', { class: 'col-handle', style: { left: x - 14 + 'px', top: (tr.top - pr.top) / z + 'px', height: tr.height / z + 'px' }, 'aria-label': 'Redimensionner la colonne' }, h('i', {}), h('b', {}));
      hd.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        hd.setPointerCapture(e.pointerId);
        hd.classList.add('drag'); dragging = true;
        const x0 = e.clientX, ws = colWidthsPx(table), a0 = ws[c], b0 = ws[c + 1];
        let dx = 0, raf = 0;
        const apply = () => { raf = 0; const a = Math.max(30, Math.min(a0 + b0 - 30, a0 + dx)); setColWidths({ [c]: a, [c + 1]: a0 + b0 - a }); };
        const mv = (ev) => { dx = (ev.clientX - x0) / curZoom(); if (!raf) raf = requestAnimationFrame(apply); };
        const up = () => { hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up); cancelAnimationFrame(raf); apply(); dragging = false; scheduleHandles(); };
        hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
      });
      kidsH.push(hd);
    });
    colLayer.replaceChildren(...kidsH);
  }
  function openColWidth() {
    const cellF = findParentNode((n) => n.type.name === 'tableCell' || n.type.name === 'tableHeader')(editor.state.selection);
    const tf = tableOf();
    if (!cellF || !tf) { toast('Placez le curseur dans un tableau'); return; }
    const tm = TableMap.get(tf.node);
    const col = tm.colCount(cellF.pos - tf.start);
    const dom = editor.view.nodeDOM(cellF.pos);
    const cur = dom ? (dom.getBoundingClientRect().width / curZoom() / CM_PX).toFixed(2) : '';
    const input = h('input', { class: 'field', type: 'number', step: '0.1', min: '0.5', inputmode: 'decimal', value: cur });
    let sh;
    sh = sheet(`Largeur de la colonne ${col + 1}`, h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); const v = parseFloat(String(input.value).replace(',', '.')); if (v > 0) setColWidths({ [col]: v * CM_PX }); sh.close(); } },
      h('label', {}, 'Largeur (cm)', input),
      h('div', { class: 'row end' },
        h('button', { type: 'button', class: 'btn', onclick: () => { const all = {}; for (let i = 0; i < tm.width; i++) all[i] = null; setColWidths(all); sh.close(); } }, 'Égaliser les colonnes'),
        h('button', { type: 'submit', class: 'btn primary' }, 'Appliquer'))));
    setTimeout(() => { input.focus(); input.select(); }, 250);
  }

  /* ---------- Images distantes : copiées dans le document pour rester disponibles hors ligne ---------- */
  function scheduleInline(delay = 1200) { clearTimeout(inlineTimer); inlineTimer = setTimeout(inlineRemoteImages, delay); }
  const toDataUrl = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  async function inlineRemoteImages() {
    if (destroyed) return;
    const remote = [];
    editor.state.doc.descendants((n) => { if (n.type.name === 'image' && /^https?:/i.test(n.attrs.src || '')) remote.push(n.attrs.src); });
    for (const src of [...new Set(remote)]) {
      try {
        const r = await fetch(src, { mode: 'cors', cache: 'force-cache' });
        if (!r.ok) continue;
        const blob = await r.blob();
        if (!blob.type.startsWith('image/') || blob.size > 8e6) continue;
        const data = await toDataUrl(blob);
        const tr = editor.state.tr;
        editor.state.doc.descendants((n, pos) => { if (n.type.name === 'image' && n.attrs.src === src) tr.setNodeMarkup(pos, undefined, { ...n.attrs, src: data }); });
        tr.setMeta('trackIgnore', true);
        editor.view.dispatch(tr);
      } catch { /* hors ligne ou refus CORS : le cache du navigateur prend le relais */ }
    }
  }

  /* ---------- Mise en forme sous le curseur (comme Word) : barre d'état, bulle au toucher, info-bulle au survol ---------- */
  const tip = h('div', { class: 'fmt-tip', hidden: true });
  document.body.append(tip);
  let tipTimer, tipSource = '', userTouched = false, hoverT;
  const hideTip = () => { tip.hidden = true; clearTimeout(tipTimer); };
  function tipContent(f) {
    const l2 = [...f.flags, f.align].filter(Boolean).join(' · ');
    return [
      h('div', { class: 'l1' }, h('b', { style: { fontFamily: f.font } }, f.font), ` · ${f.size} pt`),
      l2 ? h('div', { class: 'l2' }, l2) : null,
      h('div', { class: 'l3' }, f.color ? h('span', { class: 'dot', style: { background: f.color } }) : null, `Style : ${f.style}`, f.link ? ` · lien` : ''),
    ].filter(Boolean);
  }
  function showTip(info, x, y, ttl = 2800, source = 'caret') {
    return; // la police et la taille sont lues dans le ruban (comme Word), plus de bulle
    tipSource = source;
    tip.replaceChildren(...tipContent(info));
    tip.hidden = false; tip.style.left = '0px'; tip.style.top = '0px';
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    const left = Math.min(Math.max(8, x - 24), innerWidth - w - 8);
    let top = y - hh - 12; const below = top < 8; if (below) top = y + 30;
    tip.classList.toggle('below', below);
    tip.style.setProperty('--ax', Math.min(Math.max(14, x - left - 5), w - 24) + 'px');
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
    clearTimeout(tipTimer); if (ttl) tipTimer = setTimeout(hideTip, ttl);
  }
  function showCaretTip(force) {
    if (reader || (!force && !userTouched)) return;
    try {
      const c = editor.view.coordsAtPos(editor.state.selection.head);
      showTip(describeSelection(editor.state), c.left, c.top, force ? 4000 : 2600, 'caret');
    } catch { /* hors écran */ }
  }
  pmHost.addEventListener('pointerdown', () => { userTouched = true; hideTip(); }, true);
  pmHost.addEventListener('keydown', () => { userTouched = true; hideTip(); }, true);
  pmHost.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reader) return;
    clearTimeout(hoverT);
    if (!tip.hidden && tipSource === 'hover') hideTip();
    hoverT = setTimeout(() => {
      if (!e.target.closest?.('.ProseMirror') || e.target.closest('.endnotes')) return;
      const r = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (!r || r.inside < 0) return;
      showTip(describeAt(editor.state, r.pos), e.clientX, e.clientY - 6, 4500, 'hover');
    }, 450);
  });
  pmHost.addEventListener('pointerleave', () => { clearTimeout(hoverT); if (tipSource === 'hover') hideTip(); });

  function fmtSegment() {
    const f = describeSelection(editor.state);
    return h('button', { class: 'fmt-seg', title: 'Mise en forme du texte (touchez pour le détail)', onclick: () => showCaretTip(true) },
      h('span', { style: { fontFamily: f.font } }, f.font), `${f.size} pt`, f.bold ? h('b', {}, 'G') : null, f.italic ? h('i', {}, 'I') : null, f.underline ? h('u', {}, 'S') : null);
  }

  /* ---------- Images : poignées de déplacement et de taille, monter / descendre, habillage ---------- */
  const imgLayer = h('div', { class: 'img-layer' });
  sheetEl.append(imgLayer);
  let imgUI = null, imgDragging = false;
  const selImage = () => { const s = editor.state.selection; return s.node?.type?.name === 'image' ? s : null; };
  function placeImgHandles() {
    if (!imgUI) return;
    const el = editor.view.nodeDOM(imgUI.pos);
    if (!(el instanceof HTMLElement)) return;
    const z = curZoom(), pr = sheetEl.getBoundingClientRect(), r = el.getBoundingClientRect();
    const x = (r.left - pr.left) / z, y = (r.top - pr.top) / z, w = r.width / z, hh = r.height / z;
    Object.assign(imgUI.frame.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
    Object.assign(imgUI.mv.style, { left: x - 16 + 'px', top: y - 16 + 'px' });
    Object.assign(imgUI.rs.style, { left: x + w - 14 + 'px', top: y + hh - 14 + 'px' });
    const bw = imgUI.bar.offsetWidth || 220;
    Object.assign(imgUI.bar.style, { left: Math.max(4, Math.min(x, sheetEl.offsetWidth - bw - 4)) + 'px', top: (y > 60 ? y - 54 : y + hh + 12) + 'px' });
  }
  function updateImgHandles() {
    if (imgDragging) return;
    const s = selImage();
    if (!s || reader) { imgUI = null; imgLayer.replaceChildren(); return; }
    if (imgUI?.pos === s.from) { placeImgHandles(); return; }
    const barBtn = (ic, label, fn) => h('button', { 'aria-label': label, title: label, onpointerdown: (e) => e.preventDefault(), onclick: fn }, icon(ic, 20));
    imgUI = {
      pos: s.from,
      frame: h('div', { class: 'img-frame' }),
      mv: h('button', { class: 'img-move', 'aria-label': 'Déplacer l’image : glisser', title: 'Glisser pour déplacer l’image' }, icon('move', 20)),
      rs: h('button', { class: 'img-resize', 'aria-label': 'Redimensionner : glisser', title: 'Glisser pour agrandir ou réduire' }),
      bar: h('div', { class: 'img-bar' },
        barBtn('up', 'Monter l’image', () => moveImageBlock(-1)), barBtn('down', 'Descendre l’image', () => moveImageBlock(1)),
        barBtn('alignCenter', 'Habillage et position', () => openWrapSheet()), barBtn('trash', 'Supprimer l’image', () => editor.chain().focus().deleteSelection().run())),
    };
    imgUI.mv.addEventListener('pointerdown', startImageMove);
    imgUI.rs.addEventListener('pointerdown', startImageResize);
    imgLayer.replaceChildren(imgUI.frame, imgUI.mv, imgUI.rs, imgUI.bar);
    placeImgHandles();
  }
  function startImageResize(e) {
    e.preventDefault(); e.stopPropagation();
    const pos = imgUI.pos, el = editor.view.nodeDOM(pos), x0 = e.clientX, startW = el.getBoundingClientRect().width / curZoom();
    const cw = metrics(settings).contentWpx;
    let w = startW, raf = 0; imgDragging = true;
    const target = e.currentTarget; target.setPointerCapture(e.pointerId);
    const apply = () => {
      raf = 0;
      const node = editor.state.doc.nodeAt(pos); if (!node) return;
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: Math.round(w) });
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      editor.view.dispatch(tr); placeImgHandles();
    };
    const mv = (ev) => { w = Math.max(30, Math.min(cw, startW + (ev.clientX - x0) / curZoom())); if (!raf) raf = requestAnimationFrame(apply); };
    const up = () => { target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); cancelAnimationFrame(raf); apply(); imgDragging = false; scheduleHandles(); };
    target.addEventListener('pointermove', mv); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  }
  function startImageMove(e) {
    e.preventDefault(); e.stopPropagation();
    const s = selImage(); if (!s) return;
    const from = s.from, node = s.node, imgEl = editor.view.nodeDOM(from);
    const target = e.currentTarget; target.setPointerCapture(e.pointerId); imgDragging = true;
    const ghost = h('img', { class: 'drag-ghost', src: node.attrs.src, style: { width: Math.min(130, imgEl.getBoundingClientRect().width) + 'px' } });
    const caret = h('div', { class: 'drop-caret', hidden: true });
    document.body.append(ghost); sheetEl.append(caret);
    let dropAt = null, last = e, raf = 0, alive = true;
    const place = (ev) => {
      ghost.style.left = ev.clientX - 30 + 'px'; ghost.style.top = ev.clientY - 30 + 'px';
      const r = editor.view.posAtCoords({ left: ev.clientX, top: ev.clientY });
      if (r && !(r.pos >= from && r.pos <= from + 1)) {
        dropAt = r.pos;
        const c = editor.view.coordsAtPos(r.pos), pr = sheetEl.getBoundingClientRect(), z = curZoom();
        Object.assign(caret.style, { left: (c.left - pr.left) / z + 'px', top: (c.top - pr.top) / z + 'px', height: (c.bottom - c.top) / z + 'px' });
        caret.hidden = false;
      } else { dropAt = null; caret.hidden = true; }
    };
    const loop = () => { // défilement automatique près des bords
      if (!alive) return;
      const sr = scroller.getBoundingClientRect();
      if (last.clientY < sr.top + 70) scroller.scrollTop -= 14; else if (last.clientY > sr.bottom - 70) scroller.scrollTop += 14;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); place(e);
    const mv = (ev) => { last = ev; place(ev); };
    const up = () => {
      alive = false; cancelAnimationFrame(raf);
      target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
      ghost.remove(); caret.remove(); imgDragging = false;
      if (dropAt != null) moveNodeTo(from, node, dropAt); else scheduleHandles();
    };
    target.addEventListener('pointermove', mv); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  }
  function moveNodeTo(from, node, to) {
    const tr = editor.state.tr;
    tr.delete(from, from + 1);
    const mapped = tr.mapping.map(to), $m = tr.doc.resolve(mapped);
    let np = mapped;
    if ($m.parent.inlineContent) tr.insert(mapped, node);
    else { tr.insert(mapped, editor.schema.nodes.paragraph.create(null, node)); np = mapped + 1; }
    tr.setSelection(NodeSelection.create(tr.doc, np)).scrollIntoView();
    editor.view.dispatch(tr); toast('Image déplacée');
  }
  function moveImageBlock(dir) {
    const s = selImage(); if (!s) return;
    const { $from } = s;
    if ($from.depth !== 1) { toast('Pour déplacer cette image, utilisez la poignée ✥ et glissez-la.'); return; }
    const doc = editor.state.doc, idx = $from.index(0), block = doc.child(idx), start = $from.before(1), off = s.from - start;
    if ((dir < 0 && idx === 0) || (dir > 0 && idx === doc.childCount - 1)) { toast(dir < 0 ? 'Déjà tout en haut' : 'Déjà tout en bas'); return; }
    const tr = editor.state.tr; let newStart;
    if (dir < 0) { const prev = doc.child(idx - 1); newStart = start - prev.nodeSize; tr.delete(start, start + block.nodeSize); tr.insert(newStart, block); }
    else { const next = doc.child(idx + 1); tr.delete(start, start + block.nodeSize); newStart = start + next.nodeSize; tr.insert(newStart, block); }
    tr.setSelection(NodeSelection.create(tr.doc, newStart + off)).scrollIntoView();
    editor.view.dispatch(tr);
  }
  function isolateImage() {
    const s = selImage(); if (!s) return;
    const { $from } = s, para = $from.parent;
    if (para.type.name !== 'paragraph') return;
    const start = $from.start(), P = editor.schema.nodes.paragraph;
    const before = para.content.cut(0, s.from - start), after = para.content.cut(s.from - start + 1);
    const nodes = [];
    if (before.size) nodes.push(P.create(para.attrs, before));
    const mid = P.create({ ...para.attrs, textAlign: 'center' }, s.node.type.create({ ...s.node.attrs, float: 'none' }));
    nodes.push(mid);
    if (after.size) nodes.push(P.create(para.attrs, after));
    const base = $from.before(); let midPos = base;
    for (const n of nodes) { if (n === mid) break; midPos += n.nodeSize; }
    const tr = editor.state.tr.replaceWith(base, $from.after(), nodes);
    tr.setSelection(NodeSelection.create(tr.doc, midPos + 1));
    editor.view.dispatch(tr);
  }
  function openWrapSheet() {
    const s = selImage(); if (!s) return;
    const cur = s.node.attrs.float || 'none';
    const mini = (inner) => `<svg viewBox="0 0 60 44" width="54" height="40" aria-hidden="true"><rect x="1" y="1" width="58" height="42" rx="3" fill="#fff" stroke="currentColor" stroke-width="2"/>${inner}</svg>`;
    const lines = (x, w, ys) => ys.map((y) => `<path d="M${x} ${y}h${w}" stroke="currentColor" stroke-width="2" opacity=".5"/>`).join('');
    let sh;
    const items = [
      ['none', 'En ligne avec le texte', 'L’image se comporte comme un caractère', mini(lines(6, 22, [14]) + '<rect x="30" y="9" width="10" height="9" fill="currentColor" opacity=".7"/>' + lines(44, 10, [14]) + lines(6, 48, [26, 34]))],
      ['block', 'Seule sur sa ligne', 'Image centrée, texte au-dessus et en dessous', mini(lines(6, 48, [9]) + '<rect x="19" y="15" width="22" height="14" fill="currentColor" opacity=".7"/>' + lines(6, 48, [35]))],
      ['left', 'Texte autour — à gauche', 'L’image à gauche, le texte l’entoure', mini('<rect x="6" y="8" width="18" height="16" fill="currentColor" opacity=".7"/>' + lines(28, 26, [10, 17, 24]) + lines(6, 48, [32, 38]))],
      ['right', 'Texte autour — à droite', 'L’image à droite, le texte l’entoure', mini('<rect x="36" y="8" width="18" height="16" fill="currentColor" opacity=".7"/>' + lines(6, 26, [10, 17, 24]) + lines(6, 48, [32, 38]))],
    ];
    sh = sheet('Habillage et position', h('div', { class: 'form' },
      h('div', { class: 'menu-list' }, items.map(([v, l, sub, svg]) => h('button', { class: 'menu-item' + (v === cur ? ' on' : ''), onclick: () => { sh.close(); if (v === 'block') isolateImage(); else editor.chain().focus().updateAttributes('image', { float: v }).run(); } },
        h('span', { class: 'ccard-ic', html: svg }), h('span', { class: 'mi-text' }, h('b', {}, l), h('small', {}, sub))))),
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => { sh.close(); moveImageBlock(-1); } }, icon('up', 18), 'Monter'), h('button', { class: 'btn', onclick: () => { sh.close(); moveImageBlock(1); } }, icon('down', 18), 'Descendre')),
      h('p', { class: 'muted small' }, 'Astuce : touchez l’image puis glissez la poignée ✥ pour la déplacer n’importe où dans le texte.')));
  }

  const selectJustInserted = ({ tr }) => { const pos = tr.selection.from - 1; if (pos >= 0 && tr.doc.nodeAt(pos)?.type.name === 'image') tr.setSelection(NodeSelection.create(tr.doc, pos)); return true; };

  /* ---------- Insertions : page vierge, formes, date et heure, note de fin, lettrine, zone de texte ---------- */
  function insertBlankPage() {
    editor.chain().focus().insertContent([{ type: 'pageBreak' }, { type: 'paragraph' }, { type: 'pageBreak' }, { type: 'paragraph' }]).run();
    toast('Page vierge insérée');
  }
  function openDateSheet() {
    let auto = false, sh;
    const now = new Date();
    sh = sheet('Date et heure', h('div', { class: 'form' },
      h('div', { class: 'menu-list' }, DATE_FORMATS.map(([id, label]) => h('button', { class: 'menu-item', onclick: () => { sh.close(); editor.chain().focus().insertContent(auto ? { type: 'dateField', attrs: { fmt: id } } : formatDate(id, now)).run(); } },
        icon('clock', 20), h('span', { class: 'mi-text' }, h('b', {}, formatDate(id, now)), h('small', {}, label))))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { auto = e.target.checked; } }), 'Mettre à jour automatiquement à chaque ouverture')));
  }
  function openEndnote() {
    const s = editor.state.selection;
    const editing = s.node?.type?.name === 'endnote';
    const ta = h('textarea', { class: 'field', rows: '4', placeholder: 'Texte de la note de fin…' });
    if (editing) ta.value = s.node.attrs.text || '';
    let sh;
    sh = sheet(editing ? 'Modifier la note de fin' : 'Nouvelle note de fin', h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      const text = ta.value.trim(); sh.close();
      if (editing) editor.chain().focus().updateAttributes('endnote', { text }).run();
      else editor.chain().focus().insertContent({ type: 'endnote', attrs: { text } }).run();
    } }, ta, h('p', { class: 'muted small' }, 'Un numéro est ajouté dans le texte ; les notes sont regroupées à la fin du document.'),
    h('div', { class: 'row end' }, editing ? h('button', { type: 'button', class: 'btn danger', onclick: () => { sh.close(); editor.chain().focus().deleteSelection().run(); } }, 'Supprimer') : null, h('button', { type: 'submit', class: 'btn primary' }, editing ? 'Enregistrer' : 'Insérer'))));
    setTimeout(() => ta.focus(), 250);
  }
  pmHost.addEventListener('click', (e) => {
    if (e.target.closest?.('.endnote-ref')) setTimeout(() => { if (editor.state.selection.node?.type?.name === 'endnote') openEndnote(); }, 0);
    else {
      const li = e.target.closest?.('.endnotes li');
      if (li) { const n = +li.dataset.i; let k = -1, found = null; editor.state.doc.descendants((nd, pos) => { if (nd.type.name === 'endnote') { k++; if (k === n) found = pos; } }); if (found != null) { editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, found))); openEndnote(); } }
    }
  });
  function toggleDropCap() {
    if (editor.isActive('heading') || editor.isActive('textBox') && false) { toast('La lettrine s’applique à un paragraphe de texte.'); return; }
    const on = !!editor.getAttributes('paragraph').dropCap;
    editor.chain().focus().setParagraphProps({ dropCap: !on }).run();
    toast(on ? 'Lettrine retirée' : 'Lettrine appliquée au paragraphe');
  }
  const TB_PRESETS = {
    simple: { label: 'Simple', fill: '#ffffff', border: '#8a93a6', accent: false },
    info: { label: 'Information', fill: '#eaf2ff', border: '#0157e0', accent: false },
    warn: { label: 'Attention', fill: '#fff4de', border: '#fc9a0b', accent: false },
    ok: { label: 'Succès', fill: '#e6f6ea', border: '#1a7f37', accent: false },
    danger: { label: 'Alerte', fill: '#fdeceb', border: '#d92d20', accent: false },
    quote: { label: 'Citation', fill: '#f3f6fc', border: '#001e6c', accent: true },
  };
  function openTextBoxSheet() {
    let sh;
    sh = sheet('Zone de texte', h('div', { class: 'form' },
      h('div', { class: 'tbcards' }, Object.entries(TB_PRESETS).map(([k, p]) => h('button', { class: 'tbcard', onclick: () => {
        sh.close();
        editor.chain().focus().insertContent({ type: 'textBox', attrs: { fill: p.fill, border: p.border, accent: p.accent, width: 100, align: 'center' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Votre texte ici' }] }] }).run();
      } }, h('span', { class: 'tbsample', style: { background: p.fill, borderColor: p.border, borderLeftWidth: p.accent ? '6px' : '2px' } }, 'Abc'), h('b', {}, p.label)))),
      h('p', { class: 'muted small' }, 'Une fois insérée, touchez la zone pour changer son style, sa largeur ou sa position dans l’onglet « Zone de texte ».')));
  }
  function setTextBox(a) { editor.chain().focus().updateAttributes('textBox', a).run(); }
  function removeTextBox() {
    const f = findParentNode((n) => n.type.name === 'textBox')(editor.state.selection);
    if (f) editor.view.dispatch(editor.state.tr.delete(f.pos, f.pos + f.node.nodeSize));
  }

  /* ---------- Formes ---------- */
  function openShapesSheet(editImg) {
    const edit = editImg || selImage();
    const isEdit = !!(edit && edit.node.attrs.shape);
    const cur = { ...DEFAULT_SHAPE, ...(isEdit ? JSON.parse(edit.node.attrs.shape) : {}) };
    const FILLS = ['none', '#ffffff', '#d9e8ff', '#ffe3b8', '#d6f2dd', '#ffd9d6', '#e6dcff', '#0157e0', '#001e6c', '#fc9a0b', '#1a7f37', '#d92d20', '#ec6ba6', '#8a93a6', '#000000'];
    const LINES = ['#0157e0', '#001e6c', '#fc9a0b', '#1a7f37', '#d92d20', '#7b4de0', '#8a93a6', '#000000'];
    const prev = h('div', { class: 'shape-prev' });
    const grid = h('div', { class: 'shapegrid' });
    const draw = () => { const { svg } = buildShape(cur); prev.innerHTML = svg; const el = prev.firstElementChild; el.removeAttribute('width'); el.removeAttribute('height'); el.style.maxWidth = '240px'; el.style.maxHeight = '150px'; el.style.width = '100%'; };
    const drawGrid = () => {
      const entries = [...Object.entries(SHAPES).map(([k, v]) => [k, v.label]), ...Object.entries(MOTIFS).map(([k, v]) => ['motif:' + k, v.label])];
      grid.replaceChildren(...entries.map(([k, label]) => {
        const t = { ...cur, type: k, size: 60, text: '' };
        const { svg } = buildShape(k.startsWith('motif:') ? { ...t, fill: MOTIFS[k.slice(6)].color } : t);
        return h('button', { type: 'button', class: 'shapebtn' + (cur.type === k ? ' on' : ''), title: label, 'aria-label': label, onclick: () => { cur.type = k; if (k.startsWith('motif:')) cur.fill = MOTIFS[k.slice(6)].color; drawGrid(); draw(); }, html: svg.replace(/width="\d+" height="\d+"/, 'width="40" height="40"') });
      }));
    };
    const sw = (colors, get, set, none) => { const w = h('div', { class: 'swrow s8' }, colors.map((c) => h('button', { type: 'button', class: 'sw' + (get() === c ? ' on' : ''), style: c === 'none' ? { background: 'repeating-linear-gradient(45deg,#fff 0 4px,#e0e0e0 4px 8px)' } : { background: c }, 'aria-label': c === 'none' ? 'Sans remplissage' : c, onclick: () => { set(c); w.querySelectorAll('.sw').forEach((x, i) => x.classList.toggle('on', colors[i] === c)); draw(); } }))); void none; return w; };
    const txt = h('input', { class: 'field', value: cur.text, placeholder: 'Texte dans la forme (facultatif)', maxlength: '40', oninput: (e) => { cur.text = e.target.value; draw(); } });
    const swidth = h('input', { type: 'range', min: '0', max: '10', step: '1', value: String(cur.sw), class: 'rng', oninput: (e) => { cur.sw = +e.target.value; draw(); } });
    let sh;
    sh = sheet(isEdit ? 'Modifier la forme' : 'Formes', h('div', { class: 'form' },
      grid, h('div', { class: 'shape-stage' }, prev),
      h('h3', {}, 'Remplissage'), sw(FILLS, () => cur.fill, (c) => { cur.fill = c; }),
      h('h3', {}, 'Contour'), sw(LINES, () => cur.stroke, (c) => { cur.stroke = c; }), h('label', {}, 'Épaisseur du contour', swidth),
      h('label', {}, 'Texte', txt),
      h('h3', {}, 'Taille'),
      h('div', { class: 'choice' }, [['Petite', 110], ['Moyenne', 220], ['Grande', 340], ['Pleine largeur', Math.round(metrics(settings).contentWpx)]].map(([l, v]) => h('button', { type: 'button', class: 'chip' + (cur.size === v ? ' on' : ''), onclick: (e) => { cur.size = v; e.currentTarget.parentNode.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); } }, l))),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => {
        const { svg, w } = buildShape(cur); const src = svgToSrc(svg); const label = (SHAPES[cur.type]?.label || MOTIFS[cur.type.slice(6)]?.label || 'Forme');
        sh.close();
        if (isEdit) editor.chain().focus().updateAttributes('image', { src, shape: JSON.stringify(cur), alt: label, width: cur.size === DEFAULT_SHAPE.size ? edit.node.attrs.width : w }).run();
        else editor.chain().focus().setImage({ src, alt: label, width: w, shape: JSON.stringify(cur) }).command(selectJustInserted).run();
      } }, isEdit ? 'Appliquer' : 'Insérer'))), { wide: true });
    drawGrid(); draw();
  }

  /* ---------- Affichage : pages, miniatures, vue en pavé, aller à la page, mode lecteur ---------- */
  const clampN = (n, a, b) => Math.max(a, Math.min(b, n));
  const nextFrames = (n = 2) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const stageTop = () => stage.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  function curPage() {
    if (mode === 'page' && !reader) {
      const M = metrics(settings), z = curZoom();
      return clampN(Math.floor((scroller.scrollTop + scroller.clientHeight * 0.35 - stageTop()) / (M.hpx * z)) + 1, 1, pageCount);
    }
    const max = scroller.scrollHeight - scroller.clientHeight;
    return clampN(Math.round((max > 0 ? scroller.scrollTop / max : 0) * (pageCount - 1)) + 1, 1, pageCount);
  }
  function goToPage(n, smooth = true) {
    n = clampN(Math.round(n) || 1, 1, pageCount);
    if (mode === 'page' && !reader) {
      const M = metrics(settings), z = curZoom();
      scroller.scrollTo({ top: stageTop() + (n - 1) * M.hpx * z - 6, behavior: smooth ? 'smooth' : 'auto' });
    } else {
      const max = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTo({ top: pageCount > 1 ? ((n - 1) / (pageCount - 1)) * max : 0, behavior: smooth ? 'smooth' : 'auto' });
    }
  }
  async function ensurePageMode() {
    if (reader) exitReader();
    if (mode !== 'page') { setMode('page'); toast('Passage en mode Page pour afficher les pages'); await nextFrames(3); }
  }

  // pastille « Page X / N » toujours visible (documents longs) : touchez-la pour aller à une page
  const pagePill = h('button', { class: 'page-pill', 'aria-label': 'Aller à une page', onclick: () => openGoto() });
  document.body.append(pagePill);
  function updatePagePill() {
    if (destroyed) return;
    const words = editor.storage.characterCount.words();
    pagePill.replaceChildren(icon('gotopage', 16), `Page ${curPage()} / ${pageCount}`, showWc ? h('small', {}, ` · ${words} mot${words > 1 ? 's' : ''}`) : null);
    const sb = scroller.getBoundingClientRect(), rb = root.getBoundingClientRect();
    pagePill.style.bottom = Math.max(8, innerHeight - sb.bottom + 10) + 'px';
    pagePill.style.right = '12px';
    pagePill.hidden = !!root.querySelector('.sheet-back') && false;
    const rp = $readerProgress; if (rp) { const max = scroller.scrollHeight - scroller.clientHeight; rp.style.width = (max > 0 ? (scroller.scrollTop / max) * 100 : 0) + '%'; }
    void rb;
  }
  let pillRaf = 0;
  scroller.addEventListener('scroll', () => { if (!pillRaf) pillRaf = requestAnimationFrame(() => { pillRaf = 0; updatePagePill(); refreshThumbCurrent(); }); }, { passive: true });

  // vignettes de pages (clonage léger du document, décalé sur la page voulue)
  function thumbEl(i, w, docHtml, overlayHtml) {
    const M = metrics(settings), k = w / M.wpx, H = M.hpx;
    const paper = h('div', { class: 'thumb-paper', style: { width: M.wpx + 'px', minHeight: H + 'px', transform: `translateY(${-i * H}px)` } });
    applyPageVars(paper, settings);
    paper.style.padding = `${settings.margins.top}cm ${settings.margins.right}cm ${settings.margins.bottom}cm ${M.leftCm}cm`;
    paper.append(h('div', { class: 'hf-layer', html: overlayHtml }), h('div', { class: 'doc-content', html: docHtml }));
    return h('div', { class: 'thumb-page', style: { width: w + 'px', height: Math.round(H * k) + 'px' } },
      h('div', { class: 'thumb-inner', style: { width: M.wpx + 'px', height: H + 'px', transform: `scale(${k})` } }, paper));
  }
  let thumbItems = [];
  function refreshThumbCurrent() { if (!thumbItems.length) return; const c = curPage(); thumbItems.forEach((it) => it.el.classList.toggle('cur', it.page === c)); }
  function renderThumbs(container, { width, onPick }) {
    const pm = pmHost.querySelector('.ProseMirror');
    const docHtml = pm ? pm.innerHTML : '', overlayHtml = overlay.innerHTML;
    const M = metrics(settings);
    thumbItems = [];
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting && !en.target.dataset.done) { en.target.dataset.done = '1'; en.target.querySelector('.thumb-slot').replaceChildren(thumbEl(+en.target.dataset.i, width, docHtml, overlayHtml)); }
    }), { root: container, rootMargin: '300px' });
    const items = Array.from({ length: pageCount }, (_, i) => {
      const slot = h('div', { class: 'thumb-slot', style: { width: width + 'px', height: Math.round((M.hpx * width) / M.wpx) + 'px' } });
      const el = h('button', { class: 'pgthumb', 'data-i': i, 'aria-label': `Page ${i + 1}`, onclick: () => onPick(i + 1) }, slot, h('span', { class: 'pgthumb-n' }, String(i + 1)));
      thumbItems.push({ el, page: i + 1 });
      return el;
    });
    container.replaceChildren(...items);
    items.forEach((el) => io.observe(el));
    refreshThumbCurrent();
    return () => io.disconnect();
  }
  let thumbsPane = null, thumbsOff = null;
  async function toggleThumbs() {
    if (thumbsPane) { closeThumbs(); return; }
    await ensurePageMode();
    const list = h('div', { class: 'thumbs-list' });
    thumbsPane = h('aside', { class: 'thumbs-pane', 'aria-label': 'Miniatures des pages' },
      h('div', { class: 'thumbs-head' }, h('b', {}, `Pages (${pageCount})`), h('button', { class: 'icon-btn', 'aria-label': 'Fermer', onclick: closeThumbs }, icon('close', 18))), list);
    const place = () => { const r = scroller.getBoundingClientRect(); Object.assign(thumbsPane.style, { top: r.top + 'px', height: r.height + 'px' }); };
    document.body.append(thumbsPane); place();
    addEventListener('resize', place);
    thumbsOff = renderThumbs(list, { width: 126, onPick: (n) => { goToPage(n); if (innerWidth < 768) closeThumbs(); } });
    const prevOff = thumbsOff; thumbsOff = () => { prevOff(); removeEventListener('resize', place); };
    ribbon.refresh();
  }
  function closeThumbs() { thumbsOff?.(); thumbsOff = null; thumbsPane?.remove(); thumbsPane = null; thumbItems = []; ribbon.refresh(); }
  async function openTiles() {
    await ensurePageMode();
    if (thumbsPane) closeThumbs();
    const grid = h('div', { class: 'tiles-grid' });
    const wrap = h('div', { class: 'tiles-view', role: 'dialog', 'aria-label': 'Vue en pavé' },
      h('header', { class: 'tiles-head' }, h('b', {}, `Vue en pavé · ${pageCount} page${pageCount > 1 ? 's' : ''}`), h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn', 'aria-label': 'Fermer', onclick: () => close() }, icon('close', 22))), grid);
    document.body.append(wrap);
    const tw = innerWidth < 520 ? Math.floor((innerWidth - 56) / 2) : innerWidth < 900 ? 170 : 200;
    const off = renderThumbs(grid, { width: tw, onPick: (n) => { close(); setTimeout(() => goToPage(n, false), 30); } });
    const close = () => { off(); wrap.remove(); thumbItems = []; document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => grid.querySelector('.cur')?.scrollIntoView({ block: 'center' }));
  }

  function headingList() {
    const heads = [];
    editor.state.doc.descendants((n, pos) => { if (n.type.name === 'heading') heads.push({ level: n.attrs.level, text: n.textContent.trim() || '(titre vide)', pos }); });
    if (!heads.length) return heads;
    if (mode === 'page' && !reader) {
      const M = metrics(settings), z = curZoom(), top = sheetEl.getBoundingClientRect().top;
      heads.forEach((hd) => { const el = editor.view.nodeDOM(hd.pos); hd.page = el instanceof HTMLElement ? clampN(Math.floor((el.getBoundingClientRect().top - top) / z / M.hpx) + 1, 1, pageCount) : 1; });
    } else { const pg = estimateHeadingPages(); heads.forEach((hd, i) => { hd.page = pg[i] || 1; }); }
    return heads;
  }
  function openGoto(startTab = 'page') {
    let sh, tab = startTab;
    const body = h('div', { class: 'form' });
    const tabs = h('div', { class: 'choice' });
    const draw = () => {
      tabs.replaceChildren(...[['page', 'Page'], ['titres', 'Titres du document']].map(([k, l]) => h('button', { class: 'chip' + (tab === k ? ' on' : ''), onclick: () => { tab = k; draw(); } }, l)));
      body.replaceChildren(tabs, tab === 'page' ? pageTab() : titlesTab());
    };
    const pageTab = () => {
      const N = pageCount; let v = curPage();
      const num = h('input', { class: 'field bignum', type: 'number', inputmode: 'numeric', min: '1', max: String(N), value: String(v), 'aria-label': 'Numéro de page' });
      const rng = h('input', { class: 'rng', type: 'range', min: '1', max: String(Math.max(1, N)), value: String(v), 'aria-label': 'Faire défiler les pages' });
      const set = (n, go = true) => { v = clampN(Math.round(+n) || 1, 1, N); num.value = String(v); rng.value = String(v); if (go) goToPage(v, false); };
      rng.addEventListener('input', () => set(rng.value));
      num.addEventListener('change', () => set(num.value));
      num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); set(num.value); sh.close(); } });
      const b = (label, fn) => h('button', { type: 'button', class: 'btn sm', onclick: fn }, label);
      setTimeout(() => { num.focus(); num.select(); }, 280);
      return h('div', { class: 'form' },
        h('div', { class: 'goto-big' }, h('span', {}, 'Page'), num, h('span', {}, `/ ${N}`)), rng,
        h('div', { class: 'row gotobtns' }, b('⏮ Première', () => set(1)), b('−10', () => set(v - 10)), b('−1', () => set(v - 1)), b('+1', () => set(v + 1)), b('+10', () => set(v + 10)), b('Dernière ⏭', () => set(N))),
        h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => { set(num.value); sh.close(); } }, 'Aller à la page')));
    };
    const titlesTab = () => {
      const heads = headingList();
      if (!heads.length) return h('p', { class: 'muted' }, 'Aucun titre dans ce document. Appliquez les styles « Titre 1, 2, 3 » pour créer un plan de navigation.');
      return h('div', { class: 'menu-list' }, heads.map((hd) => h('button', { class: 'menu-item plan l' + hd.level, onclick: () => { sh.close(); editor.chain().focus().setTextSelection(hd.pos + 1).scrollIntoView().run(); } },
        h('span', { class: 'mi-text' }, h('b', {}, hd.text)), h('span', { class: 'plan-p' }, `p. ${hd.page}`))));
    };
    sh = sheet('Aller à…', body, { wide: true });
    draw();
  }

  /* ---------- Mode lecteur et paramètres de lecture ---------- */
  const rd = { size: 19, width: 720, lh: 1.7, font: 'sans', theme: 'light', ...pref.get('reader', {}) };
  const RD_THEMES = { light: ['Clair', '#ffffff', '#1b2233'], sepia: ['Sépia', '#f4ecd8', '#3b2f1e'], dark: ['Sombre', '#121826', '#e3e8f5'], black: ['Noir', '#000000', '#cfd3dc'] };
  const $readerProgress = h('i', { class: 'reader-progress' });
  function applyReader() {
    root.classList.toggle('reader', reader);
    root.dataset.rt = rd.theme;
    root.style.setProperty('--rd-size', rd.size + 'px');
    root.style.setProperty('--rd-max', rd.width ? rd.width + 'px' : 'none');
    root.style.setProperty('--rd-lh', String(rd.lh));
    root.style.setProperty('--rd-font', rd.font === 'serif' ? 'Cambria, Caladea, Georgia, serif' : 'Calibri, Carlito, system-ui, sans-serif');
    root.style.setProperty('--rd-bg', RD_THEMES[rd.theme][1]);
    root.style.setProperty('--rd-fg', RD_THEMES[rd.theme][2]);
    editor.setEditable(!reader);
    document.body.classList.toggle('reading', reader);
  }
  function enterReader() {
    if (reader) return;
    reader = true; hideTip(); if (findOpen) toggleFind(false);
    closeThumbs(); applyReader(); scheduleLayout(); ribbon.refresh();
    setTimeout(updatePagePill, 60);
  }
  function exitReader() { if (!reader) return; reader = false; applyReader(); scheduleLayout(); ribbon.refresh(); setTimeout(updatePagePill, 60); }
  function toggleReader() { if (reader) exitReader(); else enterReader(); }
  function openReadSettings() {
    const save = () => { pref.set('reader', rd); applyReader(); scheduleLayout(); };
    const size = h('input', { class: 'rng', type: 'range', min: '14', max: '34', step: '1', value: String(rd.size), 'aria-label': 'Taille du texte', oninput: (e) => { rd.size = +e.target.value; sv.textContent = rd.size + ' px'; save(); } });
    const sv = h('b', {}, rd.size + ' px');
    const opt = (list, key) => h('div', { class: 'choice' }, list.map(([v, l]) => h('button', { type: 'button', class: 'chip' + (rd[key] === v ? ' on' : ''), onclick: (e) => { rd[key] = v; e.currentTarget.parentNode.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); save(); } }, l)));
    const themes = h('div', { class: 'ccards rt' }, Object.entries(RD_THEMES).map(([k, [l, bg, fg]]) => h('button', { type: 'button', class: 'ccard' + (rd.theme === k ? ' on' : ''), onclick: (e) => { rd.theme = k; themes.querySelectorAll('.ccard').forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); save(); } },
      h('span', { class: 'rt-sample', style: { background: bg, color: fg } }, 'Aa'), h('b', {}, l))));
    sheet('Paramètres de lecture', h('div', { class: 'form' },
      h('label', {}, h('span', { class: 'row between' }, 'Taille du texte', sv), size),
      h('h3', {}, 'Largeur du texte'), opt([[560, 'Étroite'], [720, 'Moyenne'], [900, 'Large'], [0, 'Pleine']], 'width'),
      h('h3', {}, 'Interligne'), opt([[1.4, 'Serré'], [1.7, 'Normal'], [2, 'Aéré'], [2.3, 'Très aéré']], 'lh'),
      h('h3', {}, 'Police'), opt([['sans', 'Sans empattement'], ['serif', 'Avec empattement']], 'font'),
      h('h3', {}, 'Thème'), themes,
      reader ? null : h('button', { class: 'btn primary', onclick: () => { document.querySelector('.sheet-back .icon-btn')?.click(); enterReader(); } }, icon('book', 18), 'Lancer le mode lecteur')));
  }
  const readerBar = h('div', { class: 'reader-bar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Quitter le mode lecteur', onclick: exitReader }, icon('close', 22)),
    h('div', { class: 'rb-title' }, h('b', {}, title)),
    h('button', { class: 'icon-btn', 'aria-label': 'Aller à une page', onclick: () => openGoto() }, icon('gotopage', 22)),
    h('button', { class: 'icon-btn', 'aria-label': 'Paramètres de lecture', onclick: openReadSettings }, icon('size', 22)),
    $readerProgress);
  root.append(readerBar);
  function toggleWordCount() { showWc = !showWc; pref.set('wc', showWc); updateStatus(); updatePagePill(); ribbon.refresh(); }

  /* ---------- Démarrage ---------- */
  ready = true;
  applyPageVars(root, settings);
  scheduleLayout();
  updateStatus();
  undoBtn.disabled = true; redoBtn.disabled = true;
  if (!docRec.json) scheduleSave(100);
  scheduleInline(1500);
  if (editor.isEmpty) setTimeout(() => editor.commands.focus('end'), 300);

  return {
    flush: async () => { if (!discarded && dirty) await save(); },
    destroy() {
      destroyed = true;
      clearTimeout(saveTimer);
      clearInterval(autoTimer);
      tip.remove(); pagePill.remove(); closeThumbs(); document.body.classList.remove('reading');
      clearTimeout(inlineTimer);
      ro.disconnect();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
      removeEventListener('pagehide', onPageHide);
      removeEventListener('beforeunload', onBeforeUnload);
      removeEventListener('resize', scheduleLayout);
      vv?.removeEventListener('resize', fitViewport);
      vv?.removeEventListener('scroll', fitViewport);
      editor.destroy();
    },
  };
}
