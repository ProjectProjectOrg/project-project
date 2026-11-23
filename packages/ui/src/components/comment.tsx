import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type MouseEvent,
  type ReactNode
} from "react"

import { cn } from "../lib/utils"
import { ChevronRight } from "./icons"
import {
  TimelineAppear,
  TimelineFold,
  TimelineIndent,
  TimelineMark,
  timelineEase,
  timelineFoldSeconds,
  useTimelineRailFollow
} from "./timeline"

/*
 * A comment on a ticket's timeline: a bubble hanging off its author's mark
 * on the rail, the name and time inside, the text in ink. A thread's replies
 * sit one step in; its earlier replies fold into one row that opens right
 * under itself; Reply under the last bubble opens the reply box.
 *
 *   <CommentThread>
 *     <Comment mark={<MemberAvatar … size={20} />} author="Ana" time={…} actions={menu}>
 *       <Markdown>{body}</Markdown>
 *     </Comment>
 *     <CommentReplies>
 *       <CommentEarlier label={m.…({ count })} open={open} onOpenChange={setOpen}>
 *         {earlier}
 *       </CommentEarlier>
 *       {replies}
 *       {replying ? <CommentReplyBox … /> : <CommentReplyAction … />}
 *     </CommentReplies>
 *   </CommentThread>
 *
 * The app fills it: the body (Markdown, or the editor while editing), the
 * menu, the reply editor, and every string.
 */

const surfaceClass =
  "surface-(--comment-bubble) [corner-shape:var(--button-corner)]"

export function CommentThread({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="comment-thread"
      className={cn(
        "grid gap-2.5 [--fs-body:13px] [--lh-body:20px] [--text-body--line-height:20px] [--text-body:13px]",
        className
      )}
      {...props}
    />
  )
}

// The bubble: its corner by the mark is tight, so it reads as hanging off
// the author; the rest are the house 14px. Targeted (a link to this comment)
// rings it; pending pulses it.
export function Comment({
  mark,
  author,
  time,
  meta,
  actions,
  pending = false,
  appear = false,
  targeted = false,
  failed = false,
  footer,
  editActions,
  className,
  children,
  ...props
}: Omit<ComponentProps<"div">, "children"> &
  Readonly<{
    mark: ReactNode
    author: ReactNode
    time?: ReactNode
    // After the time: "edited", "imported from Jira", the resolved label.
    meta?: ReactNode
    // The comment's menu button, shown on hover.
    actions?: ReactNode
    pending?: boolean
    // Mounting as a comment just placed: it eases in instead of popping in.
    appear?: boolean
    targeted?: boolean
    // Sending it failed: a red hairline round the bubble; the footer says
    // so and offers Retry (CommentFailed).
    failed?: boolean
    // While editing: Cancel and Save, inside the bubble at the end of the
    // editor, the way the reply box holds its send button.
    editActions?: ReactNode
    // Under the bubble, outside it: an error.
    footer?: ReactNode
    children: ReactNode
  }>) {
  return (
    <TimelineAppear appear={appear}>
      <div
        data-slot="comment"
        data-targeted={targeted || undefined}
        className={cn(
          "group/reveal grid grid-cols-[20px_minmax(0,1fr)] gap-x-2.5",
          className
        )}
        {...props}
      >
        <TimelineMark className="mt-2 self-start">{mark}</TimelineMark>
        <div className="min-w-0">
          <div
            className={cn(
              "rounded-[4px_14px_14px_14px] px-3 pt-2 pb-2.5 transition-shadow duration-300 in-data-targeted:shadow-[0_0_0_2px_var(--ring)]",
              surfaceClass,
              pending && "animate-pulse",
              failed &&
                "shadow-[inset_0_0_0_1px_oklch(from_var(--destructive)_l_calc(c*0.8)_h)]"
            )}
          >
            <div className="flex min-h-5 items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground">
                <span className="font-semibold text-foreground">{author}</span>
                {time != null && (
                  <>
                    <span aria-hidden>·</span>
                    {time}
                  </>
                )}
                {meta}
              </div>
              {actions != null && (
                <div className="-my-1 -mr-1.5 flex shrink-0 items-center">
                  {actions}
                </div>
              )}
            </div>
            {editActions == null ? (
              <div className="text-body text-foreground">{children}</div>
            ) : (
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 text-body text-foreground [&_.lexical-content]:min-h-5">
                  {children}
                </div>
                <div className="-my-1 -mr-1.5 flex shrink-0 items-center gap-1">
                  {editActions}
                </div>
              </div>
            )}
          </div>
          {footer}
        </div>
      </div>
    </TimelineAppear>
  )
}

