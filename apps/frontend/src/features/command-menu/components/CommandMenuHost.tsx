import { RegistryContext, useAtom, useAtomValue } from "@effect/atom-react"
import { ProjectPolicy } from "@pp/access/policies"
import {
  canHoldChildren,
  type Group,
  type ProjectActor,
  type ProjectDetail,
  type TicketDetail,
  type TicketId
} from "@pp/shared"
import { useNavigate, useParams } from "@tanstack/react-router"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import { useContext, useEffect, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { CommandMenuDialog } from "@/components/ui/command-menu"
import { Freeze } from "@/components/ui/freeze"
import { currentUserId } from "@/features/auth/atoms/auth"
import { feedbackStatus } from "@/features/feedback/atoms/feedback"
import { useIntegrationCommands } from "@/features/integrations/hooks/useIntegrationCommands"
import {
  project,
  projectActor,
  projectRequest
} from "@/features/projects/atoms/projects"
import {
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketContextChip } from "@/features/tickets/components/command-pages/TicketContextChip"
import { TicketSelectionChips } from "@/features/tickets/components/command-pages/TicketSelectionChips"
import {
  ticketPermissions,
  type TicketPermissions
} from "@/features/tickets/lib/ticketPermissions"
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
  deselectFromCommandMenu,
  type CommandMenuState,
  type TicketContext
} from "../lib/commandMenu"
import type { CommandContext, CommandEnv } from "../lib/commands"
import {
  scopeCommands,
  scopeSelection,
  scopeSprint,
  scopeTicket,
  scopeView,
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
    <>
      <CommandMenuDialog
        open={state.open}
        onOpenChange={(open) => {
          const selection = open ? scopeSelection(scopes) : null
          const [first] = selection?.tickets ?? []
          setState(
            !open
              ? CLOSED_COMMAND_MENU
              : selection !== null && first !== undefined
                ? openCommandMenu(
                    { orgSlug, slug: selection.slug, ticketId: first.id },
                    "root",
                    selection.tickets
                  )
                : openCommandMenu(
                    scopeTicket(scopes) ?? registry.get(pointedTicket)
                  )
          )
        }}
        title={m.chrome_command_menu_title()}
        pulseKey={`${state.ticket?.ticketId ?? ""}:${state.selection.length}:${state.pages.join("/")}`}
      >
        {shown.open && (
          <Freeze frozen={!state.open}>
            <CommandMenuPage
              key={`${shown.ticket?.ticketId ?? ""}:${shown.pages.join("/")}`}
              orgSlug={orgSlug}
              state={shown}
              scopes={shownScopes}
              onChange={setState}
            />
          </Freeze>
        )}
      </CommandMenuDialog>
      {!state.open && <CommandMenuPrewarm orgSlug={orgSlug} scopes={scopes} />}
    </>
  )
}

type PrewarmPhase = "waiting" | "warming" | "done"

const PREWARM_STATE = openCommandMenu(null)

function CommandMenuPrewarm({
  orgSlug,
  scopes
}: Readonly<{ orgSlug: string; scopes: ReadonlyArray<CommandScope> }>) {
  const [phase, setPhase] = useState<PrewarmPhase>("waiting")
  useEffect(() => {
    if (phase === "warming") {
      const frame = requestAnimationFrame(() => setPhase("done"))
      return () => cancelAnimationFrame(frame)
    }
    if (phase !== "waiting") return undefined
    if (typeof requestIdleCallback === "undefined") {
      const frame = requestAnimationFrame(() => setPhase("warming"))
      return () => cancelAnimationFrame(frame)
    }
    const idle = requestIdleCallback(() => setPhase("warming"), {
      timeout: PREWARM_TIMEOUT_MS
    })
    return () => cancelIdleCallback(idle)
  }, [phase])
  if (phase !== "warming") return null
  return (
    <div
      aria-hidden
      inert
      className="pointer-events-none invisible fixed top-0 -left-[200vw] flex h-[440px] w-[640px] flex-col overflow-hidden"
    >
      <CommandMenuPage
        orgSlug={orgSlug}
        state={PREWARM_STATE}
        scopes={scopes}
        onChange={ignoreChange}
      />
    </div>
  )
}

const PREWARM_TIMEOUT_MS = 3000

const ignoreChange = () => {}

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
      projectActor: null,
      project: null,
      tickets: NO_PROJECT_TICKETS,
      canManageProject: false
    }
  }
  return {
    projectActor: actor,
    project:
      detail !== null && AsyncResult.isSuccess(detail) ? detail.value : null,
    tickets: ticketPermissions(actor),
    canManageProject: ProjectPolicy.canUpdate(actor, { settings: true })
  }
}

const NO_PROJECT_TICKETS: TicketPermissions = {
  create: true,
  edit: false,
  assign: false,
  split: false,
  move: false,
  archive: false,
  delete: false,
  stackBranch: false,
  clearBranch: false,
  planSprints: true
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

const noSprintMembership: Atom.Atom<
  AsyncResult.AsyncResult<ReadonlyMap<TicketId, Group>, unknown>
> = Atom.make(AsyncResult.initial())

function useTicketSprint(ticket: TicketContext | null): Group | null {
  const result = useAtomValue(
    ticket === null
      ? noSprintMembership
      : sprintMembership(sprintListRequest(ticket.orgSlug, ticket.slug))
  )
  return ticket !== null && AsyncResult.isSuccess(result)
    ? (result.value.get(ticket.ticketId) ?? null)
    : null
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
  const detail = useTicketDetail(ticket)
  const feedback = useAtomValue(feedbackStatus(orgSlug))
  const context: CommandContext = {
    orgSlug,
    orgActor,
    projectSlug,
    ticket,
    selection: state.selection,
    ticketDetail: detail,
    ticketSprint: useTicketSprint(ticket),
    canHoldChildren: detail !== null && canHoldChildren(detail, detail.parent),
    sprint: scopeSprint(scopes),
    view: scopeView(scopes),
    viewerId,
    canSeeOrgMembers: orgActor.call("org", "members"),
    canCreateProjects: orgActor.call("projects", "create"),
    canSendFeedback: AsyncResult.isSuccess(feedback) && feedback.value.enabled,
    ...useProjectContext(orgSlug, projectSlug)
  }
  const integrations = useIntegrationCommands(context)
  const env = useCommandEnv(state, onChange)
  const props = {
    context,
    chip:
      state.selection.length > 1 ? (
        <TicketSelectionChips
          tickets={state.selection}
          onDeselect={(ticketId) =>
            onChange(deselectFromCommandMenu(state, ticketId))
          }
        />
      ) : ticket === null ? null : (
        <TicketContextChip ticket={ticket} />
      ),
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
        commands={[
          ...scopeCommands(scopes),
          ...commandRegistry,
          ...integrations
        ]}
      />
    )
  }
  const Page = COMMAND_PAGES[page]
  return <Page {...props} />
}
