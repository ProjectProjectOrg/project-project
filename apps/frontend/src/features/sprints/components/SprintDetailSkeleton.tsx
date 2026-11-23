export function SprintDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2 px-3">
          <span className="size-4 shrink-0 skeleton rounded-full bg-muted" />
          <span className="h-7 w-48 skeleton rounded bg-muted" />
          <span className="ml-auto h-6 w-44 skeleton rounded-md bg-muted" />
          <span className="h-4 w-12 skeleton rounded bg-muted" />
          <span className="size-8 shrink-0 skeleton rounded-md bg-muted" />
        </div>
        <div className="flex items-center gap-2 pr-5 pl-3">
          <span className="h-4 w-24 skeleton rounded bg-muted" />
          <span className="h-3 w-40 skeleton rounded bg-muted/70" />
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <div className="h-10 skeleton rounded-xl border border-border surface-background" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-12 skeleton rounded-xl border border-border surface-background"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
