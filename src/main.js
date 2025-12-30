// ==UserScript==
// @name         Neutralize Headlines
// @namespace    https://fanis.dev/userscripts
// @author       Fanis Hatzidakis
// @license      PolyForm-Internal-Use-1.0.0; https://polyformproject.org/licenses/internal-use/1.0.0/
// @version      1.8.0
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
// @connect      api.openai.com
// ==/UserScript==

// SPDX-License-Identifier: PolyForm-Internal-Use-1.0.0
// Copyright (c) 2025 Fanis Hatzidakis
// License: PolyForm Internal Use License 1.0.0
// Summary: Free for personal and internal business use. No redistribution, resale,
// or offering as a service without a separate commercial license from the author.
// Full text: https://polyformproject.org/licenses/internal-use/1.0.0/

import { CFG, UI_ATTR, TEMPERATURE_LEVELS, TEMPERATURE_ORDER, STORAGE_KEYS, DEFAULT_SELECTORS, DEFAULT_EXCLUDES, CARD_SELECTOR } from './modules/config.js';
import { log, textTrim, withinLen, isInViewportWithMargin, escapeHtml } from './modules/utils.js';
import { Storage } from './modules/storage.js';
import { HeadlineCache } from './modules/cache.js';
import { domainPatternToRegex, listMatchesHost, compiledSelectors } from './modules/selectors.js';
import { initApiTracking, rewriteBatch, resetApiTokens, updatePricing, resetPricingToDefaults, calculateApiCost, API_TOKENS, PRICING } from './modules/api.js';
import { ensureHighlightCSS, isExcluded, findTextHost, getCandidateElements, applyRewrites, restoreOriginals } from './modules/dom.js';
import { openEditor, openInfo, openKeyDialog, openWelcomeDialog, openTemperatureDialog, openPricingDialog, showLongHeadlineDialog, showDiffAudit } from './modules/settings.js';
import { ensureBadge, updateBadgeCounts, reapplyFromCache } from './modules/badge.js';
import { enterInspectionMode } from './modules/inspection.js';

