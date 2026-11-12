// Lecteur .rtf : convertit en HTML pour l'éditeur (mise en forme du texte, alignements, tableaux, images PNG/JPEG, mise en page).
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf', 'footnote', 'fldinst', 'generator', 'pgdsc', 'listtable', 'listoverridetable', 'rsidtbl', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'xmlnstbl', 'mmathPr', 'filetbl', 'revtbl', 'private', 'template', 'userprops', 'wgrffmtfilter', 'pnseclvl', 'bkmkstart', 'bkmkend', 'object', 'shpinst', 'nonshppict', 'falt', 'panose']);
const SIZES = { A4: [21, 29.7], A3: [29.7, 42], A5: [14.8, 21], Letter: [21.59, 27.94], Legal: [21.59, 35.56] };
const SPECIAL = { emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', bullet: '•', emspace: ' ', enspace: ' ', tab: '    ', '~': ' ', '_': '‑', '-': '' };

export function rtfToHtml(input) {
  const src = typeof input === 'string' ? input : new TextDecoder('latin1').decode(input);
  if (!/^\s*\{\\rtf/.test(src)) throw new Error('Fichier .rtf invalide');
  const cpm = /\\ansicpg(\d+)/.exec(src);
  let dec;
  try { dec = new TextDecoder(`windows-${cpm ? cpm[1] : 1252}`); } catch { dec = new TextDecoder('windows-1252'); }
  const colors = [];
  const settings = {}, page = {};
  const out = [];
  let rows = [], cells = [], cellParas = [], inTbl = false;
  let runs = [], align = '', stack = [], st = { b: 0, i: 0, u: 0, s: 0, sup: 0, sub: 0, fs: 0, cf: 0, uc: 1, skip: false, pict: null, color: false };
  let skipChars = 0, colorBuf = [0, 0, 0, false];

  const fmt = (text, f) => {
    let h = esc(text);
    const css = [];
    if (f.cf && colors[f.cf]) css.push(`color:${colors[f.cf]}`);
    if (f.fs && f.fs !== 22 && f.fs !== 24) css.push(`font-size:${f.fs / 2}pt`);
    if (css.length) h = `<span style="${css.join(';')}">${h}</span>`;
    if (f.b) h = `<strong>${h}</strong>`;
    if (f.i) h = `<em>${h}</em>`;
    if (f.u) h = `<u>${h}</u>`;
    if (f.s) h = `<s>${h}</s>`;
    if (f.sup) h = `<sup>${h}</sup>`; else if (f.sub) h = `<sub>${h}</sub>`;
    return h;
  };
  const addText = (text) => {
    if (!text || st.skip || st.pict) return;
    const last = runs[runs.length - 1];
    const f = { b: st.b, i: st.i, u: st.u, s: st.s, sup: st.sup, sub: st.sub, fs: st.fs, cf: st.cf };
    if (last && !last.html && JSON.stringify(last.f) === JSON.stringify(f)) last.text += text; else runs.push({ text, f });
  };
  const paraHtml = () => {
    const inner = runs.map((r) => (r.html ? r.html : fmt(r.text, r.f))).join('');
    const al = { c: 'center', r: 'right', j: 'justify' }[align];
    return `<p${al ? ` style="text-align:${al}"` : ''}>${inner || '<br>'}</p>`;
  };
  const closeTable = () => {
    if (!rows.length) return;
    out.push(`<table><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c.join('') || '<p></p>'}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    rows = [];
  };
  const endPara = () => {
    const html = paraHtml();
    if (inTbl) cellParas.push(html);
    else { closeTable(); out.push(html); }
    runs = [];
  };
  const hasContent = () => runs.length > 0;

  const re = /\\([a-zA-Z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-zA-Z])|([{}])|([^\\{}\r\n]+)|[\r\n]+/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[5] === '{') { stack.push({ ...st }); st.pict = st.pict ? { ...st.pict } : null; continue; }
    if (m[5] === '}') {
      if (st.pict && st.pict.hex) { const mime = st.pict.type; if (mime) runs.push({ html: `<img src="data:${mime};base64,${btoa(st.pict.hex.match(/../g).map((x) => String.fromCharCode(parseInt(x, 16))).join(''))}">` }); }
      st = stack.pop() || st;
      continue;
    }
    if (m[6] !== undefined) {
      let t = m[6];
      if (st.pict) { st.pict.hex += t.replace(/\s+/g, ''); continue; }
      if (st.color) { // table des couleurs : « ;» sépare les entrées
        for (const ch of t) if (ch === ';') { colors.push(colorBuf[3] ? `rgb(${colorBuf[0]},${colorBuf[1]},${colorBuf[2]})` : null); colorBuf = [0, 0, 0, false]; }
        continue;
      }
      if (skipChars) { const n = Math.min(skipChars, t.length); t = t.slice(n); skipChars -= n; }
      addText(t);
      continue;
    }
    if (m[3] !== undefined) { // octet hexadécimal (page de codes)
      if (skipChars) { skipChars--; continue; }
      addText(dec.decode(new Uint8Array([parseInt(m[3], 16)])));
      continue;
    }
    if (m[4] !== undefined) { // symbole de contrôle
      const c = m[4];
      if (c === '*') { st.skip = true; continue; }
      if (c === '\\' || c === '{' || c === '}') addText(c);
      else if (SPECIAL[c] !== undefined) addText(SPECIAL[c]);
      else if (c === '\n' || c === '\r') endPara();
      continue;
    }
    if (m[1] === undefined) continue;
    const w = m[1], n = m[2] === undefined ? null : +m[2];
    if (SKIP.has(w) && !st.skip) { st.skip = true; if (w === 'colortbl') { st.color = true; st.skip = false; colorBuf = [0, 0, 0, false]; } continue; }
    if (st.color) { if (w === 'red') { colorBuf[0] = n; colorBuf[3] = true; } else if (w === 'green') colorBuf[1] = n; else if (w === 'blue') colorBuf[2] = n; continue; }
    if (st.skip) continue;
    switch (w) {
      case 'pict': st.pict = { type: null, hex: '' }; break;
      case 'pngblip': if (st.pict) st.pict.type = 'image/png'; break;
      case 'jpegblip': if (st.pict) st.pict.type = 'image/jpeg'; break;
      case 'par': endPara(); break;
      case 'pard': align = ''; break;
      case 'line': runs.push({ html: '<br>' }); break;
      case 'page': out.push('<div data-page-break></div>'); break;
      case 'b': st.b = n === 0 ? 0 : 1; break;
      case 'i': st.i = n === 0 ? 0 : 1; break;
      case 'ul': case 'uldb': case 'ulw': st.u = 1; break;
      case 'ulnone': st.u = 0; break;
      case 'strike': case 'striked': st.s = n === 0 ? 0 : 1; break;
      case 'super': st.sup = 1; st.sub = 0; break;
      case 'sub': st.sub = 1; st.sup = 0; break;
      case 'nosupersub': st.sup = 0; st.sub = 0; break;
      case 'plain': st.b = st.i = st.u = st.s = st.sup = st.sub = 0; st.fs = 0; st.cf = 0; break;
      case 'fs': st.fs = n; break;
      case 'cf': st.cf = n; break;
      case 'qc': align = 'c'; break;
      case 'qr': align = 'r'; break;
      case 'qj': align = 'j'; break;
      case 'ql': align = ''; break;
      case 'uc': st.uc = n; break;
      case 'u': { let c = n < 0 ? n + 65536 : n; addText(String.fromCharCode(c)); skipChars = st.uc; break; }
      case 'trowd': inTbl = true; cells = []; cellParas = []; break;
      case 'intbl': inTbl = true; break;
      case 'cell': { if (hasContent() || !cellParas.length) endPara(); cells.push(cellParas); cellParas = []; break; }
      case 'row': { rows.push(cells); cells = []; cellParas = []; inTbl = false; break; }
      case 'paperw': page.w = n; break;
      case 'paperh': page.h = n; break;
      case 'margl': page.l = n; break;
      case 'margr': page.r = n; break;
      case 'margt': page.t = n; break;
      case 'margb': page.b = n; break;
      case 'landscape': page.land = true; break;
      default: if (SPECIAL[w] !== undefined) addText(SPECIAL[w]);
    }
  }
  if (hasContent()) endPara();
  closeTable();

  if (page.w && page.h) {
    let w = page.w / 567, hh = page.h / 567;
    const land = page.land || w > hh;
    if (land) [w, hh] = [Math.min(w, hh), Math.max(w, hh)];
    const hit = Object.entries(SIZES).find(([, [sw, sh]]) => Math.abs(sw - w) < 0.3 && Math.abs(sh - hh) < 0.3);
    if (hit) settings.size = hit[0]; else { settings.size = 'custom'; settings.customW = Math.round(w * 100) / 100; settings.customH = Math.round(hh * 100) / 100; }
    settings.orientation = land ? 'landscape' : 'portrait';
  }
  if ([page.l, page.r, page.t, page.b].every((v) => v != null)) { const c = (v) => Math.round((v / 567) * 100) / 100; settings.margins = { top: c(page.t), bottom: c(page.b), left: c(page.l), right: c(page.r) }; }
  return { html: out.join('') || '<p></p>', settings, comments: [] };
}
