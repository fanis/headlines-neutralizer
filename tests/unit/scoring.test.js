import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isLikelyKicker,
  tagScore,
  cssScore,
  contentScore,
  computeCandidateScore,
  isHardRejectText
} from '../../src/modules/scoring.js';

// Mock DOM environment
const createMockElement = (tag = 'div', attributes = {}, styles = {}) => {
  const element = {
    tagName: tag.toUpperCase(),
    className: attributes.class || '',
    id: attributes.id || '',
    getAttribute: (attr) => attributes[attr] || null,
    hasAttribute: (attr) => attr in attributes,
    closest: vi.fn((selector) => {
      if (attributes._closest === selector) return {};
      return null;
    })
  };

  // Mock getComputedStyle
  global.getComputedStyle = vi.fn(() => ({
    fontSize: styles.fontSize || '16px',
    fontWeight: styles.fontWeight || '400'
  }));

  return element;
};

describe('Scoring Logic', () => {
  describe('isLikelyKicker', () => {
    it('should detect all-caps kicker labels', () => {
      const el = createMockElement('div');
      const text = 'BREAKING NEWS';

      expect(isLikelyKicker(el, text)).toBe(true);
    });

    it('should detect short all-caps text without punctuation', () => {
      const el = createMockElement('div');
      const text = 'LIVE UPDATE';

      expect(isLikelyKicker(el, text)).toBe(true);
    });

    it('should not flag normal headlines', () => {
      const el = createMockElement('div');
      const text = 'This is a normal headline with proper capitalization.';

      expect(isLikelyKicker(el, text)).toBe(false);
    });

    it('should detect kicker by className', () => {
      const el = createMockElement('div', { class: 'article-kicker' });
      const text = 'Politics';

      expect(isLikelyKicker(el, text)).toBe(true);
    });

    it('should detect kicker by id', () => {
      const el = createMockElement('div', { id: 'eyebrow-label' });
      const text = 'Technology';

      expect(isLikelyKicker(el, text)).toBe(true);
    });

    it('should detect various kicker class patterns', () => {
      const patterns = [
        'kicker',
        'eyebrow',
        'label-text',
        'badge',
        'chip',
        'pill',
        'tag-name',
        'topic',
        'category-label',
        'section-header'
      ];

      patterns.forEach(pattern => {
        const el = createMockElement('div', { class: pattern });
        expect(isLikelyKicker(el, 'Test')).toBe(true);
      });
    });

    it('should allow all-caps with ending punctuation', () => {
      const el = createMockElement('div');
      const text = 'WORLD CUP FINAL.';

      expect(isLikelyKicker(el, text)).toBe(false);
    });

    it('should allow longer all-caps text (> 4 words)', () => {
      const el = createMockElement('div');
      const text = 'THIS IS A LONGER ALL CAPS HEADLINE';

      expect(isLikelyKicker(el, text)).toBe(false);
    });
  });

  describe('tagScore', () => {
    it('should score h1 highest', () => {
      const el = createMockElement('h1');
      expect(tagScore(el)).toBe(100);
    });

    it('should score h2 high', () => {
      const el = createMockElement('h2');
      expect(tagScore(el)).toBe(90);
    });

    it('should score h3', () => {
      const el = createMockElement('h3');
      expect(tagScore(el)).toBe(80);
    });

    it('should score h4', () => {
      const el = createMockElement('h4');
      expect(tagScore(el)).toBe(65);
    });

    it('should score anchor tags', () => {
      const el = createMockElement('a');
      expect(tagScore(el)).toBe(60);
    });

    it('should score role=heading', () => {
      const el = createMockElement('div', { role: 'heading' });
      expect(tagScore(el)).toBe(75);
    });

    it('should score itemprop=headline', () => {
      const el = createMockElement('div', { itemprop: 'headline' });
      expect(tagScore(el)).toBe(85);
    });

    it('should score itemprop case-insensitively', () => {
      const el = createMockElement('div', { itemprop: 'Headline' });
      expect(tagScore(el)).toBe(85);
    });

    it('should give default score for generic elements', () => {
      const el = createMockElement('div');
      expect(tagScore(el)).toBe(50);
    });

    it('should give default score for span', () => {
      const el = createMockElement('span');
      expect(tagScore(el)).toBe(50);
    });
  });

  describe('cssScore', () => {
    it('should give high score for large font size', () => {
      const el = createMockElement('div', {}, { fontSize: '32px' });
      const score = cssScore(el);

      expect(score).toBeGreaterThan(30);
    });

    it('should penalize very small font size', () => {
      const el = createMockElement('div', {}, { fontSize: '12px' });
      const score = cssScore(el);

      expect(score).toBeLessThan(-20);
    });

    it('should reward bold text (700)', () => {
      const el = createMockElement('div', {}, { fontSize: '16px', fontWeight: '700' });
      const score = cssScore(el);

      expect(score).toBeGreaterThan(10);
    });

    it('should reward semi-bold text (600)', () => {
      const el = createMockElement('div', {}, { fontSize: '16px', fontWeight: '600' });
      const score = cssScore(el);

      expect(score).toBeGreaterThan(5);
    });

    it('should give small boost for medium weight (500)', () => {
      const el = createMockElement('div', {}, { fontSize: '16px', fontWeight: '500' });
      const score = cssScore(el);

      expect(score).toBeGreaterThan(2);
    });

    it('should give no weight bonus for normal text (400)', () => {
      const el1 = createMockElement('div', {}, { fontSize: '16px', fontWeight: '400' });
      const el2 = createMockElement('div', {}, { fontSize: '16px', fontWeight: '300' });

      // Both should have same font-weight component (no bonus)
      const score1 = cssScore(el1);
      const score2 = cssScore(el2);

      expect(score1).toBe(score2);
    });

    it('should cap font size bonus at 40', () => {
      const el = createMockElement('div', {}, { fontSize: '100px', fontWeight: '400' });
      const score = cssScore(el);

      // Max font size bonus is 40
      expect(score).toBeLessThanOrEqual(40);
    });

    it('should handle missing font size', () => {
      const el = createMockElement('div', {}, { fontSize: '', fontWeight: '400' });
      const score = cssScore(el);

      // When fontSize is '', parseFloat returns NaN||0 = 0, fw is 400, so no bonus/penalty
      expect(score).toBe(0);
    });

    it('should handle invalid font weight', () => {
      global.getComputedStyle = vi.fn(() => ({
        fontSize: '16px',
        fontWeight: 'bold'
      }));

      const el = createMockElement('div');

      // Should not throw
      expect(() => cssScore(el)).not.toThrow();
    });
  });

  describe('contentScore', () => {
    it('should penalize too few words', () => {
      const text = 'Hi';
      expect(contentScore(text)).toBe(-40);
    });

    it('should penalize too many words', () => {
      const text = 'This is a very long headline with way too many words that goes on and on and on and should be penalized for being excessively wordy and verbose beyond reasonable limits for a headline with extra words';
      expect(contentScore(text)).toBe(-20);
    });

    it('should reward punctuation', () => {
      const text = 'This is a headline.';
      const score = contentScore(text);

      expect(score).toBeGreaterThan(0);
    });

    it('should reward digits', () => {
      const text = 'Company reports Q3 2024 earnings';
      const score = contentScore(text);

      expect(score).toBeGreaterThan(0);
    });

    it('should reward quotation marks', () => {
      const text = 'Mayor says "We will rebuild"';
      const score = contentScore(text);

      expect(score).toBeGreaterThan(0);
    });

    it('should handle various quote types', () => {
      const texts = [
        'Mayor says "We will rebuild"',
        'Mayor says "We will rebuild"',
        'Mayor says «We will rebuild»',
        'Mayor says »We will rebuild«'
      ];

      texts.forEach(text => {
        expect(contentScore(text)).toBeGreaterThan(0);
      });
    });

    it('should penalize very low lowercase ratio', () => {
      const text = 'THIS IS ALL CAPS HEADLINE';
      const score = contentScore(text);

      expect(score).toBeLessThan(-20);
    });

    it('should handle normal headlines well', () => {
      const text = 'President announces new climate initiative';
      const score = contentScore(text);

      // Normal headline should not be heavily penalized
      expect(score).toBeGreaterThan(-10);
    });

    it('should combine multiple positive signals', () => {
      const text = 'Company reports 25% growth in Q3: "Best quarter ever"';
      const score = contentScore(text);

      // Has punctuation, digits, and quotes
      expect(score).toBeGreaterThan(10);
    });
  });

  describe('computeCandidateScore', () => {
    it('should combine all scoring factors', () => {
      const el = createMockElement('h2', {}, { fontSize: '24px', fontWeight: '700' });
      const text = 'Breaking: Company announces merger.';

      const score = computeCandidateScore(el, text);

      // Should be positive from h2 tag, font size, font weight, punctuation
      expect(score).toBeGreaterThan(80);
    });

    it('should give bonus for card context', () => {
      const el = createMockElement('h3', { _closest: 'article' }, { fontSize: '20px' });
      el.closest = vi.fn((selector) => {
        if (selector.includes('article')) return {};
        return null;
      });

      const text = 'Headline in article card';
      const score = computeCandidateScore(el, text);

      // Should include +10 bonus for being in card
      const elNoCard = createMockElement('h3', {}, { fontSize: '20px' });
      const scoreNoCard = computeCandidateScore(elNoCard, text);

      expect(score).toBeGreaterThan(scoreNoCard);
    });

    it('should penalize likely kickers', () => {
      const el = createMockElement('div', { class: 'kicker' });
      const text = 'POLITICS';

      const score = computeCandidateScore(el, text);

      expect(score).toBeLessThan(0);
    });

    it('should penalize short anchor text without punctuation', () => {
      const el = createMockElement('a');
      const text = 'More';

      const score = computeCandidateScore(el, text);

      // Anchor tag (60) - short link penalty (24) = 36
      expect(score).toBeLessThan(50);
    });

    it('should not penalize longer anchor text', () => {
      const el = createMockElement('a');
      const text = 'Read the full story here';

      const score = computeCandidateScore(el, text);

      // Should not apply the -24 penalty
      expect(score).toBeGreaterThan(50);
    });

    it('should score perfect headline highly', () => {
      const el = createMockElement('h1', {}, { fontSize: '36px', fontWeight: '700' });
      el.closest = vi.fn((selector) => {
        if (selector.includes('article')) return {};
        return null;
      });

      const text = 'Major discovery announced: Scientists find cure for common cold';
      const score = computeCandidateScore(el, text);

      expect(score).toBeGreaterThan(150);
    });

    it('should score poor candidate lowly', () => {
      const el = createMockElement('span', { class: 'label' }, { fontSize: '11px' });
      const text = 'AD';

      const score = computeCandidateScore(el, text);

      expect(score).toBeLessThan(0);
    });
  });

  describe('isHardRejectText', () => {
    it('should reject elements in UI containers', () => {
      const el = createMockElement('div');
      el.closest = vi.fn((selector) => {
        if (selector.includes('.meta')) return {};
        return null;
      });

      expect(isHardRejectText(el, 'Some text')).toBe(true);
    });

    it('should reject common UI labels', () => {
      const labels = [
        'Comments',
        'Reply',
        'Share',
        'Watch',
        'Read more',
        'Subscribe',
        'Login',
        'Sign in',
        'Sign up',
        'Menu',
        'Next',
        'Previous',
        'Trending',
        'Latest'
      ];

      labels.forEach(label => {
        const el = createMockElement('a');
        expect(isHardRejectText(el, label)).toBe(true);
      });
    });

    it('should reject anchor with hash links', () => {
      const el = createMockElement('a', { href: '#comments' });
      el.tagName = 'A';

      expect(isHardRejectText(el, 'Jump to comments')).toBe(true);
    });

    it('should reject anchor with comment links', () => {
      const el = createMockElement('a', { href: '/article/comments' });
      el.tagName = 'A';

      expect(isHardRejectText(el, 'Comments')).toBe(true);
    });

    it('should reject very short text (≤2 words, no punctuation, <18 chars)', () => {
      const el = createMockElement('div');

      expect(isHardRejectText(el, 'Hi')).toBe(true);
      expect(isHardRejectText(el, 'Click here')).toBe(true);
      expect(isHardRejectText(el, 'New')).toBe(true);
    });

    it('should allow short text with punctuation', () => {
      const el = createMockElement('div');

      expect(isHardRejectText(el, 'New!')).toBe(false);
      expect(isHardRejectText(el, 'Wait... what?')).toBe(false);
    });

    it('should allow short text that is long enough', () => {
      const el = createMockElement('div');

      expect(isHardRejectText(el, 'This is longer text')).toBe(false);
    });

    it('should reject short all-caps text', () => {
      const el = createMockElement('div');

      expect(isHardRejectText(el, 'LIVE NOW')).toBe(true);
      expect(isHardRejectText(el, 'BREAKING')).toBe(true);
    });

    it('should allow short all-caps with punctuation', () => {
      const el = createMockElement('div');

      expect(isHardRejectText(el, 'Q&A:')).toBe(false);
    });

    it('should allow normal headlines', () => {
      const el = createMockElement('h2');

      expect(isHardRejectText(el, 'President announces new policy')).toBe(false);
      expect(isHardRejectText(el, 'Company reports strong earnings')).toBe(false);
    });

    it('should handle missing tagName gracefully', () => {
      const el = { closest: () => null };

      expect(() => isHardRejectText(el, 'Test')).not.toThrow();
    });

    it('should handle missing closest method gracefully', () => {
      const el = createMockElement('div');
      delete el.closest;

      expect(() => isHardRejectText(el, 'Test')).not.toThrow();
    });

    it('should reject UI containers by selector', () => {
      const containers = [
        '.meta',
        '.metadata',
        '.byline',
        '.tools',
        '.actions',
        '.card__meta',
        '.card__footer',
        '.post__meta'
      ];

      containers.forEach(container => {
        const el = createMockElement('div');
        el.closest = vi.fn((selector) => {
          if (selector.includes(container)) return {};
          return null;
        });

        expect(isHardRejectText(el, 'Some text')).toBe(true);
      });
    });
  });
});
