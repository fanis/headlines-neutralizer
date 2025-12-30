# Tests Directory

This directory contains all tests for the Headlines Neutralizer userscript.

## Quick Start

```bash
npm install
npm test
```

See [TESTING-QUICKSTART.md](../TESTING-QUICKSTART.md) for a quick guide or [TESTING.md](../TESTING.md) for comprehensive documentation.

## Directory Structure

```
tests/
├── setup.js              # Global test configuration and mocks
├── fixtures/             # Test HTML pages and data
│   └── sample-page.html  # Example page for E2E tests
├── unit/                 # Unit tests for pure functions
│   ├── cache.test.js     # Cache get/set/clear/trim logic
│   └── selectors.test.js # Domain and selector matching
├── integration/          # Tests with DOM manipulation
│   └── dom.test.js       # Element detection, replacement, badge
└── e2e/                  # End-to-end browser tests
    └── neutralization.spec.js  # Full workflows

## Test Categories

### 1. Unit Tests (`unit/`)
- **Purpose**: Test individual functions in isolation
- **Speed**: Very fast (< 100ms per test)
- **Scope**: Pure functions, no DOM, no API
- **Examples**: Cache operations, pattern matching, utilities

### 2. Integration Tests (`integration/`)
- **Purpose**: Test DOM interactions and component behavior
- **Speed**: Fast (< 500ms per test)
- **Scope**: DOM manipulation, element detection, UI components
- **Examples**: Badge creation, headline replacement, inspection mode

### 3. E2E Tests (`e2e/`)
- **Purpose**: Test complete user workflows in a real browser
- **Speed**: Slower (1-5 seconds per test)
- **Scope**: Full application behavior with mocked API
- **Examples**: Complete neutralization flow, settings persistence

## Writing New Tests

### For a new feature

1. **Start with unit tests** - Test the logic
   ```javascript
   // tests/unit/my-feature.test.js
   import { describe, it, expect } from 'vitest';

   describe('myFeature', () => {
     it('should work correctly', () => {
       expect(myFeature('input')).toBe('output');
     });
   });
   ```

2. **Add integration tests** - Test DOM interaction
   ```javascript
   // tests/integration/my-feature.test.js
   import { createTestDOM } from '../setup.js';

   it('should update DOM', () => {
     createTestDOM('<div id="test"></div>');
     myFeature();
     expect(document.querySelector('#test').textContent).toBe('updated');
   });
   ```

3. **Add E2E test** - Test complete flow
   ```javascript
   // tests/e2e/my-feature.spec.js
   test('should work end-to-end', async ({ page }) => {
     await page.goto('http://localhost:3000/sample-page.html');
     // ... test the feature
   });
   ```

## Helpers Available

### From `setup.js`

- `createMockStorage()` - Mock GM storage
- `createTestDOM(html)` - Create test DOM
- `mockOpenAIResponse(text)` - Mock API response

### Global Mocks

- `GM_getValue`, `GM_setValue` - Storage
- `GM_xmlhttpRequest` - API calls
- `GM_registerMenuCommand` - Menu items

## Running Specific Tests

```bash
# Single file
npm test tests/unit/cache.test.js

# Pattern matching
npm test -- cache

# Watch mode
npm test -- --watch

# With UI
npm run test:ui
```

## Debugging

### Unit/Integration Tests

```bash
# Verbose output
npm test -- --reporter=verbose

# Debug with Chrome DevTools
npm test -- --inspect-brk
```

### E2E Tests

```bash
# See browser
npx playwright test --headed

# Step through with debugger
npx playwright test --debug

# Generate trace
npx playwright test --trace on
npx playwright show-trace trace.zip
```

## Coverage

```bash
npm run test:coverage
```

View report: `open coverage/index.html`

Target coverage:
- Unit tests: 90%+
- Integration tests: 80%+
- Overall: 85%+

## Best Practices

**DO:**

- Test behavior, not implementation
- Use descriptive test names
- Mock external dependencies
- Keep tests focused and small
- Clean up after each test

**DON'T:**

- Test internal implementation details
- Make tests depend on each other
- Use real API calls
- Leave console.logs in tests
- Ignore flaky tests

## Troubleshooting

**Import errors**
→ Check `package.json` has `"type": "module"`

**GM functions undefined**
→ Verify `setup.js` is in `setupFiles` in `vitest.config.js`

**DOM not working**
→ Ensure `environment: 'jsdom'` in `vitest.config.js`

**Tests pass locally but fail in CI**
→ Check for timing issues, add `waitFor` or increase timeouts

---

For more details, see [../TESTING.md](../TESTING.md)
