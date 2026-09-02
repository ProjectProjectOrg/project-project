import { describe, expect, it } from "vitest"
import { attachmentObjectKey, sanitizeFilename } from "../Services/S3Storage"

const base = {
  keyPrefix: null,
  orgSlug: "acme",
  projectSlug: "web",
  ticketId: "T-12",
  attachmentId: "01JBX7Q2K9ZWCVE8MTQ4RXPGHN",
  filename: "screenshot.png"
}

describe("attachmentObjectKey", () => {
  it("namespaces by org, project and ticket", () => {
    expect(attachmentObjectKey(base)).toBe(
      "orgs/acme/projects/web/tickets/T-12/01JBX7Q2K9ZWCVE8MTQ4RXPGHN-screenshot.png"
    )
  })

  it("applies a key prefix when the bucket is shared", () => {
    expect(attachmentObjectKey({ ...base, keyPrefix: "projectproject" })).toBe(
      "projectproject/orgs/acme/projects/web/tickets/T-12/01JBX7Q2K9ZWCVE8MTQ4RXPGHN-screenshot.png"
    )
  })

  it("trims leading and trailing slashes from the prefix", () => {
    expect(attachmentObjectKey({ ...base, keyPrefix: "/pp/" })).toBe(
      "pp/orgs/acme/projects/web/tickets/T-12/01JBX7Q2K9ZWCVE8MTQ4RXPGHN-screenshot.png"
    )
  })

  it("keeps the attachment id as the uniqueness guarantee", () => {
    const a = attachmentObjectKey(base)
    const b = attachmentObjectKey({ ...base, attachmentId: "01JBX000000000000000000000" })
    expect(a).not.toBe(b)
  })
})

describe("sanitizeFilename", () => {
  it("strips path separators", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("etc-passwd")
  })

  it("strips characters that break object keys", () => {
    expect(sanitizeFilename("my file (1)?.png")).toBe("my-file-1.png")
  })

  it("collapses runs of separators", () => {
    expect(sanitizeFilename("a///b   c.png")).toBe("a-b-c.png")
  })

  it("preserves a normal filename", () => {
    expect(sanitizeFilename("screenshot.png")).toBe("screenshot.png")
  })

  it("falls back when the name sanitizes to nothing", () => {
    expect(sanitizeFilename("///")).toBe("file")
  })

  it("truncates an absurdly long name", () => {
    expect(sanitizeFilename(`${"a".repeat(300)}.png`).length).toBeLessThanOrEqual(
      120
    )
  })
})
