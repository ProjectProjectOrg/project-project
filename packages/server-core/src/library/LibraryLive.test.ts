import { it } from "@effect/vitest"
import { Db } from "@pp/db"
import {
  BlockDraft,
  BUILTIN_BLOCKS,
  BUILTIN_TEMPLATES,
  EMPTY_LAYER,
  Forbidden,
  NotFound,
  TemplateDraft,
  TemplateKey,
  TicketId,
  type Layer as LibraryLayer,
  type PartialTemplateDefaults,
  Slug,
  type Role
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { describe, expect } from "vitest"

import type { LibraryKind } from "../markdown/Markdown"
import { CurrentOrg } from "../organizations/CurrentOrg"
import { ProjectDocs, type ProjectDocument } from "../projects/ProjectDocs"
import { Projects } from "../projects/Projects"
import { TicketDocs } from "../tickets/TicketDocs"
import { Library } from "./Library"
import { LibraryDocs, type LibraryDocsShape } from "./LibraryDocs"
import { LibraryLive } from "./LibraryLive"

const templateKey = Schema.decodeUnknownSync(TemplateKey)
const ticketId = Schema.decodeUnknownSync(TicketId)
const slug = Schema.decodeUnknownSync(Slug)

const ORG_ROLES: Readonly<Record<string, Role>> = {
  "org-admin": "admin",
  "project-admin": "member",
  member: "member"
}

const PROJECT_ROLES: Readonly<Record<string, Role>> = {
  "org-admin": "admin",
  "project-admin": "admin",
  member: "member"
}

type World = Readonly<{
  layers: Map<string, LibraryLayer>
  unreadable: Set<string>
  reads: Array<string>
  defaults: { current: PartialTemplateDefaults }
  orgDefaults: { current: PartialTemplateDefaults }
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

const withoutKey = (layer: LibraryLayer, kind: LibraryKind, key: string) =>
  kind === "blocks"
    ? {
        ...layer,
        blocks: layer.blocks.filter((block) => block.key !== key),
        hiddenBlocks: layer.hiddenBlocks.filter((hidden) => hidden !== key)
      }
    : {
        ...layer,
        templates: layer.templates.filter((template) => template.key !== key),
        hiddenTemplates: layer.hiddenTemplates.filter(
          (hidden) => hidden !== key
        )
      }

const fakeLibraryDocs = (world: World): LibraryDocsShape => ({
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
  writeTemplate: (orgSlug, projectSlug, draft) =>
    Effect.sync(() =>
      updateLayer(world, orgSlug, projectSlug, (layer) => {
        const rest = withoutKey(layer, "templates", draft.key)
        return { ...rest, templates: [...rest.templates, draft] }
      })
    ),
  writeTombstone: (orgSlug, projectSlug, kind, key) =>
    Effect.sync(() =>
      updateLayer(world, orgSlug, projectSlug, (layer) => {
        const rest = withoutKey(layer, kind, key)
        return kind === "blocks"
          ? { ...rest, hiddenBlocks: [...rest.hiddenBlocks, key] }
          : { ...rest, hiddenTemplates: [...rest.hiddenTemplates, key] }
      })
    ),
  readOrgDefaults: () => Effect.sync(() => world.orgDefaults.current),
  writeOrgDefaults: (_orgSlug, defaults) =>
    Effect.sync(() => {
      world.orgDefaults.current = defaults
    }),
  hasFile: (orgSlug, projectSlug, kind, key) =>
    Effect.sync(() => {
      const layer =
        world.layers.get(scopeKey(orgSlug, projectSlug)) ?? EMPTY_LAYER
      const [definitions, hidden] =
        kind === "blocks"
          ? [layer.blocks, layer.hiddenBlocks]
          : [layer.templates, layer.hiddenTemplates]
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
        next.templates.length + next.hiddenTemplates.length !==
          layer.templates.length + layer.hiddenTemplates.length
      world.layers.set(scopeKey(orgSlug, projectSlug), next)
      return removed
    })
})

const projectDocument = (
  templateDefaults: PartialTemplateDefaults
): ProjectDocument => ({
  slug: slug("web"),
  name: "Web",
  icon: "folder",
  color: "#3b82f6",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-09-01T00:00:00.000Z")),
  members: [],
  github: null,
  setup: {
    workflowReviewedAt: null,
    invitePeopleDismissedAt: null,
    connectGithubDismissedAt: null
  },
  templateDefaults,
  body: "# Web\n"
})

const fakeDb = Layer.succeed(Db, {
  query: {
    projectIndex: {
      findFirst: () => Effect.succeed({ id: "project-1" })
    },
    projectTag: {
      findMany: () => Effect.succeed([{ name: "frontend" }])
    },
    projectMember: {
      findMany: () =>
        Effect.succeed([{ userId: "project-admin" }, { userId: "member" }])
    }
  }
} as never)

const makeWorld = (): World => ({
  layers: new Map(),
  unreadable: new Set(),
  reads: [],
  defaults: { current: {} },
  orgDefaults: { current: {} }
})

const makeLayer = (world: World) =>
  LibraryLive.pipe(
    Layer.provide(Layer.succeed(LibraryDocs, fakeLibraryDocs(world))),
    Layer.provide(
      Layer.mock(ProjectDocs, {
        read: () => Effect.succeed(projectDocument(world.defaults.current)),
        writeTemplateDefaults: (_org, _slug, defaults) =>
          Effect.sync(() => {
            world.defaults.current = defaults
          })
      })
    ),
    Layer.provide(
      Layer.mock(Projects, {
        requireMember: (_org, userId) =>
          userId in PROJECT_ROLES
            ? Effect.succeed({ role: PROJECT_ROLES[userId] })
            : Effect.fail(new NotFound()),
        requireRole: (_org, userId, _slug, allowed) => {
          if (!(userId in PROJECT_ROLES)) return Effect.fail(new NotFound())
          const role = PROJECT_ROLES[userId]
          return allowed.includes(role)
            ? Effect.succeed({ role })
            : Effect.fail(new Forbidden())
        }
      })
    ),
    Layer.provide(
      Layer.succeed(CurrentOrg, {
        resolve: (orgSlug, userId) =>
          userId in ORG_ROLES
            ? Effect.succeed({
                organizationId: "org-1",
                orgSlug,
                role: ORG_ROLES[userId]
              })
            : Effect.fail(new NotFound())
      })
    ),
    Layer.provide(
      Layer.mock(TicketDocs, {
        listIds: () => Effect.succeed([ticketId("T-1")])
      })
    ),
    Layer.provide(fakeDb)
  )

const run = <A, E>(
  effect: Effect.Effect<A, E, Library>,
  world: World = makeWorld()
) => effect.pipe(Effect.provide(makeLayer(world)))

const decodeBlockDraft = Schema.decodeUnknownSync(BlockDraft)
const decodeTemplateDraft = Schema.decodeUnknownSync(TemplateDraft)

const blockInput = (
  overrides: Readonly<Record<string, unknown>> = {}
): BlockDraft =>
  decodeBlockDraft({
    key: "context",
    name: "Background",
    icon: "FileText",
    color: null,
    description: "Why",
    sync: false,
    content: "## Background\n\n{{Why this exists}}",
    ...overrides
  })

const templateInput = (
  overrides: Readonly<Record<string, unknown>> = {}
): TemplateDraft =>
  decodeTemplateDraft({
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
  effect: Effect.Effect<A, E, Library>
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
      ...BUILTIN_BLOCKS.filter((block) => keys.includes(block.key))
    ],
    templates: [
      ...layer.templates,
      ...BUILTIN_TEMPLATES.filter((template) => keys.includes(template.key))
    ]
  }))

