// Lecteur .docx : convertit un fichier Word en HTML fidèle (alignements, polices, couleurs, tableaux, images, listes, en-têtes…).
import JSZip from 'jszip';

const EMU_PX = 9525;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const HL = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000' };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' };
const SIZES = { A4: [11906, 16838], A3: [16838, 23811], A5: [8391, 11906], Letter: [12240, 15840], Legal: [12240, 20160] };

const kids = (el, name) => (el ? [...el.children].filter((c) => c.localName === name) : []);
const kid = (el, name) => kids(el, name)[0];
const attr = (el, n) => el?.getAttribute('w:' + n) ?? el?.getAttribute(n) ?? null;
const on = (el) => !!el && !['0', 'false', 'off', 'none'].includes((attr(el, 'val') ?? 'true').toLowerCase());
const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');

export async function docxToHtml(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (p) => (zip.file(p) ? parseXml(await zip.file(p).async('string')) : null);
  const docXml = await read('word/document.xml');
  if (!docXml) throw new Error('Fichier .docx invalide');
  const stylesXml = await read('word/styles.xml');
  const numXml = await read('word/numbering.xml');
  const relsXml = await read('word/_rels/document.xml.rels');
  const commentsXml = await read('word/comments.xml');

  /* ----- relations ----- */
  const rels = {};
  for (const r of relsXml ? [...relsXml.getElementsByTagName('Relationship')] : []) rels[r.getAttribute('Id')] = { type: r.getAttribute('Type'), target: r.getAttribute('Target'), mode: r.getAttribute('TargetMode') };
  const media = {};
  const getMedia = async (rid) => {
    const r = rels[rid];
    if (!r) return null;
    if (media[rid] !== undefined) return media[rid];
    const path = 'word/' + r.target.replace(/^\//, '').replace(/^word\//, '');
    const f = zip.file(path) || zip.file(r.target.replace(/^\//, ''));
    const ext = (r.target.split('.').pop() || '').toLowerCase();
    if (!f || !MIME[ext]) return (media[rid] = null);
    return (media[rid] = `data:${MIME[ext]};base64,${await f.async('base64')}`);
  };

  /* ----- styles ----- */
  const styles = {};
  let defRPr = null, defPPr = null;
  if (stylesXml) {
    const dd = kid(stylesXml.documentElement, 'docDefaults');
    defRPr = kid(kid(dd, 'rPrDefault'), 'rPr');
    defPPr = kid(kid(dd, 'pPrDefault'), 'pPr');
    for (const s of kids(stylesXml.documentElement, 'style')) {
      styles[attr(s, 'styleId')] = { id: attr(s, 'styleId'), type: attr(s, 'type'), name: attr(kid(s, 'name'), 'val') || '', basedOn: attr(kid(s, 'basedOn'), 'val'), pPr: kid(s, 'pPr'), rPr: kid(s, 'rPr'), def: attr(s, 'default') === '1' };
    }
  }
  const chain = (id) => { const out = []; let cur = styles[id]; let guard = 0; while (cur && guard++ < 20) { out.unshift(cur); cur = styles[cur.basedOn]; } return out; };
  const defaultPara = Object.values(styles).find((s) => s.type === 'paragraph' && s.def)?.id;

  /* ----- numérotation ----- */
  const abstracts = {}, nums = {};
  if (numXml) {
    for (const a of kids(numXml.documentElement, 'abstractNum')) {
      const lv = {};
      for (const l of kids(a, 'lvl')) lv[attr(l, 'ilvl')] = { fmt: attr(kid(l, 'numFmt'), 'val'), text: attr(kid(l, 'lvlText'), 'val'), start: +(attr(kid(l, 'start'), 'val') || 1) };
      abstracts[attr(a, 'abstractNumId')] = lv;
    }
    for (const n of kids(numXml.documentElement, 'num')) nums[attr(n, 'numId')] = attr(kid(n, 'abstractNumId'), 'val');
  }

  /* ----- propriétés effectives ----- */
  function rprOf(rPr, styleChainIds = []) {
    const eff = {};
    const apply = (r) => {
      if (!r) return;
      for (const c of r.children) {
        const v = attr(c, 'val');
        switch (c.localName) {
          case 'b': eff.b = on(c); break;
          case 'i': eff.i = on(c); break;
          case 'u': eff.u = on(c); break;
          case 'strike': case 'dstrike': eff.s = on(c); break;
          case 'color': eff.color = v && v !== 'auto' ? '#' + v : undefined; break;
          case 'sz': eff.size = +v / 2; break;
          case 'rFonts': eff.font = attr(c, 'ascii') || attr(c, 'hAnsi') || eff.font; break;
          case 'highlight': eff.hl = v && v !== 'none' ? HL[v] : undefined; break;
          case 'shd': { const f = attr(c, 'fill'); eff.shd = f && f !== 'auto' ? '#' + f : undefined; break; }
          case 'vertAlign': eff.va = v; break;
          case 'caps': eff.caps = on(c); break;
          default:
        }
      }
    };
    apply(defRPr);
    for (const id of styleChainIds) apply(styles[id]?.rPr);
    apply(rPr);
    return eff;
  }
  function pprOf(pPr, styleId) {
    const eff = { jc: undefined, left: 0, line: undefined, before: undefined, after: undefined, outline: undefined, numId: undefined, ilvl: 0, styleName: '' };
    const apply = (p) => {
      if (!p) return;
      for (const c of p.children) {
        switch (c.localName) {
          case 'jc': eff.jc = attr(c, 'val'); break;
          case 'ind': { const l = attr(c, 'left') ?? attr(c, 'start'); if (l != null) eff.left = +l; break; }
          case 'spacing': {
            if (attr(c, 'line') != null && (attr(c, 'lineRule') || 'auto') === 'auto') eff.line = +attr(c, 'line') / 240;
            if (attr(c, 'before') != null) eff.before = +attr(c, 'before') / 20;
            if (attr(c, 'after') != null) eff.after = +attr(c, 'after') / 20;
            break;
          }
          case 'outlineLvl': eff.outline = +attr(c, 'val'); break;
          case 'numPr': { const n = attr(kid(c, 'numId'), 'val'); if (n != null) eff.numId = n; const l = attr(kid(c, 'ilvl'), 'val'); if (l != null) eff.ilvl = +l; break; }
          default:
        }
      }
    };
    apply(defPPr);
    const ids = chain(styleId || defaultPara);
    for (const s of ids) { apply(s.pPr); eff.styleName = s.name || eff.styleName; }
    apply(pPr);
    return { eff, ids: ids.map((s) => s.id) };
  }

  /* ----- commentaires ----- */
  const comments = {};
  if (commentsXml) {
    for (const c of kids(commentsXml.documentElement, 'comment')) {
      const text = [...c.getElementsByTagName('w:t')].map((t) => t.textContent).join('');
      comments[attr(c, 'id')] = { author: attr(c, 'author') || 'Auteur', date: attr(c, 'date') || '', text };
    }
  }
  const usedComments = new Set();
  let openComments = [];

  /* ----- runs ----- */
  async function runHtml(r, ctxMarks) {
    const rPr = kid(r, 'rPr');
    const rs = attr(kid(rPr, 'rStyle'), 'val');
    const eff = rprOf(rPr, [ctxMarks.pStyleIds, rs ? chain(rs).map((s) => s.id) : []].flat());
    let out = '';
    for (const c of r.children) {
      switch (c.localName) {
        case 't': case 'delText': out += esc(c.textContent); break;
        case 'tab': out += '&emsp;'; break;
        case 'noBreakHyphen': out += '‑'; break;
        case 'br': { const t = attr(c, 'type'); if (t === 'page') out += '\u0001PB\u0001'; else if (t === 'column') out += '\u0001CB\u0001'; else out += '<br>'; break; }
        case 'drawing': case 'pict': {
          const blip = c.getElementsByTagName('a:blip')[0] || c.getElementsByTagName('v:imagedata')[0];
          const rid = blip?.getAttribute('r:embed') || blip?.getAttribute('r:id');
          const src = rid ? await getMedia(rid) : null;
          if (src) {
            const ext = c.getElementsByTagName('wp:extent')[0];
            const w = ext ? Math.round(+ext.getAttribute('cx') / EMU_PX) : null;
            const alt = c.getElementsByTagName('wp:docPr')[0]?.getAttribute('descr') || '';
            out += `<img src="${src}"${w ? ` width="${w}"` : ''} alt="${esc(alt)}">`;
          }
          break;
        }
        default:
      }
    }
    if (!out) return '';
    if (/\u0001(PB|CB)\u0001/.test(out) && out.replace(/\u0001(PB|CB)\u0001/g, '') === '') return out;
    // Mise en forme
    const st = [];
    const hb = ctxMarks.heading;
    if (eff.color && !(hb && eff.color.toLowerCase() === '#1f3864')) st.push(`color:${eff.color}`);
    if (eff.font && eff.font !== 'Calibri' && eff.font !== 'Calibri Light' && !/^\+/.test(eff.font)) st.push(`font-family:${eff.font}`);
    if (eff.size && Math.abs(eff.size - (hb ? { 1: 20, 2: 15, 3: 13 }[hb] : 11)) > 0.01) st.push(`font-size:${eff.size}pt`);
    if (eff.shd && !eff.hl) st.push(`background-color:${eff.shd}`);
    if (eff.caps) out = out.toUpperCase();
    let html = out;
    if (st.length) html = `<span style="${st.join(';')}">${html}</span>`;
    if (eff.hl) html = `<mark data-color="${eff.hl}" style="background-color:${eff.hl}">${html}</mark>`;
    if (eff.va === 'superscript') html = `<sup>${html}</sup>`;
    if (eff.va === 'subscript') html = `<sub>${html}</sub>`;
    if (eff.s) html = `<s>${html}</s>`;
    if (eff.u) html = `<u>${html}</u>`;
    if (eff.i) html = `<em>${html}</em>`;
    if (eff.b && !hb) html = `<strong>${html}</strong>`;
    return html;
  }

  async function inlineHtml(node, ctx, track) {
    let out = '';
    for (const c of node.children) {
      switch (c.localName) {
        case 'r': {
          let h = await runHtml(c, ctx);
          if (h && track) h = `<${track.tag} data-author="${esc(track.author)}" data-date="${esc(track.date)}">${h}</${track.tag}>`;
          if (h && openComments.length) for (const id of openComments) h = `<span data-comment-id="${id}">${h}</span>`;
          out += h;
          break;
        }
        case 'hyperlink': {
          const rid = c.getAttribute('r:id');
          const href = rid && rels[rid]?.target;
          const inner = await inlineHtml(c, ctx, track);
          out += href ? `<a href="${esc(href)}">${inner}</a>` : inner;
          break;
        }
        case 'ins': out += await inlineHtml(c, ctx, { tag: 'ins', author: attr(c, 'author') || 'Auteur', date: attr(c, 'date') || '' }); break;
        case 'del': out += await inlineHtml(c, ctx, { tag: 'del', author: attr(c, 'author') || 'Auteur', date: attr(c, 'date') || '' }); break;
        case 'smartTag': case 'fldSimple': case 'sdt': case 'sdtContent': case 'customXml': out += await inlineHtml(c, ctx, track); break;
        case 'commentRangeStart': { const id = attr(c, 'id'); if (comments[id]) { openComments.push('w' + id); usedComments.add(id); } break; }
        case 'commentRangeEnd': openComments = openComments.filter((x) => x !== 'w' + attr(c, 'id')); break;
        default:
      }
    }
    return out;
  }

  /* ----- blocs ----- */
  let html = '';
  const stack = [];
  const closeList = () => { const t = stack.pop(); if (t.li) html += '</li>'; html += `</${t.tag}>`; };
  const closeAll = () => { while (stack.length) closeList(); };

  async function paragraph(p, out) {
    const pPr = kid(p, 'pPr');
    const styleId = attr(kid(pPr, 'pStyle'), 'val');
    const { eff, ids } = pprOf(pPr, styleId);
    const name = (eff.styleName || '').toLowerCase();
    let level = 0;
    const mh = name.match(/^(?:heading|titre)\s*(\d)/);
    if (mh) level = Math.min(3, +mh[1]);
    else if (/^(title|titre|subtitle|sous-titre)$/.test(name)) level = name.includes('sub') || name.includes('sous') ? 2 : 1;
    else if (eff.outline != null && eff.outline < 9) level = Math.min(3, eff.outline + 1);
    const ctx = { pStyleIds: ids, heading: level };
    let inner = await inlineHtml(p, ctx);

    const styleParts = [];
    const jc = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[eff.jc];
    if (jc) styleParts.push(`text-align:${jc}`);
    if (eff.line && Math.abs(eff.line - 1.15) > 0.02) styleParts.push(`line-height:${+eff.line.toFixed(2)}`);
    const defAfter = level ? 5 : 8;
    if (eff.before != null && eff.before !== (level ? 12 : 0)) styleParts.push(`margin-top:${eff.before}pt`);
    if (eff.after != null && eff.after !== defAfter) styleParts.push(`margin-bottom:${eff.after}pt`);
    const isList = eff.numId && eff.numId !== '0' && abstracts[nums[eff.numId]];
    const indent = isList ? 0 : Math.max(0, Math.min(10, Math.round(eff.left / 720)));
    const attrs = `${styleParts.length ? ` style="${styleParts.join(';')}"` : ''}${indent ? ` data-indent="${indent}"` : ''}`;
    const tag = level ? `h${level}` : 'p';

    // coupe aux sauts de page et de colonne
    const segs = inner.split(/(\u0001PB\u0001|\u0001CB\u0001)/);
    const parts = segs.filter((x, i) => i % 2 === 0);
    const marks = segs.filter((x, i) => i % 2 === 1);
    const build = (content) => `<${tag}${attrs}>${content}</${tag}>`;
    if (isList) {
      const lv = abstracts[nums[eff.numId]][String(eff.ilvl)] || { fmt: 'bullet', start: 1 };
      const ltag = lv.fmt === 'bullet' || lv.fmt === 'none' ? 'ul' : 'ol';
      addItem(eff.ilvl, eff.numId, ltag, build(parts.join('')), lv.start);
      return;
    }
    closeAll();
    parts.forEach((part, i) => {
      if (i > 0) html += marks[i - 1].includes('CB') ? '<div data-column-break></div>' : '<div data-page-break></div>';
      if (part || parts.length === 1 || i === 0) { if (!(parts.length > 1 && !part)) html += build(part); }
    });
    void out;
  }

  function addItem(lvl, numId, tag, pHtml, start) {
    while (stack.length && stack.at(-1).lvl > lvl) closeList();
    let top = stack.at(-1);
    if (top && top.lvl === lvl && (top.numId !== numId || top.tag !== tag)) { closeList(); top = stack.at(-1); }
    if (!top || top.lvl < lvl) {
      html += tag === 'ol' && start && start !== 1 ? `<ol start="${start}">` : `<${tag}>`;
      stack.push({ lvl, tag, numId, li: false });
      top = stack.at(-1);
    } else if (top.li) { html += '</li>'; top.li = false; }
    html += '<li>' + pHtml;
    top.li = true;
  }

  async function table(tbl) {
    closeAll();
    const grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => +attr(g, 'w') / 15);
    const gridSum = grid.reduce((a, b) => a + b, 0);
    const rows = kids(tbl, 'tr');
    const matrix = [];
    for (const tr of rows) {
      const cells = [];
      let col = 0;
      for (const tc of kids(tr, 'tc')) {
        const pr = kid(tc, 'tcPr');
        const span = +(attr(kid(pr, 'gridSpan'), 'val') || 1);
        const vm = kid(pr, 'vMerge');
        const shd = attr(kid(pr, 'shd'), 'fill');
        cells.push({ tc, col, span, vm: vm ? (attr(vm, 'val') === 'restart' ? 'restart' : 'continue') : null, bg: shd && shd !== 'auto' ? '#' + shd : null });
        col += span;
      }
      matrix.push({ cells, header: !!kid(kid(tr, 'trPr'), 'tblHeader') });
    }
    const origin = {};
    matrix.forEach((row) => row.cells.forEach((c) => {
      if (c.vm === 'restart') { origin[c.col] = c; c.rowspan = 1; }
      else if (c.vm === 'continue' && origin[c.col]) { origin[c.col].rowspan++; c.skip = true; }
      else delete origin[c.col];
    }));
    let out = '<table><tbody>';
    for (const [ri, row] of matrix.entries()) {
      out += '<tr>';
      for (const c of row.cells) {
        if (c.skip) continue;
        const isHead = row.header && ri === 0;
        const w = grid.slice(c.col, c.col + c.span).reduce((a, b) => a + b, 0);
        const cw = c.span === 1 && w && gridSum ? ` colwidth="${Math.round(w)}"` : '';
        const inner = await blocksHtml(c.tc);
        const cellTag = isHead ? 'th' : 'td';
        out += `<${cellTag}${c.span > 1 ? ` colspan="${c.span}"` : ''}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ''}${cw}${c.bg ? ` data-bg="${c.bg}" style="background-color:${c.bg}"` : ''}>${inner || '<p></p>'}</${cellTag}>`;
      }
      out += '</tr>';
    }
    html += out + '</tbody></table>';
  }

  async function blocksHtml(container) {
    const saveHtml = html, saveStack = [...stack];
    html = ''; stack.length = 0;
    await walk(container);
    closeAll();
    const r = html;
    html = saveHtml; stack.length = 0; stack.push(...saveStack);
    return r;
  }

  async function walk(container) {
    for (const c of container.children) {
      if (c.localName === 'p') await paragraph(c);
      else if (c.localName === 'tbl') await table(c);
      else if (c.localName === 'sdt') { const content = kid(c, 'sdtContent'); if (content) await walk(content); }
    }
  }

  const body = kid(docXml.documentElement, 'body');
  await walk(body);
  closeAll();

  /* ----- mise en page, en-têtes, pieds ----- */
  const settings = {};
  const sect = [...body.children].filter((c) => c.localName === 'sectPr').pop() || body.getElementsByTagName('w:sectPr')[0];
  if (sect) {
    const pg = kid(sect, 'pgSz'), mar = kid(sect, 'pgMar');
    if (pg) {
      let w = +attr(pg, 'w'), hh = +attr(pg, 'h');
      const land = attr(pg, 'orient') === 'landscape' || w > hh;
      if (land) [w, hh] = [Math.min(w, hh), Math.max(w, hh)];
      const hit = Object.entries(SIZES).find(([, [sw, sh]]) => Math.abs(sw - w) < 120 && Math.abs(sh - hh) < 120);
      if (hit) settings.size = hit[0]; else { settings.size = 'custom'; settings.customW = Math.round((w / 567) * 100) / 100; settings.customH = Math.round((hh / 567) * 100) / 100; }
      settings.orientation = land ? 'landscape' : 'portrait';
    }
    if (mar) {
      const cm = (n) => Math.round((+attr(mar, n) / 567) * 100) / 100;
      settings.margins = { top: cm('top'), bottom: cm('bottom'), left: cm('left'), right: cm('right') };
      if (attr(mar, 'gutter')) settings.gutter = cm('gutter');
    }
    const cols = kid(sect, 'cols');
    if (cols && +(attr(cols, 'num') || 1) > 1) settings.columns = { count: Math.min(4, +attr(cols, 'num')), gap: Math.round((+(attr(cols, 'space') || 720) / 567) * 100) / 100, rule: ['1', 'true', 'on'].includes(attr(cols, 'sep') || '') };
    if (kid(sect, 'titlePg')) settings.firstPageDifferent = true;
    const pb = kid(sect, 'pgBorders');
    const pbs = pb && (kid(pb, 'top') || kid(pb, 'left'));
    if (pbs && attr(pbs, 'val') && attr(pbs, 'val') !== 'nil' && attr(pbs, 'val') !== 'none') {
      const v = attr(pbs, 'val');
      settings.pageBorder = { style: v === 'double' ? 'double' : /dash|dot/.test(v) ? 'dashed' : 'single', color: attr(pbs, 'color') && attr(pbs, 'color') !== 'auto' ? '#' + attr(pbs, 'color').toLowerCase() : '#000000', width: Math.max(0.5, +(attr(pbs, 'sz') || 8) / 8), offset: Math.max(0.3, Math.min(3, +(attr(pbs, 'space') || 24) / 28.35)) };
    }
    const refText = async (kind) => {
      const ref = kids(sect, kind + 'Reference').find((r) => attr(r, 'type') === 'default') || kids(sect, kind + 'Reference')[0];
      const rid = ref?.getAttribute('r:id');
      if (!rid || !rels[rid]) return null;
      return read('word/' + rels[rid].target.replace(/^\/?(word\/)?/, ''));
    };
    const hx = await refText('header');
    if (hx) settings.header = kids(hx.documentElement, 'p').map((p) => [...p.getElementsByTagName('w:t')].map((t) => t.textContent).join('')).join(' ').trim();
    const fx = await refText('footer');
    if (fx) {
      const texts = [];
      settings.pageNumbers = false;
      for (const p of kids(fx.documentElement, 'p')) {
        const hasPage = /\bPAGE\b/.test([...p.getElementsByTagName('w:instrText')].map((t) => t.textContent).join(' ')) || p.getElementsByTagName('w:fldSimple').length > 0;
        if (hasPage) { settings.pageNumbers = true; settings.pageNumberAlign = { center: 'center', right: 'right', end: 'right' }[attr(kid(kid(p, 'pPr'), 'jc'), 'val')] || 'left'; }
        else { const t = [...p.getElementsByTagName('w:t')].map((x) => x.textContent).join('').trim(); if (t) texts.push(t); }
      }
      settings.footer = texts.join(' ');
    }
  }
  const wset = await read('word/settings.xml');
  const hy = wset?.getElementsByTagName('w:autoHyphenation')[0];
  if (hy && !['0', 'false', 'off'].includes((hy.getAttribute('w:val') || 'true').toLowerCase())) settings.hyphenate = true;
  const used = [...usedComments].map((id) => ({ id: 'w' + id, ...comments[id], replies: [], resolved: false }));
  return { html: html || '<p></p>', settings, comments: used };
}
