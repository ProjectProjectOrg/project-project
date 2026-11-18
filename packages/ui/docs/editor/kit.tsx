import {
  EMPTY_LAYER,
  resolveLibrary,
  TicketId,
  type Member,
  type MentionType
} from "@pp/shared"
import type { EditorBlocks } from "@pp/ui/editor/blocks/editor-blocks"
import type { AttachmentsTarget } from "@pp/ui/editor/editor-transformers"
import type {
  MentionCandidate,
  MentionProvider
} from "@pp/ui/editor/mentions/registry"
import { MentionScopeProvider } from "@pp/ui/editor/mentions/scope"
import { provideEditorMessages } from "@pp/ui/editor/messages"
import {
  EditorServicesProvider,
  type EditorServices,
  type UploadAttachment
} from "@pp/ui/editor/services"
import { CircleDot } from "@pp/ui/icons"
import { MemberAvatar } from "@pp/ui/member-avatar"
import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { useMemo, type ReactNode } from "react"

import { editorMessages } from "./messages"

/*
 * The gallery's stand-in for the app around the editor: English messages
 * and sample data behind EditorServices (people, tickets, a Figma frame,
 * uploads that read the file locally). Every Editor page wraps its demos
 * in <EditorKit>.
 */

provideEditorMessages(editorMessages)

const ticketId = Schema.decodeSync(TicketId)

const member = (id: string, name: string, role: "owner" | "member") =>
  ({
    id,
    username: id,
    name,
    email: `${id}@atlas.dev`,
    image: null,
    role
  }) as unknown as Member

export const MEMBERS: ReadonlyArray<Member> = [
  member("maya", "Maya Chen", "owner"),
  member("jonas", "Jonas Berg", "member"),
  member("ines", "Inès Duval", "member"),
  member("sam", "Sam Okafor", "member")
]

export const TICKETS: ReadonlyArray<
  Readonly<{ id: string; title: string; epic?: string }>
> = [
  {
    id: "ATL-5",
    title: "Sign-in redirect loses the page you were on",
    epic: "Accounts"
  },
  {
    id: "ATL-8",
    title: "Remember the last workspace per device",
    epic: "Accounts"
  },
  { id: "ATL-12", title: "Offline drafts for comments" },
  { id: "ATL-14", title: "Push notifications for mentions" },
  {
    id: "ATL-21",
    title: "Onboarding: three screens instead of five",
    epic: "Onboarding"
  }
]

// The sample ticket the demos' editors belong to (attachments, Figma).
export const SAMPLE_TARGET: AttachmentsTarget = {
  orgSlug: "demo",
  slug: "atlas",
  ticketId: ticketId("ATL-5"),
  uploadsEnabled: true
}

export const FIGMA_URL =
  "https://www.figma.com/design/AbC123xyzQ7/Mobile-app?node-id=12-34"
// The same frame as a chip in the text (a rich embed is Figma's own live
// iframe, which needs a real file).
export const FIGMA_CHIP_URL = `${FIGMA_URL}&pp-density=compact`

// Sample attachments, served by the gallery from public/api/attachments.
export const IMAGE_URL = "/api/attachments/demo/01JBX7Q2K9ZWCVE8MTQ4RXPGHN"
export const VIDEO_URL = "/api/attachments/demo/01JBX7Q2KAZWCVE8MTQ4RXPGHP"
export const ZIP_URL = "/api/attachments/demo/01JBX7Q2KBZWCVE8MTQ4RXPGHQ"

const people: MentionProvider = {
  type: "user",
  heading: () => "People",
  failed: () => "Couldn't load people",
  renderRow: (candidate) => (
    <div className="flex min-w-0 items-center gap-2">
      <MemberAvatar
        member={{
          id: candidate.id,
          name: candidate.label,
          email: candidate.secondary ?? null,
          image: null
        }}
        size={20}
      />
      <span className="truncate font-semibold">{candidate.label}</span>
      {candidate.secondary ? (
        <span className="truncate text-caption text-muted-foreground">
          {candidate.secondary}
        </span>
      ) : null}
    </div>
  )
}

const tickets: MentionProvider = {
  type: "ticket",
  heading: () => "Tickets",
  failed: () => "Couldn't load tickets",
  renderRow: (candidate) => (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="min-w-(--row-key-width) shrink-0 whitespace-nowrap tabular-nums">
        {candidate.id}
      </span>
      <span className="truncate text-muted-foreground">
        {candidate.secondary ? `${candidate.secondary} › ` : null}
        {candidate.label}
      </span>
    </div>
  )
}

