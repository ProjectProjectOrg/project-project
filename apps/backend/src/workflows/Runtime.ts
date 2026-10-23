import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import { ClusterWorkflowEngine, SingleRunner } from "effect/cluster"
import * as Layer from "effect/Layer"

export const WorkflowEngineLive = ClusterWorkflowEngine.layer.pipe(
  Layer.provide(SingleRunner.layer({ runnerStorage: "sql" })),
  Layer.provide(BunCrypto.layer)
)
