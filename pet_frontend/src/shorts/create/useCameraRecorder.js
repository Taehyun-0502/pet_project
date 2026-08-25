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
  const [facing, setFacing] = useState('user')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  // 마이크를 못 받은 채 카메라만 켜진 상태. 이 경우 녹화본에 소리가 없다
  const [muted, setMuted] = useState(false)

  const recordMime = pickRecordMime()

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
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

    const constraints = {
      // exact를 쓰지 않는다 — 후면 카메라가 없는 기기에서 exact는 실패로 끝난다
      video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: true,
    }

    const attach = (stream, withoutAudio) => {
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
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

  return {
    videoRef,
    status,
    error,
    facing,
    flip,
    recording,
    elapsed,
    muted,
    start,
    stop,
    // 미리보기는 떴는데 녹화 형식이 없는 브라우저가 있다 — 그때는 파일 선택만 남긴다
    canRecord: status === 'ready' && recordMime !== '',
  }
}