// Under a comment that failed to send: what happened, in the destructive
// colour on the page (it falls short on the bubble's fill), and Retry.
export function CommentFailed({
  message,
  retryLabel,
  onRetry
}: Readonly<{ message: ReactNode; retryLabel: string; onRetry: () => void }>) {
  return (
    <div
      role="alert"
      className="mt-1 flex items-center gap-2 pl-3 text-caption"
    >
      <span className="text-destructive">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="cursor-pointer font-semibold text-foreground transition-colors hover:text-muted-foreground hover:duration-0"
      >
        {retryLabel}
      </button>
    </div>
  )
}

// A thread's replies: one step in, the rail bending in to them.
export function CommentReplies({ className, ...props }: ComponentProps<"div">) {
  return (
    <TimelineIndent
      data-slot="comment-replies"
      className={cn("mt-1.5 grid gap-2.5", className)}
      {...props}
    />
  )
}

// A thread's earlier replies, folded into one row ("Show 3 earlier
// replies", or who replied on a resolved thread) that opens right under
// itself, like a run of changes. Its chevron sits on the rail in a 20px tile,
// so the rail bends in above this row and opening only lengthens the line.
export function CommentEarlier({
  label,
  open,
  onOpenChange,
  children
}: Readonly<{
  label: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}>) {
  return (
    <div className="grid">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="group grid w-fit cursor-pointer grid-cols-[20px_auto] items-center gap-x-2.5 text-left text-caption text-muted-foreground transition-colors hover:text-foreground hover:duration-0"
      >
        <TimelineMark className="size-5 rounded-[6px] bg-(--comment-bubble) [corner-shape:var(--button-corner)]">
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 transition-transform duration-300 ease-standard",
              open && "rotate-90"
            )}
          />
        </TimelineMark>
        <span className="flex min-w-0 items-center gap-1.5">{label}</span>
      </button>
      <TimelineFold open={open} className="grid gap-2.5 pt-2.5">
        {children}
      </TimelineFold>
    </div>
  )
}

// "Reply", under a thread's last bubble, lined up with its text (42px in:
// the mark, the gap and the bubble's padding). It sits in the replies, so
// under a first comment with no replies yet it reaches back one step.
export function CommentReplyAction({
  under = "reply",
  className,
  ...props
}: ComponentProps<"button"> & Readonly<{ under?: "comment" | "reply" }>) {
  return (
    <button
      type="button"
      className={cn(
        "w-fit cursor-pointer text-caption text-muted-foreground transition-colors hover:text-foreground hover:duration-0",
        under === "comment" ? "ml-5" : "ml-[2.625rem]",
        className
      )}
      {...props}
    />
  )
}

