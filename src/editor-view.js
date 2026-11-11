// Écran d'édition : éditeur, pagination visuelle, zoom, recherche, boîtes de dialogue, enregistrement auto.
import { Editor, findParentNode } from '@tiptap/core';
import { TableMap } from '@tiptap/pm/tables';
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

import { ParagraphFormat, PageBreak, ColumnBreak, LumaImage, LumaCell, SearchReplace, searchKey, TableOfContents, CommentMark, InsertionMark, DeletionMark, TrackChanges, collectChanges } from './extensions.js';
import { buildRibbon } from './ribbon.js';
import { h, icon, dropdown, sheet, menuList, toast, promptDialog, confirmDialog, saveBlob, shareBlob, safeName, applyTheme } from './ui.js';
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
  let destroyed = false;
  let persisted = false;
  let inlineTimer;
  let comments = (docRec.comments || []).map((c) => ({ replies: [], resolved: false, ...c }));

  /* ---------- DOM ---------- */
  const titleInput = h('input', { class: 'title-input', value: title, 'aria-label': 'Titre du document', placeholder: 'Document sans titre', enterkeyhint: 'done',
    onchange: () => { title = titleInput.value.trim() || 'Document sans titre'; titleInput.value = title; scheduleSave(0); },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); titleInput.blur(); editor.commands.focus(); } } });
  const saveState = h('span', { class: 'save-state' }, 'Enregistré');
  const undoBtn = h('button', { class: 'icon-btn', 'aria-label': 'Annuler', onmousedown: (e) => e.preventDefault(), onclick: () => editor.chain().focus().undo().run() }, icon('undo', 22));
  const redoBtn = h('button', { class: 'icon-btn', 'aria-label': 'Rétablir', onmousedown: (e) => e.preventDefault(), onclick: () => editor.chain().focus().redo().run() }, icon('redo', 22));
  const saveBtn = h('button', { class: 'save-btn', 'aria-label': 'Enregistrer le document', title: 'Enregistrer (Ctrl+S)', onclick: () => manualSave() }, icon('save', 20), h('span', {}, 'Enregistrer'));
  const topbar = h('header', { class: 'topbar' },
    h('button', { class: 'mark-btn', 'aria-label': 'Mes documents', title: 'Mes documents', onclick: () => leave() }, h('img', { src: './icons/icon-192.png', alt: 'Luma Office' })),
    titleInput, saveState, saveBtn, undoBtn, redoBtn,
    h('button', { class: 'icon-btn', 'aria-label': 'Menu fichier', onclick: () => openFileMenu() }, icon('more', 22)));

  const pmHost = h('div', { class: 'pm-host' });
  const overlay = h('div', { class: 'hf-layer', 'aria-hidden': 'true' });
  const sheetEl = h('div', { class: 'paper' }, overlay, pmHost);
  const stage = h('div', { class: 'stage' }, sheetEl);
  const scroller = h('main', { class: 'scroller' }, stage);
  const findBar = h('div', { class: 'findbar', hidden: true });
  const statusbar = h('footer', { class: 'statusbar' });
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
      CharacterCount, ParagraphFormat, PageBreak, ColumnBreak, SearchReplace, TableOfContents, CommentMark, InsertionMark, DeletionMark, TrackChanges,
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
    onTransaction: () => { ribbon.refresh(); updateStatus(); scheduleHandles(); updatePill(); undoBtn.disabled = !editor.can().undo(); redoBtn.disabled = !editor.can().redo(); },
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
  function scheduleSave(delay = 700) {
    saveState.textContent = 'Enregistrement…';
    saveState.classList.add('busy');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, delay);
  }
  async function save() {
    clearTimeout(saveTimer);
    if (destroyed) return;
    const text = editor.getText({ blockSeparator: ' ' }).trim();
    docRec = { ...docRec, title, json: editor.getJSON(), settings, comments, updated: Date.now(), preview: text.slice(0, 160), words: editor.storage.characterCount.words() };
    try {
      await putDoc(docRec);
      saveState.textContent = 'Enregistré';
      if (!persisted) persist().then((ok) => { persisted = ok; });
    } catch (err) {
      saveState.textContent = 'Échec de l’enregistrement';
      toast(err?.name === 'QuotaExceededError' ? 'Espace de stockage plein : supprimez des documents ou des images.' : 'Impossible d’enregistrer le document sur cet appareil.', 5000);
    }
    saveState.classList.remove('busy');
  }
  const onHide = () => { if (document.visibilityState === 'hidden') save(); };
  document.addEventListener('visibilitychange', onHide);
  addEventListener('pagehide', save);

  async function leave() { await save(); hooks.onBack(); }
  async function manualSave() {
    await save();
    saveBtn.classList.add('ok');
    saveBtn.replaceChildren(icon('accept', 20), h('span', {}, 'Enregistré'));
    toast('Document enregistré sur cet appareil ✓');
    setTimeout(() => { saveBtn.classList.remove('ok'); saveBtn.replaceChildren(icon('save', 20), h('span', {}, 'Enregistrer')); }, 1800);
  }

  /* ---------- Statistiques / barre d'état ---------- */
  function updateStatus() {
    const cc = editor.storage.characterCount;
    const words = cc.words();
    const z = mode === 'page' ? Math.round(curZoom() * 100) + ' %' : '';
    const nChanges = collectChanges(editor.state.doc).length;
    statusbar.replaceChildren(...[
      editor.storage.trackChanges.enabled || nChanges ? h('span', { class: 'track-flag' }, `${editor.storage.trackChanges.enabled ? '● Suivi' : 'Suivi'} : ${nChanges} modif.`) : null,
      h('span', {}, `${words} mot${words > 1 ? 's' : ''}`),
      h('span', {}, `${cc.characters()} caractères`),
      h('span', {}, mode === 'page' ? `${pageCount} page${pageCount > 1 ? 's' : ''}` : 'Mode adapté'),
      h('span', { class: 'grow' }),
      h('span', {}, z),
    ].filter(Boolean));
  }

  /* ---------- Pagination visuelle, zoom ---------- */
  const fitZoom = () => Math.max(0.3, Math.min(1.15, (scroller.clientWidth - 20) / metrics(settings).wpx));
  const curZoom = () => (mode !== 'page' ? 1 : zoomMode === 'fit' ? fitZoom() : zoomMode);
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
    root.classList.toggle('mode-reflow', mode !== 'page');
    if (mode !== 'page') {
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
      h('label', {}, 'Espacement après le paragraphe', after)));
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
      editor.chain().focus().setImage({ src, alt: file.name.replace(/\.[^.]+$/, ''), width: Math.round(Math.min(w, maxW)) }).run();
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
    if (destroyed || dragging) return;
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

  /* ---------- Démarrage ---------- */
  applyPageVars(root, settings);
  scheduleLayout();
  updateStatus();
  undoBtn.disabled = true; redoBtn.disabled = true;
  if (!docRec.json) scheduleSave(100);
  scheduleInline(1500);
  if (editor.isEmpty) setTimeout(() => editor.commands.focus('end'), 300);

  return {
    flush: save,
    destroy() {
      destroyed = true;
      clearTimeout(saveTimer);
      clearTimeout(inlineTimer);
      ro.disconnect();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
      removeEventListener('pagehide', save);
      removeEventListener('resize', scheduleLayout);
      vv?.removeEventListener('resize', fitViewport);
      vv?.removeEventListener('scroll', fitViewport);
      editor.destroy();
    },
  };
}
