import { useCallback, useEffect, useRef, useState } from 'react'
import styles from '../CompanyWorkspacePage.module.css'
import vidStyles from './TrainingVideoModal.module.css'
import { youtubeVideoId } from './youtubeUtils'

declare global {
  interface Window {
    YT?: {
      Player: new (
        id: string,
        opts: {
          videoId: string
          playerVars?: Record<string, number | string>
          events?: { onStateChange?: (e: { data: number }) => void }
        },
      ) => YtPlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

type YtPlayer = {
  destroy: () => void
  getCurrentTime: () => number
  getDuration: () => number
  seekTo: (s: number, a?: boolean) => void
  pauseVideo: () => void
  playVideo: () => void
}

const YT_ENDED = 0
const YT_PLAYING = 1

type Props = {
  youtubeUrl: string | null | undefined
  open: boolean
  /** Called after user dismisses (X / Escape) before the video ends naturally. */
  onAbandon?: () => void | Promise<void>
  onClose: () => void
  onCompleted: () => void
}

export function TrainingVideoModal({ youtubeUrl, open, onAbandon, onClose, onCompleted }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YtPlayer | null>(null)
  const maxLegitimateRef = useRef(0)
  const guardRef = useRef<number | null>(null)
  const [apiReady, setApiReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const completedRef = useRef(false)
  const onCompletedRef = useRef(onCompleted)
  const onAbandonRef = useRef(onAbandon)
  onCompletedRef.current = onCompleted
  onAbandonRef.current = onAbandon

  const vid = youtubeVideoId(youtubeUrl ?? null)

  const clearGuard = () => {
    if (guardRef.current != null) {
      window.clearInterval(guardRef.current)
      guardRef.current = null
    }
  }

  const teardown = useCallback(() => {
    clearGuard()
    try {
      playerRef.current?.destroy()
    } catch {
      /* ignore */
    }
    playerRef.current = null
    maxLegitimateRef.current = 0
    completedRef.current = false
    if (containerRef.current) containerRef.current.innerHTML = ''
  }, [])

  const dismissEarly = useCallback(async () => {
    teardown()
    if (!completedRef.current) {
      try {
        await onAbandonRef.current?.()
      } catch {
        /* ignore */
      }
    }
    onClose()
  }, [onClose, teardown])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void dismissEarly()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissEarly])

  useEffect(() => {
    if (!open) {
      teardown()
      return
    }
    if (!vid) {
      setError('Invalid or missing YouTube URL')
      return
    }
    setError(null)
    completedRef.current = false
    setApiReady(false)

    const startApi = () => {
      setApiReady(true)
      if (!containerRef.current) return
      containerRef.current.innerHTML = `<div id="yt-training-player-inner"></div>`
      const innerId = 'yt-training-player-inner'
      playerRef.current = new window.YT!.Player(innerId, {
        videoId: vid,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          disablekb: 1,
          fs: 1,
          playsinline: 1,
          ...(typeof window !== 'undefined' ? { origin: window.location.origin } : {}),
        },
        events: {
          onStateChange: (e: { data: number }) => {
            if (e.data === YT_PLAYING) {
              const p = playerRef.current
              const t0 = p?.getCurrentTime() ?? 0
              maxLegitimateRef.current = Math.max(maxLegitimateRef.current, t0)
              clearGuard()
              guardRef.current = window.setInterval(() => {
                const p2 = playerRef.current
                if (!p2) return
                const t = p2.getCurrentTime()
                const dur = p2.getDuration()
                const maxOk = maxLegitimateRef.current
                // Block large jumps forward (dragging timeline / skip)
                if (t > maxOk + 1.5 && dur > 0 && t < dur - 0.35) {
                  p2.seekTo(maxOk, true)
                  return
                }
                if (t >= maxOk - 0.2) {
                  maxLegitimateRef.current = t
                }
              }, 250)
            }
            if (e.data === YT_ENDED) {
              clearGuard()
              const p = playerRef.current
              if (p) maxLegitimateRef.current = p.getDuration()
              if (!completedRef.current) {
                completedRef.current = true
                onCompletedRef.current()
              }
            }
          },
        },
      })
    }

    if (window.YT?.Player) {
      startApi()
      return () => teardown()
    }

    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const first = document.getElementsByTagName('script')[0]
    first.parentNode?.insertBefore(tag, first)
    window.onYouTubeIframeAPIReady = () => startApi()

    return () => {
      teardown()
      window.onYouTubeIframeAPIReady = undefined
    }
  }, [open, vid, teardown])

  if (!open) return null

  return (
    <div className={vidStyles.backdrop} role="presentation">
      <div className={vidStyles.modal} role="dialog" aria-modal="true" aria-labelledby="training-video-title">
        <div className={vidStyles.header}>
          <h4 id="training-video-title" className={styles.h4} style={{ margin: 0 }}>
            Training video
          </h4>
          <button
            type="button"
            className={vidStyles.closeX}
            aria-label="Close"
            onClick={() => void dismissEarly()}
          >
            ×
          </button>
        </div>
        <p className={styles.hint} style={{ marginTop: '0.35rem' }}>
          Watch from start to finish in this window. Skipping ahead is disabled. Closing before the end
          records no credit (score 0).
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
        {!vid && !error ? <p className={styles.muted}>No video URL for this course.</p> : null}
        {vid ? <div ref={containerRef} className={vidStyles.playerWrap} /> : null}
        {!apiReady && vid ? <p className={styles.muted}>Loading player…</p> : null}
      </div>
    </div>
  )
}
