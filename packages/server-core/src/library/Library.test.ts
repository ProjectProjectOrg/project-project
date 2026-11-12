import { it } from "@effect/vitest"
import {
  BlockDraft,
  BUILTIN_BLOCKS,
  BUILTIN_TYPES,
  EMPTY_LAYER,
  GALLERY_BLOCKS,
  GALLERY_TYPES,
  TypeDraft,
  TypeKey,
  TicketId,
  type Layer as LibraryLayer,
  type Library as LibraryValue,
  type OrgRole,
  type Role,
  OrgScope,
  ProjectScope
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Tracer from "effect/Tracer"
import { describe, expect } from "vitest"

import { databaseLayer } from "../../test/database"
import { orgScope, projectScope } from "../access/testing"
import * as KeyedLock from "../locks/KeyedLock"
import type * as Markdown from "../markdown/Markdown"
import * as TicketDocs from "../tickets/TicketDocs"
import * as Library from "./Library"
import * as LibraryDocs from "./LibraryDocs"

const typeKey = Schema.decodeUnknownSync(TypeKey)
const ticketId = Schema.decodeUnknownSync(TicketId)

const ORG_ROLES: Readonly<Record<string, OrgRole>> = {
  "org-admin": "admin",
  "project-admin": "member",
  member: "member"
}

const PROJECT_ROLES: Readonly<Record<string, Role>> = {
  "org-admin": "pm",
  "project-admin": "pm",
  member: "developer"
}

type World = Readonly<{
  layers: Map<string, LibraryLayer>
  unreadable: Set<string>
  reads: Array<string>
}>

const scopeKey = (orgSlug: string, projectSlug: string | null) =>
  `${orgSlug}/${projectSlug ?? ""}`

const updateLayer = (
  world: World,
  orgSlug: string,
  projectSlug: string | null,
  update: (layer: LibraryLayer) => LibraryLayer
) => {
  const key = scopeKey(orgSlug, projectSlug)
  world.layers.set(key, update(world.layers.get(key) ?? EMPTY_LAYER))
}

const withoutKey = (
  layer: LibraryLayer,
  kind: Markdown.LibraryKind,
  key: string
) =>
  kind === "blocks"
    ? {
        ...layer,
        blocks: layer.blocks.filter((block) => block.key !== key),
        hiddenBlocks: layer.hiddenBlocks.filter((hidden) => hidden !== key)
      }
    : {
        ...layer,
        types: layer.types.filter((type) => type.key !== key),
        hiddenTypes: layer.hiddenTypes.filter((hidden) => hidden !== key)
      }

const fakeLibraryDocs = (world: World): LibraryDocs.LibraryDocs["Service"] => ({
  readLayer: (orgSlug, projectSlug) =>
    Effect.sync(() => {
      world.reads.push(scopeKey(orgSlug, projectSlug))
      return world.layers.get(scopeKey(orgSlug, projectSlug)) ?? EMPTY_LAYER
    }),
  writeBlock: (orgSlug, projectSlug, draft) =>
    Effect.sync(() =>
      updateLayer(world, orgSlug, projectSlug, (layer) => {
        const rest = withoutKey(layer, "blocks", draft.key)
        return { ...rest, blocks: [...rest.blocks, draft] }
      })
    ),
  writeType: (orgSlug, projectSlug, draft) =>
    Effect.sync(() =>
      updateLayer(world, orgSlug, projectSlug, (layer) => {
        const rest = withoutKey(layer, "types", draft.key)
        return { ...rest, types: [...rest.types, draft] }
      })
    ),
  writeTombstone: (orgSlug, projectSlug, kind, key) =>
    Effect.sync(() =>
      updateLayer(world, orgSlug, projectSlug, (layer) => {
        const rest = withoutKey(layer, kind, key)
        return kind === "blocks"
          ? { ...rest, hiddenBlocks: [...rest.hiddenBlocks, key] }
          : { ...rest, hiddenTypes: [...rest.hiddenTypes, key] }
      })
    ),
  hasFile: (orgSlug, projectSlug, kind, key) =>
    Effect.sync(() => {
      const layer =
        world.layers.get(scopeKey(orgSlug, projectSlug)) ?? EMPTY_LAYER
      const [definitions, hidden] =
        kind === "blocks"
          ? [layer.blocks, layer.hiddenBlocks]
          : [layer.types, layer.hiddenTypes]
      return (
        world.unreadable.has(`${scopeKey(orgSlug, projectSlug)}/${key}`) ||
        hidden.includes(key) ||
        definitions.some((definition) => definition.key === key)
      )
    }),
  remove: (orgSlug, projectSlug, kind, key) =>
    Effect.sync(() => {
      const layer =
        world.layers.get(scopeKey(orgSlug, projectSlug)) ?? EMPTY_LAYER
      const next = withoutKey(layer, kind, key)
      const removed =
        next.blocks.length + next.hiddenBlocks.length !==
          layer.blocks.length + layer.hiddenBlocks.length ||
        next.types.length + next.hiddenTypes.length !==
          layer.types.length + layer.hiddenTypes.length
      world.layers.set(scopeKey(orgSlug, projectSlug), next)
      return removed
    })
})

const fakeDb = databaseLayer(({ sql, params }) =>
  Effect.sync(() => {
    const table = sql.match(/from "([^"]+)"/)?.[1]
    if (table === "project_index") return [["project-1"]]
    if (table === "project_tag") return [["frontend"]]
    if (table === "project_member") return [["project-admin"], ["member"]]
    if (table === "member")
      return params
        .filter(Predicate.isString)
        .filter((userId) => userId in ORG_ROLES)
        .map((userId) => [userId])
    throw new Error(`Unexpected SQL: ${sql}`)
  })
)

