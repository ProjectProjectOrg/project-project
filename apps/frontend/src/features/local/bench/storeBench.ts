import type { TicketFact } from "@pp/shared"

import {
  applyEdit,
  changesFor,
  generate,
  randomEdits,
  referenceViews,
  STATUSES,
  type Views
} from "./benchData"
import { type BenchStore, openSqliteStore } from "./sqliteBench"
import { openTanstackStore } from "./tanstackBench"

const stores: Record<string, () => Promise<BenchStore>> = {
  sqlite: () => openSqliteStore(false),
  "sqlite+index": () => openSqliteStore(true),
  "tanstack-db": openTanstackStore
}

const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value !== null && typeof value === "object"
      ? `{${Object.keys(value)
          .toSorted()
          .map(
            (key) =>
              `${key}:${canonical((value as Record<string, unknown>)[key])}`
          )
          .join(",")}}`
      : JSON.stringify(value)

const until = (store: BenchStore, expected: Views, timeout: number) =>
  new Promise<void>((resolve, reject) => {
    const want = canonical(expected)
    const matches = () => {
      const views = store.views()
      return views !== null && canonical(views) === want
    }
    if (matches()) return resolve()
    // @effect-diagnostics-next-line globalTimers:off
    const timer = setTimeout(() => {
      stop()
      reject(
        new Error(
          `views did not converge: ${canonical(store.views()).slice(0, 300)}`
        )
      )
    }, timeout)
    const stop = store.onChange(() => {
      if (!matches()) return
      clearTimeout(timer)
      stop()
      resolve()
    })
  })

const longTasks: Array<number> = []
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) longTasks.push(entry.duration)
}).observe({ type: "longtask", buffered: false })
const drainLongTasks = () => {
  const tasks = longTasks.splice(0)
  return {
    count: tasks.length,
    total: Math.round(tasks.reduce((a, b) => a + b, 0)),
    max: Math.round(Math.max(0, ...tasks))
  }
}

const stallMeter = () => {
  let last = performance.now()
  let worst = 0
  let running = true
  const channel = new MessageChannel()
  channel.port1.onmessage = () => {
    const now = performance.now()
    worst = Math.max(worst, now - last)
    last = now
    if (running) channel.port2.postMessage(null)
  }
  channel.port2.postMessage(null)
  return () => {
    running = false
    channel.port1.close()
    return Math.round(worst)
  }
}

const nextTask = () =>
  new Promise<void>((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })

const percentile = (values: ReadonlyArray<number>, p: number) => {
  const sorted = values.toSorted((a, b) => a - b)
  return Math.round(
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
  )
}

const heap = () => {
  ;(globalThis as { gc?: () => void }).gc?.()
  const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory
  return memory === undefined
    ? null
    : Math.round(memory.usedJSHeapSize / 2 ** 20)
}

const run = async (size: number, storeName: string, changes = 20) => {
  const snapshot = generate(size)
  const facts = new Map<string, TicketFact>(
    snapshot.tickets.map((t) => [t.id, t])
  )
  const heapBefore = heap()
  const store = await stores[storeName]!()
  drainLongTasks()
  const loadStall = stallMeter()
  const loadStart = performance.now()
  await store.apply(snapshot)
  const write = Math.round(performance.now() - loadStart)
  await until(store, referenceViews(snapshot.tickets, snapshot.groups), 300_000)
  const load = Math.round(performance.now() - loadStart)
  await nextTask()
  const loadTasks = drainLongTasks()
  const loadStallMs = loadStall()
  const heapAfter = heap()

  const trips: Array<number> = []
  for (let i = 0; i < 20; i++) {
    const t = performance.now()
    await store.roundTrip()
    trips.push(performance.now() - t)
  }

  const latencies: Array<number> = []
  const changeStall = stallMeter()
  for (let i = 0; i < changes; i++) {
    const visible = store.views()?.sections.todo ?? []
    const id = visible[i % visible.length] ?? "T-1"
    const current = facts.get(id)!
    const next = {
      ...current,
      status:
        STATUSES[
          (STATUSES.indexOf(current.status as never) + 1) % STATUSES.length
        ]!
    }
    facts.set(id, next)
    const expected = referenceViews([...facts.values()], snapshot.groups)
    const t = performance.now()
    await store.apply(changesFor(`1.${i + 1}`, [next], []))
    await until(store, expected, 30_000)
    latencies.push(performance.now() - t)
    await nextTask()
  }
  const changeTasks = drainLongTasks()
  const changeStallMs = changeStall()
  await store.dispose()
  return {
    store: storeName,
    size,
    loadMs: load,
    writeMs: write,
    loadLongTasks: loadTasks,
    heapMb:
      heapAfter === null || heapBefore === null ? null : heapAfter - heapBefore,
    roundTripMs: { p50: percentile(trips, 0.5), p95: percentile(trips, 0.95) },
    changeMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: Math.round(Math.max(...latencies))
    },
    changeLongTasks: changeTasks,
    worstStallMs: { load: loadStallMs, change: changeStallMs }
  }
}

const parity = async (size: number, storeName: string, count: number) => {
  const snapshot = generate(size, 3)
  const facts = new Map<string, TicketFact>(
    snapshot.tickets.map((t) => [t.id, t])
  )
  const store = await stores[storeName]!()
  await store.apply(snapshot)
  await until(store, referenceViews(snapshot.tickets, snapshot.groups), 60_000)
  let applied = 0
  for (const [index, edit] of randomEdits(snapshot, count).entries()) {
    const next = applyEdit(facts, edit)
    if (next === null) facts.delete(edit.id)
    else facts.set(edit.id, next)
    await store.apply(
      changesFor(
        `1.${index + 1}`,
        next === null ? [] : [next],
        next === null ? [edit.id] : []
      )
    )
    await until(
      store,
      referenceViews([...facts.values()], snapshot.groups),
      10_000
    )
    applied++
  }
  await store.dispose()
  return { store: storeName, size, edits: applied, matched: true }
}

Object.assign(globalThis, { storeBench: { run, parity } })
document.getElementById("out")!.textContent = "loaded"
