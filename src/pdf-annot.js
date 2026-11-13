// Modifier et signer un PDF : surligner, souligner, barrer, dessiner, écrire, modifier le texte existant, masquer, insérer une image,
// signer (dessin, saisie, image, paraphes), déplacer / redimensionner, gomme + remplissage de formulaires.
// Les modifications sont enregistrées dans le document (IndexedDB) et incorporées au PDF à l'export avec pdf-lib.
import { h, icon, sheet, toast, promptDialog } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const COLORS = ['#ffe03a', '#5be37d', '#ff7ac6', '#4aa8ff', '#e5322d', '#111111'];
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const rgb01 = (hex) => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
const uid = () => Math.random().toString(36).slice(2, 10);
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const RESIZABLE = ['hl', 'rect', 'sig', 'img'];
const TEXTY = ['txt', 'edit'];

// Taille approximative d'un texte (pour la zone de sélection)
function textBox(a) {
  const lines = (a.text || '').split('\n');
  return { x: a.x, y: a.type === 'edit' ? a.y : a.y - a.size, w: Math.max(a.type === 'edit' ? a.w : 0, Math.max(...lines.map((l) => l.length)) * a.size * 0.54), h: Math.max(a.type === 'edit' ? a.h : 0, lines.length * a.size * 1.2) };
}
const bbox = (a) => (TEXTY.includes(a.type) ? textBox(a) : { x: a.x, y: a.y, w: a.w, h: a.h });

