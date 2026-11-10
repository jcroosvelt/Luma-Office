// Formats de page, marges et conversions d'unités.
export const PAGE_SIZES = {
  A4: { w: 21, h: 29.7, label: 'A4 — 21 × 29,7 cm' },
  A5: { w: 14.8, h: 21, label: 'A5 — 14,8 × 21 cm' },
  A3: { w: 29.7, h: 42, label: 'A3 — 29,7 × 42 cm' },
  Letter: { w: 21.59, h: 27.94, label: 'Lettre US — 21,6 × 27,9 cm' },
  Legal: { w: 21.59, h: 35.56, label: 'Légal US — 21,6 × 35,6 cm' },
};

export const MARGIN_PRESETS = {
  normal: { label: 'Normales (2,5 cm)', v: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } },
  narrow: { label: 'Étroites (1,27 cm)', v: { top: 1.27, right: 1.27, bottom: 1.27, left: 1.27 } },
  moderate: { label: 'Modérées (2,54 / 1,91 cm)', v: { top: 2.54, right: 1.91, bottom: 2.54, left: 1.91 } },
  wide: { label: 'Larges (2,54 / 5,08 cm)', v: { top: 2.54, right: 5.08, bottom: 2.54, left: 5.08 } },
};

export const DEFAULT_SETTINGS = {
  size: 'A4',
  orientation: 'portrait',
  margins: { ...MARGIN_PRESETS.normal.v },
  header: '',
  footer: '',
  pageNumbers: true,
  pageNumberAlign: 'center',
  lang: 'fr-FR',
};

export const CM_PX = 96 / 2.54;
export const CM_TWIP = 1440 / 2.54;
export const CM_MM = 10;

export function metrics(s) {
  const base = PAGE_SIZES[s.size] || PAGE_SIZES.A4;
  const land = s.orientation === 'landscape';
  const w = land ? base.h : base.w;
  const h = land ? base.w : base.h;
  const m = s.margins;
  return {
    wcm: w, hcm: h,
    wpx: w * CM_PX, hpx: h * CM_PX,
    contentWpx: (w - m.left - m.right) * CM_PX,
    contentHpx: (h - m.top - m.bottom) * CM_PX,
    mtpx: m.top * CM_PX, mbpx: m.bottom * CM_PX,
  };
}

export function applyPageVars(el, s) {
  const m = metrics(s);
  el.style.setProperty('--page-w', m.wcm + 'cm');
  el.style.setProperty('--page-h', m.hcm + 'cm');
  el.style.setProperty('--mt', s.margins.top + 'cm');
  el.style.setProperty('--mr', s.margins.right + 'cm');
  el.style.setProperty('--mb', s.margins.bottom + 'cm');
  el.style.setProperty('--ml', s.margins.left + 'cm');
  return m;
}

export function mergeSettings(s) {
  return { ...DEFAULT_SETTINGS, ...(s || {}), margins: { ...DEFAULT_SETTINGS.margins, ...(s?.margins || {}) } };
}
