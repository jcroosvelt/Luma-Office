// Lecteur Excel (.xlsx / .xlsm) et CSV : valeurs affichées, formats de nombre et de date, styles de base, cellules fusionnées.
import JSZip from 'jszip';

const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el, n) => (el ? [...el.children].filter((c) => c.localName === n) : []);
const kid = (el, n) => kids(el, n)[0];
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
export const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const argb = (c) => { const v = c?.getAttribute('rgb'); return v && v.length === 8 ? '#' + v.slice(2).toLowerCase() : null; };

const BUILTIN = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd/mm/yyyy h:mm', 37: '#,##0', 38: '#,##0', 39: '#,##0.00', 40: '#,##0.00', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0' };

function classify(code) {
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  if (/general/i.test(c)) return 'general';
  if (/[dy]/i.test(c) || (/m/i.test(c) && /[hs]/i.test(c))) return 'date';
  if (/h|s/i.test(c) && !/[0#]/.test(c)) return 'date';
  if (/%/.test(c)) return 'percent';
  return 'number';
}

function fmtNumber(v, code, date1904) {
  const kind = classify(code);
  if (kind === 'date') {
    const days = Math.floor(v), frac = v - days;
    const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const d = new Date(base + Math.round(v * 864e5));
    const hasTime = /[hs]/i.test(code.replace(/"[^"]*"/g, ''));
    const hasDate = /[dy]/i.test(code.replace(/"[^"]*"/g, '')) || days > 0;
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    const timeStr = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${/s/i.test(code) ? ':' + pad(d.getUTCSeconds()) : ''}`;
    if (hasTime && !(/[dy]/i.test(code.replace(/"[^"]*"/g, '')))) return timeStr;
    return hasTime && frac ? `${dateStr} ${timeStr}` : hasDate ? dateStr : timeStr;
  }
  const sec = code.split(';')[0];
  const dec = (sec.match(/\.(0+)/) || [, ''])[1].length;
  const cur = /€|\[\$€/.test(sec) ? ' €' : /\$/.test(sec) ? ' $' : /£/.test(sec) ? ' £' : '';
  if (kind === 'percent') return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v * 100) + ' %';
  if (kind === 'general') return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(10))).replace('.', ',');
  const grouping = /,/.test(sec.replace(/"[^"]*"/g, ''));
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: grouping }).format(v) + cur;
}

export async function readXlsx(buffer, { maxRows = 50000 } = {}) {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (p) => (zip.file(p) ? parseXml(await zip.file(p).async('string')) : null);
  const wb = await read('xl/workbook.xml');
  if (!wb) throw new Error('Fichier Excel invalide');
  const rels = await read('xl/_rels/workbook.xml.rels');
  const relMap = {};
  for (const r of rels ? [...rels.getElementsByTagName('Relationship')] : []) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
  const date1904 = kid(wb.documentElement, 'workbookPr')?.getAttribute('date1904') === '1';

  // chaînes partagées
  const strings = [];
  const ss = await read('xl/sharedStrings.xml');
  if (ss) for (const si of kids(ss.documentElement, 'si')) strings.push([...si.getElementsByTagName('t')].filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join(''));

  // styles
  const numFmts = {}, xfs = [], fonts = [], fills = [];
  const st = await read('xl/styles.xml');
  if (st) {
    const root = st.documentElement;
    for (const n of kids(kid(root, 'numFmts'), 'numFmt')) numFmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode');
    for (const f of kids(kid(root, 'fonts'), 'font')) fonts.push({ b: !!kid(f, 'b'), i: !!kid(f, 'i'), color: argb(kid(f, 'color')) });
    for (const f of kids(kid(root, 'fills'), 'fill')) { const pf = kid(f, 'patternFill'); fills.push(pf?.getAttribute('patternType') === 'solid' ? argb(kid(pf, 'fgColor')) : null); }
    for (const x of kids(kid(root, 'cellXfs'), 'xf')) xfs.push({ fmt: x.getAttribute('numFmtId') || '0', font: +(x.getAttribute('fontId') || 0), fill: +(x.getAttribute('fillId') || 0), al: kid(x, 'alignment')?.getAttribute('horizontal') || null, wrap: kid(x, 'alignment')?.getAttribute('wrapText') === '1' });
  }
  const fmtCache = {};
  const styleOf = (s) => {
    const x = xfs[+s || 0] || {};
    const code = numFmts[x.fmt] || BUILTIN[x.fmt] || 'General';
    return { x, code, font: fonts[x.font] || {}, bg: fills[x.fill] || null };
  };

  const sheets = [];
  for (const sh of kids(kid(wb.documentElement, 'sheets'), 'sheet')) {
    const rid = sh.getAttribute('r:id');
    const target = relMap[rid];
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.?\//, '');
    const xml = await read(path);
    if (!xml) continue;
    const root = xml.documentElement;
    const rows = [];
    let maxCol = 0;
    for (const row of kids(kid(root, 'sheetData'), 'row')) {
      const ri = +row.getAttribute('r') - 1;
      if (ri >= maxRows) break;
      const arr = (rows[ri] = []);
      for (const c of kids(row, 'c')) {
        const ci = colIndex(c.getAttribute('r'));
        const t = c.getAttribute('t');
        const vEl = kid(c, 'v');
        const fEl = kid(c, 'f');
        let disp = '', raw = null;
        const { x, code, font, bg } = styleOf(c.getAttribute('s'));
        if (t === 's') disp = strings[+vEl?.textContent] ?? '';
        else if (t === 'inlineStr') disp = [...c.getElementsByTagName('t')].map((e) => e.textContent).join('');
        else if (t === 'str') disp = vEl?.textContent ?? '';
        else if (t === 'b') disp = vEl?.textContent === '1' ? 'VRAI' : 'FAUX';
        else if (t === 'e') disp = vEl?.textContent ?? '#ERREUR';
        else if (vEl && vEl.textContent !== '') { raw = parseFloat(vEl.textContent); const key = code; disp = Number.isNaN(raw) ? vEl.textContent : fmtNumber(raw, fmtCache[key] ||= code, date1904); }
        const numeric = raw != null;
        if (disp === '' && !fEl && !bg) continue;
        arr[ci] = { t: disp, f: fEl?.textContent ? '=' + fEl.textContent : null, b: font.b, i: font.i, color: font.color, bg, al: x.al || (numeric ? 'right' : null), wrap: x.wrap };
        if (ci + 1 > maxCol) maxCol = ci + 1;
      }
    }
    const cols = [];
    for (const col of kids(kid(root, 'cols'), 'col')) {
      const w = Math.round(parseFloat(col.getAttribute('width') || '9') * 7 + 5);
      for (let i = +col.getAttribute('min') - 1; i < Math.min(+col.getAttribute('max'), 200); i++) cols[i] = w;
    }
    const merges = [];
    for (const m of kids(kid(root, 'mergeCells'), 'mergeCell')) {
      const [a, b] = m.getAttribute('ref').split(':');
      if (!b) continue;
      merges.push({ r1: +a.replace(/\D/g, '') - 1, c1: colIndex(a), r2: +b.replace(/\D/g, '') - 1, c2: colIndex(b) });
    }
    sheets.push({ name: sh.getAttribute('name'), rows, cols, merges, maxCol, maxRow: rows.length });
  }
  return { sheets, text: sheetsText(sheets) };
}

export function readCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [';', '\t', ','].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const maxCol = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const out = rows.slice(0, 50000).map((r) => r.map((t) => (t === '' ? undefined : { t, al: /^-?[\d\s.,]+$/.test(t.trim()) && t.trim() ? 'right' : null })));
  const sheets = [{ name: 'CSV', rows: out, cols: [], merges: [], maxCol, maxRow: out.length }];
  return { sheets, text: sheetsText(sheets) };
}

export function sheetsText(sheets, cap = 400000) {
  let out = '';
  for (const s of sheets) {
    out += s.name + '\n';
    for (const r of s.rows) { if (!r) continue; out += r.map((c) => c?.t || '').filter(Boolean).join(' · ') + '\n'; if (out.length > cap) return out; }
  }
  return out;
}

export function sheetToHtml(sheet, maxRows = 500) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = sheet.rows.slice(0, maxRows);
  const w = Math.max(1, Math.min(sheet.maxCol, 12));
  let html = `<h2>${esc(sheet.name)}</h2><table><tbody>`;
  rows.forEach((r, ri) => {
    html += '<tr>';
    for (let c = 0; c < w; c++) { const cell = r?.[c]; const tag = ri === 0 ? 'th' : 'td'; html += `<${tag}><p>${esc(cell?.t || '')}</p></${tag}>`; }
    html += '</tr>';
  });
  return html + '</tbody></table>' + (sheet.rows.length > maxRows ? `<p><em>… ${sheet.rows.length - maxRows} lignes supplémentaires non reprises.</em></p>` : '') + (sheet.maxCol > 12 ? '<p><em>Seules les 12 premières colonnes sont reprises.</em></p>' : '');
}
