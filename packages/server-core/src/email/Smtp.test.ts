import { inspect } from "node:util"

import { it } from "@effect/vitest"
import { OrgEmailError } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import { describe, expect } from "vitest"

import {
  firstReachable,
  publicAddresses,
  smtpError,
  transportOptions
} from "./Smtp"

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

describe("publicAddresses", () => {
  it("returns every address of a public host", () => {
    expect(publicAddresses(["2a00:1450::1", "203.0.114.10"])).toEqual(
      Option.some(["2a00:1450::1", "203.0.114.10"])
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
    ["64:ff9b:1::a00:1"],
    ["not-an-ip"],
    ["203.0.114.10", "172.16.0.1"]
  ])
    it(`refuses [${addresses.join(", ")}]`, () => {
      expect(publicAddresses(addresses)).toEqual(Option.none())
    })
})

describe("firstReachable", () => {
  const sendWith = (failures: Record<string, OrgEmailError["reason"]>) => {
    const tried: Array<string> = []
    const send = (address: string) =>
      Effect.suspend(() => {
        tried.push(address)
        const reason = failures[address]
        return reason ? Effect.fail(new OrgEmailError({ reason })) : Effect.void
      })
    return { tried, send }
  }

  it.effect("moves past unreachable addresses", () =>
    Effect.gen(function* () {
      const { tried, send } = sendWith({ "2a00:1450::1": "connection" })
      yield* firstReachable(["2a00:1450::1", "203.0.114.10"], send)
      expect(tried).toEqual(["2a00:1450::1", "203.0.114.10"])
    })
  )

  it.effect("stops at the first answer from a provider", () =>
    Effect.gen(function* () {
      const { tried, send } = sendWith({ "2a00:1450::1": "authentication" })
      const error = yield* Effect.flip(
        firstReachable(["2a00:1450::1", "203.0.114.10"], send)
      )
      expect(error).toEqual(new OrgEmailError({ reason: "authentication" }))
      expect(tried).toEqual(["2a00:1450::1"])
    })
  )

  it.effect("reports a connection failure when nothing answers", () =>
    Effect.gen(function* () {
      const { send } = sendWith({
        "2a00:1450::1": "connection",
        "203.0.114.10": "connection"
      })
      const error = yield* Effect.flip(
        firstReachable(["2a00:1450::1", "203.0.114.10"], send)
      )
      expect(error).toEqual(new OrgEmailError({ reason: "connection" }))
    })
  )
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
