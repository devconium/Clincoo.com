/**
 * backend.js — Real-time Cloudflare D1 sync layer for Clincoo
 * Connects the frontend to Cloudflare Worker (D1 database, security, CDN)
 * Does NOT modify any frontend UI — only hooks into saveData/loadData
 * for bidirectional real-time sync.
 */

const BACKEND_URL = 'https://clincoo-backend.clincoo.workers.dev';
const BACKEND_API_KEY = 'clincoo_00f61808f9a9aa8b0ed7ee38a00b854e';
const POLL_INTERVAL = 1500;

// --- Store references to original app.js functions ---
const _origSaveData = saveData;
const _origLoadData = loadData;
const _origLoadProjectFiles = loadProjectFiles;

// --- Sync state ---
let _isSyncing = false;
let _lastProjectsHash = '';
let _lastFilesHash = {};
let _pollTimer = null;
let _debounceTimer = null;

// --- API helper ---
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

// --- Quick hash for change detection ---
function _hash(obj) {
  try {
    return JSON.stringify(obj).length.toString(36);
  } catch (e) {
    return Math.random().toString(36);
  }
}

// --- Debounced save to avoid spamming the API ---
function _debouncedSync() {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(function() {
    _syncProjectsToD1();
    if (typeof currentProjectId !== 'undefined' && currentProjectId) {
      _syncFilesToD1(currentProjectId);
    }
  }, 500);
}

// --- Override saveData: localStorage + D1 sync ---
var saveData = function() {
  _origSaveData();
  if (!_isSyncing) _debouncedSync();
}

// --- Override loadData: localStorage first, then merge from D1 ---
var loadData = function() {
  _origLoadData();
  // Fire D1 sync in background (don't block page load)
  _syncProjectsFromD1();
}

// --- Override loadProjectFiles: localStorage first, then merge from D1 ---
var loadProjectFiles = function() {
  _origLoadProjectFiles();
  if (typeof currentProjectId !== 'undefined' && currentProjectId) {
    _syncFilesFromD1(currentProjectId);
  }
}

// --- Sync projects TO D1 ---
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
  } catch (e) {
    console.warn('[Clincoo Sync] Error syncing projects to D1:', e.message);
  } finally {
    _isSyncing = false;
  }
}

// --- Sync projects FROM D1 ---
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
    var localIdx = projects.findIndex(function(p) { return String(p.id) === String(d1Proj.id); });
    if (localIdx === -1) {
      projects.push(d1Proj);
      changed = true;
    } else {
      if (projects[localIdx].name !== d1Proj.name || projects[localIdx].desc !== d1Proj.desc) {
        projects[localIdx].name = d1Proj.name;
        projects[localIdx].desc = d1Proj.desc;
        changed = true;
      }
    }
  }

  // NOTE: We do NOT remove local-only projects here.
  // Local projects that haven't synced to D1 yet should be preserved.
  // Deletions are handled explicitly via _deleteProjectFromD1().

  if (changed) {
    filteredProjects = [...projects];
    if (typeof renderProjects === 'function') renderProjects();
    _origSaveData();
    _lastProjectsHash = _hash(projects);
  }
}

// --- Sync files TO D1 (using KV store in settings table) ---
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

// --- Sync files FROM D1 ---
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

// --- Delete project from D1 ---
async function _deleteProjectFromD1(projectId) {
  await _api('DELETE', '/api/projects/' + String(projectId));
}

// --- Real-time polling ---
async function _poll() {
  if (_isSyncing) return;

  // Poll projects
  var projectsResult = await _api('GET', '/api/projects');
  if (projectsResult && projectsResult.success && projectsResult.data) {
    var currentHash = _hash(projectsResult.data);
    if (currentHash !== _lastProjectsHash) {
      _lastProjectsHash = currentHash;
      await _syncProjectsFromD1();
    }
  }

  // Poll files for current project
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
  }
}

function _startPolling() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(_poll, POLL_INTERVAL);
}

// --- Security stats from D1 ---
async function _fetchSecurityStats() {
  return await _api('GET', '/api/security/stats');
}

// --- Health check ---
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

// --- Initialize on DOMContentLoaded ---
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
    }
  }, 100);
});

// --- Export for inline scripts ---
window._deleteProjectFromD1 = _deleteProjectFromD1;
window._fetchSecurityStats = _fetchSecurityStats;
window._checkBackendHealth = _checkBackendHealth;
