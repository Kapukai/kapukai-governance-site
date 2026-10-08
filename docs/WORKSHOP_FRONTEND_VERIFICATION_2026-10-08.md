# Workshop public frontend — October 8, 2026

## Implemented scope

The existing community module now presents the approved ivory, navy, teal and decorative gold identity with a consistent global navigation and Workshop navigation. It preserves the original scoped signup and confirmation script. The existing article text is preserved, with its signup links corrected to `/join/#signup`.

Added or updated routes:

- `/community/`: Workshop overview, three planned shared spaces, practice and participation links.
- `/community/assistance/`: minimal private application for free or discounted assistance; email and optional alias, no hardship evidence or narrative.
- `/community/reviewers/`: distinct reviewer and observation volunteer application choices, broad profession and availability only.
- `/community/learn/`: interest registration for future classes and learning formats; no fabricated dates or bookings.
- `/community/about/`: scope, priority order and learning/correction practice.
- `/community/contact/`: public email and known application addresses; appointment and mailing instructions by email. No unverified address was published.
- `/contact/`: fallback to the Workshop contact route.
- `/community/status/`: transparent availability and current limits.
- `/community/apply/`: private application inspection and explicit confirmation/withdrawal.
- `/community/privacy/`: original scoped signup notice plus separate versioned application notice.

The public interface does not display fictional members, fake activity, simulated successful bookings or pretend membership. Accounts, directories, shared rooms, matching, credentials, private case sharing and community content are expressly not open. No trusts, tribunals, legal contracts or new information-sharing experiment is published here.

## Checks completed

`python3 build_community.py` and Python/JavaScript syntax checks passed.

`node --test tests/workshop-ui.test.mjs`: 8 tests passed. These exercise actual generated HTML, DOM event handlers and application JavaScript with mocked fetch:

1. Required acknowledgements, minimal assistance payload and no newsletter consent.
2. Network failures and unexpected server responses, retained form fields and stable retry identity.
3. Closed application gate shown as paused rather than receipt or approval.
4. Distinct witness/reviewer fields and roles.
5. Link inspection without activation, fragment removal, deliberate confirmation and withdrawal.
6. Absent/expired links keep action controls unavailable.
7. Suppressed or unsubscribed applicants retain withdrawal whenever the backend explicitly permits it, while confirmation remains blocked.
8. Generated module links/anchors/downloads, form labels, main/headings and no inline executable JavaScript.

The captured assistance and witness payloads are also run through the **actual new backend request validator**. This caught and corrected a contract mismatch: assistance must omit professional category and availability rather than submit volunteer defaults.

The new application labels match the backend's versioned acknowledgement requirements. Opening a confirmation page only inspects; confirmation requires an explicit action. Application tokens are not stored in local storage, query strings or markup. Token detail rendering uses text nodes.

`npm --prefix backend test`: 32 tests passed, including the 13 new application tests and the original scoped signup tests. This frontend pass reran that suite; its database and mail mocks retain the limitations recorded by the backend agent.

## Remaining release evidence

These checks establish local behavior, not live deployment or inbox delivery. Real browser layout, keyboard and touch checks on the exact deployed release remain necessary. The root agent coordinates Vercel-first deployment, canonical kapukai.org publication, no-store/noindex headers for `/community/apply/`, production API verification, and owner-controlled email confirmation/withdrawal.

No live mutation, email, deployment or commit was performed by the frontend agent. The API gate remains authoritative; if requests are paused or unavailable, the UI displays failure and keeps entered fields available for retry.
