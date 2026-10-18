# Global token enforcement

Approved: replace remaining component CSS visual literals with shared theme tokens before further feature work.

## Contract

Arc keeps component APIs and interaction logic. Supabase remains the production source for colours, spacing, radii, surfaces and shadows. Preserve Lane layout proportions, approved pills, keyboard behavior and responsive thresholds. Accessibility clipping, percentage geometry, zero values, SVG geometry and Arc JavaScript animation physics are mechanics, not theme values.

## Work

1. Inventory all application and component CSS, including Arc internals; distinguish source token definitions from their consumers.
2. Add a CSS-parser-based guard and regression tests; prove it catches fixed spacing, radius, colours, shadows and typography, including literals hidden in custom-property fallbacks. Wire it into the existing CI design check.
3. Convert consumer values to semantic tokens or spacing-scale calculations. Map local colours and elevation to existing semantic roles. Keep source provenance hashes and adaptation documentation current.
4. Add a browser test that changes global spacing/radius tokens and observes multiple components update, then restores the theme.
5. Run guard tests, source check, TypeScript, lint, relevant browser stories in light/desktop and dark/mobile, and a production build. Inspect the Requests page. Record failures and boundaries honestly.

No routes, data changes or new product features. Existing uncommitted tag removal and concurrent Intake story are preserved.

## Completed and locally verified

- Migrated 40 CSS consumer files, plus shared foundation roles and the production mapping. Date-range radius animation and sidebar rail geometry now read CSS values.
- Added 7 guard regression tests and wired them into `design:check`, already run by the main/PR CI workflow. CSS source audit and static JSX style audit pass; provenance passes for 68 source files (53 documented adaptations).
- Token propagation / Requests / notifications / measurement: 63 passing browser checks at desktop, repeated with 63 passing at dark 390px. Shared controls/forms/overlays/feedback/navigation/sidebar peek passed; five resize stories initially retained obsolete 272px expectations. Corrected to the already-shipped 208px Supabase default; all 14 resize checks then passed. Final propagation/navigation/measurement run: 48 passing.
- Full TypeScript and lint passed; final targeted lint and diff checks passed. Production build passed with `NEXT_DIST_DIR=.next-audit` (the first normal-directory attempt met another build's lock, so no process was interrupted).
- Live Requests manually inspected in dark mode at default viewport and 1440px, with no horizontal document overflow. Screenshot: `/tmp/lane-global-tokens-requests.png`. Temporary viewport restored.
- No claim of a full Storybook suite or hosted release verification. Concurrent Request-detail work and the earlier tag removal remain in the shared checkout and were not reverted or committed by this task.
