// Comparaison de deux documents (ou d'une version) : paragraphes et mots ajoutés / supprimés.
import { h, icon, sheet, toast } from './ui.js';
import { listDocs, listVersions } from './storage.js';
import { createDocFromHtml } from './files.js';

export function blocksOf(json) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.type === 'text') return;
    if (['paragraph', 'heading', 'codeBlock'].includes(n.type)) { const t = textOf(n).trim(); if (t) out.push(t); return; }
    (n.content || []).forEach(walk);
  };
  const textOf = (n) => (n.type === 'text' ? n.text : (n.content || []).map(textOf).join(n.type === 'hardBreak' ? '\n' : ''));
  walk(json);
  return out;
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Plus longue sous-suite commune ; renvoie des opérations eq / del / ins
export function diff(a, b) {
  const n = a.length, m = b.length;
  if (n * m > 25e6) { // trop gros : comparaison par position
    const ops = []; for (let i = 0; i < Math.max(n, m); i++) { if (a[i] === b[i]) ops.push({ t: 'eq', a: a[i] }); else { if (i < n) ops.push({ t: 'del', a: a[i] }); if (i < m) ops.push({ t: 'ins', b: b[i] }); } } return ops;
  }
  const w = m + 1, T = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i * w + j] = a[i] === b[j] ? T[(i + 1) * w + j + 1] + 1 : Math.max(T[(i + 1) * w + j], T[i * w + j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: 'eq', a: a[i] }); i++; j++; }
    else if (T[(i + 1) * w + j] >= T[i * w + j + 1]) ops.push({ t: 'del', a: a[i++] }); else ops.push({ t: 'ins', b: b[j++] });
  }
  while (i < n) ops.push({ t: 'del', a: a[i++] }); while (j < m) ops.push({ t: 'ins', b: b[j++] });
  return ops;
}
const tokens = (s) => s.split(/(\s+)/).filter((x) => x !== '');
function wordDiff(x, y) {
  const ops = diff(tokens(x), tokens(y));
  let html = '', htmlPlain = '';
  for (const o of ops) {
    if (o.t === 'eq') { html += esc(o.a); htmlPlain += esc(o.a); }
    else if (o.t === 'del') { html += `<del>${esc(o.a)}</del>`; htmlPlain += `<span style="color:#b3261e"><s>${esc(o.a)}</s></span>`; }
    else { html += `<ins>${esc(o.b)}</ins>`; htmlPlain += `<span style="color:#1a7f37"><u>${esc(o.b)}</u></span>`; }
  }
  return { html, doc: htmlPlain };
}

// Opérations de paragraphes, avec appariement des suppressions / ajouts consécutifs (paragraphe modifié)
export function compareBlocks(a, b) {
  const raw = diff(a, b), res = [];
  for (let k = 0; k < raw.length;) {
    if (raw[k].t === 'eq') { res.push(raw[k++]); continue; }
    const dels = [], inss = [];
    while (k < raw.length && raw[k].t !== 'eq') { (raw[k].t === 'del' ? dels : inss).push(raw[k]); k++; }
    const pairs = Math.min(dels.length, inss.length);
    for (let q = 0; q < pairs; q++) res.push({ t: 'mod', a: dels[q].a, b: inss[q].b, ...wordDiff(dels[q].a, inss[q].b) });
    dels.slice(pairs).forEach((d) => res.push(d)); inss.slice(pairs).forEach((i) => res.push(i));
  }
  return res;
}
const wc = (s) => (s.match(/\S+/g) || []).length;

