import { Extension, Node, Mark, mergeAttributes } from '@tiptap/core';
import { ReplaceStep, Mapping } from '@tiptap/pm/transform';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import Image from '@tiptap/extension-image';
import { TableCell, Table } from '@tiptap/extension-table';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { formatDate } from './datefmt.js';

/* ---------- Mise en forme de paragraphe : interligne, retrait, espacement ---------- */
export const INDENT_PT = 36;

export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (a) => (a.lineHeight ? { style: `line-height:${a.lineHeight}` } : {}),
          },
          indent: {
            default: 0,
            parseHTML: (el) => parseInt(el.getAttribute('data-indent') || '0', 10) || 0,
            renderHTML: (a) => (a.indent ? { 'data-indent': a.indent, style: `margin-left:${a.indent * INDENT_PT}pt` } : {}),
          },
          indentRight: {
            default: null,
            parseHTML: (el) => (el.style.marginRight ? parseFloat(el.style.marginRight) : null),
            renderHTML: (a) => (a.indentRight != null ? { style: `margin-right:${a.indentRight}pt` } : {}),
          },
          spaceBefore: {
            default: null,
            parseHTML: (el) => (el.style.marginTop ? parseFloat(el.style.marginTop) : null),
            renderHTML: (a) => (a.spaceBefore != null ? { style: `margin-top:${a.spaceBefore}pt` } : {}),
          },
          spaceAfter: {
            default: null,
            parseHTML: (el) => (el.style.marginBottom ? parseFloat(el.style.marginBottom) : null),
            renderHTML: (a) => (a.spaceAfter != null ? { style: `margin-bottom:${a.spaceAfter}pt` } : {}),
          },
        },
      },
      {
        types: ['paragraph'],
        attributes: {
          dropCap: {
            default: false,
            parseHTML: (el) => el.hasAttribute('data-dropcap'),
            renderHTML: (a) => (a.dropCap ? { 'data-dropcap': '1' } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    const each = (tr, state, fn) => {
      const { from, to } = state.selection;
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'paragraph' || node.type.name === 'heading') {
          const attrs = fn(node.attrs);
          if (attrs) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
        }
      });
      return true;
    };
    return {
      setParagraphProps: (props) => ({ tr, state, dispatch }) => { if (dispatch) each(tr, state, () => props); return true; },
      changeIndent: (delta) => ({ tr, state, dispatch }) => {
        if (dispatch) each(tr, state, (a) => ({ indent: Math.max(0, Math.min(10, (a.indent || 0) + delta)) }));
        return true;
      },
    };
  },
});

/* ---------- Saut de page ---------- */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() { return [{ tag: 'div[data-page-break]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '', class: 'page-break' }), ['span', 'Saut de page']];
  },
  addCommands() {
    return {
      insertPageBreak: () => ({ chain }) => chain().insertContent([{ type: 'pageBreak' }, { type: 'paragraph' }]).run(),
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.insertPageBreak() };
  },
});

/* ---------- Saut de colonne ---------- */
export const ColumnBreak = Node.create({
  name: 'columnBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() { return [{ tag: 'div[data-column-break]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-column-break': '', class: 'column-break' }), ['span', 'Saut de colonne']]; },
  addCommands() { return { insertColumnBreak: () => ({ chain }) => chain().insertContent([{ type: 'columnBreak' }, { type: 'paragraph' }]).run() }; },
});

/* ---------- Image : largeur ajustable ---------- */
export const LumaImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => parseInt(el.getAttribute('width') || el.style.width, 10) || null,
        renderHTML: (a) => (a.width ? { width: a.width, style: `width:${a.width}px;max-width:100%;height:auto` } : {}),
      },
      float: {
        default: 'none',
        parseHTML: (el) => el.getAttribute('data-float') || 'none',
        renderHTML: (a) => (a.float && a.float !== 'none' ? { 'data-float': a.float } : {}),
      },
      shape: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-shape') || null,
        renderHTML: (a) => (a.shape ? { 'data-shape': a.shape } : {}),
      },
    };
  },
});

