// Tests du système SEO : métadonnées, unicité, canonical, hreflang, sitemap, robots, JSON-LD, pages rendues côté serveur, aperçus privés, assetlinks.
// Lancer : node tests/seo.test.mjs   (après « vite build » pour contrôler aussi dist/index.html)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
globalThis.__LUMA_SQL = async (strings, ...vals) => {
  const q = strings.reduce((a, s, i) => a + s + (i < vals.length ? `$${i + 1}` : ''), '');
  return (await db.query(q, vals)).rows;
};
const seo = await import('../api/_seo.js');
const page = await import('../api/page.js');
const handler = page.default;
let passed = 0;
const step = async (n, f) => { await f(); passed++; console.log('  ✓', n); };

// faux index.html servi par fetch (la fonction lit la coquille de l'application à l'adresse fixe du site)
const indexHtml = fs.existsSync('dist/index.html') ? fs.readFileSync('dist/index.html', 'utf8')
  : '<!doctype html><html lang="fr"><head><meta charset="UTF-8" /><!--seo:start--><title>x</title><!--seo:end--></head><body><div id="app"></div></body></html>';
globalThis.fetch = async (u) => { assert.ok(String(u).startsWith(seo.SITE + '/index.html'), 'adresse de coquille fixe : ' + u); return new Response(indexHtml, { status: 200 }); };

