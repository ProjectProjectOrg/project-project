// Inline form body for "connect existing branch". Search input on top,
// scrollable result list below, footer with cancel + connect. Hand-rolled
// (no cmdk in this workspace) but keyboard-navigable.
//
// branchesAtom is keyed on slug + q so each query has its own cache cell;
// we debounce input by 200ms before the q changes (avoids a fetch per
// keystroke).

import { Result, useAtomRefresh, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { GitBranch } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { attachBranchAtom, branchesAtom } from "@/atoms/github"
import { Button } from "@/components/ui/button"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { TicketDetail } from "@projectproject/shared"

export function ConnectBranchFields({
  slug,
  ticket
}: {
  slug: string
  ticket: TicketDetail
}) {
  const { busy, setBusy, close } = useInlineForm()
  const [input, setInput] = useState("")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Debounce the input → q transition. 200ms is short enough to feel live,
  // long enough to skip per-keystroke fetches.
  useEffect(() => {
    const t = setTimeout(() => setQ(input), 200)
    return () => clearTimeout(t)
  }, [input])

  const result = useAtomValue(branchesAtom({ slug, q }))
  const refreshBranches = useAtomRefresh(branchesAtom({ slug, q }))
  const attach = useAtomSet(attachBranchAtom)

  const items = Result.isSuccess(result) ? result.value.items : []
  const listRef = useRef<HTMLDivElement>(null)

  // Keep activeIdx in range when the result list shrinks.
  useEffect(() => {
    if (activeIdx >= items.length) setActiveIdx(0)
  }, [items.length, activeIdx])

  async function submit(branchName: string) {
    setError(null)
    setBusy(true)
    try {
      await attach({ slug, id: ticket.id, name: branchName })
      close()
    } catch (e) {
      const tag =
        typeof e === "object" && e && "_tag" in e ? String(e._tag) : ""
      if (tag === "BranchNotFound") {
        setError(`Branch "${branchName}" was just deleted upstream.`)
        setSelected(null)
        refreshBranches()
      } else {
        setError(
          tag === "GitHubTokenExpired"
            ? "GitHub token expired."
            : tag === "GitHubScopeInsufficient"
              ? "GitHub scope insufficient."
              : tag === "RepoGone"
                ? "Repo not accessible."
                : "Couldn't attach branch."
        )
      }
      setBusy(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, Math.max(items.length - 1, 0)))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = items[activeIdx]
      if (item) {
        setSelected(item.name)
        void submit(item.name)
      }
    }
  }

  return (
    <>
      <Input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        className="h-8 font-mono"
        placeholder="Search branches…"
        disabled={busy}
      />
      <div
        ref={listRef}
        className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/30"
      >
        {Result.isInitial(result) || Result.isWaiting(result) ? (
          <div className="space-y-1 p-1">
            <div className="h-6 animate-pulse rounded bg-muted/60" />
            <div className="h-6 animate-pulse rounded bg-muted/60" />
            <div className="h-6 animate-pulse rounded bg-muted/60" />
          </div>
        ) : Result.isFailure(result) ? (
          <p className="p-2 text-xs text-destructive">
            Couldn't load branches.
          </p>
        ) : items.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">
            No branches found.
          </p>
        ) : (
          <ul role="listbox" className="py-1">
            {items.map((b, i) => (
              <li key={b.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected === b.name}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => setSelected(b.name)}
                  className={cn(
                    "flex w-full items-center justify-between px-2 py-1 text-left font-mono text-xs",
                    activeIdx === i && "bg-muted",
                    selected === b.name && "bg-emerald-500/10"
                  )}
                  disabled={busy}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <GitBranch className="size-3" strokeWidth={1.75} />
                    {b.name}
                  </span>
                  {b.isProtected && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      protected
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <InlineForm.Cancel />
        <Button
          size="sm"
          leadingIcon={GitBranch}
          onClick={() => selected && void submit(selected)}
          disabled={busy || !selected}
        >
          {busy ? "Connecting…" : "Connect"}
        </Button>
      </div>
    </>
  )
}
