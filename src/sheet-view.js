// Lecteur de classeurs Excel (.xlsx / .xlsm) et CSV : feuilles, formats, barre de formule, recherche, conversion en document.
import { h, icon, toast, saveBlob, safeName } from './ui.js';
import { putDoc } from './storage.js';
import { readXlsx, readCsv, colName, sheetToHtml } from './xlsx-read.js';
import { viewerTopbar, deleteItem, searchSheet } from './viewer-ui.js';
import { norm, terms } from './search.js';

const CHUNK = 1000;

async function decodeCsv(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

export async function mountSheet(host, rec, hooks) {
  const root = h('div', { class: 'viewer' });
  root.append(viewerTopbar(rec, hooks, () => []), h('div', { class: 'vload' }, h('div', { class: 'spin' }), 'Ouverture du classeur…'));
  host.replaceChildren(root);
  let book;
  try {
    const buf = await rec.blob.arrayBuffer();
    book = rec.fmt === 'csv' ? readCsv(await decodeCsv(buf)) : await readXlsx(buf);
    if (!book.sheets.length) throw new Error('vide');
  } catch (e) {
    root.replaceChildren(viewerTopbar(rec, hooks, () => [deleteItem(rec, hooks)]), h('div', { class: 'vload' }, h('p', {}, 'Impossible de lire ce classeur.'), h('button', { class: 'btn', onclick: () => hooks.onBack() }, 'Retour')));
    return { flush() {}, destroy() {} };
  }

  // index de recherche de la bibliothèque
  if (!rec.text) {
    const preview = book.sheets[0].rows.filter(Boolean).slice(0, 4).map((r) => r.map((c) => c?.t || '').filter(Boolean).join(' · ')).join('  |  ');
    rec = { ...rec, text: book.text.slice(0, 400000), preview: preview.slice(0, 160), sheetsCount: book.sheets.length };
    putDoc(rec).catch(() => {});
  }

  let si = 0, limit = CHUNK, selected = null;
  const addr = h('span', { class: 'addr' }, '');
  const fx = h('span', { class: 'fx' }, '');
  const fbar = h('div', { class: 'fbar' }, addr, h('i', {}, 'fx'), fx);
  const gridWrap = h('main', { class: 'sheet-scroll' });
  const tabs = h('footer', { class: 'sheet-tabs' });

  const cellStyle = (c) => {
    if (!c) return '';
    let s = '';
    if (c.b) s += 'font-weight:700;'; if (c.i) s += 'font-style:italic;';
    if (c.color) s += `color:${c.color};`; if (c.bg) s += `background:${c.bg};`;
    if (c.al) s += `text-align:${c.al === 'centerContinuous' ? 'center' : c.al};`;
    if (c.wrap) s += 'white-space:pre-wrap;';
    return s;
  };

  function renderGrid(keepScroll) {
    const sh = book.sheets[si];
    const rows = Math.min(sh.maxRow, limit);
    const cols = Math.max(1, sh.maxCol);
    const skip = new Set(), span = new Map();
    for (const m of sh.merges) {
      span.set(`${m.r1}:${m.c1}`, { rs: m.r2 - m.r1 + 1, cs: m.c2 - m.c1 + 1 });
      for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) skip.add(`${r}:${c}`);
    }
    const table = h('table', { class: 'grid' });
    const colgroup = h('colgroup', {}, h('col', { style: { width: '44px' } }));
    for (let c = 0; c < cols; c++) colgroup.append(h('col', { style: { width: (sh.cols[c] || 90) + 'px' } }));
    table.append(colgroup);
    table.append(h('thead', {}, h('tr', {}, h('th', { class: 'corner' }), ...Array.from({ length: cols }, (_, c) => h('th', { class: 'ch' }, colName(c))))));
    const tb = h('tbody');
    for (let r = 0; r < rows; r++) {
      const tr = h('tr', {}, h('th', { class: 'rh' }, String(r + 1)));
      const row = sh.rows[r];
      for (let c = 0; c < cols; c++) {
        if (skip.has(`${r}:${c}`)) continue;
        const cell = row?.[c];
        const sp = span.get(`${r}:${c}`);
        const td = h('td', { 'data-r': r, 'data-c': c, style: cellStyle(cell), colspan: sp?.cs > 1 ? sp.cs : null, rowspan: sp?.rs > 1 ? sp.rs : null }, cell?.t || '');
        tr.append(td);
      }
      tb.append(tr);
    }
    table.append(tb);
    const st = gridWrap.scrollTop, sl = gridWrap.scrollLeft;
    gridWrap.replaceChildren(...[table, sh.maxRow > rows ? h('button', { class: 'btn more-rows', onclick: () => { limit += CHUNK; renderGrid(true); } }, `Afficher ${Math.min(CHUNK, sh.maxRow - rows)} lignes de plus (${sh.maxRow - rows} restantes)`) : null].filter(Boolean));
    if (keepScroll) { gridWrap.scrollTop = st; gridWrap.scrollLeft = sl; }
    table.addEventListener('click', (e) => { const td = e.target.closest('td'); if (td) select(+td.dataset.r, +td.dataset.c, td); });
    select(null);
  }
  function select(r, c, td) {
    gridWrap.querySelector('td.sel')?.classList.remove('sel');
    if (r == null) { addr.textContent = ''; fx.textContent = ''; return; }
    td ||= gridWrap.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    td?.classList.add('sel');
    const cell = book.sheets[si].rows[r]?.[c];
    addr.textContent = colName(c) + (r + 1);
    fx.textContent = cell?.f || cell?.t || '';
    selected = { r, c };
  }
  function renderTabs() {
    tabs.replaceChildren(...book.sheets.map((s, i) => h('button', { class: 'stab' + (i === si ? ' on' : ''), onclick: () => { si = i; limit = CHUNK; renderTabs(); gridWrap.scrollTo(0, 0); renderGrid(); } }, s.name)));
    tabs.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function openSearch() {
    searchSheet({
      title: 'Rechercher dans le classeur', placeholder: 'Valeur ou texte…',
      run: async (q) => {
        const ts = terms(q), out = [];
        book.sheets.forEach((s, i) => { s.rows.forEach((row, r) => row?.forEach((cell, c) => { if (cell?.t && out.length < 200 && ts.every((t) => norm(cell.t).includes(t))) out.push({ i, r, c, t: cell.t }); })); });
        return out;
      },
      render: (m, close) => h('button', { class: 'sres-item', onclick: () => { close(); goCell(m); } }, h('b', {}, `${book.sheets[m.i].name} · ${colName(m.c)}${m.r + 1}`), h('span', { class: 'snip' }, m.t.slice(0, 120))),
    });
  }
  function goCell({ i, r, c }) {
    if (i !== si) { si = i; renderTabs(); }
    if (r >= limit) limit = Math.ceil((r + 1) / CHUNK) * CHUNK;
    renderGrid();
    const td = gridWrap.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    select(r, c, td);
    td?.scrollIntoView({ block: 'center', inline: 'center' });
  }

  const menu = () => [
    { icon: 'search', label: 'Rechercher dans le classeur', run: openSearch },
    { icon: 'word', label: 'Insérer cette feuille dans un document', hint: 'Crée un document modifiable avec le tableau', run: () => hooks.onConvert({ title: `${rec.title} — ${book.sheets[si].name}`, html: sheetToHtml(book.sheets[si]) }) },
    { icon: 'download', label: 'Télécharger le fichier', run: () => saveBlob(rec.blob, safeName(rec.title) + '.' + (rec.fmt || 'xlsx')) },
    { sep: 'Fichier' },
    deleteItem(rec, hooks),
  ];
  root.replaceChildren(viewerTopbar(rec, hooks, menu), fbar, gridWrap, tabs);
  if (book.sheets.length < 2) tabs.hidden = true;
  renderTabs(); renderGrid();
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch(); } };
  document.addEventListener('keydown', onKey);
  void selected; void icon; void toast;
  return { flush: async () => {}, destroy() { document.removeEventListener('keydown', onKey); } };
}
