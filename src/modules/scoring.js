/**
 * Headline scoring and filtering logic
 */

import { CFG, KICKER_CLASS, KICKER_ID, UI_LABELS, UI_CONTAINERS, CARD_SELECTOR } from './config.js';
import { words, hasPunct, hasDigit, lowerRatio, isAllCapsish } from './utils.js';

/**
 * Check if element is likely a kicker/label (should be excluded)
 */
export function isLikelyKicker(el, t) {
  const w = words(t);
  const fewWords = w.length <= 4;
  const noEndPunct = !/[.?!]$/.test(t);
  const capsy = isAllCapsish(t);
  const looksLikeLabel = (el.className && KICKER_CLASS.test(el.className)) ||
                        (el.id && KICKER_ID.test(el.id));
  return ((CFG.kickerFilterStrict && (capsy && fewWords && noEndPunct)) || looksLikeLabel);
}

/**
 * Score element by tag type
 */
export function tagScore(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'h1') return 100;
  if (tag === 'h2') return 90;
  if (tag === 'h3') return 80;
  if (tag === 'h4') return 65;
  if (tag === 'a') return 60;
  if (el.hasAttribute('role') && el.getAttribute('role') === 'heading') return 75;
  if (el.hasAttribute('itemprop') && /headline/i.test(el.getAttribute('itemprop'))) return 85;
  return 50;
}

/**
 * Score element by CSS properties (font size, weight)
 */
export function cssScore(el) {
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

/**
 * Score element by content characteristics
 */
export function contentScore(t) {
  const w = words(t);
  if (w.length < CFG.minWords) return -40;
  if (w.length > CFG.maxWords) return -20;
  let s = 0;
  if (hasPunct(t)) s += 8;
  if (hasDigit(t)) s += 4;
  const lr = lowerRatio(t);
  if (lr < 0.2) s -= 25;
  if (/["""«»]/.test(t)) s += 2;
  return s;
}

/**
 * Compute overall candidate score
 */
export function computeCandidateScore(el, t) {
  let s = 0;
  s += tagScore(el);
  s += cssScore(el);
  s += contentScore(t);
  if (el.closest(CARD_SELECTOR)) s += 10;
  if (isLikelyKicker(el, t)) s -= 50;
  if (el.tagName.toLowerCase() === 'a' && words(t).length <= 3 && !hasPunct(t)) s -= 24;
  return s;
}

/**
 * Hard reject certain text patterns (UI labels, etc.)
 */
export function isHardRejectText(el, t) {
  const w = words(t).length;
  if (el.closest?.(UI_CONTAINERS)) return true;
  if (UI_LABELS.test(t)) return true;
  const href = el.tagName?.toLowerCase?.() === 'a' ? (el.getAttribute('href') || '') : '';
  if (/#/.test(href) || /comment/i.test(href)) return true;
  if (w <= 2 && !hasPunct(t) && t.length < 18) return true;
  if (isAllCapsish(t) && w <= 4 && !hasPunct(t)) return true;
  return false;
}
