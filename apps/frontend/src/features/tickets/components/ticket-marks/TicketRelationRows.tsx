import { useAtomSet } from "@effect/atom-react"
import type {
  LinkedTicket,
  MarkKind,
  Member,
  TicketId,
  TicketRelations
} from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { Unlink, X } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketRequest,
  unmarkTicket
} from "@/features/tickets/atoms/ticketDetail"
import { MetaRow } from "@/features/tickets/components/ticket-page/MetaRow"
import { TicketHoverCard } from "@/features/tickets/components/TicketHoverCard"
import {
  relationGroups,
  type RelationGroupKey
} from "@/features/tickets/lib/relationGroups"
import { useContextMenu } from "@/hooks/useContextMenu"
import { m } from "@/paraglide/messages"

import { TicketStatusIcon } from "./TicketStatusIcon"

const GROUP_LABELS: Readonly<Record<RelationGroupKey, () => string>> = {
  blockedBy: m.tickets_relations_blocked_by,
  blocking: m.tickets_relations_blocking,
  related: m.tickets_relations_related,
  duplicateOf: m.tickets_relations_duplicate_of,
  duplicates: m.tickets_relations_duplicates
}

const REMOVE_LABELS: Readonly<Record<MarkKind, () => string>> = {
  blockedBy: m.tickets_relations_remove_blocked_by,
  blocking: m.tickets_relations_remove_blocking,
  related: m.tickets_relations_remove_related
}

export function TicketRelationRows({
  ticketId,
  relations,
  members,
  editable
}: Readonly<{
  ticketId: TicketId
  relations: TicketRelations
  members: ReadonlyArray<Member>
  editable: boolean
}>) {
  return relationGroups(relations)
    .filter((group) => group.tickets.length > 0)
    .map((group) => (
      <MetaRow controls key={group.key} label={GROUP_LABELS[group.key]()}>
        <div className="flex flex-col items-start">
          {group.tickets.map((linked) => (
            <RelationEntry
              key={linked.id}
              ticketId={ticketId}
              linked={linked}
              unmark={editable ? group.unmark : null}
              members={members}
            />
          ))}
        </div>
      </MetaRow>
    ))
}

function RelationEntry({
  ticketId,
  linked,
  unmark,
  members
}: Readonly<{
  ticketId: TicketId
  linked: LinkedTicket
  unmark: MarkKind | null
  members: ReadonlyArray<Member>
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const remove = useAtomSet(
    unmarkTicket(ticketRequest(orgSlug, slug, ticketId))
  )
  const entry = useRef<HTMLDivElement>(null)
  const menu = useContextMenu(entry, unmark !== null)
  const [preview, setPreview] = useState(false)
  const unlink = () => {
    if (unmark !== null) remove({ kind: unmark, target: linked.id })
  }

  return (
    <div
      ref={entry}
      className="group/reveal relative flex max-w-full min-w-0 items-center"
    >
      <Popover open={preview} onOpenChange={setPreview}>
        <PopoverTrigger
          openOnHover
          delay={550}
          nativeButton={false}
          render={
            <Button
              render={
                <Link
                  to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                  params={{ orgSlug, slug, id: linked.id }}
                  preload="intent"
                />
              }
              variant="chip"
              className="max-w-full min-w-0 pr-7"
            />
          }
        >
          <TicketStatusIcon
            status={linked.status}
            orgSlug={orgSlug}
            slug={slug}
          />
          <span
            className={
              linked.archivedAt === null
                ? "max-w-[22ch] truncate"
                : "max-w-[22ch] truncate text-muted-foreground"
            }
          >
            {linked.title}
          </span>
        </PopoverTrigger>
        {preview && (
          <TicketHoverCard
            ticketId={linked.id}
            scope={{ orgSlug, slug, members }}
            anchor={entry}
            interactive={false}
          />
        )}
      </Popover>
      {unmark !== null && (
        <>
          <Button
            type="button"
            variant="quiet"
            size="square-7"
            aria-label={m.tickets_relations_remove_aria_label({
              title: linked.title
            })}
            onClick={unlink}
            className="absolute right-0 size-6 opacity-0 transition-opacity group-hover/reveal:opacity-100 focus-visible:opacity-100"
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </Button>
          <DropdownMenu open={menu.open} onOpenChange={menu.onOpenChange}>
            <DropdownMenuContent
              anchor={menu.anchor ?? entry}
              align="start"
              className="w-48"
            >
              <DropdownMenuItem onClick={unlink} className="cursor-pointer">
                <Unlink className="size-4" strokeWidth={1.75} />
                {REMOVE_LABELS[unmark]()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  )
}
