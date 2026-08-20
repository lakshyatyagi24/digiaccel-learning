# Contributing

Rules below are enforced by tooling (Husky + commitlint + lint-staged), not just convention —
violating them blocks the commit, not just the review.

## Commit messages (mandatory, hook-enforced)

```
<type>(<scope>): <subject>
```

- Subject: imperative mood ("add", not "added"), max 72 chars.
- Body (optional for trivial changes): explains WHY, not WHAT. Wrap at 100 chars.
- Types: `feat` `fix` `refactor` `perf` `test` `docs` `build` `chore`
- Scopes: `auth` `users` `videos` `questions` `assignments` `learning` `reports` `ui` `db` `docs` `ci`

Template at `.gitmessage` — configure with `git config commit.template .gitmessage`.

## Pre-commit checks (mandatory, hook-enforced)

`lint-staged` runs on every commit:

- ESLint (`--fix`)
- Prettier (`--write`)
- `tsc --noEmit` on touched packages

A failing check blocks the commit. No `--no-verify` bypass.

## Code rules (mandatory)

- TypeScript `strict: true` in both `backend/` and `frontend/`. No `any` without an inline comment
  explaining why it's unavoidable.
- Every backend endpoint: DTO validation (`class-validator`) + Swagger decorators + the
  standard response envelope (`docs/architecture/ADR-000-stack.md` §6). No endpoint ships without
  all three.
- Every service method that reads or writes learner-owned data (assignments, progress,
  responses) verifies the requesting user owns that resource — a role check alone (`RolesGuard`)
  is not sufficient; object-level ownership must be checked in the service.
- Controllers stay thin: HTTP concerns and DTO validation only. Business logic and authorization
  live in services. Prisma calls are isolated to repositories — a service never imports
  `PrismaClient` directly.

## Known, disclosed deviations from stricter tooling

See `docs/architecture/ADR-000-stack.md` §5 "Known deviations" — Makefile, gitleaks, migration
linting (squawk), and import-boundary linting were deliberately not carried over from the
reference project's conventions, with reasons documented rather than silently dropped.

## Local setup

See root `README.md` for the full local setup, environment variables, and seed data instructions.
