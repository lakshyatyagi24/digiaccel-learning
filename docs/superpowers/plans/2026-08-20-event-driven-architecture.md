# Event-Driven Architecture Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a transactional outbox + domain events backbone to the NestJS backend, then build three consumers on top of it — a real-time admin dashboard (WebSocket), an audit log, and idempotency keys on mutating endpoints — without changing any existing table or breaking any existing endpoint's default behavior.

**Architecture:** Every state-changing mutation that matters (video completed, question answered, question edited, video published/unpublished) writes a row to a new `domain_events` table in the _same Prisma transaction_ as the business write. A poller drains that table on an interval and re-emits each event in-process via `EventEmitter2`. Two listeners consume those events: one writes to an `audit_log` table, the other pushes to admin browsers over a Socket.IO gateway. Idempotency keys are a fourth, independent addition: an opt-in interceptor on three endpoints that dedupes retried mutating requests via a new `idempotency_keys` table.

**Tech Stack:** NestJS 11, Prisma 6 / PostgreSQL, `@nestjs/event-emitter`, `@nestjs/schedule`, `@nestjs/websockets` + `@nestjs/platform-socket.io` (Socket.IO), `socket.io-client` on the Next.js 16 frontend. No new infrastructure (no Redis, no message broker) — see spec for why.

**Spec:** [docs/superpowers/specs/2026-08-20-event-driven-architecture-design.md](../specs/2026-08-20-event-driven-architecture-design.md)

## Global Constraints

- No existing Prisma table is altered — only three new tables (`domain_events`, `audit_log`, `idempotency_keys`) plus two new back-relations on `User`.
- No existing endpoint's default behavior changes. The idempotency interceptor is a no-op when the `Idempotency-Key` header is absent.
- Event rows are written **only** inside `prisma.$transaction(...)`, in the same transaction as the business mutation they describe — never as a separate write after the fact.
- No Redis, no message broker. The outbox poller is single-instance-safe by construction (Postgres is the only shared state).
- Poller retries a failed event handler up to 3 attempts, then marks the event `FAILED` and stops retrying (no infinite loop, no silent drop).
- Follow the existing `controller → service → repository → dto` layering and existing code conventions (`AppException` subclasses, `@CurrentUser()`, `@Roles()`, colocated `*.spec.ts`) in every new file.
- Frontend has no test runner configured (`frontend/package.json` has no `test` script or Jest/Vitest dependency) — frontend tasks are verified via `npm run build` + live browser check, not new unit tests. Do not introduce a new frontend test framework as part of this plan.

---

## File Structure

**New backend files:**

```
backend/src/events/
  domain-events.ts            # event name constants + payload types
  events.repository.ts        # domain_events Prisma access
  outbox.service.ts           # recordEvent(tx, ...) — the only way to write an event
  outbox.service.spec.ts
  outbox-poller.service.ts    # @Interval poller, drains PENDING -> EventEmitter2
  outbox-poller.service.spec.ts
  events.module.ts

backend/src/audit/
  dto/list-audit-log-query.dto.ts
  audit.repository.ts
  audit.service.ts            # @OnEvent listeners + list()
  audit.service.spec.ts
  audit.controller.ts
  audit.module.ts

backend/src/realtime/
  ws-auth.ts                  # pure token-verification helper (unit tested)
  ws-auth.spec.ts
  admin.gateway.ts            # Socket.IO gateway, namespace /admin
  realtime.module.ts

backend/src/idempotency/
  idempotency.repository.ts
  idempotency.service.ts      # hash + begin/complete logic
  idempotency.service.spec.ts
  idempotency.interceptor.ts
  idempotency.module.ts
```

**Modified backend files:**

```
backend/prisma/schema.prisma          # + 3 models, 1 enum, 2 User back-relations
backend/package.json                  # + 5 dependencies (across tasks 3, 9)
backend/src/app.module.ts             # + EventEmitterModule, ScheduleModule, 3 feature modules
backend/src/learning/learning.repository.ts   # updateProgress/createResponse emit events
backend/src/learning/learning.service.ts      # pass actor/video context through
backend/src/learning/learning.module.ts       # import EventsModule
backend/src/learning/learning.controller.ts   # apply IdempotencyInterceptor (2 routes)
backend/src/questions/questions.repository.ts # update() emits QuestionUpdated
backend/src/questions/questions.service.ts    # accept + pass through actor/before-snapshot
backend/src/questions/questions.controller.ts # pass @CurrentUser() through
backend/src/questions/questions.module.ts     # import EventsModule
backend/src/videos/videos.repository.ts       # setStatus() emits Video(Un)Published
backend/src/videos/videos.service.ts          # accept + pass through actor
backend/src/videos/videos.controller.ts       # pass @CurrentUser() through
backend/src/videos/videos.module.ts           # import EventsModule
backend/src/assignments/assignments.controller.ts  # apply IdempotencyInterceptor
backend/src/assignments/assignments.module.ts       # import IdempotencyModule
```

**New frontend files:**

```
frontend/src/features/reports/use-admin-socket.ts
frontend/src/features/audit/api.ts
frontend/src/features/audit/hooks.ts
frontend/src/app/admin/audit/page.tsx
```

**Modified frontend files:**

```
frontend/package.json                    # + socket.io-client
frontend/src/app/admin/reports/page.tsx  # wire useAdminSocket() + live indicator
frontend/src/app/admin/layout.tsx        # + Audit Log nav item
```

---

## Task 1: Prisma schema — add the three new tables

**Files:**

- Modify: `backend/prisma/schema.prisma`

**Interfaces:**

- Produces: `EventStatus` enum (`PENDING`/`PROCESSED`/`FAILED`), `DomainEvent`, `AuditLog`, `IdempotencyKey` Prisma models — every later task in this plan depends on these existing in `@prisma/client`.

- [ ] **Step 1: Add the enum and three models**

Add this after the existing `enum ProgressStatus { ... }` block:

```prisma
enum EventStatus {
  PENDING
  PROCESSED
  FAILED
}
```

Add these three models after the existing `QuizResponse` model, at the end of the file:

```prisma
model DomainEvent {
  id            String      @id @default(uuid())
  aggregateType String      @map("aggregate_type")
  aggregateId   String      @map("aggregate_id")
  eventType     String      @map("event_type")
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
  action     String
  entityType String   @map("entity_type")
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
  endpoint     String
  requestHash  String   @map("request_hash")
  status       String   @default("PROCESSING")
  statusCode   Int?     @map("status_code")
  responseBody Json?    @map("response_body")
  createdAt    DateTime @default(now()) @map("created_at")

  user User @relation("IdempotencyKeyUser", fields: [userId], references: [id])

  @@unique([userId, key])
  @@map("idempotency_keys")
}
```

- [ ] **Step 2: Add the two back-relations to `User`**

In the existing `model User { ... }` block, add two lines after `assignments Assignment[] @relation("AssignmentLearner")`:

```prisma
  auditLogs       AuditLog[]       @relation("AuditLogActor")
  idempotencyKeys IdempotencyKey[] @relation("IdempotencyKeyUser")
```

- [ ] **Step 3: Run the migration**

Run:

```bash
cd backend
npx prisma migrate dev --name add_event_architecture
```

Expected: a new folder under `prisma/migrations/` is created, the migration applies cleanly, output ends with `Your database is now in sync with your schema.`

- [ ] **Step 4: Regenerate the client and confirm nothing broke**

Run:

```bash
npx prisma generate
npm test
```

Expected: `prisma generate` succeeds silently; all 20 existing tests still pass (this is a schema-only change — nothing references the new models yet).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): add domain_events, audit_log, idempotency_keys tables"
```

---

## Task 2: Outbox core — `recordEvent` and the events repository

**Files:**

- Create: `backend/src/events/domain-events.ts`
- Create: `backend/src/events/events.repository.ts`
- Create: `backend/src/events/outbox.service.ts`
- Create: `backend/src/events/events.module.ts`
- Test: `backend/src/events/outbox.service.spec.ts`

**Interfaces:**

- Consumes: `PrismaService` (existing, `backend/src/prisma/prisma.service.ts`).
- Produces: `OutboxService.recordEvent(tx: Prisma.TransactionClient, params: RecordEventParams): Promise<DomainEvent>` — every later task that writes a business mutation transactionally calls this. `DOMAIN_EVENTS` string-constant map and payload interfaces (`VideoCompletedPayload`, `QuestionAnsweredPayload`, `QuestionUpdatedPayload`, `VideoPublishedPayload`, `VideoUnpublishedPayload`) from `domain-events.ts` — every producer and consumer task imports these instead of hardcoding event-type strings.

- [ ] **Step 1: Write `domain-events.ts`**

```typescript
export const DOMAIN_EVENTS = {
  VIDEO_COMPLETED: "VideoCompleted",
  QUESTION_ANSWERED: "QuestionAnswered",
  QUESTION_UPDATED: "QuestionUpdated",
  VIDEO_PUBLISHED: "VideoPublished",
  VIDEO_UNPUBLISHED: "VideoUnpublished",
} as const;

