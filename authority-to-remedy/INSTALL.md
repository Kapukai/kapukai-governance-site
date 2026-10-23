# Existing-host installation

Intended destination: `https://kapukai.org/authority-to-remedy/`.

This release does not grant authenticated access to the existing nginx host. Its installation remains pending until a person or authenticated deployment session can verify the destination and install it.

1. Confirm the existing kapukai.org document root and the intended `authority-to-remedy` subdirectory with the host operator. Do not infer a filesystem path from a web URL.
2. Verify the release archive against its manifest. Preserve the complete current module if one already exists, with a timestamped backup outside the public document root.
3. Stage the supplied static site files in a new sibling directory. Include the reviewed downloads and media references. Do not replace the site's root index, community module or other pages.
4. Verify permissions and compare every staged file hash with the manifest. Switch only the module directory into place, keeping the prior directory available for rollback.
5. Check the live short path, CSS and JavaScript, each download, route questions, card export and video playback. Record installed file hashes, time, verifier and verified URL in the release manifest.
6. Use the short kapukai.org address in public calls to action only after that verification succeeds. Until then, use the Vercel review address and state that host installation is pending.

Static publication does not require changing DNS, mail records or reloading nginx. Rollback consists of restoring the backed-up module directory and verifying its previous URLs.
