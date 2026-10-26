import { useAtomValue } from "@effect/atom-react"
import { OrderKey, type ProjectStatus } from "@pp/shared"
import { generateKeyBetween } from "fractional-indexing"
import { Reorder } from "motion/react"
import { useMemo, useRef, useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { SettingsGroup } from "@/components/shell/settings/SettingsSection"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { StatusCreateRow } from "@/features/statuses/components/StatusCreateRow"
import { StatusRow } from "@/features/statuses/components/StatusRow"
import {
  countsRequest,
  ticketCounts
} from "@/features/tickets/atoms/ticketCounts"
import { useProjectActor } from "@/lib/access"
import { compareByOrderKey } from "@/lib/orderKey"
import { m } from "@/paraglide/messages"

type Props = {
  orgSlug: string
  slug: string
}

export function StatusList({ orgSlug, slug }: Props) {
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
      onSuccess={({ value }) => (
        <OrderedStatuses orgSlug={orgSlug} slug={slug} statuses={value} />
      )}
    />
  )
}

type OrderedProps = Props & {
  statuses: ReadonlyArray<ProjectStatus>
}

function OrderedStatuses({ orgSlug, slug, statuses }: OrderedProps) {
  useAtomValue(ticketCounts(countsRequest(orgSlug, slug, {})))
  const canManage = useProjectActor().call("statuses", "update")

  const sorted = useMemo(
    () => [...statuses].toSorted(compareByOrderKey),
    [statuses]
  )

  const [dragOrder, setDragOrder] =
    useState<ReadonlyArray<ProjectStatus> | null>(null)
  const order = dragOrder ?? sorted
  const orderRef = useRef(order)
  orderRef.current = order

  const commitDrop = (statusSlug: string): ProjectStatus["orderKey"] | null => {
    const list = orderRef.current
    const idx = list.findIndex((s) => s.slug === statusSlug)
    if (idx < 0) {
      setDragOrder(null)
      return null
    }
    if (sorted[idx]?.slug === statusSlug) {
      setDragOrder(null)
      return null
    }
    const prevKey = list[idx - 1]?.orderKey ?? null
    const nextKey = list[idx + 1]?.orderKey ?? null
    const newKey = generateKeyBetween(prevKey, nextKey)
    setDragOrder(null)
    return OrderKey.make(newKey)
  }

  const moveBy = (
    statusSlug: string,
    delta: number
  ): ProjectStatus["orderKey"] | null => {
    const idx = sorted.findIndex((s) => s.slug === statusSlug)
    const targetIdx = idx + delta
    if (idx < 0 || targetIdx < 0 || targetIdx >= sorted.length) return null
    const next = [...sorted]
    const [moved] = next.splice(idx, 1)
    next.splice(targetIdx, 0, moved)
    const prevKey = next[targetIdx - 1]?.orderKey ?? null
    const nextKey = next[targetIdx + 1]?.orderKey ?? null
    const newKey = generateKeyBetween(prevKey, nextKey)
    return OrderKey.make(newKey)
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
          {order.map((s, i) => (
            <StatusRow
              key={s.slug}
              status={s}
              statuses={order}
              orgSlug={orgSlug}
              slug={slug}
              onDragStart={() => {
                if (dragOrder === null) setDragOrder(sorted)
              }}
              onDragEnd={() => commitDrop(s.slug)}
              onMoveUp={i > 0 ? () => moveBy(s.slug, -1) : undefined}
              onMoveDown={
                i < order.length - 1 ? () => moveBy(s.slug, 1) : undefined
              }
            />
          ))}
        </Reorder.Group>
      </fieldset>
      {canManage && (
        <div className="px-3 py-2">
          <StatusCreateRow orgSlug={orgSlug} slug={slug} />
        </div>
      )}
    </SettingsGroup>
  )
}
