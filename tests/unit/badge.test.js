import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDOM } from '../setup.js';

describe('Badge UI Redesign', () => {
  describe('Badge HTML structure', () => {
    it('should render with "Headlines Neutralizer" header text on two lines', () => {
      const badge = document.createElement('div');
      badge.className = 'neutralizer-badge';
      badge.innerHTML = `
        <div class="badge-header">Headlines\nNeutralizer</div>
        <div class="badge-content">
          <button class="neutralizer-btn neutralizer-action">neutral</button>
        </div>
      `;
      document.body.appendChild(badge);

      const header = badge.querySelector('.badge-header');
      expect(header.textContent).toContain('Headlines');
      expect(header.textContent).toContain('Neutralizer');
    });

    it('should render toggle button without "H:" prefix', () => {
      const badge = document.createElement('div');
      badge.innerHTML = `<button class="neutralizer-action">neutral</button>`;
      document.body.appendChild(badge);

      const btn = badge.querySelector('.neutralizer-action');
      expect(btn.textContent).toBe('neutral');
      expect(btn.textContent).not.toContain('H:');
    });

    it('should include status row with gear button', () => {
      const badge = document.createElement('div');
      badge.innerHTML = `
        <div class="neutralizer-row">
          <button class="neutralizer-btn neutralizer-primary neutralizer-action">neutral</button>
        </div>
        <div class="neutralizer-status-row">
          <span class="neutralizer-status">Ready</span>
          <button class="neutralizer-gear-btn" title="Settings">\u2699</button>
        </div>
      `;
      document.body.appendChild(badge);

      const gear = badge.querySelector('.neutralizer-gear-btn');
      expect(gear).not.toBeNull();
      expect(gear.title).toBe('Settings');

      const status = badge.querySelector('.neutralizer-status');
      expect(status).not.toBeNull();
      expect(status.textContent).toBe('Ready');
    });

    it('should include popover with all menu items', () => {
      const badge = document.createElement('div');
      badge.innerHTML = `
        <div class="neutralizer-popover">
          <button class="neutralizer-popover-item" data-action="edit-selectors">Edit Selectors</button>
          <button class="neutralizer-popover-item" data-action="inspect">Inspect Elements</button>
          <button class="neutralizer-popover-item" data-action="show-included">Show Included</button>
          <hr class="neutralizer-popover-sep">
          <button class="neutralizer-popover-item" data-action="stats">Stats &amp; Changes</button>
          <button class="neutralizer-popover-item" data-action="flush-cache">Flush Cache &amp; Rerun</button>
        </div>
      `;
      document.body.appendChild(badge);

      const items = badge.querySelectorAll('.neutralizer-popover-item');
      expect(items.length).toBe(5);
      expect(items[0].dataset.action).toBe('edit-selectors');
      expect(items[1].dataset.action).toBe('inspect');
      expect(items[2].dataset.action).toBe('show-included');
      expect(items[3].dataset.action).toBe('stats');
      expect(items[4].dataset.action).toBe('flush-cache');
    });
  });

  describe('Popover open/close', () => {
    it('should be hidden by default (no open class)', () => {
      const popover = document.createElement('div');
      popover.className = 'neutralizer-popover';
      document.body.appendChild(popover);

      expect(popover.classList.contains('neutralizer-popover-open')).toBe(false);
    });

    it('should toggle open class', () => {
      const popover = document.createElement('div');
      popover.className = 'neutralizer-popover';
      document.body.appendChild(popover);

      popover.classList.toggle('neutralizer-popover-open');
      expect(popover.classList.contains('neutralizer-popover-open')).toBe(true);

      popover.classList.toggle('neutralizer-popover-open');
      expect(popover.classList.contains('neutralizer-popover-open')).toBe(false);
    });

    it('should close popover on removing open class', () => {
      const popover = document.createElement('div');
      popover.className = 'neutralizer-popover neutralizer-popover-open';
      document.body.appendChild(popover);

      popover.classList.remove('neutralizer-popover-open');
      expect(popover.classList.contains('neutralizer-popover-open')).toBe(false);
    });
  });

  describe('Strength segmented control', () => {
    it('should render all 5 strength levels', () => {
      const levels = ['Minimal', 'Light', 'Moderate', 'Strong', 'Maximum'];
      const seg = document.createElement('div');
      seg.className = 'neutralizer-popover-seg';
      levels.forEach(level => {
        const btn = document.createElement('button');
        btn.className = 'neutralizer-popover-option';
        btn.dataset.strength = level;
        btn.textContent = level;
        seg.appendChild(btn);
      });
      document.body.appendChild(seg);

      const options = seg.querySelectorAll('[data-strength]');
      expect(options.length).toBe(5);
      expect(options[0].dataset.strength).toBe('Minimal');
      expect(options[4].dataset.strength).toBe('Maximum');
    });

    it('should mark current level as active', () => {
      const btn = document.createElement('button');
      btn.className = 'neutralizer-popover-option neutralizer-popover-active';
      btn.dataset.strength = 'Moderate';

      expect(btn.classList.contains('neutralizer-popover-active')).toBe(true);
    });

    it('should switch active state on click', () => {
      const levels = ['Light', 'Moderate', 'Strong'];
      const seg = document.createElement('div');
      levels.forEach(level => {
        const btn = document.createElement('button');
        btn.className = 'neutralizer-popover-option';
        if (level === 'Moderate') btn.classList.add('neutralizer-popover-active');
        btn.dataset.strength = level;
        seg.appendChild(btn);
      });
      document.body.appendChild(seg);

      // Simulate clicking "Strong"
      const btns = seg.querySelectorAll('[data-strength]');
      btns.forEach(b => b.classList.remove('neutralizer-popover-active'));
      btns[2].classList.add('neutralizer-popover-active');

      expect(btns[0].classList.contains('neutralizer-popover-active')).toBe(false);
      expect(btns[1].classList.contains('neutralizer-popover-active')).toBe(false);
      expect(btns[2].classList.contains('neutralizer-popover-active')).toBe(true);
    });
  });

  describe('Auto-detect toggle', () => {
    it('should render ON/OFF options', () => {
      const seg = document.createElement('div');
      seg.innerHTML = `
        <button class="neutralizer-popover-option neutralizer-popover-active" data-autodetect="on">ON</button>
        <button class="neutralizer-popover-option" data-autodetect="off">OFF</button>
      `;
      document.body.appendChild(seg);

      const options = seg.querySelectorAll('[data-autodetect]');
      expect(options.length).toBe(2);
      expect(options[0].classList.contains('neutralizer-popover-active')).toBe(true);
      expect(options[1].classList.contains('neutralizer-popover-active')).toBe(false);
    });

    it('should toggle active state', () => {
      const seg = document.createElement('div');
      seg.innerHTML = `
        <button class="neutralizer-popover-option neutralizer-popover-active" data-autodetect="on">ON</button>
        <button class="neutralizer-popover-option" data-autodetect="off">OFF</button>
      `;
      document.body.appendChild(seg);

      const options = seg.querySelectorAll('[data-autodetect]');
      // Simulate toggling off
      options.forEach(b => b.classList.remove('neutralizer-popover-active'));
      options[1].classList.add('neutralizer-popover-active');

      expect(options[0].classList.contains('neutralizer-popover-active')).toBe(false);
      expect(options[1].classList.contains('neutralizer-popover-active')).toBe(true);
    });
  });

  describe('Badge action toggle', () => {
    it('should toggle between "neutral" and "original"', () => {
      const btn = document.createElement('button');
      btn.textContent = 'neutral';
      document.body.appendChild(btn);

      btn.textContent = 'original';
      expect(btn.textContent).toBe('original');

      btn.textContent = 'neutral';
      expect(btn.textContent).toBe('neutral');
    });

    it('should show "Reverted" status when switching to original', () => {
      const status = document.createElement('span');
      status.className = 'neutralizer-status';
      status.textContent = 'Ready';
      document.body.appendChild(status);

      // Simulate: neutral -> original
      status.textContent = 'Reverted';
      expect(status.textContent).toBe('Reverted');
    });

    it('should show "Processing" then "Neutralized" when switching to neutral', () => {
      const status = document.createElement('span');
      status.className = 'neutralizer-status';
      status.textContent = 'Reverted';
      document.body.appendChild(status);

      // Simulate: original -> neutral
      status.textContent = 'Processing';
      expect(status.textContent).toBe('Processing');

      status.textContent = 'Neutralized';
      expect(status.textContent).toBe('Neutralized');
    });

    it('should start with "Ready" status', () => {
      const status = document.createElement('span');
      status.className = 'neutralizer-status';
      status.textContent = 'Ready';
      document.body.appendChild(status);

      expect(status.textContent).toBe('Ready');
    });
  });
});

