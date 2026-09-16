import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import {
  bannerRenderUrl,
  bucketRenderWidth,
  evictBannerRenders,
  readBannerRender,
  resetBannerRenderCacheHandle,
  writeBannerRender
} from "./bannerRenderCache"

const key = {
  project: "acme/site",
  source: "/api/attachments/acme/abc?w=1024",
  variant: "header" as const,
  crop: { x: 0.6147973773672097, y: 0.63011670364, zoom: 2.05 },
  width: 900,
  height: 300,
  pixelRatio: 2
}

class FakeCache {
  store = new Map<string, Response>()
  match(url: string) {
    return Promise.resolve(this.store.get(url))
  }
  put(url: string, response: Response) {
    this.store.set(url, response)
    return Promise.resolve()
  }
  delete(url: string) {
    return Promise.resolve(this.store.delete(url))
  }
  keys() {
    return Promise.resolve([...this.store.keys()].map((url) => ({ url })))
  }
}

const stubCaches = () => {
  const cache = new FakeCache()
  vi.stubGlobal("caches", { open: () => Promise.resolve(cache) })
  resetBannerRenderCacheHandle()
  return cache
}

const blob = (text: string) => new Blob([text], { type: "image/webp" })

afterEach(() => {
  vi.unstubAllGlobals()
  resetBannerRenderCacheHandle()
})

describe("bucketRenderWidth", () => {
  it("rounds up to a 128px bucket so a resize keeps hitting the cache", () => {
    expect(bucketRenderWidth(900)).toBe(1024)
    expect(bucketRenderWidth(1024)).toBe(1024)
    expect(bucketRenderWidth(1025)).toBe(1152)
  })

  it("never buckets below one step", () => {
    expect(bucketRenderWidth(0)).toBe(128)
    expect(bucketRenderWidth(-5)).toBe(128)
  })
})

describe("bannerRenderUrl", () => {
  it("is stable for the same inputs", () => {
    expect(bannerRenderUrl(key)).toBe(bannerRenderUrl({ ...key }))
  })

  it("ignores crop differences below the rounding threshold", () => {
    const nudged = { ...key, crop: { ...key.crop, x: key.crop.x + 0.000001 } }
    expect(bannerRenderUrl(nudged)).toBe(bannerRenderUrl(key))
  })

  it("changes when the crop, variant, source, pixel ratio or bucket changes", () => {
    const base = bannerRenderUrl(key)
    expect(
      bannerRenderUrl({ ...key, crop: { ...key.crop, zoom: 2.1 } })
    ).not.toBe(base)
    expect(bannerRenderUrl({ ...key, variant: "card" })).not.toBe(base)
    expect(bannerRenderUrl({ ...key, source: "/other" })).not.toBe(base)
    expect(bannerRenderUrl({ ...key, pixelRatio: 1 })).not.toBe(base)
    expect(bannerRenderUrl({ ...key, width: 1400 })).not.toBe(base)
  })

  it("does not change for a resize inside the same bucket", () => {
    expect(bannerRenderUrl({ ...key, width: 950 })).toBe(bannerRenderUrl(key))
  })
})

describe("readBannerRender / writeBannerRender", () => {
  it("round-trips a rendered blob", async () => {
    stubCaches()
    await writeBannerRender(key, blob("rendered"))
    const found = await readBannerRender(key)
    expect(await found?.text()).toBe("rendered")
  })

  it("misses for a different crop", async () => {
    stubCaches()
    await writeBannerRender(key, blob("rendered"))
    const other = { ...key, crop: { ...key.crop, zoom: 3 } }
    expect(await readBannerRender(other)).toBeNull()
  })

  it("drops superseded entries for the same project and variant", async () => {
    const cache = stubCaches()
    await writeBannerRender(key, blob("old"))
    await writeBannerRender(
      { ...key, crop: { ...key.crop, zoom: 3 } },
      blob("new")
    )
    expect(cache.store.size).toBe(1)
    expect(
      await (
        await readBannerRender({ ...key, crop: { ...key.crop, zoom: 3 } })
      )?.text()
    ).toBe("new")
  })

  it("keeps entries for other variants of the same project", async () => {
    const cache = stubCaches()
    await writeBannerRender(key, blob("header"))
    await writeBannerRender({ ...key, variant: "card" }, blob("card"))
    expect(cache.store.size).toBe(2)
  })

  it("keeps entries for other projects", async () => {
    const cache = stubCaches()
    await writeBannerRender(key, blob("one"))
    await writeBannerRender({ ...key, project: "acme/other" }, blob("two"))
    expect(cache.store.size).toBe(2)
  })

  it("returns null instead of throwing when Cache Storage is unavailable", async () => {
    vi.stubGlobal("caches", undefined)
    resetBannerRenderCacheHandle()
    expect(await readBannerRender(key)).toBeNull()
    await expect(writeBannerRender(key, blob("x"))).resolves.toBeUndefined()
  })

  it("returns null instead of throwing when Cache Storage rejects", async () => {
    vi.stubGlobal("caches", {
      open: () => Promise.reject(new Error("quota exceeded"))
    })
    resetBannerRenderCacheHandle()
    expect(await readBannerRender(key)).toBeNull()
    await expect(writeBannerRender(key, blob("x"))).resolves.toBeUndefined()
  })
})

describe("bannerRenderUrl", () => {
  it("buckets the width but keys the exact height", () => {
    const url = bannerRenderUrl({ ...key, width: 900, height: 300 })
    expect(url).toContain(`w=${bucketRenderWidth(900)}`)
    expect(url).toContain("h=300")
  })

  it("distinguishes two renders that share a width bucket but differ in height", () => {
    expect(bannerRenderUrl({ ...key, height: 300 })).not.toBe(
      bannerRenderUrl({ ...key, height: 160 })
    )
  })
})

describe("evictBannerRenders", () => {
  it("drops every variant for the project and leaves other projects alone", async () => {
    const cache = stubCaches()
    await writeBannerRender(key, blob("header"))
    await writeBannerRender({ ...key, variant: "card" }, blob("card"))
    await writeBannerRender({ ...key, project: "acme/other" }, blob("other"))
    expect(cache.store.size).toBe(3)

    await evictBannerRenders(key.project)

    const remaining = [...cache.store.keys()]
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toContain(encodeURIComponent("acme/other"))
  })
})
