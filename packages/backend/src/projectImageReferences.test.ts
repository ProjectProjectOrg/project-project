import { expect, it } from "vite-plus/test"
import * as Schema from "effect/Schema"
import { AttachmentId } from "@projectproject/shared"
import { iconImageSlots } from "./projectImageReferences"

const attachmentId = Schema.decodeSync(AttachmentId)

it("returns the rendered and source ids for a sticker iconImage", () => {
  expect(
    iconImageSlots({
      type: "sticker",
      sourceAttachmentId: attachmentId("01JBQ8Z3X4Y5W6V7T8S9R0Q1M2"),
      renderedAttachmentId: attachmentId("01JBQ8Z3X4Y5W6V7T8S9R0Q1M3"),
      cutoutTolerance: 24,
      crop: { x: 0.5, y: 0.5, zoom: 1 }
    })
  ).toEqual({
    icon: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M3",
    iconSource: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2"
  })
})

it("returns only a source id for a full_bleed iconImage", () => {
  expect(
    iconImageSlots({
      type: "full_bleed",
      sourceAttachmentId: attachmentId("01JBQ8Z3X4Y5W6V7T8S9R0Q1M4"),
      crop: { x: 0.5, y: 0.5, zoom: 1 }
    })
  ).toEqual({
    icon: null,
    iconSource: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M4"
  })
})

it("returns both null for no iconImage", () => {
  expect(iconImageSlots(null)).toEqual({
    icon: null,
    iconSource: null
  })
})