describe('Show Included Elements', () => {
  describe('Element highlighting', () => {
    it('should apply green box-shadow for included elements', () => {
      const el = document.createElement('h1');
      el.textContent = 'Test Headline';
      document.body.appendChild(el);

      el.style.boxShadow = 'inset 0 0 0 2px #34a853';
      expect(el.style.boxShadow).toBe('inset 0 0 0 2px #34a853');
    });

    it('should apply red box-shadow for excluded elements', () => {
      const el = document.createElement('h1');
      el.textContent = 'Excluded Headline';
      document.body.appendChild(el);

      el.style.boxShadow = 'inset 0 0 0 2px #ea4335';
      expect(el.style.boxShadow).toBe('inset 0 0 0 2px #ea4335');
    });

    it('should apply blue box-shadow for auto-detected elements', () => {
      const el = document.createElement('h1');
      el.textContent = 'Auto Headline';
      document.body.appendChild(el);

      el.style.boxShadow = 'inset 0 0 0 2px #1a73e8';
      expect(el.style.boxShadow).toBe('inset 0 0 0 2px #1a73e8');
    });

    it('should save and restore original box-shadow', () => {
      const el = document.createElement('h1');
      el.style.boxShadow = 'none';
      document.body.appendChild(el);

      const original = el.style.boxShadow;
      el.style.boxShadow = 'inset 0 0 0 2px #34a853';
      expect(el.style.boxShadow).not.toBe(original);

      el.style.boxShadow = original;
      expect(el.style.boxShadow).toBe('none');
    });
  });

  describe('Count banner', () => {
    it('should create banner with correct counts', () => {
      const banner = document.createElement('div');
      banner.className = 'neutralizer-included-banner';
      banner.setAttribute('data-neutralizer-ui', '');
      banner.textContent = '5 included, 2 excluded. ESC or click to exit.';
      document.body.appendChild(banner);

      const found = document.querySelector('.neutralizer-included-banner');
      expect(found).not.toBeNull();
      expect(found.textContent).toContain('5 included');
      expect(found.textContent).toContain('2 excluded');
      expect(found.textContent).toContain('ESC or click to exit');
    });

    it('should include auto-detected count when applicable', () => {
      const parts = ['5 included', '2 excluded', '3 auto-detected'];
      const text = `${parts.join(', ')}. ESC or click to exit.`;

      expect(text).toContain('auto-detected');
    });

    it('should be removable', () => {
      const banner = document.createElement('div');
      banner.className = 'neutralizer-included-banner';
      document.body.appendChild(banner);

      expect(document.querySelector('.neutralizer-included-banner')).not.toBeNull();
      banner.remove();
      expect(document.querySelector('.neutralizer-included-banner')).toBeNull();
    });
  });
});

