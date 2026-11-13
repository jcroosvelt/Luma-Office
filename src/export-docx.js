// Conversion du document (JSON ProseMirror) vers un vrai fichier Word (.docx).
import { metrics, CM_TWIP, CM_PX, columnWidthCm } from './layout.js';
import { MOTIFS } from './borders.js';
import { latexToText } from './math-text.js';

const TW_PX = 15; // 1 px = 15 twips
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

import { formatDate } from './datefmt.js';

function toHex(c) {
  if (!c) return undefined;
  c = c.trim();
  const m = c.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
  if (m) return [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
  if (HEX.test(c)) {
    c = c.replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    return c.toUpperCase();
  }
  return undefined;
}

function halfPoints(size) {
  if (!size) return undefined;
  const n = parseFloat(size);
  if (!n) return undefined;
  return Math.round((/px$/.test(size) ? n * 0.75 : n) * 2);
}

const firstFont = (f) => (f ? f.split(',')[0].replace(/["']/g, '').trim() : undefined);

async function loadImage(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  const w = img.naturalWidth || 300, h = img.naturalHeight || 200;
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.*)$/i.exec(src);
  let type, bytes;
  if (m) {
    type = m[1].toLowerCase().replace('jpeg', 'jpg');
    const bin = atob(m[2]);
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } else {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0);
    const bin = atob(cv.toDataURL('image/png').split(',')[1]);
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    type = 'png';
  }
  return { bytes, type, w, h };
}

export async function buildDocx(json, settings, title, commentList = []) {
  const D = await import('docx');
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun,
    PageBreak, Header, Footer, PageNumber, LevelFormat, BorderStyle, ShadingType, ExternalHyperlink, Tab,
    PageOrientation, LineRuleType, TableLayoutType, InsertedTextRun, DeletedTextRun, CommentRangeStart, CommentRangeEnd, CommentReference, TabStopType, LeaderType,
    ColumnBreak, PageBorderDisplay, PageBorderOffsetFrom, PageBorderZOrder, HorizontalPositionRelativeFrom, HorizontalPositionAlign, VerticalPositionRelativeFrom, VerticalPositionAlign, TextWrappingType,
  } = D;

  const M = metrics(settings);
  const nCols = Math.max(1, settings.columns?.count || 1);
  const contentTw = Math.round(columnWidthCm(settings) * CM_TWIP);
  const ctx = { orderedInstance: 0, trackId: 1, endnotes: [] };
  const cIdx = new Map();
  const liveComments = (commentList || []).filter((c) => !c.resolved);
  liveComments.forEach((c, i) => cIdx.set(c.id, i));
  const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
  const HEADING = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

  /* ----- inline ----- */
  async function inline(nodes = [], base = {}) {
    const out = [];
    let open = [];
    const closeAll = () => { open.forEach((id) => { out.push(new CommentRangeEnd(cIdx.get(id))); out.push(new TextRun({ children: [new CommentReference(cIdx.get(id))] })); }); open = []; };
    for (const n of nodes) {
      const ids = (n.marks || []).filter((m) => m.type === 'comment' && cIdx.has(m.attrs.id)).map((m) => m.attrs.id);
      for (const id of [...open]) if (!ids.includes(id)) { out.push(new CommentRangeEnd(cIdx.get(id))); out.push(new TextRun({ children: [new CommentReference(cIdx.get(id))] })); open = open.filter((x) => x !== id); }
      for (const id of ids) if (!open.includes(id)) { out.push(new CommentRangeStart(cIdx.get(id))); open.push(id); }
      if (n.type === 'hardBreak') { out.push(new TextRun({ break: 1 })); continue; }
      if (n.type === 'mathFormula') { out.push(new TextRun({ text: latexToText(n.attrs?.latex || ''), italics: true, font: 'Cambria Math', ...base })); continue; }
      if (n.type === 'mergeField') { out.push(new TextRun({ text: `«${n.attrs?.name || ''}»`, ...base })); continue; }
      if (n.type === 'dateField') { out.push(new TextRun({ text: formatDate(n.attrs?.fmt || 'long'), ...base })); continue; }
      if (n.type === 'endnote') { ctx.endnotes.push(n.attrs?.text || ''); out.push(new TextRun({ text: String(ctx.endnotes.length), superScript: true, ...base })); continue; }
      if (n.type === 'image') {
        try {
          const im = await loadImage(n.attrs.src);
          const maxW = contentTw / TW_PX;
          let w = n.attrs.width || im.w;
          w = Math.min(w, maxW);
          const fl = n.attrs.float === 'left' || n.attrs.float === 'right' ? n.attrs.float : null;
          out.push(new ImageRun({ type: im.type, data: im.bytes, transformation: { width: Math.round(w), height: Math.round((w * im.h) / im.w) },
            ...(fl ? { floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, align: fl === 'left' ? HorizontalPositionAlign.LEFT : HorizontalPositionAlign.RIGHT }, verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 }, wrap: { type: TextWrappingType.SQUARE, side: 'bothSides' }, margins: { left: 114300, right: 114300, top: 0, bottom: 0 } } } : {}),
            altText: { name: n.attrs.alt || 'Image', title: n.attrs.alt || 'Image', description: n.attrs.alt || 'Image' } }));
        } catch { /* image illisible : ignorée */ }
        continue;
      }
      if (n.type !== 'text') continue;
      const o = { text: n.text, ...base };
      let link, track;
      for (const mk of n.marks || []) {
        const a = mk.attrs || {};
        switch (mk.type) {
          case 'bold': o.bold = true; break;
          case 'italic': o.italics = true; break;
          case 'underline': o.underline = {}; break;
          case 'strike': o.strike = true; break;
          case 'subscript': o.subScript = true; break;
          case 'superscript': o.superScript = true; break;
          case 'code': o.font = 'Consolas'; o.shading = { type: ShadingType.CLEAR, fill: 'F1F3F5', color: 'auto' }; break;
          case 'highlight': { const f = toHex(a.color) || 'FFF59D'; o.shading = { type: ShadingType.CLEAR, fill: f, color: 'auto' }; break; }
          case 'link': if (!String(a.href || '').startsWith('#')) { link = a.href; o.color = '0563C1'; o.underline = {}; } break;
          case 'insertion': track = { kind: 'ins', author: a.author, date: a.date }; break;
          case 'deletion': track = { kind: 'del', author: a.author, date: a.date }; break;
          case 'textStyle':
            if (a.color) o.color = toHex(a.color);
            if (a.fontFamily) o.font = firstFont(a.fontFamily);
            if (a.fontSize) o.size = halfPoints(a.fontSize);
            if (a.backgroundColor) o.shading = { type: ShadingType.CLEAR, fill: toHex(a.backgroundColor) || 'FFFFFF', color: 'auto' };
            break;
          default:
        }
      }
      if (track) {
        const meta = { id: ctx.trackId++, author: track.author || 'Auteur', date: track.date || new Date().toISOString() };
        out.push(track.kind === 'ins' ? new InsertedTextRun({ ...o, ...meta }) : new DeletedTextRun({ ...o, ...meta }));
        continue;
      }
      const run = new TextRun(o);
      out.push(link ? new ExternalHyperlink({ link, children: [run] }) : run);
    }
    closeAll();
    return out;
  }

  const spacingOf = (a) => {
    const s = {};
    if (a.lineHeight) { s.line = Math.round(parseFloat(a.lineHeight) * 240); s.lineRule = LineRuleType.AUTO; }
    if (a.spaceBefore != null) s.before = Math.round(a.spaceBefore * 20);
    if (a.spaceAfter != null) s.after = Math.round(a.spaceAfter * 20);
    return s;
  };

  async function para(node, o = {}) {
    const a = node.attrs || {};
    const left = (a.indent || 0) * 720 + (o.left || 0);
    let content = node.content;
    if (a.dropCap && content?.[0]?.type === 'text' && content[0].text) {
      const f = content[0], big = [...(f.marks || []).filter((m) => m.type !== 'textStyle'), { type: 'textStyle', attrs: { fontSize: '40pt' } }, { type: 'bold' }];
      content = [{ ...f, text: f.text[0], marks: big }, ...(f.text.length > 1 ? [{ ...f, text: f.text.slice(1) }] : []), ...content.slice(1)];
    }
    const children = [...(o.prefix || []), ...(await inline(content, o.run))];
    const right = a.indentRight ? Math.round(a.indentRight * 20) : 0;
    return new Paragraph({
      children,
      heading: node.type === 'heading' ? HEADING[a.level] : undefined,
      alignment: ALIGN[a.textAlign],
      spacing: { ...(o.spacing || {}), ...spacingOf(a) },
      indent: left || o.hanging || right ? { left, hanging: o.hanging, right: right || undefined } : undefined,
      numbering: o.numbering,
      border: o.border,
      keepNext: node.type === 'heading' ? true : undefined,
    });
  }

  /* ----- blocs ----- */
  async function blocks(nodes = [], o = {}) {
    const out = [];
    for (const n of nodes) out.push(...(await block(n, o)));
    return out;
  }

  async function block(n, o) {
    switch (n.type) {
      case 'paragraph':
      case 'heading':
        return [await para(n, o)];
      case 'blockquote':
        return blocks(n.content, {
          ...o, left: (o.left || 0) + 720, run: { italics: true, color: '595959', ...(o.run || {}) },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'B0B7C3', space: 10 } },
        });
      case 'codeBlock': {
        const text = (n.content || []).map((c) => c.text).join('');
        return text.split('\n').map((line) => new Paragraph({
          children: [new TextRun({ text: line, font: 'Consolas', size: 20 })],
          shading: { type: ShadingType.CLEAR, fill: 'F1F3F5', color: 'auto' },
          spacing: { after: 0, line: 260, lineRule: LineRuleType.AUTO },
          indent: o.left ? { left: o.left } : undefined,
        }));
      }
      case 'horizontalRule':
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: Math.round((n.attrs?.weight || 1) * 8), color: toHex(n.attrs?.color) || '9AA0A6', space: 1 } }, spacing: { before: 120, after: 120 } })];
      case 'pageBreak':
        return [new Paragraph({ children: [new PageBreak()] })];
      case 'columnBreak':
        return [new Paragraph({ children: [nCols > 1 ? new ColumnBreak() : new PageBreak()] })];
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        return list(n, o.level ?? -1, o);
      case 'tableOfContents': {
        const items = n.attrs?.items || [];
        const rows = [new Paragraph({ children: [new TextRun({ text: 'Table des matières', bold: true, size: 30, color: '1F3864' })], spacing: { after: 120 } })];
        for (const it of items) {
          rows.push(new Paragraph({
            children: [new TextRun({ text: it.text }), new TextRun({ children: [new Tab(), String(it.page)] })],
            tabStops: [{ type: TabStopType.RIGHT, position: contentTw, leader: LeaderType.DOT }],
            indent: { left: (it.level - 1) * 360 }, spacing: { after: 60 },
          }));
        }
        if (!items.length) rows.push(new Paragraph({ children: [new TextRun({ text: '(Aucun titre dans le document)', italics: true, color: '888888' })] }));
        return rows;
      }
      case 'textBox': {
        const a = n.attrs || {}, bc = toHex(a.border) || '0157E0', fill = toHex(a.fill) || 'EAF2FF';
        const w = Math.round(contentTw * Math.min(100, a.width || 100) / 100);
        const kids = await blocks(n.content, { ...o, spacing: { after: 60 } });
        const side = { style: BorderStyle.SINGLE, size: 8, color: bc };
        const tb = new Table({
          rows: [new TableRow({ cantSplit: true, children: [new TableCell({ children: kids.length ? kids : [new Paragraph({})], width: { size: w, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill, color: 'auto' }, margins: { top: 120, bottom: 120, left: 180, right: 180 },
            borders: { top: side, bottom: side, right: side, left: a.accent ? { style: BorderStyle.SINGLE, size: 36, color: bc } : side } })] })],
          columnWidths: [w], layout: TableLayoutType.FIXED, width: { size: w, type: WidthType.DXA },
          alignment: a.align === 'left' ? AlignmentType.LEFT : a.align === 'right' ? AlignmentType.RIGHT : AlignmentType.CENTER,
        });
        return [tb, new Paragraph({ spacing: { after: 0 } })];
      }
      case 'table':
        return [await table(n), new Paragraph({ spacing: { after: 0 } })];
      case 'image':
        return [await para({ type: 'paragraph', attrs: {}, content: [n] }, o)];
      default:
        return n.content ? blocks(n.content, o) : [];
    }
  }

  async function list(node, parentLevel, o) {
    const level = Math.min(parentLevel + 1, 8);
    const kind = node.type;
    const instance = kind === 'orderedList' && level === 0 ? ++ctx.orderedInstance : ctx.currentInstance;
    if (kind === 'orderedList' && level === 0) ctx.currentInstance = instance;
    const out = [];
    for (const item of node.content || []) {
      const checked = item.attrs?.checked;
      let first = true;
      for (const c of item.content || []) {
        if (c.type === 'paragraph' || c.type === 'heading') {
          if (first) {
            if (kind === 'taskList') {
              out.push(await para(c, {
                ...o, left: 720 * (level + 1), hanging: 360, spacing: { after: 60 },
                prefix: [new TextRun({ text: checked ? '☑' : '☐', font: 'Segoe UI Symbol' }), new TextRun({ children: [new Tab()] })],
              }));
            } else {
              out.push(await para(c, {
                ...o, spacing: { after: 60 },
                numbering: kind === 'orderedList' ? { reference: 'ordered', level, instance } : { reference: 'bullets', level },
              }));
            }
            first = false;
          } else {
            out.push(await para(c, { ...o, left: 720 * (level + 1), spacing: { after: 60 } }));
          }
        } else if (['bulletList', 'orderedList', 'taskList'].includes(c.type)) {
          out.push(...(await list(c, level, o)));
        } else {
          out.push(...(await block(c, o)));
        }
      }
    }
    return out;
  }

  async function table(node) {
    const rows = node.content || [];
    const cols = (rows[0]?.content || []).reduce((s, c) => s + (c.attrs?.colspan || 1), 0) || 1;
    const even = Math.floor(contentTw / cols);
    const colW = Array(cols).fill(even);
    // largeurs explicites éventuelles (1re ligne)
    let ci = 0;
    for (const c of rows[0]?.content || []) {
      const span = c.attrs?.colspan || 1;
      const cw = c.attrs?.colwidth;
      for (let k = 0; k < span; k++) if (cw?.[k]) colW[ci + k] = Math.round(cw[k] * TW_PX);
      ci += span;
    }
    const total = colW.reduce((a, b) => a + b, 0);
    const scale = total > contentTw ? contentTw / total : 1;
    const widths = colW.map((w) => Math.round(w * scale));
    const bs = node.attrs?.bstyle || 'all';
    const border = { style: BorderStyle.SINGLE, size: Math.max(2, Math.round((node.attrs?.bwidth || 0.75) * 8)), color: toHex(node.attrs?.bcolor) || 'A6A6A6' };
    const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const tblBorders = { all: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      outer: { top: border, bottom: border, left: border, right: border, insideHorizontal: none, insideVertical: none },
      horizontal: { top: border, bottom: border, left: none, right: none, insideHorizontal: border, insideVertical: none },
      vertical: { top: none, bottom: none, left: border, right: border, insideHorizontal: none, insideVertical: border },
      none: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none } }[bs] || null;
    const trs = [];
    for (const row of rows) {
      const cells = [];
      let idx = 0;
      for (const cell of row.content || []) {
        const span = cell.attrs?.colspan || 1;
        const w = widths.slice(idx, idx + span).reduce((a, b) => a + b, 0) || even;
        idx += span;
        const isHead = cell.type === 'tableHeader';
        const kids = await blocks(cell.content, { run: isHead ? { bold: true } : undefined, spacing: { after: 40 } });
        if (!kids.length || kids[kids.length - 1] instanceof Table) kids.push(new Paragraph({}));
        const bg = toHex(cell.attrs?.backgroundColor) || (isHead ? 'EEF2F9' : undefined);
        cells.push(new TableCell({
          children: kids, columnSpan: span > 1 ? span : undefined, rowSpan: (cell.attrs?.rowspan || 1) > 1 ? cell.attrs.rowspan : undefined,
          width: { size: w, type: WidthType.DXA },
          shading: bg ? { type: ShadingType.CLEAR, fill: bg, color: 'auto' } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
        }));
      }
      trs.push(new TableRow({ children: cells, cantSplit: true, tableHeader: row.content?.[0]?.type === 'tableHeader' }));
    }
    return new Table({
      rows: trs, columnWidths: widths, layout: TableLayoutType.FIXED,
      width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
      borders: tblBorders,
    });
  }

  /* ----- document ----- */
  const children = await blocks(json.content || []);
  if (ctx.endnotes.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'Notes de fin', bold: true, size: 26, color: '1F3864' })], spacing: { before: 360, after: 80 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: '9AA0A6', space: 6 } } }));
    ctx.endnotes.forEach((t, i) => children.push(new Paragraph({ children: [new TextRun({ text: `${i + 1}. `, superScript: true }), new TextRun({ text: t || '(note vide)', size: 20 })], spacing: { after: 40 } })));
  }
  if (!children.length) children.push(new Paragraph({}));

  const levelsFor = (fmtOf, textOf) => Array.from({ length: 9 }, (_, i) => ({
    level: i, format: fmtOf(i), text: textOf(i), alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } },
  }));
  const bulletChars = ['•', '◦', '▪'];
  const orderedFmts = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];

  const sz = (halfpt, color = '1F3864', before = 240, after = 100, outline = 0) => ({
    run: { size: halfpt, bold: true, color }, paragraph: { spacing: { before, after }, outlineLevel: outline },
  });
  const hStyle = (id, name, halfpt, outline, extra = {}) => ({ id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true, ...sz(halfpt, '1F3864', 240, 100, outline), ...extra });

  const grey = { size: 18, color: '666666' };
  const numRuns = () => {
    const c = () => new TextRun({ children: [PageNumber.CURRENT], ...grey });
    const t = () => new TextRun({ children: [PageNumber.TOTAL_PAGES], ...grey });
    const x = (text) => new TextRun({ text, ...grey });
    switch (settings.pageNumberFormat) {
      case 'of': return [c(), x(' / '), t()];
      case 'plain': return [c()];
      case 'dash': return [x('– '), c(), x(' –')];
      case 'page-only': return [x('Page '), c()];
      default: return [x('Page '), c(), x(' / '), t()];
    }
  };
  const textPara = (text, align) => new Paragraph({ alignment: ALIGN[align] || AlignmentType.CENTER, children: [new TextRun({ text, ...grey })] });
  const numPara = () => new Paragraph({ alignment: ALIGN[settings.pageNumberAlign] || AlignmentType.CENTER, children: numRuns() });

  // filigrane : image diagonale translucide, flottante derrière le texte, dans l'en-tête (affichée sur chaque page)
  async function watermarkPara() {
    const wm = settings.watermark?.text?.trim();
    if (!wm) return null;
    const S = 1400, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.translate(S / 2, S / 2); g.rotate(-Math.PI / 4);
    let fs = 260; g.font = `800 ${fs}px Calibri, Carlito, sans-serif`;
    const w = g.measureText(wm).width; if (w > S * 1.05) { fs = (fs * S * 1.05) / w; g.font = `800 ${fs}px Calibri, Carlito, sans-serif`; }
    g.fillStyle = settings.watermark.color || '#b8bfcc'; g.globalAlpha = 0.42; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(wm, 0, 0);
    const bytes = Uint8Array.from(atob(cv.toDataURL('image/png').split(',')[1]), (ch) => ch.charCodeAt(0));
    const size = Math.round(Math.min(M.wcm, M.hcm) * 0.9 * 37.8);
    return new Paragraph({ children: [new ImageRun({ type: 'png', data: bytes, transformation: { width: size, height: size },
      altText: { name: 'Filigrane', title: 'Filigrane', description: wm },
      floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER }, verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER }, behindDocument: true, allowOverlap: true, wrap: { type: TextWrappingType.NONE } } })] });
  }
  const wmPara = await watermarkPara();

  const headKids = [];
  if (settings.header?.trim()) headKids.push(textPara(settings.header, settings.headerAlign));
  if (settings.pageNumbers && settings.pageNumberPos === 'top') headKids.push(numPara());
  const footKids = [];
  if (settings.footer?.trim()) footKids.push(textPara(settings.footer, settings.footerAlign));
  if (settings.pageNumbers && settings.pageNumberPos !== 'top') footKids.push(numPara());
  const hf = {};
  const hk = [...(wmPara ? [wmPara] : []), ...headKids];
  if (hk.length) hf.headers = { default: new Header({ children: hk }) };
  if (footKids.length) hf.footers = { default: new Footer({ children: footKids }) };
  if (settings.firstPageDifferent) {
    // première page : ni en-tête, ni pied de page, ni numéro (le filigrane reste)
    hf.headers = { ...(hf.headers || {}), first: new Header({ children: wmPara ? [wmPara] : [new Paragraph({})] }) };
    hf.footers = { ...(hf.footers || {}), first: new Footer({ children: [new Paragraph({})] }) };
  }

  // bordures de page
  const bd = settings.pageBorder || { style: 'none' };
  const pageBorders = (() => {
    if (bd.style === 'none') return undefined;
    // bordure décorative : bordure artistique native de Word (taille en points) ; sinon trait simple, double ou pointillé
    const side = bd.style === 'art'
      ? { style: (MOTIFS[bd.art] || MOTIFS.heart).word, size: Math.max(4, Math.min(31, Math.round(bd.artSize || 18))), color: toHex(bd.color) || '000000', space: Math.min(31, Math.round(bd.offset * 28.35)) }
      : { style: bd.style === 'double' ? BorderStyle.DOUBLE : bd.style === 'dashed' ? BorderStyle.DASHED : BorderStyle.SINGLE, size: Math.max(2, Math.round(bd.width * 8)), color: (toHex(bd.color) || '000000'), space: Math.min(31, Math.round(bd.offset * 28.35)) };
    return { pageBorders: { display: PageBorderDisplay.ALL_PAGES, offsetFrom: PageBorderOffsetFrom.PAGE, zOrder: PageBorderZOrder.FRONT }, pageBorderTop: side, pageBorderRight: side, pageBorderBottom: side, pageBorderLeft: side };
  })();

  const land = settings.orientation === 'landscape';
  const portraitW = Math.round((land ? M.hcm : M.wcm) * CM_TWIP);
  const portraitH = Math.round((land ? M.wcm : M.hcm) * CM_TWIP);
  const mg = settings.margins;

  const doc = new Document({
    creator: 'Luma Office',
    comments: liveComments.length ? { children: liveComments.map((c, i) => ({
      id: i, author: c.author || 'Auteur', initials: (c.author || 'A').slice(0, 2).toUpperCase(), date: new Date(c.date || Date.now()),
      children: [
        new Paragraph({ children: [new TextRun(c.text || '')] }),
        ...(c.replies || []).map((r) => new Paragraph({ children: [new TextRun({ text: `↳ ${r.author} : ${r.text}`, italics: true })] })),
      ],
    })) } : undefined,
    title: title || 'Document',
    description: 'Créé avec Luma Office',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 160, line: 276, lineRule: LineRuleType.AUTO } } } },
      paragraphStyles: [
        hStyle('Heading1', 'Heading 1', 40, 0),
        hStyle('Heading2', 'Heading 2', 30, 1),
        hStyle('Heading3', 'Heading 3', 26, 2),
        hStyle('Heading4', 'Heading 4', 24, 3),
        hStyle('Heading5', 'Heading 5', 22, 4),
        hStyle('Heading6', 'Heading 6', 22, 5),
      ],
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: levelsFor(() => LevelFormat.BULLET, (i) => bulletChars[i % 3]) },
        { reference: 'ordered', levels: levelsFor((i) => orderedFmts[i % 3], (i) => `%${i + 1}.`) },
      ],
    },
    ...(settings.hyphenate ? { hyphenation: { autoHyphenation: true } } : {}),
    sections: [{
      properties: {
        titlePage: !!settings.firstPageDifferent,
        ...(nCols > 1 ? { column: { count: nCols, space: Math.round((settings.columns.gap ?? 1.27) * CM_TWIP), separate: !!settings.columns.rule, equalWidth: true } } : {}),
        page: {
          size: { width: portraitW, height: portraitH, orientation: land ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: {
            top: Math.round(mg.top * CM_TWIP), bottom: Math.round(mg.bottom * CM_TWIP),
            left: Math.round(mg.left * CM_TWIP), right: Math.round(mg.right * CM_TWIP), gutter: Math.round((settings.gutter || 0) * CM_TWIP),
            header: Math.round(Math.min(mg.top / 2, 1.25) * CM_TWIP), footer: Math.round(Math.min(mg.bottom / 2, 1.25) * CM_TWIP),
          },
          ...(pageBorders ? { borders: pageBorders } : {}),
        },
      },
      ...hf,
      children,
    }],
  });
  return Packer.toBlob(doc);
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
void CM_PX;
