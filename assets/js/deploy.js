    function getDeployDomainKey() { return 'clincoo_' + (currentProjectId || 'default') + '_deploy_domain'; }
    function getDnsVerifiedKey() { return 'clincoo_' + (currentProjectId || 'default') + '_dns_verified'; }
    function getDeployBranchKey() { return 'clincoo_' + (currentProjectId || 'default') + '_deploy_branch'; }
    function getDeploySiteKey() { return 'clincoo_' + (currentProjectId || 'default') + '_deploy_site'; }
    function getDeployHttpsKey() { return 'clincoo_' + (currentProjectId || 'default') + '_deploy_https'; }

    function loadDeployData() {

      const savedDomain = localStorage.getItem(getDeployDomainKey());
      const domainEl = document.getElementById('deploy-domain');
      if (domainEl) domainEl.value = savedDomain || '';

      const savedBranch = localStorage.getItem(getDeployBranchKey());
      const branchEl = document.getElementById('deploy-branch');
      if (branchEl && savedBranch) branchEl.value = savedBranch;

      const httpsSaved = localStorage.getItem(getDeployHttpsKey());
      const httpsEl = document.getElementById('deploy-https');
      if (httpsEl) httpsEl.checked = httpsSaved === null ? true : httpsSaved === 'true';

      renderDeployStatus();

      // Fetch domain from D1 if available (real-time sync)
      if (typeof _syncDomainFromD1 === 'function' && currentProjectId) {
        _syncDomainFromD1(currentProjectId);
      }
    }

    function renderDeployStatus() {
      const box = document.getElementById('halaman-status-box');
      const dSec = document.getElementById('domain-khusus-section');
      const cfgSec = document.getElementById('deploy-config-section');
      if (!box) return;
      let site = null;
      try { site = JSON.parse(localStorage.getItem(getDeploySiteKey()) || 'null'); } catch(e) { site = null; }
      if (!site || !site.url) {
        box.classList.add('hidden');
        if (dSec) { dSec.classList.add('hidden'); dSec.classList.remove('flex'); }
        if (cfgSec) { cfgSec.classList.remove('hidden'); }
        return;
      }
      box.classList.remove('hidden');
      if (dSec) { dSec.classList.remove('hidden'); dSec.classList.add('flex'); }
      if (cfgSec) { cfgSec.classList.add('hidden'); }
      const urlEl = document.getElementById('halaman-status-url');
      const visitEl = document.getElementById('halaman-visit-btn');
      const timeEl = document.getElementById('halaman-status-time');
      var savedDomain = localStorage.getItem(getDeployDomainKey());
      var dnsVerified = localStorage.getItem(getDnsVerifiedKey()) === 'true';
      var displayUrl = (savedDomain && dnsVerified) ? ('https://' + savedDomain) : site.url;
      if (urlEl) { urlEl.textContent = displayUrl; urlEl.href = displayUrl; }
      if (visitEl) visitEl.href = displayUrl;
      if (timeEl) timeEl.textContent = site.time || '';
      // Load saved domain into input
      const domainInput = document.getElementById('deploy-domain');
      if (domainInput) {
        const savedDomain = localStorage.getItem(getDeployDomainKey());
        if (savedDomain) domainInput.value = savedDomain;
      }
    }

