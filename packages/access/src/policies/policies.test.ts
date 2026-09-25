import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"

import * as Effective from "../roles/effective"
import type * as Org from "../roles/org"
import * as Project from "../roles/project"
import type { ProjectActor } from "./actor"
import * as CommentPolicy from "./comment"
import * as GroupPolicy from "./group"
import * as ProjectPolicy from "./project"
import * as TicketPolicy from "./ticket"

const actor = (
  orgRole: Org.OrgRoleName,
  role: Project.ProjectRoleName | null
) => ({
  userId: "me",
  permissions: Option.getOrThrow(Effective.projectPermissions(orgRole, role))
})

const actors = {
  pm: actor("member", "pm"),
  developer: actor("member", "developer"),
  client: actor("member", "client"),
  orgAdmin: actor("admin", null),
  editor: {
    userId: "me",
    permissions: Project.projectStatement.role({
      ticket: ["read", "create", "update"]
    })
  }
}

type ActorName = keyof typeof actors

const allowed = (decide: (subject: ProjectActor) => boolean) =>
  Object.entries(actors).flatMap(([name, subject]) =>
    decide(subject) ? [name] : []
  )

const change = (overrides: Partial<TicketPolicy.Change>) => ({
  content: false,
  status: false,
  assignees: false,
  ...overrides
})

describe("TicketPolicy.canChange", () => {
  it.each<readonly [string, TicketPolicy.Change, ReadonlyArray<ActorName>]>([
    [
      "nothing",
      change({}),
      ["pm", "developer", "client", "orgAdmin", "editor"]
    ],
    [
      "the content",
      change({ content: true }),
      ["pm", "developer", "client", "editor"]
    ],
    ["the status", change({ status: true }), ["pm", "developer", "client"]],
    [
      "the assignees",
      change({ assignees: true }),
      ["pm", "developer", "client"]
    ],
    [
      "the content and the status",
      change({ content: true, status: true }),
      ["pm", "developer", "client"]
    ]
  ])("who may change %s", (_, subject, expected) => {
    expect(
      allowed((candidate) => TicketPolicy.canChange(candidate, subject))
    ).toStrictEqual(expected)
  })
})

const fields = (status: string, assignees: ReadonlyArray<string> = []) => ({
  status,
  assignees
})

const split = (overrides: Partial<TicketPolicy.Split>) => ({
  source: fields("in_progress", ["dev-1"]),
  retained: fields("in_progress", ["dev-1"]),
  created: [fields("todo")],
  defaultStatus: "todo",
  ...overrides
})

const editors: ReadonlyArray<ActorName> = [
  "pm",
  "developer",
  "client",
  "editor"
]
const changers: ReadonlyArray<ActorName> = ["pm", "developer", "client"]

describe("TicketPolicy.canSplit", () => {
  it.each<readonly [string, TicketPolicy.Split, ReadonlyArray<ActorName>]>([
    ["new pieces on the default status", split({}), editors],
    [
      "new pieces copying the original's status",
      split({ created: [fields("in_progress")] }),
      editors
    ],
    [
      "new pieces copying the original's assignees",
      split({ created: [fields("todo", ["dev-1"])] }),
      editors
    ],
    [
      "a new piece on another status",
      split({ created: [fields("review")] }),
      changers
    ],
    [
      "a new piece with a new assignee",
      split({ created: [fields("todo", ["dev-2"])] }),
      changers
    ],
    [
      "keeping the original on another status",
      split({ retained: fields("done", ["dev-1"]) }),
      changers
    ],
    [
      "dropping the original's assignee",
      split({ retained: fields("in_progress") }),
      changers
    ]
  ])("who may split with %s", (_, subject, expected) => {
    expect(
      allowed((candidate) => TicketPolicy.canSplit(candidate, subject))
    ).toStrictEqual(expected)
  })
})

