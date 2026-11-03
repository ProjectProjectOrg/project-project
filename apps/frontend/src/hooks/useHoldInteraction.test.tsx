import { RegistryContext } from "@effect/atom-react"
import { cleanup, renderHook } from "@testing-library/react"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import type { ReactNode } from "react"
import { afterEach, expect, it } from "vitest"

import { openInteractions } from "@/lib/interactions"

import { useHoldInteraction } from "./useHoldInteraction"

afterEach(cleanup)

it("counts each active holder once and releases it when it goes inactive or unmounts", () => {
  const registry = AtomRegistry.make()
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <RegistryContext.Provider value={registry}>
      {children}
    </RegistryContext.Provider>
  )
  const menu = renderHook(({ active }) => useHoldInteraction(active), {
    wrapper,
    initialProps: { active: false }
  })
  const drag = renderHook(() => useHoldInteraction(true), { wrapper })
  expect(registry.get(openInteractions)).toBe(1)

  menu.rerender({ active: true })
  expect(registry.get(openInteractions)).toBe(2)

  menu.rerender({ active: false })
  expect(registry.get(openInteractions)).toBe(1)

  drag.unmount()
  expect(registry.get(openInteractions)).toBe(0)
})
