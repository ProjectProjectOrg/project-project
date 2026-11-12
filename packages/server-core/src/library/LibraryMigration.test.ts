import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { resolveLibrary } from "@pp/shared"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as Path from "effect/Path"
import * as References from "effect/References"
import { describe, expect } from "vitest"

import { parseMarkdownFile } from "../markdown/fileContent"
import * as Markdown from "../markdown/Markdown"
import * as LibraryDocs from "./LibraryDocs"
import * as LibraryMigration from "./LibraryMigration"

type LogLine = Readonly<{
  message: unknown
  annotations: Readonly<Record<string, unknown>>
}>

const logLines: Array<LogLine> = []

const captureLogs = Logger.layer([
  Logger.make((options) => {
    logLines.push({
      message: options.message,
      annotations: options.fiber.getRef(References.CurrentLogAnnotations)
    })
  })
])

const TestLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const tmpRoot = yield* fs.makeTempDirectoryScoped({
      prefix: "projectproject-library-migration-"
    })
    logLines.length = 0
    return LibraryMigration.layer.pipe(
      Layer.provideMerge(LibraryDocs.layer),
      Layer.provideMerge(Markdown.layer),
      Layer.provideMerge(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ PROJECTS_DIR: tmpRoot })
        )
      ),
      Layer.provideMerge(captureLogs)
    )
  })
).pipe(Layer.provideMerge(BunServices.layer))

const storagePath = (...rest: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const markdown = yield* Markdown.Markdown
    return path.join(markdown.root, "orgs", ...rest)
  })

const write = (content: string, ...rest: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const file = yield* storagePath(...rest)
    yield* fs.makeDirectory(path.dirname(file), { recursive: true })
    yield* fs.writeFileString(file, content)
  })

const read = (...rest: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return parseMarkdownFile(
      yield* fs.readFileString(yield* storagePath(...rest), "utf8")
    )
  })

const exists = (...rest: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.exists(yield* storagePath(...rest))
  })

const list = (...rest: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const entries = yield* fs.readDirectory(yield* storagePath(...rest))
    return entries.toSorted()
  })

const snapshot = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = yield* storagePath()
  const entries = yield* fs.readDirectory(root, { recursive: true })
  const files = yield* Effect.forEach(entries.toSorted(), (entry) =>
    Effect.gen(function* () {
      const file = path.join(root, entry)
      const info = yield* fs.stat(file)
      return info.type === "File"
        ? [[entry, yield* fs.readFileString(file, "utf8")] as const]
        : []
    })
  )
  return Object.fromEntries(files.flat())
})

const templateFile = (
  name: string,
  body: string,
  extra = "priority: high\ntags:\n  - frontend\n"
) =>
  `---\nname: ${name}\nicon: Siren\ndescription: About ${name}\n${extra}---\n\n${body}\n`

const TOMBSTONE = "---\nhidden: true\n---\n"

const PROJECT_MD = (frontmatter: string) =>
  `---\norg: acme\nslug: web\nkey: WEB\nname: Web\ncreatedAt: 2026-09-09T00:00:00.000Z\n${frontmatter}---\n\n# Web\n`

const seedOrg = Effect.gen(function* () {
  yield* write(
    "---\nnote: kept\ntemplateDefaults:\n  bug: bug-report\n  feat: feature\n  chore: feature\n  other: triage\n---\n",
    "acme",
    "library.md"
  )
  yield* write(
    templateFile("Bug report", "Bug body"),
    "acme",
    "templates",
    "bug-report.md"
  )
  yield* write(
    templateFile("Feature", "Feature body"),
    "acme",
    "templates",
    "feature.md"
  )
  yield* write(
    templateFile("Spike", "Spike body"),
    "acme",
    "templates",
    "spike.md"
  )
  yield* write(
    templateFile("Upkeep", "Upkeep body"),
    "acme",
    "templates",
    "epic.md"
  )
  yield* write(
    templateFile("Triage", "Triage body"),
    "acme",
    "templates",
    "triage.md"
  )
  yield* write(
    "---\nicon: NotAnIcon\n---\nraw",
    "acme",
    "templates",
    "broken.md"
  )
})

