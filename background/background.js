// Aiply Background Script
// Handles API calls, caching, and storage management

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GITHUB_API_URL = 'https://api.github.com';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_HISTORY_RETENTION_DAYS = 90;

// System prompt for answer generation
const SYSTEM_PROMPT = `You write job application responses for the applicant. You will be given the applicant's EXACT profile data below.

CRITICAL RULES - STRICTLY FOLLOW:
1. ONLY use information explicitly provided in the applicant's profile below
2. NEVER invent, assume, or fabricate any skills, projects, technologies, or experiences
3. If a skill or technology is NOT mentioned in the profile, DO NOT claim the applicant has it
4. If you cannot find relevant experience for a job requirement, simply omit it - do not make things up
5. Only mention projects that are EXPLICITLY listed in the profile data

VOICE & STYLE:
- Write like a real person typing an email
- Simple sentences. Clear structure.
- NEVER use: em-dashes (—), semicolons joining clauses, ellipses for effect
- BANNED phrases: "passionate about", "excited to", "thrive in", "leverage", "driven by", "synergy", "at the forefront", "cutting-edge", "innovative solutions", "I am confident", "I believe", "unique opportunity"
- Direct and honest. Do not exaggerate.

LENGTH:
- Keep it brief. 3-5 sentences for emails.
- Only expand if explicitly asked for detail
- Only mention 1-2 most relevant projects if applicable

ACCURACY:
- Double-check every claim against the provided profile
- If the profile mentions "Python" do not claim "extensive Python experience" - just say they know Python
- If a project README says it uses Docker, you can mention Docker. If it doesn't, don't claim it.
- When in doubt, leave it out

OUTPUT FORMAT:
- Plain text only. No markdown, no bullet points (unless asked)
- Ready to copy-paste into email or form field`;

// Initialize on install
browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Open options page on first install
    browser.runtime.openOptionsPage();
  }
});

// Refresh cache on browser startup
browser.runtime.onStartup.addListener(async () => {
  await refreshGitHubCacheIfNeeded();
  await cleanupOldHistory();
});

// Message handler
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(error => {
    sendResponse({ success: false, error: formatError(error) });
  });
  return true; // Keep channel open for async response
});

async function handleMessage(message) {
  switch (message.action) {
    case 'generateAnswer':
      return await generateAnswer(message.data);
    case 'refreshCache':
      return await forceRefreshCache();
    case 'getProfile':
      return await getProfile();
    case 'saveProfile':
      return await saveProfile(message.data);
    case 'getSettings':
      return await getSettings();
    case 'saveSettings':
      return await saveSettings(message.data);
    case 'getHistory':
      return await getHistory();
    case 'deleteHistoryItem':
      return await deleteHistoryItem(message.id);
    case 'clearHistory':
      return await clearHistory();
    case 'exportHistory':
      return await exportHistory();
    case 'getCacheStatus':
      return await getCacheStatus();
    default:
      throw new Error(`Unknown action: ${message.action}`);
  }
}

// === Answer Generation ===

async function generateAnswer(data) {
  const { question, company, jobDescription, customInstructions } = data;
  
  if (!question || !question.trim()) {
    throw new Error('Question is required');
  }

  const settings = await getSettings();
  if (!settings.groqApiKey) {
    throw new Error('Groq API key not set. Go to Settings to add your free API key.');
  }

  const profile = await getProfile();
  const cache = await getCache();

  // Build context from profile
  const context = buildContext(profile, cache, jobDescription);
  
  // Build user message
  let userMessage = `Question to answer: ${question}`;
  
  if (company) {
    userMessage += `\n\nCompany: ${company}`;
  }
  
  if (jobDescription) {
    userMessage += `\n\nJob Description:\n${jobDescription}`;
  }
  
  if (customInstructions) {
    userMessage += `\n\nAdditional instructions: ${customInstructions}`;
  }

  // Determine model based on whether company research is needed
  const needsWebSearch = !!company || !!jobDescription;
  const model = needsWebSearch ? 'groq/compound' : 'groq/compound-mini';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + '\n\n' + context },
    { role: 'user', content: userMessage }
  ];

  const response = await callGroqAPI(settings.groqApiKey, model, messages, 0.3);
  
  // Save to history
  await saveToHistory({
    question,
    company: company || null,
    jobDescription: jobDescription || null,
    customInstructions: customInstructions || null,
    generatedAnswer: response,
    modelUsed: model
  });

  return { success: true, answer: response };
}

