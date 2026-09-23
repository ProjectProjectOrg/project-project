import { ProjectStatus, StatusSlug } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  mergeStatusColumns,
  normalizeStatusLabel,
  placeInColumns,
  type ProjectStatuses
} from "./statusColumns"

const slug = Schema.decodeSync(StatusSlug)

const status = (
  statusSlug: string,
  label: string,
  orderKey: string,
  color = "#123456"
): ProjectStatus =>
  Schema.decodeSync(ProjectStatus)({
    slug: statusSlug,
    label,
    icon: "Circle",
    color,
    orderKey,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z"
  })

const baseline = (overrides: Readonly<Record<string, string>> = {}) => [
  status("todo", overrides.todo ?? "Todo", "a0"),
  status("in_progress", overrides.in_progress ?? "In progress", "a1"),
  status("done", overrides.done ?? "Done", "a2")
]

const project = (
  projectSlug: string,
  statuses: ReadonlyArray<ProjectStatus>
): ProjectStatuses => ({ projectSlug, statuses })

const keys = (projects: ReadonlyArray<ProjectStatuses>) =>
  mergeStatusColumns(projects).columns.map((column) => column.key)

describe("normalizeStatusLabel", () => {
  it("ignores case, spacing, punctuation and accents", () => {
    expect(normalizeStatusLabel("In Review")).toBe("inreview")
    expect(normalizeStatusLabel(" in-review ")).toBe("inreview")
    expect(normalizeStatusLabel("in_review")).toBe("inreview")
    expect(normalizeStatusLabel("Révision")).toBe("revision")
  })
})

describe("mergeStatusColumns", () => {
  it("returns no columns for no projects", () => {
    expect(mergeStatusColumns([]).columns).toEqual([])
  })

  it("keeps a single project's baseline order", () => {
    expect(keys([project("web", baseline())])).toEqual([
      "todo",
      "in_progress",
      "done"
    ])
  })

  it("merges renamed baselines on their slug and labels them by majority", () => {
    const merged = mergeStatusColumns([
      project("web", baseline({ in_progress: "Doing" })),
      project("api", baseline()),
      project("app", baseline())
    ])
    const inProgress = merged.columns.find(
      (column) => column.key === "in_progress"
    )
    expect(merged.columns).toHaveLength(3)
    expect(inProgress?.label).toBe("In progress")
    expect(inProgress?.members.map((member) => member.projectSlug)).toEqual([
      "web",
      "api",
      "app"
    ])
  })

  it("merges custom statuses whose labels differ only in spelling", () => {
    const merged = mergeStatusColumns([
      project("web", [...baseline(), status("in_review", "In Review", "a1V")]),
      project("api", [...baseline(), status("review", "in-review", "a1V")])
    ])
    expect(merged.columns.map((column) => column.key)).toEqual([
      "todo",
      "in_progress",
      "label:inreview",
      "done"
    ])
    expect(merged.columnKeyFor("web", slug("in_review"))).toBe("label:inreview")
    expect(merged.columnKeyFor("api", slug("review"))).toBe("label:inreview")
  })

  it("folds a custom status into a baseline it names", () => {
    const merged = mergeStatusColumns([
      project("web", baseline({ in_progress: "Doing" })),
      project("api", [
        status("todo", "Todo", "a0"),
        status("doing", "Doing", "a1"),
        status("finished", "Done!", "a3"),
        status("in_progress", "In progress", "a2"),
        status("done", "Done", "a4")
      ])
    ])
    expect(merged.columnKeyFor("api", slug("doing"))).toBe("in_progress")
    expect(merged.columnKeyFor("api", slug("finished"))).toBe("done")
    expect(merged.columns.map((column) => column.key)).toEqual([
      "todo",
      "in_progress",
      "done"
    ])
  })

  it("places custom statuses between the baselines they sit between", () => {
    expect(
      keys([
        project("web", [
          status("blocked", "Blocked", "Zz"),
          ...baseline(),
          status("code_test", "Code test", "a1V"),
          status("shipped", "Shipped", "a3")
        ])
      ])
    ).toEqual([
      "label:blocked",
      "todo",
      "in_progress",
      "label:codetest",
      "done",
      "label:shipped"
    ])
  })

  it("averages a status's position when projects disagree", () => {
    expect(
      keys([
        project("web", [
          status("todo", "Todo", "a0"),
          status("review", "Review", "a1"),
          status("in_progress", "In progress", "a2"),
          status("qa", "QA", "a3"),
          status("done", "Done", "a4")
        ]),
        project("api", [
          ...baseline(),
          status("review", "Review", "a1V"),
          status("qa", "QA", "a1W")
        ])
      ])
    ).toEqual(["todo", "label:review", "in_progress", "label:qa", "done"])
  })

  it("keeps statuses with no letters apart by slug", () => {
    const merged = mergeStatusColumns([
      project("web", [...baseline(), status("rocket", "🚀", "a1V")]),
      project("api", [...baseline(), status("fire", "🔥", "a1V")])
    ])
    expect(merged.columnKeyFor("web", slug("rocket"))).toBe("slug:rocket")
    expect(merged.columnKeyFor("api", slug("fire"))).toBe("slug:fire")
  })

  it("reports no column for a status it has not seen", () => {
    const merged = mergeStatusColumns([project("web", baseline())])
    expect(merged.columnKeyFor("web", slug("unknown"))).toBeUndefined()
    expect(merged.columnKeyFor("api", slug("todo"))).toBeUndefined()
  })
})

describe("placeInColumns", () => {
  const merged = mergeStatusColumns([
    project("web", [...baseline(), status("review", "Review", "a1V")]),
    project("api", [...baseline(), status("qa", "QA", "a1V")])
  ])
  const locate = (item: Readonly<{ project: string; status: string }>) =>
    [item.project, slug(item.status)] as const

  it("groups items into their merged column in column order", () => {
    const placed = placeInColumns(
      merged,
      [
        { project: "api", status: "done" },
        { project: "web", status: "review" },
        { project: "web", status: "done" }
      ],
      locate
    )
    expect(placed.map((column) => [column.key, column.items.length])).toEqual([
      ["todo", 0],
      ["in_progress", 0],
      ["label:review", 1],
      ["done", 2]
    ])
  })

  it("drops items whose status it cannot place", () => {
    const placed = placeInColumns(
      merged,
      [{ project: "web", status: "gone" }],
      locate
    )
    expect(placed.flatMap((column) => column.items)).toEqual([])
  })
})
