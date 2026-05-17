import { getTestInstance } from "better-auth/test"
import { magicLinkClient, organizationClient } from "better-auth/client/plugins"
import { organization } from "better-auth/plugins"
import { describe, expect, it, vi } from "vitest"
import { auth } from "./auth"

describe("Better Auth plugin wiring", () => {
  it("signs users in through a magic link and marks the email verified", async () => {
    const magicLinkPlugin = configuredPlugin("magic-link")
    const writes: Array<string> = []
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk))
        return true
      })

    try {
      const { client, customFetchImpl, db } = await getTestInstance(
        { plugins: [magicLinkPlugin] },
        {
          disableTestUser: true,
          clientOptions: { plugins: [magicLinkClient()] }
        }
      )

      const { data, error } = await client.signIn.magicLink({
        email: "invited@example.com",
        callbackURL: "/"
      })

      expect(error).toBeNull()
      expect(data?.status).toBe(true)

      const verificationUrl = writes.join("").match(/url=(?<url>\S+)/)
        ?.groups?.url
      expect(verificationUrl).toContain("/magic-link/verify")

      const response = await customFetchImpl(verificationUrl!, {
        redirect: "manual"
      })
      expect(response.status).toBeGreaterThanOrEqual(300)
      expect(response.status).toBeLessThan(400)

      const user = await db.findOne<{ emailVerified: boolean }>({
        model: "user",
        where: [{ field: "email", value: "invited@example.com" }],
        select: ["emailVerified"]
      })
      expect(user?.emailVerified).toBe(true)
    } finally {
      writeSpy.mockRestore()
    }
  })

  it("rejects invite acceptance when the signed-in recipient email is not verified", async () => {
    const organizationPlugin = organization({
      requireEmailVerificationOnInvitation: true
    })
    const { client, signInWithTestUser, signInWithUser } =
      await getTestInstance(
        {
          plugins: [organizationPlugin],
          emailAndPassword: {
            enabled: true,
            requireEmailVerification: false
          }
        },
        { clientOptions: { plugins: [organizationClient()] } }
      )

    const owner = await signInWithTestUser()
    let invitationId: string | undefined

    await owner.runWithUser(async () => {
      const { data: organization, error: createError } =
        await client.organization.create({
          name: "Demo",
          slug: "demo"
        })
      expect(createError).toBeNull()

      const { data: invitation, error: inviteError } =
        await client.organization.inviteMember({
          email: "invited@example.com",
          role: "member",
          organizationId: organization!.id
        })
      expect(inviteError).toBeNull()
      invitationId = invitation!.id
    })

    await client.signUp.email({
      email: "invited@example.com",
      password: "password123",
      name: "Invited User"
    })

    const invited = await signInWithUser("invited@example.com", "password123")
    const { error } = await client.organization.acceptInvitation({
      invitationId: invitationId!,
      fetchOptions: { headers: invited.headers }
    })

    expect(error?.message).toBe(
      "Email verification required before accepting or rejecting invitation"
    )
  })

  it("exposes the organization plugin endpoints", () => {
    expect(typeof auth.api.createOrganization).toBe("function")
    expect(typeof auth.api.listOrganizations).toBe("function")
    expect(typeof auth.api.createInvitation).toBe("function")
    expect(typeof auth.api.acceptInvitation).toBe("function")
    expect(typeof auth.api.setActiveOrganization).toBe("function")
  })

  it("disables public self-serve organization creation", () => {
    const orgPlugin = auth.options.plugins?.find(
      (plugin) => plugin.id === "organization"
    )
    expect(orgPlugin?.options?.allowUserToCreateOrganization).toBe(false)
  })

  it("links new social sign-ins to existing users by email", () => {
    expect(auth.options.account?.accountLinking?.enabled).toBe(true)
    expect(auth.options.account?.accountLinking?.trustedProviders).toContain(
      "github"
    )
  })

  it("exposes the admin plugin endpoints", () => {
    expect(typeof auth.api.listUsers).toBe("function")
    expect(typeof auth.api.setRole).toBe("function")
    expect(typeof auth.api.banUser).toBe("function")
    expect(typeof auth.api.impersonateUser).toBe("function")
  })
})

function configuredPlugin(id: string) {
  const plugin = auth.options.plugins?.find((plugin) => plugin.id === id)
  if (!plugin) throw new Error(`Missing Better Auth plugin: ${id}`)
  return plugin
}
