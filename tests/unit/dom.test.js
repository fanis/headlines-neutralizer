import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CFG } from '../../src/modules/config.js';
import { getCandidateElements, isStructuredContent, isArticlePage } from '../../src/modules/dom.js';
import { diagnoseElement, showIncludedElements, exitIncludedElements } from '../../src/modules/inspection.js';

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

  it('skips matches under 3 words or 8 characters, such as section labels', () => {
    document.body.innerHTML = `
      <h2>Sport</h2>
      <h2><a href="#">Κόσμος</a></h2>
      <h2>Most read</h2>
      <h2>ΣΧΕΤΙΚΑ ΝΕΑ</h2>
      <h2>Ενας βάρβαρος πόλεμος</h2>
      <h2>Council approves new budget for schools</h2>
    `;
    const els = getCandidateElements(document, ['h2'], NO_EXCLUDES).map(r => r.el);
    expect(els.map(el => el.textContent)).toEqual(['Ενας βάρβαρος πόλεμος', 'Council approves new budget for schools']);
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

const ARTICLE_LD = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"x"}</script>';

// Article page: headline, intro and subheading inside the article, plus
// related links below it
const ARTICLE_HTML = `
  <article>
    <h1>Lawsuit filed against beverage maker over occupied factory</h1>
    <h2 class="lead">Before filing, the owners wrote to the companies asking them to leave</h2>
    <div itemprop="articleBody">
      <p>Body text.</p>
      <h3>India: «This is only the beginning!»</h3>
    </div>
    <section class="related">
      <h3><a href="/other">Earthquake shakes Tibet, sixteen dead and hundreds of homes destroyed</a></h3>
    </section>
  </article>
  <aside class="most-read"><h3><a href="/third">Flood risk map shows the 43 most exposed areas</a></h3></aside>
`;

describe('isArticlePage', () => {
  afterEach(() => { document.head.innerHTML = ''; });
  const ld = (json) => { document.head.innerHTML = `<script type="application/ld+json">${json}</script>`; };

  it('detects a top-level JSON-LD article type', () => {
    ld('{"@type":"NewsArticle"}');
    expect(isArticlePage()).toBe(true);
    ld('[{"@type":"WebPage"},{"@type":["Article","Thing"]}]');
    expect(isArticlePage()).toBe(true);
    ld('{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"ReportageNewsArticle"}]}');
    expect(isArticlePage()).toBe(true);
  });

  it('does not treat listings, live blogs or og:type alone as articles', () => {
    ld('{"@type":"ItemList","itemListElement":[{"@type":"NewsArticle"},{"@type":"NewsArticle"}]}');
    expect(isArticlePage()).toBe(false);
    ld('{"@type":"LiveBlogPosting"}');
    expect(isArticlePage()).toBe(false);
    document.head.innerHTML = '<meta property="og:type" content="article">';
    expect(isArticlePage()).toBe(false);
  });

  it('ignores invalid JSON-LD', () => {
    ld('{"@type": "NewsArticle",');
    expect(isArticlePage()).toBe(false);
  });
});

describe('getCandidateElements on article pages', () => {
  let autoDetect;
  beforeEach(() => {
    autoDetect = CFG.autoDetect;
    CFG.autoDetect = false;
    document.body.innerHTML = ARTICLE_HTML;
  });
  afterEach(() => { CFG.autoDetect = autoDetect; document.head.innerHTML = ''; });
  const texts = () => getCandidateElements(document, ['h1', 'h2', 'h3'], NO_EXCLUDES).map(r => r.el.textContent);

  it('keeps the headline and links to other articles, skipping the article text', () => {
    document.head.innerHTML = ARTICLE_LD;
    expect(texts()).toEqual([
      'Lawsuit filed against beverage maker over occupied factory',
      'Earthquake shakes Tibet, sixteen dead and hundreds of homes destroyed',
      'Flood risk map shows the 43 most exposed areas'
    ]);
  });

  it('keeps everything when the page is not an article', () => {
    expect(texts()).toHaveLength(5);
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
    expect(diag.skipReasons[0]).toMatch(/too short to be a headline/);
  });

  it('reports selector matches over the length limit as skipped', () => {
    const h3 = document.createElement('h3');
    h3.textContent = 'word '.repeat(Math.ceil(CFG.sanityCheckLen / 5) + 5);
    document.body.appendChild(h3);
    const diag = diagnoseElement(h3, ['h3'], [], NO_EXCLUDES, NO_EXCLUDES, NO_EXCLUDES);
    expect(diag.isProcessed).toBe(false);
    expect(diag.skipReasons[0]).toMatch(/limit for selector matches/);
  });

  it('reports article text on an article page as skipped', () => {
    document.head.innerHTML = ARTICLE_LD;
    document.body.innerHTML = ARTICLE_HTML;
    const lead = document.querySelector('h2.lead');
    const diag = diagnoseElement(lead, ['h2'], [], NO_EXCLUDES, NO_EXCLUDES, NO_EXCLUDES);
    document.head.innerHTML = '';
    expect(diag.isProcessed).toBe(false);
    expect(diag.skipReasons[0]).toMatch(/article text on an article page/);
  });
});

describe('showIncludedElements auto-detected highlighting', () => {
  const BLUE = 'inset 0 0 0 2px #1a73e8';
  let autoDetect;
  beforeEach(() => {
    autoDetect = CFG.autoDetect;
    CFG.autoDetect = true;
    // jsdom has no layout, so auto-detect would treat every element as hidden
    Element.prototype.checkVisibility = () => true;
    document.body.innerHTML = `
      <article class="card">
        <h2><a href="/a" style="font-size: 24px; font-weight: 700">Council approves new budget for schools after long debate</a></h2>
        <div class="byline"><h4>Stefanos Evripidou</h4></div>
      </article>
    `;
  });
  afterEach(() => {
    exitIncludedElements();
    CFG.autoDetect = autoDetect;
    delete Element.prototype.checkVisibility;
  });

  it('highlights only what processing picks, not every heading auto-detect considers', () => {
    showIncludedElements([], NO_EXCLUDES);
    const blue = [...document.querySelectorAll('article *')].filter(el => el.style.boxShadow === BLUE);
    expect(blue.map(el => el.textContent)).toEqual(['Council approves new budget for schools after long debate']);
    expect(document.querySelector('.neutralizer-included-banner').textContent).toMatch(/1 auto-detected/);
  });
});
