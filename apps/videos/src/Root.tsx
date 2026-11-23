import "./styles.css"
import { Composition } from "remotion"

import {
  COMMENT_THREADS_FRAMES,
  CommentThreadsClip
} from "./compositions/CommentThreadsClip"
import { REDESIGN_FRAMES, RedesignClip } from "./compositions/RedesignClip"
import { WhatsNewCardClip } from "./compositions/WhatsNewCardClip"
import { CLIP, CLIP_DEFAULT_PROPS } from "./parts/clip"

export function Root() {
  return (
    <>
      <Composition
        id="whats-new-card"
        component={WhatsNewCardClip}
        durationInFrames={CLIP.fps * 6}
        defaultProps={CLIP_DEFAULT_PROPS}
        {...CLIP}
      />
      <Composition
        id="redesign"
        component={RedesignClip}
        durationInFrames={REDESIGN_FRAMES}
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
