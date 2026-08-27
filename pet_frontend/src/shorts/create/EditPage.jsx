/*
 * ③ 편집 페이지 — 플로우의 핵심 편집기. (가이드 5절 · 10절 4단계)
 *
 * 가운데는 ②에서 규격을 맞춘 미리보기(구간 반복 + 9:16 크롭)이고, 그 위에 버튼 셋이 얹힌다:
 *   왼쪽 위 [T 텍스트] · 가운데 위 [♪ 사운드] · 오른쪽 위 [🔊 볼륨]
 * 각각 바텀시트를 열고, 결과는 draft에 쌓인다.
 *
 * **미리보기가 곧 결과다.** 곡·볼륨·글자가 전부 이 화면에서 실제로 들리고 보여야 한다 —
 * 시트에서 값만 바꾸고 확인은 발행 후에 하게 되면, 무엇을 만들고 있는지 모른 채 넘어가게 된다.
 * 그래서 배경음악은 여기서도 영상 구간에 맞춰 함께 돌린다(피드의 syncAudio와 같은 방식).
 *
 * 한 번에 시트 하나만 연다. 둘 다 열면 미리보기가 화면 밖으로 밀려 편집 결과를 볼 수 없다.
 */

import { useEffect, useRef, useState } from 'react'
import { cropMediaStyle, cropPanStyle } from '../cropFrame'
import { findTrack } from '../musicCatalog'
import OverlayTextLayer from './OverlayTextLayer'
import SoundSheet from './SoundSheet'
import { MAX_OVERLAY_TEXTS } from './overlayText'
import TextSheet from './TextSheet'
import VolumeSheet from './VolumeSheet'
import { STEP_PUBLISH } from './ShortsCreateFlow'

// 구간 끝이라고 볼 여유(초). timeupdate가 띄엄띄엄 와서 `>= end`만 보면 매번 조금씩 넘긴다
const END_EPSILON = 0.05
// 곡 위치가 이만큼 어긋나면 다시 맞춘다. 매 틱 대입하면 재생이 끊긴다
const RESYNC_TOLERANCE_SEC = 0.35

const TOOLS = [
  { key: 'text', icon: 'T', label: '텍스트', place: 'sc-tool-left' },
  { key: 'sound', icon: '♪', label: '사운드', place: 'sc-tool-center' },
  { key: 'volume', icon: '🔊', label: '볼륨', place: 'sc-tool-right' },
]

