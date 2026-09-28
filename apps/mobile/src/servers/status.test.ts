import { appProtocolVersion } from "@pp/shared"
import { expect, it } from "vitest"

import type { SavedServer } from "./model"
import { statusOf } from "./status"

const server: SavedServer = {
  instanceId: "instance-1",
  origin: "https://pp.example",
  name: "Igne",
  logo: null,
  protocolVersion: appProtocolVersion,
  user: null,
  orgs: []
}

const checked = (instanceId: string) => ({
  origin: server.origin,
  descriptor: {
    instanceId,
    name: "Igne",
    logo: null,
    serverVersion: "dev",
    protocolVersion: appProtocolVersion
  }
})

it("reports connected only for the same instance with tokens", () => {
  expect(statusOf(server, checked("instance-1"), true)).toBe("connected")
  expect(statusOf(server, checked("instance-1"), false)).toBe("signed_out")
  expect(statusOf(server, checked("someone-else"), true)).toBe("moved")
})
