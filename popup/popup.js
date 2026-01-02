// Aiply Popup Script

const DRAFT_STORAGE_KEY = 'popupDraft';
const MODE_STORAGE_KEY = 'popupMode';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const isConfigured = await checkConfiguration();
  
  if (!isConfigured) {
    document.getElementById('setupRequired').style.display = 'block';
    document.getElementById('modeTabs').style.display = 'none';
    document.getElementById('emailMode').style.display = 'none';
    document.getElementById('applicationMode').style.display = 'none';
    return;
  }
  
  await restoreMode();
  await restoreDraft();
  setupEventListeners();
  
  // Detect platform for application mode
  detectPlatform();
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
  // Update tabs
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });
  
  // Update content visibility
  document.getElementById('emailMode').style.display = mode === 'email' ? 'block' : 'none';
  document.getElementById('applicationMode').style.display = mode === 'application' ? 'block' : 'none';
  
  if (save) {
    saveMode(mode);
  }
  
  // Refresh platform detection when switching to application mode
  if (mode === 'application') {
    detectPlatform();
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
    
    // Only restore if draft is less than 1 hour old
    const age = Date.now() - (draft.timestamp || 0);
    if (age > 60 * 60 * 1000) {
      await clearDraft();
      return;
    }
    
    // Restore form fields
    document.getElementById('question').value = draft.question || '';
    document.getElementById('company').value = draft.company || '';
    document.getElementById('jobDescription').value = draft.jobDescription || '';
    document.getElementById('customInstructions').value = draft.customInstructions || '';
    
    // Restore collapsed sections state
    if (draft.jdExpanded) {
      document.getElementById('jdContent').style.display = 'block';
      document.getElementById('toggleJD').classList.add('active');
    }
    
    if (draft.instructionsExpanded) {
      document.getElementById('instructionsContent').style.display = 'block';
      document.getElementById('toggleInstructions').classList.add('active');
    }
    
    // Restore output if it was visible
    if (draft.outputVisible && draft.output) {
      document.getElementById('output').textContent = draft.output;
      document.getElementById('outputSection').style.display = 'block';
    }
  } catch (e) {
    // Ignore restore errors
  }
}

async function clearDraft() {
  await browser.storage.local.remove(DRAFT_STORAGE_KEY);
}

// Debounce helper
function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

const debouncedSaveDraft = debounce(saveDraft, 300);

// === Event Listeners ===

function setupEventListeners() {
  // Mode tabs
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });

  // Settings button
  document.getElementById('settingsBtn').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

  // History button
  document.getElementById('historyBtn').addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('history/history.html') });
  });

  // Setup button
  document.getElementById('goToSetup').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

  // === Email Mode Listeners ===
  
  // Collapsible toggles
  document.getElementById('toggleJD').addEventListener('click', () => {
    toggleCollapsible('toggleJD', 'jdContent');
    debouncedSaveDraft();
  });

  document.getElementById('toggleInstructions').addEventListener('click', () => {
    toggleCollapsible('toggleInstructions', 'instructionsContent');
    debouncedSaveDraft();
  });

  // Auto-save on input changes
  const inputs = ['question', 'company', 'jobDescription', 'customInstructions'];
  inputs.forEach(id => {
    document.getElementById(id).addEventListener('input', debouncedSaveDraft);
  });

  // Generate button
  document.getElementById('generateBtn').addEventListener('click', generateAnswer);

  // Copy button
  document.getElementById('copyBtn').addEventListener('click', copyOutput);

  // Clear button
  document.getElementById('clearBtn')?.addEventListener('click', clearForm);

  // Enter to submit
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      const activeMode = document.querySelector('.mode-tab.active').dataset.mode;
      if (activeMode === 'email') {
        generateAnswer();
      }
    }
  });

  // === Application Mode Listeners ===
  
  // Scrape button
  document.getElementById('scrapeBtn').addEventListener('click', scrapePage);
  
  // Toggle scraped JD
  document.getElementById('toggleScrapedJD').addEventListener('click', () => {
    toggleCollapsible('toggleScrapedJD', 'scrapedJDContent');
  });
  
  // Generate all button
  document.getElementById('generateAllBtn').addEventListener('click', generateAllAnswers);
  
  // Fill profile fields button
  document.getElementById('fillProfileBtn').addEventListener('click', fillAllProfileFields);
}

function toggleCollapsible(toggleId, contentId) {
  const toggle = document.getElementById(toggleId);
  const content = document.getElementById(contentId);
  
  const isOpen = content.style.display !== 'none';
  
  content.style.display = isOpen ? 'none' : 'block';
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

  // Show loading state
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
      saveDraft();
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
  hideOutput();
  hideError();
  await clearDraft();
}

