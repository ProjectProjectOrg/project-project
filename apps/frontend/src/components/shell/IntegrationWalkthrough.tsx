import { Button } from "@pp/ui/button"
import { ChevronLeft, ChevronRight, CircleHelp } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import useEmblaCarousel from "embla-carousel-react"
import { useCallback, useSyncExternalStore } from "react"

type Slide = Readonly<{
  image: string
  title: string
  body: string
  alt: string
}>

export function IntegrationWalkthrough({
  slides,
  title,
  subtitle,
  triggerLabel,
  stepLabel,
  previousLabel,
  nextLabel,
  imageClassName,
  captionClassName
}: Readonly<{
  slides: ReadonlyArray<Slide>
  title: string
  subtitle: string
  triggerLabel: string
  stepLabel: (index: number, total: number) => string
  previousLabel: string
  nextLabel: string
  imageClassName: string
  captionClassName: string
}>) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start" })
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!emblaApi) return () => {}
      emblaApi.on("select", notify)
      emblaApi.on("reInit", notify)
      return () => {
        emblaApi.off("select", notify)
        emblaApi.off("reInit", notify)
      }
    },
    [emblaApi]
  )
  const selectedIndex = useSyncExternalStore(
    subscribe,
    () => emblaApi?.selectedScrollSnap() ?? 0
  )
  const canScrollPrev = useSyncExternalStore(
    subscribe,
    () => emblaApi?.canScrollPrev() ?? false
  )
  const canScrollNext = useSyncExternalStore(
    subscribe,
    () => emblaApi?.canScrollNext() ?? false
  )
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="align-middle"
            size="icon-xs"
            aria-label={triggerLabel}
          >
            <CircleHelp strokeWidth={1.75} />
          </Button>
        }
      />
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[min(calc(100vw-2rem),34rem)] overflow-hidden p-0"
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="space-y-1">
            <h3 className="text-body font-semibold">{title}</h3>
            <p className="text-caption leading-5 text-muted-foreground">
              {subtitle}
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
            <div ref={emblaRef} className="overflow-hidden">
              <div className="flex">
                {slides.map((slide, index) => (
                  <div
                    key={slide.title}
                    className="min-w-0 flex-[0_0_100%]"
                    aria-hidden={index !== selectedIndex}
                  >
                    <img
                      src={slide.image}
                      alt={slide.alt}
                      className={cn(
                        "aspect-video w-full surface-background",
                        imageClassName
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className={captionClassName}>
            <p className="text-body font-semibold">
              {slides[selectedIndex].title}
            </p>
            <p className="mt-1 text-caption leading-5 text-muted-foreground">
              {slides[selectedIndex].body}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {slides.map((slide, index) => (
                <button
                  key={slide.title}
                  type="button"
                  aria-label={stepLabel(index + 1, slides.length)}
                  aria-current={index === selectedIndex ? "step" : undefined}
                  onClick={() => emblaApi?.scrollTo(index)}
                  className={cn(
                    "size-1.5 rounded-full transition-all duration-150 active:scale-97",
                    index === selectedIndex
                      ? "w-4 bg-foreground"
                      : "bg-muted-foreground/35 hover:bg-muted-foreground/60"
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => emblaApi?.scrollPrev()}
                disabled={!canScrollPrev}
                aria-label={previousLabel}
              >
                <ChevronLeft
                  aria-hidden
                  className="size-4"
                  strokeWidth={1.75}
                />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => emblaApi?.scrollNext()}
                disabled={!canScrollNext}
                aria-label={nextLabel}
              >
                <ChevronRight
                  aria-hidden
                  className="size-4"
                  strokeWidth={1.75}
                />
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
