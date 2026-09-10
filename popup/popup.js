// Aiply Popup Script

const DRAFT_STORAGE_KEY = 'popupDraft';
const APP_DRAFT_STORAGE_KEY = 'applicationDraft';
const CL_DRAFT_STORAGE_KEY = 'coverLetterDraft';
const AZ_DRAFT_STORAGE_KEY = 'analyzerDraft';
const MODE_STORAGE_KEY = 'popupMode';
const DRAFT_EXPIRY_MS = 60 * 60 * 1000;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const isConfigured = await checkConfiguration();

  if (!isConfigured) {
    document.getElementById('setupRequired').style.display = 'block';
    document.getElementById('modeTabs').style.display = 'none';
    document.getElementById('emailMode').style.display = 'none';
    document.getElementById('applicationMode').style.display = 'none';
    document.getElementById('coverLetterMode').style.display = 'none';
    document.getElementById('analyzerMode').style.display = 'none';
    return;
  }

  await restoreMode();
  await restoreDraft();
  await restoreAppDraft();
  await restoreCLDraft();
  await restoreAzDraft();
  setupEventListeners();
}

async function checkConfiguration() {
  try {
    const settings = await browser.runtime.sendMessage({ action: 'getSettings' });
    return settings && settings.groqApiKey && settings.groqApiKey.length > 0;
  } catch {
    return false;
  }
}

// === Mode Management ===

async function restoreMode() {
  try {
    const storage = await browser.storage.local.get(MODE_STORAGE_KEY);
    const mode = storage[MODE_STORAGE_KEY] || 'email';
    switchMode(mode, false);
  } catch {
    switchMode('email', false);
  }
}

async function saveMode(mode) {
  await browser.storage.local.set({ [MODE_STORAGE_KEY]: mode });
}

function switchMode(mode, save = true) {
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });

  document.getElementById('emailMode').style.display = mode === 'email' ? 'block' : 'none';
  document.getElementById('applicationMode').style.display = mode === 'application' ? 'block' : 'none';
  document.getElementById('coverLetterMode').style.display = mode === 'coverletter' ? 'block' : 'none';
  document.getElementById('analyzerMode').style.display = mode === 'analyzer' ? 'block' : 'none';

  if (save) {
    saveMode(mode);
  }
}

// === Draft Persistence (Email Mode) ===

async function saveDraft() {
  const draft = {
    question: document.getElementById('question').value,
    company: document.getElementById('company').value,
    jobDescription: document.getElementById('jobDescription').value,
    customInstructions: document.getElementById('customInstructions').value,
    jdExpanded: document.getElementById('jdContent').style.display !== 'none',
    instructionsExpanded: document.getElementById('instructionsContent').style.display !== 'none',
    tone: document.getElementById('toneSelectEmail').value,
    length: document.getElementById('lengthSelectEmail').value,
    output: document.getElementById('output').textContent,
    outputVisible: document.getElementById('outputSection').style.display !== 'none',
    timestamp: Date.now()
  };

  await browser.storage.local.set({ [DRAFT_STORAGE_KEY]: draft });
}

async function restoreDraft() {
  try {
    const storage = await browser.storage.local.get(DRAFT_STORAGE_KEY);
    const draft = storage[DRAFT_STORAGE_KEY];

    if (!draft) return;

    const age = Date.now() - (draft.timestamp || 0);
    if (age > DRAFT_EXPIRY_MS) {
      await clearDraft();
      return;
    }

    document.getElementById('question').value = draft.question || '';
    document.getElementById('company').value = draft.company || '';
    document.getElementById('jobDescription').value = draft.jobDescription || '';
    document.getElementById('customInstructions').value = draft.customInstructions || '';

    if (draft.tone) {
      document.getElementById('toneSelectEmail').value = draft.tone;
    }

    if (draft.length) {
      document.getElementById('lengthSelectEmail').value = draft.length;
    }

    if (draft.jdExpanded) {
      document.getElementById('jdContent').classList.add('open');
      document.getElementById('toggleJD').classList.add('active');
    }

    if (draft.instructionsExpanded) {
      document.getElementById('instructionsContent').classList.add('open');
      document.getElementById('toggleInstructions').classList.add('active');
    }

    if (draft.outputVisible && draft.output) {
      document.getElementById('output').textContent = draft.output;
      document.getElementById('outputSection').style.display = 'block';
    }
  } catch (e) {}
}

async function clearDraft() {
  await browser.storage.local.remove(DRAFT_STORAGE_KEY);
}

// === Draft Persistence (Cover Letter Mode) ===

