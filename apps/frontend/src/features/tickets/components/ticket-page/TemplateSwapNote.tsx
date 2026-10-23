import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export function TemplateSwapNote({
  name,
  onUndo
}: Readonly<{ name: string; onUndo: () => void }>) {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
    >
      <span>{m.templates_swap_note({ name })}</span>
      <span aria-hidden>·</span>
      <Button type="button" variant="ghost" size="xs" onClick={onUndo}>
        {m.templates_swap_undo()}
      </Button>
    </span>
  )
}
