import { describe, expect, it } from "vitest"
import { ATTACHMENT_MAX_BYTES } from "@projectproject/shared"
import { validateUploadRequest } from "../Services/Attachments"
import {
  ORPHAN_GRACE_MS,
  planReap,
  planReconciliation
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
  it("orphans a live row the body no longer references", () => {
    const plan = planReconciliation({
      referenced: new Set(["a"]),
      rows: [
        { id: "a", status: "live" },
        { id: "b", status: "live" }
      ]
    })
    expect(plan.toOrphan).toEqual(["b"])
    expect(plan.toRestore).toEqual([])
  })

  it("restores an orphaned row the body references again", () => {
    const plan = planReconciliation({
      referenced: new Set(["a"]),
      rows: [{ id: "a", status: "orphaned" }]
    })
    expect(plan.toRestore).toEqual(["a"])
    expect(plan.toOrphan).toEqual([])
  })

  it("leaves pending rows alone", () => {
    const plan = planReconciliation({
      referenced: new Set(),
      rows: [{ id: "a", status: "pending" }]
    })
    expect(plan.toOrphan).toEqual([])
    expect(plan.toRestore).toEqual([])
  })

  it("is a no-op when everything is referenced", () => {
    const plan = planReconciliation({
      referenced: new Set(["a", "b"]),
      rows: [
        { id: "a", status: "live" },
        { id: "b", status: "live" }
      ]
    })
    expect(plan.toOrphan).toEqual([])
    expect(plan.toRestore).toEqual([])
  })

  it("ignores a referenced id with no row", () => {
    const plan = planReconciliation({
      referenced: new Set(["ghost"]),
      rows: [{ id: "a", status: "live" }]
    })
    expect(plan.toOrphan).toEqual(["a"])
    expect(plan.toRestore).toEqual([])
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