async function saveCLDraft() {
  const draft = {
    company: document.getElementById('clCompany').value,
    jobDescription: document.getElementById('clJobDescription').value,
    customInstructions: document.getElementById('clCustomInstructions').value,
    jdExpanded: document.getElementById('clJDContent').style.display !== 'none',
    instructionsExpanded: document.getElementById('clInstructionsContent').style.display !== 'none',
    tone: document.getElementById('toneSelectCL').value,
    length: document.getElementById('lengthSelectCL').value,
    output: document.getElementById('clOutput').textContent,
    outputVisible: document.getElementById('clOutputSection').style.display !== 'none',
    timestamp: Date.now()
  };

  await browser.storage.local.set({ [CL_DRAFT_STORAGE_KEY]: draft });
}

async function restoreCLDraft() {
  try {
    const storage = await browser.storage.local.get(CL_DRAFT_STORAGE_KEY);
    const draft = storage[CL_DRAFT_STORAGE_KEY];

    if (!draft) return;

    const age = Date.now() - (draft.timestamp || 0);
    if (age > DRAFT_EXPIRY_MS) {
      await clearCLDraft();
      return;
    }

    document.getElementById('clCompany').value = draft.company || '';
    document.getElementById('clJobDescription').value = draft.jobDescription || '';
    document.getElementById('clCustomInstructions').value = draft.customInstructions || '';

    if (draft.tone) {
      document.getElementById('toneSelectCL').value = draft.tone;
    }

    if (draft.length) {
      document.getElementById('lengthSelectCL').value = draft.length;
    }

    if (draft.jdExpanded) {
      document.getElementById('clJDContent').classList.add('open');
      document.getElementById('toggleCLJD').classList.add('active');
    }

    if (draft.instructionsExpanded) {
      document.getElementById('clInstructionsContent').classList.add('open');
      document.getElementById('toggleCLInstructions').classList.add('active');
    }

    if (draft.outputVisible && draft.output) {
      document.getElementById('clOutput').textContent = draft.output;
      document.getElementById('clOutputSection').style.display = 'block';
    }
  } catch (e) {}
}

async function clearCLDraft() {
  await browser.storage.local.remove(CL_DRAFT_STORAGE_KEY);
}

// === Draft Persistence (Analyzer Mode) ===

async function saveAzDraft() {
  const draft = {
    company: document.getElementById('azCompany').value,
    companyUrl: document.getElementById('azCompanyUrl').value,
    jobDescription: document.getElementById('azJobDescription').value,
    analysis: window.azAnalysis || null,
    timestamp: Date.now()
  };

  await browser.storage.local.set({ [AZ_DRAFT_STORAGE_KEY]: draft });
}

async function restoreAzDraft() {
  try {
    const storage = await browser.storage.local.get(AZ_DRAFT_STORAGE_KEY);
    const draft = storage[AZ_DRAFT_STORAGE_KEY];

    if (!draft) return;

    const age = Date.now() - (draft.timestamp || 0);
    if (age > DRAFT_EXPIRY_MS) {
      await clearAzDraft();
      return;
    }

    document.getElementById('azCompany').value = draft.company || '';
    document.getElementById('azCompanyUrl').value = draft.companyUrl || '';
    document.getElementById('azJobDescription').value = draft.jobDescription || '';

    if (draft.analysis) {
      window.azAnalysis = draft.analysis;
      displayAzResults(draft.analysis);
    }
  } catch (e) {}
}

async function clearAzDraft() {
  window.azAnalysis = null;
  await browser.storage.local.remove(AZ_DRAFT_STORAGE_KEY);
}

function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

const debouncedSaveDraft = debounce(saveDraft, 300);
const debouncedSaveCLDraft = debounce(saveCLDraft, 300);
const debouncedSaveAzDraft = debounce(saveAzDraft, 300);

// === Draft Persistence (Application Mode) ===

let analyzedData = null;

async function saveAppDraft() {
  const data = analyzedData;
  if (!data) return;

  const draft = {
    analyzedData: data,
    timestamp: Date.now()
  };

  await browser.storage.local.set({ [APP_DRAFT_STORAGE_KEY]: draft });
}

async function restoreAppDraft() {
  try {
    const storage = await browser.storage.local.get(APP_DRAFT_STORAGE_KEY);
    const draft = storage[APP_DRAFT_STORAGE_KEY];

    if (!draft || !draft.analyzedData) return;

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const currentUrl = tab?.url || '';

    if (draft.analyzedData.pageUrl && currentUrl && !urlsMatch(draft.analyzedData.pageUrl, currentUrl)) {
      await clearAppDraft();
      return;
    }

    const age = Date.now() - (draft.timestamp || 0);
    if (age > DRAFT_EXPIRY_MS) {
      await clearAppDraft();
      return;
    }

    analyzedData = draft.analyzedData;
    displayAnalyzedData(analyzedData);

  } catch (e) {
    console.error('Failed to restore app draft:', e);
  }
}

