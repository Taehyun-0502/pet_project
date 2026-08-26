/**
 * NearbyPlaces — "주변 장소" 섹션 공용 컴포넌트 (2026-08-13, NearbyHospitals에서 일반화).
 *
 * 진단 페이지처럼 "특정 카테고리 장소 목록이 필요한 화면"에 한 줄로 붙이는 용도:
 * 데이터 조회(GET /api/places, categories 제한) + 카테고리 제한 지도(PetMap
 * `categories` prop — 목록 밖 카테고리 마커·칩 비노출) + "목록 보기 (N)" 버튼 +
 * 장소 목록 바텀시트(PlaceListItem 공용 아이템)를 한 덩어리로 제공한다.
 * 카테고리별로 컴포넌트를 새로 만들지 않는다:
 *
 *   <NearbyPlaces categories={['HOSPITAL']} title="주변 동물병원" />  // 병원
 *   <NearbyPlaces categories={['CAFE']} title="주변 애견동반 카페" />  // 카페
 *   <NearbyPlaces categories={['HOTEL']} title="주변 애견동반 호텔" />  // 호텔
 *
 * 리스트는 인라인 나열이 아니라 지도 하단 중앙 "목록 보기 (N)" 버튼 → 바텀시트로
 * 노출한다 (2026-08-13 사용자 결정 — 지도 페이지의 목록 보기 UX와 통일. 시트
 * 슬라이드 모션·접근성도 동일 원칙: 포커스 이동/ESC/스크롤 잠금/백드롭 닫기).
 *
 * 위치: 마운트 시(또는 `deferred` 모드에서 버튼을 눌러 `revealed`가 된 시점)
 * `hooks/useInitialLocation`으로 1회 위치 권한을 요청하되, 3초 안에 확정되지
 * 않으면 DEFAULT_CENTER(서울시청)로 폴백해 먼저 조회한다. `lateCorrection:
 * false`로 늦게 허용된 위치로의 재조회는 하지 않는다(부가 섹션이라 한 번의
 * 조회로 충분 — MapPage/WalkPage의 race 패턴과 다른 부분은 이 옵션 하나뿐,
 * 2026-08-26 QA L-3 리팩토링으로 3곳 공용 훅으로 승격).
 *
 * 로그인: GET /api/places는 인증 필요. 진단 페이지는 공개 라우트라 비로그인
 * 진입이 가능하므로, 401이면 지도는 그대로 두고 리스트 자리에 로그인 안내만 띄운다.
 *
 * Props
 * - categories?: Array<'HOSPITAL'|'CAFE'|'HOTEL'> — 조회·표시할 카테고리. 기본 ['HOSPITAL'].
 * - title?: string — 섹션 제목(시트 헤더에도 사용). 기본 '주변 동물병원'.
 * - deferred?: boolean — true면 처음에는 "<title> 보기" 버튼만 렌더링하고, 버튼을
 *     눌렀을 때 지도·조회를 시작한다 (2026-08-13 사용자 결정 — 진단 페이지에서
 *     진단 후에만 버튼 노출 → 클릭 시 지도 노출 동선). 위치 권한 팝업과
 *     GET /api/places 호출도 클릭 시점까지 미뤄진다. 기본 false(즉시 노출).
 */

import { useEffect, useRef, useState } from 'react'
import BottomSheet from './BottomSheet'
import PetMap from './PetMap'
import PlaceListItem from './PlaceListItem'
import { CATEGORY_META } from './categoryMeta'
import { getNearbyPlaces } from '../pages/map/mapApi'
import { useInitialLocation } from '../hooks/useInitialLocation'
import './NearbyPlaces.css'

// 시트 열림/닫힘 모션 시간(ms) — BottomSheet의 enterMs/exitMs로 그대로 전달한다
// (NearbyPlaces.css의 애니메이션 지속시간과 일치 필수 — 지도 페이지 목록 시트와
// 같은 모션 값, 2026-08-07 목업 승인 — MapPage SHEET_MOTION_MS).
const SHEET_MOTION_MS = 340

