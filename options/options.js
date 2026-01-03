// Aiply Options Page

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadSettings();
  await loadProfile();
  await updateCacheStatus();
  setupEventListeners();
}

// === Load Data ===

async function loadSettings() {
  const response = await browser.runtime.sendMessage({ action: 'getSettings' });
  const settings = response || {};
  
  document.getElementById('apiKey').value = settings.groqApiKey || '';
  document.getElementById('githubToken').value = settings.githubToken || '';
  document.getElementById('historyRetention').value = settings.historyRetentionDays || 90;
}

async function loadProfile() {
  const response = await browser.runtime.sendMessage({ action: 'getProfile' });
  const profile = response || {};
  
  // Personal info
  document.getElementById('firstName').value = profile.firstName || '';
  document.getElementById('middleName').value = profile.middleName || '';
  document.getElementById('lastName').value = profile.lastName || '';
  document.getElementById('email').value = profile.email || '';
  document.getElementById('phone').value = profile.phone || '';
  
  // Profile links
  document.getElementById('githubUsername').value = profile.githubUsername || '';
  document.getElementById('linkedinUrl').value = profile.linkedinUrl || '';
  document.getElementById('twitterUrl').value = profile.twitterUrl || '';
  document.getElementById('portfolioUrl').value = profile.portfolioUrl || '';
  
  // Other links
  renderOtherLinksList(profile.otherLinks || []);
  
  // Load deployed projects
  renderProjectList(profile.deployedProjects || []);
  
  // Load resume info
  if (profile.resumeFileName) {
    document.getElementById('currentResumeFile').textContent = profile.resumeFileName;
    document.getElementById('clearResume').style.display = 'inline';
    
    if (profile.resumeText) {
      document.getElementById('resumePreview').value = profile.resumeText.substring(0, 2000) + 
        (profile.resumeText.length > 2000 ? '\n...(truncated)' : '');
      document.getElementById('resumePreviewContainer').style.display = 'block';
    }
  }
}

async function updateCacheStatus() {
  const response = await browser.runtime.sendMessage({ action: 'getCacheStatus' });
  
  if (response.success && response.status) {
    const status = response.status;
    
    if (status.hasGitHubData) {
      document.getElementById('cacheStatus').textContent = 
        `${status.repoCount} repositories cached`;
      
      if (status.lastUpdated) {
        const date = new Date(status.lastUpdated);
        document.getElementById('cacheTime').textContent = 
          `Last updated: ${formatDate(date)}`;
      }
    } else if (status.githubUsername) {
      document.getElementById('cacheStatus').textContent = 'Not cached yet';
      document.getElementById('cacheTime').textContent = 'Click Refresh to fetch data';
    } else {
      document.getElementById('cacheStatus').textContent = 'No GitHub username set';
      document.getElementById('cacheTime').textContent = '';
    }
  }
}

// === Event Listeners ===

function setupEventListeners() {
  // Toggle API key visibility
  document.getElementById('toggleApiKey').addEventListener('click', () => {
    const input = document.getElementById('apiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // Toggle GitHub token visibility
  document.getElementById('toggleGithubToken').addEventListener('click', () => {
    const input = document.getElementById('githubToken');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // Add project
  document.getElementById('addProject').addEventListener('click', addProject);
  
  // Add other link
  document.getElementById('addLink').addEventListener('click', addOtherLink);
  
  // Resume file upload
  document.getElementById('resumeFile').addEventListener('change', handleResumeUpload);
  
  // Clear resume
  document.getElementById('clearResume').addEventListener('click', clearResume);
  
  // Refresh cache
  document.getElementById('refreshCache').addEventListener('click', async () => {
    try {
      await refreshCache();
    } catch (error) {
      showStatus(`Error: ${error.message}`, true);
    }
  });
  
  // History actions
  document.getElementById('viewHistory').addEventListener('click', viewHistory);
  document.getElementById('exportHistory').addEventListener('click', exportHistory);
  document.getElementById('clearHistory').addEventListener('click', clearHistory);
  
  // Save settings
  document.getElementById('saveSettings').addEventListener('click', saveAllSettings);
}

// === Project Management ===

function renderProjectList(projects) {
  const container = document.getElementById('deployedProjectsList');
  container.innerHTML = '';
  
  projects.forEach((project, index) => {
    const item = document.createElement('div');
    item.className = 'project-item';
    item.innerHTML = `
      <span class="project-name">${escapeHtml(project.name || 'Unnamed')}</span>
      <span class="project-url">${escapeHtml(project.url)}</span>
      <button class="remove-btn" data-index="${index}" title="Remove">×</button>
    `;
    container.appendChild(item);
  });

  // Add remove handlers
  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeProject(parseInt(btn.dataset.index)));
  });
}

function addProject() {
  const nameInput = document.getElementById('newProjectName');
  const urlInput = document.getElementById('newProjectUrl');
  
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  
  if (!url) {
    showStatus('Project URL is required', true);
    return;
  }
  
  // Validate URL
  try {
    new URL(url);
  } catch {
    showStatus('Invalid URL format', true);
    return;
  }

  const projects = getProjectsFromDOM();
  projects.push({ name: name || extractNameFromUrl(url), url });
  renderProjectList(projects);
  
  nameInput.value = '';
  urlInput.value = '';
}

function removeProject(index) {
  const projects = getProjectsFromDOM();
  projects.splice(index, 1);
  renderProjectList(projects);
}

function getProjectsFromDOM() {
  const items = document.querySelectorAll('.project-item');
  return Array.from(items).map(item => ({
    name: item.querySelector('.project-name').textContent,
    url: item.querySelector('.project-url').textContent
  }));
}

function extractNameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.split('/').filter(Boolean);
    return path[path.length - 1] || urlObj.hostname;
  } catch {
    return 'Project';
  }
}

