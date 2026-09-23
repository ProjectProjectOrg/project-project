import { describe, expect, it } from "vite-plus/test"
import { Effect, Layer, Ref } from "effect"
import { WorkflowEngine } from "effect/unstable/workflow"
import {
  JiraMigrationCleanupFailure,
  JiraMigrationCleanupWorkflow,
  makeJiraMigrationCleanupWorkflow
} from "./CleanupWorkflow"

const payload = (
  mode: "reset_import" | "discard" | "expire" | "post_success"
) => ({
  migrationId: "migration-1",
  mode,
  cleanupGeneration: 7
})

describe("Jira cleanup workflow", () => {
  it("keeps scan artifacts for reset and permanent archive for post-success cleanup", async () => {
    for (const mode of [
      "reset_import",
      "discard",
      "expire",
      "post_success"
    ] as const) {
      const trace = await Effect.runPromise(Ref.make<ReadonlyArray<string>>([]))
      const step = (name: string) =>
        Ref.update(trace, (current) => [...current, name])
      let claimedExecutionId = ""
      const layer = makeJiraMigrationCleanupWorkflow({
        claim: (_payload, executionId) =>
          Effect.sync(() => {
            claimedExecutionId = executionId
          }).pipe(Effect.andThen(step("claim")), Effect.as(true)),
        verifyPermanentArchive: () => step("verify-archive"),
        deleteHiddenProject: () => step("hidden-project"),
        deletePendingAttachments: () => step("pending-attachments"),
        deleteCopiedObjects: (_payload, executionId) =>
          Effect.sync(() => expect(executionId).toBe(claimedExecutionId)).pipe(
            Effect.andThen(step("copied-objects"))
          ),
        deleteHiddenDocuments: () => step("hidden-documents"),
        deletePrivateStaging: () => step("private-staging"),
        complete: () => step("complete"),
        release: () => step("release")
      }).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* JiraMigrationCleanupWorkflow.execute(payload(mode), {
            discard: true
          })
          yield* JiraMigrationCleanupWorkflow.execute(payload(mode))
        }).pipe(Effect.provide(layer))
      )
      expect(await Effect.runPromise(Ref.get(trace))).toEqual(
        mode === "post_success"
          ? ["claim", "verify-archive", "private-staging", "complete"]
          : mode === "reset_import"
            ? [
                "claim",
                "copied-objects",
                "pending-attachments",
                "hidden-documents",
                "hidden-project",
                "complete"
              ]
            : [
                "claim",
                "copied-objects",
                "pending-attachments",
                "hidden-documents",
                "hidden-project",
                "private-staging",
                "complete"
              ]
      )
    }
  })

  it("releases a failed cleanup claim for a later retry", async () => {
    const trace = await Effect.runPromise(Ref.make<ReadonlyArray<string>>([]))
    const step = (name: string) =>
      Ref.update(trace, (current) => [...current, name])
    const layer = makeJiraMigrationCleanupWorkflow({
      claim: () => step("claim").pipe(Effect.as(true)),
      verifyPermanentArchive: () => Effect.void,
      deleteHiddenProject: () => step("hidden-project"),
      deletePendingAttachments: () =>
        Effect.fail(
          JiraMigrationCleanupFailure.make({
            reason: "storage-failed",
            retryable: true
          })
        ),
      deleteCopiedObjects: () => step("copied-objects"),
      deleteHiddenDocuments: () => Effect.void,
      deletePrivateStaging: () => Effect.void,
      complete: () => Effect.void,
      release: () => step("release")
    }).pipe(Layer.provideMerge(WorkflowEngine.layerMemory))
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* JiraMigrationCleanupWorkflow.execute(payload("discard"), {
          discard: true
        })
        return yield* Effect.result(
          JiraMigrationCleanupWorkflow.execute(payload("discard"))
        )
      }).pipe(Effect.provide(layer))
    )
    expect(result._tag).toBe("Failure")
    expect(await Effect.runPromise(Ref.get(trace))).toEqual([
      "claim",
      "copied-objects",
      "release"
    ])
  })
})
