import { OrgStorageStatus } from "@pp/shared"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import { connectStorage, orgStorage, storageRequest } from "./storage"

const disconnected = Schema.decodeSync(OrgStorageStatus)({
  status: "not_connected",
  endpoint: null,
  bucket: null,
  region: null,
  keyPrefix: null,
  accessKeyIdMasked: null,
  forcePathStyle: true,
  connectedAt: null,
  lastCheckedAt: null,
  lastCheckError: null
})

const connected = Schema.decodeSync(OrgStorageStatus)({
  status: "active",
  endpoint: "https://storage.example.com",
  bucket: "project-files",
  region: "auto",
  keyPrefix: "uploads",
  accessKeyIdMasked: "************MPLE",
  forcePathStyle: true,
  connectedAt: "2026-09-15T10:00:00.000Z",
  lastCheckedAt: "2026-09-15T10:00:00.000Z",
  lastCheckError: null
})

const encode = Schema.encodeSync(OrgStorageStatus)
const fetchStub = stubFetch()

describe("connectStorage", () => {
  it("paints the connected status immediately", async () => {
    let served = disconnected
    let finish: ((response: Response) => void) | undefined
    fetchStub.set((_input, init) => {
      if (init?.method === "PUT") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(Response.json(encode(served)))
    })
    const req = storageRequest("acme")
    const view = orgStorage(req)
    const mutation = connectStorage(req)
    const registry = AtomRegistry.make()
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )

      registry.set(mutation, {
        endpoint: "https://storage.example.com",
        bucket: "project-files",
        region: "auto",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "secret",
        keyPrefix: "uploads",
        forcePathStyle: true
      })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic storage status")
      }
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value).toMatchObject({
        status: "active",
        endpoint: "https://storage.example.com",
        bucket: "project-files",
        accessKeyIdMasked: "****************MPLE"
      })

      served = connected
      finish?.(Response.json(encode(connected)))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })
})
