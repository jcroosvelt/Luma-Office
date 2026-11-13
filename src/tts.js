// Lecture à voix haute d'un document (synthèse vocale de l'appareil) : pause, passage au bloc précédent / suivant, vitesse et voix.
import { h, icon, toast } from './ui.js';

const sentences = (t) => (t.match(/[^.!?…;:]+[.!?…;:]*\s*/g) || [t]).reduce((a, s) => { const l = a[a.length - 1]; if (l && l.length < 60) a[a.length - 1] = l + s; else a.push(s); return a; }, []).map((s) => s.trim()).filter(Boolean);

export function readAloud({ items, start = 0, lang = 'fr-FR', onHighlight, onClose }) {
  if (!('speechSynthesis' in window)) { toast('La lecture à voix haute n’est pas disponible sur cet appareil', 3500); return null; }
  if (!items.length) { toast('Rien à lire'); return null; }
  const synth = window.speechSynthesis;
  let bi = Math.max(0, Math.min(items.length - 1, start)), si = 0, playing = false, rate = 1, voice = null, token = 0;
  const voices = () => synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  const pickVoice = () => { const vs = voices(); voice = voice || vs.find((v) => v.localService) || vs[0] || null; };
  const playBtn = h('button', { class: 'icon-btn', 'aria-label': 'Lecture / pause', onclick: () => toggle() }, icon('pause', 24));
  const label = h('small', { class: 'tts-lbl' }, '');
  const speed = h('select', { class: 'tts-sel', 'aria-label': 'Vitesse', onchange: () => { rate = +speed.value; if (playing) restart(); } }, ...[0.8, 1, 1.2, 1.5, 1.8].map((v) => h('option', { value: v }, `×${v}`)));
  speed.value = '1';
  const voiceSel = h('select', { class: 'tts-sel', 'aria-label': 'Voix', onchange: () => { voice = voices().find((v) => v.voiceURI === voiceSel.value) || null; if (playing) restart(); } });
  const fillVoices = () => { const vs = voices(); voiceSel.replaceChildren(...vs.map((v) => h('option', { value: v.voiceURI }, v.name.replace(/Microsoft |Google /g, '')))); voiceSel.hidden = vs.length < 2; pickVoice(); if (voice) voiceSel.value = voice.voiceURI; };
  synth.addEventListener?.('voiceschanged', fillVoices); fillVoices();
  const bar = h('div', { class: 'tts-bar', role: 'region', 'aria-label': 'Lecture à voix haute' },
    h('button', { class: 'icon-btn', 'aria-label': 'Bloc précédent', onclick: () => jump(-1) }, h('span', { class: 'rot-l' }, icon('up', 22))),
    playBtn,
    h('button', { class: 'icon-btn', 'aria-label': 'Bloc suivant', onclick: () => jump(1) }, h('span', { class: 'rot-r' }, icon('up', 22))),
    label, speed, voiceSel,
    h('button', { class: 'icon-btn', 'aria-label': 'Arrêter la lecture', onclick: () => stop() }, icon('close', 22)));
  document.body.append(bar);

  function setIcon() { playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 24)); }
  function speakCurrent() {
    const my = ++token; synth.cancel();
    const it = items[bi]; if (!it) { stop(); return; }
    const parts = it.parts || (it.parts = sentences(it.text));
    if (si >= parts.length) { bi++; si = 0; if (bi >= items.length) { stop(true); return; } speakCurrent(); return; }
    onHighlight?.(items[bi]); label.textContent = `${bi + 1} / ${items.length}`;
    const u = new SpeechSynthesisUtterance(parts[si]); u.lang = lang; u.rate = rate; if (voice) u.voice = voice;
    u.onend = () => { if (my !== token || !playing) return; si++; speakCurrent(); };
    u.onerror = (e) => { if (my !== token || e.error === 'canceled' || e.error === 'interrupted') return; playing = false; setIcon(); };
    synth.speak(u);
  }
  function toggle() { if (playing) { playing = false; token++; synth.cancel(); } else { playing = true; speakCurrent(); } setIcon(); }
  function restart() { token++; synth.cancel(); playing = true; speakCurrent(); setIcon(); }
  function jump(d) { bi = Math.max(0, Math.min(items.length - 1, bi + d)); si = 0; playing = true; speakCurrent(); setIcon(); }
  function stop(done) { token++; playing = false; synth.cancel(); bar.remove(); onHighlight?.(null); synth.removeEventListener?.('voiceschanged', fillVoices); onClose?.(); if (done) toast('Lecture terminée'); }
  playing = true; speakCurrent();
  return { stop };
}
