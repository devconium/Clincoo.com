    // ============================================================
    // CLINCOO DEPLOY — R2-based (no CF Pages project limits)
    // Files stored in Cloudflare R2, served by the deploy worker.
    // Custom subdomains auto-configured via Cloudflare DNS CNAME.
    // ============================================================

    function getDeployDomainKey() { return 'clincoo_' + (currentProjectId || 'default') + '_deploy_domain'; }
    function getDnsVerifiedKey() { return 'clincoo_' + (currentProjectId || 'default') + '_dns_verified'; }
    function getDeployBranchKey() { return 'clincoo_' + (currentProjectId || 'default') + '_deploy_branch'; }
    function getDeploySiteKey() { return 'clincoo_' + (currentProjectId || 'default') + '_deploy_site'; }
    function getDeployHttpsKey() { return 'clincoo_' + (currentProjectId || 'default') + '_deploy_https'; }

    var DEPLOY_WORKER_URL = 'https://clincoo-deploy.clincoo.workers.dev';
    var DEPLOY_CNAME_TARGET = 'clincoo-deploy.clincoo.workers.dev';

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
      if (!domain) { return; }
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
        var res = await fetch(DEPLOY_WORKER_URL + '/domain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: projectSlug, domain: domain })
        });
        var result = await res.json();
        success = result.success;
        if (result.success) {
          console.log('[Clincoo] Domain berhasil dikonfigurasi (auto CNAME)');
        } else {
          console.warn('[Clincoo] Gagal menyimpan domain:', result.error || 'unknown');
        }
      } catch(err) {
        console.warn('[Clincoo] Gagal menyimpan domain:', err.message);
      }
      if (typeof _syncDomainToD1 === 'function' && currentProjectId) _syncDomainToD1(currentProjectId);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Simpan'; }
      var dnsStatus = document.getElementById('dns-status-text');
      if (dnsStatus) {
        if (success) {
          dnsStatus.textContent = 'Subdomain dikonfigurasi, menunggu DNS...';
          dnsStatus.className = 'text-xs font-medium mt-1 text-blue-500';
          setTimeout(function() { checkDNS(); }, 2000);
        } else {
          dnsStatus.textContent = 'Gagal membuat subdomain';
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

      // Delete DNS CNAME via worker
      if (domain) {
        try {
          await fetch(DEPLOY_WORKER_URL + '/domain?projectName=' + encodeURIComponent(projectSlug) + '&domain=' + encodeURIComponent(domain), {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
          });
          console.log('[Clincoo] DNS CNAME removed for', domain);
        } catch(err) { console.warn('[Clincoo] Domain delete failed:', err.message); }
      }

      if (typeof _syncDomainToD1 === 'function' && currentProjectId) _syncDomainToD1(currentProjectId);
      var dnsStatus = document.getElementById('dns-status-text');
      if (dnsStatus) {
        dnsStatus.textContent = 'Subdomain dihapus';
        dnsStatus.className = 'text-xs font-medium mt-1 text-gray-500';
      }
    }

    document.addEventListener('change', function(e) {
      if (e.target && e.target.id === 'deploy-https') {
        localStorage.setItem(getDeployHttpsKey(), String(e.target.checked));
        if (typeof FB !== 'undefined') FB.set(getDeployHttpsKey(), e.target.checked);
      }
    });

    // === DNS CHECK ===
    // With R2 + Worker approach, DNS is auto-created by the worker.
    // We just verify the CNAME resolves to our worker.
    async function checkDNS() {
      var domainInput = document.getElementById('deploy-domain');
      var statusEl = document.getElementById('dns-status-text');
      if (!domainInput || !statusEl) return;
      var domain = domainInput.value.trim();
      if (!domain) {
        statusEl.textContent = 'Isi subdomain dulu';
        statusEl.className = 'text-xs font-medium mt-1 text-red-600';
        return;
      }

      statusEl.textContent = 'Mengecek DNS...';
      statusEl.className = 'text-xs font-medium mt-1 text-gray-500';

      var domainsToCheck = [domain];
      if (domain.indexOf('www.') !== 0) domainsToCheck.push('www.' + domain);

      try {
        var found = false;
        for (var di = 0; di < domainsToCheck.length && !found; di++) {
          var checkDomain = domainsToCheck[di];

          // Check CNAME
          var res = await fetch('https://dns.google/resolve?name=' + encodeURIComponent(checkDomain) + '&type=CNAME');
          var data = await res.json();
          if (data.Answer) {
            for (var i = 0; i < data.Answer.length; i++) {
              if (data.Answer[i].type === 5) {
                var cnameTarget = data.Answer[i].data.replace(/\.$/, '');
                if (cnameTarget === DEPLOY_CNAME_TARGET || cnameTarget.indexOf('clincoo-deploy') !== -1) {
                  statusEl.textContent = 'Subdomain aktif';
                  statusEl.className = 'text-xs font-medium mt-1 text-green-600';
                  localStorage.setItem(getDnsVerifiedKey(), 'true');
                  if (typeof FB !== 'undefined') FB.set(getDnsVerifiedKey(), 'true');
                  renderDeployStatus();
                  found = true;
                  break;
                } else if (cnameTarget.indexOf('pages.dev') !== -1) {
                  // Legacy CF Pages CNAME — need to update
                  statusEl.textContent = 'CNAME lama terdeteksi, update ke CNAME baru';
                  statusEl.className = 'text-xs font-medium mt-1 text-yellow-600';
                  found = true;
                  break;
                }
              }
            }
          }
        }
        if (!found) {
          // Check A record (Cloudflare proxied uses Cloudflare IPs)
          var aRes = await fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=A');
          var aData = await aRes.json();
          if (aData.Answer && aData.Answer.length > 0) {
            // Cloudflare proxied records return Cloudflare IPs
            statusEl.textContent = 'Subdomain aktif (proxied)';
            statusEl.className = 'text-xs font-medium mt-1 text-green-600';
            localStorage.setItem(getDnsVerifiedKey(), 'true');
            if (typeof FB !== 'undefined') FB.set(getDnsVerifiedKey(), 'true');
            renderDeployStatus();
            found = true;
          }
        }
        if (!found) {
          statusEl.textContent = 'Menunggu propagasi DNS... (1-2 menit)';
          statusEl.className = 'text-xs font-medium mt-1 text-yellow-500';
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
      var errBox = document.getElementById('deploy-error-box');
      if (errBox) errBox.classList.add('hidden');

      var proj = (typeof projects !== 'undefined') ? projects.find(function(p) { return p.id == currentProjectId; }) : null;
      var projName = proj ? proj.name : (currentProjectId || 'project');
      var projectSlug = projName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!projectSlug) projectSlug = 'clincoo-app';
      var branch = branchSelect ? branchSelect.value : 'main';

      var originalHTML = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2" stroke-dasharray="30 70"></circle></svg><span>Menyimpan...</span>';
      }

      // Auto-inject env vars into HTML files
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

      // Inject env vars and analytics into HTML files
      for (var fi = 0; fi < allFiles.length; fi++) {
        if (allFiles[fi].path && allFiles[fi].path.match(/\.html?$/i) && allFiles[fi].content) {
          var c = allFiles[fi].content;
          if (_envScript && c.indexOf('window.ENV') === -1) {
            if (c.indexOf('</head>') !== -1) {
              c = c.replace('</head>', _envScript + '\n</head>');
            } else if (c.indexOf('</body>') !== -1) {
              c = c.replace('</body>', _envScript + '\n</body>');
            }
          }
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
        var res = await fetch(DEPLOY_WORKER_URL, {
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

          if (btn) { btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2" stroke-dasharray="30 70"></circle></svg><span>Menunggu live...</span>'; }
          var statusEl = document.getElementById('deploy-prod-status');
          if (statusEl) { statusEl.textContent = 'Menunggu situs aktif...'; statusEl.className = 'text-xs text-blue-500'; }

          // R2 is immediately available — short poll
          var pollAttempts = 0;
          var maxPolls = 8;
          var pollUrl = function() {
            pollAttempts++;
            fetch(siteUrl, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).then(function() {
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
              }
              _isDeploying = false;
              var succErrBox = document.getElementById('deploy-error-box');
              if (succErrBox) succErrBox.classList.add('hidden');
            }).catch(function() {
              if (pollAttempts < maxPolls) {
                setTimeout(pollUrl, 1500);
              } else {
                // Timeout — still save URL, R2 should be live
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
          setTimeout(pollUrl, 1500); // R2 is fast, short wait
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

    function initAnalytics() {
      if (_analyticsChartsInited) return;
      if (typeof Chart === 'undefined') {
        setTimeout(initAnalytics, 500);
        return;
      }

      var ctx1 = document.getElementById('chart-traffic');
      var ctx2 = document.getElementById('chart-pages');
      var ctx3 = document.getElementById('chart-devices');
      var ctx4 = document.getElementById('chart-referrers');

      if (ctx1) {
        _analyticsCharts.traffic = new Chart(ctx1, {
          type: 'line',
          data: { labels: [], datasets: [{ label: 'Page Views', data: [], borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', tension: 0.3, fill: true }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#9ca3af' } }, x: { ticks: { color: '#9ca3af' } } } }
        });
      }
      if (ctx2) {
        _analyticsCharts.pages = new Chart(ctx2, {
          type: 'bar',
          data: { labels: [], datasets: [{ label: 'Views', data: [], backgroundColor: '#6366f1', borderRadius: 6 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#9ca3af' } }, x: { ticks: { color: '#9ca3af' } } } }
        });
      }
      if (ctx3) {
        _analyticsCharts.devices = new Chart(ctx3, {
          type: 'doughnut',
          data: { labels: [], datasets: [{ data: [], backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444'] }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } } }
        });
      }
      if (ctx4) {
        _analyticsCharts.referrers = new Chart(ctx4, {
          type: 'bar',
          data: { labels: [], datasets: [{ label: 'Visits', data: [], backgroundColor: '#10b981', borderRadius: 6 }] },
          options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#9ca3af' } }, x: { beginAtZero: true, ticks: { color: '#9ca3af' } } } }
        });
      }

      _analyticsChartsInited = true;
      fetchAnalyticsData();
    }

    function fetchAnalyticsData() {
      fetch(ANALYTICS_STATS_URL + '?domain=' + encodeURIComponent(location.hostname))
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (!data.success) return;
          updateAnalyticsCharts(data.stats || {});
        })
        .catch(function(err) { console.warn('[Clincoo] Analytics fetch failed:', err.message); });

      if (_analyticsRefreshTimer) clearInterval(_analyticsRefreshTimer);
      _analyticsRefreshTimer = setInterval(fetchAnalyticsData, 30000);
    }

    function updateAnalyticsCharts(stats) {
      if (_analyticsCharts.traffic && stats.traffic) {
        _analyticsCharts.traffic.data.labels = stats.traffic.labels || [];
        _analyticsCharts.traffic.data.datasets[0].data = stats.traffic.data || [];
        _analyticsCharts.traffic.update();
      }
      if (_analyticsCharts.pages && stats.pages) {
        _analyticsCharts.pages.data.labels = stats.pages.map(function(p) { return p.path; });
        _analyticsCharts.pages.data.datasets[0].data = stats.pages.map(function(p) { return p.views; });
        _analyticsCharts.pages.update();
      }
      if (_analyticsCharts.devices && stats.devices) {
        _analyticsCharts.devices.data.labels = stats.devices.map(function(d) { return d.device; });
        _analyticsCharts.devices.data.datasets[0].data = stats.devices.map(function(d) { return d.count; });
        _analyticsCharts.devices.update();
      }
      if (_analyticsCharts.referrers && stats.referrers) {
        _analyticsCharts.referrers.data.labels = stats.referrers.map(function(r) { return r.referrer || 'Direct'; });
        _analyticsCharts.referrers.data.datasets[0].data = stats.referrers.map(function(r) { return r.count; });
        _analyticsCharts.referrers.update();
      }
    }

    function stopAnalyticsRefresh() {
      if (_analyticsRefreshTimer) {
        clearInterval(_analyticsRefreshTimer);
        _analyticsRefreshTimer = null;
      }
    }
