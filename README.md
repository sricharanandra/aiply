# Aiply

Browser extension for generating personalized job application answers using your profile data.

## Installation

1. Get a free Groq API key from https://console.groq.com/keys
2. Open Zen Browser (or Firefox)
3. Go to `about:debugging#/runtime/this-firefox`
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file from this folder

## Setup

1. Click the Aiply icon, then the settings gear
2. Enter your Groq API key
3. Add your GitHub username
4. Upload your resume (.tex, .pdf, or .txt)
5. Add any deployed project URLs
6. Click "Save Settings"
7. Click "Refresh Now" to cache your GitHub data

## Usage

1. Click the Aiply extension icon
2. Paste the application question
3. Optionally add company name (enables web search for company info)
4. Optionally paste the job description
5. Optionally add custom instructions (e.g., "keep it under 50 words")
6. Click "Generate Answer"
7. Copy the result

**Keyboard shortcut:** Ctrl+Enter to generate

## Tips

- For best results, always include the company name when applying
- The extension only mentions relevant projects based on the job
- Use custom instructions to adjust tone: "more casual", "more formal", "shorter"
- LaTeX resumes (.tex) parse cleaner than PDFs
- GitHub cache refreshes daily on browser startup

## Files

```
aiply/
├── manifest.json      # Extension config
├── popup/             # Main UI
├── options/           # Settings page
├── history/           # Generation history
├── background/        # API logic
├── lib/pdfjs/         # PDF parsing
└── icons/             # Extension icons
```

## Rate Limits

Free Groq tier: ~30 requests/minute, 250 requests/day for compound models.
