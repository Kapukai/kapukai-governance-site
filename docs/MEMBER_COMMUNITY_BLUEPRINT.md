# Member community: private pilot blueprint

This module is an isolated, invite-only pilot. Existing signup and application flows do not confer membership. Deploying source does not prove production authentication or successful real delivery. No email is sent by these commands.

## API boundary

The Edge handler validates its bearer token with Supabase Auth, extracts the verified `sub` and `session_id`, and passes only those identifiers to `public.kapukai_member_command(p_user_id uuid,p_session_id uuid,p_action text,p_payload jsonb)`. The RPC rechecks live Auth tables itself. Only `service_role` can execute either public RPC. All member tables and helper functions live in a private schema with RLS and no direct grants. Operators are manually granted in `kapukai_members.operators`, never through profile or JWT user metadata. Deleting an Auth session revokes RPC access. Closed community memberships leave unrelated Auth services unchanged.

Command results are `{result:'ok', ...}` or `{result:'forbidden'|'paused'|'invalid'|'conflict'|'not_found'|'capacity_full'|'rate_limited'}`. Unknown payload keys are invalid. All IDs are UUIDs except fixed room IDs. Dates are ISO-8601 UTC. Every mutation is one transaction.

Interest and reviewer scope values: `tools`, `timeline`, `evidence_dossier`, `affidavit_formatting`, `training`, `independent_review`. Rooms: `commons` (Welcome & connections), `tools` (Tools & feedback), `review` (Learning circle).

`state {}` returns `enabled`, `max_members`, `snapshot_limit:100`, `is_operator`, `profile` (null before joining), and arrays `rooms`, `discovery`, `introductions`, `requests`, `assignments`, `events`, `feedback`, `credentials`, `blocks`. Each entity includes `id`; member profile includes `id,display_name,bio,interests,discoverable,reviewer_opt_in,reviewer_scopes,status`. Rooms include `id,name,joined`. Discovery members include `id,display_name,bio,shared_interests,reviewer_scopes,reviewer_eligible`. Introductions have `id,requester_id,recipient_id,status,created_at,other_name`. Requests have `id,owner_id,title,summary,scope,status,created_at`. Assignments have `id,request_id,reviewer_id,status,conflict_free,reviewer_name`. Events have `id,organizer_id,invitee_id,title,starts_at,ends_at,status,other_name`. Feedback has `id,body,excerpt,version,consent_version,status`. Credentials have `id,title,issuer,source_url,scopes,status,verified_at,public_consent`. Blocks are `{member_id,display_name}`. Operator state also contains `operator_queue` with `invitations,members,reports,feedback,credentials` arrays.

| Action | Exact payload | Notes |
| --- | --- | --- |
| join | invite_token, display_name, adult:true, privacy_acknowledged:true | One-use, email-bound, expiring invitation. Defaults private. |
| profile_save | display_name,bio,interests:[],discoverable:boolean,reviewer_opt_in:boolean,reviewer_scopes:[] | Full profile replacement. |
| room_join / room_leave | room_id | Explicit membership, separate from interest selection. |
| room_posts | room_id | Returns posts with id,author_id,author_name,body,created_at; joined room required. |
| post_create | room_id,body | Creates room post. |
| post_delete | post_id | Author only, removes visibility. |
| post_report | post_id,reason | Private moderation report. |
| member_block | member_id,blocked:boolean | Blocks discovery/posts/introductions and cancels active bilateral events/assignments. |
| introduction_request | member_id | Both discoverable, shared interest, no block. |
| introduction_respond | introduction_id,accept:boolean | Recipient only. No contact details disclosed. |
| request_create | title,summary,scope | Minimal request, no attachments. |
| request_close | request_id | Owner; cancels assignments. |
| assignment_propose | request_id,reviewer_id | Request owner chooses eligible reviewer. |
| assignment_cancel | assignment_id | Request owner or reviewer withdraws; related coordination without another qualifying relationship is cancelled. |
| assignment_respond | assignment_id,accept:boolean,conflict_free:boolean | Reviewer accepts only with conflict declaration. |
| event_offer | invitee_id,title,starts_at,ends_at | Only accepted introductions or active assignments. Private invitation. |
| event_respond | event_id,accept:boolean | Invitee accepts; transactional overlap check for both. |
| event_cancel | event_id | Either participant. |
| feedback_save | feedback_id(optional),body | Private. Editing clears excerpt/consent/publication. |
| feedback_consent | feedback_id,version,consent:boolean | Exact proposed excerpt version only. |
| feedback_withdraw | feedback_id | Removes public visibility immediately. |
| credential_submit | title,issuer,source_url | Unverified claim, grants no reviewer authority. |
| credential_consent | credential_id,consent:boolean | Publication opt-in only for verified current credential. |
| export | page(optional nonnegative integer, default 0) | Own records, including closed account, 100 rows per collection. Returns next_page or null; repeat and merge pages. |
| close | {} | Closes community access, removes authored public visibility and cancels events/assignments. |
| operator_config | enabled:boolean,max_members:integer | Capacity 1–30; default disabled/25. |
| operator_invite | email,expires_days:integer | 1–14 days; returns invite_token once; never sends email. |
| operator_invite_revoke | invitation_id | Unused invitation only. |
| operator_post_moderate | post_id,hide:boolean,reason | Reason code privacy/conduct/off_topic/restored; human operator hides or restores existing post. |
| operator_member_suspend | member_id,suspended:boolean | Suspension withdraws public visibility and cancels relationships. |
| operator_feedback_propose | feedback_id,excerpt | New exact version, clears prior consent/publication. |
| operator_feedback_publish | feedback_id,version | Human publish, requires author's exact-version consent. |
| operator_credential_review | credential_id,verified:boolean,scopes:[],source_url | Verification records operator, source and date; revocation removes visibility and invalidates eligibility. |

