# Testing Guide

This document explains the testing setup for the Headlines Neutralizer userscript.

## Overview

The test suite uses a multi-layered approach:

1. **Unit Tests** - Fast, isolated tests for pure functions
2. **Integration Tests** - DOM manipulation and component interaction
3. **E2E Tests** - Full workflows in a real browser

## Setup

### Install Dependencies

```bash
npm install
```

This installs:
- `vitest` - Fast unit test framework
- `jsdom` - DOM environment for testing
- `@playwright/test` - E2E testing
- `@vitest/ui` - Interactive test UI
- `@vitest/coverage-v8` - Code coverage

### Install Playwright Browsers

```bash
npx playwright install
```

## Running Tests

### Unit & Integration Tests

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Watch mode
npm test -- --watch

# Run specific file
npm test tests/unit/cache.test.js
```

### E2E Tests

```bash
# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run in headed mode (see browser)
npx playwright test --headed

# Run specific test
npx playwright test tests/e2e/neutralization.spec.js
```

## Test Structure

```
tests/
├── setup.js                      # Global test setup
├── unit/                         # Unit tests
│   ├── cache.test.js            # Cache operations
│   ├── selectors.test.js        # Selector matching
│   └── ...
├── integration/                  # Integration tests
│   ├── dom.test.js              # DOM manipulation
│   └── ...
└── e2e/                         # End-to-end tests
    ├── neutralization.spec.js   # Full workflows
    └── ...
```

## What to Test

### Unit Tests ✅

Test pure functions in isolation:

- **Cache operations** (`cacheGet`, `cacheSet`, `cacheClear`)
  - Storing and retrieving values
  - LRU eviction
  - Timestamp updates

- **Selector matching** (`globToRegExp`, `domainPatternToRegex`)
  - Glob patterns
  - Regex patterns
  - Domain matching

- **Utilities**
  - Text parsing
  - Temperature/strength mappings
  - API cost calculation

### Integration Tests ✅

Test DOM interactions:

- **Headline detection**
  - Finding elements by selector
  - Filtering excluded elements
  - Skipping UI elements

- **Element replacement**
  - Storing original text
  - Updating content
  - Restoring originals

- **Badge behavior**
  - Creation and positioning
  - State management
  - Collapse/expand

- **Inspection mode**
  - Finding deepest meaningful element
  - Highlighting
  - Click handling

### E2E Tests ✅

Test complete workflows:

- **Full neutralization flow**
  - Auto-detect headlines
  - API call (mocked)
  - DOM updates
  - Cache storage

- **User interactions**
  - Toggle neutral/original
  - Badge collapse/expand
  - Inspection mode
  - Settings persistence

- **Cross-site behavior**
  - Domain allow/deny
  - Per-domain configs
  - Selector overrides

## Writing Tests

### Unit Test Example

```javascript
import { describe, it, expect } from 'vitest';

describe('myFunction', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

### Integration Test Example

```javascript
import { describe, it, expect } from 'vitest';
import { createTestDOM } from '../setup.js';

describe('DOM Feature', () => {
  it('should manipulate DOM', () => {
    const html = '<h1>Test</h1>';
    const container = createTestDOM(html);
    const h1 = container.querySelector('h1');

    h1.textContent = 'Changed';
    expect(h1.textContent).toBe('Changed');
  });
});
```

### E2E Test Example

```javascript
import { test, expect } from '@playwright/test';

test('should work end-to-end', async ({ page }) => {
  await page.setContent('<h1>Test</h1>');
  await page.waitForSelector('[data-neutralizer-changed="1"]');

  const text = await page.locator('h1').textContent();
  expect(text).toBe('Neutralized headline');
});
```

## Mocking

### Storage Mock

```javascript
const mockStorage = createMockStorage();
mockStorage.set('key', 'value');
expect(mockStorage.get('key')).toBe('value');
```

### API Mock

```javascript
const mockResponse = mockOpenAIResponse('Neutralized text');
GM_xmlhttpRequest.mockImplementation((opts) => {
  opts.onload({ responseText: JSON.stringify(mockResponse) });
});
```

### Browser API Mock

```javascript
global.GM_getValue = vi.fn((key, def) => def);
global.GM_setValue = vi.fn();
```

## Coverage

View coverage report:

```bash
npm run test:coverage
open coverage/index.html
```

Aim for:
- **Unit tests**: 90%+ coverage
- **Integration tests**: 80%+ coverage
- **E2E tests**: Critical paths

## CI Integration

Add to your CI pipeline:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test -- --coverage
      - run: npx playwright install
      - run: npm run test:e2e
```

## Debugging

### Debug Unit Tests

```bash
# Use debugger
npm test -- --inspect-brk

# Show console.log
npm test -- --reporter=verbose
```

### Debug E2E Tests

```bash
# Headed mode (see browser)
npx playwright test --headed

# Debug mode (step through)
npx playwright test --debug

# Show trace
npx playwright show-trace trace.zip
```

## Best Practices

Test behavior, not implementation. Use descriptive test names and keep tests fast (unit < 100ms, integration < 500ms). Mock external dependencies like API calls and storage. Test edge cases like empty strings, null values, and large inputs. Clean up after each test by resetting the DOM and clearing mocks.

## Troubleshooting

### Tests timing out

Increase timeout:
```javascript
test('slow test', async ({ page }) => {
  // ...
}, { timeout: 10000 });
```

### Mocks not working

Check setup.js is imported:
```javascript
import { beforeEach, vi } from 'vitest';
// Mocks should be in setup.js
```

### E2E tests failing

1. Check browser installed: `npx playwright install`
2. Check test server running: `npm run serve:test`
3. Inspect traces: `npx playwright show-trace`

## Maintenance

Add tests when adding features or fixing bugs. Review coverage reports periodically. Refactor tests if they become brittle. Document complex scenarios.

## Resources

- [Vitest docs](https://vitest.dev/)
- [Playwright docs](https://playwright.dev/)
