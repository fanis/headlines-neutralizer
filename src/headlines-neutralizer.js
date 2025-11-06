// ==UserScript==
// @name         Neutralize Headlines
// @namespace    https://fanis.dev/userscripts
// @author       Fanis
// @version      1.2.0
// @description  Tone down sensationalist titles via OpenAI API. Auto-detect + manual selectors, exclusions, domain allow/deny, caching, Android-safe storage.
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

(async () => {
  'use strict';

  // ───────────────────────── CONFIG ─────────────────────────
  const CFG = {
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxBatch: 24,
    DEBUG: true,

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
  const SELECTORS_KEY = 'neutralizer_selectors_v1'; // inclusions
  const DEFAULT_SELECTORS = ['h1','h2','h3','.lead','[itemprop="headline"]','[role="heading"]','.title','.title a','.summary','.hn__title-container h2 a','.article-title'];
  let SELECTORS = DEFAULT_SELECTORS.slice();

  const EXCLUDES_KEY = 'neutralizer_excludes_v1';
  let EXCLUDE = { self: [], ancestors: ['header','footer','nav','aside','[role="navigation"]','.breadcrumbs','[aria-label*="breadcrumb" i]'] };

  const DOMAINS_MODE_KEY    = 'neutralizer_domains_mode_v1';     // 'deny' | 'allow'
  const DOMAINS_DENY_KEY    = 'neutralizer_domains_excluded_v1'; // array of patterns
  const DOMAINS_ALLOW_KEY   = 'neutralizer_domains_enabled_v1';  // array of patterns
  const DEBUG_KEY           = 'neutralizer_debug_v1';
  const AUTO_DETECT_KEY     = 'neutralizer_autodetect_v1';
  const SHOW_ORIG_KEY       = 'neutralizer_showorig_v1';
  const SHOW_BADGE_KEY      = 'neutralizer_showbadge_v1';

  // load toggles
  try { const v = await storage.get(DEBUG_KEY, ''); if (v !== '') CFG.DEBUG = (v === true || v === 'true'); } catch {}
  try { const v = await storage.get(AUTO_DETECT_KEY, ''); if (v !== '') CFG.autoDetect = (v === true || v === 'true'); } catch {}
  try { const v = await storage.get(SHOW_ORIG_KEY, ''); if (v !== '') CFG.showOriginalOnHover = (v === true || v === 'true'); } catch {}

  let SHOW_BADGE = true; // default
  try { const v = await storage.get(SHOW_BADGE_KEY, ''); if (v !== '') SHOW_BADGE = (v === true || v === 'true'); } catch {}

  async function setDebug(on)         { CFG.DEBUG = !!on; await storage.set(DEBUG_KEY, String(CFG.DEBUG)); location.reload(); }
  async function setAutoDetect(on)    { CFG.autoDetect = !!on; await storage.set(AUTO_DETECT_KEY, String(CFG.autoDetect)); location.reload(); }
  async function setShowBadge(on)     { SHOW_BADGE = !!on; await storage.set(SHOW_BADGE_KEY, String(SHOW_BADGE)); location.reload(); }

  // domain mode + lists
  let DOMAINS_MODE   = 'deny'; // default
  let DOMAIN_DENY    = [];
  let DOMAIN_ALLOW   = [];

  const CACHE_KEY = 'neutralizer_cache_v1';
  let CACHE = {};
  let cacheDirty = false;

  // Load persisted data
  try { SELECTORS = JSON.parse(await storage.get(SELECTORS_KEY, JSON.stringify(DEFAULT_SELECTORS))); } catch {}
  try { EXCLUDE   = JSON.parse(await storage.get(EXCLUDES_KEY, JSON.stringify(EXCLUDE))); } catch {}
  try { DOMAINS_MODE = await storage.get(DOMAINS_MODE_KEY, 'deny'); } catch {}
  try { DOMAIN_DENY  = JSON.parse(await storage.get(DOMAINS_DENY_KEY, JSON.stringify(DOMAIN_DENY))); } catch {}
  try { DOMAIN_ALLOW = JSON.parse(await storage.get(DOMAINS_ALLOW_KEY, JSON.stringify(DOMAIN_ALLOW))); } catch {}
  try { CACHE = JSON.parse(await storage.get(CACHE_KEY, '{}')); } catch {}

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
      .neutralizer-badge { position: fixed; right: 12px; bottom: 14px; z-index: 2147483646;
        font: 12px/1.1 system-ui, sans-serif; color: #0b3d2c; background: #c9f6e1; border: 1px solid #79d4b0;
        padding: 8px 10px; border-radius: 10px; box-shadow: 0 6px 22px rgba(0,0,0,.18); display:flex; flex-direction:column; gap:6px; }
      .neutralizer-badge .row { display:flex; gap:8px; align-items:center; }
      .neutralizer-badge .btn { cursor: pointer; padding: 4px 8px; border-radius: 8px; border:1px solid #79d4b0; background:#fff; }
      .neutralizer-badge .btn.primary { background:#0b3d2c; color:#fff; border-color:#0b3d2c; }
      .neutralizer-badge .small { font-size:11px; opacity:.9; }
      .neutralizer-badge .provenance { font-size:10px; opacity:.7; text-align:center; }
      .neutralizer-audit { position:fixed; inset:0; z-index:2147483646; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.45); }
      .neutralizer-audit .modal { background:#fff; max-width:900px; width:94%; border-radius:10px; box-shadow:0 10px 40px rgba(0,0,0,.4); padding:14px; }
      .neutralizer-audit h3 { margin:0 0 8px; font:600 16px/1.2 system-ui,sans-serif; }
      .neutralizer-audit .list { max-height:70vh; overflow:auto; }
      .neutralizer-audit .row { border-top:1px solid #eee; padding:8px 2px; }
      .neutralizer-audit .from { color:#666; }
      .neutralizer-audit .to { color:#111; font-weight:600; }
      .neutralizer-audit .meta { color:#888; font-size:11px; }
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

  // ───────────────────────── POLYMORPHIC EDITOR (list/secret) ─────────────────────────
  function parseLines(s) { return s.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean); }

  function openEditor({ title, hint = 'One item per line', mode = 'list', initial = [], onSave, onValidate }) {
    const host = document.createElement('div'); host.setAttribute(UI_ATTR, '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .wrap{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);
            display:flex;align-items:center;justify-content:center}
      .modal{background:#fff;max-width:640px;width:92%;border-radius:10px;
             box-shadow:0 10px 40px rgba(0,0,0,.35);padding:16px 16px 12px}
      .modal h3{margin:0 0 8px;font:600 16px/1.2 system-ui,sans-serif}
      textarea{width:100%;height:220px;resize:vertical;padding:10px;
               font:13px/1.4 ui-monospace,Consolas,monospace}
      .row{display:flex;gap:8px;align-items:center}
      input[type=password],input[type=text]{flex:1;padding:10px;border-radius:8px;border:1px solid #ccc;
               font:14px/1.3 ui-monospace,Consolas,monospace}
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
    const bodySecret = `
      <div class="row">
        <input id="sec" type="password" placeholder="sk-..." autocomplete="off" />
        <button id="toggle" title="Show/Hide">👁</button>
      </div>`;
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
        <h3>${title}</h3>
        ${mode === 'secret' ? bodySecret : bodyList}
        <div class="actions">
          ${mode === 'secret' && onValidate ? '<button class="test">Validate</button>' : ''}
          <button class="save">Save</button>
          <button class="cancel">Cancel</button>
        </div>
        <p class="hint">${hint}</p>
      </div>`;
    shadow.append(style, wrap);
    document.body.appendChild(host);
    const close = () => host.remove();

    if (mode === 'secret') {
      const inp = shadow.querySelector('#sec');
      const btnSave = shadow.querySelector('.save');
      const btnCancel = shadow.querySelector('.cancel');
      const btnToggle = shadow.querySelector('#toggle');
      const btnTest = shadow.querySelector('.test');
      if (typeof initial === 'string' && initial) inp.value = initial;
      btnToggle.addEventListener('click', () => { inp.type = (inp.type === 'password') ? 'text' : 'password'; inp.focus(); });
      btnSave.addEventListener('click', async () => { const v = inp.value.trim(); if (!v) return; await onSave?.(v); close(); });
      btnCancel.addEventListener('click', close);
      btnTest?.addEventListener('click', async () => { await onValidate?.(inp.value.trim()); });
      wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
      shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); btnSave.click(); } });
      inp.focus();
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
    openEditor({ title: 'Neutralizer', mode: 'list', initial: [message], hint: 'Close when done.' , onSave: () => {} });
  }

  function openKeyDialog(extra) {
    openEditor({
      title: 'OpenAI API key',
      mode: 'secret',
      initial: '',
      hint: 'Stored locally (GM → localStorage → memory). Validate sends GET /v1/models.',
      onSave: async (val) => {
        const ok = await storage.set('OPENAI_KEY', val);
        const verify = await storage.get('OPENAI_KEY', '');
        log('API key saved:', ok, verify ? `••••${verify.slice(-4)}` : '(empty)');
      },
      onValidate: async (val) => {
        const key = val || await storage.get('OPENAI_KEY', '');
        if (!key) { openInfo('No key to test'); return; }
        try { await xhrGet('https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` }); log('key validation: OK'); openInfo('Validation OK (HTTP 200)'); }
        catch (e) { log('key validation error:', e.message || e); openInfo(`Validation failed: ${e.message || e}`); }
      }
    });
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

  GM_registerMenuCommand?.('Edit TARGET selectors (multiline)', () => {
    openEditor({
      title: 'Target selectors (elements to rewrite)',
      mode: 'list',
      initial: SELECTORS,
      hint: 'One CSS selector per line (e.g., h1, h2, h3, .lead, [itemprop="headline"])',
      onSave: async (lines) => {
        const clean = lines.filter(Boolean).map(s => s.trim()).filter(Boolean);
        SELECTORS = clean.length ? clean : DEFAULT_SELECTORS.slice();
        await storage.set(SELECTORS_KEY, JSON.stringify(SELECTORS));
        resetAndReindex(); processVisibleNow();
      }
    });
  });

  GM_registerMenuCommand?.('Edit EXCLUDES: elements (self)', () => {
    openEditor({
      title: 'Excluded ELEMENT selectors (self)',
      mode: 'list',
      initial: EXCLUDE.self || [],
      hint: 'One CSS selector per line (e.g., .sponsored, .ad-title, h4.category). These elements are skipped.',
      onSave: async (lines) => {
        EXCLUDE.self = lines;
        await storage.set(EXCLUDES_KEY, JSON.stringify(EXCLUDE));
        resetAndReindex(); processVisibleNow();
      }
    });
  });

  GM_registerMenuCommand?.('Edit EXCLUDES: containers (ancestors)', () => {
    openEditor({
      title: 'Excluded CONTAINERS (ancestors)',
      mode: 'list',
      initial: EXCLUDE.ancestors || [],
      hint: 'One per line (e.g., header, footer, nav, aside, [role="navigation"], .breadcrumbs). Anything inside is skipped.',
      onSave: async (lines) => {
        EXCLUDE.ancestors = lines;
        await storage.set(EXCLUDES_KEY, JSON.stringify(EXCLUDE));
        resetAndReindex(); processVisibleNow();
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
  GM_registerMenuCommand?.(computeDomainDisabled(HOST) ? `Current page: DISABLED` : `Current page: ENABLED`, () => {});
  if (DOMAINS_MODE === 'allow') {
    GM_registerMenuCommand?.(listMatchesHost(DOMAIN_ALLOW, HOST) ? 'Remove this domain from allowlist' : 'Add this domain to allowlist', async () => {
      if (listMatchesHost(DOMAIN_ALLOW, HOST)) {
        DOMAIN_ALLOW = DOMAIN_ALLOW.filter(p => !domainPatternToRegex(p)?.test(HOST));
      } else {
        DOMAIN_ALLOW.push(HOST);
      }
      await storage.set(DOMAINS_ALLOW_KEY, JSON.stringify(DOMAIN_ALLOW));
      location.reload();
    });
  } else {
    GM_registerMenuCommand?.(computeDomainDisabled(HOST) ? 'Enable on this domain' : 'Disable on this domain', async () => {
      if (computeDomainDisabled(HOST)) {
        DOMAIN_DENY = DOMAIN_DENY.filter(p => !domainPatternToRegex(p)?.test(HOST));
      } else {
        if (!DOMAIN_DENY.includes(HOST)) DOMAIN_DENY.push(HOST);
      }
      await storage.set(DOMAINS_DENY_KEY, JSON.stringify(DOMAIN_DENY));
      location.reload();
    });
  }

  // Toggles
  GM_registerMenuCommand?.('--- Toggles ---', () => {});
  GM_registerMenuCommand?.(`Toggle auto-detect (${CFG.autoDetect ? 'ON' : 'OFF'})`, async () => { await setAutoDetect(!CFG.autoDetect); });
  GM_registerMenuCommand?.(`Toggle DEBUG logs (${CFG.DEBUG ? 'ON' : 'OFF'})`, async () => { await setDebug(!CFG.DEBUG); });
  GM_registerMenuCommand?.(`Toggle badge (${SHOW_BADGE ? 'ON' : 'OFF'})`, async () => { await setShowBadge(!SHOW_BADGE); });

  // Actions
  GM_registerMenuCommand?.('--- Actions ---', () => {});
  GM_registerMenuCommand?.('Show what changed (diff audit)', showDiffAudit);
  GM_registerMenuCommand?.('Process visible now', () => { processVisibleNow(); });
  GM_registerMenuCommand?.('Flush cache & rerun', async () => { await cacheClear(); resetAndReindex(); processVisibleNow(); });
  GM_registerMenuCommand?.('Reset stats counters', () => { STATS.total = STATS.live = STATS.cache = STATS.batches = 0; CHANGES.length = 0; updateBadgeCounts(); });

  // ───────────────────────── BADGE (Calmed / Restore) + Per-site toggle ─────────────────────────
  let badge, badgeState = 'calmed'; // 'calmed' or 'originals'
  function ensureBadge() {
    if (badge || (DOMAIN_DISABLED || OPTED_OUT) || !SHOW_BADGE) return;
    badge = document.createElement('div');
    badge.className = 'neutralizer-badge';
    badge.setAttribute(UI_ATTR,'');
    badge.innerHTML = `
      <div class="row">
        <button class="btn primary action">Restore original headlines</button>
        <span class="small counts">(0)</span>
      </div>
      <div class="provenance">Neutralize Headlines userscript</div>
    `;
    document.body.appendChild(badge);
    badge.querySelector('.action').addEventListener('click', onBadgeAction);
  }
  function onBadgeAction() {
    if (badgeState === 'calmed') {
      restoreOriginals();
      badgeState = 'originals';
      badge.querySelector('.action').textContent = 'Neutralize headlines';
    } else {
      reapplyFromCache();
      badgeState = 'calmed';
      badge.querySelector('.action').textContent = 'Restore original headlines';
    }
  }
  function updateBadgeCounts() {
    const el = badge?.querySelector('.counts');
    if (el) el.textContent = `(${STATS.total})`;
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
    const host = document.createElement('div'); host.className = 'neutralizer-audit'; host.setAttribute(UI_ATTR,'');
    const modal = document.createElement('div'); modal.className = 'modal';
    const list = document.createElement('div'); list.className = 'list';
    modal.innerHTML = `<h3>What changed (this page)</h3>`;
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
    host.appendChild(modal);
    document.body.appendChild(host);
    host.addEventListener('click', (e) => { if (e.target === host) host.remove(); });
    btnClose.addEventListener('click', () => host.remove());
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));}

  // ───────────────────────── BOOTSTRAP ─────────────────────────
  if (DOMAIN_DISABLED || OPTED_OUT) {
    log('inactive:', OPTED_OUT ? 'publisher opt-out' : 'domain disabled');
    return;
  }

  ensureBadge();
  attachTargets(document);
  ensureObserver();

  const mo = new MutationObserver((muts) => {
    for (const m of muts) { if (m.addedNodes && m.addedNodes.length) m.addedNodes.forEach(n => { if (n.nodeType === 1) attachTargets(n); }); }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  processVisibleNow();

})();