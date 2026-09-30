/**
 * Configuration constants and settings
 */

// Default model id (a key of MODEL_OPTIONS)
export const DEFAULT_MODEL = 'gpt-6-luna-priority';

export const CFG = {
  model: DEFAULT_MODEL,  // Active model (can be changed via settings)
  temperature: 0.2,      // Sent only with reasoning effort 'none' (other efforts reject it)
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
// Pricing source: https://developers.openai.com/api/docs/pricing (as of 2026-09-30)
// Note: OpenAI renamed "priority processing" to "Fast mode" on 2026-07-30; it is
// billed at 2x the standard tier. service_tier "priority" remains a valid API
// alias. Fast model IDs keep the -priority suffix for consistency with stored
// selections.
// reasoning: the reasoning.effort sent with every request. Valid values differ
// per model family (GPT-5.6/GPT-6 reject 'minimal', GPT-6.1 Sol also rejects
// 'none'), so each entry names its own; '' sends no reasoning parameter.
// CFG.temperature is sent only with effort 'none': the API rejects temperature
// at any other effort.
export const MODEL_OPTIONS = {
  'gpt-6-luna-priority': {
    name: 'GPT-6 Luna Fast',
    apiModel: 'gpt-6-luna',
    description: 'Fast processing, low cost - Best for headlines',
    inputPer1M: 0.20,
    outputPer1M: 1.00,
    recommended: true,
    priority: true,
    reasoning: 'none'
  },
  'gpt-6-luna': {
    name: 'GPT-6 Luna',
    apiModel: 'gpt-6-luna',
    description: 'Half the cost of Luna Fast, about 2 seconds slower per batch',
    inputPer1M: 0.10,
    outputPer1M: 0.50,
    recommended: false,
    priority: false,
    reasoning: 'none'
  },
  'gpt-6.1-sol-priority': {
    name: 'GPT-6.1 Sol Fast',
    apiModel: 'gpt-6.1-sol',
    description: 'Highest fidelity - Keeps quotes and shortens more (about 20x the cost of Luna Fast)',
    inputPer1M: 4.00,
    outputPer1M: 20.00,
    recommended: false,
    priority: true,
    reasoning: 'low'
  }
};

// Identifier for the user-defined model entry in MODEL_OPTIONS
export const CUSTOM_MODEL_ID = 'custom';

// Valid reasoning effort values for the custom model definition
// ('minimal' is for original GPT-5 models; newer models use 'none' instead)
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

// Display names for model IDs that earlier versions offered, so the model
// change notice can name the user's previous model
export const REMOVED_MODEL_NAMES = {
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-5-nano': 'GPT-5 Nano',
  'gpt-5-mini': 'GPT-5 Mini',
  'gpt-5.2-priority': 'GPT-5.2 Priority',
  'gpt-5.6-luna': 'GPT-5.6 Luna',
  'gpt-4.1-nano-priority': 'GPT-4.1 Nano Fast',
  'gpt-5-mini-priority': 'GPT-5 Mini Fast',
  'gpt-5.6-terra-priority': 'GPT-5.6 Terra Fast',
  [CUSTOM_MODEL_ID]: 'your custom model'
};

// Default model of versions up to 2.6.x. Those versions did not save the
// default selection, so an existing user with no saved model was using this one.
export const LEGACY_DEFAULT_MODEL = 'gpt-4.1-nano-priority';

// OpenAI API model IDs with announced shutdown dates
// (https://developers.openai.com/api/docs/deprecations). An active custom model
// using one of them gets a one-time notice once the date has passed.
// gpt-5-nano and gpt-5-mini: OpenAI announced the shutdown of their 2025-08-07
// snapshots, which are the only snapshots behind those aliases.
export const RETIRED_API_MODELS = {
  'gpt-4.1-nano': '2026-10-23',
  'gpt-4.1-nano-2025-04-14': '2026-10-23',
  'gpt-5-nano': '2026-12-11',
  'gpt-5-nano-2025-08-07': '2026-12-11',
  'gpt-5-mini': '2026-12-11',
  'gpt-5-mini-2025-08-07': '2026-12-11'
};

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
  FIRST_INSTALL: 'neutralizer_installed_v1',
  API_TOKENS: 'neutralizer_api_tokens_v1',
  PRICING: 'neutralizer_pricing_v1',
  CACHE: 'neutralizer_cache_v1',
  MODEL: 'neutralizer_model_v1',
  RETIRED_NOTICE: 'neutralizer_retired_notice_v1',
  CUSTOM_MODEL: 'neutralizer_custom_model_v1',
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

// Default API pricing (gpt-6-luna fast tier, verified 2026-09-30)
export const DEFAULT_PRICING = {
  model: 'GPT-6 Luna Fast',
  inputPer1M: 0.20,    // USD per 1M input tokens
  outputPer1M: 1.00,   // USD per 1M output tokens
  lastUpdated: '2026-09-30',
  source: 'https://developers.openai.com/api/docs/pricing'
};

// Heuristic selectors and patterns
export const CARD_SELECTOR = 'article, [itemtype*="NewsArticle"], .card, .post, .entry, .teaser, .tile, .story, [data-testid*="card" i]';

export const KICKER_CLASS = /(kicker|eyebrow|label|badge|chip|pill|tag|topic|category|section|watch|brief|update|live|breaking)/i;
export const KICKER_ID = /(kicker|eyebrow|label|badge|chip|pill|tag|topic|category|section|watch|brief|update|live|breaking)/i;

export const UI_LABELS = /\b(comments?|repl(?:y|ies)|share|watch|play|read(?:\s*more)?|more|menu|subscribe|login|sign ?in|sign ?up|search|next|previous|prev|back|trending|latest|live|open|close|expand|collapse|video|audio|podcast|gallery|photos?)\b/i;

export const UI_CONTAINERS = '.meta, .metadata, .byline, .tools, .actions, .card__meta, .card__footer, .post__meta, [data-testid*="tools" i], [role="toolbar"]';

// Log prefix
export const LOG_PREFIX = '[neutralizer-ai]';
