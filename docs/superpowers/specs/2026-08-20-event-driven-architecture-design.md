# Event-Driven Architecture Extensions — Design

**Date:** 2026-08-20
**Status:** Approved for planning
**Scope:** Transactional outbox + domain events, real-time admin dashboard, audit log, idempotency keys.

## Context

The current backend (NestJS + Prisma + PostgreSQL) is a straightforward `controller → service →
repository → dto` CRUD app. It works correctly but has no async/event backbone, no observability
into "who changed what," no protection against duplicate mutating requests, and admin reporting is
polling-only. This design adds four related capabilities on top of the existing schema without
touching any existing table:

1. Transactional outbox + domain events (the backbone)
2. Real-time admin dashboard (WebSocket, fed by #1)
3. Audit log (fed by #1)
4. Idempotency keys (independent, on mutating endpoints)

All four are additive: no existing table is altered, no existing endpoint's default behavior
changes (idempotency is opt-in via a header). This can ship as one migration with zero risk to the
current feature set.

## Why an outbox instead of firing events directly from services

Emitting an in-memory event immediately after a Prisma write is the "dual write" anti-pattern: if
the process crashes between the DB commit and the event emission (or the event handler throws),
the event is lost silently and the audit log / dashboard / any future consumer permanently
diverges from the database. Writing the event row in the **same Prisma transaction** as the
business mutation guarantees the event exists if and only if the mutation committed. A poller then
drains it asynchronously, decoupling "did the write happen" from "did every consumer react to it."

This is the one piece of real infrastructure complexity in the design, and it's the thing worth
explaining in an interview: it's the same problem message queues solve with "outbox pattern",
implemented here on pure Postgres with no new infra dependency, with a clearly documented path to
swap the poller for Postgres `LISTEN/NOTIFY` or a real broker (SQS/RabbitMQ/Kafka) if this needed
to run multi-instance.

## Data model changes

New Prisma models, all additive (`backend/prisma/schema.prisma`):

```prisma
enum EventStatus {
  PENDING
  PROCESSED
  FAILED
}

model DomainEvent {
  id            String      @id @default(uuid())
  aggregateType String      @map("aggregate_type")   // "Video" | "Question" | "Assignment"
  aggregateId   String      @map("aggregate_id")
  eventType     String      @map("event_type")        // "VideoCompleted" | "QuestionAnswered" | ...
  payload       Json
  status        EventStatus @default(PENDING)
  retryCount    Int         @default(0) @map("retry_count")
  lastError     String?     @map("last_error")
  createdAt     DateTime    @default(now()) @map("created_at")
  processedAt   DateTime?   @map("processed_at")

  @@index([status, createdAt])
  @@map("domain_events")
}

model AuditLog {
  id         String   @id @default(uuid())
  actorId    String   @map("actor_id")
  action     String                        // "QUESTION_UPDATED" | "VIDEO_PUBLISHED" | ...
  entityType String   @map("entity_type")   // "Question" | "Video"
  entityId   String   @map("entity_id")
  before     Json?
  after      Json?
  createdAt  DateTime @default(now()) @map("created_at")

  actor User @relation("AuditLogActor", fields: [actorId], references: [id])

  @@index([entityType, entityId])
  @@index([actorId])
  @@map("audit_log")
}

model IdempotencyKey {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  key          String
  endpoint     String                        // e.g. "POST /assignments"
  requestHash  String   @map("request_hash")  // sha256 of normalized body
  status       String   @default("PROCESSING") // "PROCESSING" | "COMPLETED"
  statusCode   Int?     @map("status_code")
  responseBody Json?    @map("response_body")
  createdAt    DateTime @default(now()) @map("created_at")

  user User @relation("IdempotencyKeyUser", fields: [userId], references: [id])

  @@unique([userId, key])
  @@map("idempotency_keys")
}
```

`DomainEvent.aggregateId` is intentionally a plain string with no FK — it's polymorphic across
aggregate types, and events must survive even if we ever hard-delete an aggregate (audit trails
outlive the thing they describe). `User` gets two new back-relations (`AuditLog`, `IdempotencyKey`).

One migration: `npx prisma migrate dev --name add_event_architecture`.

## Components

### `src/events/` (new module — the backbone)

- `events.repository.ts` — thin Prisma access for `domain_events`.
- `outbox.service.ts` — `recordEvent(tx, { aggregateType, aggregateId, eventType, payload })`.
  Takes a Prisma transaction client (`Prisma.TransactionClient`) so callers can pass it into
  `prisma.$transaction([...])` alongside the business write. This is the only way event rows get
  created — no service is allowed to write to `domain_events` outside a transaction shared with
  the mutation it describes.
- `outbox-poller.service.ts` — `@Injectable()`, `@Interval(2000)` (via `@nestjs/schedule`). Polls up
  to 20 `PENDING` rows ordered by `createdAt`, emits each via `EventEmitter2.emitAsync(eventType,
payload)`, marks `PROCESSED` on success. On handler failure: increment `retryCount`, store
  `lastError`, mark `FAILED` after 3 attempts (no infinite retry loop) — a `FAILED` row is a
  dead-letter-lite, left for manual inspection, never silently dropped.
- `domain-events.ts` — string constants + TypeScript payload interfaces for the 5 event types:
  `VideoCompleted`, `QuestionAnswered`, `QuestionUpdated`, `VideoPublished`, `VideoUnpublished`.
  The three admin-triggered types (`QuestionUpdated`, `VideoPublished`, `VideoUnpublished`) carry
  an `actorId` (the authenticated admin's id, threaded down from the controller through the
  service into the repository call) — `AuditLog.actorId` comes directly from this field, not from
  a second lookup. The two learner-triggered types (`VideoCompleted`, `QuestionAnswered`) carry
  `learnerId` instead and are never consumed by the audit listener, only by the WS gateway.

### `src/audit/` (new module — consumer #1)

- `audit.service.ts` — `@OnEvent('QuestionUpdated')` / `@OnEvent('VideoPublished')` /
  `@OnEvent('VideoUnpublished')` listeners, each writes one `AuditLog` row with a before/after
  diff. This is the same data your existing `QUESTION_LOCKED` business rule already tracks
  implicitly (question immutability once answered) — the audit log makes the "who changed what,
  when" side of that story explicit and queryable.
- `audit.controller.ts` — `GET /audit-log?entityType=&entityId=` (admin-only), paginated.
- `audit.repository.ts` — Prisma queries.

### `src/realtime/` (new module — consumer #2)

- `admin.gateway.ts` — `@WebSocketGateway({ namespace: '/admin', cors: { origin:
process.env.CORS_ORIGIN } })`. On `handleConnection`, verifies the JWT passed in
  `socket.handshake.auth.token` using the existing `JwtService` + a DB lookup (mirrors
  `JwtAuthGuard`'s deleted-user check), rejects non-ADMIN roles, joins the socket to room
  `"admin"`. `@OnEvent('VideoCompleted')` / `@OnEvent('QuestionAnswered')` broadcast a small
  payload (`{ type, assignmentId, learnerId, videoId, occurredAt }`) to room `"admin"`.
- No REST surface — this is push-only. The existing `GET /reports/progress` remains the source of
  truth; the socket is purely a "something changed, go refetch/patch" signal, not a data channel of
  record. This keeps delivery-guarantee reasoning simple: if a socket message is dropped
  (disconnect), the client resyncs on reconnect via the existing polling-capable query, so at-most-
  once WS delivery is fine — `domain_events` remains the durable source of truth, not the socket.

### `src/common/interceptors/idempotency.interceptor.ts` (independent of the backbone)

- `IdempotencyInterceptor` reads the `Idempotency-Key` header. No header → passthrough, identical to
  current behavior (fully backward compatible).
- With a header: hash the request body (sha256), attempt `INSERT INTO idempotency_keys (...,
status='PROCESSING')` scoped to `(userId, key)`.
  - Insert succeeds → run the handler, then `UPDATE` the row to `status='COMPLETED'` with the
    response. Return the real response.
  - Insert conflicts (unique violation) → fetch the existing row:
    - `status='COMPLETED'` and `requestHash` matches → return the **stored** response, handler
      never runs again (`X-Idempotent-Replay: true` response header for visibility).
    - `status='COMPLETED'` and `requestHash` differs → `409 IDEMPOTENCY_KEY_CONFLICT` (same key
      reused for a different payload — a client bug, surfaced loudly instead of silently
      misapplied).
    - `status='PROCESSING'` (a concurrent duplicate request racing the first one) → `409
IDEMPOTENCY_KEY_IN_PROGRESS`, client retries after a short delay.
- Applied via `@UseInterceptors(IdempotencyInterceptor)` on `POST /assignments`,
  `PUT /learning/assignments/:id/progress`, `POST /learning/assignments/:id/responses` — the three
  endpoints most exposed to network-flake double-submits given the existing autosave/resume design.

### Wiring existing services into the backbone

Each of these repository methods changes from a single `prisma.x.update(...)` call to
`prisma.$transaction(async (tx) => { ...write...; await outbox.recordEvent(tx, {...}); })`:

- `learning.repository.ts` → `updateProgress(...)`: when the status transition is `!wasCompleted →
COMPLETED` (the service already computes this), record `VideoCompleted`.
- `learning.repository.ts` → `createResponse(...)`: always record `QuestionAnswered`.
- `questions.repository.ts` → `update(...)`: record `QuestionUpdated` with `{ before, after }` (the
  service already fetches the pre-update question via `getOwnedQuestion` — pass it through).
- `videos.repository.ts` → `setStatus(...)`: record `VideoPublished` or `VideoUnpublished`
  depending on the target status.

No controller signatures change. No DTO changes. No response shape changes.

### `app.module.ts`

Add `EventEmitterModule.forRoot()`, `ScheduleModule.forRoot()`, and the three new feature modules
(`EventsModule` as `@Global()` so `OutboxService` is injectable everywhere without re-importing,
`AuditModule`, `RealtimeModule`).

### New dependencies

`@nestjs/event-emitter`, `@nestjs/schedule`, `@nestjs/websockets`, `@nestjs/platform-socket.io`,
`socket.io` (backend); `socket.io-client` (frontend).

## Frontend changes

- `frontend/src/features/reports/` — new `useAdminSocket()` hook: opens a socket to `/admin` on
  mount (admin role only, token from the existing auth store), on `VideoCompleted`/`QuestionAnswered`
  patches the TanStack Query cache for `reports.progress` directly (`queryClient.setQueryData`)
  instead of refetching, plus a small pulsing "live" dot near the reports table header. On socket
  `connect` (including reconnects) trigger one `invalidateQueries` as a resync safety net.
- `frontend/src/app/admin/audit/` — new page, simple filterable table over `GET /audit-log`,
  reusing the existing table/badge/pagination components already used on the assignments/reports
  pages (no new UI primitives needed).

## Error handling summary

| Failure                                                        | Behavior                                                                                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business write succeeds, event insert fails                    | Whole `$transaction` rolls back — mutation never partially applies. Client gets the normal 500. State and event log can never diverge.                                                         |
| Event handler throws (audit/WS)                                | Poller catches it, increments `retryCount`, retries up to 3x with the 2s poll interval as backoff, then marks `FAILED` with `lastError`. Never crashes the poller loop, never retries forever. |
| WS client disconnects mid-session                              | At-most-once delivery accepted; reconnect triggers one query invalidation to resync from the real source of truth (`GET /reports/progress`).                                                   |
| Duplicate mutating request, same `Idempotency-Key` + same body | Cached response replayed, handler doesn't re-run.                                                                                                                                              |
| Duplicate mutating request, same key + different body          | `409 IDEMPOTENCY_KEY_CONFLICT`.                                                                                                                                                                |
| Two concurrent requests race the same new key                  | Second gets `409 IDEMPOTENCY_KEY_IN_PROGRESS` (unique constraint prevents double-processing).                                                                                                  |
| No `Idempotency-Key` header sent                               | Identical to current behavior — fully opt-in, zero regression risk.                                                                                                                            |

## Testing plan

Matches the existing convention (colocated `*.spec.ts`, Jest, unit-level — see
`progress-calculator.spec.ts` / `question-validation.spec.ts`):

- `src/events/outbox.service.spec.ts` — `recordEvent` writes a `PENDING` row using the passed
  transaction client.
- `src/events/outbox-poller.service.spec.ts` — successful emit → `PROCESSED`; throwing handler →
  `retryCount` increments and eventually `FAILED` at the 3rd attempt, never beyond.
- `src/common/interceptors/idempotency.interceptor.spec.ts` — replay-on-match, conflict-on-mismatch,
  in-progress-on-race (three cases above), passthrough-when-no-header.
- `src/audit/audit.service.spec.ts` — `QuestionUpdated` listener produces the correct `before`/`after`
  diff shape.

**Not unit tested, verified live in browser instead** (consistent with this project's existing
split between unit-tested business logic and browser-verified UI flows): the WebSocket gateway
end-to-end (two tabs — admin dashboard open, learner answering/completing in the other, confirm the
live update and the "live" indicator), and the audit log page rendering real diffs.

## Out of scope / explicit non-goals

- No Redis, no message broker — the poller is single-instance-safe by construction (Postgres is
  the only shared state) and documented as the first thing to swap if this ever needed to run more
  than one backend instance.
- No event replay/rebuild tooling, no read-model projection table — `domain_events` is a log and an
  integration point, not (yet) a second source of truth for reporting. `GET /reports/progress`
  keeps doing live joins as it does today.
- No retry/backoff tuning beyond the fixed 3-attempt cap — sufficient for a demo-scale event volume,
  called out as a tuning knob rather than solved generally.
