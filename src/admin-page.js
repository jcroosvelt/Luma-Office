// Tableau de bord administrateur (#/admin) : vue d'ensemble, cloud, assistant IA, application Android, journal, santé du site.
// Les données viennent de /api/admin (protégé par ADMIN_CODE) ; rien n'est lisible sans connexion.
import { h, icon, toast, confirmDialog, sheet } from './ui.js';
import { fmtBytes } from './storage.js';

const API = () => new URL('api/admin', document.baseURI).href;
const SS = 'luma:admin';
const token = { get: () => { try { return sessionStorage.getItem(SS) || ''; } catch { return ''; } }, set: (v) => { try { v ? sessionStorage.setItem(SS, v) : sessionStorage.removeItem(SS); } catch { /* ignore */ } } };

class AdminError extends Error { constructor(m, code) { super(m); this.code = code; } }
async function call(action, payload = {}) {
  let res;
  try { res = await fetch(API(), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token.get() }, body: JSON.stringify({ action, ...payload }) }); }
  catch { throw new AdminError('Impossible de joindre le serveur.', 'network'); }
  let body = null; try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new AdminError(body?.error?.message || (res.status === 404 ? 'Fonction serveur introuvable (disponible seulement sur le site déployé).' : `Erreur ${res.status}`), body?.error?.code || 'http');
  return body;
}

