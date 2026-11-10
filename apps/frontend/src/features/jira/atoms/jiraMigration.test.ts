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
const encoded = (id: string, revision = 1) =>
  Response.json(encodeJiraMigrationDetailSync({ ...detail(id), revision }))

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
import {
  CreatableProjectKey,
  JiraMigrationDetail,
  Slug,
  type JiraMigrationConfiguration
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

const encodeJiraMigrationDetailSync = Schema.encodeSync(JiraMigrationDetail)

const configuration = (name: string): JiraMigrationConfiguration => ({
  destination: {
    name,
    slug: Slug.make("engineering"),
    key: CreatableProjectKey.make("ENG")
  },
  identities: [],
  statuses: [],
  issueTypes: [],
  priorities: [],
  tags: [],
  activeFutureSprintChoices: [],
  restrictedContent: { policy: "exclude" },
  skippedAttachmentIds: [],
  attachmentSkipsAccepted: false
})

const decodeConfigureBody = Schema.decodeUnknownSync(
  Schema.Struct({
    expectedRevision: Schema.Number,
    configuration: Schema.Struct({
      destination: Schema.Struct({ name: Schema.String })
    })
  })
)

describe("configureJiraMigration", () => {
  it("sends rapid saves one at a time, each on the revision the last one returned", async () => {
    let revision = 1
    let inFlight = 0
    let maxInFlight = 0
    const sent: Array<number> = []
    const names: Array<string> = []
    const held: Array<() => void> = []
    const releaseNext = () => held.shift()?.()
    fetchStub.set(async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init)
      if (request.method !== "PUT") return encoded("migration-a", revision)
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      const body = decodeConfigureBody(await request.json())
      sent.push(body.expectedRevision)
      names.push(body.configuration.destination.name)
      await new Promise<void>((resolve) => {
        held.push(resolve)
      })
      inFlight -= 1
      if (body.expectedRevision !== revision)
        return new Response(null, { status: 409 })
      revision += 1
      return encoded("migration-a", revision)
    })

    const registry = Registry.make()
    const req = jiraMigrationRequest("org", "migration-a")
    const view = jiraMigration(req)
    const save = configureJiraMigration(req)
    registry.mount(view)
    registry.mount(save)

    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ value: { revision: 1 } })
      )
      registry.set(save, { configuration: configuration("One") })
      await vi.waitFor(() => expect(held).toHaveLength(1))
      registry.set(save, { configuration: configuration("Two") })
      registry.set(save, { configuration: configuration("Three") })
      releaseNext()
      await vi.waitFor(() => expect(held).toHaveLength(1))
      registry.set(save, { configuration: configuration("Four") })
      releaseNext()
      await vi.waitFor(() => expect(held).toHaveLength(1))
      releaseNext()
      await vi.waitFor(() => {
        expect(registry.get(save).waiting).toBe(false)
        expect(inFlight).toBe(0)
      })

      expect(maxInFlight).toBe(1)
      expect(sent).toEqual([1, 2, 3])
      expect(names).toEqual(["One", "Three", "Four"])
      expect(registry.get(save)._tag).toBe("Success")
      expect(registry.get(view)).toMatchObject({ value: { revision: 4 } })
    } finally {
      held.forEach((release) => release())
      registry.dispose()
    }
  })
})
