import { Flag, ListPlus } from "lucide-react"

import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import {
  createTicketDialog,
  type RelatedKind
} from "@/features/tickets/atoms/createTicketDialog"
import {
  ticketRequest,
  unmarkTicket
} from "@/features/tickets/atoms/ticketDetail"
import { MARK_KINDS } from "@/features/tickets/components/ticket-marks/markKinds"
import { removableRelations } from "@/features/tickets/lib/relationGroups"
import { m } from "@/paraglide/messages"

import type { TicketPageProps } from "./TicketFieldCommands"

const RELATED_KINDS = [
  "subTicket",
  "blockedBy",
  "blocking",
  "related"
] as const satisfies ReadonlyArray<RelatedKind>

export function TicketCreateRelatedPage({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const markItems = MARK_KINDS.flatMap(({ kind, icon, label }) =>
    kind === "duplicateOf" ? [] : [{ value: kind, label: label(), icon }]
  )
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_create_related_placeholder()}
      onBack={onBack}
      items={[
        ...(context.canHoldChildren
          ? [
              {
                value: "subTicket",
                label:
                  context.ticketDetail?.type === "epic"
                    ? m.tickets_menu_related_epic_ticket()
                    : m.tickets_menu_related_sub_ticket(),
                icon: ListPlus
              }
            ]
          : []),
        ...markItems
      ]}
      onSelect={(item) => {
        const kind = RELATED_KINDS.find((candidate) => candidate === item.value)
        if (kind === undefined) return
        env.close()
        env.registry.set(createTicketDialog, {
          orgSlug: ticket.orgSlug,
          projectSlug: ticket.slug,
          related: { kind, ticketId: ticket.ticketId }
        })
      }}
    />
  )
}

const keyOf = ({
  kind,
  linked
}: ReturnType<typeof removableRelations>[number]) => `${kind}:${linked.id}`

export function TicketRemoveRelationPage({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const marks =
    context.ticketDetail === null
      ? []
      : removableRelations(context.ticketDetail.relations)
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_remove_relation_placeholder()}
      onBack={onBack}
      items={marks.map((mark) => ({
        value: keyOf(mark),
        label: mark.linked.title,
        prefix: mark.linked.id,
        icon: MARK_KINDS.find(({ kind }) => kind === mark.kind)?.icon ?? Flag
      }))}
      onSelect={(item) => {
        const mark = marks.find((candidate) => keyOf(candidate) === item.value)
        if (mark !== undefined) {
          env.execute(
            unmarkTicket(
              ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
            ),
            { kind: mark.kind, target: mark.linked.id }
          )
        }
        env.close()
      }}
    />
  )
}
