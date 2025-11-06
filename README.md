# Neutralize Headlines Userscript - Setup & Usage Guide

##  What It Does

  This userscript automatically detects and neutralizes sensationalist headlines on websites using
  OpenAI's API. It tones down dramatic language while preserving factual content, making your browsing experience
  calmer and more informative.

##  Features:
  - Automatic headline detection using smart heuristics
  - Manual CSS selector configuration for specific sites
  - Per-domain enable/disable control (allowlist or denylist mode)
  - Intelligent caching to minimize API calls
  - On-page badge to restore/reapply changes
  - Visual flash animation when headlines are neutralized
  - Diff audit to review all changes

  ---
##  Prerequisites

1. Browser userscript manager - Install one of these:
- https://www.tampermonkey.net/ (Chrome, Firefox, Edge, Safari, Opera)
- https://www.greasespot.net/ (Firefox)
- https://violentmonkey.github.io/ (Chrome, Firefox, Edge)

2. OpenAI API key
- Sign up at https://platform.openai.com/
- Generate an API key from your account settings
- The script uses the gpt-4o-mini model (cost-effective)

  ---
## Installation

1. Install the userscript:
  - Open src/headlines-neutralizer.js in your browser
  - Your userscript manager should detect it and prompt you to install
  - Click "Install"

2. Configure your API key:
  - After installation, visit any website
  - Click your userscript manager icon → "Neutralize Headlines" menu
  - Select "Set / Validate OpenAI API key"
  - Paste your API key and click "Validate" to test it
  - Click "Save"

3. You're done! The script will now run automatically on websites.

  ---
##  How It Works

###   Automatic Detection

  The script uses intelligent heuristics to find headlines:
  - Analyzes HTML tags (h1, h2, h3, etc.)
  - Evaluates CSS properties (font size, weight)
  - Scores text content (word count, punctuation, capitalization)
  - Filters out UI elements, navigation, and non-headlines

###  Processing Flow

  1. Headlines are detected as you scroll (visible-only mode)
  2. Text is sent to OpenAI API in batches (max 24 at once)
  3. Neutralized versions are cached per-domain
  4. Changes are applied with a brief highlight animation
  5. Original text is preserved and can be restored anytime

  ---
##  Using the Badge

  A small badge appears in the bottom-right corner of pages where headlines have been neutralized:

```
  ┌─────────────────────────────────────┐
  │ [Restore original headlines]  (12) │
  │ Neutralize Headlines userscript     │
  └─────────────────────────────────────┘
```
  Badge Controls:
  - "Restore original headlines" - Shows original clickbait text
  - "Neutralize headlines" - Reapplies neutral versions from cache
  - (12) - Number of headlines neutralized on this page

  To hide the badge: Use the menu option "Toggle badge (ON/OFF)"

  ---
##   Menu Options

  Access the menu through your userscript manager icon:

###  Configuration

  - Set / Validate OpenAI API key - Add or test your API key
  - Edit TARGET selectors - CSS selectors for elements to rewrite (one per line)
    - Examples: `h1, h2, .article-title, [itemprop="headline"]`
  - Edit EXCLUDES: elements (self) - Skip specific elements
    - Examples: `.sponsored, .ad-title, h4.category`
  - Edit EXCLUDES: containers (ancestors) - Skip everything inside containers
    - Examples: `header, footer, nav, aside`

###  Domain Controls

  - Current page: ENABLED/DISABLED - Shows status for current domain (informational)
  - Domain mode switcher - Toggle between two modes:
    - "Allowlist only" - Only runs on domains you explicitly add
    - "All domains with Denylist" - Runs everywhere except disabled domains
  - Add/Remove this domain - Quickly enable/disable the current site

###  Toggles

  - Toggle auto-detect (ON/OFF) - Enable/disable automatic headline detection
    - Turn OFF to rely only on manual CSS selectors
  - Toggle DEBUG logs (ON/OFF) - Show detailed console logs
  - Toggle badge (ON/OFF) - Show/hide the on-page badge

###  Actions

  - Show what changed (diff audit) - View all original → neutralized changes
  - Process visible now - Manually trigger processing of visible headlines
  - Flush cache & rerun - Clear cache and reprocess everything
  - Reset stats counters - Reset the count shown in the badge

  ---
