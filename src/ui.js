// Petits utilitaires d'interface : DOM, icônes, feuilles (sheets), toasts.
import { inApp, send, blobToBase64 } from './appbridge.js';
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}

const P = {
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>',
  bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
  italic: '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
  underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/>',
  strike: '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/>',
  sub: '<path d="m4 5 8 8"/><path d="m12 5-8 8"/><path d="M20 21h-4c0-1.5 4-2.5 4-5a2 2 0 0 0-4 0"/>',
  sup: '<path d="m4 11 8 8"/><path d="m12 11-8 8"/><path d="M20 10h-4c0-1.5 4-2.5 4-5a2 2 0 0 0-4 0"/>',
  alignLeft: '<line x1="21" x2="3" y1="6" y2="6"/><line x1="15" x2="3" y1="12" y2="12"/><line x1="17" x2="3" y1="18" y2="18"/>',
  alignCenter: '<line x1="21" x2="3" y1="6" y2="6"/><line x1="17" x2="7" y1="12" y2="12"/><line x1="19" x2="5" y1="18" y2="18"/>',
  alignRight: '<line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="9" y1="12" y2="12"/><line x1="21" x2="7" y1="18" y2="18"/>',
  justify: '<line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/>',
  list: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  listOrdered: '<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  todo: '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 18h8"/>',
  indent: '<polyline points="3 8 7 12 3 16"/><line x1="21" x2="11" y1="12" y2="12"/><line x1="21" x2="11" y1="6" y2="6"/><line x1="21" x2="11" y1="18" y2="18"/>',
  outdent: '<polyline points="7 8 3 12 7 16"/><line x1="21" x2="11" y1="12" y2="12"/><line x1="21" x2="11" y1="6" y2="6"/><line x1="21" x2="11" y1="18" y2="18"/>',
  spacing: '<path d="M11 6h10M11 12h10M11 18h10"/><path d="m3 8 2-3 2 3M3 16l2 3 2-3M5 5v14"/>',
  textColor: '<path d="m6 16 6-12 6 12"/><path d="M8.5 11h7"/>',
  highlight: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  table: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M12 3v18"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  hr: '<line x1="4" x2="20" y1="12" y2="12"/><path d="M8 7l4-3 4 3M8 17l4 3 4-3"/>',
  pageBreak: '<path d="M6 8V3h12v5"/><path d="M6 16v5h12v-5"/><path d="M2 12h3M9 12h6M19 12h3"/>',
  quote: '<path d="M10 11H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2-1 4-4 5"/><path d="M20 11h-4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2-1 4-4 5"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/>',
  word: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><polyline points="14 2 14 8 20 8"/><path d="m8 12 1.5 5 1.5-4 1.5 4 1.5-5"/>',
  pdf: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><polyline points="14 2 14 8 20 8"/><path d="M8 17v-5h1.5a1.5 1.5 0 0 1 0 3H8"/><path d="M13 17v-5h1a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2z"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  zoomIn: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M8 11h6"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  spell: '<path d="m6 16 6-12 6 12"/><path d="M8 12h8"/><path d="m16 20 2 2 4-4"/>',
  stats: '<path d="M3 3v18h18"/><path d="M7 16V9M12 16V5M17 16v-4"/>',
  orient: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 9h6M9 13h6"/>',
  margins: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" stroke-dasharray="2 2"/>',
  header: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>',
  hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  rowAbove: '<rect x="3" y="11" width="18" height="10" rx="1"/><path d="M12 3v5M9.5 5.5h5"/>',
  rowBelow: '<rect x="3" y="3" width="18" height="10" rx="1"/><path d="M12 16v5M9.5 18.5h5"/>',
  colLeft: '<rect x="11" y="3" width="10" height="18" rx="1"/><path d="M3 12h5M5.5 9.5v5"/>',
  colRight: '<rect x="3" y="3" width="10" height="18" rx="1"/><path d="M16 12h5M18.5 9.5v5"/>',
  delRow: '<rect x="3" y="9" width="18" height="6" rx="1"/><path d="m9 3 6 4M15 3 9 7M9 17l6 4M15 17l-6 4" opacity=".0"/><path d="M8 20h8M8 4h8"/>',
  delCol: '<rect x="9" y="3" width="6" height="18" rx="1"/><path d="M4 8v8M20 8v8"/>',
  merge: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v4M12 16v4M8 12h8M10 10l-2 2 2 2M14 10l2 2-2 2"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M8 12H5M19 12h-3"/>',
  headerRow: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18" stroke-width="3"/>',
  fill: '<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/>',
  symbol: '<path d="M5 20h14"/><path d="M8 20c0-3 1-4 1-8a3 3 0 0 1 6 0c0 1.5-.5 2.5-1.5 3.5"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  size: '<path d="m4 20 5-14 5 14"/><path d="M5.8 15h6.4"/><path d="M17 8v6M14 11h6"/>',
  sizeDown: '<path d="m4 20 5-14 5 14"/><path d="M5.8 15h6.4"/><path d="M14 11h6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  edit: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
  commentAdd: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6M9 10h6"/>',
  track: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  accept: '<path d="M20 6 9 17l-5-5"/>',
  reject: '<path d="M18 6 6 18M6 6l12 12"/>',
  acceptAll: '<path d="M18 7 7 18l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  rejectAll: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  toc: '<path d="M4 6h11M4 12h13M4 18h10"/><path d="M19 6h1M20 12h1M18 18h2"/>',
  colw: '<path d="M3 12h18"/><path d="m7 8-4 4 4 4M17 8l4 4-4 4"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  columns: '<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/>',
  colbreak: '<path d="M12 3v5M12 16v5"/><path d="m9 12 3 0"/><rect x="3" y="3" width="6" height="18" rx="1" stroke-dasharray="2 2"/><rect x="15" y="3" width="6" height="18" rx="1"/>',
  watermark: '<path d="M12 2.7c4 4.2 6.5 7.3 6.5 10.3a6.5 6.5 0 0 1-13 0c0-3 2.5-6.1 6.5-10.3z"/>',
  pborder: '<rect x="3" y="3" width="18" height="18" rx="1"/><rect x="7" y="7" width="10" height="10"/>',
  hyphen: '<path d="M4 8h7M4 12h5M4 16h7"/><path d="M14 12h6"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m8 12 2 2M11 9l2 2M14 6l2 2"/>',
  portrait: '<rect x="6" y="3" width="12" height="18" rx="2"/>',
  landscape: '<rect x="3" y="6" width="18" height="12" rx="2"/>',
  firstpage: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 7h8"/><path d="M8 11h5"/><circle cx="16" cy="16" r="2.5"/>',
  pilcrow: '<path d="M13 4v16M17 4v16M19 4h-9.5a4.5 4.5 0 0 0 0 9H13"/>',
  move: '<path d="m5 9-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  shape: '<rect x="3" y="12" width="9" height="9" rx="1"/><circle cx="16.5" cy="7.5" r="4.5"/><path d="M3 9l4.5-7L12 9z"/>',
  textbox: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>',
  endnote: '<path d="M4 6h16M4 11h16M4 16h8"/><path d="M16 15.5l2-1V20"/>',
  dropcap: '<path d="M3 20 8 5l5 15M4.8 15h6.4"/><path d="M16 8h5M16 12h5M16 16h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  blankpage: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><polyline points="14 2 14 8 20 8"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  gotopage: '<path d="M4 12h13"/><path d="m12 6 6 6-6 6"/><path d="M21 4v16"/>',
  words: '<path d="M4 7h16M4 12h10M4 17h13"/>',
  fullimg: '<rect x="3" y="5" width="18" height="14" rx="2"/>',
};

