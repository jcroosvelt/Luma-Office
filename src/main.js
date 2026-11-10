import './style.css';
import './install.js';
import { registerSW } from 'virtual:pwa-register';
import { mountEditor } from './editor-view.js';
import { showHome } from './home.js';
import { listDocs, getDoc, putDoc, deleteDoc, newId, persist, pref } from './storage.js';
import { TEMPLATES, templateSettings } from './templates.js';
import { importFile } from './import.js';
import { applyTheme, h, toast } from './ui.js';

// Écran d'accueil animé avec le logo (une fois par session)
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

const go = (id) => { location.hash = id ? `#/doc/${id}` : ''; };

async function createDoc({ title, html, settings, comments }) {
  const rec = { id: newId(), title, html, json: null, settings, comments: comments || [], created: Date.now(), updated: Date.now(), preview: '', words: 0 };
  await putDoc(rec);
  go(rec.id);
}

async function render() {
  if (current) { try { await current.flush(); } catch { /* ignore */ } current.destroy(); current = null; }
  document.documentElement.classList.remove('in-editor');
  if (location.hash === '#/new') { const t = TEMPLATES[0]; const rec = { id: newId(), title: 'Document sans titre', html: t.html(), json: null, settings: templateSettings(t), comments: [], created: Date.now(), updated: Date.now(), preview: '', words: 0 }; await putDoc(rec); history.replaceState(null, '', `#/doc/${rec.id}`); }
  const m = location.hash.match(/^#\/doc\/(.+)$/);
  if (m) {
    const rec = await getDoc(m[1]);
    if (!rec) { go(null); return; }
    document.documentElement.classList.add('in-editor');
    current = mountEditor(app, { ...rec, json: rec.json || null }, {
      onBack: () => go(null),
      onDelete: async (r) => { await deleteDoc(r.id); go(null); },
      onDuplicate: async (r) => { const copy = { ...r, id: newId(), title: r.title + ' (copie)', created: Date.now(), updated: Date.now() }; await putDoc(copy); go(copy.id); },
    });
    return;
  }
  const onNew = (t) => createDoc({ title: t.id === 'blank' ? 'Document sans titre' : t.name, html: t.html(), settings: templateSettings(t) });
  onNew.refresh = render;
  await showHome(app, {
    onOpen: go,
    onNew,
    onImport: () => {
      const input = h('input', { type: 'file', accept: '.docx,.txt,.html,.htm,.md', hidden: true, onchange: async () => {
        const f = input.files[0]; input.remove();
        if (!f) return;
        try {
          toast('Importation…', 30000);
          const r = await importFile(f);
          const base = templateSettings(TEMPLATES[0]);
          await createDoc({ title: r.title, html: r.html, comments: r.comments, settings: { ...base, ...(r.settings || {}), margins: { ...base.margins, ...(r.settings?.margins || {}) } } });
          toast('Document importé ✓');
        } catch (e) { console.error(e); toast('Impossible d’importer ce fichier'); }
      } });
      document.body.append(input);
      input.click();
    },
  });
}

// Ouverture de fichiers .docx depuis le système (PWA installée)
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    for (const fh of params.files || []) {
      try {
        const r = await importFile(await fh.getFile());
        const base = templateSettings(TEMPLATES[0]);
        await createDoc({ title: r.title, html: r.html, comments: r.comments, settings: { ...base, ...(r.settings || {}), margins: { ...base.margins, ...(r.settings?.margins || {}) } } });
      } catch { toast('Impossible d’ouvrir ce fichier'); }
    }
  });
}

addEventListener('hashchange', render);
render();
void listDocs;
