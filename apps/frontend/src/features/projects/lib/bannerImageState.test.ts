import { describe, expect, it } from "vitest"

import {
  bannerImageReducer,
  initialBannerImageState,
  shouldLoadBannerImage,
  BannerImageEvent,
  type BannerImageState
} from "./bannerImageState"

type Photo = Readonly<{ id: string }>

const run = (...events: ReadonlyArray<BannerImageEvent<Photo>>) =>
  events.reduce<BannerImageState<Photo>>(
    bannerImageReducer,
    initialBannerImageState
  )

describe("bannerImageReducer", () => {
  it("waits for the cache lookup before loading the photo", () => {
    expect(shouldLoadBannerImage(run(), false)).toBe(false)
    expect(
      shouldLoadBannerImage(run(BannerImageEvent.lookupStarted()), false)
    ).toBe(false)
    expect(
      shouldLoadBannerImage(
        run(BannerImageEvent.lookupStarted(), BannerImageEvent.lookupMissed()),
        false
      )
    ).toBe(true)
  })

  it("loads the photo at once when there is nothing to look up", () => {
    expect(
      shouldLoadBannerImage(run(BannerImageEvent.lookupSkipped()), false)
    ).toBe(true)
  })

  it("skips the photo on a cache hit unless the banner is being edited", () => {
    const hit = run(
      BannerImageEvent.lookupStarted(),
      BannerImageEvent.lookupHit({ url: "blob:render" })
    )
    expect(hit.cachedRender).toBe("blob:render")
    expect(shouldLoadBannerImage(hit, false)).toBe(false)
    expect(shouldLoadBannerImage(hit, true)).toBe(true)
  })

  it("keeps the displayed render while looking up its replacement", () => {
    const relooked = run(
      BannerImageEvent.lookupStarted(),
      BannerImageEvent.lookupHit({ url: "blob:render" }),
      BannerImageEvent.lookupStarted()
    )
    expect(relooked).toMatchObject({
      lookup: "pending",
      cachedRender: "blob:render"
    })
  })

  it("keeps the cached render when the lookup is skipped", () => {
    const skipped = run(
      BannerImageEvent.lookupStarted(),
      BannerImageEvent.lookupHit({ url: "blob:render" }),
      BannerImageEvent.lookupSkipped()
    )
    expect(skipped).toMatchObject({
      lookup: "miss",
      cachedRender: "blob:render"
    })
  })

  it("records the photo size, then the decoded photo, then the first paint", () => {
    const photo = { id: "photo" }
    const painted = run(
      BannerImageEvent.lookupSkipped(),
      BannerImageEvent.imageLoaded({ size: { width: 1200, height: 400 } }),
      BannerImageEvent.imageDecoded({ image: photo }),
      BannerImageEvent.painted()
    )
    expect(painted).toMatchObject({
      naturalSize: { width: 1200, height: 400 },
      shaderImage: photo,
      painted: true,
      placeholderFailed: false,
      shaderFailed: false
    })
  })

  it("returns the same state for a repeated paint", () => {
    const painted = run(BannerImageEvent.painted())
    expect(bannerImageReducer(painted, BannerImageEvent.painted())).toBe(
      painted
    )
  })

  it("tracks a failed photo and a failed decode separately", () => {
    expect(run(BannerImageEvent.imageFailed())).toMatchObject({
      placeholderFailed: true,
      shaderFailed: false
    })
    expect(run(BannerImageEvent.decodeFailed())).toMatchObject({
      placeholderFailed: false,
      shaderFailed: true
    })
  })
})
