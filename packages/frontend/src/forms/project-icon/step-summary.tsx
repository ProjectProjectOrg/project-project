import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export function StepSummary({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: () => void
}) {
  return (
    <div className="group/reveal flex items-center justify-between gap-4 rounded-lg py-2 transition-colors hover:bg-muted/50">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-[13px]">{value}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onChange}
        className="opacity-0 transition-opacity group-hover/reveal:opacity-100 group-focus-within/reveal:opacity-100"
      >
        {m.project_icon_step_change()}
      </Button>
    </div>
  )
}
