import { useAtomValue } from "@effect/atom-react"
import { figmaRefKey, type TicketDetail } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { FigmaGlyph, figmaDisplayName } from "@pp/ui/editor/figma/figma-chip"
import { FigmaMetadata } from "@pp/ui/editor/figma/figma-metadata"
import { PaperGlyph } from "@pp/ui/editor/paper/paper-glyph"
import type { TicketTarget } from "@pp/ui/editor/services"
import { ExternalLink } from "@pp/ui/icons"
import * as Data from "effect/Data"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketBodyDraft,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { MetaRow } from "@/features/tickets/components/ticket-page/MetaRow"
import {
  TicketDesignLink,
  extractTicketDesignLinks
} from "@/features/tickets/lib/ticketDesignLinks"
import { m } from "@/paraglide/messages"

function LinkContents({
  glyph,
  name
}: {
  glyph: React.ReactNode
  name: string
}) {
  return (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          {glyph}
        </span>
        <span className="truncate">{name}</span>
      </span>
      <ExternalLink
        className="size-3 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </>
  )
}

function FigmaDesignLink({
  link,
  request
}: {
  link: Data.TaggedEnum.Value<TicketDesignLink, "figma">
  request: TicketTarget
}) {
  return (
    <FigmaMetadata reference={link.reference} target={request}>
      {(metadata) => {
        const name = figmaDisplayName({
          resolved: metadata?.name ?? null,
          label: link.label,
          slug: link.reference.slug
        })
        const resolvedName = name || m.figma_chip_loading()

        return (
          <Button
            variant="ghost"
            className="w-fit max-w-full justify-start"
            size="inline"
            render={
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                title={metadata?.fileName ?? resolvedName}
              />
            }
          >
            <LinkContents
              glyph={<FigmaGlyph className="h-3.5" />}
              name={resolvedName}
            />
          </Button>
        )
      }}
    </FigmaMetadata>
  )
}

function PaperDesignLink({
  link
}: {
  link: Data.TaggedEnum.Value<TicketDesignLink, "paper">
}) {
  const name = link.label.trim() || m.editor_paper_default_name()

  return (
    <Button
      variant="ghost"
      className="w-fit max-w-full justify-start"
      size="inline"
      render={
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer noopener"
          title={name}
        />
      }
    >
      <LinkContents
        glyph={<PaperGlyph className="size-3.5 shrink-0" />}
        name={name}
      />
    </Button>
  )
}

export function TicketDesignLinks({ ticket }: { ticket: TicketDetail }) {
  const { orgSlug, slug } = useProjectRoute()
  const figmaRequest = { orgSlug, slug, ticketId: ticket.id }
  const bodyDraft = useAtomValue(
    ticketBodyDraft(ticketRequest(orgSlug, slug, ticket.id))
  )
  const links = extractTicketDesignLinks(bodyDraft ?? ticket.body)

  if (links.length === 0) return null

  return (
    <MetaRow label={m.tickets_page_meta_designs()}>
      <div className="flex flex-col gap-0.5">
        {links.map(
          TicketDesignLink.$match({
            figma: (link) => (
              <FigmaDesignLink
                key={`figma:${figmaRefKey(link.reference)}`}
                link={link}
                request={figmaRequest}
              />
            ),
            paper: (link) => (
              <PaperDesignLink key={`paper:${link.url}`} link={link} />
            )
          })
        )}
      </div>
    </MetaRow>
  )
}
