# Sécurité de Luma Office — réglages à faire côté Vercel / Neon

## 1. Définir AUTH_SECRET (important)
Tant que `AUTH_SECRET` n'existe pas, la clé qui protège les comptes est dérivée de `DATABASE_URL` : si vous changez le mot de passe de la
base, tous les documents du cloud deviennent illisibles, et quiconque connaît `DATABASE_URL` peut recalculer la clé.
1. Générez 48 caractères aléatoires (gestionnaire de mots de passe, ou `openssl rand -base64 36`).
2. Vercel › Settings › Environment Variables › `AUTH_SECRET` (Production) › Redeploy.
3. Rien à migrer : les comptes existants restent lisibles (le serveur essaie l'ancienne clé en lecture) ; les nouveaux comptes
   utilisent `AUTH_SECRET`. **Ne changez plus ensuite cette valeur** (sauvegardez-la) ; ne supprimez pas non plus `DATABASE_URL`.

## 2. Code administrateur
`ADMIN_CODE` : 12 caractères ou plus, unique (pas réutilisé ailleurs). Les tentatives sont limitées (20 par IP / 10 min) et les échecs
sont enregistrés dans le journal (`admin_login_fail`).

## 3. Base de données (Neon)
- Utilisez un rôle applicatif distinct du propriétaire (Neon › Roles) avec seulement SELECT/INSERT/UPDATE/DELETE/CREATE sur le schéma public.
- `DATABASE_URL` doit contenir `sslmode=require`. Activez les sauvegardes / « point-in-time restore » de Neon.
- Si une clé ou un mot de passe a pu fuiter : régénérez-le (Neon › Roles › Reset password), mettez à jour Vercel, redéployez.

## 4. Clé Gemini
Restreignez la clé dans Google AI Studio / Cloud Console (quota quotidien, alertes de facturation). Le serveur plafonne déjà l'usage
(par IP et par jour, plus un plafond global `AI_DAILY_MAX`).

## 5. En-têtes de sécurité
Définis dans `vercel.json` : CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS. Si une nouvelle fonction externe
(autre serveur, script, iframe) est ajoutée, il faut aussi l'autoriser dans la `Content-Security-Policy` (`connect-src`, `img-src`…).

## 6. Journal de sécurité (admin › Journal)
`login_fail` (connexion client refusée), `admin_login_fail` (code admin refusé), `admin` (actions d'administration), `signup`, `login`.
