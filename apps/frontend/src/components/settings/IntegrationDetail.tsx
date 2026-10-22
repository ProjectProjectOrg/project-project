import { Link, type LinkProps } from "@tanstack/react-router"
import { ArrowRight, ChevronLeft } from "lucide-react"
import type { ReactNode } from "react"

import {
  IntegrationLogo,
  type IntegrationKind
} from "@/components/settings/IntegrationLogo"
import { Badge, type BadgeTone } from "@/components/ui/badge"
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
  ...link
}: Readonly<{
  kind: IntegrationKind
  name: string
  description: string
  tone: IntegrationTone
  status: string | null
}> &
  LinkProps) {
  return (
    <Link
      {...link}
      className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-start justify-between gap-2">
        <IntegrationLogo kind={kind} />
        <ArrowRight
          className="size-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
          strokeWidth={1.75}
        />
      </span>
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-medium">{name}</span>
        <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      {status === null ? null : (
        <span className="flex">
          <IntegrationStatus tone={tone} label={status} />
        </span>
      )}
    </Link>
  )
}

export function IntegrationCardSkeleton() {
  return (
    <div className="h-[10rem] animate-pulse rounded-lg border border-border bg-card" />
  )
}

export const INTEGRATION_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3"

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
