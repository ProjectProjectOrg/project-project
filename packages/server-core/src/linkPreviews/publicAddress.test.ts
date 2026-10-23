import { describe, expect, it } from "vitest"

import { isPublicAddress } from "./publicAddress"

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:169.254.169.254",
    "64:ff9b::a00:1",
    "2001:db8::1",
    "not-an-ip",
    "999.1.1.1"
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "172.32.0.1",
    "100.128.0.1",
    "2606:4700:4700::1111",
    "2a00:1450:4001:80b::200e",
    "::ffff:8.8.8.8"
  ])("allows %s", (address) => {
    expect(isPublicAddress(address)).toBe(true)
  })
})
