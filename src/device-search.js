// Recherche de fichiers dans les dossiers de l'appareil (API d'accès aux fichiers, ou sélection de dossier en repli).
import { listFolders, putFolder, deleteFolder, newId } from './storage.js';
import { SUPPORTED, extOf, extractText } from './file-text.js';
import { norm, terms, matchesAll, makeSnippet } from './search.js';

const mem = []; // dossiers choisis par <input webkitdirectory> : valables pour la session seulement
const SKIP = new Set(['node_modules', '.git', 'android', 'cache', 'thumbnails', '.thumbnails']);
export const hasDirPicker = () => typeof window.showDirectoryPicker === 'function';

export async function addFolder() {
  if (hasDirPicker()) {
    let handle;
    try { handle = await window.showDirectoryPicker({ mode: 'read', id: 'luma-search' }); } catch { return null; }
    const rec = { id: newId(), name: handle.name, handle, added: Date.now() };
    // mémorisé pour les prochaines visites ; si le navigateur ne sait pas le conserver, valable pour la session
    try { await putFolder(rec); } catch { rec.mem = true; mem.push(rec); }
    return rec;
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.setAttribute('webkitdirectory', ''); input.hidden = true;
    input.onchange = () => {
      const files = [...input.files];
      input.remove();
      if (!files.length) return resolve(null);
      const rec = { id: newId(), name: (files[0].webkitRelativePath || files[0].name).split('/')[0], files, session: true, added: Date.now() };
      mem.push(rec);
      resolve(rec);
    };
    input.addEventListener('cancel', () => { input.remove(); resolve(null); });
    document.body.append(input);
    input.click();
  });
}
export const allFolders = async () => [...(await listFolders().catch(() => [])), ...mem];
export async function removeFolder(rec) { if (rec.session || rec.mem) { const i = mem.indexOf(rec); if (i >= 0) mem.splice(i, 1); } else await deleteFolder(rec.id); }
export async function ensurePermission(rec) {
  if (rec.session) return true;
  try { let p = await rec.handle.queryPermission({ mode: 'read' }); if (p !== 'granted') p = await rec.handle.requestPermission({ mode: 'read' }); return p === 'granted'; } catch { return false; }
}

async function* walk(dir, path, state, signal) {
  for await (const [name, h] of dir.entries()) {
    if (signal.aborted || state.scanned > state.max) return;
    if (name.startsWith('.')) continue;
    if (h.kind === 'directory') { if (!SKIP.has(name.toLowerCase())) yield* walk(h, path + name + '/', state, signal); }
    else { state.scanned++; if (SUPPORTED.includes(extOf(name))) yield { name, path, getFile: () => h.getFile() }; }
  }
}
async function* walkSession(rec, state, signal) {
  for (const f of rec.files) {
    if (signal.aborted) return;
    state.scanned++;
    if (!SUPPORTED.includes(extOf(f.name))) continue;
    const rel = (f.webkitRelativePath || f.name).split('/').slice(1, -1).join('/');
    if (rel.split('/').some((p) => p.startsWith('.') || SKIP.has(p.toLowerCase()))) continue;
    yield { name: f.name, path: rel ? rel + '/' : '', getFile: async () => f };
  }
}

export async function searchDevice(query, { content = false, signal, onResult, onProgress }) {
  const ts = terms(query);
  const state = { scanned: 0, max: 60000 };
  const found = [];
  for (const folder of await allFolders()) {
    if (signal.aborted) break;
    if (!(await ensurePermission(folder))) { onProgress?.({ ...state, folder: folder.name, denied: true }); continue; }
    const it = folder.session ? walkSession(folder, state, signal) : walk(folder.handle, '', state, signal);
    for await (const f of it) {
      if (signal.aborted) break;
      if (state.scanned % 25 === 0) { onProgress?.({ ...state, folder: folder.name }); await new Promise((r) => setTimeout(r, 0)); }
      const full = `${folder.name}/${f.path}${f.name}`;
      if (matchesAll(norm(f.path + f.name), ts)) { const r = { ...f, folder: folder.name, full }; found.push(r); onResult?.(r); continue; }
      if (content) {
        try {
          const file = await f.getFile();
          if (file.size > 25e6) continue;
          const text = await extractText(file);
          if (text && matchesAll(norm(text), ts)) { const r = { ...f, folder: folder.name, full, snippet: makeSnippet(text, ts) }; found.push(r); onResult?.(r); }
        } catch { /* fichier illisible */ }
      }
    }
  }
  onProgress?.({ ...state, done: true });
  return found;
}