(async () => {
  'use strict';

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
  function publisherOptOut() {
    const m1 = document.querySelector('meta[name="neutralizer"][content="no-transform" i]');
    const m2 = document.querySelector('meta[http-equiv="X-Content-Transform"][content="none" i]');
    return !!(m1 || m2);
  }
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

  function ensureObserver() {
    if (IO || !CFG.visibleOnly) return;
    IO = new IntersectionObserver(onIntersect, { root: null, rootMargin: CFG.rootMargin, threshold: CFG.threshold });
  }
  function observerObserve(el) { if (CFG.visibleOnly) { ensureObserver(); IO.observe(el); } }

  function onIntersect(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      IO.unobserve(el);
      if (isExcluded(el, EXCLUDE)) continue;
      const text = textTrim(el);

      const cached = cache.get(text);
      if (cached) { applyRewrites(buildMap([text]), [text], [cached], 'cache', STATS, CHANGES, seenEl, updateBadgeCounts); continue; }
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

  async function flushPending() {
    const toSend = [];
    for (const t of pending) { if (!cache.get(t)) toSend.push(t); pending.delete(t); if (toSend.length === CFG.maxBatch) break; }
    flushTimer = null;
    if (!toSend.length) return;

    try {
      log('calling OpenAI for visible batch size', toSend.length);
      const rewrites = await rewriteBatch(storage, toSend);
      for (let i = 0; i < toSend.length; i++) cache.set(toSend[i], rewrites[i] ?? toSend[i]);
      applyRewrites(buildMap(toSend), toSend, rewrites, 'live', STATS, CHANGES, seenEl, updateBadgeCounts);
      STATS.batches++;
      log(`[stats] batches=${STATS.batches} total=${STATS.total} (live=${STATS.live}, cache=${STATS.cache})`);
    } catch (e) {
      console.error('error:', e);
      friendlyApiError(e);
    }
    if (pending.size) scheduleFlush();
  }

  function friendlyApiError(err) {
    const s = err?.status || 0;
    if (s === 401) { openKeyDialog(storage, 'Unauthorized (401). Please enter a valid OpenAI key.', apiKeyDialogShown); return; }
    if (s === 429) { openInfo('Rate limited by API (429). Try again in a minute. You can also lower maxBatch or enable visible-only to reduce burst.'); return; }
    if (s === 400) { openInfo('Bad request (400). The page may contain text the API could not parse. Try again, or disable auto-detect for this site and use narrower selectors.'); return; }
    openInfo(`Unknown error${s ? ' (' + s + ')' : ''}. Check your network or try again.`);
  }

  // Attach targets
  async function attachTargets(root = document) {
    const candidates = getCandidateElements(root, SELECTORS, EXCLUDE)
      .map(({ el, mode }) => ({ el: findTextHost(el), mode }))
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
  GM_registerMenuCommand?.('--- Configuration ---', () => {});
  GM_registerMenuCommand?.('Set / Validate OpenAI API key', async () => {
    const current = await storage.get(STORAGE_KEYS.OPENAI_KEY, '');
    openEditor({
      title: 'OpenAI API key',
      mode: 'secret',
      initial: current,
      hint: 'Stored locally (GM → localStorage → memory). Validate sends GET /v1/models.',
      onSave: async (val) => { await storage.set(STORAGE_KEYS.OPENAI_KEY, val); },
      onValidate: async (val) => {
        const { xhrGet } = await import('./modules/api.js');
        const key = val || await storage.get(STORAGE_KEYS.OPENAI_KEY, '');
        if (!key) { openInfo('No key to test'); return; }
        try { await xhrGet('https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` }); openInfo('Validation OK (HTTP 200)'); }
        catch (e) { openInfo(`Validation failed: ${e.message || e}`); }
      }
    });
  });
  GM_registerMenuCommand?.('Configure API pricing', () => openPricingDialog(storage, PRICING, updatePricing, resetPricingToDefaults, openInfo));

  GM_registerMenuCommand?.('Edit GLOBAL target selectors', () => {
    openEditor({
      title: 'Global target selectors (all domains)',
      mode: 'list',
      initial: SELECTORS_GLOBAL,
      hint: 'One CSS selector per line (e.g., h1, h2, h3, .lead). Applied to all domains.',
      onSave: async (lines) => {
        const clean = lines.filter(Boolean).map(s => s.trim()).filter(Boolean);
        SELECTORS_GLOBAL = clean.length ? clean : DEFAULT_SELECTORS.slice();
        await storage.set(STORAGE_KEYS.SELECTORS, JSON.stringify(SELECTORS_GLOBAL));
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
        await storage.set(STORAGE_KEYS.EXCLUDES, JSON.stringify(EXCLUDE_GLOBAL));
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
        await storage.set(STORAGE_KEYS.EXCLUDES, JSON.stringify(EXCLUDE_GLOBAL));
        location.reload();
      }
    });
  });

  GM_registerMenuCommand?.(`Edit DOMAIN additions: target selectors (${HOST})`, () => {
    openEditor({
      title: `Domain-specific target selectors for ${HOST}`,
      mode: 'domain',
      initial: SELECTORS_DOMAIN,
      globalItems: SELECTORS_GLOBAL,
      hint: 'Domain-specific selectors are added to global ones. Edit only the bottom section.',
      onSave: async (lines) => {
        DOMAIN_SELECTORS[HOST] = lines;
        await storage.set(STORAGE_KEYS.DOMAIN_SELECTORS, JSON.stringify(DOMAIN_SELECTORS));
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
        await storage.set(STORAGE_KEYS.DOMAIN_EXCLUDES, JSON.stringify(DOMAIN_EXCLUDES));
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
        await storage.set(STORAGE_KEYS.DOMAIN_EXCLUDES, JSON.stringify(DOMAIN_EXCLUDES));
        location.reload();
      }
    });
  });

  GM_registerMenuCommand?.('--- Domain Controls ---', () => {});
  GM_registerMenuCommand?.(
    DOMAINS_MODE === 'allow' ? 'Domain mode: Allowlist only' : 'Domain mode: All domains with Denylist',
    async () => {
      DOMAINS_MODE = (DOMAINS_MODE === 'allow') ? 'deny' : 'allow';
      await storage.set(STORAGE_KEYS.DOMAINS_MODE, DOMAINS_MODE);
      location.reload();
    }
  );
  GM_registerMenuCommand?.(
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

  GM_registerMenuCommand?.('--- Toggles ---', () => {});
  GM_registerMenuCommand?.(`Neutralization strength (${TEMPERATURE_LEVEL})`, () => openTemperatureDialog(storage, TEMPERATURE_LEVEL, setTemperature));
  GM_registerMenuCommand?.(`Toggle auto-detect (${CFG.autoDetect ? 'ON' : 'OFF'})`, async () => { await setAutoDetect(!CFG.autoDetect); });
  GM_registerMenuCommand?.(`Toggle DEBUG logs (${CFG.DEBUG ? 'ON' : 'OFF'})`, async () => { await setDebug(!CFG.DEBUG); });
  GM_registerMenuCommand?.(`Toggle badge (${SHOW_BADGE ? 'ON' : 'OFF'})`, async () => { await setShowBadge(!SHOW_BADGE); });

  GM_registerMenuCommand?.('--- Actions ---', () => {});
  GM_registerMenuCommand?.('Show stats & changes (diff audit)', () => showDiffAudit(STATS, CHANGES, cache.cache, API_TOKENS, PRICING, calculateApiCost, escapeHtml, UI_ATTR));
  GM_registerMenuCommand?.('Process visible now', () => { processVisibleNow(); });
  GM_registerMenuCommand?.('Flush headline cache & rerun', async () => { await cache.clear(); resetAndReindex(); processVisibleNow(); });
  if (LONG_HEADLINE_EXCEPTIONS[HOST]) {
    GM_registerMenuCommand?.(`Clear long headline exception (${HOST})`, async () => {
      if (confirm(`Clear the long headline exception for ${HOST}?\n\nYou'll be prompted again if selectors match text longer than ${CFG.sanityCheckLen} characters.`)) {
        delete LONG_HEADLINE_EXCEPTIONS[HOST];
        await storage.set(STORAGE_KEYS.LONG_HEADLINE_EXCEPTIONS, JSON.stringify(LONG_HEADLINE_EXCEPTIONS));
        openInfo(`Cleared long headline exception for ${HOST}.\n\nReload the page to see changes.`);
      }
    });
  }
  GM_registerMenuCommand?.('Reset stats counters', () => { STATS.total = STATS.live = STATS.cache = STATS.batches = 0; CHANGES.length = 0; updateBadgeCounts(); });
  GM_registerMenuCommand?.('Reset API usage stats', async () => { await resetApiTokens(storage); openInfo('API usage stats reset. Token counters and cost tracking cleared.'); });

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
  ensureBadge(
    DOMAIN_DISABLED,
    OPTED_OUT,
    SHOW_BADGE,
    BADGE_COLLAPSED,
    BADGE_POS,
    storage,
    () => enterInspectionMode(SELECTORS, HOST, SELECTORS_GLOBAL, SELECTORS_DOMAIN, EXCLUDE_GLOBAL, EXCLUDE_DOMAIN, EXCLUDE, storage, DOMAIN_SELECTORS, DOMAIN_EXCLUDES, openInfo),
    restoreOriginals,
    () => reapplyFromCache(
      textToElements,
      (t) => cache.get(t),
      buildMap,
      (map, originals, rewrites, source, freshSeenEl) => applyRewrites(map, originals, rewrites, source, STATS, CHANGES, freshSeenEl, updateBadgeCounts)
    )
  );
  attachTargets(document);
  ensureObserver();

  const mo = new MutationObserver((muts) => {
    ensureBadge(
      DOMAIN_DISABLED,
      OPTED_OUT,
      SHOW_BADGE,
      BADGE_COLLAPSED,
      BADGE_POS,
      storage,
      () => enterInspectionMode(SELECTORS, HOST, SELECTORS_GLOBAL, SELECTORS_DOMAIN, EXCLUDE_GLOBAL, EXCLUDE_DOMAIN, EXCLUDE, storage, DOMAIN_SELECTORS, DOMAIN_EXCLUDES, openInfo),
      restoreOriginals,
      () => reapplyFromCache(
        textToElements,
        (t) => cache.get(t),
        buildMap,
        (map, originals, rewrites, source, freshSeenEl) => applyRewrites(map, originals, rewrites, source, STATS, CHANGES, freshSeenEl, updateBadgeCounts)
      )
    );
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) {
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1) attachTargets(n);
        });
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  processVisibleNow();
})();
