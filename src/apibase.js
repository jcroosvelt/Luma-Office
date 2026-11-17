// Adresse du serveur (comptes, cloud, assistant). Dans l'application Android le site est embarqué et servi en local
// (127.0.0.1) : les appels serveur partent alors vers le site en ligne ; hors connexion ils échouent proprement.
export const SERVER = 'https://lumaoffice.vercel.app/';
export const embedded = () => /^(127\.0\.0\.1|localhost)$/.test(location.hostname) && !!window.AppBridge;
export const apiUrl = (p) => new URL('api/' + p, embedded() ? SERVER : document.baseURI).href;
