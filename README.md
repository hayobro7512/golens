# GoLens

🥈 **2nd place** at the Superhuman/Grammarly-hosted hackathon.

**Make any web page's text readable to a Superhuman Go agent.** Go's "While writing" agents underline text, but only inside editable fields. Terms, price lists, policies, banners and product pages are not editable, so Go ignores them. GoLens fixes that with a small content script, and scaffolds the extension and agent for you.

Built for Sleuth ([hayobro7512/sleuth](https://github.com/hayobro7512/sleuth)), which uses it to underline pressure tactics on checkout pages.

## How it works
Go scans a text field only when it sees the field focused during a real click. GoLens therefore:
1. **Finds** the regions you care about (text matching your keywords, grown to the surrounding block, ranked, up to 8).
2. **Makes them editable** (`contenteditable`) on the user's next click. Links and buttons inside stay clickable.
3. **Focuses them one at a time**, 1.2 s apart, from a timer started inside that click. One click scans every region.
4. **Locks the text.** Typing, paste, drop and cut are blocked, and any change that lands right after a click (for example an accepted suggestion) is reverted. The page text never changes.
5. Pads short regions to 40 px without moving the text, because Go ignores shorter fields.

Go draws its own underlines and cards. You write no overlay code.

## Make your own (5 minutes)
Needs Node 18+, Chrome, and a Superhuman Go account.
```sh
git clone https://github.com/hayobro7512/golens && cd golens
node create.js ../refund-lens --name "Refund Lens" \
  --hosts "https://*.shop.com/*" --keywords "refund|restocking|warranty" \
  --flag "terms that limit refunds or returns"
```
1. Chrome → `chrome://extensions` → Developer mode → Load unpacked → pick `../refund-lens`.
2. go.superhuman.com → builder → new agent → paste `refund-lens/agent-instructions.md`. Add the **While writing** trigger and paste the trigger line from the bottom of that file.
3. Open a matching page and click once. Go underlines the matching text. Click an underline for Go's explanation.

## Use it as a library
```html
<script src="golens.js"></script>
<script>const lens = GoLens.start({ keywords: /refund|warranty/i });</script>
```
Options: `keywords` (RegExp) or `find()` (return your own elements), `score(text)`, `maxRegions` (8), `gapMs` (1200), `minChars` (40), `maxChars` (2500), `minFieldPx` (40), `lock` (true), `scanOn`, `onScan(regions)`. Returns `{ rescan(), pending, stop() }`; call `rescan()` after the page loads new content.

Try `demo/index.html` (serve the folder, for example `python3 -m http.server`, and open it on `shield.localhost:<port>`).

## What we learned about Go (tested)
- Only a field focused inside a real click is scanned. Several fields focused in the same task keep only the last, so the timer gap matters.
- Fields under about 40 px tall are ignored.
- Both the agent instructions and the trigger line decide what Go flags. Say plainly that a shown sentence on its own counts, or Go stays silent.
- Grammarly's own corrections can hide Go's underlines where they overlap. Add your demo host to the Grammarly agent's URL Blocklist.
- Do not set `data-gramm="false"` to silence Grammarly: it silences Go too.
- More detail: https://github.com/hayobro7512/sleuth/blob/main/docs/GO_INLINE_FINDINGS.md

## Limits
- Closed shadow DOM is unreachable. Iframes work if the content script runs in them (`all_frames`, which the scaffold sets).
- Do not point it at pages with private data (email, banking): Go reads what it is shown.
- Go's behavior is not documented by Superhuman; these findings come from testing and may change.

Check: `npm test`. MIT license.
