    let projects = [];
    let filteredProjects = [];
    let isSaving = false;
    let currentFolderPath = 'root';
    let editingFileName = null;
    let projectFilesData = { 'root': [] };
    let currentProjectId = null;
    let modalAction = null;
    let itemBeingRenamed = null;
    let activeItemName = null;

    const defaultTemplates = {
      'html': '<!DOCTYPE html>\n<html>\n<head>\n  <title>New Page</title>\n</head>\n<body>\n  <h1>Hello World</h1>\n</body>\n</html>',
      'css': 'body {\n  margin: 0;\n  padding: 0;\n}',
      'js': 'console.log("Hello World");',
      'py': 'print("Hello World")',
      'json': '{\n  "key": "value"\n}'
    };

    function loadData() {
      const stored = localStorage.getItem('clincoo_projects');
      if (stored) {
        try { projects = JSON.parse(stored); } catch(e) { projects = []; }
      } else { projects = []; }
    }

    function saveData() {
      try {
        localStorage.setItem('clincoo_projects', JSON.stringify(projects));
      } catch(e) {
        console.warn('[Clincoo] Failed to save projects:', e.message);
      }
      if (currentProjectId) {
        try {
          localStorage.setItem('clincoo_' + currentProjectId + '_files', JSON.stringify(projectFilesData));
        } catch(e) {
          console.warn('[Clincoo] Failed to save files (quota?):', e.message);
          // Try to save without large content as fallback
          try {
            var stripped = {};
            for (var key in projectFilesData) {
              stripped[key] = projectFilesData[key].map(function(item) {
                var copy = {};
                for (var k in item) {
                  if (k === 'content' && typeof item[k] === 'string' && item[k].length > 50000) {
                    copy[k] = item[k].substring(0, 50000) + '...[truncated]';
                  } else {
                    copy[k] = item[k];
                  }
                }
                return copy;
              });
            }
            localStorage.setItem('clincoo_' + currentProjectId + '_files', JSON.stringify(stripped));
            console.warn('[Clincoo] Saved with truncated content due to quota');
          } catch(e2) {
            console.error('[Clincoo] Save completely failed:', e2.message);
          }
        }
      }
      if (typeof triggerAutoDeploy === 'function') triggerAutoDeploy();
    }

    function loadProjectFiles() {
      if (!currentProjectId) return;
      const stored = localStorage.getItem('clincoo_' + currentProjectId + '_files');
      if (stored) {
        try { projectFilesData = JSON.parse(stored); } catch(e) { projectFilesData = { 'root': [] }; }
      } else { projectFilesData = { 'root': [] }; }
      if (!projectFilesData['root']) projectFilesData['root'] = [];
    }

    function getFileExtension(filename) {
      if (!filename || !filename.includes('.')) return '';
      return filename.split('.').pop().toLowerCase();
    }

    function getFileType(filename) {
      const ext = getFileExtension(filename);
      if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
      if (['mp3', 'wav', 'ogg'].includes(ext)) return 'audio';
      if (['mp4', 'webm'].includes(ext)) return 'video';
      return 'code';
    }

    function getFileIcon(filename) {
      const type = getFileType(filename);
      const ext = getFileExtension(filename);
      if (type === 'image') return `<div class="flex-shrink-0 w-6 h-6 flex items-center justify-center text-[#ec4899]"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>`;
      if (type === 'audio') return `<div class="flex-shrink-0 w-6 h-6 flex items-center justify-center text-[#8b5cf6]"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2-2-2 2 .895 2 2-.895 2-2 2zm12-3c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2zM9 10l12-3"></path></svg></div>`;
      if (type === 'video') return `<div class="flex-shrink-0 w-6 h-6 flex items-center justify-center text-[#ef4444]"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></div>`;
      if (ext === 'html') return `<div class="flex-shrink-0 w-6 h-6 flex items-center justify-center text-[#f97316]"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg></div>`;
      if (ext === 'css') return `<div class="flex-shrink-0 w-6 h-6 flex items-center justify-center text-[#3b82f6]"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path></svg></div>`;
      if (ext === 'js' || ext === 'ts') return `<div class="flex-shrink-0 w-6 h-6 flex items-center justify-center text-[#eab308]"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg></div>`;
      return `<div class="flex-shrink-0 w-6 h-6 flex items-center justify-center text-[#64748b]"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg></div>`;
    }

    let codeEditor = null;
    function initCodeEditor() {
      if (codeEditor) return;
      const textarea = document.getElementById('editor-code-textarea');
      if (textarea) {
        codeEditor = CodeMirror.fromTextArea(textarea, {
          lineNumbers: true,
          theme: 'dracula',
          mode: 'htmlmixed',
          indentUnit: 4,
          lineWrapping: true,
          scrollbarStyle: 'native'
        });
        codeEditor.on('change', function() {
          if (typeof scheduleSecurityRescan === 'function') scheduleSecurityRescan();
          // Auto-save dengan debounce 800ms → trigger auto-deploy
          if (window._editorSaveTimer) clearTimeout(window._editorSaveTimer);
          window._editorSaveTimer = setTimeout(function() {
            if (!editingFileName || !codeEditor) return;
            var codeContent = codeEditor.getValue();
            var bytes = new Blob([codeContent]).size;
            var sizeStr = '0,00 B';
            if (bytes > 1024 * 1024) sizeStr = (bytes / (1024 * 1024)).toFixed(2) + ' MB';
            else if (bytes > 1024) sizeStr = (bytes / 1024).toFixed(1) + ' KB';
            else if (bytes > 0) sizeStr = bytes + ' B';
            if (!projectFilesData[currentFolderPath]) projectFilesData[currentFolderPath] = [];
            var itemIndex = projectFilesData[currentFolderPath].findIndex(function(i) { return i.type === 'file' && i.name === editingFileName; });
            if (itemIndex === -1) {
              for (var fp in projectFilesData) {
                if (Array.isArray(projectFilesData[fp])) {
                  var idx = projectFilesData[fp].findIndex(function(i) { return i.type === 'file' && i.name === editingFileName; });
                  if (idx !== -1) { currentFolderPath = fp; itemIndex = idx; break; }
                }
              }
            }
            if (itemIndex !== -1) {
              projectFilesData[currentFolderPath][itemIndex].content = codeContent;
              projectFilesData[currentFolderPath][itemIndex].size = sizeStr;
              saveData();
            }
          }, 800);
        });
      }
    }

    const pageMain = document.getElementById('page-main');
    const pageForm = document.getElementById('page-form');
    const pageProjectDetail = document.getElementById('page-project-detail');
    const pageFileEditor = document.getElementById('page-file-editor');
    const pageAnalytics = document.getElementById('page-analytics');
    
    const listContainer = document.getElementById('project-list');
    const emptyState = document.getElementById('empty-state');
    const searchInput = document.getElementById('search-input');
    const fileSearchInput = document.getElementById('file-search-input');

    const projectForm = document.getElementById('project-form');
    const btnDelete = document.getElementById('btn-delete');
    
    const idInput = document.getElementById('project-id');
    const nameInput = document.getElementById('project-name');
    const formViewTitle = document.getElementById('view-form-title');

    const step1Container = document.getElementById('step-1-container');
    const formActions = document.getElementById('form-actions');
    
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebarPanel = document.getElementById('sidebar-panel');
    let isSidebarOpen = false;

    function toggleSidebar() {
      isSidebarOpen = !isSidebarOpen;
      if (isSidebarOpen) {
        updateSidebarActiveState();
        sidebar.classList.remove('hidden');
        setTimeout(() => {
          sidebarOverlay.classList.remove('opacity-0');
          sidebarPanel.classList.remove('-translate-x-full');
        }, 10);
      } else {
        sidebarOverlay.classList.add('opacity-0');
        sidebarPanel.classList.add('-translate-x-full');
        setTimeout(() => {
          sidebar.classList.add('hidden');
        }, 300);
      }
    }

    function updateSidebarActiveState() {
      var params = new URLSearchParams(window.location.search);
      var path = params.get('p') || '/';
      var items = document.querySelectorAll('.sidebar-nav-item');
      items.forEach(function(btn) {
        var target = btn.getAttribute('data-sidebar-path');
        var isActive = (target === '/') ? (path === '/' || path === '') : path.indexOf(target) === 0;
        if (isActive) btn.classList.add('bg-gray-100');
        else btn.classList.remove('bg-gray-100');
      });
    }

    function sidebarNavigateToLastProject() {
      var recent = getRecentProjects();
      toggleSidebar();
      if (recent.length > 0) {
        setTimeout(function() { navigateTo('/proyek/' + recent[0].id); }, 300);
      } else {
        setTimeout(function() { navigateTo('/'); }, 300);
      }
    }

    function sidebarNavigate(path) {
      toggleSidebar();
      setTimeout(() => navigateTo(path), 300);
    }

    // === Recent Projects tracking ===
    function getRecentProjects() {
      try {
        var stored = localStorage.getItem('clincoo_recent_projects');
        return stored ? JSON.parse(stored) : [];
      } catch(e) { return []; }
    }

    function addRecentProject(id, name) {
      var recent = getRecentProjects().filter(function(p) { return p.id !== id; });
      recent.unshift({ id: id, name: name, ts: Date.now() });
      if (recent.length > 8) recent = recent.slice(0, 8);
      localStorage.setItem('clincoo_recent_projects', JSON.stringify(recent));
      renderSidebarProjects();
      updateAnalyticsProjectName();
    }

    function updateAnalyticsProjectName() {
      var el = document.getElementById('analytics-project-name');
      if (!el) return;
      var recent = getRecentProjects();
      if (recent.length > 0) {
        el.textContent = recent[0].name;
      } else {
        el.textContent = 'Proyek';
      }
    }

    function renderSidebarProjects() {
      var container = document.getElementById('sidebar-project-list');
      if (!container) return;
      var recent = getRecentProjects();
      if (!recent.length) {
        container.innerHTML = '<p class="text-xs text-gray-300 px-3 py-2">Belum ada proyek</p>';
        return;
      }
      container.innerHTML = recent.map(function(p) {
        return '<button onclick="sidebarNavigateProject(' + p.id + ')" class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 text-xs font-medium transition-colors text-left truncate" title="' + p.name + '">'
          + '<svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>'
          + '<span class="truncate">' + p.name + '</span>'
          + '</button>';
      }).join('');
    }

    function sidebarNavigateProject(id) {
      toggleSidebar();
      setTimeout(function() { navigateTo('/proyek/' + id); }, 300);
    }

    // === Project shortcut dropdown (analytics header) ===
    function toggleAnalyticsProjectDropdown(e) {
      if (e) e.stopPropagation();
      var dd = document.getElementById('analytics-project-dropdown');
      if (!dd) return;
      if (dd.classList.contains('hidden')) {
        renderAnalyticsProjectDropdown();
        dd.classList.remove('hidden');
        setTimeout(function() {
          document.addEventListener('click', closeAnalyticsProjectDropdown);
        }, 10);
      } else {
        dd.classList.add('hidden');
        document.removeEventListener('click', closeAnalyticsProjectDropdown);
      }
    }

    function closeAnalyticsProjectDropdown() {
      var dd = document.getElementById('analytics-project-dropdown');
      if (dd) dd.classList.add('hidden');
      document.removeEventListener('click', closeAnalyticsProjectDropdown);
    }

    function renderAnalyticsProjectDropdown() {
      var list = document.getElementById('analytics-project-list');
      if (!list) return;
      list.innerHTML = '';
      projects.forEach(function(p) {
        var btn = document.createElement('button');
        btn.className = 'w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors';
        btn.textContent = p.name;
        btn.onclick = function() {
          navigateTo('/proyek/' + p.id);
          closeAnalyticsProjectDropdown();
        };
        list.appendChild(btn);
      });
    }

    function navigateToProjectFromDropdown(id) {
      closeAnalyticsProjectDropdown();
      navigateTo('/proyek/' + id);
    }

    // === Chart info modal ===
    var _chartInfoData = {
      lineChart: { title: 'Trafik 7 Hari Terakhir', desc: 'Menampilkan total views harian dari seluruh situs selama 7 hari terakhir. Grafik ini membantu melihat tren kunjungan secara mingguan.', link: 'https://support.google.com/analytics/answer/9143408' },
      barChart: { title: 'Trafik Bulanan', desc: 'Menampilkan total views per bulan untuk melihat pola kunjungan jangka panjang dan perbandingan antar bulan.', link: 'https://support.google.com/analytics/answer/9143408' },
      pieChart: { title: 'Sumber Trafik', desc: 'Distribusi sumber kunjungan (direct, search, social, referral). Membantu memahami dari mana pengunjung datang.', link: 'https://support.google.com/analytics/answer/1033173' },
      doughnutChart: { title: 'Perangkat', desc: 'Tipe perangkat yang digunakan pengunjung (desktop, mobile, tablet). Penting untuk optimasi tampilan situs.', link: 'https://support.google.com/analytics/answer/9314517' },
      radarChart: { title: 'Bahasa', desc: 'Distribusi bahasa pengguna. Membantu menentukan bahasa mana yang perlu diprioritaskan untuk konten.', link: 'https://support.google.com/analytics/answer/10429670' },
      polarAreaChart: { title: 'Negara Asal', desc: 'Distribusi negara pengunjung. Menunjukkan wilayah geografis utama audiens situs.', link: 'https://support.google.com/analytics/answer/9314517' },
      scatterChart: { title: 'Trafik 24 Jam', desc: 'Views per jam dalam 24 jam terakhir. Membantu mengidentifikasi jam-jam puncak kunjungan.', link: 'https://support.google.com/analytics/answer/9143408' },
      bubbleChart: { title: 'Visitors x Views', desc: 'Korelasi antara jumlah pengunjung unik dan total views. Membantu memahami rasio views per pengunjung.', link: 'https://support.google.com/analytics/answer/9314517' },
      mixedChart: { title: 'Views vs Visitors', desc: 'Perbandingan harian antara page views dan unique visitors. Menunjukkan berapa banyak halaman dilihat per pengunjung.', link: 'https://support.google.com/analytics/answer/9143408' },
      horizontalBarChart: { title: 'Top Halaman', desc: 'Halaman paling banyak dilihat. Membantu mengidentifikasi konten paling populer di situs.', link: 'https://support.google.com/analytics/answer/1033961' }
    };

    var _chartInfoOpen = false;
    function showChartInfo(chartKey, e) {
      if (e) e.stopPropagation();
      var info = _chartInfoData[chartKey];
      if (!info) return;
      var popup = document.getElementById('chart-info-popup');
      if (!popup) return;
      if (_chartInfoOpen) { closeChartInfo(); return; }
      document.getElementById('chart-info-title').textContent = info.title;
      document.getElementById('chart-info-desc').textContent = info.desc;
      popup.classList.remove('hidden');
      _chartInfoOpen = true;
      if (e) {
        popup.style.top = (e.clientY + 8) + 'px';
        var leftPos = e.clientX - 224;
        if (leftPos < 10) leftPos = 10;
        popup.style.left = leftPos + 'px';
      }
      setTimeout(function() {
        document.addEventListener('click', closeChartInfo);
      }, 300);
    }

    function closeChartInfo() {
      var popup = document.getElementById('chart-info-popup');
      if (popup) popup.classList.add('hidden');
      document.removeEventListener('click', closeChartInfo);
      _chartInfoOpen = false;
    }

    var _domainInfoOpen = false;
    function showDomainInfo(e) {
      if (e) e.stopPropagation();
      var popup = document.getElementById('domain-info-popup');
      if (!popup) return;
      // If already open, close it (toggle behavior)
      if (_domainInfoOpen) { closeDomainInfo(); return; }
      // Update target CNAME sesuai project slug
      var proj = (typeof projects !== 'undefined') ? projects.find(function(p) { return p.id == currentProjectId; }) : null;
      var projName = proj ? proj.name : (currentProjectId || 'project');
      var projectSlug = projName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!projectSlug) projectSlug = 'clincoo-app';
      var targetSpan = document.getElementById('cname-target-value');
      if (targetSpan) targetSpan.textContent = projectSlug + '.pages.dev';
      popup.classList.remove('hidden');
      _domainInfoOpen = true;
      if (e) {
        popup.style.top = (e.clientY + 12) + 'px';
        var leftPos = e.clientX - 256;
        if (leftPos < 10) leftPos = 10;
        popup.style.left = leftPos + 'px';
      }
      // Delay adding close listener to avoid the same click closing it
      setTimeout(function() {
        document.addEventListener('click', closeDomainInfo);
      }, 300);
    }

    function closeDomainInfo() {
      var popup = document.getElementById('domain-info-popup');
      if (popup) popup.classList.add('hidden');
      _domainInfoOpen = false;
      document.removeEventListener('click', closeDomainInfo);
    }

    function navigateTo(path) {
      const url = new URL(window.location);
      if (path === '/' || path === '') url.searchParams.delete('p');
      else url.searchParams.set('p', path);
      window.history.pushState({}, '', url);
      handleRoute();
    }

    function handleRoute() {
      const params = new URLSearchParams(window.location.search);
      const path = params.get('p') || '/';
      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (path.startsWith('/tambah')) {
        setupFormPage(null);
        showPage(pageForm, [pageMain, pageProjectDetail, pageFileEditor]);
      } else if (path.startsWith('/edit/')) {
        const id = parseInt(path.replace('/edit/', ''));
        setupFormPage(id);
        showPage(pageForm, [pageMain, pageProjectDetail, pageFileEditor]);
      } else if (path.startsWith('/proyek/')) {
        const id = parseInt(path.replace('/proyek/', ''));
        setupDetailPage(id);
        showPage(pageProjectDetail, [pageMain, pageForm, pageFileEditor]);
      } else if (path.startsWith('/analytics')) {
        showPage(pageAnalytics, [pageMain, pageForm, pageProjectDetail, pageFileEditor]); updateAnalyticsProjectName();
        initAnalyticsCharts();
      } else if (path.startsWith('/editor')) {
        showPage(pageFileEditor, [pageMain, pageForm, pageProjectDetail]);
      } else {
        showPage(pageMain, [pageForm, pageProjectDetail, pageFileEditor, pageAnalytics]);
        applyFilters();
      }
    }

    window.addEventListener('popstate', handleRoute);

    function showPage(activePage, inactivePages) {
      inactivePages.forEach(page => {
        if(page) { page.classList.add('hidden'); page.classList.remove('page-active'); }
      });
      if(activePage) {
        activePage.classList.remove('hidden');
        setTimeout(() => activePage.classList.add('page-active'), 10);
      }
    }

    function setupFormPage(id) {
      projectForm.reset();
      idInput.value = '';
      
      const publicRadio = document.querySelector('input[name="project-visibility"][value="public"]');
      if (publicRadio) publicRadio.checked = true;
      
      showFormInput();
      
      if (id) {
        const project = projects.find(p => p.id === id);
        if (project) {
          formViewTitle.textContent = 'Edit proyek';
          idInput.value = project.id;
          nameInput.value = project.name;
          
          if (project.visibility === 'private') {
            const privateRadio = document.querySelector('input[name="project-visibility"][value="private"]');
            if (privateRadio) privateRadio.checked = true;
          }
          
          btnDelete.classList.remove('hidden');
        } else { navigateTo('/'); }
      } else {
        formViewTitle.textContent = 'Buat proyek baru';
        btnDelete.classList.add('hidden');
        // Show GitHub repo checkbox only if connected
        var ghContainer = document.getElementById('github-repo-checkbox-container');
        if (ghContainer) {
          if (getGithubToken()) {
            ghContainer.classList.remove('hidden');
          } else {
            ghContainer.classList.add('hidden');
          }
        }
      }
    }

    function setupDetailPage(id) {
      if (currentProjectId !== id) {
        currentFolderPath = 'root';
      }
      currentProjectId = id;
      // Ensure deploy status reflects THIS project, not a stale one
      renderDeployStatus();
      loadProjectFiles();
      if (fileSearchInput) fileSearchInput.value = '';
      modalAction = null;
      itemBeingRenamed = null;
      renderFileList();
      
      setTimeout(() => {
        const kodeBtn = document.querySelector('[data-tab="kode"]');
        if (kodeBtn) switchTab('kode', kodeBtn);
        if (typeof runSecurityScan === 'function') runSecurityScan(true);
      }, 50);

      const proj = projects.find(p => p.id === id);
      const nameEl = document.getElementById('current-project-name');
      if (nameEl && proj) {
        nameEl.textContent = proj.name;
      }
      if (proj) addRecentProject(id, proj.name);
    }

    function openFolder(folderPath) {
      currentFolderPath = folderPath;
      modalAction = null;
      itemBeingRenamed = null;
      if (fileSearchInput) fileSearchInput.value = '';
      renderFileList();
    }

    function navigateFolderUp() {
      if (currentFolderPath === 'root') return;
      const parts = currentFolderPath.split('/');
      parts.pop();
      currentFolderPath = parts.length === 0 ? 'root' : parts.join('/');
      renderFileList();
    }


    function renderFileList() {
      const container = document.getElementById('file-list-container');
      const breadcrumb = document.getElementById('file-breadcrumb');
      if (!container) return;

      const searchTerm = fileSearchInput ? fileSearchInput.value.toLowerCase().trim() : '';

      if (breadcrumb) {
        if (currentFolderPath === 'root') {
          breadcrumb.innerHTML = '';
        } else {
          const parts = currentFolderPath.split('/');
          let bcHtml = `<button onclick="openFolder('root')" class="text-gray-500 hover:text-black flex items-center gap-1 font-medium transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>Utama</button>`;
          let accumulatedPath = '';
          parts.forEach((p, index) => {
            accumulatedPath += (index === 0 ? '' : '/') + p;
            const isLast = index === parts.length - 1;
            bcHtml += `<span class="text-gray-300">/</span>`;
            if (isLast) { bcHtml += `<span class="text-black font-semibold">${p}</span>`; } 
            else { bcHtml += `<button onclick="openFolder('${accumulatedPath}')" class="text-gray-500 hover:text-black transition-colors">${p}</button>`; }
          });
          breadcrumb.innerHTML = bcHtml;
        }
      }

      let items = projectFilesData[currentFolderPath] || [];
      if (searchTerm) items = items.filter(item => item.name.toLowerCase().includes(searchTerm));
      // Sort: folders first, then files — both alphabetically
      items = items.slice().sort(function(a, b) {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      container.innerHTML = '';

      if (currentFolderPath !== 'root' && !searchTerm) {
        const backRow = document.createElement('div');
        backRow.className = 'flex items-center gap-3 py-2.5 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg px-2 -mx-2';
        backRow.onclick = navigateFolderUp;
        backRow.innerHTML = `<svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 17l-5-5m0 0l5-5m-5 5h12"></path></svg><span class="text-sm font-medium text-gray-600">Kembali</span>`;
        container.appendChild(backRow);
      }

      if (items.length === 0) {
        container.innerHTML += `<div class="py-12 text-center text-gray-400 text-sm">Tidak ada berkas atau folder di sini.</div>`;
        return;
      }

      items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-4 py-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50/80 transition-colors px-1 group';

        const safeName = item.name.replace(/'/g, "\\'");
        const actionBtnHTML = `<button onclick="event.stopPropagation(); openItemActionMenu(event, '${safeName}')" class="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-200 rounded-full transition-colors focus:outline-none opacity-0 group-hover:opacity-100 sm:opacity-100 item-action-btn"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg></button>`;

        if (item.type === 'folder') {
          const subItems = projectFilesData[item.path] || [];
          row.onclick = () => openFolder(item.path);
          row.innerHTML = `<div class="flex-shrink-0 w-6 h-6 flex items-center justify-center text-[#a0aec0]"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg></div><div class="flex-1 min-w-0"><h3 class="text-[#334155] font-medium text-[15px] leading-tight hover:text-black transition-colors truncate">${item.name}</h3><p class="text-gray-500 text-[12px] mt-0.5">Berkas (${subItems.length}) - <span class="text-[#16a34a]">Folder</span></p></div>${actionBtnHTML}`;
        } else {
          row.onclick = () => openFileInEditor(item.name);
          row.innerHTML = `${getFileIcon(item.name)}<div class="flex-1 min-w-0"><h3 class="text-[#334155] font-medium text-[15px] leading-tight hover:text-black transition-colors truncate">${item.name}</h3><p class="text-gray-500 text-[12px] mt-0.5">${item.size || '0,00 B'}</p></div>${actionBtnHTML}`;
        }
        container.appendChild(row);
      });
    }

    if (fileSearchInput) fileSearchInput.addEventListener('input', renderFileList);

    function openCreateModal(type) {
      const menu = document.getElementById('add-menu-dropdown');
      if(menu) menu.classList.add('hidden');
      
      modalAction = type === 'folder' ? 'create_folder' : 'create_file';
      
      const title = document.getElementById('input-modal-title');
      const label = document.getElementById('input-modal-label');
      const input = document.getElementById('modal-input-name');
      const typeContainer = document.getElementById('input-modal-type-container');
      const typeSelect = document.getElementById('modal-file-type');
      const errorEl = document.getElementById('input-modal-error');
      
      errorEl.classList.add('hidden');
      input.value = '';
      
      if (type === 'folder') {
        title.textContent = 'Buat Folder Baru';
        label.textContent = 'Nama Folder';
        input.placeholder = 'Misal: assets';
        typeContainer.classList.add('hidden');
      } else {
        title.textContent = 'Buat File Baru';
        label.textContent = 'Nama File';
        input.placeholder = 'Misal: index.html';
        typeContainer.classList.add('hidden');
        typeSelect.value = '';
      }
      
      showInputModal();
    }

    function triggerRename() {
      const menu = document.getElementById('item-action-menu');
      if (menu) menu.classList.add('hidden');
      
      modalAction = 'rename';
      itemBeingRenamed = activeItemName;
      
      const title = document.getElementById('input-modal-title');
      const label = document.getElementById('input-modal-label');
      const input = document.getElementById('modal-input-name');
      const typeContainer = document.getElementById('input-modal-type-container');
      const errorEl = document.getElementById('input-modal-error');
      
      errorEl.classList.add('hidden');
      title.textContent = 'Ganti Nama';
      label.textContent = 'Nama Baru';
      input.value = itemBeingRenamed;
      typeContainer.classList.add('hidden');
      
      showInputModal();
    }

    function showInputModal() {
      const overlay = document.getElementById('input-modal-overlay');
      const modal = document.getElementById('input-modal');
      overlay.classList.remove('hidden');
      setTimeout(() => {
        overlay.classList.remove('opacity-0');
        modal.classList.remove('opacity-0', 'scale-95');
        modal.classList.add('opacity-100', 'scale-100');
        
        const input = document.getElementById('modal-input-name');
        input.focus();
        if (modalAction === 'rename') {
           const item = (projectFilesData[currentFolderPath] || []).find(i => i.name === itemBeingRenamed);
           if(item && item.type === 'file' && input.value.includes('.')) {
              input.setSelectionRange(0, input.value.lastIndexOf('.'));
           } else {
              input.select();
           }
        }
      }, 10);
    }

    function closeInputModal() {
      const overlay = document.getElementById('input-modal-overlay');
      const modal = document.getElementById('input-modal');
      
      overlay.classList.add('opacity-0');
      modal.classList.remove('opacity-100', 'scale-100');
      modal.classList.add('opacity-0', 'scale-95');
      
      setTimeout(() => {
        overlay.classList.add('hidden');
        modalAction = null;
        itemBeingRenamed = null;
      }, 300);
    }

    function handleModalFileTypeChange(e) {
      const input = document.getElementById('modal-input-name');
      const ext = e.target.value;
      const baseName = input.value.replace(/\.[^.]+$/, '');
      input.value = baseName;
      input.placeholder = ext ? 'Nama file (akan jadi .' + ext + ')' : 'Nama file (tanpa ekstensi)';
    }

    function handleModalInputKeydown(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitInputModal();
      }
      if (e.key === 'Escape') closeInputModal();
    }

    function submitInputModal() {
      const input = document.getElementById('modal-input-name');
      const errorEl = document.getElementById('input-modal-error');
      let name = input.value.trim();
      
      if(!name) { 
         errorEl.textContent = "Nama tidak boleh kosong.";
         errorEl.classList.remove('hidden');
         return; 
      }
      
      const items = projectFilesData[currentFolderPath] || [];

      if (modalAction === 'create_file' || modalAction === 'create_folder') {
          if (modalAction === 'create_file') {
            if (!name.includes('.')) {
              var lowerName = name.toLowerCase();
              var autoExt = 'txt';
              if (lowerName === 'index' || lowerName === 'home' || lowerName === 'main') autoExt = 'html';
              else if (lowerName === 'style' || lowerName === 'styles' || lowerName === 'stylesheet') autoExt = 'css';
              else if (lowerName === 'script' || lowerName === 'app' || lowerName === 'main-js') autoExt = 'js';
              else if (lowerName === 'config' || lowerName === 'package') autoExt = 'json';
              else if (lowerName === 'readme' || lowerName === 'changelog') autoExt = 'md';
              else if (lowerName === 'server' || lowerName === 'api') autoExt = 'js';
              else if (lowerName === 'robots') autoExt = 'txt';
              else if (lowerName === 'sitemap') autoExt = 'xml';
              else if (lowerName === 'favicon') autoExt = 'svg';
              else if (lowerName === 'dockerfile' || lowerName === 'makefile') autoExt = '';
              if (autoExt) name = name + '.' + autoExt;
            }
          }
          
          const exists = items.some(item => item.name.toLowerCase() === name.toLowerCase());
          if (exists) {
             errorEl.textContent = "Nama sudah ada di direktori ini.";
             errorEl.classList.remove('hidden');
             return;
          }
          
          if (!projectFilesData[currentFolderPath]) projectFilesData[currentFolderPath] = [];

          if(modalAction === 'create_folder') {
            const newPath = currentFolderPath === 'root' ? name : currentFolderPath + '/' + name;
            projectFilesData[currentFolderPath].push({ type: 'folder', name: name, path: newPath, fileCount: 0, previewText: 'Folder' });
          } else {
            const ext = getFileExtension(name);
            const content = defaultTemplates[ext] || '';
            const bytes = new Blob([content]).size;
            let sizeStr = '0,00 B';
            if (bytes > 1024 * 1024) sizeStr = (bytes / (1024 * 1024)).toFixed(2) + ' MB';
            else if (bytes > 1024) sizeStr = (bytes / 1024).toFixed(1) + ' KB';
            else if (bytes > 0) sizeStr = bytes + ' B';

            const filePath = currentFolderPath === 'root' ? name : currentFolderPath + '/' + name;
            projectFilesData[currentFolderPath].push({ type: 'file', name: name, size: sizeStr, path: filePath, content: content });
          }
      } else if (modalAction === 'rename') {
          if (name === itemBeingRenamed) {
             closeInputModal();
             return;
          }
          if(items.find(i => i.name.toLowerCase() === name.toLowerCase())) {
             errorEl.textContent = "Nama sudah digunakan.";
             errorEl.classList.remove('hidden');
             return;
          }
          
          const itemIndex = items.findIndex(i => i.name === itemBeingRenamed);
          if(itemIndex !== -1) {
            const item = items[itemIndex];
            if(item.type === 'folder') {
              const oldPath = item.path;
              const newPath = currentFolderPath === 'root' ? name : currentFolderPath + '/' + name;
              item.name = name;
              item.path = newPath;
              
              const keysToUpdate = Object.keys(projectFilesData).filter(k => k === oldPath || k.startsWith(oldPath + '/'));
              keysToUpdate.forEach(key => {
                const newKey = newPath + key.substring(oldPath.length);
                projectFilesData[newKey] = projectFilesData[key];
                delete projectFilesData[key];
                projectFilesData[newKey].forEach(child => {
                  if (child.path.startsWith(oldPath + '/')) {
                    child.path = newPath + child.path.substring(oldPath.length);
                  }
                });
              });
            } else {
              item.name = name;
              item.path = currentFolderPath === 'root' ? name : currentFolderPath + '/' + name;
            }
          }
      }
      
      saveData();
      if (fileSearchInput) fileSearchInput.value = '';
      renderFileList();
      closeInputModal();

    }

    // Toast dihapus — web tidak menggunakan toast

    function showConfirmDeleteItem() {
      const menu = document.getElementById('item-action-menu');
      if (menu) menu.classList.add('hidden');
      if(!activeItemName) return;
      var itemName = activeItemName;
      var isFolder = (projectFilesData[currentFolderPath] || []).find(function(i) { return i.name === itemName && i.type === 'folder'; });
      var safeName = itemName.replace(/'/g, "\\'");
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4';
      modal.innerHTML = '<div class="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onclick="this.parentElement.remove()"></div>' +
        '<div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in">' +
        '<div class="flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mx-auto mb-4">' +
        '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>' +
        '</div>' +
        '<h3 class="text-lg font-bold text-gray-900 text-center mb-2">Hapus ' + (isFolder ? 'Folder' : 'File') + '</h3>' +
        '<p class="text-sm text-gray-500 text-center mb-6">Yakin ingin menghapus <span class="font-semibold text-gray-700">"' + itemName + '"</span>? ' + (isFolder ? 'Semua file di dalam folder ini akan dihapus.' : 'File ini akan dihapus permanen.') + '</p>' +
        '<div class="flex gap-3">' +
        '<button onclick="this.closest(\'.fixed\').remove()" class="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">Batal</button>' +
        '<button onclick="executeDeleteItem(\'' + safeName + '\', this)" class="flex-1 px-4 py-2.5 rounded-lg bg-red-500 text-sm font-semibold text-white hover:bg-red-600 transition-all">Hapus</button>' +
        '</div></div>';
      document.body.appendChild(modal);
    }

    function executeDeleteItem(itemName, btn) {
      btn.closest('.fixed').remove();
      var items = projectFilesData[currentFolderPath] || [];
      var itemIndex = items.findIndex(function(i) { return i.name === itemName; });
      if(itemIndex !== -1) {
        var item = items[itemIndex];
        if(item.type === 'folder') {
          var prefix = item.path;
          Object.keys(projectFilesData).forEach(function(key) {
            if (key === prefix || key.startsWith(prefix + '/')) {
              delete projectFilesData[key];
            }
          });
        }
        items.splice(itemIndex, 1);
      }
      saveData();
      renderFileList();

    }

    function triggerImport(type) {
      const menu = document.getElementById('add-menu-dropdown');
      if(menu) menu.classList.add('hidden');
      if (type === 'github') githubImportMode = 'files';
      if (type === 'file') {
        const input = document.getElementById('import-file-input');
        if (input) input.click();
      } else if (type === 'github') {
        openGithubModal();
      } else if (type === 'zip') {
        const input = document.getElementById('import-zip-input');
        if (input) input.click();
      }
    }

    function handleImportFiles(e) {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      Array.from(files).forEach(file => importSingleFile(file, currentFolderPath));
      e.target.value = '';
    }

    function importSingleFile(file, targetPath) {
      if (!projectFilesData[targetPath]) projectFilesData[targetPath] = [];
      const reader = new FileReader();
      reader.onload = function(event) {
        const content = event.target.result;
        let sizeStr = '0,00 B';
        if (file.size > 1024 * 1024) sizeStr = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
        else if (file.size > 1024) sizeStr = (file.size / 1024).toFixed(1) + ' KB';
        else if (file.size > 0) sizeStr = file.size + ' B';

        const filePath = targetPath === 'root' ? file.name : targetPath + '/' + file.name;
        const existingIndex = projectFilesData[targetPath].findIndex(i => i.name === file.name && i.type === 'file');
        
        if (existingIndex !== -1) {
          projectFilesData[targetPath][existingIndex].content = content;
          projectFilesData[targetPath][existingIndex].size = sizeStr;
        } else {
          projectFilesData[targetPath].push({ type: 'file', name: file.name, size: sizeStr, path: filePath, content: content });
        }
        saveData();
        if (targetPath === currentFolderPath || targetPath.startsWith(currentFolderPath)) renderFileList();
      };
      const type = getFileType(file.name);
      if (type === 'code') reader.readAsText(file);
      else reader.readAsDataURL(file);
    }

    function getGithubToken() {
      return localStorage.getItem('clincoo_github_token') || '';
    }

    async function autoCreateGithubRepo(projName, projId, isPrivate) {
      var token = getGithubToken();
      if (!token) return;
      var slug = projName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!slug) slug = 'clincoo-project';
      try {
        var res = await fetch('https://clincoo-deploy.clincoo.workers.dev/github/create-repo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-GitHub-Token': token },
          body: JSON.stringify({ name: slug, private: isPrivate, description: 'Created with Clincoo' })
        });
        var result = await res.json();
        if (result.success) {
          var repoInfo = result.data;
          // Save repo info for this project
          localStorage.setItem('clincoo_' + projId + '_github_repo', JSON.stringify({
            full_name: repoInfo.full_name,
            name: repoInfo.name,
            branch: repoInfo.default_branch || 'main',
            html_url: repoInfo.html_url
          }));
          if (typeof FB !== 'undefined') FB.set('clincoo_' + projId + '_github_repo', repoInfo);

        } else {
          console.warn('[Clincoo] Auto-create repo failed:', result.error);
        }
      } catch(e) {
        console.warn('[Clincoo] Auto-create repo error:', e.message);
      }
    }

    async function pushFilesToGithub(projId) {
      var token = getGithubToken();
      if (!token) return { success: false, error: 'Not connected to GitHub' };
      var repoInfoStr = localStorage.getItem('clincoo_' + projId + '_github_repo');
      if (!repoInfoStr) return { success: false, error: 'No GitHub repo linked' };
      var repoInfo = JSON.parse(repoInfoStr);
      var parts = repoInfo.full_name.split('/');
      var owner = parts[0];
      var repo = parts[1];
      var branch = repoInfo.branch || 'main';

      var storageKey = 'clincoo_' + projId + '_files';
      var localFiles = {};
      try { localFiles = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch(e) {}
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
      if (allFiles.length === 0) return { success: false, error: 'No files to push' };

      try {
        var res = await fetch('https://clincoo-deploy.clincoo.workers.dev/github/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-GitHub-Token': token },
          body: JSON.stringify({ owner: owner, repo: repo, branch: branch, files: allFiles, message: 'Update from Clincoo' })
        });
        var result = await res.json();
        return result;
      } catch(e) {
        return { success: false, error: e.message };
      }
    }

    function connectGithub() {
      var currentUrl = window.location.origin + window.location.pathname + window.location.search;
      window.location.href = 'https://clincoo-deploy.clincoo.workers.dev/github/auth?redirect=' + encodeURIComponent(currentUrl);
    }

    function disconnectGithub() {
      localStorage.removeItem('clincoo_github_token');
      showGithubConnectView();
    }

    function showGithubConnectView() {
      document.getElementById('github-connect-view').classList.remove('hidden');
      document.getElementById('github-repos-view').classList.add('hidden');
      document.getElementById('github-progress-view').classList.add('hidden');
    }

    function showGithubReposView() {
      document.getElementById('github-connect-view').classList.add('hidden');
      document.getElementById('github-repos-view').classList.remove('hidden');
      document.getElementById('github-progress-view').classList.add('hidden');
    }

    function showGithubProgressView() {
      document.getElementById('github-connect-view').classList.add('hidden');
      document.getElementById('github-repos-view').classList.add('hidden');
      document.getElementById('github-progress-view').classList.remove('hidden');
    }

    function openGithubModal() {
      var overlay = document.getElementById('github-modal-overlay');
      var modal = document.getElementById('github-modal');
      var errEl = document.getElementById('github-modal-error');
      if (!overlay) return;
      overlay.classList.remove('hidden');
      overlay.classList.add('opacity-100');
      overlay.classList.remove('opacity-0');
      modal.classList.remove('scale-95', 'opacity-0');
      modal.classList.add('scale-100', 'opacity-100');
      if (errEl) errEl.classList.add('hidden');
      if (getGithubToken()) {
        showGithubReposView();
        loadGithubRepos();
      } else {
        showGithubConnectView();
      }
    }

    function closeGithubModal() {
      var overlay = document.getElementById('github-modal-overlay');
      var modal = document.getElementById('github-modal');
      if (overlay) {
        overlay.classList.add('opacity-0');
        overlay.classList.remove('opacity-100');
        modal.classList.add('scale-95', 'opacity-0');
        modal.classList.remove('scale-100', 'opacity-100');
        setTimeout(function() { overlay.classList.add('hidden'); }, 300);
      }
    }

    async function loadGithubRepos() {
      var token = getGithubToken();
      var listEl = document.getElementById('github-repo-list');
      var errEl = document.getElementById('github-modal-error');
      if (!token) { showGithubConnectView(); return; }
      if (listEl) listEl.innerHTML = '<div class="flex items-center justify-center py-8 text-xs text-gray-400"><svg class="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>Memuat repository...</div>';
      try {
        var res = await fetch('https://clincoo-deploy.clincoo.workers.dev/github/repos', {
          headers: { 'X-GitHub-Token': token }
        });
        var resJson = await res.json();
        if (!resJson.success) {
          if (resJson.status === 401) {
            localStorage.removeItem('clincoo_github_token');
            showGithubConnectView();
            return;
          }
          throw new Error(resJson.error || 'Gagal memuat repository');
        }
        var repos = resJson.data;
        if (repos.length === 0) {
          if (listEl) listEl.innerHTML = '<p class="text-xs text-gray-400 text-center py-6">Tidak ada repository ditemukan</p>';
          return;
        }
        var html = '';
        for (var i = 0; i < repos.length; i++) {
          var r = repos[i];
          html += '<button onclick="startGithubImport(\'' + r.full_name + '\', \'' + (r.default_branch || 'main') + '\')" class="flex items-center gap-2.5 w-full px-3 py-2.5 text-left bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors focus:outline-none">' +
            '<svg class="w-4 h-4 text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-6M14 4h6m0 0v6m0-6L10 14"/></svg>' +
            '<div class="min-w-0 flex-1">' +
            '<p class="text-xs font-semibold text-gray-800 truncate">' + r.name + '</p>' +
            '<p class="text-xs text-gray-400 truncate">' + (r.description || r.full_name) + '</p>' +
            '</div>' +
            '</button>';
        }
        if (listEl) listEl.innerHTML = html;
      } catch(err) {
        if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
        if (listEl) listEl.innerHTML = '<p class="text-xs text-red-500 text-center py-4">' + err.message + '</p>';
      }
    }

    async function startGithubImport(fullName, branch) {
      var errEl = document.getElementById('github-modal-error');
      var progressEl = document.getElementById('github-import-progress');
      var token = getGithubToken();
      if (!token) { showGithubConnectView(); return; }
      var parts = fullName.split('/');
      var owner = parts[0];
      var repo = parts[1];
      var isProjectMode = (githubImportMode === 'project');
      showGithubProgressView();
      if (isProjectMode) {
        // Cek nama duplikat
        var repoNameExists = projects.some(function(p) { return p.name.toLowerCase() === repo.toLowerCase(); });
        if (repoNameExists) {
          if (errEl) { errEl.textContent = 'Proyek dengan nama "' + repo + '" sudah ada.'; errEl.classList.remove('hidden'); }
          showGithubReposView();
          return;
        }
        if (progressEl) progressEl.textContent = 'Membuat proyek baru...';
        // Create the project first
        var newId = projects.length > 0 ? Math.max.apply(null, projects.map(function(p) { return p.id; })) + 1 : 1;
        projects.push({ id: newId, name: repo, desc: 'Imported from ' + fullName, visibility: 'public' });
        currentProjectId = newId;
        projectFilesData = { 'root': [] };
        currentFolderPath = 'root';
        saveData();
      } else {
        if (progressEl) progressEl.textContent = 'Mengambil struktur repository...';
      }
      try {
        var treeRes = await fetch('https://clincoo-deploy.clincoo.workers.dev/github/tree?owner=' + encodeURIComponent(owner) + '&repo=' + encodeURIComponent(repo) + '&branch=' + encodeURIComponent(branch), {
          headers: { 'X-GitHub-Token': token }
        });
        var treeJson = await treeRes.json();
        if (!treeJson.success) throw new Error(treeJson.error || 'Repository tidak ditemukan');
        var treeData = treeJson.data;
        branch = treeJson.branch || branch;
        var files = (treeData.tree || []).filter(function(item) { return item.type === 'blob'; });
        if (files.length === 0) throw new Error('Tidak ada file di repository');
        if (progressEl) progressEl.textContent = '0/' + files.length + ' file...';
        var importedCount = 0;
        var batchSize = 5;
        for (var i = 0; i < files.length; i++) {
          var filePath = files[i].path;
          var pathParts = filePath.split('/');
          var fileName = pathParts.pop();
          var currentPathIter = 'root';
          for (var j = 0; j < pathParts.length; j++) {
            var part = pathParts[j];
            if (!projectFilesData[currentPathIter]) projectFilesData[currentPathIter] = [];
            var existingFolder = projectFilesData[currentPathIter].find(function(item) { return item.type === 'folder' && item.name === part; });
            var newPath = currentPathIter === 'root' ? part : currentPathIter + '/' + part;
            if (!existingFolder) {
              projectFilesData[currentPathIter].push({ type: 'folder', name: part, path: newPath, fileCount: 0, previewText: 'Folder' });
            }
            currentPathIter = newPath;
          }
          var rawUrl = 'https://clincoo-deploy.clincoo.workers.dev/github/file?owner=' + encodeURIComponent(owner) + '&repo=' + encodeURIComponent(repo) + '&branch=' + encodeURIComponent(branch) + '&path=' + encodeURIComponent(filePath) + '&token=' + encodeURIComponent(token);
          var fileRes = await fetch(rawUrl);
          if (!fileRes.ok) continue;
          var fileType = getFileType(fileName);
          var content;
          if (fileType === 'code') {
            content = await fileRes.text();
          } else {
            var blob = await fileRes.blob();
            content = await new Promise(function(resolve) {
              var r = new FileReader();
              r.onload = function(ev) { resolve(ev.target.result); };
              r.readAsDataURL(blob);
            });
          }
          if (!projectFilesData[currentPathIter]) projectFilesData[currentPathIter] = [];
          var sizeStr = '0,00 B';
          var rawSize = content.length;
          if (rawSize > 1024 * 1024) sizeStr = (rawSize / (1024 * 1024)).toFixed(2) + ' MB';
          else if (rawSize > 1024) sizeStr = (rawSize / 1024).toFixed(1) + ' KB';
          else if (rawSize > 0) sizeStr = rawSize + ' B';
          var fullPath = currentPathIter === 'root' ? fileName : currentPathIter + '/' + fileName;
          var existingIndex = projectFilesData[currentPathIter].findIndex(function(item) { return item.name === fileName && item.type === 'file'; });
          if (existingIndex !== -1) {
            projectFilesData[currentPathIter][existingIndex].content = content;
            projectFilesData[currentPathIter][existingIndex].size = sizeStr;
          } else {
            projectFilesData[currentPathIter].push({ type: 'file', name: fileName, size: sizeStr, path: fullPath, content: content });
          }
          importedCount++;
          if (progressEl) progressEl.textContent = importedCount + '/' + files.length + ' file...';
          if (importedCount % batchSize === 0) {
            saveData();
            renderFileList();
          }
        }
        saveData();
        renderFileList();
        if (progressEl) progressEl.textContent = 'Selesai! ' + importedCount + ' file diimport.';
        // Force a second save to ensure localStorage persistence
        setTimeout(function() {
          localStorage.setItem('clincoo_' + currentProjectId + '_files', JSON.stringify(projectFilesData));
          renderFileList();
        }, 100);
        setTimeout(function() {
          closeGithubModal();
          if (isProjectMode) {
            githubImportMode = 'files';
            navigateTo('/proyek/' + currentProjectId);
          }
        }, 1500);
      } catch(err) {
        console.error('[Clincoo GitHub] Error:', err.message);
        if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
        showGithubReposView();
      }
    }

    // Detect github_token from URL after OAuth callback
    (function() {
      var params = new URLSearchParams(window.location.search);
      var ghToken = params.get('github_token');
      if (ghToken) {
        localStorage.setItem('clincoo_github_token', ghToken);
        params.delete('github_token');
        var newUrl = window.location.pathname;
        if (params.toString()) newUrl += '?' + params.toString();
        window.history.replaceState({}, '', newUrl);
      }
    })();

    async function handleImportZip(e) {
      const file = e.target.files[0];
      if (!file) return;
      if (typeof JSZip === 'undefined') {
        alert('Library JSZip belum dimuat. Refresh halaman dan coba lagi.');
        e.target.value = '';
        return;
      }
      try {
        const zip = await JSZip.loadAsync(file);
        const entries = Object.keys(zip.files);
        let importedCount = 0;
        for (const entryPath of entries) {
          const zipEntry = zip.files[entryPath];
          if (zipEntry.dir) continue;
          const parts = entryPath.split('/').filter(p => p.length > 0);
          if (parts.length === 0) continue;
          const fileName = parts.pop();
          let currentPathIter = currentFolderPath;
          for (const part of parts) {
            if (!projectFilesData[currentPathIter]) projectFilesData[currentPathIter] = [];
            const existingFolder = projectFilesData[currentPathIter].find(i => i.type === 'folder' && i.name === part);
            const newPath = currentPathIter === 'root' ? part : currentPathIter + '/' + part;
            if (!existingFolder) {
              projectFilesData[currentPathIter].push({ type: 'folder', name: part, path: newPath, fileCount: 0, previewText: 'Folder' });
            }
            currentPathIter = newPath;
          }
          const fileType = getFileType(fileName);
          let content;
          if (fileType === 'code') {
            content = await zipEntry.async('text');
          } else {
            const blob = await zipEntry.async('blob');
            content = await new Promise(resolve => {
              const r = new FileReader();
              r.onload = ev => resolve(ev.target.result);
              r.readAsDataURL(blob);
            });
          }
          if (!projectFilesData[currentPathIter]) projectFilesData[currentPathIter] = [];
          let sizeStr = '0,00 B';
          const rawSize = content.length;
          if (rawSize > 1024 * 1024) sizeStr = (rawSize / (1024 * 1024)).toFixed(2) + ' MB';
          else if (rawSize > 1024) sizeStr = (rawSize / 1024).toFixed(1) + ' KB';
          else if (rawSize > 0) sizeStr = rawSize + ' B';
          const filePath = currentPathIter === 'root' ? fileName : currentPathIter + '/' + fileName;
          const existingIndex = projectFilesData[currentPathIter].findIndex(i => i.name === fileName && i.type === 'file');
          if (existingIndex !== -1) {
            projectFilesData[currentPathIter][existingIndex].content = content;
            projectFilesData[currentPathIter][existingIndex].size = sizeStr;
          } else {
            projectFilesData[currentPathIter].push({ type: 'file', name: fileName, size: sizeStr, path: filePath, content: content });
          }
          importedCount++;
          if (importedCount % 5 === 0) {
            saveData();
            renderFileList();
          }
        }
        saveData();
        renderFileList();
        console.log('[Clincoo ZIP] ' + importedCount + ' file(s) imported from ZIP');
      } catch(err) {
        console.error('[Clincoo ZIP] Error:', err.message);
        alert('Gagal membaca ZIP: ' + err.message);
      }
      e.target.value = '';
    }

    var _editorPreviewMode = false; // false = code, true = preview

    function toggleEditorPreview() {
      _editorPreviewMode = !_editorPreviewMode;
      var codeContainer = document.getElementById('editor-code-container');
      var previewContainer = document.getElementById('editor-preview-container');
      var label = document.getElementById('editor-preview-label');
      if (_editorPreviewMode) {
        // Show preview
        if (codeContainer) codeContainer.classList.add('hidden');
        if (previewContainer) previewContainer.classList.remove('hidden');
        if (label) label.textContent = 'Code';
        updateEditorPreview();
      } else {
        // Show code
        if (codeContainer) codeContainer.classList.remove('hidden');
        if (previewContainer) previewContainer.classList.add('hidden');
        if (label) label.textContent = 'Preview';
      }
    }

    function updateEditorPreview() {
      var iframe = document.getElementById('editor-preview-iframe');
      if (!iframe) return;
      var items = projectFilesData[currentFolderPath] || [];
      var fileObj = items.find(i => i.type === 'file' && i.name === editingFileName);
      var htmlContent = fileObj ? (fileObj.content || '') : '';
      iframe.srcdoc = htmlContent;
    }

    function openFileInEditor(filename) {
      editingFileName = filename;
      _editorPreviewMode = false;
      const items = projectFilesData[currentFolderPath] || [];
      const fileObj = items.find(i => i.type === 'file' && i.name === filename);
      const fileType = getFileType(filename);
      const ext = getFileExtension(filename);

      const labelEl = document.getElementById('editor-filename-label');
      const iconEl = document.getElementById('editor-file-icon');
      if (labelEl) labelEl.textContent = filename;
      if (iconEl) iconEl.innerHTML = getFileIcon(filename);

      const codeContainer = document.getElementById('editor-code-container');
      const audioContainer = document.getElementById('editor-audio-container');
      const videoContainer = document.getElementById('editor-video-container');
      const imageContainer = document.getElementById('editor-image-container');
      const previewContainer = document.getElementById('editor-preview-container');
      const previewToggleBtn = document.getElementById('editor-preview-toggle');

      codeContainer.classList.add('hidden'); audioContainer.classList.add('hidden');
      videoContainer.classList.add('hidden'); imageContainer.classList.add('hidden');
      if (previewContainer) previewContainer.classList.add('hidden');

      const audioPlayer = document.getElementById('audio-player');
      const videoPlayer = document.getElementById('video-player');
      if (audioPlayer) audioPlayer.pause();
      if (videoPlayer) videoPlayer.pause();

      if (previewToggleBtn) { previewToggleBtn.classList.add('hidden'); previewToggleBtn.classList.remove('flex'); }
      if (fileType === 'audio') {
        audioContainer.classList.remove('hidden');
        if (audioPlayer) { audioPlayer.src = fileObj && fileObj.content ? fileObj.content : ''; audioPlayer.load(); }
      } else if (fileType === 'video') {
        videoContainer.classList.remove('hidden');
        if (videoPlayer) { videoPlayer.src = fileObj && fileObj.content ? fileObj.content : ''; videoPlayer.load(); }
      } else if (fileType === 'image') {
        imageContainer.classList.remove('hidden');
        const img = document.getElementById('image-preview');
        if (img) img.src = fileObj && fileObj.content ? fileObj.content : '';
      } else {
        codeContainer.classList.remove('hidden');
        initCodeEditor();
        let mode = 'htmlmixed';
        // Show preview toggle only for HTML files
        if (previewToggleBtn) {
          if (filename.match(/\.html?$/i)) {
            previewToggleBtn.classList.remove('hidden');
            previewToggleBtn.classList.add('flex');
          } else {
            previewToggleBtn.classList.add('hidden');
            previewToggleBtn.classList.remove('flex');
          }
        }
        if (ext === 'js' || ext === 'json' || ext === 'ts' || ext === 'jsx') mode = 'javascript';
        else if (ext === 'css') mode = 'css';
        else if (ext === 'py' || ext === 'python') mode = 'python';
        if (codeEditor) {
          codeEditor.setOption('mode', mode);
          codeEditor.setValue(fileObj ? (fileObj.content || '') : '');
          setTimeout(() => codeEditor.refresh(), 50);
        }
      }
      navigateTo('/editor');
    }

    // Auto-update preview on code change (debounced)
    var _previewUpdateTimer = null;
    document.addEventListener('input', function(e) {
      if (_editorPreviewMode && e.target && e.target.closest && e.target.closest('.CodeMirror')) {
        clearTimeout(_previewUpdateTimer);
        _previewUpdateTimer = setTimeout(function() {
          updateEditorPreview();
        }, 800);
      }
    });

    function navigateBackFromEditor() {
      if (editingFileName) {
        const fileType = getFileType(editingFileName);
        if (fileType === 'code' && codeEditor) {
          const codeContent = codeEditor.getValue();
          const bytes = new Blob([codeContent]).size;
          let sizeStr = '0,00 B';
          if (bytes > 1024 * 1024) sizeStr = (bytes / (1024 * 1024)).toFixed(2) + ' MB';
          else if (bytes > 1024) sizeStr = (bytes / 1024).toFixed(1) + ' KB';
          else if (bytes > 0) sizeStr = bytes + ' B';

          if (!projectFilesData[currentFolderPath]) projectFilesData[currentFolderPath] = [];
          let itemIndex = projectFilesData[currentFolderPath].findIndex(i => i.type === 'file' && i.name === editingFileName);
          if (itemIndex === -1) {
            for (const fp in projectFilesData) {
              if (Array.isArray(projectFilesData[fp])) {
                const idx = projectFilesData[fp].findIndex(i => i.type === 'file' && i.name === editingFileName);
                if (idx !== -1) { currentFolderPath = fp; itemIndex = idx; break; }
              }
            }
          }
          if (itemIndex !== -1) {
            projectFilesData[currentFolderPath][itemIndex].content = codeContent;
            projectFilesData[currentFolderPath][itemIndex].size = sizeStr;
            saveData();
          }
        }
        const audioPlayer = document.getElementById('audio-player');
        if (audioPlayer) { audioPlayer.pause(); audioPlayer.src = ''; }
        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer) { videoPlayer.pause(); videoPlayer.src = ''; }
      }
      editingFileName = null;
      navigateTo('/proyek/' + currentProjectId);
      renderFileList();
    }

    function triggerDownload() {
      const menu = document.getElementById('item-action-menu');
      if (menu) menu.classList.add('hidden');
      const item = (projectFilesData[currentFolderPath] || []).find(i => i.name === activeItemName);
      if(!item || item.type !== 'file') return;
      const a = document.createElement('a');
      if (item.content.startsWith('http') || item.content.startsWith('data:') || item.content.startsWith('blob:')) {
        a.href = item.content;
      } else {
        const blob = new Blob([item.content], { type: 'text/plain' });
        a.href = URL.createObjectURL(blob);
      }
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    async function triggerZip() {
      const menu = document.getElementById('item-action-menu');
      if (menu) menu.classList.add('hidden');
      const item = (projectFilesData[currentFolderPath] || []).find(i => i.name === activeItemName);
      if(!item || typeof JSZip === 'undefined') return;

      const zip = new JSZip();
      if (item.type === 'file') {
        let contentData = item.content;
        if (contentData.startsWith('http') || contentData.startsWith('blob:') || contentData.startsWith('data:')) {
          try { const response = await fetch(contentData); contentData = await response.blob(); } catch (e) {}
        }
        zip.file(item.name, contentData);
      } else if (item.type === 'folder') {
        await addFolderToZipAsync(zip.folder(item.name), item.path);
      }

      zip.generateAsync({type:"blob"}).then(function(content) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = item.name + '.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }

    async function addFolderToZipAsync(zipFolder, folderPath) {
      const items = projectFilesData[folderPath] || [];
      for (let child of items) {
        if (child.type === 'file') {
          let contentData = child.content;
          if (contentData.startsWith('http') || contentData.startsWith('blob:') || contentData.startsWith('data:')) {
            try { const response = await fetch(contentData); contentData = await response.blob(); } catch(e){}
          }
          zipFolder.file(child.name, contentData);
        } else if (child.type === 'folder') {
          await addFolderToZipAsync(zipFolder.folder(child.name), child.path);
        }
      }
    }

    function showFormInput() {
      isSaving = false;
      step1Container.classList.remove('hidden');
      formActions.classList.remove('hidden');
      const btnSubmit = document.getElementById('btn-submit-next');
      if (btnSubmit) {
        btnSubmit.textContent = 'Simpan Proyek';
        btnSubmit.disabled = false;
        btnSubmit.classList.remove('opacity-70', 'cursor-not-allowed');
      }
    }

    function showLoading() {
      isSaving = true;
      const btnSubmit = document.getElementById('btn-submit-next');
      if (btnSubmit) {
        btnSubmit.textContent = 'Menyimpan...';
        btnSubmit.disabled = true;
        btnSubmit.classList.add('opacity-70', 'cursor-not-allowed');
      }
    }

    function handleFormSubmit(e) {
      e.preventDefault(); 
      if(isSaving) return;
      showLoading();
      setTimeout(() => executeSaveProject(), 400);
    }

    function executeSaveProject() {
      const id = idInput.value;
      const name = nameInput.value.trim();
      const desc = "Tanpa keterangan";
      
      const visibilityInput = document.querySelector('input[name="project-visibility"]:checked');
      const visibility = visibilityInput ? visibilityInput.value : 'public';
      
      // Cek nama duplikat untuk proyek baru
      if (!id) {
        var nameExists = projects.some(function(p) { return p.name.toLowerCase() === name.toLowerCase(); });
        if (nameExists) {
          isSaving = false;
          var btn = document.getElementById('btn-submit-next');
          if (btn) { btn.textContent = 'Lanjut'; btn.disabled = false; btn.classList.remove('opacity-70', 'cursor-not-allowed'); }

          nameInput.focus();
          nameInput.classList.add('border-red-500');
          setTimeout(function() { nameInput.classList.remove('border-red-500'); }, 3000);
          return;
        }
      }
      
      if (id) {
        const index = projects.findIndex(p => p.id == parseInt(id));
        if (index !== -1) projects[index] = { ...projects[index], name, desc, visibility };
      } else {
        let newId = Date.now();
        // Clear any stale deploy keys for this ID
        localStorage.removeItem('clincoo_' + newId + '_deploy_site');
        localStorage.removeItem('clincoo_' + newId + '_deploy_domain');
        localStorage.removeItem('clincoo_' + newId + '_deploy_branch');
        localStorage.removeItem('clincoo_' + newId + '_deploy_https');
        localStorage.removeItem('clincoo_' + newId + '_cf_project');
        // Clean up any stale D1 data for this ID
        if (typeof _api === 'function') {
          _api('DELETE', '/api/kv/clincoo_' + newId + '_files');
        }
        localStorage.removeItem('clincoo_' + newId + '_deploy_branch');
        localStorage.removeItem('clincoo_' + newId + '_deploy_https');
        projects.push({ id: newId, name, desc, visibility });
        currentProjectId = newId;
        projectFilesData = { 'root': [] };
        localStorage.setItem('clincoo_' + newId + '_files', JSON.stringify(projectFilesData));
        // Auto-create GitHub repo if connected and checkbox is checked
        var ghCheckbox = document.getElementById('create-github-repo');
        var ghContainer = document.getElementById('github-repo-checkbox-container');
        if (getGithubToken() && ghCheckbox && ghCheckbox.checked) {
          autoCreateGithubRepo(name, newId, visibility === 'private');
        }
      }
      saveData();
      navigateTo('/');
    }

    function confirmDelete() {
      const targetId = parseInt(idInput.value);
      if (targetId) {
        var projToDelete = projects.find(p => p.id === targetId);
        var projName = projToDelete ? projToDelete.name : '';
        // Delete GitHub repo if linked
        var repoInfoStr = localStorage.getItem('clincoo_' + targetId + '_github_repo');
        if (repoInfoStr && getGithubToken()) {
          deleteGithubRepoForProject(targetId);
        }
        localStorage.removeItem('clincoo_' + targetId + '_github_repo');
        projects = projects.filter(p => p.id !== targetId);
        localStorage.removeItem('clincoo_' + targetId + '_files');
        localStorage.removeItem('clincoo_' + targetId + '_deploy_site');
        localStorage.removeItem('clincoo_' + targetId + '_deploy_domain');
        localStorage.removeItem('clincoo_' + targetId + '_deploy_branch');
        localStorage.removeItem('clincoo_' + targetId + '_deploy_https');
        localStorage.removeItem('clincoo_' + targetId + '_security_findings');
        localStorage.removeItem('clincoo_' + targetId + '_cf_project');
        localStorage.removeItem('clincoo_' + targetId + '_env_variables');
        saveData();
        navigateTo('/');
        // Deploy 404 page to overwrite old content before deletion
        if (projName) {
          var projectSlug = projName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          if (projectSlug) deploy404Page(projectSlug);
        }
        if (typeof _deleteProjectFromD1 === 'function') _deleteProjectFromD1(targetId, projName);
      }
    }

    let projectActionMenuTargetId = null;

    function toggleProjectActionMenu(e, projectId) {
      e.stopPropagation();
      const menu = document.getElementById('project-action-menu');
      if (menu.classList.contains('hidden')) {
        projectActionMenuTargetId = projectId;
        menu.classList.remove('hidden');
        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.left = (rect.right - 176) + 'px';
      } else {
        menu.classList.add('hidden');
        projectActionMenuTargetId = null;
      }
    }

    function editProjectFromMenu() {
      const menu = document.getElementById('project-action-menu');
      menu.classList.add('hidden');
      if (projectActionMenuTargetId) {
        navigateTo('/edit/' + projectActionMenuTargetId);
        projectActionMenuTargetId = null;
      }
    }

    function deleteProjectFromMenu() {
      const menu = document.getElementById('project-action-menu');
      menu.classList.add('hidden');
      if (projectActionMenuTargetId) {
        const projectId = projectActionMenuTargetId;
        projectActionMenuTargetId = null;
        const project = projects.find(p => p.id === projectId);
        const projectName = project ? project.name : 'proyek ini';
        showConfirmDeleteProject(projectId, projectName);
      }
    }

    function showConfirmDeleteProject(projectId, projectName) {
      var hasGithubRepo = !!localStorage.getItem('clincoo_' + projectId + '_github_repo');
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4';
      modal.innerHTML = `
        <div class="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onclick="this.parentElement.remove()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-fade-in">
          <div class="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <h3 class="text-lg font-bold text-gray-900">Hapus Proyek</h3>
            <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600 focus:outline-none p-1.5 rounded-full hover:bg-gray-100 transition-colors">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div class="p-6">
            <div class="flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <p class="text-sm text-gray-500 text-center mb-6">Yakin ingin menghapus <span class="font-semibold text-gray-700">"${projectName}"</span>? Semua file dan data akan dihapus permanen.</p>
            ` + (hasGithubRepo ? `
            <label class="flex items-center gap-2 cursor-pointer select-none mb-4 justify-center">
              <input type="checkbox" id="delete-github-repo-${projectId}" class="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-0 focus:ring-offset-0">
              <span class="text-sm text-gray-700">Hapus juga repo GitHub</span>
            </label>
            ` : '') + `
          </div>
          <div class="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors focus:outline-none shadow-sm">Batal</button>
            <button onclick="executeDeleteProject(${projectId}, this)" class="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 shadow-sm transition-colors focus:outline-none">Hapus</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    function executeDeleteProject(projectId, btn) {
      // Check GitHub delete checkbox
      var ghCheckbox = document.getElementById('delete-github-repo-' + projectId);
      var deleteGithubRepo = ghCheckbox && ghCheckbox.checked;
      btn.closest('.fixed').remove();
      var projToDelete = projects.find(p => p.id === projectId);
      var projName = projToDelete ? projToDelete.name : '';
      // Delete GitHub repo if checkbox is checked
      if (deleteGithubRepo) {
        deleteGithubRepoForProject(projectId);
      }
      localStorage.removeItem('clincoo_' + projectId + '_github_repo');
      projects = projects.filter(p => p.id !== projectId);
      localStorage.removeItem('clincoo_' + projectId + '_files');
      localStorage.removeItem('clincoo_' + projectId + '_deploy_site');
      localStorage.removeItem('clincoo_' + projectId + '_deploy_domain');
      localStorage.removeItem('clincoo_' + projectId + '_deploy_branch');
      localStorage.removeItem('clincoo_' + projectId + '_deploy_https');
      localStorage.removeItem('clincoo_' + projectId + '_security_findings');
      localStorage.removeItem('clincoo_' + projectId + '_cf_project');
      localStorage.removeItem('clincoo_' + projectId + '_env_variables');
      saveData();
      applyFilters();
      // Deploy 404 page to overwrite old content before deletion
      if (projName) {
        var projectSlug = projName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (projectSlug) deploy404Page(projectSlug);
      }
      if (typeof _deleteProjectFromD1 === 'function') _deleteProjectFromD1(projectId, projName);
    }

    async function deleteGithubRepoForProject(projectId) {
      var repoInfoStr = localStorage.getItem('clincoo_' + projectId + '_github_repo');
      if (!repoInfoStr) return;
      var token = getGithubToken();
      if (!token) return;
      try {
        var repoInfo = JSON.parse(repoInfoStr);
        var parts = repoInfo.full_name.split('/');
        var owner = parts[0];
        var repo = parts[1];
        var res = await fetch('https://api.github.com/repos/' + owner + '/' + repo, {
          method: 'DELETE',
          headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Clincoo-App' }
        });
        if (res.status === 204) {
          console.log('[Clincoo] GitHub repo deleted:', repoInfo.full_name);
        } else {
          console.warn('[Clincoo] GitHub repo delete failed:', res.status);
        }
      } catch(e) {
        console.warn('[Clincoo] GitHub repo delete error:', e.message);
      }
    }

    document.addEventListener('click', function(e) {
      var pMenu = document.getElementById('project-action-menu');
      if (pMenu && !pMenu.classList.contains('hidden')) {
        if (!pMenu.contains(e.target) && !e.target.closest('[onclick*="toggleProjectActionMenu"]')) {
          pMenu.classList.add('hidden');
          projectActionMenuTargetId = null;
        }
      }
      var iMenu = document.getElementById('item-action-menu');
      if (iMenu && !iMenu.classList.contains('hidden')) {
        if (!iMenu.contains(e.target) && !e.target.closest('[onclick*="openItemActionMenu"]') && !e.target.closest('[onclick*="triggerRename"]') && !e.target.closest('[onclick*="triggerDownload"]') && !e.target.closest('[onclick*="triggerZip"]') && !e.target.closest('[onclick*="showConfirmDeleteItem"]')) {
          iMenu.classList.add('hidden');
        }
      }
      var npMenu = document.getElementById('new-project-dropdown');
      if (npMenu && !npMenu.classList.contains('hidden')) {
        if (!npMenu.contains(e.target) && !e.target.closest('[onclick*="toggleNewProjectMenu"]')) {
          npMenu.classList.add('hidden');
        }
      }
      var aMenu = document.getElementById('add-menu-dropdown');
      if (aMenu && !aMenu.classList.contains('hidden')) {
        if (!aMenu.contains(e.target) && !e.target.closest('[onclick*="toggleAddMenu"]')) {
          aMenu.classList.add('hidden');
        }
      }
    });

    function renderProjects() {
      if(!listContainer) return;
      listContainer.innerHTML = '';
      if (filteredProjects.length === 0) {
        emptyState.classList.remove('hidden');
      } else {
        emptyState.classList.add('hidden');
        filteredProjects.forEach(project => {
          const isPrivate = project.visibility === 'private';
          const padlockIcon = isPrivate ? `<div class="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-gray-100" title="Private Project"><svg class="w-3.5 h-3.5 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" /></svg></div>` : '';
          
          const item = document.createElement('div');
          item.className = 'group flex items-center p-3.5 sm:p-4 bg-white rounded-2xl border border-gray-200/80 hover:border-gray-300 hover:shadow-md transition-all duration-200 cursor-pointer w-full';
          item.onclick = (e) => { if (!e.target.closest('button') && !e.target.closest('a')) navigateTo('/proyek/' + project.id); };
          
          item.innerHTML = `
            <div class="w-12 h-12 flex-shrink-0 flex items-center justify-center relative bg-white rounded-xl border border-gray-100 p-2 mr-4 transition-colors">
              <img src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2032%2032%22%3E%0A%20%20%0A%20%20%3Ccircle%20cx%3D%2216%22%20cy%3D%2216%22%20r%3D%2216%22%20fill%3D%22%23ffffff%22%2F%3E%0A%20%20%3Cg%20fill%3D%22%23000000%22%3E%0A%20%20%20%20%3Cpath%20d%3D%22M10%2016C7%2010%209%207%2012%207C14%207%2015%2011%2013%2016Z%22%2F%3E%3Cpath%20d%3D%22M12%209C10.5%2011%2011%2013%2012%2014.5C13%2013%2013.5%2011%2012%209Z%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.25%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M22%2016C25%2010%2023%207%2020%207C18%207%2017%2011%2019%2016Z%22%2F%3E%3Cpath%20d%3D%22M20%209C21.5%2011%2021%2013%2020%2014.5C19%2013%2018.5%2011%2020%209Z%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.25%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M16%2027C24%2027%2028%2022.5%2028%2017C28%2012.5%2021%2011.5%2016%2011.5C11%2011.5%204%2012.5%204%2017C4%2022.5%208%2027%2016%2027Z%22%2F%3E%0A%20%20%3C%2Fg%3E%0A%20%20%3Ccircle%20cx%3D%2212.5%22%20cy%3D%2217%22%20r%3D%221.5%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.6%22%2F%3E%3Ccircle%20cx%3D%2219.5%22%20cy%3D%2217%22%20r%3D%221.5%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.6%22%2F%3E%3Cpolygon%20points%3D%2216%2C20%2015%2C18.5%2017%2C18.5%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.5%22%2F%3E%0A%3C%2Fsvg%3E" alt="App Logo" class="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition-opacity">
              ${padlockIcon}
            </div>
            <div class="flex flex-col flex-1 min-w-0">
              <span class="text-[15px] font-semibold text-gray-900 truncate">${project.name}</span>
              <span class="text-xs text-gray-500 truncate mt-0.5">${project.desc || 'Tanpa keterangan'}</span>
            </div>
            <button onclick="toggleProjectActionMenu(event, ${project.id})" class="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Aksi proyek">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

          `;
          listContainer.appendChild(item);
        });
      }
    }

    function applyFilters() {
      const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
      if (searchTerm) {
        filteredProjects = projects.filter(p => p.name.toLowerCase().includes(searchTerm));
      } else {
        filteredProjects = [...projects];
      }
      renderProjects();
    }

    if (searchInput) {
      searchInput.addEventListener('input', applyFilters);
    }

    function toggleProjectDropdown(e) {
      e.stopPropagation();
      const dropdown = document.getElementById('project-shortcut-dropdown');
      if (dropdown) dropdown.classList.toggle('hidden');
      
      const list = document.getElementById('project-shortcut-list');
      if (list && !dropdown.classList.contains('hidden')) {
        list.innerHTML = '';
        projects.forEach(p => {
          const btn = document.createElement('button');
          btn.className = 'w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors';
          btn.textContent = p.name;
          btn.onclick = () => {
             navigateTo('/proyek/' + p.id);
             dropdown.classList.add('hidden');
          };
          list.appendChild(btn);
        });
      }
    }

    function toggleNotifications(e) {
      e.stopPropagation();
      const notif = document.getElementById('notif-dropdown');
      if (notif) notif.classList.toggle('hidden');
    }

    function toggleAddMenu(e) {
      e.stopPropagation();
      const menu = document.getElementById('add-menu-dropdown');
      if (menu) menu.classList.toggle('hidden');
    }

    function toggleNewProjectMenu(e) {
      e.stopPropagation();
      const menu = document.getElementById('new-project-dropdown');
      if (menu) menu.classList.toggle('hidden');
    }

    function newProjectDropdownNavigate() {
      const menu = document.getElementById('new-project-dropdown');
      if (menu) menu.classList.add('hidden');
      navigateTo('/tambah');
    }

    var githubImportMode = 'files'; // 'files' = import into existing project, 'project' = create new project from repo

    function importProjectFromGithub() {
      const menu = document.getElementById('new-project-dropdown');
      if (menu) menu.classList.add('hidden');
      githubImportMode = 'project';
      openGithubModal();
    }

    function openItemActionMenu(e, itemName) {
      e.stopPropagation();
      const menu = document.getElementById('item-action-menu');
      if (menu) {
        activeItemName = itemName;
        menu.classList.remove('hidden');
        menu.style.top = e.clientY + 'px';
        let leftPos = e.clientX - 150;
        if (leftPos < 10) leftPos = 10;
        menu.style.left = leftPos + 'px';
      }
    }

    function switchTab(tabId, element) {
      const tabBtns = document.querySelectorAll('.tab-btn');
      tabBtns.forEach(btn => {
        const isActive = btn.dataset.tab === tabId || btn === element;
        if(isActive) {
          btn.classList.remove('text-gray-500');
          btn.classList.add('text-black');
          btn.setAttribute('aria-current', 'page');
        } else {
          btn.classList.remove('text-black');
          btn.classList.add('text-gray-500');
          btn.removeAttribute('aria-current');
        }
      });
      
      const indicator = document.getElementById('tab-indicator');
      if(indicator && element) {
        indicator.style.width = element.offsetWidth + 'px';
        indicator.style.transform = `translateX(${element.offsetLeft}px)`;
      }
      
      const contentKode = document.getElementById('tab-content-kode');
      const contentKeamanan = document.getElementById('tab-content-keamanan');
      
      if(contentKode) {
        if(tabId === 'kode') contentKode.classList.remove('hidden');
        else contentKode.classList.add('hidden');
      }
      if(contentKeamanan) {
        if(tabId === 'keamanan') {
          contentKeamanan.classList.remove('hidden');
          contentKeamanan.classList.add('flex');
          runSecurityScan();
        } else {
          contentKeamanan.classList.add('hidden');
          contentKeamanan.classList.remove('flex');
        }
      }
      const contentHalaman = document.getElementById('tab-content-halaman');
      if(contentHalaman) {
        if(tabId === 'halaman') {
          contentHalaman.classList.remove('hidden');
          contentHalaman.classList.add('flex');
          // Auto-check DNS jika domain sudah tersimpan
          setTimeout(function() {
            var di = document.getElementById('deploy-domain');
            if (di && di.value.trim()) { checkDNS(); }
          }, 500);
          loadDeployData();
        } else {
          contentHalaman.classList.add('hidden');
          contentHalaman.classList.remove('flex');
        }
      }
      const contentEnv = document.getElementById('tab-content-env');
      if(contentEnv) {
        if(tabId === 'env') {
          contentEnv.classList.remove('hidden');
          contentEnv.classList.add('flex');
          loadEnvVariables();
        } else {
          contentEnv.classList.add('hidden');
          contentEnv.classList.remove('flex');
        }
      }
      // Security warning banner only shows in Keamanan tab
      var secBanner = document.getElementById('security-warning-banner');
      if (secBanner) {
        if (tabId === 'keamanan') {
          // visibility controlled by runSecurityScan
        } else {
          secBanner.classList.add('hidden');
          secBanner.classList.remove('flex');
        }
      }
    }
    
    function startSecurityScan() {
       runSecurityScan();
    }

    const SECURITY_PATTERNS = [
      { regex: /(api[_-]?key|apikey)\s*[:=]\s*['"]([a-zA-Z0-9_\-]{10,})['"]/gi, label: 'API key ter-hardcode ditemukan di kode', severity: 'Tinggi', envKey: 'API_KEY' },
      { regex: /(secret|client[_-]?secret)\s*[:=]\s*['"]([a-zA-Z0-9_\-]{6,})['"]/gi, label: 'Secret ter-hardcode ditemukan di kode', severity: 'Tinggi', envKey: 'SECRET' },
      { regex: /password\s*[:=]\s*['"]([^'"]{3,})['"]/gi, label: 'Password ter-hardcode ditemukan di kode', severity: 'Tinggi', envKey: 'PASSWORD' },
      { regex: /(token|access[_-]?token|bearer)\s*[:=]\s*['"]([a-zA-Z0-9_\-\.]{10,})['"]/gi, label: 'Token ter-hardcode ditemukan di kode', severity: 'Sedang', envKey: 'TOKEN' },
      { regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g, label: 'Private key ditemukan di kode', severity: 'Tinggi' },
      { regex: /<script[^>]*>[\s\S]*document\.write\([\s\S]*<\/script>/gi, label: 'Penggunaan document.write terdeteksi (risiko XSS)', severity: 'Rendah' }
    ];

    function autoExtractCredentialsToEnv(files) {
      if (!currentProjectId) return 0;
      var envKey = getEnvKey();
      var envVars = [];
      try { envVars = JSON.parse(localStorage.getItem(envKey) || '[]'); } catch(e) {}
      var existingKeys = envVars.map(function(e) { return e.key.toUpperCase(); });
      var existingValues = envVars.map(function(e) { return e.value; });
      var added = 0;
      var seenValues = {};

      files.forEach(function(file) {
        SECURITY_PATTERNS.forEach(function(pattern) {
          if (!pattern.envKey) return;
          var regex = new RegExp(pattern.regex.source, pattern.regex.flags);
          var match;
          while ((match = regex.exec(file.content)) !== null) {
            var value = match[2] || match[1] || '';
            if (!value || value.length < 3) continue;
            if (seenValues[value]) continue;
            seenValues[value] = true;
            // Skip if this credential value is already in env vars (already moved)
            if (existingValues.indexOf(value) !== -1) continue;
            var baseKey = pattern.envKey;
            var envKeyName = baseKey;
            var suffix = 1;
            while (existingKeys.indexOf(envKeyName.toUpperCase()) !== -1) {
              suffix++;
              envKeyName = baseKey + '_' + suffix;
            }
            envVars.push({ key: envKeyName, value: value });
            existingKeys.push(envKeyName.toUpperCase());
            existingValues.push(value);
            added++;
          }
        });
      });

      if (added > 0) {
        localStorage.setItem(envKey, JSON.stringify(envVars));
        if (typeof FB !== 'undefined') FB.set(envKey, envVars);
        if (typeof renderEnvList === 'function') {
          envVariables = envVars;
          renderEnvList();
        }
        if (typeof _syncEnvToD1 === 'function') _syncEnvToD1(currentProjectId);
        console.log('[Clincoo] Auto-extracted ' + added + ' credentials to env');
      }
      return added;
    }

    function getAllProjectFiles() {
      if (!currentProjectId) return [];
      var storageKey = 'clincoo_' + currentProjectId + '_files';
      var localFiles = {};
      try { localFiles = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch(e) {}
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
      return allFiles;
    }

    function runSecurityScan(silent) {
      if (!currentProjectId) return;
      var files = getAllProjectFiles();
      var findings = [];

      // Get existing env values to skip already-moved credentials
      var _envVals = [];
      try { _envVals = JSON.parse(localStorage.getItem(getEnvKey()) || '[]'); } catch(e) {}
      var _envValueSet = _envVals.map(function(ev) { return ev.value; });

      files.forEach(function(file) {
        SECURITY_PATTERNS.forEach(function(pattern) {
          if (pattern.envKey) {
            // For credential patterns, check each match against env vars
            var regex = new RegExp(pattern.regex.source, pattern.regex.flags);
            var match;
            var newMatches = 0;
            while ((match = regex.exec(file.content)) !== null) {
              var val = match[2] || match[1] || '';
              if (_envValueSet.indexOf(val) === -1) newMatches++;
            }
            if (newMatches > 0) {
              findings.push({ file: file.path, label: pattern.label, severity: pattern.severity, count: newMatches });
            }
          } else {
            var matches = file.content.match(pattern.regex);
            if (matches) {
              findings.push({ file: file.path, label: pattern.label, severity: pattern.severity, count: matches.length });
            }
          }
        });
      });

      // Auto-extract detected credentials to env vars
      if (!silent) {
        var extracted = autoExtractCredentialsToEnv(files);
        if (extracted > 0) {
          findings.push({ file: 'Auto-Extract', label: extracted + ' kredensial terdeteksi & dipindahkan ke env otomatis', severity: 'Sedang', count: extracted });
        }
      }

      var envKey = getEnvKey();
      var savedEnv = [];
      try { savedEnv = JSON.parse(localStorage.getItem(envKey) || '[]'); } catch(e) {}
      var weakEnvCount = 0;
      savedEnv.forEach(function(item) {
        if (item.value && item.value.length < 8) weakEnvCount++;
      });
      if (weakEnvCount > 0) {
        findings.push({ file: 'Environment', label: weakEnvCount + ' variabel memiliki nilai yang terlalu pendek/lemah', severity: 'Rendah', count: weakEnvCount });
      }

      localStorage.setItem('clincoo_' + currentProjectId + '_security_findings', JSON.stringify(findings));

      var emptyState = document.getElementById('security-empty-state');
      var resultsEl = document.getElementById('security-scan-results');
      var banner = document.getElementById('security-warning-banner');
      var bannerText = document.getElementById('security-warning-text');

      if (resultsEl) {
        if (findings.length > 0) {
          if (emptyState) emptyState.classList.add('hidden');
          resultsEl.classList.remove('hidden');
          resultsEl.classList.add('flex');
          resultsEl.innerHTML = findings.map(function(f) {
            var color = f.severity === 'Tinggi' ? 'red' : (f.severity === 'Sedang' ? 'amber' : 'gray');
            return '<div class="bg-white rounded-xl border border-' + color + '-200 shadow-sm p-4 flex items-start gap-3">' +
              '<div class="w-8 h-8 rounded-lg bg-' + color + '-50 flex items-center justify-center flex-shrink-0">' +
                '<svg class="w-4 h-4 text-' + color + '-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>' +
              '</div>' +
              '<div class="min-w-0 flex-1">' +
                '<p class="text-sm font-medium text-gray-900">' + f.label + '</p>' +
                '<p class="text-xs text-gray-500 mt-0.5">' + f.file + ' · Tingkat: ' + f.severity + '</p>' +
              '</div>' +
            '</div>';
          }).join('');
        } else {
          resultsEl.classList.add('hidden');
          resultsEl.classList.remove('flex');
          if (emptyState) {
            emptyState.classList.remove('hidden');
            var titleEl = emptyState.querySelector('h3');
            var descEl = emptyState.querySelector('p');
            if (titleEl) titleEl.textContent = 'Tidak ada masalah ditemukan';
            if (descEl) descEl.textContent = 'Pemindaian otomatis tidak menemukan kerentanan keamanan pada kode proyek ini.';
          }
        }
      }

      if (banner && bannerText) {
        if (findings.length > 0) {
          banner.classList.remove('hidden');
          banner.classList.add('flex');
          var highCount = findings.filter(function(f){ return f.severity === 'Tinggi'; }).length;
          bannerText.textContent = findings.length + ' masalah ditemukan' + (highCount > 0 ? ' (' + highCount + ' berisiko tinggi)' : '') + ' pada proyek ini.';
        } else {
          banner.classList.add('hidden');
          banner.classList.remove('flex');
        }
      }
    }

    let envVariables = [];
    function getEnvKey() { return 'clincoo_' + (currentProjectId || 'default') + '_env_variables'; }

    function loadEnvVariables() {
        const saved = localStorage.getItem(getEnvKey());
        if (saved) {
            try { envVariables = JSON.parse(saved); } catch (e) { envVariables = []; }
        }
        renderEnvList();
        // Fetch from D1 for real-time sync
        if (typeof _syncEnvFromD1 === 'function' && currentProjectId) {
            _syncEnvFromD1(currentProjectId);
        }
    }

    var _envMenuOpen = -1;

    function renderEnvList() {
        const list = document.getElementById('env-list');
        if (!list) return;
        const empty = document.getElementById('env-empty-state');
        if (empty) {
          if (envVariables.length === 0) empty.classList.remove('hidden');
          else empty.classList.add('hidden');
        }
        _envMenuOpen = -1;
        list.innerHTML = envVariables.map((item, i) =>
            '<div class="flex items-center gap-2 sm:gap-3 w-full group">' +
               '<input type="text" value="' + item.key + '" readonly class="flex-1 min-w-0 bg-gray-50 border border-gray-200 text-gray-500 px-3 sm:px-4 py-3 rounded-xl text-xs sm:text-sm font-mono cursor-not-allowed focus:outline-none pointer-events-none truncate">' +
               '<input type="password" value="' + item.value + '" readonly class="flex-1 min-w-0 bg-gray-50 border border-gray-200 text-gray-500 px-3 sm:px-4 py-3 rounded-xl text-xs sm:text-sm font-mono cursor-not-allowed focus:outline-none pointer-events-none tracking-widest sm:tracking-[0.2em] truncate">' +
               '<div class="relative flex-shrink-0">' +
                  '<button onclick="toggleEnvMenu(' + i + ')" class="p-2 sm:p-2.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-200 transition-colors focus:outline-none" aria-label="Opsi">' +
                     '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 4c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>' +
                  '</button>' +
                  '<div id="env-menu-' + i + '" class="hidden absolute right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-[120px]">' +
                     '<button onclick="editEnv(' + i + ')" class="w-full px-4 py-2 text-left text-xs sm:text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">' +
                        '<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
                        'Edit' +
                     '</button>' +
                     '<button onclick="deleteEnv(' + i + ')" class="w-full px-4 py-2 text-left text-xs sm:text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2">' +
                        '<svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
                        'Hapus' +
                     '</button>' +
                  '</div>' +
               '</div>' +
            '</div>'
        ).join('');
    }

    function toggleEnvMenu(index) {
        // Close all other menus
        for (var j = 0; j < envVariables.length; j++) {
            if (j !== index) {
                var m = document.getElementById('env-menu-' + j);
                if (m) m.classList.add('hidden');
            }
        }
        var menu = document.getElementById('env-menu-' + index);
        if (menu) {
            menu.classList.toggle('hidden');
            _envMenuOpen = menu.classList.contains('hidden') ? -1 : index;
        }
    }

    // Close env menu when clicking outside
    document.addEventListener('click', function(e) {
        if (_envMenuOpen === -1) return;
        var openMenu = document.getElementById('env-menu-' + _envMenuOpen);
        if (openMenu && !openMenu.classList.contains('hidden')) {
            var parent = openMenu.parentElement;
            if (parent && !parent.contains(e.target)) {
                openMenu.classList.add('hidden');
                _envMenuOpen = -1;
            }
        }
    });

    function editEnv(index) {
        var item = envVariables[index];
        if (!item) return;
        // Close the menu
        var menu = document.getElementById('env-menu-' + index);
        if (menu) menu.classList.add('hidden');
        _envMenuOpen = -1;
        // Populate the input fields with existing values for editing
        var keyInput = document.getElementById('env-key');
        var valInput = document.getElementById('env-value');
        if (keyInput && valInput) {
            keyInput.value = item.key;
            valInput.value = item.value;
            keyInput.focus();
            // Remove the old entry; saveEnv will add the updated one
            envVariables.splice(index, 1);
            localStorage.setItem(getEnvKey(), JSON.stringify(envVariables));
            if (typeof FB !== 'undefined') FB.set(getEnvKey(), envVariables);
            renderEnvList();
            if (typeof _syncEnvToD1 === 'function' && currentProjectId) _syncEnvToD1(currentProjectId);
        }
    }

    function deleteEnv(index) {
        envVariables.splice(index, 1);
        localStorage.setItem(getEnvKey(), JSON.stringify(envVariables));
        if (typeof FB !== 'undefined') FB.set(getEnvKey(), envVariables);
        renderEnvList();
        if (typeof _syncEnvToD1 === 'function' && currentProjectId) _syncEnvToD1(currentProjectId);

        }

    function saveEnv() {
        const keyInput = document.getElementById('env-key');
        const valInput = document.getElementById('env-value');
        if(!keyInput.value.trim() || !valInput.value) {

          return;
        }
        envVariables.push({ key: keyInput.value.trim(), value: valInput.value });
        localStorage.setItem(getEnvKey(), JSON.stringify(envVariables));
        if (typeof FB !== 'undefined') FB.set(getEnvKey(), envVariables);
        keyInput.value = '';
        valInput.value = '';
        renderEnvList();
        if (typeof _syncEnvToD1 === 'function' && currentProjectId) _syncEnvToD1(currentProjectId);

    }

    function safeNavigate(url) {
      window.location.href = url;
    }

