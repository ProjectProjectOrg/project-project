import { CircleAlert } from "lucide-react"
import type { ReactNode } from "react"

import { m } from "@/paraglide/messages"

export function MappingTable({
  sourceLabel,
  targetLabel,
  countLabel,
  empty,
  children
}: Readonly<{
  sourceLabel: string
  targetLabel: string
  countLabel?: string
  empty: boolean
  children: ReactNode
}>) {
  const counted = countLabel !== undefined
  return (
    <table className="-ml-7 w-[calc(100%+1.75rem)] table-fixed border-separate border-spacing-y-1 text-[13px]">
      <colgroup>
        <col className="w-7" />
        <col />
        {counted ? <col className="w-36" /> : null}
        <col className="w-60" />
      </colgroup>
      <thead className="sticky top-11 z-10 bg-region">
        <tr className="h-7 text-left text-xs text-muted-foreground">
          <th aria-hidden />
          <th className="pr-3 font-normal">{sourceLabel}</th>
          {counted ? (
            <th className="pr-3 text-right font-normal">{countLabel}</th>
          ) : null}
          <th className="font-normal">{targetLabel}</th>
        </tr>
      </thead>
      <tbody>
        {empty ? (
          <tr>
            <td aria-hidden />
            <td
              colSpan={counted ? 3 : 2}
              className="py-2 text-muted-foreground"
            >
              {m.jira_import_filter_empty()}
            </td>
          </tr>
        ) : (
          children
        )}
      </tbody>
    </table>
  )
}

export function MappingTableRow({
  attention,
  name,
  context,
  count,
  countTitle,
  children
}: Readonly<{
  attention: boolean
  name: ReactNode
  context?: ReactNode
  count?: string | null
  countTitle?: string
  children: ReactNode
}>) {
  return (
    <tr className="h-7">
      <td className="align-middle text-foreground">
        {attention ? (
          <span className="flex justify-center">
            <CircleAlert
              className="size-3.5"
              strokeWidth={1.75}
              aria-label={m.jira_import_row_attention()}
            />
          </span>
        ) : null}
      </td>
      <td className="pr-3 align-middle">
        <span className="flex min-w-0 items-baseline gap-2 text-foreground">
          <span className="truncate">{name}</span>
          {context === undefined || context === null ? null : (
            <span className="truncate text-xs text-muted-foreground">
              {context}
            </span>
          )}
        </span>
      </td>
      {count === undefined ? null : (
        <td
          title={countTitle}
          className="truncate pr-3 text-right align-middle text-xs text-muted-foreground tabular-nums"
        >
          {count}
        </td>
      )}
      <td className="align-middle">{children}</td>
    </tr>
  )
}

export function OptionLabel({
  icon,
  children
}: Readonly<{ icon: ReactNode; children: ReactNode }>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="grid size-4 shrink-0 place-items-center text-muted-foreground">
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </span>
  )
}
