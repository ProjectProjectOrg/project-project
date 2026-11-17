import { describe, expect, it } from "vitest"

import { parseCommentsRegion } from "../comments/comments-region"
import { parseMarkdownFile } from "../markdown/fileContent"
import {
  rewriteImportedChange,
  transformImportedFile,
  type ImportMapping
} from "./importTransform"

const mapping: ImportMapping = {
  types: new Map(),
  fromSlug: "source",
  toSlug: "destination",
  fromKey: "T",
  toKey: "PP",
  orgSlug: "igne",
  users: new Map([["old-ada", "new-ada"]]),
  people: new Map([["old-bob", { name: "Bob" }]]),
  attachments: new Map([
    ["01K00000000000000000000001", "01K00000000000000000000009"]
  ]),
  newCommentId: (sourceId) => `${sourceId}_new`
}

const identity = { slug: "pp", name: "PP", formerKeys: ["T"] }

const ticket = [
  "---",
  "id: T-12",
  "parent: T-3",
  "blockedBy: [T-2]",
  "relatedTo: [T-8]",
  "duplicateOf: T-10",
  "assignees: [old-ada, old-bob]",
  "createdBy: old-ada",
  "---",
  "",
  "See [T-4](mention:ticket/T-4), ask [Ada](mention:user/old-ada) or [Bob](mention:user/old-bob). Plain T-4 stays.",
  "",
  "![shot](/api/attachments/missler/01K00000000000000000000001)",
  "",
  "<!-- comments:start -->",
  "<!-- comment:c_a -->",
  "---",
  "author:",
  "  kind: user",
  "  userId: old-bob",
  "origin: native",
  "createdAt: 2026-01-01T00:00:00.000Z",
  "---",
  "Done in [T-5](mention:ticket/T-5).",
  "<!-- comments:end -->",
  ""
].join("\n")

const imported = transformImportedFile(mapping, identity, {
  path: "tickets/T-12.md",
  content: ticket
})
const parsed = parseMarkdownFile(imported.content)

describe("transformImportedFile", () => {
  it("moves a ticket to the new key in its path, frontmatter and structured mentions, leaving plain text", () => {
    expect(imported.path).toBe("tickets/PP-12.md")
    expect(parsed.data).toMatchObject({
      id: "PP-12",
      parent: "PP-3",
      blockedBy: ["PP-2"],
      relatedTo: ["PP-8"],
      duplicateOf: "PP-10"
    })
    expect(parsed.content).toContain("[PP-4](mention:ticket/PP-4)")
    expect(parsed.content).toContain("Plain T-4 stays.")
    expect(parsed.content).toContain("(mention:ticket/PP-5)")
  })

  it("points linked people at their new account and keeps unlinked people as imported authors", () => {
    expect(parsed.data).toMatchObject({
      assignees: ["new-ada"],
      createdBy: "new-ada"
    })
    expect(parsed.content).toContain("(mention:user/new-ada)")
    expect(parsed.content).toContain("(mention:user/old-bob)")
    const [comment] = parseCommentsRegion(parsed.content)
    expect(comment).toMatchObject({
      id: "c_a_new",
      origin: "projectproject",
      author: {
        kind: "imported",
        displayName: "Bob",
        source: "projectproject",
        sourceId: "old-bob"
      }
    })
  })

  it("rewrites attachment links to the new attachment in this org", () => {
    expect(parsed.content).toContain(
      "/api/attachments/igne/01K00000000000000000000009"
    )
  })

  it("renames ticket ids in group ticket lists", () => {
    const group = transformImportedFile(mapping, identity, {
      path: "groups/G-1.md",
      content:
        "---\nid: G-1\ntickets: [T-1, T-2]\nsnapshot:\n  - id: T-1\n    status: done\n    estimate: 5\n---\n"
    })
    expect(parseMarkdownFile(group.content).data.tickets).toEqual([
      "PP-1",
      "PP-2"
    ])
    expect(parseMarkdownFile(group.content).data.snapshot).toEqual([
      { id: "PP-1", status: "done", estimate: 5 }
    ])
  })

  it("gives project.md the destination org, slug, name, key and former keys", () => {
    const project = transformImportedFile(mapping, identity, {
      path: "project.md",
      content:
        "---\norg: missler\nslug: project-project\nname: Old\nkey: T\n---\nBody\n"
    })
    expect(parseMarkdownFile(project.content).data).toMatchObject({
      org: "igne",
      slug: "pp",
      name: "PP",
      key: "PP",
      formerKeys: ["T"]
    })
  })
})

it("keeps comment replies and structured comment links connected after an import", () => {
  const thread = transformImportedFile(mapping, identity, {
    path: "tickets/T-12.md",
    content: ticket
      .replace(
        "Done in [T-5](mention:ticket/T-5).",
        "See [T-12](mention:comment/T-12/c_a). Reply [T-12](mention:ticket/source/T-12)."
      )
      .replace("origin: native", "replyTo: c_parent\norigin: native")
  })
  const [comment] = parseCommentsRegion(
    parseMarkdownFile(thread.content).content
  )
  expect(comment.replyTo).toBe("c_parent_new")
  expect(comment.body).toContain("[PP-12](mention:comment/PP-12/c_a_new)")
  expect(comment.body).toContain("[PP-12](mention:ticket/destination/PP-12)")
})

it("rewrites activity references to renamed tickets and custom types", () => {
  const typedMapping = {
    ...mapping,
    types: new Map([["incident", "incident2"]])
  }
  expect(
    rewriteImportedChange(typedMapping, {
      kind: "type_changed",
      from: null,
      to: "incident"
    })
  ).toEqual({ kind: "type_changed", from: null, to: "incident2" })
  expect(
    rewriteImportedChange(typedMapping, {
      kind: "relation_added",
      relation: "blockedBy",
      ticket: "T-3"
    })
  ).toEqual({ kind: "relation_added", relation: "blockedBy", ticket: "PP-3" })
})
