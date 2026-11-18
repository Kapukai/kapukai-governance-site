# Case Entry Map: independent review protocol

Version 0.2 · Prepared November 18, 2026

## Purpose

Review the accuracy and reproducibility of public claims about a court process. Reviewers do not decide whether a person’s allegation is true, whether an individual filing should be accepted, or what legal outcome a court should reach.

## Two independent review roles

The Oklahoma pilot currently has **zero published review records**. Kapukai is seeking one reviewer for each role below; no reviewer is assigned or certified by the map. The application link expresses interest only.

1. **Source and scope reviewer**
   - Check each factual statement against the linked official rule, guide, portal page, or clerk page.
   - Record the exact title, date/version, pinpoint, and jurisdiction/case-type scope.
   - Distinguish the source’s words from Kapukai’s inference.
   - Flag stale, conflicting, missing, or inaccessible sources.

2. **Technical and process reviewer**
   - Reproduce the documented steps using public materials or an authorized, non-production demonstration.
   - Record the page/version, browser or demonstration environment, date, observed input requirements, and receipt/status transitions.
   - Use synthetic data only. Do not log into a court account, submit to a live court, probe security controls, or upload real records without explicit authorization.

A reviewer may qualify for one role without qualifying for the other. A title or self-description is not credential verification.

## Required review record

For each review, publish or retain:

- Claim ID and exact claim text.
- Reviewer role and conflict-of-interest disclosure.
- Source URLs, version/date, and pinpoint.
- Method, environment, and observation date.
- Outcome: **supported**, **supported with narrower scope**, **not supported**, **stale**, or **not reproducible**.
- Limits, disagreement, requested correction, and next review date.
- Reviewer name and credentials only with the reviewer’s consent; independently check any credential described as verified.

## Correction and update record

A source correction may be sent using the public-source link on the map. For triage, request only the claim ID, public source URL, pinpoint, and short reason. Do not request or accept personal case records as map evidence. The public `correction-log.json` stores sanitized claim-level dispositions and dates only; it omits submitter identity. Corrections are reviewed manually and published through a dated repository change. The map does not promise a response-time service level.

## Publication rule

Mark a claim **independently reviewed** only after both roles have submitted separate records. Publish disagreement rather than averaging it away. Keep an entry marked **not reviewed**, **partially reviewed**, or **review due** when a gate is incomplete.

The existing reviewer application is at /community/reviewers/. Applying does not confer expert status, credentials, an assignment, or authority over an individual case.

## Privacy and security boundary

The public map accepts public sources only. Do not collect court filings, case numbers, names of children, personal addresses, identity documents, or confidential evidence. Do not send real case information through the website contact route or reviewer application. This review process is not a penetration test, court filing, expert-witness engagement, or legal service.


## Review timing and measurement

- Each source record displays its last checked date and a next review date. The default cadence is quarterly; verify sooner if an official rule, form, guide, technical standard, eligibility page, portal screen, or relevant order changes.
- **Freshness:** age from last source check and share of records at or past their next review date.
- **Reproducibility:** completed independent reproductions divided by completed technical-review attempts; publish the date, environment, steps, result, and limits. A synthetic Kapukai software test is not a portal reproduction.
- **Correction turnaround:** median calendar days from a public-source correction's receipt to its published disposition, with the number of completed corrections shown. Do not imply an SLA until capacity is established.
- **Reviewer disagreement:** claims with a recorded difference in outcome or scope divided by claims with two completed independent reviews. Publish the specific dissent; do not average away disagreement.
- Baseline tracking began November 18, 2026. The public counters do not backfill earlier general inbox correspondence. Correction turnaround and disagreement are “not yet measurable” until they have a valid denominator.