export type DomainEventType =
  (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

export interface VideoCompletedPayload {
  assignmentId: string;
  learnerId: string;
  videoId: string;
}

export interface QuestionAnsweredPayload {
  assignmentId: string;
  learnerId: string;
  videoId: string;
  questionId: string;
}

export interface QuestionUpdatedPayload {
  actorId: string;
  questionId: string;
  videoId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface VideoPublishedPayload {
  actorId: string;
  videoId: string;
}

export interface VideoUnpublishedPayload {
  actorId: string;
  videoId: string;
}
```

- [ ] **Step 2: Write `events.repository.ts`**

```typescript
import { Injectable } from "@nestjs/common";
import { EventStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DomainEventType } from "./domain-events";

export interface CreateDomainEventParams {
  aggregateType: string;
  aggregateId: string;
  eventType: DomainEventType;
  payload: Record<string, unknown>;
}

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(tx: Prisma.TransactionClient, params: CreateDomainEventParams) {
    return tx.domainEvent.create({ data: params });
  }

  findPending(limit: number) {
    return this.prisma.domainEvent.findMany({
      where: { status: EventStatus.PENDING },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  markProcessed(id: string) {
    return this.prisma.domainEvent.update({
      where: { id },
      data: { status: EventStatus.PROCESSED, processedAt: new Date() },
    });
  }

  markFailedAttempt(id: string, retryCount: number, error: string) {
    return this.prisma.domainEvent.update({
      where: { id },
      data: {
        retryCount,
        lastError: error,
        status: retryCount >= 3 ? EventStatus.FAILED : EventStatus.PENDING,
      },
    });
  }
}
```

- [ ] **Step 3: Write the failing test for `OutboxService`**

```typescript
// backend/src/events/outbox.service.spec.ts
import { OutboxService } from "./outbox.service";
import { EventsRepository } from "./events.repository";

describe("OutboxService", () => {
  it("delegates to EventsRepository.create with the given transaction client and params", async () => {
    const created = { id: "evt-1" };
    const eventsRepository = {
      create: jest.fn().mockResolvedValue(created),
    } as unknown as EventsRepository;
    const service = new OutboxService(eventsRepository);
    const tx = {} as never;

    const params = {
      aggregateType: "Video",
      aggregateId: "vid-1",
      eventType: "VideoPublished" as const,
      payload: { actorId: "admin-1", videoId: "vid-1" },
    };
    const result = await service.recordEvent(tx, params);

    expect(eventsRepository.create).toHaveBeenCalledWith(tx, params);
    expect(result).toBe(created);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && npx jest events/outbox.service.spec.ts`
Expected: FAIL — `Cannot find module './outbox.service'`.

- [ ] **Step 5: Write `outbox.service.ts`**

```typescript
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { EventsRepository, CreateDomainEventParams } from "./events.repository";

@Injectable()
export class OutboxService {
  constructor(private readonly eventsRepository: EventsRepository) {}

  recordEvent(tx: Prisma.TransactionClient, params: CreateDomainEventParams) {
    return this.eventsRepository.create(tx, params);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx jest events/outbox.service.spec.ts`
Expected: PASS (1 test).

- [ ] **Step 7: Write `events.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { EventsRepository } from "./events.repository";
import { OutboxService } from "./outbox.service";

@Module({
  providers: [EventsRepository, OutboxService],
  exports: [OutboxService],
})
export class EventsModule {}
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/events
git commit -m "feat(events): add transactional outbox core (recordEvent)"
```

---

## Task 3: Outbox poller — drain events into `EventEmitter2`

**Files:**

- Create: `backend/src/events/outbox-poller.service.ts`
- Test: `backend/src/events/outbox-poller.service.spec.ts`
- Modify: `backend/src/events/events.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/package.json`

**Interfaces:**

- Consumes: `EventsRepository.findPending/markProcessed/markFailedAttempt` (Task 2), `EventEmitter2` (from `@nestjs/event-emitter`).
- Produces: nothing new consumed by later tasks directly — later tasks (`AuditService`, `AdminGateway`) listen to the emitted event names via `@OnEvent(DOMAIN_EVENTS.X)`, which only requires `EventEmitterModule.forRoot()` to be registered in `AppModule` (done in this task).

- [ ] **Step 1: Install dependencies**

Run:

```bash
cd backend
npm install @nestjs/event-emitter @nestjs/schedule
```

- [ ] **Step 2: Write the failing tests**

```typescript
// backend/src/events/outbox-poller.service.spec.ts
import { OutboxPollerService } from "./outbox-poller.service";
import { EventsRepository } from "./events.repository";
import { EventEmitter2 } from "@nestjs/event-emitter";

describe("OutboxPollerService", () => {
  function setup() {
    const eventsRepository = {
      findPending: jest.fn(),
      markProcessed: jest.fn().mockResolvedValue(undefined),
      markFailedAttempt: jest.fn().mockResolvedValue(undefined),
    } as unknown as EventsRepository;
    const eventEmitter = {
      emitAsync: jest.fn(),
    } as unknown as EventEmitter2;
    const poller = new OutboxPollerService(eventsRepository, eventEmitter);
    return { poller, eventsRepository, eventEmitter };
  }

  it("marks an event PROCESSED after a successful emit", async () => {
    const { poller, eventsRepository, eventEmitter } = setup();
    (eventsRepository.findPending as jest.Mock).mockResolvedValue([
      {
        id: "evt-1",
        eventType: "VideoPublished",
        payload: { videoId: "v1" },
        retryCount: 0,
      },
    ]);
    (eventEmitter.emitAsync as jest.Mock).mockResolvedValue(undefined);

    await poller.poll();

    expect(eventEmitter.emitAsync).toHaveBeenCalledWith("VideoPublished", {
      videoId: "v1",
    });
    expect(eventsRepository.markProcessed).toHaveBeenCalledWith("evt-1");
    expect(eventsRepository.markFailedAttempt).not.toHaveBeenCalled();
  });

  it("increments retryCount and records the error when a handler throws", async () => {
    const { poller, eventsRepository, eventEmitter } = setup();
    (eventsRepository.findPending as jest.Mock).mockResolvedValue([
      {
        id: "evt-2",
        eventType: "QuestionAnswered",
        payload: {},
        retryCount: 1,
      },
    ]);
    (eventEmitter.emitAsync as jest.Mock).mockRejectedValue(
      new Error("listener exploded"),
    );

    await poller.poll();

    expect(eventsRepository.markFailedAttempt).toHaveBeenCalledWith(
      "evt-2",
      2,
      "listener exploded",
    );
    expect(eventsRepository.markProcessed).not.toHaveBeenCalled();
  });

  it("processes every pending event in the batch, not just the first", async () => {
    const { poller, eventsRepository, eventEmitter } = setup();
    (eventsRepository.findPending as jest.Mock).mockResolvedValue([
      { id: "evt-3", eventType: "VideoPublished", payload: {}, retryCount: 0 },
      {
        id: "evt-4",
        eventType: "VideoUnpublished",
        payload: {},
        retryCount: 0,
      },
    ]);
    (eventEmitter.emitAsync as jest.Mock).mockResolvedValue(undefined);

    await poller.poll();

    expect(eventsRepository.markProcessed).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx jest events/outbox-poller.service.spec.ts`
Expected: FAIL — `Cannot find module './outbox-poller.service'`.

- [ ] **Step 4: Write `outbox-poller.service.ts`**

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { EventsRepository } from "./events.repository";

const POLL_INTERVAL_MS = 2000;
const BATCH_SIZE = 20;

interface PendingEvent {
  id: string;
  eventType: string;
  payload: unknown;
  retryCount: number;
}

@Injectable()
export class OutboxPollerService {
  private readonly logger = new Logger(OutboxPollerService.name);

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Interval(POLL_INTERVAL_MS)
  async poll() {
    const pending = await this.eventsRepository.findPending(BATCH_SIZE);
    for (const event of pending) {
      await this.processEvent(event);
    }
  }

  private async processEvent(event: PendingEvent) {
    try {
      await this.eventEmitter.emitAsync(event.eventType, event.payload);
      await this.eventsRepository.markProcessed(event.id);
    } catch (error) {
      const nextRetryCount = event.retryCount + 1;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Event ${event.id} (${event.eventType}) failed on attempt ${nextRetryCount}: ${message}`,
      );
      await this.eventsRepository.markFailedAttempt(
        event.id,
        nextRetryCount,
        message,
      );
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest events/outbox-poller.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Register the poller in `events.module.ts`**

Replace the file with:

```typescript
import { Module } from "@nestjs/common";
import { EventsRepository } from "./events.repository";
import { OutboxService } from "./outbox.service";
import { OutboxPollerService } from "./outbox-poller.service";

@Module({
  providers: [EventsRepository, OutboxService, OutboxPollerService],
  exports: [OutboxService],
})
export class EventsModule {}
```

- [ ] **Step 7: Wire `EventEmitterModule` and `ScheduleModule` into `app.module.ts`**

In `backend/src/app.module.ts`, add two imports:

```typescript
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { EventsModule } from "./events/events.module";
```

And add three entries to the `imports` array (right after `ThrottlerModule.forRoot(...)`):

```typescript
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    EventsModule,
```

- [ ] **Step 8: Verify the app still boots and all tests pass**

Run:

```bash
cd backend
npm run build
npm test
```

Expected: build succeeds; all tests pass (17 pre-existing + 4 new = the poller's 3 plus Task 2's 1).

- [ ] **Step 9: Commit**

```bash
git add backend/src/events backend/src/app.module.ts backend/package.json backend/package-lock.json
git commit -m "feat(events): add outbox poller, wire EventEmitter/Schedule modules"
```

---

## Task 4: Wire learner mutations to emit `VideoCompleted` / `QuestionAnswered`

**Files:**

- Modify: `backend/src/learning/learning.repository.ts`
- Modify: `backend/src/learning/learning.service.ts`
- Modify: `backend/src/learning/learning.module.ts`

**Interfaces:**

- Consumes: `OutboxService.recordEvent` (Task 2), `DOMAIN_EVENTS`, `VideoCompletedPayload`, `QuestionAnsweredPayload` (Task 2).
- Produces: nothing new consumed by other backend tasks — `AuditService` does not listen to these two event types (they're learner-triggered, not admin-triggered — see spec). `AdminGateway` (Task 9) listens to both.

No new spec file — this is wiring plumbing verified by the full build + existing test suite staying green, consistent with this codebase's existing split between unit-tested business logic and integration-verified wiring (see spec's Testing Plan).

- [ ] **Step 1: Replace `updateProgress` and `createResponse` in `learning.repository.ts`**

Replace the whole file with:

```typescript
import { Injectable } from "@nestjs/common";
import { Prisma, ProgressStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../events/outbox.service";
import {
  DOMAIN_EVENTS,
  QuestionAnsweredPayload,
  VideoCompletedPayload,
} from "../events/domain-events";

const assignmentWithVideoInclude = {
  video: {
    include: {
      questions: {
        include: { options: true },
        orderBy: { order: "asc" as const },
      },
    },
  },
  progress: true,
} satisfies Prisma.AssignmentInclude;

@Injectable()
export class LearningRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  async findAssignmentsForLearner(
    learnerId: string,
    page: number,
    limit: number,
  ) {
    const where: Prisma.AssignmentWhereInput = { learnerId };
    const [items, total] = await Promise.all([
      this.prisma.assignment.findMany({
        where,
        include: {
          video: {
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
              durationSeconds: true,
            },
          },
          progress: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { assignedAt: "desc" },
      }),
      this.prisma.assignment.count({ where }),
    ]);
    return { items, total };
  }

  findAssignmentById(id: string) {
    return this.prisma.assignment.findUnique({
      where: { id },
      include: assignmentWithVideoInclude,
    });
  }

  findResponsesForAssignment(assignmentId: string) {
    return this.prisma.quizResponse.findMany({ where: { assignmentId } });
  }

  findResponse(assignmentId: string, questionId: string) {
    return this.prisma.quizResponse.findUnique({
      where: { assignmentId_questionId: { assignmentId, questionId } },
    });
  }

  createResponse(
    assignmentId: string,
    questionId: string,
    answer: Prisma.InputJsonValue,
    isCorrect: boolean | null,
    event: { learnerId: string; videoId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const response = await tx.quizResponse.create({
        data: { assignmentId, questionId, answer, isCorrect },
      });
      const payload: QuestionAnsweredPayload = {
        assignmentId,
        learnerId: event.learnerId,
        videoId: event.videoId,
        questionId,
      };
      await this.outboxService.recordEvent(tx, {
        aggregateType: "Assignment",
        aggregateId: assignmentId,
        eventType: DOMAIN_EVENTS.QUESTION_ANSWERED,
        payload,
      });
      return response;
    });
  }

  updateProgress(
    assignmentId: string,
    data: {
      lastWatchedSeconds: number;
      maxWatchedSeconds: number;
      completionPercentage: number;
      status: ProgressStatus;
      lastPlayedAt: Date;
      completedAt?: Date;
    },
    completionEvent: { learnerId: string; videoId: string } | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const progress = await tx.learningProgress.update({
        where: { assignmentId },
        data,
      });
      if (completionEvent) {
        const payload: VideoCompletedPayload = {
          assignmentId,
          learnerId: completionEvent.learnerId,
          videoId: completionEvent.videoId,
        };
        await this.outboxService.recordEvent(tx, {
          aggregateType: "Assignment",
          aggregateId: assignmentId,
          eventType: DOMAIN_EVENTS.VIDEO_COMPLETED,
          payload,
        });
      }
      return progress;
    });
  }
}
```

- [ ] **Step 2: Update `learning.service.ts` to pass the event context through**

In `updateProgress`, replace the final `return this.learningRepository.updateProgress(...)` call:

```typescript
const isNewlyCompleted = status === ProgressStatus.COMPLETED && !wasCompleted;

return this.learningRepository.updateProgress(
  assignmentId,
  {
    lastWatchedSeconds: dto.currentTimeSeconds,
    maxWatchedSeconds,
    completionPercentage,
    status,
    lastPlayedAt: now,
    ...(isNewlyCompleted ? { completedAt: now } : {}),
  },
  isNewlyCompleted
    ? { learnerId: user.id, videoId: assignment.video.id }
    : null,
);
```

In `submitResponse`, replace the final `return this.learningRepository.createResponse(...)` call:

```typescript
const { answer, isCorrect } = this.gradeResponse(question, dto);
return this.learningRepository.createResponse(
  assignmentId,
  dto.questionId,
  answer,
  isCorrect,
  { learnerId: user.id, videoId: assignment.video.id },
);
```

- [ ] **Step 3: Import `EventsModule` in `learning.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { LearningController } from "./learning.controller";
import { LearningService } from "./learning.service";
import { LearningRepository } from "./learning.repository";
import { EventsModule } from "../events/events.module";

@Module({
  imports: [EventsModule],
  controllers: [LearningController],
  providers: [LearningService, LearningRepository],
})
export class LearningModule {}
```

- [ ] **Step 4: Verify**

Run:

```bash
cd backend
npm run build
npm test
```

Expected: build succeeds, all tests still pass (this task adds no new spec file — `progress-calculator.spec.ts` still covers the pure completion math, which is unchanged).

- [ ] **Step 5: Commit**

```bash
git add backend/src/learning
git commit -m "feat(events): emit VideoCompleted/QuestionAnswered from learner mutations"
```

---

## Task 5: Wire question edits to emit `QuestionUpdated`

**Files:**

- Modify: `backend/src/questions/questions.repository.ts`
- Modify: `backend/src/questions/questions.service.ts`
- Modify: `backend/src/questions/questions.controller.ts`
- Modify: `backend/src/questions/questions.module.ts`

**Interfaces:**

- Consumes: `OutboxService.recordEvent`, `DOMAIN_EVENTS.QUESTION_UPDATED`, `QuestionUpdatedPayload` (Task 2).
- Produces: `QuestionUpdatedPayload` events, consumed by `AuditService` (Task 7).

- [ ] **Step 1: Replace `update` in `questions.repository.ts`**

Replace the whole file with:

```typescript
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../events/outbox.service";
import { DOMAIN_EVENTS, QuestionUpdatedPayload } from "../events/domain-events";
import { CreateQuestionDto } from "./dto/create-question.dto";
import { UpdateQuestionDto } from "./dto/update-question.dto";

@Injectable()
export class QuestionsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  create(videoId: string, dto: CreateQuestionDto) {
    return this.prisma.question.create({
      data: {
        videoId,
        type: dto.type,
        timestampSeconds: dto.timestampSeconds,
        text: dto.text,
        order: dto.order,
        options: dto.options
          ? {
              create: dto.options.map((o, i) => ({
                text: o.text,
                isCorrect: o.isCorrect,
                order: i,
              })),
            }
          : undefined,
      },
      include: { options: true },
    });
  }

  findByIdWithOptions(questionId: string) {
    return this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true },
    });
  }

  hasResponses(questionId: string) {
    return this.prisma.quizResponse
      .count({ where: { questionId } })
      .then((count) => count > 0);
  }

  update(
    questionId: string,
    dto: UpdateQuestionDto,
    event: {
      actorId: string;
      videoId: string;
      before: Record<string, unknown>;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.question.update({
        where: { id: questionId },
        data: {
          ...(dto.type ? { type: dto.type } : {}),
          ...(dto.timestampSeconds !== undefined
            ? { timestampSeconds: dto.timestampSeconds }
            : {}),
          ...(dto.text ? { text: dto.text } : {}),
          ...(dto.order !== undefined ? { order: dto.order } : {}),
          ...(dto.options
            ? {
                options: {
                  deleteMany: {},
                  create: dto.options.map((o, i) => ({
                    text: o.text,
                    isCorrect: o.isCorrect,
                    order: i,
                  })),
                },
              }
            : {}),
        },
        include: { options: true },
      });

      const payload: QuestionUpdatedPayload = {
        actorId: event.actorId,
        questionId,
        videoId: event.videoId,
        before: event.before,
        after: {
          type: after.type,
          timestampSeconds: after.timestampSeconds,
          text: after.text,
          order: after.order,
          options: after.options.map((o) => ({
            text: o.text,
            isCorrect: o.isCorrect,
            order: o.order,
          })),
        },
      };
      await this.outboxService.recordEvent(tx, {
        aggregateType: "Question",
        aggregateId: questionId,
        eventType: DOMAIN_EVENTS.QUESTION_UPDATED,
        payload,
      });

      return after;
    });
  }

  delete(questionId: string) {
    return this.prisma.question.delete({ where: { id: questionId } });
  }
}
```

- [ ] **Step 2: Update `questions.service.ts` to accept the current user and build the before-snapshot**

Replace the `update` method:

```typescript
  async update(
    videoId: string,
    questionId: string,
    dto: UpdateQuestionDto,
    user: AuthenticatedUser,
  ) {
    const question = await this.getOwnedQuestion(videoId, questionId);

    const hasResponses =
      await this.questionsRepository.hasResponses(questionId);
    if (hasResponses) {
      throw new ConflictException(
        'QUESTION_LOCKED',
        'Question already has learner responses and cannot be modified',
      );
    }

    if (dto.type && !dto.options) {
      throw new AppException(
        'INVALID_QUESTION_OPTIONS',
        'Changing question type requires providing the new options',
        HttpStatus.BAD_REQUEST,
      );
    }

    const effectiveType: QuestionType = dto.type ?? question.type;
    if (dto.options) {
      validateQuestionShape(effectiveType, dto.options);
    }

    if (dto.timestampSeconds !== undefined) {
      const video = await this.videosRepository.findById(videoId);
      if (!video) {
        throw new NotFoundException('VIDEO_NOT_FOUND', 'Video not found');
      }
      validateTimestamp(dto.timestampSeconds, video.durationSeconds);
    }

    const before = {
      type: question.type,
      timestampSeconds: question.timestampSeconds,
      text: question.text,
      order: question.order,
      options: question.options.map((o) => ({
        text: o.text,
        isCorrect: o.isCorrect,
        order: o.order,
      })),
    };

    return this.questionsRepository.update(questionId, dto, {
      actorId: user.id,
      videoId,
      before,
    });
  }
```

Add the import for `AuthenticatedUser` at the top of the file:

```typescript
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator";
```

- [ ] **Step 3: Pass `@CurrentUser()` through in `questions.controller.ts`**

Replace the `update` method and add the import:

```typescript
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";
```

```typescript
  @Patch(':questionId')
  update(
    @Param('videoId') videoId: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questionsService.update(videoId, questionId, dto, user);
  }
```

- [ ] **Step 4: Import `EventsModule` in `questions.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { QuestionsController } from "./questions.controller";
import { QuestionsService } from "./questions.service";
import { QuestionsRepository } from "./questions.repository";
import { VideosModule } from "../videos/videos.module";
import { EventsModule } from "../events/events.module";

@Module({
  imports: [VideosModule, EventsModule],
  controllers: [QuestionsController],
  providers: [QuestionsService, QuestionsRepository],
})
export class QuestionsModule {}
```

- [ ] **Step 5: Verify**

Run:

```bash
cd backend
npm run build
npm test
```

Expected: build succeeds, all tests pass (`question-validation.spec.ts` covers `validateQuestionShape`/`validateTimestamp`, both untouched).

- [ ] **Step 6: Commit**

```bash
git add backend/src/questions
git commit -m "feat(events): emit QuestionUpdated with before/after diff"
```

---

## Task 6: Wire video publish/unpublish to emit `VideoPublished` / `VideoUnpublished`

**Files:**

- Modify: `backend/src/videos/videos.repository.ts`
- Modify: `backend/src/videos/videos.service.ts`
- Modify: `backend/src/videos/videos.controller.ts`
- Modify: `backend/src/videos/videos.module.ts`

**Interfaces:**

- Consumes: `OutboxService.recordEvent`, `DOMAIN_EVENTS.VIDEO_PUBLISHED`/`VIDEO_UNPUBLISHED`, `VideoPublishedPayload`/`VideoUnpublishedPayload` (Task 2).
- Produces: these events, consumed by `AuditService` (Task 7).

- [ ] **Step 1: Replace `setStatus` in `videos.repository.ts`**

Replace the whole file with:

```typescript
import { Injectable } from "@nestjs/common";
import { Prisma, VideoStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../events/outbox.service";
import {
  DOMAIN_EVENTS,
  VideoPublishedPayload,
  VideoUnpublishedPayload,
} from "../events/domain-events";
import { CreateVideoDto } from "./dto/create-video.dto";
import { UpdateVideoDto } from "./dto/update-video.dto";

@Injectable()
export class VideosRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  create(dto: CreateVideoDto, createdById: string) {
    return this.prisma.video.create({
      data: { ...dto, createdById, status: VideoStatus.DRAFT },
    });
  }

  async findMany(params: {
    status?: VideoStatus;
    search?: string;
    page: number;
    limit: number;
  }) {
    const where: Prisma.VideoWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? { title: { contains: params.search, mode: "insensitive" } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { questions: true, assignments: true } } },
      }),
      this.prisma.video.count({ where }),
    ]);

    return { items, total };
  }

  findById(id: string) {
    return this.prisma.video.findUnique({
      where: { id },
      include: {
        questions: { include: { options: true }, orderBy: { order: "asc" } },
      },
    });
  }

  update(id: string, dto: UpdateVideoDto) {
    return this.prisma.video.update({ where: { id }, data: dto });
  }

  setStatus(
    id: string,
    status: VideoStatus,
    event: { actorId: string },
    publishedAt?: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const video = await tx.video.update({
        where: { id },
        data: { status, ...(publishedAt ? { publishedAt } : {}) },
      });

      if (status === VideoStatus.PUBLISHED) {
        const payload: VideoPublishedPayload = {
          actorId: event.actorId,
          videoId: id,
        };
        await this.outboxService.recordEvent(tx, {
          aggregateType: "Video",
          aggregateId: id,
          eventType: DOMAIN_EVENTS.VIDEO_PUBLISHED,
          payload,
        });
      } else {
        const payload: VideoUnpublishedPayload = {
          actorId: event.actorId,
          videoId: id,
        };
        await this.outboxService.recordEvent(tx, {
          aggregateType: "Video",
          aggregateId: id,
          eventType: DOMAIN_EVENTS.VIDEO_UNPUBLISHED,
          payload,
        });
      }

      return video;
    });
  }

  delete(id: string) {
    return this.prisma.video.delete({ where: { id } });
  }

  countAssignments(id: string) {
    return this.prisma.assignment.count({ where: { videoId: id } });
  }
}
```

- [ ] **Step 2: Update `publish`/`unpublish` in `videos.service.ts`**

Add the import:

```typescript
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator";
```

Replace `publish` and `unpublish`:

```typescript
  async publish(id: string, user: AuthenticatedUser) {
    const video = await this.getById(id);
    if (video.status === VideoStatus.PUBLISHED) {
      throw new AppException(
        'VIDEO_ALREADY_PUBLISHED',
        'Video is already published',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.videosRepository.setStatus(
      id,
      VideoStatus.PUBLISHED,
      { actorId: user.id },
      video.publishedAt ?? new Date(),
    );
  }

  async unpublish(id: string, user: AuthenticatedUser) {
    const video = await this.getById(id);
    if (video.status === VideoStatus.DRAFT) {
      throw new AppException(
        'VIDEO_ALREADY_DRAFT',
        'Video is already a draft',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.videosRepository.setStatus(id, VideoStatus.DRAFT, {
      actorId: user.id,
    });
  }
```

- [ ] **Step 3: Pass `@CurrentUser()` through in `videos.controller.ts`**

Replace the `publish`/`unpublish` methods (the `CurrentUser`/`AuthenticatedUser` import already exists in this file for `create`):

```typescript
  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.videosService.publish(id, user);
  }

  @Post(':id/unpublish')
  unpublish(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.videosService.unpublish(id, user);
  }
```

- [ ] **Step 4: Import `EventsModule` in `videos.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { VideosController } from "./videos.controller";
import { VideosService } from "./videos.service";
import { VideosRepository } from "./videos.repository";
import { EventsModule } from "../events/events.module";

@Module({
  imports: [EventsModule],
  controllers: [VideosController],
  providers: [VideosService, VideosRepository],
  exports: [VideosRepository],
})
export class VideosModule {}
```

- [ ] **Step 5: Verify**

Run:

```bash
cd backend
npm run build
npm test
```

Expected: build succeeds, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/videos
git commit -m "feat(events): emit VideoPublished/VideoUnpublished"
```

---

## Task 7: Audit log module

**Files:**

- Create: `backend/src/audit/dto/list-audit-log-query.dto.ts`
- Create: `backend/src/audit/audit.repository.ts`
- Create: `backend/src/audit/audit.service.ts`
- Test: `backend/src/audit/audit.service.spec.ts`
- Create: `backend/src/audit/audit.controller.ts`
- Create: `backend/src/audit/audit.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**

- Consumes: `DOMAIN_EVENTS.QUESTION_UPDATED`/`VIDEO_PUBLISHED`/`VIDEO_UNPUBLISHED` and their payload types (Task 2), emitted by Tasks 5 and 6.
- Produces: `GET /audit-log` endpoint. Nothing else in this plan consumes `AuditService` directly.

- [ ] **Step 1: Write the DTO**

```typescript
// backend/src/audit/dto/list-audit-log-query.dto.ts
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID } from "class-validator";
import { PaginationDto } from "../../common/dto/pagination.dto";

export class ListAuditLogQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string;
}
```

- [ ] **Step 2: Write the repository**

```typescript
// backend/src/audit/audit.repository.ts
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface CreateAuditLogParams {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateAuditLogParams) {
    return this.prisma.auditLog.create({ data });
  }

  async findMany(params: {
    entityType?: string;
    entityId?: string;
    page: number;
    limit: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}
```

- [ ] **Step 3: Write the failing test for `AuditService`'s listeners**

```typescript
// backend/src/audit/audit.service.spec.ts
import { AuditService } from "./audit.service";
import { AuditRepository } from "./audit.repository";

describe("AuditService", () => {
  function setup() {
    const auditRepository = {
      create: jest.fn().mockResolvedValue({ id: "audit-1" }),
      findMany: jest.fn(),
    } as unknown as AuditRepository;
    return { service: new AuditService(auditRepository), auditRepository };
  }

  it("records a QUESTION_UPDATED audit entry with the before/after diff", async () => {
    const { service, auditRepository } = setup();
    await service.onQuestionUpdated({
      actorId: "admin-1",
      questionId: "q-1",
      videoId: "v-1",
      before: { text: "old text" },
      after: { text: "new text" },
    });

    expect(auditRepository.create).toHaveBeenCalledWith({
      actorId: "admin-1",
      action: "QUESTION_UPDATED",
      entityType: "Question",
      entityId: "q-1",
      before: { text: "old text" },
      after: { text: "new text" },
    });
  });

  it("records a VIDEO_PUBLISHED audit entry with no before/after diff", async () => {
    const { service, auditRepository } = setup();
    await service.onVideoPublished({ actorId: "admin-1", videoId: "v-1" });

    expect(auditRepository.create).toHaveBeenCalledWith({
      actorId: "admin-1",
      action: "VIDEO_PUBLISHED",
      entityType: "Video",
      entityId: "v-1",
    });
  });

  it("records a VIDEO_UNPUBLISHED audit entry", async () => {
    const { service, auditRepository } = setup();
    await service.onVideoUnpublished({ actorId: "admin-1", videoId: "v-1" });

    expect(auditRepository.create).toHaveBeenCalledWith({
      actorId: "admin-1",
      action: "VIDEO_UNPUBLISHED",
      entityType: "Video",
      entityId: "v-1",
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && npx jest audit/audit.service.spec.ts`
Expected: FAIL — `Cannot find module './audit.service'`.

- [ ] **Step 5: Write `audit.service.ts`**

```typescript
import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AuditRepository } from "./audit.repository";
import { ListAuditLogQueryDto } from "./dto/list-audit-log-query.dto";
import {
  DOMAIN_EVENTS,
  QuestionUpdatedPayload,
  VideoPublishedPayload,
  VideoUnpublishedPayload,
} from "../events/domain-events";

@Injectable()
export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

  @OnEvent(DOMAIN_EVENTS.QUESTION_UPDATED)
  async onQuestionUpdated(payload: QuestionUpdatedPayload) {
    await this.auditRepository.create({
      actorId: payload.actorId,
      action: "QUESTION_UPDATED",
      entityType: "Question",
      entityId: payload.questionId,
      before: payload.before,
      after: payload.after,
    });
  }

  @OnEvent(DOMAIN_EVENTS.VIDEO_PUBLISHED)
  async onVideoPublished(payload: VideoPublishedPayload) {
    await this.auditRepository.create({
      actorId: payload.actorId,
      action: "VIDEO_PUBLISHED",
      entityType: "Video",
      entityId: payload.videoId,
    });
  }

  @OnEvent(DOMAIN_EVENTS.VIDEO_UNPUBLISHED)
  async onVideoUnpublished(payload: VideoUnpublishedPayload) {
    await this.auditRepository.create({
      actorId: payload.actorId,
      action: "VIDEO_UNPUBLISHED",
      entityType: "Video",
      entityId: payload.videoId,
    });
  }

  async list(query: ListAuditLogQueryDto) {
    const { items, total } = await this.auditRepository.findMany({
      entityType: query.entityType,
      entityId: query.entityId,
      page: query.page,
      limit: query.limit,
    });
    return { items, meta: { page: query.page, limit: query.limit, total } };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx jest audit/audit.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Write the controller**

```typescript
// backend/src/audit/audit.controller.ts
import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { AuditService } from "./audit.service";
import { ListAuditLogQueryDto } from "./dto/list-audit-log-query.dto";
import { Roles } from "../common/decorators/roles.decorator";

@ApiTags("audit-log")
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller("audit-log")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query() query: ListAuditLogQueryDto) {
    return this.auditService.list(query);
  }
}
```

- [ ] **Step 8: Write the module**

```typescript
// backend/src/audit/audit.module.ts
import { Module } from "@nestjs/common";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";
import { AuditRepository } from "./audit.repository";

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditRepository],
})
export class AuditModule {}
```

- [ ] **Step 9: Register `AuditModule` in `app.module.ts`**

Add the import and add `AuditModule` to the `imports` array (after `EventsModule`):

```typescript
import { AuditModule } from "./audit/audit.module";
```

- [ ] **Step 10: Verify**

Run:

```bash
cd backend
npm run build
npm test
```

Expected: build succeeds, all tests pass (3 new audit tests included).

- [ ] **Step 11: Commit**

```bash
git add backend/src/audit backend/src/app.module.ts
git commit -m "feat(audit): add audit log module (listeners + GET /audit-log)"
```

---

## Task 8: WebSocket auth helper (unit tested)

**Files:**

- Create: `backend/src/realtime/ws-auth.ts`
- Test: `backend/src/realtime/ws-auth.spec.ts`

**Interfaces:**

- Consumes: `JwtService` (from `@nestjs/jwt`, already a dependency), `AuthenticatedUser` type (`backend/src/common/decorators/current-user.decorator.ts`).
- Produces: `verifyAdminSocketToken(token, jwtService, findUserById): Promise<AuthenticatedUser>` — used by `AdminGateway` (Task 9) inside `handleConnection`. Extracted as a pure-ish function specifically so the auth branching logic is unit-testable without spinning up a real socket.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/realtime/ws-auth.spec.ts
import { verifyAdminSocketToken } from "./ws-auth";
import { JwtService } from "@nestjs/jwt";

describe("verifyAdminSocketToken", () => {
  function jwtServiceStub(resolved: unknown, error?: Error) {
    return {
      verifyAsync: jest.fn().mockImplementation(() => {
        if (error) return Promise.reject(error);
        return Promise.resolve(resolved);
      }),
    } as unknown as JwtService;
  }

  it("resolves the admin user for a valid token", async () => {
    const jwtService = jwtServiceStub({
      sub: "admin-1",
      email: "a@x.com",
      role: "ADMIN",
    });
    const findUserById = jest.fn().mockResolvedValue({
      id: "admin-1",
      name: "Admin",
      email: "a@x.com",
      role: "ADMIN",
    });

    const user = await verifyAdminSocketToken(
      "valid-token",
      jwtService,
      findUserById,
    );

    expect(user.id).toBe("admin-1");
    expect(findUserById).toHaveBeenCalledWith("admin-1");
  });

  it("rejects when no token is provided", async () => {
    const jwtService = jwtServiceStub(undefined);
    await expect(
      verifyAdminSocketToken(undefined, jwtService, jest.fn()),
    ).rejects.toThrow("Missing token");
  });

  it("rejects when the user no longer exists", async () => {
    const jwtService = jwtServiceStub({
      sub: "ghost",
      email: "g@x.com",
      role: "ADMIN",
    });
    const findUserById = jest.fn().mockResolvedValue(null);

    await expect(
      verifyAdminSocketToken("token", jwtService, findUserById),
    ).rejects.toThrow("User no longer exists");
  });

  it("rejects a non-admin user", async () => {
    const jwtService = jwtServiceStub({
      sub: "learner-1",
      email: "l@x.com",
      role: "LEARNER",
    });
    const findUserById = jest.fn().mockResolvedValue({
      id: "learner-1",
      name: "Learner",
      email: "l@x.com",
      role: "LEARNER",
    });

    await expect(
      verifyAdminSocketToken("token", jwtService, findUserById),
    ).rejects.toThrow("Admin role required");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest realtime/ws-auth.spec.ts`
Expected: FAIL — `Cannot find module './ws-auth'`.

- [ ] **Step 3: Write `ws-auth.ts`**

```typescript
import type { JwtService } from "@nestjs/jwt";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator";

interface SocketJwtPayload {
  sub: string;
  email: string;
  role: string;
}

export async function verifyAdminSocketToken(
  token: string | undefined,
  jwtService: JwtService,
  findUserById: (id: string) => Promise<AuthenticatedUser | null>,
): Promise<AuthenticatedUser> {
  if (!token) {
    throw new Error("Missing token");
  }

  const payload = await jwtService.verifyAsync<SocketJwtPayload>(token);
  const user = await findUserById(payload.sub);
  if (!user) {
    throw new Error("User no longer exists");
  }
  if (user.role !== "ADMIN") {
    throw new Error("Admin role required");
  }
  return user;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest realtime/ws-auth.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/realtime/ws-auth.ts backend/src/realtime/ws-auth.spec.ts
git commit -m "feat(realtime): add unit-tested WS admin token verification"
```

---

## Task 9: Real-time admin dashboard gateway

**Files:**

- Create: `backend/src/realtime/admin.gateway.ts`
- Create: `backend/src/realtime/realtime.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/package.json`

**Interfaces:**

- Consumes: `verifyAdminSocketToken` (Task 8), `UsersRepository.findById` (existing, exported from `UsersModule`), `DOMAIN_EVENTS.VIDEO_COMPLETED`/`QUESTION_ANSWERED` (Task 2), emitted by Task 4.
- Produces: Socket.IO event `progress-update` on namespace `/admin`, room `admin` — consumed by the frontend (Task 13).

No new spec file for the gateway itself (Socket.IO connection handling isn't meaningfully unit-testable without a real transport) — its auth branch is already covered by Task 8's `ws-auth.spec.ts`. Verified live in the browser in Task 16.

- [ ] **Step 1: Install dependencies**

Run:

```bash
cd backend
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
```

- [ ] **Step 2: Write `admin.gateway.ts`**

```typescript
import { Injectable } from "@nestjs/common";
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { OnEvent } from "@nestjs/event-emitter";
import { JwtService } from "@nestjs/jwt";
import type { Server, Socket } from "socket.io";
import { UsersRepository } from "../users/users.repository";
import { verifyAdminSocketToken } from "./ws-auth";
import {
  DOMAIN_EVENTS,
  QuestionAnsweredPayload,
  VideoCompletedPayload,
} from "../events/domain-events";

const ADMIN_ROOM = "admin";

@Injectable()
@WebSocketGateway({
  namespace: "/admin",
  cors: { origin: process.env.CORS_ORIGIN ?? "http://localhost:3000" },
})
export class AdminGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      await verifyAdminSocketToken(token, this.jwtService, (id) =>
        this.usersRepository.findById(id),
      );
      await client.join(ADMIN_ROOM);
    } catch {
      client.disconnect(true);
    }
  }

  @OnEvent(DOMAIN_EVENTS.VIDEO_COMPLETED)
  onVideoCompleted(payload: VideoCompletedPayload) {
    this.broadcast(DOMAIN_EVENTS.VIDEO_COMPLETED, payload);
  }

  @OnEvent(DOMAIN_EVENTS.QUESTION_ANSWERED)
  onQuestionAnswered(payload: QuestionAnsweredPayload) {
    this.broadcast(DOMAIN_EVENTS.QUESTION_ANSWERED, payload);
  }

  private broadcast(
    type: string,
    payload: VideoCompletedPayload | QuestionAnsweredPayload,
  ) {
    this.server?.to(ADMIN_ROOM).emit("progress-update", {
      type,
      ...payload,
      occurredAt: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 3: Write `realtime.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { AdminGateway } from "./admin.gateway";
import { UsersModule } from "../users/users.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [UsersModule, AuthModule],
  providers: [AdminGateway],
})
export class RealtimeModule {}
```

`AuthModule` already exports `JwtModule` (see `backend/src/auth/auth.module.ts`), which re-exports `JwtService` — no extra config needed to inject it here.

- [ ] **Step 4: Register `RealtimeModule` in `app.module.ts`**

Add the import and add `RealtimeModule` to the `imports` array (after `AuditModule`):

```typescript
import { RealtimeModule } from "./realtime/realtime.module";
```

- [ ] **Step 5: Verify**

Run:

```bash
cd backend
npm run build
npm test
```

Expected: build succeeds (confirms the gateway, module wiring, and Socket.IO types all compile), all tests pass — no new spec added in this task, so the count is unchanged from Task 8.

- [ ] **Step 6: Commit**

```bash
git add backend/src/realtime/admin.gateway.ts backend/src/realtime/realtime.module.ts backend/src/app.module.ts backend/package.json backend/package-lock.json
git commit -m "feat(realtime): add admin WebSocket gateway for live progress updates"
```

---

## Task 10: Idempotency service (hash + begin/complete logic)

**Files:**

- Create: `backend/src/idempotency/idempotency.repository.ts`
- Create: `backend/src/idempotency/idempotency.service.ts`
- Test: `backend/src/idempotency/idempotency.service.spec.ts`

**Interfaces:**

- Consumes: `PrismaService`.
- Produces: `IdempotencyService.begin(userId, key, endpoint, body): Promise<{recordId: string} | {replay: {statusCode, body}}>`, `IdempotencyService.complete(recordId, statusCode, body)`, `IdempotencyService.hashBody(body): string` (static) — all consumed by `IdempotencyInterceptor` (Task 11).

- [ ] **Step 1: Write the repository**

```typescript
// backend/src/idempotency/idempotency.repository.ts
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserAndKey(userId: string, key: string) {
    return this.prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });
  }

  async tryInsertProcessing(
    userId: string,
    key: string,
    endpoint: string,
    requestHash: string,
  ) {
    try {
      return await this.prisma.idempotencyKey.create({
        data: { userId, key, endpoint, requestHash, status: "PROCESSING" },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return null;
      }
      throw error;
    }
  }

  markCompleted(id: string, statusCode: number, responseBody: unknown) {
    return this.prisma.idempotencyKey.update({
      where: { id },
      data: {
        status: "COMPLETED",
        statusCode,
        responseBody: responseBody as Prisma.InputJsonValue,
      },
    });
  }
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// backend/src/idempotency/idempotency.service.spec.ts
import { ConflictException } from "@nestjs/common";
import { IdempotencyService } from "./idempotency.service";
import { IdempotencyRepository } from "./idempotency.repository";

describe("IdempotencyService", () => {
  function setup() {
    const idempotencyRepository = {
      tryInsertProcessing: jest.fn(),
      findByUserAndKey: jest.fn(),
      markCompleted: jest.fn(),
    } as unknown as IdempotencyRepository;
    return {
      service: new IdempotencyService(idempotencyRepository),
      idempotencyRepository,
    };
  }

  it("hashes objects with different key order to the same value", () => {
    const a = IdempotencyService.hashBody({ videoId: "1", learnerId: "2" });
    const b = IdempotencyService.hashBody({ learnerId: "2", videoId: "1" });
    expect(a).toBe(b);
  });

  it("hashes different bodies to different values", () => {
    const a = IdempotencyService.hashBody({ learnerId: "2" });
    const b = IdempotencyService.hashBody({ learnerId: "3" });
    expect(a).not.toBe(b);
  });

  it("returns a fresh recordId on the first call for a new key", async () => {
    const { service, idempotencyRepository } = setup();
    (idempotencyRepository.tryInsertProcessing as jest.Mock).mockResolvedValue({
      id: "ik-1",
    });

    const result = await service.begin("user-1", "key-1", "POST /assignments", {
      a: 1,
    });

    expect(result).toEqual({ recordId: "ik-1" });
  });

  it("replays the stored response when the same key+body is reused", async () => {
    const { service, idempotencyRepository } = setup();
    const body = { a: 1 };
    const hash = IdempotencyService.hashBody(body);
    (idempotencyRepository.tryInsertProcessing as jest.Mock).mockResolvedValue(
      null,
    );
    (idempotencyRepository.findByUserAndKey as jest.Mock).mockResolvedValue({
      status: "COMPLETED",
      requestHash: hash,
      statusCode: 201,
      responseBody: { id: "created-1" },
    });

    const result = await service.begin(
      "user-1",
      "key-1",
      "POST /assignments",
      body,
    );

    expect(result).toEqual({
      replay: { statusCode: 201, body: { id: "created-1" } },
    });
  });

  it("throws IDEMPOTENCY_KEY_CONFLICT when the same key is reused with a different body", async () => {
    const { service, idempotencyRepository } = setup();
    (idempotencyRepository.tryInsertProcessing as jest.Mock).mockResolvedValue(
      null,
    );
    (idempotencyRepository.findByUserAndKey as jest.Mock).mockResolvedValue({
      status: "COMPLETED",
      requestHash: "some-other-hash",
      statusCode: 201,
      responseBody: {},
    });

    await expect(
      service.begin("user-1", "key-1", "POST /assignments", { a: 1 }),
    ).rejects.toThrow(ConflictException);
  });

  it("throws IDEMPOTENCY_KEY_IN_PROGRESS when a concurrent request is still processing", async () => {
    const { service, idempotencyRepository } = setup();
    (idempotencyRepository.tryInsertProcessing as jest.Mock).mockResolvedValue(
      null,
    );
    (idempotencyRepository.findByUserAndKey as jest.Mock).mockResolvedValue({
      status: "PROCESSING",
      requestHash: "anything",
    });

    await expect(
      service.begin("user-1", "key-1", "POST /assignments", { a: 1 }),
    ).rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx jest idempotency/idempotency.service.spec.ts`
Expected: FAIL — `Cannot find module './idempotency.service'`.

- [ ] **Step 4: Write `idempotency.service.ts`**

```typescript
import { ConflictException, Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { IdempotencyRepository } from "./idempotency.repository";

export interface IdempotentReplay {
  statusCode: number;
  body: unknown;
}

export type BeginOutcome = { recordId: string } | { replay: IdempotentReplay };

@Injectable()
export class IdempotencyService {
  constructor(private readonly idempotencyRepository: IdempotencyRepository) {}

  static hashBody(body: unknown): string {
    return createHash("sha256")
      .update(IdempotencyService.stableStringify(body))
      .digest("hex");
  }

  private static stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((v) => IdempotencyService.stableStringify(v)).join(",")}]`;
    }
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys
        .map(
          (k) =>
            `${JSON.stringify(k)}:${IdempotencyService.stableStringify(record[k])}`,
        )
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  async begin(
    userId: string,
    key: string,
    endpoint: string,
    body: unknown,
  ): Promise<BeginOutcome> {
    const requestHash = IdempotencyService.hashBody(body);
    const created = await this.idempotencyRepository.tryInsertProcessing(
      userId,
      key,
      endpoint,
      requestHash,
    );
    if (created) {
      return { recordId: created.id };
    }

    const existing = await this.idempotencyRepository.findByUserAndKey(
      userId,
      key,
    );
    if (!existing || existing.status === "PROCESSING") {
      throw new ConflictException({
        code: "IDEMPOTENCY_KEY_IN_PROGRESS",
        message: "This request is already being processed. Retry shortly.",
      });
    }
    if (existing.requestHash !== requestHash) {
      throw new ConflictException({
        code: "IDEMPOTENCY_KEY_CONFLICT",
        message:
          "This idempotency key was already used with a different request body.",
      });
    }
    return {
      replay: {
        statusCode: existing.statusCode ?? 200,
        body: existing.responseBody,
      },
    };
  }

  complete(recordId: string, statusCode: number, body: unknown) {
    return this.idempotencyRepository.markCompleted(recordId, statusCode, body);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest idempotency/idempotency.service.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/idempotency/idempotency.repository.ts backend/src/idempotency/idempotency.service.ts backend/src/idempotency/idempotency.service.spec.ts
git commit -m "feat(idempotency): add hash + begin/complete idempotency logic"
```

---

## Task 11: Idempotency interceptor + module

**Files:**

- Create: `backend/src/idempotency/idempotency.interceptor.ts`
- Create: `backend/src/idempotency/idempotency.module.ts`

**Interfaces:**

- Consumes: `IdempotencyService.begin/complete` (Task 10).
- Produces: `IdempotencyInterceptor`, applied via `@UseInterceptors(IdempotencyInterceptor)` on specific routes in Task 12.

- [ ] **Step 1: Write `idempotency.interceptor.ts`**

```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, from, of } from "rxjs";
import { switchMap, tap } from "rxjs/operators";
import type { Request } from "express";
import { IdempotencyService } from "./idempotency.service";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator";

const IDEMPOTENCY_HEADER = "idempotency-key";

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const key = request.header(IDEMPOTENCY_HEADER);

    if (!key || !request.user) {
      return next.handle();
    }

    const endpoint = `${request.method} ${request.route?.path ?? request.path}`;
    const userId = request.user.id;

    return from(
      this.idempotencyService.begin(userId, key, endpoint, request.body),
    ).pipe(
      switchMap((outcome) => {
        if ("replay" in outcome) {
          return of(outcome.replay.body);
        }
        return next.handle().pipe(
          tap((body) => {
            void this.idempotencyService.complete(outcome.recordId, 200, body);
          }),
        );
      }),
    );
  }
}
```

- [ ] **Step 2: Write `idempotency.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { IdempotencyRepository } from "./idempotency.repository";
import { IdempotencyService } from "./idempotency.service";
import { IdempotencyInterceptor } from "./idempotency.interceptor";

@Module({
  providers: [
    IdempotencyRepository,
    IdempotencyService,
    IdempotencyInterceptor,
  ],
  exports: [IdempotencyInterceptor],
})
export class IdempotencyModule {}
```

- [ ] **Step 3: Verify**

Run:

```bash
cd backend
npm run build
```

Expected: build succeeds (this task adds no new spec; the interceptor's branching logic is exercised indirectly through `IdempotencyService`'s existing tests plus the live check in Task 16).

- [ ] **Step 4: Commit**

```bash
git add backend/src/idempotency/idempotency.interceptor.ts backend/src/idempotency/idempotency.module.ts
git commit -m "feat(idempotency): add opt-in idempotency interceptor"
```

---

## Task 12: Apply idempotency to the three mutating endpoints

**Files:**

- Modify: `backend/src/assignments/assignments.controller.ts`
- Modify: `backend/src/assignments/assignments.module.ts`
- Modify: `backend/src/learning/learning.controller.ts`
- Modify: `backend/src/learning/learning.module.ts`

**Interfaces:**

- Consumes: `IdempotencyInterceptor` (Task 11).

- [ ] **Step 1: Apply the interceptor in `assignments.controller.ts`**

Merge `UseInterceptors` into the existing `@nestjs/common` import and add the interceptor import:

```typescript
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import { IdempotencyInterceptor } from "../idempotency/idempotency.interceptor";
```

Add the decorator to `create`:

```typescript
  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignmentsService.create(dto, user.id);
  }
```

- [ ] **Step 2: Import `IdempotencyModule` in `assignments.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { AssignmentsController } from "./assignments.controller";
import { AssignmentsService } from "./assignments.service";
import { AssignmentsRepository } from "./assignments.repository";
import { VideosModule } from "../videos/videos.module";
import { UsersModule } from "../users/users.module";
import { IdempotencyModule } from "../idempotency/idempotency.module";

@Module({
  imports: [VideosModule, UsersModule, IdempotencyModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AssignmentsRepository],
  exports: [AssignmentsRepository],
})
export class AssignmentsModule {}
```

- [ ] **Step 3: Apply the interceptor in `learning.controller.ts`**

Merge `UseInterceptors` into the existing `@nestjs/common` import and add the interceptor import:

```typescript
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import { IdempotencyInterceptor } from "../idempotency/idempotency.interceptor";
```

Add the decorator to `updateProgress` and `submitResponse`:

```typescript
  @Put(':id/progress')
  @UseInterceptors(IdempotencyInterceptor)
  updateProgress(
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.learningService.updateProgress(id, dto, user);
  }

  @Post(':id/responses')
  @UseInterceptors(IdempotencyInterceptor)
  submitResponse(
    @Param('id') id: string,
    @Body() dto: SubmitResponseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.learningService.submitResponse(id, dto, user);
  }
```

- [ ] **Step 4: Import `IdempotencyModule` in `learning.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { LearningController } from "./learning.controller";
import { LearningService } from "./learning.service";
import { LearningRepository } from "./learning.repository";
import { EventsModule } from "../events/events.module";
import { IdempotencyModule } from "../idempotency/idempotency.module";

@Module({
  imports: [EventsModule, IdempotencyModule],
  controllers: [LearningController],
  providers: [LearningService, LearningRepository],
})
export class LearningModule {}
```

- [ ] **Step 5: Verify**

Run:

```bash
cd backend
npm run build
npm test
```

Expected: build succeeds, all tests pass (11 new tests across Tasks 2, 3, 7, 8, 10 plus the original 20 = 31 total).

- [ ] **Step 6: Commit**

```bash
git add backend/src/assignments backend/src/learning
git commit -m "feat(idempotency): apply IdempotencyInterceptor to assignment/progress/response endpoints"
```

---

## Task 13: Frontend — `useAdminSocket` hook

**Files:**

- Create: `frontend/src/features/reports/use-admin-socket.ts`
- Modify: `frontend/package.json`

**Interfaces:**

- Consumes: `useAuthStore` (`accessToken`, `user.role`), `NEXT_PUBLIC_API_URL` env var, TanStack Query's `useQueryClient`.
- Produces: `useAdminSocket(): { isLive: boolean }` — consumed by the reports page (Task 14).

No test — frontend has no test runner configured (see Global Constraints). Verified live in Task 16.

- [ ] **Step 1: Install the dependency**

Run:

```bash
cd frontend
npm install socket.io-client
```

- [ ] **Step 2: Write `use-admin-socket.ts`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";

interface ProgressUpdateEvent {
  type: "VideoCompleted" | "QuestionAnswered";
  assignmentId: string;
  learnerId: string;
  videoId: string;
  questionId?: string;
  occurredAt: string;
}

interface ReportRow {
  assignmentId: string;
  status: string;
  completionPercentage: number;
  [key: string]: unknown;
}

interface ReportData {
  items: ReportRow[];
  meta: unknown;
}

function isReportData(value: unknown): value is ReportData {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as ReportData).items)
  );
}

function patchToCompleted(data: unknown, assignmentId: string): unknown {
  if (!isReportData(data)) {
    return data;
  }
  return {
    ...data,
    items: data.items.map((row) =>
      row.assignmentId === assignmentId
        ? { ...row, status: "COMPLETED", completionPercentage: 100 }
        : row,
    ),
  };
}

function socketOrigin(): string {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  return apiUrl.replace(/\/api\/v1\/?$/, "");
}

export function useAdminSocket() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (!accessToken || role !== "ADMIN") {
      return;
    }

    const socket = io(`${socketOrigin()}/admin`, {
      auth: { token: accessToken },
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      setIsLive(true);
      void queryClient.invalidateQueries({ queryKey: ["reports", "progress"] });
    });
    socket.on("disconnect", () => setIsLive(false));
    socket.on("progress-update", (event: ProgressUpdateEvent) => {
      if (event.type === "VideoCompleted") {
        queryClient.setQueriesData(
          { queryKey: ["reports", "progress"] },
          (data: unknown) => patchToCompleted(data, event.assignmentId),
        );
      } else {
        void queryClient.invalidateQueries({
          queryKey: ["reports", "progress"],
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken, role, queryClient]);

  return { isLive };
}
```

- [ ] **Step 3: Verify**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/reports/use-admin-socket.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(realtime): add useAdminSocket hook for live progress updates"
```

---

## Task 14: Wire the socket into the admin reports page

**Files:**

- Modify: `frontend/src/app/admin/reports/page.tsx`

**Interfaces:**

- Consumes: `useAdminSocket` (Task 13).

- [ ] **Step 1: Add the hook and a live indicator**

In `frontend/src/app/admin/reports/page.tsx`, add the import:

```typescript
import { useAdminSocket } from "@/features/reports/use-admin-socket";
```

At the top of the component body, call the hook:

```typescript
const { isLive } = useAdminSocket();
```

Replace the page heading block:

```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
    <p className="text-sm text-slate-500">
      Learner progress and quiz responses across all assignments.
    </p>
  </div>
  {isLive && (
    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
      Live
    </span>
  )}
</div>
```

- [ ] **Step 2: Verify**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/admin/reports/page.tsx
git commit -m "feat(realtime): show live indicator + wire socket into reports page"
```

---

## Task 15: Frontend — audit log feature + page + nav

**Files:**

- Create: `frontend/src/features/audit/api.ts`
- Create: `frontend/src/features/audit/hooks.ts`
- Create: `frontend/src/app/admin/audit/page.tsx`
- Modify: `frontend/src/app/admin/layout.tsx`

**Interfaces:**

- Consumes: `apiClient` (`frontend/src/lib/api-client.ts`), `ApiListMeta` (`frontend/src/lib/types.ts`), `GET /audit-log` (Task 7).

- [ ] **Step 1: Write `features/audit/api.ts`**

```typescript
import { apiClient } from "@/lib/api-client";
import type { ApiListMeta } from "@/lib/types";

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actor: { id: string; name: string; email: string };
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogParams {
  page?: number;
  limit?: number;
  entityType?: string;
  entityId?: string;
}

export async function fetchAuditLog(params: AuditLogParams) {
  const res = await apiClient.get("/audit-log", { params });
  return {
    items: res.data.data as AuditLogEntry[],
    meta: res.data.meta as ApiListMeta,
  };
}
```

- [ ] **Step 2: Write `features/audit/hooks.ts`**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";

export function useAuditLog(params: api.AuditLogParams) {
  return useQuery({
    queryKey: ["audit-log", params],
    queryFn: () => api.fetchAuditLog(params),
  });
}
```

- [ ] **Step 3: Write `app/admin/audit/page.tsx`**

```tsx
"use client";

import { ScrollText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { useAuditLog } from "@/features/audit/hooks";

export default function AdminAuditPage() {
  const auditLog = useAuditLog({ page: 1, limit: 50 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500">
          Who changed what — question edits and publish/unpublish actions.
        </p>
      </div>

      {auditLog.isLoading && <LoadingState label="Loading audit log…" />}
      {auditLog.isError && (
        <ErrorState error={auditLog.error} onRetry={() => auditLog.refetch()} />
      )}
      {!auditLog.isLoading &&
        !auditLog.isError &&
        auditLog.data?.items.length === 0 && (
          <EmptyState
            icon={ScrollText}
            title="No activity yet"
            description="Question edits and publish/unpublish actions will show up here."
          />
        )}
      {!auditLog.isLoading &&
        !auditLog.isError &&
        !!auditLog.data?.items.length && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Entity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLog.data.items.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {entry.actor.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {entry.actor.email}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="neutral">
                          {entry.action.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {entry.entityType} · {entry.entityId.slice(0, 8)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
    </div>
  );
}
```

- [ ] **Step 4: Add the nav item in `app/admin/layout.tsx`**

Replace the imports and `navItems`:

```typescript
import {
  BarChart3,
  LayoutDashboard,
  ScrollText,
  UserPlus,
  Video,
} from "lucide-react";
```

```typescript
const navItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/videos", label: "Videos", icon: Video },
  { href: "/admin/assignments", label: "Assignments", icon: UserPlus },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
];
```

- [ ] **Step 5: Verify**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds, `/admin/audit` appears as a static route in the build output.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/audit frontend/src/app/admin/audit frontend/src/app/admin/layout.tsx
git commit -m "feat(audit): add admin audit log page and nav entry"
```

---

## Task 16: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full backend test suite**

Run:

```bash
cd backend
npm run build
npm test
```

Expected: build succeeds; all 31 tests pass (20 original + 3 outbox/outbox-poller + 3 audit + 4 ws-auth + 6 idempotency, minus any renumbering — exact count isn't the point, zero failures is).

- [ ] **Step 2: Full frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 3: Start the stack**

```bash
cd backend && npm run start:dev
```

(separate terminal)

```bash
cd frontend && npm run dev
```

- [ ] **Step 4: Live browser check — real-time dashboard**

1. Log in as `admin@example.com` / `Admin@123` in one browser tab, go to **Admin → Reports**. Confirm the green "Live" pulse indicator appears within ~1s (socket connected).
2. In a second tab (or incognito window), log in as `learner@example.com` / `Learner@123`, open the in-progress "JavaScript Fundamentals" assignment, answer the next unanswered question, and keep watching until the video completes.
3. Back in the admin tab, without refreshing, confirm: the row's **Status** badge flips to `COMPLETED` and **Progress** to `100%` automatically (patched via the `VideoCompleted` socket event), and the **Responses** count updates shortly after answering (via the `QuestionAnswered`-triggered refetch).

- [ ] **Step 5: Live browser check — audit log**

1. As admin, go to a **DRAFT** video (or unpublish `React Basics` if all are published) and click **Publish**, then **Unpublish**.
2. Go to **Admin → Audit Log**. Confirm two new rows appear: `VIDEO_PUBLISHED` and `VIDEO_UNPUBLISHED`, with your admin user as the actor and a recent timestamp.
3. Edit a question on a video that has **no learner responses yet** (e.g. add/change option text). Confirm a `QUESTION_UPDATED` row appears in the audit log.

- [ ] **Step 6: Manual check — idempotency replay and conflict**

Get a token first:

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@123"}' | tee /tmp/login.json
```

Copy the `data.accessToken` value into `TOKEN` below, and use a `learnerId` from `GET /users?role=LEARNER` and a `videoId` from `GET /videos` that isn't already assigned to that learner.

Same key, same body, sent twice — second call should return instantly with the same assignment `id` and create **no** second row:

```bash
TOKEN="<paste access token>"
BODY='{"videoId":"<video-id>","learnerId":"<learner-id>"}'

curl -s -X POST http://localhost:4000/api/v1/assignments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-key-1" -d "$BODY"

curl -s -X POST http://localhost:4000/api/v1/assignments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-key-1" -d "$BODY"
```

Expected: both responses have the identical `data.id`. Confirm in **Admin → Assignments** that only one assignment was created for that learner/video pair.

Same key, different body — should 409:

```bash
curl -s -X POST http://localhost:4000/api/v1/assignments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-key-1" \
  -d '{"videoId":"<a-different-video-id>","learnerId":"<learner-id>"}'
```

Expected: HTTP 409 with `error.code: "IDEMPOTENCY_KEY_CONFLICT"`.

- [ ] **Step 7: Confirm no regression on the existing golden path**

Re-run the golden path from `docs/api-inventory.md`'s Verification summary (login → resume-from-refresh → timestamp-crossing pause → short-answer submission → resume → single-choice submission → video completion → progress reaching 100% → admin report reflecting accuracy) once, end to end, to confirm none of the six new modules broke existing behavior.

- [ ] **Step 8: Update `docs/api-inventory.md`**

Add a new `## Audit Log` section:

```markdown
## Audit Log (admin)

| Endpoint         | Status | Notes                                                   |
| ---------------- | ------ | ------------------------------------------------------- |
| `GET /audit-log` | ✅     | filterable by entityType/entityId, fed by domain events |
```

And append to the "Verification summary" list:

```markdown
- Event-driven architecture: outbox → poller → EventEmitter2 → audit log + real-time
  admin dashboard verified live (two-tab browser test); idempotency replay/conflict
  verified via curl against `POST /assignments`.
```

- [ ] **Step 9: Commit**

```bash
git add docs/api-inventory.md
git commit -m "docs: record event-driven architecture verification in API inventory"
```
