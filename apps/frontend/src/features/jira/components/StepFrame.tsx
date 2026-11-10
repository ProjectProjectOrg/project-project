import type { ReactNode } from "react"

import { AutoHeight } from "@/components/ui/auto-height"

export function StepFrame({
  title,
  description,
  children,
  start,
  end,
  error = null,
  animateHeight = true
}: Readonly<{
  title: string
  description?: ReactNode
  children?: ReactNode
  start?: ReactNode
  end?: ReactNode
  error?: string | null
  animateHeight?: boolean
}>) {
  const footer = start !== undefined || end !== undefined || error !== null
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="-mx-3 min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto overscroll-y-contain px-3">
        <header className="max-w-[65ch] pb-6">
          <h2 className="text-lg font-semibold tracking-tight text-balance text-foreground">
            {title}
          </h2>
          {description === undefined ? null : (
            <div className="mt-1.5 text-sm leading-[21px] text-pretty text-muted-foreground">
              {description}
            </div>
          )}
        </header>
        <div className="pb-8">
          {animateHeight ? <AutoHeight>{children}</AutoHeight> : children}
        </div>
      </div>
      {footer ? (
        <footer className="flex h-16 shrink-0 items-center justify-between gap-3 border-t border-border">
          <div className="flex min-w-0 items-center gap-2">{start}</div>
          <div className="flex min-w-0 items-center justify-end gap-3">
            {error === null ? null : (
              <span
                role="alert"
                title={error}
                className="truncate text-[13px] text-destructive"
              >
                {error}
              </span>
            )}
            {end}
          </div>
        </footer>
      ) : null}
    </div>
  )
}

export function StepNote({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="truncate text-[13px] text-muted-foreground">
      {children}
    </span>
  )
}
