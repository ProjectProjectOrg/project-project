import * as CleanupWorkflow from "@pp/integration-jira/CleanupWorkflow"
import { JiraMigrationProjection } from "@pp/integration-jira/MigrationProjection"
import * as MigrationWorkflow from "@pp/integration-jira/MigrationWorkflow"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { WorkflowEngineLive } from "../workflows/Runtime"
import { JiraMigrationArtifactsLive } from "./ArtifactsLive"
import * as CleanupOperations from "./CleanupLive"
import * as MigrationProduction from "./ProductionActivities"

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
