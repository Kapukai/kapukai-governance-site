# Case Entry Map

A static, source-led route under `community/public/case-entry`. It reuses the national state geometry from the Decision Failures Atlas and links back to the existing authority map.

## Preview

From the repository root, run:

    python3 -m http.server 8000 --directory community/public

Open http://localhost:8000/case-entry/.

## Checks

    node --test community/public/case-entry/tests/*.test.mjs
    node --check community/public/case-entry/app.js
    python3 -m json.tool community/public/case-entry/data.json > /dev/null

The receipt tests exercise Kapukai’s deterministic status model. The injection-point content test guards the public claim boundaries and citations. These tests do not test OUCMS, a child-welfare portal, or whether a factual allegation is true.

## Current scope

- The national map is a coverage index; unreviewed jurisdictions remain unknown.
- The Oklahoma OUCMS entry is specifically about district-court civil e-filing. It documents published access, attachment, and receipt materials and an unresolved filer-scope mismatch.
- The separate [Oklahoma emergency-custody integrity audit](oklahoma-emergency-custody/) maps statutory prepetition custody routes, required review clocks, and the conditional Title IV-E funding connection.
- The emergency-custody page is a public-source threat model. It does not claim that a portal has a cybersecurity defect, that a child-welfare intake form was tested, or that any individual case was unlawful.
- Exact child-welfare intake forms, production provenance controls, record-integrity controls, and claim-level funding records remain unknown or untested.
- Source suggestions use the existing public contact route. Reviewer applicants use the existing reviewer application. Neither path accepts case documents through this map.
- No Supabase schema, Postmark delivery, real-case data upload, court login, blockchain, production deployment, or DNS changes are part of this route.
- The entries remain not independently reviewed until separate source and technical reviewers complete the documented protocol.
