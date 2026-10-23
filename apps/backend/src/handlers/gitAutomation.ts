import { ProjectGitAutomation } from "@pp/server-core/projects/ProjectGitAutomation"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

export const GitAutomationHandlerLive = HttpApiBuilder.group(
  AppApi,
  "gitAutomation",
  (handlers) =>
    handlers
      .handle("get", () =>
        Effect.flatMap(ProjectGitAutomation, (automation) => automation.get())
      )
      .handle("update", ({ payload }) =>
        Effect.flatMap(ProjectGitAutomation, (automation) =>
          automation.update(payload)
        )
      )
)
