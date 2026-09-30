import { describe, it, expect, beforeEach, vi } from 'vitest';

// api.js keeps module-level state (CFG, MODEL_OPTIONS, MODEL_NOTICE), so each
// test imports fresh copies of config.js and api.js
async function load() {
  vi.resetModules();
  const config = await import('../../src/modules/config.js');
  const api = await import('../../src/modules/api.js');
  return { config, api };
}

function fakeStorage(data = {}) {
  return {
    data,
    get: async (key, def) => (key in data ? data[key] : def),
    set: async (key, value) => { data[key] = value; }
  };
}

const AFTER_OCT = new Date('2026-10-24T12:00:00Z');
const BEFORE_OCT = new Date('2026-10-22T12:00:00Z');

describe('initApiTracking model selection', () => {
  let config, api;

  beforeEach(async () => {
    ({ config, api } = await load());
  });

  it('fresh install uses the default model without a notice and marks it for saving', async () => {
    await api.initApiTracking(fakeStorage());
    expect(config.CFG.model).toBe('gpt-6-luna-priority');
    expect(api.MODEL_NOTICE).toBeNull();
    expect(api.MODEL_UNSAVED).toBe(true);
  });

  it('existing user with no saved model (legacy default) is switched with a notice', async () => {
    await api.initApiTracking(fakeStorage({ [config.STORAGE_KEYS.OPENAI_KEY]: 'sk-test' }));
    expect(config.CFG.model).toBe('gpt-6-luna-priority');
    expect(api.MODEL_NOTICE).toEqual({ type: 'switched', fromName: 'GPT-4.1 Nano Fast' });
    expect(api.MODEL_UNSAVED).toBe(true);
  });

  it('saved model that was removed is switched to the default with its display name', async () => {
    await api.initApiTracking(fakeStorage({ [config.STORAGE_KEYS.MODEL]: 'gpt-5.6-terra-priority' }));
    expect(config.CFG.model).toBe('gpt-6-luna-priority');
    expect(api.MODEL_NOTICE).toEqual({ type: 'switched', fromName: 'GPT-5.6 Terra Fast' });
    expect(api.MODEL_UNSAVED).toBe(true);
  });

  it('unknown saved model id is named by its id', async () => {
    await api.initApiTracking(fakeStorage({ [config.STORAGE_KEYS.MODEL]: 'some-old-model' }));
    expect(api.MODEL_NOTICE).toEqual({ type: 'switched', fromName: 'some-old-model' });
  });

  it('saved model that is still offered is kept without a notice', async () => {
    await api.initApiTracking(fakeStorage({
      [config.STORAGE_KEYS.MODEL]: 'gpt-6.1-sol-priority',
      [config.STORAGE_KEYS.OPENAI_KEY]: 'sk-test'
    }));
    expect(config.CFG.model).toBe('gpt-6.1-sol-priority');
    expect(api.MODEL_NOTICE).toBeNull();
    expect(api.MODEL_UNSAVED).toBe(false);
  });

  it('saved custom selection without a custom definition is switched', async () => {
    await api.initApiTracking(fakeStorage({ [config.STORAGE_KEYS.MODEL]: 'custom' }));
    expect(config.CFG.model).toBe('gpt-6-luna-priority');
    expect(api.MODEL_NOTICE).toEqual({ type: 'switched', fromName: 'your custom model' });
  });

  describe('custom model retired by OpenAI', () => {
    const customStorage = (extra = {}) => fakeStorage({
      [config.STORAGE_KEYS.MODEL]: 'custom',
      [config.STORAGE_KEYS.CUSTOM_MODEL]: JSON.stringify({ apiModel: 'gpt-4.1-nano', inputPer1M: 0.2, outputPer1M: 0.8, priority: true, reasoning: '' }),
      ...extra
    });

    it('flags a notice after the shutdown date and keeps the custom selection', async () => {
      await api.initApiTracking(customStorage(), AFTER_OCT);
      expect(config.CFG.model).toBe('custom');
      expect(api.MODEL_NOTICE).toEqual({ type: 'custom-retired', apiModel: 'gpt-4.1-nano', retiredOn: '2026-10-23' });
      expect(api.MODEL_UNSAVED).toBe(false);
    });

    it('does not flag a notice before the shutdown date', async () => {
      await api.initApiTracking(customStorage(), BEFORE_OCT);
      expect(api.MODEL_NOTICE).toBeNull();
    });

    it('does not repeat the notice once shown for that model', async () => {
      await api.initApiTracking(customStorage({ [config.STORAGE_KEYS.RETIRED_NOTICE]: 'gpt-4.1-nano' }), AFTER_OCT);
      expect(api.MODEL_NOTICE).toBeNull();
    });

    it('does not flag a custom model that has no shutdown date', async () => {
      await api.initApiTracking(fakeStorage({
        [config.STORAGE_KEYS.MODEL]: 'custom',
        [config.STORAGE_KEYS.CUSTOM_MODEL]: JSON.stringify({ apiModel: 'gpt-6-sol', inputPer1M: 2, outputPer1M: 10, priority: false, reasoning: 'none' })
      }), AFTER_OCT);
      expect(api.MODEL_NOTICE).toBeNull();
    });
  });
});
