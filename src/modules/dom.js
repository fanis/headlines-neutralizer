/**
 * DOM manipulation, headline detection, and element replacement
 */

import { CFG, CARD_SELECTOR, UI_ATTR } from './config.js';
import { log, textTrim, withinLen, normalizeSpace, isVisible, quoteProtect } from './utils.js';
import { compiledSelectors } from './selectors.js';
import { computeCandidateScore, isHardRejectText } from './scoring.js';

/**
 * Ensure highlight CSS is injected
 */
export function ensureHighlightCSS() {
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
      box-sizing: border-box !important; width: max-content !important; min-width: 90px !important;
      margin: 0 !important; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      user-select: none !important; }
    .neutralizer-badge.neutralizer-collapsed { right: 0 !important; left: auto !important;
      transform: translateX(100%) !important; border-right: none !important;
      border-radius: 10px 0 0 10px !important; box-shadow: -4px 0 22px rgba(0,0,0,.18) !important; }
    .neutralizer-badge.neutralizer-dragging { transition: none !important; cursor: grabbing !important; }
    .neutralizer-badge .badge-handle { position: absolute !important; left: -28px !important; top: 50% !important;
      transform: translateY(-50%) !important; width: 28px !important; height: 56px !important;
      background: linear-gradient(90deg, #d4f8e8 0%, #c9f6e1 100%) !important; border: 1px solid #79d4b0 !important;
      border-radius: 8px 0 0 8px !important; cursor: pointer !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      font-size: 14px !important; color: #0b3d2c !important; user-select: none !important;
      box-shadow: -3px 0 12px rgba(0,0,0,.12) !important; transition: all 0.15s ease !important; }
    .neutralizer-badge .badge-handle:hover { left: -31px !important; width: 31px !important;
      box-shadow: -4px 0 16px rgba(0,0,0,.18) !important; }
    .neutralizer-badge .badge-header { background: linear-gradient(135deg, #2d6a54 0%, #0b3d2c 100%) !important;
      color: #fff !important; padding: 4px 8px !important; font-size: 9px !important;
      font-weight: 600 !important; text-align: center !important; cursor: grab !important;
      user-select: none !important; border-radius: 9px 9px 0 0 !important;
      letter-spacing: 0.3px !important; line-height: 1.3 !important; white-space: pre-line !important; }
    .neutralizer-badge .badge-header:active { cursor: grabbing !important; }
    .neutralizer-badge .badge-content { display: flex !important; flex-direction: column !important;
      gap: 4px !important; padding: 6px 8px !important; }
    .neutralizer-badge * { box-sizing: border-box !important; }
    .neutralizer-badge .neutralizer-row { display: flex !important; gap: 8px !important; align-items: center !important;
      justify-content: center !important; margin: 0 !important; padding: 0 !important; width: 100%; }
    .neutralizer-badge .neutralizer-btn { cursor: pointer !important; padding: 5px 8px !important; border-radius: 6px !important;
      border: 1px solid #79d4b0 !important; background: #fff !important; box-sizing: border-box !important;
      white-space: nowrap !important; font-family: system-ui, sans-serif !important;
      font-size: 11px !important; line-height: 1.2 !important; color: #0b3d2c !important;
      margin: 0 !important; min-width: 0 !important; width: 100% !important; }
    .neutralizer-badge .neutralizer-btn.neutralizer-primary { background: #0b3d2c !important; color: #fff !important;
      border-color: #0b3d2c !important; }
    .neutralizer-badge .neutralizer-btn:disabled { opacity: 0.6 !important; cursor: not-allowed !important; }
    .neutralizer-badge .neutralizer-small { font-size: 11px !important; opacity: .9 !important; }

    /* Status row */
    .neutralizer-badge .neutralizer-status-row { display: flex !important; align-items: center !important;
      justify-content: space-between !important; gap: 6px !important; margin: 0 !important;
      padding: 0 !important; width: 100% !important; }
    .neutralizer-badge .neutralizer-status { font: 10px/1.2 system-ui, sans-serif !important;
      color: #666 !important; letter-spacing: 0.2px !important; }

    /* Gear icon button */
    .neutralizer-badge .neutralizer-gear-btn { background: none !important; border: none !important;
      cursor: pointer !important; padding: 2px 4px !important; border-radius: 4px !important;
      font-size: 14px !important; line-height: 1 !important; color: #0b3d2c !important;
      margin: 0 !important; min-width: 0 !important; width: auto !important;
      transition: background 0.15s ease !important; display: flex !important;
      align-items: center !important; justify-content: center !important; }
    .neutralizer-badge .neutralizer-gear-btn:hover { background: rgba(11,61,44,0.1) !important; }

    /* Popover container */
    .neutralizer-badge .neutralizer-popover { position: absolute !important; right: 0 !important;
      min-width: 200px !important;
      background: #fff !important; border: 1px solid #d0d0d0 !important; border-radius: 10px !important;
      box-shadow: 0 8px 30px rgba(0,0,0,0.2) !important; padding: 6px 0 !important;
      display: none !important; z-index: 2147483647 !important;
      font: 12px/1.4 system-ui, sans-serif !important; color: #1a1a1a !important; }
    .neutralizer-badge .neutralizer-popover.neutralizer-popover-open { display: block !important; }

    /* Popover menu item button */
    .neutralizer-badge .neutralizer-popover-item { display: block !important; width: 100% !important;
      padding: 8px 14px !important; border: none !important; background: none !important;
      text-align: left !important; cursor: pointer !important; font: 13px/1.3 system-ui, sans-serif !important;
      color: #1a1a1a !important; white-space: nowrap !important; box-sizing: border-box !important;
      margin: 0 !important; border-radius: 0 !important; }
    .neutralizer-badge .neutralizer-popover-item:hover { background: #f0f0f0 !important; }

    /* Popover separator */
    .neutralizer-badge .neutralizer-popover-sep { border: none !important;
      border-top: 1px solid #e0e0e0 !important; margin: 4px 0 !important; padding: 0 !important; }

    /* Settings group (label + segmented row) */
    .neutralizer-badge .neutralizer-popover-group { padding: 6px 14px !important; margin: 0 !important; }
    .neutralizer-badge .neutralizer-popover-label { font: 600 11px/1.2 system-ui, sans-serif !important;
      color: #666 !important; margin: 0 0 4px !important; text-transform: uppercase !important;
      letter-spacing: 0.3px !important; display: block !important; }

    /* Segmented control row */
    .neutralizer-badge .neutralizer-popover-seg { display: flex !important; gap: 0 !important;
      border: 1px solid #79d4b0 !important; border-radius: 6px !important; overflow: hidden !important;
      margin: 0 !important; }

    /* Segmented option button */
    .neutralizer-badge .neutralizer-popover-option { flex: 1 !important; padding: 5px 8px !important;
      border: none !important; border-right: 1px solid #79d4b0 !important;
      background: #fff !important; cursor: pointer !important;
      font: 11px/1.2 system-ui, sans-serif !important; color: #0b3d2c !important;
      text-align: center !important; white-space: nowrap !important; margin: 0 !important;
      border-radius: 0 !important; min-width: 0 !important; }
    .neutralizer-badge .neutralizer-popover-option:last-child { border-right: none !important; }
    .neutralizer-badge .neutralizer-popover-option:hover { background: #e8f5e9 !important; }
    .neutralizer-badge .neutralizer-popover-option.neutralizer-popover-active {
      background: #0b3d2c !important; color: #fff !important; }

    /* Show Included Elements overlay banner */
    .neutralizer-included-banner { position: fixed !important; top: 0 !important; left: 0 !important;
      right: 0 !important; z-index: 2147483647 !important; padding: 10px 20px !important;
      background: #0b3d2c !important; color: #fff !important;
      font: 600 14px/1.4 system-ui, sans-serif !important; text-align: center !important;
      cursor: pointer !important; box-shadow: 0 4px 16px rgba(0,0,0,0.25) !important; }
  `;
  document.head.appendChild(style);
}

/**
 * Check if element should be excluded
 */
export function isExcluded(el, EXCLUDE) {
  if (el.closest?.(`[${UI_ATTR}]`)) return true;
  if (el.closest('input, textarea, [contenteditable=""], [contenteditable="true"]')) return true;
  if (EXCLUDE.self.length && el.matches?.(EXCLUDE.self.join(','))) return true;
  if (EXCLUDE.ancestors.length && el.closest?.(EXCLUDE.ancestors.join(','))) return true;
  return false;
}

/**
 * Find the best text-containing child element
 */
export function findTextHost(el) {
  const p = el.querySelector(':scope > p');
  if (p && withinLen(textTrim(p))) return p;
  const a = el.querySelector(':scope > a');
  if (a && withinLen(textTrim(a))) return a;
  const kids = Array.from(el.children);
  if (kids.length === 1 && textTrim(kids[0]) === textTrim(el)) return kids[0];
  let best = null, bestLen = 0;
  for (const c of kids) {
    const L = textTrim(c).length;
    if (L > bestLen) { best = c; bestLen = L; }
  }
  return best && bestLen ? best : el;
}

/**
 * Get manually matched elements via selectors
 */
export function getManualMatches(root, SELECTORS) {
  if (!SELECTORS.length) return [];
  try {
    return [...root.querySelectorAll(compiledSelectors(SELECTORS))];
  } catch (e) {
    log('manual selector error:', e.message || e, 'selectors=', SELECTORS);
    return [];
  }
}

/**
 * Discover headline candidates using heuristics
 */
export function discoverCandidates(root, EXCLUDE) {
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
      if (!el || seen.has(el) || !isVisible(el) || isExcluded(el, EXCLUDE)) continue;
      seen.add(el);
      candEls.push(el);
    }
  }

  const scored = [];
  for (const el of candEls) {
    const host = findTextHost(el);
    if (!host || isExcluded(host, EXCLUDE)) continue;
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
    arr.sort((a, b) => b.score - a.score);
    winners.push(...arr.slice(0, CFG.topKPerCard));
  }

  const bestByText = new Map();
  for (const w of winners) {
    const k = w.text;
    if (!bestByText.has(k) || w.score > bestByText.get(k).score) bestByText.set(k, w);
  }

  if (CFG.DEBUG_SCORES) {
    const top = [...bestByText.values()].sort((a, b) => b.score - a.score).slice(0, 20);
    log('top candidates:', top.map(x => ({ score: x.score, text: x.text.slice(0, 120) })));
  }

  return [...bestByText.values()].map(x => x.host);
}

/**
 * Get all candidate elements (manual + auto)
 */
export function getCandidateElements(root, SELECTORS, EXCLUDE) {
  const manual = getManualMatches(root, SELECTORS).map(el => ({ el: findTextHost(el), mode: 'manual' }));
  const auto = discoverCandidates(root, EXCLUDE).map(el => ({ el, mode: 'auto' }));
  const uniq = [];
  const seen = new Set();
  for (const rec of [...manual, ...auto]) {
    const el = rec.el;
    if (!el || isExcluded(el, EXCLUDE)) continue;
    if (seen.has(el)) continue;
    seen.add(el);
    uniq.push(rec);
  }
  return uniq;
}

/**
 * Apply rewrites to elements
 */
export function applyRewrites(map, originals, rewrites, source, STATS, CHANGES, seenEl, updateBadgeCounts) {
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
      if (seenEl.has(host)) continue;
      const before = textTrim(host);
      if (!before) continue;

      if (!host.hasAttribute('data-neutralizer-original')) {
        host.setAttribute('data-neutralizer-original', before);
      }
      if (CFG.showOriginalOnHover && !host.hasAttribute('title')) {
        host.setAttribute('title', before);
      }

      host.textContent = to;
      host.setAttribute('data-neutralizer-changed', '1');
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

/**
 * Restore original text
 */
export function restoreOriginals() {
  const els = document.querySelectorAll('[data-neutralizer-changed="1"][data-neutralizer-original]');
  let n = 0;
  els.forEach(el => {
    const orig = el.getAttribute('data-neutralizer-original');
    if (typeof orig === 'string') { el.textContent = orig; n++; }
  });
  log('restored originals on', n, 'elements');
}
