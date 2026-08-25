import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMyPets } from '../pet/petApi'
import MarqueeText from './MarqueeText'
import { MUSIC_TRACKS, findTrack } from './musicCatalog'
import { createShorts, uploadVideoFile } from './shortsApi'
/*
 * 주제 목록과 영상 파일 규칙은 새 제작 플로우(create/)와 함께 쓰는 공용 모듈에서 가져온다.
 * 이 화면에 사본을 두면 두 화면이 다른 규칙으로 막게 되고, 한쪽에서 통과한 파일이
 * 다른 쪽에서 튕긴다 (2026-08-14 추출).
 */
import { MAX_TOPICS, SUGGEST_DELAY_MS, TOPICS, matchTopics } from './topics'
import {
  CROP_WARN_THRESHOLD,
  MAX_SEC,
  MIN_SEC,
  VIDEO_ACCEPT,
  cropInfo,
  maxMegabytes,
  pickVideoFile,
} from './videoFile'
import '../member/member.css'
import './shortsUpload.css'

const MAX_CAPTION = 500
// 영상 위 텍스트. 설명(500자)보다 훨씬 짧은 이유는 화면 안에 얹히는 글자라 길면 영상을 다 덮기 때문
const MAX_OVERLAY_TEXT = 100
/*
 * 영상 위 글자는 **하나만** 넣는다. 여러 개를 허용했다가 화면이 복잡해져 되돌렸다.
 *
 * 저장 컬럼(shorts.overlay_texts)은 jsonb 배열로 남겨 두었고 서버도 목록으로 받는다 —
 * 다시 여러 개로 열려면 서버의 Shorts.MAX_OVERLAY_TEXTS와 ShortsCreateRequest의 @Size,
 * 그리고 이 화면의 목록 UI만 되살리면 되고 스키마는 그대로 쓸 수 있다.
 */

/*
 * 소리 설정 세 모드. 서버로는 (musicKey, muteOriginal) 두 값으로 풀어 보낸다 —
 * 화면이 셋으로 묶어 보여주는 것이고 DB 표현은 그대로다.
 *
 *   original  원본 소리 그대로        → musicKey=null,     muteOriginal=false
 *   mute      소리 없이               → musicKey=null,     muteOriginal=true
 *   music     배경음악 (원본 자동 음소거) → musicKey=고른 곡, muteOriginal=true
 *
 * "원본 소리 + 음악 동시"는 넣지 않았다. 두 소리가 섞이면 대개 둘 다 못 알아듣고,
 * 실제 숏츠·틱톡도 고른 곡이 그 영상의 소리가 되는 방식이다.
 */
const SOUND_ORIGINAL = 'original'
const SOUND_MUTE = 'mute'
const SOUND_MUSIC = 'music'

const SOUND_MODES = [
  { value: SOUND_ORIGINAL, label: '영상 소리 그대로', hint: '영상에 녹음된 소리가 그대로 나갑니다.' },
  { value: SOUND_MUTE, label: '음소거', hint: '아무 소리도 나지 않습니다.' },
  { value: SOUND_MUSIC, label: '배경음악 넣기', hint: '고른 곡이 나가고 영상 원본 소리는 자동으로 꺼집니다.' },
]

/*
 * 텍스트를 놓을 수 있는 범위 (%). 프레임 전체다 — 누른 자리에 그대로 놓인다.
 *
 * 전에는 잘림을 막으려고 안쪽으로 좁혔는데, 글자가 줄바꿈되지 않고 잘리는 방식으로 바꾼 뒤로는
 * 좁힐 이유가 없어졌다. 프레임 밖으로 나간 부분은 overflow:hidden이 잘라낸다.
 *
 * 그래도 0~100으로 자르는 것은 필요하다 — 끄는 동안 포인터를 붙잡아 두기 때문에(setPointerCapture)
 * 손가락이 프레임을 벗어나면 음수나 100을 넘는 값이 들어온다.
 */
const TEXT_TOP_RANGE = [0, 100]
const TEXT_LEFT_RANGE = [0, 100]

const clampTo = (value, [lo, hi]) => Math.min(hi, Math.max(lo, value))

