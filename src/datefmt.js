// Formats de date et d'heure proposés à l'insertion.
export const DATE_FORMATS = [
  ['short', 'Date courte'], ['med', 'Date abrégée'], ['long', 'Date longue'], ['full', 'Date complète'],
  ['monthyear', 'Mois et année'], ['datetime', 'Date et heure'], ['time', 'Heure'], ['iso', 'Format ISO'],
];
const pad = (n) => String(n).padStart(2, '0');
export function formatDate(id, d = new Date()) {
  const f = (o) => d.toLocaleDateString('fr-FR', o);
  switch (id) {
    case 'short': return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    case 'med': return f({ day: 'numeric', month: 'short', year: 'numeric' });
    case 'full': return f({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    case 'monthyear': return f({ month: 'long', year: 'numeric' });
    case 'datetime': return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case 'time': return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case 'iso': return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    default: return f({ day: 'numeric', month: 'long', year: 'numeric' });
  }
}