const makeWorld = (): World => ({
  layers: new Map(),
  unreadable: new Set(),
  reads: []
})

const makeLayer = (world: World) =>
  Library.layer.pipe(
    Layer.provide(
      Layer.succeed(LibraryDocs.LibraryDocs, fakeLibraryDocs(world))
    ),
    Layer.provide(KeyedLock.layer),
    Layer.provide(
      Layer.mock(TicketDocs.TicketDocs, {
        listIds: () => Effect.succeed([ticketId("T-1")])
      })
    ),
    Layer.provide(fakeDb)
  )

const asOrg = (user: string) =>
  Effect.provideService(
    OrgScope,
    orgScope(ORG_ROLES[user], { userId: user, orgSlug: "acme" })
  )

const asProject = (user: string) =>
  Effect.provideService(
    ProjectScope,
    projectScope(ORG_ROLES[user], PROJECT_ROLES[user], {
      userId: user,
      orgSlug: "acme",
      slug: "web"
    })
  )

const run = <A, E>(
  effect: Effect.Effect<A, E, Library.Library>,
  world: World = makeWorld()
) => effect.pipe(Effect.provide(makeLayer(world)))

const decodeBlockDraft = Schema.decodeUnknownSync(BlockDraft)
const decodeTypeDraft = Schema.decodeUnknownSync(TypeDraft)

const blockInput = (
  overrides: Readonly<Record<string, unknown>> = {}
): BlockDraft =>
  decodeBlockDraft({
    key: "background",
    name: "Background",
    icon: "FileText",
    color: null,
    description: "Why",
    sync: false,
    content: "## Background\n\n{{Why this exists}}",
    ...overrides
  })

const typeInput = (
  overrides: Readonly<Record<string, unknown>> = {}
): TypeDraft =>
  decodeTypeDraft({
    key: "incident",
    name: "Incident",
    icon: "Siren",
    color: null,
    description: "Something is on fire",
    type: "bug",
    priority: "high",
    tags: [],
    body: '<block type="context">\n\n</block>',
    ...overrides
  })

const failureTag = <A, E extends { _tag: string }>(
  effect: Effect.Effect<A, E, Library.Library>
) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => error._tag)
  )

const adopt = (
  world: World,
  projectSlug: string | null,
  keys: ReadonlyArray<string>
) =>
  updateLayer(world, "acme", projectSlug, (layer) => ({
    ...layer,
    blocks: [
      ...layer.blocks,
      ...GALLERY_BLOCKS.filter((block) => keys.includes(block.key))
    ],
    types: [
      ...layer.types,
      ...GALLERY_TYPES.filter((type) => keys.includes(type.key))
    ]
  }))