function urlsMatch(url1, url2) {
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    return u1.origin === u2.origin && u1.pathname === u2.pathname;
  } catch {
    return url1 === url2;
  }
}

async function clearAppDraft() {
  analyzedData = null;
  await browser.storage.local.remove(APP_DRAFT_STORAGE_KEY);

  document.getElementById('pageInfoSection').style.display = 'none';
  document.getElementById('questionsSection').style.display = 'none';
  document.getElementById('profileFieldsSection').style.display = 'none';
  document.getElementById('noQuestionsSection').style.display = 'none';
  hideAppError();
}

// === Event Listeners ===

function setupEventListeners() {
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

  document.getElementById('historyBtn').addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('history/history.html') });
  });

  document.getElementById('goToSetup').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

  // === Email Mode Listeners ===

  document.getElementById('toggleJD').addEventListener('click', () => {
    toggleCollapsible('toggleJD', 'jdContent');
    debouncedSaveDraft();
  });

  document.getElementById('toggleInstructions').addEventListener('click', () => {
    toggleCollapsible('toggleInstructions', 'instructionsContent');
    debouncedSaveDraft();
  });

  const inputs = ['question', 'company', 'jobDescription', 'customInstructions'];
  inputs.forEach(id => {
    document.getElementById(id).addEventListener('input', debouncedSaveDraft);
  });

  document.getElementById('generateBtn').addEventListener('click', generateAnswer);
  document.getElementById('copyBtn').addEventListener('click', copyOutput);
  document.getElementById('clearBtn')?.addEventListener('click', clearForm);

  document.getElementById('toneSelectEmail').addEventListener('change', debouncedSaveDraft);
  document.getElementById('lengthSelectEmail').addEventListener('change', debouncedSaveDraft);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      const activeMode = document.querySelector('.mode-tab.active').dataset.mode;
      if (activeMode === 'email') {
        generateAnswer();
      } else if (activeMode === 'application') {
        analyzePage();
      } else if (activeMode === 'coverletter') {
        generateCoverLetter();
      } else if (activeMode === 'analyzer') {
        analyzeJob();
      }
    }
  });

  // === Application Mode Listeners ===

  document.getElementById('analyzeBtn').addEventListener('click', analyzePage);
  document.getElementById('clearAnalysisBtn')?.addEventListener('click', clearAppDraft);
  document.getElementById('fillProfileBtn').addEventListener('click', fillAllProfileFields);

  // === Cover Letter Mode Listeners ===

  document.getElementById('toggleCLJD').addEventListener('click', () => {
    toggleCollapsible('toggleCLJD', 'clJDContent');
    debouncedSaveCLDraft();
  });

  document.getElementById('toggleCLInstructions').addEventListener('click', () => {
    toggleCollapsible('toggleCLInstructions', 'clInstructionsContent');
    debouncedSaveCLDraft();
  });

  const clInputs = ['clCompany', 'clJobDescription', 'clCustomInstructions'];
  clInputs.forEach(id => {
    document.getElementById(id).addEventListener('input', debouncedSaveCLDraft);
  });

  document.getElementById('toneSelectCL').addEventListener('change', debouncedSaveCLDraft);
  document.getElementById('lengthSelectCL').addEventListener('change', debouncedSaveCLDraft);

  document.getElementById('generateCLBtn').addEventListener('click', generateCoverLetter);
  document.getElementById('copyCLBtn').addEventListener('click', copyCLOutput);
  document.getElementById('clearCLBtn')?.addEventListener('click', clearCLForm);

  // === Analyzer Mode Listeners ===

  const azInputs = ['azCompany', 'azCompanyUrl', 'azJobDescription'];
  azInputs.forEach(id => {
    document.getElementById(id).addEventListener('input', debouncedSaveAzDraft);
  });

  document.getElementById('analyzeJobBtn').addEventListener('click', analyzeJob);
  document.getElementById('clearAzBtn')?.addEventListener('click', clearAzForm);
}

function toggleCollapsible(toggleId, contentId) {
  const toggle = document.getElementById(toggleId);
  const content = document.getElementById(contentId);

  const isOpen = content.classList.contains('open');

  content.classList.toggle('open', !isOpen);
  toggle.classList.toggle('active', !isOpen);
}

// === Email Mode Functions ===

