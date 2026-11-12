import { isEpic } from "@pp/shared"
import type { TicketParent } from "@pp/shared"
import { Link } from "@tanstack/react-router"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TicketPreviewTrigger } from "@/features/tickets/components/ticket-preview/TicketPreview"

import { EpicLink, EpicSeparator } from "./EpicLabel"

export function ParentPrefix({ parent }: Readonly<{ parent: TicketParent }>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <>
      {isEpic(parent) ? (
        <TicketPreviewTrigger
          preview={{ kind: "ticket", id: parent.id }}
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
          preview={{ kind: "ticket", id: parent.id }}
          render={
            <Link
              to="/orgs/$orgSlug/projects/$slug/tickets/$id"
              params={{ orgSlug, slug, id: parent.id }}
              preload="intent"
              className="-mx-1.5 -my-1 max-w-[24ch] shrink-0 truncate rounded-md px-1.5 py-1 text-body text-muted-foreground underline-offset-4 transition-colors outline-none hover:text-foreground hover:underline focus-visible:ring-1 focus-visible:ring-ring"
            />
          }
        >
          {parent.title}
        </TicketPreviewTrigger>
      )}
      <EpicSeparator className="shrink-0 text-body" />
    </>
  )
}
