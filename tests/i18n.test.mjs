// Tests des langues de l'interface : dictionnaires (anglais, espagnol), modèles à valeurs dynamiques, pluriels, ponctuation de tête.
// Lancer : node tests/i18n.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.document = { documentElement: {}, title: '' };
globalThis.location = { pathname: '/', search: '', hash: '' };
Object.defineProperty(globalThis, 'navigator', { value: { languages: ['fr'] }, configurable: true });
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { loadDictionary, tr, isLang, LANG_NAMES } = await import('../src/i18n.js');
let passed = 0;
const step = async (n, f) => { await f(); passed++; console.log('  ✓', n); };
const ph = (s) => (s.match(/\{\}/g) || []).length;

for (const lang of ['en', 'es']) {
  const d = JSON.parse(fs.readFileSync(`src/i18n/${lang}.json`, 'utf8'));
  await step(`${lang} : dictionnaire sain (valeurs non vides, valeurs dynamiques conservées, > 1500 textes)`, () => {
    assert.ok(Object.keys(d).length > 1500, 'taille ' + Object.keys(d).length);
    for (const [k, v] of Object.entries(d)) { assert.ok(typeof v === 'string' && v.trim(), k); assert.equal(ph(v), ph(k), `{} : « ${k} »`); }
  });
  await step(`${lang} : interface courante traduite (accueil, éditeur, réglages)`, () => {
    loadDictionary(d);
    for (const k of ['Nouveau document', 'Mes documents', 'Paramètres', 'Annuler', 'Enregistrer', 'Mise en page', 'Affichage']) assert.notEqual(tr(k), k, k);
    assert.equal(tr('  Annuler  ').trim(), tr('Annuler'), 'espaces conservés autour');
    assert.ok(tr('  Annuler  ').startsWith('  ') && tr('  Annuler  ').endsWith('  '));
  });
  await step(`${lang} : pluriels et valeurs dynamiques`, () => {
    loadDictionary(d);
    const one = tr('1 mot'), many = tr('12 mots');
    assert.ok(one.startsWith('1 ') && many.startsWith('12 ') && one !== '1 mot' && many !== '12 mots' && one !== many);
    assert.ok(tr('3 lignes').startsWith('3 ') && tr('3 lignes') !== '3 lignes');
    assert.ok(tr('· 5 mots').startsWith('· 5 '), 'ponctuation de tête');
    assert.ok(tr('Page 2 / 9').includes('2') && tr('Page 2 / 9').includes('9'));
  });
  await step(`${lang} : texte inconnu et contenu utilisateur inchangés`, () => {
    loadDictionary(d);
    for (const t of ['Ma lettre à Marie', 'Contrat de location du 12 mars', '', 'zzz inconnu']) assert.equal(tr(t), t);
  });
}
await step('langues gérées : fr, en, es ; noms natifs', () => {
  assert.ok(isLang('fr') && isLang('en') && isLang('es') && !isLang('de'));
  assert.deepEqual(LANG_NAMES, { fr: 'Français', en: 'English', es: 'Español' });
});
console.log(`${passed} étapes réussies.`);
