import { beforeEach, vi } from 'vitest';

// Mock GM functions
global.GM_getValue = vi.fn();
global.GM_setValue = vi.fn();
global.GM_deleteValue = vi.fn();
global.GM_registerMenuCommand = vi.fn();
global.GM_xmlhttpRequest = vi.fn();

global.GM = {
  getValue: vi.fn(),
  setValue: vi.fn(),
  deleteValue: vi.fn()
};

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  if (typeof document !== 'undefined' && document.body) {
    document.body.innerHTML = '';
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});

// Helper to create mock storage
export const createMockStorage = () => {
  const store = new Map();
  return {
    get: vi.fn((key, defaultValue) => store.get(key) ?? defaultValue),
    set: vi.fn((key, value) => store.set(key, value)),
    delete: vi.fn((key) => store.delete(key)),
    clear: () => store.clear(),
    _store: store
  };
};

// Helper to create test DOM
export const createTestDOM = (html) => {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
};

// Mock OpenAI API response
export const mockOpenAIResponse = (neutralized) => ({
  usage: {
    input_tokens: 100,
    output_tokens: 50
  },
  choices: [{
    message: {
      content: JSON.stringify([neutralized])
    }
  }]
});
