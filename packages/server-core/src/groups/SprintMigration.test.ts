import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { expect } from "vitest"

import { parseMarkdownFile } from "../markdown/fileContent"
import * as Markdown from "../markdown/Markdown"
import { migrateProjectSprints } from "./SprintMigration"

const TestLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const tmpRoot = yield* fs.makeTempDirectoryScoped({
      prefix: "projectproject-sprint-migration-"
    })
    return Markdown.layer.pipe(
      Layer.provideMerge(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ PROJECTS_DIR: tmpRoot })
        )
      )
    )
  })
).pipe(Layer.provideMerge(BunServices.layer))

const projectFile = (...rest: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const markdown = yield* Markdown.Markdown
    return path.join(markdown.root, "orgs", "org", "projects", "p", ...rest)
  })

const write = (content: string, ...rest: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const file = yield* projectFile(...rest)
    yield* fs.makeDirectory(path.dirname(file), { recursive: true })
    yield* fs.writeFileString(file, content)
  })

const frontmatterOf = (...rest: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return parseMarkdownFile(
      yield* fs.readFileString(yield* projectFile(...rest), "utf8")
    ).data
  })

const ticket = (id: string, status: string, estimate?: number) =>
  write(
    [
      "---",
      `id: ${id}`,
      `title: ${id}`,
      `status: ${status}`,
      ...(estimate === undefined ? [] : [`estimate: ${estimate}`]),
      "---",
      "",
      `# ${id}`,
      ""
    ].join("\n"),
    "tickets",
    `${id}.md`
  )

const group = (
  id: string,
  kind: string,
  tickets: ReadonlyArray<string>,
  createdAt: string,
  completedAt: string | null = null
) =>
  write(
    [
      "---",
      `id: ${id}`,
      `name: ${id}`,
      `kind: ${kind}`,
      `tickets: [${tickets.join(", ")}]`,
      `color: "#777777"`,
      `completedAt: ${completedAt === null ? "null" : `'${completedAt}'`}`,
      "createdBy: user-1",
      `createdAt: '${createdAt}'`,
      `updatedAt: '${createdAt}'`,
      "---",
      "",
      `# ${id}`,
      ""
    ].join("\n"),
    "groups",
    `${id}.md`
  )

it.effect(
  "migrating gives each ticket the sprint it showed under, snapshots completed sprints and is safe to run again",
  () =>
    Effect.gen(function* () {
      yield* ticket("T-1", "done", 3)
      yield* ticket("T-2", "todo")
      yield* ticket("T-3", "done")
      yield* ticket("T-4", "todo")
      yield* group(
        "G-1",
        "sprint",
        ["T-1", "T-2", "T-3"],
        "2026-01-01T00:00:00.000Z",
        "2026-01-14T00:00:00.000Z"
      )
      yield* group(
        "G-2",
        "sprint",
        ["T-3"],
        "2026-02-01T00:00:00.000Z",
        "2026-02-14T00:00:00.000Z"
      )
      yield* group("G-3", "sprint", ["T-2"], "2026-01-15T00:00:00.000Z")
      yield* group("G-4", "epic", ["T-4"], "2026-01-01T00:00:00.000Z")

      const first = yield* migrateProjectSprints("org", "p")
      const ticketSprints = yield* Effect.forEach(
        ["T-1", "T-2", "T-3", "T-4"],
        (id) =>
          Effect.map(
            frontmatterOf("tickets", `${id}.md`),
            (data) => data.sprint
          )
      )
      const [completed, newerCompleted, open, epic] = yield* Effect.forEach(
        ["G-1", "G-2", "G-3", "G-4"],
        (id) => frontmatterOf("groups", `${id}.md`)
      )
      const again = yield* migrateProjectSprints("org", "p")

      expect(first).toEqual({
        orgSlug: "org",
        projectSlug: "p",
        sprints: 3,
        tickets: 3
      })
      expect(ticketSprints).toEqual(["G-1", "G-3", "G-2", undefined])
      expect(completed.tickets).toBeUndefined()
      expect(completed.snapshot).toEqual([
        { id: "T-1", status: "done", estimate: 3 },
        { id: "T-2", status: "todo" },
        { id: "T-3", status: "done" }
      ])
      expect(newerCompleted.snapshot).toEqual([{ id: "T-3", status: "done" }])
      expect(open.tickets).toBeUndefined()
      expect(open.snapshot).toBeUndefined()
      expect(epic.tickets).toEqual(["T-4"])
      expect(again).toBeNull()
    }).pipe(Effect.provide(TestLayer))
)
