// Publipostage : fusion d'une lettre type avec une liste Excel / CSV pour générer un document par destinataire.
import { h, icon, sheet, toast } from './ui.js';
import { listDocs, putDoc, newId } from './storage.js';
import { readXlsx, readCsv } from './xlsx-read.js';
import { generateHTML } from '@tiptap/core';

export async function sourceFromBlob(blob, name) {
  const isCsv = /\.(csv|txt)$/i.test(name) || /csv|text/.test(blob.type || '');
  const parsed = isCsv ? readCsv(await blob.text()) : await readXlsx(await blob.arrayBuffer());
  const sh = parsed.sheets[0];
  const rows = (sh?.rows || []).map((r) => Array.from({ length: sh.maxCol || r.length }, (_, i) => (r[i]?.t ?? '').toString().trim()));
  const firstIdx = rows.findIndex((r) => r.some((x) => x));
  if (firstIdx < 0) throw new Error('Liste vide');
  const headers = rows[firstIdx].map((x, i) => x || `Colonne ${i + 1}`);
  const data = rows.slice(firstIdx + 1).filter((r) => r.some((x) => x));
  return { name, headers, rows: data };
}

// Remplace les champs « nom » par les valeurs de l'enregistrement
export function mergeNodes(nodes, rec) {
  const out = [];
  for (const n of nodes || []) {
    if (n.type === 'mergeField') { const v = rec[n.attrs?.name] ?? ''; if (v) out.push({ type: 'text', text: v, ...(n.marks ? { marks: n.marks } : {}) }); continue; }
    out.push(n.content ? { ...n, content: mergeNodes(n.content, rec) } : n);
  }
  return out;
}
const recordOf = (src, row) => Object.fromEntries(src.headers.map((k, i) => [k, row[i] ?? '']));
export const mergeOne = (json, src, row) => ({ type: 'doc', content: mergeNodes(json.content, recordOf(src, row)) });
export function mergeAll(json, src) {
  const content = [];
  src.rows.forEach((row, i) => { if (i) content.push({ type: 'pageBreak' }); content.push(...mergeNodes(json.content, recordOf(src, row))); });
  return { type: 'doc', content };
}
const fieldsIn = (json) => { const s = new Set(); const w = (n) => { if (n.type === 'mergeField') s.add(n.attrs?.name); (n.content || []).forEach(w); }; w(json); return [...s]; };

export function openFieldPicker(editor, src) {
  if (!src) { toast('Choisissez d’abord la liste de destinataires (Publipostage)', 3500); return; }
  let s;
  s = sheet('Insérer un champ', h('div', { class: 'form' }, h('p', { class: 'muted' }, 'Touchez une colonne de votre liste : le champ sera remplacé par la valeur de chaque destinataire.'),
    h('div', { class: 'chips' }, src.headers.map((k) => h('button', { class: 'chip', onclick: () => { s.close(); editor.chain().focus().insertContent([{ type: 'mergeField', attrs: { name: k } }, { type: 'text', text: ' ' }]).run(); } }, '«' + k + '»')))));
}

export function openMailMerge({ editor, getSource, setSource, getRec, getTitle, onCreated }) {
  let src = getSource(), idx = 0, s;
  const info = h('div', { class: 'mm-info' }), prevBox = h('div', { class: 'doc-content ver-prev mm-prev' }), nav = h('div', { class: 'mm-nav' }), gen = h('button', { class: 'btn primary' }, icon('mail', 18), 'Générer les lettres');
  const fileIn = h('input', { type: 'file', accept: '.xlsx,.xlsm,.csv,.txt', hidden: true, onchange: async () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) await use(f, f.name); } });
  async function use(blob, name) { try { src = await sourceFromBlob(blob, name); await setSource(src); idx = 0; draw(); } catch (e) { console.error(e); toast('Liste illisible : utilisez un fichier Excel (.xlsx) ou CSV avec une ligne d’en-têtes', 4500); } }
  async function fromLibrary() {
    const sheets = (await listDocs()).filter((d) => d.kind === 'sheet' && d.blob);
    if (!sheets.length) { toast('Aucun classeur Excel dans Mes documents : importez-en un ou choisissez un fichier'); return; }
    let ps; ps = sheet('Mes classeurs', h('div', { class: 'form' }, ...sheets.map((d) => h('button', { class: 'sres-item', onclick: async () => { ps.close(); await use(d.blob, d.title + '.xlsx'); } }, d.title))));
  }
  function draw() {
    const used = fieldsIn(getRec().json || editor.getJSON());
    info.replaceChildren(
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => fileIn.click() }, icon('upload', 18), 'Choisir un fichier Excel / CSV'), h('button', { class: 'btn', onclick: fromLibrary }, icon('folder', 18), 'Mes classeurs')),
      src ? h('p', {}, h('b', {}, src.name), ` — ${src.rows.length} destinataire${src.rows.length > 1 ? 's' : ''} · colonnes : ${src.headers.join(', ')}`) : h('p', { class: 'muted' }, 'Choisissez la liste (première ligne = noms des colonnes).'),
      src ? h('p', { class: 'muted' }, used.length ? `Champs utilisés dans la lettre : ${used.map((x) => '«' + x + '»').join(' ')}` : 'Aucun champ dans la lettre pour l’instant : utilisez « Champ » dans l’onglet Outils (ou Insertion) pour en ajouter.') : null);
    nav.replaceChildren();
    if (src?.rows.length) {
      const sel = h('select', { class: 'field', 'aria-label': 'Destinataire' }, ...src.rows.slice(0, 2000).map((r, i) => h('option', { value: i }, `${i + 1}. ${r.slice(0, 2).filter(Boolean).join(' ') || '(vide)'}`)));
      sel.value = String(idx); sel.addEventListener('change', () => { idx = +sel.value; draw(); });
      nav.append(h('b', {}, 'Aperçu'), sel);
      let html = '';
      try { html = generateHTML(mergeOne(editor.getJSON(), src, src.rows[idx]), editor.extensionManager.extensions); } catch { html = '<p>Aperçu indisponible</p>'; }
      prevBox.innerHTML = html; prevBox.hidden = false;
    } else prevBox.hidden = true;
    gen.disabled = !src?.rows.length;
  }
  gen.addEventListener('click', async () => {
    if (!src?.rows.length) return;
    const n = src.rows.length;
    toast(`Génération de ${n} lettre${n > 1 ? 's' : ''}…`, 60000);
    const json = mergeAll(editor.getJSON(), src);
    const rec = getRec();
    const doc = { id: newId(), title: `${getTitle()} — publipostage (${n})`, json, settings: rec.settings, comments: [], created: Date.now(), updated: Date.now(), preview: '', words: 0 };
    await putDoc(doc); s.close(); toast(`${n} lettre${n > 1 ? 's' : ''} générée${n > 1 ? 's' : ''} ✓`, 3500); onCreated(doc.id);
  });
  s = sheet('Publipostage', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'Écrivez votre lettre type, insérez des champs «Nom», «Adresse»… puis générez une lettre par ligne de la liste, chacune sur sa page.'),
    info, nav, prevBox, gen, fileIn), { wide: true });
  draw();
}
