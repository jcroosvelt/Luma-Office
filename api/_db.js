// Accès base de données partagé (Neon / Postgres) et journal d'événements. Les fichiers commençant par « _ » ne sont pas des routes.
let sqlP, readyDocs, readyEvents, readyUsers;

export async function getSql() {
  if (globalThis.__LUMA_SQL) return globalThis.__LUMA_SQL; // tests
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  sqlP ||= import('@neondatabase/serverless').then((m) => m.neon(url));
  return sqlP;
}

export async function initDocs(sql) {
  readyDocs ||= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS luma_cloud_docs (owner text NOT NULL, id text NOT NULL, updated bigint NOT NULL, size int NOT NULL, meta text NOT NULL, data text NOT NULL, PRIMARY KEY (owner, id))`;
    await sql`ALTER TABLE luma_cloud_docs ADD COLUMN IF NOT EXISTS created bigint`;
  })();
  await readyDocs;
}

export async function initUsers(sql) {
  readyUsers ||= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS luma_users (id text PRIMARY KEY, email text NOT NULL UNIQUE, name text, pw text NOT NULL, dek text NOT NULL, tv int NOT NULL DEFAULT 0, created bigint NOT NULL, last_login bigint, plan text NOT NULL DEFAULT 'free', plan_until bigint, quota_bytes bigint NOT NULL, quota_docs int NOT NULL, status text NOT NULL DEFAULT 'active', verified boolean NOT NULL DEFAULT false, stripe_customer text, stripe_sub text)`;
  })();
  await readyUsers;
}

export async function initEvents(sql) {
  readyEvents ||= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS luma_events (id bigserial PRIMARY KEY, ts bigint NOT NULL, type text NOT NULL, data text)`;
    await sql`CREATE INDEX IF NOT EXISTS luma_events_ts_idx ON luma_events (ts)`;
  })();
  await readyEvents;
}

// Enregistre un événement anonyme (jamais d'adresse IP ni de contenu de document). Sans base de données : ne fait rien.
export async function logEvent(type, data) {
  try {
    const sql = await getSql();
    if (!sql) return;
    await initEvents(sql);
    await sql`INSERT INTO luma_events (ts, type, data) VALUES (${Date.now()}, ${type}, ${data ? JSON.stringify(data).slice(0, 600) : null})`;
  } catch { /* le journal ne doit jamais faire échouer une requête */ }
}
