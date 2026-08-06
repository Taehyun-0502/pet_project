// 지도 단독 메뉴 페이지 — 루트 CLAUDE.md "Phase: 지도 + AI 장소 추천" ①.
// 검색바가 곧 AI 챗봇 입력창이다(플로팅 버튼 없음). 제출하면 POST /api/chat을 호출해
// 답변 카드와 장소 마커(PetMap)를 함께 보여준다.
//
// 진입 시 초기 마커 노출(기획 원안): 검색 전에도 주변 장소가 보이도록, 마운트 시
// GET /api/places로 주변을 조회해 마커를 채운다. AI 검색 결과가 도착하면 마커를
// 검색 결과로 교체하고, 답변 카드를 닫으면 다시 주변 전체 마커로 복귀한다.
//
// 현위치 동작(사용자 결정으로 확정, 최초안에서 변경됨):
// - 마운트 시 requestLocation()을 1회 호출해 위치 권한 팝업을 띄우되, 응답을 최대 3초만
//   기다린다(race). 3초 안에 확정되면(허용 좌표 or 거부/미지원 null) 그 결과로 초기 조회를
//   1회 한다. 3초를 넘기면(예: 사용자가 팝업을 방치 — getCurrentPosition은 팝업이 열려
//   있는 동안 콜백이 아예 발화하지 않아 timeout 옵션이 적용되지 않는다) 일단
//   DEFAULT_CENTER(서울시청)로 초기 조회를 먼저 하고, 이후 위치가 "허용"으로 늦게
//   도착하면 그 좌표로 1회 더 재조회한다. 거부/미지원으로 늦게 확정되면 재조회하지 않는다.
// - 위치 응답이 오기 전에 사용자가 검색을 실행하면 검색이 우선 — 기다리지 않고
//   좌표 없이(또는 이미 확보된 좌표로) 즉시 진행한다.
// - 한 번 거부/미지원으로 확정되면 이후 검색마다 다시 권한을 요청하지 않는다
//   (QA M-2 — 매 검색마다 팝업/5초 타임아웃 반복 방지). 재시도는 PetMap의
//   "내 위치로 이동" 버튼을 눌렀을 때만 명시적으로 이루어진다.
//
// "이 지역에서 재검색" 버튼(2026-08-06 확정): 지도를 옮길 때마다 자동으로 재조회하지
// 않는다(카카오 쿼터 낭비 + AI 검색 결과 마커를 의도치 않게 덮어써버리는 문제).
// 대신 PetMap의 onMapMoved로 "사용자가 직접 지도를 움직였다"는 신호만 받아, 마지막
// 조회 중심과의 거리가 RESEARCH_THRESHOLD_METERS 이상이면 버튼을 띄우고, 클릭했을
// 때만 그 중심으로 getNearbyPlaces를 재조회한다.
//
// 재검색 시 축척·중심 유지(2026-08-06 확정): 재검색은 지금 보고 있는 화면(축척·중심)
// 그대로 마커만 갱신한다 — 범위 자동 맞춤(PetMap의 fitBoundsKey)은 ① 최초 진입
// (초기 주변 조회, 3초 race의 즉시/지연 분기 모두 포함) ② AI 검색 결과 표시 때만
// 수행한다. "내 위치로 이동" 재조회와 재검색 버튼 재조회는 fitBoundsKey를 올리지
// 않는다 — 전자는 PetMap이 현위치로 이미 자체 panTo하므로 범위 맞춤과 겹칠 필요가
// 없고, 후자는 이번 요구사항의 핵심(축척 유지)이다.
//
// 검색바·토글 한 줄 배치(2026-08-06 확정): 카테고리 토글 칩의 상태·로직은 여전히
// PetMap 내부에 있고(공통 구현 원칙 유지), toggleSlot prop으로 "그릴 위치"만 검색바
// 옆 DOM 노드로 포털한다 — 토글을 MapPage로 옮겨 다시 구현하지 않는다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PetMap from '../../components/PetMap'
import SearchBar from '../../components/SearchBar'
import { useGeolocation } from '../../hooks/useGeolocation'
import { askChat, getNearbyPlaces } from './mapApi'
import './MapPage.css'

