// Conversion du document (JSON ProseMirror) vers un vrai fichier Word (.docx).
import { metrics, CM_TWIP, CM_PX } from './layout.js';

const TW_PX = 15; // 1 px = 15 twips
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

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

export async function buildDocx(json, settings, title) {
  const D = await import('docx');
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun,
    PageBreak, Header, Footer, PageNumber, LevelFormat, BorderStyle, ShadingType, ExternalHyperlink, Tab,
    PageOrientation, LineRuleType, TableLayoutType,
  } = D;

  const M = metrics(settings);
  const contentTw = Math.round((M.wcm - settings.margins.left - settings.margins.right) * CM_TWIP);
  const ctx = { orderedInstance: 0 };
  const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
  const HEADING = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

  /* ----- inline ----- */
  async function inline(nodes = [], base = {}) {
    const out = [];
    for (const n of nodes) {
      if (n.type === 'hardBreak') { out.push(new TextRun({ break: 1 })); continue; }
      if (n.type === 'image') {
        try {
          const im = await loadImage(n.attrs.src);
          const maxW = contentTw / TW_PX;
          let w = n.attrs.width || im.w;
          w = Math.min(w, maxW);
          out.push(new ImageRun({ type: im.type, data: im.bytes, transformation: { width: Math.round(w), height: Math.round((w * im.h) / im.w) },
            altText: { name: n.attrs.alt || 'Image', title: n.attrs.alt || 'Image', description: n.attrs.alt || 'Image' } }));
        } catch { /* image illisible : ignorée */ }
        continue;
      }
      if (n.type !== 'text') continue;
      const o = { text: n.text, ...base };
      let link;
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
          case 'link': link = a.href; o.color = '0563C1'; o.underline = {}; break;
          case 'textStyle':
            if (a.color) o.color = toHex(a.color);
            if (a.fontFamily) o.font = firstFont(a.fontFamily);
            if (a.fontSize) o.size = halfPoints(a.fontSize);
            if (a.backgroundColor) o.shading = { type: ShadingType.CLEAR, fill: toHex(a.backgroundColor) || 'FFFFFF', color: 'auto' };
            break;
          default:
        }
      }
      const run = new TextRun(o);
      out.push(link ? new ExternalHyperlink({ link, children: [run] }) : run);
    }
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
    const children = [...(o.prefix || []), ...(await inline(node.content, o.run))];
    return new Paragraph({
      children,
      heading: node.type === 'heading' ? HEADING[a.level] : undefined,
      alignment: ALIGN[a.textAlign],
      spacing: { ...(o.spacing || {}), ...spacingOf(a) },
      indent: left || o.hanging ? { left, hanging: o.hanging } : undefined,
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
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '9AA0A6', space: 1 } }, spacing: { before: 120, after: 120 } })];
      case 'pageBreak':
        return [new Paragraph({ children: [new PageBreak()] })];
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        return list(n, o.level ?? -1, o);
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
    const border = { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6' };
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
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    });
  }

  /* ----- document ----- */
  const children = await blocks(json.content || []);
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

  const footerAlign = ALIGN[settings.pageNumberAlign] || AlignmentType.CENTER;
  const hf = {};
  if (settings.header?.trim()) {
    hf.headers = { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: settings.header, size: 18, color: '666666' })] })] }) };
  }
  const footKids = [];
  if (settings.footer?.trim()) footKids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: settings.footer, size: 18, color: '666666' })] }));
  if (settings.pageNumbers) {
    footKids.push(new Paragraph({
      alignment: footerAlign,
      children: [
        new TextRun({ text: 'Page ', size: 18, color: '666666' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '666666' }),
        new TextRun({ text: ' / ', size: 18, color: '666666' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '666666' }),
      ],
    }));
  }
  if (footKids.length) hf.footers = { default: new Footer({ children: footKids }) };

  const land = settings.orientation === 'landscape';
  const portraitW = Math.round((land ? M.hcm : M.wcm) * CM_TWIP);
  const portraitH = Math.round((land ? M.wcm : M.hcm) * CM_TWIP);
  const mg = settings.margins;

  const doc = new Document({
    creator: 'Luma Office',
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
    sections: [{
      properties: {
        page: {
          size: { width: portraitW, height: portraitH, orientation: land ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: {
            top: Math.round(mg.top * CM_TWIP), bottom: Math.round(mg.bottom * CM_TWIP),
            left: Math.round(mg.left * CM_TWIP), right: Math.round(mg.right * CM_TWIP),
            header: Math.round(Math.min(mg.top / 2, 1.25) * CM_TWIP), footer: Math.round(Math.min(mg.bottom / 2, 1.25) * CM_TWIP),
          },
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
