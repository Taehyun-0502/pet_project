import { useCallback, useEffect, useRef, useState } from 'react'
import { distanceMeters } from '../common/geo'

// 루트 CLAUDE.md "Phase: 산책 — 아스팔트 온도 안내 + GPS 산책 트래킹" 노이즈 필터 기준.
const MAX_ACCURACY_METERS = 30 // 이보다 부정확한(반경 큰) 좌표는 통째로 무시
const MIN_STEP_METERS = 5 // 직전 채택 좌표에서 이보다 덜 움직였으면 GPS 흔들림으로 보고 무시
const MAX_SPEED_MPS = 10 // 두 좌표 사이 평균 속도가 이를 넘으면(도보로 비현실적) 점프로 보고 무시

// 브라우저가 Geolocation API 자체를 지원하는지 — 모듈 로드 시점(=세션 내내 불변)
// 1회만 판정한다. start() 호출 전에도 초기 status를 결정하는 데 쓴다(QA M-4① —
// 지원하지 않는 브라우저에서는 시작 버튼을 처음부터 비활성화할 수 있어야 함).
const GEOLOCATION_SUPPORTED =
  typeof navigator !== 'undefined' && !!navigator.geolocation

/**
 * useWalkTracker — 브라우저 Geolocation `watchPosition`으로 산책 경로를 추적하는 훅.
 *
 * 루트 CLAUDE.md 산책 Phase 기준대로 노이즈 필터 3종을 거친 좌표만 경로(path)에
 * 쌓고 거리 누적에 반영한다: ① 정확도(accuracy) 30m 초과 무시 ② 직전 채택
 * 좌표에서 5m 미만 이동 무시 ③ 직전 채택 좌표 대비 평균 속도 10m/s 초과(비현실
 * 점프) 무시. 거부/무시된 좌표는 "직전 채택 좌표"를 갱신하지 않는다 — 그래야
 * GPS가 잠깐 흔들려도 이후 거리 계산이 그 흔들린 지점이 아니라 마지막으로
 * 신뢰한 지점을 기준으로 계속된다. 거리 누적은 `common/geo.js`의
 * `distanceMeters`(하버사인)를 그대로 쓴다 — 별도 거리 유틸을 새로 만들지 않는다.
 *
 * 이 훅 자신은 지도를 그리지 않는다 — path/거리/경과시간 상태만 제공하고,
 * 렌더링은 사용처(WalkPage)가 PetMap의 `path` prop으로 넘겨서 한다.
 *
 * 반환값
 * - status: 'idle' | 'tracking' | 'stopped' | 'unsupported'
 *     'unsupported'는 브라우저가 Geolocation 자체를 지원하지 않을 때의 상태다.
 *     모듈 로드 시점에 이미 판정되므로(GEOLOCATION_SUPPORTED) start()를 호출하기
 *     전부터 초기 status로 잡힌다 — 호출부가 마운트 즉시 시작 버튼을 비활성화하고
 *     안내를 보여줄 수 있다(QA M-4①). 위치 권한 거부는 이 status가 아니라 아래
 *     permissionDenied로 별도 노출한다(추적 도중 발생해도 status는 'tracking'을
 *     유지해야 통계·종료 버튼 화면이 갑자기 게이트로 되돌아가지 않기 때문).
 * - permissionDenied: boolean — watchPosition 오류 콜백이 PERMISSION_DENIED
 *     (error.code === 1)를 받으면 true로 노출된다(QA M-4②). 이후 성공 콜백을
 *     한 번이라도 받으면(권한이 다시 허용된 경우) false로 되돌아간다. start()
 *     호출 시 항상 false로 초기화된다. POSITION_UNAVAILABLE·TIMEOUT 등 다른
 *     오류 코드는 기존과 동일하게 무시한다(일시적 실패로 보고 다음 콜백을 기다림).
 * - path: Array<{ lat: number, lng: number }> — 노이즈 필터를 통과한 좌표 목록.
 *     시간 순서. stop() 호출로는 비워지지 않는다(종료 시점 값 보존 — 기록 저장에
 *     쓰기 위함) — 다음 start()를 호출해야 새로 초기화된다.
 * - distanceMeters: number — path를 따라 누적된 이동 거리(미터).
 * - elapsedSeconds: number — start() 이후 경과 시간(초). 1초 간격 타이머로 갱신.
 * - start(): void — 추적 시작. 이전 회차의 path/거리/시간/permissionDenied를
 *     초기화한다. 이미 추적 중이면 아무 동작도 하지 않는다(중복 watchPosition 방지).
 * - stop(): void — watchPosition 구독과 경과시간 타이머를 해제한다. path/거리/
 *     시간 값은 그대로 유지된다(종료 직후 요약·기록 저장에 사용할 수 있도록).
 *
 * 언마운트 시 watchPosition 구독과 타이머를 모두 정리한다(기존 QA R-1 타이머
 * 누수 관찰사항 준용 — MapPage.jsx의 emptyResultTimerRef 정리 패턴과 동일 원칙).
 *
 * 제약: 모바일 웹은 화면이 꺼지거나 다른 앱으로 전환되면 브라우저가
 * watchPosition 콜백 호출을 중단할 수 있다(웹 표준 한계 — 백그라운드 위치 추적
 * API 없음). 이 훅은 이를 감지·복구하지 않는다 — 사용자에게 고지하는 것은
 * 호출부(WalkPage)의 몫이다.
 *
 * 사용 예시:
 * ```jsx
 * const { status, permissionDenied, path, distanceMeters, elapsedSeconds, start, stop } =
 *   useWalkTracker()
 *
 * <button onClick={start} disabled={status === 'tracking' || status === 'unsupported'}>산책 시작</button>
 * <button onClick={stop} disabled={status !== 'tracking'}>산책 종료</button>
 * {permissionDenied && <p>위치 권한이 꺼져 있어 경로가 기록되지 않아요.</p>}
 * <PetMap places={[]} categories={[]} path={path} />
 * ```
 */
