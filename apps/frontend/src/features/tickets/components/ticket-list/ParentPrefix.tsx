import { isEpic } from "@pp/shared"
import type { TicketParent } from "@pp/shared"
import { ListRowCrumbs } from "@pp/ui/list-row-crumbs"
import { TextLink } from "@pp/ui/text-link"
import { TicketKey } from "@pp/ui/ticket-key"
import { Link } from "@tanstack/react-router"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  TicketPreview,
  TicketPreviewTrigger
} from "@/features/tickets/components/ticket-preview/TicketPreview"

import { EpicLink } from "./EpicLabel"

// A row's parent in front of its title: its title, or its key when the row
// is tight (ListRowCrumbs folds it). Both open the parent's preview on
// hover and the parent on click.
export function ParentPrefix({ parent }: Readonly<{ parent: TicketParent }>) {
  const { orgSlug, slug } = useProjectRoute()
  const preview = TicketPreview.ticket({ id: parent.id })
  const full = isEpic(parent) ? (
    <TicketPreviewTrigger
      preview={preview}
      render={<span className="flex min-w-0 shrink-0" />}
    >
      <EpicLink
        orgSlug={orgSlug}
        slug={slug}
        parent={parent}
        className="text-body"
      />
    </TicketPreviewTrigger>
  ) : (
    <TicketPreviewTrigger
      preview={preview}
      render={
        <TextLink
          className="max-w-[24ch] shrink-0 truncate"
          render={
            <Link
              to="/orgs/$orgSlug/projects/$slug/tickets/$id"
              params={{ orgSlug, slug, id: parent.id }}
              preload="intent"
              draggable={false}
            />
          }
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
                  aria-label={`${parent.id} ${parent.title}`}
                  className="flex shrink-0"
                  render={
                    <Link
                      to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                      params={{ orgSlug, slug, id: parent.id }}
                      preload="intent"
                      draggable={false}
                    />
                  }
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
