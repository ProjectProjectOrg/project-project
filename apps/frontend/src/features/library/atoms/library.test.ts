import {
  BUILTIN_BLOCKS,
  BlockDefinition,
  BlockKey,
  Conflict,
  EMPTY_LAYER,
  Library,
  resolveLibrary,
  type BlockDraft,
  type Layer
} from "@pp/shared"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import {
  createOrgBlock,
  createProjectBlock,
  orgLibraryFor,
  orgLibraryRequest,
  projectLibraryFor,
  projectLibraryRequest,
  removeProjectBlock,
  updateProjectBlock
} from "./library"

const fetchStub = stubFetch()
const orgReq = orgLibraryRequest("acme")
const projectReq = projectLibraryRequest("acme", "web")
const encodeLibrary = Schema.encodeSync(Library)
const encodeBlock = Schema.encodeSync(BlockDefinition)
const encodeConflict = Schema.encodeSync(Conflict)
const blockKey = Schema.decodeSync(BlockKey)

const contextBlock = BUILTIN_BLOCKS.find((block) => block.key === "context")!

const triageDraft: BlockDraft = {
  key: blockKey("triage"),
  name: "Triage",
  icon: contextBlock.icon,
  color: null,
  description: "How we triage",
  sync: false,
  content: "## Triage"
}

const libraryWith = (project: Layer | null, org: Layer = EMPTY_LAYER) =>
  resolveLibrary({ org, project }, true)

const layerWith = (blocks: ReadonlyArray<BlockDraft>): Layer => ({
  ...EMPTY_LAYER,
  blocks
})

type Route = Readonly<{
  method: string
  path: string
  respond: () => Promise<Response>
}>

const serve = (routes: ReadonlyArray<Route>) => {
  const calls: Array<string> = []
  fetchStub.set((input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const url = new URL(href, "http://localhost")
    const method = init?.method ?? "GET"
    calls.push(`${method} ${url.pathname}`)
    const route = routes.find(
      (candidate) =>
        candidate.method === method && url.pathname === `/api${candidate.path}`
    )
    return route === undefined
      ? Promise.resolve(new Response(null, { status: 404 }))
      : route.respond()
  })
  return calls
}

const json = (library: Library) => () =>
  Promise.resolve(Response.json(encodeLibrary(library)))

