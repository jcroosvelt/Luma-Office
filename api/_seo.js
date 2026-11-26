// Système SEO central de Luma Office : inventaire des routes, métadonnées (titre, description, canonical, Open Graph, Twitter),
// données structurées JSON-LD, hreflang, sitemap et robots.txt. Une seule source de vérité, utilisée par :
//  - vite.config.js (balises de la page d'accueil, dans le HTML initial),
//  - api/page.js (pages rendues côté serveur : /telecharger, /en/…, /es/…, /partage/…, /sitemap.xml, /robots.txt).
// Les fichiers commençant par « _ » ne sont pas des routes.

export const SITE = process.env.SITE_URL || 'https://lumaoffice.vercel.app';
export const BRAND = 'Luma Office';
export const PUBLISHER = { name: 'JC Multimedia', url: 'https://www.jcmultimedia.online' };
export const ANDROID_PACKAGE = 'com.lumaoffice.luma_office_app';
export const LOCALES = ['fr', 'en', 'es'];
export const DEFAULT_LOCALE = 'fr';
export const OG_LOCALE = { fr: 'fr_FR', en: 'en_US', es: 'es_ES' };
export const THEME_COLOR = '#001e6c';
export const OG_IMAGE = { w: 1200, h: 630, type: 'image/png' };

// Textes référencés (jamais le même titre ni la même description pour deux pages)
export const TEXTS = {
  fr: {
    home: { title: 'Luma Office — Traitement de texte et lecteur PDF pour mobile', description: 'Écrivez, lisez, annotez et signez vos documents Word et PDF sur téléphone et tablette. Fonctionne hors ligne, avec Judy, l’IA intégrée qui rédige pour vous.', ogAlt: 'Luma Office : traitement de texte et lecteur PDF pour mobile' },
    download: { title: 'Télécharger Luma Office pour Android — application gratuite', description: 'Téléchargez l’application Android Luma Office : éditeur de documents, lecteur PDF avec annotations et signature, hors ligne. Installation en 3 étapes.', ogAlt: 'Télécharger l’application Android Luma Office' },
    share: { title: 'Document partagé avec vous — Luma Office', description: 'Un document a été partagé avec vous sur Luma Office. Connectez-vous avec le compte invité pour le lire et le commenter.', ogAlt: 'Document partagé sur Luma Office' },
    privacy: { title: 'Politique de confidentialité — Luma Office', description: 'Comment Luma Office protège vos documents : stockage local, cloud chiffré facultatif, Judy facultative, autorisations Android.' },
    app: { name: 'Luma Office', category: 'Productivité', featureList: ['Traitement de texte', 'Lecteur PDF avec annotations et signature', 'Import et export Word, PDF, Excel', 'Judy, IA d’aide à la rédaction', 'Partage de documents entre comptes', 'Fonctionne hors ligne'] },
  },
  en: {
    home: { title: 'Luma Office — Word processor and PDF reader for mobile', description: 'Write, read, annotate and sign your Word and PDF documents on phone and tablet. Works offline, with Judy, the built-in AI that writes for you.', ogAlt: 'Luma Office: word processor and PDF reader for mobile' },
    download: { title: 'Download Luma Office for Android — free app', description: 'Download the Luma Office Android app: document editor, PDF reader with annotations and signature, works offline. Install in 3 steps.', ogAlt: 'Download the Luma Office Android app' },
    share: { title: 'A document was shared with you — Luma Office', description: 'A document was shared with you on Luma Office. Sign in with the invited account to read and comment on it.', ogAlt: 'Document shared on Luma Office' },
    privacy: { title: 'Privacy policy — Luma Office', description: 'How Luma Office protects your documents: local storage, optional encrypted cloud, optional Judy, Android permissions.' },
    app: { name: 'Luma Office', category: 'Productivity', featureList: ['Word processor', 'PDF reader with annotations and signature', 'Word, PDF and Excel import and export', 'Judy, AI writing help', 'Document sharing between accounts', 'Works offline'] },
  },
  es: {
    home: { title: 'Luma Office — Procesador de texto y lector de PDF para móvil', description: 'Escribe, lee, anota y firma tus documentos Word y PDF en teléfono y tableta. Funciona sin conexión, con Judy, la IA integrada que redacta por ti.', ogAlt: 'Luma Office: procesador de texto y lector de PDF para móvil' },
    download: { title: 'Descargar Luma Office para Android — aplicación gratuita', description: 'Descarga la aplicación Android Luma Office: editor de documentos, lector de PDF con anotaciones y firma, sin conexión. Instalación en 3 pasos.', ogAlt: 'Descargar la aplicación Android Luma Office' },
    share: { title: 'Un documento compartido contigo — Luma Office', description: 'Se ha compartido un documento contigo en Luma Office. Inicia sesión con la cuenta invitada para leerlo y comentarlo.', ogAlt: 'Documento compartido en Luma Office' },
    privacy: { title: 'Política de privacidad — Luma Office', description: 'Cómo Luma Office protege tus documentos: almacenamiento local, nube cifrada opcional, Judy opcional, permisos de Android.' },
    app: { name: 'Luma Office', category: 'Productividad', featureList: ['Procesador de texto', 'Lector de PDF con anotaciones y firma', 'Importación y exportación de Word, PDF y Excel', 'Judy, IA de ayuda para escribir', 'Compartir documentos entre cuentas', 'Funciona sin conexión'] },
  },
};

