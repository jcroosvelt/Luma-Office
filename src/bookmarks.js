// Signets (ancres nommées) et renvois (liens internes vers un signet ou un titre).
import { h, icon, sheet, toast } from './ui.js';
import { bmId } from './extensions.js';

export function listBookmarks(editor) {
  const seen = new Map();
  editor.state.doc.descendants((node, pos) => {
    node.marks?.forEach((m) => { if (m.type.name === 'bookmark') { const e = seen.get(m.attrs.name); if (e) e.to = pos + node.nodeSize; else seen.set(m.attrs.name, { name: m.attrs.name, from: pos, to: pos + node.nodeSize, text: node.text || '' }); } });
  });
  return [...seen.values()];
}
export function listHeadings(editor) {
  const out = [];
  editor.state.doc.descendants((node, pos) => { if (node.type.name === 'heading' && node.textContent.trim()) out.push({ text: node.textContent.trim(), level: node.attrs.level, pos, size: node.nodeSize }); });
  return out;
}
function addBookmark(editor, name) {
  const { state } = editor; let { from, to } = state.selection;
  if (from === to) { // pas de sélection : le mot sous le curseur
    const $p = state.doc.resolve(from), t = $p.parent.textContent, off = $p.parentOffset;
    let a = off, b = off; while (a > 0 && /\S/.test(t[a - 1])) a--; while (b < t.length && /\S/.test(t[b])) b++;
    if (a === b) { toast('Sélectionnez le texte à marquer'); return false; }
    from = $p.start() + a; to = $p.start() + b;
  }
  if (listBookmarks(editor).some((b) => b.name === name)) { toast('Ce nom de signet existe déjà'); return false; }
  editor.view.dispatch(state.tr.addMark(from, to, state.schema.marks.bookmark.create({ name })));
  return true;
}
function removeBookmark(editor, name) {
  const { state } = editor; let tr = state.tr;
  state.doc.descendants((node, pos) => { node.marks?.forEach((m) => { if (m.type.name === 'bookmark' && m.attrs.name === name) tr = tr.removeMark(pos, pos + node.nodeSize, m); }); });
  editor.view.dispatch(tr);
}
export function gotoBookmark(editor, name) {
  const b = listBookmarks(editor).find((x) => x.name === name); if (!b) { toast('Signet introuvable'); return; }
  editor.chain().focus().setTextSelection({ from: b.from, to: b.to }).scrollIntoView().run();
  const el = editor.view.dom.querySelector('#' + CSS.escape(bmId(name)));
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); el?.classList.add('bm-flash'); setTimeout(() => el?.classList.remove('bm-flash'), 1500);
}

export function openBookmarks(editor) {
  let s;
  const input = h('input', { class: 'field', placeholder: 'Nom du signet (ex. Conclusion)', 'aria-label': 'Nom du signet', maxlength: 60 });
  const list = h('div', { class: 'ver-list' });
  const render = () => {
    const bms = listBookmarks(editor);
    list.replaceChildren(...(bms.length ? bms.map((b) => h('div', { class: 'ver-row' }, h('div', { class: 'ver-meta' }, h('b', {}, b.name), h('small', {}, `« ${b.text.slice(0, 50)} »`)),
      h('div', { class: 'ver-act' }, h('button', { class: 'btn sm', onclick: () => { s.close(); gotoBookmark(editor, b.name); } }, 'Aller'), h('button', { class: 'icon-btn', 'aria-label': 'Supprimer le signet', onclick: () => { removeBookmark(editor, b.name); render(); } }, icon('trash', 18))))) : [h('p', { class: 'muted' }, 'Aucun signet. Sélectionnez un texte, donnez un nom, puis ajoutez.')]));
  };
  s = sheet('Signets', h('div', { class: 'form' }, h('p', { class: 'muted' }, 'Un signet marque un endroit du document pour y revenir ou y renvoyer depuis un autre passage.'), input,
    h('button', { class: 'btn primary', onclick: () => { const n = input.value.trim(); if (!n) { toast('Donnez un nom au signet'); return; } if (addBookmark(editor, n)) { input.value = ''; render(); toast('Signet ajouté ✓'); } } }, icon('bookmark', 18), 'Ajouter au texte sélectionné'),
    list));
  render();
}

export function openXref(editor) {
  const bms = listBookmarks(editor), heads = listHeadings(editor);
  if (!bms.length && !heads.length) { toast('Ajoutez d’abord des titres ou des signets', 3500); return; }
  let s;
  const insert = (name, label) => {
    s.close();
    editor.chain().focus().insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href: '#' + bmId(name) } }] }).insertContent(' ').run();
    toast('Renvoi inséré ✓ (cliquez dessus pour y aller)', 3000);
  };
  const fromHeading = (hd) => {
    const name = ('§ ' + hd.text).slice(0, 50);
    if (!listBookmarks(editor).some((b) => b.name === name)) editor.view.dispatch(editor.state.tr.addMark(hd.pos + 1, hd.pos + hd.size - 1, editor.state.schema.marks.bookmark.create({ name })));
    insert(name, hd.text);
  };
  s = sheet('Renvoi', h('div', { class: 'form' }, h('p', { class: 'muted' }, 'Insère un lien cliquable vers un titre ou un signet du document.'),
    heads.length ? h('b', {}, 'Titres') : null, ...heads.map((hd) => h('button', { class: 'sres-item', style: `padding-left:${12 + (hd.level - 1) * 14}px`, onclick: () => fromHeading(hd) }, hd.text)),
    bms.length ? h('b', {}, 'Signets') : null, ...bms.map((b) => h('button', { class: 'sres-item', onclick: () => insert(b.name, b.text || b.name) }, h('span', {}, b.name), h('small', { class: 'muted' }, ` « ${b.text.slice(0, 40)} »`)))), { wide: true });
}
