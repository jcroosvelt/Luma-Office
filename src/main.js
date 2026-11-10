import './style.css';
import './install.js';
import { registerSW } from 'virtual:pwa-register';
import { mountEditor } from './editor-view.js';
import { showDocuments } from './home.js';
import { showTemplates } from './templates-page.js';
import { showSettings } from './settings-page.js';
import { getDoc, putDoc, deleteDoc, newId, persist, pref } from './storage.js';
import { TEMPLATES, templateSettings } from './templates.js';
import { createDocFromHtml, openFiles } from './files.js';
import { applyTheme, h, toast } from './ui.js';

// Écran de démarrage avec le logo (une fois par session)
try {
  if (!sessionStorage.getItem('luma:splash')) {
    sessionStorage.setItem('luma:splash', '1');
    const sp = h('div', { class: 'splash' }, h('img', { src: './logo.png', alt: 'Luma Office' }), h('footer', { class: 'powered' }, 'Powered by ', h('b', {}, 'JC Multimedia')));
    document.body.append(sp);
    setTimeout(() => sp.classList.add('out'), 900);
    setTimeout(() => sp.remove(), 1500);
  }
} catch { /* ignore */ }

registerSW({ immediate: true, onOfflineReady() { toast('Luma Office est prêt à fonctionner hors ligne ✓', 3500); } });
persist();
applyTheme(pref.get('theme', 'auto'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(pref.get('theme', 'auto')));

const app = document.getElementById('app');
let current = null;
let token = 0;

const go = (id) => { location.hash = id ? `#/doc/${id}` : '#/'; };

async function consumeShared() {
  // fichiers reçus via « Partager » (service worker) ou ouverts depuis le système
  const files = [];
  try {
    const cache = await caches.open('luma-share');
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      const blob = await res.blob();
      files.push(new File([blob], decodeURIComponent(new URL(req.url).pathname.split('/').pop()), { type: blob.type }));
      await cache.delete(req);
    }
  } catch { /* ignore */ }
  if (files.length && (await openFiles(files, go))) return;
  go(null);
}

async function render() {
  const my = ++token;
  if (current) { try { await current.flush?.(); } catch { /* ignore */ } current.destroy?.(); current = null; }
  document.documentElement.classList.remove('in-editor');
  if (location.hash === '#/shared') { await consumeShared(); return; }
  if (location.hash === '#/new') {
    const t = TEMPLATES[0];
    const rec = await createDocFromHtml({ title: 'Document sans titre', html: t.html(), settings: templateSettings(t) });
    history.replaceState(null, '', `#/doc/${rec.id}`);
  }
  const m = location.hash.match(/^#\/doc\/(.+)$/);
  if (m) {
    const rec = await getDoc(m[1]);
    if (!rec || rec.kind === 'template') { go(null); return; }
    document.documentElement.classList.add('in-editor');
    const hooks = {
      onBack: () => go(null),
      onDelete: async (r) => { await deleteDoc(r.id); go(null); },
      onDuplicate: async (r) => { const copy = { ...r, id: newId(), title: r.title + ' (copie)', created: Date.now(), updated: Date.now() }; await putDoc(copy); go(copy.id); },
      onConvert: async ({ title, html }) => { const doc = await createDocFromHtml({ title, html }); toast('Document créé ✓'); go(doc.id); },
    };
    let view;
    if (rec.kind === 'pdf') view = await (await import('./pdf-view.js')).mountPdf(app, rec, hooks);
    else if (rec.kind === 'sheet') view = await (await import('./sheet-view.js')).mountSheet(app, rec, hooks);
    else view = mountEditor(app, { ...rec, json: rec.json || null }, hooks);
    if (my !== token) { view?.destroy?.(); return; }
    current = view;
    return;
  }
  const useTemplate = async (t) => {
    const rec = await createDocFromHtml({ title: t.id === 'blank' ? 'Document sans titre' : t.name, html: t.html(), settings: templateSettings(t) });
    go(rec.id);
  };
  const refresh = () => render();
  if (location.hash === '#/modeles') { await showTemplates(app, { onUse: useTemplate, refresh }); return; }
  if (location.hash === '#/parametres') { await showSettings(app, { refresh }); return; }
  await showDocuments(app, { onOpen: go, onNew: useTemplate, onImportFiles: (files) => openFiles(files, go), refresh });
}

// Ouverture de fichiers depuis le système (PWA installée sur ordinateur)
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    const files = [];
    for (const fh of params.files || []) { try { files.push(await fh.getFile()); } catch { /* ignore */ } }
    if (files.length) await openFiles(files, go);
  });
}

addEventListener('hashchange', render);
render();
