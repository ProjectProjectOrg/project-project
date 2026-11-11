import type { ReactNode } from "react"

export function FactBlock({
  title,
  description,
  action,
  children
}: Readonly<{
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}>) {
  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-body font-semibold text-foreground">{title}</h3>
          {description === undefined ? null : (
            <p className="mt-0.5 max-w-[65ch] text-caption text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export function FactList({ children }: Readonly<{ children: ReactNode }>) {
  return <dl className="flex flex-col border-t border-border">{children}</dl>
}

export function FactRow({
  label,
  note,
  action,
  children
}: Readonly<{
  label: string
  note?: ReactNode
  action?: ReactNode
  children: ReactNode
}>) {
  return (
    <div className="grid min-h-9 grid-cols-[12rem_minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-border py-2 text-body">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">
        {children}
        {note === undefined ? null : (
          <p className="mt-0.5 text-caption text-muted-foreground">{note}</p>
        )}
      </dd>
      {action === undefined ? <span aria-hidden /> : action}
    </div>
  )
}
