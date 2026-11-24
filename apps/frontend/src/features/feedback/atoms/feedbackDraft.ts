import type { SubmitFeedbackInput } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

export const emptyFeedbackValues: Pick<
  SubmitFeedbackInput,
  "kind" | "title" | "description"
> = {
  kind: "bug",
  title: "",
  description: ""
}

export type FeedbackFileDraft = Readonly<
  { key: string; file: File } & (
    | { state: "uploading" }
    | { state: "ready"; id: string }
    | { state: "failed" }
  )
>

type Draft = Readonly<{
  values: typeof emptyFeedbackValues
  files: ReadonlyArray<FeedbackFileDraft>
  route: string | null
  generation: number
}>

export const emptyFeedbackDraft = (generation: number) =>
  ({
    values: emptyFeedbackValues,
    files: new Array<FeedbackFileDraft>(),
    route: null,
    generation
  }) satisfies Draft

export const feedbackDraft = Atom.family((_orgSlug: string) =>
  Atom.keepAlive(Atom.make<Draft>(emptyFeedbackDraft(0)))
)

export const hasFeedbackDraft = Atom.family((orgSlug: string) =>
  Atom.make((get) => {
    const { values, files } = get(feedbackDraft(orgSlug))
    return (
      values.kind !== "bug" ||
      values.title !== "" ||
      values.description !== "" ||
      files.length > 0
    )
  })
)
