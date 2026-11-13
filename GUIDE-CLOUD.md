# Activer le Cloud de Luma Office (5 minutes, gratuit)

Le cloud enregistre vos documents (chiffrés dans l'application avant l'envoi) dans une base de données **Neon**.

1. Sur **https://vercel.com**, ouvrez le projet de Luma Office.
2. **Storage** › **Create Database** › **Neon** (offre gratuite) › créez la base.
3. **Connect Project** : choisissez le projet du site. Vercel ajoute tout seul la variable `DATABASE_URL`.
   (Autre méthode : créez un projet sur https://neon.tech, copiez la « connection string », puis ajoutez-la dans
   Vercel › Settings › Environment Variables sous le nom `DATABASE_URL`.)
4. **Deployments** › `…` › **Redeploy**.
5. Dans l'application : onglet **Cloud** › **Activer le cloud**. Notez votre **clé** : elle donne accès à vos documents
   et ne peut pas être récupérée si vous la perdez. Sur un autre appareil : **J'ai déjà une clé**.

Limites : 3 Mo par document, 300 documents par clé (réglable avec la variable `CLOUD_MAX_DOCS`).
Sécurité : le serveur ne reçoit que des données chiffrées (AES-GCM) et l'empreinte de la clé ; il ne peut pas lire vos documents.
