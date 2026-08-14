/*
 * ② 길이 / 비율 페이지. (가이드 4절 · 10절 3단계)
 *
 * 녹화본이든 파일이든 여기서 처음으로 "숏츠 규격"에 맞춘다. 두 가지를 정한다:
 *   (1) 길이 — 필름스트립 타임라인의 양쪽 손잡이로 시작·끝을 잡는다 (5~30초 강제)
 *   (2) 비율 — 9:16 프레임 안에서 끌거나 확대해 어느 부분을 보여줄지 정한다
 *
 * **영상 파일을 실제로 자르지는 않는다**(가이드 4절 방법 A). 원본을 그대로 올리고
 * trimStart/trimEnd/crop만 저장해서, 재생 쪽이 그 구간·그 위치로 튼다.
 * 그래서 이 화면의 미리보기가 곧 피드에서 보일 모습이다 — 같은 cropFrame 공식을 쓴다.
 */

import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_CROP,
  MAX_SCALE,
  MIN_SCALE,
  clampCrop,
  coverOf,
  cropMediaStyle,
  cropPanStyle,
} from '../cropFrame'
import { MAX_SEC, MIN_SEC } from '../videoFile'
import { FRAME_COUNT, buildFilmstrip } from './filmstrip'
import { STEP_EDIT } from './ShortsCreateFlow'