export function createAnnotator(ctx) {
  // ctx : { doc, els, sizes, dims, getRot, getScale, scroller, root, getRec, onChange, anchor }
  let annots = [...(ctx.getRec().annots || [])];
  let formVals = { ...(ctx.getRec().form || {}) };
  let tool = null, color = COLORS[0], barEl = null, selId = null, pending = null; // pending : image / signature à placer
  const overlays = new Map(); // index de page -> { svg, g }

  const changed = () => ctx.onChange({ annots, form: formVals });
  const hasChanges = () => annots.length > 0 || Object.keys(formVals).length > 0;
  const byId = (id) => annots.find((a) => a.id === id);

  /* ---------- rendu ---------- */
  function drawOne(a) {
    const out = [];
    const hit = (shape) => { shape.setAttribute('data-id', a.id); return shape; };
    if (a.type === 'hl') {
      out.push(hit(svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: a.color, 'fill-opacity': 0.4, style: 'mix-blend-mode:multiply' })));
    } else if (a.type === 'rect') {
      out.push(hit(svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: a.color })));
    } else if (a.type === 'ul' || a.type === 'st') {
      const y = a.type === 'ul' ? a.y + a.h : a.y + a.h / 2;
      out.push(svgEl('line', { x1: a.x, y1: y, x2: a.x + a.w, y2: y, stroke: a.color, 'stroke-width': 1.3 }));
      out.push(hit(svgEl('line', { x1: a.x, y1: y, x2: a.x + a.w, y2: y, stroke: 'transparent', 'stroke-width': 14 })));
    } else if (a.type === 'pen') {
      const pts = a.pts.map((p) => p.join(',')).join(' ');
      out.push(svgEl('polyline', { points: pts, fill: 'none', stroke: a.color, 'stroke-width': a.sw || 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      out.push(hit(svgEl('polyline', { points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': 14, 'stroke-linecap': 'round' })));
    } else if (a.type === 'txt' || a.type === 'edit') {
      const b = textBox(a);
      if (a.type === 'edit') out.push(svgEl('rect', { x: a.x - 1, y: a.y - 1, width: b.w + 2, height: b.h + 2, fill: '#ffffff' }));
      const t = svgEl('text', { x: a.x, y: a.type === 'edit' ? a.y + a.h * 0.8 : a.y, fill: a.color, 'font-size': a.size, 'font-family': 'Helvetica, Arial, sans-serif' });
      (a.text || '').split('\n').forEach((ln, i) => { const s = svgEl('tspan', { x: a.x, dy: i ? a.size * 1.2 : 0 }); s.textContent = ln || ' '; t.append(s); });
      out.push(t);
      out.push(hit(svgEl('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: 'transparent' })));
    } else if (a.type === 'sig' || a.type === 'img') {
      const im = svgEl('image', { x: a.x, y: a.y, width: a.w, height: a.h, preserveAspectRatio: 'none' });
      im.setAttribute('href', a.img);
      out.push(hit(im));
    }
    return out;
  }
  function groupTransform(i) {
    const [w, hh] = ctx.sizes[i];
    switch (ctx.getRot()) { case 90: return `translate(${hh},0) rotate(90)`; case 180: return `translate(${w},${hh}) rotate(180)`; case 270: return `translate(0,${w}) rotate(270)`; default: return ''; }
  }
  function selectionFrame(a) {
    const b = bbox(a), r = 12 / Math.max(0.3, ctx.getScale());
    const g = svgEl('g', { class: 'sel-frame' });
    g.append(svgEl('rect', { x: b.x - 2, y: b.y - 2, width: b.w + 4, height: b.h + 4, fill: 'none', stroke: '#0b57d0', 'stroke-width': 1.2 / Math.max(0.3, ctx.getScale()), 'stroke-dasharray': '4 3', 'pointer-events': 'none' }));
    if (RESIZABLE.includes(a.type) || TEXTY.includes(a.type)) {
      const hd = svgEl('circle', { cx: b.x + b.w + 2, cy: b.y + b.h + 2, r, fill: '#0b57d0', stroke: '#fff', 'stroke-width': r / 4, 'data-handle': a.id });
      g.append(hd);
    }
    return g;
  }
  function paint(i) {
    const o = overlays.get(i); if (!o) return;
    o.g.replaceChildren(...annots.filter((a) => a.p === i).flatMap(drawOne));
    const s = selId && byId(selId);
    if (s && s.p === i && tool === 'move') o.g.append(selectionFrame(s));
  }
  const paintAll = () => { for (const i of overlays.keys()) paint(i); };
  const applyToolState = () => {
    for (const { svg } of overlays.values()) {
      svg.style.pointerEvents = tool ? 'all' : 'none';
      svg.style.touchAction = tool && ['pen', 'hl', 'ul', 'st', 'rect', 'move'].includes(tool) ? 'none' : 'auto';
      svg.classList.toggle('annot-erase', tool === 'erase');
      svg.classList.toggle('annot-pick', tool === 'edit' || tool === 'move');
    }
    ctx.root.classList.toggle('annotating', !!tool);
    barEl?.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    if (tool !== 'move') selId = null;
    paintAll();
  };
  const setTool = (t) => { tool = t; if (t !== 'sig' && t !== 'img') pending = null; applyToolState(); };

  /* ---------- géométrie ---------- */
  function toBase(info, e) {
    const pt = info.svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = info.g.getScreenCTM(); if (!m) return null;
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
      if (tool === 'date') { e.preventDefault(); addDate(i, p); return; }
      if (tool === 'edit') { e.preventDefault(); editExisting(i, e, info); return; }
      if (tool === 'sig' || tool === 'img') { e.preventDefault(); place(i, p); return; }
      if (tool === 'move') { e.preventDefault(); startMove(i, e, info, p); return; }
      svg.setPointerCapture?.(e.pointerId);
      drag = { p0: p, pts: [p], pid: e.pointerId };
      if (tool === 'pen') live = svgEl('polyline', { fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', points: p.join(',') });
      else live = svgEl('rect', { fill: tool === 'hl' || tool === 'rect' ? color : 'transparent', 'fill-opacity': tool === 'rect' ? 1 : 0.35, stroke: tool === 'hl' || tool === 'rect' ? 'none' : color, 'stroke-dasharray': '3 2', x: p[0], y: p[1], width: 0, height: 0 });
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
        const x = Math.min(p[0], d.p0[0]); let y = Math.min(p[1], d.p0[1]); const w = Math.abs(p[0] - d.p0[0]); let hh = Math.abs(p[1] - d.p0[1]);
        if (w < 4) return;
        if (tool !== 'rect' && hh < 10) { y -= (10 - hh) / 2; hh = 10; }
        if (tool === 'rect' && hh < 4) return;
        annots.push({ id: uid(), type: tool, p: i, color: tool === 'rect' && color === COLORS[0] ? '#111111' : color, x, y, w, h: hh });
      } else return;
      paint(i); changed();
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  }

  /* ---------- déplacer / redimensionner ---------- */
  function startMove(i, e, info, p0) {
    const handle = e.target.closest?.('[data-handle]');
    const id = handle?.getAttribute('data-handle') || e.target.closest?.('[data-id]')?.getAttribute('data-id');
    const a = id && byId(id);
    if (!a) { selId = null; paintAll(); return; }
    const now = Date.now();
    if (selId === id && !handle && TEXTY.includes(a.type) && startMove.last && now - startMove.last < 380) { startMove.last = 0; editText(a); return; }
    startMove.last = now; selId = id; paintAll();
    const page = a.p, info2 = overlays.get(page) || info;
    const orig = JSON.parse(JSON.stringify(a)), pid = e.pointerId;
    info.svg.setPointerCapture?.(pid);
    let moved = false;
    const mv = (ev) => {
      if (ev.pointerId !== pid) return;
      const p = toBase(info2, ev); if (!p) return;
      const dx = p[0] - p0[0], dy = p[1] - p0[1];
      if (Math.hypot(dx, dy) > 1.5) moved = true;
      if (handle) {
        if (TEXTY.includes(a.type)) a.size = Math.max(6, Math.min(80, +(orig.size * Math.max(0.3, (p[0] - orig.x) / Math.max(10, textBox(orig).w))).toFixed(1)));
        else if (a.type === 'sig' || a.type === 'img') { const k = Math.max(0.1, (orig.w + dx) / orig.w); a.w = orig.w * k; a.h = orig.h * k; }
        else { a.w = Math.max(6, orig.w + dx); a.h = Math.max(4, orig.h + dy); }
      } else if (a.pts) a.pts = orig.pts.map(([x, y]) => [x + dx, y + dy]);
      else { a.x = orig.x + dx; a.y = orig.y + dy; }
      paint(page);
    };
    const up = (ev) => {
      if (ev.pointerId !== pid) return;
      info.svg.removeEventListener('pointermove', mv); info.svg.removeEventListener('pointerup', up); info.svg.removeEventListener('pointercancel', up);
      if (moved) changed();
    };
    info.svg.addEventListener('pointermove', mv); info.svg.addEventListener('pointerup', up); info.svg.addEventListener('pointercancel', up);
  }
  async function editText(a) {
    const t = await promptDialog(a.type === 'edit' ? 'Modifier le texte' : 'Modifier le texte ajouté', 'Texte', a.text, 'Valider');
    if (t == null) return;
    if (!t.trim()) { annots = annots.filter((x) => x.id !== a.id); selId = null; } else a.text = t.trim();
    paint(a.p); changed();
  }
  function deleteSelected() {
    if (!selId) { toast('Sélectionnez d’abord un élément avec l’outil Déplacer'); return; }
    const a = byId(selId); annots = annots.filter((x) => x.id !== selId); selId = null; if (a) paint(a.p); changed();
  }

  /* ---------- texte, modification du texte existant, date ---------- */
  async function addText(i, p) {
    const t = await promptDialog('Ajouter du texte', 'Texte à écrire sur la page', '', 'Ajouter');
    if (!t || !t.trim()) return;
    annots.push({ id: uid(), type: 'txt', p: i, color: color === COLORS[0] ? '#111111' : color, size: 14, x: p[0], y: p[1] + 10, text: t.trim() });
    paint(i); changed();
  }
  function addDate(i, p) {
    annots.push({ id: uid(), type: 'txt', p: i, color: '#111111', size: 12, x: p[0], y: p[1] + 8, text: new Date().toLocaleDateString('fr-FR') });
    paint(i); changed(); setTool('move'); selId = annots[annots.length - 1].id; paintAll();
  }
  async function editExisting(i, e, info) {
    const span = [...(ctx.els[i]?.querySelectorAll('.textLayer span') || [])].find((n) => { const q = n.getBoundingClientRect(); return e.clientX >= q.left - 2 && e.clientX <= q.right + 2 && e.clientY >= q.top - 2 && e.clientY <= q.bottom + 2 && n.textContent.trim(); });
    if (!span || !span.textContent.trim()) { toast('Touchez un texte du PDF pour le modifier', 2200); return; }
    const r = span.getBoundingClientRect();
    const p1 = toBase(info, { clientX: r.left, clientY: r.top }), p2 = toBase(info, { clientX: r.right, clientY: r.bottom });
    if (!p1 || !p2) return;
    const x = Math.min(p1[0], p2[0]), y = Math.min(p1[1], p2[1]), w = Math.abs(p2[0] - p1[0]), hh = Math.abs(p2[1] - p1[1]);
    const exists = annots.find((a) => a.type === 'edit' && a.p === i && Math.abs(a.x - x) < 2 && Math.abs(a.y - y) < 2);
    if (exists) { editText(exists); return; }
    const t = await promptDialog('Modifier le texte', 'Remplacer ce texte du PDF par', span.textContent, 'Remplacer');
    if (t == null || t === span.textContent) return;
    const size = Math.max(6, +(hh * 0.8).toFixed(1));
    annots.push({ id: uid(), type: 'edit', p: i, color: '#111111', size, x, y, w, h: hh, text: t });
    paint(i); changed();
  }

  /* ---------- signature : dessin, saisie, image, paraphes ---------- */
  const slotKey = (kind) => (kind === 'initials' ? 'luma-initials' : 'luma-signature');
  const savedSig = (kind) => { try { return JSON.parse(lsGet(slotKey(kind)) || 'null'); } catch { return null; } };
  function trim(canvas) {
    const g2 = canvas.getContext('2d'), d = g2.getImageData(0, 0, canvas.width, canvas.height).data;
    let x0 = canvas.width, y0 = canvas.height, x1 = 0, y1 = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (d[(y * canvas.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) return null;
    const pad = 6, w = x1 - x0 + 1 + pad * 2, hh = y1 - y0 + 1 + pad * 2;
    const o = document.createElement('canvas'); o.width = w; o.height = hh; o.getContext('2d').drawImage(canvas, x0 - pad, y0 - pad, w, hh, 0, 0, w, hh);
    return { url: o.toDataURL('image/png'), w, h: hh };
  }
  function signatureSheet(kind, then) {
    const label = kind === 'initials' ? 'Vos paraphes' : 'Votre signature';
    let mode = 'draw', s, got = null;
    const c = h('canvas', { class: 'sigpad', width: 640, height: 260 });
    const g2 = c.getContext('2d'); g2.lineWidth = 5; g2.lineCap = 'round'; g2.lineJoin = 'round'; g2.strokeStyle = '#0a1f5c';
    let down = false, any = false;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
    c.addEventListener('pointerdown', (e) => { if (mode !== 'draw') return; down = true; any = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); g2.beginPath(); g2.moveTo(x, y); g2.lineTo(x + 0.1, y); g2.stroke(); e.preventDefault(); });
    c.addEventListener('pointermove', (e) => { if (!down) return; const [x, y] = pos(e); g2.lineTo(x, y); g2.stroke(); });
    const up = () => { down = false; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    const typed = h('input', { class: 'field', placeholder: kind === 'initials' ? 'Vos initiales' : 'Tapez votre nom', 'aria-label': 'Nom à signer', maxlength: 40 });
    const fontsRow = h('div', { class: 'sig-fonts' });
    const FONTS_SIG = [['Dancing Script', '700'], ['Playfair Display', 'italic 400'], ['Lora', 'italic 400']];
    let fontIdx = 0;
    const drawTyped = async () => {
      const fam = FONTS_SIG[fontIdx];
      try { await document.fonts.load(`${fam[1].includes('italic') ? 'italic ' : ''}${fam[1].replace('italic ', '')} 80px "${fam[0]}"`); } catch { /* ignore */ }
      g2.clearRect(0, 0, c.width, c.height); g2.fillStyle = '#0a1f5c';
      const txt = typed.value || (kind === 'initials' ? 'AB' : 'Votre nom'); let fs = 120;
      const font = (n) => `${fam[1].includes('italic') ? 'italic ' : ''}${fam[1].replace('italic ', '')} ${n}px "${fam[0]}", cursive`;
      g2.font = font(fs); const w = g2.measureText(txt).width; if (w > c.width - 40) { fs = (fs * (c.width - 40)) / w; g2.font = font(fs); }
      g2.textBaseline = 'middle'; g2.fillText(txt, 20, c.height / 2); any = !!typed.value;
    };
    typed.addEventListener('input', () => { if (mode === 'type') drawTyped(); });
    FONTS_SIG.forEach((f, k) => fontsRow.append(h('button', { class: 'btn sm', style: `font-family:"${f[0]}";${f[1].includes('italic') ? 'font-style:italic;' : 'font-weight:700;'}font-size:18px`, onclick: () => { fontIdx = k; drawTyped(); } }, kind === 'initials' ? 'AB' : 'Signature')));
    const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
      const f = fileIn.files[0]; fileIn.value = ''; if (!f) return;
      const bmp = await createImageBitmap(f); const k = Math.min(1, 700 / bmp.width);
      const tmp = document.createElement('canvas'); tmp.width = Math.round(bmp.width * k); tmp.height = Math.round(bmp.height * k);
      const tg = tmp.getContext('2d'); tg.drawImage(bmp, 0, 0, tmp.width, tmp.height);
      // fond clair → transparent, encre conservée
      const im = tg.getImageData(0, 0, tmp.width, tmp.height), d = im.data;
      for (let q = 0; q < d.length; q += 4) { const lum = 0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2]; if (lum > 200) d[q + 3] = 0; else { d[q + 3] = Math.min(255, (200 - lum) * 3); d[q] = 10; d[q + 1] = 31; d[q + 2] = 92; } }
      tg.putImageData(im, 0, 0);
      c.width = tmp.width; c.height = tmp.height; g2.clearRect(0, 0, c.width, c.height); g2.drawImage(tmp, 0, 0); any = true;
    } });
    const dateChk = h('input', { type: 'checkbox' });
    const panels = {
      draw: h('div', { class: 'sig-opts' }, h('p', { class: 'muted' }, 'Dessinez avec le doigt ou la souris.')),
      type: h('div', { class: 'sig-opts', hidden: true }, typed, fontsRow),
      image: h('div', { class: 'sig-opts', hidden: true }, h('p', { class: 'muted' }, 'Choisissez une photo de votre signature sur papier blanc : le fond est retiré automatiquement.'), h('button', { class: 'btn', onclick: () => fileIn.click() }, icon('image', 18), 'Choisir une image'), fileIn),
    };
    const tabs = h('div', { class: 'sig-tabs' });
    const showTab = (m) => {
      mode = m; g2.clearRect(0, 0, c.width, c.height); any = false; c.width = 640; c.height = 260; g2.lineWidth = 5; g2.lineCap = 'round'; g2.lineJoin = 'round'; g2.strokeStyle = '#0a1f5c';
      Object.entries(panels).forEach(([k, el]) => { el.hidden = k !== m; });
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
      if (m === 'type') drawTyped();
    };
    [['draw', 'Dessiner'], ['type', 'Taper'], ['image', 'Image']].forEach(([m, l]) => tabs.append(h('button', { class: 'sig-tab', 'data-m': m, onclick: () => showTab(m) }, l)));
    const use = () => {
      if (!any) { toast('Créez d’abord votre ' + (kind === 'initials' ? 'paraphe' : 'signature')); return; }
      const t = trim(c); if (!t) { toast('Rien à enregistrer'); return; }
      got = { ...t, stamp: dateChk.checked };
      lsSet(slotKey(kind), JSON.stringify({ url: t.url, w: t.w, h: t.h, stamp: dateChk.checked })); s.close(); then(got);
    };
    s = sheet(label, h('div', { class: 'form' }, tabs, c, panels.draw, panels.type, panels.image,
      h('label', { class: 'chk' }, dateChk, ' Ajouter « Signé le … » sous la signature'),
      h('div', { class: 'vact' },
        h('button', { class: 'btn', onclick: () => showTab(mode) }, 'Effacer'),
        h('button', { class: 'btn primary', onclick: use }, 'Utiliser'))));
    showTab('draw');
  }
  // Prépare l'image à placer ; ajoute la mention « Signé le » si demandée
  function stampedImage(sig, kind) {
    return new Promise((resolve) => {
      if (!sig.stamp || kind === 'initials') { resolve({ url: sig.url, w: sig.w, h: sig.h }); return; }
      const im = new Image();
      im.onload = () => {
        const label = `Signé le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        const c = document.createElement('canvas'), fs = Math.max(14, Math.round(sig.h * 0.18));
        const g2 = c.getContext('2d'); g2.font = `${fs}px Helvetica, Arial, sans-serif`;
        const tw = g2.measureText(label).width; c.width = Math.max(sig.w, Math.ceil(tw) + 12); c.height = sig.h + fs + 10;
        const g3 = c.getContext('2d'); g3.drawImage(im, 0, 0); g3.font = `${fs}px Helvetica, Arial, sans-serif`; g3.fillStyle = '#44506b'; g3.textBaseline = 'top'; g3.fillText(label, 6, sig.h + 4);
        resolve({ url: c.toDataURL('image/png'), w: c.width, h: c.height });
      };
      im.src = sig.url;
    });
  }
  async function startSign(kind) {
    const go = async (sig) => {
      const img = await stampedImage(sig, kind);
      pending = { type: 'sig', ...img }; setTool('sig'); toast(kind === 'initials' ? 'Touchez la page pour placer vos paraphes' : 'Touchez la page pour placer votre signature', 2600);
    };
    const saved = savedSig(kind);
    if (!saved) { signatureSheet(kind, go); return; }
    let s;
    s = sheet(kind === 'initials' ? 'Paraphes' : 'Signature', h('div', { class: 'form' },
      h('img', { src: saved.url, class: 'sig-prev', alt: 'Aperçu' }),
      h('button', { class: 'btn primary', onclick: () => { s.close(); go(saved); } }, kind === 'initials' ? 'Utiliser mes paraphes' : 'Utiliser ma signature'),
      h('button', { class: 'btn', onclick: () => { s.close(); signatureSheet(kind, go); } }, 'Créer une nouvelle ' + (kind === 'initials' ? 'version' : 'signature'))));
  }
  function pickImage() {
    const f = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
      const file = f.files[0]; f.remove(); if (!file) return;
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); const k = Math.min(1, 1100 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const png = file.type === 'image/png';
        pending = { type: 'img', url: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88), w: c.width, h: c.height };
        setTool('img'); toast('Touchez la page pour placer l’image', 2400);
      } catch { toast('Image illisible'); }
    } });
    document.body.append(f); f.click();
  }
  function place(i, p) {
    if (!pending) { if (tool === 'sig') startSign('signature'); else pickImage(); return; }
    const W = ctx.sizes[i][0] * (pending.type === 'sig' ? 0.3 : 0.4), H = W * (pending.h / pending.w);
    const a = { id: uid(), type: pending.type, p: i, img: pending.url, x: Math.max(0, p[0] - W / 2), y: Math.max(0, p[1] - H / 2), w: W, h: H };
    annots.push(a); paint(i); changed();
    pending = null; setTool('move'); selId = a.id; paintAll(); toast('Déplacez ou redimensionnez, puis touchez « Terminé »', 3000);
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
  function openBar(startTool) {
    if (!barEl) {
      const mk = (id, ic, label, fn) => h('button', { class: 'icon-btn', 'data-tool': id || '', 'aria-label': label, title: label, onclick: fn }, icon(ic, 22));
      const pick = (c) => { color = c; dots.forEach((d, k) => d.classList.toggle('on', COLORS[k] === c)); };
      const darken = () => { if (color === COLORS[0] && tool && !['hl'].includes(tool)) pick(COLORS[4]); };
      const sel = (type) => () => { if (applySelection(type)) { toast('Ajouté'); return; } setTool(tool === type ? null : type); darken(); if (tool) toast(type === 'hl' ? 'Glissez sur le texte à surligner' : 'Glissez le long du texte', 2200); };
      const t = (id, msg) => () => { setTool(tool === id ? null : id); darken(); if (tool && msg) toast(msg, 2200); };
      const dots = COLORS.map((c) => h('button', { class: 'cdot' + (c === color ? ' on' : ''), style: `background:${c}`, 'aria-label': 'Couleur', onclick: () => { pick(c); if (selId && byId(selId) && ['hl', 'rect', 'txt', 'edit'].includes(byId(selId).type)) { byId(selId).color = c; paint(byId(selId).p); changed(); } } }));
      barEl = h('div', { class: 'annbar' },
        mk('hl', 'highlight', 'Surligner', sel('hl')), mk('ul', 'underline', 'Souligner', sel('ul')), mk('st', 'strike', 'Barrer', sel('st')),
        mk('pen', 'track', 'Dessiner', t('pen')), mk('txt', 'textbox', 'Ajouter du texte', t('txt', 'Touchez la page pour écrire')),
        mk('edit', 'edit', 'Modifier le texte du PDF', t('edit', 'Touchez un texte du PDF pour le modifier')),
        mk('rect', 'fullimg', 'Masquer / caviarder', t('rect', 'Glissez pour masquer une zone')),
        mk('sig', 'sign', 'Signer', () => { if (tool === 'sig') { setTool(null); return; } startSign('signature'); }),
        mk('init', 'initials', 'Paraphes', () => startSign('initials')),
        mk('img', 'image', 'Insérer une image', () => pickImage()),
        mk('date', 'calendar', 'Ajouter la date', t('date', 'Touchez la page pour poser la date')),
        mk('move', 'move', 'Déplacer / redimensionner', t('move', 'Touchez un élément pour le déplacer ; poignée bleue = taille')),
        mk('erase', 'eraser', 'Gomme', t('erase')),
        h('span', { class: 'cdots' }, ...dots),
        h('button', { class: 'icon-btn', 'aria-label': 'Supprimer la sélection', title: 'Supprimer la sélection', onclick: deleteSelected }, icon('trash', 22)),
        h('button', { class: 'icon-btn', 'aria-label': 'Annuler la dernière modification', title: 'Annuler', onclick: () => { const a = annots.pop(); if (a) { if (a.id === selId) selId = null; paint(a.p); changed(); } } }, icon('undo', 22)),
        h('button', { class: 'icon-btn done', 'aria-label': 'Terminé', title: 'Terminé', onclick: closeBar }, icon('check', 22)));
      ctx.anchor.before(barEl);
      tool = null; applyToolState();
    }
    if (startTool === 'sig') startSign('signature'); else if (startTool) setTool(startTool);
  }
  function closeBar() { barEl?.remove(); barEl = null; tool = null; pending = null; selId = null; applyToolState(); }

  /* ---------- export (pdf-lib) ---------- */
  async function exportBlob(rec, password) {
    if (!hasChanges()) return rec.blob;
    const L = await import('@cantoo/pdf-lib');
    let pdf;
    try { pdf = await L.PDFDocument.load(new Uint8Array(await rec.blob.arrayBuffer()), password ? { password } : undefined); }
    catch { toast('PDF protégé : les modifications ne peuvent pas être incorporées', 4500); return rec.blob; }
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
      const rectOf = (a) => { const [x1, y1] = cv(a.x, a.y), [x2, y2] = cv(a.x + a.w, a.y + a.h); return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }; };
      for (const a of annots.filter((q) => q.p === p)) {
        if (a.type === 'hl') page.drawRectangle({ ...rectOf(a), color: color3(a.color), opacity: 0.4, blendMode: L.BlendMode.Multiply });
        else if (a.type === 'rect') page.drawRectangle({ ...rectOf(a), color: color3(a.color) });
        else if (a.type === 'ul' || a.type === 'st') { const yy = a.type === 'ul' ? a.y + a.h : a.y + a.h / 2; const s0 = cv(a.x, yy), e0 = cv(a.x + a.w, yy); page.drawLine({ start: { x: s0[0], y: s0[1] }, end: { x: e0[0], y: e0[1] }, thickness: 1.2, color: color3(a.color) }); }
        else if (a.type === 'pen') {
          for (let k = 1; k < a.pts.length; k++) { const s0 = cv(...a.pts[k - 1]), e0 = cv(...a.pts[k]); page.drawLine({ start: { x: s0[0], y: s0[1] }, end: { x: e0[0], y: e0[1] }, thickness: a.sw || 2, color: color3(a.color), lineCap: L.LineCapStyle.Round }); }
        } else if (a.type === 'txt' || a.type === 'edit') {
          if (a.type === 'edit') { const b = textBox(a); page.drawRectangle({ ...rectOf({ x: a.x - 1, y: a.y - 1, w: b.w + 2, h: b.h + 2 }), color: L.rgb(1, 1, 1) }); }
          (a.text || '').split('\n').forEach((ln, k) => { const [x, y] = cv(a.x, (a.type === 'edit' ? a.y + a.h * 0.8 : a.y) + k * a.size * 1.2); try { page.drawText(clean(ln), { x, y, size: a.size, font, color: color3(a.color), rotate: L.degrees(-vp.rotation || 0) }); } catch { /* ignore */ } });
        } else if (a.type === 'sig' || a.type === 'img') {
          const img = a.img.startsWith('data:image/png') ? await pdf.embedPng(a.img) : await pdf.embedJpg(a.img);
          page.drawImage(img, rectOf(a));
        }
      }
    }
    return new Blob([await pdf.save()], { type: 'application/pdf' });
  }

  return { onPageRendered, onPageReleased, openBar, closeBar, exportBlob, hasChanges, repaint: paintAll, isOpen: () => !!barEl };
}
