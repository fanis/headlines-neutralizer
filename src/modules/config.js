/**
 * Configuration constants and settings
 */

export const CFG = {
  model: 'gpt-4.1-nano-priority',  // Default model (can be changed via settings)
  temperature: 0.2,
  maxBatch: 24,
  DEBUG: false,

  highlight: true,
  highlightMs: 900,
  highlightColor: '#fff4a3',

  visibleOnly: true,
  rootMargin: '1000px 0px',
  threshold: 0,
  flushDelayMs: 180,

  autoDetect: true,
  minLen: 8,
  maxLen: 180,
  sanityCheckLen: 500, // Warn user if manual selector matches text > 500 chars

  // smarter headline scoring
  minWords: 3,
  maxWords: 35,
  scoreThreshold: 75,
  topKPerCard: 1,
  kickerFilterStrict: true,

  DEBUG_SCORES: false,
  showOriginalOnHover: true,

  // cache controls
  cacheLimit: 1500,       // max entries
  cacheTrimTo: 1100,      // when trimming, keep last N
};

export const UI_ATTR = 'data-neutralizer-ui';

// Available models with pricing
// Pricing source: https://openai.com/api/pricing/ (verified 2026-01)
// Note: Priority tier (service_tier: 'priority') provides faster processing at no additional cost
export const MODEL_OPTIONS = {
  'gpt-5-nano': {
    name: 'GPT-5 Nano',
    apiModel: 'gpt-5-nano',
    description: 'Ultra-affordable latest generation - Best value',
    inputPer1M: 0.05,
    outputPer1M: 0.40,
    recommended: false,
    priority: false
  },
  'gpt-5-mini': {
    name: 'GPT-5 Mini',
    apiModel: 'gpt-5-mini',
    description: 'Better quality, still very affordable',
    inputPer1M: 0.25,
    outputPer1M: 2.00,
    recommended: false,
    priority: false
  },
  'gpt-4.1-nano-priority': {
    name: 'GPT-4.1 Nano Priority',
    apiModel: 'gpt-4.1-nano',
    description: 'Fast processing, affordable - Best for headlines',
    inputPer1M: 0.10,
    outputPer1M: 0.40,
    recommended: true,
    priority: true
  },
  'gpt-5-mini-priority': {
    name: 'GPT-5 Mini Priority',
    apiModel: 'gpt-5-mini',
    description: 'Better quality + faster processing',
    inputPer1M: 0.25,
    outputPer1M: 2.00,
    recommended: false,
    priority: true
  },
  'gpt-5.2-priority': {
    name: 'GPT-5.2 Priority',
    apiModel: 'gpt-5.2',
    description: 'Premium quality + fastest processing (most expensive)',
    inputPer1M: 1.75,
    outputPer1M: 14.00,
    recommended: false,
    priority: true
  }
};

// Temperature levels mapping
export const TEMPERATURE_LEVELS = {
  'Minimal': 0.0,
  'Light': 0.1,
  'Moderate': 0.2,
  'Strong': 0.35,
  'Maximum': 0.5
};

export const TEMPERATURE_ORDER = ['Minimal', 'Light', 'Moderate', 'Strong', 'Maximum'];

// Storage keys
export const STORAGE_KEYS = {
  SELECTORS: 'neutralizer_selectors_v1',
  EXCLUDES: 'neutralizer_excludes_v1',
  DOMAIN_SELECTORS: 'neutralizer_domain_selectors_v2',
  DOMAIN_EXCLUDES: 'neutralizer_domain_excludes_v2',
  LONG_HEADLINE_EXCEPTIONS: 'neutralizer_long_exceptions_v1',
  DOMAINS_MODE: 'neutralizer_domains_mode_v1',
  DOMAINS_DENY: 'neutralizer_domains_excluded_v1',
  DOMAINS_ALLOW: 'neutralizer_domains_enabled_v1',
  DEBUG: 'neutralizer_debug_v1',
  AUTO_DETECT: 'neutralizer_autodetect_v1',
  SHOW_ORIG: 'neutralizer_showorig_v1',
  SHOW_BADGE: 'neutralizer_showbadge_v1',
  BADGE_COLLAPSED: 'neutralizer_badge_collapsed_v1',
  BADGE_POS: 'neutralizer_badge_pos_v1',
  TEMPERATURE: 'neutralizer_temperature_v1',
  FIRST_INSTALL: 'neutralizer_installed_v1',
  API_TOKENS: 'neutralizer_api_tokens_v1',
  PRICING: 'neutralizer_pricing_v1',
  CACHE: 'neutralizer_cache_v1',
  MODEL: 'neutralizer_model_v1',
  OPENAI_KEY: 'OPENAI_KEY'
};

// Default selectors
export const DEFAULT_SELECTORS = [
  'h1', 'h2', 'h3', '.lead', '[itemprop="headline"]',
  '[role="heading"]', '.title', '.title a', '.summary',
  '.hn__title-container h2 a', '.article-title'
];

// Default excludes
export const DEFAULT_EXCLUDES = {
  self: [],
  ancestors: ['footer', 'nav', 'aside', '[role="navigation"]', '.breadcrumbs', '[aria-label*="breadcrumb" i]']
};

// Default API pricing (gpt-4.1-nano-priority, verified January 2026)
export const DEFAULT_PRICING = {
  model: 'GPT-4.1 Nano Priority',
  inputPer1M: 0.10,    // USD per 1M input tokens
  outputPer1M: 0.40,   // USD per 1M output tokens
  lastUpdated: '2026-01-23',
  source: 'https://openai.com/api/pricing/'
};

// Heuristic selectors and patterns
export const CARD_SELECTOR = 'article, [itemtype*="NewsArticle"], .card, .post, .entry, .teaser, .tile, .story, [data-testid*="card" i]';

export const KICKER_CLASS = /(kicker|eyebrow|label|badge|chip|pill|tag|topic|category|section|watch|brief|update|live|breaking)/i;
export const KICKER_ID = /(kicker|eyebrow|label|badge|chip|pill|tag|topic|category|section|watch|brief|update|live|breaking)/i;

export const UI_LABELS = /\b(comments?|repl(?:y|ies)|share|watch|play|read(?:\s*more)?|more|menu|subscribe|login|sign ?in|sign ?up|search|next|previous|prev|back|trending|latest|live|open|close|expand|collapse|video|audio|podcast|gallery|photos?)\b/i;

export const UI_CONTAINERS = '.meta, .metadata, .byline, .tools, .actions, .card__meta, .card__footer, .post__meta, [data-testid*="tools" i], [role="toolbar"]';

// Log prefix
export const LOG_PREFIX = '[neutralizer-ai]';
