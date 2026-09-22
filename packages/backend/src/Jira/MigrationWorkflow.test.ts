import { it } from "@effect/vitest"
import { describe, expect } from "vite-plus/test"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import { DurableDeferred, WorkflowEngine } from "effect/unstable/workflow"
import {
  makeFinalizeMigrationActivity,
  makeStartMigrationActivity
} from "./MigrationActivities"
import {
  JiraMigrationWorkflow,
  JiraMigrationWorkflowFailure,
  JiraMigrationWorkflowPayload,
  JiraMigrationWorkflowSuccess,
  RetrySignal,
  StartImportSignal,
  activityName,
  makeJiraMigrationWorkflow,
  retryDeferred,
  retryDeferredName,
  startImportDeferred,
  startImportDeferredName
} from "./MigrationWorkflow"

const createPayload = {
  command: {
    _tag: "Create" as const,
    organizationId: "organization-1",
    userId: "user-1",
    requestId: "request-1",
    source: {
      cloudId: "cloud-1",
      siteName: "Example Jira",
      siteUrl: "https://example.atlassian.net",
      projectId: "project-1",
      projectKey: "WEB",
      projectName: "Website"
    }
  }
}

const rescanPayload = {
  command: {
    _tag: "Rescan" as const,
    supersededExecutionId: "previous-execution",
    migrationId: "migration-1",
    expectedRevision: 4,
    workflowAttempt: 2,
    scanRevision: 5
  }
}

const waitUntilSuspended = (executionId: string) =>
  Effect.gen(function* () {
    while (true) {
      const result = yield* JiraMigrationWorkflow.poll(executionId)
      if (Option.isSome(result) && result.value._tag === "Suspended") return
      yield* Effect.yieldNow
    }
  })

const completeStartImport = (executionId: string, scanRevision: number) => {
  const deferred = startImportDeferred(scanRevision)
  return DurableDeferred.succeed(deferred, {
    token: DurableDeferred.tokenFromExecutionId(deferred, {
      workflow: JiraMigrationWorkflow,
      executionId
    }),
    value: { scanRevision }
  })
}

describe("Jira migration workflow contracts", () => {
  it("keeps persisted names and idempotency keys stable", () => {
    expect(JiraMigrationWorkflow._tag).toBe("ProjectProject/JiraMigration/v1")
    expect(JiraMigrationWorkflow.idempotencyKey(createPayload)).toBe(
      "create:organization-1:user-1:request-1"
    )
    expect(JiraMigrationWorkflow.idempotencyKey(rescanPayload)).toBe(
      "migration-1:2:4"
    )
    expect(activityName(["start"])).toBe("v1/start")
    expect(
      makeStartMigrationActivity(Effect.void, JiraMigrationWorkflowFailure).name
    ).toBe("v1/start")
    expect(makeFinalizeMigrationActivity(Effect.void).name).toBe("v1/finalize")
    expect(startImportDeferredName(5)).toBe("StartImport/v1/5")
    expect(startImportDeferred(5).name).toBe("StartImport/v1/5")
    expect(retryDeferredName(1)).toBe("Retry/v1/1")
    expect(retryDeferredName(2)).toBe("Retry/v1/2")
    expect(retryDeferred(2).name).toBe("Retry/v1/2")
  })

  it("round trips persisted payload, success, and failure values", () => {
    const createPayloadEncoded = Schema.encodeSync(
      JiraMigrationWorkflowPayload
    )(createPayload)
    const payloadEncoded = Schema.encodeSync(JiraMigrationWorkflowPayload)(
      rescanPayload
    )
    const success = { migrationId: "migration-1" }
    const successEncoded = Schema.encodeSync(JiraMigrationWorkflowSuccess)(
      success
    )
    const failure = {
      _tag: "JiraMigrationWorkflowFailure" as const,
      reason: "jira_unavailable",
      retryable: true
    }
    const failureEncoded = Schema.encodeSync(JiraMigrationWorkflowFailure)(
      failure
    )
    const startImportSignal = { scanRevision: 5 }
    const retrySignal = { failureSequence: 3 }

    expect(
      Schema.decodeSync(JiraMigrationWorkflowPayload)(createPayloadEncoded)
    ).toEqual(createPayload)
    expect(
      Schema.decodeSync(JiraMigrationWorkflowPayload)(payloadEncoded)
    ).toEqual(rescanPayload)
    expect(
      Schema.decodeSync(JiraMigrationWorkflowSuccess)(successEncoded)
    ).toEqual(success)
    expect(
      Schema.decodeSync(JiraMigrationWorkflowFailure)(failureEncoded)
    ).toEqual(failure)
    expect(
      Schema.decodeSync(StartImportSignal)(
        Schema.encodeSync(StartImportSignal)(startImportSignal)
      )
    ).toEqual(startImportSignal)
    expect(
      Schema.decodeSync(RetrySignal)(
        Schema.encodeSync(RetrySignal)(retrySignal)
      )
    ).toEqual(retrySignal)
  })

  it.effect("replays a completed activity without repeating its effect", () =>
    Effect.gen(function* () {
      const startCalls = yield* Ref.make(0)
      const finalizeCalls = yield* Ref.make(0)
      const layer = makeJiraMigrationWorkflow({
        start: () => Ref.update(startCalls, (count) => count + 1),
        finalize: () => Ref.update(finalizeCalls, (count) => count + 1)
      }).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

      yield* Effect.gen(function* () {
        const executionId = yield* JiraMigrationWorkflow.execute(
          rescanPayload,
          { discard: true }
        )
        yield* waitUntilSuspended(executionId)

        expect(yield* Ref.get(startCalls)).toBe(1)

        yield* JiraMigrationWorkflow.resume(executionId)
        yield* waitUntilSuspended(executionId)

        expect(yield* Ref.get(startCalls)).toBe(1)

        yield* completeStartImport(executionId, 5)
        const result = yield* JiraMigrationWorkflow.execute(rescanPayload)

        expect(result).toEqual({ migrationId: "migration-1" })
        expect(yield* Ref.get(startCalls)).toBe(1)
        expect(yield* Ref.get(finalizeCalls)).toBe(1)
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect("uses the initial scan revision and execution id for create", () =>
    Effect.gen(function* () {
      const layer = makeJiraMigrationWorkflow({
        start: () => Effect.void,
        finalize: () => Effect.void
      }).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

      yield* Effect.gen(function* () {
        const executionId = yield* JiraMigrationWorkflow.execute(
          createPayload,
          { discard: true }
        )
        yield* completeStartImport(executionId, 1)

        expect(yield* JiraMigrationWorkflow.execute(createPayload)).toEqual({
          migrationId: executionId
        })
      }).pipe(Effect.provide(layer))
    })
  )

  it.effect(
    "captures activity defects with the default workflow behavior",
    () =>
      Effect.gen(function* () {
        const layer = makeJiraMigrationWorkflow({
          start: () => Effect.die("start defect"),
          finalize: () => Effect.void
        }).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

        const exit = yield* JiraMigrationWorkflow.execute(createPayload).pipe(
          Effect.exit,
          Effect.provide(layer)
        )

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(Cause.hasDies(exit.cause)).toBe(true)
        }
      })
  )
})
