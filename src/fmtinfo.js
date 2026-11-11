// Description de la mise en forme du texte sous le curseur (police, taille, gras…), comme la barre de Word.
const SIZES = { 1: 20, 2: 15, 3: 13 };
const clean = (f) => (f || '').split(',')[0].replace(/["']/g, '').trim();
const label = (m, h) => h?.type === 'heading' ? `Titre ${h.level}` : m.code ? 'Code' : 'Normal';

export function describeMarks(marks, parent) {
  const by = {};
  for (const m of marks) by[m.type.name] = m.attrs;
  const ts = by.textStyle || {};
  const head = parent?.type?.name === 'heading' ? { type: 'heading', level: parent.attrs.level } : null;
  const size = parseFloat(ts.fontSize) || (head ? SIZES[head.level] : by.code ? 10 : 11);
  const flags = [];
  if (by.bold || head) flags.push('Gras');
  if (by.italic) flags.push('Italique');
  if (by.underline) flags.push('Souligné');
  if (by.strike) flags.push('Barré');
  if (by.superscript) flags.push('Exposant');
  if (by.subscript) flags.push('Indice');
  if (by.highlight) flags.push('Surligné');
  if (by.code) flags.push('Code');
  if (by.insertion) flags.push('Ajout suivi');
  if (by.deletion) flags.push('Suppression suivie');
  return {
    font: clean(ts.fontFamily) || (by.code ? 'Consolas' : 'Calibri'),
    size: Number.isInteger(size) ? String(size) : String(size).replace('.', ','),
    flags,
    bold: !!(by.bold || head), italic: !!by.italic, underline: !!by.underline,
    color: ts.color || null,
    highlight: by.highlight?.color || null,
    link: by.link?.href || null,
    style: label(by, head),
    align: parent?.attrs?.textAlign && parent.attrs.textAlign !== 'left' ? { center: 'Centré', right: 'À droite', justify: 'Justifié' }[parent.attrs.textAlign] : null,
  };
}

// au curseur / sur la sélection
export function describeSelection(state) {
  const { $from, empty, from, to } = state.selection;
  let marks = empty ? ($from.marks().length ? $from.marks() : ($from.nodeAfter?.marks || [])) : null;
  if (!marks) { const n = state.doc.nodeAt(from); marks = n?.marks || $from.marks(); }
  void to;
  return describeMarks(marks, $from.parent);
}

// à une position précise (survol)
export function describeAt(state, pos) {
  const $p = state.doc.resolve(pos);
  const node = $p.nodeAfter?.isText ? $p.nodeAfter : $p.nodeBefore?.isText ? $p.nodeBefore : null;
  return describeMarks(node ? node.marks : $p.marks(), $p.parent);
}
