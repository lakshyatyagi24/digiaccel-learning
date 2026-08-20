# Digiaccel Learning — Video Learning + Interactive Quiz Builder

A mini learning platform where admins build video lessons with timestamp-triggered questions, assign
them to learners, and track progress and responses. Built for the Digiaccel Learning SDE II
full-stack assessment.

## Overview

Two roles, one product:

- **Admin** — create/publish videos, build timestamp questions (single choice, multiple choice,
  short answer), assign videos to learners, view progress and response reports.
- **Learner** — watch assigned videos, answer questions as they appear (video pauses until
  answered), resume exactly where they left off after a refresh, complete videos.

## Features

- JWT authentication, Argon2 password hashing, RBAC (admin/learner), deny-by-default route
  guards.
- Video CRUD with draft/published lifecycle.
- Timestamp question builder — single choice, multiple choice, short answer — with server-side
  shape validation (option counts, correct-answer counts, timestamp bounds).
- Timestamp-crossing playback engine: pauses the video the instant an unanswered question's
  timestamp is crossed, whether by normal playback or by scrubbing forward past several questions
  at once.
- Progress autosave (throttled), resume-after-refresh (including mid-question refresh), completion
  tracking driven by the furthest point ever watched (rewinding never regresses completion).
- Object-level authorization on every learner-owned resource — a learner can only ever read or
  write their own assignments.
- Admin reporting: completion %, status, response count, accuracy per learner/video.
- Standardized API response envelope, Swagger docs generated from the same DTOs used for
  validation.
- Responsive UI with loading/error/empty states on every data view.

## Architecture

```
                    ┌─────────────────────────────┐
                    │         Next.js App          │
                    │  App Router · TanStack Query  │
                    │  Zustand · React Hook Form    │
                    └──────────────┬──────────────┘
                                   │ REST / JSON
                    ┌──────────────▼──────────────┐
                    │         NestJS API           │
                    │ auth · users · videos ·      │
                    │ questions · assignments ·    │
                    │ learning · reports · health  │
                    │ controller → service →       │
                    │ repository (Prisma) → dto    │
                    └──────────────┬───────────────┘
                                   │ Prisma
                    ┌──────────────▼──────────────┐
                    │         PostgreSQL           │
                    └──────────────────────────────┘
```

Full rationale for every stack choice — including the deliberate deviation from the assessment's
recommended MongoDB/plain-React stack — is in
[`docs/architecture/ADR-000-stack.md`](docs/architecture/ADR-000-stack.md). Endpoint-by-endpoint
build status is tracked in [`docs/api-inventory.md`](docs/api-inventory.md).

## Tech Stack

| Layer        | Choice                                                               |
| ------------ | -------------------------------------------------------------------- |
| Frontend     | Next.js 16 (App Router) + TypeScript, Tailwind CSS, Radix primitives |
| Server state | TanStack Query                                                       |
| Client state | Zustand                                                              |
| Forms        | React Hook Form + Zod                                                |
| Backend      | NestJS 11 + TypeScript                                               |
| Database     | PostgreSQL + Prisma ORM                                              |
| Auth         | JWT + Argon2                                                         |
| API docs     | Swagger (OpenAPI)                                                    |
| Testing      | Jest (backend unit tests)                                            |
| Tooling      | ESLint, Prettier, Husky, commitlint, lint-staged                     |

## Project Structure

```
backend/
  prisma/schema.prisma        # data model
  prisma/seed.ts               # demo data
  src/
    common/                    # guards, filters, interceptors, decorators, exceptions
    prisma/                    # PrismaService
    auth/ users/ videos/ questions/ assignments/ learning/ reports/ health/
frontend/
  src/
    app/                       # routes: /login, /admin/*, /learner/*
    components/ui/             # Button, Input, Dialog, Select, Card, Badge...
    components/layout/         # responsive app shell (sidebar + mobile nav)
    components/feedback/       # LoadingState, ErrorState, EmptyState
    features/{auth,videos,questions,assignments,users,learning,reports}/
      api.ts                   # typed API calls
      hooks.ts                 # TanStack Query hooks
docs/
  architecture/ADR-000-stack.md
  api-inventory.md
docker-compose.yml              # Postgres for local dev
```

