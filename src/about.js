// « À propos », état du stockage local et signature de la plateforme.
import { h, sheet } from './ui.js';
import { storageInfo, fmtBytes, persist } from './storage.js';

export const poweredBy = () => h('footer', { class: 'powered' }, 'Powered by ', h('b', {}, 'JC Multimedia'));

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