export async function openCompare({ currentTitle, currentJson, currentId, preselect }) {
  const docs = (await listDocs()).filter((d) => !d.kind && d.id !== currentId && (d.json || d.html));
  const versions = await listVersions(currentId);
  const choices = [
    ...versions.map((v) => ({ key: 'v:' + v.id, label: `Version du ${new Date(v.t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${v.label ? ' — ' + v.label : ''}`, title: currentTitle + ' (version)', json: v.json })),
    ...docs.map((d) => ({ key: 'd:' + d.id, label: d.title || 'Sans titre', title: d.title, json: d.json })),
  ];
  if (!choices.length) { toast('Aucun autre document ni version à comparer', 3500); return; }
  const sel = h('select', { class: 'field', 'aria-label': 'Comparer avec' }, ...choices.map((c) => h('option', { value: c.key }, c.label)));
  if (preselect) sel.value = 'v:' + preselect;
  const out = h('div', { class: 'cmp-out' });
  let last = null;
  const run = () => {
    const c = choices.find((x) => x.key === sel.value); if (!c) return;
    const A = blocksOf(c.json), B = blocksOf(currentJson);
    const ops = compareBlocks(A, B); last = { ops, other: c.title };
    let add = 0, del = 0, mod = 0, same = 0;
    ops.forEach((o) => { if (o.t === 'ins') { add++; } else if (o.t === 'del') { del++; } else if (o.t === 'mod') { mod++; } else same++; });
    const words = ops.reduce((n, o) => n + (o.t === 'ins' ? wc(o.b) : o.t === 'del' ? -wc(o.a) : o.t === 'mod' ? wc(o.b) - wc(o.a) : 0), 0);
    const rows = []; let eqRun = 0;
    const flush = () => { if (eqRun) { rows.push(h('div', { class: 'cmp-eq' }, `… ${eqRun} paragraphe${eqRun > 1 ? 's' : ''} identique${eqRun > 1 ? 's' : ''}`)); eqRun = 0; } };
    for (const o of ops) {
      if (o.t === 'eq') { eqRun++; continue; }
      flush();
      if (o.t === 'del') rows.push(h('p', { class: 'cmp-del' }, o.a));
      else if (o.t === 'ins') rows.push(h('p', { class: 'cmp-ins' }, o.b));
      else rows.push(h('p', { class: 'cmp-mod', html: o.html }));
    }
    flush();
    out.replaceChildren(
      h('div', { class: 'cmp-stats' }, h('span', { class: 'cmp-ins' }, `+ ${add} ajouté${add > 1 ? 's' : ''}`), h('span', { class: 'cmp-del' }, `− ${del} supprimé${del > 1 ? 's' : ''}`), h('span', { class: 'cmp-mod' }, `✎ ${mod} modifié${mod > 1 ? 's' : ''}`), h('span', {}, `${words >= 0 ? '+' : '−'}${Math.abs(words)} mots`)),
      ...(add + del + mod ? rows : [h('p', { class: 'muted' }, 'Les deux documents ont exactement le même texte.')]),
      add + del + mod ? h('button', { class: 'btn primary', onclick: makeDoc }, icon('compare', 18), 'Créer un document de comparaison') : null);
  };
  const makeDoc = async () => {
    const html = last.ops.map((o) => (o.t === 'eq' ? `<p>${esc(o.a)}</p>` : o.t === 'del' ? `<p><span style="color:#b3261e"><s>${esc(o.a)}</s></span></p>` : o.t === 'ins' ? `<p><span style="color:#1a7f37"><u>${esc(o.b)}</u></span></p>` : `<p>${o.doc}</p>`)).join('');
    const intro = `<p><em>Comparaison : « ${esc(last.other)} » (ancien) → « ${esc(currentTitle)} » (actuel). <span style="color:#b3261e"><s>Supprimé</s></span> · <span style="color:#1a7f37"><u>Ajouté</u></span></em></p><hr>`;
    const rec = await createDocFromHtml({ title: `Comparaison — ${currentTitle}`, html: intro + html });
    toast('Document de comparaison créé ✓'); location.hash = '#/doc/' + rec.id;
  };
  sel.addEventListener('change', run);
  sheet('Comparer deux documents', h('div', { class: 'form' }, h('p', { class: 'muted' }, 'Compare le texte du document actuel avec un autre document ou une version précédente.'), sel, out), { wide: true });
  run();
}
