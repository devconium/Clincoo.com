

const BACKEND_URL = 'https://clincoo-backend.clincoo.workers.dev';
const BACKEND_API_KEY = 'clincoo_00f61808f9a9aa8b0ed7ee38a00b854e';
const POLL_INTERVAL = 1500;

const _origSaveData = saveData;
const _origLoadData = loadData;
const _origLoadProjectFiles = loadProjectFiles;

let _isSyncing = false;
let _lastProjectsHash = '';
let _lastFilesHash = {};
let _pollTimer = null;
let _debounceTimer = null;
var _recentlyDeletedIds = new Set();

async function _api(method, path, body) {
  try {
    const opts = {
      method,
      headers: {
        'X-API-Key': BACKEND_API_KEY,
        'Content-Type': 'application/json'
      }
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(BACKEND_URL + path, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[Clincoo Sync] Network error:', e.message);
    return null;
  }
}

function _hash(obj) {
  try {
    return JSON.stringify(obj).length.toString(36);
  } catch (e) {
    return Math.random().toString(36);
  }
}

function _debouncedSync() {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(function() {
    _syncProjectsToD1();
    if (typeof currentProjectId !== 'undefined' && currentProjectId) {
      _syncFilesToD1(currentProjectId);
    }
  }, 500);
}

var saveData = function() {
  _origSaveData();
  if (!_isSyncing) _debouncedSync();
}

var loadData = function() {
  _origLoadData();
  _syncProjectsFromD1();
}

var loadProjectFiles = function() {
  _origLoadProjectFiles();
  if (typeof currentProjectId !== 'undefined' && currentProjectId) {
    _syncFilesFromD1(currentProjectId);
  }
}

async function _syncProjectsToD1() {
  if (_isSyncing) return;
  _isSyncing = true;
  try {
    for (var i = 0; i < projects.length; i++) {
      var project = projects[i];
      var pid = String(project.id);
      var name = project.name || 'Untitled';
      var desc = project.desc || project.description || 'Tanpa keterangan';

      var existing = await _api('GET', '/api/projects/' + pid);
      if (existing && existing.success && existing.data) {
        await _api('PUT', '/api/projects/' + pid, { name: name, description: desc });
      } else {
        await _api('POST', '/api/projects', { id: pid, name: name, description: desc });
      }
    }
    // Delete D1 projects that no longer exist locally
    var d1Result = await _api('GET', '/api/projects');
    if (d1Result && d1Result.success && d1Result.data) {
      for (var j = 0; j < d1Result.data.length; j++) {
        var d1Id = String(d1Result.data[j].id);
        var stillExists = projects.some(function(p) { return String(p.id) === d1Id; });
        if (!stillExists && !_recentlyDeletedIds.has(d1Id)) {
          _recentlyDeletedIds.add(d1Id);
          await _api('DELETE', '/api/projects/' + d1Id);
          await _api('DELETE', '/api/kv/clincoo_' + d1Id + '_files');
          setTimeout(function(id) { _recentlyDeletedIds.delete(id); }, 5000);
        }
      }
    }
  } catch (e) {
    console.warn('[Clincoo Sync] Error syncing projects to D1:', e.message);
  } finally {
    _isSyncing = false;
  }
}

async function _syncProjectsFromD1() {
  if (_isSyncing) return;
  var result = await _api('GET', '/api/projects');
  if (!result || !result.success || !result.data) return;

  var d1Projects = result.data.map(function(p) {
    return {
      id: parseInt(p.id) || p.id,
      name: p.name,
      desc: p.description || 'Tanpa keterangan',
      visibility: 'public'
    };
  });

  var changed = false;

  for (var i = 0; i < d1Projects.length; i++) {
    var d1Proj = d1Projects[i];
    if (_recentlyDeletedIds.has(String(d1Proj.id))) continue;
    var localIdx = projects.findIndex(function(p) { return String(p.id) === String(d1Proj.id); });
    if (localIdx === -1) {
      projects.push(d1Proj);
      changed = true;
    } else {
      // Local is authoritative for existing projects - don't overwrite from D1
      // D1 sync (push) will keep D1 in sync with local
    }
  }


  if (changed) {
    filteredProjects = [...projects];
    if (typeof renderProjects === 'function') renderProjects();
    _origSaveData();
    _lastProjectsHash = _hash(projects);
  }
}

async function _syncFilesToD1(projectId) {
  var key = 'clincoo_' + projectId + '_files';
  var filesData = localStorage.getItem(key);
  if (!filesData) return;

  try {
    var parsed = JSON.parse(filesData);
    await _api('PUT', '/api/kv/' + key, parsed);
  } catch (e) {
    console.warn('[Clincoo Sync] Error syncing files to D1:', e.message);
  }
}

async function _syncFilesFromD1(projectId) {
  var key = 'clincoo_' + projectId + '_files';
  var result = await _api('GET', '/api/kv/' + key);
  if (!result || !result.success || !result.data) return;

  var d1Files = result.data;
  var localData = localStorage.getItem(key);
  var localParsed = localData ? JSON.parse(localData) : null;

  if (JSON.stringify(d1Files) !== JSON.stringify(localParsed)) {
    localStorage.setItem(key, JSON.stringify(d1Files));
    projectFilesData = d1Files;
    if (typeof renderFileList === 'function') renderFileList();
    if (typeof renderSecurityTab === 'function') renderSecurityTab();
    _lastFilesHash[projectId] = _hash(d1Files);
  }
}

async function _deleteProjectFromD1(projectId, projName) {
  var pid = String(projectId);
  _recentlyDeletedIds.add(pid);
  try {
    await _api('DELETE', '/api/projects/' + pid);
    await _api('DELETE', '/api/kv/clincoo_' + pid + '_files');

    // Undeploy from Cloudflare Pages
    if (!projName) {
      var proj = (typeof projects !== 'undefined') ? projects.find(function(p) { return String(p.id) === pid; }) : null;
      projName = proj ? proj.name : pid;
    }
    var projectSlug = projName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!projectSlug) projectSlug = 'clincoo-app';
    try {
      await fetch('https://clincoo-deploy.clincoo.workers.dev?projectName=' + encodeURIComponent(projectSlug), {
        method: 'DELETE'
      });
    } catch(e2) {
      console.warn('[Clincoo Sync] Error undeploying from Pages:', e2.message);
    }

    // Clean up deploy-related localStorage keys
    localStorage.removeItem('clincoo_' + pid + '_deploy_domain');
    localStorage.removeItem('clincoo_' + pid + '_deploy_branch');
    localStorage.removeItem('clincoo_' + pid + '_deploy_site');
    localStorage.removeItem('clincoo_' + pid + '_deploy_https');
  } catch(e) {
    console.warn('[Clincoo Sync] Error deleting project from D1:', e.message);
  } finally {
    setTimeout(function() { _recentlyDeletedIds.delete(pid); }, 5000);
  }
}

// === ENV VARS SYNC ===
var _lastEnvHash = {};
var _isEnvSyncing = false;

async function _syncEnvToD1(projectId) {
  if (_isEnvSyncing) return;
  _isEnvSyncing = true;
  try {
    var envKey = 'clincoo_' + projectId + '_env_variables';
    var localEnv = [];
    try { localEnv = JSON.parse(localStorage.getItem(envKey) || '[]'); } catch(e) {}

    // Fetch existing D1 env vars
    var existing = await _api('GET', '/api/projects/' + projectId + '/env');
    var d1Vars = (existing && existing.success && existing.data) ? existing.data : [];

    // Delete vars that no longer exist locally
    for (var i = 0; i < d1Vars.length; i++) {
      var d1Key = d1Vars[i].key;
      var stillExists = localEnv.some(function(e) { return e.key === d1Key; });
      if (!stillExists) {
        await _api('DELETE', '/api/env/' + d1Vars[i].id);
      }
    }

    // Add/update vars that exist locally but not in D1
    for (var j = 0; j < localEnv.length; j++) {
      var localKey = localEnv[j].key;
      var localVal = localEnv[j].value;
      var d1Match = d1Vars.find(function(d) { return d.key === localKey; });
      if (!d1Match) {
        await _api('POST', '/api/projects/' + projectId + '/env', { key: localKey, value: localVal });
      } else if (d1Match.value !== localVal) {
        await _api('DELETE', '/api/env/' + d1Match.id);
        await _api('POST', '/api/projects/' + projectId + '/env', { key: localKey, value: localVal });
      }
    }
  } catch(e) {
    console.warn('[Clincoo Sync] Error syncing env to D1:', e.message);
  } finally {
    _isEnvSyncing = false;
  }
}

async function _syncEnvFromD1(projectId) {
  if (_isEnvSyncing) return;
  try {
    var result = await _api('GET', '/api/projects/' + projectId + '/env');
    if (!result || !result.success || !result.data) return;

    var d1Env = result.data.map(function(item) {
      return { key: item.key, value: item.value };
    });

    var envKey = 'clincoo_' + projectId + '_env_variables';
    var localEnv = [];
    try { localEnv = JSON.parse(localStorage.getItem(envKey) || '[]'); } catch(e) {}

    var d1Hash = _hash(d1Env);
    if (d1Hash !== (_lastEnvHash[projectId] || '') && JSON.stringify(d1Env) !== JSON.stringify(localEnv)) {
      localStorage.setItem(envKey, JSON.stringify(d1Env));
      if (typeof envVariables !== 'undefined') {
        envVariables = d1Env;
        if (typeof renderEnvList === 'function') renderEnvList();
      }
      _lastEnvHash[projectId] = d1Hash;
    }
  } catch(e) {
    console.warn('[Clincoo Sync] Error syncing env from D1:', e.message);
  }
}

// === DOMAIN SYNC ===
var _lastDomainHash = {};

async function _syncDomainToD1(projectId) {
  try {
    var domainKey = 'clincoo_' + projectId + '_deploy_domain';
    var localDomain = localStorage.getItem(domainKey) || '';

    var existing = await _api('GET', '/api/projects/' + projectId + '/settings');
    var settings = (existing && existing.success && existing.data) ? existing.data : {};
    
    if (settings.deploy_domain !== localDomain) {
      settings.deploy_domain = localDomain;
      await _api('PUT', '/api/projects/' + projectId + '/settings', settings);
    }
  } catch(e) {
    console.warn('[Clincoo Sync] Error syncing domain to D1:', e.message);
  }
}

async function _syncDomainFromD1(projectId) {
  try {
    var result = await _api('GET', '/api/projects/' + projectId + '/settings');
    if (!result || !result.success || !result.data) return;

    var settings = result.data;
    if (settings.deploy_domain !== undefined) {
      var domainKey = 'clincoo_' + projectId + '_deploy_domain';
      var localDomain = localStorage.getItem(domainKey) || '';
      if (settings.deploy_domain !== localDomain) {
        if (settings.deploy_domain) {
          localStorage.setItem(domainKey, settings.deploy_domain);
        } else {
          localStorage.removeItem(domainKey);
        }
        var domainEl = document.getElementById('deploy-domain');
        if (domainEl) domainEl.value = settings.deploy_domain || '';
        _lastDomainHash[projectId] = _hash(settings.deploy_domain || '');
      }
    }
  } catch(e) {
    console.warn('[Clincoo Sync] Error syncing domain from D1:', e.message);
  }
}

async function _poll() {
  if (_isSyncing) return;

  var projectsResult = await _api('GET', '/api/projects');
  if (projectsResult && projectsResult.success && projectsResult.data) {
    var currentHash = _hash(projectsResult.data);
    if (currentHash !== _lastProjectsHash) {
      _lastProjectsHash = currentHash;
      await _syncProjectsFromD1();
    }
  }

  if (typeof currentProjectId !== 'undefined' && currentProjectId) {
    var key = 'clincoo_' + currentProjectId + '_files';
    var result = await _api('GET', '/api/kv/' + key);
    if (result && result.success && result.data) {
      var fh = _hash(result.data);
      if (fh !== (_lastFilesHash[currentProjectId] || '')) {
        _lastFilesHash[currentProjectId] = fh;
        await _syncFilesFromD1(currentProjectId);
      }
    }

    // Sync env vars
    await _syncEnvFromD1(currentProjectId);

    // Sync domain
    await _syncDomainFromD1(currentProjectId);
  }
}

function _startPolling() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(_poll, POLL_INTERVAL);
}

