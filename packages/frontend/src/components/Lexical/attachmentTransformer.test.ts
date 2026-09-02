import { describe, expect, it } from "vitest"
import {
  ATTACHMENT_MARKDOWN_RE,
  formatAttachmentMarkdown,
  unescapeAttachmentAlt
} from "./attachmentTransformer"

const ID = "01JBX7Q2K9ZWCVE8MTQ4RXPGHN"
const URL = `/api/attachments/acme/${ID}`

describe("ATTACHMENT_MARKDOWN_RE", () => {
  it("matches an image attachment", () => {
    const match = `![shot](${URL})`.match(ATTACHMENT_MARKDOWN_RE)
    expect(match).not.toBeNull()
    expect(match![1]).toBe("!")
    expect(match![2]).toBe("shot")
    expect(match![3]).toBe(URL)
  })

  it("matches a file attachment link", () => {
    const match = `[report.pdf](${URL})`.match(ATTACHMENT_MARKDOWN_RE)
    expect(match).not.toBeNull()
    expect(match![1]).toBe("")
    expect(match![2]).toBe("report.pdf")
  })

  it("does not match an external image", () => {
    expect(
      "![x](https://example.test/a.png)".match(ATTACHMENT_MARKDOWN_RE)
    ).toBeNull()
  })

  it("does not match a mention link", () => {
    expect("[T-1](mention:ticket/T-1)".match(ATTACHMENT_MARKDOWN_RE)).toBeNull()
  })
})

describe("formatAttachmentMarkdown", () => {
  it("writes an image as a bang link", () => {
    expect(
      formatAttachmentMarkdown({ kind: "image", alt: "shot", url: URL })
    ).toBe(`![shot](${URL})`)
  })

  it("writes a file as a plain link", () => {
    expect(
      formatAttachmentMarkdown({ kind: "file", alt: "report.pdf", url: URL })
    ).toBe(`[report.pdf](${URL})`)
  })

  it("escapes a bracket in the alt text", () => {
    expect(
      formatAttachmentMarkdown({ kind: "image", alt: "a[b]c", url: URL })
    ).toBe(`![a\\[b\\]c](${URL})`)
  })

  it("round-trips through the regex", () => {
    const md = formatAttachmentMarkdown({
      kind: "image",
      alt: "shot",
      url: URL
    })
    expect(md.match(ATTACHMENT_MARKDOWN_RE)![3]).toBe(URL)
  })

  it("round-trips an alt text containing brackets back to the original filename", () => {
    const alt = "shot [1].png"
    const md = formatAttachmentMarkdown({ kind: "image", alt, url: URL })
    const match = md.match(ATTACHMENT_MARKDOWN_RE)
    expect(match).not.toBeNull()
    expect(unescapeAttachmentAlt(match![2])).toBe(alt)
    expect(match![3]).toBe(URL)
  })

  it("round-trips an alt text containing a backslash", () => {
    const alt = "a\\b.png"
    const md = formatAttachmentMarkdown({ kind: "image", alt, url: URL })
    const match = md.match(ATTACHMENT_MARKDOWN_RE)
    expect(match).not.toBeNull()
    expect(unescapeAttachmentAlt(match![2])).toBe(alt)
  })
})
