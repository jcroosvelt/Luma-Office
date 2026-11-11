// Export PDF vectoriel (texte sélectionnable, polices intégrées) via pdfmake, et impression native.
import { metrics, columnWidthCm, pageNumberText } from './layout.js';
import { artBorderSvg } from './borders.js';
import { formatDate } from './datefmt.js';

const PT_CM = 72 / 2.54;
const FAMILY = {
  calibri: 'Carlito', carlito: 'Carlito', cambria: 'Caladea', arial: 'Arimo', verdana: 'Arimo', tahoma: 'Arimo', 'trebuchet ms': 'Arimo',
  helvetica: 'Arimo', 'times new roman': 'Tinos', garamond: 'Tinos', georgia: 'Gelasio', 'courier new': 'Cousine', consolas: 'Cousine',
};
const FILES = (fam) => ({ normal: `${fam}-Regular.ttf`, bold: `${fam}-Bold.ttf`, italics: `${fam}-Italic.ttf`, bolditalics: `${fam}-BoldItalic.ttf` });
const ALL_FAMILIES = ['Carlito', 'Caladea', 'Arimo', 'Tinos', 'Gelasio', 'Cousine'];
const LH = 1.15 / 1.22; // interligne CSS -> multiplicateur pdfmake (basé sur la hauteur naturelle de la police)