// 0:07 형태. 초 단위 숫자만 보여주면 어디쯤인지 감이 안 온다
function mmss(totalSec) {
  const s = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/*
 * 구간 끝에 닿았다고 볼 여유(초). timeupdate는 250ms 안팎으로 띄엄띄엄 오기 때문에
 * `t >= end`만 보면 매번 조금씩 넘겨 재생한 뒤에 되감긴다 — 끝부분이 튀어 보인다.
 */
const END_EPSILON = 0.05

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export default function TrimPage({ draft, patchDraft, goBack, goStep }) {
  const raw = draft.rawDuration
  const [range, setRange] = useState({ start: draft.trimStart, end: draft.trimEnd || raw })
  const [crop, setCrop] = useState(() => clampCrop(draft.crop ?? DEFAULT_CROP, draft.size))
  const [frames, setFrames] = useState([])

  const videoRef = useRef(null)
  const trackRef = useRef(null)
  const frameRef = useRef(null)
  // 끌고 있는 손잡이. state로 두면 pointermove마다 리렌더되어 영상이 끊긴다
  const dragRef = useRef(null)
  // 재생 위치 표시선. 값을 state로 들면 초당 수십 번 리렌더되어 영상이 끊기므로 DOM을 직접 만진다
  const playheadRef = useRef(null)
  const rafRef = useRef(0)
  const scrubbingRef = useRef(false)
  // 타임라인을 만지기 직전에 재생 중이었는지. 놓을 때 그 상태로 되돌린다
  const resumeRef = useRef(false)
  // 크롭 드래그/핀치의 시작 상태. 같은 이유로 ref다
  const cropDragRef = useRef(null)
  const pointersRef = useRef(new Map())

  const length = range.end - range.start
  const cover = coverOf(draft.size)
  const canZoom = cover != null

  /* ───── 초안에 반영 ───── */
  useEffect(() => {
    patchDraft({
      trimStart: range.start,
      trimEnd: range.end,
      crop,
      // 커버 시점을 새 구간 안으로 끌어온다. 구간을 좁히면 커버가 구간 밖 장면을 가리키게 되고,
      // 그러면 영상에 없는 화면이 커버로 구워진다 (서버도 같은 규칙으로 한 번 더 자른다)
      thumbnailTimeSec: clamp(draft.thumbnailTimeSec, range.start, range.end),
    })
    // patchDraft는 매 렌더 새로 만들어져 의존성에 넣으면 무한 루프가 된다.
    // 값이 바뀔 때만 밀어 넣으면 충분하다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, crop])

  /* ───── 필름스트립 ───── */
  useEffect(() => {
    const controller = new AbortController()
    setFrames([])
    buildFilmstrip(draft.videoUrl, raw, {
      signal: controller.signal,
      // 한 장씩 채운다 — 열 장을 다 기다리면 몇 초 동안 빈 막대가 보인다
      onFrame: (index, dataUrl) =>
        setFrames((prev) => {
          const next = prev.slice()
          next[index] = dataUrl
          return next
        }),
    })
    return () => controller.abort()
  }, [draft.videoUrl, raw])

  /* ───── 재생 위치 표시선 ───── */
  /*
   * 영상이 흐르는 동안 타임라인 위 선이 따라간다. 이게 없으면 구간을 잡아도 지금 어디를 보고
   * 있는지 알 수 없어서, 미리보기와 타임라인을 머릿속으로 이어붙여야 한다.
   *
   * timeupdate 이벤트를 쓰지 않는 이유: 250ms 안팎으로 띄엄띄엄 와서 선이 뚝뚝 끊겨 움직인다.
   * 대신 매 프레임 DOM의 left만 바꾼다 — 리액트 상태로 두면 초당 수십 번 다시 그려져
   * 영상 재생이 끊긴다.
   */
  useEffect(() => {
    const tick = () => {
      const video = videoRef.current
      const bar = playheadRef.current
      if (video && bar && raw > 0) {
        bar.style.left = `${clamp((video.currentTime / raw) * 100, 0, 100)}%`
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [raw])

  /* ───── 구간 반복 재생 ───── */
  /*
   * 시작점이 바뀌면 그 자리로 옮겨 무엇을 잡았는지 바로 보여준다.
   * 끝 손잡이를 끄는 중에는 건드리지 않는다 — 뒤쪽을 보고 있는데 앞으로 튀면 방해만 된다.
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video || dragRef.current === 'end') return
    video.currentTime = range.start
  }, [range.start])

  const onTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    // 타임라인을 훑는 중에는 건드리지 않는다 — 구간 밖 프레임을 보려는 중인데 되감으면 안 된다
    if (scrubbingRef.current) return
    // 구간 밖으로 나갔으면 시작점으로. 손잡이를 끄는 중에도 계속 구간 안에서 돌게 한다
    if (video.currentTime >= range.end - END_EPSILON || video.currentTime < range.start - 0.3) {
      video.currentTime = range.start
    }
  }

  /* ───── 타임라인을 만지는 동안은 멈춘다 ───── */
  /*
   * 재생 중에 끌면 내가 옮긴 위치와 영상이 흘러간 위치가 뒤엉켜, 지금 보고 있는 프레임이
   * 손가락을 놓은 자리인지 그 뒤로 흘러간 자리인지 알 수 없다. 멈춰 두면 끄는 동안 그 지점의
   * 화면이 그대로 보인다.
   *
   * 놓으면 **원래 상태로** 되돌린다 — 멈춰 둔 상태에서 만졌는데 놓자마자 재생되면 안 된다.
   */
  const holdPlayback = () => {
    const video = videoRef.current
    if (!video) return
    resumeRef.current = !video.paused
    video.pause()
  }
  const releasePlayback = () => {
    const video = videoRef.current
    if (!video) return
    // 사용자 조작(pointerup) 안이라 자동재생 정책에 막히지 않지만, 거부되어도 조용히 넘긴다
    if (resumeRef.current) video.play().catch(() => {})
    resumeRef.current = false
  }

  /* ───── 타임라인 손잡이 ───── */
  const timeFromPointer = (event) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return clamp(((event.clientX - rect.left) / rect.width) * raw, 0, raw)
  }

  const moveHandle = (event) => {
    const time = timeFromPointer(event)
    if (time == null) return

    setRange((prev) => {
      if (dragRef.current === 'start') {
        // 시작점은 "끝에서 최소 길이만큼 앞" 과 "끝에서 최대 길이만큼 앞" 사이에만 놓을 수 있다
        return { ...prev, start: clamp(time, Math.max(0, prev.end - MAX_SEC), prev.end - MIN_SEC) }
      }
      return { ...prev, end: clamp(time, prev.start + MIN_SEC, Math.min(raw, prev.start + MAX_SEC)) }
    })
  }

  const startHandleDrag = (which) => (event) => {
    // 손잡이는 타임라인 위에 얹혀 있다. 막지 않으면 아래 트랙까지 이벤트가 올라가
    // 손잡이를 잡는 순간 재생 위치까지 그리로 튄다
    event.stopPropagation()
    dragRef.current = which
    holdPlayback()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    moveHandle(event)
  }
  const onHandleMove = (event) => {
    if (dragRef.current) moveHandle(event)
  }
  const endHandleDrag = (event) => {
    if (!dragRef.current) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    // 놓으면 다시 시작점부터 — 방금 잡은 구간이 어떤지 처음부터 보여주는 것이 맞다
    const video = videoRef.current
    if (video) video.currentTime = range.start
    releasePlayback()
  }

  /* ───── 타임라인 스크럽 (누른 지점부터 보기) ───── */
  /*
   * 손잡이가 아닌 곳을 누르면 그 지점부터 재생한다. 구간을 잡아 놓고 "가운데쯤 뭐가 있더라"를
   * 확인하려면 이게 있어야 한다 — 없으면 구간이 처음부터 돌아올 때까지 기다려야 한다.
   */
  /*
   * 구간 안으로 자르지 않는다 — **원본 전체**를 훑을 수 있어야 한다.
   * 어디를 잘라야 할지 정하려면 잘라낼 바깥쪽도 봐야 하는데, 구간 안으로 가두면 손잡이를
   * 먼저 옮겨야만 그쪽을 볼 수 있다. 멈춘 상태라 구간 밖 프레임도 그대로 보인다.
   */
  const scrubTo = (event) => {
    const time = timeFromPointer(event)
    const video = videoRef.current
    if (time == null || !video) return
    video.currentTime = time
  }

  const onTrackDown = (event) => {
    scrubbingRef.current = true
    holdPlayback()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    scrubTo(event)
  }
  const onTrackMove = (event) => {
    if (scrubbingRef.current) scrubTo(event)
  }
  const onTrackUp = (event) => {
    if (!scrubbingRef.current) return
    scrubbingRef.current = false
    event.currentTarget.releasePointerCapture?.(event.pointerId)

    /*
     * 놓은 자리에서 이어 재생한다 — 스크럽은 "여기부터 보고 싶다"는 조작이다.
     * 다만 구간 밖에 놓았다면 그 장면은 올라갈 영상에 없다. 그때는 구간 처음으로 되돌린다
     * (그냥 두면 재생이 시작되자마자 onTimeUpdate가 되감아 화면만 한 번 튄다).
     */
    const video = videoRef.current
    if (video && (video.currentTime < range.start || video.currentTime >= range.end)) {
      video.currentTime = range.start
    }
    releasePlayback()
  }

  /* ───── 9:16 위치 (끌기 · 핀치) ───── */
  const applyCrop = (next) => setCrop(clampCrop(next, draft.size))

  const onFramePointerDown = (event) => {
    if (!canZoom) return
    frameRef.current?.setPointerCapture?.(event.pointerId)
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect) return
    cropDragRef.current = {
      rect,
      crop,
      x: event.clientX,
      y: event.clientY,
      // 두 손가락이면 벌린 거리를 기준으로 배율을 잡는다
      pinchDistance: pinchDistance(),
    }
  }

  function pinchDistance() {
    const points = [...pointersRef.current.values()]
    if (points.length < 2) return 0
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  }

  const onFramePointerMove = (event) => {
    const drag = cropDragRef.current
    if (!drag) return
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }

    const distance = pinchDistance()
    if (drag.pinchDistance > 0 && distance > 0) {
      // 핀치 — 벌린 비율만큼 확대한다. 미는 것은 손가락 하나일 때만 다룬다
      applyCrop({ ...drag.crop, scale: drag.crop.scale * (distance / drag.pinchDistance) })
      return
    }

    // 끌기 — 움직인 픽셀을 프레임 크기로 나눠 "프레임의 몇 배"로 바꾼다 (저장 단위와 같다)
    applyCrop({
      ...drag.crop,
      offsetX: drag.crop.offsetX + (event.clientX - drag.x) / drag.rect.width,
      offsetY: drag.crop.offsetY + (event.clientY - drag.y) / drag.rect.height,
    })
  }

  const endFrameDrag = (event) => {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size === 0) cropDragRef.current = null
    frameRef.current?.releasePointerCapture?.(event.pointerId)
  }

  const startPercent = (range.start / raw) * 100
  const endPercent = (range.end / raw) * 100

  return (
    <div className="sc-page">
      <header className="sc-bar">
        <button type="button" className="sc-back" onClick={goBack} aria-label="이전 단계로">
          ←
        </button>
        <span className="sc-title">길이 · 비율</span>
        <button type="button" className="sc-next" onClick={() => goStep(STEP_EDIT)}>
          다음
        </button>
      </header>

      {/* 프레임을 정확히 9:16으로 둔다 — 화면에 남는 공간을 다 쓰면 비율이 달라져
          "여기서 맞춘 위치"가 피드와 어긋난다 */}
      <div className="sc-viewport sc-viewport-frame">
        <div
          ref={frameRef}
          className={canZoom ? 'sc-frame sc-frame-grab' : 'sc-frame'}
          onPointerDown={onFramePointerDown}
          onPointerMove={onFramePointerMove}
          onPointerUp={endFrameDrag}
          onPointerCancel={endFrameDrag}
        >
          <div className="crop-pan" style={cropPanStyle(crop)}>
            <video
              ref={videoRef}
              className="crop-media"
              style={cropMediaStyle(crop, draft.size)}
              src={draft.videoUrl}
              muted
              playsInline
              autoPlay
              loop
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={() => {
                if (videoRef.current) videoRef.current.currentTime = range.start
              }}
            />
          </div>
          {canZoom && crop.scale === 1 && crop.offsetX === 0 && crop.offsetY === 0 && (
            <div className="sc-frame-hint">끌어서 위치 · 두 손가락으로 확대</div>
          )}
        </div>
      </div>

      <div className="sc-panel sc-trim-panel">
        <div className="sc-trim-head">
          <strong>
            {mmss(range.start)} ~ {mmss(range.end)}
          </strong>
          <em>
            {length.toFixed(1)}초 / 원본 {raw.toFixed(1)}초
          </em>
        </div>

        {/* 필름스트립 + 양쪽 손잡이. 선택 구간만 밝고 바깥은 어둡게 덮는다.
            손잡이가 아닌 곳을 누르면 그 지점부터 재생된다(스크럽) */}
        <div
          className="sc-track sc-track-scrub"
          ref={trackRef}
          onPointerDown={onTrackDown}
          onPointerMove={onTrackMove}
          onPointerUp={onTrackUp}
          onPointerCancel={onTrackUp}
        >
          <div className="sc-track-frames" aria-hidden="true">
            {Array.from({ length: FRAME_COUNT }, (_, i) =>
              frames[i] ? (
                // draggable={false} 필수 — 없으면 이미지를 누르고 끄는 순간 브라우저가
                // 이미지 드래그를 시작하며 pointercancel을 던져 스크럽이 첫 클릭에서 끊긴다
                <img key={i} src={frames[i]} alt="" draggable={false} />
              ) : (
                <span key={i} className="sc-track-blank" />
              )
            )}
          </div>
          <div className="sc-track-shade" style={{ left: 0, width: `${startPercent}%` }} />
          <div className="sc-track-shade" style={{ left: `${endPercent}%`, right: 0 }} />
          <div
            className="sc-track-window"
            style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
          />
          {/* 지금 재생 중인 지점. left는 매 프레임 위 rAF가 직접 넣는다 */}
          <div ref={playheadRef} className="sc-scrub" aria-hidden="true" />
          <button
            type="button"
            className="sc-handle sc-handle-start"
            style={{ left: `${startPercent}%` }}
            onPointerDown={startHandleDrag('start')}
            onPointerMove={onHandleMove}
            onPointerUp={endHandleDrag}
            onPointerCancel={endHandleDrag}
            aria-label="시작 지점"
          />
          <button
            type="button"
            className="sc-handle sc-handle-end"
            style={{ left: `${endPercent}%` }}
            onPointerDown={startHandleDrag('end')}
            onPointerMove={onHandleMove}
            onPointerUp={endHandleDrag}
            onPointerCancel={endHandleDrag}
            aria-label="끝 지점"
          />
        </div>

        <div className="sc-zoom">
          <span aria-hidden="true">🔍</span>
          <input
            type="range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={0.01}
            value={crop.scale}
            disabled={!canZoom}
            onChange={(e) => applyCrop({ ...crop, scale: Number(e.target.value) })}
            aria-label="확대"
          />
          <button
            type="button"
            className="sc-reset"
            onClick={() => setCrop(DEFAULT_CROP)}
            disabled={!canZoom}
          >
            가운데로
          </button>
        </div>

        <p className="sc-note">
          {MIN_SEC}~{MAX_SEC}초 안에서 자를 수 있습니다. 양쪽 <strong>손잡이</strong>로 구간을
          잡고, 타임라인의 다른 곳을 누르면 <strong>그 지점부터</strong> 볼 수 있습니다.
          원본은 그대로 올라가고 이 구간만 재생됩니다.
        </p>
      </div>
    </div>
  )
}
