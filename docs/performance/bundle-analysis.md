# Bundle Analysis Workflow

Brain Dump records a production client bundle baseline in `docs/performance/bundle-baseline.md`.

## Regenerate The Baseline

```bash
pnpm build:analyze
```

This runs the production build, scans `.output/public/assets`, and rewrites the baseline report without requiring a browser.

If a build already exists, refresh only the report with:

```bash
pnpm analyze:bundle
```

## What To Watch

- Root assets matching `main-*`, `index-*`, or `styles-*` represent initial payload risk.
- Chunks over 500 kB uncompressed need an explicit reason or follow-up split.
- Dashboard charting, Kanban drag-and-drop, form-heavy modals, and devtools should stay out of root assets.
- Use gzip size for transfer cost and uncompressed size for parse/compile cost.
