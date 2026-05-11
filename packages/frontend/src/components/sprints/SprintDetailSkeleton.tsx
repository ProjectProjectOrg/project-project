export function SprintDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2 px-3">
          <span className="skeleton size-4 shrink-0 rounded-full bg-muted" />
          <span className="skeleton h-7 w-48 rounded bg-muted" />
          <span className="skeleton ml-auto h-6 w-44 rounded-md bg-muted" />
          <span className="skeleton h-4 w-12 rounded bg-muted" />
          <span className="skeleton size-8 shrink-0 rounded-md bg-muted" />
        </div>
        <div className="flex items-center gap-2 pl-3 pr-5">
          <span className="skeleton h-4 w-24 rounded bg-muted" />
          <span className="skeleton h-3 w-40 rounded bg-muted/70" />
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <div className="skeleton h-10 rounded-xl border border-border bg-background" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="skeleton h-12 rounded-xl border border-border bg-background"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
