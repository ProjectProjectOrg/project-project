import { AttachmentId } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { buildIconImage } from "@/lib/iconDraft"

const sourceAttachmentId = AttachmentId.make("01ARZ3NDEKTSV4RRFFQ69G5FAV")
const renderedAttachmentId = AttachmentId.make("01ARZ3NDEKTSV4RRFFQ69G5FAW")
const crop = { x: 0.5, y: 0.5, zoom: 1 }

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
