import { expect, it } from "vitest"

import type { SavedServer } from "@/servers/model"

import { orgGroups } from "./switcher"

const server = (
  instanceId: string,
  slugs: ReadonlyArray<string>
): SavedServer => ({
  instanceId,
  origin: `https://${instanceId}.example`,
  name: instanceId,
  logo: null,
  protocolVersion: 1,
  user: null,
  orgs: slugs.map((slug) => ({ slug, name: slug }))
})

it("groups orgs under the servers you're signed in to", () => {
  const groups = orgGroups(
    [
      server("igne", ["igne", "labs"]),
      server("client", ["clientco"]),
      server("empty", [])
    ],
    ["igne", "empty"]
  )
  expect(
    groups.map((group) => [
      group.server.instanceId,
      group.orgs.map((org) => org.slug)
    ])
  ).toEqual([["igne", ["igne", "labs"]]])
})
