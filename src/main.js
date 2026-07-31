// ==UserScript==
// @name         Neutralize Headlines
// @namespace    https://fanis.dev/userscripts
// @author       Fanis Hatzidakis
// @license      PolyForm-Internal-Use-1.0.0; https://polyformproject.org/licenses/internal-use/1.0.0/
// @version      2.5.0
// @description  Tone down sensationalist titles via OpenAI API. Auto-detect + manual selectors, exclusions, per-domain configs, domain allow/deny, caching, Android-safe storage.
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
// @grant        GM.registerMenuCommand
// @connect      api.openai.com
// ==/UserScript==

// SPDX-License-Identifier: PolyForm-Internal-Use-1.0.0
// Copyright (c) 2025 Fanis Hatzidakis
// License: PolyForm Internal Use License 1.0.0
// Summary: Free for personal and internal business use. No redistribution, resale,
// or offering as a service without a separate commercial license from the author.
// Full text: https://polyformproject.org/licenses/internal-use/1.0.0/

import { CFG, UI_ATTR, TEMPERATURE_LEVELS, STORAGE_KEYS, DEFAULT_SELECTORS, DEFAULT_EXCLUDES, MODEL_OPTIONS } from './modules/config.js';
import { log, textTrim, withinLen, isInViewportWithMargin, escapeHtml, registerMenuCommand } from './modules/utils.js';
import { Storage } from './modules/storage.js';
import { HeadlineCache } from './modules/cache.js';
import { domainPatternToRegex, listMatchesHost } from './modules/selectors.js';
import { initApiTracking, rewriteBatch, resetApiTokens, updatePricing, calculateApiCost, validateApiKey, API_TOKENS, PRICING, isQuotaExhausted } from './modules/api.js';
import { ensureHighlightCSS, isExcluded, getCandidateElements, applyRewrites, restoreOriginals, publisherOptOut } from './modules/dom.js';
import { openEditor, openInfo, openKeyDialog, openWelcomeDialog, openTemperatureDialog, openModelSelectionDialog, showLongHeadlineDialog, showDiffAudit, openSelectorEditor, showToast } from './modules/settings.js';
import { ensureBadge, updateBadgeCounts, reapplyFromCache } from './modules/badge.js';
import { enterInspectionMode, showIncludedElements, exitIncludedElements } from './modules/inspection.js';

