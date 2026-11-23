import { ProjectStatus, StatusSlug, type StatusPhase } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  mergeStatusColumns,
  normalizeStatusLabel,
  placeInColumns,
  type ProjectStatuses
} from "./statusColumns"

const decodeProjectStatusSync = Schema.decodeSync(ProjectStatus)

const slug = Schema.decodeSync(StatusSlug)

const status = (
  statusSlug: string,
  label: string,
  phase: StatusPhase,
  orderKey: string
) =>
  decodeProjectStatusSync({
    slug: statusSlug,
    label,
    icon: "Circle",
    color: "#123456",
    phase,
    orderKey,
    description: null,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z"
  })

const baseline = (overrides: Readonly<Record<string, string>> = {}) => [
  status("todo", overrides.todo ?? "Todo", "unstarted", "a0"),
  status(
    "in_progress",
    overrides.in_progress ?? "In progress",
    "started",
    "a0"
  ),
  status("done", overrides.done ?? "Done", "finished", "a0")
]

const project = (
  projectSlug: string,
  statuses: ReadonlyArray<ProjectStatus>
) => ({ projectSlug, statuses })

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
      project("web", [
        ...baseline(),
        status("in_review", "In Review", "started", "a1")
      ]),
      project("api", [
        ...baseline(),
        status("review", "in-review", "started", "a1")
      ])
    ])
    expect(merged.columns.map((column) => column.key)).toEqual([
      "todo",
      "in_progress",
      "label:started:inreview",
      "done"
    ])
    expect(merged.columnKeyFor("web", slug("in_review"))).toBe(
      "label:started:inreview"
    )
    expect(merged.columnKeyFor("api", slug("review"))).toBe(
      "label:started:inreview"
    )
  })

  it("keeps same-named statuses in different phases apart", () => {
    expect(
      keys([
        project("web", [
          ...baseline(),
          status("review", "Review", "started", "a1")
        ]),
        project("api", [
          ...baseline(),
          status("review", "Review", "finished", "a1")
        ])
      ])
    ).toEqual([
      "todo",
      "in_progress",
      "label:started:review",
      "done",
      "label:finished:review"
    ])
  })

  it("folds a custom status into a baseline it names", () => {
    const merged = mergeStatusColumns([
      project("web", baseline({ in_progress: "Doing" })),
      project("api", [
        status("todo", "Todo", "unstarted", "a0"),
        status("doing", "Doing", "started", "a0"),
        status("finished", "Done!", "finished", "a1"),
        status("in_progress", "In progress", "started", "a1"),
        status("done", "Done", "finished", "a0")
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

  it("orders columns by phase, then by place within the phase", () => {
    expect(
      keys([
        project("web", [
          status("blocked", "Blocked", "unstarted", "Zz"),
          ...baseline(),
          status("code_test", "Code test", "started", "a1"),
          status("shipped", "Shipped", "finished", "Zz")
        ])
      ])
    ).toEqual([
      "label:unstarted:blocked",
      "todo",
      "in_progress",
      "label:started:codetest",
      "label:finished:shipped",
      "done"
    ])
  })

  it("averages a status's position when projects disagree", () => {
    expect(
      keys([
        project("web", [
          ...baseline(),
          status("review", "Review", "started", "Zz"),
          status("qa", "QA", "started", "a1")
        ]),
        project("api", [
          ...baseline(),
          status("qa", "QA", "started", "a1"),
          status("review", "Review", "started", "a2")
        ])
      ])
    ).toEqual([
      "todo",
      "in_progress",
      "label:started:review",
      "label:started:qa",
      "done"
    ])
  })

  it("keeps statuses with no letters apart by slug", () => {
    const merged = mergeStatusColumns([
      project("web", [...baseline(), status("rocket", "🚀", "started", "a1")]),
      project("api", [...baseline(), status("fire", "🔥", "started", "a1")])
    ])
    expect(merged.columnKeyFor("web", slug("rocket"))).toBe(
      "slug:started:rocket"
    )
    expect(merged.columnKeyFor("api", slug("fire"))).toBe("slug:started:fire")
  })

  it("reports no column for a status it has not seen", () => {
    const merged = mergeStatusColumns([project("web", baseline())])
    expect(merged.columnKeyFor("web", slug("unknown"))).toBeUndefined()
    expect(merged.columnKeyFor("api", slug("todo"))).toBeUndefined()
  })
})

describe("placeInColumns", () => {
  const merged = mergeStatusColumns([
    project("web", [
      ...baseline(),
      status("review", "Review", "started", "a1")
    ]),
    project("api", [...baseline(), status("qa", "QA", "started", "a1")])
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
      ["label:started:review", 1],
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
