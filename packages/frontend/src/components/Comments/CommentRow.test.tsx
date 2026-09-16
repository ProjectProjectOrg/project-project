import { cleanup, render, screen } from "@testing-library/react"
import type { Comment, User } from "@projectproject/shared"
import * as DateTime from "effect/DateTime"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { CommentRow } from "./CommentRow"

const state = vi.hoisted(() => ({
  me: null as User | null
}))

vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: string) =>
    atom === "me"
      ? state.me
        ? { _tag: "Success", value: state.me, waiting: false }
        : { _tag: "Initial", waiting: false }
      : { _tag: "Initial", waiting: false },
  useAtomSet: () => vi.fn()
}))

vi.mock("@/atoms/auth", () => ({ meAtom: "me" }))
vi.mock("@/atoms/comments", () => ({
  commentKey: () => "comment-key",
  deleteCommentAtom: () => "delete",
  editCommentAtom: () => "edit"
}))
vi.mock("@/components/MemberAvatar", () => ({
  MemberAvatar: ({ member }: { member: User }) => (
    <span aria-label={`Avatar for ${member.name}`} />
  )
}))
vi.mock("@/components/Markdown", () => ({
  Markdown: ({ children }: { children: string }) => <p>{children}</p>
}))
vi.mock("@/components/ConfirmDeleteIcon", () => ({
  ConfirmDeleteIcon: ({ ariaLabel }: { ariaLabel: string }) => (
    <button aria-label={ariaLabel} />
  )
}))
vi.mock("@/components/LexicalEditor", () => ({
  LexicalEditor: () => null
}))
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  )
}))
vi.mock("@/components/ui/inline-form", () => ({
  InlineForm: {
    Root: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Idle: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Trigger: ({ children }: { children: React.ReactNode }) => (
      <button>{children}</button>
    ),
    Form: () => null,
    Cancel: () => null
  },
  useInlineForm: () => ({
    close: vi.fn(),
    busy: false,
    setBusy: vi.fn()
  })
}))

afterEach(() => {
  cleanup()
  state.me = null
})

const at = (value: string) => DateTime.toDate(DateTime.makeUnsafe(value))

const user: User = {
  id: "user-1",
  email: "user@example.com",
  name: "Linked User",
  username: "linked-user",
  image: null,
  createdAt: at("2026-01-01T00:00:00.000Z"),
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
}

type NativeComment = Extract<Comment, { readonly origin: "native" }>
type JiraComment = Extract<Comment, { readonly origin: "jira" }>

const nativeComment = (
  overrides: Partial<NativeComment> = {}
): NativeComment => ({
  id: "c_comment" as Comment["id"],
  ticketId: "T-1" as Comment["ticketId"],
  projectSlug: "project" as Comment["projectSlug"],
  author: { kind: "user", user },
  origin: "native",
  body: "Comment body",
  createdAt: at("2026-01-02T00:00:00.000Z"),
  editedAt: null,
  ...overrides
})

const jiraComment = (overrides: Partial<JiraComment> = {}): JiraComment => ({
  ...nativeComment(),
  origin: "jira",
  ...overrides
})

const renderRow = (value: Comment) =>
  render(
    <CommentRow
      comment={value}
      orgSlug="org"
      slug="project"
      ticketId={value.ticketId}
    />
  )

describe("CommentRow", () => {
  it("renders Jira snapshot attribution and imported provenance", () => {
    renderRow(
      jiraComment({
        author: {
          kind: "jira",
          displayName: "Former Jira User",
          accountId: "jira-account-1"
        }
      })
    )

    expect(screen.getByText("Former Jira User")).not.toBeNull()
    expect(screen.getByText("Imported from Jira")).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Delete comment" })).toBeNull()
  })

  it("renders linked identity with Jira provenance but no actions", () => {
    state.me = user
    renderRow(jiraComment())

    expect(screen.getByText("Linked User")).not.toBeNull()
    expect(screen.getByLabelText("Avatar for Linked User")).not.toBeNull()
    expect(screen.getByText("Imported from Jira")).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Delete comment" })).toBeNull()
  })

  it("preserves native author actions without imported provenance", () => {
    state.me = user
    renderRow(nativeComment())

    expect(screen.getByRole("button", { name: "Edit" })).not.toBeNull()
    expect(
      screen.getByRole("button", { name: "Delete comment" })
    ).not.toBeNull()
    expect(screen.queryByText("Imported from Jira")).toBeNull()
  })
})
