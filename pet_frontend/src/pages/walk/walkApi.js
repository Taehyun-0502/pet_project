// 산책 페이지 API 호출 함수 모음 — pages/map/mapApi.js 패턴 준용.
// 루트 CLAUDE.md "Phase: 산책 — 아스팔트 온도 안내 + GPS 산책 트래킹" 확정 스키마 기준.
// 백엔드(backend-agent)와 병렬 개발 중이라 이 파일 작성 시점엔 API가 아직 없을 수
// 있다 — 스키마는 기획 확정본을 그대로 따른다.

import { request } from '../../common/apiClient'

// 성공 시 { airTemp, humidity, windSpeed, solar, asphaltTemp, riskLevel, baseTime }
// riskLevel은 서버 enum(SAFE|CAUTION|DANGER|SEVERE) 그대로 온다 — 화면에는 절대
// enum 값 그대로 노출하지 않고, 호출부(WalkPage)가 한국어 라벨·색으로만 표시한다
// (루트 CLAUDE.md "UI에 엔티티 속성명·개발 용어 노출 금지" 원칙).
export function getWalkWeather(lat, lng) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  return request(`/api/walk/weather?${params.toString()}`)
}

// body: { petId?, startedAt, endedAt, durationSeconds, distanceMeters,
//         path: [{ lat, lng }], airTemp?, asphaltTemp? }
// petId는 "강아지별 시작"(2026-08-12 사용자 요청, WalkPage.jsx)으로 이제 사용자가
// 리스트에서 고른 실제 강아지 id를 채워 보낸다 — 백엔드는 JWT 연동 전이라 아직
// 소유권 검증은 하지 않지만(루트 CLAUDE.md "실연동 시 M-2"), 필드 자체는 nullable
// 스키마 그대로 실값을 담아 전달한다. 값이 없으면(이론상 발생하지 않음)
// JSON.stringify가 undefined 키를 생략해 기존 nullable 처리와 호환된다.
export function saveWalkRecord(payload) {
  return request('/api/walk/records', {
    method: 'POST',
    body: payload,
  })
}
