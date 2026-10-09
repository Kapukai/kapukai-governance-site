# Workshop and First Circle connection blueprint

Owner-approved integration, 8 October 2026 (America/New_York).

## Outcome and scope

A visitor can discover Kapukai, try an existing learning exercise, find a scheduled session when available, choose optional updates and find a correction route without encountering a duplicate classroom, account system or event calendar. This work connects existing public pages. It does not create events, enable enrollment, send emails, change consent, enable Workshop decisions or provision CRM synchronization.

## People and priorities

Stakeholders: visitors and learners; volunteers and reviewer applicants; Christine as program owner and initial instructor; delegated facilitators/publishers with explicit permission; operators responsible for delivery and correction.

Priority order:
1. Safety and truthful expectations: keep case material out of public learning and distinguish interest, registration, attendance and competence.
2. Successful navigation: every advertised next step has a real destination and a return path.
3. Reuse: First Circle owns teaching and the calendar; Workshop owns participation and shared interest signup.
4. Reliable handoffs and closure: identify owner, receipt, failure route and outcome.
5. Accessible learning: keyboard navigation, visible mobile links, readable labels and fictional practice without registration.
6. Maintainability and measured growth: keep source changes bounded and verify the actual journey before adding services.

Heuristics: reuse before building; one authoritative record per responsibility; no silent consent transfer; no status promotion without evidence; reversible changes before expanding scope; missing evidence remains unknown.

## Canonical responsibilities

| Function | Authoritative home | Current evidence / boundary |
| --- | --- | --- |
| Discover and participate | Governance-site Workshop | Existing public pages and scoped signup |
| Curriculum and exercise | Platform First Circle classroom | 18 proposed modules and free sample; enrollment remains closed |
| Public event metadata | Platform src/civic/webinars.json | One existing calendar; no events in inspected source |
| Session registration and joining | Existing Zoom host's approved session | Planned handoff; real attendee acceptance still required |
| Topic permission and withdrawal | Supabase kapukai_scoped_* | Enabled; distinct from event registration and applications |
| Application and its human disposition | Supabase application/Workshop lifecycle | Capture enabled; operations disabled at read-only check |
| Confirmation and approved follow-up delivery | Existing Postmark integration | Existing onboarding live; no new class campaign added here |
| Contact ownership and relationship follow-up | HubSpot | Account onboarding incomplete; no proven Workshop sync |
| Public learning correction intake | Workshop contact route | General description by email; structured disposition integration remains outstanding |

GitHub is source and change history, not participant storage. A HubSpot contact never becomes proof of consent, qualification, attendance or authority. Zoom registration never automatically grants newsletter permission.

## Navigation contract

Global labels, in order: **Tools / Explore / Learn / Participate / About**.
Destinations: Workshop practice / existing Atlas / Workshop learning guide / Workshop overview / Workshop about.
Learning navigation, in order: **Workshop / Classroom / Webinars / Email updates**.
The same destination is used for each label across both sites. The current learning page alone receives aria-current in the learning navigation.

Current working origins:
- Workshop: https://kapukai-community.vercel.app
- First Circle application: https://kapukai-marketplace-pilot-git-work-pub-d328a2-kapukais-projects.vercel.app

Intended short paths after hosted acceptance: /community/, /community/learn/, /join/, /first-circle/classroom and /first-circle/webinars under https://kapukai.org. These are cutover targets, not a claim that they are live. Keep the existing First Circle marketplace. Never redirect the entire apex to either partial app.

## Public journey and failure routes

| Stage | Entry / action | Evidence of completion | Owner and failure handling |
| --- | --- | --- | --- |
| Discover | Workshop -> learning guide | Correct classroom/calendar opens | Publisher repairs broken links; contact route remains visible |
| Practice | Classroom sample or fictional downloads | Learner completes the actual exercise | Instructor reviews lesson corrections; no completion telemetry added |
| Request updates (optional) | Shared signup -> topic choice -> explicit confirmation | Supabase confirmed topic permission | Existing consent service; ambiguous send is not automatically resent |
| Register for a session | Calendar -> approved Zoom registration | Session-specific confirmation/approval | Host verifies capacity, time zone and access; interest alone is not registration |
| Attend and apply | Private joining instructions and materials | Actual attendance plus learner artifact, separately | Instructor/facilitator; arrange accessible alternative when offered |
| Evaluate | Rubric and unseen transfer task when supplied | Version-bound evidence, not satisfaction alone | Instructor handles ambiguity; no certification implied |
| Correct and close | General correction to contact route | Received -> reviewed -> corrected or declined with reason | Christine initially; disposition/notification connection still needs implementation |

Feedback route: architect@kapukai.org through /community/contact/. Request only page/lesson title and a general description; no case records. An email being sent does not prove review or resolution.

## Coupling and tradeoffs

- Static cross-links keep the two existing releases independent and avoid introducing runtime service dependencies. Temporary long URLs are less memorable; replace only after short routes pass acceptance.
- One shared opt-in flow reduces consent drift. Different existing signup purposes remain separate; do not preselect boxes.
- Zoom owns session registration rather than a second attendee database. Calendar capacity, cancellation and rescheduling are not automatically synchronized; publisher and host must reconcile them.
- HubSpot should hold minimal contact and follow-up metadata. Duplicating every application, lesson result or private story creates exposure and inconsistent state; do not do that.
- A shared visual/navigation contract avoids a large redesign, but spans two repositories. Review both sides together and check destination drift at release.

## Milestones and work packages

| Priority | Work package | Acceptance gate | State |
| --- | --- | --- | --- |
| 1 | Connect existing navigation and publish the learning guide | Reciprocal links, same labels/destinations, mobile visibility, unchanged consent forms | Implemented in this change; deployment evidence recorded separately |
| 2 | Restore existing nginx configuration and install scoped short routes | nginx validation, route/assets/headers, exact release manifest, rollback checkpoint | Blocked on server backup inspection; no server changes in this work |
| 3 | First learning session | Owner-approved date/title/format/capacity; real registration, approval, confirmation and attendance check | Pending owner scheduling details and acceptance |
| 4 | Workshop owner operations | Authorized sign-in and one scoped application -> disposition -> notice -> correction/withdrawal | Gate remains disabled until acceptance |
| 5 | HubSpot handoff | Minimal contact mapping, duplicate prevention, owner/task, withdrawal policy, failure recovery | Not implemented by this navigation change |
| 6 | Closed learning feedback loop | Receipt, reviewer, decision, updated lesson version and submitter resolution | Planned |

## Evaluation

Quantitative measures to collect deliberately in a pilot: correct-destination task success (successful tasks / attempted tasks), median navigation time, registration/confirmation success (successes / eligible attempts), unresolved handoffs, correction time, rubric accuracy and performance on a fresh example. Keep counts and missing outcomes explicit. No metrics are collected or claimed by this change.

Qualitative checks: can a participant distinguish an email interest list from a reserved seat; identify what is currently available; locate a correction route; and understand who owns the next step? Capture deidentified usability findings with permission rather than private case narratives.

## Release and rollback

Publish on Vercel first and verify exact changed routes, styles and links. Only then install the same release on the existing nginx host. Preserve private confirmation fragments, old links, email DNS, original homepage and existing First Circle route. Revert this navigation change as a bounded unit if necessary; no database rollback is required.

