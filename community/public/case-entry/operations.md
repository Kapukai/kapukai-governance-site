# Case Entry Map: correction and review operations

Version 0.1 · Prepared November 18, 2026

## Current scope

- Map: 50 states and the District of Columbia; unreviewed jurisdictions remain unknown.
- Source-documented pilot: Oklahoma OUCMS district-court civil e-filing.
- Pilot claim: `OK-OUCMS-CIVIL-EFILING-001`.
- Current state: public-source review is recorded; the eligibility mismatch is unresolved; no live OUCMS reproduction or independent review is recorded.
- Public suggestion route: use the email link on the map and provide only the claim ID, public source URL, exact pinpoint, and a short reason. Do not attach files or include personal filings, names, case numbers, children’s information, confidential records, or private addresses.

## Source correction procedure

1. Assign or confirm a claim ID; preserve the submitter’s exact public source URL and pinpoint in the private triage process.
2. Verify the source itself, its issuing authority, current date/version, and jurisdiction/case-type scope. Separate the source’s own language from the map’s description or inference.
3. Record a disposition: accepted, accepted with narrower scope, not supported, stale, or unable to verify. If the evidence remains ambiguous, leave the claim qualified and record the unresolved question.
4. Publish a sanitized entry in `correction-log.json` with claim ID, public source URL, pinpoint, dates, and disposition. Never publish submitter identity or received personal/case material.
5. Update the map in a dated GitHub change, preserving previous scope and review history in repository commits. The correction email is not a court filing or receipt from a court.
6. If an email includes private case material, do not use it as public map evidence or repeat it in the public log. Follow the organization’s existing privacy handling process.

Manual review is the MVP intake. There is no public upload form, case-record submission endpoint, automated receipt guarantee, or response-time commitment.

## Independent reviewers

The public map seeks two independent review roles:

1. **Source and scope:** verify official source accuracy, version, pinpoint, jurisdiction, case type, and claim wording.
2. **Technical and process reproducibility:** reproduce only public documented steps or an authorized non-production demonstration with synthetic data; record environment and observed state transitions.

For each assignment, record the reviewer role, exact claim, self-described and verified qualifications separately, conflicts, method, date, outcome, limits, agreement, and dissent. A person may apply without being assigned. As of this snapshot, no reviewer is assigned and no independent review record has been published. Reviewer reports are public only with reviewer consent and must not contain personal case data.

## Public measures

Baseline: **November 18, 2026**. These counts begin with the map pilot and do not backfill earlier general inbox correspondence.

| Measure | Definition | Baseline |
|---|---|---|
| Source freshness | Days since each record was checked; count and share past the displayed review date | 1 source-documented entry checked 2026-11-18; next review due 2027-02-18 |
| Independent source reviews | Published source/scope review records | 0 |
| Independent technical reviews | Published technical/process review records | 0 |
| OUCMS reproductions | Completed authorized walkthroughs of the actual OUCMS, with environment and result | 0 |
| Public corrections | Sanitized source-correction dispositions in `correction-log.json` since baseline | 0 |
| Correction turnaround | Median calendar days from receipt to published disposition; include sample size | Not yet measurable |
| Reviewer disagreement | Claims with recorded reviewer disagreement divided by claims with two completed reviews; preserve individual dissent | Not yet measurable; no claims have two reviews |

Do not substitute page visits, synthetic code tests, or a reviewer’s application count for these quality measures. Do not report a rate where its denominator is zero.

## Review schedule

- Next scheduled source check: **February 18, 2027**.
- Repeat quarterly after that date.
- Recheck earlier when a cited rule, court order, eligibility page, filer guide, technical standard, county/case-type listing, or relevant OUCMS screen changes.
- A scheduled check does not automatically mark a claim current: reviewers must inspect the source and update the record with a new date and evidence.
