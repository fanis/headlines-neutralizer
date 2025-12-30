/**
 * Configuration constants and settings
 */

export const CFG = {
  model: 'gpt-4o-mini',
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

// Default API pricing (gpt-4o-mini as of January 2025)
export const DEFAULT_PRICING = {
  model: 'gpt-4o-mini',
  inputPer1M: 0.15,    // USD per 1M input tokens
  outputPer1M: 0.60,   // USD per 1M output tokens
  lastUpdated: '2025-01-25',
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
