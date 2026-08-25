/*
 * ♪ 사운드 추가 시트. (가이드 5-1절)
 *
 * 곡 목록 → 고르기 → 어느 구간을 쓸지. 곡은 DB가 아니라 정적 카탈로그(musicCatalog.js 66곡)에서
 * 온다 — 서버도 그 키만 받는다(ShortsMusicKeys). 가이드의 GET /api/music은 이 저장소에 없다.
 *
 * **시작 구간 규칙**: 구간 길이는 영상 길이와 같고, 시작점은 `곡 길이 - 영상 길이`를 넘을 수 없다.
 * 1분 곡 + 20초 영상이면 0~40초만 고를 수 있다. 41초에서 시작하면 20초를 못 채우기 때문이다.
 *
 * 곡을 고르는 즉시 재생한다. 따로 재생 버튼을 눌러야 들리게 했더니 **무슨 곡인지 확인하지 않은 채
 * 넘어가는 일**이 생겼다(기존 업로드 화면에서 실제로 겪은 문제다). 재생을 클릭 핸들러 안에서
 * 동기로 시작하는 것도 중요하다 — 그 컨텍스트를 벗어나면 브라우저 자동재생 정책에 막힌다.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { MUSIC_TRACKS, findTrack } from '../musicCatalog'

// 0:07 형태. 초 숫자만 보여주면 어디쯤인지 감이 안 온다
function mmss(totalSec) {
  const s = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function SoundSheet({ draft, patchDraft, onClose }) {
  const [query, setQuery] = useState('')
  const [previewKey, setPreviewKey] = useState('') // 목록에서 훑어 듣는 중인 곡
  const [trackDuration, setTrackDuration] = useState(null)
  const [segmentPlaying, setSegmentPlaying] = useState(false)
  const [error, setError] = useState('')

  /*
   * 오디오 요소가 둘이고 역할이 다르다. 하나로 합치면 preload 설정이 충돌한다.
   *   browseRef   목록을 훑는 용도. src를 눌린 곡으로 갈아끼우므로 preload="none"이 맞다
   *   selectedRef 고른 곡 전용. preload="metadata"로 길이를 읽어 슬라이더 상한을 정하고,
   *               같은 요소로 구간 미리듣기를 한다 — 이미 메타데이터가 있어 seek이 바로 먹는다
   */
  const browseRef = useRef(null)
  const selectedRef = useRef(null)
  const segmentTimerRef = useRef(null)

  const selectedTrack = findTrack(draft.musicKey)

  /*
   * 구간 길이 = 영상 길이. **ceil이다.** 영상 길이는 소수라(9.31초 같은 값이 흔하다) round는
   * .5 미만일 때 내림하고, 그러면 아래 maxStart가 그만큼 높게 잡혀 구간이 곡 끝을 넘는다 —
   * 마지막 몇 백 ms가 무음이 된다. ceil이면 항상 시작점 + 영상 길이 <= 곡 길이가 보장된다.
   */
  const videoLength = draft.trimEnd - draft.trimStart
  const segmentSec = Math.ceil(videoLength)
  const maxStart = trackDuration != null ? Math.max(0, Math.floor(trackDuration - segmentSec)) : 0

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return MUSIC_TRACKS
    // 제목과 아티스트를 함께 본다 — "Silent Partner"처럼 아티스트로 찾는 경우가 많다
    return MUSIC_TRACKS.filter(
      (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    )
  }, [query])

  /*
   * 상한이 줄어들면 골라둔 시작점을 끌어내린다.
   * 곡을 고른 뒤 ②로 돌아가 구간을 더 짧게 바꾸는 순서가 문제였다 — 슬라이더는 value에 min()을
   * 씌워 눈금만 내려 보이고 저장값은 예전 값이라, 화면과 저장값이 갈라진다.
   */
  useEffect(() => {
    if (draft.musicStartSec > maxStart) patchDraft({ musicStartSec: maxStart })
    // patchDraft는 매 렌더 새로 만들어져 넣으면 무한 루프가 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxStart, draft.musicStartSec])

  // 시트를 닫거나 화면을 떠날 때 반드시 멈춘다 — 남으면 다음 화면·피드의 소리와 겹쳐 들린다
  useEffect(() => {
    const browse = browseRef
    const selected = selectedRef
    const timer = segmentTimerRef
    return () => {
      browse.current?.pause()
      selected.current?.pause()
      clearTimeout(timer.current)
    }
  }, [])

  const playOrReport = (audio) => {
    audio.play().catch((err) => {
      setError(
        err?.name === 'NotAllowedError'
          ? '브라우저가 소리 재생을 막았습니다. 화면을 한 번 누른 뒤 다시 시도해 주세요.'
          : '음원을 재생할 수 없습니다. 잠시 후 다시 시도해 주세요.'
      )
    })
  }

  // 구간 미리듣기를 영상 길이만큼 재생하고 멈추는 타이머.
  // 멈추는 시점은 ceil한 segmentSec이 아니라 실제 영상 길이로 잰다 — 얹혔을 때와 같아야 한다
  const armSegmentTimer = (audio) => {
    clearTimeout(segmentTimerRef.current)
    segmentTimerRef.current = setTimeout(() => {
      audio.pause()
      setSegmentPlaying(false)
    }, Math.round(videoLength * 1000))
  }

  const stopSegment = () => {
    clearTimeout(segmentTimerRef.current)
    selectedRef.current?.pause()
    setSegmentPlaying(false)
  }

  const pickTrack = (key) => {
    setError('')
    stopSegment()
    setTrackDuration(null)
    setPreviewKey('')
    browseRef.current?.pause()
    patchDraft({ musicKey: key, musicStartSec: 0 })

    const audio = selectedRef.current
    if (!audio) return

    if (!key) {
      // 해제 — src를 비우고 로드를 되감는다. 남겨두면 나중에 엉뚱한 곡이 재생될 수 있다
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      return
    }

    const track = findTrack(key)
    if (!track) return
    audio.src = track.url
    playOrReport(audio) // 새 곡은 0초부터
    setSegmentPlaying(true)
    armSegmentTimer(audio)
  }

  // 목록에서 곡을 식별하기 위한 미리듣기. 처음부터 재생한다(구간 미리듣기는 따로 있다)
  const togglePreview = (track) => {
    const audio = browseRef.current
    if (!audio) return
    stopSegment()
    setError('')

    if (previewKey === track.key) {
      audio.pause()
      setPreviewKey('')
      return
    }
    audio.src = track.url // src를 바꾸면 위치가 0으로 돌아가 따로 되감지 않아도 된다
    playOrReport(audio)
    setPreviewKey(track.key)
  }

  // 시작점을 옮기면 그 자리부터 바로 들려준다 — 멈춰놓으면 어디를 골랐는지 귀로 확인할 수 없다
  const moveStart = (nextSec) => {
    patchDraft({ musicStartSec: nextSec })
    const audio = selectedRef.current
    // 메타데이터가 없으면 seek이 무시된다 — 값만 바꾸고 재생은 건드리지 않는다
    if (!audio || audio.readyState < 1) return
    audio.currentTime = nextSec
    if (audio.paused) playOrReport(audio)
    setSegmentPlaying(true)
    armSegmentTimer(audio)
  }

  const toggleSegment = () => {
    const audio = selectedRef.current
    if (!audio || !selectedTrack) return
    if (segmentPlaying) {
      stopSegment()
      return
    }
    browseRef.current?.pause()
    setPreviewKey('')
    setError('')
    audio.currentTime = Math.min(draft.musicStartSec, maxStart)
    playOrReport(audio)
    setSegmentPlaying(true)
    armSegmentTimer(audio)
  }

  return (
    <div className="sc-sheet sc-sheet-list">
      <div className="sc-sheet-bar">
        <strong>사운드</strong>
        <button type="button" className="sc-sheet-close" onClick={onClose}>
          완료
        </button>
      </div>

      <div className="sc-sheet-body">
        {/* 곡 수는 검색창 안내에 넣었다 — 목록에 한 줄이라도 더 내주려고.
            "저작권 없는 음원"은 남긴다. 무엇을 쓰고 있는지 알려주는 문구라 뺄 수 없다 */}
        <p className="sc-note">
          전부 <strong>저작권 없는 음원</strong>입니다. ▶로 듣고 이름을 눌러 고르세요.
        </p>

        <input
          type="search"
          className="sc-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${MUSIC_TRACKS.length}곡 중 검색 (제목·아티스트)`}
          aria-label="배경음악 검색"
        />

        {results.length === 0 ? (
          <p className="sc-note">검색 결과가 없습니다.</p>
        ) : (
          <ul className="sc-music-list">
            {results.map((track) => {
              const on = draft.musicKey === track.key
              const playing = previewKey === track.key
              return (
                <li key={track.key} className={on ? 'sc-music-item sc-music-on' : 'sc-music-item'}>
                  {/* 미리듣기와 선택을 다른 버튼으로 둔다. 대신 고른 행에 ✓와 색을 분명히 넣어
                      "들어본 것"과 "고른 것"이 구분되게 한다 */}
                  <button
                    type="button"
                    className="sc-music-play"
                    onClick={() => togglePreview(track)}
                    aria-label={`${track.title} 미리듣기`}
                    aria-pressed={playing}
                  >
                    {playing ? '❙❙' : '▶'}
                  </button>
                  <button
                    type="button"
                    className="sc-music-pick"
                    onClick={() => pickTrack(on ? '' : track.key)}
                    aria-pressed={on}
                  >
                    <strong>{track.title}</strong>
                    <em>{track.artist}</em>
                  </button>
                  <span className="sc-music-check" aria-hidden="true">
                    {on ? '✓' : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {selectedTrack && (
          <div className="sc-trim">
            <div className="sc-trim-head">
              <span>사용할 구간</span>
              {trackDuration == null ? (
                <em>곡 길이를 읽는 중…</em>
              ) : (
                <strong>
                  {mmss(draft.musicStartSec)} ~ {mmss(draft.musicStartSec + segmentSec)}
                  <em> / 전체 {mmss(trackDuration)}</em>
                </strong>
              )}
            </div>

            {/* 손잡이가 하나면 충분하다 — 구간 길이가 영상 길이로 고정이라,
                두 개를 주면 영상보다 짧거나 긴 구간을 만들 수 있어 결과가 어긋난다 */}
            <input
              type="range"
              className="sc-trim-range"
              min={0}
              max={maxStart}
              step={1}
              value={Math.min(draft.musicStartSec, maxStart)}
              onChange={(e) => moveStart(Number(e.target.value))}
              disabled={trackDuration == null || maxStart === 0}
              aria-label="음악 시작 지점"
            />

            <div className="sc-trim-foot">
              <button
                type="button"
                className="sc-reset"
                onClick={toggleSegment}
                disabled={trackDuration == null}
              >
                {segmentPlaying ? '❙❙ 정지' : `▶ 다시 듣기 (${segmentSec}초)`}
              </button>
              <button type="button" className="sc-reset" onClick={() => pickTrack('')}>
                곡 해제
              </button>
              {trackDuration != null && maxStart === 0 && (
                <em>곡이 영상({segmentSec}초)보다 짧아 처음부터 쓰며, 부족한 만큼 반복됩니다.</em>
              )}
            </div>
          </div>
        )}

        {error && <p className="sc-error">{error}</p>}

        {/* 목록 훑기 전용. src를 눌린 곡으로 갈아끼우므로 preload는 none이다 */}
        <audio ref={browseRef} onEnded={() => setPreviewKey('')} preload="none" />
        {/*
          고른 곡 전용. src를 JSX로 주지 않고 pickTrack에서 직접 넣는다 — 선언적으로 두면
          고른 뒤 **다음 렌더에야** src가 붙어서 클릭 핸들러 안에서 바로 play()를 부를 수 없고,
          그러면 자동재생 정책에 막힌다. 곡이 없을 때도 요소를 남겨두는 이유도 같다(ref가 비면 안 된다).
        */}
        <audio
          ref={selectedRef}
          preload="metadata"
          onEnded={() => setSegmentPlaying(false)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration
            setTrackDuration(Number.isFinite(d) ? d : null)
          }}
          onError={() => {
            // src를 비운 해제 경로에서도 error가 오므로 곡이 있을 때만 알린다
            if (draft.musicKey) setError('음원을 불러올 수 없습니다. 네트워크를 확인해 주세요.')
          }}
        />
      </div>
    </div>
  )
}
