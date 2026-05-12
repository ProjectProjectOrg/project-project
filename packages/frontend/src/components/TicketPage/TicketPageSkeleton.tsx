export function TicketPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <div className="skeleton size-10 shrink-0 rounded-lg bg-muted/60" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
          <div className="skeleton h-6 w-1/2 rounded bg-muted/60" />
          <div className="skeleton h-3 w-12 rounded bg-muted/60" />
        </div>
      </div>
      <div className="h-px bg-border/60" />
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-8">
          <div className="skeleton h-64 rounded-lg bg-muted/60" />
          <div className="skeleton h-32 rounded-lg bg-muted/60" />
        </div>
        <div className="flex flex-col gap-5 lg:border-l lg:border-border/60 lg:pl-6">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="skeleton h-3 w-14 rounded bg-muted/60" />
              <div className="skeleton h-5 w-24 rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
