# Build System

This document explains the modular architecture and build system for the Headlines Neutralizer userscript.

## Overview

The project uses a modular ES6 architecture during development and bundles into a single userscript file for distribution.

### Why This Approach?

Modular source makes the code easier to maintain and test while the bundled output works with any userscript manager. Each module has a single responsibility and can be tested in isolation.

## Project Structure

```
headlines-neutralizer/
├── src/
│   ├── banner.txt              # Userscript metadata header
│   ├── main.js                 # Application entry point
│   └── modules/
│       ├── api.js              # OpenAI API integration
│       ├── badge.js            # Badge UI component
│       ├── cache.js            # LRU cache management
│       ├── config.js           # Configuration constants
│       ├── dom.js              # DOM manipulation & detection
│       ├── inspection.js       # Inspection mode
│       ├── scoring.js          # Headline scoring/filtering
│       ├── selectors.js        # Selector & domain matching
│       ├── settings.js         # Settings dialogs
│       ├── storage.js          # Storage abstraction
│       └── utils.js            # Utility functions
├── dist/
│   └── headlines-neutralizer.js       # Bundled output
├── tests/
│   ├── unit/                   # Unit tests (import modules)
│   ├── integration/            # Integration tests
│   └── e2e/                    # E2E tests
├── rollup.config.js            # Build configuration
└── package.json                # Dependencies & scripts
```

## Module Breakdown

### Core Modules (11 modules, ~91KB source)

| Module | Purpose |
|--------|---------|
| `config.js` | Configuration constants, defaults, regex patterns |
| `utils.js` | Text processing, DOM checks, utilities |
| `storage.js` | GM → localStorage → memory fallback chain |
| `cache.js` | LRU cache with automatic trimming |
| `selectors.js` | Glob/regex pattern matching |
| `scoring.js` | Headline scoring heuristics |
| `api.js` | OpenAI API calls, token tracking |
| `dom.js` | DOM manipulation, detection, rewriting |
| `badge.js` | Badge UI and interactions |
| `settings.js` | Settings dialogs and editors |
| `inspection.js` | Inspection mode and diagnostics |

### Entry Point

**`main.js`**
- Imports all modules
- Initializes storage, cache, API tracking
- Loads persisted settings
- Registers GM menu commands
- Sets up MutationObserver
- Bootstraps the application

## Build System

### Technology

- **Bundler**: Rollup
- **Output format**: IIFE (Immediately Invoked Function Expression)
- **Plugin**: `@rollup/plugin-node-resolve` (resolves ES6 imports)

### Build Configuration

**`rollup.config.js`**
```javascript
import resolve from '@rollup/plugin-node-resolve';
import { readFileSync } from 'fs';

const banner = readFileSync('./src/banner.txt', 'utf-8');

export default {
  input: 'src/main.js',
  output: {
    file: 'dist/headlines-neutralizer.js',
    format: 'iife',
    banner: banner,
    strict: true
  },
  plugins: [resolve()]
};
```

## Development Workflow

### Initial Setup

```bash
npm install
```

### Development Mode

```bash
npm run dev          # Watch mode - auto-rebuild on changes
```

Or manually:

```bash
npm run build        # Single build
npm run build:watch  # Watch mode
```

### Testing

```bash
npm test             # Unit + integration tests
npm run test:e2e     # E2E tests
npm run test:all     # All tests
npm run test:coverage # With coverage report
```

### Build Output

The bundled file is created at:
```
dist/headlines-neutralizer.js
```

- **Size**: ~113KB (2,982 lines)
- **Format**: Single IIFE with userscript header
- **Compatible**: All userscript managers

## Making Changes

### Modifying Code

1. Edit modules in `src/modules/`
2. Run `npm run build` to create the bundle
3. Install `dist/headlines-neutralizer.js` in your userscript manager

### Adding a New Module

1. Create `src/modules/mymodule.js`
2. Export functions/classes: `export function myFunction() { ... }`
3. Import in `src/main.js`: `import { myFunction } from './modules/mymodule.js'`
4. Run `npm run build`

### Testing Changes

```bash
# During development
npm run dev          # Terminal 1: Watch build
npm test -- --watch  # Terminal 2: Watch tests
```

## Releases

GitHub releases are automated via `.github/workflows/release.yml`. When you push a version tag, a release is created with the built userscript attached.

### Creating a Release

1. Update `CHANGELOG.md` with the new version section:
   ```markdown
   ## [2.1.0] - 2025-01-18

   ### Added
   - New feature description

   ### Fixed
   - Bug fix description
   ```

2. Build and verify locally:
   ```bash
   npm run build
   npm test
   ```

3. Commit your changes:
   ```bash
   git add .
   git commit -m "Prepare release 2.1.0"
   ```

4. Create and push a version tag:
   ```bash
   git tag 2.1.0
   git push origin main
   git push origin 2.1.0
   ```

5. The workflow will automatically:
   - Extract the changelog section for that version
   - Create a GitHub release named `v2.1.0`
   - Attach `dist/headlines-neutralizer.js` as a release asset

### Version Tag Format

Tags must follow semantic versioning without a `v` prefix:
- `2.0.0` - correct
- `2.1.0` - correct
- `v2.0.0` - will not trigger the workflow

### Changelog Format

The release workflow extracts notes from `CHANGELOG.md`. Each version section must use this format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- Feature descriptions

### Changed
- Change descriptions

### Fixed
- Bug fix descriptions
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Test
on: [push, pull_request]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install

      - name: Run tests
        run: npm test -- --coverage

      - name: Run E2E tests
        run: |
          npx playwright install chromium
          npm run test:e2e

      - name: Build userscript
        run: npm run build

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: userscript
          path: dist/headlines-neutralizer.js
```

## Troubleshooting

### Build fails with module not found

```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Tests fail after refactoring

- Check that imports in test files match new module structure
- Verify all exports are correctly named
- Run `npm test -- --reporter=verbose` for detailed output

### Bundled script doesn't work

1. Check for syntax errors: `node -c dist/headlines-neutralizer.js`
2. Check userscript header is present
3. Verify IIFE wrapper exists at start/end
4. Test in browser console for JavaScript errors

## Benefits

- Modular development with clean separation of concerns
- Test modules individually or together
- Single source of truth (no code duplication)
- Bundle works with all userscript managers
- Watch mode for fast iteration
- Easier to understand and extend
- TypeScript-ready if needed later

## Migration from Old Structure

The original monolithic file (`src/headlines-neutralizer.js`, 2,569 lines) has been refactored into:
- **Entry point**: `src/main.js` (180 lines)
- **11 modules**: `src/modules/*.js` (total ~2,400 lines)

All functionality has been preserved. The build process creates a functionally identical output.

---

Run `npm run build` to create `dist/headlines-neutralizer.js` from the modular source.
