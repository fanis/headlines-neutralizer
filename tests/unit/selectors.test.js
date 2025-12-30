import { describe, it, expect } from 'vitest';
import {
  globToRegExp,
  domainPatternToRegex,
  listMatchesHost,
  compiledSelectors
} from '../../src/modules/selectors.js';

describe('Selector and Domain Matching', () => {
  describe('globToRegExp', () => {
    it('should match exact strings', () => {
      const regex = globToRegExp('example.com');
      expect(regex.test('example.com')).toBe(true);
      expect(regex.test('other.com')).toBe(false);
    });

    it('should handle wildcards', () => {
      const regex = globToRegExp('*.example.com');
      expect(regex.test('sub.example.com')).toBe(true);
      expect(regex.test('www.example.com')).toBe(true);
      expect(regex.test('example.com')).toBe(false); // Wildcard requires at least one char
      expect(regex.test('other.com')).toBe(false);
    });

    it('should handle question mark for single char', () => {
      const regex = globToRegExp('example.co?');
      expect(regex.test('example.com')).toBe(true);
      expect(regex.test('example.co')).toBe(false);
    });

    it('should be case insensitive', () => {
      const regex = globToRegExp('Example.COM');
      expect(regex.test('example.com')).toBe(true);
      expect(regex.test('EXAMPLE.COM')).toBe(true);
    });
  });

  describe('domainPatternToRegex', () => {
    it('should handle plain domain', () => {
      const regex = domainPatternToRegex('example.com');
      expect(regex.test('example.com')).toBe(true);
      expect(regex.test('sub.example.com')).toBe(true);
      expect(regex.test('other.com')).toBe(false);
    });

    it('should handle regex patterns', () => {
      const regex = domainPatternToRegex('/example\\.com$/');
      expect(regex.test('example.com')).toBe(true);
      expect(regex.test('sub.example.com')).toBe(true);
    });

    it('should handle wildcards', () => {
      const regex = domainPatternToRegex('*.example.com');
      expect(regex.test('sub.example.com')).toBe(true);
      expect(regex.test('www.example.com')).toBe(true);
      expect(regex.test('example.com')).toBe(false); // Wildcard requires subdomain
    });

    it('should return null for empty string', () => {
      const regex = domainPatternToRegex('');
      expect(regex).toBeNull();
    });

    it('should return null for invalid regex', () => {
      const regex = domainPatternToRegex('/[invalid/');
      expect(regex).toBeNull();
    });
  });

  describe('listMatchesHost', () => {
    it('should match when pattern is in list', () => {
      const list = ['example.com', 'test.com'];
      expect(listMatchesHost(list, 'example.com')).toBe(true);
    });

    it('should not match when pattern not in list', () => {
      const list = ['example.com', 'test.com'];
      expect(listMatchesHost(list, 'other.com')).toBe(false);
    });

    it('should match with wildcards', () => {
      const list = ['*.example.com'];
      expect(listMatchesHost(list, 'sub.example.com')).toBe(true);
      expect(listMatchesHost(list, 'other.com')).toBe(false);
    });

    it('should handle empty list', () => {
      expect(listMatchesHost([], 'example.com')).toBe(false);
    });
  });

  describe('compiledSelectors', () => {
    it('should join selectors with comma', () => {
      const SELECTORS = ['h1', 'h2', '.headline'];
      expect(compiledSelectors(SELECTORS)).toBe('h1,h2,.headline');
    });

    it('should handle empty selectors', () => {
      const SELECTORS = [];
      expect(compiledSelectors(SELECTORS)).toBe('');
    });
  });
});
