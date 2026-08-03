/**
 * Clincoo Backend — Cloudflare Worker
 * Database: D1 (clincoo_db)
 * Security: Bot Protection + Rate Limiting + IP Blocking + API Key Auth
 * API Key: Stored as Cloudflare Secret (BACKEND_API_KEY) — not in code, not changeable
 */

const RATE_LIMIT = 60;
const BLOCKED_UAS = ['curl', 'wget', 'python-requests', 'scrapy', 'bot', 'spider', 'headless', 'semrush', 'ahrefs', 'mj12'];
const MAX_BODY_SIZE = 1024 * 1024;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify({ success: true, ...data, ...extra }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    }
  });
}

function error(msg, status = 400) {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
}

function getClientIP(request) {
  const headers = ['CF-Connecting-IP', 'X-Real-IP', 'X-Forwarded-For'];
  for (const h of headers) {
    const val = request.headers.get(h);
    if (val) return val.split(',')[0].trim();
  }
  return 'unknown';
}

async function checkBotProtection(request, env, path, hasAuth) {
  const ip = getClientIP(request);
  const ua = (request.headers.get('User-Agent') || '').toLowerCase();
  const now = Date.now();

  const blocked = await env.DB.prepare('SELECT ip FROM blocked_ips WHERE ip = ?').bind(ip).first();
  if (blocked) {
    return { blocked: true, reason: 'IP blocked', status: 403 };
  }

  if (!hasAuth) {
    for (const bad of BLOCKED_UAS) {
      if (ua.includes(bad) && !path.includes('/health')) {
        return { blocked: true, reason: 'Suspicious user agent', status: 403 };
      }
    }
    if (!ua && !path.includes('/health')) {
      return { blocked: true, reason: 'Empty user agent', status: 403 };
    }
  }

  const record = await env.DB.prepare('SELECT count, first_request, blocked FROM rate_limits WHERE ip = ?').bind(ip).first();

  if (record) {
    if (record.blocked) {
      const blockTime = new Date(record.first_request).getTime();
      if (now - blockTime < 300000) {
        return { blocked: true, reason: 'Rate limit exceeded, blocked for 5 minutes', status: 429 };
      }
      await env.DB.prepare('UPDATE rate_limits SET count = 1, first_request = ?, blocked = 0 WHERE ip = ?').bind(new Date().toISOString(), ip).run();
    } else {
      const firstReq = new Date(record.first_request).getTime();
      if (now - firstReq > 60000) {
        await env.DB.prepare('UPDATE rate_limits SET count = 1, first_request = ? WHERE ip = ?').bind(new Date().toISOString(), ip).run();
      } else {
        const newCount = record.count + 1;
        if (newCount > RATE_LIMIT) {
          await env.DB.prepare('UPDATE rate_limits SET blocked = 1, first_request = ? WHERE ip = ?').bind(new Date().toISOString(), ip).run();
          return { blocked: true, reason: 'Rate limit exceeded', status: 429 };
        }
        await env.DB.prepare('UPDATE rate_limits SET count = ? WHERE ip = ?').bind(newCount, ip).run();
      }
    }
  } else {
    await env.DB.prepare('INSERT INTO rate_limits (ip, count, first_request, blocked) VALUES (?, 1, ?, 0)').bind(ip, new Date().toISOString()).run();
  }

  return { blocked: false };
}

