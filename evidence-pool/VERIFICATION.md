# Verification record — 2026-10-01

- Canonical research data: 21 cases, 71 source records, 20 control domains.
- Source IDs resolve; local asset links exist; JSON and offline data agree.
- JavaScript syntax check passes.
- DOM execution checks pass: initial render, search, empty state, reset, status and category filters, chronology content, source-register expansion, citation navigation, download paths and public contribution template. No DOM execution errors.
- HTTP checks return 200 for the page, script, stylesheet, research data, all three compiled PDFs, Overleaf ZIP, both atlas previews and contribution template.
- No upload or collection endpoint; no analytics or third-party scripts.

## Browser verification limit

The cached agent-browser executable failed during daemon startup. Playwright had no local Chromium; the permitted download returned an invalid 0 MiB archive. Desktop and mobile layout screenshots were therefore not obtained. Responsive CSS includes 900px and 640px breakpoints, but viewport rendering remains an explicit pre-deployment check. DOM tests do not substitute for browser layout verification.

Run `python3 scripts/validate.py` for publication data and link checks. DOM tests require Node and jsdom (`JSDOM_MODULE` may point to the installed jsdom package).
