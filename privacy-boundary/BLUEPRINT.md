# Privacy Boundary architecture

## Decision
Keep this release static. GitHub stores reviewed public source and its change history. It is not a case database. The page has no accounts, trackers, remote fonts, private uploads, or form submission endpoint. Worksheet values live in browser memory and export to a local text file. No persistence is promised; browsers or device software may retain their own state.

## Responsibility boundaries
| Layer | Current choice | Future boundary |
|---|---|---|
| Public code and educational content | Existing kapukai-governance-site Git repository | Review changes; no private evidence or credentials |
| Delivery | Static HTML/CSS/JS; Vercel verification before existing nginx installation | Publish only the privacy-boundary directory |
| Personal worksheet | Browser memory and user download | Explicit opt-in before any server storage |
| Shared investigations | Not implemented | Separate private database and private object storage; per-case authorization, audited access, retention and deletion, backups and restore testing |
| Community coordination | Existing Kapukai contact/community links | CRM contains participation and consent only, never case evidence |
| Public findings | Illustrative maps, primary authorities, dated enforcement example | Human-reviewed redacted publication, distinct from private source records |

## Future data model, only if collaborative casework is needed
Separate cases, actors, events, sources, claims, authority references, transfers and remedies. Each asserted relationship needs source IDs, date range, verification status and reviewer. Unknown, alleged, corroborated and adjudicated are distinct states. Store original evidence separately from redacted derivatives; record cryptographic hashes for integrity without claiming that a hash proves truth. Enforce access on the server, not just the UI. Public release requires an explicit review decision and an independently generated public artifact.

## Legal/editorial decisions
Do not infer liability from ownership. Separate source provenance, actor conduct, applicable duty, injury, causation and remedy. Distinguish existing law from reform proposals. No specific pension fund has been verified as involved in this release. Sources are linked in the page. Frameworks are not filing-ready exhibits.

## Release
Canonical intended path: https://kapukai.org/privacy-boundary/
Deployment cannot replace the domain, homepage, mail DNS or other applications. Existing host access must be authenticated before installing. Preserve one release manifest with hashes, source commit and deployment URL. A Vercel preview does not establish that the kapukai.org route is installed.
