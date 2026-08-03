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
      if (ua.includes(bad) && !path.includes('/health') && !path.includes('/analytics/track')) {
        return { blocked: true, reason: 'Suspicious user agent', status: 403 };
      }
    }
    if (!ua && !path.includes('/health') && !path.includes('/analytics/track')) {
      return { blocked: true, reason: 'Empty user agent', status: 403 };
    }
  }

  // Skip rate limiting for analytics tracking (high volume by nature)
  if (path.includes('/analytics/track')) {
    return { blocked: false };
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

async function ensureAnalyticsTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
    domain TEXT,
    path TEXT,
    event_type TEXT DEFAULT 'pageview',
    visitor_id TEXT,
    session_id TEXT,
    user_agent TEXT,
    referrer TEXT,
    screen_w INTEGER,
    screen_h INTEGER,
    language TEXT,
    country TEXT,
    duration INTEGER DEFAULT 0,
    created_date TEXT
  )`).run();
}

async function handleAnalyticsTrack(request, env, ctx) {
  try {
    const body = await request.json();
    if (!body) return error('Invalid body', 400);

    await ensureAnalyticsTable(env);

    const ip = getClientIP(request);
    const cf = request.cf || {};
    const id = genId();
    const now = new Date().toISOString();

    await env.DB.prepare(
      'INSERT INTO analytics_events (id, domain, path, event_type, visitor_id, session_id, user_agent, referrer, screen_w, screen_h, language, country, duration, created_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      id,
      body.domain || 'unknown',
      body.path || '/',
      body.event_type || 'pageview',
      body.visitor_id || '',
      body.session_id || '',
      (request.headers.get('User-Agent') || '').substring(0, 500),
      body.referrer || '',
      body.screen_w || 0,
      body.screen_h || 0,
      body.language || '',
      cf.country || body.country || '',
      body.duration || 0,
      now
    ).run();

    return json({ ok: true });
  } catch(e) {
    return error('Track error: ' + e.message, 500);
  }
}

async function handleAnalyticsStats(request, env) {
  await ensureAnalyticsTable(env);

  // 1. Monthly visitors (last 6 months) — Bar Chart
  const monthly = await env.DB.prepare(`
    SELECT 
      substr(created_date, 1, 7) as month,
      COUNT(*) as views,
      COUNT(DISTINCT visitor_id) as unique_visitors
    FROM analytics_events
    WHERE created_date >= datetime('now', '-6 months')
    GROUP BY month
    ORDER BY month
  `).all();

  // 2. Daily traffic (last 7 days) — Line Chart
  const daily = await env.DB.prepare(`
    SELECT 
      DATE(created_date) as day,
      COUNT(*) as views,
      COUNT(DISTINCT visitor_id) as visitors
    FROM analytics_events
    WHERE created_date >= datetime('now', '-7 days')
    GROUP BY day
    ORDER BY day
  `).all();

  // 3. Traffic sources (referrer domains) — Pie Chart
  const sources = await env.DB.prepare(`
    SELECT 
      CASE 
        WHEN referrer = '' OR referrer IS NULL THEN 'Direct'
        WHEN referrer LIKE '%google%' THEN 'Google'
        WHEN referrer LIKE '%facebook%' OR referrer LIKE '%fb%' THEN 'Facebook'
        WHEN referrer LIKE '%instagram%' THEN 'Instagram'
        WHEN referrer LIKE '%twitter%' OR referrer LIKE '%x.com%' THEN 'Twitter/X'
        WHEN referrer LIKE '%linkedin%' THEN 'LinkedIn'
        WHEN referrer LIKE '%youtube%' THEN 'YouTube'
        WHEN referrer LIKE '%t.co%' THEN 'Twitter/X'
        ELSE substr(referrer, 1, 30)
      END as source,
      COUNT(*) as count
    FROM analytics_events
    WHERE created_date >= datetime('now', '-30 days')
    GROUP BY source
    ORDER BY count DESC
    LIMIT 8
  `).all();

  // 4. Device types — Doughnut Chart
  const devices = await env.DB.prepare(`
    SELECT 
      CASE 
        WHEN screen_w > 0 AND screen_w <= 768 THEN 'Mobile'
        WHEN screen_w > 768 AND screen_w <= 1024 THEN 'Tablet'
        WHEN screen_w > 1024 THEN 'Desktop'
        ELSE 'Unknown'
      END as device,
      COUNT(*) as count
    FROM analytics_events
    WHERE created_date >= datetime('now', '-30 days')
    GROUP BY device
    ORDER BY count DESC
  `).all();

  // 5. Top pages — Horizontal Bar Chart
  const topPages = await env.DB.prepare(`
    SELECT path, COUNT(*) as views
    FROM analytics_events
    WHERE created_date >= datetime('now', '-30 days')
    GROUP BY path
    ORDER BY views DESC
    LIMIT 10
  `).all();

  // 6. Countries — Polar Area Chart
  const countries = await env.DB.prepare(`
    SELECT 
      COALESCE(NULLIF(country, ''), 'Unknown') as country,
      COUNT(*) as count
    FROM analytics_events
    WHERE created_date >= datetime('now', '-30 days')
    GROUP BY country
    ORDER BY count DESC
    LIMIT 8
  `).all();

  // 7. Hourly traffic (last 24h) — Scatter Chart
  const hourly = await env.DB.prepare(`
    SELECT 
      CAST(strftime('%H', created_date) AS INTEGER) as hour,
      COUNT(*) as views,
      COUNT(DISTINCT visitor_id) as visitors
    FROM analytics_events
    WHERE created_date >= datetime('now', '-1 day')
    GROUP BY hour
    ORDER BY hour
  `).all();

  // 8. Hourly traffic for bubble (visitors x views x sessions)
  const bubbleData = await env.DB.prepare(`
    SELECT 
      CAST(strftime('%H', created_date) AS INTEGER) as hour,
      COUNT(DISTINCT visitor_id) as visitors,
      COUNT(*) as views,
      COUNT(DISTINCT session_id) as sessions
    FROM analytics_events
    WHERE created_date >= datetime('now', '-7 days')
    GROUP BY hour
    ORDER BY hour
  `).all();

  // 9. Daily views vs unique visitors (last 14 days) — Mixed Chart
  const dailyMixed = await env.DB.prepare(`
    SELECT 
      DATE(created_date) as day,
      COUNT(*) as views,
      COUNT(DISTINCT visitor_id) as visitors
    FROM analytics_events
    WHERE created_date >= datetime('now', '-14 days')
    GROUP BY day
    ORDER BY day
  `).all();

  // 10. Languages — Radar Chart
  const languages = await env.DB.prepare(`
    SELECT 
      COALESCE(NULLIF(language, ''), 'Unknown') as lang,
      COUNT(*) as count
    FROM analytics_events
    WHERE created_date >= datetime('now', '-30 days')
    GROUP BY lang
    ORDER BY count DESC
    LIMIT 6
  `).all();

  // Summary counts
  const totalToday = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM analytics_events 
    WHERE DATE(created_date) = DATE('now')
  `).first();

  const totalVisitors = await env.DB.prepare(`
    SELECT COUNT(DISTINCT visitor_id) as count FROM analytics_events
    WHERE created_date >= datetime('now', '-30 days')
  `).first();

  const totalEvents = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM analytics_events
  `).first();

  const avgDuration = await env.DB.prepare(`
    SELECT AVG(duration) as avg FROM analytics_events
    WHERE duration > 0 AND created_date >= datetime('now', '-30 days')
  `).first();

  return json({
    data: {
      summary: {
        total_today: totalToday ? totalToday.count : 0,
        total_visitors_30d: totalVisitors ? totalVisitors.count : 0,
        total_events: totalEvents ? totalEvents.count : 0,
        avg_duration: avgDuration ? Math.round(avgDuration.avg || 0) : 0
      },
      monthly: monthly.results,
      daily: daily.results,
      sources: sources.results,
      devices: devices.results,
      topPages: topPages.results,
      countries: countries.results,
      hourly: hourly.results,
      bubbleData: bubbleData.results,
      dailyMixed: dailyMixed.results,
      languages: languages.results
    }
  });
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

  // === PUBLIC: Analytics tracking endpoint (no auth needed — visitors send data) ===
  if (path === '/api/analytics/track' && method === 'POST') {
    return handleAnalyticsTrack(request, env, ctx);
  }

  const hasAuth = checkAuth(request, env);
  const protection = await checkBotProtection(request, env, path, hasAuth);
  if (protection.blocked) {
    return error(protection.reason, protection.status);
  }
  if (!hasAuth) {
    return error('Unauthorized', 401);
  }

  // === AUTHENTICATED: Analytics stats endpoint (dashboard reads data) ===
  if (path === '/api/analytics/stats' && method === 'GET') {
    return handleAnalyticsStats(request, env);
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
    const results = await env.DB.prepare('SELECT * FROM deployments WHERE project_id = ? ORDER BY created_date DESC').all();
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
