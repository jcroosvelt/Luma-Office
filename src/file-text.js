// Extraction rapide du texte d'un fichier (recherche dans le contenu des fichiers de l'appareil).
import JSZip from 'jszip';
import { loadPdfjs, pageText } from './pdf-lib.js';

export const SUPPORTED = ['docx', 'xlsx', 'xlsm', 'csv', 'txt', 'md', 'html', 'htm', 'pdf'];
export const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const strip = (xml) => decode(xml.replace(/<[^>]+>/g, ''));

export async function extractText(file, { pdfPages = 25, cap = 300000 } = {}) {
  const ext = extOf(file.name);
  try {
    if (ext === 'docx') {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const xml = await zip.file('word/document.xml')?.async('string');
      return xml ? strip(xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ')).slice(0, cap) : '';
    }
    if (ext === 'xlsx' || ext === 'xlsm') {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const ss = await zip.file('xl/sharedStrings.xml')?.async('string');
      return ss ? strip(ss.replace(/<\/si>/g, '\n')).slice(0, cap) : '';
    }
    if (ext === 'pdf') {
      const pdfjs = await loadPdfjs();
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
      const doc = await task.promise;
      let out = '';
      for (let n = 1; n <= Math.min(doc.numPages, pdfPages) && out.length < cap; n++) out += (await pageText(doc, n)) + '\n';
      task.destroy();
      return out;
    }
    if (['csv', 'txt', 'md'].includes(ext)) return (await file.slice(0, cap).text());
    if (ext === 'html' || ext === 'htm') return strip(await file.slice(0, cap * 2).text());
  } catch { /* fichier illisible ou protégé */ }
  return '';
}
