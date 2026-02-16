/**
 * Badge UI creation and management
 */

import { UI_ATTR, STORAGE_KEYS, TEMPERATURE_ORDER } from './config.js';
import { log, textTrim } from './utils.js';
import { escapeHtml } from './utils.js';

let badge = null;
let badgeState = 'calmed'; // 'calmed' or 'originals'
let isBadgeDragging = false;
let badgeDragOffsetY = 0;
let boundOnBadgeDrag = null;
let boundStopBadgeDrag = null;

/**
 * Ensure badge exists and is rendered
 * @param {Object} opts - Badge configuration
 */
export function ensureBadge(opts) {
  const {
    DOMAIN_DISABLED, OPTED_OUT, SHOW_BADGE, BADGE_COLLAPSED, BADGE_POS, storage,
    onInspect, restoreOriginals, reapplyFromCache,
    onEditSelectors, onShowIncluded, onStats, onFlushCache,
    onStrengthChange, onAutoDetectToggle,
    strengthLevel, autoDetectOn
  } = opts;

  if ((DOMAIN_DISABLED || OPTED_OUT) || !SHOW_BADGE) return;

  if (badge && badge.isConnected) return;

  badge = document.createElement('div');
  badge.className = 'neutralizer-badge';
  if (BADGE_COLLAPSED.value) badge.classList.add('neutralizer-collapsed');
  badge.setAttribute(UI_ATTR, '');

  const maxY = window.innerHeight - 200;
  BADGE_POS.y = Math.max(0, Math.min(BADGE_POS.y, maxY));

  badge.style.top = `${BADGE_POS.y}px`;
  badge.style.right = '0px';

  // Build strength segmented control (1=Minimal .. 5=Maximum)
  const strengthBtns = TEMPERATURE_ORDER.map((level, i) =>
    `<button class="neutralizer-popover-option${level === strengthLevel ? ' neutralizer-popover-active' : ''}" data-strength="${escapeHtml(level)}" title="${escapeHtml(level)}">${i + 1}</button>`
  ).join('');

  badge.innerHTML = `
    <div class="badge-handle" title="${BADGE_COLLAPSED.value ? 'Open' : 'Close'}">${BADGE_COLLAPSED.value ? '\u25C0' : '\u25B6'}</div>
    <div class="badge-header">Headlines\nNeutralizer</div>
    <div class="badge-content">
      <div class="neutralizer-row">
        <button class="neutralizer-btn neutralizer-primary neutralizer-action">neutral</button>
      </div>
      <div class="neutralizer-status-row">
        <span class="neutralizer-status">Ready</span>
        <button class="neutralizer-gear-btn" title="Settings">\u2699</button>
      </div>
    </div>
    <div class="neutralizer-popover">
      <button class="neutralizer-popover-item" data-action="edit-selectors">Edit Selectors</button>
      <button class="neutralizer-popover-item" data-action="inspect">Inspect Elements</button>
      <button class="neutralizer-popover-item" data-action="show-included">Show Included</button>
      <hr class="neutralizer-popover-sep">
      <div class="neutralizer-popover-group">
        <span class="neutralizer-popover-label">Strength</span>
        <div class="neutralizer-popover-seg">${strengthBtns}</div>
      </div>
      <div class="neutralizer-popover-group">
        <span class="neutralizer-popover-label">Auto-detect</span>
        <div class="neutralizer-popover-seg">
          <button class="neutralizer-popover-option${autoDetectOn ? ' neutralizer-popover-active' : ''}" data-autodetect="on">ON</button>
          <button class="neutralizer-popover-option${!autoDetectOn ? ' neutralizer-popover-active' : ''}" data-autodetect="off">OFF</button>
        </div>
      </div>
      <hr class="neutralizer-popover-sep">
      <button class="neutralizer-popover-item" data-action="stats">Stats &amp; Changes</button>
      <button class="neutralizer-popover-item" data-action="flush-cache">Flush Cache &amp; Rerun</button>
    </div>
  `;
  document.body.appendChild(badge);

  // Core event listeners
  const header = badge.querySelector('.badge-header');
  const handle = badge.querySelector('.badge-handle');

  header.addEventListener('mousedown', (e) => startBadgeDrag(e, BADGE_COLLAPSED, BADGE_POS, storage));
  handle.addEventListener('click', () => toggleBadgeCollapse(storage, BADGE_COLLAPSED, BADGE_POS, badge));

  badge.querySelector('.neutralizer-action').addEventListener('click', () => onBadgeAction(restoreOriginals, reapplyFromCache));

  // Gear popover toggle
  const popover = badge.querySelector('.neutralizer-popover');
  badge.querySelector('.neutralizer-gear-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = popover.classList.contains('neutralizer-popover-open');
    popover.classList.toggle('neutralizer-popover-open');
    if (!wasOpen) positionPopover(popover);
  });

  // Close popover on click-outside
  document.addEventListener('click', (e) => {
    if (!badge.contains(e.target)) closePopover();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePopover();
  });

  // Popover action items
  popover.querySelectorAll('.neutralizer-popover-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      closePopover();
      if (action === 'edit-selectors') onEditSelectors?.();
      else if (action === 'inspect') onInspect?.();
      else if (action === 'show-included') onShowIncluded?.();
      else if (action === 'stats') onStats?.();
      else if (action === 'flush-cache') onFlushCache?.();
    });
  });

  // Strength segmented control
  popover.querySelectorAll('[data-strength]').forEach(btn => {
    btn.addEventListener('click', () => {
      popover.querySelectorAll('[data-strength]').forEach(b => b.classList.remove('neutralizer-popover-active'));
      btn.classList.add('neutralizer-popover-active');
      onStrengthChange?.(btn.dataset.strength);
    });
  });

  // Auto-detect toggle
  popover.querySelectorAll('[data-autodetect]').forEach(btn => {
    btn.addEventListener('click', () => {
      popover.querySelectorAll('[data-autodetect]').forEach(b => b.classList.remove('neutralizer-popover-active'));
      btn.classList.add('neutralizer-popover-active');
      onAutoDetectToggle?.(btn.dataset.autodetect === 'on');
    });
  });
}

