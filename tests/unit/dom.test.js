import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CFG } from '../../src/modules/config.js';
import { getCandidateElements, isStructuredContent } from '../../src/modules/dom.js';

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
