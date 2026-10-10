// Aiply Background Script
// Handles API calls, caching, and storage management

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HISTORY_RETENTION_DAYS = 90;

const GROQ_MODEL_STANDARD = 'openai/gpt-oss-120b';
const GROQ_MODEL_FAST = 'openai/gpt-oss-20b';

const DEFAULT_OPENCODE_BASE_URL = 'http://127.0.0.1:4096';
const DEFAULT_OPENCODE_USERNAME = 'opencode';
const FETCH_TIMEOUT_OPENCODE = 120000;

const FETCH_TIMEOUT_GROQ = 60000;
const FETCH_TIMEOUT_GITHUB = 20000;

const TONE_PRESETS = {
  'professional-human': {
    label: 'Professional & Human',
    instructions: `TONE: Write like a real person wrote this. Use natural contractions (I'm, don't, I've, it's, they're). Keep the tone warm and professional at the same time. Use simple, clear sentences. Avoid any phrasing that sounds like it came from an AI assistant, chatbot, or language model. Never use em-dashes, semicolons joining full clauses, or ellipses for effect. Write directly and naturally, as if typing an email to someone you respect but are comfortable with.`
  },
  'professional': {
    label: 'Professional',
    instructions: `TONE: Write in a formal professional tone. Use complete, well-structured sentences. Be precise and polished. Avoid casual language or contractions. Use formal transitions and maintain a respectful, business-appropriate register.`
  },
  'concise': {
    label: 'Concise',
    instructions: `TONE: Be extremely brief and direct. Use 1-3 short sentences. No fluff, no filler, no introductory phrases. Get straight to the point with the most relevant information only.`
  },
  'enthusiastic': {
    label: 'Enthusiastic',
    instructions: `TONE: Write with genuine energy and authentic enthusiasm. Show real interest in the opportunity while staying professional. Use positive, engaging language. Avoid cliches or forced excitement. Let the enthusiasm come through naturally via specific, concrete interest in the role and company.`
  }
};

const LENGTH_PRESETS = {
  'brief': { label: 'Brief', maxWords: 60, maxCompletionTokens: 600 },
  'standard': { label: 'Standard', maxWords: 150, maxCompletionTokens: 1200 },
  'detailed': { label: 'Detailed', maxWords: 300, maxCompletionTokens: 2000 }
};

const BASE_SYSTEM_PROMPT = `You write job application responses for the applicant. You will be given the applicant's EXACT profile data below.

CRITICAL RULES - STRICTLY FOLLOW:
1. ONLY use information explicitly provided in the applicant's profile below
2. NEVER invent, assume, or fabricate any skills, projects, technologies, or experiences
3. If a skill or technology is NOT mentioned in the profile, DO NOT claim the applicant has it
4. If you cannot find relevant experience for a job requirement, simply omit it - do not make things up
5. Only mention projects that are EXPLICITLY listed in the profile data

MISSING INFORMATION:
- For factual fields (current company, CTC, notice period, etc.) where info is NOT in the profile, just output "NA" or "N/A" - nothing else
- NEVER say "The applicant's profile does not specify..." or "I cannot fill this" or similar
- NEVER explain why you can't answer - just output the short answer or "NA"
- For questions asking about experience you don't have info for, output "NA"

ACCURACY:
- Double-check every claim against the provided profile
- If the profile mentions "Python" do not claim "extensive Python experience" - just say they know Python
- If a project README says it uses Docker, you can mention Docker. If it doesn't, don't claim it.
- When in doubt, leave it out

OUTPUT FORMAT:
- Plain text only. No markdown, no bullet points (unless asked)
- Ready to copy-paste into email or form field
- For short factual questions, give short answers (e.g., "NA", "0", "Immediate", etc.)`;

const COVER_LETTER_SYSTEM_PROMPT = `You write professional cover letters for the applicant. You will be given the applicant's EXACT profile data below.

CRITICAL RULES - STRICTLY FOLLOW:
1. ONLY use information explicitly provided in the applicant's profile below
2. NEVER invent, assume, or fabricate any skills, projects, technologies, or experiences
3. If a skill or technology is NOT mentioned in the profile, DO NOT claim the applicant has it
4. If you cannot find relevant experience for a job requirement, simply omit it
5. Only mention projects that are EXPLICITLY listed in the profile data
6. The cover letter must sound like a real person wrote it, not an AI

COVER LETTER STRUCTURE:
- Opening: Polite greeting. Mention the role and company. Briefly state interest.
- Body: Connect 1-2 relevant experiences or projects from the profile to the role. Show, don't tell.
- Closing: Thank them for their time. Express interest in next steps.

ACCURACY:
- Double-check every claim against the provided profile
- If the profile mentions "Python" do not claim "extensive Python experience" - just say they know Python
- When in doubt, leave it out

OUTPUT FORMAT:
- Plain text only. No markdown, no bullet points.
- Ready to copy-paste into an email or form field.
- Start with "Dear Hiring Manager," or similar appropriate greeting.
- End with a professional sign-off.`;

