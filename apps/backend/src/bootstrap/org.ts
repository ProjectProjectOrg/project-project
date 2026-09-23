import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

export type BootstrapOrgRecord = {
  readonly id: string
  readonly slug: string
  readonly name: string
}

export type BootstrapUserRecord = {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly username: string | null
}

export type BootstrapMemberRecord = {
  readonly id: string
  readonly organizationId: string
  readonly userId: string
  readonly role: string
}

export type BootstrapOrgInput = {
  readonly orgSlug: string
  readonly orgName: string
  readonly ownerEmail: string
  readonly ownerName: string
  readonly ownerUsername: string | null
}

export class BootstrapOrgError extends Data.TaggedError("BootstrapOrgError")<{
  readonly cause: unknown
}> {}

export type BootstrapOrgStore = {
  readonly findOrgBySlug: (
    slug: string
  ) => Effect.Effect<BootstrapOrgRecord | null, BootstrapOrgError>
  readonly createOrg: (input: {
    slug: string
    name: string
  }) => Effect.Effect<BootstrapOrgRecord, BootstrapOrgError>
  readonly findUserByEmail: (
    email: string
  ) => Effect.Effect<BootstrapUserRecord | null, BootstrapOrgError>
  readonly createUser: (input: {
    email: string
    name: string
    username: string | null
  }) => Effect.Effect<BootstrapUserRecord, BootstrapOrgError>
  readonly findMember: (input: {
    organizationId: string
    userId: string
  }) => Effect.Effect<BootstrapMemberRecord | null, BootstrapOrgError>
  readonly createMember: (input: {
    organizationId: string
    userId: string
    role: "owner"
  }) => Effect.Effect<BootstrapMemberRecord, BootstrapOrgError>
  readonly updateMemberRole: (input: {
    memberId: string
    role: "owner"
  }) => Effect.Effect<void, BootstrapOrgError>
  readonly setUserLastActiveOrg: (input: {
    userId: string
    organizationId: string
  }) => Effect.Effect<void, BootstrapOrgError>
}

export type BootstrapOrgResult = {
  readonly org: BootstrapOrgRecord
  readonly owner: BootstrapUserRecord
  readonly membership: BootstrapMemberRecord
  readonly created: {
    readonly org: boolean
    readonly owner: boolean
    readonly membership: boolean
  }
}

export function bootstrapOrg(
  store: BootstrapOrgStore,
  input: BootstrapOrgInput
): Effect.Effect<BootstrapOrgResult, BootstrapOrgError> {
  return Effect.gen(function* () {
    let createdOrg = false
    let org = yield* store.findOrgBySlug(input.orgSlug)
    if (!org) {
      org = yield* store.createOrg({ slug: input.orgSlug, name: input.orgName })
      createdOrg = true
    }

    let createdOwner = false
    let owner = yield* store.findUserByEmail(input.ownerEmail)
    if (!owner) {
      owner = yield* store.createUser({
        email: input.ownerEmail,
        name: input.ownerName,
        username: input.ownerUsername
      })
      createdOwner = true
    }

    let createdMembership = false
    let membership = yield* store.findMember({
      organizationId: org.id,
      userId: owner.id
    })
    if (!membership) {
      membership = yield* store.createMember({
        organizationId: org.id,
        userId: owner.id,
        role: "owner"
      })
      createdMembership = true
    } else if (membership.role !== "owner") {
      yield* store.updateMemberRole({ memberId: membership.id, role: "owner" })
      membership = { ...membership, role: "owner" }
    }

    yield* store.setUserLastActiveOrg({
      userId: owner.id,
      organizationId: org.id
    })

    return {
      org,
      owner,
      membership,
      created: {
        org: createdOrg,
        owner: createdOwner,
        membership: createdMembership
      }
    }
  })
}
