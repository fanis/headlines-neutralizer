/**
 * Selector and domain matching utilities
 */

/**
 * Convert glob pattern to RegExp
 * @param {string} glob - Glob pattern (e.g., "*.example.com")
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  const esc = s => s.replace(/[.+^${}()|[\]\\*?]/g, '\\$&');
  const g = esc(glob).replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
  return new RegExp(`^${g}$`, 'i');
}

/**
 * Convert domain pattern to regex, handling wildcards and regex literals
 * @param {string} pattern - Domain pattern
 * @returns {RegExp|null}
 */
export function domainPatternToRegex(pattern) {
  pattern = pattern.trim();
  if (!pattern) return null;

  // Handle regex literal: /pattern/
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    try {
      return new RegExp(pattern.slice(1, -1), 'i');
    } catch {
      return null;
    }
  }

  // Handle glob patterns with wildcards
  if (pattern.includes('*') || pattern.includes('?')) {
    return globToRegExp(pattern.replace(/^\.*\*?\./, '*.'));
  }

  // Exact match with subdomain support
  const esc = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\.)${esc}$`, 'i');
}

/**
 * Check if hostname matches any pattern in list
 * @param {string[]} list - List of domain patterns
 * @param {string} hostname - Hostname to check
 * @returns {boolean}
 */
export function listMatchesHost(list, hostname) {
  for (const pattern of list) {
    const regex = domainPatternToRegex(pattern);
    if (regex && regex.test(hostname)) {
      return true;
    }
  }
  return false;
}

/**
 * Compile selector list into CSS selector string
 * @param {string[]} selectors - Array of CSS selectors
 * @returns {string} - Comma-separated selector string
 */
export function compiledSelectors(selectors) {
  return selectors.join(',');
}
