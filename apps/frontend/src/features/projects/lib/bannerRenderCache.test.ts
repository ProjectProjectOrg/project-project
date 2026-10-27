import { afterEach, describe, expect, it, vi } from "vitest"

import {
  bannerRenderUrl,
  bannerRenderGeneration,
  bucketRenderWidth,
  clearBannerRenderCache,
  evictBannerRenders,
  peekBannerRender,
  prepareBannerRender as prepareLeasedBannerRender,
  readBannerRender,
  readReadyBannerRender,
  resetBannerRenderCacheHandle,
  retainBannerRender,
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
  vi.stubGlobal("caches", {
    open: () => Promise.resolve(cache),
    delete: () => Promise.resolve(cache.store.clear())
  })
  resetBannerRenderCacheHandle()
  return cache
}

const blob = (text: string) => new Blob([text], { type: "image/webp" })

const prepareBannerRender = async (
  ...args: Parameters<typeof prepareLeasedBannerRender>
) => {
  const lease = await prepareLeasedBannerRender(...args)
  const render = lease?.render ?? null
  lease?.release()
  return render
}

const deferred = () => {
  let resolve: (() => void) | undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve: () => resolve?.() }
}

const stubImages = (decode: () => Promise<void> = () => Promise.resolve()) => {
  let nextUrl = 0
  const revoke = vi.fn<(url: string) => void>()
  vi.stubGlobal(
    "Image",
    class {
      src = ""
      decode = decode
    }
  )
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = () => `blob:banner-${++nextUrl}`
      static revokeObjectURL = revoke
    }
  )
  return revoke
}

afterEach(async () => {
  await clearBannerRenderCache()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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

describe("ready banner renders", () => {
  it("publishes a disk hit synchronously only after its image decodes", async () => {
    stubCaches()
    const decoding = deferred()
    const decode = vi.fn<() => Promise<void>>(() => decoding.promise)
    stubImages(decode)
    await writeBannerRender(key, blob("rendered"))

    const reading = readReadyBannerRender(key)
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce())
    expect(peekBannerRender(key)).toBeNull()
    decoding.resolve()
    const lease = await reading
    const ready = lease?.render ?? null

    expect(ready?.url).toBe("blob:banner-1")
    const unmeasured = { ...key, width: 0, height: 0 }
    expect(peekBannerRender(unmeasured)).toBe(ready)
    expect(
      peekBannerRender({ ...key, crop: { ...key.crop, zoom: 3 } })
    ).toBeNull()
    expect(peekBannerRender({ ...key, project: "acme/other" })).toBeNull()
    lease?.release()
  })

  it("retries a failed decode without retaining its unusable URL", async () => {
    const decode = vi.fn<() => Promise<void>>()
    decode.mockRejectedValueOnce(new Error("decode failed"))
    decode.mockResolvedValue(undefined)
    const revoke = stubImages(decode)

    expect(await prepareBannerRender(key, blob("bad"))).toBeNull()
    expect(peekBannerRender(key)).toBeNull()
    expect(revoke).toHaveBeenCalledWith("blob:banner-1")
    expect((await prepareBannerRender(key, blob("good")))?.url).toBe(
      "blob:banner-2"
    )
  })

  it("keeps replaced URLs alive until every mounted user releases them", async () => {
    const revoke = stubImages()
    await prepareBannerRender(key, blob("first"))
    const releaseFirst = retainBannerRender("blob:banner-1")
    const releaseSecond = retainBannerRender("blob:banner-1")

    await prepareBannerRender({ ...key, width: 1400 }, blob("resized"))
    expect(revoke).not.toHaveBeenCalledWith("blob:banner-1")
    releaseFirst()
    expect(revoke).not.toHaveBeenCalledWith("blob:banner-1")
    releaseSecond()
    expect(revoke).toHaveBeenCalledWith("blob:banner-1")
  })

  it("leases decoded results before a batch can evict them ahead of React committing", async () => {
    const revoke = stubImages()
    const leases = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        prepareLeasedBannerRender(
          { ...key, project: `acme/tile-${index}` },
          blob("tile")
        )
      )
    )

    expect(peekBannerRender({ ...key, project: "acme/tile-0" })).toBeNull()
    expect(revoke).not.toHaveBeenCalledWith("blob:banner-1")

    for (const lease of leases) lease?.release()
    expect(revoke).toHaveBeenCalledWith("blob:banner-1")
  })

  it("bounds memory and keeps recently displayed banners", async () => {
    const revoke = stubImages()
    await prepareBannerRender(key, blob("first"))
    for (let index = 1; index < 24; index++) {
      await prepareBannerRender(
        { ...key, project: `acme/project-${index}` },
        blob("other")
      )
    }
    const release = retainBannerRender("blob:banner-1")
    release()
    await prepareBannerRender({ ...key, project: "acme/last" }, blob("last"))

    expect(peekBannerRender(key)?.url).toBe("blob:banner-1")
    expect(peekBannerRender({ ...key, project: "acme/project-1" })).toBeNull()
    expect(revoke).toHaveBeenCalledWith("blob:banner-2")
  })

  it("rejects work started before invalidation without replacing a newer banner", async () => {
    const cache = stubCaches()
    const decoding = deferred()
    const decode = vi.fn<() => Promise<void>>()
    decode.mockReturnValueOnce(decoding.promise)
    decode.mockResolvedValue(undefined)
    const revoke = stubImages(decode)
    const generation = bannerRenderGeneration(key.project)
    const old = prepareBannerRender(key, blob("old"), generation)

    await evictBannerRenders(key.project)
    const newer = await prepareBannerRender(key, blob("new"))
    decoding.resolve()

    expect(await old).toBeNull()
    expect(peekBannerRender(key)).toBe(newer)
    expect(revoke).toHaveBeenCalledWith("blob:banner-1")
    await writeBannerRender(key, blob("stale"), generation)
    expect(cache.store.size).toBe(0)
  })

  it("finishes an active disk write before deleting invalidated renders", async () => {
    const cache = stubCaches()
    const putting = deferred()
    const put = vi
      .spyOn(cache, "put")
      .mockImplementation(async (url, response) => {
        await putting.promise
        cache.store.set(url, response)
      })
    const writing = writeBannerRender(key, blob("old"))
    await vi.waitFor(() => expect(put).toHaveBeenCalled())
    const evicting = evictBannerRenders(key.project)
    putting.resolve()
    await Promise.all([writing, evicting])
    expect(cache.store.size).toBe(0)
  })

  it("clears ready images on logout even without disk storage", async () => {
    vi.stubGlobal("caches", undefined)
    const revoke = stubImages()
    await prepareBannerRender(key, blob("rendered"))
    const release = retainBannerRender("blob:banner-1")

    await clearBannerRenderCache()

    expect(peekBannerRender(key)).toBeNull()
    expect(revoke).not.toHaveBeenCalledWith("blob:banner-1")
    release()
    expect(revoke).toHaveBeenCalledWith("blob:banner-1")
  })
})
