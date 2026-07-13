import { useCallback, useEffect, useState } from "react"
import useEmblaCarousel from "embla-carousel-react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import applicationAccessImage from "@/assets/everhour-walkthrough/everhour-application-access.png"
import profileMenuImage from "@/assets/everhour-walkthrough/everhour-profile-menu.png"
import projectProjectKeyImage from "@/assets/everhour-walkthrough/projectproject-everhour-key.png"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"

export function EverhourApiKeyWalkthrough() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start" })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)
  const slides = [
    {
      image: profileMenuImage,
      title: m.project_settings_everhour_help_step_profile_menu_title(),
      body: m.project_settings_everhour_help_step_profile_menu_body(),
      alt: m.project_settings_everhour_help_step_profile_menu_alt()
    },
    {
      image: applicationAccessImage,
      title: m.project_settings_everhour_help_step_token_title(),
      body: m.project_settings_everhour_help_step_token_body(),
      alt: m.project_settings_everhour_help_step_token_alt()
    },
    {
      image: projectProjectKeyImage,
      title: m.project_settings_everhour_help_step_projectproject_title(),
      body: m.project_settings_everhour_help_step_projectproject_body(),
      alt: m.project_settings_everhour_help_step_projectproject_alt()
    }
  ]

  const updateCarouselState = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
    setCanScrollPrev(emblaApi.canScrollPrev())
    setCanScrollNext(emblaApi.canScrollNext())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    updateCarouselState()
    emblaApi.on("select", updateCarouselState)
    emblaApi.on("reInit", updateCarouselState)
    return () => {
      emblaApi.off("select", updateCarouselState)
      emblaApi.off("reInit", updateCarouselState)
    }
  }, [emblaApi, updateCarouselState])

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="inline-help"
            size="icon-xs"
            aria-label={m.project_settings_everhour_help_trigger_label()}
          >
            {m.project_settings_everhour_help_trigger_text()}
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
            <h3 className="text-sm font-semibold">
              {m.project_settings_everhour_help_title()}
            </h3>
            <p className="text-xs leading-5 text-muted-foreground">
              {m.project_settings_everhour_help_subtitle()}
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
                      className="aspect-video w-full bg-background object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="min-h-[4.5rem]">
            <p className="text-sm font-medium">{slides[selectedIndex].title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {slides[selectedIndex].body}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {slides.map((slide, index) => (
                <button
                  key={slide.title}
                  type="button"
                  aria-label={m.project_settings_everhour_help_dot_label({
                    index: index + 1,
                    total: slides.length
                  })}
                  aria-current={index === selectedIndex ? "step" : undefined}
                  onClick={() => emblaApi?.scrollTo(index)}
                  className={cn(
                    "size-1.5 rounded-full transition-all duration-150 active:scale-[0.97]",
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
                aria-label={m.project_settings_everhour_help_previous_label()}
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
                aria-label={m.project_settings_everhour_help_next_label()}
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
