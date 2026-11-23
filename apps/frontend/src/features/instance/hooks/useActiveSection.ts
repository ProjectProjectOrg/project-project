import { useEffect, useState } from "react"

// How far below the top of the screen a section counts as the one you are
// reading: its heading has reached the upper part of the page.
const READING_LINE = 140

// The section you are reading, by element id: the last one whose top has
// passed the reading line, or the first while none has. Once the page has
// scrolled to the end of the last section, that one is it, even when the
// page ends before its top can reach the line.
export function useActiveSection(ids: ReadonlyArray<string>) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)
  const key = ids.join("\n")
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const current = key === "" ? [] : key.split("\n")
      const passed = current.filter((id) => {
        const element = document.getElementById(id)
        return (
          element !== null &&
          element.getBoundingClientRect().top <= READING_LINE
        )
      })
      const lastId = current.at(-1)
      const last = lastId === undefined ? null : document.getElementById(lastId)
      const atEnd =
        passed.length > 0 &&
        last !== null &&
        last.getBoundingClientRect().bottom <= window.innerHeight
      setActive(
        atEnd ? (lastId ?? null) : (passed.at(-1) ?? current[0] ?? null)
      )
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }
    measure()
    const resizes = new ResizeObserver(schedule)
    for (const id of key === "" ? [] : key.split("\n")) {
      const element = document.getElementById(id)
      if (element !== null) resizes.observe(element)
    }
    document.addEventListener("scroll", schedule, {
      capture: true,
      passive: true
    })
    window.addEventListener("resize", schedule)
    return () => {
      cancelAnimationFrame(frame)
      resizes.disconnect()
      document.removeEventListener("scroll", schedule, { capture: true })
      window.removeEventListener("resize", schedule)
    }
  }, [key])
  return active
}
