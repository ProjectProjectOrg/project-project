import type { FigmaLinkMetadata, TicketId } from "@pp/shared"
import type * as Exit from "effect/Exit"
import { createContext, use, type ReactNode } from "react"

import type { RenderPdfPages } from "../components/attachment-tile"
import type { LinkPreviewView } from "./links/link-favicon"
import type {
  MentionProvider,
  MentionResults,
  MentionScope
} from "./mentions/registry"

/*
 * What the editor needs from the app it runs in: data (mention search,
 * uploads, Figma links, link previews, PDF pages) and navigation. The app
 * provides it once, near its root (EditorServicesProvider); the gallery
 * provides sample data. Members whose names start with `use` are hooks:
 * the editor calls them on every render, so keep them stable.
 */

// Where a ticket's attachments and Figma links live.
export type TicketTarget = Readonly<{
  orgSlug: string
  slug: string
  ticketId: TicketId
}>

export type UploadInput = Readonly<{
  file: File
  signal: AbortSignal
  onProgress: (fraction: number) => void
}>

export type UploadAttachment = (
  input: UploadInput
) => Promise<Exit.Exit<Readonly<{ url: string }>, unknown>>

export type FigmaLinks = Readonly<{
  links: ReadonlyArray<FigmaLinkMetadata> | null
  refresh: () => void
}>

export type MentionGroupSearch = Readonly<{
  provider: MentionProvider
  results: MentionResults
}>

export type EditorServices = Readonly<{
  // Follows an in-app link without a page load.
  navigate: (href: string) => void
  // Mentions: people and tickets matching what follows "@" (null while no
  // menu is open), in the mention scope around the editor.
  useMentionSearch: (query: string | null) => Readonly<{
    people: MentionGroupSearch
    tickets: MentionGroupSearch
  }>
  // Where a mention chip links to.
  mentionHref: Readonly<{
    user: (scope: MentionScope, userId: string) => string
    ticket: (
      scope: Readonly<{ orgSlug: string; slug: string }>,
      ticketId: TicketId
    ) => string
  }>
  // What a ticket mention's hover card shows: its content only; the chip
  // draws the card (HoverCard, 20rem, 12px padding).
  renderTicketPreview: (
    ticketId: TicketId,
    scope: Readonly<{ orgSlug: string; slug: string }>
  ) => ReactNode
  // What a comment mention's hover card shows, content only. The chip links to the ticket's page with the comment id as its #hash.
  renderCommentPreview: (
    ticketId: TicketId,
    commentId: string,
    scope: Readonly<{ orgSlug: string; slug: string }>
  ) => ReactNode
  useLinkPreview: (url: string) => LinkPreviewView
  useUploadAttachment: (target: TicketTarget) => UploadAttachment
  useFigmaLinks: (target: TicketTarget) => FigmaLinks
  // Opens the block library (the slash menu's "Browse blocks").
  openBlockGallery: () => void
  // A PDF's first pages, for its tile (the app's pdf.js).
  renderPdf?: RenderPdfPages
}>

const ServicesContext = createContext<EditorServices | null>(null)

export function EditorServicesProvider({
  services,
  children
}: Readonly<{ services: EditorServices; children: ReactNode }>) {
  return <ServicesContext value={services}>{children}</ServicesContext>
}

export function useEditorServices() {
  const services = use(ServicesContext)
  if (services === null)
    throw new Error("The editor needs an EditorServicesProvider around it.")
  return services
}
