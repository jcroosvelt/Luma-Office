# SEO, aperçus de liens et App Links — mode d'emploi

## Architecture (une seule source de vérité : `api/_seo.js`)
- **Inventaire des routes** (`ROUTES`) : accueil (`/`, `/en/`, `/es/`), téléchargement (`/telecharger`, `/en/download`, `/es/descargar`), confidentialité.
  Non indexables : `/admin`, `/api/*`, `/luma-office.apk`, `/partage/<id>` (privé), documents locaux (`#/doc/…`).
- **Métadonnées** générées par `headTags()` (titre, description, canonical, robots, Open Graph, Twitter, hreflang, JSON-LD). Titres et descriptions
  par langue dans `TEXTS` (jamais deux fois le même texte : test automatique).
- **Accueil** : balises écrites dans le HTML construit par Vite (plugin `seoHtml` de `vite.config.js`).
- **Pages rendues côté serveur** (`api/page.js`, réécritures dans `vercel.json`) : téléchargement (version et taille lues dans la base), accueil `/en/` et `/es/`,
  aperçu générique des liens de partage, `sitemap.xml` et `robots.txt` (générés depuis l'inventaire).
- **Images d'aperçu** 1200×630 : `public/og/*.png`, générées par `tools/make-og.py`.
- **Liens de partage** `/partage/<id>` : aperçu générique + `noindex` (jamais le titre ni le contenu du document).
- **App Links Android** : `public/.well-known/assetlinks.json` (empreinte de la clé de signature actuelle) + filtre d'intention vérifié dans le manifeste
  (workflow de l'app) : `/partage/*`, `/`, `/en/`, `/es/` ouvrent l'application ; sinon la page web s'ouvre.

## Actions qui ne dépendent que de vous
1. **Google Search Console** : ajouter `https://lumaoffice.vercel.app`, valider la propriété, envoyer `https://lumaoffice.vercel.app/sitemap.xml`.
2. **Google Play** : après la 1re publication, ajouter l'empreinte SHA-256 de la clé de signature Play (Play Console › Intégrité de l'application) dans
   `public/.well-known/assetlinks.json` (en plus de l'empreinte actuelle).
3. **Aperçus mis en cache** : Facebook/Messenger → https://developers.facebook.com/tools/debug/ (« Scrape Again ») ; LinkedIn → Post Inspector ;
   WhatsApp/Telegram : l'aperçu se rafraîchit seul (Telegram : @WebpageBot). X n'a plus de validateur : tester en publiant.
4. **Vérifier les App Links sur un téléphone** (APK 1.54+ installé) : `adb shell pm get-app-links com.lumaoffice.luma_office_app` doit montrer `lumaoffice.vercel.app: verified`.
5. Fusionner la branche `security-hardening` (en-têtes CSP) : `vercel.json` a été modifié des deux côtés (conflit simple à résoudre).

## Langues (fr, en, es)
Interface : textes du code en français, traduits à l'exécution (`src/i18n.js`, dictionnaires `src/i18n/{en,es}.json`). Après une modification de textes :
`python3 tools/i18n-extract.py site src tools/i18n/site-fr.json` puis `node tools/i18n-translate.mjs site en` et `… site es` (ne traduit que les nouveaux textes) puis
`python3 tools/i18n-build.py <dossier_app>`. Les pluriels courants sont dans `tools/i18n/manual.json`.
