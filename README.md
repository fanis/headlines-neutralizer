# Neutralize Headlines Userscript - Setup & Usage Guide

> **Latest Version**: 1.3.0 | [See What's New](CHANGELOG.md)

## Table of Contents
- [What It Does](#what-it-does)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [How It Works](#how-it-works)
  - [Automatic Detection](#automatic-detection)
  - [Processing Flow](#processing-flow)
- [Using the Badge](#using-the-badge)
- [Menu Options](#menu-options)
  - [Configuration](#configuration)
  - [Domain Controls](#domain-controls)
  - [Toggles](#toggles)
  - [Actions](#actions)
- [Configuration Tips](#configuration-tips)
  - [Selectors](#selectors)
  - [Domain-Specific Setup](#domain-specific-setup)
- [Troubleshooting](#troubleshooting)
  - [Script Not Working](#script-not-working)
  - [Headlines Not Detected](#headlines-not-detected)
  - [Too Many/Wrong Elements Processed](#too-manywrong-elements-processed)
  - [API Errors](#api-errors)
  - [Publisher Opt-Out](#publisher-opt-out)
- [Privacy & Storage](#privacy--storage)
  - [Data Storage](#data-storage)
  - [What's Sent to OpenAI](#whats-sent-to-openai)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Advanced Configuration](#advanced-configuration)
  - [Change AI Model](#change-ai-model)
  - [Adjust Batch Size](#adjust-batch-size)
  - [Disable Highlight Animation](#disable-highlight-animation)
  - [Change Detection Sensitivity](#change-detection-sensitivity)
- [Support & Feedback](#support--feedback)
- [Tips for Best Results](#tips-for-best-results)
- [Provenance](#provenance)
- [Licence](#licence)

##  What It Does

  This userscript automatically detects and neutralizes sensationalist headlines on websites using
  OpenAI's API. It tones down dramatic language while preserving factual content, making your browsing experience
  calmer and more informative.

##  Features:
  - Automatic headline detection using smart heuristics
  - Global + per-domain CSS selector configuration
  - Per-domain additions to selectors and exclusions
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

  - **Set / Validate OpenAI API key** - Add or test your API key

  **Global Settings** (apply to all domains):
  - **Edit GLOBAL target selectors** - Base CSS selectors for all websites
    - Examples: `h1, h2, .article-title, [itemprop="headline"]`
  - **Edit GLOBAL excludes: elements (self)** - Base element exclusions for all websites
    - Examples: `.sponsored, .ad-title, h4.category`
  - **Edit GLOBAL excludes: containers (ancestors)** - Base container exclusions for all websites
    - Examples: `header, footer, nav, aside`

  **Domain-Specific Additions** (for current domain only):
  - **Edit DOMAIN additions: target selectors** - Additional selectors for this domain
    - Shows global settings (read-only) + domain additions (editable)
    - Domain selectors are added to global ones (not replaced)
  - **Edit DOMAIN additions: excludes elements** - Additional element exclusions for this domain
  - **Edit DOMAIN additions: excludes containers** - Additional container exclusions for this domain

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

### Global vs Domain-Specific Configuration

  **How it works:**
  - **Global settings** apply to all websites by default
  - **Domain-specific additions** are added on top of global settings for specific domains
  - Final selectors = Global + Domain-specific (merged together)

  **Best practices:**
  1. Set up global selectors that work on most sites (h1, h2, h3, etc.)
  2. Add domain-specific selectors only when a site needs special handling
  3. Use global excludes for common patterns (header, footer, nav)
  4. Use domain excludes for site-specific elements to skip

  **Example workflow:**
  - Global selectors: `h1, h2, h3, .article-title`
  - Visit reddit.com → Add domain selector: `.post-title`
  - Visit news.ycombinator.com → Add domain selector: `.storylink`
  - Each domain gets: Global selectors + Their specific additions

### Understanding the Domain-Specific Editor

  When you open a **domain-specific** editor, you'll see two sections:

  ```
  ┌─────────────────────────────────────────────┐
  │ Global settings (read-only):                │
  │ ┌─────────────────────────────────────────┐ │
  │ │ h1                                      │ │ ← Gray background
  │ │ h2                                      │ │   Cannot edit
  │ │ h3                                      │ │
  │ └─────────────────────────────────────────┘ │
  │                                             │
  │ Domain-specific additions (editable):       │
  │ ┌─────────────────────────────────────────┐ │
  │ │ .post-title                             │ │ ← White background
  │ │ .story-headline                         │ │   Edit here
  │ │                                         │ │
  │ └─────────────────────────────────────────┘ │
  └─────────────────────────────────────────────┘
  ```

  - **Top section**: Shows global settings for reference (read-only, gray)
  - **Bottom section**: Add domain-specific selectors (editable, white)
  - Final result combines both sections

### Adding Selectors

  Try Auto-detection first (enabled by default). If it doesn't work, add manual selectors:

  **For all websites:**
  1. Menu → "Edit GLOBAL target selectors"
  2. Add common selectors like: `h1, h2, h3, .headline`

  **For a specific website:**
  1. Visit the website
  2. Right-click a headline → "Inspect Element"
  3. Note the CSS selector (e.g., `.story-headline`)
  4. Menu → "Edit DOMAIN additions: target selectors (hostname)"
  5. Add the selector in the **bottom editable section**
  6. The top section shows global selectors for reference (read-only)

### Adding Exclusions

  To exclude specific sections from processing:

  **Global exclusions (all websites):**
  1. Menu → "Edit GLOBAL excludes: containers (ancestors)"
  2. Add: `nav, footer, aside, .sidebar`

  **Domain-specific exclusions:**
  1. Visit the website
  2. Menu → "Edit DOMAIN additions: excludes containers (hostname)"
  3. Add site-specific containers to exclude

###  Domain Enable/Disable Controls

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

  1. Try manual selectors:
     - For all sites: Menu → "Edit GLOBAL target selectors"
     - For this site only: Menu → "Edit DOMAIN additions: target selectors"
  2. Adjust exclusions: You might be excluding too much
     - Check both global and domain-specific exclusions
  3. Check if publisher opted out: Console will show "publisher opt-out detected"

###  Too Many/Wrong Elements Processed

  1. Disable auto-detect: Menu → "Toggle auto-detect (OFF)"
  2. Use only manual selectors for precise targeting
  3. Add problematic elements to exclusions:
     - For all sites: Menu → "Edit GLOBAL excludes"
     - For this site only: Menu → "Edit DOMAIN additions: excludes"

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
  - Global settings: Stored locally in your browser
  - Domain-specific settings: Stored locally per-domain
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
  2. Set up global selectors first - Use settings that work on most sites
  3. Add domain-specific selectors sparingly - Only for sites that need special handling
  4. Check the diff audit - Verify neutralizations are accurate
  5. Use allowlist mode for sensitive sites - Avoid false positives
  6. Keep cache enabled - Dramatically reduces API costs on revisits
  7. Toggle badge OFF for clean UI - Access controls via menu instead

  ---


## Provenance
This UserScript was authored by [Fanis Hatzidakis](https://github.com/fanis/headlines-neutralizer) with assistance from large-language-model tooling (ChatGPT and Claude Code). 
All code was reviewed, tested, and adapted by Fanis.


## Licence

Copyright (c) 2025 Fanis Hatzidakis

Licensed under PolyForm Internal Use License 1.0.0

See LICENCE.md