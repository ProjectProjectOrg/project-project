import { Link, type LinkProps } from "@tanstack/react-router"
import { ChevronLeft } from "lucide-react"
import { useId, type ReactNode } from "react"

import {
  LIBRARY_GRID_CLASS,
  LibrarySectionHeader
} from "@/components/Library/LibrarySection"
import {
  IntegrationLogo,
  type IntegrationKind
} from "@/components/settings/IntegrationLogo"
import { IntegrationPreview } from "@/components/settings/IntegrationPreview"
import { Badge, type BadgeTone } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export type IntegrationTone = "connected" | "attention" | "idle"

const BADGE_TONE: Readonly<Record<IntegrationTone, BadgeTone>> = {
  connected: "emerald",
  attention: "amber",
  idle: "muted"
}

export function IntegrationStatus({
  tone,
  label
}: Readonly<{ tone: IntegrationTone; label: ReactNode }>) {
  return (
    <Badge tone={BADGE_TONE[tone]} size="xs" className="max-w-full">
      <span className="truncate">{label}</span>
    </Badge>
  )
}

export function IntegrationCard({
  kind,
  name,
  description,
  tone,
  status,
  action,
  ...link
}: Readonly<{
  kind: IntegrationKind
  name: string
  description: string
  tone: IntegrationTone
  status: ReactNode | null
  action: string
}> &
  LinkProps) {
  return (
    <div className="group/reveal relative isolate flex flex-col gap-2 rounded-[14px] bg-surface-3 p-3 shadow-surface-1 transition-[background-color,box-shadow] hover:bg-surface-4 hover:shadow-surface-1-hover has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring">
      <span className="flex items-center gap-2">
        <IntegrationLogo kind={kind} size="sm" />
        <Link
          {...link}
          className="min-w-0 flex-1 truncate text-sm leading-snug font-medium outline-none after:absolute after:inset-0 after:z-10 after:rounded-[14px] after:content-['']"
        >
          {name}
        </Link>
        {status === null ? null : (
          <IntegrationStatus tone={tone} label={status} />
        )}
      </span>
      <span className="text-xs text-foreground/80">{description}</span>
      <IntegrationPreview kind={kind} />
      <span className="mt-auto flex min-h-6 items-center">
        <Button
          variant="raised"
          size="xs"
          render={<span aria-hidden />}
          className="opacity-0 transition-opacity group-hover/reveal:opacity-100 group-has-[a:focus-visible]/reveal:opacity-100"
        >
          {action}
        </Button>
      </span>
    </div>
  )
}

export function IntegrationGrid({
  title,
  description,
  children
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-2xl bg-surface-1 p-4"
    >
      <LibrarySectionHeader
        id={headingId}
        title={title}
        description={description}
      />
      <div className={LIBRARY_GRID_CLASS}>{children}</div>
    </section>
  )
}

export type IntegrationMetaItem = Readonly<{ label: string; value: ReactNode }>

export function IntegrationDetail({
  orgSlug,
  kind,
  name,
  description,
  actions,
  about,
  meta,
  children
}: Readonly<{
  orgSlug: string
  kind: IntegrationKind
  name: string
  description: string
  actions?: ReactNode
  about?: ReactNode
  meta: ReadonlyArray<IntegrationMetaItem>
  children?: ReactNode
}>) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          to="/orgs/$orgSlug/settings/integrations"
          params={{ orgSlug }}
          className="-ml-1 inline-flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-3.5" strokeWidth={1.75} />
          {m.org_settings_integrations_tab()}
        </Link>
        <header className="flex flex-wrap items-center gap-4">
          <IntegrationLogo kind={kind} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </header>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="flex min-w-0 flex-col gap-8">
          {about ? (
            <p className="max-w-prose text-[13px] leading-6 text-muted-foreground">
              {about}
            </p>
          ) : null}
          {children}
        </div>
        <aside className="flex flex-col gap-4 text-xs lg:pt-0.5">
          {meta.map((item) => (
            <MetaEntry key={item.label} label={item.label}>
              {item.value}
            </MetaEntry>
          ))}
        </aside>
      </div>
    </div>
  )
}

function MetaEntry({
  label,
  children
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  )
}