(async () => {
  'use strict';
  
  // Only run in top-level window, not in iframes
  if (window.self !== window.top) {
      return;
  }  

  const HOST = location.hostname;
  const storage = new Storage();

  // Stats tracking
  const STATS = { total: 0, live: 0, cache: 0, batches: 0 };
  const CHANGES = [];

  // Prevent multiple API key dialogs
  let apiKeyDialogShown = { value: false };

  // Initialize API tracking
  await initApiTracking(storage);

  // Load toggles
  try { const v = await storage.get(STORAGE_KEYS.DEBUG, ''); if (v !== '') CFG.DEBUG = (v === true || v === 'true'); } catch {}
  try { const v = await storage.get(STORAGE_KEYS.AUTO_DETECT, ''); if (v !== '') CFG.autoDetect = (v === true || v === 'true'); } catch {}
  try { const v = await storage.get(STORAGE_KEYS.SHOW_ORIG, ''); if (v !== '') CFG.showOriginalOnHover = (v === true || v === 'true'); } catch {}

  let SHOW_BADGE = true;
  try { const v = await storage.get(STORAGE_KEYS.SHOW_BADGE, ''); if (v !== '') SHOW_BADGE = (v === true || v === 'true'); } catch {}

  let BADGE_COLLAPSED = { value: false };
  try { const v = await storage.get(STORAGE_KEYS.BADGE_COLLAPSED, ''); if (v !== '') BADGE_COLLAPSED.value = (v === true || v === 'true'); } catch {}

  let BADGE_POS = { x: window.innerWidth - 220, y: window.innerHeight - 200 };
  try { const v = await storage.get(STORAGE_KEYS.BADGE_POS, ''); if (v) BADGE_POS = JSON.parse(v); } catch {}

  // Load temperature setting
  let TEMPERATURE_LEVEL = 'Moderate';
  try {
    const v = await storage.get(STORAGE_KEYS.TEMPERATURE, '');
    if (v !== '' && TEMPERATURE_LEVELS[v] !== undefined) {
      TEMPERATURE_LEVEL = v;
      CFG.temperature = TEMPERATURE_LEVELS[v];
    }
  } catch {}

  // Load model setting; fall back to the default model when the stored
  // selection no longer exists in MODEL_OPTIONS (MODEL_FALLBACK triggers a
  // one-time notice after the badge is created)
  let MODEL_FALLBACK = '';
  try {
    const v = await storage.get(STORAGE_KEYS.MODEL, '');
    if (v !== '') {
      if (MODEL_OPTIONS[v]) {
        CFG.model = v;
      } else {
        MODEL_FALLBACK = v;
      }
    }
  } catch {}

  // Keep in-memory pricing in sync with the active model, so cost statistics
  // pick up corrected rates after a pricing or lineup change instead of using
  // a stale stored snapshot
  {
    const activeModel = MODEL_OPTIONS[CFG.model];
    PRICING.model = activeModel.name;
    PRICING.inputPer1M = activeModel.inputPer1M;
    PRICING.outputPer1M = activeModel.outputPer1M;
  }

  // Settings functions
  async function setDebug(on) { CFG.DEBUG = !!on; await storage.set(STORAGE_KEYS.DEBUG, String(CFG.DEBUG)); location.reload(); }
  async function setAutoDetect(on) { CFG.autoDetect = !!on; await storage.set(STORAGE_KEYS.AUTO_DETECT, String(CFG.autoDetect)); location.reload(); }
  async function setShowBadge(on) { SHOW_BADGE = !!on; await storage.set(STORAGE_KEYS.SHOW_BADGE, String(SHOW_BADGE)); location.reload(); }
  async function setTemperature(level) {
    if (TEMPERATURE_LEVELS[level] === undefined) return;
    TEMPERATURE_LEVEL = level;
    CFG.temperature = TEMPERATURE_LEVELS[level];
    await storage.set(STORAGE_KEYS.TEMPERATURE, level);
    location.reload();
  }
  async function setModel(modelId) {
    if (!MODEL_OPTIONS[modelId]) return;
    CFG.model = modelId;
    await storage.set(STORAGE_KEYS.MODEL, modelId);
    // Update pricing to match selected model
    const modelConfig = MODEL_OPTIONS[modelId];
    await updatePricing(storage, {
      model: modelConfig.name,
      inputPer1M: modelConfig.inputPer1M,
      outputPer1M: modelConfig.outputPer1M
    });
    // Clear cache when model changes
    await cache.clear();
  }

  // Domain mode + lists
  let DOMAINS_MODE = 'deny';
  let DOMAIN_DENY = [];
  let DOMAIN_ALLOW = [];

  // Load persisted data
  let SELECTORS_GLOBAL = DEFAULT_SELECTORS.slice();
  let EXCLUDE_GLOBAL = { ...DEFAULT_EXCLUDES, ancestors: [...DEFAULT_EXCLUDES.ancestors] };
  let DOMAIN_SELECTORS = {};
  let DOMAIN_EXCLUDES = {};
  let LONG_HEADLINE_EXCEPTIONS = {};

  try { SELECTORS_GLOBAL = JSON.parse(await storage.get(STORAGE_KEYS.SELECTORS, JSON.stringify(DEFAULT_SELECTORS))); } catch {}
  try { EXCLUDE_GLOBAL = JSON.parse(await storage.get(STORAGE_KEYS.EXCLUDES, JSON.stringify(DEFAULT_EXCLUDES))); } catch {}
  try { DOMAIN_SELECTORS = JSON.parse(await storage.get(STORAGE_KEYS.DOMAIN_SELECTORS, '{}')); } catch {}
  try { DOMAIN_EXCLUDES = JSON.parse(await storage.get(STORAGE_KEYS.DOMAIN_EXCLUDES, '{}')); } catch {}
  try { LONG_HEADLINE_EXCEPTIONS = JSON.parse(await storage.get(STORAGE_KEYS.LONG_HEADLINE_EXCEPTIONS, '{}')); } catch {}

  // Load domain-specific settings for current host
  let SELECTORS_DOMAIN = DOMAIN_SELECTORS[HOST] || [];
  let EXCLUDE_DOMAIN = DOMAIN_EXCLUDES[HOST] || { self: [], ancestors: [] };

  // Merge global + domain-specific
  let SELECTORS = [...new Set([...SELECTORS_GLOBAL, ...SELECTORS_DOMAIN])];
  let EXCLUDE = {
    self: [...new Set([...EXCLUDE_GLOBAL.self, ...EXCLUDE_DOMAIN.self])],
    ancestors: [...new Set([...EXCLUDE_GLOBAL.ancestors, ...EXCLUDE_DOMAIN.ancestors])]
  };

  if (SELECTORS_DOMAIN.length > 0 || EXCLUDE_DOMAIN.self.length > 0 || EXCLUDE_DOMAIN.ancestors.length > 0) {
    log('domain-specific additions for', HOST, ':', { selectors: SELECTORS_DOMAIN, excludes: EXCLUDE_DOMAIN });
  }

  try { DOMAINS_MODE = await storage.get(STORAGE_KEYS.DOMAINS_MODE, 'deny'); } catch {}
  try { DOMAIN_DENY = JSON.parse(await storage.get(STORAGE_KEYS.DOMAINS_DENY, JSON.stringify(DOMAIN_DENY))); } catch {}
  try { DOMAIN_ALLOW = JSON.parse(await storage.get(STORAGE_KEYS.DOMAINS_ALLOW, JSON.stringify(DOMAIN_ALLOW))); } catch {}

  // Initialize cache
  const cache = new HeadlineCache(storage, CFG, log);
  await cache.init(HOST);

  // Publisher opt-out
  const OPTED_OUT = publisherOptOut();
  if (OPTED_OUT) log('publisher opt-out detected; disabling.');

  // Domain matching
  function computeDomainDisabled(host) {
    if (DOMAINS_MODE === 'allow') return !listMatchesHost(DOMAIN_ALLOW, host);
    return listMatchesHost(DOMAIN_DENY, host);
  }
  let DOMAIN_DISABLED = computeDomainDisabled(HOST);
  if (DOMAIN_DISABLED) log('domain disabled by list:', HOST, 'mode=', DOMAINS_MODE);

  // Data structures
  let seenEl = new WeakSet();
  const textToElements = new Map();
  let IO = null;
  const pending = new Set();
  let flushTimer = null;
  let longHeadlineCheckPending = false;
  // Set when the API can no longer succeed without user action (e.g. exhausted
  // credits/quota). Stops further flushes so we don't hammer a failing endpoint.
  let apiHalted = false;
  // Exponential backoff (ms) applied to the next flush after a genuine 429.
  // Reset to 0 on any successful batch.
  let rateLimitBackoffMs = 0;
  // Consecutive truncated/unparseable responses. Each retry halves the batch,
  // but a persistently misbehaving model must not retry (and bill) forever.
  let truncationRetries = 0;
  const MAX_TRUNCATION_RETRIES = 3;

  function ensureObserver() {
    if (IO || !CFG.visibleOnly) return;
    IO = new IntersectionObserver(onIntersect, { root: null, rootMargin: CFG.rootMargin, threshold: CFG.threshold });
  }
  function observerObserve(el) { if (CFG.visibleOnly) { ensureObserver(); IO.observe(el); } }

  function onIntersect(entries) {
    const cachedTexts = [];
    const cachedRewrites = [];
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      IO.unobserve(el);
      if (isExcluded(el, EXCLUDE)) continue;
      const text = textTrim(el);

      const cached = cache.get(text);
      if (cached) { cachedTexts.push(text); cachedRewrites.push(cached); continue; }
      pending.add(text);
    }
    if (cachedTexts.length) {
      applyRewrites(buildMap(cachedTexts), cachedTexts, cachedRewrites, 'cache', STATS, CHANGES, seenEl, updateBadgeCounts);
    }
    scheduleFlush();
  }

  function scheduleFlush() {
    if (apiHalted || flushTimer) return;
    const delay = rateLimitBackoffMs || CFG.flushDelayMs;
    flushTimer = setTimeout(flushPending, delay);
  }

  function buildMap(texts) {
    const map = new Map();
    for (const t of texts) {
      const set = textToElements.get(t);
      if (!set) continue;
      // Prune elements removed from the DOM (SPA navigations) so we neither
      // leak detached nodes nor waste work rewriting them.
      for (const el of set) { if (!el.isConnected) set.delete(el); }
      if (set.size) map.set(t, [...set]);
      else textToElements.delete(t);
    }
    return map;
  }

  async function flushPending() {
    flushTimer = null;
    if (apiHalted) return;
    const toSend = [];
    for (const t of pending) { if (!cache.get(t)) toSend.push(t); pending.delete(t); if (toSend.length === CFG.maxBatch) break; }
    if (!toSend.length) return;

    try {
      log('calling OpenAI for visible batch size', toSend.length);
      const rewrites = await rewriteBatch(storage, toSend);
      for (let i = 0; i < toSend.length; i++) cache.set(toSend[i], rewrites[i] ?? toSend[i]);
      applyRewrites(buildMap(toSend), toSend, rewrites, 'live', STATS, CHANGES, seenEl, updateBadgeCounts);
      rateLimitBackoffMs = 0;   // success clears any rate-limit backoff
      truncationRetries = 0;
      STATS.batches++;
      log(`[stats] batches=${STATS.batches} total=${STATS.total} (live=${STATS.live}, cache=${STATS.cache})`);
    } catch (e) {
      if (e.status === 'truncated') {
        truncationRetries++;
        if (truncationRetries >= MAX_TRUNCATION_RETRIES) {
          // Persistently truncated/unparseable output: dropping this batch beats
          // hammering (and billing) the API in a retry loop.
          log('Output truncated', truncationRetries, 'times in a row; dropping', toSend.length, 'headlines');
        } else {
          // Output was truncated - re-queue items and they'll be sent in smaller batches next flush
          log('Output truncated, re-queuing', toSend.length, 'headlines for retry in smaller batches');
          const half = Math.ceil(toSend.length / 2);
          for (const t of toSend) pending.add(t);
          // Temporarily reduce maxBatch to avoid hitting the limit again
          if (CFG.maxBatch > 4) CFG.maxBatch = Math.min(CFG.maxBatch, half);
        }
      } else if (e.status === 429 && !isQuotaExhausted(e)) {
        // Genuine rate limiting (not exhausted quota): transient. Re-queue, shrink
        // the batch to reduce burst, and let the existing flush schedule retry.
        log('Rate limited (429), re-queuing', toSend.length, 'headlines, reducing batch size and backing off');
        const half = Math.ceil(toSend.length / 2);
        for (const t of toSend) pending.add(t);
        if (CFG.maxBatch > 4) CFG.maxBatch = Math.min(CFG.maxBatch, half);
        // Exponential backoff, starting at 2s and capped at 60s.
        rateLimitBackoffMs = Math.min(rateLimitBackoffMs ? rateLimitBackoffMs * 2 : 2000, 60000);
        friendlyApiError(e);
      } else {
        console.error('[neutralizer-ai] error:', e);
        if (e.body) log('API error body:', e.body.substring(0, 500));
        friendlyApiError(e);
      }
    }
    if (pending.size) scheduleFlush();
  }

  const shownErrors = new Set();
  function friendlyApiError(err) {
    const s = err?.status || 0;
    if (s === 401) { openKeyDialog(storage, 'Unauthorized (401). Please enter a valid OpenAI key.', apiKeyDialogShown); return; }
    if (s === 429) {
      if (isQuotaExhausted(err)) {
        // Out of credits / quota exceeded — not transient. Stop trying so we don't
        // keep firing requests that can only fail until billing is fixed.
        apiHalted = true;
        pending.clear();
        if (shownErrors.has('quota')) return;
        shownErrors.add('quota');
        openInfo('OpenAI quota exceeded (429). Your account is out of credits or has hit its billing limit, so rewriting is paused. Add credits or raise your limit at platform.openai.com/account/billing, then reload the page.');
        return;
      }
      if (shownErrors.has(s)) return;        // show each error type at most once per page load
      shownErrors.add(s);
      openInfo('Rate limited by OpenAI (429). The script is automatically backing off and will retry shortly — no action needed.');
      return;
    }
    if (shownErrors.has(s)) return;          // show each error type at most once per page load
    shownErrors.add(s);
    if (s === 400) { log('Bad request (400). The page may contain text the API could not parse.'); return; }
    openInfo(`Unknown error${s ? ' (' + s + ')' : ''}. Check your network or try again.`);
  }

  // Attach targets
  async function attachTargets(root = document) {
    // getCandidateElements already resolves each match to its text host
    const candidates = getCandidateElements(root, SELECTORS, EXCLUDE)
      .filter(({ el, mode }) => {
        if (!el || seenEl.has(el) || isExcluded(el, EXCLUDE)) return false;
        if (mode === 'auto' && !withinLen(textTrim(el))) return false;
        return true;
      });

    const excessivelyLong = [];
    const hostsToAttach = [];

    for (const { el: host, mode } of candidates) {
      const text = textTrim(host);

      if (mode === 'manual' && text.length > CFG.sanityCheckLen && !LONG_HEADLINE_EXCEPTIONS[HOST]) {
        excessivelyLong.push({ host, text, length: text.length });
      } else {
        hostsToAttach.push({ host, mode, text });
      }
    }

    if (excessivelyLong.length > 0 && !longHeadlineCheckPending) {
      longHeadlineCheckPending = true;
      const result = await showLongHeadlineDialog(excessivelyLong, HOST, CFG);
      longHeadlineCheckPending = false;

      if (result) {
        for (const { host, text } of excessivelyLong) {
          hostsToAttach.push({ host, mode: 'manual', text });
        }

        if (result === true) {
          LONG_HEADLINE_EXCEPTIONS[HOST] = true;
          await storage.set(STORAGE_KEYS.LONG_HEADLINE_EXCEPTIONS, JSON.stringify(LONG_HEADLINE_EXCEPTIONS));
        }
      }
    }

    for (const { host, mode, text } of hostsToAttach) {
      host.setAttribute('data-neutralizer-mode', mode);
      let set = textToElements.get(text);
      if (!set) { set = new Set(); textToElements.set(text, set); }
      set.add(host);
      observerObserve(host);
    }
  }

  function processVisibleNow() {
    for (const [text, set] of textToElements.entries()) {
      if (cache.get(text)) continue;
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

  // Menu commands
  registerMenuCommand('Set / Validate OpenAI API key', async () => {
    const current = await storage.get(STORAGE_KEYS.OPENAI_KEY, '');
    openEditor({
      title: 'OpenAI API key',
      mode: 'secret',
      initial: current,
      hint: 'Stored locally (GM → localStorage → memory). Validate sends GET /v1/models.',
      onSave: async (val) => { await storage.set(STORAGE_KEYS.OPENAI_KEY, val); },
      onValidate: async (val) => {
        const res = await validateApiKey(storage, val);
        openInfo(res.ok ? 'Validation OK (HTTP 200)' : res.message);
      }
    });
  });
  registerMenuCommand(`AI model (${MODEL_OPTIONS[CFG.model]?.name || CFG.model})`, () => openModelSelectionDialog(storage, CFG.model, setModel));

  registerMenuCommand('--- Domain Controls ---', () => {});
  registerMenuCommand(
    DOMAINS_MODE === 'allow' ? 'Domain mode: Allowlist only' : 'Domain mode: All domains with Denylist',
    async () => {
      DOMAINS_MODE = (DOMAINS_MODE === 'allow') ? 'deny' : 'allow';
      await storage.set(STORAGE_KEYS.DOMAINS_MODE, DOMAINS_MODE);
      location.reload();
    }
  );
  registerMenuCommand(
    computeDomainDisabled(HOST) ? `Current page: DISABLED (click to enable)` : `Current page: ENABLED (click to disable)`,
    async () => {
      if (DOMAINS_MODE === 'allow') {
        if (listMatchesHost(DOMAIN_ALLOW, HOST)) {
          DOMAIN_ALLOW = DOMAIN_ALLOW.filter(p => !domainPatternToRegex(p)?.test(HOST));
        } else {
          DOMAIN_ALLOW.push(HOST);
        }
        await storage.set(STORAGE_KEYS.DOMAINS_ALLOW, JSON.stringify(DOMAIN_ALLOW));
      } else {
        if (computeDomainDisabled(HOST)) {
          DOMAIN_DENY = DOMAIN_DENY.filter(p => !domainPatternToRegex(p)?.test(HOST));
        } else {
          if (!DOMAIN_DENY.includes(HOST)) DOMAIN_DENY.push(HOST);
        }
        await storage.set(STORAGE_KEYS.DOMAINS_DENY, JSON.stringify(DOMAIN_DENY));
      }
      location.reload();
    }
  );

  registerMenuCommand('--- Toggles ---', () => {});
  registerMenuCommand(`Neutralization strength (${TEMPERATURE_LEVEL})`, () => openTemperatureDialog(storage, TEMPERATURE_LEVEL, setTemperature));
  registerMenuCommand(`Toggle auto-detect (${CFG.autoDetect ? 'ON' : 'OFF'})`, async () => { await setAutoDetect(!CFG.autoDetect); });
  registerMenuCommand(`Toggle DEBUG logs (${CFG.DEBUG ? 'ON' : 'OFF'})`, async () => { await setDebug(!CFG.DEBUG); });
  registerMenuCommand(`Toggle badge (${SHOW_BADGE ? 'ON' : 'OFF'})`, async () => { await setShowBadge(!SHOW_BADGE); });

  if (LONG_HEADLINE_EXCEPTIONS[HOST]) {
    registerMenuCommand(`Clear long headline exception (${HOST})`, async () => {
      if (confirm(`Clear the long headline exception for ${HOST}?\n\nYou'll be prompted again if selectors match text longer than ${CFG.sanityCheckLen} characters.`)) {
        delete LONG_HEADLINE_EXCEPTIONS[HOST];
        await storage.set(STORAGE_KEYS.LONG_HEADLINE_EXCEPTIONS, JSON.stringify(LONG_HEADLINE_EXCEPTIONS));
        openInfo(`Cleared long headline exception for ${HOST}.\n\nReload the page to see changes.`);
      }
    });
  }
  registerMenuCommand('Reset API usage stats', async () => { await resetApiTokens(storage); openInfo('API usage stats reset. Token counters and cost tracking cleared.'); });

  // Bootstrap
  const isFirstInstall = await storage.get(STORAGE_KEYS.FIRST_INSTALL, '') === '';
  const hasApiKey = (await storage.get(STORAGE_KEYS.OPENAI_KEY, '')) !== '';

  if (isFirstInstall) {
    log('First install detected');
    if (DOMAINS_MODE === 'deny') {
      await storage.set(STORAGE_KEYS.DOMAINS_MODE, 'allow');
      DOMAINS_MODE = 'allow';
      log('Set domain mode to allowlist (disabled by default)');
    }

    setTimeout(() => {
      openWelcomeDialog(storage, openEditor, openInfo);
    }, 500);
    return;
  }

  if (!hasApiKey) {
    log('No API key configured. Script inactive. Set API key via menu.');
    return;
  }

  if (DOMAIN_DISABLED || OPTED_OUT) {
    log('inactive:', OPTED_OUT ? 'publisher opt-out' : 'domain disabled');
    return;
  }

  ensureHighlightCSS();

  // Badge options object (shared between bootstrap and MutationObserver)
  const badgeOpts = () => ({
    DOMAIN_DISABLED, OPTED_OUT, SHOW_BADGE, BADGE_COLLAPSED, BADGE_POS, storage,
    onInspect: () => enterInspectionMode(SELECTORS, HOST, SELECTORS_GLOBAL, SELECTORS_DOMAIN, EXCLUDE_GLOBAL, EXCLUDE_DOMAIN, EXCLUDE, storage, DOMAIN_SELECTORS, DOMAIN_EXCLUDES, openInfo),
    restoreOriginals,
    reapplyFromCache: () => reapplyFromCache(
      textToElements,
      (t) => cache.get(t),
      buildMap,
      (map, originals, rewrites, source, freshSeenEl) => applyRewrites(map, originals, rewrites, source, STATS, CHANGES, freshSeenEl, updateBadgeCounts)
    ),
    onEditSelectors: () => openSelectorEditor({
      HOST,
      SELECTORS_GLOBAL,
      SELECTORS_DOMAIN,
      EXCLUDE_GLOBAL,
      EXCLUDE_DOMAIN,
      DEFAULT_SELECTORS,
      DEFAULT_EXCLUDES,
      onSave: async (result) => {
        const gSel = result.global.selectors;
        SELECTORS_GLOBAL = gSel.length ? gSel : DEFAULT_SELECTORS.slice();
        await storage.set(STORAGE_KEYS.SELECTORS, JSON.stringify(SELECTORS_GLOBAL));
        EXCLUDE_GLOBAL.self = result.global.excludeSelf;
        EXCLUDE_GLOBAL.ancestors = result.global.excludeAncestors;
        await storage.set(STORAGE_KEYS.EXCLUDES, JSON.stringify(EXCLUDE_GLOBAL));
        DOMAIN_SELECTORS[HOST] = result.domain.selectors;
        await storage.set(STORAGE_KEYS.DOMAIN_SELECTORS, JSON.stringify(DOMAIN_SELECTORS));
        if (!DOMAIN_EXCLUDES[HOST]) DOMAIN_EXCLUDES[HOST] = { self: [], ancestors: [] };
        DOMAIN_EXCLUDES[HOST].self = result.domain.excludeSelf;
        DOMAIN_EXCLUDES[HOST].ancestors = result.domain.excludeAncestors;
        await storage.set(STORAGE_KEYS.DOMAIN_EXCLUDES, JSON.stringify(DOMAIN_EXCLUDES));
      }
    }),
    onShowIncluded: () => showIncludedElements(SELECTORS, EXCLUDE),
    onStats: () => showDiffAudit(STATS, CHANGES, cache.cache, API_TOKENS, PRICING, calculateApiCost, escapeHtml, UI_ATTR),
    onFlushCache: async () => { await cache.clear(); resetAndReindex(); processVisibleNow(); },
    onStrengthChange: (level) => setTemperature(level),
    onAutoDetectToggle: (on) => setAutoDetect(on),
    strengthLevel: TEMPERATURE_LEVEL,
    autoDetectOn: CFG.autoDetect
  });

  ensureBadge(badgeOpts());
  attachTargets(document);
  ensureObserver();

  // Notify users whose saved model was removed from MODEL_OPTIONS. Persisting
  // the fallback via setModel makes this a one-time notice.
  if (MODEL_FALLBACK) {
    await setModel(CFG.model);
    showToast(
      `Your selected AI model (${MODEL_FALLBACK}) is no longer offered. Switched to ${MODEL_OPTIONS[CFG.model].name}.`,
      {
        actionLabel: 'Model settings',
        onAction: () => openModelSelectionDialog(storage, CFG.model, setModel)
      }
    );
  }

  // Coalesce mutation bursts: collect added elements and process them in one
  // debounced pass instead of running the full selector pipeline per node.
  const pendingRoots = new Set();
  let mutationTimer = null;
  function processPendingRoots() {
    mutationTimer = null;
    ensureBadge(badgeOpts());
    if (pendingRoots.size === 0) return;
    const all = [...pendingRoots];
    pendingRoots.clear();
    if (all.length > 40) {
      // Large burst (page hydration, infinite scroll): one document-wide pass
      // is cheaper than deduplicating and scanning many subtrees.
      attachTargets(document);
      return;
    }
    // Skip roots nested inside other pending roots (subtree replacements)
    const roots = all.filter(n =>
      n.isConnected && !all.some(other => other !== n && other.contains(n))
    );
    for (const root of roots) attachTargets(root);
  }
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) pendingRoots.add(n);
      }
    }
    if (!mutationTimer) mutationTimer = setTimeout(processPendingRoots, 150);
  });
  mo.observe(document.body, { childList: true, subtree: true });

  processVisibleNow();
})();
