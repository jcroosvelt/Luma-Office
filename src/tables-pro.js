// Tableaux intelligents : tri, calculs automatiques (somme, moyenne…), bordures personnalisées, texte ⇄ tableau.
import { TableMap } from '@tiptap/pm/tables';
import { findParentNode } from '@tiptap/core';
import { h, icon, sheet, toast } from './ui.js';

const isTable = (n) => n.type.name === 'table';
const isCell = (n) => n.type.name === 'tableCell' || n.type.name === 'tableHeader';
export const parseNum = (t) => {
  const s = (t || '').replace(/ /g, ' ').trim();
  if (!s || !/\d/.test(s)) return null;
  const m = s.replace(/[€$£%\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  return /^[-+]?\d*\.?\d+$/.test(m) ? parseFloat(m) : null;
};
const fmtNum = (n, unit) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Math.round(n * 1e6) / 1e6)}${unit ? ' ' + unit : ''}`;

function ctxOf(editor) {
  const { selection } = editor.state;
  const table = findParentNode(isTable)(selection);
  if (!table) return null;
  const cell = findParentNode(isCell)(selection);
  const map = TableMap.get(table.node);
  let rect = null;
  if (cell) rect = map.findCell(cell.pos - table.pos - 1);
  return { table, cell, map, rect };
}

/* ---------- tri ---------- */
export function sortTable(editor, dir = 'asc') {
  const c = ctxOf(editor);
  if (!c || !c.rect) { toast('Placez le curseur dans la colonne à trier'); return; }
  const { table, map, rect } = c, node = table.node;
  const rows = []; node.forEach((r) => rows.push(r));
  if (rows.some((r) => r.childCount !== map.width)) { toast('Le tri n’est pas possible avec des cellules fusionnées'); return; }
  let rowSpanned = false; node.descendants((n) => { if (isCell(n) && (n.attrs.rowspan || 1) > 1) rowSpanned = true; });
  if (rowSpanned) { toast('Le tri n’est pas possible avec des cellules fusionnées'); return; }
  const header = rows[0].childCount > 0 && rows[0].firstChild.type.name === 'tableHeader';
  const head = header ? [rows[0]] : [], data = header ? rows.slice(1) : rows;
  const col = rect.left;
  const key = (r) => r.child(col).textContent.trim();
  const sorted = [...data].sort((a, b) => {
    const x = key(a), y = key(b);
    if (!x && y) return 1; if (x && !y) return -1;
    const nx = parseNum(x), ny = parseNum(y);
    const r = nx != null && ny != null ? nx - ny : x.localeCompare(y, 'fr', { numeric: true, sensitivity: 'base' });
    return dir === 'asc' ? r : -r;
  });
  const t = node.type.create(node.attrs, [...head, ...sorted]);
  editor.view.dispatch(editor.state.tr.replaceWith(table.pos, table.pos + node.nodeSize, t));
  toast(`Trié par colonne ${col + 1} (${dir === 'asc' ? 'croissant' : 'décroissant'})`);
}

/* ---------- formules ---------- */
const FN = { SUM: 'Somme', AVERAGE: 'Moyenne', MIN: 'Minimum', MAX: 'Maximum', COUNT: 'Nombre de valeurs' };
export const FORMULAS = FN;
function compute(fn, nums) {
  if (!nums.length) return 0;
  switch (fn) {
    case 'SUM': return nums.reduce((a, b) => a + b, 0);
    case 'AVERAGE': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'MIN': return Math.min(...nums);
    case 'MAX': return Math.max(...nums);
    case 'COUNT': return nums.length;
    default: return 0;
  }
}
// Recalcule toutes les cellules à formule du document ; renvoie le nombre de cellules modifiées
export function recalcFormulas(editor) {
  const { state } = editor;
  const edits = [];
  state.doc.descendants((node, pos) => {
    if (!isTable(node)) return true;
    const map = TableMap.get(node);
    const grid = []; // texte par [ligne][colonne] et position de la cellule
    const at = (r, c) => { const rel = map.map[r * map.width + c]; return { rel, cell: node.nodeAt(rel) }; };
    for (let r = 0; r < map.height; r++) { grid[r] = []; for (let c = 0; c < map.width; c++) grid[r][c] = at(r, c); }
    for (let r = 0; r < map.height; r++) for (let c = 0; c < map.width; c++) {
      const { rel, cell } = grid[r][c];
      const f = cell?.attrs?.formula; if (!f) continue;
      if (c > 0 && grid[r][c - 1].rel === rel) continue; if (r > 0 && grid[r - 1][c].rel === rel) continue;
      const [fn, dir] = f.split(':');
      const nums = []; let unit = '';
      const take = (g) => { const t = g.cell.textContent; if (g.cell.attrs.formula && g.rel === rel) return true; const v = parseNum(t); if (v == null) return false; nums.push(v); const m = t.match(/([€$£%])\s*$/); if (m && !unit) unit = m[1]; return true; };
      if (dir === 'LEFT') { for (let k = c - 1; k >= 0 && take(grid[r][k]); k--); } else { for (let k = r - 1; k >= 0 && take(grid[k][c]); k--); }
      const text = fmtNum(compute(fn, nums), fn === 'COUNT' ? '' : unit);
      if (cell.textContent !== text) edits.push({ from: pos + 1 + rel + 1, to: pos + 1 + rel + cell.nodeSize - 1, text });
    }
    return false;
  });
  if (!edits.length) return 0;
  let tr = state.tr;
  for (const e of edits.sort((a, b) => b.from - a.from)) tr = tr.replaceWith(e.from, e.to, state.schema.nodes.paragraph.create(null, state.schema.text(e.text)));
  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
  return edits.length;
}
export function setFormula(editor, fn, dir) {
  const c = ctxOf(editor);
  if (!c || !c.cell) { toast('Placez le curseur dans une cellule du tableau'); return; }
  const tr = editor.state.tr.setNodeMarkup(c.cell.pos, null, { ...c.cell.node.attrs, formula: fn ? `${fn}:${dir}` : null });
  editor.view.dispatch(tr);
  if (fn) recalcFormulas(editor);
}
export function openFormulaSheet(editor) {
  const c = ctxOf(editor);
  if (!c || !c.cell) { toast('Placez le curseur dans une cellule du tableau'); return; }
  let s, fn = 'SUM', dir = 'ABOVE';
  const seg = (items, get, set) => h('div', { class: 'chips' }, items.map(([v, l]) => { const b = h('button', { class: 'chip' + (get() === v ? ' on' : ''), onclick: () => { set(v); b.parentNode.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); b.classList.add('on'); } }, l); return b; }));
  const has = !!c.cell.node.attrs.formula;
  s = sheet('Formule de calcul', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'La cellule affichera le résultat et se mettra à jour automatiquement quand vous modifiez les nombres.'),
    h('b', {}, 'Calcul'), seg(Object.entries(FN), () => fn, (v) => { fn = v; }),
    h('b', {}, 'Sur les nombres'), seg([['ABOVE', 'Au-dessus'], ['LEFT', 'À gauche']], () => dir, (v) => { dir = v; }),
    h('div', { class: 'row end' },
      has ? h('button', { class: 'btn', onclick: () => { setFormula(editor, null); s.close(); } }, 'Retirer la formule') : null,
      h('button', { class: 'btn primary', onclick: () => { setFormula(editor, fn, dir); s.close(); } }, 'Insérer'))));
}

/* ---------- bordures ---------- */
export const BSTYLES = { all: 'Toutes', outer: 'Extérieures', horizontal: 'Horizontales', vertical: 'Verticales', none: 'Aucune' };
export function openBordersSheet(editor) {
  const c = ctxOf(editor);
  if (!c) { toast('Placez le curseur dans un tableau'); return; }
  const a = c.table.node.attrs;
  let style = a.bstyle || 'all', color = a.bcolor || '#a6a6a6', width = a.bwidth || 1, s;
  const swatches = ['#a6a6a6', '#111111', '#1f3864', '#0b57d0', '#0f766e', '#2e7d32', '#b7791f', '#b3261e', '#6b2d5c'];
  const styleRow = h('div', { class: 'chips' }), colorRow = h('div', { class: 'color-row' }), widthRow = h('div', { class: 'chips' });
  const draw = () => {
    styleRow.replaceChildren(...Object.entries(BSTYLES).map(([k, l]) => h('button', { class: 'chip' + (style === k ? ' on' : ''), onclick: () => { style = k; draw(); } }, l)));
    colorRow.replaceChildren(...swatches.map((x) => h('button', { class: 'cdot' + (color === x ? ' on' : ''), style: `background:${x}`, 'aria-label': 'Couleur ' + x, onclick: () => { color = x; draw(); } })), h('input', { type: 'color', value: color, 'aria-label': 'Autre couleur', oninput: (e) => { color = e.target.value; draw(); } }));
    widthRow.replaceChildren(...[[0.5, 'Fine'], [1, 'Normale'], [2, 'Épaisse'], [3, 'Très épaisse']].map(([v, l]) => h('button', { class: 'chip' + (width === v ? ' on' : ''), onclick: () => { width = v; draw(); } }, l)));
  };
  draw();
  s = sheet('Bordures du tableau', h('div', { class: 'form' }, h('b', {}, 'Bordures'), styleRow, h('b', {}, 'Couleur'), colorRow, h('b', {}, 'Épaisseur'), widthRow,
    h('button', { class: 'btn primary', onclick: () => { editor.view.dispatch(editor.state.tr.setNodeMarkup(c.table.pos, null, { ...a, bstyle: style, bcolor: color, bwidth: width })); s.close(); } }, 'Appliquer')));
}

/* ---------- texte ⇄ tableau ---------- */
function detectSep(lines) {
  for (const [name, re] of [['tab', /\t/], ['semi', /;/], ['pipe', /\|/], ['comma', /,/], ['spaces', / {2,}/]]) if (lines.filter((l) => re.test(l)).length >= Math.max(1, Math.ceil(lines.length * 0.6))) return name;
  return 'tab';
}
const SEPS = { tab: /\t/, semi: /;/, pipe: /\|/, comma: /,/, spaces: / {2,}/ };
const SEP_LABEL = { tab: 'Tabulation', semi: 'Point-virgule', pipe: 'Barre verticale |', comma: 'Virgule', spaces: 'Espaces multiples' };

export function openTextToTable(editor) {
  const { state } = editor, { from, to } = state.selection;
  let topFrom = null, topTo = null;
  state.doc.forEach((node, offset) => {
    const st = offset, en = offset + node.nodeSize;
    if ((en > from && st < to) || (from === to && st <= from && en >= from)) { if (topFrom == null) topFrom = st; topTo = en; }
  });
  if (topFrom == null) { toast('Sélectionnez d’abord le texte à convertir', 3000); return; }
  const text = state.doc.textBetween(topFrom, topTo, '\n', '\n');
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  if (!lines.length) { toast('Sélectionnez d’abord le texte à convertir (une ligne = une ligne de tableau)', 3500); return; }
  let sep = detectSep(lines), header = true, s;
  const preview = h('div', { class: 'tt-prev' });
  const build = () => {
    const re = SEPS[sep];
    return lines.map((l) => l.split(re).map((x) => x.trim()));
  };
  const redraw = () => {
    const rows = build(), cols = Math.max(...rows.map((r) => r.length));
    preview.replaceChildren(h('small', { class: 'muted' }, `${rows.length} ligne${rows.length > 1 ? 's' : ''} × ${cols} colonne${cols > 1 ? 's' : ''}`),
      h('table', { class: 'tt-table' }, ...rows.slice(0, 5).map((r, i) => h('tr', {}, ...Array.from({ length: cols }, (_, k) => h(header && i === 0 ? 'th' : 'td', {}, r[k] || ''))))));
    sepRow.replaceChildren(...Object.entries(SEP_LABEL).map(([k, l]) => h('button', { class: 'chip' + (sep === k ? ' on' : ''), onclick: () => { sep = k; redraw(); } }, l)));
  };
  const sepRow = h('div', { class: 'chips' });
  const apply = () => {
    const rows = build(), cols = Math.max(...rows.map((r) => r.length));
    const cell = (t, th) => ({ type: th ? 'tableHeader' : 'tableCell', content: [{ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] }] });
    const json = { type: 'table', content: rows.map((r, i) => ({ type: 'tableRow', content: Array.from({ length: cols }, (_, k) => cell(r[k] || '', header && i === 0)) })) };
    const node = state.schema.nodeFromJSON(json);
    editor.view.dispatch(state.tr.replaceWith(topFrom, topTo, [node, state.schema.nodes.paragraph.create()]));
    s.close(); toast('Texte converti en tableau ✓');
  };
  s = sheet('Convertir le texte en tableau', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'Chaque ligne devient une ligne du tableau ; le séparateur découpe les colonnes.'),
    h('b', {}, 'Séparateur'), sepRow,
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { header = e.target.checked; redraw(); } }), ' La première ligne est un en-tête'),
    preview, h('button', { class: 'btn primary', onclick: apply }, 'Convertir')), { wide: true });
  redraw();
}
export function tableToText(editor) {
  const c = ctxOf(editor);
  if (!c) { toast('Placez le curseur dans un tableau'); return; }
  const { state } = editor, paras = [];
  c.table.node.forEach((row) => { const cells = []; row.forEach((cell) => cells.push(cell.textContent)); paras.push(state.schema.nodes.paragraph.create(null, state.schema.text(cells.join('\t') || ' '))); });
  editor.view.dispatch(state.tr.replaceWith(c.table.pos, c.table.pos + c.table.node.nodeSize, paras));
  toast('Tableau converti en texte (colonnes séparées par des tabulations)');
}
void icon;