function buildContext(profile, cache, jobDescription) {
  let context = '=== APPLICANT PROFILE (USE ONLY THIS DATA) ===\n\n';

  // Resume
  if (profile.resumeText) {
    context += '--- Resume/CV (EXACT CONTENT) ---\n';
    context += profile.resumeText + '\n\n';
  } else {
    context += '--- Resume/CV ---\nNo resume provided.\n\n';
  }

  // GitHub repos
  if (cache.github && cache.github.repos && cache.github.repos.length > 0) {
    context += '--- GitHub Projects (ONLY THESE EXIST) ---\n';
    
    const repos = cache.github.repos;
    
    for (const repo of repos.slice(0, 10)) {
      context += `\nProject: ${repo.name}\n`;
      if (repo.description) {
        context += `Description: ${repo.description}\n`;
      }
      if (repo.languages && repo.languages.length > 0) {
        context += `Technologies used: ${repo.languages.join(', ')}\n`;
      }
      if (repo.readme) {
        const readmeSnippet = repo.readme.substring(0, 500);
        context += `README excerpt: ${readmeSnippet}${repo.readme.length > 500 ? '...' : ''}\n`;
      }
      context += `URL: ${repo.url}\n`;
    }
    context += '\n';
  } else {
    context += '--- GitHub Projects ---\nNo GitHub data available.\n\n';
  }

  // Deployed projects
  if (profile.deployedProjects && profile.deployedProjects.length > 0) {
    context += '--- Deployed Projects (ONLY THESE) ---\n';
    for (const project of profile.deployedProjects) {
      context += `- ${project.name || project.url}`;
      if (project.description) {
        context += `: ${project.description}`;
      }
      context += ` (${project.url})\n`;
    }
    context += '\n';
  }

  context += '=== END OF PROFILE DATA ===\n';
  context += 'REMINDER: Only reference skills, projects, and experiences that appear above. Do not invent anything.\n';

  return context;
}

