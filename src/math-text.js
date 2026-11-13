// Conversion approchée d'une formule LaTeX en texte lisible (export Word / PDF, recherche, aperçus).
const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
const SYM = { sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮', infty: '∞', partial: '∂', nabla: '∇', pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', propto: '∝', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', supset: '⊃', cup: '∪', cap: '∩', emptyset: '∅', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', angle: '∠', degree: '°', circ: '∘', ldots: '…', cdots: '⋯', dots: '…', prime: '′', lim: 'lim', sin: 'sin', cos: 'cos', tan: 'tan', log: 'log', ln: 'ln', exp: 'exp', min: 'min', max: 'max', det: 'det', mathbb: '', mathbf: '', mathrm: '', mathcal: '', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', quad: ' ', qquad: '  ', ',': ' ', ';': ' ', '!': '', ' ': ' ' };
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ', i: 'ⁱ', '(': '⁽', ')': '⁾' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '(': '₍', ')': '₎', n: 'ₙ', i: 'ᵢ', x: 'ₓ' };
const map = (s, t) => (s.split('').every((c) => t[c]) ? s.split('').map((c) => t[c]).join('') : null);

// lit un groupe {…} ou un seul caractère à partir de i ; renvoie [contenu, nouvel indice]
function group(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] === '{') { let d = 1, j = i + 1; while (j < s.length && d) { if (s[j] === '{') d++; else if (s[j] === '}') d--; j++; } return [s.slice(i + 1, j - 1), j]; }
  if (s[i] === '\\') { const m = s.slice(i).match(/^\\[a-zA-Z]+/); if (m) return [m[0], i + m[0].length]; }
  return [s[i] || '', i + 1];
}
export function latexToText(src = '') {
  const conv = (s) => {
    let out = '';
    for (let i = 0; i < s.length;) {
      const c = s[i];
      if (c === '\\') {
        const m = s.slice(i + 1).match(/^([a-zA-Z]+|.)/); const cmd = m ? m[1] : ''; i += 1 + cmd.length;
        if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') { const [a, i1] = group(s, i); const [b, i2] = group(s, i1); i = i2; const A = conv(a), B = conv(b); out += `${/^[\w.]+$/.test(A) ? A : `(${A})`}/${/^[\w.]+$/.test(B) ? B : `(${B})`}`; }
        else if (cmd === 'sqrt') { let idx = ''; if (s[i] === '[') { const j = s.indexOf(']', i); idx = s.slice(i + 1, j); i = j + 1; } const [a, i1] = group(s, i); i = i1; out += (idx === '3' ? '∛' : idx === '4' ? '∜' : '√') + (/^[\w.]+$/.test(conv(a)) ? conv(a) : `(${conv(a)})`); }
        else if (cmd === 'text' || cmd === 'mathrm' || cmd === 'mathbf' || cmd === 'mathbb' || cmd === 'mathcal' || cmd === 'operatorname' || cmd === 'boldsymbol') { const [a, i1] = group(s, i); i = i1; out += conv(a); }
        else if (cmd === 'left' || cmd === 'right' || cmd === 'big' || cmd === 'Big' || cmd === 'displaystyle') { if (s[i] === '.') i++; }
        else if (cmd === 'overline' || cmd === 'bar') { const [a, i1] = group(s, i); i = i1; out += conv(a) + '̄'; }
        else if (cmd === 'vec') { const [a, i1] = group(s, i); i = i1; out += conv(a) + '⃗'; }
        else if (cmd === 'hat') { const [a, i1] = group(s, i); i = i1; out += conv(a) + '̂'; }
        else if (cmd === 'begin' || cmd === 'end') { const [, i1] = group(s, i); i = i1; out += cmd === 'begin' ? '[' : ']'; }
        else if (cmd === '\\') out += '; ';
        else if (cmd === '{' || cmd === '}' || cmd === '%' || cmd === '$' || cmd === '&' || cmd === '_' || cmd === '#') out += cmd;
        else if (GREEK[cmd]) out += GREEK[cmd];
        else if (cmd in SYM) out += SYM[cmd];
        else out += cmd;
      } else if (c === '^' || c === '_') {
        const [a, i1] = group(s, i + 1); i = i1; const t = conv(a);
        const m2 = map(t, c === '^' ? SUP : SUB); out += m2 != null ? m2 : `${c}(${t})`;
      } else if (c === '{' || c === '}') i++;
      else if (c === '&') { out += '  '; i++; }
      else { out += c; i++; }
    }
    return out;
  };
  return conv(src).replace(/\s+/g, ' ').trim();
}