const ANALYSIS_SYSTEM_PROMPT = `You are analyzing a job application page to identify questions and generate answers for the applicant.

You will receive:
1. The page text content
2. The applicant's complete profile data

YOUR TASK:
1. Identify all questions on the page that need text answers (ignore simple form fields like name, email, phone)
2. For each question, generate a personalized answer using ONLY the applicant's profile data

CRITICAL RULES:
1. ONLY extract questions that require thoughtful text responses (cover letter, "why us", experience questions, etc.)
2. DO NOT include simple profile fields (name, email, phone, LinkedIn URL, etc.) - these are handled separately
3. ONLY use information from the applicant's profile - NEVER invent skills, projects, or experiences
4. If you can't answer a question from the profile data, set answer to "NA"
5. Keep answers concise but complete (2-4 sentences typically)

OUTPUT FORMAT:
Return a JSON array of objects. Each object has:
- "question": The exact question text from the page
- "answer": Your generated answer (or "NA" if cannot answer from profile)

Example output:
[
  {"question": "Why do you want to work at our company?", "answer": "I'm interested in your work on..."},
  {"question": "Describe a challenging project you've worked on", "answer": "I built a project called..."}
]`;

const VOICE_GUIDE = `VOICE & STYLE - THIS OVERRIDES EVERYTHING ELSE:
Write like a real student or junior developer typing an honest email. Not a marketer. Not a senior engineer. Not a LinkedIn influencer.

BANNED PHRASES - never use these (they are AI/ad-copy tells):
- "I'm excited to..." / "I'm thrilled to..." / "I would be honored" / "I'm eager to"
- "passionate about" / "deeply passionate" / "strong passion for"
- "leverage" / "utilize" / "synergize" / "streamline" / "drive impact" / "deliver value"
- "robust" / "scalable" / "cutting-edge" / "innovative" / "disruptive" / "next-generation"
- "proven track record" / "extensive experience" / "deep expertise" / "wealth of experience"
- "I believe my skills would be a great fit" / "I am confident I can contribute"
- "building scalable [X]" / "delivering world-class [Y]" / "world-class"
- "fast-paced environment" / "dynamic environment" / "hit the ground running"

DO NOT write ad copy. DO NOT sell. DO NOT pad. Answer the actual question, then stop.

If the profile only has class projects, coursework, or small personal repos, write like someone with that background. A class project is "a class project", not "extensive experience building scalable systems." Be honest about what you don't know. "I haven't used that, but I know the basics" beats invented expertise.

Tone: warm and direct, like an email to someone you respect. Contractions are fine (I'm, don't, I've). Short, plain sentences. Answer the specific question asked. No buzzword filler, no enthusiasm you don't genuinely feel, no inflated claims.`;

const ANALYZER_SYSTEM_PROMPT = `You are a job description analyst. Your task is to analyze a job description and the applicant's profile to produce actionable insights.

You will receive:
1. The job description text
2. The applicant's complete profile data (resume, GitHub projects, etc.)

YOUR TASK:
Analyze the job description and compare it against the applicant's profile. Return a JSON object with the following structure:

{
  "companyInfo": {
    "name": "Company name extracted from JD or provided",
    "description": "Brief description of what the company does",
    "industry": "Industry sector if identifiable",
    "size": "Company size if mentioned (e.g. '5000+ employees', 'Startup')"
  },
  "roleDetails": {
    "title": "Job title",
    "summary": "2-3 sentence summary of the role",
    "responsibilities": ["Key responsibility 1", "Key responsibility 2"],
    "qualifications": ["Qualification 1", "Qualification 2"]
  },
  "skillsAnalysis": {
    "requiredSkills": [
      {
        "name": "Skill name",
        "category": "language/framework/tool/concept/domain",
        "matchStatus": "match",
        "evidence": "Where this appears in the applicant's profile"
      }
    ],
    "preferredSkills": [
      {
        "name": "Skill name",
        "category": "language/framework/tool/concept/domain",
        "matchStatus": "match",
        "evidence": "Where this appears in the applicant's profile"
      }
    ],
    "missingCriticalSkills": ["Skill the role likely needs but applicant doesn't have"],
    "strengthAreas": ["Areas where applicant's profile is strong relative to this role"]
  }
}

RULES:
- matchStatus must be one of: "match" (applicant clearly has this), "partial" (applicant has something related), "gap" (not found in profile)
- evidence: quote the specific line/project from the profile data that shows the match, or "Not found in profile" for gaps
- Be honest about gaps - do not oversell the applicant
- Only include skills actually mentioned in the JD or clearly implied by it
- For companyInfo, use information from the JD text. If the company name is provided separately, use that. If no company info is available in the JD, set fields to "Unknown".
- missingCriticalSkills: skills that are essential for the role but absent from the applicant's profile
- strengthAreas: 2-3 areas where the applicant stands out relative to this role

Return ONLY valid JSON. No explanation, no markdown formatting.`;

function selectSystemPrompt(toneId, lengthId, isCoverLetter) {
  const base = isCoverLetter ? COVER_LETTER_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT;
  const tone = TONE_PRESETS[toneId];
  const lengthSetting = LENGTH_PRESETS[lengthId] || LENGTH_PRESETS['standard'];

  let prompt = base;

  if (tone) {
    prompt += '\n\n' + tone.instructions;
  }

  prompt += `\n\nLENGTH: Write approximately ${lengthSetting.maxWords} words or fewer. Be concise and stay within this limit.`;

  prompt += '\n\n' + VOICE_GUIDE;

  return prompt;
}

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    browser.runtime.openOptionsPage();
  }
});

