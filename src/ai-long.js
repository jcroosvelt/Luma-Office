// Rédaction longue : un document complet (règlement, contrat, rapport, guide…) de plusieurs pages ne tient pas dans une
// seule réponse de l'IA (elle résume ou s'arrête). On procède en deux temps : 1) l'IA établit un PLAN, 2) elle rédige
// CHAQUE SECTION séparément, avec le plan et la fin de la section précédente comme repères. Le résultat est assemblé
// en un seul texte (titre # et sections ##). Même principe que dans l'application Android.
export const WORDS_PER_PAGE = 450;

const DOC_WORDS = /(règlement|reglement|statuts?|contrat|convention|charte|rapport|cahier des charges|mémoire|memoire|dossier|manuel|guide|procédure|procedure|politique|business plan|plan d.affaires|compte[- ]rendu détaillé|cours complet|programme complet|document complet|projet de|livret|protocole|règles)/;
const WRITE_VERBS = /(rédige|redige|écris|ecris|fais|fait|crée|cree|génère|genere|prépare|prepare|établis|etablis|élabore|elabore|propose|produis|donne)/;

// Nombre de pages demandé (« 10 pages », « une dizaine de pages »…), sinon null
export function requestedPages(s) {
  const t = String(s).toLowerCase();
  const m = /(?:^|[^\d])(\d{1,2})(?!\d)\s*(?:(?:à|a|-|et)\s*(\d{1,2})(?!\d)\s*)?(?:pages?|p\.)/.exec(t);
  if (m) { const a = +m[1], b = m[2] ? +m[2] : a; return Math.min(40, Math.max(1, Math.max(a, b))); }
  if (/dizaine de pages/.test(t)) return 10;
  if (/quinzaine de pages/.test(t)) return 15;
  if (/vingtaine de pages/.test(t)) return 20;
  return null;
}
// La demande décrit-elle un document complet (et non une retouche ou un court message) ?
export function wantsLongDocument(s) {
  const t = String(s).toLowerCase();
  if (requestedPages(s) != null) return true;
  return DOC_WORDS.test(t) && WRITE_VERBS.test(t);
}
export const sectionCountFor = (pages) => Math.min(24, Math.max(4, Math.round(pages * 1.4)));

// Pages à rédiger selon le choix de longueur (auto | court | long | tres), ou null pour une réponse normale
export function longPages(mode, instruction) {
  const asked = requestedPages(instruction);
  if (mode === 'court') return null;
  if (mode === 'long') return asked ?? 10;
  if (mode === 'tres') return asked ?? 22; // environ 10 000 mots
  if (asked != null && asked >= 3) return asked;
  return wantsLongDocument(instruction) ? 10 : null;
}

export const LONG_SYS = 'Tu es un rédacteur de documents professionnels francophones. Tu rédiges de façon exhaustive, précise et concrète, dans un texte utilisable tel quel (jamais de généralités creuses, jamais de résumé, jamais de « etc. » à la place du contenu). Format Markdown léger : ## pour le titre de la section, ### pour les sous-titres, - pour les listes, **gras** pour l’essentiel. Pas d’introduction ni de conclusion superflue, pas de commentaire sur ta tâche.';

const cut = (s, n, tail = false) => (s.length <= n ? s : tail ? s.slice(s.length - n) : s.slice(0, n));

export function outlinePrompt(instruction, context, pages) {
  const k = sectionCountFor(pages);
  return `Tu prépares un document complet d’environ ${pages} pages. Demande : ${instruction}\n${context && context.trim() ? `\nContenu existant à prendre en compte :\n---\n${cut(context, 5000)}\n---\n` : ''}\n` +
    `Établis le PLAN détaillé : exactement ${k} sections numérotées dans un ordre logique et complet (préambule ou introduction si utile, toutes les parties de fond, cas particuliers, procédures, sanctions ou suites, dispositions finales…). Pour chaque section, 3 à 6 points précis à couvrir. ` +
    'Réponds UNIQUEMENT par un objet JSON : {"title": "titre du document", "sections": [{"heading": "1. Titre de la section", "points": ["…", "…"]}]}';
}

