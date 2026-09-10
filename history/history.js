// Aiply History Page

let allHistory = [];
let currentEntryId = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadHistory();
  setupEventListeners();
}

async function loadHistory() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getHistory' });

    if (response.success) {
      allHistory = response.history || [];
      renderHistory(allHistory);
    } else {
      showError('Failed to load history');
    }
  } catch (error) {
    showError(error.message);
  }
}

function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (query) {
      const filtered = allHistory.filter(item =>
        (item.question || '').toLowerCase().includes(query) ||
        (item.company && item.company.toLowerCase().includes(query)) ||
        (item.generatedAnswer || '').toLowerCase().includes(query) ||
        (item.pageTitle && item.pageTitle.toLowerCase().includes(query)) ||
        (item.pageUrl && item.pageUrl.toLowerCase().includes(query))
      );
      renderHistory(filtered);
    } else {
      renderHistory(allHistory);
    }
  });

  document.getElementById('exportBtn').addEventListener('click', exportHistory);

  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importHistory);

  document.getElementById('clearBtn').addEventListener('click', clearAllHistory);

  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById('copyAnswerBtn').addEventListener('click', copyCurrentAnswer);
  document.getElementById('deleteEntryBtn').addEventListener('click', deleteCurrentEntry);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function safeText(value) {
  return value || '';
}

function renderHistory(history) {
  const container = document.getElementById('historyList');
  const emptyState = document.getElementById('emptyState');

  if (!history || history.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  const groups = groupByDate(history);

  let html = '';
  for (const [dateLabel, items] of Object.entries(groups)) {
    html += `<div class="date-group">`;
    html += `<div class="date-header">${dateLabel}</div>`;

    for (const item of items) {
      const time = formatTime(new Date(item.timestamp));
      const isApplicationMode = item.source === 'application';
      const badgeHtml = isApplicationMode
        ? `<span class="history-item-badge">Application</span>`
        : '';
      const questionCountHtml = item.questionCount
        ? `<span class="history-item-count">${item.questionCount} Q&A</span>`
        : '';

      const displayTitle = isApplicationMode
        ? (item.pageTitle || 'Page Analysis')
        : truncate(item.question || 'Untitled', 80);

      html += `
        <div class="history-item ${isApplicationMode ? 'application-mode' : ''}" data-id="${item.id}">
          <div class="history-item-header">
            <div class="history-item-question">${escapeHtml(displayTitle)}</div>
            <div class="history-item-meta">
              ${badgeHtml}
              ${questionCountHtml}
              ${item.company ? `<span class="history-item-company">${escapeHtml(item.company)}</span>` : ''}
              <span>${time}</span>
              <button class="btn-delete-item" data-id="${item.id}" title="Delete">×</button>
            </div>
          </div>
          <div class="history-item-answer">${escapeHtml(truncate(safeText(item.generatedAnswer), 150))}</div>
        </div>
      `;
    }

    html += `</div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => openDetail(el.dataset.id));
  });

  container.querySelectorAll('.btn-delete-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!confirm('Delete this entry?')) return;

      try {
        const response = await browser.runtime.sendMessage({
          action: 'deleteHistoryItem',
          id: id
        });

        if (response.success) {
          allHistory = allHistory.filter(h => h.id !== id);
          renderHistory(allHistory);
        } else {
          alert('Failed to delete: ' + (response.error || 'Unknown error'));
        }
      } catch (error) {
        alert('Failed to delete: ' + error.message);
      }
    });
  });
}

function groupByDate(history) {
  const groups = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  for (const item of history) {
    const date = new Date(item.timestamp);
    const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    let label;
    if (itemDate.getTime() === today.getTime()) {
      label = 'Today';
    } else if (itemDate.getTime() === yesterday.getTime()) {
      label = 'Yesterday';
    } else if (itemDate < today && itemDate > weekAgo) {
      label = 'This Week';
    } else {
      label = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(item);
  }

  return groups;
}

function openDetail(id) {
  const item = allHistory.find(h => h.id === id);
  if (!item) return;

  currentEntryId = id;

  const isApplicationMode = item.source === 'application';

  document.getElementById('detailQuestion').textContent = safeText(item.question);

  const sourceSection = document.getElementById('detailSourceSection');
  if (isApplicationMode && item.pageUrl) {
    const url = item.pageUrl;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const link = document.createElement('a');
      link.href = url;
      link.textContent = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const source = document.getElementById('detailSource');
      source.innerHTML = '';
      source.appendChild(link);
      sourceSection.style.display = 'block';
    } else {
      sourceSection.style.display = 'none';
    }
  } else {
    sourceSection.style.display = 'none';
  }

  const companySection = document.getElementById('detailCompanySection');
  if (item.company) {
    document.getElementById('detailCompany').textContent = item.company;
    companySection.style.display = 'block';
  } else {
    companySection.style.display = 'none';
  }

  const jdSection = document.getElementById('detailJDSection');
  if (item.jobDescription) {
    document.getElementById('detailJD').textContent = item.jobDescription;
    jdSection.style.display = 'block';
  } else {
    jdSection.style.display = 'none';
  }

  const questionsListSection = document.getElementById('detailQuestionsListSection');
  if (isApplicationMode && item.questions && item.questions.length > 0) {
    document.getElementById('detailQuestionCount').textContent = item.questions.length;
    renderDetailQuestions(item.questions);
    questionsListSection.style.display = 'block';
    document.getElementById('detailAnswerSection').style.display = 'none';
  } else {
    questionsListSection.style.display = 'none';
    document.getElementById('detailAnswer').textContent = safeText(item.generatedAnswer);
    document.getElementById('detailAnswerSection').style.display = 'block';
  }

  document.getElementById('detailModal').style.display = 'flex';
}

function renderDetailQuestions(questions) {
  const container = document.getElementById('detailQuestionsList');
  container.innerHTML = '';

  questions.forEach((q, index) => {
    const item = document.createElement('div');
    item.className = 'detail-qa-item';
    item.innerHTML = `
      <div class="detail-qa-question">
        <span class="detail-qa-number">${index + 1}.</span>
        <span>${escapeHtml(safeText(q.question))}</span>
      </div>
      <div class="detail-qa-answer">${escapeHtml(safeText(q.answer))}</div>
      <button class="btn-copy-small" data-index="${index}">Copy</button>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll('.btn-copy-small').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const answer = questions[idx]?.answer || '';
      try {
        await navigator.clipboard.writeText(answer);
      } catch {
        const textArea = document.createElement('textarea');
        textArea.value = answer;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = 'Copy';
      }, 2000);
    });
  });
}

