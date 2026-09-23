import { describe, expect, it } from "vitest"

import {
  cancelJiraMigrationAtom,
  configureJiraMigrationAtom,
  jiraMigrationAtom,
  jiraMigrationKey,
  jiraMigrationsAtom,
  jiraOrgRequest,
  refreshJiraMigrationAtom,
  runJiraMigrationAtom
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
  Response.json(Schema.encodeSync(JiraMigrationDetail)(detail(id)))

describe("Jira migration atoms", () => {
  it("shares structurally equal view requests and isolates migration mutations", () => {
    const first = jiraMigrationKey("org", "migration-a")
    const equal = jiraMigrationKey("org", "migration-a")
    const other = jiraMigrationKey("org", "migration-b")

    expect(jiraMigrationAtom(first)).toBe(jiraMigrationAtom(equal))
    expect(jiraMigrationAtom(first)).not.toBe(jiraMigrationAtom(other))
    expect(jiraMigrationsAtom(jiraOrgRequest("org"))).toBe(
      jiraMigrationsAtom(jiraOrgRequest("org"))
    )
    expect(configureJiraMigrationAtom(first)).toBe(
      configureJiraMigrationAtom(equal)
    )
    expect(configureJiraMigrationAtom(first)).not.toBe(
      configureJiraMigrationAtom(other)
    )
    expect(runJiraMigrationAtom(first)).not.toBe(runJiraMigrationAtom(other))
    expect(cancelJiraMigrationAtom(first)).not.toBe(
      cancelJiraMigrationAtom(other)
    )
    expect(refreshJiraMigrationAtom(first)).toBe(
      refreshJiraMigrationAtom(equal)
    )
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
    const first = jiraMigrationKey("org", "migration-a")
    const second = jiraMigrationKey("org", "migration-b")
    const firstView = jiraMigrationAtom(first)
    const secondView = jiraMigrationAtom(second)
    const firstRun = runJiraMigrationAtom(first)
    const secondRun = runJiraMigrationAtom(second)
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
import * as Schema from "effect/Schema"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
