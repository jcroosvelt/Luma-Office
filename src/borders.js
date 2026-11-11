// Bordures de page décoratives : motifs vectoriels répétés autour de la page (cœurs, arbres, étoiles…).
// Chaque motif est dessiné dans une boîte de 24 × 24 ; « main » = couleur choisie par l'utilisateur.
const circle = (cx, cy, r, fill = 'main', extra = {}) => ({ t: 'circle', cx, cy, r, fill, ...extra });
const ell = (cx, cy, rx, ry, fill = 'main', extra = {}) => ({ t: 'ellipse', cx, cy, rx, ry, fill, ...extra });
const path = (d, fill = 'main', extra = {}) => ({ t: 'path', d, fill, ...extra });
const rect = (x, y, w, h, fill, extra = {}) => ({ t: 'rect', x, y, w, h, fill, ...extra });
const TRUNK = '#8d5a2b';
const rays = Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a); return path(`M${(12 + 6.9 * c).toFixed(2)} ${(12 + 6.9 * s).toFixed(2)}L${(12 + 10 * c).toFixed(2)} ${(12 + 10 * s).toFixed(2)}`, 'none', { stroke: 'main', sw: 1.9 }); });

export const MOTIFS = {
  heart: { label: 'Cœurs', word: 'hearts', rot: false, color: '#e0245e', shapes: [path('M12 21.2s-8.3-5.3-8.3-11.3a4.6 4.6 0 0 1 8.3-2.7 4.6 4.6 0 0 1 8.3 2.7c0 6-8.3 11.3-8.3 11.3z'), ell(8.3, 8.6, 1.6, 1.1, '#fff', { op: 0.35, tr: 'rotate(-30 8.3 8.6)' })] },
  tree: { label: 'Arbres', word: 'trees', rot: false, color: '#1a9b4b', shapes: [rect(10.6, 14.5, 2.8, 7.7, TRUNK, { rx: 0.6 }), circle(12, 9.2, 6.9), circle(9.4, 6.9, 2.2, '#fff', { op: 0.22 })] },
  pine: { label: 'Sapins', word: 'christmasTree', rot: false, color: '#14833b', shapes: [rect(10.8, 17, 2.4, 5, TRUNK), path('M12 1.8 17 8.4h-2.6l4.6 6.3h-3.4l3.9 4.9H4.5l3.9-4.9H5l4.6-6.3H7z')] },
  star: { label: 'Étoiles', word: 'stars', rot: false, color: '#fc9a0b', shapes: [path('M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.1 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z')] },
  flower: { label: 'Fleurs', word: 'flowersDaisies', rot: false, color: '#ec6ba6', shapes: [circle(12, 6.6, 3.7), circle(17.1, 10.3, 3.7), circle(15.2, 16.3, 3.7), circle(8.8, 16.3, 3.7), circle(6.9, 10.3, 3.7), circle(12, 12, 2.7, '#ffd23f')] },
  balloon: { label: 'Ballons', word: 'balloons3Colors', rot: false, color: '#d92d20', shapes: [ell(12, 9.5, 6.2, 7.8), path('M12 17.2l-1.7 2.1h3.4z'), path('M12 19.3c-1.6 1.2 1.6 2 0 3.3', 'none', { stroke: '#666', sw: 0.8 }), ell(9.5, 6.4, 1.5, 2.4, '#fff', { op: 0.35 })] },
  leaf: { label: 'Feuilles', word: 'mapleLeaf', rot: false, color: '#2e9e44', shapes: [path('M4.2 19.8C4 9.6 9.4 4 19.8 4.2c.4 10.2-5.2 15.8-15.6 15.6z'), path('M4.2 19.8 15 9', 'none', { stroke: '#fff', sw: 1.1, op: 0.6 })] },
  butterfly: { label: 'Papillons', word: 'creaturesButterfly', rot: false, color: '#7b4de0', shapes: [ell(7, 8.4, 5.2, 5.6, 'main', { tr: 'rotate(-22 7 8.4)' }), ell(17, 8.4, 5.2, 5.6, 'main', { tr: 'rotate(22 17 8.4)' }), ell(8.3, 16, 3.5, 4, 'main', { op: 0.75, tr: 'rotate(20 8.3 16)' }), ell(15.7, 16, 3.5, 4, 'main', { op: 0.75, tr: 'rotate(-20 15.7 16)' }), rect(11.2, 5, 1.6, 15, '#333', { rx: 0.8 }), path('M11.6 5.5 9.4 2.4M12.4 5.5l2.2-3.1', 'none', { stroke: '#333', sw: 0.8 })] },
  sun: { label: 'Soleils', word: 'sun', rot: false, color: '#f5a300', shapes: [...rays, circle(12, 12, 4.9)] },
  moon: { label: 'Lunes', word: 'moons', rot: false, color: '#f2b705', shapes: [path('M20.3 14.8A8.9 8.9 0 1 1 9.4 3.6a7.2 7.2 0 0 0 10.9 11.2z')] },
  note: { label: 'Notes', word: 'musicNotes', rot: false, color: '#1b5fd6', shapes: [path('M8.8 17.6V5.2l10.4-2.2v12.4', 'none', { stroke: 'main', sw: 1.9 }), circle(6.4, 17.8, 2.9), circle(16.8, 15.6, 2.9), path('M8.8 8.4l10.4-2.2', 'none', { stroke: 'main', sw: 1.9 })] },
  snow: { label: 'Flocons', word: 'snowflakes', rot: false, color: '#35a7e8', shapes: [path('M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7', 'none', { stroke: 'main', sw: 1.7 }), path('M9.5 3.8 12 6.2l2.5-2.4M9.5 20.2 12 17.8l2.5 2.4', 'none', { stroke: 'main', sw: 1.2 }), circle(12, 12, 1.7)] },
  gem: { label: 'Diamants', word: 'gems', rot: false, color: '#1ab5c9', shapes: [path('M12 2.4l8.2 9.6L12 21.6 3.8 12z'), path('M3.8 12h16.4M12 2.4 8.6 12 12 21.6 15.4 12z', 'none', { stroke: '#fff', sw: 0.8, op: 0.55 })] },
};

