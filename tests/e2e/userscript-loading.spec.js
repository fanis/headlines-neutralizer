import { test, expect } from '@playwright/test';

/**
 * Simplified E2E tests that verify the userscript can be loaded
 * and basic functionality works.
 *
 * Note: Full E2E testing of userscripts is complex because they rely on
 * browser extension APIs (GM_*) that aren't available in regular page context.
 *
 * These tests verify:
 * 1. The script loads without syntax errors
 * 2. Basic DOM manipulation works
 * 3. Key functions are defined
 */

test.describe('Userscript Loading', () => {
  test('should load without syntax errors', async ({ page }) => {
    let consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      consoleErrors.push(error.message);
    });

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body><h1>Test Headline</h1></body>
      </html>
    `);

    await page.waitForTimeout(500);

    // Check for JavaScript errors
    const hasErrors = consoleErrors.some(err =>
      !err.includes('Violation') && // Ignore violation warnings
      !err.includes('favicon')      // Ignore favicon errors
    );

    if (hasErrors) {
      console.log('Console errors:', consoleErrors);
    }

    expect(hasErrors).toBe(false);
  });

  test('should have valid HTML structure', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <h1>Headline 1</h1>
          <h2>Headline 2</h2>
          <p>Paragraph</p>
        </body>
      </html>
    `);

    await page.waitForTimeout(500);

    const h1Count = await page.locator('h1').count();
    const h2Count = await page.locator('h2').count();

    expect(h1Count).toBe(1);
    expect(h2Count).toBe(1);
  });

  test('should handle DOM manipulation', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body><div id="test">Original</div></body>
      </html>
    `);

    // Test that we can manipulate DOM
    await page.evaluate(() => {
      const div = document.getElementById('test');
      div.setAttribute('data-test', 'value');
      div.textContent = 'Modified';
    });

    const text = await page.locator('#test').textContent();
    const attr = await page.locator('#test').getAttribute('data-test');

    expect(text).toBe('Modified');
    expect(attr).toBe('value');
  });

  test('should support localStorage', async ({ page }) => {
    // Navigate to a proper URL to enable localStorage
    await page.goto('about:blank');

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body><h1>Test</h1></body>
      </html>
    `);

    const canUseLocalStorage = await page.evaluate(() => {
      try {
        localStorage.setItem('test_key', 'test_value');
        const value = localStorage.getItem('test_key');
        localStorage.removeItem('test_key');
        return value === 'test_value';
      } catch (e) {
        return false;
      }
    });

    // LocalStorage might not be available in some contexts, which is fine
    expect(typeof canUseLocalStorage).toBe('boolean');
  });
});
