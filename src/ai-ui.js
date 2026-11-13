// Fenêtre « Assistant IA » : actions rapides (reformuler, corriger, résumer, traduire…), consigne libre, résultat en direct.
import { h, icon, sheet, toast, confirmDialog } from './ui.js';
import { generate, aiPrefs, mdToHtml, AiError } from './ai.js';

const EDIT_SYS = 'Tu es l’assistant de rédaction d’un traitement de texte. Réponds UNIQUEMENT avec le texte demandé : pas d’introduction, pas de commentaire, pas de guillemets autour du résultat. Garde la langue du texte d’origine, sauf demande de traduction. Sépare les paragraphes par une ligne vide. N’utilise pas de Markdown (ni **, ni #), sauf si l’on te demande explicitement une liste ou un plan.';
const GEN_SYS = 'Tu es l’assistant de rédaction d’un traitement de texte. Réponds en français sauf demande contraire, sans phrase d’introduction du type « Voici ». Tu peux structurer avec # et ## pour les titres, - pour les listes et ** pour le gras. Sépare les paragraphes par une ligne vide.';
const PDF_SYS = 'Tu es un assistant qui répond à des questions sur un document fourni par l’utilisateur. Appuie-toi uniquement sur le document ; si l’information n’y figure pas, dis-le clairement. Quand c’est utile, indique la page (le texte contient des repères « [Page N] »). Réponds en français, de façon claire et concise ; Markdown léger autorisé (listes avec -, gras avec **).';
const LANGS = ['anglais', 'espagnol', 'allemand', 'italien', 'portugais', 'arabe', 'néerlandais', 'chinois', 'français'];
const MAX_CHARS = 400000;

const EDIT_ACTIONS = [
  ['rewrite', 'Reformuler', 'Reformule ce texte pour qu’il soit plus clair et fluide, en gardant le sens et la longueur environ.'],
  ['fix', 'Corriger', 'Corrige l’orthographe, la grammaire, la conjugaison et la ponctuation, sans changer le style ni le sens.'],
  ['shorter', 'Raccourcir', 'Raccourcis ce texte de moitié environ en gardant l’essentiel.'],
  ['longer', 'Développer', 'Développe ce texte avec plus de détails et d’exemples pertinents, en gardant le même ton.'],
  ['formal', 'Ton formel', 'Réécris ce texte sur un ton formel et professionnel.'],
  ['friendly', 'Ton amical', 'Réécris ce texte sur un ton chaleureux et amical.'],
  ['simple', 'Simplifier', 'Réécris ce texte avec des mots simples et des phrases courtes, compréhensibles par tous.'],
  ['summary', 'Résumer', 'Résume ce texte en quelques phrases.'],
  ['bullets', '• En liste', 'Transforme ce texte en liste à puces claire (une idée par puce, avec « - »).'],
  ['plan', 'Plan', 'Propose un plan détaillé (titres avec # et ##, puces avec -) pour ce texte.'],
  ['continue', 'Continuer', 'Continue ce texte de façon cohérente (même style, même langue). Écris seulement la suite, sans répéter le début.'],
];
const PDF_ACTIONS = [
  ['summary', 'Résumer', 'Fais un résumé clair de ce document en une dizaine de lignes.'],
  ['keys', 'Points clés', 'Liste les points clés de ce document sous forme de puces (« - »), avec la page quand c’est possible.'],
  ['simple', 'Expliquer simplement', 'Explique ce document avec des mots simples, comme à quelqu’un qui découvre le sujet.'],
  ['extract', 'Dates, montants, noms', 'Extrais de ce document toutes les dates, tous les montants et tous les noms de personnes ou d’organisations importants, en liste avec la page.'],
  ['todo', 'Actions à faire', 'Liste les actions, obligations ou échéances qui concernent le lecteur de ce document.'],
];