browser.runtime.onStartup.addListener(async () => {
  await refreshGitHubCacheIfNeeded();
  await cleanupOldHistory();
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(error => {
    sendResponse({ success: false, error: formatError(error) });
  });
  return true;
});

async function handleMessage(message) {
  switch (message.action) {
    case 'generateAnswer':
      return await generateAnswer(message.data);
    case 'generateCoverLetter':
      return await generateCoverLetter(message.data);
    case 'analyzePageQuestions':
      return await analyzePageQuestions(message.data);
    case 'regenerateAnswer':
      return await regenerateAnswer(message.data);
    case 'analyzeJob':
      return await analyzeJobDescription(message.data);
    case 'parseResume':
      return await parseResume(message.data);
    case 'testOpenCode':
      return await testOpenCode(message.data);
    case 'listOpenCodeModels':
      return await listOpenCodeModels(message.data);
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
    case 'importHistory':
      return await importHistory(message.data);
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
  const { question, company, jobDescription, customInstructions, tone, length } = data;

  if (!question || !question.trim()) {
    throw new Error('Question is required');
  }

  const settings = await getSettings();
  requireProvider(settings);

  const profile = await getProfile();
  const cache = await getCache();

  const context = buildContext(profile, cache, jobDescription);
  const systemPrompt = selectSystemPrompt(tone, length, false);

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

  const model = selectModel(company, jobDescription);
  const maxTokens = LENGTH_PRESETS[length]?.maxCompletionTokens || 600;

  const messages = [
    { role: 'system', content: systemPrompt + '\n\n' + context },
    { role: 'user', content: userMessage }
  ];

  const result = await callLLM(settings, { groqModel: model, messages, temperature: 0.6, maxTokens, reasoningEffort: 'low' });
  const response = result.text;

  await saveToHistory({
    question,
    company: company || null,
    jobDescription: jobDescription || null,
    customInstructions: customInstructions || null,
    tone: tone || null,
    length: length || null,
    generatedAnswer: response,
    modelUsed: result.modelUsed
  });

  return { success: true, answer: response };
}

// === Cover Letter Generation ===

async function generateCoverLetter(data) {
  const { company, jobDescription, tone, length, customInstructions } = data;

  if (!company || !company.trim()) {
    throw new Error('Company name is required');
  }

  if (!jobDescription || !jobDescription.trim()) {
    throw new Error('Job description is required');
  }

  const settings = await getSettings();
  requireProvider(settings);

  const profile = await getProfile();
  const cache = await getCache();

  const context = buildContext(profile, cache, jobDescription);
  const systemPrompt = selectSystemPrompt(tone, length, true);

  let userMessage = `Company: ${company}\n\nJob Description:\n${jobDescription}`;

  if (customInstructions) {
    userMessage += `\n\nAdditional instructions: ${customInstructions}`;
  }

  const maxTokens = LENGTH_PRESETS[length]?.maxCompletionTokens || 600;

  const messages = [
    { role: 'system', content: systemPrompt + '\n\n' + context },
    { role: 'user', content: userMessage }
  ];

  const result = await callLLM(settings, { groqModel: GROQ_MODEL_STANDARD, messages, temperature: 0.6, maxTokens, reasoningEffort: 'low' });
  const response = result.text;

  await saveToHistory({
    question: `Cover Letter for ${company}`,
    company: company,
    jobDescription: jobDescription || null,
    customInstructions: customInstructions || null,
    tone: tone || null,
    length: length || null,
    generatedAnswer: response,
    modelUsed: result.modelUsed,
    source: 'cover-letter'
  });

  return { success: true, answer: response };
}

function selectModel(company, jobDescription) {
  return (company || jobDescription) ? GROQ_MODEL_STANDARD : GROQ_MODEL_FAST;
}

// === Page Analysis (Application Mode) ===

async function analyzePageQuestions(data) {
  const { pageText, pageTitle, pageUrl } = data;

  if (!pageText || !pageText.trim()) {
    throw new Error('No page content to analyze');
  }

  const settings = await getSettings();
  requireProvider(settings);

  const profile = await getProfile();
  const cache = await getCache();

  const profileContext = buildCompactContext(profile, cache);

  const pageTextCap = 8000;
  const truncatedPageText = pageText.length > pageTextCap
    ? pageText.substring(0, pageTextCap) + '\n...(page content truncated)'
    : pageText;

  const userMessage = `Page URL: ${pageUrl || 'Unknown'}
Page Title: ${pageTitle || 'Unknown'}

=== PAGE CONTENT ===
${truncatedPageText}
=== END PAGE CONTENT ===

Analyze the page content above, identify all questions that need text answers, and generate personalized answers using the applicant's profile.

Return ONLY a JSON array. No explanation, no markdown, just the JSON array.`;

  const messages = [
    { role: 'system', content: ANALYSIS_SYSTEM_PROMPT + '\n\n' + VOICE_GUIDE + '\n\n' + profileContext },
    { role: 'user', content: userMessage }
  ];

  const result = await callLLM(settings, { groqModel: GROQ_MODEL_STANDARD, messages, temperature: 0.5, maxTokens: 4000, reasoningEffort: 'low' });
  const response = result.text;

  let questions;
  try {
    questions = parseJSONResponse(response);
    if (!Array.isArray(questions)) {
      throw new Error('Response is not an array');
    }
  } catch (parseError) {
    console.error('Failed to parse AI response:', response);
    throw new Error('Failed to parse AI response. Please try again.');
  }

  questions = questions
    .filter(q => q.question && typeof q.question === 'string')
    .map(q => ({
      question: q.question.trim(),
      answer: (q.answer || 'NA').trim()
    }));

  const validQAs = questions.filter(q => q.answer && q.answer !== 'NA');
  if (validQAs.length > 0) {
    await saveToHistory({
      question: `[Application Mode] ${pageTitle || pageUrl || 'Page Analysis'}`,
      company: null,
      jobDescription: null,
      customInstructions: null,
      generatedAnswer: validQAs.map(q => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n---\n\n'),
      modelUsed: result.modelUsed,
      source: 'application',
      pageUrl,
      pageTitle,
      questionCount: validQAs.length,
      questions: validQAs
    });
  }

  return { success: true, questions };
}

// === Job Description Analyzer ===

async function analyzeJobDescription(data) {
  const { jobDescription, companyName, companyUrl } = data;

  if (!jobDescription || !jobDescription.trim()) {
    throw new Error('Job description is required');
  }

  const settings = await getSettings();
  requireProvider(settings);

  const profile = await getProfile();
  const cache = await getCache();
  const context = buildContext(profile, cache, jobDescription);

  const jdCap = 5000;
  const truncatedJD = jobDescription.length > jdCap
    ? jobDescription.substring(0, jdCap) + '\n...(truncated)'
    : jobDescription;

  let userMessage = `=== JOB DESCRIPTION ===\n${truncatedJD}\n=== END JOB DESCRIPTION ===\n`;

  if (companyName) {
    userMessage += `\nCompany Name: ${companyName}`;
  }
  if (companyUrl) {
    userMessage += `\nCompany URL: ${companyUrl}`;
  }

  userMessage += `\n\nAnalyze this job description against the applicant's profile above. Return ONLY the JSON object.`;

  const messages = [
    { role: 'system', content: ANALYZER_SYSTEM_PROMPT + '\n\n' + context },
    { role: 'user', content: userMessage }
  ];

  const response = (await callLLM(settings, { groqModel: GROQ_MODEL_STANDARD, messages, temperature: 0.5, maxTokens: 2000, reasoningEffort: 'medium' })).text;

  let analysis;
  try {
    analysis = parseJSONObject(response);
    if (!analysis || typeof analysis !== 'object') {
      throw new Error('Response is not an object');
    }
  } catch (parseError) {
    console.error('Failed to parse AI response:', response);
    throw new Error('Failed to parse analysis. Please try again.');
  }

  analysis.companyInfo = analysis.companyInfo || {};
  analysis.roleDetails = analysis.roleDetails || {};
  analysis.skillsAnalysis = analysis.skillsAnalysis || {
    requiredSkills: [],
    preferredSkills: [],
    missingCriticalSkills: [],
    strengthAreas: []
  };

  return { success: true, analysis };
}

function parseJSONObject(response) {
  const trimmed = response.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed);
    } catch {}
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in response');
  }
  return JSON.parse(jsonMatch[0]);
}

