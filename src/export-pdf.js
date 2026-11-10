// Export PDF : rendu fidèle page par page (jsPDF + html2canvas) et impression native.
import { metrics, CM_MM } from './layout.js';

const waitImages = (root) =>
  Promise.all([...root.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));

const latin = (s) => (s || '').replace(/[^ -ÿ‘’“”–—…€]/g, '?');

export async function buildPdf(editor, settings, title, onProgress = () => {}) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const M = metrics(settings);
  const W = Math.round(M.contentWpx);
  const Hc = M.contentHpx;

  const holder = document.createElement('div');
  holder.className = 'pdf-holder';
  holder.style.cssText = `position:fixed;left:0;top:0;width:${W}px;background:#fff;z-index:-9999;pointer-events:none`;
  const inner = document.createElement('div');
  inner.className = 'doc-content';
  inner.style.width = W + 'px';
  inner.innerHTML = editor.getHTML();
  holder.append(inner);
  document.body.append(holder);

  try {
    await waitImages(inner);
    if (document.fonts?.ready) await document.fonts.ready;
    const top0 = holder.getBoundingClientRect().top;
    const total = Math.ceil(holder.getBoundingClientRect().height);

    // Points de coupure possibles (bas des blocs, lignes de tableau, éléments de liste)
    const cands = [];
    const forced = [];
    const rel = (el) => el.getBoundingClientRect().bottom - top0;
    for (const el of inner.children) {
      if (el.hasAttribute('data-page-break')) { forced.push(el.getBoundingClientRect().top - top0); continue; }
      cands.push(rel(el));
      if (el.tagName === 'TABLE') el.querySelectorAll('tr').forEach((tr) => cands.push(rel(tr)));
      if (el.tagName === 'UL' || el.tagName === 'OL') [...el.children].forEach((li) => cands.push(rel(li)));
    }

    const slices = [];
    let y = 0;
    while (y < total - 2) {
      const limit = y + Hc;
      const f = forced.find((t) => t > y + 1 && t <= limit);
      let end;
      if (f !== undefined) end = f;
      else if (total <= limit) end = total;
      else {
        const c = cands.filter((b) => b > y + 24 && b <= limit);
        end = c.length ? Math.max(...c) : limit;
      }
      if (end - y > 1) slices.push([y, end]);
      y = Math.max(end, y + 1);
    }
    if (!slices.length) slices.push([0, Math.max(total, 10)]);

    const wmm = M.wcm * CM_MM, hmm = M.hcm * CM_MM;
    const pdf = new jsPDF({ orientation: wmm > hmm ? 'l' : 'p', unit: 'mm', format: [Math.min(wmm, hmm), Math.max(wmm, hmm)], compress: true });
    pdf.setProperties({ title: title || 'Document', creator: 'Luma Office' });
    const m = settings.margins;
    const k = (m.left !== undefined ? (wmm - (m.left + m.right) * CM_MM) : wmm) / W; // mm par px
    const scale = Math.min(2, Math.max(1.5, (window.devicePixelRatio || 2)));

    for (let i = 0; i < slices.length; i++) {
      onProgress(i + 1, slices.length);
      await new Promise((r) => setTimeout(r, 0));
      const [ya, yb] = slices[i];
      const canvas = await html2canvas(holder, {
        x: 0, y: ya, width: W, height: yb - ya, windowWidth: W, scale, backgroundColor: '#ffffff', logging: false, useCORS: true,
      });
      if (i > 0) pdf.addPage([Math.min(wmm, hmm), Math.max(wmm, hmm)], wmm > hmm ? 'l' : 'p');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', m.left * CM_MM, m.top * CM_MM, W * k, (yb - ya) * k, undefined, 'FAST');
      canvas.width = canvas.height = 0;
    }

    // En-têtes, pieds de page, numéros
    const n = slices.length;
    pdf.setTextColor(102, 102, 102);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    for (let p = 1; p <= n; p++) {
      pdf.setPage(p);
      if (settings.header?.trim()) pdf.text(latin(settings.header), wmm / 2, (m.top * CM_MM) / 2 + 1, { align: 'center' });
      let fy = hmm - (m.bottom * CM_MM) / 2;
      if (settings.footer?.trim()) { pdf.text(latin(settings.footer), wmm / 2, fy - (settings.pageNumbers ? 4 : -1), { align: 'center' }); }
      if (settings.pageNumbers) {
        const x = settings.pageNumberAlign === 'left' ? m.left * CM_MM : settings.pageNumberAlign === 'right' ? wmm - m.right * CM_MM : wmm / 2;
        pdf.text(`Page ${p} / ${n}`, x, fy + 1, { align: settings.pageNumberAlign || 'center' });
      }
    }
    return pdf.output('blob');
  } finally {
    holder.remove();
  }
}

export function printDocument(settings, title) {
  const M = metrics(settings);
  const m = settings.margins;
  const esc = (s) => (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
  const pos = settings.pageNumberAlign === 'left' ? '@bottom-left' : settings.pageNumberAlign === 'right' ? '@bottom-right' : '@bottom-center';
  const box = 'font:9pt Calibri,Carlito,sans-serif;color:#666;';
  let css = `@page{size:${M.wcm}cm ${M.hcm}cm;margin:${m.top}cm ${m.right}cm ${m.bottom}cm ${m.left}cm;`;
  if (settings.header?.trim()) css += `@top-center{content:"${esc(settings.header)}";${box}}`;
  if (settings.pageNumbers) css += `${pos}{content:"Page " counter(page) " / " counter(pages);${box}}`;
  css += '}';
  let st = document.getElementById('print-page-style');
  if (!st) { st = document.createElement('style'); st.id = 'print-page-style'; document.head.append(st); }
  st.textContent = css;
  const prev = document.title;
  document.title = title || 'Document';
  const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  setTimeout(() => window.print(), 50);
}
