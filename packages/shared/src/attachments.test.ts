import { describe, expect, it } from "vitest"
import {
  attachmentUrl,
  extractAttachmentRefs,
  parseAttachmentUrl
} from "./attachments"
import {
  isAllowedAttachmentContentType,
  isRasterImageContentType
} from "./schemas/Attachment"

const ID = "01JBX7Q2K9ZWCVE8MTQ4RXPGHN"

describe("attachmentUrl", () => {
  it("builds an app-relative url", () => {
    expect(attachmentUrl("acme", ID)).toBe(`/api/attachments/acme/${ID}`)
  })

  it("round-trips through parseAttachmentUrl", () => {
    expect(parseAttachmentUrl(attachmentUrl("acme", ID))).toEqual({
      orgSlug: "acme",
      id: ID
    })
  })
})

describe("parseAttachmentUrl", () => {
  it("rejects an absolute url", () => {
    expect(parseAttachmentUrl(`https://evil.test/api/attachments/acme/${ID}`))
      .toBeNull()
  })

  it("rejects a missing segment", () => {
    expect(parseAttachmentUrl(`/api/attachments/${ID}`)).toBeNull()
  })

  it("rejects a trailing segment", () => {
    expect(parseAttachmentUrl(`/api/attachments/acme/${ID}/raw`)).toBeNull()
  })

  it("rejects a non-ulid id", () => {
    expect(parseAttachmentUrl("/api/attachments/acme/not-a-ulid")).toBeNull()
  })

  it("rejects a path-traversal id", () => {
    expect(parseAttachmentUrl("/api/attachments/acme/..%2f..%2fetc")).toBeNull()
  })
})

describe("extractAttachmentRefs", () => {
  it("finds an image reference", () => {
    const md = `# Title\n\n![shot](/api/attachments/acme/${ID})\n`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("finds a plain link reference", () => {
    const md = `[report.pdf](/api/attachments/acme/${ID})`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("deduplicates a reference used twice", () => {
    const md = `![a](/api/attachments/acme/${ID}) and ![b](/api/attachments/acme/${ID})`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("ignores mention links and external images", () => {
    const md =
      "[T-1](mention:ticket/T-1) ![x](https://example.test/a.png) ![y](/api/other/acme/x)"
    expect(extractAttachmentRefs(md)).toEqual([])
  })

  it("returns an empty array for markdown with no attachments", () => {
    expect(extractAttachmentRefs("just text")).toEqual([])
  })
})

describe("isAllowedAttachmentContentType", () => {
  it("allows png", () => {
    expect(isAllowedAttachmentContentType("image/png")).toBe(true)
  })

  it("allows pdf", () => {
    expect(isAllowedAttachmentContentType("application/pdf")).toBe(true)
  })

  it("rejects svg", () => {
    expect(isAllowedAttachmentContentType("image/svg+xml")).toBe(false)
  })

  it("rejects an executable", () => {
    expect(isAllowedAttachmentContentType("application/x-msdownload")).toBe(
      false
    )
  })

  it("normalizes case and parameters", () => {
    expect(isAllowedAttachmentContentType("IMAGE/PNG; charset=binary")).toBe(
      true
    )
  })
})

describe("isRasterImageContentType", () => {
  it("treats png as raster", () => {
    expect(isRasterImageContentType("image/png")).toBe(true)
  })

  it("does not treat pdf as raster", () => {
    expect(isRasterImageContentType("application/pdf")).toBe(false)
  })
})
