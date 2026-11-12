# Suivi de Luma Office

Fichier mis à jour après chaque modification. Dernière mise à jour : 2026-11-12.

## Dernière modification
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