/**
 * Close the popover if open
 */
function closePopover() {
  if (!badge) return;
  const popover = badge.querySelector('.neutralizer-popover');
  if (popover) popover.classList.remove('neutralizer-popover-open');
}

/**
 * Position popover above or below badge depending on available space
 */
function positionPopover(popover) {
  // Reset to measure natural height
  popover.style.top = '';
  popover.style.bottom = '';
  const badgeRect = badge.getBoundingClientRect();
  const popoverHeight = popover.offsetHeight;
  const spaceAbove = badgeRect.top;

  if (spaceAbove >= popoverHeight + 6) {
    // Enough room above: show above
    popover.style.bottom = '100%';
    popover.style.top = 'auto';
    popover.style.marginBottom = '6px';
    popover.style.marginTop = '';
  } else {
    // Not enough room above: show below
    popover.style.top = '100%';
    popover.style.bottom = 'auto';
    popover.style.marginTop = '6px';
    popover.style.marginBottom = '';
  }
}

/**
 * Start dragging badge
 */
function startBadgeDrag(e, BADGE_COLLAPSED, BADGE_POS, storage) {
  if (BADGE_COLLAPSED.value) return;

  isBadgeDragging = true;
  badge.classList.add('neutralizer-dragging');

  const rect = badge.getBoundingClientRect();
  badgeDragOffsetY = e.clientY - rect.top;

  boundOnBadgeDrag = (e) => onBadgeDrag(e, BADGE_POS);
  boundStopBadgeDrag = () => stopBadgeDrag(storage, BADGE_POS);

  document.addEventListener('mousemove', boundOnBadgeDrag);
  document.addEventListener('mouseup', boundStopBadgeDrag);

  e.preventDefault();
}

/**
 * Handle badge dragging (vertical only, stays docked right)
 */
function onBadgeDrag(e, BADGE_POS) {
  if (!isBadgeDragging) return;

  let newY = e.clientY - badgeDragOffsetY;
  const maxY = window.innerHeight - badge.offsetHeight;
  newY = Math.max(0, Math.min(newY, maxY));

  badge.style.top = `${newY}px`;
  BADGE_POS.y = newY;
}

/**
 * Stop dragging badge
 */
function stopBadgeDrag(storage, BADGE_POS) {
  if (!isBadgeDragging) return;

  isBadgeDragging = false;
  badge.classList.remove('neutralizer-dragging');

  if (boundOnBadgeDrag) {
    document.removeEventListener('mousemove', boundOnBadgeDrag);
    boundOnBadgeDrag = null;
  }
  if (boundStopBadgeDrag) {
    document.removeEventListener('mouseup', boundStopBadgeDrag);
    boundStopBadgeDrag = null;
  }

  storage.set(STORAGE_KEYS.BADGE_POS, JSON.stringify(BADGE_POS));
}

/**
 * Toggle badge collapsed state
 */
export async function toggleBadgeCollapse(storage, BADGE_COLLAPSED, BADGE_POS, badge) {
  BADGE_COLLAPSED.value = !BADGE_COLLAPSED.value;
  await storage.set(STORAGE_KEYS.BADGE_COLLAPSED, String(BADGE_COLLAPSED.value));

  const currentY = parseInt(badge.style.top) || BADGE_POS.y;

  if (BADGE_COLLAPSED.value) {
    badge.classList.add('neutralizer-collapsed');
  } else {
    badge.classList.remove('neutralizer-collapsed');
  }
  badge.style.top = `${currentY}px`;
  BADGE_POS.y = currentY;
  storage.set(STORAGE_KEYS.BADGE_POS, JSON.stringify(BADGE_POS));

  const handle = badge.querySelector('.badge-handle');
  if (handle) {
    handle.title = BADGE_COLLAPSED.value ? 'Open' : 'Close';
    handle.textContent = BADGE_COLLAPSED.value ? '\u25C0' : '\u25B6';
  }
}

/**
 * Handle badge action button (toggle between neutral/original)
 */
function onBadgeAction(restoreOriginals, reapplyFromCache) {
  const status = badge.querySelector('.neutralizer-status');
  if (badgeState === 'calmed') {
    restoreOriginals();
    badgeState = 'originals';
    badge.querySelector('.neutralizer-action').textContent = 'original';
    if (status) status.textContent = 'Reverted';
  } else {
    if (status) status.textContent = 'Processing';
    reapplyFromCache();
    badgeState = 'calmed';
    badge.querySelector('.neutralizer-action').textContent = 'neutral';
    if (status) status.textContent = 'Neutralized';
  }
}

/**
 * Update badge counts (placeholder for future use)
 */
export function updateBadgeCounts() {
  // Counts display removed from badge
}

/**
 * Reapply cached rewrites to all elements
 */
export function reapplyFromCache(textToElements, cacheGet, buildMap, applyRewrites) {
  const freshSeenEl = new WeakSet();
  for (const [text, set] of textToElements.entries()) {
    const cached = cacheGet(text);
    if (cached) {
      applyRewrites(buildMap([text]), [text], [cached], 'cache', freshSeenEl);
    }
  }
}
