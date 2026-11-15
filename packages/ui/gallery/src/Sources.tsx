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
          <li key={`${source.kind}-${source.name}`}>
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
      <span className="text-muted-foreground">{LIBRARY[source.kind]}</span>
      <span className="font-semibold">{source.name}</span>
      {source.note === undefined ? null : (
        <span className="text-muted-foreground">· {source.note}</span>
      )}
      {source.href === undefined ? null : (
        <ArrowUpRight className="size-3.5 text-muted-foreground" />
      )}
    </>
  )
  const className =
    "inline-flex h-7 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-caption corner-squircle"
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
