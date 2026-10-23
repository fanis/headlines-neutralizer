import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CFG } from '../../src/modules/config.js';
import { getCandidateElements, isStructuredContent } from '../../src/modules/dom.js';
import { diagnoseElement } from '../../src/modules/inspection.js';

const NO_EXCLUDES = { self: [], ancestors: [] };

// Accordion summary block as rendered on politis.com.cy (mobile): the whole
// AI summary, bullet list included, sits inside an <h3><button>
const SUMMARY_HTML = `
  <h1 class="title-main">Lawsuit filed against beverage maker over occupied factory</h1>
  <h3 class="flex summary-heading">
    <button type="button">
      <div>Summary by POLITIS</div>
      <ul>
        <li>Businessmen filed a lawsuit with the district court.</li>
        <li>The lawsuit concerns a factory and a field.</li>
      </ul>
    </button>
  </h3>
`;

describe('isStructuredContent', () => {
  it('detects elements that contain lists or tables', () => {
    const div = document.createElement('div');
    div.innerHTML = '<span>Heading</span><ul><li>One</li></ul>';
    expect(isStructuredContent(div)).toBe(true);

    div.innerHTML = '<table><tr><td>Cell</td></tr></table>';
    expect(isStructuredContent(div)).toBe(true);
  });

  it('detects an element that is itself a list', () => {
    const ul = document.createElement('ul');
    ul.innerHTML = '<li>First item text</li><li>Second item text</li>';
    expect(isStructuredContent(ul)).toBe(true);
  });

  it('does not flag plain or nested-link headlines', () => {
    const h2 = document.createElement('h2');
    h2.innerHTML = '<a href="#"><span>Plain headline text here</span></a>';
    expect(isStructuredContent(h2)).toBe(false);
  });
});

describe('getCandidateElements', () => {
  let autoDetect;
  beforeEach(() => {
    autoDetect = CFG.autoDetect;
    CFG.autoDetect = false;
    document.body.innerHTML = SUMMARY_HTML;
  });
  afterEach(() => { CFG.autoDetect = autoDetect; });

  it('skips a heading that wraps a summary list', () => {
    const els = getCandidateElements(document, ['h1', 'h3'], NO_EXCLUDES).map(r => r.el);
    expect(els).toContain(document.querySelector('h1'));
    expect(els.some(el => el.closest('h3'))).toBe(false);
  });

  it('skips selector matches shorter than the minimum length, such as section labels', () => {
    document.body.innerHTML = `
      <h2>Sport</h2>
      <h2><a href="#">Κόσμος</a></h2>
      <h2>Council approves new budget for schools</h2>
    `;
    const els = getCandidateElements(document, ['h2'], NO_EXCLUDES).map(r => r.el);
    expect(els.map(el => el.textContent)).toEqual(['Council approves new budget for schools']);
  });

  it('applies a self exclusion on the matched element to its inner text host', () => {
    document.body.innerHTML = `
      <h3 class="accordion"><button type="button">A heading wrapped in a button element</button></h3>
      <h3>Another heading that should still be found</h3>
    `;
    const excludes = { self: ['h3.accordion'], ancestors: [] };
    const els = getCandidateElements(document, ['h3'], excludes).map(r => r.el);
    expect(els).toHaveLength(1);
    expect(els[0].textContent).toBe('Another heading that should still be found');
  });
});

describe('diagnoseElement', () => {
  beforeEach(() => {
    // jsdom has no CSS.escape, which generateCSSSelector uses
    globalThis.CSS ??= { escape: (s) => String(s) };
    document.body.innerHTML = SUMMARY_HTML;
  });

  it('reports a matched heading that wraps a list as skipped, not processed', () => {
    const h3 = document.querySelector('h3');
    const diag = diagnoseElement(h3, ['h1', 'h3'], [], NO_EXCLUDES, NO_EXCLUDES, NO_EXCLUDES);
    expect(diag.isProcessed).toBe(false);
    expect(diag.skipReasons).toHaveLength(1);
    expect(diag.skipReasons[0]).toMatch(/list, table or quote/);
  });

  it('reports a matched plain headline as processed with no skip reasons', () => {
    const h1 = document.querySelector('h1');
    const diag = diagnoseElement(h1, ['h1', 'h3'], [], NO_EXCLUDES, NO_EXCLUDES, NO_EXCLUDES);
    expect(diag.isProcessed).toBe(true);
    expect(diag.skipReasons).toEqual([]);
  });

  it('reports a short section label as skipped', () => {
    const h2 = document.createElement('h2');
    h2.textContent = 'Sport';
    document.body.appendChild(h2);
    const diag = diagnoseElement(h2, ['h2'], [], NO_EXCLUDES, NO_EXCLUDES, NO_EXCLUDES);
    expect(diag.isProcessed).toBe(false);
    expect(diag.skipReasons[0]).toMatch(/minimum for headlines/);
  });

  it('reports selector matches over the length limit as skipped', () => {
    const h3 = document.createElement('h3');
    h3.textContent = 'word '.repeat(Math.ceil(CFG.sanityCheckLen / 5) + 5);
    document.body.appendChild(h3);
    const diag = diagnoseElement(h3, ['h3'], [], NO_EXCLUDES, NO_EXCLUDES, NO_EXCLUDES);
    expect(diag.isProcessed).toBe(false);
    expect(diag.skipReasons[0]).toMatch(/limit for selector matches/);
  });
});
