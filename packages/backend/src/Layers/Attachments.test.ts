import { it } from "@effect/vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { describe, expect } from "vitest"
import {
  ATTACHMENT_MAX_BYTES,
  decodeCursor,
  encodeCursor,
  NotFound,
  type Role
} from "@projectproject/shared"
import { Attachments } from "../Services/Attachments"
import { CurrentOrg } from "../Services/CurrentOrg"
import { Db } from "../Services/Db"
import { OrgStorage } from "../Services/OrgStorage"
import { Projects } from "../Services/Projects"
import { S3Storage } from "../Services/S3Storage"
import { AttachmentsLive } from "./Attachments"

const at = (iso: string) => DateTime.toDate(DateTime.unsafeMake(iso))
import {
  attachmentCursorBound,
  attachmentCursorValue,
  attachmentSortPlan,
  isServableStatus,
  planAttachmentPage,
  ORPHAN_GRACE_MS,
  planDeletion,
  planReap,
  planReconciliation,
  validateUploadRequest
} from "../Services/Attachments"

describe("validateUploadRequest", () => {
  it("accepts an allowed type within the cap", () => {
    expect(
      validateUploadRequest({ contentType: "image/png", byteSize: 1024 })
    ).toBeNull()
  })

  it("rejects svg", () => {
    expect(
      validateUploadRequest({ contentType: "image/svg+xml", byteSize: 1024 })
    ).toEqual({ kind: "type", contentType: "image/svg+xml" })
  })

  it("rejects an executable", () => {
    expect(
      validateUploadRequest({
        contentType: "application/x-msdownload",
        byteSize: 1024
      })
    ).toEqual({ kind: "type", contentType: "application/x-msdownload" })
  })

  it("rejects a file over the cap", () => {
    expect(
      validateUploadRequest({
        contentType: "image/png",
        byteSize: ATTACHMENT_MAX_BYTES + 1
      })
    ).toEqual({ kind: "size", maxBytes: ATTACHMENT_MAX_BYTES })
  })

  it("accepts a file exactly at the cap", () => {
    expect(
      validateUploadRequest({
        contentType: "image/png",
        byteSize: ATTACHMENT_MAX_BYTES
      })
    ).toBeNull()
  })

  it("rejects a zero-byte file", () => {
    expect(
      validateUploadRequest({ contentType: "image/png", byteSize: 0 })
    ).toEqual({ kind: "size", maxBytes: ATTACHMENT_MAX_BYTES })
  })

  it("checks the type before the size", () => {
    expect(
      validateUploadRequest({
        contentType: "image/svg+xml",
        byteSize: ATTACHMENT_MAX_BYTES + 1
      })
    ).toEqual({ kind: "type", contentType: "image/svg+xml" })
  })

  it("tolerates a content type with parameters", () => {
    expect(
      validateUploadRequest({
        contentType: "image/png; charset=binary",
        byteSize: 10
      })
    ).toBeNull()
  })
})

