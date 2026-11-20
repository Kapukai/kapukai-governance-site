# Circuit manual accessibility review

Reviewed at 2026-11-20T10:56:28.575620+00:00.

## Evidence and scope

- Rendered evidence: Chromium CI for commit `cd2b00583b94eeccfb6cc00b8279f0b77e4369d1`, [run 44722702546](https://github.com/Kapukai/kapukai-governance-site/actions/runs/44722702546), artifact `14622293009`.
- Files reviewed: `cd2b005-ci/axe-desktop.json` and full-page CI screenshots at 320 and 768 CSS pixels. The parent agent separately reviewed the 375-pixel screenshot and the actual Vercel desktop page.
- Candidate correction: `71a6d6f4345e73b30267b617a2f4043d04a6d0f4`. It removes the unnecessary header-link `aria-label` and corrects the no-JavaScript test. The CSS and script are unchanged, so the prior screenshots remain evidence of the same visual layout; they do not establish that the new candidate passed CI.
- The original run had **15 passed and 7 failed** browser tests: six instances of one header-link accessible-name mismatch, and one incidental no-JavaScript test locator failure. The subsequent successful CI run is recorded below.

## Manual review of the axe incomplete result

The desktop axe report has **one incomplete rule (`color-contrast`), covering 12 nodes**, rather than 12 proven violations. Seven nodes are arrow glyphs marked `aria-hidden`; five are labels on the nested SVG circles. Axe reports that it cannot evaluate the glyphs as text or determine the SVG background under overlapping elements.

Ratios below are calculated from the implemented CSS foreground and background colors using sRGB relative luminance. Screenshot inspection corroborates the intended backgrounds and legibility.

| Node(s) | Foreground | Background | Contrast | Review |
|---|---|---|---:|---|
| Whole society | `#132b3d` | `#eae8df` | 11.87:1 | Clear navy text on the outer circle |
| Whole community | `#132b3d` | `#f7f6f1` | 13.47:1 | Clear navy text on the community circle |
| Whole family | `#132b3d` | `#e5ecee` | 12.19:1 | Clear navy text on the family circle |
| Whole / person (two labels) | `#ffffff` | `#132b3d` | 14.58:1 | Clear white text within the central circle |
| Two hero arrows and the circuit arrow | `#a78238` | `#ffffff` | 3.56:1 | Decorative or redundant graphical symbols; surrounding prose explains both directions |
| Four component-link arrows | `#203341` | `#ffffff` | 13.03:1 | Decorative arrows; the visible link wording identifies each destination |

The SVG has an accessible title and description; a visible caption explains that relationships and consequences flow in both directions. Meaning does not depend on recognizing the circle colors or arrow glyphs.

## Responsive visual review

At both 320 and 768 CSS pixels, no clipped text, overlapping content, or horizontal overflow is visible. Navigation remains available, headings wrap within their columns, the five pathway controls are readable, and the six ACA fields, component cards and flourishing diagram fit. At 320 pixels the layout becomes one column; at 768 pixels the hero and component cards retain two columns. The full-page screenshots cover the page through its footer.

## No-JavaScript test correction

The CI trace contains the expected `<noscript><p>…</p></noscript>` node. Installed Playwright 1.65.1 source explicitly excludes `NOSCRIPT` in `shouldSkipForTextMatching`, so a `getByText` assertion was not an appropriate acceptance condition. The useful behavior already passed: all five pathway panels were visible. The corrected test verifies both the visibility and substantive guidance of every panel and saves a no-JavaScript screenshot. It does not suppress any axe rule.

## Successful corrected run

Commit `71a6d6f4345e73b30267b617a2f4043d04a6d0f4` passed [push run 44723330857](https://github.com/Kapukai/kapukai-governance-site/actions/runs/44723330857): HTML validation, 14 publication installer/rollback unit tests, and **22/22 browser checks**, with zero skipped, unexpected or flaky tests. Artifact `14623031714` has SHA-256 `6b23d62e5dd7baf0b3fd24a08c99f88e7248218fa7121fba3579c0b8922ffab2`.

The downloaded artifact's `tested-source.json` identifies that exact commit, Chromium `159.0.8154.6`, axe `4.14.1`, and source hashes matching all three local publication files. All six axe audits now contain **zero violations**. Desktop retains the 12 manually reviewed incomplete color-contrast nodes above. Each of the five mobile audits retains those 12 plus the two circuit lane paragraphs, whose backgrounds axe could not resolve. Their CSS text/background pair is `#566772` on `#f7f6f1`, **5.42:1**; the mobile screenshots show both paragraphs visibly separated from the arrow glyph and readable on their intended ivory panels.

The corrected no-JavaScript full-page screenshot was reviewed. All five complete pathways are readable, controls are hidden, and even the explanatory noscript sentence is visibly present. This corroborates that the earlier sentence assertion was a locator issue. Exact file: `final-ci/test-output/browser-checks-all-five-pa-c3c9b-readable-without-JavaScript/circuit-no-javascript.png`.

## Limits

This is a focused manual review of known automated incomplete items and responsive screenshots, not a WCAG conformance certificate. VoiceOver/NVDA, native browser zoom, Firefox/Safari and the final branded route still require their own checks. Successful loopback CI does not establish deployment or server configuration correctness.
