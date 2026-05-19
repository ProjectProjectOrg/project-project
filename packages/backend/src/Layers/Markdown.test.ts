import { BunContext } from "@effect/platform-bun"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import * as fsp from "node:fs/promises"
import * as os from "node:os"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Markdown } from "../Services/Markdown"
import { MarkdownLive } from "./Markdown"

let tmpRoot = ""

beforeEach(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "projectproject-md-"))
})

afterEach(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true })
})

const liveLayer = () =>
  MarkdownLive.pipe(
    Layer.provide(BunContext.layer),
    Layer.provideMerge(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(new Map([["PROJECTS_DIR", tmpRoot]]))
      )
    )
  )

const run = <A, E>(eff: Effect.Effect<A, E, Markdown>) =>
  Effect.runPromise(
    eff.pipe(Effect.provide(liveLayer())) as Effect.Effect<A, E, never>
  )

const projectFrontmatter = (slug: string) => ({
  org: "acme",
  slug,
  key: "T",
  name: slug,
  createdBy: "user-1",
  createdAt: "2026-05-19T00:00:00.000Z",
  members: []
})

const ticketFrontmatter = (id: string) => ({
  id,
  title: id,
  status: "todo",
  type: "other",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  lastTransitionedPr: null,
  assignees: [],
  createdBy: "user-1",
  createdAt: "2026-05-19T00:00:00.000Z",
  updatedAt: "2026-05-19T00:00:00.000Z"
})

describe("Markdown deletion (real fs)", () => {
  it("removeTicketFile removes the file and listTicketIds reflects it", async () => {
    const beforeIds = await run(
      Effect.gen(function* () {
        const md = yield* Markdown
        yield* md.createTicketFile(
          "acme",
          "foo",
          "T-1",
          ticketFrontmatter("T-1"),
          "# T-1 body\n"
        )
        return yield* md.listTicketIds("acme", "foo")
      })
    )
    expect(beforeIds).toEqual(["T-1"])

    const filePath = path.join(
      tmpRoot,
      "orgs",
      "acme",
      "projects",
      "foo",
      "tickets",
      "T-1.md"
    )
    expect(await fsp.stat(filePath).then(() => true)).toBe(true)

    await run(
      Effect.gen(function* () {
        const md = yield* Markdown
        yield* md.removeTicketFile("acme", "foo", "T-1")
      })
    )

    const exists = await fsp
      .stat(filePath)
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(false)

    const afterIds = await run(
      Effect.gen(function* () {
        const md = yield* Markdown
        return yield* md.listTicketIds("acme", "foo")
      })
    )
    expect(afterIds).toEqual([])
  })

  it("removeProjectDir removes the entire project tree including tickets", async () => {
    await run(
      Effect.gen(function* () {
        const md = yield* Markdown
        yield* md.writeProjectFile(
          "acme",
          "foo",
          projectFrontmatter("foo"),
          "# Foo\n"
        )
        yield* md.createTicketFile(
          "acme",
          "foo",
          "T-1",
          ticketFrontmatter("T-1"),
          "# T-1\n"
        )
        yield* md.createTicketFile(
          "acme",
          "foo",
          "T-2",
          ticketFrontmatter("T-2"),
          "# T-2 with notes\n"
        )
      })
    )

    const dir = path.join(tmpRoot, "orgs", "acme", "projects", "foo")
    expect(await fsp.stat(dir).then(() => true)).toBe(true)

    await run(
      Effect.gen(function* () {
        const md = yield* Markdown
        yield* md.removeProjectDir("acme", "foo")
      })
    )

    const exists = await fsp
      .stat(dir)
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(false)

    const ids = await run(
      Effect.gen(function* () {
        const md = yield* Markdown
        return yield* md.listTicketIds("acme", "foo")
      })
    )
    expect(ids).toEqual([])
  })

  it("project re-created under same slug after removeProjectDir is empty of old tickets", async () => {
    await run(
      Effect.gen(function* () {
        const md = yield* Markdown
        yield* md.writeProjectFile(
          "acme",
          "foo",
          projectFrontmatter("foo"),
          "# Foo\n"
        )
        yield* md.createTicketFile(
          "acme",
          "foo",
          "T-1",
          ticketFrontmatter("T-1"),
          "# leaked notes\n"
        )
        yield* md.removeProjectDir("acme", "foo")
        yield* md.writeProjectFile(
          "acme",
          "foo",
          projectFrontmatter("foo"),
          "# Foo (recreated)\n"
        )
      })
    )

    const ids = await run(
      Effect.gen(function* () {
        const md = yield* Markdown
        return yield* md.listTicketIds("acme", "foo")
      })
    )
    expect(ids).toEqual([])
  })
})
