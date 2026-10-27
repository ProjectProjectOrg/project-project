import { renderHook, act, cleanup } from "@testing-library/react"
import * as Schema from "effect/Schema"
import { describe, expect, it, beforeEach, afterEach } from "vitest"

import {
  createLocalStorageCodec,
  createLocalStorageStringCodec,
  useLocalStorageState
} from "./useLocalStorageState"

const StringSet = Schema.Array(Schema.String)
const stringSetCodec = createLocalStorageCodec(StringSet)

describe("useLocalStorageState", () => {
  afterEach(cleanup)

  beforeEach(() => {
    window.localStorage.clear()
  })

  it("returns the initial value when no entry exists", () => {
    const { result } = renderHook(() =>
      useLocalStorageState("test:empty", stringSetCodec, ["a"])
    )
    expect(result.current[0]).toEqual(["a"])
  })

  it("returns the decoded value when a valid entry exists", () => {
    window.localStorage.setItem("test:exists", JSON.stringify(["x", "y"]))
    const { result } = renderHook(() =>
      useLocalStorageState("test:exists", stringSetCodec, [])
    )
    expect(result.current[0]).toEqual(["x", "y"])
  })

  it("falls back to initial when the stored entry is malformed", () => {
    window.localStorage.setItem("test:bad", "not-json")
    const { result } = renderHook(() =>
      useLocalStorageState("test:bad", stringSetCodec, ["fallback"])
    )
    expect(result.current[0]).toEqual(["fallback"])
  })

  it("falls back to initial when the stored entry fails schema decode", () => {
    window.localStorage.setItem("test:wrong", JSON.stringify({ not: "array" }))
    const { result } = renderHook(() =>
      useLocalStorageState("test:wrong", stringSetCodec, ["fallback"])
    )
    expect(result.current[0]).toEqual(["fallback"])
  })

  it("persists updates to localStorage", () => {
    const { result } = renderHook(() =>
      useLocalStorageState("test:write", stringSetCodec, [])
    )
    act(() => result.current[1](["new", "value"]))
    expect(JSON.parse(window.localStorage.getItem("test:write")!)).toEqual([
      "new",
      "value"
    ])
    expect(result.current[0]).toEqual(["new", "value"])
  })

  it("updates subscribers when another tab changes or clears storage", () => {
    const { result } = renderHook(() =>
      useLocalStorageState("test:external", stringSetCodec, ["fallback"])
    )
    act(() => {
      window.localStorage.setItem("test:external", JSON.stringify(["external"]))
      window.dispatchEvent(
        new StorageEvent("storage", { key: "test:external" })
      )
    })
    expect(result.current[0]).toEqual(["external"])
    act(() => {
      window.localStorage.clear()
      window.dispatchEvent(new StorageEvent("storage", { key: null }))
    })
    expect(result.current[0]).toEqual(["fallback"])
  })
})

describe("createLocalStorageStringCodec", () => {
  const Mode = Schema.Literals(["light", "dark", "system"])
  const modeCodec = createLocalStorageStringCodec(Mode)

  afterEach(cleanup)

  beforeEach(() => {
    window.localStorage.clear()
  })

  it("reads and writes the bare string", () => {
    window.localStorage.setItem("test:mode", "dark")
    const { result } = renderHook(() =>
      useLocalStorageState("test:mode", modeCodec, "system")
    )
    expect(result.current[0]).toBe("dark")
    act(() => result.current[1]("light"))
    expect(window.localStorage.getItem("test:mode")).toBe("light")
  })

  it("falls back to initial for a value outside the schema", () => {
    window.localStorage.setItem("test:mode", '"dark"')
    const { result } = renderHook(() =>
      useLocalStorageState("test:mode", modeCodec, "system")
    )
    expect(result.current[0]).toBe("system")
  })
})
