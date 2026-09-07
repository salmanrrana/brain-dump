# Say hello — universal workflow fixture

A dependency-free, stateless app for exercising Brain Dump's real CLI and browser verification. The home page has a centered **Next page** button. It navigates to `/next`, which opens a native dialog saying **whats up**. Close it with the Close button or Escape; Back to start returns home.

```sh
node server.mjs --port 4259 --host 127.0.0.1
node --test server.test.mjs
```

No installation or build is needed (Node 18+). No storage, credentials, external APIs, or production services are used. The server accepts GET/HEAD only. `.brain-dump/verify.json` declares its random-port verification boot.

Design: restrained slate background, indigo primary control, system UI font, visible keyboard focus, and a responsive centered layout. The native dialog provides focus containment and Escape dismissal without a dependency.

From the Brain Dump repository root, run the complete CLI/worker/browser exercise:

```sh
pnpm exec playwright install chromium # only if the browser is not installed
BRAIN_DUMP_UQW_KEEP_ARTIFACTS=1 pnpm test:verification-cli
```

The test copies this app into a temporary Git repository and uses a private Brain Dump database. It proves the missing-report and open-review-finding gates, deliberately fails a browser assertion, repairs the demo, and checks that the detached verifier certifies the reviewed commit, completes the ticket/job, and updates PRD `passes`. It also checks centering, keyboard navigation, Escape dismissal, and screenshots at desktop/mobile widths. The printed temporary directory contains a command journal and evidence; omit `BRAIN_DUMP_UQW_KEEP_ARTIFACTS` to remove artifacts after a successful run.

No provider CLI, GitHub push/PR, or daily-driver service is used. Never register or mutate a daily-driver project to run this fixture.
