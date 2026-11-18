import { ArrowUpRight } from "@pp/ui/icons"
import { Link, type LinkComponentProps } from "@tanstack/react-router"

export function SectionLink({
  label,
  ...linkProps
}: Omit<LinkComponentProps, "children" | "className"> &
  Readonly<{ label: string }>) {
  return (
    <Link
      {...linkProps}
      className="group/reveal -mx-1 inline-flex items-center gap-0.5 rounded px-1 transition-colors hover:text-foreground"
    >
      {label}
      <ArrowUpRight
        aria-hidden
        className="size-3 opacity-60 transition-[opacity,translate] duration-150 ease-out group-hover/reveal:translate-x-px group-hover/reveal:-translate-y-px group-hover/reveal:opacity-100 group-focus-visible/reveal:translate-x-px group-focus-visible/reveal:-translate-y-px group-focus-visible/reveal:opacity-100 motion-reduce:translate-0"
        strokeWidth={2.25}
      />
    </Link>
  )
}