## Prerequisites

- Node.js 20+ and npm
- PostgreSQL 16+ (via Docker, or a native install)
- Docker Desktop (optional — only needed if you use the Docker Compose path below)

## Local Setup

```bash
git clone <repo-url>
cd digiaccel-learning-assignment
cp .env.example backend/.env
cp .env.example frontend/.env.local   # only the NEXT_PUBLIC_API_URL line is used here
```

**1. Start Postgres**

```bash
docker compose up -d postgres
```

If Docker isn't available, point `DATABASE_URL` in `backend/.env` at any local PostgreSQL 16+
instance instead — the app only needs a reachable connection string.

**2. Backend**

```bash
cd backend
npm install
npx prisma migrate deploy   # applies the committed migration
npm run db:seed             # demo users, videos, questions, one in-progress assignment
npm run start:dev           # http://localhost:4000/api/v1
```

**3. Frontend** (separate terminal)

```bash
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

Open `http://localhost:3000` — you'll land on `/login`.

## Environment Variables

See [`.env.example`](.env.example) at the repo root for the full list. Summary:

| Variable              | Where                 | Purpose                                                    |
| --------------------- | --------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`        | `backend/.env`        | Postgres connection string                                 |
| `JWT_SECRET`          | `backend/.env`        | JWT signing secret — replace for anything beyond local dev |
| `JWT_EXPIRES_IN`      | `backend/.env`        | Access token lifetime (default `1d`)                       |
| `CORS_ORIGIN`         | `backend/.env`        | Allowed frontend origin                                    |
| `PORT`                | `backend/.env`        | API port (default `4000`)                                  |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | Base URL the frontend calls                                |

## Database Setup & Seeding

The schema lives in [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) — seven tables
(`users`, `videos`, `questions`, `question_options`, `assignments`, `learning_progress`,
`quiz_responses`), normalized with foreign keys and unique constraints (`(video_id, learner_id)` on
assignments, `(assignment_id, question_id)` on responses) so duplicate assignments and duplicate
answers are impossible at the database level, not just checked in application code.

```bash
cd backend
npx prisma migrate deploy   # apply migrations (non-interactive, safe for CI/fresh clones)
npm run db:seed             # idempotent-ish demo data — see note below
```

Re-running the seed script inserts a second copy of the demo videos (it does not delete first);
if you want a clean slate, drop and recreate the database, or truncate the tables, before
re-seeding.

## Demo Credentials

| Role    | Email                  | Password                                                                                                               |
| ------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Admin   | `admin@example.com`    | `Admin@123`                                                                                                            |
| Learner | `learner@example.com`  | `Learner@123` — has an in-progress "JavaScript Fundamentals" assignment (2 of 4 questions already answered, resumable) |
| Learner | `learner2@example.com` | `Learner@123` — has a not-started "React Basics" assignment                                                            |

## API Documentation

Swagger UI: `http://localhost:4000/api/v1/docs` (once the backend is running). Every endpoint has
DTO-derived request/response schemas, status codes, and bearer-auth annotations — the docs can't
drift from the actual validation because they're generated from the same decorators.

## Authentication

`POST /api/v1/auth/login` returns a JWT access token. Send it as `Authorization: Bearer <token>`.
Guards are **deny-by-default** — every route requires a valid token unless explicitly marked
`@Public()` (currently just `login` and `health`) — and `@Roles(...)` restricts by role on top of
that.

## Architecture Decisions

See [`docs/architecture/ADR-000-stack.md`](docs/architecture/ADR-000-stack.md) for the full
reasoning, including the deliberate PostgreSQL/Next.js substitution for the assessment's
recommended MongoDB/React stack, the `controller → service → repository → dto` module layering,
and the engineering conventions (commit format, pre-commit hooks, object-level authorization
discipline) borrowed and adapted from a prior production codebase.

## Business Rules

