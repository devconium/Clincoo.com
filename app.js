const STORAGE_KEY_PROJECTS = 'clincoo_projects_v2';
let STORAGE_KEY_FILES = 'clincoo_files_v2';

function updateFilesKey() { STORAGE_KEY_FILES = 'clincoo_' + (currentProjectId || 'default') + '_files'; }

function loadData() {
  const savedProjects = localStorage.getItem(STORAGE_KEY_PROJECTS);
  if (savedProjects) {
    try { projects = JSON.parse(savedProjects); } catch (e) { projects = []; }
  }
  filteredProjects = [...projects];
}

function loadProjectFiles() {
  updateFilesKey();
  const savedFiles = localStorage.getItem(STORAGE_KEY_FILES);
  if (savedFiles) {
    try { projectFilesData = JSON.parse(savedFiles); } catch (e) { projectFilesData = { 'root': [] }; }
  } else {
    projectFilesData = { 'root': [] };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
  localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(projectFilesData));
  if (typeof renderSecurityTab === 'function') renderSecurityTab();
}

const defaultTemplates = {
  'html': '<!DOCTYPE html>\n<html lang="id">\n<head>\n  <meta charset="UTF-8">\n  <title>Proyek Baru</title>\n</head>\n<body>\n  <h1>Halo Dunia!</h1>\n</body>\n</html>',
  'css': 'body {\n  margin: 0;\n  padding: 0;\n  font-family: sans-serif;\n}',
  'js': 'console.log("Hello from Clincoo!");',
  'py': 'def main():\n  print("Hello, World!")\n\nif __name__ == "__main__":\n  main()',
  'json': '{\n  "name": "project",\n  "version": "1.0.0"\n}',
  'txt': 'Ini adalah berkas teks catatan baru.'
};

function showNotification(message) {
  console.log("Notifikasi:", message);
}

function getFileType(filename) {
  if (!filename) return 'code';
  let ext = getFileExtension(filename);
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'];
  const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'webm'];
  const imageExts = ['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'bmp', 'ico'];
  if (audioExts.includes(ext)) return 'audio';
  if (videoExts.includes(ext)) return 'video';
  if (imageExts.includes(ext)) return 'image';
  return 'code';
}

function getFileExtension(filename) {
  let name = filename ? filename.trim() : '';
  if (!name) return 'html';
  if (name.startsWith('.') && !name.includes('.', 1)) return name.substring(1).toLowerCase();
  if (name.includes('.')) return name.split('.').pop().toLowerCase();
  return name.toLowerCase();
}

function getFileIcon(filename) {
  let ext = getFileExtension(filename);
  switch(ext) {
    case 'mp3': case 'wav': case 'ogg': case 'flac': case 'm4a':
      return `<div class="flex-shrink-0 w-5 h-5 flex items-center justify-center"><svg viewBox="0 0 24 24" class="w-4 h-4" fill="#E04A3A"><path d="M20 3h-7v10.55A3.98 3.98 0 0 0 11 13c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h5v6.55A3.98 3.98 0 0 0 14 13c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V3z"/></svg></div>`;
    case 'mp4': case 'avi': case 'mkv': case 'mov': case 'webm':
      return `<div class="flex-shrink-0 w-5 h-5 flex items-center justify-center"><svg viewBox="0 0 24 24" class="w-4 h-4" fill="none"><rect x="2" y="4" width="20" height="16" rx="3.5" fill="#5B51DC"/><polygon points="10,8.5 15,12 10,15.5" fill="#FFFFFF"/></svg></div>`;
    case 'png': case 'jpg': case 'jpeg': case 'svg': case 'gif': case 'webp':
      return `<div class="flex-shrink-0 w-5 h-5 flex items-center justify-center"><svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="#0D9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" fill="#0D9488" stroke="none" /><path d="M21 15l-5-5L5 21" /></svg></div>`;
    case 'py': case 'python':
      return `<div class="flex-shrink-0 w-5 h-5 flex items-center justify-center"><svg viewBox="0 0 24 24" class="w-4 h-4"><path fill="#3776AB" d="M11.898 2c-3.15 0-5.068.322-5.068 2.373v1.89h10.136v.945H6.83c-2.453 0-4.33 1.488-4.33 4.33 0 2.843 1.877 4.33 4.33 4.33h1.892v-2.373c0-2.316 1.83-4.254 4.148-4.254h5.068c1.94 0 2.453-.562 2.453-2.373 0-2.115-1.913-4.868-8.523-4.868zm-2.58 1.418a.945.945 0 1 1 0 1.89.945.945 0 0 1 0-1.89z"/><path fill="#FFD43B" d="M12.102 22c3.15 0 5.068-.322 5.068-2.373v-1.89H7.034v-.945h10.136c2.453 0 4.33-1.488 4.33-4.33 0-2.843-1.877-4.33-4.33-4.33h-1.892v2.373c0 2.316-1.83 4.254-4.148 4.254H6.062c-1.94 0-2.453.562-2.453 2.373 0 2.115 1.913 4.868 8.493 4.868zm2.58-1.418a.945.945 0 1 1 0-1.89.945.945 0 0 1 0 1.89z"/></svg></div>`;
    case 'txt':
      return `<div class="flex-shrink-0 w-5 h-5 flex items-center justify-center"><svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="#546E7A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>`;
    case 'html': case 'htm':
      return `<div class="flex-shrink-0 w-5 h-5 flex items-center justify-center"><svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="#E34F26" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg></div>`;
    case 'js': case 'ts': case 'jsx':
      return `<div class="flex-shrink-0 w-5 h-5 flex items-center justify-center"><svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="#F7DF1E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" fill="#F7DF1E"/><text x="12" y="16" font-size="8" font-weight="800" fill="#000" stroke="none" text-anchor="middle">JS</text></svg></div>`;
    case 'css':
      return `<div class="flex-shrink-0 w-5 h-5 flex items-center justify-center"><svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="#16A34A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><text x="12" y="15.5" font-size="7" font-weight="800" fill="#16A34A" stroke="none" text-anchor="middle">css</text></svg></div>`;
    default:
      return `<div class="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[#718096]"><svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>`;
  }
}
