import { describe, expect, it } from "vitest"

import { PastedPart, splitPastedAttachments } from "./pasted-attachments"

const ID = "01JBX7Q2K9ZWCVE8MTQ4RXPGHN"
const URL = `/api/attachments/acme/${ID}`

describe("splitPastedAttachments", () => {
  it("finds nothing to convert in ordinary prose", () => {
    expect(splitPastedAttachments("just some text")).toBeNull()
  })

  it("converts an image reference on its own", () => {
    expect(splitPastedAttachments(`![shot.png](${URL})`)).toEqual([
      PastedPart.attachment({ kind: "image", alt: "shot.png", url: URL })
    ])
  })

  it("converts a file reference on its own", () => {
    expect(splitPastedAttachments(`[bundle.zip](${URL})`)).toEqual([
      PastedPart.attachment({ kind: "file", alt: "bundle.zip", url: URL })
    ])
  })

  it("keeps the prose around a reference", () => {
    expect(splitPastedAttachments(`see ![a](${URL}) here`)).toEqual([
      PastedPart.text({ value: "see " }),
      PastedPart.attachment({ kind: "image", alt: "a", url: URL }),
      PastedPart.text({ value: " here" })
    ])
  })

  it("converts several references in one paste", () => {
    const parts = splitPastedAttachments(`![a](${URL}) and [b](${URL})`)
    expect(parts?.filter(PastedPart.$is("attachment"))).toHaveLength(2)
  })

  it("keeps a width parameter on the url so the paste round-trips", () => {
    expect(splitPastedAttachments(`![a](${URL}?w=320)`)).toEqual([
      PastedPart.attachment({ kind: "image", alt: "a", url: `${URL}?w=320` })
    ])
  })

  it("unescapes an alt that had brackets escaped", () => {
    expect(splitPastedAttachments(`![a\\[1\\]](${URL})`)).toEqual([
      PastedPart.attachment({ kind: "image", alt: "a[1]", url: URL })
    ])
  })

  it("leaves a markdown link that is not an attachment alone", () => {
    expect(splitPastedAttachments("[docs](https://example.com)")).toBeNull()
  })
})
