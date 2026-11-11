// Formats de page, marges, colonnes et réglages de mise en page (conversions d'unités comprises).
export const PAGE_SIZES = {
  A4: { w: 21, h: 29.7, label: 'A4 — 21 × 29,7 cm' },
  A5: { w: 14.8, h: 21, label: 'A5 — 14,8 × 21 cm' },
  A3: { w: 29.7, h: 42, label: 'A3 — 29,7 × 42 cm' },
  B5: { w: 17.6, h: 25, label: 'B5 — 17,6 × 25 cm' },
  Letter: { w: 21.59, h: 27.94, label: 'Lettre US — 21,6 × 27,9 cm' },
  Legal: { w: 21.59, h: 35.56, label: 'Légal US — 21,6 × 35,6 cm' },
  Executive: { w: 18.41, h: 26.67, label: 'Executive — 18,4 × 26,7 cm' },
  Tabloid: { w: 27.94, h: 43.18, label: 'Tabloïd — 27,9 × 43,2 cm' },
};

export const MARGIN_PRESETS = {
  normal: { label: 'Normales', sub: 'Haut/bas/côtés 2,5 cm', v: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } },
  narrow: { label: 'Étroites', sub: '1,27 cm partout', v: { top: 1.27, right: 1.27, bottom: 1.27, left: 1.27 } },
  moderate: { label: 'Modérées', sub: 'Haut/bas 2,54 · côtés 1,91 cm', v: { top: 2.54, right: 1.91, bottom: 2.54, left: 1.91 } },
  wide: { label: 'Larges', sub: 'Haut/bas 2,54 · côtés 5,08 cm', v: { top: 2.54, right: 5.08, bottom: 2.54, left: 5.08 } },
};

export const NUMBER_FORMATS = { 'page-of': 'Page 1 / 5', of: '1 / 5', plain: '1', dash: '– 1 –', 'page-only': 'Page 1' };
export const pageNumberText = (fmt, i, n) => ({ 'page-of': `Page ${i} / ${n}`, of: `${i} / ${n}`, plain: `${i}`, dash: `– ${i} –`, 'page-only': `Page ${i}` }[fmt] || `Page ${i} / ${n}`);

export const WATERMARK_PRESETS = ['CONFIDENTIEL', 'BROUILLON', 'COPIE', 'URGENT', 'NE PAS DIFFUSER'];
export const BORDER_STYLES = { none: 'Aucune', single: 'Simple', double: 'Double', dashed: 'Pointillée' };

export const DEFAULT_SETTINGS = {
  size: 'A4',
  customW: 21, customH: 29.7,
  orientation: 'portrait',
  margins: { ...MARGIN_PRESETS.normal.v },
  gutter: 0,
  columns: { count: 1, gap: 1.27, rule: false },
  header: '',
  footer: '',
  headerAlign: 'center',
  footerAlign: 'center',
  firstPageDifferent: false,
  pageNumbers: true,
  pageNumberAlign: 'center',
  pageNumberPos: 'bottom',
  pageNumberFormat: 'page-of',
  hyphenate: false,
  watermark: { text: '', color: '#b8bfcc' },
  pageBorder: { style: 'none', color: '#1f3864', width: 1.5, offset: 1 },
  lang: 'fr-FR',
};

export const CM_PX = 96 / 2.54;
export const CM_TWIP = 1440 / 2.54;
export const CM_MM = 10;

export function baseSize(s) {
  if (s.size === 'custom') return { w: Math.max(5, Math.min(100, +s.customW || 21)), h: Math.max(5, Math.min(100, +s.customH || 29.7)) };
  return PAGE_SIZES[s.size] || PAGE_SIZES.A4;
}

export function metrics(s) {
  const base = baseSize(s);
  const land = s.orientation === 'landscape';
  const wcm = land ? base.h : base.w;
  const hcm = land ? base.w : base.h;
  const m = s.margins;
  const left = m.left + (s.gutter || 0);
  return {
    wcm, hcm, wpx: wcm * CM_PX, hpx: hcm * CM_PX,
    contentWpx: Math.max(40, (wcm - left - m.right) * CM_PX),
    contentHpx: Math.max(40, (hcm - m.top - m.bottom) * CM_PX),
    mtpx: m.top * CM_PX, mbpx: m.bottom * CM_PX,
    leftCm: left,
  };
}

// Largeur d'une colonne (cm) pour le nombre de colonnes réglé
export function columnWidthCm(s) {
  const M = metrics(s);
  const n = Math.max(1, s.columns?.count || 1);
  return (M.wcm - M.leftCm - s.margins.right - (n - 1) * (s.columns?.gap ?? 1.27)) / n;
}

export function applyPageVars(el, s) {
  const m = metrics(s);
  el.style.setProperty('--page-w', m.wcm + 'cm');
  el.style.setProperty('--page-h', m.hcm + 'cm');
  el.style.setProperty('--mt', s.margins.top + 'cm');
  el.style.setProperty('--mr', s.margins.right + 'cm');
  el.style.setProperty('--mb', s.margins.bottom + 'cm');
  el.style.setProperty('--ml', m.leftCm + 'cm');
  el.style.setProperty('--cols', Math.max(1, s.columns?.count || 1));
  el.style.setProperty('--col-gap', (s.columns?.gap ?? 1.27) + 'cm');
  el.classList.toggle('cols-rule', !!s.columns?.rule && (s.columns?.count || 1) > 1);
  el.classList.toggle('hyph', !!s.hyphenate);
  return m;
}

export function mergeSettings(s) {
  const d = DEFAULT_SETTINGS;
  const x = s || {};
  return {
    ...d, ...x,
    margins: { ...d.margins, ...(x.margins || {}) },
    columns: { ...d.columns, ...(x.columns || {}) },
    watermark: { ...d.watermark, ...(x.watermark || {}) },
    pageBorder: { ...d.pageBorder, ...(x.pageBorder || {}) },
  };
}
