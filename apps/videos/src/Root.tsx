import "./styles.css"
import { Composition } from "remotion"

import {
  COMMENT_THREADS_FRAMES,
  CommentThreadsClip
} from "./compositions/CommentThreadsClip"
import { NEW_LOOK_FRAMES, NewLookClip } from "./compositions/NewLookClip"
import {
  WHATS_NEW_CARD_FRAMES,
  WhatsNewCardClip
} from "./compositions/WhatsNewCardClip"
import { CLIP, CLIP_DEFAULT_PROPS } from "./parts/clip"

export function Root() {
  return (
    <>
      <Composition
        id="whats-new-card"
        component={WhatsNewCardClip}
        durationInFrames={WHATS_NEW_CARD_FRAMES}
        defaultProps={CLIP_DEFAULT_PROPS}
        {...CLIP}
      />
      <Composition
        id="redesign"
        component={NewLookClip}
        durationInFrames={NEW_LOOK_FRAMES}
        defaultProps={CLIP_DEFAULT_PROPS}
        {...CLIP}
      />
      <Composition
        id="comment-threads"
        component={CommentThreadsClip}
        durationInFrames={COMMENT_THREADS_FRAMES}
        defaultProps={CLIP_DEFAULT_PROPS}
        {...CLIP}
      />
    </>
  )
}
