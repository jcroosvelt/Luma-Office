// Lecteur .odt (OpenDocument Texte : LibreOffice, Google Docs…) : convertit en HTML pour l'éditeur.
import JSZip from 'jszip';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' };
const SIZES = { A4: [21, 29.7], A3: [29.7, 42], A5: [14.8, 21], Letter: [21.59, 27.94], Legal: [21.59, 35.56] };
const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el, ...names) => (el ? [...el.children].filter((c) => !names.length || names.includes(c.localName)) : []);
const kid = (el, name) => kids(el, name)[0];
const cm = (v) => { const m = /^(-?[\d.]+)(cm|mm|in|pt|px)?/.exec(v || ''); if (!m) return null; const n = +m[1]; return { cm: n, mm: n / 10, in: n * 2.54, pt: n * 2.54 / 72, px: n * 2.54 / 96 }[m[2] || 'cm']; };

export async function odtToHtml(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const cx = zip.file('content.xml');
  if (!cx) throw new Error('Fichier .odt invalide');
  const content = parseXml(await cx.async('string'));
  const stylesXml = zip.file('styles.xml') ? parseXml(await zip.file('styles.xml').async('string')) : null;

  /* ----- styles (nommés + automatiques) ----- */
  const styles = {}, lists = {};
  const collect = (doc) => {
    if (!doc) return;
    for (const s of doc.getElementsByTagName('style:style')) styles[s.getAttribute('style:family') + ':' + s.getAttribute('style:name')] = s;
    for (const l of doc.getElementsByTagName('text:list-style')) lists[l.getAttribute('style:name')] = kids(l)[0]?.localName === 'list-level-style-number' ? 'ol' : 'ul';
  };
  collect(stylesXml); collect(content);
  const chain = (family, name) => { // du plus ancien parent au style lui-même
    const out = [];
    let n = name;
    for (let i = 0; n && i < 8; i++) { const s = styles[family + ':' + n]; if (!s) break; out.unshift(s); n = s.getAttribute('style:parent-style-name'); }
    return out;
  };
  const props = (family, name) => {
    const t = {}, p = {};
    for (const s of chain(family, name)) {
      Object.assign(t, Object.fromEntries([...(kid(s, 'text-properties')?.attributes || [])].map((a) => [a.name, a.value])));
      Object.assign(p, Object.fromEntries([...(kid(s, 'paragraph-properties')?.attributes || [])].map((a) => [a.name, a.value])));
    }
    return { t, p };
  };
  const heading = (name) => { for (const s of chain('paragraph', name)) { const m = /^Heading(?:[ _]20_|[ _])?(\d)$/i.exec(s.getAttribute('style:name') || '') || /^Title$/i.exec(s.getAttribute('style:name') || ''); if (m) return m[1] ? +m[1] : 1; } return 0; };

  const css = (t, skipBase) => {
    const c = [];
    if (t['fo:color'] && t['fo:color'] !== '#000000') c.push(`color:${t['fo:color']}`);
    if (t['fo:background-color'] && t['fo:background-color'] !== 'transparent') c.push(`background-color:${t['fo:background-color']}`);
    if (!skipBase && t['fo:font-size']) { const pt = t['fo:font-size'].endsWith('pt') ? parseFloat(t['fo:font-size']) : cm(t['fo:font-size']) * 72 / 2.54; if (pt && pt !== 12 && pt !== 11) c.push(`font-size:${Math.round(pt * 10) / 10}pt`); }
    const ff = t['fo:font-family'] || t['style:font-name'];
    if (ff) c.push(`font-family:${ff.replace(/['"]/g, '')}`);
    return c.join(';');
  };
  const wrapMarks = (inner, t) => {
    let h = inner;
    const st = css(t); if (st) h = `<span style="${esc(st)}">${h}</span>`;
    if (t['fo:font-weight'] === 'bold' || +t['fo:font-weight'] >= 600) h = `<strong>${h}</strong>`;
    if (t['fo:font-style'] === 'italic') h = `<em>${h}</em>`;
    if (t['style:text-underline-style'] && t['style:text-underline-style'] !== 'none') h = `<u>${h}</u>`;
    if (t['style:text-line-through-style'] && t['style:text-line-through-style'] !== 'none') h = `<s>${h}</s>`;
    if (/^(super|[1-9])/.test(t['style:text-position'] || '')) h = `<sup>${h}</sup>`;
    else if (/^(sub|-)/.test(t['style:text-position'] || '')) h = `<sub>${h}</sub>`;
    return h;
  };

  /* ----- images ----- */
  const imgs = {};
  for (const f of Object.keys(zip.files)) {
    if (zip.files[f].dir || !/\.(png|jpe?g|gif|bmp|svg|webp)$/i.test(f)) continue;
    const ext = f.split('.').pop().toLowerCase();
    imgs[f] = `data:${MIME[ext]};base64,${await zip.file(f).async('base64')}`;
  }

  /* ----- contenu ----- */
  const inline = (node, base) => {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += esc(n.nodeValue); continue; }
      if (n.nodeType !== 1) continue;
      const ln = n.localName;
      if (ln === 'span') out += wrapMarks(inline(n, base), props('text', n.getAttribute('text:style-name')).t);
      else if (ln === 's') out += '&nbsp;'.repeat(+(n.getAttribute('text:c') || 1));
      else if (ln === 'tab') out += '&nbsp;&nbsp;&nbsp;&nbsp;';
      else if (ln === 'line-break') out += '<br>';
      else if (ln === 'a') { const href = n.getAttribute('xlink:href') || ''; out += /^(https?:|mailto:|tel:)/i.test(href) ? `<a href="${esc(href)}">${inline(n, base)}</a>` : inline(n, base); }
      else if (ln === 'frame') { const im = n.getElementsByTagName('draw:image')[0]; const src = im && imgs[im.getAttribute('xlink:href')]; if (src) { const w = cm(n.getAttribute('svg:width')); out += `<img src="${src}"${w ? ` width="${Math.round(w * 37.8)}"` : ''}>`; } }
      else if (ln === 'note' || ln === 'bookmark' || ln === 'bookmark-start' || ln === 'bookmark-end' || ln === 'soft-page-break' || ln === 'annotation') continue;
      else out += inline(n, base);
    }
    return out;
  };
  const block = (p) => {
    const sname = p.getAttribute('text:style-name');
    const { t, p: pp } = props('paragraph', sname);
    const lvl = p.localName === 'h' ? +(p.getAttribute('text:outline-level') || 1) : heading(sname);
    const al = { center: 'center', end: 'right', right: 'right', justify: 'justify' }[pp['fo:text-align']];
    const style = [al && `text-align:${al}`, pp['fo:line-height'] && /%$/.test(pp['fo:line-height']) && parseInt(pp['fo:line-height']) !== 100 ? `line-height:${(parseInt(pp['fo:line-height']) / 100).toFixed(2)}` : ''].filter(Boolean).join(';');
    let inner = inline(p);
    inner = wrapMarks(inner, lvl ? { ...t, 'fo:font-weight': undefined, 'fo:font-size': undefined } : t);
    const tag = lvl ? `h${Math.min(6, Math.max(1, lvl))}` : 'p';
    return (pp['fo:break-before'] === 'page' ? '<div data-page-break></div>' : '') + `<${tag}${style ? ` style="${style}"` : ''}>${inner || (lvl ? '' : '<br>')}</${tag}>`;
  };
  const list = (l) => {
    const tag = lists[l.getAttribute('text:style-name')] || 'ul';
    const items = kids(l, 'list-item', 'list-header').map((li) => `<li>${kids(li).map(one).join('') || '<p></p>'}</li>`);
    return `<${tag}>${items.join('')}</${tag}>`;
  };
  const table = (t) => {
    const rows = [];
    const walk = (el) => { for (const c of kids(el)) { if (c.localName === 'table-row') rows.push(c); else if (/header-rows|table-rows/.test(c.localName)) walk(c); } };
    walk(t);
    const body = rows.map((r) => `<tr>${kids(r, 'table-cell').map((c) => {
      const cs = c.getAttribute('table:number-columns-spanned'), rs = c.getAttribute('table:number-rows-spanned');
      return `<td${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}>${blocks(c) || '<p></p>'}</td>`;
    }).join('')}</tr>`).join('');
    return `<table><tbody>${body}</tbody></table>`;
  };
  function one(c) {
    const ln = c.localName;
    if (ln === 'p' || ln === 'h') return block(c);
    if (ln === 'list') return list(c);
    if (ln === 'table') return table(c);
    if (ln === 'section' || ln === 'index-body' || ln === 'table-of-content' || ln === 'index-title') return blocks(c);
    return '';
  }
  function blocks(parent) { return kids(parent).map(one).join(''); }
  const html = blocks(content.getElementsByTagName('office:text')[0]);

  /* ----- mise en page ----- */
  const settings = {};
  const pl = stylesXml?.getElementsByTagName('style:page-layout-properties')[0];
  if (pl) {
    let w = cm(pl.getAttribute('fo:page-width')), hh = cm(pl.getAttribute('fo:page-height'));
    if (w && hh) {
      const land = w > hh;
      if (land) [w, hh] = [Math.min(w, hh), Math.max(w, hh)];
      const hit = Object.entries(SIZES).find(([, [sw, sh]]) => Math.abs(sw - w) < 0.3 && Math.abs(sh - hh) < 0.3);
      if (hit) settings.size = hit[0]; else { settings.size = 'custom'; settings.customW = Math.round(w * 100) / 100; settings.customH = Math.round(hh * 100) / 100; }
      settings.orientation = land ? 'landscape' : 'portrait';
    }
    const m = (n) => { const v = cm(pl.getAttribute('fo:margin-' + n)); return v == null ? null : Math.round(v * 100) / 100; };
    if ([m('top'), m('bottom'), m('left'), m('right')].every((v) => v != null)) settings.margins = { top: m('top'), bottom: m('bottom'), left: m('left'), right: m('right') };
  }
  return { html: html || '<p></p>', settings, comments: [] };
}
