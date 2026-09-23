;(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const tasks = []
  const taskObserver = new PerformanceObserver((l) =>
    l
      .getEntries()
      .forEach((e) => tasks.push({ start: e.startTime, duration: e.duration }))
  )
  taskObserver.observe({ type: "longtask" })
  performance.setResourceTimingBufferSize(5000)
  performance.clearResourceTimings()
  const results = []
  try {
    for (const label of [
      "Title",
      "Updated",
      "ID",
      "Created",
      "Priority",
      "Title",
      "Updated",
      "ID",
      "Created",
      "Priority"
    ]) {
      document.querySelector('button[aria-label^="Ordering:"]').click()
      await sleep(120)
      const item = [...document.querySelectorAll('[role="menuitem"]')].find(
        (e) => e.textContent === label
      )
      let labelChanged = null
      let maxTimerDelay = 0
      let last = performance.now()
      const timer = setInterval(() => {
        const now = performance.now()
        maxTimerDelay = Math.max(maxTimerDelay, now - last - 10)
        last = now
      }, 10)
      const start = performance.now()
      const observer = new MutationObserver(() => {
        if (
          labelChanged === null &&
          document.querySelector('button[aria-label^="Ordering:"]')
            ?.textContent === label
        )
          labelChanged = performance.now() - start
      })
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true
      })
      item.click()
      const clickMs = performance.now() - start
      await sleep(650)
      observer.disconnect()
      clearInterval(timer)
      results.push({
        label,
        labelChanged,
        clickMs,
        maxTimerDelay,
        longTasks: tasks
          .filter((e) => e.start >= start)
          .map((e) => ({ start: e.start - start, duration: e.duration })),
        requests: performance
          .getEntriesByType("resource")
          .filter(
            (e) =>
              e.startTime >= start &&
              new URL(e.name).pathname.startsWith("/api/")
          )
          .map((e) => ({
            endpoint: new URL(e.name).pathname.split("/").pop(),
            duration: e.duration,
            end: e.responseEnd - start
          })),
        mountedRows: [
          ...document.querySelectorAll("[data-virtual-rows]")
        ].reduce((s, e) => s + Number(e.dataset.mountedRows), 0)
      })
    }
    return results
  } finally {
    taskObserver.disconnect()
  }
})()