async function copyOutput() {
  const output = document.getElementById('output');
  const button = document.getElementById('copyBtn');
  
  try {
    await navigator.clipboard.writeText(output.textContent);
    
    button.classList.add('copied');
    button.querySelector('span').textContent = 'Copied!';
    
    setTimeout(() => {
      button.classList.remove('copied');
      button.querySelector('span').textContent = 'Copy';
    }, 2000);
  } catch (error) {
    const textArea = document.createElement('textarea');
    textArea.value = output.textContent;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    button.querySelector('span').textContent = 'Copied!';
    setTimeout(() => {
      button.querySelector('span').textContent = 'Copy';
    }, 2000);
  }
}

// === Application Mode Functions ===

// Store scraped data
let scrapedData = null;

async function detectPlatform() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      updatePlatformStatus('Not detected', false);
      return;
    }
    
    const url = tab.url;
    const platformName = getPlatformName(url);
    
    if (platformName) {
      updatePlatformStatus(platformName, true);
    } else {
      updatePlatformStatus('Unknown site', false);
      document.querySelector('.scrape-hint').textContent = 
        'This site may not be fully supported. Scraping will use best-effort extraction.';
    }
  } catch (error) {
    updatePlatformStatus('Error', false);
  }
}

function getPlatformName(url) {
  if (url.includes('docs.google.com/forms')) return 'Google Forms';
  if (url.includes('greenhouse.io') || url.includes('boards.greenhouse.io')) return 'Greenhouse';
  if (url.includes('glassdoor.com') || url.includes('glassdoor.co.in')) return 'Glassdoor';
  if (url.includes('linkedin.com/jobs')) return 'LinkedIn';
  if (url.includes('internshala.com')) return 'Internshala';
  return null;
}

function updatePlatformStatus(name, detected) {
  const badge = document.getElementById('platformName');
  badge.textContent = name;
  badge.classList.toggle('detected', detected);
}

async function scrapePage() {
  const button = document.getElementById('scrapeBtn');
  const originalText = button.querySelector('span').textContent;
  
  button.disabled = true;
  button.querySelector('span').textContent = 'Scraping...';
  hideAppError();
  
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      throw new Error('No active tab found');
    }
    
    // Send message to content script
    const response = await browser.tabs.sendMessage(tab.id, { action: 'scrape' });
    
    if (response.success) {
      scrapedData = response.data;
      displayScrapedData(response.data);
    } else {
      throw new Error(response.error || 'Failed to scrape page');
    }
  } catch (error) {
    // Content script might not be loaded, try injecting it
    if (error.message.includes('Receiving end does not exist')) {
      showAppError('Content script not loaded. Make sure you\'re on a supported job application page and refresh.');
    } else {
      showAppError(error.message || 'Failed to scrape page');
    }
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = originalText;
  }
}

function displayScrapedData(data) {
  // Job info
  if (data.company || data.role) {
    document.getElementById('scrapedCompany').textContent = data.company || 'Unknown Company';
    document.getElementById('scrapedRole').textContent = data.role || 'Unknown Role';
    document.getElementById('jobInfoSection').style.display = 'block';
    
    if (data.jobDescription) {
      document.getElementById('scrapedJD').textContent = data.jobDescription;
    }
  }
  
  // Questions
  if (data.questions && data.questions.length > 0) {
    document.getElementById('questionCount').textContent = data.questions.length;
    renderQuestions(data.questions);
    document.getElementById('questionsSection').style.display = 'block';
  }
  
  // Profile fields
  if (data.profileFields && data.profileFields.length > 0) {
    document.getElementById('profileFieldCount').textContent = data.profileFields.length;
    renderProfileFields(data.profileFields);
    document.getElementById('profileFieldsSection').style.display = 'block';
  }
}

function renderQuestions(questions) {
  const container = document.getElementById('questionsList');
  container.innerHTML = '';
  
  questions.forEach((q, index) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.dataset.index = index;
    card.innerHTML = `
      <div class="question-card-header">
        <span class="question-text">${escapeHtml(q.text)}</span>
        <span class="question-badge ${q.required ? 'required' : ''}">${q.required ? 'Required' : 'Optional'}</span>
      </div>
      <div class="question-answer" style="display: none;"></div>
      <div class="question-actions">
        <div class="question-tweak">
          <input type="text" placeholder="Tweak instructions (optional)" class="tweak-input">
        </div>
        <button class="btn-secondary btn-question btn-generate-one" data-index="${index}">Generate</button>
        <button class="btn-secondary btn-question btn-fill" data-index="${index}" style="display: none;">Fill</button>
        <button class="btn-copy btn-question" data-index="${index}" style="display: none;">Copy</button>
      </div>
    `;
    container.appendChild(card);
  });
  
  // Add event listeners
  container.querySelectorAll('.btn-generate-one').forEach(btn => {
    btn.addEventListener('click', () => generateSingleAnswer(parseInt(btn.dataset.index)));
  });
  
  container.querySelectorAll('.btn-fill').forEach(btn => {
    btn.addEventListener('click', () => fillSingleAnswer(parseInt(btn.dataset.index)));
  });
  
  container.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => copySingleAnswer(parseInt(btn.dataset.index)));
  });
}

