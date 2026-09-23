import { it } from "@effect/vitest"
import * as AttachmentUploads from "@pp/server-core/attachments/AttachmentUploads"
import * as BetterAuth from "@pp/server-core/auth/BetterAuth"
import * as Comments from "@pp/server-core/comments/Comments"
import * as GroupDocs from "@pp/server-core/groups/GroupDocs"
import * as Groups from "@pp/server-core/groups/Groups"
import * as ProjectDocs from "@pp/server-core/projects/ProjectDocs"
import * as Projects from "@pp/server-core/projects/Projects"
import * as ProjectStatuses from "@pp/server-core/projects/ProjectStatuses"
import * as OrgStorage from "@pp/server-core/storage/OrgStorage"
import * as Tags from "@pp/server-core/tags/Tags"
import * as TicketDocs from "@pp/server-core/tickets/TicketDocs"
import * as TicketIndex from "@pp/server-core/tickets/TicketIndex"
import * as Tickets from "@pp/server-core/tickets/Tickets"
import * as Users from "@pp/server-core/users/Users"
import {
  CurrentUser,
  McpTools,
  NotFound,
  Org,
  OrgStorageStatus,
  User
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { describe, expect } from "vitest"

import { handlers } from "./handlers"

const user = Schema.decodeSync(User)({
  id: "user-1",
  email: "user@example.com",
  name: "User",
  username: null,
  image: null,
  createdAt: "2026-09-08T00:00:00Z",
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
const org = Schema.decodeSync(Org)({
  slug: "acme",
  name: "Acme",
  role: "member"
})
const status = Schema.decodeSync(OrgStorageStatus)({
  status: "active",
  endpoint: "https://storage.example.test",
  bucket: "private-bucket",
  region: "auto",
  keyPrefix: "private-prefix",
  accessKeyIdMasked: "****1234",
  forcePathStyle: true,
  connectedAt: "2026-09-08T00:00:00Z",
  lastCheckedAt: "2026-09-08T11:00:00Z",
  lastCheckError: "private upstream details"
})
const unused = Layer.mergeAll(
  Layer.mock(AttachmentUploads.AttachmentUploads, {}),
  Layer.mock(Projects.Projects, {}),
  Layer.mock(Tickets.Tickets, {}),
  Layer.mock(Comments.Comments, {}),
  Layer.mock(Groups.Groups, {}),
  Layer.mock(Tags.Tags, {}),
  Layer.mock(Users.Users, {}),
  Layer.mock(ProjectDocs.ProjectDocs, {}),
  Layer.mock(GroupDocs.GroupDocs, {}),
  Layer.mock(TicketDocs.TicketDocs, {}),
  Layer.mock(TicketIndex.TicketIndex, {}),
  Layer.mock(ProjectStatuses.ProjectStatuses, {})
)

const fixture = (
  options: {
    state?: OrgStorageStatus["status"]
    role?: Org["role"]
    denied?: "organization" | "storage"
  } = {}
) => {
  const calls: Array<{ operation: string; userId: string; orgSlug: string }> =
    []
  const layer = Layer.mergeAll(
    unused,
    Layer.succeed(CurrentUser, user),
    Layer.mock(BetterAuth.BetterAuth, {
      getOrganization: (userId, orgSlug) => {
        calls.push({ operation: "organization", userId, orgSlug })
        return options.denied === "organization"
          ? Effect.fail(new NotFound())
          : Effect.succeed({ ...org, role: options.role ?? org.role })
      }
    }),
    Layer.mock(OrgStorage.OrgStorage, {
      getStatus: (orgSlug, userId) => {
        calls.push({ operation: "storage", userId, orgSlug })
        return options.denied === "storage"
          ? Effect.fail(new NotFound())
          : Effect.succeed({
              ...status,
              status: options.state ?? status.status,
              lastCheckedAt:
                options.state === "not_connected" ? null : status.lastCheckedAt
            })
      }
    })
  )
  return {
    calls,
    get: handlers.get_org({ orgSlug: org.slug }).pipe(Effect.provide(layer))
  }
}

describe("MCP organization storage availability", () => {
  it.effect.each(["not_connected", "active", "broken"] as const)(
    "returns stored %s status without configuration or upstream details",
    (state) =>
      Effect.gen(function* () {
        const f = fixture({ state })
        const result = yield* f.get
        const expected = {
          ...org,
          storage: {
            status: state,
            lastCheckedAt:
              state === "not_connected" ? null : "2026-09-08T11:00:00.000Z"
          }
        }
        const encoded = yield* Schema.encodeEffect(McpTools.get_org.output)(
          result
        )
        expect(encoded).toEqual(expected)
        expect(Object.keys(result.storage).toSorted()).toEqual([
          "lastCheckedAt",
          "status"
        ])
        expect(f.calls).toEqual([
          { operation: "organization", userId: user.id, orgSlug: org.slug },
          { operation: "storage", userId: user.id, orgSlug: org.slug }
        ])
      })
  )

  it.effect.each(["owner", "admin", "member"] as const)(
    "preserves the authorized organization role: %s",
    (role) =>
      Effect.gen(function* () {
        const result = yield* fixture({ role }).get
        expect(result.role).toBe(role)
        expect(result.storage.status).toBe("active")
      })
  )

  it.effect.each(["organization", "storage"] as const)(
    "propagates denied %s access instead of reporting disconnected storage",
    (denied) =>
      Effect.gen(function* () {
        const f = fixture({ denied })
        expect((yield* Effect.flip(f.get))._tag).toBe("NotFound")
        expect(f.calls.map((call) => call.operation)).toEqual(
          denied === "organization"
            ? ["organization"]
            : ["organization", "storage"]
        )
      })
  )
})
