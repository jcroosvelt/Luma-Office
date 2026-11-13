// Mode lecture d'un PDF : le texte est réaffiché pour l'écran (téléphone, tablette) avec taille, police, interligne, marges et thème réglables, lecture à voix haute.
import { h, icon, toast, promptDialog } from './ui.js';
import { pageBlocks } from './pdf-lib.js';

const KEY = 'luma-pdf-reader';
const FONTS = [['Sans', "'Open Sans', system-ui, sans-serif"], ['Serif', "'Merriweather', Georgia, serif"], ['Lora', "'Lora', Georgia, serif"], ['Rond', "'Nunito', system-ui, sans-serif"]];
const THEMES = [['Clair', '#ffffff', '#1c2333'], ['Sépia', '#f4ecd8', '#43341f'], ['Nuit', '#16181d', '#d6dae3'], ['Noir', '#000000', '#c9ccd3']];
const DEF = { size: 19, font: 0, lh: 1.7, width: 1, theme: 0, justify: false };
const load = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; } };
const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } };

export function createReader({ doc, N, title, getCur, onClose }) {
  let el = null, destroyed = false;
  const cache = new Map();
  const prefs = load();

  async function open() {
    if (el) return;
    const start = getCur();
    const article = h('article', { class: 'rd-text' });
    const sections = [];
    for (let n = 1; n <= N; n++) {
      const sec = h('section', { 'data-p': n }, h('div', { class: 'rd-pn' }, `Page ${n} / ${N}`), h('p', { class: 'rd-load' }, 'Chargement…'));
      sections.push(sec); article.append(sec);
    }
    const scroll = h('main', { class: 'rd-scroll' }, article);
    const progress = h('div', { class: 'rd-progress' }, h('i'));
    const pageLbl = h('button', { class: 'rd-pg', onclick: () => ask() }, `${start} / ${N}`);
    const top = h('header', { class: 'rd-bar rd-top' },
      h('button', { class: 'icon-btn', 'aria-label': 'Quitter le mode lecture', onclick: () => close() }, icon('close', 22)),
      h('div', { class: 'rd-title' }, title), pageLbl);
    const panel = h('div', { class: 'rd-panel', hidden: true });
    const tts = 'speechSynthesis' in window ? h('button', { class: 'icon-btn', 'aria-label': 'Écouter', onclick: () => toggleSpeech() }, icon('play', 22)) : null;
    const bottom = h('footer', { class: 'rd-bar rd-bot' },
      h('button', { class: 'icon-btn', 'aria-label': 'Page précédente', onclick: () => gotoPage(curPage() - 1) }, h('span', { class: 'rot-l' }, icon('up', 22))),
      h('button', { class: 'rd-aa', 'aria-label': 'Réglages de lecture', onclick: () => { panel.hidden = !panel.hidden; } }, 'Aa'),
      tts,
      h('button', { class: 'icon-btn', 'aria-label': 'Page suivante', onclick: () => gotoPage(curPage() + 1) }, h('span', { class: 'rot-r' }, icon('up', 22))));
    el = h('div', { class: 'rd-pdf' }, progress, top, scroll, panel, bottom);
    document.body.append(el);
    apply();
    buildPanel(panel);

    /* ----- navigation ----- */
    const curPage = () => {
      const mid = scroll.scrollTop + scroll.clientHeight * 0.3; let c = 1;
      sections.forEach((s, i) => { if (s.offsetTop <= mid) c = i + 1; });
      return c;
    };
    const gotoPage = (n) => { n = Math.max(1, Math.min(N, n)); scroll.scrollTo({ top: sections[n - 1].offsetTop - 4 }); };
    const ask = async () => { const v = parseInt((await promptDialog('Aller à la page', `Numéro de page (1 – ${N})`, String(curPage()), 'Aller')) || '', 10); if (v) gotoPage(v); };
    scroll.addEventListener('scroll', () => {
      const max = scroll.scrollHeight - scroll.clientHeight;
      progress.firstChild.style.width = (max > 0 ? (scroll.scrollTop / max) * 100 : 0) + '%';
      pageLbl.textContent = `${curPage()} / ${N}`;
    }, { passive: true });

    /* ----- remplissage paresseux des pages ----- */
    let anyText = false;
    const fill = async (sec) => {
      const n = +sec.dataset.p;
      if (sec.dataset.done) return; sec.dataset.done = '1';
      let blocks;
      try { blocks = cache.get(n) || await pageBlocks(doc, n); cache.set(n, blocks); } catch { blocks = []; }
      if (destroyed) return;
      sec.querySelector('.rd-load')?.remove();
      if (!blocks.length) sec.append(h('p', { class: 'rd-empty' }, 'Aucun texte sur cette page (image ou page vide).'));
      else { anyText = true; sec.append(...blocks.map((b) => (b.k === 'h' ? h('h2', {}, b.t) : h('p', { class: 'rd-p' }, b.t)))); }
      if (!anyText && +sec.dataset.p >= Math.min(N, 3)) scanNotice();
    };
    let noticed = false;
    const scanNotice = () => {
      if (noticed || anyText) return; noticed = true;
      article.prepend(h('div', { class: 'rd-note' }, h('b', {}, 'Ce PDF semble être un scan (images).'), h('p', {}, 'Il ne contient pas de texte à réafficher. Revenez à l’affichage normal pour le lire.'), h('button', { class: 'btn primary', onclick: () => close() }, 'Affichage normal')));
    };
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) fill(e.target); }), { root: scroll, rootMargin: '1800px 0px' });
    sections.forEach((s) => io.observe(s));
    // d'abord la page de départ
    await fill(sections[start - 1]);
    gotoPage(start);

    /* ----- gestes : tap = barres, pincement = taille du texte ----- */
    let bars = true, tapT = 0, tapXY = null;
    const setBars = (v) => { bars = v; el.classList.toggle('rd-nobars', !v); if (!v) panel.hidden = true; };
    scroll.addEventListener('click', (e) => { if (e.target.closest('a,button')) return; if (getSelection()?.toString()) return; setBars(!bars); });
    let pinch = null;
    const dist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    scroll.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = { d: dist(e), s: prefs.size }; }, { passive: true });
    scroll.addEventListener('touchmove', (e) => { if (pinch && e.touches.length === 2) { e.preventDefault(); prefs.size = Math.max(13, Math.min(36, Math.round(pinch.s * (dist(e) / pinch.d)))); apply(); } }, { passive: false });
    scroll.addEventListener('touchend', () => { if (pinch) { pinch = null; save(prefs); syncPanel(); } });
    void tapT; void tapXY;
    el._keys = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' || e.key === 'PageDown') gotoPage(curPage() + 1); else if (e.key === 'ArrowLeft' || e.key === 'PageUp') gotoPage(curPage() - 1); };
    document.addEventListener('keydown', el._keys);
    el._curPage = curPage; el._scroll = scroll; el._io = io;

    /* ----- lecture à voix haute ----- */
    let speaking = false, queue = [], qi = 0;
    function stopSpeech() { speaking = false; try { speechSynthesis.cancel(); } catch { /* ignore */ } el.querySelectorAll('.speaking').forEach((x) => x.classList.remove('speaking')); tts?.replaceChildren(icon('play', 22)); }
    function speakNext() {
      if (!speaking || qi >= queue.length) { stopSpeech(); return; }
      const p = queue[qi++]; p.classList.add('speaking'); p.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const u = new SpeechSynthesisUtterance(p.textContent); u.lang = 'fr-FR'; u.rate = 1;
      u.onend = () => { p.classList.remove('speaking'); speakNext(); }; u.onerror = () => { p.classList.remove('speaking'); stopSpeech(); };
      speechSynthesis.speak(u);
    }
    function toggleSpeech() {
      if (speaking) { stopSpeech(); return; }
      const mid = scroll.scrollTop + scroll.clientHeight * 0.3;
      queue = [...article.querySelectorAll('.rd-p, h2')]; qi = Math.max(0, queue.findIndex((p) => p.offsetTop + p.offsetHeight > mid));
      if (!queue.length) { toast('Rien à lire pour l’instant'); return; }
      speaking = true; tts.replaceChildren(icon('close', 22)); speakNext();
    }
    el._stop = stopSpeech;
    if (window.innerWidth < 700) try { if (!localStorage.getItem('luma-rd-hint')) { localStorage.setItem('luma-rd-hint', '1'); toast('Touchez le texte pour masquer les barres · pincez pour agrandir', 4000); } } catch { /* ignore */ }
  }

  /* ---------- réglages ---------- */
  function apply() {
    if (!el) return;
    const t = THEMES[prefs.theme] || THEMES[0];
    el.style.setProperty('--rd-bg', t[1]); el.style.setProperty('--rd-fg', t[2]);
    el.style.setProperty('--rd-size', prefs.size + 'px'); el.style.setProperty('--rd-lh', prefs.lh);
    el.style.setProperty('--rd-font', FONTS[prefs.font]?.[1] || FONTS[0][1]);
    el.style.setProperty('--rd-w', prefs.width === 0 ? '34rem' : prefs.width === 1 ? '42rem' : '60rem');
    el.classList.toggle('rd-justify', !!prefs.justify);
    el.classList.toggle('rd-dark', prefs.theme >= 2);
  }
  let syncPanel = () => {};
  function buildPanel(panel) {
    const row = (label, ...kids) => h('div', { class: 'rd-row' }, h('span', {}, label), h('div', { class: 'rd-ctl' }, ...kids));
    const seg = (items, get, set) => items.map(([lbl, val], i) => { const b = h('button', { class: 'rd-seg', onclick: () => { set(val); save(prefs); apply(); syncPanel(); } }, lbl); b._v = val; b._i = i; return b; });
    const fontB = seg(FONTS.map(([l], i) => [l, i]), () => prefs.font, (v) => { prefs.font = v; });
    const themeB = seg(THEMES.map(([l], i) => [l, i]), () => prefs.theme, (v) => { prefs.theme = v; });
    const widthB = seg([['Étroit', 0], ['Normal', 1], ['Large', 2]], () => prefs.width, (v) => { prefs.width = v; });
    const lhB = seg([['Serré', 1.4], ['Normal', 1.7], ['Aéré', 2.05]], () => prefs.lh, (v) => { prefs.lh = v; });
    const justB = seg([['Gauche', false], ['Justifié', true]], () => prefs.justify, (v) => { prefs.justify = v; });
    const sz = h('span', { class: 'rd-sz' }, '');
    const step = (d) => () => { prefs.size = Math.max(13, Math.min(36, prefs.size + d)); save(prefs); apply(); syncPanel(); };
    syncPanel = () => {
      sz.textContent = prefs.size + ' px';
      [[fontB, prefs.font], [themeB, prefs.theme], [widthB, prefs.width], [lhB, prefs.lh], [justB, !!prefs.justify]].forEach(([arr, cur]) => arr.forEach((b) => b.classList.toggle('on', b._v === cur)));
    };
    panel.append(
      row('Taille', h('button', { class: 'rd-seg', 'aria-label': 'Plus petit', onclick: step(-1) }, 'A−'), sz, h('button', { class: 'rd-seg', 'aria-label': 'Plus grand', onclick: step(1) }, 'A+')),
      row('Police', ...fontB), row('Thème', ...themeB), row('Marges', ...widthB), row('Interligne', ...lhB), row('Alignement', ...justB));
    syncPanel();
  }

  function close() {
    if (!el) return;
    const page = el._curPage?.() || 1;
    el._stop?.(); el._io?.disconnect(); document.removeEventListener('keydown', el._keys);
    el.remove(); el = null;
    onClose?.(page);
  }
  return { open, close, isOpen: () => !!el, destroy() { destroyed = true; close(); } };
}
