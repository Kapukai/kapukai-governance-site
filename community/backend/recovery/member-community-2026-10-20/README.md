# Member community migration recovery

Updated 20 October 2026. **All seven database installation stages are complete.** The release integrator completed 11 live acceptance groups in a rollback-only transaction, verified cleanup, and separately bootstrapped one authorized operator. The pilot remains **disabled**, with `max_members=25`, zero members and zero invitations.

**Do not rerun the partition migrations or operator bootstrap against this installation.** The earlier partial-installation checkpoint below has been superseded. The installation guards deliberately require zero operators; do not remove them to replay a completed stage. Consult the current release record at `docs/MEMBER_RELEASE_2026-10-19.md` and read-only migration history before any future recovery work.

## Completed installation

| Stage | Source lines | State |
| --- | --- | --- |
| 1 — private tables and initial protections | 3–30, plus RLS and revokes | Applied and read-verified |
| 2 — private authorization and validation helpers | 32–63 | Applied |
| 3 — private state projection | 65–87 | Applied |
| 4 — private self-export | 89–91 | Applied |
| 5 — authenticated member command | 93–302 | Applied |
| 6 — invitation check and public projection | 304–323 | Applied |
| 7 — final service-only RPC grants | 325–334 | Applied |

Stage 1's recorded migration-history entry is `member_tables_locked`, version `20261020011354`. Stages 2–7 subsequently completed; consult the live migration history for their exact versions rather than reusing the earlier checkpoint.

The release integrator reported all 11 live database acceptance groups passing. After rollback, readback confirmed zero synthetic Auth, CRM and outbox records, plus zero members, invitations and operators. The subsequent, separate operator bootstrap succeeded with exactly one operator. That bootstrap did not enable the pilot or create membership. The resulting gate remains `enabled=false`, `max_members=25`.

The Edge deployment also passed public configuration HTTP 200, unauthenticated access HTTP 401, and denied-origin HTTP 403 checks. The previously recorded local verification was 146 backend tests and eight UI tests passing. These results distinguish local verification, live database acceptance and deployed API boundaries; real participant onboarding, browser acceptance and email receipt remain separate observations.

## Historical checkpoint — superseded

The connector initially returned `Invalid or expired requestState` at function installation. This was a connector error, not a reported SQL error or an explicit approval rejection. At that checkpoint, only stage 1 had completed: `enabled=false`, `max_members=25`, zero members, operators, invitations, private helper functions and member public RPCs. All **17** private tables had RLS enabled and denied direct access. That safe partial state is no longer the current installation state.

The advisor comparison at the checkpoint reported no new WARN findings relative to the preexisting baseline. INFO findings rose from 67 to 84, corresponding to the 17 private RLS tables without policies. Those tables intentionally have no browser policies and no direct table privileges; service-only RPCs provide the access boundary. Existing baseline findings are not represented as fixed by this work.

## Preserved recovery evidence

- `partitions.json` preserves the exact seven SQL stages, including transaction wrappers and access-control statements. Its source path is relative to the repository root. All stages have now been applied; this file is an installation record, not a pending execution queue.
- `verification.json` is **local** boundary and equivalence evidence. It proves each partial installation stayed disabled and inaccessible, and the final catalog matched the full atomic source. Production completion and live acceptance are recorded above and in the release record.
- `preflight.sql` remains a read-only inspection of counts and access boundaries without user identifiers.
- `bootstrap_operator.sql` preserves the separately reviewed bootstrap operation that has now completed. **Do not run it again.** It is not a migration stage, an application action or a recurring synchronization job.

The source remains `community/backend/sql/member_community.sql`, SHA-256 `957bda5750e0136312ea3ff689b632ff7a6d19a25f37dbfc78b4e7ae6a2e976c`. The partitions, original source and local verification evidence are unchanged by this status update.

## Future recovery boundaries

Before any future change, inspect the current catalog, migration history, source hash and release record through authorized read-only access. A transport error or unknown outcome requires inspection before retry; it is not permission to switch access paths or weaken controls. Do not replay completed `CREATE` statements, replace them with broad `IF NOT EXISTS`, remove guards or repeat bootstrap.

The completed bootstrap resolved exactly one current verified Auth identity through the existing active Supabase identity, subject, tenant and scoped steward grant. Zero or multiple candidates would abort. It used no email, name, user metadata, first-member rule, remembered UUID or copied account identifier. It created only the separate operator grant: no membership, consent, room enrollment, publication, email or unrelated service change.

Keep activation separate from installation and bootstrap. The pilot stays disabled until the release owner completes the authorized activation step after the required production gates. If a later release needs rollback, preserve schema and audit data, pause participation, and follow the release record. Do not drop member tables or alter unrelated Auth, newsletters, applications, CRM, DNS or email routing.