async function generateAnswer() {
  const question = document.getElementById('question').value.trim();

  if (!question) {
    showError('Please enter a question or task.');
    return;
  }

  const button = document.getElementById('generateBtn');
  const btnText = button.querySelector('.btn-text');
  const btnLoading = button.querySelector('.btn-loading');

  button.disabled = true;
  btnText.style.display = 'none';
  btnLoading.style.display = 'inline';
  hideError();
  hideOutput();

  try {
    const data = {
      question,
      company: document.getElementById('company').value.trim(),
      jobDescription: document.getElementById('jobDescription').value.trim(),
      customInstructions: document.getElementById('customInstructions').value.trim()
    };

    const response = await browser.runtime.sendMessage({
      action: 'generateAnswer',
      data
    });

    if (response.success) {
      showOutput(response.answer);
      await saveDraft();
    } else {
      showError(response.error || 'Failed to generate answer');
    }
  } catch (error) {
    showError(error.message || 'An unexpected error occurred');
  } finally {
    button.disabled = false;
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
  }
}

function showOutput(text) {
  const section = document.getElementById('outputSection');
  const output = document.getElementById('output');

  output.textContent = text;
  section.style.display = 'block';

  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideOutput() {
  document.getElementById('outputSection').style.display = 'none';
}

function showError(message) {
  const section = document.getElementById('errorSection');
  const messageEl = document.getElementById('errorMessage');

  messageEl.textContent = message;
  section.style.display = 'block';
}

function hideError() {
  document.getElementById('errorSection').style.display = 'none';
}

async function clearForm() {
  document.getElementById('question').value = '';
  document.getElementById('company').value = '';
  document.getElementById('jobDescription').value = '';
  document.getElementById('customInstructions').value = '';
  document.getElementById('toneSelectEmail').value = 'professional-human';
  document.getElementById('lengthSelectEmail').value = 'standard';
  hideOutput();
  hideError();
  await clearDraft();
}

async function copyOutput() {
  const output = document.getElementById('output');
  const button = document.getElementById('copyBtn');

  try {
    await navigator.clipboard.writeText(output.textContent);
  } catch (error) {
    const textArea = document.createElement('textarea');
    textArea.value = output.textContent;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
  }

  const originalText = button.querySelector('span').textContent;
  button.querySelector('span').textContent = 'Copied!';
  button.classList.add('copied');

  setTimeout(() => {
    button.classList.remove('copied');
    button.querySelector('span').textContent = originalText;
  }, 2000);
}

// === Cover Letter Mode Functions ===

async function generateCoverLetter() {
  const company = document.getElementById('clCompany').value.trim();
  const jobDescription = document.getElementById('clJobDescription').value.trim();

  if (!company) {
    showCLError('Please enter a company name.');
    return;
  }

  if (!jobDescription) {
    showCLError('Please enter a job description.');
    return;
  }

  const button = document.getElementById('generateCLBtn');
  const btnText = button.querySelector('.btn-text');
  const btnLoading = button.querySelector('.btn-loading');

  button.disabled = true;
  btnText.style.display = 'none';
  btnLoading.style.display = 'inline';
  hideCLError();
  hideCLOutput();

  try {
    const data = {
      company,
      jobDescription,
      customInstructions: document.getElementById('clCustomInstructions').value.trim(),
      tone: document.getElementById('toneSelectCL').value,
      length: document.getElementById('lengthSelectCL').value
    };

    const response = await browser.runtime.sendMessage({
      action: 'generateCoverLetter',
      data
    });

    if (response.success) {
      showCLOutput(response.answer);
      await saveCLDraft();
    } else {
      showCLError(response.error || 'Failed to generate cover letter');
    }
  } catch (error) {
    showCLError(error.message || 'An unexpected error occurred');
  } finally {
    button.disabled = false;
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
  }
}

function showCLOutput(text) {
  const section = document.getElementById('clOutputSection');
  const output = document.getElementById('clOutput');

  output.textContent = text;
  section.style.display = 'block';

  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideCLOutput() {
  document.getElementById('clOutputSection').style.display = 'none';
}

function showCLError(message) {
  const section = document.getElementById('clErrorSection');
  const messageEl = document.getElementById('clErrorMessage');

  messageEl.textContent = message;
  section.style.display = 'block';
}

function hideCLError() {
  document.getElementById('clErrorSection').style.display = 'none';
}

async function clearCLForm() {
  document.getElementById('clCompany').value = '';
  document.getElementById('clJobDescription').value = '';
  document.getElementById('clCustomInstructions').value = '';
  document.getElementById('toneSelectCL').value = 'professional-human';
  document.getElementById('lengthSelectCL').value = 'standard';
  hideCLOutput();
  hideCLError();
  await clearCLDraft();
}

async function copyCLOutput() {
  const output = document.getElementById('clOutput');
  const button = document.getElementById('copyCLBtn');

  try {
    await navigator.clipboard.writeText(output.textContent);
  } catch (error) {
    const textArea = document.createElement('textarea');
    textArea.value = output.textContent;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
  }

  const originalText = button.querySelector('span').textContent;
  button.querySelector('span').textContent = 'Copied!';
  button.classList.add('copied');

  setTimeout(() => {
    button.classList.remove('copied');
    button.querySelector('span').textContent = originalText;
  }, 2000);
}

// === Analyzer Mode Functions ===

async function analyzeJob() {
  const jobDescription = document.getElementById('azJobDescription').value.trim();

  if (!jobDescription) {
    showAzError('Please enter a job description.');
    return;
  }

  const button = document.getElementById('analyzeJobBtn');
  const btnText = button.querySelector('.btn-text');
  const btnLoading = button.querySelector('.btn-loading');

  button.disabled = true;
  btnText.style.display = 'none';
  btnLoading.style.display = 'inline';
  hideAzError();

  document.getElementById('azCompanySection').style.display = 'none';
  document.getElementById('azRoleSection').style.display = 'none';
  document.getElementById('azSkillsSection').style.display = 'none';
  document.getElementById('azStrengthsSection').style.display = 'none';

  try {
    const data = {
      jobDescription,
      companyName: document.getElementById('azCompany').value.trim(),
      companyUrl: document.getElementById('azCompanyUrl').value.trim()
    };

    const response = await browser.runtime.sendMessage({
      action: 'analyzeJob',
      data
    });

    if (response.success) {
      window.azAnalysis = response.analysis;
      displayAzResults(response.analysis);
      await saveAzDraft();
    } else {
      showAzError(response.error || 'Failed to analyze job');
    }
  } catch (error) {
    showAzError(error.message || 'An unexpected error occurred');
  } finally {
    button.disabled = false;
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
  }
}

function displayAzResults(analysis) {
  const companyInfo = analysis.companyInfo || {};
  const roleDetails = analysis.roleDetails || {};
  const skills = analysis.skillsAnalysis || {};

  if (companyInfo.name && companyInfo.name !== 'Unknown') {
    document.getElementById('azCompanyDetails').innerHTML = `
      <div class="az-company-name">${escapeHtml(companyInfo.name)}</div>
      ${companyInfo.description && companyInfo.description !== 'Unknown' ? `<div class="az-company-desc">${escapeHtml(companyInfo.description)}</div>` : ''}
      <div class="az-company-meta">
        ${companyInfo.industry && companyInfo.industry !== 'Unknown' ? `<span class="az-tag">${escapeHtml(companyInfo.industry)}</span>` : ''}
        ${companyInfo.size && companyInfo.size !== 'Unknown' ? `<span class="az-tag">${escapeHtml(companyInfo.size)}</span>` : ''}
      </div>
    `;
    document.getElementById('azCompanySection').style.display = 'block';
  }

  if (roleDetails.title || roleDetails.summary) {
    let roleHtml = '';
    if (roleDetails.title) {
      roleHtml += `<div class="az-role-title">${escapeHtml(roleDetails.title)}</div>`;
    }
    if (roleDetails.summary) {
      roleHtml += `<div class="az-role-summary">${escapeHtml(roleDetails.summary)}</div>`;
    }
    if (roleDetails.responsibilities && roleDetails.responsibilities.length > 0) {
      roleHtml += `<div class="az-subsection"><div class="az-subsection-title">Responsibilities</div><ul class="az-list">`;
      roleDetails.responsibilities.forEach(r => {
        roleHtml += `<li>${escapeHtml(r)}</li>`;
      });
      roleHtml += `</ul></div>`;
    }
    if (roleDetails.qualifications && roleDetails.qualifications.length > 0) {
      roleHtml += `<div class="az-subsection"><div class="az-subsection-title">Qualifications</div><ul class="az-list">`;
      roleDetails.qualifications.forEach(q => {
        roleHtml += `<li>${escapeHtml(q)}</li>`;
      });
      roleHtml += `</ul></div>`;
    }
    document.getElementById('azRoleDetails').innerHTML = roleHtml;
    document.getElementById('azRoleSection').style.display = 'block';
  }

  const allSkills = [...(skills.requiredSkills || []), ...(skills.preferredSkills || [])];
  if (allSkills.length > 0) {
    let skillsHtml = '';

    if (skills.requiredSkills && skills.requiredSkills.length > 0) {
      skillsHtml += `<div class="az-subsection"><div class="az-subsection-title">Required Skills</div>`;
      skillsHtml += renderSkillsList(skills.requiredSkills);
      skillsHtml += `</div>`;
    }

    if (skills.preferredSkills && skills.preferredSkills.length > 0) {
      skillsHtml += `<div class="az-subsection"><div class="az-subsection-title">Preferred Skills</div>`;
      skillsHtml += renderSkillsList(skills.preferredSkills);
      skillsHtml += `</div>`;
    }

    document.getElementById('azSkillsContent').innerHTML = skillsHtml;
    document.getElementById('azSkillsSection').style.display = 'block';
  }

  const hasStrengths = skills.strengthAreas && skills.strengthAreas.length > 0;
  const hasGaps = skills.missingCriticalSkills && skills.missingCriticalSkills.length > 0;
  if (hasStrengths || hasGaps) {
    let strengthsHtml = '';

    if (hasStrengths) {
      strengthsHtml += `<div class="az-subsection"><div class="az-subsection-title az-strengths-title">Strengths</div><ul class="az-list az-strengths-list">`;
      skills.strengthAreas.forEach(s => {
        strengthsHtml += `<li>${escapeHtml(s)}</li>`;
      });
      strengthsHtml += `</ul></div>`;
    }

    if (hasGaps) {
      strengthsHtml += `<div class="az-subsection"><div class="az-subsection-title az-gaps-title">Gaps to Address</div><ul class="az-list az-gaps-list">`;
      skills.missingCriticalSkills.forEach(g => {
        strengthsHtml += `<li>${escapeHtml(g)}</li>`;
      });
      strengthsHtml += `</ul></div>`;
    }

    document.getElementById('azStrengthsContent').innerHTML = strengthsHtml;
    document.getElementById('azStrengthsSection').style.display = 'block';
  }
}

function renderSkillsList(skills) {
  let html = '<div class="az-skills-list">';
  skills.forEach(skill => {
    const statusClass = skill.matchStatus === 'match' ? 'az-skill-match' :
                        skill.matchStatus === 'partial' ? 'az-skill-partial' : 'az-skill-gap';
    const statusLabel = skill.matchStatus === 'match' ? 'Match' :
                        skill.matchStatus === 'partial' ? 'Partial' : 'Gap';

    html += `<div class="az-skill-item ${statusClass}">
      <div class="az-skill-header">
        <span class="az-skill-name">${escapeHtml(skill.name)}</span>
        <span class="az-skill-category">${escapeHtml(skill.category || '')}</span>
        <span class="az-skill-badge">${statusLabel}</span>
      </div>
      <div class="az-skill-evidence">${escapeHtml(skill.evidence || '')}</div>
    </div>`;
  });
  html += '</div>';
  return html;
}

async function clearAzForm() {
  document.getElementById('azCompany').value = '';
  document.getElementById('azCompanyUrl').value = '';
  document.getElementById('azJobDescription').value = '';
  window.azAnalysis = null;
  document.getElementById('azCompanySection').style.display = 'none';
  document.getElementById('azRoleSection').style.display = 'none';
  document.getElementById('azSkillsSection').style.display = 'none';
  document.getElementById('azStrengthsSection').style.display = 'none';
  hideAzError();
  await clearAzDraft();
}

function showAzError(message) {
  const section = document.getElementById('azErrorSection');
  const messageEl = document.getElementById('azErrorMessage');
  messageEl.textContent = message;
  section.style.display = 'block';
}

function hideAzError() {
  document.getElementById('azErrorSection').style.display = 'none';
}

// === Application Mode Functions ===

function isContentScriptError(error) {
  const msg = error.message || '';
  return msg.includes('Receiving end does not exist') ||
         msg.includes('connection') ||
         msg.includes('Could not establish connection');
}

async function analyzePage() {
  const button = document.getElementById('analyzeBtn');
  const btnText = button.querySelector('.btn-text');
  const btnLoading = button.querySelector('.btn-loading');

  button.disabled = true;
  btnText.style.display = 'none';
  btnLoading.style.display = 'inline';
  hideAppError();

  document.getElementById('pageInfoSection').style.display = 'none';
  document.getElementById('questionsSection').style.display = 'none';
  document.getElementById('profileFieldsSection').style.display = 'none';
  document.getElementById('noQuestionsSection').style.display = 'none';

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      throw new Error('No active tab found');
    }

    btnLoading.textContent = 'Scraping page...';
    const scrapeResponse = await browser.tabs.sendMessage(tab.id, { action: 'scrape' });

    if (!scrapeResponse || !scrapeResponse.success) {
      throw new Error(scrapeResponse?.error || 'Failed to scrape page');
    }

    if (!scrapeResponse.data || typeof scrapeResponse.data !== 'object') {
      throw new Error('Invalid scrape response format');
    }

    const { pageText, formFields, title, url } = scrapeResponse.data;

    if (!pageText) {
      throw new Error('No page content found to analyze');
    }

    btnLoading.textContent = 'Analyzing questions...';
    const analyzeResponse = await browser.runtime.sendMessage({
      action: 'analyzePageQuestions',
      data: {
        pageText,
        pageTitle: title || '',
        pageUrl: url || ''
      }
    });

    if (!analyzeResponse.success) {
      throw new Error(analyzeResponse.error || 'Failed to analyze page');
    }

    analyzedData = {
      questions: analyzeResponse.questions || [],
      formFields: formFields || [],
      pageTitle: title || '',
      pageUrl: url || ''
    };

    await saveAppDraft();
    displayAnalyzedData(analyzedData);

  } catch (error) {
    if (isContentScriptError(error)) {
      showAppError('Content script not loaded. Please refresh the page and try again.');
    } else {
      showAppError(error.message || 'Failed to analyze page');
    }
  } finally {
    button.disabled = false;
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
    btnLoading.textContent = 'Analyzing...';
  }
}

