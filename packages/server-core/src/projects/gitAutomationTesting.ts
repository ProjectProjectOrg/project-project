import { StatusSlug } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type { GitAutomationConfig } from "../tickets/gitAutomation"
import {
  ProjectGitAutomation,
  type ProjectGitAutomationShape
} from "./ProjectGitAutomation"

export const DEFAULT_GIT_AUTOMATION_CONFIG: GitAutomationConfig = {
  rules: {
    branch_linked: null,
    pr_draft_opened: null,
    pr_opened: null,
    pr_merged: Schema.decodeSync(StatusSlug)("done"),
    pr_closed: null,
    branch_deleted: null
  },
  forwardOnly: true,
  statusOrder: ["todo", "in_progress", "done"]
}

export const gitAutomationTestService = (
  config: GitAutomationConfig = DEFAULT_GIT_AUTOMATION_CONFIG
): ProjectGitAutomationShape => ({
  get: () => Effect.die("git automation get is not stubbed"),
  configFor: () => Effect.succeed(config),
  replace: () => Effect.die("git automation replace is not stubbed")
})

export const gitAutomationTestLayer = (
  config: GitAutomationConfig = DEFAULT_GIT_AUTOMATION_CONFIG
) => Layer.succeed(ProjectGitAutomation, gitAutomationTestService(config))
