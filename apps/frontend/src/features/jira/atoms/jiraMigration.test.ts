import { describe, expect, it } from "vitest"

import {
  cancelJiraMigration,
  configureJiraMigration,
  jiraMigration,
  jiraMigrationRequest,
  jiraMigrations,
  jiraOrgRequest,
  runJiraMigration
} from "./jiraMigration"

const fetchStub = stubFetch()
const detail = (id: string): JiraMigrationDetail => ({
  id,
  sourceCloudId: "cloud",
  sourceProjectId: "source",
  sourceProjectKey: "SRC",
  sourceProjectName: "Source",
  status: "ready",
  phase: "configuration",
  revision: 1,
  progress: { phase: "configuration", done: 1, total: 1 },
  destinationProjectSlug: null,
  createdAt: DateTime.makeUnsafe("2026-09-23T00:00:00.000Z"),
  updatedAt: DateTime.makeUnsafe("2026-09-23T00:00:00.000Z"),
  scanSummary: null,
  requirements: null,
  configuration: null,
  failedAttachmentIds: [],
  actions: {
    canConfigure: true,
    canRun: true,
    canRescan: true,
    canCancel: false,
    canRetry: false,
    canDiscard: true
  },
  failure: null,
  reportPath: null,
  finishedAt: null
})
const encoded = (id: string) =>
  Response.json(encodeJiraMigrationDetailSync(detail(id)))

describe("Jira migration atoms", () => {
  it("shares structurally equal view requests and isolates migration mutations", () => {
    const first = jiraMigrationRequest("org", "migration-a")
    const equal = jiraMigrationRequest("org", "migration-a")
    const other = jiraMigrationRequest("org", "migration-b")

    expect(jiraMigration(first)).toBe(jiraMigration(equal))
    expect(jiraMigration(first)).not.toBe(jiraMigration(other))
    expect(jiraMigrations(jiraOrgRequest("org"))).toBe(
      jiraMigrations(jiraOrgRequest("org"))
    )
    expect(configureJiraMigration(first)).toBe(configureJiraMigration(equal))
    expect(configureJiraMigration(first)).not.toBe(
      configureJiraMigration(other)
    )
    expect(runJiraMigration(first)).not.toBe(runJiraMigration(other))
    expect(cancelJiraMigration(first)).not.toBe(cancelJiraMigration(other))
  })

  it("keeps mutation progress with the migration that was edited", async () => {
    let complete = (_response: Response) => {}
    const pending = new Promise<Response>((resolve) => {
      complete = resolve
    })
    fetchStub.set(async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init)
      const id = request.url.includes("migration-a")
        ? "migration-a"
        : "migration-b"
      return request.method === "POST" ? pending : encoded(id)
    })

    const registry = Registry.make()
    const first = jiraMigrationRequest("org", "migration-a")
    const second = jiraMigrationRequest("org", "migration-b")
    const firstView = jiraMigration(first)
    const secondView = jiraMigration(second)
    const firstRun = runJiraMigration(first)
    const secondRun = runJiraMigration(second)
    registry.mount(firstView)
    registry.mount(secondView)
    registry.mount(firstRun)
    registry.mount(secondRun)

    try {
      await vi.waitFor(() => {
        expect(registry.get(firstView)).toMatchObject({
          value: { id: "migration-a" }
        })
        expect(registry.get(secondView)).toMatchObject({
          value: { id: "migration-b" }
        })
      })
      registry.set(firstRun, { expectedRevision: 1 })
      expect(registry.get(firstRun).waiting).toBe(true)
      expect(registry.get(secondRun).waiting).toBe(false)
      expect(registry.get(firstView).waiting).toBe(true)
      expect(registry.get(secondView).waiting).toBe(false)
      complete(encoded("migration-a"))
      await vi.waitFor(() => expect(registry.get(firstRun).waiting).toBe(false))
    } finally {
      complete(encoded("migration-a"))
      registry.dispose()
    }
  })
})
import { JiraMigrationDetail } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

const encodeJiraMigrationDetailSync = Schema.encodeSync(JiraMigrationDetail)
