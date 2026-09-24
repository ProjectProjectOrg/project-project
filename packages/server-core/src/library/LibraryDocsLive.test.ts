import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { BlockDraft, TemplateDraft, TemplateKey } from "@pp/shared"
import * as Config from "effect/Config"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { describe, expect } from "vitest"

import { Markdown } from "../markdown/Markdown"
import { MarkdownLive } from "../markdown/MarkdownLive"
import { LibraryDocs } from "./LibraryDocs"
import { LibraryDocsLive } from "./LibraryDocsLive"

const TestLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const tmpRoot = yield* fs.makeTempDirectoryScoped({
      prefix: "projectproject-library-"
    })
    return LibraryDocsLive.pipe(
      Layer.provideMerge(MarkdownLive),
      Layer.provideMerge(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ PROJECTS_DIR: tmpRoot })
        )
      )
    )
  })
).pipe(Layer.provideMerge(BunServices.layer))

const block = Schema.decodeUnknownSync(BlockDraft)({
  key: "acceptance-criteria",
  name: "Acceptance criteria",
  icon: "ListChecks",
  color: "#70b445",
  description: "What must be true for this to be done",
  sync: false,
  content:
    "## Acceptance criteria\n\n- [ ] {{Given a state, then this}}\n- [ ] "
})

const template = Schema.decodeUnknownSync(TemplateDraft)({
  key: "bug-report",
  name: "Bug report",
  icon: "Bug",
  color: null,
  description: "Something is broken",
  type: "bug",
  priority: "med",
  tags: ["frontend"],
  body: '<block type="expected-vs-actual">\n\n</block>'
})

const templateKey = Schema.decodeUnknownSync(TemplateKey)

const libraryPath = (...segments: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const root = yield* Config.string("PROJECTS_DIR")
    return path.join(root, "orgs", ...segments)
  })