/* ---------- Cellule de tableau avec couleur de fond ---------- */
export const LumaCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (el) => el.style.backgroundColor || el.getAttribute('data-bg') || null,
        renderHTML: (a) => (a.backgroundColor ? { 'data-bg': a.backgroundColor, style: `background-color:${a.backgroundColor}` } : {}),
      },
    };
  },
});

/* ---------- Ligne horizontale colorée (épaisseur et couleur) ---------- */
export const LumaRule = HorizontalRule.extend({
  addAttributes() {
    return {
      color: { default: null, parseHTML: (el) => el.getAttribute('data-color') || null, renderHTML: (a) => (a.color ? { 'data-color': a.color } : {}) },
      weight: { default: null, parseHTML: (el) => parseFloat(el.getAttribute('data-weight')) || null, renderHTML: (a) => (a.weight ? { 'data-weight': a.weight, style: `border-top:${a.weight}pt solid ${a.color || '#9aa0a6'}` } : a.color ? { style: `border-top:1px solid ${a.color}` } : {}) },
    };
  },
});

/* ---------- Tableau sans bordures (mise en page des modèles) ---------- */
export const LumaTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borderless: {
        default: false,
        parseHTML: (el) => el.hasAttribute('data-borderless'),
        renderHTML: (a) => (a.borderless ? { 'data-borderless': '1' } : {}),
      },
    };
  },
});

/* ---------- Rechercher / Remplacer ---------- */
export const searchKey = new PluginKey('luma-search');

function findMatches(doc, term, cs) {
  const out = [];
  if (!term) return out;
  const needle = cs ? term : term.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const map = [];
    node.forEach((child, off) => {
      if (child.isText) {
        for (let k = 0; k < child.text.length; k++) map.push(pos + 1 + off + k);
        text += child.text;
      } else { map.push(pos + 1 + off); text += '￼'; }
    });
    const hay = cs ? text : text.toLowerCase();
    let i = 0;
    while ((i = hay.indexOf(needle, i)) > -1) {
      out.push({ from: map[i], to: map[i + needle.length - 1] + 1 });
      i += needle.length;
    }
    return false;
  });
  return out;
}

export const SearchReplace = Extension.create({
  name: 'searchReplace',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: () => ({ term: '', cs: false, current: 0, matches: [], deco: DecorationSet.empty }),
          apply(tr, prev, _o, newState) {
            const meta = tr.getMeta(searchKey);
            if (!meta && !tr.docChanged) return prev;
            const term = meta?.term ?? prev.term;
            const cs = meta?.cs ?? prev.cs;
            const matches = findMatches(newState.doc, term, cs);
            let current = meta?.current ?? prev.current;
            if (current >= matches.length) current = 0;
            const deco = DecorationSet.create(
              newState.doc,
              matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? 'search-hit search-current' : 'search-hit' })),
            );
            return { term, cs, current, matches, deco };
          },
        },
        props: { decorations: (state) => searchKey.getState(state).deco },
      }),
    ];
  },
  addCommands() {
    const goto = (i) => ({ state, tr, dispatch }) => {
      const st = searchKey.getState(state);
      if (!st.matches.length) return false;
      const n = (i + st.matches.length) % st.matches.length;
      if (dispatch) {
        const m = st.matches[n];
        tr.setMeta(searchKey, { current: n });
        tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView();
      }
      return true;
    };
    return {
      setSearch: (term, cs = false) => ({ tr, dispatch }) => { if (dispatch) tr.setMeta(searchKey, { term, cs, current: 0 }); return true; },
      findNext: () => ({ state, ...rest }) => goto(searchKey.getState(state).current + 1)({ state, ...rest }),
      findPrev: () => ({ state, ...rest }) => goto(searchKey.getState(state).current - 1)({ state, ...rest }),
      replaceCurrent: (text) => ({ state, tr, dispatch }) => {
        const st = searchKey.getState(state);
        const m = st.matches[st.current];
        if (!m) return false;
        if (dispatch) tr.insertText(text, m.from, m.to);
        return true;
      },
      replaceAll: (text) => ({ state, tr, dispatch }) => {
        const st = searchKey.getState(state);
        if (!st.matches.length) return false;
        if (dispatch) [...st.matches].reverse().forEach((m) => tr.insertText(text, m.from, m.to));
        return true;
      },
    };
  },
});

