// 산책 페이지 — 루트 CLAUDE.md "Phase: 산책 — 아스팔트 온도 안내 + GPS 산책 트래킹".
// 신규 전용 페이지(/walk, 기존 /map 내 모드가 아님 — 2026-08-12 사용자 확정).
// 구성: 상단 아스팔트 온도 배너 + PetMap(장소 마커·카테고리 칩 없음, 현위치+경로
// 폴리라인) + 하단 산책 시작/종료·누적 거리·경과 시간.
//
// 초기 위치·날씨 조회(MapPage.jsx의 3초 race 패턴 준용): 마운트 시
// requestLocation()을 호출하되 응답을 최대 3초만 기다린다. 3초 안에 확정되면
// (허용 좌표 or 거부/미지원 null) 그 좌표로 날씨를 1회 조회한다. 3초를 넘기면
// 일단 DEFAULT_CENTER(서울시청)로 먼저 조회하고, 이후 위치가 "허용"으로 늦게
// 도착하면 그 좌표로 1회 더 재조회한다(거부/미지원으로 늦게 확정되면 재조회 없음).
// MapPage는 이 race의 결과로 GET /api/places(장소 목록)를 부르지만, 이 페이지는
// 같은 이유로 GET /api/walk/weather(아스팔트 온도)를 부른다는 점만 다르다.
//
// 지도 중심 "따라가기"는 PetMap이 아니라 이 페이지가 담당한다(PetMap은 path
// prop으로 경로선을 그리기만 함 — 공용 컴포넌트 책임 분리). 새 좌표가
// 노이즈 필터를 통과해 path에 추가될 때마다 fitBoundsKey를 올려서, PetMap의
// 기존 "범위 재조정" 메커니즘(currentLocation 단일 지점 → setCenter)을 그대로
// 재사용해 지도가 최신 위치를 따라가게 한다. 별도 imperative API를 새로 만들지
// 않는다.
//
// 종료 시 기록 저장: path/거리/시간은 stop() 이후에도 useWalkTracker가 값을
// 보존하므로(다음 start()까지) 그대로 페이로드에 담아 저장을 시도한다. 저장이
// 실패해도 pendingRecordRef에 페이로드를 보관해두고 "다시 저장" 버튼으로
// 재시도할 수 있게 한다(기록 유실 방지).

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PetMap from '../../components/PetMap'
import { formatDistanceLabel } from '../../common/geo'
import { DEFAULT_CENTER } from '../../common/mapDefaults'
import { useGeolocation } from '../../hooks/useGeolocation'
import { useWalkTracker } from '../../hooks/useWalkTracker'
// pet 도메인(멤버 소유) — 조회 함수만 가져다 쓴다. pet 도메인 파일 자체는 수정하지 않는다
// (2026-08-12 사용자 요청 "강아지별 시작" — 아래 petApi.js JSDoc: 내 것만, 최근 등록순).
import { getMyPets } from '../../pet/petApi'
import { getWalkWeather, saveWalkRecord } from './walkApi'
import './WalkPage.css'

// 조사(와/과) 선택 — 마지막 글자에 받침이 있으면 "과", 없으면 "와".
// 예: "초코"(받침 없음) → "초코와", "뭉치"(받침 없음) → "뭉치와", "몽"(받침 있음) → "몽과".
// 한글 완성형 범위 밖(영문 등) 이름이면 무난한 "와"로 폴백한다.
function withWaGwa(name) {
  if (!name) return '와'
  const code = name.charCodeAt(name.length - 1)
  if (code < 0xac00 || code > 0xd7a3) return '와'
  const hasBatchim = (code - 0xac00) % 28 !== 0
  return hasBatchim ? '과' : '와'
}

// 위험 단계 한국어 라벨·색 — 루트 CLAUDE.md 확정값(25℃ 미만 안전 / 25~35 주의 /
// 35~50 위험 / 50 이상 매우 위험). 서버 enum(SAFE|CAUTION|DANGER|SEVERE)은 절대
// 화면에 그대로 노출하지 않는다("UI에 엔티티 속성명·개발 용어 노출 금지" 원칙).
// 색상은 design-agent의 토큰 승격 전까지 이 파일 로컬 정의로 둔다(백로그).
const RISK_META = {
  SAFE: { label: '안전', color: '#16a34a' },
  CAUTION: { label: '주의', color: '#ca8a04' },
  DANGER: { label: '위험', color: '#ea580c' },
  SEVERE: { label: '매우 위험', color: '#dc2626' },
}

