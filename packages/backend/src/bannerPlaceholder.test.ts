import { describe, expect, it } from "vite-plus/test"
import sharp from "sharp"
import { BANNER_PLACEHOLDER_BUDGET } from "@projectproject/shared"
import {
  bannerNeedsPlaceholder,
  encodeBannerPlaceholder
} from "./bannerPlaceholder"

const photo = (width: number, height: number) => {
  const pixels = Buffer.alloc(width * height * 3)
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 97 + 13) % 256
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg()
    .toBuffer()
}

describe("bannerNeedsPlaceholder", () => {
  it("is true only for an attachment banner missing its placeholder", () => {
    const crop = { x: 0.5, y: 0.5, zoom: 1 }
    const attachmentId = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
    expect(
      bannerNeedsPlaceholder({
        type: "attachment",
        attachmentId,
        crop,
        placeholder: null
      } as never)
    ).toBe(true)
    expect(
      bannerNeedsPlaceholder({
        type: "attachment",
        attachmentId,
        crop,
        placeholder: "data:image/webp;base64,AAAA"
      } as never)
    ).toBe(false)
    expect(
      bannerNeedsPlaceholder({
        type: "preset",
        preset: "sunset",
        crop,
        placeholder: null
      } as never)
    ).toBe(false)
    expect(bannerNeedsPlaceholder(null)).toBe(false)
  })
})

describe("encodeBannerPlaceholder", () => {
  it("encodes a webp data url inside the payload budget", async () => {
    const url = await encodeBannerPlaceholder(await photo(2560, 853))
    expect(url?.startsWith("data:image/webp;base64,")).toBe(true)
    expect(url!.length).toBeLessThanOrEqual(BANNER_PLACEHOLDER_BUDGET)
  })

  it("caps the long edge at 24px", async () => {
    const url = await encodeBannerPlaceholder(await photo(2560, 853))
    const meta = await sharp(
      Buffer.from(url!.slice("data:image/webp;base64,".length), "base64")
    ).metadata()
    expect(meta.width).toBe(24)
    expect(meta.height).toBe(8)
  })

  it("never enlarges an image already smaller than the cap", async () => {
    const url = await encodeBannerPlaceholder(await photo(12, 6))
    const meta = await sharp(
      Buffer.from(url!.slice("data:image/webp;base64,".length), "base64")
    ).metadata()
    expect(meta.width).toBe(12)
    expect(meta.height).toBe(6)
  })

  it("rejects bytes that are not an image", async () => {
    await expect(
      encodeBannerPlaceholder(new Uint8Array([1, 2, 3, 4]))
    ).rejects.toThrow()
  })
})
