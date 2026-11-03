import { it } from "@effect/vitest"
import { assertTrue } from "@effect/vitest/utils"
import { Db } from "@pp/db"
import {
  CurrentUser,
  FigmaAuthInvalid,
  FigmaError,
  FigmaNotConnected,
  type OrgRole,
  ProjectScope,
  type Role,
  StorageNotConnected
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"
import { describe, expect, vi } from "vitest"

import { makeDatabase } from "../../test/database"
import { accessLayer, projectScope, testUser } from "../access/testing"
import * as OrgStorage from "../storage/OrgStorage"
import * as S3Storage from "../storage/S3Storage"
import * as Figma from "./Figma"
import * as FigmaIntegrations from "./FigmaIntegrations"
import * as FigmaLinks from "./FigmaLinks"

describe("devResourceName", () => {
  it("names the resource after the ticket", () => {
    expect(FigmaLinks.devResourceName("T-51", "Figma integration")).toBe(
      "T-51 · Figma integration"
    )
  })

  it("truncates a very long title", () => {
    const name = FigmaLinks.devResourceName("T-51", "x".repeat(200))
    expect(name.length).toBeLessThanOrEqual(100)
    expect(name.startsWith("T-51 · ")).toBe(true)
  })
})

describe("shouldBacklink", () => {
  it("backlinks a node-level reference", () => {
    expect(FigmaLinks.shouldBacklink({ nodeId: "1:2" })).toBe(true)
  })

  it("skips a file-level reference", () => {
    expect(FigmaLinks.shouldBacklink({ nodeId: null })).toBe(false)
  })
})

describe("planFigmaReferences", () => {
  it("adds a reference that appears in the body", () => {
    expect(
      FigmaLinks.planFigmaReferences({
        existing: new Set(),
        referenced: new Set(["k/1:2"])
      })
    ).toEqual({ added: ["k/1:2"], removed: [] })
  })

  it("removes a reference that left the body", () => {
    expect(
      FigmaLinks.planFigmaReferences({
        existing: new Set(["k/1:2"]),
        referenced: new Set()
      })
    ).toEqual({ added: [], removed: ["k/1:2"] })
  })

  it("leaves an unchanged reference alone", () => {
    expect(
      FigmaLinks.planFigmaReferences({
        existing: new Set(["k/1:2"]),
        referenced: new Set(["k/1:2"])
      })
    ).toEqual({ added: [], removed: [] })
  })

  it("handles a simultaneous add and remove", () => {
    expect(
      FigmaLinks.planFigmaReferences({
        existing: new Set(["k/1:2"]),
        referenced: new Set(["k/3:4"])
      })
    ).toEqual({ added: ["k/3:4"], removed: ["k/1:2"] })
  })

  it("removes everything when the body is emptied", () => {
    expect(
      FigmaLinks.planFigmaReferences({
        existing: new Set(["a/1:2", "b/3:4"]),
        referenced: new Set()
      })
    ).toEqual({ added: [], removed: ["a/1:2", "b/3:4"] })
  })
})

describe("figmaThumbnailKey", () => {
  it("keys a node-level ref under the org and file", () => {
    expect(
      FigmaLinks.figmaThumbnailKey({
        keyPrefix: null,
        orgSlug: "acme",
        projectSlug: "web",
        fileKey: "FILEKEY123",
        nodeId: "12:34"
      })
    ).toBe("orgs/acme/projects/web/figma/FILEKEY123/12-34.png")
  })

  it("keys a file-level ref distinctly from any node", () => {
    expect(
      FigmaLinks.figmaThumbnailKey({
        keyPrefix: "pp",
        orgSlug: "acme",
        projectSlug: "web",
        fileKey: "FILEKEY123",
        nodeId: null
      })
    ).toBe("pp/orgs/acme/projects/web/figma/FILEKEY123/file.png")
  })
})

describe("figmaCheckReason", () => {
  it("never leaks a message from the figma error body", () => {
    expect(
      FigmaLinks.figmaCheckReason(
        new FigmaError({ reason: "token abc123 rejected" })
      )
    ).toBe("figma_unavailable")
  })

  it("names the auth failure without a credential", () => {
    expect(FigmaLinks.figmaCheckReason(new FigmaAuthInvalid())).toBe(
      "figma_auth_invalid"
    )
  })
})

describe("needsFigmaMetadata", () => {
  const at = (iso: string): Date =>
    DateTime.toDate(DateTime.makeUnsafe(Date.parse(iso)))

  const now = at("2026-09-04T12:00:00Z")

  it("resolves a link that has never been fetched", () => {
    expect(
      FigmaLinks.needsFigmaMetadata(
        { fetchedAt: null, lastCheckStatus: null },
        now
      )
    ).toBe(true)
  })

  it("retries a link whose last check errored", () => {
    expect(
      FigmaLinks.needsFigmaMetadata(
        {
          fetchedAt: at("2026-09-04T11:59:00Z"),
          lastCheckStatus: "error"
        },
        now
      )
    ).toBe(true)
  })

  it("skips a link fetched successfully within the day", () => {
    expect(
      FigmaLinks.needsFigmaMetadata(
        { fetchedAt: at("2026-09-04T11:00:00Z"), lastCheckStatus: "ok" },
        now
      )
    ).toBe(false)
  })

  it("refreshes a link fetched more than a day ago", () => {
    expect(
      FigmaLinks.needsFigmaMetadata(
        { fetchedAt: at("2026-09-03T11:00:00Z"), lastCheckStatus: "ok" },
        now
      )
    ).toBe(true)
  })
})

describe("figmaLinkMetadata", () => {
  it("falls back to the file name when the node name is unresolved", () => {
    expect(
      FigmaLinks.figmaLinkMetadata({
        fileKey: "FILEKEY123",
        nodeId: "1:2",
        name: null,
        fileName: "Design System",
        lastModified: null,
        thumbnailUrl: null
      }).name
    ).toBe("Design System")
  })

  it("falls back to the file key when nothing is resolved yet", () => {
    const metadata = FigmaLinks.figmaLinkMetadata({
      fileKey: "FILEKEY123",
      nodeId: null,
      name: null,
      fileName: null,
      lastModified: null,
      thumbnailUrl: null
    })
    expect(metadata.name).toBe("FILEKEY123")
    expect(metadata.fileName).toBe("FILEKEY123")
  })

  it("prefers the node name over the file name", () => {
    expect(
      FigmaLinks.figmaLinkMetadata({
        fileKey: "FILEKEY123",
        nodeId: "1:2",
        name: "Checkout frame",
        fileName: "Design System",
        lastModified: null,
        thumbnailUrl: null
      }).name
    ).toBe("Checkout frame")
  })
})

const BODY =
  "see https://www.figma.com/design/FILEKEY123/Spec?node-id=12-34 please"

const effectDb = (
  execute: (
    sql: string,
    params: ReadonlyArray<unknown>
  ) => ReadonlyArray<ReadonlyArray<unknown>>
) => {
  return makeDatabase(({ sql, params }) =>
    Effect.sync(() =>
      sql.startsWith("select") && sql.includes('from "project_index"')
        ? [["project-1", "org-1"]]
        : execute(sql, params)
    )
  )
}

type TestDb = Effect.Success<ReturnType<typeof effectDb>>

const proxyDb = (
  respond: (sql: string) => ReadonlyArray<ReadonlyArray<unknown>>
) => {
  const calls: Array<string> = []
  return Effect.map(
    effectDb((sql) => {
      calls.push(sql)
      return respond(sql).map((row) => [...row])
    }),
    (db) => ({ calls, db })
  )
}

const emptyDb = () => proxyDb(() => [])

const recordingDb = (
  respond: (sql: string) => ReadonlyArray<ReadonlyArray<unknown>>
) => {
  const calls: Array<string> = []
  const params: Array<unknown> = []
  return Effect.map(
    effectDb((sql, args) => {
      calls.push(sql)
      params.push(...args)
      return respond(sql).map((row) => [...row])
    }),
    (db) => ({ calls, params, db })
  )
}

const JOINED = 'inner join "figma_link_index"'

const referencedLink = (input: {
  readonly fetchedAt: string | null
  readonly lastCheckStatus: string | null
  readonly devResourceId?: string | null
}) => [
  [
    "link-1",
    "FILEKEY123",
    "12:34",
    input.fetchedAt,
    input.lastCheckStatus,
    input.devResourceId ?? null
  ]
]

const failingDb = () => {
  return Effect.map(
    effectDb(() => {
      throw new Error('relation "figma_reference" does not exist')
    }),
    (db) => ({ calls: [] as Array<string>, db })
  )
}

type HarnessInput = Readonly<{
  db: TestDb
  credential?: Effect.Effect<never, FigmaAuthInvalid | FigmaNotConnected>
  figma?: Partial<Record<string, unknown>>
  storage?: ReturnType<OrgStorage.OrgStorage["Service"]["requireConnection"]>
  viewer?: ProjectScope["Service"]
  markProjectCredentialRejected?: (
    orgSlug: string,
    slug: string,
    reason: string
  ) => Effect.Effect<void>
}>

const harness = (input: HarnessInput) =>
  FigmaLinks.layer.pipe(
    Layer.provide(Layer.succeed(Db, input.db)),
    Layer.provide(
      accessLayer({
        projects: input.viewer === undefined ? [] : [input.viewer]
      })
    ),
    Layer.provide(
      Layer.mock(FigmaIntegrations.FigmaIntegrations, {
        credentialFor: () =>
          input.credential ??
          Effect.succeed(
            Figma.FigmaCredential.FigmaToken({ token: "secret-pat" })
          ),
        markProjectCredentialRejected:
          input.markProjectCredentialRejected ?? (() => Effect.void)
      })
    ),
    Layer.provide(
      Layer.mock(Figma.Figma, {
        getFile: () => Effect.fail(new FigmaAuthInvalid()),
        getNodeName: () => Effect.fail(new FigmaAuthInvalid()),
        renderNode: () => Effect.fail(new FigmaAuthInvalid()),
        ...input.figma
      })
    ),
    Layer.provide(
      Layer.mock(OrgStorage.OrgStorage, {
        requireConnection: () =>
          input.storage ?? Effect.fail(new StorageNotConnected())
      })
    ),

    Layer.provide(
      Layer.mock(S3Storage.S3Storage, {
        presignPut: () => Effect.succeed("https://signed.example/put"),
        presignGet: () => Effect.succeed("https://signed.example/get")
      })
    )
  )

const reconcile = (
  layer: Layer.Layer<FigmaLinks.FigmaLinks>,
  body: string,
  title = "Fix login bug"
) =>
  FigmaLinks.FigmaLinks.pipe(
    Effect.flatMap((links) =>
      Effect.exit(links.reconcileTicket("acme", "web", "WEB-1", title, body))
    ),
    Effect.provide(layer)
  )

describe("reconcileTicket never fails a ticket save", () => {
  it.effect("succeeds when figma rejects the credential", () =>
    Effect.gen(function* () {
      const { db } = yield* proxyDb((sql) =>
        sql.startsWith("select") && sql.includes("project_index")
          ? [["org-1"]]
          : sql.startsWith("insert") && sql.includes("figma_link_index")
            ? [["link-1"]]
            : []
      )
      const exit = yield* reconcile(harness({ db }), BODY)
      expect(exit._tag).toBe("Success")
    })
  )

  it.live(
    "succeeds and records a self-describing status when the project has no figma connection",
    () =>
      Effect.gen(function* () {
        const { db, params } = yield* recordingDb((sql) =>
          sql.startsWith("select") && sql.includes("project_index")
            ? [["org-1"]]
            : sql.startsWith('insert into "figma_link_index"')
              ? [["link-1"]]
              : []
        )
        const exit = yield* reconcile(
          harness({ db, credential: Effect.fail(new FigmaNotConnected()) }),
          BODY
        )
        yield* Effect.sleep("100 millis")
        expect(exit._tag).toBe("Success")
        expect(params).toContain("figma_not_connected")
        expect(params).not.toContain("secret-pat")
      })
  )

  it.effect("succeeds when every figma reference table query fails", () =>
    Effect.gen(function* () {
      const { db } = yield* failingDb()
      const exit = yield* reconcile(harness({ db }), BODY)
      expect(exit._tag).toBe("Success")
    })
  )

  it.effect("succeeds on the delete path that retracts every reference", () =>
    Effect.gen(function* () {
      const { db } = yield* failingDb()
      const exit = yield* reconcile(harness({ db }), "")
      expect(exit._tag).toBe("Success")
    })
  )

  it.effect("writes nothing when the body has no figma link", () =>
    Effect.gen(function* () {
      const { calls, db } = yield* emptyDb()
      const exit = yield* reconcile(harness({ db }), "no links here")
      expect(exit._tag).toBe("Success")
      expect(calls.filter((sql) => !sql.startsWith("select"))).toEqual([])
    })
  )
})

describe("reconcileTicket resolves references it did not just add", () => {
  it.live(
    "resolves an existing reference whose metadata never landed, with nothing newly added",
    () =>
      Effect.gen(function* () {
        const { calls, params, db } = yield* recordingDb((sql) =>
          sql.includes(JOINED)
            ? referencedLink({ fetchedAt: null, lastCheckStatus: null })
            : []
        )
        const exit = yield* reconcile(harness({ db }), BODY)
        yield* Effect.sleep("100 millis")

        expect(exit._tag).toBe("Success")
        expect(
          calls.filter((sql) => sql.startsWith('insert into "figma_reference"'))
        ).toEqual([])
        expect(params).toContain("figma_auth_invalid")
      })
  )

  it.live(
    "retries an existing reference whose last check recorded a missing connection",
    () =>
      Effect.gen(function* () {
        const { params, db } = yield* recordingDb((sql) =>
          sql.includes(JOINED)
            ? referencedLink({
                fetchedAt: "2026-09-04T11:59:00.000Z",
                lastCheckStatus: "error"
              })
            : []
        )
        yield* reconcile(harness({ db }), BODY)
        yield* Effect.sleep("100 millis")

        expect(params).toContain("figma_auth_invalid")
      })
  )

  it.live(
    "never re-fetches an existing reference whose metadata is fresh",
    () =>
      Effect.gen(function* () {
        const fetchSpy = vi.fn(() => Promise.reject(new Error("no network")))
        vi.stubGlobal("fetch", fetchSpy)
        const getFile = vi.fn(() => Effect.fail(new FigmaAuthInvalid()))
        const fresh = DateTime.formatIso(
          DateTime.subtract(yield* DateTime.now, { minutes: 1 })
        )
        const { calls, db } = yield* recordingDb((sql) =>
          sql.includes(JOINED)
            ? referencedLink({ fetchedAt: fresh, lastCheckStatus: "ok" })
            : []
        )

        const exit = yield* reconcile(harness({ db, figma: { getFile } }), BODY)
        yield* Effect.sleep("100 millis")
        vi.unstubAllGlobals()

        expect(exit._tag).toBe("Success")
        expect(getFile).not.toHaveBeenCalled()
        expect(fetchSpy).not.toHaveBeenCalled()
        expect(
          calls.filter((sql) => sql.startsWith('update "figma_link_index"'))
        ).toEqual([])
      })
  )
})

describe("reconcileTicket link index lookup", () => {
  it.effect(
    "matches a file-level ref with is null so the nulls-not-distinct constraint updates instead of violating",
    () =>
      Effect.gen(function* () {
        const { calls, db } = yield* proxyDb((sql) =>
          sql.startsWith("select") && sql.includes("project_index")
            ? [["org-1"]]
            : []
        )
        yield* reconcile(
          harness({ db }),
          "https://www.figma.com/design/FILEKEY123/Spec"
        )
        const lookup = calls.find(
          (sql) =>
            sql.startsWith("select") && sql.includes('from "figma_link_index"')
        )
        expect(lookup).toContain('"node_id" is null')
      })
  )

  it.effect("matches a node-level ref by equality", () =>
    Effect.gen(function* () {
      const { calls, db } = yield* proxyDb((sql) =>
        sql.startsWith("select") && sql.includes("project_index")
          ? [["org-1"]]
          : []
      )
      yield* reconcile(harness({ db }), BODY)
      const lookup = calls.find(
        (sql) =>
          sql.startsWith("select") && sql.includes('from "figma_link_index"')
      )
      expect(lookup).toContain('"node_id" = ')
      expect(lookup).toContain('"project_id" = ')
    })
  )

  it.effect(
    "targets the same triple on conflict so a concurrent insert updates",
    () =>
      Effect.gen(function* () {
        const { calls, db } = yield* proxyDb((sql) =>
          sql.startsWith("select") && sql.includes("project_index")
            ? [["org-1"]]
            : []
        )
        yield* reconcile(harness({ db }), BODY)
        const insert = calls.find((sql) =>
          sql.startsWith('insert into "figma_link_index"')
        )
        expect(insert).toContain(
          'on conflict ("project_id","file_key","node_id") do update set'
        )
      })
  )
})

describe("reconcileTicket metadata resolution", () => {
  it.live("records an error status without logging the credential", () =>
    Effect.gen(function* () {
      const params: Array<unknown> = []
      const db = yield* effectDb((sql, args) => {
        params.push(...args)
        if (sql.startsWith("select") && sql.includes("project_index")) {
          return [["org-1"]]
        }
        if (sql.startsWith('insert into "figma_link_index"')) {
          return [["link-1"]]
        }
        return []
      })
      yield* reconcile(harness({ db }), BODY)
      yield* Effect.sleep("100 millis")
      expect(params).not.toContain("secret-pat")
      expect(params).toContain("figma_auth_invalid")
    })
  )

  it.live(
    "marks the project integration broken when its token is rejected",
    () =>
      Effect.gen(function* () {
        const markProjectCredentialRejected = vi.fn(() => Effect.void)
        const { db } = yield* recordingDb((sql) =>
          sql.startsWith("select") && sql.includes("project_index")
            ? [["org-1"]]
            : sql.startsWith('insert into "figma_link_index"')
              ? [["link-1"]]
              : []
        )
        yield* reconcile(harness({ db, markProjectCredentialRejected }), BODY)
        yield* Effect.sleep("100 millis")

        expect(markProjectCredentialRejected).toHaveBeenCalledWith(
          "acme",
          "web",
          "figma_auth_invalid"
        )
      })
  )
})

describe("reconcileTicket dev mode backlink", () => {
  it.live(
    "creates a figma dev resource for a newly added node-level reference and persists the id",
    () =>
      Effect.gen(function* () {
        const createDevResource = vi.fn(
          (..._args: Parameters<Figma.Figma["Service"]["createDevResource"]>) =>
            Effect.succeed("dev-99")
        )
        const { params, db } = yield* recordingDb((sql) => {
          if (sql.startsWith("select") && sql.includes("project_index")) {
            return [["org-1"]]
          }
          if (sql.startsWith('insert into "figma_link_index"')) {
            return [["link-1"]]
          }
          return []
        })
        const exit = yield* reconcile(
          harness({ db, figma: { createDevResource } }),
          BODY
        )
        yield* Effect.sleep("100 millis")

        expect(exit._tag).toBe("Success")
        expect(createDevResource).toHaveBeenCalledTimes(1)
        const [, input] = createDevResource.mock.calls[0]
        expect(input.fileKey).toBe("FILEKEY123")
        expect(input.nodeId).toBe("12:34")
        expect(input.name.startsWith("WEB-1 · ")).toBe(true)
        expect(params).toContain("dev-99")
      })
  )

  it.live(
    "backlinks a newly created ticket's figma link on the very first save, with no second edit",
    () =>
      Effect.gen(function* () {
        const createDevResource = vi.fn(
          (..._args: Parameters<Figma.Figma["Service"]["createDevResource"]>) =>
            Effect.succeed("dev-42")
        )
        const { params, db } = yield* recordingDb((sql) => {
          if (sql.startsWith("select") && sql.includes("project_index")) {
            return [["org-1"]]
          }
          if (sql.startsWith('insert into "figma_link_index"')) {
            return [["link-1"]]
          }
          return []
        })
        const exit = yield* reconcile(
          harness({ db, figma: { createDevResource } }),
          BODY,
          "Brand new ticket"
        )
        yield* Effect.sleep("100 millis")

        expect(exit._tag).toBe("Success")
        expect(createDevResource).toHaveBeenCalledTimes(1)
        const [, input] = createDevResource.mock.calls[0]
        expect(input.name).toBe("WEB-1 · Brand new ticket")
        expect(params).toContain("dev-42")
      })
  )

  it.live("does not create a dev resource for a file-level reference", () =>
    Effect.gen(function* () {
      const createDevResource = vi.fn(() => Effect.succeed("dev-1"))
      const { db } = yield* recordingDb((sql) => {
        if (sql.startsWith("select") && sql.includes("project_index")) {
          return [["org-1"]]
        }
        if (sql.startsWith('insert into "figma_link_index"')) {
          return [["link-1"]]
        }
        return []
      })
      const exit = yield* reconcile(
        harness({ db, figma: { createDevResource } }),
        "https://www.figma.com/design/FILEKEY123/Spec"
      )
      yield* Effect.sleep("100 millis")

      expect(exit._tag).toBe("Success")
      expect(createDevResource).not.toHaveBeenCalled()
    })
  )

  it.effect(
    "does not fail the ticket save when creating a dev resource fails",
    () =>
      Effect.gen(function* () {
        const { db } = yield* proxyDb((sql) =>
          sql.startsWith("select") && sql.includes("project_index")
            ? [["org-1"]]
            : sql.startsWith('insert into "figma_link_index"')
              ? [["link-1"]]
              : []
        )
        const exit = yield* reconcile(
          harness({
            db,
            figma: {
              createDevResource: () => Effect.fail(new FigmaAuthInvalid())
            }
          }),
          BODY
        )
        expect(exit._tag).toBe("Success")
      })
  )

  it.live(
    "deletes the figma dev resource before removing the reference row",
    () =>
      Effect.gen(function* () {
        const order: Array<string> = []
        const deleteDevResource = vi.fn(() => {
          order.push("figma-delete")
          return Effect.void
        })
        const { db } = yield* recordingDb((sql) => {
          if (sql.includes(JOINED)) {
            return referencedLink({
              fetchedAt: null,
              lastCheckStatus: null,
              devResourceId: "dev-1"
            })
          }
          if (sql.startsWith('delete from "figma_reference"')) {
            order.push("db-delete")
          }
          return []
        })
        const exit = yield* reconcile(
          harness({ db, figma: { deleteDevResource } }),
          ""
        )
        yield* Effect.sleep("100 millis")

        expect(exit._tag).toBe("Success")
        expect(deleteDevResource).toHaveBeenCalledWith(
          expect.anything(),
          "FILEKEY123",
          "dev-1"
        )
        expect(order).toEqual(["figma-delete", "db-delete"])
      })
  )

  it.live(
    "retracts a dev resource created after its reference was removed",
    () =>
      Effect.gen(function* () {
        const creationStarted = yield* Deferred.make<void>()
        const finishCreation = yield* Deferred.make<void>()
        let referenceExists = true
        const createDevResource = vi.fn(() =>
          Deferred.succeed(creationStarted, undefined).pipe(
            Effect.andThen(Deferred.await(finishCreation)),
            Effect.as("dev-race")
          )
        )
        const deleteDevResource = vi.fn(() => Effect.void)
        const fetchedAt = DateTime.formatIso(yield* DateTime.now)
        const { db } = yield* recordingDb((sql) => {
          if (sql.includes(JOINED)) {
            return referenceExists
              ? referencedLink({
                  fetchedAt,
                  lastCheckStatus: "ok",
                  devResourceId: null
                })
              : []
          }
          if (sql.startsWith('delete from "figma_reference"')) {
            referenceExists = false
            return []
          }
          if (sql.startsWith('update "figma_reference"')) {
            return referenceExists ? [["link-1"]] : []
          }
          return []
        })
        const layer = harness({
          db,
          figma: { createDevResource, deleteDevResource }
        })

        yield* reconcile(layer, BODY)
        yield* Deferred.await(creationStarted)
        yield* reconcile(layer, "")
        yield* Deferred.succeed(finishCreation, undefined)
        yield* Effect.sleep("100 millis")

        expect(deleteDevResource).toHaveBeenCalledWith(
          expect.anything(),
          "FILEKEY123",
          "dev-race"
        )
      })
  )
})

const viewerAs = (orgRole: OrgRole, role: Role | null) =>
  projectScope(orgRole, role, { orgSlug: "acme", slug: "web" })

describe("resolveThumbnailUrl", () => {
  const resolve = (layer: Layer.Layer<FigmaLinks.FigmaLinks>) =>
    FigmaLinks.FigmaLinks.pipe(
      Effect.flatMap((links) =>
        Effect.exit(links.resolveThumbnailUrl("acme", "link-1"))
      ),
      Effect.provide(layer),
      Effect.provideService(CurrentUser, testUser("user-1"))
    )

  it.effect.each([
    ["a developer", viewerAs("member", "developer")],
    ["a client", viewerAs("guest", "client")],
    ["an org admin without a project role", viewerAs("admin", null)]
  ] as const)("gives %s a freshly signed thumbnail URL", ([, viewer]) =>
    Effect.gen(function* () {
      const { db } = yield* proxyDb((sql) =>
        sql.includes('from "figma_link_index"')
          ? [["thumb-key.png", "web"]]
          : []
      )
      const exit = yield* resolve(
        harness({
          db,
          viewer,
          storage: Effect.succeed({
            endpoint: "https://storage.example.test",
            bucket: "figma",
            region: "auto",
            keyPrefix: null,
            forcePathStyle: true,
            accessKeyId: "key",
            secretAccessKey: "secret"
          })
        })
      )
      assertTrue(Exit.isSuccess(exit))
      expect(exit.value).toBe("https://signed.example/get")
    })
  )

  it.effect(
    "hides the thumbnail from anyone without access to a referencing project",
    () =>
      Effect.gen(function* () {
        const { db } = yield* proxyDb((sql) =>
          sql.includes('from "figma_link_index"')
            ? [["thumb-key.png", "web"]]
            : []
        )
        const exit = yield* resolve(harness({ db }))
        assertTrue(Exit.isFailure(exit))
        expect(exit.cause.toString()).toContain("NotFound")
      })
  )

  it.effect("404s cleanly when the link has no cached thumbnail yet", () =>
    Effect.gen(function* () {
      const { db } = yield* proxyDb((sql) =>
        sql.includes('from "figma_link_index"') ? [[null, "web"]] : []
      )
      const exit = yield* resolve(
        harness({ db, viewer: viewerAs("member", "developer") })
      )
      assertTrue(Exit.isFailure(exit))
      expect(exit.cause.toString()).toContain("NotFound")
    })
  )

  it.effect(
    "treats a disconnected org storage as a normal state, not a server error",
    () =>
      Effect.gen(function* () {
        const { db } = yield* proxyDb((sql) =>
          sql.includes('from "figma_link_index"')
            ? [["thumb-key.png", "web"]]
            : []
        )
        const exit = yield* resolve(
          harness({
            db,
            viewer: viewerAs("member", "developer"),
            storage: Effect.fail(new StorageNotConnected())
          })
        )
        assertTrue(Exit.isFailure(exit))
        expect(exit.cause.toString()).toContain("StorageNotConnected")
      })
  )
})

describe("FigmaLinks tracing", () => {
  it.effect("traces each call under its FigmaLinks span", () =>
    Effect.gen(function* () {
      const spans: Array<Tracer.NativeSpan> = []
      const tracer = Tracer.make({
        span: (options) => {
          const span = new Tracer.NativeSpan(options)
          spans.push(span)
          return span
        }
      })
      const { db } = yield* emptyDb()

      yield* Effect.gen(function* () {
        const links = yield* FigmaLinks.FigmaLinks
        yield* links.reconcileTicket(
          "acme",
          "web",
          "WEB-1",
          "Fix login bug",
          "no links here"
        )
        yield* links.listForTicket("WEB-1").pipe(
          Effect.provideService(
            ProjectScope,
            projectScope("member", "developer", {
              orgSlug: "acme",
              slug: "web"
            })
          )
        )
        yield* Effect.exit(links.resolveThumbnailUrl("acme", "link-1"))
      }).pipe(
        Effect.provide(harness({ db })),
        Effect.provideService(CurrentUser, testUser("user-1")),
        Effect.withTracer(tracer)
      )

      expect(
        spans
          .filter((span) => span.name.startsWith("FigmaLinks."))
          .map((span) => ({
            name: span.name,
            parent: Option.match(span.parent, {
              onNone: () => null,
              onSome: (parent) => (parent._tag === "Span" ? parent.name : null)
            })
          }))
      ).toEqual([
        { name: "FigmaLinks.reconcileTicket", parent: null },
        { name: "FigmaLinks.listForTicket", parent: null },
        { name: "FigmaLinks.resolveThumbnailUrl", parent: null }
      ])
    })
  )
})

describe("FigmaLinks background tracing", () => {
  it.live(
    "runs the detached metadata resolution under the reconcileTicket span",
    () =>
      Effect.gen(function* () {
        const parents: Array<string> = []
        const getFile = () =>
          Effect.currentSpan.pipe(
            Effect.map((span) => span.name),
            Effect.orElseSucceed(() => "none"),
            Effect.flatMap((name) => {
              parents.push(name)
              return Effect.fail(new FigmaAuthInvalid())
            })
          )
        const { db } = yield* recordingDb((sql) =>
          sql.includes(JOINED)
            ? referencedLink({ fetchedAt: null, lastCheckStatus: null })
            : []
        )

        yield* reconcile(harness({ db, figma: { getFile } }), BODY)
        yield* Effect.sleep("100 millis")

        expect(parents).toEqual(["FigmaLinks.reconcileTicket"])
      })
  )
})
