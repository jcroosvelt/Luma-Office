// Éditeur d'équations : saisie LaTeX avec palette de symboles et aperçu en direct (KaTeX).
import { h, sheet, toast } from './ui.js';
import { renderMath } from './extensions.js';

const PALETTE = {
  'Courant': [['a/b', '\\frac{a}{b}'], ['√x', '\\sqrt{x}'], ['ⁿ√x', '\\sqrt[n]{x}'], ['xⁿ', 'x^{n}'], ['xₙ', 'x_{n}'], ['∑', '\\sum_{i=1}^{n} i'], ['∫', '\\int_{a}^{b} f(x)\\,dx'], ['lim', '\\lim_{x \\to \\infty} f(x)'], ['∏', '\\prod_{i=1}^{n} i'], ['( )', '\\left( x \\right)'], ['|x|', '\\left| x \\right|'], ['x̄', '\\overline{x}'], ['→x', '\\vec{v}'], ['matrice', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'], ['système', '\\begin{cases} x + y = 1 \\\\ x - y = 0 \\end{cases}']],
  'Grec': 'α β γ δ ε θ λ μ π ρ σ τ φ χ ψ ω Γ Δ Θ Λ Π Σ Φ Ψ Ω'.split(' ').map((g) => [g, '\\' + ({ α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'varepsilon', θ: 'theta', λ: 'lambda', μ: 'mu', π: 'pi', ρ: 'rho', σ: 'sigma', τ: 'tau', φ: 'varphi', χ: 'chi', ψ: 'psi', ω: 'omega', Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Π: 'Pi', Σ: 'Sigma', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega' }[g])]),
  'Symboles': [['±', '\\pm'], ['×', '\\times'], ['÷', '\\div'], ['·', '\\cdot'], ['≤', '\\leq'], ['≥', '\\geq'], ['≠', '\\neq'], ['≈', '\\approx'], ['≡', '\\equiv'], ['∞', '\\infty'], ['→', '\\rightarrow'], ['⇒', '\\Rightarrow'], ['⇔', '\\Leftrightarrow'], ['∈', '\\in'], ['∉', '\\notin'], ['⊂', '\\subset'], ['∪', '\\cup'], ['∩', '\\cap'], ['∀', '\\forall'], ['∃', '\\exists'], ['∂', '\\partial'], ['∇', '\\nabla'], ['…', '\\ldots'], ['°', '^{\\circ}']],
  'Modèles': [['Second degré', 'x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}'], ['Pythagore', 'a^{2} + b^{2} = c^{2}'], ['Dérivée', 'f\'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}'], ['Intégrale', '\\int_{0}^{1} x^{2}\\,dx = \\frac{1}{3}'], ['Somme', '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}'], ['Binôme', '\\binom{n}{k} = \\frac{n!}{k!\\,(n-k)!}'], ['Moyenne', '\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i'], ['Loi normale', 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^{2}}{2\\sigma^{2}}}'], ['Euler', 'e^{i\\pi} + 1 = 0'], ['Énergie', 'E = mc^{2}']],
};

export function openMathEditor({ latex = '', display = false, onSave, onDelete }) {
  const ta = h('textarea', { class: 'field math-ta', rows: 3, spellcheck: 'false', placeholder: 'Écrivez en LaTeX, ou touchez les symboles ci-dessous', 'aria-label': 'Formule LaTeX' });
  ta.value = latex;
  const prev = h('div', { class: 'math-prev' });
  const upd = () => renderMath(prev, ta.value.trim() || '\\square', dispChk.checked);
  const dispChk = h('input', { type: 'checkbox' }); dispChk.checked = display;
  dispChk.addEventListener('change', upd); ta.addEventListener('input', upd);
  const insert = (txt) => {
    const a = ta.selectionStart, b = ta.selectionEnd;
    ta.value = ta.value.slice(0, a) + txt + ta.value.slice(b); ta.focus(); ta.selectionStart = ta.selectionEnd = a + txt.length; upd();
  };
  let tab = 'Courant';
  const tabs = h('div', { class: 'sig-tabs' }), pal = h('div', { class: 'math-pal' });
  const drawPal = () => {
    tabs.replaceChildren(...Object.keys(PALETTE).map((k) => h('button', { class: 'sig-tab' + (k === tab ? ' on' : ''), onclick: () => { tab = k; drawPal(); } }, k)));
    pal.replaceChildren(...PALETTE[tab].map(([lbl, code]) => h('button', { class: tab === 'Modèles' ? 'btn sm' : 'math-key', title: code, onclick: () => (tab === 'Modèles' ? (ta.value = code, upd()) : insert(code)) }, lbl)));
  };
  let s;
  const ok = () => { const v = ta.value.trim(); if (!v) { toast('Écrivez une formule'); return; } s.close(); onSave({ latex: v, display: dispChk.checked }); };
  s = sheet(latex ? 'Modifier l’équation' : 'Insérer une équation', h('div', { class: 'form' },
    prev, ta, h('label', { class: 'chk' }, dispChk, ' Afficher sur sa propre ligne, centrée (grande formule)'),
    tabs, pal,
    h('div', { class: 'row end' }, onDelete ? h('button', { class: 'btn danger', onclick: () => { s.close(); onDelete(); } }, 'Supprimer') : null, h('button', { class: 'btn primary', onclick: ok }, latex ? 'Enregistrer' : 'Insérer'))), { wide: true });
  drawPal(); upd(); setTimeout(() => ta.focus(), 300);
}
