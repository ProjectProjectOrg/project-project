import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import { Bot, Copy, FileText, Hash, Link2, Type } from "lucide-react"
import type { LucideIcon } from "lucide-react"

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
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import {
  ticketMarkdown,
  ticketPrompt,
  ticketUrl
} from "@/features/tickets/lib/ticketClipboard"
import { m } from "@/paraglide/messages"

import type { TicketMenuTicket } from "./TicketMenu"

const copy = (text: string) => void navigator.clipboard.writeText(text)

function CopyItem({
  icon: Icon,
  label,
  text
}: Readonly<{ icon: LucideIcon; label: string; text: string | null }>) {
  return (
    <DropdownMenuItem
      disabled={text === null}
      onClick={() => {
        if (text !== null) copy(text)
      }}
      className="cursor-pointer"
    >
      <Icon className="size-4" strokeWidth={1.75} />
      {label}
    </DropdownMenuItem>
  )
}

export function CopySubmenu({
  ticket
}: Readonly<{ ticket: Pick<TicketMenuTicket, "id" | "title"> }>) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Copy className="size-4" strokeWidth={1.75} />
        {m.tickets_menu_copy()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        <CopyItems ticket={ticket} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function CopyItems({
  ticket
}: Readonly<{ ticket: Pick<TicketMenuTicket, "id" | "title"> }>) {
  const location = useProjectRoute()
  const detail = useAtomValue(
    ticketDetail(ticketRequest(location.orgSlug, location.slug, ticket.id))
  )
  const url = ticketUrl(location, ticket.id)
  const full = Result.isSuccess(detail) ? detail.value : null
  return (
    <>
      <CopyItem icon={Hash} label={m.tickets_menu_copy_id()} text={ticket.id} />
      <CopyItem icon={Link2} label={m.tickets_menu_copy_url()} text={url} />
      <CopyItem
        icon={Type}
        label={m.tickets_menu_copy_title()}
        text={ticket.title}
      />
      <DropdownMenuSeparator />
      <CopyItem
        icon={FileText}
        label={m.tickets_menu_copy_markdown()}
        text={full === null ? null : ticketMarkdown(full, url)}
      />
      <CopyItem
        icon={Bot}
        label={m.tickets_menu_copy_prompt()}
        text={full === null ? null : ticketPrompt(full, url, location)}
      />
    </>
  )
}
