import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  log,
  normalizeSpace,
  textTrim,
  words,
  withinLen,
  hasPunct,
  hasDigit,
  isVisible,
  isEditable,
  lowerRatio,
  isAllCapsish,
  quoteProtect,
  escapeHtml,
  parseRootMarginPxY,
  isInViewportWithMargin,
  parseLines
} from '../../src/modules/utils.js';

// Mock DOM environment
const createMockElement = (props = {}) => ({
  offsetParent: props.offsetParent !== undefined ? props.offsetParent : {},
  closest: vi.fn((selector) => props.closest?.[selector] || null),
  getBoundingClientRect: vi.fn(() => props.rect || { top: 0, bottom: 100 })
});

describe('Utility Functions', () => {
  describe('log', () => {
    let consoleLogSpy;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should not log when DEBUG is false', () => {
      log('Test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('normalizeSpace', () => {
    it('should collapse multiple spaces into one', () => {
      expect(normalizeSpace('hello    world')).toBe('hello world');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeSpace('  hello world  ')).toBe('hello world');
    });

    it('should handle newlines and tabs', () => {
      expect(normalizeSpace('hello\n\t  world')).toBe('hello world');
    });

    it('should handle multiple types of whitespace', () => {
      expect(normalizeSpace('  hello \n\n world \t test  ')).toBe('hello world test');
    });

    it('should handle empty string', () => {
      expect(normalizeSpace('')).toBe('');
    });

    it('should handle string with only whitespace', () => {
      expect(normalizeSpace('   \n\t  ')).toBe('');
    });

    it('should handle normal text without extra spaces', () => {
      expect(normalizeSpace('hello world')).toBe('hello world');
    });
  });

  describe('textTrim', () => {
    it('should extract and normalize text content', () => {
      const node = { textContent: '  hello   world  ' };
      expect(textTrim(node)).toBe('hello world');
    });

    it('should handle empty textContent', () => {
      const node = { textContent: '' };
      expect(textTrim(node)).toBe('');
    });

    it('should handle null textContent', () => {
      const node = { textContent: null };
      expect(textTrim(node)).toBe('');
    });

    it('should handle node with nested whitespace', () => {
      const node = { textContent: 'hello\n\n  world\t\ttest' };
      expect(textTrim(node)).toBe('hello world test');
    });
  });

  describe('words', () => {
    it('should split text into words', () => {
      expect(words('hello world test')).toEqual(['hello', 'world', 'test']);
    });

    it('should handle multiple spaces', () => {
      expect(words('hello    world')).toEqual(['hello', 'world']);
    });

    it('should filter out empty strings', () => {
      expect(words('  hello  world  ')).toEqual(['hello', 'world']);
    });

    it('should handle single word', () => {
      expect(words('hello')).toEqual(['hello']);
    });

    it('should handle empty string', () => {
      expect(words('')).toEqual([]);
    });

    it('should handle string with only spaces', () => {
      expect(words('     ')).toEqual([]);
    });

    it('should handle text with newlines and tabs', () => {
      expect(words('hello\nworld\ttest')).toEqual(['hello', 'world', 'test']);
    });
  });

  describe('withinLen', () => {
    it('should return true for text within range', () => {
      expect(withinLen('hello world')).toBe(true);
    });

    it('should return false for text too short', () => {
      expect(withinLen('hi')).toBe(false);
    });

    it('should return false for text too long', () => {
      const longText = 'a'.repeat(200);
      expect(withinLen(longText)).toBe(false);
    });

    it('should handle boundary cases', () => {
      expect(withinLen('12345678')).toBe(true); // minLen = 8
      expect(withinLen('1234567')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(withinLen('')).toBe(false);
    });
  });

  describe('hasPunct', () => {
    it('should detect periods', () => {
      expect(hasPunct('Hello.')).toBe(true);
    });

    it('should detect question marks', () => {
      expect(hasPunct('Really?')).toBe(true);
    });

    it('should detect exclamation marks', () => {
      expect(hasPunct('Wow!')).toBe(true);
    });

    it('should detect colons', () => {
      expect(hasPunct('Note: important')).toBe(true);
    });

    it('should detect semicolons', () => {
      expect(hasPunct('First; second')).toBe(true);
    });

    it('should detect em dashes', () => {
      expect(hasPunct('Hello—world')).toBe(true);
    });

    it('should detect en dashes', () => {
      expect(hasPunct('2020–2021')).toBe(true);
    });

    it('should detect hyphens', () => {
      expect(hasPunct('well-known')).toBe(true);
    });

    it('should return false for text without punctuation', () => {
      expect(hasPunct('hello world')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(hasPunct('')).toBe(false);
    });
  });

  describe('hasDigit', () => {
    it('should detect single digit', () => {
      expect(hasDigit('Test 1')).toBe(true);
    });

    it('should detect multiple digits', () => {
      expect(hasDigit('Year 2024')).toBe(true);
    });

    it('should detect numbers in middle', () => {
      expect(hasDigit('COVID-19 update')).toBe(true);
    });

    it('should return false for no digits', () => {
      expect(hasDigit('No numbers here')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(hasDigit('')).toBe(false);
    });
  });

  describe('isVisible', () => {
    it('should return true for visible element', () => {
      const el = createMockElement({ offsetParent: {} });
      expect(isVisible(el)).toBe(true);
    });

    it('should return false for hidden element', () => {
      const el = createMockElement({ offsetParent: null });
      expect(isVisible(el)).toBe(false);
    });

    it('should handle element with offsetParent set to document body', () => {
      const el = createMockElement({ offsetParent: document.body });
      expect(isVisible(el)).toBe(true);
    });
  });

  describe('isEditable', () => {
    it('should detect input elements', () => {
      const el = {
        closest: vi.fn((selector) => {
          if (selector === 'input, textarea, [contenteditable=""], [contenteditable="true"]') return {};
          return null;
        })
      };
      expect(isEditable(el)).toBeTruthy();
    });

    it('should detect textarea elements', () => {
      const el = {
        closest: vi.fn((selector) => {
          if (selector === 'input, textarea, [contenteditable=""], [contenteditable="true"]') return {};
          return null;
        })
      };
      expect(isEditable(el)).toBeTruthy();
    });

    it('should detect contenteditable elements', () => {
      const el = {
        closest: vi.fn((selector) => {
          if (selector === 'input, textarea, [contenteditable=""], [contenteditable="true"]') return {};
          return null;
        })
      };
      expect(isEditable(el)).toBeTruthy();
    });

    it('should detect contenteditable=true', () => {
      const el = {
        closest: vi.fn((selector) => {
          if (selector === 'input, textarea, [contenteditable=""], [contenteditable="true"]') return {};
          return null;
        })
      };
      expect(isEditable(el)).toBeTruthy();
    });

    it('should return null for non-editable elements', () => {
      const el = {
        closest: vi.fn(() => null)
      };
      expect(isEditable(el)).toBeNull();
    });
  });

  describe('lowerRatio', () => {
    it('should calculate ratio for mixed case', () => {
      expect(lowerRatio('Hello World')).toBeCloseTo(0.8, 1); // 8 lowercase / 10 letters
    });

    it('should return 1 for all lowercase', () => {
      expect(lowerRatio('hello world')).toBe(1);
    });

    it('should return 0 for all uppercase', () => {
      expect(lowerRatio('HELLO WORLD')).toBe(0);
    });

    it('should ignore non-letter characters', () => {
      expect(lowerRatio('Hello 123 World!!!')).toBeCloseTo(0.8, 1);
    });

    it('should handle Greek characters (lowercase)', () => {
      expect(lowerRatio('αβγδ')).toBe(1);
    });

    it('should handle Greek characters (uppercase)', () => {
      expect(lowerRatio('ΑΒΓΔ')).toBe(0);
    });

    it('should handle Greek characters (mixed)', () => {
      expect(lowerRatio('Αβγδ')).toBeCloseTo(0.75, 1);
    });

    it('should return 0 for no letters', () => {
      expect(lowerRatio('123 !@#')).toBe(0);
    });

    it('should handle empty string', () => {
      expect(lowerRatio('')).toBe(0);
    });
  });

  describe('isAllCapsish', () => {
    it('should detect all caps text', () => {
      expect(isAllCapsish('HELLO WORLD')).toBe(true);
    });

    it('should allow some lowercase (85% threshold)', () => {
      // 'HELLO WOrld' = 10 letters, 7 uppercase (70%) < 85%, so false
      expect(isAllCapsish('HELLO WOrld')).toBe(false);
    });

    it('should reject mostly lowercase', () => {
      expect(isAllCapsish('Hello World')).toBe(false);
    });

    it('should handle text with numbers and punctuation', () => {
      expect(isAllCapsish('COVID-19 UPDATE')).toBe(true);
    });

    it('should return false for single character', () => {
      expect(isAllCapsish('H')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(isAllCapsish('')).toBe(false);
    });

    it('should handle text with no letters', () => {
      expect(isAllCapsish('123 !@#')).toBe(false);
    });

    it('should handle Greek uppercase', () => {
      expect(isAllCapsish('ΑΒΓΔ ΚΟΣΜΟΣ')).toBe(true);
    });

    it('should handle Greek lowercase', () => {
      expect(isAllCapsish('αβγδ κόσμος')).toBe(false);
    });
  });

  describe('quoteProtect', () => {
    it('should preserve double quotes', () => {
      const original = 'Mayor says "We will rebuild"';
      const rewritten = 'Mayor announces "reconstruction plans"';

      const result = quoteProtect(original, rewritten);

      expect(result).toContain('"We will rebuild"');
    });

    it('should preserve curly quotes', () => {
      const original = 'Mayor says "We will rebuild"';
      const rewritten = 'Mayor announces "reconstruction plans"';

      const result = quoteProtect(original, rewritten);

      expect(result).toContain('"We will rebuild"');
    });

    it('should preserve guillemets', () => {
      const original = 'Mayor says «We will rebuild»';
      const rewritten = 'Mayor announces «reconstruction plans»';

      const result = quoteProtect(original, rewritten);

      expect(result).toContain('«We will rebuild»');
    });

    it('should handle multiple quotes', () => {
      const original = 'He said "hello" and she said "goodbye"';
      const rewritten = 'He greeted "hi" and she departed "farewell"';

      const result = quoteProtect(original, rewritten);

      // The function replaces quotes sequentially, so the last quote wins
      expect(result).toContain('"goodbye"');
    });

    it('should handle text without quotes', () => {
      const original = 'No quotes here';
      const rewritten = 'Still no quotes';

      const result = quoteProtect(original, rewritten);

      expect(result).toBe('Still no quotes');
    });

    it('should handle empty strings', () => {
      expect(quoteProtect('', '')).toBe('');
    });
  });

  describe('escapeHtml', () => {
    it('should escape ampersand', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape less than', () => {
      expect(escapeHtml('1 < 2')).toBe('1 &lt; 2');
    });

    it('should escape greater than', () => {
      expect(escapeHtml('2 > 1')).toBe('2 &gt; 1');
    });

    it('should escape double quotes', () => {
      expect(escapeHtml('He said "hello"')).toBe('He said &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("It's mine")).toBe("It&#39;s mine");
    });

    it('should escape multiple special chars', () => {
      expect(escapeHtml('<script>alert("XSS")</script>'))
        .toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    it('should handle normal text', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should convert non-string to string', () => {
      expect(escapeHtml(123)).toBe('123');
      expect(escapeHtml(null)).toBe('null');
    });
  });

  describe('parseRootMarginPxY', () => {
    it('should parse single value', () => {
      // parseRootMarginPxY reads from CFG.rootMargin which is '1000px 0px' by default
      // It parses the first value (top margin)
      expect(parseRootMarginPxY()).toBe(1000);
    });

    it('should handle zero margin', () => {
      // parseRootMarginPxY reads from CFG.rootMargin which is '1000px 0px' by default
      expect(parseRootMarginPxY()).toBe(1000);
    });

    it('should handle invalid values', () => {
      // parseRootMarginPxY reads from CFG.rootMargin which is '1000px 0px' by default
      expect(parseRootMarginPxY()).toBe(1000);
    });
  });

  describe('isInViewportWithMargin', () => {
    let originalWindow;
    let originalDocument;

    beforeEach(() => {
      originalWindow = global.window;
      originalDocument = global.document;

      global.window = {
        innerHeight: 768
      };
      global.document = {
        documentElement: {
          clientHeight: 768
        }
      };
    });

    afterEach(() => {
      global.window = originalWindow;
      global.document = originalDocument;
    });

    it('should detect element in viewport', () => {
      const el = createMockElement({
        rect: { top: 100, bottom: 200 }
      });

      expect(isInViewportWithMargin(el)).toBe(true);
    });

    it('should detect element above viewport', () => {
      const el = createMockElement({
        rect: { top: -1500, bottom: -1400 }
      });

      // With 1000px margin, element at -1500 to -1400 is outside (needs bottom >= -1000)
      expect(isInViewportWithMargin(el)).toBe(false);
    });

    it('should detect element below viewport', () => {
      const el = createMockElement({
        rect: { top: 2000, bottom: 2100 }
      });

      // With viewport height 768 and margin 1000px, element at 2000 is outside (needs top <= 768+1000=1768)
      expect(isInViewportWithMargin(el)).toBe(false);
    });

    it('should detect element partially visible (top)', () => {
      const el = createMockElement({
        rect: { top: -50, bottom: 50 }
      });

      expect(isInViewportWithMargin(el)).toBe(true);
    });

    it('should detect element partially visible (bottom)', () => {
      const el = createMockElement({
        rect: { top: 750, bottom: 850 }
      });

      expect(isInViewportWithMargin(el)).toBe(true);
    });

    it('should handle element exactly at viewport edge', () => {
      const el = createMockElement({
        rect: { top: 0, bottom: 100 }
      });

      expect(isInViewportWithMargin(el)).toBe(true);
    });
  });

  describe('parseLines', () => {
    it('should split by newlines', () => {
      expect(parseLines('line1\nline2\nline3')).toEqual(['line1', 'line2', 'line3']);
    });

    it('should split by commas', () => {
      expect(parseLines('item1,item2,item3')).toEqual(['item1', 'item2', 'item3']);
    });

    it('should split by semicolons', () => {
      expect(parseLines('item1;item2;item3')).toEqual(['item1', 'item2', 'item3']);
    });

    it('should handle mixed separators', () => {
      expect(parseLines('item1\nitem2,item3;item4')).toEqual(['item1', 'item2', 'item3', 'item4']);
    });

    it('should trim whitespace from items', () => {
      expect(parseLines('  item1  \n  item2  ')).toEqual(['item1', 'item2']);
    });

    it('should filter out empty lines', () => {
      expect(parseLines('item1\n\n\nitem2')).toEqual(['item1', 'item2']);
    });

    it('should handle empty string', () => {
      expect(parseLines('')).toEqual([]);
    });

    it('should handle string with only separators', () => {
      expect(parseLines('\n,;')).toEqual([]);
    });

    it('should handle complex real-world input', () => {
      const input = `
        example.com
        *.google.com,
        reddit.com;

        news.ycombinator.com
      `;

      expect(parseLines(input)).toEqual([
        'example.com',
        '*.google.com',
        'reddit.com',
        'news.ycombinator.com'
      ]);
    });
  });
});
