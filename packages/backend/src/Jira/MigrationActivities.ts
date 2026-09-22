import type * as Exit from "effect/Exit"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { Activity } from "effect/unstable/workflow"
import type {
  JiraMigrationWorkflowFailure,
  JiraMigrationWorkflowFailureValue,
  JiraMigrationWorkflowPayloadValue
} from "./MigrationWorkflow"

export interface MigrationActivities {
  readonly start: (input: {
    readonly payload: JiraMigrationWorkflowPayloadValue
    readonly executionId: string
  }) => Effect.Effect<void, JiraMigrationWorkflowFailureValue>
  readonly finalize: (input: {
    readonly executionId: string
    readonly exit: Exit.Exit<unknown, unknown>
  }) => Effect.Effect<void>
}

export const activityName = (parts: ReadonlyArray<string | number>) =>
  `v1/${parts.map(String).join("/")}`

export const makeStartMigrationActivity = (
  execute: Effect.Effect<void, JiraMigrationWorkflowFailureValue>,
  error: typeof JiraMigrationWorkflowFailure
) =>
  Activity.make({
    name: activityName(["start"]),
    success: Schema.Void,
    error,
    execute
  })

export const makeFinalizeMigrationActivity = (execute: Effect.Effect<void>) =>
  Activity.make({
    name: activityName(["finalize"]),
    success: Schema.Void,
    execute
  })