export function icon(name, size = 22) {
  const span = document.createElement('span');
  span.className = 'ic';
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  return span;
}

/* ---------- Feuille modale (bottom sheet sur mobile, dialogue sur tablette) ---------- */
let openSheets = 0;
const sheetStack = [];
addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetStack.length) { e.preventDefault(); sheetStack[sheetStack.length - 1](); } });
export function sheet(title, content, { onClose, wide } = {}) {
  const back = h('div', { class: 'sheet-back' });
  const close = () => {
    const i = sheetStack.indexOf(close); if (i >= 0) sheetStack.splice(i, 1);
    back.classList.remove('in');
    setTimeout(() => back.remove(), 180);
    openSheets--;
    onClose?.();
  };
  const panel = h('div', { class: 'sheet' + (wide ? ' wide' : ''), role: 'dialog', 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('div', { class: 'sheet-grip' }),
      h('h2', {}, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Fermer', onclick: close }, icon('close', 20))),
    h('div', { class: 'sheet-body' }, content));
  back.append(panel);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  openSheets++;
  sheetStack.push(close);
  requestAnimationFrame(() => back.classList.add('in'));
  return { close, el: panel };
}

export function menuList(items, close) {
  return h('div', { class: 'menu-list' }, items.filter(Boolean).map((it) =>
    it.sep ? h('div', { class: 'menu-sep' }, it.sep) :
    h('button', { class: 'menu-item' + (it.danger ? ' danger' : ''), onclick: () => { close?.(); it.run(); } },
      it.icon ? icon(it.icon, 20) : null,
      h('span', { class: 'mi-text' }, h('b', {}, it.label), it.hint ? h('small', {}, it.hint) : null))));
}

let toastEl;
export function toast(msg, ms = 2600) {
  toastEl?.remove();
  toastEl = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(toastEl);
  requestAnimationFrame(() => toastEl.classList.add('in'));
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { toastEl?.classList.remove('in'); const t = toastEl; setTimeout(() => t.remove(), 250); }, ms);
}

export function confirmDialog(message, okLabel = 'Confirmer', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; s.close(); resolve(v); } };
    const s = sheet('Confirmation', h('div', { class: 'form' },
      h('p', {}, message),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', onclick: () => fin(false) }, 'Annuler'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => fin(true) }, okLabel))),
      { onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}

// Boîte de dialogue à plusieurs choix : buttons = [[valeur, libellé, 'primary'|'danger'|'']…] ; renvoie la valeur (ou null si fermée)
export function choiceDialog(title, message, buttons) {
  return new Promise((resolve) => {
    let done = false, s;
    const fin = (v) => { if (!done) { done = true; s.close(); resolve(v); } };
    s = sheet(title, h('div', { class: 'form' }, h('p', {}, message), h('div', { class: 'col-btns' }, buttons.map(([v, l, kind]) => h('button', { class: 'btn ' + (kind || ''), onclick: () => fin(v) }, l)))),
      { onClose: () => { if (!done) { done = true; resolve(null); } } });
  });
}

export function promptDialog(title, label, value = '', okLabel = 'OK') {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { type: 'text', value, class: 'field' });
    const fin = (v) => { if (!done) { done = true; s.close(); resolve(v); } };
    const s = sheet(title, h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); fin(input.value); } },
      h('label', {}, label, input),
      h('div', { class: 'row end' },
        h('button', { type: 'button', class: 'btn', onclick: () => fin(null) }, 'Annuler'),
        h('button', { type: 'submit', class: 'btn primary' }, okLabel))),
      { onClose: () => { if (!done) { done = true; resolve(null); } } });
    setTimeout(() => { input.focus(); input.select(); }, 250);
  });
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

