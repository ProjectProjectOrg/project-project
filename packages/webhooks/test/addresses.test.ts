import { describe, expect, it } from "vitest"

import { isPublicAddress } from "../src/addresses"

describe("isPublicAddress", () => {
  it.each([
    "93.184.215.14",
    "8.8.8.8",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "2a00:1450:4001:82a::200e",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
    "2002:808:808::1"
  ])("allows %s", (address) => {
    expect(isPublicAddress(address)).toBe(true)
  })

  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::127.0.0.1",
    "64:ff9b::a00:1",
    "64:ff9b:1::1",
    "2002:a00:1::1",
    "2001:db8::1",
    "2001::1",
    "100::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%en0",
    "fec0::1",
    "ff02::1",
    "localhost",
    "example.com"
  ])("blocks %s", (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })
})
