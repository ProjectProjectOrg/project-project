import { describe, expect, it } from "vitest"
import { orgAttachmentsKey, splitOrgAttachmentsKey } from "./orgAttachmentsKey"

describe("orgAttachmentsKey", () => {
  it("round-trips a bare query", () => {
    const query = { orgSlug: "acme", pages: 1 }
    expect(splitOrgAttachmentsKey(orgAttachmentsKey(query))).toEqual(query)
  })

  it("round-trips every filter", () => {
    const query = {
      orgSlug: "acme",
      status: "orphaned" as const,
      projectSlug: "apollo",
      sort: "size_desc" as const,
      pages: 3
    }
    expect(splitOrgAttachmentsKey(orgAttachmentsKey(query))).toEqual(query)
  })

  it("keys two different filters apart, so one view cannot serve the other", () => {
    expect(
      orgAttachmentsKey({ orgSlug: "acme", status: "live", pages: 1 })
    ).not.toBe(
      orgAttachmentsKey({ orgSlug: "acme", status: "orphaned", pages: 1 })
    )
  })

  it("keys a project filter apart from no project filter", () => {
    expect(
      orgAttachmentsKey({ orgSlug: "acme", projectSlug: "apollo", pages: 1 })
    ).not.toBe(orgAttachmentsKey({ orgSlug: "acme", pages: 1 }))
  })
})
