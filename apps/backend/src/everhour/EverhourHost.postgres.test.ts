// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import * as BunServices from "@effect/platform-bun/BunServices"
import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, pgTypes } from "@pp/db"
import { EverhourApiKeys } from "@pp/integration-everhour/ApiKeys"
import { EverhourHost } from "@pp/integration-everhour/Host"
import { EverhourServicesLive } from "@pp/integration-everhour/Services"
import { EverhourTimeTracking } from "@pp/integration-everhour/TimeTracking"
import { Access } from "@pp/server-core/access/Access"
import { AccessLive } from "@pp/server-core/access/AccessLive"
import { testUser } from "@pp/server-core/access/testing"
import { TicketActivityLive } from "@pp/server-core/activity/TicketActivityLive"
import { GroupDocsLive } from "@pp/server-core/groups/GroupDocsLive"
import * as KeyedLock from "@pp/server-core/locks/KeyedLock"
import { Markdown } from "@pp/server-core/markdown/Markdown"
import { MarkdownLive } from "@pp/server-core/markdown/MarkdownLive"
import { FinishedStatuses } from "@pp/server-core/projects/FinishedStatuses"
import { SecretCryptoLive } from "@pp/server-core/storage/SecretCryptoLive"
import { TicketDocsLive } from "@pp/server-core/tickets/TicketDocsLive"
import { TicketIndexLive } from "@pp/server-core/tickets/TicketIndexLive"
import { CurrentUser, OrgScope, ProjectScope } from "@pp/shared"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { EverhourHostLive } from "./HostLive"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const encryptionKey = process.env.USER_SECRET_ENCRYPTION_KEY

const noProviderRequests: typeof globalThis.fetch = Object.assign(
  () => Promise.reject(new Error("Unexpected Everhour request")),
  { preconnect: () => undefined }
)

