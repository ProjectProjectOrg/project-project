import * as CleanupOperations from "@pp/server-core/jira/CleanupOperations"
import * as CleanupWorkflow from "@pp/server-core/jira/CleanupWorkflow"
import { JiraMigrationArtifactsLive } from "@pp/server-core/jira/MigrationArtifacts"
import * as MigrationProduction from "@pp/server-core/jira/MigrationProduction"
import { JiraMigrationProjection } from "@pp/server-core/jira/MigrationProjection"
import * as MigrationWorkflow from "@pp/server-core/jira/MigrationWorkflow"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { WorkflowEngineLive } from "../workflows/Runtime"

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
  Layer.provideMerge(WorkflowEngineLive),
  Layer.provideMerge(JiraMigrationProjection.layer),
  Layer.provideMerge(JiraMigrationArtifactsLive)
)
