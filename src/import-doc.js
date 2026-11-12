// Lecteur .doc (ancien format Word 97-2003) : récupère le texte et les paragraphes (la mise en forme n'est pas conservée).
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ENDOFCHAIN = 0xfffffffe;

function readStreams(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (v.getUint32(0, true) !== 0xe011cfd0 || v.getUint32(4, true) !== 0xe11ab1a1) throw new Error('Fichier .doc invalide');
  const ss = 1 << v.getUint16(30, true), mss = 1 << v.getUint16(32, true);
  const sector = (i) => buf.subarray((i + 1) * ss, (i + 2) * ss);
  const fatSecs = [];
  for (let i = 0; i < 109; i++) { const s = v.getUint32(76 + i * 4, true); if (s < 0xfffffffa) fatSecs.push(s); }
  let dif = v.getUint32(68, true);
  for (let n = v.getUint32(72, true); n > 0 && dif < 0xfffffffa; n--) {
    const d = new DataView(sector(dif).buffer, sector(dif).byteOffset, ss);
    for (let i = 0; i < ss / 4 - 1; i++) { const s = d.getUint32(i * 4, true); if (s < 0xfffffffa) fatSecs.push(s); }
    dif = d.getUint32(ss - 4, true);
  }
  const fat = [];
  for (const fs of fatSecs) { const d = new DataView(sector(fs).buffer, sector(fs).byteOffset, ss); for (let i = 0; i < ss / 4; i++) fat.push(d.getUint32(i * 4, true)); }
  const chain = (start, table) => { const out = []; for (let s = start, n = 0; s < 0xfffffffa && n < 1e6; s = table[s], n++) out.push(s); return out; };
  const read = (start, size, table, get, unit) => {
    const out = new Uint8Array(chain(start, table).length * unit); let o = 0;
    for (const s of chain(start, table)) { out.set(get(s), o); o += unit; }
    return size == null ? out : out.subarray(0, size);
  };
  const dir = read(v.getUint32(48, true), null, fat, sector, ss);
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const entries = {};
  for (let i = 0; i + 128 <= dir.length; i += 128) {
    const len = dv.getUint16(i + 64, true);
    if (!len) continue;
    let name = '';
    for (let j = 0; j < len / 2 - 1; j++) name += String.fromCharCode(dv.getUint16(i + j * 2, true));
    entries[name] = { type: dir[i + 66], start: dv.getUint32(i + 116, true), size: dv.getUint32(i + 120, true) };
  }
  const root = Object.values(entries).find((e) => e.type === 5);
  let miniFat = null, mini = null;
  const stream = (name) => {
    const e = entries[name];
    if (!e) return null;
    if (e.size >= v.getUint32(56, true)) return read(e.start, e.size, fat, sector, ss);
    if (!miniFat) {
      miniFat = [];
      const mf = read(v.getUint32(60, true), null, fat, sector, ss);
      const d = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
      for (let i = 0; i < mf.length / 4; i++) miniFat.push(d.getUint32(i * 4, true));
      mini = read(root.start, null, fat, sector, ss);
    }
    return read(e.start, e.size, miniFat, (s) => mini.subarray(s * mss, (s + 1) * mss), mss);
  };
  return stream;
}

export function docToHtml(input) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const stream = readStreams(buf);
  const wd = stream('WordDocument');
  if (!wd) throw new Error('Fichier .doc invalide');
  const w = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
  if (w.getUint16(0, true) !== 0xa5ec) throw new Error('Fichier .doc invalide');
  if (w.getUint16(10, true) & 0x0100) throw new Error('Ce document Word est protégé par un mot de passe.');
  const tbl = stream((w.getUint16(10, true) & 0x0200) ? '1Table' : '0Table');
  if (!tbl) throw new Error('Fichier .doc invalide');
  const ccpText = w.getInt32(0x4c, true);
  const fcClx = w.getUint32(0x1a2, true), lcbClx = w.getUint32(0x1a6, true);
  const t = new DataView(tbl.buffer, tbl.byteOffset, tbl.byteLength);
  // CLX : on saute les blocs Prc (0x01) jusqu'au tableau de morceaux (0x02)
  let p = fcClx;
  const end = fcClx + lcbClx;
  while (p < end && tbl[p] === 1) p += 3 + t.getUint16(p + 1, true);
  if (tbl[p] !== 2) throw new Error('Fichier .doc non pris en charge');
  const lcb = t.getUint32(p + 1, true);
  const n = Math.floor((lcb - 4) / 12);
  const cp0 = p + 5, pcd0 = cp0 + (n + 1) * 4;
  let text = '';
  for (let k = 0; k < n; k++) {
    const a = t.getInt32(cp0 + k * 4, true), b = Math.min(t.getInt32(cp0 + (k + 1) * 4, true), ccpText);
    if (b <= a) continue;
    let fc = t.getUint32(pcd0 + k * 8 + 2, true);
    const comp = !!(fc & 0x40000000);
    fc &= 0x3fffffff;
    const len = b - a;
    if (comp) text += new TextDecoder('windows-1252').decode(wd.subarray(fc / 2, fc / 2 + len));
    else text += new TextDecoder('utf-16le').decode(wd.subarray(fc, fc + len * 2));
  }
  // champs : on garde le résultat (entre 0x14 et 0x15), pas le code
  text = text.replace(/\x13[^\x14\x15]*\x14?([^\x13\x15]*)\x15/g, '$1').replace(/[\x13\x14\x15]/g, '');
  const SPECIAL = { '\x0b': '\n', '\x1e': '‑', '\x1f': '', '\x01': '', '\x08': '', '\x02': '' };
  text = text.replace(/[\x0b\x1e\x1f\x01\x08\x02]/g, (c) => SPECIAL[c]);
  // paragraphes (\r), cellules (\x07) ; une marque \x07 juste après une autre termine la ligne du tableau
  const out = [];
  let cur = '', row = [], afterCell = false;
  const cellHtml = (c) => `<td><p>${esc(c).replace(/\n/g, '<br>') || '<br>'}</p></td>`;
  const flushRow = () => {
    if (!row.length) return;
    const tr = `<tr>${row.map(cellHtml).join('')}</tr>`;
    const last = out[out.length - 1];
    if (last && last.startsWith('<table>')) out[out.length - 1] = last.replace('</tbody></table>', tr + '</tbody></table>');
    else out.push(`<table><tbody>${tr}</tbody></table>`);
    row = [];
  };
  const para = (x) => {
    flushRow();
    x.split('\f').forEach((part, i) => { if (i) out.push('<div data-page-break></div>'); if (part || i === 0) out.push(`<p>${esc(part).replace(/\n/g, '<br>') || '<br>'}</p>`); });
  };
  for (const ch of text) {
    if (ch === '\x07') {
      if (cur === '' && afterCell) { flushRow(); afterCell = false; } else { row.push(cur); cur = ''; afterCell = true; }
    } else if (ch === '\r') { afterCell = false; para(cur); cur = ''; } else { afterCell = false; cur += ch; }
  }
  if (cur) para(cur);
  flushRow();
  return { html: out.join('') || '<p></p>', settings: {}, comments: [] };
}
