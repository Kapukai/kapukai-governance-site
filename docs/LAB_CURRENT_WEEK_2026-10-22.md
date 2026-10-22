# Lab current-week reservations — October 22, 2026

Owner clarification: an approved Lab member books automatically if available, for the current week only. Approval belongs to membership and does not repeat for each reservation or expire at the end of a week.

The authoritative database now enforces Monday00:00 through the next Monday00:00 in America/New_York. The whole reservation must fit. The exclusive end may equal next Monday00:00. This applies to booking, rescheduling and class seats, including operators using member actions. Operator opening hours and class scheduling can be planned ahead. Cancellation and exact committed-request replay remain available. Starts remain quarter-hour; ends remain independent whole minutes.

The member calendar stays on this week, constrains date selection, and advances on refresh after Monday rollover. Operators retain week navigation for planning, but cannot book outside this week through member controls. The existing same-day end-time form does not offer overnight or midnight-ending intervals.

## Verification

- All45 Lab tests passed:9 database,15 Edge,3 integration,12 UI,6 week policy.
- New tests cover future booking/reschedule/class denial; unchanged original booking and outbox after denial; Sunday/UTC Monday, DST167/169-hour weeks; rollover; idempotency; automatic confirmation and both notice rows.
- Local database tests change only the private helper default clock, using its actual installed definition; Auth/session clocks remain real. No public test clock exists.
- Live transaction test passed against the installed server-clock default and actual command RPC. Every synthetic identity, grant, opening, booking and notice rolled back. No provider was called.
- Readback: policy2, enabledfalse,1 active member,0 opening windows,0 bookings,0 outbox messages,0 synthetic test accounts.
- Migration20261022052420 kapukai_lab_current_week_booking installed. Edge kapukai-lab version2, bundle SHA25653e639f7d0ce5a89e74c2d9888e43a52c998356b9c08d17f4597e0207a207dcc.
- Independent review found no implementation blocker. Review identified nullable SQL verification comparisons; these were corrected to IS DISTINCT FROM and live acceptance rerun successfully.
- Security advisors unchanged: private RLS-without-policies INFO and pre-existing leaked-password protection warning.

## Remaining setup

Publish the owner's actual opening days and hours, enable reservations, and verify a real signed-in booking with member and owner email receipts. No hours were inferred. Live two-connection race and authenticated mobile experience remain unverified. Source is retained on work/lab-booking-20261022; main has not yet been merged and must not be redeployed over this release inadvertently.

## Daytime view clarification

The member's default weekly view is7a.m.–7p.m. Eastern, with15-minute selectable starts and a Full day view for earlier/later reservations. The desktop daytime grid has no inner vertical scrolling; phones retain comfortable24px slot height and scroll. Hour labels use12-hour notation and events crossing view boundaries are clipped accurately.13 UI tests passed after this display update (45 total Lab tests passed before it). Lunch recommendation is one hour, noon–1p.m.; no lunch closure or operating hours have been activated without opening days/schedule.

Week policy production deployment: aac229054ebd729c9c4ca6ce804547c0f9f07cf7 / dpl_3UhCFA3fBQipNyoTywAqWZNq6H7G. The following receipt will identify the combined daytime-view release.