function displayAnalyzedData(data) {
  if (data.pageTitle) {
    document.getElementById('pageTitle').textContent = data.pageTitle;
    document.getElementById('pageInfoSection').style.display = 'block';
  }

  const hasQuestions = data.questions && data.questions.length > 0;
  if (hasQuestions) {
    document.getElementById('questionCount').textContent = data.questions.length;
    renderQuestions(data.questions);
    document.getElementById('questionsSection').style.display = 'block';
    document.getElementById('noQuestionsSection').style.display = 'none';
  } else {
    document.getElementById('questionsSection').style.display = 'none';
    document.getElementById('noQuestionsSection').style.display = 'block';
  }

  const profileFields = (data.formFields || []).filter(f => f.isProfileField && f.profileValue);

  renderProfileFields(profileFields, data.formFields || []);
  document.getElementById('profileFieldsSection').style.display = 'block';

  document.getElementById('profileFieldCount').textContent = profileFields.length;

  const fillBtn = document.getElementById('fillProfileBtn');
  fillBtn.style.display = profileFields.length > 0 ? 'inline-block' : 'none';
}

function renderQuestions(questions) {
  const container = document.getElementById('questionsList');
  container.innerHTML = '';

  questions.forEach((q, index) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.dataset.index = index;

    const hasAnswer = q.answer && q.answer !== 'NA';

    card.innerHTML = `
      <div class="question-card-header">
        <span class="question-text">${escapeHtml(q.question)}</span>
      </div>
      <div class="question-answer ${hasAnswer ? '' : 'no-answer'}">${escapeHtml(q.answer || 'NA')}</div>
      <div class="question-actions">
        <div class="question-tweak">
          <input type="text" placeholder="Tweak instructions (optional)" class="tweak-input">
        </div>
        <button class="btn-secondary btn-question btn-regenerate" data-index="${index}">Regenerate</button>
        <button class="btn-copy btn-question" data-index="${index}" ${hasAnswer ? '' : 'disabled'}>Copy</button>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('.btn-regenerate').forEach(btn => {
    btn.addEventListener('click', () => regenerateAnswer(parseInt(btn.dataset.index)));
  });

  container.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => copyAnswer(parseInt(btn.dataset.index)));
  });
}

function renderProfileFields(matchedFields, allFormFields) {
  const container = document.getElementById('profileFieldsList');
  container.innerHTML = '';

  if (analyzedData) {
    analyzedData.profileFieldsToFill = matchedFields;
  }

  if (matchedFields.length === 0) {
    container.innerHTML = `
      <div class="profile-empty-state">
        <p>No auto-fillable fields detected on this page.</p>
        <p class="profile-hint">Your profile data is shown below for easy copy-paste:</p>
      </div>
    `;

    renderProfileSummary(container);
    return;
  }

  matchedFields.forEach((field, index) => {
    const item = document.createElement('div');
    item.className = 'profile-field-item';
    item.dataset.fieldIndex = index;
    item.innerHTML = `
      <div class="profile-field-info">
        <span class="profile-field-label">${escapeHtml(field.label)}</span>
        <span class="profile-field-value">${escapeHtml(field.profileValue || 'Not set')}</span>
      </div>
      <div class="profile-field-actions">
        <button class="btn-copy-small" data-value="${escapeHtml(field.profileValue || '')}" title="Copy value">Copy</button>
        <span class="profile-field-status"></span>
      </div>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll('.btn-copy-small').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const value = btn.dataset.value;
      await copyToClipboard(value, btn);
    });
  });

  const separator = document.createElement('div');
  separator.className = 'profile-separator';
  separator.innerHTML = '<span>All Profile Data</span>';
  container.appendChild(separator);

  renderProfileSummary(container);
}

