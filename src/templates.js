// Modèles de documents professionnels et personnels.
import { DEFAULT_SETTINGS, MARGIN_PRESETS } from './layout.js';
import { pref } from './storage.js';

const today = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const tbl = (head, rows, cols = head.length) =>
  `<table><tbody><tr>${head.map((x) => `<th><p>${x}</p></th>`).join('')}</tr>${rows.map((r) => `<tr>${Array.from({ length: cols }, (_, i) => `<td><p>${r[i] ?? '…'}</p></td>`).join('')}</tr>`).join('')}</tbody></table><p></p>`;
const task = (t, c = false) => `<li data-type="taskItem" data-checked="${c}"><p>${t}</p></li>`;

export const CATEGORIES = ['Courrier', 'Professionnel', 'Finance', 'Personnel'];

export const TEMPLATES = [
  { id: 'blank', cat: 'Personnel', name: 'Document vierge', desc: 'Une page blanche pour démarrer.', emoji: '📄', settings: {}, html: () => '<p></p>' },
  {
    id: 'letter', cat: 'Courrier', name: 'Lettre professionnelle', desc: 'Expéditeur, destinataire, objet, formule de politesse.', emoji: '✉️', settings: { pageNumbers: false },
    html: () => `<p>Prénom NOM<br>Adresse<br>Code postal Ville<br>Téléphone · E-mail</p>
<p style="text-align:right">Nom de l’entreprise<br>À l’attention de Madame / Monsieur …<br>Adresse<br>Code postal Ville</p>
<p style="text-align:right">Ville, le ${today()}</p>
<p><strong>Objet : </strong>…</p>
<p>Madame, Monsieur,</p>
<p style="text-align:justify">Je me permets de vous contacter au sujet de …</p>
<p style="text-align:justify">…</p>
<p style="text-align:justify">Dans l’attente de votre réponse, je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.</p>
<p style="text-align:right">Signature</p>`,
  },
  {
    id: 'motivation', cat: 'Courrier', name: 'Lettre de motivation', desc: 'Candidature structurée en trois paragraphes.', emoji: '💼', settings: { pageNumbers: false },
    html: () => `<p>Prénom NOM<br>Adresse · Code postal Ville<br>Téléphone · E-mail</p>
<p style="text-align:right">Nom de l’entreprise<br>Service des ressources humaines<br>Adresse</p>
<p style="text-align:right">Ville, le ${today()}</p>
<p><strong>Objet : candidature au poste de …</strong></p>
<p>Madame, Monsieur,</p>
<p style="text-align:justify">Actuellement …, je souhaite rejoindre votre entreprise en tant que … Votre offre a immédiatement retenu mon attention car …</p>
<p style="text-align:justify">Au cours de mes expériences, j’ai développé … Ces compétences me permettront de contribuer à …</p>
<p style="text-align:justify">Motivé(e) et disponible, je serais ravi(e) de vous rencontrer pour échanger sur ma candidature.</p>
<p style="text-align:justify">Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.</p>
<p style="text-align:right">Signature</p>`,
  },
  {
    id: 'resignation', cat: 'Courrier', name: 'Lettre de démission', desc: 'Courrier simple avec préavis.', emoji: '📮', settings: { pageNumbers: false },
    html: () => `<p>Prénom NOM<br>Adresse · Code postal Ville</p>
<p style="text-align:right">Nom de l’entreprise<br>À l’attention de …</p>
<p style="text-align:right">Ville, le ${today()}</p>
<p><strong>Objet : démission</strong></p>
<p>Madame, Monsieur,</p>
<p style="text-align:justify">Par la présente, je vous informe de ma décision de démissionner du poste de … que j’occupe depuis le …</p>
<p style="text-align:justify">Conformément à mon contrat de travail, mon préavis de … débutera à la date de réception de ce courrier. Je reste à votre disposition pour organiser la transmission de mes dossiers.</p>
<p style="text-align:justify">Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.</p>
<p style="text-align:right">Signature</p>`,
  },
  {
    id: 'attestation', cat: 'Courrier', name: 'Attestation', desc: 'Attestation sur l’honneur à compléter.', emoji: '📜', settings: { pageNumbers: false },
    html: () => `<h1 style="text-align:center">ATTESTATION</h1>
<p></p>
<p style="text-align:justify">Je soussigné(e) <strong>Prénom NOM</strong>, né(e) le … à …, demeurant …,</p>
<p style="text-align:justify">atteste sur l’honneur que …</p>
<p style="text-align:justify">Cette attestation est établie pour servir et valoir ce que de droit.</p>
<p>Fait à …, le ${today()}</p>
<p style="text-align:right">Signature</p>`,
  },
  {
    id: 'report', cat: 'Professionnel', name: 'Rapport', desc: 'Page de titre, sections numérotées, tableau de synthèse.', emoji: '📊', settings: { footer: 'Rapport confidentiel', pageNumbers: true, pageNumberAlign: 'right' },
    html: () => `<h1 style="text-align:center">Titre du rapport</h1>
<p style="text-align:center"><em>Sous-titre — ${today()}</em></p>
<p style="text-align:center">Auteur · Service · Organisation</p>
<hr>
<h2>1. Introduction</h2>
<p style="text-align:justify">Présentez le contexte, les objectifs et le périmètre du rapport.</p>
<h2>2. Analyse</h2>
<h3>2.1 Constats</h3>
<ul><li>Premier constat</li><li>Deuxième constat</li></ul>
<h3>2.2 Données clés</h3>
${tbl(['Indicateur', 'Valeur', 'Évolution'], [[], []])}
<h2>3. Recommandations</h2>
<ol><li>Première recommandation</li><li>Deuxième recommandation</li></ol>
<h2>4. Conclusion</h2>
<p style="text-align:justify">…</p>`,
  },
  {
    id: 'minutes', cat: 'Professionnel', name: 'Compte rendu de réunion', desc: 'Participants, ordre du jour, décisions et actions.', emoji: '📝', settings: {},
    html: () => `<h1>Compte rendu de réunion</h1>
<p><strong>Date : </strong>${today()}<br><strong>Lieu : </strong>…<br><strong>Participants : </strong>…<br><strong>Rédacteur : </strong>…</p>
<h2>Ordre du jour</h2><ol><li>Point 1</li><li>Point 2</li></ol>
<h2>Décisions</h2><ul><li>…</li></ul>
<h2>Plan d’actions</h2>
${tbl(['Action', 'Responsable', 'Échéance'], [[], []])}
<p><strong>Prochaine réunion : </strong>…</p>`,
  },
  {
    id: 'agenda', cat: 'Professionnel', name: 'Ordre du jour', desc: 'Convocation et déroulé minuté d’une réunion.', emoji: '🗓️', settings: { pageNumbers: false },
    html: () => `<h1>Ordre du jour</h1>
<p><strong>Réunion : </strong>…<br><strong>Date et heure : </strong>${today()}, …h…<br><strong>Lieu / lien : </strong>…<br><strong>Animateur : </strong>…</p>
${tbl(['Heure', 'Sujet', 'Intervenant', 'Durée'], [['…h…', 'Accueil et introduction', '…', '5 min'], [], []])}
<h2>Documents à préparer</h2>
<ul>${task('Document 1')}</ul>`.replace('<ul><li data-type', '<ul data-type="taskList"><li data-type'),
  },
  {
    id: 'memo', cat: 'Professionnel', name: 'Note de service', desc: 'Communication interne courte et structurée.', emoji: '📌', settings: { header: 'Usage interne', pageNumbers: false },
    html: () => `<h1>NOTE DE SERVICE</h1>
<table><tbody><tr><td><p><strong>À :</strong></p></td><td><p>…</p></td></tr><tr><td><p><strong>De :</strong></p></td><td><p>…</p></td></tr><tr><td><p><strong>Date :</strong></p></td><td><p>${today()}</p></td></tr><tr><td><p><strong>Objet :</strong></p></td><td><p>…</p></td></tr></tbody></table><p></p>
<p style="text-align:justify">Corps de la note…</p>`,
  },
  {
    id: 'press', cat: 'Professionnel', name: 'Communiqué de presse', desc: 'Titre, chapeau, corps et contact presse.', emoji: '📰', settings: { pageNumbers: false },
    html: () => `<p><strong>COMMUNIQUÉ DE PRESSE</strong> — ${today()}</p>
<h1>Titre accrocheur du communiqué</h1>
<p><strong>Ville, date —</strong> <em>Chapeau : l’essentiel de l’information en deux phrases.</em></p>
<p style="text-align:justify">Développez ici l’annonce : qui, quoi, quand, où, pourquoi.</p>
<blockquote><p>« Citation d’un dirigeant ou d’un partenaire. » — Prénom NOM, fonction</p></blockquote>
<h3>À propos de l’organisation</h3><p style="text-align:justify">Présentation en quelques lignes.</p>
<h3>Contact presse</h3><p>Prénom NOM · e-mail · téléphone</p>`,
  },
  {
    id: 'proposal', cat: 'Professionnel', name: 'Proposition commerciale', desc: 'Contexte, offre, tarifs et prochaines étapes.', emoji: '🤝', settings: { footer: 'Proposition confidentielle', pageNumbers: true },
    html: () => `<h1 style="text-align:center">Proposition commerciale</h1>
<p style="text-align:center"><em>Préparée pour … — ${today()}</em></p><hr>
<h2>Contexte et enjeux</h2><p style="text-align:justify">…</p>
<h2>Notre proposition</h2><ul><li>Prestation 1</li><li>Prestation 2</li></ul>
<h2>Tarifs</h2>
${tbl(['Désignation', 'Quantité', 'Prix unitaire', 'Total'], [[], []])}
<h2>Calendrier</h2><p>…</p>
<h2>Prochaines étapes</h2><ol><li>Validation de la proposition</li><li>Signature</li><li>Lancement</li></ol>`,
  },
  {
    id: 'invoice', cat: 'Finance', name: 'Facture', desc: 'Émetteur, client, lignes et total à payer.', emoji: '🧾', settings: { pageNumbers: false },
    html: () => `<h1>FACTURE n° …</h1>
<p><strong>Date : </strong>${today()}<br><strong>Échéance : </strong>…</p>
<table><tbody><tr><td><p><strong>Émetteur</strong><br>Nom / Société<br>Adresse<br>SIRET : …<br>TVA : …</p></td><td><p><strong>Client</strong><br>Nom / Société<br>Adresse</p></td></tr></tbody></table><p></p>
${tbl(['Désignation', 'Qté', 'Prix unitaire HT', 'Total HT'], [[], [], []])}
<p style="text-align:right">Total HT : … €<br>TVA (…%) : … €<br><strong>Total TTC : … €</strong></p>
<p><em>Conditions de paiement : … Coordonnées bancaires (IBAN) : …</em></p>`,
  },
  {
    id: 'quote', cat: 'Finance', name: 'Devis', desc: 'Offre chiffrée valable 30 jours.', emoji: '💶', settings: { pageNumbers: false },
    html: () => `<h1>DEVIS n° …</h1>
<p><strong>Date : </strong>${today()}<br><strong>Validité : </strong>30 jours</p>
<table><tbody><tr><td><p><strong>Prestataire</strong><br>Nom / Société<br>Adresse</p></td><td><p><strong>Client</strong><br>Nom / Société<br>Adresse</p></td></tr></tbody></table><p></p>
${tbl(['Désignation', 'Qté', 'Prix unitaire HT', 'Total HT'], [[], [], []])}
<p style="text-align:right"><strong>Total TTC : … €</strong></p>
<p>Bon pour accord, le … <em>(signature précédée de la mention « Bon pour accord »)</em></p>`,
  },
  {
    id: 'cv', cat: 'Personnel', name: 'Curriculum vitæ', desc: 'Une page sobre avec expériences et compétences.', emoji: '👤', settings: { margins: { ...MARGIN_PRESETS.moderate.v }, pageNumbers: false },
    html: () => `<h1 style="text-align:center">Prénom NOM</h1>
<p style="text-align:center">Intitulé du poste recherché<br>Téléphone · E-mail · Ville</p><hr>
<h2>Expérience professionnelle</h2>
<p><strong>Poste — Entreprise</strong> <em>(2022 – aujourd’hui)</em></p><ul><li>Mission ou réalisation chiffrée</li><li>Mission ou réalisation chiffrée</li></ul>
<p><strong>Poste — Entreprise</strong> <em>(2019 – 2022)</em></p><ul><li>Mission ou réalisation chiffrée</li></ul>
<h2>Formation</h2><p><strong>Diplôme — Établissement</strong> <em>(année)</em></p>
<h2>Compétences</h2><ul><li>Compétence 1</li><li>Compétence 2</li><li>Langues : français (natif), anglais (courant)</li></ul>`,
  },
  {
    id: 'checklist', cat: 'Personnel', name: 'Liste de tâches', desc: 'Cases à cocher classées par priorité.', emoji: '✅', settings: { pageNumbers: false },
    html: () => `<h1>Liste de tâches</h1><p><em>${today()}</em></p>
<h2>Urgent</h2><ul data-type="taskList">${task('Tâche urgente')}${task('Autre tâche urgente')}</ul>
<h2>Cette semaine</h2><ul data-type="taskList">${task('Tâche 1')}${task('Tâche 2')}${task('Tâche terminée', true)}</ul>
<h2>Plus tard</h2><ul data-type="taskList">${task('Idée à explorer')}</ul>`,
  },
  {
    id: 'planner', cat: 'Personnel', name: 'Planning hebdomadaire', desc: 'Tableau jour par jour avec créneaux.', emoji: '📅', settings: { orientation: 'landscape', margins: { ...MARGIN_PRESETS.narrow.v }, pageNumbers: false },
    html: () => `<h1>Planning de la semaine</h1><p><em>Semaine du …</em></p>
${tbl(['Créneau', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'], [['Matin'], ['Midi'], ['Après-midi'], ['Soir']], 6)}`,
  },
];

export function templateSettings(t) {
  const d = pref.get('defaults', {}) || {};
  return {
    ...DEFAULT_SETTINGS, ...d, ...t.settings,
    margins: { ...DEFAULT_SETTINGS.margins, ...(d.margins || {}), ...(t.settings?.margins || {}) },
  };
}