export async function shareBlob(blob, filename, type) {
  if (inApp()) {
    try { if (send('share', { title: filename, filename, mime: type, base64: await blobToBase64(blob) })) return true; } catch { /* repli ci-dessous */ }
  }
  const file = new File([blob], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return true; } catch (e) { if (e.name === 'AbortError') return true; }
  }
  saveBlob(blob, filename);
  return false;
}

export const safeName = (t) => (t || 'Document').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Document';

export function applyTheme(t) {
  const r = document.documentElement;
  if (t === 'light' || t === 'dark') r.dataset.theme = t; else delete r.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#000f3a' : '#001e6c');
}

/* ---------- Menu déroulant sobre (remplace le <select> natif) ---------- */
// options : [valeur, libellé, { style }] ; le menu s'ancre au bouton, s'ouvre vers le haut si besoin
// et ne prend jamais le focus (le clavier du téléphone et la sélection du texte restent en place).
export function dropdown({ options, get, set, title = '', width, cls = '', labelFont = false }) {
  let pop = null, off = null, act = -1;
  const label = h('span', { class: 'dd-label' });
  const btn = h('button', {
    type: 'button', class: 'dd ' + cls, 'aria-haspopup': 'listbox', 'aria-expanded': 'false', title, 'aria-label': title || undefined,
    style: width ? { width: width + 'px' } : null, onmousedown: (e) => e.preventDefault(), onclick: () => (pop ? close() : open()),
  }, label, icon('down', 16));

  function update() {
    const v = String(get() ?? '');
    const o = options.find((x) => String(x[0]) === v);
    label.textContent = o ? o[1] : v;
    label.style.fontFamily = labelFont ? (o?.[2]?.style?.fontFamily || v) : '';
  }
  function close() {
    if (!pop) return;
    pop.remove(); pop = null; act = -1;
    btn.setAttribute('aria-expanded', 'false');
    off?.(); off = null;
  }
  function pick(v) { set(v); update(); close(); }
  function place(first) {
    if (!pop) return;
    const r = btn.getBoundingClientRect(), vw = innerWidth, vh = window.visualViewport?.height || innerHeight;
    if (!first && (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw)) { close(); return; } // le bouton a quitté l'écran
    pop.style.minWidth = Math.max(r.width, 150) + 'px';
    pop.style.maxHeight = ''; pop.style.top = ''; pop.style.bottom = '';
    const below = vh - r.bottom - 10, above = r.top - 10;
    const natural = Math.min(pop.scrollHeight, 380);
    const up = first ? below < Math.min(natural, 260) && above > below : pop.classList.contains('up');
    pop.classList.toggle('up', up);
    pop.style.maxHeight = Math.max(120, Math.min(380, up ? above : below)) + 'px';
    const w = pop.offsetWidth;
    pop.style.left = Math.min(Math.max(8, r.left), Math.max(8, vw - w - 8)) + 'px';
    if (up) pop.style.bottom = vh - r.top + 6 + 'px'; else pop.style.top = r.bottom + 6 + 'px';
    if (first) { const selEl = pop.querySelector('.sel'); if (selEl) pop.scrollTop = selEl.offsetTop - pop.clientHeight / 2 + selEl.offsetHeight / 2; }
  }
  function open() {
    const cur = String(get() ?? '');
    pop = h('div', { class: 'dd-pop', role: 'listbox', 'aria-label': title || undefined });
    options.forEach(([v, l, ex], i) => {
      const sel = String(v) === cur;
      pop.append(h('button', { type: 'button', class: 'dd-item' + (sel ? ' sel' : ''), role: 'option', 'aria-selected': String(sel), 'data-i': i, onmousedown: (e) => e.preventDefault(), onclick: () => pick(v) },
        h('span', { class: 'dd-t', style: ex?.style || null }, l), sel ? icon('check', 16) : null));
      if (sel) act = i;
    });
    document.body.append(pop);
    btn.setAttribute('aria-expanded', 'true');
    place(true);
    // fermeture + clavier (tablettes avec clavier)
    const onDown = (e) => { if (!pop?.contains(e.target) && !btn.contains(e.target)) close(); };
    const onKey = (e) => {
      if (!pop) return;
      const items = [...pop.querySelectorAll('.dd-item')];
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopImmediatePropagation();
        act = Math.max(0, Math.min(items.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1)));
        items.forEach((x, i) => x.classList.toggle('act', i === act));
        items[act]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && act >= 0) { e.preventDefault(); e.stopImmediatePropagation(); pick(options[act][0]); }
    };
    const onScroll = (e) => { if (pop && !pop.contains(e.target)) place(false); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    const onResize = () => place(false);
    window.addEventListener('resize', onResize);
    off = () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onResize); };
  }
  update();
  return { el: btn, refresh: update, close };
}
