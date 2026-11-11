// Ouverture et import de fichiers (Word, PDF, Excel, CSV, texte), depuis l'import manuel, le système ou le partage.
import { putDoc, newId, listDocs } from './storage.js';
import { importFile } from './import.js';
import { templateSettings, TEMPLATES } from './templates.js';
import { toast } from './ui.js';
import { extOf } from './file-text.js';

export const IMPORT_ACCEPT = '.docx,.pdf,.xlsx,.xlsm,.csv,.txt,.md,.html,.htm';
const baseName = (n) => n.replace(/\.[^.]+$/, '');

export function kindOf(file) {
  const e = extOf(file.name), t = file.type || '';
  if (e === 'pdf' || t === 'application/pdf') return 'pdf';
  if (['xlsx', 'xlsm'].includes(e) || t.includes('spreadsheetml')) return 'sheet';
  if (e === 'csv' || t === 'text/csv') return 'csv';
  if (e === 'docx' || t.includes('wordprocessingml')) return 'docx';
  if (['txt', 'md', 'html', 'htm'].includes(e)) return 'text';
  if (e === 'doc') return 'old-doc';
  if (e === 'xls') return 'old-xls';
  return null;
}

export async function createDocFromHtml({ title, html, settings, comments }) {
  const rec = { id: newId(), title, html, json: null, settings: settings || templateSettings(TEMPLATES[0]), comments: comments || [], created: Date.now(), updated: Date.now(), preview: '', words: 0 };
  await putDoc(rec);
  return rec;
}

// Ajoute un fichier à la bibliothèque ; renvoie l'identifiant (ou null si le format n'est pas pris en charge)
export async function addFile(file) {
  const kind = kindOf(file);
  if (kind === 'old-doc') { toast('Ancien format .doc : enregistrez-le d’abord en .docx dans Word.', 5000); return null; }
  if (kind === 'old-xls') { toast('Ancien format .xls : enregistrez-le d’abord en .xlsx dans Excel.', 5000); return null; }
  if (!kind) { toast(`Format non pris en charge : ${file.name}`, 4000); return null; }
  if (kind === 'pdf' || kind === 'sheet' || kind === 'csv') {
    const k = kind === 'pdf' ? 'pdf' : 'sheet';
    const title = baseName(file.name);
    const existing = (await listDocs()).find((d) => d.kind === k && d.title === title && d.size === file.size);
    if (existing) return existing.id;
    let blob;
    try { blob = new Blob([await file.arrayBuffer()], { type: file.type || (k === 'pdf' ? 'application/pdf' : 'application/octet-stream') }); } catch { toast('Impossible de lire ce fichier (stocké dans le cloud ou protégé ?). Téléchargez-le d’abord sur le téléphone.', 6000); return null; }
    const rec = { id: newId(), title, kind: k, fmt: extOf(file.name) || (k === 'pdf' ? 'pdf' : 'xlsx'), blob, size: file.size, mime: file.type, created: Date.now(), updated: Date.now(), preview: '', words: 0 };
    await putDoc(rec);
    return rec.id;
  }
  const r = await importFile(file);
  const base = templateSettings(TEMPLATES[0]);
  const rec = await createDocFromHtml({ title: r.title, html: r.html, comments: r.comments, settings: { ...base, ...(r.settings || {}), margins: { ...base.margins, ...(r.settings?.margins || {}) } } });
  return rec.id;
}

// Ouvre le premier fichier et range les suivants dans la bibliothèque
export async function openFiles(files, go) {
  let first = null, n = 0;
  for (const f of files) {
    try { const id = await addFile(f); if (id) { n++; first ||= id; } } catch (e) { console.error(e); toast(`Impossible d’ouvrir ${f.name}`, 4000); }
  }
  if (first) { if (n > 1) toast(`${n} fichiers ajoutés à vos documents`); go(first); }
  return !!first;
}
