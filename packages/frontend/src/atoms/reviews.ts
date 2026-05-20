import { Atom, Result } from "@effect-atom/atom-react"
import * as Reactivity from "@effect/experimental/Reactivity"
import * as Effect from "effect/Effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import type {
  MergeReviewInput,
  ReplyReviewCommentInput,
  ReviewPage,
  SubmitReviewInput
} from "@projectproject/shared"
import { projectGitStatesBaseAtom } from "./github"
import { ticketBaseAtom, ticketKey } from "./tickets"

export const reviewKey = (
  orgSlug: string,
  slug: string,
  prNumber: number
): string => `${orgSlug}/${slug}/${prNumber}`

const splitReviewKey = (
  key: string
): { orgSlug: string; slug: string; prNumber: number } => {
  const firstSlash = key.indexOf("/")
  const secondSlash = key.indexOf("/", firstSlash + 1)
  return {
    orgSlug: key.slice(0, firstSlash),
    slug: key.slice(firstSlash + 1, secondSlash),
    prNumber: Number(key.slice(secondSlash + 1))
  }
}

const pulse = <A, E>(current: Result.Result<A, E>) =>
  Result.isSuccess(current)
    ? Result.success(current.value, { waiting: true })
    : current

interface AtomFnContext {
  <A>(atom: Atom.Atom<A>): A
  refresh(atom: Atom.Atom<any>): void
}

export const reviewBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug, prNumber } = splitReviewKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.reviews.get({
          path: { orgSlug, slug, prNumber }
        })
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
})

export const reviewAtom = Atom.family((key: string) =>
  Atom.optimistic(reviewBaseAtom(key))
)

export const reviewFileSummariesBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug, prNumber } = splitReviewKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.reviews.fileSummaries({
          path: { orgSlug, slug, prNumber },
          urlParams: {}
        })
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
})

export const reviewFileSummariesAtom = Atom.family((key: string) =>
  Atom.optimistic(reviewFileSummariesBaseAtom(key))
)

export const reviewFilesBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug, prNumber } = splitReviewKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.reviews.files({
          path: { orgSlug, slug, prNumber },
          urlParams: {}
        })
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
})

export const reviewFilesAtom = Atom.family((key: string) =>
  Atom.optimistic(reviewFilesBaseAtom(key))
)

export const reviewCommentsBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug, prNumber } = splitReviewKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.reviews.comments({
          path: { orgSlug, slug, prNumber }
        })
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
})

export const reviewCommentsAtom = Atom.family((key: string) =>
  Atom.optimistic(reviewCommentsBaseAtom(key))
)

const refreshLinkedTicket = (key: string, get: AtomFnContext) => {
  const current: Result.Result<ReviewPage, unknown> = get(reviewAtom(key))
  if (!Result.isSuccess(current)) return
  const { orgSlug, slug } = splitReviewKey(key)
  get.refresh(
    ticketBaseAtom(ticketKey(orgSlug, slug, current.value.linkedTicket.id))
  )
}

const refreshReviewReads = (key: string, get: AtomFnContext) => {
  get.refresh(reviewBaseAtom(key))
  get.refresh(reviewCommentsBaseAtom(key))
}

const refreshPrMutationReads = (key: string, get: AtomFnContext) => {
  const { orgSlug, slug } = splitReviewKey(key)
  refreshReviewReads(key, get)
  get.refresh(projectGitStatesBaseAtom(`${orgSlug}/${slug}`))
  refreshLinkedTicket(key, get)
}

export const submitReviewAtom = Atom.family((key: string) => {
  const { orgSlug, slug, prNumber } = splitReviewKey(key)
  return Atom.optimisticFn(reviewCommentsAtom(key), {
    reducer: (current, _input: SubmitReviewInput) => pulse(current),
    fn: runtime.fn(
      Effect.fn(function* (input: SubmitReviewInput, get) {
        const client = yield* ApiClient
        const result = yield* client.reviews.submit({
          path: { orgSlug, slug, prNumber },
          payload: input
        })
        refreshReviewReads(key, get)
        return result
      })
    )
  })
})

