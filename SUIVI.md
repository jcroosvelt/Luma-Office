# Suivi de Luma Office

Fichier mis à jour après chaque modification. Dernière mise à jour : 2026-11-12 (2).

## Dernière modification
- **Assistant IA : plus d'erreur « modèle introuvable »** : le modèle est maintenant choisi automatiquement (le meilleur « flash » disponible avec la clé). Si un modèle est retiré ou inconnu, le serveur bascule tout seul sur un modèle disponible. Réglage « Modèle » = Automatique par défaut ; l'ancien choix mémorisé (gemini-2.5-…) est remplacé par Automatique. La variable GEMINI_MODEL sur Vercel n'est plus nécessaire : si elle contient un ancien nom, elle est ignorée en cas d'erreur 404 (ou supprimez-la).
- **Nouvel onglet « Travailler avec l'IA »** (entre Mise en page et Révision) : Assistant IA, Rédiger, Corriger, Reformuler, Raccourcir, Développer, Résumer, En liste, Plan, Continuer, Ton formel, Ton amical, Simplifier, Traduire. Chaque bouton lance directement l'action sur la sélection (ou le document entier). Le bouton ✨ de la barre du haut est supprimé ; l'assistant reste aussi dans le menu ⋮.
- **Plus aucune mention de « Gemini »** dans l'interface (réglages, messages, avertissement). Seuls restent des identifiants techniques internes.
- **Emojis supprimés de toute l'application** (modèles, assistant IA, paramètres, listes, messages). Les cartes de modèles de l'accueil utilisent maintenant des icônes sobres par catégorie, les statuts des modèles sont en toutes lettres. Les symboles typographiques (✓, →, ☐, ▲, ★…) sont conservés.
- **Téléchargement de l'APK depuis le dossier public du site** : le bouton « Installer l'app » (Android, navigateur) télécharge `/luma-office.apk`. Le fichier `public/luma-office.apk` doit être déposé dans le dépôt (voir ci-dessous) ; à remplacer à chaque nouvelle version de l'app.
- **Plus de messages « connexion rétablie / hors connexion » ni « prêt à fonctionner hors ligne »** (l'enregistrement local continue sans rien afficher).
- **Assistant IA toujours visible** : bouton ✨ dans la barre du haut de l'éditeur (en plus de Révision › Assistant IA, Outils et du menu ⋮). Il faut avoir ajouté la clé `GEMINI_API_KEY` sur Vercel (voir `GUIDE-IA.md`).
- **Installation = vrai APK Android** : sur Android (navigateur), une fenêtre « Installer l'app » apparaît à l'ouverture du site et le bouton télécharge l'APK (`releases/download/apk/luma-office.apk` du dépôt du site, publié par la compilation de l'app). Même chose pour le bouton « Installer » de l'accueil et des Paramètres. Dans l'application Android, tous ces boutons et la fenêtre sont supprimés. Ordinateur : installation PWA inchangée ; iPhone : consignes inchangées.
- **Assistant IA (Gemini)** : reformuler, corriger, raccourcir, développer, changer de ton, simplifier, résumer, mettre en liste, plan, continuer, traduire, consigne libre avec suite de conversation (éditeur : onglets Révision / Outils / menu Fichier) ; résumé, points clés, extraction et questions sur un PDF (menu ⋮). Clé API gardée **côté serveur** (fonction `api/gemini.js`, variable Vercel `GEMINI_API_KEY`, code d'accès et limite de débit facultatifs) ou « Ma clé » sur l'appareil. Réglages dans Paramètres › Assistant IA avec bouton « Tester la connexion ». Guide : `GUIDE-IA.md`.
- **11 polices ajoutées** (Open Sans, Roboto, Lato, Montserrat, Poppins, Nunito, Source Sans 3, Merriweather, Lora, Playfair Display, Dancing Script) : affichage, export PDF (polices incorporées, seules celles utilisées sont téléchargées) et hors ligne après la 1re utilisation.
- **PDF – mode lecture** (téléphone / tablette) : texte réaffiché en colonne unique, taille (aussi par pincement), 4 polices, 4 thèmes (clair, sépia, nuit, noir), interligne, marges, justification, lecture à voix haute, barres masquables au toucher, reprise à la page.
- **PDF – modifier et signer** : modifier un texte existant, masquer une zone, écrire, surligner, souligner, barrer, dessiner, insérer une image, date, signature (dessinée, tapée, image) avec « Signé le … », paraphes, déplacer / redimensionner, gomme. **Protection par mot de passe** (chiffrement réel du PDF, permissions) et retrait du mot de passe.
- **Tableaux intelligents** : tri par colonne, formules (somme, moyenne, min, max, nombre) recalculées automatiquement, bordures personnalisées (style, couleur, épaisseur, aussi dans Word / PDF), texte → tableau et tableau → texte.
- **Historique des versions** (automatique toutes les 10 min + manuel, aperçu, restauration), **comparaison** de deux documents ou d'une version (ajouts / suppressions / mots modifiés, création d'un document de comparaison), **protection par mot de passe** et permissions (modification, copie, impression, export).
- **Signets et renvois** (liens cliquables vers titres et signets), **éditeur d'équations** (LaTeX, palette, aperçu KaTeX), **publipostage** (liste Excel / CSV → une lettre par page).
- **OCR** hors ligne en français (photo → document modifiable, insertion dans un document, PDF scanné → Word) et **lecture à voix haute** des documents (pause, bloc suivant, vitesse, voix, surlignage).
- **Modèles refaits et enrichis (45 au total)** : mise en page soignée (bandeaux de couleur, tableaux à en-tête coloré et lignes alternées, encadrés, filets colorés, colonnes) et contenu complet prêt à compléter. Nouvelles catégories : Éducation, Juridique, Événement. Nouveaux modèles : réclamation, résiliation, demande de congés, recommandation, plan d'affaires, cahier des charges, fiche de poste, charte de projet, analyse SWOT, lettre d'information, note de frais, budget mensuel, quittance de loyer, bon de commande, CV moderne, carnet de voyage, fiche recette, objectifs de l'année, page de garde, fiche de cours, sujet d'examen, contrat de prestation, accord de confidentialité, procuration, reconnaissance de dette, invitation, affiche, programme, menu. L'éditeur gère maintenant les tableaux sans bordures et les filets horizontaux colorés (aussi dans l'export Word et PDF).
- **En-tête de l'accueil plus compact** : logo réduit (46 → 28 px) et marges réduites, l'en-tête passe d'environ 70 px à 39 px de haut.
- **Lecture de .odt, .rtf et .doc** (import, « Ouvrir avec », partage) : .odt et .rtf gardent le gras / italique / souligné, couleurs, tailles, alignements, titres, listes, tableaux, images et la mise en page ; .doc (ancien Word) récupère le texte, les paragraphes et les tableaux (pas la mise en forme). Les .doc protégés par mot de passe sont refusés.
- **Site plus léger** : l'installation / les mises à jour ne téléchargent plus que l'éditeur (≈ 2,2 Mo au lieu de ≈ 7,7 Mo). Les modules lourds (lecteur PDF, export PDF, import Word, tableur) se téléchargent à la première utilisation puis restent disponibles hors ligne.
- **Application Android (AppBridge)** : `window.onFileOpened(name, mime, base64)` (ouvre le fichier reçu comme nouveau document ; le document en cours est d'abord enregistré, rien n'est écrasé), `window.onTextShared(text)` (nouveau document avec le texte), `window.onNetworkChange(online)` (message « hors connexion »). Messages vers l'app : `editor:open/close`, `editor:dirty/clean`, `share:{…}` (partage Android) et `print:{pdfBase64}` (impression Android). Sans l'app, rien ne change. Formats pas encore lus : .odt, .rtf, .doc (message « Format non pris en charge »).
- **Outils PDF professionnels** : scanner / images → PDF (appareil photo ou galerie, ordre réglable), fusionner plusieurs PDF, organiser les pages (déplacer, pivoter, supprimer), extraire des pages (ex. 1-3, 5), filigrane diagonal (gris / rouge / bleu) et numérotation « 1 / N ». Tout est enregistré comme copie dans Mes documents, l'original n'est jamais modifié.
- **Lecteur PDF – annotations et formulaires** : recherche avec surlignage sur la page (résultat précédent/suivant), surligner / souligner / barrer (sélection de texte ou glissé), dessin libre, texte, signature dessinée (mémorisée), gomme, annuler, 6 couleurs ; remplissage des formulaires PDF (texte, cases, listes) ; téléchargement / partage / impression avec tout incorporé au PDF ; « Enregistrer une copie dans mes documents ».
- **Lecteur PDF enrichi** : miniatures des pages, sommaire (signets), liens cliquables (internes et web), pivoter de 90°, mode nuit, ajuster à la largeur / à la page, double-tap pour zoomer, reprise à la dernière page lue, plein écran, imprimer, propriétés du document. Correctif précédent : polices standard de pdf.js (le texte des PDF s'affiche).
- **Zoom en bas de page (comme Word)** : boutons − / +, curseur 30–300 %, clic sur le pourcentage = ajuster à la largeur.
- **Plus de petite fenêtre police/taille** au clic ou au survol d'un mot : la police et la taille s'affichent uniquement dans le ruban du haut (comme Word). Le rappel dans la barre d'état est aussi retiré.

## Fait
- Éditeur Word-like : mise en forme, paragraphes, listes, tableaux, images, liens, styles, table des matières, commentaires, suivi des modifications, rechercher/remplacer
- Mise en page complète : marges, orientation, formats, colonnes, bordures (dont motifs cœurs, arbres…), filigrane, en-tête / pied de page, numérotation
- Insertion : page vierge, sauts, formes, zone de texte, lettrine, date et heure, note de fin, symboles
- Images : déplacement par glisser-déposer, redimensionnement, monter/descendre, habillage
- Affichage : mode lecteur, vue en pavé, miniatures, aller à la page / aux titres, nombre de mots, zoom
- Interligne, espacement et retraits
- Export Word (.docx) et PDF (boutons à côté d'Enregistrer), import Word / PDF / Excel
- Enregistrement automatique chaque minute, confirmation avant de quitter
- PWA hors ligne, invitation à l'installation, « Ouvrir avec Luma Office », recherche de fichiers, pages Modèles et Paramètres, sauvegarde .zip
- Menus déroulants personnalisés (police, taille, styles…), pied « Powered by JC Multimedia »

## À faire / idées
- Rien en attente pour l'instant.

## Annulé
- Modèles « Type de parcours / badge JC Academy / certificat / diplôme » : demande annulée par l'utilisateur.

## Limites connues
Voir `README.md` (section « Limites connues »).
