import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import { Tools } from "@pp/shared"
import { Command } from "effect/cli"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { Browser } from "../auth/Browser"
import { Loopback } from "../auth/Loopback"
import { ServerStore } from "../servers/ServerStore"
import { fakeHttp, jsonBody } from "../testing"
import { UpdateNotice } from "../update/UpdateNotice"
import { catalogEntries } from "./catalog"
import { toolInput } from "./input"
import { groupFilter, parseSort } from "./shaping"
import { pp } from "./tree"

const entry = (name: string) => {
  const found = catalogEntries.find((candidate) => candidate.name === name)
  if (found === undefined) throw new Error(`no ${name}`)
  return found
}

describe("generated commands", () => {
  it("cover every tool in the catalog, each under its own command", () => {
    expect(catalogEntries.map((e) => e.name).toSorted()).toEqual(
      Object.keys(Tools.tools).toSorted()
    )
    const commands = catalogEntries.map((e) => e.command.join(" "))
    expect(new Set(commands).size).toBe(commands.length)
  })

  it("type each flag from the tool's input schema", () => {
    const kinds = Object.fromEntries(
      entry("list_tickets").fields.map((field) => [field.name, field.kind])
    )
    expect(kinds).toMatchObject({
      status: "strings",
      limit: "integer",
      archived: "boolean",
      q: "string",
      sort: "json"
    })
  })

  it("keep list flags for fields that also accept { add, remove }", () => {
    const kinds = Object.fromEntries(
      entry("update_ticket").fields.map((field) => [field.name, field.kind])
    )
    expect(kinds).toMatchObject({ tags: "strings", assignees: "strings" })
  })

  it("offer enum values as choices and describe each flag", () => {
    const fields = Object.fromEntries(
      entry("list_tickets").fields.map((field) => [field.name, field])
    )
    expect(fields["type"]?.choices).toBeUndefined()
    expect(fields["estimate"]?.choices).toContain("stale")
    expect(fields["assignee"]?.choices).toBeUndefined()
    expect(fields["sort"]?.description).toContain("`key`")
    for (const field of entry("create_ticket").fields) {
      expect(field.description, field.name).toBeDefined()
    }
  })

  it("list a project's types and take any type key, with no template flag", () => {
    expect(entry("list_types").command).toEqual(["types", "list"])
    for (const name of ["create_ticket", "update_ticket"]) {
      const fields = Object.fromEntries(
        entry(name).fields.map((field) => [field.name, field])
      )
      expect(fields["template"], name).toBeUndefined()
      expect(fields["type"], name).toMatchObject({
        kind: "string",
        nullable: true,
        choices: undefined
      })
    }
  })

  it("read --sort as key[:dir], defaulting to the key's natural direction", () => {
    expect(parseSort("updated")).toEqual({ key: "updated", dir: "desc" })
    expect(parseSort("title:desc")).toEqual({ key: "title", dir: "desc" })
    expect(parseSort("size")).toBeUndefined()
    expect(parseSort("title:up")).toBeUndefined()
  })

  it("build the group filter from --kind and --active, or leave it out", () => {
    expect(groupFilter([], Option.none())).toEqual({})
    expect(groupFilter(["epic"], Option.some(false))).toEqual({
      filter: { kind: ["epic"], active: false }
    })
  })

  it.effect("fill org and project from the scope and read @files", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const file = yield* fs.makeTempFileScoped()
      yield* fs.writeFileString(file, "From a file")
      const input = yield* toolInput(
        entry("create_comment").fields,
        { ticketId: "T-1", body: Option.some(`@${file}`) },
        {
          orgSlug: Option.some("acme"),
          projectSlug: Option.some("website")
        }
      )
      expect(input).toEqual({
        orgSlug: "acme",
        projectSlug: "website",
        ticketId: "T-1",
        body: "From a file"
      })
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.effect("parse JSON flags and drop empty repeated flags", () =>
    Effect.gen(function* () {
      const input = yield* toolInput(
        entry("list_tickets").fields,
        {
          status: [],
          sort: Option.some('{"key":"updated","dir":"desc"}'),
          limit: Option.some(5)
        },
        { orgSlug: Option.some("acme"), projectSlug: Option.some("web") }
      )
      expect(input).toEqual({
        orgSlug: "acme",
        projectSlug: "web",
        sort: { key: "updated", dir: "desc" },
        limit: 5
      })
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.effect("turn null into a cleared field and '' into an empty list", () =>
    Effect.gen(function* () {
      const input = yield* toolInput(
        entry("update_ticket").fields,
        {
          id: "T-1",
          parent: Option.some("null"),
          type: Option.some("null"),
          tags: [""],
          title: Option.some("null")
        },
        { orgSlug: Option.some("acme"), projectSlug: Option.some("web") }
      )
      expect(input).toMatchObject({ parent: null, type: null, tags: [] })
      expect(input).toMatchObject({ title: "null" })
    }).pipe(Effect.provide(BunServices.layer))
  )
})

const grace = {
  id: "u-2",
  name: "Grace",
  email: "grace@example.com",
  username: null,
  image: null,
  createdAt: "2026-05-01T00:00:00.000Z",
  activeOrgSlug: null,
  personalGithub: { connected: false },
  settings: { avatarSource: null, editorPreference: "vscode" },
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  },
  avatarOptions: []
}
const linus = { ...grace, id: "u-3", name: "Linus", email: "linus@example.com" }
const assignment = (id: string, personId: string) => ({
  kind: "change",
  id,
  occurredAt: "2026-05-01T00:00:00.000Z",
  actor: { kind: "system", source: "automation" },
  cause: null,
  change: { kind: "assignees_changed", added: [personId], removed: [] }
})

it.effect.each(
  [
    {
      args: ["search", "retry upload", "--limit", "7"],
      tool: "search_tickets",
      input: { q: "retry upload", limit: 7 },
      response: [
        {
          id: "T-2",
          title: "Upload failure",
          match: {
            where: "comment",
            author: "Ada",
            snippet: { text: "Please retry the upload", ranges: [[7, 12]] }
          }
        }
      ],
      visible: ["Upload failure", "Ada", "Please retry the upload"]
    },
    {
      args: ["comments", "T-1"],
      tool: "list_comments",
      input: { id: "T-1" },
      response: [
        {
          id: "c_one",
          ticketId: "T-1",
          projectSlug: "demo",
          origin: "jira",
          author: { kind: "jira", displayName: "Ada", accountId: "jira-ada" },
          body: "Retry the upload.\n\nKeep this second paragraph.",
          createdAt: "2026-05-01T00:00:00.000Z",
          editedAt: null
        }
      ],
      visible: ["Ada", "Retry the upload.\n\nKeep this second paragraph."]
    },
    {
      args: ["activity", "T-1", "--cursor", "older-page"],
      tool: "list_ticket_activity",
      input: { id: "T-1", cursor: "older-page" },
      response: {
        items: [
          {
            kind: "change",
            id: "event-1",
            occurredAt: "2026-05-01T00:00:00.000Z",
            actor: { kind: "system", source: "automation" },
            cause: null,
            change: {
              kind: "relation_added",
              relation: "blockedBy",
              ticket: "T-2"
            }
          }
        ],
        people: [],
        nextCursor: "next-page"
      },
      visible: [
        "automation",
        "relation_added",
        "blockedBy",
        "T-2",
        "--cursor next-page"
      ]
    },
    {
      args: ["activity", "T-1", "--all"],
      tool: "list_ticket_activity",
      input: { id: "T-1" },
      response: {
        items: [assignment("event-1", "u-2")],
        people: [grace],
        nextCursor: "next-page"
      },
      more: {
        items: [assignment("event-2", "u-3")],
        people: [grace, linus],
        nextCursor: null
      },
      expected: {
        items: [assignment("event-1", "u-2"), assignment("event-2", "u-3")],
        people: [grace, linus],
        nextCursor: null
      },
      visible: [
        "Grace",
        "Linus",
        "event-1",
        "event-2",
        "assignees_changed",
        "2026-05-01T00:00:00.000Z"
      ]
    }
  ].flatMap((fixture) => [true, false].map((json) => ({ ...fixture, json })))
)("renders $tool with json=$json through the generated command", (fixture) =>
  Effect.gen(function* () {
    const { args, tool, input, response, visible, json } = fixture
    const sent: Array<unknown> = []
    const printed: Array<string> = []
    yield* Command.runWith(pp, { version: "test" })([
      "tickets",
      ...args,
      "--org",
      "acme",
      "--project",
      "demo",
      ...(json ? ["--json"] : [])
    ]).pipe(
      Effect.provideService(Console.Console, {
        ...globalThis.console,
        log: (...parts: ReadonlyArray<unknown>) => {
          printed.push(parts.join(" "))
        }
      }),
      Effect.provide(
        Layer.mergeAll(
          Browser.layer,
          Loopback.layer,
          Layer.mock(ServerStore, {
            file: "unused-test-store.json",
            select: () =>
              Effect.succeed({
                origin: "https://pp.example.com",
                user: { id: "u-1", name: "Ada", email: "ada@example.com" },
                endpoints: {
                  token: "https://pp.example.com/api/auth/oauth2/token"
                },
                tokens: {
                  accessToken: "test-access",
                  refreshToken: "test-refresh",
                  expiresAt: Number.MAX_SAFE_INTEGER
                }
              })
          }),
          Layer.mock(UpdateNotice, { check: () => Effect.void }),
          fakeHttp((url, request) => {
            expect(url.pathname).toBe(`/api/v1/tools/${tool}`)
            sent.push(jsonBody(request))
            return Response.json(
              "more" in fixture && sent.length > 1 ? fixture.more : response
            )
          })
        ).pipe(Layer.provideMerge(BunServices.layer))
      )
    )
    expect(sent).toEqual(
      "more" in fixture
        ? [
            { limit: 200, orgSlug: "acme", projectSlug: "demo", ...input },
            {
              limit: 200,
              orgSlug: "acme",
              projectSlug: "demo",
              ...input,
              cursor: "next-page"
            }
          ]
        : [{ orgSlug: "acme", projectSlug: "demo", ...input }]
    )
    const output = printed.join("\n")
    if (json)
      expect(
        yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
          output
        )
      ).toEqual("expected" in fixture ? fixture.expected : response)
    else for (const text of visible) expect(output).toContain(text)
  })
)