function NearbyPlaces({ categories = ['HOSPITAL'], title = '주변 동물병원', deferred = false }) {
  const [places, setPlaces] = useState(null) // null = 로딩 중
  const [error, setError] = useState(null)
  const requestIdRef = useRef(0)

  // deferred 모드: 버튼을 누르기 전까지 지도·조회를 시작하지 않는다
  const [revealed, setRevealed] = useState(!deferred)

  // 안내 문구에 쓸 카테고리 한국어 라벨 (enum 값 노출 금지 — 기존 방침).
  // 여러 개면 "병원·카페"처럼 이어붙인다.
  const label =
    categories
      .map((category) => CATEGORY_META[category]?.label)
      .filter(Boolean)
      .join('·') || '장소'

  // categories 배열이 매 렌더 새 참조여도 이펙트가 재실행되지 않도록 문자열 키로 고정
  const categoriesKey = categories.join(',')

  // 위치 확정(즉시/기본 좌표 폴백)마다 그 좌표로 주변 장소를 조회한다. requestIdRef로
  // 응답 순서 역전(오래된 요청이 늦게 도착)을 방지 — categoriesKey가 바뀌어 훅이
  // race를 재시작하는 경우에도 이전 요청의 응답을 무시하게 해준다.
  const loadPlaces = (center) => {
    const requestId = ++requestIdRef.current
    getNearbyPlaces(center.lat, center.lng, categoriesKey.split(','))
      .then((data) => {
        if (requestIdRef.current !== requestId) return
        setPlaces(data.places ?? [])
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return
        setPlaces([])
        setError(
          err?.status === 401
            ? `로그인하면 주변 ${label} 정보를 볼 수 있어요.`
            : `주변 ${label} 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.`,
        )
      })
  }

  // 위치 권한 3초 race는 hooks/useInitialLocation 공용 훅으로 승격됨 (2026-08-26
  // QA L-3 리팩토링 — MapPage.jsx·WalkPage.jsx와 동일 훅 사용). `lateCorrection:
  // false`로 늦게 "허용"된 위치가 와도 재조회하지 않는다(부가 섹션이라 한 번의
  // 조회로 충분 — 기존 동작 그대로). `enabled: revealed`로 deferred 모드에서
  // 버튼을 누르기 전까지는 위치 요청·조회 모두 보류한다. `resetKey: categoriesKey`로
  // categories prop이 바뀌면(드문 경우) 기존처럼 위치 확정부터 다시 시작한다.
  const { location } = useInitialLocation({
    enabled: revealed,
    lateCorrection: false,
    resetKey: categoriesKey,
    onResolve: loadPlaces,
  })

  // 장소 목록 바텀시트 — 지도 페이지 목록 시트와 같은 열림/닫힘 상태 기계:
  // 닫기는 listClosing으로 닫힘 애니메이션을 재생한 뒤 SHEET_MOTION_MS 후 언마운트.
  // 백드롭/패널/접근성(포커스 이동·ESC·스크롤 잠금)은 BottomSheet가 담당한다
  // (2026-08-26 QA L-3 리팩토링 — 개별 useEffect 복붙을 승격).
  const [listOpen, setListOpen] = useState(false)
  const [listClosing, setListClosing] = useState(false)

  const closeList = () => setListClosing(true)

  useEffect(() => {
    if (!listClosing) return
    const timer = setTimeout(() => {
      setListOpen(false)
      setListClosing(false)
    }, SHEET_MOTION_MS)
    return () => clearTimeout(timer)
  }, [listClosing])

  // deferred 모드에서 아직 버튼을 누르기 전 — "<title> 보기" 버튼만 노출
  if (!revealed) {
    return (
      <section className="nearby-places" aria-label={title}>
        <button
          type="button"
          className="nearby-places__reveal-btn"
          onClick={() => setRevealed(true)}
        >
          {title} 보기
        </button>
      </section>
    )
  }

  return (
    <section className="nearby-places" aria-label={title}>
      <h2 className="nearby-places__title">{title}</h2>

      {/* 버튼을 지도 위에 겹치기 위한 기준 컨테이너. PetMap이 z-index:0 격리
          스태킹 컨텍스트라 형제 버튼(z-index:1)이 항상 그 위에 그려진다 (QA N-1 원칙) */}
      <div className="nearby-places__map-wrap">
        <PetMap
          places={places ?? []}
          categories={categoriesKey.split(',')}
          size="mini"
          currentLocation={location}
        />

        {places && places.length > 0 && (
          <button
            type="button"
            className="nearby-places__list-btn"
            onClick={() => setListOpen(true)}
          >
            목록 보기 ({places.length})
          </button>
        )}
      </div>

      {places === null && !error && (
        <p className="nearby-places__status">주변 {label} 검색 중…</p>
      )}
      {error && <p className="nearby-places__status">{error}</p>}
      {places && places.length === 0 && !error && (
        <p className="nearby-places__status">주변에 표시할 {label} 정보가 없습니다.</p>
      )}

      {listOpen && (
        <BottomSheet
          onClose={closeList}
          closing={listClosing}
          ariaLabel={`${title} 목록`}
          backdropClassName="nearby-places__sheet-backdrop"
          panelClassName="nearby-places__sheet"
          enterMs={SHEET_MOTION_MS}
          backdropAnimated
        >
          <span className="nearby-places__sheet-handle" aria-hidden="true" />
          <div className="nearby-places__sheet-header">
            <strong className="nearby-places__sheet-title">
              {title} ({places?.length ?? 0})
            </strong>
            <button
              type="button"
              className="nearby-places__sheet-close"
              onClick={closeList}
              aria-label="목록 닫기"
            >
              ×
            </button>
          </div>
          <ul className="place-list">
            {(places ?? []).map((place, index) => (
              <PlaceListItem
                key={`${place.name}-${place.lat}-${place.lng}-${index}`}
                place={place}
                currentLocation={location}
              />
            ))}
          </ul>
        </BottomSheet>
      )}
    </section>
  )
}

export default NearbyPlaces
