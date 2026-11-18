import { ArrowUpRight } from "@pp/ui/icons"

import type { Source, SourceKind } from "./registry"

const LIBRARY: Readonly<Record<SourceKind, string>> = {
  "base-ui": "Base UI",
  shadcn: "shadcn/ui",
  fluid: "Fluid Functionalism",
  own: "ProjectProject"
}

export function Sources({
  sources
}: Readonly<{ sources: ReadonlyArray<Source> }>) {
  return (
    <section aria-label="Built on" className="mt-6 flex flex-col gap-2">
      <h2 className="text-caption text-muted-foreground">Built on</h2>
      <ul className="flex flex-wrap gap-2">
        {sources.map((source) => (
          <li
            key={`${source.kind}-${source.name}`}
            className="max-w-full min-w-0"
          >
            <SourceChip source={source} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function SourceChip({ source }: Readonly<{ source: Source }>) {
  const body = (
    <>
      <span className="text-muted-foreground">{LIBRARY[source.kind]}</span>{" "}
      <span className="font-semibold">{source.name}</span>
      {source.note === undefined ? null : (
        <span className="text-muted-foreground"> · {source.note}</span>
      )}
      {source.href === undefined ? null : (
        <ArrowUpRight className="ml-1 inline size-3.5 align-[-2px] text-muted-foreground" />
      )}
    </>
  )
  // Plain inline text, not a flex row, so a long note wraps like a sentence
  // inside the chip instead of squeezing into a column.
  const className =
    "inline-block max-w-full rounded-lg bg-surface-2 px-2.5 py-1.5 text-caption corner-squircle"
  return source.href === undefined ? (
    <span className={className}>{body}</span>
  ) : (
    <a
      href={source.href}
      target="_blank"
      rel="noreferrer"
      className={`${className} transition-colors hover:bg-hover`}
    >
      {body}
    </a>
  )
}
