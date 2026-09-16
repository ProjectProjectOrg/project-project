import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"
import type { GitStatesResponse, TicketId } from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import { disconnectPersonalGithub, me } from "./auth"
import {
  branches,
  branchesRequest,
  connectGithub,
  createBranch,
  githubIntegration,
  githubOrgRequest,
  projectGitStates
} from "./github"
import { projectRequest } from "./projects"

const { listAccounts, unlinkAccount } = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  unlinkAccount: vi.fn()
}))

vi.mock("@/services/AuthClient", () => ({
  authClient: { listAccounts, unlinkAccount }
}))

const fetchStub = stubFetch()

const pathOf = (input: RequestInfo | URL): string =>
  new URL(
    input instanceof Request ? input.url : String(input),
    "http://localhost"
  ).pathname

const pending = () => new Promise<Response>(() => {})

const req = projectRequest("acme", "app")
const ticketId = "T-1" as TicketId

const noBranch: GitStatesResponse = {
  states: { "T-1": { tag: "no_branch", baseBranch: "main" } },
  transitioned: [],
  tokenStatus: "ok",
  repoStatus: "ok",
  refreshStatus: "fresh"
}

const prOpen: GitStatesResponse = {
  states: {
    "T-1": {
      tag: "pr_open",
      branch: "feat/T-1",
      baseBranch: "main",
      number: 80,
      url: "https://github.com/acme/app/pull/80",
      draft: false,
      title: "Add the thing",
      checks: "passing"
    }
  },
  transitioned: [],
  tokenStatus: "ok",
  repoStatus: "ok",
  refreshStatus: "fresh"
}

const rateLimited: GitStatesResponse = {
  ...prOpen,
  states: {
    "T-1": {
      tag: "pr_open",
      branch: "feat/T-1",
      baseBranch: "main",
      number: 80,
      url: "https://github.com/acme/app/pull/80",
      draft: false,
      title: "",
      checks: "none"
    }
  },
  refreshStatus: "rate_limited"
}

const ticketDetail = {
  id: "T-1",
  title: "Ticket",
  status: "todo",
  type: "other",
  priority: "med",
  tags: [],
  branch: "feat/T-1",
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "branch_no_pr", name: "feat/T-1", baseBranch: "main" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: "2026-09-15T10:00:00.000Z",
  updatedAt: "2026-09-15T10:00:00.000Z",
  creator: null,
  updater: null,
  body: ""
}

const user = {
  id: "user-1",
  email: "sam@example.com",
  name: "Sam",
  username: null,
  image: null,
  createdAt: "2026-09-15T10:00:00.000Z",
  activeOrgSlug: "acme",
  personalGithub: { connected: true },
  editorPreference: "github",
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
}

const projectDetail = (
  github: Readonly<{
    repoId: string
    repoOwner: string
    repoName: string
    defaultBaseBranch: string | null
  }> | null
) => ({
  org: "acme",
  slug: "app",
  key: "APP",
  name: "App",
  icon: "A",
  color: "#123456",
  banner: null,
  iconImage: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  github,
  setup: {
    workflowReviewedAt: null,
    invitePeopleDismissedAt: null,
    connectGithubDismissedAt: null
  },
  body: "",
  members: [],
  pendingMembers: []
})

const repoA = {
  repoId: "repo-a",
  repoOwner: "acme",
  repoName: "app",
  defaultBaseBranch: "main"
}

const repoB = {
  repoId: "repo-b",
  repoOwner: "acme",
  repoName: "other",
  defaultBaseBranch: "main"
}

const integration = {
  status: "active",
  accountLogin: "acme",
  accountType: "Organization",
  lastCheckedAt: null,
  lastCheckError: null
}

describe("createBranch", () => {
  it("paints the branch immediately and holds it until the refetch lands", async () => {
    let served: GitStatesResponse = noBranch
    let finishCreate: ((response: Response) => void) | undefined
    let finishRefetch: ((response: Response) => void) | undefined
    let gitStateCalls = 0
    fetchStub.set((input, init) => {
      const path = pathOf(input)
      if (path.endsWith("/branch") && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          finishCreate = resolve
        })
      }
      if (path.endsWith("/git-states")) {
        gitStateCalls += 1
        if (gitStateCalls === 1) return Promise.resolve(Response.json(served))
        return new Promise<Response>((resolve) => {
          finishRefetch = resolve
        })
      }
      return pending()
    })

    const view = projectGitStates(req)
    const mutation = createBranch({ req, id: ticketId })
    const registry = AtomRegistry.make()
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )

      registry.set(mutation, { name: "feat/T-1", baseBranch: "main" })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) throw new Error("no git states")
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value.states["T-1"]).toEqual({
        tag: "branch_pending",
        name: "feat/T-1",
        baseBranch: "main",
        pendingOperation: "create"
      })

      served = {
        ...noBranch,
        states: {
          "T-1": { tag: "branch_no_pr", name: "feat/T-1", baseBranch: "main" }
        }
      }
      finishCreate?.(Response.json(ticketDetail))

      await vi.waitFor(() => expect(finishRefetch).toBeDefined())
      const held = registry.get(view)
      if (!AsyncResult.isSuccess(held)) throw new Error("no git states")
      expect(held.value.states["T-1"]).toMatchObject({ name: "feat/T-1" })
      expect(held.value.states["T-1"]?.tag).not.toBe("no_branch")

      finishRefetch?.(Response.json(served))
      await vi.waitFor(() => {
        const settled = registry.get(view)
        if (!AsyncResult.isSuccess(settled)) throw new Error("no git states")
        expect(settled.waiting).toBe(false)
        expect(settled.value.states["T-1"]).toEqual({
          tag: "branch_no_pr",
          name: "feat/T-1",
          baseBranch: "main"
        })
      })
    } finally {
      registry.dispose()
    }
  })
})