function parseJSONResponse(response) {
  const trimmed = response.trim();

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  const startIdx = trimmed.indexOf('[');
  if (startIdx === -1) {
    throw new Error('No JSON array found in response');
  }

  const salvaged = salvageArray(trimmed.substring(startIdx));
  if (salvaged && salvaged.length > 0) {
    return salvaged;
  }

  throw new Error('No valid JSON array found in response');
}

function salvageArray(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastCompleteEnd = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        lastCompleteEnd = i;
      }
    }
  }

  if (lastCompleteEnd === -1) {
    return null;
  }

  const candidate = text.substring(0, lastCompleteEnd + 1);
  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  const closed = candidate + ']';
  try {
    const parsed = JSON.parse(closed);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  return null;
}

async function regenerateAnswer(data) {
  const { question, customInstructions, pageUrl, pageTitle, company, jobDescription, tone, length } = data;

  if (!question || !question.trim()) {
    throw new Error('Question is required');
  }

  const settings = await getSettings();
  requireProvider(settings);

  const profile = await getProfile();
  const cache = await getCache();

  const context = buildContext(profile, cache, jobDescription);
  const systemPrompt = selectSystemPrompt(tone, length, false);

  let userMessage = `Question to answer: ${question}`;

  if (company) {
    userMessage += `\n\nCompany: ${company}`;
  }

  if (jobDescription) {
    userMessage += `\n\nJob Description:\n${jobDescription}`;
  }

  if (pageUrl) {
    userMessage += `\n\nFrom application at: ${pageUrl}`;
  }

  if (customInstructions) {
    userMessage += `\n\nAdditional instructions: ${customInstructions}`;
  }

  const model = selectModel(company, jobDescription);
  const maxTokens = LENGTH_PRESETS[length]?.maxCompletionTokens || 600;

  const messages = [
    { role: 'system', content: systemPrompt + '\n\n' + context },
    { role: 'user', content: userMessage }
  ];

  const response = (await callLLM(settings, { groqModel: model, messages, temperature: 0.6, maxTokens, reasoningEffort: 'low' })).text;

  return { success: true, answer: response };
}

