import type { ReactNode } from "react"

import { Logo, Wordmark } from "@/components/shell/Logo"
import { DitherShell } from "@/components/ui/dither-shell"

export function OauthShell({
  title,
  children
}: Readonly<{
  title: string
  children?: ReactNode
}>) {
  return (
    <DitherShell>
      <div className="relative flex flex-col items-center gap-4 px-8 pt-10 pb-2 text-foreground">
        <div className="relative flex size-16 items-center justify-center rounded-2xl bg-primary corner-squircle">
          <Logo className="size-10" inverted />
        </div>
        <Wordmark className="h-5 w-auto" />
      </div>
      <div className="relative flex flex-col items-center gap-5 px-8 pt-6 pb-8">
        <h1 className="text-base font-medium text-foreground">{title}</h1>
        {children}
      </div>
    </DitherShell>
  )
}
