// Tableau de bord administrateur : statistiques d'usage, cloud, assistant IA, application Android, journal et santé du site.
// Protégé par la variable d'environnement ADMIN_CODE (8 caractères minimum). Aucun secret n'est jamais renvoyé.
import { createHmac, createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { getSql, initDocs, initEvents, initUsers, logEvent } from './_db.js';
import { PLANS, hashPassword } from './_auth.js';

const DAY = 86_400_000;
const code = () => process.env.ADMIN_CODE || '';
const enabled = () => code().length >= 8;
const secret = () => createHash('sha256').update('luma-admin:' + code()).digest();
const sign = (p) => createHmac('sha256', secret()).update(p).digest('base64url');
const makeToken = () => { const p = Buffer.from(JSON.stringify({ exp: Date.now() + 2 * 3600_000, n: randomBytes(6).toString('hex') })).toString('base64url'); return `${p}.${sign(p)}`; };
function verify(token) {
  const [p, s] = String(token || '').split('.');
  if (!p || !s) return false;
  const good = Buffer.from(sign(p)), got = Buffer.from(s);
  if (good.length !== got.length || !timingSafeEqual(good, got)) return false;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}
const safeEq = (a, b) => { const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest(); return timingSafeEqual(x, y); };

const json = (res, status, obj) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
const fail = (res, status, message, c) => json(res, status, { error: { code: c || status, message } });
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
const tries = new Map();
function loginAllowed(ip) { const now = Date.now(), a = (tries.get(ip) || []).filter((t) => now - t < 600_000); tries.set(ip, a); return a.length < 8; }
const failedLogin = (ip) => { const a = tries.get(ip) || []; a.push(Date.now()); tries.set(ip, a); };

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > 100_000) throw new Error('too-big'); }
  return raw ? JSON.parse(raw) : {};
}
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const num = (v) => Number(v) || 0;
const parse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const origin = (req) => `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
const id32 = (s) => typeof s === 'string' && /^[a-f0-9]{32}$/.test(s);

export default async function handler(req, res) {
  if (req.method === 'GET') { const sql = await getSql(); return json(res, 200, { enabled: enabled(), db: !!sql }); }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return fail(res, 405, 'Méthode non autorisée.'); }
  if (!enabled()) return fail(res, 503, 'L’administration n’est pas activée : définissez la variable ADMIN_CODE (8 caractères minimum) dans Vercel.', 'not-configured');
  let body;
  try { body = await readBody(req); } catch { return fail(res, 400, 'Requête illisible.'); }

  if (body.action === 'login') {
    const ip = ipOf(req);
    if (!loginAllowed(ip)) return fail(res, 429, 'Trop de tentatives : patientez 10 minutes.', 'rate');
    if (!safeEq(body.code || '', code())) { failedLogin(ip); await new Promise((r) => setTimeout(r, 700)); return fail(res, 401, 'Code administrateur incorrect.', 'bad-code'); }
    tries.delete(ip);
    return json(res, 200, { token: makeToken(), expiresIn: 7200 });
  }
  if (!verify((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) return fail(res, 401, 'Session expirée : reconnectez-vous.', 'expired');

  const sql = await getSql();
  const needDb = () => { if (!sql) { const e = new Error('Base de données non configurée (DATABASE_URL).'); e.code = 'no-db'; throw e; } };
  try {
    switch (body.action) {
      case 'overview': {
        const out = { db: !!sql, now: Date.now(), kpi: {}, series: [], ai: {}, platforms: {}, appVersions: {} };
        if (!sql) return json(res, 200, out);
        await initDocs(sql); await initEvents(sql); await initUsers(sql);
        const now = Date.now(), since30 = now - 30 * DAY, since14 = now - 14 * DAY;
        await sql`DELETE FROM luma_events WHERE ts < ${now - 90 * DAY}`;
        const t = await sql`SELECT count(DISTINCT owner)::int AS spaces, count(*)::int AS docs, coalesce(sum(size), 0)::bigint AS bytes FROM luma_cloud_docs`;
        const us = await sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE created >= ${now - 7 * DAY})::int AS n7, count(*) FILTER (WHERE plan <> 'free')::int AS paid, count(*) FILTER (WHERE last_login >= ${now - 7 * DAY})::int AS active7 FROM luma_users`;
        out.kpi.users = us[0].n; out.kpi.users7d = us[0].n7; out.kpi.paidUsers = us[0].paid; out.kpi.activeUsers7d = us[0].active7;
        out.kpi.cloudSpaces = t[0].spaces; out.kpi.cloudDocs = t[0].docs; out.kpi.cloudBytes = num(t[0].bytes);
        const ev = await sql`SELECT ts, type, data FROM luma_events WHERE ts >= ${since30} ORDER BY ts DESC LIMIT 20000`;
        const counts = (since, type) => ev.filter((e) => num(e.ts) >= since && e.type === type).length;
        for (const [k, type] of [['visits', 'visit'], ['appOpens', 'app_open'], ['apkDownloads', 'apk_download'], ['installOpens', 'install_open'], ['aiOk', 'ai'], ['aiErr', 'ai_error'], ['cloudPuts', 'cloud_put'], ['cloudErr', 'cloud_error'], ['signups', 'signup'], ['logins', 'login']]) {
          out.kpi[k + '24h'] = counts(now - DAY, type); out.kpi[k + '7d'] = counts(now - 7 * DAY, type); out.kpi[k + '30d'] = counts(since30, type);
        }
        // séries sur 14 jours
        const days = []; for (let i = 13; i >= 0; i--) days.push(dayKey(now - i * DAY));
        const idx = new Map(days.map((d, i) => [d, i]));
        out.series = days.map((d) => ({ day: d, visit: 0, app_open: 0, ai: 0, ai_error: 0, cloud_put: 0, apk_download: 0, signup: 0 }));
        for (const e of ev) { if (num(e.ts) < since14) continue; const i = idx.get(dayKey(num(e.ts))); if (i != null && e.type in out.series[i]) out.series[i][e.type]++; }
        // IA : modèles, latence, statuts
        const ai = ev.filter((e) => (e.type === 'ai' || e.type === 'ai_error') && num(e.ts) >= now - 7 * DAY).map((e) => ({ ...parse(e.data), type: e.type }));
        const models = {}; let ms = 0, nms = 0; const statuses = {};
        for (const a of ai) { models[a.model || '?'] = (models[a.model || '?'] || 0) + 1; if (a.type === 'ai' && a.ms) { ms += a.ms; nms++; } if (a.type === 'ai_error') statuses[a.status] = (statuses[a.status] || 0) + 1; }
        out.ai = { models, avgMs: nms ? Math.round(ms / nms) : 0, statuses, total: ai.length };
        for (const e of ev) { const d = parse(e.data); if (e.type === 'visit' || e.type === 'app_open') out.platforms[d.p || 'inconnu'] = (out.platforms[d.p || 'inconnu'] || 0) + (e.type === 'visit' ? 1 : 0); if (e.type === 'app_open' && d.v) out.appVersions[d.v] = (out.appVersions[d.v] || 0) + 1; }
        return json(res, 200, out);
      }
      case 'users_list': {
        needDb(); await initDocs(sql); await initUsers(sql);
        const rows = await sql`SELECT u.id, u.email, u.name, u.plan, u.plan_until, u.quota_bytes, u.quota_docs, u.status, u.created, u.last_login, coalesce(d.docs, 0)::int AS docs, coalesce(d.bytes, 0)::bigint AS bytes
          FROM luma_users u LEFT JOIN (SELECT owner, count(*) AS docs, sum(size) AS bytes FROM luma_cloud_docs GROUP BY owner) d ON d.owner = u.id ORDER BY u.created DESC LIMIT 500`;
        return json(res, 200, { plans: Object.values(PLANS).map((p) => ({ id: p.id, label: p.label, bytes: p.bytes, docs: p.docs })), users: rows.map((r) => ({ id: r.id, email: r.email, name: r.name || '', plan: r.plan, planUntil: r.plan_until ? num(r.plan_until) : null, quotaBytes: num(r.quota_bytes), quotaDocs: r.quota_docs, status: r.status, created: num(r.created), lastLogin: r.last_login ? num(r.last_login) : null, docs: r.docs, bytes: num(r.bytes) })) });
      }
      case 'user_set': {
        needDb(); await initUsers(sql);
        if (!id32(body.id)) return fail(res, 400, 'Compte invalide.');
        const cur = (await sql`SELECT * FROM luma_users WHERE id = ${body.id}`)[0];
        if (!cur) return fail(res, 404, 'Compte introuvable.');
        const plan = body.plan && PLANS[body.plan] ? body.plan : cur.plan;
        const until = body.planUntil === null ? null : (body.planUntil !== undefined ? Math.floor(num(body.planUntil)) || null : (cur.plan_until ? num(cur.plan_until) : null));
        const planChanged = plan !== cur.plan;
        const qb = body.quotaMb !== undefined && body.quotaMb !== '' ? Math.max(1, Math.floor(num(body.quotaMb))) * 1048576 : (planChanged ? PLANS[plan].bytes : num(cur.quota_bytes));
        const qd = body.quotaDocs !== undefined && body.quotaDocs !== '' ? Math.max(1, Math.floor(num(body.quotaDocs))) : (planChanged ? PLANS[plan].docs : cur.quota_docs);
        const status = body.status === 'suspended' ? 'suspended' : body.status === 'active' ? 'active' : cur.status;
        await sql`UPDATE luma_users SET plan = ${plan}, plan_until = ${plan === 'free' ? null : until}, quota_bytes = ${qb}, quota_docs = ${qd}, status = ${status} WHERE id = ${body.id}`;
        await logEvent('admin', { a: 'user_set', plan, status });
        return json(res, 200, { ok: true });
      }
      case 'user_reset_password': {
        needDb(); await initUsers(sql);
        if (!id32(body.id)) return fail(res, 400, 'Compte invalide.');
        const tmp = randomBytes(9).toString('base64url');
        const r = await sql`UPDATE luma_users SET pw = ${hashPassword(tmp)}, tv = tv + 1 WHERE id = ${body.id} RETURNING email`;
        if (!r.length) return fail(res, 404, 'Compte introuvable.');
        await logEvent('admin', { a: 'reset_password' });
        return json(res, 200, { ok: true, email: r[0].email, password: tmp });
      }
      case 'user_delete': {
        needDb(); await initUsers(sql); await initDocs(sql);
        if (!id32(body.id)) return fail(res, 400, 'Compte invalide.');
        await sql`DELETE FROM luma_cloud_docs WHERE owner = ${body.id}`;
        await sql`DELETE FROM luma_users WHERE id = ${body.id}`;
        await logEvent('admin', { a: 'user_delete' });
        return json(res, 200, { ok: true });
      }
      case 'user_docs': {
        needDb(); await initDocs(sql);
        if (!id32(body.id)) return fail(res, 400, 'Compte invalide.');
        const rows = await sql`SELECT id, updated, size, created FROM luma_cloud_docs WHERE owner = ${body.id} ORDER BY updated DESC LIMIT 500`;
        return json(res, 200, { docs: rows.map((r) => ({ id: r.id, updated: num(r.updated), size: r.size, created: num(r.created) || null })) });
      }
      case 'user_doc_delete': {
        needDb(); if (!id32(body.id) || typeof body.doc !== 'string') return fail(res, 400, 'Requête invalide.');
        await sql`DELETE FROM luma_cloud_docs WHERE owner = ${body.id} AND id = ${body.doc}`;
        await logEvent('admin', { a: 'doc_delete' });
        return json(res, 200, { ok: true });
      }
      case 'users_purge_inactive': {
        needDb(); await initUsers(sql); await initDocs(sql);
        const days = Math.max(30, Math.min(3650, Math.floor(num(body.days) || 365))), cutoff = Date.now() - days * DAY;
        const old = await sql`SELECT id FROM luma_users WHERE plan = 'free' AND coalesce(last_login, created) < ${cutoff}`;
        for (const o of old) { await sql`DELETE FROM luma_cloud_docs WHERE owner = ${o.id}`; await sql`DELETE FROM luma_users WHERE id = ${o.id}`; }
        await logEvent('admin', { a: 'purge_users', days, n: old.length });
        return json(res, 200, { ok: true, n: old.length });
      }
      case 'events': {
        needDb(); await initEvents(sql);
        const limit = Math.max(10, Math.min(200, Math.floor(num(body.limit) || 100)));
        const rows = body.type && /^[a-z_]{2,20}$/.test(body.type)
          ? await sql`SELECT ts, type, data FROM luma_events WHERE type = ${body.type} ORDER BY ts DESC LIMIT ${limit}`
          : await sql`SELECT ts, type, data FROM luma_events ORDER BY ts DESC LIMIT ${limit}`;
        return json(res, 200, { events: rows.map((r) => ({ ts: num(r.ts), type: r.type, data: parse(r.data) })) });
      }
      case 'events_clear': {
        needDb(); await initEvents(sql);
        const days = Math.max(0, Math.min(365, Math.floor(num(body.days))));
        await sql`DELETE FROM luma_events WHERE ts < ${Date.now() - days * DAY}`;
        return json(res, 200, { ok: true });
      }
      case 'health': {
        const env = (k) => !!process.env[k];
        const out = {
          checks: [
            { key: 'ADMIN_CODE', label: 'Code administrateur', ok: enabled(), hint: 'Variable ADMIN_CODE' },
            { key: 'GEMINI_API_KEY', label: 'Clé de l’assistant IA', ok: env('GEMINI_API_KEY'), hint: 'Variable GEMINI_API_KEY (voir GUIDE-IA.md)' },
            { key: 'AI_ACCESS_CODE', label: 'Code d’accès de l’assistant', ok: env('AI_ACCESS_CODE'), info: true, hint: 'Facultatif : protège votre quota IA' },
            { key: 'DATABASE_URL', label: 'Base de données (cloud, statistiques)', ok: !!sql, hint: 'Variable DATABASE_URL (voir GUIDE-CLOUD.md)' },
          ],
          db: { ok: false, ms: 0 },
          runtime: { node: process.version, region: process.env.VERCEL_REGION || null, env: process.env.VERCEL_ENV || null, commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null, branch: process.env.VERCEL_GIT_COMMIT_REF || null },
        };
        if (sql) { const t0 = Date.now(); try { await sql`SELECT 1 AS ok`; out.db = { ok: true, ms: Date.now() - t0 }; } catch (e) { out.db = { ok: false, ms: 0, error: String(e.message).slice(0, 120) }; } }
        return json(res, 200, out);
      }
      case 'ai_test': {
        const t0 = Date.now();
        let r;
        try {
          r = await fetch(`${origin(req)}/api/gemini`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.AI_ACCESS_CODE ? { 'x-access-code': process.env.AI_ACCESS_CODE } : {}) }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Réponds uniquement par : OK' }] }], generationConfig: { maxOutputTokens: 20, temperature: 0 } }) });
        } catch (e) { return json(res, 200, { ok: false, message: 'Appel impossible : ' + String(e.message).slice(0, 100) }); }
        const model = r.headers.get('x-ai-model') || null;
        if (!r.ok) { let m = ''; try { m = (await r.json())?.error?.message || ''; } catch { /* ignore */ } return json(res, 200, { ok: false, status: r.status, ms: Date.now() - t0, model, message: m || `Erreur ${r.status}` }); }
        const raw = await r.text();
        let text = ''; for (const line of raw.split(/\r?\n/)) { if (line.startsWith('data:')) { try { text += (JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''); } catch { /* ignore */ } } }
        return json(res, 200, { ok: !!text, ms: Date.now() - t0, model, text: text.trim().slice(0, 60) });
      }
      case 'apk_info': {
        const base = origin(req); const out = { file: false, size: 0, version: null };
        try { const h = await fetch(`${base}/luma-office.apk`, { method: 'HEAD' }); if (h.ok && !/html/i.test(h.headers.get('content-type') || '')) { out.file = true; out.size = num(h.headers.get('content-length')); out.modified = h.headers.get('last-modified'); } } catch { /* ignore */ }
        try { const j = await fetch(`${base}/apk-info.json`).then((x) => (x.ok ? x.json() : null)); out.version = j?.version || null; } catch { /* ignore */ }
        return json(res, 200, out);
      }
      default: return fail(res, 400, 'Action inconnue.');
    }
  } catch (e) {
    if (e.code === 'no-db') return fail(res, 503, e.message, 'no-db');
    console.error('[admin]', e?.message);
    return fail(res, 500, 'Erreur du serveur. Réessayez.');
  }
}
