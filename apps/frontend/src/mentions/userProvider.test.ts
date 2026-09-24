import { it } from "@effect/vitest"
import { UserId } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { expect, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { me } from "@/features/auth/atoms/auth"

import { userProvider } from "./userProvider"

const userId = Schema.decodeSync(UserId)
const fetchStub = stubFetch()

it.effect(
  "reuses cached identity for repeated mentions and matches supplied members without requests",
  () =>
    Effect.acquireUseRelease(
      Effect.sync(() => Registry.make()),
      (registry) => {
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
          userProvider({ ...scope, members })
            .search(q)
            .pipe(Effect.provideService(Registry.AtomRegistry, registry))
        const member = {
          id: userId("member-1"),
          name: "Wouter",
          username: "wvh",
          email: "wouter@example.com",
          image: null,
          role: "developer" as const
        }
        return Effect.gen(function* () {
          yield* Registry.getResult(registry, me())
          expect(yield* search("lu")).toEqual([
            { id: "user-1", label: "Luuk", image: null }
          ])
          expect(yield* search("user-1")).toHaveLength(1)
          expect(yield* search("missing")).toEqual([])
          for (const q of ["wouter", "wvh", "example.com"]) {
            expect(yield* search(q, [member])).toEqual([
              {
                id: "member-1",
                label: "Wouter",
                secondary: member.email,
                image: null
              }
            ])
          }
          expect(fetch).toHaveBeenCalledOnce()
        })
      },
      (registry) => Effect.sync(() => registry.dispose())
    )
)
