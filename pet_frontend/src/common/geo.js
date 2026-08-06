// 공용 지리 계산 유틸 — QA N-2(2026-08-06): MapPage.jsx의 하버사인 거리 계산과
// PetMap.jsx의 등장방형 근사(임계 판정)가 각자 따로 있던 것을 이 파일 하나로 통합한다.
// 다른 화면에서도 두 좌표 사이 거리가 필요하면 이 함수를 재사용한다.

/**
 * 두 좌표({lat, lng}) 사이의 거리를 미터 단위로 반환한다 (하버사인 공식).
 * 지구를 완전한 구로 가정한 근사치이므로, 임계값 판정(예: "500m 이상 이동했는가")
 * 용도로는 충분하지만 정밀 측지 계산이 필요한 곳에는 적합하지 않다.
 *
 * @param {{lat: number, lng: number}} a
 * @param {{lat: number, lng: number}} b
 * @returns {number} 두 좌표 사이 거리(미터)
 */
export function distanceMeters(a, b) {
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
