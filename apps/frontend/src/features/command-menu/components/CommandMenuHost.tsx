import { RegistryContext, useAtom, useAtomValue } from "@effect/atom-react"
import { GroupPolicy, ProjectPolicy } from "@pp/access/policies"
import type { ProjectActor, ProjectDetail, TicketDetail } from "@pp/shared"
import { useNavigate, useParams } from "@tanstack/react-router"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import { useContext, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { CommandMenuDialog } from "@/components/ui/command-menu"
import { currentUserId } from "@/features/auth/atoms/auth"
import {
  project,
  projectActor,
  projectRequest
} from "@/features/projects/atoms/projects"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketContextChip } from "@/features/tickets/components/command-pages/TicketContextChip"
import { useOrgActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

import {
  commandMenuState,
  commandScopes,
  pointedTicket
} from "../atoms/commandMenu"
import {
  backCommandMenu,
  CLOSED_COMMAND_MENU,
  currentCommandPage,
  openCommandMenu,
  pushCommandPage,
  actOnTicket,
  type CommandMenuState,
  type TicketContext
} from "../lib/commandMenu"
import type { CommandContext, CommandEnv } from "../lib/commands"
import {
  scopeCommands,
  scopeSprint,
  scopeTicket,
  type CommandScope
} from "../lib/commandScopes"
import { COMMAND_PAGES } from "../pages"
import { commandRegistry } from "../registry"
import { RootCommands } from "./RootCommands"

const noTicketDetail: Atom.Atom<
  AsyncResult.AsyncResult<TicketDetail, unknown>
> = Atom.make(AsyncResult.initial())

export function CommandMenuHost({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const registry = useContext(RegistryContext)
  const [state, setState] = useAtom(commandMenuState)
  const scopes = useAtomValue(commandScopes)
  const [shown, setShown] = useState(state)
  if (state.open && state !== shown) setShown(state)
  const [shownScopes, setShownScopes] = useState(scopes)
  if (state.open && scopes !== shownScopes) setShownScopes(scopes)
  return (
    <CommandMenuDialog
      open={state.open}
      onOpenChange={(open) => {
        setState(
          open
            ? openCommandMenu(
                scopeTicket(scopes) ?? registry.get(pointedTicket)
              )
            : CLOSED_COMMAND_MENU
        )
      }}
      title={m.chrome_command_menu_title()}
      pulseKey={`${state.ticket?.ticketId ?? ""}:${state.pages.join("/")}`}
    >
      {shown.open && (
        <CommandMenuPage
          key={`${shown.ticket?.ticketId ?? ""}:${shown.pages.join("/")}`}
          orgSlug={orgSlug}
          state={shown}
          scopes={shownScopes}
          onChange={setState}
        />
      )}
    </CommandMenuDialog>
  )
}

const noProject: Atom.Atom<AsyncResult.AsyncResult<
  ProjectDetail,
  unknown
> | null> = Atom.make(null)

function useProjectContext(orgSlug: string, projectSlug: string | null) {
  const req = projectSlug === null ? null : projectRequest(orgSlug, projectSlug)
  const detail = useAtomValue(req === null ? noProject : project(req))
  const actor = useAtomValue(req === null ? noActor : projectActor(req))
  if (actor === null) {
    return {
      project: null,
      canCreateTickets: true,
      canEditTickets: false,
      canArchiveTickets: false,
      canDeleteTickets: false,
      canPlanSprints: true,
      canManageProject: false
    }
  }
  return {
    project:
      detail !== null && AsyncResult.isSuccess(detail) ? detail.value : null,
    canCreateTickets: actor.call("tickets", "create"),
    canEditTickets: actor.call("tickets", "update"),
    canArchiveTickets: actor.call("tickets", "archive"),
    canDeleteTickets: actor.call("tickets", "delete"),
    canPlanSprints: GroupPolicy.can(actor, "sprint", "manage"),
    canManageProject: ProjectPolicy.canUpdate(actor, { settings: true })
  }
}

const noActor: Atom.Atom<ProjectActor | null> = Atom.make(null)

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
    open: (page, from) => onChange(pushCommandPage(state, page, from)),
    actOn: (ticket, from) => onChange(actOnTicket(state, ticket, from)),
    close: () => onChange(CLOSED_COMMAND_MENU)
  }
}

function CommandMenuPage({
  orgSlug,
  state,
  scopes,
  onChange
}: Readonly<{
  orgSlug: string
  state: CommandMenuState
  scopes: ReadonlyArray<CommandScope>
  onChange: (state: CommandMenuState) => void
}>) {
  const { ticket } = state
  const params = useParams({ strict: false })
  const viewerId = useAtomValue(currentUserId) ?? null
  const projectSlug = params.slug ?? ticket?.slug ?? null
  const orgActor = useOrgActor(orgSlug)
  const context: CommandContext = {
    orgSlug,
    projectSlug,
    ticket,
    ticketDetail: useTicketDetail(ticket),
    sprint: scopeSprint(scopes),
    viewerId,
    canSeeOrgMembers: orgActor.call("org", "members"),
    canCreateProjects: orgActor.call("projects", "create"),
    ...useProjectContext(orgSlug, projectSlug)
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
        initialSearch={state.search}
        initialFocus={state.focus}
        commands={[...scopeCommands(scopes), ...commandRegistry]}
      />
    )
  }
  const Page = COMMAND_PAGES[page]
  return <Page {...props} />
}
