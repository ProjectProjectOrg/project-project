import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Library, TypeDefinition, TypeKey } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Predicate from "effect/Predicate"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { ReadFailure } from "@/components/shell/ReadFailure"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  Select,
  SelectTrigger,
  type SelectOption
} from "@/components/ui/select"
import {
  countsRequest,
  ticketCounts
} from "@/features/tickets/atoms/ticketCounts"
import { errorMessage } from "@/lib/errorMessage"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  deleteProjectTypeMovingTickets,
  type TicketMoveFailed
} from "../atoms/deleteType"
import type { ProjectLibraryRequest } from "../atoms/library"
import { useScopeProjectName } from "../hooks/useLibraryPermissions"
import {
  NO_TYPE,
  replacementKey,
  replacementTypes,
  ticketsToMove
} from "../lib/deletePlan"
import { BlockIconGlyph } from "./BlockIconGlyph"

type DeleteTypeDialogProps = Readonly<{
  req: ProjectLibraryRequest
  library: Library
  type: TypeDefinition
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}>

type Tagged = Readonly<{ _tag: string }>

const isMoveFailure = (error: Tagged): error is TicketMoveFailed =>
  Predicate.isTagged(error, "TicketMoveFailed")

const usedText = (count: number, name: string, project: string): string => {
  if (count === 0) return m.templates_types_delete_unused({ project })
  if (count === 1) return m.templates_types_delete_used_one({ name, project })
  return m.templates_types_delete_used({ count, name, project })
}

const deleteFailureText =
  (name: string) =>
  (error: Tagged): string => {
    if (!isMoveFailure(error)) return errorMessage(error)
    const reason = errorMessage(error.error)
    return error.moved === 0
      ? m.templates_types_delete_failed({ name, reason })
      : m.templates_types_delete_stopped({ name, moved: error.moved, reason })
  }

export function DeleteTypeDialog({
  req,
  library,
  type,
  open,
  onOpenChange,
  onDeleted
}: DeleteTypeDialogProps) {
  const mutation = deleteProjectTypeMovingTickets({ req, key: type.key })
  const run = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  const { orgSlug, slug } = req.params
  const project = useScopeProjectName({ layer: "project", req })
  const openCounts = ticketCounts(
    countsRequest(orgSlug, slug, { type: [type.key] })
  )
  const archivedCounts = ticketCounts(
    countsRequest(orgSlug, slug, { type: [type.key], archived: true })
  )
  const counts = AsyncResult.all([
    useAtomValue(openCounts),
    useAtomValue(archivedCounts)
  ])
  const refreshOpen = useAtomRefresh(openCounts)
  const refreshArchived = useAtomRefresh(archivedCounts)
  const options = replacementTypes(library, type.key)
  const [choice, setChoice] = useState<TypeKey | typeof NO_TYPE>(
    options[0]?.key ?? NO_TYPE
  )
  const chosen = options.find((option) => option.key === choice)
  const choices: ReadonlyArray<SelectOption<TypeKey | typeof NO_TYPE>> = [
    ...options.map((option) => ({
      value: option.key,
      textValue: option.name,
      label: (
        <>
          <BlockIconGlyph icon={option.icon} color={option.color} />
          {option.name}
        </>
      )
    })),
    { value: NO_TYPE, label: m.tickets_type_none() }
  ]
  const busy = state.waiting
  const error = busy
    ? null
    : mutationErrorText(state, deleteFailureText(type.name))

  const confirm = async () => {
    const exit = await run({ type: replacementKey(choice) })
    if (Exit.isSuccess(exit)) onDeleted()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {m.templates_settings_delete_confirm({ name: type.name })}
          </DialogTitle>
        </DialogHeader>
        <AsyncView
          result={counts}
          onInitial={() => (
            <div
              aria-hidden
              className="h-16 animate-pulse rounded-md bg-muted"
            />
          )}
          onFailure={(failure) => (
            <ReadFailure
              failure={failure}
              onRetry={() => {
                refreshOpen()
                refreshArchived()
              }}
            />
          )}
          onSuccess={({ value }) => {
            const count = ticketsToMove(value)
            return (
              <div className={cn("flex flex-col", busy && "animate-pulse")}>
                <DialogDescription>
                  {usedText(count, type.name, project)}
                </DialogDescription>
                {count === 0 ? null : (
                  <div className="mt-4 flex flex-col gap-1.5">
                    <span className="text-caption text-muted-foreground">
                      {count === 1
                        ? m.templates_types_delete_move_one()
                        : m.templates_types_delete_move({ count })}
                    </span>
                    <Select
                      items={choices}
                      value={choice}
                      disabled={busy}
                      onValueChange={setChoice}
                    >
                      <SelectTrigger
                        aria-label={m.templates_types_delete_move_aria()}
                        selectedLabel={
                          chosen === undefined ? (
                            m.tickets_type_none()
                          ) : (
                            <span className="flex min-w-0 items-center gap-2">
                              <BlockIconGlyph
                                icon={chosen.icon}
                                color={chosen.color}
                              />
                              <span className="truncate">{chosen.name}</span>
                            </span>
                          )
                        }
                      />
                    </Select>
                    <p className="text-caption text-muted-foreground">
                      {m.templates_types_delete_note()}
                    </p>
                  </div>
                )}
                {error === null ? null : (
                  <p
                    role="alert"
                    className="mt-3 text-caption text-destructive"
                  >
                    {error}
                  </p>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="tertiary"
                    disabled={busy}
                    onClick={() => onOpenChange(false)}
                  >
                    {m.templates_settings_cancel()}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void confirm()}
                  >
                    {busy && count > 0
                      ? m.templates_types_delete_moving()
                      : count === 0
                        ? m.templates_types_delete_type()
                        : m.templates_types_delete_and_move()}
                  </Button>
                </DialogFooter>
              </div>
            )
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
