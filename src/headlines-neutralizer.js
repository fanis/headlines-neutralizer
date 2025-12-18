// ==UserScript==
// @name         Neutralize Headlines
// @namespace    https://fanis.dev/userscripts
// @author       Fanis Hatzidakis
// @license      PolyForm-Internal-Use-1.0.0; https://polyformproject.org/licenses/internal-use/1.0.0/
// @version      1.6.3
// @description  Tone down sensationalist titles and simplify article body text via OpenAI API. Auto-detect + manual selectors, exclusions, per-domain configs, domain allow/deny, caching, Android-safe storage.
// @match        *://*/*
// @exclude      about:*
// @exclude      moz-extension:*
// @run-at       document-end
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_deleteValue
// @grant        GM.deleteValue
// @grant        GM_registerMenuCommand
// @connect      api.openai.com
// ==/UserScript==

// SPDX-License-Identifier: PolyForm-Internal-Use-1.0.0
// Copyright (c) 2025 Fanis Hatzidakis
// License: PolyForm Internal Use License 1.0.0
// Summary: Free for personal and internal business use. No redistribution, resale,
// or offering as a service without a separate commercial license from the author.
// Full text: https://polyformproject.org/licenses/internal-use/1.0.0/

(async () => {
  'use strict';

  // ───────────────────────── CONFIG ─────────────────────────
  const CFG = {
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

  const UI_ATTR = 'data-neutralizer-ui';
  const HOST = location.hostname;

  const STATS = { total: 0, live: 0, cache: 0, batches: 0 };
  const LOG_PREFIX = '[neutralizer-ai]';
  function log(...args) { if (!CFG.DEBUG) return; console.log(LOG_PREFIX, ...args); }

  // Prevent multiple API key dialogs from showing
  let apiKeyDialogShown = false;

  // API token usage tracking (persistent, not cleared with stats)
  let API_TOKENS = {
    headlines: { input: 0, output: 0, calls: 0 },
    body: { input: 0, output: 0, calls: 0 }
  };

  // API Pricing configuration (user-editable)
  // Default: gpt-4o-mini pricing as of January 2025
  // Source: https://openai.com/api/pricing/
  let PRICING = {
    model: 'gpt-4o-mini',
    inputPer1M: 0.15,    // USD per 1M input tokens
    outputPer1M: 0.60,   // USD per 1M output tokens
    lastUpdated: '2025-01-25',
    source: 'https://openai.com/api/pricing/'
  };

  // ───────────────────────── STORAGE (GM → LS → memory) ─────────────────────────
  const MEM = new Map();
  const LS_KEY_NS = '__neutralizer__';

  const storage = {
    async get(key, def = '') {
      try { if (typeof GM?.getValue === 'function') { const v = await GM.getValue(key); if (v != null) return v; } } catch {}
      try { if (typeof GM_getValue === 'function') { const v = GM_getValue(key); if (v != null) return v; } } catch {}
      try { const bag = JSON.parse(localStorage.getItem(LS_KEY_NS) || '{}'); if (key in bag) return bag[key]; } catch {}
      if (MEM.has(key)) return MEM.get(key);
      return def;
    },
    async set(key, val) {
      let ok = false;
      try { if (typeof GM?.setValue === 'function') { await GM.setValue(key, val); ok = true; } } catch {}
      if (!ok) { try { if (typeof GM_setValue === 'function') { GM_setValue(key, val); ok = true; } } catch {} }
      if (!ok) { try { const bag = JSON.parse(localStorage.getItem(LS_KEY_NS) || '{}'); bag[key] = val; localStorage.setItem(LS_KEY_NS, JSON.stringify(bag)); ok = true; } catch {} }
      if (!ok) MEM.set(key, val);
      return ok;
    },
    async del(key) {
      let ok = false;
      try { if (typeof GM?.deleteValue === 'function') { await GM.deleteValue(key); ok = true; } } catch {}
      try { if (typeof GM_deleteValue === 'function') { GM_deleteValue(key); ok = true; } } catch {}
      try { const bag = JSON.parse(localStorage.getItem(LS_KEY_NS) || '{}'); if (key in bag) { delete bag[key]; localStorage.setItem(LS_KEY_NS, JSON.stringify(bag)); ok = true; } } catch {}
      MEM.delete(key);
      return ok;
    },
  };

  // ───────────────────────── PERSISTED LISTS ─────────────────────────
  const SELECTORS_KEY = 'neutralizer_selectors_v1'; // global defaults
  const DEFAULT_SELECTORS = ['h1','h2','h3','.lead','[itemprop="headline"]','[role="heading"]','.title','.title a','.summary','.hn__title-container h2 a','.article-title'];
  let SELECTORS_GLOBAL = DEFAULT_SELECTORS.slice();
  let SELECTORS_DOMAIN = []; // domain-specific additions
  let SELECTORS = []; // merged result

  const EXCLUDES_KEY = 'neutralizer_excludes_v1'; // global defaults
  const DEFAULT_EXCLUDES = { self: [], ancestors: ['footer','nav','aside','[role="navigation"]','.breadcrumbs','[aria-label*="breadcrumb" i]'] };
  let EXCLUDE_GLOBAL = { ...DEFAULT_EXCLUDES, ancestors: [...DEFAULT_EXCLUDES.ancestors] };
  let EXCLUDE_DOMAIN = { self: [], ancestors: [] }; // domain-specific additions
  let EXCLUDE = { self: [], ancestors: [] }; // merged result

  // Per-domain configuration (additive)
  const DOMAIN_SELECTORS_KEY = 'neutralizer_domain_selectors_v2'; // { 'hostname': [...] }
  const DOMAIN_EXCLUDES_KEY = 'neutralizer_domain_excludes_v2'; // { 'hostname': { self: [...], ancestors: [...] } }
  let DOMAIN_SELECTORS = {};
  let DOMAIN_EXCLUDES = {};

  const DOMAINS_MODE_KEY    = 'neutralizer_domains_mode_v1';     // 'deny' | 'allow'
  const DOMAINS_DENY_KEY    = 'neutralizer_domains_excluded_v1'; // array of patterns
  const DOMAINS_ALLOW_KEY   = 'neutralizer_domains_enabled_v1';  // array of patterns
  const DEBUG_KEY           = 'neutralizer_debug_v1';
  const AUTO_DETECT_KEY     = 'neutralizer_autodetect_v1';
  const SHOW_ORIG_KEY       = 'neutralizer_showorig_v1';
  const SHOW_BADGE_KEY      = 'neutralizer_showbadge_v1';
  const BADGE_COLLAPSED_KEY = 'neutralizer_badge_collapsed_v1';
  const BADGE_POS_KEY       = 'neutralizer_badge_pos_v1';
  const TEMPERATURE_KEY     = 'neutralizer_temperature_v1';
  const SIMPLIFY_BODY_KEY   = 'neutralizer_simplifybody_v1';
  const SIMPLIFICATION_STRENGTH_KEY = 'neutralizer_simplification_v1';
  const FIRST_INSTALL_KEY   = 'neutralizer_installed_v1';
  const API_TOKENS_KEY      = 'neutralizer_api_tokens_v1';
  const PRICING_KEY         = 'neutralizer_pricing_v1';

  // Temperature levels mapping
  const TEMPERATURE_LEVELS = {
    'Minimal': 0.0,
    'Light': 0.1,
    'Moderate': 0.2,
    'Strong': 0.35,
    'Maximum': 0.5
  };
  const TEMPERATURE_ORDER = ['Minimal', 'Light', 'Moderate', 'Strong', 'Maximum'];
  let TEMPERATURE_LEVEL = 'Moderate'; // default level name

  // Simplification strength levels mapping
  const SIMPLIFICATION_LEVELS = {
    'Minimal': 0.0,
    'Light': 0.1,
    'Moderate': 0.2,
    'Strong': 0.3,
    'Maximum': 0.4
  };
  const SIMPLIFICATION_ORDER = ['Minimal', 'Light', 'Moderate', 'Strong', 'Maximum'];
  let SIMPLIFICATION_LEVEL = 'Moderate'; // default level name
  let SIMPLIFICATION_TEMPERATURE = SIMPLIFICATION_LEVELS['Moderate'];

  // load toggles
  try { const v = await storage.get(DEBUG_KEY, ''); if (v !== '') CFG.DEBUG = (v === true || v === 'true'); } catch {}
  try { const v = await storage.get(AUTO_DETECT_KEY, ''); if (v !== '') CFG.autoDetect = (v === true || v === 'true'); } catch {}
  try { const v = await storage.get(SHOW_ORIG_KEY, ''); if (v !== '') CFG.showOriginalOnHover = (v === true || v === 'true'); } catch {}

  let SHOW_BADGE = true; // default
  try { const v = await storage.get(SHOW_BADGE_KEY, ''); if (v !== '') SHOW_BADGE = (v === true || v === 'true'); } catch {}

  let BADGE_COLLAPSED = false; // default expanded
  try { const v = await storage.get(BADGE_COLLAPSED_KEY, ''); if (v !== '') BADGE_COLLAPSED = (v === true || v === 'true'); } catch {}

  let BADGE_POS = { x: window.innerWidth - 220, y: window.innerHeight - 200 }; // default near bottom-right
  try { const v = await storage.get(BADGE_POS_KEY, ''); if (v) BADGE_POS = JSON.parse(v); } catch {}

  let SIMPLIFY_BODY = false; // default off
  try { const v = await storage.get(SIMPLIFY_BODY_KEY, ''); if (v !== '') SIMPLIFY_BODY = (v === true || v === 'true'); } catch {}

  // load temperature setting
  try {
    const v = await storage.get(TEMPERATURE_KEY, '');
    if (v !== '' && TEMPERATURE_LEVELS[v] !== undefined) {
      TEMPERATURE_LEVEL = v;
      CFG.temperature = TEMPERATURE_LEVELS[v];
    }
  } catch {}

  // load simplification strength setting
  try {
    const v = await storage.get(SIMPLIFICATION_STRENGTH_KEY, '');
    if (v !== '' && SIMPLIFICATION_LEVELS[v] !== undefined) {
      SIMPLIFICATION_LEVEL = v;
      SIMPLIFICATION_TEMPERATURE = SIMPLIFICATION_LEVELS[v];
    }
  } catch {}

  async function setDebug(on)         { CFG.DEBUG = !!on; await storage.set(DEBUG_KEY, String(CFG.DEBUG)); location.reload(); }
  async function setAutoDetect(on)    { CFG.autoDetect = !!on; await storage.set(AUTO_DETECT_KEY, String(CFG.autoDetect)); location.reload(); }
  async function setShowBadge(on)     { SHOW_BADGE = !!on; await storage.set(SHOW_BADGE_KEY, String(SHOW_BADGE)); location.reload(); }
  async function setSimplifyBody(on)  { SIMPLIFY_BODY = !!on; await storage.set(SIMPLIFY_BODY_KEY, String(SIMPLIFY_BODY)); location.reload(); }

  async function setTemperature(level) {
    if (TEMPERATURE_LEVELS[level] === undefined) return;
    TEMPERATURE_LEVEL = level;
    CFG.temperature = TEMPERATURE_LEVELS[level];
    await storage.set(TEMPERATURE_KEY, level);
    location.reload();
  }

  async function setSimplificationStrength(level) {
    if (SIMPLIFICATION_LEVELS[level] === undefined) return;
    SIMPLIFICATION_LEVEL = level;
    SIMPLIFICATION_TEMPERATURE = SIMPLIFICATION_LEVELS[level];
    await storage.set(SIMPLIFICATION_STRENGTH_KEY, level);
    location.reload();
  }

  // domain mode + lists
  let DOMAINS_MODE   = 'deny'; // default
  let DOMAIN_DENY    = [];
  let DOMAIN_ALLOW   = [];

  const CACHE_KEY = 'neutralizer_cache_v1';
  const BODY_CACHE_KEY = 'neutralizer_body_cache_v1';
  let CACHE = {};
  let BODY_CACHE = {};
  let cacheDirty = false;
  let bodyCacheDirty = false;

  // Body cache config - store fewer articles but more data per article
  const BODY_CACHE_LIMIT = 30;      // max articles
  const BODY_CACHE_TRIM_TO = 20;    // trim to this many articles

  // Load persisted data
  // Load global settings
  try { SELECTORS_GLOBAL = JSON.parse(await storage.get(SELECTORS_KEY, JSON.stringify(DEFAULT_SELECTORS))); } catch {}
  try { EXCLUDE_GLOBAL = JSON.parse(await storage.get(EXCLUDES_KEY, JSON.stringify(DEFAULT_EXCLUDES))); } catch {}

  // Load per-domain additions
  try { DOMAIN_SELECTORS = JSON.parse(await storage.get(DOMAIN_SELECTORS_KEY, '{}')); } catch {}
  try { DOMAIN_EXCLUDES = JSON.parse(await storage.get(DOMAIN_EXCLUDES_KEY, '{}')); } catch {}

  // Load domain-specific settings for current host
  if (DOMAIN_SELECTORS[HOST]) {
    SELECTORS_DOMAIN = DOMAIN_SELECTORS[HOST];
  }
  if (DOMAIN_EXCLUDES[HOST]) {
    EXCLUDE_DOMAIN = DOMAIN_EXCLUDES[HOST];
  }

  // Merge global + domain-specific
  SELECTORS = [...new Set([...SELECTORS_GLOBAL, ...SELECTORS_DOMAIN])]; // deduplicate
  EXCLUDE = {
    self: [...new Set([...EXCLUDE_GLOBAL.self, ...EXCLUDE_DOMAIN.self])],
    ancestors: [...new Set([...EXCLUDE_GLOBAL.ancestors, ...EXCLUDE_DOMAIN.ancestors])]
  };

  if (SELECTORS_DOMAIN.length > 0 || EXCLUDE_DOMAIN.self.length > 0 || EXCLUDE_DOMAIN.ancestors.length > 0) {
    log('domain-specific additions for', HOST, ':', {
      selectors: SELECTORS_DOMAIN,
      excludes: EXCLUDE_DOMAIN
    });
  }

  try { DOMAINS_MODE = await storage.get(DOMAINS_MODE_KEY, 'deny'); } catch {}
  try { DOMAIN_DENY  = JSON.parse(await storage.get(DOMAINS_DENY_KEY, JSON.stringify(DOMAIN_DENY))); } catch {}
  try { DOMAIN_ALLOW = JSON.parse(await storage.get(DOMAINS_ALLOW_KEY, JSON.stringify(DOMAIN_ALLOW))); } catch {}
  try { CACHE = JSON.parse(await storage.get(CACHE_KEY, '{}')); } catch {}
  try { BODY_CACHE = JSON.parse(await storage.get(BODY_CACHE_KEY, '{}')); } catch {}
  try {
    const stored = await storage.get(API_TOKENS_KEY, '');
    if (stored) API_TOKENS = JSON.parse(stored);
  } catch {}
  try {
    const stored = await storage.get(PRICING_KEY, '');
    if (stored) PRICING = JSON.parse(stored);
  } catch {}

  const compiledSelectors = () => SELECTORS.join(',');

  // ───────────────────────── PUBLISHER OPT-OUT ─────────────────────────
  function publisherOptOut() {
    const m1 = document.querySelector('meta[name="neutralizer"][content="no-transform" i]');
    const m2 = document.querySelector('meta[http-equiv="X-Content-Transform"][content="none" i]');
    return !!(m1 || m2);
  }
  const OPTED_OUT = publisherOptOut();
  if (OPTED_OUT) log('publisher opt-out detected; disabling.');

  // ───────────────────────── DOMAIN MATCHING ─────────────────────────
  function globToRegExp(glob) {
    const esc = s => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const g = esc(glob).replace(/\\\*/g,'.*').replace(/\\\?/g,'.');
    return new RegExp(`^${g}$`, 'i');
  }
  function domainPatternToRegex(p) {
    p = p.trim();
    if (!p) return null;
    if (p.startsWith('/') && p.endsWith('/')) {
      try { return new RegExp(p.slice(1,-1), 'i'); } catch { return null; }
    }
    if (p.includes('*') || p.includes('?')) return globToRegExp(p.replace(/^\.*\*?\./,'*.'));
    const esc = p.replace(/[.+^${}()|[\]\\]/g,'\\$&');
    return new RegExp(`(^|\\.)${esc}$`, 'i');
  }
  function listMatchesHost(list, host) {
    for (const pat of list) { const rx = domainPatternToRegex(pat); if (rx && rx.test(host)) return true; }
    return false;
  }
  function computeDomainDisabled(host) {
    if (DOMAINS_MODE === 'allow') return !listMatchesHost(DOMAIN_ALLOW, host);
    return listMatchesHost(DOMAIN_DENY, host);
  }
  let DOMAIN_DISABLED = computeDomainDisabled(HOST);
  if (DOMAIN_DISABLED) log('domain disabled by list:', HOST, 'mode=', DOMAINS_MODE);

  // ───────────────────────── HEURISTICS ─────────────────────────
  const CARD_SELECTOR = 'article, [itemtype*="NewsArticle"], .card, .post, .entry, .teaser, .tile, .story, [data-testid*="card" i]';

  const KICKER_CLASS = /(kicker|eyebrow|label|badge|chip|pill|tag|topic|category|section|watch|brief|update|live|breaking)/i;
  const KICKER_ID    = /(kicker|eyebrow|label|badge|chip|pill|tag|topic|category|section|watch|brief|update|live|breaking)/i;

  const UI_LABELS = /\b(comments?|repl(?:y|ies)|share|watch|play|read(?:\s*more)?|more|menu|subscribe|login|sign ?in|sign ?up|search|next|previous|prev|back|trending|latest|live|open|close|expand|collapse|video|audio|podcast|gallery|photos?)\b/i;
  const UI_CONTAINERS = '.meta, .metadata, .byline, .tools, .actions, .card__meta, .card__footer, .post__meta, [data-testid*="tools" i], [role="toolbar"]';

  const normalizeSpace = (s) => s.replace(/\s+/g, ' ').trim();
  const textTrim = (n) => normalizeSpace(n.textContent || '');
  const words = (s) => normalizeSpace(s).split(' ').filter(Boolean);
  const withinLen = (t) => { const L = t.length; return L >= CFG.minLen && L <= CFG.maxLen; };
  const hasPunct = (s) => /[.?!:;—–-]/.test(s);
  const hasDigit = (s) => /\d/.test(s);
  const isVisible = (el) => el.offsetParent !== null;
  const isEditable = (el) => el.closest('input, textarea, [contenteditable=""], [contenteditable="true"]');

  const lowerRatio = (s) => {
    const letters = s.match(/[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ]/g) || [];
    if (!letters.length) return 0;
    const lowers = s.match(/[a-zα-ωά-ώ]/g) || [];
    return lowers.length / letters.length;
  };
  const isAllCapsish = (s) => {
    const ls = s.replace(/[^A-Za-zΑ-Ωα-ωΆ-Ώ]/g,'');
    if (ls.length < 2) return false;
    const uppers = s.match(/[A-ZΑ-ΩΆ-Ώ]/g) || [];
    return uppers.length / ls.length >= 0.85;
  };

  function isLikelyKicker(el, t) {
    const w = words(t);
    const fewWords = w.length <= 4;
    const noEndPunct = !/[.?!]$/.test(t);
    const capsy = isAllCapsish(t);
    const looksLikeLabel = (el.className && KICKER_CLASS.test(el.className)) || (el.id && KICKER_ID.test(el.id));
    return ((CFG.kickerFilterStrict && (capsy && fewWords && noEndPunct)) || looksLikeLabel);
  }

  function tagScore(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'h1') return 100;
    if (tag === 'h2') return 90;
    if (tag === 'h3') return 80;
    if (tag === 'h4') return 65;
    if (tag === 'a')  return 60;
    if (el.hasAttribute('role') && el.getAttribute('role') === 'heading') return 75;
    if (el.hasAttribute('itemprop') && /headline/i.test(el.getAttribute('itemprop'))) return 85;
    return 50;
  }
  function cssScore(el) {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 0;
    const fw = parseInt(cs.fontWeight, 10) || 400;
    let s = 0;
    if (fs) {
      s += Math.min(40, (fs - 12) * 2);
      if (fs < 14) s -= 30;
    }
    if (fw >= 700) s += 12;
    else if (fw >= 600) s += 8;
    else if (fw >= 500) s += 4;
    return s;
  }
  function contentScore(t) {
    const w = words(t);
    if (w.length < CFG.minWords) return -40;
    if (w.length > CFG.maxWords) return -20;
    let s = 0;
    if (hasPunct(t)) s += 8;
    if (hasDigit(t)) s += 4;
    const lr = lowerRatio(t);
    if (lr < 0.2) s -= 25;
    if (/[“”"«»]/.test(t)) s += 2;
    return s;
  }
  function computeCandidateScore(el, t) {
    let s = 0;
    s += tagScore(el);
    s += cssScore(el);
    s += contentScore(t);
    if (el.closest(CARD_SELECTOR)) s += 10;
    if (isLikelyKicker(el, t)) s -= 50;
    if (el.tagName.toLowerCase() === 'a' && words(t).length <= 3 && !hasPunct(t)) s -= 24;
    return s;
  }
  function isHardRejectText(el, t) {
    const w = words(t).length;
    if (el.closest?.(UI_CONTAINERS)) return true;
    if (UI_LABELS.test(t)) return true;
    const href = el.tagName?.toLowerCase?.() === 'a' ? (el.getAttribute('href') || '') : '';
    if (/#/.test(href) || /comment/i.test(href)) return true;
    if (w <= 2 && !hasPunct(t) && t.length < 18) return true;
    if (isAllCapsish(t) && w <= 4 && !hasPunct(t)) return true;
    return false;
  }

  function findTextHost(el) {
    const p = el.querySelector(':scope > p'); if (p && withinLen(textTrim(p))) return p;
    const a = el.querySelector(':scope > a'); if (a && withinLen(textTrim(a))) return a;
    const kids = Array.from(el.children);
    if (kids.length === 1 && textTrim(kids[0]) === textTrim(el)) return kids[0];
    let best=null, bestLen=0; for (const c of kids){ const L=textTrim(c).length; if (L>bestLen){best=c;bestLen=L;} }
    return best && bestLen ? best : el;
  }

  function ensureHighlightCSS() {
    if (document.getElementById('neutralizer-ai-style')) return;
    const style = document.createElement('style');
    style.id = 'neutralizer-ai-style';
    style.textContent = `
      .neutralizer-ai-flash { animation: neutralizerFlash var(--neutralizer-duration, 900ms) ease-out; }
      @keyframes neutralizerFlash {
        0% { background-color: var(--neutralizer-color, #fff4a3);
             box-shadow: 0 0 0 2px rgba(0,0,0,.03), 0 0 12px rgba(0,0,0,.12); }
        100% { background-color: transparent; box-shadow: none; }
      }
      .neutralizer-badge { position: fixed !important; z-index: 2147483646;
        font: 12px/1.4 system-ui, sans-serif !important; color: #0b3d2c !important;
        background: rgba(255,255,255,0.95) !important;
        border: 1px solid #79d4b0 !important; padding: 0 !important; border-radius: 10px !important;
        box-shadow: 0 6px 22px rgba(0,0,0,.18) !important;
        display: flex !important; flex-direction: column !important; gap: 0 !important;
        box-sizing: border-box !important; width: max-content !important; min-width: 120px !important;
        margin: 0 !important; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        user-select: none !important; }
      .neutralizer-badge.collapsed { right: 0 !important; left: auto !important;
        transform: translateX(calc(100% - 1px)) !important; border-right: none !important;
        border-radius: 10px 0 0 10px !important; box-shadow: -4px 0 22px rgba(0,0,0,.18) !important; }
      .neutralizer-badge.dragging { transition: none !important; cursor: grabbing !important; }
      .neutralizer-badge .badge-handle { position: absolute !important; left: -28px !important; top: 50% !important;
        transform: translateY(-50%) !important; width: 28px !important; height: 56px !important;
        background: linear-gradient(90deg, #d4f8e8 0%, #c9f6e1 100%) !important; border: 1px solid #79d4b0 !important; border-right: none !important;
        border-radius: 8px 0 0 8px !important; cursor: pointer !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        font-size: 14px !important; color: #0b3d2c !important; user-select: none !important;
        box-shadow: -3px 0 12px rgba(0,0,0,.12) !important; transition: all 0.2s ease !important; }
      .neutralizer-badge .badge-handle:hover { left: -30px !important; box-shadow: -4px 0 16px rgba(0,0,0,.18) !important; }
      .neutralizer-badge .badge-header { background: linear-gradient(135deg, #2d6a54 0%, #0b3d2c 100%) !important;
        color: #fff !important; padding: 6px 10px !important; font-size: 10px !important;
        font-weight: 600 !important; text-align: center !important; cursor: grab !important;
        user-select: none !important; border-radius: 9px 9px 0 0 !important;
        letter-spacing: 0.3px !important; }
      .neutralizer-badge .badge-header:active { cursor: grabbing !important; }
      .neutralizer-badge .badge-content { display: flex !important; flex-direction: column !important;
        gap: 6px !important; padding: 8px 10px !important; }
      .neutralizer-badge * { box-sizing: border-box !important; }
      .neutralizer-badge .row { display: flex !important; gap: 8px !important; align-items: center !important;
        justify-content: center !important; margin: 0 !important; padding: 0 !important; width: 100%; }
      .neutralizer-badge .btn { cursor: pointer !important; padding: 6px 10px !important; border-radius: 8px !important;
        border: 1px solid #79d4b0 !important; background: #fff !important; box-sizing: border-box !important;
        white-space: nowrap !important; font-family: system-ui, sans-serif !important;
        font-size: 12px !important; line-height: 1.2 !important; color: #0b3d2c !important;
        margin: 0 !important; min-width: 0 !important; width: auto !important; }
      .neutralizer-badge .btn.primary { background: #0b3d2c !important; color: #fff !important;
        border-color: #0b3d2c !important; }
      .neutralizer-badge .btn:disabled { opacity: 0.6 !important; cursor: not-allowed !important; }
      .neutralizer-badge .small { font-size: 11px !important; opacity: .9 !important; }
    `;
    document.head.appendChild(style);
  }
  ensureHighlightCSS();

  function isExcluded(el) {
    if (el.closest?.(`[${UI_ATTR}]`)) return true;
    if (isEditable(el)) return true;
    if (EXCLUDE.self.length && el.matches?.(EXCLUDE.self.join(','))) return true;
    if (EXCLUDE.ancestors.length && el.closest?.(EXCLUDE.ancestors.join(','))) return true;
    return false;
  }

  // ───────────────────────── DATA STRUCTURES ─────────────────────────
  let seenEl = new WeakSet();
  const textToElements = new Map(); // text -> Set<host elements>
  const CHANGES = [];               // {from,to,count,source,mode:'auto'|'manual'}

  const cacheKey = (t) => HOST + '|' + t;
  const cacheGet = (t) => (CACHE[cacheKey(t)]?.r) ?? null;
  function cacheSet(t, r) {
    CACHE[cacheKey(t)] = { r, t: Date.now() };
    cacheDirty = true;
    const size = Object.keys(CACHE).length;
    if (size > CFG.cacheLimit) {
      // lazy trim
      queueMicrotask(() => {
        const keys = Object.keys(CACHE);
        if (keys.length <= CFG.cacheLimit) return;
        keys.sort((a,b)=>CACHE[a].t - CACHE[b].t);
        const toDrop = Math.max(0, keys.length - CFG.cacheTrimTo);
        for (let i=0; i<toDrop; i++) delete CACHE[keys[i]];
        storage.set(CACHE_KEY, JSON.stringify(CACHE));
        cacheDirty = false;
        log('cache trimmed:', keys.length, '→', Object.keys(CACHE).length);
      });
    } else if (cacheDirty) {
      clearTimeout(cacheSet._t);
      cacheSet._t = setTimeout(() => { storage.set(CACHE_KEY, JSON.stringify(CACHE)); cacheDirty = false; }, 250);
    }
  }
  async function cacheClear() { CACHE = {}; await storage.set(CACHE_KEY, JSON.stringify(CACHE)); }

  // ───────────────────────── BODY CACHE ─────────────────────────
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  function getBodyCacheKey(url, paragraphTexts) {
    // Create a cache key from URL + hash of concatenated paragraph texts
    const contentHash = simpleHash(paragraphTexts.join('|||'));
    return `${url}::${contentHash}`;
  }

  function bodyCacheGet(url, paragraphTexts) {
    const key = getBodyCacheKey(url, paragraphTexts);
    const cached = BODY_CACHE[key];
    if (!cached) return null;

    // Update timestamp for LRU
    cached.t = Date.now();
    bodyCacheDirty = true;
    return cached.simplified;
  }

  function bodyCacheSet(url, paragraphTexts, simplified) {
    const key = getBodyCacheKey(url, paragraphTexts);
    BODY_CACHE[key] = {
      simplified,
      t: Date.now(),
      url,
      count: paragraphTexts.length
    };
    bodyCacheDirty = true;

    const size = Object.keys(BODY_CACHE).length;
    if (size > BODY_CACHE_LIMIT) {
      // Trim cache
      queueMicrotask(() => {
        const keys = Object.keys(BODY_CACHE);
        if (keys.length <= BODY_CACHE_LIMIT) return;
        keys.sort((a,b) => BODY_CACHE[a].t - BODY_CACHE[b].t);
        const toDrop = Math.max(0, keys.length - BODY_CACHE_TRIM_TO);
        for (let i = 0; i < toDrop; i++) delete BODY_CACHE[keys[i]];
        storage.set(BODY_CACHE_KEY, JSON.stringify(BODY_CACHE));
        bodyCacheDirty = false;
        log('body cache trimmed:', keys.length, '→', Object.keys(BODY_CACHE).length);
      });
    } else if (bodyCacheDirty) {
      clearTimeout(bodyCacheSet._t);
      bodyCacheSet._t = setTimeout(() => {
        storage.set(BODY_CACHE_KEY, JSON.stringify(BODY_CACHE));
        bodyCacheDirty = false;
      }, 500);
    }
  }

  async function bodyCacheClear() {
    BODY_CACHE = {};
    await storage.set(BODY_CACHE_KEY, JSON.stringify(BODY_CACHE));
    log('body cache cleared');
  }

  // ───────────────────────── API TOKEN TRACKING ─────────────────────────
  function updateApiTokens(type, usage) {
    if (!usage) return;

    // OpenAI API uses 'input_tokens' and 'output_tokens' (not prompt_tokens/completion_tokens)
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
      storage.set(API_TOKENS_KEY, JSON.stringify(API_TOKENS));
      log('API tokens updated and saved:', API_TOKENS);
    }, 1000);
  }

  async function resetApiTokens() {
    API_TOKENS = {
      headlines: { input: 0, output: 0, calls: 0 },
      body: { input: 0, output: 0, calls: 0 }
    };
    await storage.set(API_TOKENS_KEY, JSON.stringify(API_TOKENS));
    log('API token stats reset');
  }

  function calculateApiCost() {
    const inputCost = (API_TOKENS.headlines.input + API_TOKENS.body.input) * PRICING.inputPer1M / 1_000_000;
    const outputCost = (API_TOKENS.headlines.output + API_TOKENS.body.output) * PRICING.outputPer1M / 1_000_000;
    return inputCost + outputCost;
  }

  async function updatePricing(newPricing) {
    PRICING = {
      ...PRICING,
      ...newPricing,
      lastUpdated: new Date().toISOString().split('T')[0] // YYYY-MM-DD
    };
    await storage.set(PRICING_KEY, JSON.stringify(PRICING));
    log('Pricing updated:', PRICING);
  }

  async function resetPricingToDefaults() {
    PRICING = {
      model: 'gpt-4o-mini',
      inputPer1M: 0.15,
      outputPer1M: 0.60,
      lastUpdated: '2025-01-25',
      source: 'https://openai.com/api/pricing/'
    };
    await storage.set(PRICING_KEY, JSON.stringify(PRICING));
    log('Pricing reset to defaults');
  }

  // ───────────────────────── DISCOVERY ─────────────────────────
  function getManualMatches(root){
    if (!SELECTORS.length) return [];
    try {
      return [...root.querySelectorAll(compiledSelectors())];
    } catch (e) {
      log('manual selector error:', e.message || e, 'selectors=', SELECTORS);
      return [];
    }
  }

  function discoverCandidates(root){
    if (!CFG.autoDetect) return [];
    const seedSets = [
      root.querySelectorAll('h1, h2, h3, h4, [role="heading"], [aria-level], [itemprop="headline"]'),
      root.querySelectorAll('.lead, .deck, .standfirst, .subhead, .kicker, .teaser, .title, .headline'),
      root.querySelectorAll(`${CARD_SELECTOR} h1, ${CARD_SELECTOR} h2, ${CARD_SELECTOR} h3, ${CARD_SELECTOR} a`)
    ];
    const candEls = [];
    const seen = new Set();
    for (const list of seedSets) {
      for (const el of list) {
        if (!el || seen.has(el) || !isVisible(el) || isExcluded(el)) continue;
        seen.add(el);
        candEls.push(el);
      }
    }

    const scored = [];
    for (const el of candEls) {
      const host = findTextHost(el);
      if (!host || isExcluded(host)) continue;
      const t = normalizeSpace(host.textContent || '');
      if (!withinLen(t)) continue;
      if (isHardRejectText(host, t)) continue;
      const score = computeCandidateScore(host, t);
      if (score >= CFG.scoreThreshold) {
        scored.push({ host, text: t, score, card: host.closest(CARD_SELECTOR) });
      }
    }

    const byCard = new Map();
    for (const row of scored) {
      const key = row.card || document;
      if (!byCard.has(key)) byCard.set(key, []);
      byCard.get(key).push(row);
    }
    const winners = [];
    for (const [, arr] of byCard) {
      arr.sort((a,b) => b.score - a.score);
      winners.push(...arr.slice(0, CFG.topKPerCard));
    }

    const bestByText = new Map();
    for (const w of winners) {
      const k = w.text;
      if (!bestByText.has(k) || w.score > bestByText.get(k).score) bestByText.set(k, w);
    }

    if (CFG.DEBUG_SCORES) {
      const top = [...bestByText.values()].sort((a,b)=>b.score-a.score).slice(0, 20);
      log('top candidates:', top.map(x => ({score:x.score, text:x.text.slice(0,120)})));
    }

    return [...bestByText.values()].map(x => x.host);
  }

  function getCandidateElements(root){
    const manual = getManualMatches(root).map(el => ({el: findTextHost(el), mode: 'manual'}));
    const auto   = discoverCandidates(root).map(el => ({el, mode: 'auto'}));
    const uniq = [];
    const seen = new Set();
    for (const rec of [...manual, ...auto]) {
      const el = rec.el;
      if (!el || isExcluded(el)) continue;
      if (seen.has(el)) continue;
      seen.add(el);
      uniq.push(rec);
    }
    return uniq;
  }

  // ───────────────────────── ATTACH & OBSERVE ─────────────────────────
  function attachTargets(root = document) {
    const hosts = getCandidateElements(root)
      .map(({el,mode}) => ({el: findTextHost(el), mode}))
      .filter(({el}) => el && !seenEl.has(el) && withinLen(textTrim(el)) && !isExcluded(el));

    for (const {el: host, mode} of hosts) {
      const text = textTrim(host);
      host.setAttribute('data-neutralizer-mode', mode);
      let set = textToElements.get(text);
      if (!set) { set = new Set(); textToElements.set(text, set); }
      set.add(host);
      observerObserve(host);
    }
  }

  let IO = null;
  function ensureObserver() {
    if (IO || !CFG.visibleOnly) return;
    IO = new IntersectionObserver(onIntersect, { root: null, rootMargin: CFG.rootMargin, threshold: CFG.threshold });
  }
  function observerObserve(el) { if (CFG.visibleOnly) { ensureObserver(); IO.observe(el); } }

  const pending = new Set();
  let flushTimer = null;

  function onIntersect(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      IO.unobserve(el);
      if (isExcluded(el)) continue;
      const text = textTrim(el);

      const cached = cacheGet(text);
      if (cached) { applyRewrites(buildMap([text]), [text], [cached], 'cache'); continue; }
      if (!pending.has(text)) pending.add(text);
    }
    scheduleFlush();
  }

  function scheduleFlush() { if (!flushTimer) flushTimer = setTimeout(flushPending, CFG.flushDelayMs); }

  function buildMap(texts) {
    const map = new Map();
    for (const t of texts) { const set = textToElements.get(t); if (set && set.size) map.set(t, [...set]); }
    return map;
  }

  function quoteProtect(original, rewritten) {
    const quotes = [];
    const rx = /[“”"«»](.*?)[“”"«»]/g;
    let m;
    while ((m = rx.exec(original)) !== null) {
      quotes.push(m[0]);
    }
    let out = rewritten;
    for (const q of quotes) {
      out = out.replace(/([“”"«»]).*?([“”"«»])/g, q);
    }
    return out;
  }

  function applyRewrites(map, originals, rewrites, source = 'live') {
    let changedBatch = 0;
    const localChanges = [];
    for (let i = 0; i < originals.length; i++) {
      const from = originals[i];
      let to = (rewrites[i] ?? '').trim();
      if (!to || to === from) continue;
      to = quoteProtect(from, to);

      const els = map.get(from) || [];
      let changedCount = 0;

      for (const host of els) {
        if (isExcluded(host) || seenEl.has(host)) continue;
        const before = textTrim(host);
        if (!before) continue;

        if (!host.hasAttribute('data-neutralizer-original')) {
          host.setAttribute('data-neutralizer-original', before);
        }
        if (CFG.showOriginalOnHover && !host.hasAttribute('title')) {
          host.setAttribute('title', before);
        }

        host.textContent = to;
        host.setAttribute('data-neutralizer-changed','1');
        seenEl.add(host);
        changedCount++;
        changedBatch++;

        if (CFG.highlight) {
          host.style.setProperty('--neutralizer-color', CFG.highlightColor);
          host.style.setProperty('--neutralizer-duration', `${CFG.highlightMs}ms`);
          host.classList.add('neutralizer-ai-flash');
          setTimeout(() => host.classList.remove('neutralizer-ai-flash'), CFG.highlightMs + 120);
        }
      }
      if (changedCount) {
        const mode = (els[0]?.getAttribute?.('data-neutralizer-mode')) || 'auto';
        log(`[${source}] (${mode}) "${from}" → "${to}" on ${changedCount} element(s)`);
        localChanges.push({ from, to, count: changedCount, source, mode });
      }
    }
    if (changedBatch) {
      if (source === 'live') STATS.live += changedBatch;
      else if (source === 'cache') STATS.cache += changedBatch;
      STATS.total = STATS.live + STATS.cache;
      CHANGES.push(...localChanges);
      updateBadgeCounts();
    }
    return changedBatch;
  }

  async function flushPending() {
    const toSend = [];
    for (const t of pending) { if (!cacheGet(t)) toSend.push(t); pending.delete(t); if (toSend.length === CFG.maxBatch) break; }
    flushTimer = null;
    if (!toSend.length) return;

    try {
      log('calling OpenAI for visible batch size', toSend.length);
      const rewrites = await rewriteBatch(toSend);
      for (let i = 0; i < toSend.length; i++) cacheSet(toSend[i], rewrites[i] ?? toSend[i]);
      applyRewrites(buildMap(toSend), toSend, rewrites, 'live');
      STATS.batches++;
      log(`[stats] batches=${STATS.batches} total=${STATS.total} (live=${STATS.live}, cache=${STATS.cache})`);
    } catch (e) {
      console.error('error:', e);
      friendlyApiError(e);
    }
    if (pending.size) scheduleFlush();
  }

  // ───────────────────────── OPENAI ─────────────────────────
  function apiHeaders(key) {
    return {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  function xhrPost(url, data, headers = {}) {
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
        ontimeout: () => { const err = new Error('Request timeout'); err.status = 0; },
      });
    });
  }

  function xhrGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const api = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : GM_xmlHttpRequest;
      api({
        method: 'GET',
        url,
        headers,
        onload: (r) => (r.status >= 200 && r.status < 300) ? resolve(r.responseText) : reject(Object.assign(new Error(`HTTP ${r.status}`),{status:r.status,body:r.responseText})),
        onerror: (e) => reject(Object.assign(new Error((e && e.error) || 'Network error'),{status:0})),
        timeout: 20000,
        ontimeout: () => reject(Object.assign(new Error('Request timeout'),{status:0})),
      });
    });
  }

  function extractOutputText(data) {
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
    if (Array.isArray(data.choices)) return data.choices.map((ch)=>ch.message?.content||'').join('\n');
    return '';
  }

  async function rewriteBatch(texts) {
    const KEY = await storage.get('OPENAI_KEY', '');
    if (!KEY) { openKeyDialog('OpenAI API key missing.'); throw Object.assign(new Error('API key missing'), {status:401}); }

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

    // Track token usage for headlines
    if (payload.usage) {
      updateApiTokens('headlines', payload.usage);
    }

    const outStr = extractOutputText(payload);
    if (!outStr) throw Object.assign(new Error('No output_text/content from API'), {status:400});
    const cleaned = outStr.replace(/^```json\s*|\s*```$/g, '');
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) throw Object.assign(new Error('API did not return a JSON array'), {status:400});
    return arr;
  }

  function friendlyApiError(err) {
    const s = err?.status || 0;
    if (s === 401) { openKeyDialog('Unauthorized (401). Please enter a valid OpenAI key.'); return; }
    if (s === 429) { openInfo('Rate limited by API (429). Try again in a minute. You can also lower maxBatch or enable visible-only to reduce burst.'); return; }
    if (s === 400) { openInfo('Bad request (400). The page may contain text the API could not parse. Try again, or disable auto-detect for this site and use narrower selectors.'); return; }
    openInfo(`Unknown error${s ? ' ('+s+')' : ''}. Check your network or try again.`);
  }

  // ───────────────────────── BODY SIMPLIFICATION ─────────────────────────
  let articleBodyParagraphs = null;
  let bodySimplified = false;

  function isArticlePage() {
    // Check for strong article indicators first (high confidence)
    const strongArticleSelectors = [
      '[itemprop="articleBody"]',
      '.article-body',
      '.post-content',
      '.entry-content',
      '[class*="article-content"]',
      '[class*="post-body"]'
    ];

    for (const selector of strongArticleSelectors) {
      if (document.querySelector(selector)) return true;
    }

    // Exclude homepage/listing pages
    const path = location.pathname;
    const isHomepage = path === '/' || path === '' || path === '/index.html' || path === '/index.php';

    if (isHomepage) {
      return false;
    }

    // Check for listing-specific classes
    const listingIndicators = [
      '.post-list', '.article-list', '.news-list',
      '.category-list', '.archive-list'
    ];
    for (const selector of listingIndicators) {
      if (document.querySelector(selector)) return false;
    }

    // Check for article element with semantic markup
    const articles = document.querySelectorAll('article');
    if (articles.length === 1) {
      const article = articles[0];
      if (article.getAttribute('role') === 'article' ||
          article.getAttribute('itemtype')?.includes('Article')) {
        return true;
      }
    }

    // URL pattern suggests article (has numbers suggesting specific content)
    const hasArticleUrlPattern = /\/\d{4,}\/|\/\d{4}-\d{2}-\d{2}\//.test(path);

    // Check for long-form content
    const mainContent = document.querySelector('article, main, [role="main"]');
    if (mainContent) {
      const paragraphs = mainContent.querySelectorAll('p');
      let substantialParagraphs = 0;
      for (const p of paragraphs) {
        if (p.textContent.trim().length > 100) substantialParagraphs++;
        if (substantialParagraphs >= 4) return true;
      }
    }

    // If URL pattern suggests article, require more evidence
    if (hasArticleUrlPattern) {
      const allParagraphs = document.querySelectorAll('article p, main p, [role="main"] p');
      let totalLength = 0;
      for (const p of allParagraphs) {
        totalLength += p.textContent.trim().length;
        if (totalLength > 800) return true;
      }
    }

    return false;
  }

  function extractArticleBody() {
    // Try multiple strategies to find article body paragraphs
    const strategies = [
      // Strategy 1: Look for semantic article body markers
      () => document.querySelector('[itemprop="articleBody"]'),
      () => document.querySelector('article[itemtype*="Article"]'),
      () => document.querySelector('.article-body'),
      () => document.querySelector('.post-content'),
      () => document.querySelector('.entry-content'),
      () => document.querySelector('[class*="article-content"]'),
      () => document.querySelector('[class*="post-body"]'),
      // Strategy 2: Look for article or main tags
      () => document.querySelector('article'),
      () => document.querySelector('main'),
      () => document.querySelector('[role="main"]')
    ];

    let container = null;
    for (const strategy of strategies) {
      container = strategy();
      if (container) break;
    }

    if (!container) return [];

    // Extract paragraphs, excluding UI elements
    const paragraphs = Array.from(container.querySelectorAll('p'));
    return paragraphs.filter(p => {
      // Filter out short paragraphs (likely UI text)
      if (p.textContent.trim().length < 50) return false;

      // Filter out paragraphs that are inside excluded containers
      if (p.closest('[data-neutralizer-ui]')) return false;
      if (p.closest('.comment, .comments, .sidebar, .navigation, .menu, .footer, .header')) return false;

      // Filter out paragraphs with attributes suggesting they're UI elements
      if (p.hasAttribute(UI_ATTR)) return false;

      return true;
    });
  }

  async function simplifyBodyText(paragraphs) {
    const KEY = await storage.get('OPENAI_KEY', '');
    if (!KEY) { openKeyDialog('OpenAI API key missing.'); throw Object.assign(new Error('API key missing'), {status:401}); }

    const texts = paragraphs.map(p => p.textContent.trim());
    const safeInputs = texts.map(t => t.replace(/[\u2028\u2029]/g, ' '));

    const instructions =
      'You will receive INPUT as a JSON array of article paragraphs.' +
      ' Simplify each paragraph by removing convoluted phrasing, excessive jargon, and overly complex or epistemic language.' +
      ' Make the language clearer and more direct while staying in the SAME language as input.' +
      ' CRITICAL: Do NOT change facts, numbers, names, quotes, or the actual meaning/details of the content.' +
      ' If a paragraph contains a direct quote inside quotation marks (English "…", Greek «…», etc.), keep that quoted text VERBATIM word-for-word.' +
      ' Only simplify the wording and sentence structure to make it easier to read.' +
      ' Preserve all factual information, statistics, proper nouns, and direct quotes exactly as they appear.' +
      ' Return ONLY a JSON array of simplified strings, same order and count as input.';

    const body = JSON.stringify({
      model: CFG.model,
      temperature: SIMPLIFICATION_TEMPERATURE,
      max_output_tokens: 4000,
      instructions,
      input: JSON.stringify(safeInputs)
    });

    const resText = await xhrPost('https://api.openai.com/v1/responses', body, apiHeaders(KEY));
    const payload = JSON.parse(resText);

    // Track token usage for body simplification
    if (payload.usage) {
      updateApiTokens('body', payload.usage);
    }

    const outStr = extractOutputText(payload);
    if (!outStr) throw Object.assign(new Error('No output_text/content from API'), {status:400});
    const cleaned = outStr.replace(/^```json\s*|\s*```$/g, '');
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) throw Object.assign(new Error('API did not return a JSON array'), {status:400});
    return arr;
  }

  async function applyBodySimplification(forceApply = false) {
    if (!forceApply && !SIMPLIFY_BODY) return;
    if (bodySimplified) return; // Already simplified
    if (!isArticlePage()) {
      log('Not an article page, skipping body simplification');
      return;
    }

    try {
      const paragraphs = extractArticleBody();
      if (!paragraphs.length) {
        log('No article body paragraphs found');
        return;
      }

      log(`Found ${paragraphs.length} article body paragraphs to simplify`);

      // Store original text
      articleBodyParagraphs = paragraphs;

      // Mark originals before simplifying
      paragraphs.forEach(p => {
        if (!p.hasAttribute('data-neutralizer-body-original')) {
          p.setAttribute('data-neutralizer-body-original', p.textContent);
        }
      });

      const paragraphTexts = paragraphs.map(p => p.textContent.trim());
      const url = location.href;

      // Check cache first
      const cached = bodyCacheGet(url, paragraphTexts);
      if (cached && cached.length === paragraphs.length) {
        log(`Using cached simplification for ${paragraphs.length} paragraphs`);
        paragraphs.forEach((p, idx) => {
          if (cached[idx]) {
            p.textContent = cached[idx];
            p.setAttribute('data-neutralizer-body-simplified', '1');
          }
        });
        bodySimplified = true;
        syncBodyBadgeState();
        log('Body simplification complete (from cache)');
        return;
      }

      // Not in cache - simplify via API in parallel batches
      const batchSize = 10;
      const maxConcurrent = 5;
      const allSimplified = [];

      // Create all batches
      const batches = [];
      for (let i = 0; i < paragraphs.length; i += batchSize) {
        batches.push({
          paragraphs: paragraphs.slice(i, i + batchSize),
          startIdx: i
        });
      }

      log(`Processing ${batches.length} batches with max ${maxConcurrent} concurrent requests`);

      // Update badge to show progress
      const updateProgressBadge = (current, total) => {
        const btn = badge?.querySelector('.body-action');
        if (btn) {
          btn.textContent = `B: simplifying ${current}/${total}...`;
        }
      };

      // Process batches in chunks of maxConcurrent
      for (let i = 0; i < batches.length; i += maxConcurrent) {
        const chunk = batches.slice(i, i + maxConcurrent);
        const currentChunk = Math.floor(i / maxConcurrent) + 1;
        const totalChunks = Math.ceil(batches.length / maxConcurrent);

        updateProgressBadge(currentChunk, totalChunks);

        const chunkPromises = chunk.map(batch =>
          simplifyBodyText(batch.paragraphs).then(simplified => ({
            simplified,
            batch
          }))
        );

        // Wait for all batches in this chunk to complete
        const results = await Promise.all(chunkPromises);

        // Apply results to DOM in order
        results.forEach(({ simplified, batch }) => {
          allSimplified.push(...simplified);
          batch.paragraphs.forEach((p, idx) => {
            if (simplified[idx]) {
              p.textContent = simplified[idx];
              p.setAttribute('data-neutralizer-body-simplified', '1');
            }
          });
        });

        log(`Completed chunk ${currentChunk}/${totalChunks} (${chunk.length} batches)`);
      }

      // Store in cache
      bodyCacheSet(url, paragraphTexts, allSimplified);

      bodySimplified = true;
      syncBodyBadgeState();
      log('Body simplification complete (via API, cached)');
    } catch (err) {
      log('Body simplification error:', err);
      friendlyApiError(err);
      syncBodyBadgeState(); // Reset badge state on error
    }
  }

  function restoreBodyOriginals() {
    if (!bodySimplified) return;

    const paragraphs = document.querySelectorAll('[data-neutralizer-body-simplified="1"][data-neutralizer-body-original]');
    let n = 0;
    paragraphs.forEach(p => {
      const orig = p.getAttribute('data-neutralizer-body-original');
      if (typeof orig === 'string') {
        p.textContent = orig;
        n++;
      }
    });

    bodySimplified = false;
    log('Restored original body text on', n, 'paragraphs');
  }

  function reapplyBodySimplification() {
    if (!articleBodyParagraphs) return;

    // Try to get from cache
    const paragraphTexts = articleBodyParagraphs.map(p => p.getAttribute('data-neutralizer-body-original') || p.textContent.trim());
    const url = location.href;
    const cached = bodyCacheGet(url, paragraphTexts);

    if (cached && cached.length === articleBodyParagraphs.length) {
      log('Reapplying body simplification from cache');
      articleBodyParagraphs.forEach((p, idx) => {
        if (cached[idx]) {
          p.textContent = cached[idx];
          p.setAttribute('data-neutralizer-body-simplified', '1');
        }
      });
      bodySimplified = true;
      syncBodyBadgeState();
    } else {
      // Not in cache, need to re-simplify
      log('Cache miss, re-simplifying body text');
      bodySimplified = false;
      applyBodySimplification(true);
    }
  }

  // ───────────────────────── POLYMORPHIC EDITOR (list/secret/domain) ─────────────────────────
  function parseLines(s) { return s.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean); }

  function openEditor({ title, hint = 'One item per line', mode = 'list', initial = [], globalItems = [], onSave, onValidate }) {
    const host = document.createElement('div'); host.setAttribute(UI_ATTR, '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .wrap{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);
            display:flex;align-items:center;justify-content:center}
      .modal{background:#fff;max-width:680px;width:92%;border-radius:10px;
             box-shadow:0 10px 40px rgba(0,0,0,.35);padding:16px 16px 12px;box-sizing:border-box}
      .modal h3{margin:0 0 8px;font:600 16px/1.2 system-ui,sans-serif}
      .section-label{font:600 13px/1.2 system-ui,sans-serif;margin:8px 0 4px;color:#444}
      textarea{width:100%;height:220px;resize:vertical;padding:10px;box-sizing:border-box;
               font:13px/1.4 ui-monospace,Consolas,monospace;border:1px solid #ccc;border-radius:4px}
      textarea.readonly{background:#f5f5f5;color:#666;height:120px}
      textarea.editable{height:180px}
      .row{display:flex;gap:8px;align-items:center}
      input[type=password],input[type=text]{flex:1;padding:10px;border-radius:8px;border:1px solid #ccc;
               font:14px/1.3 ui-monospace,Consolas,monospace;box-sizing:border-box}
      .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
      .actions button{padding:8px 12px;border-radius:8px;border:1px solid #d0d0d0;background:#f6f6f6;cursor:pointer}
      .actions .save{background:#1a73e8;color:#fff;border-color:#1a73e8}
      .actions .test{background:#34a853;color:#fff;border-color:#34a853}
      .hint{margin:8px 0 0;color:#666;font:12px/1.2 system-ui,sans-serif}
    `;
    const wrap = document.createElement('div'); wrap.className = 'wrap';
    const bodyList = `<textarea spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off">${
      Array.isArray(initial) ? initial.join('\n') : ''
    }</textarea>`;
    const bodyDomain = `
      <div class="section-label">Global settings (read-only):</div>
      <textarea class="readonly" readonly spellcheck="false">${Array.isArray(globalItems) ? globalItems.join('\n') : ''}</textarea>
      <div class="section-label">Domain-specific additions (editable):</div>
      <textarea class="editable" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off">${Array.isArray(initial) ? initial.join('\n') : ''}</textarea>
    `;
    const bodySecret = `
      <div class="row">
        <input id="sec" type="password" placeholder="sk-..." autocomplete="off" />
        <button id="toggle" title="Show/Hide">👁</button>
      </div>`;
    const bodyInfo = `<textarea class="readonly" readonly spellcheck="false" style="height:auto;min-height:60px;max-height:300px;">${
      Array.isArray(initial) ? initial.join('\n') : String(initial)
    }</textarea>`;

    let bodyContent, actionsContent;
    if (mode === 'info') {
      bodyContent = bodyInfo;
      actionsContent = '<button class="cancel">Close</button>';
    } else if (mode === 'secret') {
      bodyContent = bodySecret;
      actionsContent = (onValidate ? '<button class="test">Validate</button>' : '') + '<button class="save">Save</button><button class="cancel">Cancel</button>';
    } else if (mode === 'domain') {
      bodyContent = bodyDomain;
      actionsContent = '<button class="save">Save</button><button class="cancel">Cancel</button>';
    } else {
      bodyContent = bodyList;
      actionsContent = '<button class="save">Save</button><button class="cancel">Cancel</button>';
    }

    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
        <h3>${title}</h3>
        ${bodyContent}
        <div class="actions">
          ${actionsContent}
        </div>
        <p class="hint">${hint}</p>
      </div>`;
    shadow.append(style, wrap);
    document.body.appendChild(host);
    const close = () => host.remove();

    if (mode === 'info') {
      const btnClose = shadow.querySelector('.cancel');
      btnClose.addEventListener('click', close);
      wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
      shadow.addEventListener('keydown', e => {
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); }
      });
    } else if (mode === 'secret') {
      const inp = shadow.querySelector('#sec');
      const btnSave = shadow.querySelector('.save');
      const btnCancel = shadow.querySelector('.cancel');
      const btnToggle = shadow.querySelector('#toggle');
      const btnTest = shadow.querySelector('.test');
      if (typeof initial === 'string' && initial) inp.value = initial;
      btnToggle.addEventListener('click', () => { inp.type = (inp.type === 'password') ? 'text' : 'password'; inp.focus(); });
      btnSave.addEventListener('click', async () => {
        const v = inp.value.trim();
        if (!v) return;
        await onSave?.(v);
        btnSave.textContent = 'Saved';
        btnSave.style.background = '#34a853';
        btnSave.style.borderColor = '#34a853';
        setTimeout(close, 1000);
      });
      btnCancel.addEventListener('click', close);
      btnTest?.addEventListener('click', async () => { await onValidate?.(inp.value.trim()); });
      wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
      shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); btnSave.click(); } });
      inp.focus();
    } else if (mode === 'domain') {
      const ta = shadow.querySelector('textarea.editable');
      const btnSave = shadow.querySelector('.save');
      const btnCancel = shadow.querySelector('.cancel');
      btnSave.addEventListener('click', async () => { const lines = parseLines(ta.value); await onSave?.(lines); close(); });
      btnCancel.addEventListener('click', close);
      wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
      shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); btnSave.click(); } });
      ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length;
    } else {
      const ta = shadow.querySelector('textarea');
      const btnSave = shadow.querySelector('.save');
      const btnCancel = shadow.querySelector('.cancel');
      btnSave.addEventListener('click', async () => { const lines = parseLines(ta.value); await onSave?.(lines); close(); });
      btnCancel.addEventListener('click', close);
      wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
      shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); btnSave.click(); } });
      ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length;
    }
  }

  function openInfo(message) {
    openEditor({ title: 'Neutralizer', mode: 'info', initial: message, hint: 'Press Enter or Escape to close.' });
  }

  function openKeyDialog(extra) {
    if (apiKeyDialogShown) {
      log('API key dialog already shown, not showing again');
      return;
    }
    apiKeyDialogShown = true;

    openEditor({
      title: 'OpenAI API key',
      mode: 'secret',
      initial: '',
      hint: 'Stored locally (GM → localStorage → memory). Validate sends GET /v1/models.',
      onSave: async (val) => {
        const ok = await storage.set('OPENAI_KEY', val);
        const verify = await storage.get('OPENAI_KEY', '');
        log('API key saved:', ok, verify ? `••••${verify.slice(-4)}` : '(empty)');
        apiKeyDialogShown = false; // Reset so it can be shown again if needed
      },
      onValidate: async (val) => {
        const key = val || await storage.get('OPENAI_KEY', '');
        if (!key) { openInfo('No key to test'); return; }
        try { await xhrGet('https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` }); log('key validation: OK'); openInfo('Validation OK (HTTP 200)'); }
        catch (e) { log('key validation error:', e.message || e); openInfo(`Validation failed: ${e.message || e}`); }
      }
    });
  }

  function openWelcomeDialog() {
    const host = document.createElement('div'); host.setAttribute(UI_ATTR, '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .wrap{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);
            display:flex;align-items:center;justify-content:center}
      .modal{background:#fff;max-width:580px;width:94%;border-radius:12px;
             box-shadow:0 10px 40px rgba(0,0,0,.4);padding:24px;box-sizing:border-box}
      .modal h2{margin:0 0 16px;font:700 20px/1.3 system-ui,sans-serif;color:#1a1a1a}
      .modal p{margin:0 0 12px;font:14px/1.6 system-ui,sans-serif;color:#444}
      .modal .steps{background:#f8f9fa;padding:16px;border-radius:8px;margin:16px 0;
                     font:13px/1.5 system-ui,sans-serif}
      .modal .steps ol{margin:8px 0 0;padding-left:20px}
      .modal .steps li{margin:6px 0}
      .modal .steps a{color:#1a73e8;text-decoration:none}
      .modal .steps a:hover{text-decoration:underline}
      .actions{display:flex;gap:12px;justify-content:flex-end;margin-top:20px}
      .btn{padding:10px 20px;border-radius:8px;border:none;font:600 14px system-ui,sans-serif;
           cursor:pointer;transition:all 0.15s ease}
      .btn.primary{background:#1a73e8;color:#fff}
      .btn.primary:hover{background:#1557b0}
      .btn.secondary{background:#e8eaed;color:#1a1a1a}
      .btn.secondary:hover{background:#dadce0}
    `;
    const wrap = document.createElement('div'); wrap.className = 'wrap';

    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="Welcome">
        <h2>Welcome to Neutralize Headlines!</h2>
        <p>This userscript helps you browse the web with calmer, more informative headlines by neutralizing sensationalist language.</p>
        <p>To get started, you'll need an OpenAI API key:</p>
        <div class="steps">
          <ol>
            <li>Visit <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI API Keys</a></li>
            <li>Sign in or create an account</li>
            <li>Click "Create new secret key"</li>
            <li>Copy the key and paste it in the next dialog</li>
          </ol>
        </div>
        <p style="font-size:13px;color:#666;margin-top:16px"><strong>Domain control:</strong> By default, all websites are disabled. After setup, you can enable websites one by one via the menu, or toggle to "All domains with Denylist" mode to enable everywhere.</p>
        <p style="font-size:13px;color:#666">The script uses gpt-4o-mini (cost-effective). Your key is stored locally and never shared.</p>
        <div class="actions">
          <button class="btn secondary cancel">Maybe Later</button>
          <button class="btn primary continue">Set Up API Key</button>
        </div>
      </div>`;

    shadow.append(style, wrap);
    document.body.appendChild(host);

    const btnContinue = shadow.querySelector('.continue');
    const btnCancel = shadow.querySelector('.cancel');

    btnContinue.addEventListener('click', async () => {
      host.remove();
      // Open the API key editor
      openEditor({
        title: 'OpenAI API key',
        mode: 'secret',
        initial: '',
        hint: 'Paste your API key here. Click Validate to test it, then Save.',
        onSave: async (val) => {
          await storage.set('OPENAI_KEY', val);
          // Switch to deny mode (enable everywhere) now that we have a key
          await storage.set(DOMAINS_MODE_KEY, 'deny');
          await storage.set(FIRST_INSTALL_KEY, 'true');
          openInfo('API key saved! The script will now work on all websites. Reload any page to see it in action.');
        },
        onValidate: async (val) => {
          const key = val || await storage.get('OPENAI_KEY', '');
          if (!key) { openInfo('Please enter your API key first'); return; }
          try {
            await xhrGet('https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` });
            openInfo('Validation OK! Click Save to continue.');
          }
          catch (e) { openInfo(`Validation failed: ${e.message || e}`); }
        }
      });
    });

    btnCancel.addEventListener('click', async () => {
      host.remove();
      await storage.set(FIRST_INSTALL_KEY, 'true');
      openInfo('You can set up your API key anytime via the userscript menu:\n"Set / Validate OpenAI API key"');
    });

    wrap.addEventListener('click', (e) => { if (e.target === wrap) btnCancel.click(); });
    shadow.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); btnCancel.click(); } });
  }

  function openTemperatureDialog() {
    const host = document.createElement('div'); host.setAttribute(UI_ATTR, '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .wrap{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);
            display:flex;align-items:center;justify-content:center}
      .modal{background:#fff;max-width:520px;width:92%;border-radius:10px;
             box-shadow:0 10px 40px rgba(0,0,0,.35);padding:20px;box-sizing:border-box}
      .modal h3{margin:0 0 16px;font:600 16px/1.2 system-ui,sans-serif}
      .options{display:flex;flex-direction:column;gap:10px}
      .option-btn{padding:14px 16px;border-radius:8px;border:2px solid #d0d0d0;background:#fff;
                  cursor:pointer;text-align:left;font:14px/1.4 system-ui,sans-serif;
                  transition:all 0.15s ease;display:flex;justify-content:space-between;align-items:center}
      .option-btn:hover{background:#f8f9fa;border-color:#1a73e8}
      .option-btn.selected{background:#e8f0fe;border-color:#1a73e8;font-weight:600}
      .option-btn .label{flex:1}
      .option-btn .value{color:#666;font-size:12px;margin-left:8px}
      .option-btn .checkmark{color:#1a73e8;margin-left:8px;font-weight:bold}
      .hint{margin:16px 0 0;color:#666;font:12px/1.4 system-ui,sans-serif;text-align:center}
    `;
    const wrap = document.createElement('div'); wrap.className = 'wrap';

    const optionsHTML = TEMPERATURE_ORDER.map(level => {
      const isSelected = level === TEMPERATURE_LEVEL;
      const value = TEMPERATURE_LEVELS[level];
      return `<button class="option-btn ${isSelected ? 'selected' : ''}" data-level="${level}">
        <span class="label">${level}</span>
        <span class="value">${value}</span>
        ${isSelected ? '<span class="checkmark">✓</span>' : ''}
      </button>`;
    }).join('');

    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="Neutralization Strength">
        <h3>Neutralization Strength</h3>
        <div class="options">
          ${optionsHTML}
        </div>
        <p class="hint">Select how aggressively to neutralize headlines. Lower values preserve more of the original meaning.</p>
      </div>`;

    shadow.append(style, wrap);
    document.body.appendChild(host);
    const close = () => host.remove();

    // Add click handlers to all option buttons
    shadow.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const level = btn.getAttribute('data-level');
        await setTemperature(level);
      });
    });

    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  }

  function openSimplificationStrengthDialog() {
    const host = document.createElement('div'); host.setAttribute(UI_ATTR, '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .wrap{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);
            display:flex;align-items:center;justify-content:center}
      .modal{background:#fff;max-width:520px;width:92%;border-radius:10px;
             box-shadow:0 10px 40px rgba(0,0,0,.35);padding:20px;box-sizing:border-box}
      .modal h3{margin:0 0 16px;font:600 16px/1.2 system-ui,sans-serif}
      .options{display:flex;flex-direction:column;gap:10px}
      .option-btn{padding:14px 16px;border-radius:8px;border:2px solid #d0d0d0;background:#fff;
                  cursor:pointer;text-align:left;font:14px/1.4 system-ui,sans-serif;
                  transition:all 0.15s ease;display:flex;justify-content:space-between;align-items:center}
      .option-btn:hover{background:#f8f9fa;border-color:#1a73e8}
      .option-btn.selected{background:#e8f0fe;border-color:#1a73e8;font-weight:600}
      .option-btn .label{flex:1}
      .option-btn .value{color:#666;font-size:12px;margin-left:8px}
      .option-btn .checkmark{color:#1a73e8;margin-left:8px;font-weight:bold}
      .hint{margin:16px 0 0;color:#666;font:12px/1.4 system-ui,sans-serif;text-align:center}
    `;
    const wrap = document.createElement('div'); wrap.className = 'wrap';

    const optionsHTML = SIMPLIFICATION_ORDER.map(level => {
      const isSelected = level === SIMPLIFICATION_LEVEL;
      const value = SIMPLIFICATION_LEVELS[level];
      return `<button class="option-btn ${isSelected ? 'selected' : ''}" data-level="${level}">
        <span class="label">${level}</span>
        <span class="value">${value}</span>
        ${isSelected ? '<span class="checkmark">✓</span>' : ''}
      </button>`;
    }).join('');

    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="Simplification Strength">
        <h3>Simplification Strength</h3>
        <div class="options">
          ${optionsHTML}
        </div>
        <p class="hint">Select how aggressively to simplify article body text. Lower values preserve more of the original style.</p>
      </div>`;

    shadow.append(style, wrap);
    document.body.appendChild(host);
    const close = () => host.remove();

    // Add click handlers to all option buttons
    shadow.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const level = btn.getAttribute('data-level');
        await setSimplificationStrength(level);
      });
    });

    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  }

  function openPricingDialog() {
    const host = document.createElement('div'); host.setAttribute(UI_ATTR, '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .wrap{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);
            display:flex;align-items:center;justify-content:center}
      .modal{background:#fff;max-width:520px;width:92%;border-radius:10px;
             box-shadow:0 10px 40px rgba(0,0,0,.35);padding:20px;box-sizing:border-box}
      .modal h3{margin:0 0 16px;font:600 16px/1.2 system-ui,sans-serif}
      .modal p{margin:0 0 12px;font:13px/1.5 system-ui,sans-serif;color:#666}
      .modal .info{background:#f8f9fa;padding:12px;border-radius:6px;margin:12px 0;font-size:12px;color:#444}
      .modal .info a{color:#1a73e8;text-decoration:none}
      .modal .info a:hover{text-decoration:underline}
      .form-group{margin:16px 0}
      .form-group label{display:block;margin-bottom:6px;font:600 13px system-ui,sans-serif;color:#333}
      .form-group input{width:100%;padding:10px;border:2px solid #d0d0d0;border-radius:6px;
                        font:14px system-ui,sans-serif;box-sizing:border-box}
      .form-group input:focus{outline:none;border-color:#1a73e8}
      .form-group .hint{margin-top:4px;font-size:11px;color:#666}
      .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}
      .btn{padding:10px 16px;border-radius:6px;border:none;font:600 13px system-ui,sans-serif;
           cursor:pointer;transition:all 0.15s ease}
      .btn.primary{background:#1a73e8;color:#fff}
      .btn.primary:hover{background:#1557b0}
      .btn.secondary{background:#e8eaed;color:#1a1a1a}
      .btn.secondary:hover{background:#dadce0}
      .btn:disabled{opacity:0.5;cursor:not-allowed}
    `;
    const wrap = document.createElement('div'); wrap.className = 'wrap';

    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="API Pricing Configuration">
        <h3>API Pricing Configuration</h3>
        <p>Update pricing if OpenAI changes their rates. Current model: ${PRICING.model}</p>
        <div class="info">
          Last updated: ${PRICING.lastUpdated}<br>
          Source: <a href="${PRICING.source}" target="_blank">OpenAI Pricing Page</a>
        </div>
        <div class="form-group">
          <label for="inputPrice">Input tokens (per 1M tokens)</label>
          <input type="number" id="inputPrice" step="0.01" min="0" value="${PRICING.inputPer1M}">
          <div class="hint">USD per 1 million input tokens</div>
        </div>
        <div class="form-group">
          <label for="outputPrice">Output tokens (per 1M tokens)</label>
          <input type="number" id="outputPrice" step="0.01" min="0" value="${PRICING.outputPer1M}">
          <div class="hint">USD per 1 million output tokens</div>
        </div>
        <div class="actions">
          <button class="btn secondary reset">Reset to Defaults</button>
          <button class="btn secondary cancel">Cancel</button>
          <button class="btn primary save">Save</button>
        </div>
      </div>`;

    shadow.append(style, wrap);
    document.body.appendChild(host);
    const close = () => host.remove();

    const inputEl = shadow.querySelector('#inputPrice');
    const outputEl = shadow.querySelector('#outputPrice');
    const btnSave = shadow.querySelector('.save');
    const btnCancel = shadow.querySelector('.cancel');
    const btnReset = shadow.querySelector('.reset');

    btnSave.addEventListener('click', async () => {
      const inputPrice = parseFloat(inputEl.value);
      const outputPrice = parseFloat(outputEl.value);

      if (isNaN(inputPrice) || inputPrice < 0 || isNaN(outputPrice) || outputPrice < 0) {
        alert('Please enter valid positive numbers');
        return;
      }

      await updatePricing({
        inputPer1M: inputPrice,
        outputPer1M: outputPrice
      });

      openInfo(`Pricing updated!\nInput: $${inputPrice}/1M tokens\nOutput: $${outputPrice}/1M tokens`);
      close();
    });

    btnReset.addEventListener('click', async () => {
      if (confirm('Reset pricing to gpt-4o-mini defaults ($0.15 input, $0.60 output per 1M tokens)?')) {
        await resetPricingToDefaults();
        openInfo('Pricing reset to defaults (gpt-4o-mini: $0.15 input, $0.60 output per 1M tokens)');
        close();
      }
    });

    btnCancel.addEventListener('click', close);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  }

  // ───────────────────────── MENUS ─────────────────────────
  // Configuration
  GM_registerMenuCommand?.('--- Configuration ---', () => {});
  GM_registerMenuCommand?.('Set / Validate OpenAI API key', async () => {
    const current = await storage.get('OPENAI_KEY', '');
    openEditor({
      title: 'OpenAI API key',
      mode: 'secret',
      initial: current,
      hint: 'Stored locally (GM → localStorage → memory). Validate sends GET /v1/models.',
      onSave: async (val) => { await storage.set('OPENAI_KEY', val); },
      onValidate: async (val) => {
        const key = val || await storage.get('OPENAI_KEY', '');
        if (!key) { openInfo('No key to test'); return; }
        try { await xhrGet('https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` }); openInfo('Validation OK (HTTP 200)'); }
        catch (e) { openInfo(`Validation failed: ${e.message || e}`); }
      }
    });
  });
  GM_registerMenuCommand?.('Configure API pricing', openPricingDialog);

  // Global settings
  GM_registerMenuCommand?.('Edit GLOBAL target selectors', () => {
    openEditor({
      title: 'Global target selectors (all domains)',
      mode: 'list',
      initial: SELECTORS_GLOBAL,
      hint: 'One CSS selector per line (e.g., h1, h2, h3, .lead). Applied to all domains.',
      onSave: async (lines) => {
        const clean = lines.filter(Boolean).map(s => s.trim()).filter(Boolean);
        SELECTORS_GLOBAL = clean.length ? clean : DEFAULT_SELECTORS.slice();
        await storage.set(SELECTORS_KEY, JSON.stringify(SELECTORS_GLOBAL));
        location.reload();
      }
    });
  });

  GM_registerMenuCommand?.('Edit GLOBAL excludes: elements (self)', () => {
    openEditor({
      title: 'Global excluded elements (all domains)',
      mode: 'list',
      initial: EXCLUDE_GLOBAL.self || [],
      hint: 'One CSS selector per line (e.g., .sponsored, .ad-title). Applied to all domains.',
      onSave: async (lines) => {
        EXCLUDE_GLOBAL.self = lines;
        await storage.set(EXCLUDES_KEY, JSON.stringify(EXCLUDE_GLOBAL));
        location.reload();
      }
    });
  });

  GM_registerMenuCommand?.('Edit GLOBAL excludes: containers (ancestors)', () => {
    openEditor({
      title: 'Global excluded containers (all domains)',
      mode: 'list',
      initial: EXCLUDE_GLOBAL.ancestors || [],
      hint: 'One per line (e.g., header, footer, nav, aside). Applied to all domains.',
      onSave: async (lines) => {
        EXCLUDE_GLOBAL.ancestors = lines;
        await storage.set(EXCLUDES_KEY, JSON.stringify(EXCLUDE_GLOBAL));
        location.reload();
      }
    });
  });

  // Domain-specific settings (additions)
  GM_registerMenuCommand?.(`Edit DOMAIN additions: target selectors (${HOST})`, () => {
    openEditor({
      title: `Domain-specific target selectors for ${HOST}`,
      mode: 'domain',
      initial: SELECTORS_DOMAIN,
      globalItems: SELECTORS_GLOBAL,
      hint: 'Domain-specific selectors are added to global ones. Edit only the bottom section.',
      onSave: async (lines) => {
        DOMAIN_SELECTORS[HOST] = lines;
        await storage.set(DOMAIN_SELECTORS_KEY, JSON.stringify(DOMAIN_SELECTORS));
        location.reload();
      }
    });
  });

  GM_registerMenuCommand?.(`Edit DOMAIN additions: excludes elements (${HOST})`, () => {
    openEditor({
      title: `Domain-specific excluded elements for ${HOST}`,
      mode: 'domain',
      initial: EXCLUDE_DOMAIN.self || [],
      globalItems: EXCLUDE_GLOBAL.self || [],
      hint: 'Domain-specific excludes are added to global ones. Edit only the bottom section.',
      onSave: async (lines) => {
        if (!DOMAIN_EXCLUDES[HOST]) DOMAIN_EXCLUDES[HOST] = { self: [], ancestors: [] };
        DOMAIN_EXCLUDES[HOST].self = lines;
        await storage.set(DOMAIN_EXCLUDES_KEY, JSON.stringify(DOMAIN_EXCLUDES));
        location.reload();
      }
    });
  });

  GM_registerMenuCommand?.(`Edit DOMAIN additions: excludes containers (${HOST})`, () => {
    openEditor({
      title: `Domain-specific excluded containers for ${HOST}`,
      mode: 'domain',
      initial: EXCLUDE_DOMAIN.ancestors || [],
      globalItems: EXCLUDE_GLOBAL.ancestors || [],
      hint: 'Domain-specific excludes are added to global ones. Edit only the bottom section.',
      onSave: async (lines) => {
        if (!DOMAIN_EXCLUDES[HOST]) DOMAIN_EXCLUDES[HOST] = { self: [], ancestors: [] };
        DOMAIN_EXCLUDES[HOST].ancestors = lines;
        await storage.set(DOMAIN_EXCLUDES_KEY, JSON.stringify(DOMAIN_EXCLUDES));
        location.reload();
      }
    });
  });

  // Domain Controls
  GM_registerMenuCommand?.('--- Domain Controls ---', () => {});
  GM_registerMenuCommand?.(
    DOMAINS_MODE === 'allow'
      ? 'Domain mode: Allowlist only'
      : 'Domain mode: All domains with Denylist',
    async () => {
      DOMAINS_MODE = (DOMAINS_MODE === 'allow') ? 'deny' : 'allow';
      await storage.set(DOMAINS_MODE_KEY, DOMAINS_MODE);
      location.reload();
    }
  );
  GM_registerMenuCommand?.(
    computeDomainDisabled(HOST) ? `Current page: DISABLED (click to enable)` : `Current page: ENABLED (click to disable)`,
    async () => {
      if (DOMAINS_MODE === 'allow') {
        // In allowlist mode: toggle presence in allowlist
        if (listMatchesHost(DOMAIN_ALLOW, HOST)) {
          DOMAIN_ALLOW = DOMAIN_ALLOW.filter(p => !domainPatternToRegex(p)?.test(HOST));
        } else {
          DOMAIN_ALLOW.push(HOST);
        }
        await storage.set(DOMAINS_ALLOW_KEY, JSON.stringify(DOMAIN_ALLOW));
      } else {
        // In denylist mode: toggle presence in denylist
        if (computeDomainDisabled(HOST)) {
          DOMAIN_DENY = DOMAIN_DENY.filter(p => !domainPatternToRegex(p)?.test(HOST));
        } else {
          if (!DOMAIN_DENY.includes(HOST)) DOMAIN_DENY.push(HOST);
        }
        await storage.set(DOMAINS_DENY_KEY, JSON.stringify(DOMAIN_DENY));
      }
      location.reload();
    }
  );

  // Toggles
  GM_registerMenuCommand?.('--- Toggles ---', () => {});
  GM_registerMenuCommand?.(`Neutralization strength (${TEMPERATURE_LEVEL})`, openTemperatureDialog);
  GM_registerMenuCommand?.(`Simplification strength (${SIMPLIFICATION_LEVEL})`, openSimplificationStrengthDialog);
  GM_registerMenuCommand?.(`Toggle auto-detect (${CFG.autoDetect ? 'ON' : 'OFF'})`, async () => { await setAutoDetect(!CFG.autoDetect); });
  GM_registerMenuCommand?.(`Toggle body simplification (${SIMPLIFY_BODY ? 'ON' : 'OFF'})`, async () => { await setSimplifyBody(!SIMPLIFY_BODY); });
  GM_registerMenuCommand?.(`Toggle DEBUG logs (${CFG.DEBUG ? 'ON' : 'OFF'})`, async () => { await setDebug(!CFG.DEBUG); });
  GM_registerMenuCommand?.(`Toggle badge (${SHOW_BADGE ? 'ON' : 'OFF'})`, async () => { await setShowBadge(!SHOW_BADGE); });

  // Actions
  GM_registerMenuCommand?.('--- Actions ---', () => {});
  GM_registerMenuCommand?.('Show stats & changes (diff audit)', showDiffAudit);
  GM_registerMenuCommand?.('Process visible now', () => { processVisibleNow(); });
  GM_registerMenuCommand?.('Flush headline cache & rerun', async () => { await cacheClear(); resetAndReindex(); processVisibleNow(); });
  GM_registerMenuCommand?.('Flush body simplification cache', async () => { await bodyCacheClear(); location.reload(); });
  GM_registerMenuCommand?.('Reset stats counters', () => { STATS.total = STATS.live = STATS.cache = STATS.batches = 0; CHANGES.length = 0; updateBadgeCounts(); });
  GM_registerMenuCommand?.('Reset API usage stats', async () => { await resetApiTokens(); openInfo('API usage stats reset. Token counters and cost tracking cleared.'); });

  // ───────────────────────── BADGE (Calmed / Restore) + Per-site toggle ─────────────────────────
  let badge, badgeState = 'calmed'; // 'calmed' or 'originals'
  let bodyBadgeState = 'original'; // 'original' or 'simplified'

  function ensureBadge() {
    if ((DOMAIN_DISABLED || OPTED_OUT) || !SHOW_BADGE) return;

    // Check if badge exists and is still in the DOM
    if (badge && badge.isConnected) return;

    // Badge was removed or doesn't exist, recreate it
    badge = document.createElement('div');
    badge.className = 'neutralizer-badge';
    if (BADGE_COLLAPSED) badge.classList.add('collapsed');
    badge.setAttribute(UI_ATTR,'');

    // Set initial position
    const maxX = window.innerWidth - 220;
    const maxY = window.innerHeight - 200;
    BADGE_POS.x = Math.max(0, Math.min(BADGE_POS.x, maxX));
    BADGE_POS.y = Math.max(0, Math.min(BADGE_POS.y, maxY));

    // Always set top position
    badge.style.top = `${BADGE_POS.y}px`;

    // Set horizontal position based on collapse state
    if (BADGE_COLLAPSED) {
      badge.style.right = '0px';
    } else {
      badge.style.left = `${BADGE_POS.x}px`;
    }

    const isArticle = SIMPLIFY_BODY && isArticlePage();
    const bodyRow = isArticle ? `
      <div class="row">
        <button class="btn body-action">B: original</button>
      </div>
    ` : '';

    badge.innerHTML = `
      <div class="badge-handle" title="${BADGE_COLLAPSED ? 'Open' : 'Close'}">${BADGE_COLLAPSED ? '◀' : '▶'}</div>
      <div class="badge-header">NEUTRALIZE HEADLINES</div>
      <div class="badge-content">
        <div class="row">
          <button class="btn primary action">H: neutral</button>
        </div>
        ${bodyRow}
      </div>
    `;
    document.body.appendChild(badge);
    badge.querySelector('.action').addEventListener('click', onBadgeAction);
    badge.querySelector('.badge-handle').addEventListener('click', toggleBadgeCollapse);
    badge.querySelector('.badge-header').addEventListener('mousedown', startBadgeDrag);
    if (isArticle) {
      badge.querySelector('.body-action')?.addEventListener('click', onBodyBadgeAction);
    }
  }

  // ───────────────────────── BADGE DRAGGING ─────────────────────────
  let isBadgeDragging = false;
  let badgeDragOffset = { x: 0, y: 0 };

  function startBadgeDrag(e) {
    // Don't drag if collapsed
    if (BADGE_COLLAPSED) return;

    isBadgeDragging = true;
    badge.classList.add('dragging');

    const rect = badge.getBoundingClientRect();
    badgeDragOffset.x = e.clientX - rect.left;
    badgeDragOffset.y = e.clientY - rect.top;

    document.addEventListener('mousemove', onBadgeDrag);
    document.addEventListener('mouseup', stopBadgeDrag);

    e.preventDefault();
  }

  function onBadgeDrag(e) {
    if (!isBadgeDragging) return;

    let newX = e.clientX - badgeDragOffset.x;
    let newY = e.clientY - badgeDragOffset.y;

    // Constrain to viewport
    const maxX = window.innerWidth - badge.offsetWidth;
    const maxY = window.innerHeight - badge.offsetHeight;
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    badge.style.left = `${newX}px`;
    badge.style.top = `${newY}px`;

    BADGE_POS = { x: newX, y: newY };
  }

  function stopBadgeDrag() {
    if (!isBadgeDragging) return;

    isBadgeDragging = false;
    badge.classList.remove('dragging');

    document.removeEventListener('mousemove', onBadgeDrag);
    document.removeEventListener('mouseup', stopBadgeDrag);

    storage.set(BADGE_POS_KEY, JSON.stringify(BADGE_POS));
  }
  async function toggleBadgeCollapse() {
    BADGE_COLLAPSED = !BADGE_COLLAPSED;
    await storage.set(BADGE_COLLAPSED_KEY, String(BADGE_COLLAPSED));

    const currentY = parseInt(badge.style.top) || BADGE_POS.y;

    if (BADGE_COLLAPSED) {
      badge.classList.add('collapsed');
      // Position on right edge for collapse animation
      badge.style.left = '';
      badge.style.right = '0px';
      badge.style.top = `${currentY}px`;
    } else {
      badge.classList.remove('collapsed');
      // Restore to saved position or default near right edge
      const rightEdgeX = BADGE_POS.x || (window.innerWidth - 220);

      badge.style.right = '';
      badge.style.left = `${rightEdgeX}px`;
      badge.style.top = `${currentY}px`;

      // Update saved position
      BADGE_POS = { x: rightEdgeX, y: currentY };
      storage.set(BADGE_POS_KEY, JSON.stringify(BADGE_POS));
    }

    const handle = badge.querySelector('.badge-handle');
    if (handle) {
      handle.title = BADGE_COLLAPSED ? 'Open' : 'Close';
      handle.textContent = BADGE_COLLAPSED ? '◀' : '▶';
    }
  }

  function onBadgeAction() {
    if (badgeState === 'calmed') {
      restoreOriginals();
      badgeState = 'originals';
      badge.querySelector('.action').textContent = 'H: original';
    } else {
      reapplyFromCache();
      badgeState = 'calmed';
      badge.querySelector('.action').textContent = 'H: neutral';
    }
  }

  function onBodyBadgeAction() {
    const btn = badge.querySelector('.body-action');
    if (bodyBadgeState === 'original') {
      // Simplify body
      btn.textContent = 'B: starting...';
      btn.disabled = true;
      applyBodySimplification(true).then(() => {
        // Badge state is synced inside applyBodySimplification
        btn.disabled = false;
      }).catch(err => {
        log('Body simplification error:', err);
        btn.textContent = 'B: original';
        btn.disabled = false;
      });
    } else {
      // Restore original
      restoreBodyOriginals();
      syncBodyBadgeState();
    }
  }

  function updateBadgeCounts() {
    // Counts display removed from badge
  }

  function syncBodyBadgeState() {
    if (!badge) return;
    const btn = badge.querySelector('.body-action');
    if (!btn) return;

    if (bodySimplified) {
      bodyBadgeState = 'simplified';
      btn.textContent = 'B: simplified';
    } else {
      bodyBadgeState = 'original';
      btn.textContent = 'B: original';
    }
  }

  function restoreOriginals() {
    const els = document.querySelectorAll('[data-neutralizer-changed="1"][data-neutralizer-original]');
    let n = 0;
    els.forEach(el => {
      const orig = el.getAttribute('data-neutralizer-original');
      if (typeof orig === 'string') { el.textContent = orig; n++; }
    });
    log('restored originals on', n, 'elements');
  }
  function reapplyFromCache() {
    seenEl = new WeakSet();
    // Apply cached rewrites to all elements
    for (const [text, set] of textToElements.entries()) {
      const cached = cacheGet(text);
      if (cached) {
        applyRewrites(buildMap([text]), [text], [cached], 'cache');
      }
    }
  }

  // ───────────────────────── UTILITIES ─────────────────────────
  function parseRootMarginPxY() { const m=(CFG.rootMargin||'0px').trim().split(/\s+/); const top=m[0]||'0px'; const val=parseFloat(top); return isNaN(val)?0:val; }
  function isInViewportWithMargin(el) { const rect=el.getBoundingClientRect(); const vh=window.innerHeight||document.documentElement.clientHeight; const m=parseRootMarginPxY(); return rect.bottom>=-m && rect.top<=vh+m; }

  function processVisibleNow() {
    for (const [text, set] of textToElements.entries()) {
      if (cacheGet(text)) continue;
      const el = set.values().next().value;
      if (!el) continue;
      if (CFG.visibleOnly ? isInViewportWithMargin(el) : true) pending.add(text);
    }
    scheduleFlush();
  }

  function resetAndReindex() {
    pending.clear(); if (flushTimer) clearTimeout(flushTimer); flushTimer = null;
    textToElements.clear(); seenEl = new WeakSet();
    if (IO) { IO.disconnect(); IO = null; }
    if (!(DOMAIN_DISABLED || OPTED_OUT)) { ensureObserver(); attachTargets(document); }
  }

  // ───────────────────────── DIFF AUDIT ─────────────────────────
  function showDiffAudit() {
    const host = document.createElement('div'); host.setAttribute(UI_ATTR,'');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .wrap { position:fixed; inset:0; z-index:2147483647; background:rgba(0,0,0,.45);
              display:flex; align-items:center; justify-content:center; }
      .modal { background:#fff; max-width:900px; width:94%; border-radius:10px;
               box-shadow:0 10px 40px rgba(0,0,0,.4); padding:14px; box-sizing:border-box; }
      h3, h4 { margin:0 0 8px; font:600 16px/1.2 system-ui,sans-serif; }
      h4 { font-size:14px; }
      .list { max-height:70vh; overflow:auto; }
      .row { border-top:1px solid #eee; padding:8px 2px; }
      .from { color:#666; }
      .to { color:#111; font-weight:600; }
      .meta { color:#888; font-size:11px; }
      .btn { padding:10px 16px; border-radius:6px; border:none;
             font:600 13px system-ui,sans-serif; cursor:pointer;
             background:#e8eaed; color:#1a1a1a; }
      .btn:hover { background:#dadce0; }
    `;
    const wrap = document.createElement('div'); wrap.className = 'wrap';
    const modal = document.createElement('div'); modal.className = 'modal';
    const list = document.createElement('div'); list.className = 'list';

    // Add cache stats section
    const headlineCacheSize = Object.keys(CACHE).length;
    const bodyCacheSize = Object.keys(BODY_CACHE).length;
    const bodyCacheArticles = Object.values(BODY_CACHE).map(c => `${c.url} (${c.count}p)`).join('<br>');

    // Calculate API usage stats
    const totalInput = API_TOKENS.headlines.input + API_TOKENS.body.input;
    const totalOutput = API_TOKENS.headlines.output + API_TOKENS.body.output;
    const totalTokens = totalInput + totalOutput;
    const totalCalls = API_TOKENS.headlines.calls + API_TOKENS.body.calls;
    const estimatedCost = calculateApiCost();

    modal.innerHTML = `
      <h3>Stats & Changes (this page)</h3>
      <div style="background:#f5f5f5;padding:10px;border-radius:6px;margin-bottom:12px;font-size:13px;">
        <strong>Cache Stats:</strong><br>
        Headlines cached: ${headlineCacheSize} entries<br>
        Body simplifications cached: ${bodyCacheSize} articles<br>
        ${bodyCacheSize > 0 ? `<details style="margin-top:6px"><summary style="cursor:pointer">Cached articles</summary><div style="font-size:11px;margin-top:4px;max-height:100px;overflow-y:auto">${bodyCacheArticles}</div></details>` : ''}
      </div>
      <div style="background:#e8f4fd;padding:10px;border-radius:6px;margin-bottom:12px;font-size:13px;border-left:3px solid #1a73e8;">
        <strong>API Usage (since install):</strong><br>
        Total API calls: ${totalCalls.toLocaleString()}<br>
        Total tokens: ${totalTokens.toLocaleString()} (${totalInput.toLocaleString()} input, ${totalOutput.toLocaleString()} output)<br>
        <details style="margin-top:6px">
          <summary style="cursor:pointer">Breakdown by feature</summary>
          <div style="font-size:12px;margin-top:4px">
            <strong>Headlines:</strong> ${API_TOKENS.headlines.calls.toLocaleString()} calls, ${(API_TOKENS.headlines.input + API_TOKENS.headlines.output).toLocaleString()} tokens<br>
            <strong>Body simplification:</strong> ${API_TOKENS.body.calls.toLocaleString()} calls, ${(API_TOKENS.body.input + API_TOKENS.body.output).toLocaleString()} tokens
          </div>
        </details>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #ccc;color:#1557b0;font-weight:600">
          Estimated cost: ~$${estimatedCost.toFixed(4)}
        </div>
        <div style="margin-top:6px;font-size:11px;color:#666">
          Pricing: $${PRICING.inputPer1M} input / $${PRICING.outputPer1M} output per 1M tokens (${PRICING.model}, updated ${PRICING.lastUpdated})
        </div>
      </div>
      <h4 style="margin:0 0 8px">Headlines Changed</h4>
    `;

    if (!CHANGES.length) {
      const p = document.createElement('p'); p.textContent = 'No recorded changes yet.'; modal.appendChild(p);
    } else {
      CHANGES.forEach((ch, idx) => {
        const row = document.createElement('div'); row.className = 'row';
        row.innerHTML = `
          <div class="meta">#${idx+1} • ${ch.source} • ${ch.mode} • on ${ch.count} element(s)</div>
          <div class="from">– ${escapeHtml(ch.from)}</div>
          <div class="to">+ ${escapeHtml(ch.to)}</div>`;
        list.appendChild(row);
      });
      modal.appendChild(list);
    }
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px;';
    const btnClose = document.createElement('button'); btnClose.textContent = 'Close'; btnClose.className = 'btn';
    actions.appendChild(btnClose);
    modal.appendChild(actions);
    wrap.appendChild(modal);
    shadow.append(style, wrap);
    document.body.appendChild(host);
    const close = () => host.remove();
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    btnClose.addEventListener('click', () => close());
    shadow.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    // Focus the wrapper to enable keyboard events
    wrap.setAttribute('tabindex', '-1');
    wrap.focus();
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));}

  // ───────────────────────── BOOTSTRAP ─────────────────────────

  // Check if this is first install
  const isFirstInstall = await storage.get(FIRST_INSTALL_KEY, '') === '';
  const hasApiKey = (await storage.get('OPENAI_KEY', '')) !== '';

  if (isFirstInstall) {
    log('First install detected');
    // Set domain mode to allowlist (disabled everywhere) by default
    if (DOMAINS_MODE === 'deny') {
      await storage.set(DOMAINS_MODE_KEY, 'allow');
      DOMAINS_MODE = 'allow';
      log('Set domain mode to allowlist (disabled by default)');
    }

    // Show welcome dialog after a brief delay to let page settle
    setTimeout(() => {
      openWelcomeDialog();
    }, 500);
    return;
  }

  // If no API key, don't run the script
  if (!hasApiKey) {
    log('No API key configured. Script inactive. Set API key via menu.');
    return;
  }

  if (DOMAIN_DISABLED || OPTED_OUT) {
    log('inactive:', OPTED_OUT ? 'publisher opt-out' : 'domain disabled');
    return;
  }

  ensureBadge();
  attachTargets(document);
  ensureObserver();

  const mo = new MutationObserver((muts) => {
    ensureBadge(); // Recreate badge if it was removed
    for (const m of muts) { if (m.addedNodes && m.addedNodes.length) m.addedNodes.forEach(n => { if (n.nodeType === 1) attachTargets(n); }); }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  processVisibleNow();

  // Body simplification is now only triggered manually via badge button click
  // (removed automatic application on page load)

})();