const fmtDate = (t) => (t ? new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const nf = (n) => Number(n || 0).toLocaleString('fr-FR');
const ago = (t) => { if (!t) return '—'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };

/* ---------- graphiques SVG légers ---------- */
function barChart(series, keys, colors, labels) {
  const W = 340, H = 130, pad = 22, n = series.length;
  const max = Math.max(1, ...series.map((s) => keys.reduce((a, k) => a + (s[k] || 0), 0)));
  const bw = (W - pad) / n;
  const bars = series.map((s, i) => {
    let y = H - 18, out = '';
    keys.forEach((k, j) => { const hh = ((s[k] || 0) / max) * (H - 36); y -= hh; if (hh > 0) out += `<rect x="${pad + i * bw + 2}" y="${y}" width="${Math.max(2, bw - 4)}" height="${hh}" rx="2" fill="${colors[j]}"><title>${fmtDay(s.day)} — ${labels[j]} : ${s[k] || 0}</title></rect>`; });
    return out;
  }).join('');
  const ticks = series.map((s, i) => (i % 3 === 0 ? `<text x="${pad + i * bw + bw / 2}" y="${H - 4}" text-anchor="middle" font-size="9" fill="currentColor" opacity=".6">${fmtDay(s.day).replace(' ', ' ')}</text>` : '')).join('');
  const axis = `<text x="0" y="12" font-size="9" fill="currentColor" opacity=".6">${max}</text><line x1="${pad}" x2="${W}" y1="${H - 18}" y2="${H - 18}" stroke="currentColor" opacity=".2"/>`;
  const el = h('div', { class: 'ad-chart', html: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${labels.join(', ')}">${axis}${bars}${ticks}</svg>` });
  return el;
}
const legend = (items) => h('div', { class: 'ad-legend' }, ...items.map(([c, l]) => h('span', {}, h('i', { style: { background: c } }), l)));

/* ---------- briques ---------- */
const kpi = (label, value, sub, tone) => h('div', { class: 'ad-kpi' + (tone ? ' ' + tone : '') }, h('small', {}, label), h('b', {}, value), sub ? h('em', {}, sub) : null);
const card = (title, ...body) => h('section', { class: 'ad-card' }, title ? h('h3', {}, title) : null, ...body);
const note = (msg, cls = '') => h('div', { class: 'ad-note ' + cls }, msg);
const row = (...cells) => h('div', { class: 'ad-row' }, ...cells.map((c) => (c && c.nodeType ? c : h('span', {}, c == null ? '' : String(c)))));

export async function showAdmin(host) {
  document.title = 'Administration — Luma Office';
  if (!document.querySelector('meta[name=robots]')) document.head.append(h('meta', { name: 'robots', content: 'noindex, nofollow' }));
  const body = h('main', { class: 'ad-main' });
  const tabsEl = h('nav', { class: 'ad-tabs', role: 'tablist' });
  const head = h('header', { class: 'ad-head' },
    h('img', { src: './icons/icon-192.png', alt: '', class: 'ad-logo' }),
    h('div', { class: 'ad-title' }, h('b', {}, 'Administration'), h('small', {}, 'Luma Office')),
    h('div', { class: 'grow' }),
    h('button', { class: 'btn sm', onclick: () => { location.assign(new URL('./', document.baseURI).href); } }, icon('file', 16), 'Retour au site'),
    h('button', { class: 'btn sm', id: 'ad-out', hidden: true, onclick: () => { token.set(''); start(); } }, 'Déconnexion'));
  host.replaceChildren(h('div', { class: 'ad-page' }, head, tabsEl, body));
  const logout = head.querySelector('#ad-out');

  const TABS = [['overview', 'Vue d’ensemble'], ['users', 'Comptes'], ['ai', 'Assistant IA'], ['app', 'Application'], ['events', 'Journal'], ['health', 'Santé']];
  let current = 'overview';
  const VIEWS = { overview: viewOverview, users: viewUsers, ai: viewAi, app: viewApp, events: viewEvents, health: viewHealth };

  function drawTabs() {
    tabsEl.replaceChildren(...TABS.map(([id, l]) => h('button', { role: 'tab', class: 'ad-tab' + (id === current ? ' on' : ''), 'aria-selected': id === current, onclick: () => { current = id; drawTabs(); render(); } }, l)));
  }
  async function render() {
    body.replaceChildren(h('div', { class: 'ad-loading' }, 'Chargement…'));
    try { await VIEWS[current](); }
    catch (e) {
      if (e.code === 'expired') { token.set(''); toast('Session expirée : reconnectez-vous', 3500); start(); return; }
      body.replaceChildren(card('', h('div', { class: 'ai-err' }, h('b', {}, e.message), e.code === 'no-db' ? h('small', {}, 'Reliez la base Neon à Vercel (variable DATABASE_URL) : voir GUIDE-CLOUD.md.') : null), h('button', { class: 'btn', onclick: render }, 'Réessayer')));
    }
  }

  /* ----- connexion ----- */
  async function start() {
    tabsEl.replaceChildren(); logout.hidden = true;
    let st = null;
    try { const r = await fetch(API()); if (r.ok && /json/.test(r.headers.get('content-type') || '')) st = await r.json(); } catch { /* ignore */ }
    if (!st) { body.replaceChildren(card('Administration indisponible', note('La fonction serveur /api/admin est introuvable : l’administration fonctionne uniquement sur le site déployé sur Vercel.'))); return; }
    if (!st.enabled) {
      body.replaceChildren(card('Activer l’administration',
        h('p', {}, 'Définissez un code secret pour protéger cet espace :'),
        h('ol', { class: 'ins-steps-ol' },
          h('li', {}, 'Vercel › votre projet › Settings › Environment Variables.'),
          h('li', {}, 'Ajoutez ADMIN_CODE avec un code long et secret (8 caractères minimum).'),
          h('li', {}, 'Redéployez le site, puis revenez ici.')),
        h('small', { class: 'muted' }, 'Détails : GUIDE-ADMIN.md.')));
      return;
    }
    if (token.get()) { logout.hidden = false; drawTabs(); render(); return; }
    const inp = h('input', { class: 'field', type: 'password', placeholder: 'Code administrateur', 'aria-label': 'Code administrateur', autocomplete: 'current-password' });
    const go = async () => {
      if (!inp.value) return;
      btn.disabled = true;
      try { const r = await fetch(API(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', code: inp.value }) }); const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error?.message || 'Connexion impossible'); token.set(b.token); start(); }
      catch (e) { toast(e.message, 4000); btn.disabled = false; inp.select(); }
    };
    const btn = h('button', { class: 'btn primary', onclick: go }, icon('lock', 18), 'Se connecter');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    body.replaceChildren(h('div', { class: 'ad-login' }, card('Connexion administrateur', h('p', { class: 'muted' }, 'Espace réservé à l’administrateur du site.'), inp, btn)));
    setTimeout(() => inp.focus(), 200);
  }

  /* ----- vue d'ensemble ----- */
  async function viewOverview() {
    const o = await call('overview');
    const k = o.kpi;
    if (!o.db) { body.replaceChildren(card('Statistiques indisponibles', note('Aucune base de données n’est reliée : les statistiques, le cloud et le journal ont besoin de la variable DATABASE_URL (GUIDE-CLOUD.md). Les autres onglets restent utilisables.', 'warn'))); return; }
    const aiTotal = k.aiOk7d + k.aiErr7d, errRate = aiTotal ? Math.round((k.aiErr7d / aiTotal) * 100) : 0;
    const plat = Object.entries(o.platforms).sort((a, b) => b[1] - a[1]);
    const platTotal = plat.reduce((a, [, n]) => a + n, 0) || 1;
    const PL = { web: 'Ordinateur / web', 'android-web': 'Android (navigateur)', app: 'Application Android', ios: 'iPhone / iPad', inconnu: 'Inconnu' };
    body.replaceChildren(
      h('div', { class: 'ad-kpis' },
        kpi('Visites (7 j)', nf(k.visits7d), `${nf(k.visits24h)} sur 24 h · ${nf(k.visits30d)} sur 30 j`),
        kpi('Ouvertures de l’app Android (7 j)', nf(k.appOpens7d), `${nf(k.appOpens30d)} sur 30 j`),
        kpi('Téléchargements de l’APK (7 j)', nf(k.apkDownloads7d), `${nf(k.apkDownloads30d)} sur 30 j · ${nf(k.installOpens7d)} fenêtres « Installer » ouvertes (7 j)`),
        kpi('Comptes clients', nf(k.users), `${nf(k.users7d)} nouveau${k.users7d > 1 ? 'x' : ''} (7 j) · ${nf(k.paidUsers)} payant${k.paidUsers > 1 ? 's' : ''} · ${nf(k.activeUsers7d)} actif${k.activeUsers7d > 1 ? 's' : ''} (7 j)`),
        kpi('Cloud', fmtBytes(k.cloudBytes), `${nf(k.cloudDocs)} documents`),
        kpi('Requêtes IA (7 j)', nf(aiTotal), `${errRate} % d’erreurs · ${o.ai.avgMs ? (o.ai.avgMs / 1000).toFixed(1) + ' s en moyenne' : 'pas de mesure'}`, errRate > 20 ? 'bad' : ''),
        kpi('Envois cloud (7 j)', nf(k.cloudPuts7d), k.cloudErr7d ? `${nf(k.cloudErr7d)} erreurs` : 'aucune erreur', k.cloudErr7d ? 'bad' : '')),
      h('div', { class: 'ad-grid' },
        card('Visites — 14 jours', barChart(o.series, ['visit'], ['#2563eb'], ['Visites']), legend([['#2563eb', 'Visites']])),
        card('Assistant IA — 14 jours', barChart(o.series, ['ai', 'ai_error'], ['#16a34a', '#dc2626'], ['Réussies', 'Erreurs']), legend([['#16a34a', 'Réussies'], ['#dc2626', 'Erreurs']])),
        card('Comptes, cloud et application — 14 jours', barChart(o.series, ['signup', 'cloud_put', 'apk_download', 'app_open'], ['#16a34a', '#7c3aed', '#f59e0b', '#0891b2'], ['Nouveaux comptes', 'Envois cloud', 'APK téléchargés', 'Ouvertures app']), legend([['#16a34a', 'Nouveaux comptes'], ['#7c3aed', 'Envois cloud'], ['#f59e0b', 'APK téléchargés'], ['#0891b2', 'Ouvertures app']])),
        card('Plateformes (visites, 30 j)', ...(plat.length ? plat.map(([p, n]) => h('div', { class: 'ad-bar' }, h('span', {}, PL[p] || p), h('div', {}, h('i', { style: { width: Math.max(3, Math.round((n / platTotal) * 100)) + '%' } })), h('b', {}, nf(n)))) : [note('Pas encore de données.')]))),
      note('Statistiques anonymes : aucune adresse IP, aucun identifiant ni contenu de document n’est enregistré. Les données de plus de 90 jours sont supprimées automatiquement.'));
  }

  /* ----- comptes clients ----- */
  let userFilter = '';
  async function viewUsers() {
    const { users, plans } = await call('users_list');
    const q = userFilter.trim().toLowerCase();
    const shown = users.filter((u) => !q || u.email.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q));
    const paid = users.filter((u) => u.plan !== 'free').length, susp = users.filter((u) => u.status !== 'active').length;
    const totalBytes = users.reduce((a, u) => a + u.bytes, 0), totalDocs = users.reduce((a, u) => a + u.docs, 0);
    const search = h('input', { class: 'field', type: 'search', placeholder: 'Rechercher un e-mail ou un nom', value: userFilter, 'aria-label': 'Rechercher', oninput: () => { userFilter = search.value; clearTimeout(viewUsers.t); viewUsers.t = setTimeout(render, 350); } });
    const days = h('input', { class: 'field', type: 'number', min: 30, max: 3650, value: 365, 'aria-label': 'Jours', style: { width: '90px' } });
    body.replaceChildren(
      h('div', { class: 'ad-kpis' }, kpi('Comptes', nf(users.length), `${nf(paid)} payant${paid > 1 ? 's' : ''} · ${nf(susp)} suspendu${susp > 1 ? 's' : ''}`), kpi('Documents dans le cloud', nf(totalDocs)), kpi('Stockage utilisé', fmtBytes(totalBytes), 'chiffré au repos')),
      card(`Comptes clients (${shown.length})`, search,
        shown.length ? h('div', { class: 'ad-table users' },
          row(h('b', {}, 'Compte'), h('b', {}, 'Offre'), h('b', {}, 'Espace'), h('b', {}, 'Dernière connexion'), h('b', {}, '')),
          ...shown.map((u) => row(
            h('span', { class: 'ad-user' }, h('b', {}, u.email), u.name ? h('small', {}, u.name) : null, u.status !== 'active' ? h('small', { class: 'ad-susp' }, 'suspendu') : null),
            h('span', { class: 'cl-badge' + (u.plan === 'free' ? '' : ' paid') }, (plans.find((p) => p.id === u.plan) || {}).label || u.plan),
            `${nf(u.docs)} doc · ${fmtBytes(u.bytes)} / ${Math.round(u.quotaBytes / 1048576)} Mo`,
            u.lastLogin ? `${fmtDate(u.lastLogin)} (${ago(u.lastLogin)})` : 'jamais',
            h('button', { class: 'btn sm', onclick: () => editUser(u, plans) }, 'Gérer'))))
          : note(users.length ? 'Aucun compte ne correspond.' : 'Aucun compte client pour l’instant.')),
      card('Nettoyage', h('div', { class: 'row' }, h('span', {}, 'Supprimer les comptes gratuits sans connexion depuis'), days, h('span', {}, 'jours'),
        h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog(`Supprimer les comptes gratuits inactifs depuis ${days.value} jours, avec leurs documents ?`, 'Purger', true)) { try { const r = await call('users_purge_inactive', { days: +days.value }); toast(`${r.n} compte(s) supprimé(s)`); render(); } catch (e) { toast(e.message, 4000); } } } }, 'Purger'))));
  }
  function editUser(u, plans) {
    const plan = h('select', { class: 'field', 'aria-label': 'Offre' }, ...plans.map((p) => h('option', { value: p.id, selected: p.id === u.plan }, `${p.label} (${Math.round(p.bytes / 1048576)} Mo, ${p.docs} docs)`)));
    const until = h('input', { class: 'field', type: 'date', value: u.planUntil ? new Date(u.planUntil).toISOString().slice(0, 10) : '', 'aria-label': 'Fin de l’abonnement' });
    const qmb = h('input', { class: 'field', type: 'number', min: 1, value: Math.round(u.quotaBytes / 1048576), 'aria-label': 'Espace en Mo' });
    const qd = h('input', { class: 'field', type: 'number', min: 1, value: u.quotaDocs, 'aria-label': 'Nombre de documents' });
    const lab = (t, el) => h('label', { class: 'it-opt' }, h('span', {}, t), el);
    const save = async (extra = {}) => { try { await call('user_set', { id: u.id, plan: plan.value, planUntil: until.value ? new Date(until.value + 'T23:59:59').getTime() : null, quotaMb: qmb.value, quotaDocs: qd.value, ...extra }); toast('Compte mis à jour'); sh.close(); render(); } catch (e) { toast(e.message, 4000); } };
    const box = h('div', { class: 'form' },
      h('div', {}, h('b', {}, u.email), h('small', { class: 'muted' }, ` · créé ${fmtDate(u.created)} · ${nf(u.docs)} doc · ${fmtBytes(u.bytes)}`)),
      lab('Offre', plan), lab('Fin de l’abonnement (vide = sans limite)', until), h('div', { class: 'ad-two' }, lab('Espace (Mo)', qmb), lab('Documents max', qd)),
      h('small', { class: 'muted' }, 'Changer l’offre applique ses quotas ; vous pouvez ensuite les ajuster.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => save() }, 'Enregistrer'),
        h('button', { class: 'btn', onclick: () => save({ status: u.status === 'active' ? 'suspended' : 'active' }) }, u.status === 'active' ? 'Suspendre le compte' : 'Réactiver le compte')),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: async () => { if (await confirmDialog(`Réinitialiser le mot de passe de ${u.email} ? Il sera déconnecté de tous ses appareils.`, 'Réinitialiser')) { try { const r = await call('user_reset_password', { id: u.id }); sh.close(); const s2 = sheet('Mot de passe temporaire', h('div', { class: 'form' }, h('p', {}, `Transmettez ce mot de passe à ${r.email} ; il pourra le changer dans l’application.`), h('div', { class: 'cl-key' }, r.password), h('small', { class: 'muted' }, 'Il ne sera plus affiché.'), h('button', { class: 'btn primary', onclick: () => s2.close() }, 'Fermer'))); } catch (e) { toast(e.message, 4000); } } } }, icon('lock', 16), 'Mot de passe oublié : réinitialiser'),
        h('button', { class: 'btn', onclick: () => { sh.close(); userDocs(u); } }, 'Documents'),
        h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog(`Supprimer le compte ${u.email} et ses ${u.docs} document(s) ? Cette action est définitive.`, 'Supprimer', true)) { try { await call('user_delete', { id: u.id }); toast('Compte supprimé'); sh.close(); render(); } catch (e) { toast(e.message, 4000); } } } }, icon('trash', 16), 'Supprimer')));
    const sh = sheet('Gérer le compte', box, { wide: true });
  }
  async function userDocs(u) {
    const { docs } = await call('user_docs', { id: u.id });
    const sh = sheet(`Documents de ${u.email}`, h('div', { class: 'form' },
      h('small', { class: 'muted' }, 'Le contenu et les titres restent chiffrés : seuls l’identifiant, la taille et les dates sont visibles.'),
      ...(docs.length ? docs.map((d) => row(h('code', {}, d.id.slice(0, 12)), fmtBytes(d.size), fmtDate(d.updated),
        h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDialog('Supprimer ce document du cloud ?', 'Supprimer', true)) { try { await call('user_doc_delete', { id: u.id, doc: d.id }); toast('Supprimé'); sh.close(); render(); } catch (e) { toast(e.message, 4000); } } } }, icon('trash', 14)))) : [note('Aucun document.')])), { wide: true });
  }

  /* ----- assistant IA ----- */
  async function viewAi() {
    const [o, hl] = await Promise.all([call('overview'), call('health')]);
    const out = h('div', { class: 'ad-testout' });
    const models = Object.entries(o.ai.models || {}).sort((a, b) => b[1] - a[1]);
    const st = Object.entries(o.ai.statuses || {});
    const key = hl.checks.find((c) => c.key === 'GEMINI_API_KEY');
    body.replaceChildren(
      h('div', { class: 'ad-kpis' },
        kpi('Clé de l’assistant', key?.ok ? 'Configurée' : 'Manquante', key?.ok ? 'GEMINI_API_KEY définie' : 'voir GUIDE-IA.md', key?.ok ? 'ok' : 'bad'),
        kpi('Requêtes (7 j)', nf(o.ai.total || 0)), kpi('Latence moyenne', o.ai.avgMs ? (o.ai.avgMs / 1000).toFixed(1) + ' s' : '—'),
        kpi('Erreurs (7 j)', nf((o.kpi || {}).aiErr7d || 0), st.length ? st.map(([c, n]) => `${c}: ${n}`).join(' · ') : 'aucune', (o.kpi || {}).aiErr7d ? 'bad' : '')),
      card('Tester l’assistant', h('p', { class: 'muted' }, 'Envoie une vraie requête minimale au service d’IA et indique le modèle utilisé et le temps de réponse.'),
        h('button', { class: 'btn primary', onclick: async (e) => { const b = e.currentTarget; b.disabled = true; out.replaceChildren(note('Test en cours…')); try { const r = await call('ai_test'); out.replaceChildren(note(r.ok ? `Réponse « ${r.text} » en ${(r.ms / 1000).toFixed(1)} s — modèle ${r.model || 'inconnu'}` : `Échec${r.status ? ' (' + r.status + ')' : ''} : ${r.message}`, r.ok ? 'ok' : 'bad')); } catch (er) { out.replaceChildren(note(er.message, 'bad')); } b.disabled = false; } }, icon('sparkle', 18), 'Lancer le test'), out),
      card('Modèles utilisés (7 j)', ...(models.length ? models.map(([m, n]) => h('div', { class: 'ad-bar' }, h('span', {}, m), h('div', {}, h('i', { style: { width: Math.max(3, Math.round((n / models[0][1]) * 100)) + '%' } })), h('b', {}, nf(n)))) : [note('Aucune requête enregistrée.')])),
      note('Le modèle est choisi automatiquement (le plus récent disponible avec votre clé) et bascule seul sur un autre en cas de surcharge.'));
  }

  /* ----- application Android ----- */
  async function viewApp() {
    const [info, o] = await Promise.all([call('apk_info'), call('overview')]);
    const k = o.kpi || {}, v = Object.entries(o.appVersions || {}).sort((a, b) => b[1] - a[1]);
    body.replaceChildren(
      h('div', { class: 'ad-kpis' },
        kpi('Fichier APK', info.file ? 'Publié' : 'Absent', info.file ? `${info.version ? 'version ' + info.version + ' · ' : ''}${fmtBytes(info.size)}` : 'ajoutez public/luma-office.apk', info.file ? 'ok' : 'bad'),
        kpi('Fenêtre « Installer » ouverte (7 j)', nf(k.installOpens7d || 0)), kpi('APK téléchargé (7 j)', nf(k.apkDownloads7d || 0), `${nf(k.apkDownloads30d || 0)} sur 30 j`),
        kpi('Ouvertures de l’app (7 j)', nf(k.appOpens7d || 0), `${nf(k.appOpens30d || 0)} sur 30 j`)),
      card('Versions de l’application utilisées (30 j)', ...(v.length ? v.map(([ver, n]) => h('div', { class: 'ad-bar' }, h('span', {}, ver), h('div', {}, h('i', { style: { width: Math.max(3, Math.round((n / v[0][1]) * 100)) + '%' } })), h('b', {}, nf(n)))) : [note('Aucune ouverture enregistrée pour l’instant.')])),
      card('Mettre à jour l’APK', h('ol', { class: 'ins-steps-ol' },
        h('li', {}, 'GitHub › luma-office-apk › Actions › dernier build réussi › Artifacts › Android-APK.'),
        h('li', {}, 'Renommez le fichier en luma-office.apk et déposez-le dans le dossier public du site.'),
        h('li', {}, 'Mettez à jour public/apk-info.json avec la nouvelle version.')),
      h('small', { class: 'muted' }, 'La version affichée aux utilisateurs vient de apk-info.json.')));
  }

  /* ----- journal ----- */
  let evType = '';
  async function viewEvents() {
    const { events } = await call('events', { type: evType || undefined, limit: 150 });
    const TYPES = [['', 'Tous'], ['visit', 'Visites'], ['app_open', 'Ouvertures app'], ['apk_download', 'APK téléchargé'], ['install_open', 'Fenêtre installer'], ['ai', 'IA réussie'], ['ai_error', 'IA erreur'], ['cloud_put', 'Cloud envoi'], ['cloud_error', 'Cloud erreur'], ['signup', 'Nouveaux comptes'], ['login', 'Connexions'], ['admin', 'Actions admin']];
    const sel = h('select', { class: 'field', 'aria-label': 'Type', onchange: () => { evType = sel.value; render(); } }, ...TYPES.map(([v, l]) => h('option', { value: v, selected: v === evType }, l)));
    const desc = (e) => Object.entries(e.data || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
    body.replaceChildren(card('Journal d’activité',
      h('div', { class: 'row' }, sel, h('button', { class: 'btn', onclick: render }, 'Actualiser'),
        h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog('Supprimer les événements de plus de 30 jours ?', 'Purger', true)) { try { await call('events_clear', { days: 30 }); toast('Journal purgé'); render(); } catch (e) { toast(e.message, 4000); } } } }, 'Purger > 30 j')),
      events.length ? h('div', { class: 'ad-table ev' }, ...events.map((e) => row(fmtDate(e.ts), h('span', { class: 'ad-type t-' + e.type }, e.type), desc(e)))) : note('Aucun événement.')));
  }

  /* ----- santé ----- */
  async function viewHealth() {
    const hl = await call('health');
    body.replaceChildren(
      card('Configuration du site', ...hl.checks.map((c) => h('div', { class: 'ad-check' + (c.ok ? ' ok' : c.info ? ' info' : ' bad') }, h('span', { class: 'ad-dot' }), h('div', {}, h('b', {}, c.label), h('small', {}, c.ok ? 'OK' : c.info ? 'Non défini (facultatif) — ' + c.hint : 'À configurer — ' + c.hint))))),
      card('Base de données', h('div', { class: 'ad-check' + (hl.db.ok ? ' ok' : ' bad') }, h('span', { class: 'ad-dot' }), h('div', {}, h('b', {}, hl.db.ok ? `Connectée (${hl.db.ms} ms)` : 'Non connectée'), h('small', {}, hl.db.error || (hl.db.ok ? 'Neon / Postgres' : 'Variable DATABASE_URL manquante'))))),
      card('Déploiement', row('Environnement', hl.runtime.env || '—'), row('Région', hl.runtime.region || '—'), row('Version du code', hl.runtime.commit || '—'), row('Branche', hl.runtime.branch || '—'), row('Node.js', hl.runtime.node)),
      h('button', { class: 'btn', onclick: render }, 'Revérifier'));
  }

  start();
}