async function callGroqAPI(apiKey, model, messages, temperature = 0.3) {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    
    if (response.status === 401) {
      throw new Error('Invalid API key. Check your key at console.groq.com/keys');
    }
    
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after') || '60';
      throw new Error(`Rate limit reached. Try again in ${retryAfter} seconds. Free tier allows 30 requests/minute.`);
    }
    
    if (response.status === 400) {
      throw new Error(`Bad request: ${errorData.error?.message || 'Check your input'}`);
    }
    
    throw new Error(`API error (${response.status}): ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// === GitHub Cache ===

async function refreshGitHubCacheIfNeeded() {
  const profile = await getProfile();
  if (!profile.githubUsername) {
    return { success: true, message: 'No GitHub username configured' };
  }

  const cache = await getCache();
  const now = Date.now();
  
  if (cache.github && cache.github.lastUpdated) {
    const age = now - new Date(cache.github.lastUpdated).getTime();
    if (age < CACHE_MAX_AGE_MS) {
      return { success: true, message: 'Cache is fresh' };
    }
  }

  return await fetchGitHubData(profile.githubUsername);
}

async function forceRefreshCache() {
  const profile = await getProfile();
  if (!profile.githubUsername) {
    throw new Error('No GitHub username configured. Add it in Settings.');
  }
  return await fetchGitHubData(profile.githubUsername);
}

async function fetchGitHubData(username) {
  try {
    // Fetch repos
    const reposResponse = await fetch(
      `${GITHUB_API_URL}/users/${username}/repos?sort=updated&per_page=30`,
      { headers: { 'Accept': 'application/vnd.github.v3+json' } }
    );

    if (!reposResponse.ok) {
      if (reposResponse.status === 404) {
        throw new Error(`GitHub user "${username}" not found. Check your username.`);
      }
      if (reposResponse.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Try again in a few minutes.');
      }
      throw new Error(`GitHub API error: ${reposResponse.status}`);
    }

    const repos = await reposResponse.json();
    
    // Fetch README for each repo (in parallel, with limit)
    const repoData = await Promise.all(
      repos.slice(0, 15).map(async (repo) => {
        let readme = '';
        try {
          const readmeResponse = await fetch(
            `${GITHUB_API_URL}/repos/${username}/${repo.name}/readme`,
            { headers: { 'Accept': 'application/vnd.github.v3.raw' } }
          );
          if (readmeResponse.ok) {
            readme = await readmeResponse.text();
            // Truncate to 2000 chars
            if (readme.length > 2000) {
              readme = readme.substring(0, 2000);
            }
          }
        } catch (e) {
          // README fetch failed, that's okay
        }

        // Fetch languages
        let languages = [];
        try {
          const langResponse = await fetch(
            `${GITHUB_API_URL}/repos/${username}/${repo.name}/languages`,
            { headers: { 'Accept': 'application/vnd.github.v3+json' } }
          );
          if (langResponse.ok) {
            const langData = await langResponse.json();
            languages = Object.keys(langData);
          }
        } catch (e) {
          // Languages fetch failed, that's okay
        }

        return {
          name: repo.name,
          description: repo.description || '',
          readme,
          languages,
          url: repo.html_url,
          stars: repo.stargazers_count,
          updatedAt: repo.updated_at
        };
      })
    );

    // Save to cache
    const cache = await getCache();
    cache.github = {
      lastUpdated: new Date().toISOString(),
      repos: repoData
    };
    await saveCache(cache);

    return { success: true, message: `Cached ${repoData.length} repositories` };
  } catch (error) {
    throw new Error(`GitHub fetch failed: ${error.message}`);
  }
}

// === History Management ===

async function saveToHistory(entry) {
  const storage = await browser.storage.local.get('history');
  const history = storage.history || [];
  
  history.unshift({
    id: generateId(),
    timestamp: new Date().toISOString(),
    ...entry
  });

  // Keep only last 1000 entries
  if (history.length > 1000) {
    history.splice(1000);
  }

  await browser.storage.local.set({ history });
}

async function getHistory() {
  const storage = await browser.storage.local.get('history');
  return { success: true, history: storage.history || [] };
}

async function deleteHistoryItem(id) {
  const storage = await browser.storage.local.get('history');
  const history = (storage.history || []).filter(item => item.id !== id);
  await browser.storage.local.set({ history });
  return { success: true };
}

async function clearHistory() {
  await browser.storage.local.set({ history: [] });
  return { success: true };
}

async function exportHistory() {
  const storage = await browser.storage.local.get('history');
  return { success: true, data: JSON.stringify(storage.history || [], null, 2) };
}

async function cleanupOldHistory() {
  const settings = await getSettings();
  const retentionDays = settings.historyRetentionDays || DEFAULT_HISTORY_RETENTION_DAYS;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const storage = await browser.storage.local.get('history');
  const history = (storage.history || []).filter(item => {
    return new Date(item.timestamp) > cutoff;
  });

  await browser.storage.local.set({ history });
}

// === Storage Helpers ===

async function getProfile() {
  const storage = await browser.storage.local.get('profile');
  return storage.profile || {
    // Personal info
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phone: '',
    // Profile links
    githubUsername: '',
    linkedinUrl: '',
    twitterUrl: '',
    portfolioUrl: '',
    otherLinks: [],
    // Projects
    deployedProjects: [],
    // Resume
    resumeText: '',
    resumeFileName: ''
  };
}

async function saveProfile(profile) {
  await browser.storage.local.set({ profile });
  return { success: true };
}

async function getSettings() {
  const storage = await browser.storage.local.get('settings');
  return storage.settings || {
    groqApiKey: '',
    historyRetentionDays: DEFAULT_HISTORY_RETENTION_DAYS
  };
}

async function saveSettings(settings) {
  await browser.storage.local.set({ settings });
  return { success: true };
}

async function getCache() {
  const storage = await browser.storage.local.get('cache');
  return storage.cache || { github: null };
}

async function saveCache(cache) {
  await browser.storage.local.set({ cache });
}

async function getCacheStatus() {
  const cache = await getCache();
  const profile = await getProfile();
  
  let status = {
    hasGitHubData: false,
    repoCount: 0,
    lastUpdated: null,
    githubUsername: profile.githubUsername || null
  };

  if (cache.github) {
    status.hasGitHubData = true;
    status.repoCount = cache.github.repos?.length || 0;
    status.lastUpdated = cache.github.lastUpdated;
  }

  return { success: true, status };
}

// === Utilities ===

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
