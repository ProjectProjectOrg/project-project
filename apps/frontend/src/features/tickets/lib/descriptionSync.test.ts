import { expect, it } from "vitest"

import { incomingDescription } from "./descriptionSync"

it("an incoming description merges with keystrokes not saved yet", () => {
  expect(
    incomingDescription({
      loaded: "intro\nsteps",
      current: "intro, typing\nsteps",
      incoming: "intro\nsteps, ticked",
      idle: false,
      uploading: false
    })
  ).toEqual({ kind: "replace", body: "intro, typing\nsteps, ticked" })
})
