# Member community migration recovery

Recorded 20 October 2026. The member database installation is **incomplete and disabled**. The release integrator verified the production stopping point below after the connector returned `Invalid or expired requestState` at the function installation step. This was a connector error, not a reported SQL error or an explicit approval rejection. Do not treat it as permission to use a different access path or weaken any review control.

## Verified stopping point

| Stage | Source lines | State |
| --- | --- | --- |
| 1 — private tables and initial protections | 3–30, plus RLS and revokes | Applied and read-verified |
| 2 — private authorization and validation helpers | 32–63 | Pending |
| 3 — private state projection | 65–87 | Pending |
| 4 — private self-export | 89–91 | Pending |
| 5 — authenticated member command | 93–302 | Pending |
| 6 — invitation check and public projection | 304–323 | Pending |
| 7 — final service-only RPC grants | 325–334 | Pending |

The recorded migration-history entry is `member_tables_locked`, version `20261020011354`. Stage 2 has no migration-history entry.

The verified live state was `enabled=false`, `max_members=25`, zero members, zero operators, zero invitations, zero private helper functions and zero member public RPCs. All **17** private tables had RLS enabled and denied direct access. No participant was enrolled and no operator was bootstrapped.

The security advisor comparison reported no new WARN findings relative to the preexisting baseline. INFO findings rose from 67 to 84, corresponding to the 17 private RLS tables without policies. Those tables intentionally have no browser policies and no direct table privileges; the service-only RPCs provide the intended future access boundary. Existing baseline findings are not represented as fixed by this work.

The Edge deployment succeeded; the release integrator observed public configuration HTTP 200, unauthenticated access HTTP 401, and denied-origin HTTP 403. These boundary checks do not make the incomplete database operational. Full local verification recorded 146 backend tests and eight UI tests passing. Production member acceptance and real email receipt remain unverified.

## Recovery package

- `partitions.json` contains the exact seven SQL stages, including transaction wrappers and access-control statements. Its source path is relative to the repository root.
- `verification.json` is **local** boundary and equivalence evidence. It proves each partial installation stayed disabled and inaccessible, and the final catalog matched the full atomic source. It does not claim all seven stages ran in production.
- `preflight.sql` contains read-only counts and access checks without user identifiers.
- `bootstrap_operator.sql` is a separately reviewed, guarded **future administrative operation**, not a migration stage. It is not run by the application or these instructions automatically.

The unchanged source is `community/backend/sql/member_community.sql`, SHA-256 `957bda5750e0136312ea3ff689b632ff7a6d19a25f37dbfc78b4e7ae6a2e976c`. Do not rewrite the full source or apply it from the beginning over stage 1.

## Resume safely

1. Restore the existing authorized connector session. Before writing, verify the source hash, migration history and current catalog using read-only access. An unknown prior outcome must be inspected before a retry.
2. Confirm the exact disabled stopping point. Leave stage 1 in place. Apply stages 2–7 in order using the reviewed SQL in each `sql` field through the same authorized migration mechanism. Each stage is atomic and guards against enabling, bootstrap or enrollment during installation.
3. After each successful stage, verify the catalog and keep `enabled=false`. Do not replace `CREATE` with broad `IF NOT EXISTS`, remove guards, grant access earlier or insert an operator to get around an installation failure. If the connector reports an approval denial, stop and report that reason. If transport errors persist, retain the safe partial state.
4. The main command is a single 30.5 KB function definition. Splitting inside its body would change the tested installation method; the package deliberately keeps it intact.
5. After stage 7, rerun privilege checks and the approved rollback-only acceptance script at `community/backend/tests/member-live-acceptance.sql`, after confirming its Auth-trigger preconditions still hold. Verify rollback left no synthetic users, members, invitations, sessions or grants. Compare advisor findings against the saved baseline.
6. Only after those gates pass, review the current authoritative steward mapping for operator bootstrap. The guarded bootstrap resolves exactly one current verified Auth identity from the existing active Supabase identity, subject, tenant and scoped steward grant. Zero or multiple candidates abort. It never uses email, name, user metadata, the first member, a remembered UUID or a stale copied account identifier.
7. Operator bootstrap creates only the separate operator grant. It does not enable the pilot, create membership, accept terms, join rooms, publish, send mail or change unrelated services. Keep the pilot disabled until production acceptance passes and the release owner performs the authorized activation step.

If recovery pauses again, preserve the schema and audit data. Do not drop tables or alter existing Auth, newsletters, applications, CRM, DNS or email routing. Update the release record with actual completed stages, keeping local tests distinct from live operational evidence.
