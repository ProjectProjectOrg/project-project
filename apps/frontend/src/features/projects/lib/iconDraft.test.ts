import { AttachmentId, ProjectIconImage } from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  buildIconImage,
  iconPreviewChanged,
  type IconDraftValues
} from "./iconDraft"

const TOLERANCE = 24

const sticker: ProjectIconImage = {
  type: "sticker",
  sourceAttachmentId: AttachmentId.make("01ARZ3NDEKTSV4RRFFQ69G5FAV"),
  renderedAttachmentId: AttachmentId.make("01ARZ3NDEKTSV4RRFFQ69G5FAW"),
  cutoutTolerance: TOLERANCE,
  crop: { x: 0.5, y: 0.5, zoom: 1 }
}

const draftOf = (over: Partial<IconDraftValues> = {}): IconDraftValues => ({
  source: { kind: "image", emoji: "🎨" },
  crop: { x: 0.5, y: 0.5, zoom: 1 },
  treatment: { kind: "sticker", tolerance: TOLERANCE },
  ...over
})

describe("iconPreviewChanged", () => {
  it("is unchanged when the editor opens on the saved image", () => {
    expect(
      iconPreviewChanged(
        draftOf(),
        { icon: "🎨", iconImage: sticker },
        false,
        TOLERANCE
      )
    ).toBe(false)
  })

  it("is unchanged when the editor opens on the saved emoji", () => {
    expect(
      iconPreviewChanged(
        draftOf({ source: { kind: "emoji", emoji: "🎨" } }),
        { icon: "🎨", iconImage: null },
        false,
        TOLERANCE
      )
    ).toBe(false)
  })

  it("notices a re-cropped image", () => {
    expect(
      iconPreviewChanged(
        draftOf({ crop: { x: 0.5, y: 0.4, zoom: 1 } }),
        { icon: "🎨", iconImage: sticker },
        false,
        TOLERANCE
      )
    ).toBe(true)
  })

  it("notices a treatment switch", () => {
    expect(
      iconPreviewChanged(
        draftOf({ treatment: { kind: "full_bleed", tolerance: TOLERANCE } }),
        { icon: "🎨", iconImage: sticker },
        false,
        TOLERANCE
      )
    ).toBe(true)
  })

  it("notices a retuned cutout tolerance", () => {
    expect(
      iconPreviewChanged(
        draftOf({ treatment: { kind: "sticker", tolerance: TOLERANCE + 10 } }),
        { icon: "🎨", iconImage: sticker },
        false,
        TOLERANCE
      )
    ).toBe(true)
  })

  it("notices a freshly picked file even at the same crop", () => {
    expect(
      iconPreviewChanged(
        draftOf(),
        { icon: "🎨", iconImage: sticker },
        true,
        TOLERANCE
      )
    ).toBe(true)
  })

  it("notices an image replacing an emoji", () => {
    expect(
      iconPreviewChanged(
        draftOf(),
        { icon: "🎨", iconImage: null },
        false,
        TOLERANCE
      )
    ).toBe(true)
  })

  it("notices an emoji replacing an image", () => {
    expect(
      iconPreviewChanged(
        draftOf({ source: { kind: "emoji", emoji: "🎨" } }),
        { icon: "🎨", iconImage: sticker },
        false,
        TOLERANCE
      )
    ).toBe(true)
  })

  it("notices a different emoji", () => {
    expect(
      iconPreviewChanged(
        draftOf({ source: { kind: "emoji", emoji: "🚀" } }),
        { icon: "🎨", iconImage: null },
        false,
        TOLERANCE
      )
    ).toBe(true)
  })
})

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
