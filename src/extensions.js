import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import Image from '@tiptap/extension-image';
import { TableCell } from '@tiptap/extension-table';

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