describe("planReconciliation", () => {
  const TICKET = "T-1"
  const OTHER_TICKET = "T-2"

  it("orphans a live row the body no longer references", () => {
    const plan = planReconciliation({
      ticketId: TICKET,
      referenced: new Set(["a"]),
      rows: [
        { id: "a", ticketId: TICKET, status: "live" },
        { id: "b", ticketId: TICKET, status: "live" }
      ]
    })
    expect(plan.toOrphan).toEqual(["b"])
    expect(plan.toRestore).toEqual([])
  })

  it("restores an orphaned row the body references again", () => {
    const plan = planReconciliation({
      ticketId: TICKET,
      referenced: new Set(["a"]),
      rows: [{ id: "a", ticketId: TICKET, status: "orphaned" }]
    })
    expect(plan.toRestore).toEqual(["a"])
    expect(plan.toOrphan).toEqual([])
  })

  it("leaves pending rows alone", () => {
    const plan = planReconciliation({
      ticketId: TICKET,
      referenced: new Set(),
      rows: [{ id: "a", ticketId: TICKET, status: "pending" }]
    })
    expect(plan.toOrphan).toEqual([])
    expect(plan.toRestore).toEqual([])
  })

  it("is a no-op when everything is referenced", () => {
    const plan = planReconciliation({
      ticketId: TICKET,
      referenced: new Set(["a", "b"]),
      rows: [
        { id: "a", ticketId: TICKET, status: "live" },
        { id: "b", ticketId: TICKET, status: "live" }
      ]
    })
    expect(plan.toOrphan).toEqual([])
    expect(plan.toRestore).toEqual([])
  })

  it("ignores a referenced id with no row", () => {
    const plan = planReconciliation({
      ticketId: TICKET,
      referenced: new Set(["ghost"]),
      rows: [{ id: "a", ticketId: TICKET, status: "live" }]
    })
    expect(plan.toOrphan).toEqual(["a"])
    expect(plan.toRestore).toEqual([])
  })

  it("restores an orphaned row owned by another ticket that this body references", () => {
    const plan = planReconciliation({
      ticketId: TICKET,
      referenced: new Set(["a"]),
      rows: [{ id: "a", ticketId: OTHER_TICKET, status: "orphaned" }]
    })
    expect(plan.toRestore).toEqual(["a"])
    expect(plan.toOrphan).toEqual([])
  })

  it("does not orphan another ticket's live row that this body does not reference", () => {
    const plan = planReconciliation({
      ticketId: TICKET,
      referenced: new Set(),
      rows: [{ id: "a", ticketId: OTHER_TICKET, status: "live" }]
    })
    expect(plan.toOrphan).toEqual([])
    expect(plan.toRestore).toEqual([])
  })

  it("restores a referenced pending row so the reaper cannot delete a referenced object", () => {
    const plan = planReconciliation({
      ticketId: TICKET,
      referenced: new Set(["a"]),
      rows: [{ id: "a", ticketId: TICKET, status: "pending" }]
    })
    expect(plan.toRestore).toEqual(["a"])
    expect(plan.toOrphan).toEqual([])
  })

  it("plans each row once when a referenced row appears in both scopes", () => {
    const plan = planReconciliation({
      ticketId: TICKET,
      referenced: new Set(["a"]),
      rows: [
        { id: "a", ticketId: TICKET, status: "orphaned" },
        { id: "a", ticketId: TICKET, status: "orphaned" }
      ]
    })
    expect(plan.toRestore).toEqual(["a"])
  })
})

describe("planReap", () => {
  const now = Date.UTC(2026, 8, 2)

  it("reaps a pending row past its ttl", () => {
    expect(
      planReap({
        now,
        rows: [
          {
            id: "a",
            status: "pending",
            // @effect-diagnostics-next-line globalDate:off
            createdAt: new Date(now - 2 * 60 * 60 * 1000),
            orphanedAt: null
          }
        ]
      })
    ).toEqual(["a"])
  })

  it("spares a pending row inside its ttl", () => {
    expect(
      planReap({
        now,
        rows: [
          {
            id: "a",
            status: "pending",
            // @effect-diagnostics-next-line globalDate:off
            createdAt: new Date(now - 60 * 1000),
            orphanedAt: null
          }
        ]
      })
    ).toEqual([])
  })

  it("reaps an orphaned row past the grace period", () => {
    expect(
      planReap({
        now,
        rows: [
          {
            id: "a",
            status: "orphaned",
            // @effect-diagnostics-next-line globalDate:off
            createdAt: new Date(now - ORPHAN_GRACE_MS * 2),
            // @effect-diagnostics-next-line globalDate:off
            orphanedAt: new Date(now - ORPHAN_GRACE_MS - 1000)
          }
        ]
      })
    ).toEqual(["a"])
  })

  it("spares an orphaned row inside the grace period", () => {
    expect(
      planReap({
        now,
        rows: [
          {
            id: "a",
            status: "orphaned",
            // @effect-diagnostics-next-line globalDate:off
            createdAt: new Date(now - ORPHAN_GRACE_MS * 2),
            // @effect-diagnostics-next-line globalDate:off
            orphanedAt: new Date(now - 1000)
          }
        ]
      })
    ).toEqual([])
  })

  it("never reaps a live row", () => {
    expect(
      planReap({
        now,
        rows: [
          {
            id: "a",
            status: "live",
            // @effect-diagnostics-next-line globalDate:off
            createdAt: new Date(now - ORPHAN_GRACE_MS * 10),
            orphanedAt: null
          }
        ]
      })
    ).toEqual([])
  })

  it("spares an orphaned row with a null orphanedAt", () => {
    expect(
      planReap({
        now,
        rows: [
          {
            id: "a",
            status: "orphaned",
            // @effect-diagnostics-next-line globalDate:off
            createdAt: new Date(now - ORPHAN_GRACE_MS * 10),
            orphanedAt: null
          }
        ]
      })
    ).toEqual([])
  })
})

