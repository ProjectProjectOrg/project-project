import { RegistryContext } from "@effect/atom-react"
import {
  BUILTIN_BLOCKS,
  BlockDefinition,
  Library,
  type BlockDraft,
  type LibraryOrigin
} from "@pp/shared"
import { render } from "@testing-library/react"
import * as Schema from "effect/Schema"
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { ReactNode } from "react"

import type { FetchHandler } from "@/api/testFetch"

export type Call = Readonly<{ method: string; path: string; body: unknown }>

const encodeLibrary = Schema.encodeSync(Library)
const encodeBlock = Schema.encodeSync(BlockDefinition)

export const blockDraft = (key: string): BlockDraft =>
  BUILTIN_BLOCKS.find((block) => block.key === key)!

export const asBlock = (
  draft: BlockDraft,
  origin: LibraryOrigin = "project"
): BlockDefinition => ({ ...draft, origin, shadows: null, hidden: false })

export const libraryOf = (
  blocks: ReadonlyArray<BlockDefinition>,
  canEdit = true
): Library => ({ blocks, canEdit })

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
    const [, kind, key] = /\/library\/(blocks)(?:\/([^/]+))?$/.exec(path) ?? []
    const layer: LibraryOrigin = path.includes("/projects/") ? "project" : "org"
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