- **Published-question immutability**: once a question has at least one learner response, it can
  no longer be edited or deleted (`QUESTION_LOCKED`) — this keeps historical responses
  unambiguous. Adding _new_ questions to an already-published video is still allowed.
- **Assignment prerequisites**: a video can only be assigned once it's `PUBLISHED`; the target
  user must have the `LEARNER` role; the same video can't be assigned twice to the same learner
  (`ASSIGNMENT_ALREADY_EXISTS`).
- **Completion is driven by the furthest point ever watched** (`maxWatchedSeconds`), not the
  current playhead — rewinding to review earlier content never causes completion to regress.
- **Responses are one-shot**: submitting an answer to an already-answered question returns
  `ALREADY_ANSWERED` (409) rather than silently overwriting the first response.
- **Short-answer questions are stored, not auto-graded** (`isCorrect: null`) — free text can't be
  correctness-checked server-side without a rubric, so accuracy reporting excludes them from the
  denominator rather than silently counting them as wrong.
- **Learners never see correct answers before submitting**: the `GET
/learning/assignments/:id` payload strips `isCorrect` from every option; it's only revealed
  in the stored response after that specific question has been answered.

## Edge Cases Handled

**Auth** — invalid credentials, expired/malformed JWT, deleted-user token (validated against the
DB on every request, not just signature-checked).

**Videos/Questions** — timestamp beyond video duration, single-choice with ≠1 correct option,
multiple-choice with 0 correct options, short-answer with options attached, fewer than 2 options
on a choice question, deleting/editing a question that already has responses.

**Assignments** — duplicate assignment, assigning an unpublished video, assigning to a non-learner
or nonexistent user.

**Learning** — accessing another learner's assignment (403, not a 404 leak), progress value beyond
video duration, refreshing mid-question (the pending question re-opens instead of silently
resuming past it), scrubbing forward past multiple unanswered questions (only the first crossed
one fires), replaying an already-answered question (options render read-only via the stored
response), tab switch / navigation-away (progress flushed via `visibilitychange` and
`beforeunload`, not just on pause).

## Testing

```bash
cd backend
npm test
```

20 unit tests cover the two pieces of business logic most worth testing in isolation:

- `progress-calculator.spec.ts` — completion percentage math (zero-duration guard, rounding,
  clamping past 100%, rewind-doesn't-regress).
- `question-validation.spec.ts` — every question-shape rule (option counts, correct-answer counts
  per type, timestamp bounds).

Full request/response integration tests and a Playwright E2E of the golden path were out of scope
for the time available — see **Known Limitations**.

## Docker

```bash
docker compose up -d postgres
```

Only Postgres is containerized. The backend and frontend run on the host with hot reload during
development — see [`docs/architecture/ADR-000-stack.md`](docs/architecture/ADR-000-stack.md) §5
for why the backend/frontend containers weren't added.

## Assumptions

- Single JWT access token per session; no refresh-token rotation.
- Video files are hosted externally — the app stores a URL, not a file upload/streaming pipeline.
  Seed data uses W3C's own publicly hosted sample clip
  (`https://media.w3.org/2010/05/sintel/trailer.mp4`, ~52s) rather than a placeholder duration
  mismatched to a toy video file, so the timestamp-question engine is actually exercisable end to
  end with real playback.
- "Duration" is an admin-entered metadata field on the video, independent of the actual media
  file's length — the app doesn't probe the video for its real duration.
- Logout is client-side token discard; there's no server-side token blocklist (JWTs remain valid
  until expiry even after "logout").

## Known Limitations

- No refresh tokens — a learner mid-video when the access token expires will be redirected to
  `/login` (their progress up to that point is already saved).
- No Playwright/integration test suite — see **Testing** above for what was prioritized instead
  under the time constraint.
- Search/filter exists for videos, assignments, and users, but there's no saved-filter or
  URL-persisted-query UX.
- The question builder's "correct answer" UI doesn't warn if you leave a choice question with an
  empty option's text; server-side validation catches it on submit instead of live inline.
- No CI-run integration tests against a real database — GitHub Actions in `.github/workflows/ci.yml`
  runs lint, typecheck, and the unit suite only.
