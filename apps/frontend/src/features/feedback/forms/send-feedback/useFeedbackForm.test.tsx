// @vitest-environment jsdom
import { RegistryContext } from "@effect/atom-react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import * as Registry from "effect/reactivity/AtomRegistry"
import type { ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import { useFeedbackForm } from "./useFeedbackForm"

const fetchStub = stubFetch()

let registry: Registry.AtomRegistry
beforeEach(() => {
  registry = Registry.make()
})
const open = (route: string, orgSlug = "org") =>
  renderHook(() => useFeedbackForm(orgSlug, route, () => {}), {
    wrapper: ({ children }: Readonly<{ children: ReactNode }>) => (
      <RegistryContext.Provider value={registry}>
        {children}
      </RegistryContext.Provider>
    )
  })

afterEach(() => {
  cleanup()
  registry.dispose()
})

it("resumes report text and sends it with the original page", async () => {
  const received = vi.fn<(payload: unknown) => void>()
  fetchStub.set(async (input, init) => {
    received(await new Request(input, init).json())
    return new Response(null, { status: 204 })
  })
  const first = open("/tickets/T-1", "acme")
  act(() => {
    const { form } = first.result.current
    form.setFieldValue("kind", "feature")
    form.setFieldValue("title", "Keep the filter")
    form.setFieldValue("description", "1. Set a filter\n2. Open a ticket")
  })
  first.unmount()

  const resumed = open("/board", "acme")
  const { form, initialMarkdown } = resumed.result.current
  expect(initialMarkdown).toBe("1. Set a filter\n2. Open a ticket")
  await act(() => form.handleSubmit())
  expect(received).toHaveBeenCalledWith({
    kind: "feature",
    title: "Keep the filter",
    description: initialMarkdown,
    route: "/tickets/T-1",
    attachmentIds: []
  })
  expect(resumed.result.current.hasDraft).toBe(false)
})

it("resumes an attachment that finished uploading while feedback was closed", async () => {
  let finishUpload!: (response: Response) => void
  const response = new Promise<Response>((resolve) => {
    finishUpload = resolve
  })
  fetchStub.set(() => response)
  const first = open("/original")
  const screenshot = new File(["x"], "steps.png", { type: "image/png" })
  act(() => first.result.current.files.add([screenshot]))
  first.unmount()
  finishUpload(
    Response.json({
      id: "uploaded",
      filename: "steps.png",
      contentType: "image/png",
      byteSize: 1
    })
  )
  const resumed = open("/another-page")
  await waitFor(() =>
    expect(resumed.result.current.files.readyIds).toEqual(["uploaded"])
  )
  expect(resumed.result.current.files.drafts[0]?.file).toBe(screenshot)
  resumed.unmount()
})

it("keeps a failed report until the author discards it", async () => {
  fetchStub.set(async () => new Response(null, { status: 503 }))
  const first = open("/board")
  act(() => first.result.current.form.setFieldValue("title", "Missing ticket"))
  await act(() => first.result.current.form.handleSubmit())
  first.unmount()
  const resumed = open("/tickets")
  expect(resumed.result.current.form.state.values.title).toBe("Missing ticket")
  act(() => resumed.result.current.reset())
  resumed.unmount()
  const fresh = open("/board")
  expect(fresh.result.current.hasDraft).toBe(false)
  expect(fresh.result.current.form.state.values.title).toBe("")
})
