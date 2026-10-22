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

Recommendation, not activated: Tuesday–Friday, 9 a.m.–5 p.m.; lunch noon–1 p.m.; Monday reserved for preparation, maintenance and follow-up. That provides 28 bookable hours while one person operates the Lab. The 7 a.m.–7 p.m. display does not imply those opening hours.

The remaining launch gate is a chosen operating schedule, enabling reservations, and a real signed-in booking with member/owner email receipts. A real two-connection race and mobile browser review remain distinct checks; local tests and a fictional demo are not substitutes for those observations.
