import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { TicketId, TicketParent } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { Flag, Layers, Link2, X, type LucideIcon } from "lucide-react"
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
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
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
  ticketId,
  parent,
  canDetach,
  canUnmark,
  onPatch
}: Readonly<{
  ticketId: TicketId
  parent: TicketParent | null
  canDetach: boolean
  canUnmark: boolean
  onPatch: (patch: TicketEdit) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketRequest(orgSlug, slug, ticketId)
  const detail = useAtomValue(ticketDetail(req))
  const registry = useContext(RegistryContext)
  const detachable = canDetach ? parent : null
  const marks =
    canUnmark && Result.isSuccess(detail)
      ? removableRelations(detail.value.relations)
      : []
  if (detachable === null && marks.length === 0) return null
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Link2 className="size-4" strokeWidth={1.75} />
        {m.tickets_menu_relations()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-96">
        {detachable !== null && (
          <RelationItem
            icon={Layers}
            kind={
              detachable.type === "epic"
                ? m.tickets_menu_relation_epic()
                : m.tickets_menu_relation_parent()
            }
            id={detachable.id}
            title={detachable.title}
            onClick={() => onPatch({ parent: null })}
          />
        )}
        {detachable !== null && marks.length > 0 && <DropdownMenuSeparator />}
        {marks.map(({ kind, linked }) => {
          const mark = MARK_KINDS.find((entry) => entry.kind === kind)
          return (
            <RelationItem
              key={`${kind}:${linked.id}`}
              icon={mark?.icon ?? Flag}
              kind={mark?.label() ?? ""}
              id={linked.id}
              title={linked.title}
              onClick={() =>
                void fireMutation(registry, unmarkTicket(req), {
                  kind,
                  target: linked.id
                })
              }
            />
          )
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function RelationItem({
  icon: Icon,
  kind,
  id,
  title,
  onClick
}: Readonly<{
  icon: LucideIcon
  kind: string
  id: string
  title: string
  onClick: () => void
}>) {
  return (
    <DropdownMenuItem
      closeOnClick={false}
      aria-label={m.tickets_relations_remove_aria_label({ title })}
      onClick={onClick}
      className="group cursor-pointer"
    >
      <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="shrink-0 text-muted-foreground">{kind}</span>
        <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
          {id}
        </span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </span>
      <X
        className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-data-[highlighted]:opacity-100"
        strokeWidth={1.75}
      />
    </DropdownMenuItem>
  )
}
