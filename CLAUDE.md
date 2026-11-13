# Règles de travail

- Chaque modification est commitée puis poussée directement sur `main` (déploiement automatique).
- Après chaque nouveau build de l'APK (dépôt `luma-office-apk`), tu dois toi-même télécharger l'APK du dernier run réussi
  de `main` et le mettre à jour dans `public/luma-office.apk` (commit + push sur `main`) et mettre à jour `public/apk-info.json` (`{"version":"1.<n° du run>.0"}`, affiché dans la fenêtre d'installation). La version de l'APK change
  automatiquement à chaque build (1.<n° du run>.0) ; la procédure complète est dans le `CLAUDE.md` de `luma-office-apk`.
