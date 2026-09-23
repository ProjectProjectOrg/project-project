import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { CommentId, TicketId, UserId } from "@projectproject/shared"
import { expect, it, vi } from "vitest"
import { stubFetch } from "@/api/testFetch"
import {
  comments,
  commentsRequest,
  createComment,
  type CreateCommentKey
} from "./comments"

const fetchStub = stubFetch()
const decodeTicketId = Schema.decodeSync(TicketId)
const decodeCommentId = Schema.decodeSync(CommentId)
const decodeUserId = Schema.decodeSync(UserId)

it("inserts a comment placeholder immediately and swaps in the response", async () => {
  const serverComment = {
    id: decodeCommentId("c_server1"),
    ticketId: decodeTicketId("T-1"),
    projectSlug: "project",
    author: {
      kind: "user",
      user: {
        id: decodeUserId("user-1"),
        email: "luuk@example.com",
        name: "Luuk",
        username: "luuk",
        image: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        activeOrgSlug: "org",
        personalGithub: { connected: true },
        editorPreference: "cursor",
        personalEverhour: {
          connected: false,
          everhourUserId: null,
          name: null,
          email: null,
          lastVerifiedAt: null,
          lastCheckError: null
        }
      }
    },
    origin: "native",
    body: "Immediate comment",
    createdAt: "2026-09-15T10:00:01.000Z",
    editedAt: null
  }
  let persisted = false
  let finish = (_response: Response) => {}
  const created = new Promise<Response>((resolve) => {
    finish = resolve
  })
  fetchStub.set(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    return request.method === "POST"
      ? created
      : Response.json(persisted ? [serverComment] : [])
  })

  const req = commentsRequest("org", "project", decodeTicketId("T-1"))
  const key: CreateCommentKey = {
    req,
    clientId: "client-1",
    createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-09-15T10:00:00.000Z")),
    author: {
      id: decodeUserId("user-1"),
      email: "luuk@example.com",
      name: "Luuk",
      username: "luuk",
      image: null,
      createdAt: DateTime.toDate(
        DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")
      ),
      activeOrgSlug: "org",
      personalGithub: { connected: true },
      editorPreference: "cursor",
      personalEverhour: {
        connected: false,
        everhourUserId: null,
        name: null,
        email: null,
        lastVerifiedAt: null,
        lastCheckError: null
      }
    }
  }
  const registry = Registry.make()
  const list = comments(req)
  const create = createComment(key)
  registry.mount(list)
  registry.mount(create)

  try {
    await vi.waitFor(() =>
      expect(registry.get(list)).toMatchObject({ value: [] })
    )
    registry.set(create, { body: "Immediate comment" })
    expect(registry.get(list)).toMatchObject({
      waiting: true,
      value: [
        {
          key: "client-1",
          pending: true,
          comment: { body: "Immediate comment" }
        }
      ]
    })

    persisted = true
    finish(Response.json(serverComment))

    await vi.waitFor(() =>
      expect(registry.get(list)).toMatchObject({
        value: [
          {
            key: "client-1",
            pending: false,
            comment: { id: "c_server1" }
          }
        ]
      })
    )
  } finally {
    registry.dispose()
  }
})
