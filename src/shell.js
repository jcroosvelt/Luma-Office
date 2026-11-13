// Structure commune des pages (Documents, Modèles, Paramètres) : en-tête avec logo et navigation.
import { h, icon } from './ui.js';

const NAV = [['#/', 'Documents', 'file'], ['#/modeles', 'Modèles', 'layout'], ['#/outils', 'Outils', 'grid'], ['#/cloud', 'Cloud', 'cloud'], ['#/parametres', 'Paramètres', 'settings']];

export function shell(active, content, { fab, headExtra } = {}) {
  const nav = (cls) => h('nav', { class: 'appnav ' + cls, 'aria-label': 'Navigation principale' },
    NAV.map(([hash, label, ic]) => h('a', { href: hash, class: 'navitem' + (active === hash ? ' on' : ''), 'aria-current': active === hash ? 'page' : null }, icon(ic, 22), h('span', {}, label))));
  const head = h('header', { class: 'home-head' },
    h('a', { class: 'logo-wrap', href: '#/', 'aria-label': 'Accueil' }, h('img', { src: './logo.png', alt: 'Luma Office', class: 'logo' })),
    h('div', { class: 'grow' }), nav('top'), headExtra || null);
  return h('div', { class: 'home shell' }, head, content, nav('bottom'), fab || null);
}
