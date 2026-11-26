// Pages rendues côté serveur pour le référencement et les aperçus de liens (WhatsApp, Facebook, Telegram, LinkedIn, X, Discord…).
// Les métadonnées sont dans le HTML INITIAL (aucun JavaScript nécessaire pour les robots). Routes (voir vercel.json) :
//   /sitemap.xml, /robots.txt, /telecharger, /en/download, /es/descargar, /en/, /es/, /partage/<id> (privé : aperçu générique + noindex)
import { getSql, initApk } from './_db.js';
import { SITE, BRAND, LOCALES, DEFAULT_LOCALE, ROUTES, TEXTS, PUBLISHER, esc, url, headTags, softwareLd, orgLd, websiteLd, breadcrumbLd, sitemapXml, robotsTxt, hreflangLinks } from './_seo.js';

const num = (v) => Number(v) || 0;
const pickLocale = (l, req) => {
  if (LOCALES.includes(l)) return l;
  const al = String(req.headers['accept-language'] || '').toLowerCase();
  for (const part of al.split(',')) { const c = part.trim().slice(0, 2); if (LOCALES.includes(c)) return c; }
  return DEFAULT_LOCALE;
};
const send = (res, status, type, body, extra = {}) => {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(body);
};

// Page d'accueil de l'application (le HTML construit par Vite) avec les métadonnées de la langue / de la route demandée
let shellCache = { at: 0, html: '' };
async function shell() {
  if (shellCache.html && Date.now() - shellCache.at < 300_000) return shellCache.html;
  const r = await fetch(`${SITE}/index.html`, { headers: { 'user-agent': 'luma-seo-shell' } }); // adresse fixe (pas l'en-tête Host) : pas de SSRF
  if (!r.ok) throw new Error('shell ' + r.status);
  shellCache = { at: Date.now(), html: await r.text() };
  return shellCache.html;
}
export async function renderShell(opts) {
  const html = await shell();
  const head = headTags(opts);
  let out = html.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, `<!--seo:start-->\n    ${head}\n    <!--seo:end-->`);
  out = out.replace(/<html lang="[^"]*"/, `<html lang="${opts.locale}"`);
  if (!/<base /.test(out)) out = out.replace(/<head>/, '<head>\n    <base href="/" />'); // les chemins /en/… ou /partage/… ne cassent pas les ressources relatives
  return out;
}