const matches = (query: string, ...fields: ReadonlyArray<string | undefined>) =>
  fields.some((field) => field?.toLowerCase().includes(query.toLowerCase()))

const search = (
  type: MentionType,
  query: string | null
): ReadonlyArray<MentionCandidate> => {
  if (query === null) return []
  if (type === "user")
    return MEMBERS.filter((entry) =>
      matches(query, entry.name, entry.email)
    ).map((entry) => ({
      id: entry.id,
      label: entry.name,
      secondary: entry.email
    }))
  return TICKETS.filter((ticket) =>
    matches(query, ticket.id, ticket.title)
  ).map((ticket) => ({
    id: ticket.id,
    label: ticket.title,
    secondary: ticket.epic
  }))
}

// "Uploads" a file by reading it locally, with a little made-up progress.
const uploadLocally: UploadAttachment = ({ file, signal, onProgress }) =>
  new Promise((resolve) => {
    let fraction = 0
    const timer = window.setInterval(() => {
      fraction = Math.min(1, fraction + 0.08)
      onProgress(fraction)
      if (fraction < 1) return
      window.clearInterval(timer)
      resolve(Exit.succeed({ url: URL.createObjectURL(file) }))
    }, 120)
    signal.addEventListener("abort", () => window.clearInterval(timer))
  })

const FIGMA_LINKS = [
  {
    fileKey: "AbC123xyzQ7",
    nodeId: "12:34",
    name: "Onboarding, three screens",
    fileName: "Mobile app",
    thumbnailUrl: "/samples/figma-onboarding.png",
    lastModified: DateTime.makeUnsafe("2026-11-12T10:00:00Z")
  }
]

const LINK_TITLES: Readonly<Record<string, string>> = {
  "https://lexical.dev/": "Lexical, an extensible text editor framework",
  "https://commonmark.org/": "CommonMark: a strongly defined Markdown spec"
}

const useSampleMentionSearch: EditorServices["useMentionSearch"] = (query) =>
  useMemo(
    () => ({
      people: {
        provider: people,
        results: { items: search("user", query), status: "ready" as const }
      },
      tickets: {
        provider: tickets,
        results: { items: search("ticket", query), status: "ready" as const }
      }
    }),
    [query]
  )

export const SAMPLE_SERVICES: EditorServices = {
  navigate: () => undefined,
  useMentionSearch: useSampleMentionSearch,
  mentionHref: {
    user: () => "#people",
    ticket: (_scope, id) => `#${id}`
  },
  // Like the app's ticket preview: the title, its status and priority, and
  // the start of its description.
  renderTicketPreview: (id) => {
    const ticket = TICKETS.find((candidate) => candidate.id === id)
    return (
      <div className="flex flex-col gap-2">
        <span className="line-clamp-2 text-body leading-snug font-semibold">
          {ticket?.title ?? "Unknown ticket"}
        </span>
        <span className="flex items-center gap-3.5 text-caption text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CircleDot
              className="size-3.5 text-state-info"
              strokeWidth={1.75}
            />
            In progress
          </span>
          {ticket?.epic ? <span>{ticket.epic}</span> : null}
        </span>
        <p className="line-clamp-4 text-caption leading-relaxed text-muted-foreground">
          After signing in you land on the dashboard instead of the page you
          opened the link from. Keep the page in the redirect and go back to it.
        </p>
      </div>
    )
  },
  renderCommentPreview: (id, commentId) => (
    <p className="text-caption text-muted-foreground tabular-nums">
      {id} · {commentId}
    </p>
  ),
  useLinkPreview: (url) => ({
    title: LINK_TITLES[url] ?? null,
    favicon: { kind: "fallback", cached: true }
  }),
  useUploadAttachment: () => uploadLocally,
  useFigmaLinks: () => ({ links: FIGMA_LINKS, refresh: () => undefined }),
  openBlockGallery: () => undefined
}

// The built-in block library, as a project without its own blocks sees it.
export const SAMPLE_BLOCKS: EditorBlocks = {
  mode: "ticket",
  library: resolveLibrary({ org: EMPTY_LAYER, project: null }, false),
  ticketType: null,
  canEdit: { org: false, project: false },
  onEditDefinition: () => undefined
}

export function EditorKit({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <EditorServicesProvider services={SAMPLE_SERVICES}>
      <MentionScopeProvider
        scope={{ orgSlug: "demo", slug: "atlas", members: MEMBERS }}
      >
        {children}
      </MentionScopeProvider>
    </EditorServicesProvider>
  )
}
