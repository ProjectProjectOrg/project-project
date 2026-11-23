import { GroupId, type ProjectChange, TicketId } from "@pp/shared"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { beforeAll, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { fireMutation } from "@/api/viewMutation"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { invalidateProjectKeys } from "@/features/projects/atoms/projectChanges"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import {
  sprintDetail,
  sprintRequest
} from "@/features/sprints/atoms/sprintDetail"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  ticketSubscribers,
  ticketSubscribersRequest
} from "@/features/subscriptions/atoms/ticketSubscribers"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"

import { changeKeys, resyncKeys } from "./projectChanges"

const fetchStub = stubFetch()
const params = { orgSlug: "org", slug: "project" }
const t1 = Schema.decodeSync(TicketId)("T-1")
const t2 = Schema.decodeSync(TicketId)("T-2")
const g1 = Schema.decodeSync(GroupId)("G-1")
const base = "/api/orgs/org/projects/project"

type Probe = Atom.Atom<AsyncResult.AsyncResult<unknown, unknown>>

const probes = {
  [`${base}/tickets/T-1`]: ticketDetail(ticketRequest("org", "project", t1)),
  [`${base}/tickets/T-1/comments`]: comments(
    commentsRequest("org", "project", t1)
  ),
  [`${base}/tickets/T-2/comments`]: comments(
    commentsRequest("org", "project", t2)
  ),
  [`${base}/tickets/T-1/subscribers`]: ticketSubscribers(
    ticketSubscribersRequest("org", "project", t1)
  ),
  [`${base}/groups`]: sprintList(sprintListRequest("org", "project")),
  [`${base}/groups/G-1`]: sprintDetail(sprintRequest("org", "project", g1)),
  [base]: project(projectRequest("org", "project"))
} satisfies Record<string, Probe>
const reads: ReadonlyArray<Probe> = Object.values(probes)

beforeAll(() => {
  vi.stubGlobal("window", new EventTarget())
  vi.stubGlobal("document", { visibilityState: "visible" })
})

const refreshedBy = async (keys: ReturnType<typeof resyncKeys>) => {
  const fetched = new Set<string>()
  fetchStub.set((input) => {
    fetched.add(new URL(new Request(input).url).pathname)
    return Promise.resolve(Response.json([]))
  })
  const registry = AtomRegistry.make()
  for (const read of reads) registry.mount(read)
  await vi.waitFor(() =>
    expect([...fetched].toSorted()).toEqual(Object.keys(probes).toSorted())
  )
  fetched.clear()
  await fireMutation(registry, invalidateProjectKeys, keys)
  await vi.waitFor(() =>
    expect(reads.filter((read) => registry.get(read).waiting)).toEqual([])
  )
  registry.dispose()
  return [...fetched].map((path) => path.slice(base.length) || "/").toSorted()
}

const change = (value: ProjectChange) => changeKeys(params, value)

it.each([
  [
    "a ticket change refreshes the ticket's reads",
    change({ kind: "tickets", id: t1 }),
    ["/tickets/T-1", "/tickets/T-1/subscribers"]
  ],
  [
    "a comment change refreshes that ticket's comments",
    change({ kind: "comments", id: t1 }),
    ["/tickets/T-1/comments", "/tickets/T-1/subscribers"]
  ],
  [
    "a comment change without a ticket refreshes every ticket's comments",
    change({ kind: "comments", id: null }),
    [
      "/groups/G-1",
      "/tickets/T-1/comments",
      "/tickets/T-1/subscribers",
      "/tickets/T-2/comments"
    ]
  ],
  [
    "a subscriber change refreshes that ticket's subscribers",
    change({ kind: "subscribers", id: t1 }),
    ["/tickets/T-1/subscribers"]
  ],
  [
    "a subscriber change without a ticket refreshes every ticket's reads",
    change({ kind: "subscribers", id: null }),
    ["/tickets/T-1", "/tickets/T-1/subscribers"]
  ],
  [
    "a sprint change refreshes the sprint list and that sprint",
    change({ kind: "sprints", id: g1 }),
    ["/groups", "/groups/G-1"]
  ],
  [
    "a sprint change without a sprint refreshes the list and every sprint",
    change({ kind: "sprints", id: null }),
    ["/groups", "/groups/G-1", "/tickets/T-1/comments", "/tickets/T-2/comments"]
  ],
  ...[
    ["a project change", change({ kind: "project", id: null })] as const,
    ["a reconnect", resyncKeys(params)] as const
  ].map(([name, keys]) => [
    `${name} refreshes every read in the project`,
    keys,
    [
      "/",
      "/groups",
      "/groups/G-1",
      "/tickets/T-1",
      "/tickets/T-1/comments",
      "/tickets/T-1/subscribers",
      "/tickets/T-2/comments"
    ]
  ])
])("%s", async (_, keys, expected) => {
  expect(await refreshedBy(keys)).toEqual(expected)
})
