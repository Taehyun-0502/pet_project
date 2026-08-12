// 광고 배너 API (광고배너_구현가이드.md 2절)

import { request } from '../common/apiClient'

/**
 * 지금 노출 가능한 광고 목록. 서버가 계약 기간·활성 여부를 이미 걸러서 준다.
 *
 * @param placement 노출 위치 태그. 넘기지 않으면 위치를 가리지 않고 전부 받는다
 *                  (위치가 확정되기 전이라 지금은 전부 받는 쪽을 쓴다)
 */
export function getAds(placement) {
  const query = placement ? `?placement=${encodeURIComponent(placement)}` : ''
  return request(`/api/ads${query}`)
}
