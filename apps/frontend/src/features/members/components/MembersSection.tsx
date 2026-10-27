import * as Exit from "effect/Exit"
import { Crown, LogOut, Trash2 } from "lucide-react"
import { motion } from "motion/react"
import { useState, type FormEvent, type ReactNode } from "react"

import { SettingsGroup } from "@/components/shell/settings/SettingsSection"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu"
import {
  MemberAvatar,
  type AvatarSubject
} from "@/features/members/components/MemberAvatar"
import {
  AddMemberForm,
  MemberMenuSpacer,
  MemberMenuTrigger,
  MemberRowLayout,
  PendingInviteRow,
  RoleBadge,
  RoleSelect,
  type RoleMeta
} from "@/features/members/components/MemberList"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

export type MemberConfirm = Readonly<{
  prompt: ReactNode
  label: string
  busyLabel: string
  run: () => Promise<Exit.Exit<unknown, unknown>>
  waiting: boolean
  error: ReactNode
}>

export type MemberMenuModel<A extends string> = Readonly<{
  assign: ReadonlyArray<Readonly<{ role: A; label: string }>>
  changeRole: (role: A) => void
  transfer: MemberConfirm | null
  exit: (MemberConfirm & Readonly<{ kind: "remove" | "leave" }>) | null
}>

export type InviteModel<A extends string> = Readonly<{
  submit: (role: A) => Promise<Exit.Exit<unknown, unknown>>
  waiting: boolean
  error: ReactNode
}>

export function MembersSection({
  renderAdd,
  footer,
  children
}: Readonly<{
  renderAdd?: (onFocusChange: (focused: boolean) => void) => ReactNode
  footer?: ReactNode
  children: ReactNode
}>) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      {renderAdd?.(setAdding)}

      <SettingsGroup
        render={
          <motion.ul
            animate={{ opacity: adding ? 0.35 : 1 }}
            transition={transitions.presence}
          />
        }
      >
        {children}
      </SettingsGroup>

      {footer}
    </div>
  )
}

export function AddMemberRow<A extends string>({
  email,
  onEmailChange,
  invite,
  roles,
  assignable,
  defaultRole,
  placeholder,
  onFocusChange
}: Readonly<{
  email: string
  onEmailChange: (email: string) => void
  invite: InviteModel<A>
  roles: Readonly<Record<A, RoleMeta>>
  assignable: ReadonlyArray<A>
  defaultRole: A
  placeholder: string
  onFocusChange: (focused: boolean) => void
}>) {
  const [role, setRole] = useState<A>(defaultRole)
  const [submitted, setSubmitted] = useState(false)
  const [attempted, setAttempted] = useState<string | null>(null)
  const trimmed = email.trim()

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || invite.waiting) return
    onFocusChange(false)
    setSubmitted(false)
    setAttempted(trimmed)
    const exit = await invite.submit(role)
    if (Exit.isSuccess(exit)) {
      onEmailChange("")
      setSubmitted(true)
    }
  }

  return (
    <AddMemberForm
      email={email}
      onEmailChange={(next) => {
        onEmailChange(next)
        setSubmitted(false)
      }}
      placeholder={placeholder}
      submitting={invite.waiting}
      submitted={submitted}
      error={attempted === trimmed ? invite.error : null}
      roleSelect={
        <RoleSelect
          value={role}
          onChange={setRole}
          roles={assignable}
          meta={roles}
        />
      }
      onSubmit={onSubmit}
      onFocusChange={onFocusChange}
    />
  )
}

export function MemberRowView<R extends string, A extends R>({
  roles,
  avatar,
  title,
  subtitle,
  isSelf,
  role,
  error,
  pulsing = false,
  menu
}: Readonly<{
  roles: Readonly<Record<R, RoleMeta>>
  avatar: AvatarSubject
  title: ReactNode
  subtitle: ReactNode
  isSelf: boolean
  role: R
  error: ReactNode
  pulsing?: boolean
  menu: MemberMenuModel<A>
}>) {
  return (
    <li>
      <MemberRowLayout
        leading={<MemberAvatar member={avatar} size={32} />}
        title={title}
        isSelf={isSelf}
        subtitle={subtitle}
        error={error ?? menu.exit?.error ?? menu.transfer?.error}
        pulsing={pulsing}
      >
        <RoleBadge meta={roles[role]} />
        <MemberMenu roles={roles} menu={menu} />
      </MemberRowLayout>
    </li>
  )
}

