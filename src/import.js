// Import de fichiers : .docx (Word), .txt, .html, .md simple
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function importFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const title = file.name.replace(/\.[^.]+$/, '');
  if (ext === 'docx') {
    const mammoth = (await import('mammoth/mammoth.browser.js')).default;
    const res = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Titre'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh", "p[style-name='Quote'] => blockquote > p:fresh"] },
    );
    return { title, html: res.value, warnings: res.messages.length };
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