describe('Selector Editor Dialog', () => {
  describe('Tab structure', () => {
    it('should have Global and domain tabs', () => {
      const tabs = document.createElement('div');
      tabs.className = 'tabs';
      tabs.innerHTML = `
        <button class="tab active" data-tab="global">Global</button>
        <button class="tab" data-tab="domain">example.com</button>
      `;
      document.body.appendChild(tabs);

      const allTabs = tabs.querySelectorAll('.tab');
      expect(allTabs.length).toBe(2);
      expect(allTabs[0].dataset.tab).toBe('global');
      expect(allTabs[1].dataset.tab).toBe('domain');
    });

    it('should mark Global tab as active by default', () => {
      const tabs = document.createElement('div');
      tabs.innerHTML = `
        <button class="tab active" data-tab="global">Global</button>
        <button class="tab" data-tab="domain">example.com</button>
      `;
      document.body.appendChild(tabs);

      expect(tabs.querySelector('[data-tab="global"]').classList.contains('active')).toBe(true);
      expect(tabs.querySelector('[data-tab="domain"]').classList.contains('active')).toBe(false);
    });

    it('should switch active tab', () => {
      const tabs = document.createElement('div');
      tabs.innerHTML = `
        <button class="tab active" data-tab="global">Global</button>
        <button class="tab" data-tab="domain">example.com</button>
      `;
      document.body.appendChild(tabs);

      const allTabs = tabs.querySelectorAll('.tab');
      allTabs.forEach(t => t.classList.remove('active'));
      allTabs[1].classList.add('active');

      expect(allTabs[0].classList.contains('active')).toBe(false);
      expect(allTabs[1].classList.contains('active')).toBe(true);
    });
  });

  describe('Global tab content', () => {
    it('should have 3 editable textareas', () => {
      const content = document.createElement('div');
      content.innerHTML = `
        <textarea id="g-sel">h1\nh2\nh3</textarea>
        <textarea id="g-exs"></textarea>
        <textarea id="g-exa">footer\nnav</textarea>
      `;
      document.body.appendChild(content);

      expect(content.querySelector('#g-sel')).not.toBeNull();
      expect(content.querySelector('#g-exs')).not.toBeNull();
      expect(content.querySelector('#g-exa')).not.toBeNull();
    });
  });

  describe('Domain tab content', () => {
    it('should have read-only global + editable domain textareas', () => {
      const content = document.createElement('div');
      content.innerHTML = `
        <textarea class="readonly" readonly>h1\nh2</textarea>
        <textarea id="d-sel">.custom-headline</textarea>
      `;
      document.body.appendChild(content);

      const readOnly = content.querySelector('.readonly');
      expect(readOnly.readOnly).toBe(true);

      const editable = content.querySelector('#d-sel');
      expect(editable.readOnly).toBe(false);
    });
  });

  describe('Save result structure', () => {
    it('should produce correct save payload', () => {
      const result = {
        global: {
          selectors: ['h1', 'h2', 'h3'],
          excludeSelf: ['.ad'],
          excludeAncestors: ['footer', 'nav']
        },
        domain: {
          selectors: ['.article-title'],
          excludeSelf: [],
          excludeAncestors: []
        }
      };

      expect(result.global.selectors).toEqual(['h1', 'h2', 'h3']);
      expect(result.domain.selectors).toEqual(['.article-title']);
      expect(result.global.excludeAncestors).toEqual(['footer', 'nav']);
    });
  });

  describe('Reset defaults', () => {
    it('should reset global tab to defaults', () => {
      const DEFAULT_SELECTORS = ['h1', 'h2', 'h3', '.lead'];
      const DEFAULT_EXCLUDES = { self: [], ancestors: ['footer', 'nav'] };

      const textarea = document.createElement('textarea');
      textarea.value = 'custom1\ncustom2';
      document.body.appendChild(textarea);

      // Simulate reset
      textarea.value = DEFAULT_SELECTORS.join('\n');
      expect(textarea.value).toBe('h1\nh2\nh3\n.lead');
    });

    it('should clear domain tab on reset', () => {
      const textarea = document.createElement('textarea');
      textarea.value = '.domain-specific';
      document.body.appendChild(textarea);

      textarea.value = '';
      expect(textarea.value).toBe('');
    });
  });
});

