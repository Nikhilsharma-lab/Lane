# Changelog

All notable changes to Lane (formerly DesignQ) are documented here.

Format: `### Type` → bullet → `(PR #N)` where applicable.
Update this file with every PR before merging.

---

## 2026-04-05

### Security
- Replace hardcoded test email with `ENABLE_MULTI_ROLE_TESTING` env flag — same dev behaviour, safe in production (PR #6)
- Add role allowlist validation and lead/admin gate to invite creation (PR #6)
- Add email match check in `acceptInvite` — token possession alone no longer enough to join an org (PR #6)
- Add org scoping to `toggle-blocked`, `advance`, `impact`, and `update` endpoints — users cannot mutate requests outside their org (PR #6)
- Validate `managerId` belongs to same org before assignment (PR #7)

### Fixed
- Record `request_stages` rows on every `advance-phase` transition — cycle-time analytics in `radar.ts` now have the data they depend on (PR #8)
- Flag plaintext Figma OAuth token storage in schema with encryption TODO (PR #8)

### Docs
- Add `STORY.md` — Lane brand story, tagline, positioning, and voice rules
- Document `ENABLE_MULTI_ROLE_TESTING` env var in `CLAUDE.md` env variables section

---

## How to update this file

Every PR should include a changelog entry under the current date:

```
## YYYY-MM-DD

### Security     ← auth, permissions, data exposure
### Added        ← new features
### Changed      ← changes to existing behaviour
### Fixed        ← bug fixes
### Removed      ← removed features
### Docs         ← documentation only changes
```

Skip sections that don't apply. Keep bullets short — one line per change, PR number at the end.
