import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { useState } from "react"
import type {
  AttachmentRow as AttachmentRowData,
  AttachmentSort,
  OrgStorageStatus
} from "@projectproject/shared"
import {
  deleteOrgAttachmentsAtom,
  orgAttachmentsAtom,
  orgAttachmentsSummaryAtom
} from "@/atoms/attachments"
import { orgAttachmentsKey } from "@/atoms/orgAttachmentsKey"
import { projectsListAtom } from "@/atoms/projects"
import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import { ConfirmButton, useConfirmButton } from "@/components/ui/confirm-button"
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import { type AppError, errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"
import { Row } from "./Row"
import {
  allDeletableSelected,
  deletableIds,
  prunedSelection,
  toggleSelection
} from "./selection"
import { Toolbar, type StatusFilter } from "./Toolbar"
import { Totals } from "./Totals"

export function AttachmentsBrowser({
  orgSlug,
  storage
}: {
  orgSlug: string
  storage: OrgStorageStatus
}) {
  const [status, setStatus] = useState<StatusFilter>("all")
  const [projectSlug, setProjectSlug] = useState<string | null>(null)
  const [sort, setSort] = useState<AttachmentSort>("created_desc")
  const [pages, setPages] = useState(1)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const key = orgAttachmentsKey({
    orgSlug,
    ...(status === "all" ? {} : { status }),
    ...(projectSlug === null ? {} : { projectSlug }),
    sort,
    pages
  })

  const listResult = useAtomValue(orgAttachmentsAtom(key))
  const summaryResult = useAtomValue(orgAttachmentsSummaryAtom(orgSlug))
  const projectsResult = useAtomValue(projectsListAtom(orgSlug))
  const remove = useAtomSet(deleteOrgAttachmentsAtom(key), {
    mode: "promiseExit"
  })

  const projects = Result.isSuccess(projectsResult)
    ? projectsResult.value.map((project) => ({
        slug: project.slug,
        name: project.name
      }))
    : []

  const resetPaging = () => {
    setPages(1)
    setSelected(new Set())
  }

  if (storage.status === "not_connected") {
    return (
      <Empty variant="inline" className="border border-dashed border-border">
        <EmptyTitle className="text-sm font-medium">
          {m.attachments_empty_no_storage_title()}
        </EmptyTitle>
        <EmptyDescription className="max-w-sm text-xs">
          {m.attachments_empty_no_storage_body()}
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {Result.matchWithError(summaryResult, {
        onInitial: () => (
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        ),
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value }) => <Totals summary={value} />
      })}

      <Toolbar
        status={status}
        onStatusChange={(next) => {
          setStatus(next)
          resetPaging()
        }}
        projectSlug={projectSlug}
        projects={projects}
        onProjectChange={(next) => {
          setProjectSlug(next)
          resetPaging()
        }}
        sort={sort}
        onSortChange={(next) => {
          setSort(next)
          resetPaging()
        }}
      />

      {Result.matchWithError(listResult, {
        onInitial: () => <TableSkeleton />,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value, waiting }) => (
          <AttachmentsTable
            orgSlug={orgSlug}
            rows={value.items}
            nextCursor={value.nextCursor}
            waiting={waiting}
            filtered={status !== "all" || projectSlug !== null}
            selected={prunedSelection(selected, value.items)}
            onToggle={(id) =>
              setSelected((current) => toggleSelection(current, id))
            }
            onToggleAll={() =>
              setSelected((current) =>
                allDeletableSelected(current, value.items)
                  ? new Set()
                  : new Set(deletableIds(value.items))
              )
            }
            onLoadMore={() => setPages((current) => current + 1)}
            onDelete={async (ids) => {
              const exit = await remove(ids)
              if (Exit.isSuccess(exit)) {
                setSelected(new Set())
                return null
              }
              return errorMessage(Cause.squash(exit.cause) as AppError)
            }}
          />
        )
      })}
    </div>
  )
}

