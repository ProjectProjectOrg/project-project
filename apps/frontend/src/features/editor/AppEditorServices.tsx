import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { isProseQuery } from "@pp/ui/editor/mentions/mention-trigger"
import { useMentionScope } from "@pp/ui/editor/mentions/scope"
import {
  EditorServicesProvider,
  type EditorServices
} from "@pp/ui/editor/services"
import { useRouter } from "@tanstack/react-router"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useMemo, type ReactNode } from "react"

import {
  uploadAttachment,
  uploadAttachmentRequest
} from "@/features/attachments/atoms/attachments"
import { CommentPreviewBody } from "@/features/comments/components/CommentHoverCard"
import {
  figmaTicketLinksAtom,
  figmaTicketLinksRequest
} from "@/features/figma/atoms/figma"
import { useLinkPreview } from "@/features/link-previews/hooks/useLinkPreview"
import { TicketPreviewBody } from "@/features/tickets/components/TicketHoverCard"
import { usePagedSearch } from "@/hooks/usePagedSearch"

import type { SearchableMentionProvider } from "./mentions/searchable"
import { ticketProvider } from "./mentions/ticketProvider"
import { userProvider } from "./mentions/userProvider"

/*
 * The app's side of the editor (@pp/ui/editor): its data and navigation,
 * provided once around every route (RootComponent).
 */

const searchSource = (provider: SearchableMentionProvider) => ({
  key: provider.type,
  search: provider.search,
  deadEnd: (empty: string, query: string) =>
    isProseQuery(empty) && query.startsWith(empty)
})

const MentionSearch: EditorServices["MentionSearch"] = ({
  query,
  children
}) => {
  const scope = useMentionScope()
  const orgSlug = scope?.orgSlug ?? ""
  const slug = scope?.slug ?? ""
  const members = scope?.members
  const involved = scope?.involved
  const people = useMemo(
    () => userProvider({ orgSlug, slug, members, involved }),
    [orgSlug, slug, members, involved]
  )
  const tickets = useMemo(
    () => ticketProvider({ orgSlug, slug }),
    [orgSlug, slug]
  )
  const peopleResults = usePagedSearch(
    useMemo(() => searchSource(people), [people]),
    query
  )
  const ticketResults = usePagedSearch(
    useMemo(() => searchSource(tickets), [tickets]),
    query
  )
  return children({
    people: { provider: people, results: peopleResults },
    tickets: { provider: tickets, results: ticketResults }
  })
}

const AttachmentUpload: EditorServices["AttachmentUpload"] = ({
  target,
  children
}) => {
  const upload = useAtomSet(
    uploadAttachment(
      uploadAttachmentRequest(target.orgSlug, target.slug, target.ticketId)
    ),
    { mode: "promiseExit" }
  )

  return children(upload)
}

const LinkPreview: EditorServices["LinkPreview"] = ({ url, children }) =>
  children(useLinkPreview(url))

const FigmaLinks: EditorServices["FigmaLinks"] = ({ target, children }) => {
  const atom = figmaTicketLinksAtom(
    figmaTicketLinksRequest(target.orgSlug, target.slug, target.ticketId)
  )
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  return children({
    links: AsyncResult.isSuccess(result) ? result.value : null,
    refresh
  })
}

const renderPdf = (url: string) =>
  import("./lexical/pdfSpread").then(({ renderPdfSpread }) =>
    renderPdfSpread(url)
  )

const projectPath = (scope: Readonly<{ orgSlug: string; slug: string }>) =>
  `/orgs/${encodeURIComponent(scope.orgSlug)}/projects/${encodeURIComponent(scope.slug)}`

type RouteParams = Readonly<{ orgSlug?: string; slug?: string }>

export function AppEditorServices({
  children
}: Readonly<{ children: ReactNode }>) {
  const router = useRouter()
  const services = useMemo(
    () =>
      ({
        navigate: (href) => void router.navigate({ href }),
        MentionSearch,
        mentionHref: {
          user: (scope) => `/settings${projectPath(scope)}/team`,
          ticket: (scope, ticketId) =>
            `${projectPath(scope)}/tickets/${encodeURIComponent(ticketId)}`
        },
        renderTicketPreview: (ticketId, scope) => (
          <TicketPreviewBody ticketId={ticketId} scope={scope} interactive />
        ),
        renderCommentPreview: (ticketId, commentId, scope) => (
          <CommentPreviewBody
            ticketId={ticketId}
            commentId={commentId}
            scope={scope}
          />
        ),
        LinkPreview,
        AttachmentUpload,
        FigmaLinks,
        openBlockGallery: () => {
          const params: RouteParams = router.state.matches.at(-1)?.params ?? {}
          if (params.orgSlug === undefined) return
          if (params.slug === undefined)
            void router.navigate({
              to: "/settings/orgs/$orgSlug/types/sections",
              params: { orgSlug: params.orgSlug }
            })
          else
            void router.navigate({
              to: "/settings/orgs/$orgSlug/projects/$slug/types/sections",
              params: { orgSlug: params.orgSlug, slug: params.slug }
            })
        },
        renderPdf
      }) satisfies EditorServices,
    [router]
  )
  return (
    <EditorServicesProvider services={services}>
      {children}
    </EditorServicesProvider>
  )
}