async function renderProfileSummary(container) {
  try {
    const profile = await browser.runtime.sendMessage({ action: 'getProfile' });

    const profileData = [
      { label: 'Full Name', value: [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ') },
      { label: 'First Name', value: profile.firstName },
      { label: 'Last Name', value: profile.lastName },
      { label: 'Email', value: profile.email },
      { label: 'Phone', value: profile.phone },
      { label: 'LinkedIn', value: profile.linkedinUrl },
      { label: 'GitHub', value: profile.githubUsername ? `https://github.com/${profile.githubUsername}` : '' },
      { label: 'Portfolio', value: profile.portfolioUrl },
      { label: 'Twitter/X', value: profile.twitterUrl }
    ].filter(item => item.value);

    if (profileData.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'profile-hint';
      emptyMsg.textContent = 'No profile data configured. Add your info in Settings.';
      container.appendChild(emptyMsg);
      return;
    }

    const summaryGrid = document.createElement('div');
    summaryGrid.className = 'profile-summary-grid';

    profileData.forEach(item => {
      const row = document.createElement('div');
      row.className = 'profile-summary-row';
      row.innerHTML = `
        <span class="profile-summary-label">${escapeHtml(item.label)}</span>
        <span class="profile-summary-value">${escapeHtml(item.value)}</span>
        <button class="btn-copy-small" data-value="${escapeHtml(item.value)}" title="Copy">Copy</button>
      `;
      summaryGrid.appendChild(row);
    });

    container.appendChild(summaryGrid);

    summaryGrid.querySelectorAll('.btn-copy-small').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const value = btn.dataset.value;
        await copyToClipboard(value, btn);
      });
    });

  } catch (e) {
    console.error('Failed to load profile:', e);
  }
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }

  const originalText = button.textContent;
  button.textContent = 'Copied!';
  button.classList.add('copied');
  setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove('copied');
  }, 2000);
}

