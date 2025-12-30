/**
 * Inspection mode functionality for debugging headline detection
 */

import { UI_ATTR, CFG, CARD_SELECTOR, UI_CONTAINERS, STORAGE_KEYS } from './config.js';
import { textTrim, normalizeSpace, withinLen, escapeHtml } from './utils.js';
import { compiledSelectors } from './selectors.js';
import { isLikelyKicker } from './scoring.js';
import { isExcluded } from './dom.js';

let inspectionOverlay = null;
let inspectedElement = null;

/**
 * Find the most specific/deepest meaningful element at coordinates
 */
function findMostSpecificElement(x, y, SELECTORS) {
  const elements = document.elementsFromPoint(x, y);
  const filtered = elements.filter(el => !el.closest(`[${UI_ATTR}]`));
  if (!filtered.length) return null;

  const selectors = compiledSelectors(SELECTORS);

  for (const el of filtered) {
    const hasDirectText = Array.from(el.childNodes).some(
      node => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0
    );

    const matchesSelector = selectors && el.matches?.(selectors);
    const hasMeaningfulAttrs = el.hasAttribute('title') || el.hasAttribute('alt') ||
      el.hasAttribute('data-neutralizer-original');

    const isContentElement = /^(H[1-6]|P|SPAN|A|DIV)$/i.test(el.tagName);
    const hasTextContent = el.textContent.trim().length > 0;

    if (hasDirectText || matchesSelector || hasMeaningfulAttrs ||
      (isContentElement && hasTextContent && el.children.length === 0)) {
      return el;
    }
  }

  for (const el of filtered) {
    if (el.textContent.trim().length > 0) {
      return el;
    }
  }

  return filtered[0];
}

/**
 * Enter inspection mode
 */
export function enterInspectionMode(SELECTORS, HOST, SELECTORS_GLOBAL, SELECTORS_DOMAIN, EXCLUDE_GLOBAL, EXCLUDE_DOMAIN, EXCLUDE, storage, DOMAIN_SELECTORS, DOMAIN_EXCLUDES, openInfo) {
  if (inspectionOverlay) return;

  const overlay = document.createElement('div');
  overlay.setAttribute(UI_ATTR, '');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483645;
    background: rgba(0, 0, 0, 0.3);
    font-family: system-ui, sans-serif;
    pointer-events: none;
  `;

  const message = document.createElement('div');
  message.setAttribute(UI_ATTR, '');
  message.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: #1a73e8; color: white; padding: 12px 24px;
    border-radius: 8px; font-size: 14px; font-weight: 600;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 2147483646;
    pointer-events: none;
  `;
  message.textContent = '🔍 Inspection Mode - Click any element to analyze. ESC to exit.';

  const originalCursor = document.body.style.cursor;
  document.body.style.cursor = 'crosshair';

  document.body.appendChild(overlay);
  document.body.appendChild(message);
  inspectionOverlay = { overlay, message, originalCursor };

  let currentHighlight = null;
  const onMouseMove = (e) => {
    const target = findMostSpecificElement(e.clientX, e.clientY, SELECTORS);
    if (!target) return;

    if (currentHighlight && currentHighlight !== target) {
      currentHighlight.style.outline = currentHighlight._origOutline || '';
      currentHighlight.style.outlineOffset = currentHighlight._origOutlineOffset || '';
      delete currentHighlight._origOutline;
      delete currentHighlight._origOutlineOffset;
    }

    if (currentHighlight !== target) {
      currentHighlight = target;
      currentHighlight._origOutline = currentHighlight.style.outline;
      currentHighlight._origOutlineOffset = currentHighlight.style.outlineOffset;
      currentHighlight.style.outline = '2px dashed #1a73e8';
      currentHighlight.style.outlineOffset = '2px';
    }
  };

  const onClick = (e) => {
    const target = findMostSpecificElement(e.clientX, e.clientY, SELECTORS);
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();

    inspectedElement = target;

    if (currentHighlight) {
      currentHighlight.style.outline = currentHighlight._origOutline || '';
      currentHighlight.style.outlineOffset = currentHighlight._origOutlineOffset || '';
      delete currentHighlight._origOutline;
      delete currentHighlight._origOutlineOffset;
    }

    inspectedElement._origOutline = inspectedElement.style.outline;
    inspectedElement._origOutlineOffset = inspectedElement.style.outlineOffset;
    inspectedElement.style.outline = '3px solid #ea4335';
    inspectedElement.style.outlineOffset = '2px';

    exitInspectionMode();
    showDiagnosticDialog(inspectedElement, HOST, SELECTORS_GLOBAL, SELECTORS_DOMAIN, EXCLUDE_GLOBAL, EXCLUDE_DOMAIN, EXCLUDE, storage, DOMAIN_SELECTORS, DOMAIN_EXCLUDES, openInfo);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      exitInspectionMode();
    }
  };

  document.body.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown);

  inspectionOverlay.onMouseMove = onMouseMove;
  inspectionOverlay.onClick = onClick;
  inspectionOverlay.onKeyDown = onKeyDown;
  inspectionOverlay.currentHighlight = () => currentHighlight;
}

