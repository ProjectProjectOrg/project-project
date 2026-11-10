import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { Flag, Link2, X } from "lucide-react"
import { Fragment, useContext } from "react"

import { fireMutation } from "@/api/viewMutation"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketDetail,
  ticketRequest,
  unmarkTicket
} from "@/features/tickets/atoms/ticketDetail"
import { useOpenTicketPage } from "@/features/tickets/components/ticket-menu/useOpenTicketPage"
import { removableRelations } from "@/features/tickets/lib/relationGroups"
import { m } from "@/paraglide/messages"

import { MARK_KINDS } from "./markKinds"

export function MarkAsSubmenu({ ticketId }: Readonly<{ ticketId: TicketId }>) {
  const openPage = useOpenTicketPage(ticketId)
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Flag className="size-4" strokeWidth={1.75} />
        {m.tickets_mark_as()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {MARK_KINDS.map(({ kind, icon: Icon, label }) => (
          <Fragment key={kind}>
            {kind === "duplicateOf" && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={() => openPage(`mark:${kind}`)}
              className="cursor-pointer"
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {label()}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export function RelationsSubmenu({
  ticketId
}: Readonly<{ ticketId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketRequest(orgSlug, slug, ticketId)
  const detail = useAtomValue(ticketDetail(req))
  const registry = useContext(RegistryContext)
  if (!Result.isSuccess(detail)) return null
  const marks = removableRelations(detail.value.relations)
  if (marks.length === 0) return null
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Link2 className="size-4" strokeWidth={1.75} />
        {m.tickets_menu_relations()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-96">
        {marks.map(({ kind, linked }) => {
          const mark = MARK_KINDS.find((entry) => entry.kind === kind)
          const Icon = mark?.icon ?? Flag
          return (
            <DropdownMenuItem
              key={`${kind}:${linked.id}`}
              closeOnClick={false}
              aria-label={m.tickets_relations_remove_aria_label({
                title: linked.title
              })}
              onClick={() =>
                void fireMutation(registry, unmarkTicket(req), {
                  kind,
                  target: linked.id
                })
              }
              className="group cursor-pointer"
            >
              <Icon
                className="size-4 text-muted-foreground"
                strokeWidth={1.75}
              />
              <span className="shrink-0 text-muted-foreground">
                {mark?.label()}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {linked.id}
              </span>
              <span className="min-w-0 flex-1 truncate">{linked.title}</span>
              <X
                className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-data-[highlighted]:opacity-100"
                strokeWidth={1.75}
              />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
