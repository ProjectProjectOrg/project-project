import { it } from "@effect/vitest"
import { TemplateKey } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

import { Markdown } from "../markdown/Markdown"
import { ProjectDocs } from "./ProjectDocs"
import { ProjectDocsLive } from "./ProjectDocsLive"

const templateKey = Schema.decodeUnknownSync(TemplateKey)

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
  const layer = ProjectDocsLive.pipe(
    Layer.provide(
      Layer.mock(Markdown, {
        root: "/tmp",
        projectDir: () => "/tmp/demo",
        libraryDir: () => "/tmp/demo/blocks",
        readProjectFile: () =>
          Effect.succeed({ data, body: "# Demo", path: "project.md" }),
        writeProjectFile: (_org, _slug, next) =>
          Effect.sync(() => {
            data = next
          })
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
      const docs = yield* ProjectDocs
      const document = yield* docs.read("demo", "demo")
      expect(document.name).toBe("Demo")
      expect(document.body).toBe("# Demo")
    }).pipe(Effect.provide(layer))
  }
)

it.effect("reads an explicitly null legacy github field", () => {
  const { layer } = docsWith({ ...base, github: null })
  return Effect.gen(function* () {
    const docs = yield* ProjectDocs
    const document = yield* docs.read("demo", "demo")
    expect(document.github).toBeNull()
  }).pipe(Effect.provide(layer))
})

it.effect("drops the legacy aesthetic keys on the next write", () => {
  const { layer, written } = docsWith(legacy)
  return Effect.gen(function* () {
    const docs = yield* ProjectDocs
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

it.effect("reads templateDefaults and ignores invalid entries", () => {
  const { layer } = docsWith({
    ...base,
    templateDefaults: { bug: "incident", other: null, feat: "blank", nope: "x" }
  })
  return Effect.gen(function* () {
    const docs = yield* ProjectDocs
    const document = yield* docs.read("demo", "demo")
    expect(document.templateDefaults).toEqual({ bug: "incident", other: null })
  }).pipe(Effect.provide(layer))
})

it.effect("keeps templateDefaults across a project write", () => {
  const { layer, written } = docsWith({
    ...base,
    templateDefaults: { bug: "incident" }
  })
  return Effect.gen(function* () {
    const docs = yield* ProjectDocs
    const original = yield* docs.read("demo", "demo")
    yield* docs.write("demo", "demo", {
      ...original,
      name: "Renamed",
      org: "demo",
      key: original.key!,
      createdBy: "owner"
    })
    expect(written()).toMatchObject({
      name: "Renamed",
      templateDefaults: { bug: "incident" }
    })
  }).pipe(Effect.provide(layer))
})

it.effect("writes templateDefaults without touching other frontmatter", () => {
  const { layer, written } = docsWith({
    ...base,
    templateDefaults: { bug: "x" }
  })
  return Effect.gen(function* () {
    const docs = yield* ProjectDocs
    yield* docs.writeTemplateDefaults("demo", "demo", {})
    expect(written()).toEqual(base)
    yield* docs.writeTemplateDefaults("demo", "demo", {
      chore: templateKey("chore")
    })
    expect(written()).toEqual({ ...base, templateDefaults: { chore: "chore" } })
  }).pipe(Effect.provide(layer))
})
