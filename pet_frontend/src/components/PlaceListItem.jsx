/**
 * PlaceListItem — 장소 리스트 아이템 공용 컴포넌트 (2026-08-13).
 *
 * 지도 목록 시트(MapPage)·AI 검색 결과(AiSearchPage)·주변 장소 섹션(NearbyPlaces)
 * 3곳에 같은 마크업이 복붙돼 있던 것을 이 컴포넌트 하나로 통합한다 — 리스트
 * 모양을 바꿀 일이 생기면 여기 한 곳만 고치면 된다. 시각 언어는 지도 목록
 * 시트의 기존 아이템 그대로: 카테고리 색 점 · 이름 · 주소 · 부가 정보 한 줄.
 *
 * Props
 * - place: { name, category, lat, lng, address?, phone?, ... } — places[] 스키마 항목
 * - currentLocation?: { lat, lng } | null — 주어지면 부가 정보 줄에 전화번호와
 *     함께 "내 위치에서 약 1.2km" 거리를 표시한다 (없으면 전화번호만).
 *
 * <ul className="place-list"> 안에서 사용한다 (스타일: PlaceList.css).
 */
import { CATEGORY_META } from './categoryMeta'
import { distanceMeters, formatDistanceLabel } from '../common/geo'
import './PlaceList.css'

function PlaceListItem({ place, currentLocation = null }) {
  const meta = CATEGORY_META[place.category]

  const info = [
    place.phone,
    currentLocation
      ? `내 위치에서 약 ${formatDistanceLabel(
          distanceMeters(currentLocation, { lat: place.lat, lng: place.lng }),
        )}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="place-list__item">
      {meta && (
        <span
          className="place-list__dot"
          style={{ background: meta.color }}
          aria-hidden="true"
        />
      )}
      <div className="place-list__body">
        <span className="place-list__name">{place.name}</span>
        {place.address && <span className="place-list__address">{place.address}</span>}
        {info && <span className="place-list__info">{info}</span>}
      </div>
    </li>
  )
}

export default PlaceListItem