// Inventaire des routes publiques indexables : clé → chemin par langue (une URL distincte par langue pour hreflang)
export const ROUTES = {
  home: { fr: '/', en: '/en/', es: '/es/', image: '/og/luma-office.png' },
  download: { fr: '/telecharger', en: '/en/download', es: '/es/descargar', image: '/og/telecharger.png' },
  privacy: { fr: '/confidentialite.html', image: '/og/luma-office.png' }, // une seule langue pour l'instant (pas de fausse traduction)
};
// Routes non indexables (pour mémoire) : /admin, /api/*, /luma-office.apk, /partage/<id> (privé), #/doc/<id> (documents locaux)

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// JSON-LD sûr dans une balise <script> : « < » échappé pour empêcher toute sortie du bloc
export const ldJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const origin = (u) => (u.startsWith('http') ? u : SITE + u);
export const url = (key, locale = DEFAULT_LOCALE) => origin((ROUTES[key] || {})[locale] || (ROUTES[key] || {})[DEFAULT_LOCALE] || '/');

// Adresse canonique : sans paramètres de suivi, sans fragment, sans barre finale superflue (sauf la racine et les dossiers de langue)
export function canonicalOf(pathname) {
  let p = String(pathname || '/').split(/[?#]/)[0].replace(/\/{2,}/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  p = p.toLowerCase() === p ? p : p.toLowerCase();
  if (p.length > 1 && p.endsWith('/') && !/^\/(en|es)\/$/.test(p)) p = p.slice(0, -1);
  return SITE + p;
}

export function hreflangLinks(key) {
  const r = ROUTES[key]; if (!r) return '';
  const langs = LOCALES.filter((l) => r[l]);
  if (langs.length < 2) return '';
  return langs.map((l) => `<link rel="alternate" hreflang="${l}" href="${esc(url(key, l))}" />`).join('\n    ')
    + `\n    <link rel="alternate" hreflang="x-default" href="${esc(url(key, DEFAULT_LOCALE))}" />`;
}

/** Balises <head> d'une page. opts : { key, locale, robots, canonical, title, description, image, imageAlt, type, jsonld[] } */
export function headTags(opts) {
  const locale = LOCALES.includes(opts.locale) ? opts.locale : DEFAULT_LOCALE;
  const t = (TEXTS[locale][opts.key] || TEXTS[DEFAULT_LOCALE][opts.key] || {});
  const title = opts.title || t.title, description = opts.description || t.description;
  const canonical = opts.canonical || url(opts.key, locale);
  const image = origin(opts.image || (ROUTES[opts.key] || {}).image || '/og/luma-office.png');
  const alt = opts.imageAlt || t.ogAlt || title;
  const robots = opts.robots || 'index,follow,max-image-preview:large';
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta name="robots" content="${esc(robots)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta name="theme-color" content="${THEME_COLOR}" />`,
    `<meta property="og:type" content="${esc(opts.type || 'website')}" />`,
    `<meta property="og:site_name" content="${BRAND}" />`,
    `<meta property="og:locale" content="${OG_LOCALE[locale]}" />`,
    ...LOCALES.filter((l) => l !== locale && (ROUTES[opts.key] || {})[l]).map((l) => `<meta property="og:locale:alternate" content="${OG_LOCALE[l]}" />`),
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:secure_url" content="${esc(image)}" />`,
    `<meta property="og:image:type" content="${OG_IMAGE.type}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE.w}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE.h}" />`,
    `<meta property="og:image:alt" content="${esc(alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<meta name="twitter:image:alt" content="${esc(alt)}" />`,
  ];
  const hl = hreflangLinks(opts.key); if (hl) lines.push(hl);
  for (const j of opts.jsonld || []) lines.push(`<script type="application/ld+json">${ldJson(j)}</script>`);
  return lines.join('\n    ');
}

/* ----- générateurs de données structurées (valeurs = contenu réellement visible sur le site) ----- */
export const orgLd = () => ({ '@context': 'https://schema.org', '@type': 'Organization', name: BRAND, url: SITE + '/', logo: SITE + '/icons/icon-512.png', parentOrganization: { '@type': 'Organization', name: PUBLISHER.name, url: PUBLISHER.url } });
export const websiteLd = (locale = DEFAULT_LOCALE) => ({ '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: url('home', locale), inLanguage: locale, publisher: { '@type': 'Organization', name: PUBLISHER.name, url: PUBLISHER.url } });
export function softwareLd(locale = DEFAULT_LOCALE, info = {}) {
  const t = TEXTS[locale].app;
  return {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: t.name, applicationCategory: 'BusinessApplication', operatingSystem: 'Android, Web',
    description: TEXTS[locale].home.description, url: url('home', locale), inLanguage: locale, image: SITE + '/og/luma-office.png',
    featureList: t.featureList, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    ...(info.version ? { softwareVersion: info.version } : {}), ...(info.available ? { downloadUrl: SITE + '/luma-office.apk', fileSize: info.size ? `${Math.round(info.size / 1048576)} MB` : undefined } : {}),
    publisher: { '@type': 'Organization', name: PUBLISHER.name, url: PUBLISHER.url },
  };
}
export const breadcrumbLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })) });

/* ----- sitemap.xml et robots.txt : générés depuis l'inventaire (seulement les URL à indexer) ----- */
export function sitemapXml(lastmod = new Date().toISOString().slice(0, 10)) {
  const out = [];
  for (const [key, r] of Object.entries(ROUTES)) {
    const langs = LOCALES.filter((l) => r[l]);
    for (const l of langs) {
      const alts = langs.length > 1 ? langs.map((x) => `<xhtml:link rel="alternate" hreflang="${x}" href="${esc(url(key, x))}"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(url(key, DEFAULT_LOCALE))}"/>` : '';
      out.push(`<url><loc>${esc(url(key, l))}</loc><lastmod>${lastmod}</lastmod>${alts}</url>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${out.join('\n')}\n</urlset>\n`;
}
export const robotsTxt = () => `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n\n# /partage/ et /luma-office.apk restent explorables (aperçus de liens) mais portent « noindex » (en-tête X-Robots-Tag) ;\n# les images d'aperçu (/og/), les scripts et les styles restent explorables.\nSitemap: ${SITE}/sitemap.xml\n`;
