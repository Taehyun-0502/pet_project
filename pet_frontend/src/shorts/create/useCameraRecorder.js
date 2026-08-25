/*
 * 카메라 미리보기 + 녹화. (숏츠_제작_플로우_구조_가이드.md 3절)
 *
 *   [카메라] --getUserMedia--> MediaStream --> <video srcObject>  (실시간 미리보기)
 *                                   └------> MediaRecorder --> chunks --> Blob (녹화 결과)
 *
 * CameraPage에서 화면만 그리게 하려고 상태 기계를 여기로 뺐다. 카메라는 정리(track.stop())를
 * 빠뜨리면 표시등이 계속 켜져 있고 배터리를 먹는데, 그 정리 지점이 여러 곳(언마운트·전환·재시도)이라
 * 화면 코드에 섞이면 놓치기 쉽다.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { baseMime } from '../videoFile'

/*
 * 녹화 형식 후보. **먼저 지원되는 것 하나**를 쓴다.
 *
 * mp4를 앞에 둔 이유: 서버·Storage·피드가 원래 mp4만 다뤘고 호환 범위도 넓다.
 * 크롬 계열은 오래도록 mp4 녹화를 지원하지 않아 거의 webm으로 떨어지고, 사파리/iOS는 mp4를 준다.
 * codecs까지 적은 항목을 먼저 두는 것은 isTypeSupported가 컨테이너만으로는 true를 주면서
 * 실제 start()에서 실패하는 조합이 있기 때문이다.
 */
const RECORD_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

/** 이 브라우저가 녹화할 수 있는 형식. 없으면 '' — 녹화 자체가 불가능하다는 뜻이다 */
export function pickRecordMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  return RECORD_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

// 경과 시간 표시·자동 정지 판정 주기(ms). 100ms면 눈에 매끄럽고 리렌더 부담도 없다
const TICK_MS = 100

/**
 * @param maxSec  이 길이에 닿으면 자동으로 멈춘다 (사용자가 놓쳐도 상한을 넘지 않게)
 * @param onDone  녹화가 끝나면 (File, 초) 로 부른다. 길이는 **잰 시간**이다 —
 *                webm에는 길이가 안 적혀 있어 video.duration이 Infinity로 나온다
 */
