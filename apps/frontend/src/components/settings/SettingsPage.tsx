import type { ReactNode } from "react"

import { PageHeader } from "@/components/page"

type SettingsPageProps = Readonly<{
  heading?: string
  description?: string
  children: ReactNode
}>

export function SettingsPage({
  heading,
  description,
  children
}: SettingsPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      {heading ? (
        <PageHeader>
          <h1>{heading}</h1>
          <p>{description}</p>
        </PageHeader>
      ) : null}
      <div className="flex w-full flex-col gap-8">{children}</div>
    </div>
  )
}
