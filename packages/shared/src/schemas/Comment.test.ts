import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  Comment,
  CommentAuthor,
  CreateCommentInput,
  UpdateCommentInput
} from "./Comment"

const decodeCommentAuthorSync = Schema.decodeSync(CommentAuthor)

const decodeUnknownCommentAuthorSync = Schema.decodeUnknownSync(CommentAuthor)

const decodeCommentSync = Schema.decodeSync(Comment)

const decodeUnknownCommentSync = Schema.decodeUnknownSync(Comment)

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
    const author = decodeCommentAuthorSync({
      kind: "user",
      user
    })

    expect(author.kind).toBe("user")
    if (author.kind === "user") expect(author.user.id).toBe("user-1")
  })

  it("decodes Jira author snapshots", () => {
    expect(
      decodeCommentAuthorSync({
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
      decodeUnknownCommentAuthorSync({
        kind: "jira",
        displayName: "Former Jira User"
      })
    ).toThrow()
  })
})

describe("Comment", () => {
  it("keeps provenance independent from linked identity", () => {
    const comment = decodeCommentSync({
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
      decodeUnknownCommentSync({
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
  it.each([
    Schema.decodeSync(CreateCommentInput),
    Schema.decodeSync(UpdateCommentInput)
  ])("retains the 1 to 20,000 character limit", (decode) => {
    expect(() => decode({ body: "" })).toThrow()
    expect(decode({ body: "x".repeat(20_000) }).body).toHaveLength(20_000)
    expect(() => decode({ body: "x".repeat(20_001) })).toThrow()
  })
})