export default function useCameraRecorder({ maxSec, onDone }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const timerRef = useRef(null)
  // 최신 onDone을 붙잡아 둔다 — 녹화 중 리렌더로 새 함수가 와도 onstop이 옛 것을 부르지 않게
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // idle → starting → ready | denied | unsupported | error
  const [status, setStatus] = useState('starting')
  const [error, setError] = useState('')
  // 후면이 기본이다 — 반려동물을 찍는 앱이라 셀카로 시작할 일이 거의 없다
  const [facing, setFacing] = useState('environment')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  // 마이크를 못 받은 채 카메라만 켜진 상태. 이 경우 녹화본에 소리가 없다
  const [muted, setMuted] = useState(false)

  /*
   * 광학/센서 확대(MediaStreamTrack의 zoom 제약).
   *
   * zoomRange가 null이면 **이 기기·브라우저는 확대를 지원하지 않는다** — 그때는 확대 UI를 아예
   * 감춘다. CSS transform으로 preview만 키우는 흉내는 내지 않는다: 그건 화면만 커지고 녹화 파일은
   * 그대로라, 찍고 나서 ②에 가면 안 키운 영상이 나와 어긋난다. (확대해서 자르는 일은 ②의
   * crop.scale이 이미 담당한다)
   *
   * min은 기기마다 1이 아닐 수 있고(100 같은 값을 쓰는 기기도 있다) 배율 표시는 min 기준으로 낸다.
   */
  const [zoom, setZoomValue] = useState(1)
  const [zoomRange, setZoomRange] = useState(null)
  // 실제로 잡힌 해상도 { width, height }. 요청은 ideal이라 기기가 가진 모드로 떨어진다
  const [size, setSize] = useState(null)
  const zoomRangeRef = useRef(null)
  zoomRangeRef.current = zoomRange

  const recordMime = pickRecordMime()

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.onloadedmetadata = null
      videoRef.current.srcObject = null
    }
  }, [])

  /*
   * 카메라 켜기. facing이 바뀌면 다시 돈다 (이전 스트림은 cleanup이 끈다).
   *
   * cancelled 플래그가 필요한 이유: getUserMedia는 비동기라, 응답이 오기 전에 화면을 떠나거나
   * 전/후면을 다시 누르면 **이미 끝난 시도의 스트림**이 뒤늦게 도착한다. 그대로 붙이면
   * 정리 대상에서 빠져 카메라가 계속 켜져 있다. (개발 모드 StrictMode의 이중 마운트도 같은 경로다)
   */
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }

    let cancelled = false
    setStatus('starting')
    setError('')
    setSize(null) // 전/후면을 바꾸면 해상도도 바뀐다 — 이전 값을 남겨두면 잠깐 거짓말이 된다

    /*
     * 가로·세로를 **둘 다** 준다. 그리고 9:16이 아니라 세로 4:3(1080×1440)을 요청한다.
     *
     * 폰 센서는 4:3이다. 9:16(1080×1920)을 달라고 하면 브라우저가 좌우를 잘라 맞추므로
     * 화각이 4분의 1쯤 날아가 "확대된 채 고정된" 화면이 된다 — 처음 증상이 이것이었다.
     * 반대로 높이만 주고 가로를 비우면 삼성 기기가 **1080×1080(정사각)** 모드를 고른다.
     * 그 목록에 정사각이 있어서, 높이 1080만 맞으면 완벽 일치로 뽑히기 때문이다.
     * 4:3을 콕 집어야 두 함정을 모두 피하고 센서 화각을 그대로 받는다.
     *
     * 그래도 기기가 가진 모드가 달라 결과 비율은 갈린다 — 갤럭시는 1080×1440(4:3)을 주지만,
     * 아이폰은 HD 4:3 비디오 모드 자체가 없어 가장 가까운 1080×1920(9:16)으로 떨어진다.
     * 억지로 맞추면 결국 화각을 깎는 일이라 그대로 두고, **화면 쪽에서** 9:16 틀에 담아
     * 어느 기기든 같은 구도로 보이게 한다(CameraPage의 .sc-frame). 최종 9:16 자르기는 ②가 한다.
     *
     * facingMode에 exact를 쓰지 않는다 — 후면 카메라가 없는 기기에서 exact는 실패로 끝난다
     */
    const constraints = {
      video: {
        facingMode: facing,
        width: { ideal: 1080 },
        height: { ideal: 1440 },
        frameRate: { ideal: 30 },
      },
      audio: true,
    }

    /*
     * 실제로 잡힌 크기를 읽는다.
     *
     * getSettings()보다 video 엘리먼트의 videoWidth를 **앞에** 둔다 — iOS는 트랙 설정을
     * 가로(1920×1080)로 알려주면서 화면에는 세로로 그린다. 설정값만 믿으면 비율이 뒤집혀 보인다.
     * 메타데이터 도착 전에는 videoWidth가 0이라 loadedmetadata에서 한 번 더 읽는다.
     */
    const readSize = (stream) => {
      if (cancelled) return
      const el = videoRef.current
      const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {}
      const width = el?.videoWidth || settings.width || 0
      const height = el?.videoHeight || settings.height || 0
      if (width && height) setSize({ width, height })
    }

    /*
     * 확대 범위를 읽고 **가장 넓은 화각(min)으로 되돌린다**. 기기가 직전에 쓰던 배율을 기억해
     * 켜자마자 확대돼 있는 경우가 있어서, 켤 때마다 명시적으로 최소 배율을 넣는다.
     * getCapabilities 자체가 없는 브라우저(사파리)도, 있어도 zoom 항목이 없는 기기도 있다 → null.
     */
    const setupZoom = (stream) => {
      const track = stream.getVideoTracks()[0]
      const caps = track?.getCapabilities?.() ?? {}
      if (!caps.zoom || !(caps.zoom.max > caps.zoom.min)) {
        setZoomRange(null)
        setZoomValue(1)
        return
      }
      const range = { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 }
      setZoomRange(range)
      setZoomValue(range.min)
      track.applyConstraints({ advanced: [{ zoom: range.min }] }).catch(() => {})
    }

    const attach = (stream, withoutAudio) => {
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const el = videoRef.current
      if (el) {
        el.srcObject = stream
        el.onloadedmetadata = () => readSize(stream)
      }
      setupZoom(stream)
      readSize(stream)
      setMuted(withoutAudio)
      setStatus('ready')
    }

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => attach(stream, false))
      .catch((err) => {
        if (cancelled) return
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
          setStatus('denied')
          return
        }
        /*
         * 마이크만 막혀도 getUserMedia는 통째로 실패한다. 카메라만이라도 켜본다 —
         * 소리 없는 녹화가 아예 못 찍는 것보다 낫고, 그 사실은 화면에 알린다.
         */
        navigator.mediaDevices
          .getUserMedia({ video: constraints.video, audio: false })
          .then((stream) => attach(stream, true))
          .catch((second) => {
            if (cancelled) return
            setStatus(second?.name === 'NotAllowedError' ? 'denied' : 'error')
            setError(
              second?.name === 'NotFoundError'
                ? '카메라를 찾을 수 없습니다.'
                : '카메라를 켤 수 없습니다. 다른 앱이 쓰고 있는지 확인해 주세요.'
            )
          })
      })

    return () => {
      cancelled = true
      stopStream()
    }
  }, [facing, stopStream])

  // 화면을 떠날 때 녹화가 돌고 있으면 결과를 만들지 않고 버린다 (onstop이 사라진 화면을 건드리지 않게)
  useEffect(
    () => () => {
      clearInterval(timerRef.current)
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null
        recorder.stop()
      }
      recorderRef.current = null
    },
    []
  )

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    recorder.stop() // 결과 조립은 onstop에서 한다
  }, [])

  const start = useCallback(() => {
    const stream = streamRef.current
    if (!stream || recorderRef.current) return
    setError('')

    let recorder
    try {
      recorder = new MediaRecorder(stream, recordMime ? { mimeType: recordMime } : undefined)
    } catch {
      setError('이 브라우저에서는 녹화를 지원하지 않습니다. 아래에서 영상 파일을 골라주세요.')
      return
    }

    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      clearInterval(timerRef.current)
      recorderRef.current = null
      setRecording(false)

      const chunks = chunksRef.current
      chunksRef.current = []
      if (chunks.length === 0) return

      /*
       * 잰 시간을 길이로 쓴다. 상한으로 자르는 것이 중요하다 — 자동 정지는 타이머라 30.05초처럼
       * 살짝 넘게 잡히고, 그대로 두면 "30초 이하만" 검사에 자기 녹화가 걸린다.
       */
      const seconds = Math.min(maxSec, (performance.now() - startedAtRef.current) / 1000)

      // 파라미터(;codecs=...)를 뗀 형식으로 감싼다 — 서버·Storage에 그대로 실려 가는 값이다
      const type = baseMime(recorder.mimeType || recordMime) || 'video/webm'
      const extension = type === 'video/mp4' ? 'mp4' : 'webm'
      const file = new File(chunks, `recording.${extension}`, { type })
      onDoneRef.current(file, seconds)
    }

    startedAtRef.current = performance.now()
    setElapsed(0)
    recorder.start()
    recorderRef.current = recorder
    setRecording(true)

    timerRef.current = setInterval(() => {
      const seconds = (performance.now() - startedAtRef.current) / 1000
      setElapsed(seconds)
      if (seconds >= maxSec) stop()
    }, TICK_MS)
  }, [maxSec, recordMime, stop])

  const flip = useCallback(() => {
    if (recording) return // 녹화 중 전환은 스트림이 끊겨 조각이 어긋난다
    setFacing((prev) => (prev === 'user' ? 'environment' : 'user'))
  }, [recording])

  /**
   * 확대 배율을 바꾼다. 범위 밖 값은 잘라 넣으므로 핀치 계산이 튀어도 안전하다.
   * 녹화 중에도 막지 않는다 — 스트림을 새로 켜는 flip과 달리 트랙 제약만 바꾸는 것이라
   * MediaRecorder가 물고 있는 트랙이 그대로 유지된다.
   */
  const setZoom = useCallback((next) => {
    const range = zoomRangeRef.current
    const track = streamRef.current?.getVideoTracks?.()[0]
    if (!range || !track) return
    const value = Math.min(range.max, Math.max(range.min, next))
    setZoomValue(value)
    track.applyConstraints({ advanced: [{ zoom: value }] }).catch(() => {})
  }, [])

  return {
    videoRef,
    status,
    error,
    facing,
    flip,
    size,
    zoom,
    zoomRange,   // null이면 이 기기는 확대를 못 한다 → 화면에서 확대 UI를 감춘다
    setZoom,
    recording,
    elapsed,
    muted,
    start,
    stop,
    // 미리보기는 떴는데 녹화 형식이 없는 브라우저가 있다 — 그때는 파일 선택만 남긴다
    canRecord: status === 'ready' && recordMime !== '',
  }
}
