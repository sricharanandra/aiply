// Aiply Options Page

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    await loadSettings();
    await loadProfile();
    await updateCacheStatus();
  } catch (error) {
    showStatus(`Failed to load settings: ${error.message}`, true);
  }
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

  document.getElementById('firstName').value = profile.firstName || '';
  document.getElementById('middleName').value = profile.middleName || '';
  document.getElementById('lastName').value = profile.lastName || '';
  document.getElementById('email').value = profile.email || '';
  document.getElementById('phone').value = profile.phone || '';

  document.getElementById('githubUsername').value = profile.githubUsername || '';
  document.getElementById('linkedinUrl').value = profile.linkedinUrl || '';
  document.getElementById('twitterUrl').value = profile.twitterUrl || '';
  document.getElementById('portfolioUrl').value = profile.portfolioUrl || '';

  renderOtherLinksList(profile.otherLinks || []);
  renderProjectList(profile.deployedProjects || []);

  if (profile.resumeFileName) {
    document.getElementById('currentResumeFile').textContent = profile.resumeFileName;
    document.getElementById('clearResume').style.display = 'inline';

    if (profile.resumeText) {
      document.getElementById('resumePreview').value = profile.resumeText.substring(0, 2000) +
        (profile.resumeText.length > 2000 ? '\n...(truncated)' : '');
      document.getElementById('resumePreviewContainer').style.display = 'block';
    }
  }

  loadAdditionalContext(profile);
}

async function updateCacheStatus() {
  try {
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
  } catch (error) {
    document.getElementById('cacheStatus').textContent = 'Error loading cache status';
  }
}

// === Event Listeners ===

function setupEventListeners() {
  document.getElementById('toggleApiKey').addEventListener('click', () => {
    const input = document.getElementById('apiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('toggleGithubToken').addEventListener('click', () => {
    const input = document.getElementById('githubToken');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('addProject').addEventListener('click', addProject);
  document.getElementById('addLink').addEventListener('click', addOtherLink);

  document.getElementById('addResearch').addEventListener('click', () => {
    addContextItem('researchPapersList', 'newResearchTitle', 'newResearchDescription', 'newResearchUrl');
  });
  document.getElementById('addCertification').addEventListener('click', () => {
    addContextItem('certificationsList', 'newCertificationTitle', 'newCertificationDescription', 'newCertificationUrl');
  });
  document.getElementById('addAchievement').addEventListener('click', () => {
    addContextItem('achievementsList', 'newAchievementTitle', 'newAchievementDescription', null);
  });

  document.getElementById('resumeFile').addEventListener('change', handleResumeUpload);
  document.getElementById('clearResume').addEventListener('click', clearResume);

  document.getElementById('refreshCache').addEventListener('click', async () => {
    try {
      await refreshCache();
    } catch (error) {
      showStatus(`Error: ${error.message}`, true);
    }
  });

  document.getElementById('viewHistory').addEventListener('click', viewHistory);
  document.getElementById('exportHistory').addEventListener('click', exportHistory);
  document.getElementById('clearHistory').addEventListener('click', clearHistory);

  document.getElementById('saveSettings').addEventListener('click', saveAllSettings);

  document.getElementById('exportData').addEventListener('click', exportAllData);
  document.getElementById('importData').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importAllData);
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
  const items = document.getElementById('deployedProjectsList').querySelectorAll('.project-item');
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

// === Additional Context Management ===

function renderContextList(listId, items) {
  const container = document.getElementById(listId);
  container.innerHTML = '';

  items.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'project-item';
    el.innerHTML = `
      <span class="project-name">${escapeHtml(item.title)}</span>
      <span class="project-url">${escapeHtml(item.description || '')}${item.url ? ' - ' + escapeHtml(item.url) : ''}</span>
      <button class="remove-btn" data-index="${index}" title="Remove">x</button>
    `;
    container.appendChild(el);
  });

  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeContextItem(listId, parseInt(btn.dataset.index)));
  });
}

function getContextListFromDOM(listId) {
  const items = document.getElementById(listId).querySelectorAll('.project-item');
  return Array.from(items).map(item => {
    const urlElement = item.querySelector('.project-url');
    const urlText = urlElement ? urlElement.textContent : '';
    const lastDashIdx = urlText.lastIndexOf(' - ');
    if (lastDashIdx !== -1) {
      const potentialUrl = urlText.substring(lastDashIdx + 3);
      if (potentialUrl.startsWith('http://') || potentialUrl.startsWith('https://')) {
        return {
          title: item.querySelector('.project-name').textContent,
          description: urlText.substring(0, lastDashIdx),
          url: potentialUrl
        };
      }
    }
    return {
      title: item.querySelector('.project-name').textContent,
      description: urlText,
      url: null
    };
  });
}

