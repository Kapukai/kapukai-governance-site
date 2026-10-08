# Kapukai article and community

Public source moved from the original Join Kapukai Site into the existing public website repository. The original Site remains available for previously issued confirmation links.

## Publish in order

1. Run `python3 build_community.py` from this directory.
2. Run the HTML/link checks and `npm --prefix backend ci --ignore-scripts && npm --prefix backend test`.
3. Commit the exact source and built `public` files. Deploy the `community` directory to the Vercel `kapukai-community` project.
4. Verify Vercel routes, assets and signup behavior.
5. Install the same release files into the existing kapukai.org web root with `deploy.py`. It installs only declared module paths, takes a backup and leaves the main homepage and other applications alone. The observed `/join/` page is a 62-byte email-only placeholder; its exact hash is the only preapproved conflicting replacement. Other conflicts stop installation for review.
6. Verify HTTPS and signup on kapukai.org. Only then change new confirmation-email links to `https://kapukai.org/confirm/` and redirect the old Site while preserving URL fragments.

## Public paths

| Purpose | Path |
| --- | --- |
| Signup, connection, volunteering, free class notices | `/join/` |
| Community landing page | `/community/` |
| Article | `/articles/tort-law-and-accountability/` |
| Short article link | `/tort/` |
| Email confirmation and withdrawal | `/confirm/` |
| Testers | `/testers/` |
| Newsletter | `/newsletter/` |
| Practice material | `/community/practice/` |
| Signup privacy | `/community/privacy/` |

Shared assets use `/assets/community/`; downloads use `/community/files/`. No root assets or existing homepage need to be replaced.

## Signup evidence

On October 8 the live signup endpoint sent the owner-authorized confirmation tests. Gmail inbox delivery, the received token, explicit activation and withdrawal passed. Postmark accepted the architect@kapukai.org test, whose inbox was not accessible. Both test intents are inactive; the existing architect legacy subscription was preserved. These are production API and email checks, not a claim of graphical browser acceptance.

The same Supabase registry, scoped consent service and Postmark sender are reused. No new database or broadcast campaign is introduced. Do not reapply historical schema files.

## Current cutover status

kapukai.org still runs on its existing nginx server. This environment cannot reach that host over SSH. Keep the original Site active for existing private links. New confirmation emails use the verified Vercel `/confirm/` page until the kapukai.org paths are actually installed and checked.
