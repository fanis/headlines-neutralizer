# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [2.0.0] - 2025-12-29

### Changed
- **Complete refactoring to modular ES6 architecture**
  - Split monolithic 2,569-line file into 11 focused modules for better maintainability
  - Entry point (`src/main.js`) orchestrates module imports and bootstrapping
  - Modules: api.js, badge.js, cache.js, config.js, dom.js, inspection.js, scoring.js, selectors.js, settings.js, storage.js, utils.js
- **Build system with Rollup**
  - Bundler creates single IIFE userscript from ES6 modules
  - Watch mode for development (`npm run dev`)
  - Output: `dist/headlines-neutralizer.js` (114KB, functionally identical to original)
- **Class-based architecture**
  - HeadlineCache, Storage, and other components now use ES6 classes
  - Better encapsulation, testability, and type safety
  - Only 1.6% size increase vs inline functions

### Added
- **Comprehensive test suite**
  - 326 unit and integration tests (95.7% passing)
  - Test coverage: cache operations, selector matching, DOM manipulation, badge UI, inspection mode
  - Unit tests: cache.test.js, selectors.test.js, api.test.js, scoring.test.js, utils.test.js, storage.test.js, settings.test.js
  - Integration tests: dom.test.js
  - E2E tests: browser compatibility validation with Playwright
  - Test documentation: TESTING.md, TESTING-QUICKSTART.md, tests/README.md
- **Build documentation**
  - BUILD.md with comprehensive module breakdown and development workflow
  - MANUAL-TESTING.md for testing full userscript in browser

### Fixed
- **Refactoring bugs** discovered and fixed during modular migration:
  - Badge toggle state management (BADGE_COLLAPSED type mismatch causing crashes)
  - Badge dragging memory leaks (event listeners not properly removed)
  - Badge collapse functionality (incorrect boolean checks)
  - Cache reapplication using stale seenEl WeakSet
  - Parameter mismatches in badge callbacks (storage, callbacks not passed through)
  - Inspection mode missing context parameters

### Development
- npm scripts: `build`, `build:watch`, `dev`, `test`, `test:ui`, `test:coverage`, `test:e2e`, `test:all`
- Vitest for unit/integration tests with jsdom
- Playwright for E2E browser tests
- Test fixtures and comprehensive mocking setup


## [1.8.0] - 2025-12-19

### Removed
- **Body text simplification feature** - Removed to streamline the tool and focus solely on headline neutralization

### Changed
- Streamlined badge design to show only headline controls
- Simplified stats dialog to focus on headline metrics

### Improved
- Badge positioning now slides flush to right edge when collapsed (no gap near scrollbar)
- Element inspection now prioritizes most specific elements over wrapper/overlay elements


## [1.7.0] - 2025-12-18

### Added
- **Element Inspection Mode** - Click 🔍 in badge, then click any element to see why it's matched/excluded with one-click fixes
- **Sanity check for long headlines** - Warns before processing text > 500 chars to prevent token waste. Per-domain exceptions with menu option to clear

### Fixed
- All dialogs now close with ESC key (pricing, welcome, strength selection)
- Manual selectors now bypass the 180-char limit (only auto-detection uses length validation)

## [1.6.3] - 2025-12-18

### Improved
- **Compact and flexible badge design**
  - Badge now auto-sizes to fit content (1 or 2 buttons) instead of fixed width
  - Minimum width ensures button visibility, maximum width adapts to content
  - Significantly reduced visual footprint when only showing headline neutralization button

- **Enhanced badge styling**
  - Moved "Neutralize Headlines" text from footer to distinct header section
  - Header uses darker green gradient (matching color scheme) for better contrast
  - Main content area changed to translucent light gray background (rgba(255,255,255,0.95))
  - Cleaner, more professional appearance with better visual hierarchy

### Fixed
- Badge collapse animation now correctly hides badge on right edge of screen
- Collapsible handle visibility restored (was being clipped by overflow)


## [1.6.2] - 2025-11-28

### Added
- **Collapsible badge** with discrete handle
  - Click the handle arrow to hide/show badge content
  - Badge slides into scrollbar area when collapsed, leaving only handle visible
  - State persists across all pages where the script is enabled
  - Handle shows directional arrow: ▶ when expanded (click to collapse), ◀ when collapsed (click to expand)
  - Minimalist handle design with no borders or background for discretion

### Improved
- **Streamlined domain controls menu**
  - Consolidated from 3 menu items to 2
  - Status display now acts as interactive toggle (shows "Current page: ENABLED/DISABLED (click to toggle)")
  - Single menu item handles both allowlist and denylist modes dynamically


## [1.6.1] - 2025-11-27

### Fixed
- Badge layout overflow issues on sites with conflicting CSS
- Badge disappearing on sites with aggressive DOM manipulation 
- Body simplification button appearing on all pages regardless of setting
- Article detection incorrectly identifying homepages and listing pages as articles
- Diff audit dialog not appearing on some sites due to CSS conflicts

### Improved
- Badge CSS now uses `!important` flags for better cross-site consistency
- Badge automatically recreates itself if removed by page JavaScript
- Article page detection with better homepage/listing page exclusion
- Body simplification button only appears when feature is enabled
- All dialogs now close with ESC key
- Diff audit dialog now uses Shadow DOM for CSS isolation