const famOf = (name) => FAMILY[(name || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase()] || 'Carlito';
const colorOf = (c) => {
  if (!c) return undefined;
  const m = c.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
  return m ? '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('') : c;
};
const ptSize = (s) => { const n = parseFloat(s); return n ? (/px$/.test(s) ? n * 0.75 : n) : undefined; };

async function dataUrl(src) {
  if (src.startsWith('data:image/png') || src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) {
    const img = new Image(); await new Promise((r) => { img.onload = img.onerror = r; img.src = src; });
    return { src, w: img.naturalWidth || 300, h: img.naturalHeight || 200 };
  }
  const img = new Image(); img.crossOrigin = 'anonymous';
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  const cv = document.createElement('canvas'); cv.width = img.naturalWidth || 300; cv.height = img.naturalHeight || 200;
  cv.getContext('2d').drawImage(img, 0, 0);
  return { src: cv.toDataURL('image/png'), w: cv.width, h: cv.height };
}

export async function buildPdf(json, settings, title, opts = {}) {
  const pdfMake = (await import('pdfmake/build/pdfmake.js')).default;
  const base = new URL(import.meta.env.BASE_URL || './', location.href).href;
  const fonts = {};
  const used = opts.families || ALL_FAMILIES;
  for (const f of used) fonts[f] = Object.fromEntries(Object.entries(FILES(f)).map(([k, v]) => [k, base + 'fonts/' + v]));
  pdfMake.addFonts(fonts);

  const M = metrics(settings);
  const m = settings.margins;
  const pageW = M.wcm * PT_CM, pageH = M.hcm * PT_CM;
  const nCols = Math.max(1, settings.columns?.count || 1);
  const gapPt = (settings.columns?.gap ?? 1.27) * PT_CM;
  const leftPt = (m.left + (settings.gutter || 0)) * PT_CM;
  const contentW = columnWidthCm(settings) * PT_CM; // largeur d'une colonne
  let headingId = 0;
  const mctx = document.createElement('canvas').getContext('2d');
  const measure = (t) => { mctx.font = '14.67px Calibri, Carlito, sans-serif'; return mctx.measureText(t).width * 0.75; };
  const tocItems = [];
  const endnotes = [];

  /* ----- inline ----- */
  async function runs(nodes = [], base = {}) {
    const out = [];
    for (const n of nodes) {
      if (n.type === 'hardBreak') { out.push({ text: '\n' }); continue; }
      if (n.type === 'dateField') { out.push({ text: formatDate(n.attrs?.fmt || 'long'), ...base }); continue; }
      if (n.type === 'endnote') { endnotes.push(n.attrs?.text || ''); out.push({ text: String(endnotes.length), sup: true, ...base }); continue; }
      if (n.type === 'image') {
        try {
          const im = await dataUrl(n.attrs.src);
          const w = Math.min((n.attrs.width || im.w) * 0.75, contentW);
          out.push({ _image: { image: im.src, width: w, height: (w * im.h) / im.w }, _float: n.attrs.float || null });
        } catch { /* ignorée */ }
        continue;
      }
      if (n.type !== 'text') continue;
      const o = { text: n.text, ...base };
      for (const mk of n.marks || []) {
        const a = mk.attrs || {};
        switch (mk.type) {
          case 'bold': o.bold = true; break;
          case 'italic': o.italics = true; break;
          case 'underline': o.decoration = [...(o.decoration ? [].concat(o.decoration) : []), 'underline']; break;
          case 'strike': o.decoration = [...(o.decoration ? [].concat(o.decoration) : []), 'lineThrough']; break;
          case 'subscript': o.sub = true; break;
          case 'superscript': o.sup = true; break;
          case 'code': o.font = 'Cousine'; o.background = '#f1f3f5'; break;
          case 'highlight': o.background = colorOf(a.color) || '#fff59d'; break;
          case 'link': o.link = a.href; o.color = '#0563c1'; o.decoration = [...(o.decoration ? [].concat(o.decoration) : []), 'underline']; break;
          case 'textStyle':
            if (a.color) o.color = colorOf(a.color);
            if (a.fontFamily) o.font = famOf(a.fontFamily);
            if (a.fontSize) o.fontSize = ptSize(a.fontSize);
            if (a.backgroundColor) o.background = colorOf(a.backgroundColor);
            break;
          case 'comment': break;
          case 'deletion': if (!opts.cleanTracked) { o.decoration = [...(o.decoration ? [].concat(o.decoration) : []), 'lineThrough']; o.color = '#c0392b'; } break;
          case 'insertion': if (!opts.cleanTracked) { o.color = '#1a7f37'; o.decoration = [...(o.decoration ? [].concat(o.decoration) : []), 'underline']; } break;
          default:
        }
      }
      if (o._skip) continue;
      out.push(o);
    }
    return out;
  }

  const plainText = (n) => (n.content || []).map((c) => (c.type === 'text' ? c.text : c.type === 'hardBreak' ? ' ' : plainText(c))).join('');

  /* ----- blocs ----- */
  async function para(node, o = {}) {
    const a = node.attrs || {};
    const isH = node.type === 'heading';
    const sizes = { 1: 20, 2: 15, 3: 13 };
    const base = { ...(o.run || {}) };
    if (isH) { base.bold = true; base.color = base.color || '#1f3864'; base.fontSize = sizes[a.level] || 13; }
    let nc = node.content;
    if (a.dropCap && nc?.[0]?.type === 'text' && nc[0].text) { const f = nc[0]; nc = [{ ...f, text: f.text[0], marks: [...(f.marks || []), { type: 'bold' }, { type: 'textStyle', attrs: { fontSize: '30pt' } }] }, ...(f.text.length > 1 ? [{ ...f, text: f.text.slice(1) }] : []), ...nc.slice(1)]; }
    let items = await runs(nc, base);
    // images inline : on les sort sur leur propre ligne
    if (items.some((i) => i._float)) items = [...items.filter((i) => i._float), ...items.filter((i) => !i._float)]; // image flottante : placée avant le texte
    const hasImg = items.some((i) => i._image);
    let content;
    if (hasImg) {
      content = [];
      let buf = [];
      const flush = () => { if (buf.length) content.push({ text: buf, alignment: a.textAlign, margin: [0, 0, 0, 2] }); buf = []; };
      for (const it of items) {
        if (it._image) { flush(); content.push({ ...it._image, alignment: it._float || a.textAlign || 'left', margin: [0, 2, 0, 4] }); } else buf.push(it);
      }
      flush();
      content = { stack: content };
    } else {
      content = { text: items.length ? items : ' ' };
    }
    const lh = a.lineHeight ? parseFloat(a.lineHeight) / 1.22 : LH;
    const node2 = {
      ...content,
      alignment: a.textAlign === 'justify' ? 'justify' : a.textAlign || 'left',
      lineHeight: lh,
      margin: [(a.indent || 0) * 36 + (o.left || 0), a.spaceBefore != null ? a.spaceBefore : isH ? 12 : 0, a.indentRight || 0, a.spaceAfter != null ? a.spaceAfter : o.after ?? (isH ? 5 : 8)],
    };
    if (isH) {
      const id = 'h' + ++headingId;
      node2.id = id;
      node2.tocItem = true;
      node2.tocStyle = { fontSize: 11 };
      tocItems.push({ id, level: a.level, text: plainText(node) });
      node2.headlineLevel = a.level;
      node2.keepWithNext = true;
      void id;
    }
    return node2;
  }

  async function blocks(nodes = [], o = {}) {
    const out = [];
    for (const n of nodes) { const r = await block(n, o); out.push(...r); }
    return out;
  }

  async function block(n, o) {
    switch (n.type) {
      case 'paragraph': case 'heading': return [await para(n, o)];
      case 'blockquote': {
        const inner = await blocks(n.content, { ...o, run: { italics: true, color: '#595959', ...(o.run || {}) } });
        return [{ table: { widths: [2.5, '*'], body: [[{ text: '', fillColor: '#b0b7c3' }, { stack: inner, margin: [8, 0, 0, 0] }]] }, layout: 'noBorders', margin: [(o.left || 0), 0, 0, 8] }];
      }
      case 'codeBlock': {
        const text = (n.content || []).map((c) => c.text).join('');
        return [{ table: { widths: ['*'], body: [[{ text: text || ' ', font: 'Cousine', fontSize: 10, lineHeight: 1, preserveLeadingSpaces: true }]] },
          layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#f1f3f5', paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 }, margin: [0, 0, 0, 8] }];
      }
      case 'horizontalRule':
        return [{ canvas: [{ type: 'line', x1: 0, y1: 4, x2: contentW, y2: 4, lineWidth: 0.75, lineColor: '#9aa0a6' }], margin: [0, 4, 0, 6] }];
      case 'pageBreak': return [{ _pagebreak: true }];
      case 'columnBreak': return [{ _colbreak: true }];
      case 'tableOfContents': return [{ _toc: true }];
      case 'bulletList': case 'orderedList': case 'taskList': return [await list(n, o)];
      case 'textBox': {
        const a = n.attrs || {}, inner = await blocks(n.content, { ...o, after: 4 });
        const w = Math.round(contentW * Math.min(100, a.width || 100) / 100), bc = a.border || '#0157e0';
        return [{ table: { widths: [w], body: [[{ stack: inner.length ? inner : [{ text: ' ' }], fillColor: a.fill || '#eaf2ff' }]] },
          layout: { hLineColor: () => bc, vLineColor: (i) => bc, hLineWidth: () => 1, vLineWidth: (i) => (i === 0 && a.accent ? 4 : 1), paddingLeft: () => 9, paddingRight: () => 9, paddingTop: () => 6, paddingBottom: () => 2 },
          alignment: a.align, margin: [a.align === 'left' ? 0 : a.align === 'right' ? contentW - w : (contentW - w) / 2, 0, 0, 8] }];
      }
      case 'table': return [await table(n), { text: '', margin: [0, 0, 0, 4] }];
      case 'image': return [await para({ type: 'paragraph', attrs: {}, content: [n] }, o)];
      default: return n.content ? blocks(n.content, o) : [];
    }
  }

  async function list(node, o) {
    const kind = node.type;
    const items = [];
    for (const item of node.content || []) {
      const kids = [];
      for (const c of item.content || []) {
        if (['bulletList', 'orderedList', 'taskList'].includes(c.type)) kids.push(await list(c, { ...o, after: 2 }));
        else kids.push(...(await block(c, { ...o, after: 3 })));
      }
      if (kind === 'taskList') {
        const chk = item.attrs?.checked;
        items.push({ columns: [{ width: 14, canvas: [
          { type: 'rect', x: 0, y: 2, w: 9, h: 9, r: 1, lineWidth: 0.9, lineColor: '#444' },
          ...(chk ? [{ type: 'polyline', lineWidth: 1.4, lineColor: '#0b63e5', points: [{ x: 1.8, y: 6.8 }, { x: 4.2, y: 9.2 }, { x: 8, y: 3.6 }] }] : []),
        ] }, { width: '*', stack: kids }], margin: [0, 0, 0, 2] });
      } else items.push({ stack: kids });
    }
    const common = { margin: [kind === 'taskList' ? 6 : 14, 0, 0, 8], markerColor: '#111' };
    if (kind === 'orderedList') return { ol: items, type: 'decimal', ...common, start: node.attrs?.start || 1, lineHeight: LH };
    if (kind === 'taskList') return { stack: items, margin: common.margin };
    return { ul: items, ...common, lineHeight: LH };
  }

  async function table(node) {
    const rows = node.content || [];
    const cols = (rows[0]?.content || []).reduce((s, c) => s + (c.attrs?.colspan || 1), 0) || 1;
    const widths = Array(cols).fill('*');
    let ci = 0;
    for (const c of rows[0]?.content || []) {
      const span = c.attrs?.colspan || 1;
      if (span === 1 && c.attrs?.colwidth?.[0]) widths[ci] = Math.max(20, c.attrs.colwidth[0] * 0.75);
      ci += span;
    }
    const body = [];
    const pending = []; // rowspans en cours : colonne -> lignes restantes
    for (const row of rows) {
      const line = [];
      let col = 0;
      const place = () => { while (pending[col] > 0) { line.push({ text: '' }); pending[col]--; col++; } };
      for (const cell of row.content || []) {
        place();
        const isHead = cell.type === 'tableHeader';
        const stack = await blocks(cell.content, { run: isHead ? { bold: true } : undefined, after: 2 });
        const span = cell.attrs?.colspan || 1, rs = cell.attrs?.rowspan || 1;
        const c = { stack: stack.length ? stack : [{ text: ' ' }], fillColor: cell.attrs?.backgroundColor ? colorOf(cell.attrs.backgroundColor) : isHead ? '#eef2f9' : undefined };
        if (span > 1) c.colSpan = span;
        if (rs > 1) c.rowSpan = rs;
        line.push(c);
        for (let k = 1; k < span; k++) line.push({});
        for (let k = 0; k < span; k++) pending[col + k] = rs - 1;
        col += span;
      }
      place();
      while (line.length < cols) line.push({ text: '' });
      body.push(line);
    }
    return {
      table: { widths, body, headerRows: rows[0]?.content?.[0]?.type === 'tableHeader' ? 1 : 0, dontBreakRows: true },
      layout: { hLineColor: () => '#a6a6a6', vLineColor: () => '#a6a6a6', hLineWidth: () => 0.75, vLineWidth: () => 0.75, paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3, paddingBottom: () => 2 },
      margin: [0, 0, 0, 8],
    };
  }

  // Conversion nœud par nœud (nécessaire pour répartir en colonnes)
  const perNode = [];
  for (const n of json.content || []) perNode.push(await block(n, {}));
  if (endnotes.length) perNode.push([
    { canvas: [{ type: 'line', x1: 0, y1: 2, x2: contentW, y2: 2, lineWidth: 0.75, lineColor: '#9aa0a6' }], margin: [0, 14, 0, 4] },
    { text: 'Notes de fin', bold: true, fontSize: 13, color: '#1f3864', margin: [0, 0, 0, 4] },
    ...endnotes.map((t, i) => ({ text: [{ text: `${i + 1}`, sup: true }, { text: ` ${t || '(note vide)'}` }], fontSize: 10, margin: [0, 0, 0, 2] })),
  ]);

  const expandToc = (arr) => arr.flatMap((c) => {
    if (!c._toc) return [c];
    const entries = tocItems;
    if (!entries.length) return [{ text: '(Aucun titre dans le document)', italics: true, color: '#888', margin: [0, 0, 0, 8] }];
    return [
      { text: 'Table des matières', bold: true, fontSize: 15, color: '#1f3864', margin: [0, 0, 0, 6] },
      ...entries.map((e) => {
        const indent = (e.level - 1) * 14;
        const tw = measure(e.text);
        const dots = Math.max(10, contentW - indent - tw - 34 - 12);
        return {
          columns: [
            { text: e.text, linkToDestination: e.id, width: 'auto' },
            { width: dots + 8, canvas: [{ type: 'line', x1: 6, y1: 10, x2: dots + 2, y2: 10, lineWidth: 0.9, lineColor: '#777', dash: { length: 0.9, space: 2.6 }, lineCap: 'round' }] },
            { pageReference: e.id, alignment: 'right', width: 30 },
          ],
          columnGap: 0, margin: [indent, 0, 0, 3], fontSize: 11,
        };
      }),
      { text: '', margin: [0, 0, 0, 8] },
    ];
  });

  // Hauteur (pt) de chaque bloc à la largeur d'une colonne, mesurée dans le navigateur
  function measureBlocks() {
    if (!opts.html) return null;
    const holder = document.createElement('div');
    holder.className = 'pdf-holder';
    holder.style.cssText = `position:fixed;left:0;top:0;width:${contentW / 0.75}px;z-index:-9999;visibility:hidden;pointer-events:none`;
    const inner = document.createElement('div');
    inner.className = 'doc-content';
    inner.style.cssText = `width:${contentW / 0.75}px;column-count:1`;
    inner.innerHTML = opts.html;
    holder.append(inner);
    document.body.append(holder);
    try {
      const kids = [...inner.children];
      if (kids.length !== perNode.length) return null;
      return kids.map((el) => (el.getBoundingClientRect().height + parseFloat(getComputedStyle(el).marginBottom || '0')) * 0.75);
    } finally { holder.remove(); }
  }

  let content;
  if (nCols > 1) {
    const heights = measureBlocks() || perNode.map((arr) => 40 + arr.length * 10);
    const cap = (M.hcm - m.top - m.bottom) * PT_CM * 0.9;
    const pages = [];
    let page = { cols: Array.from({ length: nCols }, () => []), used: Array(nCols).fill(0) };
    let ci = 0;
    const newPage = () => { pages.push(page); page = { cols: Array.from({ length: nCols }, () => []), used: Array(nCols).fill(0) }; ci = 0; };
    const nextCol = () => { ci++; if (ci >= nCols) newPage(); };
    perNode.forEach((arr, i) => {
      if (arr[0]?._pagebreak) { newPage(); return; }
      if (arr[0]?._colbreak) { nextCol(); return; }
      const hgt = heights[i] || 20;
      if (page.used[ci] > 0 && page.used[ci] + hgt > cap) nextCol();
      page.cols[ci].push(...expandToc(arr));
      page.used[ci] += hgt;
    });
    pages.push(page);
    content = pages.filter((pg) => pg.cols.some((c) => c.length)).map((pg, idx) => {
      const cols = [];
      const tallest = Math.min(cap, Math.max(...pg.used, 10));
      pg.cols.forEach((stack, k) => {
        if (k > 0) cols.push({ width: gapPt, canvas: settings.columns.rule ? [{ type: 'line', x1: gapPt / 2, y1: 0, x2: gapPt / 2, y2: tallest, lineWidth: 0.75, lineColor: '#8a93a6' }] : [] });
        cols.push({ width: contentW, stack: stack.length ? stack : [{ text: ' ' }] });
      });
      return { columns: cols, columnGap: 0, ...(idx > 0 ? { pageBreak: 'before' } : {}) };
    });
  } else {
    content = expandToc(perNode.flat()).flatMap((c) => (c._pagebreak || c._colbreak ? [{ text: '', pageBreak: 'after' }] : [c]));
  }
  if (!content.length) content = [{ text: ' ' }];

  // En-tête, pied de page, numéros, filigrane et bordures
  const hc = '#666666';
  const first = !!settings.firstPageDifferent;
  const marginsHF = (y) => [leftPt, y, m.right * PT_CM, 0];
  const num = (cur, count) => ({ text: pageNumberText(settings.pageNumberFormat, cur, count), alignment: settings.pageNumberAlign || 'center', fontSize: 9, color: hc });
  const hasHeader = !!settings.header?.trim() || (settings.pageNumbers && settings.pageNumberPos === 'top');
  const hasFooter = !!settings.footer?.trim() || (settings.pageNumbers && settings.pageNumberPos !== 'top');
  const bd = settings.pageBorder || { style: 'none' };
  const background = bd.style === 'none' ? undefined : bd.style === 'art' ? (cur, size) => {
    const off = bd.offset * PT_CM, w = size.width - 2 * off, hh = size.height - 2 * off;
    return { svg: artBorderSvg(w, hh, bd.art, bd.color, bd.artSize || 18), width: w, height: hh, absolutePosition: { x: off, y: off } };
  } : (cur, size) => {
    const off = bd.offset * PT_CM, lw = Math.max(0.5, bd.width);
    const rect = (inset, w) => ({ type: 'rect', x: inset, y: inset, w: size.width - 2 * inset, h: size.height - 2 * inset, lineWidth: w, lineColor: bd.color, ...(bd.style === 'dashed' ? { dash: { length: 6, space: 4 } } : {}) });
    return { canvas: bd.style === 'double' ? [rect(off, lw), rect(off + lw * 2.4, lw)] : [rect(off, lw)] };
  };
  const docDef = {
    pageSize: { width: pageW, height: pageH },
    pageMargins: [leftPt, m.top * PT_CM, m.right * PT_CM, m.bottom * PT_CM],
    info: { title: title || 'Document', creator: 'Luma Office', producer: 'Luma Office' },
    defaultStyle: { font: 'Carlito', fontSize: 11, lineHeight: LH },
    content,
    background,
    watermark: settings.watermark?.text?.trim() ? { text: settings.watermark.text.trim(), color: settings.watermark.color || '#b8bfcc', opacity: 0.35, bold: true, angle: -45, font: 'Carlito' } : undefined,
    header: hasHeader ? (cur, count) => (first && cur === 1 ? null : {
      margin: marginsHF(Math.max(10, (m.top * PT_CM) / 2 - 6)),
      stack: [
        settings.header?.trim() ? { text: settings.header, alignment: settings.headerAlign || 'center', fontSize: 9, color: hc, margin: [0, 0, 0, 2] } : null,
        settings.pageNumbers && settings.pageNumberPos === 'top' ? num(cur, count) : null,
      ].filter(Boolean),
    }) : undefined,
    footer: hasFooter ? (cur, count) => (first && cur === 1 ? null : {
      margin: marginsHF(Math.max(4, (m.bottom * PT_CM) / 2 - 10)),
      stack: [
        settings.footer?.trim() ? { text: settings.footer, alignment: settings.footerAlign || 'center', fontSize: 9, color: hc, margin: [0, 0, 0, 2] } : null,
        settings.pageNumbers && settings.pageNumberPos !== 'top' ? num(cur, count) : null,
      ].filter(Boolean),
    }) : undefined,
  };
  return pdfMake.createPdf(docDef).getBlob();
}

export function printDocument(settings, title) {
  const M = metrics(settings);
  const m = settings.margins;
  const esc = (t) => (t || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
  const box = 'font:9pt Calibri,Carlito,sans-serif;color:#666;white-space:pre-line;';
  const where = (a) => (a === 'left' ? 'left' : a === 'right' ? 'right' : 'center');
  const numContent = { 'page-of': '"Page " counter(page) " / " counter(pages)', of: 'counter(page) " / " counter(pages)', plain: 'counter(page)', dash: '"– " counter(page) " –"', 'page-only': '"Page " counter(page)' }[settings.pageNumberFormat] || 'counter(page)';
  const boxes = {};
  const add = (pos, part) => { (boxes[pos] ||= []).push(part); };
  if (settings.header?.trim()) add(`@top-${where(settings.headerAlign)}`, `"${esc(settings.header)}"`);
  if (settings.pageNumbers) add(`@${settings.pageNumberPos === 'top' ? 'top' : 'bottom'}-${where(settings.pageNumberAlign)}`, numContent);
  if (settings.footer?.trim()) add(`@bottom-${where(settings.footerAlign)}`, `"${esc(settings.footer)}"`);
  const rules = (list) => Object.entries(list).map(([pos, parts]) => `${pos}{content:${parts.join(' "\\A" ')};${box}}`).join('');
  let css = `@page{size:${M.wcm}cm ${M.hcm}cm;margin:${m.top}cm ${m.right}cm ${m.bottom}cm ${M.leftCm}cm;${rules(boxes)}}`;
  if (settings.firstPageDifferent) css += '@page :first{@top-left{content:none}@top-center{content:none}@top-right{content:none}@bottom-left{content:none}@bottom-center{content:none}@bottom-right{content:none}}';
  let st = document.getElementById('print-page-style');
  if (!st) { st = document.createElement('style'); st.id = 'print-page-style'; document.head.append(st); }
  st.textContent = css;
  const prev = document.title;
  document.title = title || 'Document';
  const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  setTimeout(() => window.print(), 50);
}
