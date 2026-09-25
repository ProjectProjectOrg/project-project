import { useAtomValue } from "@effect/atom-react"
import type { ProjectStatus } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { generateKeyBetween } from "fractional-indexing"
import { Reorder } from "motion/react"
import { useMemo, useRef, useState } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { StatusCreateRow } from "@/components/StatusCreateRow"
import { StatusRow } from "@/components/StatusRow"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  countsRequest,
  ticketCounts
} from "@/features/tickets/atoms/ticketCounts"
import { useProjectCan } from "@/lib/access"
import { compareByOrderKey } from "@/lib/orderKey"
import { m } from "@/paraglide/messages"

type Props = {
  orgSlug: string
  slug: string
}

export function StatusList({ orgSlug, slug }: Props) {
  const req = useMemo(() => statusesRequest(orgSlug, slug), [orgSlug, slug])
  const result = useAtomValue(statusesFor(req))

  return Result.matchWithError(result, {
    onInitial: () => (
      <section className="flex w-full flex-col gap-2 text-sm text-muted-foreground">
        {m.tickets_status_loading()}
      </section>
    ),
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value }) => (
      <OrderedStatuses orgSlug={orgSlug} slug={slug} statuses={value} />
    )
  })
}

type OrderedProps = Props & {
  statuses: ReadonlyArray<ProjectStatus>
}

function OrderedStatuses({ orgSlug, slug, statuses }: OrderedProps) {
  useAtomValue(ticketCounts(countsRequest(orgSlug, slug, {})))
  const canManage = useProjectCan()("statuses", "update")

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
    return newKey as ProjectStatus["orderKey"]
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
    return newKey as ProjectStatus["orderKey"]
  }

  return (
    <section className="flex w-full flex-col gap-4">
      <fieldset disabled={!canManage} className="contents">
        <Reorder.Group
          as="ul"
          axis="y"
          values={order as ProjectStatus[]}
          onReorder={(next) => setDragOrder(next)}
          className="flex flex-col gap-0.5"
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
                i < order.length - 1 ? () => moveBy(s.slug, +1) : undefined
              }
            />
          ))}
        </Reorder.Group>
      </fieldset>
      {canManage && <StatusCreateRow orgSlug={orgSlug} slug={slug} />}
    </section>
  )
}
