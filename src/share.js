// Partage de documents entre comptes : fenêtre « Partager », liste « Partagés avec moi », lecture seule avec
// commentaires et mentions, notifications. Les documents reçus viennent d'un autre compte : leur HTML est toujours
// reconstruit à partir d'une liste blanche (aucun script, aucun événement, aucun lien dangereux).
import { h, icon, sheet, toast, confirmDialog } from './ui.js';
import { getDoc } from './storage.js';
import * as C from './cloud.js';

const api = (action, payload) => C.sharePost(action, payload);
const fmtDate = (t) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const who = (p) => p?.name || (p?.email ? p.email.split('@')[0] : '?');

/* ---------- nettoyage du HTML d'un autre compte ---------- */
const TAGS = new Set(['p', 'div', 'span', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'blockquote', 'pre', 'code', 'a', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col', 'img', 'mark']);
const STYLE_OK = /^(color|background-color|font-size|font-family|font-weight|font-style|text-decoration|text-align|line-height|margin-left|text-indent|vertical-align)$/;
const SAFE_VALUE = /^[#\w\s.,%()'"\-/+]*$/;
function cleanStyle(v) {
  const out = [];
  for (const part of String(v).split(';')) {
    const i = part.indexOf(':'); if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase(), val = part.slice(i + 1).trim();
    if (STYLE_OK.test(k) && SAFE_VALUE.test(val) && !/url\(|expression|javascript/i.test(val)) out.push(`${k}: ${val}`);
  }
  return out.join('; ');
}
export function safeFragment(html) {
  const src = new DOMParser().parseFromString(`<body>${String(html || '')}</body>`, 'text/html').body;
  const frag = document.createDocumentFragment();
  const walk = (from, to) => {
    for (const n of [...from.childNodes]) {
      if (n.nodeType === 3) { to.append(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (!TAGS.has(tag)) { if (!['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'svg', 'math', 'form', 'input', 'button', 'textarea', 'select'].includes(tag)) walk(n, to); continue; }
      const el = document.createElement(tag);
      const st = n.getAttribute('style'); if (st) { const c = cleanStyle(st); if (c) el.setAttribute('style', c); }
      if (tag === 'a') { const href = n.getAttribute('href') || ''; if (/^(https?:|mailto:|tel:)/i.test(href)) { el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); } }
      if (tag === 'img') { const s = n.getAttribute('src') || ''; if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(s)) { el.setAttribute('src', s); el.setAttribute('alt', n.getAttribute('alt') || ''); } else continue; }
      for (const a of ['colspan', 'rowspan']) if (/^\d{1,2}$/.test(n.getAttribute(a) || '')) el.setAttribute(a, n.getAttribute(a));
      walk(n, el); to.append(el);
    }
  };
  walk(src, frag);
  return frag;
}

/* ---------- fenêtre « Partager » ---------- */
export async function openShareSheet(rec) {
  if (!C.connected()) { toast('Connectez-vous d’abord au Cloud (onglet Cloud) pour partager un document.', 4800); return; }
  if (rec.kind && rec.kind !== 'doc') { toast('Seuls les documents texte peuvent être partagés pour l’instant.', 4200); return; }
  const email = h('input', { class: 'field', type: 'email', placeholder: 'Adresse e-mail de la personne', autocomplete: 'off', inputmode: 'email', 'aria-label': 'Adresse e-mail' });
  const err = h('div', { class: 'ai-err', hidden: true });
  const list = h('div', { class: 'sh-people' });
  const send = h('button', { class: 'btn primary', onclick: go }, icon('share', 18), 'Partager');
  const s = sheet('Partager « ' + (rec.title || 'Sans titre') + ' »', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'La personne verra toujours la dernière version, en lecture seule, et pourra la commenter. Elle doit avoir un compte Luma Office avec exactement cette adresse.'),
    email, send, err, h('b', {}, 'Déjà partagé avec'), list));
  const show = (m) => { err.textContent = m; err.hidden = !m; };
  async function refresh() {
    try {
      const r = await api('out', { docId: rec.id });
      list.replaceChildren(...(r.shares.length ? r.shares.map((x) => h('div', { class: 'sh-person' },
        h('div', {}, h('b', {}, who(x.to)), h('small', {}, x.to.email)),
        h('button', { class: 'btn sm', onclick: async () => { if (await confirmDialog(`Retirer l’accès de ${x.to.email} ?`, 'Retirer', true)) { try { await api('revoke', { id: x.id }); toast('Partage retiré'); refresh(); } catch (e) { toast(e.message, 4000); } } } }, 'Retirer')))
        : [h('small', { class: 'muted' }, 'Personne pour l’instant.')]));
    } catch (e) { list.replaceChildren(h('small', { class: 'muted' }, e.message)); }
  }
  async function go() {
    show('');
    const to = email.value.trim();
    if (!to) { show('Saisissez l’adresse e-mail de la personne.'); return; }
    send.disabled = true;
    try {
      const cur = await getDoc(rec.id); // dernière version enregistrée, envoyée au cloud avant le partage
      await C.uploadDoc(cur || rec);
      const r = await api('create', { docId: rec.id, email: to });
      toast(r.already ? 'Déjà partagé avec cette personne' : `Partagé avec ${who(r.to)} ✓`);
      email.value = ''; refresh();
    } catch (e) { show(e.message); } finally { send.disabled = false; }
  }
  email.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  refresh();
  return s;
}

/* ---------- notifications ---------- */
export async function loadNotifs() { try { return await api('notifs', {}); } catch { return { items: [], unseen: 0 }; } }
export const markSeen = (ids) => api('notif_seen', ids === 'all' ? { all: true } : { ids }).catch(() => {});
const ICON = { share: 'share', comment: 'comment', mention: 'hash' };

export function notifRow(n, onOpen) {
  return h('button', { class: 'sh-notif' + (n.seen ? '' : ' new'), onclick: () => onOpen(n) },
    h('span', { class: 'tool-ic' }, icon(ICON[n.type] || 'info', 18)),
    h('span', { class: 'sh-notif-t' }, h('b', {}, n.title || 'Notification'), n.text ? h('small', {}, n.text) : null, h('small', { class: 'muted' }, fmtDate(n.created))));
}

export const openShared = (shareId) => { location.hash = `#/partage/${shareId}`; };
const openNotif = async (n) => { await markSeen([n.id]); if (n.shareId) openShared(n.shareId); };

// Bannière d'alerte à l'ouverture et pendant l'utilisation : nouveaux partages, commentaires, mentions
let watcher = null; const told = new Set();
export function startNotifWatcher() {
  if (watcher) return;
  const check = async () => {
    if (!C.connected() || document.hidden) return;
    const r = await loadNotifs();
    const fresh = r.items.filter((n) => !n.seen && !told.has(n.id));
    if (!fresh.length) return;
    fresh.forEach((n) => told.add(n.id));
    document.querySelector('.share-alert')?.remove();
    const first = fresh[0];
    const bar = h('div', { class: 'share-alert', role: 'status' },
      h('span', { class: 'tool-ic' }, icon(ICON[first.type] || 'info', 18)),
      h('div', { class: 'sh-notif-t' }, h('b', {}, first.title), fresh.length > 1 ? h('small', {}, `et ${fresh.length - 1} autre${fresh.length > 2 ? 's' : ''} notification${fresh.length > 2 ? 's' : ''}`) : (first.text ? h('small', {}, first.text) : null)),
      first.shareId ? h('button', { class: 'btn sm primary', onclick: async () => { bar.remove(); await markSeen(fresh.map((n) => n.id)); openShared(first.shareId); } }, 'Ouvrir') : null,
      h('button', { class: 'icon-btn', 'aria-label': 'Fermer', onclick: async () => { bar.remove(); await markSeen(fresh.map((n) => n.id)); } }, icon('close', 18)));
    document.body.append(bar);
  };
  watcher = setInterval(check, 90_000);
  setTimeout(check, 2500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}

/* ---------- cloud : notifications et « Partagés avec moi » ---------- */
export async function drawNotifCard(card) {
  card.replaceChildren(h('b', {}, 'Notifications'), h('small', { class: 'muted' }, 'Chargement…'));
  const r = await loadNotifs();
  const rows = r.items.slice(0, 15).map((n) => notifRow(n, openNotif));
  card.replaceChildren(h('div', { class: 'row between' }, h('b', {}, 'Notifications' + (r.unseen ? ` (${r.unseen})` : '')),
    r.unseen ? h('button', { class: 'btn sm', onclick: async () => { await markSeen('all'); drawNotifCard(card); } }, 'Tout marquer comme lu') : null),
    ...(rows.length ? rows : [h('small', { class: 'muted' }, 'Rien pour l’instant : vous serez prévenu ici des partages, commentaires et mentions.')]));
}

export async function drawInboxCard(card) {
  card.replaceChildren(h('b', {}, 'Partagés avec moi'), h('small', { class: 'muted' }, 'Chargement…'));
  try {
    const r = await api('inbox', {});
    card.replaceChildren(h('b', {}, 'Partagés avec moi'),
      ...(r.items.length ? r.items.map((d) => h('div', { class: 'cl-doc' },
        h('div', { class: 'cl-docinfo' }, h('b', {}, d.title), h('small', {}, `De ${who(d.owner)} · ${fmtDate(d.updated)} · ${d.comments} commentaire${d.comments > 1 ? 's' : ''}`)),
        h('button', { class: 'btn sm primary', onclick: () => openShared(d.id) }, 'Ouvrir'),
        h('button', { class: 'icon-btn', 'aria-label': 'Ne plus recevoir ce document', title: 'Quitter ce partage', onclick: async () => { if (await confirmDialog(`Ne plus voir « ${d.title} » ?`, 'Quitter', true)) { await api('revoke', { id: d.id }).catch(() => {}); drawInboxCard(card); } } }, icon('trash', 18))))
        : [h('small', { class: 'muted' }, 'Aucun document partagé avec vous pour l’instant.')]));
  } catch (e) { card.replaceChildren(h('b', {}, 'Partagés avec moi'), h('div', { class: 'ai-err' }, e.message)); }
}

/* ---------- page « document partagé » : lecture seule + commentaires ---------- */
export async function showShared(host, id, { onBack }) {
  const back = h('button', { class: 'icon-btn', 'aria-label': 'Retour', title: 'Retour', onclick: onBack }, icon('up', 22));
  back.firstChild?.style && (back.firstChild.style.transform = 'rotate(-90deg)');
  host.replaceChildren(h('div', { class: 'sh-page' }, h('header', { class: 'sh-top' }, back, h('b', {}, 'Document partagé')), h('div', { class: 'sh-wait' }, 'Chargement…')));
  let r;
  try { r = await api('get', { id }); } catch (e) {
    host.replaceChildren(h('div', { class: 'sh-page' }, h('header', { class: 'sh-top' }, back, h('b', {}, 'Document partagé')),
      h('div', { class: 'sh-wait' }, h('div', { class: 'ai-err' }, e.message), h('button', { class: 'btn', onclick: onBack }, 'Retour'))));
    return;
  }
  let data = {}; try { data = JSON.parse(r.data); } catch { data = {}; }
  const paper = h('article', { class: 'sh-paper' });
  paper.append(safeFragment(data.html || '<p><i>Document vide.</i></p>'));
  const others = r.people.filter((p) => p.id !== r.me);
  const thread = h('div', { class: 'sh-thread' });
  const box = h('textarea', { class: 'field', rows: 3, placeholder: 'Écrire un commentaire… (@prénom pour mentionner)', maxlength: 2000, 'aria-label': 'Commentaire' });
  const err = h('div', { class: 'ai-err', hidden: true });
  const mentions = h('div', { class: 'sh-mentions' }, ...others.map((p) => {
    const handle = (p.name || p.email.split('@')[0]).trim().split(/\s+/)[0].toLowerCase();
    return h('button', { class: 'btn sm', onclick: () => { box.value += (box.value && !/\s$/.test(box.value) ? ' ' : '') + '@' + handle + ' '; box.focus(); } }, '@' + handle);
  }));
  const sendBtn = h('button', { class: 'btn primary', onclick: send }, icon('comment', 18), 'Commenter');
  let comments = r.comments;
  function drawThread() {
    const at = (t) => t.split(/(@[\p{L}\p{N}._-]+)/u).map((x) => (x.startsWith('@') ? h('b', { class: 'sh-at' }, x) : x));
    thread.replaceChildren(...(comments.length ? comments.map((c) => h('div', { class: 'sh-comment' + (c.author.id === r.me ? ' mine' : '') },
      h('div', { class: 'sh-who' }, h('b', {}, c.author.id === r.me ? 'Vous' : who(c.author)), h('small', {}, fmtDate(c.created))),
      h('p', {}, ...at(c.text)))) : [h('small', { class: 'muted' }, 'Aucun commentaire pour l’instant.')]));
  }
  async function send() {
    err.hidden = true;
    const text = box.value.trim(); if (!text) return;
    sendBtn.disabled = true;
    try { await api('comment', { id: r.id, docId: r.docId, text }); box.value = ''; await refreshThread(); thread.lastElementChild?.scrollIntoView({ block: 'nearest' }); }
    catch (e) { err.textContent = e.message; err.hidden = false; } finally { sendBtn.disabled = false; }
  }
  async function refreshThread() { try { const t = await api('comments', { id: r.id, docId: r.docId }); comments = t.comments; drawThread(); } catch { /* réessayé au prochain passage */ } }
  const copy = h('button', { class: 'btn', onclick: async () => {
    try { const { createDocFromHtml } = await import('./files.js'); const doc = await createDocFromHtml({ title: `${r.title} (copie)`, html: data.html || '', settings: data.settings }); toast('Copie enregistrée dans vos documents ✓'); location.hash = `#/doc/${doc.id}`; } catch (e) { toast(e.message || 'Impossible d’enregistrer la copie', 4000); }
  } }, icon('copy', 18), 'Enregistrer une copie');
  drawThread();
  host.replaceChildren(h('div', { class: 'sh-page' },
    h('header', { class: 'sh-top' }, back, h('div', { class: 'sh-title' }, h('b', {}, r.title), h('small', {}, r.isOwner ? 'Document que vous partagez' : `Partagé par ${who(r.owner)} · lecture seule`)), copy),
    h('div', { class: 'sh-body' }, paper,
      h('aside', { class: 'sh-side' }, h('b', {}, 'Commentaires'), thread, box, mentions.childElementCount ? mentions : null, err, sendBtn))));
  // les notifications de ce document sont lues
  loadNotifs().then((n) => { const ids = n.items.filter((x) => !x.seen && x.shareId === r.id).map((x) => x.id); if (ids.length) markSeen(ids); });
  const timer = setInterval(() => { if (!host.isConnected || !paper.isConnected) { clearInterval(timer); return; } if (!document.hidden) refreshThread(); }, 20_000);
}
