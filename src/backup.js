// Sauvegarde / restauration de tous les documents (archive .zip) et effacement des données locales.
import JSZip from 'jszip';
import { listEverything, putDoc, deleteDoc, listFolders, deleteFolder } from './storage.js';

export async function exportBackup() {
  const all = (await listEverything()).filter((d) => d.kind !== 'version');
  const zip = new JSZip();
  for (const rec of all) {
    const { blob, ...rest } = rec;
    if (blob) zip.file('blobs/' + rec.id, blob);
    zip.file('docs/' + rec.id + '.json', JSON.stringify(rest));
  }
  zip.file('luma-backup.json', JSON.stringify({ app: 'luma-office', version: 1, date: new Date().toISOString(), count: all.length }));
  return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), count: all.length };
}

export async function importBackup(file) {
  const zip = await JSZip.loadAsync(file);
  if (!zip.file('luma-backup.json')) throw new Error('Ce fichier n’est pas une sauvegarde Luma Office.');
  let n = 0;
  for (const f of zip.file(/^docs\/.*\.json$/)) {
    const rec = JSON.parse(await f.async('string'));
    const bf = zip.file('blobs/' + rec.id);
    if (bf) rec.blob = new Blob([await bf.async('arraybuffer')], { type: rec.mime || (rec.kind === 'pdf' ? 'application/pdf' : 'application/octet-stream') });
    await putDoc(rec);
    n++;
  }
  return n;
}

export async function wipeAll() {
  for (const rec of await listEverything()) await deleteDoc(rec.id);
  for (const f of await listFolders().catch(() => [])) await deleteFolder(f.id);
  try { Object.keys(localStorage).filter((k) => k.startsWith('luma:')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
  try { for (const k of await caches.keys()) if (k.startsWith('luma-')) await caches.delete(k); } catch { /* ignore */ }
}
