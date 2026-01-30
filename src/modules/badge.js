/**
 * Badge UI creation and management
 */

import { UI_ATTR, STORAGE_KEYS } from './config.js';
import { log, textTrim } from './utils.js';

let badge = null;
let badgeState = 'calmed'; // 'calmed' or 'originals'
let isBadgeDragging = false;
let badgeDragOffsetY = 0;
let boundOnBadgeDrag = null;
let boundStopBadgeDrag = null;

/**
 * Ensure badge exists and is rendered
 */
export function ensureBadge(DOMAIN_DISABLED, OPTED_OUT, SHOW_BADGE, BADGE_COLLAPSED, BADGE_POS, storage, enterInspectionMode, restoreOriginalsCallback, reapplyCallback) {
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

  badge.innerHTML = `
    <div class="badge-handle" title="${BADGE_COLLAPSED.value ? 'Open' : 'Close'}">${BADGE_COLLAPSED.value ? '◀' : '▶'}</div>
    <div class="badge-header">NEUTRALIZE HEADLINES</div>
    <div class="badge-content">
      <div class="neutralizer-row">
        <button class="neutralizer-btn neutralizer-primary neutralizer-action">H: neutral</button>
      </div>
      <div class="neutralizer-row">
        <button class="neutralizer-btn neutralizer-inspect">Inspect</button>
      </div>
    </div>
  `;
  document.body.appendChild(badge);

  const header = badge.querySelector('.badge-header');
  const handle = badge.querySelector('.badge-handle');

  header.addEventListener('mousedown', (e) => startBadgeDrag(e, BADGE_COLLAPSED, BADGE_POS, storage));
  handle.addEventListener('click', () => toggleBadgeCollapse(storage, BADGE_COLLAPSED, BADGE_POS, badge));

  badge.querySelector('.neutralizer-action').addEventListener('click', () => onBadgeAction(restoreOriginalsCallback, reapplyCallback));
  badge.querySelector('.neutralizer-inspect').addEventListener('click', enterInspectionMode);
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
    handle.textContent = BADGE_COLLAPSED.value ? '◀' : '▶';
  }
}

/**
 * Handle badge action button (toggle between neutral/original)
 */
function onBadgeAction(restoreOriginals, reapplyFromCache) {
  if (badgeState === 'calmed') {
    restoreOriginals();
    badgeState = 'originals';
    badge.querySelector('.neutralizer-action').textContent = 'H: original';
  } else {
    reapplyFromCache();
    badgeState = 'calmed';
    badge.querySelector('.neutralizer-action').textContent = 'H: neutral';
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
