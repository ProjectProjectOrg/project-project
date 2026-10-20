import type { LucideIcon } from "lucide-react"
import { MoreHorizontal, Plus } from "lucide-react"
import type { FormEvent, ReactNode } from "react"

import { Badge, type BadgeTone } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@/components/ui/input-group"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export type RoleMeta = Readonly<{
  label: () => string
  icon: LucideIcon
  tone: BadgeTone
}>

export function RoleBadge({ meta }: Readonly<{ meta: RoleMeta }>) {
  const Icon = meta.icon
  return (
    <Badge tone={meta.tone} size="sm">
      <Icon strokeWidth={1.75} />
      {meta.label()}
    </Badge>
  )
}

export function RoleSelect<R extends string>({
  value,
  onChange,
  roles,
  meta
}: Readonly<{
  value: R
  onChange: (role: R) => void
  roles: ReadonlyArray<R>
  meta: Readonly<Record<R, RoleMeta>>
}>) {
  const current = meta[value]
  const Icon = current.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Badge
            tone={current.tone}
            size="sm"
            className="cursor-pointer transition-colors"
            render={
              <button
                type="button"
                data-slot="input-group-control"
                aria-label={m.members_role_select_aria_label({
                  role: current.label()
                })}
              />
            }
          >
            <Icon strokeWidth={1.75} />
            {current.label()}
          </Badge>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-32">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next: R) => onChange(next)}
        >
          {roles.map((role) => {
            const RoleIcon = meta[role].icon
            return (
              <DropdownMenuRadioItem key={role} value={role} closeOnClick>
                <RoleIcon className="size-4" strokeWidth={1.75} />
                {meta[role].label()}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Email + role invite field. State and the mutation stay with the caller;
 *  project and org invites key and report their errors differently. */
export function AddMemberForm({
  email,
  onEmailChange,
  placeholder,
  submitting,
  submitted,
  error,
  roleSelect,
  onSubmit,
  onFocusChange
}: Readonly<{
  email: string
  onEmailChange: (email: string) => void
  placeholder: string
  submitting: boolean
  submitted: boolean
  error: ReactNode
  roleSelect: ReactNode
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  onFocusChange?: (focused: boolean) => void
}>) {
  return (
    <form onSubmit={onSubmit}>
      <InputGroup>
        <InputGroupAddon>
          <Plus className="size-4" strokeWidth={1.75} />
        </InputGroupAddon>
        <InputGroupInput
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          placeholder={placeholder}
          aria-label={m.members_add_email_aria_label()}
          disabled={submitting}
        />
        {roleSelect}
        {error ? (
          <span className="shrink-0 text-xs text-destructive">{error}</span>
        ) : null}
        {!error && submitted ? (
          <span
            className="shrink-0 text-xs text-muted-foreground"
            role="status"
          >
            {m.members_add_success()}
          </span>
        ) : null}
      </InputGroup>
    </form>
  )
}

export function MemberRowLayout({
  leading,
  title,
  titleMuted = false,
  isSelf = false,
  subtitle,
  error,
  pulsing = false,
  children
}: Readonly<{
  leading: ReactNode
  title: ReactNode
  titleMuted?: boolean
  isSelf?: boolean
  subtitle: ReactNode
  error?: ReactNode
  pulsing?: boolean
  children: ReactNode
}>) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2.5 pr-3 pl-3",
        pulsing && "animate-pulse"
      )}
    >
      {leading}
      <div className="min-w-0 flex-1 leading-tight">
        <div
          className={cn(
            "truncate text-sm font-medium",
            titleMuted && "text-muted-foreground"
          )}
        >
          {title}
          {isSelf && (
            <span className="ml-2 text-[10px] text-muted-foreground">
              {m.members_self_indicator()}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        {error ? (
          <div className="text-xs text-destructive" role="alert">
            {error}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export function PendingInviteRow({
  email,
  role,
  pulsing,
  menu
}: Readonly<{
  email: string
  role: RoleMeta
  pulsing?: boolean
  menu: ReactNode
}>) {
  const initial = email.trim().charAt(0).toUpperCase() || "?"
  return (
    <MemberRowLayout
      leading={
        <div className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-border font-mono text-xs text-muted-foreground">
          {initial}
        </div>
      }
      title={email}
      titleMuted
      subtitle={m.members_pending_detail()}
      pulsing={pulsing}
    >
      <Badge tone="muted" size="sm">
        {m.members_pending_badge()}
      </Badge>
      <RoleBadge meta={role} />
      {menu}
    </MemberRowLayout>
  )
}

/** Keeps the role badges aligned on rows the viewer has no actions for. */
export function MemberMenuSpacer() {
  return <span className="size-8 shrink-0" />
}

export function MemberMenuTrigger({ label }: Readonly<{ label: string }>) {
  return (
    <DropdownMenuTrigger
      render={
        <button
          type="button"
          aria-label={label}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal className="size-4" strokeWidth={1.75} />
        </button>
      }
    />
  )
}

/** The inline "are you sure" step that replaces a member menu's items. */
export function MemberMenuConfirm({
  prompt,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel
}: Readonly<{
  prompt: ReactNode
  confirmLabel: string
  busy: boolean
  error?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}>) {
  return (
    <div className="flex flex-col gap-2 p-1">
      <p className="px-2 pt-1 text-xs text-muted-foreground">{prompt}</p>
      {error ? (
        <p className="px-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-1 px-1 pb-1">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="flex-1 rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground transition-all duration-100 hover:bg-destructive/90 active:scale-[0.97] disabled:opacity-50"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-all duration-100 hover:bg-hover hover:text-foreground active:scale-[0.97]"
        >
          {m.common_cancel_button()}
        </button>
      </div>
    </div>
  )
}
