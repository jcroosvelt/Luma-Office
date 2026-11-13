// Page « Cloud » : activer la sauvegarde chiffrée, synchroniser, restaurer, gérer les documents du cloud.
import { h, icon, toast, confirmDialog, sheet } from './ui.js';
import { shell } from './shell.js';
import { fmtBytes } from './storage.js';
import * as C from './cloud.js';

const fmtDate = (t) => (t ? new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais');
const KIND = { pdf: 'PDF', sheet: 'Excel', template: 'Modèle' };

export async function showCloud(host, { onOpen, refresh }) {
  const body = h('main', { class: 'home-main cloud-page' });
  host.replaceChildren(shell('#/cloud', h('div', { class: 'page' }, body)));
  const rerender = () => draw();

  function intro() {
    return h('div', { class: 'cl-hero' }, h('span', { class: 'tool-ic big' }, icon('cloud', 28)),
      h('div', {}, h('h2', {}, 'Cloud Luma Office'),
        h('p', { class: 'muted' }, 'Sauvegardez vos documents dans le cloud et retrouvez-les sur tous vos appareils. Ils sont chiffrés sur votre appareil avant l’envoi : personne d’autre ne peut les lire.')));
  }

  function showKey(key, firstTime) {
    const s = sheet(firstTime ? 'Votre clé cloud' : 'Clé cloud', h('div', { class: 'form' },
      h('p', {}, 'Cette clé est votre accès à vos documents du cloud. Pour les retrouver sur un autre appareil, choisissez « J’ai déjà une clé » et saisissez-la.'),
      h('div', { class: 'cl-key' }, key),
      h('p', { class: 'muted' }, 'Conservez-la précieusement (capture d’écran, gestionnaire de mots de passe) : elle ne peut pas être récupérée si vous la perdez, et quiconque la possède peut accéder à vos documents.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: async () => { try { await navigator.clipboard.writeText(key); toast('Clé copiée'); } catch { toast('Copie impossible : notez la clé à la main'); } } }, icon('copy', 18), 'Copier la clé'),
        h('button', { class: 'btn', onclick: () => s.close() }, 'Fermer'))));
  }

  async function activate() {
    const ok = await C.serverConfigured();
    if (!ok) { setupHelp(); return; }
    const key = C.newKey();
    C.cfg.set({ key, auto: true, last: 0, deleted: {} });
    C.initCloud();
    showKey(key, true);
    await runSync('sync');
  }
  function setupHelp() {
    const s = sheet('Cloud pas encore activé', h('div', { class: 'form' },
      h('p', {}, 'Le cloud a besoin d’une base de données sur le serveur du site. Elle n’est pas encore reliée.'),
      h('ol', { class: 'ins-steps-ol' },
        h('li', {}, 'Sur vercel.com, ouvrez le projet du site › Storage › Create Database › Neon (offre gratuite).'),
        h('li', {}, 'Connectez-la au projet : la variable DATABASE_URL est ajoutée automatiquement.'),
        h('li', {}, 'Redéployez le site (Deployments › Redeploy), puis revenez ici.')),
      h('small', { class: 'muted' }, 'Détails dans le fichier GUIDE-CLOUD.md du dépôt.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => s.close() }, 'Compris'))));
  }

  async function connectWith(key) {
    key = key.trim();
    if (!C.validKey(key)) { toast('Clé invalide : elle contient 24 à 64 caractères (lettres, chiffres, - et _)', 4500); return; }
    try {
      if (!(await C.serverConfigured())) { setupHelp(); return; }
      await C.checkKey(key);
    } catch (e) { toast(e.message, 5000); return; }
    C.cfg.set({ key, auto: true, last: 0, deleted: {} });
    C.initCloud();
    toast('Connecté au cloud');
    await runSync('sync');
  }

  async function runSync(mode) {
    const label = h('span', {}, 'Synchronisation…');
    const note = h('div', { class: 'cl-busy' }, icon('cloud', 20), label);
    body.prepend(note);
    try {
      const st = await C.syncAll(mode, (n, t) => { label.textContent = `Synchronisation… ${n}/${t}`; });
      const parts = [st.up && `${st.up} envoyé${st.up > 1 ? 's' : ''}`, st.down && `${st.down} reçu${st.down > 1 ? 's' : ''}`, st.del && `${st.del} supprimé${st.del > 1 ? 's' : ''}`].filter(Boolean);
      toast(parts.length ? `Synchronisé : ${parts.join(', ')}` : 'Tout est à jour', 3500);
      if (st.skipped.length) toast(`Trop volumineux pour le cloud (3 Mo max) : ${st.skipped.slice(0, 3).join(', ')}${st.skipped.length > 3 ? '…' : ''}`, 6000);
      if (st.errors) toast(`${st.errors} document${st.errors > 1 ? 's' : ''} n’${st.errors > 1 ? 'ont' : 'a'} pas pu être synchronisé${st.errors > 1 ? 's' : ''}`, 5000);
    } catch (e) { toast(e.message || 'Synchronisation impossible', 5000); }
    refresh?.();
  }

  async function draw() {
    const c = C.cfg.get();
    if (!c.key) {
      const inp = h('input', { class: 'field', placeholder: 'Collez votre clé cloud', 'aria-label': 'Clé cloud', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
      body.replaceChildren(intro(),
        h('section', { class: 'cl-card' }, h('b', {}, 'Première utilisation'),
          h('p', { class: 'muted' }, 'Crée votre espace cloud et envoie vos documents. Gratuit, sans compte ni mot de passe : une clé personnelle vous identifie.'),
          h('button', { class: 'btn primary', onclick: activate }, icon('cloud', 18), 'Activer le cloud')),
        h('section', { class: 'cl-card' }, h('b', {}, 'J’ai déjà une clé'),
          h('p', { class: 'muted' }, 'Retrouvez vos documents sur cet appareil avec la clé créée sur un autre.'),
          inp, h('button', { class: 'btn', onclick: () => connectWith(inp.value) }, 'Se connecter')));
      return;
    }
    const stat = h('small', { class: 'muted' }, 'Chargement…');
    const list = h('div', { class: 'cl-list' });
    const auto = h('input', { type: 'checkbox', checked: !!c.auto, onchange: () => { C.cfg.set({ auto: auto.checked }); C.initCloud(); toast(auto.checked ? 'Synchronisation automatique activée' : 'Synchronisation automatique désactivée'); } });
    body.replaceChildren(intro(),
      h('section', { class: 'cl-card' },
        h('div', { class: 'row between' }, h('b', {}, 'Connecté'), stat),
        h('small', { class: 'muted' }, `Dernière synchronisation : ${fmtDate(c.last)}`),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', onclick: async () => { await runSync('sync'); draw(); } }, icon('upload', 18), 'Synchroniser maintenant'),
          h('button', { class: 'btn', onclick: async () => { await runSync('up'); draw(); } }, 'Tout envoyer'),
          h('button', { class: 'btn', onclick: async () => { if (await confirmDialog('Récupérer tous les documents du cloud sur cet appareil ? Les versions plus récentes du cloud remplaceront celles de cet appareil.', 'Restaurer')) { await runSync('down'); draw(); } } }, icon('download', 18), 'Tout restaurer')),
        h('label', { class: 'chk' }, auto, ' Synchronisation automatique (à l’ouverture et après chaque enregistrement)')),
      h('section', { class: 'cl-card' }, h('b', {}, 'Documents dans le cloud'), list),
      h('section', { class: 'cl-card' }, h('b', {}, 'Compte'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => showKey(c.key, false) }, 'Afficher ma clé'),
          h('button', { class: 'btn', onclick: async () => { if (await confirmDialog('Déconnecter cet appareil du cloud ? Vos documents restent ici et dans le cloud.', 'Déconnecter')) { C.stopCloud(); C.cfg.set({ key: '', auto: false }); draw(); } } }, 'Déconnecter cet appareil'),
          h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog('Supprimer TOUS vos documents du cloud ? Ceux de cet appareil sont conservés. Cette action est définitive.', 'Tout supprimer', true)) { try { await C.wipeRemote(); toast('Cloud vidé'); } catch (e) { toast(e.message, 4000); } draw(); } } }, icon('trash', 18), 'Vider le cloud'))));
    try {
      const [st, docs] = await Promise.all([C.status(), C.remoteList()]);
      stat.textContent = `${st.docs} document${st.docs > 1 ? 's' : ''} · ${fmtBytes(st.bytes)}`;
      list.replaceChildren(...(docs.length ? docs.map((d) => h('div', { class: 'cl-doc' },
        h('div', { class: 'cl-docinfo' }, h('b', {}, (KIND[d.kind] ? `[${KIND[d.kind]}] ` : '') + d.title), h('small', {}, `${fmtDate(d.updated)} · ${fmtBytes(d.size)}`)),
        h('button', { class: 'icon-btn', 'aria-label': 'Ouvrir', title: 'Récupérer et ouvrir', onclick: async () => { try { await C.downloadDoc(d.id); toast('Document récupéré'); onOpen(d.id); } catch (e) { toast(e.message, 4000); } } }, icon('download', 20)),
        h('button', { class: 'icon-btn', 'aria-label': 'Supprimer du cloud', title: 'Supprimer du cloud', onclick: async () => { if (await confirmDialog(`Supprimer « ${d.title} » du cloud ? Le document reste sur cet appareil.`, 'Supprimer', true)) { try { await C.deleteRemote(d.id); toast('Supprimé du cloud'); draw(); } catch (e) { toast(e.message, 4000); } } } }, icon('trash', 20)))) : [h('p', { class: 'muted' }, 'Aucun document dans le cloud pour l’instant. Appuyez sur « Synchroniser maintenant ».')]));
    } catch (e) {
      stat.textContent = '';
      list.replaceChildren(h('div', { class: 'ai-err' }, h('b', {}, e.message), e.code === 'not-configured' ? h('small', {}, 'Ajoutez la base de données (voir GUIDE-CLOUD.md) puis redéployez.') : null));
    }
  }
  draw();
}