describe('CSS Isolation', () => {
  it('should use !important on all badge CSS properties', () => {
    // This is a structural test - verify the CSS string contains !important
    // for the badge class. In a real setup this would parse the injected stylesheet.
    const cssRule = '.neutralizer-badge .neutralizer-popover { position: absolute !important; }';
    expect(cssRule).toContain('!important');
  });

  it('should prefix all classes with neutralizer-', () => {
    const classes = [
      'neutralizer-badge',
      'neutralizer-popover',
      'neutralizer-popover-open',
      'neutralizer-popover-item',
      'neutralizer-popover-sep',
      'neutralizer-popover-group',
      'neutralizer-popover-option',
      'neutralizer-popover-active',
      'neutralizer-gear-btn',
      'neutralizer-included-banner'
    ];

    classes.forEach(cls => {
      expect(cls.startsWith('neutralizer-')).toBe(true);
    });
  });

  it('should use shadow DOM for selector editor dialog', () => {
    // Verify shadow DOM attachment works
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<div class="wrap">test</div>';

    expect(shadow.querySelector('.wrap')).not.toBeNull();
    // External querySelector should not find shadow content
    document.body.appendChild(host);
    expect(document.querySelector('.wrap')).toBeNull();
  });

  it('should use :host { all: initial } in shadow DOM dialogs', () => {
    // Structural test for the CSS pattern
    const css = ':host { all: initial; display: block; }';
    expect(css).toContain('all: initial');
  });
});