const call = (url, headers = {}) => new Promise((resolve) => {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, body: String(b ?? '') }); } };
  handler({ method: 'GET', url, headers }, res);
});
const meta = (html, name, attr = 'name') => (new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`).exec(html) || [])[1];

await step('titres et descriptions uniques sur toutes les pages et langues', () => {
  const seen = new Set();
  for (const l of seo.LOCALES) for (const k of ['home', 'download', 'share', 'privacy']) {
    const t = seo.TEXTS[l][k];
    assert.ok(t.title && t.description, `${l}/${k}`);
    assert.ok(t.title.length <= 70 && t.description.length >= 70 && t.description.length <= 200, `longueurs ${l}/${k}`);
    for (const v of [t.title, t.description]) { assert.ok(!seen.has(v), 'doublon : ' + v); seen.add(v); }
  }
});
await step('balises complètes : canonical, robots, Open Graph, Twitter, URL absolues HTTPS', () => {
  const h = seo.headTags({ key: 'home', locale: 'fr' });
  for (const k of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'og:image:type', 'og:site_name', 'og:locale']) assert.ok(meta(h, k, 'property'), k);
  for (const k of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'description', 'robots', 'theme-color']) assert.ok(meta(h, k), k);
  assert.match(h, /<link rel="canonical" href="https:\/\/lumaoffice\.vercel\.app\/" \/>/);
  assert.match(meta(h, 'og:image', 'property'), /^https:\/\/.+\/og\/luma-office\.png$/);
  assert.equal(meta(h, 'og:image:width', 'property'), '1200');
  assert.equal(meta(h, 'twitter:card'), 'summary_large_image');
});
await step('images d’aperçu : fichiers PNG 1200×630 présents', () => {
  for (const f of ['public/og/luma-office.png', 'public/og/telecharger.png']) {
    const b = fs.readFileSync(f);
    assert.equal(b.subarray(1, 4).toString(), 'PNG');
    assert.equal(b.readUInt32BE(16), 1200);
    assert.equal(b.readUInt32BE(20), 630);
  }
});
await step('canonical : normalisation (suivi, fragment, casse, barre finale, doubles barres)', () => {
  assert.equal(seo.canonicalOf('/telecharger/?utm_source=x#a'), seo.SITE + '/telecharger');
  assert.equal(seo.canonicalOf('/Telecharger'), seo.SITE + '/telecharger');
  assert.equal(seo.canonicalOf('//en//'), seo.SITE + '/en/');
  assert.equal(seo.canonicalOf('/'), seo.SITE + '/');
});
await step('hreflang réciproques fr/en/es + x-default', () => {
  const h = seo.headTags({ key: 'download', locale: 'en' });
  for (const l of seo.LOCALES) assert.ok(h.includes(`hreflang="${l}" href="${seo.url('download', l)}"`), l);
  assert.ok(h.includes('hreflang="x-default"'));
  assert.ok(h.includes('<link rel="canonical" href="' + seo.url('download', 'en') + '"'));
  assert.equal(seo.hreflangLinks('privacy'), '', 'pas de fausse traduction');
});
await step('sitemap : seulement les URL à indexer, absolues, jamais privé/admin/api/apk', async () => {
  const r = await call('/api/page?r=sitemap');
  assert.equal(r.status, 200);
  assert.match(r.headers['Content-Type'], /xml/);
  const locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.includes(seo.SITE + '/') && locs.includes(seo.SITE + '/telecharger') && locs.includes(seo.SITE + '/en/download') && locs.includes(seo.SITE + '/es/'));
  for (const u of locs) { assert.ok(u.startsWith('https://')); assert.doesNotMatch(u, /admin|\/api|partage|\.apk|#/); }
  assert.equal(new Set(locs).size, locs.length, 'pas de doublon');
});
await step('robots.txt : explorable, sitemap déclaré, API et admin exclus, aperçus non bloqués', async () => {
  const r = await call('/api/page?r=robots');
  assert.match(r.body, /Sitemap: https:\/\/lumaoffice\.vercel\.app\/sitemap\.xml/);
  assert.match(r.body, /Disallow: \/api\//);
  assert.match(r.body, /Disallow: \/admin/);
  assert.doesNotMatch(r.body, /Disallow: \/og|Disallow: \/assets|Disallow: \/$/m);
});
await step('JSON-LD : valide, sans note ni avis inventés, sans évasion de <script>', () => {
  const h = seo.headTags({ key: 'home', locale: 'en', jsonld: [seo.softwareLd('en', { version: '1.2.3', available: true, size: 5e6 }), seo.websiteLd('en'), seo.orgLd()] });
  const blocks = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 3);
  const app = blocks.find((b) => b['@type'] === 'SoftwareApplication');
  assert.equal(app.softwareVersion, '1.2.3');
  assert.equal(app.offers.price, '0');
  assert.ok(!('aggregateRating' in app) && !('review' in app));
  const evil = seo.ldJson({ a: '</script><script>alert(1)</script>' });
  assert.ok(!evil.includes('</script>'));
  assert.equal(JSON.parse(evil).a, '</script><script>alert(1)</script>');
  assert.equal(seo.esc('<b onload="x">&\'</b>'), '&lt;b onload=&quot;x&quot;&gt;&amp;&#39;&lt;/b&gt;');
});
await step('page de téléchargement : HTML initial complet dans les 3 langues, version et lien APK', async () => {
  for (const [path, l] of [['/api/page?r=download&l=fr', 'fr'], ['/api/page?r=download&l=en', 'en'], ['/api/page?r=download&l=es', 'es']]) {
    // APK présent en base
    await db.query(`CREATE TABLE IF NOT EXISTS luma_apk (id text PRIMARY KEY, version text NOT NULL, size bigint NOT NULL, sha256 text NOT NULL, chunks int NOT NULL, chunk_size int NOT NULL, created bigint NOT NULL, complete boolean NOT NULL DEFAULT false)`);
    await db.query(`CREATE TABLE IF NOT EXISTS luma_apk_chunks (apk_id text NOT NULL, n int NOT NULL, data text NOT NULL, PRIMARY KEY (apk_id, n))`);
    await db.query(`DELETE FROM luma_apk`);
    await db.query(`INSERT INTO luma_apk VALUES ('a', '1.53.0', 39808081, 'x', 1, 1, 1, true)`);
    const r = await call(path);
    assert.equal(r.status, 200);
    assert.match(r.body, new RegExp(`<html lang="${l}">`));
    assert.equal(meta(r.body, 'og:title', 'property'), seo.TEXTS[l].download.title);
    assert.ok(r.body.includes('1.53.0') && r.body.includes('href="/luma-office.apk"'));
    assert.ok(r.body.includes('"@type":"SoftwareApplication"') && r.body.includes('"softwareVersion":"1.53.0"') && r.body.includes('BreadcrumbList'));
    assert.match(r.body, /<h1>/);
    assert.ok(r.body.includes('hreflang="es"'));
  }
});
await step('page de téléchargement sans APK : message clair, pas de lien mort ni de version inventée', async () => {
  await db.query('DELETE FROM luma_apk');
  const r = await call('/api/page?r=download&l=fr');
  assert.equal(r.status, 200);
  assert.ok(!r.body.includes('href="/luma-office.apk"') && !r.body.includes('softwareVersion'));
  assert.match(r.body, /pas disponible/);
});
await step('accueil /en/ et /es/ : langue, canonical, hreflang, <base> pour les ressources relatives', async () => {
  const r = await call('/api/page?r=home&l=es');
  assert.match(r.body, /<html lang="es"/);
  assert.equal(meta(r.body, 'og:title', 'property'), seo.TEXTS.es.home.title);
  assert.ok(r.body.includes('<link rel="canonical" href="https://lumaoffice.vercel.app/es/"'));
  assert.ok(r.body.includes('<base href="/" />'));
  assert.equal((r.body.match(/<title>/g) || []).length, 1, 'un seul <title>');
});
await step('lien de partage privé : aperçu générique, noindex, aucun contenu ni identifiant dans le HTML', async () => {
  const r = await call('/api/page?r=share', { 'accept-language': 'en-US,en;q=0.9' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.match(r.body, /name="robots" content="noindex,nofollow"/);
  assert.equal(meta(r.body, 'og:title', 'property'), seo.TEXTS.en.share.title);
  assert.ok(!/[a-f0-9]{24}/.test(r.body.replace(/https:\/\/[^"]+/g, '')), 'pas d’identifiant');
  assert.doesNotMatch(r.body, /"@type":"SoftwareApplication"/);
});
await step('routes inconnues : 404 ; méthode non autorisée : 405', async () => {
  assert.equal((await call('/api/page?r=nimportequoi')).status, 404);
  const res = { statusCode: 0, headers: {}, setHeader() {}, end() {} };
  await handler({ method: 'POST', url: '/api/page', headers: {} }, res);
  assert.equal(res.statusCode, 405);
});
await step('vercel.json : réécritures, noindex sur API / APK / partage, pas de conflit avec les fichiers', () => {
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const rw = Object.fromEntries(v.rewrites.map((x) => [x.source, x.destination]));
  for (const [s, d] of [['/sitemap.xml', 'r=sitemap'], ['/robots.txt', 'r=robots'], ['/telecharger', 'r=download&l=fr'], ['/en/download', 'r=download&l=en'], ['/es/descargar', 'r=download&l=es'], ['/partage/:id', 'r=share'], ['/luma-office.apk', '/api/apk'], ['/apk-info.json', '/api/apk?info=1']]) assert.ok((rw[s] || '').includes(d), s);
  const noindex = v.headers.filter((h) => h.headers.some((x) => x.key === 'X-Robots-Tag' && /noindex/.test(x.value))).map((h) => h.source);
  for (const s of ['/api/(.*)', '/luma-office.apk', '/partage/(.*)', '/admin']) assert.ok(noindex.includes(s), s);
  for (const f of ['public/robots.txt', 'public/sitemap.xml', 'public/telecharger', 'public/telecharger.html']) assert.ok(!fs.existsSync(f), f + ' masquerait la réécriture');
});
await step('Android App Links : assetlinks.json valide (package réel, empreinte SHA-256 de la clé de signature)', () => {
  const a = JSON.parse(fs.readFileSync('public/.well-known/assetlinks.json', 'utf8'));
  assert.equal(a[0].target.package_name, seo.ANDROID_PACKAGE);
  assert.deepEqual(a[0].relation, ['delegate_permission/common.handle_all_urls']);
  for (const f of a[0].target.sha256_cert_fingerprints) assert.match(f, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});
await step('page d’accueil construite : métadonnées dans le HTML initial (sans JavaScript)', () => {
  if (!fs.existsSync('dist/index.html')) return console.log('    (dist absent : étape ignorée)');
  const h = fs.readFileSync('dist/index.html', 'utf8');
  for (const k of ['og:title', 'og:image', 'og:url']) assert.ok(meta(h, k, 'property'), k);
  assert.ok(h.includes('rel="canonical"') && h.includes('application/ld+json') && h.includes('<html lang="fr">'));
  assert.equal((h.match(/<title>/g) || []).length, 1);
  assert.ok(h.includes('<!--seo:start-->'), 'repères conservés pour les pages /en/, /es/ et /partage/');
  assert.ok(fs.existsSync('dist/og/luma-office.png') && fs.existsSync('dist/.well-known/assetlinks.json'));
});
console.log(`${passed} étapes réussies.`);
