import type { ReactNode } from "react"

export function MappingRow({
  source,
  detail,
  children
}: {
  source: ReactNode
  detail?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid min-h-14 gap-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
          {source}
        </div>
        {detail ? (
          <div className="mt-0.5 truncate pl-7 text-xs text-muted-foreground">
            {detail}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export function MappingLabel({
  icon,
  children
}: {
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="grid size-5 shrink-0 place-items-center text-muted-foreground">
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </span>
  )
}
