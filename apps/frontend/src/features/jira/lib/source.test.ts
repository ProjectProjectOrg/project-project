import { describe, expect, it } from "vitest"

import { defaultCloudId, filterJiraProjects, sourceRequestFor } from "./source"

const project = (key: string, name: string) => ({
  id: key,
  key,
  name,
  projectTypeKey: null,
  simplified: null,
  style: null,
  avatarUrl: null
})

const site = (cloudId: string) => ({
  cloudId,
  name: cloudId,
  url: "https://example.test",
  avatarUrl: null
})

describe("sourceRequestFor", () => {
  it("keeps the request id for the same choice and makes a new one when it changes", () => {
    const first = sourceRequestFor(null, "c1", "p1", () => "a")
    expect(sourceRequestFor(first, "c1", "p1", () => "b")).toBe(first)
    expect(sourceRequestFor(first, "c1", "p2", () => "b").id).toBe("b")
  })
})

describe("defaultCloudId", () => {
  it("picks the only site and nothing when there are several", () => {
    expect(defaultCloudId([site("c1")])).toBe("c1")
    expect(defaultCloudId([site("c1"), site("c2")])).toBe("")
  })
})

describe("filterJiraProjects", () => {
  it("matches every word against key and name", () => {
    const projects = [project("APP", "Fixture App"), project("GEN", "Platform")]
    expect(
      filterJiraProjects(projects, "app fix").map((item) => item.key)
    ).toEqual(["APP"])
    expect(filterJiraProjects(projects, " ")).toHaveLength(2)
  })
})
