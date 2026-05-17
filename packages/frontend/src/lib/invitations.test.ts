import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"
import {
  acceptInvitations,
  filterActionableInvitations,
  pickActiveInvite,
  type PendingInvite,
  type RawInvitation
} from "./invitations"

const isoDate = (value: string) => DateTime.toDate(DateTime.unsafeMake(value))
const now = isoDate("2026-05-17T12:00:00Z")

describe("filterActionableInvitations", () => {
  it("keeps pending unexpired invites matching email case-insensitively", () => {
    const invites: RawInvitation[] = [
      rawInvite({
        id: "ok",
        email: "Invited@Example.com",
        status: "pending",
        expiresAt: "2026-05-18T12:00:00Z"
      }),
      rawInvite({
        id: "accepted",
        email: "invited@example.com",
        status: "accepted",
        expiresAt: "2026-05-18T12:00:00Z"
      }),
      rawInvite({
        id: "rejected",
        email: "invited@example.com",
        status: "rejected",
        expiresAt: "2026-05-18T12:00:00Z"
      }),
      rawInvite({
        id: "cancelled",
        email: "invited@example.com",
        status: "canceled",
        expiresAt: "2026-05-18T12:00:00Z"
      }),
      rawInvite({
        id: "expired",
        email: "invited@example.com",
        status: "pending",
        expiresAt: "2026-05-16T12:00:00Z"
      }),
      rawInvite({
        id: "other-email",
        email: "other@example.com",
        status: "pending",
        expiresAt: "2026-05-18T12:00:00Z"
      })
    ]

    expect(
      filterActionableInvitations(invites, " invited@example.COM ", now).map(
        (invite) => invite.id
      )
    ).toEqual(["ok"])
  })
})

describe("pickActiveInvite", () => {
  it("chooses the most recently created invite and tiebreaks by slug", () => {
    const older = pendingInvite({
      id: "older",
      organizationSlug: "zulu",
      createdAt: isoDate("2026-05-16T12:00:00Z")
    })
    const alpha = pendingInvite({
      id: "alpha",
      organizationSlug: "alpha",
      createdAt: isoDate("2026-05-17T12:00:00Z")
    })
    const beta = pendingInvite({
      id: "beta",
      organizationSlug: "beta",
      createdAt: isoDate("2026-05-17T12:00:00Z")
    })

    expect(pickActiveInvite([older, beta, alpha])?.id).toBe("alpha")
  })
})

describe("acceptInvitations", () => {
  it("accepts all invites concurrently and reports the most recent success", async () => {
    const calls: string[] = []
    const oldInvite = pendingInvite({
      id: "old",
      organizationSlug: "old",
      createdAt: isoDate("2026-05-15T12:00:00Z")
    })
    const newInvite = pendingInvite({
      id: "new",
      organizationSlug: "new",
      createdAt: isoDate("2026-05-17T12:00:00Z")
    })

    const result = await acceptInvitations([oldInvite, newInvite], async (i) => {
      calls.push(i.id)
    })

    expect(calls).toEqual(["old", "new"])
    expect(result.successes.map((success) => success.invite.id)).toEqual([
      "old",
      "new"
    ])
    expect(result.failures).toEqual([])
    expect(result.activeInvite?.id).toBe("new")
  })

  it("keeps failed rows while committing successful accepts", async () => {
    const ok = pendingInvite({ id: "ok", organizationSlug: "ok" })
    const failed = pendingInvite({ id: "failed", organizationSlug: "failed" })

    const result = await acceptInvitations([ok, failed], async (i) => {
      if (i.id === "failed") throw new Error("failed")
    })

    expect(result.successes.map((success) => success.invite.id)).toEqual(["ok"])
    expect(result.failures.map((failure) => failure.invite.id)).toEqual([
      "failed"
    ])
    expect(result.activeInvite?.id).toBe("ok")
  })
})

function rawInvite(overrides: Partial<RawInvitation> = {}): RawInvitation {
  return {
    id: "invite",
    email: "invited@example.com",
    role: "member",
    organizationId: "org-id",
    organizationName: "Acme",
    inviterId: "user-id",
    status: "pending",
    expiresAt: "2026-05-18T12:00:00Z",
    createdAt: "2026-05-17T12:00:00Z",
    ...overrides
  }
}

function pendingInvite(
  overrides: Partial<PendingInvite> = {}
): PendingInvite {
  return {
    ...rawInvite(),
    organizationSlug: "acme",
    inviterEmail: "owner@example.com",
    expiresAt: isoDate("2026-05-18T12:00:00Z"),
    createdAt: isoDate("2026-05-17T12:00:00Z"),
    ...overrides
  }
}
