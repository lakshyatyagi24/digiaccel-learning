# API Inventory

Tracks every endpoint's build status. ✅ built & verified (curl + live browser testing) · 🟡 partial
· ⬜ not started. Base path: `/api/v1`.

## Auth

| Endpoint | Status | Notes |
|---|---|---|
| `POST /auth/login` | ✅ | returns JWT + user, `@Public()` |
| `GET /auth/me` | ✅ | current user from token |
| `POST /auth/logout` | ✅ | stateless — client discards token |

## Videos (admin)

| Endpoint | Status | Notes |
|---|---|---|
| `GET /videos` | ✅ | paginated, filter by status + title search |
| `POST /videos` | ✅ | |
| `GET /videos/:id` | ✅ | includes questions + options |
| `PATCH /videos/:id` | ✅ | |
| `DELETE /videos/:id` | ✅ | blocked if video has assignments |
| `POST /videos/:id/publish` | ✅ | |
| `POST /videos/:id/unpublish` | ✅ | |

## Questions (admin, nested under video)

| Endpoint | Status | Notes |
|---|---|---|
| `POST /videos/:videoId/questions` | ✅ | timestamp + shape validated server-side |
| `PATCH /videos/:videoId/questions/:id` | ✅ | blocked once question has responses |
| `DELETE /videos/:videoId/questions/:id` | ✅ | blocked once question has responses |

## Assignments (admin)

| Endpoint | Status | Notes |
|---|---|---|
| `POST /assignments` | ✅ | rejects duplicate (video,learner), unpublished video, non-learner target |
| `GET /assignments` | ✅ | paginated, filter by video/learner |

## Users (admin)

| Endpoint | Status | Notes |
|---|---|---|
| `GET /users` | ✅ | paginated, filter by role + search — powers the assignment picker |

## Learner

| Endpoint | Status | Notes |
|---|---|---|
| `GET /learning/assignments` | ✅ | current learner's assignments only |
| `GET /learning/assignments/:id` | ✅ | ownership-checked, strips `isCorrect` from unanswered options |
| `GET /learning/assignments/:id/progress` | ✅ | ownership-checked |
| `PUT /learning/assignments/:id/progress` | ✅ | ownership-checked, drives completion off max-watched |
| `POST /learning/assignments/:id/responses` | ✅ | ownership-checked, one-shot per question, server-side grading |

## Reports (admin)

| Endpoint | Status | Notes |
|---|---|---|
| `GET /reports/progress` | ✅ | joined learner+video+progress+accuracy, filterable |

## Health

| Endpoint | Status | Notes |
|---|---|---|
| `GET /health` | ✅ | `@Public()`, checks DB connectivity |

## Verification summary

- All auth/RBAC/object-level-authorization paths tested live (admin vs learner, cross-learner
  access blocked, unauthenticated requests rejected).
- Full golden path exercised end-to-end in a real browser against the real Postgres database and
  a real (short, W3C-hosted) video file: login → resume-from-refresh → timestamp-crossing pause →
  short-answer submission → resume → single-choice submission → video completion → progress
  reaching 100% → admin report reflecting accuracy (67% — correctly excluding the ungraded
  short-answer response from the denominator).
- 20 backend unit tests passing (`progress-calculator`, `question-validation`).
