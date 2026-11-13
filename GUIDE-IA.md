# Configurer l'assistant IA (Gemini) — pas à pas

L'assistant de Luma Office utilise **Google Gemini**. La clé API est **gratuite** pour commencer (limites d'usage) et se règle en 5 minutes.
Deux façons de l'utiliser : **A. clé sur le serveur Vercel (recommandé)** ou **B. votre propre clé sur l'appareil (test rapide)**.

---

## Étape 1 — Créer la clé API Gemini

1. Ouvrez **https://aistudio.google.com/apikey** et connectez-vous avec votre compte Google.
2. Acceptez les conditions, puis cliquez sur **« Créer une clé API »** (Create API key).
3. Si on vous demande un projet : choisissez **« Gemini API »** / créez-en un nouveau.
4. **Copiez la clé** (elle commence par `AIza…`). Gardez-la secrète : ne l'envoyez à personne, ne la collez pas dans un message public.

> Le niveau gratuit suffit pour un usage personnel. Si vous dépassez le quota, un message vous le dit (réessayez plus tard, ou activez la facturation dans Google AI Studio).

---

## Option A (recommandée) — la clé reste secrète sur Vercel

La clé n'apparaît jamais dans l'application : elle est stockée sur le serveur Vercel et utilisée par la fonction `api/gemini.js`.

### Étape 2 — Ajouter la clé dans Vercel
1. Allez sur **https://vercel.com** → ouvrez le projet de Luma Office.
2. **Settings** → **Environment Variables**.
3. Ajoutez :
   - **Key** : `GEMINI_API_KEY`
   - **Value** : collez votre clé `AIza…`
   - Environnements : cochez **Production** (et **Preview** si vous voulez tester les branches).
4. Cliquez **Save**.
5. *(Facultatif)* Ajoutez aussi :
   - `GEMINI_MODEL` = `gemini-2.5-flash` (modèle par défaut du serveur)
   - `AI_ACCESS_CODE` = un mot de passe de votre choix : seules les personnes qui le saisissent dans **Paramètres › Assistant IA › Code d'accès** pourront utiliser l'assistant. **Conseillé** si l'adresse du site est publique, pour que personne d'autre ne consomme votre quota.

### Étape 3 — Redéployer
Une variable d'environnement n'est prise en compte qu'après un nouveau déploiement :
**Deployments** → les trois points `…` du dernier déploiement → **Redeploy**. (Ou poussez simplement un nouveau changement sur `main`.)

### Étape 4 — Tester dans l'application
1. Ouvrez l'application (fermez-la complètement puis rouvrez-la pour charger la dernière version).
2. **Paramètres** → **Assistant IA (Gemini)** → laissez **« Serveur du site »**.
3. Si vous avez défini `AI_ACCESS_CODE`, saisissez-le dans **Code d'accès**.
4. Touchez **« Tester la connexion »**. Vous devez voir : *Connexion réussie ✓*.

| Message | Que faire |
|---|---|
| « Fonction serveur /api/gemini introuvable » | Le site n'est pas déployé sur Vercel avec le dossier `api/`, ou le déploiement n'est pas terminé. |
| « la variable GEMINI_API_KEY n'est pas définie » | Refaites l'étape 2, puis **Redeploy** (étape 3). |
| « Code d'accès incorrect » | Le code saisi diffère de `AI_ACCESS_CODE`. |
| « Clé API invalide » | Recopiez la clé depuis Google AI Studio (sans espace). |
| « Quota atteint » | Patientez une minute, ou changez de modèle (Flash-Lite). |

---

## Option B — votre propre clé, directement sur l'appareil (test rapide)

Sans rien configurer sur Vercel : **Paramètres → Assistant IA → Source de la clé : « Ma clé »**, collez la clé `AIza…`, **Tester la connexion**.
La clé est enregistrée **uniquement sur cet appareil** (navigateur) et envoyée directement à Google. À éviter sur un appareil partagé.

---

## Utiliser l'assistant

- **Dans un document** : onglet **Révision** ou **Outils** → **Assistant IA** (ou menu Fichier). Sélectionnez un passage puis choisissez : Reformuler, Corriger, Raccourcir, Développer, Ton formel/amical, Simplifier, Résumer, En liste, Plan, Continuer, Traduire. Ou écrivez une consigne libre (« Rédige une lettre de relance… »). Puis **Remplacer la sélection**, **Insérer à la suite** ou **Copier**. Vous pouvez demander des ajustements (« plus court ») : la conversation continue.
- **Dans un PDF** : menu ⋮ → **Assistant IA** : résumé, points clés, dates et montants, traduction, ou question libre sur le contenu.

## Confidentialité et coûts

- Le texte concerné (sélection, document ou PDF) est envoyé à Google Gemini. Ne l'utilisez pas pour des documents confidentiels. Une confirmation est demandée à la première utilisation.
- Les documents ne sont pas conservés par Luma Office ailleurs que sur votre appareil.
- Surveillez votre usage sur **https://aistudio.google.com** (et la facturation si vous l'activez).

## Développement local

```bash
npm i -g vercel
cp .env.example .env.local   # puis renseignez GEMINI_API_KEY
vercel dev                    # sert l'application ET la fonction /api/gemini
```
(`npm run dev` seul ne sert pas `/api` : utilisez alors l'option B.)
