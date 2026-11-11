import { Suspense, use, useLayoutEffect, useRef, type ReactNode } from "react"

const never = new Promise<never>(() => {})

function Suspend(): null {
  use(never)
  return null
}

export function Freeze({
  frozen,
  children
}: Readonly<{ frozen: boolean; children: ReactNode }>) {
  const shell = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (frozen) shell.current?.style.removeProperty("display")
  }, [frozen])
  return (
    <Suspense>
      {frozen && <Suspend />}
      <div
        ref={(node) => {
          if (node !== null) shell.current = node
        }}
        className="contents"
      >
        {children}
      </div>
    </Suspense>
  )
}
