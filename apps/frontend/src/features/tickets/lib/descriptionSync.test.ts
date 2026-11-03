import { describe, expect, it } from "vitest"

import { remoteBodyAction, type RemoteBodyInput } from "./descriptionSync"

const at = (input: Partial<RemoteBodyInput>): RemoteBodyInput => ({
  incoming: "remote",
  base: "base",
  sent: null,
  current: "base",
  idle: true,
  ...input
})

describe("remoteBodyAction", () => {
  it.each([
    ["the body the editor was built on", at({ incoming: "base" }), "none"],
    [
      "the optimistic echo of an in-flight save",
      at({ incoming: "mine", sent: "mine", current: "mine" }),
      "none"
    ],
    [
      "a remote write identical to the editor's settled content",
      at({ incoming: "same", current: "same" }),
      "adopt"
    ],
    [
      "a whitespace-only remote write, so the next save's base matches the server",
      at({ incoming: "base\n" }),
      "adopt"
    ],
    ["a remote write to an idle editor", at({}), "reload"],
    ["a remote write while editing", at({ idle: false }), "notify"],
    [
      "a remote write during an in-flight save",
      at({ sent: "mine", current: "mine", idle: false }),
      "notify"
    ]
  ])("%s", (_name, input, expected) => {
    expect(remoteBodyAction(input)).toBe(expected)
  })
})