describe("reading", () => {
  it.effect("serves the built-in types and sections without setup", () => {
    const world = makeWorld()
    return run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const org = yield* library.orgLibrary().pipe(asOrg("member"))
        const admin = yield* library.orgLibrary().pipe(asOrg("org-admin"))
        const project = yield* library
          .projectLibrary()
          .pipe(asProject("member"))
        const projectAdmin = yield* library
          .projectLibrary()
          .pipe(asProject("project-admin"))

        expect(org.canEdit).toBe(false)
        expect(admin.canEdit).toBe(true)
        expect(project.canEdit).toBe(false)
        expect(projectAdmin.canEdit).toBe(true)
        for (const served of [org, project]) {
          expect(served.types.map((type) => type.key).toSorted()).toEqual(
            BUILTIN_TYPES.map((type) => type.key).toSorted()
          )
          expect(served.blocks.map((block) => block.key).toSorted()).toEqual(
            BUILTIN_BLOCKS.map((block) => block.key).toSorted()
          )
          expect(
            [...served.types, ...served.blocks].every(
              (entry) => entry.origin === "builtin" && entry.shadows === null
            )
          ).toBe(true)
        }

        adopt(world, null, ["notes", "spike"])
        const adopted = yield* library.orgLibrary().pipe(asOrg("member"))
        expect(
          adopted.blocks.find((block) => block.key === "notes")?.origin
        ).toBe("org")
        expect(
          adopted.types.find((type) => type.key === "spike")
        ).toMatchObject({ origin: "org", shadows: null })
      }),
      world
    )
  })
})