async function regenerateAnswer(index) {
  if (!analyzedData || !analyzedData.questions[index]) return;

  const card = document.querySelector(`.question-card[data-index="${index}"]`);
  if (!card) return;
  const btn = card.querySelector('.btn-regenerate');
  if (!btn) return;
  const question = analyzedData.questions[index];
  const tweakInput = card.querySelector('.tweak-input');

  btn.disabled = true;
  btn.textContent = 'Generating...';

  try {
    const response = await browser.runtime.sendMessage({
      action: 'regenerateAnswer',
      data: {
        question: question.question,
        customInstructions: tweakInput.value.trim(),
        pageUrl: analyzedData.pageUrl,
        pageTitle: analyzedData.pageTitle
      }
    });

    if (response.success) {
      analyzedData.questions[index].answer = response.answer;
      await saveAppDraft();

      const answerEl = card.querySelector('.question-answer');
      answerEl.textContent = response.answer;
      answerEl.classList.remove('no-answer');

      card.querySelector('.btn-copy').disabled = false;
    } else {
      showAppError(response.error || 'Failed to regenerate answer');
    }
  } catch (error) {
    showAppError(error.message || 'An unexpected error occurred');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Regenerate';
  }
}

async function copyAnswer(index) {
  if (!analyzedData || !analyzedData.questions[index]) return;

  const answer = analyzedData.questions[index].answer;
  if (!answer || answer === 'NA') return;

  const card = document.querySelector(`.question-card[data-index="${index}"]`);
  const btn = card.querySelector('.btn-copy');

  await copyToClipboard(answer, btn);
}