export default function EditPage({ draft, patchDraft, goBack, goStep }) {
  const [sheet, setSheet] = useState('') // '' = 닫힘
  const [selectedTextId, setSelectedTextId] = useState('')

  const videoRef = useRef(null)
  const audioRef = useRef(null)
  // 프레임 자체는 이제 포인터를 다루지 않는다(글자 끌기는 OverlayTextLayer가 맡는다).
  // ref는 남겨 둔다 — 4단계에서 프레임 기준 계산이 다시 필요해질 자리다
  const frameRef = useRef(null)

  const track = findTrack(draft.musicKey)

  /*
   * 사운드 시트는 **자기 오디오 요소**로 곡을 들려준다(목록 훑기·구간 미리듣기).
   * 그동안 이쪽 오디오까지 같은 곡을 돌리면 시작점이 달라 메아리처럼 겹쳐 들린다.
   * 시트가 열려 있는 동안은 이쪽을 쉬게 하고, 닫히면 syncAudio가 알아서 다시 붙는다.
   *
   * 볼륨 시트는 반대다 — 곡이 계속 나야 슬라이더를 움직인 결과를 귀로 확인할 수 있다.
   */
  const soundSheetOpen = sheet === 'sound'

  /* ───── 미리보기: 구간 반복 + 곡 동기 ───── */
  const syncAudio = () => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio || audio.readyState < 1) return

    if (soundSheetOpen) {
      if (!audio.paused) audio.pause()
      return
    }

    if (video.paused) {
      if (!audio.paused) audio.pause()
      return
    }
    // 곡의 시작점을 **구간의 시작**과 맞춘다. 영상 시계를 그대로 더하면 잘라낸 앞부분만큼 앞서 나간다
    let target = draft.musicStartSec + Math.max(0, video.currentTime - draft.trimStart)
    if (Number.isFinite(audio.duration) && audio.duration > 0 && target >= audio.duration) {
      // 곡이 구간보다 짧으면 나머지로 되돌려 반복한다 (업로드 화면의 "부족한 만큼 반복됩니다")
      target =
        draft.musicStartSec < audio.duration
          ? draft.musicStartSec + ((target - draft.musicStartSec) % (audio.duration - draft.musicStartSec))
          : 0
    }
    if (Math.abs(audio.currentTime - target) > RESYNC_TOLERANCE_SEC) audio.currentTime = target
    if (audio.paused) audio.play().catch(() => {})
  }

  const onTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    if (
      video.currentTime >= draft.trimEnd - END_EPSILON ||
      video.currentTime < draft.trimStart - 0.3
    ) {
      video.currentTime = draft.trimStart
      const audio = audioRef.current
      if (audio) audio.currentTime = draft.musicStartSec
    }
    syncAudio()
  }

  // 볼륨은 요소의 속성이라 JSX로 줄 수 없다 — 값이 바뀔 때마다 직접 대입한다
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = draft.videoVolume / 100
  }, [draft.videoVolume])
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = draft.musicVolume / 100
  }, [draft.musicVolume])

  /*
   * 사운드 시트가 열리는 순간 곧바로 멈춘다. syncAudio는 timeupdate를 기다리므로
   * 그때까지(최대 250ms 안팎) 두 소리가 함께 난다 — 짧지만 확실히 들린다.
   * 닫힐 때는 시트가 고른 시작점부터 다시 붙게 위치를 맞춰둔다.
   */
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (soundSheetOpen) {
      audio.pause()
      return
    }
    audio.currentTime = draft.musicStartSec
  }, [soundSheetOpen, draft.musicKey, draft.musicStartSec])

  // 화면을 떠날 때 곡을 멈춘다. 놔두면 발행 화면·피드까지 소리가 따라간다
  useEffect(() => {
    const held = audioRef
    return () => held.current?.pause()
  }, [])

  /*
   * 글자를 만질 수 있는 상태. 텍스트 시트가 열려 있을 때만이다 —
   * 항상 받으면 사운드를 고르는 중에 미리보기를 무심코 눌러 글자가 옮겨진다.
   *
   * 옮기기·지우기는 OverlayTextLayer가 맡는다(끌어서 이동, 아래 쓰레기통으로 끌면 삭제).
   */
  const textActive = sheet === 'text'

  const openSheet = (key) => {
    setSheet((prev) => (prev === key ? '' : key))
    // 텍스트 시트를 닫으면 고른 글자도 푼다 — 안 그러면 다른 시트에서 미리보기를 눌렀을 때
    // 엉뚱한 글자가 따라 움직인다
    if (key !== 'text') setSelectedTextId('')
  }

  const summaryOf = (key) => {
    if (key === 'sound') return track ? track.title : '없음'
    if (key === 'text') return draft.textOverlays.length > 0 ? `${draft.textOverlays.length}개` : '없음'
    return `${draft.videoVolume} / ${draft.musicVolume}`
  }

  return (
    <div className="sc-page">
      <header className="sc-bar">
        <button type="button" className="sc-back" onClick={goBack} aria-label="이전 단계로">
          ←
        </button>
        <span className="sc-title">편집</span>
        <button type="button" className="sc-next" onClick={() => goStep(STEP_PUBLISH)}>
          다음
        </button>
      </header>

      <div className="sc-viewport sc-viewport-frame">
        <div ref={frameRef} className={textActive ? 'sc-frame sc-frame-grab' : 'sc-frame'}>
          <div className="crop-pan" style={cropPanStyle(draft.crop)}>
            <video
              ref={videoRef}
              className="crop-media"
              style={cropMediaStyle(draft.crop, draft.size)}
              src={draft.videoUrl}
              playsInline
              autoPlay
              loop
              onTimeUpdate={onTimeUpdate}
              onPlay={syncAudio}
              onPause={syncAudio}
              onLoadedMetadata={() => {
                const video = videoRef.current
                if (!video) return
                video.currentTime = draft.trimStart
                video.volume = draft.videoVolume / 100
              }}
            />
          </div>

          {/* 얹힌 글자들. 피드(.sf-overlay-text)와 같은 규칙으로 그려야 미리보기가 거짓말을 하지 않는다 */}
          <OverlayTextLayer
            items={draft.textOverlays}
            onChange={(next) => patchDraft({ textOverlays: next })}
            active={textActive}
            selectedId={selectedTextId}
            onSelect={setSelectedTextId}
          />

          {/* 상단 3버튼. 미리보기 위에 얹혀야 편집 결과를 보면서 만질 수 있다 */}
          <div className="sc-tools">
            {TOOLS.map((tool) => (
              <button
                key={tool.key}
                type="button"
                className={`sc-tool ${tool.place}${sheet === tool.key ? ' sc-tool-on' : ''}`}
                onClick={() => openSheet(tool.key)}
                aria-expanded={sheet === tool.key}
              >
                <span aria-hidden="true">{tool.icon}</span>
                <em>{tool.label}</em>
                <i>{summaryOf(tool.key)}</i>
              </button>
            ))}
          </div>

          {textActive && draft.textOverlays.length > 0 && (
            <div className="sc-frame-hint">글자를 끌어 옮기고, 아래로 끌면 지워집니다</div>
          )}
        </div>
      </div>

      {/*
        배경음악 미리듣기. 시트가 아니라 여기 두는 이유: 시트를 닫아도 곡은 계속 들려야
        "이 영상에 이 곡이 얹힌 모습"을 확인할 수 있다. loop을 쓰지 않는다 — loop은 0초로
        되감아 업로더가 고른 구간을 벗어난다. 구간 반복은 syncAudio가 영상 위치로 맞춘다
      */}
      {track && (
        <audio
          ref={audioRef}
          src={track.url}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const audio = e.currentTarget
            audio.volume = draft.musicVolume / 100
            const start = draft.musicStartSec
            audio.currentTime = Number.isFinite(audio.duration) && start < audio.duration ? start : 0
          }}
        />
      )}

      {sheet === 'sound' && (
        <SoundSheet draft={draft} patchDraft={patchDraft} onClose={() => setSheet('')} />
      )}
      {sheet === 'text' && (
        <TextSheet
          draft={draft}
          patchDraft={patchDraft}
          selectedId={selectedTextId}
          onSelect={setSelectedTextId}
          onClose={() => {
            setSheet('')
            setSelectedTextId('')
          }}
        />
      )}
      {sheet === 'volume' && (
        <VolumeSheet draft={draft} patchDraft={patchDraft} onClose={() => setSheet('')} />
      )}

      {!sheet && (
        <div className="sc-panel">
          {/* 두 문장을 각각 한 줄로 (2026-08-26 사용자 요청) — 좁은 폭에서 임의로 접히면
              "글자는"과 개수가 갈라져 읽힌다. <br />로 끊는 자리를 고정한다 */}
          <p className="sc-note">
            위 버튼으로 <strong>글자·음악·볼륨</strong>을 얹으세요.
            <br />
            글자는 {MAX_OVERLAY_TEXTS}개까지 넣을 수 있습니다.
          </p>
        </div>
      )}
    </div>
  )
}
