import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ClusterWorkflowEngine, SingleRunner } from "effect/unstable/cluster"
import { makeJiraCleanupActivities } from "./CleanupOperations"
import { makeJiraMigrationCleanupWorkflow } from "./CleanupWorkflow"
import { JiraMigrationArtifactsLive } from "./MigrationArtifacts"
import { JiraMigrationProjection } from "./MigrationProjection"
import { makeJiraProductionActivities } from "./MigrationProduction"
import { makeJiraMigrationWorkflow } from "./MigrationWorkflow"

export const JiraWorkflowEngineLive = ClusterWorkflowEngine.layer.pipe(
  Layer.provide(SingleRunner.layer({ runnerStorage: "sql" })),
  Layer.provide(BunCrypto.layer)
)

export const JiraWorkflowsLive = Layer.mergeAll(
  Layer.unwrap(
    Effect.map(makeJiraProductionActivities, makeJiraMigrationWorkflow)
  ),
  Layer.unwrap(
    Effect.map(makeJiraCleanupActivities, makeJiraMigrationCleanupWorkflow)
  )
).pipe(
  Layer.provideMerge(JiraWorkflowEngineLive),
  Layer.provideMerge(JiraMigrationProjection.layer),
  Layer.provideMerge(JiraMigrationArtifactsLive)
)
