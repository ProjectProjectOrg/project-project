import { useAtomSet } from "@effect-atom/atom-react"
import { clearBranchAtom } from "@/atoms/github"
import { projectKey } from "@/atoms/projects"
import { Button } from "@/components/ui/button"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { m } from "@/paraglide/messages"
import type { TicketId } from "@projectproject/shared"

export function ClearBranchFields({
  orgSlug,
  slug,
  id
}: {
  orgSlug: string
  slug: string
  id: TicketId
}) {
  const { busy, setBusy, close } = useInlineForm()
  const clear = useAtomSet(clearBranchAtom(projectKey(orgSlug, slug)))

  async function submit() {
    setBusy(true)
    try {
      await clear({ id })
      close()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-2 text-xs">
      <span className="mr-auto text-muted-foreground">
        {m.git_clear_branch_prompt()}
      </span>
      <InlineForm.Cancel />
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => void submit()}
        disabled={busy}
      >
        {busy ? m.git_clear_branch_in_progress() : m.git_clear_branch_button()}
      </Button>
    </div>
  )
}
