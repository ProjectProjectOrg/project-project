import { RegistryContext } from "@effect/atom-react"
import {
  BUILTIN_BLOCKS,
  BlockDefinition,
  Library,
  TemplateDefinition,
  type BlockDraft,
  type LibraryOrigin,
  type TemplateDraft,
  type TemplateKey
} from "@pp/shared"
import { render } from "@testing-library/react"
import * as Schema from "effect/Schema"
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { ReactNode } from "react"

import type { FetchHandler } from "@/api/testFetch"

export type Call = Readonly<{ method: string; path: string; body: unknown }>

const encodeLibrary = Schema.encodeSync(Library)
const encodeTemplate = Schema.encodeSync(TemplateDefinition)
const encodeBlock = Schema.encodeSync(BlockDefinition)

export const blockDraft = (key: string): BlockDraft =>
  BUILTIN_BLOCKS.find((block) => block.key === key)!

export const asBlock = (
  draft: BlockDraft,
  origin: LibraryOrigin = "project"
): BlockDefinition => ({ ...draft, origin, shadows: null, hidden: false })

export const asTemplate = (
  draft: TemplateDraft,
  origin: LibraryOrigin = "project"
): TemplateDefinition => ({ ...draft, origin, shadows: null, hidden: false })

export const templateDraft = (
  key: string,
  body: string,
  overrides: Partial<TemplateDraft> = {}
): TemplateDraft => ({
  key: key as TemplateKey,
  name: "Bug report",
  icon: "Bug",
  color: null,
  description: "Something is broken",
  type: "bug",
  priority: null,
  tags: [],
  body,
  ...overrides
})

const NO_DEFAULTS = { feat: null, bug: null, chore: null, other: null }

export const libraryOf = (
  blocks: ReadonlyArray<BlockDefinition>,
  templates: ReadonlyArray<TemplateDefinition>,
  canEdit = true
): Library => ({
  blocks,
  templates,
  defaults: NO_DEFAULTS,
  ownDefaults: {},
  inheritedDefaults: NO_DEFAULTS,
  canEdit
})

const pathOf = (input: RequestInfo | URL): string => {
  const href =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  return new URL(href, "http://localhost").pathname.replace(/^\/api/, "")
}

export const libraryServer = (
  initial: Library,
  calls: Array<Call>
): FetchHandler => {
  let served = initial
  return async (input, init) => {
    const path = pathOf(input)
    const method = init?.method ?? "GET"
    const text =
      init?.body === undefined || init.body === null
        ? ""
        : await new Response(init.body).text()
    const body: unknown = text === "" ? null : JSON.parse(text)
    calls.push({ method, path, body })
    if (method === "GET")
      return path.endsWith("/library")
        ? Response.json(encodeLibrary(served))
        : new Response(null, { status: 404 })
    const [, kind, key] =
      /\/library\/(templates|blocks)(?:\/([^/]+))?$/.exec(path) ?? []
    const layer: LibraryOrigin = path.includes("/projects/") ? "project" : "org"
    if (kind === "templates") {
      const current = served.templates.find((entry) => entry.key === key)
      const next = asTemplate(
        { ...current, ...(body as TemplateDraft) } as TemplateDraft,
        layer
      )
      served = {
        ...served,
        templates: [
          ...served.templates.filter((entry) => entry.key !== next.key),
          next
        ]
      }
      return Response.json(encodeTemplate(next))
    }
    if (kind === "blocks") {
      const current = served.blocks.find((entry) => entry.key === key)
      const next = asBlock(
        { ...current, ...(body as BlockDraft) } as BlockDraft,
        layer
      )
      served = {
        ...served,
        blocks: [
          ...served.blocks.filter((entry) => entry.key !== next.key),
          next
        ]
      }
      return Response.json(encodeBlock(next))
    }
    return new Response(null, { status: 204 })
  }
}

export const renderWithRegistry = (
  registry: AtomRegistry.AtomRegistry,
  node: ReactNode
) =>
  render(
    <RegistryContext.Provider value={registry}>{node}</RegistryContext.Provider>
  )
