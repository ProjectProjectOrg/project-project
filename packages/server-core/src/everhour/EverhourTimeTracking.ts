import type {
  ActiveTimer,
  EverhourApiKeyMissing,
  EverhourAuthInvalid,
  EverhourConfigMissing,
  EverhourError,
  EverhourRateLimited,
  LogTimeInput,
  NotFound,
  StartSprintTimerInput,
  StartTimerInput,
  TicketTimeSummary,
  WorkTypeOption,
  OrgScope,
  ProjectScope
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { EverhourTimeRecord } from "./Everhour"

export type EverhourTimeTrackingError =
  | NotFound
  | EverhourApiKeyMissing
  | EverhourAuthInvalid
  | EverhourRateLimited
  | EverhourConfigMissing
  | EverhourError

export interface EverhourTimeTrackingShape {
  readonly workTypesForTicket: (
    ticketId: string
  ) => Effect.Effect<ReadonlyArray<WorkTypeOption>, NotFound, ProjectScope>
  readonly startTicketTimer: (
    ticketId: string,
    input: StartTimerInput
  ) => Effect.Effect<ActiveTimer, EverhourTimeTrackingError, ProjectScope>
  readonly startSprintTimer: (
    groupId: string,
    input: StartSprintTimerInput
  ) => Effect.Effect<ActiveTimer, EverhourTimeTrackingError, ProjectScope>
  readonly stopTimer: () => Effect.Effect<
    ActiveTimer | null,
    EverhourTimeTrackingError,
    OrgScope
  >
  readonly currentTimer: () => Effect.Effect<
    ActiveTimer | null,
    EverhourTimeTrackingError,
    OrgScope
  >
  readonly logTime: (
    input: LogTimeInput
  ) => Effect.Effect<
    TicketTimeSummary | null,
    EverhourTimeTrackingError,
    ProjectScope
  >
  readonly ticketTimeSummary: (
    ticketId: string
  ) => Effect.Effect<TicketTimeSummary, NotFound, ProjectScope>
  readonly applyWebhookTimeEvent: (
    projectIntegrationLinkId: string,
    record: EverhourTimeRecord
  ) => Effect.Effect<void>
}

export class EverhourTimeTracking extends Context.Service<
  EverhourTimeTracking,
  EverhourTimeTrackingShape
>()("@pp/server-core/everhour/EverhourTimeTracking") {}
