import { expect, it } from "vite-plus/test"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { InviteMemberInput } from "./Org"

const decode = Schema.decodeUnknownExit(InviteMemberInput)

const accepts = (email: string) =>
  Exit.isSuccess(decode({ email, role: "member" }))

it("rejects a malformed invite email before any organisation lookup runs", () => {
  for (const email of [
    "nope",
    "no-at-sign.example.com",
    "trailing@",
    "@leading.com",
    "two..dots@example.com",
    ".leading.dot@example.com",
    "spaced out@example.com",
    "no-tld@example",
    ""
  ]) {
    expect(accepts(email), email).toBe(false)
  }
})

it("accepts the address shapes better-auth would accept", () => {
  for (const email of [
    "invitee@example.com",
    "first.last@example.co.uk",
    "plus+tag@example.com",
    "under_score@example-host.com",
    "UPPER@EXAMPLE.COM"
  ]) {
    expect(accepts(email), email).toBe(true)
  }
})

it("rejects an address longer than the 254-character limit", () => {
  expect(accepts(`${"a".repeat(250)}@example.com`)).toBe(false)
})
