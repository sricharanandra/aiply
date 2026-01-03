# Aiply

Browser extension for generating personalized job application answers using AI, your GitHub profile, and resume.

## Features

- **Application Mode**: Analyze any job application page, auto-detect questions, and generate answers in one click
- **Email Mode**: Manually paste questions and generate tailored responses
- **Profile Auto-fill**: Automatically fills name, email, phone, and links on forms
- **Smart Matching**: Detects form fields like "Name", "Portfolio link", "LinkedIn" across different platforms
- **Persistent Answers**: Generated answers stay when you close the popup to copy-paste
- **History Management**: All generated answers saved with search, export/import, and individual deletion
- **Additional Context**: Research papers, certifications, achievements, and custom context for AI
- **Backup & Restore**: Export/import all settings and profile data as JSON

## Installation

1. Get a free Groq API key from https://console.groq.com/keys
2. Open Firefox/Zen Browser
3. Go to `about:debugging#/runtime/this-firefox`
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file from this folder

## Setup

1. Click the Aiply icon, then the settings gear
2. Enter your Groq API key
3. Fill in your profile:
   - Name, email, phone
   - GitHub username
   - LinkedIn, portfolio, Twitter/X URLs
   - Other links and deployed projects
4. Upload your resume (.tex, .pdf, or .txt)
5. (Optional) Add additional context:
   - Research papers
   - Certifications
   - Achievements
   - Other context (anything else relevant)
6. (Optional) Add a GitHub token for higher API rate limits
7. Click "Save All Settings"

### Backup & Restore

Export your settings and profile:
1. Go to Settings
2. Click "Export Settings"
3. Save the JSON file

Import settings on another browser:
1. Go to Settings
2. Click "Import Settings"
3. Select your exported JSON file

### GitHub Token (Optional)

Without a token: 60 GitHub API requests/hour, fetches 15 repos
With a token: 5,000 requests/hour, fetches all public repos

To create a token:
1. Go to https://github.com/settings/tokens?type=beta
2. Generate new token (no permissions needed - public read-only)
3. Paste in Settings > GitHub Token

## Usage

### Application Mode (Recommended)

Use this when you're on a job application page:

1. Navigate to any job application form
2. Click the Aiply extension icon
3. Select "Application Mode" tab
4. Click "Analyze Page"
5. View generated answers for each question
6. Click "Copy" on any answer to copy it
7. Use "Regenerate" with custom instructions to tweak answers
8. Click "Fill All" to auto-fill profile fields (name, email, etc.)
9. Profile section shows all your data with individual Copy buttons

**Features:**
- Answers persist even when you close the popup to paste them
- Analysis clears automatically when you navigate to a different page
- Click "Clear Analysis" to manually reset
- All Q&A saved to history as grouped entries
- Copy individual profile fields (email, phone, links) directly from popup

### Email Mode

Use this for manually entering questions (email applications, cover letters):

1. Click the Aiply extension icon
2. Select "Email Mode" tab
3. Paste the application question
4. Optionally add company name (enables web search)
5. Optionally paste the job description
6. Optionally add custom instructions
7. Click "Generate Answer"
8. Copy the result

**Keyboard shortcut:** Ctrl+Enter to generate

### History Management

View and manage all your generated answers:

1. Click the Aiply icon, then click "History"
2. Search by question text, company name, page title, or URL
3. Click any entry to view full details
4. Application Mode entries show all Q&A pairs grouped together
5. Click "Copy" on individual answers
6. Click "×" to delete individual entries
7. Export all history to JSON for backup
8. Import history from JSON to restore or merge

**Features:**
- Application Mode entries tagged with "Application" badge and question count
- Email Mode entries show company name and custom instructions
- Click page URLs in Application Mode entries to revisit the form
- Import deduplicates entries automatically

## Tips

- Application Mode works best on standard job application forms
- For Google Forms, the extension detects question labels automatically
- Enhanced field detection works on most form builders (Google Forms, Typeform, etc.)
- Profile auto-fill matches common field variations: "Full Name", "Your Name", "Candidate Name"
- Use custom instructions to adjust tone: "more casual", "more formal", "shorter"
- Additional context (papers, certs, achievements) helps AI generate more relevant answers
- LaTeX resumes (.tex) parse cleaner than PDFs
- GitHub cache refreshes every 24 hours
- Add a GitHub token if you hit rate limits
- Export settings regularly to backup your profile data

## Files

```
aiply/
├── manifest.json      # Extension config
├── background/        # API logic, caching
├── content/           # Page scraper
├── popup/             # Main UI (both modes)
├── options/           # Settings page
├── history/           # Generation history
├── lib/pdfjs/         # PDF parsing
└── icons/             # Extension icons
```

## Rate Limits

**Groq API** (free tier): ~30 requests/minute

**GitHub API**:
- Without token: 60 requests/hour
- With token: 5,000 requests/hour

## Privacy

- Your data is sent to Groq API for answer generation
- GitHub API is used to fetch your public repos
- No data is stored externally - everything stays in your browser