describe("reading", () => {
  it.effect("serves no built-ins until the org adopts them", () => {
    const world = makeWorld()
    return run(
      Effect.gen(function* () {
        const library = yield* Library
        const org = yield* library.orgLibrary("acme", "member")
        const admin = yield* library.orgLibrary("acme", "org-admin")

        expect(org.canEdit).toBe(false)
        expect(admin.canEdit).toBe(true)
        expect(org.blocks).toEqual([])
        expect(org.templates).toEqual([])
        expect(org.defaults).toEqual({
          feat: null,
          bug: null,
          chore: null,
          other: null
        })

        adopt(world, null, ["context", "chore"])
        const adopted = yield* library.orgLibrary("acme", "member")
        expect(adopted.blocks.map((block) => block.origin)).toEqual(["org"])
        expect(adopted.templates.map((template) => template.key)).toEqual([
          "chore"
        ])
      }),
      world
    )
  })

  it.effect("hides org and project libraries from non-members", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library
        expect(yield* failureTag(library.orgLibrary("acme", "stranger"))).toBe(
          "NotFound"
        )
        expect(
          yield* failureTag(library.projectLibrary("acme", "stranger", "web"))
        ).toBe("NotFound")
      })
    )
  )

  it.effect("resolves project defaults over org defaults", () => {
    const world = makeWorld()
    adopt(world, null, ["bug-report", "chore", "spike"])
    world.orgDefaults.current = {
      bug: templateKey("bug-report"),
      chore: templateKey("chore")
    }
    world.defaults.current = { bug: null, other: templateKey("spike") }
    return run(
      Effect.gen(function* () {
        const library = yield* Library
        const org = yield* library.orgLibrary("acme", "member")
        const project = yield* library.projectLibrary("acme", "member", "web")
        const admin = yield* library.projectLibrary(
          "acme",
          "project-admin",
          "web"
        )

        expect(org.defaults).toEqual({
          feat: null,
          bug: "bug-report",
          chore: "chore",
          other: null
        })
        expect(project.defaults).toEqual({
          feat: null,
          bug: null,
          chore: "chore",
          other: "spike"
        })
        expect(project.inheritedDefaults).toEqual(org.defaults)
        expect(project.ownDefaults).toEqual({ bug: null, other: "spike" })
        expect(project.canEdit).toBe(false)
        expect(admin.canEdit).toBe(true)
      }),
      world
    )
  })
})

