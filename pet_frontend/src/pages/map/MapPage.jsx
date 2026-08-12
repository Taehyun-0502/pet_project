// 지도 단독 메뉴 페이지 — 루트 CLAUDE.md "Phase: 지도 + AI 장소 추천" ①.
// 검색바가 곧 AI 챗봇 입력창이다(플로팅 버튼 없음). 제출하면 POST /api/ai-search를 호출해
// 답변 카드와 장소 마커(PetMap)를 함께 보여준다.
//
// 진입 시 초기 마커 노출(기획 원안): 검색 전에도 주변 장소가 보이도록, 마운트 시
// GET /api/places로 주변을 조회해 마커를 채운다. AI 검색 결과가 도착하면 마커를
// 검색 결과로 교체하고, 답변 시트를 닫으면 다시 주변 전체 마커로 복귀한다.
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
// 검색바·토글 배치(2026-08-06 확정, 모바일 퍼스트 리디자인으로 세부 변경): 카테고리
// 토글 칩의 상태·로직은 여전히 PetMap 내부에 있고(공통 구현 원칙 유지), toggleSlot
// prop으로 "그릴 위치"만 검색바 아래 DOM 노드로 포털한다 — 토글을 MapPage로 옮겨
// 다시 구현하지 않는다. 검색바는 SearchBar의 size="compact" 변형(공용 컴포넌트의
// 선택 prop, 기본 크기는 불변)을 써서 칩과 높이를 맞춘다.
//
// 모바일 퍼스트 리디자인(2026-08-06 확정, 최소 폭 360px 기준):
// ① 검색바는 지도 위 상단 전폭 오버레이(우측 줌 컨트롤 자리만 비움), 카테고리 토글
//    칩은 그 아래 별도 줄에서 가로 스크롤(줄바꿈 없음) — 두 줄 다 toggleSlot이 속한
//    같은 헤더 오버레이 안에 있다.
// ② AI 답변은 중앙 모달이 아니라 하단 바텀시트로 표시(PetMap의 마커 상세 시트와
//    시각적으로 통일). 닫기(X)를 누르면 기존과 동일하게 answer=null → 주변 마커로 복귀.
// ③ 컨트롤 터치 크기 확대는 PetMap 쪽(줌 36px+, 내 위치 44px 원형) — 이 파일은 관여 없음.
// ④ 주변 조회 0건 안내는 하단 토스트에서 "화면 중앙 팝업, 3초 후 자동 소멸, 배경 차단
//    없음"으로 교체(사용자 결정) — 초기 진입/내 위치 재조회/재검색 버튼 등
//    loadNearbyPlaces를 거치는 모든 경로에 공통 적용. AI 검색은 답변 시트 자체가
//    결과 유무를 보여주므로 대상이 아니다(loadNearbyPlaces를 거치지 않음).
//
// 현재 지도 위치 라벨 표시: PetMap의 onRegionChanged로 지도 중심의 행정구역명(예:
// "중구 명동")을 받아 SearchBar의 locationLabel로 전달, input placeholder 접두
// ("중구 명동 · AI에게 질문하기")로 보여준다(2026-08-06 사용자 결정 — 별도 칩에서
// placeholder 자리로 변경). 지도를 옮길 때마다(프로그래밍적 이동 포함) 최신화된다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PetMap from '../../components/PetMap'
import { CATEGORY_META } from '../../components/categoryMeta'
import SearchBar from '../../components/SearchBar'
import { distanceMeters, formatDistanceLabel } from '../../common/geo'
import { DEFAULT_CENTER } from '../../common/mapDefaults'
import { useGeolocation } from '../../hooks/useGeolocation'
import { askChat, getNearbyPlaces } from './mapApi'
import './MapPage.css'

// DEFAULT_CENTER(서울시청)는 common/mapDefaults.js 공용 상수로 승격됨 (QA F-5,
// 2026-08-12 산책 Phase — 이전엔 PetMap.jsx와 이 파일에 같은 값이 각각
// 하드코딩돼 있었다. WalkPage.jsx도 동일 상수를 쓴다).

// "이 지역에서 재검색" 버튼을 띄울 최소 이동 거리(대략). distanceMeters(하버사인)
// 근사로 충분하다는 판단 — 재검색 여부를 가리는 용도일 뿐 정밀한 지리 계산이
// 필요한 곳이 아니다. (QA N-2 — 거리 계산은 src/common/geo.js로 통합)
const RESEARCH_THRESHOLD_METERS = 500