export async function openAssistant({ kind = 'editor', title = 'Assistant IA', getSelection, getDocument, onReplace, onReplaceAll, onInsert, onNewDoc }) {
  const prefs = aiPrefs.get();
  if (!prefs.enabled) { toast('L’assistant IA est désactivé (Paramètres › Assistant IA)', 3500); return; }
  if (!prefs.consent) {
    if (!(await confirmDialog('L’assistant envoie le texte concerné (sélection, document ou PDF) à Google Gemini pour le traiter. N’utilisez pas cette fonction pour des documents confidentiels. Continuer ?', 'J’ai compris, continuer'))) return;
    aiPrefs.set({ consent: true });
  }
  const sel = (getSelection?.() || '').trim();
  const isPdf = kind === 'pdf';
  const words = (t) => (t.match(/\S+/g) || []).length;
  let messages = [], lastResult = '', ctrl = null, running = false, s;

  const out = h('div', { class: 'ai-out', hidden: true });
  const status = h('div', { class: 'ai-status' });
  const errBox = h('div', { class: 'ai-err', hidden: true });
  const stopBtn = h('button', { class: 'btn sm', hidden: true, onclick: () => ctrl?.abort() }, icon('stop', 16), 'Arrêter');
  const applyRow = h('div', { class: 'ai-apply', hidden: true });
  const ta = h('textarea', { class: 'field ai-ta', rows: 2, placeholder: isPdf ? 'Posez une question sur ce PDF…' : 'Ou écrivez ce que vous voulez : « Rédige une lettre de relance… »', 'aria-label': 'Consigne' });
  const send = h('button', { class: 'btn primary', onclick: () => ask() }, icon('sparkle', 18), 'Envoyer');
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ask(); } });
  const langSel = h('select', { class: 'field ai-lang', 'aria-label': 'Langue de traduction' }, ...LANGS.map((l) => h('option', { value: l }, l)));
  const useDoc = h('input', { type: 'checkbox' });

  const docText = () => { const t = getDocument?.() || ''; return t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) + '\n[… document tronqué]' : t; };
  const contextText = () => (isPdf ? docText() : sel || docText());

  async function run(userMsgs, system, { temperature = 0.7 } = {}) {
    if (running) return;
    running = true; ctrl = new AbortController(); messages = userMsgs;
    errBox.hidden = true; applyRow.hidden = true; out.hidden = false; out.textContent = ''; stopBtn.hidden = false; send.disabled = true;
    status.textContent = 'L’assistant écrit…';
    try {
      lastResult = await generate({ system, messages, signal: ctrl.signal, temperature, onText: (_d, full) => { out.textContent = full; out.scrollTop = out.scrollHeight; } });
      messages = [...messages, { role: 'model', text: lastResult }];
      status.textContent = `${words(lastResult)} mots`; buildApply();
      ta.placeholder = 'Demander une modification du résultat… (ex. « plus court », « plus poli »)';
    } catch (e) {
      if (e.name === 'AbortError') { status.textContent = 'Arrêté.'; if (out.textContent) { lastResult = out.textContent; buildApply(); } else out.hidden = true; }
      else { status.textContent = ''; out.hidden = !out.textContent; showError(e); }
    } finally { running = false; ctrl = null; stopBtn.hidden = true; send.disabled = false; }
  }
  function showError(e) {
    errBox.hidden = false;
    const cfg = e instanceof AiError && ['not-configured', 'no-api', 'bad-key', 'bad-code'].includes(e.code);
    errBox.replaceChildren(h('b', {}, '' + (e.message || 'Erreur')), cfg ? h('button', { class: 'btn sm', onclick: () => { s.close(); location.hash = '#/parametres'; } }, 'Ouvrir les paramètres de l’assistant') : null);
  }
  function buildApply() {
    const html = mdToHtml(lastResult);
    const btn = (label, ic, fn, primary) => h('button', { class: 'btn sm' + (primary ? ' primary' : ''), onclick: fn }, icon(ic, 16), label);
    const items = [];
    if (!isPdf) {
      if (sel && onReplace) items.push(btn('Remplacer la sélection', 'check', () => { onReplace(html); s.close(); toast('Texte remplacé ✓ (annulez avec ↶ si besoin)', 3000); }, true));
      if (!sel && onReplaceAll) items.push(btn('Remplacer le document', 'check', async () => { if (await confirmDialog('Remplacer tout le contenu du document par ce texte ?', 'Remplacer', true)) { onReplaceAll(html); s.close(); toast('Document remplacé ✓ (↶ pour annuler)', 3000); } }));
      if (onInsert) items.push(btn('Insérer à la suite', 'plus', () => { onInsert(html); s.close(); toast('Texte inséré ✓', 2500); }, !sel));
    } else if (onNewDoc) items.push(btn('Créer un document', 'file', () => { onNewDoc(html); s.close(); }, true));
    items.push(btn('Copier', 'copy', async () => { try { await navigator.clipboard.writeText(lastResult); toast('Copié ✓'); } catch { toast('Copie impossible'); } }));
    items.push(btn('Nouvelle demande', 'close', () => { messages = []; lastResult = ''; out.hidden = true; applyRow.hidden = true; status.textContent = ''; ta.placeholder = isPdf ? 'Posez une question sur ce PDF…' : 'Ou écrivez ce que vous voulez…'; }));
    applyRow.replaceChildren(...items); applyRow.hidden = false;
  }

  function quick(id, label, prompt) {
    return h('button', { class: 'chip', onclick: () => {
      const text = contextText();
      if (!text.trim()) { toast(isPdf ? 'Ce PDF ne contient pas de texte' : 'Écrivez ou sélectionnez d’abord du texte', 3000); return; }
      if (isPdf) run([{ role: 'user', text: `${prompt}\n\nDocument :\n${text}` }], PDF_SYS, { temperature: 0.3 });
      else run([{ role: 'user', text: `${prompt}\n\nTexte :\n${text}` }], EDIT_SYS, { temperature: id === 'fix' ? 0.1 : 0.6 });
    } }, label);
  }
  function translate() {
    const text = contextText();
    if (!text.trim()) { toast('Écrivez ou sélectionnez d’abord du texte'); return; }
    const p = `Traduis ce ${isPdf ? 'document' : 'texte'} en ${langSel.value}, en conservant le sens, le ton et la mise en paragraphes.`;
    run([{ role: 'user', text: `${p}\n\n${isPdf ? 'Document' : 'Texte'} :\n${text}` }], isPdf ? PDF_SYS : EDIT_SYS, { temperature: 0.2 });
  }
  function ask() {
    const q = ta.value.trim(); if (!q) { toast('Écrivez votre demande'); return; }
    ta.value = '';
    if (lastResult) { run([...messages, { role: 'user', text: q }], isPdf ? PDF_SYS : GEN_SYS); return; } // suite de la conversation
    if (isPdf) { const t = docText(); if (!t.trim()) { toast('Ce PDF ne contient pas de texte'); return; } run([{ role: 'user', text: `Document :\n${t}\n\nQuestion : ${q}` }], PDF_SYS, { temperature: 0.3 }); return; }
    const ctx = sel || (useDoc.checked ? docText() : '');
    run([{ role: 'user', text: ctx ? `${q}\n\nTexte concerné :\n${ctx}` : q }], ctx ? EDIT_SYS : GEN_SYS);
  }

  const ctxLabel = isPdf ? `PDF entier (${words(docText()).toLocaleString('fr-FR')} mots)` : sel ? `Sélection : ${words(sel)} mot${words(sel) > 1 ? 's' : ''}` : 'Aucun texte sélectionné : les actions portent sur le document entier';
  s = sheet(title, h('div', { class: 'form ai-box' },
    h('div', { class: 'ai-ctx' }, icon('sparkle', 16), h('span', {}, ctxLabel)),
    h('div', { class: 'chips ai-chips' }, ...(isPdf ? PDF_ACTIONS : EDIT_ACTIONS).map(([id, l, p]) => quick(id, l, p)), h('span', { class: 'ai-tr' }, h('button', { class: 'chip', onclick: translate }, 'Traduire en'), langSel)),
    ta, !isPdf && !sel ? h('label', { class: 'chk' }, useDoc, ' Utiliser le document comme contexte pour ma consigne') : null,
    h('div', { class: 'row' }, send, stopBtn, status),
    errBox, out, applyRow,
    h('small', { class: 'muted' }, 'Le résultat peut contenir des erreurs : relisez-le avant de l’utiliser.')),
  { wide: true, onClose: () => ctrl?.abort() });
  setTimeout(() => ta.focus(), 300);
}
