// Aiply Popup Script

const DRAFT_STORAGE_KEY = 'popupDraft';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const isConfigured = await checkConfiguration();
  
  if (!isConfigured) {
    document.getElementById('setupRequired').style.display = 'block';
    document.getElementById('mainForm').style.display = 'none';
  }
  
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

// === Draft Persistence ===

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

// Debounce helper to avoid too many storage writes
function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

const debouncedSaveDraft = debounce(saveDraft, 300);

function setupEventListeners() {
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

  // Clear button (new)
  document.getElementById('clearBtn')?.addEventListener('click', clearForm);

  // Enter to submit
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      generateAnswer();
    }
  });
}

function toggleCollapsible(toggleId, contentId) {
  const toggle = document.getElementById(toggleId);
  const content = document.getElementById(contentId);
  
  const isOpen = content.style.display !== 'none';
  
  content.style.display = isOpen ? 'none' : 'block';
  toggle.classList.toggle('active', !isOpen);
}

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
      // Save draft with output
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
  
  // Scroll to output
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
    
    // Show copied state
    button.classList.add('copied');
    button.querySelector('span').textContent = 'Copied!';
    
    setTimeout(() => {
      button.classList.remove('copied');
      button.querySelector('span').textContent = 'Copy';
    }, 2000);
  } catch (error) {
    // Fallback for older browsers
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
