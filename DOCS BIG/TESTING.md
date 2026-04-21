# Testing Lane

**100% test coverage is the goal.** Tests are what make vibe coding safe. Without them, moving fast is just guessing. With them, it's a superpower.

## Framework

- **Unit + Integration:** Vitest v4 + @testing-library/react
- **E2E:** Playwright

## Running Tests

```bash
# Unit + integration (fast, runs everywhere)
npm test

# Watch mode (during development)
npm run test:watch

# E2E (requires dev server running on :3000)
npm run test:e2e
```

## Test Layers

| Layer | Tool | Location | When to write |
|-------|------|----------|---------------|
| Unit | Vitest | `test/*.test.ts` | Pure functions, helpers, business logic |
| Integration | Vitest + Testing Library | `test/*.test.tsx` | Components with state, forms, user interactions |
| E2E | Playwright | `e2e/*.spec.ts` | Full flows — login, create request, prove gate |

## Conventions

- Files: `test/{module-name}.test.ts` or colocated `*.test.tsx` next to components
- Assertions: use `@testing-library/jest-dom` matchers (`toBeInTheDocument`, `toHaveTextContent`, etc.)
- Setup: shared test setup in `test/setup.ts`
- Mocks: mock external deps (Supabase, AI, Resend) with `vi.mock()`. Never mock the module under test.
- Tests should assert WHAT code does, not HOW it does it. Never `expect(x).toBeDefined()`.

## Expectations

When you add a feature:
- Write a test for the happy path
- Write a test for the error case if there is one
- Write a test for each important conditional branch

When you fix a bug:
- Write a regression test that would have caught the bug
- Include the ISSUE or bug description in a comment

When you add a conditional (`if/else`, `switch`):
- Test both paths

Never commit code that makes existing tests fail.
