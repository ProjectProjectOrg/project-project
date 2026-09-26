import * as Result from "effect/Result"
import { describe, expect, it } from "vitest"

import { hostOf, normalizeAddress } from "./address"

const origin = (input: string, allowInsecure = false) =>
  Result.getOrUndefined(normalizeAddress(input, allowInsecure))

describe("normalizeAddress", () => {
  it("turns what people type or paste into an https origin", () => {
    expect(origin("pp.igne.nl")).toBe("https://pp.igne.nl")
    expect(origin("  PP.Igne.NL/ ")).toBe("https://pp.igne.nl")
    expect(origin("https://pp.igne.nl/orgs/igne/tickets/T-12?x=1")).toBe(
      "https://pp.igne.nl"
    )
    expect(origin("pp.igne.nl:8443")).toBe("https://pp.igne.nl:8443")
    expect(origin("https://pp.igne.nl:443")).toBe("https://pp.igne.nl")
  })

  it("handles IPv6, international names, trailing dots and odd ports", () => {
    expect(origin("[::1]:8443")).toBe("https://[::1]:8443")
    expect(origin("bücher.example")).toBe("https://xn--bcher-kva.example")
    expect(origin("BÜCHER.example")).toBe("https://xn--bcher-kva.example")
    expect(origin("pp.example.")).toBe("https://pp.example")
    expect(origin("pp.example:0443")).toBe("https://pp.example")
  })

  it("rejects ports out of range, empty labels and sign-in details", () => {
    expect(normalizeAddress("pp.example:65536", false)).toEqual(
      Result.fail("invalid")
    )
    expect(normalizeAddress("pp..example", false)).toEqual(
      Result.fail("invalid")
    )
    expect(normalizeAddress("user:secret@pp.example", false)).toEqual(
      Result.fail("invalid")
    )
  })

  it("only allows plain http when insecure addresses are allowed", () => {
    expect(normalizeAddress("http://localhost:3000", false)).toEqual(
      Result.fail("insecure")
    )
    expect(origin("http://localhost:3000", true)).toBe("http://localhost:3000")
  })

  it("rejects empty and malformed input", () => {
    expect(normalizeAddress("   ", false)).toEqual(Result.fail("empty"))
    expect(normalizeAddress("not a url", false)).toEqual(Result.fail("invalid"))
    expect(normalizeAddress("ftp://pp.igne.nl", false)).toEqual(
      Result.fail("invalid")
    )
  })

  it("shows the host without the scheme", () => {
    expect(hostOf("https://pp.igne.nl:8443")).toBe("pp.igne.nl:8443")
  })
})
