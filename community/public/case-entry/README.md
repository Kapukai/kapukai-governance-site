# Case Entry Map

A static, source-led route under community/public/case-entry. It reuses the national state geometry from the Decision Failures Atlas and links back to the existing authority map.

## Preview

From the repository root, run:

    python3 -m http.server 8000 --directory community/public

Open http://localhost:8000/case-entry/.

## Checks

    node --test community/public/case-entry/tests/receipt-state.test.mjs
    node --check community/public/case-entry/app.js
    python3 -m json.tool community/public/case-entry/data.json > /dev/null

The synthetic status tests exercise only the map's deterministic state labels. They do not test OUCMS or prove that a factual allegation is true.

## Current scope

- The Oklahoma entry summarizes published OUCMS district-court civil e-filing materials checked on November 18, 2026.
- The October 14, 2025 Version 2 guide documents new civil case filing and PDF/JPEG document attachments. The current registration page says pro se filing is unsupported.
- County and case-type availability, the alternative route for self-represented filers, and current portal operation remain untested.
- This is not an audit of child-welfare intake, criminal case initiation, or a particular court's case-creation form.
- Source suggestions use the existing public contact route. Reviewer applicants use the existing reviewer application. Neither path accepts case documents through this map.
- No Supabase schema, Postmark delivery, real-case data upload, court login, blockchain, production deployment, or DNS changes are part of this route.
- The entry is marked not independently reviewed until separate source and technical reviewers complete the documented protocol.
