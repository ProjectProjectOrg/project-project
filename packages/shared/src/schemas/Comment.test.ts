import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  Comment,
  CommentAuthor,
  CreateCommentInput,
  UpdateCommentInput
} from "./Comment"

const user = {
  id: "user-1",
  email: "user@example.com",
  name: "User One",
  username: "user-one",
  image: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  activeOrgSlug: "org",
  personalGithub: { connected: false },
  editorPreference: "github",
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
} as const

describe("CommentAuthor", () => {
  it("decodes linked ProjectProject users", () => {
    const author = Schema.decodeSync(CommentAuthor)({
      kind: "user",
      user
    })

    expect(author.kind).toBe("user")
    if (author.kind === "user") expect(author.user.id).toBe("user-1")
  })

  it("decodes Jira author snapshots", () => {
    expect(
      Schema.decodeSync(CommentAuthor)({
        kind: "jira",
        displayName: "Former Jira User",
        accountId: "jira-account-1"
      })
    ).toEqual({
      kind: "jira",
      displayName: "Former Jira User",
      accountId: "jira-account-1"
    })
  })

  it("rejects incomplete Jira author snapshots", () => {
    expect(() =>
      Schema.decodeUnknownSync(CommentAuthor)({
        kind: "jira",
        displayName: "Former Jira User"
      })
    ).toThrow()
  })
})

describe("Comment", () => {
  it("keeps provenance independent from linked identity", () => {
    const comment = Schema.decodeSync(Comment)({
      id: "c_imported",
      ticketId: "T-1",
      projectSlug: "project",
      author: { kind: "user", user },
      origin: "jira",
      body: "Imported body",
      createdAt: "2024-02-01T10:00:00.000Z",
      editedAt: null
    })

    expect(comment.origin).toBe("jira")
    expect(comment.author.kind).toBe("user")
  })

  it("rejects Jira author snapshots on native comments", () => {
    expect(() =>
      Schema.decodeUnknownSync(Comment)({
        id: "c_invalid",
        ticketId: "T-1",
        projectSlug: "project",
        author: {
          kind: "jira",
          displayName: "Former Jira User",
          accountId: "jira-account-1"
        },
        origin: "native",
        body: "Invalid attribution",
        createdAt: "2026-05-07T10:00:00.000Z",
        editedAt: null
      })
    ).toThrow()
  })
})

describe("native comment inputs", () => {
  it.each([CreateCommentInput, UpdateCommentInput])(
    "retains the 1 to 20,000 character limit",
    (schema) => {
      expect(() => Schema.decodeSync(schema)({ body: "" })).toThrow()
      expect(
        Schema.decodeSync(schema)({ body: "x".repeat(20_000) }).body
      ).toHaveLength(20_000)
      expect(() =>
        Schema.decodeSync(schema)({ body: "x".repeat(20_001) })
      ).toThrow()
    }
  )
})
