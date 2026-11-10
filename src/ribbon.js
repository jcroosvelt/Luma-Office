// Ruban d'outils façon Office, adapté au tactile : onglets + groupes défilables.
import { h, icon } from './ui.js';

export const FONTS = ['Calibri', 'Cambria', 'Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Trebuchet MS', 'Garamond', 'Courier New', 'Tahoma'];
export const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72];
export const DEFAULT_FONT = 'Calibri';
export const DEFAULT_SIZE = 11;

const norm = (f) => (f || '').split(',')[0].replace(/["']/g, '').trim();

export function buildRibbon(app) {
  const { editor } = app;
  const refreshers = [];
  const run = (fn) => () => { fn(editor.chain().focus()); };

  const btn = (o) => {
    const b = h('button', {
      class: 'rb' + (o.label ? ' labeled' : ''), type: 'button', title: o.title || o.label, 'aria-label': o.title || o.label,
      onmousedown: (e) => e.preventDefault(), onclick: () => o.run(),
    }, icon(o.icon, 22), o.label ? h('span', { class: 'rl' }, o.label) : null);
    if (o.swatch) {
      const bar = h('span', { class: 'swatch' });
      b.append(bar);
      refreshers.push(() => { bar.style.background = o.swatch() || 'transparent'; });
    }
    if (o.active || o.disabled) {
      refreshers.push(() => {
        b.classList.toggle('on', !!o.active?.());
        b.disabled = !!o.disabled?.();
      });
    }
    if (o.dyn) refreshers.push(() => { const l = b.querySelector('.rl'); if (l) l.textContent = o.dyn(); });
    return b;
  };

  const select = (o) => {
    const s = h('select', { class: 'rs', title: o.title, 'aria-label': o.title, style: { width: o.w + 'px' }, onchange: () => { o.set(s.value); } },
      o.options.map(([v, l]) => h('option', { value: String(v) }, l)));
    refreshers.push(() => {
      const v = String(o.get());
      if (![...s.options].some((x) => x.value === v)) s.append(h('option', { value: v }, v));
      if (s.value !== v) s.value = v;
    });
    return s;
  };

  const group = (...items) => h('div', { class: 'rg' }, items);

  const sel = () => editor.state.selection;
  const isImage = () => sel().node?.type?.name === 'image';
  const inList = () => editor.isActive('listItem') || editor.isActive('taskItem');
  const textAttr = (k) => editor.getAttributes('textStyle')[k];

  const getStyle = () => {
    if (editor.isActive('heading')) return 'h' + editor.getAttributes('heading').level;
    if (editor.isActive('blockquote')) return 'quote';
    if (editor.isActive('codeBlock')) return 'code';
    return 'p';
  };
  const setStyle = (v) => {
    const c = editor.chain().focus();
    if (v === 'p') { if (editor.isActive('blockquote')) c.unsetBlockquote(); c.setParagraph(); }
    else if (v[0] === 'h') c.setHeading({ level: +v[1] });
    else if (v === 'quote') { if (!editor.isActive('blockquote')) c.setBlockquote(); }
    else if (v === 'code') c.setCodeBlock();
    c.run();
  };
  const curSize = () => parseFloat(textAttr('fontSize')) || DEFAULT_SIZE;
  const stepSize = (dir) => {
    const cur = curSize();
    const next = dir > 0 ? SIZES.find((s) => s > cur) : [...SIZES].reverse().find((s) => s < cur);
    if (next) editor.chain().focus().setFontSize(next + 'pt').run();
  };
  const indent = (d) => {
    if (inList()) { const t = editor.isActive('taskItem') ? 'taskItem' : 'listItem'; editor.chain().focus()[d > 0 ? 'sinkListItem' : 'liftListItem'](t).run(); }
    else editor.chain().focus().changeIndent(d).run();
  };

  const align = (a, ic, t) => btn({ icon: ic, title: t, run: run((c) => c.setTextAlign(a).run()), active: () => editor.isActive({ textAlign: a }) });
  const alignGroup = () => group(align('left', 'alignLeft', 'Aligner à gauche'), align('center', 'alignCenter', 'Centrer'), align('right', 'alignRight', 'Aligner à droite'), align('justify', 'justify', 'Justifier'));

  /* ----- onglets ----- */
  const TABS = [
    {
      id: 'home', label: 'Accueil', build: () => [
        group(
          select({ title: 'Style de paragraphe', w: 118, options: [['p', 'Normal'], ['h1', 'Titre 1'], ['h2', 'Titre 2'], ['h3', 'Titre 3'], ['quote', 'Citation'], ['code', 'Bloc de code']], get: getStyle, set: setStyle }),
          select({ title: 'Police', w: 132, options: FONTS.map((f) => [f, f]), get: () => norm(textAttr('fontFamily')) || DEFAULT_FONT, set: (v) => editor.chain().focus().setFontFamily(v).run() }),
          select({ title: 'Taille de police', w: 66, options: SIZES.map((s) => [s, String(s).replace('.', ',')]), get: () => curSize(), set: (v) => editor.chain().focus().setFontSize(v + 'pt').run() }),
          btn({ icon: 'size', title: 'Agrandir la police', run: () => stepSize(1) }),
          btn({ icon: 'sizeDown', title: 'Réduire la police', run: () => stepSize(-1) }),
        ),
        group(
          btn({ icon: 'bold', title: 'Gras', run: run((c) => c.toggleBold().run()), active: () => editor.isActive('bold') }),
          btn({ icon: 'italic', title: 'Italique', run: run((c) => c.toggleItalic().run()), active: () => editor.isActive('italic') }),
          btn({ icon: 'underline', title: 'Souligné', run: run((c) => c.toggleUnderline().run()), active: () => editor.isActive('underline') }),
          btn({ icon: 'strike', title: 'Barré', run: run((c) => c.toggleStrike().run()), active: () => editor.isActive('strike') }),
          btn({ icon: 'sub', title: 'Indice', run: run((c) => c.toggleSubscript().run()), active: () => editor.isActive('subscript') }),
          btn({ icon: 'sup', title: 'Exposant', run: run((c) => c.toggleSuperscript().run()), active: () => editor.isActive('superscript') }),
        ),
        group(
          btn({ icon: 'textColor', title: 'Couleur du texte', run: () => app.pickColor('text'), swatch: () => textAttr('color') || '#111111' }),
          btn({ icon: 'highlight', title: 'Surligner', run: () => app.pickColor('highlight'), swatch: () => editor.getAttributes('highlight').color || null }),
          btn({ icon: 'eraser', title: 'Effacer la mise en forme', run: run((c) => c.unsetAllMarks().clearNodes().run()) }),
        ),
        alignGroup(),
        group(
          btn({ icon: 'list', title: 'Liste à puces', run: run((c) => c.toggleBulletList().run()), active: () => editor.isActive('bulletList') }),
          btn({ icon: 'listOrdered', title: 'Liste numérotée', run: run((c) => c.toggleOrderedList().run()), active: () => editor.isActive('orderedList') }),
          btn({ icon: 'todo', title: 'Liste de tâches', run: run((c) => c.toggleTaskList().run()), active: () => editor.isActive('taskList') }),
          btn({ icon: 'outdent', title: 'Diminuer le retrait', run: () => indent(-1) }),
          btn({ icon: 'indent', title: 'Augmenter le retrait', run: () => indent(1) }),
          btn({ icon: 'spacing', title: 'Interligne et espacement', run: () => app.openSpacing() }),
        ),
      ],
    },
    {
      id: 'insert', label: 'Insertion', build: () => [
        group(
          btn({ icon: 'table', label: 'Tableau', run: () => app.openTableSheet() }),
          btn({ icon: 'image', label: 'Image', run: () => app.pickImage(false) }),
          btn({ icon: 'camera', label: 'Photo', run: () => app.pickImage(true) }),
          btn({ icon: 'link', label: 'Lien', run: () => app.openLink(), active: () => editor.isActive('link') }),
        ),
        group(
          btn({ icon: 'hr', label: 'Ligne', run: run((c) => c.setHorizontalRule().run()) }),
          btn({ icon: 'pageBreak', label: 'Saut de page', run: run((c) => c.insertPageBreak().run()) }),
          btn({ icon: 'calendar', label: 'Date', run: run((c) => c.insertContent(new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })).run()) }),
          btn({ icon: 'symbol', label: 'Symboles', run: () => app.openSymbols() }),
        ),
        group(
          btn({ icon: 'quote', label: 'Citation', run: run((c) => c.toggleBlockquote().run()), active: () => editor.isActive('blockquote') }),
          btn({ icon: 'code', label: 'Code', run: run((c) => c.toggleCodeBlock().run()), active: () => editor.isActive('codeBlock') }),
          btn({ icon: 'todo', label: 'Tâches', run: run((c) => c.toggleTaskList().run()), active: () => editor.isActive('taskList') }),
        ),
      ],
    },
    {
      id: 'table', label: 'Tableau', contextual: () => editor.isActive('table'), build: () => [
        group(
          btn({ icon: 'rowAbove', label: 'Ligne ↑', run: run((c) => c.addRowBefore().run()) }),
          btn({ icon: 'rowBelow', label: 'Ligne ↓', run: run((c) => c.addRowAfter().run()) }),
          btn({ icon: 'delRow', label: 'Suppr. ligne', run: run((c) => c.deleteRow().run()) }),
        ),
        group(
          btn({ icon: 'colLeft', label: 'Col. ←', run: run((c) => c.addColumnBefore().run()) }),
          btn({ icon: 'colRight', label: 'Col. →', run: run((c) => c.addColumnAfter().run()) }),
          btn({ icon: 'delCol', label: 'Suppr. col.', run: run((c) => c.deleteColumn().run()) }),
        ),
        group(
          btn({ icon: 'merge', label: 'Fusionner', run: run((c) => c.mergeCells().run()), disabled: () => !editor.can().mergeCells() }),
          btn({ icon: 'split', label: 'Scinder', run: run((c) => c.splitCell().run()), disabled: () => !editor.can().splitCell() }),
          btn({ icon: 'headerRow', label: 'En-tête', run: run((c) => c.toggleHeaderRow().run()) }),
          btn({ icon: 'fill', label: 'Fond', run: () => app.pickColor('cell') }),
        ),
        group(btn({ icon: 'trash', label: 'Suppr. tableau', run: run((c) => c.deleteTable().run()) })),
      ],
    },
    {
      id: 'image', label: 'Image', contextual: isImage, build: () => [
        group(
          ...[25, 50, 75, 100].map((p) => btn({ icon: 'fullimg', label: p + ' %', run: () => app.sizeImage(p) })),
        ),
        alignGroup(),
        group(
          btn({ icon: 'edit', label: 'Texte alt.', run: () => app.editAlt() }),
          btn({ icon: 'trash', label: 'Supprimer', run: run((c) => c.deleteSelection().run()) }),
        ),
      ],
    },
    {
      id: 'layout', label: 'Mise en page', build: () => [
        group(
          btn({ icon: 'file', label: 'Format', run: () => app.openPageSheet() }),
          btn({ icon: 'orient', label: 'Orientation', run: () => app.updateSettings({ orientation: app.settings.orientation === 'portrait' ? 'landscape' : 'portrait' }), dyn: () => (app.settings.orientation === 'portrait' ? 'Portrait' : 'Paysage') }),
          btn({ icon: 'margins', label: 'Marges', run: () => app.openMarginSheet() }),
        ),
        group(
          btn({ icon: 'header', label: 'En-tête / pied', run: () => app.openHeaderSheet() }),
          btn({ icon: 'hash', label: 'N° de page', run: () => app.updateSettings({ pageNumbers: !app.settings.pageNumbers }), active: () => app.settings.pageNumbers }),
          btn({ icon: 'pageBreak', label: 'Saut de page', run: run((c) => c.insertPageBreak().run()) }),
        ),
      ],
    },
    {
      id: 'review', label: 'Révision', build: () => [
        group(
          btn({ icon: 'search', label: 'Rechercher', run: () => app.toggleFind() }),
          btn({ icon: 'stats', label: 'Statistiques', run: () => app.openStats() }),
        ),
        group(
          btn({ icon: 'spell', label: 'Orthographe', run: () => app.toggleSpell(), active: () => app.spell }),
          select({ title: 'Langue du document', w: 150, options: [['fr-FR', 'Français'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es-ES', 'Español'], ['de-DE', 'Deutsch'], ['it-IT', 'Italiano'], ['pt-PT', 'Português'], ['ar', 'العربية']], get: () => app.settings.lang, set: (v) => app.updateSettings({ lang: v }) }),
        ),
        group(
          btn({ icon: 'undo', label: 'Annuler', run: run((c) => c.undo().run()), disabled: () => !editor.can().undo() }),
          btn({ icon: 'redo', label: 'Rétablir', run: run((c) => c.redo().run()), disabled: () => !editor.can().redo() }),
        ),
      ],
    },
    {
      id: 'view', label: 'Affichage', build: () => [
        group(
          btn({ icon: 'zoomOut', label: 'Zoom −', run: () => app.zoomBy(-0.1) }),
          btn({ icon: 'fit', label: 'Ajuster', run: () => app.zoomFit(), dyn: () => 'Ajuster' }),
          btn({ icon: 'zoomIn', label: 'Zoom +', run: () => app.zoomBy(0.1) }),
        ),
        group(
          btn({ icon: 'file', label: 'Mode page', run: () => app.setMode(app.mode === 'page' ? 'reflow' : 'page'), dyn: () => (app.mode === 'page' ? 'Page' : 'Adapté'), active: () => app.mode === 'page' }),
          btn({ icon: 'moon', label: 'Thème', run: () => app.cycleTheme(), dyn: () => ({ auto: 'Auto', light: 'Clair', dark: 'Sombre' }[app.theme]) }),
        ),
      ],
    },
  ];

  /* ----- DOM ----- */
  const tabsEl = h('div', { class: 'rtabs', role: 'tablist' });
  const bodyEl = h('div', { class: 'rbody', role: 'tabpanel' });
  const root = h('div', { class: 'ribbon' }, bodyEl, tabsEl);
  root.addEventListener('mousedown', (e) => { if (!/^(SELECT|INPUT|OPTION)$/.test(e.target.tagName)) e.preventDefault(); });

  let active = 'home';
  let built = null;
  const visibleTabs = () => TABS.filter((t) => !t.contextual || t.contextual());
  const ctxState = { table: false, image: false };

  function renderTabs() {
    tabsEl.replaceChildren(...visibleTabs().map((t) =>
      h('button', { class: 'rtab' + (t.id === active ? ' on' : '') + (t.contextual ? ' ctx' : ''), role: 'tab', 'aria-selected': t.id === active, onclick: () => show(t.id) }, t.label)));
  }
  function show(id) {
    active = id;
    refreshers.length = 0;
    const tab = TABS.find((t) => t.id === id);
    bodyEl.replaceChildren(...tab.build());
    bodyEl.scrollLeft = 0;
    built = id;
    renderTabs();
    refresh();
  }
  function refresh() {
    // onglets contextuels : on y bascule automatiquement à l'entrée dans le contexte
    for (const t of TABS.filter((x) => x.contextual)) {
      const now = !!t.contextual();
      if (now && !ctxState[t.id]) { ctxState[t.id] = true; show(t.id); return; }
      if (!now && ctxState[t.id]) {
        ctxState[t.id] = false;
        if (active === t.id) { show('home'); return; }
        renderTabs();
      }
    }
    refreshers.forEach((f) => f());
  }
  show('home');
  return { el: root, refresh, show, get active() { return built; } };
}
