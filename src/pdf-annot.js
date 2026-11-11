// Annotations PDF : surligner, souligner, barrer, dessin, texte, signature, gomme + remplissage de formulaires.
// Les annotations sont enregistrées dans le document (IndexedDB) et incorporées au PDF à l'export avec pdf-lib.
import { h, icon, sheet, toast, promptDialog } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const COLORS = ['#ffe03a', '#5be37d', '#ff7ac6', '#4aa8ff', '#e5322d', '#111111'];
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const rgb01 = (hex) => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
const uid = () => Math.random().toString(36).slice(2, 10);
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function createAnnotator(ctx) {
  // ctx : { doc, els, sizes, dims, getRot, scroller, root, getRec, onChange, anchor }
  let annots = [...(ctx.getRec().annots || [])];
  let formVals = { ...(ctx.getRec().form || {}) };
  let tool = null, color = COLORS[0], barEl = null;
  const overlays = new Map(); // index de page -> { svg, g }

  const changed = () => ctx.onChange({ annots, form: formVals });
  const hasChanges = () => annots.length > 0 || Object.keys(formVals).length > 0;

  /* ---------- rendu ---------- */
  function drawOne(a) {
    const els = [];
    const hit = (shape) => { shape.setAttribute('data-id', a.id); return shape; };
    if (a.type === 'hl') {
      els.push(hit(svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: a.color, 'fill-opacity': 0.4, style: 'mix-blend-mode:multiply' })));
    } else if (a.type === 'ul' || a.type === 'st') {
      const y = a.type === 'ul' ? a.y + a.h : a.y + a.h / 2;
      els.push(svgEl('line', { x1: a.x, y1: y, x2: a.x + a.w, y2: y, stroke: a.color, 'stroke-width': 1.3 }));
      els.push(hit(svgEl('line', { x1: a.x, y1: y, x2: a.x + a.w, y2: y, stroke: 'transparent', 'stroke-width': 14 })));
    } else if (a.type === 'pen') {
      const pts = a.pts.map((p) => p.join(',')).join(' ');
      els.push(svgEl('polyline', { points: pts, fill: 'none', stroke: a.color, 'stroke-width': a.sw || 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      els.push(hit(svgEl('polyline', { points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': 14, 'stroke-linecap': 'round' })));
    } else if (a.type === 'txt') {
      const t = svgEl('text', { x: a.x, y: a.y, fill: a.color, 'font-size': a.size, 'font-family': 'Helvetica, Arial, sans-serif' });
      a.text.split('\n').forEach((ln, i) => { const s = svgEl('tspan', { x: a.x, dy: i ? a.size * 1.2 : 0 }); s.textContent = ln || ' '; t.append(s); });
      els.push(hit(t));
    } else if (a.type === 'sig') {
      const im = svgEl('image', { x: a.x, y: a.y, width: a.w, height: a.h, preserveAspectRatio: 'none' });
      im.setAttribute('href', a.img);
      els.push(hit(im));
    }
    return els;
  }
  function groupTransform(i) {
    const [w, hh] = ctx.sizes[i];
    switch (ctx.getRot()) { case 90: return `translate(${hh},0) rotate(90)`; case 180: return `translate(${w},${hh}) rotate(180)`; case 270: return `translate(0,${w}) rotate(270)`; default: return ''; }
  }
  function paint(i) {
    const o = overlays.get(i); if (!o) return;
    o.g.replaceChildren(...annots.filter((a) => a.p === i).flatMap(drawOne));
  }
  const paintAll = () => { for (const i of overlays.keys()) paint(i); };
  const applyToolState = () => {
    for (const { svg } of overlays.values()) {
      svg.style.pointerEvents = tool ? 'all' : 'none';
      svg.style.touchAction = tool && ['pen', 'hl', 'ul', 'st'].includes(tool) ? 'none' : 'auto';
      svg.classList.toggle('annot-erase', tool === 'erase');
    }
    ctx.root.classList.toggle('annotating', !!tool);
    barEl?.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
  };

  /* ---------- géométrie ---------- */
  function toBase(svgInfo, e) {
    const pt = svgInfo.svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svgInfo.g.getScreenCTM(); if (!m) return null;
    const r = pt.matrixTransform(m.inverse()); return [r.x, r.y];
  }

  function attachDrawing(i, info) {
    const { svg, g } = info;
    let drag = null, live = null;
    const pointers = new Set();
    svg.addEventListener('pointerdown', (e) => {
      if (!tool) return;
      pointers.add(e.pointerId);
      if (pointers.size > 1) { drag = null; live?.remove(); live = null; return; }
      const p = toBase(info, e); if (!p) return;
      if (tool === 'erase') {
        const id = e.target.closest?.('[data-id]')?.getAttribute('data-id');
        if (id) { annots = annots.filter((a) => a.id !== id); paint(i); changed(); }
        return;
      }
      if (tool === 'txt') { e.preventDefault(); addText(i, p); return; }
      if (tool === 'sig') { e.preventDefault(); placeSignature(i, p); return; }
      svg.setPointerCapture?.(e.pointerId);
      drag = { p0: p, pts: [p], pid: e.pointerId };
      if (tool === 'pen') live = svgEl('polyline', { fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', points: p.join(',') });
      else live = svgEl('rect', { fill: tool === 'hl' ? color : 'transparent', 'fill-opacity': 0.35, stroke: tool === 'hl' ? 'none' : color, 'stroke-dasharray': '3 2', x: p[0], y: p[1], width: 0, height: 0 });
      g.append(live);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const p = toBase(info, e); if (!p) return;
      if (tool === 'pen') {
        const last = drag.pts[drag.pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.8) return;
        drag.pts.push(p); live.setAttribute('points', drag.pts.map((q) => q.map((v) => +v.toFixed(1)).join(',')).join(' '));
      } else {
        const x = Math.min(p[0], drag.p0[0]), y = Math.min(p[1], drag.p0[1]);
        live.setAttribute('x', x); live.setAttribute('y', y); live.setAttribute('width', Math.abs(p[0] - drag.p0[0])); live.setAttribute('height', Math.abs(p[1] - drag.p0[1]));
      }
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (!drag || e.pointerId !== drag.pid) return;
      const d = drag; drag = null; live?.remove(); live = null;
      if (tool === 'pen') {
        if (d.pts.length < 2) d.pts.push([d.pts[0][0] + 0.1, d.pts[0][1]]);
        annots.push({ id: uid(), type: 'pen', p: i, color, sw: 2, pts: d.pts.map((q) => q.map((v) => +v.toFixed(1))) });
      } else if (e.type === 'pointerup') {
        const p = toBase(info, e); if (!p) return;
        let x = Math.min(p[0], d.p0[0]), y = Math.min(p[1], d.p0[1]), w = Math.abs(p[0] - d.p0[0]), hh = Math.abs(p[1] - d.p0[1]);
        if (w < 4) return;
        if (hh < 10) { y -= (10 - hh) / 2; hh = 10; }
        annots.push({ id: uid(), type: tool, p: i, color, x, y, w, h: hh });
      } else return;
      paint(i); changed();
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  }

  async function addText(i, p) {
    const t = await promptDialog('Ajouter du texte', 'Texte à écrire sur la page', '', 'Ajouter');
    if (!t || !t.trim()) return;
    annots.push({ id: uid(), type: 'txt', p: i, color, size: 14, x: p[0], y: p[1] + 10, text: t.trim() });
    paint(i); changed();
  }

  /* ---------- signature ---------- */
  const savedSig = () => { try { return JSON.parse(lsGet('luma-signature') || 'null'); } catch { return null; } };
  function signaturePad(then) {
    const c = h('canvas', { class: 'sigpad', width: 640, height: 260 });
    const ctx2 = c.getContext('2d'); ctx2.lineWidth = 5; ctx2.lineCap = 'round'; ctx2.lineJoin = 'round'; ctx2.strokeStyle = '#0a1f5c';
    let down = false, any = false;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
    c.addEventListener('pointerdown', (e) => { down = true; any = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx2.beginPath(); ctx2.moveTo(x, y); ctx2.lineTo(x + 0.1, y); ctx2.stroke(); e.preventDefault(); });
    c.addEventListener('pointermove', (e) => { if (!down) return; const [x, y] = pos(e); ctx2.lineTo(x, y); ctx2.stroke(); });
    const up = () => { down = false; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    let s;
    const use = () => {
      if (!any) { toast('Dessinez d’abord votre signature'); return; }
      const d = ctx2.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const pad = 6, w = x1 - x0 + 1 + pad * 2, hh = y1 - y0 + 1 + pad * 2;
      const o = document.createElement('canvas'); o.width = w; o.height = hh; o.getContext('2d').drawImage(c, x0 - pad, y0 - pad, w, hh, 0, 0, w, hh);
      const sig = { url: o.toDataURL('image/png'), w, h: hh };
      lsSet('luma-signature', JSON.stringify(sig)); s.close(); then(sig);
    };
    s = sheet('Votre signature', h('div', { class: 'form' },
      h('p', { class: 'muted' }, 'Dessinez votre signature avec le doigt ou la souris. Elle sera enregistrée sur cet appareil pour les prochains documents.'),
      c,
      h('div', { class: 'vact' },
        h('button', { class: 'btn', onclick: () => { ctx2.clearRect(0, 0, c.width, c.height); any = false; } }, 'Effacer'),
        h('button', { class: 'btn primary', onclick: use }, 'Utiliser cette signature'))));
  }
  function placeSignature(i, p) {
    const sig = savedSig();
    if (!sig) { signaturePad(() => { tool = 'sig'; applyToolState(); toast('Touchez la page pour placer la signature'); }); return; }
    const W = ctx.sizes[i][0] * 0.3, H = W * (sig.h / sig.w);
    annots.push({ id: uid(), type: 'sig', p: i, img: sig.url, x: Math.max(0, p[0] - W / 2), y: Math.max(0, p[1] - H / 2), w: W, h: H });
    paint(i); changed();
  }

  /* ---------- sélection de texte → surlignage ---------- */
  function applySelection(type) {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    let added = 0;
    const rects = [...sel.getRangeAt(0).getClientRects()].filter((r) => r.width > 2 && r.height > 2);
    for (const r of rects) {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const i = ctx.els.findIndex((el) => { const b = el.getBoundingClientRect(); return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom; });
      const info = overlays.get(i); if (!info) continue;
      const p1 = toBase(info, { clientX: r.left, clientY: r.top }), p2 = toBase(info, { clientX: r.right, clientY: r.bottom });
      if (!p1 || !p2) continue;
      const x = Math.min(p1[0], p2[0]), y = Math.min(p1[1], p2[1]);
      annots.push({ id: uid(), type, p: i, color, x, y, w: Math.abs(p2[0] - p1[0]), h: Math.abs(p2[1] - p1[1]) }); added++;
      paint(i);
    }
    if (added) { sel.removeAllRanges(); changed(); }
    return added > 0;
  }

  /* ---------- formulaires ---------- */
  async function addWidgets(page, vp, el, i) {
    const list = (await page.getAnnotations({ intent: 'display' })).filter((a) => a.subtype === 'Widget' && !a.readOnly && a.rect && a.fieldName && !a.pushButton);
    for (const a of list) {
      const [p1, p2] = [vp.convertToViewportPoint(a.rect[0], a.rect[1]), vp.convertToViewportPoint(a.rect[2], a.rect[3])];
      const x = Math.min(p1[0], p2[0]), y = Math.min(p1[1], p2[1]), w = Math.abs(p2[0] - p1[0]), hh = Math.abs(p2[1] - p1[1]);
      const name = a.fieldName;
      let inp;
      if (a.fieldType === 'Tx') {
        inp = a.multiLine ? h('textarea') : h('input', { type: 'text' });
        inp.value = formVals[name] ?? (Array.isArray(a.fieldValue) ? a.fieldValue.join('\n') : a.fieldValue || '');
        if (a.maxLen) inp.maxLength = a.maxLen;
        inp.style.fontSize = Math.max(8, Math.min(20, hh * 0.62)) + 'px';
        inp.addEventListener('input', () => setVal(name, inp.value));
      } else if (a.fieldType === 'Btn' && a.checkBox) {
        inp = h('input', { type: 'checkbox' });
        inp.checked = name in formVals ? !!formVals[name] : !!a.fieldValue && a.fieldValue !== 'Off';
        inp.addEventListener('change', () => setVal(name, inp.checked));
      } else if (a.fieldType === 'Btn' && a.radioButton) {
        inp = h('input', { type: 'radio', name: 'r-' + i + '-' + name });
        inp.checked = name in formVals ? formVals[name] === a.buttonValue : a.fieldValue === a.buttonValue;
        inp.addEventListener('change', () => { if (inp.checked) setVal(name, a.buttonValue); });
      } else if (a.fieldType === 'Ch' && a.options) {
        inp = h('select', {}, ...(a.options || []).map((o) => h('option', { value: o.exportValue }, o.displayValue || o.exportValue)));
        inp.value = formVals[name] ?? (Array.isArray(a.fieldValue) ? a.fieldValue[0] : a.fieldValue) ?? '';
        inp.addEventListener('change', () => setVal(name, inp.value));
        inp.style.fontSize = Math.max(8, Math.min(18, hh * 0.6)) + 'px';
      } else continue;
      inp.classList.add('pdf-widget'); inp.dataset.field = name;
      inp.style.cssText += `;left:${x}px;top:${y}px;width:${w}px;height:${hh}px`;
      el.append(inp);
    }
  }
  function setVal(name, v) {
    formVals[name] = v;
    // champs partagés (même nom sur plusieurs pages) : recopie
    ctx.scroller.querySelectorAll('.pdf-widget').forEach((w) => { if (w.dataset.field === name && w.type !== 'radio' && w.type !== 'checkbox' && w.value !== v) w.value = v; else if (w.dataset.field === name && w.type === 'checkbox') w.checked = !!v; });
    changed();
  }

  /* ---------- page rendue ---------- */
  function onPageRendered(i, el, page, vp) {
    const [dw, dh] = ctx.dims(i);
    const svg = svgEl('svg', { class: 'annot-layer', viewBox: `0 0 ${dw} ${dh}`, preserveAspectRatio: 'none' });
    const g = svgEl('g', { transform: groupTransform(i) }); svg.append(g);
    el.append(svg);
    const info = { svg, g }; overlays.set(i, info);
    paint(i); attachDrawing(i, info); applyToolState();
    addWidgets(page, vp, el, i).catch(() => {});
  }
  const onPageReleased = (i) => overlays.delete(i);

  /* ---------- barre d'outils ---------- */
  function openBar() {
    if (barEl) return;
    const mk = (id, ic, label, fn) => h('button', { class: 'icon-btn', 'data-tool': id || '', 'aria-label': label, title: label, onclick: fn }, icon(ic, 22));
    const sel = (type) => () => { if (applySelection(type)) { toast('Ajouté'); return; } tool = tool === type ? null : type; darken(); applyToolState(); if (tool) toast(type === 'hl' ? 'Glissez sur le texte à surligner' : 'Glissez le long du texte', 2200); };
    const pick = (c) => { color = c; dots.forEach((d, k) => d.classList.toggle('on', COLORS[k] === c)); };
    const darken = () => { if (color === COLORS[0] && tool && tool !== 'hl') pick(COLORS[4]); };
    const toolBtn = (id) => () => { tool = tool === id ? null : id; darken(); applyToolState(); if (tool === 'txt') toast('Touchez la page pour écrire', 2000); if (tool === 'sig' && !savedSig()) signaturePad(() => { tool = 'sig'; applyToolState(); toast('Touchez la page pour placer la signature', 2200); }); else if (tool === 'sig') toast('Touchez la page pour placer la signature', 2200); };
    const dots = COLORS.map((c) => h('button', { class: 'cdot' + (c === color ? ' on' : ''), style: `background:${c}`, 'aria-label': 'Couleur', onclick: () => pick(c) }));
    barEl = h('div', { class: 'annbar' },
      mk('hl', 'highlight', 'Surligner', sel('hl')), mk('ul', 'underline', 'Souligner', sel('ul')), mk('st', 'strike', 'Barrer', sel('st')),
      mk('pen', 'track', 'Dessiner', toolBtn('pen')), mk('txt', 'textbox', 'Ajouter du texte', toolBtn('txt')), mk('sig', 'edit', 'Signer', toolBtn('sig')), mk('erase', 'eraser', 'Gomme', toolBtn('erase')),
      h('span', { class: 'cdots' }, ...dots),
      h('button', { class: 'icon-btn', 'aria-label': 'Annuler la dernière annotation', title: 'Annuler', onclick: () => { const a = annots.pop(); if (a) { paint(a.p); changed(); } } }, icon('undo', 22)),
      h('button', { class: 'icon-btn done', 'aria-label': 'Terminé', title: 'Terminé', onclick: closeBar }, icon('check', 22)));
    ctx.anchor.before(barEl);
    tool = null; applyToolState();
  }
  function closeBar() { barEl?.remove(); barEl = null; tool = null; applyToolState(); }

  /* ---------- export (pdf-lib) ---------- */
  async function exportBlob(rec) {
    if (!hasChanges()) return rec.blob;
    const L = await import('pdf-lib');
    let pdf;
    try { pdf = await L.PDFDocument.load(new Uint8Array(await rec.blob.arrayBuffer())); }
    catch { toast('PDF protégé : les modifications ne peuvent pas être incorporées', 4500); return rec.blob; }
    // champs de formulaire
    if (Object.keys(formVals).length) {
      const form = pdf.getForm();
      for (const [name, v] of Object.entries(formVals)) {
        try {
          const f = form.getField(name);
          if (f instanceof L.PDFTextField) f.setText(String(v ?? ''));
          else if (f instanceof L.PDFCheckBox) { v ? f.check() : f.uncheck(); }
          else if (f instanceof L.PDFRadioGroup || f instanceof L.PDFDropdown) { if (v !== '' && v != null) f.select(String(v)); }
          else if (f instanceof L.PDFOptionList) f.select(String(v));
        } catch { /* champ non modifiable */ }
      }
    }
    const font = await pdf.embedFont(L.StandardFonts.Helvetica);
    const clean = (s) => s.replace(/[^ -~ -ÿ€‘’“”…–—•]/g, '?');
    const pages = [...new Set(annots.map((a) => a.p))];
    for (const p of pages) {
      const vp = (await ctx.doc.getPage(p + 1)).getViewport({ scale: 1 });
      const page = pdf.getPage(p), cv = (x, y) => vp.convertToPdfPoint(x, y);
      const color3 = (c) => { const [r, g, b] = rgb01(c); return L.rgb(r, g, b); };
      for (const a of annots.filter((q) => q.p === p)) {
        if (['hl', 'ul', 'st'].includes(a.type)) {
          const [x1, y1] = cv(a.x, a.y), [x2, y2] = cv(a.x + a.w, a.y + a.h);
          const X = Math.min(x1, x2), Y = Math.min(y1, y2), W = Math.abs(x2 - x1), H = Math.abs(y2 - y1);
          if (a.type === 'hl') page.drawRectangle({ x: X, y: Y, width: W, height: H, color: color3(a.color), opacity: 0.4, blendMode: L.BlendMode.Multiply });
          else { const yy = a.type === 'ul' ? a.y + a.h : a.y + a.h / 2; page.drawLine({ start: { x: cv(a.x, yy)[0], y: cv(a.x, yy)[1] }, end: { x: cv(a.x + a.w, yy)[0], y: cv(a.x + a.w, yy)[1] }, thickness: 1.2, color: color3(a.color) }); }
        } else if (a.type === 'pen') {
          for (let k = 1; k < a.pts.length; k++) { const s = cv(...a.pts[k - 1]), e = cv(...a.pts[k]); page.drawLine({ start: { x: s[0], y: s[1] }, end: { x: e[0], y: e[1] }, thickness: a.sw || 2, color: color3(a.color), lineCap: L.LineCapStyle.Round }); }
        } else if (a.type === 'txt') {
          a.text.split('\n').forEach((ln, k) => { const [x, y] = cv(a.x, a.y + k * a.size * 1.2); try { page.drawText(clean(ln), { x, y, size: a.size, font, color: color3(a.color), rotate: L.degrees(-vp.rotation || 0) }); } catch { /* ignore */ } });
        } else if (a.type === 'sig') {
          const img = await pdf.embedPng(a.img);
          const [x1, y1] = cv(a.x, a.y), [x2, y2] = cv(a.x + a.w, a.y + a.h);
          page.drawImage(img, { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
        }
      }
    }
    return new Blob([await pdf.save()], { type: 'application/pdf' });
  }

  return { onPageRendered, onPageReleased, openBar, closeBar, exportBlob, hasChanges, repaint: paintAll, isOpen: () => !!barEl };
}