async function _fetchSecurityStats() {
  return await _api('GET', '/api/security/stats');
}

async function _checkBackendHealth() {
  try {
    var res = await fetch(BACKEND_URL + '/api/health');
    if (!res.ok) return false;
    var data = await res.json();
    return data.success && data.status === 'ok';
  } catch (e) {
    return false;
  }
}

window.addEventListener('DOMContentLoaded', function() {
  _startPolling();

  _checkBackendHealth().then(function(ok) {
    if (ok) {
      console.log('[Clincoo Sync] Connected to Cloudflare D1 backend');
    } else {
      console.warn('[Clincoo Sync] Backend unreachable, running in localStorage-only mode');
    }
  });

  setTimeout(function() {
    _syncProjectsFromD1();
    if (typeof currentProjectId !== 'undefined' && currentProjectId) {
      _syncFilesFromD1(currentProjectId);
      _syncEnvFromD1(currentProjectId);
      _syncDomainFromD1(currentProjectId);
    }
  }, 100);
});

window._deleteProjectFromD1 = _deleteProjectFromD1;
window._fetchSecurityStats = _fetchSecurityStats;
window._checkBackendHealth = _checkBackendHealth;
window._syncEnvToD1 = _syncEnvToD1;
window._syncEnvFromD1 = _syncEnvFromD1;
window._syncDomainToD1 = _syncDomainToD1;
window._syncDomainFromD1 = _syncDomainFromD1;