// === Other Links Management ===

function renderOtherLinksList(links) {
  const container = document.getElementById('otherLinksList');
  container.innerHTML = '';
  
  links.forEach((link, index) => {
    const item = document.createElement('div');
    item.className = 'project-item';
    item.innerHTML = `
      <span class="project-name">${escapeHtml(link.name || 'Unnamed')}</span>
      <span class="project-url">${escapeHtml(link.url)}</span>
      <button class="remove-btn" data-index="${index}" title="Remove">×</button>
    `;
    container.appendChild(item);
  });

  // Add remove handlers
  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeOtherLink(parseInt(btn.dataset.index)));
  });
}

function addOtherLink() {
  const nameInput = document.getElementById('newLinkName');
  const urlInput = document.getElementById('newLinkUrl');
  
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  
  if (!url) {
    showStatus('Link URL is required', true);
    return;
  }
  
  if (!name) {
    showStatus('Link name is required', true);
    return;
  }
  
  // Validate URL
  try {
    new URL(url);
  } catch {
    showStatus('Invalid URL format', true);
    return;
  }

  const links = getOtherLinksFromDOM();
  links.push({ name, url });
  renderOtherLinksList(links);
  
  nameInput.value = '';
  urlInput.value = '';
}

function removeOtherLink(index) {
  const links = getOtherLinksFromDOM();
  links.splice(index, 1);
  renderOtherLinksList(links);
}

function getOtherLinksFromDOM() {
  const items = document.getElementById('otherLinksList').querySelectorAll('.project-item');
  return Array.from(items).map(item => ({
    name: item.querySelector('.project-name').textContent,
    url: item.querySelector('.project-url').textContent
  }));
}

// === Resume Handling ===

async function handleResumeUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const fileName = file.name;
  const extension = fileName.split('.').pop().toLowerCase();

  try {
    let text = '';
    
    if (extension === 'tex' || extension === 'txt') {
      text = await readFileAsText(file);
      // Clean up LaTeX for .tex files
      if (extension === 'tex') {
        text = cleanLatex(text);
      }
    } else if (extension === 'pdf') {
      text = await extractPdfText(file);
    } else {
      showStatus('Unsupported file type. Use .tex, .pdf, or .txt', true);
      return;
    }

    document.getElementById('currentResumeFile').textContent = fileName;
    document.getElementById('clearResume').style.display = 'inline';
    document.getElementById('resumePreview').value = text.substring(0, 2000) + 
      (text.length > 2000 ? '\n...(truncated)' : '');
    document.getElementById('resumePreviewContainer').style.display = 'block';

    // Store temporarily until save
    document.getElementById('resumeFile').dataset.text = text;
    document.getElementById('resumeFile').dataset.fileName = fileName;
    
    showStatus('Resume loaded. Click Save to apply.');
  } catch (error) {
    showStatus(`Failed to read file: ${error.message}`, true);
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

async function extractPdfText(file) {
  // Check if PDF.js is available
  if (typeof pdfjsLib === 'undefined') {
    // Try to load it
    try {
      await loadPdfJs();
    } catch {
      throw new Error('PDF support not available. Use .tex or .txt files instead.');
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  
  return text.trim();
}

async function loadPdfJs() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '../lib/pdfjs/pdf.min.js';
    script.onload = () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdfjs/pdf.worker.min.js';
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function cleanLatex(text) {
  // Remove common LaTeX commands while preserving content
  return text
    // Remove document class and packages
    .replace(/\\documentclass.*?\n/g, '')
    .replace(/\\usepackage.*?\n/g, '')
    // Remove begin/end environments but keep content
    .replace(/\\begin\{document\}/g, '')
    .replace(/\\end\{document\}/g, '')
    .replace(/\\begin\{[^}]+\}/g, '')
    .replace(/\\end\{[^}]+\}/g, '')
    // Convert sections to text
    .replace(/\\section\*?\{([^}]+)\}/g, '\n$1\n')
    .replace(/\\subsection\*?\{([^}]+)\}/g, '\n$1\n')
    // Convert text formatting
    .replace(/\\textbf\{([^}]+)\}/g, '$1')
    .replace(/\\textit\{([^}]+)\}/g, '$1')
    .replace(/\\emph\{([^}]+)\}/g, '$1')
    .replace(/\\href\{[^}]+\}\{([^}]+)\}/g, '$1')
    // Remove common commands
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, '')
    // Clean up
    .replace(/[{}]/g, '')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