describe("TicketPolicy.canQuery", () => {
  it.each<readonly [string, TicketPolicy.Query, ReadonlyArray<ActorName>]>([
    [
      "no GitHub filter",
      {},
      ["pm", "developer", "client", "orgAdmin", "editor"]
    ],
    ["hasBranch", { hasBranch: true }, ["pm", "developer", "orgAdmin"]],
    ["hasPr", { hasPr: false }, ["pm", "developer", "orgAdmin"]]
  ])("who may filter by %s", (_, query, expected) => {
    expect(
      allowed((candidate) => TicketPolicy.canQuery(candidate, query))
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

describe("GroupPolicy.can", () => {
  it.each<
    readonly [GroupPolicy.Kind, GroupPolicy.Action, ReadonlyArray<ActorName>]
  >([
    ["sprint", "manage", ["pm"]],
    ["sprint", "add_ticket", ["pm", "developer", "client"]],
    ["sprint", "remove_ticket", ["pm"]],
    ["sprint", "reorder", ["pm", "developer", "client"]],
    ["milestone", "manage", ["pm"]],
    ["milestone", "remove_ticket", ["pm"]],
    ["epic", "manage", ["pm", "developer"]],
    ["epic", "remove_ticket", ["pm", "developer"]],
    ["other", "reorder", ["pm", "developer"]]
  ])("%s %s", (kind, action, expected) => {
    expect(
      allowed((candidate) => GroupPolicy.can(candidate, kind, action))
    ).toStrictEqual(expected)
  })
})

describe("GroupPolicy.ticketActions", () => {
  it.each<
    readonly [
      ReadonlyArray<string>,
      ReadonlyArray<string>,
      ReadonlyArray<GroupPolicy.Action>
    ]
  >([
    [["T-1", "T-2"], ["T-1", "T-2"], []],
    [["T-1"], ["T-1", "T-2"], ["add_ticket"]],
    [["T-1", "T-2"], ["T-1"], ["remove_ticket"]],
    [["T-1", "T-2"], ["T-2", "T-1"], ["reorder"]],
    [
      ["T-1", "T-2"],
      ["T-3", "T-2"],
      ["add_ticket", "remove_ticket"]
    ],
    [
      ["T-1", "T-2", "T-3"],
      ["T-3", "T-1", "T-4"],
      ["add_ticket", "remove_ticket", "reorder"]
    ]
  ])("%j to %j takes %j", (current, next, expected) => {
    expect(GroupPolicy.ticketActions(current, next)).toStrictEqual(expected)
  })
})

describe("GroupPolicy.canChangeTickets", () => {
  it.each<
    readonly [string, GroupPolicy.TicketsChange, ReadonlyArray<ActorName>]
  >([
    [
      "adding a ticket",
      { current: ["T-1"], next: ["T-1", "T-2"], evicts: false },
      ["pm", "developer", "client"]
    ],
    [
      "adding a ticket from another active sprint",
      { current: ["T-1"], next: ["T-1", "T-2"], evicts: true },
      ["pm"]
    ],
    [
      "reordering",
      { current: ["T-1", "T-2"], next: ["T-2", "T-1"], evicts: false },
      ["pm", "developer", "client"]
    ],
    [
      "taking a ticket out",
      { current: ["T-1", "T-2"], next: ["T-1"], evicts: false },
      ["pm"]
    ]
  ])("who may change a sprint by %s", (_, subject, expected) => {
    expect(
      allowed((candidate) =>
        GroupPolicy.canChangeTickets(candidate, "sprint", subject)
      )
    ).toStrictEqual(expected)
  })
})

describe("ProjectPolicy.canUpdate", () => {
  it.each<readonly [string, ProjectPolicy.Update, ReadonlyArray<ActorName>]>([
    ["the About doc", { body: true, settings: false }, ["pm", "developer"]],
    ["its settings", { body: false, settings: true }, ["pm"]],
    ["both", { body: true, settings: true }, ["pm"]]
  ])("who may update %s", (_, update, expected) => {
    expect(
      allowed((candidate) => ProjectPolicy.canUpdate(candidate, update))
    ).toStrictEqual(expected)
  })
})
