import { describe, expect, it } from "vitest"
import {
  attachmentUrl,
  attachmentWidthFromUrl,
  extractAttachmentRefs,
  parseAttachmentUrl,
  withAttachmentWidth
} from "./attachments"
import {
  ATTACHMENT_MIN_WIDTH,
  clampAttachmentWidth,
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
    expect(
      parseAttachmentUrl(`https://evil.test/api/attachments/acme/${ID}`)
    ).toBeNull()
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

describe("extractAttachmentRefs (permissive: false negatives are data loss)", () => {
  it("finds an image reference", () => {
    const md = `# Title\n\n![shot](/api/attachments/acme/${ID})\n`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("finds a plain link reference", () => {
    const md = `[report.pdf](/api/attachments/acme/${ID})`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("finds nested brackets in alt text", () => {
    const md = `![Diagram [v2]](/api/attachments/acme/${ID})`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("finds nested brackets in link text", () => {
    const md = `[report [final].pdf](/api/attachments/acme/${ID})`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("finds a url with query string", () => {
    const md = `![x](/api/attachments/acme/${ID}?v=2)`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("finds a url with fragment", () => {
    const md = `[x](/api/attachments/acme/${ID}#page=3)`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("finds a bare url with no markdown syntax", () => {
    const md = `see /api/attachments/acme/${ID} for details`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("finds a url inside a code fence", () => {
    const md = "```\n/api/attachments/acme/" + ID + "\n```"
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("ignores a non-attachment path", () => {
    const md = `![y](/api/other/acme/${ID})`
    expect(extractAttachmentRefs(md)).toEqual([])
  })

  it("ignores mention links and external images", () => {
    const md =
      "[T-1](mention:ticket/T-1) ![x](https://example.test/a.png) ![y](/api/other/acme/x)"
    expect(extractAttachmentRefs(md)).toEqual([])
  })

  it("deduplicates a reference used twice", () => {
    const md = `![a](/api/attachments/acme/${ID}) and ![b](/api/attachments/acme/${ID})`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("ignores a malformed id", () => {
    const md = `![x](/api/attachments/acme/not-26-chars) ![y](/api/attachments/acme/01JBX7Q2K9ZWCVE8MTQ4RXPGHI)`
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

describe("attachmentWidthFromUrl", () => {
  it("reads an explicit width", () => {
    expect(attachmentWidthFromUrl(`/api/attachments/acme/${ID}?w=420`)).toBe(
      420
    )
  })

  it("returns null with no query", () => {
    expect(attachmentWidthFromUrl(`/api/attachments/acme/${ID}`)).toBeNull()
  })

  it("returns null for a non-numeric width", () => {
    expect(
      attachmentWidthFromUrl(`/api/attachments/acme/${ID}?w=wide`)
    ).toBeNull()
  })

  it("returns null for a zero or negative width", () => {
    expect(attachmentWidthFromUrl(`/api/attachments/acme/${ID}?w=0`)).toBeNull()
    expect(
      attachmentWidthFromUrl(`/api/attachments/acme/${ID}?w=-10`)
    ).toBeNull()
  })

  it("ignores unrelated params", () => {
    expect(attachmentWidthFromUrl(`/api/attachments/acme/${ID}?v=2`)).toBeNull()
  })
})

describe("withAttachmentWidth", () => {
  it("appends a width", () => {
    expect(withAttachmentWidth(`/api/attachments/acme/${ID}`, 420)).toBe(
      `/api/attachments/acme/${ID}?w=420`
    )
  })

  it("replaces an existing width rather than appending twice", () => {
    expect(withAttachmentWidth(`/api/attachments/acme/${ID}?w=100`, 420)).toBe(
      `/api/attachments/acme/${ID}?w=420`
    )
  })

  it("strips the width when given null", () => {
    expect(withAttachmentWidth(`/api/attachments/acme/${ID}?w=420`, null)).toBe(
      `/api/attachments/acme/${ID}`
    )
  })

  it("rounds a fractional width", () => {
    expect(withAttachmentWidth(`/api/attachments/acme/${ID}`, 420.6)).toBe(
      `/api/attachments/acme/${ID}?w=421`
    )
  })

  it("round-trips through attachmentWidthFromUrl", () => {
    const url = withAttachmentWidth(`/api/attachments/acme/${ID}`, 333)
    expect(attachmentWidthFromUrl(url)).toBe(333)
  })

  it("leaves a sized url servable and reapable", () => {
    const url = withAttachmentWidth(`/api/attachments/acme/${ID}`, 333)
    expect(parseAttachmentUrl(url)).toEqual({ orgSlug: "acme", id: ID })
    expect(extractAttachmentRefs(`![a](${url})`)).toEqual([
      { orgSlug: "acme", id: ID }
    ])
  })
})

describe("clampAttachmentWidth", () => {
  const landscape = { naturalWidth: 2400, naturalHeight: 1800 }

  it("keeps a width inside every bound", () => {
    expect(
      clampAttachmentWidth({ width: 400, containerWidth: 800, ...landscape })
    ).toBe(400)
  })

  it("clamps to the container width when the image is wide enough that height never binds", () => {
    expect(
      clampAttachmentWidth({
        width: 5000,
        containerWidth: 700,
        naturalWidth: 4000,
        naturalHeight: 1000
      })
    ).toBe(700)
  })

  it("lets the height ceiling bind before the container for a 4:3 image", () => {
    expect(
      clampAttachmentWidth({ width: 5000, containerWidth: 700, ...landscape })
    ).toBe(512)
  })

  it("clamps a tall image so its height stays within the max height", () => {
    expect(
      clampAttachmentWidth({
        width: 5000,
        containerWidth: 4000,
        naturalWidth: 400,
        naturalHeight: 1200
      })
    ).toBe(128)
  })

  it("clamps up to the minimum width", () => {
    expect(
      clampAttachmentWidth({ width: 10, containerWidth: 800, ...landscape })
    ).toBe(ATTACHMENT_MIN_WIDTH)
  })

  it("never returns less than the minimum even in a tiny container", () => {
    expect(
      clampAttachmentWidth({ width: 10, containerWidth: 20, ...landscape })
    ).toBe(ATTACHMENT_MIN_WIDTH)
  })

  it("falls back to the container when natural dimensions are unknown", () => {
    expect(
      clampAttachmentWidth({
        width: 5000,
        containerWidth: 640,
        naturalWidth: 0,
        naturalHeight: 0
      })
    ).toBe(640)
  })
})