##  Configuration Tips

### Selectors

  Try Auto-detection first (enabled by default) and if it doesn't work consider these tips.

  If a site has predictable headline selectors, add them manually:

  1. Right-click a headline → "Inspect Element"
  2. Note the CSS selector (e.g., `.story-headline`)
  3. Menu → "Edit TARGET selectors"
  4. Add the selector on a new line

  To exclude specific sections, for example to revent navigation, footers, or sidebars from being processed:

  1. Menu → "Edit EXCLUDES: containers (ancestors)"
  2. Add: nav, footer, aside, .sidebar

###  Domain-Specific Setup

  Allowlist Mode (safest):
  - Menu → Switch to "Allowlist only"
  - Visit sites you want to neutralize
  - Menu → "Add this domain to allowlist" for each site

  Denylist Mode (works everywhere):
  - Default mode - runs on all sites
  - Visit sites you DON'T want affected
  - Menu → "Disable on this domain"

  ---
##  Troubleshooting

###  Script Not Working

  1. Check if domain is disabled: Menu → Current page status
  2. Verify API key: Menu → "Set / Validate OpenAI API key" → Validate
  3. Check browser console (F12) for errors
  4. Enable DEBUG logs: Menu → "Toggle DEBUG logs (ON)"

###  Headlines Not Detected

  1. Try manual selectors: Inspect the page and add CSS selectors
  2. Adjust exclusions: You might be excluding too much
  3. Check if publisher opted out: Console will show "publisher opt-out detected"

###  Too Many/Wrong Elements Processed

  1. Disable auto-detect: Menu → "Toggle auto-detect (OFF)"
  2. Use only manual selectors for precise targeting
  3. Add problematic elements to EXCLUDES

###  API Errors

  - 401 Unauthorized: Invalid API key
  - 429 Rate Limited: Too many requests, wait a minute
  - 400 Bad Request: Page text may contain parsing errors

###  Publisher Opt-Out

  Some sites can opt out by adding this meta tag:
```
<meta name="neutralizer" content="no-transform">
```
  The script will respect this and disable itself.

  ---
##  Privacy & Storage

###  Data Storage:
  - API key: Stored locally (GM storage → localStorage → memory fallback)
  - Cache: Stored locally, per-domain, up to 1500 entries
  - Nothing is sent to external servers except OpenAI API calls

###  What's Sent to OpenAI:
  - Only the headline text for neutralization
  - No personal data, cookies, or browsing history

  ---
##  Keyboard Shortcuts

  When editing configuration modals:
  - Esc - Close modal
  - Ctrl/Cmd + Enter - Save and close

  ---
##  Advanced Configuration

###  Change AI Model

  Edit line 28 in the script:
```
model: 'gpt-4o-mini',  // Change to 'gpt-4o' for better quality
```

###  Adjust Batch Size

  Edit line 30:
```
maxBatch: 24,  // Reduce to 12 if hitting rate limits
```

###  Disable Highlight Animation

  Edit line 33:
```
highlight: false,
```

###  Change Detection Sensitivity

  Edit lines 49-50:
```
scoreThreshold: 75,  // Lower = more aggressive (60-90 range)
topKPerCard: 1,      // Increase to 2-3 for multiple headlines per card
```
  ---
##  Support & Feedback

  - Issues: Report bugs or request features on the project's repository
  - Console Logs: Enable DEBUG mode for detailed troubleshooting info
  - Diff Audit: Use "Show what changed" to verify the script is working correctly

  ---
##  Tips for Best Results

  1. Start with auto-detect ON - Let the script learn the site structure
  2. Check the diff audit - Verify neutralizations are accurate
  3. Use allowlist mode for sensitive sites - Avoid false positives
  4. Keep cache enabled - Dramatically reduces API costs on revisits
  5. Toggle badge OFF for clean UI - Access controls via menu instead

  ---


## Provenance
This UserScript was authored by [Fanis Hatzidakis](https://github.com/fanis/headlines-neutralizer) with assistance from large-language-model tooling (ChatGPT and Claude Code). 
All code was reviewed, tested, and adapted by Fanis.
