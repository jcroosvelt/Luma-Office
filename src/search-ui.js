// Fenêtre « Rechercher sur l'appareil » : dossiers connectés, recherche par nom et dans le contenu.
import { h, icon, sheet, toast } from './ui.js';
import { addFolder, allFolders, removeFolder, searchDevice, hasDirPicker, ensurePermission } from './device-search.js';
import { snippetEl } from './search.js';
import { extOf } from './file-text.js';

const EXT_BADGE = { pdf: ['PDF', 'k-pdf'], xlsx: ['XLS', 'k-sheet'], xlsm: ['XLS', 'k-sheet'], csv: ['CSV', 'k-sheet'], docx: ['DOC', 'k-doc'], txt: ['TXT', 'k-doc'], md: ['MD', 'k-doc'], html: ['HTML', 'k-doc'], htm: ['HTML', 'k-doc'] };

export function openDeviceSearch({ query = '', onOpen }) {
  let ctrl = null, sh;
  const q = h('input', { class: 'field', type: 'search', value: query, placeholder: 'Nom ou mot du fichier…', enterkeyhint: 'search', 'aria-label': 'Rechercher un fichier' });
  const content = h('input', { type: 'checkbox' });
  const foldersEl = h('div', { class: 'folders' });
  const status = h('p', { class: 'muted sstatus' });
  const results = h('div', { class: 'sres' });
  let running = null;
  const goBtn = h('button', { class: 'btn primary', onclick: () => (running ? running.abort() : run()) }, icon('search', 18), 'Rechercher');

  async function renderFolders() {
    const fs = await allFolders();
    foldersEl.replaceChildren(
      ...fs.map((f) => h('span', { class: 'fchip' }, icon('folder', 16), f.name, f.session || f.mem ? h('small', {}, ' (session)') : null,
        h('button', { class: 'x', 'aria-label': 'Retirer ce dossier', onclick: async () => { await removeFolder(f); renderFolders(); } }, '×'))),
      h('button', { class: 'btn sm', onclick: async () => { const r = await addFolder(); if (r) { renderFolders(); if (q.value.trim()) run(); } else if (!hasDirPicker()) toast('Sélection de dossier annulée'); } }, icon('plus', 16), fs.length ? 'Ajouter un dossier' : 'Choisir un dossier à explorer'));
    return fs;
  }

  async function run() {
    if (ctrl) { ctrl.abort(); running = null; }
    const query2 = q.value.trim();
    results.replaceChildren();
    status.textContent = 'Recherche en cours…';
    if (!query2) { status.textContent = 'Saisissez un nom ou un mot à chercher.'; return; }
    const fs = await allFolders();
    if (!fs.length) { status.textContent = 'Ajoutez d’abord un dossier de votre appareil à explorer.'; return; }
    ctrl = new AbortController();
    const my = ctrl;
    running = my;
    goBtn.replaceChildren(icon('close', 18), 'Arrêter');
    // autorisations demandées pendant le geste de l'utilisateur
    for (const f of fs) await ensurePermission(f);
    let n = 0;
    status.textContent = 'Recherche en cours…';
    await searchDevice(query2, {
      content: content.checked, signal: my.signal,
      onResult: (r) => { n++; results.append(card(r)); },
      onProgress: (p) => { status.textContent = p.done ? (my.signal.aborted ? `Arrêtée — ${n} résultat${n > 1 ? 's' : ''}` : `${n} résultat${n > 1 ? 's' : ''} · ${p.scanned} fichiers parcourus`) : p.denied ? `Accès refusé au dossier « ${p.folder} »` : `${p.scanned} fichiers parcourus · ${n} trouvé${n > 1 ? 's' : ''}…`; },
    });
    if (!n && !my.signal.aborted) status.textContent = content.checked ? 'Aucun fichier trouvé.' : 'Aucun fichier trouvé par son nom. Essayez « chercher aussi dans le contenu ».';
    if (running === my) running = null;
    goBtn.replaceChildren(icon('search', 18), 'Rechercher');
  }

  function card(r) {
    const [label, cls] = EXT_BADGE[extOf(r.name)] || ['FILE', 'k-doc'];
    return h('button', { class: 'sres-item dev', onclick: async () => { try { const f = await r.getFile(); sh.close(); onOpen(f); } catch { toast('Impossible de lire ce fichier'); } } },
      h('span', { class: 'vbadge ' + cls }, label),
      h('span', { class: 'dev-t' }, h('b', {}, r.name), h('small', {}, r.full.replace(/\/[^/]*$/, '')), r.snippet ? snippetEl(h, r.snippet) : null));
  }

  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  sh = sheet('Rechercher sur l’appareil', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'Choisissez un dossier (Documents, Téléchargements…) : Luma Office y cherche vos fichiers Word, PDF et Excel, sans rien envoyer en ligne.'),
    q, h('label', { class: 'check' }, content, 'Chercher aussi dans le contenu des fichiers (plus lent)'),
    foldersEl, h('div', { class: 'row end' }, goBtn), status, results,
    hasDirPicker() ? null : h('p', { class: 'muted small' }, 'Ce navigateur ne mémorise pas les dossiers : il faut les resélectionner à chaque visite.')),
  { wide: true, onClose: () => ctrl?.abort() });
  renderFolders().then((fs) => { if (query && fs.length) run(); });
  setTimeout(() => { if (!query) q.focus(); }, 260);
}
