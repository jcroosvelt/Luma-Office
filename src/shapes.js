// Formes insérables (rectangle, flèches, étoile, bulle…) : dessinées en SVG, insérées comme images redimensionnables.
import { MOTIFS, motifGroup } from './borders.js';

const star = (() => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 20 : 47; pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(52 + r * Math.sin(a)).toFixed(1)}`); } return pts.join(' '); })();
const poly = (pts) => (f, s, w) => `<polygon points="${pts}" ${paint(f, s, w)} stroke-linejoin="round"/>`;
const paint = (f, s, w) => `fill="${f}" stroke="${s}" stroke-width="${w}"`;

export const SHAPES = {
  rect: { label: 'Rectangle', vb: [100, 64], draw: (f, s, w) => `<rect x="5" y="5" width="90" height="54" ${paint(f, s, w)}/>` },
  rounded: { label: 'Rectangle arrondi', vb: [100, 64], draw: (f, s, w) => `<rect x="5" y="5" width="90" height="54" rx="14" ${paint(f, s, w)}/>` },
  ellipse: { label: 'Ellipse', vb: [100, 64], draw: (f, s, w) => `<ellipse cx="50" cy="32" rx="45" ry="27" ${paint(f, s, w)}/>` },
  circle: { label: 'Cercle', vb: [100, 100], draw: (f, s, w) => `<circle cx="50" cy="50" r="45" ${paint(f, s, w)}/>` },
  triangle: { label: 'Triangle', vb: [100, 90], draw: poly('50,6 95,84 5,84') },
  rtriangle: { label: 'Triangle rectangle', vb: [100, 90], draw: poly('6,6 6,84 94,84') },
  diamond: { label: 'Losange', vb: [100, 100], draw: poly('50,4 96,50 50,96 4,50') },
  pentagon: { label: 'Pentagone', vb: [100, 100], draw: poly('50,5 96,38 78,94 22,94 4,38') },
  hexagon: { label: 'Hexagone', vb: [100, 88], draw: poly('26,6 74,6 98,44 74,82 26,82 2,44') },
  star: { label: 'Étoile', vb: [100, 100], draw: poly(star) },
  heart: { label: 'Cœur', vb: [100, 90], draw: (f, s, w) => `<path d="M50 84C14 58 6 40 6 28a22 22 0 0 1 44-8 22 22 0 0 1 44 8c0 12-8 30-44 56z" ${paint(f, s, w)} stroke-linejoin="round"/>` },
  arrow: { label: 'Flèche', vb: [100, 64], draw: poly('4,22 56,22 56,6 96,32 56,58 56,42 4,42') },
  arrow2: { label: 'Double flèche', vb: [100, 64], draw: poly('4,32 28,8 28,22 72,22 72,8 96,32 72,56 72,42 28,42 28,56') },
  chevron: { label: 'Chevron', vb: [100, 80], draw: poly('4,6 62,6 96,40 62,74 4,74 38,40') },
  cross: { label: 'Croix', vb: [100, 100], draw: poly('36,4 64,4 64,36 96,36 96,64 64,64 64,96 36,96 36,64 4,64 4,36 36,36') },
  bubble: { label: 'Bulle', vb: [100, 82], draw: (f, s, w) => `<path d="M14 5h72a9 9 0 0 1 9 9v38a9 9 0 0 1-9 9H46L26 77V61H14a9 9 0 0 1-9-9V14a9 9 0 0 1 9-9z" ${paint(f, s, w)} stroke-linejoin="round"/>` },
  line: { label: 'Ligne', vb: [100, 12], draw: (f, s, w) => `<line x1="4" y1="6" x2="96" y2="6" stroke="${s}" stroke-width="${Math.max(w, 1)}" stroke-linecap="round"/>`, lineOnly: true },
  dashed: { label: 'Ligne pointillée', vb: [100, 12], draw: (f, s, w) => `<line x1="4" y1="6" x2="96" y2="6" stroke="${s}" stroke-width="${Math.max(w, 1)}" stroke-linecap="round" stroke-dasharray="${w * 3} ${w * 2.2}"/>`, lineOnly: true },
};

export const DEFAULT_SHAPE = { type: 'rounded', fill: '#d9e8ff', stroke: '#0157e0', sw: 3, text: '', size: 220 };

// Renvoie { svg, w, h } ; w = largeur d'affichage en px (réglable), h = hauteur proportionnelle
export function buildShape(spec) {
  const s = { ...DEFAULT_SHAPE, ...spec };
  if (s.type.startsWith('motif:')) {
    const id = s.type.slice(6);
    const px = s.size;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${px * 3}" height="${px * 3}">${motifGroup(id, s.fill && s.fill !== 'none' ? s.fill : MOTIFS[id]?.color)}</svg>`, w: px, h: px };
  }
  const def = SHAPES[s.type] || SHAPES.rect;
  const [vw, vh] = def.vb;
  const fill = def.lineOnly ? 'none' : (s.fill || 'none');
  const body = def.draw(fill, s.stroke || '#000000', s.sw ?? 3);
  const lum = (() => { const m = /^#?([0-9a-f]{6})$/i.exec(fill); if (!m) return 255; const n = parseInt(m[1], 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); })();
  const txt = s.text && !def.lineOnly
    ? `<text x="${vw / 2}" y="${vh / 2}" text-anchor="middle" dominant-baseline="central" font-family="Calibri, Carlito, Arial, sans-serif" font-size="${Math.max(7, Math.min(16, 110 / Math.max(6, s.text.length)))}" font-weight="700" fill="${lum < 140 ? '#ffffff' : '#1b2233'}">${s.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
    : '';
  const k = 3;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw * k}" height="${vh * k}">${body}${txt}</svg>`, w: s.size, h: Math.round((s.size * vh) / vw) };
}
export const svgToSrc = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
