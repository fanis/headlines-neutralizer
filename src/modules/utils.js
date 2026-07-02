/**
 * Utility functions
 */

import { CFG, LOG_PREFIX } from './config.js';

// Logging
export function log(...args) {
  if (!CFG.DEBUG) return;
  console.log(LOG_PREFIX, ...args);
}

// Text processing
export const normalizeSpace = (s) => s.replace(/\s+/g, ' ').trim();
export const textTrim = (n) => normalizeSpace(n.textContent || '');
export const words = (s) => normalizeSpace(s).split(' ').filter(Boolean);
export const withinLen = (t) => { const L = t.length; return L >= CFG.minLen && L <= CFG.maxLen; };
export const hasPunct = (s) => /[.?!:;—–-]/.test(s);
export const hasDigit = (s) => /\d/.test(s);

// DOM checks
// checkVisibility (when available) also covers position:fixed elements, which
// have a null offsetParent even when visible.
export const isVisible = (el) =>
  typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.offsetParent !== null;
export const isEditable = (el) => el.closest('input, textarea, [contenteditable=""], [contenteditable="true"]');

// Text analysis
export const lowerRatio = (s) => {
  const letters = s.match(/[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ]/g) || [];
  if (!letters.length) return 0;
  const lowers = s.match(/[a-zα-ωά-ώ]/g) || [];
  return lowers.length / letters.length;
};

export const isAllCapsish = (s) => {
  const ls = s.replace(/[^A-Za-zΑ-Ωα-ωΆ-Ώ]/g, '');
  if (ls.length < 2) return false;
  const uppers = s.match(/[A-ZΑ-ΩΆ-Ώ]/g) || [];
  return uppers.length / ls.length >= 0.85;
};

// Quote protection (preserve quoted text verbatim)
// Matches straight quotes, curly quotes and guillemets. Each quoted span in the
// rewrite is replaced by the corresponding span from the original, in order.
const QUOTE_SPAN = /["“”«»].*?["“”«»]/g;
export function quoteProtect(original, rewritten) {
  const quotes = original.match(QUOTE_SPAN) || [];
  if (!quotes.length) return rewritten;
  let i = 0;
  // Function replacer: quote text is inserted literally (no $-pattern expansion)
  return rewritten.replace(QUOTE_SPAN, (span) => (i < quotes.length ? quotes[i++] : span));
}

// HTML escaping
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

// Viewport and positioning utilities
export function parseRootMarginPxY() {
  const m = (CFG.rootMargin || '0px').trim().split(/\s+/);
  const top = m[0] || '0px';
  const val = parseFloat(top);
  return isNaN(val) ? 0 : val;
}

export function isInViewportWithMargin(el) {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const m = parseRootMarginPxY();
  return rect.bottom >= -m && rect.top <= vh + m;
}

// Line parsing for dialogs
export function parseLines(s) {
  return s.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);
}

// Register a userscript menu command across managers.
// `GM_registerMenuCommand?.()` is NOT safe when the identifier is undeclared
// (e.g. Greasemonkey 4, Safari Userscripts): optional chaining still throws a
// ReferenceError. typeof guards are the only safe check.
export function registerMenuCommand(label, fn) {
  try {
    if (typeof GM !== 'undefined' && typeof GM.registerMenuCommand === 'function') {
      GM.registerMenuCommand(label, fn);
      return true;
    }
  } catch {}
  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand(label, fn);
      return true;
    }
  } catch {}
  return false;
}