// DANGER 이상(위험/매우 위험)이면 발바닥 화상 주의 문구를 추가로 보여준다.
const PAW_WARNING_LEVELS = new Set(['DANGER', 'SEVERE'])

function formatTemp(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}℃` : '-'
}

// 경과 시간(초) → "mm:ss". 다른 화면에서 아직 쓰이지 않아 common/으로 승격하지
// 않고 이 파일 로컬에 둔다(거리 포맷은 기존 common/geo.js formatDistanceLabel 재사용).
function formatElapsed(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function WalkPage() {
  const { location, requestLocation } = useGeolocation()
  const tracker = useWalkTracker()

  const [weather, setWeather] = useState(null) // null = 아직 없음 또는 조회 실패 — 배너 비표시
  const [fitBoundsKey, setFitBoundsKey] = useState(0)
  const [summary, setSummary] = useState(null) // 종료 후 요약 { distanceMeters, durationSeconds }
  const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'saving' | 'success' | 'error'

  // 강아지별 시작 (2026-08-12 사용자 요청) — 통합 "산책 시작" 버튼을 없애고 내
  // 반려동물 리스트를 보여준 뒤, 강아지마다 개별 시작 버튼을 둔다.
  // pets: null=로딩 중, []=등록된 반려동물 없음, 배열=목록
  const [pets, setPets] = useState(null)
  const [petsError, setPetsError] = useState('')
  // selectedPet: GPS 안내 팝업에서 "시작하기"를 누르기 전, 방금 시작 버튼을 누른 강아지
  // (팝업 제목에 이름을 반영하기 위함). 취소하면 선택 해제(null)한다.
  const [selectedPet, setSelectedPet] = useState(null)
  // activePet: 실제로 추적을 시작한(또는 방금 종료한) 강아지. path/거리와 마찬가지로
  // 다음 start()까지 값을 보존해 종료 후 요약에도 이름을 표시할 수 있게 한다.
  const [activePet, setActivePet] = useState(null)

  const fetchPets = useCallback(() => {
    setPets(null)
    setPetsError('')
    getMyPets()
      .then(setPets)
      .catch((err) => setPetsError(err.message || '반려동물 목록을 불러오지 못했어요.'))
  }, [])

  useEffect(() => {
    fetchPets()
  }, [fetchPets])

  // 응답 순서 역전 방지 — 기본 좌표 조회와 뒤늦은 실제 좌표 재조회가 겹칠 수 있어
  // MapPage의 nearbyRequestIdRef와 같은 원리로 최신 요청만 반영한다.
  const weatherRequestIdRef = useRef(0)
  const fetchWeather = useCallback(async (lat, lng) => {
    const requestId = ++weatherRequestIdRef.current
    try {
      const data = await getWalkWeather(lat, lng)
      if (weatherRequestIdRef.current !== requestId) return
      setWeather(data)
    } catch {
      // 로드 실패 시 배너만 조용히 비표시 — 페이지 자체(지도·추적)는 계속 동작
      if (weatherRequestIdRef.current !== requestId) return
      setWeather(null)
    }
  }, [])

  // 종료 시점 기록 페이로드 보관 — 저장 실패 시 "다시 저장" 재시도에 사용(기록 유실 방지)
  const pendingRecordRef = useRef(null)
  const startedAtRef = useRef(null)

  // 마운트 시 1회 — 위치 권한 결과와 3초 타이머를 race시킨다 (MapPage.jsx와 동일 패턴,
  // 상세 사유는 파일 상단 주석·MapPage.jsx의 원본 주석 참고).
  useEffect(() => {
    let cancelled = false
    let settled = false
    let timedOut = false

    const timer = setTimeout(() => {
      if (cancelled || settled) return
      settled = true
      timedOut = true
      fetchWeather(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng)
    }, 3000)

    requestLocation().then((loc) => {
      if (cancelled) return
      clearTimeout(timer)

      if (timedOut) {
        // 이미 기본 좌표로 날씨를 조회한 상태 — 위치가 뒤늦게 "허용"으로 확정된
        // 경우에만 그 좌표로 재조회하고 지도도 내 위치 기준으로 옮긴다.
        if (loc) {
          setFitBoundsKey((key) => key + 1)
          fetchWeather(loc.lat, loc.lng)
        }
        return
      }

      if (settled) return
      settled = true
      const center = loc ?? DEFAULT_CENTER
      if (loc) setFitBoundsKey((key) => key + 1)
      fetchWeather(center.lat, center.lng)
    })

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [requestLocation, fetchWeather])

  // "내 위치로 이동" 버튼 — PetMap이 currentLocation 없을 때만 호출한다.
  const handleLocateClick = useCallback(() => {
    requestLocation()
  }, [requestLocation])

  // 추적 중 새 좌표(노이즈 필터 통과분)가 path에 추가될 때마다 지도 중심이
  // 그 지점을 따라가도록 fitBoundsKey를 올린다 — PetMap 자체 API가 아니라
  // 기존 fitBoundsKey 메커니즘을 재사용(파일 상단 주석 참고).
  useEffect(() => {
    if (tracker.status !== 'tracking' || tracker.path.length === 0) return
    setFitBoundsKey((key) => key + 1)
  }, [tracker.path.length, tracker.status])

  // 지도에 보여줄 현재 위치 — 추적 중이면 방금 채택된 최신 경로 지점, 아니면
  // useGeolocation의 위치(권한 미획득/거부면 null → PetMap이 현위치 마커를 숨김).
  const latestTrackedPoint =
    tracker.path.length > 0 ? tracker.path[tracker.path.length - 1] : null
  const mapCurrentLocation = latestTrackedPoint ?? location

  const trySaveRecord = useCallback(async () => {
    if (!pendingRecordRef.current) return
    setSaveStatus('saving')
    try {
      await saveWalkRecord(pendingRecordRef.current)
      setSaveStatus('success')
      pendingRecordRef.current = null
    } catch {
      setSaveStatus('error')
    }
  }, [])

  // 실제 추적 시작(useWalkTracker.start 호출) — GPS 안내 팝업에서 "시작하기"를
  // 눌러야만 호출된다. 강아지 리스트의 "산책 시작" 버튼 클릭만으로는 곧바로
  // 시작하지 않는다(2026-08-12 사용자 요청 — 매 시작 시마다 안내 팝업 노출,
  // 최초 1회 제한 없음). pet: 이번 산책의 대상 강아지(필수).
  const beginTracking = (pet) => {
    setSummary(null)
    setSaveStatus('idle')
    pendingRecordRef.current = null
    startedAtRef.current = new Date().toISOString()
    setActivePet(pet)
    tracker.start()
  }

  // 강아지 리스트의 "산책 시작" 버튼 → 곧바로 시작하지 않고 그 강아지를 선택한
  // 채 GPS 안내 팝업을 먼저 띄운다.
  const [startConfirmOpen, setStartConfirmOpen] = useState(false)
  const handleStartClick = (pet) => {
    setSelectedPet(pet)
    setStartConfirmOpen(true)
  }
  const closeStartConfirm = useCallback(() => {
    setStartConfirmOpen(false)
    setSelectedPet(null) // 취소 시 선택 해제
  }, [])
  const handleConfirmStart = () => {
    setStartConfirmOpen(false)
    beginTracking(selectedPet)
  }

  // GPS 안내 팝업 접근성 — MapPage/PetMap의 기존 바텀시트 패턴 준용: 열릴 때
  // 시트로 포커스 이동 + Tab 트랩(시트 안 순환, 버튼이 2개라 PetMap 상세 시트와
  // 동일 원칙 적용) + ESC로 닫기 + 배경 스크롤 잠금, 닫힐 때 열기 전 포커스로 복귀.
  const startSheetRef = useRef(null)
  const startPreviousFocusRef = useRef(null)

  useEffect(() => {
    if (!startConfirmOpen) return

    startPreviousFocusRef.current = document.activeElement
    startSheetRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeStartConfirm()
        return
      }
      if (event.key !== 'Tab') return

      const panel = startSheetRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll('button:not([disabled])')
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      startPreviousFocusRef.current?.focus?.()
    }
  }, [startConfirmOpen, closeStartConfirm])

  const handleStartBackdropClick = (event) => {
    if (event.target === event.currentTarget) closeStartConfirm()
  }

  const handleStop = () => {
    const endedAt = new Date().toISOString()
    // stop() 이후에도 path/거리/시간 값은 훅이 보존하지만, 여기서 스냅샷을 먼저
    // 떠서 이후 어떤 상태 변화와도 무관하게 저장 페이로드가 흔들리지 않게 한다.
    const finishedPath = tracker.path
    const distance = tracker.distanceMeters
    const duration = tracker.elapsedSeconds
    tracker.stop()

    setSummary({ distanceMeters: distance, durationSeconds: duration })

    pendingRecordRef.current = {
      // 강아지별 시작(2026-08-12)으로 이제 실제 petId를 채워 보낸다 — activePet은
      // 시작 버튼을 누른 강아지 리스트 항목에서 반드시 채워지므로 여기선 항상 값이
      // 있어야 정상이지만, 값이 없어도(이론상 불가) JSON.stringify가 undefined
      // 키를 생략해 백엔드의 기존 nullable petId 처리와 호환된다.
      petId: activePet?.id,
      startedAt: startedAtRef.current,
      endedAt,
      durationSeconds: duration,
      distanceMeters: distance,
      path: finishedPath,
      airTemp: weather?.airTemp,
      asphaltTemp: weather?.asphaltTemp,
    }
    trySaveRecord()
  }

  const isTracking = tracker.status === 'tracking'
  const riskMeta = weather ? RISK_META[weather.riskLevel] : null

  return (
    <main className="walk-page">
      <h1 className="walk-page__title">산책</h1>

      {/* 아스팔트 온도 배너 (2026-08-12 재배치): 지도 밖 별도 영역이 아니라 지도 위
          플로팅 오버레이로 변경 — 비운 공간만큼 아래 .walk-page__map-wrap 높이를
          키웠다. MapPage.css의 검색바 오버레이(top:12 + right:60px로 우상단 줌
          컨트롤 회피)와 동일 원칙: PetMap은 z-index:0 독립 스태킹 컨텍스트로
          격리돼 있어(PetMap.css 상단 주석), 이 배너처럼 <PetMap/> "뒤에" 렌더링되는
          형제 요소는 z-index 없이 DOM 순서만으로 항상 그 위에 그려진다(QA N-1 규칙
          — z-index 값을 새로 부여하지 않음). 좌상단은 이 페이지가 categories=[]라
          카테고리 토글 칩이 렌더링되지 않아(비노출) 비어 있으므로 겹치지 않는다.
          GPS 안내 팝업(.walk-page__sheet-backdrop, position:fixed·z-index:1000)은
          열릴 때 전체 화면을 덮으므로 이 배너와 위치가 겹쳐도 항상 위에 그려져
          충돌하지 않는다. */}
      <div className="walk-page__map-wrap">
        {/* 지도 블러 게이트 (2026-08-12 사용자 결정 "B") — 산책 시작 전(대기 상태)에는
            지도 자체를 흐리게 처리해 "아직 시작 전"임을 시각적으로 드러내고, 지도는
            언마운트하지 않는다(PetMap SDK 인스턴스 유지 — 재생성 비용 회피, 위치·경로
            상태도 그대로 보존). 블러는 PetMap 내부가 아니라 이 래퍼(walk-page 소유
            CSS)에서 filter로 건다 — 공용 컴포넌트(PetMap)는 건드리지 않는다. 아래
            .walk-page__gate(강아지 리스트)가 대기 중에만 그 위에 뜬다. 추적 시작
            (isTracking=true)이 되는 순간 --blurred 클래스가 빠지며 filter 전환
            (260ms)으로 부드럽게 선명해진다(prefers-reduced-motion 대응은 CSS 참고). */}
        <div
          className={
            'walk-page__map-surface' +
            (isTracking ? '' : ' walk-page__map-surface--blurred')
          }
        >
          <PetMap
            size="full"
            places={[]}
            categories={[]}
            path={tracker.path}
            currentLocation={mapCurrentLocation}
            onLocateClick={handleLocateClick}
            fitBoundsKey={fitBoundsKey}
          />
        </div>

        {/* 온도 배너는 블러 대상이 아니다 — "나가기 전 판단" 정보라 항상 선명하게
            유지한다(2026-08-12 확정). 위 blur 래퍼의 형제로 둬 filter 영향을 받지 않는다.
            단, 대기(게이트) 상태에는 아래 .walk-page__gate-panel 안에 같은 정보를 이미
            보여주므로 배너는 숨겨 중복 노출을 피한다(2026-08-12 사용자 요청) — 추적을
            시작해 게이트가 사라지는 순간(isTracking=true)에만 배너가 나타난다. */}
        {weather && isTracking && (
          <div
            className="walk-page__weather-banner"
            style={riskMeta ? { '--risk-color': riskMeta.color } : undefined}
            role="status"
          >
            <span className="walk-page__weather-temp">
              노면 추정 온도 {formatTemp(weather.asphaltTemp)}
            </span>
            {riskMeta && <span className="walk-page__weather-badge">{riskMeta.label}</span>}
            {PAW_WARNING_LEVELS.has(weather.riskLevel) && (
              <p className="walk-page__weather-warning">발바닥 화상 주의</p>
            )}
          </div>
        )}

        {/* 강아지별 시작 (2026-08-12 사용자 요청, 2026-08-12 "B. 지도 블러 게이트"로
            배치 변경) — 통합 "산책 시작" 버튼 대신 내 반려동물 리스트를 블러 처리된
            지도 중앙에 띄우고, 강아지마다 개별 시작 버튼을 둔다. 추적 중에는 지도가
            선명해지고 기존처럼 거리/시간 + 종료 버튼 알약형 바를 하단에 보여준다
            (같은 "bottom:44px" 패턴 — 좌하단 카카오 로고 회피). */}
        {!isTracking ? (
          <div className="walk-page__gate" aria-live="polite">
            <div className="walk-page__gate-panel">
              {/* 온도 요약 (2026-08-12 사용자 요청) — 게이트가 떠 있는 동안엔 지도 위
                  플로팅 배너를 숨기는 대신(위 조건 참고) 같은 weather 상태를 카드 상단에
                  보여준다. 카드 자체가 이미 글래스라 여기선 중첩 블러 없이 구분선 +
                  배지 수준으로만 표현한다. 조회 실패로 weather가 null이면 조용히
                  생략하고 강아지 리스트만 정상 노출(기존 배너 비표시 원칙과 동일). */}
              {weather && (
                <div
                  className="walk-page__gate-weather"
                  style={riskMeta ? { '--risk-color': riskMeta.color } : undefined}
                >
                  <span className="walk-page__gate-weather-temp">
                    노면 추정 온도 {formatTemp(weather.asphaltTemp)}
                  </span>
                  {riskMeta && (
                    <span className="walk-page__gate-weather-badge">{riskMeta.label}</span>
                  )}
                  {PAW_WARNING_LEVELS.has(weather.riskLevel) && (
                    <p className="walk-page__gate-weather-warning">발바닥 화상 주의</p>
                  )}
                </div>
              )}

              {pets === null && !petsError && (
                <p className="walk-page__pet-status walk-page__pet-status--center">
                  반려동물 불러오는 중…
                </p>
              )}

              {petsError && (
                <div className="walk-page__pet-status walk-page__pet-status--error walk-page__pet-status--center">
                  <p>{petsError}</p>
                  <button type="button" onClick={fetchPets}>
                    다시 시도
                  </button>
                </div>
              )}

              {pets && pets.length === 0 && (
                <div className="walk-page__pet-status walk-page__pet-status--center">
                  <p>등록된 반려동물이 없어요.</p>
                  <Link to="/pets/new">반려동물 등록하러 가기</Link>
                </div>
              )}

              {pets && pets.length > 0 && (
                <ul className="walk-page__pet-list">
                  {pets.map((pet) => (
                    <li key={pet.id} className="walk-page__pet-row">
                      {pet.profileImageUrl ? (
                        <img className="walk-page__pet-thumb" src={pet.profileImageUrl} alt="" />
                      ) : (
                        <span
                          className="walk-page__pet-thumb walk-page__pet-thumb--empty"
                          aria-hidden="true"
                        >
                          🐶
                        </span>
                      )}
                      <span className="walk-page__pet-name">{pet.name}</span>
                      <button
                        type="button"
                        className="walk-page__pet-start-btn"
                        onClick={() => handleStartClick(pet)}
                      >
                        산책 시작
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="walk-page__control-bar">
            <div className="walk-page__stats" aria-live="polite">
              <span className="walk-page__stat walk-page__stat--name">
                {activePet?.name ?? '반려동물'} 산책 중
              </span>
              <span className="walk-page__stat">
                <span className="walk-page__stat-value">
                  {formatDistanceLabel(tracker.distanceMeters)}
                </span>
                <span className="walk-page__stat-label">거리</span>
              </span>
              <span className="walk-page__stat">
                <span className="walk-page__stat-value">
                  {formatElapsed(tracker.elapsedSeconds)}
                </span>
                <span className="walk-page__stat-label">시간</span>
              </span>
            </div>

            <button type="button" className="walk-page__stop-btn" onClick={handleStop}>
              산책 종료
            </button>
          </div>
        )}

        {/* GPS 정보 안내 팝업(2026-08-12 사용자 요청) — "산책 시작" 클릭 시 곧바로
            추적을 시작하지 않고 먼저 노출한다. "시작하기"를 눌러야 beginTracking()이
            호출되고, 취소/백드롭/ESC는 아무 것도 시작하지 않는다. 기존에 하단에
            상시 노출하던 중단 고지 문구는 중복을 피해 이 팝업 안으로 옮겼다. */}
        {startConfirmOpen && (
          <div
            className="walk-page__sheet-backdrop"
            onMouseDown={handleStartBackdropClick}
          >
            <div
              ref={startSheetRef}
              className="walk-page__sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="walk-start-confirm-title"
              tabIndex={-1}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <span className="walk-page__sheet-handle" aria-hidden="true" />
              <h2 id="walk-start-confirm-title" className="walk-page__sheet-title">
                {selectedPet
                  ? `${selectedPet.name}${withWaGwa(selectedPet.name)} 산책을 시작할까요?`
                  : '산책을 시작할까요?'}
              </h2>
              <ul className="walk-page__sheet-list">
                <li>산책 경로·거리 기록을 위해 GPS 위치 정보를 사용합니다(브라우저 위치 권한 허용 필요).</li>
                <li>화면이 꺼지거나 다른 앱으로 이동하면 기록이 일시 중단될 수 있어요.</li>
                <li>위치 정보는 산책 기록에만 사용됩니다.</li>
              </ul>
              <div className="walk-page__sheet-actions">
                <button
                  type="button"
                  className="walk-page__sheet-cancel-btn"
                  onClick={closeStartConfirm}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="walk-page__sheet-confirm-btn"
                  onClick={handleConfirmStart}
                >
                  시작하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {summary && (
        <div className="walk-page__summary" role="status">
          <p className="walk-page__summary-text">
            {activePet?.name ?? '반려동물'} 산책 기록 ·{' '}
            {formatDistanceLabel(summary.distanceMeters)} · {formatElapsed(summary.durationSeconds)}
          </p>
          {saveStatus === 'saving' && <p className="walk-page__save-status">기록 저장 중…</p>}
          {saveStatus === 'success' && (
            <p className="walk-page__save-status">기록이 저장되었어요.</p>
          )}
          {saveStatus === 'error' && (
            <div className="walk-page__save-error">
              <p>기록 저장에 실패했어요.</p>
              <button type="button" onClick={trySaveRecord}>
                다시 저장
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  )
}

export default WalkPage
