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
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"

import { inOrg, inProject } from "./access"

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

const orgTool = inOrg("get_org", (input: Readonly<{ orgSlug: string }>) =>
  Effect.gen(function* () {
    const scope = yield* OrgScope
    const caller = yield* CurrentUser
    return `${caller.id}:${input.orgSlug}:${scope.role}`
  })
)

const runAs = (role: OrgRole, orgSlug: string) =>
  orgTool({ orgSlug }).pipe(
    Effect.provide(accessLayer({ org: orgScope(role) })),
    Effect.provideService(CurrentUser, user)
  )

describe("scoped org tools", () => {
  it.effect("runs the tool in the caller's org scope", () =>
    Effect.gen(function* () {
      expect(yield* runAs("member", "acme")).toBe("user-1:acme:member")
    })
  )

  it.effect("hides an org the caller does not belong to", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(runAs("owner", "elsewhere"))
      expect(error._tag).toBe("NotFound")
    })
  )
})

const projectTool = inProject(
  "rebuild_ticket_index",
  (input: Readonly<{ orgSlug: string; projectSlug: string }>) =>
    Effect.gen(function* () {
      const scope = yield* ProjectScope
      const caller = yield* CurrentUser
      return `${caller.id}:${input.projectSlug}:${scope.role}`
    })
)

const rebuildAs = (role: Role, projectSlug: string) =>
  projectTool({ orgSlug: "acme", projectSlug }).pipe(
    Effect.provide(accessLayer({ projects: [projectScope("member", role)] })),
    Effect.provideService(CurrentUser, user)
  )

describe("scoped project tools", () => {
  it.effect("runs the tool in the caller's project scope", () =>
    Effect.gen(function* () {
      expect(yield* rebuildAs("pm", "website")).toBe("user-1:website:pm")
    })
  )

  it.effect("refuses a caller without the tool's grants", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(rebuildAs("developer", "website"))
      expect(error._tag).toBe("Forbidden")
    })
  )

  it.effect("hides a project the caller cannot see", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(rebuildAs("pm", "elsewhere"))
      expect(error._tag).toBe("NotFound")
    })
  )
})

describe("scope declared in the catalog", () => {
  it.effect("must match the scope a handler runs in", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        inProject(
          "get_org",
          () => Effect.void
        )({
          orgSlug: "acme",
          projectSlug: "website"
        }).pipe(
          Effect.provide(
            accessLayer({ projects: [projectScope("member", "pm")] })
          ),
          Effect.provideService(CurrentUser, user)
        )
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true)
    })
  )
})
