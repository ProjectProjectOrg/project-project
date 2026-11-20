import { describe, expect, it } from "vitest"

import {
  avatarOptions,
  effectiveAvatarSource,
  googlePicture
} from "./providerAvatar"

const idToken = (claims: object) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`

describe("googlePicture", () => {
  it("reads the picture claim", () => {
    expect(googlePicture(idToken({ picture: "https://g.test/p.png" }))).toBe(
      "https://g.test/p.png"
    )
  })

  it("is null without a usable token", () => {
    expect(googlePicture(null)).toBeNull()
    expect(googlePicture("not-a-jwt")).toBeNull()
    expect(googlePicture(idToken({}))).toBeNull()
  })
})

describe("avatarOptions", () => {
  it("offers default plus one option per linked provider, in a fixed order", () => {
    expect(
      avatarOptions([
        {
          providerId: "google",
          accountId: "g",
          idToken: idToken({ picture: "https://g.test/p.png" })
        },
        { providerId: "microsoft", accountId: "m", idToken: null },
        { providerId: "github", accountId: "7", idToken: null },
        { providerId: "github", accountId: "8", idToken: null }
      ])
    ).toStrictEqual([
      { source: "generated", image: null },
      {
        source: "github",
        image: "https://avatars.githubusercontent.com/u/7?v=4"
      },
      { source: "google", image: "https://g.test/p.png" }
    ])
  })
})

describe("effectiveAvatarSource", () => {
  const options = avatarOptions([
    { providerId: "github", accountId: "7", idToken: null }
  ])

  it("keeps a stored choice that is still linked", () => {
    expect(effectiveAvatarSource("github", "stale", options)).toBe("github")
  })

  it("falls back to the option showing the current image", () => {
    expect(effectiveAvatarSource("google", null, options)).toBe("generated")
  })

  it("is null when nothing matches", () => {
    expect(
      effectiveAvatarSource(null, "https://legacy.test/a.png", options)
    ).toBeNull()
  })
})
