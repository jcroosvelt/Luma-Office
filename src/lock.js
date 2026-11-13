// Verrouillage par mot de passe et permissions (document protégé sur cet appareil).
import { h, icon, sheet, toast, confirmDialog } from './ui.js';

const unlocked = new Set();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function derive(pw, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
export async function makeLock(pw, perms) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iter = 150000;
  return { salt: b64(salt), hash: b64(await derive(pw, salt, iter)), iter, perms };
}
export async function checkPassword(lock, pw) {
  const h2 = await derive(pw, unb64(lock.salt), lock.iter);
  return b64(h2) === lock.hash;
}
export const isUnlocked = (id) => unlocked.has(id);
export const markUnlocked = (id) => unlocked.add(id);
export const permsOf = (rec) => ({ edit: true, copy: true, print: true, export: true, ...(rec.lock?.perms || {}) });

// Écran de saisie du mot de passe ; résout true si déverrouillé, false si retour
export function unlockGate(rec, host) {
  return new Promise((resolve) => {
    const pw = h('input', { class: 'field', type: 'password', placeholder: 'Mot de passe', autocomplete: 'current-password', 'aria-label': 'Mot de passe' });
    const msg = h('p', { class: 'lock-err' }, '');
    const form = h('form', { class: 'lock-card', onsubmit: async (e) => {
      e.preventDefault(); msg.textContent = '';
      if (await checkPassword(rec.lock, pw.value)) { unlocked.add(rec.id); resolve(true); } else { msg.textContent = 'Mot de passe incorrect'; pw.select(); }
    } },
      icon('lock', 44), h('h2', {}, rec.title || 'Document protégé'), h('p', { class: 'muted' }, 'Ce document est protégé par un mot de passe.'),
      pw, msg,
      h('button', { class: 'btn primary', type: 'submit' }, 'Déverrouiller'),
      h('button', { class: 'btn', type: 'button', onclick: () => resolve(false) }, 'Retour'));
    host.replaceChildren(h('div', { class: 'lock-screen' }, form));
    setTimeout(() => pw.focus(), 200);
  });
}

// Feuille de gestion : protéger / modifier les permissions / changer ou retirer le mot de passe
export function openLockSheet(rec, apply, { pdf = false } = {}) {
  const locked = !!rec.lock;
  const pw = h('input', { class: 'field', type: 'password', placeholder: locked ? 'Nouveau mot de passe (laisser vide pour le garder)' : 'Mot de passe', autocomplete: 'new-password', 'aria-label': 'Mot de passe' });
  const pw2 = h('input', { class: 'field', type: 'password', placeholder: 'Confirmer le mot de passe', autocomplete: 'new-password', 'aria-label': 'Confirmer' });
  const cur = permsOf(rec);
  const chk = (label, on) => { const i = h('input', { type: 'checkbox' }); i.checked = on; return [i, h('label', { class: 'chk' }, i, ' ' + label)]; };
  const [cEdit, lEdit] = chk('Autoriser la modification', cur.edit), [cCopy, lCopy] = chk('Autoriser la copie du texte', cur.copy), [cPrint, lPrint] = chk('Autoriser l’impression', cur.print), [cExp, lExp] = chk('Autoriser l’export, le téléchargement et le partage', cur.export);
  let s;
  const save = async () => {
    if (!locked && pw.value.length < 4) { toast('Choisissez un mot de passe d’au moins 4 caractères'); return; }
    if (pw.value && pw.value !== pw2.value) { toast('Les deux mots de passe sont différents'); return; }
    const perms = { edit: cEdit.checked, copy: cCopy.checked, print: cPrint.checked, export: cExp.checked };
    let lock;
    if (pw.value) lock = await makeLock(pw.value, perms); else lock = { ...rec.lock, perms };
    unlocked.add(rec.id); s.close(); await apply({ lock }); toast(locked ? 'Protection mise à jour ✓' : 'Document protégé ✓', 3000);
  };
  const remove = async () => {
    if (!(await confirmDialog('Retirer la protection de ce document ?', 'Retirer', true))) return;
    s.close(); await apply({ lock: null }); toast('Protection retirée');
  };
  s = sheet(locked ? 'Protection du document' : 'Protéger le document', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'Un mot de passe est demandé pour ouvrir le document sur cet appareil, et son contenu n’apparaît plus dans les aperçus ni la recherche. Notez-le : il ne peut pas être retrouvé. (Pour chiffrer le fichier lui-même, exportez un PDF protégé.)'),
    pw, pw2, h('b', {}, 'Permissions'), ...(pdf ? [] : [lEdit]), lCopy, lPrint, lExp,
    h('button', { class: 'btn primary', onclick: save }, locked ? 'Enregistrer' : 'Protéger'),
    locked ? h('button', { class: 'btn danger', onclick: remove }, 'Retirer la protection') : null));
}
