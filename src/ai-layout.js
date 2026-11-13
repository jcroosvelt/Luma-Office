// « Mise en page automatique (IA) » : l'IA lit le document, reconnaît sa nature (lettre, rapport, CV, contrat…)
// puis propose une mise en page professionnelle : format de page, marges, police, interligne, rôle de chaque paragraphe
// (titre, sous-titre, titres de section, date, signature…) et numérotation. Rien n'est appliqué sans accord, et tout s'annule.
import { h, icon, sheet, toast, confirmDialog } from './ui.js';
import { generate, aiPrefs, AiError } from './ai.js';
import { FONTS, cssFam } from './ribbon.js';
import { PAGE_SIZES } from './layout.js';

const MAX_BLOCKS = 400;
const ROLES = ['title', 'subtitle', 'h1', 'h2', 'h3', 'body', 'quote', 'caption', 'date', 'sender', 'recipient', 'subject', 'signature', 'center', 'keep'];
const ROLE_FR = { title: 'titre', subtitle: 'sous-titre', h1: 'titre de section', h2: 'sous-titre de section', h3: 'titre de niveau 3', quote: 'citation', caption: 'légende', date: 'date', sender: 'expéditeur', recipient: 'destinataire', subject: 'objet', signature: 'signature', center: 'bloc centré' };

const SYSTEM = 'Tu es un expert en mise en page de documents professionnels (typographie française, usages de la bureautique). Tu réponds UNIQUEMENT par un objet JSON valide, sans texte autour ni balises Markdown.';

function buildPrompt(blocks, total) {
  return `Analyse ce document, identifie sa nature (lettre, rapport, CV, contrat, facture, compte rendu, mémoire, cours, article, document administratif, autre…) et propose la mise en page la plus professionnelle et lisible.

Réponds avec un objet JSON de cette forme exacte :
{
  "type": "nature du document en français (ex. lettre de motivation)",
  "summary": "une phrase qui décrit le document et le choix de mise en page",
  "page": { "size": "A4|A5|Letter", "orientation": "portrait|landscape", "margins": { "top": 2.5, "bottom": 2.5, "left": 2.5, "right": 2.5 }, "columns": 1, "pageNumbers": true, "pageNumberFormat": "page-of|plain|dash", "pageNumberAlign": "left|center|right", "header": "", "footer": "" },
  "text": { "font": "une police de la liste", "headingFont": "une police de la liste", "size": 11, "lineHeight": 1.15, "spaceAfter": 6, "bodyAlign": "left|justify", "accent": "#1f3864" },
  "blocks": [ { "i": 0, "role": "title" } ]
}

Règles :
- Marges en cm entre 1,5 et 3,5. Colonnes : 1 (2 seulement pour une brochure ou un article court). Pas de numérotation pour une lettre d'une page.
- Polices autorisées : ${FONTS.slice(0, 16).join(', ')}. Taille du texte : 10 à 12 (pt). Interligne : 1,0 à 1,6. Espace après paragraphe : 0 à 12 (pt). "accent" : une couleur sobre pour les titres.
- "header" et "footer" : texte très court (ou vide). N'invente jamais d'information.
- "blocks" : pour CHAQUE bloc numéroté ci-dessous, son rôle parmi : ${ROLES.join(', ')}. Utilise « keep » pour les listes, tableaux, images et tout ce qui ne doit pas être modifié. Un seul "title" au maximum. Utilise h1/h2/h3 pour les vrais titres de section, « body » pour le texte courant.

Document (${total} blocs${total > blocks.length ? `, seuls les ${blocks.length} premiers sont listés` : ''}) :
${blocks.map((b) => `${b.i}. [${b.t}] ${b.s}`).join('\n')}`;
}

function listBlocks(editor) {
  const out = [];
  editor.state.doc.forEach((node, _o, i) => {
    if (i >= MAX_BLOCKS) return;
    const name = node.type.name === 'heading' ? `titre${node.attrs.level}` : node.type.name === 'paragraph' ? 'para' : node.type.name;
    out.push({ i, t: name, s: node.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) || (node.isTextblock ? '(vide)' : '') });
  });
  return out;
}