const deferred = () => {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const successValue = <A>(result: AsyncResult.AsyncResult<A, unknown>): A => {
  if (!AsyncResult.isSuccess(result)) throw new Error(`not a success`)
  return result.value
}

const blockIn = (library: Library, key: string) =>
  library.blocks.find((block) => block.key === key)

const PROJECT_PATH = "/orgs/acme/projects/web/library"
const ORG_PATH = "/orgs/acme/library"

describe("library atoms", () => {
  it("reads the org and project libraries", async () => {
    const project = libraryWith(layerWith([triageDraft]))
    serve([
      {
        method: "GET",
        path: ORG_PATH,
        respond: json(libraryWith(null))
      },
      {
        method: "GET",
        path: PROJECT_PATH,
        respond: json(project)
      }
    ])
    const registry = AtomRegistry.make()
    registry.mount(orgLibraryFor(orgReq))
    registry.mount(projectLibraryFor(projectReq))
    try {
      await vi.waitFor(() => {
        expect(registry.get(orgLibraryFor(orgReq))._tag).toBe("Success")
        expect(registry.get(projectLibraryFor(projectReq))._tag).toBe("Success")
      })
      const loaded = successValue(registry.get(projectLibraryFor(projectReq)))
      expect(blockIn(loaded, "triage")).toMatchObject({
        origin: "project",
        shadows: null
      })
      expect(blockIn(loaded, "context")).toBeUndefined()
    } finally {
      registry.dispose()
    }
  })

  it("shows a created project block before the server answers", async () => {
    let served = libraryWith(null)
    const create = deferred()
    serve([
      {
        method: "GET",
        path: PROJECT_PATH,
        respond: () => Promise.resolve(Response.json(encodeLibrary(served)))
      },
      {
        method: "POST",
        path: `${PROJECT_PATH}/blocks`,
        respond: () => create.promise
      }
    ])
    const registry = AtomRegistry.make()
    const view = projectLibraryFor(projectReq)
    const mutation = createProjectBlock({ req: projectReq })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() => expect(registry.get(view)._tag).toBe("Success"))

      registry.set(mutation, triageDraft)
      const optimistic = registry.get(view)
      expect(optimistic.waiting).toBe(true)
      expect(blockIn(successValue(optimistic), "triage")).toMatchObject({
        origin: "project",
        hidden: false
      })

      served = libraryWith(layerWith([triageDraft]))
      create.resolve(Response.json(encodeBlock(blockIn(served, "triage")!)))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      await vi.waitFor(() => expect(registry.get(view).waiting).toBe(false))
      expect(blockIn(successValue(registry.get(view)), "triage")?.name).toBe(
        "Triage"
      )
    } finally {
      registry.dispose()
    }
  })

  it("renames a block optimistically and keeps the confirmed value", async () => {
    let served = libraryWith(layerWith([triageDraft]))
    const update = deferred()
    serve([
      {
        method: "GET",
        path: PROJECT_PATH,
        respond: () => Promise.resolve(Response.json(encodeLibrary(served)))
      },
      {
        method: "PATCH",
        path: `${PROJECT_PATH}/blocks/triage`,
        respond: () => update.promise
      }
    ])
    const registry = AtomRegistry.make()
    const view = projectLibraryFor(projectReq)
    const mutation = updateProjectBlock({
      req: projectReq,
      key: triageDraft.key
    })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() => expect(registry.get(view)._tag).toBe("Success"))

      registry.set(mutation, { name: "Intake" })
      expect(blockIn(successValue(registry.get(view)), "triage")?.name).toBe(
        "Intake"
      )

      served = libraryWith(layerWith([{ ...triageDraft, name: "Intake" }]))
      update.resolve(Response.json(encodeBlock(blockIn(served, "triage")!)))
      await vi.waitFor(() => expect(registry.get(view).waiting).toBe(false))
      expect(blockIn(successValue(registry.get(view)), "triage")?.name).toBe(
        "Intake"
      )
    } finally {
      registry.dispose()
    }
  })

  it("reverts a project override to the org entry on remove", async () => {
    const org = layerWith([contextBlock])
    const override = { ...contextBlock, name: "Why" }
    let served = libraryWith(layerWith([override]), org)
    const remove = deferred()
    serve([
      {
        method: "GET",
        path: PROJECT_PATH,
        respond: () => Promise.resolve(Response.json(encodeLibrary(served)))
      },
      {
        method: "DELETE",
        path: `${PROJECT_PATH}/blocks/context`,
        respond: () => remove.promise
      }
    ])
    const registry = AtomRegistry.make()
    const view = projectLibraryFor(projectReq)
    const mutation = removeProjectBlock({
      req: projectReq,
      key: contextBlock.key
    })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() => expect(registry.get(view)._tag).toBe("Success"))
      expect(
        blockIn(successValue(registry.get(view)), "context")
      ).toMatchObject({ origin: "project", shadows: "org", name: "Why" })

      registry.set(mutation, undefined)
      expect(
        blockIn(successValue(registry.get(view)), "context")
      ).toBeUndefined()

      served = libraryWith(EMPTY_LAYER, org)
      remove.resolve(new Response(null, { status: 204 }))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      await vi.waitFor(() =>
        expect(
          blockIn(successValue(registry.get(view)), "context")
        ).toMatchObject({ origin: "org", name: contextBlock.name })
      )
    } finally {
      registry.dispose()
    }
  })

  it("rolls back a failed create", async () => {
    serve([
      {
        method: "GET",
        path: PROJECT_PATH,
        respond: json(libraryWith(null))
      },
      {
        method: "POST",
        path: `${PROJECT_PATH}/blocks`,
        respond: () =>
          Promise.resolve(
            Response.json(
              encodeConflict(new Conflict({ reason: "key_taken" })),
              { status: 409 }
            )
          )
      }
    ])
    const registry = AtomRegistry.make()
    const view = projectLibraryFor(projectReq)
    const mutation = createProjectBlock({ req: projectReq })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() => expect(registry.get(view)._tag).toBe("Success"))
      registry.set(mutation, triageDraft)
      await vi.waitFor(() =>
        expect(registry.get(mutation)._tag).toBe("Failure")
      )
      await vi.waitFor(() =>
        expect(blockIn(successValue(registry.get(view)), "triage")).toBe(
          undefined
        )
      )
    } finally {
      registry.dispose()
    }
  })

  it("refreshes the project library after an org mutation", async () => {
    let orgLayer: Layer = EMPTY_LAYER
    const calls = serve([
      {
        method: "GET",
        path: ORG_PATH,
        respond: () =>
          Promise.resolve(
            Response.json(encodeLibrary(libraryWith(null, orgLayer)))
          )
      },
      {
        method: "GET",
        path: PROJECT_PATH,
        respond: () =>
          Promise.resolve(
            Response.json(encodeLibrary(libraryWith(EMPTY_LAYER, orgLayer)))
          )
      },
      {
        method: "POST",
        path: `${ORG_PATH}/blocks`,
        respond: () => {
          orgLayer = layerWith([triageDraft])
          return Promise.resolve(
            Response.json(
              encodeBlock(blockIn(libraryWith(null, orgLayer), "triage")!)
            )
          )
        }
      }
    ])
    const registry = AtomRegistry.make()
    const projectView = projectLibraryFor(projectReq)
    const mutation = createOrgBlock({ req: orgReq })
    registry.mount(orgLibraryFor(orgReq))
    registry.mount(projectView)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(projectView)._tag).toBe("Success")
      )
      registry.set(mutation, triageDraft)
      await vi.waitFor(() =>
        expect(
          blockIn(successValue(registry.get(projectView)), "triage")?.origin
        ).toBe("org")
      )
      expect(
        calls.filter((call) => call === `GET /api${PROJECT_PATH}`)
      ).toHaveLength(2)
    } finally {
      registry.dispose()
    }
  })
})
