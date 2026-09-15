import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { TicketId } from "@projectproject/shared"
import { afterEach, expect, it, vi } from "vitest"
import { stubFetch } from "@/api/testFetch"
import {
  deleteOrgAttachments,
  orgAttachments,
  orgAttachmentsRequest,
  orgAttachmentsSummary,
  uploadAttachment,
  uploadAttachmentRequest
} from "./attachments"

const fetchStub = stubFetch()

afterEach(() => {
  vi.restoreAllMocks()
})

it("refreshes the org inventory and summary only after upload commit succeeds", async () => {
  const attachment = {
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    url: "https://storage.test/image.png",
    filename: "image.png",
    contentType: "image/png",
    byteSize: 4,
    status: "orphaned",
    uploadedBy: "user-1",
    createdAt: "2026-09-09T00:00:00.000Z",
    projectSlug: "project",
    ticketId: "T-1",
    tickets: []
  }
  let committed = false
  const commitStarted = vi.fn()
  let finish = (_response: Response) => {}
  const commit = new Promise<Response>((resolve) => {
    finish = resolve
  })
  fetchStub.set(async (input: RequestInfo | URL) => {
    const path = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    ).pathname
    if (path.endsWith("/prepare"))
      return Response.json({
        id: attachment.id,
        url: attachment.url,
        uploadUrl: attachment.url,
        expiresAt: "2026-09-10T00:00:00.000Z"
      })
    if (path.endsWith("/commit")) {
      commitStarted()
      return commit
    }
    if (path.endsWith("/summary"))
      return Response.json({
        count: committed ? 1 : 0,
        bytes: committed ? 4 : 0,
        byStatus: []
      })
    if (path.endsWith("/attachments"))
      return Response.json({
        total: committed ? 1 : 0,
        items: committed ? [attachment] : []
      })
    throw new Error(`Unexpected request: ${path}`)
  })
  vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(
    function (this: XMLHttpRequest) {
      Object.defineProperty(this, "status", { value: 200 })
      this.dispatchEvent(new Event("load"))
    }
  )

  const registry = Registry.make()
  const req = orgAttachmentsRequest("org", { page: 1 })
  const list = orgAttachments(req)
  const summary = orgAttachmentsSummary(req)
  const upload = uploadAttachment(
    uploadAttachmentRequest(
      "org",
      "project",
      Schema.decodeSync(TicketId)("T-1")
    )
  )
  registry.mount(list)
  registry.mount(summary)
  registry.mount(upload)
  try {
    await vi.waitFor(() => {
      expect(registry.get(list)).toMatchObject({ value: { total: 0 } })
      expect(registry.get(summary)).toMatchObject({ value: { count: 0 } })
    })
    registry.set(upload, {
      file: new File(["data"], "image.png", { type: "image/png" })
    })
    await vi.waitFor(() => expect(commitStarted).toHaveBeenCalledOnce(), {
      timeout: 5000
    })
    expect(registry.get(list)).toMatchObject({
      value: { total: 0 },
      waiting: false
    })
    expect(registry.get(summary)).toMatchObject({
      value: { count: 0 },
      waiting: false
    })

    committed = true
    finish(Response.json(attachment))
    await vi.waitFor(() => {
      expect(registry.get(upload)).toMatchObject({ _tag: "Success" })
      expect(registry.get(list)).toMatchObject({
        value: { total: 1, items: [{ id: attachment.id }] }
      })
      expect(registry.get(summary)).toMatchObject({
        value: { count: 1, bytes: 4 }
      })
    })
  } finally {
    registry.dispose()
  }
})

it("updates the attachment list and summary in the same delete tick", async () => {
  const attachment = {
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    url: "https://storage.test/image.png",
    filename: "image.png",
    contentType: "image/png",
    byteSize: 4,
    status: "orphaned",
    uploadedBy: "user-1",
    createdAt: "2026-09-09T00:00:00.000Z",
    projectSlug: "project",
    ticketId: "T-1",
    tickets: []
  }
  let finish = (_response: Response) => {}
  let attachmentDeleted = false
  const removed = new Promise<Response>((resolve) => {
    finish = resolve
  })
  fetchStub.set(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const path = new URL(request.url, "http://localhost").pathname
    if (request.method === "DELETE") return removed
    if (path.endsWith("/summary")) {
      return Response.json({
        count: attachmentDeleted ? 0 : 1,
        bytes: attachmentDeleted ? 0 : 4,
        byStatus: attachmentDeleted
          ? [{ status: "orphaned", count: 0, bytes: 0 }]
          : [{ status: "orphaned", count: 1, bytes: 4 }]
      })
    }
    return Response.json({
      total: attachmentDeleted ? 0 : 1,
      items: attachmentDeleted ? [] : [attachment]
    })
  })

  const req = orgAttachmentsRequest("org", { page: 1 })
  const registry = Registry.make()
  const list = orgAttachments(req)
  const summary = orgAttachmentsSummary(req)
  const remove = deleteOrgAttachments({
    req,
    attachmentIds: [attachment.id]
  })
  registry.mount(list)
  registry.mount(summary)
  registry.mount(remove)

  try {
    await vi.waitFor(() => {
      expect(registry.get(list)).toMatchObject({ value: { total: 1 } })
      expect(registry.get(summary)).toMatchObject({ value: { count: 1 } })
    })
    registry.set(remove, undefined)
    expect(registry.get(list)).toMatchObject({
      waiting: true,
      value: { total: 0, items: [] }
    })
    expect(registry.get(summary)).toMatchObject({
      waiting: true,
      value: { count: 0, bytes: 0 }
    })
    attachmentDeleted = true
    finish(new Response(null, { status: 204 }))
    await vi.waitFor(() => {
      expect(registry.get(remove)).toMatchObject({
        _tag: "Success",
        waiting: false
      })
      expect(registry.get(list)).toMatchObject({
        waiting: false,
        value: { total: 0, items: [] }
      })
      expect(registry.get(summary)).toMatchObject({
        waiting: false,
        value: { count: 0, bytes: 0 }
      })
    })
  } finally {
    registry.dispose()
  }
})
