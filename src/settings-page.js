// Page « Paramètres » : apparence, écriture, valeurs par défaut des nouveaux documents, recherche, stockage, application.
import { h, icon, toast, saveBlob, confirmDialog, applyTheme, dropdown } from './ui.js';
import { pref } from './storage.js';
import { PAGE_SIZES, MARGIN_PRESETS, DEFAULT_SETTINGS } from './layout.js';
import { shell } from './shell.js';
import { poweredBy, openAbout } from './about.js';
import { canInstall, promptInstall, onInstallAvailable, isApp } from './install.js';
import pkg from '../package.json';

const seg = (opts, get, set) => {
  const el = h('div', { class: 'segmented', role: 'radiogroup' }, opts.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(get() === v), class: get() === v ? 'on' : '', onclick: () => { set(v); [...el.children].forEach((b, i) => { b.classList.toggle('on', opts[i][0] === v); b.setAttribute('aria-checked', opts[i][0] === v); }); } }, l)));
  return el;
};
const toggle = (get, set) => {
  const b = h('button', { type: 'button', role: 'switch', class: 'switch', 'aria-checked': String(!!get()), onclick: () => { const v = !(b.getAttribute('aria-checked') === 'true'); b.setAttribute('aria-checked', v); set(v); } }, h('i', {}));
  return b;
};
const row = (label, ctrl, hint) => h('div', { class: 'srow' }, h('div', { class: 'srow-t' }, h('b', {}, label), hint ? h('small', {}, hint) : null), h('div', { class: 'srow-c' }, ctrl));
const group = (title, ...rows) => h('section', { class: 'sgroup' }, h('h2', {}, title), h('div', { class: 'scard' }, rows));

export async function showSettings(host, { refresh }) {
  const defaults = () => ({ size: DEFAULT_SETTINGS.size, orientation: 'portrait', margins: { ...DEFAULT_SETTINGS.margins }, lang: DEFAULT_SETTINGS.lang, pageNumbers: true, ...(pref.get('defaults', {}) || {}) });
  const setDef = (patch) => pref.set('defaults', { ...defaults(), ...patch });
  const d = defaults();
  const marginKey = Object.entries(MARGIN_PRESETS).find(([, p]) => JSON.stringify(p.v) === JSON.stringify(d.margins))?.[0] || 'normal';

  const select = (opts, value, onchange) => { let cur = value; return dropdown({ options: opts, get: () => cur, set: (v) => { cur = v; onchange(v); } }).el; };
  const mode = pref.get('mode', 'auto');

  const author = h('input', { class: 'field', value: pref.get('author', ''), placeholder: 'Votre nom', autocomplete: 'name', onchange: (e) => { pref.set('author', e.target.value.trim()); toast('Nom enregistré'); } });
  const installBtn = h('button', { class: 'btn sm', onclick: async () => { if (canInstall()) await promptInstall(); else toast(matchMedia('(display-mode: standalone)').matches ? 'L’application est déjà installée ✓' : 'Utilisez le menu du navigateur : « Installer l’application » ou « Sur l’écran d’accueil ».', 5000); } }, icon('download', 18), 'Installer');
  onInstallAvailable(() => { installBtn.title = canInstall() ? 'Prêt à installer' : ''; });

  const content = h('main', { class: 'home-main' },
    h('h1', { class: 'ptitle' }, 'Paramètres'),
    group('Apparence',
      row('Thème', seg([['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']], () => pref.get('theme', 'auto'), (v) => { pref.set('theme', v); applyTheme(v); }), 'La page du document reste toujours blanche.'),
      row('Affichage de l’éditeur', seg([['auto', 'Auto'], ['page', 'Page'], ['reflow', 'Adapté']], () => (mode === 'page' || mode === 'reflow' ? mode : 'auto'), (v) => pref.set('mode', v)), 'Auto : « Adapté » sur téléphone, « Page » sur tablette.')),
    group('Écriture',
      row('Correcteur orthographique', toggle(() => pref.get('spell', true), (v) => pref.set('spell', v))),
      row('Langue des nouveaux documents', select([['fr-FR', 'Français'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es-ES', 'Español'], ['de-DE', 'Deutsch'], ['it-IT', 'Italiano'], ['pt-PT', 'Português'], ['ar', 'العربية']], d.lang, (v) => setDef({ lang: v }))),
      row('Enregistrement automatique', h('span', { class: 'ver' }, 'Chaque minute'), 'Vos documents sont aussi enregistrés quand vous quittez l’application ; le bouton Enregistrer reste disponible.'),
      row('Nom de l’auteur', author, 'Affiché sur vos commentaires et vos modifications suivies.')),
    group('Nouveaux documents',
      row('Format de page', select(Object.entries(PAGE_SIZES).map(([k, v]) => [k, v.label]), d.size, (v) => setDef({ size: v }))),
      row('Orientation', seg([['portrait', 'Portrait'], ['landscape', 'Paysage']], () => defaults().orientation, (v) => setDef({ orientation: v }))),
      row('Marges', select(Object.entries(MARGIN_PRESETS).map(([k, p]) => [k, p.label]), marginKey, (v) => setDef({ margins: { ...MARGIN_PRESETS[v].v } }))),
      row('Numéroter les pages', toggle(() => defaults().pageNumbers, (v) => setDef({ pageNumbers: v })), 'S’applique aux documents créés ensuite ; certains modèles ont leurs propres réglages.')),
    group('Application',
      isApp() ? null : row('Installer Luma Office', installBtn, /android/i.test(navigator.userAgent) ? 'Télécharge l’application Android (APK).' : 'Accès depuis l’écran d’accueil, plein écran, hors ligne.'),
      isApp() ? null : row('Invitation d’installation', h('button', { class: 'btn sm', onclick: () => { pref.set('installDismissed', 0); pref.set('installed', false); toast('L’invitation s’affichera à la prochaine visite'); } }, 'Réafficher')),
      isApp() ? row('Version de l’application', h('span', { class: 'ver' }, window.__APP_VERSION__ || '—')) : null, // visible seulement dans l'application Android
      row('À propos', h('button', { class: 'btn sm', onclick: openAbout }, icon('info', 18), 'Ouvrir'))),
  );
  host.replaceChildren(shell('#/parametres', h('div', { class: 'page' }, content, h('div', { class: 'home-foot' }, poweredBy()))));
}
