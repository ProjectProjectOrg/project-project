export function TicketPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-9 items-center gap-1.5 px-2">
          <div className="size-4 skeleton rounded bg-muted/60" />
          <div className="h-3 w-8 skeleton rounded bg-muted/60" />
        </div>
      </div>
      <header className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <div className="h-7 w-1/2 skeleton rounded bg-muted/60" />
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-12 skeleton rounded bg-muted/60" />
            <div className="h-6 w-20 skeleton rounded-md bg-muted/60" />
          </div>
        </div>
      </header>
      <div className="-mt-3 grid grid-cols-1 gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="rounded-lg border border-transparent px-3 py-2">
            <div className="min-h-[8rem] skeleton rounded-lg bg-muted/60" />
          </div>
          <div className="mt-8 space-y-4">
            <div className="flex h-7 items-center gap-2">
              <div className="size-4 skeleton rounded bg-muted/60" />
              <div className="h-4 w-28 skeleton rounded bg-muted/60" />
            </div>
            <div className="rounded-md border border-border px-3 py-1.5">
              <div className="min-h-[1.5rem] skeleton rounded bg-muted/60" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:pl-5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="h-4 w-14 skeleton rounded bg-muted/60" />
              <div className="h-6 w-24 skeleton rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