function AttachmentsTable({
  orgSlug,
  rows,
  nextCursor,
  waiting,
  filtered,
  selected,
  onToggle,
  onToggleAll,
  onLoadMore,
  onDelete
}: {
  orgSlug: string
  rows: ReadonlyArray<AttachmentRowData>
  nextCursor: string | null
  waiting: boolean
  filtered: boolean
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  onLoadMore: () => void
  onDelete: (ids: ReadonlyArray<string>) => Promise<string | null>
}) {
  const selectedIds = [...selected]

  if (rows.length === 0) {
    return (
      <Empty variant="inline" className="border border-dashed border-border">
        <EmptyTitle className="text-sm font-medium">
          {filtered
            ? m.attachments_empty_filtered_title()
            : m.attachments_empty_none_title()}
        </EmptyTitle>
        <EmptyDescription className="max-w-sm text-xs">
          {filtered
            ? m.attachments_empty_filtered_body()
            : m.attachments_empty_none_body()}
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <div className={waiting ? "animate-pulse" : undefined}>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[24px_minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-3 border-b border-border px-2 pb-2 text-xs text-muted-foreground">
            <span className="flex items-center justify-center">
              <input
                type="checkbox"
                className="size-4 rounded border border-border"
                checked={allDeletableSelected(selected, rows)}
                onChange={onToggleAll}
                disabled={deletableIds(rows).length === 0}
                aria-label={m.attachments_select_all()}
              />
            </span>
            <span>{m.attachments_column_file()}</span>
            <span>{m.attachments_column_project()}</span>
            <span>{m.attachments_column_ticket()}</span>
            <span>{m.attachments_column_size()}</span>
            <span>{m.attachments_column_status()}</span>
            <span>{m.attachments_column_uploaded()}</span>
            <span />
          </div>

          {rows.map((row) => (
            <Row
              key={row.id}
              orgSlug={orgSlug}
              row={row}
              selected={selected.has(row.id)}
              onToggle={onToggle}
            >
              <DeleteCell row={row} onDelete={onDelete} />
            </Row>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-3">
        {nextCursor !== null ? (
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            onClick={onLoadMore}
          >
            {m.attachments_load_more()}
          </Button>
        ) : (
          <span />
        )}

        {selectedIds.length > 0 ? (
          <ConfirmButton.Root>
            <ConfirmButton.Trigger type="button" variant="secondary" size="sm">
              {m.attachments_delete_selected({ count: selectedIds.length })}
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm className="flex-wrap justify-end">
              <DeleteConfirm
                prompt={m.attachments_delete_selected_confirm({
                  count: selectedIds.length
                })}
                ids={selectedIds}
                onDelete={onDelete}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        ) : null}
      </div>
    </div>
  )
}

function DeleteCell({
  row,
  onDelete
}: {
  row: AttachmentRowData
  onDelete: (ids: ReadonlyArray<string>) => Promise<string | null>
}) {
  if (row.status !== "orphaned") return <span />

  return (
    <ConfirmButton.Root className="justify-end">
      <ConfirmButton.Trigger
        type="button"
        variant="ghost"
        size="sm"
        className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        {m.attachments_delete_button()}
      </ConfirmButton.Trigger>
      <ConfirmButton.Confirm className="flex-wrap justify-end">
        <DeleteConfirm
          prompt={m.attachments_delete_confirm()}
          ids={[row.id]}
          onDelete={onDelete}
        />
      </ConfirmButton.Confirm>
    </ConfirmButton.Root>
  )
}

function DeleteConfirm({
  prompt,
  ids,
  onDelete
}: {
  prompt: string
  ids: ReadonlyArray<string>
  onDelete: (ids: ReadonlyArray<string>) => Promise<string | null>
}) {
  const { close, busy, setBusy } = useConfirmButton()
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    const failure = await onDelete(ids)
    if (failure === null) {
      close()
      return
    }
    setBusy(false)
    setError(failure)
  }

  return (
    <>
      <span className="inline-flex h-8 items-center whitespace-nowrap text-xs text-muted-foreground">
        {prompt}
      </span>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={() => void run()}
        disabled={busy}
      >
        {m.attachments_delete_button()}
      </Button>
      <ConfirmButton.Cancel>{m.common_cancel_button()}</ConfirmButton.Cancel>
      {error !== null ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </>
  )
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="h-10 w-full animate-pulse rounded-md bg-muted"
        />
      ))}
    </div>
  )
}
