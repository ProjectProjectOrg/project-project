import { EmailAddress } from "@pp/shared"
import * as Schema from "effect/Schema"

export type PeopleChoice = Readonly<{
  jiraAccountId: string
  projectProjectUserId: string | null | undefined
  inviteEmail?: string
}>

export const UNLINKED_VALUE = "__unlinked__"
export const NEW_INVITE_VALUE = "__invite_new__"
const INVITE_PREFIX = "invite:"

const isEmailAddress = Schema.is(EmailAddress)

const normalizedInvite = (email: string) => {
  const trimmed = email.trim().toLowerCase()
  return isEmailAddress(trimmed) ? trimmed : null
}

export const inviteValue = (email: string) => `${INVITE_PREFIX}${email}`

export function peopleSelectValue(choice: PeopleChoice): string | null {
  if (choice.projectProjectUserId === undefined) return null
  if (choice.projectProjectUserId !== null) return choice.projectProjectUserId
  if (choice.inviteEmail === undefined) return UNLINKED_VALUE
  const email = normalizedInvite(choice.inviteEmail)
  return email === null ? NEW_INVITE_VALUE : inviteValue(email)
}

export function applyPeopleSelection(
  choice: PeopleChoice,
  value: string
): PeopleChoice {
  const { inviteEmail: _inviteEmail, ...rest } = choice
  if (value === UNLINKED_VALUE) return { ...rest, projectProjectUserId: null }
  if (value === NEW_INVITE_VALUE)
    return { ...rest, projectProjectUserId: null, inviteEmail: "" }
  if (value.startsWith(INVITE_PREFIX))
    return {
      ...rest,
      projectProjectUserId: null,
      inviteEmail: value.slice(INVITE_PREFIX.length)
    }
  return { ...rest, projectProjectUserId: value }
}

export function invitedEmails(
  choices: ReadonlyArray<PeopleChoice>
): ReadonlyArray<string> {
  return [
    ...new Set(
      choices.flatMap((choice) => {
        if (choice.inviteEmail === undefined) return []
        const email = normalizedInvite(choice.inviteEmail)
        return email === null ? [] : [email]
      })
    )
  ].toSorted()
}
