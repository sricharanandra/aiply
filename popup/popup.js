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
  
  // Analyze button
  document.getElementById('analyzeBtn').addEventListener('click', analyzePage);
  
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

// Store analyzed data
let analyzedData = null;

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
  if (data.questions && data.questions.length > 0) {
    document.getElementById('questionCount').textContent = data.questions.length;
    renderQuestions(data.questions);
    document.getElementById('questionsSection').style.display = 'block';
  }
  
  // Profile fields (only show fields that have a profile value)
  const profileFields = data.formFields.filter(f => f.isProfileField && f.profileValue);
  if (profileFields.length > 0) {
    document.getElementById('profileFieldCount').textContent = profileFields.length;
    renderProfileFields(profileFields);
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

function renderProfileFields(fields) {
  const container = document.getElementById('profileFieldsList');
  container.innerHTML = '';
  
  // Store for later use
  analyzedData.profileFieldsToFill = fields;
  
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

async function regenerateAnswer(index) {
  if (!analyzedData || !analyzedData.questions[index]) return;
  
  const card = document.querySelector(`.question-card[data-index="${index}"]`);
  const btn = card.querySelector('.btn-regenerate');
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
  
  try {
    await navigator.clipboard.writeText(answer);
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = 'Copy';
    }, 2000);
  } catch (error) {
    // Fallback for older browsers
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
            if (item.querySelector('.profile-field-label').textContent === field.label) {
              item.classList.add('filled');
              item.querySelector('.profile-field-status').textContent = 'Filled';
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