describe("built-in entries", () => {
  const bug = (overrides: Readonly<Record<string, unknown>> = {}) =>
    typeInput({ key: "bug", name: "Defect", body: "Org bug", ...overrides })
  const typeOf = (library: LibraryValue, key: string) =>
    library.types.find((type) => type.key === key)

  it.effect("saves an edit of a built-in type as a copy in that layer", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const org = yield* library.createOrgType(bug()).pipe(asOrg("org-admin"))
        const again = yield* failureTag(
          library.createOrgType(bug()).pipe(asOrg("org-admin"))
        )
        const project = yield* library
          .createType(bug({ name: "Project defect" }))
          .pipe(asProject("project-admin"))

        expect(org).toMatchObject({
          name: "Defect",
          origin: "org",
          shadows: "builtin"
        })
        expect(again).toBe("Conflict")
        expect(project).toMatchObject({
          name: "Project defect",
          origin: "project",
          shadows: "org"
        })
      })
    )
  )

  it.effect("copies an unedited built-in straight into a project", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const project = yield* library
          .createType(bug())
          .pipe(asProject("project-admin"))
        const org = yield* library.orgLibrary().pipe(asOrg("member"))

        expect(project).toMatchObject({ origin: "project", shadows: "builtin" })
        expect(typeOf(org, "bug")).toMatchObject({
          name: "Bug",
          origin: "builtin"
        })
      })
    )
  )

  it.effect("updates only a copy, never the built-in itself", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        expect(
          yield* failureTag(
            library
              .updateOrgType("bug", { name: "Nope" })
              .pipe(asOrg("org-admin"))
          )
        ).toBe("NotFound")
        expect(
          yield* failureTag(
            library
              .updateOrgBlock("context", { name: "Nope" })
              .pipe(asOrg("org-admin"))
          )
        ).toBe("NotFound")
        yield* library.createOrgType(bug()).pipe(asOrg("org-admin"))
        expect(
          yield* failureTag(
            library
              .updateType("bug", { name: "Nope" })
              .pipe(asProject("project-admin"))
          )
        ).toBe("NotFound")
        const updated = yield* library
          .updateOrgType("bug", { name: "Renamed" })
          .pipe(asOrg("org-admin"))
        expect(updated).toMatchObject({
          key: "bug",
          name: "Renamed",
          body: "Org bug",
          shadows: "builtin"
        })
      })
    )
  )

  it.effect("restores the built-in when the copy is removed", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        yield* library.createOrgType(bug()).pipe(asOrg("org-admin"))
        yield* library
          .createType(bug({ name: "Project defect" }))
          .pipe(asProject("project-admin"))

        yield* library.removeType("bug").pipe(asProject("project-admin"))
        const reset = yield* library.projectLibrary().pipe(asProject("member"))
        expect(typeOf(reset, "bug")).toMatchObject({
          name: "Defect",
          origin: "org",
          shadows: "builtin"
        })

        yield* library.removeOrgType("bug").pipe(asOrg("org-admin"))
        const restored = yield* library.orgLibrary().pipe(asOrg("member"))
        expect(typeOf(restored, "bug")).toMatchObject({
          name: "Bug",
          origin: "builtin",
          shadows: null
        })
      })
    )
  )

  it.effect("has nothing to delete for a built-in type or section", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        expect(
          yield* failureTag(
            library.removeOrgType("bug").pipe(asOrg("org-admin"))
          )
        ).toBe("NotFound")
        expect(
          yield* failureTag(
            library.removeType("bug").pipe(asProject("project-admin"))
          )
        ).toBe("NotFound")
        expect(
          yield* failureTag(
            library.removeOrgBlock("context").pipe(asOrg("org-admin"))
          )
        ).toBe("NotFound")
        const org = yield* library.orgLibrary().pipe(asOrg("member"))
        expect(typeOf(org, "bug")?.origin).toBe("builtin")
        expect(org.blocks.some((block) => block.key === "context")).toBe(true)
      })
    )
  )

  it.effect("lets a project hide and unhide a built-in type and section", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        yield* library.hideType("bug").pipe(asProject("project-admin"))
        yield* library.hideBlock("context").pipe(asProject("project-admin"))
        const hidden = yield* library.projectLibrary().pipe(asProject("member"))
        const org = yield* library.orgLibrary().pipe(asOrg("member"))

        expect(typeOf(hidden, "bug")).toMatchObject({
          name: "Bug",
          origin: "project",
          shadows: "builtin",
          hidden: true
        })
        expect(
          hidden.blocks.find((block) => block.key === "context")
        ).toMatchObject({ origin: "project", shadows: "builtin", hidden: true })
        expect(typeOf(org, "bug")).toMatchObject({ hidden: false })
        expect(
          yield* library
            .expandForCreate("acme", "web", typeKey("bug"))
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "Validation", reason: "unknown_template:bug" })

        yield* library.removeType("bug").pipe(asProject("project-admin"))
        const shown = yield* library.projectLibrary().pipe(asProject("member"))
        expect(typeOf(shown, "bug")).toMatchObject({
          origin: "builtin",
          hidden: false
        })
      })
    )
  )

  it.effect("hides an org copy of a built-in for one project", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        yield* library.createOrgType(bug()).pipe(asOrg("org-admin"))
        yield* library.hideType("bug").pipe(asProject("project-admin"))
        const hidden = yield* library.projectLibrary().pipe(asProject("member"))
        expect(typeOf(hidden, "bug")).toMatchObject({
          name: "Defect",
          origin: "project",
          shadows: "org",
          hidden: true
        })
        expect(
          yield* failureTag(
            library.hideType("nope").pipe(asProject("project-admin"))
          )
        ).toBe("NotFound")
      })
    )
  )
})