describe("isServableStatus", () => {
  it("serves a live attachment", () => {
    expect(isServableStatus("live")).toBe(true)
  })

  it("serves an orphaned attachment, so undoing a removal shows the image again rather than a load error", () => {
    expect(isServableStatus("orphaned")).toBe(true)
  })

  it("refuses a pending attachment, whose object may not exist yet", () => {
    expect(isServableStatus("pending")).toBe(false)
  })
})

describe("planDeletion", () => {
  it("allows deleting an orphaned attachment", () => {
    expect(planDeletion({ status: "orphaned" })).toBeNull()
  })

  it("refuses a live attachment, whose ticket description still renders it", () => {
    expect(planDeletion({ status: "live" })).toEqual({ kind: "live" })
  })

  it("refuses a pending attachment, whose upload may still be in flight", () => {
    expect(planDeletion({ status: "pending" })).toEqual({ kind: "pending" })
  })
})

describe("attachmentSortPlan", () => {
  it("sorts newest first by default", () => {
    expect(attachmentSortPlan(undefined)).toEqual({
      column: "createdAt",
      direction: "desc"
    })
  })

  it("sorts oldest first", () => {
    expect(attachmentSortPlan("created_asc")).toEqual({
      column: "createdAt",
      direction: "asc"
    })
  })

  it("sorts biggest first, so the bucket hogs surface at the top", () => {
    expect(attachmentSortPlan("size_desc")).toEqual({
      column: "byteSize",
      direction: "desc"
    })
  })

  it("sorts smallest first", () => {
    expect(attachmentSortPlan("size_asc")).toEqual({
      column: "byteSize",
      direction: "asc"
    })
  })
})

describe("attachmentCursorValue", () => {
  const row = {
    createdAt: at("2026-09-02T10:00:00.000Z"),
    byteSize: 4096
  }

  it("carries the created date when paging a date sort", () => {
    expect(attachmentCursorValue(row, "created_desc")).toBe(
      "2026-09-02T10:00:00.000Z"
    )
  })

  it("carries the byte size when paging a size sort", () => {
    expect(attachmentCursorValue(row, "size_asc")).toBe("4096")
  })

  it("reads the column the sort plan actually orders by", () => {
    for (const sort of [
      "created_desc",
      "created_asc",
      "size_desc",
      "size_asc"
    ] as const) {
      const expected =
        attachmentSortPlan(sort).column === "byteSize"
          ? String(row.byteSize)
          : row.createdAt.toISOString()
      expect(attachmentCursorValue(row, sort)).toBe(expected)
    }
  })
})

const servingRow = {
  id: "att-1",
  organizationId: "org-1",
  orgSlug: "acme",
  projectSlug: "apollo",
  ticketId: "T-1",
  objectKey: "orgs/acme/projects/apollo/tickets/T-1/att-1-shot.png",
  filename: "shot.png",
  contentType: "image/png",
  byteSize: 1024,
  status: "live" as const,
  uploadedBy: "user-2",
  createdAt: at("2026-09-02T10:00:00.000Z"),
  committedAt: at("2026-09-02T10:00:01.000Z"),
  orphanedAt: null
}

const servingDb = Layer.succeed(Db, {
  select: () => ({
    from: () => ({
      where: () => ({ limit: () => Effect.succeed([servingRow]) })
    })
  })
} as never)

const connection = {
  endpoint: "https://acct.r2.cloudflarestorage.com",
  bucket: "pp",
  region: "auto",
  keyPrefix: null,
  forcePathStyle: true,
  accessKeyId: "key",
  secretAccessKey: "secret"
}

