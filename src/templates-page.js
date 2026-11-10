// Page « Modèles » : galerie par catégorie avec aperçu de la page, et modèles personnels.
import { h, icon, sheet, menuList, confirmDialog, toast } from './ui.js';
import { TEMPLATES, CATEGORIES } from './templates.js';
import { listUserTemplates, deleteDoc } from './storage.js';
import { shell } from './shell.js';

function preview(html, landscape) {
  const W = landscape ? 1123 : 794, H = landscape ? 794 : 1123;
  const page = h('div', { class: 'tp-page doc-content', style: { width: W + 'px', height: H + 'px' }, html });
  const box = h('div', { class: 'tp-prev', style: { aspectRatio: `${W} / ${H}` } }, page);
  const fit = () => { const k = box.clientWidth / W; if (k) page.style.transform = `scale(${k})`; };
  new ResizeObserver(fit).observe(box);
  requestAnimationFrame(fit);
  return box;
}

export async function showTemplates(host, { onUse, refresh }) {
  const mine = await listUserTemplates();
  let cat = 'Tous';
  const grid = h('div', { class: 'tp-grid' });
  const chips = h('div', { class: 'chips', role: 'tablist' });

  function render() {
    chips.replaceChildren(...['Tous', ...CATEGORIES, ...(mine.length ? ['Mes modèles'] : [])].map((c) =>
      h('button', { class: 'chip' + (c === cat ? ' on' : ''), role: 'tab', 'aria-selected': c === cat, onclick: () => { cat = c; render(); } }, c)));
    const base = TEMPLATES.filter((t) => cat === 'Tous' || t.cat === cat);
    const own = cat === 'Tous' || cat === 'Mes modèles' ? mine : [];
    const cards = [
      ...(cat === 'Mes modèles' ? [] : base).map((t) => tcard({ name: t.name, desc: t.desc, cat: t.cat, html: t.html(), landscape: t.settings?.orientation === 'landscape', use: () => onUse(t) })),
      ...own.map((t) => tcard({ name: t.title, desc: 'Modèle personnel', cat: 'Mes modèles', html: t.html || '<p></p>', landscape: t.settings?.orientation === 'landscape', use: () => onUse({ id: 'user:' + t.id, name: t.title, html: () => t.html, settings: t.settings || {} }), menu: () => userMenu(t) })),
    ];
    grid.replaceChildren(...(cards.length ? cards : [h('div', { class: 'empty' }, icon('star', 36), h('p', {}, 'Aucun modèle personnel.'), h('small', {}, 'Dans l’éditeur, menu ⋯ › « Enregistrer comme modèle ».'))]));
  }
  function tcard({ name, desc, cat: c, html, landscape, use, menu }) {
    return h('article', { class: 'tp-card', tabindex: '0', onclick: use, onkeydown: (e) => { if (e.key === 'Enter') use(); } },
      preview(html, landscape),
      h('div', { class: 'tp-meta' }, h('div', {}, h('b', {}, name), h('small', {}, desc), h('span', { class: 'tp-cat' }, c)),
        menu ? h('button', { class: 'icon-btn', 'aria-label': 'Options', onclick: (e) => { e.stopPropagation(); menu(); } }, icon('more', 20)) : null));
  }
  function userMenu(t) {
    let s;
    s = sheet(t.title, menuList([
      { icon: 'file', label: 'Créer un document', run: () => onUse({ id: 'user:' + t.id, name: t.title, html: () => t.html, settings: t.settings || {} }) },
      { icon: 'trash', label: 'Supprimer ce modèle', danger: true, run: async () => { if (await confirmDialog(`Supprimer le modèle « ${t.title} » ?`, 'Supprimer', true)) { await deleteDoc(t.id); toast('Modèle supprimé'); refresh(); } } },
    ], () => s.close()));
  }

  const content = h('main', { class: 'home-main' },
    h('section', {}, h('h1', { class: 'ptitle' }, 'Modèles de documents'), h('p', { class: 'muted' }, 'Touchez un modèle pour créer un document prêt à compléter. Vos propres modèles apparaissent dans « Mes modèles ».'), chips, grid));
  host.replaceChildren(shell('#/modeles', h('div', { class: 'page' }, content, h('div', { class: 'home-foot' }))));
  render();
}
