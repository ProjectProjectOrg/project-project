import { expect, it } from "vitest"

import { githubRepoMatchesQuery } from "./GitHubLive"

const repo = {
  owner: { login: "outside-org" },
  name: "project-project",
  description: "Markdown-first planning"
}

it("matches repositories by organization owner", () => {
  expect(githubRepoMatchesQuery(repo, "outside-org")).toBe(true)
})

it("matches repository search across owner and name tokens", () => {
  expect(githubRepoMatchesQuery(repo, "outside project")).toBe(true)
})

it("does not match unrelated repositories", () => {
  expect(githubRepoMatchesQuery(repo, "personal-only")).toBe(false)
})