function MemberMenu<R extends string, A extends R>({
  roles,
  menu
}: Readonly<{
  roles: Readonly<Record<R, RoleMeta>>
  menu: MemberMenuModel<A>
}>) {
  const { assign, transfer, exit } = menu
  if (assign.length === 0 && transfer === null && exit === null)
    return <MemberMenuSpacer />

  return (
    <DropdownMenu>
      <MemberMenuTrigger label={m.members_actions_aria_label()} />
      <DropdownMenuContent align="end" sideOffset={6} className="w-60">
        <ConfirmButton.Root bare>
          <ConfirmButton.Idle>
            {assign.map(({ role, label }) => {
              const RoleIcon = roles[role].icon
              return (
                <DropdownMenuItem
                  key={role}
                  onClick={() => menu.changeRole(role)}
                  className="cursor-pointer"
                >
                  <RoleIcon className="size-4" strokeWidth={1.75} />
                  {label}
                </DropdownMenuItem>
              )
            })}
            {transfer && (
              <ConfirmButton.MenuItem
                confirm="transfer"
                closeOnClick={false}
                className="cursor-pointer"
              >
                <Crown className="size-4" strokeWidth={1.75} />
                {transfer.label}
              </ConfirmButton.MenuItem>
            )}
            {(assign.length > 0 || transfer) && exit && (
              <DropdownMenuSeparator />
            )}
            {exit && (
              <ConfirmButton.MenuItem
                confirm="exit"
                closeOnClick={false}
                variant="destructive"
              >
                {exit.kind === "leave" ? (
                  <LogOut className="size-4" strokeWidth={1.75} />
                ) : (
                  <Trash2 className="size-4" strokeWidth={1.75} />
                )}
                {exit.label}
              </ConfirmButton.MenuItem>
            )}
          </ConfirmButton.Idle>
          {transfer && (
            <MenuConfirm
              when="transfer"
              confirm={{ ...transfer, error: null }}
            />
          )}
          {exit && (
            <MenuConfirm when="exit" confirm={{ ...exit, error: null }} />
          )}
        </ConfirmButton.Root>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuConfirm({
  when,
  confirm
}: Readonly<{ when: string; confirm: MemberConfirm }>) {
  return (
    <ConfirmButton.Confirm when={when} className="block">
      <ConfirmButton.Action
        layout="menu"
        prompt={confirm.prompt}
        label={confirm.label}
        busyLabel={confirm.busyLabel}
        waiting={confirm.waiting}
        error={confirm.error}
        onConfirm={confirm.run}
      />
    </ConfirmButton.Confirm>
  )
}

export function PendingRowView<R extends string>({
  roles,
  email,
  role,
  pulsing = false,
  cancel
}: Readonly<{
  roles: Readonly<Record<R, RoleMeta>>
  email: string
  role: R
  pulsing?: boolean
  cancel: MemberConfirm | null
}>) {
  return (
    <li>
      <PendingInviteRow
        email={email}
        role={roles[role]}
        pulsing={pulsing}
        menu={
          cancel === null ? (
            <MemberMenuSpacer />
          ) : (
            <DropdownMenu>
              <MemberMenuTrigger
                label={m.members_pending_actions_aria_label()}
              />
              <DropdownMenuContent align="end" sideOffset={6} className="w-52">
                <ConfirmButton.Root bare>
                  <ConfirmButton.Idle>
                    <ConfirmButton.MenuItem
                      closeOnClick={false}
                      variant="destructive"
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} />
                      {cancel.label}
                    </ConfirmButton.MenuItem>
                  </ConfirmButton.Idle>
                  <MenuConfirm when="default" confirm={cancel} />
                </ConfirmButton.Root>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />
    </li>
  )
}
