import { RegistryContext } from "@effect/atom-react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { afterEach, beforeAll, expect, it, vi } from "vitest"
import { Slug, User, UserInvitation } from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import { m } from "@/paraglide/messages"
import { Route } from "@/routes/welcome"

const { setActive } = vi.hoisted(() => ({
  setActive: vi.fn(() => Promise.resolve({ data: {}, error: null }))
}))

vi.mock("@/services/AuthClient", () => ({
  authClient: { organization: { setActive } }
}))

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Navigate: () => null,
  useNavigate: () => navigate
}))

const navigate = vi.fn(() => Promise.resolve())

const viewer = {
  id: Schema.decodeSync(User.fields.id)("user-1"),
  email: "ada@example.com",
  name: "Ada",
  username: null,
  image: null,
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  activeOrgSlug: null,
  personalGithub: { connected: false },
  editorPreference: "github",
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
} satisfies User

const invitation = {
  id: "invitation-1",
  orgSlug: Schema.decodeSync(Slug)("acme"),
  orgName: "Acme",
  role: "member",
  inviterEmail: "owner@example.com",
  expiresAt: DateTime.toDate(DateTime.makeUnsafe("2026-12-01T00:00:00.000Z")),
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-09-01T00:00:00.000Z"))
} satisfies UserInvitation

const pathOf = (input: RequestInfo | URL) =>
  new URL(
    input instanceof Request ? input.url : String(input),
    "http://localhost"
  ).pathname

const encodeUser = Schema.encodeSync(User)
const encodeInvitations = Schema.encodeSync(Schema.Array(UserInvitation))
const fetchStub = stubFetch()

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  )
})

afterEach(() => {
  cleanup()
  navigate.mockClear()
  setActive.mockClear()
})

function renderWelcome(registry: Registry.AtomRegistry) {
  const Component = Route.options.component
  if (!Component) throw new Error("Missing welcome component")
  return render(
    <RegistryContext.Provider value={registry}>
      <Component />
    </RegistryContext.Provider>
  )
}

it("keeps the invitation on screen while a single accept is joining", async () => {
  let served: ReadonlyArray<UserInvitation> = [invitation]
  let finishAccept = (_response: Response) => {}
  fetchStub.set((input, init) => {
    const path = pathOf(input)
    if (init?.method === "POST") {
      return new Promise<Response>((resolve) => {
        finishAccept = resolve
      })
    }
    return Promise.resolve(
      Response.json(
        path === "/api/me" ? encodeUser(viewer) : encodeInvitations(served)
      )
    )
  })
  const registry = Registry.make()
  try {
    renderWelcome(registry)
    const accept = await screen.findByRole("button", {
      name: m.auth_invites_accept_button()
    })
    accept.click()

    await waitFor(() => expect(accept.getAttribute("disabled")).not.toBeNull())
    expect(screen.queryByText(m.auth_welcome_title())).toBeNull()
    expect(screen.getByText(invitation.orgName)).toBeTruthy()

    served = []
    finishAccept(
      Response.json({ slug: invitation.orgSlug, name: "Acme", role: "member" })
    )

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(setActive).toHaveBeenCalledWith({
      organizationSlug: invitation.orgSlug
    })
    expect(screen.queryByText(m.auth_welcome_title())).toBeNull()
  } finally {
    registry.dispose()
  }
})

it("falls back to the no-access screen when the accept fails", async () => {
  let finishAccept = (_response: Response) => {}
  fetchStub.set((input, init) => {
    const path = pathOf(input)
    if (init?.method === "POST") {
      return new Promise<Response>((resolve) => {
        finishAccept = resolve
      })
    }
    return Promise.resolve(
      Response.json(
        path === "/api/me"
          ? encodeUser(viewer)
          : encodeInvitations([invitation])
      )
    )
  })
  const registry = Registry.make()
  try {
    renderWelcome(registry)
    const accept = await screen.findByRole("button", {
      name: m.auth_invites_accept_button()
    })
    accept.click()
    finishAccept(new Response("nope", { status: 500 }))

    expect(
      await screen.findByText(m.auth_invites_accept_row_error())
    ).toBeTruthy()
    expect(screen.getByText(invitation.orgName)).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  } finally {
    registry.dispose()
  }
})

it("shows the no-access screen once the last invitation is declined", async () => {
  let served: ReadonlyArray<UserInvitation> = [invitation]
  fetchStub.set((input, init) => {
    const path = pathOf(input)
    if (init?.method === "POST") {
      served = []
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    return Promise.resolve(
      Response.json(
        path === "/api/me" ? encodeUser(viewer) : encodeInvitations(served)
      )
    )
  })
  const registry = Registry.make()
  try {
    renderWelcome(registry)
    const decline = await screen.findByRole("button", {
      name: m.auth_invites_decline_button()
    })
    decline.click()

    expect(await screen.findByText(m.auth_welcome_title())).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  } finally {
    registry.dispose()
  }
})
