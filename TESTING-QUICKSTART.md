# Testing Quick Start

Get your test suite running in 3 steps:

## 1. Install Dependencies

```bash
npm install
npx playwright install chromium
```

## 2. Run Tests

### Quick Test (Unit + Integration)
```bash
npm test
```

### With Coverage
```bash
npm run test:coverage
```

### E2E Tests (Full Browser)
```bash
npm run test:e2e
```

### All Tests
```bash
npm run test:all
```

## 3. View Results

### Interactive UI (Recommended for Development)
```bash
npm run test:ui
```

### E2E Test UI
```bash
npm run test:e2e:ui
```

## What Gets Tested?

- **Cache operations** - LRU eviction, storage, retrieval *(unit)*
- **Selector matching** - Globs, regex, domain patterns *(unit)*
- **DOM manipulation** - Element detection, replacement, restoration *(integration)*
- **Badge UI** - Creation, state, positioning *(integration)*
- **Inspection mode** - Finding specific elements, highlighting *(integration)*
- **Browser compatibility** - Syntax validation, DOM APIs *(E2E)*

> **Note:** Full userscript execution (with GM APIs, badge interactions, etc.) requires manual testing in a browser extension. See `tests/e2e/README.md` for details.

## Test File Structure

```
tests/
├── unit/              # Fast isolated tests
│   ├── cache.test.js
│   └── selectors.test.js
├── integration/       # DOM interaction tests
│   └── dom.test.js
└── e2e/              # Full browser tests
    └── neutralization.spec.js
```

## Next Steps

- Read [TESTING.md](./TESTING.md) for detailed documentation
- Add tests for new features before implementing them
- Run tests before committing changes
- Check coverage: `npm run test:coverage`

## Common Commands

```bash
# Watch mode (re-run on file change)
npm test -- --watch

# Run specific test file
npm test tests/unit/cache.test.js

# Debug E2E test
npx playwright test --debug

# See E2E test in browser
npx playwright test --headed
```

## Troubleshooting

**Tests fail with "GM is not defined"**
→ Make sure `tests/setup.js` is being loaded (check `vitest.config.js`)

**E2E tests timeout**
→ Increase timeout: Add `{ timeout: 10000 }` to test options

**No coverage generated**
→ Run `npm run test:coverage` instead of `npm test`

**Playwright browser not found**
→ Run `npx playwright install chromium`

## CI/CD Integration

The test suite is designed to run in CI. Example GitHub Actions:

```yaml
- run: npm install
- run: npm test -- --coverage
- run: npx playwright install
- run: npm run test:e2e
```

---

See [TESTING.md](./TESTING.md) for detailed information.
