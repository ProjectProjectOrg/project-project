import * as Effect from "effect/Effect"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { expect, it, vi } from "vitest"
import { UserId } from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import { me } from "@/atoms/auth"
import { userProvider } from "./userProvider"

const userId = Schema.decodeSync(UserId)
const fetchStub = stubFetch()

it("reuses cached identity for repeated mentions and matches supplied members without requests", async () => {
  const registry = Registry.make()
  const fetch = vi.fn(async () =>
    Response.json({
      id: "user-1",
      name: "Luuk",
      username: "luuk",
      email: "luuk@example.com",
      image: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      activeOrgSlug: "org",
      editorPreference: "github",
      personalGithub: { connected: false },
      personalEverhour: {
        connected: false,
        everhourUserId: null,
        name: null,
        email: null,
        lastVerifiedAt: null,
        lastCheckError: null
      }
    })
  )
  fetchStub.set(fetch)
  const scope = { orgSlug: "org", slug: "project" }
  const search = (q: string, members?: (typeof member)[]) =>
    Effect.runPromise(
      userProvider({ ...scope, members })
        .search(q)
        .pipe(Effect.provideService(Registry.AtomRegistry, registry))
    )
  const member = {
    id: userId("member-1"),
    name: "Wouter",
    username: "wvh",
    email: "wouter@example.com",
    image: null,
    role: "member" as const
  }
  try {
    await Effect.runPromise(Registry.getResult(registry, me()))
    expect(await search("lu")).toEqual([
      { id: "user-1", label: "Luuk", image: null }
    ])
    expect(await search("user-1")).toHaveLength(1)
    expect(await search("missing")).toEqual([])
    for (const q of ["wouter", "wvh", "example.com"]) {
      expect(await search(q, [member])).toEqual([
        {
          id: "member-1",
          label: "Wouter",
          secondary: member.email,
          image: null
        }
      ])
    }
    expect(fetch).toHaveBeenCalledOnce()
  } finally {
    registry.dispose()
  }
})
