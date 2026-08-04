/**
 * Clincoo Deploy Worker
 * Handles Cloudflare Pages deployment + deletion, Worker deletion, and custom domain management.
 *
 * Required secrets:
 *   CLOUDFLARE_API_TOKEN — Cloudflare API token with Pages + Workers permissions
 *   CLOUDFLARE_ACCOUNT_ID — Cloudflare account ID
 *
 * Endpoints:
 *   POST   /              — Deploy files to Cloudflare Pages
 *   DELETE /               — Delete Pages project + all deployments
 *   DELETE /worker         — Delete Cloudflare Worker script
 *   POST   /domain         — Add custom domain to Pages project
 *   DELETE /domain         — Remove custom domain from Pages project
 */

const CF_API = 'https://api.cloudflare.com/client/v4';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

function error(msg, status = 400) {
  return json({ success: false, error: msg }, status);
}

function cfHeaders(env) {
  return {
    'Authorization': 'Bearer ' + env.CLOUDFLARE_API_TOKEN,
    'Content-Type': 'application/json'
  };
}

function slug(name) {
  var s = (name || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s || 'clincoo-app';
}

// === DEPLOY: Upload files to Cloudflare Pages ===
async function handleDeploy(request, env) {
  try {
    var body = await request.json();
    var projectName = slug(body.projectName);
    var files = body.files || [];
    var branch = body.branch || 'main';

    var accountId = env.CLOUDFLARE_ACCOUNT_ID;
    var headers = cfHeaders(env);

    // 1. Ensure Pages project exists
    var projectRes = await fetch(CF_API + '/accounts/' + accountId + '/pages/projects/' + projectName, {
      method: 'GET',
      headers
    });
    var projectData = await projectRes.json();

    if (!projectData.success) {
      // Create project if not exists
      var createRes = await fetch(CF_API + '/accounts/' + accountId + '/pages/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: projectName, production_branch: 'main' })
      });
      var createData = await createRes.json();
      if (!createData.success) {
        return error('Failed to create Pages project: ' + (createData.errors ? JSON.stringify(createData.errors) : 'unknown'));
      }
    }

    // 2. Build FormData for deployment
    var formData = new FormData();
    formData.append('branch', branch);

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var blob = new Blob([f.content || ''], { type: 'text/plain' });
      formData.append('file', blob, f.path || f.name || ('file' + i));
    }

    // 3. Deploy to Pages
    var deployRes = await fetch(CF_API + '/accounts/' + accountId + '/pages/projects/' + projectName + '/deployments', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.CLOUDFLARE_API_TOKEN },
      body: formData
    });
    var deployData = await deployRes.json();

    if (deployData.success) {
      var result = deployData.result || {};
      return json({
        success: true,
        url: result.url || '',
        productionUrl: 'https://' + projectName + '.pages.dev'
      });
    } else {
      return error('Deploy failed: ' + (deployData.errors ? JSON.stringify(deployData.errors) : 'unknown'));
    }
  } catch(e) {
    return error('Deploy error: ' + e.message, 500);
  }
}

// === DELETE PAGES: Delete Cloudflare Pages project + all deployments ===
async function handleDeletePages(request, env, url) {
  try {
    var projectName = slug(url.searchParams.get('projectName'));
    var accountId = env.CLOUDFLARE_ACCOUNT_ID;
    var headers = cfHeaders(env);

    // Delete the entire Pages project (this also deletes all deployments)
    var res = await fetch(CF_API + '/accounts/' + accountId + '/pages/projects/' + projectName, {
      method: 'DELETE',
      headers
    });
    var data = await res.json();

    if (data.success) {
      return json({ success: true, deleted: 'pages', project: projectName });
    } else {
      // Project might not exist (already deleted or never deployed)
      var errMsg = data.errors ? JSON.stringify(data.errors) : 'unknown';
      if (errMsg.includes('not found') || errMsg.includes('could not find')) {
        return json({ success: true, deleted: 'pages', project: projectName, note: 'Project not found (already deleted)' });
      }
      return error('Failed to delete Pages project: ' + errMsg);
    }
  } catch(e) {
    return error('Pages delete error: ' + e.message, 500);
  }
}