// PetMap.jsx의 DEFAULT_CENTER(서울시청)와 동일한 값 — 위치 권한이 없을 때
// 초기 마커 조회에 쓸 기본 좌표. PetMap은 수정 대상이 아니므로 값만 그대로 미러링한다.
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }

// "이 지역에서 재검색" 버튼을 띄울 최소 이동 거리(대략). 하버사인 근사로 충분하다는
// 판단 — 재검색 여부를 가리는 용도일 뿐 정밀한 지리 계산이 필요한 곳이 아니다.
const RESEARCH_THRESHOLD_METERS = 500

function distanceMeters(a, b) {
  const R = 6371000
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function MapPage() {
  const { location, status, requestLocation } = useGeolocation()

  // nearbyPlaces: 진입 시(또는 "내 위치로 이동" 재시도 시) 조회한 "주변 전체" 마커
  // searchPlaces: AI 검색 응답으로 받은 마커 — 답변 카드가 떠 있는 동안만 노출
  const [nearbyPlaces, setNearbyPlaces] = useState([])
  const [searchPlaces, setSearchPlaces] = useState([])
  const [answer, setAnswer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // researchCenter: "이 지역에서 재검색" 버튼이 눌리길 기다리는 새 중심 좌표
  // (null이면 버튼 숨김 — 아직 충분히 이동하지 않았거나, 막 재조회를 마친 상태)
  const [researchCenter, setResearchCenter] = useState(null)
  const [researchLoading, setResearchLoading] = useState(false)

  // PetMap에 "지금 범위를 다시 맞춰라"고 알리는 키 — 값이 바뀔 때만 PetMap이
  // setBounds/setCenter를 수행한다. 초기 진입·AI 검색 성공 때만 올린다(아래 참고).
  const [fitBoundsKey, setFitBoundsKey] = useState(0)

  // 검색바와 카테고리 토글 칩을 같은 줄에 배치하기 위한 포털 대상 DOM 노드.
  // 토글의 상태/로직은 PetMap 내부에 그대로 있고, 그릴 위치만 이 노드로 옮긴다.
  const [toggleSlotNode, setToggleSlotNode] = useState(null)

  // 응답 순서가 뒤바뀌어 오래된 주변 조회 결과가 최신 결과를 덮어쓰지 않도록 요청 ID로 판별
  const nearbyRequestIdRef = useRef(0)
  // 마지막으로 "주변 조회"를 실제로 수행한 중심 — 재검색 버튼의 거리 기준점
  const lastQueryCenterRef = useRef(null)

  // fit=true일 때만 이 조회 결과로 지도 범위를 다시 맞춘다(fitBoundsKey 증가).
  // 재검색(fit 생략 → false)은 마커만 갈아끼우고 현재 축척·중심을 그대로 둔다.
  const loadNearbyPlaces = useCallback(async (lat, lng, { fit = false } = {}) => {
    const requestId = ++nearbyRequestIdRef.current
    lastQueryCenterRef.current = { lat, lng }
    setResearchCenter(null) // 방금 이 위치로 조회를 시작했으니 재검색 버튼은 일단 숨긴다
    try {
      const data = await getNearbyPlaces(lat, lng)
      if (nearbyRequestIdRef.current !== requestId) return // 중간에 새 요청이 시작됨 — 폐기
      setNearbyPlaces(data.places ?? [])
      if (fit) setFitBoundsKey((key) => key + 1)
    } catch (err) {
      if (nearbyRequestIdRef.current !== requestId) return
      // 초기 조회 실패를 조용히 무시하지 않고 기존 에러 배너를 재사용한다.
      // 단, 지도 자체(빈 마커 상태)는 계속 보여준다.
      setError(err.message || '주변 장소를 불러오지 못했습니다.')
    }
  }, [])

  // PetMap이 "사용자가 지도를 직접 움직였다"고 알려줄 때(드래그/줌 등, 자체 프로그래밍적
  // 이동은 PetMap 내부에서 이미 걸러짐) 호출된다. 마지막 조회 중심에서 충분히
  // 멀어졌을 때만 재검색 버튼을 띄운다 — 다시 가까워지면 자동으로 숨긴다.
  const handleMapMoved = useCallback((center) => {
    if (!lastQueryCenterRef.current) return // 아직 첫 조회 전 — 판단 기준이 없음
    const moved = distanceMeters(lastQueryCenterRef.current, center)
    setResearchCenter(moved >= RESEARCH_THRESHOLD_METERS ? center : null)
  }, [])

  const handleResearchClick = async () => {
    if (!researchCenter) return
    setResearchLoading(true)
    // AI 답변 카드가 떠 있으면 닫고 주변 마커 모드로 전환한다.
    if (answer) setAnswer(null)
    await loadNearbyPlaces(researchCenter.lat, researchCenter.lng)
    setResearchLoading(false)
  }

  // 마운트 시 1회 — 위치 권한 결과와 3초 타이머를 race시킨다.
  // 버그 실증: 사용자가 브라우저 권한 팝업에 응답하지 않으면 getCurrentPosition의
  // 두 콜백(성공/실패) 모두 영영 발화하지 않는다 — Geolocation의 `timeout` 옵션은
  // "허용 후 위치 확인이 오래 걸릴 때"만 적용되고, 팝업 자체가 방치된 경우에는
  // 동작하지 않는다. 그 결과 requestLocation()의 Promise가 끝내 resolve되지 않아
  // 초기 GET /api/places 호출 자체가 발생하지 않았다(Network 탭 무요청으로 확인됨).
  // 그래서 여기서는 위치 확정을 최대 3초만 기다리고, 그 안에 못 받으면 일단
  // DEFAULT_CENTER로 초기 조회를 먼저 발사한 뒤, 이후 위치가 "허용"으로 늦게
  // 도착하면 그 좌표로 1회 더 재조회한다(거부/미지원으로 늦게 확정되면 재조회 없음).
  useEffect(() => {
    let cancelled = false
    let settled = false // 이미 "초기" 조회를 발사했는지 (3초 타이머 or 정상 응답 중 먼저 온 쪽)
    let timedOut = false

    const timer = setTimeout(() => {
      if (cancelled || settled) return
      settled = true
      timedOut = true
      loadNearbyPlaces(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng)
    }, 3000)

    requestLocation().then((loc) => {
      if (cancelled) return
      clearTimeout(timer)

      if (timedOut) {
        // 이미 기본 좌표로 초기 조회를 한 상태 — 위치가 뒤늦게 "허용"으로 확정된 경우에만
        // 그 좌표로 재조회한다. loadNearbyPlaces 내부의 requestId 가드가 두 응답 중
        // 오래된 쪽을 자동으로 폐기하므로 순서가 뒤바뀌어도 최신 결과만 반영된다.
        if (loc) loadNearbyPlaces(loc.lat, loc.lng)
        return
      }

      if (settled) return // 안전장치 — 이론상 도달하지 않음
      settled = true
      const center = loc ?? DEFAULT_CENTER
      loadNearbyPlaces(center.lat, center.lng)
    })

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [requestLocation, loadNearbyPlaces])

  // "내 위치로 이동" 버튼(PetMap)에서만 명시적으로 위치를 재요청하고, 성공하면 그 좌표로
  // 주변 장소를 재조회한다. 마운트 시 첫 조회는 위 이펙트가 이미 처리하므로 여기서는
  // 그 이후의 사용자 명시 재시도에만 반응한다 — 반응형 위치 감시 없이 콜백 안에서
  // 직접 재조회를 트리거해 이중 호출 경합을 피한다.
  const handleLocateClick = useCallback(() => {
    requestLocation().then((loc) => {
      if (loc) loadNearbyPlaces(loc.lat, loc.lng)
    })
  }, [requestLocation, loadNearbyPlaces])

  // 답변 카드가 떠 있으면 검색 결과 마커를, 아니면 주변 전체 마커를 보여준다 —
  // 답변 카드를 닫아 answer가 null이 되면 자동으로 주변 마커로 복귀한다.
  const displayedPlaces = useMemo(
    () => (answer ? searchPlaces : nearbyPlaces),
    [answer, searchPlaces, nearbyPlaces],
  )

  const handleAiSearch = async (query) => {
    setLoading(true)
    setError(null)

    // 마운트 시 이미 위치 요청이 1회 트리거되어 있다. 여기서는 그 결과를 활용한다:
    // - granted: location을 그대로 사용
    // - loading: 응답을 기다리지 않고 검색을 우선 진행(좌표 없이) — 검색이 위치 확정보다 우선
    // - denied/unsupported: 재요청하지 않고 좌표 없이 진행 (QA M-2)
    // - idle: (마운트 이펙트가 아직 시작되지 않은 예외적 타이밍) 이번 한 번만 직접 요청
    let currentLocation = location
    if (!currentLocation && status === 'idle') {
      currentLocation = await requestLocation()
    }

    try {
      const data = await askChat({
        message: query,
        lat: currentLocation?.lat,
        lng: currentLocation?.lng,
      })
      setAnswer(data.message)
      setSearchPlaces(data.places ?? [])
    } catch (err) {
      setError(err.message || 'AI 검색 중 문제가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="map-page">
      {/* 검색바와 카테고리 토글 칩을 같은 가로 라인에 배치 (2026-08-06 사용자 결정).
          칩의 상태/로직은 PetMap 내부에 있고, toggleSlot 포털로 "그릴 위치"만 이 줄로 옮긴다.
          좁은 화면에서는 flex-wrap으로 칩이 자연스럽게 아랫줄로 내려간다. */}
      <div className="map-page__search">
        <div className="map-page__search-bar">
          <SearchBar
            placeholder="AI에게 질문하기 (예: 근처 24시 동물병원 찾아줘)"
            aiEnabled={true}
            // 지도 메뉴는 AI 검색 전용 화면이므로 controlled로 토글을 항상 on 고정한다
            // (off로 되돌리는 상태 갱신을 하지 않음 — SearchBar M-3 controlled 패턴).
            onAiToggle={() => {}}
            onAiSearch={handleAiSearch}
          />
        </div>
        <div className="map-page__toggle-slot" ref={setToggleSlotNode} />
      </div>

      <div className="map-page__map-wrap">
        <PetMap
          size="full"
          places={displayedPlaces}
          currentLocation={location}
          onLocateClick={handleLocateClick}
          onMapMoved={handleMapMoved}
          fitBoundsKey={fitBoundsKey}
          toggleSlot={toggleSlotNode}
        />

        {researchCenter && (
          <button
            type="button"
            className="map-page__research-btn"
            onClick={handleResearchClick}
            disabled={researchLoading}
          >
            {researchLoading ? '재검색 중…' : '이 지역에서 재검색'}
          </button>
        )}

        {loading && (
          <div className="map-page__banner map-page__banner--loading">
            AI가 답변을 준비하고 있어요…
          </div>
        )}

        {!loading && error && (
          <div className="map-page__banner map-page__banner--error">{error}</div>
        )}

        {!loading && !error && answer && (
          <div className="map-page__answer-card">
            <button
              type="button"
              className="map-page__answer-close"
              onClick={() => setAnswer(null)}
              aria-label="답변 닫기"
            >
              ×
            </button>
            <p className="map-page__answer-text">{answer}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default MapPage
