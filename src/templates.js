// Modèles de documents professionnels et personnels : mise en page soignée (bandeaux, tableaux colorés, encadrés) et contenu prêt à compléter.
import { DEFAULT_SETTINGS, MARGIN_PRESETS } from './layout.js';
import { pref } from './storage.js';

const today = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const year = () => new Date().getFullYear();

/* ---------- palette et briques de mise en page ---------- */
const C = { navy: '#1f3864', blue: '#0b57d0', teal: '#0f766e', green: '#2e7d32', red: '#b3261e', gold: '#b7791f', plum: '#6b2d5c', slate: '#334155', gray: '#5f6b7a', light: '#eef2f9', zebra: '#f5f8fd', white: '#ffffff' };
const sp = (t, o = {}) => {
  const st = [o.c && `color:${o.c}`, o.s && `font-size:${o.s}pt`, o.f && `font-family:${o.f}`].filter(Boolean).join(';');
  let r = st ? `<span style="${st}">${t}</span>` : t;
  if (o.b) r = `<strong>${r}</strong>`;
  if (o.i) r = `<em>${r}</em>`;
  return r;
};
const cell = (inner, { bg, w, span } = {}) => `<td${bg ? ` data-bg="${bg}" style="background-color:${bg}"` : ''}${w ? ` colwidth="${w}"` : ''}${span ? ` colspan="${span}"` : ''}>${inner}</td>`;
const P = (t, a = '') => `<p${a ? ` style="text-align:${a}"` : ''}>${t}</p>`;
const J = (t) => P(t, 'justify');
const H2 = (t, c = C.navy) => `<h2>${sp(t, { c })}</h2>`;
const H3 = (t, c = C.navy) => `<h3>${sp(t, { c })}</h3>`;
const ul = (a) => `<ul>${a.map((x) => `<li><p>${x}</p></li>`).join('')}</ul>`;
const ol = (a) => `<ol>${a.map((x) => `<li><p>${x}</p></li>`).join('')}</ol>`;
const task = (t, c = false) => `<li data-type="taskItem" data-checked="${c}"><p>${t}</p></li>`;
const tasks = (a) => `<ul data-type="taskList">${a.map((x) => (Array.isArray(x) ? task(x[0], x[1]) : task(x))).join('')}</ul>`;
const rule = (c = C.navy) => `<hr data-color="${c}" data-weight="2.5">`;

// Bandeau coloré pleine largeur (titre de couverture)
const banner = (title, sub, fill = C.navy, meta = '') => `<table data-borderless><tbody><tr>${cell(`<p></p><p style="text-align:center">${sp(title, { c: C.white, s: 26, b: true })}</p>${sub ? `<p style="text-align:center">${sp(sub, { c: '#dbe6ff', s: 12 })}</p>` : ''}${meta ? `<p style="text-align:center">${sp(meta, { c: '#c4d4f5', s: 10 })}</p>` : ''}<p></p>`, { bg: fill })}</tr></tbody></table><p></p>`;
// Bandeau de section (titre blanc sur fond couleur)
const bar = (t, fill = C.navy) => `<table data-borderless><tbody><tr>${cell(`<p>${sp(t.toUpperCase(), { c: C.white, b: true, s: 11 })}</p>`, { bg: fill })}</tr></tbody></table><p></p>`;
// Tableau avec en-tête coloré, lignes alternées et ligne de total facultative
const tb = (head, rows, { fill = C.navy, w: w0 = [], zebra = true, total, align } = {}) => {
  // la colonne la plus large reste libre : le tableau occupe ainsi toute la largeur utile
  const wide = w0.length ? w0.indexOf(Math.max(...w0)) : -1;
  const w = w0.map((x, i) => (i === wide ? undefined : x));
  const cl = (i) => (align && align[i] ? ` style="text-align:${align[i]}"` : '');
  const hr = `<tr>${head.map((x, i) => cell(`<p${cl(i)}>${sp(x, { c: C.white, b: true })}</p>`, { bg: fill, w: w[i] })).join('')}</tr>`;
  const body = rows.map((r, ri) => `<tr>${head.map((_, i) => cell(`<p${cl(i)}>${r[i] ?? ''}</p>`, { bg: zebra && ri % 2 ? C.zebra : undefined })).join('')}</tr>`).join('');
  const tot = total ? `<tr>${head.map((_, i) => cell(`<p${cl(i)}>${total[i] ? sp(total[i], { b: true }) : ''}</p>`, { bg: C.light })).join('')}</tr>` : '';
  return `<table><tbody>${hr}${body}${tot}</tbody></table><p></p>`;
};
// Fiche libellé / valeur
const kv = (rows, w = 150, fill = C.light) => `<table><tbody>${rows.map(([k, v]) => `<tr>${cell(`<p>${sp(k, { b: true })}</p>`, { bg: fill, w })}${cell(`<p>${v}</p>`)}</tr>`).join('')}</tbody></table><p></p>`;
// Mise en page en colonnes sans bordures
const cols = (...cells2) => `<table data-borderless><tbody><tr>${cells2.map((c) => (typeof c === 'string' ? cell(c) : cell(c.html, c))).join('')}</tr></tbody></table><p></p>`;
// Encadré (zone de texte)
const note = (html, fill = '#eaf2ff', border = C.blue) => `<div data-textbox="" data-fill="${fill}" data-border="${border}" data-width="100" data-accent="1">${html}</div>`;
const sign = (...who) => cols(...who.map((w) => `<p>${sp(w, { b: true })}</p><p>Date et signature :</p><p></p><p></p>`));

export const CAT_ICON = { Courrier: 'mail', Professionnel: 'file', Finance: 'stats', Personnel: 'star', 'Éducation': 'book', Juridique: 'pborder', 'Événement': 'calendar' };
export const CATEGORIES = ['Courrier', 'Professionnel', 'Finance', 'Personnel', 'Éducation', 'Juridique', 'Événement'];

const ME = `<p>${sp('Prénom NOM', { b: true, s: 12, c: C.navy })}<br>Adresse<br>Code postal Ville<br>Téléphone · E-mail</p>`;
const TO = (who = 'Nom de l’entreprise') => `<p style="text-align:right">${sp(who, { b: true })}<br>À l’attention de Madame / Monsieur …<br>Adresse<br>Code postal Ville</p>`;
const WHEN = `<p style="text-align:right">Ville, le ${today()}</p>`;
const OBJ = (t) => `<p>${sp('Objet : ', { b: true, c: C.navy })}${sp(t, { b: true })}</p>`;
const BYE = J('Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.');
const SIG = P('Signature<br><br>Prénom NOM', 'right');

