const SECURITY_PATTERNS = [
  { type: 'AWS Access Key ID', severity: 'Tinggi', regex: /AKIA[0-9A-Z]{16}/g },
  { type: 'Google/Firebase API Key', severity: 'Tinggi', regex: /AIza[0-9A-Za-z\-_]{35}/g },
  { type: 'GitHub Token', severity: 'Tinggi', regex: /gh[pousr]_[A-Za-z0-9]{36,255}/g },
  { type: 'Slack Token', severity: 'Tinggi', regex: /xox[baprs]-[0-9A-Za-z-]{10,48}/g },
  { type: 'Stripe Live Key', severity: 'Tinggi', regex: /sk_live_[0-9a-zA-Z]{16,}/g },
  { type: 'Private Key', severity: 'Tinggi', regex: /-----BEGIN\s?(RSA|EC|DSA|OPENSSH|PGP)?\s?PRIVATE KEY-----/g },
  { type: 'JSON Web Token (JWT)', severity: 'Sedang', regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  {
    type: 'Kredensial Tersimpan',
    severity: 'Sedang',
    regex: /(secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)[\w-]*\s*[:=]\s*['"]([^'"\s]{6,})['"]/gi,
    labelIndex: 1,
    valueIndex: 2
  }
];

const SECURITY_IGNORE_VALUES = ['changeme', 'xxxx', 'example', 'yourapikeyhere', 'your_api_key_here', 'password', '12345678', 'placeholder', 'dummy', 'insert_key_here'];

let securityRescanTimer = null;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function isSecurityScannableFile(filename) {
  const parts = String(filename).split('.');
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
  return ['html', 'htm', 'css', 'js', 'ts', 'jsx', 'json', 'py', 'txt', 'md', 'env', 'xml', 'yml', 'yaml', 'svg'].indexOf(ext) !== -1;
}

function redactSecretValue(value) {
  const v = String(value).trim();
  if (v.length <= 8) return v.charAt(0) + '****';
  return v.slice(0, 4) + '****' + v.slice(-4);
}

function scanProjectForSecrets(liveOverride) {
  const findings = [];
  if (typeof projectFilesData === 'undefined' || !projectFilesData) return findings;
  const seen = {};

  Object.keys(projectFilesData).forEach(function(folderPath) {
    const items = projectFilesData[folderPath] || [];
    items.forEach(function(item) {
      if (item.type !== 'file') return;
      if (!isSecurityScannableFile(item.name)) return;

      let content = item.content || '';
      if (liveOverride && liveOverride.folderPath === folderPath && liveOverride.name === item.name) {
        content = liveOverride.content || '';
      }
      if (!content) return;
      if (content.indexOf('data:') === 0 || content.indexOf('blob:') === 0) return;

      SECURITY_PATTERNS.forEach(function(pattern) {
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(content)) !== null) {
          const rawValue = pattern.valueIndex ? match[pattern.valueIndex] : match[0];
          if (!rawValue) continue;
          const lower = rawValue.toLowerCase();
          if (SECURITY_IGNORE_VALUES.some(function(v) { return lower.indexOf(v) !== -1; })) continue;

          const dedupeKey = folderPath + '/' + item.name + ':' + pattern.type + ':' + rawValue;
          if (seen[dedupeKey]) continue;
          seen[dedupeKey] = true;

          const label = pattern.labelIndex ? match[pattern.labelIndex] : pattern.type;
          const snippet = pattern.labelIndex
            ? (label + ': ' + redactSecretValue(rawValue))
            : redactSecretValue(rawValue);

          findings.push({
            path: item.path || item.name,
            type: pattern.type,
            severity: pattern.severity,
            snippet: snippet
          });

          if (match.index === pattern.regex.lastIndex) pattern.regex.lastIndex++;
        }
      });
    });
  });

  return findings;
}

function renderSecurityTab(liveOverride) {
  const container = document.getElementById('security-scan-results');
  const lastScanEl = document.getElementById('security-last-scan');
  if (!container) return;

  const findings = scanProjectForSecrets(liveOverride);

  if (lastScanEl) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    lastScanEl.textContent = 'Terakhir diperiksa ' + hh + ':' + mm;
  }

  if (findings.length === 0) {
    container.innerHTML = '' +
      '<div class="flex flex-col items-center justify-center py-16 text-center">' +
        '<div class="h-14 w-14 rounded-full bg-gray-50 text-gray-300 flex items-center justify-center mb-3 flex-shrink-0">' +
          '<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">' +
            '<path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />' +
          '</svg>' +
        '</div>' +
        '<p class="text-sm text-gray-400">Tidak ada notifikasi keamanan</p>' +
      '</div>';
    return;
  }

  container.innerHTML = findings.map(function(f) {
    const isHigh = f.severity === 'Tinggi';
    const colorClass = isHigh ? 'text-red-600' : 'text-amber-600';
    return '' +
      '<div class="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row gap-4 items-start sm:items-center">' +
        '<div class="h-14 w-14 rounded-full bg-white ' + colorClass + ' flex items-center justify-center flex-shrink-0">' +
          '<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
            '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />' +
          '</svg>' +
        '</div>' +
        '<div class="flex-1 min-w-0">' +
          '<h4 class="text-base font-semibold text-gray-900 mb-1">' + escapeHtml(f.type) + ' terekspos</h4>' +
          '<p class="text-sm text-gray-600 line-clamp-2">Ditemukan di berkas <span class="font-medium text-gray-800">' + escapeHtml(f.path) + '</span>: <code class="font-mono text-xs bg-gray-50 px-1 py-0.5 rounded">' + escapeHtml(f.snippet) + '</code></p>' +
          '<div class="mt-2 text-xs font-medium text-gray-400">Tingkat risiko: <span class="' + colorClass + ' font-semibold">' + escapeHtml(f.severity) + '</span></div>' +
        '</div>' +
      '</div>';
  }).join('');
}

function scheduleSecurityRescan() {
  if (securityRescanTimer) clearTimeout(securityRescanTimer);
  securityRescanTimer = setTimeout(function() {
    if (typeof editingFileName !== 'undefined' && editingFileName && typeof codeEditor !== 'undefined' && codeEditor) {
      renderSecurityTab({ folderPath: currentFolderPath, name: editingFileName, content: codeEditor.getValue() });
    } else {
      renderSecurityTab();
    }
  }, 600);
}
