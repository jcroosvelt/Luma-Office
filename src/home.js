// Page « Documents » : modèles rapides, recherche plein texte, bibliothèque, import de fichiers.
import { h, icon, sheet, menuList, confirmDialog, promptDialog } from './ui.js';
import { listDocs, deleteDoc, putDoc, newId } from './storage.js';
import { TEMPLATES } from './templates.js';
import { canInstall, onInstallAvailable, promptInstall } from './install.js';
import { poweredBy, openAbout } from './about.js';
import { shell } from './shell.js';
import { searchLibrary, snippetEl, terms } from './search.js';
import { IMPORT_ACCEPT } from './files.js';
import { openDeviceSearch } from './search-ui.js';

const fmtDate = (t) => {
  const d = new Date(t), now = new Date();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Aujourd’hui, ${time}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Hier, ${time}`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};
const KIND = { pdf: ['PDF', 'k-pdf'], sheet: ['Excel', 'k-sheet'] };

export async function showDocuments(host, { onOpen, onNew, onImportFiles, refresh }) {
  const docs = await listDocs();
  let query = '';
  const list = h('div', { class: 'doclist' });
  const more = h('div', { class: 'devmore' });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  function card({ doc: d, snippet }) {
    const k = KIND[d.kind];
    const thumb = d.kind === 'pdf' && d.thumb
      ? h('div', { class: 'thumb pdfthumb' }, h('img', { src: d.thumb, alt: '' }))
      : h('div', { class: 'thumb' }, snippet ? snippetEl(h, snippet) : h('div', { class: 'thumb-text' }, d.preview || (k ? k[0] : 'Document vide')));
    return h('article', { class: 'doccard', tabindex: '0', onclick: () => onOpen(d.id), onkeydown: (e) => { if (e.key === 'Enter') onOpen(d.id); } },
      thumb,
      h('div', { class: 'meta' },
        h('div', { class: 'meta-t' }, h('b', {}, k ? h('span', { class: 'vbadge sm ' + k[1] }, k[0]) : null, d.title || 'Sans titre'),
          h('small', {}, `${fmtDate(d.updated)} · ${d.kind === 'pdf' ? (d.pages ? d.pages + ' p.' : 'PDF') : d.kind === 'sheet' ? (d.sheetsCount ? d.sheetsCount + ' feuille' + (d.sheetsCount > 1 ? 's' : '') : 'Classeur') : (d.words || 0) + ' mot' + ((d.words || 0) > 1 ? 's' : '')}`)),
        h('button', { class: 'icon-btn', 'aria-label': 'Options', onclick: (e) => { e.stopPropagation(); cardMenu(d); } }, icon('more', 20))));
  }

  function renderList() {
    const res = searchLibrary(docs, query);
    const q = query.trim();
    more.replaceChildren(...[q ? h('button', { class: 'btn sm devbtn', onclick: () => openDeviceSearch({ query: q, onOpen: (f) => onImportFiles([f]) }) }, icon('folder', 18), `Chercher « ${q.length > 24 ? q.slice(0, 24) + '…' : q} » sur l’appareil`) : null].filter(Boolean));
    if (!res.length) {
      list.replaceChildren(h('div', { class: 'empty' }, icon('file', 40),
        h('p', {}, docs.length ? 'Aucun document ne correspond à votre recherche.' : 'Aucun document pour l’instant.'),
        docs.length ? null : h('small', {}, 'Choisissez un modèle ci-dessus, importez un fichier ou créez un document vierge.')));
      return;
    }
    list.replaceChildren(...res.map(card));
    void terms;
  }

  function cardMenu(d) {
    let s;
    s = sheet(d.title, menuList([
      { icon: 'file', label: 'Ouvrir', run: () => onOpen(d.id) },
      { icon: 'edit', label: 'Renommer', run: async () => { const t = await promptDialog('Renommer', 'Titre du document', d.title); if (t?.trim()) { await putDoc({ ...d, title: t.trim() }); refresh(); } } },
      { icon: 'copy', label: 'Dupliquer', run: async () => { await putDoc({ ...d, id: newId(), title: d.title + ' (copie)', updated: Date.now() }); refresh(); } },
      { icon: 'trash', label: 'Supprimer', danger: true, run: async () => { if (await confirmDialog(`Supprimer « ${d.title} » définitivement ?`, 'Supprimer', true)) { await deleteDoc(d.id); refresh(); } } },
    ], () => s.close()));
  }

  const search = h('input', { class: 'field search', type: 'search', placeholder: 'Rechercher dans mes documents (titre et contenu)…', 'aria-label': 'Rechercher dans mes documents', oninput: (e) => { query = e.target.value; renderList(); } });
  const fileInput = h('input', { type: 'file', accept: IMPORT_ACCEPT, multiple: true, hidden: true, onchange: () => { const f = [...fileInput.files]; fileInput.value = ''; if (f.length) onImportFiles(f); } });
  const install = h('button', { class: 'btn sm', 'data-install': '', hidden: !canInstall(), onclick: () => promptInstall() }, icon('download', 18), ' Installer');

  const content = h('main', { class: 'home-main' },
    h('section', {},
      h('div', { class: 'row between' }, h('h2', {}, 'Nouveau document'), h('a', { class: 'seeall', href: '#/modeles' }, 'Tous les modèles →')),
      h('div', { class: 'tplrow' }, TEMPLATES.filter((t) => ['blank', 'letter', 'report', 'minutes', 'invoice', 'cv'].includes(t.id)).map((t) =>
        h('button', { class: 'tpl', onclick: () => onNew(t) }, h('span', { class: 'tpl-ic' }, t.emoji), h('b', {}, t.name), h('small', {}, t.desc))))),
    h('section', {},
      h('div', { class: 'row between' }, h('h2', {}, 'Mes documents'),
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: () => openDeviceSearch({ onOpen: (f) => onImportFiles([f]) }) }, icon('folder', 18), ' Appareil'),
          h('button', { class: 'btn sm', onclick: () => fileInput.click() }, icon('upload', 18), ' Importer'))),
      search, more, list, fileInput),
    isIOS && !standalone ? h('p', { class: 'tip' }, 'Astuce : pour installer Luma Office sur votre iPhone / iPad, touchez Partager puis « Sur l’écran d’accueil ».') : null,
    h('p', { class: 'tip' }, 'Vos documents sont enregistrés sur cet appareil et fonctionnent hors ligne. Ouvrez aussi vos PDF, fichiers Excel et Word, et recherchez dans tout leur contenu.'));
  const foot = h('div', { class: 'home-foot' }, poweredBy(), h('button', { class: 'linkbtn', onclick: openAbout }, 'À propos'));
  const fab = h('button', { class: 'fab', onclick: () => onNew(TEMPLATES[0]) }, icon('plus', 24), h('span', {}, 'Nouveau'));

  const page = shell('#/', h('div', { class: 'page' }, content, foot), { fab, headExtra: install });
  host.replaceChildren(page);
  onInstallAvailable(() => { install.hidden = !canInstall(); });
  renderList();
}
