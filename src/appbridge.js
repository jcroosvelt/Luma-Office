// Pont avec l'application Android « Luma Office » (WebView Flutter, canal JavaScript `AppBridge`).
// Hors de l'application (navigateur, PWA), `window.AppBridge` n'existe pas : tout devient sans effet.
//
// Messages envoyés à l'app (chaîne « type » ou « type:JSON ») :
//   editor:open / editor:close   document ouvert / fermé (écran allumé pendant l'édition)
//   editor:dirty / editor:clean  modifications non enregistrées / enregistrées (« Quitter sans enregistrer ? »)
//   share:{title,filename,mime,base64}   partage Android d'un fichier
//   print:{pdfBase64,title}              impression Android d'un PDF
// Fonctions appelées par l'app : window.onFileOpened(name, mime, base64), window.onTextShared(text),
//   window.onNetworkChange(online).
import { createDocFromHtml, openFiles } from './files.js';
import { toast } from './ui.js';

export const inApp = () => typeof window !== 'undefined' && !!window.AppBridge?.postMessage;

const last = {};
export function send(type, payload) {
  if (!inApp()) return false;
  try {
    window.AppBridge.postMessage(payload === undefined ? type : `${type}:${JSON.stringify(payload)}`);
    return true;
  } catch { return false; }
}
// Envoie un état (open/close, dirty/clean) seulement s'il a changé
export function sendState(group, type) {
  if (last[group] === type) return;
  last[group] = type;
  send(type);
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const EXT_BY_MIME = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md', 'text/html': 'html', 'text/csv': 'csv',
  'application/msword': 'doc', 'application/vnd.oasis.opendocument.text': 'odt', 'application/rtf': 'rtf', 'text/rtf': 'rtf',
};

function base64ToFile(name, mime, b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  let fileName = String(name || '').trim() || 'Document';
  if (!/\.[A-Za-z0-9]{1,5}$/.test(fileName) && EXT_BY_MIME[mime]) fileName += '.' + EXT_BY_MIME[mime];
  return new File([bytes], fileName, { type: mime && mime !== 'application/octet-stream' ? mime : '' });
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// go(id) : navigue vers un document. Un document en cours est enregistré avant d'être quitté
// (render() appelle flush()), le fichier reçu s'ouvre donc toujours comme NOUVEAU document : rien n'est écrasé.
export function initAppBridge({ go }) {
  window.onFileOpened = async (name, mime, base64) => {
    try {
      const ok = await openFiles([base64ToFile(name, mime, base64)], go);
      return ok;
    } catch (e) {
      console.error(e);
      toast('Impossible d’ouvrir le document', 4000);
      return false;
    }
  };
  window.onTextShared = async (text) => {
    try {
      const t = String(text ?? '').replace(/\r\n?/g, '\n').trim();
      if (!t) return false;
      const first = t.split('\n').find((l) => l.trim()) || '';
      const title = first.trim().slice(0, 60) || 'Texte partagé';
      const html = t.split('\n').map((l) => `<p>${esc(l)}</p>`).join('');
      const rec = await createDocFromHtml({ title, html });
      toast('Texte partagé ajouté à vos documents');
      go(rec.id);
      return true;
    } catch (e) {
      console.error(e);
      toast('Impossible de créer le document', 4000);
      return false;
    }
  };
  // état du réseau : simple classe CSS, aucun message à l'écran
  window.onNetworkChange = (online) => {
    document.documentElement.classList.toggle('offline', !(online === true || online === 'true'));
  };
}
