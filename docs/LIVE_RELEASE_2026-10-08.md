# Vercel release verification — 8 October 2026

## Release identity and scope

- Stable release host: `https://kapukai-community.vercel.app`
- Git commit supplied by the deployment agent: `6a61ce0da65e86bbde7a558e960099ee1154a2cf`
- READY deployment supplied by the deployment agent: `dpl_HPTA295cLcLDyMpfTNK5Xx7vabCs`
- Independent HTTP observations: 18:46:58–18:47:52 UTC (14:46:58–14:47:52 America/New_York).
- Release manifest: 26 files; SHA-256 `a496e7ab2dab31882ac83ab842fc2d4c69f4e82bbe8a70ed9e651f4369053274`.

Story checked: a visitor can load the released Workshop pages and their exact local assets, including assistance/reviewer applications and the private-link confirmation pages. This pass checks the deployment/content/header boundary. The parent deployment agent separately owns browser interaction and actual form/email confirmation checks.

## Results

**All 26 manifest destinations returned HTTP 200 with expected content.** Twenty-five decoded response bodies matched their local public source text exactly. `/tort/` followed the configured redirect and matched the full article source, rather than the unused local redirect stub. This is exact decoded-text comparison; it is not a claim that compressed wire bytes match local files.

| Route group | Checked destinations | Result |
| --- | --- | --- |
| Workshop | `/community/`, `/community/about/`, `/community/assistance/`, `/community/reviewers/`, `/community/learn/`, `/community/contact/`, `/community/privacy/`, `/community/practice/`, `/community/status/` | 9/9 HTTP 200; exact local text |
| Forms and navigation | `/community/apply/`, `/confirm/`, `/join/`, `/testers/`, `/newsletter/`, `/contact/` | 6/6 HTTP 200; exact local text |
| Article | `/articles/tort-law-and-accountability/`, `/tort/` | 2/2 HTTP 200; exact article text after expected short-link redirect |
| Assets | `/assets/community/app.js`, `/assets/community/applications.js`, `/assets/community/style.css`, `/assets/community/favicon.svg` | 4/4 HTTP 200; exact local text |
| Practice downloads and sitemap | Four `/community/files/` manifest downloads and `/community/sitemap.xml` | 5/5 HTTP 200; exact local text |

No release-content discrepancy was found.

## Confirmation-page headers

Both `/community/apply/` and `/confirm/` returned:

| Header | Observed value |
| --- | --- |
| `Cache-Control` | `no-store` |
| `X-Robots-Tag` | `noindex, nofollow` |
| `Referrer-Policy` | `no-referrer` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Content-Type` | `text/html; charset=utf-8` |

Both pages also include `meta name="robots" content="noindex, nofollow"`. Neither includes an inline executable script; their scripts load from the site's asset paths.

All 26 checked responses include the configured CSP, referrer, MIME-sniffing, and frame protections. The observed CSP is:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src https://tbxfsjipkrdwyctepesf.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

## Limits

Requests were read-only fetches through the Vercel connector. This pass did not submit forms, call application APIs, activate tokens, send email, mutate database records, or launch a browser. It does not establish end-to-end inbox delivery, graphical accessibility, authenticated community access, or current `kapukai.org` installation. The application gate and operational approval remain separate from serving these static pages.

The pages intentionally contain canonical `kapukai.org` URLs. Canonical metadata does not prove those apex-domain paths are installed or reachable; the existing host still requires its own release installation and verification.

## Root-owned live application journey

On October 8, 2026, the production browser form showed the paused response while the application gate was closed. The database had zero applications. After opening the gate for the owner-authorized release test, the real assistance form sent one confirmation to the owner-controlled business mailbox. Postmark accepted it and Zoho displayed it in the inbox.

Opening the actual received link removed its fragment from the address bar and left the database state `awaiting_email`. Explicit Confirm changed only the application to `awaiting_human_review`, with one confirmation event. Explicit Withdraw changed it to `withdrawn`. Request, confirm and withdrawal events were present. Before/after digests of the owner contact and scoped subscription records were identical. No private link, token, contact row or sensitive application detail is stored in this report.

The database launch gate is now enabled. Public assistance and reviewer/observation applications are available on the stable Vercel site. They are human-review requests only. There is no automatic eligibility, role appointment, credential, payment, newsletter consent or community account. Operators must inspect the private queue using the restricted operational workflow in `community-applications.md`; no admin inbox or notification system is represented as live.

Graphical desktop review checked the Workshop, assistance flow and contact directory. Keyboard Space toggled the acknowledgements and form states were visible. One browser-automation checkbox click did not check its intended field; the fresh screenshot showed a neighboring checkbox selected. The keyboard path worked. This is not a claim of a complete mobile, screen-reader, load or penetration test.

## Canonical host and remaining limits

The live kapukai.org homepage still serves its existing nginx site. Its Contact link returned 403 Forbidden during this session. No accessible web-host deployment credential/configuration was available; Vercel access does not authorize or provide access to that server. The matching installer and manifest are ready, but no canonical cutover or DNS change was performed.

No public mailing address was supplied or verified. The new contact page gives the public business email and known website destinations, with correspondence instructions by contact. The old homepage and other separate Vercel applications have not been restyled.

Adobe Acrobat Sign is not configured or tested. Agreement drafts are private review materials, not effective published terms. Accounts, room posts, member discovery, reviewer scheduling, expert credentialing, trusts, tribunals and technical federation are not launched.
