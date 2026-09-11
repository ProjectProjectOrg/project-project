import { describe, expect, it } from "vitest"
import type { AttachmentId, ProjectIconImage } from "@projectproject/shared"
import { iconPreviewChanged, type IconDraftValues } from "./iconDraft"

const TOLERANCE = 24
const attachment = (id: string) => id as AttachmentId

const sticker: ProjectIconImage = {
  type: "sticker",
  sourceAttachmentId: attachment("att_source"),
  renderedAttachmentId: attachment("att_rendered"),
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