describe("keys per layer", () => {
  it.effect("lets a project shadow an org key once", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const org = yield* library
          .createOrgBlock(blockInput())
          .pipe(asOrg("org-admin"))
        const again = yield* failureTag(
          library.createOrgBlock(blockInput()).pipe(asOrg("org-admin"))
        )
        const project = yield* library
          .createBlock(blockInput({ name: "Project context" }))
          .pipe(asProject("project-admin"))

        expect(org.shadows).toBeNull()
        expect(again).toBe("Conflict")
        expect(project.origin).toBe("project")
        expect(project.shadows).toBe("org")
        expect(project.name).toBe("Project context")
      })
    )
  )

  it.effect("keeps a synced built-in synced once adopted", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const done = BUILTIN_BLOCKS.find(
          (block) => block.key === "definition-of-done"
        )!
        const adopted = yield* library
          .createOrgBlock(done)
          .pipe(asOrg("org-admin"))
        expect(adopted).toMatchObject({ sync: true, origin: "org" })
      })
    )
  )

  it.effect("updates only a file that exists at this layer", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        expect(
          yield* failureTag(
            library
              .updateOrgBlock("background", {
                name: "Nope"
              })
              .pipe(asOrg("org-admin"))
          )
        ).toBe("NotFound")
        yield* library.createOrgBlock(blockInput()).pipe(asOrg("org-admin"))
        const updated = yield* library
          .updateOrgBlock("background", { name: "Renamed", color: "#70b445" })
          .pipe(asOrg("org-admin"))
        expect(updated.name).toBe("Renamed")
        expect(updated.color).toBe("#70b445")
        expect(updated.content).toBe(blockInput().content)
        const cleared = yield* library
          .updateOrgBlock("background", { color: null })
          .pipe(asOrg("org-admin"))
        expect(cleared.color).toBeNull()
        expect(
          yield* failureTag(
            library
              .updateBlock("background", {
                name: "Project"
              })
              .pipe(asProject("org-admin"))
          )
        ).toBe("NotFound")
      })
    )
  )

  it.effect("removes this layer's file and reverts to the one below", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        expect(
          yield* failureTag(
            library.removeOrgBlock("background").pipe(asOrg("org-admin"))
          )
        ).toBe("NotFound")
        yield* library.createOrgBlock(blockInput()).pipe(asOrg("org-admin"))
        yield* library
          .createBlock(blockInput({ name: "Project context" }))
          .pipe(asProject("project-admin"))
        yield* library
          .removeBlock("background")
          .pipe(asProject("project-admin"))
        const project = yield* library
          .projectLibrary()
          .pipe(asProject("member"))
        expect(
          project.blocks.find((block) => block.key === "background")
        ).toMatchObject({ origin: "org", name: "Background" })
        yield* library.removeOrgBlock("background").pipe(asOrg("org-admin"))
        const org = yield* library.orgLibrary().pipe(asOrg("member"))
        expect(org.blocks.some((block) => block.key === "background")).toBe(
          false
        )
      })
    )
  )

  it.effect("lets a project hide an org key and nothing else", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        expect(
          yield* failureTag(
            library.hideBlock("background").pipe(asProject("project-admin"))
          )
        ).toBe("NotFound")
        yield* library.createOrgBlock(blockInput()).pipe(asOrg("org-admin"))
        yield* library.hideBlock("background").pipe(asProject("project-admin"))
        const project = yield* library
          .projectLibrary()
          .pipe(asProject("member"))
        const context = project.blocks.find(
          (block) => block.key === "background"
        )

        expect(context?.hidden).toBe(true)
        expect(context?.origin).toBe("project")
        expect(
          yield* failureTag(
            library.hideType("incident").pipe(asProject("project-admin"))
          )
        ).toBe("NotFound")
        yield* library
          .removeBlock("background")
          .pipe(asProject("project-admin"))
        const restored = yield* library
          .projectLibrary()
          .pipe(asProject("member"))
        expect(
          restored.blocks.find((block) => block.key === "background")?.hidden
        ).toBe(false)
      })
    )
  )

  it.effect("keeps the key of an unreadable file taken", () => {
    const world = makeWorld()
    world.unreadable.add("acme//background")
    world.unreadable.add("acme/web/background")
    return run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const created = yield* library
          .createOrgBlock(blockInput())
          .pipe(asOrg("org-admin"), Effect.flip)
        expect(created).toMatchObject({ _tag: "Conflict", reason: "key_taken" })

        updateLayer(world, "acme", null, (layer) => ({
          ...layer,
          blocks: [blockInput()]
        }))
        const hidden = yield* library
          .hideBlock("background")
          .pipe(asProject("project-admin"), Effect.flip)
        expect(hidden).toMatchObject({ _tag: "Conflict", reason: "customized" })
        expect(world.layers.get("acme/web")).toBeUndefined()
      }),
      world
    )
  })

  it.effect("keeps the key of an unreadable type file taken", () => {
    const world = makeWorld()
    world.unreadable.add("acme/web/incident")
    return run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const created = yield* library
          .createType(typeInput())
          .pipe(asProject("project-admin"), Effect.flip)
        expect(created).toMatchObject({ _tag: "Conflict", reason: "key_taken" })
        expect(world.layers.get("acme/web")).toBeUndefined()
      }),
      world
    )
  })

  it.effect("refuses to hide a key this layer customized", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        yield* library.createOrgBlock(blockInput()).pipe(asOrg("org-admin"))
        yield* library
          .createBlock(blockInput({ content: "## Background\n\nOurs" }))
          .pipe(asProject("project-admin"))

        const refused = yield* library
          .hideBlock("background")
          .pipe(asProject("project-admin"), Effect.flip)
        const project = yield* library
          .projectLibrary()
          .pipe(asProject("member"))

        expect(refused).toMatchObject({
          _tag: "Conflict",
          reason: "customized"
        })
        expect(
          project.blocks.find((block) => block.key === "background")?.content
        ).toBe("## Background\n\nOurs")
      })
    )
  )
})

