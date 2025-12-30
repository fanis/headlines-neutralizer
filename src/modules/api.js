/**
 * OpenAI API integration and token tracking
 */

import { CFG, STORAGE_KEYS, DEFAULT_PRICING } from './config.js';
import { log } from './utils.js';

/**
 * API token usage tracking (persistent across sessions)
 */
export let API_TOKENS = {
  headlines: { input: 0, output: 0, calls: 0 }
};

/**
 * API Pricing configuration (user-editable)
 */
export let PRICING = { ...DEFAULT_PRICING };

/**
 * Initialize API tokens and pricing from storage
 */
export async function initApiTracking(storage) {
  try {
    const stored = await storage.get(STORAGE_KEYS.API_TOKENS, '');
    if (stored) API_TOKENS = JSON.parse(stored);
  } catch {}

  try {
    const stored = await storage.get(STORAGE_KEYS.PRICING, '');
    if (stored) PRICING = JSON.parse(stored);
  } catch {}
}

/**
 * Update API token usage
 */
export function updateApiTokens(storage, type, usage) {
  if (!usage) return;

  const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
  const outputTokens = usage.output_tokens || usage.completion_tokens || 0;

  if (inputTokens === 0 && outputTokens === 0) {
    log('WARNING: No token data found in usage object:', usage);
    return;
  }

  API_TOKENS[type].input += inputTokens;
  API_TOKENS[type].output += outputTokens;
  API_TOKENS[type].calls += 1;

  log(`${type} tokens: +${inputTokens} input, +${outputTokens} output (total: ${API_TOKENS[type].input + API_TOKENS[type].output})`);

  // Debounced save to avoid excessive writes
  clearTimeout(updateApiTokens._timer);
  updateApiTokens._timer = setTimeout(() => {
    storage.set(STORAGE_KEYS.API_TOKENS, JSON.stringify(API_TOKENS));
    log('API tokens updated and saved:', API_TOKENS);
  }, 1000);
}

/**
 * Reset API token statistics
 */
export async function resetApiTokens(storage) {
  API_TOKENS = {
    headlines: { input: 0, output: 0, calls: 0 }
  };
  await storage.set(STORAGE_KEYS.API_TOKENS, JSON.stringify(API_TOKENS));
  log('API token stats reset');
}

/**
 * Calculate total API cost based on current pricing
 */
export function calculateApiCost() {
  const inputCost = API_TOKENS.headlines.input * PRICING.inputPer1M / 1_000_000;
  const outputCost = API_TOKENS.headlines.output * PRICING.outputPer1M / 1_000_000;
  return inputCost + outputCost;
}

/**
 * Update pricing configuration
 */
export async function updatePricing(storage, newPricing) {
  PRICING = {
    ...PRICING,
    ...newPricing,
    lastUpdated: new Date().toISOString().split('T')[0] // YYYY-MM-DD
  };
  await storage.set(STORAGE_KEYS.PRICING, JSON.stringify(PRICING));
  log('Pricing updated:', PRICING);
}

/**
 * Reset pricing to defaults
 */
export async function resetPricingToDefaults(storage) {
  PRICING = { ...DEFAULT_PRICING };
  await storage.set(STORAGE_KEYS.PRICING, JSON.stringify(PRICING));
  log('Pricing reset to defaults');
}

/**
 * API request headers
 */
export function apiHeaders(key) {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
}

/**
 * XHR POST request
 */
export function xhrPost(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const api = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : GM_xmlhttpRequest;
    api({
      method: 'POST',
      url,
      data,
      headers,
      onload: (r) => {
        if (r.status >= 200 && r.status < 300) return resolve(r.responseText);
        const err = new Error(`HTTP ${r.status}`);
        err.status = r.status;
        err.body = r.responseText || '';
        reject(err);
      },
      onerror: (e) => { const err = new Error((e && e.error) || 'Network error'); err.status = 0; reject(err); },
      timeout: 30000,
      ontimeout: () => { const err = new Error('Request timeout'); err.status = 0; reject(err); },
    });
  });
}

/**
 * XHR GET request
 */
export function xhrGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const api = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : GM_xmlhttpRequest;
    api({
      method: 'GET',
      url,
      headers,
      onload: (r) => (r.status >= 200 && r.status < 300) ? resolve(r.responseText) : reject(Object.assign(new Error(`HTTP ${r.status}`), { status: r.status, body: r.responseText })),
      onerror: (e) => reject(Object.assign(new Error((e && e.error) || 'Network error'), { status: 0 })),
      timeout: 20000,
      ontimeout: () => reject(Object.assign(new Error('Request timeout'), { status: 0 })),
    });
  });
}

/**
 * Extract output text from API response
 */
export function extractOutputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  if (Array.isArray(data.output)) {
    const parts = [];
    for (const msg of data.output) {
      if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (typeof c.text === 'string') parts.push(c.text);
          else if (c.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
        }
      }
    }
    if (parts.length) return parts.join('');
  }
  if (Array.isArray(data.choices)) return data.choices.map((ch) => ch.message?.content || '').join('\n');
  return '';
}

/**
 * Rewrite batch of headlines via OpenAI API
 */
export async function rewriteBatch(storage, texts) {
  const KEY = await storage.get(STORAGE_KEYS.OPENAI_KEY, '');
  if (!KEY) {
    throw Object.assign(new Error('API key missing'), { status: 401 });
  }

  const safeInputs = texts.map(t => t.replace(/[\u2028\u2029]/g, ' '));
  const instructions =
    'You will receive INPUT as a JSON array of headlines.' +
    ' Rewrite each headline neutrally in the SAME language as input.' +
    ' Preserve factual meaning and named entities. Remove sensationalism and excess punctuation.' +
    ' If the headline contains a direct quote inside quotation marks (English "…", Greek «…»), keep that quoted text verbatim.' +
    ' Aim ≤ 110 characters when possible. Return ONLY a JSON array of strings, same order as input.';

  const body = JSON.stringify({
    model: CFG.model,
    temperature: CFG.temperature,
    max_output_tokens: 1000,
    instructions,
    input: JSON.stringify(safeInputs)
  });

  const resText = await xhrPost('https://api.openai.com/v1/responses', body, apiHeaders(KEY));
  const payload = JSON.parse(resText);

  // Track token usage
  if (payload.usage) {
    updateApiTokens(storage, 'headlines', payload.usage);
  }

  const outStr = extractOutputText(payload);
  if (!outStr) throw Object.assign(new Error('No output_text/content from API'), { status: 400 });
  const cleaned = outStr.replace(/^```json\s*|\s*```$/g, '');
  const arr = JSON.parse(cleaned);
  if (!Array.isArray(arr)) throw Object.assign(new Error('API did not return a JSON array'), { status: 400 });
  return arr;
}
