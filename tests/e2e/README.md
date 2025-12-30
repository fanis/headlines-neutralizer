# E2E Testing for Userscripts

## Why Full E2E Testing is Challenging

Userscripts run in a special browser extension context with access to `GM_*` APIs that aren't available in regular page JavaScript. This makes traditional E2E testing difficult because:

1. **GM API Dependency**: The script relies on `GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`, etc.
2. **Extension Context**: These APIs only exist when running as a userscript (via Tampermonkey, Violentmonkey, etc.)
3. **Async IIFE Wrapper**: The script is wrapped in `(async () => { ... })()` which complicates injection
4. **Storage Isolation**: GM storage is separate from localStorage

## Our Testing Approach

### ✅ Unit Tests (`tests/unit/`)
**What they test:**
- Pure functions in isolation
- Cache logic, pattern matching, utilities
- Fast and comprehensive

### ✅ Integration Tests (`tests/integration/`)
**What they test:**
- DOM manipulation
- Element detection and replacement
- Badge creation and UI components

### ✅ E2E Tests (This Directory)
**What they test:**
- Browser environment compatibility
- No JavaScript syntax errors
- DOM manipulation works
- Basic page structure

**What they DON'T test:**
- Full userscript execution (requires extension context)
- Actual neutralization workflow (needs GM APIs)
- Badge appearance and interaction (needs GM storage)

## Current E2E Tests

### `userscript-loading.spec.js`
Tests basic browser environment functionality:

1. **No Syntax Errors**: Page loads without JavaScript errors
2. **HTML Structure**: DOM queries work correctly
3. **DOM Manipulation**: Can modify elements and attributes
4. **Storage Available**: localStorage is accessible (when available)

These tests ensure the browser environment is compatible with the code's assumptions.

## Testing the Full Userscript

### Manual Testing
For full functionality testing, install the userscript in a real browser:

1. Install Tampermonkey/Violentmonkey
2. Load the userscript
3. Visit test pages
4. Verify:
   - Headlines are detected
   - Badge appears and works
   - Settings persist
   - API calls work
   - Cache functions properly

### Alternative: Puppeteer with Extension
For automated full testing, you would need:

```javascript
// Launch Chrome with extension
const browser = await puppeteer.launch({
  headless: false,
  args: [
    '--load-extension=/path/to/tampermonkey',
    '--disable-extensions-except=/path/to/tampermonkey'
  ]
});

// Install userscript
// Visit test pages
// Verify behavior
```

This is significantly more complex and requires:
- Browser extension build
- Extension installation automation
- Inter-extension communication
- More complex setup and maintenance

## What We've Achieved

- **Comprehensive unit test coverage** for all logic
- **Integration tests** for DOM manipulation
- **E2E smoke tests** for browser compatibility
- **Confidence in code quality** without full browser extension overhead

## Running the Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with visible browser
npm run test:e2e:headed

# Run with UI
npm run test:e2e:ui

# Run all tests (unit + integration + e2e)
npm run test:all
```

## Adding More E2E Tests

Good candidates for additional E2E tests:

- ✅ Selector query performance
- ✅ Event listener attachment
- ✅ CSS injection
- ✅ Element visibility detection
- ✅ Mutation observer setup

**Avoid testing:**
- ❌ GM API functionality (use unit tests with mocks)
- ❌ Actual API calls (use integration tests with fetch mocks)
- ❌ Complex user flows (too brittle without full extension context)

## Summary

This testing strategy provides:
- **Fast feedback** via unit tests
- **DOM confidence** via integration tests
- **Browser compatibility** via E2E tests
- **Practical maintenance** without extension complexity

For a userscript, this is the sweet spot between coverage and maintainability.
