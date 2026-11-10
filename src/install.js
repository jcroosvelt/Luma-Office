// Invitation à installer l'application (PWA) : bouton natif sur Android / Chrome / Edge, consignes sur iPhone / iPad.
import { h, icon, toast } from './ui.js';
import { pref } from './storage.js';

let deferred = null;
let banner = null;
const listeners = new Set();

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isSafariIOS = () => isIOS() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
const DAY = 864e5;

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  listeners.forEach((f) => f());
  scheduleBanner();
});
addEventListener('appinstalled', () => {
  deferred = null;
  pref.set('installed', true);
  banner?.remove(); banner = null;
  listeners.forEach((f) => f());
  toast('Luma Office est installé ✓', 3500);
});

export const canInstall = () => !!deferred && !isStandalone();
export const onInstallAvailable = (f) => { listeners.add(f); return () => listeners.delete(f); };
export async function promptInstall() {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  ev.prompt();
  const { outcome } = await ev.userChoice.catch(() => ({ outcome: 'dismissed' }));
  if (outcome !== 'accepted') pref.set('installDismissed', Date.now());
  listeners.forEach((f) => f());
  return outcome === 'accepted';
}

function snoozed() {
  const t = pref.get('installDismissed', 0);
  return t && Date.now() - t < 7 * DAY;
}

function close(remember) {
  if (remember) pref.set('installDismissed', Date.now());
  if (!banner) return;
  const b = banner; banner = null;
  b.classList.remove('in');
  setTimeout(() => b.remove(), 300);
}

function show(kind) {
  if (banner || isStandalone() || snoozed() || pref.get('installed', false)) return;
  const ios = kind === 'ios';
  banner = h('div', { class: 'install-banner', role: 'dialog', 'aria-label': 'Installer Luma Office' },
    h('img', { src: './icons/icon-192.png', alt: '', class: 'ib-icon' }),
    h('div', { class: 'ib-text' },
      h('b', {}, 'Installer Luma Office'),
      ios
        ? h('span', {}, 'Touchez ', icon('share', 16), ' Partager puis « Sur l’écran d’accueil » pour l’ajouter comme une vraie application.')
        : h('span', {}, 'Accès rapide depuis votre écran d’accueil, plein écran et utilisable hors ligne.')),
    h('div', { class: 'ib-actions' },
      ios ? null : h('button', { class: 'btn ib-go', onclick: async () => { const ok = await promptInstall(); if (ok || !deferred) close(false); } }, icon('download', 18), 'Installer'),
      h('button', { class: 'btn ib-later', onclick: () => close(true) }, ios ? 'Compris' : 'Plus tard')));
  document.body.append(banner);
  requestAnimationFrame(() => banner?.classList.add('in'));
}

let timer;
function scheduleBanner() {
  clearTimeout(timer);
  // laisse passer l'écran de démarrage avant d'afficher l'invitation
  timer = setTimeout(() => { if (canInstall()) show('native'); }, 2200);
}

// iPhone / iPad (Safari) : pas d'événement natif, on affiche les consignes
if (isSafariIOS() && !isStandalone()) setTimeout(() => show('ios'), 3200);