/**
 * Exit inspection mode
 */
export function exitInspectionMode() {
  if (!inspectionOverlay) return;

  const { overlay, message, onMouseMove, onClick, onKeyDown, currentHighlight, originalCursor } = inspectionOverlay;

  const el = currentHighlight?.();
  if (el) {
    el.style.outline = el._origOutline || '';
    el.style.outlineOffset = el._origOutlineOffset || '';
    delete el._origOutline;
    delete el._origOutlineOffset;
  }

  document.body.style.cursor = originalCursor;

  document.body.removeEventListener('mousemove', onMouseMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown);

  overlay.remove();
  message.remove();

  inspectionOverlay = null;
}

/**
 * Diagnose element for headline detection
 */
function diagnoseElement(el, SELECTORS_GLOBAL, SELECTORS_DOMAIN, EXCLUDE_GLOBAL, EXCLUDE_DOMAIN, EXCLUDE) {
  const text = textTrim(el);
  const selector = generateCSSSelector(el);

  const autoDetect = {
    matched: false,
    reasons: []
  };

  if (el.closest(`[${UI_ATTR}]`)) {
    autoDetect.reasons.push('Part of script\'s own UI');
  } else if (el.closest('input, textarea, [contenteditable=""], [contenteditable="true"]')) {
    autoDetect.reasons.push('Editable element (input/textarea)');
  } else {
    const cardParent = el.closest(CARD_SELECTOR);
    if (cardParent) autoDetect.reasons.push('✓ Inside card/article container');

    const tag = el.tagName.toLowerCase();
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a'].includes(tag)) {
      autoDetect.reasons.push(`✓ Headline tag: <${tag}>`);
    }

    if (withinLen(text)) {
      autoDetect.reasons.push(`✓ Length OK (${text.length} chars)`);
    } else {
      autoDetect.reasons.push(`✗ Length ${text.length} chars (need ${CFG.minLen}-${CFG.maxLen})`);
    }

    if (isLikelyKicker(el, text)) {
      autoDetect.reasons.push('✗ Detected as kicker/label (excluded)');
    }

    if (el.closest(UI_CONTAINERS)) {
      autoDetect.reasons.push('✗ Inside UI container (meta/byline/tools)');
    }

    autoDetect.matched = cardParent && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a'].includes(tag) &&
      withinLen(text) && !isLikelyKicker(el, text) && !el.closest(UI_CONTAINERS);
  }

  const globalSelectors = findMatchingSelectors(el, SELECTORS_GLOBAL);
  const domainSelectors = findMatchingSelectors(el, SELECTORS_DOMAIN);
  const globalExclusions = findMatchingExclusions(el, EXCLUDE_GLOBAL);
  const domainExclusions = findMatchingExclusions(el, EXCLUDE_DOMAIN);

  const hasOptOut = document.querySelector('meta[name="neutralizer"][content="opt-out"]') !== null;
  const isProcessed = !isExcluded(el, EXCLUDE) && (autoDetect.matched || globalSelectors.length > 0 || domainSelectors.length > 0);

  return {
    element: el,
    selector,
    text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
    tag: el.tagName.toLowerCase(),
    classes: Array.from(el.classList).join(' '),
    id: el.id,
    autoDetect,
    globalSelectors,
    domainSelectors,
    globalExclusions,
    domainExclusions,
    hasOptOut,
    isExcluded: isExcluded(el, EXCLUDE),
    isProcessed
  };
}