export function useWalkTracker() {
  const [status, setStatus] = useState(GEOLOCATION_SUPPORTED ? 'idle' : 'unsupported')
  const [path, setPath] = useState([])
  const [totalDistance, setTotalDistance] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  // QA M-4② — 위치 권한 거부(PERMISSION_DENIED) 노출용. status와 별도 필드로 둔
  // 이유는 위 JSDoc 참고(추적 중 상태 전환을 깨지 않기 위함).
  const [permissionDenied, setPermissionDenied] = useState(false)

  const watchIdRef = useRef(null)
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)
  // 노이즈 필터 기준점 — 마지막으로 "채택"된 좌표(+수신 시각). 거부된 좌표로는
  // 갱신하지 않는다.
  const lastAcceptedRef = useRef(null)
  const statusRef = useRef(GEOLOCATION_SUPPORTED ? 'idle' : 'unsupported') // start()가 최신 status를 동기적으로 참조하기 위한 ref
  // permissionDenied의 최신 값을 동기적으로 참조 — 매 위치 콜백마다 불필요한
  // setState(리렌더)를 피하기 위해 값이 실제로 바뀔 때만 setPermissionDenied를 호출한다.
  const permissionDeniedRef = useRef(false)

  const markPermissionDenied = useCallback((denied) => {
    if (permissionDeniedRef.current === denied) return
    permissionDeniedRef.current = denied
    setPermissionDenied(denied)
  }, [])

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    clearWatch()
    clearTimer()
    if (statusRef.current === 'tracking') {
      statusRef.current = 'stopped'
      setStatus('stopped')
    }
  }, [clearWatch, clearTimer])

  const start = useCallback(() => {
    if (statusRef.current === 'tracking') return // 중복 시작 방지

    // 보통은 초기 status에서 이미 'unsupported'로 걸러지지만(위 GEOLOCATION_SUPPORTED),
    // 방어적으로 한 번 더 확인한다.
    if (!GEOLOCATION_SUPPORTED) {
      statusRef.current = 'unsupported'
      setStatus('unsupported')
      return
    }

    // 새 회차 시작 — 이전 경로/거리/시간/권한거부 상태를 초기화한다.
    setPath([])
    setTotalDistance(0)
    setElapsedSeconds(0)
    lastAcceptedRef.current = null
    startTimeRef.current = Date.now()
    statusRef.current = 'tracking'
    setStatus('tracking')
    markPermissionDenied(false)

    clearTimer()
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)

    clearWatch()
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        // 위치를 성공적으로 받았다는 것 자체가 "지금은 권한이 허용된 상태"라는
        // 뜻이므로, 노이즈 필터로 걸러질 좌표라도 일단 권한거부 상태는 해제한다.
        markPermissionDenied(false)

        const { latitude, longitude, accuracy } = position.coords
        const timestamp = position.timestamp

        // ① 정확도 필터 — 반경이 너무 큰(부정확한) 좌표는 애초에 신뢰하지 않는다.
        if (typeof accuracy === 'number' && accuracy > MAX_ACCURACY_METERS) return

        const point = { lat: latitude, lng: longitude }
        const last = lastAcceptedRef.current

        // 첫 채택 좌표는 이동/속도 판정 기준이 없으므로 그대로 채택한다.
        if (!last) {
          lastAcceptedRef.current = { ...point, timestamp }
          setPath((prev) => [...prev, point])
          return
        }

        const moved = distanceMeters(last, point)

        // ② 최소 이동 거리 필터 — GPS 흔들림으로 인한 제자리 지터 무시.
        if (moved < MIN_STEP_METERS) return

        // ③ 비현실 속도 필터 — 같은 시각·역행 타임스탬프(dtSeconds<=0)는 속도를
        // 신뢰할 수 없는 경우다(과거엔 이럴 때 속도 검사를 건너뛰고 그대로
        // 채택해버려, 캐시된 좌표가 반복 전달될 때 점프가 누적되는 결함이 있었다
        // — QA L-4). 속도를 계산할 수 없으면 채택하지 않고 무시한다.
        const dtSeconds = (timestamp - last.timestamp) / 1000
        if (dtSeconds <= 0) return
        if (moved / dtSeconds > MAX_SPEED_MPS) return

        lastAcceptedRef.current = { ...point, timestamp }
        setTotalDistance((prev) => prev + moved)
        setPath((prev) => [...prev, point])
      },
      (error) => {
        // 위치 획득 실패 — 추적 자체를 강제 종료하지는 않는다(일시적 실패일 수
        // 있음). 다음 성공 콜백을 계속 기다린다. 단 PERMISSION_DENIED(코드 1)는
        // 사용자가 브라우저 권한을 껐다는 확정적 신호라 훅 상태로 노출한다
        // (QA M-4② — 호출부가 "위치 권한이 꺼져 있어 경로가 기록되지 않아요"
        // 안내를 보여줄 수 있도록). POSITION_UNAVAILABLE(2)·TIMEOUT(3)은 기존과
        // 동일하게 무시한다.
        if (error?.code === 1) {
          markPermissionDenied(true)
        }
      },
      { enableHighAccuracy: true },
    )
  }, [clearTimer, clearWatch, markPermissionDenied])

  // 언마운트 시 watchPosition 구독·타이머 정리 (QA R-1 타이머 누수 관찰사항 준용).
  useEffect(() => {
    return () => {
      clearWatch()
      clearTimer()
    }
  }, [clearWatch, clearTimer])

  return {
    status,
    permissionDenied,
    path,
    distanceMeters: totalDistance,
    elapsedSeconds,
    start,
    stop,
  }
}