// 목록 바텀시트 모션 타이밍 (2026-08-07 목업 승인값) — MapPage.css의 keyframes/transition
// 시간과 반드시 일치시킬 것. SHEET: 시트 슬라이드업/다운, CHIP: 지도 칩 페이드아웃 후
// 시트 안으로 이동하는 시점.
const SHEET_MOTION_MS = 340
const CHIP_FADE_MS = 260

function MapPage() {
  const { location, requestLocation } = useGeolocation()

  // nearbyPlaces: 진입 시(또는 "내 위치로 이동" 재시도 시) 조회한 "주변 전체" 마커
  // searchPlaces: AI 검색 응답으로 받은 마커 — 답변 시트가 떠 있는 동안만 노출
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

  // 검색바 아래 카테고리 토글 칩을 배치하기 위한 포털 대상 DOM 노드.
  // 토글의 상태/로직은 PetMap 내부에 그대로 있고, 그릴 위치만 이 노드로 옮긴다.
  const [toggleSlotNode, setToggleSlotNode] = useState(null)

  // 화면 중앙 팝업("검색 결과 없음" 등) — 짧게 보였다 자동으로 사라진다.
  // 2026-08-06 모바일 퍼스트 리디자인으로 하단 토스트 → 중앙 팝업(배경 차단 없음)으로 교체.
  const [emptyResultNotice, setEmptyResultNotice] = useState(null)
  const emptyResultTimerRef = useRef(null)

  const showEmptyResultNotice = useCallback((message) => {
    setEmptyResultNotice(message)
    if (emptyResultTimerRef.current) clearTimeout(emptyResultTimerRef.current)
    emptyResultTimerRef.current = setTimeout(() => {
      setEmptyResultNotice(null)
      emptyResultTimerRef.current = null
    }, 3000)
  }, [])

  // 언마운트 시 대기 중인 팝업 타이머 정리
  useEffect(() => {
    return () => {
      if (emptyResultTimerRef.current) clearTimeout(emptyResultTimerRef.current)
    }
  }, [])

  // 현재 보고 있는 지도 중심 — PetMap의 onCenterChanged가 이동 주체와 무관하게 항상
  // 최신으로 채운다. AI 검색의 기준 좌표로 사용 (2026-08-06 사용자 결정).
  const mapCenterRef = useRef(null)
  const handleCenterChanged = useCallback((center) => {
    mapCenterRef.current = center
  }, [])

  // 현재 지도 중심의 행정구역명(예: "중구 명동") — PetMap의 onRegionChanged가
  // 이동 주체와 무관하게(프로그래밍적 이동 포함) 최신화한다. SearchBar의
  // locationLabel로 전달되어 input placeholder 접두("중구 명동 · …")로 표시된다
  // (칩 표시안은 폐기 — 2026-08-06 사용자 결정, QA M-2로 주석 정합화).
  const [regionLabel, setRegionLabel] = useState(null)
  const handleRegionChanged = useCallback((label) => {
    setRegionLabel(label)
  }, [])

  // 응답 순서가 뒤바뀌어 오래된 주변 조회 결과가 최신 결과를 덮어쓰지 않도록 요청 ID로 판별
  const nearbyRequestIdRef = useRef(0)
  // 마지막으로 "주변 조회"를 실제로 수행한 중심 — 재검색 버튼의 거리 기준점
  const lastQueryCenterRef = useRef(null)

  // fit=true일 때만 이 조회 결과로 지도 범위를 다시 맞춘다(fitBoundsKey 증가).
  // 재검색(fit 생략 → false)은 마커만 갈아끼우고 현재 축척·중심을 그대로 둔다.
  // 결과가 0건이면 중앙 팝업으로 알린다 — 초기 진입/내 위치 재조회/재검색 버튼 등
  // 이 함수를 거치는 모든 경로에 공통 적용(단일 지점이라 호출부마다 중복 안 함).
  const loadNearbyPlaces = useCallback(async (lat, lng, { fit = false } = {}) => {
    const requestId = ++nearbyRequestIdRef.current
    lastQueryCenterRef.current = { lat, lng }
    setResearchCenter(null) // 방금 이 위치로 조회를 시작했으니 재검색 버튼은 일단 숨긴다
    try {
      const data = await getNearbyPlaces(lat, lng)
      if (nearbyRequestIdRef.current !== requestId) return // 중간에 새 요청이 시작됨 — 폐기
      const places = data.places ?? []
      setNearbyPlaces(places)
      if (fit) setFitBoundsKey((key) => key + 1)
      if (places.length === 0) {
        showEmptyResultNotice('이 지역에 표시할 장소가 없습니다.')
      }
    } catch (err) {
      if (nearbyRequestIdRef.current !== requestId) return
      // 초기 조회 실패를 조용히 무시하지 않고 기존 에러 배너를 재사용한다.
      // 단, 지도 자체(빈 마커 상태)는 계속 보여준다.
      setError(err.message || '주변 장소를 불러오지 못했습니다.')
    }
  }, [showEmptyResultNotice])

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
    // AI 답변 시트가 떠 있으면 닫고 주변 마커 모드로 전환한다.
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
      loadNearbyPlaces(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, { fit: true })
    }, 3000)

    requestLocation().then((loc) => {
      if (cancelled) return
      clearTimeout(timer)

      if (timedOut) {
        // 이미 기본 좌표로 초기 조회를 한 상태 — 위치가 뒤늦게 "허용"으로 확정된 경우에만
        // 그 좌표로 재조회하고 지도도 내 위치 기준으로 옮긴다(fit). loadNearbyPlaces
        // 내부의 requestId 가드가 두 응답 중 오래된 쪽을 자동으로 폐기한다.
        if (loc) loadNearbyPlaces(loc.lat, loc.lng, { fit: true })
        return
      }

      if (settled) return // 안전장치 — 이론상 도달하지 않음
      settled = true
      // 허용이면 내 위치 기준, 거부/미지원이면 서울시청 기준으로 초기 뷰를 잡는다
      // (2026-08-06 사용자 확정: "허용하지 않았을 때만 서울시청").
      const center = loc ?? DEFAULT_CENTER
      loadNearbyPlaces(center.lat, center.lng, { fit: true })
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

  // 답변 시트가 떠 있으면 검색 결과 마커를, 아니면 주변 전체 마커를 보여준다 —
  // 답변 시트를 닫아 answer가 null이 되면 자동으로 주변 마커로 복귀한다.
  const displayedPlaces = useMemo(
    () => (answer ? searchPlaces : nearbyPlaces),
    [answer, searchPlaces, nearbyPlaces],
  )

  const handleAiSearch = async (query) => {
    setLoading(true)
    setError(null)

    // 검색 기준 좌표 = 현재 보고 있는 지도 중심 (2026-08-06 사용자 결정 — 위치 권한
    // 좌표가 아니라 지도 화면 기준). PetMap의 onCenterChanged가 항상 최신 중심을
    // 채워주며, 지도(SDK)가 아직 준비 전인 예외적 타이밍에만 위치 권한 좌표로 폴백.
    const searchCenter = mapCenterRef.current ?? location

    try {
      const data = await askChat({
        message: query,
        lat: searchCenter?.lat,
        lng: searchCenter?.lng,
      })
      setAnswer(data.message)
      setSearchPlaces(data.places ?? [])
    } catch (err) {
      setError(err.message || 'AI 검색 중 문제가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // AI 답변 바텀시트 접근성(PetMap의 마커 상세 시트와 동일한 원칙 — 가벼운 버전):
  // 열릴 때 시트로 포커스 이동 + ESC로 닫기 + 배경 스크롤 잠금, 닫힐 때 이전
  // 포커스로 복귀. 이 시트는 닫기 버튼 하나뿐이라 Tab 트랩(순환)은 생략했다 —
  // 포커스 가능한 요소가 1개뿐이면 트랩이 사실상 아무 효과가 없다.
  const answerSheetRef = useRef(null)
  const answerPreviousFocusRef = useRef(null)

  useEffect(() => {
    if (!answer) return

    answerPreviousFocusRef.current = document.activeElement
    answerSheetRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setAnswer(null)
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      answerPreviousFocusRef.current?.focus?.()
    }
  }, [answer])

  const handleAnswerBackdropClick = (event) => {
    if (event.target === event.currentTarget) setAnswer(null)
  }

  // 장소 목록 바텀시트 (2026-08-07 사용자 요청): 지도 하단 "목록 보기" 버튼으로
  // 현재 지도에 표시 중인 장소(displayedPlaces — AI 검색 중이면 검색 결과, 아니면
  // 주변 조회 결과)를 리스트로 보여준다. 재검색/AI 검색으로 장소가 갈리면 열려 있는
  // 목록도 같이 갱신된다. 항목 클릭 동작(지도 이동·상세 연동)은 아직 미구현 —
  // "목록 표시까지"가 이번 범위(사용자 결정). 접근성은 AI 답변 시트와 동일한
  // 가벼운 버전(포커스 이동 + ESC + 스크롤 잠금 + 백드롭 클릭 닫기).
  const [listOpen, setListOpen] = useState(false)
  // 닫힘 요청 후 슬라이드다운 애니메이션이 재생되는 동안 true — 끝나면 언마운트
  const [listClosing, setListClosing] = useState(false)
  const listSheetRef = useRef(null)
  const listPreviousFocusRef = useRef(null)

  // 시트 열림/닫힘 모션 (2026-08-07 목업 승인): 열릴 때 하단 슬라이드업 + 배경 페이드인,
  // 닫힐 때 역재생. 즉시 언마운트하면 닫힘 애니메이션이 보이지 않으므로, 닫기는
  // listClosing을 켜서 애니메이션을 재생한 뒤 SHEET_MOTION_MS 후에 언마운트한다.
  const closeList = useCallback(() => {
    setListClosing(true)
  }, [])

  useEffect(() => {
    if (!listClosing) return
    const timer = setTimeout(() => {
      setListOpen(false)
      setListClosing(false)
    }, SHEET_MOTION_MS)
    return () => clearTimeout(timer)
  }, [listClosing])

  // 카테고리 토글 칩 이동 (2026-08-07 목업 승인): 목록이 열리면 지도 위 칩이 서서히
  // 사라진 뒤(CHIP_FADE_MS) 시트 안 슬롯으로 이동해 페이드인한다. 닫히기 시작하면
  // 즉시 지도 헤더로 복귀시키고, 헤더 슬롯의 opacity 전환이 페이드인으로 받아준다.
  // 칩 상태·로직은 여전히 PetMap 내부(공통 구현 원칙) — 그릴 위치만 옮긴다.
  // 주의: 시트 안 칩 토글은 지도 마커 노출만 제어하고 목록 항목은 필터링하지 않는다(미착수).
  const [chipsInSheet, setChipsInSheet] = useState(false)
  const [listToggleSlotNode, setListToggleSlotNode] = useState(null)

  useEffect(() => {
    if (listOpen && !listClosing) {
      const timer = setTimeout(() => setChipsInSheet(true), CHIP_FADE_MS)
      return () => clearTimeout(timer)
    }
    setChipsInSheet(false)
  }, [listOpen, listClosing])

  useEffect(() => {
    if (!listOpen) return

    listPreviousFocusRef.current = document.activeElement
    listSheetRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeList()
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      listPreviousFocusRef.current?.focus?.()
    }
  }, [listOpen, closeList])

  const handleListBackdropClick = (event) => {
    if (event.target === event.currentTarget) closeList()
  }

  return (
    <div className="map-page">
      <div className="map-page__map-wrap">
        {/* 지도 위 오버레이 헤더 — 검색바(상단, 전폭) + 카테고리 토글 칩(그 아래,
            가로 스크롤 한 줄). 우측은 PetMap의 줌 컨트롤(우상단)을 피해 여백을 둔다.
            칩의 상태/로직은 PetMap 내부에 있고, toggleSlot 포털로 "그릴 위치"만
            이 자리로 옮긴다(모바일 퍼스트 리디자인 — flex-wrap 대신 가로 스크롤). */}
        <div className="map-page__overlay-header">
          <div className="map-page__search-row">
            <SearchBar
              size="compact"
              placeholder="AI에게 질문하기 (예: 근처 24시 동물병원 찾아줘)"
              aiEnabled={true}
              // 지도 메뉴는 AI 검색 전용 화면이므로 controlled로 토글을 항상 on 고정한다
              // (off로 되돌리는 상태 갱신을 하지 않음 — SearchBar M-3 controlled 패턴).
              onAiToggle={() => {}}
              onAiSearch={handleAiSearch}
              locationLabel={regionLabel}
            />
          </div>
          <div
            className={
              'map-page__toggle-slot' +
              (listOpen && !listClosing ? ' map-page__toggle-slot--fading' : '')
            }
            ref={setToggleSlotNode}
          />
        </div>

        <PetMap
          size="full"
          places={displayedPlaces}
          currentLocation={location}
          onLocateClick={handleLocateClick}
          onMapMoved={handleMapMoved}
          onCenterChanged={handleCenterChanged}
          onRegionChanged={handleRegionChanged}
          fitBoundsKey={fitBoundsKey}
          // 칩 그릴 위치: 지도 칩 페이드아웃이 끝난 뒤(chipsInSheet)에만 시트 안 슬롯으로
          toggleSlot={chipsInSheet && listToggleSlotNode ? listToggleSlotNode : toggleSlotNode}
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

        {/* 지도 하단 중앙 "목록 보기" — 좌하단 카카오 로고·우하단 내 위치 버튼을 피해
            중앙 배치. 표시할 장소가 없으면 버튼도 숨긴다. */}
        {displayedPlaces.length > 0 && (
          <button
            type="button"
            className={
              'map-page__list-btn' +
              (listOpen && !listClosing ? ' map-page__list-btn--hidden' : '')
            }
            onClick={() => setListOpen(true)}
          >
            목록 보기 ({displayedPlaces.length})
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
          <div className="map-page__sheet-backdrop" onMouseDown={handleAnswerBackdropClick}>
            <div
              ref={answerSheetRef}
              className="map-page__sheet"
              role="dialog"
              aria-label="AI 답변"
              tabIndex={-1}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <span className="map-page__sheet-handle" aria-hidden="true" />
              <button
                type="button"
                className="map-page__sheet-close"
                onClick={() => setAnswer(null)}
                aria-label="답변 닫기"
              >
                ×
              </button>
              <p className="map-page__sheet-text">{answer}</p>
            </div>
          </div>
        )}

        {listOpen && (
          <div
            className={
              'map-page__sheet-backdrop map-page__sheet-backdrop--animated' +
              (listClosing ? ' map-page__sheet-backdrop--closing' : '')
            }
            onMouseDown={handleListBackdropClick}
          >
            <div
              ref={listSheetRef}
              className={
                'map-page__sheet map-page__sheet--list map-page__sheet--animated' +
                (listClosing ? ' map-page__sheet--closing' : '')
              }
              role="dialog"
              aria-label="이 지역 장소 목록"
              tabIndex={-1}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <span className="map-page__sheet-handle" aria-hidden="true" />
              {/* 헤더 한 줄: 제목 + 닫기 (마커 상세 시트의 배지·닫기 한 줄 배치와 동일 원칙) */}
              <div className="map-page__list-header">
                <strong className="map-page__list-title">
                  이 지역 장소 ({displayedPlaces.length})
                </strong>
                <button
                  type="button"
                  className="map-page__sheet-close map-page__sheet-close--inline"
                  onClick={closeList}
                  aria-label="목록 닫기"
                >
                  ×
                </button>
              </div>
              {/* 카테고리 토글 칩 슬롯 — 지도 칩이 페이드아웃된 뒤 이 자리로 이동해 페이드인 */}
              <div
                className={
                  'map-page__list-toggle-slot' +
                  (chipsInSheet ? ' map-page__list-toggle-slot--visible' : '')
                }
                ref={setListToggleSlotNode}
              />
              <ul className="map-page__place-list">
                {displayedPlaces.map((place, index) => {
                  const meta = CATEGORY_META[place.category]
                  const infoLine = [
                    place.phone,
                    location
                      ? `내 위치에서 약 ${formatDistanceLabel(
                          distanceMeters(location, { lat: place.lat, lng: place.lng }),
                        )}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <li key={`${place.name}-${place.lat}-${place.lng}-${index}`} className="map-page__place-item">
                      {meta && (
                        <span
                          className="map-page__place-dot"
                          style={{ background: meta.color }}
                          aria-hidden="true"
                        />
                      )}
                      <div className="map-page__place-body">
                        <span className="map-page__place-name">{place.name}</span>
                        {place.address && (
                          <span className="map-page__place-address">{place.address}</span>
                        )}
                        {infoLine && <span className="map-page__place-info">{infoLine}</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}

        {emptyResultNotice && (
          <div className="map-page__empty-result-popup" role="status" aria-live="polite">
            {emptyResultNotice}
          </div>
        )}
      </div>
    </div>
  )
}

export default MapPage
