# CLAUDE.md

## Build Commands

```bash
npm install        # Install dependencies
npm run build      # Build userscript to dist/
npm run dev        # Watch mode
npm test           # Run unit tests
npm run test:e2e   # Run E2E tests
npm run test:all   # Run all tests
```

## Workflow Rules

- Only run build and tests when actual code is edited (src/*, tests/*), not for documentation-only changes
- Git push to GitHub requires manual execution for authentication - remind user to push

## Architecture Notes

- Badge (`badge.js`): `ensureBadge(opts)` takes a single options object. Use a `badgeOpts()` factory in main.js to share between bootstrap and MutationObserver
- CSS isolation: light DOM badge uses `!important` on all properties + `neutralizer-` class prefix. Dialogs/modals use shadow DOM with `:host { all: initial }`. See summarizer project (`c:\install\summarize-the-web`) for reference patterns
- All UI elements get `data-neutralizer-ui` attribute via `UI_ATTR` constant
- Version lives in 3 files: `package.json`, `src/banner.txt` (@version), `src/main.js` (@version)

## Testing Notes

- Tests are DOM-structural: create elements, verify structure/classes/attributes. Avoid importing modules that need browser APIs (GM_*, shadow DOM in jsdom has limits)
- 5 "unhandled errors" from `api.test.js` error-path tests are pre-existing and expected - not failures
- Run `npm test -- --run` for single-run mode (no watch)

## Custom Skills

- `/release [patch|minor|major]` - Full release workflow with version bump, docs check, tests, build, commit, and tag
