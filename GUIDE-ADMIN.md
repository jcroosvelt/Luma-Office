# Tableau de bord administrateur

Accès : application › **Paramètres › Administration** (ou l'adresse `…/#/admin`). Il faut définir `ADMIN_CODE` dans Vercel (voir `GUIDE-CLOUD.md`).

| Onglet | Contenu |
|---|---|
| **Vue d'ensemble** | Visites, ouvertures de l'app Android, téléchargements de l'APK, comptes clients (nouveaux, payants, actifs), cloud, requêtes IA et erreurs ; graphiques sur 14 jours ; plateformes utilisées. |
| **Comptes** | Liste des clients : offre, espace utilisé, dernière connexion. Pour chaque compte : changer l'offre et la date de fin d'abonnement, ajuster l'espace et le nombre de documents, suspendre / réactiver, **réinitialiser le mot de passe**, voir les documents (taille et dates seulement), supprimer. Purge des comptes gratuits inactifs. |
| **Assistant IA** | État de la clé, requêtes, latence, erreurs ; bouton **Tester l'assistant** (modèle utilisé et temps de réponse) ; modèles utilisés. |
| **Application** | Fichier APK publié et sa version, fenêtres d'installation ouvertes, téléchargements, versions de l'app utilisées ; rappel de la mise à jour de l'APK. |
| **Journal** | Derniers événements filtrables (visites, IA, erreurs, comptes créés, actions d'administration) ; purge. |
| **Santé** | Variables configurées ou manquantes, connexion à la base de données, version du code déployé. |

Données : statistiques anonymes (aucune adresse IP, aucun identifiant, aucun contenu), supprimées après 90 jours.
Sécurité : session de 2 heures ; 8 essais de code maximum par 10 minutes ; l'administrateur ne peut pas lire les documents des clients.
