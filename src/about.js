// « À propos », état du stockage local et signature de la plateforme.
import { h, sheet } from './ui.js';
import { storageInfo, fmtBytes, persist } from './storage.js';

export const JC_URL = 'https://www.jcmultimedia.online';

// Ouvre le site de JC Multimedia dans Chrome (Android : intention forcée vers Chrome, avec repli sur le navigateur par défaut)
export function openJC(e) {
  e?.preventDefault();
  if (/android/i.test(navigator.userAgent)) {
    location.href = `intent://www.jcmultimedia.online/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(JC_URL)};end`;
  } else {
    window.open(JC_URL, '_blank', 'noopener,noreferrer');
  }
}

export const poweredBy = () => h('footer', { class: 'powered' }, 'Powered by ',
  h('a', { class: 'jc-link', href: JC_URL, target: '_blank', rel: 'noopener noreferrer', title: 'Ouvrir www.jcmultimedia.online', onclick: openJC }, 'JC Multimedia'));

export function openAbout() {
  const store = h('p', { class: 'store' }, 'Stockage : vérification…');
  sheet('À propos', h('div', { class: 'about' },
    h('img', { src: './logo.png', alt: 'Luma Office' }),
    h('p', {}, 'Luma Office — traitement de texte professionnel pour téléphone et tablette.'),
    h('p', {}, 'Vos documents et leurs images sont conservés sur cet appareil et restent disponibles hors ligne. Export Word (.docx) et PDF.'),
    store,
    poweredBy()));
  persist().then(() => storageInfo()).then((s) => {
    store.textContent = `${s.persisted ? '🔒 Stockage protégé' : 'Stockage standard'} · ${fmtBytes(s.usage)} utilisés${s.quota ? ' sur ' + fmtBytes(s.quota) : ''}`;
    if (!s.persisted) store.title = 'Installez l’application pour protéger vos documents contre un nettoyage automatique du navigateur.';
  });
}
