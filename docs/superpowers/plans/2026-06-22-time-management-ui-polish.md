# Time Management UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static Everhour controls with a compact, motion-backed time-management surface that matches ProjectProject's ticket, sprint, and shell conventions.

**Architecture:** Keep all Effect atoms and state ownership in the existing ticket, sprint, and shell components. Extract one stateless `TimeControls` component to unify the work-type, start/stop, and manual-log disclosure vocabulary; refine `LogTimeForm` and `RunningTimerIndicator` independently because they own form and clock behavior respectively.

**Tech Stack:** React 19, TypeScript, Effect Atom, Tailwind CSS v4, motion/react, Base UI primitives, Vitest, React Testing Library

## Global Constraints

- Keep the existing atoms, API contracts, Everhour behavior, and information architecture intact.
- Do not add packages, global state patterns, API endpoints, or design tokens.
- All user-facing strings must use `time_` Paraglide messages in `packages/frontend/messages/en/time.json`.
- UI chrome remains neutral; do not add decorative color, card shadows, or dither to functional controls.
- Headings, labels, and controls use sentence case.
- Hover color changes include a matching transition utility; buttons use the shared primitive's press feel.
- Use existing transition tokens from `packages/frontend/src/lib/springs.ts`.
- Preserve visible labels, focus-visible behavior, alert semantics, and non-color state cues.
- Do not modify or discard the existing user changes in `packages/backend/src/main.ts` or `.codex/`.

---

### Task 1: Shared compact time controls

**Files:**
- Create: `packages/frontend/src/components/time/TimeControls.tsx`
- Create: `packages/frontend/src/components/time/TimeControls.test.tsx`

**Interfaces:**
- Consumes: `WorkTypeOption`, `WorkTypeSelect`, `Button`, `transitions`, and existing `time_` messages.
- Produces: `TimeControls(props: TimeControlsProps): React.ReactNode`, where `TimeControlsProps` contains `value`, `onValueChange`, `options`, `running`, `busy`, `onStart`, `onStop`, `logOpen`, `onLogOpenChange`, and `children`.

- [ ] **Step 1: Write failing interaction tests**

Create `packages/frontend/src/components/time/TimeControls.test.tsx` with focused tests that mock only the selector implementation and exercise the public controls:

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import { TimeControls } from "./TimeControls"

vi.mock("@/components/time/WorkTypeSelect", () => ({
  WorkTypeSelect: ({ value }: { value: string }) => <span>{value}</span>
}))

const renderControls = (overrides: Partial<ComponentProps<typeof TimeControls>> = {}) => {
  const props: ComponentProps<typeof TimeControls> = {
    value: "development",
    onValueChange: vi.fn(),
    options: [{ key: "development", label: "Development" }],
    running: false,
    busy: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
    logOpen: false,
    onLogOpenChange: vi.fn(),
    children: <div>Manual fields</div>,
    ...overrides
  }
  return { props, ...render(<TimeControls {...props} />) }
}

describe("TimeControls", () => {
  it("starts the selected work type", () => {
    const { props } = renderControls()
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }))
    expect(props.onStart).toHaveBeenCalledOnce()
  })

  it("shows a stop action while running", () => {
    const { props } = renderControls({ running: true })
    fireEvent.click(screen.getByRole("button", { name: "Stop timer" }))
    expect(props.onStop).toHaveBeenCalledOnce()
    expect(screen.queryByRole("button", { name: "Start timer" })).toBeNull()
  })

  it("exposes and toggles manual log disclosure state", () => {
    const onLogOpenChange = vi.fn()
    renderControls({ onLogOpenChange })
    const trigger = screen.getByRole("button", { name: "Log time" })
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(trigger)
    expect(onLogOpenChange).toHaveBeenCalledWith(true)
    expect(screen.queryByText("Manual fields")).toBeNull()
  })

  it("renders disclosed fields and requests close", () => {
    const onLogOpenChange = vi.fn()
    renderControls({ logOpen: true, onLogOpenChange })
    expect(screen.getByText("Manual fields")).not.toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Log time" }))
    expect(onLogOpenChange).toHaveBeenCalledWith(false)
  })
})
```

- [ ] **Step 2: Run the test and confirm the missing component failure**

Run:

```bash
bun --filter @projectproject/frontend test src/components/time/TimeControls.test.tsx
```

Expected: FAIL because `./TimeControls` does not exist.

- [ ] **Step 3: Implement the shared control surface**

Create `packages/frontend/src/components/time/TimeControls.tsx`. Use `Play`, `Square`, and `Clock3` icons through `Button.leadingIcon`. The action row must wrap, the selector must remain the first control, and the disclosed child must use `AnimatePresence initial={false}` with `transitions.layout`:

```tsx
import { AnimatePresence, motion } from "motion/react"
import { Clock3, Play, Square } from "lucide-react"
import type { WorkTypeOption } from "@projectproject/shared"
import { Button } from "@/components/ui/button"
import { WorkTypeSelect } from "@/components/time/WorkTypeSelect"
import { transitions } from "@/lib/springs"
import * as m from "@/paraglide/messages"

