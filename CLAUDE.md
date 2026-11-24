# Règles de travail

- Chaque modification est commitée puis poussée directement sur `main` (déploiement automatique).
- L'APK n'est plus dans Git : Joseph le téléverse dans l'admin du site (`/admin` › Application), il est stocké en base de données
  (tables `luma_apk` / `luma_apk_chunks`, API `api/apk.js`, réécritures `/luma-office.apk` et `/apk-info.json` dans `vercel.json`).
  Après chaque build de l'APK (dépôt `luma-office-apk`), tu télécharges l'artifact du dernier run réussi de `main`, tu le renommes
  `luma-office-1.<n° du run>.0.apk` et tu le DONNES à Joseph dans la conversation (SendUserFile) ; procédure dans le `CLAUDE.md` de `luma-office-apk`.
