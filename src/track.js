// Statistiques d'usage ANONYMES : aucun identifiant, aucune adresse IP, aucun contenu de document (voir api/track.js).
// Désactivables dans Paramètres › Statistiques anonymes.
import { pref } from './storage.js';

export const trackingOn = () => pref.get('stats', true) !== false;
const platform = () => {
  const ua = navigator.userAgent;
  if (window.AppBridge || /; wv\)/.test(ua)) return 'app';
  if (/android/i.test(ua)) return 'android-web';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'web';
};
export function track(e, extra = {}) {
  if (!trackingOn()) return;
  try {
    const url = new URL('api/track', document.baseURI).href;
    const body = JSON.stringify({ e, p: platform(), ...extra });
    if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    else fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}
// une seule fois par session
export function trackOnce(e, extra) {
  try { const k = 'luma:t:' + e; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch { /* ignore */ }
  track(e, extra);
}