function clearResume() {
  document.getElementById('resumeFile').value = '';
  document.getElementById('resumeFile').dataset.text = '';
  document.getElementById('resumeFile').dataset.fileName = '';
  document.getElementById('currentResumeFile').textContent = 'No file uploaded';
  document.getElementById('clearResume').style.display = 'none';
  document.getElementById('resumePreviewContainer').style.display = 'none';
}

// === Cache ===

async function refreshCache() {
  const button = document.getElementById('refreshCache');
  const errorEl = document.getElementById('cacheError');
  
  button.disabled = true;
  button.textContent = 'Refreshing...';
  errorEl.style.display = 'none';

  try {
    const response = await browser.runtime.sendMessage({ action: 'refreshCache' });
    
    if (response.success) {
      showStatus(response.message);
      await updateCacheStatus();
    } else {
      errorEl.textContent = response.error;
      errorEl.style.display = 'block';
      showStatus(response.error, true);
    }
  } catch (error) {
    const errorMsg = `Refresh failed: ${error.message}`;
    errorEl.textContent = errorMsg;
    errorEl.style.display = 'block';
    showStatus(errorMsg, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Refresh Now';
  }
}

// === History ===

function viewHistory() {
  browser.tabs.create({ url: browser.runtime.getURL('history/history.html') });
}

async function exportHistory() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'exportHistory' });
    
    if (response.success) {
      const blob = new Blob([response.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = `aiply-history-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      showStatus('History exported');
    }
  } catch (error) {
    showStatus(`Export failed: ${error.message}`, true);
  }
}

async function clearHistory() {
  if (!confirm('Are you sure you want to delete all history? This cannot be undone.')) {
    return;
  }

  try {
    await browser.runtime.sendMessage({ action: 'clearHistory' });
    showStatus('History cleared');
  } catch (error) {
    showStatus(`Failed to clear history: ${error.message}`, true);
  }
}

// === Save ===

async function saveAllSettings() {
  const button = document.getElementById('saveSettings');
  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    // Get current profile to check if GitHub username changed
    const existingProfile = await browser.runtime.sendMessage({ action: 'getProfile' });
    const oldGithubUsername = existingProfile?.githubUsername;
    const newGithubUsername = document.getElementById('githubUsername').value.trim();
    
    // Save settings
    await browser.runtime.sendMessage({
      action: 'saveSettings',
      data: {
        groqApiKey: document.getElementById('apiKey').value.trim(),
        githubToken: document.getElementById('githubToken').value.trim(),
        historyRetentionDays: parseInt(document.getElementById('historyRetention').value) || 90
      }
    });

    // Save profile
    const resumeFileInput = document.getElementById('resumeFile');
    const profile = {
      // Personal info
      firstName: document.getElementById('firstName').value.trim(),
      middleName: document.getElementById('middleName').value.trim(),
      lastName: document.getElementById('lastName').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      // Profile links
      githubUsername: newGithubUsername,
      linkedinUrl: document.getElementById('linkedinUrl').value.trim(),
      twitterUrl: document.getElementById('twitterUrl').value.trim(),
      portfolioUrl: document.getElementById('portfolioUrl').value.trim(),
      otherLinks: getOtherLinksFromDOM(),
      // Projects
      deployedProjects: getProjectsFromDOM(),
      // Resume
      resumeText: resumeFileInput.dataset.text || '',
      resumeFileName: resumeFileInput.dataset.fileName || ''
    };

    // Preserve existing resume if not changed
    if (!profile.resumeText) {
      if (existingProfile && existingProfile.resumeText) {
        profile.resumeText = existingProfile.resumeText;
        profile.resumeFileName = existingProfile.resumeFileName;
      }
    }

    await browser.runtime.sendMessage({
      action: 'saveProfile',
      data: profile
    });

    showStatus('Settings saved');
    
    // Auto-refresh cache if GitHub username changed or is newly set
    if (newGithubUsername && newGithubUsername !== oldGithubUsername) {
      showStatus('Settings saved. Refreshing GitHub cache...');
      await new Promise(resolve => setTimeout(resolve, 500));
      await refreshCache();
    } else {
      await updateCacheStatus();
    }
  } catch (error) {
    showStatus(`Failed to save: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Save Settings';
  }
}

// === Utilities ===

function showStatus(message, isError = false) {
  const status = document.getElementById('saveStatus');
  status.textContent = message;
  status.className = isError ? 'save-status error' : 'save-status';
  
  setTimeout(() => {
    status.textContent = '';
  }, 3000);
}

function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
  
  return date.toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
