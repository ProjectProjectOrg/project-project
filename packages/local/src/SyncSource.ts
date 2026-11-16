import type { ProjectSync, SyncCursor } from "@pp/shared"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"

import type { LocalProject } from "./LocalRpcs"

export class SyncDenied extends Data.TaggedError("SyncDenied") {}

export class SyncOffline extends Data.TaggedError("SyncOffline") {}

export class SyncSource extends Context.Service<
  SyncSource,
  Readonly<{
    pull: (
      project: LocalProject,
      after: SyncCursor | null
    ) => Effect.Effect<ProjectSync, SyncDenied | SyncOffline>
  }>
>()("@pp/local/SyncSource") {}