describe("role gating", () => {
  it.effect("requires an org admin for the org layer", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library
        expect(
          yield* failureTag(
            library.createBlock("acme", "project-admin", null, blockInput())
          )
        ).toBe("Forbidden")
        expect(
          yield* failureTag(
            library.setOrgTemplateDefaults("acme", "project-admin", {
              defaults: {}
            })
          )
        ).toBe("Forbidden")
        const created = yield* library.createBlock(
          "acme",
          "org-admin",
          null,
          blockInput()
        )
        expect(created.origin).toBe("org")
      })
    )
  )

  it.effect("requires a project admin for the project layer", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library
        expect(
          yield* failureTag(
            library.createTemplate("acme", "member", "web", templateInput())
          )
        ).toBe("Forbidden")
        expect(
          yield* failureTag(
            library.createTemplate("acme", "stranger", "web", templateInput())
          )
        ).toBe("NotFound")
        expect(
          yield* failureTag(
            library.hideTemplate("acme", "member", "web", "chore")
          )
        ).toBe("Forbidden")
        const created = yield* library.createTemplate(
          "acme",
          "project-admin",
          "web",
          templateInput()
        )
        expect(created.origin).toBe("project")
      })
    )
  )
})

describe("keys per layer", () => {
  it.effect("lets a project shadow an org key once", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library
        const org = yield* library.createBlock(
          "acme",
          "org-admin",
          null,
          blockInput()
        )
        const again = yield* failureTag(
          library.createBlock("acme", "org-admin", null, blockInput())
        )
        const project = yield* library.createBlock(
          "acme",
          "project-admin",
          "web",
          blockInput({ name: "Project context" })
        )

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
        const library = yield* Library
        const done = BUILTIN_BLOCKS.find(
          (block) => block.key === "definition-of-done"
        )!
        const adopted = yield* library.createBlock(
          "acme",
          "org-admin",
          null,
          done
        )
        expect(adopted).toMatchObject({ sync: true, origin: "org" })
      })
    )
  )

  it.effect("updates only a file that exists at this layer", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library
        expect(
          yield* failureTag(
            library.updateBlock("acme", "org-admin", null, "context", {
              name: "Nope"
            })
          )
        ).toBe("NotFound")
        yield* library.createBlock("acme", "org-admin", null, blockInput())
        const updated = yield* library.updateBlock(
          "acme",
          "org-admin",
          null,
          "context",
          { name: "Renamed", color: "#70b445" }
        )
        expect(updated.name).toBe("Renamed")
        expect(updated.color).toBe("#70b445")
        expect(updated.content).toBe(blockInput().content)
        const cleared = yield* library.updateBlock(
          "acme",
          "org-admin",
          null,
          "context",
          { color: null }
        )
        expect(cleared.color).toBeNull()
        expect(
          yield* failureTag(
            library.updateBlock("acme", "org-admin", "web", "context", {
              name: "Project"
            })
          )
        ).toBe("NotFound")
      })
    )
  )

  it.effect("removes this layer's file and reverts to the one below", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library
        expect(
          yield* failureTag(
            library.removeBlock("acme", "org-admin", null, "context")
          )
        ).toBe("NotFound")
        yield* library.createBlock("acme", "org-admin", null, blockInput())
        yield* library.createBlock(
          "acme",
          "project-admin",
          "web",
          blockInput({ name: "Project context" })
        )
        yield* library.removeBlock("acme", "project-admin", "web", "context")
        const project = yield* library.projectLibrary("acme", "member", "web")
        expect(
          project.blocks.find((block) => block.key === "context")
        ).toMatchObject({ origin: "org", name: "Background" })
        yield* library.removeBlock("acme", "org-admin", null, "context")
        const org = yield* library.orgLibrary("acme", "member")
        expect(org.blocks).toEqual([])
      })
    )
  )

  it.effect("lets a project hide an org key and nothing else", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library
        expect(
          yield* failureTag(
            library.hideBlock("acme", "project-admin", "web", "context")
          )
        ).toBe("NotFound")
        yield* library.createBlock("acme", "org-admin", null, blockInput())
        yield* library.hideBlock("acme", "project-admin", "web", "context")
        const project = yield* library.projectLibrary("acme", "member", "web")
        const context = project.blocks.find((block) => block.key === "context")

        expect(context?.hidden).toBe(true)
        expect(context?.origin).toBe("project")
        expect(
          yield* failureTag(
            library.hideTemplate("acme", "project-admin", "web", "incident")
          )
        ).toBe("NotFound")
        yield* library.removeBlock("acme", "project-admin", "web", "context")
        const restored = yield* library.projectLibrary("acme", "member", "web")
        expect(
          restored.blocks.find((block) => block.key === "context")?.hidden
        ).toBe(false)
      })
    )
  )

  it.effect("keeps the key of an unreadable file taken", () => {
    const world = makeWorld()
    world.unreadable.add("acme//context")
    world.unreadable.add("acme/web/context")
    return run(
      Effect.gen(function* () {
        const library = yield* Library
        const created = yield* library
          .createBlock("acme", "org-admin", null, blockInput())
          .pipe(Effect.flip)
        expect(created).toMatchObject({ _tag: "Conflict", reason: "key_taken" })

        updateLayer(world, "acme", null, (layer) => ({
          ...layer,
          blocks: [blockInput()]
        }))
        const hidden = yield* library
          .hideBlock("acme", "project-admin", "web", "context")
          .pipe(Effect.flip)
        expect(hidden).toMatchObject({ _tag: "Conflict", reason: "customized" })
        expect(world.layers.get("acme/web")).toBeUndefined()
      }),
      world
    )
  })

  it.effect("keeps the key of an unreadable template file taken", () => {
    const world = makeWorld()
    world.unreadable.add("acme/web/incident")
    return run(
      Effect.gen(function* () {
        const library = yield* Library
        const created = yield* library
          .createTemplate("acme", "project-admin", "web", templateInput())
          .pipe(Effect.flip)
        expect(created).toMatchObject({ _tag: "Conflict", reason: "key_taken" })
        expect(world.layers.get("acme/web")).toBeUndefined()
      }),
      world
    )
  })

  it.effect("refuses to hide a key this layer customized", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library
        yield* library.createBlock("acme", "org-admin", null, blockInput())
        yield* library.createBlock(
          "acme",
          "project-admin",
          "web",
          blockInput({ content: "## Background\n\nOurs" })
        )

        const refused = yield* library
          .hideBlock("acme", "project-admin", "web", "context")
          .pipe(Effect.flip)
        const project = yield* library.projectLibrary("acme", "member", "web")

        expect(refused).toMatchObject({
          _tag: "Conflict",
          reason: "customized"
        })
        expect(
          project.blocks.find((block) => block.key === "context")?.content
        ).toBe("## Background\n\nOurs")
      })
    )
  )
})