export const WORD_TO_MOTIF = Object.fromEntries(Object.entries(MOTIFS).map(([id, m]) => [m.word, id]));
const fillOf = (f, c) => (f === 'main' ? c : f);

function shapeSvg(sh, c) {
  const fill = fillOf(sh.fill ?? 'main', c);
  const common = `${sh.stroke ? ` stroke="${fillOf(sh.stroke, c)}" stroke-width="${sh.sw || 1}" stroke-linecap="round" stroke-linejoin="round"` : ''}${sh.op != null ? ` opacity="${sh.op}"` : ''}${sh.tr ? ` transform="${sh.tr}"` : ''}`;
  switch (sh.t) {
    case 'path': return `<path d="${sh.d}" fill="${fill}"${common}/>`;
    case 'circle': return `<circle cx="${sh.cx}" cy="${sh.cy}" r="${sh.r}" fill="${fill}"${common}/>`;
    case 'ellipse': return `<ellipse cx="${sh.cx}" cy="${sh.cy}" rx="${sh.rx}" ry="${sh.ry}" fill="${fill}"${common}/>`;
    case 'rect': return `<rect x="${sh.x}" y="${sh.y}" width="${sh.w}" height="${sh.h}"${sh.rx ? ` rx="${sh.rx}"` : ''} fill="${fill}"${common}/>`;
    default: return '';
  }
}
export const motifGroup = (id, color) => (MOTIFS[id] || MOTIFS.heart).shapes.map((s) => shapeSvg(s, color)).join('');
export const motifIcon = (id, color, px = 40) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${px}" height="${px}" aria-hidden="true">${motifGroup(id, color || MOTIFS[id].color)}</svg>`;

// Cadre complet (w × h) : motifs orientés base vers l'extérieur, coins compris, espacement régulier.
export function artBorderSvg(w, h, id, color, size, gapRatio = 0.3) {
  w = Math.max(size * 2, w); h = Math.max(size * 2, h);
  const step = size * (1 + gapRatio);
  const nx = Math.max(1, Math.round((w - size) / step)), ny = Math.max(1, Math.round((h - size) / step));
  const sx = (w - size) / nx, sy = (h - size) / ny, k = size / 24;
  const g = motifGroup(id, color || MOTIFS[id]?.color);
  const fix = MOTIFS[id]?.rot === false; // motifs symétriques : toujours à l'endroit
  const items = [];
  for (let i = 0; i < nx; i++) items.push([i * sx, 0, 180]);
  for (let j = 0; j < ny; j++) items.push([w - size, j * sy, -90]);
  for (let i = nx; i > 0; i--) items.push([i * sx, h - size, 0]);
  for (let j = ny; j > 0; j--) items.push([0, j * sy, 90]);
  const body = items.map(([x, y, r0]) => { const r = fix ? 0 : r0; return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${r} ${(size / 2).toFixed(2)} ${(size / 2).toFixed(2)}) scale(${k.toFixed(4)})">${g}</g>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}" height="${h.toFixed(2)}" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}">${body}</svg>`;
}
export const svgDataUrl = (svg) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
