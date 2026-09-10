import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { preloadImage } from "./imagePreload"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  src = ""
  crossOrigin = ""
  decode = () => Promise.resolve()
}

describe("preloadImage", () => {
  it("dedups concurrent calls for the same URL into a single request", async () => {
    const created: FakeImage[] = []
    vi.stubGlobal(
      "Image",
      class extends FakeImage {
        constructor() {
          super()
          created.push(this)
        }
      }
    )

    const first = preloadImage("https://example.com/a.png")
    const second = preloadImage("https://example.com/a.png")

    expect(first).toBe(second)
    expect(created).toHaveLength(1)

    created[0].onload?.()
    await first
  })

  it("never rejects even when the underlying image fails to load", async () => {
    const created: FakeImage[] = []
    vi.stubGlobal(
      "Image",
      class extends FakeImage {
        constructor() {
          super()
          created.push(this)
        }
      }
    )

    const promise = preloadImage("https://example.com/broken.png")
    let rejected = false
    promise.catch(() => {
      rejected = true
    })

    created[0].onerror?.()

    await expect(promise).resolves.toBeUndefined()
    expect(rejected).toBe(false)
  })

  it("does not retry a URL that already failed once", async () => {
    const created: FakeImage[] = []
    vi.stubGlobal(
      "Image",
      class extends FakeImage {
        constructor() {
          super()
          created.push(this)
        }
      }
    )

    const first = preloadImage("https://example.com/dead.png")
    created[0].onerror?.()
    await first

    const second = preloadImage("https://example.com/dead.png")
    expect(created).toHaveLength(1)
    expect(second).toBe(first)
  })

  it("is a no-op when there is no browser Image constructor", async () => {
    vi.stubGlobal("Image", undefined)

    await expect(
      preloadImage("https://example.com/ssr.png")
    ).resolves.toBeUndefined()
  })
})