/* ----- page de téléchargement ----- */
const DL = {
  fr: { h1: 'Luma Office pour Android', lead: 'Éditeur de documents, lecteur PDF avec annotations et signature, et Judy, l’IA qui vous aide à rédiger. Fonctionne hors ligne.', btn: 'Télécharger l’APK', version: 'Version', size: 'Taille', steps: ['Appuyez sur « Télécharger l’APK ».', 'Ouvrez le fichier luma-office.apk téléchargé.', 'Si Android le demande, autorisez l’installation depuis ce navigateur, puis touchez « Installer ».'], missing: 'L’application n’est pas disponible au téléchargement pour le moment. Vous pouvez utiliser Luma Office dans votre navigateur en attendant.', web: 'Ouvrir Luma Office dans le navigateur', share: 'Partager cette page', copied: 'Lien copié', privacy: 'Confidentialité', home: 'Accueil', free: 'Gratuit', alt: 'Logo Luma Office', note: 'Application gratuite. Installation depuis une source inconnue : Android demandera votre autorisation.' },
  en: { h1: 'Luma Office for Android', lead: 'Document editor, PDF reader with annotations and signature, and Judy, the AI that helps you write. Works offline.', btn: 'Download the APK', version: 'Version', size: 'Size', steps: ['Tap “Download the APK”.', 'Open the downloaded luma-office.apk file.', 'If Android asks, allow installation from this browser, then tap “Install”.'], missing: 'The app is not available for download right now. You can use Luma Office in your browser in the meantime.', web: 'Open Luma Office in the browser', share: 'Share this page', copied: 'Link copied', privacy: 'Privacy', home: 'Home', free: 'Free', alt: 'Luma Office logo', note: 'Free app. Installing from an unknown source: Android will ask for your permission.' },
  es: { h1: 'Luma Office para Android', lead: 'Editor de documentos, lector de PDF con anotaciones y firma, y Judy, la IA que te ayuda a escribir. Funciona sin conexión.', btn: 'Descargar el APK', version: 'Versión', size: 'Tamaño', steps: ['Toca «Descargar el APK».', 'Abre el archivo luma-office.apk descargado.', 'Si Android lo solicita, permite la instalación desde este navegador y toca «Instalar».'], missing: 'La aplicación no está disponible para descargar por ahora. Mientras tanto puedes usar Luma Office en tu navegador.', web: 'Abrir Luma Office en el navegador', share: 'Compartir esta página', copied: 'Enlace copiado', privacy: 'Privacidad', home: 'Inicio', free: 'Gratis', alt: 'Logotipo de Luma Office', note: 'Aplicación gratuita. Instalación desde una fuente desconocida: Android pedirá tu permiso.' },
};
async function apkInfo() {
  try {
    const sql = await getSql(); if (!sql) return { available: false };
    await initApk(sql);
    const r = (await sql`SELECT version, size, created FROM luma_apk WHERE complete = true ORDER BY created DESC LIMIT 1`)[0];
    return r ? { available: true, version: r.version, size: num(r.size), created: num(r.created) } : { available: false };
  } catch { return { available: false }; }
}
export function downloadHtml(locale, info) {
  const d = DL[locale], t = TEXTS[locale];
  const head = headTags({
    key: 'download', locale,
    jsonld: [softwareLd(locale, info), breadcrumbLd([{ name: d.home, url: url('home', locale) }, { name: t.download.title.split(' — ')[0], url: url('download', locale) }]), orgLd()],
  });
  const langs = LOCALES.map((l) => `<a href="${esc(url('download', l))}" hreflang="${l}" lang="${l}"${l === locale ? ' aria-current="true"' : ''}>${l.toUpperCase()}</a>`).join(' · ');
  const meta = info.available ? `<p class="meta">${d.version} ${esc(info.version)} · ${(info.size / 1048576).toFixed(1)} Mo · ${d.free}</p>` : '';
  const action = info.available
    ? `<a class="btn" href="/luma-office.apk" download="luma-office.apk" rel="nofollow">${d.btn}</a>`
    : `<p class="warn">${esc(d.missing)}</p>`;
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${head}
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <style>
      :root{--navy:#001e6c;--blue:#0b57d0;--ink:#1f2937;--muted:#5b6475;--bg:#f4f6fb}
      *{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg)}
      header{background:var(--navy);color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center}header a{color:#fff;text-decoration:none;font-weight:700}
      nav a{color:#cfe0ff;margin:0 2px}nav a[aria-current]{color:#fff;font-weight:700}
      main{max-width:640px;margin:0 auto;padding:24px 16px 48px}h1{font-size:1.7rem;margin:.2em 0}
      .logo{width:96px;height:96px}.lead{color:var(--muted)}.meta{color:var(--muted);margin:.4em 0 1em}
      .btn,button{display:inline-block;background:var(--blue);color:#fff;border:0;border-radius:12px;padding:14px 22px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}
      button.sec{background:#fff;color:var(--blue);border:2px solid var(--blue);margin-left:8px}
      .warn{background:#fff4e5;border:1px solid #f5b971;border-radius:12px;padding:12px 14px}ol{padding-left:1.2em}li{margin:.4em 0}
      footer{max-width:640px;margin:0 auto;padding:0 16px 32px;color:var(--muted);font-size:.9rem}footer a{color:var(--blue)}
    </style>
  </head>
  <body>
    <header><a href="${esc(url('home', locale))}">${BRAND}</a><nav aria-label="Language">${langs}</nav></header>
    <main>
      <img class="logo" src="/icons/icon-192.png" width="96" height="96" alt="${esc(d.alt)}" />
      <h1>${esc(d.h1)}</h1>
      <p class="lead">${esc(d.lead)}</p>
      ${meta}
      <p>${action} <button type="button" class="sec" id="share" data-copied="${esc(d.copied)}" data-title="${esc(t.download.title)}" hidden>${esc(d.share)}</button></p>
      <ol>${d.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <p><a href="${esc(url('home', locale))}">${esc(d.web)}</a></p>
      <p class="meta">${esc(d.note)}</p>
    </main>
    <footer><a href="${esc(url('home', locale))}">${esc(d.home)}</a> · <a href="${esc(url('privacy'))}">${esc(d.privacy)}</a> · <a href="${esc(PUBLISHER.url)}" rel="noopener">${esc(PUBLISHER.name)}</a></footer>
    <script src="/share-page.js" defer></script>
  </body>
</html>
`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return send(res, 405, 'text/plain; charset=utf-8', 'Méthode non autorisée.'); }
  const q = new URL(req.url || '/', SITE).searchParams;
  const route = q.get('r') || '';
  const locale = pickLocale(q.get('l'), req);
  try {
    if (route === 'sitemap') return send(res, 200, 'application/xml; charset=utf-8', sitemapXml(), { 'Cache-Control': 'public, max-age=0, s-maxage=3600' });
    if (route === 'robots') return send(res, 200, 'text/plain; charset=utf-8', robotsTxt(), { 'Cache-Control': 'public, max-age=0, s-maxage=3600' });
    if (route === 'download') {
      if (!ROUTES.download[locale]) return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
      return send(res, 200, 'text/html; charset=utf-8', downloadHtml(locale, await apkInfo()), { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' });
    }
    if (route === 'home') return send(res, 200, 'text/html; charset=utf-8', await renderShell({ key: 'home', locale, jsonld: [websiteLd(locale), softwareLd(locale), orgLd()] }), { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' });
    if (route === 'share') { // lien privé : aperçu GÉNÉRIQUE (jamais le titre ni le contenu du document), non indexable
      const l = pickLocale(null, req);
      return send(res, 200, 'text/html; charset=utf-8', await renderShell({ key: 'share', locale: l, robots: 'noindex,nofollow', canonical: SITE + '/', jsonld: [] }), { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    }
    return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  } catch (e) {
    console.error('[page]', e?.message);
    return send(res, 500, 'text/plain; charset=utf-8', 'Erreur du serveur.');
  }
}
export { hreflangLinks };
