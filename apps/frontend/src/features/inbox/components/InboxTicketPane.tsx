import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { InboxEntry } from "@pp/shared"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useEffect, useMemo, useRef } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { useProjectGitStatePolling } from "@/features/github/hooks/useProjectGitStatePolling"
import {
  inboxEntries,
  actedInboxEntry,
  readInboxEntry,
  type InboxRequest
} from "@/features/inbox/atoms/inbox"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import { useProjectChanges } from "@/features/projects/hooks/useProjectChanges"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { LoadedTicket } from "@/features/tickets/components/ticket-page/TicketDetail"
import { TicketLayoutContext } from "@/features/tickets/components/ticket-page/ticketLayout"
import { TicketPageLoading } from "@/features/tickets/components/ticket-page/TicketPageLoading"

const NO_SPLIT: ReadonlyArray<never> = []
const NO_REWARM = () => {}

function useReadWhenLoaded(
  req: InboxRequest,
  entry: InboxEntry,
  loaded: boolean
) {
  const read = useAtomSet(readInboxEntry({ req, id: entry.id }))
  const act = useAtomSet(actedInboxEntry(req))
  const done = useRef(false)
  useEffect(() => {
    if (!loaded || done.current) return
    done.current = true
    if (entry.state !== "unread") return
    act(entry.id)
    read({ revision: entry.revision })
  }, [loaded, entry.state, entry.revision, entry.id, read, act])
}

function useRefreshInboxOnComments(
  req: InboxRequest,
  orgSlug: string,
  slug: string,
  entry: InboxEntry
) {
  const result = useAtomValue(
    comments(commentsRequest(orgSlug, slug, entry.ticket.id))
  )
  const refresh = useAtomRefresh(inboxEntries(req))
  const value = AsyncResult.isSuccess(result) ? result.value : null
  const first = useRef<unknown>(null)
  useEffect(() => {
    if (value === null) return
    if (first.current === null) {
      first.current = value
      return
    }
    if (first.current !== value) refresh()
  }, [value, refresh])
}

function Ticket({
  req,
  entry,
  gitConnected
}: Readonly<{ req: InboxRequest; entry: InboxEntry; gitConnected: boolean }>) {
  const { orgSlug } = req.params
  const slug = entry.ticket.projectSlug
  const ticketReq = ticketRequest(orgSlug, slug, entry.ticket.id)
  const scope = useMemo(
    () => ({ ticket: { orgSlug, slug, ticketId: entry.ticket.id } }),
    [orgSlug, slug, entry.ticket.id]
  )
  useCommandScope(scope)
  useProjectChanges(orgSlug, slug, NO_REWARM)
  useProjectGitStatePolling(orgSlug, slug, gitConnected)
  useReadWhenLoaded(
    req,
    entry,
    AsyncResult.isSuccess(useAtomValue(ticketDetail(ticketReq)))
  )
  useRefreshInboxOnComments(req, orgSlug, slug, entry)
  return (
    <HotkeysProvider scope="ticket">
      <TicketLayoutContext value="pane">
        <LoadedTicket
          req={ticketReq}
          stepper={null}
          from={undefined}
          autoFocusBody={false}
          splitInto={NO_SPLIT}
        />
      </TicketLayoutContext>
    </HotkeysProvider>
  )
}

export function InboxTicketPane({
  req,
  entry
}: Readonly<{ req: InboxRequest; entry: InboxEntry }>) {
  const projectReq = projectRequest(
    req.params.orgSlug,
    entry.ticket.projectSlug
  )
  const result = useAtomValue(project(projectReq))
  const refresh = useAtomRefresh(project(projectReq))
  return (
    <AsyncView
      result={result}
      reset={refresh}
      contained
      onInitial={() => <TicketPageLoading />}
      onSuccess={({ value }) => (
        <ProjectContext.Provider value={projectReq}>
          <Ticket
            req={req}
            entry={entry}
            gitConnected={value.github !== null}
          />
        </ProjectContext.Provider>
      )}
    />
  )
}
