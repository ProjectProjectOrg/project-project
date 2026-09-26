import * as Option from "effect/Option"
import { expect, it } from "vitest"

import type { SavedServer } from "./model"
import { startLocation } from "./startLocation"

const server = (
  instanceId: string,
  orgSlugs: ReadonlyArray<string>
): SavedServer => ({
  instanceId,
  origin: `https://${instanceId}.example`,
  name: instanceId,
  logo: null,
  protocolVersion: 1,
  user: null,
  orgs: orgSlugs.map((slug) => ({ slug, name: slug }))
})

it("opens the last used org while it is still on a saved server", () => {
  const servers = [server("a", ["igne"]), server("b", ["client"])]
  expect(
    startLocation(servers, Option.some({ instanceId: "b", orgSlug: "client" }))
  ).toEqual(Option.some({ instanceId: "b", orgSlug: "client" }))
})

it("falls back to the first org when the last one is gone", () => {
  const servers = [server("a", []), server("b", ["client"])]
  expect(
    startLocation(servers, Option.some({ instanceId: "a", orgSlug: "left" }))
  ).toEqual(Option.some({ instanceId: "b", orgSlug: "client" }))
})

it("has nowhere to go while no saved server has an org", () => {
  expect(startLocation([server("a", [])], Option.none())).toEqual(Option.none())
})
