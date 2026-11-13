// Invitation à installer l'application.
//  - Android (navigateur) : le bouton « Installer » télécharge le vrai APK de l'application Android.
//  - Dans l'application Android elle-même : aucune invitation, aucun bouton.
//  - Ordinateur (Chrome / Edge) : installation PWA native ; iPhone / iPad : consignes.
import { h, icon, toast } from './ui.js';
import { pref } from './storage.js';

// Le vrai APK est dans le dossier public du site (public/luma-office.apk)
export const APK_URL = new URL('luma-office.apk', document.baseURI).href;

let deferred = null;
let banner = null;
const listeners = new Set();

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isSafariIOS = () => isIOS() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
const DAY = 864e5;
// Dans l'application Android (WebView avec le canal AppBridge) : on ne propose jamais l'installation
export const isApp = () => !!window.AppBridge || /; wv\)/.test(navigator.userAgent);
const isAndroidBrowser = () => /android/i.test(navigator.userAgent) && !isApp();

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  if (isApp() || isAndroidBrowser()) return; // Android : on propose l'APK, pas l'installation PWA
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

export const canInstall = () => !isApp() && !isStandalone() && (isAndroidBrowser() || !!deferred);
export const onInstallAvailable = (f) => { listeners.add(f); return () => listeners.delete(f); };
export function downloadApk() {
  const a = h('a', { href: APK_URL, download: 'luma-office.apk', rel: 'noopener' });
  document.body.append(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
  pref.set('installDismissed', Date.now());
  toast('Téléchargement de l’application lancé. Ouvrez le fichier téléchargé pour l’installer.', 6000);
}

export async function promptInstall() {
  if (isApp()) return false;
  if (isAndroidBrowser()) { downloadApk(); listeners.forEach((f) => f()); return true; }
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
  if (banner || isApp() || isStandalone() || snoozed() || pref.get('installed', false)) return;
  const ios = kind === 'ios';
  const apk = kind === 'apk';
  banner = h('div', { class: 'install-banner', role: 'dialog', 'aria-label': 'Installer Luma Office' },
    h('img', { src: './icons/icon-192.png', alt: '', class: 'ib-icon' }),
    h('div', { class: 'ib-text' },
      h('b', {}, 'Installer Luma Office'),
      ios
        ? h('span', {}, 'Touchez ', icon('share', 16), ' Partager puis « Sur l’écran d’accueil » pour l’ajouter comme une vraie application.')
        : apk ? h('span', {}, 'Téléchargez l’application Android : plein écran, ouverture directe de vos fichiers Word et PDF, utilisable hors ligne.')
        : h('span', {}, 'Accès rapide depuis votre écran d’accueil, plein écran et utilisable hors ligne.')),
    h('div', { class: 'ib-actions' },
      ios ? null : h('button', { class: 'btn ib-go', onclick: async () => { const ok = await promptInstall(); if (ok || !deferred) close(false); } }, icon('download', 18), apk ? 'Installer l’app' : 'Installer'),
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

// Android (navigateur) : invitation à télécharger l'APK, sans attendre d'événement du navigateur
if (isAndroidBrowser() && !isStandalone()) setTimeout(() => show('apk'), 2200);

// iPhone / iPad (Safari) : pas d'événement natif, on affiche les consignes
if (isSafariIOS() && !isStandalone()) setTimeout(() => show('ios'), 3200);
