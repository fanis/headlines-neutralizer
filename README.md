# Neutralize Headlines Userscript - Setup & Usage Guide

> **Latest Version**: 2.0.0 | [See What's New](CHANGELOG.md)

## Table of Contents
- [What It Does](#what-it-does)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development](#development)
  - [Building from Source](#building-from-source)
  - [Running Tests](#running-tests)
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

  **New in 2.0.0:** Complete architectural refactoring with modular ES6 code, comprehensive test suite (326 tests, 95.7% passing), class-based architecture for better maintainability, and build system using Rollup. Functionally identical to 1.8.0 for end users.

  **From 1.8.0:** Streamlined to focus solely on headline neutralization. Body text simplification has been removed.

  **From 1.7.0:** Element Inspection Mode - powerful diagnostic tool to troubleshoot selector configurations. Click 🔍 Inspect in the badge, then click any element to see exactly why it's being processed or ignored, with one-click fixes.

##  Features:
  - Automatic headline detection using smart heuristics
  - Adjustable neutralization strength (5 levels from Minimal to Maximum)
  - **Element Inspection Mode** - Diagnostic tool to troubleshoot why elements are/aren't being processed
  - Global + per-domain CSS selector configuration
  - Per-domain additions to selectors and exclusions
  - Per-domain enable/disable control (allowlist or denylist mode)
  - Intelligent caching to minimize API calls
  - On-page badge to restore/reapply changes
  - Visual flash animation when headlines are neutralized
  - **API usage tracking and cost monitoring** with real token counts and configurable pricing
  - **Sanity check for long headlines** - Warns before processing text > 500 characters (prevents token waste)
  - Stats dialog shows API usage, cache statistics, and all changes

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
  - Download `dist/headlines-neutralizer.js` from the repository
  - Open it in your browser (or drag & drop into browser)
  - Your userscript manager should detect it and prompt you to install
  - Click "Install"

2. First-time setup:
  - When you first visit a website after installation, a welcome dialog will appear
  - Click "Set Up API Key" to begin configuration
  - Follow the guided steps to get your OpenAI API key:
    1. Visit OpenAI's API keys page (link provided in dialog)
    2. Sign in or create an account
    3. Create a new secret key
    4. Copy and paste it in the next dialog
  - Click "Validate" to test your key, then "Save"
  - The script will automatically enable itself on all websites

3. You're done! The script will now run automatically on websites.

  ---
## Development

This project uses a modular ES6 architecture with a build system for easy development and testing.

### Building from Source

```bash
# Install dependencies
npm install

# Build the userscript
npm run build

# Output: dist/headlines-neutralizer.js
```

**Development workflow:**
```bash
npm run dev          # Watch mode - auto-rebuild on changes
npm run build        # Single build
```

The source code is organized into modules:
- `src/main.js` - Application entry point
- `src/modules/` - Individual feature modules (API, DOM, cache, etc.)
- `src/banner.txt` - Userscript metadata header

After building, install `dist/headlines-neutralizer.js` in your userscript manager.

### Running Tests

The project includes a comprehensive test suite with 326 tests covering unit, integration, and E2E scenarios.

```bash
npm test             # Unit + integration tests (326 tests, 95.7% passing)
npm run test:e2e     # E2E browser tests
npm run test:all     # All tests
npm run test:coverage # With coverage report
```

**Interactive test UI:**
```bash
npm run test:ui      # Vitest UI
npm run test:e2e:ui  # Playwright UI
```

**Test coverage:**
- Cache operations (LRU eviction, storage, retrieval)
- Selector matching (globs, regex, domain patterns)
- DOM manipulation (element detection, replacement, restoration)
- Badge UI (creation, state, positioning)
- Inspection mode (element finding, highlighting)
- API integration (OpenAI calls, token tracking, pricing)
- Storage (GM fallback chain, persistence)
- Scoring (headline heuristics, filtering)
- Utilities (text processing, DOM checks)

For detailed documentation:
- [BUILD.md](BUILD.md) - Build system, architecture, and releases
- [TESTING.md](TESTING.md) - Testing guide
- [TESTING-QUICKSTART.md](TESTING-QUICKSTART.md) - Quick start

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
  │ [H: neutral]              (12)      │
  │ Neutralize Headlines userscript     │
  └─────────────────────────────────────┘
```

  Badge Controls:
  - **H: neutral / H: original** - Toggle between neutral and original headlines
  - **🔍 Inspect** - Activate inspection mode to diagnose why elements are/aren't being processed
  - **(12)** - Number of headlines neutralized on this page

  **Inspection Mode:**
  - Click the 🔍 Inspect button to activate
  - Click any element on the page to see why it's matched/excluded
  - Shows detailed diagnostic information:
    - Element details (tag, classes, ID, CSS selector)
    - Processing status (matched, not matched, or excluded)
    - Which selectors match/exclude the element
    - Auto-detection reasoning
  - Action buttons to add selectors or remove exclusions
  - Press ESC to exit inspection mode

  To hide the badge: Use the menu option "Toggle badge (ON/OFF)"

  ---
##   Menu Options

  Access the menu through your userscript manager icon:

###  Configuration

  - **Set / Validate OpenAI API key** - Add or test your API key
  - **Configure API pricing** - Set or update pricing for cost calculations
    - Update input/output token costs when OpenAI changes pricing
    - Shows current model, pricing, last updated date, and source link
    - Reset to defaults button (gpt-4o-mini: $0.15/$0.60 per 1M tokens)
    - Cost calculations in stats dialog use these values

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

  - **Neutralization strength** - Adjust how aggressively headlines are rewritten
    - Opens a dialog with 5 levels to choose from:
      - **Minimal (0.0)** - Most conservative, preserves original meaning closely
      - **Light (0.1)** - Subtle neutralization with minimal changes
      - **Moderate (0.2)** - Balanced approach (default)
      - **Strong (0.35)** - More aggressive rewriting
      - **Maximum (0.5)** - Very aggressive neutralization
    - Current level is shown in menu and highlighted in dialog
    - Setting persists across sessions
  - Toggle auto-detect (ON/OFF) - Enable/disable automatic headline detection
    - Turn OFF to rely only on manual CSS selectors
  - Toggle DEBUG logs (ON/OFF) - Show detailed console logs
  - Toggle badge (ON/OFF) - Show/hide the on-page badge

###  Actions

  - **Show stats & changes (diff audit)** - View cache statistics and all changes
    - **API Usage & Cost** - Real-time tracking with actual token counts from OpenAI
      - Total input/output tokens and costs since installation
      - Based on current pricing configuration (see "Configure API pricing")
      - API stats persist and are independent from clearable page stats
    - Displays headline cache size
    - Shows all original → neutralized headline changes on current page
  - **Process visible now** - Manually trigger processing of visible headlines
  - **Flush headline cache & rerun** - Clear headline cache and reprocess everything
  - **Reset stats counters** - Reset the count shown in the badge

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

  1. **Use Inspection Mode (Recommended)**:
     - Click the 🔍 Inspect button in the badge
     - Click the headline you want to check
     - The diagnostic dialog will show exactly why it's not being processed:
       - ❌ Not matched by selectors → Use "Add as Global/Domain Selector" button
       - ⚠️ Excluded by a rule → Use "Remove Exclusion" button
       - ✅ Matched → Check if it's over 500 characters (sanity check blocking it)
  2. Try manual selectors:
     - For all sites: Menu → "Edit GLOBAL target selectors"
     - For this site only: Menu → "Edit DOMAIN additions: target selectors"
  3. Adjust exclusions: You might be excluding too much
     - Check both global and domain-specific exclusions
  4. Check if publisher opted out: Console will show "publisher opt-out detected"

###  Too Many/Wrong Elements Processed

  1. **Use Inspection Mode**:
     - Click the 🔍 Inspect button in the badge
     - Click the unwanted element being processed
     - Check which selector is matching it
     - Use the diagnostic dialog to add exclusions or remove problematic selectors
  2. Disable auto-detect: Menu → "Toggle auto-detect (OFF)"
  3. Use only manual selectors for precise targeting
  4. Add problematic elements to exclusions:
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
  - API usage stats: Stored locally, persists across sessions (input/output tokens, call counts)
  - API pricing configuration: Stored locally, user-configurable
  - Global settings: Stored locally in your browser
  - Domain-specific settings: Stored locally per-domain
  - Headline cache: Stored locally, per-domain, up to 1500 entries
  - Nothing is sent to external servers except OpenAI API calls

###  What's Sent to OpenAI:
  - Headline text for neutralization
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
  - Stats Dialog: Use "Show stats & changes" to monitor API usage, costs, cache statistics, and verify changes

  ---
##  Tips for Best Results

  1. Start with auto-detect ON - Let the script learn the site structure
  2. Set up global selectors first - Use settings that work on most sites
  3. Add domain-specific selectors sparingly - Only for sites that need special handling
  4. Check the stats dialog - Monitor API usage and costs, verify neutralizations, and track cache efficiency
  5. Use allowlist mode for sensitive sites - Avoid false positives
  6. Keep cache enabled - Dramatically reduces API costs on revisits
  7. Configure pricing - Update API pricing in settings when OpenAI changes rates for accurate cost tracking
  8. Toggle badge OFF for clean UI - Access controls via menu instead

  ---


## Provenance
This UserScript was authored by [Fanis Hatzidakis](https://github.com/fanis/headlines-neutralizer) with assistance from large-language-model tooling (ChatGPT and Claude Code). 
All code was reviewed, tested, and adapted by Fanis.


## Licence

Copyright (c) 2025 Fanis Hatzidakis

Licensed under PolyForm Internal Use License 1.0.0

See LICENCE.md