    // === TRACKING: Self-track the Clincoo dashboard itself ===
    var _clincooVisitorId = localStorage.getItem('clincoo_vid') || '';
    if (!_clincooVisitorId) {
      _clincooVisitorId = 'v-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
      localStorage.setItem('clincoo_vid', _clincooVisitorId);
    }
    var _clincooSessionId = sessionStorage.getItem('clincoo_sid') || '';
    if (!_clincooSessionId) {
      _clincooSessionId = 's-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
      sessionStorage.setItem('clincoo_sid', _clincooSessionId);
    }
    // Send tracking beacon for dashboard views
    if (navigator.sendBeacon) {
      try {
        var trackData = JSON.stringify({
          domain: window.location.hostname,
          path: window.location.pathname,
          event_type: 'pageview',
          visitor_id: _clincooVisitorId,
          session_id: _clincooSessionId,
          referrer: document.referrer || '',
          screen_w: window.screen.width,
          screen_h: window.screen.height,
          language: navigator.language || '',
          duration: 0
        });
        navigator.sendBeacon(ANALYTICS_TRACK_URL, trackData);
      } catch(e) {}
    }

    // === ANALYTICS DASHBOARD ===
    // Muted color palette for multi-series charts
    var _gaColors = ['#4F6BED', '#34A853', '#FBBC04', '#EA4335', '#A142F4', '#FF6D01', '#00ACC1', '#9AA0A6'];
    var _gaColorsAlpha = ['rgba(79,107,237,0.75)','rgba(52,168,83,0.75)','rgba(251,188,4,0.75)','rgba(234,67,53,0.75)','rgba(161,66,244,0.75)','rgba(255,109,1,0.75)','rgba(0,172,193,0.75)','rgba(154,160,166,0.75)'];

    function initAnalyticsCharts() {
      if (typeof Chart === 'undefined') return;
      if (_analyticsChartsInited) return;
      _analyticsChartsInited = true;

      Chart.defaults.font.family = "'Inter', sans-serif";
      Chart.defaults.font.size = 11;
      Chart.defaults.color = '#9ca3af';
      Chart.defaults.borderColor = 'transparent';
      Chart.defaults.plugins.legend.labels.boxWidth = 10;
      Chart.defaults.plugins.legend.labels.boxHeight = 10;
      Chart.defaults.plugins.legend.labels.padding = 12;

      // Base options: NO grid lines, clean flat look
      var _gaOpt = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { color: '#6b7280', font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } },
          tooltip: { backgroundColor: '#1f2937', titleColor: '#fff', bodyColor: '#d1d5db', borderColor: '#374151', borderWidth: 1, padding: 10, cornerRadius: 8, titleFont: { size: 12 }, bodyFont: { size: 11 }, usePointStyle: true }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } }, beginAtZero: true }
        }
      };

      // 1. Line chart (main - full width) — monochrome
      _analyticsCharts.line = new Chart(document.getElementById('lineChart'), {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Views Harian', data: [], fill: true, backgroundColor: 'rgba(31,41,55,0.06)', borderColor: '#1f2937', borderWidth: 2, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: '#1f2937', pointBorderColor: '#fff', pointBorderWidth: 1.5 }] },
        options: Object.assign({}, _gaOpt, { plugins: Object.assign({}, _gaOpt.plugins, { legend: { display: false } }) })
      });

      // 2. Bar: monthly — monochrome
      _analyticsCharts.bar = new Chart(document.getElementById('barChart'), {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Views', data: [], backgroundColor: '#374151', borderColor: '#1f2937', borderWidth: 0, borderRadius: 4, barThickness: 'flex' }] },
        options: Object.assign({}, _gaOpt, { plugins: Object.assign({}, _gaOpt.plugins, { legend: { display: false } }) })
      });

      // 3. Pie: sources — muted colors
      _analyticsCharts.pie = new Chart(document.getElementById('pieChart'), {
        type: 'pie',
        data: { labels: [], datasets: [{ label: 'Sumber', data: [], backgroundColor: _gaColorsAlpha, borderColor: '#fff', borderWidth: 2, hoverOffset: 6 }] },
        options: Object.assign({}, _gaOpt, { scales: {} })
      });

      // 4. Doughnut: devices — muted colors
      _analyticsCharts.doughnut = new Chart(document.getElementById('doughnutChart'), {
        type: 'doughnut',
        data: { labels: [], datasets: [{ label: 'Perangkat', data: [], backgroundColor: _gaColorsAlpha, borderColor: '#fff', borderWidth: 2, hoverOffset: 6 }] },
        options: Object.assign({}, _gaOpt, { scales: {}, cutout: '62%' })
      });

      // 5. Radar: languages — monochrome
      _analyticsCharts.radar = new Chart(document.getElementById('radarChart'), {
        type: 'radar',
        data: { labels: [], datasets: [{ label: 'Bahasa', data: [], fill: true, backgroundColor: 'rgba(31,41,55,0.08)', borderColor: '#374151', borderWidth: 2, pointBackgroundColor: '#1f2937', pointBorderColor: '#fff', pointBorderWidth: 1, pointRadius: 3 }] },
        options: Object.assign({}, _gaOpt, { scales: { r: { grid: { display: false }, angleLines: { color: '#f3f4f6' }, ticks: { display: false, backdropColor: 'transparent' }, pointLabels: { color: '#6b7280', font: { size: 11 } } } } })
      });

      // 6. Polar Area: countries — muted colors
      _analyticsCharts.polarArea = new Chart(document.getElementById('polarAreaChart'), {
        type: 'polarArea',
        data: { labels: [], datasets: [{ label: 'Negara', data: [], backgroundColor: _gaColorsAlpha, borderColor: '#fff', borderWidth: 1.5, hoverOffset: 4 }] },
        options: Object.assign({}, _gaOpt, { scales: { r: { grid: { display: false }, ticks: { display: false, backdropColor: 'transparent' } } } })
      });

      // 7. Scatter: hourly — monochrome
      _analyticsCharts.scatter = new Chart(document.getElementById('scatterChart'), {
        type: 'scatter',
        data: { datasets: [{ label: 'Views', data: [], backgroundColor: 'rgba(31,41,55,0.55)', borderColor: '#1f2937', pointRadius: 5, pointHoverRadius: 7 }] },
        options: Object.assign({}, _gaOpt, { scales: { x: { type: 'linear', position: 'bottom', title: { display: true, text: 'Jam', color: '#9ca3af', font: { size: 10 } }, grid: { display: false }, border: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }, y: { title: { display: true, text: 'Views', color: '#9ca3af', font: { size: 10 } }, grid: { display: false }, border: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } }, beginAtZero: true } } })
      });

      // 8. Bubble: visitors x views — muted blue
      _analyticsCharts.bubble = new Chart(document.getElementById('bubbleChart'), {
        type: 'bubble',
        data: { datasets: [{ label: 'Trafik', data: [], backgroundColor: 'rgba(79,107,237,0.3)', borderColor: '#4F6BED', borderWidth: 1 }] },
        options: Object.assign({}, _gaOpt, { scales: { x: { title: { display: true, text: 'Jam', color: '#9ca3af', font: { size: 10 } }, grid: { display: false }, border: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }, y: { title: { display: true, text: 'Views', color: '#9ca3af', font: { size: 10 } }, grid: { display: false }, border: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } }, beginAtZero: true } } })
      });

      // 9. Mixed: daily views vs visitors — blue line + gray bars
      _analyticsCharts.mixed = new Chart(document.getElementById('mixedChart'), {
        type: 'bar',
        data: { labels: [], datasets: [
          { type: 'line', label: 'Unique Visitors', data: [], borderColor: '#4F6BED', borderWidth: 2, fill: false, tension: 0.3, pointRadius: 2, pointBackgroundColor: '#4F6BED' },
          { type: 'bar', label: 'Page Views', data: [], backgroundColor: 'rgba(156,163,175,0.45)', borderColor: '#9ca3af', borderWidth: 0, borderRadius: 3 }
        ] },
        options: Object.assign({}, _gaOpt)
      });

      // 10. Horizontal Bar: top pages — muted colors
      _analyticsCharts.horizontalBar = new Chart(document.getElementById('horizontalBarChart'), {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Views', data: [], backgroundColor: _gaColorsAlpha, borderColor: '#fff', borderWidth: 1, borderRadius: 3 }] },
        options: Object.assign({}, _gaOpt, { indexAxis: 'y', scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } }, beginAtZero: true }, y: { grid: { display: false }, border: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } } }, plugins: Object.assign({}, _gaOpt.plugins, { legend: { display: false } }) })
      });

            // Fetch real data
      fetchAnalyticsData();

      // Auto-refresh every 5 seconds for real-time data
      if (_analyticsRefreshTimer) clearInterval(_analyticsRefreshTimer);
      _analyticsRefreshTimer = setInterval(fetchAnalyticsData, 3000);
    }

    async function fetchAnalyticsData() {
      try {
        var res = await fetch(ANALYTICS_STATS_URL, { method: 'GET', headers: { 'Content-Type': 'application/json', 'X-API-Key': BACKEND_API_KEY } });
        if (!res.ok) return;
        var result = await res.json();
        if (!result || !result.data) return;
        var d = result.data;

        // Update summary cards
        var elToday = document.getElementById('analytics-total-today');
        var elVisitors = document.getElementById('analytics-total-visitors');
        var elEvents = document.getElementById('analytics-total-events');
        var elDuration = document.getElementById('analytics-avg-duration');
        if (elToday) elToday.textContent = (d.summary.total_today || 0).toLocaleString('id-ID');
        if (elVisitors) elVisitors.textContent = (d.summary.total_visitors_30d || 0).toLocaleString('id-ID');
        if (elEvents) elEvents.textContent = (d.summary.total_events || 0).toLocaleString('id-ID');
        if (elDuration) elDuration.textContent = ((d.summary.avg_duration || 0) / 1000).toFixed(1) + 's';

        // 1. Bar: monthly
        if (d.monthly && d.monthly.length) {
          _analyticsCharts.bar.data.labels = d.monthly.map(function(m) { return m.month; });
          _analyticsCharts.bar.data.datasets[0].data = d.monthly.map(function(m) { return m.views; });
          _analyticsCharts.bar.update();
        }

        // 2. Line: daily
        if (d.daily && d.daily.length) {
          _analyticsCharts.line.data.labels = d.daily.map(function(m) { return m.day; });
          _analyticsCharts.line.data.datasets[0].data = d.daily.map(function(m) { return m.views; });
          _analyticsCharts.line.update();
        }

        // 3. Pie: sources
        if (d.sources && d.sources.length) {
          _analyticsCharts.pie.data.labels = d.sources.map(function(s) { return s.source; });
          _analyticsCharts.pie.data.datasets[0].data = d.sources.map(function(s) { return s.count; });
          _analyticsCharts.pie.update();
        }

        // 4. Doughnut: devices
        if (d.devices && d.devices.length) {
          _analyticsCharts.doughnut.data.labels = d.devices.map(function(s) { return s.device; });
          _analyticsCharts.doughnut.data.datasets[0].data = d.devices.map(function(s) { return s.count; });
          _analyticsCharts.doughnut.update();
        }

        // 5. Radar: languages
        if (d.languages && d.languages.length) {
          _analyticsCharts.radar.data.labels = d.languages.map(function(s) { return s.lang; });
          _analyticsCharts.radar.data.datasets[0].data = d.languages.map(function(s) { return s.count; });
          _analyticsCharts.radar.update();
        }

        // 6. Polar Area: countries
        if (d.countries && d.countries.length) {
          _analyticsCharts.polarArea.data.labels = d.countries.map(function(s) { return s.country; });
          _analyticsCharts.polarArea.data.datasets[0].data = d.countries.map(function(s) { return s.count; });
          _analyticsCharts.polarArea.update();
        }

        // 7. Scatter: hourly
        if (d.hourly && d.hourly.length) {
          _analyticsCharts.scatter.data.datasets[0].data = d.hourly.map(function(s) { return { x: s.hour, y: s.views }; });
          _analyticsCharts.scatter.update();
        }

        // 8. Bubble: visitors x views x sessions
        if (d.bubbleData && d.bubbleData.length) {
          _analyticsCharts.bubble.data.datasets[0].data = d.bubbleData.map(function(s) { return { x: s.hour, y: s.views, r: Math.max(5, Math.min(40, s.visitors * 3)) }; });
          _analyticsCharts.bubble.update();
        }

        // 9. Mixed: daily views vs visitors
        if (d.dailyMixed && d.dailyMixed.length) {
          _analyticsCharts.mixed.data.labels = d.dailyMixed.map(function(s) { return s.day; });
          _analyticsCharts.mixed.data.datasets[0].data = d.dailyMixed.map(function(s) { return s.visitors; });
          _analyticsCharts.mixed.data.datasets[1].data = d.dailyMixed.map(function(s) { return s.views; });
          _analyticsCharts.mixed.update();
        }

        // 10. Horizontal Bar: top pages
        if (d.topPages && d.topPages.length) {
          _analyticsCharts.horizontalBar.data.labels = d.topPages.map(function(s) { return s.path.substring(0, 25); });
          _analyticsCharts.horizontalBar.data.datasets[0].data = d.topPages.map(function(s) { return s.views; });
          _analyticsCharts.horizontalBar.update();
        }

        // Update last refreshed time
        var refreshEl = document.getElementById('analytics-last-refresh');
        if (refreshEl) refreshEl.textContent = new Date().toLocaleTimeString('id-ID');
      } catch(e) {
        console.warn('[Analytics] Gagal fetch data:', e.message);
      }
    }

    // Track session duration on unload
    window.addEventListener('beforeunload', function() {
      if (navigator.sendBeacon) {
        try {
          var dur = performance.now();
          navigator.sendBeacon(ANALYTICS_TRACK_URL, JSON.stringify({
            domain: window.location.hostname,
            path: window.location.pathname,
            event_type: 'session_end',
            visitor_id: _clincooVisitorId,
            session_id: _clincooSessionId,
            duration: Math.round(dur)
          }));
        } catch(e) {}
      }
    });

    window.addEventListener('DOMContentLoaded', () => {
      loadData();
    renderSidebarProjects();
      handleRoute();
    });