function buildContext(profile, cache, jobDescription) {
  let context = '=== APPLICANT PROFILE (USE ONLY THIS DATA) ===\n\n';

  if (profile.resumeText) {
    context += '--- Resume/CV (EXACT CONTENT) ---\n';
    const resumeCap = 2000;
    context += profile.resumeText.substring(0, resumeCap) + (profile.resumeText.length > resumeCap ? '\n...(truncated)' : '') + '\n\n';
  } else {
    context += '--- Resume/CV ---\nNo resume provided.\n\n';
  }

  if (cache.github && cache.github.repos && cache.github.repos.length > 0) {
    context += '--- GitHub Projects (ONLY THESE EXIST) ---\n';

    const repos = cache.github.repos;

    for (const repo of repos.slice(0, 5)) {
      context += `\nProject: ${repo.name}\n`;
      if (repo.description) {
        context += `Description: ${repo.description}\n`;
      }
      if (repo.languages && repo.languages.length > 0) {
        context += `Technologies used: ${repo.languages.join(', ')}\n`;
      }
      if (repo.readme) {
        const readmeSnippet = repo.readme.substring(0, 300);
        context += `README excerpt: ${readmeSnippet}${repo.readme.length > 300 ? '...' : ''}\n`;
      }
      context += `URL: ${repo.url}\n`;
    }
    context += '\n';
  } else {
    context += '--- GitHub Projects ---\nNo GitHub data available.\n\n';
  }

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

  const hasResearch = profile.researchPapers && profile.researchPapers.length > 0;
  const hasCertifications = profile.certifications && profile.certifications.length > 0;
  const hasAchievements = profile.achievements && profile.achievements.length > 0;
  const hasOtherContext = profile.otherContext && profile.otherContext.trim();

  if (hasResearch || hasCertifications || hasAchievements || hasOtherContext) {
    context += '--- Additional Background ---\n';

    if (hasResearch) {
      context += '\nResearch & Publications:\n';
      for (const item of profile.researchPapers) {
        context += `- ${item.title}`;
        if (item.description) context += `: ${item.description}`;
        if (item.url) context += ` (${item.url})`;
        context += '\n';
      }
    }

    if (hasCertifications) {
      context += '\nCertifications:\n';
      for (const item of profile.certifications) {
        context += `- ${item.title}`;
        if (item.description) context += `: ${item.description}`;
        if (item.url) context += ` (${item.url})`;
        context += '\n';
      }
    }

    if (hasAchievements) {
      context += '\nAchievements:\n';
      for (const item of profile.achievements) {
        context += `- ${item.title}`;
        if (item.description) context += `: ${item.description}`;
        context += '\n';
      }
    }

    if (hasOtherContext) {
      context += '\nOther Information:\n';
      context += profile.otherContext + '\n';
    }

    context += '\n';
  }

  context += '=== END OF PROFILE DATA ===\n';
  context += 'REMINDER: Only reference skills, projects, and experiences that appear above. Do not invent anything.\n';

  return context;
}

