// Page « Paramètres » : apparence, écriture, valeurs par défaut des nouveaux documents, recherche, stockage, application.
import { h, icon, toast, saveBlob, confirmDialog, applyTheme, dropdown } from './ui.js';
import { pref, storageInfo, fmtBytes, persist } from './storage.js';
import { PAGE_SIZES, MARGIN_PRESETS, DEFAULT_SETTINGS } from './layout.js';
import { shell } from './shell.js';
import { poweredBy, openAbout } from './about.js';
import { canInstall, promptInstall, onInstallAvailable, isApp } from './install.js';
import { allFolders, addFolder, removeFolder, hasDirPicker } from './device-search.js';
import { exportBackup, importBackup, wipeAll } from './backup.js';
import { aiPrefs, MODELS, testConnection } from './ai.js';
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
  const foldersEl = h('div', { class: 'folders' });
  async function renderFolders() {
    const fs = await allFolders();
    foldersEl.replaceChildren(...fs.map((f) => h('span', { class: 'fchip' }, icon('folder', 16), f.name, f.session || f.mem ? h('small', {}, ' (session)') : null, h('button', { class: 'x', 'aria-label': 'Retirer', onclick: async () => { await removeFolder(f); renderFolders(); } }, '×'))),
      h('button', { class: 'btn sm', onclick: async () => { if (await addFolder()) renderFolders(); } }, icon('plus', 16), 'Ajouter un dossier'));
  }
  const store = h('small', {}, 'Calcul…');
  storageInfo().then((s) => { store.textContent = `${s.persisted ? 'Stockage protégé' : 'Stockage standard'} · ${fmtBytes(s.usage)} utilisés${s.quota ? ' sur ' + fmtBytes(s.quota) : ''}`; });
  const restoreIn = h('input', { type: 'file', accept: '.zip', hidden: true, onchange: async () => { const f = restoreIn.files[0]; restoreIn.value = ''; if (!f) return; try { toast('Restauration…', 60000); const n = await importBackup(f); toast(`${n} élément${n > 1 ? 's' : ''} restauré${n > 1 ? 's' : ''} ✓`); } catch (e) { toast(e.message || 'Restauration impossible', 5000); } } });
  const installBtn = h('button', { class: 'btn sm', onclick: async () => { if (canInstall()) await promptInstall(); else toast(matchMedia('(display-mode: standalone)').matches ? 'L’application est déjà installée ✓' : 'Utilisez le menu du navigateur : « Installer l’application » ou « Sur l’écran d’accueil ».', 5000); } }, icon('download', 18), 'Installer');
  onInstallAvailable(() => { installBtn.title = canInstall() ? 'Prêt à installer' : ''; });

  /* ----- Assistant IA ----- */
  const ai0 = aiPrefs.get();
  const keyIn = h('input', { class: 'field', type: 'password', value: ai0.ownKey, placeholder: 'Collez votre clé d’accès', autocomplete: 'off', 'aria-label': 'Clé API de l’assistant', onchange: (e) => { aiPrefs.set({ ownKey: e.target.value.trim() }); toast('Clé enregistrée sur cet appareil'); } });
  const codeIn = h('input', { class: 'field', type: 'password', value: ai0.code, placeholder: 'Code d’accès (facultatif)', autocomplete: 'off', 'aria-label': 'Code d’accès', onchange: (e) => { aiPrefs.set({ code: e.target.value.trim() }); toast('Code enregistré'); } });
  const customIn = h('input', { class: 'field', value: ai0.customModel, placeholder: 'Nom du modèle (avancé)', 'aria-label': 'Nom du modèle', onchange: (e) => aiPrefs.set({ customModel: e.target.value.trim() }) });
  const aiTest = h('p', { class: 'ai-test' }, '');
  const aiTestBtn = h('button', { class: 'btn sm', onclick: async () => { aiTest.className = 'ai-test'; aiTest.textContent = 'Test en cours…'; aiTestBtn.disabled = true; const r = await testConnection(); aiTestBtn.disabled = false; aiTest.className = 'ai-test ' + (r.ok ? 'ok' : 'bad'); aiTest.textContent = r.message; } }, icon('sparkle', 16), 'Tester la connexion');
  const rowKey = row('Ma clé API', keyIn, 'Enregistrée uniquement sur cet appareil. Obtenez-la gratuitement sur aistudio.google.com/apikey');
  const rowCustom = row('Nom du modèle', customIn);
  const rowCode = row('Code d’accès', codeIn, 'Seulement si vous avez défini AI_ACCESS_CODE sur Vercel (sinon laissez vide).');
  const syncAi = () => { const a = aiPrefs.get(); rowKey.hidden = a.mode !== 'own'; rowCode.hidden = a.mode === 'own'; rowCustom.hidden = a.model !== 'custom'; };
  const aiHelp = h('details', { class: 'ai-help' }, h('summary', {}, 'Comment configurer l’assistant ?'),
    h('ol', {}, h('li', {}, 'Ouvrez aistudio.google.com/apikey, connectez-vous avec votre compte Google, puis « Créer une clé API ».'),
      h('li', {}, 'Recommandé : la clé de l’assistant est enregistrée côté serveur (voir le guide d’installation GUIDE-IA.md).'),
      h('li', {}, 'Ici, laissez « Serveur du site » et touchez « Tester la connexion ».'),
      h('li', {}, 'Sans Vercel (test rapide) : choisissez « Ma clé » et collez la clé ci-dessus.')),
    h('small', {}, 'Guide complet : fichier GUIDE-IA.md du dépôt.'));
  setTimeout(syncAi, 0);

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
    group('Assistant IA',
      row('Activer l’assistant', toggle(() => aiPrefs.get().enabled, (v) => aiPrefs.set({ enabled: v })), 'Reformuler, corriger, résumer, traduire, rédiger ; questions sur un PDF. Le texte traité est envoyé à Google.'),
      row('Source de la clé', seg([['server', 'Serveur du site'], ['own', 'Ma clé']], () => aiPrefs.get().mode, (v) => { aiPrefs.set({ mode: v }); syncAi(); }), '« Serveur du site » garde la clé secrète sur Vercel (recommandé).'),
      rowKey, rowCode,
      row('Modèle', select(MODELS, ai0.model, (v) => { aiPrefs.set({ model: v }); syncAi(); }), 'Automatique : choisit tout seul le meilleur modèle disponible.'),
      rowCustom,
      row('Vérification', h('div', { class: 'ai-testwrap' }, aiTestBtn, aiTest)),
      aiHelp),
    group('Recherche sur l’appareil',
      row('Dossiers explorés', foldersEl, hasDirPicker() ? 'Luma Office retient ces dossiers pour retrouver vos fichiers Word, PDF et Excel.' : 'Ce navigateur ne mémorise pas les dossiers : ils sont à resélectionner à chaque visite.')),
    group('Stockage et sauvegarde',
      row('Vos données', store, 'Documents, PDF et classeurs sont gardés sur cet appareil, sans compte.'),
      row('Sauvegarder', h('button', { class: 'btn sm', onclick: async () => { try { toast('Création de la sauvegarde…', 60000); const { blob, count } = await exportBackup(); saveBlob(blob, `Luma-Office-sauvegarde-${new Date().toISOString().slice(0, 10)}.zip`); toast(`Sauvegarde de ${count} élément${count > 1 ? 's' : ''} ✓`); } catch { toast('Sauvegarde impossible'); } } }, icon('download', 18), 'Tout sauvegarder (.zip)'), 'Conservez ce fichier pour changer d’appareil ou par précaution.'),
      row('Restaurer', h('div', {}, h('button', { class: 'btn sm', onclick: () => restoreIn.click() }, icon('upload', 18), 'Restaurer une sauvegarde'), restoreIn)),
      row('Protéger les données', h('button', { class: 'btn sm', onclick: async () => { const ok = await persist(); toast(ok ? 'Stockage protégé ✓' : 'Le navigateur refuse pour l’instant : installez l’application, puis réessayez.', 5000); } }, 'Demander la protection')),
      row('Tout effacer', h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDialog('Supprimer TOUS vos documents, modèles et réglages de cet appareil ? Cette action est définitive.', 'Tout supprimer', true)) { await wipeAll(); toast('Données effacées'); refresh(); } } }, icon('trash', 18), 'Effacer mes données'))),
    group('Application',
      isApp() ? null : row('Installer Luma Office', installBtn, /android/i.test(navigator.userAgent) ? 'Télécharge l’application Android (APK).' : 'Accès depuis l’écran d’accueil, plein écran, hors ligne.'),
      isApp() ? null : row('Invitation d’installation', h('button', { class: 'btn sm', onclick: () => { pref.set('installDismissed', 0); pref.set('installed', false); toast('L’invitation s’affichera à la prochaine visite'); } }, 'Réafficher')),
      row('Version', h('span', { class: 'ver' }, pkg.version)),
      row('À propos', h('button', { class: 'btn sm', onclick: openAbout }, icon('info', 18), 'Ouvrir'))),
  );
  host.replaceChildren(shell('#/parametres', h('div', { class: 'page' }, content, h('div', { class: 'home-foot' }, poweredBy()))));
  renderFolders();
}