describe.skipIf(!databaseUrl)("Everhour backend composition", () => {
  let pool: Pool

  beforeAll(() => {
    if (!databaseUrl) throw new Error("Isolated database required")
    const url = new URL(databaseUrl)
    if (
      url.hostname !== "127.0.0.1" ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    )
      throw new Error("Isolated local database required")
    pool = new Pool({ connectionString: databaseUrl })
    process.env.USER_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      "base64"
    )
  })

  afterAll(async () => {
    try {
      await pool.end()
    } finally {
      if (encryptionKey === undefined)
        delete process.env.USER_SECRET_ENCRYPTION_KEY
      else process.env.USER_SECRET_ENCRYPTION_KEY = encryptionKey
    }
  })

  it.effect(
    "reads real project documents and encrypted credentials while enforcing time visibility",
    () =>
      Effect.gen(function* () {
        const suffix = randomUUID().replaceAll("-", "").slice(0, 12)
        const orgId = `eh-host-${suffix}`
        const userId = `eh-member-${suffix}`
        const projectId = randomUUID()
        const linkId = randomUUID()
        const everhourUserId = `eh-${suffix}`
        const fs = yield* FileSystem.FileSystem
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "pp-everhour-host-"
        })
        yield* Effect.addFinalizer(() =>
          Effect.promise(async () => {
            await pool.query("delete from organization where id=$1", [orgId])
            await pool.query('delete from "user" where id=$1', [userId])
          })
        )
        yield* Effect.promise(async () => {
          await pool.query(
            'insert into "user" (id,name,email,created_at,updated_at) values ($1,$1,$2,now(),now())',
            [userId, `${userId}@example.test`]
          )
          await pool.query(
            "insert into organization (id,name,slug,created_at) values ($1,$1,$1,now())",
            [orgId]
          )
          await pool.query(
            "insert into member (id,organization_id,user_id,role,created_at) values ($1,$2,$1,'member',now())",
            [userId, orgId]
          )
          await pool.query(
            "insert into project_index (id,organization_id,slug,key,name,icon,color,created_by,published_at) values ($1,$2,'project','T','Website','folder','#aaaaaa',$3,now())",
            [projectId, orgId, userId]
          )
          await pool.query(
            "insert into project_member (project_id,organization_id,user_id,role_id) values ($1,$2,$3,'developer')",
            [projectId, orgId, userId]
          )
          const integration = await pool.query<{ id: string }>(
            "insert into organization_integration (organization_id,provider,status) values ($1,'everhour','active') returning id",
            [orgId]
          )
          await pool.query(
            "insert into project_integration_link (id,project_id,organization_id,organization_integration_id,provider,status) values ($1,$2,$3,$4,'everhour','active')",
            [linkId, projectId, orgId, integration.rows[0]!.id]
          )
          await pool.query(
            "insert into project_everhour_integration (project_integration_link_id,organization_id,status,everhour_project_id,everhour_project_name) values ($1,$2,'active','ev:project','Website')",
            [linkId, orgId]
          )
          await pool.query(
            "insert into everhour_active_timer (everhour_user_id,user_id,project_integration_link_id,ticket_id,group_id,work_type_key,everhour_task_id,started_at) values ($1,$2,$3,'T-1','G-1','development','ev:task',now())",
            [everhourUserId, userId, linkId]
          )
        })

        const infrastructure = Layer.mergeAll(
          DbLive.pipe(
            Layer.provideMerge(
              PgClient.layer({
                url: Redacted.make(databaseUrl!),
                types: pgTypes
              })
            )
          ),
          BunServices.layer,
          Layer.succeed(FetchHttpClient.Fetch, noProviderRequests),
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              PROJECTS_DIR: root,
              BETTER_AUTH_URL: "https://pp.example.test"
            })
          )
        )
        const services = EverhourServicesLive.pipe(
          Layer.provideMerge(EverhourHostLive),
          Layer.provideMerge(AccessLive),
          Layer.provideMerge(TicketIndexLive),
          Layer.provideMerge(GroupDocsLive),
          Layer.provideMerge(TicketDocsLive),
          Layer.provideMerge(FinishedStatuses.layer),
          Layer.provideMerge(KeyedLock.layer),
          Layer.provideMerge(TicketActivityLive),
          Layer.provideMerge(MarkdownLive),
          Layer.provideMerge(SecretCryptoLive)
        )
        yield* Effect.gen(function* () {
          const access = yield* Access
          const org = yield* access.org(orgId)
          const project = yield* access.project(orgId, "project")
          const markdown = yield* Markdown
          const timestamps = {
            createdBy: userId,
            createdAt: "2026-10-23T00:00:00Z",
            updatedAt: "2026-10-23T00:00:00Z"
          }
          yield* markdown.createTicketFile(
            orgId,
            "project",
            "T-1",
            {
              ...timestamps,
              id: "T-1",
              title: "Tracked work",
              status: "todo",
              type: "bug"
            },
            ""
          )
          yield* markdown.createGroupFile(
            orgId,
            "project",
            "G-1",
            {
              ...timestamps,
              id: "G-1",
              name: "Sprint 1",
              kind: "sprint",
              tickets: ["T-1"],
              color: "#aaaaaa",
              startsAt: null,
              endsAt: null,
              completedAt: null
            },
            ""
          )
          const host = yield* EverhourHost
          expect(yield* host.project(orgId, "project")).toEqual({
            projectId,
            organizationId: orgId
          })
          expect(yield* host.publishedName(projectId)).toBe("Website")
          expect(yield* host.memberIds(projectId)).toEqual([userId])
          expect(yield* host.sprints(orgId, "project")).toMatchObject([
            { id: "G-1", name: "Sprint 1", tickets: ["T-1"] }
          ])
          const sealed = yield* host.seal("key-for-member")
          yield* Effect.promise(() =>
            pool.query(
              "insert into user_everhour_integration (user_id,encrypted_api_key,api_key_nonce,api_key_tag,everhour_user_id) values ($1,$2,$3,$4,$5)",
              [
                userId,
                sealed.ciphertext,
                sealed.nonce,
                sealed.tag,
                everhourUserId
              ]
            )
          )
          const keys = yield* EverhourApiKeys
          expect(yield* keys.forUser(userId)).toEqual({
            apiKey: "key-for-member",
            everhourUserId
          })
          const time = yield* EverhourTimeTracking
          expect(
            (yield* time
              .workTypesForTicket("T-1")
              .pipe(Effect.provideService(ProjectScope, project))).map(
              (type) => type.key
            )
          ).toContain("development")
          expect(
            yield* time
              .currentTimer()
              .pipe(Effect.provideService(OrgScope, org))
          ).toMatchObject({
            slug: "project",
            ticketId: "T-1",
            ticketTitle: "Tracked work",
            groupId: "G-1"
          })

          yield* Effect.promise(() =>
            pool.query(
              "delete from project_member where project_id=$1 and user_id=$2",
              [projectId, userId]
            )
          )
          expect(
            yield* time
              .currentTimer()
              .pipe(Effect.provideService(OrgScope, org))
          ).toBeNull()
          yield* Effect.promise(() =>
            pool.query(
              "update project_index set published_at=null where id=$1",
              [projectId]
            )
          )
          expect(
            (yield* host.publishedName(projectId).pipe(Effect.flip))._tag
          ).toBe("NotFound")
        }).pipe(
          Effect.provideService(CurrentUser, testUser(userId)),
          Effect.provide(services.pipe(Layer.provide(infrastructure)))
        )
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )
})