function buildCompactContext(profile, cache) {
  let context = '=== APPLICANT PROFILE SUMMARY (USE ONLY THIS DATA) ===\n\n';

  if (profile.resumeText) {
    context += '--- Resume Summary ---\n';
    context += profile.resumeText.substring(0, 800) + (profile.resumeText.length > 800 ? '\n...(truncated)' : '') + '\n\n';
  }

  if (cache.github && cache.github.repos && cache.github.repos.length > 0) {
    context += '--- GitHub Projects ---\n';
    for (const repo of cache.github.repos.slice(0, 5)) {
      context += `- ${repo.name}`;
      if (repo.languages && repo.languages.length > 0) {
        context += ` (${repo.languages.join(', ')})`;
      }
      context += '\n';
    }
    context += '\n';
  }

  if (profile.deployedProjects && profile.deployedProjects.length > 0) {
    context += '--- Deployed Projects ---\n';
    for (const project of profile.deployedProjects) {
      context += `- ${project.name || project.url} (${project.url})\n`;
    }
    context += '\n';
  }

  if (profile.researchPapers && profile.researchPapers.length > 0) {
    context += '--- Research ---\n';
    for (const item of profile.researchPapers) {
      context += `- ${item.title}`;
      if (item.description) context += `: ${item.description.substring(0, 100)}...`;
      context += '\n';
    }
    context += '\n';
  }

  if (profile.certifications && profile.certifications.length > 0) {
    context += '--- Certifications ---\n';
    for (const item of profile.certifications) {
      context += `- ${item.title}\n`;
    }
    context += '\n';
  }

  if (profile.achievements && profile.achievements.length > 0) {
    context += '--- Achievements ---\n';
    for (const item of profile.achievements) {
      context += `- ${item.title}\n`;
    }
    context += '\n';
  }

  if (profile.otherContext && profile.otherContext.trim()) {
    context += '--- Other ---\n' + profile.otherContext.substring(0, 200) + '\n\n';
  }

  context += '=== END OF PROFILE DATA ===\n';

  return context;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGroqAPI(apiKey, model, messages, temperature = 0.6, maxCompletionTokens = 2000, reasoningEffort = 'low') {
  const response = await fetchWithTimeout(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_completion_tokens: maxCompletionTokens,
      ...(model.startsWith('openai/gpt-oss') && {
        reasoning_effort: reasoningEffort,
        include_reasoning: false
      })
    })
  }, FETCH_TIMEOUT_GROQ);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    if (response.status === 401) {
      throw new Error('Invalid API key. Check your key at console.groq.com/keys');
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after') || '60';
      throw new Error(`Rate limit reached. Try again in ${retryAfter} seconds.`);
    }

    if (response.status === 400) {
      throw new Error(`Bad request: ${errorData.error?.message || 'Check your input'}`);
    }

    throw new Error(`API error (${response.status}): ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Unexpected API response format');
  }

  const finishReason = data.choices[0].finish_reason;
  const content = data.choices[0].message.content;

  if (finishReason === 'length') {
    console.warn('Groq response truncated due to max_completion_tokens limit');
  }

  if (!content && finishReason === 'tool_calls') {
    throw new Error('The model attempted to use tools and did not return a text response. Please try again or rephrase your request.');
  }

  return content || '';
}

// === LLM Provider (Groq / OpenCode local) ===

function requireProvider(settings) {
  const provider = settings.llmProvider || 'groq';
  if (provider === 'opencode') {
    if (!settings.opencodeBaseUrl || !settings.opencodeBaseUrl.trim()) {
      throw new Error('OpenCode server URL not set. Go to Settings to configure it.');
    }
    if (!settings.opencodeModel || !settings.opencodeModel.trim()) {
      throw new Error('OpenCode model not set. Go to Settings, refresh models, and pick one.');
    }
    return;
  }
  if (!settings.groqApiKey) {
    throw new Error('Groq API key not set. Go to Settings to add your free API key, or switch provider to OpenCode.');
  }
}

async function callLLM(settings, { groqModel, messages, temperature = 0.6, maxTokens = 2000, reasoningEffort = 'low' }) {
  const provider = settings.llmProvider || 'groq';
  if (provider === 'opencode') {
    return await callOpenCodeWithFallbacks(settings, messages);
  }
  const text = await callGroqAPI(settings.groqApiKey, groqModel, messages, temperature, maxTokens, reasoningEffort);
  return { text, modelUsed: groqModel };
}

function opencodeHeaders(settings) {
  const headers = { 'Content-Type': 'application/json' };
  if (settings.opencodePassword) {
    const user = (settings.opencodeUsername || DEFAULT_OPENCODE_USERNAME).trim() || DEFAULT_OPENCODE_USERNAME;
    headers['Authorization'] = 'Basic ' + btoa(`${user}:${settings.opencodePassword}`);
  }
  return headers;
}

function opencodeBase(settings) {
  return (settings.opencodeBaseUrl || DEFAULT_OPENCODE_BASE_URL).trim().replace(/\/+$/, '');
}

async function opencodeFetch(settings, path, { method = 'GET', body, timeoutMs = FETCH_TIMEOUT_OPENCODE } = {}) {
  const url = opencodeBase(settings) + path;
  const options = { method, headers: opencodeHeaders(settings) };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetchWithTimeout(url, options, timeoutMs);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`OpenCode server timed out at ${opencodeBase(settings)}. The model may be slow; try again.`);
    }
    throw new Error(`OpenCode server unreachable at ${opencodeBase(settings)}. Start it with: opencode serve --port 4096`);
  }
  if (response.status === 401) {
    throw new Error('OpenCode rejected the credentials (401). Check username/password in Settings.');
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenCode error (${response.status}): ${detail.substring(0, 200) || response.statusText}`);
  }
  return response;
}

function splitOpenCodeModel(modelId) {
  const cleaned = (modelId || '').trim();
  const slash = cleaned.indexOf('/');
  if (slash === -1) {
    throw new Error(`Bad OpenCode model "${cleaned}". Use provider/model format, e.g. opencode/big-pickle.`);
  }
  return { providerID: cleaned.substring(0, slash), modelID: cleaned.substring(slash + 1) };
}

function extractOpenCodeText(data) {
  const parts = data && data.parts;
  if (!Array.isArray(parts)) return '';
  const texts = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
      texts.push(part.text);
    } else if (typeof part.data === 'string' && part.data.trim()) {
      texts.push(part.data);
    } else if (typeof part.content === 'string' && part.content.trim()) {
      texts.push(part.content);
    }
  }
  return texts.join('\n').trim();
}