`public.kapukai_member_public()` returns `{result:'ok',feedback:[{id,excerpt,version,published_at,display_name}],credentials:[{id,title,issuer,source_url,scopes,verified_at,display_name}]}`. This feed contains no private profile/contact details. It is empty when the pilot is paused. A credential's publication consent never makes a profile discoverable.

## Safety gates

The database verifies confirmed email, nonbanned nondeleted user and a live matching session for every authenticated command, including operator actions. Invitation capacity is locked transactionally. Profile discovery requires both users' explicit opt-in and shared interests. Blocks are symmetric for visibility. Room read/write requires explicit membership. Reviewer authority requires opt-in and a human-verified credential covering the request scope. Assignment proposal and reviewer acceptance are distinct. Calendar acceptance serializes bookings to prevent concurrent overlap. Public feedback requires moderator excerpt, exact-version author consent, and subsequent human publication; editing or withdrawal breaks publication immediately. Credentials need verification and separate publication consent. Audit rows contain action, actor, target IDs, fixed moderation reason codes and timestamps only. Public and state collections return at most 100 recent records. Full own-data export is paginated, including assignments, blocks created, reports submitted, own audit, and claimed invitations with hashes omitted.

## Operational activation

Apply additive SQL after verification. Grant the owner's verified Auth UUID manually in `kapukai_members.operators`. Do not infer ownership from existing applications, emails in public source, or metadata. Invite the owner and pilot participants explicitly. Enable with `operator_config` only after production auth, origin controls and backend tests pass. Keep pilot capacity at 25 unless the owner changes it (maximum 30). User-visible release status must reflect whether this activation actually happened.

## Verification and operational bounds

The member session expires for community purposes 30 minutes after session creation, even if a refresh token remains available elsewhere. Require a new sign-in after that interval. Auth checks require a live matching session, confirmed email, nonanonymous authenticated role, and no active ban or deletion. All pilot commands serialize on one transaction advisory lock before authorization reads, providing a simple bounded-pilot concurrency model. Signup invitation checks are service-only, email-digest bound, do not consume invitations and allow at most 3 attempts per invitation per hour. No account is created or email sent by SQL.

Field bounds: display name 1–60; biography 0–500; post 1–2000; report reason 1–300; request title 1–100 and summary 1–600; event title 1–100 and duration <= 4 hours, <=180 days ahead; feedback 1–2000 and excerpt 1–600; credential title 1–100, issuer 1–120, HTTPS source <= 500. Invitation token is 64 lowercase hexadecimal characters; expires 1–14 days. Profile display-name edits invalidate public feedback version consent and credential publication consent. Discovery lists only credential-verified reviewer scopes.

The pause switch blocks new participation and disclosure while allowing targeted withdrawals: leave a room, delete an authored post, close a request, cancel an assignment or event, decline an introduction or assignment, block a member, revoke publication consent, withdraw feedback, export, or close membership. A paused pilot cannot grant new publication consent or unblock an existing block.
