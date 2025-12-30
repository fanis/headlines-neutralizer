# Manual Testing Checklist

Before each release or after major changes, verify these core features work correctly.

## Setup

1. Install the userscript in Tampermonkey/Violentmonkey
2. Set your OpenAI API key via the menu
3. Use the test page: `tests/manual/test-page.html`

## Pre-Release Checklist

### Core Functionality
- [ ] **Badge appears** on page load (bottom right)
- [ ] **Headlines are detected** (check various h1-h6 elements)
- [ ] **Headlines are neutralized** (sensational text becomes calmer)
- [ ] **Original text is preserved** (in `data-neutralizer-original` attribute)
- [ ] **Flash animation** plays when headlines change

### Badge Controls
- [ ] **H: neutral/original toggle** switches text back and forth
- [ ] **🔍 Inspect button** enters inspection mode
- [ ] **Badge handle (◀/▶)** collapses and expands badge
- [ ] **Badge is draggable** via header (when expanded)
- [ ] **Badge position persists** after page reload
- [ ] **Collapsed state persists** after page reload

### Inspection Mode
- [ ] **Overlay appears** with instruction message
- [ ] **Cursor changes** to crosshair
- [ ] **Hovering** highlights elements
- [ ] **Clicking** shows diagnostic dialog
- [ ] **Dialog shows** why element is/isn't being processed
- [ ] **ESC key** exits inspection mode
- [ ] **Most specific element** is selected (not overlay links)

### Menu Commands
- [ ] **Neutralization strength** opens dialog with 5 levels
- [ ] **Toggle auto-detect** enables/disables detection
- [ ] **Toggle DEBUG logs** shows/hides console messages
- [ ] **Toggle badge** shows/hides badge
- [ ] **Show stats & changes** displays diff audit dialog
- [ ] **Process visible now** manually triggers neutralization
- [ ] **Flush headline cache & rerun** clears and reprocesses
- [ ] **Reset stats counters** zeroes badge counts
- [ ] **Reset API usage stats** clears token tracking

### Settings Persistence
- [ ] Neutralization strength setting persists
- [ ] Auto-detect toggle persists
- [ ] Badge show/hide persists
- [ ] Badge collapsed state persists
- [ ] Badge position persists
- [ ] Domain allow/deny lists persist
- [ ] Per-domain selector additions persist

### Domain Controls
- [ ] **Domain allow/deny mode** can be toggled
- [ ] **Domain patterns** can be added/removed
- [ ] **Wildcards** work in domain patterns (`*.example.com`)
- [ ] **Per-domain selectors** can be added
- [ ] **Per-domain exclusions** can be added

### Exclusions
- [ ] Elements in `<nav>` are **not** processed
- [ ] Elements in `<footer>` are **not** processed
- [ ] Elements with class `.menu` are **not** processed
- [ ] Elements with class `.sidebar` are **not** processed
- [ ] Custom exclusions work when added

### Cache Behavior
- [ ] **First visit** makes API call (check network tab)
- [ ] **Reload page** uses cache (no new API call)
- [ ] **Cache persists** across browser restarts
- [ ] **Different text** makes new API call
- [ ] **Cache statistics** shown in diff audit dialog

### API & Pricing
- [ ] **API calls** increment token counters
- [ ] **Token usage** displayed in stats dialog
- [ ] **Cost calculation** appears correct
- [ ] **Pricing configuration** can be updated
- [ ] **Reset to defaults** restores default pricing

### Edge Cases
- [ ] **No API key** shows key dialog
- [ ] **Invalid API key** shows error message
- [ ] **Network error** shows friendly error
- [ ] **Empty page** doesn't crash
- [ ] **Very long headlines** trigger sanity check dialog
- [ ] **Dynamic content** (AJAX-loaded) is detected

### Cross-Site Compatibility
Test on these real sites (or similar):
- [ ] **News site** (e.g., CNN, BBC)
- [ ] **Blog** (e.g., Medium)
- [ ] **Reddit** (card layout)
- [ ] **Twitter/X** (dynamic loading)
- [ ] **Site with overlay links** (like the card example)

## Test Scenarios

### Scenario 1: First-Time User
1. Install userscript
2. Visit test page
3. Should see: API key dialog
4. Enter key
5. Should see: badge appears, headlines neutralized

### Scenario 2: Returning User
1. Visit test page with key already set
2. Should see: immediate neutralization (from cache)
3. Badge shows correct state

### Scenario 3: Toggle Original/Neutral
1. Visit test page
2. Headlines should be neutral
3. Click "H: neutral" button
4. Headlines revert to original
5. Button now says "H: original"
6. Click again
7. Headlines become neutral again

### Scenario 4: Inspection Mode
1. Click 🔍 Inspect
2. Hover over various elements
3. Click on a headline
4. Should see: diagnostic dialog with selector info
5. Dialog explains why element is/isn't processed

### Scenario 5: Domain Deny
1. Visit test page
2. Open menu → Domain controls
3. Add current domain to deny list
4. Reload page
5. Should see: no processing, no badge

### Scenario 6: Cache Flush
1. Visit test page (headlines cached)
2. Open menu → Flush headline cache & rerun
3. Should see: new API call, headlines re-neutralized

## Performance Checks

- [ ] **Page load time** not significantly impacted
- [ ] **Memory usage** reasonable (check DevTools)
- [ ] **No console errors** (unless DEBUG mode)
- [ ] **Smooth animations** (flash effect, badge transitions)
- [ ] **Responsive interactions** (buttons, toggles)

## Regression Tests

After fixing bugs, verify:
- [ ] Original bug is fixed
- [ ] Related functionality still works
- [ ] No new bugs introduced

## Notes

- Use browser DevTools Console to see DEBUG logs
- Use Network tab to verify API calls
- Use Application tab to inspect localStorage
- Screenshots can help document issues

---

Run the full checklist before each release. After bug fixes or refactoring, test relevant sections. During active development, run smoke tests weekly.
