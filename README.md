# Luma Office

Traitement de texte professionnel pour **téléphone et tablette** (PWA installable, fonctionne hors ligne).
Export **Word (.docx)** et **PDF**, import `.docx` / `.txt` / `.html`.

## Fonctionnalités

- **Mise en forme** : styles (Titre 1-3, Citation, Code), polices (Calibri, Cambria, Arial, Times New Roman…), taille, gras/italique/souligné/barré, indice/exposant, couleur du texte, surlignage, effacer la mise en forme
- **Paragraphes** : alignement (dont justifié), listes à puces / numérotées / de tâches, retraits, interligne, espacement avant/après
- **Insertion** : tableaux (lignes, colonnes, fusion, en-tête, couleur de fond), images (galerie, appareil photo, collage), liens, ligne horizontale, saut de page, date, symboles
- **Mise en page** : A4 / A5 / A3 / Lettre / Légal, portrait ou paysage, marges, en-tête, pied de page, numérotation « Page X / N »
- **Révision** : rechercher & remplacer, correcteur orthographique (langue au choix), statistiques
- **Modèles** : lettre, rapport, compte rendu, CV, note de service
- **Mobile d'abord** : ruban à onglets sous les doigts (au-dessus du clavier sur téléphone), mode « Adapté » pour écrire confortablement sur petit écran, mode « Page » avec pagination et zoom (pincer), thème clair / sombre
- **Enregistrement automatique** sur l'appareil (IndexedDB), aucun compte requis

## Développement

```bash
npm install
npm run dev      # serveur de développement
npm run build    # build de production dans dist/
npm run preview  # prévisualiser le build
```

Déployez le dossier `dist/` sur n'importe quel hébergement statique (HTTPS requis pour l'installation PWA).
Sur Android : menu du navigateur → « Installer l'application ». Sur iPhone / iPad : Partager → « Sur l'écran d'accueil ».

## Pile technique

Vite · TipTap (ProseMirror) · `docx` (export Word) · jsPDF + html2canvas (export PDF) · mammoth (import Word) · vite-plugin-pwa