describe("content validation", () => {
  const reason = <A, E extends { _tag: string }>(
    effect: Effect.Effect<A, E, Library.Library>
  ) =>
    effect.pipe(
      Effect.flip,
      Effect.map((error) => ("reason" in error ? error.reason : error._tag))
    )

  it.effect("rejects block markup inside a block definition", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        expect(
          yield* reason(
            library
              .createOrgBlock(
                blockInput({
                  content: '<block type="context">\n\nx\n\n</block>'
                })
              )
              .pipe(asOrg("org-admin"))
          )
        ).toBe("blocks_not_allowed")
      })
    )
  )

  it.effect("rejects a nested block in a type body", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        expect(
          yield* reason(
            library
              .createOrgType(
                typeInput({
                  body: '<block type="a">\n\n<block type="b">\n\n</block>\n\n</block>'
                })
              )
              .pipe(asOrg("org-admin"))
          )
        ).toBe("invalid_blocks:nested:3")
      })
    )
  )

  it.effect("rejects attachments in definitions", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        expect(
          yield* reason(
            library
              .createOrgBlock(
                blockInput({
                  content:
                    "## Context\n\n![shot](/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M4)"
                })
              )
              .pipe(asOrg("org-admin"))
          )
        ).toBe("attachments_not_allowed")
      })
    )
  )

  it.effect("validates mentions against the layer", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const withMention = (mention: string) =>
          blockInput({ content: `## Context\n\nAsk ${mention}` })

        const orgTicket = yield* library
          .createOrgBlock(withMention("[T-1](mention:ticket/T-1)"))
          .pipe(asOrg("org-admin"), Effect.flip)
        const orgStranger = yield* library
          .createOrgBlock(withMention("[Nobody](mention:user/stranger)"))
          .pipe(asOrg("org-admin"), Effect.flip)
        const orgMember = yield* library
          .createOrgBlock(withMention("[Member](mention:user/member)"))
          .pipe(asOrg("org-admin"))
        const projectTicket = yield* library
          .createBlock(withMention("[T-1](mention:ticket/T-1)"))
          .pipe(asProject("project-admin"))
        const projectMissing = yield* library
          .updateBlock("background", {
            content: "## Context\n\nSee [T-9](mention:ticket/T-9)"
          })
          .pipe(asProject("project-admin"), Effect.flip)

        expect(orgTicket).toMatchObject({
          _tag: "MentionInvalid",
          kind: "unknown_ticket"
        })
        expect(orgStranger).toMatchObject({
          _tag: "MentionInvalid",
          kind: "unknown_user"
        })
        expect(orgMember.origin).toBe("org")
        expect(projectTicket.origin).toBe("project")
        expect(projectMissing).toMatchObject({
          _tag: "MentionInvalid",
          kind: "unknown_ticket"
        })
      })
    )
  )
})