/* ---------- Table des matières ---------- */
export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      items: {
        default: [],
        parseHTML: (el) => { try { return JSON.parse(el.getAttribute('data-items') || '[]'); } catch { return []; } },
        renderHTML: (a) => ({ 'data-items': JSON.stringify(a.items || []) }),
      },
    };
  },
  parseHTML() { return [{ tag: 'div[data-toc]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    const items = node.attrs.items || [];
    return ['div', mergeAttributes(HTMLAttributes, { 'data-toc': '', class: 'toc' }),
      ['div', { class: 'toc-title' }, 'Table des matières'],
      ...(items.length
        ? items.map((it) => ['div', { class: 'toc-item l' + it.level }, ['span', { class: 't' }, it.text || ' '], ['span', { class: 'dots' }], ['span', { class: 'p' }, String(it.page)]])
        : [['div', { class: 'toc-empty' }, 'Ajoutez des titres (Titre 1, 2, 3), puis touchez « Table des matières » pour mettre à jour.']])];
  },
});

/* ---------- Commentaires ---------- */
export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  excludes: '',
  priority: 100,
  addAttributes() {
    return { id: { default: null, parseHTML: (el) => el.getAttribute('data-comment-id'), renderHTML: (a) => ({ 'data-comment-id': a.id }) } };
  },
  parseHTML() { return [{ tag: 'span[data-comment-id]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-mark' }), 0]; },
});

/* ---------- Suivi des modifications ---------- */
const trackAttrs = {
  author: { default: 'Auteur', parseHTML: (el) => el.getAttribute('data-author') || 'Auteur', renderHTML: (a) => ({ 'data-author': a.author }) },
  date: { default: '', parseHTML: (el) => el.getAttribute('data-date') || '', renderHTML: (a) => ({ 'data-date': a.date }) },
};
const fmt = (d) => { try { return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
export const InsertionMark = Mark.create({
  name: 'insertion', inclusive: false, excludes: '', priority: 100,
  addAttributes() { return trackAttrs; },
  parseHTML() { return [{ tag: 'ins' }]; },
  renderHTML({ HTMLAttributes }) { return ['ins', mergeAttributes(HTMLAttributes, { class: 'tc-ins', title: `Ajout — ${HTMLAttributes['data-author']} ${fmt(HTMLAttributes['data-date'])}` }), 0]; },
});
export const DeletionMark = Mark.create({
  name: 'deletion', inclusive: false, excludes: '', priority: 101,
  addAttributes() { return trackAttrs; },
  parseHTML() { return [{ tag: 'del', priority: 101 }]; },
  renderHTML({ HTMLAttributes }) { return ['del', mergeAttributes(HTMLAttributes, { class: 'tc-del', title: `Suppression — ${HTMLAttributes['data-author']} ${fmt(HTMLAttributes['data-date'])}` }), 0]; },
});

const hasInline = (slice) => {
  let found = false;
  slice.content.descendants((n) => { if (n.isText || (n.isInline && n.isLeaf)) found = true; return !found; });
  return found;
};

export function collectChanges(doc, from = 0, to = doc.content.size) {
  const out = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline) return true;
    for (const mk of node.marks) {
      if (mk.type.name !== 'insertion' && mk.type.name !== 'deletion') continue;
      const a = Math.max(pos, from), b = Math.min(pos + node.nodeSize, to);
      const last = out[out.length - 1];
      if (last && last.type === mk.type.name && last.author === mk.attrs.author && last.to === a) last.to = b;
      else out.push({ type: mk.type.name, from: a, to: b, author: mk.attrs.author, date: mk.attrs.date });
    }
    return false;
  });
  return out;
}

