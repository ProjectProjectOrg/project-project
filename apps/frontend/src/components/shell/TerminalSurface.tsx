import type { ReactNode } from "react"

type TerminalSurfaceProps = Readonly<{
  title: string
  description: string
  details?: ReactNode
  error?: string | null
  children: ReactNode
}>

export function TerminalSurface({
  title,
  description,
  details,
  error,
  children
}: TerminalSurfaceProps) {
  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-full max-w-xl">
        <h2 className="text-subtitle font-semibold text-balance text-foreground">
          {title}
        </h2>
        <p className="mt-2 text-body leading-6 text-pretty text-muted-foreground">
          {description}
        </p>
        {details}
        {error ? (
          <p className="mt-3 text-body text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {children}
        </div>
      </div>
    </div>
  )
}
