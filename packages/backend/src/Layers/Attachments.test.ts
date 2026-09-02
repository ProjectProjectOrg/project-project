import { describe, expect, it } from "vitest"
import { ATTACHMENT_MAX_BYTES } from "@projectproject/shared"
import { validateUploadRequest } from "../Services/Attachments"

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