function parseJson(t) {
  let s = String(t || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch { /* essai suivant */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new AiError('Réponse de l’assistant illisible. Réessayez.', 'bad-json');
}

const num = (v, lo, hi, d) => { const n = +String(v).replace(',', '.'); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const pick = (v, list, d) => (list.includes(v) ? v : d);
const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);

// Nettoie et borne la proposition de l'IA
function normalize(raw, settings, count) {
  const pg = raw.page || {}, tx = raw.text || {};
  const m = pg.margins || {};
  const font = pick(tx.font, FONTS, 'Calibri');
  const plan = {
    type: String(raw.type || 'document').slice(0, 60), summary: String(raw.summary || '').slice(0, 300),
    page: {
      size: pick(pg.size, Object.keys(PAGE_SIZES), settings.size), orientation: pick(pg.orientation, ['portrait', 'landscape'], 'portrait'),
      margins: { top: num(m.top, 1.5, 3.5, 2.5), bottom: num(m.bottom, 1.5, 3.5, 2.5), left: num(m.left, 1.5, 3.5, 2.5), right: num(m.right, 1.5, 3.5, 2.5) },
      columns: pg.columns === 2 ? 2 : 1, pageNumbers: pg.pageNumbers !== false,
      pageNumberFormat: pick(pg.pageNumberFormat, ['page-of', 'plain', 'dash'], 'page-of'), pageNumberAlign: pick(pg.pageNumberAlign, ['left', 'center', 'right'], 'center'),
      header: String(pg.header || '').slice(0, 80), footer: String(pg.footer || '').slice(0, 80),
    },
    text: { font, headingFont: pick(tx.headingFont, FONTS, font), size: num(tx.size, 9, 13, 11), lineHeight: num(tx.lineHeight, 1, 1.8, 1.15), spaceAfter: num(tx.spaceAfter, 0, 14, 6), bodyAlign: tx.bodyAlign === 'justify' ? 'justify' : 'left', accent: color(tx.accent, '#1f3864') },
    roles: {},
  };
  let titled = false;
  for (const b of Array.isArray(raw.blocks) ? raw.blocks : []) {
    const i = +b.i, r = b.role;
    if (!Number.isInteger(i) || i < 0 || i >= count || !ROLES.includes(r)) continue;
    if (r === 'title') { if (titled) { plan.roles[i] = 'h1'; continue; } titled = true; }
    plan.roles[i] = r;
  }
  return plan;
}

// Applique la proposition : une seule transaction (annulable d'un coup avec Annuler) + réglages de page
function applyPlan(editor, plan, updateSettings, getSettings) {
  const { schema } = editor;
  const tr = editor.state.tr;
  const T = plan.text, base = T.size, acc = plan.text.accent;
  const textStyle = schema.marks.textStyle, bold = schema.marks.bold, italic = schema.marks.italic;
  const tops = [];
  editor.state.doc.forEach((node, offset, i) => tops.push({ node, offset, i }));
  const style = (role) => {
    switch (role) {
      case 'title': return { size: Math.round(base * 2 * 2) / 2, bold: true, color: acc, font: T.headingFont, align: 'center', after: 14, before: 0 };
      case 'subtitle': return { size: Math.round(base * 1.3 * 2) / 2, color: '#44546a', font: T.headingFont, align: 'center', after: 12, italic: true };
      case 'h1': return { size: Math.round(base * 1.6 * 2) / 2, bold: true, color: acc, font: T.headingFont, level: 1, before: 14, after: 6, align: 'left' };
      case 'h2': return { size: Math.round(base * 1.3 * 2) / 2, bold: true, color: acc, font: T.headingFont, level: 2, before: 10, after: 4, align: 'left' };
      case 'h3': return { size: Math.round(base * 1.15 * 2) / 2, bold: true, color: '#333333', font: T.headingFont, level: 3, before: 8, after: 3, align: 'left' };
      case 'quote': return { italic: true, color: '#44546a', indent: 1, align: 'left' };
      case 'caption': return { size: Math.max(8, base - 1.5), italic: true, color: '#666666', align: 'center', after: 8 };
      case 'date': return { align: 'right' };
      case 'sender': return { align: 'left', after: 0 };
      case 'recipient': return { align: 'right', after: 0 };
      case 'subject': return { bold: true, align: 'left', before: 8, after: 10 };
      case 'signature': return { align: 'right', before: 14 };
      case 'center': return { align: 'center' };
      default: return { align: T.bodyAlign };
    }
  };
  const textMarks = (from, to, st) => {
    tr.doc.nodesBetween(from, to, (n, p) => {
      if (!n.isText) return;
      const old = n.marks.find((m) => m.type === textStyle)?.attrs || {};
      const attrs = { ...old, fontFamily: cssFam(st.font || T.font), fontSize: `${st.size || base}pt` };
      if (st.color) attrs.color = st.color;
      tr.addMark(p, p + n.nodeSize, textStyle.create(attrs));
      if (st.bold && bold) tr.addMark(p, p + n.nodeSize, bold.create());
      if (st.italic && italic) tr.addMark(p, p + n.nodeSize, italic.create());
    });
  };
  for (const { node, offset, i } of tops) {
    const role = plan.roles[i] || (node.isTextblock ? 'body' : 'keep');
    if (!node.isTextblock) { // listes, tableaux… : police et taille uniformes, rien d'autre
      textMarks(offset, offset + node.nodeSize, { font: T.font, size: base });
      node.descendants((c, p) => { if (c.isTextblock && c.type.name === 'paragraph') tr.setNodeMarkup(offset + 1 + p, undefined, { ...c.attrs, lineHeight: String(T.lineHeight) }); });
      continue;
    }
    if (role === 'keep') continue;
    const st = style(role);
    let type = node.type, attrs = { ...node.attrs };
    if (st.level && schema.nodes.heading) { type = schema.nodes.heading; attrs = { ...attrs, level: st.level }; }
    else if (node.type.name === 'heading') { type = schema.nodes.paragraph; attrs = { ...attrs }; delete attrs.level; }
    attrs.textAlign = st.align || null;
    attrs.lineHeight = ['title', 'subtitle', 'h1', 'h2', 'h3'].includes(role) ? null : String(T.lineHeight);
    attrs.spaceAfter = st.after ?? T.spaceAfter;
    attrs.spaceBefore = st.before ?? null;
    if (st.indent !== undefined) attrs.indent = st.indent;
    const safe = {};
    for (const k of Object.keys(type.spec.attrs || {})) if (k in attrs) safe[k] = attrs[k];
    tr.setNodeMarkup(offset, type, safe);
    textMarks(offset + 1, offset + node.nodeSize - 1, st);
  }
  editor.view.dispatch(tr.scrollIntoView());

  const cur = getSettings();
  const prev = JSON.parse(JSON.stringify(cur));
  const pg = plan.page;
  const patch = {
    size: pg.size, orientation: pg.orientation, margins: pg.margins, columns: { count: pg.columns },
    pageNumbers: pg.pageNumbers, pageNumberFormat: pg.pageNumberFormat, pageNumberAlign: pg.pageNumberAlign, pageNumberPos: 'bottom',
  };
  if (pg.header && !cur.header?.trim()) patch.header = pg.header;
  if (pg.footer && !cur.footer?.trim()) patch.footer = pg.footer;
  updateSettings(patch);
  return prev;
}

const cm = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

export async function openAutoLayout({ editor, getSettings, updateSettings }) {
  const prefs = aiPrefs.get();
  if (!prefs.enabled) { toast('L’assistant IA est désactivé (Paramètres › Assistant IA)', 3500); return; }
  const total = editor.state.doc.childCount;
  if (!editor.getText().trim()) { toast('Écrivez d’abord du texte : l’IA a besoin du document pour proposer une mise en page', 4000); return; }
  if (!prefs.consent) {
    if (!(await confirmDialog('L’assistant envoie le texte du document à un service d’intelligence artificielle pour le traiter. N’utilisez pas cette fonction pour des documents confidentiels. Continuer ?', 'Continuer'))) return;
    aiPrefs.set({ consent: true });
  }
  const body = h('div', { class: 'form ai-box' });
  let s, ctrl = new AbortController(), applied = null;
  const close = () => { ctrl.abort(); s?.close(); };
  s = sheet('Mise en page automatique (IA)', body, { wide: true, onClose: () => ctrl.abort() });

  async function analyze() {
    ctrl = new AbortController();
    const live = h('div', { class: 'ai-status' }, 'L’IA lit votre document…');
    body.replaceChildren(
      h('div', { class: 'ai-ctx' }, icon('sparkle', 16), h('span', {}, `Analyse de ${total} bloc${total > 1 ? 's' : ''} de texte`)),
      h('div', { class: 'ai-msg bot typing' }, h('span', { class: 'ai-dots' }, h('i'), h('i'), h('i'))), live,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Annuler')));
    const blocks = listBlocks(editor);
    try {
      const text = await generate({
        system: SYSTEM, messages: [{ role: 'user', text: buildPrompt(blocks, total) }], temperature: 0.3, maxTokens: 8192, json: true, signal: ctrl.signal,
        onText: (_d, full) => { const m = /"type"\s*:\s*"([^"]{2,60})"/.exec(full); live.textContent = m ? `Document reconnu : ${m[1]} — préparation de la mise en page…` : 'L’IA analyse le document…'; },
      });
      showPlan(normalize(parseJson(text), getSettings(), total));
    } catch (e) {
      if (e.name === 'AbortError') return;
      body.replaceChildren(h('div', { class: 'ai-err' }, h('b', {}, e.message || 'Erreur'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: analyze }, 'Réessayer'), h('button', { class: 'btn', onclick: close }, 'Fermer'))));
    }
  }

  function showPlan(plan) {
    const cnt = (r) => Object.values(plan.roles).filter((x) => x === r).length;
    const heads = cnt('h1') + cnt('h2') + cnt('h3');
    const lines = [
      ['Page', `${plan.page.size} ${plan.page.orientation === 'landscape' ? 'paysage' : 'portrait'}, marges ${cm(plan.page.margins.top)} / ${cm(plan.page.margins.right)} / ${cm(plan.page.margins.bottom)} / ${cm(plan.page.margins.left)} cm${plan.page.columns > 1 ? ', 2 colonnes' : ''}`],
      ['Texte', `${plan.text.font} ${cm(plan.text.size)} pt, interligne ${cm(plan.text.lineHeight)}, ${plan.text.bodyAlign === 'justify' ? 'justifié' : 'aligné à gauche'}`],
      ['Titres', `${plan.text.headingFont}, couleur d’accent${cnt('title') ? ', 1 titre' : ''}${heads ? `, ${heads} titre${heads > 1 ? 's' : ''} de section` : ''}`],
      ['Numérotation', plan.page.pageNumbers ? `en bas, ${{ left: 'à gauche', center: 'centrée', right: 'à droite' }[plan.page.pageNumberAlign]}` : 'aucune'],
    ];
    const extra = Object.entries(ROLE_FR).filter(([r]) => !['title', 'h1', 'h2', 'h3'].includes(r) && cnt(r)).map(([r, l]) => `${cnt(r)} ${l}`);
    if (extra.length) lines.push(['Éléments reconnus', extra.join(', ')]);
    body.replaceChildren(
      h('div', { class: 'ai-ctx' }, icon('sparkle', 16), h('span', {}, 'Proposition de mise en page')),
      h('div', { class: 'al-type' }, plan.type),
      plan.summary ? h('p', { class: 'al-sum' }, plan.summary) : null,
      h('dl', { class: 'al-list' }, ...lines.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('small', { class: 'muted' }, 'Le texte n’est pas modifié, seulement sa présentation. Vous pourrez annuler.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => apply(plan) }, icon('check', 18), 'Appliquer la mise en page'),
        h('button', { class: 'btn', onclick: analyze }, 'Nouvelle proposition'),
        h('button', { class: 'btn', onclick: close }, 'Annuler')));
  }

  function apply(plan) {
    try { applied = applyPlan(editor, plan, updateSettings, getSettings); } catch (e) { console.error(e); toast('Impossible d’appliquer la mise en page', 4000); return; }
    body.replaceChildren(
      h('div', { class: 'al-done' }, icon('accept', 22), h('b', {}, 'Mise en page appliquée')),
      h('p', { class: 'al-sum' }, 'Parcourez votre document. Si le résultat ne vous convient pas, vous pouvez tout annuler.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: close }, 'Terminer'),
        h('button', { class: 'btn', onclick: () => { try { editor.commands.undo(); updateSettings(applied); } catch (e) { console.error(e); } toast('Mise en page annulée'); close(); } }, icon('undo', 18), 'Annuler la mise en page')));
  }
  analyze();
}