function closeModal() {
  document.getElementById('detailModal').style.display = 'none';
  currentEntryId = null;
}

async function copyCurrentAnswer() {
  const item = allHistory.find(h => h.id === currentEntryId);
  if (!item) return;

  const button = document.getElementById('copyAnswerBtn');
  const textToCopy = safeText(item.generatedAnswer);

  try {
    await navigator.clipboard.writeText(textToCopy);
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = textToCopy;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }

  button.textContent = 'Copied!';
  setTimeout(() => {
    button.textContent = 'Copy Answer';
  }, 2000);
}

async function deleteCurrentEntry() {
  if (!currentEntryId) return;

  if (!confirm('Delete this entry?')) return;

  try {
    const response = await browser.runtime.sendMessage({
      action: 'deleteHistoryItem',
      id: currentEntryId
    });

    if (response.success) {
      allHistory = allHistory.filter(h => h.id !== currentEntryId);
      renderHistory(allHistory);
      closeModal();
    } else {
      alert('Failed to delete: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Failed to delete: ' + error.message);
  }
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
    } else {
      alert('Export failed: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Export failed: ' + error.message);
  }
}

async function clearAllHistory() {
  if (!confirm('Are you sure you want to delete all history? This cannot be undone.')) {
    return;
  }

  try {
    const response = await browser.runtime.sendMessage({ action: 'clearHistory' });

    if (response.success) {
      allHistory = [];
      renderHistory([]);
    } else {
      alert('Failed to clear history: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Failed to clear history: ' + error.message);
  }
}

async function importHistory(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importedHistory = JSON.parse(text);

    if (!Array.isArray(importedHistory)) {
      throw new Error('Invalid history file format. Expected an array.');
    }

    const response = await browser.runtime.sendMessage({
      action: 'importHistory',
      data: { history: importedHistory }
    });

    if (response.success) {
      allHistory = await browser.runtime.sendMessage({ action: 'getHistory' });
      allHistory = allHistory.history || [];
      renderHistory(allHistory);
      alert(`Successfully imported ${response.count || 0} item(s).`);
    } else {
      alert('Import failed: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Import failed: ' + error.message);
  }

  event.target.value = '';
}

function showError(message) {
  const container = document.getElementById('historyList');
  container.innerHTML = `<div class="loading" style="color: #ff4a4a;">Error: ${escapeHtml(message)}</div>`;
}

function formatTime(date) {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function truncate(str, length) {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