// Reply and the reply box in one place: pressing Reply collapses the link
// while the box eases open in its place (so the thread only grows). Under a
// comment with no replies yet the box starts the indent, so the rail's bend
// eases out with it (data-rail-indent); among replies it only lengthens the
// line. Clipped, not scrolled: the editor takes focus while it opens.
export function CommentReplySwap({
  open,
  under = "reply",
  action,
  children
}: Readonly<{
  open: boolean
  under?: "comment" | "reply"
  action: ReactNode
  children: ReactNode
}>) {
  const follow = useTimelineRailFollow()
  const reduce = useReducedMotion() ?? false
  const seconds = reduce ? 0 : timelineFoldSeconds
  const shown = useRef(open)
  useLayoutEffect(() => {
    if (shown.current === open) return
    shown.current = open
    follow(seconds * 1000 + 80)
  }, [open, follow, seconds])
  const swap = {
    initial: { height: 0, opacity: 0 },
    animate: { height: "auto", opacity: 1 },
    exit: { height: 0, opacity: 0 },
    transition: { duration: seconds, ease: timelineEase }
  } as const
  return (
    <div className="grid">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="box"
            {...swap}
            data-rail-clip
            data-rail-indent={under === "comment" ? 22 : 0}
            className="overflow-clip"
          >
            {children}
          </motion.div>
        ) : (
          <motion.div
            key="action"
            {...swap}
            className={cn(
              "grid overflow-clip",
              under === "comment" ? "-mt-3" : "-mt-1.5"
            )}
          >
            {action}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// The reply box: the replier's mark on the rail and a bubble of its own,
// headed like the comment it's about to become (their name, "just now"),
// the editor under it and the send button at its end. The editor has 4px
// above and below, so one line is as tall as the button and level with its
// label; longer replies grow down from the same first line, and the button
// stays level with the last.
export function CommentReplyBox({
  mark,
  author,
  time,
  submit,
  className,
  children,
  ...props
}: Omit<ComponentProps<"div">, "children"> &
  Readonly<{
    mark: ReactNode
    author?: ReactNode
    time?: ReactNode
    submit: ReactNode
    children: ReactNode
  }>) {
  return (
    <div
      data-slot="comment-reply-box"
      className={cn("grid grid-cols-[20px_minmax(0,1fr)] gap-x-2.5", className)}
      {...props}
    >
      <TimelineMark className="mt-2 self-start">{mark}</TimelineMark>
      <div className="min-w-0">
        <div
          className={cn(
            "rounded-[4px_14px_14px_14px] pt-2 pr-1.5 pb-1.5 pl-3",
            surfaceClass
          )}
        >
          {author != null && (
            <div className="flex min-h-5 items-center gap-x-1.5 text-caption text-muted-foreground">
              <span className="font-semibold text-foreground">{author}</span>
              {time != null && (
                <>
                  <span aria-hidden>·</span>
                  {time}
                </>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 py-1 text-body [&_.lexical-content]:min-h-5">
              {children}
            </div>
            {submit}
          </div>
        </div>
      </div>
    </div>
  )
}

// A press anywhere on the composer's bubble outside the editor and its
// buttons focuses the editor, with the caret at the end of the text.
const focusEditorEnd = (event: MouseEvent<HTMLElement>) => {
  if (event.button !== 0) return
  const target = event.target
  if (
    !(target instanceof Element) ||
    target.closest("[contenteditable], button, a, input, textarea")
  )
    return
  const editor = event.currentTarget.querySelector<HTMLElement>(
    "[contenteditable=true]"
  )
  if (editor === null) return
  event.preventDefault()
  editor.focus({ preventScroll: true })
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

// Writing a new comment, after the timeline: the editor in a bubble with the
// send button at its end. It clears on send; a send that fails stays in the
// thread as a failed comment (CommentFailed), not here.
export function CommentComposer({
  submit,
  className,
  children,
  ...props
}: Omit<ComponentProps<"div">, "children"> &
  Readonly<{
    submit: ReactNode
    children: ReactNode
  }>) {
  return (
    <div
      data-slot="comment-composer"
      className={cn(
        "[--fs-body:13px] [--lh-body:20px] [--text-body--line-height:20px] [--text-body:13px]",
        className
      )}
      {...props}
    >
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- a bigger pointer target; the keyboard reaches the editor itself */}
      <div
        onMouseDown={focusEditorEnd}
        className={cn("cursor-text rounded-[14px]", surfaceClass)}
      >
        <div className="px-3.5 pt-3 text-body">{children}</div>
        <div className="flex justify-end p-1.5">{submit}</div>
      </div>
    </div>
  )
}