export const TrackChanges = Extension.create({
  name: 'trackChanges',
  addStorage() { return { enabled: false, author: 'Auteur' }; },
  addProseMirrorPlugins() {
    const ext = this;
    return [new Plugin({
      key: new PluginKey('luma-track'),
      appendTransaction(trs, oldState, newState) {
        const st = ext.storage;
        if (!st.enabled) return null;
        const tracked = (t) => t.docChanged && !t.getMeta('luma-track') && !t.getMeta('trackIgnore') && !t.getMeta('history$') && !t.getMeta('collab');
        if (!trs.some(tracked)) return null;
        const { insertion, deletion } = newState.schema.marks;
        const stamp = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString(); // à la minute : fusionne les marques voisines
        const mkIns = () => insertion.create({ author: st.author, date: stamp });
        const mkDel = () => deletion.create({ author: st.author, date: stamp });
        const items = [];
        const maps = [];
        for (const tr of trs) tr.steps.forEach((step, i) => { items.push({ step, before: tr.docs[i], on: tracked(tr) }); maps.push(tr.mapping.maps[i]); });

        const tr2 = newState.tr;
        tr2.setMeta('luma-track', true);
        let caret = null;
        items.forEach((it, k) => {
          if (!it.on || !(it.step instanceof ReplaceStep)) return;
          const { from, to, slice } = it.step;
          const rest = new Mapping(maps.slice(k + 1));
          const markInline = (a, b, fn) => tr2.doc.nodesBetween(a, b, (node, pos) => { if (node.isInline) { fn(Math.max(pos, a), Math.min(pos + node.nodeSize, b), node); return false; } return true; });
          if (slice.size > 0) {
            const s = tr2.mapping.map(rest.map(from, 1)), e = tr2.mapping.map(rest.map(from + slice.size, -1));
            if (e > s) markInline(s, e, (a, b) => { tr2.removeMark(a, b, deletion); tr2.addMark(a, b, mkIns()); });
            caret = e;
          }
          if (to > from) {
            const removed = it.before.slice(from, to);
            if (hasInline(removed)) {
              const p = tr2.mapping.map(rest.map(from + slice.size, 1));
              const sizeBefore = tr2.doc.content.size;
              tr2.replace(p, p, removed);
              const re = p + (tr2.doc.content.size - sizeBefore);
              const kill = [];
              markInline(p, re, (a, b, node) => {
                if (node.marks.some((m) => m.type === insertion && m.attrs.author === st.author)) kill.push([a, b]);
                else tr2.addMark(a, b, mkDel());
              });
              kill.reverse().forEach(([a, b]) => tr2.delete(a, b));
              const back = oldState.selection.empty && oldState.selection.from === to && slice.size === 0;
              if (slice.size === 0) caret = back ? p : Math.max(p, re - kill.reduce((n, [a, b]) => n + (b - a), 0));
            }
          }
        });
        if (!tr2.docChanged && !tr2.steps.length) return null;
        if (caret != null) { try { tr2.setSelection(TextSelection.create(tr2.doc, Math.min(caret, tr2.doc.content.size))); } catch { /* ignore */ } }
        return tr2;
      },
    })];
  },
  addCommands() {
    const apply = (accept) => (range) => ({ state, tr, dispatch }) => {
      const { insertion, deletion } = state.schema.marks;
      const list = collectChanges(state.doc, range?.from ?? 0, range?.to ?? state.doc.content.size);
      if (!list.length) return false;
      if (dispatch) {
        tr.setMeta('luma-track', true);
        for (const c of [...list].reverse()) {
          const del = (c.type === 'deletion') === accept; // accepter une suppression / rejeter un ajout => supprimer le texte
          if (del) tr.delete(c.from, c.to);
          else tr.removeMark(c.from, c.to, c.type === 'insertion' ? insertion : deletion);
        }
      }
      return true;
    };
    const go = (dir) => () => ({ state, tr, dispatch }) => {
      const list = collectChanges(state.doc);
      if (!list.length) return false;
      const cur = state.selection;
      const target = dir > 0 ? (list.find((c) => c.from >= cur.to && c.from !== cur.from) || list[0]) : ([...list].reverse().find((c) => c.to <= cur.from) || list[list.length - 1]);
      if (dispatch) tr.setSelection(TextSelection.create(tr.doc, target.from, target.to)).scrollIntoView();
      return true;
    };
    return {
      acceptChanges: apply(true), rejectChanges: apply(false),
      nextChange: go(1), prevChange: go(-1),
      addComment: (id) => ({ commands }) => commands.setMark('comment', { id }),
      removeComment: (id) => ({ state, tr, dispatch }) => {
        if (dispatch) state.doc.descendants((node, pos) => { node.marks.filter((m) => m.type.name === 'comment' && m.attrs.id === id).forEach((m) => tr.removeMark(pos, pos + node.nodeSize, m)); });
        return true;
      },
      updateToc: (items) => ({ state, tr, dispatch }) => {
        if (dispatch) { state.doc.descendants((n, pos) => { if (n.type.name === 'tableOfContents') tr.setNodeMarkup(pos, undefined, { items }); }); tr.setMeta('trackIgnore', true); }
        return true;
      },
    };
  },
});

