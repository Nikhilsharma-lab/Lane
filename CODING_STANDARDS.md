# Lane — coding standards

Read during review. These are judgement calls; a rule a linter can check belongs in `eslint.config.mjs`
or `pnpm design:check` instead. Also binding: the working rules in `AGENTS.md`, the vocabulary in
`GLOSSARY.md`, and `DESIGN.md` with `docs/design-system/theme-file.md` for UI.

## Email

- **Subjects and From names are fixed strings.** Names, workspace names and any other text a person typed
  go in the body only. Mail from Lane's verified domain lends its authority to the subject line, so an
  inviter-chosen workspace name there reads as Lane speaking (#358 review).

## Adapters

- **The adapter that produces a result format owns its parsing.** When a caller needs to classify an
  adapter's result (Resend's `resend_<status>` reasons, for example), the adapter exports the predicate
  and every caller uses it. Then the format changes in one place (#358 review: the refusal check was
  written twice).
