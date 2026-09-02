import { describe, expect, it } from "vitest"
import { ATTACHMENT_MAX_BYTES } from "@projectproject/shared"
import {
  isServableStatus,
  ORPHAN_GRACE_MS,
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
