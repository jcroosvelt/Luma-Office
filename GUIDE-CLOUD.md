# Cloud, comptes clients et administration — ce qu'il faut configurer

Le cloud de Luma Office fonctionne avec des **comptes clients** (e-mail + mot de passe). Chaque compte a une offre
(Gratuit aujourd'hui, Premium plus tard), un espace et un nombre de documents limités. Les documents sont chiffrés
(AES-256) avant d'être enregistrés dans la base de données.

## À configurer maintenant (15 minutes, gratuit)

Tout se règle dans **Vercel › votre projet › Settings › Environment Variables**, puis **Deployments › Redeploy**.

| Variable | Obligatoire | À quoi ça sert | Comment l'obtenir |
|---|---|---|---|
| `DATABASE_URL` | **Oui** | Base de données (comptes, documents, statistiques) | Vercel › **Storage** › Create Database › **Neon** (gratuit) › Connect Project : la variable s'ajoute toute seule. (Ou créez un projet sur https://neon.tech et copiez la « connection string ».) |
| `AUTH_SECRET` | **Oui (très recommandé)** | Protège les sessions et la clé de chiffrement des documents | Un texte aléatoire de 40 caractères ou plus (gestionnaire de mots de passe). **Ne le changez plus ensuite** : les documents déjà enregistrés deviendraient illisibles. |
| `ADMIN_CODE` | **Oui** pour l'administration | Code d'accès du tableau de bord (page votre-site/admin) | Un code long et secret, 8 caractères minimum |
| `GEMINI_API_KEY` | Pour l'assistant IA | Voir `GUIDE-IA.md` | https://aistudio.google.com/apikey |
| `AI_ACCESS_CODE` | Facultatif | Réserve l'assistant IA aux personnes qui connaissent ce code | Au choix |

Ensuite : onglet **Cloud** de l'application › **Créer un compte**. Le tableau de bord est à l'adresse **votre-site/admin** (site web uniquement).

## À prévoir pour la suite

### 1. Envoi d'e-mails (vérification d'adresse, « mot de passe oublié », reçus)
Aujourd'hui, un client qui oublie son mot de passe doit passer par vous : Administration › Comptes › Gérer › **réinitialiser le mot de passe**
(un mot de passe temporaire s'affiche, à lui transmettre). Pour automatiser, il faudra un service d'e-mail :
- **Resend** (https://resend.com, gratuit jusqu'à 3 000 e-mails/mois) ou **Brevo** (https://brevo.com), un **nom de domaine** que vous possédez,
  et les enregistrements DNS (SPF/DKIM) qu'ils vous indiquent ;
- puis la variable `EMAIL_API_KEY` et l'adresse d'expédition (ex. `no-reply@votredomaine.com`).

### 2. Abonnement payant Premium
Le compte, l'offre (`plan`), la date de fin (`plan_until`) et les quotas existent déjà : il suffira de brancher le paiement.
- Un compte **Stripe** (https://stripe.com) vérifié (identité, compte bancaire) ;
- un produit « Premium » avec son prix (mensuel et/ou annuel) ;
- les variables `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` et l'identifiant du prix `STRIPE_PRICE_PREMIUM` ;
- un « webhook » Stripe pointant vers le site (il passera le compte en Premium au paiement, et en Gratuit à l'arrêt de l'abonnement) ;
- vos **conditions générales de vente**, votre **politique de confidentialité** et les mentions légales (obligatoires pour vendre) ;
- à confirmer : les prix et les quotas Premium (actuellement 2 Go et 5 000 documents, modifiables dans `api/_auth.js`).
En attendant, vous pouvez passer un client en Premium à la main : Administration › Comptes › Gérer › Offre.

### 3. Capacité
La base gratuite de Neon offre 0,5 Go : environ 20 comptes gratuits pleins (25 Mo chacun). Au-delà, passez à une offre Neon payante
(quelques dollars par mois) ou réduisez le quota Gratuit dans `api/_auth.js`.

## Sécurité — ce qui est en place
- Mots de passe protégés (scrypt) ; sessions signées de 30 jours ; changement de mot de passe = déconnexion de tous les appareils.
- Limitation des tentatives de connexion et de création de compte.
- Documents chiffrés au repos avec une clé propre à chaque compte, elle-même protégée par `AUTH_SECRET`.
  (Ce n'est pas un chiffrement « de bout en bout » : le serveur peut déchiffrer pour le compte connecté ; cela permet la réinitialisation du mot de passe sans perte de données.)
- L'administrateur ne voit jamais le contenu ni les titres des documents.
- Statistiques d'usage anonymes (sans IP ni identifiant ni contenu), visibles seulement dans le tableau de bord `votre-site/admin`.

## Limites actuelles
3 Mo par document ; Gratuit : 25 Mo et 50 documents.
