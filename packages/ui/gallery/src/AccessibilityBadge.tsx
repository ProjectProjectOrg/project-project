import { Badge } from "@pp/ui/badge"
import { Button } from "@pp/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import {
  ArrowUpRight,
  Check,
  CircleHelp,
  Minus,
  RotateCw,
  TriangleAlert,
  X
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type RefObject
} from "react"

import {
  AA_CONTRAST_RULE,
  AAA_CONTRAST_RULE,
  checkAccessibility,
  ruleStatus,
  type AccessibilityReport,
  type RuleResult,
  type RuleStatus,
  type StandardRun
} from "./axe"

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

export function AccessibilityBadge({
  target
}: Readonly<{ target: RefObject<HTMLElement | null> }>) {
  const [report, setReport] = useState<AccessibilityReport | null>(null)
  const [run, setRun] = useState(0)
  const [open, setOpen] = useState(false)
  const rerun = useCallback(() => {
    setOpen(false)
    setReport(null)
    setRun((count) => count + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      const element = target.current
      if (element === null) return
      void checkAccessibility(element).then((found) => {
        if (!cancelled) setReport(found)
      })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [target, run])

  if (report === null) return <Badge size="xs">Checking</Badge>

  const aaFailed = report.aa.violations.length
  const aaaMet = report.aaa.violations.length === 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`WCAG 2.2 AA ${aaFailed === 0 ? "met" : "not met"}, AAA ${aaaMet ? "met" : "not met"}. Show details`}
            className="flex cursor-pointer items-center gap-1 rounded-md"
          />
        }
      >
        <Badge tone={aaFailed === 0 ? "emerald" : "red"} size="xs">
          {aaFailed === 0 ? (
            <Check strokeWidth={2.25} />
          ) : (
            <TriangleAlert strokeWidth={2.25} />
          )}
          {aaFailed === 0
            ? "WCAG 2.2 AA"
            : `AA · ${plural(aaFailed, "issue", "issues")}`}
        </Badge>
        <Badge tone={aaaMet ? "emerald" : "muted"} size="xs">
          {aaaMet ? <Check strokeWidth={2.25} /> : <Minus strokeWidth={2.25} />}
          AAA
        </Badge>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        data-gallery-chrome=""
        className="w-[26rem] p-0"
      >
        <ReportView report={report} onRerun={rerun} />
      </PopoverContent>
    </Popover>
  )
}

const STATUS_LABEL: Readonly<Record<RuleStatus, string>> = {
  pass: "Passes",
  fail: "Fails",
  review: "Needs review",
  "not-applicable": "No text to check"
}

function StatusIcon({ status }: Readonly<{ status: RuleStatus }>) {
  if (status === "pass")
    return <Check className="size-3.5 text-state-success" strokeWidth={2.25} />
  if (status === "fail")
    return <X className="size-3.5 text-destructive" strokeWidth={2.25} />
  if (status === "review")
    return (
      <CircleHelp className="size-3.5 text-muted-foreground" strokeWidth={2} />
    )
  return <Minus className="size-3.5 text-muted-foreground" strokeWidth={2} />
}

function ReportView({
  report,
  onRerun
}: Readonly<{ report: AccessibilityReport; onRerun: () => void }>) {
  const contrast = [
    {
      label: "Contrast AA",
      detail: "4.5:1 text, 3:1 large text",
      status: ruleStatus(report.aa, AA_CONTRAST_RULE)
    },
    {
      label: "Contrast AAA",
      detail: "7:1 text, 4.5:1 large text",
      status: ruleStatus(report.aaa, AAA_CONTRAST_RULE)
    }
  ] as const

  return (
    <div className="flex max-h-[min(34rem,72vh)] flex-col">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-body font-semibold">Accessibility check</h3>
          <p className="text-caption leading-5 text-muted-foreground">
            axe-core {report.version}. WCAG 2.2 AA is required; AAA is advisory.
          </p>
        </div>
        <Button
          variant="secondary"
          size="square-7"
          aria-label="Run again"
          onClick={onRerun}
          className="rounded-[8px] corner-squircle"
        >
          <RotateCw className="size-3.5" strokeWidth={2} />
        </Button>
      </header>
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto px-4 py-4">
        <ul className="flex flex-col gap-2.5">
          {contrast.map((row) => (
            <li
              key={row.label}
              className="flex items-start gap-2.5 text-caption leading-5"
            >
              <span className="mt-[3px] shrink-0">
                <StatusIcon status={row.status} />
              </span>
              <span className="min-w-0 flex-1">
                {row.label}
                <span className="text-muted-foreground"> · {row.detail}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">
                {STATUS_LABEL[row.status]}
              </span>
            </li>
          ))}
        </ul>
        <StandardSection title="WCAG 2.2 AA · required" run={report.aa} />
        <StandardSection title="AAA · advisory" run={report.aaa} />
      </div>
    </div>
  )
}

function StandardSection({
  title,
  run
}: Readonly<{ title: string; run: StandardRun }>) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-caption font-semibold">
        {title}
        <span className="font-normal text-muted-foreground">
          {" "}
          · {plural(run.passes.length, "rule", "rules")} passed,{" "}
          {run.violations.length} failed, {run.incomplete.length} to review
        </span>
      </h4>
      <RuleList
        rules={run.violations}
        icon={
          <TriangleAlert
            className="size-3.5 text-destructive"
            strokeWidth={2}
          />
        }
      />
      <RuleList
        rules={run.incomplete}
        icon={
          <CircleHelp
            className="size-3.5 text-muted-foreground"
            strokeWidth={2}
          />
        }
      />
      <RuleList
        rules={run.passes}
        icon={
          <Check className="size-3.5 text-state-success" strokeWidth={2.25} />
        }
        compact
      />
    </section>
  )
}

function RuleList({
  rules,
  icon,
  compact = false
}: Readonly<{
  rules: ReadonlyArray<RuleResult>
  icon: ReactNode
  compact?: boolean
}>) {
  if (rules.length === 0) return null
  return (
    <ul className="flex flex-col gap-2.5">
      {rules.map((rule) => (
        <li
          key={rule.id}
          className="flex items-start gap-2.5 text-caption leading-5"
        >
          <span className="mt-[3px] shrink-0">{icon}</span>
          <span className="min-w-0 flex-1">
            {rule.help}
            {compact ? null : (
              <span className="text-muted-foreground">
                {" "}
                · {rule.impact ?? "minor"} ·{" "}
                {plural(rule.elements, "element", "elements")}
              </span>
            )}
            {compact
              ? null
              : rule.samples.map((sample, index) => (
                  <code
                    key={`${rule.id}-${index}`}
                    className="mt-1.5 block rounded-md bg-surface-2 px-2 py-1 font-mono text-micro break-all text-muted-foreground"
                  >
                    {sample}
                  </code>
                ))}
          </span>
          <a
            href={rule.helpUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`About ${rule.id}`}
            className="mt-[3px] shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowUpRight className="size-3.5" />
          </a>
        </li>
      ))}
    </ul>
  )
}
