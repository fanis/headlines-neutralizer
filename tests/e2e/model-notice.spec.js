import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tests for the one-time model change notice (built script, real startup)
 */

const userscriptPath = join(process.cwd(), 'dist', 'headlines-neutralizer.js');

function getScriptContent() {
  const content = readFileSync(userscriptPath, 'utf-8');
  const endMeta = content.indexOf('==/UserScript==');
  return endMeta === -1 ? content : content.slice(endMeta + '==/UserScript=='.length);
}

// GM API mocks backed by the given storage values; writes are recorded in
// window.__saved so tests can check what the script persisted
function gmMocks(storage) {
  return `
    const mockStorage = ${JSON.stringify({
      'neutralizer_installed_v1': 'true',
      'OPENAI_KEY': 'test-api-key',
      'neutralizer_domains_mode_v1': 'deny',
      'neutralizer_domains_excluded_v1': '[]',
      ...storage
    })};
    window.__saved = {};
    const get = (key, def) => mockStorage[key] !== undefined ? mockStorage[key] : def;
    const set = (key, value) => { mockStorage[key] = value; window.__saved[key] = value; };
    window.GM_getValue = get;
    window.GM_setValue = set;
    window.GM_deleteValue = () => {};
    window.GM_registerMenuCommand = () => {};
    window.GM_xmlhttpRequest = () => {};
    window.GM = {
      getValue: async (key, def) => get(key, def),
      setValue: async (key, value) => set(key, value),
      deleteValue: async () => {},
      xmlHttpRequest: () => {}
    };
  `;
}

async function loadWithStorage(page, storage) {
  await page.setContent('<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Shocking headline you will not believe!!!</h1></body></html>');
  await page.addScriptTag({ content: gmMocks(storage) });
  await page.addScriptTag({ content: getScriptContent() });
  await page.waitForTimeout(500);
}

// Text of the toast inside its shadow root, or null when none is shown
function toastText(page) {
  return page.evaluate(() => {
    for (const host of document.querySelectorAll('[data-neutralizer-ui]')) {
      const toast = host.shadowRoot?.querySelector('.toast');
      if (toast) return toast.textContent;
    }
    return null;
  });
}

test.describe('Model change notice', () => {
  test('existing user on the old default is told about the switch and can open model settings', async ({ page }, testInfo) => {
    await loadWithStorage(page, {});
    const text = await toastText(page);
    expect(text).toContain('AI models have been updated');
    expect(text).toContain('GPT-4.1 Nano Fast');
    expect(text).toContain('switched you to GPT-6 Luna Fast');
    expect(text).toContain('Model settings');
    expect(await page.evaluate(() => window.__saved['neutralizer_model_v1'])).toBe('gpt-6-luna-priority');

    await page.screenshot({ path: testInfo.outputPath('model-notice.png') });

    // The link opens the model selection dialog and closes the toast
    await page.evaluate(() => {
      for (const host of document.querySelectorAll('[data-neutralizer-ui]')) {
        host.shadowRoot?.querySelector('.toast a')?.click();
      }
    });
    await page.waitForTimeout(200);
    expect(await toastText(page)).toBeNull();
    const dialogOpen = await page.evaluate(() =>
      [...document.querySelectorAll('[data-neutralizer-ui]')].some(h => h.shadowRoot?.textContent.includes('GPT-6.1 Sol Fast')));
    expect(dialogOpen).toBe(true);
  });

  test('toast stays open until closed', async ({ page }) => {
    await loadWithStorage(page, { 'neutralizer_model_v1': 'gpt-5.6-terra-priority' });
    await page.waitForTimeout(16000);
    expect(await toastText(page)).toContain('GPT-5.6 Terra Fast');
  });

  test('user whose model is still offered sees no notice', async ({ page }) => {
    await loadWithStorage(page, { 'neutralizer_model_v1': 'gpt-6.1-sol-priority' });
    expect(await toastText(page)).toBeNull();
  });

  test('fresh install saves the default model at once so a key added later triggers no notice', async ({ page }) => {
    await loadWithStorage(page, { 'neutralizer_installed_v1': '', 'OPENAI_KEY': '' });
    expect(await page.evaluate(() => window.__saved['neutralizer_model_v1'])).toBe('gpt-6-luna-priority');
    expect(await toastText(page)).toBeNull();
  });

  test('legacy user on a disabled domain keeps the notice pending for an active page', async ({ page }) => {
    await loadWithStorage(page, { 'neutralizer_domains_mode_v1': 'allow', 'neutralizer_domains_enabled_v1': '[]' });
    expect(await toastText(page)).toBeNull();
    expect(await page.evaluate(() => window.__saved['neutralizer_model_v1'])).toBeUndefined();
  });

  test('active custom model retired by OpenAI asks the user to choose another model', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-24T12:00:00Z'));
    await loadWithStorage(page, {
      'neutralizer_model_v1': 'custom',
      'neutralizer_custom_model_v1': JSON.stringify({ apiModel: 'gpt-4.1-nano', inputPer1M: 0.2, outputPer1M: 0.8, priority: true, reasoning: '' })
    });
    const text = await toastText(page);
    expect(text).toContain('OpenAI retired gpt-4.1-nano');
    expect(text).toContain('Please choose another model');
    expect(await page.evaluate(() => window.__saved['neutralizer_retired_notice_v1'])).toBe('gpt-4.1-nano');
    expect(await page.evaluate(() => window.__saved['neutralizer_model_v1'])).toBeUndefined();
  });
});