// === DELETE WORKER: Delete Cloudflare Worker script ===
async function handleDeleteWorker(request, env, url) {
  try {
    var projectName = slug(url.searchParams.get('projectName'));
    var accountId = env.CLOUDFLARE_ACCOUNT_ID;
    var headers = cfHeaders(env);

    // Try to delete Worker script with the project name
    var workerName = projectName;
    var res = await fetch(CF_API + '/accounts/' + accountId + '/workers/scripts/' + workerName, {
      method: 'DELETE',
      headers
    });
    var data = await res.json();

    if (data.success) {
      return json({ success: true, deleted: 'worker', name: workerName });
    } else {
      var errMsg = data.errors ? JSON.stringify(data.errors) : 'unknown';
      // Worker might not exist
      if (errMsg.includes('not found') || errMsg.includes('could not find') || res.status === 404) {
        return json({ success: true, deleted: 'worker', name: workerName, note: 'Worker not found (already deleted or never created)' });
      }
      return error('Failed to delete Worker: ' + errMsg);
    }
  } catch(e) {
    return error('Worker delete error: ' + e.message, 500);
  }
}

// === ADD DOMAIN: Attach custom domain to Pages project ===
async function handleAddDomain(request, env) {
  try {
    var body = await request.json();
    var projectName = slug(body.projectName);
    var domain = body.domain;
    if (!domain) return error('Domain is required');

    var accountId = env.CLOUDFLARE_ACCOUNT_ID;
    var headers = cfHeaders(env);

    var res = await fetch(CF_API + '/accounts/' + accountId + '/pages/projects/' + projectName + '/domains', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: domain })
    });
    var data = await res.json();

    if (data.success) {
      return json({ success: true, domain: domain, project: projectName });
    } else {
      // Domain might already be attached
      var errMsg = data.errors ? JSON.stringify(data.errors) : 'unknown';
      if (errMsg.includes('already') || errMsg.includes('exists')) {
        return json({ success: true, domain: domain, project: projectName, note: 'Domain already attached' });
      }
      return error('Failed to add domain: ' + errMsg);
    }
  } catch(e) {
    return error('Domain add error: ' + e.message, 500);
  }
}

// === REMOVE DOMAIN: Detach custom domain from Pages project ===
async function handleRemoveDomain(request, env, url) {
  try {
    var projectName = slug(url.searchParams.get('projectName'));
    var domain = url.searchParams.get('domain');
    if (!domain) return error('Domain is required');

    var accountId = env.CLOUDFLARE_ACCOUNT_ID;
    var headers = cfHeaders(env);

    var res = await fetch(CF_API + '/accounts/' + accountId + '/pages/projects/' + projectName + '/domains/' + domain, {
      method: 'DELETE',
      headers
    });
    var data = await res.json();

    if (data.success) {
      return json({ success: true, removed: domain, project: projectName });
    } else {
      var errMsg = data.errors ? JSON.stringify(data.errors) : 'unknown';
      if (errMsg.includes('not found') || errMsg.includes('could not find')) {
        return json({ success: true, removed: domain, project: projectName, note: 'Domain not found' });
      }
      return error('Failed to remove domain: ' + errMsg);
    }
  } catch(e) {
    return error('Domain remove error: ' + e.message, 500);
  }
}

// === MAIN HANDLER ===
export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return json({ success: true });
    }

    var url = new URL(request.url);
    var path = url.pathname;

    try {
      // Root endpoints
      if (path === '/' || path === '') {
        if (request.method === 'POST') return handleDeploy(request, env);
        if (request.method === 'DELETE') return handleDeletePages(request, env, url);
        return error('Method not allowed', 405);
      }

      // Worker endpoints
      if (path === '/worker') {
        if (request.method === 'DELETE') return handleDeleteWorker(request, env, url);
        return error('Method not allowed', 405);
      }

      // Domain endpoints
      if (path === '/domain') {
        if (request.method === 'POST') return handleAddDomain(request, env);
        if (request.method === 'DELETE') return handleRemoveDomain(request, env, url);
        return error('Method not allowed', 405);
      }

      return error('Not found', 404);
    } catch(e) {
      return error('Server error: ' + e.message, 500);
    }
  }
};
