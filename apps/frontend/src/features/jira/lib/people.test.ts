import { describe, expect, it } from "vitest"

import {
  applyPeopleSelection,
  invitedEmails,
  inviteValue,
  NEW_INVITE_VALUE,
  peopleSelectValue,
  UNLINKED_VALUE
} from "./people"

const row = { jiraAccountId: "jira-1", projectProjectUserId: undefined }

describe("people choices", () => {
  it("round-trips member, unlinked and invite selections", () => {
    for (const value of [
      "user-1",
      UNLINKED_VALUE,
      inviteValue("jan@acme.nl")
    ]) {
      expect(peopleSelectValue(applyPeopleSelection(row, value))).toBe(value)
    }
  })

  it("keeps a new invite pending until its email is valid", () => {
    const pending = applyPeopleSelection(row, NEW_INVITE_VALUE)
    expect(peopleSelectValue(pending)).toBe(NEW_INVITE_VALUE)
    expect(
      peopleSelectValue({ ...pending, inviteEmail: " Jan@Acme.nl " })
    ).toBe(inviteValue("jan@acme.nl"))
  })

  it("drops the invite email when switching to a member", () => {
    const invited = applyPeopleSelection(row, inviteValue("jan@acme.nl"))
    expect(applyPeopleSelection(invited, "user-1")).toEqual({
      jiraAccountId: "jira-1",
      projectProjectUserId: "user-1"
    })
  })

  it("offers each valid invitee once so variants can share it", () => {
    expect(
      invitedEmails([
        { ...row, projectProjectUserId: null, inviteEmail: "jan@acme.nl" },
        { ...row, projectProjectUserId: null, inviteEmail: "JAN@acme.nl" },
        { ...row, projectProjectUserId: null, inviteEmail: "jan@" },
        { ...row, projectProjectUserId: "user-1" }
      ])
    ).toEqual(["jan@acme.nl"])
  })
})
