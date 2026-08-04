/**
 * Clincoo Deploy Worker
 * Credentials baked in as env secrets.
 * Uses blake3 hashing (same as wrangler) for Cloudflare Pages direct upload.
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
      'Access-Control-Allow-Headers': 'Content-Type',
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
    'mp3': 'audio/mpeg', 'ogg': 'audio/ogg', 'wav': 'audio/wav'
  };
  return types[ext] || 'application/octet-stream';
}

function getExtension(path) {
  const parts = path.split('.');
  if (parts.length < 2) return '';
  return '.' + parts[parts.length - 1].toLowerCase();
}

function base64Encode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function hashFile(content, filepath) {
  const base64Content = base64Encode(content);
  const extension = getExtension(filepath);
  const input = new TextEncoder().encode(base64Content + extension);
  return bytesToHex(blake3(input)).slice(0, 32);
}

function buildMultipartFormData(fields) {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  let body = '';
  for (const [key, value] of Object.entries(fields)) {
    body += '--' + boundary + '\r\n';
    body += 'Content-Disposition: form-data; name="' + key + '"\r\n\r\n';
    body += value + '\r\n';
  }
  body += '--' + boundary + '--\r\n';
  return { body, contentType: 'multipart/form-data; boundary=' + boundary };
}

function sanitizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function deletePagesProject(cfBase, authHeaders, projectName) {
  try {
    await fetch(cfBase + '/' + projectName, { method: 'DELETE', headers: authHeaders });
    return { ok: true, target: 'pages' };
  } catch(e) {
    return { ok: false, target: 'pages', error: e.message };
  }
}

async function deleteWorkerScript(cfAccountId, authHeaders, workerName) {
  try {
    const workerUrl = 'https://api.cloudflare.com/client/v4/accounts/' + cfAccountId + '/workers/scripts/' + workerName;
    const res = await fetch(workerUrl, { method: 'DELETE', headers: authHeaders });
    const data = await res.json();
    if (!data.success && !res.ok) {
      return { ok: false, target: 'worker', error: JSON.stringify(data.errors || data) };
    }
    return { ok: true, target: 'worker' };
  } catch(e) {
    return { ok: false, target: 'worker', error: e.message };
  }
}

async function uploadWithRetry(url, options, maxRetries = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      const data = await res.json();
      if (data.success || res.ok) return { ok: true, data };
      lastError = JSON.stringify(data.errors || data);
    } catch(e) {
      lastError = e.message;
    }
    // Wait before retry (exponential backoff)
    if (attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return { ok: false, error: lastError };
}

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  const cfAccountId = env.CF_ACCOUNT_ID;
  const cfApiToken = env.CF_API_TOKEN;
  if (!cfAccountId || !cfApiToken) {
    return jsonRes({ success: false, error: 'Server credentials not configured' }, 500);
  }

  const cfBase = 'https://api.cloudflare.com/client/v4/accounts/' + cfAccountId + '/pages/projects';
  const authHeaders = { 'Authorization': 'Bearer ' + cfApiToken, 'Content-Type': 'application/json' };

  // === DOMAIN ENDPOINT ===
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
      try {
        const res = await fetch(cfBase + '/' + projectName + '/domains', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ name: domain })
        });
        const data = await res.json();
        if (!data.success) {
          if (JSON.stringify(data.errors).includes('already')) {
            return jsonRes({ success: true, message: 'Domain already exists', domain: domain });
          }
          return jsonRes({ success: false, error: 'Domain setup failed: ' + JSON.stringify(data.errors) }, 500);
        }
        return jsonRes({ success: true, domain: domain, message: 'Custom domain added. Set up DNS CNAME record pointing to ' + projectName + '.pages.dev' });
      } catch(e) {
        return jsonRes({ success: false, error: 'Domain error: ' + e.message }, 500);
      }
    }

    if (request.method === 'DELETE') {
      const projectName = sanitizeName(url.searchParams.get('projectName') || '');
      const domain = (url.searchParams.get('domain') || '').trim();
      if (!projectName) {
        return jsonRes({ success: false, error: 'projectName required' }, 400);
      }
      if (domain) {
        try {
          await fetch(cfBase + '/' + projectName + '/domains/' + domain, {
            method: 'DELETE',
            headers: authHeaders
          });
          return jsonRes({ success: true, message: 'Domain removed' });
        } catch(e) {
          return jsonRes({ success: false, error: 'Domain error: ' + e.message }, 500);
        }
      }
      // No domain = delete entire project (Pages + Worker)
      const results = [];
      const pagesResult = await deletePagesProject(cfBase, authHeaders, projectName);
      results.push(pagesResult);
      const workerResult = await deleteWorkerScript(cfAccountId, authHeaders, projectName);
      results.push(workerResult);
      const backendWorkerResult = await deleteWorkerScript(cfAccountId, authHeaders, projectName + '-backend');
      if (!backendWorkerResult.ok) results.push(backendWorkerResult);
      const allOk = results.every(r => r.ok);
      return jsonRes({
        success: allOk,
        message: allOk ? 'Project fully deleted (Pages + Workers)' : 'Partial deletion',
        details: results
      });
    }
  }

  // === DELETE PAGES PROJECT (DELETE /) ===
  if (request.method === 'DELETE' && (path === '/' || path === '')) {
    const projectName = sanitizeName(url.searchParams.get('projectName') || '');
    if (!projectName) {
      return jsonRes({ success: false, error: 'projectName required' }, 400);
    }
    try {
      const delRes = await fetch(cfBase + '/' + projectName, {
        method: 'DELETE',
        headers: authHeaders
      });
      const delData = await delRes.json();
      if (!delData.success && !JSON.stringify(delData.errors || '').includes('not found')) {
        return jsonRes({ success: false, error: 'Pages delete failed: ' + JSON.stringify(delData.errors) }, 500);
      }
      return jsonRes({ success: true, deleted: 'pages', project: projectName });
    } catch(e) {
      return jsonRes({ success: false, error: 'Pages delete error: ' + e.message }, 500);
    }
  }

  // === DELETE WORKER SCRIPT (DELETE /worker) ===
  if (request.method === 'DELETE' && path === '/worker') {
    const projectName = sanitizeName(url.searchParams.get('projectName') || '');
    if (!projectName) {
      return jsonRes({ success: false, error: 'projectName required' }, 400);
    }
    try {
      const workerBase = 'https://api.cloudflare.com/client/v4/accounts/' + cfAccountId + '/workers/scripts';
      const delRes = await fetch(workerBase + '/' + projectName, {
        method: 'DELETE',
        headers: authHeaders
      });
      const delData = await delRes.json();
      if (!delData.success && delRes.status !== 404 && !JSON.stringify(delData.errors || '').includes('not found')) {
        return jsonRes({ success: false, error: 'Worker delete failed: ' + JSON.stringify(delData.errors) }, 500);
      }
      return jsonRes({ success: true, deleted: 'worker', name: projectName });
    } catch(e) {
      return jsonRes({ success: false, error: 'Worker delete error: ' + e.message }, 500);
    }
  }

  // === DEPLOY ENDPOINT (POST /) ===
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

  // 1. Create project if not exists
  let projectExists = false;
  try {
    const checkRes = await fetch(cfBase + '/' + projectName, { method: 'GET', headers: authHeaders });
    if (checkRes.ok) projectExists = true;
  } catch(e) {}

  if (!projectExists) {
    try {
      const createRes = await fetch(cfBase, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: projectName, production_branch: branch })
      });
      const createData = await createRes.json();
      if (!createData.success) {
        return jsonRes({ success: false, error: 'Create project failed: ' + JSON.stringify(createData.errors) }, 500);
      }
    } catch(e) {
      return jsonRes({ success: false, error: 'Create project error: ' + e.message }, 500);
    }
  }

  // 2. Get upload JWT
  let uploadJwt = '';
  try {
    const tokenRes = await fetch(cfBase + '/' + projectName + '/upload-token', { method: 'GET', headers: authHeaders });
    const tokenData = await tokenRes.json();
    if (tokenData.success && tokenData.result) uploadJwt = tokenData.result.jwt || '';
  } catch(e) {}
  if (!uploadJwt) {
    return jsonRes({ success: false, error: 'Failed to get upload token' }, 500);
  }

  // 3. Compute blake3 hashes + manifest
  const manifest = {};
  const fileData = [];
  for (const file of files) {
    const hash = hashFile(file.content, file.path);
    const cleanPath = file.path.replace(/^\//, '');
    manifest['/' + cleanPath] = hash;
    fileData.push({
      path: cleanPath,
      hash: hash,
      content: file.content,
      contentType: guessContentType(file.path)
    });
  }

  // 4. Check missing hashes
  const allHashes = [...new Set(fileData.map(f => f.hash))];
  let missingHashes = [];
  try {
    const checkRes = await fetch('https://api.cloudflare.com/client/v4/pages/assets/check-missing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + uploadJwt
      },
      body: JSON.stringify({ hashes: allHashes })
    });
    const checkData = await checkRes.json();
    if (checkData.success && Array.isArray(checkData.result)) {
      missingHashes = checkData.result;
    }
  } catch(e) {
    // If check-missing fails, upload all files to be safe
    missingHashes = allHashes;
  }

  // 5. Upload missing files in batches — with retry and error checking
  const toUpload = fileData.filter(f => missingHashes.includes(f.hash));
  const batchSize = 5; // Smaller batches for reliability
  const uploadErrors = [];

  for (let i = 0; i < toUpload.length; i += batchSize) {
    const batch = toUpload.slice(i, i + batchSize);
    const uploadBody = batch.map(f => ({
      key: f.hash,
      value: base64Encode(f.content),
      metadata: { contentType: f.contentType },
      base64: true
    }));

    const result = await uploadWithRetry(
      'https://api.cloudflare.com/client/v4/pages/assets/upload',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + uploadJwt
        },
        body: JSON.stringify(uploadBody)
      },
      3 // max retries
    );

    if (!result.ok) {
      uploadErrors.push({ batch: i / batchSize, files: batch.map(f => f.path), error: result.error });
    }
  }

  // If any uploads failed, return error — don't create broken deployment
  if (uploadErrors.length > 0) {
    return jsonRes({
      success: false,
      error: 'File upload failed for ' + uploadErrors.length + ' batch(es). Files: ' +
        uploadErrors.flatMap(e => e.files).join(', ').substring(0, 200),
      details: uploadErrors
    }, 500);
  }

  // 6. Upsert hashes — with error checking
  const upsertResult = await uploadWithRetry(
    'https://api.cloudflare.com/client/v4/pages/assets/upsert-hashes',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + uploadJwt
      },
      body: JSON.stringify({ hashes: allHashes })
    },
    3
  );

  if (!upsertResult.ok) {
    return jsonRes({ success: false, error: 'Failed to register file hashes: ' + upsertResult.error }, 500);
  }

  // 7. Create deployment with manifest (multipart form-data)
  try {
    const formFields = { manifest: JSON.stringify(manifest) };
    if (branch) formFields.branch = branch;
    const { body: mpBody, contentType: mpContentType } = buildMultipartFormData(formFields);

    const deployRes = await fetch(cfBase + '/' + projectName + '/deployments', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + cfApiToken,
        'Content-Type': mpContentType
      },
      body: mpBody
    });

    const deployData = await deployRes.json();

    if (!deployData.success) {
      return jsonRes({ success: false, error: 'Deploy failed: ' + JSON.stringify(deployData.errors) }, 500);
    }

    const result = deployData.result || {};
    const deploymentId = result.id || '';
    const productionUrl = 'https://' + projectName + '.pages.dev';

    return jsonRes({
      success: true,
      url: productionUrl,
      productionUrl: productionUrl,
      deploymentId: deploymentId,
      status: result.latest_stage ? result.latest_stage.name : 'idle',
      filesDeployed: files.length
    });
  } catch(e) {
    return jsonRes({ success: false, error: 'Deploy error: ' + e.message }, 500);
  }
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};