// 0:07 형태. 곡 구간 표시에 쓴다 — 초 단위 숫자만 보여주면 어디쯤인지 감이 안 온다
function mmss(totalSec) {
  const s = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function ShortsUploadPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [duration, setDuration] = useState(null) // 초 단위 실수
  const [size, setSize] = useState(null) // { width, height }
  const [previewUrl, setPreviewUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [topics, setTopics] = useState([])
  const [topicError, setTopicError] = useState('')
  const [topicNotice, setTopicNotice] = useState('')
  const [fileError, setFileError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [step, setStep] = useState('') // 진행 상황 안내 ('' = 대기)
  const [pets, setPets] = useState([]) // 내 반려동물 목록. 실패하거나 0마리면 빈 배열
  const [petIds, setPetIds] = useState([]) // 고른 반려동물 id들. 빈 배열 = 고르지 않음
  /*
   * 소리 설정. 체크박스 + 독립적인 곡 선택이 아니라 **세 모드 중 하나**로 둔다.
   *
   * 처음에는 "원본 음소거"와 "곡 선택"을 독립으로 뒀는데(넷 다 가능한 구조) 실제로 써보니
   * 미리듣기(▶)만 누르고 곡을 고르지 않은 채 올리는 일이 생겼다 — 들어봤으니 골랐다고
   * 여기게 된다. 그러면 muteOriginal만 true로 저장되어 **무음 영상**이 올라간다.
   * 실제로 그렇게 올라간 영상이 있었다.
   *
   * 모드로 묶으면 그 상태가 만들어질 수 없다 — music 모드는 곡을 골라야 제출이 되고,
   * mute 모드는 곡 목록 자체가 뜨지 않는다.
   */
  const [soundMode, setSoundMode] = useState(SOUND_ORIGINAL)
  const [musicKey, setMusicKey] = useState('') // music 모드에서 고른 곡 key. '' = 아직 안 고름
  const [musicQuery, setMusicQuery] = useState('') // 곡 검색어 (66곡을 훑기 어려워 필요하다)
  const [previewKey, setPreviewKey] = useState('') // 미리듣기 중인 곡. '' = 정지 상태
  const [musicError, setMusicError] = useState('') // music 모드인데 곡을 안 고른 경우
  const [musicStartSec, setMusicStartSec] = useState(0) // 곡의 어느 지점부터 쓸지 (슬라이더 값)
  // 고른 곡의 전체 길이(초). null = 아직 메타데이터를 못 읽음.
  // 서버 카탈로그에 길이를 넣지 않고 브라우저가 읽게 한 이유: mp3 길이를 정확히 구하려면
  // 프레임을 파싱해야 하고(VBR 때문에 파일 크기로 추정이 안 된다) 그럴 도구가 빌드에 없다.
  // audio 요소는 metadata만 받아도 duration을 알려주므로 추가 의존성이 필요 없다
  const [trackDuration, setTrackDuration] = useState(null)

  const [segmentPlaying, setSegmentPlaying] = useState(false) // 구간 미리듣기 재생 중인지

  /*
   * 화면 단계. 한 화면에 전부 넣으면 스크롤이 길어져 미리보기를 보면서 소리를 고를 수 없다.
   *
   *   edit    파일 선택 → 큰 미리보기에서 소리·텍스트를 확정 ("영상이 어떻게 뜰지" 결정)
   *   details 설명·반려동물·주제 (검색과 추천에 쓰이는 정보)
   *
   * 파일이 없으면 edit 단계의 미리보기 자리에 파일 선택만 뜬다 — 고를 영상이 없는데
   * 소리·텍스트를 먼저 정하게 하면 무엇에 적용되는지 알 수 없다.
   */
  const [phase, setPhase] = useState('edit')
  // 미리보기 아래에 펼쳐지는 편집 패널. '' = 닫힘. 소리와 텍스트를 동시에 펼치지 않는다 —
  // 둘 다 열면 미리보기가 화면 밖으로 밀려 편집 결과를 볼 수 없다
  const [panel, setPanel] = useState('')

  /*
   * 영상 위에 얹을 글자. 하나만 넣는다 (여러 개를 허용했다가 화면이 복잡해져 되돌렸다).
   * top/left는 글자 블록 **중심**의 위치(%)이고 미리보기에서 눌러/끌어 정한다.
   *
   * 서버로는 `[{ text, top, left }]` 배열로 보낸다 — 저장 컬럼이 jsonb 배열이라서다.
   * 여기서는 값이 하나뿐이라 스칼라 세 개로 들고 있는 편이 화면 코드가 단순하다.
   */
  const [overlayText, setOverlayText] = useState('')
  const [overlayTextTop, setOverlayTextTop] = useState(50)
  const [overlayTextLeft, setOverlayTextLeft] = useState(50)

  // 미리보기 프레임. 누른 지점을 %로 바꾸려면 실제 크기가 필요하다
  const stageRef = useRef(null)
  // 끌고 있는 중인지. state가 아니라 ref인 이유 — 화면에 그릴 값이 아니고,
  // pointermove마다 리렌더하면 영상 재생이 끊긴다
  const draggingRef = useRef(false)

  /*
   * 오디오 요소가 둘이고 역할이 다르다. 하나로 합치면 preload 설정이 충돌한다.
   *
   *   browseRef   목록에서 곡을 훑어 듣는 용도. src를 눌린 곡으로 갈아끼우므로 preload="none"이
   *               맞다 — 66곡 메타데이터를 미리 받을 이유가 없다.
   *   selectedRef 고른 곡 전용. preload="metadata"로 길이를 읽어 슬라이더 상한을 정하고,
   *               같은 요소로 구간 미리듣기를 한다. 이미 메타데이터가 있으니 seek이 바로 먹는다.
   */
  const browseRef = useRef(null)
  const selectedRef = useRef(null)
  // 구간 미리듣기를 영상 길이만큼만 재생하고 멈추는 타이머
  const segmentTimerRef = useRef(null)

  /*
   * 한 번이라도 제안했거나 사용자가 직접 누른 주제. 다시 제안하지 않기 위해 기억한다.
   *
   * 이게 없으면 이런 일이 벌어진다 — 캡션에 '산책'이 있어 칩이 켜지고, 사용자가 그걸 뺀 뒤
   * 캡션을 한 글자 더 치면 매칭이 다시 돌아 칩이 되살아난다. 사용자와 싸우는 UI가 된다.
   * 제안은 어디까지나 제안이고 최종 결정권은 사용자에게 있다(설계 4절).
   */
  const proposedRef = useRef(new Set())

  /*
   * 내 반려동물 목록. 실패해도 업로드를 막지 않는다 — 반려동물 선택은 선택 사항이라
   * 목록을 못 불러왔다고 영상까지 못 올리게 할 이유가 없다. 그 경우 선택란만 비어 보인다.
   */
  useEffect(() => {
    getMyPets()
      .then(setPets)
      .catch(() => setPets([]))
  }, [])

  // 미리보기용 blob URL은 다 쓰면 반드시 해제한다 (놔두면 메모리에 남는다)
  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  /*
   * 캡션 → 주제 자동 제안 (설계 4절 2번 단계).
   *
   * 나중에 이 블록만 FastAPI LLM 호출로 바꾸면 된다 — 흐름(입력 → 제안 → 사용자 확인 → 제출)은
   * 그대로다(설계 6절). 그때는 실패해도 업로드를 막지 않도록 조용히 넘기고,
   * 여기 키워드 매칭을 폴백으로 남겨두면 된다.
   */
  useEffect(() => {
    if (!caption.trim()) return
    const timer = setTimeout(() => {
      const matched = matchTopics(caption)
      const fresh = matched.filter((topic) => !proposedRef.current.has(topic))
      matched.forEach((topic) => proposedRef.current.add(topic))
      if (fresh.length === 0) return

      setTopics((prev) => {
        const room = MAX_TOPICS - prev.length
        if (room <= 0) return prev
        const added = fresh.filter((topic) => !prev.includes(topic)).slice(0, room)
        return added.length === 0 ? prev : [...prev, ...added]
      })
      setTopicNotice('캡션을 보고 주제를 켜뒀습니다. 맞지 않으면 눌러서 빼세요.')
    }, SUGGEST_DELAY_MS)
    return () => clearTimeout(timer)
  }, [caption])

  const resetSelection = () => {
    setFile(null)
    setDuration(null)
    setSize(null)
    setPreviewUrl('')
  }

  const onFileChange = async (e) => {
    const selected = e.target.files?.[0]
    setFileError('')
    setSubmitError('')
    if (!selected) {
      resetSelection()
      return
    }

    /*
     * 형식·용량·길이 검사는 videoFile.js가 한다 (제작 플로우와 같은 규칙을 쓰기 위해).
     * 통과하지 못하면 사용자에게 그대로 보여줄 문장을 담아 throw한다.
     * 비율은 막지 않는다 — 9:16이 아니어도 올릴 수 있고, 얼마나 잘리는지만 아래에서 알려준다.
     */
    let picked
    try {
      picked = await pickVideoFile(selected)
    } catch (err) {
      resetSelection()
      setFileError(err.message)
      return
    }

    setFile(picked.file)
    setDuration(picked.duration)
    setSize({ width: picked.width, height: picked.height })
    setPreviewUrl(URL.createObjectURL(picked.file))
  }

  // 칩을 누르면 켜고/끈다. 서버도 같은 상한을 보지만 바로 이유를 보여주려고 여기서 먼저 막는다
  const toggleTopic = (topic) => {
    setTopicNotice('')
    setTopicError('')
    // 직접 만진 주제는 다시 제안하지 않는다 (빼자마자 되살아나는 것을 막는다)
    proposedRef.current.add(topic)

    if (topics.includes(topic)) {
      setTopics(topics.filter((t) => t !== topic))
      return
    }
    if (topics.length >= MAX_TOPICS) {
      setTopicError(`주제는 ${MAX_TOPICS}개까지 고를 수 있습니다.`)
      return
    }
    setTopics([...topics, topic])
  }

  // 여러 마리를 고를 수 있다 — 한 영상에 두 마리가 함께 나오는 경우가 흔하다
  const togglePet = (id) => {
    setPetIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  /*
   * 곡 검색. 제목과 아티스트를 함께 본다 — "Silent Partner"처럼 아티스트로 찾는 경우가 많다.
   * 66곡이라 매 입력마다 전부 훑어도 부담이 없지만, 캡션 입력으로도 리렌더가 일어나므로
   * 검색어가 그대로일 때 목록을 다시 만들지 않도록 memo를 씌운다.
   */
  const musicResults = useMemo(() => {
    const q = musicQuery.trim().toLowerCase()
    if (!q) return MUSIC_TRACKS
    return MUSIC_TRACKS.filter(
      (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    )
  }, [musicQuery])

  const selectedTrack = findTrack(musicKey)

  /*
   * 구간 길이 = 영상 길이. 따로 고르게 하지 않는다 — 영상보다 짧으면 뒷부분이 무음이 되고
   * 길면 잘려서, 어느 쪽도 사용자가 원하는 결과가 아니다 (Shorts.musicStartSec 주석과 같은 이유).
   *
   * **round가 아니라 ceil이다.** 영상 길이는 소수라(9.31초 같은 값이 흔하다) round는 소수점이
   * .5 미만일 때 내림하고, 그러면 아래 maxStart가 그만큼 높게 잡혀 구간이 곡 끝을 넘는다 —
   * 1분 곡 + 9.31초 영상이면 상한이 51초가 되어 끝이 60.31초, 마지막 0.31초가 무음이다.
   * ceil로 올리면 항상 시작점 + 영상 길이 <= 곡 길이가 보장된다.
   */
  const segmentSec = duration ? Math.ceil(duration) : 0
  /*
   * 슬라이더 최대값. 곡 끝에서 구간 길이만큼 앞이 마지막 시작점이다.
   *
   * 곡이 영상보다 짧으면 0이 되어 슬라이더가 잠긴다 — 고를 수 있는 시작점이 0초뿐이다.
   * 그 경우 피드에서 곡이 반복 재생되어 영상 길이를 채운다.
   */
  const maxStart =
    trackDuration != null ? Math.max(0, Math.floor(trackDuration - segmentSec)) : 0

  /*
   * 상한이 줄어들면 골라둔 시작점을 끌어내린다.
   *
   * 상한은 두 값에 달려 있어 나중에 줄어들 수 있다 — 곡 길이(선택을 바꿀 때)와 **영상 길이**다.
   * 특히 곡을 고른 뒤 더 짧은 영상으로 바꾸는 순서가 문제였다. 슬라이더는 value에 min()을
   * 씌워 눈금만 내려 보이고 state는 예전 값을 들고 있어서, 화면에는 0:30이 보이는데 실제로는
   * 0:50이 저장되는 상태가 됐다 (1분 곡 + 30초 영상이면 1:20까지 필요해 뒷부분이 무음).
   *
   * 표시와 저장값을 갈라두면 반드시 이런 일이 생기므로 state 자체를 맞춘다.
   */
  useEffect(() => {
    if (musicStartSec > maxStart) setMusicStartSec(maxStart)
  }, [maxStart, musicStartSec])

  /*
   * 모드를 바꾼다. music에서 벗어나면 고른 곡과 미리듣기를 함께 정리한다 —
   * 남겨두면 "음소거"를 골랐는데 곡이 선택된 채로 보여 무엇이 올라갈지 헷갈린다.
   */
  const changeSoundMode = (mode) => {
    setSoundMode(mode)
    setMusicError('')
    if (mode !== SOUND_MUSIC) {
      setMusicKey('')
      setMusicQuery('')
      resetMusicSelection()
    }
  }

  // 곡 선택과 관련된 파생 상태를 한 번에 정리한다. 곡을 바꿀 때·모드를 벗어날 때 함께 불린다 —
  // 하나라도 남으면 이전 곡의 구간이 새 곡에 그대로 적용된다
  const resetMusicSelection = () => {
    setMusicStartSec(0)
    setTrackDuration(null)
    setPreviewKey('')
    setSegmentPlaying(false)
    clearTimeout(segmentTimerRef.current)
    // 둘 다 멈춘다 — 곡을 바꿀 때 이전 곡이 계속 흐르면 새 곡과 겹쳐 들린다
    browseRef.current?.pause()
    selectedRef.current?.pause()
  }

  // 구간 미리듣기를 영상 길이만큼 재생하고 멈추는 타이머를 다시 건다.
  // 멈추는 시점은 ceil한 segmentSec이 아니라 실제 영상 길이로 잰다 — 얹혔을 때와 같아야 한다
  const armSegmentTimer = (audio) => {
    clearTimeout(segmentTimerRef.current)
    segmentTimerRef.current = setTimeout(() => {
      audio.pause()
      setSegmentPlaying(false)
    }, Math.round(duration * 1000))
  }

  /*
   * 곡을 고른다. **고르는 즉시 재생한다** — 따로 재생 버튼을 눌러야 들리면 고르는 동안
   * 무슨 곡인지 확인이 안 되고, 실제로 곡을 안 고른 채 넘어가는 일이 생겼다.
   *
   * 재생을 이 함수 안에서 동기로 시작하는 것이 중요하다. 클릭 핸들러 컨텍스트를 벗어나면
   * 브라우저 자동재생 정책에 막힌다 — 그래서 selectedRef의 src를 선언적(JSX)으로 두지 않고
   * 여기서 직접 갈아끼운다. 요소가 항상 렌더돼 있어 ref가 비어 있지 않다.
   */
  const pickTrack = (key) => {
    setMusicKey(key)
    setMusicError('')
    resetMusicSelection()

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
    playOrReport(audio) // 새 곡은 0초부터 — resetMusicSelection이 시작점을 0으로 되돌렸다
    setSegmentPlaying(true)
    armSegmentTimer(audio)
  }

  /*
   * 슬라이더로 시작점을 옮기면 **그 자리부터 바로 들려준다.**
   * 멈춰놓고 다시 누르게 하면 어디를 고른 것인지 귀로 확인할 수 없다.
   */
  const moveStart = (nextSec) => {
    setMusicStartSec(nextSec)

    const audio = selectedRef.current
    // 메타데이터가 없으면 seek이 무시된다 — 아직 못 읽었으면 값만 바꾸고 재생은 건드리지 않는다
    if (!audio || audio.readyState < 1) return

    audio.currentTime = nextSec
    if (audio.paused) playOrReport(audio)
    setSegmentPlaying(true)
    armSegmentTimer(audio)
  }

  /* ───── 텍스트 배치 (누른 곳에 붙이기 / 끌어 옮기기) ───── */

  // 포인터 좌표를 프레임 기준 %로 바꾼다. 안전 범위를 벗어나지 않게 자른다
  const positionFrom = (event) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return {
      left: clampTo(Math.round(((event.clientX - rect.left) / rect.width) * 100), TEXT_LEFT_RANGE),
      top: clampTo(Math.round(((event.clientY - rect.top) / rect.height) * 100), TEXT_TOP_RANGE),
    }
  }

  const placeTextAt = (event) => {
    const pos = positionFrom(event)
    if (!pos) return
    setOverlayTextLeft(pos.left)
    setOverlayTextTop(pos.top)
  }

  /*
   * 텍스트 패널이 열려 있고 글자가 있을 때만 배치를 받는다.
   * 항상 받으면 소리를 고르는 중에 미리보기를 무심코 눌러 글자가 옮겨진다.
   */
  const textPlaceable = panel === 'text' && Boolean(overlayText.trim())

  const onStagePointerDown = (event) => {
    if (!textPlaceable) return
    draggingRef.current = true
    // 프레임 밖으로 끌어도 계속 추적되게 포인터를 붙잡는다.
    // 없으면 손가락이 프레임을 벗어난 순간 move 이벤트가 끊겨 글자가 그 자리에 멈춘다
    event.currentTarget.setPointerCapture?.(event.pointerId)
    placeTextAt(event)
  }

  const onStagePointerMove = (event) => {
    if (!draggingRef.current) return
    placeTextAt(event)
  }

  const endDrag = (event) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  /*
   * 재생 실패를 삼키지 않고 화면에 알린다.
   *
   * 전에는 `.catch(() => {})`로 전부 버렸는데, 그래서 구간 듣기가 무음인 원인을 찾는 데
   * 한참 걸렸다. 자동재생 차단·네트워크 실패는 사용자가 알아야 대응할 수 있다.
   */
  const playOrReport = (audio) => {
    audio.play().catch((err) => {
      setMusicError(
        err?.name === 'NotAllowedError'
          ? '브라우저가 소리 재생을 막았습니다. 화면을 한 번 누른 뒤 다시 시도해 주세요.'
          : '음원을 재생할 수 없습니다. 잠시 후 다시 시도해 주세요.'
      )
    })
  }

  // 목록에서 곡을 식별하기 위한 미리듣기. 처음부터 재생한다 (구간 미리듣기는 아래 따로 있다)
  const togglePreview = (track) => {
    const audio = browseRef.current
    if (!audio) return

    stopSegment()
    setMusicError('')

    if (previewKey === track.key) {
      audio.pause()
      setPreviewKey('')
      return
    }
    // src를 바꾸면 재생 위치가 0으로 돌아가므로 곡을 옮길 때 되감기를 따로 하지 않아도 된다
    audio.src = track.url
    playOrReport(audio)
    setPreviewKey(track.key)
  }

  const stopSegment = () => {
    clearTimeout(segmentTimerRef.current)
    selectedRef.current?.pause()
    setSegmentPlaying(false)
  }

  /*
   * 구간 미리듣기 — 고른 시작점부터 **영상 길이만큼만** 재생한다.
   * 실제로 영상에 얹혔을 때 들릴 소리와 같아야 하므로 끝나는 지점을 타이머로 맞춘다
   * (audio 요소에는 "여기까지만 재생" 기능이 없다).
   *
   * 전용 요소(selectedRef)를 쓴다. 목록 미리듣기와 요소를 공유했을 때 이런 버그가 있었다 —
   * 그 요소는 preload="none"이라 readyState가 0인데, seek을 하려고 loadedmetadata를
   * 기다렸다. 그런데 preload="none"에서는 **아무도 로드를 시작시키지 않으면 그 이벤트가
   * 오지 않는다.** 그래서 영원히 대기하며 무음이었다.
   *
   * selectedRef는 곡을 고른 순간부터 preload="metadata"로 길이를 읽어두므로, 누르는 시점에
   * 이미 readyState >= 1이다. seek과 play를 클릭 핸들러 안에서 동기로 끝낼 수 있어
   * 자동재생 정책(사용자 조작 컨텍스트)도 안전하게 통과한다.
   */
  const toggleSegmentPreview = () => {
    const audio = selectedRef.current
    if (!audio || !selectedTrack) return

    if (segmentPlaying) {
      stopSegment()
      return
    }

    // 목록 미리듣기가 돌고 있으면 겹치지 않게 멈춘다
    browseRef.current?.pause()
    setPreviewKey('')
    setMusicError('')

    audio.currentTime = Math.min(musicStartSec, maxStart)
    playOrReport(audio)
    setSegmentPlaying(true)
    armSegmentTimer(audio)
  }

  /*
   * 화면을 벗어날 때 미리듣기를 멈춘다. 요소가 DOM에서 빠지면 대개 함께 멈추지만,
   * 업로드 성공 후 navigate로 피드로 넘어가는 경로에서 노래가 남아 피드의 BGM과 겹쳐 들렸다.
   */
  useEffect(() => {
    // cleanup에서 ref.current를 그대로 읽으면 그 시점의 값이 이미 null일 수 있어 미리 붙잡는다
    const browse = browseRef
    const selected = selectedRef
    const timer = segmentTimerRef
    return () => {
      browse.current?.pause()
      selected.current?.pause()
      clearTimeout(timer.current)
    }
  }, [])

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    if (!file || duration === null) {
      setFileError('올릴 영상을 선택해 주세요.')
      return
    }
    /*
     * 배경음악 모드인데 곡을 고르지 않은 상태를 막는다. 이걸 통과시키면 원본은 꺼지고
     * 곡도 없어 무음 영상이 올라가는데, 올린 사람은 음악이 들어갔다고 믿는다 —
     * 모드를 도입한 이유가 정확히 이 상태를 없애는 것이다.
     */
    if (soundMode === SOUND_MUSIC && !musicKey) {
      setMusicError('넣을 곡을 골라주세요. 목록에서 곡 이름을 누르면 선택됩니다.')
      return
    }

    try {
      // 1) 파일을 백엔드로 보내면 백엔드가 Storage에 넣고 공개 URL을 돌려준다
      setStep('영상을 올리는 중…')
      const { videoUrl } = await uploadVideoFile(file)

      // 2) 받은 URL과 정보를 등록. 응답은 그대로 피드로 넘겨 방금 올린 영상을 보여준다
      setStep('정보를 저장하는 중…')
      const created = await createShorts({
        petIds,
        videoUrl,
        thumbnailUrl: null, // 썸네일 생성은 나중 단계
        caption: caption.trim() || null,
        // 고른 주제가 없으면 null — 서버도 빈 배열을 NULL로 통일한다
        topics: topics.length > 0 ? topics : null,
        durationSec: Math.round(duration),
        // 세 모드를 서버 표현(musicKey, muteOriginal) 두 값으로 풀어 보낸다 (SOUND_MODES 주석 참고).
        // music 모드가 아니면 곡은 반드시 null이다 — 모드를 되돌릴 때 state는 비우지만,
        // 여기서 모드로 한 번 더 잠가 두면 어느 경로로도 어긋난 조합이 나가지 않는다
        musicKey: soundMode === SOUND_MUSIC ? musicKey : null,
        muteOriginal: soundMode !== SOUND_ORIGINAL,
        /*
         * 곡이 없으면 시작점도 0. 서버도 같은 규칙으로 눌러 저장하지만 보내는 값부터 맞춘다.
         *
         * maxStart로 한 번 더 자르는 이유: 슬라이더의 max만으로는 부족하다. 곡을 고른 뒤
         * **영상 파일을 더 짧은 것으로 바꾸면** 상한이 줄어드는데 이미 끌어놓은 state 값은
         * 그대로 남는다(아래 클램프 effect가 잡지만, 제출 경로에서도 막아둔다).
         * 그대로 나가면 시작점 + 영상 길이가 곡 끝을 넘어 뒷부분이 무음이 된다.
         */
        musicStartSec: soundMode === SOUND_MUSIC ? Math.min(musicStartSec, maxStart) : 0,
        /*
         * 저장 컬럼이 jsonb 배열이라 하나뿐인 글자도 배열로 감싸 보낸다.
         * 글자가 없으면 빈 배열 — 빈 문자열을 담아 보내면 서버 @NotBlank에 걸려 400이 된다.
         */
        overlayTexts: overlayText.trim()
          ? [{ text: overlayText.trim(), top: overlayTextTop, left: overlayTextLeft }]
          : [],
      })

      /*
       * 방금 올린 영상을 피드로 실어 보낸다.
       *
       * 피드는 내가 올린 영상을 빼고 보여주므로(ShortsRepository의 랭킹 쿼리) 그냥 넘어가면
       * 올린 결과를 한 번도 못 본다 — 잘 올라갔는지 확인할 방법이 없다. 그래서 서버 응답을
       * 그대로 넘겨 맨 앞에 한 번 끼워 넣는다. 응답(ShortsResponse)이 카드가 필요한 필드를
       * 전부 담고 있어 다시 조회할 필요가 없다.
       *
       * 목록을 다시 불러오게 만들지 않은 이유: 서버가 내 영상을 빼는 정책은 그대로 두는 것이
       * 맞다(내 영상이 남의 피드처럼 계속 섞이면 추천이 망가진다). 여기서 필요한 것은
       * "올린 직후 한 번 보여주기"뿐이다.
       */
      navigate('/shorts', { replace: true, state: { justUploaded: created } })
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setStep('')
    }
  }

  // Storage 설정은 서버(.env)에만 있으므로 프론트에서 미리 확인할 수 없다.
  // 설정이 빠져 있으면 업로드 요청 시 서버가 이유를 담은 메시지를 돌려주고, submitError로 표시된다
  const submitting = step !== ''
  const crop = size ? cropInfo(size.width, size.height) : null
  /*
   * 고른 반려동물들의 품종 — 서버가 tags에 붙일 값과 같아야 하므로 서버와 같은 규칙으로 만든다.
   * 빈 품종은 빼고, 같은 품종을 여러 마리 골랐으면 하나로 합친다 (ShortsService.toTags).
   */
  const autoTags = [
    ...new Set(
      pets
        .filter((pet) => petIds.includes(pet.id))
        .map((pet) => pet.breed?.trim())
        .filter(Boolean)
    ),
  ]

  // 소리 버튼에 현재 설정을 한 줄로 요약해 보여준다 — 패널을 열지 않고도 무엇이 걸렸는지 알게
  const soundSummary =
    soundMode === SOUND_ORIGINAL
      ? '영상 소리 그대로'
      : soundMode === SOUND_MUTE
        ? '음소거'
        : selectedTrack
          ? `${selectedTrack.title}`
          : '곡을 고르지 않음'

  /*
   * 2단계로 넘어간다. 넘어가기 전에 곡 미선택을 여기서 막는다 —
   * 제출 시점에 막으면 2단계까지 다 채운 뒤 1단계로 되돌아와야 해서 흐름이 끊긴다.
   */
  const goDetails = () => {
    if (soundMode === SOUND_MUSIC && !musicKey) {
      setMusicError('넣을 곡을 골라주세요. 목록에서 곡 이름을 누르면 선택됩니다.')
      setPanel('sound')
      return
    }
    // 미리듣기를 끄고 넘어간다. 놔두면 2단계에서 곡이 계속 흐른다
    stopSegment()
    browseRef.current?.pause()
    setPreviewKey('')
    setPanel('')
    setPhase('details')
  }

  /*
   * 미리보기 무대. 1단계(크게, 배치 가능)와 2단계(작게, 보기만)가 같은 코드를 쓴다.
   *
   * 컴포넌트(<Stage/>)로 만들지 않고 JSX를 돌려주는 함수인 이유: 인라인 컴포넌트는 렌더마다
   * 타입이 새로 만들어져 리액트가 다른 요소로 보고 <video>를 다시 마운트한다. 그러면 미리보기가
   * 매번 처음부터 재생된다. 함수 호출은 요소만 돌려주므로 그런 일이 없다.
   */
  const renderStage = ({ small }) => (
    <div
      ref={small ? undefined : stageRef}
      className={small ? 'su-stage su-stage-sm' : 'su-stage'}
      // 배치는 1단계의 텍스트 패널에서만 받는다 (textPlaceable 주석 참고)
      onPointerDown={small ? undefined : onStagePointerDown}
      onPointerMove={small ? undefined : onStagePointerMove}
      onPointerUp={small ? undefined : endDrag}
      onPointerCancel={small ? undefined : endDrag}
      // 끄는 동안 브라우저가 스크롤·확대로 가로채지 않게 한다 (모바일에서 특히)
      style={!small && textPlaceable ? { touchAction: 'none' } : undefined}
    >
      <video src={previewUrl} muted loop playsInline autoPlay />

      {overlayText.trim() && (
        <div
          className={
            !small && textPlaceable ? 'su-stage-text su-stage-text-movable' : 'su-stage-text'
          }
          style={{ top: `${overlayTextTop}%`, left: `${overlayTextLeft}%` }}
        >
          {overlayText}
        </div>
      )}

      {soundMode === SOUND_MUSIC && selectedTrack && (
        <div className="su-stage-music">
          <span aria-hidden="true">♪</span>
          {/* 피드(.sf-music)와 같이 흘려 보여준다 — 미리보기가 실제와 달라지면 안 된다 */}
          <MarqueeText>
            {selectedTrack.title} · {selectedTrack.artist}
          </MarqueeText>
        </div>
      )}

      {/* 배치 가능한 상태임을 알려준다 — 글자를 눌러 옮길 수 있다는 걸 모르면 기능이 없는 셈이다 */}
      {!small && textPlaceable && (
        <div className="su-stage-hint">원하는 곳을 눌러 글자를 옮기세요</div>
      )}
    </div>
  )

  return (
    <main className="auth-page">
      <h1>숏츠 올리기</h1>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {/* ═══════ 1단계 — 영상이 어떻게 뜰지 확정한다 (소리·텍스트) ═══════ */}
        {phase === 'edit' && (
          <>
            <label>
              영상 파일 (mp4·webm, {MIN_SEC}~{MAX_SEC}초, {maxMegabytes()}MB 이하)
              <input
                type="file"
                accept={VIDEO_ACCEPT}
                onChange={onFileChange}
                disabled={submitting}
                aria-invalid={Boolean(fileError)}
              />
              {fileError && <p className="field-error">{fileError}</p>}
            </label>

            {previewUrl ? (
              <>
                {/*
                  큰 미리보기. 피드와 같은 9:16 + cover라 여기 보이는 모습이 그대로 나간다.
                  텍스트와 곡 표시도 피드와 같은 자리에 얹어 결과를 바로 확인할 수 있게 한다.
                */}
                {renderStage({ small: false })}

                <p className="su-meta">
                  {size && `${size.width}×${size.height} · `}
                  {duration.toFixed(1)}초 · {(file.size / 1024 / 1024).toFixed(1)}MB
                </p>

                {crop && crop.percent >= CROP_WARN_THRESHOLD && (
                  <p className="su-crop-warn">
                    9:16 세로 비율이 아니라 <strong>{crop.axis}가 약 {crop.percent}% 잘립니다.</strong>
                    <br />
                    위 미리보기가 피드에서 보일 모습 그대로입니다. 그대로 올려도 됩니다.
                  </p>
                )}

                {/* 편집 도구. 눌러 아래 패널을 펼친다. 한 번에 하나만 열리는 이유는
                    panel state 주석 참고 — 둘 다 열면 미리보기가 화면 밖으로 밀린다 */}
                <div className="su-tools">
                  <button
                    type="button"
                    className={panel === 'sound' ? 'su-tool su-tool-on' : 'su-tool'}
                    onClick={() => setPanel(panel === 'sound' ? '' : 'sound')}
                    disabled={submitting}
                    aria-expanded={panel === 'sound'}
                  >
                    <span aria-hidden="true">♪</span>
                    소리
                    <em>{soundSummary}</em>
                  </button>
                  <button
                    type="button"
                    className={panel === 'text' ? 'su-tool su-tool-on' : 'su-tool'}
                    onClick={() => setPanel(panel === 'text' ? '' : 'text')}
                    disabled={submitting}
                    aria-expanded={panel === 'text'}
                  >
                    <span aria-hidden="true">T</span>
                    텍스트
                    <em>{overlayText.trim() ? '넣음' : '없음'}</em>
                  </button>
                </div>

                {panel === 'text' && (
                  <fieldset className="su-tags">
                    <legend>영상 위 텍스트</legend>
                    <p className="su-tags-hint">
                      영상 화면 안에 글자를 얹습니다. 다음 단계의 <strong>설명</strong>과는 다릅니다 —
                      설명은 영상 밖에 붙는 글이고, 이것은 영상 위에 보입니다.
                      글자는 줄바꿈되지 않고 화면을 넘어가면 그만큼 잘립니다.
                    </p>

                    <input
                      type="text"
                      value={overlayText}
                      maxLength={MAX_OVERLAY_TEXT}
                      onChange={(e) => setOverlayText(e.target.value)}
                      disabled={submitting}
                      placeholder="예: 오늘 처음 산책!"
                      aria-label="영상 위에 얹을 텍스트"
                    />

                    {/* 위치는 슬라이더가 아니라 미리보기에서 직접 정한다 — 숫자를 보며 맞추는 것보다
                        원하는 곳을 누르는 것이 빠르고, 결과를 보면서 정하게 된다 */}
                    <p className="su-tags-hint">
                      {overlayText.trim() ? (
                        <>
                          위 미리보기에서 <strong>원하는 곳을 누르거나 끌어</strong> 글자를 옮기세요
                          (지금 {overlayTextLeft}% / {overlayTextTop}%).
                        </>
                      ) : (
                        '글자를 입력하면 미리보기에서 원하는 곳으로 옮길 수 있습니다.'
                      )}
                    </p>

                    {overlayText.trim() && (
                      <div className="su-trim-foot">
                        <button
                          type="button"
                          className="su-music-clear"
                          onClick={() => {
                            setOverlayTextTop(50)
                            setOverlayTextLeft(50)
                          }}
                          disabled={submitting}
                        >
                          가운데로
                        </button>
                        <button
                          type="button"
                          className="su-music-clear"
                          onClick={() => setOverlayText('')}
                          disabled={submitting}
                        >
                          텍스트 지우기
                        </button>
                      </div>
                    )}
                  </fieldset>
                )}

                {panel === 'sound' && (
                  <fieldset className="su-tags">
                    <legend>소리</legend>

                    {SOUND_MODES.map((mode) => (
                      <label
                        key={mode.value}
                        className={soundMode === mode.value ? 'su-mode su-mode-on' : 'su-mode'}
                      >
                        <input
                          type="radio"
                          name="sound-mode"
                          value={mode.value}
                          checked={soundMode === mode.value}
                          onChange={() => changeSoundMode(mode.value)}
                          disabled={submitting}
                        />
                        <span>
                          {mode.label}
                          <em>{mode.hint}</em>
                        </span>
                      </label>
                    ))}

                    {/* 곡 목록은 배경음악 모드에서만 뜬다 — 다른 모드에서 보이면 "골라도 되나?" 하고
                        헷갈리고, 골라둔 값이 남아 무엇이 올라갈지 알 수 없게 된다 */}
                    {soundMode === SOUND_MUSIC && (
                      <div className="su-music">
                        <p className="su-tags-hint">
                          전부 <strong>저작권 없는 음원</strong> {MUSIC_TRACKS.length}곡입니다.
                          ▶로 들어보고 <strong>곡 이름을 눌러 선택</strong>하세요.
                        </p>

                        <input
                          type="search"
                          className="su-music-search"
                          value={musicQuery}
                          onChange={(e) => setMusicQuery(e.target.value)}
                          disabled={submitting}
                          placeholder="곡 제목이나 아티스트로 검색 (예: cute, Silent Partner)"
                          aria-label="배경음악 검색"
                        />

                        {musicResults.length === 0 ? (
                          <p className="su-tags-hint">검색 결과가 없습니다.</p>
                        ) : (
                          <ul className="su-music-list">
                            {musicResults.map((track) => {
                              const on = musicKey === track.key
                              const playing = previewKey === track.key
                              return (
                                <li
                                  key={track.key}
                                  className={on ? 'su-music-item su-music-on' : 'su-music-item'}
                                >
                                  {/* 미리듣기와 선택을 다른 버튼으로 둔다. 대신 선택된 행에 ✓와 색을
                                      분명히 넣어 "들어본 것"과 "고른 것"이 구분되게 한다 —
                                      이 구분이 흐려서 곡 없이 올라가는 일이 생겼다 */}
                                  <button
                                    type="button"
                                    className="su-music-play"
                                    onClick={() => togglePreview(track)}
                                    disabled={submitting}
                                    aria-label={`${track.title} 미리듣기`}
                                    aria-pressed={playing}
                                  >
                                    {playing ? '❙❙' : '▶'}
                                  </button>
                                  <button
                                    type="button"
                                    className="su-music-pick"
                                    onClick={() => pickTrack(on ? '' : track.key)}
                                    disabled={submitting}
                                    aria-pressed={on}
                                  >
                                    <strong>{track.title}</strong>
                                    <em>{track.artist}</em>
                                  </button>
                                  <span className="su-music-check" aria-hidden="true">
                                    {on ? '✓' : ''}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        )}

                        {selectedTrack ? (
                          <>
                            <p className="su-tags-notice">
                              <strong>{selectedTrack.title}</strong> · {selectedTrack.artist} 선택됨{' '}
                              <button
                                type="button"
                                className="su-music-clear"
                                onClick={() => pickTrack('')}
                                disabled={submitting}
                              >
                                해제
                              </button>
                            </p>

                            {/* ───── 구간 선택 (인스타 릴스식) ─────
                                곡 어디서부터 쓸지를 슬라이더로 고른다. 구간 길이는 영상 길이로
                                고정이라 손잡이가 하나면 충분하다 — 두 개를 주면 영상보다 짧거나
                                긴 구간을 만들 수 있어 결과가 어긋난다 */}
                            <div className="su-trim">
                              <div className="su-trim-head">
                                <span>사용할 구간</span>
                                {trackDuration == null ? (
                                  <em>곡 길이를 읽는 중…</em>
                                ) : (
                                  <strong>
                                    {mmss(musicStartSec)} ~ {mmss(musicStartSec + segmentSec)}
                                    <em> / 전체 {mmss(trackDuration)}</em>
                                  </strong>
                                )}
                              </div>

                              <input
                                type="range"
                                className="su-trim-range"
                                min={0}
                                max={maxStart}
                                step={1}
                                value={Math.min(musicStartSec, maxStart)}
                                // 옮긴 자리부터 바로 들려준다 (moveStart 주석 참고)
                                onChange={(e) => moveStart(Number(e.target.value))}
                                // 곡이 영상보다 짧으면 고를 시작점이 0초뿐이라 잠근다
                                disabled={submitting || trackDuration == null || maxStart === 0}
                                aria-label="음악 시작 지점"
                              />

                              <div className="su-trim-foot">
                                <button
                                  type="button"
                                  className="su-trim-play"
                                  onClick={toggleSegmentPreview}
                                  disabled={submitting || trackDuration == null}
                                >
                                  {segmentPlaying ? '❙❙ 정지' : `▶ 다시 듣기 (${segmentSec}초)`}
                                </button>
                                {trackDuration != null && maxStart === 0 && (
                                  <em>
                                    곡이 영상({segmentSec}초)보다 짧아 처음부터 쓰며, 부족한 만큼
                                    반복됩니다.
                                  </em>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <p className="field-error">아직 곡을 고르지 않았습니다.</p>
                        )}

                        {musicError && <p className="field-error">{musicError}</p>}

                        {/* 목록 훑어듣기 전용. src를 눌린 곡으로 갈아끼우므로 preload는 none이다
                            (66곡 메타데이터를 미리 받을 이유가 없다) */}
                        <audio ref={browseRef} onEnded={() => setPreviewKey('')} preload="none" />

                        {/*
                          고른 곡 전용. 길이를 읽어 슬라이더 상한을 정하고 구간 재생도 이 요소로 한다.

                          src를 JSX로 주지 않고 pickTrack에서 직접 넣는다. 선언적으로 두면 곡을
                          고른 뒤 **다음 렌더에야** 요소에 src가 붙어서, 클릭 핸들러 안에서
                          바로 play()를 부를 수 없다 — 그러면 자동재생 정책에 막힌다.
                          곡이 없을 때도 요소를 남겨두는 이유도 같다(ref가 비어 있으면 안 된다).
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
                            if (musicKey) {
                              setMusicError('음원을 불러올 수 없습니다. 네트워크를 확인해 주세요.')
                            }
                          }}
                        />
                      </div>
                    )}
                  </fieldset>
                )}

                <button type="button" onClick={goDetails} disabled={submitting}>
                  다음
                </button>
              </>
            ) : (
              <p className="su-tags-hint">
                영상을 고르면 여기에서 <strong>소리와 텍스트</strong>를 정할 수 있습니다.
                설명·반려동물·주제는 다음 단계에서 입력합니다.
              </p>
            )}
          </>
        )}

        {/* ═══════ 2단계 — 설명·반려동물·주제 ═══════ */}
        {phase === 'details' && (
          <>
            {/*
              1단계에서 정한 결과를 작게 보여준다. 설명을 쓰는 동안 "무엇에 대한 설명인지"가
              화면에 없으면 위로 되돌아가 확인하게 된다 — 텍스트·곡 표시까지 그대로 얹혀 있어
              올라갈 모습을 계속 볼 수 있다.
              여기서는 배치를 받지 않는다(small) — 설명을 쓰다가 무심코 눌러 글자가 옮겨지면 안 된다.
            */}
            {previewUrl && renderStage({ small: true })}

        <label>
          설명 (선택)
          <input
            type="text"
            value={caption}
            maxLength={MAX_CAPTION}
            onChange={(e) => setCaption(e.target.value)}
            disabled={submitting}
            placeholder="예: 산책 나온 우리 강아지 🐾"
          />
        </label>

        {/* 반려동물이 0마리면 묶음 자체를 감춘다 — 고를 것이 없는 빈 목록은 방해만 된다.
            등록하러 가는 링크만 안내하고, 그대로 영상을 올릴 수 있다 (선택 사항).
            label이 아니라 fieldset인 이유는 주제 칩과 같다 — 대상이 여럿이라 label 하나가
            가리킬 곳이 없다 */}
        {pets.length > 0 ? (
          <fieldset className="su-tags">
            <legend>주인공 반려동물 (선택 · {petIds.length}/{pets.length})</legend>
            <p className="su-tags-hint">
              여러 마리를 고를 수 있습니다. 고른 반려동물의 품종이 태그로 함께 저장됩니다.
            </p>

            <ul className="su-tag-list">
              {pets.map((pet) => {
                const on = petIds.includes(pet.id)
                return (
                  <li key={pet.id}>
                    <button
                      type="button"
                      className={on ? 'su-tag su-tag-on' : 'su-tag'}
                      onClick={() => togglePet(pet.id)}
                      disabled={submitting}
                      aria-pressed={on}
                    >
                      {pet.name}
                      {pet.breed ? ` (${pet.breed})` : ''}
                      {on && <span aria-hidden="true">×</span>}
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* 어떤 태그가 붙을지 미리 보여준다 — 올리고 나서 모르는 태그가 생겼다고 느끼지 않게 */}
            {autoTags.length > 0 && (
              <p className="su-tags-notice">
                품종 <strong>{autoTags.join(', ')}</strong>이(가) 태그로 함께 저장됩니다.
              </p>
            )}
            {petIds.length > 0 && autoTags.length === 0 && (
              <p className="su-tags-hint">
                고른 반려동물에 품종이 없어 자동으로 붙는 태그가 없습니다.{' '}
                <Link to={`/pets/${petIds[0]}/edit`}>품종 입력하기</Link>
              </p>
            )}
          </fieldset>
        ) : (
          <p className="su-tags-hint">
            등록한 반려동물이 없습니다. <Link to="/pets/new">반려동물을 등록</Link>하면
            영상의 주인공을 고르고 품종이 태그로 자동 저장됩니다.
          </p>
        )}

        {/* label로 감싸지 않는다 — 선택 대상이 14개라 label 하나가 가리킬 대상이 없다.
            대신 fieldset/legend로 묶어 스크린리더에도 하나의 묶음으로 읽히게 한다 */}
        <fieldset className="su-tags">
          <legend>
            주제 (선택 · {topics.length}/{MAX_TOPICS})
          </legend>
          <p className="su-tags-hint">
            이 주제를 좋아하는 사람의 피드에 더 자주 보입니다. 없어도 올릴 수 있습니다.
            <br />
            설명을 쓰면 어울리는 주제를 자동으로 켜드립니다.
          </p>

          {/* 켜진 것과 꺼진 것을 한 목록에 두고 색으로 구분한다 — 목록이 14개로 고정이라
              선택 여부로 칩이 자리를 옮기면 누르려던 칩이 이동해 오히려 헷갈린다 */}
          <ul className="su-tag-list">
            {TOPICS.map((topic) => {
              const on = topics.includes(topic)
              return (
                <li key={topic}>
                  <button
                    type="button"
                    className={on ? 'su-tag su-tag-on' : 'su-tag'}
                    onClick={() => toggleTopic(topic)}
                    disabled={submitting}
                    aria-pressed={on}
                  >
                    {topic}
                    {on && <span aria-hidden="true">×</span>}
                  </button>
                </li>
              )
            })}
          </ul>

          {topicNotice && <p className="su-tags-notice">{topicNotice}</p>}
          {topicError && <p className="field-error">{topicError}</p>}
        </fieldset>

        {/* 올리기 버튼 바로 위에 두는 이유: 파일 선택 시점에 보여주면 주제·반려동물을 고르는
            동안 화면 위로 밀려 올라가 정작 제출하는 순간에는 보이지 않는다.
            숏츠 피드의 신고 사유(저작권 침해)와 짝이 되는 문구다 — 한쪽만 있으면
            신고당한 사람이 "그런 말 없었다"고 여긴다 */}
        <p className="su-copyright">
          영상에 사용한 <strong>음원의 저작권은 업로더 본인의 책임</strong>입니다.
          권리자의 허락 없이 음원·영상을 사용하면 저작권 침해로 신고될 수 있고,
          확인되면 영상이 삭제될 수 있습니다.
        </p>

        {submitError && <p className="submit-error">{submitError}</p>}

        {/* 이전을 왼쪽에 작게 둔다 — 되돌아가는 것이 주 동작이 아니고,
            올리기와 같은 무게로 두면 실수로 누른다 */}
        <div className="su-nav">
          <button
            type="button"
            className="su-back"
            onClick={() => setPhase('edit')}
            disabled={submitting}
          >
            이전
          </button>
          <button type="submit" disabled={submitting || !file}>
            {submitting ? step : '올리기'}
          </button>
        </div>
          </>
        )}
      </form>
      <p className="auth-switch">
        <Link to="/shorts">← 숏츠로</Link>
      </p>
    </main>
  )
}
