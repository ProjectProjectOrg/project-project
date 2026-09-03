import { describe, expect, it } from "vitest"
import { attachmentResolves } from "./attachmentAvailability"

const ID = "01JBX7Q2K9ZWCVE8MTQ4RXPGHN"
const OTHER = "01JBX7Q2K9ZWCVE8MTQ4RXPGHM"
const url = (id: string) => `/api/attachments/acme/${id}`

describe("attachmentResolves", () => {
  it("assumes an attachment resolves while the ticket has told us nothing", () => {
    expect(attachmentResolves(null, url(ID))).toBe(true)
  })

  it("resolves an id the ticket listed", () => {
    expect(attachmentResolves(new Set([ID]), url(ID))).toBe(true)
  })

  it("refuses an id the ticket did not list, even collapsed", () => {
    expect(attachmentResolves(new Set([OTHER]), url(ID))).toBe(false)
  })

  it("refuses every id when the ticket listed none", () => {
    expect(attachmentResolves(new Set(), url(ID))).toBe(false)
  })

  it("leaves a url that is not an attachment alone", () => {
    expect(attachmentResolves(new Set(), "https://example.com/cat.png")).toBe(
      true
    )
  })
})
