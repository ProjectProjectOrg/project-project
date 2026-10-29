import type { InstanceDescriptor, InstanceNotConfigured } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export type InstanceShape = Readonly<{
  describe: Effect.Effect<InstanceDescriptor, InstanceNotConfigured>
}>

export class Instance extends Context.Service<Instance, InstanceShape>()(
  "@pp/server-core/instance/Instance"
) {}
