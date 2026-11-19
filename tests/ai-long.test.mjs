// Test de la rédaction longue (logique pure, faux assistant). Lancer : node tests/ai-long.test.mjs
import assert from 'node:assert/strict';
import { requestedPages, wantsLongDocument, sectionCountFor, longPages, parseOutline, writeLongDocument } from '../src/ai-long.js';

const outline = (k) => '```json\n' + JSON.stringify({ title: 'Règlement intérieur de la chorale', sections: Array.from({ length: k }, (_, i) => ({ heading: `${i + 1}. Partie ${i + 1}`, points: ['a', 'b'] })) }) + '\n```';
let n = 0; const ok = (name) => console.log('  ✓', name), run = (f) => { f(); n++; };

run(() => {
  assert.equal(wantsLongDocument('Fais-moi un règlement intérieur pour une chorale'), true);
  assert.equal(wantsLongDocument('Rédige un contrat de location'), true);
  assert.equal(wantsLongDocument('corrige les fautes'), false);
  assert.equal(wantsLongDocument('écris un petit mail pour mon patron'), false);
  assert.equal(wantsLongDocument('Quel est le règlement ?'), false);
  assert.equal(requestedPages('un document de 10 pages'), 10);
  assert.equal(requestedPages('entre 8 et 12 pages'), 12);
  assert.equal(requestedPages('une dizaine de pages'), 10);
  assert.equal(requestedPages('500 pages'), null);
  assert.equal(requestedPages('résume'), null);
  assert.deepEqual([sectionCountFor(10), sectionCountFor(1), sectionCountFor(40)], [14, 4, 24]);
  assert.equal(longPages('court', 'rédige un règlement'), null);
  assert.equal(longPages('long', 'hello'), 10);
  assert.equal(longPages('tres', 'hello'), 22);
  assert.equal(longPages('tres', 'un document de 15 pages'), 15);
  assert.equal(longPages('auto', 'Fais un règlement intérieur'), 10);
  assert.equal(longPages('auto', 'corrige'), null);
  ok('détection, pages et choix de longueur');
});
run(() => {
  assert.equal(parseOutline(outline(5)).sections.length, 5);
  assert.equal(parseOutline('voici : {"title":"T","sections":[{"heading":"## A"},{"heading":"B"}]} fin').sections[0].heading, 'A');
  assert.equal(parseOutline('pas du json'), null);
  assert.equal(parseOutline('{"title":"T","sections":[{"heading":"seule"}]}'), null);
  ok('lecture du plan');
});
{
  const prompts = [], progress = [];
  const r = await writeLongDocument({
    instruction: 'Fais un règlement intérieur pour une chorale', pages: 10, cancelled: () => false, onProgress: (_, s) => progress.push(s),
    ask: async (m, o) => { const t = m[0].text; prompts.push(t); if (o.json) return outline(14); const i = +/section n°(\d+)/.exec(t)[1]; return i === 3 ? 'Texte sans titre' : `## ${i}. Partie ${i}\n${'mot '.repeat(300)}fin de la section ${i}.`; },
  });
  assert.equal(r.done, true); assert.equal(prompts.length, 15);
  assert.ok(r.text.startsWith('# Règlement intérieur de la chorale'));
  assert.equal((r.text.match(/^## /gm) || []).length, 14);
  assert.ok(r.text.includes('## 3. Partie 3\nTexte sans titre'));
  assert.ok(prompts[1].includes('environ 321 mots (entre 273 et 385 mots)'));
  assert.ok(!prompts[1].includes('Fin de la section précédente') && prompts[2].includes('fin de la section 1.'));
  assert.equal(progress[0], 'Préparation du plan du document…'); assert.ok(progress.includes('Rédaction de la section 7/14 : 7. Partie 7…')); assert.equal(progress.at(-1), 'Terminé');
  n++; ok('rédaction section par section : longueur, continuité, assemblage');
}
{
  let calls = 0, stop = false;
  const r = await writeLongDocument({ instruction: 'Rédige un rapport', pages: 6, cancelled: () => stop, onProgress() {}, ask: async (m, o) => { calls++; if (o.json) return outline(8); if (calls === 3) stop = true; return `## S\ncontenu ${calls}`; } });
  assert.equal(r.done, false); assert.match(r.note, /arrêtée/); assert.ok(r.text.includes('contenu 3') && !r.text.includes('contenu 4'));
  n++; ok('arrêt demandé : le début est conservé');
}
{
  let calls = 0;
  const r = await writeLongDocument({ instruction: 'Rédige un contrat', pages: 6, cancelled: () => false, onProgress() {}, ask: async (m, o) => { calls++; if (o.json) return outline(8); if (calls === 4) throw new Error('Connexion perdue'); return `## S\ntexte ${calls}`; } });
  assert.equal(r.done, false); assert.match(r.note, /section 3 sur 8/); assert.match(r.note, /Connexion perdue/); assert.ok(r.text.includes('texte 3'));
  n++; ok('panne en cours de route : ce qui est rédigé est gardé');
}
{
  const seen = [];
  const r = await writeLongDocument({ instruction: 'Rédige des statuts', pages: 10, cancelled: () => false, onProgress() {}, ask: async (m, o) => { seen.push(o.maxTokens); return o.json ? 'désolé' : 'Document complet'; } });
  assert.equal(r.text, 'Document complet'); assert.deepEqual(seen, [4096, 16000]);
  n++; ok('plan illisible : une seule réponse longue');
}
console.log(`\n${n} groupes de tests réussis.`);
