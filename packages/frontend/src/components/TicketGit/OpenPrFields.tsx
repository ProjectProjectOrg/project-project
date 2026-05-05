// Inline confirm content for "open PR". Mounted inside ConfirmButton.Confirm.
// The confirm row exposes both submit paths (Open + As draft) as siblings
// rather than a checkbox — same interaction depth, clearer parallel.

import { useAtomSet } from "@effect-atom/atom-react"
import { GitPullRequest } from "lucide-react"
import { useState } from "react"
import { openPrAtom } from "@/atoms/github"
import { Button } from "@/components/ui/button"
import { ConfirmButton, useConfirmButton } from "@/components/ui/confirm-button"
import { Input } from "@/components/ui/input"
import type { TicketDetail } from "@projectproject/shared"

export function OpenPrConfirm({
  slug,
  ticket,
  branch
}: {
  slug: string
  ticket: TicketDetail
  branch: string
}) {
  const { busy, setBusy, close } = useConfirmButton()
  const [title, setTitle] = useState(ticket.title)
  const [error, setError] = useState<string | null>(null)
  const open = useAtomSet(openPrAtom(slug))

  async function submit(draft: boolean) {
    setError(null)
    setBusy(true)
    try {
      await open({
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
      <span className="text-xs text-muted-foreground">
        from <span className="font-mono text-foreground">{branch}</span>
      </span>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8 w-56"
        placeholder="PR title"
        disabled={busy}
      />
      <Button
        size="sm"
        leadingIcon={GitPullRequest}
        onClick={() => void submit(false)}
        disabled={busy}
      >
        {busy ? "Opening…" : "Open"}
      </Button>
      <Button
        size="sm"
        variant="tertiary"
        onClick={() => void submit(true)}
        disabled={busy}
      >
        As draft
      </Button>
      <ConfirmButton.Cancel />
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
    </>
  )
}