export function sectionPrompt({ instruction, context, plan, index, words, previousTail }) {
  const s = plan.sections[index];
  const outline = plan.sections.map((x, i) => `${i + 1}. ${x.heading}`).join('\n');
  return `Document : ${plan.title}\nDemande d’origine : ${instruction}\n${context && context.trim() ? `\nContenu existant à respecter :\n---\n${cut(context, 3000)}\n---\n` : ''}\n` +
    `Plan complet :\n${outline}\n\nRédige UNIQUEMENT la section n°${index + 1} « ${s.heading} ».\n${s.points.length ? `Points à couvrir : ${s.points.join(' ; ')}.\n` : ''}` +
    `Longueur visée : environ ${words} mots (entre ${Math.round(words * 0.85)} et ${Math.round(words * 1.2)} mots) — développe, précise, donne des règles, cas, exemples et chiffres concrets quand c’est pertinent, sans délayer. ` +
    `Commence directement par « ## ${s.heading} ». Ne rédige pas les autres sections et ne répète pas leur contenu.` +
    (previousTail && previousTail.trim() ? `\n\nFin de la section précédente (pour la continuité ; ne la répète pas) :\n« …${cut(previousTail, 500, true)} »` : '');
}

// Lit le plan renvoyé par l'IA (JSON, éventuellement entouré de balises Markdown). Renvoie null si illisible.
export function parseOutline(text) {
  const s = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let j = null;
  try { j = JSON.parse(s); } catch {
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) { try { j = JSON.parse(s.slice(a, b + 1)); } catch { /* illisible */ } }
  }
  if (!j || !Array.isArray(j.sections)) return null;
  const sections = [];
  for (const x of j.sections) {
    if (!x || typeof x !== 'object') continue;
    const heading = String(x.heading ?? '').replace(/^#+\s*/, '').trim();
    if (!heading) continue;
    sections.push({ heading: heading.slice(0, 120), points: Array.isArray(x.points) ? x.points.map((p) => String(p).trim()) : [] });
    if (sections.length >= 30) break;
  }
  if (sections.length < 2) return null;
  return { title: String(j.title ?? '').replace(/^#+\s*/, '').trim() || 'Document', sections };
}

// Rédige un document complet : plan, puis section par section.
// ask(messages, { system, maxTokens, temperature, json }) -> texte ; onProgress(textDéjàRédigé, étape) ; cancelled() -> bool
export async function writeLongDocument({ instruction, context, pages, ask, onProgress, cancelled }) {
  onProgress('', 'Préparation du plan du document…');
  const plan = parseOutline(await ask([{ role: 'user', text: outlinePrompt(instruction, context, pages) }], { system: LONG_SYS, maxTokens: 4096, temperature: 0.4, json: true }));
  if (cancelled()) return { text: '', done: false };
  if (!plan) {
    onProgress('', 'Rédaction du document…');
    const t = await ask([{ role: 'user', text: `${instruction}\n\nRédige un document COMPLET et détaillé d’environ ${pages} pages (soit environ ${pages * WORDS_PER_PAGE} mots), structuré en sections numérotées, sans rien résumer.` }], { system: LONG_SYS, maxTokens: 16000, temperature: 0.5 });
    return { text: t.trim(), done: true };
  }
  const k = plan.sections.length;
  const words = Math.min(900, Math.max(150, Math.round((pages * WORDS_PER_PAGE) / k)));
  const parts = [];
  let assembled = `# ${plan.title}`, tail = null;
  for (let i = 0; i < k; i++) {
    if (cancelled()) return { text: assembled, done: false, note: `Rédaction arrêtée à la section ${i + 1} sur ${k}.` };
    onProgress(assembled, `Rédaction de la section ${i + 1}/${k} : ${plan.sections[i].heading}…`);
    let text;
    try { text = (await ask([{ role: 'user', text: sectionPrompt({ instruction, context, plan, index: i, words, previousTail: tail }) }], { system: LONG_SYS, maxTokens: 4096, temperature: 0.5 })).trim(); }
    catch (e) { if (e?.name === 'AbortError') return { text: assembled, done: false, note: `Rédaction arrêtée à la section ${i + 1} sur ${k}.` }; return { text: assembled, done: false, note: `Rédaction interrompue à la section ${i + 1} sur ${k} : ${e?.message || 'erreur'}` }; }
    if (!text) return { text: assembled, done: false, note: `Rédaction interrompue à la section ${i + 1} sur ${k} (réponse vide).` };
    if (!text.startsWith('#')) text = `## ${plan.sections[i].heading}\n${text}`;
    parts.push(text); tail = text;
    assembled = `# ${plan.title}\n\n${parts.join('\n\n')}`;
  }
  onProgress(assembled, 'Terminé');
  return { text: assembled, done: true };
}
