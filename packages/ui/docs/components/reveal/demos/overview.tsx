import { Button } from "@pp/ui/button"
import { MoreHorizontal } from "@pp/ui/icons"
import { Reveal } from "@pp/ui/reveal"

const ROWS = ["Rewrite onboarding empty states", "Retry webhook deliveries"]

export default function Overview() {
  return (
    <ul className="flex w-full max-w-md flex-col gap-1">
      {ROWS.map((title) => (
        <li
          key={title}
          className="group/reveal flex h-10 items-center justify-between gap-3 rounded-lg px-3 hover:bg-hover"
        >
          <span className="min-w-0 truncate text-body">{title}</span>
          <Reveal>
            <Button variant="ghost" size="square-7" aria-label="More actions">
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </Button>
          </Reveal>
        </li>
      ))}
    </ul>
  )
}