const stubOrgStorage = Layer.succeed(OrgStorage, {
  requireConnection: () => Effect.succeed(connection)
} as never)

const stubS3 = Layer.succeed(S3Storage, {
  presignGet: () => Effect.succeed("https://signed.example/shot.png")
} as never)

const nonMemberProjects = Layer.succeed(Projects, {
  requireMember: () => Effect.fail(new NotFound())
} as never)

const stubCurrentOrg = (role: Role) =>
  Layer.succeed(CurrentOrg, {
    resolve: () =>
      Effect.succeed({ organizationId: "org-1", orgSlug: "acme", role })
  } as never)

const servingLayer = (role: Role) =>
  AttachmentsLive.pipe(
    Layer.provide(servingDb),
    Layer.provide(stubOrgStorage),
    Layer.provide(stubS3),
    Layer.provide(nonMemberProjects),
    Layer.provide(stubCurrentOrg(role))
  )

const resolveAs = (role: Role) =>
  Attachments.pipe(
    Effect.flatMap((attachments) =>
      Effect.either(attachments.resolveForServing("acme", "att-1", "user-1"))
    ),
    Effect.provide(servingLayer(role))
  )

describe("resolveForServing beyond project membership", () => {
  it.effect(
    "serves an org owner who is not a member of the owning project, so the admin attachments browser can render thumbnails",
    () =>
      Effect.gen(function* () {
        const result = yield* resolveAs("owner")
        expect(result._tag).toBe("Right")
      })
  )

  it.effect("serves an org admin who is not a project member", () =>
    Effect.gen(function* () {
      const result = yield* resolveAs("admin")
      expect(result._tag).toBe("Right")
    })
  )

  it.effect("refuses a plain member who is not on the owning project", () =>
    Effect.gen(function* () {
      const result = yield* resolveAs("member")
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("Forbidden")
      }
    })
  )
})

const deletionHarness = (input: {
  readonly status: "pending" | "live" | "orphaned"
  readonly role: Role
}) => {
  const deletedKeys: Array<string> = []
  const deletedRows: Array<unknown> = []
  const layer = AttachmentsLive.pipe(
    Layer.provide(
      Layer.succeed(Db, {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () =>
                Effect.succeed([{ ...servingRow, status: input.status }])
            })
          })
        }),
        delete: () => ({
          where: (cond: unknown) => {
            deletedRows.push(cond)
            return Effect.succeed(undefined)
          }
        })
      } as never)
    ),
    Layer.provide(stubOrgStorage),
    Layer.provide(
      Layer.succeed(S3Storage, {
        deleteObject: (_: unknown, key: string) => {
          deletedKeys.push(key)
          return Effect.void
        }
      } as never)
    ),
    Layer.provide(nonMemberProjects),
    Layer.provide(stubCurrentOrg(input.role))
  )
  const run = Attachments.pipe(
    Effect.flatMap((attachments) =>
      Effect.either(attachments.deleteForOrg("acme", "att-1", "user-1"))
    ),
    Effect.provide(layer)
  )
  return { run, deletedKeys, deletedRows }
}

describe("deleteForOrg", () => {
  it.effect("deletes the object and the row for an orphaned attachment", () =>
    Effect.gen(function* () {
      const harness = deletionHarness({ status: "orphaned", role: "owner" })
      const result = yield* harness.run
      expect(result._tag).toBe("Right")
      expect(harness.deletedKeys).toEqual([servingRow.objectKey])
      expect(harness.deletedRows).toHaveLength(1)
    })
  )

  it.effect("refuses a live attachment and leaves the object in place", () =>
    Effect.gen(function* () {
      const harness = deletionHarness({ status: "live", role: "owner" })
      const result = yield* harness.run
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") expect(result.left._tag).toBe("Forbidden")
      expect(harness.deletedKeys).toEqual([])
      expect(harness.deletedRows).toEqual([])
    })
  )

  it.effect("refuses a pending attachment whose upload may still land", () =>
    Effect.gen(function* () {
      const harness = deletionHarness({ status: "pending", role: "owner" })
      const result = yield* harness.run
      expect(result._tag).toBe("Left")
      expect(harness.deletedKeys).toEqual([])
    })
  )

  it.effect("refuses a plain member, even for an orphaned attachment", () =>
    Effect.gen(function* () {
      const harness = deletionHarness({ status: "orphaned", role: "member" })
      const result = yield* harness.run
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") expect(result.left._tag).toBe("Forbidden")
      expect(harness.deletedKeys).toEqual([])
    })
  )
})

