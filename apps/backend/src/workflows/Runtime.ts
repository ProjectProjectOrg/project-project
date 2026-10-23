import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import * as Layer from "effect/Layer"
import { ClusterWorkflowEngine, SingleRunner } from "effect/unstable/cluster"

export const WorkflowEngineLive = ClusterWorkflowEngine.layer.pipe(
  Layer.provide(SingleRunner.layer({ runnerStorage: "sql" })),
  Layer.provide(BunCrypto.layer)
)
