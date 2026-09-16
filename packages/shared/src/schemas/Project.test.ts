import * as Schema from "effect/Schema"
import { describe, expect, it } from "vite-plus/test"
import {
  BANNER_PLACEHOLDER_MAX_LENGTH,
  CreatableProjectKey,
  Project,
  ProjectIconImage,
  ProjectKey,
  UpdateProjectInput
} from "./Project"

const isoDate = "2026-05-18T00:00:00.000Z"

const decodeCreatable = Schema.decodeUnknownExit(CreatableProjectKey)
const decodeProjectKey = Schema.decodeUnknownExit(ProjectKey)

describe("ProjectKey", () => {
  it("accepts the legacy T key", () => {
    expect(decodeProjectKey("T")._tag).toBe("Success")
  })

  it("accepts uppercase alphanumeric keys that start with a letter", () => {
    expect(decodeCreatable("FOO")._tag).toBe("Success")
    expect(decodeCreatable("A1B2")._tag).toBe("Success")
    expect(decodeCreatable("ABCDEFGHIJ")._tag).toBe("Success")
  })

  it("rejects invalid keys for new projects", () => {
    for (const value of ["T", "foo", "1FOO", "A-1", "ABCDEFGHIJK"]) {
      expect(decodeCreatable(value)._tag).toBe("Failure")
    }
  })
})

describe("Project with identity", () => {
  const decode = Schema.decodeUnknownExit(Project)
  const base = {
    banner: null,
    iconImage: null,
    org: "demo",
    slug: "demo",
    key: "T",
    name: "Demo",
    createdBy: "user-1",
    createdAt: isoDate,
    icon: "🚀",
    color: "#abcdef"
  }

  it("accepts a project with icon and color", () => {
    expect(decode(base)._tag).toBe("Success")
  })

  it("rejects a project missing icon", () => {
    const { icon: _icon, ...withoutIcon } = base
    expect(decode(withoutIcon)._tag).toBe("Failure")
  })

  it("rejects a project missing color", () => {
    const { color: _color, ...withoutColor } = base
    expect(decode(withoutColor)._tag).toBe("Failure")
  })

  it("validates color as 6-digit hex", () => {
    expect(decode({ ...base, color: "not-hex" })._tag).toBe("Failure")
    expect(decode({ ...base, color: "#ABC" })._tag).toBe("Failure")
    expect(decode({ ...base, color: "#ABCDEF" })._tag).toBe("Success")
  })
})

describe("UpdateProjectInput with identity", () => {
  const decode = Schema.decodeUnknownExit(UpdateProjectInput)

  it("accepts an empty update", () => {
    expect(decode({})._tag).toBe("Success")
  })

  it("accepts an icon-only update", () => {
    expect(decode({ icon: "📦" })._tag).toBe("Success")
  })

  it("accepts a color-only update", () => {
    expect(decode({ color: "#abcdef" })._tag).toBe("Success")
  })

  it("rejects an invalid color", () => {
    expect(decode({ color: "blue" })._tag).toBe("Failure")
  })
})

describe("project banner input", () => {
  const decode = Schema.decodeUnknownExit(UpdateProjectInput)
  const banner = {
    type: "preset",
    preset: "sunset",
    crop: { x: 0.5, y: 0.65, zoom: 1 },
    placeholder: null
  }

  it("supports setting and removing a banner", () => {
    expect(decode({ banner })._tag).toBe("Success")
    expect(decode({ banner: null })._tag).toBe("Success")
  })

  it("rejects unknown presets and arbitrary remote images", () => {
    expect(decode({ banner: { ...banner, preset: "unknown" } })._tag).toBe(
      "Failure"
    )
    expect(
      decode({
        banner: {
          type: "url",
          url: "https://example.com/photo.png",
          crop: banner.crop
        }
      })._tag
    ).toBe("Failure")
  })

  it("bounds crop coordinates and rejects invalid zoom", () => {
    for (const crop of [
      { x: -0.1 },
      { y: 1.1 },
      { zoom: 0 },
      { zoom: 4.1 },
      { zoom: Infinity },
      { x: NaN }
    ]) {
      expect(
        decode({ banner: { ...banner, crop: { ...banner.crop, ...crop } } })
          ._tag
      ).toBe("Failure")
    }
  })

  it("accepts attachment IDs but rejects malformed references", () => {
    const attachment = {
      type: "attachment",
      attachmentId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      crop: banner.crop,
      placeholder: null
    }
    expect(decode({ banner: attachment })._tag).toBe("Success")
    expect(
      decode({ banner: { ...attachment, attachmentId: "../other" } })._tag
    ).toBe("Failure")
  })

  it("accepts an inline webp placeholder and rejects other payloads", () => {
    const withPlaceholder = (placeholder: unknown) =>
      decode({ banner: { ...banner, placeholder } })._tag
    expect(withPlaceholder("data:image/webp;base64,UklGRhoAAABXRUJQ")).toBe(
      "Success"
    )
    expect(withPlaceholder("data:image/png;base64,iVBORw0KGgo=")).toBe(
      "Failure"
    )
    expect(withPlaceholder("https://example.com/tiny.webp")).toBe("Failure")
    expect(
      withPlaceholder(
        `data:image/webp;base64,${"A".repeat(BANNER_PLACEHOLDER_MAX_LENGTH)}`
      )
    ).toBe("Failure")
  })
})

describe("ProjectIconImage", () => {
  const decode = Schema.decodeUnknownSync(ProjectIconImage)

  it("decodes a sticker with a tolerance", () => {
    const value = decode({
      type: "sticker",
      sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
      renderedAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M3",
      cutoutTolerance: 24,
      crop: { x: 0.5, y: 0.5, zoom: 1 }
    })
    expect(value.type).toBe("sticker")
  })

  it("decodes a sticker with a null tolerance for transparent sources", () => {
    const value = decode({
      type: "sticker",
      sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
      renderedAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M3",
      cutoutTolerance: null,
      crop: { x: 0.5, y: 0.5, zoom: 1 }
    })
    expect(value.type).toBe("sticker")
  })

  it("decodes full_bleed without a rendered attachment", () => {
    const value = decode({
      type: "full_bleed",
      sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
      crop: { x: 0.2, y: 0.8, zoom: 2 }
    })
    expect(value.type).toBe("full_bleed")
  })

  it("rejects a tolerance above 160", () => {
    expect(() =>
      decode({
        type: "sticker",
        sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
        renderedAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M3",
        cutoutTolerance: 161,
        crop: { x: 0.5, y: 0.5, zoom: 1 }
      })
    ).toThrow()
  })
})