export interface TimeControlsProps {
  value: string
  onValueChange: (value: string) => void
  options: ReadonlyArray<WorkTypeOption>
  running: boolean
  busy: boolean
  onStart: () => void
  onStop: () => void
  logOpen: boolean
  onLogOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function TimeControls({
  value,
  onValueChange,
  options,
  running,
  busy,
  onStart,
  onStop,
  logOpen,
  onLogOpenChange,
  children
}: TimeControlsProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <div className="min-w-32 flex-1 sm:max-w-52">
          <WorkTypeSelect
            value={value}
            onChange={onValueChange}
            options={options}
            disabled={running || busy}
          />
        </div>
        {running ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leadingIcon={Square}
            loading={busy}
            onClick={onStop}
          >
            {m.time_stop_button()}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            leadingIcon={Play}
            loading={busy}
            onClick={onStart}
          >
            {m.time_start_button()}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leadingIcon={Clock3}
          aria-expanded={logOpen}
          onClick={() => onLogOpenChange(!logOpen)}
        >
          {m.time_log_button()}
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {logOpen ? (
          <motion.div
            key="manual-log"
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            transition={transitions.layout}
            className="overflow-hidden"
          >
            <div className="pt-1">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
bun --filter @projectproject/frontend test src/components/time/TimeControls.test.tsx
```

Expected: PASS with four tests.

- [ ] **Step 5: Commit the shared component**

```bash
git add packages/frontend/src/components/time/TimeControls.tsx packages/frontend/src/components/time/TimeControls.test.tsx
git commit -m "feat(time): add compact shared timer controls"
```

### Task 2: Refine ticket and sprint time panels

**Files:**
- Modify: `packages/frontend/src/components/time/TicketTimePanel.tsx`
- Modify: `packages/frontend/src/components/time/SprintTimePanel.tsx`
- Modify: `packages/frontend/src/components/TicketPage/TicketPage.tsx`
- Modify: `packages/frontend/messages/en/time.json`

**Interfaces:**
- Consumes: `TimeControls` from Task 1 and the existing timer, work type, profile, and time atoms.
- Produces: Consistent ticket and sprint compositions with unchanged component props and unchanged mutation inputs.

- [ ] **Step 1: Add the section label translation**

Insert the alphabetically positioned key in `packages/frontend/messages/en/time.json`:

```json
"time_section_label": "Time",
```

Change the ticket sidebar callsite in `TicketPage.tsx` from `m.time_tracked_total()` to `m.time_section_label()` so the outer metadata label no longer duplicates the inner total figure.

- [ ] **Step 2: Replace ticket panel actions with `TimeControls`**

In `TicketTimePanel.tsx`, remove direct `Button` and `WorkTypeSelect` imports, import `TimeControls`, and replace the current action row, conditional `LogTimeForm`, and ghost log button with:

```tsx
<TimeControls
  value={effectiveWorkType}
  onValueChange={setWorkType}
  options={options}
  running={running}
  busy={busy}
  onStart={() => void start({ workTypeKey: effectiveWorkType })}
  onStop={() => void stop()}
  logOpen={showLog}
  onLogOpenChange={setShowLog}
>
  <LogTimeForm
    orgSlug={orgSlug}
    slug={slug}
    ticketId={ticket.id}
    options={options}
    defaultWorkType={effectiveWorkType}
    onDone={() => setShowLog(false)}
  />
</TimeControls>
```

Refine the metric row to use `gap-5`, `tabular-nums`, and a stable minimum width. Keep the sync explanation in the same row. Use `transition-colors` rather than `transition-all` on the info trigger because only color changes on hover.

- [ ] **Step 3: Replace sprint panel actions and remove card chrome**

In `SprintTimePanel.tsx`, replace the direct controls and conditional form with `TimeControls` using the sprint atom callbacks:

```tsx
<TimeControls
  value={workType}
  onValueChange={setWorkType}
  options={options}
  running={running}
  busy={busy}
  onStart={() => void start({ workTypeKey: workType })}
  onStop={() => void stop()}
  logOpen={showLog}
  onLogOpenChange={setShowLog}
>
  <LogTimeForm
    orgSlug={orgSlug}
    slug={slug}
    ticketId={null}
    groupId={groupId}
    options={options}
    defaultWorkType={workType}
    onDone={() => setShowLog(false)}
  />
</TimeControls>
```

Change the outer panel class to `flex flex-col gap-2` so it aligns with the sprint header without a nested border or permanent card surface.

- [ ] **Step 4: Compile messages and run frontend checks**

Run:

```bash
bun --filter @projectproject/frontend paraglide:compile
bun --filter @projectproject/frontend typecheck
bun --filter @projectproject/frontend test src/components/time/TimeControls.test.tsx
```

Expected: message compilation succeeds, TypeScript exits 0, and the focused tests pass.

- [ ] **Step 5: Commit both panel integrations**

```bash
git add packages/frontend/src/components/time/TicketTimePanel.tsx packages/frontend/src/components/time/SprintTimePanel.tsx packages/frontend/src/components/TicketPage/TicketPage.tsx packages/frontend/messages/en/time.json packages/frontend/src/paraglide
git commit -m "feat(time): align ticket and sprint timer surfaces"
```

### Task 3: Make manual logging compact and keyboard-efficient

**Files:**
- Create: `packages/frontend/src/components/time/LogTimeForm.test.ts`
- Modify: `packages/frontend/src/components/time/LogTimeForm.tsx`

**Interfaces:**
- Consumes: Existing `LogTimeForm` props and `logTimeAtom` mutation contract.
- Produces: The same `LogTimeForm` API with responsive layout, initial duration focus, and unchanged parsing behavior.

- [ ] **Step 1: Lock down duration parsing behavior**

Create `packages/frontend/src/components/time/LogTimeForm.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { parseDurationToSeconds } from "./LogTimeForm"

describe("parseDurationToSeconds", () => {
  it.each([
    ["90", 5400],
    ["1h 30m", 5400],
    ["1.5h", 5400],
    ["45m", 2700]
  ])("parses %s", (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected)
  })

  it.each(["", "0", "later"])("rejects %s", (input) => {
    expect(parseDurationToSeconds(input)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the parsing tests before layout changes**

Run:

```bash
bun --filter @projectproject/frontend test src/components/time/LogTimeForm.test.ts
```

Expected: PASS, establishing a behavior baseline before editing the form.

- [ ] **Step 3: Implement responsive form layout and focus**

In `LogTimeForm.tsx`:

- Change the form container to `grid grid-cols-1 gap-3 sm:grid-cols-2`.
- Add `autoFocus` to the duration `Input`.
- Keep duration and date as the first row at `sm` widths.
- Give work type and note labels `sm:col-span-2` only when their controls need the full line; keep the note full-width.
- Give the action row and alert paragraphs `sm:col-span-2`.
- Pass `loading={submitting}` to the submit button instead of only disabling it.
- Keep the cancel button disabled during submission.

The resulting action and error blocks must be:

```tsx
<div className="flex items-center gap-1.5 sm:col-span-2">
  <Button type="submit" size="sm" loading={submitting}>
    {m.time_log_submit()}
  </Button>
  {onDone ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onDone}
      disabled={submitting}
    >
      {m.time_cancel()}
    </Button>
  ) : null}
</div>
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
bun --filter @projectproject/frontend test src/components/time/LogTimeForm.test.ts src/components/time/TimeControls.test.tsx
bun --filter @projectproject/frontend typecheck
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit form refinements**

```bash
git add packages/frontend/src/components/time/LogTimeForm.tsx packages/frontend/src/components/time/LogTimeForm.test.ts
git commit -m "feat(time): refine manual time entry"
```

### Task 4: Stabilize and refine the global running timer

**Files:**
- Create: `packages/frontend/src/components/time/RunningTimerIndicator.test.ts`
- Modify: `packages/frontend/src/components/time/RunningTimerIndicator.tsx`

**Interfaces:**
- Consumes: Existing `activeTimerAtom(orgSlug)` and `stopTimerAtom(orgSlug)` contracts.
- Produces: Exported pure `formatClock(seconds: number): string` for testing and the unchanged `RunningTimerIndicator({ orgSlug })` component API.

- [ ] **Step 1: Write clock-format tests**

Create `packages/frontend/src/components/time/RunningTimerIndicator.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { formatClock } from "./RunningTimerIndicator"

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [65, "1:05"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3661, "1:01:01"]
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected)
  })
})
```

- [ ] **Step 2: Run the test and confirm the export failure**

Run:

```bash
bun --filter @projectproject/frontend test src/components/time/RunningTimerIndicator.test.ts
```

Expected: FAIL because `formatClock` is not exported.

- [ ] **Step 3: Replace frame-rate updates with second-level updates**

Export `formatClock`. Replace the `requestAnimationFrame` loop in `useElapsed` with one immediate update plus a one-second interval:

```tsx
function useElapsed(startedAt: Date | null): number {
  const [seconds, setSeconds] = useState(() =>
    startedAt ? elapsedSeconds(startedAt) : 0
  )

  useEffect(() => {
    if (!startedAt) {
      setSeconds(0)
      return
    }
    const update = () => setSeconds(elapsedSeconds(startedAt))
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [startedAt])

  return seconds
}
```

Refine the rendered indicator:

- Add `min-w-0 max-w-full` to the outer wrapper.
- Add `min-w-0` to the content span and `max-w-40 truncate` to the label.
- Keep elapsed time `shrink-0 font-mono text-xs tabular-nums`.
- Use `loading={stopState.waiting}` on the stop button.
- Add `transition-colors` to the outer neutral surface and ticket link.
- Keep the timer icon neutral and use a small `motion.span` entry transition with `transitions.fade`; do not add continuous looping animation.

- [ ] **Step 4: Run clock tests and typecheck**

Run:

```bash
bun --filter @projectproject/frontend test src/components/time/RunningTimerIndicator.test.ts
bun --filter @projectproject/frontend typecheck
```

Expected: clock tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the shell timer refinement**

```bash
git add packages/frontend/src/components/time/RunningTimerIndicator.tsx packages/frontend/src/components/time/RunningTimerIndicator.test.ts
git commit -m "perf(time): refine running timer indicator"
```

### Task 5: Full verification and visual review

**Files:**
- Modify only files from Tasks 1–4 if verification exposes a scoped issue.

**Interfaces:**
- Consumes: Completed ticket, sprint, form, and shell surfaces.
- Produces: A verified implementation with no new lint, formatting, type, accessibility, theme, or responsive regressions.

- [ ] **Step 1: Run the complete automated verification suite**

Run:

```bash
bun --filter @projectproject/frontend test
bun --filter @projectproject/frontend typecheck
bun run lint
bun run format:check
```

Expected: all commands exit 0. Existing failures unrelated to changed files must be reported with their exact command and output; they must not be hidden or worked around by changing unrelated code.

- [ ] **Step 2: Start the existing development environment**

Run:

```bash
bun run dev
```

Expected: frontend and backend development servers start using the repository's existing configuration. Do not change ports or environment architecture as part of this UI task.

- [ ] **Step 3: Review the ticket surface in the browser**

Open a ticket assigned to a sprint and verify:

- Time totals align with the ticket metadata rail and do not duplicate the outer label.
- Work type, start/stop, and log actions wrap without overlap at desktop and narrow widths.
- The log form opens and closes smoothly, focuses duration, closes after success, and remains usable by keyboard.
- Start, stop, and log buttons expose hover, focus, active, disabled, and loading states.
- No control introduces decorative color, shadow, or nested card chrome.

- [ ] **Step 4: Review sprint and shell surfaces in both themes**

Verify in light and dark themes:

- Sprint time controls sit flat under the sprint header without a bordered card.
- Starting a sprint timer updates the global indicator.
- The global indicator truncates safely at narrow width, keeps the clock visible, navigates ticket timers correctly, and stops without triggering navigation.
- Motion communicates reveal or state change only and does not loop decoratively.

- [ ] **Step 5: Fix only scoped verification findings and rerun checks**

For each scoped finding, add or update the closest focused test before changing implementation. Then rerun:

```bash
bun --filter @projectproject/frontend test
bun --filter @projectproject/frontend typecheck
bun run lint
bun run format:check
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit verification fixes if any exist**

```bash
git add packages/frontend/src/components/time packages/frontend/src/components/TicketPage/TicketPage.tsx packages/frontend/messages/en/time.json packages/frontend/src/paraglide
git commit -m "fix(time): address UI verification findings"
```

Skip this commit when verification required no changes.
