// Ruban d'outils façon Office, adapté au tactile : onglets + groupes défilables.
import { h, icon, dropdown } from './ui.js';

export const FONTS = ['Calibri', 'Cambria', 'Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Trebuchet MS', 'Garamond', 'Courier New', 'Tahoma',
  'Open Sans', 'Roboto', 'Lato', 'Montserrat', 'Poppins', 'Nunito', 'Source Sans 3', 'Merriweather', 'Lora', 'Playfair Display', 'Dancing Script'];
export const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72];
export const DEFAULT_FONT = 'Calibri';
export const DEFAULT_SIZE = 11;

// nom de police utilisable en CSS (guillemets si espaces ou chiffres, ex. « Source Sans 3 »)
export const cssFam = (f) => (/[\s\d]/.test(f) ? `"${f}"` : f);
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
    const d = dropdown({ options: o.options, get: o.get, set: o.set, title: o.title, width: o.w, labelFont: o.labelFont });
    refreshers.push(d.refresh);
    return d.el;
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
          select({ title: 'Style de paragraphe', w: 118, options: [['p', 'Normal', { style: { fontSize: '15px' } }], ['h1', 'Titre 1', { style: { fontSize: '22px', fontWeight: 700, color: '#1f3864' } }], ['h2', 'Titre 2', { style: { fontSize: '18px', fontWeight: 700, color: '#1f3864' } }], ['h3', 'Titre 3', { style: { fontSize: '16px', fontWeight: 700, color: '#1f3864' } }], ['quote', 'Citation', { style: { fontStyle: 'italic', color: '#595959' } }], ['code', 'Bloc de code', { style: { fontFamily: 'Consolas, "Courier New", monospace', fontSize: '14px' } }]], get: getStyle, set: setStyle }),
          select({ title: 'Police', w: 140, labelFont: true, options: FONTS.map((f) => [f, f, { style: { fontFamily: cssFam(f) } }]), get: () => norm(textAttr('fontFamily')) || DEFAULT_FONT, set: (v) => editor.chain().focus().setFontFamily(cssFam(v)).run() }),
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
          btn({ icon: 'blankpage', label: 'Page vierge', run: () => app.insertBlankPage() }),
          btn({ icon: 'pageBreak', label: 'Saut de page', run: run((c) => c.insertPageBreak().run()) }),
          btn({ icon: 'colbreak', label: 'Saut de colonne', run: run((c) => c.insertColumnBreak().run()) }),
        ),
        group(
          btn({ icon: 'table', label: 'Tableau', run: () => app.openTableSheet() }),
          btn({ icon: 'text2tab', label: 'Texte → tableau', title: 'Convertir le texte sélectionné en tableau', run: () => app.textToTable() }),
          btn({ icon: 'image', label: 'Image', run: () => app.pickImage(false) }),
          btn({ icon: 'camera', label: 'Photo', run: () => app.pickImage(true) }),
          btn({ icon: 'shape', label: 'Formes', run: () => app.openShapesSheet() }),
        ),
        group(
          btn({ icon: 'link', label: 'Lien', run: () => app.openLink(), active: () => editor.isActive('link') }),
          btn({ icon: 'commentAdd', label: 'Commentaire', run: () => app.addComment() }),
        ),
        group(
          btn({ icon: 'header', label: 'En-tête', title: 'En-tête de page', run: () => app.openHeaderSheet() }),
          btn({ icon: 'header', label: 'Pied de page', run: () => app.openHeaderSheet() }),
          btn({ icon: 'hash', label: 'Pagination', title: 'Numéros de page', run: () => app.openNumberSheet(), active: () => app.settings.pageNumbers }),
        ),
        group(
          btn({ icon: 'textbox', label: 'Zone de texte', run: () => app.openTextBoxSheet() }),
          btn({ icon: 'dropcap', label: 'Lettrine', run: () => app.toggleDropCap(), active: () => app.dropCapOn }),
          btn({ icon: 'clock', label: 'Date et heure', run: () => app.openDateSheet() }),
          btn({ icon: 'symbol', label: 'Symboles', run: () => app.openSymbols() }),
        ),
        group(
          btn({ icon: 'math', label: 'Équation', title: 'Éditeur de formules mathématiques', run: () => app.openMath() }),
          btn({ icon: 'bookmark', label: 'Signet', run: () => app.openBookmarks() }),
          btn({ icon: 'xref', label: 'Renvoi', title: 'Lien vers un titre ou un signet', run: () => app.openXref() }),
          btn({ icon: 'field', label: 'Champ', title: 'Champ de publipostage', run: () => app.insertField() }),
        ),
        group(
          btn({ icon: 'endnote', label: 'Note de fin', run: () => app.openEndnote() }),
          btn({ icon: 'toc', label: 'Sommaire', title: 'Table des matières', run: () => app.insertToc() }),
          btn({ icon: 'hr', label: 'Ligne', run: run((c) => c.setHorizontalRule().run()) }),
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
        group(
          btn({ icon: 'sort', label: 'Trier A→Z', title: 'Trier la colonne (croissant)', run: () => app.sortTable('asc') }),
          btn({ icon: 'sort', label: 'Trier Z→A', title: 'Trier la colonne (décroissant)', run: () => app.sortTable('desc') }),
          btn({ icon: 'sigma', label: 'Formule', title: 'Somme, moyenne, minimum, maximum', run: () => app.openFormula() }),
          btn({ icon: 'history', label: 'Recalculer', run: () => app.recalc() }),
        ),
        group(
          btn({ icon: 'borders', label: 'Bordures', title: 'Style, couleur et épaisseur des bordures', run: () => app.openTableBorders() }),
          btn({ icon: 'tab2text', label: 'En texte', title: 'Convertir le tableau en texte', run: () => app.tableToText() }),
        ),
        group(btn({ icon: 'colw', label: 'Largeurs', run: () => app.openColWidth() })),
        group(btn({ icon: 'trash', label: 'Suppr. tableau', run: run((c) => c.deleteTable().run()) })),
      ],
    },
    {
      id: 'image', label: 'Image', contextual: isImage, build: () => [
        group(
          btn({ icon: 'up', label: 'Monter', run: () => app.moveImageBlock(-1) }),
          btn({ icon: 'down', label: 'Descendre', run: () => app.moveImageBlock(1) }),
          btn({ icon: 'alignCenter', label: 'Habillage', title: 'Habillage et position', run: () => app.openWrapSheet() }),
        ),
        group(...[25, 50, 75, 100].map((p) => btn({ icon: 'fullimg', label: p + ' %', run: () => app.sizeImage(p) }))),
        alignGroup(),
        group(
          btn({ icon: 'shape', label: 'Forme', title: 'Modifier la forme', run: () => app.openShapesSheet(), disabled: () => !app.shapeSelected }),
          btn({ icon: 'edit', label: 'Texte alt.', run: () => app.editAlt() }),
          btn({ icon: 'trash', label: 'Supprimer', run: run((c) => c.deleteSelection().run()) }),
        ),
        h('div', { class: 'rg hint' }, h('small', {}, 'Astuce : glissez la poignée ✥ sur l’image pour la déplacer')),
      ],
    },
    {
      id: 'textbox', label: 'Zone de texte', contextual: () => editor.isActive('textBox'), build: () => [
        group(...Object.entries(app.TB_PRESETS).map(([k, pr]) => btn({ icon: 'textbox', label: pr.label, run: () => app.setTextBox({ fill: pr.fill, border: pr.border, accent: pr.accent }) }))),
        group(...[50, 75, 100].map((w) => btn({ icon: 'fullimg', label: w + ' %', run: () => app.setTextBox({ width: w }), active: () => editor.getAttributes('textBox').width === w }))),
        group(
          btn({ icon: 'alignLeft', label: 'À gauche', run: () => app.setTextBox({ align: 'left' }), active: () => editor.getAttributes('textBox').align === 'left' }),
          btn({ icon: 'alignCenter', label: 'Centrée', run: () => app.setTextBox({ align: 'center' }), active: () => editor.getAttributes('textBox').align === 'center' }),
          btn({ icon: 'alignRight', label: 'À droite', run: () => app.setTextBox({ align: 'right' }), active: () => editor.getAttributes('textBox').align === 'right' }),
        ),
        group(btn({ icon: 'trash', label: 'Supprimer', run: () => app.removeTextBox() })),
      ],
    },
    {
      id: 'layout', label: 'Mise en page', build: () => [
        group(
          btn({ icon: 'margins', label: 'Marges', run: () => app.openMarginSheet() }),
          btn({ icon: 'portrait', label: 'Portrait', run: () => app.updateSettings({ orientation: 'portrait' }), active: () => app.settings.orientation === 'portrait' }),
          btn({ icon: 'landscape', label: 'Paysage', run: () => app.updateSettings({ orientation: 'landscape' }), active: () => app.settings.orientation === 'landscape' }),
          btn({ icon: 'ruler', label: 'Taille', title: 'Taille du papier', run: () => app.openSizeSheet() }),
          btn({ icon: 'columns', label: 'Colonnes', run: () => app.openColumnsSheet(), active: () => app.settings.columns.count > 1, dyn: () => (app.settings.columns.count > 1 ? `${app.settings.columns.count} colonnes` : 'Colonnes') }),
        ),
        group(
          btn({ icon: 'pageBreak', label: 'Saut de page', run: run((c) => c.insertPageBreak().run()) }),
          btn({ icon: 'colbreak', label: 'Saut de colonne', run: run((c) => c.insertColumnBreak().run()) }),
        ),
        group(
          btn({ icon: 'watermark', label: 'Filigrane', run: () => app.openWatermarkSheet(), active: () => !!app.settings.watermark.text }),
          btn({ icon: 'pborder', label: 'Bordures', title: 'Bordures de page', run: () => app.openBordersSheet(), active: () => app.settings.pageBorder.style !== 'none' }),
        ),
        group(
          btn({ icon: 'header', label: 'En-tête / pied', run: () => app.openHeaderSheet(), active: () => !!(app.settings.header || app.settings.footer) }),
          btn({ icon: 'hash', label: 'N° de page', run: () => app.openNumberSheet(), active: () => app.settings.pageNumbers }),
          btn({ icon: 'firstpage', label: '1re page', title: 'Première page différente', run: () => app.updateSettings({ firstPageDifferent: !app.settings.firstPageDifferent }), active: () => app.settings.firstPageDifferent }),
        ),
        group(
          btn({ icon: 'hyphen', label: 'Césure', title: 'Coupure automatique des mots', run: () => app.updateSettings({ hyphenate: !app.settings.hyphenate }), active: () => app.settings.hyphenate }),
          btn({ icon: 'spacing', label: 'Interligne', title: 'Interligne, espacement et retraits', run: () => app.openSpacing() }),
        ),
      ],
    },
    {
      id: 'review', label: 'Révision', build: () => [
        group(
          btn({ icon: 'sparkle', label: 'Assistant IA', title: 'Reformuler, corriger, résumer, traduire, rédiger avec Gemini', run: () => app.openAI() }),
        ),
        group(
          btn({ icon: 'commentAdd', label: 'Commenter', run: () => app.addComment() }),
          btn({ icon: 'comment', label: 'Commentaires', run: () => app.openComments(), dyn: () => `Commentaires${app.commentCount ? ' (' + app.commentCount + ')' : ''}` }),
        ),
        group(
          btn({ icon: 'track', label: 'Suivi', title: 'Suivi des modifications', run: () => app.toggleTrack(), active: () => app.tracking }),
          btn({ icon: 'up', label: 'Précédente', run: run((c) => c.prevChange().run()) }),
          btn({ icon: 'down', label: 'Suivante', run: run((c) => c.nextChange().run()) }),
          btn({ icon: 'accept', label: 'Accepter', run: () => app.resolveChange(true) }),
          btn({ icon: 'reject', label: 'Rejeter', run: () => app.resolveChange(false) }),
          btn({ icon: 'acceptAll', label: 'Tout accepter', run: run((c) => c.acceptChanges().run()) }),
          btn({ icon: 'rejectAll', label: 'Tout rejeter', run: run((c) => c.rejectChanges().run()) }),
        ),
        group(
          btn({ icon: 'search', label: 'Rechercher', run: () => app.toggleFind() }),
          btn({ icon: 'stats', label: 'Statistiques', run: () => app.openStats() }),
        ),
        group(
          btn({ icon: 'spell', label: 'Orthographe', run: () => app.toggleSpell(), active: () => app.spell }),
          select({ title: 'Langue du document', w: 150, options: [['fr-FR', 'Français'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es-ES', 'Español'], ['de-DE', 'Deutsch'], ['it-IT', 'Italiano'], ['pt-PT', 'Português'], ['ar', 'العربية']], get: () => app.settings.lang, set: (v) => app.updateSettings({ lang: v }) }),
        ),
      ],
    },
    {
      id: 'tools', label: 'Outils', build: () => [
        group(
          btn({ icon: 'sparkle', label: 'Assistant IA', title: 'Reformuler, corriger, résumer, traduire, rédiger avec Gemini', run: () => app.openAI() }),
        ),
        group(
          btn({ icon: 'history', label: 'Versions', title: 'Historique des versions', run: () => app.openVersions() }),
          btn({ icon: 'compare', label: 'Comparer', title: 'Comparer avec un autre document', run: () => app.openCompare() }),
        ),
        group(
          btn({ icon: 'speaker', label: 'Lire', title: 'Lire le document à voix haute', run: () => app.readAloud(), active: () => app.speaking }),
          btn({ icon: 'scan', label: 'OCR', title: 'Photographier une page et la transformer en texte', run: () => app.openOcr() }),
        ),
        group(
          btn({ icon: 'mail', label: 'Publipostage', title: 'Générer des lettres à partir d’une liste Excel', run: () => app.openMerge() }),
          btn({ icon: 'field', label: 'Champ', title: 'Insérer un champ de fusion', run: () => app.insertField() }),
        ),
        group(
          btn({ icon: 'lock', label: 'Protéger', title: 'Mot de passe et permissions', run: () => app.openLock(), active: () => app.locked }),
        ),
      ],
    },
    {
      id: 'view', label: 'Affichage', build: () => [
        group(
          btn({ icon: 'book', label: 'Mode lecteur', run: () => app.toggleReader(), active: () => app.reader }),
          btn({ icon: 'file', label: 'Mode page', run: () => app.setMode(app.mode === 'page' ? 'reflow' : 'page'), dyn: () => (app.mode === 'page' ? 'Mode page' : 'Mode adapté'), active: () => app.mode === 'page' }),
          btn({ icon: 'grid', label: 'Vue en pavé', title: 'Toutes les pages en mosaïque', run: () => app.openTiles() }),
          btn({ icon: 'sidebar', label: 'Miniatures', run: () => app.toggleThumbs(), active: () => app.thumbsOpen }),
        ),
        group(
          btn({ icon: 'gotopage', label: 'Aller à la page', run: () => app.openGoto('page') }),
          btn({ icon: 'list', label: 'Plan', title: 'Titres du document', run: () => app.openGoto('titres') }),
        ),
        group(
          btn({ icon: 'zoomOut', label: 'Zoom −', run: () => app.zoomBy(-0.1) }),
          btn({ icon: 'fit', label: 'Ajuster', run: () => app.zoomFit() }),
          btn({ icon: 'zoomIn', label: 'Zoom +', run: () => app.zoomBy(0.1) }),
        ),
        group(
          btn({ icon: 'words', label: 'Nombre de mots', run: () => app.toggleWordCount(), active: () => app.showWc }),
          btn({ icon: 'stats', label: 'Statistiques', run: () => app.openStats() }),
          btn({ icon: 'size', label: 'Lecture', title: 'Paramètres de lecture', run: () => app.openReadSettings() }),
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
