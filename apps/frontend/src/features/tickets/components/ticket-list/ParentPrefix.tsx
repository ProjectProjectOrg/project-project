import { isEpic } from "@pp/shared"
import type { TicketParent } from "@pp/shared"
import { ListRowCrumbs } from "@pp/ui/list-row-crumbs"
import { TextLink } from "@pp/ui/text-link"
import { TicketKey } from "@pp/ui/ticket-key"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TicketPreviewTrigger } from "@/features/tickets/components/ticket-preview/TicketPreview"
import { ticketHref } from "@/features/tickets/lib/ticketHref"
import { TicketPreview } from "@/features/tickets/lib/ticketPreview"

import { EpicLink } from "./EpicLabel"

// A row's parent in front of its title: its title, or its key when the row
// is tight (ListRowCrumbs folds it). Both open the parent's preview on
// hover and the parent on click.
export function ParentPrefix({ parent }: Readonly<{ parent: TicketParent }>) {
  const { orgSlug, slug } = useProjectRoute()
  const preview = TicketPreview.ticket({ id: parent.id })
  const href = ticketHref(orgSlug, slug, parent.id, undefined)
  const full = isEpic(parent) ? (
    <TicketPreviewTrigger
      preview={preview}
      render={<span className="flex min-w-0 shrink-0" />}
    >
      <EpicLink href={href} parent={parent} className="text-body" />
    </TicketPreviewTrigger>
  ) : (
    <TicketPreviewTrigger
      preview={preview}
      render={
        <TextLink
          href={href}
          draggable={false}
          className="max-w-[24ch] shrink-0 truncate"
        />
      }
    >
      {parent.title}
    </TicketPreviewTrigger>
  )
  return (
    <ListRowCrumbs
      crumbs={[
        {
          id: parent.id,
          full,
          short: (
            <TicketPreviewTrigger
              preview={preview}
              render={
                <TextLink
                  href={href}
                  draggable={false}
                  aria-label={`${parent.id} ${parent.title}`}
                  className="flex shrink-0"
                />
              }
            >
              <TicketKey value={parent.id} />
            </TicketPreviewTrigger>
          )
        }
      ]}
    />
  )
}
