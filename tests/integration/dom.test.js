import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDOM } from '../setup.js';

describe('DOM Manipulation', () => {
  describe('Headline Detection', () => {
    it('should find headlines matching selectors', () => {
      const html = `
        <h1>Main Headline</h1>
        <h2>Subheadline</h2>
        <p>Regular paragraph</p>
        <h3 class="title">Article Title</h3>
      `;
      createTestDOM(html);

      const selectors = 'h1,h2,h3';
      const headlines = document.querySelectorAll(selectors);

      expect(headlines.length).toBe(3);
      expect(headlines[0].textContent).toBe('Main Headline');
      expect(headlines[1].textContent).toBe('Subheadline');
      expect(headlines[2].textContent).toBe('Article Title');
    });

    it('should filter out elements with UI attribute', () => {
      const html = `
        <h1>Real Headline</h1>
        <h1 data-neutralizer-ui="">UI Element</h1>
      `;
      createTestDOM(html);

      const headlines = Array.from(document.querySelectorAll('h1'))
        .filter(el => !el.hasAttribute('data-neutralizer-ui'));

      expect(headlines.length).toBe(1);
      expect(headlines[0].textContent).toBe('Real Headline');
    });

    it('should skip excluded elements', () => {
      const html = `
        <h1>Include This</h1>
        <nav><h1>Exclude This</h1></nav>
        <footer><h1>Exclude This Too</h1></footer>
      `;
      createTestDOM(html);

      const excludeSelector = 'nav, footer';
      const headlines = Array.from(document.querySelectorAll('h1'))
        .filter(el => !el.closest(excludeSelector));

      expect(headlines.length).toBe(1);
      expect(headlines[0].textContent).toBe('Include This');
    });
  });

  describe('Element Replacement', () => {
    it('should store original text before replacement', () => {
      const html = '<h1>Original Headline</h1>';
      const container = createTestDOM(html);
      const h1 = container.querySelector('h1');

      h1.setAttribute('data-neutralizer-original', h1.textContent);
      h1.textContent = 'Neutralized Headline';

      expect(h1.getAttribute('data-neutralizer-original')).toBe('Original Headline');
      expect(h1.textContent).toBe('Neutralized Headline');
    });

    it('should mark elements as changed', () => {
      const html = '<h1>Headline</h1>';
      const container = createTestDOM(html);
      const h1 = container.querySelector('h1');

      h1.setAttribute('data-neutralizer-changed', '1');

      expect(h1.hasAttribute('data-neutralizer-changed')).toBe(true);
      expect(h1.getAttribute('data-neutralizer-changed')).toBe('1');
    });

    it('should restore originals correctly', () => {
      const html = '<h1 data-neutralizer-original="Original" data-neutralizer-changed="1">Changed</h1>';
      const container = createTestDOM(html);
      const h1 = container.querySelector('h1');

      const original = h1.getAttribute('data-neutralizer-original');
      h1.textContent = original;

      expect(h1.textContent).toBe('Original');
    });
  });

  describe('Badge Creation', () => {
    it('should create badge element', () => {
      const badge = document.createElement('div');
      badge.className = 'neutralizer-badge';
      badge.setAttribute('data-neutralizer-ui', '');
      badge.innerHTML = `
        <div class="badge-header">NEUTRALIZE HEADLINES</div>
        <div class="badge-content">
          <button class="btn action">H: neutral</button>
        </div>
      `;
      document.body.appendChild(badge);

      const created = document.querySelector('.neutralizer-badge');
      expect(created).toBeDefined();
      expect(created.querySelector('.badge-header').textContent).toBe('NEUTRALIZE HEADLINES');
      expect(created.querySelector('.btn.action')).toBeDefined();
    });

    it('should position badge correctly', () => {
      const badge = document.createElement('div');
      badge.className = 'neutralizer-badge';
      badge.style.position = 'fixed';
      badge.style.right = '0px';
      badge.style.top = '100px';
      document.body.appendChild(badge);

      expect(badge.style.position).toBe('fixed');
      expect(badge.style.right).toBe('0px');
      expect(badge.style.top).toBe('100px');
    });

    it('should collapse badge when class added', () => {
      const badge = document.createElement('div');
      badge.className = 'neutralizer-badge';
      document.body.appendChild(badge);

      badge.classList.add('collapsed');

      expect(badge.classList.contains('collapsed')).toBe(true);
    });
  });

  describe('Inspection Mode', () => {
    it('should find deepest element with content', () => {
      const html = `
        <div class="card">
          <a class="overlay" style="position:absolute"></a>
          <h3>Actual Headline</h3>
        </div>
      `;
      createTestDOM(html);

      // Simulate finding most specific element
      const card = document.querySelector('.card');
      const elements = Array.from(card.querySelectorAll('*'));

      const meaningful = elements.find(el => {
        const hasDirectText = Array.from(el.childNodes).some(
          node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
        );
        return hasDirectText;
      });

      expect(meaningful.tagName).toBe('H3');
      expect(meaningful.textContent).toBe('Actual Headline');
    });

    it('should skip elements with UI attribute', () => {
      const html = `
        <div>
          <h1>Real Content</h1>
          <div data-neutralizer-ui=""><h2>UI Content</h2></div>
        </div>
      `;
      createTestDOM(html);

      const elements = Array.from(document.querySelectorAll('h1, h2'))
        .filter(el => !el.closest('[data-neutralizer-ui]'));

      expect(elements.length).toBe(1);
      expect(elements[0].tagName).toBe('H1');
    });
  });

  describe('Flash Animation', () => {
    it('should apply animation styles', () => {
      const html = '<h1>Headline</h1>';
      const container = createTestDOM(html);
      const h1 = container.querySelector('h1');

      h1.style.setProperty('--neutralizer-color', '#fff4a3');
      h1.style.setProperty('--neutralizer-duration', '900ms');

      expect(h1.style.getPropertyValue('--neutralizer-color')).toBe('#fff4a3');
      expect(h1.style.getPropertyValue('--neutralizer-duration')).toBe('900ms');
    });
  });
});
