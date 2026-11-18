import { RegistryContext, useAtom, useAtomValue } from "@effect/atom-react"
import { CommandMenuDialog } from "@pp/ui/command-menu"
import { Freeze } from "@pp/ui/freeze"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useContext, useEffect, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { useIntegrationCommands } from "@/features/integrations/hooks/useIntegrationCommands"
import { TicketContextChip } from "@/features/tickets/components/command-pages/TicketContextChip"
import { TicketSelectionChips } from "@/features/tickets/components/command-pages/TicketSelectionChips"
import { appHotkeys } from "@/lib/appHotkeys"
import { m } from "@/paraglide/messages"

import { commandContext } from "../atoms/commandContext"
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
  type CommandMenuState
} from "../lib/commandMenu"
import type { CommandContext, CommandEnv } from "../lib/commands"
import {
  openFromScopes,
  scopeCommands,
  scopeSprint,
  scopeView,
  type CommandScope
} from "../lib/commandScopes"
import { COMMAND_PAGES } from "../pages"
import { commandRegistry } from "../registry"
import { CommandHotkeys } from "./CommandHotkeys"
import { RootCommands } from "./RootCommands"

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
        onOpenChange={(open) =>
          setState(
            open
              ? openFromScopes(orgSlug, scopes, registry.get(pointedTicket))
              : CLOSED_COMMAND_MENU
          )
        }
        title={m.chrome_command_menu_title()}
        shortcut={appHotkeys["app.command-menu"]}
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
      <CommandHotkeys orgSlug={orgSlug} />
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

function useCommandEnv(
  state: CommandMenuState,
  onChange: (state: CommandMenuState) => void
) {
  const registry = useContext(RegistryContext)
  const navigate = useNavigate()
  return {
    registry,
    execute: (atom, value) => void fireMutation(registry, atom, value),
    navigate: (to, search) => void navigate({ to, search }),
    copy: (text) => void navigator.clipboard.writeText(text),
    open: (page, from) => onChange(pushCommandPage(state, page, from)),
    actOn: (ticket, from) => onChange(actOnTicket(state, ticket, from)),
    close: () => onChange(CLOSED_COMMAND_MENU)
  } satisfies CommandEnv
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
  const projectSlug = params.slug ?? ticket?.slug ?? null
  const context: CommandContext = {
    ...useAtomValue(commandContext({ orgSlug, projectSlug, ticket })),
    routeProjectSlug: params.slug ?? null,
    selection: state.selection,
    sprint: scopeSprint(scopes),
    view: scopeView(scopes)
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
