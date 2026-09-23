import { cleanup, fireEvent, render } from "@testing-library/react"
import { useEffect, useState } from "react"
import { afterEach, expect, it, vi } from "vitest"

import { SectionBody } from "./SectionBody"

afterEach(cleanup)

it("pauses hidden subscriptions and preserves local state while receiving new data", () => {
  const renderContent = vi.fn<() => void>()
  const subscribe = vi.fn<() => void>()
  const unsubscribe = vi.fn<() => void>()
  function Content({ title }: Readonly<{ title: string }>) {
    renderContent()
    const [value, setValue] = useState(0)
    useEffect(() => {
      subscribe()
      return unsubscribe
    }, [])
    return (
      <button onClick={() => setValue(value + 1)}>
        {title}: {value}
      </button>
    )
  }
  const view = render(
    <SectionBody collapsed>
      <Content title="Old order" />
    </SectionBody>
  )
  expect(subscribe).not.toHaveBeenCalled()
  expect(view.queryByRole("button")).toBeNull()
  view.rerender(
    <SectionBody collapsed={false}>
      <Content title="Old order" />
    </SectionBody>
  )
  fireEvent.click(view.getByRole("button"))
  expect(view.getByRole("button").textContent).toBe("Old order: 1")
  expect(subscribe).toHaveBeenCalledTimes(1)
  view.rerender(
    <SectionBody collapsed>
      <Content title="Old order" />
    </SectionBody>
  )
  expect(unsubscribe).toHaveBeenCalledTimes(1)
  const rendersBeforeUpdate = renderContent.mock.calls.length
  view.rerender(
    <SectionBody collapsed>
      <Content title="New order" />
    </SectionBody>
  )
  expect(subscribe).toHaveBeenCalledTimes(1)
  expect(renderContent).toHaveBeenCalledTimes(rendersBeforeUpdate)
  expect(view.queryByRole("button")).toBeNull()
  view.rerender(
    <SectionBody collapsed={false}>
      <Content title="New order" />
    </SectionBody>
  )
  expect(view.getByRole("button").textContent).toBe("New order: 1")
  expect(subscribe).toHaveBeenCalledTimes(2)
})