export const TEMPLATES = [
  { id: 'blank', cat: 'Personnel', name: 'Document vierge', desc: 'Une page blanche pour démarrer.', settings: {}, html: () => '<p></p>' },

  /* ===================== COURRIER ===================== */
  {
    id: 'letter', cat: 'Courrier', name: 'Lettre professionnelle', desc: 'Expéditeur, destinataire, objet, références et formule de politesse.', settings: { pageNumbers: false },
    html: () => `${cols({ html: ME, w: 300 }, TO())}${rule()}${WHEN}
<p>${sp('N/Réf. : ', { b: true })}… &nbsp;&nbsp;${sp('V/Réf. : ', { b: true })}…<br>${sp('P.J. : ', { b: true })}… document(s) joint(s)</p>
${OBJ('…')}
<p>Madame, Monsieur,</p>
${J('Je me permets de vous contacter au sujet de … Faisant suite à notre échange du …, je souhaite vous exposer les points suivants.')}
${J('Premier point : … Second point : … Je reste naturellement à votre disposition pour tout complément d’information.')}
${J('Dans l’attente de votre réponse, je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.')}
${SIG}`,
  },
  {
    id: 'motivation', cat: 'Courrier', name: 'Lettre de motivation', desc: 'Candidature percutante : accroche, apport, motivation, conclusion.', settings: { pageNumbers: false },
    html: () => `${cols({ html: ME, w: 300 }, TO('Nom de l’entreprise<br>Service des ressources humaines'))}${rule(C.blue)}${WHEN}
${OBJ('candidature au poste de … (réf. …)')}
<p>Madame, Monsieur,</p>
${J('<strong>Pourquoi vous ?</strong> Votre offre de … publiée sur … a immédiatement retenu mon attention : votre entreprise, reconnue pour …, correspond précisément à mes aspirations professionnelles.')}
${J('<strong>Ce que j’apporte.</strong> Actuellement …, j’ai développé au cours de … années une solide expérience en … J’ai notamment … (résultat chiffré), ce qui m’a permis de … Autonome, rigoureux(se) et attaché(e) au travail d’équipe, je saurai m’intégrer rapidement à vos équipes.')}
${J('<strong>Ce que je recherche.</strong> Rejoindre votre structure représente pour moi l’opportunité de … et de contribuer à …')}
${J('Je serais ravi(e) de vous rencontrer afin d’échanger sur ma candidature et reste disponible à votre convenance.')}
${BYE}
${SIG}`,
  },
  {
    id: 'resignation', cat: 'Courrier', name: 'Lettre de démission', desc: 'Courrier clair avec préavis et transmission des dossiers.', settings: { pageNumbers: false },
    html: () => `${cols({ html: ME, w: 300 }, TO())}${rule(C.gray)}${WHEN}
${OBJ('démission')}
${P(sp('Lettre recommandée avec accusé de réception (ou remise en main propre contre décharge)', { i: true, c: C.gray, s: 9 }))}
<p>Madame, Monsieur,</p>
${J('Par la présente, je vous informe de ma décision de démissionner du poste de <strong>…</strong> que j’occupe au sein de votre entreprise depuis le …')}
${J('Conformément à mon contrat de travail et à la convention collective, mon préavis de <strong>… mois</strong> débutera à la date de première présentation de ce courrier. Mon dernier jour de travail effectif sera donc le …')}
${J('Je m’engage à assurer la transmission de mes dossiers en cours et reste à votre disposition pour organiser mon départ dans les meilleures conditions. Je vous remercie pour la confiance accordée durant ces années.')}
${BYE}
${SIG}`,
  },
  {
    id: 'attestation', cat: 'Courrier', name: 'Attestation sur l’honneur', desc: 'Attestation encadrée à compléter, avec mention légale.', settings: { pageNumbers: false, pageBorder: { style: 'double', color: C.navy, width: 1.2, offset: 1 } },
    html: () => `<p></p>${P(sp('ATTESTATION SUR L’HONNEUR', { c: C.navy, s: 24, b: true }), 'center')}${P(sp('— ' + year() + ' —', { c: C.gray }), 'center')}<p></p>
${J('Je soussigné(e) <strong>Prénom NOM</strong>, né(e) le … à …, de nationalité …, demeurant au …,')}
${J('<strong>atteste sur l’honneur</strong> que …')}
${J('Cette attestation est établie pour servir et valoir ce que de droit.')}
${note(P(sp('Je suis informé(e) que toute fausse déclaration m’expose à des sanctions pénales (art. 441-7 du Code pénal).', { i: true, s: 10 })), '#fff8e6', C.gold)}
<p>Fait à …, le ${today()}</p>
${SIG}`,
  },
  {
    id: 'complaint', cat: 'Courrier', name: 'Lettre de réclamation', desc: 'Réclamation argumentée avec demande précise et délai.', settings: { pageNumbers: false },
    html: () => `${cols({ html: ME, w: 300 }, TO('Nom du service client'))}${rule(C.red)}${WHEN}
${OBJ('réclamation — commande / contrat n° …')}
<p>Madame, Monsieur,</p>
${J('Le …, j’ai commandé / souscrit … (référence : …) pour un montant de … €. Malheureusement, <strong>…</strong> (décrivez le problème de manière factuelle).')}
${note(`<p>${sp('Récapitulatif', { b: true })}</p>${ul(['Date de l’achat / du contrat : …', 'Numéro de commande : …', 'Problème constaté : …', 'Démarches déjà effectuées : …'])}`, '#fdecea', C.red)}
${J('En conséquence, je vous demande de bien vouloir <strong>(remplacer / rembourser / réparer / résilier)</strong> … dans un délai de <strong>15 jours</strong> à compter de la réception de ce courrier. À défaut, je me verrais contraint(e) de saisir le médiateur compétent ou les services de la DGCCRF.')}
${J('Vous trouverez ci-joint copie des justificatifs : facture, échanges, photographies.')}
${BYE}
${SIG}`,
  },
  {
    id: 'cancel', cat: 'Courrier', name: 'Résiliation d’abonnement / contrat', desc: 'Lettre de résiliation avec référence contrat et accusé de réception.', settings: { pageNumbers: false },
    html: () => `${cols({ html: ME, w: 300 }, TO('Nom de l’organisme'))}${rule(C.gray)}${WHEN}
${OBJ('résiliation du contrat n° …')}
${P(sp('Envoi en recommandé avec accusé de réception', { i: true, c: C.gray, s: 9 }))}
<p>Madame, Monsieur,</p>
${J('Titulaire du contrat n° <strong>…</strong> souscrit le … (offre : …), je vous informe de ma décision de <strong>le résilier</strong> à compter du … , dans le respect du préavis de … prévu par les conditions générales.')}
${J('Je vous remercie de bien vouloir m’adresser une confirmation écrite de cette résiliation ainsi que le décompte de clôture. Merci également de restituer / supprimer … (matériel, données, mandat de prélèvement).')}
${BYE}
${SIG}`,
  },
  {
    id: 'leave', cat: 'Courrier', name: 'Demande de congés', desc: 'Demande formelle avec dates, remplaçant et validation hiérarchique.', settings: { pageNumbers: false },
    html: () => `${cols({ html: ME, w: 300 }, TO('Direction / Responsable'))}${rule(C.teal)}${WHEN}
${OBJ('demande de congés')}
<p>Madame, Monsieur,</p>
${J('Je souhaite poser des congés <strong>du … au … inclus</strong>, soit … jours ouvrés, avec reprise le …')}
${kv([['Type de congé', 'Congés payés / RTT / Sans solde'], ['Solde disponible', '… jours'], ['Remplaçant(e) / relais', '…'], ['Dossiers en cours', '…']])}
${J('Je prendrai soin de transmettre mes dossiers avant mon départ. Je vous remercie par avance de votre réponse.')}
${BYE}
${SIG}
${H3('Réponse de la direction', C.teal)}
${cols('<p>☐ Accordé &nbsp;&nbsp; ☐ Refusé &nbsp;&nbsp; ☐ À reporter</p><p>Motif : …</p>', '<p>Date et visa :</p><p></p>')}`,
  },
  {
    id: 'reference', cat: 'Courrier', name: 'Lettre de recommandation', desc: 'Recommandation chaleureuse et factuelle pour un collaborateur.', settings: { pageNumbers: false },
    html: () => `${cols({ html: `<p>${sp('Nom de l’entreprise', { b: true, c: C.navy, s: 13 })}<br>Adresse · Téléphone · E-mail</p>`, w: 300 }, `<p style="text-align:right">Ville, le ${today()}</p>`)}${rule(C.gold)}
${P(sp('LETTRE DE RECOMMANDATION', { b: true, c: C.navy, s: 18 }), 'center')}
<p>À qui de droit,</p>
${J('Je soussigné(e) <strong>Prénom NOM</strong>, <em>fonction</em> au sein de …, ai eu le plaisir de travailler avec <strong>Prénom NOM</strong> en qualité de … du … au …')}
${J('Durant cette période, <strong>Prénom</strong> a fait preuve d’un sens remarquable de … Parmi ses réalisations : …')}
${ul(['Réalisation ou qualité n° 1', 'Réalisation ou qualité n° 2', 'Réalisation ou qualité n° 3'])}
${J('Je recommande vivement <strong>Prénom</strong> sans réserve et reste à votre disposition pour tout renseignement complémentaire.')}
${SIG}`,
  },

  /* ===================== PROFESSIONNEL ===================== */
  {
    id: 'report', cat: 'Professionnel', name: 'Rapport', desc: 'Couverture, résumé, analyse chiffrée, recommandations et annexes.', settings: { footer: 'Rapport confidentiel', pageNumbers: true, pageNumberAlign: 'right' },
    html: () => `${banner('Titre du rapport', 'Sous-titre ou période couverte', C.navy, `${today()} · Auteur · Service · Organisation`)}
${H2('Résumé exécutif')}
${note(P(sp('À retenir : ', { b: true }) + 'les trois messages clés du rapport, en quelques lignes.'), '#eaf2ff', C.blue)}
${H2('1. Introduction')}${J('Présentez le contexte, les objectifs, le périmètre et la méthode retenue.')}
${H2('2. Analyse')}${H3('2.1 Constats')}${ul(['Premier constat, étayé par un chiffre', 'Deuxième constat', 'Troisième constat'])}
${H3('2.2 Indicateurs clés')}
${tb(['Indicateur', 'Objectif', 'Réalisé', 'Évolution'], [['Chiffre d’affaires', '… €', '… €', '▲ …%'], ['Satisfaction client', '… / 10', '… / 10', '▲ …'], ['Délai moyen', '… jours', '… jours', '▼ …']], { align: ['left', 'right', 'right', 'right'] })}
${H2('3. Recommandations')}${ol(['Première recommandation — responsable, échéance', 'Deuxième recommandation', 'Troisième recommandation'])}
${H2('4. Conclusion')}${J('Synthèse et prochaines étapes.')}
${H2('Annexes')}${P(sp('Annexe A — … · Annexe B — …', { c: C.gray }))}`,
  },
  {
    id: 'minutes', cat: 'Professionnel', name: 'Compte rendu de réunion', desc: 'Fiche d’identité, discussions, décisions et plan d’actions.', settings: { footer: 'Compte rendu de réunion', pageNumbers: true },
    html: () => `${banner('Compte rendu de réunion', 'Intitulé de la réunion', C.slate)}
${kv([['Date et heure', `${today()}, …h… – …h…`], ['Lieu / lien', '…'], ['Animateur', '…'], ['Rédacteur', '…'], ['Présents', '…'], ['Absents / excusés', '…']])}
${H2('Ordre du jour')}${ol(['Point 1 — …', 'Point 2 — …', 'Questions diverses'])}
${H2('Points abordés')}${H3('Point 1 — …')}${J('Résumé des échanges.')}${H3('Point 2 — …')}${J('Résumé des échanges.')}
${H2('Décisions prises')}${ul(['Décision 1', 'Décision 2'])}
${H2('Plan d’actions')}
${tb(['Action', 'Responsable', 'Échéance', 'Statut'], [['…', '…', '…', 'À faire'], ['…', '…', '…', 'À faire'], ['…', '…', '…', 'Fait']], { fill: C.slate, w: [260, 120, 100, 100] })}
${note(P(sp('Prochaine réunion : ', { b: true }) + '… à …h… — Lieu : …'), '#f1f5f9', C.slate)}`,
  },
  {
    id: 'agenda', cat: 'Professionnel', name: 'Ordre du jour', desc: 'Convocation et déroulé minuté d’une réunion.', settings: { pageNumbers: false },
    html: () => `${banner('Ordre du jour', 'Réunion de …', C.blue)}
${kv([['Date et heure', `${today()}, …h…`], ['Lieu / lien visio', '…'], ['Animateur', '…'], ['Participants', '…']])}
${H2('Déroulé', C.blue)}
${tb(['Heure', 'Sujet', 'Intervenant', 'Durée'], [['…h…', 'Accueil et introduction', '…', '5 min'], ['…h…', 'Point d’avancement', '…', '20 min'], ['…h…', 'Décisions à prendre', '…', '25 min'], ['…h…', 'Questions diverses', '…', '10 min']], { fill: C.blue, w: [80, 280, 140, 80] })}
${H2('À préparer avant la réunion', C.blue)}${tasks(['Lire le compte rendu précédent', 'Préparer le point …', 'Apporter …'])}`,
  },
  {
    id: 'memo', cat: 'Professionnel', name: 'Note de service', desc: 'Communication interne courte avec en-tête structuré.', settings: { header: 'Usage interne', pageNumbers: false },
    html: () => `${bar('Note de service', C.navy)}
${kv([['À', 'Ensemble du personnel / Service …'], ['De', 'Direction / Prénom NOM'], ['Date', today()], ['Objet', '…'], ['Référence', 'NS-' + year() + '-…']], 90)}
${J('Madame, Monsieur,')}
${J('Nous vous informons que … à compter du … Cette mesure a pour objectif de …')}
${H3('Ce qui change')}${ul(['…', '…'])}
${H3('Ce que vous devez faire')}${ol(['…', '…'])}
${note(P(sp('Contact : ', { b: true }) + 'Prénom NOM — poste … — e-mail'), '#eaf2ff', C.blue)}
${J('Nous comptons sur votre collaboration.')}`,
  },
  {
    id: 'press', cat: 'Professionnel', name: 'Communiqué de presse', desc: 'Titre, chapeau, citation, à propos et contact presse.', settings: { pageNumbers: false },
    html: () => `${cols({ html: P(sp('COMMUNIQUÉ DE PRESSE', { b: true, c: C.red, s: 12 })), w: 330 }, P(`Pour diffusion immédiate — ${today()}`, 'right'))}${rule(C.red)}
<h1>${sp('Titre accrocheur : le verbe fort, le chiffre clé, le bénéfice', { c: C.navy })}</h1>
${P(sp('Ville, ' + today() + ' — ', { b: true }) + sp('Chapeau : l’essentiel de l’annonce en deux phrases (qui, quoi, quand, où).', { i: true, s: 12 }))}
${J('Développez l’annonce : contexte, enjeu, caractéristiques principales, calendrier. Privilégiez des phrases courtes et des chiffres vérifiables.')}
<blockquote><p>« Citation d’un dirigeant ou d’un partenaire qui apporte un point de vue. » — <strong>Prénom NOM</strong>, fonction</p></blockquote>
${J('Disponibilité, prix, lieux, prochaines étapes.')}
${note(`<p>${sp('À propos de …', { b: true, c: C.navy })}</p>${P('Présentation de l’organisation en 3 lignes : mission, chiffres clés, site web.')}`, '#f1f5f9', C.slate)}
${H3('Contact presse', C.red)}${P('Prénom NOM · fonction · e-mail · téléphone')}`,
  },
  {
    id: 'proposal', cat: 'Professionnel', name: 'Proposition commerciale', desc: 'Offre complète : enjeux, solution, tarifs, planning et validation.', settings: { footer: 'Proposition confidentielle', pageNumbers: true },
    html: () => `${banner('Proposition commerciale', 'Préparée pour … — Projet …', C.teal, `${today()} · Validité 30 jours`)}
${H2('Comprendre vos enjeux', C.teal)}${J('Reformulez le contexte et les objectifs du client pour démontrer votre compréhension.')}
${H2('Notre solution', C.teal)}${cols('<p>' + sp('✓ Prestation 1', { b: true }) + '<br>Description et bénéfice.</p>', '<p>' + sp('✓ Prestation 2', { b: true }) + '<br>Description et bénéfice.</p>', '<p>' + sp('✓ Prestation 3', { b: true }) + '<br>Description et bénéfice.</p>')}
${H2('Investissement', C.teal)}
${tb(['Désignation', 'Qté', 'Prix unitaire', 'Total HT'], [['Prestation 1', '1', '… €', '… €'], ['Prestation 2', '…', '… €', '… €'], ['Prestation 3', '…', '… €', '… €']], { fill: C.teal, w: [280, 70, 120, 120], align: ['left', 'right', 'right', 'right'], total: ['Total HT', '', '', '… €'] })}
${H2('Calendrier', C.teal)}${tb(['Phase', 'Livrable', 'Date'], [['Cadrage', '…', '…'], ['Réalisation', '…', '…'], ['Livraison', '…', '…']], { fill: C.teal })}
${H2('Pourquoi nous choisir', C.teal)}${ul(['Expérience : … projets similaires', 'Équipe dédiée et réactive', 'Garantie de résultat / de délai'])}
${H2('Validation', C.teal)}${P('Pour accepter cette proposition, merci de retourner un exemplaire signé.')}${sign('Pour le client', 'Pour le prestataire')}`,
  },
  {
    id: 'businessplan', cat: 'Professionnel', name: 'Plan d’affaires', desc: 'Business plan structuré : marché, offre, stratégie, prévisions financières.', settings: { footer: 'Plan d’affaires — confidentiel', pageNumbers: true },
    html: () => `${banner('Plan d’affaires', 'Nom du projet / de l’entreprise', C.navy, `Version ${year()} · Porteur de projet : Prénom NOM`)}
${H2('1. Synthèse du projet')}${note(P(sp('Le projet en une phrase : ', { b: true }) + '… pour … afin de …'), '#eaf2ff', C.blue)}
${H2('2. L’équipe')}${tb(['Nom', 'Rôle', 'Expérience clé'], [['Prénom NOM', 'Dirigeant', '…'], ['Prénom NOM', '…', '…']])}
${H2('3. Le marché')}${ul(['Taille du marché et croissance : …', 'Cible et segments : …', 'Concurrents principaux : …'])}
${H2('4. L’offre')}${J('Produits / services, proposition de valeur, avantage concurrentiel, tarification.')}
${H2('5. Stratégie commerciale')}${ol(['Acquisition : …', 'Fidélisation : …', 'Partenariats : …'])}
${H2('6. Organisation et moyens')}${J('Locaux, outils, prestataires, calendrier de lancement.')}
${H2('7. Prévisions financières')}
${tb(['En k€', 'Année 1', 'Année 2', 'Année 3'], [['Chiffre d’affaires', '…', '…', '…'], ['Charges', '…', '…', '…']], { align: ['left', 'right', 'right', 'right'], total: ['Résultat', '…', '…', '…'] })}
${H2('8. Financement')}${tb(['Besoins', 'Montant', 'Ressources', 'Montant'], [['Investissements', '… €', 'Apport personnel', '… €'], ['Trésorerie de départ', '… €', 'Prêt bancaire', '… €']], { total: ['Total', '… €', 'Total', '… €'] })}
${H2('9. Risques et plan B')}${ul(['Risque 1 → mesure', 'Risque 2 → mesure'])}`,
  },
  {
    id: 'specs', cat: 'Professionnel', name: 'Cahier des charges', desc: 'Besoins, périmètre, exigences, livrables, planning et validation.', settings: { footer: 'Cahier des charges', pageNumbers: true },
    html: () => `${banner('Cahier des charges', 'Projet …', C.slate, `Version 1.0 · ${today()}`)}
${kv([['Client / Commanditaire', '…'], ['Chef de projet', '…'], ['Date de remise souhaitée', '…'], ['Budget indicatif', '… €']], 190)}
${H2('1. Contexte et objectifs')}${J('Situation actuelle, problème à résoudre, objectifs mesurables.')}
${H2('2. Périmètre')}${cols('<p>' + sp('Inclus', { b: true, c: C.green }) + '</p>' + ul(['…', '…']), '<p>' + sp('Exclu', { b: true, c: C.red }) + '</p>' + ul(['…', '…']))}
${H2('3. Exigences')}${tb(['Réf.', 'Exigence', 'Priorité', 'Critère d’acceptation'], [['EX-01', '…', 'Haute', '…'], ['EX-02', '…', 'Moyenne', '…'], ['EX-03', '…', 'Basse', '…']], { fill: C.slate, w: [60, 270, 80, 220] })}
${H2('4. Livrables et planning')}${tb(['Jalon', 'Livrable', 'Date'], [['J1 — Cadrage', '…', '…'], ['J2 — Version bêta', '…', '…'], ['J3 — Livraison', '…', '…']], { fill: C.slate })}
${H2('5. Contraintes et risques')}${ul(['Contrainte technique / réglementaire : …', 'Risque : … → plan de mitigation'])}
${H2('6. Validation')}${sign('Le client', 'Le prestataire')}`,
  },
  {
    id: 'jobdesc', cat: 'Professionnel', name: 'Fiche de poste / Offre d’emploi', desc: 'Mission, responsabilités, profil recherché et conditions.', settings: { pageNumbers: false },
    html: () => `${banner('Intitulé du poste', 'CDI · Temps plein · Ville', C.blue, 'Entreprise · Service · Rattachement hiérarchique')}
${H2('Notre entreprise', C.blue)}${J('Présentation en 3 lignes : secteur, taille, valeurs, ambition.')}
${H2('Vos missions', C.blue)}${ul(['Mission principale : …', 'Piloter …', 'Collaborer avec …', 'Assurer le suivi de …'])}
${H2('Votre profil', C.blue)}${cols('<p>' + sp('Indispensable', { b: true }) + '</p>' + ul(['Formation : …', 'Expérience : … ans', 'Compétence clé : …']), '<p>' + sp('Un plus', { b: true }) + '</p>' + ul(['Langue : anglais', 'Outil : …']))}
${H2('Ce que nous offrons', C.blue)}${tb(['Rémunération', 'Avantages', 'Cadre de travail'], [['… k€ brut / an', 'Mutuelle, titres-restaurant, RTT', 'Télétravail partiel · Locaux …']], { fill: C.blue })}
${note(P(sp('Comment postuler ? ', { b: true }) + 'Envoyez votre CV et une lettre de motivation à … avant le …'), '#eaf2ff', C.blue)}`,
  },
  {
    id: 'project', cat: 'Professionnel', name: 'Charte de projet', desc: 'Objectifs, parties prenantes, jalons, budget et risques sur une page.', settings: { orientation: 'portrait', pageNumbers: true, footer: 'Charte de projet' },
    html: () => `${banner('Charte de projet', 'Nom du projet', C.plum, `Sponsor : … · Chef de projet : … · ${today()}`)}
${H2('Vision et objectifs', C.plum)}${note(P(sp('Objectif SMART : ', { b: true }) + 'd’ici le …, atteindre … mesuré par …'), '#f6ecf4', C.plum)}
${H2('Parties prenantes', C.plum)}${tb(['Nom', 'Rôle', 'Attentes', 'Influence'], [['…', 'Sponsor', '…', 'Forte'], ['…', 'Chef de projet', '…', 'Forte'], ['…', 'Équipe', '…', 'Moyenne']], { fill: C.plum })}
${H2('Jalons', C.plum)}${tb(['Jalon', 'Date', 'Responsable', 'Statut'], [['Lancement', '…', '…', 'En cours'], ['Livraison phase 1', '…', '…', 'À surveiller'], ['Clôture', '…', '…', 'À venir']], { fill: C.plum })}
${H2('Budget', C.plum)}${tb(['Poste', 'Prévu', 'Engagé', 'Reste'], [['Ressources humaines', '… €', '… €', '… €'], ['Matériel / logiciels', '… €', '… €', '… €']], { fill: C.plum, align: ['left', 'right', 'right', 'right'], total: ['Total', '… €', '… €', '… €'] })}
${H2('Risques', C.plum)}${tb(['Risque', 'Probabilité', 'Impact', 'Action'], [['…', 'Moyenne', 'Fort', '…'], ['…', 'Faible', 'Moyen', '…']], { fill: C.plum })}`,
  },
  {
    id: 'swot', cat: 'Professionnel', name: 'Analyse SWOT', desc: 'Forces, faiblesses, opportunités et menaces en matrice 2 × 2.', settings: { orientation: 'landscape', margins: { ...MARGIN_PRESETS.moderate.v }, pageNumbers: false },
    html: () => `${banner('Analyse SWOT', 'Sujet : … — ' + today(), C.navy)}
<table data-borderless><tbody>
<tr>${cell('<p>' + sp('FORCES (interne +)', { b: true, c: C.green, s: 13 }) + '</p>' + ul(['…', '…', '…']), { bg: '#e8f5e9' })}${cell('<p>' + sp('FAIBLESSES (interne −)', { b: true, c: C.red, s: 13 }) + '</p>' + ul(['…', '…', '…']), { bg: '#fdecea' })}</tr>
<tr>${cell('<p>' + sp('OPPORTUNITÉS (externe +)', { b: true, c: C.blue, s: 13 }) + '</p>' + ul(['…', '…', '…']), { bg: '#e8f0fe' })}${cell('<p>' + sp('MENACES (externe −)', { b: true, c: C.gold, s: 13 }) + '</p>' + ul(['…', '…', '…']), { bg: '#fff4e0' })}</tr>
</tbody></table><p></p>
${H3('Conclusions et plan d’actions')}${ol(['S’appuyer sur … pour saisir …', 'Corriger … afin de limiter …'])}`,
  },
  {
    id: 'newsletter', cat: 'Professionnel', name: 'Lettre d’information', desc: 'Newsletter en deux colonnes : édito, actualités, agenda.', settings: { columns: { count: 2, gap: 1.0, rule: true }, pageNumbers: false, margins: { ...MARGIN_PRESETS.moderate.v } },
    html: () => `<h1>${sp('La Lettre', { c: C.blue })}</h1>
${P(sp('N° … · ' + today() + ' · Notre organisation', { c: C.gray, s: 10 }))}${rule(C.blue)}
${H2('L’édito', C.blue)}${J('Quelques mots du responsable pour ouvrir le numéro : ton chaleureux, une idée forte, un remerciement.')}
${H2('À la une', C.blue)}${J('<strong>Titre de l’article principal.</strong> Résumé de l’actualité en quelques phrases, avec un chiffre ou une citation marquante. Lire la suite sur …')}
<div data-column-break=""><span>Saut de colonne</span></div><p></p>
${H2('En bref', C.blue)}${ul(['Actualité courte n° 1', 'Actualité courte n° 2', 'Actualité courte n° 3'])}
${note(P(sp('Agenda', { b: true, c: C.blue })) + ul(['… — date, lieu', '… — date, lieu']), '#eaf2ff', C.blue)}
${H2('Le saviez-vous ?', C.blue)}${J('Une anecdote, un conseil pratique ou une statistique surprenante.')}
${P(sp('Contact : … · Se désabonner : …', { s: 9, c: C.gray }))}`,
  },

  /* ===================== FINANCE ===================== */
  {
    id: 'invoice', cat: 'Finance', name: 'Facture', desc: 'Facture conforme : mentions légales, lignes, TVA et paiement.', settings: { pageNumbers: false, footer: 'Pénalité de retard : 3 fois le taux d’intérêt légal · Indemnité forfaitaire de recouvrement : 40 €' },
    html: () => `${cols({ html: P(sp('Votre Société', { b: true, c: C.navy, s: 18 })) + P('Adresse · Code postal Ville<br>SIRET : … · TVA intracom. : …<br>Tél. … · e-mail'), w: 360 }, P(sp('FACTURE', { b: true, c: C.navy, s: 24 }), 'right') + P(`N° ${year()}-001<br>Date : ${today()}<br>Échéance : …`, 'right'))}${rule()}
${cols(`<p>${sp('FACTURÉ À', { b: true, c: C.gray, s: 9 })}<br>${sp('Nom du client / Société', { b: true })}<br>Adresse<br>Code postal Ville<br>N° TVA : …</p>`, `<p>${sp('LIVRAISON / CHANTIER', { b: true, c: C.gray, s: 9 })}<br>Adresse de livraison<br>Référence commande : …</p>`)}
${tb(['Désignation', 'Qté', 'Prix unitaire HT', 'TVA', 'Total HT'], [['Prestation / produit', '1', '… €', '20 %', '… €'], ['Prestation / produit', '…', '… €', '20 %', '… €'], ['Prestation / produit', '…', '… €', '20 %', '… €']], { w: [250, 50, 110, 60, 100], align: ['left', 'right', 'right', 'right', 'right'] })}
${cols({ html: P(sp('Conditions de paiement', { b: true })) + P('Paiement à … jours par virement.<br>IBAN : …<br>BIC : …'), w: 330 }, tb(['Récapitulatif', ''], [['Total HT', '… €'], ['TVA 20 %', '… €']], { fill: C.gray, total: ['Total TTC', '… €'], align: ['left', 'right'], zebra: false }))}
${P(sp('TVA non applicable, art. 293 B du CGI (si micro-entrepreneur).', { i: true, s: 9, c: C.gray }))}`,
  },
  {
    id: 'quote', cat: 'Finance', name: 'Devis', desc: 'Devis chiffré, valable 30 jours, avec bon pour accord.', settings: { pageNumbers: false, footer: 'Devis gratuit — valable 30 jours' },
    html: () => `${cols({ html: P(sp('Votre Société', { b: true, c: C.teal, s: 18 })) + P('Adresse · Code postal Ville<br>SIRET : … · Tél. … · e-mail'), w: 360 }, P(sp('DEVIS', { b: true, c: C.teal, s: 24 }), 'right') + P(`N° D${year()}-001<br>Date : ${today()}<br>Validité : 30 jours`, 'right'))}${rule(C.teal)}
${cols(`<p>${sp('CLIENT', { b: true, c: C.gray, s: 9 })}<br>${sp('Nom / Société', { b: true })}<br>Adresse</p>`, `<p>${sp('PROJET', { b: true, c: C.gray, s: 9 })}<br>Objet du devis : …<br>Début estimé : …</p>`)}
${tb(['Désignation', 'Qté', 'Prix unitaire HT', 'Total HT'], [['Prestation 1 — description', '1', '… €', '… €'], ['Prestation 2 — description', '…', '… €', '… €'], ['Prestation 3 — description', '…', '… €', '… €']], { fill: C.teal, w: [330, 60, 130, 110], align: ['left', 'right', 'right', 'right'], total: ['Total HT', '', '', '… €'] })}
${P(sp('Total TTC (TVA 20 %) : … €', { b: true, s: 13, c: C.teal }), 'right')}
${note(P(sp('Conditions : ', { b: true }) + 'acompte de …% à la commande, solde à la livraison. Délai de réalisation : …'), '#e6f4f2', C.teal)}
${H3('Bon pour accord', C.teal)}${P('Date, signature précédée de la mention « Bon pour accord » :')}<p></p>`,
  },
  {
    id: 'expense', cat: 'Finance', name: 'Note de frais', desc: 'Déclaration de frais professionnels avec justificatifs et validation.', settings: { orientation: 'landscape', margins: { ...MARGIN_PRESETS.moderate.v }, pageNumbers: false },
    html: () => `${banner('Note de frais', 'Période : du … au …', C.green)}
${cols(kv([['Nom', '…'], ['Service', '…'], ['Motif / Mission', '…']], 100), kv([['Date de remise', today()], ['Matricule', '…'], ['Projet / Client', '…']], 110))}
${tb(['Date', 'Nature', 'Description', 'Justificatif n°', 'Montant TTC', 'dont TVA'], [['…', 'Transport', '…', '…', '… €', '… €'], ['…', 'Repas', '…', '…', '… €', '… €'], ['…', 'Hébergement', '…', '…', '… €', '… €'], ['…', 'Divers', '…', '…', '… €', '… €']], { fill: C.green, align: ['left', 'left', 'left', 'left', 'right', 'right'], total: ['', '', '', 'TOTAL', '… €', '… €'] })}
${P(sp('Indemnités kilométriques : … km × … €/km = … €', { s: 10, c: C.gray }))}
${sign('Le salarié', 'Le responsable (validation)', 'La comptabilité')}`,
  },
  {
    id: 'budget', cat: 'Finance', name: 'Budget mensuel', desc: 'Revenus, dépenses par poste et épargne : tableau de bord simple.', settings: { margins: { ...MARGIN_PRESETS.moderate.v }, pageNumbers: false },
    html: () => `${banner('Budget mensuel', 'Mois de … ' + year(), C.teal)}
${cols({ html: H2('Revenus', C.green) + tb(['Source', 'Prévu', 'Réel'], [['Salaire', '… €', '… €'], ['Autres revenus', '… €', '… €']], { fill: C.green, align: ['left', 'right', 'right'], total: ['Total revenus', '… €', '… €'] }) }, { html: H2('Épargne', C.blue) + tb(['Objectif', 'Prévu', 'Réel'], [['Épargne de précaution', '… €', '… €'], ['Projet : …', '… €', '… €']], { fill: C.blue, align: ['left', 'right', 'right'], total: ['Total épargne', '… €', '… €'] }) })}
${H2('Dépenses', C.red)}
${tb(['Poste', 'Prévu', 'Réel', 'Écart'], [['Logement (loyer, charges)', '… €', '… €', '… €'], ['Alimentation', '… €', '… €', '… €'], ['Transport', '… €', '… €', '… €'], ['Santé', '… €', '… €', '… €'], ['Loisirs', '… €', '… €', '… €'], ['Abonnements', '… €', '… €', '… €'], ['Imprévus', '… €', '… €', '… €']], { fill: C.red, align: ['left', 'right', 'right', 'right'], total: ['Total dépenses', '… €', '… €', '… €'] })}
${note(P(sp('Solde du mois : ', { b: true }) + 'revenus − dépenses − épargne = … €'), '#e6f4f2', C.teal)}`,
  },
  {
    id: 'receipt', cat: 'Finance', name: 'Quittance de loyer', desc: 'Quittance mensuelle avec détail loyer et charges.', settings: { pageNumbers: false },
    html: () => `${banner('Quittance de loyer', 'Mois de … ' + year(), C.navy)}
${cols(`<p>${sp('BAILLEUR', { b: true, c: C.gray, s: 9 })}<br>${sp('Prénom NOM', { b: true })}<br>Adresse</p>`, `<p>${sp('LOCATAIRE', { b: true, c: C.gray, s: 9 })}<br>${sp('Prénom NOM', { b: true })}<br>Adresse du logement loué</p>`)}
${J('Je soussigné(e) <strong>Prénom NOM</strong>, propriétaire du logement désigné ci-dessus, déclare avoir reçu de <strong>Prénom NOM</strong> la somme de <strong>… euros</strong>, au titre du loyer et des charges pour la période du <strong>… au …</strong>, et lui en donne quittance, sous réserve de tous mes droits.')}
${tb(['Détail', 'Montant'], [['Loyer hors charges', '… €'], ['Provision pour charges', '… €']], { align: ['left', 'right'], total: ['Total payé', '… €'] })}
${P(`Fait à …, le ${today()}`)}${SIG}
${P(sp('Cette quittance annule tous les reçus qui auraient pu être établis précédemment en cas de paiement partiel du montant du présent terme.', { i: true, s: 9, c: C.gray }))}`,
  },
  {
    id: 'purchase', cat: 'Finance', name: 'Bon de commande', desc: 'Commande fournisseur avec lignes, livraison et conditions.', settings: { pageNumbers: false },
    html: () => `${cols({ html: P(sp('BON DE COMMANDE', { b: true, c: C.slate, s: 22 })), w: 330 }, P(`N° BC-${year()}-001<br>Date : ${today()}`, 'right'))}${rule(C.slate)}
${cols(`<p>${sp('ACHETEUR', { b: true, c: C.gray, s: 9 })}<br>${sp('Votre Société', { b: true })}<br>Adresse<br>Contact : …</p>`, `<p>${sp('FOURNISSEUR', { b: true, c: C.gray, s: 9 })}<br>${sp('Nom du fournisseur', { b: true })}<br>Adresse<br>Contact : …</p>`)}
${tb(['Réf.', 'Désignation', 'Qté', 'Prix unitaire HT', 'Total HT'], [['…', '…', '…', '… €', '… €'], ['…', '…', '…', '… €', '… €'], ['…', '…', '…', '… €', '… €']], { fill: C.slate, w: [70, 270, 60, 110, 100], align: ['left', 'left', 'right', 'right', 'right'], total: ['', '', '', 'Total HT', '… €'] })}
${kv([['Adresse de livraison', '…'], ['Date de livraison souhaitée', '…'], ['Conditions de paiement', '30 jours fin de mois']], 200)}
${sign('Pour l’acheteur', 'Pour le fournisseur (accusé de réception)')}`,
  },

  /* ===================== PERSONNEL ===================== */
  {
    id: 'cv', cat: 'Personnel', name: 'Curriculum vitæ — classique', desc: 'CV sobre et efficace : une page, expériences chiffrées.', settings: { margins: { ...MARGIN_PRESETS.moderate.v }, pageNumbers: false },
    html: () => `${P(sp('Prénom NOM', { b: true, c: C.navy, s: 26 }), 'center')}${P(sp('Intitulé du poste recherché', { c: C.blue, s: 13, b: true }), 'center')}${P('Téléphone · e-mail · Ville · linkedin.com/in/…', 'center')}${rule()}
${H2('Profil')}${J('Deux à trois lignes : votre expérience, votre valeur ajoutée, votre objectif.')}
${H2('Expérience professionnelle')}
${cols({ html: P(sp('2022 – Aujourd’hui', { b: true, c: C.gray })), w: 130 }, P(sp('Poste — Entreprise, Ville', { b: true })) + ul(['Réalisation chiffrée (ex. : +25 % de ventes en 12 mois)', 'Mission principale et périmètre', 'Outils et méthodes maîtrisés']))}
${cols({ html: P(sp('2019 – 2022', { b: true, c: C.gray })), w: 130 }, P(sp('Poste — Entreprise, Ville', { b: true })) + ul(['Réalisation chiffrée', 'Mission principale']))}
${H2('Formation')}
${cols({ html: P(sp('2019', { b: true, c: C.gray })), w: 130 }, P(sp('Diplôme — Établissement', { b: true }) + '<br>Mention, spécialité'))}
${H2('Compétences')}${cols('<p>' + sp('Techniques', { b: true }) + '</p>' + ul(['Compétence 1', 'Compétence 2', 'Compétence 3']), '<p>' + sp('Langues', { b: true }) + '</p>' + ul(['Français : langue maternelle', 'Anglais : courant (C1)']), '<p>' + sp('Centres d’intérêt', { b: true }) + '</p>' + ul(['…', '…']))}`,
  },
  {
    id: 'cv2', cat: 'Personnel', name: 'Curriculum vitæ — moderne', desc: 'Deux colonnes avec bandeau coloré et barre latérale.', settings: { margins: { ...MARGIN_PRESETS.narrow.v }, pageNumbers: false },
    html: () => `${banner('Prénom NOM', 'Intitulé du poste recherché', C.blue, 'Téléphone · e-mail · Ville')}
<table data-borderless><tbody><tr>
${cell(`${P(sp('PROFIL', { b: true, c: C.blue }))}${P('Deux lignes qui vous résument.')}${P(sp('COMPÉTENCES', { b: true, c: C.blue }))}${ul(['Compétence 1', 'Compétence 2', 'Compétence 3', 'Compétence 4'])}${P(sp('LANGUES', { b: true, c: C.blue }))}${ul(['Français — natif', 'Anglais — courant'])}${P(sp('CONTACT', { b: true, c: C.blue }))}${P('e-mail<br>téléphone<br>portfolio')}`, { bg: '#eef3fd', w: 210 })}
${cell(`${P(sp('EXPÉRIENCE', { b: true, c: C.blue, s: 13 }))}${P(sp('Poste — Entreprise', { b: true }) + '<br>' + sp('2022 – Aujourd’hui', { i: true, c: C.gray }))}${ul(['Réalisation chiffrée', 'Mission principale'])}${P(sp('Poste — Entreprise', { b: true }) + '<br>' + sp('2019 – 2022', { i: true, c: C.gray }))}${ul(['Réalisation chiffrée', 'Mission principale'])}${P(sp('FORMATION', { b: true, c: C.blue, s: 13 }))}${P(sp('Diplôme — Établissement', { b: true }) + '<br>' + sp('2019', { i: true, c: C.gray }))}`)}
</tr></tbody></table><p></p>`,
  },
  {
    id: 'checklist', cat: 'Personnel', name: 'Liste de tâches', desc: 'Cases à cocher classées par priorité et par échéance.', settings: { pageNumbers: false },
    html: () => `${banner('Liste de tâches', today(), C.slate)}
${H2('Urgent', C.red)}${tasks(['Tâche urgente 1', 'Tâche urgente 2'])}
${H2('Cette semaine', C.gold)}${tasks(['Tâche 1', 'Tâche 2', ['Tâche déjà terminée', true]])}
${H2('Plus tard', C.green)}${tasks(['Idée à explorer', 'Projet à planifier'])}
${note(P(sp('Astuce : ', { b: true }) + 'limitez-vous à 3 priorités par jour.'), '#f1f5f9', C.slate)}`,
  },
  {
    id: 'planner', cat: 'Personnel', name: 'Planning hebdomadaire', desc: 'Semaine par créneaux, priorités et bilan.', settings: { orientation: 'landscape', margins: { ...MARGIN_PRESETS.narrow.v }, pageNumbers: false },
    html: () => `${banner('Planning de la semaine', 'Semaine du … au …', C.blue)}
${tb(['Créneau', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Week-end'], [['<strong>Matin</strong>', '', '', '', '', '', ''], ['<strong>Midi</strong>', '', '', '', '', '', ''], ['<strong>Après-midi</strong>', '', '', '', '', '', ''], ['<strong>Soir</strong>', '', '', '', '', '', '']], { fill: C.blue, w: [90, 110, 110, 110, 110, 110, 110] })}
${cols(`<p>${sp('Mes 3 priorités', { b: true, c: C.blue })}</p>${tasks(['…', '…', '…'])}`, `<p>${sp('Bilan de la semaine', { b: true, c: C.blue })}</p>${P('Réussites : …<br>À améliorer : …')}`)}`,
  },
  {
    id: 'travel', cat: 'Personnel', name: 'Carnet de voyage', desc: 'Itinéraire jour par jour, réservations et valise.', settings: { pageNumbers: true, footer: 'Bon voyage !' },
    html: () => `${banner('Carnet de voyage', 'Destination — du … au …', C.teal, 'Voyageurs : …')}
${H2('Réservations', C.teal)}${tb(['Type', 'Détail', 'Référence', 'Date / heure'], [['Transport aller', '…', '…', '…'], ['Hébergement', '…', '…', '…'], ['Location', '…', '…', '…'], ['Transport retour', '…', '…', '…']], { fill: C.teal })}
${H2('Itinéraire', C.teal)}${tb(['Jour', 'Programme', 'Budget'], [['Jour 1', 'Arrivée — …', '… €'], ['Jour 2', '…', '… €'], ['Jour 3', '…', '… €']], { fill: C.teal, w: [90, 420, 90] })}
${H2('Valise', C.teal)}${cols(tasks(['Passeport / carte d’identité', 'Billets, assurances', 'Chargeurs, adaptateur']), tasks(['Vêtements adaptés', 'Trousse de toilette', 'Médicaments']))}
${note(P(sp('Contacts utiles : ', { b: true }) + 'ambassade, assurance, hôtel : …'), '#e6f4f2', C.teal)}`,
  },
  {
    id: 'recipe', cat: 'Personnel', name: 'Fiche recette', desc: 'Ingrédients, étapes et astuces avec fiche d’identité.', settings: { pageNumbers: false },
    html: () => `${banner('Nom de la recette', 'Entrée · Plat · Dessert', C.gold)}
${tb(['Préparation', 'Cuisson', 'Personnes', 'Difficulté'], [['… min', '… min', '4', 'Facile']], { fill: C.gold, zebra: false })}
${cols({ html: H2('Ingrédients', C.gold) + ul(['… g de …', '… cl de …', '… œufs', 'Sel, poivre']), w: 250 }, H2('Préparation', C.gold) + ol(['Préchauffer le four à …°C.', 'Mélanger …', 'Cuire … minutes.', 'Laisser reposer avant de servir.']))}
${note(P(sp('Astuce du chef : ', { b: true }) + '…'), '#fff8e6', C.gold)}`,
  },
  {
    id: 'goals', cat: 'Personnel', name: 'Objectifs de l’année', desc: 'Vision, objectifs SMART, plan trimestriel et suivi.', settings: { pageNumbers: false },
    html: () => `${banner('Mes objectifs ' + year(), 'Une année, trois priorités', C.plum)}
${H2('Ma vision', C.plum)}${note(P('Dans un an, je veux … parce que …'), '#f6ecf4', C.plum)}
${H2('Mes objectifs', C.plum)}${tb(['Domaine', 'Objectif mesurable', 'Échéance', 'Avancement'], [['Carrière', '…', '…', '☐ ☐ ☐ ☐'], ['Santé', '…', '…', '☐ ☐ ☐ ☐'], ['Finances', '…', '…', '☐ ☐ ☐ ☐'], ['Apprentissage', '…', '…', '☐ ☐ ☐ ☐']], { fill: C.plum })}
${H2('Plan trimestriel', C.plum)}${tb(['T1', 'T2', 'T3', 'T4'], [['…', '…', '…', '…']], { fill: C.plum, zebra: false })}
${H2('Bilan', C.plum)}${P('Ce qui a fonctionné : …<br>Ce que j’ajuste : …')}`,
  },

  /* ===================== ÉDUCATION ===================== */
  {
    id: 'coverpage', cat: 'Éducation', name: 'Page de garde (mémoire / dossier)', desc: 'Page de titre académique avec établissement, encadrant et date.', settings: { pageNumbers: false, pageBorder: { style: 'double', color: C.navy, width: 1.4, offset: 1 } },
    html: () => `${P(sp('NOM DE L’ÉTABLISSEMENT', { b: true, c: C.navy, s: 14 }), 'center')}${P(sp('Faculté / École · Département · Année universitaire ' + year() + '-' + (year() + 1), { c: C.gray }), 'center')}<p></p><p></p>
${rule(C.navy)}${P(sp('MÉMOIRE DE FIN D’ÉTUDES', { b: true, c: C.blue, s: 12 }), 'center')}${P(sp('Titre du mémoire', { b: true, c: C.navy, s: 28 }), 'center')}${P(sp('Sous-titre éventuel', { i: true, c: C.gray, s: 14 }), 'center')}${rule(C.navy)}<p></p>
${P('Présenté par <strong>Prénom NOM</strong>', 'center')}${P('Pour l’obtention du diplôme de …<br>Spécialité : …', 'center')}<p></p>
${cols(`<p>${sp('Encadrant pédagogique', { b: true, c: C.navy })}<br>Prénom NOM</p>`, `<p style="text-align:right">${sp('Tuteur en entreprise', { b: true, c: C.navy })}<br>Prénom NOM</p>`)}<p></p>
${P(sp('Soutenu le … devant le jury composé de : …', { i: true, c: C.gray }), 'center')}`,
  },
  {
    id: 'lesson', cat: 'Éducation', name: 'Fiche de cours / révision', desc: 'Notions clés, définitions, exemples et exercices.', settings: { pageNumbers: true, footer: 'Fiche de révision' },
    html: () => `${banner('Titre du chapitre', 'Matière · Niveau · ' + today(), C.blue)}
${H2('Objectifs', C.blue)}${ul(['Savoir …', 'Comprendre …', 'Être capable de …'])}
${H2('Notions clés', C.blue)}${tb(['Notion', 'Définition', 'Exemple'], [['…', '…', '…'], ['…', '…', '…'], ['…', '…', '…']], { fill: C.blue, w: [130, 280, 200] })}
${H2('À retenir', C.blue)}${note(P('La règle ou la formule essentielle, en une phrase.'), '#fff8e6', C.gold)}
${H2('Exercices', C.blue)}${ol(['Exercice d’application …', 'Exercice de réflexion …'])}
${H2('Auto-évaluation', C.blue)}${tasks(['Je connais les définitions', 'Je sais refaire les exemples', 'J’ai fait les exercices'])}`,
  },
  {
    id: 'exam', cat: 'Éducation', name: 'Sujet d’examen / évaluation', desc: 'En-tête, consignes, barème et cadre pour la note.', settings: { pageNumbers: true, footer: 'Évaluation' },
    html: () => `${cols({ html: P(sp('Établissement', { b: true, c: C.navy, s: 13 }) + '<br>Classe : … · Matière : …'), w: 360 }, P(sp('ÉVALUATION n° …', { b: true, c: C.navy, s: 16 }) + `<br>Date : ${today()} · Durée : … min`, 'right'))}${rule()}
${tb(['Nom, prénom : …………………………', 'Note : …… / 20', 'Appréciation'], [['', '', '']], { zebra: false })}
${note(P(sp('Consignes : ', { b: true }) + 'calculatrice autorisée / interdite. Les réponses doivent être rédigées et justifiées.'), '#eaf2ff', C.blue)}
${H2('Exercice 1 — … (… points)')}${P('Énoncé …')}<p></p><p></p>
${H2('Exercice 2 — … (… points)')}${P('Énoncé …')}<p></p><p></p>
${H2('Exercice 3 — … (… points)')}${P('Énoncé …')}<p></p>
${P(sp('Barème indicatif : Ex. 1 : … pts · Ex. 2 : … pts · Ex. 3 : … pts', { i: true, s: 9, c: C.gray }))}`,
  },

  /* ===================== JURIDIQUE ===================== */
  {
    id: 'contract', cat: 'Juridique', name: 'Contrat de prestation de services', desc: 'Contrat complet : objet, prix, durée, responsabilité, résiliation.', settings: { footer: 'Modèle indicatif — à faire valider par un professionnel du droit', pageNumbers: true },
    html: () => `${P(sp('CONTRAT DE PRESTATION DE SERVICES', { b: true, c: C.navy, s: 20 }), 'center')}${rule()}
${P(sp('ENTRE LES SOUSSIGNÉS', { b: true }))}
${J('<strong>Le prestataire :</strong> Nom / Société, forme juridique, SIRET …, dont le siège est …, représenté par …, ci-après « le Prestataire »,')}
${J('<strong>ET le client :</strong> Nom / Société, SIRET …, dont le siège est …, représenté par …, ci-après « le Client ».')}
${H2('Article 1 — Objet')}${J('Le Client confie au Prestataire la réalisation de la mission suivante : …')}
${H2('Article 2 — Durée')}${J('Le contrat prend effet le … pour une durée de …. Il pourra être renouvelé par accord écrit des parties.')}
${H2('Article 3 — Prix et paiement')}${J('La mission est rémunérée … € HT (TVA en sus). Les factures sont payables à … jours par virement. Tout retard entraîne des pénalités égales à 3 fois le taux d’intérêt légal et une indemnité forfaitaire de 40 €.')}
${H2('Article 4 — Obligations du Prestataire')}${J('Le Prestataire s’engage à exécuter sa mission avec diligence, selon les règles de l’art, et à informer le Client de l’avancement.')}
${H2('Article 5 — Obligations du Client')}${J('Le Client fournit les informations et accès nécessaires et règle les sommes dues aux échéances convenues.')}
${H2('Article 6 — Confidentialité et propriété intellectuelle')}${J('Les parties s’engagent à garder confidentielles les informations échangées. Les droits sur les livrables sont cédés au Client après paiement intégral.')}
${H2('Article 7 — Responsabilité')}${J('La responsabilité du Prestataire est limitée aux dommages directs et plafonnée au montant des sommes perçues au titre de la mission.')}
${H2('Article 8 — Résiliation')}${J('Chaque partie peut résilier le contrat en cas de manquement non corrigé sous 15 jours après mise en demeure par lettre recommandée.')}
${H2('Article 9 — Droit applicable et litiges')}${J('Le contrat est soumis au droit français. À défaut d’accord amiable, les tribunaux de … sont seuls compétents.')}
${P(`Fait à …, le ${today()}, en deux exemplaires originaux.`)}${sign('Le Prestataire', 'Le Client')}`,
  },
  {
    id: 'nda', cat: 'Juridique', name: 'Accord de confidentialité (NDA)', desc: 'Protection réciproque des informations confidentielles.', settings: { footer: 'Modèle indicatif — à faire valider par un professionnel du droit', pageNumbers: true },
    html: () => `${P(sp('ACCORD DE CONFIDENTIALITÉ', { b: true, c: C.navy, s: 20 }), 'center')}${P(sp('Non-Disclosure Agreement', { i: true, c: C.gray }), 'center')}${rule()}
${J('<strong>Entre :</strong> Partie A, … (la « Partie Divulgatrice »), <strong>et</strong> Partie B, … (la « Partie Réceptrice »).')}
${H2('1. Objet')}${J('Les parties souhaitent échanger des informations confidentielles dans le cadre de … (le « Projet »).')}
${H2('2. Informations confidentielles')}${J('Toute information, quel qu’en soit le support, communiquée dans le cadre du Projet et identifiée comme confidentielle ou raisonnablement considérée comme telle. Sont exclues les informations publiques, déjà connues du récepteur ou développées indépendamment.')}
${H2('3. Engagements')}${ul(['Ne pas divulguer les informations à des tiers sans accord écrit', 'Les utiliser uniquement pour le Projet', 'Les protéger avec le même soin que ses propres informations', 'Restituer ou détruire les informations sur demande'])}
${H2('4. Durée')}${J('Le présent accord est conclu pour … ans à compter de sa signature ; les obligations de confidentialité survivent … ans après son terme.')}
${H2('5. Sanctions et droit applicable')}${J('Toute violation engage la responsabilité de son auteur. Le présent accord est soumis au droit français ; les tribunaux de … sont compétents.')}
${P(`Fait à …, le ${today()}, en deux exemplaires.`)}${sign('Partie A', 'Partie B')}`,
  },
  {
    id: 'proxy', cat: 'Juridique', name: 'Procuration / Pouvoir', desc: 'Mandat donné à une personne pour agir en votre nom.', settings: { pageNumbers: false, footer: 'Modèle indicatif' },
    html: () => `${P(sp('PROCURATION', { b: true, c: C.navy, s: 24 }), 'center')}${rule()}
${J('Je soussigné(e) <strong>Prénom NOM</strong>, né(e) le … à …, demeurant …, titulaire de la pièce d’identité n° …,')}
${J('<strong>donne pouvoir à</strong> <strong>Prénom NOM</strong>, né(e) le … à …, demeurant …, titulaire de la pièce d’identité n° …,')}
${J('afin de me représenter et d’agir en mon nom pour : <strong>…</strong> (décrire précisément l’objet : retrait d’un colis, signature d’un document, vote à une assemblée, démarche administrative…)')}
${J('Ce pouvoir est valable du … au … (ou pour la seule opération mentionnée). Le mandataire est autorisé à signer tout document nécessaire à cet effet.')}
${P(`Fait à …, le ${today()}`)}
${cols(`<p>${sp('Le mandant', { b: true })}<br>« Bon pour pouvoir »</p><p></p><p></p>`, `<p>${sp('Le mandataire', { b: true })}<br>« Bon pour acceptation »</p><p></p><p></p>`)}
${note(P(sp('À joindre : ', { b: true }) + 'photocopie recto-verso des pièces d’identité du mandant et du mandataire.'), '#fff8e6', C.gold)}`,
  },
  {
    id: 'sale', cat: 'Juridique', name: 'Reconnaissance de dette', desc: 'Engagement de remboursement avec échéancier.', settings: { pageNumbers: false, footer: 'Modèle indicatif' },
    html: () => `${P(sp('RECONNAISSANCE DE DETTE', { b: true, c: C.navy, s: 22 }), 'center')}${rule()}
${J('Je soussigné(e) <strong>Prénom NOM</strong>, né(e) le … à …, demeurant …, reconnais devoir à <strong>Prénom NOM</strong>, demeurant …, la somme de <strong>… euros (… €)</strong> que j’ai reçue le … à titre de prêt.')}
${J('Je m’engage à rembourser cette somme selon l’échéancier ci-dessous, sans intérêts (ou au taux annuel de …%) :')}
${tb(['Échéance', 'Montant', 'Mode de paiement'], [['…', '… €', 'Virement'], ['…', '… €', 'Virement'], ['…', '… €', 'Virement']], { fill: C.navy, align: ['left', 'right', 'left'], total: ['Total', '… €', ''] })}
${J('Le montant est écrit en toutes lettres et en chiffres. En cas de divergence, la somme en toutes lettres prévaut.')}
${P(`Fait à …, le ${today()}, en deux exemplaires.`)}
${cols(`<p>${sp('Le débiteur', { b: true })}<br>Mention manuscrite : « Bon pour la somme de … euros »</p><p></p>`, `<p>${sp('Le créancier', { b: true })}<br>« Lu et approuvé »</p><p></p>`)}`,
  },

  /* ===================== ÉVÉNEMENT ===================== */
  {
    id: 'invitation', cat: 'Événement', name: 'Invitation', desc: 'Invitation élégante encadrée : cérémonie, anniversaire, soirée.', settings: { pageNumbers: false, pageBorder: { style: 'double', color: C.gold, width: 1.5, offset: 1.2 }, margins: { ...MARGIN_PRESETS.wide.v } },
    html: () => `<p></p>${P(sp('— Vous êtes invité(e) —', { c: C.gold, s: 14, i: true }), 'center')}<p></p>
${P(sp('Nom de l’événement', { b: true, c: C.navy, s: 34 }), 'center')}${P(sp('à l’occasion de …', { c: C.gray, s: 14, i: true }), 'center')}<p></p>
${rule(C.gold)}
${P(sp('Le samedi … ' + year(), { b: true, s: 16, c: C.navy }), 'center')}${P(sp('à partir de …h…', { s: 14 }), 'center')}
${P(sp('Lieu : …', { b: true, s: 14 }), 'center')}${P('Adresse complète · Plan d’accès', 'center')}
${rule(C.gold)}<p></p>
${P('Tenue : … · Un buffet sera servi', 'center')}
${P(sp('Merci de confirmer votre présence avant le … auprès de … · Téléphone / e-mail', { i: true, c: C.gray }), 'center')}`,
  },
  {
    id: 'flyer', cat: 'Événement', name: 'Affiche / Flyer', desc: 'Affiche accrocheuse : titre, date, lieu, programme et contact.', settings: { pageNumbers: false, margins: { ...MARGIN_PRESETS.narrow.v } },
    html: () => `${banner('NOM DE L’ÉVÉNEMENT', 'Slogan ou accroche en une ligne', C.red, 'ENTRÉE LIBRE · TOUT PUBLIC')}
${P(sp('Samedi … ' + year() + ' — dès …h…', { b: true, s: 22, c: C.navy }), 'center')}${P(sp('Lieu · Ville', { b: true, s: 18, c: C.red }), 'center')}
${rule(C.red)}
${H2('Au programme', C.red)}${tb(['Heure', 'Animation'], [['…h…', 'Ouverture et accueil'], ['…h…', 'Animation / concert / conférence'], ['…h…', 'Temps convivial']], { fill: C.red, w: [110, 500] })}
${note(P(sp('Infos et inscriptions : ', { b: true }) + '… · e-mail · téléphone · site web'), '#fdecea', C.red)}`,
  },
  {
    id: 'program', cat: 'Événement', name: 'Programme d’événement', desc: 'Déroulé détaillé d’une journée : conférence, séminaire, mariage.', settings: { pageNumbers: true, footer: 'Programme' },
    html: () => `${banner('Programme', 'Nom de l’événement — ' + today(), C.plum, 'Lieu · Adresse')}
${H2('Matin', C.plum)}${tb(['Horaire', 'Session', 'Intervenant', 'Salle'], [['09:00', 'Accueil et café', '—', 'Hall'], ['09:30', 'Ouverture', '…', '…'], ['10:15', 'Conférence : …', '…', '…'], ['11:30', 'Atelier : …', '…', '…']], { fill: C.plum, w: [90, 270, 150, 90] })}
${H2('Déjeuner', C.plum)}${P('12:30 – 14:00 · Restaurant / buffet')}
${H2('Après-midi', C.plum)}${tb(['Horaire', 'Session', 'Intervenant', 'Salle'], [['14:00', 'Table ronde : …', '…', '…'], ['15:30', 'Pause', '—', 'Hall'], ['16:00', 'Clôture et remerciements', '…', '…']], { fill: C.plum, w: [90, 270, 150, 90] })}
${note(P(sp('Infos pratiques : ', { b: true }) + 'accès, parking, Wi-Fi, contact organisation.'), '#f6ecf4', C.plum)}`,
  },
  {
    id: 'menu', cat: 'Événement', name: 'Menu de restaurant / réception', desc: 'Carte raffinée avec entrées, plats, desserts et boissons.', settings: { pageNumbers: false, pageBorder: { style: 'single', color: C.gold, width: 1, offset: 1 }, margins: { ...MARGIN_PRESETS.wide.v } },
    html: () => `${P(sp('Nom du restaurant', { b: true, c: C.navy, s: 30 }), 'center')}${P(sp('Menu · ' + year(), { c: C.gold, i: true, s: 13 }), 'center')}${rule(C.gold)}
${P(sp('ENTRÉES', { b: true, c: C.gold, s: 14 }), 'center')}
${P(sp('Nom du plat', { b: true }) + '<br>' + sp('description courte des ingrédients', { i: true, c: C.gray }) + ' — … €', 'center')}${P(sp('Nom du plat', { b: true }) + '<br>' + sp('description courte', { i: true, c: C.gray }) + ' — … €', 'center')}
${P(sp('PLATS', { b: true, c: C.gold, s: 14 }), 'center')}
${P(sp('Nom du plat', { b: true }) + '<br>' + sp('description courte', { i: true, c: C.gray }) + ' — … €', 'center')}${P(sp('Nom du plat', { b: true }) + '<br>' + sp('description courte', { i: true, c: C.gray }) + ' — … €', 'center')}
${P(sp('DESSERTS', { b: true, c: C.gold, s: 14 }), 'center')}
${P(sp('Nom du dessert', { b: true }) + '<br>' + sp('description courte', { i: true, c: C.gray }) + ' — … €', 'center')}
${rule(C.gold)}${P(sp('Menu du jour : … € · Prix nets, service compris', { i: true, c: C.gray, s: 10 }), 'center')}`,
  },
];

export function templateSettings(t) {
  const d = pref.get('defaults', {}) || {};
  return {
    ...DEFAULT_SETTINGS, ...d, ...t.settings,
    margins: { ...DEFAULT_SETTINGS.margins, ...(d.margins || {}), ...(t.settings?.margins || {}) },
    pageBorder: { ...DEFAULT_SETTINGS.pageBorder, ...(d.pageBorder || {}), ...(t.settings?.pageBorder || {}) },
  };
}
