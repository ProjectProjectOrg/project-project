import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import { Tools } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"

import { catalogEntries } from "./catalog"
import { toolInput } from "./input"
import { groupFilter, parseSort } from "./shaping"

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

  it("offer enum values as choices and describe each flag", () => {
    const fields = Object.fromEntries(
      entry("list_tickets").fields.map((field) => [field.name, field])
    )
    expect(fields["type"]?.choices).toEqual([
      "feat",
      "bug",
      "chore",
      "other",
      "epic"
    ])
    expect(fields["estimate"]?.choices).toContain("stale")
    expect(fields["assignee"]?.choices).toBeUndefined()
    expect(fields["sort"]?.description).toContain("`key`")
    for (const field of entry("create_ticket").fields) {
      expect(field.description, field.name).toBeDefined()
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
          tags: [""],
          title: Option.some("null")
        },
        { orgSlug: Option.some("acme"), projectSlug: Option.some("web") }
      )
      expect(input).toMatchObject({ parent: null, tags: [] })
      expect(input).toMatchObject({ title: "null" })
    }).pipe(Effect.provide(BunServices.layer))
  )
})
