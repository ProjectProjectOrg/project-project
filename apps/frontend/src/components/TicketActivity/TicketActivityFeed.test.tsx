import { RegistryContext } from "@effect/atom-react"
import { TicketId, UserId, type Member } from "@pp/shared"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import { TicketActivityFeed } from "./TicketActivityFeed"

const fetchStub = stubFetch()
const userId = Schema.decodeUnknownSync(UserId)
const ticketId = Schema.decodeUnknownSync(TicketId)

const member = (id: string, name: string): Member => ({
  id: userId(id),
  username: null,
  name,
  email: `${id}@example.com`,
  image: null,
  role: "developer"
})

vi.mock("@/routes/_authed/orgs/$orgSlug/projects/$slug/-context", () => ({
  useProject: () => ({
    members: [member("wouter", "Wouter"), member("luuk", "Luuk")]
  })
}))

const user = (id: string, name: string) => ({
  id,
  email: `${id}@example.com`,
  name,
  username: null,
  image: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  activeOrgSlug: null,
  personalGithub: { connected: false },
  editorPreference: "github",
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
})

const minutesAgo = (minutes: number) =>
  DateTime.formatIso(DateTime.subtract(DateTime.nowUnsafe(), { minutes }))

const change = (
  id: string,
  minutes: number,
  actor: unknown,
  body: unknown,
  cause: string | null = null
) => ({
  kind: "change",
  id,
  occurredAt: minutesAgo(minutes),
  actor,
  cause,
  change: body
})

type Page = Readonly<{
  items: ReadonlyArray<unknown>
  people: ReadonlyArray<ReturnType<typeof user>>
  nextCursor: string | null
}>

const serve = (pages: ReadonlyArray<Page>, cursors: Array<string | null>) =>
  fetchStub.set((input) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    )
    if (url.pathname.endsWith("/statuses")) {
      return Promise.resolve(
        Response.json([
          {
            slug: "review",
            label: "In review",
            icon: "Circle",
            color: "#968dfd",
            orderKey: "a",
            createdBy: "wouter",
            createdAt: "2026-01-01T00:00:00.000Z"
          }
        ])
      )
    }
    if (url.pathname.endsWith("/tags")) {
      return Promise.resolve(Response.json([]))
    }
    cursors.push(url.searchParams.get("cursor"))
    return Promise.resolve(Response.json(pages[cursors.length - 1]))
  })

let registry: Registry.AtomRegistry

beforeEach(() => {
  registry = Registry.make()
})

afterEach(() => {
  cleanup()
  registry.dispose()
})

const renderFeed = () =>
  render(
    <RegistryContext.Provider value={registry}>
      <TicketActivityFeed
        orgSlug="acme"
        slug="web"
        ticketId={ticketId("T-7")}
      />
    </RegistryContext.Provider>
  )

const spoken = (element: Element | null | undefined): string => {
  if (!element) return ""
  const copy = element.cloneNode(true)
  if (!(copy instanceof Element)) return ""
  copy.querySelectorAll("[aria-hidden]").forEach((hidden) => hidden.remove())
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim()
}

const groups = () =>
  Array.from(document.querySelectorAll("ol > li:has(> ul)")).map((item) => ({
    actor: spoken(item.querySelector("time")?.previousElementSibling),
    lines: Array.from(item.querySelectorAll("ul > li")).map(spoken)
  }))

describe("TicketActivityFeed", () => {
  it("renders estimate additions, unit changes and clearing", async () => {
    const actor = { kind: "user", user: user("luuk", "Luuk") }
    serve(
      [
        {
          items: [
            change("3", 1, actor, {
              kind: "estimate_changed",
              from: { unit: "time", minutes: 90 },
              to: null
            }),
            change("2", 2, actor, {
              kind: "estimate_changed",
              from: { unit: "points", value: 3 },
              to: { unit: "time", minutes: 90 }
            }),
            change("1", 3, actor, {
              kind: "estimate_changed",
              from: null,
              to: { unit: "points", value: 3 }
            })
          ],
          people: [],
          nextCursor: null
        }
      ],
      []
    )
    renderFeed()
    await waitFor(() =>
      expect(groups()).toEqual([
        {
          actor: "Luuk",
          lines: [
            "estimate 1h 30m to Not estimated",
            "estimate 3 points to 1h 30m",
            "estimate Not estimated to 3 points"
          ]
        }
      ])
    )
  })

  it("groups each person's changes and reads them as lines", async () => {
    const wouter = { kind: "user", user: user("wouter", "Wouter") }
    serve(
      [
        {
          items: [
            change(
              "4",
              2,
              { kind: "system", source: "github" },
              { kind: "pr_merged", number: 42 }
            ),
            change(
              "3",
              14,
              {
                kind: "agent",
                user: user("luuk", "Luuk"),
                client: { id: "c1", name: "Claude" }
              },
              { kind: "status_changed", from: "todo", to: "review" }
            ),
            change(
              "2",
              60,
              wouter,
              { kind: "assignees_changed", added: [], removed: ["luuk"] },
              "member_removed"
            ),
            change("1", 61, wouter, {
              kind: "group_added",
              groupId: "G-1",
              groupKind: "sprint",
              name: "Sprint 4"
            })
          ],
          people: [user("luuk", "Luuk")],
          nextCursor: null
        }
      ],
      []
    )
    renderFeed()
    await waitFor(() => expect(groups()).toHaveLength(3))
    expect(groups()).toEqual([
      { actor: "GitHub", lines: ["merged #42"] },
      { actor: "Luuk via Claude", lines: ["status Todo to In review"] },
      {
        actor: "Wouter",
        lines: [
          "unassigned Luuk when a member was removed",
          "added this to Sprint 4"
        ]
      }
    ])
  })

  it("reveals loaded entries before fetching an older page", async () => {
    const cursors: Array<string | null> = []
    const people = Array.from({ length: 13 }, (_, index) => ({
      kind: "user",
      user: user(`user-${index}`, `User ${index}`)
    }))
    serve(
      [
        {
          items: people.map((actor, index) =>
            change(String(index), index, actor, { kind: "description_edited" })
          ),
          people: [],
          nextCursor: "older"
        },
        {
          items: [
            change(
              "old",
              500,
              { kind: "system", source: "github" },
              { kind: "archived" }
            )
          ],
          people: [],
          nextCursor: null
        }
      ],
      cursors
    )
    renderFeed()
    await waitFor(() => expect(groups()).toHaveLength(12))

    fireEvent.click(screen.getByRole("button", { name: "Show older activity" }))
    expect(groups()).toHaveLength(13)
    expect(cursors).toEqual([null])

    fireEvent.click(screen.getByRole("button", { name: "Show older activity" }))
    await waitFor(() => expect(groups()).toHaveLength(14))
    expect(cursors).toEqual([null, "older"])
  })
})
