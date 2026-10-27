import { describe, expect, it } from "vitest"

import {
  bannerImageReducer,
  initialBannerImageState,
  shouldLoadBannerImage,
  type BannerImageEvent,
  type BannerImageState
} from "./bannerImageState"

type Photo = Readonly<{ id: string }>

const run = (
  ...events: ReadonlyArray<BannerImageEvent<Photo>>
): BannerImageState<Photo> =>
  events.reduce<BannerImageState<Photo>>(
    bannerImageReducer,
    initialBannerImageState
  )

describe("bannerImageReducer", () => {
  it("waits for the cache lookup before loading the photo", () => {
    expect(shouldLoadBannerImage(run(), false)).toBe(false)
    expect(shouldLoadBannerImage(run({ type: "lookupStarted" }), false)).toBe(
      false
    )
    expect(
      shouldLoadBannerImage(
        run({ type: "lookupStarted" }, { type: "lookupMissed" }),
        false
      )
    ).toBe(true)
  })

  it("loads the photo at once when there is nothing to look up", () => {
    expect(shouldLoadBannerImage(run({ type: "lookupSkipped" }), false)).toBe(
      true
    )
  })

  it("skips the photo on a cache hit unless the banner is being edited", () => {
    const hit = run(
      { type: "lookupStarted" },
      { type: "lookupHit", url: "blob:render" }
    )
    expect(hit.cachedRender).toBe("blob:render")
    expect(shouldLoadBannerImage(hit, false)).toBe(false)
    expect(shouldLoadBannerImage(hit, true)).toBe(true)
  })

  it("keeps the displayed render while looking up its replacement", () => {
    const relooked = run(
      { type: "lookupStarted" },
      { type: "lookupHit", url: "blob:render" },
      { type: "lookupStarted" }
    )
    expect(relooked).toMatchObject({
      lookup: "pending",
      cachedRender: "blob:render"
    })
  })

  it("keeps the cached render when the lookup is skipped", () => {
    const skipped = run(
      { type: "lookupStarted" },
      { type: "lookupHit", url: "blob:render" },
      { type: "lookupSkipped" }
    )
    expect(skipped).toMatchObject({
      lookup: "miss",
      cachedRender: "blob:render"
    })
  })

  it("records the photo size, then the decoded photo, then the first paint", () => {
    const photo = { id: "photo" }
    const painted = run(
      { type: "lookupSkipped" },
      { type: "imageLoaded", size: { width: 1200, height: 400 } },
      { type: "imageDecoded", image: photo },
      { type: "painted" }
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
    const painted = run({ type: "painted" })
    expect(bannerImageReducer(painted, { type: "painted" })).toBe(painted)
  })

  it("tracks a failed photo and a failed decode separately", () => {
    expect(run({ type: "imageFailed" })).toMatchObject({
      placeholderFailed: true,
      shaderFailed: false
    })
    expect(run({ type: "decodeFailed" })).toMatchObject({
      placeholderFailed: false,
      shaderFailed: true
    })
  })
})
