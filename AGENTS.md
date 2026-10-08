# Kapukai public publishing

Christine's publishing convention, October 8, 2026:

- Keep public page source in this existing repository.
- Deploy and verify the exact release on Vercel first, then publish it at short paths under `https://kapukai.org`.
- Use kapukai.org links in public calls to action after those paths are live. Vercel URLs are the deployment and review addresses.
- Preserve existing kapukai.org pages and email DNS. Do not point the whole domain at a partial site.
- Keep one release manifest linking the Git commit, Vercel deployment and the files installed on kapukai.org.
- Keep private platform data and credentials out of this public repository.
- The `community` module owns the public article, signup, email confirmation, tester, newsletter and practice pages. The existing `public-assurance` module is separate.
- Existing ChatGPT Sites confirmation links must remain usable until a verified migration preserves their private URL fragments.

## Known production boundary

kapukai.org is currently served by nginx at the existing 1984 host. Vercel access does not grant access to that server. Verify the destination and keep a backup before installing a release. Static publication does not require changing DNS or reloading nginx.