describe("projectGitStates", () => {
  it("keeps the prior PR title when the server reports a rate-limited read", async () => {
    let served: GitStatesResponse = prOpen
    fetchStub.set((input) => {
      const path = pathOf(input)
      if (path.endsWith("/git-states")) {
        return Promise.resolve(Response.json(served))
      }
      return pending()
    })

    const view = projectGitStates(req)
    const registry = AtomRegistry.make()
    registry.mount(view)
    try {
      await vi.waitFor(() => {
        const result = registry.get(view)
        if (!AsyncResult.isSuccess(result)) throw new Error("no git states")
        expect(result.value.states["T-1"]).toMatchObject({
          title: "Add the thing"
        })
      })

      served = rateLimited
      registry.refresh(view)

      await vi.waitFor(() => {
        const result = registry.get(view)
        if (!AsyncResult.isSuccess(result)) throw new Error("no git states")
        expect(result.value.refreshStatus).toBe("rate_limited")
      })
      const merged = registry.get(view)
      if (!AsyncResult.isSuccess(merged)) throw new Error("no git states")
      expect(merged.value.states["T-1"]).toMatchObject({
        title: "Add the thing",
        checks: "passing"
      })
    } finally {
      registry.dispose()
    }
  })
})

describe("disconnectPersonalGithub", () => {
  it("refreshes the github reads through the github auth key", async () => {
    let integrationCalls = 0
    listAccounts.mockResolvedValue({
      data: [{ id: "account-1", providerId: "github" }],
      error: null
    })
    unlinkAccount.mockResolvedValue({ data: { status: true }, error: null })
    fetchStub.set((input) => {
      const path = pathOf(input)
      if (path.endsWith("/me")) return Promise.resolve(Response.json(user))
      if (path.endsWith("/integrations/github")) {
        integrationCalls += 1
        return Promise.resolve(Response.json(integration))
      }
      return pending()
    })

    const view = githubIntegration(githubOrgRequest("acme"))
    const registry = AtomRegistry.make()
    registry.mount(me())
    registry.mount(view)
    try {
      await vi.waitFor(() => {
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
        expect(integrationCalls).toBe(1)
      })

      registry.set(disconnectPersonalGithub, undefined)

      await vi.waitFor(() => expect(unlinkAccount).toHaveBeenCalled())
      await vi.waitFor(() => expect(integrationCalls).toBe(2))
    } finally {
      registry.dispose()
    }
  })
})

describe("branches", () => {
  it("stops serving the previous repository's branches once the repo changes", async () => {
    let branchCalls = 0
    let finishBranches: ((response: Response) => void) | undefined
    fetchStub.set((input, init) => {
      const path = pathOf(input)
      if (path.endsWith("/github/branches")) {
        branchCalls += 1
        if (branchCalls === 1) {
          return Promise.resolve(
            Response.json({
              items: [{ name: "feat/only-in-repo-a", isProtected: false }],
              hasMore: false
            })
          )
        }
        return new Promise<Response>((resolve) => {
          finishBranches = resolve
        })
      }
      if (path.endsWith("/github") && init?.method === "POST") {
        return Promise.resolve(Response.json(projectDetail(repoB)))
      }
      if (path.endsWith("/projects/app")) {
        return Promise.resolve(Response.json(projectDetail(repoA)))
      }
      return pending()
    })

    const view = branches(branchesRequest("acme", "app", ""))
    const connect = connectGithub(req)
    const registry = AtomRegistry.make()
    registry.mount(view)
    registry.mount(connect)
    try {
      await vi.waitFor(() => {
        const result = registry.get(view)
        if (!AsyncResult.isSuccess(result)) throw new Error("no branches")
        expect(result.value.items).toHaveLength(1)
      })

      registry.set(connect, {
        repoId: repoB.repoId,
        repoOwner: repoB.repoOwner,
        repoName: repoB.repoName,
        defaultBaseBranch: repoB.defaultBaseBranch
      })

      await vi.waitFor(() => expect(finishBranches).toBeDefined())
      expect(AsyncResult.isWaiting(registry.get(view))).toBe(true)

      finishBranches?.(Response.json({ items: [], hasMore: false }))
      await vi.waitFor(() => {
        const settled = registry.get(view)
        if (!AsyncResult.isSuccess(settled)) throw new Error("no branches")
        expect(settled.waiting).toBe(false)
        expect(settled.value.items).toEqual([])
      })
    } finally {
      registry.dispose()
    }
  })
})
