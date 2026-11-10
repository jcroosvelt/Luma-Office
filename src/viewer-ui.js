// Éléments communs des lecteurs (PDF, Excel) : barre du haut, menu, suppression.
import { h, icon, sheet, menuList, confirmDialog } from './ui.js';

export function viewerTopbar(rec, hooks, items) {
  const open = () => { let s; s = sheet('Options', menuList(items(), () => s.close())); };
  return h('header', { class: 'topbar' },
    h('button', { class: 'mark-btn', 'aria-label': 'Mes documents', title: 'Mes documents', onclick: () => hooks.onBack() }, h('img', { src: './icons/icon-192.png', alt: 'Luma Office' })),
    h('div', { class: 'vtitle', title: rec.title }, h('span', { class: 'vbadge k-' + rec.kind }, rec.kind === 'pdf' ? 'PDF' : 'Excel'), h('b', {}, rec.title)),
    h('button', { class: 'icon-btn', 'aria-label': 'Options', onclick: open }, icon('more', 22)));
}

export const deleteItem = (rec, hooks) => ({
  icon: 'trash', label: 'Supprimer de mes documents', danger: true,
  run: async () => { if (await confirmDialog(`Supprimer « ${rec.title} » définitivement ?`, 'Supprimer', true)) hooks.onDelete(rec); },
});

export function searchSheet({ title, placeholder, run, render }) {
  const input = h('input', { class: 'field', type: 'search', placeholder, enterkeyhint: 'search', 'aria-label': placeholder });
  const list = h('div', { class: 'sres' });
  let timer, s;
  const go = async () => { const q = input.value.trim(); list.replaceChildren(q ? h('p', { class: 'muted' }, 'Recherche…') : ''); if (!q) return; const res = await run(q); list.replaceChildren(...(res.length ? res.map((r) => render(r, () => s.close())) : [h('p', { class: 'muted' }, 'Aucun résultat.')])); };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(go, 250); });
  s = sheet(title, h('div', { class: 'form' }, input, list), { wide: true });
  setTimeout(() => input.focus(), 260);
  return s;
}
