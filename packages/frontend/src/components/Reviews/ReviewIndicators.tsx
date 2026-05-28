import { cn } from "@/lib/utils"

export type ReviewTone = "success" | "danger" | "warning" | "muted"

export function diffPipTones({
  additions,
  deletions,
  length = 6
}: {
  additions: number
  deletions: number
  length?: number
}) {
  const total = additions + deletions
  if (total === 0) return Array.from({ length }, () => "muted" as const)
  if (additions === 0) return Array.from({ length }, () => "deletion" as const)
  if (deletions === 0) return Array.from({ length }, () => "addition" as const)

  const deletionPips = Math.min(
    length - 1,
    Math.max(1, Math.round((deletions / total) * length))
  )
  const additionPips = length - deletionPips

  return [
    ...Array.from({ length: additionPips }, () => "addition" as const),
    ...Array.from({ length: deletionPips }, () => "deletion" as const)
  ]
}

export function DiffPips({
  additions,
  deletions
}: {
  additions: number
  deletions: number
}) {
  const tones = diffPipTones({ additions, deletions })
  const seen = { addition: 0, deletion: 0, muted: 0 }
  const items = tones.map((tone) => {
    const key = `${tone}-${seen[tone]}`
    seen[tone] += 1
    return { key, tone }
  })
  const toneClasses = {
    addition: "bg-state-success",
    deletion: "bg-state-danger",
    muted: "bg-muted-foreground/35"
  }
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {items.map(({ key, tone }) => (
        <span
          key={key}
          className={cn("size-2 rounded-sm", toneClasses[tone])}
        />
      ))}
    </span>
  )
}

export function Pip({ tone }: { tone: ReviewTone }) {
  const toneClasses: Record<ReviewTone, string> = {
    success: "bg-state-success",
    danger: "bg-state-danger",
    warning: "bg-state-warning",
    muted: "bg-muted-foreground/40"
  }
  return (
    <span
      className={cn("size-2 shrink-0 rounded-sm", toneClasses[tone])}
      aria-hidden
    />
  )
}