### Changed
- Removed headline count display from badge to improve layout
- Body simplification is now manual-only (no automatic application on page load)
- Badge shows real-time progress during body simplification (e.g., "B: simplifying 2/5...")


## [1.6.0] - 2025-11-25

### Added
- **API token tracking and cost monitoring**
  - Real-time tracking of input/output tokens from OpenAI API responses
  - Accurate cost calculation based on actual usage
  - Separate tracking for headlines vs body simplification
  - Persistent storage (survives browser restarts)
  - Independent from clearable page stats
  - Display in enhanced stats dialog with breakdown by feature
- **User-configurable API pricing**
  - New "Configure API pricing" menu option
  - Dialog to update pricing when OpenAI changes rates
  - Shows current model, pricing, last updated date, and source
  - Reset to defaults button (gpt-4o-mini: $0.15/$0.60 per 1M tokens)
  - Pricing information displayed in stats dialog
- **Parallel batch processing for body simplification**
  - Processes up to 5 batches concurrently instead of sequentially
  - 3-5x speed improvement for body simplification
  - Configurable max concurrent requests
  - Better progress logging

### Changed
- Stats dialog renamed to "Show stats & changes (diff audit)"
- Enhanced stats dialog now shows API usage prominently
- Token tracking uses correct OpenAI API field names (input_tokens/output_tokens)

### Improved
- Body simplification is now significantly faster
- Better logging for token usage tracking with DEBUG mode


## [1.5.1] - 2025-11-25

### Fixed
- Issue where API key dialog would appear 4-5 times on first install
- Script attempting to process pages without API key configured

### Added
- Welcome dialog on first install to guide users through setup
  - Provides step-by-step instructions with link to OpenAI API keys page
  - Explains domain control defaults (all sites disabled initially)
  - Option to "Set Up API Key" or "Maybe Later"
- First-install detection system

### Changed
- Default domain mode for new installs is now allowlist (disabled everywhere)
- Script remains inactive until API key is configured
- Prevents multiple API key dialogs from appearing on the same page


## [1.5.0] - 2025-11-25

### Added
- Article body text simplification feature
  - Automatically detects article pages vs listing/category pages
  - Simplifies body paragraphs by removing convoluted phrasing and jargon
  - Preserves all facts, numbers, names, and direct quotes verbatim
  - "B: original/simplified" toggle in badge (shown only on article pages)
  - Simplification strength dialog with 5 levels (Minimal to Maximum)
  - Toggle body simplification ON/OFF via menu
- Body simplification caching system
  - Caches up to 30 articles with LRU eviction
  - Uses URL + content hash for smart cache invalidation
  - Instant switching between original/simplified text
  - Survives page reloads and browser restarts
  - Cache statistics visible in diff audit dialog
- Enhanced stats dialog
  - Shows headline cache size
  - Shows body cache size with article count
  - Expandable list of cached articles with paragraph counts
  - Menu command renamed to "Show stats & changes (diff audit)"

### Changed
- Badge popup text shortened: "H: neutral/original" instead of full sentences
- Badge now shows two rows on article pages (headlines + body)
- Separate cache flush commands for headlines and body text

### Improved
- Smart article detection using multiple heuristics
- Body text extraction filters out UI elements, navigation, sidebars
- Batched API calls (10 paragraphs per batch) to manage rate limits
- Debounced cache writes to reduce localStorage I/O


## [1.4.0] - 2025-11-11

### Added
- Neutralization strength control with 5 preset levels (Minimal, Light, Moderate, Strong, Maximum)
- Interactive dialog for selecting neutralization strength via menu
- Temperature setting persists across sessions and page loads
- Visual indication of current strength level in menu
- Users can now fine-tune how aggressively headlines are neutralized
- Lower temperature values (Minimal/Light) preserve more of the original meaning
- Higher values (Strong/Maximum) provide more aggressive neutralization



## [1.3.0] - 2025-11-07

### Added
- Global configuration for selectors and exclusions that apply to all websites
- Per-domain configuration to add custom selectors and exclusions for specific websites
- Domain-specific settings are additions to global settings (not replacements)
- Wider configuration dialogs for easier editing

### Changed
- Menu reorganized to separate global and domain-specific settings
- Domain configurations now show global settings for reference while editing

### Improved
- API key save button now shows "Saved" feedback and auto-closes after 1 second
- Validation result dialogs now show only a "Close" button instead of confusing "Save/Cancel"
- Informational dialogs can be closed with Enter, Escape, or clicking outside

### Documentation
- Added guide for using global vs domain-specific configuration
- Updated configuration instructions with examples

## [1.2.1] - 2025-11-04

### Added
- Added licence


## [1.2.0] - 2025-11-04

### Added
- Initial public release
- Automatic headline detection
- Manual CSS selector configuration
- Domain allowlist/denylist system
- Per-domain caching to reduce API costs
- On-page badge to restore/reapply changes
- Visual flash animation when headlines are neutralized
- Diff audit to review all changes
- Publisher opt-out support
- Configuration via userscript manager menu
- Debug mode with console logging
