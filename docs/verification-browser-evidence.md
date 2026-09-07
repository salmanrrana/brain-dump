# Browser evidence at desktop and mobile sizes

Each UI demo step can choose its own viewport in CSS pixels. Both dimensions must be integers from 1 to 4096. Omitting `viewport` keeps Playwright's default (1280 × 720).

```json
{
  "kind": "ui",
  "route": "/purchasing-power",
  "viewport": { "width": 390, "height": 844 },
  "actions": [{ "act": "waitFor", "selector": "h1" }],
  "assert": [{ "type": "text", "selector": "h1", "expected": "Purchasing Power" }],
  "screenshot": true
}
```

Place this object in a demo step's `automation` field. Use a separate step with `{"width":1440,"height":1000}` for desktop evidence. The runner applies the viewport before navigation and interactions, then captures the real page after assertions. Screenshots use `fullPage`, so their height can exceed the viewport on scrolling pages. A viewport checks responsive layout; it does not emulate a phone's touch input or browser engine.

Viewport selection survives both CLI and MCP demo handoff and participates in the verification failure identity. Changing mobile to desktop does not count as repeating an identical failed check. The real CLI integration test reads PNG dimensions to prove that the runner honored both sizes.
