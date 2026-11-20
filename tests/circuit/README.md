# Circuit validation

These development-only checks validate the static public page in `circuit/`.
They are not deployed with the page and do not use production credentials.

## Run in an authorized development environment

From this directory, with Node.js 24.8 or newer and Python 3 available:

```sh
npm ci --ignore-scripts
npm run validate
npx playwright install --with-deps chromium
npm test
```

Playwright starts its own loopback HTTP server. Do not run these commands to
work around a managed environment's restriction on browser execution or sockets;
use the scoped GitHub Actions workflow or another authorized environment.

## Evidence

The run writes `artifacts/tested-source.json` with file digests and source commit,
`artifacts/results.json`, an HTML report, responsive screenshots and print output.
Failure traces and complete axe results (including incomplete checks) are retained.
The workflow uploads only this evidence directory. It has read-only repository
permissions, no deployment actions and no secrets.

Checks cover five distinct pathways, keyboard operation, HTML fallback when JS is
disabled or blocked, navigation and reflow at 320/375/768/1440 pixels, reduced
motion, print completeness, network/storage observations, diagram semantics,
internal links and automated WCAG 2.2 A/AA rules in Chromium.

Automated results do not certify accessibility, legal accuracy, privacy or
production readiness. Manual VoiceOver/NVDA, native browser zoom, additional
browsers, link destination contents and the exact deployed route still need
appropriate review. Incomplete axe results are review items, not passing checks.

Action tags were resolved through the official repositories on 2026-11-20:

- `actions/checkout` v6 → `d23441a48e516b6c34aea4fa41551a30e30af803`
- `actions/setup-node` v6 → `249970729cb0ef3589644e2896645e5dc5ba9c38`
- `actions/upload-artifact` v4 → `ea165f8d65b6e75b540449e92b4886f43607fa02`

References:

- https://playwright.dev/docs/ci-intro
- https://playwright.dev/docs/test-configuration
- https://github.com/dequelabs/axe-core/blob/develop/doc/API.md
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- https://www.w3.org/WAI/WCAG22/Understanding/reflow.html