async function fillAllProfileFields() {
  if (!analyzedData || !analyzedData.profileFieldsToFill) return;

  const button = document.getElementById('fillProfileBtn');
  button.disabled = true;
  button.textContent = 'Filling...';

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    let filledCount = 0;
    for (const field of analyzedData.profileFieldsToFill) {
      if (field.profileValue && field.selector) {
        try {
          const response = await browser.tabs.sendMessage(tab.id, {
            action: 'fillField',
            data: {
              selector: field.selector,
              value: field.profileValue
            }
          });

          if (response && !response.success) {
            console.error('Fill field failed:', field.label, response.error);
            continue;
          }

          const items = document.querySelectorAll('.profile-field-item');
          for (const item of items) {
            const idx = parseInt(item.dataset.fieldIndex);
            if (!isNaN(idx) && analyzedData.profileFieldsToFill[idx] === field) {
              item.classList.add('filled');
              const status = item.querySelector('.profile-field-status');
              if (status) status.textContent = 'Filled';
              break;
            }
          }

          filledCount++;
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
          console.error('Failed to fill field:', field.label, e);
        }
      }
    }

    button.textContent = filledCount > 0 ? `Filled ${filledCount}!` : 'No fields to fill';
    setTimeout(() => {
      button.textContent = 'Fill All';
    }, 2000);
  } catch (error) {
    showAppError('Failed to fill fields: ' + error.message);
    button.textContent = 'Fill All';
  } finally {
    button.disabled = false;
  }
}

function showAppError(message) {
  const section = document.getElementById('appErrorSection');
  const messageEl = document.getElementById('appErrorMessage');

  messageEl.textContent = message;
  section.style.display = 'block';
}

function hideAppError() {
  document.getElementById('appErrorSection').style.display = 'none';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
