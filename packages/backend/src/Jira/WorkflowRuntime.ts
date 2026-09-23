import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ClusterWorkflowEngine, SingleRunner } from "effect/unstable/cluster"
import * as CleanupOperations from "./CleanupOperations"
import * as CleanupWorkflow from "./CleanupWorkflow"
import { JiraMigrationArtifactsLive } from "./MigrationArtifacts"
import { JiraMigrationProjection } from "./MigrationProjection"
import * as MigrationProduction from "./MigrationProduction"
import * as MigrationWorkflow from "./MigrationWorkflow"

export const JiraWorkflowEngineLive = ClusterWorkflowEngine.layer.pipe(
  Layer.provide(SingleRunner.layer({ runnerStorage: "sql" })),
  Layer.provide(BunCrypto.layer)
)

export const JiraWorkflowsLive = Layer.mergeAll(
  Layer.unwrap(
    Effect.map(
      MigrationProduction.makeJiraProductionActivities,
      MigrationWorkflow.makeJiraMigrationWorkflow
    )
  ),
  Layer.unwrap(
    Effect.map(
      CleanupOperations.makeJiraCleanupActivities,
      CleanupWorkflow.makeJiraMigrationCleanupWorkflow
    )
  )
).pipe(
  Layer.provideMerge(JiraWorkflowEngineLive),
  Layer.provideMerge(JiraMigrationProjection.layer),
  Layer.provideMerge(JiraMigrationArtifactsLive)
)