describe("attachmentCursorBound", () => {
  const row = {
    id: "a",
    byteSize: 4096,
    createdAt: at("2026-09-02T10:00:00.000Z")
  }

  it("round-trips a date sort back to the value the column holds", () => {
    const cursor = decodeCursor(
      encodeCursor({
        id: row.id,
        sort: attachmentCursorValue(row, "created_desc")
      })
    )
    expect(attachmentCursorBound(cursor, "created_desc")).toEqual(row.createdAt)
  })

  it("refuses a cursor whose date the sort cannot read", () => {
    expect(
      attachmentCursorBound({ id: "a", sort: "nonsense" }, "created_desc")
    ).toBeNull()
  })

  it("round-trips a size sort back to a number", () => {
    const cursor = decodeCursor(
      encodeCursor({ id: row.id, sort: attachmentCursorValue(row, "size_asc") })
    )
    expect(attachmentCursorBound(cursor, "size_asc")).toBe(row.byteSize)
  })
})

describe("planAttachmentPage", () => {
  const rows = [
    { id: "a", byteSize: 100, createdAt: at("2026-09-03T00:00:00.000Z") },
    { id: "b", byteSize: 200, createdAt: at("2026-09-02T00:00:00.000Z") },
    { id: "c", byteSize: 300, createdAt: at("2026-09-01T00:00:00.000Z") }
  ]

  it("returns every row and no cursor when the page is not full", () => {
    const page = planAttachmentPage({
      rows,
      limit: 10,
      sort: "created_desc"
    })
    expect(page.rows).toEqual(rows)
    expect(page.nextCursor).toBeNull()
  })

  it("trims the probe row when more rows exist than the limit", () => {
    const page = planAttachmentPage({ rows, limit: 2, sort: "created_desc" })
    expect(page.rows.map((r) => r.id)).toEqual(["a", "b"])
  })

  it("points the cursor at the last returned row, not the probe row", () => {
    const page = planAttachmentPage({ rows, limit: 2, sort: "created_desc" })
    expect(page.nextCursor).not.toBeNull()
    expect(decodeCursor(page.nextCursor!)).toEqual({
      id: "b",
      sort: "2026-09-02T00:00:00.000Z"
    })
  })

  it("carries the byte size in the cursor when paging a size sort", () => {
    const page = planAttachmentPage({ rows, limit: 2, sort: "size_asc" })
    expect(decodeCursor(page.nextCursor!)).toEqual({ id: "b", sort: "200" })
  })

  it("returns no cursor for an empty page", () => {
    const page = planAttachmentPage({ rows: [], limit: 10, sort: undefined })
    expect(page.rows).toEqual([])
    expect(page.nextCursor).toBeNull()
  })
})

const dialect = new PgDialect()
const sqlOf = (cond: unknown) => dialect.sqlToQuery(cond as never).sql

const listHarness = (input: {
  readonly role: Role
  readonly rows?: ReadonlyArray<unknown>
}) => {
  const capture: { where?: unknown; limit?: number; groupBy?: unknown } = {}
  const layer = AttachmentsLive.pipe(
    Layer.provide(
      Layer.succeed(Db, {
        select: () => ({
          from: () => ({
            where: (cond: unknown) => {
              capture.where = cond
              return {
                orderBy: () => ({
                  limit: (n: number) => {
                    capture.limit = n
                    return Effect.succeed(input.rows ?? [])
                  }
                }),
                groupBy: (cond2: unknown) => {
                  capture.groupBy = cond2
                  return Effect.succeed(input.rows ?? [])
                }
              }
            }
          })
        })
      } as never)
    ),
    Layer.provide(stubOrgStorage),
    Layer.provide(stubS3),
    Layer.provide(nonMemberProjects),
    Layer.provide(stubCurrentOrg(input.role))
  )
  return { capture, layer }
}

