import { inspect } from "node:util"

import { OrgEmailError } from "@pp/shared"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import { describe, expect, it } from "vitest"

import { publicAddress, smtpError, transportOptions } from "./Smtp"

const connection = (security: "tls" | "starttls") => ({
  settings: {
    host: "smtp.example.test",
    port: security === "tls" ? 465 : 587,
    security,
    username: "user",
    senderName: "Test",
    senderEmail: "sender@example.test",
    replyTo: null
  },
  password: Redacted.make("secret")
})

describe("transportOptions", () => {
  for (const security of ["tls", "starttls"] as const)
    it(`pins the checked address and requires ${security}`, () => {
      expect(
        transportOptions(connection(security), "203.0.114.10")
      ).toMatchObject({
        host: "203.0.114.10",
        servername: "smtp.example.test",
        secure: security === "tls",
        requireTLS: security === "starttls"
      })
    })
})

describe("publicAddress", () => {
  it("returns the first address of a public host", () => {
    expect(publicAddress(["203.0.114.10", "2a00:1450::1"])).toEqual(
      Option.some("203.0.114.10")
    )
  })

  for (const addresses of [
    [],
    ["127.0.0.1"],
    ["10.1.2.3"],
    ["169.254.169.254"],
    ["100.64.0.1"],
    ["::1"],
    ["::ffff:192.168.0.1"],
    ["fd00::1"],
    ["fe80::1"],
    ["not-an-ip"],
    ["203.0.114.10", "172.16.0.1"]
  ])
    it(`refuses [${addresses.join(", ")}]`, () => {
      expect(publicAddress(addresses)).toEqual(Option.none())
    })
})

describe("smtpError", () => {
  for (const [cause, reason] of [
    [{ code: "EAUTH" }, "authentication"],
    [{ code: "ENOAUTH" }, "authentication"],
    [
      Object.assign(new Error("wrong version number"), {
        code: "ESOCKET",
        library: "SSL routines"
      }),
      "tls"
    ],
    [{ code: "ESOCKET", message: "self-signed certificate" }, "tls"],
    [{ code: "ESOCKET", message: "connect ECONNREFUSED" }, "connection"],
    [{ code: "EPROTOCOL" }, "connection"],
    [{ code: "EREQUIRETLS" }, "tls"],
    [{ code: "EENVELOPE" }, "sender"],
    ["unexpected", "delivery"]
  ] as const)
    it(`reports ${inspect(cause)} as ${reason}`, () => {
      expect(smtpError(cause)).toEqual(new OrgEmailError({ reason }))
    })

  it("keeps provider responses out of the error", () => {
    const error = smtpError({
      code: "EAUTH",
      response: "secret credentials echoed"
    })
    expect(inspect(error)).not.toContain("secret credentials")
  })
})
