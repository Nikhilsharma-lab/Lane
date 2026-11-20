# PROTOTYPE (#346): Lane's own auth screens on Better Auth, in Arc

Throwaway. Never merged. Nothing calls Better Auth, Clerk or the database.

Run: `pnpm dev`, then open http://localhost:3000/prototype/auth

- `?screen=` login · signup · forgot · reset · invite · onboarding · account · workspace
- `?variant=` A · B · C (login and signup only): A one page, password first; B email first, then how; C code first
- `?state=` jumps to a state; the bottom bar switches all three, ← → cycle variants (or states)

Demo rules: an email containing "new" has no account, "fail" can't be sent a code, "taken" already has an account;
password "wrong" doesn't match, "password1" is breached; code 000000 is wrong, 111111 expired, anything else works.

`src/components/arc/otp-input/` is Arc's OTP input from the registry, changed from `motion` to `m` for Lane's LazyMotion.
