import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { ErrorPage } from "@/components/ErrorPage"
import { NotFoundPage } from "@/components/NotFoundPage"
import {
  ReviewFilesPageSkeleton,
  ReviewPage,
  ReviewPageSkeleton
} from "@/components/Reviews/ReviewPage"
import {
  reviewAtom,
  reviewBaseAtom,
  reviewFileSummariesAtom,
  reviewFilesAtom,
  reviewKey
} from "@/atoms/reviews"
import { m } from "@/paraglide/messages"

type ReviewSearch = {
  view: "overview" | "files"
}

const decodePrNumber = (raw: string): number => {
  const prNumber = Number(raw)
  if (!Number.isInteger(prNumber) || prNumber <= 0) throw notFound()
  return prNumber
}

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/reviews/$prNumber"
)({
  component: ReviewRoute,
  validateSearch: (search: Record<string, unknown>): ReviewSearch => ({
    view: search.view === "files" ? "files" : "overview"
  }),
  loader: ({ context, params }) => {
    const prNumber = decodePrNumber(params.prNumber)
    context.registry.mount(
      reviewBaseAtom(reviewKey(params.orgSlug, params.slug, prNumber))
    )()
    return {
      crumb: {
        type: "static" as const,
        label: m.reviews_title_prefix({ number: prNumber })
      }
    }
  }
})

function ReviewRoute() {
  const { orgSlug, slug, prNumber: rawPrNumber } = Route.useParams()
  const search = Route.useSearch()
  const prNumber = decodePrNumber(rawPrNumber)
  const key = reviewKey(orgSlug, slug, prNumber)
  const result = useAtomValue(reviewAtom(key))
  const filesResult = useAtomValue(reviewFilesAtom(key))
  const summariesResult = useAtomValue(reviewFileSummariesAtom(key))
  const filesInitial =
    search.view === "files" &&
    (!Result.isSuccess(filesResult) || !Result.isSuccess(summariesResult))

  return Result.matchWithError(result, {
    onInitial: () =>
      search.view === "files" ? <ReviewFilesPageSkeleton /> : <ReviewPageSkeleton />,
    onError: (error) =>
      error._tag === "NotFound" ? (
        <NotFoundPage
          contained
          title={m.reviews_route_not_found_title()}
          body={m.reviews_route_not_found_body()}
        />
      ) : (
        <ErrorPage
          contained
          error={error}
          title={m.reviews_error_overview()}
        />
      ),
    onDefect: (defect) => (
      <ErrorPage contained error={defect} title={m.reviews_error_overview()} />
    ),
    onSuccess: ({ value, waiting }) =>
      filesInitial ? (
        <ReviewFilesPageSkeleton />
      ) : (
        <ReviewPage
          orgSlug={orgSlug}
          slug={slug}
          prNumber={prNumber}
          review={value}
          view={search.view}
          waiting={waiting}
        />
      )
  })
}
