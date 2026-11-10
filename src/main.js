import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { mountEditor } from './editor-view.js';
import { showHome } from './home.js';
import { listDocs, getDoc, putDoc, deleteDoc, newId, persist, pref } from './storage.js';
import { TEMPLATES, templateSettings } from './templates.js';
import { importFile } from './import.js';
import { applyTheme, h, toast } from './ui.js';

registerSW({ immediate: true });
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

addEventListener('hashchange', render);
render();
void listDocs;
