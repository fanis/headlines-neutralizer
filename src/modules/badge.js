/**
 * Badge UI creation and management
 */

import { UI_ATTR, STORAGE_KEYS } from './config.js';
import { log, textTrim } from './utils.js';

let badge = null;
let badgeState = 'calmed'; // 'calmed' or 'originals'
let isBadgeDragging = false;
let badgeDragOffset = { x: 0, y: 0 };
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
  if (BADGE_COLLAPSED.value) badge.classList.add('collapsed');
  badge.setAttribute(UI_ATTR, '');

  const maxY = window.innerHeight - 200;
  BADGE_POS.y = Math.max(0, Math.min(BADGE_POS.y, maxY));

  badge.style.top = `${BADGE_POS.y}px`;
  badge.style.right = '0px';

  badge.innerHTML = `
    <div class="badge-handle" title="${BADGE_COLLAPSED.value ? 'Open' : 'Close'}">${BADGE_COLLAPSED.value ? '◀' : '▶'}</div>
    <div class="badge-header">NEUTRALIZE HEADLINES</div>
    <div class="badge-content">
      <div class="row">
        <button class="btn primary action">H: neutral</button>
      </div>
      <div class="row">
        <button class="btn inspect">Inspect</button>
      </div>
    </div>
  `;
  document.body.appendChild(badge);

  const header = badge.querySelector('.badge-header');
  const handle = badge.querySelector('.badge-handle');

  header.addEventListener('mousedown', (e) => startBadgeDrag(e, BADGE_COLLAPSED, BADGE_POS, storage));
  handle.addEventListener('click', () => toggleBadgeCollapse(storage, BADGE_COLLAPSED, BADGE_POS, badge));

  badge.querySelector('.action').addEventListener('click', () => onBadgeAction(restoreOriginalsCallback, reapplyCallback));
  badge.querySelector('.inspect').addEventListener('click', enterInspectionMode);
}

/**
 * Start dragging badge
 */
function startBadgeDrag(e, BADGE_COLLAPSED, BADGE_POS, storage) {
  if (BADGE_COLLAPSED.value) return;

  isBadgeDragging = true;
  badge.classList.add('dragging');

  const rect = badge.getBoundingClientRect();
  badgeDragOffset.x = e.clientX - rect.left;
  badgeDragOffset.y = e.clientY - rect.top;

  boundOnBadgeDrag = (e) => onBadgeDrag(e, BADGE_POS);
  boundStopBadgeDrag = () => stopBadgeDrag(storage, BADGE_POS);

  document.addEventListener('mousemove', boundOnBadgeDrag);
  document.addEventListener('mouseup', boundStopBadgeDrag);

  e.preventDefault();
}

/**
 * Handle badge dragging
 */
function onBadgeDrag(e, BADGE_POS) {
  if (!isBadgeDragging) return;

  let newX = e.clientX - badgeDragOffset.x;
  let newY = e.clientY - badgeDragOffset.y;

  const maxX = window.innerWidth - badge.offsetWidth;
  const maxY = window.innerHeight - badge.offsetHeight;
  newX = Math.max(0, Math.min(newX, maxX));
  newY = Math.max(0, Math.min(newY, maxY));

  badge.style.left = `${newX}px`;
  badge.style.top = `${newY}px`;

  BADGE_POS.x = newX;
  BADGE_POS.y = newY;
}

/**
 * Stop dragging badge
 */
function stopBadgeDrag(storage, BADGE_POS) {
  if (!isBadgeDragging) return;

  isBadgeDragging = false;
  badge.classList.remove('dragging');

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
    badge.classList.add('collapsed');
    badge.style.left = '';
    badge.style.right = '0px';
    badge.style.top = `${currentY}px`;
  } else {
    badge.classList.remove('collapsed');
    badge.style.left = '';
    badge.style.right = '0px';
    badge.style.top = `${currentY}px`;

    BADGE_POS.x = 0;
    BADGE_POS.y = currentY;
    storage.set(STORAGE_KEYS.BADGE_POS, JSON.stringify(BADGE_POS));
  }

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
    badge.querySelector('.action').textContent = 'H: original';
  } else {
    reapplyFromCache();
    badgeState = 'calmed';
    badge.querySelector('.action').textContent = 'H: neutral';
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
