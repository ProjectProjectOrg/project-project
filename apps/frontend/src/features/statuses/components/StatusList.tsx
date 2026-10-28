import { useAtomValue } from "@effect/atom-react"
import type { ProjectStatus, StatusPhase } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { Reorder } from "motion/react"
import { useMemo, useRef, useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { SettingsGroup } from "@/components/shell/settings/SettingsSection"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { StatusDraftRow } from "@/features/statuses/components/StatusDraftRow"
import { StatusPhaseHeader } from "@/features/statuses/components/StatusPhaseHeader"
import { StatusRow } from "@/features/statuses/components/StatusRow"
import {
  moveStatus,
  phaseEntries,
  placeStatus,
  type PhaseEntry
} from "@/features/statuses/lib/statusPhases"
import {
  countsRequest,
  ticketCounts
} from "@/features/tickets/atoms/ticketCounts"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

const PHASE_LABEL: Readonly<Record<StatusPhase, () => string>> = {
  unstarted: m.tickets_status_phase_unstarted,
  started: m.tickets_status_phase_started,
  finished: m.tickets_status_phase_finished
}

export function StatusList() {
  const { orgSlug, slug } = useProjectRoute()
  const req = statusesRequest(orgSlug, slug)
  const result = useAtomValue(statusesFor(req))

  return (
    <AsyncView
      result={result}
      contained
      onInitial={() => (
        <SettingsGroup>
          <p className="px-4 py-3 text-[13px] text-muted-foreground">
            {m.tickets_status_loading()}
          </p>
        </SettingsGroup>
      )}
      onSuccess={({ value }) => <PhasedStatuses statuses={value} />}
    />
  )
}

const INSTANT_LAYOUT = { layout: { duration: 0 } }

const entryKey = (entry: PhaseEntry) =>
  entry.kind === "status"
    ? `status:${entry.status.slug}`
    : `phase:${entry.phase}`

function PhasedStatuses({
  statuses
}: Readonly<{ statuses: ReadonlyArray<ProjectStatus> }>) {
  const { orgSlug, slug } = useProjectRoute()
  const counts = useAtomValue(ticketCounts(countsRequest(orgSlug, slug, {})))
  const byStatus = Result.isSuccess(counts) ? counts.value.byStatus : {}
  const canManage = useProjectActor().call("statuses", "update")

  const entries = useMemo(() => phaseEntries(statuses), [statuses])
  const [dragOrder, setDragOrder] = useState<ReadonlyArray<PhaseEntry> | null>(
    null
  )
  const order = dragOrder ?? entries
  const dragging = dragOrder !== null
  const orderRef = useRef(order)
  orderRef.current = order
  const [creating, setCreating] = useState<StatusPhase | null>(null)

  const phaseCounts: Record<StatusPhase, number> = {
    unstarted: 0,
    started: 0,
    finished: 0
  }
  let phase: StatusPhase = "unstarted"
  for (const entry of entries) {
    if (entry.kind === "phase") phase = entry.phase
    if (entry.kind === "status")
      phaseCounts[phase] += byStatus[entry.status.slug] ?? 0
  }

  const creatingAt = order.findIndex(
    (entry) => entry.kind === "phase" && entry.phase === creating
  )
  const nextPhaseAt = order.findIndex(
    (entry, i) => i > creatingAt && entry.kind === "phase"
  )
  const draftAt =
    creating === null ? -1 : nextPhaseAt === -1 ? order.length : nextPhaseAt
  const draft =
    creating === null ? null : (
      <StatusDraftRow
        key={`draft:${creating}`}
        phase={creating}
        statuses={statuses}
        onClose={() => setCreating(null)}
      />
    )

  const commitDrop = (statusSlug: string) => {
    const key = placeStatus(orderRef.current, statusSlug)
    setDragOrder(null)
    return key
  }

  return (
    <SettingsGroup>
      <fieldset disabled={!canManage} className="contents">
        <Reorder.Group
          as="ul"
          axis="y"
          values={[...order]}
          onReorder={(next) => setDragOrder(next)}
          className="divide-y divide-border"
        >
          {order.map((entry, i) => {
            switch (entry.kind) {
              case "phase":
                return [
                  i === draftAt ? draft : null,
                  <Reorder.Item
                    key={entryKey(entry)}
                    value={entry}
                    dragListener={false}
                    transition={dragging ? undefined : INSTANT_LAYOUT}
                    className="list-none"
                  >
                    <StatusPhaseHeader
                      label={PHASE_LABEL[entry.phase]()}
                      ticketCount={phaseCounts[entry.phase]}
                      onAdd={canManage ? () => setCreating(entry.phase) : null}
                    />
                  </Reorder.Item>
                ]
              case "status":
                return (
                  <StatusRow
                    key={entryKey(entry)}
                    entry={entry}
                    statuses={statuses}
                    count={byStatus[entry.status.slug] ?? 0}
                    dragging={dragging}
                    onDragStart={() => {
                      if (!dragging) setDragOrder(entries)
                    }}
                    onDragEnd={() => commitDrop(entry.status.slug)}
                    onMove={(delta) =>
                      moveStatus(entries, entry.status.slug, delta)
                    }
                  />
                )
            }
          })}
          {draftAt === order.length ? draft : null}
        </Reorder.Group>
      </fieldset>
    </SettingsGroup>
  )
}
