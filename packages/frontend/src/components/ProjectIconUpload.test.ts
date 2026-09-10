import { describe, expect, it } from "vite-plus/test"
import type { AttachmentId } from "@projectproject/shared"
import { buildIconImage, resolveIconTreatment } from "./ProjectIconUpload"

const sourceAttachmentId = "attachment_source" as AttachmentId
const renderedAttachmentId = "attachment_rendered" as AttachmentId
const crop = { x: 0.5, y: 0.5, zoom: 1 }

describe("resolveIconTreatment", () => {
  it("keeps sticker when the cutout is clean and requested", () => {
    expect(
      resolveIconTreatment({
        treatment: "sticker",
        clean: true,
        transparent: false,
        tolerance: 24
      })
    ).toBe("sticker")
  })

  it("forces full_bleed when the cutout is not clean, even if sticker was requested", () => {
    expect(
      resolveIconTreatment({
        treatment: "sticker",
        clean: false,
        transparent: false,
        tolerance: 24
      })
    ).toBe("full_bleed")
  })

  it("respects an explicit full_bleed request even when the cutout is clean", () => {
    expect(
      resolveIconTreatment({
        treatment: "full_bleed",
        clean: true,
        transparent: false,
        tolerance: 24
      })
    ).toBe("full_bleed")
  })

  it("keeps sticker for an already-transparent source", () => {
    expect(
      resolveIconTreatment({
        treatment: "sticker",
        clean: true,
        transparent: true,
        tolerance: 24
      })
    ).toBe("sticker")
  })
})

describe("buildIconImage", () => {
  it("builds a full_bleed payload when the cutout was rejected", () => {
    const result = buildIconImage({
      classification: {
        treatment: "sticker",
        clean: false,
        transparent: false,
        tolerance: 24
      },
      sourceAttachmentId,
      renderedAttachmentId,
      crop
    })
    expect(result).toEqual({
      type: "full_bleed",
      sourceAttachmentId,
      crop
    })
  })

  it("builds a full_bleed payload when full_bleed was explicitly requested", () => {
    const result = buildIconImage({
      classification: {
        treatment: "full_bleed",
        clean: true,
        transparent: false,
        tolerance: 24
      },
      sourceAttachmentId,
      renderedAttachmentId,
      crop
    })
    expect(result).toEqual({
      type: "full_bleed",
      sourceAttachmentId,
      crop
    })
  })

  it("builds a sticker payload with the chosen tolerance when the source is opaque", () => {
    const result = buildIconImage({
      classification: {
        treatment: "sticker",
        clean: true,
        transparent: false,
        tolerance: 40
      },
      sourceAttachmentId,
      renderedAttachmentId,
      crop
    })
    expect(result).toEqual({
      type: "sticker",
      sourceAttachmentId,
      renderedAttachmentId,
      cutoutTolerance: 40,
      crop
    })
  })

  it("nulls out the tolerance for an already-transparent source", () => {
    const result = buildIconImage({
      classification: {
        treatment: "sticker",
        clean: true,
        transparent: true,
        tolerance: 40
      },
      sourceAttachmentId,
      renderedAttachmentId,
      crop
    })
    expect(result).toEqual({
      type: "sticker",
      sourceAttachmentId,
      renderedAttachmentId,
      cutoutTolerance: null,
      crop
    })
  })
})
