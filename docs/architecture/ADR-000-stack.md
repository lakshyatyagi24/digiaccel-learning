# ADR-000: Stack and Architecture Decisions

Status: Accepted
Context: SDE II Full-Stack Assessment — "Video Learning + Interactive Quiz Builder" (Digiaccel Learning)

## 1. Scope

The assessment's own recommended stack is React + Node/NestJS + MongoDB + JWT, explicitly
described as a *recommendation*, not a requirement. The graded areas are frontend (30%), backend
APIs (25%), state management (15%), database design (10%), UX (10%), code quality/docs (10%).
Deployment is explicitly not required — the project runs locally only.

## 2. Stack decision

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript | React framework with file-based routing; SSR unused (no deployment target) but App Router's layout/route conventions keep the feature-based structure clean |
| Styling | Tailwind CSS + shadcn/ui | Fast, accessible, consistent components without a heavy design-system dependency |
| Server state | TanStack Query | Caching, mutation, retry, loading/error state for all API data |
| Client/UI state | Zustand | Small, explicit store for UI-only state (player state, modal open/closed) — kept separate from server state on purpose |
| Forms | React Hook Form + Zod | Efficient forms with runtime validation and inferred types |
| Backend | NestJS + TypeScript | Modules/controllers/providers/guards/pipes map directly onto the graded areas (validation, auth, API structure) |
| Database | PostgreSQL | Relational integrity for a domain that is inherently relational: videos → questions → options, assignments joining users↔videos, responses joining assignments↔questions. Foreign keys and unique constraints enforce invariants the app would otherwise have to hand-roll (no duplicate assignment, no duplicate response, no orphaned question) |
| ORM | Prisma | Type-safe schema-to-client generation, migrations, matches the "database design" evaluation criterion directly |
| Auth | JWT (access token) + Argon2 password hashing | Assessment's explicit requirement |
| API docs | Swagger/OpenAPI (NestJS decorators) | Assessment accepts Swagger/Postman/equivalent; Swagger is generated from the same DTOs used for validation, so it can't drift |
| Local infra | Docker Compose (Postgres only) | Backend/frontend run on host for hot reload during a time-boxed build; Postgres is the one piece worth containerizing (no local install/version drift) |

### Deviation from the assessment's recommended stack

MongoDB → PostgreSQL, and React (unspecified tooling) → Next.js, were substituted at the
candidate's explicit request. This is a deliberate, disclosed deviation, not an oversight — the
relational model gives referential integrity for a domain (assignments, responses, progress) that
is naturally join-heavy, and Next.js's file-based routing suits the two-role (admin/learner) page
structure. Every other core requirement (JWT auth, RBAC, video CRUD, timestamp questions, resume
progress, admin reporting) is unaffected by this substitution.

## 3. Module layering (backend)

Each domain module follows: **controller → service → repository (Prisma) → dto**. Controllers stay
thin (HTTP concerns + validation only); business rules and authorization checks live in services;
Prisma calls are isolated to repositories so a service never talks to the ORM directly. This
mirrors a `router → service → repository → models` layering used successfully in a prior
production codebase this repo's conventions are modeled after (see §5).

Modules: `auth`, `users`, `videos`, `questions`, `assignments`, `learning`, `reports`, `health`.

## 4. Frontend architecture

Feature-based, not type-based: `features/{auth,videos,assignments,learning,quiz,reports}`, each
owning its own components, hooks, and API calls. Shared primitives live in `components/ui`
(shadcn) and `components/layout`. Server state (TanStack Query) and UI state (Zustand) are kept in
physically separate files so it's never ambiguous which one owns a given piece of state.

## 5. Engineering conventions (borrowed, adapted)

Adapted from a prior production codebase's engineering discipline:

- Commit format: `<type>(<scope>): <subject>`, imperative mood, ≤72 chars subject, body explains
  WHY not WHAT. Enforced by Husky + commitlint, not just documented.
- `lint-staged` runs ESLint + Prettier + `tsc --noEmit` pre-commit — a failing check blocks the
  commit.
- TypeScript `strict: true` in both apps; no `any` without an inline reason comment.
- Every service method touching learner-owned data verifies ownership explicitly (object-level
  authorization), not just role-based guards — a learner querying `GET
  /learning/assignments/:id` for someone else's assignment is a 403, not a 404 leak or a
  silent bypass.
- Every endpoint has DTO validation (`class-validator`), Swagger decorators, and returns the
  standardized response envelope (see §6).
- `docs/api-inventory.md` tracks every endpoint's build status (✅/🟡/⬜) — both a design artifact
  and a live scope tracker under the time-boxed build.

### Known deviations from the reference project (disclosed, not silent)

The reference project additionally used a Makefile, gitleaks, a Postgres migration linter
(squawk), and import-boundary linting. None are carried over here:

- **Makefile** → npm scripts instead (Makefile requires `make` on PATH, a Windows dev-machine risk
  not worth taking under a same-night deadline).
- **gitleaks** → not installed; policy instead (`.env` is gitignored, secrets never committed,
  `.env.example` holds placeholder values only).
- **squawk / migration linting** → schema is small enough (7 tables) for manual review of every
  Prisma migration before `migrate dev`; a dedicated linter is disproportionate at this scale.
- **import-linter boundary enforcement** → no equivalent architectural seam exists at this scale
  (that tool enforced "only one module may import langgraph"; this app has no analogous boundary
  worth machine-enforcing).

## 6. API conventions

Base path `/api/v1`. Standard envelope:

```json
// success
{ "success": true, "data": { } }

// list
{ "success": true, "data": [], "meta": { "page": 1, "limit": 20, "total": 40 } }

// error
{ "success": false, "error": { "code": "VIDEO_NOT_FOUND", "message": "Video not found" } }
```

## 7. Data model summary

`users` · `videos` · `questions` · `question_options` · `assignments` · `learning_progress` ·
`quiz_responses` — see `prisma/schema.prisma` for the authoritative definition, including
constraints (`unique(video_id, learner_id)` on assignments, `unique(assignment_id, question_id)`
on responses, `unique(assignment_id)` on progress).

## 8. Assumptions

- Single active JWT access token per session; no refresh-token rotation (out of scope for an
  8–12 hour assessment; documented as a known limitation, not silently missing).
- Video files are hosted externally (a URL field) — no upload/streaming pipeline is built.
- Published-video question sets are treated as immutable once a learner has responded, to keep
  historical responses unambiguous (documented in README's "Assumptions" section).
