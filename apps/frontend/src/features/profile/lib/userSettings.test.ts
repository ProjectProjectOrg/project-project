import { UserId, type User } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { applySettingsPatch } from "./userSettings"

const user: User = {
  id: UserId.make("u1"),
  email: "u@example.test",
  name: "U",
  username: null,
  image: null,
  createdAt: DateTime.toDate(DateTime.makeUnsafe(0)),
  activeOrgSlug: null,
  personalGithub: { connected: true },
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  },
  settings: { avatarSource: null, editorPreference: "github" },
  avatarOptions: [
    { source: "generated", image: null },
    { source: "github", image: "https://avatars.githubusercontent.com/u/1" }
  ]
}

describe("applySettingsPatch", () => {
  it("shows the chosen provider's picture right away", () => {
    const next = applySettingsPatch(user, { avatarSource: "github" })
    expect(next.image).toBe("https://avatars.githubusercontent.com/u/1")
    expect(next.settings.avatarSource).toBe("github")
  })

  it("leaves the avatar alone when only the editor changes", () => {
    const next = applySettingsPatch(
      { ...user, image: "https://example.test/a.png" },
      { editorPreference: "cursor" }
    )
    expect(next.image).toBe("https://example.test/a.png")
    expect(next.settings).toStrictEqual({
      avatarSource: null,
      editorPreference: "cursor"
    })
  })
})
