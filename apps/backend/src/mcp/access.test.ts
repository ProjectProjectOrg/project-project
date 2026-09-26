import { describe, expect, it } from "@effect/vitest"
import {
  accessLayer,
  orgScope,
  projectScope
} from "@pp/server-core/access/testing"
import {
  CurrentUser,
  OrgScope,
  ProjectScope,
  User,
  type OrgRole,
  type Role
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { orgTool, projectTool } from "./access"
import { McpRequestUser } from "./McpRequestUser"

const user = Schema.decodeSync(User)({
  id: "user-1",
  email: "user@example.com",
  name: "User",
  username: null,
  image: null,
  createdAt: "2026-09-25T00:00:00Z",
  activeOrgSlug: null,
  personalGithub: { connected: false },
  editorPreference: "vscode",
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
})

const manageStorage = orgTool(
  { storage: ["manage"] },
  (input: Readonly<{ orgSlug: string }>) =>
    Effect.gen(function* () {
      const scope = yield* OrgScope
      const caller = yield* CurrentUser
      return `${caller.id}:${input.orgSlug}:${scope.role}`
    })
)

const runAs = (role: OrgRole, orgSlug: string) =>
  manageStorage({ orgSlug }).pipe(
    Effect.provide(accessLayer({ org: orgScope(role) })),
    Effect.provideService(McpRequestUser, Option.some(user))
  )

describe("orgTool", () => {
  it.effect("runs the tool in the caller's org scope", () =>
    Effect.gen(function* () {
      expect(yield* runAs("admin", "acme")).toBe("user-1:acme:admin")
    })
  )

  it.effect("refuses a caller without the tool's grants", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(runAs("member", "acme"))
      expect(error._tag).toBe("Forbidden")
    })
  )

  it.effect("hides an org the caller does not belong to", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(runAs("owner", "elsewhere"))
      expect(error._tag).toBe("NotFound")
    })
  )
})

const deleteTicket = projectTool(
  { ticket: ["delete"] },
  (input: Readonly<{ orgSlug: string; projectSlug: string }>) =>
    Effect.gen(function* () {
      const scope = yield* ProjectScope
      const caller = yield* CurrentUser
      return `${caller.id}:${input.projectSlug}:${scope.role}`
    })
)

const deleteAs = (role: Role, projectSlug: string) =>
  deleteTicket({ orgSlug: "acme", projectSlug }).pipe(
    Effect.provide(accessLayer({ projects: [projectScope("member", role)] })),
    Effect.provideService(McpRequestUser, Option.some(user))
  )

describe("projectTool", () => {
  it.effect("runs the tool in the caller's project scope", () =>
    Effect.gen(function* () {
      expect(yield* deleteAs("pm", "website")).toBe("user-1:website:pm")
    })
  )

  it.effect("refuses a caller without the tool's grants", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(deleteAs("developer", "website"))
      expect(error._tag).toBe("Forbidden")
    })
  )

  it.effect("hides a project the caller cannot see", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(deleteAs("pm", "elsewhere"))
      expect(error._tag).toBe("NotFound")
    })
  )
})