describe("content validation", () => {
  const reason = <A, E extends { _tag: string }>(
    effect: Effect.Effect<A, E, Library>
  ) =>
    effect.pipe(
      Effect.flip,
      Effect.map((error) => ("reason" in error ? error.reason : error._tag))
    )

  it.effect("rejects block markup inside a block definition", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library
        expect(
          yield* reason(
            library.createBlock(
              "acme",
              "org-admin",
              null,
              blockInput({
                content: '<block type="context">\n\nx\n\n</block>'
              })
            )
          )
        ).toBe("blocks_not_allowed")
      })
    )
  )

  it.effect("rejects a nested block in a template body", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library
        expect(
          yield* reason(
            library.createTemplate(
              "acme",
              "org-admin",
              null,
              templateInput({
                body: '<block type="a">\n\n<block type="b">\n\n</block>\n\n</block>'
              })
            )
          )
        ).toBe("invalid_blocks:nested:3")
      })
    )
  )

  it.effect("rejects attachments in definitions", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library
        expect(
          yield* reason(
            library.createBlock(
              "acme",
              "org-admin",
              null,
              blockInput({
                content:
                  "## Context\n\n![shot](/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M4)"
              })
            )
          )
        ).toBe("attachments_not_allowed")
      })
    )
  )

  it.effect("validates mentions against the layer", () =>
    run(
      Effect.gen(function* () {
        const library = yield* Library
        const withMention = (mention: string) =>
          blockInput({ content: `## Context\n\nAsk ${mention}` })

        const orgTicket = yield* library
          .createBlock(
            "acme",
            "org-admin",
            null,
            withMention("[T-1](mention:ticket/T-1)")
          )
          .pipe(Effect.flip)
        const orgStranger = yield* library
          .createBlock(
            "acme",
            "org-admin",
            null,
            withMention("[Nobody](mention:user/stranger)")
          )
          .pipe(Effect.flip)
        const orgMember = yield* library.createBlock(
          "acme",
          "org-admin",
          null,
          withMention("[Member](mention:user/member)")
        )
        const projectTicket = yield* library.createBlock(
          "acme",
          "project-admin",
          "web",
          withMention("[T-1](mention:ticket/T-1)")
        )
        const projectMissing = yield* library
          .updateBlock("acme", "project-admin", "web", "context", {
            content: "## Context\n\nSee [T-9](mention:ticket/T-9)"
          })
          .pipe(Effect.flip)

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

describe("template defaults", () => {
  it.effect(
    "writes project overrides and resets them to the org default",
    () => {
      const world = makeWorld()
      adopt(world, null, ["bug-report", "spike"])
      world.orgDefaults.current = { bug: templateKey("bug-report") }
      return run(
        Effect.gen(function* () {
          const library = yield* Library
          expect(
            yield* failureTag(
              library.setTemplateDefaults("acme", "member", "web", {
                defaults: { bug: null }
              })
            )
          ).toBe("Forbidden")
          const unknown = yield* library
            .setTemplateDefaults("acme", "project-admin", "web", {
              defaults: { bug: templateKey("feature") }
            })
            .pipe(Effect.flip)
          expect(unknown).toMatchObject({
            _tag: "Validation",
            reason: "unknown_template:feature"
          })

          const overridden = yield* library.setTemplateDefaults(
            "acme",
            "project-admin",
            "web",
            { defaults: { bug: null, other: templateKey("spike") } }
          )
          expect(overridden.defaults).toEqual({
            feat: null,
            bug: null,
            chore: null,
            other: "spike"
          })
          expect(overridden.inheritedDefaults.bug).toBe("bug-report")
          expect(world.defaults.current).toEqual({ bug: null, other: "spike" })

          const reset = yield* library.setTemplateDefaults(
            "acme",
            "project-admin",
            "web",
            { defaults: {}, reset: ["bug"] }
          )
          expect(reset.defaults.bug).toBe("bug-report")
          expect(world.defaults.current).toEqual({ other: "spike" })
        }),
        world
      )
    }
  )

  it.effect("writes org defaults to the org library file", () => {
    const world = makeWorld()
    adopt(world, null, ["feature"])
    return run(
      Effect.gen(function* () {
        const library = yield* Library
        const unknown = yield* library
          .setOrgTemplateDefaults("acme", "org-admin", {
            defaults: { bug: templateKey("bug-report") }
          })
          .pipe(Effect.flip)
        expect(unknown).toMatchObject({
          _tag: "Validation",
          reason: "unknown_template:bug-report"
        })
        const set = yield* library.setOrgTemplateDefaults("acme", "org-admin", {
          defaults: { feat: templateKey("feature") }
        })
        expect(set.defaults.feat).toBe("feature")
        expect(set.ownDefaults).toEqual({ feat: "feature" })
        expect(world.orgDefaults.current).toEqual({ feat: "feature" })
        const project = yield* library.projectLibrary("acme", "member", "web")
        expect(project.defaults.feat).toBe("feature")
      }),
      world
    )
  })
})

describe("expandForCreate", () => {
  it.effect("expands an adopted template with synced blocks resolved", () => {
    const world = makeWorld()
    adopt(world, null, [
      "bug-report",
      "definition-of-done",
      "steps-to-reproduce"
    ])
    return run(
      Effect.gen(function* () {
        const library = yield* Library
        const expansion = yield* library.expandForCreate(
          "acme",
          "web",
          templateKey("bug-report")
        )

        expect(expansion.type).toBe("bug")
        expect(expansion.body).toContain(
          '<block type="definition-of-done" sync>'
        )
        expect(expansion.body).toContain('<block type="steps-to-reproduce">')
        expect(expansion.body).not.toContain('<block type="environment">')
        expect(expansion.body).not.toContain("{{")
      }),
      world
    )
  })

  it.effect("filters tags to the project's and sanitizes mentions", () => {
    const world = makeWorld()
    updateLayer(world, "acme", null, (layer) => ({
      ...layer,
      templates: [
        templateInput({
          tags: ["frontend", "backend"],
          body: "Ping [Member](mention:user/member), [Nobody](mention:user/stranger), [T-1](mention:ticket/T-1) and [old](mention:ticket/T-9)"
        })
      ]
    }))
    return run(
      Effect.gen(function* () {
        const library = yield* Library
        const expansion = yield* library.expandForCreate(
          "acme",
          "web",
          templateKey("incident")
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
        const library = yield* Library
        const rejected = yield* library
          .createTemplate(
            "acme",
            "project-admin",
            "web",
            templateInput({ body: "Ask [Admin](mention:user/org-admin)" })
          )
          .pipe(Effect.flip)
        updateLayer(world, "acme", null, (layer) => ({
          ...layer,
          templates: [
            templateInput({ body: "Ask [Admin](mention:user/org-admin)" })
          ]
        }))
        const expansion = yield* library.expandForCreate(
          "acme",
          "web",
          templateKey("incident")
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

  it.effect("fails on an unknown or hidden template", () => {
    const world = makeWorld()
    adopt(world, null, ["chore"])
    updateLayer(world, "acme", "web", (layer) => ({
      ...layer,
      hiddenTemplates: ["chore"]
    }))
    return run(
      Effect.gen(function* () {
        const library = yield* Library
        const unadopted = yield* library
          .expandForCreate("acme", "web", templateKey("incident"))
          .pipe(Effect.flip)
        const hidden = yield* library
          .expandForCreate("acme", "web", templateKey("chore"))
          .pipe(Effect.flip)

        expect(unadopted).toMatchObject({
          _tag: "Validation",
          reason: "unknown_template:incident"
        })
        expect(hidden).toMatchObject({
          _tag: "Validation",
          reason: "unknown_template:chore"
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
        const library = yield* Library
        const resolved = yield* library.resolveSynced("acme", "web", body)
        expect(resolved).toBe(body)
        expect(world.reads).toEqual([])
      }),
      world
    )
  })

  it.effect("drops sync from a built-in the org never adopted", () => {
    const world = makeWorld()
    const body =
      '<block type="definition-of-done" sync>\n\n## Definition of done\n\n- [x] Reviewed\n\n</block>'
    return run(
      Effect.gen(function* () {
        const library = yield* Library
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
          const library = yield* Library
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
        const library = yield* Library
        const resolved = yield* library.resolveSynced("acme", "web", body)
        expect(resolved).toContain("- [x] Reviewed\n- [ ] Shipped")
        expect(resolved).not.toContain("Tests cover the change")
        expect(world.reads.toSorted()).toEqual(["acme/", "acme/web"])
      }),
      world
    )
  })
})