async function saveDeployDomain() {
      const domainInput = document.getElementById('deploy-domain');
      const saveBtn = document.getElementById('save-domain-btn');
      if (!domainInput) return;
      const domain = domainInput.value.trim();
      if (!domain) {

        return;
      }
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Menyimpan...'; }
      localStorage.setItem(getDeployDomainKey(), domain);
      if (typeof FB !== 'undefined') FB.set(getDeployDomainKey(), domain);
      localStorage.setItem(getDnsVerifiedKey(), 'false');
      if (typeof FB !== 'undefined') FB.set(getDnsVerifiedKey(), 'false');
      renderDeployStatus();

      var proj = (typeof projects !== 'undefined') ? projects.find(function(p) { return p.id == currentProjectId; }) : null;
      var projName = proj ? proj.name : (currentProjectId || 'project');
      var projectSlug = projName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!projectSlug) projectSlug = 'clincoo-app';

      var success = false;
      try {
        var res = await fetch('https://clincoo-deploy.clincoo.workers.dev/domain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: projectSlug, domain: domain })
        });
        var result = await res.json();
        success = result.success;
        if (result.success) {
          console.log('[Clincoo] Domain berhasil disimpan');
        } else {
          console.warn('[Clincoo] Gagal menyimpan domain');
        }
      } catch(err) {
        console.warn('[Clincoo] Gagal menyimpan domain');
      }
      if (typeof _syncDomainToD1 === 'function' && currentProjectId) _syncDomainToD1(currentProjectId);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Simpan'; }
      var dnsStatus = document.getElementById('dns-status-text');
      if (dnsStatus) {
        if (success) {
          dnsStatus.textContent = 'Domain disimpan';
          dnsStatus.className = 'text-xs font-medium mt-1 text-gray-500';
          setTimeout(function() { checkDNS(); }, 600);
          // Deploy 404 page if no real deployment exists yet
          var existingSite = null;
          try { existingSite = JSON.parse(localStorage.getItem(getDeploySiteKey()) || 'null'); } catch(e) { console.warn('[Clincoo] Failed to parse deploy site:', e.message); }
          if (!existingSite || !existingSite.url) {
            deploy404Page(projectSlug);
          }
        } else {
          dnsStatus.textContent = 'Gagal menyimpan domain';
          dnsStatus.className = 'text-xs font-medium mt-1 text-red-600';
        }
      }
    }

    async function removeDeployDomain() {
      const domainInput = document.getElementById('deploy-domain');
      const domain = domainInput ? domainInput.value.trim() : '';
      if (domainInput) domainInput.value = '';
      localStorage.removeItem(getDeployDomainKey());
      if (typeof FB !== 'undefined') FB.set(getDeployDomainKey(), '');
      localStorage.setItem(getDnsVerifiedKey(), 'false');
      if (typeof FB !== 'undefined') FB.set(getDnsVerifiedKey(), 'false');
      renderDeployStatus();

      var proj = (typeof projects !== 'undefined') ? projects.find(function(p) { return p.id == currentProjectId; }) : null;
      var projName = proj ? proj.name : (currentProjectId || 'project');
      var projectSlug = projName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!projectSlug) projectSlug = 'clincoo-app';

      if (domain) {
        try {
          await fetch('https://clincoo-deploy.clincoo.workers.dev/domain?projectName=' + encodeURIComponent(projectSlug) + '&domain=' + encodeURIComponent(domain), {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
          });
        } catch(err) { console.warn('[Clincoo] Domain delete sync failed:', err.message); }
      }

      // Re-deploy current files WITHOUT redirect script (so pages.dev works again without redirecting to deleted domain)
      var existingSite = null;
      try { existingSite = JSON.parse(localStorage.getItem(getDeploySiteKey()) || 'null'); } catch(e) { console.warn('[Clincoo] Failed to parse deploy site:', e.message); }
      if (existingSite && existingSite.url) {
        // Re-deploy existing files without redirect
        try {
          var allFiles = [];
          var projectData = (typeof projects !== 'undefined') ? projects.find(function(p) { return p.id == currentProjectId; }) : null;
          if (projectData && projectData.files) {
            allFiles = projectData.files.map(function(f) { return { path: f.path, content: f.content }; });
          }
          if (allFiles.length > 0) {
            await fetch('https://clincoo-deploy.clincoo.workers.dev', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectName: projectSlug, files: allFiles, branch: 'main' })
            });
            console.log('[Clincoo] Re-deployed without redirect after domain removal');
          }
        } catch(e) { console.warn('[Clincoo] Re-deploy failed:', e.message); }
      } else {
        // Deploy 404 page without redirect
        deploy404Page(projectSlug);
      }

      if (typeof _syncDomainToD1 === 'function' && currentProjectId) _syncDomainToD1(currentProjectId);
      var dnsStatus = document.getElementById('dns-status-text');
      if (dnsStatus) {
        dnsStatus.textContent = 'Domain dihapus';
        dnsStatus.className = 'text-xs font-medium mt-1 text-gray-500';
      }
    }

    document.addEventListener('change', function(e) {
      if (e.target && e.target.id === 'deploy-https') {
        localStorage.setItem(getDeployHttpsKey(), String(e.target.checked));
        if (typeof FB !== 'undefined') FB.set(getDeployHttpsKey(), e.target.checked);
        // Apply HTTPS setting to Cloudflare Pages
        applyHttpsSetting(e.target.checked);
      }
    });

    async function applyHttpsSetting(enabled) {
      var proj = (typeof projects !== 'undefined') ? projects.find(function(p) { return p.id == currentProjectId; }) : null;
      var projName = proj ? proj.name : (currentProjectId || 'project');
      var projectSlug = projName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!projectSlug) projectSlug = 'clincoo-app';
      try {
        await fetch('https://clincoo-deploy.clincoo.workers.dev/ssl?projectName=' + encodeURIComponent(projectSlug), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: enabled })
        });
        console.log('[Clincoo] SSL setting applied:', enabled);
      } catch(err) {
        console.warn('[Clincoo] SSL setting failed:', err.message);
      }
    }

    // === DEPLOY 404 PAGE ===
    async function deploy404Page(projectSlug) {
      if (!projectSlug) return;
      // Inject redirect script if custom domain is set and DNS is verified
      var _cd = localStorage.getItem(getDeployDomainKey());
      var _dnsOk = localStorage.getItem(getDnsVerifiedKey()) === 'true';
      var _redir = '';
      if (_cd && _dnsOk) {
        _redir = '<script>if(location.hostname.endsWith(".pages.dev")){location.replace(location.href.replace(location.hostname,"' + _cd + '"))}<\/script>';
      }
      var notFoundHtml = '<!DOCTYPE html>\n<html lang="id">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>404 - Clincoo</title>\n' + _redir + '\n<style>\n*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f1117;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem}\n.logo{width:48px;height:48px;margin:0 auto 2rem}\n.logo svg{width:100%;height:100%}\nh1{font-size:5rem;font-weight:700;margin-bottom:0.5rem;letter-spacing:-0.05em}\nh2{font-size:1.25rem;font-weight:500;color:#9ca3af;margin-bottom:1.5rem}\np{color:#6b7280;max-width:400px;line-height:1.6}\n.btn{display:inline-block;margin-top:2rem;padding:0.75rem 1.5rem;background:#fff;color:#0f1117;border-radius:0.5rem;text-decoration:none;font-weight:600;font-size:0.875rem;transition:opacity 0.2s}\n.btn:hover{opacity:0.9}\n</style>\n</head>\n<body>\n<div>\n<div class="logo"><svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#fff"/><g fill="#000"><path d="M10 16C7 10 9 7 12 7C14 7 15 11 13 16Z"/><path d="M22 16C25 10 23 7 20 7C18 7 17 11 19 16Z"/><path d="M16 27C24 27 28 22.5 28 17C28 12.5 21 11.5 16 11.5C11 11.5 4 12.5 4 17C4 22.5 8 27 16 27Z"/></g></svg></div>\n<h1>404</h1>\n<h2>Halaman tidak ditemukan</h2>\n<p>Domain ini sudah terhubung ke Clincoo, tetapi belum ada proyek yang dipublikasikan.</p>\n<a href="https://devconium.github.io/Clincoo.com/" class="btn">Buat proyek di Clincoo</a>\n</div>\n</body>\n</html>';
      try {
        var res = await fetch('https://clincoo-deploy.clincoo.workers.dev', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: projectSlug,
            files: [{ path: 'index.html', content: notFoundHtml }],
            branch: 'main'
          })
        });
        var result = await res.json();
        if (result.success) {
          console.log('[Clincoo] 404 page deployed for', projectSlug);
        } else {
          console.warn('[Clincoo] 404 page deploy failed:', result.error);
        }
      } catch(e) {
        console.warn('[Clincoo] 404 page deploy error:', e.message);
      }
    }

    // === CEK DNS ===
    async function checkDNS() {
      var domainInput = document.getElementById('deploy-domain');
      var statusEl = document.getElementById('dns-status-text');
      if (!domainInput || !statusEl) return;
      var domain = domainInput.value.trim();
      if (!domain) {
        statusEl.textContent = 'Isi domain dulu';
        statusEl.className = 'text-xs font-medium mt-1 text-red-600';
        return;
      }
      // Hitung project slug untuk verifikasi target CNAME
      var proj = (typeof projects !== 'undefined') ? projects.find(function(p) { return p.id == currentProjectId; }) : null;
      var projName = proj ? proj.name : (currentProjectId || 'project');
      var projectSlug = projName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!projectSlug) projectSlug = 'clincoo-app';
      var expectedTarget = projectSlug + '.pages.dev';

      statusEl.textContent = 'Mengecek DNS...';
      statusEl.className = 'text-xs font-medium mt-1 text-gray-500';

      // Domain yang dicek: domain asli + www. variant
      var domainsToCheck = [domain];
      if (domain.indexOf('www.') !== 0) domainsToCheck.push('www.' + domain);

      try {
        var found = false;
        for (var di = 0; di < domainsToCheck.length && !found; di++) {
          var checkDomain = domainsToCheck[di];
          var res = await fetch('https://dns.google/resolve?name=' + encodeURIComponent(checkDomain) + '&type=CNAME');
          var data = await res.json();
          if (data.Answer) {
            for (var i = 0; i < data.Answer.length; i++) {
              if (data.Answer[i].type === 5) {
                var cnameTarget = data.Answer[i].data.replace(/\.$/, '');
                if (cnameTarget === expectedTarget) {
                  statusEl.textContent = 'Domain terhubung';
                  statusEl.className = 'text-xs font-medium mt-1 text-green-600';
                  localStorage.setItem(getDnsVerifiedKey(), 'true');
                  if (typeof FB !== 'undefined') FB.set(getDnsVerifiedKey(), 'true');
                  renderDeployStatus();
                  // Deploy/update 404 page with redirect if no real deployment exists
                  var _existingSite = null;
                  try { _existingSite = JSON.parse(localStorage.getItem(getDeploySiteKey()) || 'null'); } catch(e) { console.warn('[Clincoo] Failed to parse deploy site:', e.message); }
                  if (!_existingSite || !_existingSite.url) {
                    var _proj = (typeof projects !== 'undefined') ? projects.find(function(p) { return p.id == currentProjectId; }) : null;
                    var _projName = _proj ? _proj.name : (currentProjectId || 'project');
                    var _projectSlug = _projName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                    if (_projectSlug) deploy404Page(_projectSlug);
                  }
                  found = true;
                  break;
                } else if (cnameTarget.indexOf('pages.dev') !== -1) {
                  statusEl.textContent = 'Domain belum terhubung';
                  statusEl.className = 'text-xs font-medium mt-1 text-red-600';
                  localStorage.setItem(getDnsVerifiedKey(), 'false');
                  if (typeof FB !== 'undefined') FB.set(getDnsVerifiedKey(), 'false');
                  renderDeployStatus();
                  found = true;
                  break;
                }
              }
            }
          }
        }
        if (!found) {
          // Cek juga A record di apex (Cloudflare bisa pakai A record untuk apex domain)
          var aRes = await fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=A');
          var aData = await aRes.json();
          if (aData.Answer && aData.Answer.length > 0) {
            var aTarget = aData.Answer[0].data;
            if (aTarget.indexOf('172.66') !== -1 || aTarget.indexOf('104.') !== -1) {
              statusEl.textContent = 'Domain terhubung';
              statusEl.className = 'text-xs font-medium mt-1 text-green-600';
              localStorage.setItem(getDnsVerifiedKey(), 'true');
              if (typeof FB !== 'undefined') FB.set(getDnsVerifiedKey(), 'true');
              renderDeployStatus();
              var _existingSite2 = null;
              try { _existingSite2 = JSON.parse(localStorage.getItem(getDeploySiteKey()) || 'null'); } catch(e) { console.warn('[Clincoo] Failed to parse deploy site 2:', e.message); }
              if (!_existingSite2 || !_existingSite2.url) {
                var _proj2 = (typeof projects !== 'undefined') ? projects.find(function(p) { return p.id == currentProjectId; }) : null;
                var _projName2 = _proj2 ? _proj2.name : (currentProjectId || 'project');
                var _projectSlug2 = _projName2.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                if (_projectSlug2) deploy404Page(_projectSlug2);
              }
              found = true;
            }
          }
        }
        if (!found) {
          statusEl.textContent = 'Domain belum terhubung';
          statusEl.className = 'text-xs font-medium mt-1 text-red-600';
          localStorage.setItem(getDnsVerifiedKey(), 'false');
          if (typeof FB !== 'undefined') FB.set(getDnsVerifiedKey(), 'false');
          renderDeployStatus();
        }
      } catch(err) {
        statusEl.textContent = 'Gagal cek DNS';
        statusEl.className = 'text-xs font-medium mt-1 text-red-600';
      }
    }

    var autoDeployTimer = null;
    var _isDeploying = false;
    function triggerAutoDeploy() {
      if (autoDeployTimer) clearTimeout(autoDeployTimer);
      autoDeployTimer = setTimeout(function() {
        if (!currentProjectId) return;
        if (_isDeploying) return;
        // Check if project actually has files to deploy
        var storageKey = 'clincoo_' + currentProjectId + '_files';
        var files = {};
        try { files = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch(e) { console.warn('[Clincoo] Failed to parse files for deploy:', e.message); }
        var hasFiles = false;
        for (var k in files) {
          if (Array.isArray(files[k])) {
            for (var i = 0; i < files[k].length; i++) {
              if (files[k][i].type === 'file' && files[k][i].content) { hasFiles = true; break; }
            }
          }
          if (hasFiles) break;
        }
        if (hasFiles) deployToProduction(true);
      }, 1000);
    }

    async function deployToProduction(isAuto) {
      if (_isDeploying) return;
      _isDeploying = true;
      var btn = document.getElementById('deploy-prod-btn');
      var status = document.getElementById('deploy-prod-status');
      if (!btn && !isAuto) { _isDeploying = false; return; }

      var domainInput = document.getElementById('deploy-domain');
      var branchSelect = document.getElementById('deploy-branch');
      if (domainInput) localStorage.setItem(getDeployDomainKey(), domainInput.value);
      if (branchSelect) localStorage.setItem(getDeployBranchKey(), branchSelect.value);

      if (typeof saveData === 'function') saveData();
      var storageKey = 'clincoo_' + (currentProjectId || 'default') + '_files';
      var localFiles = {};
      try { localFiles = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch(e) { console.warn('[Clincoo] Failed to parse local files:', e.message); }
      var allFiles = [];
      for (var folderPath in localFiles) {
        if (!Array.isArray(localFiles[folderPath])) continue;
        for (var i = 0; i < localFiles[folderPath].length; i++) {
          var fItem = localFiles[folderPath][i];
          if (fItem.type === 'file' && fItem.content) {
            var fp = folderPath === 'root' ? fItem.name : folderPath + '/' + fItem.name;
            allFiles.push({ path: fp, content: fItem.content });
          }
        }
      }
      if (allFiles.length === 0) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span>Menyimpan</span>'; }
        var errBox = document.getElementById('deploy-error-box');
        var errMsg = document.getElementById('deploy-error-msg');
        if (errBox) { errBox.classList.remove('hidden'); }
        if (errMsg) { errMsg.textContent = 'Tidak ada file untuk dipublikasi. Buat file di tab Kode terlebih dahulu.'; }
        _isDeploying = false;
        return;
      }
      // Hide previous error
      var errBox = document.getElementById('deploy-error-box');
      if (errBox) errBox.classList.add('hidden');

      var proj = (typeof projects !== 'undefined') ? projects.find(function(p) { return p.id == currentProjectId; }) : null;
      var projName = proj ? proj.name : (currentProjectId || 'project');
      var projectSlug = projName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!projectSlug) projectSlug = 'clincoo-app';
      var branch = branchSelect ? branchSelect.value : 'main';

      if (btn) {
        var originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2" stroke-dasharray="30 70"></circle></svg><span>Menyimpan...</span>';
      }
      // Auto-inject env vars into deployed files
      var _envVars = [];
      try { _envVars = JSON.parse(localStorage.getItem(getEnvKey()) || '[]'); } catch(e) { console.warn('[Clincoo] Failed to parse env vars:', e.message); }
      var _envScript = '';
      if (_envVars.length > 0) {
        var _envObj = {};
        _envVars.forEach(function(ev) { _envObj[ev.key] = ev.value; });
        _envScript = '<script>\n' +
          'window.ENV=' + JSON.stringify(_envObj) + ';\n' +
          'window._env=function(k){return (window.ENV&&window.ENV[k])||""};\n' +
          '<\/script>';
      }

      // Auto-inject analytics tracking script into HTML files
      var _trackerScript = '<script>\n' +
        '(function(){\n' +
        'var T="https://clincoo-backend.clincoo.workers.dev/api/analytics/track";\n' +
        'var v=localStorage.getItem("_cv")||("v-"+Date.now().toString(36)+Math.random().toString(36).substr(2,8));\n' +
        'localStorage.setItem("_cv",v);\n' +
        'var s=sessionStorage.getItem("_cs")||("s-"+Date.now().toString(36)+Math.random().toString(36).substr(2,6));\n' +
        'sessionStorage.setItem("_cs",s);\n' +
        'function track(e,d){try{var b=JSON.stringify({domain:location.hostname,path:location.pathname,event_type:e||"pageview",visitor_id:v,session_id:s,referrer:document.referrer||"",screen_w:screen.width,screen_h:screen.height,language:navigator.language||"",duration:d||0});if(navigator.sendBeacon){navigator.sendBeacon(T,b)}else{fetch(T,{method:"POST",headers:{"Content-Type":"application/json"},body:b,keepalive:true})}}catch(x){}}\n' +
        'track("pageview");\n' +
        'var st=Date.now();\n' +
        'window.addEventListener("beforeunload",function(){track("session_end",Date.now()-st)});\n' +
        'document.addEventListener("click",function(e){if(e.target&&e.target.tagName==="A"){track("click")}},true);\n' +
        '})();\n' +
        '<\/script>';

      // Redirect script: pages.dev -> custom domain (only when DNS is verified)
      var _customDomain = localStorage.getItem(getDeployDomainKey());
      var _dnsVerifiedDeploy = localStorage.getItem(getDnsVerifiedKey()) === 'true';
      var _redirectScript = '';
      if (_customDomain && _dnsVerifiedDeploy) {
        _redirectScript = '<script>if(location.hostname.endsWith(".pages.dev")){location.replace(location.href.replace(location.hostname,"' + _customDomain + '"))}<\/script>';
      }

      for (var fi = 0; fi < allFiles.length; fi++) {
        if (allFiles[fi].path && allFiles[fi].path.match(/\.html?$/i) && allFiles[fi].content) {
          var c = allFiles[fi].content;
          // Inject env vars first (before any other script)
          if (_envScript && c.indexOf('window.ENV') === -1) {
            if (c.indexOf('</head>') !== -1) {
              c = c.replace('</head>', _envScript + '\n</head>');
            } else if (c.indexOf('</body>') !== -1) {
              c = c.replace('</body>', _envScript + '\n</body>');
            }
          }
          // Inject redirect to custom domain
          if (_redirectScript && c.indexOf('.pages.dev') === -1) {
            if (c.indexOf('<head>') !== -1) {
              c = c.replace('<head>', '<head>' + _redirectScript);
            } else if (c.indexOf('</head>') !== -1) {
              c = c.replace('</head>', _redirectScript + '\n</head>');
            } else if (c.indexOf('</body>') !== -1) {
              c = c.replace('</body>', _redirectScript + '\n</body>');
            }
          }
          // Inject analytics tracker
          if (c.indexOf('analyticsTrack') === -1) {
            if (c.indexOf('</head>') !== -1) {
              c = c.replace('</head>', _trackerScript + '\n</head>');
            } else if (c.indexOf('</body>') !== -1) {
              c = c.replace('</body>', _trackerScript + '\n</body>');
            } else {
              c = c + _trackerScript;
            }
          }
          allFiles[fi].content = c;
        }
      }

      try {
        var res = await fetch('https://clincoo-deploy.clincoo.workers.dev', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: projectSlug,
            files: allFiles,
            branch: branch
          })
        });
        var result = await res.json();
        if (result.success) {
          var siteUrl = result.productionUrl || result.url || '';
          var nowStr = new Date().toLocaleString('id-ID');

          // Show "waiting for live" status
          if (btn) { btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2" stroke-dasharray="30 70"></circle></svg><span>Menunggu live...</span>'; }
          var statusEl = document.getElementById('deploy-prod-status');
          if (statusEl) { statusEl.textContent = 'Menunggu situs aktif...'; statusEl.className = 'text-xs text-blue-500'; }

          // Poll URL until it returns 200 (max 30 seconds)
          var pollAttempts = 0;
          var maxPolls = 15;
          var pollUrl = function() {
            pollAttempts++;
            fetch(siteUrl, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).then(function() {
              // URL is responding (even in no-cors mode, no rejection means it loaded)
              var siteInfo = { url: siteUrl, time: nowStr };
              localStorage.setItem(getDeploySiteKey(), JSON.stringify(siteInfo));
              if (typeof FB !== 'undefined') FB.set(getDeploySiteKey(), siteInfo);
              renderDeployStatus();
              if (btn) { btn.innerHTML = originalHTML; btn.disabled = false; }
              if (statusEl) { statusEl.textContent = 'Situs aktif'; statusEl.className = 'text-xs text-green-500'; setTimeout(function() { if (statusEl) statusEl.textContent = ''; }, 3000); }
              // Push to GitHub if connected
              if (getGithubToken()) {
                pushFilesToGithub(currentProjectId).then(function(pushResult) {
                  if (pushResult.success) {
                    console.log('[Clincoo] Files pushed to GitHub successfully');
                  }
                }).catch(function(err) { console.warn('[Clincoo] GitHub push failed:', err.message); });
                // Also save CF Pages project name mapping
                localStorage.setItem('clincoo_' + currentProjectId + '_cf_project', projectSlug);
              }
              _isDeploying = false;
              var succErrBox = document.getElementById('deploy-error-box');
              if (succErrBox) succErrBox.classList.add('hidden');
            }).catch(function() {
              if (pollAttempts < maxPolls) {
                setTimeout(pollUrl, 2000);
              } else {
                // Timeout - still save URL, site might be live shortly
                var siteInfo = { url: siteUrl, time: nowStr };
                localStorage.setItem(getDeploySiteKey(), JSON.stringify(siteInfo));
                if (typeof FB !== 'undefined') FB.set(getDeploySiteKey(), siteInfo);
                renderDeployStatus();
                if (btn) { btn.innerHTML = originalHTML; btn.disabled = false; }
                if (statusEl) { statusEl.textContent = ''; statusEl.className = 'text-xs text-gray-400'; }
                _isDeploying = false;
              }
            });
          };
          setTimeout(pollUrl, 3000); // Wait 3s before first poll
        } else {
          var deployErr = result.error || 'Publikasi gagal';
          var errBox2 = document.getElementById('deploy-error-box');
          var errMsg2 = document.getElementById('deploy-error-msg');
          if (errBox2) { errBox2.classList.remove('hidden'); }
          if (errMsg2) { errMsg2.textContent = deployErr; }
          throw new Error(deployErr);
        }
      } catch(err) {
        if (btn) { btn.innerHTML = originalHTML; btn.disabled = false; }
        var errBox = document.getElementById('deploy-error-box');
        var errMsg = document.getElementById('deploy-error-msg');
        if (errBox) { errBox.classList.remove('hidden'); }
        if (errMsg) { errMsg.textContent = 'Gagal mempublikasi: ' + (err.message || 'Kesalahan jaringan'); }
        _isDeploying = false;
      }
    }


    var _analyticsChartsInited = false;
    var _analyticsCharts = {};
    var _analyticsRefreshTimer = null;
    var ANALYTICS_STATS_URL = 'https://clincoo-backend.clincoo.workers.dev/api/analytics/stats';
    var ANALYTICS_TRACK_URL = 'https://clincoo-backend.clincoo.workers.dev/api/analytics/track';
