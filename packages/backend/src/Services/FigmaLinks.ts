import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import { Option, Schema } from "effect"
import {
  AttachmentId,
  Slug,
  type FigmaLinkMetadata,
  type Forbidden,
  type NotFound,
  type StorageConfigMissing,
  type StorageError,
  type StorageNotConnected
} from "@projectproject/shared"

export interface FigmaReferencePlan {
  readonly added: ReadonlyArray<string>
  readonly removed: ReadonlyArray<string>
}

export const planFigmaReferences = (input: {
  readonly existing: ReadonlySet<string>
  readonly referenced: ReadonlySet<string>
}): FigmaReferencePlan => ({
  added: [...input.referenced].filter((key) => !input.existing.has(key)),
  removed: [...input.existing].filter((key) => !input.referenced.has(key))
})

export const DEV_RESOURCE_NAME_MAX = 100

export const devResourceName = (ticketId: string, title: string): string => {
  const prefix = `${ticketId} · `
  const room = DEV_RESOURCE_NAME_MAX - prefix.length
  return `${prefix}${title.slice(0, room)}`
}

export const shouldBacklink = (ref: {
  readonly nodeId: string | null
}): boolean => ref.nodeId !== null

export const FIGMA_THUMBNAIL_URL_PREFIX = "/api/figma-thumbnails"

export const figmaThumbnailUrl = (orgSlug: string, linkId: string): string =>
  `${FIGMA_THUMBNAIL_URL_PREFIX}/${orgSlug}/${linkId}`

export interface FigmaThumbnailRef {
  readonly orgSlug: Slug
  readonly linkId: AttachmentId
}

const FigmaThumbnailRefSchema = Schema.Struct({
  orgSlug: Slug,
  linkId: AttachmentId
})
const decodeFigmaThumbnailRef = Schema.decodeUnknownOption(
  FigmaThumbnailRefSchema
)

export const parseFigmaThumbnailUrl = (
  path: string
): FigmaThumbnailRef | null => {
  if (!path.startsWith(`${FIGMA_THUMBNAIL_URL_PREFIX}/`)) return null
  const rest = path.slice(FIGMA_THUMBNAIL_URL_PREFIX.length + 1)
  const parts = rest.split("/")
  if (parts.length !== 2) return null
  const [orgSlug, linkId] = parts
  return Option.getOrNull(decodeFigmaThumbnailRef({ orgSlug, linkId }))
}

export interface FigmaLinksShape {
  readonly reconcileTicket: (
    orgSlug: string,
    slug: string,
    ticketId: string,
    title: string,
    body: string
  ) => Effect.Effect<void>
  readonly listForTicket: (
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: string
  ) => Effect.Effect<ReadonlyArray<FigmaLinkMetadata>, NotFound | Forbidden>
  readonly resolveThumbnailUrl: (
    orgSlug: string,
    userId: string,
    linkId: string
  ) => Effect.Effect<
    string,
    | NotFound
    | Forbidden
    | StorageNotConnected
    | StorageConfigMissing
    | StorageError
  >
}

export class FigmaLinks extends Context.Service<FigmaLinks, FigmaLinksShape>()(
  "@projectproject/backend/Services/FigmaLinks"
) {}