describe("LibraryDocs (real fs)", () => {
  it.effect("writes nothing to disk until the first write", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs
      const fs = yield* FileSystem.FileSystem
      const layer = yield* docs.readLayer("acme", null)
      const projectLayer = yield* docs.readLayer("acme", "web")

      expect(layer).toEqual({
        blocks: [],
        templates: [],
        hiddenBlocks: [],
        hiddenTemplates: []
      })
      expect(projectLayer).toEqual(layer)
      expect(yield* fs.exists(yield* libraryPath("acme"))).toBe(false)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("keeps org template defaults in orgs/<org>/library.md", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs
      const fs = yield* FileSystem.FileSystem
      const file = yield* libraryPath("acme", "library.md")

      expect(yield* docs.readOrgDefaults("acme")).toEqual({})
      yield* docs.writeOrgDefaults("acme", {
        bug: templateKey("bug-report"),
        other: null
      })
      expect(yield* docs.readOrgDefaults("acme")).toEqual({
        bug: "bug-report",
        other: null
      })
      const raw = yield* fs.readFileString(file, "utf8")
      expect(raw).toContain("templateDefaults:")
      expect(raw).toContain("bug: bug-report")

      yield* fs.writeFileString(
        file,
        "---\nnote: kept\ntemplateDefaults:\n  bug: Not A Key\n  feat: feature\n---\n"
      )
      expect(yield* docs.readOrgDefaults("acme")).toEqual({ feat: "feature" })
      yield* docs.writeOrgDefaults("acme", {})
      const cleared = yield* fs.readFileString(file, "utf8")
      expect(cleared).toContain("note: kept")
      expect(cleared).not.toContain("templateDefaults")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("writes org and project files at the documented paths", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs
      const markdown = yield* Markdown
      const fs = yield* FileSystem.FileSystem

      yield* docs.writeBlock("acme", null, block)
      yield* docs.writeTemplate("acme", "web", template)

      const orgFile = yield* libraryPath(
        "acme",
        "blocks",
        "acceptance-criteria.md"
      )
      const projectFile = yield* libraryPath(
        "acme",
        "projects",
        "web",
        "templates",
        "bug-report.md"
      )
      expect(yield* fs.exists(orgFile)).toBe(true)
      expect(yield* fs.exists(projectFile)).toBe(true)
      expect(markdown.libraryDir("acme", "web", "templates")).toBe(
        projectFile.slice(0, -"/bug-report.md".length)
      )
      expect(
        yield* fs.readDirectory(yield* libraryPath("acme", "blocks"))
      ).toEqual(["acceptance-criteria.md"])

      const raw = yield* fs.readFileString(orgFile, "utf8")
      expect(raw).toContain("name: Acceptance criteria")
      expect(raw).not.toContain("key:")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("round-trips definitions through the frontmatter codec", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs
      yield* docs.writeBlock("acme", "web", block)
      yield* docs.writeTemplate("acme", "web", template)

      const layer = yield* docs.readLayer("acme", "web")

      expect(layer.blocks).toEqual([block])
      expect(layer.templates).toEqual([template])
      expect(yield* docs.readLayer("acme", null)).toEqual({
        blocks: [],
        templates: [],
        hiddenBlocks: [],
        hiddenTemplates: []
      })
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("fills defaults for sparse hand-written frontmatter", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs
      const markdown = yield* Markdown
      yield* markdown.writeLibraryFile(
        "acme",
        null,
        "blocks",
        "notes",
        "---\nname: Notes\n---\n\n## Notes\n"
      )

      const layer = yield* docs.readLayer("acme", null)

      expect(layer.blocks).toEqual([
        {
          key: "notes",
          name: "Notes",
          icon: "Square",
          color: null,
          description: "",
          sync: false,
          content: "## Notes"
        }
      ])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("reads a tombstone as a hidden key", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs
      const fs = yield* FileSystem.FileSystem
      yield* docs.writeTombstone("acme", "web", "blocks", "context")
      yield* docs.writeTombstone("acme", "web", "templates", "chore")

      const layer = yield* docs.readLayer("acme", "web")
      const raw = yield* fs.readFileString(
        yield* libraryPath("acme", "projects", "web", "blocks", "context.md"),
        "utf8"
      )

      expect(layer.hiddenBlocks).toEqual(["context"])
      expect(layer.hiddenTemplates).toEqual(["chore"])
      expect(layer.blocks).toEqual([])
      expect(raw).toBe("---\nhidden: true\n---\n")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("replaces a definition with a tombstone and removes it", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs
      yield* docs.writeBlock("acme", null, block)
      yield* docs.writeTombstone("acme", null, "blocks", block.key)

      const hidden = yield* docs.readLayer("acme", null)
      const removed = yield* docs.remove("acme", null, "blocks", block.key)
      const again = yield* docs.remove("acme", null, "blocks", block.key)
      const after = yield* docs.readLayer("acme", null)

      expect(hidden.blocks).toEqual([])
      expect(hidden.hiddenBlocks).toEqual([block.key])
      expect(removed).toBe(true)
      expect(again).toBe(false)
      expect(after.hiddenBlocks).toEqual([])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("skips files it cannot decode", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs
      const markdown = yield* Markdown
      const fs = yield* FileSystem.FileSystem
      yield* markdown.writeLibraryFile(
        "acme",
        null,
        "blocks",
        "broken",
        "---\nicon: NotAnIcon\n---\n"
      )
      yield* markdown.writeLibraryFile(
        "acme",
        null,
        "templates",
        "blank",
        "---\nname: Blank\n---\n"
      )
      yield* fs.writeFileString(
        yield* libraryPath("acme", "blocks", "Bad_Key.md"),
        "---\nname: Bad\n---\n"
      )

      const layer = yield* docs.readLayer("acme", null)

      expect(layer.blocks).toEqual([])
      expect(layer.templates).toEqual([])

      expect(yield* docs.hasFile("acme", null, "blocks", "broken")).toBe(true)
      expect(yield* docs.hasFile("acme", null, "blocks", "missing")).toBe(false)
      expect(yield* docs.hasFile("acme", null, "templates", "blank")).toBe(true)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("reads a CRLF definition file with LF content", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs
      const markdown = yield* Markdown
      yield* markdown.writeLibraryFile(
        "acme",
        null,
        "blocks",
        "definition-of-done",
        "---\r\nname: Definition of done\r\nsync: true\r\n---\r\n\r\n## Definition of done\r\n\r\n- [ ] Tests\r\n"
      )

      const layer = yield* docs.readLayer("acme", null)

      expect(layer.blocks[0]?.sync).toBe(true)
      expect(layer.blocks[0]?.content).toBe(
        "## Definition of done\n\n- [ ] Tests"
      )
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("rejects unsafe keys and slugs", () =>
    Effect.gen(function* () {
      const markdown = yield* Markdown
      const badKey = yield* markdown
        .writeLibraryFile("acme", null, "blocks", "../escape", "x")
        .pipe(Effect.flip)
      const badProject = yield* markdown
        .listLibraryFiles("acme", "../other", "blocks")
        .pipe(Effect.flip)
      const tooLong = yield* markdown
        .removeLibraryFile("acme", null, "templates", "a".repeat(49))
        .pipe(Effect.flip)

      expect(badKey._tag).toBe("MarkdownError")
      expect(badProject._tag).toBe("MarkdownError")
      expect(tooLong._tag).toBe("MarkdownError")
    }).pipe(Effect.provide(TestLayer))
  )
})
