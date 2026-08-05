/**
 * Clincoo Deploy Worker v2
 * Uses Cloudflare R2 for file storage — no CF Pages project limits.
 * Worker serves files directly based on hostname/path.
 * Custom subdomains auto-configured via Cloudflare DNS CNAME + Worker route.
 */

import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-GitHub-Token',
    }
  });
}

function guessContentType(path) {
  const ext = path.split('.').pop().toLowerCase();
  const types = {
    'html': 'text/html', 'css': 'text/css', 'js': 'application/javascript',
    'json': 'application/json', 'png': 'image/png', 'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg', 'gif': 'image/gif', 'svg': 'image/svg+xml',
    'ico': 'image/x-icon', 'webp': 'image/webp', 'woff': 'font/woff',
    'woff2': 'font/woff2', 'ttf': 'font/ttf', 'txt': 'text/plain',
    'map': 'application/json', 'xml': 'application/xml', 'pdf': 'application/pdf',
    'zip': 'application/zip', 'mp4': 'video/mp4', 'webm': 'video/webm',
    'mp3': 'audio/mpeg', 'ogg': 'audio/ogg', 'wav': 'audio/wav',
    'avif': 'image/avif', 'mp2': 'audio/mpeg', 'm4a': 'audio/mp4',
    'm4v': 'video/mp4', 'mov': 'video/quicktime', 'bmp': 'image/bmp',
    'csv': 'text/csv', 'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'eot': 'application/vnd.ms-fontobject', 'otf': 'font/otf',
    'rtf': 'application/rtf', 'tif': 'image/tiff', 'tiff': 'image/tiff',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return types[ext] || 'application/octet-stream';
}

function sanitizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ============================================================
// R2 FILE SERVING
// ============================================================

async function serveR2File(request, env, path, host) {
  let projectSlug = '';
  let filePath = path;

  // Subdomain access: project.clincoo.com/path
  if (host && host.endsWith('.clincoo.com') && host !== 'www.clincoo.com') {
    projectSlug = host.split('.')[0];
  }
  // Path-based access: clincoo-deploy.clincoo.workers.dev/deployed/project/path
  else if (path.startsWith('/deployed/')) {
    const parts = path.slice('/deployed/'.length).split('/');
    projectSlug = parts[0];
    filePath = '/' + parts.slice(1).join('/');
  }

  if (!projectSlug) return null;

  // Normalize file path
  filePath = filePath.replace(/^\//, '');
  if (filePath === '') filePath = 'index.html';

  const key = projectSlug + '/' + filePath;

  try {
    const object = await env.PROJECT_FILES.get(key);
    if (object) {
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'public, max-age=300');
      return new Response(object.body, { status: 200, headers });
    }

    // SPA fallback: try index.html for non-file paths
    if (!filePath.includes('.') || filePath.endsWith('/')) {
      const indexKey = projectSlug + '/index.html';
      const indexObj = await env.PROJECT_FILES.get(indexKey);
      if (indexObj) {
        const headers = new Headers();
        indexObj.writeHttpMetadata(headers);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Cache-Control', 'public, max-age=300');
        return new Response(indexObj.body, { status: 200, headers });
      }
    }

    // 404 with redirect to deployed page
    const notFoundHtml = '<!DOCTYPE html>\n<html lang="id">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>404 - Clincoo</title>\n<style>\n*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f1117;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem}\nh1{font-size:5rem;font-weight:700;margin-bottom:0.5rem;letter-spacing:-0.05em}\nh2{font-size:1.25rem;font-weight:500;color:#9ca3af;margin-bottom:1.5rem}\np{color:#6b7280;max-width:400px;line-height:1.6}\n.btn{display:inline-block;margin-top:2rem;padding:0.75rem 1.5rem;background:#fff;color:#0f1117;border-radius:0.5rem;text-decoration:none;font-weight:600;font-size:0.875rem}\n</style>\n</head>\n<body>\n<div>\n<h1>404</h1>\n<h2>Halaman tidak ditemukan</h2>\n<p>Proyek ini sudah dipublikasikan, tetapi halaman yang Anda cari tidak ada.</p>\n<a href="https://clincoo.com" class="btn">Buka Clincoo</a>\n</div>\n</body>\n</html>';
    return new Response(notFoundHtml, {
      status: 404,
      headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' }
    });
  } catch(e) {
    return new Response('Internal Error', { status: 500 });
  }
}

// ============================================================
// R2 FILE MANAGEMENT
// ============================================================

async function deployToR2(env, projectName, files) {
  const projectPrefix = projectName + '/';
  let deployed = 0;

  for (const file of files) {
    const cleanPath = file.path.replace(/^\//, '');
    const key = projectPrefix + cleanPath;
    const isBinary = file.content && file.content.startsWith('data:');
    let body;

    if (isBinary) {
      // Base64 data URL — decode to binary
      const base64Data = file.content.split(',')[1] || '';
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      body = bytes;
    } else {
      body = file.content || '';
    }

    await env.PROJECT_FILES.put(key, body, {
      httpMetadata: { contentType: guessContentType(file.path) }
    });
    deployed++;
  }

  return { deployed };
}

async function deleteR2Project(env, projectName) {
  const projectPrefix = projectName + '/';
  const list = await env.PROJECT_FILES.list({ prefix: projectPrefix, limit: 1000 });
  let deleted = 0;
  for (const item of list.objects) {
    await env.PROJECT_FILES.delete(item.key);
    deleted++;
  }
  return { deleted };
}

// ============================================================
// DNS MANAGEMENT (Cloudflare API)
// ============================================================

async function createDnsCname(env, authHeaders, domain) {
  const zoneId = env.CF_ZONE_ID;
  if (!zoneId) return { ok: false, error: 'CF_ZONE_ID not set' };

  try {
    // Check if DNS record already exists
    const listRes = await fetch('https://api.cloudflare.com/client/v4/zones/' + zoneId + '/dns_records?name=' + encodeURIComponent(domain), {
      headers: authHeaders
    });
    const listData = await listRes.json();
    if (listData.success && listData.result && listData.result.length > 0) {
      return { ok: true, message: 'DNS record already exists' };
    }

    // Create CNAME record pointing to the worker
    const createRes = await fetch('https://api.cloudflare.com/client/v4/zones/' + zoneId + '/dns_records', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        type: 'CNAME',
        name: domain,
        content: 'clincoo-deploy.clincoo.workers.dev',
        proxied: true,
        comment: 'Auto-created by Clincoo Deploy'
      })
    });
    const createData = await createRes.json();
    if (createData.success) {
      return { ok: true, message: 'CNAME created: ' + domain + ' → clincoo-deploy.clincoo.workers.dev' };
    }
    return { ok: false, error: 'DNS create failed: ' + JSON.stringify(createData.errors) };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function deleteDnsCname(env, authHeaders, domain) {
  const zoneId = env.CF_ZONE_ID;
  if (!zoneId) return { ok: false, error: 'CF_ZONE_ID not set' };

  try {
    const listRes = await fetch('https://api.cloudflare.com/client/v4/zones/' + zoneId + '/dns_records?name=' + encodeURIComponent(domain), {
      headers: authHeaders
    });
    const listData = await listRes.json();
    if (listData.success && listData.result) {
      for (const record of listData.result) {
        await fetch('https://api.cloudflare.com/client/v4/zones/' + zoneId + '/dns_records/' + record.id, {
          method: 'DELETE',
          headers: authHeaders
        });
      }
    }
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================
// MAIN REQUEST HANDLER
// ============================================================

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-GitHub-Token',
      }
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;
  const host = request.headers.get('host') || '';

  // === STATIC FILE SERVING (R2) ===
  // Non-API GET requests serve files from R2
  const isApiPath = path === '/' ||
    path.startsWith('/github/') ||
    path.startsWith('/domain') ||
    path.startsWith('/ssl') ||
    path.startsWith('/deploy') ||
    path.startsWith('/health');

  if (request.method === 'GET' && !isApiPath) {
    const r2Response = await serveR2File(request, env, path, host);
    if (r2Response) return r2Response;
  }

  // Health check
  if (path === '/health') {
    return jsonRes({ status: 'ok', time: new Date().toISOString() });
  }

  // === GITHUB OAUTH ENDPOINTS ===
  if (path === '/github/auth') {
    const clientId = env.GH_CLIENT_ID;
    if (!clientId) return jsonRes({ success: false, error: 'GH_CLIENT_ID not set' }, 500);
    const redirectUri = 'https://clincoo-deploy.clincoo.workers.dev/github/callback';
    const redirectBack = url.searchParams.get('redirect') || '';
    const state = redirectBack;
    const authUrl = 'https://github.com/login/oauth/authorize?client_id=' + clientId +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&scope=repo&state=' + encodeURIComponent(state);
    return Response.redirect(authUrl, 302);
  }

  if (path === '/github/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    if (!code) return jsonRes({ success: false, error: 'No code received' }, 400);
    const clientId = env.GH_CLIENT_ID;
    const clientSecret = env.GH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return jsonRes({ success: false, error: 'GitHub OAuth not configured' }, 500);
    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: 'https://clincoo-deploy.clincoo.workers.dev/github/callback'
        })
      });
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) return jsonRes({ success: false, error: 'Failed to get token: ' + (tokenData.error || 'unknown') }, 400);
      const redirectBack = state || 'https://clincoo.com';
      const sep = redirectBack.includes('?') ? '&' : '?';
      return Response.redirect(redirectBack + sep + 'github_token=' + accessToken, 302);
    } catch(e) {
      return jsonRes({ success: false, error: 'Token exchange failed: ' + e.message }, 500);
    }
  }

  // === GITHUB API PROXY ===
  if (path === '/github/repos') {
    const token = request.headers.get('X-GitHub-Token') || url.searchParams.get('token') || '';
    if (!token) return jsonRes({ success: false, error: 'Token required' }, 400);
    try {
      const ghRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
        headers: {
          'Authorization': 'token ' + token,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Clincoo-App'
        }
      });
      const data = await ghRes.json();
      if (!ghRes.ok) {
        return jsonRes({ success: false, error: (data && data.message) || ('GitHub error ' + ghRes.status), status: ghRes.status }, ghRes.status === 401 ? 401 : 500);
      }
      return jsonRes({ success: true, data: data });
    } catch(e) {
      return jsonRes({ success: false, error: 'Proxy error: ' + e.message }, 500);
    }
  }

  if (path === '/github/tree') {
    const token = request.headers.get('X-GitHub-Token') || url.searchParams.get('token') || '';
    const owner = url.searchParams.get('owner') || '';
    const repo = url.searchParams.get('repo') || '';
    let branch = url.searchParams.get('branch') || 'main';
    if (!token || !owner || !repo) return jsonRes({ success: false, error: 'token, owner, repo required' }, 400);
    try {
      let ghRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1', {
        headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Clincoo-App' }
      });
      if (!ghRes.ok && branch !== 'master') {
        ghRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/trees/master?recursive=1', {
          headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Clincoo-App' }
        });
        branch = 'master';
      }
      const data = await ghRes.json();
      if (!ghRes.ok) {
        return jsonRes({ success: false, error: (data && data.message) || 'Repository tidak ditemukan', status: ghRes.status }, 500);
      }
      return jsonRes({ success: true, data: data, branch: branch });
    } catch(e) {
      return jsonRes({ success: false, error: 'Proxy error: ' + e.message }, 500);
    }
  }

  if (path === '/github/file') {
    const token = request.headers.get('X-GitHub-Token') || url.searchParams.get('token') || '';
    const owner = url.searchParams.get('owner') || '';
    const repo = url.searchParams.get('repo') || '';
    const branch = url.searchParams.get('branch') || 'main';
    const filePath = url.searchParams.get('path') || '';
    if (!owner || !repo || !filePath) return jsonRes({ success: false, error: 'owner, repo, path required' }, 400);
    try {
      const rawUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/' + filePath;
      const headers = {};
      if (token) headers['Authorization'] = 'token ' + token;
      const fileRes = await fetch(rawUrl, { headers });
      if (!fileRes.ok) return jsonRes({ success: false, error: 'File not found: ' + fileRes.status }, 404);
      const buf = await fileRes.arrayBuffer();
      const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch(e) {
      return jsonRes({ success: false, error: 'Proxy error: ' + e.message }, 500);
    }
  }

  if (path === '/github/push') {
    const token = request.headers.get('X-GitHub-Token') || '';
    if (!token) return jsonRes({ success: false, error: 'Token required' }, 400);
    let body;
    try { body = await request.json(); } catch(e) {
      return jsonRes({ success: false, error: 'Invalid JSON' }, 400);
    }
    const owner = body.owner || '';
    const repo = body.repo || '';
    const branch = body.branch || 'main';
    const files = Array.isArray(body.files) ? body.files : [];
    if (!owner || !repo || files.length === 0) {
      return jsonRes({ success: false, error: 'owner, repo, files required' }, 400);
    }
    try {
      const refRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/refs/heads/' + branch, {
        headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Clincoo-App' }
      });
      let latestSha = '';
      if (refRes.ok) {
        const refData = await refRes.json();
        latestSha = refData.object.sha;
      }
      if (!latestSha) {
        return jsonRes({ success: false, error: 'Branch not found: ' + branch }, 400);
      }

      const commitRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/commits/' + latestSha, {
        headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Clincoo-App' }
      });
      const commitData = await commitRes.json();
      const baseTreeSha = commitData.tree ? commitData.tree.sha : '';

      const treeItems = [];
      for (const file of files) {
        const cleanPath = file.path.replace(/^\//, '');
        const isBinary = file.content && file.content.startsWith('data:');
        let blobSha = '';
        if (isBinary) {
          const blobRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/blobs', {
            method: 'POST',
            headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'Clincoo-App' },
            body: JSON.stringify({ content: file.content.split(',')[1] || file.content, encoding: 'base64' })
          });
          const blobData = await blobRes.json();
          blobSha = blobData.sha;
        } else {
          const blobRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/blobs', {
            method: 'POST',
            headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'Clincoo-App' },
            body: JSON.stringify({ content: file.content || '', encoding: 'utf-8' })
          });
          const blobData = await blobRes.json();
          blobSha = blobData.sha;
        }
        treeItems.push({ path: cleanPath, mode: '100644', type: 'blob', sha: blobSha });
      }

      const treeRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/trees', {
        method: 'POST',
        headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'Clincoo-App' },
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems })
      });
      const treeData = await treeRes.json();
      const newTreeSha = treeData.sha;

      const newCommitRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/commits', {
        method: 'POST',
        headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'Clincoo-App' },
        body: JSON.stringify({ message: body.message || 'Update from Clincoo', tree: newTreeSha, parents: [latestSha] })
      });
      const newCommitData = await newCommitRes.json();
      const newCommitSha = newCommitData.sha;

      await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/git/refs/heads/' + branch, {
        method: 'PATCH',
        headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'Clincoo-App' },
        body: JSON.stringify({ sha: newCommitSha })
      });

      return jsonRes({ success: true, message: 'Pushed ' + files.length + ' files', commit: newCommitSha });
    } catch(e) {
      return jsonRes({ success: false, error: 'Push error: ' + e.message }, 500);
    }
  }
  // === END GITHUB API PROXY ===

  const cfAccountId = env.CF_ACCOUNT_ID;
  const cfApiToken = env.CF_API_TOKEN;
  if (!cfAccountId || !cfApiToken) {
    return jsonRes({ success: false, error: 'Server credentials not configured' }, 500);
  }

  const authHeaders = { 'Authorization': 'Bearer ' + cfApiToken, 'Content-Type': 'application/json' };

  // === DOMAIN ENDPOINT (auto DNS CNAME) ===
  if (path === '/domain') {
    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch(e) {
        return jsonRes({ success: false, error: 'Invalid JSON' }, 400);
      }
      const projectName = sanitizeName(body.projectName || '');
      const domain = (body.domain || '').trim();
      if (!projectName || !domain) {
        return jsonRes({ success: false, error: 'projectName and domain required' }, 400);
      }

      // Create DNS CNAME record pointing to the worker
      const dnsResult = await createDnsCname(env, authHeaders, domain);

      return jsonRes({
        success: dnsResult.ok,
        domain: domain,
        message: dnsResult.ok
          ? 'Subdomain ' + domain + ' berhasil dikonfigurasi. CNAME → clincoo-deploy.clincoo.workers.dev (proxied). Tunggu 1-2 menit untuk propagasi DNS.'
          : 'DNS setup failed: ' + (dnsResult.error || 'unknown'),
        cnameTarget: 'clincoo-deploy.clincoo.workers.dev'
      });
    }

    if (request.method === 'DELETE') {
      const projectName = sanitizeName(url.searchParams.get('projectName') || '');
      const domain = (url.searchParams.get('domain') || '').trim();
      if (!projectName) {
        return jsonRes({ success: false, error: 'projectName required' }, 400);
      }

      // Delete DNS CNAME if domain provided
      if (domain) {
        await deleteDnsCname(env, authHeaders, domain);
        return jsonRes({ success: true, message: 'Domain CNAME removed' });
      }

      // No domain = delete entire project from R2
      const r2Result = await deleteR2Project(env, projectName);
      return jsonRes({
        success: true,
        message: 'Project deleted from R2 (' + r2Result.deleted + ' files removed)',
        deleted: r2Result.deleted
      });
    }
  }

  // === SSL ENDPOINT (not needed with Cloudflare proxied — auto SSL) ===
  if (path === '/ssl' && request.method === 'POST') {
    return jsonRes({
      success: true,
      message: 'SSL is automatically handled by Cloudflare proxy. No manual SSL needed.'
    });
  }

  // === DEPLOY ENDPOINT (POST /) — R2 storage ===
  if (request.method !== 'POST') {
    return jsonRes({ success: false, error: 'Method not allowed' }, 405);
  }

  let body;
  try { body = await request.json(); } catch(e) {
    return jsonRes({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const projectName = sanitizeName(body.projectName || 'clincoo-app');
  const files = Array.isArray(body.files) ? body.files : [];
  const branch = body.branch || 'main';

  if (files.length === 0) {
    return jsonRes({ success: false, error: 'No files to deploy' }, 400);
  }

  // Validate all files have content
  const emptyFiles = files.filter(f => !f.content || f.content.length === 0);
  if (emptyFiles.length > 0) {
    return jsonRes({ success: false, error: 'Empty file content: ' + emptyFiles.map(f => f.path).join(', ') }, 400);
  }

  // Deploy files to R2
  try {
    const result = await deployToR2(env, projectName, files);

    // Generate URLs
    const workerUrl = 'https://clincoo-deploy.clincoo.workers.dev/deployed/' + projectName + '/';
    // Custom subdomain URL (if DNS is configured)
    const customDomainUrl = 'https://' + projectName + '.clincoo.com';

    return jsonRes({
      success: true,
      url: workerUrl,
      productionUrl: workerUrl,
      customDomainUrl: customDomainUrl,
      projectName: projectName,
      filesDeployed: result.deployed,
      message: 'Deployed ' + result.deployed + ' files to R2. Accessible at ' + workerUrl
    });
  } catch(e) {
    return jsonRes({ success: false, error: 'R2 deploy error: ' + e.message }, 500);
  }
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};
