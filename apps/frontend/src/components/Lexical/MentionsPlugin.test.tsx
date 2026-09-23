import { RegistryContext } from "@effect/atom-react"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { afterEach, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { MentionScopeProvider } from "@/mentions/scope"

import { MentionsPlugin } from "./MentionsPlugin"

vi.mock("@lexical/react/LexicalTypeaheadMenuPlugin", async (original) => ({
  ...(await original<
    typeof import("@lexical/react/LexicalTypeaheadMenuPlugin")
  >()),
  LexicalTypeaheadMenuPlugin: ({
    triggerFn,
    onQueryChange,
    options
  }: {
    triggerFn: (text: string) => { matchingString: string } | null
    onQueryChange: (query: string | null) => void
    options: ReadonlyArray<{ key: string }>
  }) => (
    <div>
      <input
        aria-label="Mention query"
        onChange={(event) =>
          onQueryChange(triggerFn(event.target.value)?.matchingString ?? null)
        }
      />
      {options.map((option) => (
        <span key={option.key}>{option.key}</span>
      ))}
    </div>
  )
}))

afterEach(() => {
  cleanup()
})

const fetchStub = stubFetch()

it("debounces mention queries, cancels superseded searches, and rejects late results", async () => {
  const registry = Registry.make()
  const abort = vi.spyOn(AbortController.prototype, "abort")
  const requests = new Map<
    string,
    {
      resolve: (response: Response) => void
    }
  >()
  fetchStub.set((input: RequestInfo | URL) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    )
    return new Promise<Response>((resolve) => {
      requests.set(url.searchParams.get("q") ?? "", {
        resolve
      })
    })
  })
  try {
    render(
      <RegistryContext.Provider value={registry}>
        <MentionScopeProvider scope={{ orgSlug: "org", slug: "project" }}>
          <LexicalComposer
            initialConfig={{
              namespace: "mention-test",
              onError: (error) => {
                throw error
              }
            }}
          >
            <MentionsPlugin />
          </LexicalComposer>
        </MentionScopeProvider>
      </RegistryContext.Provider>
    )
    const input = screen.getByRole("textbox")
    expect(requests.size).toBe(0)
    fireEvent.change(input, { target: { value: "#ear" } })
    fireEvent.change(input, { target: { value: "#early" } })
    expect(requests.size).toBe(0)
    await waitFor(() => expect([...requests.keys()]).toEqual(["early"]))
    abort.mockClear()
    fireEvent.change(input, { target: { value: "#latest" } })
    await waitFor(() => expect(abort).toHaveBeenCalled())
    await waitFor(() =>
      expect([...requests.keys()]).toEqual(["early", "latest"])
    )
    const ticket = (id: string, title: string) => ({
      id,
      title,
      status: "todo",
      type: "feat",
      priority: "med",
      tags: [],
      branch: null,
      pr: null,
      prState: null,
      lastTransitionedPr: null,
      gitState: { tag: "no_branch" },
      assignees: [],
      archivedAt: null,
      createdBy: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    })
    await act(async () =>
      requests
        .get("latest")
        ?.resolve(Response.json([ticket("T-2", "Latest result")]))
    )
    await screen.findByText("ticket:T-2")
    await act(async () =>
      requests
        .get("early")
        ?.resolve(Response.json([ticket("T-1", "Early result")]))
    )
    expect(screen.queryByText("ticket:T-1")).toBeNull()
    expect(screen.getByText("ticket:T-2")).toBeTruthy()
    fireEvent.change(input, { target: { value: "plain text" } })
    expect(screen.queryByText("ticket:T-2")).toBeNull()
  } finally {
    cleanup()
    registry.dispose()
    abort.mockRestore()
  }
})