/**
 * Find matching selectors
 */
function findMatchingSelectors(el, selectorList) {
  const matches = [];
  for (const sel of selectorList) {
    try {
      if (el.matches(sel)) {
        matches.push(sel);
      }
    } catch (e) {
      // Invalid selector, skip
    }
  }
  return matches;
}

/**
 * Find matching exclusions
 */
function findMatchingExclusions(el, excludeObj) {
  const matches = { self: [], ancestors: [] };

  if (excludeObj.self) {
    for (const sel of excludeObj.self) {
      try {
        if (el.matches(sel)) {
          matches.self.push(sel);
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
  }

  if (excludeObj.ancestors) {
    for (const sel of excludeObj.ancestors) {
      try {
        if (el.closest(sel)) {
          matches.ancestors.push(sel);
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
  }

  return matches;
}

/**
 * Generate CSS selector for element
 */
function generateCSSSelector(el) {
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }

  if (el.classList.length > 0) {
    const classes = Array.from(el.classList).map(c => `.${CSS.escape(c)}`).join('');
    return `${el.tagName.toLowerCase()}${classes}`;
  }

  let path = [];
  let current = el;
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }

    let sibling = current;
    let nth = 1;
    while (sibling.previousElementSibling) {
      sibling = sibling.previousElementSibling;
      if (sibling.tagName === current.tagName) nth++;
    }

    if (nth > 1 || current.nextElementSibling) {
      selector += `:nth-child(${nth})`;
    }

    path.unshift(selector);
    current = current.parentElement;

    if (path.length > 3) break;
  }

  return path.join(' > ');
}

/**
 * Show diagnostic dialog
 */
function showDiagnosticDialog(el, HOST, SELECTORS_GLOBAL, SELECTORS_DOMAIN, EXCLUDE_GLOBAL, EXCLUDE_DOMAIN, EXCLUDE, storage, DOMAIN_SELECTORS, DOMAIN_EXCLUDES, openInfo) {
  const diag = diagnoseElement(el, SELECTORS_GLOBAL, SELECTORS_DOMAIN, EXCLUDE_GLOBAL, EXCLUDE_DOMAIN, EXCLUDE);

  const host = document.createElement('div');
  host.setAttribute(UI_ATTR, '');
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .wrap { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.55);
            display: flex; align-items: center; justify-content: center; }
    .modal { background: #fff; max-width: 700px; width: 94%; max-height: 90vh;
             overflow-y: auto; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,.4);
             padding: 20px; box-sizing: border-box; }
    .modal h3 { margin: 0 0 16px; font: 700 18px/1.3 system-ui, sans-serif; color: #1a1a1a; }
    .section { margin: 16px 0; padding: 12px; background: #f8f9fa; border-radius: 8px; }
    .section-title { font: 600 14px system-ui, sans-serif; margin: 0 0 8px; color: #444; }
    .info-row { margin: 4px 0; font: 13px/1.5 ui-monospace, Consolas, monospace; color: #666; }
    .info-label { font-weight: 600; color: #333; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 6px; font: 600 13px system-ui, sans-serif;
              margin: 8px 0; }
    .status.processed { background: #d4edda; color: #155724; }
    .status.not-processed { background: #f8d7da; color: #721c24; }
    .status.excluded { background: #fff3cd; color: #856404; }
    .list { margin: 8px 0; padding-left: 20px; }
    .list li { margin: 4px 0; font: 13px/1.5 system-ui, sans-serif; }
    .list li.match { color: #155724; }
    .list li.no-match { color: #666; }
    .list li.problem { color: #721c24; font-weight: 600; }
    .code { background: #f1f3f4; padding: 2px 6px; border-radius: 4px;
            font: 12px ui-monospace, Consolas, monospace; color: #333; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; }
    .btn { padding: 10px 16px; border-radius: 8px; border: none;
           font: 600 13px system-ui, sans-serif; cursor: pointer; transition: all 0.15s ease; }
    .btn.primary { background: #1a73e8; color: #fff; }
    .btn.primary:hover { background: #1557b0; }
    .btn.secondary { background: #e8eaed; color: #1a1a1a; }
    .btn.secondary:hover { background: #dadce0; }
    .btn.success { background: #34a853; color: #fff; }
    .btn.success:hover { background: #2d8e47; }
    .btn.danger { background: #ea4335; color: #fff; }
    .btn.danger:hover { background: #d33426; }
  `;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  let statusClass, statusText;
  if (diag.isExcluded) {
    statusClass = 'excluded';
    statusText = '⚠️ EXCLUDED - Not being processed';
  } else if (diag.isProcessed) {
    statusClass = 'processed';
    statusText = '✅ MATCHED - Being processed';
  } else {
    statusClass = 'not-processed';
    statusText = '❌ NOT MATCHED - Not being processed';
  }

  const autoDetectHTML = diag.autoDetect.reasons.length > 0 ?
    `<ul class="list">${diag.autoDetect.reasons.map(r => `<li class="${r.startsWith('✓') ? 'match' : 'no-match'}">${r}</li>`).join('')}</ul>` :
    '<p class="info-row">No auto-detection analysis available.</p>';

  const globalSelectorsHTML = diag.globalSelectors.length > 0 ?
    `<ul class="list">${diag.globalSelectors.map(s => `<li class="match">✓ <span class="code">${escapeHtml(s)}</span></li>`).join('')}</ul>` :
    '<p class="info-row no-match">No global selectors match this element.</p>';

  const domainSelectorsHTML = diag.domainSelectors.length > 0 ?
    `<ul class="list">${diag.domainSelectors.map(s => `<li class="match">✓ <span class="code">${escapeHtml(s)}</span></li>`).join('')}</ul>` :
    '<p class="info-row no-match">No domain selectors configured or matched.</p>';

  const globalExclusionsHTML = (diag.globalExclusions.self.length > 0 || diag.globalExclusions.ancestors.length > 0) ?
    `<ul class="list">
      ${diag.globalExclusions.self.map(s => `<li class="problem">✗ Element matches: <span class="code">${escapeHtml(s)}</span></li>`).join('')}
      ${diag.globalExclusions.ancestors.map(s => `<li class="problem">✗ Ancestor matches: <span class="code">${escapeHtml(s)}</span></li>`).join('')}
    </ul>` :
    '<p class="info-row no-match">No global exclusions affect this element.</p>';

  const domainExclusionsHTML = (diag.domainExclusions.self?.length > 0 || diag.domainExclusions.ancestors?.length > 0) ?
    `<ul class="list">
      ${(diag.domainExclusions.self || []).map(s => `<li class="problem">✗ Element matches: <span class="code">${escapeHtml(s)}</span></li>`).join('')}
      ${(diag.domainExclusions.ancestors || []).map(s => `<li class="problem">✗ Ancestor matches: <span class="code">${escapeHtml(s)}</span></li>`).join('')}
    </ul>` :
    '<p class="info-row no-match">No domain exclusions configured or affect this element.</p>';

  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Element Inspection">
      <h3>🔍 Element Inspection</h3>

      <div class="section">
        <div class="section-title">Element Information</div>
        <div class="info-row"><span class="info-label">Tag:</span> &lt;${diag.tag}&gt;</div>
        <div class="info-row"><span class="info-label">ID:</span> ${diag.id || '(none)'}</div>
        <div class="info-row"><span class="info-label">Classes:</span> ${diag.classes || '(none)'}</div>
        <div class="info-row"><span class="info-label">Text:</span> "${escapeHtml(diag.text)}"</div>
        <div class="info-row"><span class="info-label">CSS Selector:</span> <span class="code">${escapeHtml(diag.selector)}</span></div>
      </div>

      <div class="status ${statusClass}">${statusText}</div>

      <div class="section">
        <div class="section-title">Auto-Detection Analysis</div>
        ${autoDetectHTML}
      </div>

      <div class="section">
        <div class="section-title">Global Selectors</div>
        ${globalSelectorsHTML}
      </div>

      <div class="section">
        <div class="section-title">Domain Selectors (${HOST})</div>
        ${domainSelectorsHTML}
      </div>

      <div class="section">
        <div class="section-title">Global Exclusions</div>
        ${globalExclusionsHTML}
      </div>

      <div class="section">
        <div class="section-title">Domain Exclusions (${HOST})</div>
        ${domainExclusionsHTML}
      </div>

      ${diag.hasOptOut ? '<div class="section"><div class="section-title">⚠️ Publisher Opt-Out Detected</div><p class="info-row">This page has requested to opt-out from neutralization.</p></div>' : ''}

      <div class="actions">
        ${buildActionButtons(diag, HOST)}
        <button class="btn secondary copy-selector">📋 Copy Selector</button>
        <button class="btn secondary close">Close</button>
      </div>
    </div>
  `;

  shadow.append(style, wrap);
  document.body.appendChild(host);

  const close = () => {
    if (inspectedElement) {
      inspectedElement.style.outline = inspectedElement._origOutline || '';
      inspectedElement.style.outlineOffset = inspectedElement._origOutlineOffset || '';
      delete inspectedElement._origOutline;
      delete inspectedElement._origOutlineOffset;
      inspectedElement = null;
    }
    host.remove();
  };

  shadow.querySelector('.close').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });

  shadow.querySelector('.copy-selector').addEventListener('click', () => {
    navigator.clipboard.writeText(diag.selector).then(() => {
      const btn = shadow.querySelector('.copy-selector');
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => btn.textContent = orig, 2000);
    });
  });

  attachActionHandlers(shadow, diag, close, storage, DOMAIN_SELECTORS, DOMAIN_EXCLUDES, HOST, SELECTORS_GLOBAL, EXCLUDE_GLOBAL, openInfo);

  wrap.setAttribute('tabindex', '-1');
  wrap.focus();
}

/**
 * Build action buttons for diagnostic dialog
 */
function buildActionButtons(diag, HOST) {
  const buttons = [];

  if (diag.globalExclusions.self.length > 0) {
    diag.globalExclusions.self.forEach(sel => {
      buttons.push(`<button class="btn danger remove-global-excl-self" data-selector="${escapeHtml(sel)}">Remove Global Exclusion: ${escapeHtml(sel)}</button>`);
    });
  }
  if (diag.globalExclusions.ancestors.length > 0) {
    diag.globalExclusions.ancestors.forEach(sel => {
      buttons.push(`<button class="btn danger remove-global-excl-anc" data-selector="${escapeHtml(sel)}">Remove Global Ancestor Exclusion: ${escapeHtml(sel)}</button>`);
    });
  }

  if (diag.domainExclusions.self?.length > 0) {
    diag.domainExclusions.self.forEach(sel => {
      buttons.push(`<button class="btn danger remove-domain-excl-self" data-selector="${escapeHtml(sel)}">Remove Domain Exclusion: ${escapeHtml(sel)}</button>`);
    });
  }
  if (diag.domainExclusions.ancestors?.length > 0) {
    diag.domainExclusions.ancestors.forEach(sel => {
      buttons.push(`<button class="btn danger remove-domain-excl-anc" data-selector="${escapeHtml(sel)}">Remove Domain Ancestor Exclusion: ${escapeHtml(sel)}</button>`);
    });
  }

  if (!diag.isProcessed && !diag.isExcluded) {
    buttons.push(`<button class="btn success add-global-sel">Add as Global Selector</button>`);
    buttons.push(`<button class="btn success add-domain-sel">Add as Domain Selector</button>`);
  }

  return buttons.join('');
}

/**
 * Attach action handlers for diagnostic dialog
 */
function attachActionHandlers(shadow, diag, closeDialog, storage, DOMAIN_SELECTORS, DOMAIN_EXCLUDES, HOST, SELECTORS_GLOBAL, EXCLUDE_GLOBAL, openInfo) {
  // Remove global exclusions
  shadow.querySelectorAll('.remove-global-excl-self').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sel = btn.getAttribute('data-selector');
      EXCLUDE_GLOBAL.self = EXCLUDE_GLOBAL.self.filter(s => s !== sel);
      await storage.set(STORAGE_KEYS.EXCLUDES, JSON.stringify(EXCLUDE_GLOBAL));
      openInfo(`Removed global exclusion: ${sel}\nReload the page to see changes.`);
      closeDialog();
    });
  });

  shadow.querySelectorAll('.remove-global-excl-anc').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sel = btn.getAttribute('data-selector');
      EXCLUDE_GLOBAL.ancestors = EXCLUDE_GLOBAL.ancestors.filter(s => s !== sel);
      await storage.set(STORAGE_KEYS.EXCLUDES, JSON.stringify(EXCLUDE_GLOBAL));
      openInfo(`Removed global ancestor exclusion: ${sel}\nReload the page to see changes.`);
      closeDialog();
    });
  });

  shadow.querySelectorAll('.remove-domain-excl-self').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sel = btn.getAttribute('data-selector');
      if (DOMAIN_EXCLUDES[HOST]) {
        DOMAIN_EXCLUDES[HOST].self = (DOMAIN_EXCLUDES[HOST].self || []).filter(s => s !== sel);
        await storage.set(STORAGE_KEYS.DOMAIN_EXCLUDES, JSON.stringify(DOMAIN_EXCLUDES));
      }
      openInfo(`Removed domain exclusion: ${sel}\nReload the page to see changes.`);
      closeDialog();
    });
  });

  shadow.querySelectorAll('.remove-domain-excl-anc').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sel = btn.getAttribute('data-selector');
      if (DOMAIN_EXCLUDES[HOST]) {
        DOMAIN_EXCLUDES[HOST].ancestors = (DOMAIN_EXCLUDES[HOST].ancestors || []).filter(s => s !== sel);
        await storage.set(STORAGE_KEYS.DOMAIN_EXCLUDES, JSON.stringify(DOMAIN_EXCLUDES));
      }
      openInfo(`Removed domain ancestor exclusion: ${sel}\nReload the page to see changes.`);
      closeDialog();
    });
  });

  shadow.querySelectorAll('.add-global-sel').forEach(btn => {
    btn.addEventListener('click', async () => {
      SELECTORS_GLOBAL.push(diag.selector);
      await storage.set(STORAGE_KEYS.SELECTORS, JSON.stringify(SELECTORS_GLOBAL));
      openInfo(`Added global selector: ${diag.selector}\nReload the page to see changes.`);
      closeDialog();
    });
  });

  shadow.querySelectorAll('.add-domain-sel').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!DOMAIN_SELECTORS[HOST]) DOMAIN_SELECTORS[HOST] = [];
      DOMAIN_SELECTORS[HOST].push(diag.selector);
      await storage.set(STORAGE_KEYS.DOMAIN_SELECTORS, JSON.stringify(DOMAIN_SELECTORS));
      openInfo(`Added domain selector: ${diag.selector}\nReload the page to see changes.`);
      closeDialog();
    });
  });
}
