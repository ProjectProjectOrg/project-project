import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { BlockDraft, TypeDraft } from "@pp/shared"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import * as Tracer from "effect/Tracer"
import { describe, expect } from "vitest"

import * as Markdown from "../markdown/Markdown"
import * as LibraryDocs from "./LibraryDocs"

const decodeUnknownBlockDraft = Schema.decodeUnknownEffect(BlockDraft)

const decodeUnknownTypeDraft = Schema.decodeUnknownEffect(TypeDraft)

const TestLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const tmpRoot = yield* fs.makeTempDirectoryScoped({
      prefix: "projectproject-library-"
    })
    return LibraryDocs.layer.pipe(
      Layer.provideMerge(Markdown.layer),
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

const type = Schema.decodeUnknownSync(TypeDraft)({
  key: "bug-report",
  name: "Bug report",
  icon: "Bug",
  color: null,
  description: "Something is broken",
  priority: "med",
  tags: ["frontend"],
  body: '<block type="expected-vs-actual">\n\n</block>'
})

const libraryPath = (org: string, ...rest: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const markdown = yield* Markdown.Markdown
    return path.join(
      path.dirname(markdown.libraryDir(org, null, "blocks")),
      ...rest
    )
  })

describe("LibraryDocs (real fs)", () => {
  it.effect("preserves frontmatter-looking block and type bodies", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs.LibraryDocs
      const body = "---js\nthrow new Error('executed')\n---\nExample"
      const literalBlock = yield* decodeUnknownBlockDraft({
        ...block,
        content: body
      })
      const literalType = yield* decodeUnknownTypeDraft({
        ...type,
        body
      })

      yield* docs.writeBlock("acme", null, literalBlock)
      yield* docs.writeType("acme", null, literalType)

      const layer = yield* docs.readLayer("acme", null)
      expect(layer.blocks).toEqual([literalBlock])
      expect(layer.types).toEqual([literalType])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("writes nothing to disk until the first write", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs.LibraryDocs
      const fs = yield* FileSystem.FileSystem
      const layer = yield* docs.readLayer("acme", null)
      const projectLayer = yield* docs.readLayer("acme", "web")

      expect(layer).toEqual({
        blocks: [],
        types: [],
        hiddenBlocks: [],
        hiddenTypes: []
      })
      expect(projectLayer).toEqual(layer)
      expect(yield* fs.exists(yield* libraryPath("acme"))).toBe(false)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("writes org and project files at the documented paths", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs.LibraryDocs
      const markdown = yield* Markdown.Markdown
      const fs = yield* FileSystem.FileSystem

      yield* docs.writeBlock("acme", null, block)
      yield* docs.writeType("acme", "web", type)

      const orgFile = yield* libraryPath(
        "acme",
        "blocks",
        "acceptance-criteria.md"
      )
      const projectFile = yield* libraryPath(
        "acme",
        "projects",
        "web",
        "types",
        "bug-report.md"
      )
      expect(yield* fs.exists(orgFile)).toBe(true)
      expect(yield* fs.exists(projectFile)).toBe(true)
      expect(markdown.libraryDir("acme", "web", "types")).toBe(
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
      const docs = yield* LibraryDocs.LibraryDocs
      yield* docs.writeBlock("acme", "web", block)
      yield* docs.writeType("acme", "web", type)

      const layer = yield* docs.readLayer("acme", "web")

      expect(layer.blocks).toEqual([block])
      expect(layer.types).toEqual([type])
      expect(yield* docs.readLayer("acme", null)).toEqual({
        blocks: [],
        types: [],
        hiddenBlocks: [],
        hiddenTypes: []
      })
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("fills defaults for sparse hand-written frontmatter", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs.LibraryDocs
      const markdown = yield* Markdown.Markdown
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

  it.effect("reads a type written with the retired type field", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs.LibraryDocs
      const markdown = yield* Markdown.Markdown
      yield* markdown.writeLibraryFile(
        "acme",
        null,
        "types",
        "incident",
        "---\nname: Incident\ntype: bug\npriority: high\n---\n\n## Timeline\n"
      )

      const [incident] = (yield* docs.readLayer("acme", null)).types

      expect(incident?.key).toBe("incident")
      expect(incident?.priority).toBe("high")
      expect(incident === undefined ? false : "type" in incident).toBe(false)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("reads a tombstone as a hidden key", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs.LibraryDocs
      const fs = yield* FileSystem.FileSystem
      yield* docs.writeTombstone("acme", "web", "blocks", "context")
      yield* docs.writeTombstone("acme", "web", "types", "chore")

      const layer = yield* docs.readLayer("acme", "web")
      const raw = yield* fs.readFileString(
        yield* libraryPath("acme", "projects", "web", "blocks", "context.md"),
        "utf8"
      )

      expect(layer.hiddenBlocks).toEqual(["context"])
      expect(layer.hiddenTypes).toEqual(["chore"])
      expect(layer.blocks).toEqual([])
      expect(raw).toBe("---\nhidden: true\n---\n")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("replaces a definition with a tombstone and removes it", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs.LibraryDocs
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
      const docs = yield* LibraryDocs.LibraryDocs
      const markdown = yield* Markdown.Markdown
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
        "types",
        "other",
        "---\nname: Other\n---\n"
      )
      yield* fs.writeFileString(
        yield* libraryPath("acme", "blocks", "Bad_Key.md"),
        "---\nname: Bad\n---\n"
      )

      const layer = yield* docs.readLayer("acme", null)

      expect(layer.blocks).toEqual([])
      expect(layer.types).toEqual([])

      expect(yield* docs.hasFile("acme", null, "blocks", "broken")).toBe(true)
      expect(yield* docs.hasFile("acme", null, "blocks", "missing")).toBe(false)
      expect(yield* docs.hasFile("acme", null, "types", "other")).toBe(true)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("reads a CRLF definition file with LF content", () =>
    Effect.gen(function* () {
      const docs = yield* LibraryDocs.LibraryDocs
      const markdown = yield* Markdown.Markdown
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
      const markdown = yield* Markdown.Markdown
      const badKey = yield* markdown
        .writeLibraryFile("acme", null, "blocks", "../escape", "x")
        .pipe(Effect.flip)
      const badProject = yield* markdown
        .listLibraryFiles("acme", "../other", "blocks")
        .pipe(Effect.flip)
      const tooLong = yield* markdown
        .removeLibraryFile("acme", null, "types", "a".repeat(49))
        .pipe(Effect.flip)

      expect(badKey._tag).toBe("MarkdownError")
      expect(badProject._tag).toBe("MarkdownError")
      expect(tooLong._tag).toBe("MarkdownError")
    }).pipe(Effect.provide(TestLayer))
  )
})

describe("LibraryDocs tracing", () => {
  it.effect(
    "traces each call under one LibraryDocs span with its attributes",
    () =>
      Effect.gen(function* () {
        const spans: Array<Tracer.NativeSpan> = []
        const tracer = Tracer.make({
          span: (options) => {
            const span = new Tracer.NativeSpan(options)
            spans.push(span)
            return span
          }
        })

        yield* Effect.gen(function* () {
          const docs = yield* LibraryDocs.LibraryDocs
          yield* docs.writeBlock("acme", null, block)
          yield* docs.writeType("acme", "web", type)
          yield* docs.writeTombstone(
            "acme",
            "web",
            "blocks",
            "acceptance-criteria"
          )
          yield* docs.readLayer("acme", "web")
          yield* docs.hasFile("acme", null, "blocks", "acceptance-criteria")
          yield* docs.remove("acme", null, "blocks", "acceptance-criteria")
        }).pipe(Effect.withTracer(tracer))

        const at = (orgSlug: string, projectSlug: string | null) => ({
          module: "LibraryDocs",
          orgSlug,
          projectSlug
        })
        expect(
          spans
            .filter((span) => span.name.startsWith("LibraryDocs."))
            .map((span) => ({
              name: span.name,
              parent: Option.match(span.parent, {
                onNone: () => null,
                onSome: (parent) =>
                  parent._tag === "Span" ? parent.name : null
              }),
              attributes: Object.fromEntries(span.attributes)
            }))
        ).toEqual([
          {
            name: "LibraryDocs.writeBlock",
            parent: null,
            attributes: {
              ...at("acme", null),
              operation: "writeBlock",
              key: "acceptance-criteria"
            }
          },
          {
            name: "LibraryDocs.writeType",
            parent: null,
            attributes: {
              ...at("acme", "web"),
              operation: "writeType",
              key: "bug-report"
            }
          },
          {
            name: "LibraryDocs.writeTombstone",
            parent: null,
            attributes: {
              ...at("acme", "web"),
              operation: "writeTombstone",
              kind: "blocks",
              key: "acceptance-criteria"
            }
          },
          {
            name: "LibraryDocs.readLayer",
            parent: null,
            attributes: { ...at("acme", "web"), operation: "readLayer" }
          },
          {
            name: "LibraryDocs.hasFile",
            parent: null,
            attributes: {
              ...at("acme", null),
              operation: "hasFile",
              kind: "blocks",
              key: "acceptance-criteria"
            }
          },
          {
            name: "LibraryDocs.remove",
            parent: null,
            attributes: {
              ...at("acme", null),
              operation: "remove",
              kind: "blocks",
              key: "acceptance-criteria"
            }
          }
        ])
      }).pipe(Effect.provide(TestLayer))
  )
})
