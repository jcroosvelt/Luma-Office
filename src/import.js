// Import de fichiers : .docx, .odt, .rtf, .doc (Word), .txt, .html, .md simple
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function importFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const title = file.name.replace(/\.[^.]+$/, '');
  if (ext === 'docx') {
    const { docxToHtml } = await import('./import-docx.js');
    const r = await docxToHtml(await file.arrayBuffer());
    return { title, ...r };
  }
  if (ext === 'odt') {
    const { odtToHtml } = await import('./import-odt.js');
    return { title, ...(await odtToHtml(await file.arrayBuffer())) };
  }
  if (ext === 'rtf') {
    const { rtfToHtml } = await import('./import-rtf.js');
    return { title, ...rtfToHtml(new Uint8Array(await file.arrayBuffer())) };
  }
  if (ext === 'doc') {
    const { docToHtml } = await import('./import-doc.js');
    return { title, ...docToHtml(new Uint8Array(await file.arrayBuffer())) };
  }
  const text = await file.text();
  if (ext === 'html' || ext === 'htm') {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    doc.querySelectorAll('script,style,iframe,object').forEach((n) => n.remove());
    return { title: doc.title || title, html: doc.body.innerHTML };
  }
  const html = text.split(/\r?\n/).map((l) => `<p>${esc(l)}</p>`).join('');
  return { title, html };
}
