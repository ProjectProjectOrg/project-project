import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { LocalDiagnostics } from "@pp/local"
import { useParams } from "@tanstack/react-router"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { MinusIcon } from "lucide-react"
import { type ReactElement, type ReactNode, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip"
import {
  localDiagnostics,
  simulateOffline
} from "@/features/local/atoms/localDiagnostics"
import {
  type LocalProjectRequest,
  type LocalStatus,
  localProject
} from "@/features/local/atoms/localProject"
import { cn } from "@/lib/utils"

import {
  listRequestCounts,
  listRequestsSince,
  mainThreadJank
} from "../atoms/devToolbar"

const COLLAPSED = "pp:dev-toolbar-collapsed"

const readCollapsed = () => {
  try {
    return window.localStorage.getItem(COLLAPSED) === "1"
  } catch {
    return false
  }
}

const writeCollapsed = (collapsed: boolean) => {
  try {
    window.localStorage.setItem(COLLAPSED, collapsed ? "1" : "0")
  } catch {}
}

const tone = {
  good: "text-state-success",
  warn: "text-state-warning",
  bad: "text-state-danger",
  idle: "text-muted-foreground"
} as const

type Tone = keyof typeof tone

type Row = readonly [label: string, value: ReactNode]

const NO_ROWS: ReadonlyArray<Row> = []

function Readout({
  trigger,
  title,
  description,
  rows = NO_ROWS,
  hint,
  children
}: Readonly<{
  trigger: ReactElement
  title: string
  description: string
  rows?: ReadonlyArray<Row>
  hint?: string
  children: ReactNode
}>) {
  return (
    <Tooltip>
      <TooltipTrigger render={trigger}>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        className="flex w-72 flex-col gap-2 px-3 py-2.5"
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground">{title}</span>
          <span className="text-muted-foreground">{description}</span>
        </div>
        {rows.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-micro">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {hint !== undefined && (
          <span className="border-t border-border pt-1.5 text-micro text-muted-foreground">
            {hint}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

const plain = <span className="flex items-center gap-1.5 px-1" />

const syncTone = (status: LocalStatus): Tone => {
  if (status.kind === "initializing") return "warn"
  if (status.kind !== "ready") return "bad"
  if (status.sync === "live") return "good"
  return status.sync === "behind" ? "warn" : "bad"
}

const syncLabel = (status: LocalStatus) =>
  status.kind === "ready" ? status.sync : status.kind

const syncMeaning = {
  live: "Matches the server's change log.",
  behind: "Showing the saved copy while newer changes are pulled.",
  offline: "The server can't be reached. Showing the last synced copy.",
  erroring:
    "Pulls fail. Showing the last synced copy; the console has the cause.",
  initializing: "Downloading the first snapshot of this project.",
  denied: "No access to this project. Its local copy was purged.",
  failed: "No local copy could be loaded. Views read from the server."
} as const satisfies Record<ReturnType<typeof syncLabel>, string>

function SyncState({
  request,
  diagnostics
}: Readonly<{
  request: LocalProjectRequest
  diagnostics: LocalDiagnostics | null
}>) {
  const status = useAtomValue(localProject(request))
  const setOffline = useAtomSet(simulateOffline(request))
  const offline = diagnostics?.offline ?? false
  const current = AsyncResult.isSuccess(status) ? status.value : null
  const label = current === null ? "starting" : syncLabel(current)

  return (
    <Readout
      trigger={
        <Button
          variant="quiet"
          size="xs"
          aria-pressed={offline}
          onClick={() => setOffline(!offline)}
        />
      }
      title="Local copy"
      description={
        current === null
          ? "The local copy worker is starting."
          : syncMeaning[syncLabel(current)]
      }
      rows={[
        ["Project", `${request.orgSlug}/${request.slug}`],
        ["State", label],
        ["Simulated offline", offline ? "on" : "off"]
      ]}
      hint={
        offline
          ? "Click to reconnect and pull."
          : "Click to simulate offline: pulls fail as if the network were down."
      }
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          current === null ? tone.idle : tone[syncTone(current)]
        )}
      />
      <span className="text-foreground">{label}</span>
      {offline && <span className={tone.bad}>sim</span>}
    </Readout>
  )
}

function Cursor({ cursor }: Readonly<{ cursor: string | null }>) {
  const [generation, sequence] = cursor?.split(".") ?? []
  return (
    <Readout
      trigger={plain}
      title="Sync cursor"
      description="Where this copy stands in the project's change log. The generation goes up when the server forces every client to take a fresh snapshot."
      rows={[
        ["Generation", generation ?? "none"],
        ["Sequence", sequence ?? "none"]
      ]}
    >
      @{cursor ?? "none"}
    </Readout>
  )
}

function LastPull({ pull }: Readonly<{ pull: LocalDiagnostics["lastPull"] }>) {
  if (pull === null) return null
  const slow = pull.millis > 250
  return (
    <Readout
      trigger={plain}
      title="Last pull"
      description={
        pull.kind === "snapshot"
          ? "A full snapshot: the whole project replaced in one SQLite transaction."
          : "A batch of changes since the cursor, applied in one SQLite transaction."
      }
      rows={[
        ["Kind", pull.kind],
        ["Facts", pull.facts.toLocaleString()],
        [
          "Fetch + apply",
          <span key="took" className={slow ? tone.bad : undefined}>
            {Math.round(pull.millis)} ms
          </span>
        ]
      ]}
      hint="Over 250 ms shows red."
    >
      {pull.kind === "snapshot" ? "snap" : "Δ"} {pull.facts.toLocaleString()}
      <span className={slow ? tone.bad : undefined}>
        {Math.round(pull.millis)}ms
      </span>
    </Readout>
  )
}

function ProjectSync({ request }: Readonly<{ request: LocalProjectRequest }>) {
  const result = useAtomValue(localDiagnostics(request))
  const diagnostics = AsyncResult.isSuccess(result) ? result.value : null
  return (
    <>
      <SyncState request={request} diagnostics={diagnostics} />
      <Cursor cursor={diagnostics?.cursor ?? null} />
      <LastPull pull={diagnostics?.lastPull ?? null} />
    </>
  )
}

const jankTone = (share: number): Tone => {
  if (share > 0.1) return "bad"
  return share > 0.02 ? "warn" : "idle"
}

const percent = (share: number) => `${Math.round(share * 100)}%`

function Jank() {
  const result = useAtomValue(mainThreadJank)
  if (!AsyncResult.isSuccess(result)) return null
  const seconds = result.value
  if (seconds === null)
    return (
      <Readout
        trigger={plain}
        title="Main thread jank"
        description="This browser has no Long Animation Frames API. Use Chrome or Edge to measure jank."
      >
        Jank n/a
      </Readout>
    )
  const shares = seconds.map((second) => second.share)
  const share = shares.reduce((sum, s) => sum + s, 0) / shares.length
  return (
    <Readout
      trigger={plain}
      title="Main thread jank"
      description="Share of the last 10 seconds the main thread spent in frames slower than 50 ms, from Long Animation Frames. One bar per second."
      rows={[
        ["Last 10 s", percent(share)],
        ["Worst second", percent(Math.max(...shares))],
        ["Janky seconds", `${shares.filter((s) => s > 0.02).length} of 10`]
      ]}
      hint="Over 2% shows amber, over 10% red."
    >
      Jank
      <span className={tone[jankTone(share)]}>{percent(share)}</span>
      <span className="flex h-3 items-end gap-px">
        {seconds.map(({ secondsAgo, share: second }) => (
          <span
            key={secondsAgo}
            className={cn("w-0.5 bg-current", tone[jankTone(second)])}
            style={{ height: `${Math.max(8, Math.min(100, second * 100))}%` }}
          />
        ))}
      </span>
    </Readout>
  )
}

function ListRequests() {
  const counts = useAtomValue(listRequestCounts)
  const resetSince = useAtomSet(listRequestsSince)
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0)
  return (
    <Readout
      trigger={
        <Button
          variant="quiet"
          size="xs"
          onClick={() => resetSince(performance.now())}
        />
      }
      title="Ticket list requests"
      description="Calls to the list endpoints the local copy replaces. Views that read from the local copy make none of these."
      rows={
        total === 0
          ? [["Since reset", "none"]]
          : [...counts].map(([endpoint, n]): Row => [endpoint, n])
      }
      hint="Click to reset the count."
    >
      List <span className={total > 0 ? tone.warn : undefined}>{total}</span>
    </Readout>
  )
}

export function DevToolbar() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const { orgSlug, slug } = useParams({ strict: false })
  const collapse = (next: boolean) => {
    writeCollapsed(next)
    setCollapsed(next)
  }

  if (collapsed)
    return (
      <div className="fixed right-2 bottom-2 z-50 rounded-md border border-border bg-popover font-mono text-micro text-muted-foreground shadow-sm">
        <Button variant="quiet" size="xs" onClick={() => collapse(false)}>
          dev
        </Button>
      </div>
    )

  return (
    <footer className="col-span-full flex h-8 items-center justify-between gap-3 px-2.5 pb-1 font-mono text-micro text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        {orgSlug !== undefined && slug !== undefined && (
          <ProjectSync request={{ orgSlug, slug }} />
        )}
      </div>
      <div className="flex items-center gap-2">
        <Jank />
        <ListRequests />
        <Button
          variant="quiet"
          size="icon-xs"
          aria-label="Collapse the dev toolbar"
          onClick={() => collapse(true)}
        >
          <MinusIcon />
        </Button>
      </div>
    </footer>
  )
}