async function callOpenCodeOnce(settings, modelId, systemContent, userContent) {
  const { providerID, modelID } = splitOpenCodeModel(modelId);
  const sessionRes = await opencodeFetch(settings, '/session', {
    method: 'POST',
    body: { title: 'aiply' }
  });
  const session = await sessionRes.json();
  const sessionId = session && (session.id || session.ID || session.sessionID);
  if (!sessionId) {
    throw new Error('OpenCode did not return a session id.');
  }
  try {
    const msgRes = await opencodeFetch(settings, `/session/${encodeURIComponent(sessionId)}/message`, {
      method: 'POST',
      body: {
        system: systemContent,
        model: { providerID, modelID },
        parts: [{ type: 'text', text: userContent }]
      }
    });
    const data = await msgRes.json();
    const text = extractOpenCodeText(data);
    if (!text) {
      throw new Error(`OpenCode model "${modelId}" returned no text. It may be removed or overloaded; pick another model.`);
    }
    return text;
  } catch (error) {
    throw error;
  } finally {
    opencodeFetch(settings, `/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE', timeoutMs: 5000 }).catch(() => {});
  }
}

async function callOpenCodeWithFallbacks(settings, messages) {
  const systemContent = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const userContent = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n\n');
  const candidates = [settings.opencodeModel, ...(settings.opencodeFallbacks || [])]
    .map(m => (m || '').trim())
    .filter(Boolean);
  if (candidates.length === 0) {
    throw new Error('No OpenCode model configured. Go to Settings, refresh models, and pick one.');
  }
  const tried = [];
  for (const modelId of candidates) {
    try {
      const text = await callOpenCodeOnce(settings, modelId, systemContent, userContent);
      return { text, modelUsed: `opencode/${modelId}` };
    } catch (error) {
      tried.push(`${modelId} (${error.message})`);
    }
  }
  throw new Error(`All OpenCode models failed. Tried: ${tried.join('; ')}. Refresh models in Settings; free Zen models change often.`);
}

async function testOpenCode(data) {
  const settings = data && (data.baseUrl || data.opencodeBaseUrl)
    ? {
        opencodeBaseUrl: data.baseUrl || data.opencodeBaseUrl,
        opencodeUsername: data.username || data.opencodeUsername,
        opencodePassword: data.password !== undefined ? data.password : data.opencodePassword
      }
    : await getSettings();
  const response = await opencodeFetch(settings, '/global/health', { timeoutMs: 10000 });
  const health = await response.json().catch(() => ({}));
  return { success: true, healthy: health.healthy !== false, version: health.version || null };
}

async function listOpenCodeModels(data) {
  const settings = data && (data.baseUrl || data.opencodeBaseUrl)
    ? {
        opencodeBaseUrl: data.baseUrl || data.opencodeBaseUrl,
        opencodeUsername: data.username || data.opencodeUsername,
        opencodePassword: data.password !== undefined ? data.password : data.opencodePassword
      }
    : await getSettings();
  const response = await opencodeFetch(settings, '/config/providers', { timeoutMs: 15000 });
  const config = await response.json().catch(() => ({}));
  return { success: true, providers: config.providers || [], defaults: config.default || {} };
}

const RESUME_EXTRACT_PROMPT = `You extract structured profile data from a resume. Return ONLY a JSON object. No explanation, no markdown.

Rules:
- Use "" for unknown text fields and [] for unknown lists. NEVER invent values.
- emails, phones, urls: copy exactly as written.
- githubUsername: just the username, not the full URL.
- otherContext: one short paragraph of anything useful not covered elsewhere, or "".

Schema:
{"firstName":"","middleName":"","lastName":"","email":"","phone":"","linkedinUrl":"","githubUsername":"","twitterUrl":"","portfolioUrl":"","otherLinks":[],"deployedProjects":[],"researchPapers":[],"certifications":[],"achievements":[],"otherContext":""}

List items use {"name":..,"url":..} for links/projects and {"title":..,"description":..,"url":..} for research/certs/achievements.`;

async function parseResume(data) {
  const resumeText = data && data.resumeText ? data.resumeText.trim() : '';

  if (!resumeText) {
    throw new Error('No resume text to scan. Upload a resume first.');
  }

  const settings = await getSettings();
  requireProvider(settings);

  const cap = 6000;
  const capped = resumeText.length > cap ? resumeText.substring(0, cap) + '\n...(truncated)' : resumeText;

  const messages = [
    { role: 'system', content: RESUME_EXTRACT_PROMPT },
    { role: 'user', content: `=== RESUME ===\n${capped}\n=== END RESUME ===\n\nExtract the profile data as JSON.` }
  ];

  const result = await callLLM(settings, { groqModel: GROQ_MODEL_FAST, messages, temperature: 0.3, maxTokens: 2000, reasoningEffort: 'low' });

  let extracted;
  try {
    extracted = parseJSONObject(result.text);
  } catch (parseError) {
    console.error('Failed to parse resume extraction:', result.text);
    throw new Error('Could not read the resume. Try again.');
  }

  return { success: true, extracted: sanitizeExtractedProfile(extracted), modelUsed: result.modelUsed };
}

function sanitizeExtractedProfile(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const cleanStr = value => (typeof value === 'string' ? value.trim() : '');
  const cleanLinkList = value => {
    if (!Array.isArray(value)) return [];
    return value
      .filter(item => item && typeof item === 'object' && (item.url || item.name))
      .map(item => ({ name: cleanStr(item.name), url: cleanStr(item.url) }))
      .filter(item => item.url)
      .slice(0, 20);
  };
  const cleanContextList = value => {
    if (!Array.isArray(value)) return [];
    return value
      .filter(item => item && typeof item === 'object' && (item.title || item.description))
      .map(item => ({ title: cleanStr(item.title), description: cleanStr(item.description), url: cleanStr(item.url) || null }))
      .filter(item => item.title)
      .slice(0, 20);
  };
  return {
    firstName: cleanStr(source.firstName),
    middleName: cleanStr(source.middleName),
    lastName: cleanStr(source.lastName),
    email: cleanStr(source.email),
    phone: cleanStr(source.phone),
    linkedinUrl: cleanStr(source.linkedinUrl),
    githubUsername: cleanStr(source.githubUsername),
    twitterUrl: cleanStr(source.twitterUrl),
    portfolioUrl: cleanStr(source.portfolioUrl),
    otherLinks: cleanLinkList(source.otherLinks),
    deployedProjects: cleanLinkList(source.deployedProjects),
    researchPapers: cleanContextList(source.researchPapers),
    certifications: cleanContextList(source.certifications),
    achievements: cleanContextList(source.achievements),
    otherContext: cleanStr(source.otherContext)
  };
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

function isValidGitHubUsername(str) {
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(str);
}

async function fetchGitHubData(username) {
  const trimmedUsername = username.trim();
  if (!isValidGitHubUsername(trimmedUsername)) {
    throw new Error('Invalid GitHub username format');
  }

  try {
    const settings = await getSettings();
    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION
    };
    const hasToken = settings.githubToken && settings.githubToken.trim().length > 0;

    if (hasToken) {
      headers['Authorization'] = `Bearer ${settings.githubToken}`;
    }

    const perPage = hasToken ? 100 : 15;
    let allRepos = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      const reposResponse = await fetchWithTimeout(
        `${GITHUB_API_URL}/users/${encodeURIComponent(trimmedUsername)}/repos?sort=updated&per_page=${perPage}&page=${page}`,
        { headers },
        FETCH_TIMEOUT_GITHUB
      );

      if (!reposResponse.ok) {
        if (reposResponse.status === 404) {
          throw new Error(`GitHub user "${username}" not found. Check your username.`);
        }
        if (reposResponse.status === 403 || reposResponse.status === 429) {
          const remaining = reposResponse.headers.get('x-ratelimit-remaining');
          const resetTime = reposResponse.headers.get('x-ratelimit-reset');

          if (remaining === '0' && resetTime) {
            const resetDate = new Date(parseInt(resetTime) * 1000);
            const minutes = Math.ceil((resetDate - Date.now()) / 60000);
            throw new Error(`GitHub API rate limit exceeded. Resets in ${minutes} minutes. ${hasToken ? 'Check your token.' : 'Add a GitHub token in settings for higher limits.'}`);
          }
          throw new Error('GitHub API rate limit exceeded. Try again later or add a GitHub token for higher limits.');
        }
        throw new Error(`GitHub API error: ${reposResponse.status}`);
      }

      const repos = await reposResponse.json();
      if (!Array.isArray(repos)) {
        throw new Error('Unexpected GitHub API response format');
      }

      allRepos = allRepos.concat(repos);

      const linkHeader = reposResponse.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"') && hasToken) {
        page++;
      } else {
        hasMore = false;
      }
    }

    const reposToProcess = allRepos.slice(0, hasToken ? 500 : 15);

    const repoData = await Promise.all(
      reposToProcess.map(async (repo) => {
        let readme = '';
        let languages = [];

        try {
          const readmeResponse = await fetchWithTimeout(
            `${GITHUB_API_URL}/repos/${encodeURIComponent(trimmedUsername)}/${encodeURIComponent(repo.name)}/readme`,
            { headers: { ...headers, 'Accept': 'application/vnd.github.raw' } },
            FETCH_TIMEOUT_GITHUB
          );
          if (readmeResponse.ok) {
            readme = await readmeResponse.text();
            if (readme.length > 1500) {
              readme = readme.substring(0, 1500);
            }
          }
        } catch (e) {}

        try {
          const langResponse = await fetchWithTimeout(
            `${GITHUB_API_URL}/repos/${encodeURIComponent(trimmedUsername)}/${encodeURIComponent(repo.name)}/languages`,
            { headers },
            FETCH_TIMEOUT_GITHUB
          );
          if (langResponse.ok) {
            const langData = await langResponse.json();
            languages = Object.keys(langData);
          }
        } catch (e) {}

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

  if (history.length > 1000) {
    history.splice(1000);
  }

  await browser.storage.local.set({ history });

  await cleanupOldHistory();
}

async function getHistory() {
  const storage = await browser.storage.local.get('history');
  return { success: true, history: storage.history || [] };
}

async function importHistory(data) {
  if (!Array.isArray(data.history)) {
    throw new Error('Invalid history data format');
  }

  const storage = await browser.storage.local.get('history');
  const existingHistory = storage.history || [];
  const existingIds = new Set(existingHistory.map(item => item.id));

  const newItems = data.history.filter(item => {
    if (!item || !item.id || !item.timestamp || !item.question) {
      return false;
    }
    return !existingIds.has(item.id);
  });

  if (newItems.length === 0) {
    return { success: true, message: 'No new items to import', count: 0 };
  }

  const merged = [...newItems, ...existingHistory];
  merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  await browser.storage.local.set({ history: merged });

  return { success: true, message: `Imported ${newItems.length} item(s)`, count: newItems.length };
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
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phone: '',
    githubUsername: '',
    linkedinUrl: '',
    twitterUrl: '',
    portfolioUrl: '',
    otherLinks: [],
    deployedProjects: [],
    researchPapers: [],
    certifications: [],
    achievements: [],
    otherContext: '',
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
    githubToken: '',
    historyRetentionDays: DEFAULT_HISTORY_RETENTION_DAYS,
    llmProvider: 'groq',
    opencodeBaseUrl: DEFAULT_OPENCODE_BASE_URL,
    opencodeUsername: DEFAULT_OPENCODE_USERNAME,
    opencodePassword: '',
    opencodeModel: '',
    opencodeFallbacks: []
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
