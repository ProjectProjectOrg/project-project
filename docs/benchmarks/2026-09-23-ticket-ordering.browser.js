await(async () => {
  if (location.hostname !== "localhost") throw new Error("Local diagnosis only")
  const picker = () => document.querySelector('button[aria-label^="Ordering:"]')
  if (!picker()) throw new Error("Open View options before running this probe")
  const originalLabel = picker().textContent.trim()
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const listText = () =>
    [...document.querySelectorAll("[data-virtual-rows]")]
      .map((element) => element.textContent)
      .join("|")
  const menuItem = async (label) => {
    if (!document.querySelector('[role="menuitem"]')) {
      picker().click()
      await pause(150)
    }
    const item = [...document.querySelectorAll('[role="menuitem"]')].find(
      (element) => element.textContent === label
    )
    if (!item) throw new Error(`Ordering option unavailable: ${label}`)
    return item
  }
  performance.setResourceTimingBufferSize(5000)
  performance.clearResourceTimings()
  const longTasks = []
  const taskObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      longTasks.push({ start: entry.startTime, duration: entry.duration })
    }
  })
  taskObserver.observe({ type: "longtask", buffered: false })
  const results = []
  let observer
  try {
    for (const label of [
      "Title",
      "Updated",
      "ID",
      "Created",
      "Priority",
      "Title"
    ]) {
      const item = await menuItem(label)
      const before = listText()
      const changes = []
      const start = performance.now()
      observer = new MutationObserver(() => {
        if (listText() !== before) changes.push(performance.now() - start)
      })
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true
      })
      item.click()
      await pause(900)
      observer.disconnect()
      results.push({
        label,
        changes,
        longTasks: longTasks
          .filter((entry) => entry.start >= start)
          .map((entry) => ({
            start: entry.start - start,
            duration: entry.duration
          })),
        requests: performance
          .getEntriesByType("resource")
          .filter(
            (entry) =>
              entry.startTime >= start &&
              new URL(entry.name).pathname.startsWith("/api/")
          )
          .map((entry) => ({
            endpoint: new URL(entry.name).pathname.split("/").pop(),
            start: entry.startTime - start,
            duration: entry.duration,
            ttfb: entry.responseStart - entry.requestStart,
            end: entry.responseEnd - start
          }))
      })
    }
    return results
  } finally {
    observer?.disconnect()
    taskObserver.disconnect()
    if (picker()?.textContent.trim() !== originalLabel) {
      ;(await menuItem(originalLabel)).click()
      await pause(900)
    }
  }
})()
