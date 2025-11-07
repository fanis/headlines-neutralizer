# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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
