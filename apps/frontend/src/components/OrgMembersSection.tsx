import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type {
  OrgAssignableRole,
  OrgInvitation,
  OrgMember,
  OrgRole
} from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import { Crown, LogOut, ShieldCheck, Trash2, UserRound } from "lucide-react"
import { motion } from "motion/react"
import { useState, type FormEvent } from "react"

import { MemberAvatar } from "@/components/MemberAvatar"
import {
  AddMemberForm,
  MemberMenuConfirm,
  MemberMenuSpacer,
  MemberMenuTrigger,
  MemberRowLayout,
  PendingInviteRow,
  RoleBadge,
  RoleSelect,
  type RoleMeta
} from "@/components/members/MemberList"
import { SettingsGroup } from "@/components/settings/SettingsSection"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu"
import {
  cancelInvitation,
  inviteMember,
  leaveOrg,
  orgRequest,
  removeMember,
  transferOwnership,
  updateMemberRole
} from "@/features/organizations/atoms/orgs"
import { useOrgActor } from "@/lib/access"
import { orgActionErrorFromExit, type OrgActionError } from "@/lib/orgErrors"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

const ROLE_META: Record<OrgRole, RoleMeta> = {
  owner: { label: () => m.members_role_owner(), icon: Crown, tone: "muted" },
  admin: {
    label: () => m.members_role_admin(),
    icon: ShieldCheck,
    tone: "muted"
  },
  member: {
    label: () => m.members_role_member(),
    icon: UserRound,
    tone: "muted"
  },
  guest: {
    label: () => m.members_role_guest(),
    icon: UserRound,
    tone: "muted"
  }
}
const ASSIGNABLE_ROLES = [
  "admin",
  "member"
] satisfies ReadonlyArray<OrgAssignableRole>

export function OrgMembersSection({
  orgSlug,
  orgName,
  members,
  invitations,
  callerRole,
  callerUserId
}: {
  orgSlug: string
  orgName: string
  members: ReadonlyArray<OrgMember>
  invitations: ReadonlyArray<OrgInvitation>
  callerRole: OrgRole
  callerUserId: string
}) {
  const canManage = useOrgActor(orgSlug).call("org", "inviteMember")
  const ownerCount = members.filter((member) => member.role === "owner").length
  const isLastOwner = callerRole === "owner" && ownerCount <= 1
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
        <AddMemberRow orgSlug={orgSlug} onFocusChange={setAdding} />
      )}

      <SettingsGroup
        render={
          <motion.ul
            animate={{ opacity: adding ? 0.35 : 1 }}
            transition={transitions.presence}
          />
        }
      >
        {members.map((member) => (
          <li key={member.userId}>
            <MemberRow
              orgSlug={orgSlug}
              orgName={orgName}
              member={member}
              callerRole={callerRole}
              callerUserId={callerUserId}
              ownerCount={ownerCount}
            />
          </li>
        ))}
        {invitations.map((invitation) => (
          <li key={invitation.id}>
            <PendingInviteRow
              email={invitation.email}
              role={ROLE_META[invitation.role]}
              menu={
                canManage ? (
                  <InvitationMenu orgSlug={orgSlug} invitation={invitation} />
                ) : (
                  <MemberMenuSpacer />
                )
              }
            />
          </li>
        ))}
      </SettingsGroup>

      {isLastOwner && (
        <p className="text-xs text-muted-foreground">
          {m.org_members_last_owner_note()}
        </p>
      )}
    </div>
  )
}

function AddMemberRow({
  orgSlug,
  onFocusChange
}: {
  orgSlug: string
  onFocusChange?: (focused: boolean) => void
}) {
  const req = orgRequest(orgSlug)
  const invite = useAtomSet(inviteMember(req), { mode: "promiseExit" })
  const inviteState = useAtomValue(inviteMember(req))
  const submitting = inviteState.waiting
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<OrgAssignableRole>("member")
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<OrgActionError | null>(null)
  const trimmed = email.trim()

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    onFocusChange?.(false)
    setSubmitted(false)
    setError(null)
    const exit = await invite({ email: trimmed, role })
    if (Exit.isSuccess(exit)) {
      setEmail("")
      setSubmitted(true)
    } else {
      setError(orgActionErrorFromExit(exit))
    }
  }

  return (
    <AddMemberForm
      email={email}
      onEmailChange={(next) => {
        setEmail(next)
        setSubmitted(false)
        setError(null)
      }}
      placeholder={m.org_members_invite_placeholder()}
      submitting={submitting}
      submitted={submitted}
      error={error?.message}
      roleSelect={
        <RoleSelect
          value={role}
          onChange={setRole}
          roles={ASSIGNABLE_ROLES}
          meta={ROLE_META}
        />
      }
      onSubmit={onSubmit}
      onFocusChange={onFocusChange}
    />
  )
}

