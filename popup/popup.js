// Aiply Popup Script

const DRAFT_STORAGE_KEY = 'popupDraft';
const APP_DRAFT_STORAGE_KEY = 'applicationDraft';
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
  await restoreAppDraft();
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

// === Draft Persistence (Application Mode) ===

// Store analyzed data in memory (will be synced with storage)
let analyzedData = null;

async function saveAppDraft() {
  const data = analyzedData;
  if (!data) return;
  
  const draft = {
    analyzedData: data,
    pageUrl: data.pageUrl,
    timestamp: Date.now()
  };
  
  await browser.storage.local.set({ [APP_DRAFT_STORAGE_KEY]: draft });
}

async function restoreAppDraft() {
  try {
    const storage = await browser.storage.local.get(APP_DRAFT_STORAGE_KEY);
    const draft = storage[APP_DRAFT_STORAGE_KEY];
    
    if (!draft || !draft.analyzedData) return;
    
    // Check if we're on a different URL (expire if navigated away)
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const currentUrl = tab?.url || '';
    
    // If URL changed (different page), clear the draft
    if (draft.pageUrl && currentUrl && !urlsMatch(draft.pageUrl, currentUrl)) {
      await clearAppDraft();
      return;
    }
    
    // Check if draft is less than 1 hour old (backup expiration)
    const age = Date.now() - (draft.timestamp || 0);
    if (age > 60 * 60 * 1000) {
      await clearAppDraft();
      return;
    }
    
    // Restore the analyzed data
    analyzedData = draft.analyzedData;
    displayAnalyzedData(analyzedData);
    
  } catch (e) {
    console.error('Failed to restore app draft:', e);
  }
}

// Compare URLs ignoring hash and minor differences
function urlsMatch(url1, url2) {
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    // Compare origin + pathname (ignore hash, query params can vary)
    return u1.origin === u2.origin && u1.pathname === u2.pathname;
  } catch {
    return url1 === url2;
  }
}

async function clearAppDraft() {
  analyzedData = null;
  await browser.storage.local.remove(APP_DRAFT_STORAGE_KEY);
  
  // Reset UI
  document.getElementById('pageInfoSection').style.display = 'none';
  document.getElementById('questionsSection').style.display = 'none';
  document.getElementById('profileFieldsSection').style.display = 'none';
  document.getElementById('noQuestionsSection').style.display = 'none';
  hideAppError();
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
      } else if (activeMode === 'application') {
        analyzePage();
      }
    }
  });

  // === Application Mode Listeners ===
  
  // Analyze button
  document.getElementById('analyzeBtn').addEventListener('click', analyzePage);
  
  // Clear analysis button
  document.getElementById('clearAnalysisBtn')?.addEventListener('click', clearAppDraft);
  
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
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
    
    button.querySelector('span').textContent = 'Copied!';
    setTimeout(() => {
      button.querySelector('span').textContent = 'Copy';
    }, 2000);
  }
}

// === Application Mode Functions ===

async function analyzePage() {
  const button = document.getElementById('analyzeBtn');
  const btnText = button.querySelector('.btn-text');
  const btnLoading = button.querySelector('.btn-loading');
  
  button.disabled = true;
  btnText.style.display = 'none';
  btnLoading.style.display = 'inline';
  hideAppError();
  
  // Reset previous results
  document.getElementById('pageInfoSection').style.display = 'none';
  document.getElementById('questionsSection').style.display = 'none';
  document.getElementById('profileFieldsSection').style.display = 'none';
  document.getElementById('noQuestionsSection').style.display = 'none';
  
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      throw new Error('No active tab found');
    }
    
    // Step 1: Scrape page content
    btnLoading.textContent = 'Scraping page...';
    const scrapeResponse = await browser.tabs.sendMessage(tab.id, { action: 'scrape' });
    
    if (!scrapeResponse.success) {
      throw new Error(scrapeResponse.error || 'Failed to scrape page');
    }
    
    const { pageText, formFields, title, url } = scrapeResponse.data;
    
    // Step 2: Analyze with Groq (single API call)
    btnLoading.textContent = 'Analyzing questions...';
    const analyzeResponse = await browser.runtime.sendMessage({
      action: 'analyzePageQuestions',
      data: {
        pageText,
        pageTitle: title,
        pageUrl: url
      }
    });
    
    if (!analyzeResponse.success) {
      throw new Error(analyzeResponse.error || 'Failed to analyze page');
    }
    
    // Store analyzed data
    analyzedData = {
      questions: analyzeResponse.questions,
      formFields,
      pageTitle: title,
      pageUrl: url
    };
    
    // Save to storage for persistence
    await saveAppDraft();
    
    // Display results
    displayAnalyzedData(analyzedData);
    
  } catch (error) {
    if (error.message.includes('Receiving end does not exist')) {
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
  // Page info
  if (data.pageTitle) {
    document.getElementById('pageTitle').textContent = data.pageTitle;
    document.getElementById('pageInfoSection').style.display = 'block';
  }
  
  // Questions & Answers
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
  
  // Profile fields - always show section, with matched fields having copy buttons
  // Also show profile data summary for easy copy-paste
  const profileFields = (data.formFields || []).filter(f => f.isProfileField && f.profileValue);
  
  // Always render profile section
  renderProfileFields(profileFields, data.formFields || []);
  document.getElementById('profileFieldsSection').style.display = 'block';
  
  // Update profile field count
  document.getElementById('profileFieldCount').textContent = profileFields.length;
  
  // Show/hide Fill All button based on whether there are fillable fields
  const fillBtn = document.getElementById('fillProfileBtn');
  if (profileFields.length > 0) {
    fillBtn.style.display = 'inline-block';
  } else {
    fillBtn.style.display = 'none';
  }
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
  
  // Add event listeners
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
  
  // Store for later use
  if (analyzedData) {
    analyzedData.profileFieldsToFill = matchedFields;
  }
  
  if (matchedFields.length === 0) {
    // Show empty state with profile summary
    container.innerHTML = `
      <div class="profile-empty-state">
        <p>No auto-fillable fields detected on this page.</p>
        <p class="profile-hint">Your profile data is shown below for easy copy-paste:</p>
      </div>
    `;
    
    // Show profile summary for manual copy-paste
    renderProfileSummary(container);
    return;
  }
  
  // Render matched fields with copy buttons
  matchedFields.forEach((field, index) => {
    const item = document.createElement('div');
    item.className = 'profile-field-item';
    item.dataset.index = index;
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
  
  // Add copy button listeners
  container.querySelectorAll('.btn-copy-small').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const value = btn.dataset.value;
      await copyToClipboard(value, btn);
    });
  });
  
  // Add a separator and profile summary
  const separator = document.createElement('div');
  separator.className = 'profile-separator';
  separator.innerHTML = '<span>All Profile Data</span>';
  container.appendChild(separator);
  
  renderProfileSummary(container);
}

async function renderProfileSummary(container) {
  // Get profile data
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
    
    // Add copy button listeners
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
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('copied');
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 1500);
  } catch (error) {
    // Fallback
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('copied');
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 1500);
  }
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
      // Update stored answer
      analyzedData.questions[index].answer = response.answer;
      
      // Save updated data to storage
      await saveAppDraft();
      
      // Update UI
      const answerEl = card.querySelector('.question-answer');
      answerEl.textContent = response.answer;
      answerEl.classList.remove('no-answer');
      
      // Enable copy button
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
            const label = item.querySelector('.profile-field-label');
            if (label && label.textContent === field.label) {
              item.classList.add('filled');
              const status = item.querySelector('.profile-field-status');
              if (status) status.textContent = 'Filled';
            }
          });
          
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
