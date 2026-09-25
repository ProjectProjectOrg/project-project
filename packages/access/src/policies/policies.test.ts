import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"

import * as Effective from "../roles/effective"
import type * as Org from "../roles/org"
import type * as Project from "../roles/project"
import type { ProjectActor } from "./actor"
import * as CommentPolicy from "./comment"
import * as GroupPolicy from "./group"
import * as TicketPolicy from "./ticket"

const actor = (
  orgRole: Org.OrgRoleName,
  role: Project.ProjectRoleName | null,
  userId = "me"
) => ({
  userId,
  permissions: Option.getOrThrow(Effective.projectPermissions(orgRole, role))
})

const actors = {
  pm: actor("member", "pm"),
  developer: actor("member", "developer"),
  client: actor("member", "client"),
  orgAdmin: actor("admin", null)
}

type ActorName = keyof typeof actors

const allowed = (decide: (subject: ProjectActor) => boolean) =>
  Object.entries(actors).flatMap(([name, subject]) =>
    decide(subject) ? [name] : []
  )

const change = (overrides: Partial<TicketPolicy.Change>) => ({
  ownerId: "someone-else",
  content: false,
  status: false,
  assignees: false,
  ...overrides
})

describe("TicketPolicy.canChange", () => {
  it.each<readonly [string, TicketPolicy.Change, ReadonlyArray<ActorName>]>([
    ["nothing", change({}), ["pm", "developer", "client", "orgAdmin"]],
    ["someone else's content", change({ content: true }), ["pm", "developer"]],
    [
      "their own content",
      change({ content: true, ownerId: "me" }),
      ["pm", "developer", "client"]
    ],
    ["the status", change({ status: true }), ["pm", "developer"]],
    ["the assignees", change({ assignees: true }), ["pm", "developer"]],
    [
      "their own content and its status",
      change({ content: true, status: true, ownerId: "me" }),
      ["pm", "developer"]
    ]
  ])("who may change %s", (_, subject, expected) => {
    expect(
      allowed((candidate) => TicketPolicy.canChange(candidate, subject))
    ).toStrictEqual(expected)
  })
})

describe("CommentPolicy", () => {
  it.each<
    readonly [
      string,
      (subject: ProjectActor, comment: CommentPolicy.Authored) => boolean,
      string,
      ReadonlyArray<ActorName>
    ]
  >([
    ["edit", CommentPolicy.canEdit, "me", ["pm", "developer", "client"]],
    ["edit", CommentPolicy.canEdit, "someone-else", ["pm"]],
    ["delete", CommentPolicy.canDelete, "me", ["pm", "developer", "client"]],
    ["delete", CommentPolicy.canDelete, "someone-else", ["pm"]]
  ])("%s a comment by %s", (_, decide, authorId, expected) => {
    expect(
      allowed((candidate) => decide(candidate, { authorId }))
    ).toStrictEqual(expected)
  })
})

describe("GroupPolicy.canManage", () => {
  it.each<readonly [GroupPolicy.Kind, ReadonlyArray<ActorName>]>([
    ["sprint", ["pm"]],
    ["milestone", ["pm"]],
    ["epic", ["pm", "developer"]],
    ["other", ["pm", "developer"]]
  ])("manages a %s", (kind, expected) => {
    expect(
      allowed((candidate) => GroupPolicy.canManage(candidate, kind))
    ).toStrictEqual(expected)
  })
})

const fields = (status: string, assignees: ReadonlyArray<string> = []) => ({
  status,
  assignees
})

const split = (overrides: Partial<TicketPolicy.Split>) => ({
  ownerId: "someone-else",
  source: fields("in_progress", ["dev-1"]),
  retained: fields("in_progress", ["dev-1"]),
  created: [fields("todo")],
  defaultStatus: "todo",
  detachesGit: false,
  ...overrides
})

describe("TicketPolicy.canSplit", () => {
  it.each<readonly [string, TicketPolicy.Split, ReadonlyArray<ActorName>]>([
    ["someone else's ticket", split({}), ["pm", "developer"]],
    [
      "their own ticket",
      split({ ownerId: "me" }),
      ["pm", "developer", "client"]
    ],
    [
      "their own ticket into pieces with a new status",
      split({ ownerId: "me", created: [fields("in_progress")] }),
      ["pm", "developer"]
    ],
    [
      "their own ticket into pieces with assignees",
      split({ ownerId: "me", created: [fields("todo", ["dev-1"])] }),
      ["pm", "developer"]
    ],
    [
      "their own ticket, keeping a different status",
      split({ ownerId: "me", retained: fields("done", ["dev-1"]) }),
      ["pm", "developer"]
    ],
    [
      "their own ticket, dropping an assignee",
      split({ ownerId: "me", retained: fields("in_progress") }),
      ["pm", "developer"]
    ],
    [
      "a ticket with a branch",
      split({ detachesGit: true }),
      ["pm", "developer"]
    ],
    [
      "their own ticket with a branch",
      split({ ownerId: "me", detachesGit: true }),
      ["pm", "developer"]
    ]
  ])("who may split %s", (_, subject, expected) => {
    expect(
      allowed((candidate) => TicketPolicy.canSplit(candidate, subject))
    ).toStrictEqual(expected)
  })
})

describe("TicketPolicy.canQuery", () => {
  it.each<readonly [string, TicketPolicy.Query, ReadonlyArray<ActorName>]>([
    ["no GitHub filter", {}, ["pm", "developer", "client", "orgAdmin"]],
    ["hasBranch", { hasBranch: true }, ["pm", "developer", "orgAdmin"]],
    ["hasPr", { hasPr: false }, ["pm", "developer", "orgAdmin"]]
  ])("who may filter by %s", (_, query, expected) => {
    expect(
      allowed((candidate) => TicketPolicy.canQuery(candidate, query))
    ).toStrictEqual(expected)
  })
})
