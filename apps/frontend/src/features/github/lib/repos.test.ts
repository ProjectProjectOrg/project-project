import type { GithubOrgIntegrationStatus } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import {
  branchListRepoId,
  connectedRepoIdsKey,
  connectedRepos,
  ticketRepo,
  toggledProjectSlug,
  withConfirmedRepo,
  withConnectedRepo,
  withInstallationAccess,
  withoutConnectedRepo,
  withoutGithubApp,
  withoutGithubInstallation
} from "./repos"

const repo = (repoId: string, defaultBaseBranch: string | null = "main") => ({
  repoId,
  repoOwner: "acme",
  repoName: repoId,
  defaultBaseBranch
})

const app = repo("app")
const api = repo("api")
const both = { github: app, githubRepos: [app, api] }
const none = { github: null, githubRepos: [] }

describe("ticketRepo", () => {
  it("returns the repo the ticket lives in", () => {
    expect(ticketRepo(both, "api")).toBe(api)
  })

  it("falls back to the default repo when the ticket has no repo", () => {
    expect(ticketRepo(both, null)).toBe(app)
    expect(ticketRepo(both, undefined)).toBe(app)
  })

  it("falls back to the default repo when the ticket's repo is gone", () => {
    expect(ticketRepo(both, "removed")).toBe(app)
  })

  it("is null when the project has no repo", () => {
    expect(ticketRepo(none, "api")).toBeNull()
  })
})

describe("connectedRepos", () => {
  it("reads the default repo when the list is missing", () => {
    expect(connectedRepos({ github: app, githubRepos: [] })).toEqual([app])
  })

  it("keys the set regardless of order", () => {
    expect(connectedRepoIdsKey(both)).toBe(
      connectedRepoIdsKey({ github: api, githubRepos: [api, app] })
    )
    expect(connectedRepoIdsKey(none)).toBe("")
  })

  it("names a repo for branch reads only when several are connected", () => {
    expect(branchListRepoId([app], app)).toBeUndefined()
    expect(branchListRepoId([app, api], api)).toBe("api")
  })
})

describe("connect and disconnect", () => {
  it("makes the first connected repo the default", () => {
    expect(withConnectedRepo(none, app)).toEqual({
      github: app,
      githubRepos: [app]
    })
  })

  it("adds a second repo after the default", () => {
    expect(withConnectedRepo({ github: app, githubRepos: [app] }, api)).toEqual(
      both
    )
  })

  it("updates a repo that is already connected in place", () => {
    const next = repo("api", "develop")
    expect(withConnectedRepo(both, next)).toEqual({
      github: app,
      githubRepos: [app, next]
    })
  })

  it("promotes the next repo when the default is disconnected", () => {
    expect(withoutConnectedRepo(both, "app")).toEqual({
      github: api,
      githubRepos: [api]
    })
  })

  it("clears the default when the last repo is disconnected", () => {
    expect(
      withoutConnectedRepo({ github: app, githubRepos: [app] }, "app")
    ).toEqual(none)
  })

  it("takes the server's copy of a repo that is still connected", () => {
    const confirmed = repo("api", "develop")
    expect(
      withConfirmedRepo(
        both,
        { github: app, githubRepos: [app, confirmed] },
        "api"
      )
    ).toEqual({ github: app, githubRepos: [app, confirmed] })
  })

  it("ignores a confirmation for a repo disconnected in the meantime", () => {
    const current = { github: app, githubRepos: [app] }
    expect(withConfirmedRepo(current, both, "api")).toBe(current)
  })
})

const installation = (
  id: string,
  appId: string | null,
  status: "active" | "broken" = "active"
): GithubOrgIntegrationStatus["installations"][number] => ({
  id,
  appId,
  status,
  accountLogin: id,
  accountType: "Organization",
  projectAccess: "all",
  projectSlugs: [],
  lastCheckedAt: null,
  lastCheckError: null
})

const githubApp = (id: string): GithubOrgIntegrationStatus["apps"][number] => ({
  id,
  githubAppId: id,
  name: id,
  slug: id,
  ownerLogin: null,
  createdAt: DateTime.toDate(DateTime.nowUnsafe())
})

const integration: GithubOrgIntegrationStatus = {
  status: "broken",
  apps: [githubApp("one"), githubApp("two")],
  installations: [
    installation("a", "one"),
    installation("b", "two", "broken"),
    installation("c", null)
  ]
}

describe("org integration status", () => {
  it("removes an app together with its installations", () => {
    const next = withoutGithubApp(integration, "two")
    expect(next.apps.map((current) => current.id)).toEqual(["one"])
    expect(next.installations.map((current) => current.id)).toEqual(["a", "c"])
    expect(next.status).toBe("active")
  })

  it("is not connected once the last installation is removed", () => {
    const single = { ...integration, installations: [installation("a", "one")] }
    expect(withoutGithubInstallation(single, "a").status).toBe("not_connected")
  })

  it("changes project access for one installation only", () => {
    const next = withInstallationAccess(integration, "a", {
      projectAccess: "selected",
      projectSlugs: []
    })
    expect(next.installations.map((current) => current.projectAccess)).toEqual([
      "selected",
      "all",
      "all"
    ])
  })

  it("toggles a project in the selected list", () => {
    expect(toggledProjectSlug(["app"], "api")).toEqual(["app", "api"])
    expect(toggledProjectSlug(["app", "api"], "app")).toEqual(["api"])
  })
})