function renderProfileFields(fields) {
  const container = document.getElementById('profileFieldsList');
  container.innerHTML = '';
  
  fields.forEach((field, index) => {
    const item = document.createElement('div');
    item.className = 'profile-field-item';
    item.dataset.index = index;
    item.innerHTML = `
      <span class="profile-field-label">${escapeHtml(field.label)}</span>
      <span class="profile-field-value">${escapeHtml(field.profileValue || 'Not set')}</span>
      <span class="profile-field-status"></span>
    `;
    container.appendChild(item);
  });
}

async function generateSingleAnswer(index) {
  if (!scrapedData || !scrapedData.questions[index]) return;
  
  const card = document.querySelector(`.question-card[data-index="${index}"]`);
  const btn = card.querySelector('.btn-generate-one');
  const question = scrapedData.questions[index];
  const tweakInput = card.querySelector('.tweak-input');
  
  btn.disabled = true;
  btn.textContent = 'Generating...';
  card.classList.add('generating');
  
  try {
    const response = await browser.runtime.sendMessage({
      action: 'generateAnswer',
      data: {
        question: question.text,
        company: scrapedData.company || '',
        jobDescription: scrapedData.jobDescription || '',
        customInstructions: tweakInput.value.trim()
      }
    });
    
    if (response.success) {
      // Store answer in scraped data
      scrapedData.questions[index].answer = response.answer;
      
      // Show answer
      const answerEl = card.querySelector('.question-answer');
      answerEl.textContent = response.answer;
      answerEl.style.display = 'block';
      
      // Show fill and copy buttons
      card.querySelector('.btn-fill').style.display = 'inline-flex';
      card.querySelector('.btn-copy').style.display = 'inline-flex';
      
      card.classList.add('completed');
    } else {
      showAppError(response.error || 'Failed to generate answer');
    }
  } catch (error) {
    showAppError(error.message || 'An unexpected error occurred');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Regenerate';
    card.classList.remove('generating');
  }
}

async function generateAllAnswers() {
  if (!scrapedData || !scrapedData.questions) return;
  
  const button = document.getElementById('generateAllBtn');
  const btnText = button.querySelector('.btn-text');
  const btnLoading = button.querySelector('.btn-loading');
  
  button.disabled = true;
  btnText.style.display = 'none';
  btnLoading.style.display = 'inline';
  
  try {
    for (let i = 0; i < scrapedData.questions.length; i++) {
      if (!scrapedData.questions[i].answer) {
        await generateSingleAnswer(i);
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } finally {
    button.disabled = false;
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
  }
}

async function fillSingleAnswer(index) {
  if (!scrapedData || !scrapedData.questions[index] || !scrapedData.questions[index].answer) return;
  
  const question = scrapedData.questions[index];
  
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    
    await browser.tabs.sendMessage(tab.id, {
      action: 'fillField',
      data: {
        selector: question.selector,
        value: question.answer
      }
    });
    
    // Mark as filled
    const card = document.querySelector(`.question-card[data-index="${index}"]`);
    const btn = card.querySelector('.btn-fill');
    btn.textContent = 'Filled!';
    setTimeout(() => {
      btn.textContent = 'Fill';
    }, 2000);
  } catch (error) {
    showAppError('Failed to fill field: ' + error.message);
  }
}

async function copySingleAnswer(index) {
  if (!scrapedData || !scrapedData.questions[index] || !scrapedData.questions[index].answer) return;
  
  const answer = scrapedData.questions[index].answer;
  const card = document.querySelector(`.question-card[data-index="${index}"]`);
  const btn = card.querySelector('.btn-copy');
  
  try {
    await navigator.clipboard.writeText(answer);
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = 'Copy';
    }, 2000);
  } catch (error) {
    // Fallback
    const textArea = document.createElement('textarea');
    textArea.value = answer;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = 'Copy';
    }, 2000);
  }
}

async function fillAllProfileFields() {
  if (!scrapedData || !scrapedData.profileFields) return;
  
  const button = document.getElementById('fillProfileBtn');
  button.disabled = true;
  button.textContent = 'Filling...';
  
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    
    for (const field of scrapedData.profileFields) {
      if (field.profileValue) {
        await browser.tabs.sendMessage(tab.id, {
          action: 'fillField',
          data: {
            selector: field.selector,
            value: field.profileValue
          }
        });
        
        // Mark as filled in UI
        const items = document.querySelectorAll('.profile-field-item');
        items.forEach(item => {
          if (item.querySelector('.profile-field-label').textContent === field.label) {
            item.classList.add('filled');
            item.querySelector('.profile-field-status').textContent = 'Filled';
          }
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    button.textContent = 'Done!';
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
