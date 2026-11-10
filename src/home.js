// Écran d'accueil : modèles et documents récents.
import { h, icon, sheet, menuList, confirmDialog, promptDialog, applyTheme } from './ui.js';
import { listDocs, deleteDoc, putDoc, newId, pref } from './storage.js';
import { TEMPLATES } from './templates.js';
import { canInstall, onInstallAvailable, promptInstall } from './install.js';
import { poweredBy, openAbout } from './about.js';

const fmtDate = (t) => {
  const d = new Date(t), now = new Date();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Aujourd’hui, ${time}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Hier, ${time}`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};


export async function showHome(host, { onOpen, onNew, onImport }) {
  const docs = await listDocs();
  let query = '';
  const list = h('div', { class: 'doclist' });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  function renderList() {
    const q = query.toLowerCase();
    const shown = docs.filter((d) => !q || d.title.toLowerCase().includes(q) || (d.preview || '').toLowerCase().includes(q));
    if (!shown.length) {
      list.replaceChildren(h('div', { class: 'empty' }, icon('file', 40),
        h('p', {}, docs.length ? 'Aucun document ne correspond à votre recherche.' : 'Aucun document pour l’instant.'),
        docs.length ? null : h('small', {}, 'Choisissez un modèle ci-dessus ou créez un document vierge.')));
      return;
    }
    list.replaceChildren(...shown.map((d) => h('article', { class: 'doccard', tabindex: '0', onclick: () => onOpen(d.id), onkeydown: (e) => { if (e.key === 'Enter') onOpen(d.id); } },
      h('div', { class: 'thumb' }, h('div', { class: 'thumb-text' }, d.preview || 'Document vide')),
      h('div', { class: 'meta' },
        h('div', { class: 'meta-t' }, h('b', {}, d.title || 'Sans titre'), h('small', {}, `${fmtDate(d.updated)} · ${d.words || 0} mot${(d.words || 0) > 1 ? 's' : ''}`)),
        h('button', { class: 'icon-btn', 'aria-label': 'Options', onclick: (e) => { e.stopPropagation(); cardMenu(d); } }, icon('more', 20))))));
  }

  function cardMenu(d) {
    let s;
    s = sheet(d.title, menuList([
      { icon: 'file', label: 'Ouvrir', run: () => onOpen(d.id) },
      { icon: 'edit', label: 'Renommer', run: async () => { const t = await promptDialog('Renommer', 'Titre du document', d.title); if (t?.trim()) { await putDoc({ ...d, title: t.trim() }); onNew.refresh(); } } },
      { icon: 'copy', label: 'Dupliquer', run: async () => { await putDoc({ ...d, id: newId(), title: d.title + ' (copie)', updated: Date.now() }); onNew.refresh(); } },
      { icon: 'trash', label: 'Supprimer', danger: true, run: async () => { if (await confirmDialog(`Supprimer « ${d.title} » définitivement ?`, 'Supprimer', true)) { await deleteDoc(d.id); onNew.refresh(); } } },
    ], () => s.close()));
  }

  const search = h('input', { class: 'field search', type: 'search', placeholder: 'Rechercher un document…', 'aria-label': 'Rechercher un document', oninput: (e) => { query = e.target.value; renderList(); } });
  const themeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Changer de thème', onclick: () => {
    const t = { auto: 'light', light: 'dark', dark: 'auto' }[pref.get('theme', 'auto')];
    pref.set('theme', t); applyTheme(t);
  } }, icon('moon', 22));

  const view = h('div', { class: 'home' },
    h('header', { class: 'home-head' },
      h('div', { class: 'logo-wrap' }, h('img', { src: './logo.png', alt: 'Luma Office', class: 'logo' })),
      h('div', { class: 'grow' }),
      h('button', { class: 'btn sm', 'data-install': '', hidden: !canInstall(), onclick: () => promptInstall() }, icon('download', 18), ' Installer'),
      themeBtn),
    h('main', { class: 'home-main' },
      h('section', {},
        h('h2', {}, 'Nouveau document'),
        h('div', { class: 'tplrow' }, TEMPLATES.map((t) =>
          h('button', { class: 'tpl', onclick: () => onNew(t) },
            h('span', { class: 'tpl-ic' }, t.emoji), h('b', {}, t.name), h('small', {}, t.desc))))),
      h('section', {},
        h('div', { class: 'row between' }, h('h2', {}, 'Mes documents'),
          h('button', { class: 'btn sm', onclick: () => onImport() }, icon('upload', 18), ' Importer')),
        docs.length > 3 ? search : null,
        list),
      isIOS && !standalone ? h('p', { class: 'tip' }, 'Astuce : pour installer Luma Office sur votre iPhone / iPad, touchez Partager puis « Sur l’écran d’accueil ».') : null,
      h('p', { class: 'tip' }, 'Vos documents sont enregistrés sur cet appareil et fonctionnent hors ligne. Exportez-les en Word ou en PDF depuis le menu ⋯ de l’éditeur.')),
    h('div', { class: 'home-foot' }, poweredBy(), h('button', { class: 'linkbtn', onclick: openAbout }, 'À propos')),
    h('button', { class: 'fab', onclick: () => onNew(TEMPLATES[0]) }, icon('plus', 24), h('span', {}, 'Nouveau')));
  host.replaceChildren(view);
  onInstallAvailable(() => { const b = view.querySelector('[data-install]'); if (b) b.hidden = !canInstall(); });
  renderList();
}