function removeContextItem(listId, index) {
  const items = getContextListFromDOM(listId);
  items.splice(index, 1);
  renderContextList(listId, items);
}

function addContextItem(listId, titleId, descriptionId, urlId) {
  const titleInput = document.getElementById(titleId);
  const descriptionInput = document.getElementById(descriptionId);
  const urlInput = urlId ? document.getElementById(urlId) : null;

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const url = urlInput ? urlInput.value.trim() : '';

  if (!title) {
    showStatus('Title is required', true);
    return;
  }

  if (url) {
    try {
      new URL(url);
    } catch {
      showStatus('Invalid URL format', true);
      return;
    }
  }

  const items = getContextListFromDOM(listId);
  items.push({ title, description, url: url || null });
  renderContextList(listId, items);

  titleInput.value = '';
  descriptionInput.value = '';
  if (urlInput) urlInput.value = '';
}

function loadAdditionalContext(profile) {
  const researchPapers = [
    ...(profile.researchPapers || []),
    ...(profile.publications || [])
  ];
  renderContextList('researchPapersList', researchPapers);
  renderContextList('certificationsList', profile.certifications || []);
  renderContextList('achievementsList', profile.achievements || []);
  document.getElementById('otherContext').value = profile.otherContext || '';
}

function getAdditionalContextFromProfile() {
  return {
    researchPapers: getContextListFromDOM('researchPapersList'),
    certifications: getContextListFromDOM('certificationsList'),
    achievements: getContextListFromDOM('achievementsList'),
    otherContext: document.getElementById('otherContext').value.trim()
  };
}

// === Resume Handling ===

async function handleResumeUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    showStatus('File too large. Maximum size is 50MB.', true);
    event.target.value = '';
    return;
  }

  const fileName = file.name;
  const extension = fileName.split('.').pop().toLowerCase();

  try {
    let text = '';

    if (extension === 'tex' || extension === 'txt') {
      text = await readFileAsText(file);
      if (extension === 'tex') {
        text = cleanLatex(text);
      }
    } else if (extension === 'pdf') {
      text = await extractPdfText(file);
    } else {
      showStatus('Unsupported file type. Use .tex, .pdf, or .txt', true);
      event.target.value = '';
      return;
    }

    document.getElementById('currentResumeFile').textContent = fileName;
    document.getElementById('clearResume').style.display = 'inline';
    document.getElementById('resumePreview').value = text.substring(0, 2000) +
      (text.length > 2000 ? '\n...(truncated)' : '');
    document.getElementById('resumePreviewContainer').style.display = 'block';

    document.getElementById('resumeFile').dataset.text = text;
    document.getElementById('resumeFile').dataset.fileName = fileName;

    showStatus('Resume loaded. Click Save to apply.');
  } catch (error) {
    showStatus(`Failed to read file: ${error.message}`, true);
  } finally {
    event.target.value = '';
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

let pdfJsLoading = false;

async function extractPdfText(file) {
  if (typeof pdfjsLib === 'undefined') {
    if (!pdfJsLoading) {
      pdfJsLoading = true;
      try {
        await loadPdfJs();
      } catch {
        pdfJsLoading = false;
        throw new Error('PDF support not available. Use .tex or .txt files instead.');
      }
      pdfJsLoading = false;
    } else {
      await new Promise(resolve => {
        const check = () => {
          if (typeof pdfjsLib !== 'undefined') resolve();
          else setTimeout(check, 100);
        };
        check();
      });
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
  let result = text
    .replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}\s*/g, '')
    .replace(/\\usepackage(?:\[[^\]]*\])?\{[^}]*\}\s*/g, '')
    .replace(/\\begin\{document\}/g, '')
    .replace(/\\end\{document\}/g, '')
    .replace(/\\begin\{[^}]+\}/g, '')
    .replace(/\\end\{[^}]+\}/g, '')
    .replace(/\\section\*?\{([^}]+)\}/g, '\n$1\n')
    .replace(/\\subsection\*?\{([^}]+)\}/g, '\n$1\n')
    .replace(/\\textbf\{([^}]+)\}/g, '$1')
    .replace(/\\textit\{([^}]+)\}/g, '$1')
    .replace(/\\emph\{([^}]+)\}/g, '$1')
    .replace(/\\href\{([^}]+)\}\{([^}]+)\}/g, '$2')
    .replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  return result;
}

