// Inline form body for "open PR". Mounted by InlineForm.Form action="open_pr".

import { useAtomSet } from "@effect-atom/atom-react"
import { GitPullRequest } from "lucide-react"
import { useState } from "react"
import { openPrAtom } from "@/atoms/github"
import { Button } from "@/components/ui/button"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { Input } from "@/components/ui/input"
import type { TicketDetail } from "@projectproject/shared"

export function OpenPrFields({
  slug,
  ticket,
  branch
}: {
  slug: string
  ticket: TicketDetail
  branch: string
}) {
  const { busy, setBusy, close } = useInlineForm()
  const [title, setTitle] = useState(ticket.title)
  const [draft, setDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = useAtomSet(openPrAtom)

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      await open({
        slug,
        id: ticket.id,
        title: title.trim() || undefined,
        draft
      })
      close()
    } catch (e) {
      const tag =
        typeof e === "object" && e && "_tag" in e ? String(e._tag) : ""
      setError(
        tag === "BranchProtected"
          ? "Target branch is protected."
          : tag === "GitHubTokenExpired"
            ? "GitHub token expired."
            : tag === "GitHubScopeInsufficient"
              ? "GitHub scope insufficient."
              : tag === "RepoGone"
                ? "Repo not accessible."
                : "Couldn't open PR — make sure the branch has commits."
      )
      setBusy(false)
    }
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Open PR from <span className="font-mono text-foreground">{branch}</span>
      </p>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8"
        placeholder="PR title"
        disabled={busy}
      />
      <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={draft}
          onChange={(e) => setDraft(e.target.checked)}
          disabled={busy}
        />
        Open as draft
      </label>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <InlineForm.Cancel />
        <Button
          size="sm"
          leadingIcon={GitPullRequest}
          onClick={() => void submit()}
          disabled={busy}
        >
          {busy ? "Opening…" : "Open PR"}
        </Button>
      </div>
    </>
  )
}
