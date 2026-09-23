import { Slug, type UserInvitation } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { pickActiveInvitation } from "./invitations"

const isoDate = (value: string) => DateTime.toDate(DateTime.makeUnsafe(value))
const slug = Schema.decodeSync(Slug)

describe("pickActiveInvitation", () => {
  it("chooses the most recently created invitation and tiebreaks by slug", () => {
    const older = invitation({
      id: "older",
      orgSlug: slug("zulu"),
      createdAt: isoDate("2026-05-16T12:00:00Z")
    })
    const alpha = invitation({
      id: "alpha",
      orgSlug: slug("alpha"),
      createdAt: isoDate("2026-05-17T12:00:00Z")
    })
    const beta = invitation({
      id: "beta",
      orgSlug: slug("beta"),
      createdAt: isoDate("2026-05-17T12:00:00Z")
    })

    expect(pickActiveInvitation([older, beta, alpha])?.id).toBe("alpha")
  })

  it("returns null for an empty list", () => {
    expect(pickActiveInvitation([])).toBeNull()
  })
})

function invitation(overrides: Partial<UserInvitation> = {}): UserInvitation {
  return {
    id: "invitation",
    orgSlug: slug("acme"),
    orgName: "Acme",
    role: "member",
    inviterEmail: "owner@example.com",
    expiresAt: isoDate("2026-05-18T12:00:00Z"),
    createdAt: isoDate("2026-05-17T12:00:00Z"),
    ...overrides
  }
}