const seedProject = Effect.gen(function* () {
  yield* write(
    PROJECT_MD("templateDefaults:\n  chore: spike\n"),
    "acme",
    "projects",
    "web",
    "project.md"
  )
  yield* write(
    templateFile("Our bug report", "Project bug body"),
    "acme",
    "projects",
    "web",
    "templates",
    "bug-report.md"
  )
  yield* write(
    templateFile("Retro", "Retro body"),
    "acme",
    "projects",
    "web",
    "templates",
    "retro.md"
  )
  yield* write(TOMBSTONE, "acme", "projects", "web", "templates", "triage.md")
  yield* write(TOMBSTONE, "acme", "projects", "web", "templates", "feature.md")
})

const migrate = Effect.flatMap(LibraryMigration.LibraryMigration, (migration) =>
  migration.migrateTemplates()
)

describe("LibraryMigration (real fs)", () => {
  it.effect(
    "turns org templates and default-template settings into types",
    () =>
      Effect.gen(function* () {
        yield* seedOrg
        const summary = yield* migrate

        expect(summary.failed).toEqual([])
        expect(yield* exists("acme", "templates")).toBe(false)
        expect(yield* list("acme", "types")).toEqual([
          "broken.md",
          "bug.md",
          "chore.md",
          "epic-2.md",
          "feat.md",
          "spike.md",
          "triage.md"
        ])
        expect(yield* read("acme", "types", "bug.md")).toEqual({
          data: {
            name: "Bug",
            icon: "Bug",
            color: "#f16f7e",
            description: "About Bug report",
            priority: "high",
            tags: ["frontend"]
          },
          content: "Bug body\n"
        })
        for (const [file, name] of [
          ["feat.md", "Feature"],
          ["chore.md", "Chore"]
        ] as const) {
          const copy = yield* read("acme", "types", file)
          expect(copy.data.name).toBe(name)
          expect(copy.content).toBe("Feature body\n")
        }
        expect((yield* read("acme", "types", "epic-2.md")).data).toMatchObject({
          name: "Upkeep",
          icon: "Siren"
        })
        expect((yield* read("acme", "types", "triage.md")).data.name).toBe(
          "Triage"
        )
        expect(yield* read("acme", "library.md")).toMatchObject({
          data: { note: "kept" }
        })

        const became = logLines
          .filter(
            (line) =>
              String(line.message) === "library migration: template became type"
          )
          .map((line) => [
            line.annotations.orgSlug,
            line.annotations.projectSlug,
            line.annotations.template,
            line.annotations.type,
            line.annotations.renamed
          ])
        expect(became).toEqual([
          ["acme", null, "bug-report", "bug", true],
          ["acme", null, "epic", "epic-2", true],
          ["acme", null, "feature", "feat", true],
          ["acme", null, "feature", "chore", true],
          ["acme", null, "spike", "spike", false],
          ["acme", null, "triage", "triage", false],
          ["acme", null, "broken", "broken", false]
        ])
      }).pipe(Effect.provide(TestLayer))
  )

  it.effect("migrates a project layer on its own, tombstones included", () =>
    Effect.gen(function* () {
      yield* seedOrg
      yield* seedProject
      const summary = yield* migrate

      expect(summary.failed).toEqual([])
      expect(
        summary.migrated.map((layer) => [layer.orgSlug, layer.projectSlug])
      ).toEqual([
        ["acme", null],
        ["acme", "web"]
      ])
      expect(yield* exists("acme", "projects", "web", "templates")).toBe(false)
      expect(yield* list("acme", "projects", "web", "types")).toEqual([
        "bug.md",
        "chore.md",
        "retro.md",
        "triage.md"
      ])
      expect(yield* read("acme", "projects", "web", "types", "bug.md")).toEqual(
        {
          data: {
            name: "Bug",
            icon: "Bug",
            color: "#f16f7e",
            description: "About Our bug report",
            priority: "high",
            tags: ["frontend"]
          },
          content: "Project bug body\n"
        }
      )
      expect(
        yield* read("acme", "projects", "web", "types", "chore.md")
      ).toMatchObject({ data: { name: "Chore" }, content: "Spike body\n" })
      const project = yield* read("acme", "projects", "web", "project.md")
      expect(project.data).not.toHaveProperty("templateDefaults")
      expect(project.data).toMatchObject({ slug: "web", key: "WEB" })
      expect(project.content.trim()).toBe("# Web")

      const docs = yield* LibraryDocs.LibraryDocs
      const library = resolveLibrary(
        {
          org: yield* docs.readLayer("acme", null),
          project: yield* docs.readLayer("acme", "web")
        },
        false
      )
      const byKey = Object.fromEntries(
        library.types.map((type) => [
          type.key,
          `${type.origin}/${type.shadows ?? "-"}${type.hidden ? "/hidden" : ""}`
        ])
      )
      expect(byKey).toEqual({
        bug: "project/org",
        chore: "project/org",
        epic: "builtin/-",
        "epic-2": "org/-",
        feat: "org/builtin",
        retro: "project/-",
        spike: "org/-",
        triage: "project/org/hidden"
      })
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("changes nothing when it runs a second time", () =>
    Effect.gen(function* () {
      yield* seedOrg
      yield* seedProject
      yield* migrate
      const after = yield* snapshot
      logLines.length = 0

      const again = yield* migrate

      expect(again).toEqual({ migrated: [], failed: [] })
      expect(yield* snapshot).toEqual(after)
      expect(
        logLines.filter((line) =>
          String(line.message).startsWith("library migration")
        )
      ).toEqual([])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("leaves an organization without templates alone", () =>
    Effect.gen(function* () {
      yield* write(PROJECT_MD(""), "acme", "projects", "web", "project.md")
      const before = yield* snapshot

      expect(yield* migrate).toEqual({ migrated: [], failed: [] })
      expect(yield* snapshot).toEqual(before)
      expect(yield* exists("acme", "types")).toBe(false)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("can be run again after a project failed halfway", () =>
    Effect.gen(function* () {
      yield* seedOrg
      yield* seedProject
      yield* write(
        "---\nname: [unclosed\n---\n",
        "acme",
        "projects",
        "api",
        "project.md"
      )
      yield* write(
        templateFile("Api bug", "Api bug body"),
        "acme",
        "projects",
        "api",
        "templates",
        "bug-report.md"
      )

      const first = yield* migrate

      expect(first.failed).toEqual([{ orgSlug: "acme", projectSlug: "api" }])
      expect(yield* exists("acme", "templates", "bug-report.md")).toBe(true)
      expect(yield* exists("acme", "types", "bug.md")).toBe(true)
      expect(yield* exists("acme", "projects", "web", "templates")).toBe(false)
      expect(yield* exists("acme", "projects", "api", "templates")).toBe(true)

      yield* write(
        "---\nname: Bug\nicon: Bug\n---\n\nEdited after the failed run\n",
        "acme",
        "types",
        "bug.md"
      )
      yield* write(
        PROJECT_MD("").replaceAll("web", "api").replaceAll("WEB", "API"),
        "acme",
        "projects",
        "api",
        "project.md"
      )

      const second = yield* migrate

      expect(second.failed).toEqual([])
      expect(
        second.migrated.map((layer) => [layer.orgSlug, layer.projectSlug])
      ).toEqual([
        ["acme", null],
        ["acme", "api"]
      ])
      expect(yield* exists("acme", "templates")).toBe(false)
      expect(yield* exists("acme", "projects", "api", "templates")).toBe(false)
      expect((yield* read("acme", "types", "bug.md")).content.trim()).toBe(
        "Edited after the failed run"
      )
      expect(
        (yield* read("acme", "projects", "api", "types", "bug.md")).content
      ).toBe("Api bug body\n")
      expect((yield* read("acme", "library.md")).data).toEqual({ note: "kept" })
      expect(yield* migrate).toEqual({ migrated: [], failed: [] })
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("removes an org library.md that only held the defaults", () =>
    Effect.gen(function* () {
      yield* write(
        "---\ntemplateDefaults:\n  bug: bug-report\n---\n",
        "solo",
        "library.md"
      )
      yield* write(
        templateFile("Bug report", "Bug body"),
        "solo",
        "templates",
        "bug-report.md"
      )

      yield* migrate

      expect(yield* exists("solo", "library.md")).toBe(false)
      expect(yield* list("solo")).toEqual(["types"])
    }).pipe(Effect.provide(TestLayer))
  )
})
