import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { expect, it } from "vitest"

import { focusWhileLiveIsStale, liveFresh } from "./liveFreshness"

const returnToTab = () => window.dispatchEvent(new Event("visibilitychange"))

it("signals a return to the tab only while live updates are not keeping data fresh", () => {
  const registry = AtomRegistry.make()
  const unmount = registry.mount(focusWhileLiveIsStale)
  const signal = () => registry.get(focusWhileLiveIsStale)
  try {
    const initial = signal()
    returnToTab()
    const whileStale = signal()
    expect(whileStale).not.toBe(initial)

    registry.set(liveFresh, true)
    returnToTab()
    expect(signal()).toBe(whileStale)

    registry.set(liveFresh, false)
    returnToTab()
    expect(signal()).not.toBe(whileStale)
  } finally {
    unmount()
    registry.dispose()
  }
})
