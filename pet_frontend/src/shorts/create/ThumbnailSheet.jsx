/*
 * 커버(썸네일) 정하기 시트. (가이드 6-1절)
 *
 *   큰 미리보기 (고른 시점 프레임 + 커버 글자)
 *   ────────────────────────────────────────
 *   ▓▒░▓▒░▓▒░ 필름스트립 — 손잡이를 끌어 시점 선택
 *   [+ 글자]
 *
 * 여기 글자는 **영상 자막과 완전히 별개**다. 커버 사진에만 박히고 재생 중에는 뜨지 않는다.
 * 그래서 draft에서도 배열이 나뉘어 있다(textOverlays vs thumbnailTextOverlays).
 *
 * 미리보기는 <video>를 그 시점에 멈춰 세워 쓴다. 필름스트립 조각을 확대해 쓰면 27×48짜리
 * jpeg라 뭉개져서, 커버가 실제로 어떻게 보일지 알 수 없다.
 */

import { useEffect, useRef, useState } from 'react'
import { cropMediaStyle, cropPanStyle } from '../cropFrame'
import { FRAME_COUNT, buildFilmstrip } from './filmstrip'
import OverlayTextLayer from './OverlayTextLayer'
import {
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_SIZE,
  MAX_OVERLAY_TEXT,
  MAX_OVERLAY_TEXTS,
  TEXT_COLORS,
} from './overlayText'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export default function ThumbnailSheet({ draft, patchDraft, onClose }) {
  const [frames, setFrames] = useState([])
  const [input, setInput] = useState('')
  const [selectedId, setSelectedId] = useState('')
  // 새로 추가할 글자의 색이자, 고른 글자가 있으면 그것을 바로 바꾼다 (TextSheet와 같은 규칙).
  // 크기·기울기는 시트가 아니라 미리보기에서 직접 만진다
  const [color, setColor] = useState(DEFAULT_TEXT_COLOR)
  const size = DEFAULT_TEXT_SIZE

  const videoRef = useRef(null)
  const trackRef = useRef(null)
  const frameRef = useRef(null)
  const draggingHandleRef = useRef(false)

  const overlays = draft.thumbnailTextOverlays
  const start = draft.trimStart
  const end = draft.trimEnd
  const span = Math.max(0.001, end - start)
  const percent = ((draft.thumbnailTimeSec - start) / span) * 100

  /* ───── 필름스트립 ───── */
  useEffect(() => {
    const controller = new AbortController()
    setFrames([])
    // 원본 전체가 아니라 **잘라낸 구간**만 훑는다 — 커버는 그 구간 안에서만 고를 수 있다
    buildFilmstrip(draft.videoUrl, span, {
      signal: controller.signal,
      onFrame: (index, dataUrl) =>
        setFrames((prev) => {
          const next = prev.slice()
          next[index] = dataUrl
          return next
        }),
      offset: start,
    })
    return () => controller.abort()
  }, [draft.videoUrl, start, span])

  /* ───── 미리보기를 고른 시점에 세운다 ───── */
  useEffect(() => {
    const video = videoRef.current
    if (video && video.readyState >= 1) video.currentTime = draft.thumbnailTimeSec
  }, [draft.thumbnailTimeSec])

  /* ───── 시점 손잡이 ───── */
  const timeFromPointer = (event) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return clamp(start + ((event.clientX - rect.left) / rect.width) * span, start, end)
  }

  const moveHandle = (event) => {
    const time = timeFromPointer(event)
    if (time != null) patchDraft({ thumbnailTimeSec: time })
  }
  const onTrackDown = (event) => {
    draggingHandleRef.current = true
    event.currentTarget.setPointerCapture?.(event.pointerId)
    moveHandle(event)
  }
  const onTrackMove = (event) => {
    if (draggingHandleRef.current) moveHandle(event)
  }
  const onTrackUp = (event) => {
    if (!draggingHandleRef.current) return
    draggingHandleRef.current = false
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  /* ───── 커버 글자 ───── */
  const addText = () => {
    const text = input.trim()
    if (!text || overlays.length >= MAX_OVERLAY_TEXTS) return
    const item = { id: `c${Date.now()}${overlays.length}`, text, top: 50, left: 50, color, size }
    patchDraft({ thumbnailTextOverlays: [...overlays, item] })
    setSelectedId(item.id)
    setInput('')
  }
  const updateText = (id, partial) =>
    patchDraft({
      thumbnailTextOverlays: overlays.map((t) => (t.id === id ? { ...t, ...partial } : t)),
    })

  const pickColor = (next) => {
    setColor(next)
    if (selectedId) updateText(selectedId, { color: next })
  }
  // 고른 글자가 바뀌면 팔레트를 그 글자의 색에 맞춘다 (이유는 TextSheet의 같은 effect 주석 참고)
  useEffect(() => {
    const item = draft.thumbnailTextOverlays.find((t) => t.id === selectedId)
    if (item) setColor(item.color ?? DEFAULT_TEXT_COLOR)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  return (
    <div className="sc-sheet sc-sheet-tall">
      <div className="sc-sheet-bar">
        <strong>커버 정하기</strong>
        <button type="button" className="sc-sheet-close" onClick={onClose}>
          완료
        </button>
      </div>

      <div className="sc-sheet-body">
        {/* 큰 미리보기. 여기 보이는 그대로가 구워진다 — 글자 크기도 같은 비율(cqw)을 쓴다 */}
        <div ref={frameRef} className="sc-cover sc-frame-grab">
          <div className="crop-pan" style={cropPanStyle(draft.crop)}>
            <video
              ref={videoRef}
              className="crop-media"
              style={cropMediaStyle(draft.crop, draft.size)}
              src={draft.videoUrl}
              muted
              playsInline
              preload="auto"
              onLoadedData={(e) => {
                e.currentTarget.currentTime = draft.thumbnailTimeSec
              }}
            />
          </div>
          {/* ③ 편집기와 같은 방식으로 끌어 옮기고 쓰레기통으로 끌어 지운다 —
              같은 동작이 두 화면에서 다르면 어느 쪽 규칙인지 매번 기억해야 한다 */}
          <OverlayTextLayer
            items={overlays}
            onChange={(next) => patchDraft({ thumbnailTextOverlays: next })}
            active
            selectedId={selectedId}
            onSelect={setSelectedId}
            textClassName="sc-cover-text"
          />
        </div>

        {/* 필름스트립 스크럽 — 카메라 앱처럼 프레임이 죽 늘어서야 어디를 고르는지 보인다 */}
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
                // draggable={false} 이유는 TrimPage의 같은 자리 주석 참고 (스크럽이 끊긴다)
                <img key={i} src={frames[i]} alt="" draggable={false} />
              ) : (
                <span key={i} className="sc-track-blank" />
              )
            )}
          </div>
          <div className="sc-scrub" style={{ left: `${percent}%` }} aria-hidden="true" />
        </div>

        <div className="sc-text-add">
          <input
            type="text"
            className="sc-search"
            value={input}
            maxLength={MAX_OVERLAY_TEXT}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addText()
              }
            }}
            placeholder="커버에 넣을 글자 (선택)"
            disabled={overlays.length >= MAX_OVERLAY_TEXTS}
            aria-label="커버에 넣을 글자"
          />
          <button
            type="button"
            className="sc-next"
            onClick={addText}
            disabled={!input.trim() || overlays.length >= MAX_OVERLAY_TEXTS}
          >
            추가
          </button>
        </div>

        <div className="sc-colors" role="group" aria-label="커버 글자 색">
          {TEXT_COLORS.map((value) => (
            <button
              key={value}
              type="button"
              className={value === color ? 'sc-color sc-color-on' : 'sc-color'}
              style={{ background: value }}
              onClick={() => pickColor(value)}
              aria-label={`글자 색 ${value}`}
              aria-pressed={value === color}
            />
          ))}
        </div>

        <p className="sc-note">
          커버 글자는 <strong>사진에만</strong> 박힙니다 — 영상 재생 중에는 뜨지 않습니다.
          {overlays.length > 0 && (
            <>
              {' '}미리보기에서 <strong>끌어서 옮기고</strong>, 두 손가락(또는 손잡이)으로{' '}
              <strong>키우고 기울입니다</strong>. 아래 쓰레기통으로 끌면 삭제됩니다.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
