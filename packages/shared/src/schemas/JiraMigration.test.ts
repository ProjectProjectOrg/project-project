import { describe, expect, it } from "vitest"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { JiraConnection, JiraProjectChoice, JiraSite } from "./JiraMigration"

const decodeConnection = Schema.decodeUnknownSync(JiraConnection)
const connectedAt = DateTime.makeUnsafe("2026-09-14T12:00:00Z")

describe("JiraMigration schemas", () => {
  it.each([
    {
      status: "disconnected",
      reconnectReason: null,
      connectedAt: null
    },
    {
      status: "connected",
      reconnectReason: null,
      connectedAt
    },
    {
      status: "reconnect_required",
      reconnectReason: "invalid_grant",
      connectedAt
    },
    {
      status: "reconnect_required",
      reconnectReason: "missing_scopes",
      connectedAt
    }
  ])("decodes the $status connection state", (input) => {
    expect(decodeConnection(input).status).toBe(input.status)
  })

  it.each([
    {
      status: "connected",
      reconnectReason: "invalid_grant",
      connectedAt
    },
    {
      status: "disconnected",
      reconnectReason: "missing_scopes",
      connectedAt: null
    },
    {
      status: "reconnect_required",
      reconnectReason: null,
      connectedAt
    }
  ])("rejects a contradictory connection state", (input) => {
    expect(() => decodeConnection(input)).toThrow()
  })

  it("decodes minimal site and project choices", () => {
    const site = Schema.decodeUnknownSync(JiraSite)({
      cloudId: "cloud-1",
      name: "Example",
      url: "https://example.atlassian.net",
      avatarUrl: null
    })
    const project = Schema.decodeUnknownSync(JiraProjectChoice)({
      id: "10000",
      key: "APP",
      name: "Application",
      projectTypeKey: null,
      simplified: null,
      style: null,
      avatarUrl: null
    })

    expect(site.cloudId).toBe("cloud-1")
    expect(project.key).toBe("APP")
  })

  it.each([
    [JiraSite, { cloudId: 1, name: "Example", url: "bad", avatarUrl: null }],
    [
      JiraProjectChoice,
      {
        id: "10000",
        key: null,
        name: "Application",
        projectTypeKey: null,
        simplified: null,
        style: null,
        avatarUrl: null
      }
    ]
  ])("rejects malformed public values", (schema, input) => {
    expect(() => Schema.decodeUnknownSync(schema)(input)).toThrow()
  })
})