/* ---------- Note de fin ---------- */
export const Endnote = Node.create({
  name: 'endnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { text: { default: '', parseHTML: (el) => el.getAttribute('data-text') || '', renderHTML: (a) => ({ 'data-text': a.text }) } };
  },
  parseHTML() { return [{ tag: 'sup[data-endnote]', priority: 100 }]; },
  renderHTML({ HTMLAttributes }) { return ['sup', mergeAttributes(HTMLAttributes, { class: 'endnote-ref', 'data-endnote': '' })]; },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('luma-endnotes'),
      props: {
        decorations(state) {
          const notes = [];
          state.doc.descendants((n) => { if (n.type.name === 'endnote') notes.push(n.attrs.text); return true; });
          if (!notes.length) return DecorationSet.empty;
          return DecorationSet.create(state.doc, [Decoration.widget(state.doc.content.size, () => {
            const box = document.createElement('div');
            box.className = 'endnotes';
            box.contentEditable = 'false';
            const title = document.createElement('div');
            title.className = 'endnotes-title';
            title.textContent = 'Notes de fin';
            const ol = document.createElement('ol');
            notes.forEach((t, i) => { const li = document.createElement('li'); li.dataset.i = i; li.textContent = t || '(note vide)'; ol.append(li); });
            box.append(title, ol);
            return box;
          }, { side: 1, key: 'en:' + notes.join('\u0001') })]);
        },
      },
    })];
  },
});

/* ---------- Zone de texte ---------- */
const tbAttr = (name, def, num) => ({ default: def, parseHTML: (el) => { const v = el.getAttribute('data-' + name); return v == null ? def : num ? +v : name === 'accent' ? v === '1' : v; }, renderHTML: (a) => ({ ['data-' + name]: name === 'accent' ? (a[name] ? '1' : '0') : a[name] }) });
export const TextBox = Node.create({
  name: 'textBox',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  addAttributes() {
    return { fill: tbAttr('fill', '#eaf2ff'), border: tbAttr('border', '#0157e0'), width: tbAttr('width', 100, true), align: tbAttr('align', 'center'), accent: tbAttr('accent', false) };
  },
  parseHTML() { return [{ tag: 'div[data-textbox]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs;
    const style = `background:${a.fill};border-color:${a.border};width:${a.width}%;margin-left:${a.align === 'left' ? '0' : 'auto'};margin-right:${a.align === 'right' ? '0' : 'auto'}`;
    return ['div', mergeAttributes(HTMLAttributes, { 'data-textbox': '', class: 'textbox' + (a.accent ? ' accent' : ''), style }), 0];
  },
});

/* ---------- Date et heure (mises à jour à l'ouverture du document) ---------- */
export const DateField = Node.create({
  name: 'dateField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() { return { fmt: { default: 'long', parseHTML: (el) => el.getAttribute('data-fmt') || 'long', renderHTML: (a) => ({ 'data-fmt': a.fmt }) } }; },
  parseHTML() { return [{ tag: 'span[data-datefield]', priority: 100 }]; },
  renderHTML({ node, HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-datefield': '', class: 'datefield', title: 'Date mise à jour automatiquement' }), formatDate(node.attrs.fmt)]; },
});