let resumeCleared = false;

function clearResume() {
  document.getElementById('resumeFile').value = '';
  document.getElementById('resumeFile').dataset.text = '';
  document.getElementById('resumeFile').dataset.fileName = '';
  document.getElementById('currentResumeFile').textContent = 'No file uploaded';
  document.getElementById('clearResume').style.display = 'none';
  document.getElementById('resumePreviewContainer').style.display = 'none';
  resumeCleared = true;
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

      const a = document.createElement('a');
      a.href = url;
      a.download = `aiply-history-${new Date().toISOString().split('T')[0]}.json`;
      a.click();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    const existingProfile = await browser.runtime.sendMessage({ action: 'getProfile' });
    const oldGithubUsername = existingProfile?.githubUsername;
    const newGithubUsername = document.getElementById('githubUsername').value.trim();

    await browser.runtime.sendMessage({
      action: 'saveSettings',
      data: {
        groqApiKey: document.getElementById('apiKey').value.trim(),
        githubToken: document.getElementById('githubToken').value.trim(),
        historyRetentionDays: parseInt(document.getElementById('historyRetention').value) || 90
      }
    });

    const resumeFileInput = document.getElementById('resumeFile');
    const additionalContext = getAdditionalContextFromProfile();
    const profile = {
      firstName: document.getElementById('firstName').value.trim(),
      middleName: document.getElementById('middleName').value.trim(),
      lastName: document.getElementById('lastName').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      githubUsername: newGithubUsername,
      linkedinUrl: document.getElementById('linkedinUrl').value.trim(),
      twitterUrl: document.getElementById('twitterUrl').value.trim(),
      portfolioUrl: document.getElementById('portfolioUrl').value.trim(),
      otherLinks: getOtherLinksFromDOM(),
      deployedProjects: getProjectsFromDOM(),
      researchPapers: additionalContext.researchPapers,
      certifications: additionalContext.certifications,
      achievements: additionalContext.achievements,
      otherContext: additionalContext.otherContext,
      resumeText: resumeFileInput.dataset.text || '',
      resumeFileName: resumeFileInput.dataset.fileName || ''
    };

    if (!profile.resumeText && !resumeCleared) {
      if (existingProfile && existingProfile.resumeText) {
        profile.resumeText = existingProfile.resumeText;
        profile.resumeFileName = existingProfile.resumeFileName;
      }
    }

    resumeCleared = false;

    await browser.runtime.sendMessage({
      action: 'saveProfile',
      data: profile
    });

    showStatus('Settings saved');

    if (newGithubUsername && newGithubUsername !== oldGithubUsername) {
      showStatus('Settings saved. Refreshing GitHub cache...');
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        await refreshCache();
      } catch (e) {
        showStatus(`Settings saved but cache refresh failed: ${e.message}`, true);
      }
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

// === Export/Import ===

async function exportAllData() {
  try {
    const settings = await browser.runtime.sendMessage({ action: 'getSettings' });
    const profile = await browser.runtime.sendMessage({ action: 'getProfile' });

    const exportSettings = { ...settings };
    delete exportSettings.groqApiKey;
    delete exportSettings.githubToken;

    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: exportSettings,
      profile
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `aiply-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus('Data exported (API keys excluded for security)');
  } catch (error) {
    showStatus(`Export failed: ${error.message}`, true);
  }
}

async function importAllData(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!confirm('This will overwrite all current settings and profile data. Are you sure? This cannot be undone.')) {
    event.target.value = '';
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.settings || !data.profile) {
      throw new Error('Invalid backup file format');
    }

    await browser.runtime.sendMessage({
      action: 'saveSettings',
      data: data.settings
    });

    await browser.runtime.sendMessage({
      action: 'saveProfile',
      data: data.profile
    });

    showStatus('Data imported successfully. Reloading...');

    setTimeout(() => {
      window.location.reload();
    }, 1000);

  } catch (error) {
    showStatus(`Import failed: ${error.message}`, true);
  }

  event.target.value = '';
}
