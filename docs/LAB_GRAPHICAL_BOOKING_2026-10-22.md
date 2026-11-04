# Graphical Lab bookings — October 22, 2026

The owner clarified the final timing rule: both start and finish are on :00, :15, :30 or :45, with a minimum of 15 minutes. This supersedes the earlier independent whole-minute end rule. Meetings may last 15, 30, 45 minutes or longer, and smaller groups are welcome. Capacity remains six participants; an assigned lead seat is separate in the lounge and conference room.

## Member experience

The default weekly grid shows 7 a.m.–7 p.m. Eastern, with a Full day option. A member drags over an available interval or taps its start and finish. There are no member date, start-time, end-time or duration entry fields. The selected span is highlighted, and a compact card summarizes the time, group size and purpose before confirmation. Quarter-hour snapping, blocked boundaries, keyboard navigation, and cancellation/rescheduling are implemented. A room-card link can preselect a valid room. The calendar still requires current Lab approval and available published hours; reservations automatically confirm within the current Monday–Sunday week.

The desktop grid presents the twelve-hour span without an inner vertical scrollbar. Phone cells retain larger targets and scroll. Visual browser review is performed separately from DOM interaction tests. Operators retain date/time controls for publishing hours and classes, now constrained to the same quarter-hour grid.

## Evidence

- All 55 Lab tests passed: 11 database, 15 Edge, 3 integration, 20 graphical UI, 6 week-policy tests.
- Meaningful UI checks include a 15-minute meeting for two people, 30-minute selection, drag snapping to 45 minutes, no numeric time entry, rescheduling, keyboard focus, reservation/closing boundaries, and a Sunday meeting ending at midnight.
- Database and Edge tests reject off-grid and shorter intervals; book, reschedule, class and opening-window rules agree.
- Live rollback acceptance passed after installation: a 15-minute booking automatically confirmed, both notices were inserted, invalid timing and next-week actions were denied, replay was stable and cancellation worked. All synthetic records rolled back; no email provider was called.
- Readback: policy 3, booking disabled, zero windows, bookings, outbox rows and synthetic test accounts.
- Migration 20261022053954 kapukai_lab_quarter_hour_booking installed; Edge function kapukai-lab version 3, bundle SHA256 35fbc5aa77efc8a7ffcc5d2dae6ae9855296ea8e5300d1f9e00ae742facdab1b.

## Operating schedule still to choose

Recommendation, not activated: Tuesday–Friday, 9 a.m.–5 p.m.; lunch noon–1 p.m.; Monday reserved for preparation, maintenance and follow-up. That provides 28 public opening hours while one person operates the Lab. The 7 a.m.–7 p.m. display does not imply those opening hours.

The remaining launch gate is a chosen operating schedule, enabling reservations, and a real signed-in booking with member/owner email receipts. A real two-connection race and mobile browser review remain distinct checks; local tests and a fictional demo are not substitutes for those observations.

## Published release and browser verification

Production commit `0a30d34e0f8e899b85f3ebc7b6f6316f010c57df`, deployment `dpl_D1ptjVrfRQi7nk6jKkceNfn7ShVC`, is READY on https://kapukai-community.vercel.app/lab/. Public HTML, JavaScript and CSS each matched local SHA-256 exactly. The live public config returned 200; an unauthenticated state request returned 401. Both responses were no-store.

The main Site is published as version 6, source `637bd93e10a1ffb86c522c5e9ca9340ce228a9a6`, deployment `appgdep_6ad9a3fd88ac8191a16dc2c23187fa8e`. Its main booking links now redirect to the member calendar and preserve valid room choices. The old one-hour-minimum email request form is no longer the booking route. The home page explicitly says reservations have not opened yet.

The public fictional demo at https://kapukai-lab.christinehillier.chatgpt.site/calendar-preview/ reuses the production graphical interaction through an asserted build adapter. Its membership, schedule, clock and bookings are fictional; changes remain in memory. Auth code is removed, unknown fetch destinations fail closed, CSP blocks network connections, and no email is sent. Nine demo tests passed. Browser QA on the internal Site preview confirmed a fifteen-minute sample for two people and an actual mouse drag snapping to forty-five minutes. The frontend's twenty UI tests were rerun after the pointer fix and passed. Mobile touch browser verification remains unobserved.

Browser QA found that using wall-clock time for click suppression caused a frozen-clock demo to swallow the next finish click. The production fix uses monotonic time and clears stale suppression on each new pointerdown. A physical mouse-event regression covers the replaced start node and frozen clock. Internal HTTP preview also lacked crypto.randomUUID; the demo adapter now uses fixture-only request IDs, with a regression test. Production request IDs retain crypto.randomUUID on HTTPS.

No real recipient email or authenticated member booking was created during these checks. Booking remains disabled with no published opening windows. The operating-hours recommendation has not been accepted or activated. With one operator, staffed sessions must also have a single-session coverage limit; parallel self-led room use is a separate operating decision.

Code remains on draft PR https://github.com/Kapukai/kapukai-governance-site/pull/7. Production is deployed from its exact branch commit; deploying the older main branch could remove the Lab changes. Merge/release consolidation is still outstanding.