describe("expandForCreate", () => {
  it.effect("expands a built-in type from the built-in sections", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const expansion = yield* library.expandForCreate(
          "acme",
          "web",
          typeKey("bug")
        )

        expect(expansion.type).toBe("bug")
        expect(expansion.body).toContain(
          '<block type="definition-of-done" sync>'
        )
        expect(expansion.body).toContain('<block type="steps-to-reproduce">')
        expect(expansion.body).not.toContain("{{")
      })
    )
  )

  it.effect("drops the sections a project has hidden", () => {
    const world = makeWorld()
    updateLayer(world, "acme", "web", (layer) => ({
      ...layer,
      hiddenBlocks: ["environment"]
    }))
    return run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const expansion = yield* library.expandForCreate(
          "acme",
          "web",
          typeKey("bug")
        )
        expect(expansion.body).not.toContain('<block type="environment">')
        expect(expansion.body).toContain('<block type="steps-to-reproduce">')
      }),
      world
    )
  })

  it.effect("sets the ticket type only for a built-in type key", () => {
    const world = makeWorld()
    adopt(world, null, ["spike"])
    return run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const typeOf = (key: string) =>
          library
            .expandForCreate("acme", "web", typeKey(key))
            .pipe(Effect.map((expansion) => expansion.type))

        expect(yield* typeOf("feat")).toBe("feat")
        expect(yield* typeOf("chore")).toBe("chore")
        expect(yield* typeOf("epic")).toBe("epic")
        expect(yield* typeOf("spike")).toBeNull()
      }),
      world
    )
  })

  it.effect("filters tags to the project's and sanitizes mentions", () => {
    const world = makeWorld()
    updateLayer(world, "acme", null, (layer) => ({
      ...layer,
      types: [
        typeInput({
          tags: ["frontend", "backend"],
          body: "Ping [Member](mention:user/member), [Nobody](mention:user/stranger), [T-1](mention:ticket/T-1) and [old](mention:ticket/T-9)"
        })
      ]
    }))
    return run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const expansion = yield* library.expandForCreate(
          "acme",
          "web",
          typeKey("incident")
        )

        expect(expansion.tags).toEqual(["frontend"])
        expect(expansion.priority).toBe("high")
        expect(expansion.body).toBe(
          "Ping [Member](mention:user/member), @Nobody, [T-1](mention:ticket/T-1) and T-9"
        )
      }),
      world
    )
  })

  it.effect("drops a mention of an org admin who is not in the project", () => {
    const world = makeWorld()
    return run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const rejected = yield* library
          .createType(
            typeInput({ body: "Ask [Admin](mention:user/org-admin)" })
          )
          .pipe(asProject("project-admin"), Effect.flip)
        updateLayer(world, "acme", null, (layer) => ({
          ...layer,
          types: [typeInput({ body: "Ask [Admin](mention:user/org-admin)" })]
        }))
        const expansion = yield* library.expandForCreate(
          "acme",
          "web",
          typeKey("incident")
        )

        expect(rejected).toMatchObject({
          _tag: "MentionInvalid",
          kind: "unknown_user"
        })
        expect(expansion.body).toBe("Ask @Admin")
      }),
      world
    )
  })

  it.effect("fails on an unknown or hidden type", () => {
    const world = makeWorld()
    adopt(world, null, ["spike"])
    updateLayer(world, "acme", "web", (layer) => ({
      ...layer,
      hiddenTypes: ["spike"]
    }))
    return run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const unadopted = yield* library
          .expandForCreate("acme", "web", typeKey("incident"))
          .pipe(Effect.flip)
        const hidden = yield* library
          .expandForCreate("acme", "web", typeKey("spike"))
          .pipe(Effect.flip)

        expect(unadopted).toMatchObject({
          _tag: "Validation",
          reason: "unknown_template:incident"
        })
        expect(hidden).toMatchObject({
          _tag: "Validation",
          reason: "unknown_template:spike"
        })
      }),
      world
    )
  })
})