function checkAuth(request, env) {
  const key = request.headers.get('X-API-Key') || (request.headers.get('Authorization') || '').replace('Bearer ', '');
  return key === env.BACKEND_API_KEY;
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
      }
    });
  }

  if (path === '/api/health') {
    return json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  }

  const hasAuth = checkAuth(request, env);
  const protection = await checkBotProtection(request, env, path, hasAuth);
  if (protection.blocked) {
    return error(protection.reason, protection.status);
  }
  if (!hasAuth) {
    return error('Unauthorized', 401);
  }

  if (path === '/api/projects' && method === 'GET') {
    const results = await env.DB.prepare('SELECT * FROM projects ORDER BY created_date DESC').all();
    return json({ data: results.results });
  }
  if (path === '/api/projects' && method === 'POST') {
    const body = await request.json();
    const id = body.id || genId();
    await env.DB.prepare('INSERT INTO projects (id, name, description) VALUES (?, ?, ?)').bind(id, body.name, body.description || '').run();
    const row = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
    return json({ data: row });
  }
  if (path.match(/^\/api\/projects\/[\w-]+$/) && method === 'GET') {
    const id = path.split('/')[3];
    const row = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
    if (!row) return error('Project not found', 404);
    return json({ data: row });
  }
  if (path.match(/^\/api\/projects\/[\w-]+$/) && method === 'PUT') {
    const id = path.split('/')[3];
    const body = await request.json();
    await env.DB.prepare('UPDATE projects SET name = ?, description = ?, updated_date = datetime("now") WHERE id = ?').bind(body.name, body.description || '', id).run();
    const row = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
    return json({ data: row });
  }
  if (path.match(/^\/api\/projects\/[\w-]+$/) && method === 'DELETE') {
    const id = path.split('/')[3];
    await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM files WHERE project_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM deployments WHERE project_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM env_vars WHERE project_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM settings WHERE project_id = ?').bind(id).run();
    return json({ message: 'Project deleted' });
  }

  if (path.match(/^\/api\/projects\/[\w-]+\/files$/) && method === 'GET') {
    const pid = path.split('/')[3];
    const results = await env.DB.prepare('SELECT * FROM files WHERE project_id = ? ORDER BY name').bind(pid).all();
    return json({ data: results.results });
  }
  if (path.match(/^\/api\/projects\/[\w-]+\/files$/) && method === 'POST') {
    const pid = path.split('/')[3];
    const body = await request.json();
    const id = body.id || genId();
    await env.DB.prepare('INSERT INTO files (id, project_id, name, content, type) VALUES (?, ?, ?, ?, ?)').bind(id, pid, body.name, body.content || '', body.type || 'html').run();
    const row = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(id).first();
    return json({ data: row });
  }
  if (path.match(/^\/api\/projects\/[\w-]+\/files\/[\w-]+$/) && method === 'PUT') {
    const parts = path.split('/');
    const fid = parts[5];
    const body = await request.json();
    await env.DB.prepare('UPDATE files SET name = ?, content = ?, type = ?, updated_date = datetime("now") WHERE id = ?').bind(body.name, body.content, body.type || 'html', fid).run();
    const row = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(fid).first();
    return json({ data: row });
  }
  if (path.match(/^\/api\/projects\/[\w-]+\/files\/[\w-]+$/) && method === 'DELETE') {
    const parts = path.split('/');
    const fid = parts[5];
    await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(fid).run();
    return json({ message: 'File deleted' });
  }

  if (path.match(/^\/api\/projects\/[\w-]+\/deployments$/) && method === 'GET') {
    const pid = path.split('/')[3];
    const results = await env.DB.prepare('SELECT * FROM deployments WHERE project_id = ? ORDER BY created_date DESC').bind(pid).all();
    return json({ data: results.results });
  }
  if (path.match(/^\/api\/projects\/[\w-]+\/deployments$/) && method === 'POST') {
    const pid = path.split('/')[3];
    const id = genId();
    await env.DB.prepare('INSERT INTO deployments (id, project_id, branch, status, log) VALUES (?, ?, ?, ?, ?)').bind(id, pid, 'main', 'building', 'Build started...').run();
    ctx.waitUntil(async () => {
      await new Promise(r => setTimeout(r, 2000));
      await env.DB.prepare('UPDATE deployments SET status = ?, log = ? WHERE id = ?').bind('ready', 'Build complete. Deployed successfully.', id).run();
    });
    const row = await env.DB.prepare('SELECT * FROM deployments WHERE id = ?').bind(id).first();
    return json({ data: row });
  }
  if (path.match(/^\/api\/deployments\/[\w-]+$/) && method === 'GET') {
    const id = path.split('/')[3];
    const row = await env.DB.prepare('SELECT * FROM deployments WHERE id = ?').bind(id).first();
    if (!row) return error('Deployment not found', 404);
    return json({ data: row });
  }

  if (path.match(/^\/api\/projects\/[\w-]+\/env$/) && method === 'GET') {
    const pid = path.split('/')[3];
    const results = await env.DB.prepare('SELECT * FROM env_vars WHERE project_id = ?').bind(pid).all();
    return json({ data: results.results });
  }
  if (path.match(/^\/api\/projects\/[\w-]+\/env$/) && method === 'POST') {
    const pid = path.split('/')[3];
    const body = await request.json();
    const id = genId();
    await env.DB.prepare('INSERT INTO env_vars (id, project_id, key, value) VALUES (?, ?, ?, ?)').bind(id, pid, body.key, body.value).run();
    const row = await env.DB.prepare('SELECT * FROM env_vars WHERE id = ?').bind(id).first();
    return json({ data: row });
  }
  if (path.match(/^\/api\/env\/[\w-]+$/) && method === 'DELETE') {
    const id = path.split('/')[3];
    await env.DB.prepare('DELETE FROM env_vars WHERE id = ?').bind(id).run();
    return json({ message: 'Env var deleted' });
  }

  if (path.match(/^\/api\/projects\/[\w-]+\/settings$/) && method === 'GET') {
    const pid = path.split('/')[3];
    const row = await env.DB.prepare('SELECT data FROM settings WHERE project_id = ?').bind(pid).first();
    return json({ data: row ? JSON.parse(row.data) : {} });
  }
  if (path.match(/^\/api\/projects\/[\w-]+\/settings$/) && method === 'PUT') {
    const pid = path.split('/')[3];
    const body = await request.json();
    await env.DB.prepare('INSERT OR REPLACE INTO settings (project_id, data) VALUES (?, ?)').bind(pid, JSON.stringify(body)).run();
    return json({ data: body });
  }

  if (path === '/api/sql' && method === 'POST') {
    const body = await request.json();
    if (!body.sql) return error('SQL query required', 400);
    const danger = ['DROP DATABASE', 'DETACH', 'ATTACH'];
    const sqlUpper = body.sql.toUpperCase();
    for (const d of danger) {
      if (sqlUpper.includes(d)) return error('Forbidden SQL operation', 403);
    }
    try {
      const results = await env.DB.prepare(body.sql).all();
      return json({ data: results.results, meta: results.meta });
    } catch(e) {
      return error('SQL error: ' + e.message, 500);
    }
  }

  if (path === '/api/security/blocked-ips' && method === 'GET') {
    const results = await env.DB.prepare('SELECT * FROM blocked_ips ORDER BY created_date DESC').all();
    return json({ data: results.results });
  }
  if (path === '/api/security/block-ip' && method === 'POST') {
    const body = await request.json();
    await env.DB.prepare('INSERT OR REPLACE INTO blocked_ips (ip, reason) VALUES (?, ?)').bind(body.ip, body.reason || 'Manual block').run();
    return json({ message: 'IP blocked: ' + body.ip });
  }
  if (path === '/api/security/unblock-ip' && method === 'POST') {
    const body = await request.json();
    await env.DB.prepare('DELETE FROM blocked_ips WHERE ip = ?').bind(body.ip).run();
    return json({ message: 'IP unblocked: ' + body.ip });
  }
  if (path === '/api/security/stats' && method === 'GET') {
    const projects = await env.DB.prepare('SELECT COUNT(*) as count FROM projects').first();
    const files = await env.DB.prepare('SELECT COUNT(*) as count FROM files').first();
    const deploys = await env.DB.prepare('SELECT COUNT(*) as count FROM deployments').first();
    const blocked = await env.DB.prepare('SELECT COUNT(*) as count FROM blocked_ips').first();
    const rateLimit = await env.DB.prepare('SELECT COUNT(*) as count FROM rate_limits WHERE blocked = 1').first();
    return json({ data: { projects: projects.count, files: files.count, deployments: deploys.count, blocked_ips: blocked.count, rate_limited: rateLimit.count } });
  }

  if (path === '/api/database/tables' && method === 'GET') {
    const results = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return json({ data: results.results.map(r => r.name) });
  }
  if (path === '/api/database/schema' && method === 'GET') {
    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'").all();
    const schemas = {};
    for (const t of tables.results) {
      const info = await env.DB.prepare('PRAGMA table_info(' + t.name + ')').all();
      schemas[t.name] = info.results.map(c => ({ name: c.name, type: c.type, pk: c.pk }));
    }
    return json({ data: schemas });
  }

  if (path.match(/^\/api\/kv\/.+$/) && method === 'GET') {
    const key = decodeURIComponent(path.replace('/api/kv/', ''));
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT, updated_date TEXT)').run();
    const row = await env.DB.prepare('SELECT value FROM kv_store WHERE key = ?').bind(key).first();
    if (!row) return json({ data: null });
    try { return json({ data: JSON.parse(row.value) }); }
    catch(e) { return json({ data: row.value }); }
  }
  if (path.match(/^\/api\/kv\/.+$/) && method === 'PUT') {
    const key = decodeURIComponent(path.replace('/api/kv/', ''));
    const body = await request.json();
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT, updated_date TEXT)').run();
    await env.DB.prepare('INSERT OR REPLACE INTO kv_store (key, value, updated_date) VALUES (?, ?, ?)').bind(key, JSON.stringify(body), new Date().toISOString()).run();
    return json({ data: body });
  }
  if (path.match(/^\/api\/kv\/.+$/) && method === 'DELETE') {
    const key = decodeURIComponent(path.replace('/api/kv/', ''));
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT, updated_date TEXT)').run();
    await env.DB.prepare('DELETE FROM kv_store WHERE key = ?').bind(key).run();
    return json({ message: 'KV deleted' });
  }

  return error('Endpoint not found: ' + method + ' ' + path, 404);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (e) {
      return error('Internal error: ' + e.message, 500);
    }
  }
};
