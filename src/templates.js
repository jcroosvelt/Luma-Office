// Modèles de documents professionnels.
import { DEFAULT_SETTINGS, MARGIN_PRESETS } from './layout.js';

const today = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export const TEMPLATES = [
  {
    id: 'blank', name: 'Document vierge', desc: 'Une page blanche pour démarrer.', emoji: '📄',
    html: () => '<p></p>', settings: {},
  },
  {
    id: 'letter', name: 'Lettre professionnelle', desc: 'Expéditeur, destinataire, objet, formule de politesse.', emoji: '✉️',
    html: () => `
<p>Prénom NOM<br>Adresse<br>Code postal Ville<br>Téléphone · E-mail</p>
<p style="text-align:right">Nom de l’entreprise<br>À l’attention de Madame / Monsieur …<br>Adresse<br>Code postal Ville</p>
<p style="text-align:right">Ville, le ${today()}</p>
<p><strong>Objet : </strong>…</p>
<p>Madame, Monsieur,</p>
<p style="text-align:justify">Je me permets de vous contacter au sujet de …</p>
<p style="text-align:justify">…</p>
<p style="text-align:justify">Dans l’attente de votre réponse, je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.</p>
<p style="text-align:right">Signature</p>`,
    settings: { pageNumbers: false },
  },
  {
    id: 'report', name: 'Rapport', desc: 'Page de titre, sections numérotées, tableau de synthèse.', emoji: '📊',
    html: () => `
<h1 style="text-align:center">Titre du rapport</h1>
<p style="text-align:center"><em>Sous-titre — ${today()}</em></p>
<p style="text-align:center">Auteur · Service · Organisation</p>
<hr>
<h2>1. Introduction</h2>
<p style="text-align:justify">Présentez le contexte, les objectifs et le périmètre du rapport.</p>
<h2>2. Analyse</h2>
<h3>2.1 Constats</h3>
<ul><li>Premier constat</li><li>Deuxième constat</li></ul>
<h3>2.2 Données clés</h3>
<table><tbody>
<tr><th><p>Indicateur</p></th><th><p>Valeur</p></th><th><p>Évolution</p></th></tr>
<tr><td><p>…</p></td><td><p>…</p></td><td><p>…</p></td></tr>
<tr><td><p>…</p></td><td><p>…</p></td><td><p>…</p></td></tr>
</tbody></table>
<p></p>
<h2>3. Recommandations</h2>
<ol><li>Première recommandation</li><li>Deuxième recommandation</li></ol>
<h2>4. Conclusion</h2>
<p style="text-align:justify">…</p>`,
    settings: { footer: 'Rapport confidentiel', pageNumbers: true, pageNumberAlign: 'right' },
  },
  {
    id: 'minutes', name: 'Compte rendu de réunion', desc: 'Participants, ordre du jour, décisions et actions.', emoji: '📝',
    html: () => `
<h1>Compte rendu de réunion</h1>
<p><strong>Date : </strong>${today()}<br><strong>Lieu : </strong>…<br><strong>Participants : </strong>…<br><strong>Rédacteur : </strong>…</p>
<h2>Ordre du jour</h2>
<ol><li>Point 1</li><li>Point 2</li></ol>
<h2>Décisions</h2>
<ul><li>…</li></ul>
<h2>Plan d’actions</h2>
<table><tbody>
<tr><th><p>Action</p></th><th><p>Responsable</p></th><th><p>Échéance</p></th></tr>
<tr><td><p>…</p></td><td><p>…</p></td><td><p>…</p></td></tr>
<tr><td><p>…</p></td><td><p>…</p></td><td><p>…</p></td></tr>
</tbody></table>
<p></p>
<p><strong>Prochaine réunion : </strong>…</p>`,
    settings: {},
  },
  {
    id: 'cv', name: 'Curriculum vitæ', desc: 'Une page sobre avec expériences et compétences.', emoji: '👤',
    html: () => `
<h1 style="text-align:center">Prénom NOM</h1>
<p style="text-align:center">Intitulé du poste recherché<br>Téléphone · E-mail · Ville</p>
<hr>
<h2>Expérience professionnelle</h2>
<p><strong>Poste — Entreprise</strong> <em>(2022 – aujourd’hui)</em></p>
<ul><li>Mission ou réalisation chiffrée</li><li>Mission ou réalisation chiffrée</li></ul>
<p><strong>Poste — Entreprise</strong> <em>(2019 – 2022)</em></p>
<ul><li>Mission ou réalisation chiffrée</li></ul>
<h2>Formation</h2>
<p><strong>Diplôme — Établissement</strong> <em>(année)</em></p>
<h2>Compétences</h2>
<ul><li>Compétence 1</li><li>Compétence 2</li><li>Langues : français (natif), anglais (courant)</li></ul>`,
    settings: { margins: { ...MARGIN_PRESETS.moderate.v }, pageNumbers: false },
  },
  {
    id: 'memo', name: 'Note de service', desc: 'Communication interne courte et structurée.', emoji: '📌',
    html: () => `
<h1>NOTE DE SERVICE</h1>
<table><tbody>
<tr><td><p><strong>À :</strong></p></td><td><p>…</p></td></tr>
<tr><td><p><strong>De :</strong></p></td><td><p>…</p></td></tr>
<tr><td><p><strong>Date :</strong></p></td><td><p>${today()}</p></td></tr>
<tr><td><p><strong>Objet :</strong></p></td><td><p>…</p></td></tr>
</tbody></table>
<p></p>
<p style="text-align:justify">Corps de la note…</p>`,
    settings: { header: 'Usage interne', pageNumbers: false },
  },
];

export const templateSettings = (t) => ({ ...DEFAULT_SETTINGS, ...t.settings, margins: { ...DEFAULT_SETTINGS.margins, ...(t.settings.margins || {}) } });
