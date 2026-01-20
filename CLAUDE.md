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

## Custom Skills

- `/release [patch|minor|major]` - Full release workflow with version bump, docs check, tests, build, commit, and tag
