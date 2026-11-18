import { RegistryContext, useAtom, useAtomValue } from "@effect/atom-react"
import type { TicketDetail } from "@pp/shared"
import { useNavigate, useParams } from "@tanstack/react-router"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import { useContext, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { CommandMenuDialog } from "@/components/ui/command-menu"
import { currentUserId } from "@/features/auth/atoms/auth"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketContextChip } from "@/features/tickets/components/command-pages/TicketContextChip"
import { useOrgActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

import { commandMenuState, commandScopes } from "../atoms/commandMenu"
import {
  backCommandMenu,
  CLOSED_COMMAND_MENU,
  currentCommandPage,
  openCommandMenu,
  pushCommandPage,
  type CommandMenuState,
  type TicketContext
} from "../lib/commandMenu"
import type { CommandContext, CommandEnv } from "../lib/commands"
import { scopeCommands, scopeTicket } from "../lib/commandScopes"
import { COMMAND_PAGES } from "../pages"
import { commandRegistry } from "../registry"
import { RootCommands } from "./RootCommands"

const noTicketDetail: Atom.Atom<
  AsyncResult.AsyncResult<TicketDetail, unknown>
> = Atom.make(AsyncResult.initial())

export function CommandMenuHost({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const [state, setState] = useAtom(commandMenuState)
  const scopes = useAtomValue(commandScopes)
  const [shown, setShown] = useState(state)
  if (state.open && state !== shown) setShown(state)
  return (
    <CommandMenuDialog
      open={state.open}
      onOpenChange={(open) =>
        setState(
          open ? openCommandMenu(scopeTicket(scopes)) : CLOSED_COMMAND_MENU
        )
      }
      title={m.chrome_command_menu_title()}
      pulseKey={state.pages.join("/")}
    >
      {shown.open && (
        <CommandMenuPage
          key={`${shown.ticket?.ticketId ?? ""}:${shown.pages.join("/")}`}
          orgSlug={orgSlug}
          state={shown}
          onChange={setState}
        />
      )}
    </CommandMenuDialog>
  )
}

function useTicketDetail(ticket: TicketContext | null): TicketDetail | null {
  const result = useAtomValue(
    ticket === null
      ? noTicketDetail
      : ticketDetail(
          ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
        )
  )
  return AsyncResult.isSuccess(result) ? result.value : null
}

function useCommandEnv(
  state: CommandMenuState,
  onChange: (state: CommandMenuState) => void
): CommandEnv {
  const registry = useContext(RegistryContext)
  const navigate = useNavigate()
  return {
    registry,
    execute: (atom, value) => void fireMutation(registry, atom, value),
    navigate: (to) => void navigate({ to }),
    copy: (text) => void navigator.clipboard.writeText(text),
    open: (page) => onChange(pushCommandPage(state, page)),
    close: () => onChange(CLOSED_COMMAND_MENU)
  }
}

function CommandMenuPage({
  orgSlug,
  state,
  onChange
}: Readonly<{
  orgSlug: string
  state: CommandMenuState
  onChange: (state: CommandMenuState) => void
}>) {
  const { ticket } = state
  const params = useParams({ strict: false })
  const viewerId = useAtomValue(currentUserId) ?? null
  const scopes = useAtomValue(commandScopes)
  const context: CommandContext = {
    orgSlug,
    projectSlug: params.slug ?? ticket?.slug ?? null,
    ticket,
    ticketDetail: useTicketDetail(ticket),
    viewerId,
    canSeeOrgMembers: useOrgActor(orgSlug).call("org", "members")
  }
  const env = useCommandEnv(state, onChange)
  const props = {
    context,
    chip: ticket === null ? null : <TicketContextChip ticket={ticket} />,
    onBack: () => onChange(backCommandMenu(state)),
    env
  }
  const page = currentCommandPage(state)
  if (page === "root") {
    return (
      <RootCommands
        {...props}
        commands={[...scopeCommands(scopes), ...commandRegistry]}
      />
    )
  }
  const Page = COMMAND_PAGES[page]
  return <Page {...props} />
}