describe("resolveSynced", () => {
  it.effect("returns a body without synced blocks untouched and unread", () => {
    const world = makeWorld()
    const body =
      '<block type="context">\n\n## Context\n\nsync is a word\n\n</block>'
    return run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const resolved = yield* library.resolveSynced("acme", "web", body)
        expect(resolved).toBe(body)
        expect(world.reads).toEqual([])
      }),
      world
    )
  })

  it.effect("drops sync from a block nobody defines", () => {
    const world = makeWorld()
    const body =
      '<block type="release-checklist" sync>\n\n## Release checklist\n\n- [x] Reviewed\n\n</block>'
    return run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const resolved = yield* library.resolveSynced("acme", "web", body)
        expect(resolved).toBe(body.replace(" sync>", ">"))
      }),
      world
    )
  })

  it.effect(
    "sanitizes mentions the project can't resolve in synced content",
    () => {
      const world = makeWorld()
      updateLayer(world, "acme", null, (layer) => ({
        ...layer,
        blocks: [
          blockInput({
            key: "definition-of-done",
            name: "Definition of done",
            sync: true,
            content:
              "## Definition of done\n\n- [ ] Signed off by [Admin](mention:user/org-admin)\n- [ ] Checked by [Member](mention:user/member)"
          })
        ]
      }))
      const body =
        '<block type="definition-of-done" sync>\n\n## Definition of done\n\n- [x] Checked by [Member](mention:user/member)\n\n</block>'
      return run(
        Effect.gen(function* () {
          const library = yield* Library.Library
          const resolved = yield* library.resolveSynced("acme", "web", body)
          expect(resolved).toBe(
            '<block type="definition-of-done" sync>\n\n## Definition of done\n\n- [ ] Signed off by @Admin\n- [x] Checked by [Member](mention:user/member)\n\n</block>'
          )
        }),
        world
      )
    }
  )

  it.effect("refreshes a synced snapshot from the effective definition", () => {
    const world = makeWorld()
    updateLayer(world, "acme", null, (layer) => ({
      ...layer,
      blocks: [
        blockInput({
          key: "definition-of-done",
          name: "Definition of done",
          sync: true,
          content: "## Definition of done\n\n- [ ] Reviewed\n- [ ] Shipped"
        })
      ]
    }))
    const body = [
      '<block type="definition-of-done" sync>',
      "",
      "## Definition of done",
      "",
      "- [x] Reviewed",
      "- [ ] Tests cover the change",
      "",
      "</block>"
    ].join("\n")
    return run(
      Effect.gen(function* () {
        const library = yield* Library.Library
        const resolved = yield* library.resolveSynced("acme", "web", body)
        expect(resolved).toContain("- [x] Reviewed\n- [ ] Shipped")
        expect(resolved).not.toContain("Tests cover the change")
        expect(world.reads.toSorted()).toEqual(["acme/", "acme/web"])
      }),
      world
    )
  })
})

describe("tracing", () => {
  it.effect(
    "traces each call under one Library span with its attributes",
    () => {
      const spans: Array<Tracer.NativeSpan> = []
      const tracer = Tracer.make({
        span: (options) => {
          const span = new Tracer.NativeSpan(options)
          spans.push(span)
          return span
        }
      })
      return run(
        Effect.gen(function* () {
          const library = yield* Library.Library
          yield* library.createOrgBlock(blockInput()).pipe(asOrg("org-admin"))
          yield* library
            .updateOrgBlock("background", { name: "Renamed" })
            .pipe(asOrg("org-admin"))
          yield* library.createOrgType(typeInput()).pipe(asOrg("org-admin"))
          yield* library.hideType("incident").pipe(asProject("project-admin"))
          yield* library
            .createBlock(blockInput({ name: "Project context" }))
            .pipe(asProject("project-admin"))
          yield* library
            .removeBlock("background")
            .pipe(asProject("project-admin"))
          yield* library.orgLibrary().pipe(asOrg("member"))
        }).pipe(Effect.withTracer(tracer))
      ).pipe(
        Effect.map(() =>
          expect(
            spans
              .filter((span) => Option.isNone(span.parent))
              .map((span) => ({
                name: span.name,
                attributes: Object.fromEntries(span.attributes)
              }))
          ).toEqual([
            {
              name: "Library.createOrgBlock",
              attributes: { orgSlug: "acme", slug: null, key: "background" }
            },
            {
              name: "Library.updateOrgBlock",
              attributes: { orgSlug: "acme", slug: null, key: "background" }
            },
            {
              name: "Library.createOrgType",
              attributes: { orgSlug: "acme", slug: null, key: "incident" }
            },
            {
              name: "Library.hideType",
              attributes: { orgSlug: "acme", slug: "web", key: "incident" }
            },
            {
              name: "Library.createBlock",
              attributes: { orgSlug: "acme", slug: "web", key: "background" }
            },
            {
              name: "Library.removeBlock",
              attributes: { orgSlug: "acme", slug: "web", key: "background" }
            },
            { name: "Library.orgLibrary", attributes: {} }
          ])
        )
      )
    }
  )
})