describe("listForOrg", () => {
  it.effect("refuses a plain member", () =>
    Effect.gen(function* () {
      const { layer } = listHarness({ role: "member" })
      const result = yield* Attachments.pipe(
        Effect.flatMap((a) =>
          Effect.either(a.listForOrg("acme", "user-1", {}))
        ),
        Effect.provide(layer)
      )
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") expect(result.left._tag).toBe("Forbidden")
    })
  )

  it.effect("scopes the query to the org", () =>
    Effect.gen(function* () {
      const { layer, capture } = listHarness({ role: "owner" })
      yield* Attachments.pipe(
        Effect.flatMap((a) => a.listForOrg("acme", "user-1", {})),
        Effect.provide(layer)
      )
      expect(sqlOf(capture.where)).toContain("org_slug")
    })
  )

  it.effect("narrows to a status and a project when both are filtered", () =>
    Effect.gen(function* () {
      const { layer, capture } = listHarness({ role: "owner" })
      yield* Attachments.pipe(
        Effect.flatMap((a) =>
          a.listForOrg("acme", "user-1", {
            status: "orphaned",
            projectSlug: "apollo"
          })
        ),
        Effect.provide(layer)
      )
      const where = sqlOf(capture.where)
      expect(where).toContain("status")
      expect(where).toContain("project_slug")
    })
  )

  it.effect("fetches one row past the limit to detect a next page", () =>
    Effect.gen(function* () {
      const { layer, capture } = listHarness({ role: "owner" })
      yield* Attachments.pipe(
        Effect.flatMap((a) => a.listForOrg("acme", "user-1", { limit: 20 })),
        Effect.provide(layer)
      )
      expect(capture.limit).toBe(21)
    })
  )

  it.effect(
    "rejects a malformed cursor rather than silently paging again",
    () =>
      Effect.gen(function* () {
        const { layer } = listHarness({ role: "owner" })
        const result = yield* Attachments.pipe(
          Effect.flatMap((a) =>
            Effect.either(
              a.listForOrg("acme", "user-1", { cursor: "not-a-cursor" })
            )
          ),
          Effect.provide(layer)
        )
        expect(result._tag).toBe("Left")
        if (result._tag === "Left") expect(result.left._tag).toBe("Validation")
      })
  )

  it.effect("returns rows shaped for the browser table", () =>
    Effect.gen(function* () {
      const { layer } = listHarness({ role: "owner", rows: [servingRow] })
      const page = yield* Attachments.pipe(
        Effect.flatMap((a) => a.listForOrg("acme", "user-1", {})),
        Effect.provide(layer)
      )
      expect(page.nextCursor).toBeNull()
      expect(page.items[0]).toMatchObject({
        id: "att-1",
        projectSlug: "apollo",
        ticketId: "T-1",
        filename: "shot.png",
        status: "live"
      })
    })
  )
})

describe("summarizeForOrg", () => {
  it.effect("refuses a plain member", () =>
    Effect.gen(function* () {
      const { layer } = listHarness({ role: "member" })
      const result = yield* Attachments.pipe(
        Effect.flatMap((a) =>
          Effect.either(a.summarizeForOrg("acme", "user-1"))
        ),
        Effect.provide(layer)
      )
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") expect(result.left._tag).toBe("Forbidden")
    })
  )

  it.effect("totals count and bytes across the statuses", () =>
    Effect.gen(function* () {
      const { layer } = listHarness({
        role: "owner",
        rows: [
          { status: "live", count: 3, bytes: 300 },
          { status: "orphaned", count: 2, bytes: 200 }
        ]
      })
      const summary = yield* Attachments.pipe(
        Effect.flatMap((a) => a.summarizeForOrg("acme", "user-1")),
        Effect.provide(layer)
      )
      expect(summary.count).toBe(5)
      expect(summary.bytes).toBe(500)
      expect(summary.byStatus).toEqual([
        { status: "live", count: 3, bytes: 300 },
        { status: "orphaned", count: 2, bytes: 200 }
      ])
    })
  )
})
