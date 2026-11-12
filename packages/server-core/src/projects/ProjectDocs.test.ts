import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"
import { expect } from "vitest"

import * as Markdown from "../markdown/Markdown"
import * as ProjectDocs from "./ProjectDocs"

const base = {
  org: "demo",
  slug: "demo",
  key: "DEMO",
  name: "Demo",
  createdAt: "2026-09-09T00:00:00.000Z",
  members: []
}

const legacy = {
  ...base,
  banner: {
    type: "preset",
    preset: "sunset",
    crop: { x: 0.5, y: 0.65, zoom: 1.5 }
  },
  iconImage: {
    type: "full_bleed",
    sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M4",
    crop: { x: 0.5, y: 0.5, zoom: 1 }
  }
}

const docsWith = (initial: Record<string, unknown>) => {
  let data = initial
  const layer = ProjectDocs.layer.pipe(
    Layer.provide(
      Layer.mock(Markdown.Markdown, {
        root: "/tmp",
        projectDir: () => "/tmp/demo",
        libraryDir: () => "/tmp/demo/blocks",
        readProjectFile: () =>
          Effect.succeed({ data, body: "# Demo", path: "project.md" }),
        writeProjectFile: (_org, _slug, next) =>
          Effect.sync(() => {
            data = next
          }),
        readProjectFileRaw: () =>
          Effect.succeed({ path: "project.md", content: "# Demo" }),
        removeProjectDir: () => Effect.void
      })
    )
  )
  return { layer, written: () => data }
}

it.effect(
  "reads a project.md that still carries the legacy aesthetic keys",
  () => {
    const { layer } = docsWith(legacy)
    return Effect.gen(function* () {
      const docs = yield* ProjectDocs.ProjectDocs
      const document = yield* docs.read("demo", "demo")
      expect(document.name).toBe("Demo")
      expect(document.body).toBe("# Demo")
    }).pipe(Effect.provide(layer))
  }
)

it.effect("reads an explicitly null legacy github field", () => {
  const { layer } = docsWith({ ...base, github: null })
  return Effect.gen(function* () {
    const docs = yield* ProjectDocs.ProjectDocs
    const document = yield* docs.read("demo", "demo")
    expect(document.github).toBeNull()
  }).pipe(Effect.provide(layer))
})

it.effect("drops the legacy aesthetic keys on the next write", () => {
  const { layer, written } = docsWith(legacy)
  return Effect.gen(function* () {
    const docs = yield* ProjectDocs.ProjectDocs
    const original = yield* docs.read("demo", "demo")
    yield* docs.write("demo", "demo", {
      ...original,
      org: "demo",
      key: original.key!,
      createdBy: "owner"
    })
    expect(written()).not.toHaveProperty("banner")
    expect(written()).not.toHaveProperty("iconImage")
  }).pipe(Effect.provide(layer))
})

it.effect("writes estimation only when it is switched on", () => {
  const { layer, written } = docsWith(base)
  return Effect.gen(function* () {
    const docs = yield* ProjectDocs.ProjectDocs
    const original = yield* docs.read("demo", "demo")
    expect(original.estimation).toBe("off")
    const write = (estimation: typeof original.estimation) =>
      docs.write("demo", "demo", {
        ...original,
        org: "demo",
        key: original.key!,
        createdBy: "owner",
        estimation
      })
    yield* write("tshirt")
    expect(written()).toHaveProperty("estimation", "tshirt")
    expect((yield* docs.read("demo", "demo")).estimation).toBe("tshirt")
    yield* write("off")
    expect(written()).not.toHaveProperty("estimation")
  }).pipe(Effect.provide(layer))
})

it.effect(
  "traces each call under one ProjectDocs span with its attributes",
  () => {
    const { layer } = docsWith(base)
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      }
    })
    return Effect.gen(function* () {
      const docs = yield* ProjectDocs.ProjectDocs
      const original = yield* docs.read("demo", "demo")
      yield* docs.write("demo", "demo", {
        ...original,
        org: "demo",
        key: original.key!,
        createdBy: "owner"
      })
      yield* docs.markSystem("demo", "demo", "feedback")
      yield* docs.systemRole("demo", "demo")
      yield* docs.readRaw("demo", "demo")
      yield* docs.removeDir("demo", "demo")
    }).pipe(
      Effect.withTracer(tracer),
      Effect.provide(layer),
      Effect.map(() =>
        expect(
          spans.map((span) => ({
            name: span.name,
            root: Option.isNone(span.parent),
            attributes: Object.fromEntries(span.attributes)
          }))
        ).toEqual(
          [
            "read",
            "write",
            "markSystem",
            "systemRole",
            "readRaw",
            "removeDir"
          ].map((operation) => ({
            name: `ProjectDocs.${operation}`,
            root: true,
            attributes: {
              module: "ProjectDocs",
              operation,
              orgSlug: "demo",
              slug: "demo"
            }
          }))
        )
      )
    )
  }
)
