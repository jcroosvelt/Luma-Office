// Langues de l'interface : français (par défaut), anglais, espagnol.
// Principe : les textes du code sont en français ; en anglais ou en espagnol, un traducteur d'exécution remplace chaque texte
// connu (dictionnaires src/i18n/en.json et es.json, générés par tools/i18n-*.{py,mjs}) dans le DOM (textes et attributs),
// y compris pour les éléments créés plus tard (messages, fenêtres…). Le contenu des DOCUMENTS n'est JAMAIS traduit.
// Un texte absent du dictionnaire reste en français (aucun mot « cassé »).
import { TEXTS } from '../api/_seo.js';
const LANGS = ['fr', 'en', 'es'];
export const LANG_NAMES = { fr: 'Français', en: 'English', es: 'Español' };
const KEY = 'luma:lang';
let lang = 'fr', dict = null, patterns = [], observer = null, busy = false;

export const getLang = () => lang;
export const isLang = (l) => LANGS.includes(l);

function detect() {
  const m = /^\/(en|es)(\/|$)/.exec(location.pathname);
  if (m) return m[1]; // adresse /en/… ou /es/… : la langue de la page (SEO, liens partagés)
  try { const s = localStorage.getItem(KEY); if (isLang(s)) return s; } catch { /* stockage indisponible */ }
  for (const l of navigator.languages || [navigator.language || 'fr']) { const c = String(l).slice(0, 2).toLowerCase(); if (isLang(c)) return c; }
  return 'fr';
}

// Remplace un texte (espaces de début et de fin conservés) ; les valeurs dynamiques « {} » sont traduites séparément
function translate(str, depth = 0) {
  if (!dict) return str;
  const t = str.trim();
  if (!t || t.length > 400) return str;
  let r = dict[t];
  if (r === undefined) { // « · 3 mots » : ponctuation de tête conservée, le reste est traduit
    const m = /^([·•–—|:()\s]+)(.+)$/s.exec(t);
    if (m && depth < 2) { const v = translate(m[2], depth + 1); if (v !== m[2]) return str.replace(t, () => m[1] + v); }
  }
  if (r === undefined && depth < 2) {
    for (const p of patterns) {
      const m = p.re.exec(t);
      if (m) { let i = 0; r = p.to.replace(/\{\}/g, () => translate(m[++i] ?? '', depth + 1)); break; }
    }
  }
  return r === undefined || r === t ? str : str.replace(t, () => r);
}
export const tr = (s) => translate(String(s));

export const loadDictionary = (d) => build(d); // (tests)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function build(d) {
  dict = {}; patterns = [];
  for (const [k, v] of Object.entries(d)) {
    if (!v) continue;
    if (k.includes('{}')) patterns.push({ re: new RegExp('^' + k.split('{}').map(esc).join('(.*?)') + '$', 's'), to: v, len: k.length });
    else dict[k] = v;
  }
  patterns.sort((a, b) => b.len - a.len); // les modèles les plus précis d'abord
}

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'label'];
const SKIP = 'script,style,textarea,.ProseMirror,.doc-content,.hf-layer,.sh-paper,.paper-body,[data-no-i18n],[contenteditable="true"]';
const skipped = (el) => !!(el.closest && el.closest(SKIP));

function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { const p = root.parentElement; if (p && !skipped(p)) { const v = translate(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; } return; }
  if (root.nodeType !== 1) return;
  if (skipped(root)) return; // contenu du document (éditeur ProseMirror compris) : jamais modifié par le traducteur
  for (const a of ATTRS) { const v = root.getAttribute(a); if (v) { const nv = translate(v); if (nv !== v) root.setAttribute(a, nv); } }
  for (const c of root.childNodes) walk(c);
}

function start() {
  if (observer) return;
  observer = new MutationObserver((records) => {
    if (busy) return;
    busy = true;
    try {
      for (const r of records) {
        if (r.type === 'childList') r.addedNodes.forEach(walk);
        else if (r.type === 'characterData') walk(r.target);
        else if (r.type === 'attributes') walk(r.target);
      }
    } finally { busy = false; observer.takeRecords(); }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// Boîtes de dialogue natives (alert, confirm, prompt) : message traduit
function patchDialogs() {
  for (const n of ['alert', 'confirm', 'prompt']) { const o = window[n]; if (o && !o.__i18n) { const f = function (m, ...a) { return o.call(window, tr(m), ...a); }; f.__i18n = true; window[n] = f; } }
}

/** À appeler avant le premier affichage : choisit la langue, charge le dictionnaire, traduit la page et les ajouts suivants. */
export async function initI18n() {
  lang = detect();
  document.documentElement.lang = lang;
  if (lang === 'fr') return;
  try { build((await import(`./i18n/${lang}.json`)).default); } catch { dict = null; return; }
  // titre de la page d'accueil (non présent dans le code) : textes du système SEO central
  document.title = document.title === TEXTS.fr.home.title ? TEXTS[lang].home.title : translate(document.title);
  patchDialogs();
  walk(document.body);
  start();
}

/** Change la langue : mémorise le choix puis recharge (adresse /, /en/ ou /es/ si on est sur l'accueil). */
export function setLang(l) {
  if (!isLang(l)) return;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  const home = /^\/(en\/|es\/)?$/.test(location.pathname);
  if (home) location.assign((l === 'fr' ? '/' : `/${l}/`) + location.search + location.hash);
  else location.reload();
}

/** Langue de réponse demandée à Judy (instructions envoyées à l'IA) */
export const aiLanguage = () => ({ fr: 'français', en: 'English', es: 'español' }[lang]);
