// Historique des versions : instantanés enregistrés sur l'appareil, aperçu et restauration.
import { h, icon, sheet, toast, confirmDialog, promptDialog } from './ui.js';
import { putDoc, listVersions, deleteDoc } from './storage.js';
import { generateHTML } from '@tiptap/core';

const MAX = 30, AUTO_EVERY = 10 * 60 * 1000;
const fmt = (t) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export async function captureVersion(rec, json, { label = '', auto = false } = {}) {
  const t = Date.now();
  const v = { id: `${rec.id}:v:${t}`, kind: 'version', parent: rec.id, t, updated: t, title: rec.title, json, settings: rec.settings, words: rec.words || 0, label, auto };
  await putDoc(v);
  const all = await listVersions(rec.id);
  for (const old of all.slice(MAX)) await deleteDoc(old.id);
  return v;
}

// Version automatique si la dernière date de plus de 10 minutes et que le contenu a changé
export async function maybeAutoVersion(rec, json) {
  try {
    const [last] = await listVersions(rec.id);
    const sig = JSON.stringify(json);
    if (last && (Date.now() - last.t < AUTO_EVERY || JSON.stringify(last.json) === sig)) return;
    if (!last && (rec.words || 0) < 3) return;
    await captureVersion(rec, json, { auto: true });
  } catch { /* ignore */ }
}

export async function openVersions({ getRec, getJson, editor, onRestore, onCompare }) {
  let s;
  const list = h('div', { class: 'ver-list' });
  async function render() {
    const vs = await listVersions(getRec().id);
    list.replaceChildren(...(vs.length ? vs.map((v) => h('div', { class: 'ver-row' },
      h('div', { class: 'ver-meta' }, h('b', {}, fmt(v.t)), h('small', {}, `${v.label || (v.auto ? 'Version automatique' : 'Version enregistrée')} · ${v.words || 0} mots`)),
      h('div', { class: 'ver-act' },
        h('button', { class: 'btn sm', onclick: () => preview(v) }, 'Aperçu'),
        h('button', { class: 'btn sm', onclick: () => { s.close(); onCompare?.(v); } }, 'Comparer'),
        h('button', { class: 'btn sm primary', onclick: () => restore(v) }, 'Restaurer'),
        h('button', { class: 'icon-btn', 'aria-label': 'Supprimer cette version', onclick: async () => { await deleteDoc(v.id); render(); } }, icon('trash', 18))))) : [h('p', { class: 'muted' }, 'Aucune version pour l’instant. Une version est enregistrée automatiquement toutes les 10 minutes de travail, ou à la demande.')]));
  }
  function preview(v) {
    let html = '';
    try { html = generateHTML(v.json, editor.extensionManager.extensions); } catch { html = '<p>Aperçu indisponible.</p>'; }
    sheet(`Version du ${fmt(v.t)}`, h('div', { class: 'doc-content ver-prev', html }), { wide: true });
  }
  async function restore(v) {
    if (!(await confirmDialog(`Restaurer la version du ${fmt(v.t)} ? Le document actuel est d’abord sauvegardé comme version.`, 'Restaurer'))) return;
    await captureVersion(getRec(), getJson(), { label: 'Avant restauration' });
    s.close(); onRestore(v);
  }
  const saveNow = async () => {
    const label = await promptDialog('Enregistrer une version', 'Nom de la version (facultatif)', '', 'Enregistrer');
    if (label == null) return;
    await captureVersion(getRec(), getJson(), { label: label.trim() }); toast('Version enregistrée ✓'); render();
  };
  s = sheet('Historique des versions', h('div', { class: 'form' }, h('button', { class: 'btn primary', onclick: saveNow }, icon('history', 18), 'Enregistrer une version maintenant'), list), { wide: true });
  render();
}
