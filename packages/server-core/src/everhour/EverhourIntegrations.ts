import type {
  EverhourApiKeyMissing,
  EverhourAuthInvalid,
  EverhourConfigMissing,
  EverhourError,
  EverhourProjectIntegrationStatus,
  EverhourRateLimited,
  EverhourSyncSummary,
  NotFound,
  PersonalEverhour,
  ProjectScope
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export type EverhourIntegrationError =
  | NotFound
  | EverhourApiKeyMissing
  | EverhourAuthInvalid
  | EverhourRateLimited
  | EverhourConfigMissing
  | EverhourError

export interface EverhourIntegrationsShape {
  readonly getProfile: (userId: string) => Effect.Effect<PersonalEverhour>
  readonly connectProfile: (
    userId: string,
    apiKey: string
  ) => Effect.Effect<
    PersonalEverhour,
    | EverhourAuthInvalid
    | EverhourRateLimited
    | EverhourConfigMissing
    | EverhourError
  >
  readonly disconnectProfile: (
    userId: string
  ) => Effect.Effect<PersonalEverhour>
  readonly getProjectStatus: () => Effect.Effect<
    EverhourProjectIntegrationStatus,
    never,
    ProjectScope
  >
  readonly connectProject: () => Effect.Effect<
    EverhourSyncSummary,
    EverhourIntegrationError,
    ProjectScope
  >
  readonly syncProject: () => Effect.Effect<
    EverhourSyncSummary,
    EverhourIntegrationError,
    ProjectScope
  >
  readonly disconnectProject: () => Effect.Effect<
    EverhourProjectIntegrationStatus,
    never,
    ProjectScope
  >
  readonly bestEffortProjectSync: () => Effect.Effect<void, never, ProjectScope>
}

export class EverhourIntegrations extends Context.Service<
  EverhourIntegrations,
  EverhourIntegrationsShape
>()("@pp/server-core/everhour/EverhourIntegrations") {}
