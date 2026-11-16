import { describe, expect, it } from "vitest"

import { formatVideoTime, nextPlaybackRate, videoProgress } from "./videoTime"

describe("formatVideoTime", () => {
  it("formats minutes and seconds", () => {
    expect(formatVideoTime(0)).toBe("0:00")
    expect(formatVideoTime(64.9)).toBe("1:04")
  })

  it("adds hours once the video is that long", () => {
    expect(formatVideoTime(3725)).toBe("1:02:05")
  })

  it("treats an unknown duration as zero", () => {
    expect(formatVideoTime(Number.NaN)).toBe("0:00")
    expect(formatVideoTime(Number.POSITIVE_INFINITY)).toBe("0:00")
  })
})

describe("nextPlaybackRate", () => {
  it("steps up and wraps around to the slowest rate", () => {
    expect(nextPlaybackRate(1)).toBe(1.25)
    expect(nextPlaybackRate(2)).toBe(0.5)
    expect(nextPlaybackRate(0.5)).toBe(1)
  })

  it("returns to normal speed from a rate it does not know", () => {
    expect(nextPlaybackRate(3)).toBe(1)
  })
})

describe("videoProgress", () => {
  it("is the played fraction, clamped", () => {
    expect(videoProgress(16, 64)).toBe(0.25)
    expect(videoProgress(80, 64)).toBe(1)
  })

  it("is zero until the duration is known", () => {
    expect(videoProgress(5, Number.NaN)).toBe(0)
    expect(videoProgress(5, 0)).toBe(0)
  })
})
