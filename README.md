# Luma Office

Traitement de texte professionnel pour **téléphone et tablette** (PWA installable, fonctionne hors ligne).
Export **Word (.docx)** et **PDF vectoriel (texte sélectionnable)**, import fidèle de `.docx`, commentaires, suivi des modifications et table des matières.

## Fonctionnalités

- **Mise en forme** : styles (Titre 1-3, Citation, Code), polices (Calibri, Cambria, Arial, Times New Roman…), taille, gras/italique/souligné/barré, indice/exposant, couleur du texte, surlignage, effacer la mise en forme
- **Paragraphes** : alignement (dont justifié), listes à puces / numérotées / de tâches, retraits, interligne, espacement avant/après
- **Insertion** : tableaux (lignes, colonnes, fusion, en-tête, couleur de fond), images (galerie, appareil photo, collage), liens, ligne horizontale, saut de page, date, symboles
- **Mise en page** (onglet complet, comme Word) : marges prédéfinies ou personnalisées + reliure, portrait / paysage, 8 formats de papier + format personnalisé, 1 à 4 colonnes (espacement, ligne de séparation, saut de colonne), saut de page, filigrane, bordures de page (simple, double, pointillée) ou décoratives (cœurs, arbres, sapins, étoiles, fleurs, ballons, feuilles, papillons, soleils, lunes, notes, flocons, diamants ; couleur et taille réglables ; bordures artistiques natives dans Word), en-tête / pied de page alignables, première page différente, numéros de page (position, alignement, format), césure automatique
- **Insertion étendue** : page vierge, saut de page / de colonne, en-tête, pied de page et numérotation, formes (flèches, cœur, étoile, arbre, bulles… avec couleur, contour, texte), zone de texte (7 styles), lettrine, date et heure (mise à jour automatique possible), note de fin, lien, commentaire, sommaire
- **Info de mise en forme** (comme Word) : au survol (souris) ou au curseur (tactile), police, taille, gras / italique, style ; rappel permanent dans la barre d'état
- **Images faciles à déplacer** : poignée de déplacement (glisser-déposer avec repère), redimensionnement au coin, boutons monter / descendre, habillage du texte (gauche / droite / en ligne), forme, texte alternatif
- **Affichage** : mode lecteur (taille, police, interligne, thème, défilement automatique), vue en pavé, miniatures, « Aller à la page » (curseur, ±1 / ±10) et aux titres, compteur de mots, statistiques
- **Révision** : rechercher & remplacer, correcteur orthographique (langue au choix), statistiques
- **Commentaires** : sur une sélection, avec réponses, résolution et suppression (exportés dans le .docx, relus à l'import)
- **Suivi des modifications** : ajouts / suppressions de texte attribués à leur auteur, accepter / rejeter (un par un ou tout), navigation, export et import Word (`w:ins` / `w:del`)
- **Table des matières** automatique (Titres 1-3) avec numéros de page ; mise à jour d'une touche et avant chaque export
- **Tableaux** : largeur des colonnes réglable au doigt (poignées) ou en centimètres, fusion, en-tête, couleur de fond
- **Modèles** : lettre, rapport, compte rendu, CV, note de service
- **Mobile d'abord** : ruban à onglets sous les doigts (au-dessus du clavier sur téléphone), mode « Adapté » pour écrire confortablement sur petit écran, mode « Page » avec pagination et zoom (pincer), thème clair / sombre
- **Enregistrement automatique** sur l'appareil (IndexedDB, stockage persistant demandé au navigateur), bouton Enregistrer, aucun compte requis
- **Lecteurs PDF et Excel** : lecture de PDF (pages à la demande, texte sélectionnable, zoom au pincement, recherche, conversion en document modifiable), de classeurs `.xlsx` / `.csv` (dates, montants, pourcentages, cellules fusionnées, onglets, barre de formule, recherche) et de documents Word
- **Recherche** : plein texte (titre et contenu, sans accents ni casse) dans tous vos documents, PDF et classeurs ; recherche de fichiers dans les dossiers de l'appareil, par nom ou dans le contenu
- **Ouvrir avec Luma Office** : ordinateur (Chrome / Edge, application installée) via « Ouvrir avec » ; Android via « Partager » ; partout via le bouton Importer
- **Page Modèles** : 16 modèles classés par catégorie avec aperçu, et vos propres modèles (« Enregistrer comme modèle »)
- **Page Paramètres** : thème, affichage, orthographe, auteur, valeurs par défaut des nouveaux documents, dossiers de recherche, sauvegarde / restauration (.zip), installation
- **Hors ligne** : documents et images conservés localement ; les images distantes sont copiées dans le document et mises en cache

## Développement

```bash
npm install
npm run dev      # serveur de développement
npm run build    # build de production dans dist/
npm run preview  # prévisualiser le build
```

**Vercel** : importez le dépôt, aucun réglage n'est nécessaire (`vercel.json` fourni : framework Vite, sortie `dist/`, en-têtes du service worker).
Sinon, déployez le dossier `dist/` sur n'importe quel hébergement statique (HTTPS requis pour l'installation PWA).
Sur Android : menu du navigateur → « Installer l'application ». Sur iPhone / iPad : Partager → « Sur l'écran d'accueil ».

## Pile technique

Vite · TipTap (ProseMirror) · `docx` (export Word) · pdfmake (PDF vectoriel, polices Carlito / Caladea / Arimo / Tinos / Gelasio / Cousine intégrées) · JSZip + lecteur `.docx` maison (import Word) · vite-plugin-pwa

## Limites connues

- Suivi des modifications : le texte saisi ou supprimé est suivi ; les changements de structure (couper / fusionner des paragraphes, changer de style) ne le sont pas.
- PDF : polices latines uniquement (français, anglais, langues européennes) ; Verdana / Tahoma sont remplacées par une police équivalente. Les emoji et alphabets non latins ne s'affichent pas dans le PDF.
- Table des matières : statique (mise à jour par le bouton), pas un champ Word dynamique. Les numéros de page du `.docx` sont estimés ; ceux du PDF sont exacts.
- Colonnes : l'aperçu les affiche en continu ; Word les répartit page par page, et le PDF place les blocs entier par colonne (pas de coupure en milieu de paragraphe). Le filigrane est exporté dans Word sous forme d'image d'en-tête (non réimporté). Pas de numérotation des lignes ni de sections multiples.
- Colonnes : l'aperçu les affiche en continu ; Word les répartit page par page, et le PDF place les blocs entiers par colonne (pas de coupure en milieu de paragraphe). Le filigrane est exporté dans Word sous forme d'image d'en-tête (non réimporté). Pas de numérotation des lignes ni de sections multiples.
- Anciens formats `.doc` et `.xls` : non pris en charge (enregistrez-les en `.docx` / `.xlsx`).
- « Ouvrir avec » directement depuis le gestionnaire de fichiers : possible sur ordinateur ; sur Android seul le menu « Partager » est proposé, et iPhone / iPad ne permettent rien de tel pour une application web.
- Lettrine, images « texte autour » : exportées en Word (lettrine = grande initiale, image flottante) ; dans le PDF la grande initiale est conservée mais l'image est placée sur sa propre ligne. Les notes de fin sont regroupées en fin de document. Les dates automatiques sont figées à la date de l'export.
- Import `.docx` : ne reprend pas les zones de texte, équations, notes de bas de page ni les images flottantes (elles deviennent des images en ligne).

---
Powered by **[JC Multimedia](https://www.jcmultimedia.online)**
