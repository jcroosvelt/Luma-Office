// Invitation à installer l'application.
//  - Android (navigateur) : le bouton « Installer » télécharge le vrai APK de l'application Android.
//  - Dans l'application Android elle-même : aucune invitation, aucun bouton.
//  - Ordinateur (Chrome / Edge) : installation PWA native ; iPhone / iPad : consignes.
import { h, icon, toast, sheet } from './ui.js';
import { pref, fmtBytes } from './storage.js';

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
const isAndroidDevice = () => /android/i.test(navigator.userAgent) || navigator.userAgentData?.platform === 'Android';
const isAndroidBrowser = () => isAndroidDevice() && !isApp();

// Android (navigateur) : on retire le manifeste PWA pour que Chrome ne propose plus « Installer l'application » (PWA)
// ni l'ajout à l'écran d'accueil : la seule installation proposée est celle de l'APK.
try {
  if (isAndroidBrowser() && !(matchMedia('(display-mode: standalone)').matches || navigator.standalone === true)) {
    document.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove());
  }
} catch { /* ignore */ }

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
export async function downloadApk(silent) {
  // vérifie que le fichier est bien publié (sinon le navigateur afficherait une page d'erreur)
  try {
    const r = await fetch(APK_URL, { method: 'HEAD', cache: 'no-store' });
    if (!r.ok || /html/i.test(r.headers.get('content-type') || '')) throw new Error('absent');
  } catch {
    if (!silent) toast('Le fichier d’installation de l’application n’est pas encore disponible. Réessayez plus tard.', 6000);
    return false;
  }
  const a = h('a', { href: APK_URL, download: 'luma-office.apk', rel: 'noopener' });
  document.body.append(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
  pref.set('installDismissed', Date.now());
  toast('Téléchargement de l’application lancé. Ouvrez le fichier téléchargé pour l’installer.', 6000);
  return true;
}

// Fenêtre d'installation (Android, navigateur) : informations sur l'application puis bouton Télécharger
export async function openInstallDialog() {
  if (document.querySelector('.ins-box')) return;
  const meta = h('div', { class: 'ins-meta' }, 'Application Android (APK)');
  const err = h('div', { class: 'ai-err', hidden: true });
  const go = h('button', { class: 'btn primary ins-go', onclick: async () => {
    go.disabled = true; err.hidden = true;
    const ok = await downloadApk(true);
    go.disabled = false;
    if (ok) s.close(); else { err.textContent = 'Le fichier d’installation n’est pas encore disponible sur le site. Réessayez plus tard.'; err.hidden = false; }
  } }, icon('download', 18), 'Télécharger');
  const li = (t) => h('li', {}, icon('check', 18), h('span', {}, t));
  const body = h('div', { class: 'form ins-box' },
    h('div', { class: 'ins-head' }, h('img', { src: './icons/icon-192.png', alt: '', class: 'ins-icon' }), h('div', {}, h('b', { class: 'ins-name' }, 'Luma Office'), meta)),
    h('p', { class: 'ins-sum' }, 'Installez l’application pour écrire, ouvrir et enregistrer vos documents comme avec une vraie application.'),
    h('ul', { class: 'ins-list' },
      li('Plein écran, sans barre de navigateur'),
      li('Ouverture directe de vos documents Word, PDF et Excel depuis « Fichiers »'),
      li('Partage d’un texte ou d’un document vers Luma Office depuis les autres applications'),
      li('Vos documents restent enregistrés sur votre téléphone')),
    h('div', { class: 'ins-steps' }, h('b', {}, 'Comment installer'),
      h('ol', {}, h('li', {}, 'Appuyez sur « Télécharger ».'), h('li', {}, 'Ouvrez le fichier luma-office.apk téléchargé.'), h('li', {}, 'Si Android le demande, autorisez l’installation depuis cette source, puis appuyez sur « Installer ».'))),
    err,
    h('div', { class: 'row' }, go, h('button', { class: 'btn', onclick: () => s.close() }, 'Plus tard')));
  const s = sheet('Installer l’application', body);
  // infos du fichier (version, taille), si disponibles
  try {
    const [r, info] = await Promise.all([
      fetch(APK_URL, { method: 'HEAD', cache: 'no-store' }).catch(() => null),
      fetch(new URL('apk-info.json', document.baseURI).href, { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).catch(() => null),
    ]);
    const size = r?.ok && !/html/i.test(r.headers.get('content-type') || '') ? +r.headers.get('content-length') : 0;
    meta.textContent = ['Application Android', info?.version ? `version ${info.version}` : '', size ? fmtBytes(size) : ''].filter(Boolean).join(' · ');
  } catch { /* infos facultatives */ }
}

export async function promptInstall() {
  if (isApp()) return false;
  if (isAndroidBrowser()) { openInstallDialog(); return true; }
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
      ios ? null : h('button', { class: 'btn ib-go', onclick: async () => { const ok = await promptInstall(); if (ok || (!deferred && !apk)) close(false); } }, icon('download', 18), apk ? 'Installer l’app' : 'Installer'),
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
