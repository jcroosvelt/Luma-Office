// Page « Outils » : scanner, conversions d'images, PowerPoint, compression, partage, export, fusion de PDF.
import { h, icon, toast } from './ui.js';
import { shell } from './shell.js';

export async function showTools(host, { onOpen, refresh }) {
  const done = (id) => { refresh?.(); onOpen(id); };
  const card = (ic, label, hint, run) => h('button', { class: 'tool-card', onclick: run },
    h('span', { class: 'tool-ic' }, icon(ic, 22)), h('span', { class: 'tool-t' }, h('b', {}, label), h('small', {}, hint)));
  const lazy = (load, fn, arg) => async () => { try { const m = await load(); await m[fn](arg); } catch (e) { console.error(e); toast('Cet outil n’a pas pu s’ouvrir. Réessayez.', 4000); } };
  const ocr = async () => {
    const m = await import('./ocr.js'); const { createDocFromHtml } = await import('./files.js');
    m.openOcr({ title: 'Image vers document (OCR)', cta: 'Créer le document', onResult: async (text) => {
      const rec = await createDocFromHtml({ title: 'Texte numérisé ' + new Date().toLocaleDateString('fr-FR'), html: m.paragraphsToHtml(m.textToParagraphs(text)) });
      toast('Document créé — relisez-le : la reconnaissance peut contenir des erreurs', 4500); done(rec.id);
    } });
  };
  const section = (title, ...cards) => h('section', { class: 'tool-sec' }, h('h2', {}, title), h('div', { class: 'tool-grid' }, ...cards));
  const content = h('main', { class: 'home-main' },
    section('Scanner d’images',
      card('camera', 'Scanneur', 'Photographier des pages', lazy(() => import('./pdf-tools.js'), 'openScanner', { onDone: done })),
      card('pdf', 'Image vers PDF', 'Assembler des images en PDF', lazy(() => import('./pdf-tools.js'), 'openScanner', { onDone: done })),
      card('word', 'Image vers DOC', 'Lire le texte (OCR) et créer un document', ocr),
      card('layout', 'Image vers PPT', 'Une image par diapositive', lazy(() => import('./image-tools.js'), 'openImagesToPpt')),
      card('share', 'Partage d’images', 'Envoyer des images', lazy(() => import('./image-tools.js'), 'openShareImages')),
      card('download', 'Exporter des images', 'Pages d’un PDF, images d’un document', lazy(() => import('./image-tools.js'), 'openExportImages')),
      card('fit', 'Compression d’image', 'Alléger vos photos', lazy(() => import('./image-tools.js'), 'openCompress')),
      card('orient', 'Convertir le format d’image', 'PNG, JPEG, WebP', lazy(() => import('./image-tools.js'), 'openConvert'))),
    section('PDF',
      card('copy', 'Fusionner des PDF', 'Assembler plusieurs PDF en un seul', lazy(() => import('./pdf-tools.js'), 'openMerge', { onDone: done }))));
  host.replaceChildren(shell('#/outils', h('div', { class: 'page' }, content)));
}