function MemberRow({
  orgSlug,
  orgName,
  member,
  callerRole,
  callerUserId,
  ownerCount
}: {
  orgSlug: string
  orgName: string
  member: OrgMember
  callerRole: OrgRole
  callerUserId: string
  ownerCount: number
}) {
  return (
    <MemberRowLayout
      leading={<MemberAvatar member={member} size={32} />}
      title={member.name || member.email}
      isSelf={member.userId === callerUserId}
      subtitle={member.email}
    >
      <RoleBadge meta={ROLE_META[member.role]} />
      <MemberMenu
        orgSlug={orgSlug}
        orgName={orgName}
        member={member}
        callerRole={callerRole}
        callerUserId={callerUserId}
        ownerCount={ownerCount}
      />
    </MemberRowLayout>
  )
}

function InvitationMenu({
  orgSlug,
  invitation
}: {
  orgSlug: string
  invitation: OrgInvitation
}) {
  const key = { req: orgRequest(orgSlug), invitationId: invitation.id }
  const cancel = useAtomSet(cancelInvitation(key), { mode: "promiseExit" })
  const cancelState = useAtomValue(cancelInvitation(key))
  const canceling = cancelState.waiting
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<OrgActionError | null>(null)

  async function onCancelInvite() {
    setError(null)
    const exit = await cancel(undefined)
    if (Exit.isSuccess(exit)) {
      setConfirming(false)
    } else {
      setError(orgActionErrorFromExit(exit))
    }
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          setConfirming(false)
          setError(null)
        }
      }}
    >
      <MemberMenuTrigger label={m.members_pending_actions_aria_label()} />
      <DropdownMenuContent align="end" sideOffset={6} className="w-52">
        {confirming ? (
          <MemberMenuConfirm
            prompt={m.members_pending_cancel_confirm_prompt({
              email: invitation.email
            })}
            confirmLabel={
              canceling
                ? m.members_pending_cancel_in_progress()
                : m.members_pending_cancel_button()
            }
            busy={canceling}
            error={orgErrorText(error)}
            onConfirm={() => void onCancelInvite()}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => setConfirming(true)}
            variant="destructive"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            {m.members_pending_cancel_button()}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type Confirm =
  | { kind: "remove" }
  | { kind: "transfer" }
  | { kind: "leave" }
  | null

function MemberMenu({
  orgSlug,
  orgName,
  member,
  callerRole,
  callerUserId,
  ownerCount
}: {
  orgSlug: string
  orgName: string
  member: OrgMember
  callerRole: OrgRole
  callerUserId: string
  ownerCount: number
}) {
  const req = orgRequest(orgSlug)
  const memberKey = { req, userId: member.userId }
  const isSelf = member.userId === callerUserId
  const navigate = useNavigate()
  const update = useAtomSet(updateMemberRole(memberKey), {
    mode: "promiseExit"
  })
  const remove = useAtomSet(removeMember(memberKey), { mode: "promiseExit" })
  const transfer = useAtomSet(transferOwnership({ req, callerUserId }), {
    mode: "promiseExit"
  })
  const leave = useAtomSet(leaveOrg(req), { mode: "promiseExit" })
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<OrgActionError | null>(null)

  const actor = useOrgActor(orgSlug)
  const isLastOwner = callerRole === "owner" && ownerCount <= 1
  const canChangeRole =
    actor.call("org", "updateMemberRole") && member.role !== "owner" && !isSelf
  const canTransfer =
    actor.call("org", "transferOwnership") && member.role === "admin" && !isSelf
  const canRemove =
    actor.call("org", "removeMember") && !isSelf && member.role !== "owner"
  const canLeave = isSelf && !isLastOwner

  if (!canChangeRole && !canTransfer && !canRemove && !canLeave) {
    return <MemberMenuSpacer />
  }

  async function onRemove() {
    setBusy(true)
    setError(null)
    const exit = await remove(undefined)
    setBusy(false)
    if (Exit.isSuccess(exit)) {
      setConfirm(null)
    } else {
      setError(orgActionErrorFromExit(exit))
    }
  }

  async function onTransfer() {
    setBusy(true)
    setError(null)
    const exit = await transfer({ userId: member.userId })
    setBusy(false)
    if (Exit.isSuccess(exit)) {
      setConfirm(null)
    } else {
      setError(orgActionErrorFromExit(exit))
    }
  }

  async function onLeave() {
    setBusy(true)
    setError(null)
    const exit = await leave(undefined)
    setBusy(false)
    if (Exit.isSuccess(exit)) {
      setConfirm(null)
      void navigate({ to: "/" })
    } else {
      setError(orgActionErrorFromExit(exit))
    }
  }

  async function onUpdateRole(role: OrgAssignableRole) {
    setError(null)
    const exit = await update({ role })
    if (Exit.isFailure(exit)) setError(orgActionErrorFromExit(exit))
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          setConfirm(null)
          setError(null)
        }
      }}
    >
      <MemberMenuTrigger label={m.members_actions_aria_label()} />
      <DropdownMenuContent align="end" sideOffset={6} className="w-60">
        {confirm?.kind === "remove" ? (
          <MemberMenuConfirm
            prompt={m.members_remove_confirm_prompt({
              name: member.name || member.email
            })}
            confirmLabel={
              busy ? m.members_remove_in_progress() : m.members_remove_button()
            }
            busy={busy}
            error={orgErrorText(error)}
            onConfirm={() => void onRemove()}
            onCancel={() => setConfirm(null)}
          />
        ) : confirm?.kind === "transfer" ? (
          <MemberMenuConfirm
            prompt={m.org_members_transfer_confirm_prompt({
              name: member.name || member.email
            })}
            confirmLabel={
              busy
                ? m.org_members_transfer_in_progress()
                : m.org_members_make_owner()
            }
            busy={busy}
            error={orgErrorText(error)}
            onConfirm={() => void onTransfer()}
            onCancel={() => setConfirm(null)}
          />
        ) : confirm?.kind === "leave" ? (
          <MemberMenuConfirm
            prompt={m.org_members_leave_confirm_prompt({ org: orgName })}
            confirmLabel={
              busy
                ? m.org_members_leave_in_progress()
                : m.org_members_leave_button()
            }
            busy={busy}
            error={orgErrorText(error)}
            onConfirm={() => void onLeave()}
            onCancel={() => setConfirm(null)}
          />
        ) : (
          <>
            {canChangeRole &&
              ASSIGNABLE_ROLES.filter((r) => r !== member.role).map((r) => {
                const meta = ROLE_META[r]
                const RIcon = meta.icon
                const makeLabel =
                  r === "admin"
                    ? m.members_make_admin()
                    : m.members_make_member()
                return (
                  <DropdownMenuItem
                    key={r}
                    onClick={() => void onUpdateRole(r)}
                    className="cursor-pointer"
                  >
                    <RIcon className="size-4" strokeWidth={1.75} />
                    {makeLabel}
                  </DropdownMenuItem>
                )
              })}
            {canTransfer && (
              <DropdownMenuItem
                closeOnClick={false}
                onClick={() => setConfirm({ kind: "transfer" })}
                className="cursor-pointer"
              >
                <Crown className="size-4" strokeWidth={1.75} />
                {m.org_members_make_owner()}
              </DropdownMenuItem>
            )}
            {(canChangeRole || canTransfer) && (canRemove || canLeave) && (
              <DropdownMenuSeparator />
            )}
            {canRemove && (
              <DropdownMenuItem
                closeOnClick={false}
                onClick={() => setConfirm({ kind: "remove" })}
                variant="destructive"
              >
                <Trash2 className="size-4" strokeWidth={1.75} />
                {m.members_remove_button()}
              </DropdownMenuItem>
            )}
            {canLeave && (
              <DropdownMenuItem
                closeOnClick={false}
                onClick={() => setConfirm({ kind: "leave" })}
                variant="destructive"
              >
                <LogOut className="size-4" strokeWidth={1.75} />
                {m.org_members_leave_button()}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function orgErrorText(error: OrgActionError | null) {
  if (!error) return null
  return (
    <>
      {error.message}
      {error.projectSlugs && error.projectSlugs.length > 0 ? (
        <span className="font-mono"> {error.projectSlugs.join(", ")}</span>
      ) : null}
    </>
  )
}
