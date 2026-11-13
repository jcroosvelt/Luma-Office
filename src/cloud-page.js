// Page « Cloud » : offre d'espace cloud, création de compte / connexion, puis gestion de l'espace et des documents.
import { h, icon, toast, confirmDialog, sheet } from './ui.js';
import { shell } from './shell.js';
import { fmtBytes } from './storage.js';
import * as C from './cloud.js';

const fmtDate = (t) => (t ? new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais');
const KIND = { pdf: 'PDF', sheet: 'Excel', template: 'Modèle' };
const MB = 1048576;
const size = (b) => (b >= 1024 * MB ? `${Math.round((b / (1024 * MB)) * 10) / 10} Go` : `${Math.round(b / MB)} Mo`);

export async function showCloud(host, { onOpen, refresh }) {
  const body = h('main', { class: 'home-main cloud-page' });
  host.replaceChildren(shell('#/cloud', h('div', { class: 'page' }, body)));
  let mode = 'signup';

  const hero = () => h('div', { class: 'cl-hero' }, h('span', { class: 'tool-ic big' }, icon('cloud', 28)),
    h('div', {}, h('h2', {}, 'Cloud Luma Office'),
      h('p', { class: 'muted' }, 'Gardez vos documents en sécurité et retrouvez-les sur tous vos appareils : téléphone, tablette, ordinateur.')));

  const usageBar = (label, used, max, fmt) => {
    const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
    return h('div', { class: 'cl-usage' }, h('div', { class: 'row between' }, h('span', {}, label), h('b', {}, `${fmt(used)} / ${fmt(max)}`)), h('div', { class: 'cl-meter' + (pct > 90 ? ' hot' : '') }, h('i', { style: { width: Math.max(2, pct) + '%' } })));
  };

  function planCards(plans, current) {
    return h('div', { class: 'cl-plans' }, ...plans.map((p) => h('div', { class: 'cl-plan' + (p.id === current ? ' on' : '') + (p.available ? '' : ' soon') },
      h('div', { class: 'row between' }, h('b', {}, p.label), p.id === current ? h('span', { class: 'cl-badge' }, 'Votre offre') : !p.available ? h('span', { class: 'cl-badge soon' }, 'Bientôt') : null),
      h('div', { class: 'cl-price' }, p.available ? (p.price ? `${p.price} €/mois` : 'Gratuit') : 'Prochainement'),
      h('ul', {}, h('li', {}, icon('check', 16), `${size(p.bytes)} d’espace`), h('li', {}, icon('check', 16), `${p.docs.toLocaleString('fr-FR')} documents`), h('li', {}, icon('check', 16), 'Synchronisation entre vos appareils'), h('li', {}, icon('check', 16), 'Documents chiffrés'),
        p.id !== 'free' ? h('li', {}, icon('check', 16), 'Assistance prioritaire') : null))));
  }

  /* ----- visiteur : offre + création de compte / connexion ----- */
  async function drawGuest() {
    const info = await C.serverInfo();
    body.replaceChildren(hero());
    if (!info.configured) {
      body.append(h('section', { class: 'cl-card' }, h('b', {}, 'Bientôt disponible'),
        h('p', { class: 'muted' }, 'Le cloud Luma Office ouvrira très prochainement. Vos documents restent en sécurité sur cet appareil en attendant.'),
        planCards(info.plans?.length ? info.plans : [], 'free')));
      return;
    }
    const email = h('input', { class: 'field', type: 'email', placeholder: 'Adresse e-mail', autocomplete: 'email', 'aria-label': 'Adresse e-mail', inputmode: 'email' });
    const name = h('input', { class: 'field', placeholder: 'Votre prénom (facultatif)', autocomplete: 'given-name', 'aria-label': 'Prénom' });
    const pw = h('input', { class: 'field', type: 'password', placeholder: 'Mot de passe (8 caractères minimum)', autocomplete: 'new-password', 'aria-label': 'Mot de passe' });
    const pw2 = h('input', { class: 'field', type: 'password', placeholder: 'Confirmez le mot de passe', autocomplete: 'new-password', 'aria-label': 'Confirmer le mot de passe' });
    const agree = h('input', { type: 'checkbox' });
    const err = h('div', { class: 'ai-err', hidden: true });
    const submit = h('button', { class: 'btn primary', onclick: go }, '');
    const seg = h('div', { class: 'segmented', role: 'tablist' },
      h('button', { class: mode === 'signup' ? 'on' : '', role: 'tab', onclick: () => { mode = 'signup'; drawGuest(); } }, 'Créer un compte'),
      h('button', { class: mode === 'login' ? 'on' : '', role: 'tab', onclick: () => { mode = 'login'; drawGuest(); } }, 'Se connecter'));
    const signup = mode === 'signup';
    if (!signup) { pw.placeholder = 'Mot de passe'; pw.autocomplete = 'current-password'; }
    submit.textContent = signup ? 'Créer mon compte gratuit' : 'Me connecter';
    async function go() {
      err.hidden = true;
      const e = email.value.trim();
      if (!e || !pw.value) { err.textContent = 'Saisissez votre e-mail et votre mot de passe.'; err.hidden = false; return; }
      if (signup) {
        if (pw.value.length < 8) { err.textContent = 'Le mot de passe doit contenir au moins 8 caractères.'; err.hidden = false; return; }
        if (pw.value !== pw2.value) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; err.hidden = false; return; }
        if (!agree.checked) { err.textContent = 'Acceptez le stockage de vos documents dans le cloud pour continuer.'; err.hidden = false; return; }
      }
      submit.disabled = true;
      try {
        if (signup) { await C.account.signup(e, pw.value, name.value); toast('Compte créé. Bienvenue !', 3500); } else { await C.account.login(e, pw.value); toast('Connecté', 2500); }
        await draw();
        runSync('sync');
      } catch (ex) { err.textContent = ex.message; err.hidden = false; submit.disabled = false; }
    }
    [email, pw, pw2].forEach((i) => i.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); }));
    body.append(
      h('section', { class: 'cl-card' }, h('b', {}, 'Choisissez votre offre'), planCards(info.plans, 'free')),
      h('section', { class: 'cl-card' }, seg,
        signup ? h('p', { class: 'muted' }, 'Votre compte est gratuit. Il vous servira aussi pour l’abonnement Premium, quand il sera disponible.') : h('p', { class: 'muted' }, 'Retrouvez vos documents avec votre compte.'),
        email, signup ? name : null, pw, signup ? pw2 : null,
        signup ? h('label', { class: 'chk' }, agree, ' J’accepte que mes documents soient stockés dans le cloud de Luma Office (chiffrés).') : null,
        err, submit),
      h('small', { class: 'muted' }, 'Vos documents sont chiffrés avant d’être enregistrés. Vous pouvez supprimer votre compte et toutes vos données à tout moment.'));
  }

  async function runSync(mode2) {
    const label = h('span', {}, 'Synchronisation…');
    const note = h('div', { class: 'cl-busy' }, icon('cloud', 20), label);
    body.prepend(note);
    try {
      const st = await C.syncAll(mode2, (n, t) => { label.textContent = `Synchronisation… ${n}/${t}`; });
      const parts = [st.up && `${st.up} envoyé${st.up > 1 ? 's' : ''}`, st.down && `${st.down} reçu${st.down > 1 ? 's' : ''}`, st.del && `${st.del} supprimé${st.del > 1 ? 's' : ''}`].filter(Boolean);
      toast(parts.length ? `Synchronisé : ${parts.join(', ')}` : 'Tout est à jour', 3500);
      if (st.quota) toast(st.quota, 6000);
      if (st.skipped.length) toast(`Trop volumineux pour le cloud (3 Mo max) : ${st.skipped.slice(0, 3).join(', ')}${st.skipped.length > 3 ? '…' : ''}`, 6000);
      if (st.errors) toast(`${st.errors} document${st.errors > 1 ? 's' : ''} non synchronisé${st.errors > 1 ? 's' : ''}`, 5000);
    } catch (e) { toast(e.message || 'Synchronisation impossible', 5000); if (e.code === 'expired' || e.code === 'suspended') { draw(); return; } }
    note.remove();
    refresh?.();
    if (C.connected()) draw();
  }

  function passwordSheet() {
    const cur = h('input', { class: 'field', type: 'password', placeholder: 'Mot de passe actuel', autocomplete: 'current-password', 'aria-label': 'Mot de passe actuel' });
    const nw = h('input', { class: 'field', type: 'password', placeholder: 'Nouveau mot de passe (8 caractères minimum)', autocomplete: 'new-password', 'aria-label': 'Nouveau mot de passe' });
    const err = h('div', { class: 'ai-err', hidden: true });
    const s = sheet('Changer le mot de passe', h('div', { class: 'form' }, cur, nw, err, h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: async () => { err.hidden = true; try { await C.account.changePassword(cur.value, nw.value); toast('Mot de passe modifié'); s.close(); } catch (e) { err.textContent = e.message; err.hidden = false; } } }, 'Enregistrer'),
      h('button', { class: 'btn', onclick: () => s.close() }, 'Annuler'))));
  }
  function deleteSheet() {
    const pw = h('input', { class: 'field', type: 'password', placeholder: 'Votre mot de passe', autocomplete: 'current-password', 'aria-label': 'Mot de passe' });
    const err = h('div', { class: 'ai-err', hidden: true });
    const s = sheet('Supprimer mon compte', h('div', { class: 'form' },
      h('p', {}, 'Votre compte et tous vos documents du cloud seront supprimés définitivement. Les documents de cet appareil sont conservés.'), pw, err,
      h('div', { class: 'row' },
        h('button', { class: 'btn danger', onclick: async () => { err.hidden = true; try { await C.account.deleteAccount(pw.value); toast('Compte supprimé'); s.close(); draw(); } catch (e) { err.textContent = e.message; err.hidden = false; } } }, icon('trash', 18), 'Supprimer définitivement'),
        h('button', { class: 'btn', onclick: () => s.close() }, 'Annuler'))));
  }

  /* ----- client connecté ----- */
  async function drawAccount() {
    const c = C.cfg.get();
    let p = c.profile;
    body.replaceChildren(hero());
    const accountCard = h('section', { class: 'cl-card' });
    const list = h('div', { class: 'cl-list' });
    const info = await C.serverInfo();
    const auto = h('input', { type: 'checkbox', checked: !!c.auto, onchange: () => { C.cfg.set({ auto: auto.checked }); C.initCloud(); toast(auto.checked ? 'Synchronisation automatique activée' : 'Synchronisation automatique désactivée'); } });
    const renderAccount = () => {
      accountCard.replaceChildren(...[
        h('div', { class: 'row between' }, h('div', { class: 'cl-who' }, h('b', {}, p?.name || p?.email || c.email), p?.name ? h('small', { class: 'muted' }, p.email) : null), h('span', { class: 'cl-badge' }, p?.planLabel || 'Gratuit')),
        p ? usageBar('Espace utilisé', p.used.bytes, p.quotaBytes, (b) => (b < MB ? `${Math.max(0, Math.round(b / 1024))} Ko` : `${Math.round((b / MB) * 10) / 10} Mo`)) : null,
        p ? usageBar('Documents', p.used.docs, p.quotaDocs, (n) => String(n)) : null,
        p?.planExpired ? h('div', { class: 'ai-err' }, 'Votre abonnement a expiré : votre espace est revenu à l’offre Gratuite.') : null,
        h('small', { class: 'muted' }, `Dernière synchronisation : ${fmtDate(c.last)}`)].filter(Boolean));
    };
    renderAccount();
    body.append(accountCard,
      h('section', { class: 'cl-card' }, h('b', {}, 'Synchronisation'),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', onclick: () => runSync('sync') }, icon('upload', 18), 'Synchroniser maintenant'),
          h('button', { class: 'btn', onclick: () => runSync('up') }, 'Tout envoyer'),
          h('button', { class: 'btn', onclick: async () => { if (await confirmDialog('Récupérer tous les documents du cloud sur cet appareil ? Les versions plus récentes du cloud remplaceront celles de cet appareil.', 'Restaurer')) runSync('down'); } }, icon('download', 18), 'Tout restaurer')),
        h('label', { class: 'chk' }, auto, ' Synchronisation automatique (à l’ouverture et après chaque enregistrement)')),
      h('section', { class: 'cl-card' }, h('b', {}, 'Mes documents dans le cloud'), list),
      h('section', { class: 'cl-card' }, h('b', {}, 'Votre offre'), planCards(info.plans || [], p?.plan || 'free'),
        h('small', { class: 'muted' }, 'L’abonnement Premium sera bientôt disponible : votre compte actuel sera utilisé, rien à refaire.')),
      h('section', { class: 'cl-card' }, h('b', {}, 'Mon compte'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: passwordSheet }, 'Changer le mot de passe'),
          h('button', { class: 'btn', onclick: async () => { if (await confirmDialog('Vous déconnecter du cloud sur cet appareil ? Vos documents restent ici et dans le cloud.', 'Me déconnecter')) { C.account.logout(); draw(); } } }, 'Me déconnecter'),
          h('button', { class: 'btn danger', onclick: deleteSheet }, icon('trash', 18), 'Supprimer mon compte'))));
    try {
      const [prof, docs] = await Promise.all([C.account.me(), C.remoteList()]);
      p = prof; renderAccount();
      list.replaceChildren(...(docs.length ? docs.map((d) => h('div', { class: 'cl-doc' },
        h('div', { class: 'cl-docinfo' }, h('b', {}, (KIND[d.kind] ? `[${KIND[d.kind]}] ` : '') + d.title), h('small', {}, `${fmtDate(d.updated)} · ${fmtBytes(d.size)}`)),
        h('button', { class: 'icon-btn', 'aria-label': 'Ouvrir', title: 'Récupérer et ouvrir', onclick: async () => { try { await C.downloadDoc(d.id); toast('Document récupéré'); onOpen(d.id); } catch (e) { toast(e.message, 4000); } } }, icon('download', 20)),
        h('button', { class: 'icon-btn', 'aria-label': 'Supprimer du cloud', title: 'Supprimer du cloud', onclick: async () => { if (await confirmDialog(`Supprimer « ${d.title} » du cloud ? Le document reste sur cet appareil.`, 'Supprimer', true)) { try { await C.deleteRemote(d.id); toast('Supprimé du cloud'); drawAccount(); } catch (e) { toast(e.message, 4000); } } } }, icon('trash', 20)))) : [h('p', { class: 'muted' }, 'Aucun document dans le cloud pour l’instant. Appuyez sur « Synchroniser maintenant ».')]));
    } catch (e) {
      if (e.code === 'expired' || e.code === 'suspended') { toast(e.message, 4500); if (e.code === 'suspended') C.account.logout(); draw(); return; }
      list.replaceChildren(h('div', { class: 'ai-err' }, h('b', {}, e.message)));
    }
  }

  async function draw() { if (C.connected()) await drawAccount(); else await drawGuest(); }
  draw();
}
