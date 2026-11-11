import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
  createBoardKeyboardNavigation,
  type BoardKeyboardColumn
} from "./boardKeyboard"

const cleanups: Array<() => void> = []
const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView"
)

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn<HTMLElement["scrollIntoView"]>()
  })
})

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  if (scrollIntoViewDescriptor)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      scrollIntoViewDescriptor
    )
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
})

function card(id: string) {
  const element = document.createElement("article")
  element.dataset.boardCard = id
  const link = document.createElement("a")
  link.href = `#${id}`
  link.dataset.rowLink = ""
  link.textContent = id
  const assignee = document.createElement("button")
  assignee.textContent = "Assignee"
  const priority = document.createElement("button")
  priority.textContent = "Priority"
  element.append(link, assignee, priority)
  return { element, link, assignee, priority }
}

function column(status: string, ids: ReadonlyArray<string>) {
  const element = document.createElement("section")
  element.dataset.boardColumn = status
  const header = document.createElement("button")
  header.dataset.columnHeader = ""
  header.textContent = status
  const viewport = document.createElement("div")
  viewport.dataset.slot = "scroll-area-viewport"
  viewport.tabIndex = 0
  const cards = ids.map(card)
  viewport.append(...cards.map((item) => item.element))
  element.append(header, viewport)
  return { element, header, viewport, cards }
}

function setup() {
  const before = document.createElement("button")
  const board = document.createElement("div")
  const after = document.createElement("button")
  const todo = column("todo", ["T-1", "T-2"])
  const done = column("done", ["T-3"])
  board.append(todo.element, done.element)
  document.body.append(before, board, after)
  const columns = new Map<string, BoardKeyboardColumn>([
    ["todo", { ticketIds: ["T-1", "T-2"], reveal: () => {} }],
    ["done", { ticketIds: ["T-3"], reveal: () => {} }]
  ])
  const navigation = createBoardKeyboardNavigation(board, columns)
  board.addEventListener("keydown", navigation.onKeyDown)
  cleanups.push(() => {
    board.removeEventListener("keydown", navigation.onKeyDown)
    navigation.dispose()
  })
  const first = todo.cards[0]
  const second = todo.cards[1]
  const third = done.cards[0]
  if (!first || !second || !third) throw new Error("Missing fixture cards")
  return {
    board,
    before,
    after,
    todo,
    done,
    columns,
    navigation,
    first,
    second,
    third
  }
}

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init
  })
  document.activeElement?.dispatchEvent(event)
  return event
}

const tabStops = (board: HTMLElement) =>
  Array.from(board.querySelectorAll<HTMLElement>('[tabindex="0"]'))

it("exposes one board entry and remembers the last focused card after leaving", () => {
  const { board, first, second, after } = setup()
  expect(tabStops(board)).toEqual([first.link])
  first.link.focus()
  press("ArrowDown")
  expect(document.activeElement).toBe(second.link)
  expect(press("Tab").defaultPrevented).toBe(false)
  after.focus()
  expect(tabStops(board)).toEqual([second.link])
})

it("moves between columns at the same card index, clamped to a shorter column", () => {
  const { second, third, first } = setup()
  second.link.focus()
  press("ArrowRight")
  expect(document.activeElement).toBe(third.link)
  press("ArrowLeft")
  expect(document.activeElement).toBe(first.link)
})

it("reaches column headers and columns without cards using arrows", () => {
  const { board, first, todo } = setup()
  const empty = column("empty", [])
  board.append(empty.element)
  first.link.focus()
  press("ArrowUp")
  expect(document.activeElement).toBe(todo.header)
  press("ArrowDown")
  expect(document.activeElement).toBe(first.link)
  press("ArrowRight")
  press("ArrowRight")
  expect(document.activeElement).toBe(empty.header)
  press("ArrowDown")
  expect(document.activeElement).toBe(empty.header)
})

it("enters card controls with F2 and returns to the card with Escape", () => {
  const { board, first } = setup()
  first.link.focus()
  press("F2")
  expect(document.activeElement).toBe(first.assignee)
  expect(tabStops(board)).toEqual([first.assignee, first.priority])
  expect(press("ArrowDown").defaultPrevented).toBe(false)
  first.priority.focus()
  press("Escape")
  expect(document.activeElement).toBe(first.link)
  expect(tabStops(board)).toEqual([first.link])
})

it("leaves Enter and Shift+F10 available to the ticket link and context menu", () => {
  const { first } = setup()
  first.link.focus()
  expect(press("Enter").defaultPrevented).toBe(false)
  expect(press("F10", { shiftKey: true }).defaultPrevented).toBe(false)
})

it("reveals an unmounted card before transferring focus to it", async () => {
  const { todo, columns, first } = setup()
  const distant = card("T-9")
  columns.set("todo", {
    ticketIds: ["T-1", "T-9"],
    reveal: () => {
      queueMicrotask(() => todo.viewport.append(distant.element))
    }
  })
  first.link.focus()
  press("ArrowDown")
  await vi.waitFor(() => expect(document.activeElement).toBe(distant.link))
})

it("returns focus to the header if the active ticket disappears", async () => {
  const { first, todo, columns } = setup()
  first.link.focus()
  columns.set("todo", { ticketIds: ["T-2"], reveal: () => {} })
  first.element.remove()
  await vi.waitFor(() => expect(document.activeElement).toBe(todo.header))
})

it("includes controls mounted while interacting with a card and restores tab stops on cleanup", async () => {
  const { board, navigation, first, todo } = setup()
  first.link.focus()
  press("F2")
  const extra = document.createElement("button")
  first.element.append(extra)
  await vi.waitFor(() => expect(tabStops(board)).toContain(extra))
  navigation.dispose()
  expect(first.assignee.hasAttribute("tabindex")).toBe(false)
  expect(todo.viewport.tabIndex).toBe(0)
})

it("makes column retry actions reachable through the header controls", () => {
  const { todo, first } = setup()
  const retry = document.createElement("button")
  todo.viewport.append(retry)
  first.link.focus()
  press("ArrowUp")
  press("F2")
  expect(document.activeElement).toBe(retry)
  press("Escape")
  expect(document.activeElement).toBe(todo.header)
})