export const replyReviewCommentAtom = Atom.family((key: string) => {
  const { orgSlug, slug, prNumber } = splitReviewKey(key)
  return Atom.optimisticFn(reviewCommentsAtom(key), {
    reducer: (
      current,
      _input: { commentId: string } & ReplyReviewCommentInput
    ) => pulse(current),
    fn: runtime.fn(
      Effect.fn(
        function* (
          input: { commentId: string } & ReplyReviewCommentInput,
          get
        ) {
          const client = yield* ApiClient
          const result = yield* client.reviews.reply({
            path: {
              orgSlug,
              slug,
              prNumber,
              commentId: input.commentId
            },
            payload: { body: input.body }
          })
          refreshReviewReads(key, get)
          return result
        }
      )
    )
  })
})

export const resolveReviewThreadAtom = Atom.family((key: string) => {
  const { orgSlug, slug, prNumber } = splitReviewKey(key)
  return Atom.optimisticFn(reviewCommentsAtom(key), {
    reducer: (current, _input: { threadId: string }) => pulse(current),
    fn: runtime.fn(
      Effect.fn(function* (input: { threadId: string }, get) {
        const client = yield* ApiClient
        const result = yield* client.reviews.resolveThread({
          path: { orgSlug, slug, prNumber, threadId: input.threadId }
        })
        refreshReviewReads(key, get)
        return result
      })
    )
  })
})

export const unresolveReviewThreadAtom = Atom.family((key: string) => {
  const { orgSlug, slug, prNumber } = splitReviewKey(key)
  return Atom.optimisticFn(reviewCommentsAtom(key), {
    reducer: (current, _input: { threadId: string }) => pulse(current),
    fn: runtime.fn(
      Effect.fn(function* (input: { threadId: string }, get) {
        const client = yield* ApiClient
        const result = yield* client.reviews.unresolveThread({
          path: { orgSlug, slug, prNumber, threadId: input.threadId }
        })
        refreshReviewReads(key, get)
        return result
      })
    )
  })
})

export const mergeReviewAtom = Atom.family((key: string) => {
  const { orgSlug, slug, prNumber } = splitReviewKey(key)
  return Atom.optimisticFn(reviewAtom(key), {
    reducer: (current, _input: MergeReviewInput) => pulse(current),
    fn: runtime.fn(
      Effect.fn(function* (input: MergeReviewInput, get) {
        const client = yield* ApiClient
        const result = yield* client.reviews.merge({
          path: { orgSlug, slug, prNumber },
          payload: input
        })
        refreshPrMutationReads(key, get)
        yield* Reactivity.invalidate(["tickets", orgSlug, slug])
        return result
      })
    )
  })
})

export const closeReviewAtom = Atom.family((key: string) => {
  const { orgSlug, slug, prNumber } = splitReviewKey(key)
  return Atom.optimisticFn(reviewAtom(key), {
    reducer: (current, _input: void) => pulse(current),
    fn: runtime.fn(
      Effect.fn(function* (_input: void, get) {
        const client = yield* ApiClient
        const result = yield* client.reviews.close({
          path: { orgSlug, slug, prNumber }
        })
        refreshPrMutationReads(key, get)
        yield* Reactivity.invalidate(["tickets", orgSlug, slug])
        return result
      })
    )
  })
})

export const reopenReviewAtom = Atom.family((key: string) => {
  const { orgSlug, slug, prNumber } = splitReviewKey(key)
  return Atom.optimisticFn(reviewAtom(key), {
    reducer: (current, _input: void) => pulse(current),
    fn: runtime.fn(
      Effect.fn(function* (_input: void, get) {
        const client = yield* ApiClient
        const result = yield* client.reviews.reopen({
          path: { orgSlug, slug, prNumber }
        })
        refreshPrMutationReads(key, get)
        yield* Reactivity.invalidate(["tickets", orgSlug, slug])
        return result
      })
    )
  })
})
